-- CreateEnum
CREATE TYPE "ReferralRewardType" AS ENUM ('FLAT', 'PERCENT');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "referralPartnerId" TEXT,
ADD COLUMN     "referralRewardAmount" DECIMAL(12,2),
ADD COLUMN     "referralRewardRate" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "referral_partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "area" TEXT,
    "notes" TEXT,
    "rewardType" "ReferralRewardType" NOT NULL DEFAULT 'PERCENT',
    "rewardValue" DECIMAL(10,2) NOT NULL DEFAULT 1.00,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "businessId" TEXT NOT NULL,

    CONSTRAINT "referral_partners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "referral_partners_businessId_isActive_name_idx" ON "referral_partners"("businessId", "isActive", "name");

-- CreateIndex
CREATE INDEX "referral_partners_businessId_phone_idx" ON "referral_partners"("businessId", "phone");

-- CreateIndex
CREATE INDEX "orders_businessId_referralPartnerId_createdAt_idx" ON "orders"("businessId", "referralPartnerId", "createdAt");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_referralPartnerId_fkey" FOREIGN KEY ("referralPartnerId") REFERENCES "referral_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_partners" ADD CONSTRAINT "referral_partners_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
