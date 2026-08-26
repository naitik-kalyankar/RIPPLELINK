import { useEffect, useState } from "react";
import type { InstagramAccount } from "@kick-manager/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useUpdateInstagramAccount } from "@/api/instagram";
import { useClippingAccounts } from "@/api/clippingAccounts";

interface EditInstagramCredentialsDialogProps {
  account: InstagramAccount | null;
  onOpenChange: (open: boolean) => void;
}

export function EditInstagramCredentialsDialog({ account, onOpenChange }: EditInstagramCredentialsDialogProps) {
  const [accessToken, setAccessToken] = useState("");
  const [clippingAccountId, setClippingAccountId] = useState("");
  const [clippingAccountRefId, setClippingAccountRefId] = useState<string>("none");
  const update = useUpdateInstagramAccount();
  const { data: clippingAccounts } = useClippingAccounts();
  const { toast } = useToast();

  // Not a secret (unlike accessToken), so it's fine to prefill for editing.
  useEffect(() => {
    setClippingAccountId(account?.clippingAccountId ?? "");
    setClippingAccountRefId(account?.clippingAccountRefId ?? "none");
  }, [account?.id, account?.clippingAccountId, account?.clippingAccountRefId]);

  if (!account) return null;

  const handleSave = () => {
    update.mutate(
      {
        id: account.id,
        input: {
          accessToken: accessToken || undefined,
          clippingAccountId: clippingAccountId || undefined,
          clippingAccountRefId: clippingAccountRefId === "none" ? null : clippingAccountRefId,
        },
      },
      {
        onSuccess: () => {
          toast({ title: `Updated @${account.username}`, variant: "success" });
          onOpenChange(false);
          setAccessToken("");
        },
        onError: (error) => toast({ title: "Update failed", description: error.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={Boolean(account)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Credentials — @{account.username}</DialogTitle>
          <DialogDescription>
            {account.hasAccessToken
              ? "A token is already set for this account (~60 day lifetime — rotate it here before it expires)."
              : "No token set — this account is currently syncing mock data. Add one to fetch real Reels."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="edit-access-token">Instagram access token</Label>
            <Input
              id="edit-access-token"
              type="password"
              placeholder={account.hasAccessToken ? "•••••••••••••••• (paste a fresh one to replace)" : "Generated via Graph API Explorer"}
              autoComplete="new-password"
              autoFocus
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-clipping-account-id">CLIPPING account ID</Label>
            <Input
              id="edit-clipping-account-id"
              placeholder="CLIPPING's internal ID for this account — required to submit its Reels"
              autoComplete="off"
              value={clippingAccountId}
              onChange={(e) => setClippingAccountId(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-clipping-account-ref">CLIPPING account (linked)</Label>
            <Select value={clippingAccountRefId} onValueChange={setClippingAccountRefId}>
              <SelectTrigger id="edit-clipping-account-ref">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not linked yet</SelectItem>
                {clippingAccounts?.items.map((clippingAccount) => (
                  <SelectItem key={clippingAccount.id} value={clippingAccount.id}>
                    {clippingAccount.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Which CLIPPING login (Playwright-backed session, set up on the Settings page) submissions for this
              Instagram account go through.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              update.isPending ||
              (!accessToken &&
                !clippingAccountId &&
                clippingAccountRefId === (account.clippingAccountRefId ?? "none"))
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
