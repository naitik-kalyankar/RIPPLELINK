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

/**
 * "clipping": ClippingSubmission.views — only as fresh as CLIPPING's own ~12hr refresh cycle.
 * "live": Reel.views — this app's own Instagram sync, which runs on demand/on a much tighter
 * cycle, so it reflects reality sooner. A submission with no linked Reel has no live figure to
 * fall back to and is excluded in "live" mode — same reasoning as the account-scoping
 * exclusion below, just for the views value instead of the account attribution.
 */
type ViewsSource = "live" | "clipping";

interface PayoutResult {
  estimatedPayout: number;
  /** Sum of views across only the submissions actually counted toward estimatedPayout above —
   * same qualifying set (has views, has a matching bounty rate, and clears the 1k-view floor
   * in "live" mode) — so this number always explains exactly what the payout was computed from. */
  qualifyingViews: number;
}

async function computeEstimatedPayout(instagramAccountIds?: string[], viewsSource: ViewsSource = "live"): Promise<PayoutResult> {
  const [submissions, bounties] = await Promise.all([
    prisma.clippingSubmission.findMany({
      select: { views: true, bountyTag: true, reel: { select: { views: true } } },
      // A submission with no linked Reel yet can't be attributed to any account, so it's
      // correctly excluded once scoped — the reel relation is the only link between a
      // submission and an Instagram account (campaignId is a loose, account-agnostic string).
      ...(instagramAccountIds ? { where: { reel: { instagramAccountId: { in: instagramAccountIds } } } } : {}),
    }),
    prisma.clippingBounty.findMany({ select: { name: true, rate: true } }),
  ]);

  const ratePer100kByBounty = new Map(
    bounties.map((bounty) => [bounty.name.toLowerCase(), parseRatePer100k(bounty.rate)])
  );

  const MIN_QUALIFYING_VIEWS = 1_000;

  let total = 0;
  let qualifyingViews = 0;
  for (const submission of submissions) {
    const views = viewsSource === "live" ? submission.reel?.views : submission.views;
    if (!views || !submission.bountyTag) continue;
    // CLIPPING's own view counts are treated as already qualified (they're the source of
    // truth CLIPPING pays against) — the threshold only applies to live Instagram views,
    // which can include reels that haven't cleared CLIPPING's own minimum yet.
    if (viewsSource === "live" && views < MIN_QUALIFYING_VIEWS) continue;
    const ratePer100k = ratePer100kByBounty.get(submission.bountyTag.toLowerCase());
    if (ratePer100k == null) continue;
    total += (views / 100_000) * ratePer100k;
    qualifyingViews += views;
  }
  return { estimatedPayout: Math.round(total * 100) / 100, qualifyingViews };
}

/**
 * "clipping" mode's real number: CLIPPING's own computed payout per login (ClippingAccount.
 * lastPayout, refreshed every sync — see SyncService.syncPayoutForAccount /
 * ClippingBrowserManager.getCampaignPageData), summed across whichever accounts are in scope.
 * This is what actually matches clipping.net's own numbers, since CLIPPING applies its real
 * 100k-view floor per bounty tag aggregated across all of that bounty's clips — a calculation
 * this app can't faithfully replicate locally (that's what computeEstimatedPayout above was
 * trying, and why it drifted from CLIPPING's real figure).
 */
async function computeClippingModePayout(instagramAccountIds?: string[]): Promise<PayoutResult> {
  let clippingAccountIds: string[] | undefined;
  if (instagramAccountIds) {
    const refs = await prisma.instagramAccount.findMany({
      where: { id: { in: instagramAccountIds } },
      select: { clippingAccountRefId: true },
    });
    clippingAccountIds = Array.from(
      new Set(refs.map((r) => r.clippingAccountRefId).filter((v): v is string => Boolean(v)))
    );
  }

  const accounts = await prisma.clippingAccount.findMany({
    where: { active: true, ...(clippingAccountIds ? { id: { in: clippingAccountIds } } : {}) },
    select: { lastPayout: true, lastPayoutBountyBreakdown: true },
  });

  let total = 0;
  let qualifyingViews = 0;
  for (const account of accounts) {
    total += account.lastPayout ?? 0;
    const breakdown = Array.isArray(account.lastPayoutBountyBreakdown)
      ? (account.lastPayoutBountyBreakdown as Array<{ views?: unknown }>)
      : [];
    for (const entry of breakdown) {
      if (typeof entry.views === "number") qualifyingViews += entry.views;
    }
  }
  return { estimatedPayout: Math.round(total * 100) / 100, qualifyingViews };
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/api/dashboard/stats", async (request): Promise<DashboardStats> => {
    const { instagramAccountIds: raw, viewsSource } = request.query as {
      instagramAccountIds?: string;
      viewsSource?: string;
    };
    const ids = raw ? raw.split(",").filter(Boolean) : undefined;
    const accountFilter = ids ? { instagramAccountId: { in: ids } } : {};
    const resolvedViewsSource: ViewsSource = viewsSource === "clipping" ? "clipping" : "live";

    const [totalReels, linked, creators, instagramAccounts, failedSubmissions, payout] = await Promise.all([
      prisma.reel.count({ where: accountFilter }),
      prisma.reel.count({ where: { ...accountFilter, clippingSubmission: { isNot: null } } }),
      ids
        ? prisma.creator.count({ where: { reels: { some: { instagramAccountId: { in: ids } } } } })
        : prisma.creator.count(),
      ids ? ids.length : prisma.instagramAccount.count(),
      prisma.reel.count({
        where: { ...accountFilter, clippingSubmission: { is: null }, submissionAttempts: { some: { status: "failed" } } },
      }),
      resolvedViewsSource === "live" ? computeEstimatedPayout(ids, "live") : computeClippingModePayout(ids),
    ]);

    return {
      totalReels,
      linked,
      unlinked: totalReels - linked,
      creators,
      instagramAccounts,
      failedSubmissions,
      estimatedPayout: payout.estimatedPayout,
      qualifyingViews: payout.qualifyingViews,
    };
  });

  app.get("/api/activity", async () => {
    const items = await activityLogService.recent(50);
    return { items };
  });
}
