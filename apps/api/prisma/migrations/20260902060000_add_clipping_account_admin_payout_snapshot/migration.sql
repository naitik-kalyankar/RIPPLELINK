ALTER TABLE "clipping_accounts" ADD COLUMN "lastAdminPayoutSnapshot" JSONB;
ALTER TABLE "clipping_accounts" ADD COLUMN "lastAdminPayoutSnapshotAt" TIMESTAMP(3);
