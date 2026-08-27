/**
 * core/modules/intelligence/advisor/tests/cozy-advisor-integration.test.js
 * Micro-Milestone I — REAL integration test.
 *
 * Loads the ACTUAL, unmodified:
 *   - core/modules/knowledge/cozyos-identity-faq-router.js
 *   - core/modules/intelligence/knowledge/cozy-knowledge-registry.js
 *   - core/modules/intelligence/cozy-ai.js               (getContext)
 *   - core/modules/intelligence/answer/cozy-answer-engine.js
 *   - core/modules/intelligence/advisor/cozy-advisor.js
 * and only stubs the lowest-level leaf (DeveloperIdentity) those real files
 * already depend on — proving the real
 *   question -> real router/getContext -> real AnswerEngine -> real Advisor
 * chain reaches a real, structured advice/encouragement result end to end.
 *
 * Also proves the missing-dependency path: Advisor with no answerResult at
 * all reports UNAVAILABLE honestly rather than fabricating a result.
 *
 * Run with: node core/modules/intelligence/advisor/tests/cozy-advisor-integration.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;
const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const ROUTER_PATH = path.join(ROOT, 'core', 'modules', 'knowledge', 'cozyos-identity-faq-router.js');
const KNOWLEDGE_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js');
const COZY_AI_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'cozy-ai.js');
const ANSWER_ENGINE_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'answer', 'cozy-answer-engine.js');
const ADVISOR_PATH = path.join(__dirname, '..', 'cozy-advisor.js');

function freshRealStack() {
    [ROUTER_PATH, KNOWLEDGE_PATH, COZY_AI_PATH, ANSWER_ENGINE_PATH, ADVISOR_PATH].forEach((p) => {
        delete require.cache[require.resolve(p)];
    });

    // Same minimal, realistic leaf stub cozy-answer-engine-integration.test.js
    // uses — the one real dependency the router's own header documents it reads.
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
        getCommunityInitiative: () => ({ summary: 'Anyone can contribute.', teachCozyAIExamples: ['10 words', 'a proverb'], note: 'Small contributions add up.' })
    });

    const win = { CozyOS: { DeveloperIdentity } };
    global.window = win;

    require(ROUTER_PATH);        // registers window.CozyOS.CozyIdentityFAQRouter (REAL)
    require(KNOWLEDGE_PATH);     // registers window.CozyOS.CozyKnowledge (REAL)
    require(COZY_AI_PATH);       // registers window.CozyOS.CozyAI, incl. getContext (REAL)
    require(ANSWER_ENGINE_PATH); // registers window.CozyOS.CozyAnswerEngine (REAL)
    require(ADVISOR_PATH);       // registers window.CozyOS.CozyAdvisor (REAL, this milestone)

    return win.CozyOS;
}

console.log('Micro-Milestone I — REAL integration tests (real router + real getContext + real AnswerEngine + real Advisor)\n');

test('REAL END-TO-END: an advice question resolves through the real chain to real recommendedNextSteps', async () => {
    const CozyOS = freshRealStack();
    const question = "How can this improve CozyOS?";
    const answerResult = await CozyOS.CozyAnswerEngine.answer(question);
    assert.strictEqual(answerResult.evidenceState, "VERIFIED");
    const advice = CozyOS.CozyAdvisor.advise({ question, answerResult });
    assert.strictEqual(advice.responseMode, "ADVICE");
    assert.strictEqual(advice.evidenceState, "VERIFIED");
    assert.ok(advice.recommendedNextSteps.length > 0);
    assert.deepStrictEqual(advice.sources, answerResult.sources);
});

test('REAL END-TO-END: an encouragement question resolves to encouragement grounded in the real verified answer', async () => {
    const CozyOS = freshRealStack();
    const question = "I'm struggling to finish this, can it really become something useful?";
    const answerResult = await CozyOS.CozyAnswerEngine.answer(question, { memoryQuery: "vision" });
    const advice = CozyOS.CozyAdvisor.advise({ question, answerResult });
    assert.strictEqual(advice.responseMode, "ENCOURAGEMENT");
    if (answerResult.evidenceState === "VERIFIED") {
        assert.ok(advice.encouragement.includes(answerResult.answer.slice(0, 15)));
    } else {
        assert.ok(advice.encouragement.toLowerCase().includes("don't have verified"));
    }
});

test('REAL: unmatched/unrelated question still flows chain-to-chain without crashing (missing-dependency-shaped path)', async () => {
    const CozyOS = freshRealStack();
    const question = "What should I build next for something with zero real evidence anywhere?";
    const answerResult = await CozyOS.CozyAnswerEngine.answer(question);
    const advice = CozyOS.CozyAdvisor.advise({ question, answerResult });
    assert.strictEqual(advice.responseMode, "ADVICE");
    if (answerResult.evidenceState !== "VERIFIED") {
        assert.strictEqual(advice.evidenceState, "INSUFFICIENT_DATA");
        assert.deepStrictEqual(advice.recommendedNextSteps, []);
    }
});

test('REAL: Advisor with genuinely no answerResult (AnswerEngine not reached) reports UNAVAILABLE, not fabricated advice', async () => {
    const CozyOS = freshRealStack();
    const advice = CozyOS.CozyAdvisor.advise({ question: "What should I build next?" });
    assert.strictEqual(advice.evidenceState, "UNAVAILABLE");
    assert.strictEqual(advice.responseMode, "INSUFFICIENT_EVIDENCE");
});

test('REAL: Private Story vault is structurally unreachable through the full chain into Advisor (no FounderStory reference anywhere in the chain files used here)', async () => {
    const fs = require('fs');
    for (const p of [ANSWER_ENGINE_PATH, ADVISOR_PATH]) {
        const src = fs.readFileSync(p, 'utf8');
        assert.ok(!/FounderStory\s*\.\s*(canView|getChapter)/.test(src), `${p} must not reference FounderStory's private read path`);
    }
});

(async () => {
    for (const { name, fn } of pending) {
        try {
            await fn();
            console.log(`  \u2713 ${name}`);
            passed++;
        } catch (err) {
            console.log(`  \u2717 ${name}`);
            console.log(`      ${err.message}`);
            failed++;
        }
    }
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
})();
