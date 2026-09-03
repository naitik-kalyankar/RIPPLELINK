import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Shared square icon-button shape for the account rail — every rail item (accounts, "All
 * Accounts", the app account menu) renders through this so the shape, active-state left bar,
 * and hover nameplate stay consistent everywhere. Its own file (not inlined into
 * AccountRail.tsx) so other rail-adjacent components could reuse it without risking a circular
 * import back into AccountRail.tsx. */
export function RailButton({
  selected,
  title,
  onClick,
  children,
}: {
  selected?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex items-center">
      {/* Active indicator lives in the rail's own left gutter, not as a ring around the icon —
       * same idea as Discord's active-server bar. */}
      <span
        className={cn(
          "absolute left-[-8px] h-6 w-1 rounded-full bg-foreground transition-all",
          selected ? "opacity-100" : "opacity-0"
        )}
        aria-hidden="true"
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={title}
            onClick={onClick}
            className={cn(
              "flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl transition-colors",
              selected ? "bg-primary/15" : "hover:bg-accent/60"
            )}
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={12} className="font-medium">
          {title}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
