import { useRef, useState } from "react";
import { ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SlideToConfirmProps {
  label: string;
  confirmedLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
}

const THUMB_SIZE = 40;

/** iOS-style "slide to confirm" — drag the thumb to the end of the track to fire onConfirm,
 * otherwise it springs back. Used for anything destructive-but-quick to undo the harm of a
 * misclick on (a plain button is one accidental tap away; this needs a deliberate gesture). */
export function SlideToConfirm({ label, confirmedLabel = "Confirmed", onConfirm, disabled }: SlideToConfirmProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const startXRef = useRef(0);

  const maxDrag = () => (trackRef.current ? trackRef.current.clientWidth - THUMB_SIZE : 0);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || confirmed) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startXRef.current = e.clientX - dragX;
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const next = Math.min(Math.max(0, e.clientX - startXRef.current), maxDrag());
    setDragX(next);
  };

  const finish = () => {
    if (!dragging) return;
    setDragging(false);
    const max = maxDrag();
    if (max > 0 && dragX >= max * 0.92) {
      setDragX(max);
      setConfirmed(true);
      onConfirm();
    } else {
      setDragX(0);
    }
  };

  const max = maxDrag();
  const progress = max > 0 ? dragX / max : 0;

  return (
    <div
      ref={trackRef}
      className={cn(
        "relative h-10 w-full select-none overflow-hidden rounded-full border border-border bg-accent/40 transition-colors",
        disabled && "opacity-60"
      )}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-destructive/25"
        style={{ width: `${THUMB_SIZE + dragX}px` }}
      />
      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium text-muted-foreground"
        style={{ opacity: 1 - progress * 1.4 }}
      >
        {confirmed ? confirmedLabel : label}
      </span>
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        tabIndex={disabled || confirmed ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onKeyDown={(e) => {
          if (disabled || confirmed) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setConfirmed(true);
            onConfirm();
          }
        }}
        className={cn(
          "absolute inset-y-0 left-0 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm",
          !dragging && "transition-transform duration-200 ease-out",
          disabled || confirmed ? "cursor-default" : "cursor-grab active:cursor-grabbing"
        )}
        style={{ width: THUMB_SIZE, height: THUMB_SIZE, transform: `translateX(${dragX}px)` }}
      >
        <ChevronsRight className="h-4 w-4" />
      </div>
    </div>
  );
}
