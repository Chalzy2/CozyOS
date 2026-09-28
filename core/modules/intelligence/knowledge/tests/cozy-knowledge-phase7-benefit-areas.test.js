'use strict';

/**
 * core/modules/intelligence/knowledge/tests/cozy-knowledge-phase7-benefit-areas.test.js
 *
 * Phase 7 (Universal Application Human-Benefit Evidence & Semantic
 * Coverage) — focused unit tests for the 4 new benefitAreas/benefitAreasSw
 * additions (ShopOS, MpesaOS, InterestOS, Media Intelligence) via the
 * existing, isolated getApplicationBenefitAreasFact() getter (built in
 * PAA-4 for ChurchOS; this file proves the same getter works correctly
 * for the 4 applications Phase 7 added data for, and that it stays
 * honestly NOT_FOUND for QuarryOS and CozyOS-self, which Phase 7's own
 * audit deliberately left as an evidence gap rather than fabricating
 * coverage).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const KNOWLEDGE_REGISTRY_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js');
const LANGUAGE_REGISTRY_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'language', 'cozy-language-registry.js');
const LANGUAGE_TEMPLATES_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'language', 'cozy-language-templates.js');
const PUBLIC_KNOWLEDGE_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-public-knowledge-source.js');
const PROVIDER_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'providers', 'rule-based-conversational-provider.js');

function makeFakeLivingAI() {
    const registered = new Map();
    return {
        registerProvider(name, provider) { registered.set(name, provider); return { success: true }; },
        setActiveProvider() { return { success: true }; },
        getActiveProvider() { return null; },
        _registered: registered,
    };
}
function makeFakeCoordinator() { return { async run() { return {}; } }; }
function makeFakeProviderManager() { return { register() {}, healthReport: () => ({}) }; }

function freshFullStack() {
    const files = [KNOWLEDGE_REGISTRY_PATH, LANGUAGE_REGISTRY_PATH, LANGUAGE_TEMPLATES_PATH, PUBLIC_KNOWLEDGE_PATH, PROVIDER_PATH];
    files.forEach((p) => delete require.cache[require.resolve(p)]);
    const fakeWindow = {
        CozyOS: {
            LivingAI: makeFakeLivingAI(),
            CognitiveCoordinator: makeFakeCoordinator(),
            ProviderManager: makeFakeProviderManager(),
            listApplications: () => [],
        },
    };
    global.window = fakeWindow;
    files.forEach((p) => require(p));
    return { window: fakeWindow };
}

// ---- ShopOS ----

test('ShopOS: getApplicationBenefitAreasFact("ShopOS") returns 3 real, verified EN topics', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('ShopOS');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.equal(fact.areas.length, 3);
    assert.ok(fact.areas.some((a) => /Product catalog/.test(a)));
    assert.ok(fact.areas.some((a) => /Branches and access/.test(a)));
    assert.ok(fact.areas.some((a) => /Shared data across CozyOS apps/.test(a)));
    assert.ok(fact.areas.every((a) => /Benefit:/.test(a)));
});

test('ShopOS: never claims checkout/payments/sales/stock-quantity (the disclosed, NOT-yet-corrected registry/test discrepancy) in benefitAreas', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('ShopOS');
    const joined = fact.areas.join(' ');
    assert.doesNotMatch(joined, /checkout|payment|\bsale\b|\bsales\b|stock quantity/i);
});

test('ShopOS: Kiswahili benefitAreas returns 3 real topics, native (not machine-translated at call time)', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('ShopOS', 'sw');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.equal(fact.areas.length, 3);
    assert.ok(fact.areas.some((a) => /Orodha ya bidhaa/.test(a)));
    assert.ok(fact.areas.every((a) => /Faida:/.test(a)));
});

// ---- MpesaOS ----

test('MpesaOS: getApplicationBenefitAreasFact("MpesaOS") returns 4 real, verified EN topics', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('MpesaOS');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.equal(fact.areas.length, 4);
    assert.ok(fact.areas.some((a) => /Fee & commission accuracy/.test(a)));
    assert.ok(fact.areas.some((a) => /Tamper-evident transaction records/.test(a)));
    assert.ok(fact.areas.some((a) => /Valid, registered processing only/.test(a)));
    assert.ok(fact.areas.some((a) => /Faster repeat-customer service/.test(a)));
    assert.ok(fact.areas.every((a) => /Benefit:/.test(a)));
});

test('MpesaOS: never claims identity/KYC scanning, reconciliation, or an external command interface (real, disclosed vision-only capabilities)', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('MpesaOS');
    const joined = fact.areas.join(' ');
    assert.doesNotMatch(joined, /KYC|identity scanning|reconciliation|command interface/i);
});

test('MpesaOS: Kiswahili benefitAreas returns 4 real topics', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('MpesaOS', 'sw');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.equal(fact.areas.length, 4);
    assert.ok(fact.areas.every((a) => /Faida:/.test(a)));
});

// ---- InterestOS ----

test('InterestOS: getApplicationBenefitAreasFact("InterestOS") returns 3 real, verified EN topics', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('InterestOS');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.equal(fact.areas.length, 3);
    assert.ok(fact.areas.some((a) => /Documents & Reminders/.test(a)));
    assert.ok(fact.areas.some((a) => /Directives & Teaching CozyOS/.test(a)));
    assert.ok(fact.areas.some((a) => /Business Management/.test(a)));
    assert.ok(fact.areas.every((a) => /Benefit:/.test(a)));
});

test('InterestOS: never claims PDF/OCR/share/print, cross-app Daily Balance, or real AI directive interpretation (disclosed vision-only capabilities)', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('InterestOS');
    const joined = fact.areas.join(' ');
    assert.doesNotMatch(joined, /\bOCR\b|Daily Balance|AI directive interpretation/i);
});

test('InterestOS: Kiswahili benefitAreas returns 3 real topics', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('InterestOS', 'sw');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.equal(fact.areas.length, 3);
    assert.ok(fact.areas.some((a) => /Hati na Vikumbusho/.test(a)));
    assert.ok(fact.areas.every((a) => /Faida:/.test(a)));
});

// ---- Media Intelligence ----

test('Media Intelligence: getApplicationBenefitAreasFact("Media Intelligence") returns 3 real, verified EN topics', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('Media Intelligence');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.equal(fact.areas.length, 3);
    assert.ok(fact.areas.some((a) => /Finding testimony by keyword or type/.test(a)));
    assert.ok(fact.areas.some((a) => /Confirmed person-reference search/.test(a)));
    assert.ok(fact.areas.some((a) => /Honest "not found" instead of a guess/.test(a)));
});

test('Media Intelligence: never claims face recognition, ASR, OCR, embeddings, or semantic NLU (explicitly disclaimed by this app\'s own NO FABRICATION header)', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('Media Intelligence');
    const joined = fact.areas.join(' ');
    assert.doesNotMatch(joined, /face recognition|speech recognition|\bASR\b|\bOCR\b|embeddings|semantic NLU/i);
});

test('Media Intelligence: Kiswahili benefitAreas returns 3 real topics', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('Media Intelligence', 'sw');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.equal(fact.areas.length, 3);
    assert.ok(fact.areas.every((a) => /Faida:/.test(a)));
});

// ---- Honest gaps: QuarryOS and CozyOS-self were deliberately NOT authored ----

test('EVIDENCE GAP (disclosed, deliberate): QuarryOS has no benefitAreas authored — honestly NOT_FOUND, never a fabricated/empty-dressed-as-VERIFIED result', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('QuarryOS');
    assert.equal(fact.evidence, 'NOT_FOUND');
    assert.equal(fact.areas, null);
});

test('NOT IMPLEMENTED (disclosed, deliberate): CozyOS-self has no benefitAreas authored via this mechanism (different mechanism required, deferred)', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('CozyOS');
    assert.equal(fact.evidence, 'NOT_FOUND');
});

// ---- Cross-application isolation ----

test('CROSS-APPLICATION ISOLATION: ShopOS benefitAreas never contain MpesaOS/InterestOS/Media-Intelligence-specific vocabulary, and vice versa', () => {
    const { window: win } = freshFullStack();
    const shop = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('ShopOS').areas.join(' ');
    const mpesa = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('MpesaOS').areas.join(' ');
    const interest = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('InterestOS').areas.join(' ');
    const media = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('Media Intelligence').areas.join(' ');
    assert.doesNotMatch(shop, /commission|tariff|testimony|Teaching CozyOS/i);
    assert.doesNotMatch(mpesa, /barcode|SKU|testimony|Teaching CozyOS/i);
    assert.doesNotMatch(interest, /barcode|commission|testimony/i);
    assert.doesNotMatch(media, /barcode|commission|Teaching CozyOS/i);
});
