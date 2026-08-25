import { cn } from "@/lib/utils";

// A single `backdrop-filter: blur()` blurs uniformly — there's no CSS property for a blur that
// varies smoothly across an element. The standard trick (also how iOS builds its own graduated
// nav-bar blur) is to stack several full-size layers, each blurred by a different amount and
// masked to a different horizontal band via a gradient, so the bands overlap and add up to a
// blur that reads as strongest at the top and fades to nothing by the bottom.
const LAYERS: { blur: number; stops: string }[] = [
  { blur: 24, stops: "black 0%, black 25%, transparent 37.5%" },
  { blur: 12, stops: "transparent 0%, black 12.5%, black 37.5%, transparent 50%" },
  { blur: 6, stops: "transparent 12.5%, black 25%, black 50%, transparent 62.5%" },
  { blur: 3, stops: "transparent 25%, black 37.5%, black 62.5%, transparent 75%" },
  { blur: 1.5, stops: "transparent 37.5%, black 50%, black 75%, transparent 87.5%" },
  { blur: 0.75, stops: "transparent 50%, black 62.5%, black 100%" },
];

interface ProgressiveBlurProps {
  className?: string;
}

/** Purely decorative backdrop — sits behind a sticky header so scrolled content is visible
 * but increasingly blurred the closer it gets to the header, fading to fully sharp below it. */
export function ProgressiveBlur({ className }: ProgressiveBlurProps) {
  return (
    <div className={cn("pointer-events-none", className)} aria-hidden="true">
      {LAYERS.map((layer, i) => {
        const mask = `linear-gradient(to bottom, ${layer.stops})`;
        return (
          <div
            key={i}
            className="absolute inset-0"
            style={{
              backdropFilter: `blur(${layer.blur}px)`,
              WebkitBackdropFilter: `blur(${layer.blur}px)`,
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
          />
        );
      })}
    </div>
  );
}
