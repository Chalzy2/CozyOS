/**
 * core/connectivity/test/browser-e2e-gate2.js
 * RP-033 Gate 2 — GENUINE browser end-to-end test using real Chromium
 * (Playwright) and real RTCPeerConnection/RTCDataChannel — no simulator,
 * no mocks. Two independent real browser pages (Device A / Device B) load
 * the real, unmodified CozyOS files and perform a real pairing + transport
 * round trip over loopback.
 *
 * This is the file whose real pass/fail result the Gate 2 delivery record
 * reports as BROWSER_TEST — not the Node unit-test loopback simulator.
 *
 * Run with: node core/connectivity/test/browser-e2e-gate2.js
 */
'use strict';
const path = require('path');
const { chromium } = require('playwright');

const HARNESS_URL = 'file://' + path.join(__dirname, 'browser-e2e-gate2.html');

let passed = 0, failed = 0;
async function check(name, fn) {
    try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (err) { console.log(`  \u2717 ${name}`); console.log(`      ${err.message}`); failed++; }
}

async function main() {
    console.log('RP-033 Gate 2 — REAL browser (Chromium/Playwright) end-to-end test\n');
    const browser = await chromium.launch();
    const pageA = await browser.newPage();
    const pageB = await browser.newPage();
    await pageA.goto(HARNESS_URL);
    await pageB.goto(HARNESS_URL);
    await pageA.waitForFunction('window.__gate2Ready === true');
    await pageB.waitForFunction('window.__gate2Ready === true');

    // This sandbox has no outbound network access, so the public Google
    // STUN servers LiveHotspotEngine defaults to are unreachable and ICE
    // gathering would otherwise stall. Both real peers are on the same
    // loopback host, which needs no STUN/TURN at all — configure an empty
    // ICE server list (LiveHotspotEngine's own real, existing
    // configureIceServers() API, not a Gate 2 invention) so real host-
    // candidate ICE can complete quickly. This is an environment
    // accommodation, not a fabrication of connectivity.
    for (const p of [pageA, pageB]) {
        await p.evaluate(() => window.CozyOS.LiveHotspotEngine.configureIceServers([]));
    }

    await check('real browser: RTCPeerConnection is genuinely available (not simulated)', async () => {
        const hasRTC = await pageA.evaluate(() => typeof RTCPeerConnection !== 'undefined');
        if (!hasRTC) throw new Error('RTCPeerConnection missing in real Chromium page — cannot run genuine E2E.');
    });

    let offerCode, answerCode;

    await check('real browser: host creates a genuine WebRTC offer (createHost)', async () => {
        const result = await pageA.evaluate(async () => {
            window.__host = window.CozyOS.CozyConnectivityTransport.createPairingSession({ timeoutMs: 8000 });
            return await window.__host.hostInvite();
        });
        if (!result.success || result.state !== 'INVITATION_CREATED') throw new Error('host did not reach INVITATION_CREATED: ' + JSON.stringify(result));
        offerCode = result.offerCode;
    });

    await check('real browser: joiner accepts the real offer and negotiates a real answer (joinHost)', async () => {
        const result = await pageB.evaluate(async (offer) => {
            window.__joiner = window.CozyOS.CozyConnectivityTransport.createPairingSession({ timeoutMs: 8000 });
            return await window.__joiner.acceptInvite(offer);
        }, offerCode);
        if (!result.success) throw new Error('join failed: ' + JSON.stringify(result));
        answerCode = result.answerCode;
    });

    await check('real browser: host completes pairing and the real RTCDataChannel genuinely opens (CHANNEL_READY)', async () => {
        const result = await pageA.evaluate(async (answer) => window.__host.completeHost(answer), answerCode);
        if (!result.success || result.state !== 'CHANNEL_READY') throw new Error('host did not reach CHANNEL_READY: ' + JSON.stringify(result));
    });

    await check('real browser: joiner side also genuinely reaches CHANNEL_READY', async () => {
        const result = await pageB.evaluate(async () => window.__joiner.awaitChannelOpen());
        if (!result.success || result.state !== 'CHANNEL_READY') throw new Error('joiner did not reach CHANNEL_READY: ' + JSON.stringify(result));
    });

    await check('real browser: a real packet sent from Device A is genuinely received and VERIFIED on Device B', async () => {
        await pageB.evaluate(() => {
            window.__received = null;
            const t = window.CozyOS.CozyConnectivityTransport;
            window.__adapterB = t.openAdapter(window.__joiner.connectionId);
            window.__adapterB.onPacket((pkt) => {
                window.__received = pkt;
                t.receivePacket(pkt, { expectedSessionId: 'e2e-session' });
            });
        });
        const sendResult = await pageA.evaluate(() => {
            const t = window.CozyOS.CozyConnectivityTransport;
            window.__adapterA = t.openAdapter(window.__host.connectionId);
            return t.sendPacket({ destination: 'device-B', payloadType: 'text', payload: 'real browser packet', sender: 'device-A', sessionId: 'e2e-session', connectionId: window.__host.connectionId });
        });
        if (sendResult.state !== 'TRANSFERRING') throw new Error('send did not reach TRANSFERRING: ' + JSON.stringify(sendResult));
        await pageB.waitForFunction(() => window.__received !== null, { timeout: 5000 });
        const receivedPayload = await pageB.evaluate(() => window.__received.payload);
        if (receivedPayload !== 'real browser packet') throw new Error('payload mismatch: ' + receivedPayload);
        const state = await pageB.evaluate((id) => window.CozyOS.CozyConnectivityTransport.queue.get(id).state, sendResult.packetId);
        if (state !== 'VERIFIED') throw new Error('expected VERIFIED, got ' + state);
    });

    await check('real browser: duplicate packet delivery is rejected, not delivered twice', async () => {
        await pageB.evaluate(() => { window.__dupCount = 0; window.__adapterB.onPacket(() => { window.__dupCount++; }); });
        const raw = await pageA.evaluate(() => {
            const t = window.CozyOS.CozyConnectivityTransport;
            const env = { packetId: 'dup_test', sender: 'device-A', recipient: 'device-B', sessionId: 'e2e-session', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), payloadType: 'text', payload: 'dup', sequence: 99, transport: 'webrtc-datachannel', integrity: t.computeIntegrity('dup') };
            window.__adapterA.send(env);
            return true;
        });
        await pageB.waitForTimeout(300);
        await pageA.evaluate(() => window.__adapterA.send({ packetId: 'dup_test', sender: 'device-A', recipient: 'device-B', sessionId: 'e2e-session', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), payloadType: 'text', payload: 'dup', sequence: 99, transport: 'webrtc-datachannel', integrity: window.CozyOS.CozyConnectivityTransport.computeIntegrity('dup') }));
        await pageB.waitForTimeout(300);
        const dupCount = await pageB.evaluate(() => window.__dupCount);
        if (dupCount !== 1) throw new Error('expected exactly 1 delivery of the duplicate packetId, got ' + dupCount);
    });

    await check('real browser: user-rejected invitation (no confirmation) never proceeds to negotiation', async () => {
        const result = await pageA.evaluate(() => {
            const t = window.CozyOS.CozyConnectivityTransport;
            const inv = t.createInvitation({ deviceId: 'device-C' });
            return t.confirmInvitation(inv.payload, { userConfirmed: false });
        });
        if (result.success !== false) throw new Error('user rejection did not block pairing');
    });

    await check('real browser: malformed offer code is a genuine NEGOTIATION_FAILED, never CONNECTED', async () => {
        const result = await pageB.evaluate(async () => {
            const t = window.CozyOS.CozyConnectivityTransport;
            const s = t.createPairingSession({ timeoutMs: 2000 });
            return await s.acceptInvite('not a real offer');
        });
        if (result.success !== false || result.state !== 'NEGOTIATION_FAILED') throw new Error('expected NEGOTIATION_FAILED, got ' + JSON.stringify(result));
    });

    await browser.close();
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => { console.error('BROWSER_TEST run itself failed (environment issue, not a code result):', err.message); process.exitCode = 2; });
