-- CreateEnum
CREATE TYPE "CreatorDetectionStatus" AS ENUM ('detected', 'mapped', 'needs_review', 'unknown', 'failed');

-- CreateEnum
CREATE TYPE "SubmissionAttemptStatus" AS ENUM ('ready', 'uploading', 'uploaded', 'failed', 'already_linked');

-- CreateEnum
CREATE TYPE "ActivityLogLevel" AS ENUM ('info', 'warning', 'error');

-- CreateTable
CREATE TABLE "instagram_accounts" (
    "id" TEXT NOT NULL,
    "instagramId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instagram_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creators" (
    "id" TEXT NOT NULL,
    "detectedIdentifier" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_aliases" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "detectedIdentifier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reels" (
    "id" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "instagramReelId" TEXT NOT NULL,
    "instagramUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "creatorId" TEXT,
    "detectedIdentifier" TEXT,
    "creatorDetectionStatus" "CreatorDetectionStatus" NOT NULL DEFAULT 'unknown',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clipping_submissions" (
    "id" TEXT NOT NULL,
    "reelId" TEXT,
    "clippingClipId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "campaignId" TEXT,
    "bountyTag" TEXT,
    "clippingUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "isBeingTracked" BOOLEAN NOT NULL DEFAULT true,
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "dateAdded" TIMESTAMP(3),
    "dateCreated" TIMESTAMP(3),
    "lastUpdated" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clipping_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_attempts" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "status" "SubmissionAttemptStatus" NOT NULL,
    "errorMessage" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "level" "ActivityLogLevel" NOT NULL DEFAULT 'info',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instagram_accounts_instagramId_key" ON "instagram_accounts"("instagramId");

-- CreateIndex
CREATE UNIQUE INDEX "creators_detectedIdentifier_key" ON "creators"("detectedIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "creator_aliases_detectedIdentifier_key" ON "creator_aliases"("detectedIdentifier");

-- CreateIndex
CREATE INDEX "reels_creatorDetectionStatus_idx" ON "reels"("creatorDetectionStatus");

-- CreateIndex
CREATE INDEX "reels_publishedAt_idx" ON "reels"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "reels_instagramAccountId_instagramReelId_key" ON "reels"("instagramAccountId", "instagramReelId");

-- CreateIndex
CREATE UNIQUE INDEX "clipping_submissions_reelId_key" ON "clipping_submissions"("reelId");

-- CreateIndex
CREATE UNIQUE INDEX "clipping_submissions_clippingClipId_key" ON "clipping_submissions"("clippingClipId");

-- CreateIndex
CREATE INDEX "clipping_submissions_videoId_idx" ON "clipping_submissions"("videoId");

-- CreateIndex
CREATE INDEX "submission_attempts_reelId_idx" ON "submission_attempts"("reelId");

-- CreateIndex
CREATE INDEX "activity_logs_createdAt_idx" ON "activity_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "creator_aliases" ADD CONSTRAINT "creator_aliases_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reels" ADD CONSTRAINT "reels_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "instagram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reels" ADD CONSTRAINT "reels_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clipping_submissions" ADD CONSTRAINT "clipping_submissions_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "reels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_attempts" ADD CONSTRAINT "submission_attempts_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
