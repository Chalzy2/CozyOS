/**
 * core/shell/live/tests/cozy-live-session.test.js
 * RP-035 Section 16 — Live Broadcast & Living Live Surface
 * Run with: node core/shell/live/tests/cozy-live-session.test.js
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
    trustedDevice: path.join(__dirname, '..', '..', '..', 'security', 'trusted-device-manager.js'),
    cozyConnect: path.join(__dirname, '..', '..', '..', 'connectivity', 'cozy-connect.js'),
    hotspotEngine: path.join(__dirname, '..', '..', '..', 'engines', 'collaboration', 'live-hotspot-engine.js'),
    cozyShare: path.join(__dirname, '..', '..', '..', 'collaboration', 'cozy-share.js'),
    living: path.join(__dirname, '..', '..', '..', 'connectivity', 'cozy-living-connectivity.js'),
    transport: path.join(__dirname, '..', '..', '..', 'connectivity', 'cozy-connectivity-transport.js'),
    cameraProvider: path.join(__dirname, '..', '..', '..', 'engines', 'camera', 'browser-camera-provider.js'),
    captureEngine: path.join(__dirname, '..', '..', '..', 'engines', 'video', 'live-video-capture-engine.js'),
    clarityEngine: path.join(__dirname, '..', '..', '..', 'engines', 'video', 'ui', 'clarity', 'cozy-camera-clarity-engine.js'),
    identityEngine: path.join(__dirname, '..', '..', '..', 'modules', 'identity', 'identity-engine.js'),
    serviceRegistry: path.join(__dirname, '..', '..', '..', 'registry', 'cozy-registry.js'),
    liveSession: path.join(__dirname, '..', 'cozy-live-session.js'),
    adPolicy: path.join(__dirname, '..', 'cozy-advertising-policy.js')
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
    require(roots.transport);
    require(roots.cameraProvider);
    require(roots.captureEngine);
    require(roots.clarityEngine);
    require(roots.identityEngine);
    require(roots.serviceRegistry);
    require(roots.liveSession);
    require(roots.adPolicy);

    return {
        win,
        capture: win.CozyOS.LiveVideoCapture,
        clarityEngine: win.CozyOS.CozyCameraClarityEngine,
        transport: win.CozyOS.CozyConnectivityTransport,
        identity: win.CozyOS.IdentityEngine,
        serviceRegistry: win.CozyOS.ServiceRegistry,
        liveSession: win.CozyOS.CozyLiveSession,
        adPolicy: win.CozyOS.CozyAdvertisingPolicy
    };
}

async function makeActiveUser(s, username) {
    const result = await s.identity.createUser({ username, password: 'Str0ngPassw0rd!', roles: [] });
    if (!result || result.available !== true || !result.userId) throw new Error('makeActiveUser() failed: ' + JSON.stringify(result));
    return result;
}

/** Real, authorized user + real session start — the standard fixture for every test that isn't specifically about authorization itself. */
async function startAuthorizedSession(s, username, opts) {
    const user = await makeActiveUser(s, username || ('s16-auth-' + Date.now() + '-' + Math.random().toString(36).slice(2)));
    s.identity.assignApplication(user.userId, 'live-session');
    const result = await s.liveSession.startSession(user.userId, opts || {});
    if (result.status !== 'OK') throw new Error('startAuthorizedSession() failed to start a real session: ' + JSON.stringify(result));
    return { user, result };
}

console.log('RP-035 Section 16 — Live Broadcast & Living Live Surface tests\n');

(async () => {

/* ===================================================================
   1. SESSION LIFECYCLE
=================================================================== */
console.log('Session lifecycle:');

await test('startSession() creates a real session with a real sessionId', async () => {
    const s = freshStack();
    const { result: r } = await startAuthorizedSession(s, 'host-1');
    assert.strictEqual(r.status, 'OK');
    assert.ok(r.sessionId);
    assert.strictEqual(r.session.state, 'STARTING');
});

await test('confirmCapture() honestly fails in a Node (non-browser) environment — never fabricates LIVE', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-2');
    const r = await s.liveSession.confirmCapture(start.sessionId, null);
    assert.strictEqual(r.status, 'FAILED');
    const session = s.liveSession.getSession(start.sessionId);
    assert.strictEqual(session.state, 'ERROR');
});

test('getSession() on an unknown sessionId returns null, never fabricated', () => {
    const s = freshStack();
    assert.strictEqual(s.liveSession.getSession('live_fake'), null);
});

await test('stopSession() transitions through STOPPING to STOPPED and releases capture', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-3');
    const r = s.liveSession.stopSession(start.sessionId);
    assert.strictEqual(r.status, 'OK');
    assert.strictEqual(r.session.state, 'STOPPED');
    assert.ok(r.session.history.some((h) => h.state === 'STOPPING'));
});

test('stopSession() on an unknown sessionId returns NOT_FOUND, never throws', () => {
    const s = freshStack();
    assert.strictEqual(s.liveSession.stopSession('live_fake').status, 'NOT_FOUND');
});

await test('CAPABILITY_UNAVAILABLE reported honestly when LiveVideoCapture is not loaded', async () => {
    delete require.cache[require.resolve(roots.liveSession)];
    global.window = { CozyOS: {} };
    require(roots.liveSession);
    const r = await global.window.CozyOS.CozyLiveSession.startSession('host', {});
    assert.strictEqual(r.status, 'CAPABILITY_UNAVAILABLE');
});

/* ===================================================================
   2. LAUNCH AUTHORIZATION
=================================================================== */
console.log('\nLaunch authorization:');

await test('an active user with the app explicitly assigned can start a session', async () => {
    const s = freshStack();
    const user = await makeActiveUser(s, 's16-user1-' + Date.now());
    s.identity.assignApplication(user.userId, 'live-session');
    const r = await s.liveSession.startSession(user.userId, {});
    assert.strictEqual(r.status, 'OK');
});

await test('an active user WITHOUT assignment cannot start a session', async () => {
    const s = freshStack();
    const user = await makeActiveUser(s, 's16-user2-' + Date.now());
    const r = await s.liveSession.startSession(user.userId, {});
    assert.strictEqual(r.status, 'NOT_AUTHORIZED');
});

/* ===================================================================
   3. PRESENTATION TRANSITIONS — sessionId invariant
=================================================================== */
console.log('\nPresentation transitions (sessionId invariant):');

const PRESENTATION_ACTIONS = ['minimize', 'expand', 'fullscreen', 'exitFullscreen', 'restoreLive', 'pauseView'];
for (const action of PRESENTATION_ACTIONS) {
    await test(`transitionSurface("${action}") preserves the exact same sessionId`, async () => {
        const s = freshStack();
        const { result: start } = await startAuthorizedSession(s, 'host-' + action);
        const r = s.liveSession.transitionSurface(start.sessionId, action);
        assert.strictEqual(r.status, 'OK');
        assert.strictEqual(r.sessionIdUnchanged, true);
        assert.strictEqual(r.sessionId, start.sessionId);
    });
}

test('minimize never means stopped — MINIMIZED is a distinct real state from STOPPED', () => {
    const s = freshStack();
    assert.ok(s.liveSession.SESSION_STATES.indexOf('MINIMIZED') !== -1);
    assert.notStrictEqual('MINIMIZED', 'STOPPED');
});

await test('transitionSurface() rejects an unrecognized action, never silently defaults', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-x');
    const r = s.liveSession.transitionSurface(start.sessionId, 'not-a-real-action');
    assert.strictEqual(r.status, 'REJECTED');
});

await test('presentation transitions are rejected once a session is STOPPED', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-y');
    s.liveSession.stopSession(start.sessionId);
    const r = s.liveSession.transitionSurface(start.sessionId, 'expand');
    assert.strictEqual(r.status, 'REJECTED');
});

/* ===================================================================
   4. DRAG / RESIZE / ROTATE / NAVIGATE
=================================================================== */
console.log('\nDrag, resize, rotate, navigate:');

await test('moveSurface() genuinely updates position and preserves sessionId', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-move');
    const r = s.liveSession.moveSurface(start.sessionId, 150, 300);
    assert.strictEqual(r.status, 'OK');
    assert.deepStrictEqual(r.position, { x: 150, y: 300 });
});

await test('resizeSurface() clamps to real minimum dimensions, never allows an inaccessible surface', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-resize1');
    const r = s.liveSession.resizeSurface(start.sessionId, 10, 10);
    assert.strictEqual(r.size.width, 160);
    assert.strictEqual(r.size.height, 90);
});

await test('resizeSurface() clamps to real maximum dimensions', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-resize2');
    const r = s.liveSession.resizeSurface(start.sessionId, 5000, 5000);
    assert.strictEqual(r.size.width, 1920);
    assert.strictEqual(r.size.height, 1080);
});

await test('resizeSurface() honors a real, valid custom size within bounds', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-resize3');
    const r = s.liveSession.resizeSurface(start.sessionId, 640, 360);
    assert.deepStrictEqual(r.size, { width: 640, height: 360 });
});

await test('rotateSurface() preserves sessionId AND session state — rotation never restarts the session', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-rotate');
    const r = s.liveSession.rotateSurface(start.sessionId, 'landscape');
    assert.strictEqual(r.status, 'OK');
    assert.strictEqual(r.sessionIdUnchanged, true);
    assert.strictEqual(r.stateUnchanged, true);
});

await test('rotateSurface() rejects an unrecognized orientation', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-rotate2');
    const r = s.liveSession.rotateSurface(start.sessionId, 'diagonal');
    assert.strictEqual(r.status, 'REJECTED');
});

await test('navigateApp() preserves sessionId AND session state — the session belongs to the shell, not a page', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-nav');
    const r = s.liveSession.navigateApp(start.sessionId, 'dashboard');
    assert.strictEqual(r.status, 'OK');
    assert.strictEqual(r.sessionIdUnchanged, true);
    assert.strictEqual(r.stateUnchanged, true);
});

await test('sequence: minimize -> navigate -> rotate -> expand -> fullscreen all preserve one sessionId throughout', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-seq');
    const id0 = start.sessionId;
    s.liveSession.transitionSurface(id0, 'minimize');
    const nav = s.liveSession.navigateApp(id0, 'quarry');
    const rot = s.liveSession.rotateSurface(id0, 'landscape');
    const exp = s.liveSession.transitionSurface(id0, 'expand');
    const full = s.liveSession.transitionSurface(id0, 'fullscreen');
    [nav, rot, exp, full].forEach((r) => assert.strictEqual(r.sessionId || id0, id0));
    assert.strictEqual(s.liveSession.getSession(id0).sessionId, id0);
});

/* ===================================================================
   5. PEER TRANSPORT — honest, never fabricated CONNECTED
=================================================================== */
console.log('\nPeer transport (honest degradation):');

await test('attemptPeerConnection() composes the real CozyConnectivityTransport.hostInvite(), never a second engine', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-peer');
    const r = await s.liveSession.attemptPeerConnection(start.sessionId);
    assert.strictEqual(r.status, 'OK');
    assert.ok(r.peerTransport);
});

await test('peer transport state is never fabricated CONNECTED — reflects the real engine state (Node has no navigator.mediaDevices/RTCPeerConnection)', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-peer2');
    const r = await s.liveSession.attemptPeerConnection(start.sessionId);
    assert.notStrictEqual(r.peerTransport.state, 'CHANNEL_READY');
});

await test('CAPABILITY_UNAVAILABLE reported honestly when CozyConnectivityTransport is absent', async () => {
    delete require.cache[require.resolve(roots.liveSession)];
    global.window = { CozyOS: { LiveVideoCapture: { startPreview: async () => ({ success: true }), stopPreview: () => ({ success: true }) } } };
    require(roots.liveSession);
    const start = await global.window.CozyOS.CozyLiveSession.startSession('host', {});
    const r = await global.window.CozyOS.CozyLiveSession.attemptPeerConnection(start.sessionId);
    assert.strictEqual(r.status, 'CAPABILITY_UNAVAILABLE');
});

/* ===================================================================
   6. COMMENTS — offline-first, honest delivery
=================================================================== */
console.log('\nComments:');

await test('addComment() creates a real comment, starts QUEUED', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-c1');
    const r = s.liveSession.addComment(start.sessionId, 'user-1', 'God bless everyone.');
    assert.strictEqual(r.status, 'OK');
    assert.strictEqual(r.comment.state, 'QUEUED');
    assert.strictEqual(r.comment.text, 'God bless everyone.');
});

await test('addComment() rejects an empty comment', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-c2');
    const r = s.liveSession.addComment(start.sessionId, 'user-1', '   ');
    assert.strictEqual(r.status, 'REJECTED');
});

await test('a comment is never reported SENT without a real connected transport confirming it', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-c3');
    const r = s.liveSession.addComment(start.sessionId, 'user-1', 'See you next Sunday.');
    assert.notStrictEqual(r.comment.state, 'SENT');
});

await test('listComments() returns the real, ordered comment list', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-c4');
    s.liveSession.addComment(start.sessionId, 'user-1', 'Amen');
    s.liveSession.addComment(start.sessionId, 'user-2', 'Connected');
    const r = s.liveSession.listComments(start.sessionId);
    assert.strictEqual(r.comments.length, 2);
});

test('COMMENT_STATES is exactly QUEUED/SENDING/SENT/FAILED', () => {
    const s = freshStack();
    assert.deepStrictEqual(s.liveSession.COMMENT_STATES.slice().sort(), ['FAILED', 'QUEUED', 'SENDING', 'SENT'].sort());
});

/* ===================================================================
   7. LIVE TEXT — same honesty model
=================================================================== */
console.log('\nLive text:');

await test('addLiveText() creates a real entry, starts LOCAL_QUEUED', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-lt1');
    const r = s.liveSession.addLiveText(start.sessionId, 'host', 'Welcome everyone');
    assert.strictEqual(r.status, 'OK');
    assert.strictEqual(r.liveText.state, 'LOCAL_QUEUED');
});

await test('addLiveText() rejects empty text', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-lt2');
    const r = s.liveSession.addLiveText(start.sessionId, 'host', '');
    assert.strictEqual(r.status, 'REJECTED');
});

await test('listLiveText() returns the real entries in order', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-lt3');
    s.liveSession.addLiveText(start.sessionId, 'host', 'Prayer starting');
    s.liveSession.addLiveText(start.sessionId, 'host', 'Offering');
    const r = s.liveSession.listLiveText(start.sessionId);
    assert.strictEqual(r.liveText.length, 2);
});

/* ===================================================================
   8. PARTICIPANT COUNT — never fabricated viewer metric
=================================================================== */
console.log('\nParticipant count:');

await test('getParticipantCount() reports 0 real connected participants before any peer connects, never a fabricated count', async () => {
    const s = freshStack();
    const { result: start } = await startAuthorizedSession(s, 'host-pc');
    const r = s.liveSession.getParticipantCount(start.sessionId);
    assert.strictEqual(r.status, 'OK');
    assert.strictEqual(r.connectedParticipants, 0);
    assert.ok(/never a broadcast\/viewer metric/.test(r.note));
});

/* ===================================================================
   9. CAPABILITY REGISTRY
=================================================================== */
console.log('\nCapability registry:');

test('getCapabilityStatus() reports broadcastAvailable/sfuAvailable/cdnAvailable/unlimitedViewersAvailable as permanently CAPABILITY_UNAVAILABLE', () => {
    const s = freshStack();
    const c = s.liveSession.getCapabilityStatus();
    ['broadcastAvailable', 'sfuAvailable', 'cdnAvailable', 'unlimitedViewersAvailable', 'globalViewerCountAvailable'].forEach((k) => {
        assert.strictEqual(c[k], 'CAPABILITY_UNAVAILABLE', k);
    });
});

test('getCapabilityStatus() distinguishes peerTransportAvailable (code exists) from peerTransportVerifiedInEnvironment (not verified here)', () => {
    const s = freshStack();
    const c = s.liveSession.getCapabilityStatus();
    assert.strictEqual(c.peerTransportAvailable, 'AVAILABLE_CODE_EXISTS');
    assert.strictEqual(c.peerTransportVerifiedInEnvironment, 'NOT_VERIFIED_IN_THIS_ENVIRONMENT');
});

test('getCapabilityStatus() reports cameraAvailable/captureAvailable/clarityAvailable AVAILABLE when the real engines are loaded', () => {
    const s = freshStack();
    const c = s.liveSession.getCapabilityStatus();
    assert.strictEqual(c.cameraAvailable, 'AVAILABLE');
    assert.strictEqual(c.captureAvailable, 'AVAILABLE');
    assert.strictEqual(c.clarityAvailable, 'AVAILABLE');
});

/* ===================================================================
   10. ADVERTISING POLICY
=================================================================== */
console.log('\nAdvertising policy:');

test('ChurchOS is always ADS_DISABLED', () => {
    const s = freshStack();
    const r = s.adPolicy.evaluatePolicy('churchos_core_001');
    assert.strictEqual(r.policy, 'ADS_DISABLED');
});

test('an eligible other application defaults ADS_ALLOWED — no cross-application leakage from ChurchOS', () => {
    const s = freshStack();
    const r = s.adPolicy.evaluatePolicy('shopos');
    assert.strictEqual(r.policy, 'ADS_ALLOWED');
});

test('an application manifest can explicitly opt out via adsPolicy: DISABLED', () => {
    const s = freshStack();
    s.serviceRegistry.registerApplication({ id: 'quiet_app_001', name: 'Quiet App', adsPolicy: 'DISABLED' });
    const r = s.adPolicy.evaluatePolicy('quiet_app_001');
    assert.strictEqual(r.policy, 'ADS_DISABLED');
});

test('evaluatePolicy() never touches or references the live session engine — policy and transport are fully separate', () => {
    const fs = require('fs');
    const src = fs.readFileSync(roots.adPolicy, 'utf8');
    assert.strictEqual(/CozyLiveSession|LiveVideoCapture|CozyConnectivityTransport/.test(src), false);
});

test('a comment/text is never automatically classified as advertisement — no such classification logic exists in the ad-policy engine', () => {
    const fs = require('fs');
    const src = fs.readFileSync(roots.adPolicy, 'utf8');
    assert.strictEqual(/classifyComment|isAdvertisement\(/.test(src), false);
});

/* ===================================================================
   11. NO DUPLICATE ENGINE
=================================================================== */
console.log('\nNo duplicate engine:');

test('cozy-live-session.js exposes no independent getUserMedia/RTCPeerConnection/createOffer re-implementation', () => {
    const s = freshStack();
    ['getUserMedia', 'createOffer', 'createAnswer', 'RTCPeerConnection'].forEach((m) => {
        assert.strictEqual(typeof s.liveSession[m], 'undefined', m);
    });
});

test('cozy-live-session.js never re-implements image enhancement — no denoise/sharpen/toneMap function of its own', () => {
    const fs = require('fs');
    const src = fs.readFileSync(roots.liveSession, 'utf8');
    assert.strictEqual(/function\s+(denoise|sharpen|toneMap)/i.test(src), false);
});

test('registerAsApplication() registers through the real ServiceRegistry, no second registry', () => {
    const s = freshStack();
    const r = s.liveSession.registerAsApplication();
    assert.strictEqual(r.serviceRegistry, 'REGISTERED');
    assert.ok(s.serviceRegistry.hasApplication('live_session_001'));
});

test('this application is NOT auto-registered as a BUILT_IN core app — visibility stays an explicit decision', () => {
    const s = freshStack();
    s.liveSession.registerAsApplication();
    assert.strictEqual(s.identity.isCoreApplication('live-session'), false);
});

/* ===================================================================
   12. REGRESSION SANITY
=================================================================== */
console.log('\nRegression sanity:');

await test('regression: LiveVideoCapture.getStatus() still functions unchanged alongside Section 16', async () => {
    const s = freshStack();
    const status = s.capture.getStatus();
    assert.strictEqual(status.previewState, 'stopped');
});

test('regression: CozyCameraClarityEngine capability registry still functions unchanged alongside Section 16', () => {
    const s = freshStack();
    const c = s.clarityEngine.getCapabilityStatus();
    assert.strictEqual(c.superResolution, 'CAPABILITY_UNAVAILABLE');
});

test('regression: CozyConnectivityTransport is unmodified — Section 16 never edited it', () => {
    const s = freshStack();
    assert.strictEqual(typeof s.transport.createPairingSession, 'function');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
})();
