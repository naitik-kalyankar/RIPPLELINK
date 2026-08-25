import { CheckCircle2, Circle, Loader2, AlertTriangle, HelpCircle } from "lucide-react";
import type { LinkStatus as LinkStatusType } from "@kick-manager/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const CONFIG: Record<LinkStatusType, { label: string; tooltip: string; icon: typeof CheckCircle2; className: string }> = {
  linked: { label: "Linked", tooltip: "Submitted to CLIPPING", icon: CheckCircle2, className: "text-success" },
  unlinked: { label: "Not Linked", tooltip: "Not submitted to CLIPPING", icon: Circle, className: "text-muted-foreground" },
  submitting: { label: "Submitting…", tooltip: "Submission in progress", icon: Loader2, className: "text-primary" },
  failed: { label: "Failed", tooltip: "Submission failed — retry available", icon: AlertTriangle, className: "text-destructive" },
  unknown: { label: "Unknown", tooltip: "Link status could not be determined", icon: HelpCircle, className: "text-muted-foreground" },
};

export function LinkStatusBadge({ status, className }: { status: LinkStatusType; className?: string }) {
  const { label, tooltip, icon: Icon, className: iconClassName } = CONFIG[status];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", iconClassName, className)}>
          <Icon className={cn("h-3.5 w-3.5", status === "submitting" && "animate-spin")} />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
