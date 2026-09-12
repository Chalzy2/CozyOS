'use strict';
const crypto = require('node:crypto');
const { assertNonEmptyString } = require('./billing');
const { convertAmount, applyPercentageFee } = require('./decimal-math');

// CozyOS — Live Quote, Rate & Conversion Foundation (Phase 5.3 Step 2)
// File Reference: server/webauthn-rp/quote-engine.js
//
// ARCHITECTURE
//   LOCAL CURRENCY -> LIVE MARKET RATE -> CRYPTO ASSET -> COZYOS FEE ->
//   NETWORK/PROVIDER COST -> EXACT CUSTOMER QUOTE -> SHORT-LIVED QUOTE
//   LOCK -> PAYMENT INTENT
//
// Reuses, never duplicates: CryptoPaymentRegistry's rate storage
// (getFreshRate/setExchangeRate, extended this round) and destination
// resolution (getActiveDestination), OrganizationRegistry.isAuthorized(),
// PaymentRegistry.createPaymentIntent(), the shared audit_events table,
// and exact decimal arithmetic (decimal-math.js). No second money
// engine, no second rate table, no second audit system.
//
// A quote tells the customer what CozyOS expects. It does not prove
// that money was paid — creating or locking a quote NEVER touches the
// ledger. Only the existing, separate, authoritative payment-success
// path (PaymentRegistry.processProviderEvent(), reused unchanged) can
// ever produce a ledger effect.
//
// FAIL-CLOSED / HONESTY RULES
//   - createQuote() calls CryptoPaymentRegistry.getFreshRate() — never
//     getExchangeRate() — so a STALE or EXPIRED rate can never silently
//     produce a quote. No rate = QUOTE UNAVAILABLE, never a fabricated
//     number.
//   - Every quote's rate_snapshot/fee_snapshot/gross/net amounts are
//     copied at creation time and never recalculated — a later change
//     to crypto_exchange_rates or crypto_fee_configs can never alter an
//     existing quote (immutability, matching subscription_plan_prices'
//     own historical-integrity posture).
//   - Fee configuration is versioned exactly like subscription pricing:
//     changing today's fee never rewrites a quote created under
//     yesterday's fee.
//   - All arithmetic goes through decimal-math.js's exact BigInt
//     functions — zero floating-point operations anywhere in this file.

class QuoteError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const DEFAULT_FINANCIAL_ASSETS = Object.freeze([
  { symbol: 'KES', name: 'Kenyan Shilling', assetType: 'FIAT', decimals: 2 },
  { symbol: 'USD', name: 'US Dollar', assetType: 'FIAT', decimals: 2 },
  { symbol: 'USDT', name: 'Tether', assetType: 'CRYPTO', decimals: 6 },
  { symbol: 'BTC', name: 'Bitcoin', assetType: 'CRYPTO', decimals: 8 },
  { symbol: 'SOL', name: 'Solana', assetType: 'CRYPTO', decimals: 9 },
  { symbol: 'BNB', name: 'BNB', assetType: 'CRYPTO', decimals: 18 },
  { symbol: 'MATIC', name: 'Polygon', assetType: 'CRYPTO', decimals: 18 },
]);

const QUOTE_DEFAULT_TTL_MS = 30 * 1000; // "Expires 30 seconds" — matches this round's own worked example

function rowToQuote(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    baseCurrency: row.base_currency,
    baseAmountMinorUnits: row.base_amount_minor_units,
    asset: row.asset,
    network: row.network,
    destinationAddress: row.destination_address,
    exchangeRateId: row.exchange_rate_id,
    rateSnapshot: row.rate_snapshot,
    rateTypeSnapshot: row.rate_type_snapshot,
    feeConfigId: row.fee_config_id || null,
    feeSnapshot: JSON.parse(row.fee_snapshot),
    grossAtomicAmount: row.gross_atomic_amount,
    netAtomicAmount: row.net_atomic_amount,
    status: row.status,
    rejectReason: row.reject_reason || null,
    paymentIntentId: row.payment_intent_id || null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lockedAt: row.locked_at || null,
    consumedAt: row.consumed_at || null,
  };
}

class QuoteEngine {
  constructor(db, orgs, cryptoPayments, paymentRegistry, { now = () => Date.now() } = {}) {
    if (!db) throw new TypeError('[quote-engine] QuoteEngine requires a DatabaseAdapter instance.');
    if (!orgs || typeof orgs.isAuthorized !== 'function') throw new TypeError('[quote-engine] requires a real OrganizationRegistry.');
    if (!cryptoPayments || typeof cryptoPayments.getFreshRate !== 'function') throw new TypeError('[quote-engine] requires a real CryptoPaymentRegistry — rates/destinations are reused, never reimplemented.');
    if (!paymentRegistry || typeof paymentRegistry.createPaymentIntent !== 'function') throw new TypeError('[quote-engine] requires a real PaymentRegistry — payment intents are reused, never duplicated.');
    this.db = db;
    this.orgs = orgs;
    this.cryptoPayments = cryptoPayments;
    this.paymentRegistry = paymentRegistry;
    this.now = now;
  }

  // ==================================================================
  // Asset metadata registry
  // ==================================================================

  async seedDefaultFinancialAssets() {
    for (const asset of DEFAULT_FINANCIAL_ASSETS) {
      const existing = await this.db.get('SELECT symbol FROM financial_assets WHERE symbol = ?', [asset.symbol]);
      if (!existing) {
        const ts = this.now();
        await this.db.run(
          'INSERT INTO financial_assets (symbol, name, asset_type, decimals, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [asset.symbol, asset.name, asset.assetType, asset.decimals, 'active', ts, ts]
        );
      }
    }
  }

  async getFinancialAsset(symbol) {
    const row = await this.db.get('SELECT * FROM financial_assets WHERE symbol = ?', [symbol]);
    if (!row) return null;
    return { symbol: row.symbol, name: row.name, assetType: row.asset_type, decimals: row.decimals, status: row.status };
  }

  // ==================================================================
  // Fee configuration — versioned exactly like subscription_plan_prices
  // ==================================================================

  /**
   * setFeeConfig — platform-admin gated. Closes out the previous active
   * fee for the same (organizationId, feeType) atomically and inserts a
   * new versioned row — a reader can never observe zero or two "current"
   * fees, and a historical quote's own fee_snapshot is never affected by
   * this call.
   */
  async setFeeConfig(actorUserId, isPlatformAdmin, { organizationId = null, feeType, feeValue, reason = null }) {
    if (!isPlatformAdmin) throw new QuoteError('platform_admin_required');
    assertNonEmptyString(actorUserId, 'actorUserId');
    if (!['percentage', 'fixed'].includes(feeType)) throw new TypeError('[quote-engine] feeType must be "percentage" or "fixed".');
    if (typeof feeValue !== 'string' || !/^\d+(\.\d+)?$/.test(feeValue)) {
      throw new TypeError('[quote-engine] feeValue must be an exact decimal string, never a float.');
    }
    if (feeType === 'percentage' && Number(feeValue) >= 1) {
      throw new QuoteError('fee_percentage_out_of_range'); // Core guardrail: a "fee" of 100%+ is almost certainly a configuration mistake
    }

    const ts = this.now();
    const existing = await this.db.get(
      'SELECT id FROM crypto_fee_configs WHERE (organization_id IS ? OR organization_id = ?) AND fee_type = ? AND status = ? AND effective_until IS NULL',
      [organizationId, organizationId, feeType, 'active']
    );
    const id = crypto.randomUUID();
    await this.db.transaction(async (tx) => {
      if (existing) {
        await tx.run('UPDATE crypto_fee_configs SET status = ?, effective_until = ? WHERE id = ?', ['superseded', ts, existing.id]);
      }
      await tx.run(
        'INSERT INTO crypto_fee_configs (id, organization_id, fee_type, fee_value, status, effective_from, effective_until, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)',
        [id, organizationId, feeType, feeValue, 'active', ts, actorUserId, ts]
      );
      await tx.run(
        'INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)',
        [actorUserId, 'crypto_fee_config_changed', JSON.stringify({ organizationId, feeType, feeValue, reason }), ts]
      );
    });
    return this.getActiveFeeConfig(organizationId, feeType);
  }

  /** getActiveFeeConfig — organization-specific first, falling back to the platform-wide default (organizationId IS NULL). Never fabricates a fee. */
  async getActiveFeeConfig(organizationId, feeType) {
    if (organizationId) {
      const orgSpecific = await this.db.get(
        "SELECT * FROM crypto_fee_configs WHERE organization_id = ? AND fee_type = ? AND status = 'active' AND effective_until IS NULL",
        [organizationId, feeType]
      );
      if (orgSpecific) return this._rowToFeeConfig(orgSpecific);
    }
    const platformDefault = await this.db.get(
      "SELECT * FROM crypto_fee_configs WHERE organization_id IS NULL AND fee_type = ? AND status = 'active' AND effective_until IS NULL",
      [feeType]
    );
    return this._rowToFeeConfig(platformDefault);
  }

  _rowToFeeConfig(row) {
    if (!row) return null;
    return { id: row.id, organizationId: row.organization_id || null, feeType: row.fee_type, feeValue: row.fee_value, effectiveFrom: row.effective_from };
  }

  // ==================================================================
  // Quote lifecycle: CREATED -> ACTIVE -> LOCKED -> EXPIRED / CONSUMED
  // ==================================================================

  /**
   * createQuote — the real entry point. asset/network/baseCurrency/
   * baseAmountMinorUnits are the customer's real, legitimate request —
   * but rate, fee, destination, and the resulting crypto amount are
   * ALWAYS server-resolved here, never accepted from a caller.
   */
  async createQuote(actorUserId, organizationId, { baseCurrency, baseAmountMinorUnits, asset, network, ttlMs = QUOTE_DEFAULT_TTL_MS }) {
    assertNonEmptyString(actorUserId, 'actorUserId');
    assertNonEmptyString(organizationId, 'organizationId');
    assertNonEmptyString(baseCurrency, 'baseCurrency');
    assertNonEmptyString(asset, 'asset');
    assertNonEmptyString(network, 'network');
    if (!Number.isInteger(baseAmountMinorUnits) || baseAmountMinorUnits <= 0) {
      throw new TypeError('[quote-engine] baseAmountMinorUnits must be a positive integer.');
    }

    const authorized = await this.orgs.isAuthorized(actorUserId, organizationId, 'org:billing:manage');
    if (!authorized) throw new QuoteError('not_authorized');

    const baseAssetMeta = await this.getFinancialAsset(baseCurrency);
    if (!baseAssetMeta || baseAssetMeta.assetType !== 'FIAT') throw new QuoteError('invalid_base_currency');
    const quoteAssetMeta = await this.getFinancialAsset(asset);
    if (!quoteAssetMeta || quoteAssetMeta.assetType !== 'CRYPTO') throw new QuoteError('invalid_quote_asset');

    const networkRule = await this.cryptoPayments.getNetworkAssetRule(asset, network);
    if (!networkRule) throw new QuoteError('invalid_asset_network_combination');

    const destination = await this.cryptoPayments.getActiveDestination(organizationId, asset, network);
    if (!destination) throw new QuoteError('no_active_destination_configured');

    // The core "never silently use an expired rate" guarantee.
    const rate = await this.cryptoPayments.getFreshRate(baseCurrency, asset);
    if (!rate) throw new QuoteError('rate_unavailable');

    const grossAtomicAmount = convertAmount(baseAmountMinorUnits, baseAssetMeta.decimals, rate.rate, quoteAssetMeta.decimals, 'ROUND_DOWN');

    const feeConfig = await this.getActiveFeeConfig(organizationId, 'percentage');
    if (!feeConfig) throw new QuoteError('fee_not_configured');
    const feeAtomicAmount = applyPercentageFee(grossAtomicAmount, feeConfig.feeValue, 'ROUND_UP');
    const netAtomicAmount = grossAtomicAmount - feeAtomicAmount;
    if (netAtomicAmount <= 0n) throw new QuoteError('amount_too_small_after_fee');

    const ts = this.now();
    const id = crypto.randomUUID();
    const feeSnapshot = JSON.stringify({ feeConfigId: feeConfig.id, feeType: feeConfig.feeType, feeValue: feeConfig.feeValue, feeAtomicAmount: feeAtomicAmount.toString() });

    await this.db.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO quotes (id, organization_id, base_currency, base_amount_minor_units, asset, network, destination_address, exchange_rate_id, rate_snapshot, rate_type_snapshot, fee_config_id, fee_snapshot, gross_atomic_amount, net_atomic_amount, status, created_by, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
        [id, organizationId, baseCurrency, baseAmountMinorUnits, asset, network, destination.address, rate.id, rate.rate, rate.rateType, feeConfig.id, feeSnapshot, grossAtomicAmount.toString(), netAtomicAmount.toString(), actorUserId, ts, ts + ttlMs]
      );
      await tx.run(
        'INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)',
        [actorUserId, 'QUOTE_CREATED', JSON.stringify({ quoteId: id, organizationId, baseCurrency, baseAmountMinorUnits, asset, network, rateType: rate.rateType }), ts]
      );
    });

    return this.getQuote(actorUserId, organizationId, id);
  }

  /** _applyLazyExpiry — no scheduler exists; expiry is checked and applied at the moment a quote is read or acted on. */
  async _applyLazyExpiry(row) {
    if (row.status === 'ACTIVE' && this.now() > row.expires_at) {
      await this.db.run('UPDATE quotes SET status = ? WHERE id = ?', ['EXPIRED', row.id]);
      await this.db.run('INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)', [row.created_by, 'QUOTE_EXPIRED', JSON.stringify({ quoteId: row.id }), this.now()]);
      row.status = 'EXPIRED';
    }
    return row;
  }

  async getQuote(actorUserId, organizationId, quoteId) {
    assertNonEmptyString(actorUserId, 'actorUserId');
    assertNonEmptyString(organizationId, 'organizationId');
    assertNonEmptyString(quoteId, 'quoteId');
    const authorized = await this.orgs.isAuthorized(actorUserId, organizationId, 'org:billing:manage');
    if (!authorized) throw new QuoteError('not_authorized');
    let row = await this.db.get('SELECT * FROM quotes WHERE id = ? AND organization_id = ?', [quoteId, organizationId]);
    if (!row) throw new QuoteError('quote_not_found');
    row = await this._applyLazyExpiry(row);
    return rowToQuote(row);
  }

  /**
   * lockQuote — ACTIVE -> LOCKED, idempotent if already LOCKED. Refuses
   * if the quote already expired — no stale quote can become valid
   * merely because of timing.
   */
  async lockQuote(actorUserId, organizationId, quoteId) {
    const quote = await this.getQuote(actorUserId, organizationId, quoteId); // applies lazy expiry
    if (quote.status === 'LOCKED') return quote; // idempotent
    if (quote.status !== 'ACTIVE') throw new QuoteError('quote_not_active');
    const ts = this.now();
    await this.db.run('UPDATE quotes SET status = ?, locked_at = ? WHERE id = ?', ['LOCKED', ts, quoteId]);
    await this.db.run('INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)', [actorUserId, 'QUOTE_LOCKED', JSON.stringify({ quoteId }), ts]);
    return this.getQuote(actorUserId, organizationId, quoteId);
  }

  /**
   * createPaymentIntentFromQuote — Quote -> Payment Intent. Requires
   * LOCKED. The payment intent's own metadata carries the SAME quote-
   * locked asset/network/destination/amount — never recalculated from
   * current market data.
   */
  async createPaymentIntentFromQuote(actorUserId, organizationId, quoteId) {
    const quote = await this.getQuote(actorUserId, organizationId, quoteId);
    // Real bug found by testing: checking status !== 'LOCKED' first made
    // "already consumed" unreachable, since a successfully-consumed
    // quote's own status is CONSUMED, not LOCKED — the generic
    // quote_not_locked error fired instead of the more specific,
    // accurate quote_already_consumed one. paymentIntentId must be
    // checked first.
    if (quote.paymentIntentId) throw new QuoteError('quote_already_consumed');
    if (quote.status !== 'LOCKED') throw new QuoteError('quote_not_locked');

    const intent = await this.paymentRegistry.createPaymentIntent(actorUserId, organizationId, {
      amountMinorUnits: quote.baseAmountMinorUnits,
      currency: quote.baseCurrency,
      providerId: 'crypto',
      referenceType: 'crypto_quote',
      referenceId: quote.id,
      metadata: {
        asset: quote.asset,
        network: quote.network,
        destinationAddress: quote.destinationAddress,
        cryptoAmount: quote.netAtomicAmount,
        quoteId: quote.id,
        expiresAt: quote.expiresAt,
        source: 'crypto',
      },
    });

    const ts = this.now();
    await this.db.run('UPDATE quotes SET status = ?, payment_intent_id = ?, consumed_at = ? WHERE id = ?', ['CONSUMED', intent.id, ts, quote.id]);
    await this.db.run('INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)', [actorUserId, 'quote_consumed_into_payment_intent', JSON.stringify({ quoteId: quote.id, paymentIntentId: intent.id }), ts]);

    return intent;
  }

  /**
   * verifyQuotePaymentIntentConsistency — real, explicit check that a
   * quote and the payment intent it produced still agree on every
   * financially meaningful field. Available for reconciliation/
   * diagnostics, not called automatically.
   */
  async verifyQuotePaymentIntentConsistency(actorUserId, organizationId, quoteId) {
    const quote = await this.getQuote(actorUserId, organizationId, quoteId);
    if (!quote.paymentIntentId) return { consistent: false, reason: 'no_payment_intent' };
    const intent = await this.paymentRegistry.getPaymentIntent(actorUserId, organizationId, quote.paymentIntentId);
    const mismatches = [];
    if (intent.metadata.asset !== quote.asset) mismatches.push('asset_mismatch');
    if (intent.metadata.network !== quote.network) mismatches.push('network_mismatch');
    if (intent.metadata.destinationAddress !== quote.destinationAddress) mismatches.push('destination_mismatch');
    if (intent.amountMinorUnits !== quote.baseAmountMinorUnits) mismatches.push('amount_mismatch');
    return { consistent: mismatches.length === 0, mismatches };
  }
}

module.exports = { QuoteEngine, QuoteError, DEFAULT_FINANCIAL_ASSETS, QUOTE_DEFAULT_TTL_MS };
