import { useState } from "react";
import { Instagram, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import type { InstagramAccount } from "@kick-manager/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SlideToConfirm } from "@/components/ui/slide-to-confirm";
import { useToast } from "@/components/ui/toast";
import { useDeleteInstagramAccount, useSyncInstagramAccount, useUpdateInstagramAccount } from "@/api/instagram";
import { cn, formatRelativeTime } from "@/lib/utils";

interface InstagramAccountCardProps {
  account: InstagramAccount;
  onEditCredentials: (account: InstagramAccount) => void;
}

export function InstagramAccountCard({ account, onEditCredentials }: InstagramAccountCardProps) {
  const sync = useSyncInstagramAccount();
  const update = useUpdateInstagramAccount();
  const remove = useDeleteInstagramAccount();
  const { toast } = useToast();
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  return (
    <Card className="transition-colors hover:border-primary/25">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Instagram className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold">@{account.username}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-full", account.active ? "bg-success" : "bg-muted-foreground/40")}
                    aria-label={`${account.active ? "Active" : "Disabled"} · ${account.hasAccessToken ? "Live" : "Mock"}`}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  {account.active ? "Active" : "Disabled"} · {account.hasAccessToken ? "Live" : "Mock"}
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              {!account.clippingAccountId && (
                <>
                  <span className="text-warning">Missing CLIPPING account — add it in Credentials</span>
                  <span className="text-border">·</span>
                </>
              )}
              <span>Last synced: {formatRelativeTime(account.lastSyncedAt)}</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant={account.clippingAccountId ? "secondary" : "default"}
            size="sm"
            onClick={() => onEditCredentials(account)}
          >
            <KeyRound className="h-3.5 w-3.5" /> Credentials
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={sync.isPending || !account.active}
            onClick={() =>
              sync.mutate(account.id, {
                onSuccess: () => toast({ title: `Synced @${account.username}`, variant: "success" }),
                onError: (error) => toast({ title: "Sync failed", description: error.message, variant: "destructive" }),
              })
            }
          >
            <RefreshCw className={sync.isPending ? "animate-spin" : ""} /> Sync Now
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
            onClick={() => update.mutate({ id: account.id, input: { active: !account.active } })}
          >
            {account.active ? "Disable" : "Enable"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Remove"
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirmRemoveOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>

      <Dialog open={confirmRemoveOpen} onOpenChange={setConfirmRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove @{account.username}?</DialogTitle>
            <DialogDescription>
              This deletes it from RIPPLELINK along with every Reel synced under it. You can add it again later, but its history won't come back.
            </DialogDescription>
          </DialogHeader>
          <SlideToConfirm
            label="Slide to remove"
            confirmedLabel="Removing…"
            disabled={remove.isPending}
            onConfirm={() =>
              remove.mutate(account.id, {
                onSuccess: () => {
                  setConfirmRemoveOpen(false);
                  toast({ title: `Removed @${account.username}` });
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
    </Card>
  );
}
