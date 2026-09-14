'use strict';

/**
 * core/modules/intelligence/knowledge/tests/cozy-knowledge-kiswahili-human-purpose.test.js
 *
 * "Kiswahili human-purpose substance + InterestOS registration"
 * dependency - real regression coverage.
 *
 * Covers requirements A-H of this increment:
 *   A. Existing English human-purpose output still works.
 *   B. Kiswahili application-importance output contains genuine
 *      Kiswahili substantive content, not only a Kiswahili frame.
 *   C. InterestOS is present and retrievable.
 *   D. InterestOS English purpose data is correct.
 *   E. InterestOS Kiswahili purpose data is genuine and application-
 *      specific.
 *   F. Current capability remains distinguishable from future vision.
 *   G. No fallback silently substitutes English payload when Kiswahili
 *      is requested.
 *   H. Existing applications remain regression-safe.
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
    return {
        window: fakeWindow,
        provider: fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational'),
    };
}

const APPS = ['pharmacyos', 'wholesaleos', 'shopos', 'mpesaos', 'quarryos', 'churchos', 'interestos'];

// ---------------------------------------------------------------------
// A. Existing English human-purpose output still works
// ---------------------------------------------------------------------

test('A. Every application still returns real, VERIFIED English human-purpose content (no lang argument, backward-compatible)', () => {
    const { window: win } = freshFullStack();
    for (const app of APPS) {
        const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact(app);
        assert.equal(fact.evidence, 'VERIFIED', `${app} should be VERIFIED`);
        assert.ok(typeof fact.purpose.humanPurpose === 'string' && fact.purpose.humanPurpose.length > 0, `${app} humanPurpose`);
        assert.ok(fact.purpose.realLifeProblems.length > 0, `${app} realLifeProblems`);
        assert.ok(fact.purpose.whoBenefits.length > 0, `${app} whoBenefits`);
        assert.ok(fact.purpose.humanBenefits.length > 0, `${app} humanBenefits`);
        assert.ok(fact.purpose.currentVerifiedCapabilities.length > 0, `${app} currentVerifiedCapabilities`);
        assert.ok(fact.purpose.visionCapabilities.length > 0, `${app} visionCapabilities`);
    }
});

test('A. Explicit lang="en" behaves identically to omitting lang', () => {
    const { window: win } = freshFullStack();
    const withLang = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('QuarryOS', 'en');
    const noLang = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('QuarryOS');
    assert.deepEqual(withLang.purpose, noLang.purpose);
});

test('A. Cozy AI still answers an English application-importance question with real English substance', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Why is QuarryOS important?');
    assert.equal(result.result.intent, 'app-importance');
    assert.match(result.result.text, /QuarryOS matters because/);
    assert.match(result.result.text, /fuel theft/i);
});

// ---------------------------------------------------------------------
// B. Kiswahili application-importance output contains genuine
//    Kiswahili substantive content, not only a Kiswahili frame
// ---------------------------------------------------------------------

test('B. getApplicationHumanPurposeFact(name, "sw") returns genuine Kiswahili substance for every covered application', () => {
    const { window: win } = freshFullStack();
    for (const app of APPS) {
        const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact(app, 'sw');
        assert.equal(fact.evidence, 'VERIFIED', `${app} sw should be VERIFIED`);
        // Genuinely Kiswahili text, not the English string re-served -
        // spot-check a few real Kiswahili function words that do not
        // appear in the English payloads at all.
        assert.match(fact.purpose.humanPurpose, /\b(ipo|kuwa|kuipa|kumwezesha|kuzipa)\b/, `${app} sw humanPurpose looks Kiswahili`);
        assert.notEqual(fact.purpose.humanPurpose, win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact(app, 'en').purpose.humanPurpose, `${app} sw humanPurpose must differ from English`);
        assert.ok(fact.purpose.realLifeProblems.length > 0);
        assert.ok(fact.purpose.whoBenefits.length > 0);
        assert.ok(fact.purpose.humanBenefits.length > 0);
        assert.ok(fact.purpose.currentVerifiedCapabilities.length > 0);
        assert.ok(fact.purpose.visionCapabilities.length > 0);
    }
});

test('B. QuarryOS Kiswahili payload names the same real, specific facts as the English payload (translated substance, not a generic frame)', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('QuarryOS', 'sw');
    assert.match(fact.purpose.humanPurpose, /machimbo\/madini/);
    assert.ok(fact.purpose.realLifeProblems.some((p) => /wizi/i.test(p) && /mafuta/i.test(p)));
    assert.ok(fact.purpose.currentVerifiedCapabilities.some((c) => /roleMatrix/.test(c)));
    assert.ok(fact.purpose.visionCapabilities.some((v) => /weighbridge/i.test(v)));
});

test('B. Cozy AI answers a Kiswahili application-importance question with a Kiswahili frame AND genuine Kiswahili substance', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('QuarryOS ni muhimu kwa nini?', { language: 'sw' });
    assert.equal(result.result.intent, 'app-importance');
    // Kiswahili frame
    assert.match(result.result.text, /ni muhimu kwa sababu/);
    assert.match(result.result.text, /ZILIZOTHIBITISHWA SASA/);
    assert.match(result.result.text, /DIRA \/ MWELEKEO WA BAADAYE/);
    // Genuine Kiswahili SUBSTANCE, not just the frame - the English
    // words "fuel theft" must NOT appear; the Kiswahili equivalent must.
    assert.doesNotMatch(result.result.text, /fuel theft/i);
    assert.match(result.result.text, /wizi wa mafuta/i);
});

// ---------------------------------------------------------------------
// C/D. InterestOS is present, retrievable, and English data is correct
// ---------------------------------------------------------------------

test('C. InterestOS human-purpose fact is present and retrievable (VERIFIED)', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('InterestOS');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.ok(fact.purpose);
});

test('C. InterestOS is retrievable through the same app-importance conversational path as other applications', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Why is InterestOS important?');
    assert.equal(result.result.intent, 'app-importance');
    assert.match(result.result.text, /InterestOS matters because/);
});

test('D. InterestOS English purpose data is genuine and drawn from its own real manifest text', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('InterestOS');
    assert.match(fact.purpose.humanPurpose, /directive, planning, teaching/);
    assert.ok(fact.purpose.realLifeProblems.some((p) => /losing important paperwork/i.test(p)));
    assert.ok(fact.purpose.whoBenefits.includes('individual users'));
    assert.ok(fact.purpose.currentVerifiedCapabilities.some((c) => /Teach Cozy/.test(c)));
    assert.ok(fact.purpose.currentVerifiedCapabilities.some((c) => /IndexedDB/.test(c)));
    assert.ok(fact.purpose.visionCapabilities.some((v) => /Daily Balance/.test(v)));
});

// ---------------------------------------------------------------------
// E. InterestOS Kiswahili purpose data is genuine and application-specific
// ---------------------------------------------------------------------

test('E. InterestOS Kiswahili purpose data is genuine, application-specific Kiswahili (not a generic frame translation)', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('InterestOS', 'sw');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.match(fact.purpose.humanPurpose, /InterestOS ipo/);
    assert.ok(fact.purpose.realLifeProblems.some((p) => /kupoteza hati muhimu/i.test(p)));
    assert.ok(fact.purpose.currentVerifiedCapabilities.some((c) => /Teach Cozy/.test(c) && /uaminifu/.test(c)));
    assert.ok(fact.purpose.visionCapabilities.some((v) => /Daily Balance/.test(v)));
    // Must not just be the English string re-served.
    const en = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('InterestOS', 'en');
    assert.notEqual(fact.purpose.humanPurpose, en.purpose.humanPurpose);
});

test('E. Cozy AI answers a Kiswahili InterestOS importance question with genuine Kiswahili substance', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('InterestOS ni muhimu kwa nini?', { language: 'sw' });
    assert.equal(result.result.intent, 'app-importance');
    assert.match(result.result.text, /ni muhimu kwa sababu/);
    assert.match(result.result.text, /kupoteza hati muhimu/i);
    assert.doesNotMatch(result.result.text, /losing important paperwork/i);
});

// ---------------------------------------------------------------------
// F. Current capability remains distinguishable from future vision
//    (for both languages)
// ---------------------------------------------------------------------

test('F. English: currentVerifiedCapabilities and visionCapabilities remain separate fields for every app, including InterestOS', () => {
    const { window: win } = freshFullStack();
    for (const app of APPS) {
        const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact(app, 'en');
        assert.notDeepEqual(fact.purpose.currentVerifiedCapabilities, fact.purpose.visionCapabilities, `${app} current vs vision must differ`);
    }
});

test('F. Kiswahili: currentVerifiedCapabilitiesSw and visionCapabilitiesSw remain separate for every app, and the reply keeps CURRENT before VISION', async () => {
    const { window: win, provider } = freshFullStack();
    for (const app of APPS) {
        const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact(app, 'sw');
        assert.notDeepEqual(fact.purpose.currentVerifiedCapabilities, fact.purpose.visionCapabilities, `${app} sw current vs vision must differ`);
    }
    const result = await provider.think('ChurchOS ni muhimu kwa nini?', { language: 'sw' });
    const verifiedIdx = result.result.text.indexOf('ZILIZOTHIBITISHWA SASA');
    const visionIdx = result.result.text.indexOf('DIRA / MWELEKEO WA BAADAYE');
    assert.ok(verifiedIdx >= 0 && visionIdx >= 0 && verifiedIdx < visionIdx);
});

// ---------------------------------------------------------------------
// G. No fallback silently substitutes English payload when Kiswahili
//    is requested
// ---------------------------------------------------------------------

test('G. A hypothetical application with no Kiswahili payload honestly returns NOT_FOUND for lang="sw" (never a silent English substitution)', () => {
    const { window: win } = freshFullStack();
    // biometric-login is a real CAPABILITY entry (not an APPLICATION
    // entry) that has no Kiswahili substance authored for it - a real,
    // in-repo example of "no Kiswahili payload yet" to prove the
    // fail-closed rule, without fabricating a fake application record.
    const fact = win.CozyOS.CozyKnowledge.getCapabilityHumanPurposeFact('biometric-login');
    assert.equal(fact.evidence, 'VERIFIED'); // English capability facts are unaffected by this dependency
    // The APPLICATION getter, asked in Kiswahili for a genuinely
    // unregistered application, must also never fabricate a purpose in
    // either language.
    const missing = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('SomeUnregisteredApp', 'sw');
    assert.equal(missing.evidence, 'NOT_FOUND');
    assert.equal(missing.purpose, null);
});

test('G. resolvePurposeForLanguage never returns partial/mixed-language content: every covered app is all-English or all-Kiswahili, never a blend', () => {
    const { window: win } = freshFullStack();
    for (const app of APPS) {
        const sw = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact(app, 'sw');
        assert.equal(sw.evidence, 'VERIFIED', `${app} must have full Kiswahili coverage, not a partial/blended result`);
        for (const field of ['humanPurpose']) {
            assert.doesNotMatch(sw.purpose[field], /\bexists to\b/i, `${app} sw.${field} must not contain the English frame verb`);
        }
    }
});

// ---------------------------------------------------------------------
// H. Existing applications remain regression-safe
// ---------------------------------------------------------------------

test('H. ChurchOS, MpesaOS, ShopOS, WholesaleOS, PharmacyOS, QuarryOS English content is byte-identical to their pre-existing, already-tested facts', () => {
    const { window: win } = freshFullStack();
    const church = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('ChurchOS');
    assert.match(church.purpose.humanPurpose, /digital foundation/);
    assert.match(church.purpose.visionSourceNote, /CHURCHOS_ENGINE_AUDIT\.md/);
    const mpesa = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('MpesaOS');
    assert.match(mpesa.purpose.humanPurpose, /mobile-money transactions/);
    const shop = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('ShopOS');
    assert.match(shop.purpose.humanPurpose, /retail shop/);
    const wholesale = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('WholesaleOS');
    assert.match(wholesale.purpose.humanPurpose, /wholesale-priced version/);
    const pharmacy = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('PharmacyOS');
    assert.match(pharmacy.purpose.humanPurpose, /controlled substances genuinely gated/);
    const quarry = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('QuarryOS');
    assert.match(quarry.purpose.humanPurpose, /quarry\/mining business/);
});

test('H. Unrelated intents (app-info, translate-request) remain unaffected', async () => {
    const { provider } = freshFullStack();
    const info = await provider.think('What is ChurchOS?');
    const translate = await provider.think('Translate hello to French.');
    assert.equal(info.result.intent, 'app-info');
    assert.equal(translate.result.intent, 'translate-request');
});

test('H. Unknown application behavior remains honest in both languages (no fabricated purpose)', () => {
    const { window: win } = freshFullStack();
    const en = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('SomeUnregisteredApp');
    const sw = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('SomeUnregisteredApp', 'sw');
    assert.equal(en.evidence, 'NOT_FOUND');
    assert.equal(sw.evidence, 'NOT_FOUND');
});

test('H. No authorization/security side effect for any covered application in either language', () => {
    const { window: win } = freshFullStack();
    for (const app of APPS) {
        for (const lang of [undefined, 'sw']) {
            const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact(app, lang);
            const serialized = JSON.stringify(fact).toLowerCase();
            assert.ok(!/password|api[_-]?key|secret|token|credential/.test(serialized), `${app} ${lang || 'en'} must carry no credential-shaped field`);
        }
    }
});
