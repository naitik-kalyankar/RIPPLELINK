import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { RippleLinkLogo } from "@/components/branding/Logo";
import { NavList } from "./NavList";
import { AccountPanel } from "./AccountPanel";

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-fade-in md:hidden" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-card outline-none data-[state=open]:animate-slide-in-left md:hidden"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Navigation menu</DialogPrimitive.Title>
          <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-slate-600 to-slate-800">
                <RippleLinkLogo className="h-5 w-5" />
              </div>
              <span className="text-sm font-semibold">RIPPLELINK</span>
            </div>
            <DialogPrimitive.Close className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-4 w-4" />
              <span className="sr-only">Close menu</span>
            </DialogPrimitive.Close>
          </div>
          <div className="flex flex-1 flex-col overflow-y-auto scrollbar-thin">
            <NavList onNavigate={() => onOpenChange(false)} alwaysExpanded />
          </div>
          <AccountPanel alwaysExpanded />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
