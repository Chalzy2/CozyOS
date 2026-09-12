'use strict';

/**
 * Regression test suite for
 * core/modules/ChurchOS/church-live-translation-interaction.js
 * (RP-035 Phase C, Checkpoint 6).
 *
 * HARNESS DISCLOSURE (read before trusting these numbers):
 *   REAL, unmodified-by-this-suite production code under test: the
 *   real ldce-session-engine.js, the real ldce-caption-engine.js, the
 *   real speech-translation-adapter.js, the real
 *   speech-translation-provider.js, the real cozy-translate.js, the
 *   real cozy-language-pack-registry.js, and the real
 *   church-live-translation-interaction.js this checkpoint adds. Every
 *   language-selection, captioning, and translation-dispatch fact in
 *   this suite runs through those real files' actual logic.
 *
 *   STUBBED, and disclosed as a stub, not a real production file:
 *     - IdentityEngine: identical minimal method-contract stub
 *       Checkpoints 1/2/4/5's own suites disclosed
 *       (getUser/isPlatformAdmin/registerUser/grantResourcePermission).
 *       LDCE requires it for join authorization only.
 *     - CozyConversation: identical stub reused verbatim from prior
 *       checkpoints (LDCE's own real requirement, not this file's
 *       concern).
 *     - SpeechRecognitionAdapter: this is a genuine browser-API
 *       wrapper (real production file wraps window.SpeechRecognition,
 *       which does not exist in Node) — stubbed here at its documented
 *       public contract only (on/start/stop/isActive/isReal), with a
 *       manual `_emitFinal(transcript)` test hook to simulate a real
 *       ASR final result. LDCECaptionEngine itself — the real
 *       production logic that consumes this adapter — is NOT stubbed.
 *     - The browser Translator API itself is never available in Node.
 *     - No cloud translation provider exists in this repository. To
 *       exercise the REAL translation-available code path, this suite
 *       registers a disclosed, explicit test provider through
 *       SpeechTranslationProviders' own real, public register() API
 *       (the same extension point a real cloud/offline provider would
 *       use) — this does not stub or bypass SpeechTranslationProviders,
 *       SpeechTranslationAdapter, CozyTranslate, or LDCECaptionEngine;
 *       every one of those runs its real logic against a real
 *       registered provider.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

function makeStubConversation() {
    const conversations = new Map();
    let n = 0;
    return {
        createConversation({ type, participants }) {
            const conversationId = `conv_${++n}`;
            conversations.set(conversationId, { conversationId, type, participants, state: 'created' });
            return { success: true, conversationId };
        },
        getConversation(id) { return conversations.get(id) || null; },
        startConversation(id) { const c = conversations.get(id); if (!c) return { success: false, reason: 'Unknown conversation.' }; c.state = 'active'; return { success: true }; },
        addTranscriptSegment() {},
    };
}

function makeStubIdentity() {
    const users = new Map();
    const grants = new Map();
    const platformAdmins = new Set();
    return {
        registerUser(userId, { orgId = null, country = null } = {}) { users.set(userId, { orgId, country }); },
        setPlatformAdmin(userId) { platformAdmins.add(userId); },
        isPlatformAdmin(userId) { return platformAdmins.has(userId); },
        getUser(userId) {
            const u = users.get(userId);
            if (!u) return null;
            return { userId, username: userId, roles: [], status: 'active', companyId: null, branchId: null, departmentId: null, teamId: null, languagePreference: null, country: u.country, orgId: u.orgId };
        },
        grantResourcePermission(userId, permissionString) {
            if (!users.has(userId)) throw new Error(`[StubIdentity] unknown userId "${userId}".`);
            if (!grants.has(userId)) grants.set(userId, new Set());
            grants.get(userId).add(permissionString);
            return true;
        },
        checkResourcePermission(userId, permissionString) {
            return !!(grants.get(userId) && grants.get(userId).has(permissionString));
        },
    };
}

/** Disclosed stub — a genuine browser-API wrapper, not the production
 * logic under test. Mirrors SpeechRecognitionAdapter's documented
 * on/start/stop/isActive/isReal contract exactly. */
function makeStubSpeechRecognition() {
    const listeners = { onFinalResult: [], onPartialResult: [], onError: [] };
    let active = false;
    let sessionId = null;
    return {
        isReal() { return true; },
        on(eventName, handler) {
            if (!listeners[eventName]) listeners[eventName] = [];
            listeners[eventName].push(handler);
            return { success: true };
        },
        start(config = {}) {
            if (active) return { success: false, reason: 'Recognition already active. Call stop() first.' };
            active = true;
            sessionId = config.sessionId || null;
            return { success: true, isReal: true, sessionId };
        },
        stop() { active = false; return { success: true }; },
        isActive() { return active; },
        /** Test-only hook: simulates a real onFinalResult event. */
        _emitFinal(transcript) {
            (listeners.onFinalResult || []).forEach((h) => h({ sessionId, transcript, confidence: 0.9, isFinal: true }));
        }
    };
}

async function freshEngines({ withTestProvider = false, translationDelayMs = 0 } = {}) {
    for (const p of [
        '../../translate/cozy-translate.js',
        '../../speech/adapters/speech-translation-provider.js',
        '../../speech/adapters/speech-translation-adapter.js',
        '../../communication/ldce-caption-engine.js',
        '../../communication/ldce-session-engine.js',
        '../../intelligence/language-packs/cozy-language-pack-registry.js',
        '../church-live-translation-interaction.js',
    ]) {
        delete require.cache[require.resolve(p)];
    }
    const identity = makeStubIdentity();
    const asrStub = makeStubSpeechRecognition();
    global.window = {
        CozyOS: {
            CozyConversation: makeStubConversation(),
            IdentityEngine: identity,
            SpeechRecognitionAdapter: asrStub,
        }
    };

    require('../../translate/cozy-translate.js');
    require('../../speech/adapters/speech-translation-provider.js');
    require('../../speech/adapters/speech-translation-adapter.js');
    require('../../communication/ldce-caption-engine.js');
    require('../../communication/ldce-session-engine.js');
    require('../../intelligence/language-packs/cozy-language-pack-registry.js');
    require('../church-live-translation-interaction.js');

    if (withTestProvider) {
        global.window.CozyOS.SpeechTranslationProviders.register({
            name: 'test-disclosed-provider',
            type: 'offline',
            supportsOffline: true,
            async translate(text, { sourceLanguage, targetLanguage }) {
                if (translationDelayMs > 0) {
                    await new Promise((resolve) => setTimeout(resolve, translationDelayMs));
                }
                return { translatedText: `[${targetLanguage}] ${text}`, isReal: true };
            }
        });
    }
    // Real, idempotent init — seeds CozyTranslate's real language sets
    // and registers the real translator record. Awaited explicitly for
    // deterministic test state (production fires this once at load,
    // unawaited).
    await global.window.CozyOS.SpeechTranslationAdapter.init();

    return {
        ldce: global.window.CozyOS.LDCESessionEngine,
        captionEngine: global.window.CozyOS.LDCECaptionEngine,
        translation: global.window.CozyOS.ChurchLiveTranslationInteraction,
        translate: global.window.CozyOS.CozyTranslate,
        providers: global.window.CozyOS.SpeechTranslationProviders,
        packs: global.window.CozyOS.CozyLanguagePacks,
        identity,
        asrStub,
    };
}

function makeSessionWithMembers(ldce, identity, hostId, memberIds) {
    identity.registerUser(hostId, {});
    const created = ldce.createSession(hostId, { type: 'classroom' });
    for (const uid of memberIds) {
        identity.registerUser(uid, {});
        const invite = ldce.inviteParticipant(created.sessionId, hostId, uid);
        assert.equal(invite.success, true, `invite for ${uid} should succeed: ${invite.reason}`);
        const join = ldce.joinSession(created.sessionId, uid);
        assert.equal(join.success, true, `join for ${uid} should succeed: ${join.reason}`);
    }
    return created.sessionId;
}

/* ------------------------------------------------------------------ */
/* 1. MODULE REGISTRATION                                             */
/* ------------------------------------------------------------------ */

test('module registers version and Modules registry entry', async () => {
    const { translation } = await freshEngines();
    assert.equal(translation.getVersion(), '1.0.0');
    assert.equal(global.window.CozyOS.Modules['church-live-translation-interaction'].version, '1.0.0');
});

test('fixed capability constants are honest, never computed as available', async () => {
    const { translation } = await freshEngines();
    assert.equal(translation.TRANSLATED_AUDIO_CAPABILITY, 'CAPABILITY_UNAVAILABLE');
    assert.equal(translation.BROADCAST_CAPABILITY, 'CAPABILITY_UNAVAILABLE');
    assert.equal(translation.SOURCE_LANGUAGE_DETECTION_CAPABILITY, 'SOURCE_LANGUAGE_DETECTION_UNAVAILABLE');
});

/* ------------------------------------------------------------------ */
/* 2. LANGUAGE CAPABILITY MATRIX                                      */
/* ------------------------------------------------------------------ */

test('17 language identities are represented according to real repository evidence', async () => {
    const { translation, packs } = await freshEngines();
    const result = translation.getLanguageCapabilities();
    assert.equal(result.available, true);
    assert.equal(result.languages.length, 17);
    assert.equal(result.languages.length, packs.DEFAULT_IDENTITIES.length);
    for (const lang of result.languages) {
        assert.equal(lang.registered, true);
        assert.equal(typeof lang.selectable, 'boolean');
        assert.equal(typeof lang.translationSupported, 'boolean');
        assert.equal(typeof lang.translationAvailableNow, 'boolean');
    }
});

test('registration alone is never treated as translation proof', async () => {
    const { translation } = await freshEngines(); // no test provider registered
    const result = translation.getLanguageCapabilities();
    for (const lang of result.languages) {
        // No real provider registered in this scenario -> never AVAILABLE_NOW.
        assert.equal(lang.translationAvailableNow, false);
    }
});

test('a real registered provider makes selectable languages TRANSLATION_AVAILABLE_NOW', async () => {
    const { translation } = await freshEngines({ withTestProvider: true });
    const result = translation.getLanguageCapabilities();
    const selectableOnes = result.languages.filter((l) => l.selectable);
    assert.ok(selectableOnes.length > 0, 'expected at least one selectable language after seeding');
    for (const lang of selectableOnes) {
        assert.equal(lang.translationAvailableNow, true);
    }
});

test('all 17 canonical CozyLanguagePacks identities are seeded into CozyTranslate', async () => {
    const { translation } = await freshEngines({ withTestProvider: true });
    const result = translation.getLanguageCapabilities();

    const canonical = [
        'en', 'sw', 'fr', 'ar', 'so', 'ru', 'zh', 'ha', 'yo',
        'luo', 'ki', 'kam', 'zu', 'am', 'ln', 'ig', 'hi'
    ];

    for (const languageId of canonical) {
        const language = result.languages.find((l) => l.languageId === languageId);
        assert.ok(language, `${languageId} must appear as a registered identity`);
        assert.equal(language.registered, true, `${languageId} must be registered`);
        assert.equal(language.selectable, true, `${languageId} must be selectable after seeding`);
        assert.equal(language.translationAvailableNow, true, `${languageId} must be available with the real test provider`);
    }
});

test('reports UNAVAILABLE when CozyLanguagePacks is not loaded', async () => {
    await freshEngines();
    delete global.window.CozyOS.CozyLanguagePacks;
    delete require.cache[require.resolve('../church-live-translation-interaction.js')];
    require('../church-live-translation-interaction.js');
    const translation = global.window.CozyOS.ChurchLiveTranslationInteraction;
    const result = translation.getLanguageCapabilities();
    assert.equal(result.available, false);
});

/* ------------------------------------------------------------------ */
/* 3. VIEWER LANGUAGE SELECTION                                       */
/* ------------------------------------------------------------------ */

test('a real session member can select a supported language, persisted in the real LDCE participant record', async () => {
    const { ldce, translation, identity } = await freshEngines({ withTestProvider: true });
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const result = translation.selectViewerLanguage(sessionId, 'viewer-a', 'sw');
    assert.equal(result.status, 'OK');
    assert.equal(result.language, 'sw');
    const participant = ldce.getParticipant(sessionId, 'viewer-a', 'viewer-a');
    assert.equal(participant.language, 'sw');
});

test('selectViewerLanguage persists via getMyLanguage', async () => {
    const { ldce, translation, identity } = await freshEngines({ withTestProvider: true });
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    translation.selectViewerLanguage(sessionId, 'viewer-a', 'fr');
    const mine = translation.getMyLanguage(sessionId, 'viewer-a');
    assert.equal(mine.status, 'OK');
    assert.equal(mine.language, 'fr');
});

test('an unregistered language identity is rejected before ever reaching LDCE', async () => {
    const { ldce, translation, identity } = await freshEngines({ withTestProvider: true });
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const result = translation.selectViewerLanguage(sessionId, 'viewer-a', 'klingon');
    assert.equal(result.status, 'REJECTED');
    const participant = ldce.getParticipant(sessionId, 'viewer-a', 'viewer-a');
    assert.equal(participant.language, 'en'); // unchanged from join default
});

test('a seeded canonical language (Arabic) is accepted by real LDCE validation', async () => {
    const { ldce, translation, identity } = await freshEngines({ withTestProvider: true });
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const result = translation.selectViewerLanguage(sessionId, 'viewer-a', 'ar');
    assert.equal(result.status, 'OK');
    assert.equal(result.language, 'ar');
    const participant = ldce.getParticipant(sessionId, 'viewer-a', 'viewer-a');
    assert.equal(participant.language, 'ar');
});

test('a participant cannot select another participant\'s language', async () => {
    const { ldce, translation, identity } = await freshEngines({ withTestProvider: true });
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    // There is no "on behalf of" parameter at all -- selectViewerLanguage
    // only ever changes the real actor's own record. Simulate a hostile
    // caller attempting to pass someone else's id as the target by
    // reading back viewer-b's language afterward.
    translation.selectViewerLanguage(sessionId, 'viewer-a', 'sw');
    const viewerB = ldce.getParticipant(sessionId, 'viewer-b', 'viewer-b');
    assert.equal(viewerB.language, 'en'); // untouched
});

test('a non-member is rejected with NOT_AUTHORIZED', async () => {
    const { ldce, translation, identity } = await freshEngines({ withTestProvider: true });
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', []);
    identity.registerUser('outsider', {});
    const result = translation.selectViewerLanguage(sessionId, 'outsider', 'sw');
    assert.equal(result.status, 'NOT_AUTHORIZED');
});

test('an unknown session is rejected as NOT_FOUND', async () => {
    const { translation } = await freshEngines({ withTestProvider: true });
    const result = translation.selectViewerLanguage('ghost-session', 'viewer-a', 'sw');
    assert.equal(result.status, 'NOT_FOUND');
});

/* ------------------------------------------------------------------ */
/* 4. SOURCE LANGUAGE                                                 */
/* ------------------------------------------------------------------ */

test('an explicit source language is preserved, never guessed', async () => {
    const { ldce, translation, identity } = await freshEngines({ withTestProvider: true });
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', []);
    const result = await translation.startLiveTranslationSource(sessionId, 'host-1', 'host-1', { sourceLanguage: 'sw' });
    assert.equal(result.status, 'OK');
    assert.equal(result.sourceLanguage, 'sw');
});

test('missing sourceLanguage is rejected with SOURCE_LANGUAGE_DETECTION_UNAVAILABLE, never defaulted', async () => {
    const { ldce, translation, identity } = await freshEngines({ withTestProvider: true });
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', []);
    const result = await translation.startLiveTranslationSource(sessionId, 'host-1', 'host-1', {});
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.capability, 'SOURCE_LANGUAGE_DETECTION_UNAVAILABLE');
});

test('only the speaker themselves may start captioning of their own voice', async () => {
    const { ldce, translation, identity } = await freshEngines({ withTestProvider: true });
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const result = await translation.startLiveTranslationSource(sessionId, 'viewer-a', 'host-1', { sourceLanguage: 'sw' });
    assert.equal(result.status, 'NOT_AUTHORIZED');
});

/* ------------------------------------------------------------------ */
/* 5. CAPTIONS                                                        */
/* ------------------------------------------------------------------ */

test('a real caption-final event is accepted and associated with the correct session', async () => {
    const { ldce, translation, identity, asrStub } = await freshEngines({ withTestProvider: true });
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    await translation.startLiveTranslationSource(sessionId, 'host-1', 'host-1', { sourceLanguage: 'sw' });

    const received = [];
    const sub = translation.subscribeToLiveCaptions(sessionId, 'viewer-a', (evt) => received.push(evt));
    assert.equal(sub.status, 'OK');

    asrStub._emitFinal('Habari za asubuhi');
    await new Promise((r) => setTimeout(r, 0));

    const original = received.find((e) => e.type === 'original');
    assert.ok(original, 'expected an original-language relay event');
    assert.equal(original.sessionId, sessionId);
    assert.equal(original.sourceLanguage, 'sw');
    assert.equal(original.text, 'Habari za asubuhi');
    sub.unsubscribe();
});

test('session membership is enforced -- an unauthorized participant cannot obtain another session\'s caption stream', async () => {
    const { ldce, translation, identity } = await freshEngines({ withTestProvider: true });
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', []);
    identity.registerUser('outsider', {});
    const result = translation.subscribeToLiveCaptions(sessionId, 'outsider', () => {});
    assert.equal(result.status, 'NOT_AUTHORIZED');
});

/* ------------------------------------------------------------------ */
/* 6. TRANSLATION                                                     */
/* ------------------------------------------------------------------ */

test('real translation provider available -> translation path executes with distinct source/target', async () => {
    const { ldce, translation, identity, asrStub } = await freshEngines({ withTestProvider: true });
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    translation.selectViewerLanguage(sessionId, 'viewer-a', 'fr');
    await translation.startLiveTranslationSource(sessionId, 'host-1', 'host-1', { sourceLanguage: 'sw' });

    const received = [];
    translation.subscribeToLiveCaptions(sessionId, 'viewer-a', (evt) => received.push(evt));

    asrStub._emitFinal('Habari');
    await new Promise((r) => setTimeout(r, 20));

    // The real caption engine emits one caption-translated event per
    // distinct roster language (host defaults to 'en', viewer-a is
    // 'fr') -- both are legitimately produced. Filter to viewer-a's
    // own target language rather than assuming array order.
    const translated = received.find((e) => e.type === 'translated' && e.targetLanguage === 'fr');
    assert.ok(translated, 'expected a translated-caption relay event for fr');
    assert.equal(translated.translationAvailable, true);
    assert.equal(translated.text, '[fr] Habari');
});

test('live translation fans out target languages concurrently', async () => {
    const { ldce, translation, identity, asrStub } = await freshEngines({
        withTestProvider: true,
        translationDelayMs: 100
    });

    const sessionId = makeSessionWithMembers(
        ldce,
        identity,
        'host-1',
        ['viewer-a', 'viewer-b']
    );

    translation.selectViewerLanguage(sessionId, 'viewer-a', 'fr');
    translation.selectViewerLanguage(sessionId, 'viewer-b', 'ar');

    await translation.startLiveTranslationSource(
        sessionId,
        'host-1',
        'host-1',
        { sourceLanguage: 'sw' }
    );

    const receivedA = [];
    const receivedB = [];

    translation.subscribeToLiveCaptions(
        sessionId,
        'viewer-a',
        (evt) => receivedA.push(evt)
    );
    translation.subscribeToLiveCaptions(
        sessionId,
        'viewer-b',
        (evt) => receivedB.push(evt)
    );

    const startedAt = Date.now();
    asrStub._emitFinal('Habari');

    await new Promise((resolve) => setTimeout(resolve, 140));
    const elapsedMs = Date.now() - startedAt;

    const translatedA = receivedA.find(
        (e) => e.type === 'translated' && e.targetLanguage === 'fr'
    );
    const translatedB = receivedB.find(
        (e) => e.type === 'translated' && e.targetLanguage === 'ar'
    );

    assert.ok(translatedA, 'French translation should complete within the concurrent window');
    assert.ok(translatedB, 'Arabic translation should complete within the concurrent window');
    assert.equal(translatedA.text, '[fr] Habari');
    assert.equal(translatedB.text, '[ar] Habari');
    assert.ok(
        elapsedMs < 180,
        `target translations should overlap; elapsed ${elapsedMs}ms`
    );
});


test('Kiswahili source fans out through the real adapter path to all 16 other canonical targets', async () => {
    const { translate } = await freshEngines({ withTestProvider: true });

    const targets = [
        'en', 'fr', 'ar', 'so', 'ru', 'zh', 'ha', 'yo',
        'luo', 'ki', 'kam', 'zu', 'am', 'ln', 'ig', 'hi'
    ];

    assert.equal(targets.length, 16);

    for (const targetLanguage of targets) {
        const sessionId = global.window.CozyOS.SpeechTranslationAdapter
            .startTranslationSession({
                sourceLanguage: 'sw',
                targetLanguage
            });

        const result = await global.window.CozyOS.SpeechTranslationAdapter
            .translateText(
                sessionId,
                'Habari',
                {
                    sourceLanguage: 'sw',
                    targetLanguage
                }
            );

        assert.equal(
            result.isReal,
            true,
            `sw→${targetLanguage} should execute through the registered real provider`
        );
        assert.equal(
            result.translatedText,
            `[${targetLanguage}] Habari`,
            `sw→${targetLanguage} should preserve the requested target`
        );
    }

    assert.ok(
        translate.getSupportedTargetLanguages().includes('sw'),
        'Kiswahili should remain a seeded target language'
    );
});

test('provider unavailable -> honest unavailable state, no fake translated output', async () => {
    const { ldce, translation, identity, asrStub } = await freshEngines({ withTestProvider: false });
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    translation.selectViewerLanguage(sessionId, 'viewer-a', 'sw'); // 'sw' selectable even without a provider (CozyTranslate default target)
    await translation.startLiveTranslationSource(sessionId, 'host-1', 'host-1', { sourceLanguage: 'en' });

    const received = [];
    translation.subscribeToLiveCaptions(sessionId, 'viewer-a', (evt) => received.push(evt));

    asrStub._emitFinal('Good morning');
    await new Promise((r) => setTimeout(r, 20));

    const translated = received.find((e) => e.type === 'translated');
    assert.ok(translated, 'expected a translated-caption relay event even on failure');
    assert.equal(translated.translationAvailable, false);
    assert.equal(translated.text, null);
    assert.ok(translated.reason && translated.reason.length > 0);
});

test('getTranslationAvailability reports honest, forwarded capability state', async () => {
    const { ldce, translation, identity } = await freshEngines({ withTestProvider: true });
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const result = translation.getTranslationAvailability(sessionId, 'viewer-a');
    assert.equal(result.available, true);
    assert.equal(typeof result.originalCaptions.available, 'boolean');
    assert.equal(typeof result.translatedCaptions.available, 'boolean');
    assert.equal(result.translatedAudio, 'CAPABILITY_UNAVAILABLE');
    assert.equal(result.broadcast, 'CAPABILITY_UNAVAILABLE');
});

test('a non-member cannot read translation availability', async () => {
    const { ldce, translation, identity } = await freshEngines({ withTestProvider: true });
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', []);
    identity.registerUser('outsider', {});
    const result = translation.getTranslationAvailability(sessionId, 'outsider');
    assert.equal(result.available, false);
});

/* ------------------------------------------------------------------ */
/* 7. SYNCHRONIZATION / DUPLICATE HANDLING                            */
/* ------------------------------------------------------------------ */

test('duplicate identical caption-final events are relayed deterministically, never merged or fabricated', async () => {
    const { ldce, translation, identity, asrStub } = await freshEngines({ withTestProvider: true });
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    await translation.startLiveTranslationSource(sessionId, 'host-1', 'host-1', { sourceLanguage: 'en' });

    const received = [];
    translation.subscribeToLiveCaptions(sessionId, 'viewer-a', (evt) => received.push(evt));

    asrStub._emitFinal('Amen');
    asrStub._emitFinal('Amen');
    await new Promise((r) => setTimeout(r, 20));

    const originals = received.filter((e) => e.type === 'original');
    assert.equal(originals.length, 2, 'both identical finals are relayed, never silently deduplicated or merged');
    assert.notEqual(originals[0].relayId, originals[1].relayId);
});

test('each viewer receives only the translation for their own selected language', async () => {
    const { ldce, translation, identity, asrStub } = await freshEngines({ withTestProvider: true });
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);

    translation.selectViewerLanguage(sessionId, 'viewer-a', 'fr');
    translation.selectViewerLanguage(sessionId, 'viewer-b', 'ar');

    await translation.startLiveTranslationSource(sessionId, 'host-1', 'host-1', { sourceLanguage: 'sw' });

    const receivedA = [];
    const receivedB = [];

    translation.subscribeToLiveCaptions(sessionId, 'viewer-a', (evt) => receivedA.push(evt));
    translation.subscribeToLiveCaptions(sessionId, 'viewer-b', (evt) => receivedB.push(evt));

    asrStub._emitFinal('Habari');
    await new Promise((r) => setTimeout(r, 20));

    const translatedA = receivedA.filter((e) => e.type === 'translated');
    const translatedB = receivedB.filter((e) => e.type === 'translated');

    assert.equal(translatedA.length, 1, 'viewer-a should receive exactly one translated caption');
    assert.equal(translatedA[0].targetLanguage, 'fr');
    assert.equal(translatedA[0].translationAvailable, true);
    assert.equal(translatedA[0].text, '[fr] Habari');

    assert.equal(translatedB.length, 1, 'viewer-b should receive exactly one translated caption');
    assert.equal(translatedB[0].targetLanguage, 'ar');
    assert.equal(translatedB[0].translationAvailable, true);
    assert.equal(translatedB[0].text, '[ar] Habari');

    assert.equal(
        receivedA.some((e) => e.type === 'translated' && e.targetLanguage === 'ar'),
        false,
        'viewer-a must not receive viewer-b\'s Arabic translation'
    );
    assert.equal(
        receivedB.some((e) => e.type === 'translated' && e.targetLanguage === 'fr'),
        false,
        'viewer-b must not receive viewer-a\'s French translation'
    );
});

test('unsubscribe stops further relay for that subscriber', async () => {
    const { ldce, translation, identity, asrStub } = await freshEngines({ withTestProvider: true });
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    await translation.startLiveTranslationSource(sessionId, 'host-1', 'host-1', { sourceLanguage: 'en' });

    const received = [];
    const sub = translation.subscribeToLiveCaptions(sessionId, 'viewer-a', (evt) => received.push(evt));
    sub.unsubscribe();

    asrStub._emitFinal('Hello church');
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(received.length, 0);
});

/* ------------------------------------------------------------------ */
/* 8. PRIVACY                                                         */
/* ------------------------------------------------------------------ */

test('speakerUserId never leaks into the relayed caption/translation events', async () => {
    const { ldce, translation, identity, asrStub } = await freshEngines({ withTestProvider: true });
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    translation.selectViewerLanguage(sessionId, 'viewer-a', 'fr');
    await translation.startLiveTranslationSource(sessionId, 'host-1', 'host-1', { sourceLanguage: 'sw' });

    const received = [];
    translation.subscribeToLiveCaptions(sessionId, 'viewer-a', (evt) => received.push(evt));
    asrStub._emitFinal('Bwana asifiwe');
    await new Promise((r) => setTimeout(r, 20));

    for (const evt of received) {
        assert.equal('speakerUserId' in evt, false);
        assert.equal('participantId' in evt, false);
        assert.equal('userId' in evt, false);
    }
});

/* ------------------------------------------------------------------ */
/* 9. BROADCAST HONESTY                                               */
/* ------------------------------------------------------------------ */

test('PHC6 never claims unlimited broadcast or a global viewer count', async () => {
    const { translation } = await freshEngines({ withTestProvider: true });
    const caps = translation.getLanguageCapabilities();
    assert.equal(caps.broadcast, 'CAPABILITY_UNAVAILABLE');
    assert.equal(JSON.stringify(caps).toLowerCase().includes('globalviewercount'), false);
    assert.equal(JSON.stringify(caps).toLowerCase().includes('unlimitedviewers'), false);
});

/* ------------------------------------------------------------------ */
/* 10. INTEGRATION REGRESSION -- PHB/PHC MEMBERSHIP FACTS UNCHANGED    */
/* ------------------------------------------------------------------ */

test('real LDCE join/invite/language facts used by PHB/PHC checkpoints are unaffected by loading this file', async () => {
    const { ldce, identity } = await freshEngines({ withTestProvider: true });
    const created = ldce.createSession('host-1', { type: 'classroom' });
    identity.registerUser('host-1', {});
    identity.registerUser('member-1', {});
    const invite = ldce.inviteParticipant(created.sessionId, 'host-1', 'member-1');
    assert.equal(invite.success, true);
    const join = ldce.joinSession(created.sessionId, 'member-1', { language: 'sw' });
    assert.equal(join.success, true);
    assert.equal(join.language, 'sw');
});
