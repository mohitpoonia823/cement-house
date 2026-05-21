BEGIN;

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  "businessId" TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  "materialId" TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',
  sku TEXT,
  barcode TEXT,
  unit TEXT NOT NULL,
  "purchasePrice" NUMERIC(10, 2) NOT NULL DEFAULT 0,
  "salePrice" NUMERIC(10, 2) NOT NULL DEFAULT 0,
  "minThreshold" NUMERIC(12, 3) NOT NULL DEFAULT 0,
  "maxThreshold" NUMERIC(12, 3),
  attributes JSONB,
  metadata JSONB,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("businessId", "materialId", name)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_default_unique_idx
  ON product_variants ("businessId", "materialId")
  WHERE "isDefault" = true;

CREATE INDEX IF NOT EXISTS product_variants_material_idx
  ON product_variants ("businessId", "materialId", "isActive");

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS "variantId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'order_items_variant_fk'
  ) THEN
    ALTER TABLE order_items
      ADD CONSTRAINT order_items_variant_fk
      FOREIGN KEY ("variantId") REFERENCES product_variants(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS order_items_variant_idx
  ON order_items ("variantId");

INSERT INTO product_variants (
  id,
  "businessId",
  "materialId",
  name,
  sku,
  barcode,
  unit,
  "purchasePrice",
  "salePrice",
  "minThreshold",
  "maxThreshold",
  attributes,
  metadata,
  "isDefault",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  m.id || '-default',
  m."businessId",
  m.id,
  'Default',
  NULL,
  m.barcode,
  m.unit,
  m."purchasePrice",
  m."salePrice",
  m."minThreshold",
  m."maxThreshold",
  CASE
    WHEN m.size IS NULL AND m.color IS NULL AND m.material IS NULL THEN NULL
    ELSE jsonb_strip_nulls(
      jsonb_build_object(
        'size', m.size,
        'color', m.color,
        'material', m.material
      )
    )
  END,
  m.metadata,
  true,
  m."isActive",
  NOW(),
  NOW()
FROM materials m
WHERE m."isActive" = true
  AND NOT EXISTS (
    SELECT 1
    FROM product_variants pv
    WHERE pv."businessId" = m."businessId"
      AND pv."materialId" = m.id
      AND pv."isDefault" = true
  );

COMMIT;
