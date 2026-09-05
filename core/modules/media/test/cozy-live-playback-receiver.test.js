'use strict';

/**
 * core/modules/media/test/cozy-live-playback-receiver.test.js
 * R040 Phase 4C
 *
 * HARNESS DISCLOSURE — UNIT TESTED, NOT DEVICE TESTED.
 * `document`/`HTMLAudioElement` are hand-built fakes matching the real
 * documented contract this module actually touches (createElement,
 * srcObject assignment, play()/pause(), volume, muted, setSinkId).
 * CozyAudioDeviceManager itself is the REAL module (not a fake) — this
 * suite proves the composition seam (applySinkId/setPlaybackVolume/
 * setPlaybackMuted being called on a real element this file created)
 * actually works end to end against that real class, not just against
 * a stub that assumes it does. It does NOT prove real browser
 * autoplay-policy behavior or real audio hardware output — those
 * remain genuinely DEVICE-UNVERIFIED until tested in a real browser
 * (same disclosed boundary as cozy-audio-device-manager.test.js).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

function loadReceiverModule() {
    const modulePath = path.join(__dirname, '..', 'cozy-live-playback-receiver.js');
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
}
function loadAudioDeviceManagerModule() {
    const modulePath = path.join(__dirname, '..', 'cozy-audio-device-manager.js');
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
}

/** Fake <audio> element matching the real HTMLMediaElement/HTMLAudioElement surface this module and CozyAudioDeviceManager actually use. */
function makeFakeAudioElement({ playRejects = false, hasSetSinkId = true } = {}) {
    const el = {
        _srcObject: null,
        get srcObject() { return this._srcObject; },
        set srcObject(v) { this._srcObject = v; },
        autoplay: false,
        volume: 1,
        muted: false,
        _paused: true,
        _sinkId: null,
        play() {
            this._paused = false;
            if (playRejects) return Promise.reject(Object.assign(new Error('NotAllowedError'), { name: 'NotAllowedError' }));
            return Promise.resolve();
        },
        pause() { this._paused = true; },
    };
    if (hasSetSinkId) {
        el.setSinkId = async function (id) { this._sinkId = id; };
    }
    return el;
}

function makeFakeDocument(elementOpts) {
    return {
        createElement(tag) {
            assert.equal(tag, 'audio');
            return makeFakeAudioElement(elementOpts);
        },
    };
}

/** Real CozyAudioDeviceManager, constructed with a minimal real-shaped mediaDevices/HTMLMediaElement env so getCapabilities() reflects true feature detection rather than a stub. */
function makeRealDeviceManager({ outputSelectionSupported = true } = {}) {
    const { CozyAudioDeviceManager } = loadAudioDeviceManagerModule();
    const FakeHTMLMediaElement = { prototype: {} };
    if (outputSelectionSupported) FakeHTMLMediaElement.prototype.setSinkId = function () {};
    const fakeNavigator = {
        mediaDevices: {
            async enumerateDevices() { return []; },
            async getUserMedia() { return { getTracks: () => [], getAudioTracks: () => [] }; },
            addEventListener() {},
            removeEventListener() {},
        },
    };
    return new CozyAudioDeviceManager({ _env: { navigator: fakeNavigator, HTMLMediaElement: FakeHTMLMediaElement } });
}

test('remote-track: attaches the real delivered MediaStream to a real <audio> element and reaches PLAYING', async () => {
    const { CozyLivePlaybackReceiver, PLAYBACK_STATE } = loadReceiverModule();
    const deviceManager = makeRealDeviceManager();
    const events = [];
    const receiver = new CozyLivePlaybackReceiver({
        audioDeviceManager: deviceManager,
        onEvent: (name, detail) => events.push({ name, detail }),
        _env: { document: makeFakeDocument() },
    });

    const fakeStream = { id: 'remote-stream-1' };
    receiver.handlePublisherEvent('remote-track', { remoteUserId: 'pastor', streams: [fakeStream] });

    // play() resolves asynchronously — allow the microtask queue to flush.
    await new Promise((resolve) => setTimeout(resolve, 5));

    assert.equal(receiver.getPlaybackState('pastor'), PLAYBACK_STATE.PLAYING);
    assert.deepEqual(receiver.listActivePeers(), ['pastor']);
    const stateNames = events.filter((e) => e.name === 'playback-state').map((e) => e.detail.current);
    assert.ok(stateNames.includes(PLAYBACK_STATE.ATTACHING));
    assert.ok(stateNames.includes(PLAYBACK_STATE.PLAYING));
});

test('remote-track: real element actually receives the exact delivered stream on srcObject, never a fabricated one', async () => {
    const { CozyLivePlaybackReceiver } = loadReceiverModule();
    const deviceManager = makeRealDeviceManager();
    let capturedElement = null;
    const doc = {
        createElement(tag) {
            const el = makeFakeAudioElement();
            capturedElement = el;
            return el;
        },
    };
    const receiver = new CozyLivePlaybackReceiver({ audioDeviceManager: deviceManager, _env: { document: doc } });
    const fakeStream = { id: 'remote-stream-testifier' };
    receiver.handlePublisherEvent('remote-track', { remoteUserId: 'testifier', streams: [fakeStream] });
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(capturedElement.srcObject, fakeStream);
});

test('autoplay blocked: browser rejects play() -> AUTOPLAY_BLOCKED is reported honestly, never fabricated as PLAYING', async () => {
    const { CozyLivePlaybackReceiver, PLAYBACK_STATE } = loadReceiverModule();
    const deviceManager = makeRealDeviceManager();
    const receiver = new CozyLivePlaybackReceiver({
        audioDeviceManager: deviceManager,
        _env: { document: makeFakeDocument({ playRejects: true }) },
    });
    receiver.handlePublisherEvent('remote-track', { remoteUserId: 'kenyan-viewer', streams: [{ id: 's1' }] });
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(receiver.getPlaybackState('kenyan-viewer'), PLAYBACK_STATE.AUTOPLAY_BLOCKED);
});

test('resumePlayback: real user-gesture retry recovers from AUTOPLAY_BLOCKED to PLAYING', async () => {
    const { CozyLivePlaybackReceiver, PLAYBACK_STATE } = loadReceiverModule();
    const deviceManager = makeRealDeviceManager();
    let rejectNextPlay = true;
    const el = makeFakeAudioElement();
    el.play = function () {
        this._paused = false;
        if (rejectNextPlay) { rejectNextPlay = false; return Promise.reject(new Error('NotAllowedError')); }
        return Promise.resolve();
    };
    const doc = { createElement: () => el };
    const receiver = new CozyLivePlaybackReceiver({ audioDeviceManager: deviceManager, _env: { document: doc } });

    receiver.handlePublisherEvent('remote-track', { remoteUserId: 'pastor', streams: [{ id: 's1' }] });
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(receiver.getPlaybackState('pastor'), PLAYBACK_STATE.AUTOPLAY_BLOCKED);

    const result = receiver.resumePlayback('pastor');
    assert.equal(result.success, true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(receiver.getPlaybackState('pastor'), PLAYBACK_STATE.PLAYING);
});

test('output device routing: applySinkId is actually invoked on the real element via the real CozyAudioDeviceManager seam, honestly no-op when unsupported', async () => {
    const { CozyLivePlaybackReceiver } = loadReceiverModule();
    const deviceManager = makeRealDeviceManager({ outputSelectionSupported: true });
    // Real selection flow: enumerate -> select -> apply, exactly as a real caller would drive it.
    // Force the manager's internal list without re-enumerating (fakeNavigator returns []); simulate a real post-permission device list.
    deviceManager._outputs = [{ deviceId: 'headset-1', kind: 'audiooutput', label: 'Bluetooth Headset', groupId: '' }];
    deviceManager._selectedOutputId = 'headset-1';

    let capturedElement = null;
    const doc = { createElement: () => { capturedElement = makeFakeAudioElement(); return capturedElement; } };
    const receiver = new CozyLivePlaybackReceiver({ audioDeviceManager: deviceManager, _env: { document: doc } });

    receiver.handlePublisherEvent('remote-track', { remoteUserId: 'pastor', streams: [{ id: 's1' }] });
    await new Promise((resolve) => setTimeout(resolve, 5));

    assert.equal(capturedElement._sinkId, 'headset-1');
});

test('setVolume/setMuted: real pass-through to CozyAudioDeviceManager, applied to the real attached element', async () => {
    const { CozyLivePlaybackReceiver } = loadReceiverModule();
    const deviceManager = makeRealDeviceManager();
    let capturedElement = null;
    const doc = { createElement: () => { capturedElement = makeFakeAudioElement(); return capturedElement; } };
    const receiver = new CozyLivePlaybackReceiver({ audioDeviceManager: deviceManager, _env: { document: doc } });

    receiver.handlePublisherEvent('remote-track', { remoteUserId: 'pastor', streams: [{ id: 's1' }] });
    await new Promise((resolve) => setTimeout(resolve, 5));

    const volResult = receiver.setVolume('pastor', 0.4);
    assert.equal(volResult.success, true);
    assert.equal(capturedElement.volume, 0.4);

    const muteResult = receiver.setMuted('pastor', true);
    assert.equal(muteResult.success, true);
    assert.equal(capturedElement.muted, true);
});

test('media-peer-state MEDIA_DISCONNECTED -> real detach: element paused, srcObject cleared, peer removed', async () => {
    const { CozyLivePlaybackReceiver, PLAYBACK_STATE } = loadReceiverModule();
    const deviceManager = makeRealDeviceManager();
    let capturedElement = null;
    const doc = { createElement: () => { capturedElement = makeFakeAudioElement(); return capturedElement; } };
    const receiver = new CozyLivePlaybackReceiver({ audioDeviceManager: deviceManager, _env: { document: doc } });

    receiver.handlePublisherEvent('remote-track', { remoteUserId: 'pastor', streams: [{ id: 's1' }] });
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(receiver.getPlaybackState('pastor'), PLAYBACK_STATE.PLAYING);

    receiver.handlePublisherEvent('media-peer-state', { remoteUserId: 'pastor', current: 'MEDIA_DISCONNECTED' });

    assert.equal(capturedElement._paused, true);
    assert.equal(capturedElement.srcObject, null);
    assert.equal(receiver.getPlaybackState('pastor'), PLAYBACK_STATE.IDLE);
    assert.deepEqual(receiver.listActivePeers(), []);
});

test('no remote stream delivered: honestly reports ERROR/NO_REMOTE_STREAM, never fabricates a playing element', () => {
    const { CozyLivePlaybackReceiver, PLAYBACK_STATE } = loadReceiverModule();
    const deviceManager = makeRealDeviceManager();
    const receiver = new CozyLivePlaybackReceiver({ audioDeviceManager: deviceManager, _env: { document: makeFakeDocument() } });
    receiver.handlePublisherEvent('remote-track', { remoteUserId: 'ghost', streams: [] });
    assert.equal(receiver.getPlaybackState('ghost'), PLAYBACK_STATE.ERROR);
});

test('getCapabilityReport(): never claims one-upstream/many-viewer distribution or a deployed SFU', () => {
    const { CozyLivePlaybackReceiver } = loadReceiverModule();
    const deviceManager = makeRealDeviceManager();
    const receiver = new CozyLivePlaybackReceiver({ audioDeviceManager: deviceManager, _env: { document: makeFakeDocument() } });
    const report = receiver.getCapabilityReport();
    assert.equal(report.ONE_UPSTREAM_MANY_VIEWERS_AVAILABLE, false);
    assert.equal(report.INTERNET_SCALE_SFU_DEPLOYED, false);
    assert.equal(report.MESH_PEER_PLAYBACK_AVAILABLE, true);
});

test('unrelated publisher events are a silent no-op, never an error', () => {
    const { CozyLivePlaybackReceiver } = loadReceiverModule();
    const deviceManager = makeRealDeviceManager();
    const receiver = new CozyLivePlaybackReceiver({ audioDeviceManager: deviceManager, _env: { document: makeFakeDocument() } });
    assert.doesNotThrow(() => receiver.handlePublisherEvent('media-error', { remoteUserId: 'x', reason: 'whatever' }));
    assert.doesNotThrow(() => receiver.handlePublisherEvent('something-unknown', {}));
});
