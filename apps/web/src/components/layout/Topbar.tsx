import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useIsMutating } from "@tanstack/react-query";
import { Menu, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useSyncAll, SYNC_ALL_MUTATION_KEY } from "@/api/dashboard";
import { IntegrationStatusBar } from "./IntegrationStatusBar";
import { NAV_ITEMS } from "./nav-items";

// Module-level, not component state: React 18 StrictMode (dev only) deliberately mounts
// every component twice, which would defeat a useRef-based "only once" guard and fire two
// concurrent syncs that race each other in the database. This flag lives for the page's
// whole lifetime instead, so it actually means "once per real browser load."
let hasSyncedOnLoad = false;

interface TopbarProps {
  onOpenMobileNav: () => void;
}

export function Topbar({ onOpenMobileNav }: TopbarProps) {
  const syncAll = useSyncAll();
  const { toast } = useToast();
  const location = useLocation();
  // Cross-instance sync status (see SYNC_ALL_MUTATION_KEY) — not syncAll.isPending, which is
  // local to this component instance and can get stuck if StrictMode discards the instance
  // that actually fired the request.
  const isSyncing = useIsMutating({ mutationKey: SYNC_ALL_MUTATION_KEY }) > 0;

  const currentPage = NAV_ITEMS.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
  );

  const handleSync = () => {
    syncAll.mutate(undefined, {
      onSuccess: (result) => {
        const parts = [`${result.instagramReelsUpserted} new Reel(s)`, `${result.newlyLinked} newly linked`];
        if (result.newlyUnlinked > 0) parts.push(`${result.newlyUnlinked} unlinked (removed on CLIPPING)`);
        toast({
          title: "Sync complete",
          description: `${parts.join(", ")}.`,
          variant: "success",
        });
      },
      onError: (error) => {
        toast({ title: "Sync failed", description: error.message, variant: "destructive" });
      },
    });
  };

  // Runs once per real browser page load — Topbar only mounts once since AppShell wraps every
  // route via <Outlet>, so this doesn't refire on in-app navigation between pages, only on an
  // actual refresh. Keeps the dashboard current without waiting on a manual sync click.
  useEffect(() => {
    if (hasSyncedOnLoad) return;
    hasSyncedOnLoad = true;
    handleSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <header className="flex shrink-0 flex-col gap-2.5 rounded-2xl border border-border bg-card/60 px-4 py-3 shadow-sm backdrop-blur-xl sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6 sm:py-0">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="-ml-1.5 shrink-0 md:hidden"
          onClick={onOpenMobileNav}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h2 className="truncate text-sm font-semibold text-foreground sm:text-base">
          {currentPage?.label ?? "Reel Manager"}
        </h2>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end sm:gap-3">
        <IntegrationStatusBar />
        <Button size="sm" className="rounded-lg px-3.5" onClick={handleSync} disabled={isSyncing}>
          <RefreshCw className={isSyncing ? "animate-spin" : ""} />
          <span className="hidden sm:inline">{isSyncing ? "Syncing…" : "Sync Everything"}</span>
          <span className="sm:hidden">{isSyncing ? "Syncing…" : "Sync"}</span>
        </Button>
      </div>
    </header>
  );
}
