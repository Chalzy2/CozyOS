-- CozyOS Billing → Entitlement bridge (Phase 3).
--
-- Phase 2 built subscription_plans/subscription_plan_prices/subscriptions/
-- wallet_accounts/wallet_ledger but never gave a plan any notion of WHICH
-- features/modules it licenses — there was no way to answer "does this
-- plan license feature X" at all. That's a real missing dependency for
-- entitlement integration, not a design choice to skip: without this
-- table, BillingRegistry.getEntitlementSnapshot() would have nothing
-- real to report.
--
-- Deliberately minimal: one row per (plan_id, feature_key), toggled by
-- an admin, versioned only insofar as it's fully replaced (not
-- incrementally patched) inside one transaction by
-- BillingRegistry.setPlanFeatures() — matching subscription_plan_prices'
-- own "never a bare mutation, always audited" posture, without inventing
-- a second, separate versioning scheme this round.

CREATE TABLE IF NOT EXISTS subscription_plan_features (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
  feature_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  UNIQUE (plan_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_subscription_plan_features_plan
  ON subscription_plan_features(plan_id);
