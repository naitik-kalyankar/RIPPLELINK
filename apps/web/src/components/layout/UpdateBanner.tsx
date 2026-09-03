import { useEffect, useState } from "react";
import { DownloadCloud, X } from "lucide-react";
import { getPlatform, isTauri } from "@/platform";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// Re-checking while the app stays open a long time catches a release that shipped after launch
// — most people don't quit/reopen a desktop app daily. Checking on mount alone would miss those
// until the next cold start.
const RECHECK_INTERVAL_MS = 60 * 60 * 1000;

type State =
  | { phase: "idle" }
  | { phase: "available"; version: string; notes: string | null }
  | { phase: "installing"; version: string; downloadedBytes: number; totalBytes: number | null };

/** Desktop-only — the browser build always updates itself on reload, so there's nothing for
 * this to show there (see platform/browser.ts's checkForUpdate). Fixed to the bottom of the
 * whole app so it stays visible across navigation, same placement idea as LinkingProgressBar. */
export function UpdateBanner() {
  const [state, setState] = useState<State>({ phase: "idle" });
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;
    const runCheck = async () => {
      try {
        const platform = await getPlatform();
        const result = await platform.checkForUpdate();
        if (cancelled || !result.available || !result.version) return;
        setState((current) =>
          current.phase === "idle" ? { phase: "available", version: result.version!, notes: result.notes } : current
        );
      } catch {
        // No network, GitHub unreachable, etc. — silently try again next interval rather than
        // surfacing a toast for something this routine.
      }
    };

    runCheck();
    const interval = setInterval(runCheck, RECHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (state.phase === "idle") return null;
  if (state.phase === "available" && state.version === dismissedVersion) return null;

  const install = async () => {
    if (state.phase !== "available") return;
    const { version, notes } = state;
    setState({ phase: "installing", version, downloadedBytes: 0, totalBytes: null });
    try {
      const platform = await getPlatform();
      await platform.installUpdateAndRelaunch((downloadedBytes, totalBytes) =>
        setState({ phase: "installing", version, downloadedBytes, totalBytes })
      );
      // installUpdateAndRelaunch relaunches the app on success — this line only runs if that
      // somehow didn't happen.
    } catch (error) {
      setState({ phase: "available", version, notes });
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Couldn't install the update.",
        variant: "destructive",
      });
    }
  };

  const installing = state.phase === "installing";
  const progressPct =
    installing && state.totalBytes ? Math.min(100, Math.round((state.downloadedBytes / state.totalBytes) * 100)) : null;

  return (
    <div className="fixed inset-x-0 bottom-3 z-[70] flex justify-center px-3">
      <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-primary/30 bg-card px-4 py-3 shadow-lg">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <DownloadCloud className={cn("h-4 w-4", installing && "animate-pulse")} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {installing ? `Installing update v${state.version}…` : `Update available — v${state.version}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {installing
              ? progressPct != null
                ? `${progressPct}% downloaded`
                : "Downloading…"
              : "Restarts the app once installed."}
          </p>
        </div>
        {!installing && (
          <>
            <Button size="sm" onClick={install}>
              Update &amp; Restart
            </Button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setDismissedVersion(state.phase === "available" ? state.version : null)}
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
