import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BulkLinkInput, LinkReelInput, PaginatedResult, Reel } from "@kick-manager/shared";
import { apiClient } from "@/lib/apiClient";

export interface ReelsFilters {
  page?: number;
  limit?: number;
  status?: string;
  creatorId?: string;
  instagramAccountId?: string;
  dateRange?: string;
  search?: string;
  sort?: string;
}

function toQueryString(filters: ReelsFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "" && value !== "all") params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useReels(filters: ReelsFilters) {
  return useQuery({
    queryKey: ["reels", filters],
    queryFn: () => apiClient.get<PaginatedResult<Reel>>(`/api/reels${toQueryString(filters)}`),
    placeholderData: (prev) => prev,
  });
}

export function useReel(id: string | undefined) {
  return useQuery({
    queryKey: ["reels", id],
    queryFn: () => apiClient.get<Reel>(`/api/reels/${id}`),
    enabled: Boolean(id),
  });
}

// Shared mutationKey so the global bottom progress bar (see LinkingProgressBar) can tell this
// mutation is in flight without being tied to the LinkReelModal instance that fired it — the
// modal closes immediately on submit (see LinkReelModal) so that instance may already be unmounted.
export const LINK_REEL_MUTATION_KEY = ["link-reel"];

// Shares the ["link-reel"] prefix with LINK_REEL_MUTATION_KEY on purpose: useIsMutating's key
// matching is prefix-based, so LinkingProgressBar's single `useIsMutating({ mutationKey:
// LINK_REEL_MUTATION_KEY })` check picks up both single- and bulk-link submissions without
// having to watch two separate keys.
export const BULK_LINK_REELS_MUTATION_KEY = [...LINK_REEL_MUTATION_KEY, "bulk"];

export function useLinkReel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: LINK_REEL_MUTATION_KEY,
    mutationFn: ({ reelId, input }: { reelId: string; input: LinkReelInput }) =>
      apiClient.post<Reel>(`/api/reels/${reelId}/link`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reels"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export interface DetectReelCreatorResult {
  reel: Reel;
  suggestedBountyTag: string | null;
}

/** On-demand re-run of creator OCR detection for one Reel, e.g. from the Link modal when a
 * Reel came out of sync unassigned. Also returns a bounty tag suggestion (already corrected
 * against CLIPPING's real bounty list) so the caller can offer it immediately. */
export function useDetectReelCreator() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reelId: string) => apiClient.post<DetectReelCreatorResult>(`/api/reels/${reelId}/detect-creator`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reels"] });
    },
  });
}

export function useBulkLinkReels() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: BULK_LINK_REELS_MUTATION_KEY,
    mutationFn: (input: BulkLinkInput) =>
      apiClient.post<{ results: Array<{ reelId: string; success: boolean; error?: string }> }>(
        "/api/reels/bulk-link",
        input
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reels"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

