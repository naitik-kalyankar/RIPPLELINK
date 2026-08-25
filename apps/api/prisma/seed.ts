import { PrismaClient } from "@prisma/client";
import { buildMockThumbnail } from "../src/services/instagram/mockThumbnail.js";

const prisma = new PrismaClient();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
}

async function main() {
  console.log("Seeding database...");

  await prisma.activityLog.deleteMany();
  await prisma.submissionAttempt.deleteMany();
  await prisma.clippingSubmission.deleteMany();
  await prisma.reel.deleteMany();
  await prisma.creatorAlias.deleteMany();
  await prisma.creator.deleteMany();
  await prisma.instagramAccount.deleteMany();

  const kickingReel = await prisma.instagramAccount.create({
    data: {
      instagramId: "17841400000000001",
      username: "kicking_reel",
      displayName: "Kicking Reel",
      active: true,
      lastSyncedAt: daysAgo(0),
    },
  });
  const clipMachine = await prisma.instagramAccount.create({
    data: {
      instagramId: "17841400000000002",
      username: "clip_machine",
      displayName: "Clip Machine",
      active: true,
      lastSyncedAt: daysAgo(1),
    },
  });
  await prisma.instagramAccount.create({
    data: {
      instagramId: "17841400000000003",
      username: "retired_account",
      displayName: "Retired Account",
      active: false,
      lastSyncedAt: daysAgo(30),
    },
  });

  const n3on = await prisma.creator.create({
    data: { detectedIdentifier: "n3on", displayName: "N3ON" },
  });
  await prisma.creatorAlias.create({ data: { creatorId: n3on.id, detectedIdentifier: "n3onlive" } });

  const larryWheels = await prisma.creator.create({
    data: { detectedIdentifier: "larrywheels", displayName: "LARRY WHEELS" },
  });

  const adinRoss = await prisma.creator.create({
    data: { detectedIdentifier: "adinross", displayName: "Adin Ross" },
  });

  // --- Reel A: mapped creator, already linked to CLIPPING ---
  const reelA = await prisma.reel.create({
    data: {
      instagramAccountId: kickingReel.id,
      instagramReelId: "DcDMriEMLLe",
      instagramUrl: "https://www.instagram.com/reel/DcDMriEMLLe/",
      thumbnailUrl: buildMockThumbnail("n3on", "reelA"),
      publishedAt: daysAgo(0),
      creatorId: n3on.id,
      detectedIdentifier: "n3on",
      creatorDetectionStatus: "mapped",
    },
  });
  await prisma.clippingSubmission.create({
    data: {
      reelId: reelA.id,
      clippingClipId: "clip_seed_001",
      videoId: "DcDMriEMLLe",
      campaignId: "camp_kick_clipping",
      bountyTag: "n3on",
      clippingUrl: "https://www.instagram.com/reel/DcDMriEMLLe/",
      isBeingTracked: true,
      views: 1957,
      likes: 12,
      comments: 0,
      dateAdded: daysAgo(0),
      dateCreated: daysAgo(0),
      lastUpdated: daysAgo(0),
    },
  });

  // --- Reel B: mapped creator (alias), unlinked ---
  await prisma.reel.create({
    data: {
      instagramAccountId: kickingReel.id,
      instagramReelId: "DbAliasABC01",
      instagramUrl: "https://www.instagram.com/reel/DbAliasABC01/",
      thumbnailUrl: buildMockThumbnail("n3onlive", "reelB"),
      publishedAt: daysAgo(1),
      creatorId: n3on.id,
      detectedIdentifier: "n3onlive",
      creatorDetectionStatus: "mapped",
    },
  });

  // --- Reel C: mapped creator, unlinked ---
  await prisma.reel.create({
    data: {
      instagramAccountId: clipMachine.id,
      instagramReelId: "DcLarryWheels02",
      instagramUrl: "https://www.instagram.com/reel/DcLarryWheels02/",
      thumbnailUrl: buildMockThumbnail("larrywheels", "reelC"),
      publishedAt: daysAgo(2),
      creatorId: larryWheels.id,
      detectedIdentifier: "larrywheels",
      creatorDetectionStatus: "mapped",
    },
  });

  // --- Reel D: mapped creator, has a failed submission attempt ---
  const reelD = await prisma.reel.create({
    data: {
      instagramAccountId: kickingReel.id,
      instagramReelId: "DdAdinFailed03",
      instagramUrl: "https://www.instagram.com/reel/DdAdinFailed03/",
      thumbnailUrl: buildMockThumbnail("adinross", "reelD"),
      publishedAt: daysAgo(2),
      creatorId: adinRoss.id,
      detectedIdentifier: "adinross",
      creatorDetectionStatus: "mapped",
    },
  });
  await prisma.submissionAttempt.create({
    data: { reelId: reelD.id, status: "failed", errorMessage: "Request timed out.", attemptedAt: daysAgo(1) },
  });

  // --- Reel E: unrecognized identifier, needs manual creator mapping ---
  await prisma.reel.create({
    data: {
      instagramAccountId: clipMachine.id,
      instagramReelId: "DeNeedsReview04",
      instagramUrl: "https://www.instagram.com/reel/DeNeedsReview04/",
      thumbnailUrl: buildMockThumbnail("newclipper88", "reelE"),
      publishedAt: daysAgo(3),
      creatorId: null,
      detectedIdentifier: "newclipper88",
      creatorDetectionStatus: "needs_review",
    },
  });

  // --- Reel F: no watermark detected at all ---
  await prisma.reel.create({
    data: {
      instagramAccountId: kickingReel.id,
      instagramReelId: "DfUnknown05",
      instagramUrl: "https://www.instagram.com/reel/DfUnknown05/",
      thumbnailUrl: buildMockThumbnail(null, "reelF"),
      publishedAt: daysAgo(4),
      creatorId: null,
      detectedIdentifier: null,
      creatorDetectionStatus: "unknown",
    },
  });

  // --- A handful more unlinked reels across creators/accounts for a fuller grid ---
  const extras = [
    { identifier: "n3on", creatorId: n3on.id, account: kickingReel.id, code: "DgExtra06" },
    { identifier: "larrywheels", creatorId: larryWheels.id, account: clipMachine.id, code: "DhExtra07" },
    { identifier: "adinross", creatorId: adinRoss.id, account: kickingReel.id, code: "DiExtra08" },
    { identifier: "n3on", creatorId: n3on.id, account: clipMachine.id, code: "DjExtra09" },
  ];
  for (const [i, extra] of extras.entries()) {
    await prisma.reel.create({
      data: {
        instagramAccountId: extra.account,
        instagramReelId: extra.code,
        instagramUrl: `https://www.instagram.com/reel/${extra.code}/`,
        thumbnailUrl: buildMockThumbnail(extra.identifier, extra.code),
        publishedAt: daysAgo(5 + i),
        creatorId: extra.creatorId,
        detectedIdentifier: extra.identifier,
        creatorDetectionStatus: "mapped",
      },
    });
  }

  await prisma.activityLog.createMany({
    data: [
      { message: "Fetched 24 new Reels from @kicking_reel", level: "info", createdAt: daysAgo(0) },
      { message: "Detected new creator: N3ON", level: "info", createdAt: daysAgo(6) },
      { message: `Submitted Reel ${reelA.instagramReelId} to CLIPPING`, level: "info", createdAt: daysAgo(0) },
      { message: "CLIPPING sync found 64 clips", level: "info", createdAt: daysAgo(0) },
      { message: `Failed to submit Reel ${reelD.instagramReelId} to CLIPPING: Request timed out.`, level: "error", createdAt: daysAgo(1) },
    ],
  });

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
