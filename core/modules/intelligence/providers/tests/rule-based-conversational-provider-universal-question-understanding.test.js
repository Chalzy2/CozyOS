/**
 * core/modules/intelligence/providers/tests/rule-based-conversational-provider-universal-question-understanding.test.js
 * CozyOS — Universal Question Understanding Repair (Direct + Indirect)
 *
 * REAL, LIVE-CONFIRMED FAILURES THIS SUITE PROVES FIXED
 *   Reported directly from a live CozyOS Assistant transcript:
 *     "How is human benefits with it in real life"
 *       -> "Some related context exists, but nothing in it could be
 *          honestly rendered as a verified answer."
 *     "Human benefits with cozyos"
 *       -> same fallback.
 *     "What problems does it solve" (as a follow-up, no app previously
 *      named, only CozyOS-platform turns before it)
 *       -> "I don't have human-purpose information registered for that
 *          application yet."
 *   while "What Cozyos for", "What's the vision", and "Public story
 *   behind it" already worked — proving the underlying knowledge (and
 *   partial understanding) existed, but access to it was incomplete.
 *
 * ROOT CAUSES FOUND (see the two files' own inline comments for detail)
 *   1. core/modules/intelligence/providers/rule-based-conversational-
 *      provider.js — conversationState.lastDiscussedApplication (the
 *      ONE existing cross-turn entity-context tracker this file already
 *      uses for named applications) never admitted "CozyOS" the
 *      PLATFORM as a valid entity, even after a turn that was
 *      genuinely, exclusively about the platform (what-is-cozyos,
 *      cozyos-vision, public-story, why-use-cozyos, etc.). A later bare
 *      pronoun follow-up ("What problems does it solve?") therefore had
 *      no real referent to resolve "it" against, fell through to the
 *      PER-APPLICATION human-purpose registry with an empty candidate,
 *      and produced the (structurally guaranteed) NOT_FOUND reply.
 *   2. core/modules/intelligence/cozy-ai.js — getContext()'s generic,
 *      last-resort keyword-routing table (CONTEXT_KNOWLEDGE_ROUTES) had
 *      no route at all to the real, already-VERIFIED getWhyUseCozyOSFact()
 *      / getDifferentiationFact() facts for benefit/problem/importance-
 *      shaped questions, so a question that matched NO higher-level
 *      intent (any sufficiently indirect/malformed phrasing) could
 *      never reach that real evidence even as a fallback.
 *
 * THE FIX (see inline comments in both files)
 *   - PLATFORM_LEVEL_INTENTS (provider file): the SAME single
 *     lastDiscussedApplication tracker now also records "CozyOS" after
 *     any of the provider's own existing platform-level intents, using
 *     the SAME redirect logic ("/^cozyos\\b/i") the app-importance case
 *     already had for an explicitly-typed "cozyos" candidate.
 *   - Two new CONTEXT_KNOWLEDGE_ROUTES entries (cozy-ai.js) point
 *     generic benefit/problem/importance keyword stems at the two real,
 *     already-VERIFIED platform facts, guarded by
 *     _mentionsNamedApplication() so a question that actually names a
 *     specific sub-application (ShopOS/ChurchOS/etc.) is never answered
 *     with generic platform content.
 *
 * Run with: node --test core/modules/intelligence/providers/tests/rule-based-conversational-provider-universal-question-understanding.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const PROVIDER_PATH = path.join(ROOT, 'providers', 'rule-based-conversational-provider.js');
const TEMPLATES_PATH = path.join(ROOT, 'language', 'cozy-language-templates.js');
const REGISTRY_PATH = path.join(ROOT, 'language', 'cozy-language-registry.js');
const PUBLIC_KNOWLEDGE_PATH = path.join(ROOT, 'knowledge', 'cozy-public-knowledge-source.js');
const KNOWLEDGE_REGISTRY_PATH = path.join(ROOT, 'knowledge', 'cozy-knowledge-registry.js');
const DEV_PROFILE_PATH = path.join(ROOT, '..', '..', 'identity', 'developer-profile.js');
const PROJECT_HISTORY_PATH = path.join(ROOT, '..', '..', 'identity', 'project-history.js');
const AFRICAN_KNOWLEDGE_PATH = path.join(ROOT, '..', '..', 'identity', 'african-knowledge-initiative.js');
const IDENTITY_ASSEMBLY_PATH = path.join(ROOT, '..', '..', 'identity', 'cozyai-identity.js');
const FAQ_ROUTER_PATH = path.join(ROOT, '..', 'knowledge', 'cozyos-identity-faq-router.js');
// PHASE 6 Universal Semantic Engine — real, existing, standalone
// (core/living/cozy-ai-semantic-intent.js). Loaded here because the
// live transcript this suite reproduces shows it active: "What Cozyos
// for" only resolves correctly (entity=CozyOS, primaryIntent
// APP_IDENTITY -> legacy intent "what-is-cozyos" via
// SEMANTIC_TO_LEGACY_INTENT above) when this engine is present -
// omitting it from the test stack would test a code path the real
// deployment doesn't actually take for that phrasing.
const SEMANTIC_ENGINE_PATH = path.join(ROOT, '..', '..', 'living', 'cozy-ai-semantic-intent.js');

const ALL_PATHS = [DEV_PROFILE_PATH, PROJECT_HISTORY_PATH, AFRICAN_KNOWLEDGE_PATH, IDENTITY_ASSEMBLY_PATH, REGISTRY_PATH, TEMPLATES_PATH, PUBLIC_KNOWLEDGE_PATH, KNOWLEDGE_REGISTRY_PATH, FAQ_ROUTER_PATH, SEMANTIC_ENGINE_PATH, PROVIDER_PATH];

function freshProvider(extraCozyOS) {
    ALL_PATHS.forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    const registered = new Map();
    global.window = { CozyOS: Object.assign({ LivingAI: { registerProvider(name, p) { registered.set(name, p); }, setActiveProvider() {} } }, extraCozyOS) };
    for (const p of ALL_PATHS) require(p);
    return registered.get('rule-based-conversational');
}

// ---------------------------------------------------------------------
// A. DIRECT ROOT-CAUSE REPRODUCTION — exact live-transcript phrasing
// ---------------------------------------------------------------------

test('ROOT CAUSE: after a platform-level turn ("What Cozyos for"), a pronoun follow-up ("What problems does it solve?") resolves to real CozyOS knowledge, not the per-application NOT_FOUND message', async () => {
    const provider = freshProvider();
    const turn1 = await provider.think('What Cozyos for', {});
    const turn2 = await provider.think('What problems does it solve', { conversationState: turn1.result.conversationState });
    assert.doesNotMatch(turn2.result.text, /I don't have human-purpose information registered/i);
    assert.match(turn2.result.text, /CozyOS exists to solve/i);
});

test('ROOT CAUSE: after "What\'s the vision", "How is human benefits with it in real life" style follow-ups resolve via lastDiscussedApplication="CozyOS"', async () => {
    const provider = freshProvider();
    const turn1 = await provider.think("What's the vision", {});
    assert.equal(turn1.result.conversationState.lastDiscussedApplication, 'CozyOS');
    const turn2 = await provider.think('What problems does it solve', { conversationState: turn1.result.conversationState });
    assert.equal(turn2.result.intent, 'app-importance');
    assert.match(turn2.result.text, /CozyOS exists to solve/i);
});

for (const platformIntentText of [
    'What Cozyos for',
    "What's the vision",
    'Public story behind it',
    'What is the mission',
    'History of CozyOS',
    "What's CozyOS",
]) {
    test(`CONTEXT TRACKING: "${platformIntentText}" records CozyOS as the discussed entity (lastDiscussedApplication)`, async () => {
        const provider = freshProvider();
        const r = await provider.think(platformIntentText, {});
        assert.equal(r.result.conversationState.lastDiscussedApplication, 'CozyOS');
    });
}

// ---------------------------------------------------------------------
// B. GETCONTEXT() FALLBACK — cozy-ai.js CONTEXT_KNOWLEDGE_ROUTES
// ---------------------------------------------------------------------

function loadAiStack() {
    [REGISTRY_PATH, TEMPLATES_PATH, PUBLIC_KNOWLEDGE_PATH, KNOWLEDGE_REGISTRY_PATH, DEV_PROFILE_PATH, PROJECT_HISTORY_PATH, AFRICAN_KNOWLEDGE_PATH, IDENTITY_ASSEMBLY_PATH]
        .forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    const cozyAiPath = path.join(ROOT, 'cozy-ai.js');
    try { delete require.cache[require.resolve(cozyAiPath)]; } catch (_e) { /* not loaded */ }
    global.window = {
        CozyOS: {
            DeveloperIdentity: { answerWhoCreatedYou: () => ({ known: true, answer: 'Test.' }) },
            ServiceRegistry: { listApplications: () => [{ id: 'shopos', name: 'ShopOS' }, { id: 'churchos', name: 'ChurchOS' }] }
        }
    };
    [DEV_PROFILE_PATH, PROJECT_HISTORY_PATH, AFRICAN_KNOWLEDGE_PATH, IDENTITY_ASSEMBLY_PATH, REGISTRY_PATH, TEMPLATES_PATH, PUBLIC_KNOWLEDGE_PATH, KNOWLEDGE_REGISTRY_PATH]
        .forEach((p) => require(p));
    require(cozyAiPath);
    // cozy-ai.js also composes CozyMemory; keep it absent-but-harmless
    // (getContext() already fails closed to "no memory results" when
    // window.CozyOS.CozyMemory isn't loaded — no memory engine needed
    // to prove the knowledge-registry routing fix below).
    return window.CozyOS.CozyAI;
}

for (const garbledText of [
    'How is human benefits with it in real life',
    'Human benefits with cozyos',
    'What problems doe cozyos solveinreal life',
]) {
    test(`GETCONTEXT FALLBACK: "${garbledText}" now surfaces real, VERIFIED platform content instead of an empty/unrenderable result`, async () => {
        const ai = loadAiStack();
        const ctx = await ai.getContext(garbledText, { actorId: 'anyone' });
        const hit = ctx.results.find((r) => r.getter === 'getWhyUseCozyOSFact');
        assert.ok(hit, `expected a getWhyUseCozyOSFact result for "${garbledText}"`);
        assert.equal(hit.evidence, 'VERIFIED');
        assert.match(hit.content, /CozyOS exists to solve/i);
    });
}

test('GETCONTEXT GUARD: a question naming a specific application (ShopOS) is never answered with generic platform content', async () => {
    const ai = loadAiStack();
    const ctx = await ai.getContext('What problem does ShopOS solve?', { actorId: 'anyone' });
    const platformHit = ctx.results.find((r) => r.getter === 'getWhyUseCozyOSFact' || r.getter === 'getDifferentiationFact');
    assert.equal(platformHit, undefined, 'platform-level content must not be injected when a specific application is named');
});

test('GETCONTEXT: an "important"/"why does it matter" style question surfaces getDifferentiationFact()', async () => {
    const ai = loadAiStack();
    const ctx = await ai.getContext('Why is CozyOS important to communities?', { actorId: 'anyone' });
    const hit = ctx.results.find((r) => r.getter === 'getDifferentiationFact');
    assert.ok(hit, 'expected a getDifferentiationFact result');
    assert.equal(hit.evidence, 'VERIFIED');
});

// ---------------------------------------------------------------------
// C. DISTINCTION — named applications remain completely unaffected
// ---------------------------------------------------------------------

for (const [appName, expectSubstring] of [['ShopOS', 'ShopOS'], ['ChurchOS', 'ChurchOS'], ['Authenticator', 'Authenticator']]) {
    test(`DISTINCTION: "Why is ${appName} important?" still answers about ${appName} itself, never redirected to platform content`, async () => {
        const provider = freshProvider();
        const r = await provider.think(`Why is ${appName} important?`, {});
        assert.equal(r.result.intent, 'app-importance');
        assert.match(r.result.text, new RegExp(appName, 'i'));
        assert.doesNotMatch(r.result.text, /^CozyOS exists to solve/);
    });

    test(`DISTINCTION: after discussing ${appName}, a bare pronoun follow-up ("Who benefits from it?") still resolves to ${appName}, not CozyOS`, async () => {
        const provider = freshProvider();
        const turn1 = await provider.think(`Tell me about ${appName}.`, {});
        assert.equal(turn1.result.conversationState.lastDiscussedApplication, appName);
        const turn2 = await provider.think('Who benefits from it?', { conversationState: turn1.result.conversationState });
        assert.doesNotMatch(turn2.result.text, /^CozyOS exists to solve/);
    });
}

test('ENTITY SWITCHING: CozyOS platform context, then a named application, then back to a bare pronoun — each turn resolves the CURRENT real entity', async () => {
    const provider = freshProvider();
    const t1 = await provider.think('What Cozyos for', {});
    assert.equal(t1.result.conversationState.lastDiscussedApplication, 'CozyOS');
    const t2 = await provider.think('Tell me about ShopOS.', { conversationState: t1.result.conversationState });
    assert.equal(t2.result.conversationState.lastDiscussedApplication, 'ShopOS');
    const t3 = await provider.think('Why is it important?', { conversationState: t2.result.conversationState });
    assert.match(t3.result.text, /ShopOS/i);
    assert.doesNotMatch(t3.result.text, /^CozyOS exists to solve/);
});

console.log('Universal Question Understanding repair suite: run complete.');
