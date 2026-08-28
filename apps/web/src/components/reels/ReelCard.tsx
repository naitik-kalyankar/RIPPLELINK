import { Check, DollarSign, ExternalLink, Eye, Link2, Loader2, RotateCcw } from "lucide-react";
import type { Reel } from "@kick-manager/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { estimateReelPayout } from "@/lib/reelPayout";
import { cn, formatCount, formatCurrency, formatDate, formatRelativeShort } from "@/lib/utils";

interface ReelCardProps {
  reel: Reel;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onOpenPreview: (reel: Reel) => void;
  onLink: (reel: Reel) => void;
  bountyRateByName: Map<string, number>;
}

export function ReelCard({ reel, selected, onToggleSelect, onOpenPreview, onLink, bountyRateByName }: ReelCardProps) {
  const creatorLabel = reel.creator?.displayName ?? "Unknown creator";
  const status = reel.linkStatus;
  const estimatedPayout = estimateReelPayout(reel, bountyRateByName);

  return (
    <Card className="group relative flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <div className="absolute left-2 top-2 z-10">
        <Checkbox checked={selected} onCheckedChange={() => onToggleSelect(reel.id)} className="bg-background/80" />
      </div>
      <button
        type="button"
        onClick={() => onOpenPreview(reel)}
        className="relative aspect-[9/16] w-full overflow-hidden bg-muted"
      >
        <img
          src={reel.thumbnailUrl}
          alt={`Reel by ${reel.instagramAccount.username}`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
        />
        {(reel.views !== null || reel.publishedAt) && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-4 text-[11px] font-medium text-white">
            <span className="flex min-w-0 items-center gap-2">
              {reel.views !== null && (
                <span className="flex shrink-0 items-center gap-1">
                  <Eye className="h-3 w-3" /> {formatCount(reel.views)}
                </span>
              )}
              {estimatedPayout !== null && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex shrink-0 items-center gap-0.5 text-success">
                      <DollarSign className="h-3 w-3" /> {formatCurrency(estimatedPayout)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-56 text-xs">
                    Our estimate for this Reel. The exact amount from CLIPPING may be a bit different.
                  </TooltipContent>
                </Tooltip>
              )}
            </span>
            {reel.publishedAt && <span className="shrink-0">{formatRelativeShort(reel.publishedAt)}</span>}
          </div>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="truncate text-sm font-semibold text-foreground">{creatorLabel}</span>
        <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          <span className="truncate">@{reel.instagramAccount.username}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{formatDate(reel.publishedAt)}</span>
        </div>

        <div className="mt-2 flex gap-2">
          <Button variant="outline" size="sm" className="min-w-0 flex-1" asChild>
            <a href={reel.instagramUrl} target="_blank" rel="noreferrer">
              <span className="truncate">Instagram</span> <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
          </Button>
          <Button
            size="sm"
            className={cn(
              "min-w-0 flex-1",
              status !== "linked" &&
                status !== "failed" &&
                "border border-border bg-foreground text-background hover:bg-foreground/90",
              status === "failed" && "border-destructive/40 text-destructive hover:border-destructive/60 hover:bg-destructive/10"
            )}
            variant={status === "linked" ? "outline" : status === "failed" ? "outline" : "secondary"}
            onClick={() => onLink(reel)}
            disabled={status === "linked" || status === "submitting"}
          >
            {status === "linked" ? (
              <>
                <Check className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Linked</span>
              </>
            ) : status === "submitting" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> <span className="truncate">Submitting…</span>
              </>
            ) : status === "failed" ? (
              <>
                <RotateCcw className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Retry</span>
              </>
            ) : (
              <>
                <Link2 className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Link</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
