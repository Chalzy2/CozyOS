/**
 * core/living/test/m365-live-window-language-routing-repair.test.js
 * Cozy AI — Live Window Language + Kiswahili Purpose/Benefit Routing Repair
 *
 * SCOPE (honest disclosure): this proves the real, targeted fixes made
 * this pass, tested through the same rule-based-conversational-
 * provider.js entry point (think()) the real Live Window's
 * cozy-living-assistant.js falls back to whenever the verified
 * CozyAnswerEngine/CozyIdentityFAQRouter chain returns a plain,
 * non-VERIFIED UNKNOWN_REQUEST for these exact phrasings (confirmed by
 * reading cozy-living-assistant.js's #send() — see its own "Do you
 * speak Kiswahili?" comment) — i.e. this file's think() result IS what
 * actually reaches the person in the real Live Window for every case
 * below, not a bypassed/parallel path.
 *
 * Real, targeted fixes proven here:
 *   1. "language-request" — a new intent for an EXPLICIT single-
 *      language ask ("Greet me in French", "Can talk to me in
 *      Kiswahili", "Do you speak Kiswahili"), previously either
 *      misrouted into the generic "which languages do you support"
 *      list (language-support-list) or left "unsupported" entirely.
 *      Resolves the ACTUAL requested language (independent of what
 *      language the question itself was typed in) via the existing,
 *      real CozyLanguageRegistry.resolveLanguage(), and answers with a
 *      real, existing, verified per-language greeting template — never
 *      inventing new prose.
 *   2. cozy-public-knowledge-source.js's TARGET_LANGUAGES audit fix —
 *      Luganda/Igbo were registered NOT_READY and stated as such in
 *      the language-support-list reply, while being silently absent
 *      from the same reply's "target list" clause — an internal
 *      contradiction. Both now appear in both places.
 *   3. Three more real, natural Kiswahili CozyOS purpose/benefit
 *      phrasings/word-orders resolve to the existing why-use-cozyos
 *      intent instead of falling through to "unsupported" (which, per
 *      cozy-living-assistant.js's fallback chain, is what allows
 *      CozyAnswerEngine's internal debug/fallback wording — e.g. "Some
 *      related context exists..." — to leak through to the person).
 *
 * Two real, disclosed gaps remain and are NOT claimed fixed here (both
 * pre-existing, both unchanged by this pass):
 *   (1) why-use-cozyos's answer is honestly English-only for Kiswahili
 *       callers — no verified Kiswahili translation of that vision/
 *       mission prose exists yet (same disclosed limit as M363/M364);
 *       resolving to the RIGHT intent (this pass's fix) is a different,
 *       separate thing from that translation existing.
 *   (2) a requested language this codebase has never registered at all
 *       (e.g. "Do you speak Spanish?") honestly asks which language was
 *       meant, rather than guessing or claiming a capability that does
 *       not exist.
 *
 * Run with: node core/living/test/m365-live-window-language-routing-repair.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const PROVIDER_PATH = path.join(ROOT, 'modules', 'intelligence', 'providers', 'rule-based-conversational-provider.js');
const TEMPLATES_PATH = path.join(ROOT, 'modules', 'intelligence', 'language', 'cozy-language-templates.js');
const REGISTRY_PATH = path.join(ROOT, 'modules', 'intelligence', 'language', 'cozy-language-registry.js');
const PUBLIC_KNOWLEDGE_PATH = path.join(ROOT, 'modules', 'intelligence', 'knowledge', 'cozy-public-knowledge-source.js');
const KNOWLEDGE_REGISTRY_PATH = path.join(ROOT, 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js');
const DEV_PROFILE_PATH = path.join(ROOT, 'identity', 'developer-profile.js');
const PROJECT_HISTORY_PATH = path.join(ROOT, 'identity', 'project-history.js');
const AFRICAN_KNOWLEDGE_PATH = path.join(ROOT, 'identity', 'african-knowledge-initiative.js');
const IDENTITY_ASSEMBLY_PATH = path.join(ROOT, 'identity', 'cozyai-identity.js');
const FAQ_ROUTER_PATH = path.join(ROOT, 'modules', 'knowledge', 'cozyos-identity-faq-router.js');

const ALL_PATHS = [DEV_PROFILE_PATH, PROJECT_HISTORY_PATH, AFRICAN_KNOWLEDGE_PATH, IDENTITY_ASSEMBLY_PATH, REGISTRY_PATH, TEMPLATES_PATH, PUBLIC_KNOWLEDGE_PATH, KNOWLEDGE_REGISTRY_PATH, FAQ_ROUTER_PATH, PROVIDER_PATH];

function makeFakeLivingAI() {
    const registered = new Map();
    return { registerProvider(name, p) { registered.set(name, p); }, setActiveProvider() {}, _registered: registered };
}

function freshProvider() {
    ALL_PATHS.forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded yet */ } });
    const fakeAI = makeFakeLivingAI();
    global.window = { CozyOS: { LivingAI: fakeAI } };
    for (const p of ALL_PATHS) require(p);
    return fakeAI._registered.get('rule-based-conversational');
}

// ---- 1. Explicit language requests must switch/use the requested
//         verified language, regardless of the sentence's own language ----

test('"Do you speak in kiswahili" resolves to language-request, not the generic language list', async () => {
    const provider = freshProvider();
    const r = await provider.think('Do you speak in kiswahili', {});
    assert.equal(r.result.intent, 'language-request');
    assert.notEqual(r.result.intent, 'language-support-list');
    assert.match(r.result.text, /Kiswahili/);
    assert.doesNotMatch(r.result.text, /target language list/i);
});

test('"Can talk to me in kiswahili" resolves and greets in Kiswahili', async () => {
    const provider = freshProvider();
    const r = await provider.think('Can talk to me in kiswahili', {});
    assert.equal(r.result.intent, 'language-request');
    assert.equal(r.result.needsClarification, false);
    assert.match(r.result.text, /Habari!/); // real, existing verified Kiswahili greeting-generic template
});

const GREET_CASES = [
    { phrase: 'Greet me in French', mustMatch: /Bonjour/ },
    { phrase: 'Greet me in Arabic', mustMatch: /مرحبًا/ },
    { phrase: 'Greet me in Somali', mustMatch: /Salaan/ },
];
for (const { phrase, mustMatch } of GREET_CASES) {
    test(`"${phrase}" produces a real greeting in the requested verified language`, async () => {
        const provider = freshProvider();
        const r = await provider.think(phrase, {});
        assert.equal(r.result.intent, 'language-request');
        assert.match(r.result.text, mustMatch);
    });
}

test('A request for a registered-but-NOT_READY language ("Greet me in Luganda") honestly discloses the fallback rather than fabricating a Luganda reply', async () => {
    const provider = freshProvider();
    const r = await provider.think('Greet me in Luganda', {});
    assert.equal(r.result.intent, 'language-request');
    assert.match(r.result.text, /Luganda/);
    assert.match(r.result.text, /don't yet have verified Luganda/i);
    assert.match(r.result.text, /Hello!/); // real fallback to an AVAILABLE language's verified greeting
});

test('A request for a language CozyOS has never registered ("Do you speak Spanish") honestly asks which language, never guesses', async () => {
    const provider = freshProvider();
    const r = await provider.think('Do you speak Spanish', {});
    assert.equal(r.result.intent, 'language-request');
    assert.match(r.result.text, /which one would you like/i);
});

// ---- 2. Kiswahili CozyOS purpose/benefit phrasings resolve to the
//         existing verified why-use-cozyos knowledge, never "unsupported" ----

const SW_BENEFIT_PHRASES = [
    'Cozyos inanisaiaje',           // real dropped-syllable typo for "inanisaidiaje"
    'Cozyos inanisaidiaje',         // the corrected form, for comparison
    'Nini cozyos inatufaika nayo',
    'Cozyos inafaida gani kwetu',
];
for (const phrase of SW_BENEFIT_PHRASES) {
    test(`"${phrase}" resolves to why-use-cozyos, never falls through to unsupported`, async () => {
        const provider = freshProvider();
        const r = await provider.think(phrase, {});
        assert.equal(r.result.intent, 'why-use-cozyos');
        assert.equal(r.result.needsClarification, false);
        assert.doesNotMatch(r.result.text, /Some related context exists/i);
        assert.doesNotMatch(r.result.text, /I don't have a rule-based answer for that yet/i);
    });
}

// ---- 3. Language registry audit: Luganda/Igbo consistency ----

test('AUDIT: the language-support-list reply names Luganda and Igbo in the target list, matching where it already names them as registered/NOT_READY', async () => {
    const provider = freshProvider();
    const r = await provider.think('Which languages does CozyOS support?', {});
    assert.equal(r.result.intent, 'language-support-list');
    assert.match(r.result.text, /Registered but not yet verified \(NOT_READY\):.*Luganda.*Igbo/i);
    assert.match(r.result.text, /target language list is:.*Luganda.*Igbo/i);
});

test('AUDIT: CozyLanguageRegistry itself already agrees Luganda/Igbo are registered NOT_READY (unchanged by this pass, confirmed as the source of truth)', async () => {
    freshProvider();
    const registry = global.window.CozyOS.CozyLanguageRegistry;
    const lg = registry.getLanguage('lg');
    const ig = registry.getLanguage('ig');
    assert.equal(lg.state, 'NOT_READY');
    assert.equal(ig.state, 'NOT_READY');
});

// ---- REGRESSION: existing intents/behavior unaffected ----

test('REGRESSION: a genuine "which languages does CozyOS support" question still returns the full list intent, not language-request', async () => {
    const provider = freshProvider();
    const r = await provider.think('What languages does CozyOS support?', {});
    assert.equal(r.result.intent, 'language-support-list');
});

test('REGRESSION: "Habari yako" (a plain Kiswahili greeting, not a language request) is still classified as greeting-generic and answered in Kiswahili', async () => {
    const provider = freshProvider();
    const r = await provider.think('Habari yako', {});
    assert.equal(r.result.intent, 'greeting-generic');
    assert.equal(r.result.language, 'sw');
    assert.match(r.result.text, /Habari!/);
});

test('REGRESSION: existing Kiswahili why-use-cozyos phrasings from the prior M364 repair still resolve correctly', async () => {
    const provider = freshProvider();
    const r = await provider.think('CozyOS inasaidia nini?', {});
    assert.equal(r.result.intent, 'why-use-cozyos');
});

test('REGRESSION: "translate this into French" (translate-request) is unaffected by the new SPEAKABLE_LANGUAGE_NAMES map', async () => {
    const provider = freshProvider();
    const r = await provider.think('Translate this into French.', {});
    assert.equal(r.result.intent, 'translate-request');
});

test('REGRESSION: founder question is unaffected by the new why-use-cozyos alternatives', async () => {
    const provider = freshProvider();
    const r = await provider.think('Nani alianzisha CozyOS?', {});
    assert.notEqual(r.result.intent, 'why-use-cozyos');
    assert.notEqual(r.result.intent, 'language-request');
});

test('REGRESSION: a genuinely garbled/unclear message still honestly asks for clarification rather than guessing', async () => {
    const provider = freshProvider();
    const r = await provider.think('asdkjhasdkjh qweqwe', {});
    assert.equal(r.result.intent, 'unsupported');
    assert.equal(r.result.needsClarification, true);
});

console.log('Live Window Language Routing Repair suite: run complete.');
