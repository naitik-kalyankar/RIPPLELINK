import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ClippingBounty, PaginatedResult, Reel } from "@kick-manager/shared";
import { apiClient, ApiError } from "@/lib/apiClient";
import { useCampaignId } from "@/api/clipping";
import { useToast } from "@/components/ui/toast";

const OTHER_BOUNTY_TAG = "other";

export type LinkQueueHours = 12 | 24 | 36 | 48 | 64;

export interface LinkQueueItem {
  reelId: string;
  thumbnailUrl: string;
  label: string;
  status: "pending" | "linking" | "linked" | "failed" | "skipped";
  error?: string;
  /** True once resolveBountyTag has actually run for this item and decided the detected name
   * isn't a real/enabled CLIPPING bounty — submitted (or about to be) as "other" with the name
   * preserved in Notes instead. Undefined while still "pending" (not resolved yet). */
  usedOtherBounty?: boolean;
}

interface LinkQueueContextValue {
  items: LinkQueueItem[];
  isRunning: boolean;
  /** True only during the initial "figure out what's eligible" fetch, before there's a queue
   * to show at all — separate from isRunning so the starter button can show its own spinner
   * instead of silently doing nothing while this is in flight (see start()). */
  isFetching: boolean;
  /** Set when the queue stopped itself mid-run rather than finishing — currently only after a
   * CLIPPING session comes back genuinely dead (the backend already retries once with a
   * refreshed session before ever reporting this — see HttpClippingProvider — so by the time it
   * reaches here, blasting through the rest of the queue would just fail identically). */
  pausedReason: string | null;
  /** CLIPPING's live bounty list from the run's own start() fetch — exposed so a "skipped, no
   * creator detected" row can offer a name-suggestion datalist instead of a bare text box. */
  bountyOptions: ClippingBounty[];
  start: (hours: LinkQueueHours) => void;
  resume: () => void;
  dismiss: () => void;
  /** Manually resolves an already-"skipped" (no creator detected) item after the fact — typed a
   * name that matches a real bounty, or "other". Works outside the sequential loop (the item
   * isn't "pending" anymore once skipped, so process() would never touch it again on its own). */
  linkSingle: (reelId: string, bountyTag: string, notes: string) => Promise<void>;
  /** The item the sequential run is CURRENTLY blocked on because it has no detected creator —
   * set the moment process() hits one with nothing pre-resolved for it (see preResolveItems
   * below — normally this never fires since every unknown-creator Reel already got a chance up
   * front, this is the fallback for one that somehow didn't). Cleared once resolvePending/
   * skipPending answers it. The queue genuinely pauses here (not just UI state) until answered. */
  pendingResolution: LinkQueueItem | null;
  /** Answers the pause above: submits with the given tag/notes and lets process() continue. */
  resolvePending: (bountyTag: string, notes: string) => void;
  /** Answers the pause by leaving this item skipped (same as before this feature existed) and
   * lets process() continue to the next item — still resolvable later via linkSingle. */
  skipPending: () => void;
  /** Every unknown-creator Reel in the run that's about to start, waiting on a batch answer
   * BEFORE the queue actually begins — set right after start()'s own fetch resolves, before
   * anything is submitted. Null once submitPreResolutions answers it (or there was nothing to
   * ask, in which case the run starts straight away without ever setting this). */
  preResolveItems: LinkQueueItem[] | null;
  /** Answers preResolveItems and actually starts the run — a `null` value for a reelId means
   * "leave it skipped", anything else is submitted with that exact tag/notes. Every reelId in
   * preResolveItems should have an entry (missing ones are treated as skipped). */
  submitPreResolutions: (answers: Map<string, { bountyTag: string; notes: string } | null>) => void;
  /** Cancels the whole run before it starts — only meaningful while preResolveItems is set. */
  cancelPreResolve: () => void;
}

const LinkQueueContext = createContext<LinkQueueContextValue | null>(null);

async function fetchEligibleReels(dateRange: string): Promise<Reel[]> {
  const collected: Reel[] = [];
  let page = 1;
  while (true) {
    const params = new URLSearchParams({ status: "unlinked", dateRange, sort: "newest", page: String(page), limit: "100" });
    const result = await apiClient.get<PaginatedResult<Reel>>(`/api/reels?${params.toString()}`);
    collected.push(...result.items);
    if (!result.hasNext) break;
    page += 1;
  }
  return collected;
}

export function LinkQueueProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<LinkQueueItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [pausedReason, setPausedReason] = useState<string | null>(null);
  const [bountyOptions, setBountyOptions] = useState<ClippingBounty[]>([]);
  const [pendingResolution, setPendingResolution] = useState<LinkQueueItem | null>(null);
  // The process() loop is literally suspended on this promise while pendingResolution is set —
  // resolvePending/skipPending settle it, which is what actually lets the for-loop continue.
  const pendingResolveRef = useRef<((answer: { bountyTag: string; notes: string } | null) => void) | null>(null);
  const [preResolveItems, setPreResolveItems] = useState<LinkQueueItem[] | null>(null);
  // The full eligible-reels fetch from start(), held here while preResolveItems is being
  // answered — submitPreResolutions needs it to actually build the queue afterward.
  const pendingReelsRef = useRef<Reel[] | null>(null);
  // What the batch pre-resolve dialog decided for each unknown-creator reelId — checked by
  // process() instead of pausing again for anything already answered up front.
  const resolvedOverrides = useRef<Map<string, { bountyTag: string; notes: string }>>(new Map());
  const campaignId = useCampaignId();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // Avoids two overlapping runs (e.g. clicking "Link All" again while one's already going).
  const runningRef = useRef(false);
  // The reels backing the current queue — needed for each item's detectedIdentifier (the
  // bounty tag), which isn't part of LinkQueueItem itself (that's just display/status state).
  const reelById = useRef<Map<string, Reel>>(new Map());
  // CLIPPING's live bounty list, snapshotted once at the start of a run — same source
  // LinkReelModal and ReelCard check a detected name against. A name this app detected that
  // ISN'T in here (like "alexis" — see the orange-highlight fix) would just fail outright if
  // submitted as-is; resolveBountyTag below is what makes the queue fall back to "other" +
  // the original name in Notes automatically, the same thing "Use other" does by hand.
  const bounties = useRef<ClippingBounty[]>([]);
  // The authoritative, synchronous queue the loop actually walks — React state (`items`) is
  // just a mirror of this for rendering, updated after every step. Reading `items` back inside
  // the loop would risk a stale closure; this local array never has that problem.
  const queueRef = useRef<LinkQueueItem[]>([]);

  const syncItems = () => setItems([...queueRef.current]);

  // Resolves what to actually submit: the real bounty tag when CLIPPING recognizes it and it's
  // enabled, otherwise "other" with the original name preserved in Notes — mirrors
  // LinkReelModal's isUnknownBounty/isDisabledBounty + "Use other" button exactly, just applied
  // automatically instead of waiting for a click.
  const resolveBountyTag = (detectedIdentifier: string): { bountyTag: string; notes: string } => {
    const match = bounties.current.find((b) => b.name.toLowerCase() === detectedIdentifier.toLowerCase());
    if (match && match.active) return { bountyTag: match.name, notes: "" };
    return { bountyTag: OTHER_BOUNTY_TAG, notes: detectedIdentifier };
  };

  const process = useCallback(async () => {
    runningRef.current = true;
    setIsRunning(true);
    setPausedReason(null);

    for (let i = 0; i < queueRef.current.length; i++) {
      if (!runningRef.current) break; // paused mid-loop
      const item = queueRef.current[i];
      if (item.status !== "pending") continue;

      const reel = reelById.current.get(item.reelId);
      const detectedIdentifier = reel?.creator?.detectedIdentifier;

      let bountyTag: string;
      let notes: string;
      if (!detectedIdentifier) {
        const preResolved = resolvedOverrides.current.get(item.reelId);
        if (preResolved) {
          // Already answered up front by the batch pre-resolve dialog (the normal path — see
          // start()) — nothing to pause for.
          ({ bountyTag, notes } = preResolved);
        } else {
          // Fallback only: something reached the loop as "pending" with no creator AND no
          // pre-resolved answer, which the normal start() flow shouldn't produce (every
          // unknown-creator Reel goes through preResolveItems first). Pauses the run here — not
          // just a UI flag — and waits for the popup (resolvePending/skipPending) to answer
          // before this loop takes another step.
          setPendingResolution(item);
          const answer = await new Promise<{ bountyTag: string; notes: string } | null>((resolve) => {
            pendingResolveRef.current = resolve;
          });
          setPendingResolution(null);
          pendingResolveRef.current = null;
          if (!runningRef.current) break; // dismissed/paused elsewhere while waiting
          if (!answer) {
            queueRef.current[i] = { ...item, status: "skipped", error: "No creator detected" };
            syncItems();
            continue;
          }
          ({ bountyTag, notes } = answer);
        }
      } else {
        ({ bountyTag, notes } = resolveBountyTag(detectedIdentifier));
      }

      queueRef.current[i] = { ...item, status: "linking", usedOtherBounty: bountyTag === OTHER_BOUNTY_TAG };
      syncItems();
      try {
        await apiClient.post(`/api/reels/${item.reelId}/link`, { campaignId, bountyTag, notes });
        queueRef.current[i] = { ...queueRef.current[i], status: "linked" };
        syncItems();
        // Per item, not just once at the end of the whole run — otherwise the Reels page (or
        // Dashboard) kept showing an already-linked Reel's old "Link" button for as long as the
        // rest of a long-running batch was still going, only catching up once everything
        // finished. invalidateQueries only triggers a refetch for queries actually mounted right
        // now, so this is a no-op cost-wise whenever nobody's looking at the Reels page.
        queryClient.invalidateQueries({ queryKey: ["reels"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      } catch (error) {
        const isAuthFailure = error instanceof ApiError && error.code === "clipping_auth";
        const message = error instanceof Error ? error.message : "Unknown error.";
        queueRef.current[i] = { ...queueRef.current[i], status: "failed", error: message };
        syncItems();
        if (isAuthFailure) {
          // Already retried once with a freshly refreshed session server-side and still
          // failed — a genuinely dead session, not a transient blip. The rest of the queue
          // would just fail the same way, so stop here rather than burn through it.
          runningRef.current = false;
          setPausedReason(`Session expired — re-log in, then click Resume. (${message})`);
          break;
        }
      }
    }

    runningRef.current = false;
    setIsRunning(false);
    queryClient.invalidateQueries({ queryKey: ["reels"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }, [campaignId, queryClient]);

  // Builds the actual queue and kicks off process() — shared by the "nothing to pre-resolve"
  // fast path and submitPreResolutions, so both end up starting the run identically.
  const buildQueueAndRun = (reels: Reel[], overrides: Map<string, { bountyTag: string; notes: string } | null>) => {
    resolvedOverrides.current = new Map();
    queueRef.current = reels.map((r) => {
      const detectedIdentifier = r.creator?.detectedIdentifier;
      const override = detectedIdentifier ? undefined : overrides.get(r.id);
      if (override !== undefined) {
        // Answered by the batch pre-resolve dialog before the run even started.
        if (override === null) {
          return { reelId: r.id, thumbnailUrl: r.thumbnailUrl, label: "Unknown creator", status: "skipped" as const, error: "No creator detected" };
        }
        resolvedOverrides.current.set(r.id, override);
        return {
          reelId: r.id,
          thumbnailUrl: r.thumbnailUrl,
          label: "Unknown creator",
          status: "pending" as const,
          usedOtherBounty: override.bountyTag === OTHER_BOUNTY_TAG,
        };
      }
      return {
        reelId: r.id,
        thumbnailUrl: r.thumbnailUrl,
        // Matches ReelCard's own "no creator" fallback text exactly — same concept, same
        // wording, wherever it shows up in the app.
        label: r.creator?.displayName ?? "Unknown creator",
        status: "pending" as const,
        // Resolved up front for every item with a detected identifier (not lazily, right before
        // its own turn) so the popup shows "(other)" for everything that'll need it the moment
        // it opens — the actual submission still re-resolves this at its own turn in process().
        usedOtherBounty: detectedIdentifier ? resolveBountyTag(detectedIdentifier).bountyTag === OTHER_BOUNTY_TAG : undefined,
      };
    });
    syncItems();
    void process();
  };

  const start = useCallback(
    (hours: LinkQueueHours) => {
      if (runningRef.current || isFetching) return;
      setIsFetching(true);
      Promise.all([
        fetchEligibleReels(`last_${hours}_hours`),
        apiClient.get<{ items: ClippingBounty[] }>("/api/clipping/bounties").then((r) => r.items),
      ])
        .then(([reels, bountyList]) => {
          // Nothing eligible (everything's already linked, or nothing was published in this
          // window) — without this, the starter button would just close with no queue ever
          // appearing and no explanation, which reads as "nothing happened" / broken.
          if (reels.length === 0) {
            toast({ title: `No unlinked Reels found in the last ${hours} hours`, description: "Try a longer window." });
            return;
          }
          bounties.current = bountyList;
          setBountyOptions(bountyList);
          reelById.current = new Map(reels.map((r) => [r.id, r]));

          const unknownReels = reels.filter((r) => !r.creator?.detectedIdentifier);
          if (unknownReels.length > 0) {
            // Ask about all of them up front, before anything is submitted — see
            // submitPreResolutions, which is what actually builds the queue and starts running.
            pendingReelsRef.current = reels;
            setPreResolveItems(
              unknownReels.map((r) => ({ reelId: r.id, thumbnailUrl: r.thumbnailUrl, label: "Unknown creator", status: "pending" }))
            );
            return;
          }

          buildQueueAndRun(reels, new Map());
        })
        .catch((error) => {
          toast({
            title: "Couldn't start Link All",
            description: error instanceof Error ? error.message : "Unknown error.",
            variant: "destructive",
          });
        })
        .finally(() => setIsFetching(false));
    },
    [process, isFetching, toast]
  );

  const submitPreResolutions = (answers: Map<string, { bountyTag: string; notes: string } | null>) => {
    const reels = pendingReelsRef.current;
    pendingReelsRef.current = null;
    setPreResolveItems(null);
    if (reels) buildQueueAndRun(reels, answers);
  };

  const cancelPreResolve = () => {
    pendingReelsRef.current = null;
    setPreResolveItems(null);
  };

  const resume = useCallback(() => {
    if (runningRef.current) return;
    void process();
  }, [process]);

  const dismiss = useCallback(() => {
    if (runningRef.current) return;
    queueRef.current = [];
    setItems([]);
    setPausedReason(null);
  }, []);

  // Doesn't touch runningRef/isRunning — a manual single resolution isn't "the queue running"
  // in the same sense (no auth-pause semantics, no blocking a concurrent start()), it's just
  // one row's status changing while the rest sits however it already was.
  const linkSingle = useCallback(
    async (reelId: string, bountyTag: string, notes: string) => {
      const index = queueRef.current.findIndex((x) => x.reelId === reelId);
      if (index === -1) return;
      queueRef.current[index] = {
        ...queueRef.current[index],
        status: "linking",
        usedOtherBounty: bountyTag === OTHER_BOUNTY_TAG,
        error: undefined,
      };
      syncItems();
      try {
        await apiClient.post(`/api/reels/${reelId}/link`, { campaignId, bountyTag, notes });
        queueRef.current[index] = { ...queueRef.current[index], status: "linked" };
      } catch (error) {
        queueRef.current[index] = {
          ...queueRef.current[index],
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error.",
        };
      }
      syncItems();
      queryClient.invalidateQueries({ queryKey: ["reels"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    [campaignId, queryClient]
  );

  const resolvePending = useCallback((bountyTag: string, notes: string) => {
    pendingResolveRef.current?.({ bountyTag, notes });
  }, []);

  const skipPending = useCallback(() => {
    pendingResolveRef.current?.(null);
  }, []);

  return (
    <LinkQueueContext.Provider
      value={{
        items,
        isRunning,
        isFetching,
        pausedReason,
        bountyOptions,
        start,
        resume,
        dismiss,
        linkSingle,
        pendingResolution,
        resolvePending,
        skipPending,
        preResolveItems,
        submitPreResolutions,
        cancelPreResolve,
      }}
    >
      {children}
    </LinkQueueContext.Provider>
  );
}

export function useLinkQueue(): LinkQueueContextValue {
  const ctx = useContext(LinkQueueContext);
  if (!ctx) throw new Error("useLinkQueue must be used within a LinkQueueProvider");
  return ctx;
}
