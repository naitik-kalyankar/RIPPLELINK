import { useEffect, useState } from "react";
import type { Reel } from "@kick-manager/shared";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useDetectReelCreator } from "@/api/reels";
import { LinkStatusBadge } from "./LinkStatus";
import { formatCount, formatDate } from "@/lib/utils";
import { ExternalLink, RefreshCw } from "lucide-react";

interface ReelPreviewModalProps {
  reel: Reel | null;
  onOpenChange: (open: boolean) => void;
}

export function ReelPreviewModal({ reel, onOpenChange }: ReelPreviewModalProps) {
  const detectCreator = useDetectReelCreator();
  const { toast } = useToast();
  const [creatorLabel, setCreatorLabel] = useState<string | null>(null);

  // The `reel` prop is a snapshot passed down when the modal opens, not a live query result —
  // re-detecting wouldn't otherwise be visible here without tracking the result locally.
  useEffect(() => {
    setCreatorLabel(reel?.creator?.displayName ?? null);
  }, [reel?.id, reel?.creator?.displayName]);

  if (!reel) return null;

  const handleDetect = () => {
    detectCreator.mutate(reel.id, {
      onSuccess: ({ reel: updated, suggestedBountyTag }) => {
        setCreatorLabel(updated.creator?.displayName ?? null);
        toast({
          title: suggestedBountyTag ? `Detected: ${suggestedBountyTag}` : "No creator watermark found",
          variant: suggestedBountyTag ? "success" : "default",
        });
      },
      onError: (error) => toast({ title: "Detection failed", description: error.message, variant: "destructive" }),
    });
  };

  return (
    <Dialog open={Boolean(reel)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>@{reel.instagramAccount.username}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-[minmax(0,220px)_1fr]">
          <img src={reel.thumbnailUrl} alt="" className="aspect-[9/16] w-full max-w-[220px] rounded-md object-cover sm:max-w-none" />
          <div className="grid gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <LinkStatusBadge status={reel.linkStatus} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Creator</span>
              <span className="flex items-center gap-2">
                {creatorLabel ?? "Unassigned"}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={detectCreator.isPending}
                  onClick={handleDetect}
                  title={creatorLabel ? "Re-detect creator" : "Detect creator"}
                >
                  <RefreshCw className={`h-3 w-3 ${detectCreator.isPending ? "animate-spin" : ""}`} />
                </Button>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Published</span>
              <span>{formatDate(reel.publishedAt)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Reel ID</span>
              <span className="font-mono text-xs">{reel.instagramReelId}</span>
            </div>
            {reel.clippingSubmission && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Views</span>
                  <span>{formatCount(reel.clippingSubmission.views)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Likes</span>
                  <span>{formatCount(reel.clippingSubmission.likes)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Comments</span>
                  <span>{formatCount(reel.clippingSubmission.comments)}</span>
                </div>
              </>
            )}
            <div className="mt-2 flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={reel.instagramUrl} target="_blank" rel="noreferrer">
                  Open Instagram <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
              {reel.clippingSubmission?.clippingUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={reel.clippingSubmission.clippingUrl} target="_blank" rel="noreferrer">
                    Open CLIPPING <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
