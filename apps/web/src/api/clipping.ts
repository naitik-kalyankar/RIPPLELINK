import { useQuery } from "@tanstack/react-query";
import type { ClippingBounty } from "@kick-manager/shared";
import { apiClient } from "@/lib/apiClient";

export interface ClippingStatus {
  connected: boolean;
  mode: "live" | "mock";
  campaignId: string | null;
  lastSyncAt: string | null;
  uploadedClips: number;
}

export function useClippingStatus() {
  return useQuery({
    queryKey: ["clipping-status"],
    queryFn: () => apiClient.get<ClippingStatus>("/api/clipping/status"),
  });
}

export interface ClippingCampaignInfo {
  startDate: string;
  /** Cycle length in days — the real end date is startDate + days; CLIPPING has no separate
   * end-date field. */
  days: number;
  minViews: number;
}

/** Real campaign cycle data read off CLIPPING's own campaign page (cached server-side, ~6hr) —
 * not a calendar-month guess. `campaign` is null if no connected CLIPPING account could be
 * reached to read it (e.g. nothing logged in yet), in which case callers should fall back to
 * an approximation rather than show nothing. */
export function useClippingCampaign() {
  return useQuery({
    queryKey: ["clipping-campaign"],
    queryFn: () => apiClient.get<{ campaign: ClippingCampaignInfo | null }>("/api/clipping/campaign"),
    staleTime: 30 * 60_000,
  });
}

const FALLBACK_CAMPAIGN_ID = "camp_kick_clipping";

/** The campaign is fixed to CLIPPING_CAMPAIGN_ID server-side (real in live mode) — there's
 * only ever one campaign this app submits to, so nothing should ask the user to enter it. */
export function useCampaignId(): string {
  const { data } = useClippingStatus();
  return data?.campaignId ?? FALLBACK_CAMPAIGN_ID;
}

/** Real bounty tags CLIPPING actually has, learned by the browser extension scraping the
 * campaign page — used for autocomplete so a manual bounty entry matches a real one instead
 * of relying purely on the server-side fuzzy correction. */
export function useClippingBounties() {
  return useQuery({
    queryKey: ["clipping-bounties"],
    queryFn: () => apiClient.get<{ items: ClippingBounty[] }>("/api/clipping/bounties"),
    staleTime: 60_000,
  });
}
