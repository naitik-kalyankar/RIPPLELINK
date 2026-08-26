-- AlterTable
ALTER TABLE "instagram_accounts" ADD COLUMN     "clippingAccountRefId" TEXT;

-- CreateTable
CREATE TABLE "clipping_accounts" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "email" TEXT,
    "apiUrl" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "storageStatePath" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clipping_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clipping_accounts_email_key" ON "clipping_accounts"("email");

-- AddForeignKey
ALTER TABLE "instagram_accounts" ADD CONSTRAINT "instagram_accounts_clippingAccountRefId_fkey" FOREIGN KEY ("clippingAccountRefId") REFERENCES "clipping_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
