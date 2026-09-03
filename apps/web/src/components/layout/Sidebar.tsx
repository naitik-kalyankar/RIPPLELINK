import { RippleLinkLogo } from "@/components/branding/Logo";
import { NavList } from "./NavList";
import { LinkQueuePanel } from "./LinkQueuePanel";

export function Sidebar() {
  return (
    <aside className="hidden w-[72px] shrink-0 flex-col rounded-2xl border border-border bg-card shadow-sm md:flex xl:w-64">
      <div className="flex h-16 items-center justify-center gap-2.5 px-3 xl:justify-start xl:px-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-600 to-slate-800">
          <RippleLinkLogo className="h-5 w-5" />
        </div>
        <span className="hidden truncate text-sm font-semibold xl:inline">RIPPLELINK</span>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto scrollbar-thin">
        <NavList />
      </div>
      <LinkQueuePanel />
    </aside>
  );
}
