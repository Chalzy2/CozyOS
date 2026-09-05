/**
 * core/modules/intelligence/knowledge/ui/tests/cozy-knowledge-quarantine-admin-core.test.js
 * RP-029-C Phase 5 — real, executed tests for quarantine admin review.
 * Run with: node core/modules/intelligence/knowledge/ui/tests/cozy-knowledge-quarantine-admin-core.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (err) { console.log(`  \u2717 ${name}`); console.log(`      ${err.message}`); failed++; }
}

const roots = {
  ingestion: path.join(__dirname, '..', '..', 'cozy-knowledge-ingestion.js'),
  community: path.join(__dirname, '..', '..', 'cozy-knowledge-community.js'),
  review: path.join(__dirname, '..', '..', 'cozy-knowledge-review.js'),
  templates: path.join(__dirname, '..', '..', '..', 'language', 'cozy-language-templates.js'),
  registry: path.join(__dirname, '..', '..', '..', 'language', 'cozy-language-registry.js'),
  hotspot: path.join(__dirname, '..', '..', '..', '..', '..', 'engines', 'collaboration', 'live-hotspot-engine.js'),
  gate: path.join(__dirname, '..', 'cozy-knowledge-safety-gate.js'),
  bridge: path.join(__dirname, '..', 'cozy-knowledge-review-hotspot-bridge.js'),
  contribCore: path.join(__dirname, '..', 'cozy-knowledge-contribution-core.js'),
  dashCore: path.join(__dirname, '..', 'cozy-knowledge-review-dashboard-core.js'),
  adminCore: path.join(__dirname, '..', 'cozy-knowledge-quarantine-admin-core.js')
};

function loadModules(authIdentity) {
  Object.values(roots).forEach((p) => { delete require.cache[require.resolve(p)]; });
  global.window = { CozyOS: {} };
  require(roots.ingestion);
  require(roots.community);
  require(roots.review);
  require(roots.templates);
  require(roots.registry);
  require(roots.hotspot);
  require(roots.gate);
  require(roots.bridge);
  require(roots.contribCore);
  if (authIdentity !== undefined) {
    global.window.CozyOS.AuthCoordinator = { getCurrentIdentity() { return authIdentity; } };
  }
  require(roots.dashCore);
  require(roots.adminCore);
  return {
    Community: global.window.CozyOS.CozyKnowledgeCommunity,
    Gate: global.window.CozyOS.CozyKnowledgeSafetyGate,
    Bridge: global.window.CozyOS.CozyKnowledgeReviewHotspotBridge,
    ContribCore: global.window.CozyOS.CozyKnowledgeContributionCore,
    Admin: global.window.CozyOS.CozyKnowledgeQuarantineAdmin
  };
}

let mods = loadModules(null);
let Community = mods.Community, Gate = mods.Gate, Bridge = mods.Bridge, ContribCore = mods.ContribCore, Admin = mods.Admin;
function reset(authIdentity) {
  mods = loadModules(authIdentity === undefined ? null : authIdentity);
  Community = mods.Community; Gate = mods.Gate; Bridge = mods.Bridge; ContribCore = mods.ContribCore; Admin = mods.Admin;
}

const ADMIN_ROLE = { role: 'ADMIN', userId: 'admin1', authBackend: 'VERIFIED' };
const REVIEWER_ROLE = { role: 'REVIEWER', userId: 'rev1', authBackend: 'VERIFIED' };
const COMMUNITY_ROLE = { role: 'COMMUNITY', userId: 'user1', authBackend: 'VERIFIED' };
const ANON_ROLE = { role: 'ANONYMOUS', userId: null, authBackend: 'VERIFIED' };

function submitAndQuarantine(overrides) {
  const d = ContribCore.createDraft(Object.assign({
    contributionType: 'TEXT', language: 'luo', expression: 'porn', meaning: 'm', context: 'c',
    consent: { acknowledged: true }
  }, overrides || {}));
  const result = ContribCore.submitDraft(d.id);
  assert.strictEqual(result.status, 'QUARANTINED', 'setup: expected a QUARANTINED submission');
  return result.quarantineId;
}

function safeSubmit(overrides) {
  const d = ContribCore.createDraft(Object.assign({
    contributionType: 'TEXT', language: 'sw', expression: 'Sasa', meaning: 'informal greeting', context: 'youth slang',
    consent: { acknowledged: true }
  }, overrides || {}));
  return ContribCore.submitDraft(d.id);
}

// ---------------------------------------------------------------------
// 1. Safe submission bypasses quarantine
// ---------------------------------------------------------------------
test('1. safe submission bypasses quarantine entirely', () => {
  reset();
  const result = safeSubmit();
  assert.strictEqual(result.status, 'SUBMITTED');
  assert.strictEqual(Admin.listQuarantine(ADMIN_ROLE).items.filter((i) => i.fields.expression === 'Sasa').length, 0);
});

// ---------------------------------------------------------------------
// 2/3/4. Unsafe / uncertain / high-risk submissions enter quarantine
//    (UNSAFE is hard-rejected, never quarantined — verified honestly)
// ---------------------------------------------------------------------
test('2. UNSAFE submission is hard-rejected, never quarantined', () => {
  reset();
  const d = ContribCore.createDraft({ contributionType: 'TEXT', language: 'sw', expression: 'x', notes: '-----BEGIN RSA PRIVATE KEY-----', meaning: 'm', context: 'c', consent: { acknowledged: true } });
  const result = ContribCore.submitDraft(d.id);
  assert.strictEqual(result.status, 'REJECTED_UNSAFE');
});

test('3. UNCERTAIN submission enters quarantine', () => {
  reset();
  const qid = submitAndQuarantine();
  const inspect = Admin.inspect(qid, ADMIN_ROLE);
  assert.strictEqual(inspect.entry.classification, 'UNCERTAIN');
});

test('4. HIGH_RISK submission enters quarantine', () => {
  reset();
  const qid = submitAndQuarantine({ context: 'one two three four five six seven eight' });
  const inspect = Admin.inspect(qid, ADMIN_ROLE);
  assert.strictEqual(inspect.entry.classification, 'HIGH_RISK');
});

// ---------------------------------------------------------------------
// 5/6. Listing and inspection
// ---------------------------------------------------------------------
test('5. quarantine can be listed', () => {
  reset();
  const qid = submitAndQuarantine();
  const list = Admin.listQuarantine(ADMIN_ROLE);
  assert.ok(list.items.some((i) => i.id === qid));
});

test('6. quarantine can be inspected, returning full detail + audit trail', () => {
  reset();
  const qid = submitAndQuarantine();
  const inspect = Admin.inspect(qid, ADMIN_ROLE);
  assert.strictEqual(inspect.status, 'OK');
  assert.ok(Array.isArray(inspect.auditTrail));
});

// ---------------------------------------------------------------------
// 7/8. Unauthorized cannot release/reject
// ---------------------------------------------------------------------
test('7. unauthorized reviewer cannot release', () => {
  reset();
  const qid = submitAndQuarantine();
  const result = Admin.release(qid, COMMUNITY_ROLE, {});
  assert.strictEqual(result.status, 'UNAUTHORIZED');
});

test('8. unauthorized reviewer cannot reject', () => {
  reset();
  const qid = submitAndQuarantine();
  const result = Admin.reject(qid, ANON_ROLE, { reason: 'x' });
  assert.strictEqual(result.status, 'UNAUTHORIZED');
});

// ---------------------------------------------------------------------
// 9/10/11. Authorized reviewer can release/reject/escalate
// ---------------------------------------------------------------------
test('9. authorized reviewer can release, creating a real candidate', () => {
  reset();
  const qid = submitAndQuarantine();
  const result = Admin.release(qid, REVIEWER_ROLE, { reviewerId: 'rev1' });
  assert.strictEqual(result.status, 'RELEASED');
  assert.ok(result.candidateId);
  assert.ok(Community.getRecord(result.candidateId));
});

test('10. authorized reviewer can reject', () => {
  reset();
  const qid = submitAndQuarantine();
  const result = Admin.reject(qid, REVIEWER_ROLE, { reviewerId: 'rev1', reason: 'Not legitimate content.' });
  assert.strictEqual(result.status, 'REJECTED');
});

test('11. authorized reviewer can escalate', () => {
  reset();
  const qid = submitAndQuarantine();
  const result = Admin.escalate(qid, REVIEWER_ROLE, { reviewerId: 'rev1', reason: 'Needs specialized review.' });
  assert.strictEqual(result.status, 'ESCALATED');
});

// ---------------------------------------------------------------------
// 12. Every action creates an audit record
// ---------------------------------------------------------------------
test('12. every state-changing action creates a real audit record with required fields', () => {
  reset();
  const qid = submitAndQuarantine();
  Admin.beginReview(qid, REVIEWER_ROLE, { reviewerId: 'rev1' });
  Admin.reject(qid, REVIEWER_ROLE, { reviewerId: 'rev1', reason: 'x' });
  const trail = Admin.getAuditTrail(qid);
  assert.strictEqual(trail.length, 2);
  trail.forEach((e) => {
    ['eventId', 'quarantineId', 'action', 'actor', 'timestamp', 'previousState', 'newState'].forEach((f) => {
      assert.ok(Object.prototype.hasOwnProperty.call(e, f), `missing ${f}`);
    });
  });
});

// ---------------------------------------------------------------------
// 13/14. Valid vs invalid transitions
// ---------------------------------------------------------------------
test('13. state transitions are valid: QUARANTINED -> UNDER_REVIEW -> RELEASED', () => {
  reset();
  const qid = submitAndQuarantine();
  assert.strictEqual(Admin.beginReview(qid, REVIEWER_ROLE, { reviewerId: 'rev1' }).status, 'UNDER_REVIEW');
  assert.strictEqual(Admin.release(qid, REVIEWER_ROLE, { reviewerId: 'rev1' }).status, 'RELEASED');
});

test('14. invalid transitions are rejected: cannot release an already-released item', () => {
  reset();
  const qid = submitAndQuarantine();
  Admin.release(qid, REVIEWER_ROLE, { reviewerId: 'rev1' });
  const second = Admin.release(qid, REVIEWER_ROLE, { reviewerId: 'rev1' });
  assert.strictEqual(second.status, 'INVALID_TRANSITION');
});

test('14b. invalid transitions are rejected: cannot reject an already-rejected item', () => {
  reset();
  const qid = submitAndQuarantine();
  Admin.reject(qid, REVIEWER_ROLE, { reviewerId: 'rev1', reason: 'x' });
  const second = Admin.reject(qid, REVIEWER_ROLE, { reviewerId: 'rev1', reason: 'y' });
  assert.strictEqual(second.status, 'INVALID_TRANSITION');
});

// ---------------------------------------------------------------------
// 15. Rule 82 remains independent
// ---------------------------------------------------------------------
test('15. release never calls a language-registry mutator; no such call path exists in this file', () => {
  const src = require('fs').readFileSync(roots.adminCore, 'utf8');
  assert.ok(!/CozyLanguageRegistry\s*\.\s*\w/.test(src), 'admin-core must never call any method on the language registry');
  assert.ok(!/setLanguage|registry\.set|registry\.update|state\s*=\s*["\']AVAILABLE["\']/.test(src), 'no registry mutator call or literal AVAILABLE assignment should exist in this file');
});

// ---------------------------------------------------------------------
// 16/17. Released still needs validation; rejected can't become knowledge
// ---------------------------------------------------------------------
test('16. released content is still PRIVATE/CANDIDATE — not auto-confirmed or auto-promoted', () => {
  reset();
  const qid = submitAndQuarantine();
  const result = Admin.release(qid, REVIEWER_ROLE, { reviewerId: 'rev1' });
  const record = Community.getRecord(result.candidateId);
  assert.strictEqual(record.visibility, 'PRIVATE');
  assert.strictEqual(record.communityExtensions.reviewState, 'CANDIDATE');
});

test('17. rejected content never becomes a candidate — no record exists anywhere', () => {
  reset();
  const before = Community.listCommunityRecords({}).length;
  const qid = submitAndQuarantine();
  Admin.reject(qid, REVIEWER_ROLE, { reviewerId: 'rev1', reason: 'x' });
  assert.strictEqual(Community.listCommunityRecords({}).length, before);
});

// ---------------------------------------------------------------------
// 18. Hotspot payload is safety-checked on receipt (Phase 4 behavior, reconfirmed)
// ---------------------------------------------------------------------
test('18. hotspot payload is safety-checked on receipt and quarantined the same way', () => {
  reset();
  const payload = JSON.stringify({ type: 'cozy-knowledge-share-v1', contributionType: 'PHRASE', statement: 'porn', language: 'sw', meaning: 'm', context: 'c' });
  const result = Bridge._handleIncomingPayloadForTests(payload, 'conn-1');
  assert.strictEqual(result.status, 'QUARANTINED');
  const list = Admin.listQuarantine(ADMIN_ROLE);
  assert.ok(list.items.some((i) => i.id === result.quarantineId));
});

// ---------------------------------------------------------------------
// 19. Same content from multiple contributors preserves provenance (dedup)
// ---------------------------------------------------------------------
test('19. same expression from multiple contributors becomes ONE quarantine entry with multiple evidence records', () => {
  reset();
  const c1 = Gate.classify({ expression: 'porn', meaning: 'm', context: 'c', contributionType: 'TEXT' });
  const e1 = Gate.quarantine({ expression: 'porn', meaning: 'm', context: 'c', contributionType: 'TEXT', language: 'luo' }, c1, 'contributorA');
  const c2 = Gate.classify({ expression: 'porn', meaning: 'm', context: 'c', contributionType: 'TEXT' });
  const e2 = Gate.quarantine({ expression: 'porn', meaning: 'm', context: 'c', contributionType: 'TEXT', language: 'luo' }, c2, 'contributorB');
  assert.strictEqual(e1.id, e2.id, 'expected the same quarantine entry to be reused, not a duplicate');
  const entry = Gate.getQuarantineEntry(e1.id);
  assert.strictEqual(entry.evidence.length, 2);
});

// ---------------------------------------------------------------------
// 20. Language context prevents false rejection based solely on spelling
// ---------------------------------------------------------------------
test('20. ordinary vocabulary with real language/context is SAFE, not rejected for resembling a sensitive term elsewhere', () => {
  reset();
  const result = safeSubmit({ language: 'luo', expression: 'nyasaye', meaning: 'God', context: 'used in religious and everyday speech across Luo communities' });
  assert.strictEqual(result.status, 'SUBMITTED');
});

// ---------------------------------------------------------------------
// 21. Privacy tier is preserved
// ---------------------------------------------------------------------
test('21. released candidate privacy tier matches RP-029-A\'s own PRIVATE default, unchanged by quarantine review', () => {
  reset();
  const qid = submitAndQuarantine();
  const result = Admin.release(qid, REVIEWER_ROLE, { reviewerId: 'rev1' });
  assert.strictEqual(Community.getRecord(result.candidateId).visibility, 'PRIVATE');
});

// ---------------------------------------------------------------------
// 22. Unsupported media backend reports honestly
// ---------------------------------------------------------------------
test('22. an AUDIO_REFERENCE contribution is honestly routed to quarantine (media not analyzed), never silently SAFE', () => {
  reset();
  const d = ContribCore.createDraft({ contributionType: 'AUDIO_REFERENCE', language: 'luo', phonetic: 'oh-nge', audioReference: 'ref://clip', meaning: 'm', context: 'c', consent: { acknowledged: true } });
  const result = ContribCore.submitDraft(d.id);
  assert.strictEqual(result.status, 'QUARANTINED');
  const inspect = Admin.inspect(result.quarantineId, ADMIN_ROLE);
  assert.strictEqual(inspect.entry.category, 'MEDIA_NOT_ANALYZED');
});

// ---------------------------------------------------------------------
// 23. No prohibited content enters public knowledge
// ---------------------------------------------------------------------
test('23. rejected quarantine content never appears in listCommunityRecords() at any visibility level', () => {
  reset();
  const qid = submitAndQuarantine();
  Admin.reject(qid, REVIEWER_ROLE, { reviewerId: 'rev1', reason: 'x' });
  const all = Community.listCommunityRecords({}).concat(Community.listCommunityRecords({ visibility: 'PUBLIC' }));
  assert.strictEqual(all.length, 0);
});

// ---------------------------------------------------------------------
// 24. No registry language is promoted by quarantine release
// ---------------------------------------------------------------------
test('24. releasing quarantined content never changes any language registry state', () => {
  reset();
  const registry = global.window.CozyOS.CozyLanguageRegistry;
  const before = registry.getLanguage('luo').state;
  const qid = submitAndQuarantine();
  Admin.release(qid, REVIEWER_ROLE, { reviewerId: 'rev1' });
  const after = registry.getLanguage('luo').state;
  assert.strictEqual(after, before);
  assert.strictEqual(after, 'NOT_READY');
});

// ---------------------------------------------------------------------
// Additional: analytics, escalation honesty, audit minimalism on reject
// ---------------------------------------------------------------------
test('analytics(): real counts over current quarantine contents, never a "most used" claim', () => {
  reset();
  submitAndQuarantine();
  submitAndQuarantine({ language: 'sw' });
  const a = Admin.analytics(ADMIN_ROLE);
  assert.strictEqual(a.status, 'OK');
  assert.ok(a.totalQuarantined >= 2);
  assert.ok(a.byLanguage.luo >= 1);
});

test('escalate(): entry is retained (not deleted) after escalation, honestly disclosed as unreviewed by any real specialized process', () => {
  reset();
  const qid = submitAndQuarantine();
  const result = Admin.escalate(qid, REVIEWER_ROLE, { reviewerId: 'rev1' });
  assert.ok(/does not claim/.test(result.note), result.note);
  const entry = Gate.getQuarantineEntry(qid);
  assert.ok(entry, 'entry should still exist after escalation');
});

test('reject(): the audit event omits the actual submitted field content', () => {
  reset();
  const qid = submitAndQuarantine();
  Admin.reject(qid, REVIEWER_ROLE, { reviewerId: 'rev1', reason: 'x' });
  const trail = Admin.getAuditTrail(qid);
  const raw = JSON.stringify(trail);
  assert.ok(!raw.includes('porn'), 'audit trail must not retain the rejected content itself');
});

test('reject(): requires a reason', () => {
  reset();
  const qid = submitAndQuarantine();
  const result = Admin.reject(qid, REVIEWER_ROLE, { reviewerId: 'rev1' });
  assert.notStrictEqual(result.status, 'REJECTED');
});

test('AUTHORIZATION_BACKEND_UNAVAILABLE short-circuits every quarantine action before touching the gate', () => {
  mods = loadModules(); // loadModules(undefined) attaches no AuthCoordinator at all
  Community = mods.Community; Gate = mods.Gate; Bridge = mods.Bridge; ContribCore = mods.ContribCore; Admin = mods.Admin;
  const qid = submitAndQuarantine();
  const role = Admin.resolveRole({});
  assert.strictEqual(role.authBackend, 'AUTHORIZATION_BACKEND_UNAVAILABLE');
  const result = Admin.release(qid, role, { reviewerId: 'x' });
  assert.strictEqual(result.status, 'AUTHORIZATION_BACKEND_UNAVAILABLE');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
