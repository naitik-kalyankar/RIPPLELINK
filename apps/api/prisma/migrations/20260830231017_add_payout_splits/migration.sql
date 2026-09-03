-- Adds PayoutSplit: how one ClippingAccount's real payout is split between named people.
-- Written by hand (not via `prisma migrate diff`) because that command's introspection trips
-- over the auth.users cross-schema FKs added by hand in the previous migration — same
-- reasoning applies here, so this one also adds its own auth.users FK and RLS by hand.

-- CreateTable
CREATE TABLE "payout_splits" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "clippingAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_splits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payout_splits_userId_idx" ON "payout_splits"("userId");

-- CreateIndex
CREATE INDEX "payout_splits_clippingAccountId_idx" ON "payout_splits"("clippingAccountId");

-- AddForeignKey
ALTER TABLE "payout_splits" ADD CONSTRAINT "payout_splits_clippingAccountId_fkey"
  FOREIGN KEY ("clippingAccountId") REFERENCES "clipping_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (auth.users — see note above)
ALTER TABLE "payout_splits" ADD CONSTRAINT "payout_splits_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;

-- RLS — same defense-in-depth pattern as every other owned table (see the multi-user-auth
-- migration for the shared current_user_is_admin() helper this reuses).
ALTER TABLE "payout_splits" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payout_splits_select" ON "payout_splits" FOR SELECT
  USING (auth.uid() = "userId" OR public.current_user_is_admin());
CREATE POLICY "payout_splits_insert" ON "payout_splits" FOR INSERT
  WITH CHECK (auth.uid() = "userId");
CREATE POLICY "payout_splits_update" ON "payout_splits" FOR UPDATE
  USING (auth.uid() = "userId") WITH CHECK (auth.uid() = "userId");
CREATE POLICY "payout_splits_delete" ON "payout_splits" FOR DELETE
  USING (auth.uid() = "userId");
