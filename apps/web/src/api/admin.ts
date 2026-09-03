import { useQuery } from "@tanstack/react-query";
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

export function useAdminPayouts() {
  return useQuery({
    queryKey: ["admin", "payouts"],
    queryFn: () => apiClient.get<AdminPayoutsResponse>("/api/admin/payouts"),
    staleTime: 60_000,
  });
}
