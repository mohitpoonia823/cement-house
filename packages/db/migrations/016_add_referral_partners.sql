DO $$ BEGIN
  CREATE TYPE "ReferralRewardType" AS ENUM ('FLAT', 'PERCENT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS referral_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "businessId" uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  role text NOT NULL,
  area text,
  notes text,
  "rewardType" "ReferralRewardType" NOT NULL DEFAULT 'PERCENT',
  "rewardValue" numeric(10,2) NOT NULL DEFAULT 1.00,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_partners_business_active_name_idx
  ON referral_partners ("businessId", "isActive", name);
CREATE INDEX IF NOT EXISTS referral_partners_business_phone_idx
  ON referral_partners ("businessId", phone);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS "referralPartnerId" uuid REFERENCES referral_partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "referralRewardAmount" numeric(12,2),
  ADD COLUMN IF NOT EXISTS "referralRewardRate" numeric(10,2);

CREATE INDEX IF NOT EXISTS orders_business_referral_partner_created_idx
  ON orders ("businessId", "referralPartnerId", "createdAt");
