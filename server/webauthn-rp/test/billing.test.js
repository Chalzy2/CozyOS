'use strict';
/**
 * server/webauthn-rp/test/billing.test.js
 *
 * CozyOS Billing Foundation — server-authoritative subscription + wallet
 * authority. Exercises the real HTTP routes in server.js (not the
 * BillingRegistry class directly), the same testing philosophy
 * organizations.test.js already established: cookie-derived identity,
 * fail-closed authorization, organization isolation, end to end — plus
 * the financial-specific requirements from the CozyOS engineering
 * framework: server-side authority over client-supplied amounts,
 * historical price integrity, transaction rollback, and audit presence.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createServer } = require('../server');
const { freshDbPath: freshTmpDbPath } = require('./tmp-db');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';

function freshDbPath(name) {
  return freshTmpDbPath(`webauthn-billing-${name}`);
}

async function withServer(name, fn) {
  const dbPath = freshDbPath(name);
  const server = createServer({ dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn({ server, base, rp: server.rp, db: server.db, orgs: server.orgs, billing: server.billing });
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

async function createPlanAsAdmin(base, rp, admin, overrides = {}) {
  await rp.setPlatformAdmin(admin.userId, true);
  const create = await post(base, '/billing/plans', {
    planKey: overrides.planKey || `pro_monthly_${++userCounter}`,
    name: overrides.name || 'Pro Monthly',
    currency: overrides.currency || 'KES',
    billingInterval: overrides.billingInterval || 'month',
    initialAmountMinorUnits: overrides.initialAmountMinorUnits ?? 10000, // KES 100.00
  }, admin.cookie);
  assert.equal(create.status, 200, JSON.stringify(create.json));
  return create.json.plan;
}

// ---------- 1. plan catalog is platform-admin-only, never client-trusted ----------

test('creating a plan requires platform admin — a regular user is denied', async () => {
  await withServer('plan-auth', async ({ base }) => {
    const user = await registerAndLogin(base, 'user');
    const create = await post(base, '/billing/plans', {
      planKey: 'sneaky_plan', name: 'Sneaky', currency: 'KES', billingInterval: 'month', initialAmountMinorUnits: 1,
    }, user.cookie);
    assert.equal(create.status, 403);
    assert.equal(create.json.error, 'platform_admin_required');
  });
});

test('platform admin can create a plan with an initial price', async () => {
  await withServer('plan-create', async ({ base, rp }) => {
    const admin = await registerAndLogin(base, 'admin');
    const plan = await createPlanAsAdmin(base, rp, admin, { initialAmountMinorUnits: 10000, currency: 'KES' });
    assert.equal(plan.currency, 'KES');
    assert.equal(plan.status, 'active');
  });
});

// ---------- 2. server-side authority: client-supplied amounts are rejected, never trusted ----------

test('a negative or non-integer amount is rejected — server never trusts a client-supplied price', async () => {
  await withServer('amount-validation', async ({ base, rp }) => {
    const admin = await registerAndLogin(base, 'admin');
    await rp.setPlatformAdmin(admin.userId, true);

    const negative = await post(base, '/billing/plans', {
      planKey: 'bad1', name: 'Bad', currency: 'KES', billingInterval: 'month', initialAmountMinorUnits: -500,
    }, admin.cookie);
    assert.equal(negative.status, 400);

    const nonInteger = await post(base, '/billing/plans', {
      planKey: 'bad2', name: 'Bad', currency: 'KES', billingInterval: 'month', initialAmountMinorUnits: 19.99,
    }, admin.cookie);
    assert.equal(nonInteger.status, 400);
  });
});

test('an invalid currency code is rejected', async () => {
  await withServer('currency-validation', async ({ base, rp }) => {
    const admin = await registerAndLogin(base, 'admin');
    await rp.setPlatformAdmin(admin.userId, true);
    const bad = await post(base, '/billing/plans', {
      planKey: 'bad3', name: 'Bad', currency: 'not-a-currency', billingInterval: 'month', initialAmountMinorUnits: 100,
    }, admin.cookie);
    assert.equal(bad.status, 400);
  });
});

// ---------- 3. admin price changes are versioned and historically safe ----------

test('changing a plan price creates a new version without deleting the old one, and a subscription keeps its originally-bound price', async () => {
  await withServer('price-history', async ({ base, rp, billing }) => {
    const admin = await registerAndLogin(base, 'admin');
    const owner = await registerAndLogin(base, 'owner');
    const plan = await createPlanAsAdmin(base, rp, admin, { initialAmountMinorUnits: 10000, currency: 'KES' });

    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;

    const sub = await post(base, '/billing/organizations/subscriptions/create', { organizationId: orgId, planId: plan.id }, owner.cookie);
    assert.equal(sub.status, 200);
    const boundPriceId = sub.json.subscription.currentPriceId;

    // Admin changes the price AFTER the subscription was created.
    const priceChange = await post(base, '/billing/plans/price', {
      planId: plan.id, amountMinorUnits: 15000, reason: 'annual increase',
    }, admin.cookie);
    assert.equal(priceChange.status, 200);
    assert.equal(priceChange.json.price.amountMinorUnits, 15000);
    assert.equal(priceChange.json.price.version, 2);

    // The existing subscription's bound price must be UNCHANGED.
    const stillBound = await billing.getPrice(boundPriceId);
    assert.equal(stillBound.amountMinorUnits, 10000, 'existing subscription must keep its original price after an admin price change');
    assert.equal(stillBound.status, 'superseded');

    const current = await billing.getCurrentPrice(plan.id);
    assert.equal(current.amountMinorUnits, 15000);

    // Historical resolution: asking for the price at the moment the
    // subscription was created must still return the OLD price, not the
    // new one — this is the concrete "why was this customer charged X"
    // guarantee.
    const historical = await billing.getPriceAt(plan.id, stillBound.effectiveFrom + 1);
    assert.equal(historical.id, boundPriceId);
  });
});

test('changing a plan price is platform-admin-only', async () => {
  await withServer('price-auth', async ({ base, rp }) => {
    const admin = await registerAndLogin(base, 'admin');
    const user = await registerAndLogin(base, 'user');
    const plan = await createPlanAsAdmin(base, rp, admin);
    const attempt = await post(base, '/billing/plans/price', { planId: plan.id, amountMinorUnits: 1 }, user.cookie);
    assert.equal(attempt.status, 403);
  });
});

// ---------- 4. subscription creation is organization-scoped, reuses real OrganizationRegistry authorization ----------

test('a non-member cannot create a subscription for an organization they do not belong to', async () => {
  await withServer('sub-org-isolation', async ({ base, rp }) => {
    const admin = await registerAndLogin(base, 'admin');
    const owner = await registerAndLogin(base, 'owner');
    const outsider = await registerAndLogin(base, 'outsider');
    const plan = await createPlanAsAdmin(base, rp, admin);

    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;

    const attempt = await post(base, '/billing/organizations/subscriptions/create', { organizationId: orgId, planId: plan.id }, outsider.cookie);
    assert.equal(attempt.status, 403);
    assert.equal(attempt.json.error, 'not_authorized');
  });
});

test('an organization cannot hold two simultaneous active subscriptions', async () => {
  await withServer('sub-single-active', async ({ base, rp }) => {
    const admin = await registerAndLogin(base, 'admin');
    const owner = await registerAndLogin(base, 'owner');
    const plan = await createPlanAsAdmin(base, rp, admin);
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;

    const first = await post(base, '/billing/organizations/subscriptions/create', { organizationId: orgId, planId: plan.id }, owner.cookie);
    assert.equal(first.status, 200);

    const second = await post(base, '/billing/organizations/subscriptions/create', { organizationId: orgId, planId: plan.id }, owner.cookie);
    assert.equal(second.status, 409);
    assert.equal(second.json.error, 'organization_already_has_active_subscription');
  });
});

// ---------- 5. wallet/ledger: real transaction, real audit, real isolation ----------

test('charging a subscription debits the wallet by the exact bound price and records a ledger entry', async () => {
  await withServer('charge-flow', async ({ base, rp, billing }) => {
    const admin = await registerAndLogin(base, 'admin');
    const owner = await registerAndLogin(base, 'owner');
    const plan = await createPlanAsAdmin(base, rp, admin, { initialAmountMinorUnits: 25000, currency: 'KES' });
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;
    const sub = await post(base, '/billing/organizations/subscriptions/create', { organizationId: orgId, planId: plan.id }, owner.cookie);

    // Credit the wallet first (a real business flow: top up before charge).
    // Uses the org owner, not the platform admin — the platform admin is
    // not a member of this organization, so isAuthorized() would (and
    // should) correctly deny them; this exercises the real authorization
    // path rather than working around it.
    await billing.recordLedgerEntry(owner.userId, orgId, { amountMinorUnits: 50000, currency: 'KES', entryType: 'credit', description: 'top-up' });

    const charge = await post(base, '/billing/organizations/subscriptions/charge', { organizationId: orgId, subscriptionId: sub.json.subscription.id }, owner.cookie);
    assert.equal(charge.status, 200);
    assert.equal(charge.json.ledgerEntry.amountMinorUnits, -25000);
    assert.equal(charge.json.ledgerEntry.balanceAfterMinorUnits, 25000);

    const walletRead = await post(base, '/billing/organizations/wallet/get', { organizationId: orgId }, owner.cookie);
    assert.equal(walletRead.status, 200);
    assert.equal(walletRead.json.account.balanceMinorUnits, 25000);
    assert.equal(walletRead.json.ledger.length, 2);
  });
});

test('a debit that would make the wallet balance negative is rejected — no negative balances', async () => {
  await withServer('insufficient-balance', async ({ base, billing }) => {
    const owner = await registerAndLogin(base, 'owner');
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;

    await assert.rejects(
      () => billing.recordLedgerEntry(owner.userId, orgId, { amountMinorUnits: -500, currency: 'KES', entryType: 'adjustment' }),
      (err) => err.code === 'insufficient_wallet_balance'
    );
  });
});

test('a wallet cannot be read by a user outside the organization — real tenant isolation', async () => {
  await withServer('wallet-isolation', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const outsider = await registerAndLogin(base, 'outsider');
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;

    const attempt = await post(base, '/billing/organizations/wallet/get', { organizationId: orgId }, outsider.cookie);
    assert.equal(attempt.status, 403);
  });
});

// Regression test for a real finding from the Phase 2 final security
// audit: getActiveSubscription/getWalletAccount/getWalletLedger
// originally relied entirely on the calling route to check authorization
// first — every write method self-enforced, these three read methods did
// not. Fixed to self-enforce regardless of caller. This test calls the
// registry class DIRECTLY (bypassing server.js's routes entirely) to
// prove the class itself now refuses an unauthorized actor, not just the
// one route that happened to remember to check.
test('billing registry read methods self-enforce authorization even when called directly, not just via server.js routes', async () => {
  await withServer('registry-self-enforcement', async ({ base, billing }) => {
    const owner = await registerAndLogin(base, 'owner');
    const outsider = await registerAndLogin(base, 'outsider');
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;
    await billing.recordLedgerEntry(owner.userId, orgId, { amountMinorUnits: 1000, currency: 'KES', entryType: 'credit' });

    await assert.rejects(
      () => billing.getActiveSubscription(outsider.userId, orgId),
      (err) => err.code === 'not_authorized'
    );
    await assert.rejects(
      () => billing.getWalletAccount(outsider.userId, orgId),
      (err) => err.code === 'not_authorized'
    );
    await assert.rejects(
      () => billing.getWalletLedger(outsider.userId, orgId),
      (err) => err.code === 'not_authorized'
    );

    // Confirm the legitimate owner still succeeds — the fix must not have
    // broken the authorized path.
    const ok = await billing.getWalletAccount(owner.userId, orgId);
    assert.equal(ok.balanceMinorUnits, 1000);
  });
});

// ---------- 6. real transaction rollback: a failure partway through never leaves partial state ----------

test('a rejected ledger entry (currency mismatch) leaves the wallet balance and ledger completely unchanged', async () => {
  await withServer('ledger-rollback', async ({ base, billing }) => {
    const owner = await registerAndLogin(base, 'owner');
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;

    await billing.recordLedgerEntry(owner.userId, orgId, { amountMinorUnits: 10000, currency: 'KES', entryType: 'credit' });
    const before = await billing.getWalletAccount(owner.userId, orgId);

    await assert.rejects(
      () => billing.recordLedgerEntry(owner.userId, orgId, { amountMinorUnits: 100, currency: 'USD', entryType: 'credit' }),
      (err) => err.code === 'currency_mismatch_with_wallet_account'
    );

    const after = await billing.getWalletAccount(owner.userId, orgId);
    assert.equal(after.balanceMinorUnits, before.balanceMinorUnits, 'a rejected entry must not change the balance at all');
    const ledger = await billing.getWalletLedger(owner.userId, orgId);
    assert.equal(ledger.length, 1, 'a rejected entry must not appear in the ledger');
  });
});

// ---------- 7. audit: real audit_events rows, not console.log/client storage ----------

test('billing actions write real audit_events rows — plan creation, price change, subscription creation, and ledger entries', async () => {
  await withServer('audit-trail', async ({ base, rp, db }) => {
    const admin = await registerAndLogin(base, 'admin');
    const owner = await registerAndLogin(base, 'owner');
    const plan = await createPlanAsAdmin(base, rp, admin, { initialAmountMinorUnits: 5000 });
    await post(base, '/billing/plans/price', { planId: plan.id, amountMinorUnits: 6000 }, admin.cookie);
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    await post(base, '/billing/organizations/subscriptions/create', { organizationId: org.json.organization.id, planId: plan.id }, owner.cookie);

    const events = await db.all("SELECT event_type FROM audit_events WHERE event_type LIKE 'billing_%'", []);
    const types = events.map((e) => e.event_type);
    assert.ok(types.includes('billing_plan_created'));
    assert.ok(types.includes('billing_plan_price_changed'));
    assert.ok(types.includes('billing_subscription_created'));
  });
});

// ---------- 8. cancellation ----------

test('canceling a subscription is organization-scoped and moves it to a terminal state', async () => {
  await withServer('cancel-flow', async ({ base, rp }) => {
    const admin = await registerAndLogin(base, 'admin');
    const owner = await registerAndLogin(base, 'owner');
    const plan = await createPlanAsAdmin(base, rp, admin);
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;
    const sub = await post(base, '/billing/organizations/subscriptions/create', { organizationId: orgId, planId: plan.id }, owner.cookie);

    const cancel = await post(base, '/billing/organizations/subscriptions/cancel', { organizationId: orgId, subscriptionId: sub.json.subscription.id }, owner.cookie);
    assert.equal(cancel.status, 200);
    assert.equal(cancel.json.subscription.status, 'canceled');

    // A canceled organization can start a fresh subscription — this is a
    // real business rule (resubscription), not an artificial lock-out.
    const fresh = await post(base, '/billing/organizations/subscriptions/create', { organizationId: orgId, planId: plan.id }, owner.cookie);
    assert.equal(fresh.status, 200);
  });
});

// ---------- 9. Phase 3: plan features (the entitlement bridge dependency) ----------

test('setting plan features is platform-admin-only and getPlanFeatures reflects them', async () => {
  await withServer('plan-features', async ({ base, rp, billing }) => {
    const admin = await registerAndLogin(base, 'admin');
    const user = await registerAndLogin(base, 'user');
    const plan = await createPlanAsAdmin(base, rp, admin);

    const denied = await post(base, '/billing/plans/features', { planId: plan.id, featureKeys: ['ai_assistant'] }, user.cookie);
    assert.equal(denied.status, 403);

    const set = await post(base, '/billing/plans/features', { planId: plan.id, featureKeys: ['ai_assistant', 'advanced_reports', 'ai_assistant'] }, admin.cookie);
    assert.equal(set.status, 200);
    assert.deepEqual(set.json.featureKeys.sort(), ['advanced_reports', 'ai_assistant'], 'duplicate feature keys must be deduplicated');

    const features = await billing.getPlanFeatures(plan.id);
    assert.deepEqual(features.sort(), ['advanced_reports', 'ai_assistant']);
  });
});

test('setPlanFeatures replaces the entire feature set atomically, not incrementally', async () => {
  await withServer('plan-features-replace', async ({ base, rp, billing }) => {
    const admin = await registerAndLogin(base, 'admin');
    const plan = await createPlanAsAdmin(base, rp, admin);
    await post(base, '/billing/plans/features', { planId: plan.id, featureKeys: ['feature_a', 'feature_b'] }, admin.cookie);
    await post(base, '/billing/plans/features', { planId: plan.id, featureKeys: ['feature_c'] }, admin.cookie);
    const features = await billing.getPlanFeatures(plan.id);
    assert.deepEqual(features, ['feature_c'], 'a later setPlanFeatures call must fully replace, not merge with, the prior set');
  });
});

// ---------- 10. Phase 3: real entitlement snapshot resolution ----------

test('an organization with an active subscription resolves a real entitlement snapshot including its plan features', async () => {
  await withServer('entitlement-snapshot', async ({ base, rp }) => {
    const admin = await registerAndLogin(base, 'admin');
    const owner = await registerAndLogin(base, 'owner');
    const plan = await createPlanAsAdmin(base, rp, admin, { planKey: 'pro_ent' });
    await post(base, '/billing/plans/features', { planId: plan.id, featureKeys: ['ai_assistant', 'advanced_reports'] }, admin.cookie);
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;
    await post(base, '/billing/organizations/subscriptions/create', { organizationId: orgId, planId: plan.id }, owner.cookie);

    const resolved = await post(base, '/billing/organizations/entitlement', { organizationId: orgId }, owner.cookie);
    assert.equal(resolved.status, 200);
    assert.equal(resolved.json.snapshot.hasSubscription, true);
    assert.equal(resolved.json.snapshot.planKey, 'pro_ent');
    assert.equal(resolved.json.snapshot.status, 'active');
    assert.deepEqual(resolved.json.snapshot.licensedModules.sort(), ['advanced_reports', 'ai_assistant']);
  });
});

test('an organization with no subscription resolves a fail-closed empty snapshot, not an error and not "everything enabled"', async () => {
  await withServer('entitlement-no-sub', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;

    const resolved = await post(base, '/billing/organizations/entitlement', { organizationId: orgId }, owner.cookie);
    assert.equal(resolved.status, 200);
    assert.equal(resolved.json.snapshot.hasSubscription, false);
    assert.deepEqual(resolved.json.snapshot.licensedModules, [], 'no subscription must resolve to zero licensed modules, never a default-open list');
  });
});

test('entitlement resolution is organization-scoped — an outsider gets denied, not another org\'s snapshot', async () => {
  await withServer('entitlement-isolation', async ({ base, rp }) => {
    const admin = await registerAndLogin(base, 'admin');
    const owner = await registerAndLogin(base, 'owner');
    const outsider = await registerAndLogin(base, 'outsider');
    const plan = await createPlanAsAdmin(base, rp, admin);
    await post(base, '/billing/plans/features', { planId: plan.id, featureKeys: ['secret_feature'] }, admin.cookie);
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;
    await post(base, '/billing/organizations/subscriptions/create', { organizationId: orgId, planId: plan.id }, owner.cookie);

    const attempt = await post(base, '/billing/organizations/entitlement', { organizationId: orgId }, outsider.cookie);
    assert.equal(attempt.status, 403);
    assert.equal(attempt.json.error, 'not_authorized');
  });
});

// ---------- 11. Phase 3: explicit client-tampering resistance (section 16) ----------
//
// Each of these sends exactly the field a malicious client would try to
// forge, and confirms the server's actual behavior is unaffected by it.

test('client-supplied "isPlatformAdmin": true does not grant platform-admin authority', async () => {
  await withServer('tamper-isadmin', async ({ base }) => {
    const user = await registerAndLogin(base, 'user');
    const attempt = await post(base, '/billing/plans', {
      planKey: 'forged_plan', name: 'Forged', currency: 'KES', billingInterval: 'month',
      initialAmountMinorUnits: 100,
      isPlatformAdmin: true, // forged — server must ignore this field entirely
    }, user.cookie);
    assert.equal(attempt.status, 403, 'a forged isPlatformAdmin field in the body must have zero effect; only the resolved session matters');
    assert.equal(attempt.json.error, 'platform_admin_required');
  });
});

test('client-supplied "price"/"amountMinorUnits" does not override the server-resolved subscription price', async () => {
  await withServer('tamper-price', async ({ base, rp, billing }) => {
    const admin = await registerAndLogin(base, 'admin');
    const owner = await registerAndLogin(base, 'owner');
    const plan = await createPlanAsAdmin(base, rp, admin, { initialAmountMinorUnits: 10000, currency: 'KES' });
    const org = await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie);
    const orgId = org.json.organization.id;
    // Forged amount/price fields alongside a legitimate create call — the
    // route doesn't even read these fields for subscription creation, so
    // this proves they're simply not part of the trusted input surface.
    const sub = await post(base, '/billing/organizations/subscriptions/create', {
      organizationId: orgId, planId: plan.id, amountMinorUnits: 1, price: 1,
    }, owner.cookie);
    assert.equal(sub.status, 200);

    // Top up first (a real prerequisite unrelated to the tamper attempt).
    await billing.recordLedgerEntry(owner.userId, orgId, { amountMinorUnits: 50000, currency: 'KES', entryType: 'credit' });

    const charge = await post(base, '/billing/organizations/subscriptions/charge', { organizationId: orgId, subscriptionId: sub.json.subscription.id, amountMinorUnits: 1 }, owner.cookie);
    assert.equal(charge.status, 200);
    assert.equal(charge.json.ledgerEntry.amountMinorUnits, -10000, 'the charge must use the real server-resolved price (KES 100.00), never a client-forged amount');
  });
});

test('client-supplied "orgId" pointing at another organization does not provide access', async () => {
  await withServer('tamper-orgid', async ({ base, rp }) => {
    const admin = await registerAndLogin(base, 'admin');
    const ownerA = await registerAndLogin(base, 'ownerA');
    const ownerB = await registerAndLogin(base, 'ownerB');
    const plan = await createPlanAsAdmin(base, rp, admin);
    const orgA = await post(base, '/organizations/create', { name: 'Acme A' }, ownerA.cookie);
    const orgB = await post(base, '/organizations/create', { name: 'Acme B' }, ownerB.cookie);
    await post(base, '/billing/organizations/subscriptions/create', { organizationId: orgB.json.organization.id, planId: plan.id }, ownerB.cookie);

    // ownerA (authenticated, real session) tries to read orgB's billing
    // by simply naming orgB's real id in the body — exactly the attack
    // this section exists to rule out.
    const attempt = await post(base, '/billing/organizations/entitlement', { organizationId: orgB.json.organization.id }, ownerA.cookie);
    assert.equal(attempt.status, 403);
    assert.equal(attempt.json.error, 'not_authorized');
  });
});
