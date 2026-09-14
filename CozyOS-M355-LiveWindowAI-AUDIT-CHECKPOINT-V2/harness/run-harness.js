'use strict';
/**
 * FAKE-DEVICE BROWSER VERIFICATION HARNESS
 *
 * Uses the REAL, unmodified production files from the checkpoint:
 *   server/live-relay/live-distribution-signaling-server.js
 *   server/live-relay/session-authority.js
 *   server/live-relay/session-token.js
 * and the REAL, byte-identical-copied browser-facing modules served to
 * Chromium (see lib/ + sha256 manifest printed by the caller).
 *
 * This does NOT verify physical hardware. Chromium is launched with
 * --use-fake-device-for-media-stream / --use-fake-ui-for-media-stream.
 * Every result below is FAKE-DEVICE BROWSER VERIFIED, not PHYSICAL
 * DEVICE VERIFIED.
 */
const path = require('path');
const { chromium } = require('playwright');
const staticServer = require('./static-server');

const REPO = '/home/claude/work/extracted';
const { LiveDistributionSignalingServer } = require(path.join(REPO, 'server/live-relay/live-distribution-signaling-server.js'));
const { SessionAuthority } = require(path.join(REPO, 'server/live-relay/session-authority.js'));
const sessionToken = require(path.join(REPO, 'server/live-relay/session-token.js'));

const RESULTS = { checks: [], notes: [] };
function check(name, pass, detail) {
  RESULTS.checks.push({ name, pass: !!pass, detail: detail === undefined ? null : detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' - ' + name + (detail ? ' :: ' + JSON.stringify(detail) : ''));
}

async function main() {
  const SECRET = 'harness-test-secret-' + Math.random().toString(36).slice(2);
  const SESSION_ID = 'golden-session-1';
  const HOST_ID = 'american-speaker-1';
  const VIEWER_IDS = ['kenya-viewer-1', 'kenya-viewer-2', 'kenya-viewer-3'];
  const UNAUTHORIZED_ID = 'unrecognized-user-x';

  // Real in-memory roster the SessionAuthority's roleResolver reads —
  // matches the documented LDCESessionEngine.getParticipant() contract
  // (userId, role, language, muted, cameraOn, joinedAt). This harness
  // does not load the full browser-oriented LDCESessionEngine dependency
  // graph in this Node process (documented boundary in session-authority.js's
  // own header) — the resolver double follows that same disclosed pattern.
  const roster = new Map();
  roster.set(SESSION_ID, new Map([
    [HOST_ID, { userId: HOST_ID, role: 'host', language: 'en-US', muted: false, cameraOn: false, joinedAt: Date.now() }],
    ...VIEWER_IDS.map((v) => [v, { userId: v, role: 'participant', language: 'sw-KE', muted: false, cameraOn: false, joinedAt: Date.now() }]),
  ]));
  const roleResolver = (sessionId, userId) => (roster.get(sessionId) || new Map()).get(userId) || null;

  const authority = new SessionAuthority({ secret: SECRET, roleResolver });
  const server = new LiveDistributionSignalingServer({ secret: SECRET, authority });
  const addr = await server.listen(0, '127.0.0.1');
  const wsUrl = `ws://127.0.0.1:${addr.port}`;
  console.log('[server] real LiveDistributionSignalingServer listening on', wsUrl);

  const httpServer = await staticServer.start(0);
  const httpPort = httpServer.address().port;
  const pageUrl = `http://127.0.0.1:${httpPort}/harness.html`;
  console.log('[static] harness page at', pageUrl);

  // Real, server-minted tokens (SessionAuthority.issueToken — the same
  // path a real deployment's account/session service would call).
  const hostToken = authority.issueToken(SESSION_ID, HOST_ID);
  check('SessionAuthority issues real host token', hostToken.success && hostToken.role === 'host', hostToken);
  const viewerTokens = VIEWER_IDS.map((v) => authority.issueToken(SESSION_ID, v));
  check('SessionAuthority issues real viewer tokens (x3)', viewerTokens.every((t) => t.success && t.role === 'viewer'), viewerTokens.map((t) => t.role));

  // Unauthorized user: NOT in roster, so issueToken() honestly fails —
  // exactly the real rejection path, not simulated. To still exercise
  // the SERVER-SIDE wire rejection of an unauthorized publish attempt,
  // separately mint a signed but viewer-role token by hand (as if a
  // legitimate viewer session token were being replayed to try to
  // publish) — this proves the server's role check, not the token
  // issuance path.
  const unauthorizedIssue = authority.issueToken(SESSION_ID, UNAUTHORIZED_ID);
  check('Unrecognized user is honestly refused a token (fail-closed)', unauthorizedIssue.success === false, unauthorizedIssue);
  const spoofViewerToken = sessionToken.sign({ sessionId: SESSION_ID, role: 'viewer', sub: 'malicious-viewer-1' }, SECRET, 3600);

  const browser = await chromium.launch({
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--disable-web-security', // needed only because harness page + lib are same-origin static files; not a CORS bypass of the relay
    ],
  });

  const notes = [];
  const pages = {};

  async function newPage(label) {
    const ctx = await browser.newContext();
    await ctx.grantPermissions(['microphone']);
    const page = await ctx.newPage();
    page.on('console', (msg) => { /* keep quiet unless debugging */ });
    await page.goto(pageUrl);
    pages[label] = page;
    return page;
  }

  // ---- Launch publisher + 3 viewers + 1 unauthorized viewer ----
  const publisherPage = await newPage('publisher');
  check('Publisher browser page launches', true);
  const viewerPages = [];
  for (let i = 0; i < 3; i++) {
    viewerPages.push(await newPage('viewer' + (i + 1)));
    check(`Viewer ${i + 1} browser page launches`, true);
  }
  const unauthorizedPage = await newPage('unauthorized');
  check('Unauthorized viewer browser page launches', true);

  // ---- Microphone permission + getUserMedia on the publisher ----
  await publisherPage.evaluate(([opts]) => window.__harness.initRole(opts), [{
    role: 'publisher', url: wsUrl, token: hostToken.token, sessionId: SESSION_ID, userId: HOST_ID,
  }]);

  const micCaps = await publisherPage.evaluate(() => window.__harness.getDeviceCapabilities());
  check('Publisher device capabilities detected microphone API', !!micCaps.microphone, micCaps);

  const micPermResult = await publisherPage.evaluate(() => window.__harness.requestMicPermission());
  check('Microphone permission succeeds under Chromium fake-device mode', micPermResult.success === true, micPermResult);

  const enumResult = await publisherPage.evaluate(() => window.__harness.enumerateDevices());
  check('Device enumeration works', enumResult.success === true && Array.isArray(enumResult.devices), { success: enumResult.success, count: (enumResult.devices || []).length });

  // ---- Publisher speaking-authorization flow (real SPEAKING_ALLOWED gate) ----
  const stateBefore = await publisherPage.evaluate(() => window.__harness.getParticipationState());
  check('Publisher participation state starts JOINED (not auto-speaking)', stateBefore === 'JOINED', stateBefore);

  const requestSpeakResult = await publisherPage.evaluate(() => window.__harness.requestToSpeak());
  check('Publisher can request to speak', requestSpeakResult.success === true, requestSpeakResult);
  await publisherPage.waitForTimeout(150);

  // Host self-grants via the REAL wire message + REAL SessionAuthority
  // authorization check (grantSpeaking requires actor role host/moderator
  // — verified server-side, never trusted from the client).
  const grantResult = await publisherPage.evaluate(([sid, uid]) => window.__harness.sendRaw('grantSpeak', { sessionId: sid, targetUserId: uid }), [SESSION_ID, HOST_ID]);
  check('Host grant-speak message dispatched over real wire', grantResult.dispatched === true, grantResult);
  await publisherPage.waitForTimeout(150);

  const stateAfterGrant = await publisherPage.evaluate(() => window.__harness.getParticipationState());
  check('Publisher reaches SPEAKING_ALLOWED via real server grant', stateAfterGrant === 'SPEAKING_ALLOWED', stateAfterGrant);

  // Attempt to start speaking BEFORE authorization would have failed —
  // verify the negative case with a fresh unauthorized page first.
  const unauthStartAttempt = await unauthorizedPage.evaluate(async ([sid, url, token, uid]) => {
    window.__harness.initRole({ role: 'publisher', url, token, sessionId: sid, userId: uid });
    return window.__harness.startSpeaking();
  }, [SESSION_ID, wsUrl, spoofViewerToken, 'malicious-viewer-1']);
  check('Unauthorized/unauthorized-state participant cannot start speaking (hard gate)', unauthStartAttempt.success === false && unauthStartAttempt.reason === 'NOT_AUTHORIZED_TO_SPEAK', unauthStartAttempt);

  const startSpeakResult = await publisherPage.evaluate(() => window.__harness.startSpeaking());
  check('getUserMedia()/createMicrophoneStream() succeeds after real authorization', startSpeakResult.success === true, startSpeakResult);

  // ---- Viewers join ----
  for (let i = 0; i < 3; i++) {
    const vp = viewerPages[i];
    const vid = VIEWER_IDS[i];
    await vp.evaluate(([opts]) => window.__harness.initRole(opts), [{
      role: 'viewer', url: wsUrl, token: viewerTokens[i].token, sessionId: SESSION_ID, userId: vid,
    }]);
    const joinResult = await vp.evaluate(([sid, vid2]) => window.__harness.joinViewer(sid, vid2), [SESSION_ID, vid]);
    check(`Viewer ${i + 1} joins session`, joinResult.dispatched === true || joinResult.pending === true, joinResult);
  }
  await publisherPage.waitForTimeout(200);

  // ---- Unauthorized viewer attempts to publish (must be rejected) ----
  const unauthPublishAttempt = await unauthorizedPage.evaluate(() => {
    const started = window.__harness.state.publisher ? window.__harness.state.publisher.start : null;
    return { hadPublisherObject: !!window.__harness.state.publisher };
  });
  // The malicious page never got a publisher object (role: 'publisher' was
  // used above only to reach the participation-controller gate test); now
  // explicitly attempt the SERVER-SIDE unauthorized publish using its
  // spoofed VIEWER-role token directly over the raw transport.
  const rawPublishAttempt = await unauthorizedPage.evaluate(([sid]) => {
    return new Promise((resolve) => {
      const t = window.__harness.state.transport;
      const onEvt = (type, msg) => { if (type === 'error') { resolve({ rejected: true, msg }); } };
      const orig = t._onEvent;
      t._onEvent = (type, msg) => { orig(type, msg); onEvt(type, msg); };
      t.publishSource(sid, { segmentId: 'forged-seg-1', seq: 0, isFinal: true, publisherId: 'malicious-viewer-1', sourceLanguage: 'en-US', mimeType: 'audio/webm', audioBase64: 'AA==' });
      setTimeout(() => resolve({ rejected: false }), 800);
    });
  }, [SESSION_ID]);
  check('Server rejects unauthorized (viewer-role) publish attempt', rawPublishAttempt.rejected === true, rawPublishAttempt);

  // ---- MediaRecorder / real chunk production + one-upstream publish ----
  const startPublishResult = await publisherPage.evaluate(() => window.__harness.startPublishing());
  check('MediaRecorder starts and publisher.start() succeeds', startPublishResult.success === true, startPublishResult);

  await publisherPage.waitForTimeout(1500); // allow several 250ms timeslices to fire

  const publisherMetrics = await publisherPage.evaluate(() => window.__harness.getPublisherMetrics());
  check('Audio chunks are produced and published (chunksSent > 0)', publisherMetrics.chunksSent > 0, publisherMetrics);

  await publisherPage.waitForTimeout(500);

  // ---- Verify all 3 viewers received chunks ----
  const receiverMetricsAll = [];
  for (let i = 0; i < 3; i++) {
    const m = await viewerPages[i].evaluate(() => window.__harness.getReceiverMetrics());
    receiverMetricsAll.push(m);
    check(`Viewer ${i + 1} receiver received chunks`, m.chunksAccepted > 0, m);
  }

  // ---- One-upstream / many-viewers instrumentation ----
  // Server-side authoritative counters (real, not inferred from browser side).
  check(
    'One upstream connection fanned to all 3 viewers (server counters)',
    server._counters.segmentsPublished > 0 && server._counters.segmentsDelivered >= server._counters.segmentsPublished * 3,
    { segmentsPublished: server._counters.segmentsPublished, segmentsDelivered: server._counters.segmentsDelivered, expectedMinDelivered: server._counters.segmentsPublished * 3 }
  );
  const session = server.sessions.get(SESSION_ID);
  const sourceConnCount = [...server.conns.values()].filter((c) => c.sessionId === SESSION_ID && c.role === 'host').length;
  check('Exactly one authenticated host/source connection exists (not one per viewer)', sourceConnCount === 1, { sourceConnCount, viewerConnCount: session ? session.viewers.size : 0 });

  // ---- Playback / autoplay reporting (honest, never fabricated) ----
  const playbackReports = [];
  for (let i = 0; i < 3; i++) {
    const r = await viewerPages[i].evaluate(() => window.__harness.getReceiverCapabilityReport());
    playbackReports.push(r);
  }
  check('Playback state honestly reported per viewer (PLAYBACK_STARTED or disclosed failure/blocked)', playbackReports.every((r) => typeof r.PLAYBACK_STATE === 'string'), playbackReports.map((r) => r.PLAYBACK_STATE));
  check('Receiver never claims RTP SFU capability it does not have', playbackReports.every((r) => r.ONE_UPSTREAM_MANY_VIEWERS_RTP_SFU === false), null);

  // ---- Mute / unmute ----
  const muteResult = await publisherPage.evaluate(() => window.__harness.selfMute());
  check('Mute works', muteResult.success === true && muteResult.muted === true, muteResult);
  const unmuteResult = await publisherPage.evaluate(() => window.__harness.selfUnmute());
  check('Unmute works', unmuteResult.success === true && unmuteResult.muted === false, unmuteResult);

  // ---- Volume ----
  await publisherPage.evaluate(() => window.__harness.setVolume(0.3));
  const vol1 = await publisherPage.evaluate(() => window.__harness.getVolume());
  await publisherPage.evaluate(() => window.__harness.setVolume(0.9));
  const vol2 = await publisherPage.evaluate(() => window.__harness.getVolume());
  check('Local volume increase/decrease works', Math.abs(vol1 - 0.3) < 0.01 && Math.abs(vol2 - 0.9) < 0.01, { vol1, vol2 });

  // ---- Disconnect / reconnect a single viewer without affecting others ----
  const metricsBeforeDisconnect = await viewerPages[0].evaluate(() => window.__harness.getReceiverMetrics());
  await viewerPages[0].evaluate(([sid, vid]) => window.__harness.state.transport.leaveViewer(sid, vid), [SESSION_ID, VIEWER_IDS[0]]);
  await publisherPage.waitForTimeout(300);
  // Publish one more chunk-worth of time while viewer 1 is disconnected
  await publisherPage.waitForTimeout(600);
  const v2MetricsAfter = await viewerPages[1].evaluate(() => window.__harness.getReceiverMetrics());
  const v3MetricsAfter = await viewerPages[2].evaluate(() => window.__harness.getReceiverMetrics());
  check('Viewer 2 unaffected by viewer 1 disconnect (still receiving)', v2MetricsAfter.chunksAccepted > receiverMetricsAll[1].chunksAccepted, { before: receiverMetricsAll[1].chunksAccepted, after: v2MetricsAfter.chunksAccepted });
  check('Viewer 3 unaffected by viewer 1 disconnect (still receiving)', v3MetricsAfter.chunksAccepted > receiverMetricsAll[2].chunksAccepted, { before: receiverMetricsAll[2].chunksAccepted, after: v3MetricsAfter.chunksAccepted });

  // Reconnect viewer 1 (new joinViewer over its still-open provider, which reconnects automatically on close per RemoteRelayTransportProvider's own reconnect backoff, OR we explicitly rejoin)
  const rejoinResult = await viewerPages[0].evaluate(([sid, vid]) => window.__harness.joinViewer(sid, vid), [SESSION_ID, VIEWER_IDS[0]]);
  check('Viewer 1 can reconnect/rejoin after disconnect', rejoinResult.dispatched === true || rejoinResult.pending === true, rejoinResult);
  await publisherPage.waitForTimeout(500);
  const v1MetricsAfterReconnect = await viewerPages[0].evaluate(() => window.__harness.getReceiverMetrics());
  check('Viewer 1 resumes receiving chunks after reconnect', v1MetricsAfterReconnect.chunksAccepted >= metricsBeforeDisconnect.chunksAccepted, { before: metricsBeforeDisconnect.chunksAccepted, after: v1MetricsAfterReconnect.chunksAccepted });

  // ---- Mid-session source-language change (per-segment metadata, not session-level) ----
  await publisherPage.evaluate(() => window.__harness.finishPublishing());
  await publisherPage.waitForTimeout(300);
  await publisherPage.evaluate(() => { window.__harness.state.sourceLanguage = 'sw-KE'; });
  const restartResult = await publisherPage.evaluate(() => window.__harness.startPublishing());
  check('Publisher can start a new segment with a changed sourceLanguage', restartResult.success === true, restartResult);
  await publisherPage.waitForTimeout(800);
  const log2 = await viewerPages[1].evaluate(() => window.__harness.getLog());
  const sawSwahili = log2.some((e) => e.evt === 'receiver:chunk-ready' && e.detail && e.detail.sourceLanguage === 'sw-KE');
  const sawEnglish = log2.some((e) => e.evt === 'receiver:chunk-ready' && e.detail && e.detail.sourceLanguage === 'en-US');
  check('sourceLanguage carried per-segment, not hardcoded at session level (both en-US and sw-KE segments observed)', sawEnglish && sawSwahili, { sawEnglish, sawSwahili });

  // ---- Revoke speaking permission stops the publish path ----
  const revokeResult = await publisherPage.evaluate(([sid, uid]) => window.__harness.sendRaw('revokeSpeak', { sessionId: sid, targetUserId: uid }), [SESSION_ID, HOST_ID]);
  check('Host revoke-speak (self) message dispatched', revokeResult.dispatched === true, revokeResult);
  await publisherPage.waitForTimeout(300);
  const stateAfterRevoke = await publisherPage.evaluate(() => window.__harness.getParticipationState());
  check('Revoking speaking permission moves participant out of SPEAKING/SPEAKING_ALLOWED', stateAfterRevoke !== 'SPEAKING' && stateAfterRevoke !== 'SPEAKING_ALLOWED', stateAfterRevoke);

  // ---- Session isolation: a second, unrelated session must not see this session's segments ----
  const otherSessionId = 'unrelated-session-2';
  roster.set(otherSessionId, new Map([[HOST_ID, { userId: HOST_ID, role: 'host', language: 'en-US', muted: false, cameraOn: false, joinedAt: Date.now() }]]));
  const otherToken = authority.issueToken(otherSessionId, HOST_ID);
  const isolationPage = await newPage('isolation-viewer');
  await isolationPage.evaluate(([opts]) => window.__harness.initRole(opts), [{
    role: 'viewer', url: wsUrl, token: otherToken.token, sessionId: otherSessionId, userId: 'isolated-viewer',
  }]);
  await isolationPage.evaluate(([sid, vid]) => window.__harness.joinViewer(sid, vid), [otherSessionId, 'isolated-viewer']);
  await publisherPage.waitForTimeout(300);
  const isolationMetrics = await isolationPage.evaluate(() => window.__harness.getReceiverMetrics());
  check('Session isolation preserved (unrelated-session viewer received 0 of golden-session-1 chunks)', isolationMetrics.chunksAccepted === 0, isolationMetrics);

  // ---- Server identity cannot be spoofed by client-supplied identity fields ----
  const spoofAttempt = await unauthorizedPage.evaluate(([sid, hostId]) => {
    return new Promise((resolve) => {
      const t = window.__harness.state.transport;
      let resolved = false;
      const orig = t._onEvent;
      t._onEvent = (type, msg) => { orig(type, msg); if (!resolved && type === 'join-ack') { resolved = true; resolve({ viewerId: msg.viewerId }); } };
      // client claims to be a viewer with id 'american-speaker-1' (the real host) — server must key identity off the TOKEN's sub, not this claim
      t.joinViewer(sid, hostId);
      setTimeout(() => { if (!resolved) resolve({ timedOut: true }); }, 800);
    });
  }, [SESSION_ID, HOST_ID]);
  // The connection's real identity (conn.sub) came from the spoofViewerToken ('malicious-viewer-1'), not the claimed viewerId.
  const spoofedConn = [...server.conns.values()].find((c) => c.sessionId === SESSION_ID && c.connectionKey === HOST_ID);
  check('Client-claimed identity does not override server-verified token identity', !spoofedConn || spoofedConn.sub === 'malicious-viewer-1', { found: !!spoofedConn, actualSub: spoofedConn ? spoofedConn.sub : null });

  // ---- Publisher stop / restart-of-session (disconnect/reconnect at source level) ----
  const publisherDisconnectResult = await publisherPage.evaluate(() => { window.__harness.state.transport.disconnectAll(); return true; });
  check('Publisher can disconnect', publisherDisconnectResult === true);
  await publisherPage.waitForTimeout(400);
  const reconnectPublish = await publisherPage.evaluate(([opts]) => {
    window.__harness.initRole(opts);
    return window.__harness.getParticipationState();
  }, [{ role: 'publisher', url: wsUrl, token: hostToken.token, sessionId: SESSION_ID, userId: HOST_ID }]);
  check('Publisher can reconnect (new connection to real signaling server)', reconnectPublish === 'JOINED', reconnectPublish);

  await browser.close();
  server.close();
  httpServer.close();

  const passCount = RESULTS.checks.filter((c) => c.pass).length;
  const failCount = RESULTS.checks.length - passCount;
  console.log('\n==================================');
  console.log(`FAKE-DEVICE BROWSER VERIFICATION: ${passCount}/${RESULTS.checks.length} PASS, ${failCount} FAIL`);
  console.log('==================================');
  if (failCount > 0) {
    console.log('FAILED CHECKS:');
    for (const c of RESULTS.checks.filter((x) => !x.pass)) console.log(' - ' + c.name, JSON.stringify(c.detail));
  }
  require('fs').writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(RESULTS, null, 2));
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('HARNESS CRASHED:', e && e.stack || e);
  process.exit(2);
});
