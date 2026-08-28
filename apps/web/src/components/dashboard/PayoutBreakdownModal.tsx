import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { ClippingAccountStatus } from "@/api/clippingAccounts";
import { formatCurrency } from "@/lib/utils";

interface PayoutBreakdownModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: ClippingAccountStatus[];
}

export function PayoutBreakdownModal({ open, onOpenChange, accounts }: PayoutBreakdownModalProps) {
  const withBreakdown = accounts.filter((a) => a.lastPayoutBountyBreakdown.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Payout breakdown</DialogTitle>
          <DialogDescription>How much each creator has earned so far, straight from CLIPPING.</DialogDescription>
        </DialogHeader>

        {withBreakdown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No breakdown yet — sync your accounts to load this.
          </p>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto scrollbar-thin">
            {withBreakdown.map((account) => (
              <div key={account.id}>
                {withBreakdown.length > 1 && (
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{account.label}</p>
                )}
                <div className="grid gap-1">
                  {account.lastPayoutBountyBreakdown
                    .slice()
                    .sort((a, b) => b.payout - a.payout)
                    .map((bounty) => (
                      <div
                        key={bounty.bounty}
                        className="flex items-center justify-between gap-2 rounded-md bg-accent/30 px-3 py-2 text-sm"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium">{bounty.bounty}</span>
                          {!bounty.minViewsReached && (
                            <Badge variant="outline" className="shrink-0 text-muted-foreground">
                              Needs more views
                            </Badge>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-3 tabular-nums text-muted-foreground">
                          <span>{bounty.views.toLocaleString()} views</span>
                          <span className="font-medium text-foreground">{formatCurrency(bounty.payout)}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
