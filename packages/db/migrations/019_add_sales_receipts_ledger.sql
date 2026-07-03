-- ============================================================
-- 019 — Unify sales & customer receipts into the double-entry ledger.
-- Adds customer party-ledger linkage and order/customer references on
-- journal vouchers. Idempotent. Ids are TEXT (match existing schema).
-- ============================================================

-- Customer party ledgers: one ledger_accounts row per customer (Sundry Debtors).
CREATE UNIQUE INDEX IF NOT EXISTS ledger_accounts_customerId_key
  ON ledger_accounts ("customerId");

-- Link SALE / RECEIPT vouchers back to their customer and source order.
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS "customerId" TEXT,
  ADD COLUMN IF NOT EXISTS "orderId" TEXT;

CREATE INDEX IF NOT EXISTS journal_entries_business_customer_date_idx
  ON journal_entries ("businessId", "customerId", date);
CREATE INDEX IF NOT EXISTS journal_entries_order_idx
  ON journal_entries ("orderId");
