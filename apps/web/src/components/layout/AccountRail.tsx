import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LayoutGrid, LogOut, Plus, Settings } from "lucide-react";
import { useClippingAccounts, type ClippingAccountStatus } from "@/api/clippingAccounts";
import { useClippingScope } from "@/lib/clippingScope";
import { useAuth } from "@/lib/auth";
import { AddClippingAccountModal } from "@/components/instagram/AddClippingAccountModal";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SlideToConfirm } from "@/components/ui/slide-to-confirm";
import { RailButton } from "./RailButton";
import { cn } from "@/lib/utils";

function statusColor(account: ClippingAccountStatus): "success" | "destructive" | "muted" {
  if (account.loginInProgress || !account.hasStorageState) return "muted";
  return account.healthy ? "success" : "destructive";
}

const ORDER_STORAGE_KEY = "kick-manager:account-rail-order";

/** Drag-to-reorder position, persisted locally (per-device, like the other rail/UI
 * preferences already in this app — clippingScope, defaultCampaignId). Self-heals against
 * accounts that no longer exist and appends ones added since the order was last saved,
 * instead of ever needing a migration. */
function useOrderedAccounts(accounts: ClippingAccountStatus[]) {
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(ORDER_STORAGE_KEY);
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  });

  const accountIds = accounts.map((a) => a.id);
  const effectiveOrder = [...order.filter((id) => accountIds.includes(id)), ...accountIds.filter((id) => !order.includes(id))];

  const persist = (next: string[]) => {
    setOrder(next);
    try {
      localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage unavailable — the new order just won't survive a reload
    }
  };

  const byId = new Map(accounts.map((a) => [a.id, a]));
  const ordered = effectiveOrder.map((id) => byId.get(id)).filter((a): a is ClippingAccountStatus => !!a);

  const move = (draggedId: string, targetId: string, position: "before" | "after") => {
    if (draggedId === targetId) return;
    const next = effectiveOrder.filter((id) => id !== draggedId);
    const targetIndex = next.indexOf(targetId);
    next.splice(position === "before" ? targetIndex : targetIndex + 1, 0, draggedId);
    persist(next);
  };

  return { ordered, move };
}

interface DragHandlers {
  isDragging: boolean;
  /** Which side of THIS avatar the dragged one would land on if dropped right now — null when
   * nothing's being dragged over it. Drives the insertion-line indicator, Discord-style. */
  dropPosition: "before" | "after" | null;
  onDragStart: () => void;
  onDragOver: (position: "before" | "after") => void;
  onDragEnd: () => void;
}

function ClippingAccountAvatar({
  account,
  selected,
  onSelect,
  draggable,
}: {
  account: ClippingAccountStatus;
  selected: boolean;
  onSelect: () => void;
  draggable?: DragHandlers;
}) {
  const color = statusColor(account);
  // Falls back to the name-initial if there's no avatarUrl at all, OR if the URL CLIPPING gave
  // us fails to actually load (session-scoped image URLs can go stale) — same default CLIPPING
  // itself uses when an account has no photo set.
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = !!account.avatarUrl && !imgFailed;
  const avatarRef = useRef<HTMLDivElement>(null);
  return (
    <div
      className={cn("relative w-full", draggable?.isDragging && "opacity-40")}
      draggable={!!draggable}
      onDragStart={(e) => {
        draggable?.onDragStart();
        e.dataTransfer.effectAllowed = "move";
        // The draggable element is the full-width row (so the insertion line can span it), but
        // the native drag ghost should only be the round avatar itself, not that whole row —
        // otherwise it drags as a wide rectangle instead of keeping its circular frame.
        if (avatarRef.current) {
          const rect = avatarRef.current.getBoundingClientRect();
          e.dataTransfer.setDragImage(avatarRef.current, rect.width / 2, rect.height / 2);
        }
      }}
      onDragOver={(e) => {
        if (!draggable) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        draggable.onDragOver(e.clientY < rect.top + rect.height / 2 ? "before" : "after");
      }}
      onDragEnd={() => draggable?.onDragEnd()}
    >
      {draggable?.dropPosition === "before" && (
        <span className="absolute -top-[5px] left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
      )}
      {/* overflow-hidden matters specifically for the drag ghost below (setDragImage) — WebKit
       * (Tauri's macOS webview) doesn't reliably clip a dragged element to its border-radius the
       * way Chromium does; it needs an explicit overflow boundary or the drag preview renders
       * as a plain square instead of matching this avatar's rounded shape. */}
      <div ref={avatarRef} className="relative mx-auto w-fit overflow-hidden rounded-xl p-1">
        <RailButton selected={selected} title={account.label} onClick={onSelect}>
          {showImage ? (
            <img
              src={account.avatarUrl!}
              alt=""
              // WebKit gives <img> its own built-in drag behavior that overrides the parent's
              // custom setDragImage — it drags the raw square image at reduced opacity instead,
              // ignoring border-radius/overflow entirely. Disabling it here is what lets the
              // rounded div's setDragImage (see avatarRef above) actually take over as the ghost.
              style={{ WebkitUserDrag: "none" } as React.CSSProperties}
              className="h-[34px] w-[34px] rounded-xl object-cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-xl bg-primary/15 text-xs font-semibold uppercase text-primary">
              {account.label.charAt(0)}
            </span>
          )}
        </RailButton>
        <span
          className={cn(
            "pointer-events-none absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full ring-2 ring-card",
            color === "success" ? "bg-success" : color === "destructive" ? "bg-destructive" : "bg-muted-foreground/50"
          )}
        />
      </div>
      {draggable?.dropPosition === "after" && (
        <span className="absolute -bottom-[5px] left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
      )}
    </div>
  );
}

function AppAccountMenu() {
  const { session, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const email = session?.user.email ?? "";

  return (
    <div ref={rootRef} className="relative">
      <RailButton title={email || "Account"} onClick={() => setMenuOpen((v) => !v)}>
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-xl bg-accent text-xs font-semibold uppercase text-foreground">
          {email ? email.charAt(0) : "?"}
        </span>
      </RailButton>

      {menuOpen && (
        <div className="absolute bottom-0 left-full z-40 ml-2 w-52 rounded-lg border border-border bg-card p-1.5 shadow-lg">
          <p className="truncate px-2.5 py-1.5 text-xs text-muted-foreground">{email}</p>
          <Link
            to="/settings"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-accent"
          >
            <Settings className="h-3.5 w-3.5" /> Settings
          </Link>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setConfirmOpen(true);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-3.5 w-3.5" /> Log out
          </button>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log out?</DialogTitle>
            <DialogDescription>You'll need to sign back in to use RIPPLELINK again.</DialogDescription>
          </DialogHeader>
          <SlideToConfirm label="Slide to log out" confirmedLabel="Logging out…" onConfirm={() => signOut()} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The leftmost rail — one column further left than the main Sidebar, same idea as a Slack
 * workspace switcher: every CLIPPING account as its own avatar, click to scope the app down to
 * it (same scope AccountPanel used to drive), plus the app's own account pinned at the bottom. */
export function AccountRail() {
  const { data: clippingAccounts } = useClippingAccounts();
  const { selectedId, setSelectedId } = useClippingScope();
  const accounts = clippingAccounts?.items ?? [];
  const { ordered, move } = useOrderedAccounts(accounts);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: "before" | "after" } | null>(null);

  if (accounts.length === 0) return null;

  return (
    <aside className="hidden h-full w-14 shrink-0 flex-col items-center gap-1.5 py-3 md:flex">
      <RailButton title="All Accounts" selected={!selectedId} onClick={() => setSelectedId(null)}>
        <LayoutGrid className="h-4 w-4" />
      </RailButton>

      <div className="my-1 h-px w-6 bg-border/70" />

      <div
        className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto p-1 scrollbar-thin"
        // Committing the drop here (rather than on whichever individual avatar the cursor
        // happens to be exactly over at release) is what makes "release far above/below the
        // list, wherever the line last showed" actually work — the native `drop` event only
        // fires on the element currently under the cursor, which can be the gap between
        // avatars, the scrollbar, or nothing at all if the release is fast/far, but dropTarget
        // itself was already reliably tracked by the last avatar's dragover.
        onDragOver={(e) => draggingId && e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (draggingId && dropTarget) move(draggingId, dropTarget.id, dropTarget.position);
          setDraggingId(null);
          setDropTarget(null);
        }}
      >
        {ordered.map((account) => (
          <ClippingAccountAvatar
            key={account.id}
            account={account}
            selected={account.id === selectedId}
            onSelect={() => setSelectedId(account.id)}
            draggable={{
              isDragging: draggingId === account.id,
              dropPosition: draggingId && draggingId !== account.id && dropTarget?.id === account.id ? dropTarget.position : null,
              onDragStart: () => setDraggingId(account.id),
              onDragOver: (position) => {
                if (draggingId && draggingId !== account.id) setDropTarget({ id: account.id, position });
              },
              onDragEnd: () => {
                setDraggingId(null);
                setDropTarget(null);
              },
            }}
          />
        ))}
        <AddClippingAccountModal
          trigger={(openModal) => (
            <RailButton title="Add CLIPPING account" onClick={openModal}>
              <Plus className="h-4 w-4 text-muted-foreground" />
            </RailButton>
          )}
        />
      </div>

      <div className="my-1 h-px w-6 bg-border/70" />

      <AppAccountMenu />
    </aside>
  );
}
