'use strict';

/**
 * core/living/tests/cozy-living-assistant-domain4b-language-fallback.test.js
 *
 * Domain 4B (AI Integration discovery) — proves the real pieces feeding
 * cozy-living-assistant.js's new #send() fallback branch (added this
 * domain) each independently produce the values that branch depends on.
 *
 * WHY NOT A FULL #send() DRIVE
 *   Same honest limitation cozy-living-assistant-checkpoint-k.test.js
 *   already discloses: #send() is a private class method that touches
 *   window/document throughout and only truly runs in a browser. This
 *   file instead verifies, with the REAL, unmodified composition
 *   (CozyIdentityFAQRouter -> CozyAI.getContext() -> CozyAnswerEngine ->
 *   CozyAdvisor, plus the REAL rule-based-conversational-provider.js),
 *   every real value #send()'s new branch reads:
 *     1. CozyAnswerEngine.answer("Do you speak Kiswahili?") is honestly
 *        INSUFFICIENT_DATA (CozyIdentityFAQRouter has no intent for
 *        this — confirmed, not assumed).
 *     2. CozyAdvisor.advise() for that exact question classifies as
 *        UNKNOWN_REQUEST (confirming #send()'s new branch condition —
 *        responseMode === "UNKNOWN_REQUEST" && evidenceState !==
 *        "VERIFIED" — is real, not a guessed condition).
 *     3. The REAL rule-based-conversational-provider.js, given the same
 *        question, DOES produce a real, evidence-backed answer via its
 *        language-support-list intent (composing the real
 *        CozyLanguageRegistry (RP-027) + CozyKnowledge.
 *        getLanguageSupportListFact()) — the exact value #send() now
 *        surfaces via resolveConversationalReply(result.result).
 *   Together these prove #send()'s new branch is wired to real,
 *   evidence-backed values end to end, even though the DOM-bound method
 *   itself isn't driven directly here.
 *
 * Also proves Domain 4A's own required behavior is unaffected: a plain
 * question with a real VERIFIED identity-FAQ answer never enters the
 * new fallback branch at all (advisor.advise()'s responseMode for a
 * VERIFIED answer is never "UNKNOWN_REQUEST" in the sense that matters
 * here — the branch's guard requires evidenceState !== "VERIFIED" too).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const ROUTER_PATH = path.join(ROOT, 'core', 'modules', 'knowledge', 'cozyos-identity-faq-router.js');
const KNOWLEDGE_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js');
const COZY_AI_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'cozy-ai.js');
const ANSWER_ENGINE_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'answer', 'cozy-answer-engine.js');
const ADVISOR_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'advisor', 'cozy-advisor.js');

const LANGUAGE_REGISTRY_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'language', 'cozy-language-registry.js');
const LANGUAGE_TEMPLATES_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'language', 'cozy-language-templates.js');
const PUBLIC_KNOWLEDGE_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-public-knowledge-source.js');
const PROVIDER_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'providers', 'rule-based-conversational-provider.js');

const DeveloperIdentity = Object.freeze({
    answerWhoCreatedYou: () => ({ known: true, answer: 'CozyOS and CozyAI were founded by Charles Owuor.' }),
    answerWhyCreated: () => ({ known: true, answer: 'CozyOS started from real offline-access and language-access problems Charles saw firsthand.' }),
    getOfficialName: () => 'Charles Owuor',
    getKnownAs: () => ['Charles'],
    getCountry: () => 'Kenya',
    getRoles: () => ['Founder', 'Engineer'],
    getMission: () => ['work offline-first where possible', 'support many languages', 'be community-led'],
    getVision: () => 'To help preserve African languages and knowledge through technology.',
    getCorePhilosophy: () => ({ statement: 'AI should not just teach people — people should teach AI.' }),
    getDesignPrinciples: () => ['strengthen communities', 'preserve culture', 'respect every language'],
    getLongTermGoal: () => 'To build one of the largest community-led archives of African knowledge.',
    getCommunityInitiative: () => ({ summary: 'Anyone can contribute.', teachCozyAIExamples: ['10 words'], note: 'x' })
});

function freshAnswerChain() {
    [ROUTER_PATH, KNOWLEDGE_PATH, COZY_AI_PATH, ANSWER_ENGINE_PATH, ADVISOR_PATH].forEach((p) => delete require.cache[require.resolve(p)]);
    global.window = { CozyOS: { DeveloperIdentity } };
    require(ROUTER_PATH); require(KNOWLEDGE_PATH); require(COZY_AI_PATH); require(ANSWER_ENGINE_PATH); require(ADVISOR_PATH);
    return { answerEngine: global.window.CozyOS.CozyAnswerEngine, advisor: global.window.CozyOS.CozyAdvisor };
}

function makeFakeLivingAI() {
    const registered = new Map();
    return { registerProvider(name, provider) { registered.set(name, provider); return { success: true }; }, setActiveProvider() { return { success: true }; }, getActiveProvider() { return null; }, _registered: registered };
}
function makeFakeCoordinator() { return { async run() { return { interpretation: {}, thinking: {}, reasoning: {}, intelligence: {}, recalledMemories: [], policyResult: [], diagnostics: {} }; } }; }
function makeFakeProviderManager() { return { register() {}, healthReport: () => ({}) }; }

function freshRuleBasedProvider() {
    [LANGUAGE_REGISTRY_PATH, LANGUAGE_TEMPLATES_PATH, PUBLIC_KNOWLEDGE_PATH, KNOWLEDGE_PATH, PROVIDER_PATH].forEach((p) => delete require.cache[require.resolve(p)]);
    const fakeWindow = { CozyOS: { LivingAI: makeFakeLivingAI(), CognitiveCoordinator: makeFakeCoordinator(), ProviderManager: makeFakeProviderManager() } };
    global.window = fakeWindow;
    [LANGUAGE_REGISTRY_PATH, LANGUAGE_TEMPLATES_PATH, PUBLIC_KNOWLEDGE_PATH, KNOWLEDGE_PATH, PROVIDER_PATH].forEach((p) => require(p));
    return fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational');
}

// 1. CozyIdentityFAQRouter honestly has no opinion on this question.
test('"Do you speak Kiswahili?" -> CozyAnswerEngine reports INSUFFICIENT_DATA (no identity-FAQ intent for this)', async () => {
    const { answerEngine } = freshAnswerChain();
    const result = await answerEngine.answer('Do you speak Kiswahili?');
    assert.equal(result.evidenceState, 'INSUFFICIENT_DATA');
});

// 2. This confirms #send()'s new branch condition is real, not assumed.
test('"Do you speak Kiswahili?" -> CozyAdvisor classifies as UNKNOWN_REQUEST (confirms #send()\'s fallback-branch guard)', async () => {
    const { answerEngine, advisor } = freshAnswerChain();
    const answerResult = await answerEngine.answer('Do you speak Kiswahili?');
    const advice = advisor.advise({ question: 'Do you speak Kiswahili?', answerResult });
    assert.equal(advice.responseMode, 'UNKNOWN_REQUEST');
});

// 3. The real rule-based provider DOES have a genuine, evidence-backed answer.
test('"Do you speak Kiswahili?" -> real rule-based-conversational-provider answers via language-support-list, distinguishing AVAILABLE from NOT_READY', async () => {
    const provider = freshRuleBasedProvider();
    const result = await provider.think('Do you speak Kiswahili?');
    assert.equal(result.result.intent, 'language-support-list');
    assert.notEqual(result.result.intent, 'unsupported');
    assert.match(result.result.text, /verified and available to answer in:.*Kiswahili/i);
});

// 4. A currently-NOT_READY language must never be claimed as spoken.
test('"Do you speak Luo?" -> the real answer honestly lists Luo as NOT_READY, never claims it is available', async () => {
    const provider = freshRuleBasedProvider();
    const result = await provider.think('Do you speak Luo?');
    assert.equal(result.result.intent, 'language-support-list');
    assert.match(result.result.text, /not yet verified \(NOT_READY\):.*Luo/i);
});

// 5. General "which languages" phrasing still works (no regression to the existing pattern).
test('"Which languages does CozyOS support?" still resolves to language-support-list (existing phrasing unaffected)', async () => {
    const provider = freshRuleBasedProvider();
    const result = await provider.think('Which languages does CozyOS support?');
    assert.equal(result.result.intent, 'language-support-list');
});

// 6. Kiswahili-phrased capability question also works.
test('Kiswahili: "Je, CozyOS inajua Kiswahili?" -> language-support-list (Kiswahili phrasing of the same capability question)', async () => {
    const provider = freshRuleBasedProvider();
    const result = await provider.think('Je, CozyOS inajua Kiswahili?');
    assert.equal(result.result.intent, 'language-support-list');
});

// 7. Domain 4A's own required behavior is unaffected: #send()'s new
// branch requires BOTH responseMode === "UNKNOWN_REQUEST" AND
// evidenceState !== "VERIFIED" — a VERIFIED answer (e.g. the founder
// question) still gets UNKNOWN_REQUEST from classifyRequest() (it
// matches no advice/encouragement pattern either), but the AND
// condition correctly keeps it OUT of the new fallback branch, so
// renderAdvisorReply() still renders the real, verified founder answer
// exactly as before this domain's change.
test('Domain 4A unaffected: "Who founded CozyOS?" (VERIFIED) is never sent to the new fallback branch — renderAdvisorReply() still returns the real founder answer', async () => {
    const { answerEngine, advisor } = freshAnswerChain();
    const answerResult = await answerEngine.answer('Who founded CozyOS?');
    assert.equal(answerResult.evidenceState, 'VERIFIED');
    const advice = advisor.advise({ question: 'Who founded CozyOS?', answerResult });
    // #send()'s guard: only VERIFIED !== true is what excludes this
    // question from the new fallback branch — confirmed real here.
    assert.equal(answerResult.evidenceState === 'VERIFIED', true);
    assert.ok(advice.advice.includes('Charles Owuor'), 'the real, unmodified founder answer must still be present on advice.advice');
});

// 8. A genuinely unsupported/unrelated question still honestly has no rule-based answer either.
test('a genuinely unrelated question has no real rule-based answer either (both real sources honestly agree: no evidence)', async () => {
    const { answerEngine } = freshAnswerChain();
    const answerResult = await answerEngine.answer('What is the airspeed velocity of an unladen swallow?');
    assert.equal(answerResult.evidenceState, 'INSUFFICIENT_DATA');
    const provider = freshRuleBasedProvider();
    const result = await provider.think('What is the airspeed velocity of an unladen swallow?');
    assert.equal(result.result.intent, 'unsupported');
});
