import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClippingBounty, ClippingSubmission, PaginatedResult, SyncResult } from "@kick-manager/shared";
import { apiClient } from "@/lib/apiClient";

export interface ClippingStatus {
  connected: boolean;
  mode: "live" | "mock";
  campaignId: string | null;
  lastSyncAt: string | null;
  uploadedClips: number;
}

export function useClippingClips(page: number, limit = 20, instagramAccountIds?: string[] | null) {
  return useQuery({
    queryKey: ["clipping-clips", page, limit, instagramAccountIds ?? "all"],
    queryFn: () =>
      apiClient.get<PaginatedResult<ClippingSubmission>>(
        `/api/clipping/clips?page=${page}&limit=${limit}${
          instagramAccountIds ? `&instagramAccountIds=${instagramAccountIds.join(",")}` : ""
        }`
      ),
    placeholderData: (prev) => prev,
  });
}

export function useClippingStatus() {
  return useQuery({
    queryKey: ["clipping-status"],
    queryFn: () => apiClient.get<ClippingStatus>("/api/clipping/status"),
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

export function useSyncClipping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<SyncResult>("/api/clipping/sync"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clipping-clips"] });
      queryClient.invalidateQueries({ queryKey: ["clipping-status"] });
      queryClient.invalidateQueries({ queryKey: ["reels"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}
