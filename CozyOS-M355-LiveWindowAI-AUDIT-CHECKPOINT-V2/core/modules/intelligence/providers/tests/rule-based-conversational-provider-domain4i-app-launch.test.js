'use strict';

/**
 * core/modules/intelligence/providers/tests/rule-based-conversational-provider-domain4i-app-launch.test.js
 *
 * Domain 4I dependency #1 (Application/Action Intent Routing) — real
 * regression coverage. Repository-wide search before writing this
 * confirmed the canonical, already-existing application registry is
 * window.CozyOS.listApplications() (core/registry/cozy-registry.js's
 * ServiceRegistry) — the exact same source
 * cozy-knowledge-registry.js's listApplicationsFact() already reads for
 * the "list-apps" intent. No new registry was created; this only adds
 * a real "app-launch" intent rule + resolution against that existing
 * source.
 *
 * These tests prove: correct classification in both languages, correct
 * resolution against a real (test-provided) application list, honest
 * non-fabrication when no application matches, correct exclusion of
 * informational/ambiguous questions from action classification, and —
 * critically — that recognizing/resolving the intent never itself
 * performs navigation or grants authorization (Domain 4I's own
 * action-boundary requirement: requiresAuthorization is always true,
 * and no launch ever happens here).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');

function makeFakeLivingAI() {
    const registered = new Map();
    return {
        registerProvider(name, provider) { registered.set(name, provider); return { success: true }; },
        setActiveProvider() { return { success: true }; },
        getActiveProvider() { return null; },
        _registered: registered,
    };
}
function makeFakeCoordinator() { return { async run() { return {}; } }; }
function makeFakeProviderManager() { return { register() {}, healthReport: () => ({}) }; }

function freshProvider({ apps = [{ id: 'quarryos', name: 'QuarryOS' }, { id: 'shopos', name: 'ShopOS' }] } = {}) {
    const files = [
        path.join(ROOT, 'core', 'modules', 'intelligence', 'language', 'cozy-language-registry.js'),
        path.join(ROOT, 'core', 'modules', 'intelligence', 'language', 'cozy-language-templates.js'),
        path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-public-knowledge-source.js'),
        path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js'),
        path.join(ROOT, 'core', 'modules', 'intelligence', 'providers', 'rule-based-conversational-provider.js'),
    ];
    files.forEach((p) => delete require.cache[require.resolve(p)]);
    const fakeWindow = {
        CozyOS: {
            LivingAI: makeFakeLivingAI(),
            CognitiveCoordinator: makeFakeCoordinator(),
            ProviderManager: makeFakeProviderManager(),
            // The real, canonical source: window.CozyOS.listApplications()
            // (core/registry/cozy-registry.js), stubbed here to a real,
            // controlled test list — not a second registry.
            listApplications: () => apps,
        },
    };
    global.window = fakeWindow;
    files.forEach((p) => require(p));
    return fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational');
}

// ---- Kiswahili ----

test('KISWAHILI: "Nifungulie QuarryOS." -> app-launch, correctly resolved to QuarryOS', async () => {
    const provider = freshProvider();
    const result = await provider.think('Nifungulie QuarryOS.');
    assert.equal(result.result.intent, 'app-launch');
    assert.deepEqual(result.result.application, { id: 'quarryos', name: 'QuarryOS' });
});

test('KISWAHILI: "Nataka kufungua QuarryOS." -> app-launch, correctly resolved', async () => {
    const provider = freshProvider();
    const result = await provider.think('Nataka kufungua QuarryOS.');
    assert.equal(result.result.intent, 'app-launch');
    assert.deepEqual(result.result.application, { id: 'quarryos', name: 'QuarryOS' });
});

test('KISWAHILI: "Fungua QuarryOS." -> app-launch, correctly resolved', async () => {
    const provider = freshProvider();
    const result = await provider.think('Fungua QuarryOS.');
    assert.equal(result.result.intent, 'app-launch');
    assert.deepEqual(result.result.application, { id: 'quarryos', name: 'QuarryOS' });
});

// ---- English ----

test('ENGLISH: "Open QuarryOS." -> app-launch, correctly resolved', async () => {
    const provider = freshProvider();
    const result = await provider.think('Open QuarryOS.');
    assert.equal(result.result.intent, 'app-launch');
    assert.deepEqual(result.result.application, { id: 'quarryos', name: 'QuarryOS' });
});

test('ENGLISH: "I want to open QuarryOS." -> app-launch, correctly resolved', async () => {
    const provider = freshProvider();
    const result = await provider.think('I want to open QuarryOS.');
    assert.equal(result.result.intent, 'app-launch');
    assert.deepEqual(result.result.application, { id: 'quarryos', name: 'QuarryOS' });
});

test('ENGLISH: "Launch QuarryOS." -> app-launch, correctly resolved', async () => {
    const provider = freshProvider();
    const result = await provider.think('Launch QuarryOS.');
    assert.equal(result.result.intent, 'app-launch');
    assert.deepEqual(result.result.application, { id: 'quarryos', name: 'QuarryOS' });
});

// ---- Negative / ambiguous: informational questions must NOT become app-launch ----

test('NEGATIVE: "QuarryOS ni nini?" (what is QuarryOS) does NOT classify as app-launch', async () => {
    const provider = freshProvider();
    const result = await provider.think('QuarryOS ni nini?');
    assert.notEqual(result.result.intent, 'app-launch');
});

test('NEGATIVE: "Je, QuarryOS ipo?" (is QuarryOS available) does NOT classify as app-launch', async () => {
    const provider = freshProvider();
    const result = await provider.think('Je, QuarryOS ipo?');
    assert.notEqual(result.result.intent, 'app-launch');
});

test('NEGATIVE: "Naweza kutumia QuarryOS?" (can I use QuarryOS) does NOT classify as app-launch', async () => {
    const provider = freshProvider();
    const result = await provider.think('Naweza kutumia QuarryOS?');
    assert.notEqual(result.result.intent, 'app-launch');
});

// ---- Unresolvable target: honest, never fabricated ----

test('"Fungua programu yangu." (open my app, no name given) classifies as app-launch but resolves to NO application — never invents one', async () => {
    const provider = freshProvider();
    const result = await provider.think('Fungua programu yangu.');
    assert.equal(result.result.intent, 'app-launch');
    assert.equal(result.result.application, null);
    assert.match(result.result.text, /couldn't find|Sikuweza kupata/);
});

test('an app-launch request for a genuinely nonexistent application resolves to null, never a fabricated match', async () => {
    const provider = freshProvider({ apps: [{ id: 'quarryos', name: 'QuarryOS' }] });
    const result = await provider.think('Open TotallyMadeUpAppXYZ.');
    assert.equal(result.result.intent, 'app-launch');
    assert.equal(result.result.application, null);
});

// ---- Authorization boundary ----

test('AUTHORIZATION BOUNDARY: a resolved app-launch always reports a real requiresAuthorization/authorizationState and never claims the app was opened', async () => {
    const provider = freshProvider();
    // Domain 4I dependency #2 note: no actorId is supplied here, so the
    // real authorization check (added after this test was first
    // written) honestly reports AUTHORIZATION_REQUIRED (not
    // authenticated) rather than the earlier placeholder "requires
    // authorization to be checked" message — a real improvement, not a
    // regression. See rule-based-conversational-provider-domain4i-
    // authorization.test.js for dedicated coverage of granted/denied/
    // required outcomes.
    const result = await provider.think('Open QuarryOS.');
    assert.equal(result.result.requiresAuthorization, true);
    assert.equal(result.result.authorizationState, 'AUTHORIZATION_REQUIRED');
    assert.doesNotMatch(result.result.text, /has been opened|opening now|launched successfully/i);
});

test('requiresAuthorization/application fields are absent for unrelated intents (no unnecessary fields added)', async () => {
    const provider = freshProvider();
    const result = await provider.think('What is CozyOS?');
    assert.equal('application' in result.result, false);
    assert.equal('requiresAuthorization' in result.result, false);
});

// ---- Regression: specific nav-* targets still win over the generic rule ----

test('REGRESSION: "Open the dashboard" still resolves to the specific nav-dashboard intent, not the generic app-launch rule', async () => {
    const provider = freshProvider();
    const result = await provider.think('Open the dashboard');
    assert.equal(result.result.intent, 'nav-dashboard');
});

test('REGRESSION: "Fungua akaunti" (open an account) still resolves to how-to-register, not app-launch', async () => {
    const provider = freshProvider();
    const result = await provider.think('Fungua akaunti');
    assert.equal(result.result.intent, 'how-to-register');
});

// ---- Registry not loaded: honest degrade ----

test('if the application registry is not loaded, app-launch is still classified but resolves to no application, never a crash or fabrication', async () => {
    delete require.cache[require.resolve(path.join(ROOT, 'core', 'modules', 'intelligence', 'providers', 'rule-based-conversational-provider.js'))];
    const fakeWindow = { CozyOS: { LivingAI: makeFakeLivingAI(), CognitiveCoordinator: makeFakeCoordinator(), ProviderManager: makeFakeProviderManager() } };
    global.window = fakeWindow;
    require(path.join(ROOT, 'core', 'modules', 'intelligence', 'providers', 'rule-based-conversational-provider.js'));
    const provider = fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational');
    const result = await provider.think('Open QuarryOS.');
    assert.equal(result.result.intent, 'app-launch');
    assert.equal(result.result.application, null);
});
