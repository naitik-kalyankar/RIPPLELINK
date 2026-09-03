import type { FastifyInstance } from "fastify";
import {
  linkReelSchema,
  updateClippingIdentitySchema,
  updateClippingBountiesSchema,
} from "@kick-manager/shared";
import { prisma } from "../lib/db.js";
import { syncService } from "../services/sync/SyncService.js";
import { submissionService } from "../services/submissions/SubmissionService.js";
import { hasRealClippingCredentials, env } from "../lib/env.js";
import { getClippingAccountHealth } from "../lib/integrationHealth.js";
import { activityLogService } from "../services/activity/ActivityLogService.js";
import {
  getActiveClippingIdentity,
  updateActiveClippingIdentity,
  clearActiveClippingIdentity,
} from "../lib/clippingIdentity.js";
import { clippingBrowserManager } from "../services/clipping/ClippingBrowserManager.js";
import { getCachedCampaignInfo } from "../lib/campaignInfoCache.js";
import { upsertBounties } from "../lib/bountySync.js";

export async function clippingRoutes(app: FastifyInstance) {
  app.get("/api/clipping/campaign", async (request) => {
    const info = await getCachedCampaignInfo(request.user.id);
    return { campaign: info };
  });

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
    const where = {
      userId: request.user.id,
      ...(ids ? { reel: { instagramAccountId: { in: ids } } } : {}),
    };

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

  app.get("/api/clipping/status", async (request) => {
    const userId = request.user.id;
    const [uploadedClips, lastLog, accounts] = await Promise.all([
      prisma.clippingSubmission.count({ where: { userId } }),
      prisma.activityLog.findFirst({
        where: { userId, message: { contains: "CLIPPING sync" } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.clippingAccount.findMany({ where: { active: true, userId }, orderBy: { label: "asc" } }),
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

  app.post("/api/clipping/identity", async (request, reply) => {
    const input = updateClippingIdentitySchema.parse(request.body);
    updateActiveClippingIdentity(input);
    reply.status(204).send();
  });

  app.post("/api/clipping/identity/clear", async (request, reply) => {
    const wasSet = getActiveClippingIdentity() !== null;
    clearActiveClippingIdentity();
    if (wasSet) {
      await activityLogService.log(request.user.id, "CLIPPING browser session ended (logged out or session cookie cleared).");
    }
    reply.status(204).send();
  });

  app.get("/api/clipping/active-identity", async () => {
    return { identity: getActiveClippingIdentity() };
  });

  app.post("/api/clipping/sync", async (request) => {
    return syncService.syncClipping(request.user.id);
  });

  app.post("/api/clipping/submit", async (request) => {
    const { reelId, ...rest } = request.body as { reelId: string } & Record<string, unknown>;
    const input = linkReelSchema.parse(rest);
    return submissionService.submitReel(request.user.id, reelId, input);
  });

  // A manual fallback — the primary source is now SyncService's automatic per-sync refresh
  // (see ClippingBrowserManager.fetchLiveCampaignInfo's bountyTags), which needs no browser
  // extension at all. Kept in case that live fetch is ever unavailable for an account. Upserts
  // by name so reporting the same list again just refreshes active/rate/lastSeenAt.
  app.post("/api/clipping/bounties", async (request, reply) => {
    const { bounties } = updateClippingBountiesSchema.parse(request.body);
    await upsertBounties(
      request.user.id,
      bounties.map((b) => ({ name: b.name, rate: b.rate ?? null, active: b.active }))
    );
    reply.status(204).send();
  });

  app.get("/api/clipping/bounties", async (request) => {
    const items = await prisma.clippingBounty.findMany({ where: { userId: request.user.id }, orderBy: { name: "asc" } });
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
