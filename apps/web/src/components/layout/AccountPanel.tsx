import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, LayoutGrid } from "lucide-react";
import { Link } from "react-router-dom";
import type { InstagramAccount } from "@kick-manager/shared";
import { useInstagramAccounts } from "@/api/instagram";
import { useClippingAccounts, type ClippingAccountStatus } from "@/api/clippingAccounts";
import { useClippingScope } from "@/lib/clippingScope";
import { cn } from "@/lib/utils";

const UNLINKED_GROUP = "__unlinked__";

interface AccountGroup {
  key: string;
  label: string;
  accountCount: number;
  clippingAccount: ClippingAccountStatus | null;
}

function groupByClippingAccount(
  accounts: InstagramAccount[],
  clippingAccountsById: Map<string, ClippingAccountStatus>
): AccountGroup[] {
  const counts = new Map<string, number>();
  for (const account of accounts) {
    const key = account.clippingAccountRefId ?? UNLINKED_GROUP;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([key, accountCount]) => {
    const clippingAccount = key === UNLINKED_GROUP ? null : (clippingAccountsById.get(key) ?? null);
    return {
      key,
      label: key === UNLINKED_GROUP ? "Unlinked" : (clippingAccount?.label ?? "Unknown account"),
      accountCount,
      clippingAccount,
    };
  });
}

function statusColor(clippingAccount: ClippingAccountStatus | null): "success" | "destructive" | "muted" {
  if (!clippingAccount) return "muted";
  if (clippingAccount.loginInProgress || !clippingAccount.hasStorageState) return "muted";
  return clippingAccount.healthy ? "success" : "destructive";
}

function RowShell({
  selected,
  alwaysExpanded,
  title,
  children,
  ...linkOrButtonProps
}: {
  selected: boolean;
  alwaysExpanded?: boolean;
  title?: string;
  children: ReactNode;
} & ({ as: "button"; onClick: () => void } | { as: "link"; to: string })) {
  const className = cn(
    "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-background/60",
    !alwaysExpanded && "justify-center px-0 lg:justify-start lg:px-2",
    selected && "bg-background shadow-sm ring-1 ring-primary/30"
  );

  if (linkOrButtonProps.as === "link") {
    return (
      <Link to={linkOrButtonProps.to} title={!alwaysExpanded ? title : undefined} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" title={!alwaysExpanded ? title : undefined} onClick={linkOrButtonProps.onClick} className={className}>
      {children}
    </button>
  );
}

function AllAccountsRow({ selected, alwaysExpanded, onSelect }: { selected: boolean; alwaysExpanded?: boolean; onSelect: () => void }) {
  return (
    <RowShell as="button" onClick={onSelect} selected={selected} alwaysExpanded={alwaysExpanded} title="All Accounts">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <LayoutGrid className="h-3.5 w-3.5" />
      </span>
      <div className={cn("min-w-0 flex-1", !alwaysExpanded && "hidden lg:block")}>
        <div className="truncate text-xs font-medium text-foreground">All Accounts</div>
        <div className="text-[11px] text-muted-foreground">Show everything</div>
      </div>
    </RowShell>
  );
}

function AccountRow({
  group,
  selected,
  alwaysExpanded,
  onSelect,
}: {
  group: AccountGroup;
  selected: boolean;
  alwaysExpanded?: boolean;
  onSelect: () => void;
}) {
  const isUnlinked = group.key === UNLINKED_GROUP;
  const countLabel = `${group.accountCount} account${group.accountCount === 1 ? "" : "s"}`;
  const color = statusColor(group.clippingAccount);
  const avatarContent = (
    <>
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold uppercase",
            isUnlinked ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"
          )}
        >
          {isUnlinked ? "?" : group.label.charAt(0)}
        </span>
        {!isUnlinked && (
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-card",
              color === "success" ? "bg-success" : color === "destructive" ? "bg-destructive" : "bg-muted-foreground/50"
            )}
            title={
              group.clippingAccount?.loginInProgress
                ? "Waiting for login…"
                : !group.clippingAccount?.hasStorageState
                  ? "Not logged in"
                  : group.clippingAccount?.healthy
                    ? "Connected"
                    : "Error"
            }
          />
        )}
      </span>
      <div className={cn("min-w-0 flex-1", !alwaysExpanded && "hidden lg:block")}>
        <div className="truncate text-xs font-medium text-foreground">{group.label}</div>
        <div className="text-[11px] text-muted-foreground">{countLabel}</div>
      </div>
    </>
  );

  // Unlinked accounts have no ClippingAccount to scope to — informational only, links to
  // where you'd actually fix that (the Socials page) instead of pretending to select it.
  if (isUnlinked) {
    return (
      <RowShell as="link" to="/instagram-accounts" selected={false} alwaysExpanded={alwaysExpanded} title={`${group.label} · ${countLabel}`}>
        {avatarContent}
      </RowShell>
    );
  }

  return (
    <RowShell as="button" onClick={onSelect} selected={selected} alwaysExpanded={alwaysExpanded} title={`${group.label} · ${countLabel}`}>
      {avatarContent}
    </RowShell>
  );
}

interface AccountPanelProps {
  /** See NavList's `alwaysExpanded` — same rail-vs-drawer distinction applies here. */
  alwaysExpanded?: boolean;
}

/** The app-wide CLIPPING account switcher — selecting a row scopes the Dashboard, Reels,
 * Upload Queue, and Clipping pages down to just that account's linked Instagram accounts (see
 * lib/clippingScope.tsx). "All Accounts" clears the scope back to the unfiltered default.
 * Collapses to just the currently-selected row when there's more than one option — expand to
 * see the rest. */
export function AccountPanel({ alwaysExpanded = false }: AccountPanelProps) {
  const { data: accountsData } = useInstagramAccounts();
  const { data: clippingAccountsData } = useClippingAccounts();
  const { selectedId, setSelectedId } = useClippingScope();
  const [expanded, setExpanded] = useState(false);

  const clippingAccountsById = new Map((clippingAccountsData?.items ?? []).map((a) => [a.id, a]));
  const groups = groupByClippingAccount(accountsData?.items ?? [], clippingAccountsById);

  if (groups.length === 0) return null;

  const canCollapse = groups.length > 1;
  // Collapsed view always shows whichever row reflects the CURRENT scope — "All Accounts" when
  // unscoped, or the selected ClippingAccount's own row — rather than guessing a default.
  const visibleGroups = canCollapse && !expanded ? groups.filter((g) => g.clippingAccount?.id === selectedId) : groups;
  const showAllAccountsRow = !canCollapse || expanded || !selectedId;

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
            title={expanded ? "Show fewer" : `Show all ${groups.length + 1} options`}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      <div className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-accent/30 p-1">
        {showAllAccountsRow && (
          <AllAccountsRow selected={!selectedId} alwaysExpanded={alwaysExpanded} onSelect={() => setSelectedId(null)} />
        )}
        {visibleGroups.map((group) => (
          <AccountRow
            key={group.key}
            group={group}
            selected={group.clippingAccount?.id === selectedId}
            alwaysExpanded={alwaysExpanded}
            onSelect={() => group.clippingAccount && setSelectedId(group.clippingAccount.id)}
          />
        ))}
      </div>
    </div>
  );
}
