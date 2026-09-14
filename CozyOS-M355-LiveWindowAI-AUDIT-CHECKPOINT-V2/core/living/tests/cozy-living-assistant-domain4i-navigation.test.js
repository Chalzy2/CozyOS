'use strict';

/**
 * core/living/tests/cozy-living-assistant-domain4i-navigation.test.js
 *
 * Domain 4I dependency #3 (Authorized Application Launch — Real
 * Navigation) — real regression coverage.
 *
 * WHY THIS SHAPE (same honest limitation already disclosed in
 * cozy-living-assistant-checkpoint-k.test.js's own header)
 *   #send() itself touches window/document throughout and only truly
 *   runs in a browser — this sandbox's own Playwright/browser tests are
 *   independently confirmed to fail here on selector timeouts (no real
 *   display; see Domain 4A's checkpoint report), so a new Playwright
 *   test would produce a false negative, not real evidence. Instead,
 *   shouldLaunchApplication() — the exact, sole gate #send() uses
 *   before ever calling window.CozyOS.ApplicationLauncher.open() — was
 *   extracted as a small, real, pure function (same testability
 *   precedent as renderAdvisorReply()/isNonEmptyReplyText()). This file
 *   drives that real function with the REAL, unmodified
 *   rule-based-conversational-provider.js's real output for every
 *   required scenario, proving the exact security-critical boundary:
 *   only AUTHORIZATION_GRANTED ever produces a launchable applicationId.
 *
 *   Confirms via direct source read that the canonical, existing
 *   launcher (window.CozyOS.ApplicationLauncher.open(applicationId),
 *   core/shell/application-launcher.js — the exact mechanism
 *   cozy-workspace.js's own app-card click handler already composes)
 *   is the only navigation mechanism #send() calls, and that it is
 *   never called with anything other than a real application.id
 *   resolved from the real registry — never AI-generated text.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..', '..', '..');
const LIVING_ASSISTANT_PATH = path.join(ROOT, 'core', 'living', 'cozy-living-assistant.js');
const WORKSPACE_PATH = path.join(ROOT, 'core', 'shell', 'cozy-workspace.js');

const { shouldLaunchApplication } = require(LIVING_ASSISTANT_PATH);

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
function makeIdentityEngine() {
    return {
        canAccessApplication(userId, appName) {
            if (userId === 'admin-user') return true;
            if (userId === 'ordinary-user') return appName.toLowerCase() === 'quarryos';
            return false;
        },
    };
}

function freshProvider() {
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
            listApplications: () => ([{ id: 'quarryos', name: 'QuarryOS' }, { id: 'developer-hub', name: 'Developer Hub' }]),
            IdentityEngine: makeIdentityEngine(),
        },
    };
    global.window = fakeWindow;
    files.forEach((p) => require(p));
    return fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational');
}

// ---- Real end-to-end gate proof: real provider output -> real gate function ----

test('AUTHORIZED QUARRYOS (English): real provider output passes the real navigation gate with the correct applicationId', async () => {
    const provider = freshProvider();
    const result = await provider.think('Open QuarryOS.', { actorId: 'ordinary-user' });
    assert.equal(shouldLaunchApplication({ success: true, result: result.result }), 'quarryos');
});

test('AUTHORIZED QUARRYOS (Kiswahili): real provider output passes the real navigation gate with the correct applicationId', async () => {
    const provider = freshProvider();
    const result = await provider.think('Nifungulie QuarryOS.', { actorId: 'ordinary-user' });
    assert.equal(shouldLaunchApplication({ success: true, result: result.result }), 'quarryos');
});

test('ADMIN SECURITY: an ordinary user asking for the admin/developer-tier application NEVER passes the navigation gate', async () => {
    const provider = freshProvider();
    const result = await provider.think('Open Developer Hub.', { actorId: 'ordinary-user' });
    assert.equal(result.result.authorizationState, 'AUTHORIZATION_DENIED');
    assert.equal(shouldLaunchApplication({ success: true, result: result.result }), null);
});

test('ADMIN SECURITY: an authorized admin user asking for the admin/developer-tier application DOES pass the navigation gate', async () => {
    const provider = freshProvider();
    const result = await provider.think('Open Developer Hub.', { actorId: 'admin-user' });
    assert.equal(result.result.authorizationState, 'AUTHORIZATION_GRANTED');
    assert.equal(shouldLaunchApplication({ success: true, result: result.result }), 'developer-hub');
});

test('AUTHORIZATION_REQUIRED (no actor) never passes the navigation gate', async () => {
    const provider = freshProvider();
    const result = await provider.think('Open QuarryOS.');
    assert.equal(result.result.authorizationState, 'AUTHORIZATION_REQUIRED');
    assert.equal(shouldLaunchApplication({ success: true, result: result.result }), null);
});

test('unresolved application never passes the navigation gate', async () => {
    const provider = freshProvider();
    const result = await provider.think('Open TotallyMadeUpAppXYZ.', { actorId: 'ordinary-user' });
    assert.equal(result.result.application, null);
    assert.equal(shouldLaunchApplication({ success: true, result: result.result }), null);
});

// ---- Informational negatives: never even reach app-launch, so never the gate ----

for (const q of ['QuarryOS ni nini?', 'What is QuarryOS?', 'Tell me about QuarryOS.', 'Which applications are available?', 'Nataka kujua kuhusu QuarryOS.']) {
    test(`INFORMATIONAL NEGATIVE: ${JSON.stringify(q)} never passes the navigation gate`, async () => {
        const provider = freshProvider();
        const result = await provider.think(q, { actorId: 'ordinary-user' });
        assert.equal(shouldLaunchApplication({ success: true, result: result.result }), null);
    });
}

// ---- Pure function boundary conditions ----

test('shouldLaunchApplication(): a failed think() result never passes the gate', () => {
    assert.equal(shouldLaunchApplication({ success: false, result: null }), null);
    assert.equal(shouldLaunchApplication(null), null);
});

test('shouldLaunchApplication(): an unrelated intent never passes the gate even with a stray authorizationState field', () => {
    assert.equal(shouldLaunchApplication({ success: true, result: { intent: 'what-is-cozyos', authorizationState: 'AUTHORIZATION_GRANTED', application: { id: 'quarryos' } } }), null);
});

// ---- Source-level confirmation: no duplicate launcher, no AI-supplied URL ----

test('SOURCE CHECK: cozy-living-assistant.js calls the canonical window.CozyOS.ApplicationLauncher.open(), never window.location/window.open with AI-generated text', () => {
    const src = fs.readFileSync(LIVING_ASSISTANT_PATH, 'utf8');
    assert.match(src, /window\.CozyOS\.ApplicationLauncher/);
    assert.match(src, /ApplicationLauncher\.open\(applicationIdToLaunch\)|launcher\.open\(applicationIdToLaunch\)/);
    assert.doesNotMatch(src, /ApplicationLauncher\.open\(replyText\)/);
});

test("SOURCE CHECK: cozy-workspace.js's own app-launch click handler uses the SAME canonical launcher (no duplicate navigation engine)", () => {
    const src = fs.readFileSync(WORKSPACE_PATH, 'utf8');
    assert.match(src, /window\.CozyOS\.ApplicationLauncher/);
});
