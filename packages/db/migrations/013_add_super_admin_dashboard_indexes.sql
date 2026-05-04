CREATE INDEX IF NOT EXISTS subscription_payments_status_created_at_idx
  ON subscription_payments(status, "createdAt" DESC);

CREATE INDEX IF NOT EXISTS subscription_payments_plan_status_created_at_idx
  ON subscription_payments("planId", status, "createdAt" DESC);

CREATE INDEX IF NOT EXISTS subscriptions_status_plan_business_idx
  ON subscriptions(status, "planId", "businessId");

CREATE INDEX IF NOT EXISTS razorpay_webhook_events_processed_created_at_idx
  ON razorpay_webhook_events(processed, "createdAt" DESC);

CREATE INDEX IF NOT EXISTS businesses_subscription_status_plan_created_at_idx
  ON businesses("subscriptionStatus", "subscriptionPlan", "createdAt" DESC);
