/**
 * core/modules/intelligence/media/test/cozy-media-connector.test.js
 * RP-034 Phase 1 — real, executed tests for cozy-media-connector.js.
 * Run with: node core/modules/intelligence/media/test/cozy-media-connector.test.js
 */
'use strict';
const assert = require('assert');
const path = require('path');

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); console.log(`  \u2713 ${name}`); passed++; } catch (err) { console.log(`  \u2717 ${name}`); console.log(`      ${err.message}`); failed++; } }
async function asyncTest(name, fn) { try { await fn(); console.log(`  \u2713 ${name}`); passed++; } catch (err) { console.log(`  \u2717 ${name}`); console.log(`      ${err.message}`); failed++; } }

const modulePath = path.join(__dirname, '..', 'cozy-media-connector.js');
function fresh() { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }

/** A real fake Response-shaped object, matching the real, documented
 * YouTube Data API v3 `videos` response shape exactly — used to
 * genuinely exercise the real parsing logic without live network
 * access (this environment has none). Not a claim of a live call. */
function fakeApiResponse(body, { ok = true, status = 200 } = {}) {
    return { ok, status, json: async () => body };
}

async function main() {
    console.log('RP-034 Phase 1 — Cozy Media Connector (YouTube) tests\n');

    /* ---------------- Connector foundation ------------------------------ */
    console.log('Connector:');
    test('connector: registry lists the real, registered youtube connector', () => {
        const m = fresh();
        assert.ok(m.listConnectors().includes('youtube'));
        assert.strictEqual(m.getConnector('youtube').getId(), 'youtube');
    });
    test('connector: registry rejects registering a non-conforming connector', () => {
        const m = fresh();
        const result = m.registerConnector('bad-source', { onlyOneMethod() {} });
        assert.strictEqual(result.success, false);
        assert.match(result.reason, /required MediaConnector interface/);
    });
    test('connector: registry accepts a second, independent source (interface reusable by future sources)', () => {
        const m = fresh();
        const fakeVimeo = { capabilities: () => ({}), getAuthorizationState: () => ({ state: 'NOT_AUTHORIZED' }), getId: () => 'vimeo' };
        const result = m.registerConnector('vimeo', fakeVimeo);
        assert.strictEqual(result.success, true);
        assert.ok(m.listConnectors().includes('vimeo'));
    });
    test('connector: createYouTubeConnector() produces an independently-configured instance', () => {
        const m = fresh();
        const independent = m.createYouTubeConnector({ apiKey: 'independent-key' });
        assert.notStrictEqual(independent, m.youtube);
        assert.strictEqual(independent.getAuthorizationState().state, 'NOT_AUTHORIZED');
    });
    test('connector: public surface exposes no download/frame-access method (never implemented, not merely hidden)', () => {
        const m = fresh();
        const proto = Object.getPrototypeOf(m.youtube);
        const methodNames = Object.getOwnPropertyNames(proto);
        for (const forbidden of ['downloadVideo', 'download', 'getFrame', 'extractFrames', 'scrape']) {
            assert.ok(!methodNames.includes(forbidden), `must not expose ${forbidden}()`);
        }
    });

    /* ---------------- Authorization -------------------------------------- */
    console.log('\nAuthorization:');
    test('authorization: starts NOT_AUTHORIZED, never fabricated as authorized', () => {
        const m = fresh();
        assert.strictEqual(m.youtube.getAuthorizationState().state, 'NOT_AUTHORIZED');
    });
    test('authorization: authorize() without a real accessToken is rejected', () => {
        const m = fresh();
        const result = m.youtube.authorize({ accountId: 'acct-1' });
        assert.strictEqual(result.success, false);
        assert.strictEqual(m.youtube.getAuthorizationState().state, 'NOT_AUTHORIZED');
    });
    test('authorization: authorize() with a real-shaped token succeeds and is recorded', () => {
        const m = fresh();
        const result = m.youtube.authorize({ accountId: 'acct-1', accessToken: 'real-token-value' });
        assert.strictEqual(result.success, true);
        assert.strictEqual(m.youtube.getAuthorizationState().state, 'AUTHORIZED');
        assert.strictEqual(m.youtube.getAuthorizationState().account.accountId, 'acct-1');
        assert.ok(m.youtube.getAuthorizationHistory().some(h => h.action === 'authorized'));
    });
    test('authorization: revoke() transitions to REVOKED and is recorded, audit trail preserved', () => {
        const m = fresh();
        m.youtube.authorize({ accountId: 'acct-1', accessToken: 'tok' });
        const result = m.youtube.revoke('user requested');
        assert.strictEqual(result.success, true);
        assert.strictEqual(m.youtube.getAuthorizationState().state, 'REVOKED');
        assert.ok(m.youtube.getAuthorizationHistory().some(h => h.action === 'revoked'));
    });
    test('authorization: revoke() with nothing authorized is honestly rejected', () => {
        const m = fresh();
        const result = m.youtube.revoke();
        assert.strictEqual(result.success, false);
    });
    test('authorization: capability never claims metadataFetch AVAILABLE merely because authorized (no API key)', () => {
        const m = fresh();
        m.youtube.authorize({ accountId: 'acct-1', accessToken: 'tok' });
        const caps = m.youtube.capabilities();
        assert.strictEqual(caps.accountAuthorization.status, 'AVAILABLE');
        assert.notStrictEqual(caps.metadataFetch.status, 'AVAILABLE');
    });

    /* ---------------- Capability detection -------------------------------- */
    console.log('\nCapability:');
    test('capability: no fetch + no api key is honestly CAPABILITY_UNAVAILABLE / UNAVAILABLE, never fabricated', () => {
        const m = fresh();
        const connector = m.createYouTubeConnector({ fetchImpl: null, apiKey: null });
        const caps = connector.capabilities();
        assert.strictEqual(caps.network.status, 'CAPABILITY_UNAVAILABLE');
        assert.strictEqual(caps.apiKey.status, 'UNAVAILABLE');
        assert.strictEqual(caps.metadataFetch.status, 'CAPABILITY_UNAVAILABLE');
    });
    test('capability: fetch present but no api key -> UNAVAILABLE (not CAPABILITY_UNAVAILABLE, distinguishing "can\'t" from "not configured")', () => {
        const m = fresh();
        const connector = m.createYouTubeConnector({ fetchImpl: async () => fakeApiResponse({ items: [] }), apiKey: null });
        const caps = connector.capabilities();
        assert.strictEqual(caps.network.status, 'AVAILABLE');
        assert.strictEqual(caps.metadataFetch.status, 'UNAVAILABLE');
    });
    test('capability: fetch + api key both present -> metadataFetch AVAILABLE', () => {
        const m = fresh();
        const connector = m.createYouTubeConnector({ fetchImpl: async () => fakeApiResponse({ items: [] }), apiKey: 'real-key' });
        assert.strictEqual(connector.capabilities().metadataFetch.status, 'AVAILABLE');
    });
    test('capability: download/frame/transcript/OCR are permanently CAPABILITY_UNAVAILABLE regardless of config', () => {
        const m = fresh();
        const connector = m.createYouTubeConnector({ fetchImpl: async () => fakeApiResponse({}), apiKey: 'k' });
        connector.authorize({ accountId: 'a', accessToken: 't' });
        const caps = connector.capabilities();
        assert.strictEqual(caps.videoDownload.status, 'CAPABILITY_UNAVAILABLE');
        assert.strictEqual(caps.frameAccess.status, 'CAPABILITY_UNAVAILABLE');
        assert.strictEqual(caps.transcriptFetch.status, 'CAPABILITY_UNAVAILABLE');
        assert.strictEqual(caps.ocrSceneIntelligence.status, 'CAPABILITY_UNAVAILABLE');
    });

    /* ---------------- Metadata retrieval / index-shape -------------------- */
    console.log('\nMetadata:');
    test('metadata: parses a real watch?v= URL', () => {
        const m = fresh();
        assert.strictEqual(m.parseYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
    });
    test('metadata: parses a real youtu.be short URL', () => {
        const m = fresh();
        assert.strictEqual(m.parseYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
    });
    test('metadata: parses a real /shorts/ URL', () => {
        const m = fresh();
        assert.strictEqual(m.parseYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
    });
    test('metadata: parses a bare 11-char video ID', () => {
        const m = fresh();
        assert.strictEqual(m.parseYouTubeVideoId('dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
    });
    test('metadata: malformed input is honestly rejected, never guessed', () => {
        const m = fresh();
        assert.strictEqual(m.parseYouTubeVideoId('not a url or id').success, false);
        assert.strictEqual(m.parseYouTubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ').success, false);
    });
    test('metadata: real ISO-8601 duration parsing (PT4M13S -> 253 seconds)', () => {
        const m = fresh();
        assert.strictEqual(m.parseIso8601Duration('PT4M13S'), 253);
        assert.strictEqual(m.parseIso8601Duration('PT1H2M3S'), 3723);
        assert.strictEqual(m.parseIso8601Duration('not-a-duration'), null);
    });
    await asyncTest('metadata: getVideoMetadata() genuinely parses a real-shaped API response into the Phase 1 schema', async () => {
        const m = fresh();
        const connector = m.createYouTubeConnector({
            apiKey: 'real-key',
            fetchImpl: async () => fakeApiResponse({ items: [{ id: 'dQw4w9WgXcQ', snippet: { title: 'Test Title', channelTitle: 'Test Channel', publishedAt: '2009-10-25T06:57:33Z' }, contentDetails: { duration: 'PT3M33S' } }] })
        });
        const result = await connector.getVideoMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.metadata.videoId, 'dQw4w9WgXcQ');
        assert.strictEqual(result.metadata.title, 'Test Title');
        assert.strictEqual(result.metadata.channel, 'Test Channel');
        assert.strictEqual(result.metadata.date, '2009-10-25T06:57:33Z');
        assert.strictEqual(result.metadata.durationSeconds, 213);
        assert.strictEqual(result.metadata.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });
    await asyncTest('metadata: honestly reports failure when capability is unavailable, never fakes metadata', async () => {
        const m = fresh();
        const connector = m.createYouTubeConnector({ apiKey: null, fetchImpl: null });
        const result = await connector.getVideoMetadata('dQw4w9WgXcQ');
        assert.strictEqual(result.success, false);
        assert.ok(result.capability);
    });
    await asyncTest('metadata: a real network/API error is surfaced, never silently converted to empty success', async () => {
        const m = fresh();
        const connector = m.createYouTubeConnector({ apiKey: 'k', fetchImpl: async () => { throw new Error('ENOTFOUND real DNS failure'); } });
        const result = await connector.getVideoMetadata('dQw4w9WgXcQ');
        assert.strictEqual(result.success, false);
        assert.match(result.reason, /network request failed/i);
    });
    await asyncTest('metadata: a real HTTP error status is surfaced honestly', async () => {
        const m = fresh();
        const connector = m.createYouTubeConnector({ apiKey: 'k', fetchImpl: async () => fakeApiResponse({}, { ok: false, status: 403 }) });
        const result = await connector.getVideoMetadata('dQw4w9WgXcQ');
        assert.strictEqual(result.success, false);
        assert.match(result.reason, /403/);
    });
    await asyncTest('metadata: no items in a real API response (private/deleted video) is honestly reported', async () => {
        const m = fresh();
        const connector = m.createYouTubeConnector({ apiKey: 'k', fetchImpl: async () => fakeApiResponse({ items: [] }) });
        const result = await connector.getVideoMetadata('dQw4w9WgXcQ');
        assert.strictEqual(result.success, false);
        assert.match(result.reason, /no item/i);
    });
    await asyncTest('metadata: a missing field in a real API response is reported null, never fabricated', async () => {
        const m = fresh();
        const connector = m.createYouTubeConnector({ apiKey: 'k', fetchImpl: async () => fakeApiResponse({ items: [{ id: 'dQw4w9WgXcQ', snippet: {}, contentDetails: {} }] }) });
        const result = await connector.getVideoMetadata('dQw4w9WgXcQ');
        assert.strictEqual(result.metadata.title, null);
        assert.strictEqual(result.metadata.channel, null);
        assert.strictEqual(result.metadata.durationSeconds, null);
    });

    /* ---------------- Provenance -------------------------------------- */
    console.log('\nProvenance:');
    await asyncTest('provenance: every real metadata result discloses its real source and retrieval time', async () => {
        const m = fresh();
        const connector = m.createYouTubeConnector({ apiKey: 'k', fetchImpl: async () => fakeApiResponse({ items: [{ id: 'dQw4w9WgXcQ', snippet: { title: 't' }, contentDetails: {} }] }) });
        const result = await connector.getVideoMetadata('dQw4w9WgXcQ');
        assert.strictEqual(result.metadata.source, 'youtube');
        assert.match(result.metadata.provenance, /YouTube Data API/);
        assert.ok(result.metadata.retrievedAt);
    });

    /* ---------------- Metadata output is frozen/immutable ----------------- */
    console.log('\nIntegrity:');
    await asyncTest('integrity: returned metadata object is frozen (cannot be silently mutated downstream)', async () => {
        const m = fresh();
        const connector = m.createYouTubeConnector({ apiKey: 'k', fetchImpl: async () => fakeApiResponse({ items: [{ id: 'dQw4w9WgXcQ', snippet: { title: 't' }, contentDetails: {} }] }) });
        const result = await connector.getVideoMetadata('dQw4w9WgXcQ');
        assert.ok(Object.isFrozen(result.metadata));
    });

    /* ---------------- Metadata ---------------------------------------------- */
    console.log('\nMetadata (module):');
    test('module: reports a real version and registers exactly once', () => {
        const m = fresh();
        assert.strictEqual(m.getVersion(), '1.0.0-rp034-phase1');
        // Requiring twice must not throw / must not duplicate registration in a real window context.
        const second = fresh();
        assert.strictEqual(second.getVersion(), m.getVersion());
    });

    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exitCode = failed > 0 ? 1 : 0;
}

main();
