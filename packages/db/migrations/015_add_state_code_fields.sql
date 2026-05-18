ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS "stateCode" TEXT;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS "stateCode" TEXT;

UPDATE businesses
SET "stateCode" = SUBSTRING(gstin FROM 1 FOR 2)
WHERE "stateCode" IS NULL
  AND gstin ~ '^[0-9]{2}[A-Za-z0-9]{13}$';

UPDATE customers
SET "stateCode" = SUBSTRING(gstin FROM 1 FOR 2)
WHERE "stateCode" IS NULL
  AND gstin ~ '^[0-9]{2}[A-Za-z0-9]{13}$';
