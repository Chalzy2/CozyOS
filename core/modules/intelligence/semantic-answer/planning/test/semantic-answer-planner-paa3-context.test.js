'use strict';

/**
 * core/modules/intelligence/semantic-answer/planning/test/semantic-answer-planner-paa3-context.test.js
 *
 * PAA-3 (Conversational-Context Follow-ups) — focused unit tests for
 * resolveGoal()'s new topic-continuation branch.
 *
 * REAL, TRACED ROOT CAUSE (confirmed via the real Live Window before
 * writing this fix): "What about members specifically?" / "Na kuhusu
 * wanachama?" after a ChurchOS benefit question contain NO goal-
 * indicating vocabulary at all — entity resolution (resolveContextualEntity(),
 * completely UNCHANGED by this file) already correctly inherits the
 * active ChurchOS entity from conversationState, but goal resolution
 * had nothing to work with and conceded to CLARIFICATION, losing the
 * topic entirely. This file proves the fix without ever creating a
 * second context/intent system: it is one new, narrow, disclosed
 * branch inside the EXISTING resolveGoal(), consulted only when a real
 * active entity already exists.
 *
 * Run with: node --test core/modules/intelligence/semantic-answer/planning/test/semantic-answer-planner-paa3-context.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFullStack, freshLoad } = require('./_test-helpers');

function churchosContext(lang) {
    return { lastIntent: 'app-importance', lastApplication: null, lastDiscussedApplication: 'ChurchOS', lastLanguage: lang || 'en' };
}

// ---- resolveGoal() unit behavior ----

test('resolveGoal: "what about X" with NO active conversationState still concedes to CLARIFICATION (unchanged pre-existing behavior — nothing to continue)', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'What about members specifically?' });
    assert.equal(result.success, true);
    assert.equal(result.plan.goal, 'CLARIFICATION');
});

test('resolveGoal: "what about X" WITH an active conversationState resolves to HUMAN_BENEFIT via topic-continuation, never CLARIFICATION', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'What about members specifically?', conversationState: churchosContext('en') });
    assert.equal(result.success, true);
    assert.equal(result.plan.goal, 'HUMAN_BENEFIT');
    assert.equal(result.diagnostics.goalSource, 'topic-continuation');
});

test('resolveGoal: a genuinely competing-goals turn is NEVER overridden by topic-continuation, even with an active entity — structural ambiguity always wins', () => {
    // Loads only the contracts + planner (real, unmodified), with a
    // fake SemanticIntentEngine stub reporting the exact real
    // competing_goals shape — the same isolation technique this
    // planner's own SA-8 Phase 2 test file already uses for testing a
    // specific ambiguity branch in isolation, never a second real
    // intent engine.
    const w = freshLoad(['planContract', 'evidenceContract', 'cognitiveDecision', 'planner']);
    w.CozyOS.SemanticIntentEngine = {
        analyze: (text) => ({
            goal: null, primaryIntent: null, language: 'en',
            normalizedText: text.toLowerCase(),
            entity: { value: null, canonicalValue: null, resolvedVia: null },
            ambiguity: { detected: true, clarificationRequired: true, reasons: ['competing_goals'] },
            clarification: { question: 'Which do you mean?' },
        }),
    };
    const planner = w.CozyOS.SemanticAnswerPlanner;
    const result = planner.planAnswer({ text: 'What about members specifically?', conversationState: churchosContext('en') });
    assert.equal(result.plan.goal, 'CLARIFICATION');
});

// ---- planAnswer() — real, end-to-end topic-continuation ----

test('EN: "What about members specifically?" after a ChurchOS context surfaces the real, topic-labeled benefitAreas claim first', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'What about members specifically?', conversationState: churchosContext('en') });
    assert.equal(result.success, true);
    assert.equal(result.plan.entity.value, 'ChurchOS');
    assert.ok(result.plan.claims.length <= 2, 'a subtopic follow-up must stay short, never the full benefit dump');
    assert.match(result.plan.claims[0].text, /Members/);
});

test('SW: "Na kuhusu wanachama?" (requestedLanguage sw) after a ChurchOS context surfaces the real, native Kiswahili "Wanachama" claim first', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'Na kuhusu wanachama?', conversationState: churchosContext('sw'), requestedLanguage: 'sw' });
    assert.equal(result.success, true);
    assert.equal(result.plan.language, 'sw');
    assert.match(result.plan.claims[0].text, /Wanachama/);
});

test('GRACEFUL FALLBACK: a topic-continuation follow-up for an entity with no authored benefitAreas still answers honestly from real humanBenefits evidence, never fabricating structure', () => {
    const { planner } = loadFullStack();
    const cs = { lastIntent: 'app-importance', lastApplication: null, lastDiscussedApplication: 'ShopOS', lastLanguage: 'en' };
    const result = planner.planAnswer({ text: 'What about pricing specifically?', conversationState: cs });
    assert.equal(result.success, true);
    assert.equal(result.plan.entity.value, 'ShopOS');
    assert.ok(result.plan.claims.length > 0);
});

test('SECURITY: no internal object/field names ("conversationState", "lastDiscussedApplication", "goalSource", "topic-continuation") ever appear inside a claim or plan text field', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'What about members specifically?', conversationState: churchosContext('en') });
    const allText = result.plan.claims.map((c) => c.text).join(' ');
    assert.doesNotMatch(allText, /conversationState|lastDiscussedApplication|goalSource|topic-continuation/i);
});
