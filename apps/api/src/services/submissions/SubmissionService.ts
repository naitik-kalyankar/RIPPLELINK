import type { LinkReelInput } from "@kick-manager/shared";
import { prisma } from "../../lib/db.js";
import { clippingService, ClippingApiError, type ClippingService } from "../clipping/index.js";
import { clippingAccountResolver } from "../clipping/ClippingAccountResolver.js";
import { bountyMatchingService } from "../clipping/BountyMatchingService.js";
import { activityLogService } from "../activity/ActivityLogService.js";
import { reelInclude, serializeReel, type ReelWithRelations } from "../reels/ReelMatchingService.js";

export class AlreadyLinkedError extends Error {
  constructor() {
    super("This Reel is already submitted to CLIPPING.");
    this.name = "AlreadyLinkedError";
  }
}

export class ReelNotFoundError extends Error {
  constructor() {
    super("Reel not found.");
    this.name = "ReelNotFoundError";
  }
}

export class MissingBountyTagError extends Error {
  constructor() {
    super("No bounty tag — this Reel has no detected creator. Enter one manually or run Detect first.");
    this.name = "MissingBountyTagError";
  }
}

export class SubmissionInProgressError extends Error {
  constructor() {
    super("This Reel is already being submitted.");
    this.name = "SubmissionInProgressError";
  }
}

const CONCURRENCY_LIMIT = 3;

export class SubmissionService {
  // In-process guard against two concurrent submitReel calls for the SAME Reel — the
  // `clippingSubmission` DB check below (and ClippingSubmission.reelId's @unique constraint)
  // only stops a duplicate LOCAL row after the fact; without this, two racing calls (e.g. a
  // duplicate id landing twice in one bulk-link batch, or a double-click racing a single Link
  // with a bulk one) can both pass that check before either has written back, both call
  // provider.submitClip — creating a real duplicate submission on CLIPPING's side — and the
  // second worker's local write then fails on the unique constraint, misleadingly logging a
  // submission that actually WENT THROUGH externally as "failed". Sufficient here because this
  // API only ever runs as a single process on localhost (see ClippingBrowserManager's headed-
  // login comments for the same assumption) — a multi-instance deployment would need a DB-level
  // lock instead.
  private inFlightReelIds = new Set<string>();

  /**
   * Duplicate protection (spec §21): re-check our DB *and* the latest CLIPPING state before
   * ever submitting, rather than trusting a locally cached "linked" flag.
   */
  async submitReel(userId: string, reelId: string, input: LinkReelInput) {
    if (this.inFlightReelIds.has(reelId)) {
      throw new SubmissionInProgressError();
    }
    this.inFlightReelIds.add(reelId);
    try {
      return await this.submitReelInner(userId, reelId, input);
    } finally {
      this.inFlightReelIds.delete(reelId);
    }
  }

  private async submitReelInner(userId: string, reelId: string, input: LinkReelInput) {
    // Scoped by userId, not just id — a Reel id belonging to a DIFFERENT user must 404 exactly
    // like one that doesn't exist at all, never leak whether it exists or let it be acted on.
    const reel = await prisma.reel.findUnique({ where: { id: reelId, userId }, include: reelInclude });
    if (!reel) throw new ReelNotFoundError();
    if (reel.clippingSubmission) throw new AlreadyLinkedError();

    const provider = await clippingAccountResolver.resolveProviderForInstagramAccount(reel.instagramAccount);

    const externalMatch = await provider.checkSubmission(reel.instagramReelId);
    if (externalMatch) {
      await prisma.clippingSubmission.upsert({
        where: { clippingClipId: externalMatch.clippingClipId },
        create: this.toSubmissionCreateData(userId, externalMatch, reelId),
        update: this.toSubmissionUpdateData(externalMatch, reelId),
      });
      await prisma.submissionAttempt.create({
        data: { userId, reelId, status: "already_linked" },
      });
      await activityLogService.log(
        userId,
        `Reel ${reel.instagramReelId} already existed in CLIPPING — linked automatically.`
      );
      return this.reload(userId, reelId);
    }

    // A bounty tag not explicitly given falls back to the Reel's detected creator — same
    // default the single-Reel Link modal uses — then gets corrected against CLIPPING's real,
    // currently-active bounty names (fixes minor OCR misreads). Every real submission needs a
    // real bounty tag — there's no safe placeholder to fall back to, so this fails clearly
    // rather than silently submitting under a made-up tag CLIPPING would reject anyway.
    const candidateBountyTag = input.bountyTag || reel.creator?.detectedIdentifier || reel.detectedIdentifier;
    if (!candidateBountyTag) {
      await prisma.submissionAttempt.create({
        data: { userId, reelId, status: "failed", errorMessage: new MissingBountyTagError().message },
      });
      throw new MissingBountyTagError();
    }
    const bountyTag = await bountyMatchingService.resolveBountyTag(userId, candidateBountyTag);

    await prisma.submissionAttempt.create({ data: { userId, reelId, status: "uploading" } });

    try {
      const result = await provider.submitClip({
        // Each Instagram account maps to its own CLIPPING account ID — not a single global
        // value — so it's resolved from the Reel's own account, not an env var.
        accountId: input.accountId ?? reel.instagramAccount.clippingAccountId ?? undefined,
        bountyTag,
        campaignId: input.campaignId,
        url: reel.instagramUrl,
        notes: input.notes,
      });

      await prisma.clippingSubmission.create({ data: this.toSubmissionCreateData(userId, result, reelId) });
      await prisma.submissionAttempt.create({ data: { userId, reelId, status: "uploaded" } });
      await activityLogService.log(userId, `Submitted Reel ${reel.instagramReelId} to CLIPPING.`);
      return this.reload(userId, reelId);
    } catch (error) {
      const message = error instanceof ClippingApiError ? error.message : "Unknown submission error.";
      await prisma.submissionAttempt.create({ data: { userId, reelId, status: "failed", errorMessage: message } });
      await activityLogService.log(userId, `Failed to submit Reel ${reel.instagramReelId} to CLIPPING: ${message}`, "error");
      throw error;
    }
  }

  async bulkSubmit(userId: string, reelIds: string[], input: LinkReelInput & { bountyTags?: Record<string, string> }) {
    const results: Array<{ reelId: string; success: boolean; error?: string }> = [];
    let cursor = 0;

    const worker = async () => {
      while (cursor < reelIds.length) {
        const index = cursor++;
        const reelId = reelIds[index];
        try {
          // A per-Reel override (collected up front for Reels with no detected creator — see
          // BulkBountyAssignModal) takes precedence over the shared fallback tag.
          const bountyTag = input.bountyTags?.[reelId] ?? input.bountyTag;
          await this.submitReel(userId, reelId, { ...input, bountyTag });
          results[index] = { reelId, success: true };
        } catch (error) {
          const message =
            error instanceof AlreadyLinkedError
              ? "Already linked."
              : error instanceof SubmissionInProgressError
                ? "Already submitting — duplicate in this batch."
                : error instanceof ClippingApiError
                ? error.message
                : error instanceof Error
                  ? error.message
                  : "Unknown error.";
          results[index] = { reelId, success: false, error: message };
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY_LIMIT, reelIds.length) }, worker));
    return results;
  }

  private toSubmissionCreateData(
    userId: string,
    raw: Awaited<ReturnType<typeof clippingService.submitClip>>,
    reelId: string
  ) {
    return {
      userId,
      reelId,
      clippingClipId: raw.clippingClipId,
      videoId: raw.videoId,
      campaignId: raw.campaignId,
      bountyTag: raw.bounty,
      clippingUrl: raw.url,
      isBeingTracked: raw.isBeingTracked,
      views: raw.views,
      likes: raw.likes,
      comments: raw.comments,
      dateAdded: raw.dateAdded,
      dateCreated: raw.dateCreated,
      lastUpdated: raw.lastUpdated,
    };
  }

  private toSubmissionUpdateData(
    raw: Awaited<ReturnType<typeof clippingService.submitClip>>,
    reelId: string
  ) {
    // Never touches userId — a ClippingSubmission's owner is fixed at creation, this path only
    // refreshes CLIPPING-reported fields on an existing row.
    return {
      reelId,
      videoId: raw.videoId,
      campaignId: raw.campaignId,
      bountyTag: raw.bounty,
      clippingUrl: raw.url,
      isBeingTracked: raw.isBeingTracked,
      views: raw.views,
      likes: raw.likes,
      comments: raw.comments,
      dateAdded: raw.dateAdded,
      dateCreated: raw.dateCreated,
      lastUpdated: raw.lastUpdated,
    };
  }

  private async reload(userId: string, reelId: string) {
    const reel = (await prisma.reel.findUniqueOrThrow({
      where: { id: reelId, userId },
      include: reelInclude,
    })) as ReelWithRelations;
    return serializeReel(reel);
  }
}

export const submissionService = new SubmissionService();
