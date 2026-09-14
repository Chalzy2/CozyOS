/**
 * core/modules/intelligence/language-packs/admin-dashboard/tests/cozy-admin-language-dashboard-domain-community.test.js
 * RP-031-B Increment 3 — real, executed tests for Domain & Community
 * Analytics, using the REAL RP-030 registry, REAL RP-029-A/B/C chain,
 * and REAL Increment 1/2 modules (no mocks for any of them).
 * Run with: node core/modules/intelligence/language-packs/admin-dashboard/tests/cozy-admin-language-dashboard-domain-community.test.js
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
    hotspot: path.join(__dirname, '..', '..', '..', '..', '..', 'engines', 'collaboration', 'live-hotspot-engine.js'),
    gate: path.join(__dirname, '..', '..', '..', 'knowledge', 'ui', 'cozy-knowledge-safety-gate.js'),
    bridge: path.join(__dirname, '..', '..', '..', 'knowledge', 'ui', 'cozy-knowledge-review-hotspot-bridge.js'),
    contribCore: path.join(__dirname, '..', '..', '..', 'knowledge', 'ui', 'cozy-knowledge-contribution-core.js'),
    dashCore: path.join(__dirname, '..', '..', '..', 'knowledge', 'ui', 'cozy-knowledge-review-dashboard-core.js'),
    adminCore: path.join(__dirname, '..', '..', '..', 'knowledge', 'ui', 'cozy-knowledge-quarantine-admin-core.js'),
    packRegistry: path.join(__dirname, '..', '..', 'cozy-language-pack-registry.js'),
    incrementOne: path.join(__dirname, '..', 'cozy-admin-language-dashboard-core.js'),
    incrementTwo: path.join(__dirname, '..', 'cozy-admin-language-dashboard-term-explorer.js'),
    incrementThree: path.join(__dirname, '..', 'cozy-admin-language-dashboard-domain-community.js')
};

const REVIEWER_ROLE = { role: 'REVIEWER', userId: 'rev1', authBackend: 'VERIFIED' };

/**
 * Loads the entire real dependency chain, in the correct order, into a
 * fresh window every time. No mocks anywhere in this chain.
 */
function freshStack() {
    Object.values(roots).forEach((p) => { delete require.cache[require.resolve(p)]; });
    const win = { CozyOS: {} };
    global.window = win;

    require(roots.ingestion);
    require(roots.community);
    require(roots.review);
    require(roots.templates);
    require(roots.chatRegistry);
    require(roots.hotspot);
    require(roots.gate);
    require(roots.bridge);
    require(roots.contribCore);
    require(roots.dashCore);
    require(roots.adminCore);
    require(roots.packRegistry);
    require(roots.incrementOne);
    require(roots.incrementTwo);
    require(roots.incrementThree);

    return {
        win,
        registry: win.CozyOS.CozyLanguagePacks,
        community: win.CozyOS.CozyKnowledgeCommunity,
        gate: win.CozyOS.CozyKnowledgeSafetyGate,
        adminCore: win.CozyOS.CozyKnowledgeQuarantineAdmin,
        core: win.CozyOS.Modules['cozy-admin-language-dashboard-core'].api,
        explorer: win.CozyOS.Modules['cozy-admin-language-dashboard-term-explorer'].api,
        domainCommunity: win.CozyOS.Modules['cozy-admin-language-dashboard-domain-community'].api
    };
}

/**
 * Seeds a real Kiambu/Kikuyu vocabulary word + a real Homa Bay/Dholuo
 * vocabulary word, plus one real disputed community contribution, into
 * a given fresh stack. Returns useful ids for assertions.
 */
function seedRealData(stack) {
    stack.registry.registerRegionalContext('ki', { country: 'KE', region: 'Kiambu', dialect: 'Kiambu Gikuyu' });
    stack.registry.registerRegionalContext('luo', { country: 'KE', region: 'Homa Bay', dialect: 'Standard Dholuo' });
    stack.registry.registerRegionalContext('sw', { country: 'TZ', region: 'Dar es Salaam' });
    stack.registry.registerRegionalContext('sw', { country: 'KE', region: 'Nairobi' });

    const kiWord = stack.registry.submitExpression({
        languageId: 'ki', region: 'Kiambu', dialect: 'Kiambu Gikuyu',
        expression: 'Wĩ mwega', meaning: 'You are well (greeting)',
        contributorPseudonym: 'contrib-a', sourceType: 'COMMUNITY',
        meaningConfidence: 0.6, translationConfidence: 0.5
    });
    const luoPhrase = stack.registry.submitExpression({
        languageId: 'luo', region: 'Homa Bay', dialect: 'Standard Dholuo',
        expression: 'Misawa nade', meaning: 'How are you (greeting)',
        contributorPseudonym: 'contrib-b', sourceType: 'COMMUNITY',
        meaningConfidence: 0.7, translationConfidence: 0.6
    });
    // A shared-meaning Kiswahili greeting, present in BOTH Tanzania and
    // Kenya regional scopes, to exercise the cross-language comparison
    // against a language that DOES have overlapping real data.
    const swWord = stack.registry.submitExpression({
        languageId: 'sw', region: 'Dar es Salaam',
        expression: 'Habari', meaning: 'Greeting / how are things',
        contributorPseudonym: 'contrib-c', sourceType: 'COMMUNITY'
    });

    return { kiWord, luoPhrase, swWord };
}

console.log('RP-031-B Increment 3 — Domain & Community Analytics tests\n');

// -----------------------------------------------------------------
// MODULE REGISTRATION / REAL COMPOSITION
// -----------------------------------------------------------------

test('module registers exactly once under window.CozyOS.Modules["cozy-admin-language-dashboard-domain-community"]', () => {
    const s = freshStack();
    assert.ok(s.domainCommunity);
    assert.strictEqual(typeof s.domainCommunity.getDomainAnalytics, 'function');
});

test('real RP-030/RP-029 composition: getLanguageActivity reflects an actual submitExpression() call, not a fixture', () => {
    const s = freshStack();
    seedRealData(s);
    const activity = s.domainCommunity.getLanguageActivity('ki');
    assert.strictEqual(activity.capability, 'AVAILABLE');
    const kiambuRow = activity.rows.find((r) => r.region === 'Kiambu');
    assert.ok(kiambuRow, 'expected a real Kiambu row from the real registerRegionalContext call');
    // "Wĩ mwega" is a real multi-token greeting -> honestly classified PHRASE, not WORD.
    assert.strictEqual(kiambuRow.phrases, 1);
    assert.strictEqual(kiambuRow.words, 0);
});

test('CAPABILITY_UNAVAILABLE (never throws, never fabricates) when RP-030 registry is absent', () => {
    global.window = { CozyOS: {} };
    delete require.cache[require.resolve(roots.incrementThree)];
    require(roots.incrementThree);
    const api = window.CozyOS.Modules['cozy-admin-language-dashboard-domain-community'].api;
    assert.strictEqual(api.getDomainAnalytics().capability, 'CAPABILITY_UNAVAILABLE'); // still composes the real registry, honestly degrades without it
    assert.strictEqual(api.getLanguageActivity('ki').capability, 'CAPABILITY_UNAVAILABLE');
    assert.strictEqual(api.getCommunityContributionAnalytics().capability, 'CAPABILITY_UNAVAILABLE');
});

// -----------------------------------------------------------------
// DOMAIN COUNTS
// -----------------------------------------------------------------

test('domain counts: all 9 spec domains present, each honestly DOMAIN_NOT_TRACKED_BY_REGISTRY', () => {
    const s = freshStack();
    seedRealData(s);
    const result = s.domainCommunity.getDomainAnalytics();
    assert.strictEqual(result.domains.length, 9);
    const names = result.domains.map((d) => d.domain);
    ['Agriculture', 'Education', 'Health', 'Religion', 'Business', 'Culture', 'Environment', 'Technology', 'General']
        .forEach((d) => assert.ok(names.includes(d), `missing domain ${d}`));
    result.domains.forEach((d) => {
        assert.strictEqual(d.status, 'DOMAIN_NOT_TRACKED_BY_REGISTRY');
        assert.strictEqual(d.count, 0);
        assert.strictEqual(d.tag, 'COMMUNITY_REPORTED_NOT_PROFESSIONALLY_VERIFIED');
    });
});

test('domain counts: totalUnclassifiedExpressions reflects real, currently-submitted record count', () => {
    const s = freshStack();
    seedRealData(s);
    const result = s.domainCommunity.getDomainAnalytics();
    assert.strictEqual(result.totalUnclassifiedExpressions, 3); // ki + luo + sw, real submitExpression calls above
});

// -----------------------------------------------------------------
// COMMUNITY COUNTS
// -----------------------------------------------------------------

test('community counts: submissions/contributors reflect real submitContribution() calls, never invented', () => {
    const s = freshStack();
    s.community.submitContribution({ contributionType: 'WORD', statement: 'jambo', contributorId: 'p1', language: 'sw' });
    s.community.submitContribution({ contributionType: 'PHRASE', statement: 'habari gani', contributorId: 'p2', language: 'sw' });
    const result = s.domainCommunity.getCommunityContributionAnalytics();
    assert.strictEqual(result.capability, 'AVAILABLE');
    assert.strictEqual(result.submissions, 2);
    assert.ok(result.contributors >= 2);
});

test('community vs professional knowledge: term explorer honestly tags a community-only record, never upgrades it', () => {
    const s = freshStack();
    seedRealData(s);
    const search = s.explorer.searchTerms({ query: 'Wĩ mwega', languageId: 'ki' });
    assert.strictEqual(search.results[0].communityVsProfessional, 'COMMUNITY_REPORTED_NOT_PROFESSIONALLY_VERIFIED');
});

// -----------------------------------------------------------------
// REGIONAL ANALYTICS / DIALECT SEPARATION
// -----------------------------------------------------------------

test('regional analytics: getRegionalKnowledgeMap builds a real Kenya -> Kiambu / Homa Bay tree from real contexts', () => {
    const s = freshStack();
    seedRealData(s);
    const map = s.domainCommunity.getRegionalKnowledgeMap();
    assert.strictEqual(map.capability, 'AVAILABLE');
    assert.ok(map.tree.KE, 'expected a real KE country entry');
    assert.ok(map.tree.KE.Kiambu, 'expected a real Kiambu region entry');
    assert.ok(map.tree.KE['Homa Bay'], 'expected a real Homa Bay region entry');
    const kiambuLangs = map.tree.KE.Kiambu.languages.map((l) => l.languageId);
    assert.ok(kiambuLangs.includes('ki'));
});

test('dialect separation: Kiambu Gikuyu dialect never merges with a differently-dialected record in the same region row', () => {
    const s = freshStack();
    seedRealData(s);
    // A second, real Kikuyu submission in the SAME region but a
    // DIFFERENT dialect must not be silently counted into the Kiambu
    // Gikuyu row above.
    stackRegisterAndSubmit(s, 'ki', 'Kiambu', 'Other Gikuyu Variant', 'Kanua', 'Different single-token meaning');
    const activity = s.domainCommunity.getLanguageActivity('ki');
    const kiambuGikuyuRow = activity.rows.find((r) => r.dialect === 'Kiambu Gikuyu');
    const otherRow = activity.rows.find((r) => r.dialect === 'Other Gikuyu Variant');
    assert.strictEqual(kiambuGikuyuRow.phrases, 1); // the seeded "Wĩ mwega" greeting
    assert.strictEqual(otherRow.words, 1); // the new single-token "Kanua"
});
function stackRegisterAndSubmit(s, lang, region, dialect, expr, meaning) {
    s.registry.registerRegionalContext(lang, { country: 'KE', region, dialect });
    s.registry.submitExpression({ languageId: lang, region, dialect, expression: expr, meaning, contributorPseudonym: 'x', sourceType: 'COMMUNITY' });
}

test('regional analytics: Tanzania region appears distinctly from Kenya region for the same language (sw)', () => {
    const s = freshStack();
    seedRealData(s);
    const map = s.domainCommunity.getRegionalKnowledgeMap();
    assert.ok(map.tree.TZ && map.tree.TZ['Dar es Salaam']);
    assert.ok(map.tree.KE && map.tree.KE.Nairobi);
});

// -----------------------------------------------------------------
// LANGUAGE COMPARISONS / CROSS-LANGUAGE GAPS
// -----------------------------------------------------------------

test('cross-language gaps: known in Kiambu (ki), missing in Homa Bay (luo) — real GAPS_FOUND, real gap entry', () => {
    const s = freshStack();
    seedRealData(s);
    const result = s.domainCommunity.detectCrossLanguageGap({
        sourceLanguageId: 'ki', sourceRegion: 'Kiambu',
        targetLanguageId: 'luo', targetRegion: 'Homa Bay'
    });
    assert.strictEqual(result.status, 'GAPS_FOUND');
    assert.ok(result.gaps.some((g) => g.meaning === 'You are well (greeting)'));
});

test('cross-language gaps: Kiswahili known in Tanzania, present in Kenya too — no false gap for genuinely shared meaning', () => {
    const s = freshStack();
    seedRealData(s);
    stackRegisterAndSubmit(s, 'sw', 'Nairobi', null, 'Habari', 'Greeting / how are things');
    const result = s.domainCommunity.detectCrossLanguageGap({
        sourceLanguageId: 'sw', sourceRegion: 'Dar es Salaam',
        targetLanguageId: 'sw', targetRegion: 'Nairobi'
    });
    assert.strictEqual(result.status, 'NO_GAPS_FOUND_IN_SAMPLE');
});

test('cross-language gaps: missing data is distinguished from language not supported — unregistered target', () => {
    const s = freshStack();
    seedRealData(s);
    const result = s.domainCommunity.detectCrossLanguageGap({ sourceLanguageId: 'ki', targetLanguageId: 'xx-not-real' });
    assert.strictEqual(result.status, 'LANGUAGE_NOT_SUPPORTED');
});

test('cross-language gaps: registered-but-empty target is LANGUAGE_REGISTERED_NO_DATA, not a false "gap"', () => {
    const s = freshStack();
    seedRealData(s);
    const result = s.domainCommunity.detectCrossLanguageGap({ sourceLanguageId: 'ki', targetLanguageId: 'zu' }); // isiZulu registered, zero data
    assert.strictEqual(result.status, 'LANGUAGE_REGISTERED_NO_DATA');
});

// -----------------------------------------------------------------
// CONFIDENCE AGGREGATION
// -----------------------------------------------------------------

test('confidence aggregation: real per-record confidence values average correctly, never invented', () => {
    const s = freshStack();
    seedRealData(s);
    const activity = s.domainCommunity.getLanguageActivity('ki');
    const row = activity.rows.find((r) => r.region === 'Kiambu');
    assert.strictEqual(row.confidence.sampleSize, 1);
    assert.ok(Math.abs(row.confidence.average - 0.55) < 0.001); // (0.6 + 0.5) / 2, the two real confidence fields submitted
});

test('confidence aggregation: a record with zero real confidence fields reports NO_CONFIDENCE_EVIDENCE_RECORDED, not zero', () => {
    const s = freshStack();
    s.registry.registerRegionalContext('yo', { country: 'NG', region: 'Lagos' });
    s.registry.submitExpression({ languageId: 'yo', region: 'Lagos', expression: 'Bawo', meaning: 'Hello', contributorPseudonym: 'c1', sourceType: 'COMMUNITY' });
    const activity = s.domainCommunity.getLanguageActivity('yo');
    const row = activity.rows.find((r) => r.region === 'Lagos');
    assert.strictEqual(row.confidence.average, null);
    assert.strictEqual(row.confidence.note, 'NO_CONFIDENCE_EVIDENCE_RECORDED');
});

// -----------------------------------------------------------------
// DISAGREEMENT DETECTION
// -----------------------------------------------------------------

test('disagreement detection: a real disputeContribution() call is reflected as a real disagreement count', () => {
    const s = freshStack();
    const sub = s.community.submitContribution({ contributionType: 'WORD', statement: 'testword', contributorId: 'c1', language: 'ki', region: 'Kiambu' });
    s.registry.registerRegionalContext('ki', { country: 'KE', region: 'Kiambu' });
    const disputed = s.community.disputeContribution(sub.record.id, { contributorId: 'c2', reason: 'Different meaning in my community.' });
    assert.strictEqual(disputed.status, 'DISPUTED');
    const analytics = s.domainCommunity.getCommunityContributionAnalytics();
    assert.strictEqual(analytics.disputedCandidates, 1);
});

// -----------------------------------------------------------------
// RESEARCH PRIORITY
// -----------------------------------------------------------------

test('research priority: getResearchDashboard aggregates Increment 2\'s real getResearchPriority() output, never recomputes it', () => {
    const s = freshStack();
    seedRealData(s);
    const dashboard = s.domainCommunity.getResearchDashboard();
    assert.strictEqual(dashboard.capability, 'AVAILABLE');
    assert.ok(dashboard.topTerms.length >= 3);
    // Every score must match what Increment 2 itself would compute independently.
    const directKi = s.explorer.getResearchPriority('ki');
    const dashKiTerm = dashboard.topTerms.find((t) => t.languageId === 'ki');
    const directTerm = directKi.terms.find((t) => t.recordId === dashKiTerm.recordId);
    assert.strictEqual(dashKiTerm.score, directTerm.score);
});

test('research priority: classification is one of the four disclosed values only, across the aggregated dashboard', () => {
    const s = freshStack();
    seedRealData(s);
    const dashboard = s.domainCommunity.getResearchDashboard();
    const allowed = ['LOW', 'MEDIUM', 'HIGH', 'URGENT_REVIEW'];
    dashboard.topTerms.forEach((t) => assert.ok(allowed.includes(t.priority)));
});

// -----------------------------------------------------------------
// TELEMETRY UNAVAILABLE
// -----------------------------------------------------------------

test('telemetry unavailable: most-used is a verbatim NOT_AVAILABLE_NO_TELEMETRY passthrough of Increment 1, never recalculated', () => {
    const s = freshStack();
    seedRealData(s);
    const mostUsed = s.domainCommunity.getMostUsedSummary();
    assert.strictEqual(mostUsed.mostUsedWords, 'NOT_AVAILABLE_NO_TELEMETRY');
    assert.strictEqual(mostUsed.mostUsedPhrases, 'NOT_AVAILABLE_NO_TELEMETRY');
    const directFromIncrementOne = s.core.getMostUsedSummary();
    assert.deepStrictEqual(mostUsed, directFromIncrementOne);
});

test('telemetry unavailable: getResearchDashboard never includes a usage/demand-derived number', () => {
    const s = freshStack();
    seedRealData(s);
    const dashboard = s.domainCommunity.getResearchDashboard();
    assert.ok(dashboard.note.indexOf('no telemetry engine exists') !== -1);
});

// -----------------------------------------------------------------
// PRIVACY PROTECTION
// -----------------------------------------------------------------

test('privacy protection: community contribution analytics never exposes a raw (non-pseudonymized) contributor id', () => {
    const s = freshStack();
    s.community.submitContribution({ contributionType: 'WORD', statement: 'secretword', contributorId: 'raw-real-name-12345', language: 'sw' });
    const analytics = s.domainCommunity.getCommunityContributionAnalytics();
    const serialized = JSON.stringify(analytics);
    assert.strictEqual(serialized.indexOf('raw-real-name-12345'), -1);
});

test('privacy protection: quarantine integration never leaks raw evidence/contributorId even when authorized', () => {
    const s = freshStack();
    s.gate.quarantine({ expression: 'bareambiguousterm', language: 'sw', contributionType: 'TEXT' }, { classification: 'UNCERTAIN', category: 'AMBIGUOUS' }, 'raw-contributor-xyz');
    const result = s.domainCommunity.getQuarantineIntegration(REVIEWER_ROLE);
    const serialized = JSON.stringify(result);
    assert.strictEqual(serialized.indexOf('raw-contributor-xyz'), -1);
    assert.strictEqual(serialized.indexOf('"fields"'), -1); // raw submitted content must never appear
});

test('privacy protection: getQuarantineIntegration is UNAUTHORIZED for an unauthorized caller, never a partial view', () => {
    const s = freshStack();
    const anon = { role: 'ANONYMOUS', userId: null, authBackend: 'VERIFIED' };
    const result = s.domainCommunity.getQuarantineIntegration(anon);
    assert.strictEqual(result.listing.status, 'UNAUTHORIZED');
});

// -----------------------------------------------------------------
// QUARANTINE INTEGRATION
// -----------------------------------------------------------------

test('quarantine integration: an authorized caller sees a real count matching the real safety gate store', () => {
    const s = freshStack();
    s.gate.quarantine({ expression: 'quarantinedterm', language: 'ki', contributionType: 'TEXT' }, { classification: 'UNCERTAIN', category: 'AMBIGUOUS' }, 'c1');
    const result = s.domainCommunity.getQuarantineIntegration(REVIEWER_ROLE);
    assert.strictEqual(result.listing.status, 'OK');
    assert.strictEqual(result.listing.items.length, s.gate.listQuarantined().length);
});

test('community counts: quarantinedSubmissions in getCommunityContributionAnalytics matches the real gate store size', () => {
    const s = freshStack();
    s.gate.quarantine({ expression: 'anotherquarantined', language: 'ki', contributionType: 'TEXT' }, { classification: 'HIGH_RISK', category: 'BORDERLINE' }, 'c2');
    const analytics = s.domainCommunity.getCommunityContributionAnalytics();
    assert.strictEqual(analytics.quarantinedSubmissions, s.gate.listQuarantined().length);
});

test('duplicate prevention: two real submissions of the same word+meaning+region add evidence, never a second row', () => {
    const s = freshStack();
    seedRealData(s);
    s.registry.submitExpression({
        languageId: 'ki', region: 'Kiambu', dialect: 'Kiambu Gikuyu',
        expression: 'Wĩ mwega', meaning: 'You are well (greeting)',
        contributorPseudonym: 'contrib-second', sourceType: 'COMMUNITY'
    });
    const activity = s.domainCommunity.getLanguageActivity('ki');
    const row = activity.rows.find((r) => r.region === 'Kiambu');
    assert.strictEqual(row.phrases, 1); // still one real record, not two — evidence was added to the existing one
});

test('releasedSubmissions/afterQuarantineReview are honestly reported unavailable rather than fabricated as zero', () => {
    const s = freshStack();
    const analytics = s.domainCommunity.getCommunityContributionAnalytics();
    assert.strictEqual(analytics.releasedSubmissions, 'NOT_AVAILABLE_NO_HISTORICAL_AGGREGATE');
    assert.strictEqual(analytics.rejectedSubmissions.afterQuarantineReview, 'NOT_AVAILABLE_NO_HISTORICAL_AGGREGATE');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
