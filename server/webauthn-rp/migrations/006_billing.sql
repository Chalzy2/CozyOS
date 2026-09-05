-- CozyOS Billing Foundation — server-authoritative subscription + wallet schema.
-- Implements the scope authorized against docs/billing-architecture-boundary.md:
-- subscription_plans, subscriptions, wallet_accounts, wallet_ledger, plus
-- subscription_plan_prices (versioned pricing) required for historical
-- financial integrity — an admin changing today's price must never alter
-- what a past subscription/transaction is understood to have used.
--
-- Deliberately NOT created in this migration (per the boundary document's
-- own scope and the "do not create tables merely because they sound
-- useful" instruction): invoices, payment_attempts, payment_transactions,
-- provider_events, refunds, credits, usage_records. Those remain future
-- work once a real payment provider is integrated.
--
-- Follows the exact conventions already proven by 005_organizations.sql:
-- TEXT PRIMARY KEY (crypto.randomUUID() at the application layer), BIGINT
-- epoch-millisecond timestamps, REFERENCES for real foreign keys, CozyOS's
-- one shared audit_events table (never a second audit system).

-- ---------- subscription_plans ----------
-- The catalog of what can be subscribed to. A plan's *price* is NOT a
-- column here — see subscription_plan_prices below — because price must
-- be versioned to preserve historical integrity per instruction #10.
CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  plan_key TEXT NOT NULL,
  application_id TEXT,
  name TEXT NOT NULL,
  currency TEXT NOT NULL,
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('month', 'year', 'one_time')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- plan_key is unique per application (NULL application_id = platform-wide
-- plan) — this is what keeps QuarryOS's "pro_monthly" and Cozycabin's
-- "pro_monthly" from colliding, per the framework's application-isolation
-- requirement. Postgres correctly treats NULL as distinct for uniqueness
-- purposes, matching the existing idx_users_firebase_uid precedent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_plans_app_key
  ON subscription_plans(application_id, plan_key);

-- ---------- subscription_plan_prices (versioned, admin-configurable amount) ----------
-- This table IS the "commission.amount"-style configurable business value
-- the framework requires — never a hard-coded literal. Exactly one row per
-- plan may be the current price at any moment (status='active' AND
-- effective_until IS NULL); every prior price is retained, never deleted,
-- never edited, so a historical subscription can always be explained.
CREATE TABLE IF NOT EXISTS subscription_plan_prices (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
  version INTEGER NOT NULL,
  amount_minor_units BIGINT NOT NULL CHECK (amount_minor_units >= 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  effective_from BIGINT NOT NULL,
  effective_until BIGINT,
  reason TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  UNIQUE (plan_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_plan_prices_current
  ON subscription_plan_prices(plan_id)
  WHERE status = 'active' AND effective_until IS NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_plan_prices_plan
  ON subscription_plan_prices(plan_id);

-- ---------- subscriptions ----------
-- Which organization holds which plan. current_price_id is resolved and
-- locked at creation/renewal time — a subscription's charge always uses
-- the price it was actually bound to, never "whatever the plan currently
-- costs," per instruction #10 (historical financial integrity).
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
  current_price_id TEXT NOT NULL REFERENCES subscription_plan_prices(id),
  status TEXT NOT NULL CHECK (status IN ('trialing', 'active', 'grace_period', 'expired', 'paused', 'canceled')),
  current_period_start BIGINT NOT NULL,
  current_period_end BIGINT NOT NULL,
  trial_ends_at BIGINT,
  grace_period_ends_at BIGINT,
  canceled_at BIGINT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- One non-terminal subscription per organization. 'expired' and 'canceled'
-- are terminal and deliberately excluded, so an organization can start a
-- fresh subscription after a prior one ends — matches the real business
-- rule (a lapsed customer can resubscribe), not an artificial one-forever
-- restriction.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_org_nonterminal
  ON subscriptions(organization_id)
  WHERE status IN ('trialing', 'active', 'grace_period', 'paused');

CREATE INDEX IF NOT EXISTS idx_subscriptions_organization ON subscriptions(organization_id);

-- ---------- wallet_accounts ----------
-- One row per billable organization. balance_minor_units is a
-- transactionally-maintained CACHE, never the source of truth by itself —
-- every change to it happens in the same database transaction as the
-- wallet_ledger row that justifies it (see billing.js recordLedgerEntry()),
-- so it can always be independently reconstructed by summing
-- wallet_ledger. This mirrors the boundary document's explicit rule:
-- "No individual application maintains its own independent balance."
CREATE TABLE IF NOT EXISTS wallet_accounts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE REFERENCES organizations(id),
  currency TEXT NOT NULL,
  balance_minor_units BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- ---------- wallet_ledger ----------
-- Append-only. Every balance change is a row here — never a bare balance
-- mutation — mirroring audit_events's own append-only, never-updated
-- posture. balance_after_minor_units is a point-in-time snapshot, so the
-- full balance history is reconstructable by reading this table alone,
-- even if wallet_accounts.balance_minor_units were ever lost or corrupted.
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id TEXT PRIMARY KEY,
  wallet_account_id TEXT NOT NULL REFERENCES wallet_accounts(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  amount_minor_units BIGINT NOT NULL,
  currency TEXT NOT NULL,
  balance_after_minor_units BIGINT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('subscription_charge', 'credit', 'refund', 'adjustment')),
  reference_type TEXT,
  reference_id TEXT,
  description TEXT,
  created_by TEXT REFERENCES users(id),
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_organization ON wallet_ledger(organization_id);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_wallet_account ON wallet_ledger(wallet_account_id);
