import { useState } from "react";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useBulkLinkReels, useLinkReel, useReels } from "@/api/reels";
import { useCampaignId } from "@/api/clipping";
import { LinkStatusBadge } from "@/components/reels/LinkStatus";
import { formatDate } from "@/lib/utils";

export function UploadQueuePage() {
  const { data, isLoading } = useReels({ page: 1, limit: 100, status: "all", sort: "newest" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const linkReel = useLinkReel();
  const bulkLink = useBulkLinkReels();
  const campaignId = useCampaignId();
  const { toast } = useToast();

  const queueItems = (data?.items ?? []).filter((r) => r.linkStatus !== "linked");

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const uploadOne = (reelId: string, bountyTag?: string) => {
    linkReel.mutate(
      { reelId, input: { campaignId, bountyTag } },
      {
        onError: (error) => toast({ title: "Upload failed", description: error.message, variant: "destructive" }),
      }
    );
  };

  const uploadSelected = () => {
    bulkLink.mutate(
      { reelIds: Array.from(selected), campaignId },
      {
        onSuccess: (result) => {
          const successCount = result.results.filter((r) => r.success).length;
          toast({ title: `${successCount} of ${selected.size} uploaded` });
          setSelected(new Set());
        },
      }
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Upload Queue</h1>
        <Button onClick={uploadSelected} disabled={selected.size === 0 || bulkLink.isPending}>
          <UploadCloud className="h-3.5 w-3.5" />
          Upload Selected {selected.size > 0 && `(${selected.size})`}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-border bg-card/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-4 py-2" />
              <th className="px-4 py-2 font-medium">Thumbnail</th>
              <th className="px-4 py-2 font-medium">Creator</th>
              <th className="px-4 py-2 font-medium">Instagram account</th>
              <th className="px-4 py-2 font-medium">Reel ID</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Last error</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={9} className="px-4 py-3"><Skeleton className="h-10 w-full" /></td>
                </tr>
              ))}
            {queueItems.map((reel) => (
              <tr key={reel.id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                <td className="px-4 py-2.5">
                  <Checkbox checked={selected.has(reel.id)} onCheckedChange={() => toggle(reel.id)} />
                </td>
                <td className="px-4 py-2.5">
                  <img src={reel.thumbnailUrl} alt="" className="h-12 w-8 rounded object-cover" />
                </td>
                <td className="px-4 py-2.5">{reel.creator?.displayName ?? "Unassigned"}</td>
                <td className="px-4 py-2.5">@{reel.instagramAccount.username}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{reel.instagramReelId}</td>
                <td className="px-4 py-2.5"><LinkStatusBadge status={reel.linkStatus} /></td>
                <td className="max-w-48 truncate px-4 py-2.5 text-xs text-destructive">
                  {reel.latestAttempt?.status === "failed" ? reel.latestAttempt.errorMessage : "—"}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(reel.createdAt)}</td>
                <td className="px-4 py-2.5 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={linkReel.isPending || !reel.creator?.detectedIdentifier}
                    title={!reel.creator?.detectedIdentifier ? "No detected creator — assign one from the Reels page first (Link modal has a Detect button)." : undefined}
                    onClick={() => uploadOne(reel.id, reel.creator?.detectedIdentifier)}
                  >
                    {reel.linkStatus === "failed" ? "Retry" : "Upload"}
                  </Button>
                </td>
              </tr>
            ))}
            {!isLoading && queueItems.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                  Nothing in the queue — every Reel is already linked.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
