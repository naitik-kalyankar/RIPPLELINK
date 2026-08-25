import type { Prisma } from "@prisma/client";
import type { LinkStatus, Reel } from "@kick-manager/shared";
import { prisma } from "../../lib/db.js";

export const reelInclude = {
  instagramAccount: { select: { id: true, username: true, displayName: true, clippingAccountId: true } },
  creator: { include: { aliases: true } },
  clippingSubmission: true,
  submissionAttempts: { orderBy: { attemptedAt: "desc" as const }, take: 1 },
} satisfies Prisma.ReelInclude;

export type ReelWithRelations = Prisma.ReelGetPayload<{ include: typeof reelInclude }>;

export function computeLinkStatus(reel: ReelWithRelations): LinkStatus {
  if (reel.clippingSubmission) return "linked";
  const latest = reel.submissionAttempts[0];
  if (!latest) return "unlinked";
  if (latest.status === "uploading") return "submitting";
  if (latest.status === "failed") return "failed";
  if (latest.status === "already_linked") return "linked";
  return "unlinked";
}

export function serializeReel(reel: ReelWithRelations): Reel {
  return {
    id: reel.id,
    instagramAccountId: reel.instagramAccountId,
    instagramAccount: {
      id: reel.instagramAccount.id,
      username: reel.instagramAccount.username,
      displayName: reel.instagramAccount.displayName,
    },
    instagramReelId: reel.instagramReelId,
    instagramUrl: reel.instagramUrl,
    thumbnailUrl: reel.thumbnailUrl,
    publishedAt: reel.publishedAt?.toISOString() ?? null,
    views: reel.views,
    creatorId: reel.creatorId,
    creator: reel.creator
      ? {
          id: reel.creator.id,
          detectedIdentifier: reel.creator.detectedIdentifier,
          displayName: reel.creator.displayName,
          active: reel.creator.active,
          aliases: reel.creator.aliases.map((a) => a.detectedIdentifier),
          createdAt: reel.creator.createdAt.toISOString(),
          updatedAt: reel.creator.updatedAt.toISOString(),
        }
      : null,
    creatorDetectionStatus: reel.creatorDetectionStatus,
    linkStatus: computeLinkStatus(reel),
    clippingSubmission: reel.clippingSubmission
      ? {
          id: reel.clippingSubmission.id,
          reelId: reel.clippingSubmission.reelId,
          clippingClipId: reel.clippingSubmission.clippingClipId,
          videoId: reel.clippingSubmission.videoId,
          campaignId: reel.clippingSubmission.campaignId,
          bountyTag: reel.clippingSubmission.bountyTag,
          clippingUrl: reel.clippingSubmission.clippingUrl,
          status: reel.clippingSubmission.status,
          isBeingTracked: reel.clippingSubmission.isBeingTracked,
          views: reel.clippingSubmission.views,
          likes: reel.clippingSubmission.likes,
          comments: reel.clippingSubmission.comments,
          dateAdded: reel.clippingSubmission.dateAdded?.toISOString() ?? null,
          dateCreated: reel.clippingSubmission.dateCreated?.toISOString() ?? null,
          lastUpdated: reel.clippingSubmission.lastUpdated?.toISOString() ?? null,
          createdAt: reel.clippingSubmission.createdAt.toISOString(),
          updatedAt: reel.clippingSubmission.updatedAt.toISOString(),
        }
      : null,
    latestAttempt: reel.submissionAttempts[0]
      ? {
          id: reel.submissionAttempts[0].id,
          reelId: reel.submissionAttempts[0].reelId,
          status: reel.submissionAttempts[0].status,
          errorMessage: reel.submissionAttempts[0].errorMessage,
          attemptedAt: reel.submissionAttempts[0].attemptedAt.toISOString(),
        }
      : null,
    createdAt: reel.createdAt.toISOString(),
    updatedAt: reel.updatedAt.toISOString(),
  };
}

/**
 * Reconciliation (spec §35): link any CLIPPING submissions to Reels sharing the same
 * shortcode/videoId that aren't linked yet. Runs after every CLIPPING sync so a Reel
 * uploaded outside this app is automatically detected as Linked on the next sync.
 */
export class ReelMatchingService {
  async reconcileUnlinkedSubmissions(): Promise<number> {
    const orphanSubmissions = await prisma.clippingSubmission.findMany({
      where: { reelId: null },
    });

    let linked = 0;
    for (const submission of orphanSubmissions) {
      const reel = await prisma.reel.findFirst({
        where: { instagramReelId: submission.videoId },
      });
      if (!reel) continue;

      // clipping_submissions.reelId is unique — skip if this Reel is already claimed by a
      // different submission (e.g. a duplicate/resubmitted clip for the same Reel).
      const existingForReel = await prisma.clippingSubmission.findUnique({ where: { reelId: reel.id } });
      if (existingForReel) continue;

      await prisma.clippingSubmission.update({
        where: { id: submission.id },
        data: { reelId: reel.id },
      });
      linked += 1;
    }
    return linked;
  }
}

export const reelMatchingService = new ReelMatchingService();
