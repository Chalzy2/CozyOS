'use strict';

/**
 * core/modules/intelligence/semantic-answer/planning/test/semantic-answer-planner-spiritualos.test.js
 *
 * SPIRITUALOS HUMAN-BENEFIT PHASE — end-to-end planAnswer() proof that
 * the PAA-3/PAA-4 pipeline correctly consumes the new "spiritualos"
 * APPLICATION_HUMAN_PURPOSE_DATA record and its benefitAreas evidence,
 * following the exact template semantic-answer-planner-phase8-
 * quarryos.test.js already established for QuarryOS. "SpiritualOS" is a
 * single-word application-style name added to SemanticIntentEngine's
 * KNOWN_ENTITIES the same way "quarryos" was, so its DEEP_EXPLANATION
 * path is reachable cold-start, single-turn, in both EN and SW.
 *
 * Also covers the governing directive's required test #23 items that
 * are properly PLANNER-level concerns (not browser-level): the "Na
 * viongozi?" honest-non-fabrication follow-up, and multi-turn
 * SpiritualOS <-> QuarryOS context switching.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFullStack } = require('./_test-helpers');

test('SpiritualOS EN (cold-start, single-turn): "in detail" surfaces real, topic-grouped benefitAreas claims', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'How does SpiritualOS help a person in detail?' });
    assert.equal(result.success, true);
    assert.equal(result.plan.entity.value, 'SpiritualOS');
    assert.equal(result.plan.detailLevel, 'DEEP_EXPLANATION');
    const texts = result.plan.claims.map((c) => c.text);
    assert.ok(texts.some((t) => /Personal Prayer|Scripture Reference Lookup|Daily Devotional Structure|Worship Overview/.test(t)));
    assert.ok(texts.every((t) => /Benefit:/.test(t)));
});

test('SpiritualOS SW (cold-start, single-turn): "kwa undani" surfaces real, native Kiswahili benefitAreas claims', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'Eleza kwa undani SpiritualOS inasaidiaje?', requestedLanguage: 'sw' });
    assert.equal(result.success, true);
    assert.equal(result.plan.entity.value, 'SpiritualOS');
    assert.equal(result.plan.detailLevel, 'DEEP_EXPLANATION');
    assert.equal(result.plan.language, 'sw');
    const texts = result.plan.claims.map((c) => c.text);
    assert.ok(texts.some((t) => /Maombi ya Kibinafsi|Utafutaji wa Andiko la Biblia/.test(t)));
    assert.ok(texts.every((t) => /Faida:/.test(t)));
});

test('REGRESSION: "What does SpiritualOS help with?" (no depth marker) uses the default, flat humanBenefits behavior', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'What does SpiritualOS help with?' });
    assert.equal(result.success, true);
    assert.equal(result.plan.detailLevel, 'STRUCTURED_EXPLANATION');
    const joined = result.plan.claims.map((c) => c.text).join(' ');
    assert.doesNotMatch(joined, /Benefit:/, 'the default (no depth marker) path must not switch to the benefitAreas structure');
});

test('HONEST NON-FABRICATION: a SpiritualOS "Na viongozi?" (leaders) follow-up never invents a leadership-specific benefit, and stays a real, grounded answer', () => {
    const { planner } = loadFullStack();
    const conversationState = { lastIntent: 'APP_BENEFITS', lastApplication: null, lastDiscussedApplication: 'SpiritualOS', lastLanguage: 'sw' };
    const result = planner.planAnswer({ text: 'Na viongozi?', conversationState, requestedLanguage: 'sw' });
    assert.equal(result.success, true);
    assert.equal(result.plan.entity.value, 'SpiritualOS');
    const joined = result.plan.claims.map((c) => c.text).join(' ');
    assert.doesNotMatch(joined, /kiongozi|uongozi/i, 'must never fabricate a leadership-specific claim that does not exist in the real data');
});

test('CONTEXT SWITCH: SpiritualOS -> QuarryOS -> "Na hiyo inamsaidiaje mtu?" correctly resolves the SWITCHED entity, not the stale one', () => {
    const { planner } = loadFullStack();
    // Turn 1: establish SpiritualOS as the active topic.
    const t1 = planner.planAnswer({ text: 'What does SpiritualOS help with?' });
    assert.equal(t1.plan.entity.value, 'SpiritualOS');
    // Turn 2: explicit topic switch to QuarryOS.
    const t2 = planner.planAnswer({ text: 'What about QuarryOS?', conversationState: { lastDiscussedApplication: 'SpiritualOS', lastLanguage: 'en' } });
    assert.equal(t2.plan ? t2.plan.entity.value : null, 'QuarryOS', 'an explicit new entity must override the stale SpiritualOS context');
    // Turn 3: a bare Kiswahili contextual follow-up ("hiyo" = "that") must resolve against QuarryOS (turn 2's topic), not SpiritualOS (turn 1's).
    const t3 = planner.planAnswer({ text: 'Na hiyo inamsaidiaje mtu?', conversationState: { lastDiscussedApplication: 'QuarryOS', lastLanguage: 'sw' }, requestedLanguage: 'sw' });
    assert.equal(t3.success, true);
    assert.equal(t3.plan.entity.value, 'QuarryOS');
    const joined = t3.plan.claims.map((c) => c.text).join(' ');
    assert.doesNotMatch(joined, /prayer|scripture|devotional|worship|maombi|ibada/i, 'must answer about QuarryOS, never leak SpiritualOS vocabulary from the earlier turn');
});

test('CROSS-APPLICATION ISOLATION (planner level): SpiritualOS in detail never surfaces QuarryOS/ShopOS/MpesaOS/InterestOS claim text', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'How does SpiritualOS help a person in detail?' });
    const joined = result.plan.claims.map((c) => c.text).join(' ');
    assert.doesNotMatch(joined, /royalty|land-owner|crusher|dispatch|barcode|SKU|commission|tariff/i);
});

test('SECURITY: no internal object/field/file names ever appear inside a SpiritualOS benefitAreas claim text', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'How does SpiritualOS help a person in detail?' });
    const joined = result.plan.claims.map((c) => c.text).join(' ');
    assert.doesNotMatch(joined, /\.(?:js|html|css|json)\b|conversationState|CozyKnowledge|benefitAreas|spiritual-capability|window\.CozyOS/i);
});
