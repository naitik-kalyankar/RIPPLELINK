import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type DotColor = "success" | "destructive" | "muted";

const DOT_CLASS: Record<DotColor, string> = {
  success: "bg-success",
  destructive: "bg-destructive",
  muted: "bg-muted-foreground",
};

interface StatusDotProps {
  label: string;
  color: DotColor;
  tooltip: string;
  pulse?: boolean;
}

export function StatusDot({ label, color, tooltip, pulse }: StatusDotProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground/80">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_CLASS[color], pulse && "animate-pulse")} />
          {label}
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
