import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useClippingClips, useClippingStatus, useSyncClipping } from "@/api/clipping";
import { formatCount, formatDate, formatRelativeTime } from "@/lib/utils";

export function ClippingPage() {
  const { data: status } = useClippingStatus();
  const [page, setPage] = useState(1);
  const { data: clips, isLoading } = useClippingClips(page);
  const sync = useSyncClipping();
  const { toast } = useToast();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Clipping</h1>

      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status?.connected ? "bg-success" : "bg-muted-foreground"}`} />
            <span className="font-medium">{status?.connected ? "Connected" : "Mock mode"}</span>
            <Badge variant="outline">{status?.mode ?? "mock"}</Badge>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm sm:gap-8">
            <div>
              <div className="text-muted-foreground">Campaign</div>
              <div className="font-medium">{status?.campaignId ?? "Kick Clipping"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Last Sync</div>
              <div className="font-medium">{formatRelativeTime(status?.lastSyncAt ?? null)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Uploaded Clips</div>
              <div className="font-medium">{status?.uploadedClips.toLocaleString() ?? "—"}</div>
            </div>
          </div>
          <Button
            className="lg:shrink-0"
            onClick={() =>
              sync.mutate(undefined, {
                onSuccess: (result) => {
                  const parts = [`${result.clippingSubmissionsFetched} clips fetched`, `${result.newlyLinked} newly linked`];
                  if (result.newlyUnlinked > 0) parts.push(`${result.newlyUnlinked} unlinked (removed on CLIPPING)`);
                  toast({ title: "CLIPPING sync complete", description: `${parts.join(", ")}.`, variant: "success" });
                },
                onError: (error) => toast({ title: "Sync failed", description: error.message, variant: "destructive" }),
              })
            }
            disabled={sync.isPending}
          >
            <RefreshCw className={sync.isPending ? "animate-spin" : ""} /> Sync Now
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Submitted Clips</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Video ID</th>
                <th className="px-4 py-2 font-medium">Bounty</th>
                <th className="px-4 py-2 font-medium text-right">Views</th>
                <th className="px-4 py-2 font-medium text-right">Likes</th>
                <th className="px-4 py-2 font-medium text-right">Comments</th>
                <th className="px-4 py-2 font-medium">Date added</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-4"><Skeleton className="h-4 w-full" /></td>
                </tr>
              )}
              {clips?.items.map((clip) => (
                <tr key={clip.id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                  <td className="px-4 py-2.5 font-mono text-xs">{clip.videoId}</td>
                  <td className="px-4 py-2.5">{clip.bountyTag ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatCount(clip.views)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatCount(clip.likes)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatCount(clip.comments)}</td>
                  <td className="px-4 py-2.5">{formatDate(clip.dateAdded)}</td>
                </tr>
              ))}
              {clips && clips.items.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No CLIPPING submissions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {clips && clips.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {clips.page} of {clips.totalPages}</span>
          <Button variant="outline" size="sm" disabled={!clips.hasNext} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
