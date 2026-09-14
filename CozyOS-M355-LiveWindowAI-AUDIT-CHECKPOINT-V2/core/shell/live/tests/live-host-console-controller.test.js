'use strict';

/**
 * core/shell/live/tests/live-host-console-controller.test.js
 * STEP 4D / LIVE UI ENTRY, Patch #2
 *
 * Covers requirements A-H from the original STEP 4D Live UI Entry prompt.
 * Run: node --test core/shell/live/tests/live-host-console-controller.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { LiveHostConsoleController } = require('../ui/cozy-live-host-console-controller');

function fakeSession(uid) {
    return { current() { return uid ? { uid } : null; } };
}

function fakeLiveEntryPoint({ result, spy } = {}) {
    return {
        async goLive(opts) {
            if (spy) spy(opts);
            return result !== undefined ? result : { success: true, sessionId: 'ldce-session-1', uid: opts._uid };
        },
    };
}

// A: unauthenticated Go Live fails safely
test('A: handleGoLive() with no authenticated user fails safely without calling LiveEntryPoint', async () => {
    let called = false;
    const liveEntryPoint = fakeLiveEntryPoint({ spy: () => { called = true; } });
    const controller = LiveHostConsoleController.createController({
        root: { CozyOS: { Session: fakeSession(null) } },
        LiveEntryPoint: liveEntryPoint,
    });
    const result = await controller.handleGoLive();
    assert.equal(result.success, false);
    assert.equal(result.state, 'unauthenticated');
    assert.equal(called, false);
});

// B: authenticated Go Live calls LiveEntryPoint.goLive()
test('B: handleGoLive() with an authenticated user calls LiveEntryPoint.goLive() with explicit mesh-only transport', async () => {
    let capturedOpts = null;
    const liveEntryPoint = fakeLiveEntryPoint({ spy: (opts) => { capturedOpts = opts; } });
    const root = { CozyOS: { Session: fakeSession('uid-host-1') } };
    const controller = LiveHostConsoleController.createController({ root, LiveEntryPoint: liveEntryPoint });
    const result = await controller.handleGoLive();
    assert.equal(result.success, true);
    assert.equal(capturedOpts.transportMode, 'mesh-only');
    assert.equal(capturedOpts._root, root);
});

// C: returned sessionId is handled
test('C: handleGoLive() surfaces the sessionId returned by LiveEntryPoint on success', async () => {
    const liveEntryPoint = fakeLiveEntryPoint({ result: { success: true, sessionId: 'ldce-session-42', uid: 'uid-host-1' } });
    const controller = LiveHostConsoleController.createController({
        root: { CozyOS: { Session: fakeSession('uid-host-1') } },
        LiveEntryPoint: liveEntryPoint,
    });
    const result = await controller.handleGoLive();
    assert.equal(result.success, true);
    assert.equal(result.state, 'live');
    assert.equal(result.sessionId, 'ldce-session-42');
});

// D: failure is displayed/propagated honestly
test('D: handleGoLive() propagates LiveEntryPoint failure reason honestly, without claiming live', async () => {
    const liveEntryPoint = fakeLiveEntryPoint({ result: { success: false, reason: 'LDCESessionEngine.createSession() declined. Failing closed.' } });
    const controller = LiveHostConsoleController.createController({
        root: { CozyOS: { Session: fakeSession('uid-host-1') } },
        LiveEntryPoint: liveEntryPoint,
    });
    const result = await controller.handleGoLive();
    assert.equal(result.success, false);
    assert.equal(result.state, 'error');
    assert.match(result.reason, /declined/);
});

// E: UI does not provide uid
test('E: handleGoLive() never supplies a caller uid to LiveEntryPoint.goLive()', async () => {
    let capturedOpts = null;
    const liveEntryPoint = fakeLiveEntryPoint({ spy: (opts) => { capturedOpts = opts; } });
    const controller = LiveHostConsoleController.createController({
        root: { CozyOS: { Session: fakeSession('uid-host-1') } },
        LiveEntryPoint: liveEntryPoint,
    });
    await controller.handleGoLive();
    assert.equal(Object.prototype.hasOwnProperty.call(capturedOpts, '_uid'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(capturedOpts, 'uid'), false);
});

// F: old demo identity is not used
test('F: controller module never CALLS ensureDemoUser or an ID_STORE demo identity (doc comments explaining what it avoids are fine)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'ui', 'cozy-live-host-console-controller.js'), 'utf8');
    assert.doesNotMatch(src, /ensureDemoUser\(/);
    assert.doesNotMatch(src, /ID_STORE\./);
});

// G: old CozyLiveSession.startSession() is not invoked by the new Go Live path
test('G: controller module never CALLS CozyLiveSession.startSession() (doc comments explaining what it avoids are fine)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'ui', 'cozy-live-host-console-controller.js'), 'utf8');
    assert.doesNotMatch(src, /CozyLiveSession\.startSession\(/);
    assert.doesNotMatch(src, /liveSession\.startSession\(/);
});

// H: mesh/relay selection remains explicit
test('H: transportMode is always the fixed, explicit literal "mesh-only", never omitted or defaulted', async () => {
    assert.equal(LiveHostConsoleController.getTransportMode(), 'mesh-only');
    let capturedOpts = null;
    const liveEntryPoint = fakeLiveEntryPoint({ spy: (opts) => { capturedOpts = opts; } });
    const controller = LiveHostConsoleController.createController({
        root: { CozyOS: { Session: fakeSession('uid-host-1') } },
        LiveEntryPoint: liveEntryPoint,
    });
    await controller.handleGoLive();
    assert.equal(capturedOpts.transportMode, 'mesh-only');
});

// Additional: LiveEntryPoint unavailable fails safely
test('handleGoLive() fails safely when LiveEntryPoint is unavailable', async () => {
    const controller = LiveHostConsoleController.createController({
        root: { CozyOS: { Session: fakeSession('uid-host-1') } },
        LiveEntryPoint: null,
    });
    const result = await controller.handleGoLive();
    assert.equal(result.success, false);
    assert.equal(result.state, 'unavailable');
});
