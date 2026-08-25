-- Postgres has no direct "drop enum value" — swap in a new type without it.
-- Any needs_review rows must already be backfilled to another status before this runs.
CREATE TYPE "CreatorDetectionStatus_new" AS ENUM ('detected', 'mapped', 'unknown', 'failed');
ALTER TABLE "reels" ALTER COLUMN "creatorDetectionStatus" DROP DEFAULT;
ALTER TABLE "reels" ALTER COLUMN "creatorDetectionStatus" TYPE "CreatorDetectionStatus_new" USING ("creatorDetectionStatus"::text::"CreatorDetectionStatus_new");
ALTER TABLE "reels" ALTER COLUMN "creatorDetectionStatus" SET DEFAULT 'unknown';
DROP TYPE "CreatorDetectionStatus";
ALTER TYPE "CreatorDetectionStatus_new" RENAME TO "CreatorDetectionStatus";
