import { prisma } from "./db.js";
import { clippingBrowserManager, type ClippingCampaignInfo } from "../services/clipping/ClippingBrowserManager.js";

// Campaign cycle data (real startDate/days/minViews/videoStartDate, read off CLIPPING's own
// campaign API — see ClippingBrowserManager.getCampaignInfo) barely changes, so it's cached in
// memory rather than re-fetching on every dashboard load. Keyed by userId (even though each
// user is expected to run their own apps/api process) so this can never leak one user's
// campaign data to another if that assumption is ever wrong. Shared between routes/clipping.ts
// (the Payout Cycle widget) and routes/dashboard.ts ("Live" mode's current-cycle filtering) so
// there's exactly one cache/TTL to reason about, not two independently-drifting ones.
const campaignInfoCache = new Map<string, { info: ClippingCampaignInfo; fetchedAt: number }>();
const CAMPAIGN_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function getCachedCampaignInfo(userId: string): Promise<ClippingCampaignInfo | null> {
  const cached = campaignInfoCache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < CAMPAIGN_CACHE_TTL_MS) {
    return cached.info;
  }

  const accounts = await prisma.clippingAccount.findMany({ where: { active: true, userId } });
  for (const account of accounts) {
    try {
      const info = await clippingBrowserManager.getCampaignInfo(account);
      if (info) {
        campaignInfoCache.set(userId, { info, fetchedAt: Date.now() });
        return info;
      }
    } catch {
      // this account's session may not be logged in yet — try the next one
    }
  }
  return null;
}
