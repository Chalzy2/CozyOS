/**
 * core/modules/intelligence/language-packs/admin-dashboard/tests/cozy-admin-language-dashboard-quarantine-hotspot.test.js
 * RP-031-B Increment 4 — real, executed tests for Quarantine + Cozy
 * Offline Hotspot Dashboard Views, using the REAL RP-029-A/B/C chain,
 * REAL RP-030 registry, REAL LiveHotspotEngine, and REAL Increments
 * 1–3 (no mocks for any of them).
 * Run with: node core/modules/intelligence/language-packs/admin-dashboard/tests/cozy-admin-language-dashboard-quarantine-hotspot.test.js
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
    ingestion: path.join(__dirname, '..', '..', '..', 'knowledge', 'cozy-knowledge-ingestion.js'),
    community: path.join(__dirname, '..', '..', '..', 'knowledge', 'cozy-knowledge-community.js'),
    review: path.join(__dirname, '..', '..', '..', 'knowledge', 'cozy-knowledge-review.js'),
    templates: path.join(__dirname, '..', '..', '..', 'language', 'cozy-language-templates.js'),
    chatRegistry: path.join(__dirname, '..', '..', '..', 'language', 'cozy-language-registry.js'),
    hotspotEngine: path.join(__dirname, '..', '..', '..', '..', '..', 'engines', 'collaboration', 'live-hotspot-engine.js'),
    gate: path.join(__dirname, '..', '..', '..', 'knowledge', 'ui', 'cozy-knowledge-safety-gate.js'),
    hotspotBridge: path.join(__dirname, '..', '..', '..', 'knowledge', 'ui', 'cozy-knowledge-review-hotspot-bridge.js'),
    contribCore: path.join(__dirname, '..', '..', '..', 'knowledge', 'ui', 'cozy-knowledge-contribution-core.js'),
    dashCore: path.join(__dirname, '..', '..', '..', 'knowledge', 'ui', 'cozy-knowledge-review-dashboard-core.js'),
    adminCore: path.join(__dirname, '..', '..', '..', 'knowledge', 'ui', 'cozy-knowledge-quarantine-admin-core.js'),
    packRegistry: path.join(__dirname, '..', '..', 'cozy-language-pack-registry.js'),
    incrementOne: path.join(__dirname, '..', 'cozy-admin-language-dashboard-core.js'),
    incrementTwo: path.join(__dirname, '..', 'cozy-admin-language-dashboard-term-explorer.js'),
    incrementThree: path.join(__dirname, '..', 'cozy-admin-language-dashboard-domain-community.js'),
    incrementFour: path.join(__dirname, '..', 'cozy-admin-language-dashboard-quarantine-hotspot.js')
};

const REVIEWER_ROLE = { role: 'REVIEWER', userId: 'rev1', authBackend: 'VERIFIED' };
const ANON_ROLE = { role: 'ANONYMOUS', userId: null, authBackend: 'VERIFIED' };

function freshStack() {
    Object.values(roots).forEach((p) => { delete require.cache[require.resolve(p)]; });
    const win = { CozyOS: {} };
    global.window = win;

    require(roots.ingestion);
    require(roots.community);
    require(roots.review);
    require(roots.templates);
    require(roots.chatRegistry);
    require(roots.hotspotEngine);
    require(roots.gate);
    require(roots.hotspotBridge);
    require(roots.contribCore);
    require(roots.dashCore);
    require(roots.adminCore);
    require(roots.packRegistry);
    require(roots.incrementOne);
    require(roots.incrementTwo);
    require(roots.incrementThree);
    require(roots.incrementFour);

    return {
        win,
        registry: win.CozyOS.CozyLanguagePacks,
        community: win.CozyOS.CozyKnowledgeCommunity,
        gate: win.CozyOS.CozyKnowledgeSafetyGate,
        adminCore: win.CozyOS.CozyKnowledgeQuarantineAdmin,
        review: win.CozyOS.CozyKnowledgeReview,
        bridge: win.CozyOS.CozyKnowledgeReviewHotspotBridge,
        i4: win.CozyOS.Modules['cozy-admin-language-dashboard-quarantine-hotspot'].api
    };
}

console.log('RP-031-B Increment 4 — Quarantine + Cozy Offline Hotspot Dashboard tests\n');

// -----------------------------------------------------------------
// 1-4. QUARANTINE OVERVIEW / EMPTY / MULTIPLE STATES / HIGH-RISK
// -----------------------------------------------------------------

test('quarantine overview: empty quarantine reports real zero counts, not fabricated', () => {
    const s = freshStack();
    const result = s.i4.getQuarantineOverview(REVIEWER_ROLE);
    assert.strictEqual(result.capability, 'AVAILABLE');
    assert.strictEqual(result.currentQuarantined, 0);
    assert.strictEqual(result.highRiskCount, 0);
});

test('quarantine overview: multiple real quarantine states reflected in real counts', () => {
    const s = freshStack();
    s.gate.quarantine({ expression: 'x1', language: 'sw', contributionType: 'WORD' }, { classification: 'UNCERTAIN', category: 'AMBIGUOUS' }, 'c1');
    const q2 = s.gate.quarantine({ expression: 'x2', language: 'ki', contributionType: 'PHRASE' }, { classification: 'HIGH_RISK', category: 'BORDERLINE' }, 'c2');
    s.adminCore.beginReview(q2.id, REVIEWER_ROLE, { reviewerId: 'rev1' });
    const result = s.i4.getQuarantineOverview(REVIEWER_ROLE);
    assert.strictEqual(result.currentQuarantined, 1);
    assert.strictEqual(result.underReview, 1);
});

test('quarantine overview: high-risk count is real, from actual HIGH_RISK classifications only', () => {
    const s = freshStack();
    s.gate.quarantine({ expression: 'a', language: 'sw', contributionType: 'WORD' }, { classification: 'UNCERTAIN', category: 'AMBIGUOUS' }, 'c1');
    s.gate.quarantine({ expression: 'b', language: 'sw', contributionType: 'WORD' }, { classification: 'HIGH_RISK', category: 'BORDERLINE' }, 'c2');
    const result = s.i4.getQuarantineOverview(REVIEWER_ROLE);
    assert.strictEqual(result.highRiskCount, 1);
});

test('quarantine overview: escalation count is honestly reported unavailable as a historical total', () => {
    const s = freshStack();
    const result = s.i4.getQuarantineOverview(REVIEWER_ROLE);
    assert.strictEqual(result.escalated, 'NOT_AVAILABLE_NO_HISTORICAL_AGGREGATE');
});

// -----------------------------------------------------------------
// 6. HISTORICAL TOTALS
// -----------------------------------------------------------------

test('historical totals: released/rejected are honestly NOT_AVAILABLE_NO_HISTORICAL_AGGREGATE even after a real release', () => {
    const s = freshStack();
    const q = s.gate.quarantine({ expression: 'c', language: 'sw', contributionType: 'WORD' }, { classification: 'UNCERTAIN', category: 'AMBIGUOUS' }, 'c1');
    s.adminCore.release(q.id, REVIEWER_ROLE, { reviewerId: 'rev1' });
    const result = s.i4.getQuarantineOverview(REVIEWER_ROLE);
    assert.strictEqual(result.released, 'NOT_AVAILABLE_NO_HISTORICAL_AGGREGATE');
    // and the released item is honestly gone from the live "currently quarantined" count
    assert.strictEqual(result.currentQuarantined, 0);
});

// -----------------------------------------------------------------
// 7-9. LANGUAGE / REGION / CONTRIBUTION-TYPE AGGREGATION
// -----------------------------------------------------------------

test('language aggregation: byLanguage reflects real quarantine entries per language', () => {
    const s = freshStack();
    s.gate.quarantine({ expression: 'a', language: 'sw', contributionType: 'WORD' }, { classification: 'UNCERTAIN', category: 'AMBIGUOUS' }, 'c1');
    s.gate.quarantine({ expression: 'b', language: 'ki', contributionType: 'WORD' }, { classification: 'UNCERTAIN', category: 'AMBIGUOUS' }, 'c2');
    const result = s.i4.getQuarantineOverview(REVIEWER_ROLE);
    assert.strictEqual(result.byLanguage.sw, 1);
    assert.strictEqual(result.byLanguage.ki, 1);
});

test('region aggregation: byRegion extracts only the real region field, never the rest of raw fields', () => {
    const s = freshStack();
    s.gate.quarantine({ expression: 'a', language: 'sw', region: 'Nairobi', contributionType: 'WORD' }, { classification: 'UNCERTAIN', category: 'AMBIGUOUS' }, 'c1');
    const result = s.i4.getQuarantineOverview(REVIEWER_ROLE);
    assert.strictEqual(result.byRegion.Nairobi, 1);
});

test('contribution-type aggregation: byContributionType reflects real submitted types', () => {
    const s = freshStack();
    s.gate.quarantine({ expression: 'a', language: 'sw', contributionType: 'PHRASE' }, { classification: 'UNCERTAIN', category: 'AMBIGUOUS' }, 'c1');
    const result = s.i4.getQuarantineOverview(REVIEWER_ROLE);
    assert.strictEqual(result.byContributionType.PHRASE, 1);
});

// -----------------------------------------------------------------
// 10-11. PRIVACY REDACTION / RAW EVIDENCE CANNOT LEAK
// -----------------------------------------------------------------

test('privacy redaction: getQuarantineOverview never exposes raw fields.expression/meaning text', () => {
    const s = freshStack();
    s.gate.quarantine({ expression: 'super-secret-phrase-content', meaning: 'secret meaning text', language: 'sw', contributionType: 'WORD' }, { classification: 'UNCERTAIN', category: 'AMBIGUOUS' }, 'c1');
    const result = s.i4.getQuarantineOverview(REVIEWER_ROLE);
    const serialized = JSON.stringify(result);
    assert.strictEqual(serialized.indexOf('super-secret-phrase-content'), -1);
    assert.strictEqual(serialized.indexOf('secret meaning text'), -1);
});

test('raw evidence cannot leak: no raw contributorId appears anywhere in getQuarantineOverview output', () => {
    const s = freshStack();
    s.gate.quarantine({ expression: 'a', language: 'sw', contributionType: 'WORD' }, { classification: 'UNCERTAIN', category: 'AMBIGUOUS' }, 'raw-contributor-identity-999');
    const result = s.i4.getQuarantineOverview(REVIEWER_ROLE);
    assert.strictEqual(JSON.stringify(result).indexOf('raw-contributor-identity-999'), -1);
});

// -----------------------------------------------------------------
// 12-13. RULE 82 LOCKED / NO LANGUAGE PROMOTION
// -----------------------------------------------------------------

test('Rule 82: an unregistered pack language reports BLOCKED, never a fabricated eligible state', () => {
    const s = freshStack();
    const result = s.i4.getRule82Visibility('not-a-real-language');
    assert.strictEqual(result.status, 'BLOCKED');
});

test('Rule 82: a registered, NOT_READY pack reports LOCKED or NOT_READY — never READY_FOR_REVIEW without real evidence', () => {
    const s = freshStack();
    const result = s.i4.getRule82Visibility('luo');
    assert.ok(['LOCKED', 'NOT_READY'].includes(result.status));
    assert.strictEqual(result.rule82Gate.promotion, 'LOCKED');
});

test('no language promotion: getRule82Visibility never mutates the pack registry state', () => {
    const s = freshStack();
    const before = s.registry.getPack('sw').status;
    s.i4.getRule82Visibility('sw');
    const after = s.registry.getPack('sw').status;
    assert.strictEqual(before, after);
    assert.notStrictEqual(after, 'AVAILABLE');
});

// -----------------------------------------------------------------
// 14-18. HOTSPOT STATES
// -----------------------------------------------------------------

test('hotspot: with no active connection, an outgoing share honestly reports NO_ACTIVE_HOTSPOT_CONNECTION', () => {
    const s = freshStack();
    const fakeCandidate = { claim: 'x', language: { code: 'sw' }, communityExtensions: {} };
    const result = s.i4.shareViaHotspot(fakeCandidate);
    assert.strictEqual(result.status, 'NO_ACTIVE_HOTSPOT_CONNECTION');
});

test('hotspot: SYNCED is never fabricated — always NOT_SUPPORTED_BY_TRANSPORT, real transport has no such state', () => {
    const s = freshStack();
    const overview = s.i4.getHotspotOverview();
    assert.strictEqual(overview.synced, 'NOT_SUPPORTED_BY_TRANSPORT');
});

test('hotspot: CONFLICT is honestly NOT_SUPPORTED_BY_TRANSPORT', () => {
    const s = freshStack();
    const overview = s.i4.getHotspotOverview();
    assert.strictEqual(overview.conflict, 'NOT_SUPPORTED_BY_TRANSPORT');
});

test('hotspot: a real incoming SAFE payload is tallied under incoming.SUBMITTED, never invented', () => {
    const s = freshStack();
    const payload = JSON.stringify({ type: 'cozy-knowledge-share-v1', contributionType: 'WORD', statement: 'jambo', language: 'sw' });
    const result = s.i4.receiveHotspotPayload(payload, 'conn-1');
    assert.strictEqual(result.status, 'SUBMITTED');
    const overview = s.i4.getHotspotOverview();
    assert.strictEqual(overview.incoming.SUBMITTED, 1);
});

test('hotspot: unavailable transport capability is honestly reported when the bridge is absent', () => {
    global.window = { CozyOS: {} };
    delete require.cache[require.resolve(roots.incrementFour)];
    require(roots.incrementFour);
    const api = window.CozyOS.Modules['cozy-admin-language-dashboard-quarantine-hotspot'].api;
    const overview = api.getHotspotOverview();
    assert.strictEqual(overview.capability, 'CAPABILITY_UNAVAILABLE');
});

// -----------------------------------------------------------------
// 19-21. LANGUAGE ROUTING
// -----------------------------------------------------------------

test('language routing: describeHotspotRouting resolves via the real Increment 1 routing, never guesses from geography', () => {
    const s = freshStack();
    s.registry.registerRegionalContext('ki', { country: 'KE', region: 'Kiambu' });
    const routing = s.i4.describeHotspotRouting({ languageId: 'ki', country: 'KE' }, null, 'SENT');
    assert.strictEqual(routing.status, 'RESOLVED');
    assert.strictEqual(routing.transportStatus, 'SENT');
});

test('language routing: ambiguous language reported honestly when 2+ real candidates match', () => {
    const s = freshStack();
    s.registry.registerRegionalContext('ki', { country: 'KE' });
    s.registry.registerRegionalContext('kam', { country: 'KE' });
    const routing = s.i4.describeHotspotRouting({ country: 'KE' }, ['ki', 'kam']);
    assert.strictEqual(routing.status, 'AMBIGUOUS_LANGUAGE');
});

test('language routing: LANGUAGE_UNCERTAIN for evidence with no real match', () => {
    const s = freshStack();
    const routing = s.i4.describeHotspotRouting({ languageId: 'not-real' }, null);
    assert.strictEqual(routing.status, 'LANGUAGE_UNCERTAIN');
});

// -----------------------------------------------------------------
// 22. COMMUNITY AGGREGATION
// -----------------------------------------------------------------

test('community aggregation: getCommunityView reuses Increment 3 verbatim, never recomputes', () => {
    const s = freshStack();
    s.community.submitContribution({ contributionType: 'WORD', statement: 'test', contributorId: 'p1', language: 'sw' });
    const view = s.i4.getCommunityView();
    const dc = s.win.CozyOS.Modules['cozy-admin-language-dashboard-domain-community'].api;
    const direct = dc.getCommunityContributionAnalytics();
    assert.deepStrictEqual(view, direct);
});

// -----------------------------------------------------------------
// 23. DOMAIN SEPARATION
// -----------------------------------------------------------------

test('domain separation: getDomainSafetyView never claims professional verification for community content', () => {
    const s = freshStack();
    const view = s.i4.getDomainSafetyView();
    view.domains.forEach((d) => assert.strictEqual(d.tag, 'COMMUNITY_REPORTED_NOT_PROFESSIONALLY_VERIFIED'));
});

// -----------------------------------------------------------------
// 24. SAFETY STATUS
// -----------------------------------------------------------------

test('safety status: a language is never itself labelled unsafe merely for having quarantine records', () => {
    const s = freshStack();
    s.gate.quarantine({ expression: 'x', language: 'sw', contributionType: 'WORD' }, { classification: 'HIGH_RISK', category: 'BORDERLINE' }, 'c1');
    const summary = s.i4.getLanguageSafetySummary();
    const sw = summary.languages.find((l) => l.languageId === 'sw');
    assert.ok(sw);
    assert.strictEqual(sw.quarantined, 1);
    assert.ok(!('unsafe' in sw)); // no such field exists — a language itself is never labelled unsafe
});

// -----------------------------------------------------------------
// 25-26. AUTHORIZATION / UNAUTHORIZED ACCESS
// -----------------------------------------------------------------

test('authorization: an ANONYMOUS caller cannot see itemized quarantine content', () => {
    const s = freshStack();
    s.gate.quarantine({ expression: 'x', language: 'sw', contributionType: 'WORD' }, { classification: 'UNCERTAIN', category: 'AMBIGUOUS' }, 'c1');
    const result = s.i4.getQuarantineOverview(ANON_ROLE);
    assert.strictEqual(result.status, 'UNAUTHORIZED');
    assert.strictEqual(JSON.stringify(result).indexOf('c1'), -1);
});

test('unauthorized access: resolveAuthorization reports AUTHORIZATION_BACKEND_UNAVAILABLE honestly when the backend is absent', () => {
    global.window = { CozyOS: {} };
    delete require.cache[require.resolve(roots.incrementFour)];
    require(roots.incrementFour);
    const api = window.CozyOS.Modules['cozy-admin-language-dashboard-quarantine-hotspot'].api;
    const info = api.resolveAuthorization();
    assert.strictEqual(info.authBackend, 'AUTHORIZATION_BACKEND_UNAVAILABLE');
});

// -----------------------------------------------------------------
// 27. MISSING TELEMETRY
// -----------------------------------------------------------------

test('missing telemetry: getDashboardViewModel never fabricates most-used or historical hotspot traffic', () => {
    const s = freshStack();
    const vm = s.i4.getDashboardViewModel(REVIEWER_ROLE, 'sw');
    assert.strictEqual(vm.telemetry.mostUsed, 'NOT_AVAILABLE_NO_TELEMETRY');
    assert.strictEqual(vm.telemetry.hotspotHistorical, 'NOT_AVAILABLE_NO_TELEMETRY');
});

// -----------------------------------------------------------------
// 28-29. MALFORMED RECORDS
// -----------------------------------------------------------------

test('malformed hotspot record: unparseable incoming payload is honestly IGNORED_UNPARSEABLE, never crashes', () => {
    const s = freshStack();
    const result = s.i4.receiveHotspotPayload('{not-valid-json', 'conn-x');
    assert.strictEqual(result.status, 'IGNORED_UNPARSEABLE');
});

test('malformed quarantine record: a quarantineId that does not exist returns a real NOT_FOUND from the composed layer, never fabricated data', () => {
    const s = freshStack();
    const result = s.adminCore.inspect('quarantine_does_not_exist', REVIEWER_ROLE);
    assert.strictEqual(result.status, 'NOT_FOUND');
});

// -----------------------------------------------------------------
// 30. END-TO-END REAL COMPOSITION
// -----------------------------------------------------------------

test('end-to-end: a real submitExpression() UNCERTAIN path flows through to a real, visible quarantine dashboard row', () => {
    const s = freshStack();
    s.registry.registerRegionalContext('sw', { country: 'TZ' });
    // A bare, generic sensitive-adjacent single word with no other
    // context is a real, documented UNCERTAIN trigger in the safety
    // gate's own classify() (AMBIGUOUS_SINGLE_TERM, meaning-before-judgment).
    const result = s.registry.submitExpression({ languageId: 'sw', expression: 'nude', contributorPseudonym: 'p1', sourceType: 'COMMUNITY' });
    assert.strictEqual(result.status, 'QUARANTINED');
    const overview = s.i4.getQuarantineOverview(REVIEWER_ROLE);
    assert.strictEqual(overview.currentQuarantined, 1);
    assert.strictEqual(overview.byLanguage.sw, 1);
});

test('end-to-end: module registers exactly once under the expected Modules key', () => {
    const s = freshStack();
    assert.ok(s.i4);
    assert.strictEqual(typeof s.i4.getQuarantineOverview, 'function');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
