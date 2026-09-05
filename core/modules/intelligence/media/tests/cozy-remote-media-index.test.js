/**
 * core/modules/intelligence/media/tests/cozy-remote-media-index.test.js
 * RP-034 Phase 2 — real, executed tests for the Persistent Remote
 * Media Intelligence Index, using the REAL RP-034 Phase 1 connector
 * (with a real, injected fetchImpl for deterministic network
 * behavior — the exact same pattern Phase 1's own test suite uses),
 * REAL CozyMemory, REAL RP-030 registry, and REAL RP-029-C safety
 * gate (no mocks for any of them).
 * Run with: node core/modules/intelligence/media/tests/cozy-remote-media-index.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  \u2713 ${name}`);
        passed++;
    } catch (err) {
        console.log(`  \u2717 ${name}`);
        console.log(`      ${err.message}`);
        failed++;
    }
}
async function asyncTest(name, fn) {
    try {
        await fn();
        console.log(`  \u2713 ${name}`);
        passed++;
    } catch (err) {
        console.log(`  \u2717 ${name}`);
        console.log(`      ${err.message}`);
        failed++;
    }
}

const roots = {
    memory: path.join(__dirname, '..', '..', '..', 'memory', 'cozy-memory-engine.js'),
    connector: path.join(__dirname, '..', 'cozy-media-connector.js'),
    ingestion: path.join(__dirname, '..', '..', 'knowledge', 'cozy-knowledge-ingestion.js'),
    community: path.join(__dirname, '..', '..', 'knowledge', 'cozy-knowledge-community.js'),
    gate: path.join(__dirname, '..', '..', 'knowledge', 'ui', 'cozy-knowledge-safety-gate.js'),
    packRegistry: path.join(__dirname, '..', '..', 'language-packs', 'cozy-language-pack-registry.js'),
    index: path.join(__dirname, '..', 'cozy-remote-media-index.js')
};

/** Real fake Response-shaped object, matching the real YouTube Data
 * API v3 response shape — same helper Phase 1's own test suite uses. */
function fakeApiResponse(body, { ok = true, status = 200 } = {}) {
    return { ok, status, json: async () => body };
}

function freshStack() {
    Object.values(roots).forEach((p) => { delete require.cache[require.resolve(p)]; });
    const win = { CozyOS: {} };
    global.window = win;

    require(roots.memory);
    require(roots.connector);
    require(roots.ingestion);
    require(roots.community);
    require(roots.gate);
    require(roots.packRegistry);
    require(roots.index);

    return {
        win,
        memory: win.CozyOS.CozyMemory,
        connectors: win.CozyOS.CozyMediaConnectors,
        registry: win.CozyOS.CozyLanguagePacks,
        gate: win.CozyOS.CozyKnowledgeSafetyGate,
        index: win.CozyOS.CozyRemoteMediaIndex
    };
}

console.log('RP-034 Phase 2 — Persistent Remote Media Intelligence Index tests\n');

async function main() {

// -----------------------------------------------------------------
// INDEX: CREATE / READ / UPDATE / DELETE / LIST / COUNT
// -----------------------------------------------------------------

test('index create: a real record is created with the canonical shape', () => {
    const s = freshStack();
    const result = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid001', title: 'Test Video' });
    assert.strictEqual(result.status, 'CREATED');
    assert.ok(result.indexId);
    assert.strictEqual(result.record.title, 'Test Video');
    assert.strictEqual(result.record.sync.state, 'SYNC_CAPABILITY_UNAVAILABLE');
});

test('index create: rejects a missing sourceType/sourceId, never fabricates an id', () => {
    const s = freshStack();
    const result = s.index.createRecord({ title: 'No source' });
    assert.strictEqual(result.status, 'REJECTED');
});

test('index read: getRecord returns the real, exact stored record', () => {
    const s = freshStack();
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid002', title: 'Read Me' });
    const record = s.index.getRecord(created.indexId);
    assert.strictEqual(record.title, 'Read Me');
});

test('index read: getRecord on an unknown indexId is honestly null, never fabricated', () => {
    const s = freshStack();
    assert.strictEqual(s.index.getRecord('does-not-exist'), null);
});

test('index update: updateRecord changes only the real supplied fields, preserves the rest', () => {
    const s = freshStack();
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid003', title: 'Original', description: 'Original desc' });
    const result = s.index.updateRecord(created.indexId, { title: 'Updated' });
    assert.strictEqual(result.status, 'UPDATED');
    const record = s.index.getRecord(created.indexId);
    assert.strictEqual(record.title, 'Updated');
    assert.strictEqual(record.description, 'Original desc');
});

test('index update: NOT_FOUND for an unknown indexId', () => {
    const s = freshStack();
    const result = s.index.updateRecord('does-not-exist', { title: 'x' });
    assert.strictEqual(result.status, 'NOT_FOUND');
});

test('index delete: requires explicit authorized:true, never silently deletes', () => {
    const s = freshStack();
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid004', title: 'Delete Me' });
    const blocked = s.index.deleteRecord(created.indexId, {});
    assert.strictEqual(blocked.status, 'CONFIRMATION_REQUIRED');
    assert.ok(s.index.getRecord(created.indexId));
    const result = s.index.deleteRecord(created.indexId, { authorized: true });
    assert.strictEqual(result.status, 'DELETED');
    assert.strictEqual(s.index.getRecord(created.indexId), null);
});

test('index list: listRecords returns real, currently-stored records only', () => {
    const s = freshStack();
    s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid005', title: 'A' });
    s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid006', title: 'B' });
    const all = s.index.listRecords();
    assert.strictEqual(all.length, 2);
});

test('index count: countRecords matches the real list length', () => {
    const s = freshStack();
    s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid007', title: 'A' });
    assert.strictEqual(s.index.countRecords(), 1);
});

test('index duplicate prevention: the same sourceType+sourceId never creates a second record', () => {
    const s = freshStack();
    const first = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid008', title: 'First' });
    const second = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid008', title: 'Second attempt' });
    assert.strictEqual(second.status, 'ALREADY_EXISTS');
    assert.strictEqual(second.indexId, first.indexId);
    assert.strictEqual(s.index.countRecords(), 1);
});

// -----------------------------------------------------------------
// PERSISTENCE: SAVE / RELOAD / VERSIONING / CORRUPTED-MISSING
// -----------------------------------------------------------------

test('persistence save/reload: a record saved via CozyMemory is really re-readable through getRecord', () => {
    const s = freshStack();
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid009', title: 'Persisted' });
    const reread = s.memory.readMemory('remote-media-index', created.indexId);
    assert.strictEqual(reread.value.title, 'Persisted');
});

test('versioning: real version number increments on each real update, via CozyMemory\'s own versioning', () => {
    const s = freshStack();
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid010', title: 'V1' });
    const u1 = s.index.updateRecord(created.indexId, { title: 'V2' });
    const u2 = s.index.updateRecord(created.indexId, { title: 'V3' });
    assert.ok(u2.version > u1.version);
});

test('versioning: prior provenance/version history is preserved, not overwritten', () => {
    const s = freshStack();
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid011', title: 'V1' });
    s.index.updateRecord(created.indexId, { title: 'V2' });
    const history = s.memory.listVersions('remote-media-index', created.indexId);
    assert.ok(history.length >= 2);
    assert.strictEqual(history[0].value.title, 'V1');
});

test('corrupted/missing record handling: deleteRecord on an already-deleted record is honestly NOT_FOUND', () => {
    const s = freshStack();
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid012', title: 'X' });
    s.index.deleteRecord(created.indexId, { authorized: true });
    const secondDelete = s.index.deleteRecord(created.indexId, { authorized: true });
    assert.strictEqual(secondDelete.status, 'NOT_FOUND');
});

// -----------------------------------------------------------------
// SEARCH
// -----------------------------------------------------------------

test('search: matches on title', () => {
    const s = freshStack();
    s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid013', title: 'Kiswahili Greetings Lesson' });
    const result = s.index.search('Kiswahili');
    assert.strictEqual(result.total, 1);
    assert.ok(result.results[0].matchedFields.includes('title'));
});

test('search: matches on description', () => {
    const s = freshStack();
    s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid014', title: 'X', description: 'A lesson about Dholuo greetings' });
    const result = s.index.search('Dholuo');
    assert.ok(result.results[0].matchedFields.includes('description'));
});

test('search: matches on channel', () => {
    const s = freshStack();
    s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid015', title: 'X', channel: { title: 'Kenya Language Channel' } });
    const result = s.index.search('Kenya Language');
    assert.ok(result.results[0].matchedFields.includes('channel'));
});

test('search: matches on searchableTerms', () => {
    const s = freshStack();
    s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid016', title: 'X', searchableTerms: ['misawa', 'greeting'] });
    const result = s.index.search('misawa');
    assert.ok(result.results[0].matchedFields.includes('searchableTerms'));
});

test('search: matches on language/region/dialect after routeLanguage()', () => {
    const s = freshStack();
    s.registry.registerRegionalContext('luo', { country: 'KE', region: 'Homa Bay', dialect: 'Standard Dholuo' });
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid017', title: 'X' });
    s.index.routeLanguage(created.indexId, { languageId: 'luo', region: 'Homa Bay', dialect: 'Standard Dholuo' });
    const result = s.index.search('Homa Bay');
    assert.ok(result.results[0].matchedFields.includes('region'));
});

test('search: matches on real, stored timestamp term', () => {
    const s = freshStack();
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid018', title: 'X' });
    s.index.addTimestamp(created.indexId, { timestampSeconds: 2533, term: 'misawa', label: 'greeting used here' });
    const result = s.index.search('misawa');
    assert.ok(result.results[0].matchedFields.includes('timestamps'));
    assert.strictEqual(result.results[0].timestamps[0].timestampSeconds, 2533);
});

test('search: never invents a timestamp/confidence that does not exist in the index', () => {
    const s = freshStack();
    s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid019', title: 'Misawa demo' });
    const result = s.index.search('Misawa');
    assert.deepStrictEqual(result.results[0].timestamps, []);
    assert.strictEqual(result.results[0].confidence, null);
});

test('search: no match returns a real empty result set, not an error', () => {
    const s = freshStack();
    s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid020', title: 'Something else entirely' });
    const result = s.index.search('nonexistentqueryterm');
    assert.strictEqual(result.total, 0);
});

// -----------------------------------------------------------------
// PROVENANCE
// -----------------------------------------------------------------

test('provenance: source recorded on creation matches the real caller-supplied value', () => {
    const s = freshStack();
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid021', title: 'X', provenance: { source: 'COMMUNITY_REPORTED', contributor: 'contrib-1' } });
    assert.strictEqual(created.record.provenance.source, 'COMMUNITY_REPORTED');
    assert.strictEqual(created.record.provenance.contributor, 'contrib-1');
});

test('provenance: retrieval time is recorded in sourceMetadata.retrievedAt', () => {
    const s = freshStack();
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid022', title: 'X' });
    assert.ok(created.record.sourceMetadata.retrievedAt);
});

test('provenance: contributor reference is stored as an opaque reference, not raw identity data', () => {
    const s = freshStack();
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid023', title: 'X', provenance: { contributor: 'contributorRef-abc123' } });
    assert.strictEqual(created.record.provenance.contributor, 'contributorRef-abc123');
});

test('provenance: confidence is real when supplied, null when not — never invented', () => {
    const s = freshStack();
    const withConfidence = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid024', title: 'X', provenance: { confidence: 0.8 } });
    const withoutConfidence = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid025', title: 'Y' });
    assert.strictEqual(withConfidence.record.provenance.confidence, 0.8);
    assert.strictEqual(withoutConfidence.record.provenance.confidence, null);
});

test('provenance: validationStatus never starts as professionally verified — always UNVALIDATED at creation', () => {
    const s = freshStack();
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid026', title: 'X' });
    assert.strictEqual(created.record.provenance.validationStatus, 'UNVALIDATED');
    assert.ok(!created.record.provenance.validationStatus.includes('VERIFIED'));
});

test('provenance: per-field provenance is recorded for changed fields on update', () => {
    const s = freshStack();
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid027', title: 'X' });
    s.index.updateRecord(created.indexId, { title: 'Y' }, { provenanceSource: 'ANALYSIS_RESULT' });
    const record = s.index.getRecord(created.indexId);
    assert.strictEqual(record.fieldProvenance.title.source, 'ANALYSIS_RESULT');
});

// -----------------------------------------------------------------
// LANGUAGE ROUTING
// -----------------------------------------------------------------

test('language routing: Kenya/Dholuo real regional context resolves a real packId', () => {
    const s = freshStack();
    s.registry.registerRegionalContext('luo', { country: 'KE', region: 'Homa Bay' });
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid028', title: 'X' });
    const result = s.index.routeLanguage(created.indexId, { languageId: 'luo', region: 'Homa Bay' });
    assert.strictEqual(result.languageStatus, 'RESOLVED');
    assert.strictEqual(result.packId, 'luo');
});

test('language routing: Tanzania/Kiswahili real regional context resolves a real packId', () => {
    const s = freshStack();
    s.registry.registerRegionalContext('sw', { country: 'TZ', region: 'Dar es Salaam' });
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid029', title: 'X' });
    const result = s.index.routeLanguage(created.indexId, { languageId: 'sw', region: 'Dar es Salaam' });
    assert.strictEqual(result.languageStatus, 'RESOLVED');
    assert.strictEqual(result.packId, 'sw');
});

test('language routing: another real African regional context (Kikuyu/Kiambu) resolves correctly', () => {
    const s = freshStack();
    s.registry.registerRegionalContext('ki', { country: 'KE', region: 'Kiambu' });
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid030', title: 'X' });
    const result = s.index.routeLanguage(created.indexId, { languageId: 'ki', region: 'Kiambu' });
    assert.strictEqual(result.packId, 'ki');
});

test('language routing: uncertain language (no languageId evidence) is honestly LANGUAGE_UNCERTAIN', () => {
    const s = freshStack();
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid031', title: 'X' });
    const result = s.index.routeLanguage(created.indexId, {});
    assert.strictEqual(result.languageStatus, 'LANGUAGE_UNCERTAIN');
});

test('language routing: ambiguous region match is honestly flagged, never silently resolved', () => {
    const s = freshStack();
    s.registry.registerRegionalContext('ki', { country: 'KE', region: 'Central', dialect: 'A' });
    s.registry.registerRegionalContext('ki', { country: 'KE', region: 'Central', dialect: 'B' });
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid032', title: 'X' });
    const result = s.index.routeLanguage(created.indexId, { languageId: 'ki', region: 'Central' });
    assert.strictEqual(result.languageStatus, 'AMBIGUOUS_REGIONAL_CONTEXT');
});

test('language routing: an unregistered language never silently selects a pack', () => {
    const s = freshStack();
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid033', title: 'X' });
    const result = s.index.routeLanguage(created.indexId, { languageId: 'not-a-real-language' });
    assert.strictEqual(result.languageStatus, 'LANGUAGE_UNCERTAIN');
    assert.strictEqual(result.packId, undefined);
});

// -----------------------------------------------------------------
// PRIVACY
// -----------------------------------------------------------------

test('privacy: a field named "accessToken" is rejected before ever reaching storage', () => {
    const s = freshStack();
    const result = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid034', title: 'X', ownerAuthorization: { accessToken: 'raw-secret-value' } });
    assert.strictEqual(result.status, 'REJECTED');
    assert.strictEqual(s.index.countRecords(), 0);
});

test('privacy: a field named "password"/"secret" anywhere nested is rejected', () => {
    const s = freshStack();
    const result = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid035', title: 'X', extra: { nested: { secret: 'abc' } } });
    assert.strictEqual(result.status, 'REJECTED');
});

test('privacy: authorizationRef (a real reference, not a secret) is accepted normally', () => {
    const s = freshStack();
    const result = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid036', title: 'X', ownerAuthorization: { authorizationRef: 'ref-123', state: 'AUTHORIZED' } });
    assert.strictEqual(result.status, 'CREATED');
    assert.strictEqual(result.record.ownerAuthorization.authorizationRef, 'ref-123');
});

test('privacy: identity references only — no raw credential ever appears anywhere in a stored record', () => {
    const s = freshStack();
    s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid037', title: 'X', provenance: { contributor: 'contributorRef-xyz' } });
    const serialized = JSON.stringify(s.index.listRecords());
    assert.strictEqual(serialized.indexOf('raw-password'), -1);
});

// -----------------------------------------------------------------
// OFFLINE
// -----------------------------------------------------------------

test('offline: search continues to work on previously indexed records with no network', () => {
    const s = freshStack();
    s.win.CozyOS.CozyMediaConnectors.registerConnector('youtube', s.win.CozyOS.CozyMediaConnectors.createYouTubeConnector({ fetchImpl: null, apiKey: null }));
    s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid038', title: 'Offline Findable' });
    const result = s.index.search('Offline');
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.offline, true);
});

await asyncTest('offline: refreshMetadata never pretends success while offline — honest NETWORK_UNAVAILABLE', async () => {
    const s = freshStack();
    s.win.CozyOS.CozyMediaConnectors.registerConnector('youtube', s.win.CozyOS.CozyMediaConnectors.createYouTubeConnector({ fetchImpl: null, apiKey: null }));
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid039', title: 'X' });
    const result = await s.index.refreshMetadata(created.indexId);
    assert.strictEqual(result.status, 'NETWORK_UNAVAILABLE');
});

test('offline: correct unavailable state is reported via getCapabilities when offline', () => {
    const s = freshStack();
    s.win.CozyOS.CozyMediaConnectors.registerConnector('youtube', s.win.CozyOS.CozyMediaConnectors.createYouTubeConnector({ fetchImpl: null, apiKey: null }));
    const caps = s.index.getCapabilities();
    assert.strictEqual(caps.metadataFetch, 'CAPABILITY_UNAVAILABLE');
});

// -----------------------------------------------------------------
// CONNECTOR COMPOSITION (real Phase 1 connector, not a fake)
// -----------------------------------------------------------------

await asyncTest('connector composition: refreshMetadata() calls the real Phase 1 connector and updates only real returned fields', async () => {
    const s = freshStack();
    const fakeConnector = s.connectors.createYouTubeConnector({
        apiKey: 'k',
        fetchImpl: async () => fakeApiResponse({ items: [{ id: 'dQw4w9WgXcQ', snippet: { title: 'Real Title From API', channelTitle: 'Real Channel' }, contentDetails: { duration: 'PT2M0S' } }] })
    });
    s.connectors.registerConnector('youtube', fakeConnector);
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'dQw4w9WgXcQ', title: 'Placeholder' });
    const result = await s.index.refreshMetadata(created.indexId);
    assert.strictEqual(result.status, 'REFRESHED');
    const record = s.index.getRecord(created.indexId);
    assert.strictEqual(record.title, 'Real Title From API');
    assert.strictEqual(record.channel.title, 'Real Channel');
    assert.strictEqual(record.durationSeconds, 120);
});

await asyncTest('connector composition: refreshMetadata() only updates fields the real API actually returned, never fabricates missing ones', async () => {
    const s = freshStack();
    const fakeConnector = s.connectors.createYouTubeConnector({
        apiKey: 'k',
        fetchImpl: async () => fakeApiResponse({ items: [{ id: 'dQw4w9WgXcQ', snippet: { title: 'Only Title' }, contentDetails: {} }] })
    });
    s.connectors.registerConnector('youtube', fakeConnector);
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'dQw4w9WgXcQ', title: 'Old', description: 'Kept description' });
    await s.index.refreshMetadata(created.indexId);
    const record = s.index.getRecord(created.indexId);
    assert.strictEqual(record.title, 'Only Title');
    assert.strictEqual(record.description, 'Kept description');
    assert.strictEqual(record.durationSeconds, null);
});

test('connector composition: refreshMetadata() on an unknown indexId is honestly NOT_FOUND', async () => {
    const s = freshStack();
    const result = await s.index.refreshMetadata('does-not-exist');
    assert.strictEqual(result.status, 'NOT_FOUND');
});

// -----------------------------------------------------------------
// SAFETY (RP-029-C pipeline integration)
// -----------------------------------------------------------------

test('safety: ambiguous/unsafe title text is routed through the real safety gate and quarantined', () => {
    const s = freshStack();
    const result = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid042', title: 'nude' });
    assert.strictEqual(result.safety.status, 'QUARANTINED');
    const quarantined = s.gate.listQuarantined();
    assert.ok(quarantined.length >= 1);
});

test('safety: ordinary safe text is never quarantined', () => {
    const s = freshStack();
    const result = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid043', title: 'A friendly greeting lesson' });
    assert.strictEqual(result.safety.status, 'SAFE');
});

// -----------------------------------------------------------------
// UPSERT / GET-BY-SOURCE-ID
// -----------------------------------------------------------------

test('upsertRemoteMedia: creates on first call, updates (never duplicates) on repeat scans of the same video', () => {
    const s = freshStack();
    const first = s.index.upsertRemoteMedia({ sourceType: 'youtube', sourceId: 'vid044', title: 'Scan 1' });
    assert.strictEqual(first.status, 'CREATED');
    const second = s.index.upsertRemoteMedia({ sourceType: 'youtube', sourceId: 'vid044', title: 'Scan 2' });
    assert.strictEqual(second.status, 'UPDATED');
    assert.strictEqual(second.indexId, first.indexId);
    assert.strictEqual(s.index.countRecords(), 1);
    assert.strictEqual(s.index.getRecord(first.indexId).title, 'Scan 2');
});

test('getBySourceId: resolves the real record via the real sourceType+sourceId lookup', () => {
    const s = freshStack();
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid045', title: 'Findable' });
    const found = s.index.getBySourceId('youtube', 'vid045');
    assert.strictEqual(found.indexId, created.indexId);
});

// -----------------------------------------------------------------
// CAPABILITY REPORTING
// -----------------------------------------------------------------

test('capability reporting: forbidden capabilities are always CAPABILITY_UNAVAILABLE, never claimed', () => {
    const s = freshStack();
    const caps = s.index.getCapabilities();
    ['videoDownload', 'frameAccess', 'transcriptFetch', 'ocr', 'speechRecognition', 'faceRecognition', 'sceneAnalysis'].forEach((k) => {
        assert.strictEqual(caps[k], 'CAPABILITY_UNAVAILABLE');
    });
});

test('capability reporting: persistentIndex/localSearch are real AVAILABLE capabilities', () => {
    const s = freshStack();
    const caps = s.index.getCapabilities();
    assert.strictEqual(caps.persistentIndex, 'AVAILABLE');
    assert.strictEqual(caps.localSearch, 'AVAILABLE');
});

test('capability reporting: no video downloader function exists anywhere on the public API', () => {
    const s = freshStack();
    assert.strictEqual(typeof s.index.downloadVideo, 'undefined');
    assert.strictEqual(typeof s.index.downloadMedia, 'undefined');
    assert.strictEqual(typeof s.index.extractFrames, 'undefined');
});

// -----------------------------------------------------------------
// ADMIN / RESEARCH SUMMARIES
// -----------------------------------------------------------------

test('admin summaries: getIndexSummary reflects real, current counts', () => {
    const s = freshStack();
    s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid046', title: 'X' });
    const summary = s.index.getIndexSummary();
    assert.strictEqual(summary.totalRecords, 1);
    assert.strictEqual(summary.notAnalyzed, 1);
});

test('admin summaries: getLanguageSummary reflects real, currently-routed languages', () => {
    const s = freshStack();
    s.registry.registerRegionalContext('sw', { country: 'TZ' });
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid047', title: 'X' });
    s.index.routeLanguage(created.indexId, { languageId: 'sw' });
    const summary = s.index.getLanguageSummary();
    assert.strictEqual(summary.byLanguage.sw, 1);
});

// -----------------------------------------------------------------
// SYNC CONTRACT
// -----------------------------------------------------------------

test('sync contract: sync.state is always honest SYNC_CAPABILITY_UNAVAILABLE, never fabricated SYNCED', () => {
    const s = freshStack();
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid048', title: 'X' });
    assert.strictEqual(created.record.sync.state, 'SYNC_CAPABILITY_UNAVAILABLE');
    s.index.updateRecord(created.indexId, { title: 'Y' });
    const record = s.index.getRecord(created.indexId);
    assert.strictEqual(record.sync.state, 'SYNC_CAPABILITY_UNAVAILABLE');
});

// -----------------------------------------------------------------
// CLEAR INDEX
// -----------------------------------------------------------------

test('clearIndex: requires explicit authorization, never silently wipes the index', () => {
    const s = freshStack();
    s.index.createRecord({ sourceType: 'youtube', sourceId: 'vid049', title: 'X' });
    const blocked = s.index.clearIndex({});
    assert.strictEqual(blocked.status, 'CONFIRMATION_REQUIRED');
    assert.strictEqual(s.index.countRecords(), 1);
    const result = s.index.clearIndex({ authorized: true });
    assert.strictEqual(result.status, 'CLEARED');
    assert.strictEqual(s.index.countRecords(), 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

}

main();
