import { KeyRound, RefreshCw } from "lucide-react";
import type { InstagramAccount } from "@kick-manager/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { useSyncInstagramAccount, useUpdateInstagramAccount } from "@/api/instagram";
import { cn, formatRelativeTime } from "@/lib/utils";

interface InstagramAccountCardProps {
  account: InstagramAccount;
  onEditCredentials: (account: InstagramAccount) => void;
}

export function InstagramAccountCard({ account, onEditCredentials }: InstagramAccountCardProps) {
  const sync = useSyncInstagramAccount();
  const update = useUpdateInstagramAccount();
  const { toast } = useToast();

  return (
    <Card className="transition-colors hover:border-primary/25">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
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
            <span>Instagram ID: {account.instagramId}</span>
            <span className="text-border">·</span>
            <span>
              CLIPPING ID:{" "}
              {account.clippingAccountId ? (
                <span className="font-mono">{account.clippingAccountId}</span>
              ) : (
                <span className="text-warning">Not set — submissions will fail</span>
              )}
            </span>
            <span className="text-border">·</span>
            <span>Last synced: {formatRelativeTime(account.lastSyncedAt)}</span>
          </p>
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
        </div>
      </CardContent>
    </Card>
  );
}
