import { useState } from "react";
import { ChevronDown, ChevronUp, Link2 } from "lucide-react";
import type { InstagramAccount } from "@kick-manager/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateInstagramAccount, useInstagramAccounts } from "@/api/instagram";
import {
  useClippingAccounts,
  useClippingLinkedAccounts,
  type ClippingAccountStatus,
  type ClippingLinkedAccountView,
} from "@/api/clippingAccounts";
import { StatusDot } from "@/components/layout/StatusDot";
import { AddInstagramAccountModal } from "@/components/instagram/AddInstagramAccountModal";
import { InstagramAccountCard } from "@/components/instagram/InstagramAccountCard";
import { EditInstagramCredentialsDialog } from "@/components/instagram/EditInstagramCredentialsDialog";
import { useToast } from "@/components/ui/toast";

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
    return <StatusDot label="Connected" color="success" tooltip="Signed in — session cookie present." />;
  }
  return (
    <StatusDot
      label="Error"
      color="destructive"
      tooltip={clippingAccount.lastError?.message ?? "No session cookie found — sign in again."}
    />
  );
}

// Pastes a Meta access token to actually link one of CLIPPING's accounts to this app — a plain
// "Add" would create a tokenless stub that can't fetch real Reels, which isn't really "linked".
// Username/account ID come straight from CLIPPING (read-only here); only the token is asked for.
function LinkClippingAccountDialog({
  item,
  clippingAccountId,
  open,
  onOpenChange,
}: {
  item: ClippingLinkedAccountView | null;
  clippingAccountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [accessToken, setAccessToken] = useState("");
  const create = useCreateInstagramAccount();
  const { toast } = useToast();

  const handleSubmit = () => {
    if (!item) return;
    create.mutate(
      { accessToken, clippingAccountId: item.id, clippingAccountRefId: clippingAccountId },
      {
        onSuccess: (account) => {
          toast({ title: `Linked @${account.username}`, variant: "success" });
          onOpenChange(false);
          setAccessToken("");
        },
        onError: (error) => toast({ title: "Couldn't link", description: error.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setAccessToken(""); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link @{item?.username}</DialogTitle>
          <DialogDescription>
            Paste this account's Meta access token (Graph API Explorer) to link it — CLIPPING's own
            username and account ID are used automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="link-access-token">Access token</Label>
          <Input
            id="link-access-token"
            type="password"
            placeholder="Generated via Graph API Explorer for this account"
            autoComplete="new-password"
            autoFocus
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!accessToken.trim() || create.isPending}>
            {create.isPending ? "Linking…" : "Link Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// CLIPPING's own linked-accounts list for one group, showing whichever of them don't have a
// local InstagramAccount row yet — the matched ones are already visible as cards above this,
// so repeating them here would just be noise.
function LinkedOnClippingSection({ clippingAccount }: { clippingAccount: ClippingAccountStatus }) {
  const { data, isLoading } = useClippingLinkedAccounts(clippingAccount.id);
  const [linkTarget, setLinkTarget] = useState<ClippingLinkedAccountView | null>(null);
  const [expanded, setExpanded] = useState(false);

  if (!clippingAccount.hasStorageState) return null;
  const unmatched = data?.items.filter((item) => !item.localAccountId) ?? [];
  // An unhealthy account whose CLIPPING page came back with zero accounts (not even ones
  // already linked here) almost always means the scrape silently hit a signed-out session —
  // CLIPPING just renders no data instead of erroring — rather than genuinely having none.
  // Surface that instead of quietly showing nothing, which looked like a bug from the outside.
  const likelyScrapeFailure = !isLoading && !clippingAccount.healthy && (data?.items.length ?? 0) === 0;
  if (!isLoading && unmatched.length === 0 && !likelyScrapeFailure) return null;

  if (likelyScrapeFailure) {
    return (
      <div className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
        Couldn't read "{clippingAccount.label}"'s linked accounts from CLIPPING — its session looks
        signed out. Re-log in on the Settings page, then this will repopulate.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-border/70 p-2.5">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-0.5 text-[11px] text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded((v) => !v)}
      >
        <span>On CLIPPING but not linked yet{!isLoading && ` (${unmatched.length})`}</span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {expanded &&
        (isLoading ? (
          <Skeleton className="mt-1.5 h-8 w-full" />
        ) : (
          <div className="mt-1.5 flex flex-col gap-1">
            {unmatched.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent/40">
                <span className="min-w-0 truncate">
                  @{item.username} <span className="text-xs text-muted-foreground">· {item.platform}</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => setLinkTarget(item)}>
                  <Link2 className="h-3.5 w-3.5" /> Link
                </Button>
              </div>
            ))}
          </div>
        ))}
      <LinkClippingAccountDialog
        item={linkTarget}
        clippingAccountId={clippingAccount.id}
        open={linkTarget !== null}
        onOpenChange={(open) => !open && setLinkTarget(null)}
      />
    </div>
  );
}

export function InstagramAccountsPage() {
  const { data, isLoading } = useInstagramAccounts();
  const { data: clippingAccountsData } = useClippingAccounts();
  const [credentialsTarget, setCredentialsTarget] = useState<InstagramAccount | null>(null);

  const clippingAccountsById = new Map((clippingAccountsData?.items ?? []).map((a) => [a.id, a]));
  const groups = data ? groupByClippingAccount(data.items) : new Map<string, InstagramAccount[]>();
  // A CLIPPING account with zero locally-added Instagram accounts wouldn't otherwise get a
  // group row at all — but that's exactly when "linked on CLIPPING but not added here" matters
  // most, so make sure every CLIPPING account has a row even with an empty account list.
  for (const clippingAccount of clippingAccountsData?.items ?? []) {
    if (!groups.has(clippingAccount.id)) groups.set(clippingAccount.id, []);
  }

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
                {clippingAccount && <LinkedOnClippingSection clippingAccount={clippingAccount} />}
              </div>
            );
          })}
        {data && data.items.length === 0 && groups.size === 0 && (
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
