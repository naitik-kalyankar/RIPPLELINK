import { useState } from "react";
import { CircleUserRound } from "lucide-react";
import type { InstagramAccount } from "@kick-manager/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useInstagramAccounts } from "@/api/instagram";
import { useActiveClippingIdentity } from "@/api/clipping";
import { AddInstagramAccountModal } from "@/components/instagram/AddInstagramAccountModal";
import { InstagramAccountCard } from "@/components/instagram/InstagramAccountCard";
import { EditInstagramCredentialsDialog } from "@/components/instagram/EditInstagramCredentialsDialog";

const UNASSIGNED_GROUP = "__unassigned__";

function groupByClippingOwner(accounts: InstagramAccount[]): Map<string, InstagramAccount[]> {
  const groups = new Map<string, InstagramAccount[]>();
  for (const account of accounts) {
    const key = account.clippingOwnerEmail ?? UNASSIGNED_GROUP;
    const existing = groups.get(key);
    if (existing) existing.push(account);
    else groups.set(key, [account]);
  }
  return groups;
}

export function InstagramAccountsPage() {
  const { data, isLoading } = useInstagramAccounts();
  const { data: activeIdentityData } = useActiveClippingIdentity();
  const [credentialsTarget, setCredentialsTarget] = useState<InstagramAccount | null>(null);

  const activeIdentity = activeIdentityData?.identity ?? null;
  const groups = data ? groupByClippingOwner(data.items) : new Map<string, InstagramAccount[]>();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Socials</h1>
        <AddInstagramAccountModal />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-accent/30 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-muted-foreground">
          <CircleUserRound className="h-4 w-4" />
        </span>
        {activeIdentity ? (
          <>
            <p className="text-sm leading-snug">
              <span className="text-muted-foreground">Currently signed into CLIPPING in your browser as </span>
              <span className="font-medium text-foreground">
                {activeIdentity.displayName ?? activeIdentity.email ?? activeIdentity.userId}
                {activeIdentity.displayName && activeIdentity.email ? ` (${activeIdentity.email})` : ""}
              </span>
            </p>
            <Badge variant="success" className="ml-auto">Active</Badge>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">
            No active CLIPPING browser session detected yet — open clipping.net with the cookie-sync extension
            running to detect which account you're on.
          </span>
        )}
      </div>

      <div className="flex flex-col gap-5">
        {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        {data &&
          Array.from(groups.entries()).map(([owner, accounts]) => {
            const isUnassigned = owner === UNASSIGNED_GROUP;
            const isActiveGroup = !isUnassigned && activeIdentity?.email === owner;
            return (
              <div key={owner} className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2 px-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>{isUnassigned ? "CLIPPING account not set" : owner}</span>
                  {isActiveGroup && <Badge variant="success">Active in browser</Badge>}
                </div>
                <div className="flex flex-col gap-2">
                  {accounts.map((account) => (
                    <InstagramAccountCard key={account.id} account={account} onEditCredentials={setCredentialsTarget} />
                  ))}
                </div>
              </div>
            );
          })}
        {data && data.items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-20 text-center">
            <p className="text-sm font-medium">No Instagram accounts yet</p>
            <p className="text-sm text-muted-foreground">Add an account to start fetching Reels.</p>
          </div>
        )}
      </div>

      <EditInstagramCredentialsDialog
        account={credentialsTarget}
        onOpenChange={(open) => !open && setCredentialsTarget(null)}
      />
    </div>
  );
}
