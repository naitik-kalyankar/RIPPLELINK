import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

export interface IntegrationStatus {
  mode: "live" | "mock";
  healthy: boolean;
  lastError: { message: string; at: string } | null;
  lastSuccessAt: string | null;
}

export interface IntegrationsStatusResponse {
  instagram: IntegrationStatus;
  clipping: IntegrationStatus & { campaignId: string | null };
  playwright: { installed: boolean };
}

export function useIntegrationsStatus() {
  return useQuery({
    queryKey: ["integrations-status"],
    queryFn: () => apiClient.get<IntegrationsStatusResponse>("/api/integrations/status"),
    refetchInterval: 30_000,
    retry: false,
  });
}

export interface Me {
  id: string;
  isAdmin: boolean;
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiClient.get<Me>("/api/me"),
    staleTime: 5 * 60_000,
  });
}
