'use strict';

/**
 * Regression test suite for R040 Phase 2:
 *   core/modules/ChurchOS/live-language-fanout-router.js
 *   core/modules/ChurchOS/live-translation-result-cache.js
 *   core/modules/ChurchOS/live-viewer-telemetry.js
 *   core/shell/live/cozy-live-distribution-transport.js
 *
 * HARNESS DISCLOSURE
 *   Same harness pattern as live-church-language-orchestrator.test.js
 *   (read in full before writing this suite; reused deliberately for
 *   consistency, not duplicated by accident).
 *   REAL, unmodified production code under test: LDCESessionEngine,
 *   SpeechTranslationAdapter, SpeechTranslationProviders, CozyTranslate,
 *   CozyLanguagePacks, PlatformEventBus, LiveChurchLanguageOrchestrator
 *   (Phase 1, untouched), and all four Phase 2 files listed above.
 *   STUBBED, disclosed: IdentityEngine, CozyConversation, VoiceManager —
 *   identical stubs to the Phase 1 suite, for the identical reason
 *   (LDCE's real requirement; VoiceManager is a genuine browser/native
 *   chain LivingTTS composes and cannot be exercised in Node).
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
    return {
        registerUser(userId, { orgId = null, country = null } = {}) { users.set(userId, { orgId, country }); },
        setPlatformAdmin() {},
        isPlatformAdmin() { return false; },
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

function makeStubVoiceManager({ available = true } = {}) {
    const spoken = [];
    return {
        _spoken: spoken,
        async speak({ text, context, providerId } = {}) {
            if (!available) return { available: false, played: false, providerId: null, reason: 'Stub VoiceManager reports unavailable for this test.' };
            spoken.push({ text, context, providerId });
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
    '../live-translation-result-cache.js',
    '../live-viewer-telemetry.js',
    '../../../shell/live/cozy-live-distribution-transport.js',
    '../live-language-fanout-router.js',
];

let translationCallCount = 0;

async function freshEngines({ translationDelayMs = 0 } = {}) {
    translationCallCount = 0;
    for (const p of PRODUCTION_FILES) {
        delete require.cache[require.resolve(p)];
    }
    const identity = makeStubIdentity();
    const voiceManager = makeStubVoiceManager();
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
    require('../live-translation-result-cache.js');
    require('../live-viewer-telemetry.js');
    require('../../../shell/live/cozy-live-distribution-transport.js');
    require('../live-language-fanout-router.js');

    global.window.CozyOS.SpeechTranslationProviders.register({
        name: 'test-disclosed-provider',
        type: 'offline',
        supportsOffline: true,
        async translate(text, { sourceLanguage, targetLanguage }) {
            translationCallCount += 1;
            if (translationDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, translationDelayMs));
            return { translatedText: `[${targetLanguage}] ${text}`, isReal: true };
        }
    });

    await global.window.CozyOS.SpeechTranslationAdapter.init();
    global.window.CozyOS.CozyLiveDistributionTransport._resetForTests();

    return {
        ldce: global.window.CozyOS.LDCESessionEngine,
        orchestrator: global.window.CozyOS.LiveChurchLanguageOrchestrator,
        router: global.window.CozyOS.LiveLanguageFanoutRouter,
        cache: global.window.CozyOS.LiveTranslationResultCache,
        telemetry: global.window.CozyOS.LiveViewerTelemetry,
        transport: global.window.CozyOS.CozyLiveDistributionTransport,
        packs: global.window.CozyOS.CozyLanguagePacks,
        bus: global.window.CozyOS.PlatformEventBus,
        identity,
    };
}

function makeSessionWithMembers(ldce, identity, hostId, memberDefs) {
    // memberDefs: [{ id, language }]
    identity.registerUser(hostId, {});
    const created = ldce.createSession(hostId, { type: 'classroom' });
    for (const { id, language } of memberDefs) {
        identity.registerUser(id, {});
        const invite = ldce.inviteParticipant(created.sessionId, hostId, id);
        assert.equal(invite.success, true, `invite for ${id} should succeed: ${invite.reason}`);
        const join = ldce.joinSession(created.sessionId, id, { language });
        assert.equal(join.success, true, `join for ${id} should succeed: ${join.reason}`);
    }
    return created.sessionId;
}

function getTranslationCallCount() { return translationCallCount; }

/* ------------------------------------------------------------------ */
/* A. MODULE REGISTRATION                                             */
/* ------------------------------------------------------------------ */

test('all four Phase 2 modules register version and Modules registry entries', async () => {
    const { router, cache, telemetry, transport } = await freshEngines();
    assert.equal(router.getVersion(), '1.0.0');
    assert.equal(cache.getVersion(), '1.0.0');
    assert.equal(telemetry.getVersion(), '1.0.0');
    assert.equal(transport.getVersion(), '1.0.0');
    assert.equal(global.window.CozyOS.Modules['live-language-fanout-router'].version, '1.0.0');
    assert.equal(global.window.CozyOS.Modules['live-translation-result-cache'].version, '1.0.0');
    assert.equal(global.window.CozyOS.Modules['live-viewer-telemetry'].version, '1.0.0');
    assert.equal(global.window.CozyOS.Modules['cozy-live-distribution-transport'].version, '1.0.0');
});

/* ------------------------------------------------------------------ */
/* B. MULTI-VIEWER FAN-OUT, DIFFERENT LANGUAGES                       */
/* ------------------------------------------------------------------ */

test('two viewers with different languages both receive correct independent output from ONE publishSegment() call', async () => {
    const { ldce, identity, router, transport } = await freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'pastor', [
        { id: 'viewerA', language: 'sw' },
        { id: 'viewerB', language: 'en' },
    ]);
    router.joinViewer(sessionId, 'viewerA');
    router.joinViewer(sessionId, 'viewerB');

    const deliveries = [];
    global.window.CozyOS.PlatformEventBus.on('live-language:delivery', (d) => deliveries.push(d));

    const report = await router.publishSegment(sessionId, { segmentId: 'seg-1', sourceLanguage: 'sw', sourceText: 'Habari' });

    assert.equal(report.groups.length, 2, 'exactly two language groups: sw and en');
    const swDelivery = deliveries.find((d) => d.viewerId === 'viewerA');
    const enDelivery = deliveries.find((d) => d.viewerId === 'viewerB');
    assert.equal(swDelivery.mode, 'ORIGINAL');
    assert.equal(swDelivery.outputText, 'Habari');
    assert.equal(enDelivery.mode, 'TRANSLATE');
    assert.equal(enDelivery.outputText, '[en] Habari');
});

test('17 viewers selecting 17 different languages each get correct independent output', async () => {
    const { ldce, identity, packs, router } = await freshEngines();
    const languages = packs.DEFAULT_IDENTITIES.map((d) => d.languageId);
    assert.equal(languages.length, 17);
    const members = languages.map((lang, i) => ({ id: `viewer${i}`, language: lang }));
    const sessionId = makeSessionWithMembers(ldce, identity, 'pastor', members);
    for (const m of members) router.joinViewer(sessionId, m.id);

    const deliveries = [];
    global.window.CozyOS.PlatformEventBus.on('live-language:delivery', (d) => deliveries.push(d));

    const sourceLanguage = languages[0];
    const report = await router.publishSegment(sessionId, { segmentId: 'seg-17', sourceLanguage, sourceText: 'Test' });

    assert.equal(report.groups.length, 17, 'one group per distinct viewer language');
    assert.equal(deliveries.length, 17, 'exactly one delivery event per viewer');
    for (const m of members) {
        const d = deliveries.find((x) => x.viewerId === m.id);
        assert.ok(d, `viewer ${m.id} should have received a delivery`);
        if (m.language === sourceLanguage) {
            assert.equal(d.mode, 'ORIGINAL');
        } else {
            assert.equal(d.mode, 'TRANSLATE');
            assert.equal(d.outputText, `[${m.language}] Test`);
        }
    }
});

test('changing one viewer language does not affect another viewer', async () => {
    const { ldce, identity, router } = await freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'pastor', [
        { id: 'viewerA', language: 'en' },
        { id: 'viewerB', language: 'fr' },
    ]);
    router.joinViewer(sessionId, 'viewerA');
    router.joinViewer(sessionId, 'viewerB');

    router.changeViewerLanguage(sessionId, 'viewerA', 'ar');

    const deliveries = [];
    global.window.CozyOS.PlatformEventBus.on('live-language:delivery', (d) => deliveries.push(d));
    await router.publishSegment(sessionId, { segmentId: 'seg-2', sourceLanguage: 'sw', sourceText: 'x' });

    const a = deliveries.find((d) => d.viewerId === 'viewerA');
    const b = deliveries.find((d) => d.viewerId === 'viewerB');
    assert.equal(a.language, 'ar');
    assert.equal(b.language, 'fr', 'viewerB must be unaffected by viewerA changing language');
});

/* ------------------------------------------------------------------ */
/* C. TRANSLATION RESULT REUSE (CACHE)                                */
/* ------------------------------------------------------------------ */

test('500 viewers selecting the same target language produce exactly ONE real translation call', async () => {
    const { ldce, identity, router } = await freshEngines();
    const members = [];
    for (let i = 0; i < 500; i++) members.push({ id: `viewer${i}`, language: 'en' });
    const sessionId = makeSessionWithMembers(ldce, identity, 'pastor', members);
    for (const m of members) router.joinViewer(sessionId, m.id);

    const deliveries = [];
    global.window.CozyOS.PlatformEventBus.on('live-language:delivery', (d) => deliveries.push(d));

    await router.publishSegment(sessionId, { segmentId: 'seg-500', sourceLanguage: 'sw', sourceText: 'Bwana asifiwe' });

    assert.equal(getTranslationCallCount(), 1, 'exactly one real NLLB-provider translation call for 500 same-language viewers');
    assert.equal(deliveries.length, 500, 'all 500 viewers still receive a delivery event');
    for (const d of deliveries) assert.equal(d.outputText, '[en] Bwana asifiwe');
});

test('a second publishSegment() for a DIFFERENT segment does NOT reuse the first segment\'s cache entry', async () => {
    const { ldce, identity, router } = await freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'pastor', [{ id: 'viewerA', language: 'en' }]);
    router.joinViewer(sessionId, 'viewerA');

    await router.publishSegment(sessionId, { segmentId: 'seg-A', sourceLanguage: 'sw', sourceText: 'one' });
    await router.publishSegment(sessionId, { segmentId: 'seg-B', sourceLanguage: 'sw', sourceText: 'two' });

    assert.equal(getTranslationCallCount(), 2, 'two distinct segments must each trigger their own real translation, never merged by text');
});

test('cache-hit and cache-miss events fire correctly', async () => {
    const { ldce, identity, router, bus } = await freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'pastor', [
        { id: 'viewerA', language: 'en' },
        { id: 'viewerB', language: 'en' },
    ]);
    router.joinViewer(sessionId, 'viewerA');

    const hits = [];
    const misses = [];
    bus.on('live-language:cache-hit', (d) => hits.push(d));
    bus.on('live-language:cache-miss', (d) => misses.push(d));

    await router.publishSegment(sessionId, { segmentId: 'seg-cache', sourceLanguage: 'sw', sourceText: 'x' });
    router.joinViewer(sessionId, 'viewerB');
    await router.publishSegment(sessionId, { segmentId: 'seg-cache', sourceLanguage: 'sw', sourceText: 'x' });

    // First call: 1 group (en) -> miss. Second call: same segmentId -> hit.
    assert.equal(misses.length, 1);
    assert.equal(hits.length, 1);
});

test('Kiswahili source, Kiswahili viewers among a mixed group produce ZERO translations for that group (original shared)', async () => {
    const { ldce, identity, router } = await freshEngines();
    const members = [];
    for (let i = 0; i < 200; i++) members.push({ id: `sw_viewer${i}`, language: 'sw' });
    members.push({ id: 'en_viewer', language: 'en' });
    const sessionId = makeSessionWithMembers(ldce, identity, 'pastor', members);
    for (const m of members) router.joinViewer(sessionId, m.id);

    const deliveries = [];
    global.window.CozyOS.PlatformEventBus.on('live-language:delivery', (d) => deliveries.push(d));
    await router.publishSegment(sessionId, { segmentId: 'seg-mixed', sourceLanguage: 'sw', sourceText: 'Amina' });

    assert.equal(getTranslationCallCount(), 1, 'only the en group triggers a real translation; the 200 sw viewers get passthrough with zero translation calls');
    const swDeliveries = deliveries.filter((d) => d.language === 'sw');
    assert.equal(swDeliveries.length, 200);
    for (const d of swDeliveries) { assert.equal(d.mode, 'ORIGINAL'); assert.equal(d.outputText, 'Amina'); }
});

/* ------------------------------------------------------------------ */
/* D. ONE VIEWER FAILURE DOES NOT TERMINATE OTHERS                    */
/* ------------------------------------------------------------------ */

test('a translation failure for one language group does not prevent delivery to other language groups', async () => {
    const { ldce, identity, router } = await freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'pastor', [
        { id: 'viewerGood', language: 'en' },
        { id: 'viewerBad', language: 'fr' },
    ]);
    router.joinViewer(sessionId, 'viewerGood');
    router.joinViewer(sessionId, 'viewerBad');

    // Force the French route to fail honestly via the real provider extension
    // point (SpeechTranslationProviders.register()) rather than monkeypatching
    // a frozen production object: register a second real provider whose
    // translate() genuinely throws for fr, and remove the always-succeeding
    // 'test-disclosed-provider' registration's guarantee by making THIS
    // provider the one CozyTranslate's real dispatch selects for fr. Simplest
    // honest approach: reconfigure the existing test provider itself so calls
    // targeting fr genuinely reject, since it is this suite's own registered
    // provider (not a frozen production file) and this is exactly the
    // provider extension point real providers use.
    const providers = global.window.CozyOS.SpeechTranslationProviders;
    providers.register({
        name: 'test-disclosed-provider',
        type: 'offline',
        supportsOffline: true,
        async translate(text, { sourceLanguage, targetLanguage }) {
            if (targetLanguage === 'fr') throw new Error('Simulated translation failure for fr.');
            return { translatedText: `[${targetLanguage}] ${text}`, isReal: true };
        }
    });

    const deliveries = [];
    const errors = [];
    global.window.CozyOS.PlatformEventBus.on('live-language:delivery', (d) => deliveries.push(d));
    global.window.CozyOS.PlatformEventBus.on('live-language:error', (d) => errors.push(d));

    const report = await router.publishSegment(sessionId, { segmentId: 'seg-fail', sourceLanguage: 'sw', sourceText: 'x' });

    const enDelivered = deliveries.some((d) => d.viewerId === 'viewerGood');
    assert.equal(enDelivered, true, 'the en viewer must still receive delivery despite the fr group failing');
    const frGroup = report.groups.find((g) => g.language === 'fr');
    assert.equal(frGroup.result.translationStatus, 'failed');
    assert.equal(frGroup.result.isReal, false);
});

/* ------------------------------------------------------------------ */
/* E. VIEWER TELEMETRY                                                */
/* ------------------------------------------------------------------ */

test('LiveViewerTelemetry records delivered segment id per viewer and auto-removes on LDCE participant-left', async () => {
    const { ldce, identity, router, telemetry } = await freshEngines();
    telemetry.attach();
    const sessionId = makeSessionWithMembers(ldce, identity, 'pastor', [{ id: 'viewerA', language: 'en' }]);
    router.joinViewer(sessionId, 'viewerA');

    await router.publishSegment(sessionId, { segmentId: 'seg-t1', sourceLanguage: 'sw', sourceText: 'hi' });
    const rec = telemetry.getViewer(sessionId, 'viewerA');
    assert.equal(rec.lastSegmentId, 'seg-t1');

    ldce.leaveSession(sessionId, 'viewerA');
    const after = telemetry.getViewer(sessionId, 'viewerA');
    assert.equal(after, null, 'telemetry record must be removed automatically after LDCE participant-left');
    telemetry.detach();
});

/* ------------------------------------------------------------------ */
/* F. DISTRIBUTION TRANSPORT                                          */
/* ------------------------------------------------------------------ */

test('distribution transport getCapabilityReport() never fabricates internet-scale SFU availability', async () => {
    const { transport } = await freshEngines();
    const report = transport.getCapabilityReport();
    assert.equal(report.INTERNET_SCALE_SFU_DEPLOYED, false);
    assert.equal(report.LOCAL_INPROCESS_DISTRIBUTION_AVAILABLE, true);
    assert.equal(report.MULTI_VIEWER_FANOUT_AVAILABLE, true);
});

test('viewer connection state transitions to degraded/reconnecting/connected are real and honest', async () => {
    const { transport } = await freshEngines();
    transport.joinViewer('sess-1', 'viewerX');
    assert.equal(transport.getConnectionState('sess-1', 'viewerX'), 'connected');
    transport.markDegraded('sess-1', 'viewerX');
    assert.equal(transport.getConnectionState('sess-1', 'viewerX'), 'degraded');
    transport.markReconnecting('sess-1', 'viewerX');
    assert.equal(transport.getConnectionState('sess-1', 'viewerX'), 'reconnecting');
    const hb = transport.heartbeat('sess-1', 'viewerX');
    assert.equal(hb.success, true);
    assert.equal(transport.getConnectionState('sess-1', 'viewerX'), 'connected', 'a real heartbeat after reconnecting must recover the connection state');
});

test('leaveViewer() genuinely removes the viewer from the transport roster', async () => {
    const { transport } = await freshEngines();
    transport.joinViewer('sess-1', 'viewerY');
    assert.deepEqual(transport.listViewers('sess-1'), ['viewerY']);
    transport.leaveViewer('sess-1', 'viewerY');
    assert.deepEqual(transport.listViewers('sess-1'), []);
});
