import { buildMockThumbnail } from "./mockThumbnail.js";
import type { FetchedReel, InstagramAccountRef, InstagramService } from "./InstagramService.js";

const IDENTIFIER_POOL = ["n3on", "larrywheels", "adinross", "xqc", "newclipper88", null] as const;

function randomShortcode(seed: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "D";
  let x = 0;
  for (let i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = 0; i < 10; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    out += chars[x % chars.length];
  }
  return out;
}

/** In-memory per-account catalog so repeated "Sync Now" calls can reveal new Reels over time. */
const catalog = new Map<string, FetchedReel[]>();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function generateReel(accountId: string, index: number): FetchedReel {
  const seed = `${accountId}-${index}`;
  const identifier = IDENTIFIER_POOL[index % IDENTIFIER_POOL.length];
  const shortcode = randomShortcode(seed);
  return {
    instagramReelId: shortcode,
    instagramUrl: `https://www.instagram.com/reel/${shortcode}/`,
    thumbnailUrl: buildMockThumbnail(identifier, seed),
    publishedAt: daysAgo(index),
    views: Math.floor(((seed.length * 9301 + index * 49297) % 233280) / 10) * 10,
  };
}

export class MockInstagramProvider implements InstagramService {
  async listAccountReels(account: InstagramAccountRef): Promise<FetchedReel[]> {
    let existing = catalog.get(account.instagramId);
    if (!existing) {
      existing = Array.from({ length: 12 }, (_, i) => generateReel(account.instagramId, i));
      catalog.set(account.instagramId, existing);
    } else if (Math.random() < 0.5) {
      // Simulate new content appearing between syncs.
      existing = [generateReel(account.instagramId, existing.length), ...existing];
      catalog.set(account.instagramId, existing);
    }
    return existing;
  }
}
