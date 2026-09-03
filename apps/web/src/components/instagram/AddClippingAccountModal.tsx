import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useLoginNewClippingAccount, useLoginNewStatus } from "@/api/clippingAccounts";
import { useDefaultClippingCampaignId } from "@/lib/clippingCampaignDefault";
import { Loader2, Plus } from "lucide-react";

export function AddClippingAccountModal({ trigger }: { trigger?: (openModal: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const { value: defaultCampaignId } = useDefaultClippingCampaignId();
  const start = useLoginNewClippingAccount();
  const { data: status } = useLoginNewStatus(pendingId);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const settledRef = useRef(false);

  useEffect(() => {
    if (!status || !pendingId || status.inProgress || settledRef.current) return;
    settledRef.current = true;
    queryClient.invalidateQueries({ queryKey: ["clipping-accounts"] });

    if (status.account) {
      toast({
        title: "Account connected",
        description: `Signed in as ${status.account.email ?? status.account.label}.`,
        variant: "success",
      });
    } else {
      toast({
        title: "Sign-in didn't complete",
        description: status.error ?? "The browser window was closed before signing in finished.",
        variant: "destructive",
      });
    }
    setOpen(false);
    setPendingId(null);
  }, [status, pendingId, queryClient, toast]);

  const handleOpenChange = (next: boolean) => {
    // While a sign-in is in flight, the browser window is the thing to close, not this
    // dialog — ignore overlay/Escape dismiss attempts until it settles.
    if (!next && pendingId !== null) return;
    setOpen(next);
  };

  const handleSubmit = () => {
    settledRef.current = false;
    start.mutate(defaultCampaignId, {
      onSuccess: (result) => setPendingId(result.id),
      onError: (error) => toast({ title: "Could not start sign-in", description: error.message, variant: "destructive" }),
    });
  };

  const busy = start.isPending || pendingId !== null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add CLIPPING Account
        </Button>
      )}
      <DialogContent>
        {busy ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium">Waiting for sign-in</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Finish signing in on the browser window that just opened. This closes on its own once you're done.
              </p>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add CLIPPING Account</DialogTitle>
              <DialogDescription>
                A browser window will open next — just sign in there, and we'll take care of the rest.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit}>Continue</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
