'use strict';

/**
 * Regression test suite for
 * core/modules/ChurchOS/live-church-language-orchestrator.js (R040 Phase 1).
 *
 * HARNESS DISCLOSURE (read before trusting these numbers):
 *   REAL, unmodified-by-this-suite production code under test: the real
 *   ldce-session-engine.js, speech-translation-adapter.js,
 *   speech-translation-provider.js, cozy-translate.js,
 *   cozy-language-pack-registry.js, platform-event-bus.js, and this
 *   checkpoint's live-church-language-orchestrator.js.
 *
 *   STUBBED, and disclosed as a stub, not a real production file:
 *     - IdentityEngine / CozyConversation: identical minimal stubs
 *       reused from church-live-translation-interaction.test.js's own
 *       disclosed pattern (LDCE's own real requirement).
 *     - VoiceManager: LivingTTS (the real production file, NOT stubbed)
 *       composes window.CozyOS.VoiceManager.speak() as its documented
 *       public contract. VoiceManager itself is a genuine browser/native
 *       voice-provider chain this suite cannot exercise in Node, so it
 *       is stubbed here at exactly that documented speak() contract —
 *       LivingTTS's own real speak-start/speak-success/speak-unavailable
 *       classification logic is NOT stubbed.
 *     - Translation provider: a disclosed, explicit test provider
 *       registered through SpeechTranslationProviders' own real,
 *       public register() API (same extension point a real cloud/
 *       offline provider — including the real nllb-bridge provider —
 *       would use). Never bypasses SpeechTranslationProviders,
 *       SpeechTranslationAdapter, CozyTranslate, or the orchestrator.
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

/** Disclosed stub — VoiceManager's documented speak() contract only. */
function makeStubVoiceManager({ available = true } = {}) {
    const spoken = [];
    return {
        _spoken: spoken,
        async speak({ text, context, providerId, settingsId } = {}) {
            if (!available) return { available: false, played: false, providerId: null, reason: 'Stub VoiceManager reports unavailable for this test.' };
            spoken.push({ text, context, providerId, settingsId });
            return { available: true, played: true, providerId: providerId || 'stub-provider' };
        },
        getDefaultVoice() { return 'stub-provider'; },
        getLastSpokenProviderId() { return spoken.length ? spoken[spoken.length - 1].providerId || 'stub-provider' : null; },
        listProviders() { return [{ providerId: 'stub-provider', status: 'ready', capabilities: {} }]; },
        listContexts() { return []; },
    };
}

const PRODUCTION_FILES = [
    '../../translate/cozy-translate.js',
    '../../speech/adapters/speech-translation-provider.js',
    '../../speech/adapters/speech-translation-adapter.js',
    '../../communication/ldce-session-engine.js',
    '../../intelligence/language-packs/cozy-language-pack-registry.js',
    '../../../shell/platform-event-bus.js',
    '../../../living/living-tts.js',
    '../live-church-language-orchestrator.js',
];

async function freshEngines({ withTestProvider = true, translationDelayMs = 0, voiceManagerAvailable = true } = {}) {
    for (const p of PRODUCTION_FILES) {
        delete require.cache[require.resolve(p)];
    }
    const identity = makeStubIdentity();
    const voiceManager = makeStubVoiceManager({ available: voiceManagerAvailable });
    global.window = {
        CozyOS: {
            CozyConversation: makeStubConversation(),
            IdentityEngine: identity,
            VoiceManager: voiceManager,
        }
    };

    require('../../../shell/platform-event-bus.js');
    require('../../translate/cozy-translate.js');
    require('../../speech/adapters/speech-translation-provider.js');
    require('../../speech/adapters/speech-translation-adapter.js');
    require('../../communication/ldce-session-engine.js');
    require('../../intelligence/language-packs/cozy-language-pack-registry.js');
    require('../../../living/living-tts.js');
    require('../live-church-language-orchestrator.js');

    if (withTestProvider) {
        global.window.CozyOS.SpeechTranslationProviders.register({
            name: 'test-disclosed-provider',
            type: 'offline',
            supportsOffline: true,
            async translate(text, { sourceLanguage, targetLanguage }) {
                if (translationDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, translationDelayMs));
                return { translatedText: `[${targetLanguage}] ${text}`, isReal: true };
            }
        });
    }

    await global.window.CozyOS.SpeechTranslationAdapter.init();

    return {
        ldce: global.window.CozyOS.LDCESessionEngine,
        orchestrator: global.window.CozyOS.LiveChurchLanguageOrchestrator,
        translate: global.window.CozyOS.CozyTranslate,
        providers: global.window.CozyOS.SpeechTranslationProviders,
        packs: global.window.CozyOS.CozyLanguagePacks,
        bus: global.window.CozyOS.PlatformEventBus,
        tts: global.window.CozyOS.LivingTTS,
        voiceManager,
        identity,
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
/* A. MODULE REGISTRATION                                             */
/* ------------------------------------------------------------------ */

test('module registers version and Modules registry entry', async () => {
    const { orchestrator } = await freshEngines();
    assert.equal(orchestrator.getVersion(), '1.0.0');
    assert.equal(global.window.CozyOS.Modules['live-church-language-orchestrator'].version, '1.0.0');
});

/* ------------------------------------------------------------------ */
/* B. 17-LANGUAGE REGISTRY INTEGRATION                                */
/* ------------------------------------------------------------------ */

test('getCanonicalLanguages() reads the real 17-identity registry, never a second list', async () => {
    const { orchestrator, packs } = await freshEngines();
    const { languages } = orchestrator.getCanonicalLanguages();
    assert.equal(languages.length, 17);
    assert.deepEqual(languages.sort(), packs.DEFAULT_IDENTITIES.map((d) => d.languageId).sort());
});

test('getCanonicalLanguages() fails closed (empty + reason) if CozyLanguagePacks is not loaded', async () => {
    const { orchestrator } = await freshEngines();
    delete global.window.CozyOS.CozyLanguagePacks;
    const result = orchestrator.getCanonicalLanguages();
    assert.deepEqual(result.languages, []);
    assert.ok(result.reason);
});

test('every one of the 17 canonical languages self-passthroughs with zero translation calls', async () => {
    const { orchestrator, packs } = await freshEngines();
    let translationStarts = 0;
    const off = orchestrator && global.window.CozyOS.PlatformEventBus.on('live-language:translation-start', () => { translationStarts++; });
    for (const identity of packs.DEFAULT_IDENTITIES) {
        const lang = identity.languageId;
        const result = await orchestrator.routeSegment(
            { segmentId: `seg-${lang}`, sourceLanguage: lang, sourceText: `hello in ${lang}` },
            lang
        );
        assert.equal(result.mode, 'ORIGINAL');
        assert.equal(result.isReal, true);
        assert.equal(result.outputText, `hello in ${lang}`);
        assert.equal(result.translationStatus, 'bypassed');
        assert.equal(result.translationReason, 'same_language_passthrough');
        assert.equal(result.timestamps.translationStartedAt, null);
    }
    assert.equal(translationStarts, 0, 'no self-passthrough segment should ever start a translation.');
    off();
});

/* ------------------------------------------------------------------ */
/* C. KISWAHILI NATIVE PASSTHROUGH (CRITICAL RULE)                    */
/* ------------------------------------------------------------------ */

test('Kiswahili source + Kiswahili viewer: original Kiswahili, no translation provider called', async () => {
    const { orchestrator, providers } = await freshEngines({ withTestProvider: false });
    let providerCalled = false;
    providers.register({
        name: 'call-counting-provider', type: 'offline', supportsOffline: true,
        async translate(text, { targetLanguage }) { providerCalled = true; return { translatedText: `[${targetLanguage}] ${text}`, isReal: true }; }
    });

    const result = await orchestrator.routeSegment(
        { segmentId: 'sw-sw-1', sourceLanguage: 'sw', sourceText: 'Bwana asifiwe' },
        'sw'
    );

    assert.equal(result.mode, 'ORIGINAL');
    assert.equal(result.outputText, 'Bwana asifiwe');
    assert.equal(result.targetLanguage, 'sw');
    assert.equal(providerCalled, false, 'no NLLB/provider translation should ever be performed for sw->sw.');
});

test('Kiswahili source -> English viewer: real STT->translate->output path is exercised', async () => {
    const { orchestrator } = await freshEngines();
    const result = await orchestrator.routeSegment(
        { segmentId: 'sw-en-1', sourceLanguage: 'sw', sourceText: 'Bwana asifiwe' },
        'en'
    );
    assert.equal(result.mode, 'TRANSLATE');
    assert.equal(result.isReal, true);
    assert.equal(result.outputText, '[en] Bwana asifiwe');
    assert.ok(result.timestamps.translationStartedAt !== null);
});

/* ------------------------------------------------------------------ */
/* D. NO SELF-TRANSLATION / REPRESENTATIVE CROSS-LANGUAGE PAIRS       */
/* ------------------------------------------------------------------ */

test('the router never translates a language into itself, for every canonical language', async () => {
    const { orchestrator, packs } = await freshEngines();
    for (const identity of packs.DEFAULT_IDENTITIES) {
        const lang = identity.languageId;
        const result = await orchestrator.routeSegment({ segmentId: `noself-${lang}`, sourceLanguage: lang, sourceText: 'x' }, lang);
        assert.equal(result.mode, 'ORIGINAL');
    }
});

test('representative cross-language pairs (ar, ru, zh as targets) translate correctly', async () => {
    const { orchestrator } = await freshEngines();
    for (const target of ['ar', 'ru', 'zh']) {
        const result = await orchestrator.routeSegment({ segmentId: `sw-${target}`, sourceLanguage: 'sw', sourceText: 'habari' }, target);
        assert.equal(result.mode, 'TRANSLATE');
        assert.equal(result.isReal, true);
        assert.equal(result.outputText, `[${target}] habari`);
    }
});

/* ------------------------------------------------------------------ */
/* E. 15-vs-17 LANGUAGE GAP                                            */
/* ------------------------------------------------------------------ */

test('SpeechTranslationAdapter seeds from the canonical registry, not a hardcoded duplicate list', async () => {
    const { packs } = await freshEngines();
    const report = global.window.CozyOS.SpeechTranslationAdapter.getSeedLanguageReport();
    assert.equal(report.usedFallback, false);
    assert.equal(report.source, 'CozyLanguagePacks.DEFAULT_IDENTITIES');
    const canonical = packs.DEFAULT_IDENTITIES.map((d) => d.languageId);
    for (const code of canonical) assert.ok(report.codes.includes(code), `seed languages missing canonical code "${code}"`);
    // The three previously-flagged codes are present.
    for (const code of ['ar', 'ru', 'zh']) assert.ok(report.codes.includes(code));
});

test('SpeechTranslationAdapter falls back honestly (with a disclosed reason) if CozyLanguagePacks is missing at seed time', async () => {
    for (const p of PRODUCTION_FILES) delete require.cache[require.resolve(p)];
    global.window = { CozyOS: { CozyConversation: makeStubConversation(), IdentityEngine: makeStubIdentity() } };
    require('../../../shell/platform-event-bus.js');
    require('../../translate/cozy-translate.js');
    require('../../speech/adapters/speech-translation-provider.js');
    require('../../speech/adapters/speech-translation-adapter.js');
    // Note: cozy-language-pack-registry.js deliberately NOT required here.
    await global.window.CozyOS.SpeechTranslationAdapter.init();
    const report = global.window.CozyOS.SpeechTranslationAdapter.getSeedLanguageReport();
    assert.equal(report.usedFallback, true);
    assert.ok(report.codes.includes('ar') && report.codes.includes('ru') && report.codes.includes('zh'));
});

/* ------------------------------------------------------------------ */
/* F. LATENCY INSTRUMENTATION (REAL, NEVER FABRICATED)                */
/* ------------------------------------------------------------------ */

test('latency is measured with real elapsed time for a translated segment', async () => {
    const { orchestrator } = await freshEngines({ translationDelayMs: 15 });
    const result = await orchestrator.routeSegment({ segmentId: 'lat-1', sourceLanguage: 'sw', sourceText: 'x' }, 'en');
    assert.equal(result.latency.translationStage.status, 'measured');
    assert.ok(typeof result.latency.sttToTranslationMs === 'number' && result.latency.sttToTranslationMs >= 10, `expected >=10ms measured delay, got ${result.latency.sttToTranslationMs}`);
});

test('bypassed stages are reported honestly, never as a fabricated 0ms/measured duration', async () => {
    const { orchestrator } = await freshEngines();
    const result = await orchestrator.routeSegment({ segmentId: 'lat-2', sourceLanguage: 'sw', sourceText: 'x' }, 'sw');
    assert.deepEqual(result.latency.translationStage, { status: 'bypassed', reason: 'same_language_passthrough' });
    assert.equal(result.latency.sttToTranslationMs, null);
    assert.deepEqual(result.latency.ttsStage, { status: 'bypassed', reason: 'tts_not_requested_or_no_output' });
});

test('getSegmentReport() returns the same real record routeSegment() produced', async () => {
    const { orchestrator } = await freshEngines();
    const result = await orchestrator.routeSegment({ segmentId: 'lat-3', sourceLanguage: 'sw', sourceText: 'x' }, 'en');
    const report = orchestrator.getSegmentReport('lat-3');
    assert.equal(report.outputText, result.outputText);
    assert.equal(report.latency.totalPipelineMs, result.latency.totalPipelineMs);
});

/* ------------------------------------------------------------------ */
/* G. LIVING TTS INTEGRATION                                          */
/* ------------------------------------------------------------------ */

test('requestTTS routes the correct-language text through the real LivingTTS facade', async () => {
    const { orchestrator, voiceManager } = await freshEngines();
    const result = await orchestrator.routeSegment({ segmentId: 'tts-1', sourceLanguage: 'sw', sourceText: 'habari' }, 'fr', { requestTTS: true });
    assert.equal(result.tts.played, true);
    assert.equal(voiceManager._spoken.length, 1);
    assert.equal(voiceManager._spoken[0].text, '[fr] habari');
});

test('sw->sw with requestTTS speaks the original Kiswahili text, never a translated round-trip', async () => {
    const { orchestrator, voiceManager } = await freshEngines();
    const result = await orchestrator.routeSegment({ segmentId: 'tts-2', sourceLanguage: 'sw', sourceText: 'habari' }, 'sw', { requestTTS: true });
    assert.equal(result.tts.played, true);
    assert.equal(voiceManager._spoken[0].text, 'habari');
});

test('TTS failure is reported honestly and does not throw or corrupt the segment result', async () => {
    const { orchestrator } = await freshEngines({ voiceManagerAvailable: false });
    const result = await orchestrator.routeSegment({ segmentId: 'tts-3', sourceLanguage: 'sw', sourceText: 'habari' }, 'sw', { requestTTS: true });
    assert.equal(result.tts.played, false);
    assert.equal(result.outputText, 'habari');
});

/* ------------------------------------------------------------------ */
/* H. LANGUAGE SWITCHING WHILE LIVE (NO RESTART)                      */
/* ------------------------------------------------------------------ */

test('a viewer changing language mid-session is picked up from the next segment, no restart needed', async () => {
    const { orchestrator, ldce, identity } = await freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'pastor-1', ['viewer-1']);
    ldce.joinSession(sessionId, 'pastor-1', { language: 'sw' });

    let lang = orchestrator.getViewerLanguage(sessionId, 'viewer-1');
    let result = await orchestrator.routeSegment({ segmentId: 'switch-1', sessionId, sourceLanguage: 'sw', sourceText: 'habari 1' }, lang);
    assert.equal(result.mode, 'TRANSLATE'); // viewer joined with default 'en'

    const switched = orchestrator.setViewerLanguage(sessionId, 'viewer-1', 'sw');
    assert.equal(switched.success, true);

    lang = orchestrator.getViewerLanguage(sessionId, 'viewer-1');
    result = await orchestrator.routeSegment({ segmentId: 'switch-2', sessionId, sourceLanguage: 'sw', sourceText: 'habari 2' }, lang);
    assert.equal(result.mode, 'ORIGINAL');
    assert.equal(result.outputText, 'habari 2');
});

/* ------------------------------------------------------------------ */
/* I. FAILURE ISOLATION                                               */
/* ------------------------------------------------------------------ */

test('a translation failure for one viewer language does not affect another', async () => {
    const { orchestrator, providers } = await freshEngines();
    providers.unregister('test-disclosed-provider');
    const failed = await orchestrator.routeSegment({ segmentId: 'fail-1', sourceLanguage: 'sw', sourceText: 'x' }, 'en');
    assert.equal(failed.isReal, false);
    assert.equal(failed.translationStatus, 'failed');

    providers.register({
        name: 'test-disclosed-provider', type: 'offline', supportsOffline: true,
        async translate(text, { targetLanguage }) { return { translatedText: `[${targetLanguage}] ${text}`, isReal: true }; }
    });
    const ok = await orchestrator.routeSegment({ segmentId: 'fail-2', sourceLanguage: 'sw', sourceText: 'x' }, 'fr');
    assert.equal(ok.isReal, true);
});

/* ------------------------------------------------------------------ */
/* J. PLATFORM EVENT BUS INTEGRATION                                  */
/* ------------------------------------------------------------------ */

test('PlatformEventBus receives segment-captured, translation-start/complete, and latency events', async () => {
    const { orchestrator, bus } = await freshEngines();
    const seen = [];
    const offs = ['segment-captured', 'translation-start', 'translation-complete', 'latency'].map((e) =>
        bus.on(`live-language:${e}`, (d) => seen.push({ e, d }))
    );
    await orchestrator.routeSegment({ segmentId: 'evt-1', sourceLanguage: 'sw', sourceText: 'x' }, 'en');
    offs.forEach((off) => off());
    assert.deepEqual(seen.map((s) => s.e), ['segment-captured', 'translation-start', 'translation-complete', 'latency']);
});

test('PlatformEventBus receives a passthrough event (not translation-start) for sw->sw', async () => {
    const { orchestrator, bus } = await freshEngines();
    const seen = [];
    const off1 = bus.on('live-language:passthrough', (d) => seen.push(d));
    const off2 = bus.on('live-language:translation-start', () => { throw new Error('translation-start must not fire for a passthrough segment.'); });
    await orchestrator.routeSegment({ segmentId: 'evt-2', sourceLanguage: 'sw', sourceText: 'x' }, 'sw');
    off1(); off2();
    assert.equal(seen.length, 1);
    assert.equal(seen[0].language, 'sw');
});

/* ------------------------------------------------------------------ */
/* K. CAPABILITY REPORTING (HONEST, NEVER COLLAPSED)                  */
/* ------------------------------------------------------------------ */

test('getCapabilityReport() keeps LANGUAGE_REGISTERED and TRANSLATION_AVAILABLE_NOW as separate facts', async () => {
    const { orchestrator } = await freshEngines({ withTestProvider: false });
    const report = orchestrator.getCapabilityReport('sw');
    assert.equal(report.LANGUAGE_REGISTERED, true);
    assert.equal(report.TRANSLATION_AVAILABLE_NOW, false); // no provider registered in this scenario
    assert.equal(report.PASSTHROUGH_AVAILABLE, true); // same-language routing never needs a provider
});

test('getNetworkCapabilityReport() reports four distinct facts, never one collapsed boolean', async () => {
    const { orchestrator } = await freshEngines();
    const report = orchestrator.getNetworkCapabilityReport();
    assert.equal(report.NETWORK_REQUIRED_FOR_SOURCE, true);
    assert.equal(typeof report.NETWORK_REQUIRED_FOR_VIEWER === 'boolean' || report.NETWORK_REQUIRED_FOR_VIEWER === 'UNKNOWN_NO_PROVIDER_REGISTERED', true);
    assert.equal(report.TRANSLATION_OFFLINE_AVAILABLE, true); // the disclosed test provider declares supportsOffline:true
});
