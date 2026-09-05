'use strict';
const crypto = require('node:crypto');

// CozyOS — Server-Authoritative Billing Registry
// File Reference: server/webauthn-rp/billing.js
//
// WHY THIS FILE EXISTS
// ---------------------
// docs/billing-architecture-boundary.md documents the intended shape and
// explicitly says no BillingRegistry existed yet. modules/billingEngine.js
// (browser, window.CozyOS.Billing) is real, useful for UI, but is pure
// client-side IndexedDB state with no server backing — core/storage.js's
// own "Cloud Sync" is a placeholder (confirmed: no fetch/XMLHttpRequest
// anywhere in that file), so nothing in the client engine has ever been
// server-verified. This file is the real authority financial decisions
// must actually be checked against, following rp.js's and
// organizations.js's exact conventions: a class wrapping `db`, an
// injectable `now()` for tests, and audit writes into the SAME
// audit_events table both of those files already use — never a second
// audit system.
//
// WHAT THIS FILE DOES NOT OWN (Zero Duplication Rule)
//   - Identity/session resolution: owned by rp.js (RelyingParty). This
//     file only ever receives an already-resolved userId, exactly like
//     organizations.js.
//   - Organization membership/roles/authorization: owned by
//     OrganizationRegistry. This file takes an OrganizationRegistry
//     instance in its constructor and calls isAuthorized() — it never
//     reimplements organization membership or role logic.
//   - Client-side entitlement merging (plan + admin override -> UI
//     decision): owned by core/modules/entitlement/entitlement-engine.js,
//     which is explicitly preserved. A future integration point should
//     have that engine's plan layer read from this registry's real state
//     (e.g. via a server API response) instead of the client-only
//     BillingEngine — that wiring is intentionally NOT done in this
//     round; see the architecture doc update for exactly what remains.
//   - Legacy client concepts revived here, not duplicated: the
//     subscription lifecycle vocabulary (trialing/active/grace_period/
//     expired/paused — 'canceled' added, since a real server authority
//     needs an explicit voluntary-cancellation terminal state the
//     client-only engine never modeled) and the licensedModules-by-plan
//     shape both originate from modules/billingEngine.js's design; only
//     the enforcement moved server-side.
//
// FAIL-CLOSED / HONESTY RULES
//   - Every plan-catalog mutation (createPlan, setPlanPrice) requires the
//     caller to have already resolved isPlatformAdmin from a real
//     session (rp.js resolveSession()) — this file never re-derives it
//     and never accepts it as an unchecked client claim beyond that.
//   - Every organization-scoped mutation (createSubscription,
//     cancelSubscription, recordLedgerEntry) calls
//     this.orgs.isAuthorized(actorUserId, organizationId, capability)
//     for real — an unreachable or denying OrganizationRegistry is a
//     denial, never a bypass.
//   - A subscription's charge always uses current_price_id — the price
//     version actually bound to it at creation/renewal time — never
//     "whatever the plan costs today." Changing a plan's price never
//     rewrites an existing subscription's bound price.
//   - wallet_accounts.balance_minor_units is written ONLY inside the same
//     transaction as the wallet_ledger row that justifies it. This file
//     is the only code path allowed to write either table.
//   - Money is always a non-negative safe integer count of minor units
//     (e.g. cents). No floating-point monetary arithmetic anywhere here.

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const BILLING_INTERVALS = Object.freeze(['month', 'year', 'one_time']);
const NON_TERMINAL_STATUSES = Object.freeze(['trialing', 'active', 'grace_period', 'paused']);
const LEDGER_ENTRY_TYPES = Object.freeze(['subscription_charge', 'credit', 'refund', 'adjustment']);

const INTERVAL_MS = Object.freeze({
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
  one_time: 0,
});

class BillingError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function assertMoneyAmount(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new TypeError(`[billing] ${label} must be a non-negative integer number of minor currency units.`);
  }
}

function assertCurrency(value, label) {
  if (typeof value !== 'string' || !CURRENCY_PATTERN.test(value)) {
    throw new TypeError(`[billing] ${label} must be a 3-letter uppercase ISO-4217-shaped currency code (e.g. "KES").`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`[billing] ${label} must be a non-empty string.`);
  }
}

function rowToPlan(row) {
  if (!row) return null;
  return {
    id: row.id,
    planKey: row.plan_key,
    applicationId: row.application_id || null,
    name: row.name,
    currency: row.currency,
    billingInterval: row.billing_interval,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPrice(row) {
  if (!row) return null;
  return {
    id: row.id,
    planId: row.plan_id,
    version: row.version,
    amountMinorUnits: row.amount_minor_units,
    currency: row.currency,
    status: row.status,
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until || null,
    reason: row.reason || null,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function rowToSubscription(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    planId: row.plan_id,
    currentPriceId: row.current_price_id,
    status: row.status,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    trialEndsAt: row.trial_ends_at || null,
    gracePeriodEndsAt: row.grace_period_ends_at || null,
    canceledAt: row.canceled_at || null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToWalletAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    currency: row.currency,
    balanceMinorUnits: row.balance_minor_units,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToLedgerEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    walletAccountId: row.wallet_account_id,
    organizationId: row.organization_id,
    amountMinorUnits: row.amount_minor_units,
    currency: row.currency,
    balanceAfterMinorUnits: row.balance_after_minor_units,
    entryType: row.entry_type,
    referenceType: row.reference_type || null,
    referenceId: row.reference_id || null,
    description: row.description || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at,
  };
}

class BillingRegistry {
  /**
   * @param {object} db - DatabaseAdapter (get/all/run/exec/transaction) — the same real adapter rp.js/organizations.js use.
   * @param {object} orgs - OrganizationRegistry instance — reused, never reimplemented.
   * @param {object} [opts]
   * @param {function} [opts.now] - injectable clock, matches rp.js/organizations.js convention.
   */
  constructor(db, orgs, { now = () => Date.now() } = {}) {
    if (!db) throw new TypeError('[billing] BillingRegistry requires a DatabaseAdapter instance.');
    if (!orgs || typeof orgs.isAuthorized !== 'function') {
      throw new TypeError('[billing] BillingRegistry requires a real OrganizationRegistry instance (isAuthorized() is required) — it does not reimplement organization authorization.');
    }
    this.db = db;
    this.orgs = orgs;
    this.now = now;
  }

  // ==================================================================
  // Plan catalog (platform-admin authority — reused caller-resolved
  // isPlatformAdmin, exactly like rp.js's own admin-only operations)
  // ==================================================================

  /**
   * createPlan — creates a plan AND its initial price atomically. The
   * caller must have already resolved isPlatformAdmin=true from a real
   * session; this file trusts that boolean exactly as much as rp.js
   * trusts its own resolved session, never less, never more.
   */
  async createPlan(actorUserId, isPlatformAdmin, { planKey, applicationId = null, name, currency, billingInterval, initialAmountMinorUnits, reason = null }) {
    if (!isPlatformAdmin) throw new BillingError('platform_admin_required');
    assertNonEmptyString(actorUserId, 'actorUserId');
    assertNonEmptyString(planKey, 'planKey');
    assertNonEmptyString(name, 'name');
    assertCurrency(currency, 'currency');
    if (!BILLING_INTERVALS.includes(billingInterval)) {
      throw new TypeError(`[billing] billingInterval must be one of ${BILLING_INTERVALS.join(', ')}.`);
    }
    assertMoneyAmount(initialAmountMinorUnits, 'initialAmountMinorUnits');

    const planId = crypto.randomUUID();
    const priceId = crypto.randomUUID();
    const ts = this.now();

    await this.db.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO subscription_plans (id, plan_key, application_id, name, currency, billing_interval, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [planId, planKey, applicationId, name, currency, billingInterval, 'active', actorUserId, ts, ts]
      );
      await tx.run(
        `INSERT INTO subscription_plan_prices (id, plan_id, version, amount_minor_units, currency, status, effective_from, effective_until, reason, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [priceId, planId, 1, initialAmountMinorUnits, currency, 'active', ts, null, reason, actorUserId, ts]
      );
      await this._auditWith(tx, actorUserId, 'billing_plan_created', { planId, planKey, applicationId, currency, billingInterval, initialAmountMinorUnits });
    });

    return this.getPlan(planId);
  }

  async getPlan(planId) {
    const row = await this.db.get('SELECT * FROM subscription_plans WHERE id = ?', [planId]);
    return rowToPlan(row);
  }

  /**
   * setPlanPrice — the real, admin-configurable, historically-safe price
   * change. Closes the previous current price (effective_until = ts) and
   * inserts a new versioned row inside one transaction — a reader can
   * never observe zero or two "current" prices for a plan.
   */
  async setPlanPrice(actorUserId, isPlatformAdmin, { planId, amountMinorUnits, currency = null, reason = null }) {
    if (!isPlatformAdmin) throw new BillingError('platform_admin_required');
    assertNonEmptyString(actorUserId, 'actorUserId');
    assertNonEmptyString(planId, 'planId');
    assertMoneyAmount(amountMinorUnits, 'amountMinorUnits');

    const plan = await this.getPlan(planId);
    if (!plan) throw new BillingError('plan_not_found');
    const resolvedCurrency = currency || plan.currency;
    assertCurrency(resolvedCurrency, 'currency');

    const current = await this.getCurrentPrice(planId);
    if (!current) throw new BillingError('plan_has_no_current_price');

    const newPriceId = crypto.randomUUID();
    const ts = this.now();

    await this.db.transaction(async (tx) => {
      await tx.run(
        'UPDATE subscription_plan_prices SET status = ?, effective_until = ? WHERE id = ?',
        ['superseded', ts, current.id]
      );
      await tx.run(
        `INSERT INTO subscription_plan_prices (id, plan_id, version, amount_minor_units, currency, status, effective_from, effective_until, reason, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newPriceId, planId, current.version + 1, amountMinorUnits, resolvedCurrency, 'active', ts, null, reason, actorUserId, ts]
      );
      await tx.run('UPDATE subscription_plans SET updated_at = ? WHERE id = ?', [ts, planId]);
      await this._auditWith(tx, actorUserId, 'billing_plan_price_changed', {
        planId, previousPriceId: current.id, previousAmountMinorUnits: current.amountMinorUnits,
        newPriceId, newAmountMinorUnits: amountMinorUnits, currency: resolvedCurrency, reason,
      });
    });

    return this.getPrice(newPriceId);
  }

  async getPrice(priceId) {
    const row = await this.db.get('SELECT * FROM subscription_plan_prices WHERE id = ?', [priceId]);
    return rowToPrice(row);
  }

  // ==================================================================
  // Plan features (Phase 3 — the missing dependency real entitlement
  // resolution needed: which feature/module keys a plan licenses).
  // Platform-admin authority, same posture as createPlan/setPlanPrice.
  // ==================================================================

  /**
   * setPlanFeatures — replaces the plan's ENTIRE feature set atomically
   * (delete-then-insert inside one transaction), not an incremental
   * patch — simplest correct semantics for "this plan licenses exactly
   * these features," matching setPlanPrice's own all-or-nothing posture.
   */
  async setPlanFeatures(actorUserId, isPlatformAdmin, { planId, featureKeys, reason = null }) {
    if (!isPlatformAdmin) throw new BillingError('platform_admin_required');
    assertNonEmptyString(actorUserId, 'actorUserId');
    assertNonEmptyString(planId, 'planId');
    if (!Array.isArray(featureKeys) || featureKeys.some((k) => typeof k !== 'string' || !k.trim())) {
      throw new TypeError('[billing] featureKeys must be an array of non-empty strings.');
    }

    const plan = await this.getPlan(planId);
    if (!plan) throw new BillingError('plan_not_found');

    const uniqueKeys = [...new Set(featureKeys)];
    const ts = this.now();

    await this.db.transaction(async (tx) => {
      await tx.run('DELETE FROM subscription_plan_features WHERE plan_id = ?', [planId]);
      for (const featureKey of uniqueKeys) {
        await tx.run(
          'INSERT INTO subscription_plan_features (id, plan_id, feature_key, enabled, created_by, created_at) VALUES (?, ?, ?, 1, ?, ?)',
          [crypto.randomUUID(), planId, featureKey, actorUserId, ts]
        );
      }
      await this._auditWith(tx, actorUserId, 'billing_plan_features_changed', { planId, featureKeys: uniqueKeys, reason });
    });

    return this.getPlanFeatures(planId);
  }

  /** getPlanFeatures — public, no authorization required: which features a plan licenses is not sensitive the way price/wallet data is (it's the catalog itself), matching subscription_plans' own read-openness. */
  async getPlanFeatures(planId) {
    assertNonEmptyString(planId, 'planId');
    const rows = await this.db.all(
      'SELECT feature_key FROM subscription_plan_features WHERE plan_id = ? AND enabled = 1',
      [planId]
    );
    return rows.map((r) => r.feature_key);
  }

  // ==================================================================
  // Entitlement snapshot (Phase 3) — the real, authoritative answer to
  // "what does this organization have a right to use right now,"
  // resolved server-side from real subscription + plan-feature state.
  // Shaped compatibly with what core/modules/entitlement/entitlement-engine.js
  // already expects from a snapshot (licensedModules[], status) — this
  // is deliberately NOT wired into that file yet (see the Phase 3
  // architecture doc for why: that file's interface is synchronous,
  // this method is necessarily async since it does real DB reads). This
  // is the real server half of that future integration, not a
  // replacement for the file itself.
  // ==================================================================

  async getEntitlementSnapshot(actorUserId, organizationId) {
    assertNonEmptyString(actorUserId, 'actorUserId');
    assertNonEmptyString(organizationId, 'organizationId');

    const authorized = await this.orgs.isAuthorized(actorUserId, organizationId, 'org:billing:manage');
    if (!authorized) throw new BillingError('not_authorized');

    const subscription = await this._getActiveSubscriptionUnchecked(organizationId);
    if (!subscription) {
      // Fail-closed: no subscription means no licensed features, never
      // "everything enabled" and never a thrown error that could be
      // mistaken for a transient failure by a caller that fails open on
      // exceptions. An explicit, structured "nothing licensed" result.
      return { organizationId, hasSubscription: false, planId: null, planKey: null, status: null, licensedModules: [], currentPeriodEnd: null, resolvedAt: this.now() };
    }

    const plan = await this.getPlan(subscription.planId);
    const licensedModules = await this.getPlanFeatures(subscription.planId);

    return {
      organizationId,
      hasSubscription: true,
      planId: subscription.planId,
      planKey: plan ? plan.planKey : null,
      status: subscription.status,
      licensedModules,
      currentPeriodEnd: subscription.currentPeriodEnd,
      resolvedAt: this.now(),
    };
  }

  /** getCurrentPrice — the one row with status='active' AND effective_until IS NULL. Never fabricates a price when none exists. */
  async getCurrentPrice(planId) {
    const row = await this.db.get(
      "SELECT * FROM subscription_plan_prices WHERE plan_id = ? AND status = 'active' AND effective_until IS NULL",
      [planId]
    );
    return rowToPrice(row);
  }

  /**
   * getPriceAt — historical resolution: which price was in effect at a
   * given timestamp. This is what a report/dispute ("why was this
   * organization charged X?") should call, never getCurrentPrice(), once
   * time has passed.
   */
  async getPriceAt(planId, atTimestamp) {
    const rows = await this.db.all('SELECT * FROM subscription_plan_prices WHERE plan_id = ?', [planId]);
    const match = rows.find((r) => r.effective_from <= atTimestamp && (r.effective_until === null || r.effective_until === undefined || atTimestamp < r.effective_until));
    return rowToPrice(match || null);
  }

  // ==================================================================
  // Subscriptions (organization-scoped authority — reuses
  // OrganizationRegistry.isAuthorized(), never reimplements it)
  // ==================================================================

  /**
   * createSubscription — resolves and LOCKS the plan's current price at
   * creation time into current_price_id. A later plan price change never
   * moves this subscription's bound price.
   */
  async createSubscription(actorUserId, organizationId, { planId }) {
    assertNonEmptyString(actorUserId, 'actorUserId');
    assertNonEmptyString(organizationId, 'organizationId');
    assertNonEmptyString(planId, 'planId');

    const authorized = await this.orgs.isAuthorized(actorUserId, organizationId, 'org:billing:manage');
    if (!authorized) throw new BillingError('not_authorized');

    const plan = await this.getPlan(planId);
    if (!plan || plan.status !== 'active') throw new BillingError('plan_not_found_or_inactive');
    const price = await this.getCurrentPrice(planId);
    if (!price) throw new BillingError('plan_has_no_current_price');

    const existing = await this._getActiveSubscriptionUnchecked(organizationId);
    if (existing) throw new BillingError('organization_already_has_active_subscription');

    const id = crypto.randomUUID();
    const ts = this.now();
    const periodMs = INTERVAL_MS[plan.billingInterval] ?? 0;
    const periodEnd = plan.billingInterval === 'one_time' ? ts : ts + periodMs;

    await this.db.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO subscriptions (id, organization_id, plan_id, current_price_id, status, current_period_start, current_period_end, trial_ends_at, grace_period_ends_at, canceled_at, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, organizationId, planId, price.id, 'active', ts, periodEnd, null, null, null, actorUserId, ts, ts]
      );
      await this._auditWith(tx, actorUserId, 'billing_subscription_created', { subscriptionId: id, organizationId, planId, priceId: price.id, amountMinorUnits: price.amountMinorUnits, currency: price.currency });
    });

    return this.getSubscription(id);
  }

  async getSubscription(subscriptionId) {
    const row = await this.db.get('SELECT * FROM subscriptions WHERE id = ?', [subscriptionId]);
    return rowToSubscription(row);
  }

  /**
   * getActiveSubscription — self-enforcing, like every write method in
   * this class. Originally relied on the caller (a server.js route) to
   * check authorization first; fixed during Phase 2 final audit so this
   * class defends its own organization-scoped data regardless of which
   * caller invokes it, not just the one route that happens to exist today.
   */
  async getActiveSubscription(actorUserId, organizationId) {
    assertNonEmptyString(actorUserId, 'actorUserId');
    assertNonEmptyString(organizationId, 'organizationId');
    const authorized = await this.orgs.isAuthorized(actorUserId, organizationId, 'org:billing:manage');
    if (!authorized) throw new BillingError('not_authorized');
    return this._getActiveSubscriptionUnchecked(organizationId);
  }

  /** Internal, unchecked variant — used by createSubscription/etc. after they've already authorized the actor, to avoid a redundant second isAuthorized() round-trip within the same call. */
  async _getActiveSubscriptionUnchecked(organizationId) {
    assertNonEmptyString(organizationId, 'organizationId');
    const rows = await this.db.all('SELECT * FROM subscriptions WHERE organization_id = ?', [organizationId]);
    const active = rows.find((r) => NON_TERMINAL_STATUSES.includes(r.status));
    return rowToSubscription(active || null);
  }

  async cancelSubscription(actorUserId, organizationId, { subscriptionId, reason = null }) {
    assertNonEmptyString(actorUserId, 'actorUserId');
    assertNonEmptyString(organizationId, 'organizationId');
    assertNonEmptyString(subscriptionId, 'subscriptionId');

    const authorized = await this.orgs.isAuthorized(actorUserId, organizationId, 'org:billing:manage');
    if (!authorized) throw new BillingError('not_authorized');

    const sub = await this.getSubscription(subscriptionId);
    if (!sub || sub.organizationId !== organizationId) throw new BillingError('subscription_not_found');
    if (!NON_TERMINAL_STATUSES.includes(sub.status)) throw new BillingError('subscription_already_terminal');

    const ts = this.now();
    await this.db.transaction(async (tx) => {
      await tx.run(
        "UPDATE subscriptions SET status = 'canceled', canceled_at = ?, updated_at = ? WHERE id = ?",
        [ts, ts, subscriptionId]
      );
      await this._auditWith(tx, actorUserId, 'billing_subscription_canceled', { subscriptionId, organizationId, reason });
    });

    return this.getSubscription(subscriptionId);
  }

  // ==================================================================
  // Wallet / ledger (organization-scoped authority; this class is the
  // ONLY code path allowed to write wallet_accounts or wallet_ledger)
  // ==================================================================

  /**
   * ensureWalletAccount — idempotent. Returns the existing account if one
   * exists; never creates a second one for the same organization
   * (organization_id UNIQUE). Not currently called by any route (only
   * recordLedgerEntry auto-creates a wallet account inline) — fixed to
   * self-enforce authorization anyway during the Phase 2 final audit,
   * since it's public API on this class and must not become an
   * unauthenticated backdoor the moment something else calls it.
   */
  async ensureWalletAccount(actorUserId, organizationId, currency) {
    assertNonEmptyString(actorUserId, 'actorUserId');
    assertNonEmptyString(organizationId, 'organizationId');
    assertCurrency(currency, 'currency');
    const authorized = await this.orgs.isAuthorized(actorUserId, organizationId, 'org:billing:manage');
    if (!authorized) throw new BillingError('not_authorized');

    const existing = await this._getWalletAccountUnchecked(organizationId);
    if (existing) return existing;

    const id = crypto.randomUUID();
    const ts = this.now();
    await this.db.transaction(async (tx) => {
      await tx.run(
        'INSERT INTO wallet_accounts (id, organization_id, currency, balance_minor_units, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, organizationId, currency, 0, ts, ts]
      );
      await this._auditWith(tx, actorUserId, 'billing_wallet_account_created', { walletAccountId: id, organizationId, currency });
    });
    return this._getWalletAccountUnchecked(organizationId);
  }

  /** getWalletAccount — self-enforcing, same fix rationale as getActiveSubscription above. */
  async getWalletAccount(actorUserId, organizationId) {
    assertNonEmptyString(actorUserId, 'actorUserId');
    assertNonEmptyString(organizationId, 'organizationId');
    const authorized = await this.orgs.isAuthorized(actorUserId, organizationId, 'org:billing:manage');
    if (!authorized) throw new BillingError('not_authorized');
    return this._getWalletAccountUnchecked(organizationId);
  }

  async _getWalletAccountUnchecked(organizationId) {
    assertNonEmptyString(organizationId, 'organizationId');
    const row = await this.db.get('SELECT * FROM wallet_accounts WHERE organization_id = ?', [organizationId]);
    return rowToWalletAccount(row);
  }

  async getWalletBalance(actorUserId, organizationId) {
    const account = await this.getWalletAccount(actorUserId, organizationId);
    return account ? account.balanceMinorUnits : 0;
  }

  /**
   * recordLedgerEntry — THE only method allowed to write a wallet_ledger
   * row or mutate wallet_accounts.balance_minor_units, exactly as rp.js
   * is the only code allowed to flip is_platform_admin. Auto-creates the
   * wallet account inside the same transaction if this is the
   * organization's first entry (avoids a separate, non-atomic
   * create-then-write call sequence). Opens its own top-level
   * transaction — for a caller (like PaymentRegistry) that needs this
   * write to be part of a LARGER transaction it already has open, use
   * `_recordLedgerEntryWithinTransaction(tx, ...)` below instead, the
   * same _audit/_auditWith split every other write method already uses.
   */
  async recordLedgerEntry(actorUserId, organizationId, params) {
    assertNonEmptyString(organizationId, 'organizationId');
    const authorized = await this.orgs.isAuthorized(actorUserId, organizationId, 'org:billing:manage');
    if (!authorized) throw new BillingError('not_authorized');

    let resultEntry = null;
    await this.db.transaction(async (tx) => {
      resultEntry = await this._recordLedgerEntryWithinTransaction(tx, actorUserId, organizationId, params);
    });
    return resultEntry;
  }

  /**
   * _recordLedgerEntryWithinTransaction — the real write logic, no
   * transaction of its own (the caller already has one open). Performs
   * every validation `recordLedgerEntry()` used to inline — nothing
   * about correctness changed, only where the transaction boundary is
   * drawn. Authorization is NOT re-checked here (the caller — either
   * `recordLedgerEntry()` above, or `PaymentRegistry`, whose own
   * `createPaymentIntent()`/`refundPayment()` already authorized the
   * actor moments earlier in the same operation) — same
   * already-authorized-by-caller posture as
   * `_getActiveSubscriptionUnchecked()`.
   */
  async _recordLedgerEntryWithinTransaction(tx, actorUserId, organizationId, { amountMinorUnits, currency, entryType, referenceType = null, referenceId = null, description = null }) {
    if (!Number.isInteger(amountMinorUnits) || Math.abs(amountMinorUnits) > Number.MAX_SAFE_INTEGER) {
      throw new TypeError('[billing] amountMinorUnits must be a safe integer (positive = credit, negative = debit).');
    }
    assertCurrency(currency, 'currency');
    if (!LEDGER_ENTRY_TYPES.includes(entryType)) {
      throw new TypeError(`[billing] entryType must be one of ${LEDGER_ENTRY_TYPES.join(', ')}.`);
    }

    const ts = this.now();
    const entryId = crypto.randomUUID();

    let account = await tx.get('SELECT * FROM wallet_accounts WHERE organization_id = ?', [organizationId]);
    if (!account) {
      const accountId = crypto.randomUUID();
      await tx.run(
        'INSERT INTO wallet_accounts (id, organization_id, currency, balance_minor_units, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [accountId, organizationId, currency, 0, ts, ts]
      );
      account = { id: accountId, organization_id: organizationId, currency, balance_minor_units: 0 };
    }
    if (account.currency !== currency) {
      throw new BillingError('currency_mismatch_with_wallet_account');
    }

    const newBalance = account.balance_minor_units + amountMinorUnits;
    if (newBalance < 0) throw new BillingError('insufficient_wallet_balance');

    await tx.run(
      `INSERT INTO wallet_ledger (id, wallet_account_id, organization_id, amount_minor_units, currency, balance_after_minor_units, entry_type, reference_type, reference_id, description, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [entryId, account.id, organizationId, amountMinorUnits, currency, newBalance, entryType, referenceType, referenceId, description, actorUserId || null, ts]
    );
    await tx.run(
      'UPDATE wallet_accounts SET balance_minor_units = ?, updated_at = ? WHERE id = ?',
      [newBalance, ts, account.id]
    );
    await this._auditWith(tx, actorUserId || null, 'billing_wallet_ledger_entry', {
      ledgerEntryId: entryId, organizationId, amountMinorUnits, currency, entryType, referenceType, referenceId, newBalance,
    });
    const resultEntry = { id: entryId, wallet_account_id: account.id, organization_id: organizationId, amount_minor_units: amountMinorUnits, currency, balance_after_minor_units: newBalance, entry_type: entryType, reference_type: referenceType, reference_id: referenceId, description, created_by: actorUserId || null, created_at: ts };
    return rowToLedgerEntry(resultEntry);
  }

  /** getWalletLedger — self-enforcing, same fix rationale as getActiveSubscription/getWalletAccount above. */
  async getWalletLedger(actorUserId, organizationId, { limit = 100 } = {}) {
    assertNonEmptyString(actorUserId, 'actorUserId');
    assertNonEmptyString(organizationId, 'organizationId');
    const authorized = await this.orgs.isAuthorized(actorUserId, organizationId, 'org:billing:manage');
    if (!authorized) throw new BillingError('not_authorized');
    const rows = await this.db.all(
      'SELECT * FROM wallet_ledger WHERE organization_id = ? ORDER BY created_at DESC, id DESC',
      [organizationId]
    );
    return rows.slice(0, limit).map(rowToLedgerEntry);
  }

  // ==================================================================
  // Higher-level operation demonstrating the pieces actually connect:
  // resolve a subscription's LOCKED price, charge the wallet for it.
  // Deliberately the one place this file touches both subsystems.
  // ==================================================================

  /**
   * chargeSubscription — debits the organization's wallet by the
   * subscription's bound price (current_price_id — never a freshly
   * re-resolved "current plan price"), recording a real ledger entry
   * referencing the subscription. This is the concrete proof the
   * dependency chain is live, not a placeholder: subscription pricing
   * really does flow into a real, transactional wallet debit.
   */
  async chargeSubscription(actorUserId, organizationId, { subscriptionId }) {
    const sub = await this.getSubscription(subscriptionId);
    if (!sub || sub.organizationId !== organizationId) throw new BillingError('subscription_not_found');
    if (!NON_TERMINAL_STATUSES.includes(sub.status)) throw new BillingError('subscription_not_chargeable');

    const price = await this.getPrice(sub.currentPriceId);
    if (!price) throw new BillingError('subscription_price_not_found');

    return this.recordLedgerEntry(actorUserId, organizationId, {
      amountMinorUnits: -price.amountMinorUnits,
      currency: price.currency,
      entryType: 'subscription_charge',
      referenceType: 'subscription',
      referenceId: subscriptionId,
      description: `Subscription charge for plan ${sub.planId} (price version ${price.version})`,
    });
  }

  // ==================================================================
  // Audit — writes into the SAME audit_events table rp.js/organizations.js
  // already use. Never a second audit system.
  // ==================================================================

  async _audit(userId, eventType, detail) {
    await this.db.run(
      'INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)',
      [userId || null, eventType, JSON.stringify(detail || {}), this.now()]
    );
  }

  async _auditWith(tx, userId, eventType, detail) {
    await tx.run(
      'INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)',
      [userId || null, eventType, JSON.stringify(detail || {}), this.now()]
    );
  }
}

module.exports = { BillingRegistry, BillingError, assertMoneyAmount, assertCurrency, assertNonEmptyString };
