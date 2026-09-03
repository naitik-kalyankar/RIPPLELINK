import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Reel } from "@kick-manager/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useDetectReelCreator, useLinkReel } from "@/api/reels";
import { useCampaignId, useClippingBounties } from "@/api/clipping";
import { cn } from "@/lib/utils";

const OTHER_BOUNTY_TAG = "other";

interface LinkReelModalProps {
  reel: Reel | null;
  onOpenChange: (open: boolean) => void;
}

export function LinkReelModal({ reel, onOpenChange }: LinkReelModalProps) {
  const campaignId = useCampaignId();
  const [bountyTag, setBountyTag] = useState("");
  const [notes, setNotes] = useState("");
  const [creatorLabel, setCreatorLabel] = useState<string | null>(null);
  const linkReel = useLinkReel();
  const detectCreator = useDetectReelCreator();
  const { data: bountiesData } = useClippingBounties();
  const { toast } = useToast();
  const allBounties = bountiesData?.items ?? [];
  const activeBounties = allBounties.filter((b) => b.active);

  // A real bounty tag is required to submit — no safe placeholder to fall back to — so
  // prefill the actual value (not just a placeholder) whenever the Reel already has a
  // detected creator, and reset per-Reel state whenever the modal target changes.
  useEffect(() => {
    setBountyTag(reel?.creator?.detectedIdentifier ?? "");
    setNotes("");
    setCreatorLabel(reel?.creator?.displayName ?? null);
  }, [reel?.id, reel?.creator?.detectedIdentifier, reel?.creator?.displayName]);

  if (!reel) return null;

  const alreadyLinked = reel.linkStatus === "linked";
  const trimmedBountyTag = bountyTag.trim();
  const bountyListLoaded = allBounties.length > 0;
  const matchedBounty = allBounties.find((b) => b.name.toLowerCase() === trimmedBountyTag.toLowerCase());
  const isDisabledBounty = Boolean(trimmedBountyTag) && matchedBounty !== undefined && !matchedBounty.active;
  const isUnknownBounty = Boolean(trimmedBountyTag) && bountyListLoaded && matchedBounty === undefined;

  // The original detected name is about to disappear from the Bounty field the moment this
  // switches it to "other" — carry it into Notes so CLIPPING's reviewer (or a future re-read of
  // this submission) still knows who it was actually detected as, instead of just "other" with
  // no context. Doesn't clobber notes the user already typed by hand.
  const useOtherBounty = () => {
    setNotes((current) => (current.trim() ? current : trimmedBountyTag));
    setBountyTag(OTHER_BOUNTY_TAG);
  };

  const handleDetect = () => {
    detectCreator.mutate(reel.id, {
      onSuccess: ({ reel: updated, suggestedBountyTag }) => {
        setCreatorLabel(updated.creator?.displayName ?? null);
        if (suggestedBountyTag) setBountyTag(suggestedBountyTag);
        toast({
          title: suggestedBountyTag ? `Detected: ${suggestedBountyTag}` : "No creator watermark found",
          variant: suggestedBountyTag ? "success" : "default",
        });
      },
      onError: (error) => toast({ title: "Detection failed", description: error.message, variant: "destructive" }),
    });
  };

  const handleSubmit = () => {
    if (alreadyLinked) {
      toast({ title: "Already linked", description: "This Reel is already submitted to CLIPPING." });
      return;
    }
    if (!trimmedBountyTag) {
      toast({ title: "Bounty required", description: "Enter a bounty tag or run Detect first.", variant: "destructive" });
      return;
    }
    if (isDisabledBounty) {
      toast({
        title: "Bounty disabled",
        description: `The bounty for "${trimmedBountyTag}" is disabled on CLIPPING — submitting would fail.`,
        variant: "destructive",
      });
      return;
    }
    // Close right away instead of blocking on the request — submission can take a while, and
    // there's no reason to trap the user in this dialog while it's in flight. The global bottom
    // progress bar (LinkingProgressBar) tracks LINK_REEL_MUTATION_KEY to show it's still running,
    // and this toast reports the outcome once it lands wherever the user has navigated to.
    onOpenChange(false);
    linkReel.mutate(
      { reelId: reel.id, input: { campaignId, bountyTag: trimmedBountyTag, notes } },
      {
        onSuccess: () => {
          toast({ title: "Successfully linked to CLIPPING", variant: "success" });
        },
        onError: (error) => {
          toast({ title: "CLIPPING submission failed", description: error.message, variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open={Boolean(reel)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link Reel to CLIPPING</DialogTitle>
          <DialogDescription>Confirm the details before submitting this Reel.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-4">
          <img src={reel.thumbnailUrl} alt="" className="h-32 w-20 rounded-md object-cover" />
          <div className="grid gap-1 text-sm">
            <div>
              <span className="text-muted-foreground">Instagram: </span>@{reel.instagramAccount.username}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Creator: </span>
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
            </div>
            <div className="truncate">
              <span className="text-muted-foreground">Reel: </span>
              {reel.instagramUrl}
            </div>
          </div>
        </div>

        {alreadyLinked ? (
          <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
            This Reel is already linked to CLIPPING.
          </p>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Campaign</Label>
              <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                Kick
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bounty">
                Bounty <span className="text-destructive">*</span>
              </Label>
              <Input
                id="bounty"
                placeholder="e.g. n3on — required"
                value={bountyTag}
                onChange={(e) => setBountyTag(e.target.value)}
                list="bounty-suggestions"
                autoComplete="off"
                className={cn(
                  isDisabledBounty && "border-destructive focus-visible:ring-destructive",
                  isUnknownBounty && "border-warning focus-visible:ring-warning"
                )}
              />
              <datalist id="bounty-suggestions">
                {activeBounties.map((bounty) => (
                  <option key={bounty.id} value={bounty.name}>
                    {bounty.rate ?? undefined}
                  </option>
                ))}
              </datalist>
              {isDisabledBounty && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-destructive">The bounty for "{trimmedBountyTag}" is disabled.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 shrink-0 px-2 text-xs"
                    onClick={useOtherBounty}
                  >
                    Use "other"
                  </Button>
                </div>
              )}
              {isUnknownBounty && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-warning">"{trimmedBountyTag}" isn't in CLIPPING's bounty list.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 shrink-0 px-2 text-xs"
                    onClick={useOtherBounty}
                  >
                    Use "other"
                  </Button>
                </div>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={alreadyLinked || linkReel.isPending || !trimmedBountyTag || isDisabledBounty}
          >
            {linkReel.isPending ? "Submitting…" : "Submit to CLIPPING"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
