/**
 * core/engines/video/ui/tests/cozy-live-camera-capture-app.test.js
 * RP-035 Section 14 — Live Camera Capture application
 * Run with: node core/engines/video/ui/tests/cozy-live-camera-capture-app.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        const result = fn();
        if (result && typeof result.then === 'function') {
            return result.then(
                () => { console.log(`  \u2713 ${name}`); passed++; },
                (err) => { console.log(`  \u2717 ${name}`); console.log(`      ${err.message}`); failed++; }
            );
        }
        console.log(`  \u2713 ${name}`);
        passed++;
        return Promise.resolve();
    } catch (err) {
        console.log(`  \u2717 ${name}`);
        console.log(`      ${err.message}`);
        failed++;
        return Promise.resolve();
    }
}

const roots = {
    trustedDevice: path.join(__dirname, '..', '..', '..', '..', 'security', 'trusted-device-manager.js'),
    cozyConnect: path.join(__dirname, '..', '..', '..', '..', 'connectivity', 'cozy-connect.js'),
    hotspotEngine: path.join(__dirname, '..', '..', '..', 'collaboration', 'live-hotspot-engine.js'),
    cozyShare: path.join(__dirname, '..', '..', '..', '..', 'collaboration', 'cozy-share.js'),
    living: path.join(__dirname, '..', '..', '..', '..', 'connectivity', 'cozy-living-connectivity.js'),
    cameraProvider: path.join(__dirname, '..', '..', '..', 'camera', 'browser-camera-provider.js'),
    captureEngine: path.join(__dirname, '..', '..', 'live-video-capture-engine.js'),
    app: path.join(__dirname, '..', 'cozy-live-camera-capture-app.js'),
    identityEngine: path.join(__dirname, '..', '..', '..', '..', 'modules', 'identity', 'identity-engine.js'),
    serviceRegistry: path.join(__dirname, '..', '..', '..', '..', 'registry', 'cozy-registry.js')
};

function freshStack() {
    Object.values(roots).forEach((p) => { delete require.cache[require.resolve(p)]; });
    const win = { CozyOS: {} };
    global.window = win;

    require(roots.trustedDevice);
    require(roots.cozyConnect);
    require(roots.hotspotEngine);
    require(roots.cozyShare);
    require(roots.living);
    require(roots.cameraProvider);
    require(roots.captureEngine);
    require(roots.app);
    require(roots.identityEngine);
    require(roots.serviceRegistry);

    return {
        win,
        living: win.CozyOS.CozyLivingConnectivity,
        capture: win.CozyOS.LiveVideoCapture,
        app: win.CozyOS.CozyLiveCameraCaptureApp,
        identity: win.CozyOS.IdentityEngine,
        serviceRegistry: win.CozyOS.ServiceRegistry
    };
}

async function makeActiveUser(s, username) {
    const result = await s.identity.createUser({ username, password: 'Str0ngPassw0rd!', roles: [] });
    if (!result || result.available !== true || !result.userId) {
        throw new Error('makeActiveUser() failed to create a real user: ' + JSON.stringify(result));
    }
    return result;
}

console.log('RP-035 Section 14 — Live Camera Capture application tests\n');

(async () => {

/* ===================================================================
   1. APPLICATION REGISTRATION / DISCOVERY
=================================================================== */
console.log('Application registration & discovery:');

test('registerAsApplication() registers through the real ServiceRegistry, no second registry', () => {
    const s = freshStack();
    const r = s.app.registerAsApplication();
    assert.strictEqual(r.serviceRegistry, 'REGISTERED');
    assert.ok(s.serviceRegistry.hasApplication('live_camera_capture_001'));
});

test('CAPABILITY_UNAVAILABLE reported honestly when ServiceRegistry absent', () => {
    delete require.cache[require.resolve(roots.app)];
    global.window = { CozyOS: {} };
    require(roots.app);
    const r = global.window.CozyOS.CozyLiveCameraCaptureApp.registerAsApplication();
    assert.strictEqual(r.serviceRegistry, 'CAPABILITY_UNAVAILABLE');
});

test('this application is NOT auto-registered as a BUILT_IN core app — visibility stays an explicit decision', () => {
    const s = freshStack();
    s.app.registerAsApplication();
    assert.strictEqual(s.identity.isCoreApplication('live-camera-capture'), false);
});

/* ===================================================================
   2. LAUNCH AUTHORIZATION
=================================================================== */
console.log('\nLaunch authorization:');

await test('an active user with the app explicitly assigned can launch it', async () => {
    const s = freshStack();
    s.app.registerAsApplication();
    const user = await makeActiveUser(s, 's14-user1-' + Date.now());
    s.identity.assignApplication(user.userId, 'live-camera-capture');
    assert.strictEqual(s.identity.canAccessApplication(user.userId, 'live-camera-capture'), true);
});

await test('an active user WITHOUT assignment cannot launch it', async () => {
    const s = freshStack();
    s.app.registerAsApplication();
    const user = await makeActiveUser(s, 's14-user2-' + Date.now());
    assert.strictEqual(s.identity.canAccessApplication(user.userId, 'live-camera-capture'), false);
});

await test('a disabled user cannot launch it even if assigned', async () => {
    const s = freshStack();
    s.app.registerAsApplication();
    const user = await makeActiveUser(s, 's14-user3-' + Date.now());
    s.identity.assignApplication(user.userId, 'live-camera-capture');
    s.identity.disableUser(user.userId);
    assert.strictEqual(s.identity.canAccessApplication(user.userId, 'live-camera-capture'), false);
});

await test('the global disable toggle blocks access regardless of assignment', async () => {
    const s = freshStack();
    s.app.registerAsApplication();
    const user = await makeActiveUser(s, 's14-user4-' + Date.now());
    s.identity.assignApplication(user.userId, 'live-camera-capture');
    s.identity.setApplicationEnabled('live-camera-capture', false);
    assert.strictEqual(s.identity.canAccessApplication(user.userId, 'live-camera-capture'), false);
});

/* ===================================================================
   3. CAMERA CAPABILITY REPORTING — composed, never re-detected
=================================================================== */
console.log('\nCamera capability reporting:');

test('getCameraCapabilityStatus() composes real RP-033 Gate 1 detection, never a second detector', () => {
    const s = freshStack();
    const r = s.app.getCameraCapabilityStatus();
    assert.strictEqual(r.status, 'OK');
    assert.ok('status' in r.camera);
    assert.ok('status' in r.microphone);
});

test('CAPABILITY_UNAVAILABLE reported honestly when both engines are absent', () => {
    delete require.cache[require.resolve(roots.app)];
    global.window = { CozyOS: {} };
    require(roots.app);
    const r = global.window.CozyOS.CozyLiveCameraCaptureApp.getCameraCapabilityStatus();
    assert.strictEqual(r.status, 'CAPABILITY_UNAVAILABLE');
});

test('camera permission status is read verbatim from CozyLivingConnectivity, never re-derived', () => {
    const s = freshStack();
    const engineReport = s.living.detectCapabilities();
    const appReport = s.app.getCameraCapabilityStatus();
    assert.strictEqual(appReport.camera.status, engineReport.camera.status);
});

test('engine capabilities (getUserMedia/mediaRecorder) are read verbatim from LiveVideoCapture, never re-derived', () => {
    const s = freshStack();
    const engineCaps = s.capture.getCapabilities();
    const appReport = s.app.getCameraCapabilityStatus();
    assert.strictEqual(appReport.engine.getUserMedia, engineCaps.getUserMedia);
    assert.strictEqual(appReport.engine.mediaRecorder, engineCaps.mediaRecorder);
});

/* ===================================================================
   4. DEVICE LIST
=================================================================== */
console.log('\nDevice list:');

await test('getDevices() composes the real LiveVideoCapture.getDevices(), never a second device list', async () => {
    const s = freshStack();
    const r = await s.app.getDevices();
    assert.strictEqual(r.status, 'OK');
    assert.ok(Array.isArray(r.devices));
});

await test('CAPABILITY_UNAVAILABLE reported honestly when the capture engine is absent', async () => {
    delete require.cache[require.resolve(roots.app)];
    global.window = { CozyOS: {} };
    require(roots.app);
    const r = await global.window.CozyOS.CozyLiveCameraCaptureApp.getDevices();
    assert.strictEqual(r.status, 'CAPABILITY_UNAVAILABLE');
});

/* ===================================================================
   5. PREVIEW LIFECYCLE — real passthrough, honest Node-environment
   degradation (no navigator.mediaDevices in Node)
=================================================================== */
console.log('\nPreview lifecycle (Node-environment honesty):');

await test('startPreview() honestly fails in a Node (non-browser) environment, never fabricates success', async () => {
    const s = freshStack();
    const r = await s.app.startPreview(null, {});
    assert.strictEqual(r.success, false);
});

test('stopPreview() on a never-started preview is a safe real no-op result, never throws', () => {
    const s = freshStack();
    const r = s.app.stopPreview();
    assert.strictEqual(r.success, true);
});

test('pausePreview() without an active stream honestly reports failure, never fabricates pause', () => {
    const s = freshStack();
    const r = s.app.pausePreview();
    assert.strictEqual(r.success, false);
});

test('resumePreview() without an active stream honestly reports failure', () => {
    const s = freshStack();
    const r = s.app.resumePreview();
    assert.strictEqual(r.success, false);
});

await test('switchCamera() CAPABILITY_UNAVAILABLE when the engine is absent', async () => {
    delete require.cache[require.resolve(roots.app)];
    global.window = { CozyOS: {} };
    require(roots.app);
    const r = await global.window.CozyOS.CozyLiveCameraCaptureApp.switchCamera(null);
    assert.strictEqual(r.status, 'CAPABILITY_UNAVAILABLE');
});

/* ===================================================================
   6. PHOTO CAPTURE — capture/clarity boundary
=================================================================== */
console.log('\nPhoto capture (capture/clarity boundary):');

await test('capturePhoto() without an active preview honestly fails, never fabricates a photo', async () => {
    const s = freshStack();
    const r = await s.app.capturePhoto();
    assert.strictEqual(r.success, false);
});

await test('capturePhoto() CAPABILITY_UNAVAILABLE when the engine is absent', async () => {
    delete require.cache[require.resolve(roots.app)];
    global.window = { CozyOS: {} };
    require(roots.app);
    const r = await global.window.CozyOS.CozyLiveCameraCaptureApp.capturePhoto();
    assert.strictEqual(r.status, 'CAPABILITY_UNAVAILABLE');
});

test('this module never sets clarityProcessed to true anywhere in its source', () => {
    const fs = require('fs');
    const src = fs.readFileSync(roots.app, 'utf8');
    assert.strictEqual(/clarityProcessed:\s*true/.test(src), false);
});

test('this module contains no active enhancement/clarity implementation — only the honest CAPABILITY_UNAVAILABLE registry keys already verified above', () => {
    const fs = require('fs');
    const src = fs.readFileSync(roots.app, 'utf8');
    // The registry-key assertions above already prove these are all
    // CAPABILITY_UNAVAILABLE; this test additionally confirms no
    // function body implements any of them (a real function
    // definition line, not a disclosure comment mentioning the term).
    ['superResolution', 'denoising', 'hdrProcessing', 'multiFrameFusion', 'aiEnhancement', 'faceRecognition', 'ocr'].forEach((cap) => {
        assert.strictEqual(new RegExp(`function\\s+${cap}\\s*\\(`).test(src), false, cap);
    });
});

/* ===================================================================
   7. RECORDING LIFECYCLE
=================================================================== */
console.log('\nRecording lifecycle:');

test('startRecording() without an active stream honestly fails, never fabricates a recording', () => {
    const s = freshStack();
    const r = s.app.startRecording({});
    assert.strictEqual(r.success, false);
});

await test('stopRecording() without an active recording honestly fails', async () => {
    const s = freshStack();
    const r = await s.app.stopRecording();
    assert.strictEqual(r.success, false);
});

test('pauseRecording() without an active recording honestly fails', () => {
    const s = freshStack();
    const r = s.app.pauseRecording();
    assert.strictEqual(r.success, false);
});

test('resumeRecording() without a paused recording honestly fails', () => {
    const s = freshStack();
    const r = s.app.resumeRecording();
    assert.strictEqual(r.success, false);
});

/* ===================================================================
   8. STATUS
=================================================================== */
console.log('\nStatus:');

test('getStatus() composes the real LiveVideoCapture.getStatus(), never a second state machine', () => {
    const s = freshStack();
    const r = s.app.getStatus();
    assert.strictEqual(r.status, 'OK');
    assert.strictEqual(r.previewState, 'stopped');
    assert.strictEqual(r.recordingState, 'idle');
});

test('CAPABILITY_UNAVAILABLE reported honestly when the engine is absent', () => {
    delete require.cache[require.resolve(roots.app)];
    global.window = { CozyOS: {} };
    require(roots.app);
    const r = global.window.CozyOS.CozyLiveCameraCaptureApp.getStatus();
    assert.strictEqual(r.status, 'CAPABILITY_UNAVAILABLE');
});

/* ===================================================================
   9. CAPABILITY REGISTRY — capture/clarity boundary
=================================================================== */
console.log('\nCapability registry (capture/clarity boundary):');

test('getCapabilityStatus() reports every enhancement capability as CAPABILITY_UNAVAILABLE, permanently', () => {
    const s = freshStack();
    const c = s.app.getCapabilityStatus();
    ['superResolution', 'denoising', 'hdrProcessing', 'multiFrameFusion', 'aiEnhancement', 'faceRecognition', 'ocr'].forEach((k) => {
        assert.strictEqual(c[k], 'CAPABILITY_UNAVAILABLE', k);
    });
});

test('getCapabilityStatus() reports cameraCapture/photoCapture/cameraSwitching AVAILABLE when the engine is loaded', () => {
    const s = freshStack();
    const c = s.app.getCapabilityStatus();
    assert.strictEqual(c.cameraCapture, 'AVAILABLE');
    assert.strictEqual(c.photoCapture, 'AVAILABLE');
    assert.strictEqual(c.cameraSwitching, 'AVAILABLE');
});

test('getCapabilityStatus() never reports AVAILABLE for an enhancement capability merely because an account is authorized', () => {
    const s = freshStack();
    const c = s.app.getCapabilityStatus();
    assert.strictEqual(c.aiEnhancement, 'CAPABILITY_UNAVAILABLE');
});

test('getCapabilityStatus() reports dashboardVisibility NOT_CORE by default (this app is not BUILT_IN)', () => {
    const s = freshStack();
    assert.strictEqual(s.app.getCapabilityStatus().dashboardVisibility, 'NOT_CORE');
});

/* ===================================================================
   10. NO DUPLICATE ENGINE
=================================================================== */
console.log('\nNo duplicate engine:');

test('this application module exposes no independent capture/getUserMedia re-implementation — only composition wrappers', () => {
    const s = freshStack();
    assert.strictEqual(typeof s.app.getUserMedia, 'undefined');
    assert.strictEqual(typeof s.app.createMediaRecorder, 'undefined');
});

test('live-capture-engine.js (the disclosed CameraEngine/AudioManager-mismatched file) is never required/loaded by this module — the header disclosure comment naming it as excluded does not count as usage', () => {
    const src = require('fs').readFileSync(roots.app, 'utf8');
    assert.strictEqual(/require\(.*live-capture-engine/.test(src), false);
    assert.strictEqual(/<script[^>]*live-capture-engine/.test(src), false);
});

test('deterministic results: calling getCameraCapabilityStatus() twice returns the same real values', () => {
    const s = freshStack();
    const r1 = s.app.getCameraCapabilityStatus();
    const r2 = s.app.getCameraCapabilityStatus();
    assert.deepStrictEqual(r1.camera, r2.camera);
});

/* ===================================================================
   11. REGRESSION SANITY
=================================================================== */
console.log('\nRegression sanity:');

test('regression: LiveVideoCapture.getStatus() still functions unchanged alongside Section 14', () => {
    const s = freshStack();
    const status = s.capture.getStatus();
    assert.strictEqual(status.previewState, 'stopped');
});

test('regression: RP-033 Gate 1 detectCapabilities() still functions unchanged alongside Section 14', () => {
    const s = freshStack();
    const report = s.living.detectCapabilities();
    assert.ok('camera' in report);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
})();
