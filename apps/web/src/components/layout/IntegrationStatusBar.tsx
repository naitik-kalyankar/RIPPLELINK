import { useIntegrationsStatus } from "@/api/integrations";
import { useClippingAccounts } from "@/api/clippingAccounts";
import { formatRelativeTime } from "@/lib/utils";
import { StatusDot } from "./StatusDot";

export function IntegrationStatusBar() {
  const { data, isError, isLoading } = useIntegrationsStatus();
  const { data: clippingAccounts } = useClippingAccounts();

  if (isLoading) {
    return <StatusDot label="API" color="muted" tooltip="Checking API status…" pulse />;
  }

  if (isError || !data) {
    return <StatusDot label="API" color="destructive" tooltip="Could not reach the Reel Manager API. Is the backend running?" />;
  }

  const ig = data.instagram;
  const clip = data.clipping;

  return (
    <div className="flex items-center gap-0.5 border-r border-border pr-3">
      <StatusDot label="API" color="success" tooltip="API reachable" />
      <StatusDot
        label="IG"
        color={ig.mode === "mock" ? "muted" : ig.healthy ? "success" : "destructive"}
        tooltip={
          ig.mode === "mock"
            ? "Instagram: mock mode (no INSTAGRAM_API_KEY configured)"
            : ig.healthy
              ? `Instagram: connected — last successful fetch ${formatRelativeTime(ig.lastSuccessAt)}`
              : `Instagram: ${ig.lastError?.message ?? "unknown error"}`
        }
      />
      {clippingAccounts?.items.length ? (
        clippingAccounts.items.map((account) => (
          <StatusDot
            key={account.id}
            label={account.label}
            color={!account.hasStorageState ? "muted" : account.healthy ? "success" : "destructive"}
            tooltip={
              !account.hasStorageState
                ? `CLIPPING (${account.label}): not logged in yet — run the clipping:login script.`
                : account.healthy
                  ? `CLIPPING (${account.label}): connected — last used ${formatRelativeTime(account.lastUsedAt)}`
                  : `CLIPPING (${account.label}): ${account.lastError?.message ?? "unknown error"}`
            }
          />
        ))
      ) : (
        <StatusDot
          label="Clip"
          color={clip.mode === "mock" ? "muted" : clip.healthy ? "success" : "destructive"}
          tooltip={
            clip.mode === "mock"
              ? "CLIPPING: mock mode (no CLIPPING_SESSION_COOKIE configured)"
              : clip.healthy
                ? `CLIPPING: connected — last successful request ${formatRelativeTime(clip.lastSuccessAt)}`
                : `CLIPPING: ${clip.lastError?.message ?? "unknown error"}`
          }
        />
      )}
    </div>
  );
}
