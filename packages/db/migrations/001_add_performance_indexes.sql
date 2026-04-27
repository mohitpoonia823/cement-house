-- 001_add_performance_indexes.sql
-- Added for API filtering/sorting patterns observed in routes.

CREATE INDEX IF NOT EXISTS idx_orders_biz_deleted_created_id
  ON orders ("businessId", "isDeleted", "createdAt" DESC, id);

CREATE INDEX IF NOT EXISTS idx_orders_biz_status_deleted_created_id
  ON orders ("businessId", status, "isDeleted", "createdAt" DESC, id);

CREATE INDEX IF NOT EXISTS idx_orders_biz_customer_deleted_created_id
  ON orders ("businessId", "customerId", "isDeleted", "createdAt" DESC, id);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_customer_created_id
  ON ledger_entries ("customerId", "createdAt" ASC, id);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_biz_created_id
  ON ledger_entries ("businessId", "createdAt" DESC, id);

CREATE INDEX IF NOT EXISTS idx_deliveries_order_created_id
  ON deliveries ("orderId", "createdAt" DESC, id);

CREATE INDEX IF NOT EXISTS idx_customers_biz_active_name_id
  ON customers ("businessId", "isActive", name, id);

CREATE INDEX IF NOT EXISTS idx_materials_biz_active_name_id
  ON materials ("businessId", "isActive", name, id);

CREATE INDEX IF NOT EXISTS idx_reminders_status_scheduled_id
  ON reminders (status, "scheduledAt" ASC, id);

CREATE INDEX IF NOT EXISTS idx_businesses_active_created_id
  ON businesses ("isActive", "createdAt" DESC, id);

CREATE INDEX IF NOT EXISTS idx_users_active_role_created_id
  ON users ("isActive", role, "createdAt" DESC, id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_business_created_id
  ON audit_logs ("businessId", "createdAt" DESC, id);
