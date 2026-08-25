import { Film } from "lucide-react";
import { AccountPanel } from "./AccountPanel";
import { NavList } from "./NavList";

export function Sidebar() {
  return (
    <aside className="hidden w-[72px] shrink-0 flex-col rounded-2xl border border-border bg-card shadow-sm md:flex lg:w-64">
      <div className="flex h-16 items-center justify-center gap-2.5 px-3 lg:justify-start lg:px-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Film className="h-4 w-4" />
        </div>
        <span className="hidden truncate text-sm font-semibold lg:inline">Reel Manager</span>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto scrollbar-thin">
        <NavList />
      </div>
      <AccountPanel />
    </aside>
  );
}
