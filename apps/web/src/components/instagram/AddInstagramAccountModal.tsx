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
import { useCreateInstagramAccount } from "@/api/instagram";
import { Plus } from "lucide-react";

export function AddInstagramAccountModal() {
  const [open, setOpen] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [mockMode, setMockMode] = useState(false);
  const [username, setUsername] = useState("");
  const [instagramId, setInstagramId] = useState("");
  const create = useCreateInstagramAccount();
  const { toast } = useToast();

  const canSubmit = mockMode ? username.trim() && instagramId.trim() : accessToken.trim().length > 0;

  const reset = () => {
    setAccessToken("");
    setMockMode(false);
    setUsername("");
    setInstagramId("");
  };

  const handleSubmit = () => {
    create.mutate(
      mockMode
        ? { username: username.replace(/^@/, ""), instagramId }
        : { accessToken },
      {
        onSuccess: (account) => {
          toast({
            title: `Added @${account.username}`,
            description: mockMode ? "Mock mode — no access token set." : "Live — will fetch real Reels on sync.",
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
          <Plus className="h-3.5 w-3.5" /> Add Instagram Account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Instagram Account</DialogTitle>
          <DialogDescription>
            {mockMode
              ? "Add a mock account for demo/testing — no real Instagram data."
              : "Paste an access token generated for this account via Graph API Explorer. Username and account ID are detected automatically."}
          </DialogDescription>
        </DialogHeader>

        {!mockMode ? (
          <div className="grid gap-1.5">
            <Label htmlFor="access-token">Access token</Label>
            <Input
              id="access-token"
              type="password"
              placeholder="Generated via Graph API Explorer for this account"
              autoComplete="new-password"
              autoFocus
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="username">Instagram username</Label>
              <Input
                id="username"
                placeholder="@username"
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="instagram-id">Instagram account ID</Label>
              <Input
                id="instagram-id"
                placeholder="Any unique value, e.g. mock-1"
                autoComplete="off"
                value={instagramId}
                onChange={(e) => setInstagramId(e.target.value)}
              />
            </div>
          </div>
        )}

        <button
          type="button"
          className="justify-self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setMockMode((v) => !v)}
        >
          {mockMode ? "← Use a real access token instead" : "Add a mock account instead (no access token)"}
        </button>

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
