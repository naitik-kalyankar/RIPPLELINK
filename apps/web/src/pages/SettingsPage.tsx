import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/layout/StatusDot";
import { getPlatform } from "@/platform";
import {
  useClippingAccounts,
  useDeactivateClippingAccount,
  useLoginClippingAccount,
  useSyncLinkedClippingAccounts,
} from "@/api/clippingAccounts";
import { useClippingScope } from "@/lib/clippingScope";
import { AddClippingAccountModal } from "@/components/instagram/AddClippingAccountModal";
import { useToast } from "@/components/ui/toast";
import { cn, formatRelativeTime } from "@/lib/utils";

export function SettingsPage() {
  const [platformKind, setPlatformKind] = useState<string>("…");
  const [appVersion, setAppVersion] = useState<string>("…");
  const { data: clippingAccounts } = useClippingAccounts();
  const { selectedId, setSelectedId } = useClippingScope();
  const login = useLoginClippingAccount();
  const syncLinked = useSyncLinkedClippingAccounts();
  const deactivate = useDeactivateClippingAccount();
  const { toast } = useToast();

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
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle>CLIPPING Accounts</CardTitle>
          <AddClippingAccountModal />
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">
            Each CLIPPING login runs as its own persistent, Playwright-backed browser session —
            multiple accounts can be active at once. "Set active" scopes the Dashboard, Reels,
            Upload Queue, and Clipping pages down to just that account's Instagram accounts
            (also switchable from the sidebar).
          </p>
          {!clippingAccounts?.items.length ? (
            <p className="text-sm text-muted-foreground">
              No CLIPPING accounts added yet — every Instagram account still uses the legacy,
              single-session cookie configured in the environment.
            </p>
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
                          Campaign: <span className="font-mono">{account.campaignId}</span> · Last login:{" "}
                          {formatRelativeTime(account.lastLoginAt)} · Last used: {formatRelativeTime(account.lastUsedAt)}
                        </p>
                      </div>
                      {account.loginInProgress ? (
                        <StatusDot label="Waiting for login…" color="muted" tooltip="A browser window is open on this machine — log in there to finish." pulse />
                      ) : !account.hasStorageState ? (
                        <StatusDot
                          label="Not logged in"
                          color="muted"
                          tooltip={account.lastLoginError ?? "Click Log in to connect this account."}
                        />
                      ) : account.healthy ? (
                        <StatusDot label="Connected" color="success" tooltip="Last CLIPPING request from this account succeeded." />
                      ) : (
                        <StatusDot
                          label="Error"
                          color="destructive"
                          tooltip={account.lastError?.message ?? "The last CLIPPING request from this account failed."}
                        />
                      )}
                    </div>

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
                        disabled={!account.hasStorageState || syncLinked.isPending}
                        title={!account.hasStorageState ? "Log in first to read its linked accounts." : undefined}
                        onClick={() =>
                          syncLinked.mutate(account.id, {
                            onSuccess: (result) => {
                              const mismatches = result.items.filter((i) => i.mismatch);
                              toast({
                                title: `${result.matchedCount} linked account(s) matched`,
                                description:
                                  `${result.updatedCount} filled in.` +
                                  (mismatches.length > 0
                                    ? ` ${mismatches.length} existing ID(s) look wrong — check the activity log.`
                                    : ""),
                                variant: mismatches.length > 0 ? "default" : "success",
                              });
                            },
                            onError: (error) => toast({ title: "Sync failed", description: error.message, variant: "destructive" }),
                          })
                        }
                      >
                        Sync linked accounts
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
