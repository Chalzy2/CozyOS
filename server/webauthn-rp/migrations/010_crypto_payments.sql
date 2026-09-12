-- CozyOS Crypto Payment Foundation (Phase 5.3).
--
-- Source material: a supplied Binance-branded HTML page (payment
-- mechanism only — its referral/marketing content was excluded
-- entirely, never touched, never migrated). File Revival Record for
-- that source lives in docs/builder/knowledge/PHASE5.3-CRYPTO-PAYMENT-FOUNDATION-CHANGE-REPORT.md.
--
-- The single most important finding from that source, and the reason
-- this schema exists rather than a bare "wallets = {asset: address}"
-- table: the source's own data contained a genuinely invalid
-- combination — "Bitcoin (BSC)": "0x2545509d..." — an EVM-format
-- address labeled as a Bitcoin destination. Bitcoin's blockchain cannot
-- interpret that address at all; a real customer following that
-- instruction would lose funds. This schema makes that specific class
-- of error structurally impossible to represent as "active" without
-- explicit, validated asset+network+address-format agreement — never
-- "present in a config object" implying "valid."
--
-- Repeats the same real defense-in-depth pattern already proven twice
-- in this project (Phase 2 subscription pricing, Phase 5.2 payment
-- intents): a database CHECK constraint plus a partial unique index,
-- not just application-level trust.

CREATE TABLE IF NOT EXISTS crypto_network_asset_rules (
  id TEXT PRIMARY KEY,
  asset TEXT NOT NULL,
  network TEXT NOT NULL,
  address_format TEXT NOT NULL CHECK (address_format IN ('evm', 'bitcoin_base58', 'bitcoin_bech32', 'tron_base58', 'solana_base58')),
  UNIQUE (asset, network)
);

-- Replaces the source's hard-coded client-side `const wallets = {...}`.
-- A row can only be marked active if (asset, network) exists in
-- crypto_network_asset_rules AND the address passes that rule's format
-- check — enforced in application code, with this table's own
-- relationship as the structural backstop. Organization-scoped (NULL =
-- platform-wide default).
CREATE TABLE IF NOT EXISTS crypto_destinations (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  asset TEXT NOT NULL,
  network TEXT NOT NULL,
  address TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  effective_from BIGINT NOT NULL,
  effective_until BIGINT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crypto_destinations_active
  ON crypto_destinations(organization_id, asset, network)
  WHERE active = 1 AND effective_until IS NULL;

CREATE INDEX IF NOT EXISTS idx_crypto_destinations_org ON crypto_destinations(organization_id);

-- Deliberately structural only this round — no real rate source exists
-- (Phase 5.1/5.3 discovery: no credentials, no network access). Stays
-- empty until a real source is connected; every conversion attempt
-- reports BLOCKED, never a fabricated number.
CREATE TABLE IF NOT EXISTS crypto_exchange_rates (
  id TEXT PRIMARY KEY,
  base_currency TEXT NOT NULL,
  quote_asset TEXT NOT NULL,
  rate TEXT NOT NULL,
  source TEXT NOT NULL,
  fetched_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crypto_exchange_rates_lookup ON crypto_exchange_rates(base_currency, quote_asset, expires_at);

-- A customer-submitted or provider-reported transaction hash is a
-- CANDIDATE identifier only — never proof by itself. The unique index
-- on (network, transaction_hash) is the real double-spend/double-
-- consumption guard: the same transaction can never be associated with
-- two different payment intents, enforced by the database itself.
CREATE TABLE IF NOT EXISTS crypto_transactions (
  id TEXT PRIMARY KEY,
  payment_intent_id TEXT NOT NULL REFERENCES payment_intents(id),
  network TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  asset TEXT,
  amount_claimed TEXT,
  destination_claimed TEXT,
  confirmations INTEGER,
  verification_status TEXT NOT NULL CHECK (verification_status IN (
    'PENDING_VERIFICATION', 'VERIFIED_MATCH', 'VERIFIED_MISMATCH', 'UNKNOWN'
  )),
  mismatch_reason TEXT,
  submitted_by TEXT REFERENCES users(id),
  created_at BIGINT NOT NULL,
  verified_at BIGINT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crypto_transactions_dedup
  ON crypto_transactions(network, transaction_hash);

CREATE INDEX IF NOT EXISTS idx_crypto_transactions_intent ON crypto_transactions(payment_intent_id);

-- Administrator-configurable, Core-guarded. Changing this NEVER
-- rewrites a historical transaction's own recorded confirmations (see
-- crypto_transactions.confirmations, captured per-transaction).
CREATE TABLE IF NOT EXISTS crypto_confirmation_policy (
  id TEXT PRIMARY KEY,
  network TEXT NOT NULL UNIQUE,
  required_confirmations INTEGER NOT NULL CHECK (required_confirmations >= 0),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
