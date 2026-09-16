'use strict';
/**
 * server/webauthn-rp/test/crypto-payments.test.js
 *
 * CozyOS Crypto Payment Foundation (Phase 5.3). All results in this
 * file are TESTED/VERIFIED against real local infrastructure (real
 * SQLite, real transactions, real crypto/HMAC) — nothing here is REAL
 * RUNTIME blockchain verification, which remains BLOCKED (no real
 * provider/RPC credentials or network access exist in this
 * environment). The test-only blockchain verifier
 * (test-only-blockchain-verifier.js) is an in-memory fixture, never a
 * real chain connection.
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
const { CryptoPaymentRegistry, validateAddressAgainstFormat } = require('../crypto-payments');
const { createCryptoProviderAdapter } = require('../providers/crypto-provider');
const { createTestOnlyBlockchainVerifier } = require('./test-only-blockchain-verifier');

async function freshHarness(prefix) {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), `crypto-${prefix}-`)), 'x.sqlite');
  const db = new SQLiteDatabaseAdapter(openDb(dbPath));
  const orgs = new OrganizationRegistry(db, {});
  const billing = new BillingRegistry(db, orgs, {});
  const payments = new PaymentRegistry(db, orgs, billing, {});
  const secret = crypto.randomBytes(32).toString('hex');
  payments.registerProvider('crypto', createCryptoProviderAdapter({ internalEventSecret: secret }));
  const cryptoPayments = new CryptoPaymentRegistry(db, orgs, payments, { internalEventSecret: secret });
  await cryptoPayments.seedDefaultNetworkAssetRules();

  const adminId = crypto.randomUUID();
  const ts = Date.now();
  await db.run('INSERT INTO users (id, email, is_platform_admin, created_at) VALUES (?, ?, 1, ?)', [adminId, `${prefix}-${crypto.randomUUID()}@example.com`, ts]);
  const org = await orgs.createOrganization(adminId, { name: `CryptoOrg-${prefix}` });
  return { db, orgs, billing, payments, cryptoPayments, adminId, organizationId: org.id, dbPath };
}

async function cleanup(h) {
  await h.db.close();
  fs.rmSync(h.dbPath, { force: true });
}

async function setupUsdtTron(h, { requiredConfirmations = 1, rate = '0.0077' } = {}) {
  await h.cryptoPayments.setCryptoDestination(h.adminId, true, { asset: 'USDT', network: 'tron', address: 'TFTBNKnkn2Uin7m3NNVNZ1FJJFGW2HwdLj' });
  await h.cryptoPayments.setConfirmationPolicy(h.adminId, true, { network: 'tron', requiredConfirmations });
  await h.cryptoPayments.setExchangeRate(h.adminId, true, { baseCurrency: 'KES', quoteAsset: 'USDT', rate, source: 'test_fixture', rateType: 'TEST_RATE_PROVIDER' });
  return h.cryptoPayments.getActiveDestination(h.organizationId, 'USDT', 'tron');
}

// ========== 1. Asset/network validation — the core Bitcoin/BSC fix ==========

test('asset/network: the exact historical defect (Bitcoin labeled BSC, 0x-format address) is rejected', async () => {
  const h = await freshHarness('btc-bsc-defect');
  try {
    await assert.rejects(
      () => h.cryptoPayments.setCryptoDestination(h.adminId, true, { asset: 'BTC', network: 'bsc', address: '0x2545509dbe9fa7e19af80352238281ba3391f781' }),
      (err) => err.code === 'invalid_asset_network_combination'
    );
  } finally { await cleanup(h); }
});

test('asset/network: valid combinations from the source (USDT/TRON, BTC/bitcoin, BTC native segwit, SOL, BNB/BSC, MATIC/Polygon) all activate correctly', async () => {
  const h = await freshHarness('valid-combos');
  try {
    const cases = [
      ['USDT', 'tron', 'TFTBNKnkn2Uin7m3NNVNZ1FJJFGW2HwdLj'],
      ['BTC', 'bitcoin', '155RvL7q8XxAuVUzZuVN2M8VCQ53AvF4YU'],
      ['BTC', 'bitcoin_native_segwit', 'bc1qly9xuac6y2jly8ju9dr3mpjm3f542t84mpfn4s'],
      ['SOL', 'solana', 'AQGfDPuMZMXftpcTwYybBp18sdKEKn1Mes3Sq43iMJi8'],
      ['BNB', 'bsc', '0x2545509dbe9fa7e19af80352238281ba3391f781'],
      ['MATIC', 'polygon', '0x2545509dbe9fa7e19af80352238281ba3391f781'],
    ];
    for (const [asset, network, address] of cases) {
      const dest = await h.cryptoPayments.setCryptoDestination(h.adminId, true, { asset, network, address });
      assert.equal(dest.active, true, `${asset}/${network} should activate`);
    }
  } finally { await cleanup(h); }
});

test('asset/network: a completely unlisted combination is rejected', async () => {
  const h = await freshHarness('unlisted-combo');
  try {
    await assert.rejects(
      () => h.cryptoPayments.setCryptoDestination(h.adminId, true, { asset: 'DOGE', network: 'dogecoin', address: 'D5tRvJqXf7ARtnj23TVE28mF6uEmwm9BdY' }),
      (err) => err.code === 'invalid_asset_network_combination'
    );
  } finally { await cleanup(h); }
});

// ========== 2. Address validation ==========

test('address validation: malformed addresses are rejected even for a valid asset/network', async () => {
  const h = await freshHarness('malformed-address');
  try {
    await assert.rejects(
      () => h.cryptoPayments.setCryptoDestination(h.adminId, true, { asset: 'USDT', network: 'tron', address: 'not-a-real-address' }),
      (err) => err.code === 'address_format_invalid_for_network'
    );
    await assert.rejects(
      () => h.cryptoPayments.setCryptoDestination(h.adminId, true, { asset: 'BTC', network: 'bitcoin', address: '0x2545509dbe9fa7e19af80352238281ba3391f781' }),
      (err) => err.code === 'address_format_invalid_for_network'
    );
  } finally { await cleanup(h); }
});

test('address validation: an EVM address used for a bech32-only network (wrong network/address type) is rejected', async () => {
  const h = await freshHarness('wrong-address-type');
  try {
    await assert.rejects(
      () => h.cryptoPayments.setCryptoDestination(h.adminId, true, { asset: 'BTC', network: 'bitcoin_native_segwit', address: '0x2545509dbe9fa7e19af80352238281ba3391f781' }),
      (err) => err.code === 'address_format_invalid_for_network'
    );
  } finally { await cleanup(h); }
});

test('validateAddressAgainstFormat: unit-level correctness for every supported format', () => {
  assert.equal(validateAddressAgainstFormat('0x2545509dbe9fa7e19af80352238281ba3391f781', 'evm'), true);
  assert.equal(validateAddressAgainstFormat('0xShort', 'evm'), false);
  assert.equal(validateAddressAgainstFormat('155RvL7q8XxAuVUzZuVN2M8VCQ53AvF4YU', 'bitcoin_base58'), true);
  assert.equal(validateAddressAgainstFormat('bc1qly9xuac6y2jly8ju9dr3mpjm3f542t84mpfn4s', 'bitcoin_bech32'), true);
  assert.equal(validateAddressAgainstFormat('155RvL7q8XxAuVUzZuVN2M8VCQ53AvF4YU', 'bitcoin_bech32'), false);
  assert.equal(validateAddressAgainstFormat('TFTBNKnkn2Uin7m3NNVNZ1FJJFGW2HwdLj', 'tron_base58'), true);
  assert.equal(validateAddressAgainstFormat('AQGfDPuMZMXftpcTwYybBp18sdKEKn1Mes3Sq43iMJi8', 'solana_base58'), true);
});

// ========== 3. Payment intent — server-authoritative ==========

test('createCryptoPaymentIntent: is BLOCKED, never fabricated, when no exchange rate is configured', async () => {
  const h = await freshHarness('no-rate');
  try {
    await h.cryptoPayments.setCryptoDestination(h.adminId, true, { asset: 'USDT', network: 'tron', address: 'TFTBNKnkn2Uin7m3NNVNZ1FJJFGW2HwdLj' });
    await assert.rejects(
      () => h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 100000 }),
      (err) => err.code === 'exchange_rate_not_configured'
    );
  } finally { await cleanup(h); }
});

test('createCryptoPaymentIntent: refuses when no destination is configured, even for a genuinely valid asset/network', async () => {
  const h = await freshHarness('no-destination');
  try {
    await h.cryptoPayments.setExchangeRate(h.adminId, true, { baseCurrency: 'KES', quoteAsset: 'USDT', rate: '0.0077', source: 'test', rateType: 'TEST_RATE_PROVIDER' });
    await assert.rejects(
      () => h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 100000 }),
      (err) => err.code === 'no_active_destination_configured'
    );
  } finally { await cleanup(h); }
});

test('createCryptoPaymentIntent: server resolves destination and asset/network — the intent never trusts a client-supplied destination', async () => {
  const h = await freshHarness('server-authoritative');
  try {
    const dest = await setupUsdtTron(h);
    const intent = await h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 100000 });
    assert.equal(intent.metadata.destinationAddress, dest.address, 'the destination in the intent must be the real server-resolved one');
    assert.equal(intent.status, 'PENDING');
    assert.ok(intent.metadata.expiresAt > Date.now(), 'a real expiry must be set');
  } finally { await cleanup(h); }
});

test('createCryptoPaymentIntent: rejects a zero/negative amount', async () => {
  const h = await freshHarness('invalid-amount');
  try {
    await setupUsdtTron(h);
    await assert.rejects(() => h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 0 }));
  } finally { await cleanup(h); }
});

// ========== 4. Transaction verification — full battery ==========

test('transaction verification: correct transaction matching every field results in SUCCEEDED and exactly one ledger effect', async () => {
  const h = await freshHarness('correct-tx');
  try {
    const dest = await setupUsdtTron(h);
    const intent = await h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 77000 });
    const verifier = createTestOnlyBlockchainVerifier();
    verifier.seed('tron', 'txcorrect', { state: 'confirmed', network: 'tron', asset: 'USDT', destination: dest.address, amount: null, confirmations: 5 });
    const tx = await h.cryptoPayments.submitTransactionHash(h.adminId, h.organizationId, { paymentIntentId: intent.id, network: 'tron', transactionHash: 'txcorrect' });
    const verified = await h.cryptoPayments.verifyTransaction(h.adminId, h.organizationId, tx.id, verifier);
    assert.equal(verified.verificationStatus, 'VERIFIED_MATCH');
    const finalIntent = await h.payments.getPaymentIntent(h.adminId, h.organizationId, intent.id);
    assert.equal(finalIntent.status, 'SUCCEEDED');
    const ledger = await h.billing.getWalletLedger(h.adminId, h.organizationId);
    assert.equal(ledger.length, 1, 'exactly one ledger effect');
  } finally { await cleanup(h); }
});

test('transaction verification: wrong network is rejected, never accepted because the asset name matches', async () => {
  const h = await freshHarness('wrong-network');
  try {
    const dest = await setupUsdtTron(h);
    const intent = await h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 77000 });
    const verifier = createTestOnlyBlockchainVerifier();
    verifier.seed('tron', 'txwrongnet', { state: 'confirmed', network: 'bsc', asset: 'USDT', destination: dest.address, amount: null, confirmations: 5 });
    const tx = await h.cryptoPayments.submitTransactionHash(h.adminId, h.organizationId, { paymentIntentId: intent.id, network: 'tron', transactionHash: 'txwrongnet' });
    const verified = await h.cryptoPayments.verifyTransaction(h.adminId, h.organizationId, tx.id, verifier);
    assert.equal(verified.verificationStatus, 'VERIFIED_MISMATCH');
    assert.ok(verified.mismatchReason.includes('network_mismatch'));
    const finalIntent = await h.payments.getPaymentIntent(h.adminId, h.organizationId, intent.id);
    assert.notEqual(finalIntent.status, 'SUCCEEDED');
  } finally { await cleanup(h); }
});

test('transaction verification: wrong asset is rejected', async () => {
  const h = await freshHarness('wrong-asset');
  try {
    const dest = await setupUsdtTron(h);
    const intent = await h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 77000 });
    const verifier = createTestOnlyBlockchainVerifier();
    verifier.seed('tron', 'txwrongasset', { state: 'confirmed', network: 'tron', asset: 'SOME_OTHER_TOKEN', destination: dest.address, amount: null, confirmations: 5 });
    const tx = await h.cryptoPayments.submitTransactionHash(h.adminId, h.organizationId, { paymentIntentId: intent.id, network: 'tron', transactionHash: 'txwrongasset' });
    const verified = await h.cryptoPayments.verifyTransaction(h.adminId, h.organizationId, tx.id, verifier);
    assert.equal(verified.verificationStatus, 'VERIFIED_MISMATCH');
    assert.ok(verified.mismatchReason.includes('asset_mismatch'));
  } finally { await cleanup(h); }
});

test('transaction verification: wrong destination is rejected and safely recorded for reconciliation', async () => {
  const h = await freshHarness('wrong-destination');
  try {
    await setupUsdtTron(h);
    const intent = await h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 77000 });
    const verifier = createTestOnlyBlockchainVerifier();
    verifier.seed('tron', 'txwrongdest', { state: 'confirmed', network: 'tron', asset: 'USDT', destination: 'SOME_UNRELATED_ADDRESS', amount: null, confirmations: 5 });
    const tx = await h.cryptoPayments.submitTransactionHash(h.adminId, h.organizationId, { paymentIntentId: intent.id, network: 'tron', transactionHash: 'txwrongdest' });
    const verified = await h.cryptoPayments.verifyTransaction(h.adminId, h.organizationId, tx.id, verifier);
    assert.equal(verified.verificationStatus, 'VERIFIED_MISMATCH');
    assert.ok(verified.mismatchReason.includes('destination_mismatch'));
  } finally { await cleanup(h); }
});

test('transaction verification: underpayment is recorded as an explicit mismatch, never auto-marked successful', async () => {
  const h = await freshHarness('underpayment');
  try {
    const dest = await setupUsdtTron(h);
    const intent = await h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 77000 });
    // Manually attach a cryptoAmount to metadata to exercise the amount
    // check (createCryptoPaymentIntent leaves it null this round — see
    // BLOCKED section — so this test constructs the scenario directly
    // against the real verifyTransaction() logic).
    await h.db.run("UPDATE payment_intents SET metadata = json_set(metadata, '$.cryptoAmount', 100) WHERE id = ?", [intent.id]).catch(async () => {
      // SQLite build here may not support json_set — fall back to a full metadata rewrite.
      const row = await h.db.get('SELECT metadata FROM payment_intents WHERE id = ?', [intent.id]);
      const meta = JSON.parse(row.metadata);
      meta.cryptoAmount = 100;
      await h.db.run('UPDATE payment_intents SET metadata = ? WHERE id = ?', [JSON.stringify(meta), intent.id]);
    });
    const verifier = createTestOnlyBlockchainVerifier();
    verifier.seed('tron', 'txunder', { state: 'confirmed', network: 'tron', asset: 'USDT', destination: dest.address, amount: 95, confirmations: 5 });
    const tx = await h.cryptoPayments.submitTransactionHash(h.adminId, h.organizationId, { paymentIntentId: intent.id, network: 'tron', transactionHash: 'txunder' });
    const verified = await h.cryptoPayments.verifyTransaction(h.adminId, h.organizationId, tx.id, verifier);
    assert.equal(verified.verificationStatus, 'VERIFIED_MISMATCH');
    assert.ok(verified.mismatchReason.includes('underpayment'));
    const finalIntent = await h.payments.getPaymentIntent(h.adminId, h.organizationId, intent.id);
    assert.notEqual(finalIntent.status, 'SUCCEEDED', 'underpayment must never be automatically marked successful');
  } finally { await cleanup(h); }
});

test('transaction verification: overpayment is recorded as an explicit mismatch, never silently absorbed', async () => {
  const h = await freshHarness('overpayment');
  try {
    const dest = await setupUsdtTron(h);
    const intent = await h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 77000 });
    const row = await h.db.get('SELECT metadata FROM payment_intents WHERE id = ?', [intent.id]);
    const meta = JSON.parse(row.metadata);
    meta.cryptoAmount = 100;
    await h.db.run('UPDATE payment_intents SET metadata = ? WHERE id = ?', [JSON.stringify(meta), intent.id]);
    const verifier = createTestOnlyBlockchainVerifier();
    verifier.seed('tron', 'txover', { state: 'confirmed', network: 'tron', asset: 'USDT', destination: dest.address, amount: 110, confirmations: 5 });
    const tx = await h.cryptoPayments.submitTransactionHash(h.adminId, h.organizationId, { paymentIntentId: intent.id, network: 'tron', transactionHash: 'txover' });
    const verified = await h.cryptoPayments.verifyTransaction(h.adminId, h.organizationId, tx.id, verifier);
    assert.equal(verified.verificationStatus, 'VERIFIED_MISMATCH');
    assert.ok(verified.mismatchReason.includes('overpayment'));
    const balance = await h.billing.getWalletBalance(h.adminId, h.organizationId);
    assert.equal(balance, 0, 'no ledger effect from an unresolved overpayment');
  } finally { await cleanup(h); }
});

test('transaction verification: insufficient confirmations leaves the transaction PENDING_VERIFICATION, not a mismatch and not UNKNOWN', async () => {
  const h = await freshHarness('insufficient-confirmations');
  try {
    const dest = await setupUsdtTron(h, { requiredConfirmations: 12 });
    const intent = await h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 77000 });
    const verifier = createTestOnlyBlockchainVerifier();
    verifier.seed('tron', 'txfewconf', { state: 'confirmed', network: 'tron', asset: 'USDT', destination: dest.address, amount: null, confirmations: 2 });
    const tx = await h.cryptoPayments.submitTransactionHash(h.adminId, h.organizationId, { paymentIntentId: intent.id, network: 'tron', transactionHash: 'txfewconf' });
    const verified = await h.cryptoPayments.verifyTransaction(h.adminId, h.organizationId, tx.id, verifier);
    assert.equal(verified.verificationStatus, 'PENDING_VERIFICATION');
    assert.equal(verified.confirmations, 2);
  } finally { await cleanup(h); }
});

test('transaction verification: not-found transaction results in UNKNOWN, never FAILED', async () => {
  const h = await freshHarness('not-found');
  try {
    await setupUsdtTron(h);
    const intent = await h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 77000 });
    const verifier = createTestOnlyBlockchainVerifier(); // nothing seeded
    const tx = await h.cryptoPayments.submitTransactionHash(h.adminId, h.organizationId, { paymentIntentId: intent.id, network: 'tron', transactionHash: 'txneverseen' });
    const verified = await h.cryptoPayments.verifyTransaction(h.adminId, h.organizationId, tx.id, verifier);
    assert.equal(verified.verificationStatus, 'UNKNOWN');
  } finally { await cleanup(h); }
});

test('transaction verification: an RPC/network error during verification results in UNKNOWN, never FAILED or SUCCEEDED', async () => {
  const h = await freshHarness('rpc-error');
  try {
    const dest = await setupUsdtTron(h);
    const intent = await h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 77000 });
    const verifier = createTestOnlyBlockchainVerifier();
    verifier.seed('tron', 'txrpcerror', { rpcError: true, network: 'tron', asset: 'USDT', destination: dest.address });
    const tx = await h.cryptoPayments.submitTransactionHash(h.adminId, h.organizationId, { paymentIntentId: intent.id, network: 'tron', transactionHash: 'txrpcerror' });
    const verified = await h.cryptoPayments.verifyTransaction(h.adminId, h.organizationId, tx.id, verifier);
    assert.equal(verified.verificationStatus, 'UNKNOWN');
    const finalIntent = await h.payments.getPaymentIntent(h.adminId, h.organizationId, intent.id);
    assert.notEqual(finalIntent.status, 'FAILED');
    assert.notEqual(finalIntent.status, 'SUCCEEDED');
    const balance = await h.billing.getWalletBalance(h.adminId, h.organizationId);
    assert.equal(balance, 0);
  } finally { await cleanup(h); }
});

// ========== 5. Double-payment / replay protection ==========

test('double-payment: the same transaction hash cannot be submitted for two different payment intents', async () => {
  const h = await freshHarness('double-payment');
  try {
    await setupUsdtTron(h);
    const intentA = await h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 77000 });
    const intentB = await h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 77000 });
    await h.cryptoPayments.submitTransactionHash(h.adminId, h.organizationId, { paymentIntentId: intentA.id, network: 'tron', transactionHash: 'sharedhash' });
    await assert.rejects(
      () => h.cryptoPayments.submitTransactionHash(h.adminId, h.organizationId, { paymentIntentId: intentB.id, network: 'tron', transactionHash: 'sharedhash' }),
      (err) => err.code === 'transaction_already_submitted'
    );
  } finally { await cleanup(h); }
});

test('double-payment: the database itself rejects a duplicate (network, hash) pair even bypassing application logic', async () => {
  const h = await freshHarness('db-level-dedup');
  try {
    await setupUsdtTron(h);
    const intent = await h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 77000 });
    const ts = Date.now();
    await h.db.run(
      `INSERT INTO crypto_transactions (id, payment_intent_id, network, transaction_hash, verification_status, created_at) VALUES (?, ?, ?, ?, 'PENDING_VERIFICATION', ?)`,
      ['ctx1', intent.id, 'tron', 'rawsqlhash', ts]
    );
    await assert.rejects(
      () => h.db.run(
        `INSERT INTO crypto_transactions (id, payment_intent_id, network, transaction_hash, verification_status, created_at) VALUES (?, ?, ?, ?, 'PENDING_VERIFICATION', ?)`,
        ['ctx2', intent.id, 'tron', 'rawsqlhash', ts]
      ),
      /unique|UNIQUE/i
    );
  } finally { await cleanup(h); }
});

test('repeated confirmation/reconciliation calls on an already-resolved transaction are idempotent (no second ledger effect)', async () => {
  const h = await freshHarness('repeated-verification');
  try {
    const dest = await setupUsdtTron(h);
    const intent = await h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 77000 });
    const verifier = createTestOnlyBlockchainVerifier();
    verifier.seed('tron', 'txrepeat', { state: 'confirmed', network: 'tron', asset: 'USDT', destination: dest.address, amount: null, confirmations: 5 });
    const tx = await h.cryptoPayments.submitTransactionHash(h.adminId, h.organizationId, { paymentIntentId: intent.id, network: 'tron', transactionHash: 'txrepeat' });
    await h.cryptoPayments.verifyTransaction(h.adminId, h.organizationId, tx.id, verifier);
    const secondCall = await h.cryptoPayments.verifyTransaction(h.adminId, h.organizationId, tx.id, verifier);
    assert.equal(secondCall.verificationStatus, 'VERIFIED_MATCH');
    const ledger = await h.billing.getWalletLedger(h.adminId, h.organizationId);
    assert.equal(ledger.length, 1, 'a second verification call on an already-resolved transaction must not double-credit');
  } finally { await cleanup(h); }
});

// ========== 6. Security: client tampering ==========

test('security: client-supplied destination/network/asset in a transaction submission cannot override the payment intent\'s real record', async () => {
  const h = await freshHarness('tamper-submission');
  try {
    const dest = await setupUsdtTron(h);
    const intent = await h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 77000 });
    // The "claimed" fields are recorded for audit visibility only —
    // they are NEVER used as the authority in verifyTransaction(),
    // which always compares the real chain lookup against the
    // intent's own real metadata.
    const tx = await h.cryptoPayments.submitTransactionHash(h.adminId, h.organizationId, {
      paymentIntentId: intent.id, network: 'tron', transactionHash: 'txtamperclaims',
      claimedAmount: '999999999', claimedDestination: 'FORGED_ADDRESS', claimedAsset: 'FORGED_ASSET',
    });
    const verifier = createTestOnlyBlockchainVerifier();
    // Seed the REAL (honest) chain state, deliberately different from the claims above.
    verifier.seed('tron', 'txtamperclaims', { state: 'confirmed', network: 'tron', asset: 'USDT', destination: dest.address, amount: null, confirmations: 5 });
    const verified = await h.cryptoPayments.verifyTransaction(h.adminId, h.organizationId, tx.id, verifier);
    assert.equal(verified.verificationStatus, 'VERIFIED_MATCH', 'verification must use the real chain lookup, not the claimed fields');
  } finally { await cleanup(h); }
});

test('security: cross-organization payment access is denied — an outsider cannot submit a transaction against another org\'s intent', async () => {
  const h = await freshHarness('cross-org');
  try {
    await setupUsdtTron(h);
    const intent = await h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 77000 });
    const outsiderId = crypto.randomUUID();
    await h.db.run('INSERT INTO users (id, email, is_platform_admin, created_at) VALUES (?, ?, 0, ?)', [outsiderId, 'outsider@example.com', Date.now()]);
    const otherOrg = await h.orgs.createOrganization(outsiderId, { name: 'OutsiderOrg' });
    await assert.rejects(
      () => h.cryptoPayments.submitTransactionHash(outsiderId, otherOrg.id, { paymentIntentId: intent.id, network: 'tron', transactionHash: 'txcrossorg' }),
      (err) => err.code === 'payment_intent_not_found'
    );
  } finally { await cleanup(h); }
});

test('security: setCryptoDestination requires platform admin', async () => {
  const h = await freshHarness('dest-auth');
  try {
    await assert.rejects(
      () => h.cryptoPayments.setCryptoDestination(h.adminId, false, { asset: 'USDT', network: 'tron', address: 'TFTBNKnkn2Uin7m3NNVNZ1FJJFGW2HwdLj' }),
      (err) => err.code === 'platform_admin_required'
    );
  } finally { await cleanup(h); }
});

test('security: forged internal crypto event (wrong signature) is rejected by PaymentRegistry.processProviderEvent, cannot forge a SUCCEEDED status', async () => {
  const h = await freshHarness('forged-internal-event');
  try {
    await setupUsdtTron(h);
    const intent = await h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 77000 });
    const forgedPayload = JSON.stringify({ eventId: 'forged', providerPaymentId: intent.providerPaymentId, amountMinorUnits: intent.amountMinorUnits, currency: intent.currency, status: 'succeeded' });
    const result = await h.payments.processProviderEvent('crypto', forgedPayload, { 'x-crypto-internal-signature': 'not-a-real-signature' });
    assert.equal(result.applied, false);
    assert.equal(result.outcome, 'rejected_unverified');
    const finalIntent = await h.payments.getPaymentIntent(h.adminId, h.organizationId, intent.id);
    assert.notEqual(finalIntent.status, 'SUCCEEDED', 'a forged internal event must never succeed in crediting a payment');
  } finally { await cleanup(h); }
});

// ========== 7. Ledger — only an authoritative SUCCEEDED produces an effect ==========

test('ledger: PENDING/UNKNOWN/mismatch states never produce a ledger effect; only VERIFIED_MATCH does, exactly once', async () => {
  const h = await freshHarness('ledger-discipline');
  try {
    const dest = await setupUsdtTron(h);
    const intent = await h.cryptoPayments.createCryptoPaymentIntent(h.adminId, h.organizationId, { asset: 'USDT', network: 'tron', baseCurrency: 'KES', baseAmountMinorUnits: 77000 });
    assert.equal((await h.billing.getWalletLedger(h.adminId, h.organizationId)).length, 0, 'PENDING intent creation must produce zero ledger effect');

    const verifier = createTestOnlyBlockchainVerifier();
    verifier.seed('tron', 'txmismatch', { state: 'confirmed', network: 'tron', asset: 'USDT', destination: 'WRONG', amount: null, confirmations: 5 });
    const txMismatch = await h.cryptoPayments.submitTransactionHash(h.adminId, h.organizationId, { paymentIntentId: intent.id, network: 'tron', transactionHash: 'txmismatch' });
    await h.cryptoPayments.verifyTransaction(h.adminId, h.organizationId, txMismatch.id, verifier);
    assert.equal((await h.billing.getWalletLedger(h.adminId, h.organizationId)).length, 0, 'mismatch must produce zero ledger effect');

    verifier.seed('tron', 'txunknown', {}); // not seeded properly -> not_found -> UNKNOWN
    const txUnknown = await h.cryptoPayments.submitTransactionHash(h.adminId, h.organizationId, { paymentIntentId: intent.id, network: 'tron', transactionHash: 'txunknown2' });
    await h.cryptoPayments.verifyTransaction(h.adminId, h.organizationId, txUnknown.id, verifier);
    assert.equal((await h.billing.getWalletLedger(h.adminId, h.organizationId)).length, 0, 'UNKNOWN must produce zero ledger effect');

    verifier.seed('tron', 'txsucceed', { state: 'confirmed', network: 'tron', asset: 'USDT', destination: dest.address, amount: null, confirmations: 5 });
    const txSucceed = await h.cryptoPayments.submitTransactionHash(h.adminId, h.organizationId, { paymentIntentId: intent.id, network: 'tron', transactionHash: 'txsucceed' });
    await h.cryptoPayments.verifyTransaction(h.adminId, h.organizationId, txSucceed.id, verifier);
    assert.equal((await h.billing.getWalletLedger(h.adminId, h.organizationId)).length, 1, 'exactly one ledger effect after the real successful verification');
  } finally { await cleanup(h); }
});
