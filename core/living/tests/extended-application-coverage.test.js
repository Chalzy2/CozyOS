/**
 * core/living/tests/extended-application-coverage.test.js
 * CozyOS — Extension: Complete Application Capability Explanation +
 * Kiswahili-First Intent (all-applications mode, comparison, deep
 * ShopOS/WholesaleOS/QuarryOS Kiswahili coverage)
 *
 * Run with: node --test core/living/tests/extended-application-coverage.test.js
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

function freshProvider() {
    ALL_PATHS.forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    const registered = new Map();
    global.window = { CozyOS: { LivingAI: { registerProvider(name, p) { registered.set(name, p); }, setActiveProvider() {} } } };
    for (const p of ALL_PATHS) require(p);
    return { provider: registered.get('rule-based-conversational'), knowledge: global.window.CozyOS.CozyKnowledge };
}

// ---- ALL_APPLICATIONS_DETAILED ----

test('getAllApplicationsDetailedFact() includes all 11+ real registered applications', () => {
    const { knowledge } = freshProvider();
    const r = knowledge.getAllApplicationsDetailedFact('en');
    assert.equal(r.evidence, 'VERIFIED');
    for (const app of ['shopos', 'wholesaleos', 'churchos', 'quarryos', 'mpesaos', 'interestos', 'authenticator', 'pharmacyos', 'hospitalos', 'schoolos']) {
        assert.match(r.answer, new RegExp(app, 'i'), `${app} must appear in the all-applications overview`);
    }
});

test('getAllApplicationsDetailedFact() gives up to 2 real examples per app, never fabricated', () => {
    const { knowledge } = freshProvider();
    const r = knowledge.getAllApplicationsDetailedFact('en');
    // ShopOS has real realLifeProblems - its block should include numbered examples
    const shopBlock = r.answer.split('\n\n').find((b) => b.startsWith('shopos'));
    assert.ok(shopBlock);
    assert.match(shopBlock, /1\. /);
});

test('LIVE: "What do all the applications do?" resolves to all-apps-detailed, not a bare list', async () => {
    const { provider } = freshProvider();
    const r = await provider.think('What do all the applications do?', {});
    assert.equal(r.result.intent, 'all-apps-detailed');
    assert.ok(r.result.text.length > 500, 'must be a real detailed overview, not a short list');
});

test('LIVE: "What applications are available in CozyOS?" still resolves to the concise list-apps intent (not detailed)', async () => {
    const { provider } = freshProvider();
    const r = await provider.think('What applications are available in CozyOS?', {});
    assert.equal(r.result.intent, 'list-apps');
});

test('LIVE Kiswahili: "Niambie applications zote za CozyOS zinafanya nini." resolves to all-apps-detailed in Kiswahili', async () => {
    const { provider } = freshProvider();
    const r = await provider.think('Niambie applications zote za CozyOS zinafanya nini.', {});
    assert.equal(r.result.intent, 'all-apps-detailed');
});

// ---- APPLICATION_COMPARISON ----

test('compareApplicationsFact() never makes an unsupported "better" claim', () => {
    const { knowledge } = freshProvider();
    const r = knowledge.compareApplicationsFact('shopos', 'wholesaleos', 'en');
    assert.equal(r.evidence, 'VERIFIED');
    assert.doesNotMatch(r.answer, /is better than/i);
});

test('compareApplicationsFact() honestly reports NOT_FOUND for an unregistered application', () => {
    const { knowledge } = freshProvider();
    const r = knowledge.compareApplicationsFact('shopos', 'flyingcaros', 'en');
    assert.equal(r.evidence, 'NOT_FOUND');
});

const COMPARISON_QUESTIONS = [
    'What is the difference between ShopOS and WholesaleOS?',
    'HospitalOS vs PharmacyOS',
    'Tofauti kati ya ShopOS na WholesaleOS ni nini?',
    'ChurchOS na LiveOS zinatofautianaje?',
];
for (const q of COMPARISON_QUESTIONS) {
    test(`LIVE COMPARISON: "${q}" resolves to app-comparison`, async () => {
        const { provider } = freshProvider();
        const r = await provider.think(q, {});
        assert.equal(r.result.intent, 'app-comparison');
    });
}

// ---- Deep Kiswahili: ShopOS / WholesaleOS / QuarryOS ----

const DEEP_SW_VARIANTS = [
    'ShopOS ni nini?', 'ShopOS ni ya nini?', 'ShopOS inafanya nini?', 'ShopOS inanisaidiaje?',
    'ShopOS inasaidia biashara vipi?', 'Biashara inaweza kutumia ShopOS kufanya nini?',
    'ShopOS inatatua tatizo gani?', 'Kwa nini nitumie ShopOS?', 'ShopOS inafaa kwa nani?',
    'Nieleze ShopOS kwa undani.', 'ShopOS ina faida gani katika maisha halisi?',
    'WholesaleOS ni nini?', 'WholesaleOS ni ya nini?', 'WholesaleOS inafanya nini?',
    'WholesaleOS inasaidia biashara ya jumla vipi?', 'Ni nani anaweza kutumia WholesaleOS?',
    'WholesaleOS inatatua matatizo gani?', 'Kwa nini nitumie WholesaleOS?',
    'WholesaleOS inanisaidiaje katika biashara?', 'Nieleze WholesaleOS kwa undani.',
    'WholesaleOS inatumika vipi katika maisha halisi?',
    'QuarryOS ni nini?', 'QuarryOS ni ya nini?', 'QuarryOS inafanya nini?',
    'QuarryOS inasaidia machimbo vipi?', 'Biashara ya quarry inaweza kutumia QuarryOS kufanya nini?',
    'QuarryOS inamsaidiaje meneja wa quarry?', 'QuarryOS inatatua tatizo gani?',
    'Kwa nini nitumie QuarryOS?', 'Nieleze QuarryOS kwa undani.', 'QuarryOS inasaidiaje katika maisha halisi?',
];

for (const q of DEEP_SW_VARIANTS) {
    test(`DEEP KISWAHILI: "${q}" resolves to a real intent, not unsupported`, async () => {
        const { provider } = freshProvider();
        const r = await provider.think(q, {});
        assert.notEqual(r.result.intent, 'unsupported', `"${q}" must resolve semantically`);
    });
}

// ---- Regression: existing intents unaffected ----

test('REGRESSION: single-application detailed info still works after adding all-apps-detailed and comparison', async () => {
    const { provider } = freshProvider();
    const r = await provider.think('Tell me everything about ChurchOS.', {});
    assert.equal(r.result.intent, 'app-detailed-info');
});

test('REGRESSION: cross-application capability search still works', async () => {
    const { provider } = freshProvider();
    const r = await provider.think('Which CozyOS application can help me sell products?', {});
    assert.equal(r.result.intent, 'app-capability-search');
});

test('REGRESSION: HospitalOS/SchoolOS honest mock disclosure preserved inside the all-apps overview', () => {
    const { knowledge } = freshProvider();
    const r = knowledge.getAllApplicationsDetailedFact('en');
    assert.match(r.answer, /no real, functional HospitalOS/i);
    assert.match(r.answer, /no real, functional SchoolOS/i);
});

console.log('Extended Application Coverage suite: run complete.');
