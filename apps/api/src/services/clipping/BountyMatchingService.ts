import { prisma } from "../../lib/db.js";

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[rows - 1][cols - 1];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// Below this, a "closest match" is more likely a coincidence than an OCR typo — better to
// submit under the unmatched guess than silently rewrite it to something unrelated.
const MIN_SIMILARITY = 0.6;

export class BountyMatchingService {
  /**
   * Corrects a candidate bounty tag (usually a creator identifier detected via OCR, which can
   * have minor misreads like "n30n" instead of "n3on") against CLIPPING's real, currently
   * *active* bounty names — learned by the browser extension scraping the campaign page,
   * since CLIPPING has no API for this. Falls back to the candidate unchanged when no bounty
   * list has been synced yet, or nothing is close enough to be confident about. Disabled
   * bounties are never matched against, so a Reel never gets silently filed under a tag
   * CLIPPING isn't accepting submissions for anymore.
   */
  async resolveBountyTag(userId: string, candidate: string): Promise<string> {
    const trimmed = candidate.trim();
    if (!trimmed) return trimmed;

    const bounties = await prisma.clippingBounty.findMany({ where: { active: true, userId } });
    if (bounties.length === 0) return trimmed;

    const lower = trimmed.toLowerCase();
    const exact = bounties.find((b) => b.name.toLowerCase() === lower);
    if (exact) return exact.name;

    let best: { name: string; score: number } | null = null;
    for (const bounty of bounties) {
      const score = similarity(lower, bounty.name.toLowerCase());
      if (!best || score > best.score) best = { name: bounty.name, score };
    }

    return best && best.score >= MIN_SIMILARITY ? best.name : trimmed;
  }
}

export const bountyMatchingService = new BountyMatchingService();
