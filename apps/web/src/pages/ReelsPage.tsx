import { useState } from "react";
import { LayoutGrid, List as ListIcon, Link2 } from "lucide-react";
import type { Reel } from "@kick-manager/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useBulkLinkReels, useReels, type ReelsFilters } from "@/api/reels";
import { useCampaignId } from "@/api/clipping";
import { useClippingScope } from "@/lib/clippingScope";
import { ReelCard } from "@/components/reels/ReelCard";
import { ReelFilters } from "@/components/reels/ReelFilters";
import { LinkReelModal } from "@/components/reels/LinkReelModal";
import { ReelPreviewModal } from "@/components/reels/ReelPreviewModal";
import { cn } from "@/lib/utils";

export function ReelsPage() {
  const [filters, setFilters] = useState<ReelsFilters>({ page: 1, limit: 24, sort: "newest" });
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [linkTarget, setLinkTarget] = useState<Reel | null>(null);
  const [previewTarget, setPreviewTarget] = useState<Reel | null>(null);

  const { selectedAccount, scopedInstagramAccountIds } = useClippingScope();
  // The page's own "Instagram account" filter always wins when set — the broader CLIPPING
  // scope only fills in when the user hasn't picked one specific account here.
  const effectiveFilters: ReelsFilters = {
    ...filters,
    instagramAccountId: filters.instagramAccountId ?? scopedInstagramAccountIds?.join(","),
  };
  const { data, isLoading } = useReels(effectiveFilters);
  const bulkLink = useBulkLinkReels();
  const campaignId = useCampaignId();
  const { toast } = useToast();

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkLink = () => {
    const reelIds = Array.from(selected);
    bulkLink.mutate(
      { reelIds, campaignId },
      {
        onSuccess: (result) => {
          const successCount = result.results.filter((r) => r.success).length;
          toast({
            title: `${successCount} of ${reelIds.length} Reels linked`,
            description: successCount < reelIds.length ? "Some submissions failed — check details and retry." : undefined,
            variant: successCount === reelIds.length ? "success" : "default",
          });
          setSelected(new Set());
        },
      }
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Reels{selectedAccount ? <span className="text-muted-foreground"> — {selectedAccount.label}</span> : null}
      </h1>

      {/* Docks directly under the sticky Topbar (see AppShell's --topbar-h) so filters/sort and
       * the view toggle stay reachable while scrolling a long Reel grid, instead of scrolling
       * away with the rest of the page. */}
      <div
        className="sticky z-40 flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
        style={{ top: "calc(var(--topbar-h, 4rem) + 0.75rem)" }}
      >
        <ReelFilters filters={filters} onChange={setFilters} />
        <div className="flex shrink-0 items-center gap-1 self-end rounded-md border border-border p-0.5 sm:self-auto">
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setView("grid")}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setView("list")}
            aria-label="List view"
          >
            <ListIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-primary/30 bg-primary/10 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button size="sm" className="min-w-0 flex-1 sm:flex-none" onClick={handleBulkLink} disabled={bulkLink.isPending}>
              <Link2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{bulkLink.isPending ? "Linking…" : `Link ${selected.size} Reels to CLIPPING`}</span>
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className={cn("grid gap-3 sm:gap-4", "grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5")}>
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[9/16] w-full" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <div
          className={cn(
            "grid gap-3 sm:gap-4",
            view === "grid" ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" : "grid-cols-1 sm:grid-cols-2"
          )}
        >
          {data.items.map((reel) => (
            <ReelCard
              key={reel.id}
              reel={reel}
              selected={selected.has(reel.id)}
              onToggleSelect={toggleSelect}
              onOpenPreview={setPreviewTarget}
              onLink={setLinkTarget}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-24 text-center">
          <p className="text-sm font-medium">No Reels match these filters</p>
          <p className="text-sm text-muted-foreground">Try adjusting filters or sync your Instagram accounts.</p>
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.page <= 1}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!data.hasNext}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
          >
            Next
          </Button>
        </div>
      )}

      <LinkReelModal reel={linkTarget} onOpenChange={(open) => !open && setLinkTarget(null)} />
      <ReelPreviewModal reel={previewTarget} onOpenChange={(open) => !open && setPreviewTarget(null)} />
    </div>
  );
}
