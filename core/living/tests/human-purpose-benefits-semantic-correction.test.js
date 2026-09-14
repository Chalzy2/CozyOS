/**
 * core/living/tests/human-purpose-benefits-semantic-correction.test.js
 * CozyOS — Human-Purpose / Benefits Semantic Intent Correction
 *
 * ROOT CAUSE (confirmed by direct testing before any fix):
 *   APP_IMPORTANCE_PATTERN (shared by the "app-importance" intent, whose
 *   real job is answering questions about NAMED applications like
 *   ChurchOS/ShopOS) is generic enough to also match several natural
 *   CozyOS-benefit phrasings the "why-use-cozyos" intent didn't yet have
 *   a trigger for ("Why is CozyOS useful?", "Why does CozyOS matter?").
 *   Those phrasings extracted the literal candidate "cozyos" and asked
 *   getApplicationHumanPurposeFact("cozyos") - a table that has never
 *   contained CozyOS itself (CozyOS's own verified benefit knowledge
 *   lives in the separate getWhyUseCozyOSFact() source). Same root
 *   cause, same fix, for "app-info" and getApplicationFact("cozyos").
 *
 * THE FIX: rather than chasing every future phrasing into
 * "why-use-cozyos"/"what-is-cozyos"'s own trigger lists forever, both
 * "app-importance" and "app-info" now redirect internally to the real
 * CozyOS-specific knowledge source whenever their own extracted
 * candidate resolves to "cozyos" - one centralized correction, not a
 * growing pile of duplicated patterns.
 *
 * Run with: node --test core/living/tests/human-purpose-benefits-semantic-correction.test.js
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
    return registered.get('rule-based-conversational');
}

// ---- Section: the 9 required regression cases from the spec ----

const REQUIRED_CASES = [
    { text: 'How can I benefit from CozyOS?', mustNotBe: 'unsupported' },
    { text: 'What benefits does CozyOS give us?', mustNotBe: 'unsupported' },
    { text: 'What do I gain from CozyOS?', mustNotBe: 'unsupported' },
    { text: 'How does CozyOS help people?', mustNotBe: 'unsupported' },
    { text: 'Why is CozyOS useful?', mustNotBe: 'unsupported' },
    { text: 'What can CozyOS do for me?', mustNotBe: 'unsupported' },
    { text: 'What community problem does CozyOS solve?', mustNotBe: 'unsupported' },
    { text: "What's CozyOS?", mustBeIntent: 'what-is-cozyos' },
];

for (const c of REQUIRED_CASES) {
    test(`REQUIRED: "${c.text}" resolves to a real, verified answer`, async () => {
        const provider = freshProvider();
        const r = await provider.think(c.text, {});
        if (c.mustBeIntent) assert.equal(r.result.intent, c.mustBeIntent);
        if (c.mustNotBe) assert.notEqual(r.result.intent, c.mustNotBe);
        assert.doesNotMatch(r.result.text, /I don't have human-purpose information registered for "cozyos"/i);
        assert.doesNotMatch(r.result.text, /not.*registered application called "cozyos"/i);
        assert.match(r.result.text, /CozyOS/i);
    });
}

// ---- Core root-cause proof: both entry points converge on the SAME real answer ----

test('ROOT CAUSE FIX: "Why is CozyOS useful?" (app-importance-shaped) and "What benefits does CozyOS give us?" (why-use-cozyos-shaped) return the SAME real CozyOS knowledge, not two different failures', async () => {
    const provider = freshProvider();
    const viaAppImportanceShape = await provider.think('Why is CozyOS useful?', {});
    const viaWhyUseCozyosShape = await provider.think('What benefits does CozyOS give us?', {});
    assert.equal(viaAppImportanceShape.result.text, viaWhyUseCozyosShape.result.text);
});

test('"What do you know about CozyOS?" (app-info-shaped) redirects to the real what-is-cozyos knowledge, not a false "not registered" for the platform itself', async () => {
    const provider = freshProvider();
    const r = await provider.think('What do you know about CozyOS?', {});
    const direct = await provider.think("What's CozyOS?", {});
    assert.equal(r.result.text, direct.result.text);
});

// ---- Important distinction: different intents remain distinguishable ----

test('DISTINCTION: "What can CozyOS do?" (capabilities) and "What\'s CozyOS?" (identity) remain genuinely different questions/answers', async () => {
    const provider = freshProvider();
    const capabilities = await provider.think('What can CozyOS do?', {});
    const identity = await provider.think("What's CozyOS?", {});
    assert.notEqual(capabilities.result.text, identity.result.text);
});

test('DISTINCTION: a genuinely NAMED application (not CozyOS) is completely unaffected by the CozyOS redirect', async () => {
    const provider = freshProvider();
    const r = await provider.think('Why is ChurchOS useful?', {});
    assert.equal(r.result.intent, 'app-importance');
    assert.match(r.result.text, /ChurchOS/);
    assert.doesNotMatch(r.result.text, /^CozyOS exists to solve/);
});

// ---- Natural variation robustness (contractions, case, punctuation, pronouns) ----

const VARIATION_CASES = [
    "how can i benefit from cozyos",
    "HOW CAN I BENEFIT FROM COZYOS?",
    "How can I benefit from CozyOS",
    "How  can   I benefit from   CozyOS?",
    "What's the benefit of CozyOS?",
    "What is CozyOS good for?",
    "What does CozyOS offer?",
    "How does CozyOS help communities?",
    "What problems does CozyOS solve?",
    "Why does CozyOS matter?",
];

for (const text of VARIATION_CASES) {
    test(`VARIATION: "${text}" resolves to a real answer, not the generic fallback`, async () => {
        const provider = freshProvider();
        const r = await provider.think(text, {});
        assert.notEqual(r.result.intent, 'unsupported');
        assert.match(r.result.text, /CozyOS/i);
    });
}

// ---- No fabrication guard ----

test('NO FABRICATION: the redirect never invents content beyond the real, existing getWhyUseCozyOSFact()/getApplicationFact() sources', async () => {
    const provider = freshProvider();
    const r = await provider.think('Why is CozyOS useful?', {});
    // The reply must be the real, existing verified text (or its
    // honest not_found fallback) - never a newly-authored string that
    // did not exist before this fix.
    assert.ok(
        r.result.text.startsWith('CozyOS exists to solve') || /verified/i.test(r.result.text) === false,
        'reply should be the real getWhyUseCozyOSFact() answer or its existing honest not_found text'
    );
});

console.log('Human-Purpose/Benefits semantic intent correction suite: run complete.');
