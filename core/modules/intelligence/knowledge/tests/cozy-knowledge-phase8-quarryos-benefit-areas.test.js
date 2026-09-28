'use strict';

/**
 * core/modules/intelligence/knowledge/tests/cozy-knowledge-phase8-quarryos-benefit-areas.test.js
 *
 * Phase 8 (QuarryOS Full Application Integration) — focused unit tests
 * for the QuarryOS benefitAreas/benefitAreasSw addition, closing the
 * evidence gap Phase 7 explicitly left open (only 1 thin topic existed
 * then; QuarryOS's registry record already had 14 currentVerified
 * Capabilities items and 6 whoBenefits groups, enough for 5 real,
 * non-overlapping topics once actually organized — see this file's own
 * disclosure comment in cozy-knowledge-registry.js for what was
 * deliberately excluded).
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

test('QuarryOS: getApplicationBenefitAreasFact("QuarryOS") returns 5 real, verified EN topics', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('QuarryOS');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.equal(fact.areas.length, 5);
    assert.ok(fact.areas.some((a) => /Workforce & Payroll/.test(a)));
    assert.ok(fact.areas.some((a) => /Trucks, Drivers & Deliveries/.test(a)));
    assert.ok(fact.areas.some((a) => /Fuel & Machine Monitoring/.test(a)));
    assert.ok(fact.areas.some((a) => /Sales & Customer Records/.test(a)));
    assert.ok(fact.areas.some((a) => /Land-Owner Royalties/.test(a)));
    assert.ok(fact.areas.every((a) => /Benefit:/.test(a)));
});

test('QuarryOS: never claims company setup, weighbridge, a distinct stone-product catalog, or a standalone loading action — the disclosed, real visionCapabilities-only items for this application', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('QuarryOS');
    const joined = fact.areas.join(' ');
    assert.doesNotMatch(joined, /weighbridge|stone-product catalog|company setup|loading bay/i);
});

test('QuarryOS: Kiswahili benefitAreas returns 5 real topics, native (not machine-translated at call time)', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('QuarryOS', 'sw');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.equal(fact.areas.length, 5);
    assert.ok(fact.areas.some((a) => /Wafanyakazi na Mishahara/.test(a)));
    assert.ok(fact.areas.some((a) => /Mrabaha wa Wamiliki wa Ardhi/.test(a)));
    assert.ok(fact.areas.every((a) => /Faida:/.test(a)));
});

test('CROSS-APPLICATION ISOLATION: QuarryOS benefitAreas never contain ShopOS/MpesaOS/InterestOS/Media-Intelligence-specific vocabulary, and vice versa', () => {
    const { window: win } = freshFullStack();
    const quarry = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('QuarryOS').areas.join(' ');
    const shop = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('ShopOS').areas.join(' ');
    const mpesa = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('MpesaOS').areas.join(' ');
    const interest = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('InterestOS').areas.join(' ');
    assert.doesNotMatch(quarry, /barcode|SKU|commission|tariff|Teaching CozyOS/i);
    assert.doesNotMatch(shop, /royalty|land-owner|crusher|dispatch/i);
    assert.doesNotMatch(mpesa, /royalty|land-owner|crusher|dispatch/i);
    assert.doesNotMatch(interest, /royalty|land-owner|crusher|dispatch/i);
});
