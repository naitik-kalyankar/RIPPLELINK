import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "react-router-dom";
import type { InstagramAccount } from "@kick-manager/shared";
import { useInstagramAccounts } from "@/api/instagram";
import { useActiveClippingIdentity } from "@/api/clipping";
import { cn } from "@/lib/utils";

const UNASSIGNED_GROUP = "__unassigned__";

interface AccountGroup {
  email: string;
  accountCount: number;
}

function groupByClippingOwner(accounts: InstagramAccount[]): AccountGroup[] {
  const counts = new Map<string, number>();
  for (const account of accounts) {
    const key = account.clippingOwnerEmail ?? UNASSIGNED_GROUP;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([email, accountCount]) => ({ email, accountCount }));
}

function AccountRow({
  group,
  isActive,
  alwaysExpanded,
}: {
  group: AccountGroup;
  isActive: boolean;
  alwaysExpanded?: boolean;
}) {
  const isUnassigned = group.email === UNASSIGNED_GROUP;
  const label = isUnassigned ? "Unassigned" : group.email;
  const countLabel = `${group.accountCount} account${group.accountCount === 1 ? "" : "s"}`;

  return (
    <Link
      to="/instagram-accounts"
      title={!alwaysExpanded ? `${label} · ${countLabel}` : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-background/60",
        !alwaysExpanded && "justify-center px-0 lg:justify-start lg:px-2",
        isActive && "bg-background/80"
      )}
    >
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold uppercase",
            isUnassigned ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"
          )}
        >
          {isUnassigned ? "?" : label.charAt(0)}
        </span>
        {isActive && (
          <span
            className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-success ring-2 ring-card"
            title="Active in browser"
          />
        )}
      </span>
      <div className={cn("min-w-0 flex-1", !alwaysExpanded && "hidden lg:block")}>
        <div className="truncate text-xs font-medium text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground">{countLabel}</div>
      </div>
    </Link>
  );
}

interface AccountPanelProps {
  /** See NavList's `alwaysExpanded` — same rail-vs-drawer distinction applies here. */
  alwaysExpanded?: boolean;
}

/** "Accounts" here means CLIPPING logins (by email) — each one owns a set of Instagram
 * accounts assigned to it on the Socials page. Mirrors the grouping used there, surfaced
 * persistently in the sidebar so it's clear at a glance which CLIPPING login is currently
 * active in the browser (from the cookie-sync extension) vs just known about. Collapses to
 * just the active account when there's more than one — expand to see the rest. */
export function AccountPanel({ alwaysExpanded = false }: AccountPanelProps) {
  const { data: accountsData } = useInstagramAccounts();
  const { data: identityData } = useActiveClippingIdentity();
  const [expanded, setExpanded] = useState(false);

  const groups = groupByClippingOwner(accountsData?.items ?? []);
  const activeEmail = identityData?.identity?.email ?? null;

  if (groups.length === 0) return null;

  const activeIndex = groups.findIndex((g) => g.email === activeEmail);
  const defaultGroup = groups[activeIndex >= 0 ? activeIndex : 0];
  const canCollapse = groups.length > 1;
  const visibleGroups = canCollapse && !expanded ? [defaultGroup] : groups;

  return (
    <div className="border-t border-border/70 p-2.5">
      <div className={cn("flex items-center justify-between px-1.5 pb-1.5", !alwaysExpanded && "hidden lg:flex")}>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          CLIPPING Accounts
        </span>
        {canCollapse && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
            title={expanded ? "Show only active account" : `Show all ${groups.length} accounts`}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      <div className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-accent/30 p-1">
        {visibleGroups.map((group) => (
          <AccountRow
            key={group.email}
            group={group}
            isActive={group.email === activeEmail}
            alwaysExpanded={alwaysExpanded}
          />
        ))}
      </div>
    </div>
  );
}
