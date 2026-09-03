import { prisma } from "./db.js";

export interface BountyUpsertInput {
  name: string;
  rate: string | null;
  active: boolean;
}

// CLIPPING's live campaign has 100+ bounty tags — firing that many upserts in one Promise.all
// (the original approach) opens that many simultaneous connections at once, which blows past
// Supabase's session-mode pooler limit (pool_size: 15) and fails the whole batch with
// EMAXCONNSESSION. Same fixed-worker-pool pattern already used for CLIPPING submissions (see
// SubmissionService's CONCURRENCY_LIMIT) — a handful of upserts in flight at once, not all of
// them, still overlapped enough to be fast for ~100-200 rows without exhausting the pool.
const CONCURRENCY_LIMIT = 5;

/** Upserts CLIPPING's bounty list by name — used both by the manual browser-extension route
 * (routes/clipping.ts's POST /api/clipping/bounties, kept as a fallback) and by SyncService's
 * automatic per-sync refresh (see ClippingBrowserManager.fetchLiveCampaignInfo), so there's one
 * shared place this ever gets written from. Refreshes active/rate/lastSeenAt on every call
 * rather than only inserting — a bounty going from enabled to disabled (or its rate changing)
 * needs to actually update the existing row, not just leave it stale. */
export async function upsertBounties(userId: string, bounties: BountyUpsertInput[]): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < bounties.length) {
      const bounty = bounties[cursor++];
      await prisma.clippingBounty.upsert({
        where: { userId_name: { userId, name: bounty.name } },
        create: { userId, name: bounty.name, active: bounty.active, rate: bounty.rate },
        update: { active: bounty.active, rate: bounty.rate, lastSeenAt: new Date() },
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY_LIMIT, bounties.length) }, worker));
}
