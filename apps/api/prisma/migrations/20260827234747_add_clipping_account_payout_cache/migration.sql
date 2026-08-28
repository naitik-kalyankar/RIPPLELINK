-- AlterTable
ALTER TABLE "clipping_accounts" ADD COLUMN     "lastPayout" DOUBLE PRECISION,
ADD COLUMN     "lastPayoutBountyBreakdown" JSONB,
ADD COLUMN     "lastPayoutFetchedAt" TIMESTAMP(3);
