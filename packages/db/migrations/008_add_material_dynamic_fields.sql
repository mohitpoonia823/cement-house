ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS barcode TEXT,
  ADD COLUMN IF NOT EXISTS "batchNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "expiryDate" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "manufactureDate" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manufacturer TEXT,
  ADD COLUMN IF NOT EXISTS "rackLocation" TEXT,
  ADD COLUMN IF NOT EXISTS size TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS material TEXT,
  ADD COLUMN IF NOT EXISTS weight NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS purity NUMERIC(8, 3),
  ADD COLUMN IF NOT EXISTS "makingCharges" NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS "serialNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "imeiNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "grossWeight" NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS "tareWeight" NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS "netWeight" NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS materials_business_barcode_idx
  ON materials ("businessId", barcode)
  WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS materials_business_batch_idx
  ON materials ("businessId", "batchNumber")
  WHERE "batchNumber" IS NOT NULL;

CREATE INDEX IF NOT EXISTS materials_business_expiry_idx
  ON materials ("businessId", "expiryDate")
  WHERE "expiryDate" IS NOT NULL;

CREATE INDEX IF NOT EXISTS materials_business_serial_idx
  ON materials ("businessId", "serialNumber")
  WHERE "serialNumber" IS NOT NULL;
