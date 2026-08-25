import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateInstagramAccountInput,
  InstagramAccount,
  UpdateInstagramAccountInput,
} from "@kick-manager/shared";
import { apiClient } from "@/lib/apiClient";

export function useInstagramAccounts() {
  return useQuery({
    queryKey: ["instagram-accounts"],
    queryFn: () => apiClient.get<{ items: InstagramAccount[] }>("/api/instagram/accounts"),
  });
}

export function useCreateInstagramAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInstagramAccountInput) =>
      apiClient.post<InstagramAccount>("/api/instagram/accounts", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateInstagramAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateInstagramAccountInput }) =>
      apiClient.patch<InstagramAccount>(`/api/instagram/accounts/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["instagram-accounts"] }),
  });
}

export function useSyncInstagramAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<InstagramAccount>(`/api/instagram/accounts/${id}/sync`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["reels"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["creators"] });
    },
  });
}
