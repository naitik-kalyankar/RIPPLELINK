import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useCreateClippingAccount } from "@/api/clippingAccounts";
import { Plus } from "lucide-react";

export function AddClippingAccountModal() {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const create = useCreateClippingAccount();
  const { toast } = useToast();

  const canSubmit = label.trim().length > 0 && campaignId.trim().length > 0;

  const reset = () => {
    setLabel("");
    setCampaignId("");
  };

  const handleSubmit = () => {
    create.mutate(
      { label: label.trim(), campaignId: campaignId.trim() },
      {
        onSuccess: (account) => {
          toast({
            title: `Added "${account.label}"`,
            description: 'Click "Log in" next to it below to connect its session.',
            variant: "success",
          });
          setOpen(false);
          reset();
        },
        onError: (error) => toast({ title: "Could not add account", description: error.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Plus className="h-3.5 w-3.5" /> Add CLIPPING Account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add CLIPPING Account</DialogTitle>
          <DialogDescription>
            Creates the account row here — click "Log in" next to it afterward to connect its
            session (a real browser window opens on this machine). Its login email is
            detected automatically once you sign in, no need to type it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="clipping-label">Label</Label>
            <Input
              id="clipping-label"
              placeholder="e.g. Main, Client B"
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="clipping-campaign-id">Campaign ID</Label>
            <Input
              id="clipping-campaign-id"
              placeholder="CLIPPING's campaign ID for this login"
              autoComplete="off"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || create.isPending}>
            {create.isPending ? "Adding…" : "Add Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
