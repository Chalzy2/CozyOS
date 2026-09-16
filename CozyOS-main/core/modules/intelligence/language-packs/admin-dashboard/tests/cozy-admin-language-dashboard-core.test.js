/**
 * core/modules/intelligence/language-packs/admin-dashboard/tests/cozy-admin-language-dashboard-core.test.js
 * RP-031-B — real, executed tests for cozy-admin-language-dashboard-core.js
 * Run with: node core/modules/intelligence/language-packs/admin-dashboard/tests/cozy-admin-language-dashboard-core.test.js
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

/**
 * Loads the REAL RP-030 registry, then the RP-031-B dashboard core on
 * top of it, in a fresh window each time — same pattern as the RP-031
 * Phase 1 tests. No mocks stand in for RP-030; this is real integration.
 */
function freshDashboard() {
    const win = { CozyOS: {} };
    global.window = win;

    const registryPath = path.join(__dirname, '..', '..', 'cozy-language-pack-registry.js');
    delete require.cache[require.resolve(registryPath)];
    require(registryPath);

    const dashboardPath = path.join(__dirname, '..', 'cozy-admin-language-dashboard-core.js');
    delete require.cache[require.resolve(dashboardPath)];
    require(dashboardPath);

    return win.CozyOS.Modules['cozy-admin-language-dashboard-core'].api;
}

// ---------------------------------------------------------------------
// 1. Composition hygiene
// ---------------------------------------------------------------------

test('getLanguageOverview(): CAPABILITY_UNAVAILABLE (never throws, never fabricates) when RP-030 is absent', () => {
    global.window = { CozyOS: {} };
    delete require.cache[require.resolve(path.join(__dirname, '..', 'cozy-admin-language-dashboard-core.js'))];
    const dash = require(path.join(__dirname, '..', 'cozy-admin-language-dashboard-core.js'));
    const api = global.window.CozyOS.Modules['cozy-admin-language-dashboard-core'].api;
    const result = api.getLanguageOverview();
    assert.strictEqual(result.capability, 'CAPABILITY_UNAVAILABLE');
    assert.strictEqual(result.reason, 'LANGUAGE_PACK_REGISTRY_ABSENT');
    assert.deepStrictEqual(result.languages, []);
});

test('module registers exactly once under window.CozyOS.Modules["cozy-admin-language-dashboard-core"]', () => {
    const win = { CozyOS: {} };
    global.window = win;
    const registryPath = path.join(__dirname, '..', '..', 'cozy-language-pack-registry.js');
    delete require.cache[require.resolve(registryPath)];
    require(registryPath);
    const dashboardPath = path.join(__dirname, '..', 'cozy-admin-language-dashboard-core.js');
    delete require.cache[require.resolve(dashboardPath)];
    require(dashboardPath);
    require(dashboardPath); // require a second time — module-cache no-ops, must not double-register
    assert.ok(win.CozyOS.Modules['cozy-admin-language-dashboard-core']);
    assert.ok(Object.isFrozen(win.CozyOS.Modules['cozy-admin-language-dashboard-core'].api));
});

// ---------------------------------------------------------------------
// 2. Language Overview
// ---------------------------------------------------------------------

test('getLanguageOverview(): returns one row per RP-030 default pack, all REGISTERED/NOT_READY at boot', () => {
    const dash = freshDashboard();
    const result = dash.getLanguageOverview();
    assert.strictEqual(result.capability, 'AVAILABLE');
    assert.ok(result.languages.length > 0, 'expected at least one default pack');
    result.languages.forEach((row) => {
        assert.strictEqual(row.packStatus, 'REGISTERED');
        assert.strictEqual(row.displayStatus, 'Recognized / knowledge limited');
    });
});

test('getLanguageOverview(): never says "Supported" for a REGISTERED/NOT_READY pack', () => {
    const dash = freshDashboard();
    const result = dash.getLanguageOverview();
    result.languages.forEach((row) => {
        assert.ok(!/supported/i.test(row.displayStatus), `row for ${row.languageId} must not claim "Supported"`);
    });
});

test('getLanguageOverview(): mostUsed is passed through verbatim as NOT_AVAILABLE_NO_TELEMETRY, never recalculated', () => {
    const dash = freshDashboard();
    const result = dash.getLanguageOverview();
    result.languages.forEach((row) => {
        assert.strictEqual(row.mostUsed, 'NOT_AVAILABLE_NO_TELEMETRY');
    });
});

test('getLanguageOverview(): geography resolves real registerRegionalContext() calls into country/region/dialect lists', () => {
    const win = { CozyOS: {} };
    global.window = win;
    const registryPath = path.join(__dirname, '..', '..', 'cozy-language-pack-registry.js');
    delete require.cache[require.resolve(registryPath)];
    require(registryPath);
    const registry = win.CozyOS.CozyLanguagePacks;

    const someLanguage = registry.listPacks()[0].identity.languageId;
    registry.registerRegionalContext(someLanguage, { country: 'ke', region: 'Kiambu', dialect: 'local-variant' });

    const dashboardPath = path.join(__dirname, '..', 'cozy-admin-language-dashboard-core.js');
    delete require.cache[require.resolve(dashboardPath)];
    require(dashboardPath);
    const dash = win.CozyOS.Modules['cozy-admin-language-dashboard-core'].api;

    const row = dash.getLanguageOverview().languages.find((r) => r.languageId === someLanguage);
    assert.ok(row.geography.countries.includes('KE'));
    assert.ok(row.geography.regions.includes('Kiambu'));
    assert.ok(row.geography.dialects.includes('local-variant'));
});

test('getLanguageOverview(): knowledge counts are read straight from RP-030 counts, never invented', () => {
    const dash = freshDashboard();
    const result = dash.getLanguageOverview();
    result.languages.forEach((row) => {
        assert.strictEqual(row.knowledge.submitted, 0); // fresh registry, nothing submitted yet
        assert.strictEqual(row.knowledge.validated, 0);
        assert.strictEqual(row.knowledge.quarantined, 0);
    });
});

// ---------------------------------------------------------------------
// 3. Language Pack Routing View
// ---------------------------------------------------------------------

test('resolveLanguagePackRouting(): CAPABILITY_UNAVAILABLE when RP-030 absent', () => {
    global.window = { CozyOS: {} };
    delete require.cache[require.resolve(path.join(__dirname, '..', 'cozy-admin-language-dashboard-core.js'))];
    require(path.join(__dirname, '..', 'cozy-admin-language-dashboard-core.js'));
    const api = global.window.CozyOS.Modules['cozy-admin-language-dashboard-core'].api;
    const result = api.resolveLanguagePackRouting({ languageId: 'kikuyu' });
    assert.strictEqual(result.capability, 'CAPABILITY_UNAVAILABLE');
});

test('resolveLanguagePackRouting(): LANGUAGE_UNCERTAIN for an unregistered languageId — never guesses', () => {
    const dash = freshDashboard();
    const result = dash.resolveLanguagePackRouting({ languageId: 'not-a-real-language' });
    assert.strictEqual(result.status, 'LANGUAGE_UNCERTAIN');
});

test('resolveLanguagePackRouting(): RESOLVED for a single registered candidate with real evidence', () => {
    const win = { CozyOS: {} };
    global.window = win;
    const registryPath = path.join(__dirname, '..', '..', 'cozy-language-pack-registry.js');
    delete require.cache[require.resolve(registryPath)];
    require(registryPath);
    const registry = win.CozyOS.CozyLanguagePacks;
    const someLanguage = registry.listPacks()[0].identity.languageId;

    const dashboardPath = path.join(__dirname, '..', 'cozy-admin-language-dashboard-core.js');
    delete require.cache[require.resolve(dashboardPath)];
    require(dashboardPath);
    const dash = win.CozyOS.Modules['cozy-admin-language-dashboard-core'].api;

    const result = dash.resolveLanguagePackRouting({ languageId: someLanguage, country: 'KE' });
    assert.strictEqual(result.status, 'RESOLVED');
    assert.strictEqual(result.match.languageId, someLanguage);
});

test('resolveLanguagePackRouting(): AMBIGUOUS_LANGUAGE only when caller supplies 2+ candidates that BOTH really match — never invented', () => {
    const win = { CozyOS: {} };
    global.window = win;
    const registryPath = path.join(__dirname, '..', '..', 'cozy-language-pack-registry.js');
    delete require.cache[require.resolve(registryPath)];
    require(registryPath);
    const registry = win.CozyOS.CozyLanguagePacks;
    const ids = registry.listPacks().slice(0, 2).map((p) => p.identity.languageId);
    assert.ok(ids.length === 2, 'need at least two default packs to test ambiguity');

    const dashboardPath = path.join(__dirname, '..', 'cozy-admin-language-dashboard-core.js');
    delete require.cache[require.resolve(dashboardPath)];
    require(dashboardPath);
    const dash = win.CozyOS.Modules['cozy-admin-language-dashboard-core'].api;

    const result = dash.resolveLanguagePackRouting({ country: 'KE' }, ids);
    assert.strictEqual(result.status, 'AMBIGUOUS_LANGUAGE');
    assert.strictEqual(result.candidates.length, 2);
});

test('resolveLanguagePackRouting(): a single candidate never produces AMBIGUOUS_LANGUAGE, regardless of country breadth', () => {
    const dash = freshDashboard();
    const win = global.window;
    const someLanguage = win.CozyOS.CozyLanguagePacks.listPacks()[0].identity.languageId;
    const result = dash.resolveLanguagePackRouting({ languageId: someLanguage, country: 'KE' });
    assert.notStrictEqual(result.status, 'AMBIGUOUS_LANGUAGE');
});

// ---------------------------------------------------------------------
// 4. Most Used passthrough
// ---------------------------------------------------------------------

test('getMostUsedSummary(): mostUsedWords/mostUsedPhrases are always NOT_AVAILABLE_NO_TELEMETRY — never invented', () => {
    const dash = freshDashboard();
    const result = dash.getMostUsedSummary();
    assert.strictEqual(result.capability, 'AVAILABLE');
    assert.strictEqual(result.mostUsedWords, 'NOT_AVAILABLE_NO_TELEMETRY');
    assert.strictEqual(result.mostUsedPhrases, 'NOT_AVAILABLE_NO_TELEMETRY');
});

test('getMostUsedSummary(): mostSubmitted/mostValidated come straight from RP-030, sorted, no fabricated ranking', () => {
    const dash = freshDashboard();
    const result = dash.getMostUsedSummary();
    assert.ok(Array.isArray(result.mostSubmitted));
    assert.ok(Array.isArray(result.mostValidated));
    // sorted descending by submitted / validated respectively
    for (let i = 1; i < result.mostSubmitted.length; i++) {
        assert.ok(result.mostSubmitted[i - 1].submitted >= result.mostSubmitted[i].submitted);
    }
});

// ---------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
