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
            ? "Instagram: no accounts with an access token yet"
            : ig.healthy
              ? `Instagram: connected — last fetch ${formatRelativeTime(ig.lastSuccessAt)}`
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
                ? `CLIPPING (${account.label}): not signed in — sign in on the Settings page.`
                : account.healthy
                  ? `CLIPPING (${account.label}): signed in — last used ${formatRelativeTime(account.lastUsedAt)}`
                  : `CLIPPING (${account.label}): ${account.lastError?.message ?? "no session cookie found — sign in again."}`
            }
          />
        ))
      ) : (
        <StatusDot
          label="Clip"
          color={clip.mode === "mock" ? "muted" : clip.healthy ? "success" : "destructive"}
          tooltip={
            clip.mode === "mock"
              ? "CLIPPING: no account connected yet"
              : clip.healthy
                ? `CLIPPING: connected — last request ${formatRelativeTime(clip.lastSuccessAt)}`
                : `CLIPPING: ${clip.lastError?.message ?? "unknown error"}`
          }
        />
      )}
    </div>
  );
}
