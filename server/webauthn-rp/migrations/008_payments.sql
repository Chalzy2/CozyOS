-- CozyOS Universal Payment Provider Infrastructure (Phase 4) — foundation.
--
-- Repository-wide discovery (Phase 4 Step 1, this round) found real,
-- well-designed CLIENT-SIDE payment-provider infrastructure already in
-- core/modules/payment-provider/ (ProviderRegistry, ProviderManager,
-- RoutingEngine, CapabilityEngine, FailoverEngine, HealthMonitor) and
-- core/modules/payment-channel/. It already defines a genuinely good
-- adapter-method vocabulary (createPayment/verifyPayment/refund/cancel/
-- getCapabilities/etc.) and honestly discloses that its M-Pesa adapter
-- has no real credentials and its cash adapter is real but purely
-- in-memory (a Map that vanishes on page reload, never server-persisted,
-- never touching organization isolation, ledger, or audit).
--
-- This migration does NOT duplicate that engine. It builds the missing
-- SERVER-AUTHORITATIVE counterpart — real persistence, real organization
-- isolation, real idempotency, real ledger integration via
-- BillingRegistry, real audit_events — reusing the same adapter-method
-- vocabulary for interface consistency with a future real client
-- integration, exactly as Phase 4's own "future provider" extensibility
-- goal describes.
--
-- Scope this round (see docs/billing-architecture-boundary.md for the
-- full accounting): a real, tested "cash" adapter (the only payment
-- method requiring no external credentials or network access) plus the
-- provider-neutral foundation every future real adapter will plug into.
-- Mobile money/card/bank/crypto real adapters are explicitly BLOCKED —
-- no real provider credentials or network access exist in this
-- environment, and this project does not fabricate provider runtime
-- evidence.

-- ---------- payment_intents ----------
-- The server-authoritative record of "an amount was requested to be
-- collected." amount_minor_units/currency are ALWAYS server-resolved —
-- see payments.js's createPaymentIntent(), which never accepts these
-- from request-body values for what a payment actually charges;
-- reference_type/reference_id let a payment be tied back to whatever it
-- was actually for (a subscription charge, a wallet top-up, a future
-- order), without payments.js needing to know what a "subscription" or
-- an "order" is — the same intentional decoupling BillingRegistry
-- already keeps from OrganizationRegistry.
CREATE TABLE IF NOT EXISTS payment_intents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  amount_minor_units BIGINT NOT NULL CHECK (amount_minor_units > 0),
  currency TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'CREATED', 'PENDING', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED',
    'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED'
  )),
  reference_type TEXT,
  reference_id TEXT,
  metadata TEXT,
  idempotency_key TEXT,
  provider_payment_id TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- The real idempotency guarantee: a retried request with the same
-- (organization_id, idempotency_key) pair can never create a second
-- intent — enforced by the database itself, not just application logic,
-- matching the same partial-unique-index defense-in-depth pattern
-- verified empirically for subscriptions/prices in Phase 2.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_idempotency
  ON payment_intents(organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_intents_organization ON payment_intents(organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_provider_payment_id ON payment_intents(provider_payment_id);

-- ---------- payment_events ----------
-- Append-only, same posture as wallet_ledger/audit_events — every status
-- transition and every inbound webhook is a row here, never a bare
-- mutation of payment_intents.status without a record of why. This is
-- the reconciliation foundation Phase 4 asks for when full automated
-- reconciliation is out of this round's scope: CozyOS's own event
-- history, ready to be compared against a real provider's records once
-- one is actually connected.
CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  payment_intent_id TEXT NOT NULL REFERENCES payment_intents(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created', 'status_changed', 'webhook_received', 'refunded', 'cancelled'
  )),
  previous_status TEXT,
  new_status TEXT,
  detail TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_events_intent ON payment_events(payment_intent_id);
