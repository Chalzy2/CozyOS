-- CozyOS Payment Provider Integration Foundation (Phase 5.2).
--
-- Two real, minimal additions this round, both dependencies genuinely
-- required before any real provider can be certified — not built merely
-- because they sound useful:
--
-- 1. payment_provider_configs — administrator-controlled provider
--    configuration (enabled/disabled, supported currencies/methods,
--    routing priority, limits, environment). Deliberately stores
--    `credential_ref` — a reference to WHERE a real credential lives
--    (an environment variable name, e.g. "COZY_MPESA_CONSUMER_KEY"),
--    never the credential value itself. This extends the existing
--    process.env.COZY_* server convention (see server/webauthn-rp/
--    providers/credential-resolver.js) rather than building a second
--    secret-management system — Phase 5.1 discovery found the
--    client-side Vault engine is real but browser-only, not reusable
--    here.
--
-- 2. payment_webhook_events — append-only, real duplicate-event
--    detection via a database-enforced unique index on
--    (provider_id, provider_event_id), mirroring payment_intents'
--    own idempotency-key pattern. This is the real defense against
--    "duplicate webhook processing" Phase 5.2 asks for — not just an
--    application-level check.

CREATE TABLE IF NOT EXISTS payment_provider_configs (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 0,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  supported_currencies TEXT NOT NULL,
  supported_payment_methods TEXT NOT NULL,
  routing_priority INTEGER NOT NULL DEFAULT 100,
  min_amount_minor_units BIGINT,
  max_amount_minor_units BIGINT,
  credential_ref TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  provider_event_id TEXT,
  payment_intent_id TEXT REFERENCES payment_intents(id),
  verified INTEGER NOT NULL,
  canonical_status TEXT,
  amount_matched INTEGER,
  currency_matched INTEGER,
  outcome TEXT NOT NULL CHECK (outcome IN (
    'applied', 'rejected_unverified', 'rejected_unknown_payment',
    'rejected_amount_mismatch', 'rejected_currency_mismatch',
    'duplicate_ignored', 'held_unknown_status'
  )),
  created_at BIGINT NOT NULL
);

-- The real duplicate-webhook guard: a database-enforced unique index,
-- not just application logic. Only enforced when the provider actually
-- supplies its own event id (some providers may not) — a NULL
-- provider_event_id never collides with another NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_webhook_events_dedup
  ON payment_webhook_events(provider_id, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_intent ON payment_webhook_events(payment_intent_id);
