ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS "businessType" TEXT NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS "customLabels" JSONB;

UPDATE businesses
SET "customLabels" = '{}'::jsonb
WHERE "customLabels" IS NULL;
