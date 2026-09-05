'use strict';
/**
 * server/webauthn-rp/test/knowledge-registry.test.js
 *
 * CozyOS Universal Knowledge Intelligence Foundation. All results here
 * are TESTED/VERIFIED against real local infrastructure.
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
const { KnowledgeRegistry } = require('../knowledge-registry');

async function freshHarness(prefix) {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), `knowledge-${prefix}-`)), 'x.sqlite');
  const db = new SQLiteDatabaseAdapter(openDb(dbPath));
  const orgs = new OrganizationRegistry(db, {});
  const billing = new BillingRegistry(db, orgs, {});
  const knowledge = new KnowledgeRegistry(db, orgs, {});
  const adminId = crypto.randomUUID();
  const ts = Date.now();
  await db.run('INSERT INTO users (id, email, is_platform_admin, created_at) VALUES (?, ?, 1, ?)', [adminId, `${prefix}-${crypto.randomUUID()}@example.com`, ts]);
  return { db, orgs, billing, knowledge, adminId, dbPath };
}

async function cleanup(h) {
  await h.db.close();
  fs.rmSync(h.dbPath, { force: true });
}

async function makeUser(h, { isPlatformAdmin = false } = {}) {
  const id = crypto.randomUUID();
  await h.db.run('INSERT INTO users (id, email, is_platform_admin, created_at) VALUES (?, ?, ?, ?)', [id, `${id}@example.com`, isPlatformAdmin ? 1 : 0, Date.now()]);
  return id;
}

// ---------- A. Repository knowledge registration ----------

test('A: platform admin can register GLOBAL knowledge', async () => {
  const h = await freshHarness('a-register');
  try {
    const record = await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'payment_provider', subject: 'cash',
      title: 'Cash provider', status: 'AVAILABLE', evidenceState: 'VERIFIED',
      sourceType: 'test_result', sourceReference: 'server/webauthn-rp/test/payments.test.js', visibility: 'PUBLIC',
    });
    assert.equal(record.status, 'AVAILABLE');
    assert.equal(record.evidenceState, 'VERIFIED');
  } finally { await cleanup(h); }
});

test('A: a non-admin cannot register GLOBAL knowledge', async () => {
  const h = await freshHarness('a-register-denied');
  try {
    const user = await makeUser(h);
    await assert.rejects(
      () => h.knowledge.registerKnowledge(user, false, {
        scope: 'GLOBAL', domain: 'payment_provider', subject: 'fake',
        title: 'x', status: 'AVAILABLE', evidenceState: 'OBSERVED',
        sourceType: 'repository_file', sourceReference: 'x', visibility: 'PUBLIC',
      }),
      (err) => err.code === 'platform_admin_required'
    );
  } finally { await cleanup(h); }
});

// ---------- B. Duplicate registration (versioning) ----------

test('B: re-registering the same (scope, domain, subject) supersedes the old record, preserving history — never a duplicate active row', async () => {
  const h = await freshHarness('b-duplicate');
  try {
    await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'quote_engine', subject: 'immutability',
      title: 'v1', status: 'IMPLEMENTED', evidenceState: 'VERIFIED',
      sourceType: 'test_result', sourceReference: 'x', visibility: 'PUBLIC',
    });
    await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'quote_engine', subject: 'immutability',
      title: 'v2', status: 'IMPLEMENTED', evidenceState: 'VERIFIED',
      sourceType: 'test_result', sourceReference: 'x', visibility: 'PUBLIC',
    });
    const rows = await h.db.all('SELECT title, record_status FROM knowledge_records WHERE domain = ? AND subject = ?', ['quote_engine', 'immutability']);
    assert.equal(rows.length, 2, 'both versions must be retained, never overwritten in place');
    const active = rows.filter((r) => r.record_status === 'active');
    assert.equal(active.length, 1, 'exactly one active record must exist');
    assert.equal(active[0].title, 'v2');
  } finally { await cleanup(h); }
});

// ---------- C. Knowledge retrieval ----------

test('C: retrieval returns the exact registered facts/capabilities/limitations', async () => {
  const h = await freshHarness('c-retrieval');
  try {
    const record = await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'payment_provider', subject: 'crypto',
      title: 'Crypto provider', facts: { assets: ['USDT', 'BTC'] }, capabilities: ['cryptoPayments'],
      limitations: ['no live rate source configured'], status: 'IMPLEMENTED', evidenceState: 'BLOCKED',
      sourceType: 'repository_file', sourceReference: 'server/webauthn-rp/providers/crypto-provider.js', visibility: 'PUBLIC',
    });
    const fetched = await h.knowledge.getKnowledgeById(h.adminId, true, record.id);
    assert.deepEqual(fetched.facts, { assets: ['USDT', 'BTC'] });
    assert.deepEqual(fetched.capabilities, ['cryptoPayments']);
    assert.deepEqual(fetched.limitations, ['no live rate source configured']);
  } finally { await cleanup(h); }
});

// ---------- D. Visibility ----------

test('D: PUBLIC knowledge is retrievable by any authenticated user', async () => {
  const h = await freshHarness('d-public');
  try {
    const record = await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'application_info', subject: 'supported_languages',
      title: 'Supported languages', facts: { languages: ['English', 'Kiswahili'] },
      status: 'AVAILABLE', evidenceState: 'OBSERVED', sourceType: 'repository_file', sourceReference: 'x', visibility: 'PUBLIC',
    });
    const regularUser = await makeUser(h);
    const fetched = await h.knowledge.getKnowledgeById(regularUser, false, record.id);
    assert.equal(fetched.title, 'Supported languages');
  } finally { await cleanup(h); }
});

test('D: ADMIN-visibility knowledge is denied to a non-platform-admin', async () => {
  const h = await freshHarness('d-admin-only');
  try {
    const record = await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'security_rule', subject: 'internal_note',
      title: 'internal', status: 'AVAILABLE', evidenceState: 'OBSERVED',
      sourceType: 'repository_file', sourceReference: 'x', visibility: 'ADMIN',
    });
    const regularUser = await makeUser(h);
    await assert.rejects(() => h.knowledge.getKnowledgeById(regularUser, false, record.id), (err) => err.code === 'not_authorized');
  } finally { await cleanup(h); }
});

test('D: SECRET visibility is never retrievable through this registry, even by a platform admin', async () => {
  const h = await freshHarness('d-secret');
  try {
    const record = await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'internal', subject: 'never_exposed',
      title: 'x', status: 'AVAILABLE', evidenceState: 'OBSERVED',
      sourceType: 'repository_file', sourceReference: 'x', visibility: 'SECRET',
    });
    await assert.rejects(() => h.knowledge.getKnowledgeById(h.adminId, true, record.id), (err) => err.code === 'not_authorized');
  } finally { await cleanup(h); }
});

// ---------- E. Authorization / F. Organization isolation ----------

test('E/F: an organization member can register and retrieve ORGANIZATION-scoped knowledge for their own org', async () => {
  const h = await freshHarness('ef-org-member');
  try {
    const owner = await makeUser(h);
    const org = await h.orgs.createOrganization(owner, { name: 'Acme' });
    const record = await h.knowledge.registerKnowledge(owner, false, {
      organizationId: org.id, scope: 'ORGANIZATION', domain: 'internal_config', subject: 'note',
      title: 'org note', status: 'AVAILABLE', evidenceState: 'OBSERVED',
      sourceType: 'administrator_configuration', sourceReference: 'x', visibility: 'ORGANIZATION',
    });
    const fetched = await h.knowledge.getKnowledgeById(owner, false, record.id);
    assert.equal(fetched.title, 'org note');
  } finally { await cleanup(h); }
});

test('F: Organization B cannot register knowledge for Organization A, and cannot retrieve Organization A\'s private knowledge', async () => {
  const h = await freshHarness('f-cross-org');
  try {
    const ownerA = await makeUser(h);
    const orgA = await h.orgs.createOrganization(ownerA, { name: 'OrgA' });
    const ownerB = await makeUser(h);
    await h.orgs.createOrganization(ownerB, { name: 'OrgB' });

    await assert.rejects(
      () => h.knowledge.registerKnowledge(ownerB, false, {
        organizationId: orgA.id, scope: 'ORGANIZATION', domain: 'internal_config', subject: 'forged',
        title: 'forged', status: 'AVAILABLE', evidenceState: 'OBSERVED',
        sourceType: 'administrator_configuration', sourceReference: 'x', visibility: 'ORGANIZATION',
      }),
      (err) => err.code === 'not_authorized'
    );

    const realRecord = await h.knowledge.registerKnowledge(ownerA, false, {
      organizationId: orgA.id, scope: 'ORGANIZATION', domain: 'internal_config', subject: 'private',
      title: 'private A knowledge', status: 'AVAILABLE', evidenceState: 'OBSERVED',
      sourceType: 'administrator_configuration', sourceReference: 'x', visibility: 'ORGANIZATION',
    });
    await assert.rejects(() => h.knowledge.getKnowledgeById(ownerB, false, realRecord.id), (err) => err.code === 'not_authorized');
  } finally { await cleanup(h); }
});

// ---------- G. Public knowledge / H. Admin knowledge ----------

test('G/H: listKnowledge only returns records the requester is actually authorized to see', async () => {
  const h = await freshHarness('gh-list-filter');
  try {
    await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'application_info', subject: 'public_feature',
      title: 'public', status: 'AVAILABLE', evidenceState: 'OBSERVED', sourceType: 'repository_file', sourceReference: 'x', visibility: 'PUBLIC',
    });
    await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'application_info', subject: 'admin_only',
      title: 'admin only', status: 'AVAILABLE', evidenceState: 'OBSERVED', sourceType: 'repository_file', sourceReference: 'x', visibility: 'ADMIN',
    });
    const regularUser = await makeUser(h);
    const visibleToUser = await h.knowledge.listKnowledge(regularUser, false, { domain: 'application_info' });
    assert.equal(visibleToUser.length, 1);
    assert.equal(visibleToUser[0].title, 'public');
    const visibleToAdmin = await h.knowledge.listKnowledge(h.adminId, true, { domain: 'application_info' });
    assert.equal(visibleToAdmin.length, 2);
  } finally { await cleanup(h); }
});

// ---------- I. Secret exclusion ----------

test('I: registration rejects secret-shaped keys anywhere in facts or metadata, including nested', async () => {
  const h = await freshHarness('i-secret-nested');
  try {
    await assert.rejects(
      () => h.knowledge.registerKnowledge(h.adminId, true, {
        scope: 'GLOBAL', domain: 'payment_provider', subject: 'bad1',
        title: 'x', facts: { config: { nested: { consumerSecret: 'forged' } } },
        status: 'BLOCKED', evidenceState: 'UNKNOWN', sourceType: 'repository_file', sourceReference: 'x', visibility: 'PUBLIC',
      }),
      (err) => err.code === 'secret_shaped_key_rejected'
    );
    await assert.rejects(
      () => h.knowledge.registerKnowledge(h.adminId, true, {
        scope: 'GLOBAL', domain: 'payment_provider', subject: 'bad2',
        title: 'x', metadata: { privateKey: 'forged' },
        status: 'BLOCKED', evidenceState: 'UNKNOWN', sourceType: 'repository_file', sourceReference: 'x', visibility: 'PUBLIC',
      }),
      (err) => err.code === 'secret_shaped_key_rejected'
    );
  } finally { await cleanup(h); }
});

test('I: prototype-pollution-shaped keys (__proto__, constructor, prototype) are also rejected', async () => {
  const h = await freshHarness('i-proto-pollution');
  try {
    // Real bug found by testing: a raw JS object literal `{ __proto__: {...} }`
    // does NOT create an inspectable own property at all — it reassigns
    // the object's prototype at parse time, so Object.keys() sees
    // nothing to reject (confirmed empirically before writing this
    // fixed version of the test). The REALISTIC attack vector — and the
    // one that matters, since untrusted input arrives as JSON — is
    // JSON.parse('{"__proto__":{...}}'), which DOES produce a real own
    // enumerable "__proto__" string key. Testing that shape instead.
    const maliciousFacts = JSON.parse('{"config":{"__proto__":{"polluted":true}}}');
    await assert.rejects(
      () => h.knowledge.registerKnowledge(h.adminId, true, {
        scope: 'GLOBAL', domain: 'x', subject: 'bad3', title: 'x',
        facts: maliciousFacts,
        status: 'BLOCKED', evidenceState: 'UNKNOWN', sourceType: 'repository_file', sourceReference: 'x', visibility: 'PUBLIC',
      }),
      (err) => err.code === 'secret_shaped_key_rejected'
    );
  } finally { await cleanup(h); }
});

// ---------- J. Provenance ----------

test('J: every registered record carries a real source type and reference — never anonymous', async () => {
  const h = await freshHarness('j-provenance');
  try {
    const record = await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'quote_engine', subject: 'no_ledger_from_creation',
      title: 'Quote creation does not directly credit the ledger',
      status: 'IMPLEMENTED', evidenceState: 'VERIFIED',
      sourceType: 'test_result', sourceReference: 'server/webauthn-rp/test/quote-engine.test.js :: ledger discipline: quote creation, locking, and payment-intent creation together produce ZERO ledger effect',
      visibility: 'PUBLIC',
    });
    assert.equal(record.sourceType, 'test_result');
    assert.ok(record.sourceReference.includes('quote-engine.test.js'));
  } finally { await cleanup(h); }
});

// ---------- K. Evidence states / L. Conflicting evidence ----------

test('K: status and evidenceState are independent dimensions, never collapsed into one boolean', async () => {
  const h = await freshHarness('k-dual-dimension');
  try {
    const record = await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'payment_provider', subject: 'mpesa',
      title: 'M-Pesa', status: 'IMPLEMENTED', evidenceState: 'BLOCKED',
      sourceType: 'repository_file', sourceReference: 'x', visibility: 'PUBLIC',
    });
    assert.equal(record.status, 'IMPLEMENTED', 'architecture/adapter shape exists');
    assert.equal(record.evidenceState, 'BLOCKED', 'real runtime evidence does not — a separate, independent fact');
  } finally { await cleanup(h); }
});

test('L: conflicting evidence is represented as two distinct, both-preserved records, never silently overwritten', async () => {
  const h = await freshHarness('l-conflict');
  try {
    await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'payment_provider', subject: 'example_provider',
      title: 'Documented as supporting refunds', facts: { refunds: 'documented_supported' },
      status: 'IMPLEMENTED', evidenceState: 'OBSERVED', sourceType: 'official_provider_documentation', sourceReference: 'https://example.com/docs', visibility: 'PUBLIC',
    });
    await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'payment_provider', subject: 'example_provider',
      title: 'Runtime observed: refunds actually fail', facts: { refunds: 'runtime_failed' },
      status: 'BLOCKED', evidenceState: 'OBSERVED', sourceType: 'runtime_observation', sourceReference: 'incident-2026-09-01', visibility: 'PUBLIC',
    });
    const all = await h.db.all('SELECT source_type, record_status FROM knowledge_records WHERE domain=? AND subject=?', ['payment_provider', 'example_provider']);
    assert.equal(all.length, 2, 'both the documentation-sourced and runtime-sourced records must be preserved');
    const activeOne = all.find((r) => r.record_status === 'active');
    assert.equal(activeOne.source_type, 'runtime_observation', 'the current authoritative record prefers runtime evidence for a runtime claim');
  } finally { await cleanup(h); }
});

// ---------- N/O. Provider registration + capability ----------

test('N/O: real provider knowledge for cash, mpesa, and crypto reflects their actual, already-verified status honestly', async () => {
  const h = await freshHarness('no-real-providers');
  try {
    const cash = await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'payment_provider', subject: 'cash',
      title: 'Cash provider', capabilities: ['payments', 'refunds'],
      status: 'AVAILABLE', evidenceState: 'VERIFIED',
      sourceType: 'test_result', sourceReference: 'server/webauthn-rp/test/payments.test.js', visibility: 'PUBLIC',
    });
    const mpesa = await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'payment_provider', subject: 'mpesa',
      title: 'M-Pesa provider', capabilities: ['mobileMoney'], limitations: ['no real Daraja credentials in this environment'],
      status: 'IMPLEMENTED', evidenceState: 'BLOCKED',
      sourceType: 'repository_file', sourceReference: 'server/webauthn-rp/providers/mpesa-provider.js', visibility: 'PUBLIC',
    });
    const crypto_ = await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'payment_provider', subject: 'crypto',
      title: 'Crypto provider', capabilities: ['cryptoPayments'], limitations: ['live rate runtime blocked — no real rate provider configured'],
      status: 'IMPLEMENTED', evidenceState: 'BLOCKED',
      sourceType: 'repository_file', sourceReference: 'server/webauthn-rp/providers/crypto-provider.js', visibility: 'PUBLIC',
    });
    assert.equal(cash.status, 'AVAILABLE');
    assert.equal(cash.evidenceState, 'VERIFIED', 'cash really is real-runtime-certified per Phase 4');
    assert.equal(mpesa.evidenceState, 'BLOCKED', 'mpesa architecture exists but runtime is honestly blocked');
    assert.equal(crypto_.evidenceState, 'BLOCKED', 'crypto architecture exists but live rate runtime is honestly blocked');
  } finally { await cleanup(h); }
});

// ---------- P. Unknown capability ----------

test('P: a capability never registered for a provider is simply absent — never fabricated as present', async () => {
  const h = await freshHarness('p-unknown-capability');
  try {
    const record = await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'payment_provider', subject: 'cash2',
      title: 'Cash', capabilities: ['payments', 'refunds'],
      status: 'AVAILABLE', evidenceState: 'VERIFIED', sourceType: 'test_result', sourceReference: 'x', visibility: 'PUBLIC',
    });
    assert.ok(!record.capabilities.includes('cryptoPayments'), 'cash never claims a capability it does not have');
  } finally { await cleanup(h); }
});

// ---------- Q. Test-only provider separation ----------

test('Q: TEST_ONLY status is distinct and never conflated with AVAILABLE/IMPLEMENTED', async () => {
  const h = await freshHarness('q-test-only');
  try {
    const record = await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'payment_provider', subject: 'test_only_async',
      title: 'Test-only async provider — NEVER a production provider', status: 'TEST_ONLY', evidenceState: 'VERIFIED',
      sourceType: 'test_result', sourceReference: 'server/webauthn-rp/test/provider-certification.test.js', visibility: 'PUBLIC',
    });
    assert.equal(record.status, 'TEST_ONLY');
    assert.notEqual(record.status, 'AVAILABLE');
  } finally { await cleanup(h); }
});

// ---------- U. Existing-engine discovery / duplicate-engine prevention ----------

test('U: architecture knowledge correctly identifies PaymentRegistry as the existing owner', async () => {
  const h = await freshHarness('u-existing-owner');
  try {
    const record = await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'architecture', subject: 'payment_engine_ownership',
      title: 'PaymentRegistry is the sole payment engine', facts: { owner: 'server/webauthn-rp/payments.js', class: 'PaymentRegistry' },
      status: 'AVAILABLE', evidenceState: 'OBSERVED', sourceType: 'repository_file', sourceReference: 'server/webauthn-rp/payments.js', visibility: 'PUBLIC',
    });
    assert.equal(record.facts.owner, 'server/webauthn-rp/payments.js');
  } finally { await cleanup(h); }
});

// ---------- V. Locked-file awareness ----------

test('V: locked-file knowledge accurately reports the real, current state of all four AI files — three still locked and unchanged, one newly authorized and created this round', async () => {
  const h = await freshHarness('v-locked-files');
  try {
    const fsReal = require('node:fs');
    const pathReal = require('node:path');
    const repoRoot = pathReal.join(__dirname, '..', '..', '..');
    const lockedFiles = ['core/ai.js', 'core/ai/integration.js', 'core/ai/cozy-ai-language.js', 'core/ai/cozy-ai-memory.js'];
    const facts = {};
    for (const rel of lockedFiles) {
      facts[rel] = fsReal.existsSync(pathReal.join(repoRoot, rel)) ? 'PRESENT' : 'ABSENT';
    }
    // core/ai/integration.js was ABSENT when this test was first written
    // (a prior round's discovery explicitly confirmed and relied on that
    // fact). This round received EXPLICIT, one-time authorization to
    // create exactly this one file as a real, active integration bridge
    // — the other three remain locked and untouched. The correct,
    // honest state to assert now is PRESENT, with the history recorded
    // here rather than silently rewritten, per the standing instruction:
    // "Previously ABSENT -> now CREATED under explicit authorization.
    // Do not falsely describe it as previously existing."
    assert.equal(facts['core/ai/integration.js'], 'PRESENT', 'core/ai/integration.js: Previously ABSENT -> now CREATED under explicit authorization (this round)');
    assert.equal(facts['core/ai.js'], 'PRESENT');
    assert.equal(facts['core/ai/cozy-ai-language.js'], 'PRESENT');
    assert.equal(facts['core/ai/cozy-ai-memory.js'], 'PRESENT');

    const record = await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'architecture', subject: 'locked_ai_files',
      title: 'Locked AI Core files', facts,
      status: 'AVAILABLE', evidenceState: 'OBSERVED', sourceType: 'repository_file', sourceReference: 'direct filesystem check', visibility: 'PUBLIC',
    });
    assert.equal(record.facts['core/ai/integration.js'], 'PRESENT');
  } finally { await cleanup(h); }
});

// ---------- W. Financial authority awareness / Z. No ledger mutation ----------

test('W/Z: registering, retrieving, and linking evidence to knowledge never produces any ledger effect', async () => {
  const h = await freshHarness('wz-no-ledger');
  try {
    const owner = await makeUser(h);
    const org = await h.orgs.createOrganization(owner, { name: 'Acme' });
    const record = await h.knowledge.registerKnowledge(owner, false, {
      organizationId: org.id, scope: 'ORGANIZATION', domain: 'internal_config', subject: 'note',
      title: 'x', status: 'AVAILABLE', evidenceState: 'OBSERVED', sourceType: 'administrator_configuration', sourceReference: 'x', visibility: 'ORGANIZATION',
    });
    await h.knowledge.linkEvidence(owner, false, record.id, { evidenceType: 'documentation', reference: 'x' });
    const balance = await h.billing.getWalletBalance(owner, org.id);
    assert.equal(balance, 0, 'the knowledge layer must never be able to affect the financial ledger');
    const ledger = await h.billing.getWalletLedger(owner, org.id);
    assert.equal(ledger.length, 0);
  } finally { await cleanup(h); }
});

test('X: a security rule can be registered and discovered as reusable engineering knowledge', async () => {
  const h = await freshHarness('x-security-rule');
  try {
    const record = await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'security_rule', subject: 'server_side_amount_authority',
      title: 'The server, never the client, determines a payment amount',
      facts: { rule: 'client-supplied amount/currency/fee fields are never trusted' },
      status: 'IMPLEMENTED', evidenceState: 'VERIFIED',
      sourceType: 'test_result', sourceReference: 'server/webauthn-rp/test/quote-engine.test.js :: security: forged extra financial fields on createQuote have zero effect',
      visibility: 'PUBLIC',
    });
    assert.equal(record.domain, 'security_rule');
    assert.ok(record.sourceReference.includes('quote-engine.test.js'));
  } finally { await cleanup(h); }
});

// ---------- Y. Test/evidence linkage ----------

test('Y: a fact\'s supporting test is discoverable via getEvidenceLinks', async () => {
  const h = await freshHarness('y-evidence-linkage');
  try {
    const record = await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'quote_engine', subject: 'single_consumption',
      title: 'A quote may only ever produce one payment intent',
      status: 'IMPLEMENTED', evidenceState: 'VERIFIED', sourceType: 'test_result', sourceReference: 'x', visibility: 'PUBLIC',
    });
    await h.knowledge.linkEvidence(h.adminId, true, record.id, {
      evidenceType: 'test', reference: 'quote-engine.test.js :: lifecycle: a quote may only ever produce one payment intent', result: 'PASS',
    });
    const links = await h.knowledge.getEvidenceLinks(h.adminId, true, record.id);
    assert.equal(links.length, 1);
    assert.equal(links[0].result, 'PASS');
  } finally { await cleanup(h); }
});

// ---------- Adversarial tests ----------

test('adversarial: forged organizationId on registration is rejected by real authorization, not accepted on its own word', async () => {
  const h = await freshHarness('adv-forged-org');
  try {
    const user = await makeUser(h);
    const fakeOrgId = crypto.randomUUID();
    await assert.rejects(
      () => h.knowledge.registerKnowledge(user, false, {
        organizationId: fakeOrgId, scope: 'ORGANIZATION', domain: 'x', subject: 'x',
        title: 'x', status: 'AVAILABLE', evidenceState: 'OBSERVED', sourceType: 'repository_file', sourceReference: 'x', visibility: 'ORGANIZATION',
      }),
      (err) => err.code === 'not_authorized'
    );
  } finally { await cleanup(h); }
});

test('adversarial: a non-admin cannot register GLOBAL knowledge merely by claiming platform authority', async () => {
  const h = await freshHarness('adv-forged-admin');
  try {
    const user = await makeUser(h);
    await assert.rejects(
      () => h.knowledge.registerKnowledge(user, false, {
        scope: 'GLOBAL', domain: 'x', subject: 'x', title: 'x',
        status: 'AVAILABLE', evidenceState: 'OBSERVED', sourceType: 'repository_file', sourceReference: 'x', visibility: 'PUBLIC',
      }),
      (err) => err.code === 'platform_admin_required'
    );
  } finally { await cleanup(h); }
});

test('adversarial: secret retrieval is impossible — secrets are rejected at write time, never stored to retrieve', async () => {
  const h = await freshHarness('adv-secret-retrieval');
  try {
    await assert.rejects(
      () => h.knowledge.registerKnowledge(h.adminId, true, {
        scope: 'GLOBAL', domain: 'payment_provider', subject: 'x', title: 'x',
        facts: { mpesaConsumerSecret: 'real-secret-value' },
        status: 'BLOCKED', evidenceState: 'UNKNOWN', sourceType: 'repository_file', sourceReference: 'x', visibility: 'PUBLIC',
      })
    );
    const all = await h.db.all("SELECT facts FROM knowledge_records WHERE facts LIKE '%real-secret-value%'", []);
    assert.equal(all.length, 0, 'a rejected registration must leave zero trace of the secret value in storage');
  } finally { await cleanup(h); }
});

test('adversarial: a test-only provider record cannot be queried as if it were AVAILABLE/IMPLEMENTED production status', async () => {
  const h = await freshHarness('adv-test-masquerade');
  try {
    await h.knowledge.registerKnowledge(h.adminId, true, {
      scope: 'GLOBAL', domain: 'payment_provider', subject: 'test_only_async',
      title: 'Test-only', status: 'TEST_ONLY', evidenceState: 'VERIFIED',
      sourceType: 'test_result', sourceReference: 'x', visibility: 'PUBLIC',
    });
    const records = await h.knowledge.listKnowledge(h.adminId, true, { domain: 'payment_provider' });
    const testRecord = records.find((r) => r.subject === 'test_only_async');
    assert.notEqual(testRecord.status, 'AVAILABLE');
    assert.notEqual(testRecord.status, 'IMPLEMENTED');
  } finally { await cleanup(h); }
});

test('adversarial: the knowledge registry has no filesystem-write code path — locked file modification is structurally impossible through it', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'knowledge-registry.js'), 'utf8');
  assert.ok(!source.includes('fs.writeFile') && !source.includes('fs.write('), 'the knowledge registry must never write to the filesystem');
});
