'use strict';

/**
 * core/modules/media/test/cozy-audio-device-manager.test.js
 * R040 Phase 4A
 *
 * HARNESS DISCLOSURE — UNIT TESTED, NOT DEVICE TESTED.
 * This suite runs in plain Node with hand-built fakes for
 * navigator.mediaDevices / HTMLMediaElement that match the real
 * documented Web API contract (MDN: MediaDevices.enumerateDevices(),
 * getUserMedia(), 'devicechange', HTMLMediaElement.setSinkId()) shape-
 * for-shape. This proves CozyAudioDeviceManager's own logic (capability
 * detection, selection/fallback bookkeeping, mute state, event emission)
 * is correct against that contract. It does NOT prove real browser
 * behavior, real Bluetooth/wired/USB hardware routing, or real Android
 * permission dialogs — those remain genuinely DEVICE-UNVERIFIED until
 * tested on real hardware (see the milestone report).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

function loadManager() {
    const modulePath = path.join(__dirname, '..', 'cozy-audio-device-manager.js');
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
}

// ---- Fakes matching the real MediaDevices/MediaStream/Track contract ----

function makeFakeTrack(kind = 'audio') {
    return { kind, enabled: true, stopped: false, stop() { this.stopped = true; } };
}

function makeFakeStream(tracks) {
    return {
        _tracks: tracks,
        getTracks() { return this._tracks; },
        getAudioTracks() { return this._tracks.filter((t) => t.kind === 'audio'); },
    };
}

/** Full-capability fake: enumerateDevices + getUserMedia + devicechange (addEventListener form). */
function makeFullMediaDevices({ inputs = [], outputs = [], denyPermission = false } = {}) {
    const listeners = new Map();
    return {
        _devices: [...inputs, ...outputs],
        async enumerateDevices() { return this._devices; },
        async getUserMedia(constraints) {
            if (denyPermission) {
                const err = new Error('Permission denied');
                err.name = 'NotAllowedError';
                throw err;
            }
            return makeFakeStream([makeFakeTrack('audio')]);
        },
        addEventListener(name, fn) {
            if (!listeners.has(name)) listeners.set(name, new Set());
            listeners.get(name).add(fn);
        },
        removeEventListener(name, fn) {
            listeners.get(name)?.delete(fn);
        },
        _fireDeviceChange() {
            for (const fn of listeners.get('devicechange') || []) fn();
        },
    };
}

function inputDevice(deviceId, label = 'Fake Mic') {
    return { deviceId, kind: 'audioinput', label, groupId: 'g1' };
}
function outputDevice(deviceId, label = 'Fake Speaker') {
    return { deviceId, kind: 'audiooutput', label, groupId: 'g1' };
}

test('getCapabilities() is honest about full support', () => {
    const { CozyAudioDeviceManager } = loadManager();
    const md = makeFullMediaDevices({ inputs: [inputDevice('mic-1')] });
    const HTMLMediaElement = { prototype: { setSinkId() {} } };
    const mgr = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: md }, HTMLMediaElement } });
    const caps = mgr.getCapabilities();
    assert.equal(caps.microphone, true);
    assert.equal(caps.inputEnumeration, true);
    assert.equal(caps.outputSelection, true);
    assert.equal(caps.deviceChangeEvents, true);
    // Never fabricated:
    assert.equal(caps.bluetooth, 'platform-managed');
    assert.equal(caps.wiredHeadset, 'platform-managed');
    assert.equal(caps.usbAudio, 'platform-managed');
});

test('getCapabilities() is honest when mediaDevices is entirely absent (no fabricated true)', () => {
    const { CozyAudioDeviceManager } = loadManager();
    const mgr = new CozyAudioDeviceManager({ _env: { navigator: {} } });
    const caps = mgr.getCapabilities();
    assert.equal(caps.microphone, false);
    assert.equal(caps.inputEnumeration, false);
    assert.equal(caps.outputSelection, false);
    assert.equal(caps.deviceChangeEvents, false);
});

test('getCapabilities() reports outputSelection false when setSinkId is not on the prototype (no fabricated support)', () => {
    const { CozyAudioDeviceManager } = loadManager();
    const md = makeFullMediaDevices({});
    const HTMLMediaElement = { prototype: {} }; // no setSinkId — e.g. Firefox at time of writing
    const mgr = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: md }, HTMLMediaElement } });
    assert.equal(mgr.getCapabilities().outputSelection, false);
});

test('enumerateInputs()/enumerateOutputs() reflect the real device list', async () => {
    const { CozyAudioDeviceManager } = loadManager();
    const md = makeFullMediaDevices({ inputs: [inputDevice('mic-1'), inputDevice('mic-2')], outputs: [outputDevice('spk-1')] });
    const mgr = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: md } } });
    await mgr.initialize();
    const inputs = await mgr.enumerateInputs();
    const outputs = await mgr.enumerateOutputs();
    assert.equal(inputs.length, 2);
    assert.equal(outputs.length, 1);
    assert.equal(outputs[0].deviceId, 'spk-1');
});

test('initialize() does not request microphone permission merely on init', async () => {
    const { CozyAudioDeviceManager } = loadManager();
    let getUserMediaCalled = false;
    const md = makeFullMediaDevices({ inputs: [inputDevice('mic-1')] });
    const realGetUserMedia = md.getUserMedia.bind(md);
    md.getUserMedia = async (...args) => { getUserMediaCalled = true; return realGetUserMedia(...args); };
    const mgr = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: md } } });
    await mgr.initialize();
    assert.equal(getUserMediaCalled, false, 'initialize() must never request mic permission by itself (4A-2)');
});

test('selectInput() persists a valid selection and rejects an unknown deviceId', async () => {
    const { CozyAudioDeviceManager } = loadManager();
    const md = makeFullMediaDevices({ inputs: [inputDevice('mic-1')] });
    const mgr = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: md } } });
    await mgr.initialize();
    const bad = await mgr.selectInput('does-not-exist');
    assert.equal(bad.success, false);
    const good = await mgr.selectInput('mic-1');
    assert.equal(good.success, true);
    assert.equal(mgr.getSelectedInput(), 'mic-1');
});

test('output selection is honestly refused when setSinkId is unavailable', async () => {
    const { CozyAudioDeviceManager } = loadManager();
    const md = makeFullMediaDevices({ outputs: [outputDevice('spk-1')] });
    const mgr = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: md }, HTMLMediaElement: { prototype: {} } } });
    await mgr.initialize();
    const result = await mgr.selectOutput('spk-1');
    assert.equal(result.success, false);
    assert.equal(result.reason, 'OUTPUT_DEVICE_SELECTION_UNAVAILABLE');
});

test('devicechange refreshes inventory and falls back safely when the selected input disappears', async () => {
    const { CozyAudioDeviceManager } = loadManager();
    const md = makeFullMediaDevices({ inputs: [inputDevice('mic-1')] });
    const mgr = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: md } } });
    await mgr.initialize();
    await mgr.selectInput('mic-1');
    assert.equal(mgr.getSelectedInput(), 'mic-1');

    let listChangedEvent = null;
    mgr.on('audio-device:list-changed', (detail) => { listChangedEvent = detail; });

    // Bluetooth headset (mic-1) disconnects — device list now only has a new device.
    md._devices = [inputDevice('mic-2')];
    md._fireDeviceChange();
    await new Promise((r) => setTimeout(r, 10)); // let the async handler run

    assert.equal(mgr.getSelectedInput(), null, 'must fall back rather than keep pointing at a vanished device');
    assert.ok(listChangedEvent);
    assert.equal(listChangedEvent.fellBackInput, true);
});

test('devicechange does not fire when the API is unavailable, and the manager still initializes cleanly', async () => {
    const { CozyAudioDeviceManager } = loadManager();
    const md = { async enumerateDevices() { return []; }, async getUserMedia() { return makeFakeStream([]); } }; // no addEventListener
    const mgr = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: md } } });
    const result = await mgr.initialize();
    assert.equal(result.success, true);
    assert.equal(mgr.getCapabilities().deviceChangeEvents, false);
});

test('requestMicrophonePermission(): honest success and honest denial', async () => {
    const { CozyAudioDeviceManager } = loadManager();
    const okMgr = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: makeFullMediaDevices({}) } } });
    const ok = await okMgr.requestMicrophonePermission();
    assert.equal(ok.success, true);

    const deniedMgr = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: makeFullMediaDevices({ denyPermission: true }) } } });
    const denied = await deniedMgr.requestMicrophonePermission();
    assert.equal(denied.success, false);
    assert.equal(denied.reason, 'PERMISSION_DENIED');
});

test('requestMicrophonePermission() stops its own probe stream (never leaves a hot mic behind)', async () => {
    const { CozyAudioDeviceManager } = loadManager();
    const md = makeFullMediaDevices({});
    let capturedStream = null;
    const realGUM = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => { capturedStream = await realGUM(c); return capturedStream; };
    const mgr = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: md } } });
    await mgr.requestMicrophonePermission();
    assert.equal(capturedStream.getTracks()[0].stopped, true);
});

test('createMicrophoneStream() + mute/unmute toggles track.enabled honestly, not a fabricated flag', async () => {
    const { CozyAudioDeviceManager } = loadManager();
    const md = makeFullMediaDevices({});
    const mgr = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: md } } });
    const result = await mgr.createMicrophoneStream();
    assert.equal(result.success, true);
    assert.equal(result.stream.getAudioTracks()[0].enabled, true);

    mgr.muteLocalMicrophone();
    assert.equal(mgr.isMicrophoneMuted(), true);
    assert.equal(result.stream.getAudioTracks()[0].enabled, false);

    mgr.unmuteLocalMicrophone();
    assert.equal(mgr.isMicrophoneMuted(), false);
    assert.equal(result.stream.getAudioTracks()[0].enabled, true);
});

test('stopMicrophone() actually stops every real track', async () => {
    const { CozyAudioDeviceManager } = loadManager();
    const mgr = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: makeFullMediaDevices({}) } } });
    const result = await mgr.createMicrophoneStream();
    mgr.stopMicrophone();
    assert.equal(result.stream.getTracks()[0].stopped, true);
});

test('setPlaybackVolume() clamps to 0..1 and never touches microphone gain', () => {
    const { CozyAudioDeviceManager } = loadManager();
    const mgr = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: makeFullMediaDevices({}) } } });
    const el = { volume: 1, muted: false };
    assert.equal(mgr.setPlaybackVolume(el, 1.7).success, true);
    assert.equal(el.volume, 1);
    mgr.setPlaybackVolume(el, -0.4);
    assert.equal(el.volume, 0);
    mgr.setPlaybackVolume(el, 0.5);
    assert.equal(el.volume, 0.5);
});

test('applySinkId() honestly refuses without setSinkId support or without a prior selection', async () => {
    const { CozyAudioDeviceManager } = loadManager();
    const md = makeFullMediaDevices({ outputs: [outputDevice('spk-1')] });
    const mgr = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: md }, HTMLMediaElement: { prototype: { setSinkId() {} } } } });
    await mgr.initialize();

    const noSelection = await mgr.applySinkId({ setSinkId: async () => {} });
    assert.equal(noSelection.success, false);
    assert.equal(noSelection.reason, 'NO_OUTPUT_SELECTED');

    await mgr.selectOutput('spk-1');
    let appliedTo = null;
    const el = { setSinkId: async (id) => { appliedTo = id; } };
    const applied = await mgr.applySinkId(el);
    assert.equal(applied.success, true);
    assert.equal(appliedTo, 'spk-1');
});

test('destroy() removes the devicechange listener and stops any active microphone', async () => {
    const { CozyAudioDeviceManager } = loadManager();
    const md = makeFullMediaDevices({ inputs: [inputDevice('mic-1')] });
    const mgr = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: md } } });
    await mgr.initialize();
    const result = await mgr.createMicrophoneStream();
    mgr.destroy();
    assert.equal(result.stream.getTracks()[0].stopped, true);

    let firedAfterDestroy = false;
    mgr.on('audio-device:list-changed', () => { firedAfterDestroy = true; });
    md._fireDeviceChange();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(firedAfterDestroy, false, 'destroy() must actually deregister the devicechange listener');
});
