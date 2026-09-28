'use strict';

/**
 * core/modules/knowledge/tests/cozyos-identity-faq-router-public-story-depth.test.js
 *
 * PUBLIC-STORY-DEPTH milestone — the 8 required tests from the product-
 * owner directive, run against the REAL, live integration chain:
 * DeveloperIdentity (developer-profile.js + project-history.js +
 * african-knowledge-initiative.js + cozyai-identity.js, unmodified) +
 * CozyPublicKnowledge (cozy-public-knowledge-source.js, this milestone's
 * new getPublicOriginStoryFact()) + CozyIdentityFAQRouter (this
 * milestone's depth-aware COZYOS_ORIGIN/COZYOS_WHY_CREATED handling).
 *
 * This is the router cozy-ai.js's ask()/answer() actually calls FIRST
 * (confirmed by direct source read before writing this feature) — so
 * these tests exercise the real, live answer path, not a parallel one.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const IDENTITY_DIR = path.join(__dirname, '..', '..', '..', 'identity');
const PROFILE_PATH = path.join(IDENTITY_DIR, 'developer-profile.js');
const PROJECT_HISTORY_PATH = path.join(IDENTITY_DIR, 'project-history.js');
const AFRICAN_KNOWLEDGE_PATH = path.join(IDENTITY_DIR, 'african-knowledge-initiative.js');
const COZYAI_IDENTITY_PATH = path.join(IDENTITY_DIR, 'cozyai-identity.js');
const PUBLIC_KNOWLEDGE_PATH = path.join(__dirname, '..', '..', 'intelligence', 'knowledge', 'cozy-public-knowledge-source.js');
const ROUTER_PATH = path.join(__dirname, '..', 'cozyos-identity-faq-router.js');

function freshRouter({ withPublicKnowledge = true } = {}) {
    [PROFILE_PATH, PROJECT_HISTORY_PATH, AFRICAN_KNOWLEDGE_PATH, COZYAI_IDENTITY_PATH, PUBLIC_KNOWLEDGE_PATH, ROUTER_PATH]
        .forEach((p) => delete require.cache[require.resolve(p)]);
    global.window = { CozyOS: {} };
    require(PROFILE_PATH);
    require(PROJECT_HISTORY_PATH);
    require(AFRICAN_KNOWLEDGE_PATH);
    require(COZYAI_IDENTITY_PATH); // assembles the real, frozen window.CozyOS.DeveloperIdentity
    if (withPublicKnowledge) require(PUBLIC_KNOWLEDGE_PATH);
    require(ROUTER_PATH);
    return global.window.CozyOS.CozyIdentityFAQRouter;
}

// ---- A: normal origin question -> concise, NOT the full story ----

test('A: "How was CozyOS born?" -> matches origin intent, responseDepth concise, answer is the real (unchanged) short project-history text, not the full narrative', async () => {
    const router = freshRouter();
    const result = await router.resolve('How was CozyOS born?', { language: 'en' });
    assert.equal(result.matched, true);
    assert.equal(result.intentId, 'COZYOS_ORIGIN');
    assert.equal(result.responseDepth, 'concise');
    assert.equal(result.subject, 'cozyos');
    assert.match(result.answer, /door-to-door/i);
    assert.doesNotMatch(result.answer, /Pastor Ezekiel|ABOVE ONLY|Jane Achieng/i, 'concise must never contain the fuller narrative-only facts');
});

// ---- B: explicit "more" request -> detailed ----

test('B: "Tell me more about how CozyOS started." -> responseDepth detailed, a real, longer, verbatim excerpt (Pastor Ezekiel present, motto/closing paragraphs absent)', async () => {
    const router = freshRouter();
    const result = await router.resolve('Tell me more about how CozyOS started.', { language: 'en' });
    assert.equal(result.intentId, 'COZYOS_ORIGIN');
    assert.equal(result.responseDepth, 'detailed');
    assert.match(result.answer, /Pastor Ezekiel/i, 'detailed must include the richer narrative content beyond the concise answer');
    assert.doesNotMatch(result.answer, /ABOVE ONLY/i, 'detailed is a real, verbatim PREFIX of the full story — the closing motto paragraph is beyond its 5-of-7-paragraph cut');
});

// ---- C / D: explicit full/original story request -> full_original, verbatim ----

test('C: "Tell me the full story of how CozyOS was born." -> responseDepth full_original, the complete, verbatim, unshortened text (motto paragraph present)', async () => {
    const router = freshRouter();
    const result = await router.resolve('Tell me the full story of how CozyOS was born.', { language: 'en' });
    assert.equal(result.intentId, 'COZYOS_ORIGIN');
    assert.equal(result.responseDepth, 'full_original');
    assert.match(result.answer, /Pastor Ezekiel/i);
    assert.match(result.answer, /ABOVE ONLY/i, 'full_original must include the complete text through its closing motto paragraph');
});

test('D: "Give me the original full story." -> responseDepth full_original, byte-identical text to test C (ONE authoritative original, not a second story)', async () => {
    const router = freshRouter();
    const resultC = await router.resolve('Tell me the full story of how CozyOS was born.', { language: 'en' });
    const resultD = await router.resolve('Give me the original full story.', { language: 'en' });
    assert.equal(resultD.intentId, 'COZYOS_ORIGIN');
    assert.equal(resultD.responseDepth, 'full_original');
    assert.equal(resultD.answer, resultC.answer, 'the full_original answer must be the exact same authoritative text regardless of phrasing');
});

// ---- E: conversational continuation, no repeated subject ----

test('E: short answer then "Tell me the full story." (no "CozyOS" mentioned at all) still resolves to the same full_original text', async () => {
    const router = freshRouter();
    const short = await router.resolve('How was CozyOS born?', { language: 'en' });
    assert.equal(short.responseDepth, 'concise');
    const followUp = await router.resolve('Tell me the full story.', { language: 'en' });
    assert.equal(followUp.matched, true, 'must resolve even though the subject "CozyOS" is never repeated');
    assert.equal(followUp.intentId, 'COZYOS_ORIGIN');
    assert.equal(followUp.responseDepth, 'full_original');
    assert.match(followUp.answer, /ABOVE ONLY/i);
});

// ---- F: Kiswahili origin question -> concise, Kiswahili ----

test('F: Kiswahili origin question -> concise, real Kiswahili answer (unchanged, hand-authored, certified:false as before)', async () => {
    const router = freshRouter();
    const result = await router.resolve('CozyOS ilianzaje?', { language: 'sw' });
    assert.equal(result.intentId, 'COZYOS_ORIGIN');
    assert.equal(result.language, 'sw');
    assert.equal(result.responseDepth, 'concise');
    assert.equal(result.certified, false);
    assert.match(result.answer, /nyumba kwa nyumba/i, 'expected the real, existing Kiswahili concise text');
    assert.notEqual(result.machineTranslated, true, 'the concise Kiswahili answer is hand-authored, not machine-translated');
});

// ---- G: Kiswahili full-story request -> full_original, HONESTLY machine-translated (no genuine original Kiswahili full story exists) ----

test('G: Kiswahili full-story request -> responseDepth full_original, machine-translated from the real English original, honestly disclosed (never presented as an original Kiswahili text)', async () => {
    const router = freshRouter();
    const result = await router.resolve('Nipe hadithi kamili ya jinsi CozyOS ilivyozaliwa.', { language: 'sw' });
    assert.equal(result.intentId, 'COZYOS_ORIGIN');
    assert.equal(result.responseDepth, 'full_original');
    // No SpeechTranslationAdapter is loaded in this unit-test environment,
    // so the real, honest degrade path applies: English is returned with
    // a disclosed fallbackReason, never a fabricated Kiswahili paragraph.
    assert.equal(result.language, 'en');
    assert.ok(result.fallbackReason, 'must honestly disclose that no real translator is available, rather than inventing Kiswahili prose');
    assert.match(result.answer, /ABOVE ONLY/i, 'the returned text is still the real, complete, verbatim original');
});

test('G2: with a real (mocked) SpeechTranslationAdapter available, the SAME Kiswahili full-story request is honestly flagged machineTranslated, never claimed as an original', async () => {
    const router = freshRouter();
    global.window.CozyOS.SpeechTranslationAdapter = {
        getCapabilities: () => ({ supportsTranslation: true }),
        startTranslationSession: () => ({ id: 'sess-1' }),
        translateText: async (_id, text) => ({ success: true, translatedText: `[SW-MT] ${text}`, isReal: true })
    };
    const result = await router.resolve('Nipe hadithi kamili ya jinsi CozyOS ilivyozaliwa.', { language: 'sw' });
    assert.equal(result.intentId, 'COZYOS_ORIGIN');
    assert.equal(result.responseDepth, 'full_original');
    assert.equal(result.language, 'sw');
    assert.equal(result.machineTranslated, true);
    assert.equal(result.originalLanguage, 'en');
    assert.match(result.source, /machine-translated/i);
});

// ---- H: unrelated question -> normal answer, never the founder story ----

test('H: "What is CozyOS?" -> does not match the origin/founder-story intent at all (falls through to this router\'s normal "no match" path)', () => {
    const router = freshRouter();
    const hit = router.detectIntent('What is CozyOS?');
    assert.notEqual(hit && hit.intentId, 'COZYOS_ORIGIN');
    assert.notEqual(hit && hit.intentId, 'COZYOS_WHY_CREATED');
    assert.notEqual(hit && hit.intentId, 'COZYOS_FOUNDER');
});

// ---- Regression: "who founded" stays concise/factual, never the narrative ----

test('regression: "Who founded CozyOS?" still resolves to COZYOS_FOUNDER (a short factual answer), never the origin story', async () => {
    const router = freshRouter();
    const result = await router.resolve('Who founded CozyOS?', { language: 'en' });
    assert.equal(result.intentId, 'COZYOS_FOUNDER');
    assert.doesNotMatch(result.answer, /door-to-door|Pastor Ezekiel/i);
});

// ---- Regression: honest degrade when CozyPublicKnowledge isn't loaded ----

test('regression: detailed/full_original requests honestly fall back to concise (never fabricate) when CozyPublicKnowledge is not loaded', async () => {
    const router = freshRouter({ withPublicKnowledge: false });
    const result = await router.resolve('Tell me the full story of how CozyOS was born.', { language: 'en' });
    assert.equal(result.intentId, 'COZYOS_ORIGIN');
    assert.equal(result.responseDepth, 'concise');
    assert.match(result.answer, /door-to-door/i);
});

// ---- classifyOriginStoryDepth() unit checks ----

test('classifyOriginStoryDepth(): FULL_ORIGINAL beats DETAILED when both markers could loosely apply', () => {
    const router = freshRouter();
    assert.equal(router.classifyOriginStoryDepth('Tell me more — give me the full original story'), router.RESPONSE_DEPTH.FULL_ORIGINAL);
});

test('classifyOriginStoryDepth(): no marker -> CONCISE (the honest, unchanged default)', () => {
    const router = freshRouter();
    assert.equal(router.classifyOriginStoryDepth('How was CozyOS born?'), router.RESPONSE_DEPTH.CONCISE);
});
