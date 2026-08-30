/**
 * core/modules/intelligence/advisor/tests/cozy-advisor.test.js
 * Micro-Milestone I — CozyAdvisor unit tests (isolated, controlled fixtures).
 *
 * Run with: node core/modules/intelligence/advisor/tests/cozy-advisor.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;
const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

const ADVISOR_PATH = path.join(__dirname, '..', 'cozy-advisor.js');

function freshAdvisor() {
    delete require.cache[require.resolve(ADVISOR_PATH)];
    global.window = { CozyOS: {} };
    require(ADVISOR_PATH);
    return global.window.CozyOS.CozyAdvisor;
}

function verifiedAnswerFixture(overrides = {}) {
    return Object.assign({
        answer: "CozyOS currently includes these applications: ShopOS, MpesaOS, QuarryOS.",
        intent: "APPLICATION",
        responseMode: "FACT",
        evidenceState: "VERIFIED",
        sources: [{ authority: "knowledge-registry", getter: "listApplicationsFact", evidence: "VERIFIED" }],
        reasoningUsed: false,
        contextUsed: []
    }, overrides);
}

console.log('Micro-Milestone I — CozyAdvisor unit tests\n');

test('1. normal advice: recognized advice question with verified answerResult produces advice + steps', async () => {
    const advisor = freshAdvisor();
    const result = advisor.advise({
        question: "What should I build next?",
        answerResult: verifiedAnswerFixture()
    });
    assert.strictEqual(result.responseMode, "ADVICE");
    assert.strictEqual(result.evidenceState, "VERIFIED");
    assert.ok(result.advice && result.advice.length > 0);
    assert.ok(result.recommendedNextSteps.length > 0);
    assert.strictEqual(result.encouragement, null);
});

test('2. project-development advice: "how can this improve CozyOS" is classified ADVICE', async () => {
    const advisor = freshAdvisor();
    const result = advisor.advise({
        question: "How can this improve CozyOS?",
        answerResult: verifiedAnswerFixture()
    });
    assert.strictEqual(result.responseMode, "ADVICE");
});

test('3. technical advice: "how should this feature connect to the rest of CozyOS" is classified ADVICE with provider-based step', async () => {
    const advisor = freshAdvisor();
    const result = advisor.advise({
        question: "How should this feature connect to the rest of CozyOS?",
        answerResult: verifiedAnswerFixture({
            sources: [{ authority: "knowledge-registry", getter: "listProvidersFact", evidence: "VERIFIED" }]
        })
    });
    assert.strictEqual(result.responseMode, "ADVICE");
    assert.ok(result.recommendedNextSteps.some((s) => s.includes("provider")));
});

test('4. next-step recommendation is derived only from answerResult fields (comparison-shaped)', async () => {
    const advisor = freshAdvisor();
    const result = advisor.advise({
        question: "What is the best way to continue?",
        answerResult: verifiedAnswerFixture({ responseMode: "COMPARISON", sources: [] })
    });
    assert.ok(result.recommendedNextSteps.some((s) => s.toLowerCase().includes("comparison")));
});

test('5. encouragement request: recognized phrasing classified ENCOURAGEMENT', async () => {
    const advisor = freshAdvisor();
    const result = advisor.advise({
        question: "I feel like CozyOS is taking too long.",
        answerResult: verifiedAnswerFixture()
    });
    assert.strictEqual(result.responseMode, "ENCOURAGEMENT");
    assert.ok(result.encouragement);
    assert.strictEqual(result.advice, null);
});

test('6. grounded encouragement: encouragement text includes the real verified answer content, not generic filler', async () => {
    const advisor = freshAdvisor();
    const result = advisor.advise({
        question: "Can this really become something useful?",
        answerResult: verifiedAnswerFixture()
    });
    assert.ok(result.encouragement.includes("ShopOS"));
    assert.ok(result.encouragement.includes("knowledge-registry"));
});

test('7. insufficient context: non-VERIFIED answerResult forces evidenceState INSUFFICIENT_DATA and empty steps', async () => {
    const advisor = freshAdvisor();
    const result = advisor.advise({
        question: "What should I build next?",
        answerResult: verifiedAnswerFixture({ evidenceState: "INSUFFICIENT_DATA", answer: null, sources: [] })
    });
    assert.strictEqual(result.evidenceState, "INSUFFICIENT_DATA");
    assert.deepStrictEqual(result.recommendedNextSteps, []);
    assert.ok(result.advice.toLowerCase().includes("don't have verified"));
});

test('8. no fabricated progress: encouragement never invents content beyond answerResult.answer', async () => {
    const advisor = freshAdvisor();
    const result = advisor.advise({
        question: "I'm struggling to finish this.",
        answerResult: verifiedAnswerFixture({ evidenceState: "UNAVAILABLE", answer: null, sources: [] })
    });
    assert.ok(result.encouragement.toLowerCase().includes("don't have verified"));
    assert.ok(!result.encouragement.toLowerCase().includes("shopos"));
});

test('9. Public Story remains public: a public-story-sourced answerResult passes through without restriction', async () => {
    const advisor = freshAdvisor();
    const result = advisor.advise({
        question: "How can this improve CozyOS?",
        answerResult: verifiedAnswerFixture({
            intent: "ORIGIN_OR_STORY",
            sources: [{ authority: "knowledge-registry", getter: "getVisionFact", evidence: "VERIFIED" }]
        })
    });
    assert.strictEqual(result.evidenceState, "VERIFIED");
});

test('10. Private Story remains protected: Advisor never references FounderStory or a private read path anywhere in its source', async () => {
    const fs = require('fs');
    const src = fs.readFileSync(ADVISOR_PATH, 'utf8');
    assert.ok(!/FounderStory\.(canView|getChapter)/.test(src));
    assert.ok(!/viewerId/.test(src));
});

test('11. provenance preserved: sources array is passed through unmodified from answerResult', async () => {
    const advisor = freshAdvisor();
    const fixtureSources = [{ authority: "cozy-memory", namespace: "living-", key: "note-1", evidence: "VERIFIED" }];
    const result = advisor.advise({
        question: "What should I build next?",
        answerResult: verifiedAnswerFixture({ sources: fixtureSources })
    });
    assert.deepStrictEqual(result.sources, fixtureSources);
});

test('13. unknown/general request: question matching neither pattern set returns UNKNOWN_REQUEST and passes through the answer', async () => {
    const advisor = freshAdvisor();
    const result = advisor.advise({
        question: "What is the capital of Kenya?",
        answerResult: verifiedAnswerFixture({ answer: "Nairobi is the capital of Kenya." })
    });
    assert.strictEqual(result.responseMode, "UNKNOWN_REQUEST");
    assert.strictEqual(result.advice, "Nairobi is the capital of Kenya.");
    assert.deepStrictEqual(result.recommendedNextSteps, []);
    assert.strictEqual(result.encouragement, null);
});

test('missing answerResult: honestly reports UNAVAILABLE rather than fabricating advice', async () => {
    const advisor = freshAdvisor();
    const result = advisor.advise({ question: "What should I build next?" });
    assert.strictEqual(result.evidenceState, "UNAVAILABLE");
    assert.strictEqual(result.responseMode, "INSUFFICIENT_EVIDENCE");
});

test('missing question: rejected honestly', async () => {
    const advisor = freshAdvisor();
    const result = advisor.advise({ answerResult: verifiedAnswerFixture() });
    assert.strictEqual(result.evidenceState, "INSUFFICIENT_DATA");
    assert.strictEqual(result.responseMode, "INSUFFICIENT_EVIDENCE");
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
