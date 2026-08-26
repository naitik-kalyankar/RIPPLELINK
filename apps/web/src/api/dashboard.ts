import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ActivityLogEntry, DashboardStats, SyncResult } from "@kick-manager/shared";
import { apiClient } from "@/lib/apiClient";

export type ViewsSource = "live" | "clipping";

export function useDashboardStats(instagramAccountIds?: string[] | null, viewsSource: ViewsSource = "live") {
  return useQuery({
    queryKey: ["dashboard", "stats", instagramAccountIds ?? "all", viewsSource],
    queryFn: () => {
      const params = new URLSearchParams({ viewsSource });
      if (instagramAccountIds) params.set("instagramAccountIds", instagramAccountIds.join(","));
      return apiClient.get<DashboardStats>(`/api/dashboard/stats?${params.toString()}`);
    },
  });
}

export function useActivityLog() {
  return useQuery({
    queryKey: ["activity"],
    queryFn: () => apiClient.get<{ items: ActivityLogEntry[] }>("/api/activity"),
    refetchInterval: 15_000,
  });
}

export const SYNC_ALL_MUTATION_KEY = ["sync-all"];

export function useSyncAll() {
  const queryClient = useQueryClient();
  return useMutation({
    // A shared mutationKey (rather than relying on this hook's own local isPending) is what
    // makes the "is a sync running" status correct regardless of which component instance
    // actually fired it — React 18 StrictMode (dev only) mounts/discards an extra component
    // instance, so the instance that calls .mutate() isn't guaranteed to be the one still
    // rendering afterward. Without a shared key, its local isPending can get stuck true on a
    // now-discarded instance while the visible one never flips its own state. useIsMutating
    // with this same key (used in Topbar) reads real cross-instance status instead.
    mutationKey: SYNC_ALL_MUTATION_KEY,
    mutationFn: () => apiClient.post<SyncResult>("/api/sync/all"),
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}
