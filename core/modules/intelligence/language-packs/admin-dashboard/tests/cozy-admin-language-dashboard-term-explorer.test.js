/**
 * core/modules/intelligence/language-packs/admin-dashboard/tests/cozy-admin-language-dashboard-term-explorer.test.js
 * RP-031-B Increment 2 — real, executed tests for the Term Explorer +
 * Research Priority Engine, using the REAL RP-030 registry and the
 * REAL RP-029-C safety gate (no mocks for either).
 * Run with: node core/modules/intelligence/language-packs/admin-dashboard/tests/cozy-admin-language-dashboard-term-explorer.test.js
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

const REGISTRY = path.join(__dirname, '..', '..', 'cozy-language-pack-registry.js');
const SAFETY_GATE = path.join(__dirname, '..', '..', '..', 'knowledge', 'ui', 'cozy-knowledge-safety-gate.js');
const DASHBOARD_CORE = path.join(__dirname, '..', 'cozy-admin-language-dashboard-core.js');
const TERM_EXPLORER = path.join(__dirname, '..', 'cozy-admin-language-dashboard-term-explorer.js');

/**
 * Loads the real dependency chain, in the correct order, into a fresh
 * window every time. Returns { win, registry, explorer, core }.
 */
function freshStack(opts) {
    const withSafetyGate = !opts || opts.withSafetyGate !== false;
    const win = { CozyOS: {} };
    global.window = win;

    if (withSafetyGate) {
        delete require.cache[require.resolve(SAFETY_GATE)];
        require(SAFETY_GATE);
    }

    delete require.cache[require.resolve(REGISTRY)];
    require(REGISTRY);

    delete require.cache[require.resolve(DASHBOARD_CORE)];
    require(DASHBOARD_CORE);

    delete require.cache[require.resolve(TERM_EXPLORER)];
    require(TERM_EXPLORER);

    return {
        win,
        registry: win.CozyOS.CozyLanguagePacks,
        core: win.CozyOS.Modules['cozy-admin-language-dashboard-core'].api,
        explorer: win.CozyOS.Modules['cozy-admin-language-dashboard-term-explorer'].api
    };
}

function seedRealTerm(registry, languageId, fields) {
    const result = registry.submitExpression(Object.assign({ languageId }, fields));
    assert.ok(result.status === 'CANDIDATE_CREATED' || result.status === 'EVIDENCE_ADDED',
        'seed helper expected a real accepted submission, got: ' + JSON.stringify(result));
    return result;
}

// ---------------------------------------------------------------------
// 1. Composition hygiene
// ---------------------------------------------------------------------

test('searchTerms(): CAPABILITY_UNAVAILABLE when RP-030 absent', () => {
    global.window = { CozyOS: {} };
    delete require.cache[require.resolve(TERM_EXPLORER)];
    require(TERM_EXPLORER);
    const api = global.window.CozyOS.Modules['cozy-admin-language-dashboard-term-explorer'].api;
    const result = api.searchTerms({ query: 'anything' });
    assert.strictEqual(result.capability, 'CAPABILITY_UNAVAILABLE');
});

test('routeAndSearchTerms(): CAPABILITY_UNAVAILABLE when Increment 1 dashboard core absent', () => {
    const win = { CozyOS: {} };
    global.window = win;
    delete require.cache[require.resolve(REGISTRY)];
    require(REGISTRY);
    delete require.cache[require.resolve(TERM_EXPLORER)];
    require(TERM_EXPLORER); // dashboard-core deliberately not loaded
    const api = win.CozyOS.Modules['cozy-admin-language-dashboard-term-explorer'].api;
    const result = api.routeAndSearchTerms({ languageId: 'x' }, null, 'q');
    assert.strictEqual(result.capability, 'CAPABILITY_UNAVAILABLE');
    assert.strictEqual(result.reason, 'DASHBOARD_CORE_ABSENT');
});

// ---------------------------------------------------------------------
// 2. Term Explorer — search classification
// ---------------------------------------------------------------------

test('searchTerms(): requires a query — QUERY_REQUIRED, never browses everything by default', () => {
    const { explorer } = freshStack();
    const result = explorer.searchTerms({});
    assert.strictEqual(result.status, 'QUERY_REQUIRED');
});

test('searchTerms(): EXACT_MATCH for an exact expression match, real submitted record', () => {
    const { registry, explorer } = freshStack();
    const lang = registry.listPacks()[0].identity.languageId;
    seedRealTerm(registry, lang, { expression: 'mugunda', meaning: 'farm', region: 'Kiambu', contributorPseudonym: 'p1' });

    const result = explorer.searchTerms({ query: 'mugunda', languageId: lang });
    assert.strictEqual(result.status, 'MATCHES_FOUND');
    assert.strictEqual(result.results[0].matchType, 'EXACT_MATCH');
    assert.strictEqual(result.results[0].word, 'mugunda');
});

test('searchTerms(): PREFIX_MATCH when query is a real leading substring', () => {
    const { registry, explorer } = freshStack();
    const lang = registry.listPacks()[0].identity.languageId;
    seedRealTerm(registry, lang, { expression: 'mugunda', meaning: 'farm', region: 'Kiambu', contributorPseudonym: 'p1' });

    const result = explorer.searchTerms({ query: 'mugu', languageId: lang });
    assert.strictEqual(result.status, 'MATCHES_FOUND');
    assert.strictEqual(result.results[0].matchType, 'PREFIX_MATCH');
});

test('searchTerms(): RELATED_MATCH when query is a real interior substring of the meaning', () => {
    const { registry, explorer } = freshStack();
    const lang = registry.listPacks()[0].identity.languageId;
    seedRealTerm(registry, lang, { expression: 'mugunda', meaning: 'a small farm plot', region: 'Kiambu', contributorPseudonym: 'p1' });

    const result = explorer.searchTerms({ query: 'farm', languageId: lang });
    assert.strictEqual(result.results[0].matchType, 'RELATED_MATCH');
});

test('searchTerms(): NO_MATCH is honest — never invents a result for an unseeded query', () => {
    const { explorer, registry } = freshStack();
    const lang = registry.listPacks()[0].identity.languageId;
    const result = explorer.searchTerms({ query: 'totally-unseeded-xyz', languageId: lang });
    assert.strictEqual(result.status, 'NO_MATCH');
    assert.deepStrictEqual(result.results, []);
});

test('searchTerms(): domain filter is honestly reported as untracked, not silently applied', () => {
    const { registry, explorer } = freshStack();
    const lang = registry.listPacks()[0].identity.languageId;
    seedRealTerm(registry, lang, { expression: 'mugunda', meaning: 'farm', region: 'Kiambu', contributorPseudonym: 'p1' });
    const result = explorer.searchTerms({ query: 'mugunda', languageId: lang, domain: 'Agriculture' });
    assert.ok(/DOMAIN_NOT_TRACKED_BY_REGISTRY/.test(result.domainNote));
    assert.strictEqual(result.status, 'MATCHES_FOUND'); // filter not silently applied as an exclusion
});

test('searchTerms(): translation text is honestly reported as not tracked by the registry', () => {
    const { registry, explorer } = freshStack();
    const lang = registry.listPacks()[0].identity.languageId;
    seedRealTerm(registry, lang, { expression: 'mugunda', meaning: 'farm', region: 'Kiambu', contributorPseudonym: 'p1' });
    const result = explorer.searchTerms({ query: 'mugunda', languageId: lang });
    assert.strictEqual(result.results[0].translation.text, 'NOT_TRACKED_BY_REGISTRY');
});

test('searchTerms(): community knowledge is labelled COMMUNITY_REPORTED_NOT_PROFESSIONALLY_VERIFIED, never upgraded', () => {
    const { registry, explorer } = freshStack();
    const lang = registry.listPacks()[0].identity.languageId;
    seedRealTerm(registry, lang, {
        expression: 'medicine C', meaning: 'used for crop A', region: 'Kiambu',
        contributorPseudonym: 'farmer1', sourceType: 'COMMUNITY'
    });
    const result = explorer.searchTerms({ query: 'medicine C', languageId: lang });
    assert.strictEqual(result.results[0].communityVsProfessional, 'COMMUNITY_REPORTED_NOT_PROFESSIONALLY_VERIFIED');
});

test('searchTerms(): region routing narrows results — Kiambu term not returned when filtering by a different real region', () => {
    const { registry, explorer } = freshStack();
    const lang = registry.listPacks()[0].identity.languageId;
    seedRealTerm(registry, lang, { expression: 'mugunda', meaning: 'farm', region: 'Kiambu', contributorPseudonym: 'p1' });
    seedRealTerm(registry, lang, { expression: 'mugunda', meaning: 'farm (Homa Bay usage)', region: 'Homa Bay', contributorPseudonym: 'p2' });

    const kiamburesult = explorer.searchTerms({ query: 'mugunda', languageId: lang, region: 'Kiambu' });
    assert.strictEqual(kiamburesult.results.length, 1);
    assert.strictEqual(kiamburesult.results[0].region, 'Kiambu');
});

test('getTermDetail(): FOUND for a real recordId, NOT_FOUND for a fabricated one — never invents a record', () => {
    const { registry, explorer } = freshStack();
    const lang = registry.listPacks()[0].identity.languageId;
    const submitted = seedRealTerm(registry, lang, { expression: 'mugunda', meaning: 'farm', region: 'Kiambu', contributorPseudonym: 'p1' });

    const found = explorer.getTermDetail(lang, submitted.recordId);
    assert.strictEqual(found.status, 'FOUND');
    assert.strictEqual(found.term.word, 'mugunda');

    const notFound = explorer.getTermDetail(lang, 'expr-does-not-exist');
    assert.strictEqual(notFound.status, 'NOT_FOUND');
});

// ---------------------------------------------------------------------
// 3. Language-aware routed search
// ---------------------------------------------------------------------

test('routeAndSearchTerms(): LANGUAGE_UNCERTAIN for unregistered language — never silently searches', () => {
    const { explorer } = freshStack();
    const result = explorer.routeAndSearchTerms({ languageId: 'not-a-real-language' }, null, 'anything');
    assert.strictEqual(result.status, 'LANGUAGE_UNCERTAIN');
    assert.strictEqual(result.results, undefined);
});

test('routeAndSearchTerms(): AMBIGUOUS_LANGUAGE for 2+ matching candidates — never silently picks one', () => {
    const { registry, explorer } = freshStack();
    const ids = registry.listPacks().slice(0, 2).map((p) => p.identity.languageId);
    const result = explorer.routeAndSearchTerms({ country: 'KE' }, ids, 'anything');
    assert.strictEqual(result.status, 'AMBIGUOUS_LANGUAGE');
});

test('routeAndSearchTerms(): Kiambu/Kenya routes to the correct pack and finds the real seeded term', () => {
    const { registry, explorer } = freshStack();
    const lang = registry.listPacks()[0].identity.languageId;
    registry.registerRegionalContext(lang, { country: 'KE', region: 'Kiambu', dialect: 'local-variant' });
    seedRealTerm(registry, lang, { expression: 'mugunda', meaning: 'farm', region: 'Kiambu', dialect: 'local-variant', contributorPseudonym: 'p1' });

    const result = explorer.routeAndSearchTerms({ languageId: lang, country: 'KE' }, null, 'mugunda');
    assert.strictEqual(result.routing.status, 'RESOLVED');
    assert.strictEqual(result.status, 'MATCHES_FOUND');
    assert.strictEqual(result.results[0].region, 'Kiambu');
});

test('routeAndSearchTerms(): Homa Bay/Dholuo-style routing resolves via real registerRegionalContext, no fabricated pack', () => {
    const { registry, explorer } = freshStack();
    const secondLang = registry.listPacks()[1].identity.languageId;
    registry.registerRegionalContext(secondLang, { country: 'KE', region: 'Homa Bay', dialect: 'Dholuo' });
    seedRealTerm(registry, secondLang, { expression: 'nyalo', meaning: 'can/able', region: 'Homa Bay', dialect: 'Dholuo', contributorPseudonym: 'p3' });

    const result = explorer.routeAndSearchTerms({ languageId: secondLang, country: 'KE' }, null, 'nyalo');
    assert.strictEqual(result.status, 'MATCHES_FOUND');
    assert.strictEqual(result.results[0].dialect, 'Dholuo');
});

// ---------------------------------------------------------------------
// 4. Quarantine visibility (real safety gate, real UNCERTAIN classification)
// ---------------------------------------------------------------------

test('getQuarantineSummary(): CAPABILITY_UNAVAILABLE when safety gate absent', () => {
    const { explorer } = freshStack({ withSafetyGate: false });
    const result = explorer.getQuarantineSummary();
    assert.strictEqual(result.capability, 'CAPABILITY_UNAVAILABLE');
});

test('getQuarantineSummary(): reflects a real UNCERTAIN submission actually routed to quarantine by the real gate', () => {
    const { registry, explorer } = freshStack();
    const lang = registry.listPacks()[0].identity.languageId;
    // "explicit" is a real SENSITIVE_SINGLE_WORDS entry in the real gate;
    // short bare text -> real UNCERTAIN classification, real quarantine.
    const result = registry.submitExpression({ languageId: lang, expression: 'explicit', meaning: 'explicit', contributorPseudonym: 'p1' });
    assert.strictEqual(result.status, 'QUARANTINED');

    const summary = explorer.getQuarantineSummary(lang);
    assert.strictEqual(summary.capability, 'AVAILABLE');
    assert.ok(summary.count >= 1);
    assert.ok(!summary.items[0].fields, 'quarantine summary must not expose raw submitted content');
});

// ---------------------------------------------------------------------
// 5. Research Priority Engine
// ---------------------------------------------------------------------

test('getResearchPriority(): UNREGISTERED_LANGUAGE for a language that does not exist — never fabricates a priority list', () => {
    const { explorer } = freshStack();
    const result = explorer.getResearchPriority('not-a-real-language');
    assert.strictEqual(result.status, 'UNREGISTERED_LANGUAGE');
});

test('getResearchPriority(): usage/community-request evidence always NOT_AVAILABLE_NO_TELEMETRY — never estimated', () => {
    const { registry, explorer } = freshStack();
    const lang = registry.listPacks()[0].identity.languageId;
    const result = explorer.getResearchPriority(lang);
    assert.strictEqual(result.usageEvidence, 'NOT_AVAILABLE_NO_TELEMETRY');
    assert.strictEqual(result.communityRequestEvidence, 'NOT_AVAILABLE_NO_TELEMETRY');
});

test('getResearchPriority(): a term missing meaning + confidence scores ranks at or above a fully-evidenced term', () => {
    const { registry, explorer } = freshStack();
    const lang = registry.listPacks()[0].identity.languageId;
    // Well-evidenced term: meaning present, real confidence scores, multiple independent confirmations.
    seedRealTerm(registry, lang, {
        expression: 'nyumba', meaning: 'house', region: 'Kiambu', contributorPseudonym: 'p1',
        meaningConfidence: 0.9, translationConfidence: 0.9, pronunciationConfidence: 0.9
    });
    seedRealTerm(registry, lang, {
        expression: 'nyumba', meaning: 'house', region: 'Kiambu', contributorPseudonym: 'p2',
        meaningConfidence: 0.9, translationConfidence: 0.9, pronunciationConfidence: 0.9
    });
    // Poorly-evidenced term: no meaning, no confidence at all, single source, plain text (stays SAFE).
    seedRealTerm(registry, lang, { expression: 'unclear-term', region: 'Kiambu', contributorPseudonym: 'p3' });

    const result = explorer.getResearchPriority(lang);
    const wellEvidenced = result.terms.find((t) => t.expression === 'nyumba');
    const poorlyEvidenced = result.terms.find((t) => t.expression === 'unclear-term');
    assert.ok(poorlyEvidenced, 'expected the no-meaning/no-confidence term to be present');
    assert.ok(poorlyEvidenced.score > wellEvidenced.score);
    assert.ok(['HIGH', 'URGENT_REVIEW', 'MEDIUM'].includes(poorlyEvidenced.priority));
});

test('getResearchPriority(): reviewBacklog reflects real quarantined/rejected counts, never invented', () => {
    const { registry, explorer } = freshStack();
    const lang = registry.listPacks()[0].identity.languageId;
    registry.submitExpression({ languageId: lang, expression: 'nude', meaning: 'nude', contributorPseudonym: 'p1' }); // real UNCERTAIN -> quarantined

    const result = explorer.getResearchPriority(lang);
    assert.strictEqual(result.reviewBacklog.quarantined, 1);
    assert.strictEqual(result.reviewBacklog.rejected, 0);
});

test('getResearchPriority(): priority classification is one of the four disclosed values only', () => {
    const { registry, explorer } = freshStack();
    const lang = registry.listPacks()[0].identity.languageId;
    seedRealTerm(registry, lang, { expression: 'nyumba', meaning: 'house', region: 'Kiambu', contributorPseudonym: 'p1' });
    const result = explorer.getResearchPriority(lang);
    result.terms.forEach((t) => {
        assert.ok(['LOW', 'MEDIUM', 'HIGH', 'URGENT_REVIEW'].includes(t.priority));
    });
});

// ---------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
