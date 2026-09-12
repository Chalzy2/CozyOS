'use strict';
/**
 * server/webauthn-rp/test/postgres-billing-runtime.test.js
 *
 * Real-PostgreSQL evidence for the CozyOS Billing Foundation, following
 * the exact same honest posture as postgres-adapter-runtime.test.js and
 * postgres-recovery-code-runtime.test.js: if process.env.COZY_DATABASE_URL
 * is not set, every test below is registered with node:test's `skip`
 * option and reports 0 pass / N skip — never a fabricated pass. If it IS
 * set, every test runs against that real server, using the real
 * BillingRegistry + OrganizationRegistry classes — never SQLite, never a
 * mock.
 *
 * USAGE
 *   COZY_DATABASE_URL="postgres://user:pass@host:5432/dbname" node --test server/webauthn-rp/test/postgres-billing-runtime.test.js
 *   node --test server/webauthn-rp/test/postgres-billing-runtime.test.js   # no COZY_DATABASE_URL -> every test SKIPPED, none PASS
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const { createDatabaseAdapter } = require('../database-adapter');
const { run: runMigrations } = require('../migrations/run-migrations');
const { OrganizationRegistry } = require('../organizations');
const { BillingRegistry } = require('../billing');

const DATABASE_URL = process.env.COZY_DATABASE_URL;
const SKIP_REASON = 'NOT_RUN — COZY_DATABASE_URL unavailable';
const testOpts = DATABASE_URL ? {} : { skip: SKIP_REASON };

function redact(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname}`;
  } catch (_e) {
    return '(unparseable)';
  }
}

if (DATABASE_URL) {
  console.log(`[postgres-billing-runtime.test.js] connecting to ${redact(DATABASE_URL)}`);
}

function makeClock(start = Date.UTC(2026, 0, 1)) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

async function withRealPostgres(fn) {
  const db = createDatabaseAdapter({ databaseUrl: DATABASE_URL });
  try {
    await runMigrations({ databaseUrl: DATABASE_URL, dir: path.join(__dirname, '..', 'migrations') });
    await fn(db);
  } finally {
    try {
      await db.exec(`
        TRUNCATE TABLE
          wallet_ledger, wallet_accounts, subscriptions, subscription_plan_prices,
          subscription_plans, audit_events, organization_memberships, organizations,
          pending_auth_sessions, mfa_recovery_codes, password_reset_tokens,
          sessions, challenges, credentials, users
        CASCADE;
      `);
    } catch (_cleanupErr) { /* best-effort only */ }
    await db.close();
  }
}

async function seedUserAndOrg(db, clock, { email, orgName }) {
  const userId = crypto.randomUUID();
  await db.run('INSERT INTO users (id, email, is_platform_admin, created_at) VALUES (?, ?, 0, ?)', [userId, email, clock.now()]);
  const orgs = new OrganizationRegistry(db, { now: clock.now });
  const org = await orgs.createOrganization(userId, { name: orgName });
  return { userId, orgId: org.id, orgs };
}

test('billing schema: all 5 tables and their key constraints exist on real PostgreSQL', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const tables = await db.all(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
      []
    );
    const names = tables.map((t) => t.table_name);
    for (const expected of ['subscription_plans', 'subscription_plan_prices', 'subscriptions', 'wallet_accounts', 'wallet_ledger']) {
      assert.ok(names.includes(expected), `expected table "${expected}" to exist`);
    }

    const fks = await db.all(`
      SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name IN ('subscriptions', 'wallet_ledger')
    `, []);
    assert.ok(fks.some((f) => f.table_name === 'subscriptions' && f.foreign_table === 'organizations'));
    assert.ok(fks.some((f) => f.table_name === 'wallet_ledger' && f.foreign_table === 'wallet_accounts'));
  });
});

test('real PostgreSQL: plan creation + versioned price change preserves historical price for an already-created subscription', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const clock = makeClock();
    const { userId: adminId, orgId, orgs } = await seedUserAndOrg(db, clock, { email: 'pg-billing-admin-1@example.com', orgName: 'Acme PG' });
    const billing = new BillingRegistry(db, orgs, { now: clock.now });

    const plan = await billing.createPlan(adminId, true, {
      planKey: 'pro_monthly', name: 'Pro Monthly', currency: 'KES', billingInterval: 'month', initialAmountMinorUnits: 10000,
    });
    const sub = await billing.createSubscription(adminId, orgId, { planId: plan.id });
    const boundPrice = await billing.getPrice(sub.currentPriceId);
    assert.equal(boundPrice.amountMinorUnits, 10000);

    clock.advance(1000);
    await billing.setPlanPrice(adminId, true, { planId: plan.id, amountMinorUnits: 15000, reason: 'price increase' });

    const stillBound = await billing.getPrice(sub.currentPriceId);
    assert.equal(stillBound.amountMinorUnits, 10000, 'the real Postgres row must retain the original bound price after a price change');
    const current = await billing.getCurrentPrice(plan.id);
    assert.equal(current.amountMinorUnits, 15000);
  });
});

test('real PostgreSQL: only one "current" price per plan can exist — the unique partial index is enforced by the real server', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const clock = makeClock();
    const { userId: adminId, orgs } = await seedUserAndOrg(db, clock, { email: 'pg-billing-admin-2@example.com', orgName: 'Acme PG 2' });
    const billing = new BillingRegistry(db, orgs, { now: clock.now });
    const plan = await billing.createPlan(adminId, true, {
      planKey: 'pro_yearly', name: 'Pro Yearly', currency: 'KES', billingInterval: 'year', initialAmountMinorUnits: 100000,
    });

    // Attempt to insert a second "current" price directly, bypassing
    // setPlanPrice()'s own supersede step — this proves the database
    // schema itself (not just application code) prevents two current
    // prices, a real defense-in-depth guarantee.
    await assert.rejects(
      () => db.run(
        `INSERT INTO subscription_plan_prices (id, plan_id, version, amount_minor_units, currency, status, effective_from, effective_until, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, NULL, ?, ?)`,
        [crypto.randomUUID(), plan.id, 99, 1, 'KES', clock.now(), adminId, clock.now()]
      ),
      /unique|duplicate/i
    );
  });
});

test('real PostgreSQL: wallet ledger transaction commits balance + entry together; a rejected entry leaves zero trace', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const clock = makeClock();
    const { userId, orgId, orgs } = await seedUserAndOrg(db, clock, { email: 'pg-billing-wallet-1@example.com', orgName: 'Acme PG Wallet' });
    const billing = new BillingRegistry(db, orgs, { now: clock.now });

    const entry = await billing.recordLedgerEntry(userId, orgId, { amountMinorUnits: 10000, currency: 'KES', entryType: 'credit' });
    assert.equal(entry.balanceAfterMinorUnits, 10000);

    const account = await billing.getWalletAccount(userId, orgId);
    assert.equal(account.balanceMinorUnits, 10000, 'account balance must match the ledger entry that produced it');

    // Reject: would go negative.
    await assert.rejects(
      () => billing.recordLedgerEntry(userId, orgId, { amountMinorUnits: -20000, currency: 'KES', entryType: 'adjustment' }),
      (err) => err.code === 'insufficient_wallet_balance'
    );

    const afterRejected = await billing.getWalletAccount(userId, orgId);
    assert.equal(afterRejected.balanceMinorUnits, 10000, 'a rejected debit must leave the real Postgres balance completely unchanged');
    const ledger = await billing.getWalletLedger(userId, orgId);
    assert.equal(ledger.length, 1, 'a rejected debit must not appear in the real Postgres ledger table');
  });
});

test('real PostgreSQL: organization isolation — billing authorization is checked against real membership, not trusted from the caller', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const clock = makeClock();
    const { orgId, orgs } = await seedUserAndOrg(db, clock, { email: 'pg-billing-owner-1@example.com', orgName: 'Acme PG Isolation' });
    const billing = new BillingRegistry(db, orgs, { now: clock.now });

    const outsiderId = crypto.randomUUID();
    await db.run('INSERT INTO users (id, email, is_platform_admin, created_at) VALUES (?, ?, 0, ?)', [outsiderId, 'pg-billing-outsider-1@example.com', clock.now()]);

    await assert.rejects(
      () => billing.recordLedgerEntry(outsiderId, orgId, { amountMinorUnits: 100, currency: 'KES', entryType: 'credit' }),
      (err) => err.code === 'not_authorized'
    );
  });
});

test('real PostgreSQL: billing actions write real audit_events rows', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const clock = makeClock();
    const { userId: adminId, orgId, orgs } = await seedUserAndOrg(db, clock, { email: 'pg-billing-audit-1@example.com', orgName: 'Acme PG Audit' });
    const billing = new BillingRegistry(db, orgs, { now: clock.now });
    const plan = await billing.createPlan(adminId, true, {
      planKey: 'audit_plan', name: 'Audit Plan', currency: 'KES', billingInterval: 'month', initialAmountMinorUnits: 5000,
    });
    await billing.createSubscription(adminId, orgId, { planId: plan.id });

    const events = await db.all("SELECT event_type FROM audit_events WHERE event_type LIKE 'billing_%'", []);
    const types = events.map((e) => e.event_type);
    assert.ok(types.includes('billing_plan_created'));
    assert.ok(types.includes('billing_subscription_created'));
  });
});

test('real PostgreSQL: entitlement snapshot resolves real plan features for an active subscription, and fails closed with none for no subscription', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const clock = makeClock();
    const { userId: adminId, orgId, orgs } = await seedUserAndOrg(db, clock, { email: 'pg-billing-entitlement-1@example.com', orgName: 'Acme PG Entitlement' });
    const billing = new BillingRegistry(db, orgs, { now: clock.now });

    const noSub = await billing.getEntitlementSnapshot(adminId, orgId);
    assert.equal(noSub.hasSubscription, false);
    assert.deepEqual(noSub.licensedModules, []);

    const plan = await billing.createPlan(adminId, true, {
      planKey: 'ent_plan', name: 'Entitlement Plan', currency: 'KES', billingInterval: 'month', initialAmountMinorUnits: 1000,
    });
    await billing.setPlanFeatures(adminId, true, { planId: plan.id, featureKeys: ['real_pg_feature_a', 'real_pg_feature_b'] });
    await billing.createSubscription(adminId, orgId, { planId: plan.id });

    const withSub = await billing.getEntitlementSnapshot(adminId, orgId);
    assert.equal(withSub.hasSubscription, true);
    assert.equal(withSub.planKey, 'ent_plan');
    assert.deepEqual(withSub.licensedModules.sort(), ['real_pg_feature_a', 'real_pg_feature_b']);
  });
});
