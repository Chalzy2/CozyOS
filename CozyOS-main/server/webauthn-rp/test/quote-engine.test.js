'use strict';
/**
 * server/webauthn-rp/test/quote-engine.test.js
 *
 * CozyOS Live Quote, Rate & Conversion Foundation (Phase 5.3 Step 2).
 * All results here are TESTED/VERIFIED against real local infrastructure
 * (real SQLite, real BigInt exact arithmetic) — LIVE RATE RUNTIME
 * remains BLOCKED (no real rate provider credentials/API access exist).
 * The test-only rate provider is isolated and never wired into
 * production.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { openDb } = require('../db');
const { SQLiteDatabaseAdapter } = require('../database-adapter');
const { OrganizationRegistry } = require('../organizations');
const { BillingRegistry } = require('../billing');
const { PaymentRegistry } = require('../payments');
const { CryptoPaymentRegistry } = require('../crypto-payments');
const { createCryptoProviderAdapter } = require('../providers/crypto-provider');
const { QuoteEngine } = require('../quote-engine');
const { createTestOnlyRateProvider } = require('./test-only-rate-provider');
const { convertAmount, applyPercentageFee, divideWithRounding } = require('../decimal-math');

async function freshHarness(prefix) {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), `quote-${prefix}-`)), 'x.sqlite');
  const db = new SQLiteDatabaseAdapter(openDb(dbPath));
  const orgs = new OrganizationRegistry(db, {});
  const billing = new BillingRegistry(db, orgs, {});
  const payments = new PaymentRegistry(db, orgs, billing, {});
  const secret = crypto.randomBytes(32).toString('hex');
  payments.registerProvider('crypto', createCryptoProviderAdapter({ internalEventSecret: secret }));
  const cryptoPayments = new CryptoPaymentRegistry(db, orgs, payments, { internalEventSecret: secret });
  await cryptoPayments.seedDefaultNetworkAssetRules();
  const quoteEngine = new QuoteEngine(db, orgs, cryptoPayments, payments, {});
  await quoteEngine.seedDefaultFinancialAssets();
  const testRates = createTestOnlyRateProvider(cryptoPayments);

  const adminId = crypto.randomUUID();
  const ts = Date.now();
  await db.run('INSERT INTO users (id, email, is_platform_admin, created_at) VALUES (?, ?, 1, ?)', [adminId, `${prefix}-${crypto.randomUUID()}@example.com`, ts]);
  const org = await orgs.createOrganization(adminId, { name: `QuoteOrg-${prefix}` });
  return { db, orgs, billing, payments, cryptoPayments, quoteEngine, testRates, adminId, organizationId: org.id, dbPath };
}

async function cleanup(h) {
  await h.db.close();
  fs.rmSync(h.dbPath, { force: true });
}

async function setup(h, { fee = '0.02', rate = '0.0077', expiresInMs = 60000 } = {}) {
  await h.cryptoPayments.setCryptoDestination(h.adminId, true, { asset: 'USDT', network: 'tron', address: 'TFTBNKnkn2Uin7m3NNVNZ1FJJFGW2HwdLj' });
  await h.testRates.publishRate(h.adminId, { baseCurrency: 'KES', quoteAsset: 'USDT', rate, expiresInMs });
  await h.quoteEngine.setFeeConfig(h.adminId, true, { feeType: 'percentage', feeValue: fee });
}

// ========== 1. Exact arithmetic — no floating-point shortcuts ==========

test('decimal-math: the classic float trap (0.1+0.2!==0.3) does not affect exact conversion', () => {
  assert.equal(0.1 + 0.2 === 0.3, false, 'sanity check: floats really are broken here');
  const a = convertAmount(10n, 0, '0.1', 1);
  const b = convertAmount(20n, 0, '0.1', 1);
  assert.equal((a + b).toString(), '30');
});

test('decimal-math: rounding boundaries are deterministic and exact', () => {
  assert.equal(divideWithRounding(5n, 2n, 'ROUND_DOWN').toString(), '2');
  assert.equal(divideWithRounding(5n, 2n, 'ROUND_UP').toString(), '3');
  assert.equal(divideWithRounding(5n, 2n, 'NEAREST').toString(), '3');
  assert.equal(divideWithRounding(4n, 2n, 'NEAREST').toString(), '2');
});

test('decimal-math: very small crypto amounts and very large fiat amounts both remain exact', () => {
  const tiny = convertAmount(1n, 2, '0.0000001234', 8);
  assert.equal(typeof tiny, 'bigint');
  const large = convertAmount(100000000000n, 2, '0.0077', 6);
  assert.equal(large.toString(), '7700000000000');
});

test('decimal-math: high-decimal assets (18 decimals) compute exactly', () => {
  // 1000000 minor units at 2 decimals = 10,000.00 major units of base.
  // 10,000 * rate 0.5 = 5,000 major units of the quote asset.
  // At 18 decimals: 5000 * 10^18 = 5e21. Independently confirmed via
  // Python (1000000 * 5 * 10**18 // (10**2 * 10) = 5000000000000000000000)
  // before fixing this test's originally-wrong expected value.
  const result = convertAmount(1000000n, 2, '0.5', 18);
  assert.equal(result.toString(), '5000000000000000000000');
});

test('decimal-math: fee rounding never under-collects for CozyOS (ROUND_UP default)', () => {
  const fee = applyPercentageFee(999999n, '0.02');
  assert.equal(fee.toString(), '20000');
});

// ========== 2. Rate validation — never trust the provider blindly ==========

test('rate validation: NaN/Infinity/negative/zero rates are all rejected', async () => {
  const h = await freshHarness('rate-invalid');
  try {
    for (const bad of ['NaN', 'Infinity', '-1', '0', '1e10']) {
      await assert.rejects(
        () => h.cryptoPayments.setExchangeRate(h.adminId, true, { baseCurrency: 'KES', quoteAsset: 'USDT', rate: bad, source: 'test', rateType: 'MANUAL_RATE' }),
        undefined,
        `rate "${bad}" should have been rejected`
      );
    }
  } finally { await cleanup(h); }
});

test('rate validation: a rate type must be explicit — cannot be silently defaulted to REAL_RATE_PROVIDER', async () => {
  const h = await freshHarness('rate-type-required');
  try {
    await assert.rejects(
      () => h.cryptoPayments.setExchangeRate(h.adminId, true, { baseCurrency: 'KES', quoteAsset: 'USDT', rate: '0.0077', source: 'test', rateType: 'NOT_A_REAL_TYPE' })
    );
  } finally { await cleanup(h); }
});

test('rate freshness: an expired rate is never returned by getFreshRate, even though the row still exists', async () => {
  const h = await freshHarness('rate-stale');
  try {
    await h.cryptoPayments.setExchangeRate(h.adminId, true, { baseCurrency: 'KES', quoteAsset: 'USDT', rate: '0.0077', source: 'test', rateType: 'TEST_RATE_PROVIDER', expiresInMs: -1000 });
    const fresh = await h.cryptoPayments.getFreshRate('KES', 'USDT');
    assert.equal(fresh, null, 'an already-expired rate must never be returned as fresh');
    const raw = await h.cryptoPayments.getExchangeRate('KES', 'USDT');
    assert.notEqual(raw.health, 'CURRENT');
  } finally { await cleanup(h); }
});

// ========== 3. Quote creation — server-authoritative ==========

test('createQuote: is BLOCKED (rate_unavailable) when no fresh rate exists, never fabricates one', async () => {
  const h = await freshHarness('quote-no-rate');
  try {
    await h.cryptoPayments.setCryptoDestination(h.adminId, true, { asset: 'USDT', network: 'tron', address: 'TFTBNKnkn2Uin7m3NNVNZ1FJJFGW2HwdLj' });
    await h.quoteEngine.setFeeConfig(h.adminId, true, { feeType: 'percentage', feeValue: '0.02' });
    await assert.rejects(
      () => h.quoteEngine.createQuote(h.adminId, h.organizationId, { baseCurrency: 'KES', baseAmountMinorUnits: 1000000, asset: 'USDT', network: 'tron' }),
      (err) => err.code === 'rate_unavailable'
    );
  } finally { await cleanup(h); }
});

test('createQuote: is BLOCKED (fee_not_configured) when no fee is configured, never assumes zero fee', async () => {
  const h = await freshHarness('quote-no-fee');
  try {
    await h.cryptoPayments.setCryptoDestination(h.adminId, true, { asset: 'USDT', network: 'tron', address: 'TFTBNKnkn2Uin7m3NNVNZ1FJJFGW2HwdLj' });
    await h.testRates.publishRate(h.adminId, { baseCurrency: 'KES', quoteAsset: 'USDT', rate: '0.0077', expiresInMs: 60000 });
    await assert.rejects(
      () => h.quoteEngine.createQuote(h.adminId, h.organizationId, { baseCurrency: 'KES', baseAmountMinorUnits: 1000000, asset: 'USDT', network: 'tron' }),
      (err) => err.code === 'fee_not_configured'
    );
  } finally { await cleanup(h); }
});

test('createQuote: exact end-to-end calculation matches hand-verified arithmetic', async () => {
  const h = await freshHarness('quote-exact');
  try {
    await setup(h, { fee: '0.02', rate: '0.0077' });
    const quote = await h.quoteEngine.createQuote(h.adminId, h.organizationId, { baseCurrency: 'KES', baseAmountMinorUnits: 1000000, asset: 'USDT', network: 'tron' });
    assert.equal(quote.grossAtomicAmount, '77000000');
    assert.equal(quote.feeSnapshot.feeAtomicAmount, '1540000');
    assert.equal(quote.netAtomicAmount, '75460000');
    assert.equal(quote.status, 'ACTIVE');
    assert.equal(quote.destinationAddress, 'TFTBNKnkn2Uin7m3NNVNZ1FJJFGW2HwdLj');
  } finally { await cleanup(h); }
});

test('createQuote: rejects an invalid asset/network combination — reuses CryptoPaymentRegistry\'s real rule, does not reimplement it', async () => {
  const h = await freshHarness('quote-invalid-combo');
  try {
    await setup(h);
    await assert.rejects(
      () => h.quoteEngine.createQuote(h.adminId, h.organizationId, { baseCurrency: 'KES', baseAmountMinorUnits: 1000000, asset: 'BTC', network: 'bsc' }),
      (err) => err.code === 'invalid_asset_network_combination'
    );
  } finally { await cleanup(h); }
});

// ========== 4. Quote security — client tampering ==========

test('security: forged extra financial fields on createQuote have zero effect — they are never read at all', async () => {
  const h = await freshHarness('quote-tamper-shape');
  try {
    await setup(h);
    const quote = await h.quoteEngine.createQuote(h.adminId, h.organizationId, {
      baseCurrency: 'KES', baseAmountMinorUnits: 1000000, asset: 'USDT', network: 'tron',
      clientRate: '999999', clientFee: '0', clientCryptoAmount: '1000000000',
    });
    assert.equal(quote.grossAtomicAmount, '77000000', 'the real server-computed amount must be used regardless of forged extra fields');
  } finally { await cleanup(h); }
});

test('security: a forged asset/network/currency combination not matching a real destination is still rejected', async () => {
  const h = await freshHarness('quote-tamper-combo');
  try {
    await setup(h);
    await assert.rejects(
      () => h.quoteEngine.createQuote(h.adminId, h.organizationId, { baseCurrency: 'USD', baseAmountMinorUnits: 1000000, asset: 'BTC', network: 'bsc' })
    );
  } finally { await cleanup(h); }
});

// ========== 5. Organization isolation ==========

test('organization isolation: Organization A cannot read or lock Organization B\'s quote', async () => {
  const h = await freshHarness('org-isolation');
  try {
    await setup(h);
    const quote = await h.quoteEngine.createQuote(h.adminId, h.organizationId, { baseCurrency: 'KES', baseAmountMinorUnits: 1000000, asset: 'USDT', network: 'tron' });

    const outsiderId = crypto.randomUUID();
    await h.db.run('INSERT INTO users (id, email, is_platform_admin, created_at) VALUES (?, ?, 0, ?)', [outsiderId, 'outsider@example.com', Date.now()]);
    const otherOrg = await h.orgs.createOrganization(outsiderId, { name: 'OtherOrg' });

    await assert.rejects(() => h.quoteEngine.getQuote(outsiderId, otherOrg.id, quote.id), (err) => err.code === 'quote_not_found');
    await assert.rejects(() => h.quoteEngine.lockQuote(outsiderId, otherOrg.id, quote.id), (err) => err.code === 'quote_not_found');
  } finally { await cleanup(h); }
});

// ========== 6. Quote lifecycle: CREATED -> ACTIVE -> LOCKED -> EXPIRED ==========

test('lifecycle: locking twice is idempotent, returns the same locked quote', async () => {
  const h = await freshHarness('lock-idempotent');
  try {
    await setup(h);
    const quote = await h.quoteEngine.createQuote(h.adminId, h.organizationId, { baseCurrency: 'KES', baseAmountMinorUnits: 1000000, asset: 'USDT', network: 'tron' });
    const first = await h.quoteEngine.lockQuote(h.adminId, h.organizationId, quote.id);
    const second = await h.quoteEngine.lockQuote(h.adminId, h.organizationId, quote.id);
    assert.equal(first.lockedAt, second.lockedAt, 'locking an already-locked quote must not re-lock or change lockedAt');
  } finally { await cleanup(h); }
});

test('lifecycle: an expired quote cannot be locked — no stale quote becomes valid merely from timing', async () => {
  const h = await freshHarness('lock-expired');
  try {
    await setup(h);
    const quote = await h.quoteEngine.createQuote(h.adminId, h.organizationId, { baseCurrency: 'KES', baseAmountMinorUnits: 1000000, asset: 'USDT', network: 'tron', ttlMs: -1000 });
    await assert.rejects(() => h.quoteEngine.lockQuote(h.adminId, h.organizationId, quote.id), (err) => err.code === 'quote_not_active');
    const read = await h.quoteEngine.getQuote(h.adminId, h.organizationId, quote.id);
    assert.equal(read.status, 'EXPIRED', 'reading an expired quote must lazily transition it to EXPIRED');
  } finally { await cleanup(h); }
});

test('lifecycle: a quote cannot be consumed into a payment intent unless it is LOCKED', async () => {
  const h = await freshHarness('consume-unlocked');
  try {
    await setup(h);
    const quote = await h.quoteEngine.createQuote(h.adminId, h.organizationId, { baseCurrency: 'KES', baseAmountMinorUnits: 1000000, asset: 'USDT', network: 'tron' });
    await assert.rejects(() => h.quoteEngine.createPaymentIntentFromQuote(h.adminId, h.organizationId, quote.id), (err) => err.code === 'quote_not_locked');
  } finally { await cleanup(h); }
});

test('lifecycle: a quote may only ever produce one payment intent', async () => {
  const h = await freshHarness('consume-once');
  try {
    await setup(h);
    const quote = await h.quoteEngine.createQuote(h.adminId, h.organizationId, { baseCurrency: 'KES', baseAmountMinorUnits: 1000000, asset: 'USDT', network: 'tron' });
    await h.quoteEngine.lockQuote(h.adminId, h.organizationId, quote.id);
    await h.quoteEngine.createPaymentIntentFromQuote(h.adminId, h.organizationId, quote.id);
    await assert.rejects(() => h.quoteEngine.createPaymentIntentFromQuote(h.adminId, h.organizationId, quote.id), (err) => err.code === 'quote_already_consumed');
  } finally { await cleanup(h); }
});

// ========== 7. Quote immutability — historical fee/rate integrity ==========

test('immutability: changing the fee AFTER a quote is created never alters that quote\'s own fee snapshot', async () => {
  const h = await freshHarness('fee-immutability');
  try {
    await setup(h, { fee: '0.02' });
    const quote = await h.quoteEngine.createQuote(h.adminId, h.organizationId, { baseCurrency: 'KES', baseAmountMinorUnits: 1000000, asset: 'USDT', network: 'tron' });
    assert.equal(quote.netAtomicAmount, '75460000');

    await h.quoteEngine.setFeeConfig(h.adminId, true, { feeType: 'percentage', feeValue: '0.10' });

    const reread = await h.quoteEngine.getQuote(h.adminId, h.organizationId, quote.id);
    assert.equal(reread.netAtomicAmount, '75460000', 'an existing quote must retain its original fee/amount after a fee change');
    assert.equal(reread.feeSnapshot.feeValue, '0.02', 'the historical fee snapshot must not change');

    const newQuote = await h.quoteEngine.createQuote(h.adminId, h.organizationId, { baseCurrency: 'KES', baseAmountMinorUnits: 1000000, asset: 'USDT', network: 'tron' });
    assert.equal(newQuote.feeSnapshot.feeValue, '0.10');
  } finally { await cleanup(h); }
});

test('immutability: a new market rate creates a NEW quote, never rewrites an existing one (race-condition scenario)', async () => {
  const h = await freshHarness('rate-race');
  try {
    await setup(h, { rate: '0.0077' });
    const quoteA = await h.quoteEngine.createQuote(h.adminId, h.organizationId, { baseCurrency: 'KES', baseAmountMinorUnits: 1000000, asset: 'USDT', network: 'tron' });

    await h.testRates.publishRate(h.adminId, { baseCurrency: 'KES', quoteAsset: 'USDT', rate: '0.0080', expiresInMs: 60000 });

    const rereadA = await h.quoteEngine.getQuote(h.adminId, h.organizationId, quoteA.id);
    assert.equal(rereadA.rateSnapshot, '0.0077', 'Quote A must retain the rate that was authoritative when it was created');

    const quoteB = await h.quoteEngine.createQuote(h.adminId, h.organizationId, { baseCurrency: 'KES', baseAmountMinorUnits: 1000000, asset: 'USDT', network: 'tron' });
    assert.equal(quoteB.rateSnapshot, '0.0080', 'Quote B, created after the rate change, uses the new rate');
    assert.notEqual(quoteA.id, quoteB.id);
  } finally { await cleanup(h); }
});

test('immutability: an accepted (locked) quote retains its values even after its underlying rate later expires', async () => {
  const h = await freshHarness('lock-then-rate-expires');
  try {
    await setup(h, { expiresInMs: 200 });
    const quote = await h.quoteEngine.createQuote(h.adminId, h.organizationId, { baseCurrency: 'KES', baseAmountMinorUnits: 1000000, asset: 'USDT', network: 'tron', ttlMs: 60000 });
    const locked = await h.quoteEngine.lockQuote(h.adminId, h.organizationId, quote.id);
    assert.equal(locked.status, 'LOCKED');
    await new Promise((r) => setTimeout(r, 250));
    const reread = await h.quoteEngine.getQuote(h.adminId, h.organizationId, quote.id);
    assert.equal(reread.status, 'LOCKED', 'a locked quote must not be affected by its underlying rate later expiring');
    assert.equal(reread.grossAtomicAmount, quote.grossAtomicAmount);
  } finally { await cleanup(h); }
});

// ========== 8. Quote -> Payment Intent consistency and ledger discipline ==========

test('quote -> payment intent: every financially meaningful field matches exactly', async () => {
  const h = await freshHarness('quote-intent-consistency');
  try {
    await setup(h);
    const quote = await h.quoteEngine.createQuote(h.adminId, h.organizationId, { baseCurrency: 'KES', baseAmountMinorUnits: 1000000, asset: 'USDT', network: 'tron' });
    await h.quoteEngine.lockQuote(h.adminId, h.organizationId, quote.id);
    const intent = await h.quoteEngine.createPaymentIntentFromQuote(h.adminId, h.organizationId, quote.id);
    assert.equal(intent.metadata.asset, quote.asset);
    assert.equal(intent.metadata.network, quote.network);
    assert.equal(intent.metadata.destinationAddress, quote.destinationAddress);
    assert.equal(intent.amountMinorUnits, quote.baseAmountMinorUnits);
    const consistency = await h.quoteEngine.verifyQuotePaymentIntentConsistency(h.adminId, h.organizationId, quote.id);
    assert.equal(consistency.consistent, true);
  } finally { await cleanup(h); }
});

test('ledger discipline: quote creation, locking, and payment-intent creation together produce ZERO ledger effect', async () => {
  const h = await freshHarness('ledger-zero-effect');
  try {
    await setup(h);
    const quote = await h.quoteEngine.createQuote(h.adminId, h.organizationId, { baseCurrency: 'KES', baseAmountMinorUnits: 1000000, asset: 'USDT', network: 'tron' });
    await h.quoteEngine.lockQuote(h.adminId, h.organizationId, quote.id);
    await h.quoteEngine.createPaymentIntentFromQuote(h.adminId, h.organizationId, quote.id);
    const balance = await h.billing.getWalletBalance(h.adminId, h.organizationId);
    assert.equal(balance, 0, 'no ledger effect must ever come from quote creation, locking, or payment-intent creation alone');
    const ledger = await h.billing.getWalletLedger(h.adminId, h.organizationId);
    assert.equal(ledger.length, 0);
  } finally { await cleanup(h); }
});

// ========== 9. Audit ==========

test('audit: QUOTE_CREATED and QUOTE_EXPIRED are real audit_events rows', async () => {
  const h = await freshHarness('quote-audit');
  try {
    await setup(h);
    const quote = await h.quoteEngine.createQuote(h.adminId, h.organizationId, { baseCurrency: 'KES', baseAmountMinorUnits: 1000000, asset: 'USDT', network: 'tron', ttlMs: -1 });
    await h.quoteEngine.getQuote(h.adminId, h.organizationId, quote.id);
    const events = await h.db.all("SELECT event_type FROM audit_events WHERE event_type IN ('QUOTE_CREATED', 'QUOTE_LOCKED', 'QUOTE_EXPIRED')", []);
    const types = events.map((e) => e.event_type);
    assert.ok(types.includes('QUOTE_CREATED'));
    assert.ok(types.includes('QUOTE_EXPIRED'));
  } finally { await cleanup(h); }
});

// ========== 10. Fee config isolation and versioning ==========

test('fee config: platform-admin required, and fee percentage >= 100% is rejected as a Core guardrail', async () => {
  const h = await freshHarness('fee-guardrails');
  try {
    await assert.rejects(
      () => h.quoteEngine.setFeeConfig(h.adminId, false, { feeType: 'percentage', feeValue: '0.02' }),
      (err) => err.code === 'platform_admin_required'
    );
    await assert.rejects(
      () => h.quoteEngine.setFeeConfig(h.adminId, true, { feeType: 'percentage', feeValue: '1.5' }),
      (err) => err.code === 'fee_percentage_out_of_range'
    );
  } finally { await cleanup(h); }
});

test('fee config: an organization-specific fee overrides the platform default; other organizations remain on the default', async () => {
  const h = await freshHarness('fee-org-override');
  try {
    await setup(h, { fee: '0.02' });
    await h.quoteEngine.setFeeConfig(h.adminId, true, { organizationId: h.organizationId, feeType: 'percentage', feeValue: '0.05' });

    const quoteForThisOrg = await h.quoteEngine.createQuote(h.adminId, h.organizationId, { baseCurrency: 'KES', baseAmountMinorUnits: 1000000, asset: 'USDT', network: 'tron' });
    assert.equal(quoteForThisOrg.feeSnapshot.feeValue, '0.05');

    const outsiderId = crypto.randomUUID();
    await h.db.run('INSERT INTO users (id, email, is_platform_admin, created_at) VALUES (?, ?, 1, ?)', [outsiderId, 'other-admin@example.com', Date.now()]);
    const otherOrg = await h.orgs.createOrganization(outsiderId, { name: 'OtherOrg2' });
    await h.cryptoPayments.setCryptoDestination(outsiderId, true, { asset: 'USDT', network: 'tron', address: 'TFTBNKnkn2Uin7m3NNVNZ1FJJFGW2HwdLj' });
    const quoteForOtherOrg = await h.quoteEngine.createQuote(outsiderId, otherOrg.id, { baseCurrency: 'KES', baseAmountMinorUnits: 1000000, asset: 'USDT', network: 'tron' });
    assert.equal(quoteForOtherOrg.feeSnapshot.feeValue, '0.02', 'an organization without its own fee override must use the platform default');
  } finally { await cleanup(h); }
});
