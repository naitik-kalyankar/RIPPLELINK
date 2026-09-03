import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Link2, Loader2, X } from "lucide-react";
import { useLinkQueue, type LinkQueueHours, type LinkQueueItem } from "@/lib/linkQueue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const OTHER_BOUNTY_TAG = "other";

/** The small queue-row thumbnail is too tiny to actually tell Reels apart at a glance —
 * hovering shows a real-size preview instead, same Tooltip primitive used everywhere else in
 * the app for on-hover detail, just with an image instead of text. */
function ThumbnailPreview({ src, className }: { src: string; className: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <img src={src} alt="" className={className} />
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="border-none bg-transparent p-0 shadow-xl">
        <img src={src} alt="" className="h-64 w-44 rounded-lg border border-border object-cover" />
      </TooltipContent>
    </Tooltip>
  );
}

const TIME_OPTIONS: { hours: LinkQueueHours; label: string }[] = [
  { hours: 12, label: "Last 12 hours" },
  { hours: 24, label: "Last 24 hours" },
  { hours: 36, label: "Last 36 hours" },
  { hours: 48, label: "Last 48 hours" },
  { hours: 64, label: "Last 64 hours" },
];

/** Idle state — no run exists yet. This IS the "menu": a real, always-visible entry point in
 * the sidebar, not just the Reels-page toolbar button, so there's something to click here
 * before ever starting a run. */
function LinkAllStarter() {
  const { start, isFetching } = useLinkQueue();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Closes itself once the fetch it triggered actually resolves — without this, clicking a
  // time option just closed the menu immediately with no sign anything was happening, which
  // read as "nothing happened" while the (silent) fetch was still in flight underneath.
  useEffect(() => {
    if (isFetching) setOpen(false);
  }, [isFetching]);

  return (
    <div ref={rootRef} className="relative border-t border-border/70 p-2.5">
      <button
        type="button"
        disabled={isFetching}
        title="Link All Reels"
        onClick={() => setOpen((v) => !v)}
        // Icon-only + centered below xl (matches Sidebar's own icon-rail breakpoint, see
        // Sidebar.tsx) — the label and chevron used to stay in the DOM the whole time and just
        // get squeezed by flex-1/truncate, but at the rail's 72px width there wasn't even room
        // for the icon, gaps, and chevron alone (~54px needed vs ~52px available), so the
        // chevron spilled out past the button's own rounded border with nothing to clip it.
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground disabled:cursor-wait disabled:opacity-70 xl:justify-start"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
        </span>
        <span className="hidden min-w-0 flex-1 truncate text-left font-medium xl:inline">
          {isFetching ? "Checking for Reels…" : "Link All Reels"}
        </span>
        {!isFetching && (
          <ChevronDown className={cn("hidden h-3.5 w-3.5 shrink-0 transition-transform xl:block", open && "rotate-180")} />
        )}
      </button>

      {open && (
        // A fixed width, not inset-x-2.5 (tied to this container's own width) — the sidebar is
        // only 72px wide in its icon-rail state (see Sidebar.tsx, collapsed until xl), which was
        // squeezing every option's text ("Last 12 hours") into a ~50px-wide column and wrapping
        // it across three lines. Anchored to the left edge instead, so it floats out over the
        // main content at a width that actually fits its own text.
        <div className="absolute bottom-full left-2.5 z-40 mb-1.5 w-56 rounded-lg border border-border bg-card p-1.5 shadow-lg">
          <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Link everything available
          </p>
          {TIME_OPTIONS.map((o) => (
            <button
              key={o.hours}
              type="button"
              onClick={() => {
                start(o.hours);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent"
            >
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" /> {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The actual prompt — one text field, live-resolved as you type: matches a real, enabled
 * CLIPPING bounty → normal/success styling and links as that bounty; doesn't match anything →
 * the field turns orange with an inline "(other)" tag, and submitting sends "other" with
 * whatever was typed preserved as the note. One button, one outcome either way — no separate
 * "Other" action to remember to use. */
function BountyResolveDialog({
  item,
  open,
  onOpenChange,
  onSubmit,
  onSkip,
  skipLabel,
}: {
  item: LinkQueueItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (bountyTag: string, notes: string) => Promise<void>;
  onSkip: () => void;
  skipLabel: string;
}) {
  const { bountyOptions } = useLinkQueue();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const listId = `bounty-suggestions-${item.reelId}`;

  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  const trimmed = value.trim();
  const matched = bountyOptions.find((b) => b.name.toLowerCase() === trimmed.toLowerCase() && b.active);
  const isOther = trimmed.length > 0 && !matched;

  const submit = async () => {
    setSubmitting(true);
    await onSubmit(matched ? matched.name : OTHER_BOUNTY_TAG, matched ? "" : trimmed);
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set the bounty for this Reel</DialogTitle>
          <DialogDescription>No creator was detected automatically — type the bounty/creator name.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <ThumbnailPreview src={item.thumbnailUrl} className="h-16 w-11 shrink-0 rounded object-cover" />
          <div className="min-w-0 flex-1">
            <Input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              list={listId}
              placeholder="Type bounty/creator name…"
              autoComplete="off"
              className={cn(isOther && "border-warning text-warning focus-visible:ring-warning")}
            />
            <datalist id={listId}>
              {bountyOptions
                .filter((b) => b.active)
                .map((b) => (
                  <option key={b.id} value={b.name} />
                ))}
            </datalist>
            {isOther && (
              <p className="mt-1.5 text-xs text-warning">
                Not in CLIPPING's bounty list — will link as <span className="font-semibold">other</span>.
              </p>
            )}
            {matched && <p className="mt-1.5 text-xs text-success">Matches CLIPPING's "{matched.name}" bounty.</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onSkip} disabled={submitting}>
            {skipLabel}
          </Button>
          <Button
            onClick={submit}
            disabled={!trimmed || submitting}
            className={cn(isOther && "bg-warning text-warning-foreground hover:bg-warning/90")}
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isOther ? "Link as Other" : "Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Auto-opens the moment the run itself pauses on an unknown-creator item (see linkQueue.tsx's
 * process() — this is a REAL pause, not a UI overlay: the sequential loop is suspended waiting
 * for resolvePending/skipPending). Always mounted alongside the status card, not just inside the
 * details popup, so it interrupts wherever the user currently is, same as the run itself keeps
 * going regardless of which page is open. */
function PendingResolutionPrompt() {
  const { pendingResolution, resolvePending, skipPending } = useLinkQueue();
  if (!pendingResolution) return null;

  return (
    <BountyResolveDialog
      item={pendingResolution}
      open
      onOpenChange={(open) => !open && skipPending()}
      onSubmit={async (bountyTag, notes) => resolvePending(bountyTag, notes)}
      onSkip={skipPending}
      skipLabel="Skip for now"
    />
  );
}

/** One row inside the batch pre-resolve dialog — same live match/(other) logic as
 * BountyResolveDialog, just local state per row instead of a whole separate Dialog per item. */
function PreResolveRow({
  item,
  bountyOptions,
  onChange,
}: {
  item: LinkQueueItem;
  bountyOptions: { id: string; name: string; active: boolean }[];
  onChange: (reelId: string, answer: { bountyTag: string; notes: string } | null) => void;
}) {
  const [value, setValue] = useState("");
  const listId = `pre-resolve-suggestions-${item.reelId}`;

  const trimmed = value.trim();
  const matched = bountyOptions.find((b) => b.name.toLowerCase() === trimmed.toLowerCase() && b.active);
  const isOther = trimmed.length > 0 && !matched;

  const handleChange = (next: string) => {
    setValue(next);
    const nextTrimmed = next.trim();
    if (!nextTrimmed) {
      onChange(item.reelId, null);
      return;
    }
    const nextMatched = bountyOptions.find((b) => b.name.toLowerCase() === nextTrimmed.toLowerCase() && b.active);
    onChange(item.reelId, { bountyTag: nextMatched ? nextMatched.name : OTHER_BOUNTY_TAG, notes: nextMatched ? "" : nextTrimmed });
  };

  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/40">
      <ThumbnailPreview src={item.thumbnailUrl} className="h-14 w-10 shrink-0 rounded object-cover" />
      <div className="min-w-0 flex-1">
        <Input
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          list={listId}
          placeholder="Type bounty/creator name…"
          autoComplete="off"
          className={cn("h-8 text-sm", isOther && "border-warning text-warning focus-visible:ring-warning")}
        />
        <datalist id={listId}>
          {bountyOptions
            .filter((b) => b.active)
            .map((b) => (
              <option key={b.id} value={b.name} />
            ))}
        </datalist>
      </div>
      {isOther && <span className="shrink-0 text-xs font-medium text-warning">(other)</span>}
      {matched && <span className="shrink-0 text-xs font-medium text-success">matched</span>}
    </div>
  );
}

/** Batch version of the resolve prompt — the current ask: collect input for EVERY
 * unknown-creator Reel up front, before the run itself ever starts, instead of pausing on them
 * one at a time mid-run. `start()` in linkQueue.tsx stashes the fetched Reels and sets
 * preResolveItems instead of calling buildQueueAndRun immediately whenever any exist; this is
 * the only thing that ever clears that state (by submitting or cancelling). */
function PreResolveBatchDialog() {
  const { preResolveItems, bountyOptions, submitPreResolutions, cancelPreResolve } = useLinkQueue();
  const answersRef = useRef<Map<string, { bountyTag: string; notes: string } | null>>(new Map());

  if (!preResolveItems) return null;

  const handleChange = (reelId: string, answer: { bountyTag: string; notes: string } | null) => {
    answersRef.current.set(reelId, answer);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && cancelPreResolve()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Set bounties for {preResolveItems.length} unknown creators</DialogTitle>
          <DialogDescription>
            No creator was detected for these Reels — type a bounty/creator name for each before the run starts. A
            name that doesn't match CLIPPING's list links as "other". Leave blank to skip a Reel.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[55vh] gap-1 overflow-y-auto scrollbar-thin">
          {preResolveItems.map((item) => (
            <PreResolveRow key={item.reelId} item={item} bountyOptions={bountyOptions} onChange={handleChange} />
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={cancelPreResolve}>
            Cancel
          </Button>
          <Button onClick={() => submitPreResolutions(new Map(answersRef.current))}>Start Linking</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Manual re-resolve for an item that already settled as "skipped" (the prompt above was
 * dismissed with Skip, or this is from before this feature existed) — same dialog, opened by
 * hand instead of automatically, submitting through linkSingle instead of the paused loop. */
function ResolveSkippedButton({ item }: { item: LinkQueueItem }) {
  const { linkSingle } = useLinkQueue();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-xs" onClick={() => setOpen(true)}>
        Resolve
      </Button>
      <BountyResolveDialog
        item={item}
        open={open}
        onOpenChange={setOpen}
        onSubmit={async (bountyTag, notes) => {
          await linkSingle(item.reelId, bountyTag, notes);
          setOpen(false);
        }}
        onSkip={() => setOpen(false)}
        skipLabel="Cancel"
      />
    </>
  );
}

/** "Link All"'s live status, pinned to the bottom of the main Sidebar — visible on every page,
 * not just Reels (see lib/linkQueue, which runs independent of whichever page is mounted).
 * Before a run exists, this is the starter (LinkAllStarter) instead — the sidebar always shows
 * one or the other, never neither. */
export function LinkQueuePanel() {
  const { items, isRunning, pausedReason, resume, dismiss } = useLinkQueue();
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (items.length === 0) {
    return (
      <>
        <PreResolveBatchDialog />
        <LinkAllStarter />
      </>
    );
  }

  const total = items.length;
  const linked = items.filter((i) => i.status === "linked").length;
  const errored = items.filter((i) => i.status === "failed" || i.status === "skipped").length;
  const settled = linked + errored;
  const pct = total > 0 ? Math.round((settled / total) * 100) : 0;

  const color = isRunning ? "orange" : errored > 0 || pausedReason ? "red" : "green";

  return (
    <div className="border-t border-border/70 p-2.5">
      <PreResolveBatchDialog />
      <PendingResolutionPrompt />

      {/* Icon-rail (below xl, see Sidebar.tsx) doesn't have room for the full status card below
       * — its badge + dismiss button alone need more width than the whole 72px-wide rail has
       * left after padding, which used to spill them out past the card's rounded border. A
       * single color-coded icon button that opens the same details Dialog is what actually fits. */}
      <button
        type="button"
        onClick={() => setDetailsOpen(true)}
        title={`Link All — ${settled}/${total}`}
        className={cn(
          "flex w-full items-center justify-center rounded-xl border p-2.5 transition-colors hover:brightness-110 xl:hidden",
          color === "green" && "border-success/30 bg-success/10 text-success",
          color === "orange" && "border-warning/30 bg-warning/10 text-warning",
          color === "red" && "border-destructive/30 bg-destructive/10 text-destructive"
        )}
      >
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : color === "red" ? (
          <AlertTriangle className="h-4 w-4" />
        ) : (
          <Check className="h-4 w-4" />
        )}
      </button>

      <div
        className={cn(
          "hidden rounded-xl border p-3 xl:block",
          color === "green" && "border-success/30 bg-success/10",
          color === "orange" && "border-warning/30 bg-warning/10",
          color === "red" && "border-destructive/30 bg-destructive/10"
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
              color === "green" && "bg-success/20 text-success",
              color === "orange" && "bg-warning/20 text-warning",
              color === "red" && "bg-destructive/20 text-destructive"
            )}
          >
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : color === "red" ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {isRunning ? "Linking Reels…" : pausedReason ? "Paused" : errored > 0 ? "Finished with errors" : "All linked"}
          </span>

          {/* The clickable "settled/total" badge — square, per the ask, and the only way into
           * the per-Reel breakdown popup. */}
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            title="Show Reels"
            className={cn(
              "flex h-7 w-11 shrink-0 items-center justify-center rounded-md border text-xs font-bold tabular-nums transition-colors hover:brightness-110",
              color === "green" && "border-success/40 bg-success/15 text-success",
              color === "orange" && "border-warning/40 bg-warning/15 text-warning",
              color === "red" && "border-destructive/40 bg-destructive/15 text-destructive"
            )}
          >
            {settled}/{total}
          </button>

          {!isRunning && (
            <button
              type="button"
              onClick={dismiss}
              title="Dismiss"
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-background/60">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300 ease-out",
              color === "green" && "bg-success",
              color === "orange" && "bg-warning",
              color === "red" && "bg-destructive"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>

        {pausedReason && (
          <div className="mt-2.5 flex flex-col gap-1.5 text-xs text-destructive">
            <span>{pausedReason}</span>
            <Button size="sm" variant="outline" className="h-6 w-fit border-destructive/40 px-2 text-xs text-destructive" onClick={resume}>
              Resume
            </Button>
          </div>
        )}
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link All — {settled}/{total}</DialogTitle>
            <DialogDescription>
              {linked} linked{errored > 0 ? `, ${errored} error(s)` : ""}
              {isRunning ? " · still running" : ""}
            </DialogDescription>
          </DialogHeader>
          {/* Same Resume action the wide card shows inline (xl:block above) — duplicated here so
           * it's still reachable when the sidebar is collapsed to its icon rail, where that card
           * is hidden and this Dialog is the only surface open. */}
          {pausedReason && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive xl:hidden">
              <span>{pausedReason}</span>
              <Button size="sm" variant="outline" className="h-6 w-fit border-destructive/40 px-2 text-xs text-destructive" onClick={resume}>
                Resume
              </Button>
            </div>
          )}
          <div className="grid max-h-[60vh] gap-1 overflow-y-auto scrollbar-thin">
            {items.map((item) => {
              // "Skipped" only ever means one thing (see linkQueue.tsx's process loop): no
              // creator was detected at all, so there was never a bounty tag to try in the
              // first place — distinct from "failed", which did attempt a real submission.
              const isUnknownCreator = item.status === "skipped";
              return (
                <div key={item.reelId} className="flex flex-col gap-1.5 rounded-lg px-2 py-1.5 hover:bg-accent/40">
                  <div className="flex items-center gap-3">
                    <ThumbnailPreview src={item.thumbnailUrl} className="h-11 w-8 shrink-0 rounded object-cover" />
                    <span className={cn("min-w-0 flex-1 truncate text-sm", isUnknownCreator && "font-medium text-destructive")}>
                      {item.label}
                      {item.usedOtherBounty && <span className="text-warning">(other)</span>}
                    </span>
                    {item.status === "pending" && <span className="shrink-0 text-xs text-muted-foreground">Waiting</span>}
                    {item.status === "linking" && (
                      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-warning">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Linking
                      </span>
                    )}
                    {item.status === "linked" && (
                      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-success">
                        <Check className="h-3.5 w-3.5" /> Linked
                      </span>
                    )}
                    {item.status === "failed" && (
                      <span
                        className="flex shrink-0 items-center gap-1.5 truncate text-xs font-medium text-destructive"
                        title={item.error}
                      >
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Failed
                      </span>
                    )}
                    {isUnknownCreator && (
                      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Unknown creator
                      </span>
                    )}
                    {isUnknownCreator && <ResolveSkippedButton item={item} />}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Same Dismiss the wide card shows inline (xl:block above) — duplicated here for the
           * collapsed icon rail, same reasoning as the Resume block above. */}
          {!isRunning && (
            <DialogFooter className="xl:hidden">
              <Button variant="outline" onClick={() => { dismiss(); setDetailsOpen(false); }}>
                Dismiss
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
