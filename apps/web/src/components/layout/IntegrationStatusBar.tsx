import { useIntegrationsStatus } from "@/api/integrations";
import { formatRelativeTime } from "@/lib/utils";
import { StatusDot } from "./StatusDot";

// Deliberately just these two — CLIPPING accounts each got their own dot here before, but
// that doesn't scale (a user can have a dozen accounts) and per-account health is already
// visible on the account rail's own avatars. This bar is a glance-level "is the app itself
// working" signal, not a full status board.
export function IntegrationStatusBar() {
  const { data, isError, isLoading } = useIntegrationsStatus();

  if (isLoading) {
    return <StatusDot label="API" color="muted" tooltip="Checking API status…" pulse />;
  }

  if (isError || !data) {
    return <StatusDot label="API" color="destructive" tooltip="Could not reach the RIPPLELINK API. Is the backend running?" />;
  }

  const ig = data.instagram;

  return (
    <div className="flex items-center gap-0.5 border-r border-border pr-3">
      <StatusDot label="API" color="success" tooltip="API reachable" />
      <StatusDot
        label="Instagram"
        color={ig.mode === "mock" ? "muted" : ig.healthy ? "success" : "destructive"}
        tooltip={
          ig.mode === "mock"
            ? "Instagram: no accounts with an access token yet"
            : ig.healthy
              ? `Instagram: connected — last fetch ${formatRelativeTime(ig.lastSuccessAt)}`
              : `Instagram: ${ig.lastError?.message ?? "unknown error"}`
        }
      />
    </div>
  );
}
