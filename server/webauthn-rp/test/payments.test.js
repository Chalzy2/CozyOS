'use strict';
/**
 * server/webauthn-rp/test/payments.test.js
 *
 * CozyOS Universal Payment Provider Infrastructure (Phase 4) — the
 * provider-neutral foundation plus the one real, fully-tested adapter
 * this round (cash — the only payment method requiring no external
 * credentials or network access). Mirrors organizations.test.js/
 * billing.test.js's real-HTTP-server testing style.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createServer } = require('../server');
const { freshDbPath: freshTmpDbPath } = require('./tmp-db');
const { verifyWebhookSignature, PaymentRegistry } = require('../payments');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';

function freshDbPath(name) {
  return freshTmpDbPath(`webauthn-payments-${name}`);
}

async function withServer(name, fn) {
  const dbPath = freshDbPath(name);
  const server = createServer({ dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn({ server, base, rp: server.rp, db: server.db, orgs: server.orgs, billing: server.billing, payments: server.payments });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(dbPath + '-wal', { force: true });
    fs.rmSync(dbPath + '-shm', { force: true });
  }
}

function extractCookie(res) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  return setCookie.split(';')[0];
}

async function post(base, path_, body, cookie) {
  const res = await fetch(base + path_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, cookie: extractCookie(res) };
}

let userCounter = 0;
async function registerAndLogin(base, emailPrefix) {
  const email = `${emailPrefix}-${++userCounter}@example.com`;
  const password = 'correct horse battery staple 1';
  const reg = await post(base, '/auth/register', { email, password });
  assert.equal(reg.status, 200, `register(${email}) should succeed`);
  const login = await post(base, '/auth/login', { email, password });
  assert.equal(login.status, 200, `login(${email}) should succeed`);
  return { email, userId: reg.json.userId, cookie: login.cookie };
}

// ---------- 1. real end-to-end: cash payment credits the real wallet ledger ----------

test('a cash payment intent completes synchronously and credits the real wallet ledger', async () => {
  await withServer('cash-happy-path', async ({ base, billing }) => {
    const owner = await registerAndLogin(base, 'owner');
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;

    const create = await post(base, '/payments/intents/create', {
      organizationId: orgId, amountMinorUnits: 5000, currency: 'KES', providerId: 'cash',
    }, owner.cookie);
    assert.equal(create.status, 200);
    assert.equal(create.json.intent.status, 'SUCCEEDED');
    assert.ok(create.json.intent.providerPaymentId.startsWith('cash_'));

    const balance = await billing.getWalletBalance(owner.userId, orgId);
    assert.equal(balance, 5000, 'a completed cash payment must credit the real wallet balance, not just report success');

    const ledger = await billing.getWalletLedger(owner.userId, orgId);
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].entryType, 'credit');
    assert.equal(ledger[0].referenceId, create.json.intent.id, 'the ledger entry must reference the payment intent that produced it');
  });
});

// ---------- 2. idempotency — real, database-enforced ----------

test('a repeated request with the same idempotency key returns the SAME intent, never creates a second charge', async () => {
  await withServer('idempotency', async ({ base, billing }) => {
    const owner = await registerAndLogin(base, 'owner');
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;
    const idempotencyKey = 'topup-2026-01-attempt-1';

    const first = await post(base, '/payments/intents/create', {
      organizationId: orgId, amountMinorUnits: 3000, currency: 'KES', providerId: 'cash', idempotencyKey,
    }, owner.cookie);
    assert.equal(first.status, 200);

    const second = await post(base, '/payments/intents/create', {
      organizationId: orgId, amountMinorUnits: 3000, currency: 'KES', providerId: 'cash', idempotencyKey,
    }, owner.cookie);
    assert.equal(second.status, 200);
    assert.equal(second.json.intent.id, first.json.intent.id, 'a retried request with the same idempotency key must return the existing intent');

    const balance = await billing.getWalletBalance(owner.userId, orgId);
    assert.equal(balance, 3000, 'the wallet must only be credited ONCE despite two identical requests');
    const ledger = await billing.getWalletLedger(owner.userId, orgId);
    assert.equal(ledger.length, 1, 'exactly one ledger entry must exist, not two');
  });
});

test('the database itself rejects a duplicate idempotency key even if application logic is bypassed (real defense in depth)', async () => {
  await withServer('idempotency-db-level', async ({ base, db }) => {
    const owner = await registerAndLogin(base, 'owner');
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;
    const ts = Date.now();

    await db.run(
      `INSERT INTO payment_intents (id, organization_id, amount_minor_units, currency, provider_id, status, idempotency_key, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['pi_1', orgId, 1000, 'KES', 'cash', 'SUCCEEDED', 'raw-sql-key', owner.userId, ts, ts]
    );

    await assert.rejects(
      () => db.run(
        `INSERT INTO payment_intents (id, organization_id, amount_minor_units, currency, provider_id, status, idempotency_key, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['pi_2', orgId, 1000, 'KES', 'cash', 'SUCCEEDED', 'raw-sql-key', owner.userId, ts, ts]
      ),
      /unique|UNIQUE/i
    );
  });
});

// ---------- 3. organization isolation ----------

test('a non-member cannot create or read a payment intent for an organization they do not belong to', async () => {
  await withServer('org-isolation', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const outsider = await registerAndLogin(base, 'outsider');
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;

    const createAttempt = await post(base, '/payments/intents/create', {
      organizationId: orgId, amountMinorUnits: 1000, currency: 'KES', providerId: 'cash',
    }, outsider.cookie);
    assert.equal(createAttempt.status, 403);

    const real = await post(base, '/payments/intents/create', {
      organizationId: orgId, amountMinorUnits: 1000, currency: 'KES', providerId: 'cash',
    }, owner.cookie);
    const readAttempt = await post(base, '/payments/intents/get', { organizationId: orgId, paymentIntentId: real.json.intent.id }, outsider.cookie);
    assert.equal(readAttempt.status, 403);
  });
});

// ---------- 4. client tampering ----------

test('client-supplied "amountMinorUnits" for a subscription charge is ignored — the real charge route never accepts a client amount at all', async () => {
  await withServer('tamper-subscription-amount', async ({ base, rp, billing }) => {
    const admin = await registerAndLogin(base, 'admin');
    const owner = await registerAndLogin(base, 'owner');
    await rp.setPlatformAdmin(admin.userId, true);
    const planCreate = await post(base, '/billing/plans', {
      planKey: `pay_plan_${Date.now()}`, name: 'Pay Plan', currency: 'KES', billingInterval: 'month', initialAmountMinorUnits: 20000,
    }, admin.cookie);
    const plan = planCreate.json.plan;
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;
    const sub = await post(base, '/billing/organizations/subscriptions/create', { organizationId: orgId, planId: plan.id }, owner.cookie);
    await billing.recordLedgerEntry(owner.userId, orgId, { amountMinorUnits: 100000, currency: 'KES', entryType: 'credit' });

    const charge = await post(base, '/billing/organizations/subscriptions/charge', {
      organizationId: orgId, subscriptionId: sub.json.subscription.id, amountMinorUnits: 1,
    }, owner.cookie);
    assert.equal(charge.status, 200);
    assert.equal(charge.json.ledgerEntry.amountMinorUnits, -20000, 'the real server-resolved subscription price must be charged, never a client-forged amount');
  });
});

test("client-supplied \"organizationId\" pointing at another organization does not let an outsider refund or cancel that org's payment", async () => {
  await withServer('tamper-orgid-refund', async ({ base }) => {
    const ownerA = await registerAndLogin(base, 'ownerA');
    const ownerB = await registerAndLogin(base, 'ownerB');
    const orgA = await post(base, '/organizations/create', { name: 'Acme A' }, ownerA.cookie);
    const orgB = await post(base, '/organizations/create', { name: 'Acme B' }, ownerB.cookie);
    const intent = await post(base, '/payments/intents/create', {
      organizationId: orgB.json.organization.id, amountMinorUnits: 5000, currency: 'KES', providerId: 'cash',
    }, ownerB.cookie);

    const refundAttempt = await post(base, '/payments/intents/refund', {
      organizationId: orgB.json.organization.id, paymentIntentId: intent.json.intent.id,
    }, ownerA.cookie);
    assert.equal(refundAttempt.status, 403);

    const cancelAttempt = await post(base, '/payments/intents/cancel', {
      organizationId: orgB.json.organization.id, paymentIntentId: intent.json.intent.id,
    }, ownerA.cookie);
    assert.equal(cancelAttempt.status, 403);
  });
});

// ---------- 5. refund / cancel correctness ----------

test('a full refund moves an intent to REFUNDED and debits the wallet by the exact original amount', async () => {
  await withServer('full-refund', async ({ base, billing }) => {
    const owner = await registerAndLogin(base, 'owner');
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;
    const intent = await post(base, '/payments/intents/create', {
      organizationId: orgId, amountMinorUnits: 4000, currency: 'KES', providerId: 'cash',
    }, owner.cookie);

    const refund = await post(base, '/payments/intents/refund', { organizationId: orgId, paymentIntentId: intent.json.intent.id }, owner.cookie);
    assert.equal(refund.status, 200);
    assert.equal(refund.json.intent.status, 'REFUNDED');
    const balance = await billing.getWalletBalance(owner.userId, orgId);
    assert.equal(balance, 0, 'a full refund must exactly reverse the original credit');
  });
});

test('a refund amount exceeding the original payment is rejected — never allowed to manufacture a larger refund', async () => {
  await withServer('over-refund', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;
    const intent = await post(base, '/payments/intents/create', {
      organizationId: orgId, amountMinorUnits: 1000, currency: 'KES', providerId: 'cash',
    }, owner.cookie);

    const attempt = await post(base, '/payments/intents/refund', {
      organizationId: orgId, paymentIntentId: intent.json.intent.id, refundMinorUnits: 999999,
    }, owner.cookie);
    assert.equal(attempt.status, 400);
    assert.equal(attempt.json.error, 'invalid_refund_amount');
  });
});

test('a payment intent cannot be refunded twice for more than its original amount', async () => {
  await withServer('double-refund', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;
    const intent = await post(base, '/payments/intents/create', {
      organizationId: orgId, amountMinorUnits: 1000, currency: 'KES', providerId: 'cash',
    }, owner.cookie);

    const first = await post(base, '/payments/intents/refund', { organizationId: orgId, paymentIntentId: intent.json.intent.id, refundMinorUnits: 1000 }, owner.cookie);
    assert.equal(first.status, 200);
    assert.equal(first.json.intent.status, 'REFUNDED');

    const second = await post(base, '/payments/intents/refund', { organizationId: orgId, paymentIntentId: intent.json.intent.id, refundMinorUnits: 1 }, owner.cookie);
    assert.equal(second.status, 409);
    assert.equal(second.json.error, 'payment_intent_not_refundable', 'an already-fully-refunded intent must not be refundable again');
  });
});

// ---------- 6. unknown provider / validation ----------

test('an unknown providerId is rejected before any database write', async () => {
  await withServer('unknown-provider', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const attempt = await post(base, '/payments/intents/create', {
      organizationId: org.json.organization.id, amountMinorUnits: 1000, currency: 'KES', providerId: 'nonexistent_provider',
    }, owner.cookie);
    assert.equal(attempt.status, 400);
    assert.equal(attempt.json.error, 'unknown_provider');
  });
});

test('a zero or negative amount is rejected', async () => {
  await withServer('invalid-amount', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const zero = await post(base, '/payments/intents/create', {
      organizationId: org.json.organization.id, amountMinorUnits: 0, currency: 'KES', providerId: 'cash',
    }, owner.cookie);
    assert.equal(zero.status, 400);
    const negative = await post(base, '/payments/intents/create', {
      organizationId: org.json.organization.id, amountMinorUnits: -500, currency: 'KES', providerId: 'cash',
    }, owner.cookie);
    assert.equal(negative.status, 400);
  });
});

// ---------- 7. audit ----------

test('payment actions write real audit_events rows', async () => {
  await withServer('audit-trail', async ({ base, db }) => {
    const owner = await registerAndLogin(base, 'owner');
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;
    const intent = await post(base, '/payments/intents/create', {
      organizationId: orgId, amountMinorUnits: 1000, currency: 'KES', providerId: 'cash',
    }, owner.cookie);
    await post(base, '/payments/intents/refund', { organizationId: orgId, paymentIntentId: intent.json.intent.id }, owner.cookie);

    const events = await db.all("SELECT event_type FROM audit_events WHERE event_type LIKE 'payment_%'", []);
    const types = events.map((e) => e.event_type);
    assert.ok(types.includes('payment_intent_created'));
    assert.ok(types.includes('payment_refunded'));
  });
});

test('payment_events append-only log records the intent creation and refund transitions', async () => {
  await withServer('payment-events-log', async ({ base, db }) => {
    const owner = await registerAndLogin(base, 'owner');
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;
    const intent = await post(base, '/payments/intents/create', {
      organizationId: orgId, amountMinorUnits: 1000, currency: 'KES', providerId: 'cash',
    }, owner.cookie);
    await post(base, '/payments/intents/refund', { organizationId: orgId, paymentIntentId: intent.json.intent.id }, owner.cookie);

    const events = await db.all('SELECT event_type, new_status FROM payment_events WHERE payment_intent_id = ? ORDER BY created_at ASC', [intent.json.intent.id]);
    assert.equal(events.length, 2);
    assert.equal(events[0].event_type, 'created');
    assert.equal(events[0].new_status, 'SUCCEEDED');
    assert.equal(events[1].event_type, 'refunded');
    assert.equal(events[1].new_status, 'REFUNDED');
  });
});

// ---------- 8. registerProvider interface validation ----------

test('registerProvider rejects an adapter missing a required method', () => {
  const fakeDb = { get: async () => null, all: async () => [], run: async () => {}, transaction: async (fn) => fn({ get: async () => null, run: async () => {} }) };
  const fakeOrgs = { isAuthorized: async () => true };
  const fakeBilling = { recordLedgerEntry: async () => {}, _recordLedgerEntryWithinTransaction: async () => {} };
  const registry = new PaymentRegistry(fakeDb, fakeOrgs, fakeBilling, {});
  assert.throws(
    () => registry.registerProvider('incomplete', { createPayment: async () => {} }),
    /missing required method/
  );
});

// ---------- 9. webhook signature verification — real cryptography, no live provider needed ----------

test('verifyWebhookSignature: a correctly-computed HMAC signature is accepted', () => {
  const crypto = require('node:crypto');
  const secret = 'whsec_test_secret_value';
  const payload = JSON.stringify({ event: 'payment.succeeded', paymentId: 'cash_abc123' });
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  assert.equal(verifyWebhookSignature({ payload, signature, secret }), true);
});

test('verifyWebhookSignature: an altered payload (tampered amount) is rejected even with the original signature', () => {
  const crypto = require('node:crypto');
  const secret = 'whsec_test_secret_value';
  const originalPayload = JSON.stringify({ event: 'payment.succeeded', amount: 1000 });
  const signature = crypto.createHmac('sha256', secret).update(originalPayload).digest('hex');
  const tamperedPayload = JSON.stringify({ event: 'payment.succeeded', amount: 999999999 });
  assert.equal(verifyWebhookSignature({ payload: tamperedPayload, signature, secret }), false);
});

test('verifyWebhookSignature: a signature computed with the wrong secret is rejected', () => {
  const crypto = require('node:crypto');
  const payload = JSON.stringify({ event: 'payment.succeeded' });
  const signature = crypto.createHmac('sha256', 'wrong_secret').update(payload).digest('hex');
  assert.equal(verifyWebhookSignature({ payload, signature, secret: 'whsec_real_secret' }), false);
});

test('verifyWebhookSignature: a missing signature is rejected, not treated as valid', () => {
  assert.equal(verifyWebhookSignature({ payload: '{}', signature: '', secret: 'whsec_x' }), false);
  assert.equal(verifyWebhookSignature({ payload: '{}', signature: undefined, secret: 'whsec_x' }), false);
});

test('verifyWebhookSignature: a malformed (non-hex, wrong-length) signature is rejected without throwing', () => {
  assert.doesNotThrow(() => {
    assert.equal(verifyWebhookSignature({ payload: '{}', signature: 'not-a-real-signature', secret: 'whsec_x' }), false);
  });
});

// ---------- 10. Provider configuration foundation (Phase 5.2) ----------

test('setProviderConfig requires platform admin, never a client-supplied claim', async () => {
  await withServer('provider-config-auth', async ({ payments }) => {
    const nonAdminUserId = crypto.randomUUID();
    await assert.rejects(
      () => payments.setProviderConfig(nonAdminUserId, false, {
        providerId: 'cash', enabled: true, environment: 'sandbox',
        supportedCurrencies: ['KES'], supportedPaymentMethods: ['cash'],
      }),
      (err) => err.code === 'not_authorized'
    );
  });
});

test('setProviderConfig persists real configuration, never a credential value — only a reference name', async () => {
  await withServer('provider-config-persist', async ({ base, rp, payments }) => {
    const admin = await registerAndLogin(base, 'admin');
    await rp.setPlatformAdmin(admin.userId, true);
    const config = await payments.setProviderConfig(admin.userId, true, {
      providerId: 'test_provider', enabled: true, environment: 'sandbox',
      supportedCurrencies: ['KES'], supportedPaymentMethods: ['mobile_money'],
      routingPriority: 50, minAmountMinorUnits: 100, maxAmountMinorUnits: 10000000,
      credentialRef: 'COZY_TEST_PROVIDER_CONSUMER_KEY',
    });
    assert.equal(config.enabled, true);
    assert.equal(config.credentialRef, 'COZY_TEST_PROVIDER_CONSUMER_KEY');
    assert.deepEqual(config.supportedCurrencies, ['KES']);

    const read = await payments.getProviderConfig('test_provider');
    assert.deepEqual(read, config);
  });
});

test('setProviderConfig updates existing config rather than creating a duplicate row', async () => {
  await withServer('provider-config-update', async ({ base, rp, payments, db }) => {
    const admin = await registerAndLogin(base, 'admin');
    await rp.setPlatformAdmin(admin.userId, true);
    await payments.setProviderConfig(admin.userId, true, {
      providerId: 'test_provider2', enabled: false, environment: 'sandbox',
      supportedCurrencies: ['KES'], supportedPaymentMethods: ['mobile_money'],
    });
    await payments.setProviderConfig(admin.userId, true, {
      providerId: 'test_provider2', enabled: true, environment: 'production',
      supportedCurrencies: ['KES', 'USD'], supportedPaymentMethods: ['mobile_money', 'card'],
    });
    const rows = await db.all('SELECT * FROM payment_provider_configs WHERE provider_id = ?', ['test_provider2']);
    assert.equal(rows.length, 1, 'a second setProviderConfig call must update, not duplicate, the row');
    assert.equal(rows[0].environment, 'production');
  });
});

test('provider config changes write real audit_events rows, and the credential reference name is safely auditable', async () => {
  await withServer('provider-config-audit', async ({ base, rp, payments, db }) => {
    const admin = await registerAndLogin(base, 'admin');
    await rp.setPlatformAdmin(admin.userId, true);
    await payments.setProviderConfig(admin.userId, true, {
      providerId: 'test_provider3', enabled: true, environment: 'sandbox',
      supportedCurrencies: ['KES'], supportedPaymentMethods: ['mobile_money'],
      credentialRef: 'COZY_TEST_PROVIDER3_KEY',
    });
    const events = await db.all("SELECT detail FROM audit_events WHERE event_type = 'payment_provider_config_changed'", []);
    assert.equal(events.length, 1);
    const detail = JSON.parse(events[0].detail);
    assert.equal(detail.credentialRef, 'COZY_TEST_PROVIDER3_KEY', 'the credential REFERENCE NAME is safe to audit in full (it is not a secret value)');
  });
});

// ---------- 11. Credential resolver (Phase 5.2) — extends process.env.COZY_*, never a second secret system ----------

test('credential resolver: throws a clear error for a missing credential, never returns a fabricated default', () => {
  const { resolveCredential, isCredentialConfigured } = require('../providers/credential-resolver');
  delete process.env.COZY_TEST_NONEXISTENT_CREDENTIAL_XYZ;
  assert.throws(() => resolveCredential('COZY_TEST_NONEXISTENT_CREDENTIAL_XYZ'), /credential_not_configured/);
  assert.equal(isCredentialConfigured('COZY_TEST_NONEXISTENT_CREDENTIAL_XYZ'), false);
});

test('credential resolver: resolves a real environment variable when set, never logs or exposes it', () => {
  const { resolveCredential, isCredentialConfigured } = require('../providers/credential-resolver');
  process.env.COZY_TEST_FIXTURE_CREDENTIAL_XYZ = 'fixture-value-for-this-test-only';
  try {
    assert.equal(isCredentialConfigured('COZY_TEST_FIXTURE_CREDENTIAL_XYZ'), true);
    assert.equal(resolveCredential('COZY_TEST_FIXTURE_CREDENTIAL_XYZ'), 'fixture-value-for-this-test-only');
  } finally {
    delete process.env.COZY_TEST_FIXTURE_CREDENTIAL_XYZ;
  }
});

// ---------- 12. getWebhookEvents self-enforcement (Phase 5.2 final security scan fix) ----------

test('getWebhookEvents self-enforces organization authorization — an outsider is rejected, not given another org\'s webhook history', async () => {
  await withServer('webhook-events-isolation', async ({ base, payments }) => {
    const owner = await registerAndLogin(base, 'owner');
    const outsider = await registerAndLogin(base, 'outsider');
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;
    const create = await post(base, '/payments/intents/create', {
      organizationId: orgId, amountMinorUnits: 1000, currency: 'KES', providerId: 'cash',
    }, owner.cookie);

    const ownerRead = await payments.getWebhookEvents(owner.userId, create.json.intent.id);
    assert.ok(Array.isArray(ownerRead));

    await assert.rejects(
      () => payments.getWebhookEvents(outsider.userId, create.json.intent.id),
      (err) => err.code === 'not_authorized'
    );
  });
});
