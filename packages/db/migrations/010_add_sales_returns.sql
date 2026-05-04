DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SalesReturnStatus') THEN
    CREATE TYPE "SalesReturnStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderReturnStatus') THEN
    CREATE TYPE "OrderReturnStatus" AS ENUM ('NONE', 'PARTIAL', 'FULL');
  END IF;
END$$;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS "returnedAmount" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "returnStatus" "OrderReturnStatus" NOT NULL DEFAULT 'NONE';

CREATE TABLE IF NOT EXISTS sales_returns (
  id TEXT PRIMARY KEY,
  "businessId" TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  "orderId" TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  "customerId" TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  "returnNumber" TEXT NOT NULL,
  "returnDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  "totalReturnAmount" NUMERIC(12,2) NOT NULL,
  "gstReversalAmount" NUMERIC(12,2) NOT NULL,
  "ledgerAdjustmentAmount" NUMERIC(12,2) NOT NULL,
  status "SalesReturnStatus" NOT NULL DEFAULT 'COMPLETED',
  "createdById" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("businessId", "returnNumber")
);

CREATE TABLE IF NOT EXISTS sales_return_items (
  id TEXT PRIMARY KEY,
  "returnId" TEXT NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  "orderItemId" TEXT NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  "materialId" TEXT NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  "quantityReturned" NUMERIC(12,3) NOT NULL,
  "unitPrice" NUMERIC(10,2) NOT NULL,
  "discountAmount" NUMERIC(12,2) NOT NULL,
  "taxableAmount" NUMERIC(12,2) NOT NULL,
  "gstAmount" NUMERIC(12,2) NOT NULL,
  "totalAmount" NUMERIC(12,2) NOT NULL,
  "cgstAmount" NUMERIC(12,2),
  "sgstAmount" NUMERIC(12,2),
  "igstAmount" NUMERIC(12,2)
);

CREATE INDEX IF NOT EXISTS idx_sales_returns_business_date ON sales_returns("businessId","returnDate","createdAt");
CREATE INDEX IF NOT EXISTS idx_sales_returns_business_order ON sales_returns("businessId","orderId","createdAt");
CREATE INDEX IF NOT EXISTS idx_sales_returns_business_customer ON sales_returns("businessId","customerId","createdAt");
CREATE INDEX IF NOT EXISTS idx_sales_return_items_return ON sales_return_items("returnId");
CREATE INDEX IF NOT EXISTS idx_sales_return_items_order_item ON sales_return_items("orderItemId");
CREATE INDEX IF NOT EXISTS idx_sales_return_items_material ON sales_return_items("materialId");

UPDATE orders
SET
  "returnedAmount" = COALESCE("returnedAmount", 0),
  "returnStatus" = COALESCE("returnStatus", 'NONE');
