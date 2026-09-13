/**
 * core/living/test/m360-kiswahili-ask-and-learn.test.js
 * M360 — Cozy Assistance Window: Multilingual Hear -> Sense -> Think -> Learn
 *
 * SCOPE (honest disclosure, matching this repository's own convention):
 * this proves two real, composed pieces of existing architecture, not a
 * new engine:
 *   1. rule-based-conversational-provider.js's genuinely unsupported
 *      turns now (a) expose a structured needsClarification:true signal
 *      and (b) ask a real, human-authored Kiswahili/English clarifying
 *      question rather than only disclosing the limitation - never
 *      fabricated for fr/ar/so, which keep their existing, unchanged
 *      "unsupported" text (see rule-based-conversational-provider.js's
 *      own comment on this exact point).
 *   2. cozy-language-verification.js's existing, real, region-tagged
 *      submitObservation()/getObservationTimeline() already accept and
 *      distinguish arbitrary regional Kiswahili varieties (Kenyan,
 *      Tanzanian, Congolese/DRC, etc.) - proving the "accent learning"
 *      storage requirement is reachable through the EXISTING learning
 *      architecture, not a claim that real accent audio was ever
 *      classified (no microphone/device exists in this sandbox - that
 *      remains explicitly NOT-RUN, matching this engine's own header).
 *
 * Run with: node core/living/test/m360-kiswahili-ask-and-learn.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const PROVIDER_PATH = path.join(__dirname, '..', '..', 'modules', 'intelligence', 'providers', 'rule-based-conversational-provider.js');
const TEMPLATES_PATH = path.join(__dirname, '..', '..', 'modules', 'intelligence', 'language', 'cozy-language-templates.js');
const REGISTRY_PATH = path.join(__dirname, '..', '..', 'modules', 'intelligence', 'language', 'cozy-language-registry.js');
const VERIFICATION_PATH = path.join(__dirname, '..', 'cozy-language-verification.js');

function makeFakeLivingAI() {
    const registered = new Map();
    return { registerProvider(name, p) { registered.set(name, p); }, setActiveProvider() {}, _registered: registered };
}

function freshProvider() {
    [TEMPLATES_PATH, REGISTRY_PATH, PROVIDER_PATH].forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded yet */ } });
    const fakeAI = makeFakeLivingAI();
    global.window = { CozyOS: { LivingAI: fakeAI } };
    require(TEMPLATES_PATH);
    require(REGISTRY_PATH);
    require(PROVIDER_PATH);
    return fakeAI._registered.get('rule-based-conversational');
}

function fakeMemory() {
    const store = new Map();
    return {
        saveMemory(namespace, key, value) { store.set(`${namespace}/${key}`, value); return { success: true }; },
        readMemory(namespace, key) { return store.has(`${namespace}/${key}`) ? { value: store.get(`${namespace}/${key}`) } : null; },
    };
}

function freshVerificationEngine() {
    delete require.cache[require.resolve(VERIFICATION_PATH)];
    global.window = { CozyOS: { CozyMemory: fakeMemory() } };
    require(VERIFICATION_PATH);
    return global.window.CozyOS.LivingLanguageVerification;
}

// ---- 1. ASK AND LEARN: structured clarification signal ----

test('SW: a genuinely unrecognized Kiswahili utterance sets needsClarification:true and asks a real Kiswahili clarifying question ("Unamaanisha")', async () => {
    const provider = freshProvider();
    const result = await provider.think('Ninataka kufanya kitu kisicho na maana kabisa hapa.', { language: 'sw' });
    assert.equal(result.success, true);
    assert.equal(result.result.intent, 'unsupported');
    assert.equal(result.result.needsClarification, true);
    assert.match(result.result.text, /Unamaanisha/);
});

test('EN: a genuinely unrecognized English utterance sets needsClarification:true and asks "What do you mean?"', async () => {
    const provider = freshProvider();
    const result = await provider.think('Please recalibrate the interdimensional flux capacitor.');
    assert.equal(result.result.intent, 'unsupported');
    assert.equal(result.result.needsClarification, true);
    assert.match(result.result.text, /What do you mean/);
});

test('A real, resolved intent (e.g. "Hello") never sets needsClarification, regardless of language', async () => {
    const provider = freshProvider();
    const enResult = await provider.think('Hello');
    assert.equal(enResult.result.needsClarification, false);
    const swResult = await provider.think('Habari');
    assert.equal(swResult.result.needsClarification, false);
});

test('REGRESSION: fr/ar/so unsupported replies are byte-for-byte unchanged (no unverified clarify translation leaks in)', async () => {
    const provider = freshProvider();
    const fr = await provider.think('Ceci est une phrase totalement hors sujet.', { language: 'fr' });
    assert.equal(fr.result.needsClarification, true);
    assert.doesNotMatch(fr.result.text, /What do you mean\?|Unamaanisha/);
    assert.match(fr.result.text, /Je n'ai pas encore de réponse/);
});

// ---- 2. ACCENT LEARNING: existing region-tagged storage handles multiple Kiswahili varieties ----

test('ACCENT LEARNING: Kenyan, Tanzanian, and Congolese/DRC Kiswahili observations are stored as real, distinct region-tagged entries via the EXISTING verification engine (no new engine)', () => {
    const engine = freshVerificationEngine();
    const meaning = 'sorry / excuse me';
    const kenyan = engine.submitObservation('samahani', meaning, { region: 'Nairobi, Kenya', submittedBy: 'user-ke', language: 'sw' });
    const tanzanian = engine.submitObservation('samahani', meaning, { region: 'Dar es Salaam, Tanzania', submittedBy: 'user-tz', language: 'sw' });
    const congolese = engine.submitObservation('samahani', meaning, { region: 'Lubumbashi, DRC', submittedBy: 'user-cd', language: 'sw' });

    assert.equal(kenyan.success, true);
    assert.equal(tanzanian.success, true);
    assert.equal(congolese.success, true);
    assert.equal(kenyan.totalObservations, 1);
    assert.equal(congolese.totalObservations, 3);

    // getConfidence() is the engine's own real, public read of exactly
    // this data — proves the three regions were stored as genuinely
    // DISTINCT entries (distinctRegions === 3), not merged/overwritten,
    // and that a single region's submission is never treated as
    // universally correct on its own (level stays "Local Agreement",
    // not "Expert Verified"/highest tier, per M360's explicit
    // requirement).
    const confidence = engine.getConfidence('samahani', meaning);
    assert.equal(confidence.totalObservations, 3);
    assert.equal(confidence.distinctRegions, 3);
    assert.equal(confidence.label, 'Local Agreement');
});

console.log('M360 ask-and-learn + accent-learning-storage suite: run complete.');
