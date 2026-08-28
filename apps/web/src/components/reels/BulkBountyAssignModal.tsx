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
import { useToast } from "@/components/ui/toast";
import { useDetectReelCreator } from "@/api/reels";
import { useClippingBounties } from "@/api/clipping";
import { cn } from "@/lib/utils";

const OTHER_BOUNTY_TAG = "other";

interface BulkBountyAssignModalProps {
  /** Only the Reels that still need a bounty picked — every one of these gets asked for,
   * in order, before onComplete fires. CLIPPING has no blank/unknown bounty, so this can't
   * be skipped for any of them. */
  reels: Reel[];
  onCancel: () => void;
  onComplete: (bountyTags: Record<string, string>) => void;
}

export function BulkBountyAssignModal({ reels, onCancel, onComplete }: BulkBountyAssignModalProps) {
  const [step, setStep] = useState(0);
  const [collected, setCollected] = useState<Record<string, string>>({});
  const [bountyTag, setBountyTag] = useState("");
  const detectCreator = useDetectReelCreator();
  const { data: bountiesData } = useClippingBounties();
  const { toast } = useToast();
  const allBounties = bountiesData?.items ?? [];
  const activeBounties = allBounties.filter((b) => b.active);

  const reel = reels[step];
  const isLastStep = step === reels.length - 1;

  useEffect(() => {
    setBountyTag(reel?.creator?.detectedIdentifier ?? "");
  }, [reel?.id, reel?.creator?.detectedIdentifier]);

  if (!reel) return null;

  const trimmedBountyTag = bountyTag.trim();
  const bountyListLoaded = allBounties.length > 0;
  const matchedBounty = allBounties.find((b) => b.name.toLowerCase() === trimmedBountyTag.toLowerCase());
  const isDisabledBounty = Boolean(trimmedBountyTag) && matchedBounty !== undefined && !matchedBounty.active;
  const isUnknownBounty = Boolean(trimmedBountyTag) && bountyListLoaded && matchedBounty === undefined;

  const handleDetect = () => {
    detectCreator.mutate(reel.id, {
      onSuccess: ({ suggestedBountyTag }) => {
        if (suggestedBountyTag) setBountyTag(suggestedBountyTag);
        toast({
          title: suggestedBountyTag ? `Found: ${suggestedBountyTag}` : "No creator found in this video",
          variant: suggestedBountyTag ? "success" : "default",
        });
      },
      onError: (error) => toast({ title: "Couldn't detect creator", description: error.message, variant: "destructive" }),
    });
  };

  const handleNext = () => {
    if (!trimmedBountyTag) {
      toast({ title: "Bounty needed", description: "Pick a bounty for this Reel to continue.", variant: "destructive" });
      return;
    }
    if (isDisabledBounty) {
      toast({
        title: "That bounty is disabled",
        description: `"${trimmedBountyTag}" is turned off on CLIPPING — submitting would fail.`,
        variant: "destructive",
      });
      return;
    }

    const next = { ...collected, [reel.id]: trimmedBountyTag };
    if (isLastStep) {
      onComplete(next);
    } else {
      setCollected(next);
      setStep((s) => s + 1);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Who's this creator?</DialogTitle>
          <DialogDescription>
            Reel {step + 1} of {reels.length} needs a creator before it can be linked.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4">
          <img src={reel.thumbnailUrl} alt="" className="h-32 w-20 rounded-md object-cover" />
          <div className="grid gap-1 text-sm">
            <div>
              <span className="text-muted-foreground">Instagram: </span>@{reel.instagramAccount.username}
            </div>
            <div className="truncate">
              <span className="text-muted-foreground">Reel: </span>
              {reel.instagramUrl}
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="bulk-bounty">
              Bounty <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="bulk-bounty"
                placeholder="e.g. n3on — required"
                value={bountyTag}
                onChange={(e) => setBountyTag(e.target.value)}
                list="bulk-bounty-suggestions"
                autoComplete="off"
                autoFocus
                className={cn(
                  isDisabledBounty && "border-destructive focus-visible:ring-destructive",
                  isUnknownBounty && "border-warning focus-visible:ring-warning"
                )}
              />
              <Button
                variant="outline"
                size="icon"
                disabled={detectCreator.isPending}
                onClick={handleDetect}
                title="Try to find the creator automatically"
              >
                <RefreshCw className={detectCreator.isPending ? "animate-spin" : ""} />
              </Button>
            </div>
            <datalist id="bulk-bounty-suggestions">
              {activeBounties.map((bounty) => (
                <option key={bounty.id} value={bounty.name}>
                  {bounty.rate ?? undefined}
                </option>
              ))}
            </datalist>
            {isDisabledBounty && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-destructive">"{trimmedBountyTag}" is turned off right now.</p>
                <Button variant="outline" size="sm" className="h-6 shrink-0 px-2 text-xs" onClick={() => setBountyTag(OTHER_BOUNTY_TAG)}>
                  Use "other"
                </Button>
              </div>
            )}
            {isUnknownBounty && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-warning">"{trimmedBountyTag}" isn't a bounty CLIPPING recognizes.</p>
                <Button variant="outline" size="sm" className="h-6 shrink-0 px-2 text-xs" onClick={() => setBountyTag(OTHER_BOUNTY_TAG)}>
                  Use "other"
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel all
          </Button>
          <Button onClick={handleNext} disabled={!trimmedBountyTag || isDisabledBounty}>
            {isLastStep ? "Link Reels" : "Next"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
