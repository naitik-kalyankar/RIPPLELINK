import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ClippingAccount } from "@prisma/client";
import { createClippingAccountSchema, updateClippingAccountSchema } from "@kick-manager/shared";
import { prisma } from "../lib/db.js";
import { env } from "../lib/env.js";
import { getClippingAccountHealth } from "../lib/integrationHealth.js";
import { activityLogService } from "../services/activity/ActivityLogService.js";
import { clippingBrowserManager } from "../services/clipping/ClippingBrowserManager.js";
import { ClippingApiError } from "../services/clipping/ClippingService.js";

// A login-new attempt's pending id and the ClippingAccount row it ends up resolving to are
// USUALLY the same id (a fresh row created with that same id) — except when it reactivates a
// previously-removed row for the same email, which keeps ITS OWN (older) id. The status poll
// needs to find the right row either way, so the mapping is recorded here on settle.
const pendingLoginResolvedAccountId = new Map<string, string>();

function storageStatePathFor(id: string): string {
  return `acct_${id}.json`;
}

/**
 * Matches CLIPPING's linked-accounts list (real internal IDs, read straight off CLIPPING's own
 * accounts page — see ClippingBrowserManager.getLinkedAccounts) against existing InstagramAccount
 * rows by username (case-insensitive). NOT by CLIPPING's `instagramUserId` field — confirmed by
 * hand that it does NOT correspond to InstagramAccount.instagramId (real Instagram Graph API
 * user IDs are ~17-18 digits; CLIPPING's instagramUserId values here were ~11 digits, evidently
 * some other identifier) — username is the only field both sides represent the same way.
 * Auto-fills `clippingAccountId`/`clippingAccountRefId` only when currently unset, so a manually
 * corrected value never gets silently overwritten — but a MISMATCH (something's already set,
 * and it disagrees with what CLIPPING actually has) is reported rather than swallowed, since
 * that's a real data problem (a wrong ID silently makes submissions misattribute or fail) the
 * old manual-copy-paste workflow had no way to catch. Run automatically right after a login
 * connects, and available on demand for accounts added to CLIPPING or to this app afterward.
 */
async function syncLinkedAccounts(userId: string, account: ClippingAccount) {
  const linked = await clippingBrowserManager.getLinkedAccounts(account);
  const results: Array<{ username: string; matched: boolean; updated: boolean; mismatch?: { stored: string; actual: string } }> = [];

  for (const entry of linked) {
    const igAccount = await prisma.instagramAccount.findFirst({
      where: { userId, username: { equals: entry.username, mode: "insensitive" } },
    });
    if (!igAccount) {
      results.push({ username: entry.username, matched: false, updated: false });
      continue;
    }

    const patch: { clippingAccountId?: string; clippingAccountRefId?: string } = {};
    if (!igAccount.clippingAccountId) patch.clippingAccountId = entry.id;
    if (!igAccount.clippingAccountRefId) patch.clippingAccountRefId = account.id;

    if (Object.keys(patch).length > 0) {
      await prisma.instagramAccount.update({ where: { id: igAccount.id }, data: patch });
    }

    const mismatch =
      igAccount.clippingAccountId && igAccount.clippingAccountId !== entry.id
        ? { stored: igAccount.clippingAccountId, actual: entry.id }
        : undefined;

    results.push({ username: entry.username, matched: true, updated: Object.keys(patch).length > 0, ...(mismatch ? { mismatch } : {}) });
  }

  const updatedCount = results.filter((r) => r.updated).length;
  if (updatedCount > 0) {
    await activityLogService.log(
      userId,
      `Auto-filled CLIPPING account ID for ${updatedCount} Instagram account(s) linked to "${account.label}".`
    );
  }
  for (const r of results) {
    if (r.mismatch) {
      await activityLogService.log(
        userId,
        `@${r.username}'s saved CLIPPING account ID (${r.mismatch.stored}) doesn't match what CLIPPING actually has (${r.mismatch.actual}) — check its Credentials.`,
        "warning"
      );
    }
  }
  linkedAccountsCache.delete(account.id);
  return { items: results, matchedCount: results.filter((r) => r.matched).length, updatedCount };
}

export interface ClippingLinkedAccountView {
  // CLIPPING's own internal id/username/platform for this linked social account — see
  // ClippingBrowserManager.getLinkedAccounts. instagramUserId is CLIPPING's own identifier,
  // NOT this app's InstagramAccount.instagramId (confirmed not equivalent — see comment on
  // syncLinkedAccounts above), so it's informational only, never used for matching.
  id: string;
  username: string;
  instagramUserId: string | null;
  platform: string;
  // Set when a local InstagramAccount row already exists for this username — lets the
  // Socials page show "already added" vs offer a one-click add for the rest.
  localAccountId: string | null;
}

// getLinkedAccounts() navigates a real CLIPPING page, so it's not something to re-run on every
// Socials page load — cached briefly per ClippingAccount, same reasoning as the campaign-info
// cache in routes/clipping.ts, just a shorter TTL since this is viewed more interactively.
const linkedAccountsCache = new Map<string, { items: ClippingLinkedAccountView[]; fetchedAt: number }>();
const LINKED_ACCOUNTS_CACHE_TTL_MS = 5 * 60 * 1000;

async function getLinkedAccountsView(
  userId: string,
  account: ClippingAccount,
  forceRefresh = false
): Promise<ClippingLinkedAccountView[]> {
  const cached = linkedAccountsCache.get(account.id);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < LINKED_ACCOUNTS_CACHE_TTL_MS) {
    return cached.items;
  }

  const linked = await clippingBrowserManager.getLinkedAccounts(account);
  const localAccounts = await prisma.instagramAccount.findMany({
    where: { userId, username: { in: linked.map((l) => l.username), mode: "insensitive" } },
  });
  const localByUsername = new Map(localAccounts.map((a) => [a.username.toLowerCase(), a]));

  const items = linked.map((entry) => ({
    ...entry,
    localAccountId: localByUsername.get(entry.username.toLowerCase())?.id ?? null,
  }));
  linkedAccountsCache.set(account.id, { items, fetchedAt: Date.now() });
  return items;
}

async function serializeAccount(account: {
  id: string;
  label: string;
  email: string | null;
  avatarUrl: string | null;
  apiUrl: string;
  campaignId: string;
  active: boolean;
  lastUsedAt: Date | null;
  lastLoginAt: Date | null;
  storageStatePath: string;
  lastPayout: number | null;
  lastPayoutBountyBreakdown: unknown;
  lastPayoutFetchedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  // storageStatePath is read here (to check the live cookie) but deliberately never included
  // in the response — it's a server filesystem detail, not frontend-relevant, and the file
  // itself holds live session data.
  const health = getClippingAccountHealth(account.id);
  // The status dot's green/red is a LIVE check — does this account's Playwright context
  // actually hold a session cookie right now — rather than "did the last real API request
  // succeed", which could be stale for hours between syncs. See hasLiveCookie.
  const hasLiveCookie = await clippingBrowserManager.hasLiveCookie(account);
  return {
    id: account.id,
    label: account.label,
    email: account.email,
    avatarUrl: account.avatarUrl,
    apiUrl: account.apiUrl,
    campaignId: account.campaignId,
    active: account.active,
    lastUsedAt: account.lastUsedAt?.toISOString() ?? null,
    lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
    hasStorageState: account.lastLoginAt !== null,
    healthy: hasLiveCookie,
    lastError: health.lastError,
    loginInProgress: clippingBrowserManager.isLoggingIn(account.id),
    lastLoginError: clippingBrowserManager.getLastLoginError(account.id),
    openInProgress: clippingBrowserManager.isOpeningHeaded(account.id),
    lastOpenError: clippingBrowserManager.getLastOpenError(account.id),
    // CLIPPING's own computed payout for this login, refreshed every sync — see
    // SyncService.syncPayoutForAccount. Null until the first sync after this account connects.
    lastPayout: account.lastPayout,
    lastPayoutBountyBreakdown: Array.isArray(account.lastPayoutBountyBreakdown) ? account.lastPayoutBountyBreakdown : [],
    lastPayoutFetchedAt: account.lastPayoutFetchedAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

// Every route below looks the account up scoped by request.user.id, not just id — a
// ClippingAccount id belonging to a DIFFERENT user must 404 exactly like one that doesn't
// exist, never leak its existence or (worse, for the login/open routes) let a guessed/leaked
// id trigger Playwright actions against another user's session. See the auth migration plan.
async function findOwnedAccount(userId: string, id: string) {
  return prisma.clippingAccount.findUnique({ where: { id, userId } });
}

export async function clippingAccountsRoutes(app: FastifyInstance) {
  app.get("/api/clipping-accounts", async (request) => {
    const accounts = await prisma.clippingAccount.findMany({
      where: { active: true, userId: request.user.id },
      orderBy: { createdAt: "asc" },
    });
    return { items: await Promise.all(accounts.map(serializeAccount)) };
  });

  app.post("/api/clipping-accounts", async (request, reply) => {
    const body = createClippingAccountSchema.parse(request.body);
    const userId = request.user.id;

    const apiUrl = body.apiUrl ?? env.clipping.apiUrl;
    if (!apiUrl) {
      reply.status(400).send({
        error: "missing_api_url",
        message: "No apiUrl given and CLIPPING_API_URL isn't set to default from — provide one explicitly.",
      });
      return;
    }

    // Create first to get a real id (storageStatePath is keyed by it), then patch the path in —
    // matches the two-step id-then-derived-field pattern used nowhere else in this repo, but
    // is the simplest way to keep storageStatePath.json named after the row it belongs to.
    const created = await prisma.clippingAccount.create({
      data: {
        userId,
        label: body.label,
        email: body.email ?? null,
        apiUrl,
        campaignId: body.campaignId,
        storageStatePath: "",
      },
    });
    const account = await prisma.clippingAccount.update({
      where: { id: created.id },
      data: { storageStatePath: storageStatePathFor(created.id) },
    });

    await activityLogService.log(userId, `Added CLIPPING account "${account.label}".`);
    reply.status(201);
    return await serializeAccount(account);
  });

  app.patch("/api/clipping-accounts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateClippingAccountSchema.parse(request.body);
    const existing = await findOwnedAccount(request.user.id, id);
    if (!existing) {
      reply.status(404).send({ error: "not_found", message: "CLIPPING account not found." });
      return;
    }
    const account = await prisma.clippingAccount.update({ where: { id }, data: body });
    return await serializeAccount(account);
  });

  app.delete("/api/clipping-accounts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;
    const existing = await findOwnedAccount(userId, id);
    if (!existing) {
      reply.status(404).send({ error: "not_found", message: "CLIPPING account not found." });
      return;
    }
    // Soft delete, matching InstagramAccount.active — never hard-delete a ClippingAccount
    // that Instagram accounts or past submissions may still reference.
    const account = await prisma.clippingAccount.update({ where: { id }, data: { active: false } });
    await activityLogService.log(userId, `Deactivated CLIPPING account "${account.label}".`);
    reply.status(204).send();
  });

  app.get("/api/clipping-accounts/:id/status", async (request, reply) => {
    const { id } = request.params as { id: string };
    const account = await findOwnedAccount(request.user.id, id);
    if (!account) {
      reply.status(404).send({ error: "not_found", message: "CLIPPING account not found." });
      return;
    }
    return await serializeAccount(account);
  });

  // Triggers a real, visible Chromium window on THIS machine for the human to log into
  // CLIPPING by hand — safe to expose over HTTP only because this API never runs anywhere
  // but localhost on the same machine the window appears on (see server.ts and the
  // session-cookie route in routes/clipping.ts for the same precedent; never deploy this
  // anywhere remotely reachable). Fire-and-forget: loginHeaded() can take up to 10 minutes,
  // so this returns immediately and the frontend polls GET /api/clipping-accounts for
  // loginInProgress/hasStorageState instead of holding the request open.
  app.post("/api/clipping-accounts/:id/login", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;
    const account = await findOwnedAccount(userId, id);
    if (!account) {
      reply.status(404).send({ error: "not_found", message: "CLIPPING account not found." });
      return;
    }

    if (clippingBrowserManager.isLoggingIn(id)) {
      reply.status(409).send({
        error: "login_in_progress",
        message: "A login is already in progress for this account.",
      });
      return;
    }

    clippingBrowserManager
      .loginHeaded(account, account.email)
      .then(async ({ email, displayName, avatarUrl }) => {
        // Same CLIPPING account, signed into a second slot — a real thing to guard against
        // now that a brand new row has no expectedEmail to catch this earlier in loginHeaded.
        // Reject after the fact rather than silently keeping two rows pointed at one session.
        if (email) {
          const duplicate = await prisma.clippingAccount.findFirst({
            where: { userId, active: true, id: { not: id }, email: { equals: email, mode: "insensitive" } },
          });
          if (duplicate) {
            clippingBrowserManager.setLoginError(id, `Already linked as "${duplicate.label}" — sign in with a different CLIPPING account.`);
            clippingBrowserManager.markLoginSettled(id);
            await activityLogService.log(
              userId,
              `Sign-in for "${account.label}" was rejected — ${email} is already linked as "${duplicate.label}".`,
              "warning"
            );
            return;
          }
        }
        // Scraped straight from the session/page — not typed by hand. Only overwrites fields
        // we actually got a value for; a failed scrape never clobbers what's already saved.
        await prisma.clippingAccount.update({
          where: { id },
          data: {
            lastLoginAt: new Date(),
            ...(email ? { email } : {}),
            ...(displayName ? { label: displayName } : {}),
            // `email` present proves the scrape actually ran, so avatarUrl (even when null —
            // the account genuinely has no photo right now) is trustworthy to write; a failed
            // scrape (email also null) never touches it either way, same reasoning as above.
            ...(email ? { avatarUrl } : {}),
          },
        });
        // Only now is hasStorageState actually true for a poller reading the account row —
        // see loginHeaded's comment on why loginInProgress stays set until this point.
        clippingBrowserManager.markLoginSettled(id);
        await activityLogService.log(
          userId,
          `CLIPPING account "${displayName ?? account.label}" connected${email ? ` (${email})` : ""}.`
        );
        await syncLinkedAccounts(userId, account).catch(async (error) => {
          // Login itself already succeeded — a failed auto-sync here shouldn't look like a
          // failed login. Just log it; the manual sync-linked-accounts endpoint can retry.
          const message = error instanceof Error ? error.message : "Unknown error.";
          await activityLogService.log(userId, `Auto-linking Instagram accounts for "${account.label}" failed: ${message}`, "error");
        });
      })
      .catch(async (error) => {
        // loginInProgress was already cleared inside loginHeaded's own catch on failure.
        const message = error instanceof ClippingApiError ? error.message : "Unknown login error.";
        await activityLogService.log(userId, `CLIPPING login failed for "${account.label}": ${message}`, "error");
      });

    reply.status(202).send({
      message: "Opening a browser window on this machine — log in there to finish connecting this account.",
    });
  });

  // Adding a brand new account: no ClippingAccount row exists yet — one is only ever created
  // AFTER a real sign-in succeeds, so a cancelled/failed/duplicate attempt never leaves a
  // blank, unconnected row behind for the user to notice and clean up by hand. The browser
  // profile is still keyed by a real id up front (generated here, not DB-assigned) so
  // loginHeaded has somewhere to persist storageState to; that same id becomes the row's id
  // if/when it's actually created below.
  app.post("/api/clipping-accounts/login-new", async (request, reply) => {
    const body = request.body as { campaignId?: string } | undefined;
    const campaignId = body?.campaignId?.trim();
    if (!campaignId) {
      reply.status(400).send({ error: "missing_campaign_id", message: "campaignId is required." });
      return;
    }
    const userId = request.user.id;
    const apiUrl = env.clipping.apiUrl;
    if (!apiUrl) {
      reply.status(400).send({
        error: "missing_api_url",
        message: "No apiUrl given and CLIPPING_API_URL isn't set to default from — provide one explicitly.",
      });
      return;
    }

    const id = randomUUID();
    const virtualAccount = { id, storageStatePath: storageStatePathFor(id), label: "New account" };

    clippingBrowserManager
      .loginHeaded(virtualAccount, null)
      .then(async ({ email, displayName, avatarUrl }) => {
        // One real CLIPPING account, linked twice — email is globally unique on the table (see
        // schema.prisma), so this also catches a different RIPPLELINK user already holding it.
        // NOT filtered to active: true — the DB's unique constraint on email doesn't care
        // whether the existing row is soft-deleted, so neither can this check (a create() below
        // would just fail on the same constraint anyway, only with a much uglier error).
        let account: ClippingAccount;
        if (email) {
          const existing = await prisma.clippingAccount.findFirst({
            where: { email: { equals: email, mode: "insensitive" } },
          });
          if (existing && existing.userId !== userId) {
            clippingBrowserManager.setLoginError(id, "This CLIPPING account is already linked to another RIPPLELINK user.");
            clippingBrowserManager.markLoginSettled(id);
            await activityLogService.log(userId, `Sign-in rejected — ${email} is already linked to another user.`, "warning");
            return;
          }
          if (existing && existing.active) {
            clippingBrowserManager.setLoginError(id, `Already linked as "${existing.label}" — sign in with a different CLIPPING account.`);
            clippingBrowserManager.markLoginSettled(id);
            await activityLogService.log(userId, `Sign-in rejected — ${email} is already linked as "${existing.label}".`, "warning");
            return;
          }
          if (existing) {
            // A previously removed account for this same email — reactivate that row instead
            // of creating a new one (the email column can only ever hold one row for it).
            account = await prisma.clippingAccount.update({
              where: { id: existing.id },
              data: {
                active: true,
                label: displayName ?? existing.label,
                avatarUrl,
                apiUrl,
                campaignId,
                storageStatePath: storageStatePathFor(id),
                lastLoginAt: new Date(),
              },
            });
          } else {
            account = await prisma.clippingAccount.create({
              data: { id, userId, label: displayName ?? "New account", email, avatarUrl, apiUrl, campaignId, storageStatePath: storageStatePathFor(id), lastLoginAt: new Date() },
            });
          }
        } else {
          account = await prisma.clippingAccount.create({
            data: { id, userId, label: "New account", email: null, avatarUrl: null, apiUrl, campaignId, storageStatePath: storageStatePathFor(id), lastLoginAt: new Date() },
          });
        }

        // Only now does a row exist (or is live again) at all — see markLoginSettled's own
        // comment for why this has to happen after the write, not right when loginHeaded
        // resolves. The pending-status poll is keyed by `id`, not account.id, so this has to
        // run even on the reactivation path where they differ.
        pendingLoginResolvedAccountId.set(id, account.id);
        clippingBrowserManager.markLoginSettled(id);
        await activityLogService.log(userId, `CLIPPING account "${account.label}" connected${email ? ` (${email})` : ""}.`);
        await syncLinkedAccounts(userId, account).catch(async (error) => {
          const message = error instanceof Error ? error.message : "Unknown error.";
          await activityLogService.log(userId, `Auto-linking Instagram accounts for "${account.label}" failed: ${message}`, "error");
        });
      })
      .catch(async (error) => {
        // Covers both loginHeaded itself failing (loginInProgress already cleared there) AND
        // an unexpected failure in the .then() above (e.g. the create/update call) — that path
        // leaves loginInProgress set (deliberately, for the success case), so it MUST be
        // cleared here too or a poller waits on it forever.
        const message = error instanceof ClippingApiError ? error.message : "Unknown login error.";
        clippingBrowserManager.setLoginError(id, message);
        clippingBrowserManager.markLoginSettled(id);
        await activityLogService.log(userId, `CLIPPING sign-in failed: ${message}`, "error");
      });

    reply.status(202).send({
      id,
      message: "Opening a browser window on this machine — log in there to finish connecting this account.",
    });
  });

  // Polled by the frontend while a login-new attempt is in flight — deliberately independent
  // of GET /api/clipping-accounts (which has nothing to show until a row actually exists) so
  // there's no race between "the account row appeared" and "the login finished" to reason
  // about. `account` is only non-null once the row is actually created (i.e. success).
  app.get("/api/clipping-accounts/login-new/:id/status", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;
    const inProgress = clippingBrowserManager.isLoggingIn(id);
    const error = clippingBrowserManager.getLastLoginError(id);
    const resolvedAccountId = pendingLoginResolvedAccountId.get(id) ?? id;
    const account = await findOwnedAccount(userId, resolvedAccountId);
    reply.status(200).send({
      inProgress,
      error,
      account: account ? await serializeAccount(account) : null,
    });
  });

  // Re-reads the email + display name from the account's ALREADY-saved session — no headed
  // window, no fresh login, just loading a page in the existing storageState. Backfills
  // accounts connected before this existed, or any account whose identity is missing/stale.
  app.post("/api/clipping-accounts/:id/refresh-identity", async (request, reply) => {
    const { id } = request.params as { id: string };
    const account = await findOwnedAccount(request.user.id, id);
    if (!account) {
      reply.status(404).send({ error: "not_found", message: "CLIPPING account not found." });
      return;
    }

    const { email, displayName, avatarUrl } = await clippingBrowserManager.getDecodedIdentity(account);
    if (!email && !displayName) {
      reply.status(200).send({ email: null, displayName: null, message: "No identity found in the current session." });
      return;
    }

    const updated = await prisma.clippingAccount.update({
      where: { id },
      data: { ...(email ? { email } : {}), ...(displayName ? { label: displayName } : {}), ...(email ? { avatarUrl } : {}) },
    });
    reply.status(200).send(await serializeAccount(updated));
  });

  // Pops open a real, visible Chromium window showing this account's already-connected
  // session — no login needed, reuses the saved storageState from a previous Log in. Same
  // localhost-only safety reasoning as the login route above. Fire-and-forget: the window
  // stays open until the human closes it by hand, so this returns immediately rather than
  // waiting on that.
  app.post("/api/clipping-accounts/:id/open", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;
    const account = await findOwnedAccount(userId, id);
    if (!account) {
      reply.status(404).send({ error: "not_found", message: "CLIPPING account not found." });
      return;
    }

    if (clippingBrowserManager.isOpeningHeaded(id)) {
      reply.status(409).send({
        error: "open_in_progress",
        message: "A window for this account is already open.",
      });
      return;
    }

    try {
      await clippingBrowserManager.openHeaded(account, account.email, "/dashboard", ({ email, displayName, avatarUrl }) => {
        // Fires if this account was actually signed out and the human logged back in from
        // inside this window — keeps lastLoginAt/email/label in sync the same way a real
        // Log-in does, not just the storageState file on disk (see openHeaded's
        // onIdentityConfirmed for why the shared context also gets refreshed here).
        prisma.clippingAccount
          .update({
            where: { id },
            data: {
              lastLoginAt: new Date(),
              ...(email ? { email } : {}),
              ...(displayName ? { label: displayName } : {}),
              ...(email ? { avatarUrl } : {}),
            },
          })
          .then(() => activityLogService.log(userId, `CLIPPING account "${displayName ?? account.label}" signed in.`))
          .catch(() => {});
      });
    } catch (error) {
      const message = error instanceof ClippingApiError ? error.message : "Unknown error.";
      reply.status(400).send({ error: "open_failed", message });
      return;
    }

    reply.status(202).send({ message: "Opening a browser window on this machine…" });
  });

  // Every social account CLIPPING has linked to this login — including ones with no matching
  // InstagramAccount row in this app yet — for the Socials page to display "here's everything
  // CLIPPING has for this account" rather than only what's already been added here. Cached
  // briefly (see getLinkedAccountsView); pass ?refresh=1 to bypass the cache.
  app.get("/api/clipping-accounts/:id/linked-accounts", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { refresh } = request.query as { refresh?: string };
    const userId = request.user.id;
    const account = await findOwnedAccount(userId, id);
    if (!account) {
      reply.status(404).send({ error: "not_found", message: "CLIPPING account not found." });
      return;
    }

    try {
      const items = await getLinkedAccountsView(userId, account, refresh === "1");
      reply.status(200).send({ items });
    } catch (error) {
      const message = error instanceof ClippingApiError ? error.message : "Failed to read linked accounts from CLIPPING.";
      reply.status(400).send({ error: "linked_accounts_failed", message });
    }
  });

  // Reads CLIPPING's linked-accounts list and auto-fills clippingAccountId/clippingAccountRefId
  // for any matching Instagram account that doesn't already have them set (see
  // syncLinkedAccounts above). Runs automatically right after login; this is for re-running it
  // later — e.g. after adding a new Instagram account to CLIPPING or to this app.
  app.post("/api/clipping-accounts/:id/sync-linked-accounts", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;
    const account = await findOwnedAccount(userId, id);
    if (!account) {
      reply.status(404).send({ error: "not_found", message: "CLIPPING account not found." });
      return;
    }
    const result = await syncLinkedAccounts(userId, account);
    reply.status(200).send(result);
  });
}
