import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronUp, Copy, ExternalLink, RotateCcw, Terminal } from "lucide-react";
import type { ClippingAccountStatus } from "@/api/clippingAccounts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusDot } from "@/components/layout/StatusDot";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SlideToConfirm } from "@/components/ui/slide-to-confirm";
import { useIntegrationsStatus } from "@/api/integrations";
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
import { useAuth } from "@/lib/auth";
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
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

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
              disabled={account.openInProgress || openAccount.isPending}
              title={
                account.hasStorageState
                  ? "Opens a browser window showing this account, already signed in."
                  : "Opens a browser window to sign in — reuses this account's browser profile, so you won't need to re-verify Discord."
              }
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
              onClick={() => setConfirmRemoveOpen(true)}
            >
              Remove
            </Button>
          </div>
        </div>
      )}

      <Dialog open={confirmRemoveOpen} onOpenChange={setConfirmRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove "{account.label}"?</DialogTitle>
            <DialogDescription>
              This disconnects it from RIPPLELINK. You can add it again later, but you'll need to sign in again.
            </DialogDescription>
          </DialogHeader>
          <SlideToConfirm
            label="Slide to remove"
            confirmedLabel="Removing…"
            disabled={deactivate.isPending}
            onConfirm={() =>
              deactivate.mutate(account.id, {
                onSuccess: () => {
                  if (isActive) setSelectedId(null);
                  setConfirmRemoveOpen(false);
                  toast({ title: `Removed "${account.label}"` });
                },
                onError: (error) => {
                  setConfirmRemoveOpen(false);
                  toast({ title: "Couldn't remove", description: error.message, variant: "destructive" });
                },
              })
            }
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

const PLAYWRIGHT_INSTALL_COMMAND = "npx playwright install chromium";

// CLIPPING login/sync runs through a real Chromium browser (Playwright), which needs a
// one-time install separate from the app itself — surfaced here so a first-time user isn't
// left guessing after a cryptic "Failed to launch Playwright's Chromium" error the first time
// they click Log in.
function PlaywrightSetupNotice() {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; output: string } | null>(null);
  const [platformKind, setPlatformKind] = useState<string>("browser");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: integrations } = useIntegrationsStatus();
  const installed = integrations?.playwright.installed ?? false;

  useEffect(() => {
    getPlatform().then((p) => setPlatformKind(p.kind));
  }, []);

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(PLAYWRIGHT_INSTALL_COMMAND);
      toast({ title: "Copied", variant: "success" });
    } catch {
      toast({ title: "Couldn't copy — select and copy the command manually.", variant: "destructive" });
    }
  };

  const runForMe = async () => {
    setRunning(true);
    setResult(null);
    try {
      const platform = await getPlatform();
      const outcome = await platform.runPlaywrightInstall();
      setResult(outcome);
      if (outcome.success) {
        toast({ title: "Chromium installed", variant: "success" });
        queryClient.invalidateQueries({ queryKey: ["integrations-status"] });
      }
    } catch (error) {
      setResult({ success: false, output: error instanceof Error ? error.message : "Unknown error." });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-border/70 p-2.5">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded((v) => !v)}
      >
        <Terminal className="h-3.5 w-3.5" /> Playwright's browser
        {installed ? (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="h-3 w-3" /> Installed
          </Badge>
        ) : (
          <Badge variant="warning">Not installed</Badge>
        )}
        <span className="flex-1" />
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {expanded && (
        <div className="mt-2.5 grid gap-2.5 text-xs text-muted-foreground">
          <p>One-time setup for linking CLIPPING accounts.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-accent/60 px-2.5 py-1.5 font-mono text-[11px] text-foreground">
              {PLAYWRIGHT_INSTALL_COMMAND}
            </code>
            <Button variant="outline" size="sm" onClick={copyCommand}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
            {platformKind === "desktop" && (
              <Button variant="secondary" size="sm" disabled={running} onClick={runForMe}>
                {running ? "Running…" : "Run for me"}
              </Button>
            )}
          </div>
          {result && (
            <pre
              className={cn(
                "max-h-32 overflow-auto whitespace-pre-wrap rounded-md border p-2 font-mono text-[11px]",
                result.success ? "border-success/40 bg-success/5 text-foreground" : "border-destructive/40 bg-destructive/5 text-destructive"
              )}
            >
              {result.output || (result.success ? "Done." : "Failed.")}
            </pre>
          )}
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
              onClick={async () => (await getPlatform()).notify("RIPPLELINK", "Notifications are working.")}
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

// updateUser({password}) applies to whichever account the CURRENT session belongs to — no old
// password required, since a signed-in session is already proof of identity. That's the same
// call the "forgot password" email-link flow uses (see ResetPasswordPage.tsx); this is just a
// second, more convenient entry point for someone who's already signed in and just wants to
// change it, not reset it because they're locked out.
function ChangePasswordModal() {
  const { updatePassword } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const reset = () => {
    setPassword("");
    setConfirm("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    const result = await updatePassword(password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    reset();
    toast({ title: "Password updated", variant: "success" });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Change password
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Set a new password for your account.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <div className="grid gap-1.5">
            <Label htmlFor="change-password-new">New password</Label>
            <Input
              id="change-password-new"
              type="password"
              autoComplete="new-password"
              autoFocus
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="change-password-confirm">Confirm password</Label>
            <Input
              id="change-password-confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "…" : "Update password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsPage() {
  const { data: clippingAccounts } = useClippingAccounts();
  const defaultCampaignId = useDefaultClippingCampaignId();
  const [campaignIdDraft, setCampaignIdDraft] = useState(defaultCampaignId.value);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const { toast } = useToast();
  const { session, signOut } = useAuth();

  useEffect(() => {
    // Only the desktop app has a real, discrete version number — a browser tab is
    // continuously deployed and has no equivalent concept, so this stays null there and the
    // badge below just doesn't render.
    getPlatform().then((platform) => {
      if (platform.kind !== "desktop") return;
      platform.getAppVersion().then(setAppVersion);
    });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        {appVersion && <Badge variant="outline" className="text-muted-foreground">v{appVersion}</Badge>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">{session?.user.email}</span>
          <div className="flex shrink-0 items-center gap-2">
            <ChangePasswordModal />
            <Button variant="outline" size="sm" onClick={() => signOut()}>
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle>CLIPPING Accounts</CardTitle>
          <AddClippingAccountModal />
        </CardHeader>
        <CardContent className="grid gap-2">
          <PlaywrightSetupNotice />
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
