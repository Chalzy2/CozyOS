'use strict';

/**
 * core/modules/intelligence/semantic-answer/planning/test/semantic-answer-planner-sa8-phase2.test.js
 *
 * SA-8 Phase 2 (Fresh Generative Sentence Construction) — focused unit
 * tests for the two real, minimal changes this phase made to
 * semantic-answer-planner.js:
 *
 *   1. SUPPLEMENTARY_GOAL_PATTERNS gained /saidia/i (sw), /\bhelp(?:s|ed|
 *      ing)?\b/i (en), /punguza/i (sw), and /\breduc(?:e|es|ing)\b.*\bwork\b/i
 *      (en) — closing a real, empirically-confirmed gap where natural
 *      "how can/does X help"/"X inaweza kusaidiaje/kunisaidiaje" and
 *      "kupunguza kazi" phrasings matched ZERO patterns (primary engine
 *      AND this file's own pre-existing supplementary set) and fell all
 *      the way through to CLARIFICATION instead of engaging the real,
 *      evidence-grounded HUMAN_BENEFIT/PRACTICAL_WORK_CONTRIBUTION path.
 *
 *   2. resolveGoal() now skips the supplementary layer entirely when the
 *      real SemanticIntentEngine's own ambiguity reason is
 *      "competing_goals" — a real, structural two-intent ambiguity where
 *      a narrow regex guessing a side would silently bypass SA-8 Phase
 *      1's own clarification-intelligence guarantee. This guard was
 *      added AFTER discovering, by running the existing suite, that the
 *      broad new "help" pattern regressed exactly this case.
 *
 *   3. Claims are now ranked by real keyword overlap with the user's own
 *      normalized question text (rankClaimsByRelevance()) before being
 *      returned, so two different novel phrasings of the SAME goal
 *      surface the evidence most relevant to what was actually asked —
 *      never inventing a claim, never dropping one, and never reordering
 *      at all when nothing overlaps (grounded, not invented).
 *
 * Run with: node --test core/modules/intelligence/semantic-answer/planning/test/semantic-answer-planner-sa8-phase2.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFullStack, freshLoad } = require('./_test-helpers');

function fakeAdapterStack(collectApplicationHumanPurposeEvidence) {
    const w = freshLoad(['semanticIntent', 'planContract', 'evidenceContract', 'cognitiveDecision', 'planner']);
    w.CozyOS.VerifiedEvidenceAdapter = { collectApplicationHumanPurposeEvidence, collectSystemFactEvidence: () => ({ success: false, evidence: [], errors: ['not used in this fixture'] }) };
    return w.CozyOS.SemanticAnswerPlanner;
}

function fakeEvidence(id, claim, status, language) {
    return {
        schemaVersion: 'cozy.verified-evidence.v1', id, claim,
        source: { type: 'APPLICATION_HUMAN_PURPOSE', id: 'churchos', path: 'APPLICATION_HUMAN_PURPOSE_DATA.churchos.humanBenefits' },
        verification: { status, confidence: status === 'VERIFIED' ? 'HIGH' : 'LOW' },
        sensitivity: 'PUBLIC', language,
    };
}

// ---------- new supplementary patterns: real, novel phrasings this phase closes ----------

test('SA-8 PHASE 2 NEW PATTERN (sw/saidia): "ChurchOS inaweza kunisaidiaje kama tuna waumini wengi na matawi kadhaa?" now resolves to HUMAN_BENEFIT instead of falling through to CLARIFICATION', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'ChurchOS inaweza kunisaidiaje kama tuna waumini wengi na matawi kadhaa?' });
    assert.equal(result.success, true);
    assert.equal(result.plan.goal, 'HUMAN_BENEFIT');
    assert.equal(result.plan.entity.value, 'ChurchOS');
    assert.equal(result.diagnostics.cognitiveStatus, 'UNDERSTOOD');
    assert.ok(result.plan.claims.length > 0);
});

test('SA-8 PHASE 2 NEW PATTERN (en/help): "How could ChurchOS help a church with many members?" now resolves to HUMAN_BENEFIT', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'How could ChurchOS help a church with many members?' });
    assert.equal(result.success, true);
    assert.equal(result.plan.goal, 'HUMAN_BENEFIT');
    assert.equal(result.plan.language, 'en');
});

test('SA-8 PHASE 2 NEW PATTERN (sw/punguza): "Kanisa kubwa linawezaje kutumia ChurchOS kupunguza kazi za admin?" now resolves to PRACTICAL_WORK_CONTRIBUTION', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'Kanisa kubwa linawezaje kutumia ChurchOS kupunguza kazi za admin?' });
    assert.equal(result.success, true);
    assert.equal(result.plan.goal, 'PRACTICAL_WORK_CONTRIBUTION');
    assert.equal(result.diagnostics.goalSource, 'supplementary-pattern');
});

test('CODE-SWITCH: "ChurchOS inaweza kusaidiaje kwa attendance ya branches zetu?" (Kiswahili sentence carrying English loanwords) still resolves to HUMAN_BENEFIT, proving the new pattern is not defeated by code-switched phrasing', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'ChurchOS inaweza kusaidiaje kwa attendance ya branches zetu?' });
    assert.equal(result.success, true);
    assert.equal(result.plan.goal, 'HUMAN_BENEFIT');
    assert.equal(result.plan.language, 'sw', 'the sentence is predominantly Kiswahili; the engine\'s own language detection is unmodified by this phase');
});

// ---------- regression guard: competing goals must still reach real clarification ----------

test('REGRESSION GUARD: "I want to buy ChurchOS but how does it help me?" (real competing_goals ambiguity) still resolves to CLARIFICATION_REQUIRED, never guessing HUMAN_BENEFIT just because the new broad "help" pattern would otherwise match', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'I want to buy ChurchOS but how does it help me?' });
    assert.equal(result.diagnostics.cognitiveStatus, 'CLARIFICATION_REQUIRED');
    assert.equal(result.plan.goal, 'CLARIFICATION');
});

test('REGRESSION GUARD unit-level: resolveGoal() itself never consults the supplementary layer when ambiguity.reasons includes "competing_goals", even when the raw text contains a supplementary-pattern keyword', () => {
    const { planner } = loadFullStack();
    const intentResult = {
        goal: null,
        primaryIntent: 'UNKNOWN_INTENT',
        ambiguity: { detected: true, reasons: ['competing_goals'], clarificationRequired: true },
        clarification: { required: true, reason: 'competing_goals', question: 'Which one do you mean?' },
    };
    const resolved = planner.resolveGoal(intentResult, 'text that contains help and saidia and punguza');
    assert.equal(resolved.goal, 'CLARIFICATION');
    assert.equal(resolved.goalSource, 'clarification');
});

test('NON-REGRESSION: "no_pattern_matched" (nothing competing, the engine simply has no rule) still reaches the supplementary layer exactly as before this phase\'s guard was added', () => {
    const { planner } = loadFullStack();
    const intentResult = {
        goal: null,
        primaryIntent: 'UNKNOWN_INTENT',
        ambiguity: { detected: true, reasons: ['no_pattern_matched'], clarificationRequired: true },
        clarification: null,
    };
    const resolved = planner.resolveGoal(intentResult, 'this text mentions help directly');
    assert.equal(resolved.goal, 'HUMAN_BENEFIT');
    assert.equal(resolved.goalSource, 'supplementary-pattern');
});

// ---------- claim relevance ranking: real differentiation, never fabrication ----------

test('RELEVANCE RANKING: when the question\'s own words overlap with a LATER claim in evidence-authoring order, that claim is promoted to the front — real per-question differentiation over the same underlying evidence set', () => {
    const planner = fakeAdapterStack(() => ({
        success: true,
        evidence: [
            fakeEvidence('ev-1', 'easier administration for everyday tasks.', 'VERIFIED', 'en'),
            fakeEvidence('ev-2', 'better organization overall.', 'VERIFIED', 'en'),
            fakeEvidence('ev-3', 'better visibility into attendance records across branches.', 'VERIFIED', 'en'),
        ],
        errors: [],
    }));
    const result = planner.planAnswer({ text: 'ChurchOS inasaidiaje mtu?', entityHint: 'ChurchOS', requestedLanguage: 'en' });
    // Force the question text used for ranking via a second call that shares the same evidence shape:
    const resultWithAttendanceQuestion = planner.planAnswer({ text: 'How does ChurchOS help with attendance across our branches?', entityHint: 'ChurchOS', requestedLanguage: 'en' });
    assert.equal(resultWithAttendanceQuestion.success, true);
    assert.equal(resultWithAttendanceQuestion.plan.claims[0].text, 'better visibility into attendance records across branches.', 'the attendance-specific claim should be promoted to the front for an attendance-specific question');
    // Sanity: the generic question (no lexical overlap beyond common short words) leaves the original evidence order alone.
    assert.equal(result.plan.claims[0].text, 'easier administration for everyday tasks.');
});

test('RELEVANCE RANKING HONEST FALLBACK: when NO claim lexically overlaps with the question, the original evidence-authoring order is left completely unchanged — never a fabricated reordering', () => {
    const planner = fakeAdapterStack(() => ({
        success: true,
        evidence: [
            fakeEvidence('ev-1', 'Alpha benefit text.', 'VERIFIED', 'en'),
            fakeEvidence('ev-2', 'Beta benefit text.', 'VERIFIED', 'en'),
            fakeEvidence('ev-3', 'Gamma benefit text.', 'VERIFIED', 'en'),
        ],
        errors: [],
    }));
    const result = planner.planAnswer({ text: 'ChurchOS inasaidiaje mtu?', entityHint: 'ChurchOS', requestedLanguage: 'en' });
    assert.equal(result.success, true);
    assert.deepEqual(result.plan.claims.map((c) => c.text), ['Alpha benefit text.', 'Beta benefit text.', 'Gamma benefit text.']);
});

test('RELEVANCE RANKING never drops or invents a claim: the ranked claim set is always the exact same set as the unranked one, only reordered', () => {
    const planner = fakeAdapterStack(() => ({
        success: true,
        evidence: [
            fakeEvidence('ev-1', 'easier administration for everyday tasks.', 'VERIFIED', 'en'),
            fakeEvidence('ev-2', 'better organization overall.', 'VERIFIED', 'en'),
            fakeEvidence('ev-3', 'better visibility into attendance records across branches.', 'VERIFIED', 'en'),
        ],
        errors: [],
    }));
    const result = planner.planAnswer({ text: 'How does ChurchOS help with attendance across our branches?', entityHint: 'ChurchOS', requestedLanguage: 'en' });
    assert.equal(result.plan.claims.length, 3);
    assert.deepEqual(new Set(result.plan.claims.map((c) => c.text)), new Set(['easier administration for everyday tasks.', 'better organization overall.', 'better visibility into attendance records across branches.']));
    assert.deepEqual(new Set(result.plan.claims.flatMap((c) => c.evidenceIds)), new Set(['ev-1', 'ev-2', 'ev-3']));
});

// ---------- deterministic action must never be routed to generation ----------

test('CRITICAL: a genuine deterministic-action question ("remind me tomorrow") is never planned/answered via the evidence-construction path merely because that path exists — it is honestly classified ACTION_NOT_PLANNABLE_BY_SA3, so the real, existing reminder-action handling elsewhere in the codebase is never bypassed by generation', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'remind me tomorrow' });
    assert.equal(result.success, false);
    assert.equal(result.reason, 'ACTION_NOT_PLANNABLE_BY_SA3');
    assert.equal(result.goal, 'CREATE_REMINDER');
    assert.equal(result.diagnostics.cognitiveStatus, 'ACTION_REQUIRED');
});
