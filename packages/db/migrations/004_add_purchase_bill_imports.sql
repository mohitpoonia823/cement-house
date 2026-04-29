CREATE TABLE IF NOT EXISTS material_aliases (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, normalized_alias)
);

CREATE INDEX IF NOT EXISTS material_aliases_material_idx
  ON material_aliases (business_id, material_id);

CREATE TABLE IF NOT EXISTS purchase_bill_scans (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_by_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  supplier_name TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  file_name TEXT,
  image_mime_type TEXT,
  image_sha256 TEXT NOT NULL,
  scan_provider TEXT NOT NULL DEFAULT 'gemini',
  scan_model TEXT,
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12, 2),
  tax_amount NUMERIC(12, 2),
  total_amount NUMERIC(12, 2),
  raw_text TEXT,
  notes TEXT,
  committed_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS purchase_bill_scans_business_status_idx
  ON purchase_bill_scans (business_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS purchase_bill_scans_image_hash_idx
  ON purchase_bill_scans (business_id, image_sha256);

CREATE INDEX IF NOT EXISTS purchase_bill_scans_invoice_idx
  ON purchase_bill_scans (business_id, invoice_number)
  WHERE invoice_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS purchase_bill_lines (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES purchase_bill_scans(id) ON DELETE CASCADE,
  line_index INTEGER NOT NULL DEFAULT 0,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  material_id TEXT REFERENCES materials(id) ON DELETE SET NULL,
  scanned_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  unit TEXT,
  quantity NUMERIC(12, 3),
  purchase_price NUMERIC(10, 2),
  line_total NUMERIC(12, 2),
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 0,
  match_confidence NUMERIC(5, 4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS purchase_bill_lines_scan_idx
  ON purchase_bill_lines (business_id, scan_id, line_index);

CREATE INDEX IF NOT EXISTS purchase_bill_lines_material_idx
  ON purchase_bill_lines (business_id, material_id);
