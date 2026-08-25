import { createWorker } from "tesseract.js";
import sharp from "sharp";
import type { CreatorDetectionStatus } from "@kick-manager/shared";
import { prisma } from "../../lib/db.js";
import { bountyMatchingService } from "../clipping/BountyMatchingService.js";

const IDENTIFIER_PATTERN = /KICK\.COM\/([A-Z0-9_.]+)/i;

function extractIdentifierFromSvgDataUri(dataUri: string): string | null {
  const base64 = dataUri.split(",")[1] ?? "";
  const svg = Buffer.from(base64, "base64").toString("utf-8");
  const match = svg.match(IDENTIFIER_PATTERN);
  return match ? match[1].toLowerCase() : null;
}

/**
 * The watermark occupies a small band near the bottom of a full 9:16 Reel thumbnail — running
 * OCR on the whole image reliably returns garbage (confirmed: raw Tesseract output on an
 * untouched thumbnail was nonsense unrelated to the actual visible text). Cropping tightly to
 * that band and upscaling it fixes most of that, but the blocky pixel-art "KICK" logo sitting
 * to the left of the "KICK.COM/<name>" text turned out to reliably corrupt the whole OCR pass
 * when included — cropping it out (keeping only the text portion) is what actually made this
 * reliable across real samples.
 */
async function preprocessWatermarkCrop(imageBuffer: Buffer): Promise<Buffer> {
  const { width, height } = await sharp(imageBuffer).metadata();
  if (!width || !height) throw new Error("Could not read thumbnail dimensions.");

  const top = Math.round(height * 0.68);
  const leftSkip = Math.round(width * 0.38);
  const bandWidth = width - leftSkip;

  return sharp(imageBuffer)
    .extract({ left: leftSkip, top, width: bandWidth, height: height - top })
    .resize({ width: bandWidth * 3 })
    .grayscale()
    .normalize()
    .threshold(140)
    .png()
    .toBuffer();
}

async function runOcr(imageInput: string | Buffer): Promise<string> {
  const worker = await createWorker("eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(imageInput);
    return text;
  } finally {
    await worker.terminate();
  }
}

async function extractIdentifierViaOcr(imageUrl: string): Promise<string | null> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Could not fetch thumbnail (status ${response.status}).`);
  const imageBuffer = Buffer.from(await response.arrayBuffer());

  const cropped = await preprocessWatermarkCrop(imageBuffer);
  const croppedText = await runOcr(cropped);
  const croppedMatch = croppedText.match(IDENTIFIER_PATTERN);
  if (croppedMatch) return croppedMatch[1].toLowerCase();

  // Fall back to OCR on the untouched image in case a thumbnail doesn't follow the usual
  // watermark layout the crop above assumes — cheap safety net, not the common path.
  const fullText = await runOcr(imageBuffer);
  const fullMatch = fullText.match(IDENTIFIER_PATTERN);
  return fullMatch ? fullMatch[1].toLowerCase() : null;
}

export interface DetectionResult {
  status: CreatorDetectionStatus;
  detectedIdentifier: string | null;
  creatorId: string | null;
}

/**
 * Detects the KICK.COM/<identifier> watermark from a Reel thumbnail and resolves it against
 * the creator mapping table. Mock thumbnails are inline SVG data URIs (see mockThumbnail.ts) —
 * the identifier is read directly out of the SVG markup for those so the whole pipeline works
 * fully offline in dev/seed data; real (raster) thumbnail URLs go through Tesseract.js OCR.
 */
export class CreatorDetectionService {
  async detectIdentifier(thumbnailUrl: string): Promise<string | null> {
    if (thumbnailUrl.startsWith("data:image/svg+xml")) {
      return extractIdentifierFromSvgDataUri(thumbnailUrl);
    }
    return extractIdentifierViaOcr(thumbnailUrl);
  }

  async resolveForReel(thumbnailUrl: string): Promise<DetectionResult> {
    let identifier: string | null;
    try {
      identifier = await this.detectIdentifier(thumbnailUrl);
    } catch {
      return { status: "failed", detectedIdentifier: null, creatorId: null };
    }

    if (!identifier) {
      return { status: "unknown", detectedIdentifier: null, creatorId: null };
    }

    // Correct OCR noise (e.g. "cgeely" misread instead of "cgeezy") against CLIPPING's real
    // bounty list *before* touching the Creator table — otherwise a slightly different OCR
    // read of the same person creates (or re-attaches to) a separate, wrong Creator record
    // instead of converging on the one real name, even though the bounty tag shown elsewhere
    // already gets this same correction.
    identifier = await bountyMatchingService.resolveBountyTag(identifier);

    const creator = await prisma.creator.findFirst({
      where: {
        OR: [{ detectedIdentifier: identifier }, { aliases: { some: { detectedIdentifier: identifier } } }],
      },
    });

    if (creator) {
      return { status: "mapped", detectedIdentifier: identifier, creatorId: creator.id };
    }

    // No manual review step — a detected identifier not seen before just becomes a new
    // Creator immediately. `upsert` (not `create`) guards against two Reels detecting the
    // same new identifier concurrently and racing each other into a unique-constraint error.
    const newCreator = await prisma.creator.upsert({
      where: { detectedIdentifier: identifier },
      create: { detectedIdentifier: identifier, displayName: identifier },
      update: {},
    });
    return { status: "mapped", detectedIdentifier: identifier, creatorId: newCreator.id };
  }
}

export const creatorDetectionService = new CreatorDetectionService();
