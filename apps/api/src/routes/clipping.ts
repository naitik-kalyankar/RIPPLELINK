import type { FastifyInstance } from "fastify";
import {
  linkReelSchema,
  updateClippingSessionCookieSchema,
  updateClippingIdentitySchema,
  updateClippingBountiesSchema,
} from "@kick-manager/shared";
import { prisma } from "../lib/db.js";
import { syncService } from "../services/sync/SyncService.js";
import { submissionService } from "../services/submissions/SubmissionService.js";
import { hasRealClippingCredentials, env } from "../lib/env.js";
import { updateEnvVar } from "../lib/envWriter.js";
import { getClippingAccountHealth } from "../lib/integrationHealth.js";
import { activityLogService } from "../services/activity/ActivityLogService.js";
import {
  getActiveClippingIdentity,
  updateActiveClippingIdentity,
  clearActiveClippingIdentity,
} from "../lib/clippingIdentity.js";

export async function clippingRoutes(app: FastifyInstance) {
  app.get("/api/clipping/clips", async (request) => {
    const { page = "1", limit = "20", instagramAccountIds } = request.query as {
      page?: string;
      limit?: string;
      instagramAccountIds?: string;
    };
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const ids = instagramAccountIds ? instagramAccountIds.split(",").filter(Boolean) : undefined;
    // Same tradeoff as the dashboard payout calc: a submission with no linked Reel yet can't
    // be attributed to any account, so it's excluded once scoped rather than shown anyway.
    const where = ids ? { reel: { instagramAccountId: { in: ids } } } : {};

    const [total, items] = await Promise.all([
      prisma.clippingSubmission.count({ where }),
      prisma.clippingSubmission.findMany({
        where,
        orderBy: { dateAdded: "desc" },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limitNum));
    return { items, page: pageNum, limit: limitNum, total, totalPages, hasNext: pageNum < totalPages };
  });

  app.get("/api/clipping/status", async () => {
    const [uploadedClips, lastLog, accounts] = await Promise.all([
      prisma.clippingSubmission.count(),
      prisma.activityLog.findFirst({
        where: { message: { contains: "CLIPPING sync" } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.clippingAccount.findMany({ where: { active: true }, orderBy: { label: "asc" } }),
    ]);
    const live = hasRealClippingCredentials();
    return {
      connected: live,
      mode: live ? "live" : "mock",
      campaignId: env.clipping.campaignId ?? null,
      lastSyncAt: lastLog?.createdAt.toISOString() ?? null,
      uploadedClips,
      // Populated once real ClippingAccount rows exist (multi-account/Playwright path);
      // empty for a legacy/single-account install — the top-level fields above keep
      // reflecting the legacy singleton either way, so existing consumers need no changes.
      perAccount: accounts.map((account) => {
        const health = getClippingAccountHealth(account.id);
        return {
          id: account.id,
          label: account.label,
          mode: "live" as const,
          campaignId: account.campaignId,
          healthy: health.lastError === null,
          lastError: health.lastError,
          lastSuccessAt: health.lastSuccessAt,
          lastUsedAt: account.lastUsedAt?.toISOString() ?? null,
          lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
        };
      }),
    };
  });

  // Used by the local cookie-sync browser extension (tools/clipping-cookie-sync-extension)
  // so CLIPPING_SESSION_COOKIE never has to be copy-pasted by hand. Takes effect immediately
  // (env.clipping.sessionCookie is mutated in place) and is persisted to .env so it survives
  // a restart too. Intentionally unauthenticated — this app has no auth system anywhere and
  // only ever listens on localhost; do not deploy this endpoint anywhere reachable remotely.
  app.post("/api/clipping/session-cookie", async (request, reply) => {
    const { cookie, identity } = updateClippingSessionCookieSchema.parse(request.body);
    env.clipping.sessionCookie = cookie;
    updateEnvVar("CLIPPING_SESSION_COOKIE", cookie);

    const previousIdentity = getActiveClippingIdentity();
    if (identity) {
      updateActiveClippingIdentity(identity);
      if (previousIdentity?.userId !== identity.userId) {
        await activityLogService.log(
          `CLIPPING browser session is now ${identity.email ?? identity.userId} (via extension).`
        );
      }
    } else {
      await activityLogService.log("CLIPPING session cookie updated automatically from browser extension.");
    }

    reply.status(204).send();
  });

  app.post("/api/clipping/identity", async (request, reply) => {
    const input = updateClippingIdentitySchema.parse(request.body);
    updateActiveClippingIdentity(input);
    reply.status(204).send();
  });

  app.post("/api/clipping/identity/clear", async (_request, reply) => {
    const wasSet = getActiveClippingIdentity() !== null;
    clearActiveClippingIdentity();
    if (wasSet) {
      await activityLogService.log("CLIPPING browser session ended (logged out or session cookie cleared).");
    }
    reply.status(204).send();
  });

  app.get("/api/clipping/active-identity", async () => {
    return { identity: getActiveClippingIdentity() };
  });

  app.post("/api/clipping/sync", async () => {
    return syncService.syncClipping();
  });

  app.post("/api/clipping/submit", async (request) => {
    const { reelId, ...rest } = request.body as { reelId: string } & Record<string, unknown>;
    const input = linkReelSchema.parse(rest);
    return submissionService.submitReel(reelId, input);
  });

  // Reported by the browser extension scraping CLIPPING's own campaign page (no API exposes
  // this) — the source of truth BountyMatchingService corrects OCR'd creator identifiers
  // against before submitting. Upserts by name so re-scraping the same page just refreshes
  // active/rate/lastSeenAt rather than duplicating rows.
  app.post("/api/clipping/bounties", async (request, reply) => {
    const { bounties } = updateClippingBountiesSchema.parse(request.body);
    await Promise.all(
      bounties.map((bounty) =>
        prisma.clippingBounty.upsert({
          where: { name: bounty.name },
          create: { name: bounty.name, active: bounty.active, rate: bounty.rate ?? null },
          update: { active: bounty.active, rate: bounty.rate ?? null, lastSeenAt: new Date() },
        })
      )
    );
    reply.status(204).send();
  });

  app.get("/api/clipping/bounties", async () => {
    const items = await prisma.clippingBounty.findMany({ orderBy: { name: "asc" } });
    return {
      items: items.map((b) => ({
        id: b.id,
        name: b.name,
        active: b.active,
        rate: b.rate,
        lastSeenAt: b.lastSeenAt.toISOString(),
      })),
    };
  });
}
