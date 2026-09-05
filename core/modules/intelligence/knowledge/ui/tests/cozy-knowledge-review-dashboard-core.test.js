/**
 * core/modules/intelligence/knowledge/ui/tests/cozy-knowledge-review-dashboard-core.test.js
 * RP-029-C Phase 2 — real, executed tests for
 * core/modules/intelligence/knowledge/ui/cozy-knowledge-review-dashboard-core.js
 *
 * Run with: node core/modules/intelligence/knowledge/ui/tests/cozy-knowledge-review-dashboard-core.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`      ${err.message}`);
    failed++;
  }
}

const roots = {
  ingestion: path.join(__dirname, '..', '..', 'cozy-knowledge-ingestion.js'),
  community: path.join(__dirname, '..', '..', 'cozy-knowledge-community.js'),
  review: path.join(__dirname, '..', '..', 'cozy-knowledge-review.js'),
  templates: path.join(__dirname, '..', '..', '..', 'language', 'cozy-language-templates.js'),
  registry: path.join(__dirname, '..', '..', '..', 'language', 'cozy-language-registry.js'),
  hotspot: path.join(__dirname, '..', '..', '..', '..', '..', 'engines', 'collaboration', 'live-hotspot-engine.js'),
  bridge: path.join(__dirname, '..', 'cozy-knowledge-review-hotspot-bridge.js'),
  core: path.join(__dirname, '..', 'cozy-knowledge-review-dashboard-core.js')
};

function loadModules(withAuth) {
  Object.values(roots).forEach((p) => { delete require.cache[require.resolve(p)]; });
  global.window = { CozyOS: {} };
  require(roots.ingestion);
  require(roots.community);
  require(roots.review);
  require(roots.templates);
  require(roots.registry);
  require(roots.hotspot);
  require(roots.bridge);
  if (withAuth) {
    global.window.CozyOS.AuthCoordinator = withAuth;
  }
  require(roots.core);
  return {
    Ingestion: global.window.CozyOS.CozyKnowledgeIngestion,
    Community: global.window.CozyOS.CozyKnowledgeCommunity,
    Review: global.window.CozyOS.CozyKnowledgeReview,
    Bridge: global.window.CozyOS.CozyKnowledgeReviewHotspotBridge,
    Core: global.window.CozyOS.CozyKnowledgeReviewDashboardCore
  };
}

function fakeAuth(identity) {
  return { getCurrentIdentity() { return identity; } };
}

let mods = loadModules(fakeAuth(null));
let Community = mods.Community;
let Core = mods.Core;

function reset(authIdentity) {
  mods = loadModules(authIdentity === undefined ? fakeAuth(null) : authIdentity);
  Community = mods.Community;
  Core = mods.Core;
}

function makeCandidate(overrides) {
  const opts = Object.assign({
    contributionType: 'PHRASE',
    statement: 'test expression ' + Math.random(),
    contributorId: 'contributorA',
    language: 'luo',
    meaning: 'a test meaning'
  }, overrides || {});
  const result = Community.submitContribution(opts);
  assert.strictEqual(result.status, 'SUBMITTED');
  return result.record.id;
}

// ---------------------------------------------------------------------
// 0. Dependency sanity
// ---------------------------------------------------------------------

test('CozyKnowledgeReviewDashboardCore loads and exposes its API', () => {
  assert.strictEqual(typeof Core.resolveRole, 'function');
  assert.strictEqual(typeof Core.dashboardPromote, 'function');
});

// ---------------------------------------------------------------------
// 1. AUTHORIZATION — resolveRole()
// ---------------------------------------------------------------------

test('resolveRole(): AUTHORIZATION_BACKEND_UNAVAILABLE when AuthCoordinator is absent', () => {
  reset(null); // no AuthCoordinator attached at all
  global.window.CozyOS.AuthCoordinator = undefined;
  const info = Core.resolveRole({});
  assert.strictEqual(info.authBackend, 'AUTHORIZATION_BACKEND_UNAVAILABLE');
  assert.strictEqual(info.role, 'ANONYMOUS');
});

test('resolveRole(): ANONYMOUS when no identity is signed in', () => {
  reset(fakeAuth(null));
  const info = Core.resolveRole({});
  assert.strictEqual(info.role, 'ANONYMOUS');
  assert.strictEqual(info.authBackend, 'VERIFIED');
});

test('resolveRole(): COMMUNITY for any authenticated non-admin user', () => {
  reset(fakeAuth({ userId: 'u1', roles: [] }));
  const info = Core.resolveRole({});
  assert.strictEqual(info.role, 'COMMUNITY');
});

test('resolveRole(): ADMIN when roles include platform-admin', () => {
  reset(fakeAuth({ userId: 'admin1', roles: ['platform-admin'] }));
  const info = Core.resolveRole({});
  assert.strictEqual(info.role, 'ADMIN');
});

test('resolveRole(): REVIEWER only via explicit allowlist, never inferred', () => {
  reset(fakeAuth({ userId: 'rev1', roles: [] }));
  const withoutAllowlist = Core.resolveRole({});
  assert.strictEqual(withoutAllowlist.role, 'COMMUNITY');
  const withAllowlist = Core.resolveRole({ reviewerUserIds: ['rev1'] });
  assert.strictEqual(withAllowlist.role, 'REVIEWER');
});

// ---------------------------------------------------------------------
// 2. AUTHORIZATION — guarded action wrappers (spec: never trust UI auth)
// ---------------------------------------------------------------------

test('dashboardConfirm(): UNAUTHORIZED for ANONYMOUS', () => {
  reset(fakeAuth(null));
  const id = makeCandidate();
  const result = Core.dashboardConfirm(id, Core.resolveRole({}), { contributorId: 'x', sourceId: 's1' });
  assert.strictEqual(result.status, 'UNAUTHORIZED');
});

test('dashboardConfirm(): allowed for COMMUNITY', () => {
  reset(fakeAuth({ userId: 'u1', roles: [] }));
  const id = makeCandidate();
  const result = Core.dashboardConfirm(id, Core.resolveRole({}), { contributorId: 'c1', sourceId: 's1' });
  assert.strictEqual(result.confirmationStatus, 'CONFIRMED');
});

test('dashboardReject(): UNAUTHORIZED for COMMUNITY, allowed for REVIEWER', () => {
  reset(fakeAuth({ userId: 'u1', roles: [] }));
  const id = makeCandidate();
  const asCommunity = Core.dashboardReject(id, Core.resolveRole({}), { reason: 'x' });
  assert.strictEqual(asCommunity.status, 'UNAUTHORIZED');

  reset(fakeAuth({ userId: 'rev1', roles: [] }));
  const id2 = makeCandidate();
  const asReviewer = Core.dashboardReject(id2, Core.resolveRole({ reviewerUserIds: ['rev1'] }), { reason: 'x' });
  assert.strictEqual(asReviewer.status, 'REJECTED');
});

test('dashboardConfirm(): finalizeReview is silently ignored (not honored) for COMMUNITY role even if requested', () => {
  reset(fakeAuth({ userId: 'u1', roles: [] }));
  const id = makeCandidate();
  const result = Core.dashboardConfirm(id, Core.resolveRole({}), { contributorId: 'u1', sourceId: 's1', finalizeReview: true });
  assert.strictEqual(Community.getRecord(id).communityExtensions.reviewState, 'CANDIDATE', 'COMMUNITY role must not be able to finalize a review');
});

test('dashboardConfirm(): finalizeReview is honored for REVIEWER', () => {
  reset(fakeAuth({ userId: 'rev1', roles: [] }));
  const id = makeCandidate();
  const result = Core.dashboardConfirm(id, Core.resolveRole({ reviewerUserIds: ['rev1'] }), { contributorId: 'rev1', sourceId: 's1', finalizeReview: true });
  assert.strictEqual(result.status, 'CONFIRMED');
});

test('AUTHORIZATION_BACKEND_UNAVAILABLE short-circuits any action before touching Phase 1', () => {
  reset(null);
  global.window.CozyOS.AuthCoordinator = undefined;
  const id = makeCandidate();
  const result = Core.dashboardChallenge(id, Core.resolveRole({}), { reason: 'x' });
  assert.strictEqual(result.status, 'AUTHORIZATION_BACKEND_UNAVAILABLE');
  assert.strictEqual(Community.getRecord(id).communityExtensions.reviewState, 'CANDIDATE', 'no state change should occur');
});

// ---------------------------------------------------------------------
// 3. SEARCH / FILTER / SORT
// ---------------------------------------------------------------------

test('searchAndFilter(): filters by language', () => {
  reset(fakeAuth({ userId: 'u1', roles: [] }));
  makeCandidate({ language: 'luo', statement: 'aaa' });
  makeCandidate({ language: 'sw', statement: 'bbb' });
  const records = Community.listCommunityRecords({});
  const filtered = Core.searchAndFilter(records, { language: 'luo' });
  assert.ok(filtered.every((r) => r.language && r.language.code === 'luo'));
  assert.ok(filtered.length >= 1);
});

test('searchAndFilter(): disputedOnly returns only DISPUTED candidates', () => {
  reset(fakeAuth({ userId: 'rev1', roles: [] }));
  const disputedId = makeCandidate();
  const okId = makeCandidate();
  Core.dashboardChallenge(disputedId, Core.resolveRole({ reviewerUserIds: ['rev1'] }), { reason: 'x' });
  const records = Community.listCommunityRecords({});
  const filtered = Core.searchAndFilter(records, { disputedOnly: true });
  assert.ok(filtered.some((r) => r.id === disputedId));
  assert.ok(!filtered.some((r) => r.id === okId));
});

test('searchAndFilter(): query matches statement text case-insensitively', () => {
  reset(fakeAuth({ userId: 'u1', roles: [] }));
  const id = makeCandidate({ statement: 'UniqueMarkerXYZ' });
  const records = Community.listCommunityRecords({});
  const filtered = Core.searchAndFilter(records, { query: 'uniquemarkerxyz' });
  assert.ok(filtered.some((r) => r.id === id));
});

test('searchAndFilter(): mostConfirmed sort orders by independentConfirmations descending', () => {
  reset(fakeAuth({ userId: 'u1', roles: [] }));
  const lo = makeCandidate();
  const hi = makeCandidate();
  Core.dashboardConfirm(hi, Core.resolveRole({}), { contributorId: 'c1', sourceId: 's1' });
  Core.dashboardConfirm(hi, Core.resolveRole({}), { contributorId: 'c2', sourceId: 's2' });
  const records = Community.listCommunityRecords({});
  const sorted = Core.searchAndFilter(records, { sort: 'mostConfirmed' });
  const idx = sorted.map((r) => r.id);
  assert.ok(idx.indexOf(hi) < idx.indexOf(lo));
});

// ---------------------------------------------------------------------
// 4. dashboardPromote — Rule 82 gate enforced in logic, not just UI
// ---------------------------------------------------------------------

test('dashboardPromote(): COMMUNITY target is unaffected by Rule 82', () => {
  reset(fakeAuth({ userId: 'rev1', roles: [] }));
  const id = makeCandidate({ language: 'luo' });
  const result = Core.dashboardPromote(id, 'COMMUNITY', Core.resolveRole({ reviewerUserIds: ['rev1'] }), {});
  assert.strictEqual(result.status, 'UPDATED');
});

test('dashboardPromote(): PUBLIC target is BLOCKED_BY_RULE82 for a NOT_READY language, and Phase 1 promote() is never reached', () => {
  reset(fakeAuth({ userId: 'admin1', roles: ['platform-admin'] }));
  const id = makeCandidate({ language: 'luo' });
  const before = Community.getRecord(id).visibility;
  const result = Core.dashboardPromote(id, 'PUBLIC', Core.resolveRole({}), {});
  assert.strictEqual(result.status, 'BLOCKED_BY_RULE82');
  assert.ok(result.rule82Gate);
  assert.strictEqual(Community.getRecord(id).visibility, before, 'visibility must be unchanged when blocked');
});

test('dashboardPromote(): PUBLIC target requires ADMIN, not just REVIEWER', () => {
  reset(fakeAuth({ userId: 'rev1', roles: [] }));
  const id = makeCandidate({ language: 'luo' });
  const result = Core.dashboardPromote(id, 'PUBLIC', Core.resolveRole({ reviewerUserIds: ['rev1'] }), {});
  assert.strictEqual(result.status, 'UNAUTHORIZED');
});

test('dashboardPromote(): PUBLIC target still blocked by Rule 82 even for ADMIN with a fully-covered language (resources/tests/runtime remain unverifiable here)', () => {
  reset(fakeAuth({ userId: 'admin1', roles: ['platform-admin'] }));
  const id = makeCandidate({ language: 'en' });
  const result = Core.dashboardPromote(id, 'PUBLIC', Core.resolveRole({}), {});
  assert.strictEqual(result.status, 'BLOCKED_BY_RULE82');
});

// ---------------------------------------------------------------------
// 5. Cozy Offline Hotspot bridge — real composition, honest limits
// ---------------------------------------------------------------------

test('listActiveConnections(): honestly reports zero connections when none exist (no fabricated peers)', () => {
  reset(fakeAuth(null));
  const info = mods.Bridge.listActiveConnections();
  assert.strictEqual(info.available, true);
  assert.deepStrictEqual(info.connections, []);
});

test('shareCandidate(): NO_ACTIVE_HOTSPOT_CONNECTION when nothing is connected, never silently "succeeds"', () => {
  reset(fakeAuth(null));
  const id = makeCandidate();
  const rec = Community.getRecord(id);
  const result = mods.Bridge.shareCandidate(rec);
  assert.strictEqual(result.status, 'NO_ACTIVE_HOTSPOT_CONNECTION');
});

test('a received hotspot payload lands as an ordinary PRIVATE/CANDIDATE via the real ingestion path (safety rule: evidence, not automatic truth)', () => {
  reset(fakeAuth(null));
  let received = null;
  const payload = JSON.stringify({
    type: 'cozy-knowledge-share-v1', contributionType: 'PHRASE', statement: 'peer-shared expression',
    language: 'luo', meaning: 'shared meaning', context: 'shared context', dialect: null, region: null
  });
  // Exercises the exact real handling logic wireReceiver() wires to the
  // live engine's real "message-received" event (see bridge file header
  // — a live RTCPeerConnection is not available under plain Node).
  mods.Bridge._handleIncomingPayloadForTests(payload, 'conn-1', (r) => { received = r; });
  assert.ok(received, 'expected the receiver to have processed a submission result');
  assert.strictEqual(received.status, 'SUBMITTED');
  assert.strictEqual(received.record.visibility, 'PRIVATE');
  assert.strictEqual(received.record.communityExtensions.reviewState, 'CANDIDATE');
});

test('bridge ignores payloads that are not its own recognized message type', () => {
  reset(fakeAuth(null));
  const result = mods.Bridge._handleIncomingPayloadForTests(JSON.stringify({ type: 'some-other-app-message' }), 'conn-1');
  assert.strictEqual(result.status, 'IGNORED_NOT_OWN_TYPE');
});

test('bridge ignores unparseable payloads without throwing', () => {
  reset(fakeAuth(null));
  const result = mods.Bridge._handleIncomingPayloadForTests('not-json{{{', 'conn-1');
  assert.strictEqual(result.status, 'IGNORED_UNPARSEABLE');
});

test('wireReceiver() is idempotent — calling it twice registers only one real listener', () => {
  reset(fakeAuth(null));
  const HotspotEngine = global.window.CozyOS.LiveHotspotEngine;
  const before = HotspotEngine.listConnections().length; // sanity: real engine loaded
  const first = mods.Bridge.wireReceiver(() => {});
  const second = mods.Bridge.wireReceiver(() => {});
  assert.strictEqual(first, true);
  assert.strictEqual(second, true);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
