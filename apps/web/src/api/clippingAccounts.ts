import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateClippingAccountInput, UpdateClippingAccountInput } from "@kick-manager/shared";
import { apiClient } from "@/lib/apiClient";

// Server response shape from routes/clippingAccounts.ts's serializeAccount — deliberately
// distinct from the shared ClippingAccount type, which omits health/session fields that only
// make sense as a server-computed status snapshot.
export interface ClippingAccountBountyBreakdownEntry {
  bounty: string;
  views: number;
  rate: number;
  payout: number;
  minViewsRequired: number;
  minViewsReached: boolean;
}

export interface ClippingAccountStatus {
  id: string;
  label: string;
  email: string | null;
  avatarUrl: string | null;
  apiUrl: string;
  campaignId: string;
  active: boolean;
  lastUsedAt: string | null;
  lastLoginAt: string | null;
  hasStorageState: boolean;
  healthy: boolean;
  lastError: { message: string; at: string } | null;
  loginInProgress: boolean;
  lastLoginError: string | null;
  openInProgress: boolean;
  lastOpenError: string | null;
  // CLIPPING's own computed payout for this login, refreshed every sync — null until the
  // first sync after connecting. See routes/clippingAccounts.ts's serializeAccount.
  lastPayout: number | null;
  lastPayoutBountyBreakdown: ClippingAccountBountyBreakdownEntry[];
  lastPayoutFetchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useClippingAccounts() {
  return useQuery({
    queryKey: ["clipping-accounts"],
    queryFn: () => apiClient.get<{ items: ClippingAccountStatus[] }>("/api/clipping-accounts"),
    // Always poll so the status dot reflects live health (a session can die server-side any
    // time, not just right after a login/sync click) — faster while a headed login or open
    // window is in flight so that finishing/closing shows up quickly too.
    refetchInterval: (query) =>
      query.state.data?.items.some((a) => a.loginInProgress || a.openInProgress) ? 3_000 : 15_000,
  });
}

export function useCreateClippingAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClippingAccountInput) =>
      apiClient.post<ClippingAccountStatus>("/api/clipping-accounts", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clipping-accounts"] }),
  });
}

export function useUpdateClippingAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateClippingAccountInput }) =>
      apiClient.patch<ClippingAccountStatus>(`/api/clipping-accounts/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clipping-accounts"] }),
  });
}

export function useDeactivateClippingAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/clipping-accounts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clipping-accounts"] }),
  });
}

export function useLoginClippingAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<{ message: string }>(`/api/clipping-accounts/${id}/login`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clipping-accounts"] }),
  });
}

// Adding a brand new account: no row exists until sign-in actually succeeds — see
// routes/clippingAccounts.ts's /login-new. `id` here is a pending-attempt id, not an account
// id, until the status poll below reports back a real `account`.
export function useLoginNewClippingAccount() {
  return useMutation({
    mutationFn: (campaignId: string) =>
      apiClient.post<{ id: string; message: string }>("/api/clipping-accounts/login-new", { campaignId }),
  });
}

export interface LoginNewStatus {
  inProgress: boolean;
  error: string | null;
  account: ClippingAccountStatus | null;
}

export function useLoginNewStatus(pendingId: string | null) {
  return useQuery({
    queryKey: ["clipping-accounts", "login-new", pendingId],
    queryFn: () => apiClient.get<LoginNewStatus>(`/api/clipping-accounts/login-new/${pendingId}/status`),
    enabled: !!pendingId,
    refetchInterval: (query) => (query.state.data?.inProgress === false ? false : 2_000),
  });
}

export function useOpenClippingAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<{ message: string }>(`/api/clipping-accounts/${id}/open`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clipping-accounts"] }),
  });
}

export interface ClippingLinkedAccountView {
  id: string;
  username: string;
  instagramUserId: string | null;
  platform: string;
  localAccountId: string | null;
}

export function useClippingLinkedAccounts(clippingAccountId: string | null) {
  return useQuery({
    queryKey: ["clipping-accounts", clippingAccountId, "linked-accounts"],
    queryFn: () =>
      apiClient.get<{ items: ClippingLinkedAccountView[] }>(`/api/clipping-accounts/${clippingAccountId}/linked-accounts`),
    enabled: !!clippingAccountId,
    staleTime: 60_000,
  });
}

export interface SyncLinkedAccountsResult {
  items: Array<{ username: string; matched: boolean; updated: boolean; mismatch?: { stored: string; actual: string } }>;
  matchedCount: number;
  updatedCount: number;
}

export function useSyncLinkedClippingAccounts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<SyncLinkedAccountsResult>(`/api/clipping-accounts/${id}/sync-linked-accounts`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["clipping-accounts"] });
    },
  });
}
