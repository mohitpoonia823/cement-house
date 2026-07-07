-- ============================================================
-- 021: Journal carries full khata metadata
--
-- The customer khata UI now reads from the double-entry journal instead of
-- ledger_entries. Two fields the khata displayed were missing from vouchers:
--
--   paymentMode   — CASH/UPI/CHEQUE/PARTIAL/CREDIT chip on statement rows
--   ledgerEntryId — the khata row a RECEIPT voucher mirrors. Previously this
--                   was stored in `reference` (as the backfill idempotency
--                   key), clobbering the user's own reference (UPI txn id,
--                   cheque no). It gets its own column so `reference` can
--                   hold the user's value again.
--
-- Idempotent: safe to re-run (db-sync replays all migrations).
-- ============================================================

ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS "paymentMode" TEXT;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS "ledgerEntryId" TEXT;

-- Legacy RECEIPT vouchers stored the khata entry id in `reference` — move it.
UPDATE journal_entries je
SET "ledgerEntryId" = je.reference
FROM ledger_entries le
WHERE je."voucherType" = 'RECEIPT'
  AND je."ledgerEntryId" IS NULL
  AND je.reference = le.id::text;

-- Enrich legacy vouchers with the payment mode recorded on the khata side.
UPDATE journal_entries je
SET "paymentMode" = le."paymentMode"::text
FROM ledger_entries le
WHERE je."ledgerEntryId" = le.id::text
  AND je."paymentMode" IS NULL;

UPDATE journal_entries je
SET "paymentMode" = o."paymentMode"::text
FROM orders o
WHERE je."voucherType" = 'SALE'
  AND je."orderId" = o.id
  AND je."paymentMode" IS NULL;

CREATE INDEX IF NOT EXISTS journal_entries_ledger_entry_idx
  ON journal_entries ("ledgerEntryId");
