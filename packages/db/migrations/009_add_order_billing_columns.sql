ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS "invoiceNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "subtotal" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "itemDiscountTotal" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "invoiceDiscount" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "taxableAmount" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "gstTotal" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "cgstTotal" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "sgstTotal" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "igstTotal" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "transportCharges" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "loadingCharges" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "roundOff" NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS "grandTotal" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "paidAmount" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "dueAmount" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "billingSnapshot" JSONB;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS "hsnCode" TEXT,
  ADD COLUMN IF NOT EXISTS "gstRate" NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS "taxableAmount" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "gstAmount" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "cgstAmount" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "sgstAmount" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "igstAmount" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "discountAmount" NUMERIC(12,2);

UPDATE orders
SET
  "invoiceNumber" = COALESCE("invoiceNumber", "orderNumber"),
  "subtotal" = COALESCE("subtotal", "totalAmount"),
  "itemDiscountTotal" = COALESCE("itemDiscountTotal", 0),
  "invoiceDiscount" = COALESCE("invoiceDiscount", 0),
  "taxableAmount" = COALESCE("taxableAmount", "totalAmount"),
  "gstTotal" = COALESCE("gstTotal", 0),
  "cgstTotal" = COALESCE("cgstTotal", 0),
  "sgstTotal" = COALESCE("sgstTotal", 0),
  "igstTotal" = COALESCE("igstTotal", 0),
  "transportCharges" = COALESCE("transportCharges", 0),
  "loadingCharges" = COALESCE("loadingCharges", 0),
  "roundOff" = COALESCE("roundOff", 0),
  "grandTotal" = COALESCE("grandTotal", "totalAmount"),
  "paidAmount" = COALESCE("paidAmount", "amountPaid"),
  "dueAmount" = COALESCE("dueAmount", ("totalAmount" - "amountPaid"));

CREATE INDEX IF NOT EXISTS idx_orders_business_created_billing
  ON orders("businessId", "createdAt", "isDeleted");

CREATE INDEX IF NOT EXISTS idx_orders_business_invoice
  ON orders("businessId", "invoiceNumber");
