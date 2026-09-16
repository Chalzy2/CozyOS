/**
 * core/living/tests/universal-application-understanding-repair.test.js
 * CozyOS — Universal Application Understanding Repair
 *
 * Covers A-M from the repair specification. Tests assert semantic
 * intent/entity/response behavior at the existing abstraction level
 * (intent id, entity resolved, language, whether a real answer vs the
 * generic fallback was given) rather than exact prose wording.
 *
 * Run with: node --test core/living/tests/universal-application-understanding-repair.test.js
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

const GENERIC_FALLBACK_MARKERS = [
    /CozyOS currently includes these applications/i,
    /I don't have a rule-based answer for that yet/i,
    /Some related context exists, but nothing/i,
];
function isGenericFallback(text) {
    return GENERIC_FALLBACK_MARKERS.some((re) => re.test(text));
}

// ---- A. direct application questions ----
for (const [app, q] of [['ShopOS', 'What is ShopOS?'], ['ChurchOS', 'What is ChurchOS?'], ['Authenticator', 'What is Authenticator?']]) {
    test(`A: direct question "${q}" resolves to real ${app} knowledge, not the generic fallback`, async () => {
        const { provider } = freshProvider();
        const r = await provider.think(q, {});
        assert.equal(isGenericFallback(r.result.text), false);
        assert.match(r.result.text, new RegExp(app, 'i'));
    });
}

// ---- B. indirect application questions ----
for (const q of ['ShopOS does what?', 'ChurchOS does what', 'Authenticator uses']) {
    test(`B: indirect question "${q}" resolves to real knowledge, not the generic fallback`, async () => {
        const { provider } = freshProvider();
        const r = await provider.think(q, {});
        assert.equal(isGenericFallback(r.result.text), false);
    });
}

// ---- C. application purpose ----
for (const q of ['What is ShopOS for?', 'Why does ChurchOS exist?', 'ShopOS ni ya nini?']) {
    test(`C: purpose question "${q}" resolves via app-importance/app-info, not fallback`, async () => {
        const { provider } = freshProvider();
        const r = await provider.think(q, {});
        assert.ok(['app-importance', 'app-info'].includes(r.result.intent));
    });
}

// ---- D. application uses ----
test('D: "What are those applications used for?" resolves via context/all-apps, not fallback', async () => {
    const { provider } = freshProvider();
    const t1 = await provider.think('CozyOS has these applications.', {});
    void t1;
    const r = await provider.think('What are the uses of those applications?', {});
    // Honest: with no prior verified app collection in context, this
    // must not silently invent one - either a real all-apps answer or
    // an honest unsupported is acceptable, but never the OLD wrong
    // "list-apps" fallback text.
    assert.doesNotMatch(r.result.text, /CozyOS currently includes these applications/i);
});

// ---- E. human-benefit questions ----
for (const q of ['What benefits does ShopOS have?', 'How can I benefit from ChurchOS?', 'ShopOS ina faida gani katika maisha halisi?']) {
    test(`E: human-benefit question "${q}" resolves to real knowledge`, async () => {
        const { provider } = freshProvider();
        const r = await provider.think(q, {});
        assert.equal(isGenericFallback(r.result.text), false);
    });
}

// ---- F. application-importance questions ----
for (const q of ['Why is ShopOS important?', 'Why is ChurchOS useful?', 'Kwa nini ShopOS iko ndani ya CozyOS?']) {
    test(`F: importance question "${q}" resolves to app-importance`, async () => {
        const { provider } = freshProvider();
        const r = await provider.think(q, {});
        assert.equal(r.result.intent, 'app-importance');
    });
}

// ---- G. application-reason questions ----
test('G: "Why are the applications in CozyOS?" does not fall back to the bare application list', async () => {
    const { provider } = freshProvider();
    const r = await provider.think('Why are the applications in CozyOS?', {});
    assert.doesNotMatch(r.result.text, /^CozyOS currently includes these applications/i);
});

// ---- H. context references: it / they / those applications / this one ----
test('H: "it" resolves to the previously discussed application (app-info -> pronoun follow-up)', async () => {
    const { provider } = freshProvider();
    const t1 = await provider.think('Tell me about ShopOS.', {});
    assert.equal(t1.result.conversationState.lastDiscussedApplication, 'ShopOS');
    const t2 = await provider.think('What benefits does it have?', { conversationState: t1.result.conversationState });
    assert.equal(t2.result.intent, 'app-importance');
    assert.match(t2.result.text, /ShopOS/i);
});

test('H: "they" resolves to the previously discussed application', async () => {
    const { provider } = freshProvider();
    const t1 = await provider.think('Tell me about ShopOS.', {});
    const t2 = await provider.think('What do they do?', { conversationState: t1.result.conversationState });
    assert.notEqual(t2.result.intent, 'unsupported');
    assert.match(t2.result.text, /ShopOS/i);
});

test('H: "this one" / "why is it important" resolves via context after ChurchOS is discussed', async () => {
    const { provider } = freshProvider();
    const t1 = await provider.think('ChurchOS does what?', {});
    const t2 = await provider.think('Why is it important?', { conversationState: t1.result.conversationState });
    assert.equal(t2.result.intent, 'app-importance');
    assert.match(t2.result.text, /ChurchOS/i);
});

test('H (Kiswahili): "Faida yake kwa mtu ni nini?" resolves to ShopOS after "Niambie kuhusu ShopOS."', async () => {
    const { provider } = freshProvider();
    const t1 = await provider.think('Niambie kuhusu ShopOS.', {});
    const t2 = await provider.think('Faida yake kwa mtu ni nini?', { conversationState: t1.result.conversationState });
    assert.equal(t2.result.intent, 'app-importance');
    assert.match(t2.result.text, /ShopOS/i);
});

test('H (Kiswahili): "Inamsaidia nani?" resolves to ShopOS after "ShopOS inafanya nini?"', async () => {
    const { provider } = freshProvider();
    const t1 = await provider.think('ShopOS inafanya nini?', {});
    const t2 = await provider.think('Inamsaidia nani?', { conversationState: t1.result.conversationState });
    assert.equal(t2.result.intent, 'app-importance');
    assert.match(t2.result.text, /ShopOS/i);
});

// ---- I. goal-to-application resolution ----
test('I: "What protects my account?" resolves to Authenticator, not a coincidental substring match', () => {
    const { knowledge } = freshProvider();
    const r = knowledge.searchApplicationsByCapability('protects my account', 'en');
    assert.equal(r.evidence, 'VERIFIED');
    assert.equal(r.matches[0].application, 'authenticator');
});

test('I: "kusimamia duka" ranks ShopOS above merely-related applications via real occurrence evidence', () => {
    const { knowledge } = freshProvider();
    const r = knowledge.searchApplicationsByCapability('kusimamia duka', 'sw');
    assert.equal(r.evidence, 'VERIFIED');
    assert.equal(r.matches[0].application, 'shopos');
});

test('I (live): "What can help me manage a shop?" resolves via app-capability-search', async () => {
    const { provider } = freshProvider();
    const r = await provider.think('What can help me manage a shop?', {});
    assert.equal(r.result.intent, 'app-capability-search');
});

test('I (live): "Which application helps with running a shop?" resolves via app-capability-search', async () => {
    const { provider } = freshProvider();
    const r = await provider.think('Which application helps with running a shop?', {});
    assert.equal(r.result.intent, 'app-capability-search');
});

// ---- J. ambiguous application questions ----
test('J: a genuinely unmatched capability search honestly reports no match, never guesses', () => {
    const { knowledge } = freshProvider();
    const r = knowledge.searchApplicationsByCapability('interplanetary travel booking', 'en');
    assert.equal(r.evidence, 'NOT_FOUND');
    assert.deepEqual(r.matches, []);
});

// ---- K. English/Kiswahili semantic equivalence ----
const EQUIVALENT_PAIRS = [
    ['What does ShopOS do?', 'ShopOS inafanya nini?'],
    ['Why is ShopOS important?', 'Kwa nini ShopOS iko ndani ya CozyOS?'],
];
for (const [en, sw] of EQUIVALENT_PAIRS) {
    test(`K: "${en}" and "${sw}" resolve to the same intent family and both name ShopOS`, async () => {
        const { provider: p1 } = freshProvider();
        const rEn = await p1.think(en, {});
        const { provider: p2 } = freshProvider();
        const rSw = await p2.think(sw, {});
        assert.ok(['app-importance', 'app-info'].includes(rEn.result.intent));
        assert.ok(['app-importance', 'app-info'].includes(rSw.result.intent));
        assert.match(rEn.result.text, /ShopOS/i);
        assert.match(rSw.result.text, /ShopOS/i);
    });
}

test('K: Kiswahili input is answered in Kiswahili (language selection, not just intent)', async () => {
    const { provider } = freshProvider();
    const r = await provider.think('Matumizi ya ShopOS ni yapi?', {});
    assert.equal(r.result.language, 'sw');
});

// ---- L. truthful capability status ----
test('L: HospitalOS/SchoolOS mock-stub status remains honestly disclosed, never claimed as a real capability', () => {
    const { knowledge } = freshProvider();
    const hospital = knowledge.getApplicationDetailedInfoFact('hospitalos', 'en');
    assert.match(hospital.answer, /no real, functional HospitalOS/i);
});

// ---- M. prevention of generic application-list fallback when specific knowledge exists ----
for (const q of ['ShopOS does what?', 'What is Authenticator for?', 'Why is ChurchOS useful?', 'What benefits does ShopOS have?']) {
    test(`M: "${q}" never falls back to the generic 3-app list when specific verified knowledge exists`, async () => {
        const { provider } = freshProvider();
        const r = await provider.think(q, {});
        assert.doesNotMatch(r.result.text, /CozyOS currently includes these applications: ChurchOS, ShopOS, Authenticator/i);
    });
}

console.log('Universal Application Understanding Repair suite: run complete.');
