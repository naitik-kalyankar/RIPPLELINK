import { useCallback, useEffect, useRef, useState } from "react";
import { Check, DownloadCloud, Loader2, RefreshCw, X } from "lucide-react";
import { getPlatform, isTauri } from "@/platform";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// Re-checking while the app stays open a long time catches a release that shipped after launch
// — most people don't quit/reopen a desktop app daily. Checking on mount alone would miss those
// until the next cold start.
const RECHECK_INTERVAL_MS = 60 * 60 * 1000;
// How long the "You're up to date" confirmation stays up after a manual check finds nothing —
// long enough to read, short enough not to linger as stale-looking state.
const UP_TO_DATE_FLASH_MS = 2500;

type State =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "up-to-date" }
  | { phase: "available"; version: string; notes: string | null }
  | { phase: "installing"; version: string; downloadedBytes: number; totalBytes: number | null };

/** Desktop-only, docked in the main Sidebar directly above LinkQueuePanel — was previously a
 * floating banner fixed to the bottom of the whole window. That placement fought with
 * LinkingProgressBar for the same corner and had no manual "check now" affordance, just the
 * silent hourly background check. Folding it into the sidebar gives it a permanent, always-
 * reachable home (the "menu" for checking updates) and matches LinkQueuePanel's own icon-rail
 * (below xl) vs. full-card (xl+) responsive pattern one row above it, so the two sit flush
 * together at every width instead of one being sidebar-shaped and the other floating loose.
 * The browser build always updates itself on reload, so there's nothing for this to show there
 * (see platform/browser.ts's checkForUpdate) — isTauri() gates the whole component to null. */
export function UpdateButton({ alwaysExpanded = false }: { alwaysExpanded?: boolean }) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const { toast } = useToast();
  const upToDateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runCheck = useCallback(
    async (manual: boolean) => {
      // A manual click while a check/install is already in flight would just race it — the
      // silent background interval calling in is fine to skip outright for the same reason.
      setState((current) => {
        if (current.phase === "checking" || current.phase === "installing") return current;
        if (current.phase === "available" && !manual) return current;
        return manual ? { phase: "checking" } : current;
      });
      try {
        const platform = await getPlatform();
        const result = await platform.checkForUpdate();
        if (result.available && result.version) {
          setDismissedVersion(null);
          setState({ phase: "available", version: result.version, notes: result.notes });
          return;
        }
        if (manual) {
          setState({ phase: "up-to-date" });
          if (upToDateTimer.current) clearTimeout(upToDateTimer.current);
          upToDateTimer.current = setTimeout(() => setState((c) => (c.phase === "up-to-date" ? { phase: "idle" } : c)), UP_TO_DATE_FLASH_MS);
        } else {
          setState((current) => (current.phase === "checking" ? { phase: "idle" } : current));
        }
      } catch (error) {
        setState((current) => (current.phase === "checking" ? { phase: "idle" } : current));
        if (manual) {
          toast({
            title: "Couldn't check for updates",
            description: error instanceof Error ? error.message : "No network, or GitHub is unreachable.",
            variant: "destructive",
          });
        }
        // Silent background failure otherwise — no network, GitHub unreachable, etc. is routine
        // enough not to interrupt with a toast; the next hourly interval just tries again.
      }
    },
    [toast]
  );

  useEffect(() => {
    if (!isTauri()) return;
    runCheck(false);
    const interval = setInterval(() => runCheck(false), RECHECK_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      if (upToDateTimer.current) clearTimeout(upToDateTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isTauri()) return null;
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
  const checking = state.phase === "checking";
  const progressPct =
    installing && state.totalBytes ? Math.min(100, Math.round((state.downloadedBytes / state.totalBytes) * 100)) : null;

  // Idle / checking / just-confirmed-current — the actual "menu" entry: a plain button matching
  // LinkAllStarter's own idle-state shape one row below, so the two read as one consistent list
  // rather than two different UI languages stacked on top of each other.
  if (state.phase === "idle" || checking || state.phase === "up-to-date") {
    return (
      <div className="border-t border-border/70 p-2.5">
        <button
          type="button"
          disabled={checking}
          title="Check for Updates"
          onClick={() => runCheck(true)}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground disabled:cursor-wait disabled:opacity-70",
            alwaysExpanded ? "justify-start" : "xl:justify-start"
          )}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            {checking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : state.phase === "up-to-date" ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </span>
          <span className={cn("min-w-0 flex-1 truncate text-left font-medium", alwaysExpanded ? "inline" : "hidden xl:inline")}>
            {checking ? "Checking for updates…" : state.phase === "up-to-date" ? "You're up to date" : "Check for Updates"}
          </span>
        </button>
      </div>
    );
  }

  // Available / installing — same color-coded-card shape LinkQueuePanel uses one row below,
  // collapsing to a single icon button on the icon rail (below xl) the same way. MobileNav's
  // drawer passes alwaysExpanded since it's a fixed-width panel that's only ever mounted below
  // the md breakpoint — Tailwind's xl: variant is viewport-width-based, so left alone it'd read
  // that narrow-viewport context as "collapsed" even though the drawer itself has plenty of
  // room and wants the full card, same as NavList's own alwaysExpanded handling.
  return (
    <div className="border-t border-border/70 p-2.5">
      <button
        type="button"
        onClick={() => !installing && setState({ phase: "available", version: state.version, notes: state.phase === "available" ? state.notes : null })}
        title={installing ? `Installing v${state.version}…` : `Update available — v${state.version}`}
        className={cn(
          "w-full items-center justify-center rounded-xl border border-primary/30 bg-primary/10 p-2.5 text-primary transition-colors hover:brightness-110",
          alwaysExpanded ? "hidden" : "flex xl:hidden"
        )}
      >
        <DownloadCloud className={cn("h-4 w-4", installing && "animate-pulse")} aria-hidden="true" />
      </button>

      <div className={cn("rounded-xl border border-primary/30 bg-primary/10 p-3", alwaysExpanded ? "block" : "hidden xl:block")}>
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
            <DownloadCloud className={cn("h-3.5 w-3.5", installing && "animate-pulse")} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {installing ? `Installing v${state.version}…` : `Update available — v${state.version}`}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {installing ? (progressPct != null ? `${progressPct}% downloaded` : "Downloading…") : "Restarts the app once installed."}
            </p>
          </div>
          {!installing && (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setDismissedVersion(state.version)}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {installing && progressPct != null && (
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-background/60">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${progressPct}%` }} />
          </div>
        )}
        {!installing && (
          <Button size="sm" className="mt-2.5 w-full" onClick={install}>
            Update &amp; Restart
          </Button>
        )}
      </div>
    </div>
  );
}
