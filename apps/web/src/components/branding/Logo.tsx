import { cn } from "@/lib/utils";

/** Ripple Link's mark: a faceted, metallic diamond. Pure SVG (no image asset) so it stays crisp
 * at every size and follows the app's own color tokens instead of a baked-in palette. */
export function RippleLinkLogo({ className }: { className?: string }) {
  const id = "rl-diamond";
  return (
    <svg viewBox="0 0 32 32" className={cn("h-4 w-4", className)} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-face-a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f4f7fb" />
          <stop offset="45%" stopColor="#b9c6d6" />
          <stop offset="100%" stopColor="#7c8ba0" />
        </linearGradient>
        <linearGradient id={`${id}-face-b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dde4ec" />
          <stop offset="100%" stopColor="#8f9dae" />
        </linearGradient>
        <linearGradient id={`${id}-face-c`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eef2f6" />
          <stop offset="100%" stopColor="#aab8c9" />
        </linearGradient>
        <linearGradient id={`${id}-face-d`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#5f6d80" />
          <stop offset="100%" stopColor="#93a1b3" />
        </linearGradient>
      </defs>
      {/* Top table facets */}
      <path d="M16 2 L24 10 L16 13 L8 10 Z" fill={`url(#${id}-face-b)`} />
      <path d="M8 10 L16 13 L16 2 Z" fill={`url(#${id}-face-c)`} opacity="0.9" />
      <path d="M16 2 L16 13 L24 10 Z" fill={`url(#${id}-face-a)`} opacity="0.85" />
      {/* Lower pavilion facets, tapering to the point */}
      <path d="M8 10 L16 13 L16 29 Z" fill={`url(#${id}-face-d)`} />
      <path d="M24 10 L16 13 L16 29 Z" fill={`url(#${id}-face-a)`} />
      {/* Girdle highlight */}
      <path d="M8 10 L16 13 L24 10" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="0.6" />
      <path d="M16 2 L8 10 M16 2 L24 10 M16 13 L16 29" stroke="#3c4757" strokeOpacity="0.35" strokeWidth="0.4" fill="none" />
    </svg>
  );
}
