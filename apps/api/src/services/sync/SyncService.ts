import type { SyncResult } from "@kick-manager/shared";
import { prisma } from "../../lib/db.js";
import { getInstagramServiceForAccount } from "../instagram/index.js";
import { clippingService } from "../clipping/index.js";
import { creatorDetectionService } from "../creators/CreatorDetectionService.js";
import { activityLogService } from "../activity/ActivityLogService.js";
import { reelMatchingService } from "../reels/ReelMatchingService.js";

export interface AccountSyncResult {
  fetched: number;
  upserted: number;
  detected: number;
}

export interface SyncableAccount {
  id: string;
  instagramId: string;
  username: string;
  accessToken?: string | null;
}

export class SyncService {
  /** Fetches + upserts Reels for a single account, running creator detection on new rows. */
  async syncAccount(account: SyncableAccount): Promise<AccountSyncResult> {
    const accountRef = {
      instagramId: account.instagramId,
      username: account.username,
      accessToken: account.accessToken,
    };
    const reels = await getInstagramServiceForAccount(accountRef).listAccountReels(accountRef);

    let upserted = 0;
    let detected = 0;

    for (const raw of reels) {
      const existing = await prisma.reel.findUnique({
        where: {
          instagramAccountId_instagramReelId: {
            instagramAccountId: account.id,
            instagramReelId: raw.instagramReelId,
          },
        },
      });
      if (existing) {
        // Views accrue after publish, so unlike the rest of a Reel's fields they're worth
        // refreshing on every sync rather than only set once at creation.
        if (raw.views !== null && raw.views !== existing.views) {
          await prisma.reel.update({ where: { id: existing.id }, data: { views: raw.views } });
        }
        continue;
      }

      const detection = await creatorDetectionService.resolveForReel(raw.thumbnailUrl);
      if (detection.status === "mapped") detected += 1;

      await prisma.reel.create({
        data: {
          instagramAccountId: account.id,
          instagramReelId: raw.instagramReelId,
          instagramUrl: raw.instagramUrl,
          thumbnailUrl: raw.thumbnailUrl,
          publishedAt: raw.publishedAt,
          views: raw.views,
          creatorId: detection.creatorId,
          detectedIdentifier: detection.detectedIdentifier,
          creatorDetectionStatus: detection.status,
        },
      });
      upserted += 1;
    }

    await prisma.instagramAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date() },
    });
    await activityLogService.log(`Fetched ${reels.length} Reels from @${account.username}.`);

    return { fetched: reels.length, upserted, detected };
  }

  async syncInstagram(): Promise<Pick<SyncResult, "instagramReelsFetched" | "instagramReelsUpserted" | "creatorsDetected" | "errors">> {
    const accounts = await prisma.instagramAccount.findMany({ where: { active: true } });
    let fetched = 0;
    let upserted = 0;
    let detected = 0;
    const errors: string[] = [];

    for (const account of accounts) {
      try {
        const result = await this.syncAccount(account);
        fetched += result.fetched;
        upserted += result.upserted;
        detected += result.detected;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Instagram sync error.";
        errors.push(`@${account.username}: ${message}`);
        await activityLogService.log(`Instagram sync failed for @${account.username}: ${message}`, "error");
      }
    }

    return { instagramReelsFetched: fetched, instagramReelsUpserted: upserted, creatorsDetected: detected, errors };
  }

  async syncClipping(): Promise<
    Pick<SyncResult, "clippingSubmissionsFetched" | "clippingSubmissionsUpserted" | "newlyLinked" | "newlyUnlinked" | "errors">
  > {
    const errors: string[] = [];
    let fetched = 0;
    let upserted = 0;
    let removedStale = 0;

    try {
      const clips = await clippingService.getUploadedClips();
      fetched = clips.length;

      for (const clip of clips) {
        const matchingReel = await prisma.reel.findFirst({ where: { instagramReelId: clip.videoId } });

        // clipping_submissions.reelId is unique (one submission per Reel). If this Reel is
        // already claimed by a *different* clip, don't attach reelId to this one too — store
        // the clip's data unlinked rather than crash the whole sync on a constraint violation.
        let reelId: string | undefined;
        if (matchingReel) {
          const existingForReel = await prisma.clippingSubmission.findUnique({
            where: { reelId: matchingReel.id },
          });
          if (!existingForReel || existingForReel.clippingClipId === clip.clippingClipId) {
            reelId = matchingReel.id;
          }
        }

        await prisma.clippingSubmission.upsert({
          where: { clippingClipId: clip.clippingClipId },
          create: {
            clippingClipId: clip.clippingClipId,
            videoId: clip.videoId,
            reelId,
            campaignId: clip.campaignId,
            bountyTag: clip.bounty,
            clippingUrl: clip.url,
            isBeingTracked: clip.isBeingTracked,
            views: clip.views,
            likes: clip.likes,
            comments: clip.comments,
            dateAdded: clip.dateAdded,
            dateCreated: clip.dateCreated,
            lastUpdated: clip.lastUpdated,
          },
          update: {
            reelId,
            campaignId: clip.campaignId,
            bountyTag: clip.bounty,
            clippingUrl: clip.url,
            isBeingTracked: clip.isBeingTracked,
            views: clip.views,
            likes: clip.likes,
            comments: clip.comments,
            lastUpdated: clip.lastUpdated,
          },
        });
        upserted += 1;
      }

      // The fresh fetch is the full source of truth (spec §11) — a submission that no longer
      // appears in it was deleted on CLIPPING's side, so drop the local link too rather than
      // leaving Reels stuck showing "Linked" forever. Only runs when the fetch itself
      // succeeded — a thrown/partial fetch must never be treated as "nothing exists anymore."
      const fetchedClipIds = new Set(clips.map((c) => c.clippingClipId));
      const staleSubmissions = await prisma.clippingSubmission.findMany({
        where: { clippingClipId: { notIn: Array.from(fetchedClipIds) } },
      });
      if (staleSubmissions.length > 0) {
        await prisma.clippingSubmission.deleteMany({
          where: { id: { in: staleSubmissions.map((s) => s.id) } },
        });
        removedStale = staleSubmissions.length;
        await activityLogService.log(
          `Removed ${removedStale} CLIPPING submission(s) no longer present remotely — matching Reel(s) reverted to Unlinked.`
        );
      }

      await activityLogService.log(`CLIPPING sync found ${clips.length} clips.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown CLIPPING sync error.";
      errors.push(message);
      await activityLogService.log(`CLIPPING sync failed: ${message}`, "error");
    }

    const newlyLinked = await reelMatchingService.reconcileUnlinkedSubmissions();
    if (newlyLinked > 0) {
      await activityLogService.log(`Reconciliation linked ${newlyLinked} previously-unlinked Reel(s).`);
    }

    return {
      clippingSubmissionsFetched: fetched,
      clippingSubmissionsUpserted: upserted,
      newlyLinked,
      newlyUnlinked: removedStale,
      errors,
    };
  }

  async syncAll(): Promise<SyncResult> {
    const instagramResult = await this.syncInstagram();
    const clippingResult = await this.syncClipping();
    return {
      instagramReelsFetched: instagramResult.instagramReelsFetched,
      instagramReelsUpserted: instagramResult.instagramReelsUpserted,
      creatorsDetected: instagramResult.creatorsDetected,
      clippingSubmissionsFetched: clippingResult.clippingSubmissionsFetched,
      clippingSubmissionsUpserted: clippingResult.clippingSubmissionsUpserted,
      newlyLinked: clippingResult.newlyLinked,
      newlyUnlinked: clippingResult.newlyUnlinked,
      errors: [...instagramResult.errors, ...clippingResult.errors],
    };
  }
}

export const syncService = new SyncService();
