-- 014_add_multi_location_inventory.sql

DO $$ BEGIN
  CREATE TYPE "LocationType" AS ENUM ('STORE', 'GODOWN', 'WAREHOUSE', 'YARD');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "StockTransferStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  "businessId" TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type "LocationType" NOT NULL DEFAULT 'STORE',
  address TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS locations_business_active_name_idx
  ON locations ("businessId", "isActive", name);
CREATE INDEX IF NOT EXISTS locations_business_default_idx
  ON locations ("businessId", "isDefault");
CREATE UNIQUE INDEX IF NOT EXISTS locations_one_default_per_business_idx
  ON locations ("businessId")
  WHERE "isDefault" = true;

CREATE TABLE IF NOT EXISTS material_stock (
  id TEXT PRIMARY KEY,
  "businessId" TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  "materialId" TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  "locationId" TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  quantity NUMERIC(12, 3) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("businessId", "materialId", "locationId")
);

CREATE INDEX IF NOT EXISTS material_stock_business_location_material_idx
  ON material_stock ("businessId", "locationId", "materialId");
CREATE INDEX IF NOT EXISTS material_stock_business_material_idx
  ON material_stock ("businessId", "materialId");

CREATE TABLE IF NOT EXISTS stock_transfers (
  id TEXT PRIMARY KEY,
  "businessId" TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  "fromLocationId" TEXT NOT NULL REFERENCES locations(id),
  "toLocationId" TEXT NOT NULL REFERENCES locations(id),
  status "StockTransferStatus" NOT NULL DEFAULT 'COMPLETED',
  "createdById" TEXT NOT NULL REFERENCES users(id),
  notes TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stock_transfers_business_created_idx
  ON stock_transfers ("businessId", "createdAt");
CREATE INDEX IF NOT EXISTS stock_transfers_business_from_created_idx
  ON stock_transfers ("businessId", "fromLocationId", "createdAt");
CREATE INDEX IF NOT EXISTS stock_transfers_business_to_created_idx
  ON stock_transfers ("businessId", "toLocationId", "createdAt");

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id TEXT PRIMARY KEY,
  "transferId" TEXT NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  "materialId" TEXT NOT NULL REFERENCES materials(id),
  quantity NUMERIC(12, 3) NOT NULL
);

CREATE INDEX IF NOT EXISTS stock_transfer_items_transfer_idx
  ON stock_transfer_items ("transferId");
CREATE INDEX IF NOT EXISTS stock_transfer_items_material_idx
  ON stock_transfer_items ("materialId");

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS "sourceLocationId" TEXT;
ALTER TABLE orders
  ADD CONSTRAINT orders_source_location_fk
  FOREIGN KEY ("sourceLocationId") REFERENCES locations(id);
CREATE INDEX IF NOT EXISTS orders_business_source_location_created_idx
  ON orders ("businessId", "sourceLocationId", "createdAt");

-- Backfill one default location for existing businesses.
INSERT INTO locations (id, "businessId", name, type, "isDefault", "isActive", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text),
  b.id,
  'Main Store',
  'STORE'::"LocationType",
  true,
  true,
  NOW(),
  NOW()
FROM businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM locations l WHERE l."businessId" = b.id AND l."isDefault" = true
);

-- Ensure every business has exactly one default location (fallback to oldest location).
WITH ranked AS (
  SELECT
    l.id,
    l."businessId",
    ROW_NUMBER() OVER (
      PARTITION BY l."businessId"
      ORDER BY CASE WHEN l."isDefault" THEN 0 ELSE 1 END, l."createdAt" ASC, l.id ASC
    ) AS rn
  FROM locations l
)
UPDATE locations l
SET "isDefault" = (r.rn = 1),
    "updatedAt" = NOW()
FROM ranked r
WHERE l.id = r.id;

-- Backfill material stock into default location for each material.
INSERT INTO material_stock (id, "businessId", "materialId", "locationId", quantity, "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text),
  m."businessId",
  m.id,
  dl.id,
  COALESCE(m."stockQty", 0),
  NOW(),
  NOW()
FROM materials m
JOIN locations dl
  ON dl."businessId" = m."businessId"
 AND dl."isDefault" = true
WHERE NOT EXISTS (
  SELECT 1
  FROM material_stock ms
  WHERE ms."businessId" = m."businessId"
    AND ms."materialId" = m.id
    AND ms."locationId" = dl.id
);

-- Backfill historical orders source location to default location for reporting consistency.
UPDATE orders o
SET "sourceLocationId" = dl.id
FROM locations dl
WHERE o."businessId" = dl."businessId"
  AND dl."isDefault" = true
  AND o."sourceLocationId" IS NULL;
