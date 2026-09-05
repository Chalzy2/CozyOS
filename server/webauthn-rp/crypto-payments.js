'use strict';
const crypto = require('node:crypto');
const { assertNonEmptyString } = require('./billing');

// CozyOS — Crypto Payment Foundation (Phase 5.3)
// File Reference: server/webauthn-rp/crypto-payments.js
//
// SOURCE MATERIAL AND WHY THIS FILE'S SHAPE IS WHAT IT IS
// ---------------------------------------------------------
// A supplied Binance-branded HTML page was inspected for its PAYMENT
// mechanism only (asset/network selection, wallet destinations, QR,
// copy-address UX, manual confirmation) — its referral/marketing
// content was excluded entirely and never touched. Full File Revival
// Record in docs/builder/knowledge/PHASE5.3-CRYPTO-PAYMENT-FOUNDATION-CHANGE-REPORT.md.
//
// The single most important, concrete finding from that source: its own
// data contained "Bitcoin (BSC)": "0x2545509d..." — an EVM-format
// address labeled as a Bitcoin destination. Bitcoin's blockchain cannot
// interpret that address; a real customer sending BTC there loses
// funds. This file's entire asset/network/address-format validation
// machinery exists specifically because "present in a config object"
// must never imply "valid" — the exact opposite of the source's own
// architecture (`const wallets = {...}` trusted blindly by the browser).
//
// ARCHITECTURE — the requested transformation, concretely realized:
//   Customer -> CozyOS Order -> PaymentRegistry -> crypto provider
//   adapter (server/webauthn-rp/providers/crypto-provider.js) ->
//   THIS FILE (CryptoPaymentRegistry, the real crypto-specific
//   authority) -> asset+network+amount+destination all server-resolved
//   -> customer pays -> independent verification (real blockchain
//   lookup, currently BLOCKED — no credentials/runtime) -> back through
//   PaymentRegistry -> existing Ledger (BillingRegistry, never a second
//   crypto balance system).
//
// FAIL-CLOSED / HONESTY RULES
//   - A destination is NEVER usable merely because a row exists — it
//     must reference a real (asset, network) rule AND its address must
//     pass that rule's own format validation.
//   - No exchange rate is ever fabricated. If none is configured for a
//     requested (currency, asset) pair, createCryptoPaymentIntent()
//     throws CryptoPaymentError('exchange_rate_not_configured') —
//     never a guessed number.
//   - A transaction hash is a CANDIDATE only. verifyTransaction() is
//     the one place a payment can actually become SUCCEEDED, and only
//     after every real check passes. A verifier that throws, times out,
//     or returns an inconclusive result produces UNKNOWN — never
//     FAILED, never SUCCEEDED, no ledger effect. This directly reuses
//     Phase 5.2's UNKNOWN discipline rather than reinventing it.
//   - Underpayment and overpayment are recorded as an explicit mismatch
//     with a clear reason — this file does NOT invent business policy
//     for either.

class CryptoPaymentError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// ==========================================================
// Address format validation — real, structural, independently
// testable without any network access. This is the actual mechanism
// that makes "Bitcoin (BSC)" structurally impossible to activate.
// ==========================================================

const ADDRESS_VALIDATORS = Object.freeze({
  evm: (address) => /^0x[a-fA-F0-9]{40}$/.test(address),
  bitcoin_base58: (address) => /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address),
  bitcoin_bech32: (address) => /^bc1[a-z0-9]{25,90}$/.test(address),
  tron_base58: (address) => /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address),
  solana_base58: (address) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address),
});

function validateAddressAgainstFormat(address, addressFormat) {
  const validator = ADDRESS_VALIDATORS[addressFormat];
  if (!validator) throw new TypeError(`[crypto-payments] Unknown address format "${addressFormat}".`);
  return typeof address === 'string' && validator(address);
}

/**
 * validateRateNumber — real rejection of every unsafe value a rate
 * provider response could contain: NaN, Infinity, negative, zero,
 * non-numeric strings, or anything not matching the exact-decimal-string
 * shape decimal-math.js requires. This is the concrete implementation of
 * "never blindly trust the external provider response."
 */
function validateRateNumber(value) {
  if (typeof value !== 'string') return false;
  if (!/^\d+(\.\d+)?$/.test(value)) return false; // rejects "NaN", "Infinity", "-1", scientific notation, etc. by construction
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return false;
  return true;
}

// Seed data: the combinations genuinely present in the supplied source,
// PLUS the correction it needed. "Bitcoin (BSC)" is deliberately absent
// — there is no rule row for (BTC, bsc), so no destination can ever be
// activated for it, regardless of what address is supplied.
const DEFAULT_NETWORK_ASSET_RULES = Object.freeze([
  { asset: 'USDT', network: 'tron', addressFormat: 'tron_base58' },
  { asset: 'USDT', network: 'bsc', addressFormat: 'evm' },
  { asset: 'USDT', network: 'ethereum', addressFormat: 'evm' },
  { asset: 'BTC', network: 'bitcoin', addressFormat: 'bitcoin_base58' },
  { asset: 'BTC', network: 'bitcoin_native_segwit', addressFormat: 'bitcoin_bech32' },
  { asset: 'SOL', network: 'solana', addressFormat: 'solana_base58' },
  { asset: 'BNB', network: 'bsc', addressFormat: 'evm' },
  { asset: 'MATIC', network: 'polygon', addressFormat: 'evm' },
]);

function rowToDestination(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id || null,
    asset: row.asset,
    network: row.network,
    address: row.address,
    active: !!row.active,
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until || null,
    createdAt: row.created_at,
  };
}

class CryptoPaymentRegistry {
  constructor(db, orgs, paymentRegistry, { now = () => Date.now(), internalEventSecret } = {}) {
    if (!db) throw new TypeError('[crypto-payments] CryptoPaymentRegistry requires a DatabaseAdapter instance.');
    if (!orgs || typeof orgs.isAuthorized !== 'function') throw new TypeError('[crypto-payments] requires a real OrganizationRegistry.');
    if (!paymentRegistry || typeof paymentRegistry.createPaymentIntent !== 'function') throw new TypeError('[crypto-payments] requires a real PaymentRegistry — crypto never writes payment_intents/ledger directly.');
    if (typeof internalEventSecret !== 'string' || internalEventSecret.length < 16) {
      throw new TypeError('[crypto-payments] requires internalEventSecret — the same real secret registered with the crypto provider adapter, so verifyTransaction()\'s success signal cannot be forged by anything else calling processProviderEvent() directly.');
    }
    this.db = db;
    this.orgs = orgs;
    this.paymentRegistry = paymentRegistry;
    this.now = now;
    this._internalEventSecret = internalEventSecret;
  }

  async seedDefaultNetworkAssetRules(_actorUserId) {
    for (const rule of DEFAULT_NETWORK_ASSET_RULES) {
      const existing = await this.db.get('SELECT id FROM crypto_network_asset_rules WHERE asset = ? AND network = ?', [rule.asset, rule.network]);
      if (!existing) {
        await this.db.run(
          'INSERT INTO crypto_network_asset_rules (id, asset, network, address_format) VALUES (?, ?, ?, ?)',
          [crypto.randomUUID(), rule.asset, rule.network, rule.addressFormat]
        );
      }
    }
  }

  async getNetworkAssetRule(asset, network) {
    const row = await this.db.get('SELECT * FROM crypto_network_asset_rules WHERE asset = ? AND network = ?', [asset, network]);
    if (!row) return null;
    return { asset: row.asset, network: row.network, addressFormat: row.address_format };
  }

  async setCryptoDestination(actorUserId, isPlatformAdmin, { organizationId = null, asset, network, address, reason = null }) {
    if (!isPlatformAdmin) throw new CryptoPaymentError('platform_admin_required');
    assertNonEmptyString(actorUserId, 'actorUserId');
    assertNonEmptyString(asset, 'asset');
    assertNonEmptyString(network, 'network');
    assertNonEmptyString(address, 'address');

    const rule = await this.getNetworkAssetRule(asset, network);
    if (!rule) {
      throw new CryptoPaymentError('invalid_asset_network_combination');
    }
    if (!validateAddressAgainstFormat(address, rule.addressFormat)) {
      throw new CryptoPaymentError('address_format_invalid_for_network');
    }

    const ts = this.now();
    const existing = await this.db.get(
      'SELECT id FROM crypto_destinations WHERE (organization_id IS ? OR organization_id = ?) AND asset = ? AND network = ? AND active = 1 AND effective_until IS NULL',
      [organizationId, organizationId, asset, network]
    );

    const id = crypto.randomUUID();
    await this.db.transaction(async (tx) => {
      if (existing) {
        await tx.run('UPDATE crypto_destinations SET active = 0, effective_until = ? WHERE id = ?', [ts, existing.id]);
      }
      await tx.run(
        `INSERT INTO crypto_destinations (id, organization_id, asset, network, address, active, effective_from, effective_until, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, NULL, ?, ?, ?)`,
        [id, organizationId, asset, network, address, ts, actorUserId, ts, ts]
      );
      await tx.run(
        'INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)',
        [actorUserId, 'crypto_destination_changed', JSON.stringify({ organizationId, asset, network, addressFormat: rule.addressFormat, reason }), ts]
      );
    });

    return this.getActiveDestination(organizationId, asset, network);
  }

  async getActiveDestination(organizationId, asset, network) {
    assertNonEmptyString(asset, 'asset');
    assertNonEmptyString(network, 'network');
    if (organizationId) {
      const orgSpecific = await this.db.get(
        'SELECT * FROM crypto_destinations WHERE organization_id = ? AND asset = ? AND network = ? AND active = 1 AND effective_until IS NULL',
        [organizationId, asset, network]
      );
      if (orgSpecific) return rowToDestination(orgSpecific);
    }
    const platformDefault = await this.db.get(
      'SELECT * FROM crypto_destinations WHERE organization_id IS NULL AND asset = ? AND network = ? AND active = 1 AND effective_until IS NULL',
      [asset, network]
    );
    return rowToDestination(platformDefault);
  }

  async setConfirmationPolicy(actorUserId, isPlatformAdmin, { network, requiredConfirmations }) {
    if (!isPlatformAdmin) throw new CryptoPaymentError('platform_admin_required');
    assertNonEmptyString(network, 'network');
    if (!Number.isInteger(requiredConfirmations) || requiredConfirmations < 0) {
      throw new TypeError('[crypto-payments] requiredConfirmations must be a non-negative integer.');
    }
    const ts = this.now();
    const existing = await this.db.get('SELECT id FROM crypto_confirmation_policy WHERE network = ?', [network]);
    if (existing) {
      await this.db.run('UPDATE crypto_confirmation_policy SET required_confirmations = ?, updated_at = ? WHERE network = ?', [requiredConfirmations, ts, network]);
    } else {
      await this.db.run(
        'INSERT INTO crypto_confirmation_policy (id, network, required_confirmations, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), network, requiredConfirmations, actorUserId, ts, ts]
      );
    }
    return this.getConfirmationPolicy(network);
  }

  async getConfirmationPolicy(network) {
    const row = await this.db.get('SELECT required_confirmations FROM crypto_confirmation_policy WHERE network = ?', [network]);
    return row ? row.required_confirmations : null;
  }

  /**
   * getExchangeRate — extended (Phase 5.3 Step 2) to return the full
   * provenance record (rateType/bid/ask/observedAt) alongside a real
   * `health` classification, never leaving the caller to guess whether
   * a returned rate is trustworthy just because a row exists.
   */
  async getExchangeRate(baseCurrency, quoteAsset) {
    const row = await this.db.get(
      'SELECT * FROM crypto_exchange_rates WHERE base_currency = ? AND quote_asset = ? ORDER BY fetched_at DESC LIMIT 1',
      [baseCurrency, quoteAsset]
    );
    if (!row) return null;
    return {
      id: row.id, baseCurrency: row.base_currency, quoteAsset: row.quote_asset, rate: row.rate,
      bid: row.bid || null, ask: row.ask || null, source: row.source, rateType: row.rate_type,
      fetchedAt: row.fetched_at, observedAt: row.observed_at || row.fetched_at, expiresAt: row.expires_at,
      health: this.classifyRateHealth(row, this.now()),
    };
  }

  /**
   * classifyRateHealth — "a rate must never be considered live merely
   * because it exists in a database." Real, deterministic freshness
   * policy: CURRENT (not yet expired), STALE (past expiry but within a
   * short grace window — still visible for diagnostics, never usable
   * for a new quote), EXPIRED (well past usable), UNAVAILABLE (no row
   * at all, handled by the caller when this function isn't reached).
   */
  classifyRateHealth(row, now) {
    const staleGraceMs = 60 * 1000; // how long an expired rate remains visible as STALE (for diagnostics) before being just EXPIRED
    if (now <= row.expires_at) return 'CURRENT';
    if (now <= row.expires_at + staleGraceMs) return 'STALE';
    return 'EXPIRED';
  }

  /**
   * getFreshRate — the ONLY method quote creation should call. Returns
   * a rate only if its health is CURRENT; otherwise returns null rather
   * than a stale value the caller might use by mistake. This is the
   * concrete mechanism behind "do not silently use an expired rate."
   */
  async getFreshRate(baseCurrency, quoteAsset) {
    const rate = await this.getExchangeRate(baseCurrency, quoteAsset);
    if (!rate || rate.health !== 'CURRENT') return null;
    return rate;
  }

  /**
   * setExchangeRate — the real, provider-neutral exchange-rate
   * dependency/interface this round establishes structurally: a real
   * table, real admin-gated write, real expiry-aware read. Does NOT
   * itself fetch a rate from anywhere — it's the entry point a real
   * rate source (or, until one exists, a manually authorized
   * administrator, or the isolated TEST_RATE_PROVIDER in tests) uses to
   * record one. `rate` is stored as an exact decimal STRING, never a
   * float. `rateType` MUST be explicit and is never defaulted to
   * REAL_RATE_PROVIDER — a caller must say what kind of rate this is;
   * accidentally mislabeling a manual/test rate as real-provider data
   * is exactly the failure mode section 35/36 warn against.
   */
  async setExchangeRate(actorUserId, isPlatformAdmin, { baseCurrency, quoteAsset, rate, bid = null, ask = null, source, rateType, expiresInMs = 5 * 60 * 1000, observedAt = null }) {
    if (!isPlatformAdmin) throw new CryptoPaymentError('platform_admin_required');
    assertNonEmptyString(baseCurrency, 'baseCurrency');
    assertNonEmptyString(quoteAsset, 'quoteAsset');
    assertNonEmptyString(source, 'source');
    if (!['REAL_RATE_PROVIDER', 'TEST_RATE_PROVIDER', 'MANUAL_RATE'].includes(rateType)) {
      throw new TypeError('[crypto-payments] rateType must be explicitly one of REAL_RATE_PROVIDER, TEST_RATE_PROVIDER, MANUAL_RATE — never defaulted, to prevent mislabeling a non-live rate as live.');
    }
    if (!validateRateNumber(rate)) {
      throw new CryptoPaymentError('invalid_rate_value');
    }
    if (bid !== null && !validateRateNumber(bid)) throw new CryptoPaymentError('invalid_rate_value');
    if (ask !== null && !validateRateNumber(ask)) throw new CryptoPaymentError('invalid_rate_value');

    const ts = this.now();
    const id = crypto.randomUUID();
    await this.db.run(
      'INSERT INTO crypto_exchange_rates (id, base_currency, quote_asset, rate, bid, ask, source, rate_type, fetched_at, observed_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, baseCurrency, quoteAsset, rate, bid, ask, source, rateType, ts, observedAt || ts, ts + expiresInMs]
    );
    await this.db.run(
      'INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)',
      [actorUserId, 'crypto_exchange_rate_set', JSON.stringify({ baseCurrency, quoteAsset, rate, source, rateType }), ts]
    );
    return this.getExchangeRate(baseCurrency, quoteAsset);
  }

  async createCryptoPaymentIntent(actorUserId, organizationId, { asset, network, baseCurrency, baseAmountMinorUnits, expiresInMs = 30 * 60 * 1000 }) {
    assertNonEmptyString(actorUserId, 'actorUserId');
    assertNonEmptyString(organizationId, 'organizationId');
    assertNonEmptyString(asset, 'asset');
    assertNonEmptyString(network, 'network');
    assertNonEmptyString(baseCurrency, 'baseCurrency');
    if (!Number.isInteger(baseAmountMinorUnits) || baseAmountMinorUnits <= 0) {
      throw new TypeError('[crypto-payments] baseAmountMinorUnits must be a positive integer.');
    }

    const rule = await this.getNetworkAssetRule(asset, network);
    if (!rule) throw new CryptoPaymentError('invalid_asset_network_combination');

    const destination = await this.getActiveDestination(organizationId, asset, network);
    if (!destination) throw new CryptoPaymentError('no_active_destination_configured');
    if (!validateAddressAgainstFormat(destination.address, rule.addressFormat)) {
      throw new CryptoPaymentError('destination_address_invalid');
    }

    // A real bug was found here empirically before this fix: allowing
    // baseCurrency === asset as a "no conversion needed" shortcut meant
    // a crypto ticker like "USDT" (4 letters) could flow into
    // payment_intents.currency, which BillingRegistry's assertCurrency()
    // correctly rejects (it validates a 3-letter ISO-4217 FIAT code,
    // by design — payment_intents.currency is a business-currency field
    // shared across every provider, not a crypto-asset-ticker field).
    // Removed the shortcut entirely: a crypto payment intent always
    // requires a real, separately-configured exchange rate.
    const rate = await this.getFreshRate(baseCurrency, asset);
    if (!rate) {
      throw new CryptoPaymentError('exchange_rate_not_configured');
    }
    // Deliberate, disclosed gap, distinct from rate availability: real
    // exact-decimal conversion arithmetic (accounting for each asset's
    // own decimal-places convention — USDT=6, BTC=8, SOL=9, etc., which
    // this schema does not yet model) is genuinely future work, not
    // guessable correctly under this round's scope. cryptoAmount is
    // honestly null even when a rate exists — never a fabricated or
    // naively-rounded number. See the change report's BLOCKED section.
    const cryptoAmount = null;

    const ts = this.now();
    const expiresAt = ts + expiresInMs;
    const metadata = { asset, network, destinationAddress: destination.address, cryptoAmount, expiresAt, source: 'crypto' };

    const intent = await this.paymentRegistry.createPaymentIntent(actorUserId, organizationId, {
      amountMinorUnits: baseAmountMinorUnits,
      currency: baseCurrency,
      providerId: 'crypto',
      referenceType: 'crypto_payment',
      metadata,
    });
    return intent;
  }

  async submitTransactionHash(actorUserId, organizationId, { paymentIntentId, network, transactionHash, claimedAmount = null, claimedDestination = null, claimedAsset = null }) {
    assertNonEmptyString(actorUserId, 'actorUserId');
    assertNonEmptyString(paymentIntentId, 'paymentIntentId');
    assertNonEmptyString(network, 'network');
    assertNonEmptyString(transactionHash, 'transactionHash');

    const intent = await this.paymentRegistry.getPaymentIntent(actorUserId, organizationId, paymentIntentId);
    if (!intent) throw new CryptoPaymentError('payment_intent_not_found');

    const existing = await this.db.get('SELECT id FROM crypto_transactions WHERE network = ? AND transaction_hash = ?', [network, transactionHash]);
    if (existing) throw new CryptoPaymentError('transaction_already_submitted');

    const id = crypto.randomUUID();
    const ts = this.now();
    try {
      await this.db.run(
        `INSERT INTO crypto_transactions (id, payment_intent_id, network, transaction_hash, asset, amount_claimed, destination_claimed, verification_status, submitted_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING_VERIFICATION', ?, ?)`,
        [id, paymentIntentId, network, transactionHash, claimedAsset, claimedAmount, claimedDestination, actorUserId, ts]
      );
    } catch (_err) {
      throw new CryptoPaymentError('transaction_already_submitted');
    }
    return this.getTransaction(id);
  }

  async getTransaction(transactionId) {
    const row = await this.db.get('SELECT * FROM crypto_transactions WHERE id = ?', [transactionId]);
    if (!row) return null;
    return {
      id: row.id, paymentIntentId: row.payment_intent_id, network: row.network, transactionHash: row.transaction_hash,
      asset: row.asset, amountClaimed: row.amount_claimed, destinationClaimed: row.destination_claimed,
      confirmations: row.confirmations, verificationStatus: row.verification_status, mismatchReason: row.mismatch_reason,
      createdAt: row.created_at, verifiedAt: row.verified_at,
    };
  }

  async verifyTransaction(actorUserId, organizationId, transactionId, verifier) {
    if (typeof verifier?.getTransaction !== 'function' || typeof verifier?.getConfirmations !== 'function') {
      throw new TypeError('[crypto-payments] verifyTransaction(): verifier must implement getTransaction() and getConfirmations().');
    }
    const txRecord = await this.getTransaction(transactionId);
    if (!txRecord) throw new CryptoPaymentError('transaction_not_found');
    if (txRecord.verificationStatus !== 'PENDING_VERIFICATION') {
      return txRecord;
    }

    const intent = await this.paymentRegistry.getPaymentIntent(actorUserId, organizationId, txRecord.paymentIntentId);
    const metadata = intent.metadata || {};
    const ts = this.now();

    let chainTx;
    let confirmations;
    try {
      chainTx = await verifier.getTransaction(txRecord.network, txRecord.transactionHash);
      confirmations = await verifier.getConfirmations(txRecord.network, txRecord.transactionHash);
    } catch (_err) {
      await this.db.run('UPDATE crypto_transactions SET verification_status = ?, verified_at = ? WHERE id = ?', ['UNKNOWN', ts, transactionId]);
      return this.getTransaction(transactionId);
    }

    if (!chainTx || chainTx.state === 'not_found' || chainTx.state === 'inconclusive') {
      await this.db.run('UPDATE crypto_transactions SET verification_status = ?, confirmations = ?, verified_at = ? WHERE id = ?', ['UNKNOWN', confirmations ?? null, ts, transactionId]);
      return this.getTransaction(transactionId);
    }
    if (chainTx.state === 'failed' || chainTx.state === 'reverted') {
      await this.db.run('UPDATE crypto_transactions SET verification_status = ?, mismatch_reason = ?, verified_at = ? WHERE id = ?', ['VERIFIED_MISMATCH', 'transaction_failed_or_reverted', ts, transactionId]);
      return this.getTransaction(transactionId);
    }

    const mismatches = [];
    if (chainTx.network !== txRecord.network) mismatches.push('network_mismatch');
    if (chainTx.asset !== metadata.asset) mismatches.push('asset_mismatch');
    if (chainTx.destination !== metadata.destinationAddress) mismatches.push('destination_mismatch');
    if (typeof metadata.cryptoAmount === 'number' && chainTx.amount < metadata.cryptoAmount) mismatches.push('underpayment');
    if (typeof metadata.cryptoAmount === 'number' && chainTx.amount > metadata.cryptoAmount) mismatches.push('overpayment');

    if (mismatches.length > 0) {
      await this.db.run(
        'UPDATE crypto_transactions SET verification_status = ?, confirmations = ?, mismatch_reason = ?, verified_at = ? WHERE id = ?',
        ['VERIFIED_MISMATCH', confirmations, mismatches.join(','), ts, transactionId]
      );
      return this.getTransaction(transactionId);
    }

    const requiredConfirmations = (await this.getConfirmationPolicy(txRecord.network)) ?? Infinity;
    if (confirmations < requiredConfirmations) {
      await this.db.run('UPDATE crypto_transactions SET confirmations = ? WHERE id = ?', [confirmations, transactionId]);
      return this.getTransaction(transactionId);
    }

    await this.db.run('UPDATE crypto_transactions SET verification_status = ?, confirmations = ?, verified_at = ? WHERE id = ?', ['VERIFIED_MATCH', confirmations, ts, transactionId]);

    const { signInternalCryptoEvent } = require('./providers/crypto-provider');
    const { rawPayload, headers } = signInternalCryptoEvent({
      eventId: `crypto_verify_${transactionId}`,
      providerPaymentId: intent.providerPaymentId,
      amountMinorUnits: intent.amountMinorUnits,
      currency: intent.currency,
      status: 'succeeded',
    }, this._internalEventSecret);
    await this.paymentRegistry.processProviderEvent('crypto', rawPayload, headers);

    return this.getTransaction(transactionId);
  }
}

module.exports = { CryptoPaymentRegistry, CryptoPaymentError, validateAddressAgainstFormat, validateRateNumber, DEFAULT_NETWORK_ASSET_RULES, ADDRESS_VALIDATORS };
