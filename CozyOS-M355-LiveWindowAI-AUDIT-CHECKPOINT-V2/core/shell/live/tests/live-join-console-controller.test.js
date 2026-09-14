'use strict';

/**
 * core/shell/live/tests/live-join-console-controller.test.js
 * STEP 4D / LIVE UI / PART B — DIRECT JOIN
 *
 * Run: node --test core/shell/live/tests/live-join-console-controller.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { LiveJoinConsoleController } = require('../ui/cozy-live-join-console-controller');

function fakeSession(uid) {
    return { current() { return uid ? { uid } : null; } };
}

function fakeLiveEntryPoint({ result, spy } = {}) {
    return {
        async joinLive(opts) {
            if (spy) spy(opts);
            return result !== undefined ? result : { success: true, sessionId: opts.sessionId, uid: 'uid-viewer-1', role: 'participant' };
        },
    };
}

// --- Authentication ---

// A: unauthenticated viewer -> rejected
test('A: join() with no authenticated user fails safely without calling joinLive()', async () => {
    let called = false;
    const liveEntryPoint = fakeLiveEntryPoint({ spy: () => { called = true; } });
    const controller = LiveJoinConsoleController.createController({
        root: { CozyOS: { Session: fakeSession(null) } },
        LiveEntryPoint: liveEntryPoint,
    });
    const result = await controller.join('ldce-session-1');
    assert.equal(result.success, false);
    assert.equal(result.state, 'unauthenticated');
    assert.equal(called, false);
});

// B: authenticated viewer -> accepted
test('B: join() with an authenticated user and a session ID calls joinLive() with explicit mesh-only transport', async () => {
    let capturedOpts = null;
    const liveEntryPoint = fakeLiveEntryPoint({ spy: (opts) => { capturedOpts = opts; } });
    const root = { CozyOS: { Session: fakeSession('uid-viewer-1') } };
    const controller = LiveJoinConsoleController.createController({ root, LiveEntryPoint: liveEntryPoint });
    const result = await controller.join('ldce-session-1');
    assert.equal(result.success, true);
    assert.equal(capturedOpts.transportMode, 'mesh-only');
    assert.equal(capturedOpts._root, root);
});

// C: caller cannot provide/substitute another UID
test('C: join() never forwards a uid/userId/requesterId field to joinLive()', async () => {
    let capturedOpts = null;
    const liveEntryPoint = fakeLiveEntryPoint({ spy: (opts) => { capturedOpts = opts; } });
    const controller = LiveJoinConsoleController.createController({
        root: { CozyOS: { Session: fakeSession('uid-viewer-1') } },
        LiveEntryPoint: liveEntryPoint,
    });
    await controller.join('ldce-session-1');
    assert.equal(Object.prototype.hasOwnProperty.call(capturedOpts, 'uid'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(capturedOpts, 'userId'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(capturedOpts, 'requesterId'), false);
});

// --- Session ID handling ---

// D: missing session ID -> rejected
test('D: join() with no session ID argument fails closed without calling joinLive()', async () => {
    let called = false;
    const liveEntryPoint = fakeLiveEntryPoint({ spy: () => { called = true; } });
    const controller = LiveJoinConsoleController.createController({
        root: { CozyOS: { Session: fakeSession('uid-viewer-1') } },
        LiveEntryPoint: liveEntryPoint,
    });
    const result = await controller.join(undefined);
    assert.equal(result.success, false);
    assert.equal(result.state, 'missing-session-id');
    assert.equal(called, false);
});

// E: empty/whitespace session ID -> rejected
test('E: join() with a blank/whitespace-only session ID fails closed without calling joinLive()', async () => {
    let called = false;
    const liveEntryPoint = fakeLiveEntryPoint({ spy: () => { called = true; } });
    const controller = LiveJoinConsoleController.createController({
        root: { CozyOS: { Session: fakeSession('uid-viewer-1') } },
        LiveEntryPoint: liveEntryPoint,
    });
    const result = await controller.join('   ');
    assert.equal(result.success, false);
    assert.equal(result.state, 'missing-session-id');
    assert.equal(called, false);
});

// F: supplied session ID reaches joinLive() unchanged except safe trimming
test('F: join() trims surrounding whitespace only, never otherwise transforms the session ID', async () => {
    let capturedOpts = null;
    const liveEntryPoint = fakeLiveEntryPoint({ spy: (opts) => { capturedOpts = opts; } });
    const controller = LiveJoinConsoleController.createController({
        root: { CozyOS: { Session: fakeSession('uid-viewer-1') } },
        LiveEntryPoint: liveEntryPoint,
    });
    await controller.join('  ldce-session-XYZ-77  ');
    assert.equal(capturedOpts.sessionId, 'ldce-session-XYZ-77');
});

// --- LDCE ---

// G: successful joinLive() -> success
test('G: join() reports success and the real sessionId/role returned by joinLive()', async () => {
    const liveEntryPoint = fakeLiveEntryPoint({ result: { success: true, sessionId: 'ldce-session-42', uid: 'uid-viewer-1', role: 'participant' } });
    const controller = LiveJoinConsoleController.createController({
        root: { CozyOS: { Session: fakeSession('uid-viewer-1') } },
        LiveEntryPoint: liveEntryPoint,
    });
    const result = await controller.join('ldce-session-42');
    assert.equal(result.success, true);
    assert.equal(result.state, 'joined');
    assert.equal(result.sessionId, 'ldce-session-42');
    assert.equal(result.role, 'participant');
});

// H: joinLive() failure -> clean failure
test('H: join() propagates joinLive() failure reason honestly, without claiming joined', async () => {
    const liveEntryPoint = fakeLiveEntryPoint({ result: { success: false, reason: 'LDCESessionEngine.joinSession() declined. Failing closed.' } });
    const controller = LiveJoinConsoleController.createController({
        root: { CozyOS: { Session: fakeSession('uid-viewer-1') } },
        LiveEntryPoint: liveEntryPoint,
    });
    const result = await controller.join('ldce-session-99');
    assert.equal(result.success, false);
    assert.equal(result.state, 'error');
    assert.match(result.reason, /declined/);
});

// I: invalid join result -> fail closed
test('I: join() fails closed if joinLive() resolves success:true but with no sessionId', async () => {
    const liveEntryPoint = fakeLiveEntryPoint({ result: { success: true } });
    const controller = LiveJoinConsoleController.createController({
        root: { CozyOS: { Session: fakeSession('uid-viewer-1') } },
        LiveEntryPoint: liveEntryPoint,
    });
    const result = await controller.join('ldce-session-1');
    assert.equal(result.success, false);
    assert.equal(result.state, 'error');
});

// --- Boundary ---

// J: no SessionAuthority implementation added
test('J: controller module never references SessionAuthority', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'ui', 'cozy-live-join-console-controller.js'), 'utf8');
    assert.doesNotMatch(src, /SessionAuthority/);
});

// K: no LDCESessionEngine modification (this file doesn't touch that source file at all)
test('K: this patch does not modify ldce-session-engine.js', () => {
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'ui', 'ldce-session-engine.js')), false);
    const src = fs.readFileSync(path.join(__dirname, '..', 'ui', 'cozy-live-join-console-controller.js'), 'utf8');
    assert.doesNotMatch(src, /class\s+LDCESessionEngine/);
});

// L: no session discovery/list API added
test('L: controller module exposes no discovery/list/enumerate API', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'ui', 'cozy-live-join-console-controller.js'), 'utf8');
    assert.doesNotMatch(src, /listSessions|enumerate|allSessions|browseSessions/i);
});

// M: no CozyLiveSession dependency introduced
test('M: controller module never CALLS CozyLiveSession (doc comments explaining what it avoids are fine)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'ui', 'cozy-live-join-console-controller.js'), 'utf8');
    assert.doesNotMatch(src, /CozyLiveSession\./);
});

// N (PART C, TASK 5-J): no living-worship-player dependency is introduced
test('N: controller module and join console HTML never reference living-worship-player', () => {
    const controllerSrc = fs.readFileSync(path.join(__dirname, '..', 'ui', 'cozy-live-join-console-controller.js'), 'utf8');
    assert.doesNotMatch(controllerSrc, /living-worship-player/);
    const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'ui', 'cozy-live-join-console.html'), 'utf8');
    assert.doesNotMatch(htmlSrc, /living-worship-player/);
});
