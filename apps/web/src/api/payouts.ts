import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreatePayoutSplitInput, UpdatePayoutSplitInput } from "@kick-manager/shared";
import { apiClient } from "@/lib/apiClient";

export interface PaymentEntry {
  cycleId: string;
  campaignId: string;
  campaignName: string;
  cycleLabel: string | null;
  bountyTag: string | null;
  amount: number;
  paidAt: string | null;
  finalizedAt: string | null;
  exportedAt: string | null;
  totalViews: number | null;
  totalClips: number | null;
  status: "paid" | "pending";
}

export interface PendingEstimateBreakdownEntry {
  bounty: string;
  views: number;
  rate: number;
  payout: number;
  minViewsRequired: number;
  minViewsReached: boolean;
}

export interface PendingEstimate {
  total: number;
  fetchedAt: string | null;
  breakdown: PendingEstimateBreakdownEntry[];
}

export interface PayoutPaymentMethod {
  type: "paypal" | "usdt" | "usdc" | string;
  value: string;
}

export interface PaymentsResponse {
  // Still-accruing, not yet finalized into a payout cycle — CLIPPING's campaign page. Often
  // the only real number available for a still-running cycle; null if nothing's been synced.
  pendingEstimate: PendingEstimate | null;
  // The one saved payment method actually used for payouts (determined from the most recently
  // paid cycle, or the single saved method if nothing's paid yet) — null if there's more than
  // one saved method and no paid history to disambiguate which is active.
  paymentMethod: PayoutPaymentMethod | null;
  // Finalized cycles (paid or awaiting payment) from CLIPPING's real payment ledger — can be
  // $0/empty for a while even with a healthy pendingEstimate, if Kick hasn't closed a cycle yet.
  paidTotal: number;
  pendingTotal: number;
  history: PaymentEntry[];
  // True when there was nothing real to show yet (no pendingEstimate AND no history) and this
  // is placeholder data instead — see routes/payouts.ts's generateMockPayments.
  mock: boolean;
}

export function useClippingPayments(clippingAccountId: string | null) {
  return useQuery({
    queryKey: ["clipping-accounts", clippingAccountId, "payments"],
    queryFn: () => apiClient.get<PaymentsResponse>(`/api/clipping-accounts/${clippingAccountId}/payments`),
    enabled: !!clippingAccountId,
    staleTime: 60_000,
  });
}

export interface SplitsSummaryEntry {
  name: string;
  pendingEstimate: number;
  paid: number;
  pending: number;
  total: number;
}

export function useSplitsSummary() {
  return useQuery({
    queryKey: ["payouts", "splits-summary"],
    queryFn: () => apiClient.get<{ items: SplitsSummaryEntry[] }>("/api/payouts/splits-summary"),
    staleTime: 60_000,
  });
}

export interface PayoutSplit {
  id: string;
  clippingAccountId: string;
  name: string;
  percentage: number;
  createdAt: string;
  updatedAt: string;
}

export function usePayoutSplits(clippingAccountId: string | null) {
  return useQuery({
    queryKey: ["clipping-accounts", clippingAccountId, "payout-splits"],
    queryFn: () => apiClient.get<{ items: PayoutSplit[] }>(`/api/clipping-accounts/${clippingAccountId}/payout-splits`),
    enabled: !!clippingAccountId,
  });
}

export function useCreatePayoutSplit(clippingAccountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePayoutSplitInput) =>
      apiClient.post<PayoutSplit>(`/api/clipping-accounts/${clippingAccountId}/payout-splits`, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["clipping-accounts", clippingAccountId, "payout-splits"] }),
  });
}

export function useUpdatePayoutSplit(clippingAccountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePayoutSplitInput }) =>
      apiClient.patch<PayoutSplit>(`/api/payout-splits/${id}`, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["clipping-accounts", clippingAccountId, "payout-splits"] }),
  });
}

export function useDeletePayoutSplit(clippingAccountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/payout-splits/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["clipping-accounts", clippingAccountId, "payout-splits"] }),
  });
}
