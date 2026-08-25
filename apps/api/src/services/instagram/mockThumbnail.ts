const PALETTE = ["#7c3aed", "#0891b2", "#db2777", "#ea580c", "#16a34a", "#2563eb"];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Builds an inline SVG "thumbnail" that visually mimics a KICK-watermarked Reel banner
 * (`KICK.COM/<identifier>`), entirely offline — no network fetch required for dev/seed data.
 * `CreatorDetectionService` reads the identifier back out of the SVG markup directly for these
 * mock thumbnails instead of running raster OCR on them (see detectFromThumbnail).
 */
export function buildMockThumbnail(identifier: string | null, seed: string): string {
  const color = PALETTE[hashString(seed) % PALETTE.length];
  const label = identifier ? `KICK.COM/${identifier.toUpperCase()}` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="711" viewBox="0 0 400 711">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${color}"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
    </defs>
    <rect width="400" height="711" fill="url(#g)"/>
    <circle cx="330" cy="90" r="60" fill="rgba(255,255,255,0.08)"/>
    <circle cx="60" cy="600" r="90" fill="rgba(255,255,255,0.06)"/>
    ${
      label
        ? `<rect x="0" y="620" width="400" height="46" fill="rgba(0,0,0,0.55)"/>
           <text x="200" y="650" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="1">${label}</text>`
        : ""
    }
  </svg>`;
  const base64 = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}
