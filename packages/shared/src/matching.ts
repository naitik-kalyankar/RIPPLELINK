/**
 * Canonical Reel-ID normalization. This is the single source of truth for turning any
 * Instagram Reel URL variant into the shortcode used as the primary matching key against
 * CLIPPING's videoId. Both the API (storage/matching) and the web app (display) import this.
 */
const REEL_URL_PATTERN = /instagram\.com\/reel(?:s)?\/([A-Za-z0-9_-]+)/i;

export function extractReelShortcode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(REEL_URL_PATTERN);
  if (match) return match[1];

  // Already a bare shortcode (no slashes, no protocol).
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;

  return null;
}

export function normalizeReelUrl(shortcode: string): string {
  return `https://www.instagram.com/reel/${shortcode}/`;
}

export function shortcodesMatch(a: string, b: string): boolean {
  return a.trim() === b.trim();
}
