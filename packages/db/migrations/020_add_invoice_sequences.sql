-- ============================================================
-- 020: Transactional invoice numbering
--
-- 1. invoice_sequences — a per-business, per-year counter that is
--    incremented atomically INSIDE the order-create transaction
--    (INSERT ... ON CONFLICT DO UPDATE ... RETURNING). Concurrent
--    order creates serialize on the row lock, so duplicate invoice
--    numbers are impossible; a rolled-back order also rolls back the
--    increment, keeping the legal series gapless.
--
-- 2. orders.orderNumber uniqueness becomes per-business instead of
--    global: every tenant runs its own INV-<year>-<seq> series, so a
--    global unique constraint would make different businesses collide
--    on the same number.
--
-- Idempotent: safe to re-run (db-sync replays all migrations).
-- ============================================================

CREATE TABLE IF NOT EXISTS invoice_sequences (
  "businessId" TEXT NOT NULL,
  year         INTEGER NOT NULL,
  value        INTEGER NOT NULL DEFAULT 0,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT invoice_sequences_pkey PRIMARY KEY ("businessId", year)
);

-- Seed each business/year with the highest sequence already issued so new
-- numbers continue from the current maximum. GREATEST keeps re-runs from
-- ever moving a live counter backwards.
INSERT INTO invoice_sequences ("businessId", year, value)
SELECT
  o."businessId",
  CAST(SPLIT_PART(o."orderNumber", '-', 2) AS INTEGER) AS year,
  MAX(CAST(SPLIT_PART(o."orderNumber", '-', 3) AS INTEGER)) AS value
FROM orders o
WHERE o."orderNumber" ~ '^INV-[0-9]{4}-[0-9]+$'
GROUP BY o."businessId", CAST(SPLIT_PART(o."orderNumber", '-', 2) AS INTEGER)
ON CONFLICT ("businessId", year)
DO UPDATE SET value = GREATEST(invoice_sequences.value, EXCLUDED.value);

-- Tenant-scoped invoice uniqueness (replaces the global unique constraint).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS "orders_orderNumber_key";
DROP INDEX IF EXISTS "orders_orderNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "orders_businessId_orderNumber_key"
  ON orders ("businessId", "orderNumber");
