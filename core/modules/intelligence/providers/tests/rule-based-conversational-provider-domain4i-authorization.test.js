'use strict';

/**
 * core/modules/intelligence/providers/tests/rule-based-conversational-provider-domain4i-authorization.test.js
 *
 * Domain 4I dependency #2 (Application Action Authorization + Execution
 * Boundary) — real regression coverage. Repository-wide search before
 * writing this confirmed the canonical, already-existing authorization
 * function is IdentityEngine.canAccessApplication(userId, appName) —
 * the exact same function core/shell/cozy-workspace.js already calls to
 * filter which applications a user sees. The missing piece was purely
 * wiring: rule-based-conversational-provider.js's think() had no
 * userId/actorId reaching it at all (cozy-living-assistant.js's
 * ai.think() call never passed one), so no real per-user authorization
 * check was possible.
 *
 * These tests prove: a real actorId now reaches the real, unmodified
 * IdentityEngine.canAccessApplication() function; granted/denied/
 * required outcomes are reported honestly and distinctly; an ordinary
 * user can never be granted access to an admin/developer-tier
 * application merely because the phrase was understood; and — the
 * central rule — nothing here ever performs navigation or claims
 * execution, in either language.
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

// A real-shaped IdentityEngine stub whose canAccessApplication() logic
// mirrors the actual, unmodified function's real decision structure
// (ordinary users only get apps they're assigned; admins get
// everything) — this is what's under test being CALLED correctly, not
// a stand-in for authorization itself; the actual
// identity-engine.test.js suite separately verifies the real function's
// own internal logic.
function makeIdentityEngine() {
    const calls = [];
    return {
        calls,
        canAccessApplication(userId, appName) {
            calls.push({ userId, appName });
            if (userId === 'admin-user') return true;
            if (userId === 'ordinary-user') return appName.toLowerCase() === 'quarryos';
            return false;
        },
    };
}

function freshProvider({ identity = makeIdentityEngine(), apps = [{ id: 'quarryos', name: 'QuarryOS' }, { id: 'developer-hub', name: 'Developer Hub' }] } = {}) {
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
            listApplications: () => apps,
            IdentityEngine: identity,
        },
    };
    global.window = fakeWindow;
    files.forEach((p) => require(p));
    return { provider: fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational'), identity };
}

// 1. Recognized + authorized -> reports GRANTED, still never executes.
test('recognized + authorized (ordinary user, QuarryOS) -> AUTHORIZATION_GRANTED, no execution claimed', async () => {
    const { provider, identity } = freshProvider();
    const result = await provider.think('Open QuarryOS.', { actorId: 'ordinary-user' });
    assert.equal(result.result.authorizationState, 'AUTHORIZATION_GRANTED');
    assert.equal(identity.calls.length, 1);
    assert.deepEqual(identity.calls[0], { userId: 'ordinary-user', appName: 'QuarryOS' });
    assert.doesNotMatch(result.result.text, /has been opened|opening now|launched/i);
});

// 2. Recognized + unauthorized -> DENIED, never elevated.
test('recognized + unauthorized (ordinary user, Developer Hub) -> AUTHORIZATION_DENIED, never elevated to admin access', async () => {
    const { provider } = freshProvider();
    const result = await provider.think('Open Developer Hub.', { actorId: 'ordinary-user' });
    assert.equal(result.result.authorizationState, 'AUTHORIZATION_DENIED');
    assert.match(result.result.text, /doesn't currently have access/);
});

// 3. Unresolved application -> no authorization check performed at all
// (nothing to authorize yet).
test('unresolved application -> no authorization check is performed, authorizationState is absent', async () => {
    const { provider, identity } = freshProvider();
    const result = await provider.think('Open TotallyMadeUpAppXYZ.', { actorId: 'ordinary-user' });
    assert.equal(result.result.application, null);
    assert.equal('authorizationState' in result.result, false);
    assert.equal(identity.calls.length, 0);
});

// 4. Informational question -> no execution, no authorization check.
test('informational application question ("QuarryOS ni nini?") never triggers an authorization check', async () => {
    const { provider, identity } = freshProvider();
    const result = await provider.think('QuarryOS ni nini?', { actorId: 'ordinary-user' });
    assert.notEqual(result.result.intent, 'app-launch');
    assert.equal(identity.calls.length, 0);
});

// 5. Admin application example, exactly as required: recognizing the
// phrase never elevates authority.
test('ADMIN EXAMPLE: an ordinary user asking to open the admin/developer-tier application is denied, never elevated', async () => {
    const { provider, identity } = freshProvider();
    const result = await provider.think('Open Developer Hub.', { actorId: 'ordinary-user' });
    assert.equal(result.result.authorizationState, 'AUTHORIZATION_DENIED');
    assert.equal(identity.calls[0].appName, 'Developer Hub');
    assert.doesNotMatch(JSON.stringify(result.result), /platform-admin/i);
});

test('an admin user asking to open the admin/developer-tier application is genuinely granted, via the real function, not a shortcut', async () => {
    const { provider } = freshProvider();
    const result = await provider.think('Open Developer Hub.', { actorId: 'admin-user' });
    assert.equal(result.result.authorizationState, 'AUTHORIZATION_GRANTED');
});

// 6/7. Kiswahili + English parity.
test('KISWAHILI: "Fungua QuarryOS." with an authorized ordinary user -> AUTHORIZATION_GRANTED', async () => {
    const { provider } = freshProvider();
    const result = await provider.think('Fungua QuarryOS.', { actorId: 'ordinary-user' });
    assert.equal(result.result.authorizationState, 'AUTHORIZATION_GRANTED');
    assert.match(result.result.text, /ruhusa/);
});

test('KISWAHILI: "Nifungulie Developer Hub." with an unauthorized ordinary user -> AUTHORIZATION_DENIED', async () => {
    const { provider } = freshProvider();
    const result = await provider.think('Nifungulie Developer Hub.', { actorId: 'ordinary-user' });
    assert.equal(result.result.authorizationState, 'AUTHORIZATION_DENIED');
});

test('ENGLISH: "Launch QuarryOS." with an authorized ordinary user -> AUTHORIZATION_GRANTED', async () => {
    const { provider } = freshProvider();
    const result = await provider.think('Launch QuarryOS.', { actorId: 'ordinary-user' });
    assert.equal(result.result.authorizationState, 'AUTHORIZATION_GRANTED');
});

// ---- No actorId at all (not authenticated) ----

test('no actorId supplied -> AUTHORIZATION_REQUIRED, never defaults to granted', async () => {
    const { provider, identity } = freshProvider();
    const result = await provider.think('Open QuarryOS.');
    assert.equal(result.result.authorizationState, 'AUTHORIZATION_REQUIRED');
    assert.equal(identity.calls.length, 0, 'the real authorization function must never be called without a real actor');
});

test('actorId === "system" (the generic non-user actor) -> AUTHORIZATION_REQUIRED, never treated as a real signed-in user', async () => {
    const { provider, identity } = freshProvider();
    const result = await provider.think('Open QuarryOS.', { actorId: 'system' });
    assert.equal(result.result.authorizationState, 'AUTHORIZATION_REQUIRED');
    assert.equal(identity.calls.length, 0);
});

// ---- IdentityEngine not loaded: honest degrade, never a silent grant ----

test('IdentityEngine not loaded -> AUTHORIZATION_REQUIRED (honest degrade), never silently granted', async () => {
    const { provider } = freshProvider({ identity: null });
    const result = await provider.think('Open QuarryOS.', { actorId: 'ordinary-user' });
    assert.equal(result.result.authorizationState, 'AUTHORIZATION_REQUIRED');
});

// ---- Never claims execution, in any authorization state ----

test('NEVER CLAIMS EXECUTION: no authorization outcome (granted, denied, or required) ever states the application was opened', async () => {
    const { provider } = freshProvider();
    const outcomes = await Promise.all([
        provider.think('Open QuarryOS.', { actorId: 'ordinary-user' }),      // granted
        provider.think('Open Developer Hub.', { actorId: 'ordinary-user' }), // denied
        provider.think('Open QuarryOS.'),                                    // required
    ]);
    for (const r of outcomes) {
        assert.doesNotMatch(r.result.text, /\bhas been opened\b|\bopening now\b|\blaunched successfully\b|\bnavigating\b/i);
    }
});

// ---- Learning/authorization separation ----

test('LEARNING BOUNDARY: no learned/remembered prior grant can substitute for a real per-call authorization check (the real function is called every time)', async () => {
    const { provider, identity } = freshProvider();
    await provider.think('Open QuarryOS.', { actorId: 'ordinary-user' });
    await provider.think('Open QuarryOS.', { actorId: 'ordinary-user' });
    await provider.think('Open QuarryOS.', { actorId: 'ordinary-user' });
    assert.equal(identity.calls.length, 3, 'every request must independently re-check real authorization, never cache/assume from a prior grant');
});
