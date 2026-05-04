CREATE INDEX IF NOT EXISTS orders_business_created_status_idx
  ON orders("businessId", "createdAt", status)
  WHERE "isDeleted" = false;

CREATE INDEX IF NOT EXISTS orders_business_customer_created_idx
  ON orders("businessId", "customerId", "createdAt")
  WHERE "isDeleted" = false;

CREATE INDEX IF NOT EXISTS order_items_order_material_idx
  ON order_items("orderId", "materialId");

CREATE INDEX IF NOT EXISTS order_items_hsn_idx
  ON order_items("hsnCode");

CREATE INDEX IF NOT EXISTS ledger_entries_business_type_created_idx
  ON ledger_entries("businessId", type, "createdAt");

CREATE INDEX IF NOT EXISTS sales_returns_business_created_idx
  ON sales_returns("businessId", "createdAt");
