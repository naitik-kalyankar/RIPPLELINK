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
}

export function useIntegrationsStatus() {
  return useQuery({
    queryKey: ["integrations-status"],
    queryFn: () => apiClient.get<IntegrationsStatusResponse>("/api/integrations/status"),
    refetchInterval: 30_000,
    retry: false,
  });
}
