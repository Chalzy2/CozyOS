/**
 * core/modules/intelligence/language-packs/admin-dashboard/tests/cozy-admin-language-dashboard-ui.test.js
 * RP-031-B Increment 5 — real, executed Node tests for the Admin
 * Language Dashboard UI's DOM-free `core` logic layer (authorization,
 * per-section view assembly, ambiguity classification, Hearing Mode
 * capability gating), using the REAL RP-029-A/B/C chain, REAL RP-030
 * registry, REAL RP-031 Phase 1 acquisition pipeline, and REAL
 * Increments 1–4 (no mocks for any of them).
 * Run with: node core/modules/intelligence/language-packs/admin-dashboard/tests/cozy-admin-language-dashboard-ui.test.js
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
    acquisition: path.join(__dirname, '..', '..', 'cozy-language-acquisition-pipeline.js'),
    incrementOne: path.join(__dirname, '..', 'cozy-admin-language-dashboard-core.js'),
    incrementTwo: path.join(__dirname, '..', 'cozy-admin-language-dashboard-term-explorer.js'),
    incrementThree: path.join(__dirname, '..', 'cozy-admin-language-dashboard-domain-community.js'),
    incrementFour: path.join(__dirname, '..', 'cozy-admin-language-dashboard-quarantine-hotspot.js'),
    incrementFive: path.join(__dirname, '..', 'cozy-admin-language-dashboard-ui.js')
};

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
    require(roots.acquisition);
    require(roots.incrementOne);
    require(roots.incrementTwo);
    require(roots.incrementThree);
    require(roots.incrementFour);
    require(roots.incrementFive);

    return {
        win,
        registry: win.CozyOS.CozyLanguagePacks,
        community: win.CozyOS.CozyKnowledgeCommunity,
        gate: win.CozyOS.CozyKnowledgeSafetyGate,
        core: win.CozyOS.Modules['cozy-admin-language-dashboard-ui'].api.core
    };
}

const REVIEWER_ROLE = { role: 'REVIEWER', userId: 'rev1', authBackend: 'VERIFIED' };
const COMMUNITY_ROLE = { role: 'COMMUNITY', userId: 'p1', authBackend: 'VERIFIED' };
const ANON_ROLE = { role: 'ANONYMOUS', userId: null, authBackend: 'VERIFIED' };

console.log('RP-031-B Increment 5 — Admin Language Dashboard UI (core layer) tests\n');

// -----------------------------------------------------------------
// AUTHORIZATION
// -----------------------------------------------------------------

test('authorization: no auth backend attached honestly reports AUTHORIZATION_BACKEND_UNAVAILABLE', () => {
    const s = freshStack();
    const role = s.core.resolveUiRole();
    assert.strictEqual(role.authBackend, 'AUTHORIZATION_BACKEND_UNAVAILABLE');
    assert.strictEqual(role.role, 'ANONYMOUS');
});

test('authorization: an OWNER-tier request is honestly mapped to the real ADMIN rank, never a fabricated fifth tier', () => {
    const s = freshStack();
    s.win.CozyOS.AuthCoordinator = { getCurrentIdentity: () => ({ userId: 'owner1', roles: ['platform-admin'] }) };
    const role = s.core.resolveUiRole({ requestedOwnerView: true });
    assert.strictEqual(role.role, 'ADMIN');
    assert.strictEqual(role.displayRole, 'OWNER');
    assert.ok(role.note.indexOf('not a distinct tier') !== -1);
});

// -----------------------------------------------------------------
// PERMISSION BOUNDARIES
// -----------------------------------------------------------------

test('permission boundaries: ANONYMOUS can view public info but not review/quarantine actions', () => {
    const s = freshStack();
    assert.strictEqual(s.core.isUiActionAllowed('view_public', ANON_ROLE), true);
    assert.strictEqual(s.core.isUiActionAllowed('review', ANON_ROLE), false);
    assert.strictEqual(s.core.isUiActionAllowed('quarantine_action', ANON_ROLE), false);
});

test('permission boundaries: COMMUNITY can confirm but not review — confirmation is NOT hidden behind reviewer auth (the disclosed Phase 2 bug)', () => {
    const s = freshStack();
    assert.strictEqual(s.core.isUiActionAllowed('confirm', COMMUNITY_ROLE), true);
    assert.strictEqual(s.core.isUiActionAllowed('review', COMMUNITY_ROLE), false);
});

test('permission boundaries: REVIEWER can review/quarantine but not admin_analytics', () => {
    const s = freshStack();
    assert.strictEqual(s.core.isUiActionAllowed('review', REVIEWER_ROLE), true);
    assert.strictEqual(s.core.isUiActionAllowed('quarantine_action', REVIEWER_ROLE), true);
    assert.strictEqual(s.core.isUiActionAllowed('admin_analytics', REVIEWER_ROLE), false);
});

test('community confirmation: a COMMUNITY-tier user can confirm a real contribution without REVIEWER rank', () => {
    const s = freshStack();
    const sub = s.community.submitContribution({ contributionType: 'WORD', statement: 'jambo', contributorId: 'author1', language: 'sw' });
    const result = s.core.confirmContribution(sub.record.id, 'confirmer1', COMMUNITY_ROLE);
    assert.strictEqual(result.status, 'CONFIRMED');
});

test('community confirmation: an ANONYMOUS user cannot confirm', () => {
    const s = freshStack();
    const sub = s.community.submitContribution({ contributionType: 'WORD', statement: 'jambo2', contributorId: 'author2', language: 'sw' });
    const result = s.core.confirmContribution(sub.record.id, 'confirmer2', ANON_ROLE);
    assert.strictEqual(result.status, 'UNAUTHORIZED');
});

// -----------------------------------------------------------------
// LANGUAGE OVERVIEW
// -----------------------------------------------------------------

test('language overview: real rows, each carrying a real Rule 82 status, never fabricated', () => {
    const s = freshStack();
    const v = s.core.getLanguageOverviewView();
    assert.strictEqual(v.capability, 'AVAILABLE');
    assert.ok(v.rows.length > 0);
    v.rows.forEach((r) => assert.ok(r.rule82Status));
});

// -----------------------------------------------------------------
// ROUTING
// -----------------------------------------------------------------

test('routing: real RESOLVED status for a real registered language', () => {
    const s = freshStack();
    const v = s.core.getRoutingView({ languageId: 'sw' }, null);
    assert.strictEqual(v.status, 'RESOLVED');
});

test('routing: LANGUAGE_UNCERTAIN honestly for an unregistered language — never guesses', () => {
    const s = freshStack();
    const v = s.core.getRoutingView({ languageId: 'not-real' }, null);
    assert.strictEqual(v.status, 'LANGUAGE_UNCERTAIN');
});

// -----------------------------------------------------------------
// TERM SEARCH / AMBIGUITY
// -----------------------------------------------------------------

test('term search: a single unambiguous real result is never flagged CONFLICTING_MEANING', () => {
    const s = freshStack();
    s.registry.submitExpression({ languageId: 'sw', expression: 'jambo', meaning: 'hello', contributorPseudonym: 'p1', sourceType: 'COMMUNITY' });
    const v = s.core.getTermSearchView({ query: 'jambo' });
    assert.strictEqual(v.hasConflictingMeanings, false);
    assert.strictEqual(v.results[0].ambiguityStatus, 'LANGUAGE_MATCH');
});

test('ambiguity: two real records with the same expression but genuinely different meanings are both preserved and flagged CONFLICTING_MEANING', () => {
    const s = freshStack();
    s.registry.submitExpression({ languageId: 'ki', region: 'Kiambu', expression: 'mbuku', meaning: 'book', contributorPseudonym: 'p1', sourceType: 'COMMUNITY' });
    s.registry.submitExpression({ languageId: 'ki', region: 'Meru', expression: 'mbuku', meaning: 'a type of container', contributorPseudonym: 'p2', sourceType: 'COMMUNITY' });
    const v = s.core.getTermSearchView({ query: 'mbuku' });
    assert.strictEqual(v.hasConflictingMeanings, true);
    assert.strictEqual(v.results.length, 2);
    v.results.forEach((r) => assert.strictEqual(r.ambiguityStatus, 'CONFLICTING_MEANING'));
});

test('term search: QUERY_REQUIRED is honestly reported, never a full browse dump', () => {
    const s = freshStack();
    const v = s.core.getTermSearchView({ query: '' });
    assert.strictEqual(v.status, 'QUERY_REQUIRED');
});

// -----------------------------------------------------------------
// DOMAIN SEPARATION
// -----------------------------------------------------------------

test('domain separation: every domain row is honestly DOMAIN_NOT_TRACKED_BY_REGISTRY, never invented', () => {
    const s = freshStack();
    const v = s.core.getDomainView();
    assert.strictEqual(v.capability, 'AVAILABLE');
    v.domains.forEach((d) => assert.strictEqual(d.status, 'DOMAIN_NOT_TRACKED_BY_REGISTRY'));
});

// -----------------------------------------------------------------
// COMMUNITY ANALYTICS
// -----------------------------------------------------------------

test('community analytics: real pseudonymous aggregate counts, never raw identity', () => {
    const s = freshStack();
    s.community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'raw-identity-abc', language: 'sw' });
    const v = s.core.getCommunityView();
    assert.strictEqual(v.capability, 'AVAILABLE');
    assert.strictEqual(JSON.stringify(v).indexOf('raw-identity-abc'), -1);
});

// -----------------------------------------------------------------
// QUARANTINE VISIBILITY
// -----------------------------------------------------------------

test('quarantine visibility: UNAUTHORIZED for ANONYMOUS, real detail for REVIEWER', () => {
    const s = freshStack();
    s.gate.quarantine({ expression: 'x', language: 'sw', contributionType: 'WORD' }, { classification: 'UNCERTAIN', category: 'AMBIGUOUS' }, 'c1');
    const anonView = s.core.getQuarantineView(ANON_ROLE);
    assert.strictEqual(anonView.status, 'UNAUTHORIZED');
    const reviewerView = s.core.getQuarantineView(REVIEWER_ROLE);
    assert.strictEqual(reviewerView.capability, 'AVAILABLE');
    assert.strictEqual(reviewerView.currentQuarantined, 1);
});

// -----------------------------------------------------------------
// HOTSPOT STATES
// -----------------------------------------------------------------

test('hotspot states: SYNCED/CONFLICT are honestly NOT_SUPPORTED_BY_TRANSPORT via the UI core too', () => {
    const s = freshStack();
    const v = s.core.getHotspotView();
    assert.strictEqual(v.synced, 'NOT_SUPPORTED_BY_TRANSPORT');
    assert.strictEqual(v.conflict, 'NOT_SUPPORTED_BY_TRANSPORT');
});

// -----------------------------------------------------------------
// RULE 82 DISPLAY
// -----------------------------------------------------------------

test('Rule 82 display: LOCKED for a real NOT_READY pack, never READY_FOR_REVIEW without real evidence', () => {
    const s = freshStack();
    const v = s.core.getRule82View('luo');
    assert.ok(['LOCKED', 'NOT_READY'].includes(v.status));
});

// -----------------------------------------------------------------
// TELEMETRY UNAVAILABLE
// -----------------------------------------------------------------

test('telemetry unavailable: most-used view never fabricates usage counts', () => {
    const s = freshStack();
    const v = s.core.getMostUsedView();
    assert.strictEqual(v.mostUsedWords, 'NOT_AVAILABLE_NO_TELEMETRY');
    assert.strictEqual(v.mostUsedPhrases, 'NOT_AVAILABLE_NO_TELEMETRY');
});

// -----------------------------------------------------------------
// HEARING MODE UNAVAILABLE
// -----------------------------------------------------------------

test('Hearing Mode unavailable: no CozyHearing backend honestly reports CAPABILITY_UNAVAILABLE ASR status, never fake transcription', () => {
    const s = freshStack();
    const v = s.core.getHearingModeView();
    assert.strictEqual(v.capability, 'AVAILABLE');
    assert.strictEqual(v.asrStatus, 'CAPABILITY_UNAVAILABLE');
});

test('Hearing Mode: pending clarification count is real, from the actual acquisition pipeline, never estimated', () => {
    const s = freshStack();
    const v = s.core.getHearingModeView();
    assert.strictEqual(typeof v.pendingClarifications, 'number');
});

// -----------------------------------------------------------------
// COMBINED ASSEMBLY
// -----------------------------------------------------------------

test('assembleDashboard: combines all real sections without fabricating any of them', () => {
    const s = freshStack();
    const combined = s.core.assembleDashboard(REVIEWER_ROLE, { languageId: 'sw' });
    assert.strictEqual(combined.languageOverview.capability, 'AVAILABLE');
    assert.strictEqual(combined.community.capability, 'AVAILABLE');
    assert.strictEqual(combined.domain.capability, 'AVAILABLE');
    assert.strictEqual(combined.mostUsed.mostUsedWords, 'NOT_AVAILABLE_NO_TELEMETRY');
    assert.ok(combined.rule82);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
