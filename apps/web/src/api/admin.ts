import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import type { PaymentEntry, PayoutPaymentMethod } from "@/api/payouts";

export interface AdminPayoutEntry {
  accountId: string;
  label: string;
  email: string | null;
  ownerId: string;
  ownerEmail: string | null;
  ownerDisplayName: string | null;
  pendingEstimate: number | null;
  paidTotal: number;
  pendingTotal: number;
  paymentMethod: PayoutPaymentMethod | null;
  history: PaymentEntry[];
  mock: boolean;
  // false when this came from a fresh live fetch; true when the live fetch failed and this is
  // the last successfully-fetched snapshot instead (see routes/admin.ts) — `fetchedAt` says how
  // old it is, `error` says why it couldn't refresh just now.
  stale: boolean;
  fetchedAt: string | null;
  error: string | null;
}

export interface AdminPayoutsResponse {
  items: AdminPayoutEntry[];
  totals: { pendingEstimate: number; paidTotal: number; pendingTotal: number };
}

// Cached-only — no Playwright involved, just whatever's already stored (see routes/admin.ts).
// Opening this page used to itself trigger a live fetch across EVERY active account at once
// (one Playwright context per account, all simultaneously), which is exactly what starved the
// shared database connection pool. Loading the page is now instant and free; useRefreshAdminPayouts
// below is the explicit "go get fresh numbers" action.
export function useAdminPayouts() {
  return useQuery({
    queryKey: ["admin", "payouts"],
    queryFn: () => apiClient.get<AdminPayoutsResponse>("/api/admin/payouts"),
    staleTime: 60_000,
  });
}

// The live fetch — same one this route always did, just moved behind an explicit action (the
// page's "Refresh" button) instead of running automatically on every load/revisit.
export function useRefreshAdminPayouts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.get<AdminPayoutsResponse>("/api/admin/payouts?refresh=true"),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin", "payouts"], data);
    },
  });
}
