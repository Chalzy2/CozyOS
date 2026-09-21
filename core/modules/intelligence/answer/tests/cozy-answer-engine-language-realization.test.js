'use strict';

/**
 * core/modules/intelligence/answer/tests/cozy-answer-engine-language-realization.test.js
 * PHASE 4 CORRECTION — Live Window language-realization repair.
 *
 * Reproduces the exact real-browser bug: "CozyOS ni nini?" (fully
 * Kiswahili) got a correctly Kiswahili-realized identity answer from
 * CozyIdentityFAQRouter, but cozy-answer-engine.js's own multi-intent
 * composition then spliced RAW English knowledge-registry prose onto it
 * with a bare "Additionally:" connector, producing a mixed-language
 * final answer.
 *
 * Uses the SAME fake router/AI/knowledge shapes as the sibling
 * cozy-answer-engine.test.js suite — the real composition/labeling
 * logic under test, not a reimplementation of the composed authorities.
 *
 * Run with: node --test core/modules/intelligence/answer/tests/cozy-answer-engine-language-realization.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const enginePath = path.join(__dirname, '..', 'cozy-answer-engine.js');
const templatesPath = path.join(__dirname, '..', '..', 'language', 'cozy-language-templates.js');
const realizePath = path.join(__dirname, '..', '..', 'language', 'cozy-language-realize.js');

function freshEngine(cozyOSOverrides) {
    [enginePath, templatesPath, realizePath].forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    global.window = { CozyOS: Object.assign({}, cozyOSOverrides) };
    require(templatesPath);
    require(realizePath);
    require(enginePath);
    return global.window.CozyOS.CozyAnswerEngine;
}

function makeFakeRouter(overrides) {
    return Object.assign({ detectIntent: () => null, resolve: async () => ({ matched: false }) }, overrides);
}
function makeFakeAI(overrides) {
    return Object.assign({ getContext: async () => ({ success: true, found: false, results: [] }) }, overrides);
}

const KISWAHILI_FAQ_ANSWER = 'Kabla ya kuunda CozyOS, Charles Owuor alipata uzoefu wa kuuza bidhaa nyumba kwa nyumba.';
const ENGLISH_KNOWLEDGE_PIECE = 'CozyOS exists to solve practical, everyday problems — for individuals, churches, schools, and communities.';

/* ------------------------------------------------------------------ */
/* THE REPORTED BUG, REGRESSION-GUARDED (FAQ-matched multi-intent path) */
/* ------------------------------------------------------------------ */

test('REGRESSION: a Kiswahili identity question + an English-only knowledge-registry piece never leaks raw untranslated English prose', async () => {
    const router = makeFakeRouter({
        resolve: async () => ({
            matched: true, success: true, isReal: true,
            intentId: 'COZYOS_ORIGIN', confidence: 1, language: 'sw',
            answer: KISWAHILI_FAQ_ANSWER,
            source: 'DeveloperIdentity (public profile)'
        })
    });
    const ai = makeFakeAI({
        getContext: async () => ({
            success: true, found: true, results: [
                { authority: 'knowledge-registry', provenance: 'window.CozyOS.CozyKnowledge', getter: 'getWhyUseCozyOSFact', evidence: 'VERIFIED', content: ENGLISH_KNOWLEDGE_PIECE }
            ]
        })
    });
    const engine = freshEngine({ CozyIdentityFAQRouter: router, CozyAI: ai });
    const result = await engine.answer('CozyOS ni nini?', { language: 'sw' });

    // The Kiswahili FAQ answer is preserved verbatim.
    assert.match(result.answer, /Kabla ya kuunda CozyOS/);
    // The raw, untranslated English knowledge sentence must NEVER appear
    // spliced in directly after the Kiswahili answer with no disclosure
    // — this is the exact leak the real Live Window showed (a bare
    // space or "Additionally:" immediately followed by English prose).
    assert.doesNotMatch(result.answer, /nyumba\. (Additionally:? )?CozyOS exists/);
    // The honest, existing disclosure wrapper (same one "why-use-cozyos:
    // verified"/"differentiation:verified" already use) must be present,
    // with the English content clearly marked as English — the content
    // itself legitimately still appears, disclosed rather than hidden.
    assert.match(result.answer, /Kwa Kiingereza/);
    assert.match(result.answer, /CozyOS exists to solve practical, everyday problems/);
    // Never the bare, hardcoded English "Additionally:" connector for a
    // Kiswahili answer.
    assert.doesNotMatch(result.answer, /Additionally:/);
});

test('English behavior is completely unchanged (byte-identical) for the same multi-intent shape', async () => {
    const router = makeFakeRouter({
        resolve: async () => ({
            matched: true, success: true, isReal: true,
            intentId: 'COZYOS_ORIGIN', confidence: 1, language: 'en',
            answer: 'Before creating CozyOS, Charles Owuor had experience selling products door to door.',
            source: 'DeveloperIdentity (public profile)'
        })
    });
    const ai = makeFakeAI({
        getContext: async () => ({
            success: true, found: true, results: [
                { authority: 'knowledge-registry', provenance: 'window.CozyOS.CozyKnowledge', getter: 'getWhyUseCozyOSFact', evidence: 'VERIFIED', content: ENGLISH_KNOWLEDGE_PIECE }
            ]
        })
    });
    const engine = freshEngine({ CozyIdentityFAQRouter: router, CozyAI: ai });
    const result = await engine.answer('What is CozyOS?', { language: 'en' });
    assert.equal(result.answer, `Before creating CozyOS, Charles Owuor had experience selling products door to door. Additionally: ${ENGLISH_KNOWLEDGE_PIECE}`);
});

test('English behavior is unchanged when no language is supplied at all (default path)', async () => {
    const router = makeFakeRouter({
        resolve: async () => ({
            matched: true, success: true, isReal: true,
            intentId: 'COZYOS_ORIGIN', confidence: 1, language: 'en',
            answer: 'Origin answer.',
            source: 'DeveloperIdentity (public profile)'
        })
    });
    const ai = makeFakeAI({
        getContext: async () => ({
            success: true, found: true, results: [
                { authority: 'knowledge-registry', provenance: 'window.CozyOS.CozyKnowledge', getter: 'getWhyUseCozyOSFact', evidence: 'VERIFIED', content: 'Extra English detail.' }
            ]
        })
    });
    const engine = freshEngine({ CozyIdentityFAQRouter: router, CozyAI: ai });
    const result = await engine.answer('What is CozyOS?'); // no options object at all
    assert.equal(result.answer, 'Origin answer. Additionally: Extra English detail.');
});

/* ------------------------------------------------------------------ */
/* THE SAME BUG, NO-FAQ-MATCH GENERAL PATH                             */
/* ------------------------------------------------------------------ */

test('REGRESSION (no-FAQ-match path): a Kiswahili question resolved purely from knowledge-registry context never leaks raw English', async () => {
    const ai = makeFakeAI({
        getContext: async () => ({
            success: true, found: true, results: [
                { authority: 'knowledge-registry', provenance: 'window.CozyOS.CozyKnowledge', getter: 'getWhyUseCozyOSFact', evidence: 'VERIFIED', content: ENGLISH_KNOWLEDGE_PIECE }
            ]
        })
    });
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: ai });
    const result = await engine.answer('Kwa nini nitumie CozyOS?', { language: 'sw' });
    assert.match(result.answer, /Kwa Kiingereza/);
    assert.doesNotMatch(result.answer, /Additionally/);
});

test('English behavior (no-FAQ-match path, multi-piece) stays byte-identical', async () => {
    const ai = makeFakeAI({
        getContext: async () => ({
            success: true, found: true, results: [
                { authority: 'knowledge-registry', provenance: 'window.CozyOS.CozyKnowledge', getter: 'listApplicationsFact', evidence: 'VERIFIED', content: 'CozyOS includes ShopOS and MpesaOS.' },
                { authority: 'cozy-memory', provenance: 'window.CozyOS.CozyMemory', namespace: 'notes', key: 'k', content: 'A real recorded note.' }
            ]
        })
    });
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: ai });
    const result = await engine.answer('Tell me about CozyOS applications and notes.', { language: 'en' });
    assert.equal(result.answer, 'CozyOS includes ShopOS and MpesaOS. Additionally, A real recorded note.');
});

/* ------------------------------------------------------------------ */
/* MIXED-SOURCE HONESTY: only the CONFIRMED English-only source is      */
/* wrapped; content of unknown language (cozy-memory) is left as-is    */
/* ------------------------------------------------------------------ */

test('a Kiswahili answer combining a knowledge-registry piece AND a cozy-memory piece wraps only the knowledge-registry content', async () => {
    const router = makeFakeRouter({
        resolve: async () => ({
            matched: true, success: true, isReal: true,
            intentId: 'COZYOS_FOUNDER', confidence: 1, language: 'sw',
            answer: 'CozyOS ilianzishwa na Charles Owuor.',
            source: 'DeveloperIdentity (public profile)'
        })
    });
    const ai = makeFakeAI({
        getContext: async () => ({
            success: true, found: true, results: [
                { authority: 'knowledge-registry', provenance: 'window.CozyOS.CozyKnowledge', getter: 'listApplicationsFact', evidence: 'VERIFIED', content: 'CozyOS includes ShopOS and MpesaOS.' },
                { authority: 'cozy-memory', provenance: 'window.CozyOS.CozyMemory', namespace: 'user-taught', key: 'k1', content: 'Kikundi chetu kidogo kinakutana Alhamisi.' }
            ]
        })
    });
    const engine = freshEngine({ CozyIdentityFAQRouter: router, CozyAI: ai });
    const result = await engine.answer('CozyOS ni nini na ina programu gani?', { language: 'sw' });
    // The FAQ answer and the (already-Kiswahili) memory piece are untouched.
    assert.match(result.answer, /CozyOS ilianzishwa na Charles Owuor/);
    assert.match(result.answer, /Kikundi chetu kidogo kinakutana Alhamisi/);
    // The knowledge-registry piece is honestly wrapped, never raw.
    assert.match(result.answer, /Kwa Kiingereza/);
    assert.match(result.answer, /CozyOS includes ShopOS and MpesaOS/);
});

/* ------------------------------------------------------------------ */
/* FRENCH/ARABIC/SOMALI — the fix is universal, not Kiswahili-specific */
/* ------------------------------------------------------------------ */

test('the same fix applies to French, not a Kiswahili-only hardcode', async () => {
    const router = makeFakeRouter({
        resolve: async () => ({
            matched: true, success: true, isReal: true,
            intentId: 'COZYOS_ORIGIN', confidence: 1, language: 'fr',
            answer: "Avant de créer CozyOS, Charles Owuor vendait des produits.",
            source: 'DeveloperIdentity (public profile)'
        })
    });
    const ai = makeFakeAI({
        getContext: async () => ({
            success: true, found: true, results: [
                { authority: 'knowledge-registry', provenance: 'window.CozyOS.CozyKnowledge', getter: 'getWhyUseCozyOSFact', evidence: 'VERIFIED', content: ENGLISH_KNOWLEDGE_PIECE }
            ]
        })
    });
    const engine = freshEngine({ CozyIdentityFAQRouter: router, CozyAI: ai });
    const result = await engine.answer('Qu\'est-ce que CozyOS ?', { language: 'fr' });
    assert.match(result.answer, /En anglais/);
    assert.doesNotMatch(result.answer, /Additionally:/);
});
