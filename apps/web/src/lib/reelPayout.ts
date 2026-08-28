import type { ClippingBounty, Reel } from "@kick-manager/shared";

// Same rate format/parsing as the backend's dashboard.ts (bounty rates are scraped from
// CLIPPING's campaign page as free text like "$5/100K", not a structured number).
function parseRatePer100k(rate: string | null): number | null {
  if (!rate) return null;
  const match = rate.match(/\$\s*([\d.]+)\s*\/\s*100K/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function buildBountyRateMap(bounties: ClippingBounty[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const bounty of bounties) {
    const rate = parseRatePer100k(bounty.rate);
    if (rate != null) map.set(bounty.name.toLowerCase(), rate);
  }
  return map;
}

/** Local per-reel payout estimate — the same views*rate math as the dashboard's "Live" payout
 * mode, just scoped to one reel instead of summed across everything. CLIPPING's own real
 * payout is computed per-bounty-tag aggregate across ALL of that bounty's clips (see the
 * bounty breakdown on the Settings page), not per individual reel, so there's no authoritative
 * per-reel figure to read from them — this stays a local estimate, same caveat as before.
 * Returns null (not $0) when there's nothing to compute from — no view count yet, no bounty
 * tag assigned, or the tag doesn't match a known bounty rate. */
export function estimateReelPayout(reel: Reel, bountyRateByName: Map<string, number>): number | null {
  if (reel.views == null) return null;
  const bountyTag = reel.clippingSubmission?.bountyTag ?? reel.creator?.detectedIdentifier ?? null;
  if (!bountyTag) return null;
  const rate = bountyRateByName.get(bountyTag.toLowerCase());
  if (rate == null) return null;
  return (reel.views / 100_000) * rate;
}
