import { animated, useSpring } from "@react-spring/web";

interface AnimatedNumberProps {
  value: number;
  /** Renders the interpolated value — e.g. formatCurrency, toLocaleString, or a plain Math.round. */
  format?: (value: number) => string;
  className?: string;
}

/** Counts smoothly from the previous value to the new one instead of snapping — used for stat
 * figures that update after a fetch/refetch (payout totals, view counts) so a changed number
 * reads as a live update rather than a jump-cut. `from` only applies on first mount (react-spring
 * animates every later change from whatever the spring's current value already is), so this
 * counts up from 0 the first time a real value lands, then smoothly re-counts on every update
 * after that. */
export function AnimatedNumber({ value, format = (v) => Math.round(v).toLocaleString(), className }: AnimatedNumberProps) {
  const { number } = useSpring({
    from: { number: 0 },
    number: value,
    config: { tension: 170, friction: 26 },
  });

  return <animated.span className={className}>{number.to(format)}</animated.span>;
}
