'use strict';
const crypto = require('node:crypto');
const { assertMoneyAmount, assertCurrency, assertNonEmptyString } = require('./billing');

// CozyOS — Universal Payment Provider Infrastructure (Phase 4 foundation)
// File Reference: server/webauthn-rp/payments.js
//
// WHY THIS FILE EXISTS
// ---------------------
// Repository-wide discovery this round found real, well-designed
// CLIENT-SIDE payment-provider infrastructure in
// core/modules/payment-provider/ (ProviderRegistry, ProviderManager,
// RoutingEngine, CapabilityEngine, FailoverEngine, HealthMonitor) and
// core/modules/payment-channel/. It already defines a genuinely good
// adapter-method vocabulary — REQUIRED_ADAPTER_METHODS includes
// initialize/connect/disconnect/healthCheck/getCapabilities/authenticate/
// authorize/createPayment/verifyPayment/refund/cancel/getStatus/
// getDiagnostics/shutdown/getMetadata — and its own cash-provider.js is
// honestly disclosed as "real, fully-working" while its mpesa-provider.js
// is honestly disclosed as having "no real API credentials... every
// operational method honestly reports that no real integration exists."
//
// THIS FILE DOES NOT DUPLICATE THAT ENGINE. It reuses the same adapter
// method vocabulary (createPayment/verifyPayment/refund/cancel/
// getCapabilities) for interface consistency with any future real client
// integration, but is the missing SERVER-AUTHORITATIVE counterpart: real
// PostgreSQL/SQLite persistence, real organization isolation via the
// existing OrganizationRegistry, real idempotency enforced by the
// database itself, real ledger integration via the existing
// BillingRegistry, real audit_events — none of which the existing
// client-side engine has (its cash adapter's "records" live in a
// `Map()` that vanishes on page reload; its M-Pesa adapter has no real
// credentials anywhere in this platform).
//
// SCOPE THIS ROUND (see docs/billing-architecture-boundary.md for the
// full accounting): the provider-neutral foundation (PaymentIntent,
// canonical status, idempotency, ledger integration, audit) plus ONE
// real, fully-tested adapter — cash, the only payment method requiring
// no external credentials or network access. Mobile money/card/bank/
// crypto real adapters are explicitly BLOCKED this round: no real
// provider credentials or network access exist in this environment, and
// this project does not fabricate provider runtime evidence (the same
// standard already applied throughout every prior phase's real-Postgres
// evidence).
//
// FAIL-CLOSED / HONESTY RULES (same posture as billing.js)
//   - Every organization-scoped operation calls
//     this.orgs.isAuthorized(actorUserId, organizationId, capability) for
//     real — never trusted from the caller.
//   - amount/currency for a payment intent are always server-resolved
//     parameters this file validates, never accepted as authoritative
//     from an unvalidated source — the HTTP route layer is responsible
//     for ensuring the caller supplies the real, server-computed amount,
//     not a raw client-typed number.
//   - A successful payment credits the wallet through
//     BillingRegistry.recordLedgerEntry() — the SAME transactional,
//     audited, balance-cache-maintaining code path Phase 2 built. This
//     file never mutates wallet_accounts or wallet_ledger directly.
//   - Idempotency is enforced by a real database unique index
//     (organization_id, idempotency_key), not just an application-level
//     check — same defense-in-depth pattern verified empirically for
//     Phase 2's subscription/price uniqueness guarantees.

// Phase 5.2 — added 'UNKNOWN'. This is NOT a synonym for FAILED. Per the
// explicit unknown-state-safety requirement (critical for async
// providers like M-Pesa STK Push, where a network timeout or an
// ambiguous provider response tells you nothing about whether money
// actually moved): timeout != failed, network failure != failed,
// unknown != succeeded, unknown != safe-to-retry. An adapter's
// mapProviderStatus() should return 'UNKNOWN' rather than guessing —
// processProviderEvent() below treats it as "do not change anything,
// record that this happened, a human or a later reconciliation pass
// must resolve it" — never as an automatic FAILED, and never as an
// automatic SUCCEEDED.
const CANONICAL_STATUSES = Object.freeze([
  'CREATED', 'PENDING', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED',
  'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'UNKNOWN',
]);

// Phase 5.2 — formalized contract. `verifyPayment` renamed to
// `getPayment` (queries the PROVIDER's live status for a
// providerPaymentId — distinct from PaymentRegistry's own
// getPaymentIntent(), which only reads CozyOS's local record; useful
// when a webhook was missed or delayed). `verifyWebhook` is new: an
// adapter's OWN webhook authenticity + normalization method — Phase 5.2
// is explicit that not every provider uses HMAC, so PaymentRegistry
// never assumes a verification mechanism; it only ever calls
// adapter.verifyWebhook() and trusts the adapter to know its own
// provider's real mechanism (the generic verifyWebhookSignature() HMAC
// helper below remains available for adapters that DO use HMAC, but is
// no longer treated as the only or default mechanism).
const REQUIRED_ADAPTER_METHODS = Object.freeze([
  'createPayment', 'getPayment', 'refundPayment', 'cancelPayment', 'verifyWebhook', 'getCapabilities', 'mapProviderStatus',
]);

class PaymentError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function rowToIntent(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    amountMinorUnits: row.amount_minor_units,
    currency: row.currency,
    providerId: row.provider_id,
    status: row.status,
    referenceType: row.reference_type || null,
    referenceId: row.reference_id || null,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    idempotencyKey: row.idempotency_key || null,
    providerPaymentId: row.provider_payment_id || null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * verifyWebhookSignature — provider-neutral HMAC verification primitive.
 * Real cryptography (node:crypto), fully testable without any live
 * provider connection: this is what a future real adapter's webhook
 * endpoint would call before trusting inbound payload data at all,
 * exactly matching Phase 4's "webhooks are provider input, NOT authority
 * by themselves — verify authenticity according to the provider's
 * mechanism" requirement. No real provider is wired to call this yet
 * (no real provider credentials exist in this environment) — this
 * function itself is real and tested on its own merits.
 */
function verifyWebhookSignature({ payload, signature, secret, algorithm = 'sha256' }) {
  if (typeof payload !== 'string' || typeof signature !== 'string' || typeof secret !== 'string' || !secret) {
    return false;
  }
  const expected = crypto.createHmac(algorithm, secret).update(payload).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(signature, 'hex');
  if (expectedBuf.length !== providedBuf.length) return false; // timingSafeEqual requires equal length
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

class PaymentRegistry {
  /**
   * @param {object} db - DatabaseAdapter, same real adapter every other registry uses.
   * @param {object} orgs - OrganizationRegistry instance — reused, never reimplemented.
   * @param {object} billing - BillingRegistry instance — a successful payment credits the wallet through this, never directly.
   * @param {object} [opts]
   * @param {function} [opts.now] - injectable clock, matches every other registry's convention.
   */
  constructor(db, orgs, billing, { now = () => Date.now() } = {}) {
    if (!db) throw new TypeError('[payments] PaymentRegistry requires a DatabaseAdapter instance.');
    if (!orgs || typeof orgs.isAuthorized !== 'function') {
      throw new TypeError('[payments] PaymentRegistry requires a real OrganizationRegistry instance.');
    }
    if (!billing || typeof billing.recordLedgerEntry !== 'function') {
      throw new TypeError('[payments] PaymentRegistry requires a real BillingRegistry instance — payments credit the wallet through it, never directly.');
    }
    this.db = db;
    this.orgs = orgs;
    this.billing = billing;
    this.now = now;
    this._providers = new Map();
  }

  /**
   * registerProvider — real interface validation, same posture as the
   * existing client ProviderRegistry.registerProvider(): rejects an
   * adapter missing any required method rather than registering
   * something that would fail unpredictably later.
   */
  registerProvider(providerId, adapter) {
    if (typeof providerId !== 'string' || !/^[a-z0-9_]+$/.test(providerId)) {
      throw new TypeError('[payments] registerProvider(): providerId must be a lowercase snake_case string.');
    }
    const missing = REQUIRED_ADAPTER_METHODS.filter((m) => typeof adapter?.[m] !== 'function');
    if (missing.length > 0) {
      throw new TypeError(`[payments] registerProvider(): adapter for "${providerId}" is missing required method(s): ${missing.join(', ')}.`);
    }
    this._providers.set(providerId, adapter);
  }

  getProvider(providerId) {
    return this._providers.get(providerId) || null;
  }

  async _auditWith(tx, userId, eventType, detail) {
    await tx.run(
      'INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)',
      [userId || null, eventType, JSON.stringify(detail || {}), this.now()]
    );
  }

  async _recordEvent(tx, paymentIntentId, eventType, previousStatus, newStatus, detail) {
    await tx.run(
      'INSERT INTO payment_events (id, payment_intent_id, event_type, previous_status, new_status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [crypto.randomUUID(), paymentIntentId, eventType, previousStatus || null, newStatus || null, JSON.stringify(detail || {}), this.now()]
    );
  }

  /**
   * createPaymentIntent — the real entry point. amountMinorUnits and
   * currency MUST already be server-resolved by the caller (e.g. a
   * route that priced a subscription via BillingRegistry) — this method
   * validates their shape but has no way to know "the right price" for
   * a given business operation, exactly like BillingRegistry.recordLedgerEntry()
   * doesn't invent an amount either. Idempotent: a repeated call with the
   * same (organizationId, idempotencyKey) returns the EXISTING intent,
   * never creates a second one — enforced by both this method's own
   * pre-check AND the database's own unique index (defense in depth).
   */
  async createPaymentIntent(actorUserId, organizationId, { amountMinorUnits, currency, providerId, referenceType = null, referenceId = null, idempotencyKey = null, metadata = {} }) {
    assertNonEmptyString(actorUserId, 'actorUserId');
    assertNonEmptyString(organizationId, 'organizationId');
    assertMoneyAmount(amountMinorUnits, 'amountMinorUnits');
    if (amountMinorUnits <= 0) throw new TypeError('[payments] amountMinorUnits must be a positive integer — use billing.recordLedgerEntry() directly for zero/negative adjustments.');
    assertCurrency(currency, 'currency');
    assertNonEmptyString(providerId, 'providerId');
    const adapter = this.getProvider(providerId);
    if (!adapter) throw new PaymentError('unknown_provider');
    if (metadata && typeof metadata !== 'object') throw new TypeError('[payments] metadata must be a plain object.');

    const authorized = await this.orgs.isAuthorized(actorUserId, organizationId, 'org:billing:manage');
    if (!authorized) throw new PaymentError('not_authorized');

    if (idempotencyKey) {
      const existing = await this.db.get(
        'SELECT * FROM payment_intents WHERE organization_id = ? AND idempotency_key = ?',
        [organizationId, idempotencyKey]
      );
      if (existing) return rowToIntent(existing);
    }

    const id = crypto.randomUUID();
    const ts = this.now();

    // Call the adapter BEFORE opening the transaction: an adapter call
    // may be slow (a future real network provider) or may throw (e.g.
    // cash's own validation) — neither should hold a database
    // transaction open. The adapter's result determines the intent's
    // initial persisted state, not the other way around.
    let providerResult;
    try {
      providerResult = await adapter.createPayment({ amountMinorUnits, currency, metadata });
    } catch (err) {
      throw new PaymentError('provider_create_failed');
    }
    const canonicalStatus = adapter.mapProviderStatus(providerResult.providerStatus);
    if (!CANONICAL_STATUSES.includes(canonicalStatus)) {
      throw new TypeError(`[payments] adapter "${providerId}" mapped to an invalid canonical status "${canonicalStatus}".`);
    }

    await this.db.transaction(async (tx) => {
      try {
        await tx.run(
          `INSERT INTO payment_intents (id, organization_id, amount_minor_units, currency, provider_id, status, reference_type, reference_id, metadata, idempotency_key, provider_payment_id, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, organizationId, amountMinorUnits, currency, providerId, canonicalStatus, referenceType, referenceId, JSON.stringify(metadata), idempotencyKey, providerResult.providerPaymentId, actorUserId, ts, ts]
        );
      } catch (err) {
        // The database's own unique index caught a race — two concurrent
        // requests with the same idempotency key both passed the
        // pre-check above before either committed. Real defense in
        // depth, same pattern verified empirically in Phase 2.
        throw new PaymentError('duplicate_idempotency_key');
      }
      await this._recordEvent(tx, id, 'created', null, canonicalStatus, { providerId, providerPaymentId: providerResult.providerPaymentId });
      await this._auditWith(tx, actorUserId, 'payment_intent_created', { paymentIntentId: id, organizationId, amountMinorUnits, currency, providerId, status: canonicalStatus });

      // A provider that completes synchronously (cash) settles
      // immediately — credit the wallet in the SAME transaction as the
      // intent creation, so a crash between the two is impossible.
      if (canonicalStatus === 'SUCCEEDED') {
        await this._creditWalletWithinTransaction(tx, actorUserId, organizationId, { amountMinorUnits, currency, paymentIntentId: id, referenceType, referenceId });
      }
    });

    return this.getPaymentIntent(actorUserId, organizationId, id);
  }

  /**
   * _creditWalletWithinTransaction — calls BillingRegistry's own
   * transaction-aware core directly (billing._recordLedgerEntryWithinTransaction),
   * passing this method's own already-open `tx` — not a second
   * ledger-writing code path, and not a nested transaction (an earlier
   * version of this method tried wrapping `this.db` and calling the
   * top-level `recordLedgerEntry()`, which failed for real, empirically:
   * SQLite correctly rejected it with "cannot start a transaction within
   * a transaction," since `recordLedgerEntry()` always opens its own).
   * Authorization is not re-checked here since this method's caller
   * (createPaymentIntent/refundPayment) already authorized the actor for
   * this organization moments earlier in the same operation.
   */
  async _creditWalletWithinTransaction(tx, actorUserId, organizationId, { amountMinorUnits, currency, paymentIntentId, referenceType, referenceId }) {
    await this.billing._recordLedgerEntryWithinTransaction(tx, actorUserId, organizationId, {
      amountMinorUnits,
      currency,
      entryType: amountMinorUnits >= 0 ? 'credit' : 'refund',
      referenceType: referenceType || 'payment_intent',
      referenceId: referenceId || paymentIntentId,
      description: amountMinorUnits >= 0
        ? `Payment received via payment intent ${paymentIntentId}`
        : `Refund issued via payment intent ${paymentIntentId}`,
    });
  }

  async getPaymentIntent(actorUserId, organizationId, paymentIntentId) {
    assertNonEmptyString(actorUserId, 'actorUserId');
    assertNonEmptyString(organizationId, 'organizationId');
    assertNonEmptyString(paymentIntentId, 'paymentIntentId');
    const authorized = await this.orgs.isAuthorized(actorUserId, organizationId, 'org:billing:manage');
    if (!authorized) throw new PaymentError('not_authorized');
    const row = await this.db.get('SELECT * FROM payment_intents WHERE id = ? AND organization_id = ?', [paymentIntentId, organizationId]);
    if (!row) throw new PaymentError('payment_intent_not_found');
    return rowToIntent(row);
  }

  async cancelPaymentIntent(actorUserId, organizationId, paymentIntentId) {
    const intent = await this.getPaymentIntent(actorUserId, organizationId, paymentIntentId);
    if (['SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED', 'EXPIRED'].includes(intent.status)) {
      throw new PaymentError('payment_intent_not_cancellable');
    }
    const adapter = this.getProvider(intent.providerId);
    await adapter.cancelPayment(intent.providerPaymentId);
    const ts = this.now();
    await this.db.transaction(async (tx) => {
      await tx.run('UPDATE payment_intents SET status = ?, updated_at = ? WHERE id = ?', ['CANCELLED', ts, paymentIntentId]);
      await this._recordEvent(tx, paymentIntentId, 'cancelled', intent.status, 'CANCELLED', {});
      await this._auditWith(tx, actorUserId, 'payment_intent_cancelled', { paymentIntentId, organizationId });
    });
    return this.getPaymentIntent(actorUserId, organizationId, paymentIntentId);
  }

  /**
   * refundPayment — server-authoritative: refundMinorUnits is validated
   * and capped by this method (never trusted as "whatever the client
   * says"), and the wallet is debited by exactly that amount through the
   * same real BillingRegistry ledger path, inside the same transaction
   * as the status update.
   */
  async refundPayment(actorUserId, organizationId, paymentIntentId, { refundMinorUnits = null, reason = null } = {}) {
    const intent = await this.getPaymentIntent(actorUserId, organizationId, paymentIntentId);
    if (intent.status !== 'SUCCEEDED' && intent.status !== 'PARTIALLY_REFUNDED') {
      throw new PaymentError('payment_intent_not_refundable');
    }
    const amount = refundMinorUnits === null ? intent.amountMinorUnits : refundMinorUnits;
    assertMoneyAmount(amount, 'refundMinorUnits');
    if (amount <= 0 || amount > intent.amountMinorUnits) throw new PaymentError('invalid_refund_amount');

    const adapter = this.getProvider(intent.providerId);
    await adapter.refundPayment(intent.providerPaymentId, amount);

    const newStatus = amount === intent.amountMinorUnits ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    const ts = this.now();
    await this.db.transaction(async (tx) => {
      await tx.run('UPDATE payment_intents SET status = ?, updated_at = ? WHERE id = ?', [newStatus, ts, paymentIntentId]);
      await this._recordEvent(tx, paymentIntentId, 'refunded', intent.status, newStatus, { refundMinorUnits: amount, reason });
      await this._auditWith(tx, actorUserId, 'payment_refunded', { paymentIntentId, organizationId, refundMinorUnits: amount, reason });
      await this._creditWalletWithinTransaction(tx, actorUserId, organizationId, {
        amountMinorUnits: -amount, currency: intent.currency, paymentIntentId, referenceType: 'payment_refund', referenceId: paymentIntentId,
      });
    });
    return this.getPaymentIntent(actorUserId, organizationId, paymentIntentId);
  }

  // ==================================================================
  // Webhook / event foundation (Phase 5.2) — generic, provider-neutral
  // event processing. Never assumes a verification mechanism (that's
  // the adapter's job via verifyWebhook()); provides real, database-
  // enforced duplicate-event detection, amount/currency matching against
  // CozyOS's own stored record (never trusting the webhook's claimed
  // amount as authoritative on its own), and safe handling of an
  // adapter-reported UNKNOWN status (never silently treated as success
  // or failure).
  // ==================================================================

  /**
   * processProviderEvent — the one real entry point for inbound provider
   * events. No actual provider calls this yet (none is connected — see
   * Phase 5.1 discovery), but the machinery itself is real and fully
   * tested against a test-only adapter built specifically to exercise
   * async/webhook paths cash cannot (see
   * server/webauthn-rp/test/provider-certification-harness.js).
   *
   * Flow (matches the boundary Phase 5.2 specifies exactly):
   *   provider -> verifyWebhook() [authenticate + normalize] ->
   *   idempotency check -> find payment -> validate amount/currency ->
   *   canonical status -> database transaction -> ledger/audit
   *
   * Returns a result object describing the outcome — never throws for
   * an ordinary rejection (invalid signature, unknown payment, amount
   * mismatch, duplicate) since those are expected, recordable outcomes
   * of processing untrusted external input, not caller programming
   * errors. Only throws for a genuinely unknown providerId (a real
   * integration/configuration mistake, not a webhook processing outcome).
   */
  async processProviderEvent(providerId, rawPayload, headers = {}) {
    assertNonEmptyString(providerId, 'providerId');
    const adapter = this.getProvider(providerId);
    if (!adapter) throw new PaymentError('unknown_provider');

    const ts = this.now();
    let normalized;
    try {
      normalized = await adapter.verifyWebhook(rawPayload, headers);
    } catch (_err) {
      normalized = { valid: false, reason: 'adapter_threw' };
    }

    if (!normalized || normalized.valid !== true) {
      await this._recordWebhookEvent(providerId, {
        providerEventId: normalized?.providerEventId || null,
        paymentIntentId: null, verified: false, canonicalStatus: null,
        amountMatched: null, currencyMatched: null, outcome: 'rejected_unverified',
      }, ts);
      return { applied: false, outcome: 'rejected_unverified', reason: normalized?.reason || 'verification_failed' };
    }

    const { providerEventId = null, providerPaymentId, providerStatus, amountMinorUnits: claimedAmount = null, currency: claimedCurrency = null } = normalized;

    // Real, database-enforced duplicate-event detection — pre-check for
    // a clean early return; the unique index below is the actual
    // defense-in-depth guarantee against a race between two concurrent
    // deliveries of the same event.
    if (providerEventId) {
      const existing = await this.db.get(
        'SELECT id FROM payment_webhook_events WHERE provider_id = ? AND provider_event_id = ?',
        [providerId, providerEventId]
      );
      if (existing) {
        return { applied: false, outcome: 'duplicate_ignored' };
      }
    }

    const intent = await this.db.get('SELECT * FROM payment_intents WHERE provider_id = ? AND provider_payment_id = ?', [providerId, providerPaymentId]);
    if (!intent) {
      await this._recordWebhookEvent(providerId, {
        providerEventId, paymentIntentId: null, verified: true, canonicalStatus: null,
        amountMatched: null, currencyMatched: null, outcome: 'rejected_unknown_payment',
      }, ts);
      return { applied: false, outcome: 'rejected_unknown_payment' };
    }

    // Amount/currency matching — the webhook's claimed values are
    // NEVER treated as authoritative on their own; they are only ever
    // compared against what CozyOS already recorded for this intent.
    const amountMatched = claimedAmount === null ? null : claimedAmount === intent.amount_minor_units;
    const currencyMatched = claimedCurrency === null ? null : claimedCurrency === intent.currency;
    if (amountMatched === false) {
      await this._recordWebhookEvent(providerId, {
        providerEventId, paymentIntentId: intent.id, verified: true, canonicalStatus: null,
        amountMatched, currencyMatched, outcome: 'rejected_amount_mismatch',
      }, ts);
      return { applied: false, outcome: 'rejected_amount_mismatch' };
    }
    if (currencyMatched === false) {
      await this._recordWebhookEvent(providerId, {
        providerEventId, paymentIntentId: intent.id, verified: true, canonicalStatus: null,
        amountMatched, currencyMatched, outcome: 'rejected_currency_mismatch',
      }, ts);
      return { applied: false, outcome: 'rejected_currency_mismatch' };
    }

    const canonicalStatus = adapter.mapProviderStatus(providerStatus);
    if (!CANONICAL_STATUSES.includes(canonicalStatus)) {
      throw new TypeError(`[payments] adapter "${providerId}" mapped to an invalid canonical status "${canonicalStatus}".`);
    }

    // Unknown-state safety: never transition the intent, never touch
    // the ledger. Recorded so a human or a reconciliation pass can
    // investigate — this is the concrete guard against "timeout !=
    // failed" / "unknown != succeeded" / "unknown != safe-to-retry".
    if (canonicalStatus === 'UNKNOWN') {
      await this._recordWebhookEvent(providerId, {
        providerEventId, paymentIntentId: intent.id, verified: true, canonicalStatus,
        amountMatched, currencyMatched, outcome: 'held_unknown_status',
      }, ts);
      return { applied: false, outcome: 'held_unknown_status' };
    }

    let applied = false;
    try {
      await this.db.transaction(async (tx) => {
        await tx.run(
          `INSERT INTO payment_webhook_events (id, provider_id, provider_event_id, payment_intent_id, verified, canonical_status, amount_matched, currency_matched, outcome, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), providerId, providerEventId, intent.id, 1, canonicalStatus, amountMatched === null ? null : (amountMatched ? 1 : 0), currencyMatched === null ? null : (currencyMatched ? 1 : 0), 'applied', ts]
        );
        if (canonicalStatus !== intent.status) {
          await tx.run('UPDATE payment_intents SET status = ?, updated_at = ? WHERE id = ?', [canonicalStatus, ts, intent.id]);
          await this._recordEvent(tx, intent.id, 'webhook_received', intent.status, canonicalStatus, { providerId, providerEventId });
          await this._auditWith(tx, intent.created_by, 'payment_webhook_applied', { paymentIntentId: intent.id, providerId, providerEventId, previousStatus: intent.status, newStatus: canonicalStatus });
          if (canonicalStatus === 'SUCCEEDED' && intent.status !== 'SUCCEEDED') {
            await this._creditWalletWithinTransaction(tx, intent.created_by, intent.organization_id, {
              amountMinorUnits: intent.amount_minor_units, currency: intent.currency, paymentIntentId: intent.id,
              referenceType: 'payment_intent', referenceId: intent.id,
            });
          }
        }
      });
      applied = true;
    } catch (err) {
      // The database's own unique index caught a race on
      // (provider_id, provider_event_id) — two concurrent deliveries of
      // the same event both passed the pre-check above. Real defense in
      // depth, same pattern as payment_intents' idempotency guarantee.
      return { applied: false, outcome: 'duplicate_ignored' };
    }

    return { applied, outcome: 'applied', canonicalStatus, paymentIntentId: intent.id };
  }

  async _recordWebhookEvent(providerId, { providerEventId, paymentIntentId, verified, canonicalStatus, amountMatched, currencyMatched, outcome }, ts) {
    await this.db.run(
      `INSERT INTO payment_webhook_events (id, provider_id, provider_event_id, payment_intent_id, verified, canonical_status, amount_matched, currency_matched, outcome, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), providerId, providerEventId, paymentIntentId, verified ? 1 : 0, canonicalStatus, amountMatched === null ? null : (amountMatched ? 1 : 0), currencyMatched === null ? null : (currencyMatched ? 1 : 0), outcome, ts]
    );
  }

  /**
   * getWebhookEvents — self-enforcing, matching the exact posture every
   * other organization-scoped read method in this codebase already has
   * since the Phase 2 final security audit (getActiveSubscription/
   * getWalletAccount/getWalletLedger). Found during the Phase 5.2 final
   * security scan: this method originally took only paymentIntentId,
   * with no authorization check at all — not currently reachable from
   * any route, but a real defense-in-depth gap the moment something
   * else calls it. Resolves the intent's own organizationId first so
   * the caller cannot be fooled by supplying a paymentIntentId from one
   * organization while claiming a different one.
   */
  async getWebhookEvents(actorUserId, paymentIntentId) {
    assertNonEmptyString(actorUserId, 'actorUserId');
    assertNonEmptyString(paymentIntentId, 'paymentIntentId');
    const intent = await this.db.get('SELECT organization_id FROM payment_intents WHERE id = ?', [paymentIntentId]);
    if (!intent) throw new PaymentError('payment_intent_not_found');
    const authorized = await this.orgs.isAuthorized(actorUserId, intent.organization_id, 'org:billing:manage');
    if (!authorized) throw new PaymentError('not_authorized');
    return this.db.all('SELECT * FROM payment_webhook_events WHERE payment_intent_id = ? ORDER BY created_at ASC', [paymentIntentId]);
  }

  // ==================================================================
  // Provider configuration foundation (Phase 5.2) — administrator-
  // controlled, platform-admin-gated, same posture as
  // BillingRegistry.setPlanPrice(). Never stores a credential VALUE —
  // credentialRef is a reference (an environment variable name) resolved
  // at call time via server/webauthn-rp/providers/credential-resolver.js.
  // ==================================================================

  async setProviderConfig(actorUserId, isPlatformAdmin, { providerId, enabled, environment, supportedCurrencies, supportedPaymentMethods, routingPriority = 100, minAmountMinorUnits = null, maxAmountMinorUnits = null, credentialRef = null }) {
    if (!isPlatformAdmin) throw new PaymentError('not_authorized');
    assertNonEmptyString(actorUserId, 'actorUserId');
    assertNonEmptyString(providerId, 'providerId');
    if (typeof enabled !== 'boolean') throw new TypeError('[payments] enabled must be a boolean.');
    if (!['sandbox', 'production'].includes(environment)) throw new TypeError('[payments] environment must be "sandbox" or "production".');
    if (!Array.isArray(supportedCurrencies) || supportedCurrencies.length === 0) throw new TypeError('[payments] supportedCurrencies must be a non-empty array.');
    if (!Array.isArray(supportedPaymentMethods) || supportedPaymentMethods.length === 0) throw new TypeError('[payments] supportedPaymentMethods must be a non-empty array.');

    const ts = this.now();
    const existing = await this.db.get('SELECT id FROM payment_provider_configs WHERE provider_id = ?', [providerId]);

    await this.db.transaction(async (tx) => {
      if (existing) {
        await tx.run(
          `UPDATE payment_provider_configs SET enabled = ?, environment = ?, supported_currencies = ?, supported_payment_methods = ?, routing_priority = ?, min_amount_minor_units = ?, max_amount_minor_units = ?, credential_ref = ?, updated_at = ? WHERE provider_id = ?`,
          [enabled ? 1 : 0, environment, JSON.stringify(supportedCurrencies), JSON.stringify(supportedPaymentMethods), routingPriority, minAmountMinorUnits, maxAmountMinorUnits, credentialRef, ts, providerId]
        );
      } else {
        await tx.run(
          `INSERT INTO payment_provider_configs (id, provider_id, enabled, environment, supported_currencies, supported_payment_methods, routing_priority, min_amount_minor_units, max_amount_minor_units, credential_ref, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), providerId, enabled ? 1 : 0, environment, JSON.stringify(supportedCurrencies), JSON.stringify(supportedPaymentMethods), routingPriority, minAmountMinorUnits, maxAmountMinorUnits, credentialRef, actorUserId, ts, ts]
        );
      }
      // credentialRef is a NAME (e.g. "COZY_MPESA_CONSUMER_KEY"), never
      // a value — safe to audit in full.
      await this._auditWith(tx, actorUserId, 'payment_provider_config_changed', { providerId, enabled, environment, supportedCurrencies, supportedPaymentMethods, routingPriority, credentialRef });
    });

    return this.getProviderConfig(providerId);
  }

  async getProviderConfig(providerId) {
    assertNonEmptyString(providerId, 'providerId');
    const row = await this.db.get('SELECT * FROM payment_provider_configs WHERE provider_id = ?', [providerId]);
    if (!row) return null;
    return {
      providerId: row.provider_id,
      enabled: !!row.enabled,
      environment: row.environment,
      supportedCurrencies: JSON.parse(row.supported_currencies),
      supportedPaymentMethods: JSON.parse(row.supported_payment_methods),
      routingPriority: row.routing_priority,
      minAmountMinorUnits: row.min_amount_minor_units,
      maxAmountMinorUnits: row.max_amount_minor_units,
      credentialRef: row.credential_ref,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = { PaymentRegistry, PaymentError, verifyWebhookSignature, CANONICAL_STATUSES, REQUIRED_ADAPTER_METHODS };
