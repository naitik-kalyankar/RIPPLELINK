import { useEffect, useRef, useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { LINK_REEL_MUTATION_KEY } from "@/api/reels";
import { cn } from "@/lib/utils";

type Phase = "idle" | "loading" | "completing";

/** Fixed to the bottom of the whole app (not just the current page) so it stays visible across
 * navigation — LinkReelModal closes immediately on submit rather than blocking the user in the
 * dialog until the CLIPPING submission finishes, so this is the only indicator that it's still
 * running. Tracks LINK_REEL_MUTATION_KEY rather than a local isPending so it reflects reality
 * regardless of which (possibly now-unmounted) component fired the request — the bulk-link
 * mutation shares that key's prefix (see BULK_LINK_REELS_MUTATION_KEY), so this also covers
 * the "Link N Reels to CLIPPING" bulk action on the Reels page, not just the single-Reel modal. */
export function LinkingProgressBar() {
  const isPending = useIsMutating({ mutationKey: LINK_REEL_MUTATION_KEY }) > 0;
  const [phase, setPhase] = useState<Phase>("idle");
  const wasPending = useRef(false);

  useEffect(() => {
    if (isPending) {
      wasPending.current = true;
      setPhase("loading");
      return;
    }
    if (!wasPending.current) return;
    wasPending.current = false;
    setPhase("completing");
    const timeout = setTimeout(() => setPhase("idle"), 350);
    return () => clearTimeout(timeout);
  }, [isPending]);

  if (phase === "idle") return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-[70] h-0.5 overflow-hidden bg-border/30 transition-opacity duration-300",
        phase === "completing" && "opacity-0"
      )}
      role="progressbar"
      aria-label="Linking to CLIPPING"
      aria-valuetext={phase === "loading" ? "In progress" : "Complete"}
    >
      <div
        className={cn(
          "h-full bg-gradient-to-r from-transparent via-primary to-transparent",
          phase === "loading" ? "w-2/5 animate-progress-shine" : "w-full transition-[width] duration-200 ease-out"
        )}
      />
    </div>
  );
}
