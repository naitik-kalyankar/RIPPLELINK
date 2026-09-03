import { Link2 } from "lucide-react";
import { AddClippingAccountModal } from "@/components/instagram/AddClippingAccountModal";

// A new user has a Supabase session but no CLIPPING account connected yet — nothing else in the
// app is useful without one (no Reels, no Instagram accounts, no bounty list), so this replaces
// the whole AppShell instead of letting them wander into a bunch of empty states across pages.
// Reuses AddClippingAccountModal's existing headed-Playwright login flow via a custom `trigger`,
// styled as a full-screen entry point instead of a Settings-page button.
export function ClippingAccountGate() {
  return (
    <div className="flex h-full items-center justify-center bg-background p-4">
      <div className="flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Link2 className="h-6 w-6" />
        </span>
        <div>
          <p className="text-base font-semibold">Connect your CLIPPING.net account</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Sign in with CLIPPING to continue — this is where your Reels, campaigns, and payouts come from.
          </p>
        </div>
        <AddClippingAccountModal trigger={(openModal) => (
          <button
            type="button"
            onClick={openModal}
            className="mt-1 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Sign in to CLIPPING.net
          </button>
        )} />
      </div>
    </div>
  );
}
