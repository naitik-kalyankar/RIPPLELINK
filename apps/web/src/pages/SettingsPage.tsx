import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, RotateCcw } from "lucide-react";
import type { ClippingAccountStatus } from "@/api/clippingAccounts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusDot } from "@/components/layout/StatusDot";
import { getPlatform } from "@/platform";
import {
  useClippingAccounts,
  useDeactivateClippingAccount,
  useLoginClippingAccount,
  useOpenClippingAccount,
  useSyncLinkedClippingAccounts,
} from "@/api/clippingAccounts";
import { useClippingScope } from "@/lib/clippingScope";
import { DEFAULT_CLIPPING_CAMPAIGN_ID, useDefaultClippingCampaignId } from "@/lib/clippingCampaignDefault";
import { AddClippingAccountModal } from "@/components/instagram/AddClippingAccountModal";
import { useToast } from "@/components/ui/toast";
import { cn, formatCurrency, formatRelativeTime } from "@/lib/utils";

function accountStatus(account: ClippingAccountStatus) {
  if (account.loginInProgress) {
    return { label: "Signing in…", color: "muted" as const, tooltip: "Finish signing in in the window that opened.", pulse: true };
  }
  if (!account.hasStorageState) {
    return { label: "Not signed in", color: "muted" as const, tooltip: account.lastLoginError ?? "Click Log in to connect this account." };
  }
  if (account.healthy) {
    return { label: "Connected", color: "success" as const, tooltip: "Everything's working." };
  }
  return { label: "Error", color: "destructive" as const, tooltip: account.lastError?.message ?? "Something went wrong with this account." };
}

function ClippingAccountRow({ account }: { account: ClippingAccountStatus }) {
  const { selectedId, setSelectedId } = useClippingScope();
  const login = useLoginClippingAccount();
  const openAccount = useOpenClippingAccount();
  const syncLinked = useSyncLinkedClippingAccounts();
  const deactivate = useDeactivateClippingAccount();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);

  const isActive = account.id === selectedId;
  const status = accountStatus(account);
  const conflictError = account.lastLoginError ?? account.lastOpenError;

  return (
    <div className={cn("rounded-lg border transition-colors", isActive ? "border-primary/40 bg-primary/5" : "border-border")}>
      <div className="flex items-center gap-2 p-2.5">
        <StatusDot {...status} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{account.label}</span>
        <Button variant={isActive ? "secondary" : "outline"} size="sm" disabled={isActive} onClick={() => setSelectedId(account.id)}>
          {isActive ? "Active" : "Set active"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={account.loginInProgress || login.isPending}
          onClick={() =>
            login.mutate(account.id, {
              onSuccess: (result) => toast({ title: "Opening browser…", description: result.message }),
              onError: (error) => toast({ title: "Could not start login", description: error.message, variant: "destructive" }),
            })
          }
        >
          {account.hasStorageState ? "Re-log in" : "Log in"}
        </Button>
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Show less" : "Show more"}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {conflictError && (
        <div className="mx-2.5 mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span>{conflictError}</span>
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
            disabled={account.loginInProgress || login.isPending}
            onClick={() =>
              login.mutate(account.id, {
                onSuccess: (result) => toast({ title: "Opening browser…", description: result.message }),
                onError: (error) => toast({ title: "Could not start login", description: error.message, variant: "destructive" }),
              })
            }
          >
            Log in as "{account.label}"
          </Button>
        </div>
      )}

      {expanded && (
        <div className="border-t border-border/60 p-2.5 pt-2 text-xs text-muted-foreground">
          <p>
            {account.email && <span>{account.email} · </span>}
            Signed in {formatRelativeTime(account.lastLoginAt)} · Synced {formatRelativeTime(account.lastUsedAt)}
          </p>
          {account.lastPayout != null && (
            <p className="mt-1">
              <span className="font-medium text-foreground">{formatCurrency(account.lastPayout)}</span> earned so
              far · updated {formatRelativeTime(account.lastPayoutFetchedAt)}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!account.hasStorageState || account.openInProgress || openAccount.isPending}
              title={!account.hasStorageState ? "Log in first, then you can open it." : "Opens a browser window showing this account, already signed in."}
              onClick={() =>
                openAccount.mutate(account.id, {
                  onError: (error) => toast({ title: "Couldn't open", description: error.message, variant: "destructive" }),
                })
              }
            >
              <ExternalLink className="h-3.5 w-3.5" /> {account.openInProgress ? "Open in browser…" : "Open in browser"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!account.hasStorageState || syncLinked.isPending}
              title={!account.hasStorageState ? "Log in first to connect its Instagram accounts." : undefined}
              onClick={() =>
                syncLinked.mutate(account.id, {
                  onSuccess: (result) => {
                    const mismatches = result.items.filter((i) => i.mismatch);
                    toast({
                      title: `Found ${result.matchedCount} Instagram account(s)`,
                      description:
                        `${result.updatedCount} connected.` +
                        (mismatches.length > 0 ? ` ${mismatches.length} needed fixing — see the activity log.` : ""),
                      variant: mismatches.length > 0 ? "default" : "success",
                    });
                  },
                  onError: (error) => toast({ title: "Couldn't connect accounts", description: error.message, variant: "destructive" }),
                })
              }
            >
              Find Instagram accounts
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              disabled={deactivate.isPending}
              onClick={() =>
                deactivate.mutate(account.id, {
                  onSuccess: () => {
                    if (isActive) setSelectedId(null);
                    toast({ title: `Removed "${account.label}"` });
                  },
                })
              }
            >
              Remove
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AdvancedSection() {
  const [expanded, setExpanded] = useState(false);
  const [platformKind, setPlatformKind] = useState<string>("…");
  const [appVersion, setAppVersion] = useState<string>("…");

  useEffect(() => {
    getPlatform().then(async (platform) => {
      setPlatformKind(platform.kind);
      setAppVersion(await platform.getAppVersion());
    });
  }, []);

  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded((v) => !v)}
      >
        Advanced
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {expanded && (
        <div className="mt-3 grid gap-4 rounded-lg border border-border p-3 text-xs text-muted-foreground">
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <span>Running as</span>
              <span>{platformKind === "desktop" ? "Desktop (Tauri)" : "Browser"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>App version</span>
              <span>{appVersion}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>API endpoint</span>
              <span className="font-mono">{import.meta.env.VITE_API_URL ?? "http://localhost:4000"}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => (await getPlatform()).notify("Reel Manager", "Notifications are working.")}
            >
              Test notification
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => (await getPlatform()).openExternal("https://www.instagram.com/")}
            >
              Test open external link
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsPage() {
  const { data: clippingAccounts } = useClippingAccounts();
  const defaultCampaignId = useDefaultClippingCampaignId();
  const [campaignIdDraft, setCampaignIdDraft] = useState(defaultCampaignId.value);
  const { toast } = useToast();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle>CLIPPING Accounts</CardTitle>
          <AddClippingAccountModal />
        </CardHeader>
        <CardContent className="grid gap-2">
          {!clippingAccounts?.items.length ? (
            <p className="text-sm text-muted-foreground">No CLIPPING accounts added yet.</p>
          ) : (
            clippingAccounts.items.map((account) => <ClippingAccountRow key={account.id} account={account} />)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Default campaign ID</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Input
            id="default-campaign-id"
            className="max-w-sm font-mono text-xs"
            value={campaignIdDraft}
            onChange={(e) => setCampaignIdDraft(e.target.value)}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={!campaignIdDraft.trim() || campaignIdDraft.trim() === defaultCampaignId.value}
            onClick={() => {
              defaultCampaignId.setValue(campaignIdDraft.trim());
              toast({ title: "Saved", variant: "success" });
            }}
          >
            Save
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={defaultCampaignId.isDefault}
            onClick={() => {
              defaultCampaignId.reset();
              setCampaignIdDraft(DEFAULT_CLIPPING_CAMPAIGN_ID);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
        </CardContent>
      </Card>

      <AdvancedSection />
    </div>
  );
}
