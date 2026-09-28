'use strict';

/**
 * core/modules/intelligence/knowledge/tests/cozy-knowledge-spiritualos-benefit-areas.test.js
 *
 * SPIRITUALOS HUMAN-BENEFIT PHASE — focused unit tests for the new
 * "spiritualos" APPLICATION_HUMAN_PURPOSE_DATA record and its
 * benefitAreas/benefitAreasSw fields, following the exact same template
 * cozy-knowledge-phase8-quarryos-benefit-areas.test.js already
 * established for QuarryOS. Unlike QuarryOS, SpiritualOS is honestly
 * NOT a registerApplication()/ServiceRegistry entry — see this record's
 * own visionSourceNote — so this suite also asserts that fact is
 * disclosed rather than silently omitted.
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

test('SpiritualOS: getApplicationBenefitAreasFact("SpiritualOS") returns 4 real, verified EN topics, each with a Benefit:', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('SpiritualOS');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.equal(fact.areas.length, 4);
    assert.ok(fact.areas.some((a) => /Personal Prayer/.test(a)));
    assert.ok(fact.areas.some((a) => /Scripture Reference Lookup/.test(a)));
    assert.ok(fact.areas.some((a) => /Daily Devotional Structure/.test(a)));
    assert.ok(fact.areas.some((a) => /Worship Overview/.test(a)));
    assert.ok(fact.areas.every((a) => /Benefit:/.test(a)));
});

test('SpiritualOS: Kiswahili benefitAreas returns 4 real, native topics, each with a Faida:', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('SpiritualOS', 'sw');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.equal(fact.areas.length, 4);
    assert.ok(fact.areas.some((a) => /Maombi ya Kibinafsi/.test(a)));
    assert.ok(fact.areas.some((a) => /Utafutaji wa Andiko la Biblia/.test(a)));
    assert.ok(fact.areas.every((a) => /Faida:/.test(a)));
});

test('HONEST GAP: SpiritualOS benefitAreas never fabricate a leadership/pastoral-care topic or any worship-music/beat-generation capability', () => {
    const { window: win } = freshFullStack();
    const en = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('SpiritualOS').areas.join(' ');
    const sw = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('SpiritualOS', 'sw').areas.join(' ');
    assert.doesNotMatch(en, /leader|pastoral|music|beat|audio generation/i);
    assert.doesNotMatch(sw, /kiongozi|uongozi|kichungaji|muziki|beat/i);
});

test('HONEST GAP: visionCapabilities discloses verse text/music-composition/leadership/cross-turn continuity as NOT yet real, never folded into currentVerifiedCapabilities', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('SpiritualOS');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.ok(fact.purpose.visionCapabilities.some((v) => /licensed Bible translation/i.test(v)));
    assert.ok(fact.purpose.visionCapabilities.some((v) => /gospel-music composition|audio\/beat generation/i.test(v)));
    assert.doesNotMatch(fact.purpose.currentVerifiedCapabilities.join(' '), /gospel-music|beat generation|leadership-specific/i);
});

test('DISCLOSED, NOT FABRICATED: SpiritualOS has no registerApplication()/ServiceRegistry entry, unlike QuarryOS/ChurchOS — the record says so honestly', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('SpiritualOS');
    assert.match(fact.purpose.visionSourceNote, /no registerApplication\(\)\/ServiceRegistry entry/);
});

test('CROSS-APPLICATION ISOLATION: SpiritualOS benefitAreas never contain QuarryOS/ShopOS/MpesaOS/InterestOS-specific vocabulary, and vice versa', () => {
    const { window: win } = freshFullStack();
    const spiritual = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('SpiritualOS').areas.join(' ');
    const quarry = win.CozyOS.CozyKnowledge.getApplicationBenefitAreasFact('QuarryOS').areas.join(' ');
    assert.doesNotMatch(spiritual, /royalty|land-owner|crusher|dispatch|barcode|SKU|commission|tariff/i);
    assert.doesNotMatch(quarry, /prayer|scripture|devotional|worship/i);
});
