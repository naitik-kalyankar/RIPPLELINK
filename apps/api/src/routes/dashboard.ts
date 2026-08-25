import type { FastifyInstance } from "fastify";
import type { DashboardStats } from "@kick-manager/shared";
import { prisma } from "../lib/db.js";
import { activityLogService } from "../services/activity/ActivityLogService.js";

// Bounty rates are scraped from CLIPPING's campaign page as free text like "$5/100K" (see
// tools/clipping-cookie-sync-extension/content.js) — not a structured number, so this is the
// one place that format gets parsed back into a dollars-per-100k-views figure.
function parseRatePer100k(rate: string | null): number | null {
  if (!rate) return null;
  const match = rate.match(/\$\s*([\d.]+)\s*\/\s*100K/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

async function computeEstimatedPayout(): Promise<number> {
  const [submissions, bounties] = await Promise.all([
    prisma.clippingSubmission.findMany({ select: { views: true, bountyTag: true } }),
    prisma.clippingBounty.findMany({ select: { name: true, rate: true } }),
  ]);

  const ratePer100kByBounty = new Map(
    bounties.map((bounty) => [bounty.name.toLowerCase(), parseRatePer100k(bounty.rate)])
  );

  let total = 0;
  for (const submission of submissions) {
    if (!submission.views || !submission.bountyTag) continue;
    const ratePer100k = ratePer100kByBounty.get(submission.bountyTag.toLowerCase());
    if (ratePer100k == null) continue;
    total += (submission.views / 100_000) * ratePer100k;
  }
  return Math.round(total * 100) / 100;
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/api/dashboard/stats", async (): Promise<DashboardStats> => {
    const [totalReels, linked, creators, instagramAccounts, failedSubmissions, estimatedPayout] = await Promise.all([
      prisma.reel.count(),
      prisma.reel.count({ where: { clippingSubmission: { isNot: null } } }),
      prisma.creator.count(),
      prisma.instagramAccount.count(),
      prisma.reel.count({
        where: { clippingSubmission: { is: null }, submissionAttempts: { some: { status: "failed" } } },
      }),
      computeEstimatedPayout(),
    ]);

    return {
      totalReels,
      linked,
      unlinked: totalReels - linked,
      creators,
      instagramAccounts,
      failedSubmissions,
      estimatedPayout,
    };
  });

  app.get("/api/activity", async () => {
    const items = await activityLogService.recent(50);
    return { items };
  });
}
