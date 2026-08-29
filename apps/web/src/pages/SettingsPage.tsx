import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export function SettingsPage() {
  const [platformKind, setPlatformKind] = useState<string>("…");
  const [appVersion, setAppVersion] = useState<string>("…");
  const { data: clippingAccounts } = useClippingAccounts();
  const { selectedId, setSelectedId } = useClippingScope();
  const login = useLoginClippingAccount();
  const openAccount = useOpenClippingAccount();
  const syncLinked = useSyncLinkedClippingAccounts();
  const deactivate = useDeactivateClippingAccount();
  const { toast } = useToast();
  const defaultCampaignId = useDefaultClippingCampaignId();
  const [campaignIdDraft, setCampaignIdDraft] = useState(defaultCampaignId.value);

  useEffect(() => {
    getPlatform().then(async (platform) => {
      setPlatformKind(platform.kind);
      setAppVersion(await platform.getAppVersion());
    });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Environment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Running as</span>
            <Badge variant="outline">{platformKind === "desktop" ? "Desktop (Tauri)" : "Browser"}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">App version</span>
            <span>{appVersion}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">API endpoint</span>
            <span className="font-mono text-xs">{import.meta.env.VITE_API_URL ?? "http://localhost:4000"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CLIPPING Defaults</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="default-campaign-id">Default campaign ID</Label>
            <p className="text-xs text-muted-foreground">
              Pre-fills "Campaign ID" whenever you add a new CLIPPING account, so it doesn't
              need to be retyped every time.
            </p>
            <div className="flex flex-wrap gap-2">
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
                  toast({ title: "Default campaign ID saved", variant: "success" });
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
                <RotateCcw className="h-3.5 w-3.5" /> Reset to default
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle>CLIPPING Accounts</CardTitle>
          <AddClippingAccountModal />
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">
            Add each of your CLIPPING accounts here and stay signed into all of them at once.
            Click "Set active" to switch the rest of the app to just that account's data — you
            can also switch from the sidebar.
          </p>
          {!clippingAccounts?.items.length ? (
            <p className="text-sm text-muted-foreground">No CLIPPING accounts added yet.</p>
          ) : (
            <div className="grid gap-2">
              {clippingAccounts.items.map((account) => {
                const isActive = account.id === selectedId;
                return (
                  <div
                    key={account.id}
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      isActive ? "border-primary/40 bg-primary/5" : "border-border"
                    )}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{account.label}</span>
                          {account.email && <span className="text-xs text-muted-foreground">{account.email}</span>}
                          {isActive && (
                            <Badge variant="outline" className="gap-1 text-primary">
                              <CheckCircle2 className="h-3 w-3" /> Active
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Signed in {formatRelativeTime(account.lastLoginAt)} · Last synced {formatRelativeTime(account.lastUsedAt)}
                        </p>
                        {account.lastPayout != null && (
                          <p className="mt-1 text-xs">
                            <span className="font-medium text-foreground">{formatCurrency(account.lastPayout)}</span>
                            <span className="text-muted-foreground"> earned so far · updated {formatRelativeTime(account.lastPayoutFetchedAt)}</span>
                          </p>
                        )}
                      </div>
                      {account.loginInProgress ? (
                        <StatusDot label="Signing in…" color="muted" tooltip="Finish signing in in the window that opened." pulse />
                      ) : !account.hasStorageState ? (
                        <StatusDot
                          label="Not signed in"
                          color="muted"
                          tooltip={account.lastLoginError ?? "Click Log in to connect this account."}
                        />
                      ) : account.healthy ? (
                        <StatusDot label="Connected" color="success" tooltip="Everything's working." />
                      ) : (
                        <StatusDot
                          label="Error"
                          color="destructive"
                          tooltip={account.lastError?.message ?? "Something went wrong with this account."}
                        />
                      )}
                    </div>

                    {(account.lastLoginError ?? account.lastOpenError) && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        <span>{account.lastLoginError ?? account.lastOpenError}</span>
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

                    <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                      <Button
                        variant={isActive ? "secondary" : "outline"}
                        size="sm"
                        disabled={isActive}
                        onClick={() => setSelectedId(account.id)}
                      >
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
                                  (mismatches.length > 0
                                    ? ` ${mismatches.length} needed fixing — see the activity log.`
                                    : ""),
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
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Native capabilities</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
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
        </CardContent>
      </Card>
    </div>
  );
}
