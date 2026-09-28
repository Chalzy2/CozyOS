'use strict';

/**
 * core/modules/intelligence/semantic-answer/planning/test/semantic-answer-planner-phase8-quarryos.test.js
 *
 * Phase 8 (QuarryOS Full Application Integration) — end-to-end
 * planAnswer() proof that the PAA-4 depth-adaptive DEEP_EXPLANATION path
 * correctly consumes QuarryOS's new benefitAreas evidence, closing the
 * evidence gap Phase 7 explicitly left open. QuarryOS is a single-word
 * application name and IS present in SemanticIntentEngine's
 * KNOWN_ENTITIES (cozy-ai-semantic-intent.js) — unlike Media
 * Intelligence's disclosed multi-word gap, QuarryOS's DEEP_EXPLANATION
 * path is reachable cold-start, single-turn, in both EN and SW.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFullStack } = require('./_test-helpers');

test('QuarryOS EN (cold-start, single-turn): "in detail" surfaces real, topic-grouped benefitAreas claims', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'How does QuarryOS help a quarry in detail?' });
    assert.equal(result.success, true);
    assert.equal(result.plan.entity.value, 'QuarryOS');
    assert.equal(result.plan.detailLevel, 'DEEP_EXPLANATION');
    const texts = result.plan.claims.map((c) => c.text);
    assert.ok(texts.some((t) => /Workforce & Payroll|Trucks, Drivers & Deliveries|Fuel & Machine Monitoring|Sales & Customer Records|Land-Owner Royalties/.test(t)));
    assert.ok(texts.every((t) => /Benefit:/.test(t)));
});

test('QuarryOS SW (cold-start, single-turn): "kwa undani" surfaces real, native Kiswahili benefitAreas claims', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'Eleza kwa undani QuarryOS inasaidiaje?', requestedLanguage: 'sw' });
    assert.equal(result.success, true);
    assert.equal(result.plan.entity.value, 'QuarryOS');
    assert.equal(result.plan.detailLevel, 'DEEP_EXPLANATION');
    assert.equal(result.plan.language, 'sw');
    const texts = result.plan.claims.map((c) => c.text);
    assert.ok(texts.some((t) => /Wafanyakazi na Mishahara|Mrabaha wa Wamiliki wa Ardhi/.test(t)));
    assert.ok(texts.every((t) => /Faida:/.test(t)));
});

test('REGRESSION: "How does QuarryOS help?" (no marker) keeps the existing, unchanged, flat humanBenefits behavior', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'How does QuarryOS help?' });
    assert.equal(result.success, true);
    assert.equal(result.plan.detailLevel, 'STRUCTURED_EXPLANATION');
    const joined = result.plan.claims.map((c) => c.text).join(' ');
    assert.doesNotMatch(joined, /Benefit:/, 'the default (no depth marker) path must stay byte-identical to pre-Phase-8 behavior');
});

test('CROSS-APPLICATION ISOLATION (planner level): QuarryOS in detail never surfaces ShopOS/MpesaOS/InterestOS claim text', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'How does QuarryOS help a quarry in detail?' });
    const joined = result.plan.claims.map((c) => c.text).join(' ');
    assert.doesNotMatch(joined, /barcode|SKU|commission|tariff|Teaching CozyOS/i);
});

test('SECURITY: no internal object/field/file names ever appear inside a QuarryOS benefitAreas claim text', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'How does QuarryOS help a quarry in detail?' });
    const joined = result.plan.claims.map((c) => c.text).join(' ');
    assert.doesNotMatch(joined, /\.(?:js|html|css|json)\b|conversationState|CozyKnowledge|benefitAreas|quarry-index|window\.CozyOS/i);
});
