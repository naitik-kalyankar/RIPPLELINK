import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { bulkLinkSchema, linkReelSchema, reelsQuerySchema } from "@kick-manager/shared";
import { prisma } from "../lib/db.js";
import { reelInclude, serializeReel, type ReelWithRelations } from "../services/reels/ReelMatchingService.js";
import { submissionService } from "../services/submissions/SubmissionService.js";
import { syncService } from "../services/sync/SyncService.js";
import { creatorDetectionService } from "../services/creators/CreatorDetectionService.js";
import { bountyMatchingService } from "../services/clipping/BountyMatchingService.js";

function dateRangeToFilter(dateRange: string, dateFrom?: string, dateTo?: string): Prisma.DateTimeFilter | undefined {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  switch (dateRange) {
    case "today":
      return { gte: startOfDay(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { gte: startOfDay(y), lt: startOfDay(now) };
    }
    case "last_7_days": {
      const from = new Date(now);
      from.setDate(from.getDate() - 7);
      return { gte: from };
    }
    case "last_30_days": {
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      return { gte: from };
    }
    case "custom":
      return {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      };
    default:
      return undefined;
  }
}

function buildOrderBy(sort: string): Prisma.ReelOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":
      return [{ publishedAt: "asc" }];
    case "creator":
      return [{ creator: { displayName: "asc" } }];
    case "instagram_account":
      return [{ instagramAccount: { username: "asc" } }];
    case "linked_status":
      return [{ clippingSubmission: { createdAt: "desc" } }];
    case "views":
      return [{ clippingSubmission: { views: { sort: "desc", nulls: "last" } } }];
    case "likes":
      return [{ clippingSubmission: { likes: { sort: "desc", nulls: "last" } } }];
    case "comments":
      return [{ clippingSubmission: { comments: { sort: "desc", nulls: "last" } } }];
    case "newest":
    default:
      return [{ publishedAt: "desc" }];
  }
}

export async function reelsRoutes(app: FastifyInstance) {
  app.get("/api/reels", async (request) => {
    const query = reelsQuerySchema.parse(request.query);

    const where: Prisma.ReelWhereInput = {
      ...(query.creatorId ? { creatorId: query.creatorId } : {}),
      ...(query.instagramAccountId ? { instagramAccountId: query.instagramAccountId } : {}),
      ...(query.creatorDetectionStatus ? { creatorDetectionStatus: query.creatorDetectionStatus } : {}),
      ...(query.dateRange !== "all"
        ? { publishedAt: dateRangeToFilter(query.dateRange, query.dateFrom, query.dateTo) }
        : {}),
      ...(query.status === "linked" ? { clippingSubmission: { isNot: null } } : {}),
      ...(query.status === "unlinked" ? { clippingSubmission: { is: null } } : {}),
      ...(query.status === "failed"
        ? { submissionAttempts: { some: { status: "failed" } }, clippingSubmission: { is: null } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { instagramReelId: { contains: query.search, mode: "insensitive" } },
              { instagramUrl: { contains: query.search, mode: "insensitive" } },
              { instagramAccount: { username: { contains: query.search, mode: "insensitive" } } },
              { creator: { displayName: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.reel.count({ where }),
      prisma.reel.findMany({
        where,
        include: reelInclude,
        orderBy: buildOrderBy(query.sort),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    const items = (rows as ReelWithRelations[]).map(serializeReel);
    const totalPages = Math.max(1, Math.ceil(total / query.limit));
    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
      hasNext: query.page < totalPages,
    };
  });

  app.get("/api/reels/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const reel = await prisma.reel.findUnique({ where: { id }, include: reelInclude });
    if (!reel) {
      reply.status(404).send({ error: "not_found", message: "Reel not found." });
      return;
    }
    return serializeReel(reel as ReelWithRelations);
  });

  // On-demand re-run of the same OCR detection sync uses, for a single Reel that came back
  // unassigned — lets someone fix a missed detection right from the Link modal instead of
  // waiting on the next full sync. Also resolves a suggested bounty tag from whatever
  // identifier comes out of it, corrected against CLIPPING's real bounty list, so the Link
  // modal can offer it immediately rather than leaving the bounty field for the user to fill
  // in blind. There's no separate manual-assign endpoint anymore — CreatorDetectionService
  // auto-creates a Creator the moment an identifier is detected, so this is the only path.
  app.post("/api/reels/:id/detect-creator", async (request) => {
    const { id } = request.params as { id: string };
    const target = await prisma.reel.findUniqueOrThrow({ where: { id } });

    const detection = await creatorDetectionService.resolveForReel(target.thumbnailUrl);

    const reel = await prisma.reel.update({
      where: { id },
      data: {
        creatorId: detection.creatorId,
        detectedIdentifier: detection.detectedIdentifier,
        creatorDetectionStatus: detection.status,
      },
      include: reelInclude,
    });

    const suggestedBountyTag = detection.detectedIdentifier
      ? await bountyMatchingService.resolveBountyTag(detection.detectedIdentifier)
      : null;

    return { reel: serializeReel(reel as ReelWithRelations), suggestedBountyTag };
  });

  app.post("/api/reels/:id/link", async (request) => {
    const { id } = request.params as { id: string };
    const body = linkReelSchema.parse(request.body);
    return submissionService.submitReel(id, body);
  });

  app.post("/api/reels/bulk-link", async (request) => {
    const body = bulkLinkSchema.parse(request.body);
    const results = await submissionService.bulkSubmit(body.reelIds, body);
    return { results };
  });

  app.post("/api/reels/sync", async () => {
    return syncService.syncInstagram();
  });
}
