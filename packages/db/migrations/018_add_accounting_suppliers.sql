-- ============================================================
-- 018 — Double-entry accounting: suppliers, chart of accounts,
--       journal vouchers, and purchase bills (Tally-style).
-- Idempotent: safe to run multiple times.
-- NOTE: ids are TEXT (Prisma String @default(uuid())) to match the
--       existing schema — NOT native uuid.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "VoucherType" AS ENUM ('OPENING', 'PURCHASE', 'PAYMENT', 'RECEIPT', 'SALE', 'CONTRA', 'JOURNAL', 'EXPENSE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─────────────────────────────────────────
-- Suppliers
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id               TEXT PRIMARY KEY,
  name             text NOT NULL,
  phone            text,
  "altPhone"       text,
  address          text,
  gstin            text,
  "stateCode"      text,
  "openingBalance" numeric(12,2) NOT NULL DEFAULT 0,
  notes            text,
  "isActive"       boolean NOT NULL DEFAULT true,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now(),
  "businessId"     TEXT NOT NULL REFERENCES businesses(id)
);
CREATE INDEX IF NOT EXISTS suppliers_business_active_name_idx ON suppliers ("businessId", "isActive", name);
CREATE INDEX IF NOT EXISTS suppliers_business_phone_idx ON suppliers ("businessId", phone);

-- ─────────────────────────────────────────
-- Ledger accounts (chart of accounts)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id               TEXT PRIMARY KEY,
  name             text NOT NULL,
  type             "AccountType" NOT NULL,
  "group"          text NOT NULL,
  code             text,
  "isSystem"       boolean NOT NULL DEFAULT false,
  "openingBalance" numeric(14,2) NOT NULL DEFAULT 0,
  "openingIsDebit" boolean NOT NULL DEFAULT true,
  "isActive"       boolean NOT NULL DEFAULT true,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now(),
  "businessId"     TEXT NOT NULL REFERENCES businesses(id),
  "supplierId"     TEXT UNIQUE REFERENCES suppliers(id),
  "customerId"     TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ledger_accounts_business_name_key ON ledger_accounts ("businessId", name);
CREATE INDEX IF NOT EXISTS ledger_accounts_business_type_group_idx ON ledger_accounts ("businessId", type, "group");

-- ─────────────────────────────────────────
-- Purchases (supplier bills)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchases (
  id                      TEXT PRIMARY KEY,
  "purchaseNumber"        text NOT NULL,
  "supplierInvoiceNumber" text,
  "invoiceDate"           timestamptz NOT NULL DEFAULT now(),
  subtotal                numeric(14,2) NOT NULL DEFAULT 0,
  "discountTotal"         numeric(14,2) NOT NULL DEFAULT 0,
  "taxableAmount"         numeric(14,2) NOT NULL DEFAULT 0,
  "cgstTotal"             numeric(14,2) NOT NULL DEFAULT 0,
  "sgstTotal"             numeric(14,2) NOT NULL DEFAULT 0,
  "igstTotal"             numeric(14,2) NOT NULL DEFAULT 0,
  "gstTotal"              numeric(14,2) NOT NULL DEFAULT 0,
  "roundOff"              numeric(10,2) NOT NULL DEFAULT 0,
  "grandTotal"            numeric(14,2) NOT NULL DEFAULT 0,
  "paidAmount"            numeric(14,2) NOT NULL DEFAULT 0,
  notes                   text,
  status                  "PurchaseStatus" NOT NULL DEFAULT 'CONFIRMED',
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "businessId"            TEXT NOT NULL REFERENCES businesses(id),
  "supplierId"            TEXT NOT NULL REFERENCES suppliers(id),
  "createdById"           TEXT NOT NULL REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS purchases_business_number_key ON purchases ("businessId", "purchaseNumber");
CREATE INDEX IF NOT EXISTS purchases_business_supplier_date_idx ON purchases ("businessId", "supplierId", "invoiceDate");
CREATE INDEX IF NOT EXISTS purchases_business_date_idx ON purchases ("businessId", "invoiceDate");

-- ─────────────────────────────────────────
-- Journal entries (vouchers)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entries (
  id              TEXT PRIMARY KEY,
  "voucherType"   "VoucherType" NOT NULL,
  "voucherNumber" text NOT NULL,
  date            timestamptz NOT NULL DEFAULT now(),
  narration       text,
  reference       text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "businessId"    TEXT NOT NULL REFERENCES businesses(id),
  "supplierId"    TEXT REFERENCES suppliers(id),
  "purchaseId"    TEXT UNIQUE REFERENCES purchases(id),
  "createdById"   TEXT NOT NULL REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_business_voucher_key ON journal_entries ("businessId", "voucherNumber");
CREATE INDEX IF NOT EXISTS journal_entries_business_type_date_idx ON journal_entries ("businessId", "voucherType", date);
CREATE INDEX IF NOT EXISTS journal_entries_business_supplier_date_idx ON journal_entries ("businessId", "supplierId", date);

-- ─────────────────────────────────────────
-- Journal lines (debit / credit legs)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_lines (
  id          TEXT PRIMARY KEY,
  "entryId"   TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  "accountId" TEXT NOT NULL REFERENCES ledger_accounts(id),
  debit       numeric(14,2) NOT NULL DEFAULT 0,
  credit      numeric(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS journal_lines_entry_idx ON journal_lines ("entryId");
CREATE INDEX IF NOT EXISTS journal_lines_account_idx ON journal_lines ("accountId");

-- ─────────────────────────────────────────
-- Purchase items (line items)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_items (
  id               TEXT PRIMARY KEY,
  "purchaseId"     TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  "materialId"     TEXT REFERENCES materials(id),
  description      text,
  quantity         numeric(12,3) NOT NULL,
  "unitCost"       numeric(12,2) NOT NULL,
  "hsnCode"        text,
  "gstRate"        numeric(5,2),
  "taxableAmount"  numeric(14,2) NOT NULL DEFAULT 0,
  "gstAmount"      numeric(14,2) NOT NULL DEFAULT 0,
  "discountAmount" numeric(14,2) NOT NULL DEFAULT 0,
  "lineTotal"      numeric(14,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS purchase_items_purchase_idx ON purchase_items ("purchaseId");
CREATE INDEX IF NOT EXISTS purchase_items_material_idx ON purchase_items ("materialId");
