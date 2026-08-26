import type { FastifyInstance } from "fastify";
import type { ClippingAccount } from "@prisma/client";
import { createClippingAccountSchema, updateClippingAccountSchema } from "@kick-manager/shared";
import { prisma } from "../lib/db.js";
import { env } from "../lib/env.js";
import { getClippingAccountHealth } from "../lib/integrationHealth.js";
import { activityLogService } from "../services/activity/ActivityLogService.js";
import { clippingBrowserManager } from "../services/clipping/ClippingBrowserManager.js";
import { ClippingApiError } from "../services/clipping/ClippingService.js";

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
async function syncLinkedAccounts(account: ClippingAccount) {
  const linked = await clippingBrowserManager.getLinkedAccounts(account);
  const results: Array<{ username: string; matched: boolean; updated: boolean; mismatch?: { stored: string; actual: string } }> = [];

  for (const entry of linked) {
    const igAccount = await prisma.instagramAccount.findFirst({
      where: { username: { equals: entry.username, mode: "insensitive" } },
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
      `Auto-filled CLIPPING account ID for ${updatedCount} Instagram account(s) linked to "${account.label}".`
    );
  }
  for (const r of results) {
    if (r.mismatch) {
      await activityLogService.log(
        `@${r.username}'s saved CLIPPING account ID (${r.mismatch.stored}) doesn't match what CLIPPING actually has (${r.mismatch.actual}) — check its Credentials.`,
        "warning"
      );
    }
  }
  return { items: results, matchedCount: results.filter((r) => r.matched).length, updatedCount };
}

function serializeAccount(account: {
  id: string;
  label: string;
  email: string | null;
  apiUrl: string;
  campaignId: string;
  active: boolean;
  lastUsedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  // storageStatePath is deliberately never included — it's a server filesystem detail, not
  // frontend-relevant, and the file itself holds live session data.
  const health = getClippingAccountHealth(account.id);
  return {
    id: account.id,
    label: account.label,
    email: account.email,
    apiUrl: account.apiUrl,
    campaignId: account.campaignId,
    active: account.active,
    lastUsedAt: account.lastUsedAt?.toISOString() ?? null,
    lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
    hasStorageState: account.lastLoginAt !== null,
    healthy: health.lastError === null,
    lastError: health.lastError,
    loginInProgress: clippingBrowserManager.isLoggingIn(account.id),
    lastLoginError: clippingBrowserManager.getLastLoginError(account.id),
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

export async function clippingAccountsRoutes(app: FastifyInstance) {
  app.get("/api/clipping-accounts", async () => {
    const accounts = await prisma.clippingAccount.findMany({ orderBy: { createdAt: "asc" } });
    return { items: accounts.map(serializeAccount) };
  });

  app.post("/api/clipping-accounts", async (request, reply) => {
    const body = createClippingAccountSchema.parse(request.body);

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

    await activityLogService.log(`Added CLIPPING account "${account.label}".`);
    reply.status(201);
    return serializeAccount(account);
  });

  app.patch("/api/clipping-accounts/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = updateClippingAccountSchema.parse(request.body);
    const account = await prisma.clippingAccount.update({ where: { id }, data: body });
    return serializeAccount(account);
  });

  app.delete("/api/clipping-accounts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    // Soft delete, matching InstagramAccount.active — never hard-delete a ClippingAccount
    // that Instagram accounts or past submissions may still reference.
    const account = await prisma.clippingAccount.update({ where: { id }, data: { active: false } });
    await activityLogService.log(`Deactivated CLIPPING account "${account.label}".`);
    reply.status(204).send();
  });

  app.get("/api/clipping-accounts/:id/status", async (request) => {
    const { id } = request.params as { id: string };
    const account = await prisma.clippingAccount.findUniqueOrThrow({ where: { id } });
    return serializeAccount(account);
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
    const account = await prisma.clippingAccount.findUniqueOrThrow({ where: { id } });

    if (clippingBrowserManager.isLoggingIn(id)) {
      reply.status(409).send({
        error: "login_in_progress",
        message: "A login is already in progress for this account.",
      });
      return;
    }

    clippingBrowserManager
      .loginHeaded(account)
      .then(async ({ email, displayName }) => {
        // Scraped straight from the session/page — not typed by hand. Only overwrites fields
        // we actually got a value for; a failed scrape never clobbers what's already saved.
        await prisma.clippingAccount.update({
          where: { id },
          data: {
            lastLoginAt: new Date(),
            ...(email ? { email } : {}),
            ...(displayName ? { label: displayName } : {}),
          },
        });
        await activityLogService.log(
          `CLIPPING account "${displayName ?? account.label}" connected${email ? ` (${email})` : ""}.`
        );
        await syncLinkedAccounts(account).catch(async (error) => {
          // Login itself already succeeded — a failed auto-sync here shouldn't look like a
          // failed login. Just log it; the manual sync-linked-accounts endpoint can retry.
          const message = error instanceof Error ? error.message : "Unknown error.";
          await activityLogService.log(`Auto-linking Instagram accounts for "${account.label}" failed: ${message}`, "error");
        });
      })
      .catch(async (error) => {
        const message = error instanceof ClippingApiError ? error.message : "Unknown login error.";
        await activityLogService.log(`CLIPPING login failed for "${account.label}": ${message}`, "error");
      });

    reply.status(202).send({
      message: "Opening a browser window on this machine — log in there to finish connecting this account.",
    });
  });

  // Re-reads the email + display name from the account's ALREADY-saved session — no headed
  // window, no fresh login, just loading a page in the existing storageState. Backfills
  // accounts connected before this existed, or any account whose identity is missing/stale.
  app.post("/api/clipping-accounts/:id/refresh-identity", async (request, reply) => {
    const { id } = request.params as { id: string };
    const account = await prisma.clippingAccount.findUniqueOrThrow({ where: { id } });

    const { email, displayName } = await clippingBrowserManager.getDecodedIdentity(account);
    if (!email && !displayName) {
      reply.status(200).send({ email: null, displayName: null, message: "No identity found in the current session." });
      return;
    }

    const updated = await prisma.clippingAccount.update({
      where: { id },
      data: { ...(email ? { email } : {}), ...(displayName ? { label: displayName } : {}) },
    });
    reply.status(200).send(serializeAccount(updated));
  });

  // Reads CLIPPING's linked-accounts list and auto-fills clippingAccountId/clippingAccountRefId
  // for any matching Instagram account that doesn't already have them set (see
  // syncLinkedAccounts above). Runs automatically right after login; this is for re-running it
  // later — e.g. after adding a new Instagram account to CLIPPING or to this app.
  app.post("/api/clipping-accounts/:id/sync-linked-accounts", async (request, reply) => {
    const { id } = request.params as { id: string };
    const account = await prisma.clippingAccount.findUniqueOrThrow({ where: { id } });
    const result = await syncLinkedAccounts(account);
    reply.status(200).send(result);
  });
}
