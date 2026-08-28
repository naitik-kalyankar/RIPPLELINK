import type { SyncResult } from "@kick-manager/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { getInstagramServiceForAccount } from "../instagram/index.js";
import { clippingService, getClippingProviderForAccount } from "../clipping/index.js";
import type { ClippingSubmissionRaw } from "../clipping/ClippingService.js";
import { clippingBrowserManager } from "../clipping/ClippingBrowserManager.js";
import type { ClippingAccount } from "@prisma/client";
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

      try {
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
      } catch (error) {
        // A concurrent sync of this same account (e.g. two "Sync Now" clicks racing) can
        // create this Reel between our findUnique check above and this create — the unique
        // constraint on (instagramAccountId, instagramReelId) is what's supposed to catch
        // that. Not a real failure, just redundant work losing the race; skip it rather than
        // crashing the whole sync. Any other error is a genuine problem and still propagates.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
        throw error;
      }

      if (detection.status === "mapped") detected += 1;
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

  /** Zero ClippingAccount rows (fresh/legacy install): one call against the legacy global
   * provider, byte-for-byte today's behavior — including letting a throw here propagate to
   * syncClipping's outer try/catch exactly as before.
   *
   * With rows present: the legacy session KEEPS being fetched alongside them, not replaced —
   * any Instagram account not yet linked to a ClippingAccount (see ClippingAccountResolver)
   * still relies on the legacy session for its submissions, so its clips must keep showing up
   * here too. Each source (legacy + every account) is fetched independently so one failing
   * source doesn't block the others, mirroring syncInstagram()'s per-account pattern. */
  private async fetchAllClips(errors: string[], payoutErrors: string[]): Promise<ClippingSubmissionRaw[]> {
    const accounts = await prisma.clippingAccount.findMany({ where: { active: true } });
    if (accounts.length === 0) return clippingService.getUploadedClips();

    const collected: ClippingSubmissionRaw[] = [];

    try {
      collected.push(...(await clippingService.getUploadedClips()));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown CLIPPING sync error.";
      errors.push(`Legacy session: ${message}`);
      await activityLogService.log(`CLIPPING sync failed for the legacy session: ${message}`, "error");
    }

    for (const account of accounts) {
      try {
        const clips = await getClippingProviderForAccount(account).getUploadedClips();
        collected.push(...clips);
        await prisma.clippingAccount.update({ where: { id: account.id }, data: { lastUsedAt: new Date() } });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown CLIPPING sync error.";
        errors.push(`${account.label}: ${message}`);
        await activityLogService.log(`CLIPPING sync failed for ${account.label}: ${message}`, "error");
      }

      // Separate error list on purpose: a payout-scrape failure (a different Playwright page
      // load, not the cookie-based HTTP API used for clips above) must never gate the
      // stale-submission cleanup below, which only cares about clip-fetch completeness — those
      // are unrelated concerns, so coupling them would make a flaky payout scrape silently
      // stop real cleanup from ever running.
      await this.syncPayoutForAccount(account, payoutErrors);
    }
    return collected;
  }

  /** Refreshes ClippingAccount.lastPayout/lastPayoutBountyBreakdown from CLIPPING's own
   * campaign page — see ClippingBrowserManager.getCampaignPageData. This is what makes the
   * dashboard's "CLIPPING" payout mode match clipping.net exactly instead of a local estimate
   * that doesn't replicate CLIPPING's per-bounty-aggregate view floor. */
  private async syncPayoutForAccount(account: ClippingAccount, errors: string[]): Promise<void> {
    try {
      const { clipperStats } = await clippingBrowserManager.getCampaignPageData(account);
      if (!clipperStats) return; // no session yet, or the page didn't render clipperStats — leave cached value as-is
      await prisma.clippingAccount.update({
        where: { id: account.id },
        data: {
          lastPayout: clipperStats.totalPayout,
          lastPayoutBountyBreakdown: clipperStats.bountyBreakdown as unknown as Prisma.InputJsonValue,
          lastPayoutFetchedAt: new Date(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      errors.push(`${account.label} (payout): ${message}`);
      await activityLogService.log(`CLIPPING payout sync failed for ${account.label}: ${message}`, "error");
    }
  }

  async syncClipping(): Promise<
    Pick<SyncResult, "clippingSubmissionsFetched" | "clippingSubmissionsUpserted" | "newlyLinked" | "newlyUnlinked" | "errors">
  > {
    const errors: string[] = [];
    const payoutErrors: string[] = [];
    let fetched = 0;
    let upserted = 0;
    let removedStale = 0;

    try {
      const clips = await this.fetchAllClips(errors, payoutErrors);
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
      // leaving Reels stuck showing "Linked" forever. Only runs when EVERY account's fetch
      // succeeded this run — with multiple ClippingAccounts, fetchAllClips can partially fail
      // (one account's session is stale) while still returning the clips it did get; treating
      // that partial result as "the full remote state" would wrongly delete every submission
      // belonging to the account(s) that failed. A thrown/partial fetch must never be treated
      // as "nothing exists anymore."
      const fetchedClipIds = new Set(clips.map((c) => c.clippingClipId));
      const staleSubmissions =
        errors.length > 0
          ? []
          : await prisma.clippingSubmission.findMany({
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
      errors: [...errors, ...payoutErrors],
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
