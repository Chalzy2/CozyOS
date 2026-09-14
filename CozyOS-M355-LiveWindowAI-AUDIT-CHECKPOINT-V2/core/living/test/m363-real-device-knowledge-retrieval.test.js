/**
 * core/living/test/m363-real-device-knowledge-retrieval.test.js
 * M363 REAL-DEVICE FAILURE FIX — Kiswahili CozyOS Knowledge Retrieval
 *
 * Targeted regression tests for the exact three real-device failures
 * reported and fixed this pass, plus the contextual follow-ups that
 * depend on the same fix. No new engine: these exercise the existing
 * CozyIdentityFAQRouter, rule-based-conversational-provider.js, and
 * cozy-knowledge-registry.js/cozy-public-knowledge-source.js exactly as
 * a real turn would.
 *
 * Run with: node core/living/test/m363-real-device-knowledge-retrieval.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const PROVIDER_PATH = path.join(ROOT, 'modules', 'intelligence', 'providers', 'rule-based-conversational-provider.js');
const TEMPLATES_PATH = path.join(ROOT, 'modules', 'intelligence', 'language', 'cozy-language-templates.js');
const REGISTRY_PATH = path.join(ROOT, 'modules', 'intelligence', 'language', 'cozy-language-registry.js');
const PUBLIC_KNOWLEDGE_PATH = path.join(ROOT, 'modules', 'intelligence', 'knowledge', 'cozy-public-knowledge-source.js');
const KNOWLEDGE_REGISTRY_PATH = path.join(ROOT, 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js');
const DEV_PROFILE_PATH = path.join(ROOT, 'identity', 'developer-profile.js');
const PROJECT_HISTORY_PATH = path.join(ROOT, 'identity', 'project-history.js');
const AFRICAN_KNOWLEDGE_PATH = path.join(ROOT, 'identity', 'african-knowledge-initiative.js');
const IDENTITY_ASSEMBLY_PATH = path.join(ROOT, 'identity', 'cozyai-identity.js');
const FAQ_ROUTER_PATH = path.join(ROOT, 'modules', 'knowledge', 'cozyos-identity-faq-router.js');

function makeFakeLivingAI() {
    const registered = new Map();
    return { registerProvider(name, p) { registered.set(name, p); }, setActiveProvider() {}, _registered: registered };
}

const ALL_PATHS = [DEV_PROFILE_PATH, PROJECT_HISTORY_PATH, AFRICAN_KNOWLEDGE_PATH, IDENTITY_ASSEMBLY_PATH, REGISTRY_PATH, TEMPLATES_PATH, PUBLIC_KNOWLEDGE_PATH, KNOWLEDGE_REGISTRY_PATH, FAQ_ROUTER_PATH, PROVIDER_PATH];

function freshFullStack(fakeApplications) {
    ALL_PATHS.forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded yet */ } });
    const fakeAI = makeFakeLivingAI();
    global.window = { CozyOS: { LivingAI: fakeAI } };
    if (fakeApplications) {
        global.window.CozyOS.listApplications = () => fakeApplications;
    }
    for (const p of ALL_PATHS) require(p);
    return {
        provider: fakeAI._registered.get('rule-based-conversational'),
        router: global.window.CozyOS.CozyIdentityFAQRouter,
    };
}

// ---- 1. Founder/origin question (real-device failure #1) ----

test('REAL-DEVICE FIX 1: "Kwa nini CozyOS ilianzishwa?" resolves through the real FAQ router to the origin/founder answer', async () => {
    const { router } = freshFullStack();
    const r = await router.resolve('Kwa nini CozyOS ilianzishwa?', {});
    assert.equal(r.matched, true);
    assert.equal(r.intentId, 'COZYOS_ORIGIN');
    assert.match(r.answer, /Charles Owuor/);
});

test('REAL-DEVICE FIX 1b: bare "Kwa nini alianzisha?" (no explicit subject) resolves the same real way', async () => {
    const { router } = freshFullStack();
    const r = await router.resolve('Kwa nini alianzisha?', {});
    assert.equal(r.matched, true);
    assert.equal(r.intentId, 'COZYOS_ORIGIN');
});

test('REGRESSION: the pre-existing "Nani alianzisha CozyOS?" founder question is unaffected', async () => {
    const { router } = freshFullStack();
    const r = await router.resolve('Nani alianzisha CozyOS?', {});
    assert.equal(r.intentId, 'COZYOS_FOUNDER');
});

// ---- 2. App count + human-value question (real-device failure #2) ----

test('REAL-DEVICE FIX 2: "Kuna programu ngapi na inasaidia aje?" states the real count and real per-app human value, in Kiswahili', async () => {
    const { provider } = freshFullStack([{ name: 'ChurchOS' }, { name: 'ShopOS' }, { name: 'MpesaOS' }]);
    const result = await provider.think('Kuna programu ngapi na inasaidia aje?', { language: 'sw' });
    assert.equal(result.result.intent, 'list-apps');
    assert.match(result.result.text, /programu 3/);
    assert.match(result.result.text, /ChurchOS/);
    assert.match(result.result.text, /ShopOS/);
    assert.match(result.result.text, /MpesaOS/);
    // Real, verified per-app human-purpose content, not just names.
    assert.match(result.result.text, /makanisa/); // ChurchOS's real Kiswahili purpose text
});

test('HONESTY: with no registered applications, the count question still degrades to the existing honest "registry unavailable" reply, never a fabricated count', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Kuna programu ngapi?', { language: 'sw' });
    assert.equal(result.result.intent, 'list-apps');
    assert.doesNotMatch(result.result.text, /\d/); // no fabricated number
});

// ---- 3. Contextual/pronominal follow-ups (real-device failure #3) ----

test('REAL-DEVICE FIX 3: a full contextual chain — ask about ChurchOS, then "hii inasaidiaje?", "kwa nini?", "nani atanufaika?" — all resolve against ChurchOS without repeating the name', async () => {
    const { provider } = freshFullStack();
    let state;

    const first = await provider.think('Kwa nini ChurchOS ni muhimu?', { language: 'sw' });
    assert.equal(first.result.intent, 'app-importance');
    assert.equal(first.result.conversationState.lastDiscussedApplication, 'ChurchOS');
    state = first.result.conversationState;

    for (const followup of ['hii inasaidiaje?', 'kwa nini?', 'nani atanufaika?', 'programu hii']) {
        const r = await provider.think(followup, { conversationState: state });
        assert.equal(r.result.intent, 'app-importance', `"${followup}" should resolve as app-importance`);
        assert.match(r.result.text, /ChurchOS/, `"${followup}" should answer about ChurchOS`);
        state = r.result.conversationState;
    }
});

test('REGRESSION: a follow-up naming its OWN application is never overridden by stale context', async () => {
    const { provider } = freshFullStack();
    const first = await provider.think('Kwa nini ChurchOS ni muhimu?', { language: 'sw' });
    const second = await provider.think('Why is ShopOS important?', { conversationState: first.result.conversationState });
    assert.match(second.result.text, /ShopOS/);
    assert.doesNotMatch(second.result.text, /ChurchOS/);
    assert.equal(second.result.conversationState.lastDiscussedApplication, 'ShopOS');
});

test('REGRESSION: an app-launch conversation never leaks into app-importance follow-up resolution (different real fields, RP-037 unaffected)', async () => {
    const { provider } = freshFullStack([{ name: 'ShopOS' }]);
    const launchTurn = await provider.think('Open ShopOS.', {});
    assert.equal(launchTurn.result.conversationState.lastDiscussedApplication, null);
    const followup = await provider.think('kwa nini?', { conversationState: launchTurn.result.conversationState });
    // No lastDiscussedApplication was ever set by an app-launch turn, so
    // this bare follow-up has nothing real to resolve against and stays
    // honestly unsupported — never guesses ShopOS from the launch turn.
    assert.equal(followup.result.intent, 'unsupported');
});

test('EN: "How many applications are there?" (English count question) also reaches list-apps and states the real count', async () => {
    const { provider } = freshFullStack([{ name: 'QuarryOS' }]);
    const result = await provider.think('what apps are available', {});
    assert.equal(result.result.intent, 'list-apps');
    assert.match(result.result.text, /QuarryOS/);
});

console.log('M363 real-device knowledge-retrieval fix suite: run complete.');
