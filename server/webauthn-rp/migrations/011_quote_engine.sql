-- CozyOS Live Quote, Rate & Conversion Foundation (Phase 5.3 Step 2).
--
-- Extends, never duplicates, the real infrastructure Phase 5.3 Step 1
-- already built: crypto_exchange_rates (ALTERed here to add rate_type/
-- bid/ask/observed_at, rather than a second rates table),
-- crypto_network_asset_rules (asset/network compatibility — reused as-
-- is), payment_intents/payment_events/audit_events (reused, never
-- duplicated).
--
-- New tables here are genuinely new, confirmed by repository-wide
-- search: financial_assets (decimals/type metadata — the actual fix for
-- "do not put crypto tickers into a field that represents ISO fiat
-- currencies," the exact lesson from Phase 5.3 Step 1's own bug),
-- crypto_fee_configs (versioned, mirroring subscription_plan_prices'
-- proven pattern exactly), and quotes (the Quote Engine's authoritative
-- record).

CREATE TABLE IF NOT EXISTS financial_assets (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('FIAT', 'CRYPTO')),
  decimals INTEGER NOT NULL CHECK (decimals >= 0 AND decimals <= 18),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

ALTER TABLE crypto_exchange_rates ADD COLUMN rate_type TEXT NOT NULL DEFAULT 'MANUAL_RATE' CHECK (rate_type IN ('REAL_RATE_PROVIDER', 'TEST_RATE_PROVIDER', 'MANUAL_RATE'));
ALTER TABLE crypto_exchange_rates ADD COLUMN bid TEXT;
ALTER TABLE crypto_exchange_rates ADD COLUMN ask TEXT;
ALTER TABLE crypto_exchange_rates ADD COLUMN observed_at BIGINT;

-- Mirrors subscription_plan_prices' exact versioning posture: exactly
-- one active row per (organization, fee_type) at a time, prior rows
-- retained forever, never edited.
CREATE TABLE IF NOT EXISTS crypto_fee_configs (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  fee_type TEXT NOT NULL CHECK (fee_type IN ('percentage', 'fixed')),
  fee_value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  effective_from BIGINT NOT NULL,
  effective_until BIGINT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crypto_fee_configs_current
  ON crypto_fee_configs(organization_id, fee_type)
  WHERE status = 'active' AND effective_until IS NULL;

-- The Quote Engine's authoritative record. Once status moves past
-- ACTIVE, every financial field here is immutable — a new market rate
-- creates a NEW quote row, never rewrites this one.
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  base_currency TEXT NOT NULL,
  base_amount_minor_units BIGINT NOT NULL CHECK (base_amount_minor_units > 0),
  asset TEXT NOT NULL,
  network TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  exchange_rate_id TEXT NOT NULL REFERENCES crypto_exchange_rates(id),
  rate_snapshot TEXT NOT NULL,
  rate_type_snapshot TEXT NOT NULL,
  fee_config_id TEXT REFERENCES crypto_fee_configs(id),
  fee_snapshot TEXT NOT NULL,
  gross_atomic_amount TEXT NOT NULL,
  net_atomic_amount TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'LOCKED', 'EXPIRED', 'REJECTED', 'CONSUMED')),
  reject_reason TEXT,
  payment_intent_id TEXT REFERENCES payment_intents(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  locked_at BIGINT,
  consumed_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_quotes_organization ON quotes(organization_id);
CREATE INDEX IF NOT EXISTS idx_quotes_payment_intent ON quotes(payment_intent_id);
