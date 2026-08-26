import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateClippingAccountInput, UpdateClippingAccountInput } from "@kick-manager/shared";
import { apiClient } from "@/lib/apiClient";

// Server response shape from routes/clippingAccounts.ts's serializeAccount — deliberately
// distinct from the shared ClippingAccount type, which omits health/session fields that only
// make sense as a server-computed status snapshot.
export interface ClippingAccountStatus {
  id: string;
  label: string;
  email: string | null;
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
  createdAt: string;
  updatedAt: string;
}

export function useClippingAccounts() {
  return useQuery({
    queryKey: ["clipping-accounts"],
    queryFn: () => apiClient.get<{ items: ClippingAccountStatus[] }>("/api/clipping-accounts"),
    // Poll while any account has a headed login in flight (up to 10 min) so the "Log in"
    // button's status reflects it finishing without the user having to manually refresh.
    refetchInterval: (query) => (query.state.data?.items.some((a) => a.loginInProgress) ? 3_000 : false),
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
