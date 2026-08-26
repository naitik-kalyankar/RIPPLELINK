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

// CLIPPING's /dashboard/accounts page (a Next.js App Router page) has no separate JSON API
// for its linked-accounts list — confirmed by watching every response while loading it. The
// full account list (each with its real internal `_id`, needed for SubmitClipInput.accountId)
// is instead embedded directly in the page's SSR payload, inside a React Server Components
// stream: `self.__next_f.push([1, "<escaped JS string>"])`. That escaped string is plain
// JS-string escaping, so wrapping it in quotes and JSON.parse-ing it decodes it back to text;
// from there, bracket-matching (respecting string literals, so a `]` inside e.g. a username
// can't end the array early) finds exactly where the `"accounts":[...]` array ends, which is
// then its own valid JSON substring.
function extractLinkedAccountsFromHtml(html: string): ClippingLinkedAccount[] | null {
  const pushes = html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g);
  for (const [, escaped] of pushes) {
    if (!escaped.includes("initialData")) continue;
    let unescaped: string;
    try {
      unescaped = JSON.parse(`"${escaped}"`);
    } catch {
      continue;
    }

    const marker = '"accounts":[';
    const markerStart = unescaped.indexOf(marker);
    if (markerStart === -1) continue;

    let i = markerStart + marker.length - 1; // position of the opening '['
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    for (; i < unescaped.length; i++) {
      const ch = unescaped[i];
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
      if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }

    try {
      const raw = JSON.parse(unescaped.slice(markerStart + marker.length - 1, i)) as unknown[];
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

// Adapted from the extension's content.js scrapeAccountIdentity(): the signed-in account's
// real name + email are rendered directly into the dashboard page's own HTML (the sidebar
// account-switcher trigger — an avatar wrapped by two <p> tags, name then email), not exposed
// via any API response. Scraping the DOM is more reliable than decoding a name out of the
// session cookie, since it's exactly what a human reads to tell CLIPPING accounts apart — and
// unlike email, the JWT payload doesn't carry a display name claim at all. Checks for
// `[data-slot="avatar"]` (the wrapper span, always present) rather than `avatar-fallback`
// specifically — that only renders when the account has no profile photo, so an account WITH
// one (rendering `avatar-image` instead) was being silently skipped by the original check.
async function scrapeIdentityFromPage(page: Page): Promise<{ email: string | null; displayName: string | null } | null> {
  return page
    .evaluate(() => {
      const triggers = document.querySelectorAll('[data-slot="dropdown-menu-trigger"]');
      for (const trigger of triggers) {
        if (!trigger.querySelector('[data-slot="avatar"]')) continue;
        const paragraphs = trigger.querySelectorAll("p");
        if (paragraphs.length < 2) continue;
        const email = paragraphs[1].textContent?.trim();
        if (!email || !email.includes("@")) continue;
        return { displayName: paragraphs[0].textContent?.trim() || null, email };
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

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = chromium.launch({ headless: true }).catch((error) => {
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

  /** Reads the account's current Supabase auth cookie(s) and serializes them the same way
   * HttpClippingProvider has always sent them: a single `Cookie:` header value. */
  async getSessionCookie(account: Pick<ClippingAccount, "id" | "storageStatePath">): Promise<string> {
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
        "No CLIPPING session found for this account — run `npx tsx apps/api/scripts/clipping-login.ts <accountId>` to log in.",
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
    let scraped: { email: string | null; displayName: string | null } | null = null;
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
    return { email: scraped?.email ?? cookieEmail, displayName: scraped?.displayName ?? null };
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
  async loginHeaded(account: Pick<ClippingAccount, "id" | "storageStatePath">): Promise<ClippingIdentity> {
    if (this.loginInProgress.has(account.id)) {
      throw new ClippingApiError("A login is already in progress for this account.", "auth");
    }
    this.loginInProgress.add(account.id);
    this.lastLoginError.delete(account.id);

    try {
      const browser = await chromium.launch({ headless: false });
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`https://${CLIPPING_DOMAIN}/auth/login`, { waitUntil: "load" });

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
      const identity: ClippingIdentity = { email: scraped?.email ?? cookieEmail, displayName: scraped?.displayName ?? null };

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

      return identity;
    } catch (error) {
      this.lastLoginError.set(account.id, error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      this.loginInProgress.delete(account.id);
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
