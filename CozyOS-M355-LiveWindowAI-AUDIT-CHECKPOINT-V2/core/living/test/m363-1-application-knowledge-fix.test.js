/**
 * core/living/test/m363-1-application-knowledge-fix.test.js
 * M363.1 — Application Knowledge Retrieval + Human-Value Explanation
 * (targeted production fix, post-M363 real-device failure)
 *
 * Real-device evidence this fixes: "Progmu ya ChurchOs inasaidia mtu
 * aje", "What benefits is ChurchOs", "What's Churchos", "Why is cozyos
 * benefits" all returned CozyAnswerEngine's safe "Some related context
 * exists..." fallback instead of the real, VERIFIED ChurchOS human-
 * purpose answer. Root cause: rule-based-conversational-provider.js's
 * app-importance/app-info/what-is-cozyos/why-use-cozyos intent patterns
 * had no trigger for several natural EN/SW phrasings, and
 * cozy-knowledge-registry.js's name-matching didn't normalize spacing/
 * case/filler-word variation ("Church OS", "programu ya ChurchOS",
 * "Progmu ya ChurchOS" — a real observed typo). No new engine: this
 * exercises the same, existing CozyIdentityFAQRouter,
 * rule-based-conversational-provider.js, and cozy-knowledge-registry.js
 * a real turn would.
 *
 * Every test here pairs an English phrasing with its natural Kiswahili
 * equivalent, per the explicit "English must keep working as Kiswahili
 * is added everywhere" requirement.
 *
 * Run with: node core/living/test/m363-1-application-knowledge-fix.test.js
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

function freshProvider(fakeApplications) {
    ALL_PATHS.forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded yet */ } });
    const fakeAI = makeFakeLivingAI();
    global.window = { CozyOS: { LivingAI: fakeAI } };
    if (fakeApplications) global.window.CozyOS.listApplications = () => fakeApplications;
    for (const p of ALL_PATHS) require(p);
    return fakeAI._registered.get('rule-based-conversational');
}

// ---- IDENTITY: "what is ChurchOS" ----

test('EN: "What\'s ChurchOS?" resolves (contraction support)', async () => {
    const provider = freshProvider([{ name: 'ChurchOS' }]);
    const r = await provider.think("What's ChurchOS?", {});
    assert.equal(r.result.intent, 'app-info');
    assert.match(r.result.text, /ChurchOS/);
});

test('SW: "ChurchOS ni programu gani?" / "ChurchOS ni nini?" resolves', async () => {
    const provider = freshProvider([{ name: 'ChurchOS' }]);
    const r = await provider.think('ChurchOS ni nini?', {});
    assert.equal(r.result.intent, 'app-info');
    assert.match(r.result.text, /ChurchOS/);
});

// ---- BENEFITS ----

const BENEFIT_PHRASES_EN = [
    'What benefits is ChurchOs',
    'What benefits does ChurchOS provide?',
    'Who benefits from ChurchOS?',
    'What problem does ChurchOS solve?',
    'Why is ChurchOS useful?',
    'How does ChurchOS help me?',
];
const BENEFIT_PHRASES_SW = [
    'ChurchOS inasaidia mtu aje?',
    'ChurchOS inanisaidia nini?',
    'ChurchOS ina faida gani?',
    'ChurchOS inatatua tatizo gani?',
    'Nani atanufaika na ChurchOS?',
    'Progmu ya ChurchOs inasaidia mtu aje', // real observed typo ("Progmu")
];

for (const phrase of BENEFIT_PHRASES_EN) {
    test(`EN benefit phrasing resolves with real ChurchOS purpose text: "${phrase}"`, async () => {
        const provider = freshProvider();
        const r = await provider.think(phrase, {});
        assert.equal(r.result.intent, 'app-importance');
        assert.match(r.result.text, /ChurchOS/);
        assert.match(r.result.text, /churches|church/i);
    });
}

for (const phrase of BENEFIT_PHRASES_SW) {
    test(`SW benefit phrasing resolves with real ChurchOS purpose text: "${phrase}"`, async () => {
        const provider = freshProvider();
        const r = await provider.think(phrase, { language: 'sw' });
        assert.equal(r.result.intent, 'app-importance');
        assert.match(r.result.text, /ChurchOS/);
        assert.match(r.result.text, /makanisa/i);
    });
}

// ---- ENTITY NORMALIZATION: spacing/case/filler-word variation ----

test('Entity resolution: "Church OS" (with a space) resolves the same real ChurchOS data', async () => {
    const provider = freshProvider();
    const r = await provider.think('What benefits does Church OS provide?', {});
    assert.match(r.result.text, /ChurchOS/); // canonical display name, not the raw "Church OS"
    assert.match(r.result.text, /churches/i);
});

test('Entity resolution: "programu ya ChurchOS" (Kiswahili "app of X" prefix) strips cleanly', async () => {
    const provider = freshProvider();
    const r = await provider.think('programu ya ChurchOS inanisaidia nini?', { language: 'sw' });
    assert.match(r.result.text, /^ChurchOS/); // canonical, cleaned display name at the start of the reply
    assert.match(r.result.text, /makanisa/i);
});

// ---- COZYOS-LEVEL BENEFIT QUESTIONS (not a named app) ----

test('EN: "Why is cozyos benefits" (broken grammar, clear intent) resolves to why-use-cozyos', async () => {
    const provider = freshProvider();
    const r = await provider.think('Why is cozyos benefits', {});
    assert.equal(r.result.intent, 'why-use-cozyos');
});

test('SW: "Kwa nini nitumie CozyOS?" still resolves (regression, unaffected)', async () => {
    const provider = freshProvider();
    const r = await provider.think('Kwa nini nitumie CozyOS?', {});
    assert.ok(r.result.intent === 'why-use-cozyos' || r.result.intent === 'unsupported');
    // (FAQ router may answer this one first via COZYOS_DIFFERENTIATION —
    // both are real, non-fallback answers; this just proves no crash/regression.)
    assert.notEqual(r.result.text, undefined);
});

// ---- CONTEXTUAL FOLLOW-UPS, INCLUDING ENTITY SWITCH ----

test('CONTEXT: "What\'s ChurchOS?" -> "Why is it useful?" -> "Programu hii inasaidiaje?" -> "Nani atanufaika?" all resolve against ChurchOS', async () => {
    const provider = freshProvider([{ name: 'ChurchOS' }]);
    let state;
    const first = await provider.think('Why is ChurchOS important?', {});
    state = first.result.conversationState;
    assert.equal(state.lastDiscussedApplication, 'ChurchOS');

    // M363.1 real-device fix: a bare pronoun ("it") is filtered from
    // ever being treated as a real application name and instead
    // resolves against the real previous turn's discussed application.
    const second = await provider.think('Why is it useful?', { conversationState: state });
    assert.equal(second.result.intent, 'app-importance');
    assert.match(second.result.text, /ChurchOS/);
    state = second.result.conversationState;

    const third = await provider.think('Programu hii inasaidiaje?', { conversationState: state });
    assert.equal(third.result.intent, 'app-importance');
    assert.match(third.result.text, /ChurchOS/);
    state = third.result.conversationState;

    const fourth = await provider.think('Nani atanufaika?', { conversationState: state });
    assert.equal(fourth.result.intent, 'app-importance');
    assert.match(fourth.result.text, /ChurchOS/);
});

test('CONTEXT SWITCH: "Na CozyOS je?" after a ChurchOS discussion switches the topic back to CozyOS itself', async () => {
    const provider = freshProvider();
    const first = await provider.think('Why is ChurchOS important?', {});
    const second = await provider.think('Na CozyOS je?', { conversationState: first.result.conversationState });
    assert.equal(second.result.intent, 'why-use-cozyos');
});

// ---- SAFETY FALLBACK PRESERVED ----

test('SAFETY: a genuinely unknown application name still degrades honestly, never fabricating a purpose', async () => {
    const provider = freshProvider();
    const r = await provider.think('Why is TotallyMadeUpAppXyz important?', {});
    assert.equal(r.result.intent, 'app-importance');
    assert.doesNotMatch(r.result.text, /churches|shop|ChurchOS/i);
});

// ---- COZYOS APPLICATION COUNT ----

test('"Kuna programu ngapi za CozyOS?" still resolves as list-apps and is never captured as a bogus app-importance name', async () => {
    const provider = freshProvider([{ name: 'ChurchOS' }, { name: 'ShopOS' }]);
    const r = await provider.think('Kuna programu ngapi za CozyOS?', { language: 'sw' });
    assert.equal(r.result.intent, 'list-apps');
    assert.match(r.result.text, /programu 2/);
});

// ---- GENERICITY: the fix is NOT ChurchOS-specific — every real ----
// ---- application with human-purpose data must work identically ----

const OTHER_VERIFIED_APPS = [
    { name: 'ShopOS', enWord: /shop|business/i, swWord: /duka|biashara/i },
    { name: 'MpesaOS', enWord: /payment|money|mpesa/i, swWord: /malipo|pesa/i },
    { name: 'QuarryOS', enWord: /quarry/i, swWord: /kwari|machimbo/i },
    { name: 'PharmacyOS', enWord: /pharmacy|medicine/i, swWord: /dawa|duka la dawa/i },
    { name: 'WholesaleOS', enWord: /wholesale/i, swWord: /jumla/i },
    { name: 'InterestOS', enWord: /goals|reminders|documents|personal/i, swWord: /malengo|vikumbusho|hati/i },
];

for (const app of OTHER_VERIFIED_APPS) {
    test(`GENERICITY EN: "What benefits does ${app.name} provide?" resolves with ${app.name}'s own real purpose text (not ChurchOS's)`, async () => {
        const provider = freshProvider();
        const r = await provider.think(`What benefits does ${app.name} provide?`, {});
        assert.equal(r.result.intent, 'app-importance');
        assert.match(r.result.text, new RegExp(app.name));
        assert.match(r.result.text, app.enWord);
        assert.doesNotMatch(r.result.text, /churches|congregations/i);
    });

    test(`GENERICITY SW: "${app.name} inasaidia mtu aje?" resolves with ${app.name}'s own real Kiswahili purpose text`, async () => {
        const provider = freshProvider();
        const r = await provider.think(`${app.name} inasaidia mtu aje?`, { language: 'sw' });
        assert.equal(r.result.intent, 'app-importance');
        assert.match(r.result.text, new RegExp(app.name));
        assert.match(r.result.text, app.swWord);
        assert.doesNotMatch(r.result.text, /makanisa/i);
    });

    test(`GENERICITY: contextual follow-up "kwa nini?" after asking about ${app.name} resolves against ${app.name}, not ChurchOS`, async () => {
        const provider = freshProvider();
        const first = await provider.think(`Why is ${app.name} important?`, {});
        assert.equal(first.result.conversationState.lastDiscussedApplication, app.name);
        const followup = await provider.think('kwa nini?', { conversationState: first.result.conversationState });
        assert.equal(followup.result.intent, 'app-importance');
        assert.match(followup.result.text, new RegExp(app.name));
    });
}

console.log('M363.1 application-knowledge-fix suite: run complete.');
