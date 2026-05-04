CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  "priceMonthly" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "priceYearly" NUMERIC(12,2) NOT NULL DEFAULT 0,
  description TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_limits (
  id TEXT PRIMARY KEY,
  "planId" TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  "maxUsers" INTEGER,
  "maxProducts" INTEGER,
  "maxCustomers" INTEGER,
  "maxOrdersPerMonth" INTEGER,
  "maxInvoicesPerMonth" INTEGER,
  "storageLimit" BIGINT,
  "allowExports" BOOLEAN NOT NULL DEFAULT FALSE,
  "allowAdvancedReports" BOOLEAN NOT NULL DEFAULT FALSE,
  "allowMultipleLocations" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plan_limits_plan_id_unique UNIQUE ("planId")
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  "businessId" TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  "planId" TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED')),
  "startDate" TIMESTAMPTZ,
  "endDate" TIMESTAMPTZ,
  "trialEndDate" TIMESTAMPTZ,
  "autoRenew" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_business_active_idx
  ON subscriptions("businessId")
  WHERE status IN ('TRIAL', 'ACTIVE');

CREATE INDEX IF NOT EXISTS subscriptions_business_id_idx
  ON subscriptions("businessId");

CREATE TABLE IF NOT EXISTS subscription_payments (
  id TEXT PRIMARY KEY,
  "businessId" TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  "planId" TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  "subscriptionId" TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
  "razorpayOrderId" TEXT NOT NULL UNIQUE,
  "razorpayPaymentId" TEXT,
  amount NUMERIC(12,2) NOT NULL,
  interval TEXT NOT NULL CHECK (interval IN ('MONTHLY', 'YEARLY')),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscription_payments_business_idx
  ON subscription_payments("businessId", status, "createdAt" DESC);

CREATE TABLE IF NOT EXISTS razorpay_webhook_events (
  id TEXT PRIMARY KEY,
  "eventId" TEXT NOT NULL UNIQUE,
  "eventType" TEXT NOT NULL,
  "razorpayOrderId" TEXT,
  "razorpayPaymentId" TEXT,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "processedAt" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS razorpay_webhook_events_order_idx
  ON razorpay_webhook_events("razorpayOrderId", "createdAt" DESC);

INSERT INTO plans (id, name, "priceMonthly", "priceYearly", description, "isActive", features)
VALUES
  ('plan_free', 'FREE', 0, 0, 'Starter free access', TRUE, '{"allowAdvancedReports": false, "allowExports": false, "allowMultipleLocations": false}'::jsonb),
  ('plan_basic', 'BASIC', 699, 6990, 'Basic paid plan', TRUE, '{"allowAdvancedReports": false, "allowExports": true, "allowMultipleLocations": false}'::jsonb),
  ('plan_pro', 'PRO', 1499, 14990, 'Professional plan', TRUE, '{"allowAdvancedReports": true, "allowExports": true, "allowMultipleLocations": false}'::jsonb),
  ('plan_enterprise', 'ENTERPRISE', 3999, 39990, 'Enterprise plan', TRUE, '{"allowAdvancedReports": true, "allowExports": true, "allowMultipleLocations": true}'::jsonb)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  "priceMonthly" = EXCLUDED."priceMonthly",
  "priceYearly" = EXCLUDED."priceYearly",
  description = EXCLUDED.description,
  "isActive" = EXCLUDED."isActive",
  features = EXCLUDED.features,
  "updatedAt" = NOW();

INSERT INTO plan_limits (
  id, "planId", "maxUsers", "maxProducts", "maxCustomers", "maxOrdersPerMonth", "maxInvoicesPerMonth", "storageLimit",
  "allowExports", "allowAdvancedReports", "allowMultipleLocations"
)
VALUES
  ('limit_free', 'plan_free', 2, 200, 300, 300, 300, 1073741824, FALSE, FALSE, FALSE),
  ('limit_basic', 'plan_basic', 5, 2000, 3000, 5000, 5000, 5368709120, TRUE, FALSE, FALSE),
  ('limit_pro', 'plan_pro', 20, 20000, 30000, 50000, 50000, 21474836480, TRUE, TRUE, FALSE),
  ('limit_enterprise', 'plan_enterprise', NULL, NULL, NULL, NULL, NULL, NULL, TRUE, TRUE, TRUE)
ON CONFLICT ("planId") DO UPDATE
SET
  "maxUsers" = EXCLUDED."maxUsers",
  "maxProducts" = EXCLUDED."maxProducts",
  "maxCustomers" = EXCLUDED."maxCustomers",
  "maxOrdersPerMonth" = EXCLUDED."maxOrdersPerMonth",
  "maxInvoicesPerMonth" = EXCLUDED."maxInvoicesPerMonth",
  "storageLimit" = EXCLUDED."storageLimit",
  "allowExports" = EXCLUDED."allowExports",
  "allowAdvancedReports" = EXCLUDED."allowAdvancedReports",
  "allowMultipleLocations" = EXCLUDED."allowMultipleLocations",
  "updatedAt" = NOW();

INSERT INTO subscriptions (
  id,
  "businessId",
  "planId",
  status,
  "startDate",
  "endDate",
  "trialEndDate",
  "autoRenew"
)
SELECT
  ('sub_init_' || b.id),
  b.id,
  'plan_free',
  CASE
    WHEN b."subscriptionStatus"::text = 'TRIAL' THEN 'TRIAL'
    WHEN b."subscriptionStatus"::text IN ('ACTIVE', 'PAST_DUE') THEN 'ACTIVE'
    ELSE 'EXPIRED'
  END,
  NOW(),
  b."subscriptionEndsAt",
  b."subscriptionEndsAt",
  TRUE
FROM businesses b
WHERE NOT EXISTS (
  SELECT 1
  FROM subscriptions s
  WHERE s."businessId" = b.id
);
