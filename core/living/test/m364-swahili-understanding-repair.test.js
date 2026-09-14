/**
 * core/living/test/m364-swahili-understanding-repair.test.js
 * Cozy AI — Natural Swahili & General Question Understanding Repair
 *
 * SCOPE (honest disclosure): this proves the real, targeted fixes made
 * this pass — a small, fixed-table input normalizer
 * (normalizeUserText()) applied once before classification, plus
 * broadened trigger patterns on the EXISTING why-use-cozyos and help
 * intents. This is NOT a full semantic-NLU/confidence-scored intent
 * engine (that would require a real language model this codebase does
 * not have) — it is rule-based pattern coverage, honestly extended.
 * Two real, disclosed gaps remain and are NOT claimed fixed here:
 *   (1) several why-use-cozyos answers are honestly English-only
 *       (no verified Kiswahili translation of that vision/mission
 *       prose exists yet — same disclosed limit as M363);
 *   (2) genuinely garbled input ("Nakuliza hayo maombi...", which uses
 *       "maombi" [requests/prayers] where "maswali" [questions] was
 *       likely meant) still honestly asks for clarification rather
 *       than guessing.
 *
 * Run with: node core/living/test/m364-swahili-understanding-repair.test.js
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

const ALL_PATHS = [DEV_PROFILE_PATH, PROJECT_HISTORY_PATH, AFRICAN_KNOWLEDGE_PATH, IDENTITY_ASSEMBLY_PATH, REGISTRY_PATH, TEMPLATES_PATH, PUBLIC_KNOWLEDGE_PATH, KNOWLEDGE_REGISTRY_PATH, FAQ_ROUTER_PATH, PROVIDER_PATH];

function makeFakeLivingAI() {
    const registered = new Map();
    return { registerProvider(name, p) { registered.set(name, p); }, setActiveProvider() {}, _registered: registered };
}

function freshProvider() {
    ALL_PATHS.forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded yet */ } });
    const fakeAI = makeFakeLivingAI();
    global.window = { CozyOS: { LivingAI: fakeAI } };
    for (const p of ALL_PATHS) require(p);
    return fakeAI._registered.get('rule-based-conversational');
}

// ---- 1. Normalization: real typos never cause a failure ----

test('NORMALIZATION: the dropped-"a" typo "insaidia" resolves identically to "inasaidia"', async () => {
    const provider = freshProvider();
    const typo = await provider.think('Cozyos insaidia na nini', {});
    const correct = await provider.think('Cozyos inasaidia na nini', {});
    assert.equal(typo.result.intent, correct.result.intent);
    assert.notEqual(typo.result.intent, 'unsupported');
});

test('NORMALIZATION: app-name spacing variants ("cozy os") are understood the same as "cozyos"', async () => {
    const provider = freshProvider();
    const spaced = await provider.think('why is cozy os important', {});
    const canonical = await provider.think('why is cozyos important', {});
    assert.equal(spaced.result.intent, canonical.result.intent);
});

// ---- 2. Capabilities / Benefits / Purpose (section 17 categories) ----

const RESOLVED_PHRASES = [
    'CozyOS inasaidia nini?',
    'CozyOS insaidia na nini?',
    'CozyOS inasaidiaje?',
    'CozyOS inatusaidia na nini?',
    'CozyOS ina faida gani?',
    'Faida za CozyOS ni zipi?',
    'Nitanufaika vipi na CozyOS?',
    'CozyOS inatusaidia na faida gani kwetu?',
    'Tutapata nini tukitumia CozyOS?',
    'CozyOS ni ya nini?',
    'Ninataka kunua cozyos inasaidiaje?',
];

for (const phrase of RESOLVED_PHRASES) {
    test(`RESOLVES (not "unsupported"): "${phrase}"`, async () => {
        const provider = freshProvider();
        const r = await provider.think(phrase, {});
        assert.notEqual(r.result.intent, 'unsupported', `"${phrase}" must not fall through to the generic unsupported/clarification reply`);
        assert.equal(r.result.needsClarification, false);
    });
}

// ---- 3. Assistant capabilities ("what can you answer") ----

const ASSISTANT_CAPABILITY_PHRASES = [
    'Unaweza kujibu maswali gani?',
    'Naweza kukuuliza nini?',
    'Unaweza kunisaidia na nini?',
    'Hayo maswali ni gani unaweza kuulizwa?',
    'What can you help me with?',
    'What can I ask you?',
];

for (const phrase of ASSISTANT_CAPABILITY_PHRASES) {
    test(`ASSISTANT CAPABILITIES resolves to the real "help" answer: "${phrase}"`, async () => {
        const provider = freshProvider();
        const r = await provider.think(phrase, {});
        assert.equal(r.result.intent, 'help');
    });
}

// ---- 4. Distinguish unknown intent from unknown knowledge (section 10) ----

test('A recognized benefit question about CozyOS never returns the generic "Some related context exists" text', async () => {
    const provider = freshProvider();
    const r = await provider.think('CozyOS inasaidia nini?', {});
    assert.doesNotMatch(r.result.text, /Some related context exists/i);
});

// ---- 5. Full acceptance-style multi-turn conversation (section 19) ----

test('ACCEPTANCE: a realistic multi-turn Kiswahili conversation never falls back to "unsupported"/generic fallback text', async () => {
    const provider = freshProvider();
    const turns = [
        'Cozyos inasaidia nini?',
        'Cozyos inatusaidia na faida gani kwetu?',
        'Nitanufaika vipi nikitumia CozyOS?',
        'Hayo maswali unaweza kujibu ni gani?',
    ];
    for (const t of turns) {
        const r = await provider.think(t, {});
        assert.notEqual(r.result.intent, 'unsupported', `"${t}" should resolve to a real intent`);
        assert.doesNotMatch(r.result.text, /Some related context exists/i);
    }
});

// ---- REGRESSION: existing, unrelated intents unaffected ----

test('REGRESSION: "Nani alianzisha CozyOS?" (founder) is unaffected by the new help/why-use-cozyos patterns', async () => {
    const provider = freshProvider();
    const r = await provider.think('Nani alianzisha CozyOS?', {});
    assert.notEqual(r.result.intent, 'help');
    assert.notEqual(r.result.intent, 'why-use-cozyos');
});

test('REGRESSION: a genuinely garbled/unclear message still honestly asks for clarification rather than guessing', async () => {
    const provider = freshProvider();
    const r = await provider.think('Nakuliza hayo maombi unaweza jibu ni gani?', {});
    assert.equal(r.result.intent, 'unsupported');
    assert.equal(r.result.needsClarification, true);
});

console.log('Swahili & General Question Understanding Repair suite: run complete.');
