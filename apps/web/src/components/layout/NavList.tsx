import { NavLink } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMe } from "@/api/integrations";
import { NAV_ITEMS, type NavItem } from "./nav-items";

const ADMIN_NAV_ITEM: NavItem = { to: "/admin/payouts", label: "Admin", icon: ShieldCheck };

interface NavListProps {
  onNavigate?: () => void;
  /** MobileNav renders this inside a full-width drawer that only ever appears below the `md`
   * breakpoint, so labels should always be visible there regardless of the `lg` check below.
   * The default (desktop Sidebar) responsively collapses to an icon-only rail between `md` and
   * `lg`, then expands to icon+label at `lg` and up. */
  alwaysExpanded?: boolean;
}

export function NavList({ onNavigate, alwaysExpanded = false }: NavListProps) {
  const { data: me } = useMe();
  const items = me?.isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

  return (
    <nav className="flex flex-1 flex-col gap-0.5 p-2.5" aria-label="Primary">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          title={!alwaysExpanded ? item.label : undefined}
          aria-label={!alwaysExpanded ? item.label : undefined}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              !alwaysExpanded && "justify-center px-0 xl:justify-start xl:px-3",
              isActive && "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground"
            )
          }
        >
          <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className={cn("truncate", !alwaysExpanded && "hidden xl:inline")}>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
