'use strict';

/**
 * core/modules/intelligence/semantic-answer/planning/test/semantic-answer-planner-phase7-benefit-areas.test.js
 *
 * Phase 7 (Universal Application Human-Benefit Evidence & Semantic
 * Coverage) — end-to-end planAnswer() proof that the PAA-4 depth-adaptive
 * DEEP_EXPLANATION path (built for ChurchOS) correctly consumes the new
 * benefitAreas evidence for ShopOS, MpesaOS, InterestOS, and Media
 * Intelligence — without any change to classifyAnswerDepth() or the
 * claim-selection code itself: this file proves REUSE, not a new
 * mechanism per application.
 *
 * REAL, TRACED GAP (found while writing this file, not assumed): SA-3's
 * SemanticIntentEngine (core/living/cozy-ai-semantic-intent.js) resolves
 * an entity purely by NAME-SPOTTING text against its own disclosed,
 * "not exhaustive" KNOWN_ENTITIES list, which today contains only
 * ["cozyos", "churchos", "shopos", "quarryos"]. A bare, cold-start
 * question like "How does MpesaOS help in detail?" — with NO entityHint
 * and NO prior conversationState — therefore fails entity resolution
 * inside SA-3 itself (NO_ENTITY_RESOLVED) BEFORE classifyAnswerDepth()
 * ever runs, and cozy-answer-engine.js's tryConstructSemanticAnswer()
 * correctly returns null and falls through to the OLDER, flat context-
 * concatenation answer path (see human-benefit-application-coverage-
 * browser.test.js, which proves that older path already answers
 * "What does MpesaOS help with?" today) — a path that does NOT know
 * about detailLevel or benefitAreas at all.
 *
 * This is a genuine, pre-existing, disclosed scope limit of SA-3 itself
 * (its own KNOWN_ENTITIES comment says "not exhaustive"), NOT something
 * this Phase 7 pass is scoped to fix — widening SA-3's entity-spotting
 * list is a separate, larger change with its own wide blast radius
 * across many already-passing MpesaOS/InterestOS/QuarryOS tests that
 * currently rely on the older answer path, and is deliberately left
 * for a dedicated follow-up. What THIS file proves, honestly: the
 * benefitAreas evidence itself is real and correctly wired end-to-end
 * through SA-3/SA-4 the moment an entity IS resolved — via entityHint
 * (the same real, already-tested mechanism cozy-answer-engine.js's own
 * tryConstructSemanticAnswer() and cozy-living-assistant.js's own
 * contextualEntityName already use for a follow-up turn once an entity
 * has been established) or via ShopOS's pre-existing KNOWN_ENTITIES
 * membership for a bare cold-start question.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFullStack } = require('./_test-helpers');

test('ShopOS (in KNOWN_ENTITIES today): bare cold-start EN "in detail" question surfaces real, topic-grouped benefitAreas claims', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'How does ShopOS help a shop in detail?' });
    assert.equal(result.success, true);
    assert.equal(result.plan.entity.value, 'ShopOS');
    assert.equal(result.plan.detailLevel, 'DEEP_EXPLANATION');
    const texts = result.plan.claims.map((c) => c.text);
    assert.ok(texts.some((t) => /Product catalog|Branches and access|Shared data across CozyOS apps/.test(t)));
    assert.ok(texts.every((t) => /Benefit:/.test(t)));
});

test('DISCLOSED GAP: a bare, cold-start "How does MpesaOS help in detail?" (no entityHint, no prior context) does NOT reach SA-3 today — NO_ENTITY_RESOLVED, because MpesaOS is not in SemanticIntentEngine.KNOWN_ENTITIES', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'How does MpesaOS help a business in detail?' });
    assert.equal(result.success, false, 'this documents a REAL, pre-existing SA-3 scope limit, not a Phase 7 regression — see this file\'s own header comment');
    assert.equal(result.reason, 'NO_ENTITY_RESOLVED');
});

test('MpesaOS VIA ENTITYHINT (the real, already-tested follow-up mechanism): once an entity is resolved, "in detail" surfaces real, native Kiswahili benefitAreas claims', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'Eleza kwa undani inasaidiaje?', entityHint: 'MpesaOS', requestedLanguage: 'sw' });
    assert.equal(result.success, true);
    assert.equal(result.plan.entity.value, 'MpesaOS');
    assert.equal(result.plan.detailLevel, 'DEEP_EXPLANATION');
    assert.equal(result.plan.language, 'sw');
    const texts = result.plan.claims.map((c) => c.text);
    assert.ok(texts.some((t) => /Usahihi wa ada na kamisheni|Rekodi za miamala/.test(t)));
    assert.ok(texts.every((t) => /Faida:/.test(t)));
});

test('InterestOS VIA ENTITYHINT: "in detail" surfaces real Documents/Directives/Business Management claims', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'How does it help a person in detail?', entityHint: 'InterestOS' });
    assert.equal(result.success, true);
    assert.equal(result.plan.entity.value, 'InterestOS');
    assert.equal(result.plan.detailLevel, 'DEEP_EXPLANATION');
    const texts = result.plan.claims.map((c) => c.text);
    assert.ok(texts.some((t) => /Documents & Reminders|Directives & Teaching CozyOS|Business Management/.test(t)));
    assert.ok(texts.every((t) => /Benefit:/.test(t)));
});

test('Media Intelligence VIA ENTITYHINT: "in detail" surfaces real search/honest-not-found claims', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'How does it help a researcher in detail?', entityHint: 'Media Intelligence' });
    assert.equal(result.success, true);
    assert.equal(result.plan.entity.value, 'Media Intelligence');
    assert.equal(result.plan.detailLevel, 'DEEP_EXPLANATION');
    const texts = result.plan.claims.map((c) => c.text);
    assert.ok(texts.some((t) => /Finding testimony|Confirmed person-reference search|Honest/.test(t)));
    assert.ok(texts.every((t) => /Benefit:/.test(t)));
});

test('CROSS-APPLICATION ISOLATION (planner level): ShopOS in detail never surfaces MpesaOS/InterestOS/Media Intelligence claim text', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'How does ShopOS help a shop in detail?' });
    const joined = result.plan.claims.map((c) => c.text).join(' ');
    assert.doesNotMatch(joined, /commission|tariff|testimony|Teaching CozyOS/i);
});

test('CROSS-APPLICATION ISOLATION (planner level): MpesaOS (via entityHint) in detail never surfaces ShopOS/InterestOS/Media Intelligence claim text', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'How does it help in detail?', entityHint: 'MpesaOS' });
    assert.equal(result.success, true);
    const joined = result.plan.claims.map((c) => c.text).join(' ');
    assert.doesNotMatch(joined, /barcode|SKU|testimony|Teaching CozyOS/i);
});

test('EVIDENCE GAP (planner level): QuarryOS in detail still answers honestly from real humanBenefits/realLifeProblems, never fabricated benefitAreas structure', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'How does QuarryOS help a quarry in detail?' });
    assert.equal(result.success, true);
    assert.equal(result.plan.entity.value, 'QuarryOS');
    assert.equal(result.plan.detailLevel, 'DEEP_EXPLANATION');
    assert.ok(result.plan.claims.length > 0, 'must still produce a real, honest answer even without benefitAreas authored for QuarryOS');
    const joined = result.plan.claims.map((c) => c.text).join(' ');
    assert.doesNotMatch(joined, /Faida:|Benefit:/, 'without authored benefitAreas, claims must come from the flat humanBenefits fallback, never a fabricated point+benefit structure');
});

test('SECURITY: no internal object/field/file names ever appear inside a Phase 7 benefitAreas claim text', () => {
    const { planner } = loadFullStack();
    const cases = [
        { text: 'How does ShopOS help a shop in detail?' },
        { text: 'How does it help in detail?', entityHint: 'MpesaOS' },
        { text: 'How does it help a person in detail?', entityHint: 'InterestOS' },
        { text: 'How does it help a researcher in detail?', entityHint: 'Media Intelligence' },
    ];
    for (const c of cases) {
        const result = planner.planAnswer(c);
        assert.equal(result.success, true, `expected success for ${JSON.stringify(c)}`);
        const joined = result.plan.claims.map((cl) => cl.text).join(' ');
        assert.doesNotMatch(joined, /\.(?:js|html|css|json)\b|conversationState|CozyKnowledge|benefitAreas|getApplicationBenefitAreasFact/i, `leak in: ${JSON.stringify(c)}`);
    }
});
