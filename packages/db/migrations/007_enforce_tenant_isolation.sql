-- Enforce tenant assignment for all non-super-admin users.
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_tenant_required_chk;

ALTER TABLE users
  ADD CONSTRAINT users_tenant_required_chk
  CHECK (
    role = 'SUPER_ADMIN'::"UserRole"
    OR "businessId" IS NOT NULL
  );

-- Helpful tenant-scoped lookup indexes.
CREATE INDEX IF NOT EXISTS orders_business_order_number_idx
  ON orders ("businessId", "orderNumber");

CREATE INDEX IF NOT EXISTS deliveries_order_created_idx
  ON deliveries ("orderId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS ledger_entries_business_order_created_idx
  ON ledger_entries ("businessId", "orderId", "createdAt" DESC);

