'use strict';

/**
 * core/modules/ChurchOS/test/live-language-fanout-router-remote-delivery.test.js
 * R040 Phase 3E — proves the REAL production call site
 * (LiveLanguageFanoutRouter.publishSegment) now dispatches each
 * language group's already-computed result to
 * CozyLiveDistributionTransport.deliverTranslatedSegment() exactly
 * once per distinct target language, with the correct viewer set per
 * call — never once per viewer, and never at all for local-relay
 * (feature-detected, no crash, no fabricated dispatch).
 *
 * HARNESS: identical production-file set and freshEngines() pattern as
 * live-language-fanout-router.test.js (read that file's own header
 * before this one) — reused deliberately for harness consistency.
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

function makeStubVoiceManager() {
    return {
        async speak() { return { available: true, played: true, providerId: 'stub-provider' }; },
        getDefaultVoice() { return 'stub-provider'; },
        getLastSpokenProviderId() { return 'stub-provider'; },
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

async function freshEngines() {
    for (const p of PRODUCTION_FILES) delete require.cache[require.resolve(p)];
    const identity = makeStubIdentity();
    global.window = { CozyOS: { CozyConversation: makeStubConversation(), IdentityEngine: identity, VoiceManager: makeStubVoiceManager() } };

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
        name: 'test-disclosed-provider', type: 'offline', supportsOffline: true,
        async translate(text, { targetLanguage }) { return { translatedText: `[${targetLanguage}] ${text}`, isReal: true }; },
    });
    await global.window.CozyOS.SpeechTranslationAdapter.init();
    global.window.CozyOS.CozyLiveDistributionTransport._resetForTests();

    return {
        ldce: global.window.CozyOS.LDCESessionEngine,
        router: global.window.CozyOS.LiveLanguageFanoutRouter,
        transport: global.window.CozyOS.CozyLiveDistributionTransport,
        identity,
    };
}

function makeSessionWithMembers(ldce, identity, hostId, memberDefs) {
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

/** A minimal fake remote-capable transport provider — real interface, real call recording, no network (the network wire itself is proven separately in server/live-relay/test/translated-segment-transport-integration.test.js against a real socket). Its purpose here is isolating and proving ONE thing: the fan-out router's own call pattern into deliverTranslatedSegment(). */
function makeFakeRemoteProvider() {
    const calls = [];
    return {
        provider: {
            id: 'fake-remote', type: 'websocket', remoteCapable: true,
            _viewers: new Map(),
            publishSource(sessionId, segment) {
                const v = this._viewers.get(sessionId) || [];
                return { success: true, delivered: v.slice() };
            },
            publishTranslatedSegment(sessionId, targetViewerIds, payload) {
                calls.push({ sessionId, targetViewerIds: targetViewerIds.slice(), payload });
                return { success: true, dispatched: true };
            },
            joinViewer(sessionId, viewerId) {
                if (!this._viewers.has(sessionId)) this._viewers.set(sessionId, []);
                this._viewers.get(sessionId).push(viewerId);
                return { success: true };
            },
            leaveViewer() { return { success: true }; },
            heartbeat() { return { success: true }; },
            listViewers(sessionId) { return this._viewers.get(sessionId) || []; },
        },
        calls,
    };
}

test('publishSegment() calls deliverTranslatedSegment() exactly once per distinct target language, with the correct viewer set, when a remote-capable provider is active', async () => {
    const { ldce, router, transport, identity } = await freshEngines();
    const { provider, calls } = makeFakeRemoteProvider();
    transport.registerTransportProvider(provider);
    transport.selectTransport('fake-remote');

    const sessionId = makeSessionWithMembers(ldce, identity, 'pastor-1', [
        { id: 'v-en-1', language: 'en' },
        { id: 'v-en-2', language: 'en' },
        { id: 'v-sw-1', language: 'sw' },
        { id: 'v-fr-1', language: 'fr' },
    ]);
    for (const viewerId of ['v-en-1', 'v-en-2', 'v-sw-1', 'v-fr-1']) router.joinViewer(sessionId, viewerId);

    await router.publishSegment(sessionId, { segmentId: 'seg-100', sourceLanguage: 'en', sourceText: 'Welcome everyone' });

    assert.equal(calls.length, 3, 'exactly one deliverTranslatedSegment call per distinct target language (en, sw, fr), never per viewer');

    const byLanguage = Object.fromEntries(calls.map((c) => [c.payload.language, c]));
    assert.deepEqual(new Set(byLanguage.en.targetViewerIds), new Set(['v-en-1', 'v-en-2']), 'both English viewers share the ONE English delivery call');
    assert.deepEqual(byLanguage.sw.targetViewerIds, ['v-sw-1']);
    assert.deepEqual(byLanguage.fr.targetViewerIds, ['v-fr-1']);
    assert.equal(byLanguage.en.payload.mode, 'ORIGINAL', 'en source -> en viewer is passthrough, not a fabricated translation');
    assert.equal(byLanguage.sw.payload.mode, 'TRANSLATE');
    assert.equal(byLanguage.fr.payload.mode, 'TRANSLATE');
});

test('publishSegment() does not call deliverTranslatedSegment() and does not throw when the active provider (local-relay) does not implement it', async () => {
    const { ldce, router, identity } = await freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'pastor-2', [{ id: 'v-1', language: 'en' }]);
    router.joinViewer(sessionId, 'v-1');
    const result = await router.publishSegment(sessionId, { segmentId: 'seg-101', sourceLanguage: 'en', sourceText: 'Hello' });
    assert.equal(result.errors.length, 0, 'local-relay lacking deliverTranslatedSegment must never surface as a routing error');
    assert.equal(result.groups.length, 1);
});
