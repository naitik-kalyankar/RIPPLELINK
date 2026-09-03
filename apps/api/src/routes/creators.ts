import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";

function serializeCreator(creator: { id: string; detectedIdentifier: string; displayName: string; active: boolean; createdAt: Date; updatedAt: Date; aliases: { detectedIdentifier: string }[] }) {
  return {
    id: creator.id,
    detectedIdentifier: creator.detectedIdentifier,
    displayName: creator.displayName,
    active: creator.active,
    aliases: creator.aliases.map((a) => a.detectedIdentifier),
    createdAt: creator.createdAt.toISOString(),
    updatedAt: creator.updatedAt.toISOString(),
  };
}

// Creators are now created automatically by CreatorDetectionService as soon as OCR detects a
// new identifier — there's no manual review/create/merge step or page anymore. This list
// endpoint is the only thing still needed, e.g. for the Reels page's creator filter dropdown.
export async function creatorsRoutes(app: FastifyInstance) {
  app.get("/api/creators", async (request) => {
    const creators = await prisma.creator.findMany({
      where: { userId: request.user.id },
      include: { aliases: true },
      orderBy: { displayName: "asc" },
    });
    return { items: creators.map(serializeCreator) };
  });
}
