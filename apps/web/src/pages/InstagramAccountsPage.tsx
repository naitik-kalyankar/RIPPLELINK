import { useState } from "react";
import type { InstagramAccount } from "@kick-manager/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { useInstagramAccounts } from "@/api/instagram";
import { useClippingAccounts, type ClippingAccountStatus } from "@/api/clippingAccounts";
import { StatusDot } from "@/components/layout/StatusDot";
import { AddInstagramAccountModal } from "@/components/instagram/AddInstagramAccountModal";
import { InstagramAccountCard } from "@/components/instagram/InstagramAccountCard";
import { EditInstagramCredentialsDialog } from "@/components/instagram/EditInstagramCredentialsDialog";

const UNLINKED_GROUP = "__unlinked__";

function groupByClippingAccount(accounts: InstagramAccount[]): Map<string, InstagramAccount[]> {
  const groups = new Map<string, InstagramAccount[]>();
  for (const account of accounts) {
    const key = account.clippingAccountRefId ?? UNLINKED_GROUP;
    const existing = groups.get(key);
    if (existing) existing.push(account);
    else groups.set(key, [account]);
  }
  return groups;
}

function GroupStatus({ clippingAccount }: { clippingAccount: ClippingAccountStatus }) {
  if (clippingAccount.loginInProgress) {
    return <StatusDot label="Waiting for login…" color="muted" tooltip="A browser window is open on this machine." pulse />;
  }
  if (!clippingAccount.hasStorageState) {
    return <StatusDot label="Not signed in" color="muted" tooltip="Sign in on the Settings page to connect it." />;
  }
  if (clippingAccount.healthy) {
    return <StatusDot label="Connected" color="success" tooltip="Last CLIPPING request from this account succeeded." />;
  }
  return (
    <StatusDot
      label="Error"
      color="destructive"
      tooltip={clippingAccount.lastError?.message ?? "The last CLIPPING request from this account failed."}
    />
  );
}

export function InstagramAccountsPage() {
  const { data, isLoading } = useInstagramAccounts();
  const { data: clippingAccountsData } = useClippingAccounts();
  const [credentialsTarget, setCredentialsTarget] = useState<InstagramAccount | null>(null);

  const clippingAccountsById = new Map((clippingAccountsData?.items ?? []).map((a) => [a.id, a]));
  const groups = data ? groupByClippingAccount(data.items) : new Map<string, InstagramAccount[]>();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Socials</h1>
        <AddInstagramAccountModal />
      </div>

      <div className="flex flex-col gap-5">
        {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        {data &&
          Array.from(groups.entries()).map(([key, accounts]) => {
            const isUnlinked = key === UNLINKED_GROUP;
            const clippingAccount = isUnlinked ? null : clippingAccountsById.get(key);
            return (
              <div key={key} className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2 px-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>{isUnlinked ? "Not linked to a CLIPPING account" : (clippingAccount?.label ?? "Unknown account")}</span>
                  {clippingAccount && <GroupStatus clippingAccount={clippingAccount} />}
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
