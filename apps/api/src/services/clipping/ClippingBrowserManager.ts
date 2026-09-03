/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
// Scoped to this file only (not the whole backend's tsconfig lib) so `document`/`Element`
// type-check inside the page.evaluate() callback below, which runs in the browser, not Node —
// without pulling ambient DOM globals into files like HttpClippingProvider.ts that use Node's
// own `fetch`/`Response` and would otherwise collide with lib.dom's versions of the same names.
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { ClippingAccount } from "@prisma/client";
import { ClippingApiError } from "./ClippingService.js";

export interface ClippingIdentity {
  email: string | null;
  displayName: string | null;
  // The account's profile photo, straight off CLIPPING's own sidebar avatar — null when the
  // account has none set (CLIPPING renders its own fallback initial in that case, same as this
  // app does), never a placeholder URL, so callers can tell "no photo" from "not scraped yet".
  avatarUrl: string | null;
}

export interface ClippingLinkedAccount {
  // CLIPPING's own internal ID for this linked social account — the value SubmitClipInput's
  // `accountId` needs, previously copy-pasted by hand from CLIPPING's dashboard.
  id: string;
  username: string;
  instagramUserId: string | null;
  platform: string;
}

const CLIPPING_DOMAIN = "clipping.net";
// Same pattern the browser extension (tools/clipping-cookie-sync-extension/background.js)
// uses to pick out Supabase's SSR auth cookie among whatever else clipping.net sets —
// possibly chunked across numbered parts (sb-<project-ref>-auth-token.0, .1, ...).
const AUTH_COOKIE_PATTERN = /^sb-.*-auth-token(\.\d+)?$/;

const SESSIONS_DIR = path.resolve(process.cwd(), ".clipping-sessions");

// Same trick the extension's background.js uses client-side (decodeIdentityFromCookieHeader):
// the CLIPPING login's email lives in the Supabase access token's JWT payload, readable
// without any secret or network call since a JWT payload is just base64, not encrypted.
// The cookie's raw value is usually NOT the JWT itself — Supabase's SSR cookie shape wraps
// the whole session object (access_token + refresh_token + user, as JSON) behind a `base64-`
// prefix, so the outer value has no dots to match a JWT pattern against. Unwrap that prefix
// first (mirroring the extension's atob step, via Buffer here) to get the JSON text the JWT
// actually lives inside, then scan both the unwrapped text and the raw values — some Supabase
// versions/cookies aren't wrapped at all, so the JWT can also show up unwrapped.
function decodeEmailFromCookies(cookies: { name: string; value: string }[]): string | null {
  const jwtPattern = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

  const unwrapped = cookies
    .map((c) => {
      let value = c.value;
      try {
        value = decodeURIComponent(value);
      } catch {
        // not URL-encoded — use as-is
      }
      if (!value.startsWith("base64-")) return "";
      try {
        return Buffer.from(value.slice("base64-".length), "base64").toString("utf-8");
      } catch {
        return "";
      }
    })
    .join(" ");

  const raw = cookies.map((c) => c.value).join(" ");
  const candidates = [...(raw.match(jwtPattern) ?? []), ...(unwrapped.match(jwtPattern) ?? [])];

  for (const token of candidates) {
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf-8"));
      if (payload?.sub && typeof payload.email === "string") return payload.email;
    } catch {
      // not a decodable/relevant JWT — try the next candidate
    }
  }
  return null;
}

// CLIPPING's Next.js App Router pages (dashboard/accounts, dashboard/campaigns/*) have no
// separate JSON API for their data — confirmed by watching every response while loading them.
// The real data (linked accounts' internal `_id`s, a campaign's real startDate/days, etc.) is
// instead embedded directly in the page's SSR payload, inside a React Server Components
// stream: `self.__next_f.push([1, "<escaped JS string>"])`. That escaped string is plain
// JS-string escaping, so wrapping it in quotes and JSON.parse-ing it decodes it back to text.
// From there, this walks forward from a `"<key>":<open>` marker counting matching
// open/close delimiters (respecting string literals, so one inside e.g. a username can't end
// the object/array early) to find exactly where that value ends — which is then its own valid
// JSON substring. Shared by extractLinkedAccountsFromHtml (arrays) and extractCampaignFromHtml
// (objects) below — same trick, different delimiter pair.
function extractBalancedJsonValue(text: string, marker: string, open: string, close: string): string | null {
  const markerStart = text.indexOf(marker);
  if (markerStart === -1) return null;

  let i = markerStart + marker.length - 1; // position of the opening delimiter
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === "\\") {
      escapeNext = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  return text.slice(markerStart + marker.length - 1, i);
}

function findRscPayloads(html: string, mustInclude: string): string[] {
  const pushes = html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g);
  const payloads: string[] = [];
  for (const [, escaped] of pushes) {
    if (!escaped.includes(mustInclude)) continue;
    try {
      payloads.push(JSON.parse(`"${escaped}"`));
    } catch {
      // not decodable — skip
    }
  }
  return payloads;
}

function extractLinkedAccountsFromHtml(html: string): ClippingLinkedAccount[] | null {
  for (const unescaped of findRscPayloads(html, "initialData")) {
    const arrayText = extractBalancedJsonValue(unescaped, '"accounts":[', "[", "]");
    if (!arrayText) continue;
    try {
      const raw = JSON.parse(arrayText) as unknown[];
      return raw
        .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
        .map((r) => ({
          id: String(r._id ?? ""),
          username: String(r.username ?? ""),
          instagramUserId: typeof r.instagramUserId === "string" ? r.instagramUserId : null,
          platform: String(r.platform ?? ""),
        }))
        .filter((a) => a.id && a.username);
    } catch {
      continue;
    }
  }
  return null;
}

export interface ClippingCampaignInfo {
  startDate: string;
  /** Cycle length in days — CLIPPING has no separate "end date" field, the cycle end is
   * derived as startDate + days. */
  days: number;
  /** The real per-clip view floor CLIPPING enforces before a bounty counts, read straight
   * from the campaign's own data (confirmed 100,000 on the "Kick Clipping" campaign — NOT
   * the 1,000 figure the payout calc guessed at before this existed). */
  minViews: number;
  /** The cutoff CLIPPING itself uses to decide whether a clip counts toward the CURRENT open
   * cycle — a clip whose video was posted before this shows "NOT TRACKING" on CLIPPING's own
   * clips list and doesn't count toward payout anymore. null when unavailable (e.g. this came
   * from the dead HTML-scrape fallback below, which never had this field). */
  videoStartDate: string | null;
  /** The campaign's full, live bounty tag list — every creator CLIPPING actually recognizes for
   * this campaign, with its real per-100k rate and enabled/disabled state. This is what
   * BountyMatchingService and the Link-Reel flow check a detected creator name against; a name
   * this app detected locally (OCR'd off a watermark, a folder name, etc.) that ISN'T in here
   * is exactly what "isn't in CLIPPING's bounty list" means. null when unavailable (the dead
   * HTML-scrape fallback never had this either).
   */
  bounties: { name: string; rate: string | null; active: boolean }[] | null;
}

// SUPERSEDED — same situation as extractClipperStatsFromHtml above: CLIPPING stopped embedding
// startDate/days/minViews in the campaign page's SSR payload at some point (confirmed by hand:
// none of those keys appear in the page's HTML anymore for any account). See
// fetchLiveCampaignInfo, which reads the real JSON API CLIPPING's own page now calls instead.
// Left only as a last-resort fallback.
function extractCampaignFromHtml(html: string): ClippingCampaignInfo | null {
  for (const unescaped of findRscPayloads(html, "campaign")) {
    const objectText = extractBalancedJsonValue(unescaped, '"campaign":{', "{", "}");
    if (!objectText) continue;
    try {
      const raw = JSON.parse(objectText) as Record<string, unknown>;
      if (typeof raw.startDate !== "string" || typeof raw.days !== "number") continue;
      return {
        startDate: raw.startDate,
        days: raw.days,
        minViews: typeof raw.minViews === "number" ? raw.minViews : 0,
        videoStartDate: null,
        bounties: null,
      };
    } catch {
      continue;
    }
  }
  return null;
}

// The campaign's OWN configured payout method (confirmed by hand: "usdt" for Kick Clipping) —
// authoritative, unlike guessing from a clipper's own paid history or which of several saved
// addresses they happen to have filled in. Lives in a different (per-membership) object than
// extractCampaignFromHtml's startDate/days/minViews one, so this is a plain regex against the
// raw RSC text rather than balanced-bracket extraction — doesn't need to know that object's
// exact shape, just that a `"paymentMethod":"<value>"` string sits somewhere in the payload.
function extractCampaignPaymentMethodFromHtml(html: string): string | null {
  for (const unescaped of findRscPayloads(html, "paymentMethod")) {
    const match = unescaped.match(/"paymentMethod":"([a-zA-Z]+)"/);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

export interface ClipperBountyBreakdownEntry {
  bounty: string;
  views: number;
  rate: number;
  payout: number;
  minViewsRequired: number;
  minViewsReached: boolean;
}

export interface ClippingClipperStats {
  totalViews: number;
  /** CLIPPING's own authoritative payout figure for this login — matches what shows on
   * clipping.net exactly, unlike this app's local view*rate estimate (which doesn't replicate
   * CLIPPING's per-bounty-aggregate 100k-view floor). */
  totalPayout: number;
  bountyBreakdown: ClipperBountyBreakdownEntry[];
}

// One entry from CLIPPING's real payment history (GET /api/clipper/earnings) — a finalized
// payment cycle, either already paid (paidAt set) or still pending (paidAt null).
export interface ClippingEarningsEntry {
  cycleId: string;
  campaignId: string;
  campaignName: string;
  cycleLabel: string | null;
  bountyTag: string | null;
  amount: number;
  paidAt: string | null;
  finalizedAt: string | null;
  // When CLIPPING actually computed this cycle — set even for a still-pending cycle (paidAt and
  // finalizedAt both null until it's closed out), so this is the one date field guaranteed to
  // have something to show for a "Pending" row, not just paid/finalized ones.
  exportedAt: string | null;
  totalViews: number | null;
  totalClips: number | null;
  // Which saved payment method this specific cycle was actually paid out through — CLIPPING
  // records this per-cycle (not just "whatever's currently saved"), since the account's saved
  // address/email can change between when a cycle finalizes and later. "usdt" | "usdc" |
  // "paypal" | null (unset for a not-yet-paid cycle).
  paymentMethod: string | null;
  paymentAddress: string | null;
}

export interface ClippingEarnings {
  lifetimeTotal: number;
  pendingTotal: number;
  history: ClippingEarningsEntry[];
}

// Every payout destination a clipper has ever saved — CLIPPING lets more than one be filled in
// at once, but only one is actually used for any given payout (see ClippingEarningsEntry's own
// paymentMethod/paymentAddress, which record which one a specific cycle actually went through).
export interface ClippingPaymentSettings {
  paypalEmail: { email: string; firstName: string | null; lastName: string | null } | null;
  usdtAddress: string | null;
  usdcAddress: string | null;
}

// Lives in the Payments page's own SSR payload (confirmed by hand — NOT part of the
// /api/clipper/earnings JSON API's response, which only has totals/history), so this needs the
// same RSC-scrape approach as campaign/account data, not a plain fetch.
function extractPaymentSettingsFromHtml(html: string): ClippingPaymentSettings | null {
  for (const unescaped of findRscPayloads(html, "paymentSettings")) {
    const objectText = extractBalancedJsonValue(unescaped, '"paymentSettings":{', "{", "}");
    if (!objectText) continue;
    try {
      const raw = JSON.parse(objectText) as Record<string, unknown>;
      const paypal = raw.paypalEmail as Record<string, unknown> | undefined;
      return {
        paypalEmail:
          paypal && typeof paypal.email === "string"
            ? {
                email: paypal.email,
                firstName: typeof paypal.firstName === "string" ? paypal.firstName : null,
                lastName: typeof paypal.lastName === "string" ? paypal.lastName : null,
              }
            : null,
        usdtAddress: typeof raw.usdtAddress === "string" ? raw.usdtAddress : null,
        usdcAddress: typeof raw.usdcAddress === "string" ? raw.usdcAddress : null,
      };
    } catch {
      continue;
    }
  }
  return null;
}

// SUPERSEDED — CLIPPING stopped embedding clipperStats in the campaign page's SSR payload at
// some point (confirmed by hand: the field is now always literally `null` there for every
// account). The real, still-accruing "current cycle" figure moved to a dedicated JSON API — see
// fetchLiveClipperStats below — which this app now uses instead. Left here only as a fallback in
// case a not-yet-migrated response shape ever ships it embedded again; safe to delete once
// that's confirmed never to happen.
function extractClipperStatsFromHtml(html: string): ClippingClipperStats | null {
  for (const unescaped of findRscPayloads(html, "clipperStats")) {
    const objectText = extractBalancedJsonValue(unescaped, '"clipperStats":{', "{", "}");
    if (!objectText) continue;
    try {
      const raw = JSON.parse(objectText) as Record<string, unknown>;
      const payout = raw.payout as Record<string, unknown> | undefined;
      if (!payout || typeof payout.totalBountyPayout !== "number") continue;
      const rawBreakdown = Array.isArray(payout.bountyBreakdown) ? payout.bountyBreakdown : [];
      return {
        totalViews: typeof raw.totalViews === "number" ? raw.totalViews : 0,
        totalPayout: payout.totalBountyPayout,
        bountyBreakdown: rawBreakdown
          .filter((b): b is Record<string, unknown> => typeof b === "object" && b !== null)
          .map((b) => ({
            bounty: String(b.bounty ?? ""),
            views: typeof b.views === "number" ? b.views : 0,
            rate: typeof b.rate === "number" ? b.rate : 0,
            payout: typeof b.payout === "number" ? b.payout : 0,
            minViewsRequired: typeof b.minViewsRequired === "number" ? b.minViewsRequired : 0,
            minViewsReached: Boolean(b.minViewsReached),
          }))
          .filter((b) => b.bounty),
      };
    } catch {
      continue;
    }
  }
  return null;
}

// Adapted from the extension's content.js scrapeAccountIdentity(): the signed-in account's
// real name + email are rendered directly into the dashboard page's own HTML (the sidebar
// account-switcher trigger — an avatar wrapped by two <p> tags, name then email), not exposed
// via any API response. Scraping the DOM is more reliable than decoding a name out of the
// session cookie, since it's exactly what a human reads to tell CLIPPING accounts apart — and
// unlike email, the JWT payload doesn't carry a display name claim at all. Checks for
// `[data-slot="avatar"]` (the wrapper span, always present) rather than `avatar-fallback`
// specifically — that only renders when the account has no profile photo, so an account WITH
// one (rendering `avatar-image` instead) was being silently skipped by the original check.
async function scrapeIdentityFromPage(
  page: Page
): Promise<{ email: string | null; displayName: string | null; avatarUrl: string | null } | null> {
  return page
    .evaluate(() => {
      const triggers = document.querySelectorAll('[data-slot="dropdown-menu-trigger"]');
      for (const trigger of triggers) {
        const avatar = trigger.querySelector('[data-slot="avatar"]');
        if (!avatar) continue;
        const paragraphs = trigger.querySelectorAll("p");
        if (paragraphs.length < 2) continue;
        const email = paragraphs[1].textContent?.trim();
        if (!email || !email.includes("@")) continue;
        // Only present when there IS a real photo — an account with none renders
        // `avatar-fallback` (the initial) instead of an `<img>` at all.
        const img = avatar.querySelector<HTMLImageElement>('[data-slot="avatar-image"]');
        return { displayName: paragraphs[0].textContent?.trim() || null, email, avatarUrl: img?.src || null };
      }
      return null;
    })
    .catch(() => null);
}

function storageStateAbsolutePath(account: Pick<ClippingAccount, "storageStatePath">): string {
  return path.resolve(SESSIONS_DIR, account.storageStatePath);
}

/**
 * Holds one persistent, isolated Playwright browser context per CLIPPING account — the
 * server-side replacement for "a browser extension copies one global cookie into env vars".
 * Each context's cookies/localStorage are persisted to disk (storageState) so a login
 * survives process restarts; there is deliberately no auto-login here, only a one-time
 * headed loginHeaded() a human drives by hand (see scripts/clipping-login.ts) and a
 * refreshSession() that lets Supabase's own client-side code refresh a stale token, mirroring
 * refreshClippingSession() in the extension's background.js.
 */
class ClippingBrowserManager {
  private browserPromise: Promise<Browser> | null = null;
  private contexts = new Map<string, BrowserContext>();

  /** Cheap check (no launch) for whether `npx playwright install chromium` has been run on
   * this machine — just confirms the expected binary is on disk. */
  isChromiumInstalled(): boolean {
    try {
      return fs.existsSync(chromium.executablePath());
    } catch {
      return false;
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = chromium
        .launch({ headless: true })
        .then((browser) => {
          // Self-heal instead of silently going dead: if this browser process ever
          // disappears (crashes, or something outside this app kills it — e.g. a stray
          // `pkill chromium`), clear the cached promise and cached contexts so the next
          // getBrowser()/getContext() call relaunches fresh rather than reusing a dead
          // reference forever until the whole API process restarts.
          browser.on("disconnected", () => {
            this.browserPromise = null;
            this.contexts.clear();
          });
          return browser;
        })
        .catch((error) => {
          this.browserPromise = null;
          throw new ClippingApiError(
            `Failed to launch Playwright's Chromium — has \`npx playwright install chromium\` been run on this machine? (${
              error instanceof Error ? error.message : String(error)
            })`,
            "auth"
          );
        });
    }
    return this.browserPromise;
  }

  private async getContext(account: Pick<ClippingAccount, "id" | "storageStatePath">): Promise<BrowserContext> {
    const cached = this.contexts.get(account.id);
    if (cached) return cached;

    const browser = await this.getBrowser();
    const statePath = storageStateAbsolutePath(account);
    const hasState = fs.existsSync(statePath);

    const context = await browser.newContext(hasState ? { storageState: statePath } : {});
    this.contexts.set(account.id, context);
    return context;
  }

  // Confirmed by hand: navigating the SHARED persistent context to a real CLIPPING page
  // (campaign page, /dashboard, /dashboard/accounts) can trigger something on CLIPPING's end
  // that silently signs the session out client-side, in-memory, for the rest of this
  // process's life — even though the storageState saved to disk from BEFORE that navigation
  // stays completely valid. Every method that navigates the shared context for a scrape (not
  // getSessionCookie itself, which never navigates) calls this right after, so a poisoned
  // in-memory context gets dropped instead of silently breaking every later call (including
  // unrelated ones like plain clip-fetching) for the rest of the process's life. The next
  // getContext() call for this account then reloads fresh from the still-good disk file.
  private async evictIfSessionDied(account: Pick<ClippingAccount, "id" | "storageStatePath">): Promise<void> {
    const context = this.contexts.get(account.id);
    if (!context) return;
    const cookies = await context.cookies(`https://${CLIPPING_DOMAIN}`).catch(() => []);
    if (cookies.some((c) => AUTH_COOKIE_PATTERN.test(c.name))) return; // still logged in — nothing to do
    await context.close().catch(() => {});
    this.contexts.delete(account.id);
  }

  // hasLiveCookie's real-request result, briefly cached — a cookie file can keep looking
  // "present" locally long after CLIPPING itself has stopped honoring it (logged out from
  // inside an opened window, session revoked server-side, etc.), so the status dot needs an
  // actual authenticated request to tell green from red correctly, not just cookie presence.
  // Cached rather than done on every poll (the rail/Settings list can poll every few seconds
  // for several accounts at once) — 20s keeps it responsive to a real logout without hammering
  // CLIPPING on every tick.
  private liveCheckCache = new Map<string, { ok: boolean; checkedAt: number }>();
  private static readonly LIVE_CHECK_TTL_MS = 20_000;

  /** Is this account ACTUALLY still signed in, as far as CLIPPING's own server is concerned —
   * not just "does a cookie file happen to still have a token in it". A locally-present cookie
   * that CLIPPING no longer honors (revoked, logged out from an opened window, etc.) now
   * correctly reads as signed-out here, which a pure cookie-presence check couldn't tell. */
  async hasLiveCookie(account: Pick<ClippingAccount, "id" | "storageStatePath">): Promise<boolean> {
    const cached = this.liveCheckCache.get(account.id);
    if (cached && Date.now() - cached.checkedAt < ClippingBrowserManager.LIVE_CHECK_TTL_MS) return cached.ok;

    let cookie: string;
    try {
      const context = await this.getContext(account);
      const cookies = await context.cookies(`https://${CLIPPING_DOMAIN}`);
      if (!cookies.some((c) => AUTH_COOKIE_PATTERN.test(c.name))) {
        this.liveCheckCache.set(account.id, { ok: false, checkedAt: Date.now() });
        return false;
      }
      cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    } catch {
      this.liveCheckCache.set(account.id, { ok: false, checkedAt: Date.now() });
      return false;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6_000);
      const response = await fetch(`https://${CLIPPING_DOMAIN}/api/clipper/earnings`, {
        headers: { Cookie: cookie },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
      // 401/403 (rejected outright) means definitively signed out — anything else (including a
      // network hiccup or an unexpected non-auth error) falls back to the last known state
      // rather than flashing red on a transient blip.
      if (response.status === 401 || response.status === 403) {
        this.liveCheckCache.set(account.id, { ok: false, checkedAt: Date.now() });
        return false;
      }
      const ok = response.ok;
      this.liveCheckCache.set(account.id, { ok, checkedAt: Date.now() });
      return ok;
    } catch {
      // Couldn't reach CLIPPING at all — don't let a network blip flip a genuinely-live account
      // to red; just keep whatever it last confirmed (defaults to true — cookie-present — the
      // very first time, matching the old behavior when nothing's been checked yet).
      return cached?.ok ?? true;
    }
  }

  // Supabase's access token backing this cookie is short-lived (~50min, per CLIPPING's own
  // behavior) — refreshed reactively today (HttpClippingProvider retries once on a 401/403 via
  // refreshSession), but that still means the FIRST request after the token goes stale always
  // fails once. Proactively refreshing a cookie that's gone unrefreshed for a while avoids that
  // — checked opportunistically on every getSessionCookie() call (i.e. every real CLIPPING
  // request), so nothing extra needs to poll in the background. Kept well under the ~50min
  // expiry for safety margin against clock drift/network latency.
  private lastRefreshedAt = new Map<string, number>();
  private static readonly PROACTIVE_REFRESH_INTERVAL_MS = 40 * 60 * 1000;

  /** Reads the account's current Supabase auth cookie(s) and serializes them the same way
   * HttpClippingProvider has always sent them: a single `Cookie:` header value. Proactively
   * refreshes first if this account's cookie hasn't been refreshed in a while (see
   * lastRefreshedAt) — best-effort: a failed proactive refresh doesn't block returning
   * whatever cookie is currently on hand, since the caller's own request may still succeed
   * (or fail with a clearer error) on its own. */
  async getSessionCookie(account: Pick<ClippingAccount, "id" | "storageStatePath">): Promise<string> {
    const lastRefreshed = this.lastRefreshedAt.get(account.id) ?? 0;
    if (Date.now() - lastRefreshed > ClippingBrowserManager.PROACTIVE_REFRESH_INTERVAL_MS) {
      await this.refreshSession(account).catch(() => {});
    }

    const context = await this.getContext(account);
    const cookies = await context.cookies(`https://${CLIPPING_DOMAIN}`);
    const authCookies = cookies
      .filter((c) => AUTH_COOKIE_PATTERN.test(c.name))
      .sort((a, b) => {
        const partOf = (name: string) => Number(name.split(".").pop()) || 0;
        return partOf(a.name) - partOf(b.name);
      });

    if (authCookies.length === 0) {
      throw new ClippingApiError(
        "No CLIPPING session found for this account — sign in on the Settings page.",
        "auth"
      );
    }

    return authCookies.map((c) => `${c.name}=${c.value}`).join("; ");
  }

  /** Reads the account's email + display name out of its already-saved session, without
   * opening a headed window or requiring a fresh login — useful for backfilling an account
   * connected before this existed, or just refreshing a stale/never-captured identity. Loads
   * a real (headless) page to scrape the name off CLIPPING's own sidebar, same as loginHeaded
   * does; falls back to decoding email from the session cookie if the page scrape comes up
   * empty (e.g. selectors changed). Fields are independently null if nothing was found. */
  async getDecodedIdentity(account: Pick<ClippingAccount, "id" | "storageStatePath">): Promise<ClippingIdentity> {
    const context = await this.getContext(account);
    const page = await context.newPage();
    let scraped: { email: string | null; displayName: string | null; avatarUrl: string | null } | null = null;
    try {
      // /dashboard, not the bare domain — that's CLIPPING's public marketing homepage and
      // never renders the account switcher regardless of login state.
      await page.goto(`https://${CLIPPING_DOMAIN}/dashboard`, { waitUntil: "networkidle", timeout: 30_000 });
      scraped = await scrapeIdentityFromPage(page);
    } catch {
      // session may be stale/logged-out — fall through to the cookie-based fallback below
    } finally {
      await page.close();
    }

    const cookieEmail = decodeEmailFromCookies(await context.cookies(`https://${CLIPPING_DOMAIN}`));
    await this.evictIfSessionDied(account);
    return { email: scraped?.email ?? cookieEmail, displayName: scraped?.displayName ?? null, avatarUrl: scraped?.avatarUrl ?? null };
  }

  /** Every social account (Instagram or otherwise) linked to this CLIPPING login, with
   * CLIPPING's real internal ID for each — the value that previously had to be copy-pasted by
   * hand into an Instagram account's "CLIPPING account ID" field. Read straight from
   * CLIPPING's own accounts page, not typed in. */
  async getLinkedAccounts(account: Pick<ClippingAccount, "id" | "storageStatePath">): Promise<ClippingLinkedAccount[]> {
    const context = await this.getContext(account);
    const page = await context.newPage();
    try {
      await page.goto(`https://${CLIPPING_DOMAIN}/dashboard/accounts`, { waitUntil: "networkidle", timeout: 30_000 });
      const html = await page.content();
      return extractLinkedAccountsFromHtml(html) ?? [];
    } catch (error) {
      throw new ClippingApiError(
        `Failed to read linked accounts from CLIPPING: ${error instanceof Error ? error.message : String(error)}`,
        "unavailable"
      );
    } finally {
      await page.close();
      await this.evictIfSessionDied(account);
    }
  }

  /** Loads CLIPPING's campaign page ONCE and pulls both the real cycle data (startDate/days/
   * minViews) and this login's own clipperStats (its real payout + bounty breakdown) out of
   * the same SSR payload — the two thin wrappers below exist so callers that only need one
   * piece don't have to know that, but both still only pay for a single page load when used
   * together (see SyncService, which wants both). `slug` defaults to "kick-clipping", the one
   * campaign every account in this app is currently on (its campaignId matches the page's own
   * `_id`); pass a different slug if a ClippingAccount is ever added on a different campaign. */
  /** The still-accruing "current cycle" payout for THIS login — a real JSON API (confirmed by
   * watching the campaign page's own network requests, same way /api/clipper/earnings was
   * found), authenticated the same cookie-based way as everything else in this file. Replaced
   * extractClipperStatsFromHtml above once CLIPPING stopped embedding this in the campaign
   * page's SSR payload — same reasoning as getEarnings needing a real fetch instead of a page
   * scrape, just for a different figure. */
  private async fetchLiveClipperStats(
    account: Pick<ClippingAccount, "id" | "storageStatePath">,
    campaignId: string
  ): Promise<ClippingClipperStats | null> {
    const cookie = await this.getSessionCookie(account);
    const response = await fetch(`https://${CLIPPING_DOMAIN}/api/campaigns/${campaignId}/clipper-stats`, {
      headers: { Cookie: cookie },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { success?: boolean; data?: unknown };
    if (!body.success || !body.data) return null;

    const raw = body.data as Record<string, unknown>;
    const payout = raw.payout as Record<string, unknown> | undefined;
    if (!payout || typeof payout.totalBountyPayout !== "number") return null;
    const rawBreakdown = Array.isArray(payout.bountyBreakdown) ? payout.bountyBreakdown : [];
    return {
      totalViews: typeof raw.totalViews === "number" ? raw.totalViews : 0,
      totalPayout: payout.totalBountyPayout,
      bountyBreakdown: rawBreakdown
        .filter((b): b is Record<string, unknown> => typeof b === "object" && b !== null)
        .map((b) => ({
          bounty: String(b.bounty ?? ""),
          views: typeof b.views === "number" ? b.views : 0,
          rate: typeof b.rate === "number" ? b.rate : 0,
          payout: typeof b.payout === "number" ? b.payout : 0,
          minViewsRequired: typeof b.minViewsRequired === "number" ? b.minViewsRequired : 0,
          minViewsReached: Boolean(b.minViewsReached),
        }))
        .filter((b) => b.bounty),
    };
  }

  /** The campaign's own config (startDate/days/minViews/videoStartDate) — a real JSON API
   * (confirmed the same way as fetchLiveClipperStats), replacing extractCampaignFromHtml once
   * CLIPPING stopped embedding this in the campaign page's SSR payload too. Unlike
   * fetchLiveClipperStats this isn't clipper-specific — same response for every account on the
   * campaign — but it's still fetched with this account's cookie since the endpoint requires
   * being signed in at all. */
  private async fetchLiveCampaignInfo(
    account: Pick<ClippingAccount, "id" | "storageStatePath">,
    campaignId: string
  ): Promise<ClippingCampaignInfo | null> {
    const cookie = await this.getSessionCookie(account);
    const response = await fetch(`https://${CLIPPING_DOMAIN}/api/campaigns/${campaignId}`, {
      headers: { Cookie: cookie },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { success?: boolean; data?: unknown };
    if (!body.success || !body.data) return null;

    const raw = body.data as Record<string, unknown>;
    if (typeof raw.startDate !== "string" || typeof raw.days !== "number") return null;

    // Keyed by tag name — {tag, rate: number, enabled: boolean, status, cap, ...}. `rate` is a
    // plain number (e.g. 30, meaning $30/100K) — reformatted to the "$X/100K" string every
    // other rate consumer in this app already parses (see parseRatePer100k in both
    // routes/dashboard.ts and the frontend's reelPayout.ts), so this slots into the existing
    // ClippingBounty.rate column/format without needing to touch either of those.
    const rawBountyTags = raw.bountyTags as Record<string, unknown> | undefined;
    const bounties =
      rawBountyTags && typeof rawBountyTags === "object"
        ? Object.entries(rawBountyTags)
            .map(([name, value]) => {
              if (typeof value !== "object" || value === null) return null;
              const entry = value as Record<string, unknown>;
              return {
                name,
                rate: typeof entry.rate === "number" ? `$${entry.rate}/100K` : null,
                active: Boolean(entry.enabled),
              };
            })
            .filter((b): b is { name: string; rate: string | null; active: boolean } => b !== null)
        : null;

    return {
      startDate: raw.startDate,
      days: raw.days,
      minViews: typeof raw.minViews === "number" ? raw.minViews : 0,
      videoStartDate: typeof raw.videoStartDate === "string" ? raw.videoStartDate : null,
      bounties,
    };
  }

  async getCampaignPageData(
    account: Pick<ClippingAccount, "id" | "storageStatePath" | "campaignId">,
    slug = "kick-clipping"
  ): Promise<{ campaign: ClippingCampaignInfo | null; clipperStats: ClippingClipperStats | null; paymentMethod: string | null }> {
    const context = await this.getContext(account);
    const page = await context.newPage();
    try {
      const [, liveClipperStats, liveCampaign] = await Promise.all([
        page.goto(`https://${CLIPPING_DOMAIN}/dashboard/campaigns/${slug}`, { waitUntil: "networkidle", timeout: 30_000 }),
        this.fetchLiveClipperStats(account, account.campaignId).catch(() => null),
        this.fetchLiveCampaignInfo(account, account.campaignId).catch(() => null),
      ]);
      const html = await page.content();
      return {
        // The SSR-embedded fields are dead (see extractCampaignFromHtml's own comment) — fall
        // back to it only if the real API ever comes back empty, so a still-unknown future
        // regression on CLIPPING's side doesn't silently blank this out either.
        campaign: liveCampaign ?? extractCampaignFromHtml(html),
        clipperStats: liveClipperStats ?? extractClipperStatsFromHtml(html),
        paymentMethod: extractCampaignPaymentMethodFromHtml(html),
      };
    } catch (error) {
      throw new ClippingApiError(
        `Failed to read campaign info from CLIPPING: ${error instanceof Error ? error.message : String(error)}`,
        "unavailable"
      );
    } finally {
      await page.close();
      await this.evictIfSessionDied(account);
    }
  }

  async getCampaignInfo(
    account: Pick<ClippingAccount, "id" | "storageStatePath" | "campaignId">,
    slug = "kick-clipping"
  ): Promise<ClippingCampaignInfo | null> {
    return (await this.getCampaignPageData(account, slug)).campaign;
  }

  async getClipperStats(
    account: Pick<ClippingAccount, "id" | "storageStatePath" | "campaignId">,
    slug = "kick-clipping"
  ): Promise<ClippingClipperStats | null> {
    return (await this.getCampaignPageData(account, slug)).clipperStats;
  }

  /** CLIPPING's own real payment history — a genuine JSON API (confirmed by watching the
   * Payments page's network requests; unlike campaign/account data, this isn't embedded in the
   * page's SSR payload), authenticated the same way as HttpClippingProvider: a plain fetch with
   * the account's session cookie, no page navigation/Playwright page needed at all. */
  async getEarnings(account: Pick<ClippingAccount, "id" | "storageStatePath">): Promise<ClippingEarnings | null> {
    const cookie = await this.getSessionCookie(account);
    const response = await fetch(`https://${CLIPPING_DOMAIN}/api/clipper/earnings`, {
      headers: { Cookie: cookie },
    });
    if (!response.ok) {
      throw new ClippingApiError(`Failed to read payments from CLIPPING (status ${response.status}).`, "unavailable");
    }
    const body = (await response.json()) as { success?: boolean; data?: unknown };
    if (!body.success || !body.data) return null;

    const raw = body.data as Record<string, unknown>;
    const history = Array.isArray(raw.history) ? (raw.history as Record<string, unknown>[]) : [];
    return {
      lifetimeTotal: typeof raw.lifetimeTotal === "number" ? raw.lifetimeTotal : 0,
      pendingTotal: typeof raw.pendingTotal === "number" ? raw.pendingTotal : 0,
      history: history
        .map((entry): ClippingEarningsEntry | null => {
          const campaignId = typeof entry.campaignId === "string" ? entry.campaignId : null;
          const amount = typeof entry.amount === "number" ? entry.amount : null;
          if (!campaignId || amount === null) return null;
          return {
            cycleId: typeof entry.cycleId === "string" ? entry.cycleId : "",
            campaignId,
            campaignName: typeof entry.campaignName === "string" ? entry.campaignName : "",
            cycleLabel: typeof entry.cycleLabel === "string" ? entry.cycleLabel : null,
            bountyTag: typeof entry.bountyTag === "string" ? entry.bountyTag : null,
            amount,
            paidAt: typeof entry.paidAt === "string" ? entry.paidAt : null,
            finalizedAt: typeof entry.finalizedAt === "string" ? entry.finalizedAt : null,
            exportedAt: typeof entry.exportedAt === "string" ? entry.exportedAt : null,
            totalViews: typeof entry.totalViews === "number" ? entry.totalViews : null,
            totalClips: typeof entry.totalClips === "number" ? entry.totalClips : null,
            paymentMethod: typeof entry.paymentMethod === "string" ? entry.paymentMethod : null,
            paymentAddress: typeof entry.paymentAddress === "string" ? entry.paymentAddress : null,
          };
        })
        .filter((e): e is ClippingEarningsEntry => e !== null),
    };
  }

  /** Every payment method this clipper has saved — read off the Payments page's own SSR
   * payload (see extractPaymentSettingsFromHtml). */
  async getPaymentSettings(
    account: Pick<ClippingAccount, "id" | "storageStatePath">
  ): Promise<ClippingPaymentSettings | null> {
    const context = await this.getContext(account);
    const page = await context.newPage();
    try {
      await page.goto(`https://${CLIPPING_DOMAIN}/dashboard/payments`, { waitUntil: "networkidle", timeout: 30_000 });
      const html = await page.content();
      return extractPaymentSettingsFromHtml(html);
    } catch (error) {
      throw new ClippingApiError(
        `Failed to read payment settings from CLIPPING: ${error instanceof Error ? error.message : String(error)}`,
        "unavailable"
      );
    } finally {
      await page.close();
      await this.evictIfSessionDied(account);
    }
  }

  /** Lets Supabase's own client-side code refresh a stale token by loading a real page in
   * the account's context — same trick as background.js's refreshClippingSession(), just
   * running here instead of via a hidden extension tab. */
  async refreshSession(account: Pick<ClippingAccount, "id" | "storageStatePath">): Promise<void> {
    const context = await this.getContext(account);
    const page = await context.newPage();
    try {
      await page.goto(`https://${CLIPPING_DOMAIN}/`, { waitUntil: "load", timeout: 30_000 });
    } catch (error) {
      throw new ClippingApiError(
        `Failed to refresh CLIPPING session: ${error instanceof Error ? error.message : String(error)}`,
        "auth"
      );
    } finally {
      await page.close();
    }
    await this.persist(account);
    this.lastRefreshedAt.set(account.id, Date.now());
  }

  /** Writes the context's current cookies/localStorage to disk so the session survives a
   * process restart — the "not re-logging in every time" half of the requirement. */
  async persist(account: Pick<ClippingAccount, "id" | "storageStatePath">): Promise<void> {
    const context = this.contexts.get(account.id);
    if (!context) return;
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    await context.storageState({ path: storageStateAbsolutePath(account) });
  }

  // Tracks in-flight/last-failed headed logins so a UI trigger (routes/clippingAccounts.ts's
  // login endpoint) can poll status without holding an HTTP request open for up to 10 minutes
  // — the endpoint kicks loginHeaded() off in the background and returns immediately.
  private loginInProgress = new Set<string>();
  private lastLoginError = new Map<string, string>();

  isLoggingIn(accountId: string): boolean {
    return this.loginInProgress.has(accountId);
  }

  getLastLoginError(accountId: string): string | null {
    return this.lastLoginError.get(accountId) ?? null;
  }

  /** One-time manual login: opens a real, visible browser window for the human to log into
   * CLIPPING by hand, then persists the resulting session. Safe to trigger from an HTTP
   * request ONLY because this API never runs anywhere but localhost on the same machine the
   * browser window will appear on (see server.ts / routes/clipping.ts's session-cookie route
   * for the same precedent) — never wire this up behind a remotely-reachable deployment.
   * Returns the logged-in account's email + display name (scraped from the session/page, not
   * typed by hand) so the caller can save them — either field is null if it couldn't be
   * found. */
  async loginHeaded(
    account: Pick<ClippingAccount, "id" | "storageStatePath" | "label">,
    expectedEmail?: string | null
  ): Promise<ClippingIdentity> {
    if (this.loginInProgress.has(account.id)) {
      throw new ClippingApiError("A login is already in progress for this account.", "auth");
    }
    this.loginInProgress.add(account.id);
    this.lastLoginError.delete(account.id);

    try {
      const browser = await chromium.launch({ headless: false });
      // Reuse this account's saved profile if one exists, instead of always starting from a
      // blank context — a blank context has no Discord session either, so CLIPPING's
      // Discord-OAuth login treats every re-log-in as a brand new, unrecognized device and
      // demands a "new location detected" email verification every single time. Reusing the
      // existing cookies (even though the CLIPPING side is what's actually stale/expired here)
      // keeps Discord's OWN trust of this browser intact, so only CLIPPING's login is needed.
      const statePath = storageStateAbsolutePath(account);
      const context = await browser.newContext(fs.existsSync(statePath) ? { storageState: statePath } : {});
      const page = await context.newPage();
      await page.goto(`https://${CLIPPING_DOMAIN}/auth/login`, { waitUntil: "load" });
      // Tells the human which of possibly several CLIPPING accounts this window is for —
      // there's nothing in CLIPPING's own login page that says so, and re-logging into the
      // wrong one (easy to do with several accounts open) silently overwrites this slot's
      // session with a different account's, corrupting which login this app thinks it has.
      // Only meaningful once there's a real expected identity to name — a brand new slot has
      // no email/label yet ("New account" would be a confusing thing to ask someone to log in
      // as), so it gets a generic prompt instead.
      const bannerText = expectedEmail ? `Please log in as "${account.label}"` : "Log in to continue";
      await page
        .evaluate((text: string) => {
          const banner = document.createElement("div");
          banner.textContent = text;
          Object.assign(banner.style, {
            position: "fixed",
            top: "0",
            left: "0",
            right: "0",
            zIndex: "2147483647",
            background: "#4f46e5",
            color: "#fff",
            font: "600 14px system-ui, sans-serif",
            padding: "10px 16px",
            textAlign: "center",
          });
          document.body.prepend(banner);
        }, bannerText)
        .catch(() => {});

      const deadline = Date.now() + 10 * 60 * 1000; // 10 minutes to log in by hand
      let authed = false;
      while (Date.now() < deadline) {
        const cookies = await context.cookies(`https://${CLIPPING_DOMAIN}`);
        if (cookies.some((c) => AUTH_COOKIE_PATTERN.test(c.name))) {
          authed = true;
          break;
        }
        await page.waitForTimeout(1500);
      }

      if (!authed) {
        await browser.close();
        throw new ClippingApiError("Timed out waiting for CLIPPING login to complete.", "auth");
      }

      // Login redirects away from /auth/login somewhere in the app, but not reliably to a page
      // that renders the account switcher (the bare domain is the public marketing homepage
      // and never does) — navigate to /dashboard explicitly rather than trust the redirect.
      await page
        .goto(`https://${CLIPPING_DOMAIN}/dashboard`, { waitUntil: "networkidle", timeout: 30_000 })
        .catch(() => {});
      const scraped = await scrapeIdentityFromPage(page);
      const cookieEmail = decodeEmailFromCookies(await context.cookies(`https://${CLIPPING_DOMAIN}`));
      const identity: ClippingIdentity = {
        email: scraped?.email ?? cookieEmail,
        displayName: scraped?.displayName ?? null,
        avatarUrl: scraped?.avatarUrl ?? null,
      };

      if (expectedEmail && identity.email && identity.email.toLowerCase() !== expectedEmail.toLowerCase()) {
        await browser.close().catch(() => {});
        throw new ClippingApiError(
          `You signed in as ${identity.email}, but this slot is for "${account.label}" (${expectedEmail}). Please log in as "${account.label}" instead.`,
          "auth"
        );
      }

      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
      await context.storageState({ path: storageStateAbsolutePath(account) });
      await browser.close();

      // Drop any previously cached headless context for this account so the next
      // getSessionCookie()/refreshSession() call picks up the freshly logged-in storageState
      // instead of a stale (possibly logged-out) cached context.
      const stale = this.contexts.get(account.id);
      if (stale) {
        await stale.close().catch(() => {});
        this.contexts.delete(account.id);
      }
      // A session that was JUST logged in is as fresh as a cookie ever gets — no need for the
      // next getSessionCookie() call to immediately do a proactive refresh too.
      this.lastRefreshedAt.set(account.id, Date.now());

      return identity;
    } catch (error) {
      this.lastLoginError.set(account.id, error instanceof Error ? error.message : String(error));
      this.loginInProgress.delete(account.id);
      throw error;
    }
    // On success, loginInProgress is deliberately left set — the caller (routes/
    // clippingAccounts.ts) still has to persist lastLoginAt to the DB before hasStorageState
    // reflects the new session, and clearing it here would let a poll catch loginInProgress:false
    // with hasStorageState still false, reading as an instant failure right after a real
    // success. The caller clears it (via markLoginSettled) once that write lands.
  }

  markLoginSettled(accountId: string): void {
    this.loginInProgress.delete(accountId);
  }

  /** Rejects a login after the fact (e.g. the signed-in CLIPPING account turned out to already
   * be linked as a different row) — surfaces as lastLoginError, same as any other login
   * failure, without ever having thrown out of loginHeaded itself. */
  setLoginError(accountId: string, message: string): void {
    this.lastLoginError.set(accountId, message);
  }

  // Tracks in-flight "open in a visible window" requests the same way loginInProgress does —
  // separate map since opening and logging in are different operations that can legitimately
  // happen for different accounts (or even overlap for the same one) without conflicting.
  private openInProgress = new Set<string>();
  private lastOpenError = new Map<string, string>();

  isOpeningHeaded(accountId: string): boolean {
    return this.openInProgress.has(accountId);
  }

  getLastOpenError(accountId: string): string | null {
    return this.lastOpenError.get(accountId) ?? null;
  }

  /** Pops open a real, visible Chromium window showing this account's ALREADY-authenticated
   * session — reuses its saved storageState, so no login is needed. This is a separate
   * browser process from the shared headless one everything else runs through (Playwright
   * can't make an already-launched headless browser visible after the fact); it's read/write
   * independent of that shared browser's cached context, so browsing here can't disrupt sync
   * or submissions running in the background. Requires the account to have logged in at least
   * once already (loginHeaded) — there's no session to reuse otherwise. Persists whatever
   * state the window ends up in in case anything changed (e.g. a token refresh) once the
   * window is closed by hand; there's no auto-close/timeout since browsing has no fixed length. */
  async openHeaded(
    account: Pick<ClippingAccount, "id" | "storageStatePath" | "label">,
    expectedEmail?: string | null,
    path_ = "/dashboard",
    // Fires (once) the first time a real, matching identity is scraped inside this window —
    // covers the "opened this because the account was signed out, then logged in from inside
    // it" case, so the rest of the app (lastLoginAt, email/label) picks it up the same way a
    // real Log-in does, not just the storageState file on disk.
    onIdentityConfirmed?: (identity: ClippingIdentity) => void
  ): Promise<void> {
    const statePath = storageStateAbsolutePath(account);
    // No longer requires a prior login — CLIPPING itself redirects an unauthenticated request
    // for `path_` to /auth/login, so opening a signed-out account just lands the human on the
    // login page inside the SAME persistent profile (Discord already trusts it) instead of
    // needing the separate Log-in flow's blank context.
    const hasState = fs.existsSync(statePath);

    this.openInProgress.add(account.id);
    this.lastOpenError.delete(account.id);
    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({ headless: false });
      const context = await browser.newContext(hasState ? { storageState: statePath } : {});
      const page = await context.newPage();
      await page.goto(`https://${CLIPPING_DOMAIN}${path_}`, { waitUntil: "load", timeout: 30_000 });

      // Playwright can't read a context's storageState once it's already closed (confirmed —
      // it throws "Target ... has been closed"), and there's no reliable hook that fires
      // *before* a human closes a real browser window, so a final on-close snapshot isn't
      // possible. Snapshotting periodically is the fallback, but a login performed inside this
      // window needs to survive a human closing it right after — so also snapshot eagerly on
      // every navigation (a real login redirects at least once, e.g. to /dashboard), which
      // catches it within a second or two instead of waiting up to a full interval tick. Before
      // each snapshot, check whose account is actually signed in right now — a human can sign
      // out and into a DIFFERENT CLIPPING account inside this window, and blindly persisting
      // that would silently overwrite this slot's saved session with the wrong account's.
      let identityConfirmed = false;
      const trySnapshot = async () => {
        if (page.isClosed()) return;
        const identity = await scrapeIdentityFromPage(page).catch(() => null);
        if (expectedEmail && identity?.email && identity.email.toLowerCase() !== expectedEmail.toLowerCase()) {
          this.lastOpenError.set(
            account.id,
            `This window is now signed in as ${identity.email} instead of "${account.label}" (${expectedEmail}) — sign back into "${account.label}" in that window, or close it and reopen.`
          );
          return; // skip this snapshot — don't persist the wrong account's session
        }
        this.lastOpenError.delete(account.id);
        await context.storageState({ path: statePath }).catch(() => {});
        if (identity?.email && !identityConfirmed) {
          identityConfirmed = true;
          onIdentityConfirmed?.(identity);
          // The SHARED background context (what sync/getSessionCookie/hasLiveCookie actually
          // use) is a completely separate Playwright context from this standalone window —
          // saving the fresh session to disk above doesn't make it pick that up on its own.
          // Drop it so the next call reloads fresh from the file we just wrote, instead of
          // continuing to use whatever (possibly signed-out) cookies it already had cached.
          const stale = this.contexts.get(account.id);
          if (stale) {
            stale.close().catch(() => {});
            this.contexts.delete(account.id);
          }
        }
      };

      page.on("framenavigated", () => void trySnapshot());
      const snapshotInterval = setInterval(trySnapshot, 5_000);

      const finish = () => {
        clearInterval(snapshotInterval);
        this.openInProgress.delete(account.id);
        // Closing the visible WINDOW doesn't necessarily quit the underlying browser process
        // (confirmed on macOS: the app stays running with zero windows after the last one is
        // closed), which left `disconnected` never firing, openInProgress stuck true forever,
        // and a dangling background Chromium process piling up on repeated opens. Force a full
        // close here as soon as the window/page goes away so the process actually exits.
        browser?.close().catch(() => {});
      };
      page.on("close", finish);
      browser.on("disconnected", finish);
    } catch (error) {
      this.openInProgress.delete(account.id);
      await browser?.close().catch(() => {});
      throw new ClippingApiError(
        `Failed to open CLIPPING for this account: ${error instanceof Error ? error.message : String(error)}`,
        "unavailable"
      );
    }
  }

  async shutdown(): Promise<void> {
    for (const context of this.contexts.values()) {
      await context.close().catch(() => {});
    }
    this.contexts.clear();
    if (this.browserPromise) {
      const browser = await this.browserPromise.catch(() => null);
      await browser?.close().catch(() => {});
      this.browserPromise = null;
    }
  }
}

export const clippingBrowserManager = new ClippingBrowserManager();
