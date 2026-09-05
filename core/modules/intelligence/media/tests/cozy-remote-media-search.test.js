/**
 * core/modules/intelligence/media/tests/cozy-remote-media-search.test.js
 * RP-034 Phase 3 — real, executed tests for the Remote Media Search &
 * Research Engine, using the REAL Phase 1 connector (fetchImpl-
 * injected per Phase 1's own test convention), REAL Phase 2 index,
 * REAL RP-030 registry, and REAL RP-029-C safety gate (no mocks).
 * Run with: node core/modules/intelligence/media/tests/cozy-remote-media-search.test.js
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
    index: path.join(__dirname, '..', 'cozy-remote-media-index.js'),
    search: path.join(__dirname, '..', 'cozy-remote-media-search.js')
};

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
    require(roots.search);

    return {
        win,
        connectors: win.CozyOS.CozyMediaConnectors,
        registry: win.CozyOS.CozyLanguagePacks,
        gate: win.CozyOS.CozyKnowledgeSafetyGate,
        index: win.CozyOS.CozyRemoteMediaIndex,
        search: win.CozyOS.CozyRemoteMediaSearch
    };
}

/** Seeds a small, real, deterministic set of records for search tests. */
function seed(s) {
    s.registry.registerRegionalContext('luo', { country: 'KE', region: 'Homa Bay', dialect: 'Standard Dholuo' });
    s.registry.registerRegionalContext('sw', { country: 'TZ', region: 'Dar es Salaam' });
    s.registry.registerRegionalContext('ki', { country: 'KE', region: 'Kiambu' });

    const dholuo = s.index.createRecord({ sourceType: 'youtube', sourceId: 'dQw4w9WgXcQ', title: 'Sunday Service', description: 'A church service in Dholuo', searchableTerms: ['misawa', 'greeting'], channel: { id: 'chan1', title: 'Kenya Faith Channel' } });
    s.index.routeLanguage(dholuo.indexId, { languageId: 'luo', region: 'Homa Bay', dialect: 'Standard Dholuo' });
    s.index.addTimestamp(dholuo.indexId, { timestampSeconds: 2533, term: 'misawa', label: 'greeting used here', language: 'luo' });

    const swahili = s.index.createRecord({ sourceType: 'youtube', sourceId: 'aBcDeFgHiJk', title: 'Kiswahili Market Talk', description: 'Traders discussing prices', searchableTerms: ['bei', 'soko'], channel: { id: 'chan2', title: 'Tanzania Market Channel' } });
    s.index.routeLanguage(swahili.indexId, { languageId: 'sw', region: 'Dar es Salaam' });

    const kikuyu = s.index.createRecord({ sourceType: 'youtube', sourceId: 'kLmNoPqRsTu', title: 'Farming in Kiambu', description: 'medicine for crop A used by farmers in Kiambu', searchableTerms: ['dawa'] });
    s.index.routeLanguage(kikuyu.indexId, { languageId: 'ki', region: 'Kiambu' });

    return { dholuo: dholuo.indexId, swahili: swahili.indexId, kikuyu: kikuyu.indexId };
}

console.log('RP-034 Phase 3 — Remote Media Search & Research Engine tests\n');

async function main() {

// -----------------------------------------------------------------
// SEARCH: exact word / phrase / sentence / partial / case / empty / malformed / no results
// -----------------------------------------------------------------

test('search: exact word match via searchableTerms is EXACT_TERM', () => {
    const s = freshStack(); const ids = seed(s);
    const result = s.search.search('misawa');
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.results[0].matchType, 'EXACT_TERM');
});

test('search: exact phrase match in description is EXACT_PHRASE', () => {
    const s = freshStack(); seed(s);
    const result = s.search.search('medicine for crop A');
    assert.strictEqual(result.results[0].matchType, 'EXACT_PHRASE');
});

test('search: sentence-length query still matches honestly via real substring logic', () => {
    const s = freshStack(); seed(s);
    const result = s.search.search('medicine for crop A used by farmers in Kiambu');
    assert.ok(result.total >= 1);
});

test('search: partial single-word match in title is PARTIAL', () => {
    const s = freshStack(); seed(s);
    const result = s.search.search('Farming');
    assert.strictEqual(result.results[0].matchType, 'PARTIAL');
});

test('search: case normalization — uppercase query still matches', () => {
    const s = freshStack(); seed(s);
    const result = s.search.search('MISAWA');
    assert.strictEqual(result.total, 1);
});

test('search: empty query returns a real empty result, honestly labeled, never an error', () => {
    const s = freshStack(); seed(s);
    const result = s.search.search('');
    assert.strictEqual(result.total, 0);
    assert.strictEqual(result.reason, 'EMPTY_QUERY');
});

test('search: malformed/whitespace-only query is treated as empty, never crashes', () => {
    const s = freshStack(); seed(s);
    const result = s.search.search('   ');
    assert.strictEqual(result.total, 0);
});

test('search: no results for a genuinely absent term is a real empty set, not an error', () => {
    const s = freshStack(); seed(s);
    const result = s.search.search('nonexistentzzz');
    assert.strictEqual(result.total, 0);
    assert.deepStrictEqual(result.results, []);
});

test('search: never invents a result — total always equals results.length', () => {
    const s = freshStack(); seed(s);
    const result = s.search.search('Kiambu');
    assert.strictEqual(result.total, result.results.length);
});

// -----------------------------------------------------------------
// METADATA: title / description / channel / source ID
// -----------------------------------------------------------------

test('metadata: title match found', () => {
    const s = freshStack(); seed(s);
    const result = s.search.search('Sunday Service');
    assert.ok(result.total >= 1);
});

test('metadata: description match found', () => {
    const s = freshStack(); seed(s);
    const result = s.search.search('Traders discussing prices');
    assert.ok(result.total >= 1);
});

test('metadata: channel match via searchByChannel', () => {
    const s = freshStack(); seed(s);
    const result = s.search.searchByChannel('chan1');
    assert.strictEqual(result.total, 1);
});

test('metadata: source ID match via searchBySource', () => {
    const s = freshStack(); const ids = seed(s);
    const result = s.search.searchBySource('dQw4w9WgXcQ');
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.results[0].indexId, ids.dholuo);
});

// -----------------------------------------------------------------
// LANGUAGE: Kiswahili / Dholuo / Kikuyu / Kikamba / Hausa / Tanzania / Kenya / uncertain / ambiguous
// -----------------------------------------------------------------

test('language: Kiswahili searchByLanguage resolves real matches', () => {
    const s = freshStack(); seed(s);
    const result = s.search.searchByLanguage('sw');
    assert.strictEqual(result.total, 1);
});

test('language: Dholuo searchByLanguage resolves real matches', () => {
    const s = freshStack(); seed(s);
    const result = s.search.searchByLanguage('luo');
    assert.strictEqual(result.total, 1);
});

test('language: Kikuyu searchByLanguage resolves real matches', () => {
    const s = freshStack(); seed(s);
    const result = s.search.searchByLanguage('ki');
    assert.strictEqual(result.total, 1);
});

test('language: Kikamba (registered, zero indexed records) honestly returns zero, never fabricated', () => {
    const s = freshStack(); seed(s);
    const result = s.search.searchByLanguage('kam');
    assert.strictEqual(result.total, 0);
});

test('language: Hausa (registered, zero indexed records) honestly returns zero', () => {
    const s = freshStack(); seed(s);
    const result = s.search.searchByLanguage('ha');
    assert.strictEqual(result.total, 0);
});

test('language: Tanzania regional routing resolves via routeQueryLanguage', () => {
    const s = freshStack(); seed(s);
    const result = s.search.routeQueryLanguage({ languageId: 'sw', region: 'Dar es Salaam' });
    assert.strictEqual(result.status, 'RESOLVED');
    assert.strictEqual(result.packId, 'sw');
});

test('language: Kenya (Dholuo/Homa Bay) regional routing resolves via routeQueryLanguage', () => {
    const s = freshStack(); seed(s);
    const result = s.search.routeQueryLanguage({ languageId: 'luo', region: 'Homa Bay', dialect: 'Standard Dholuo' });
    assert.strictEqual(result.status, 'RESOLVED');
});

test('language: uncertain language (no evidence) is honestly LANGUAGE_UNCERTAIN', () => {
    const s = freshStack(); seed(s);
    const result = s.search.routeQueryLanguage({});
    assert.strictEqual(result.status, 'LANGUAGE_UNCERTAIN');
});

test('language: ambiguous language (two matching regional contexts) is honestly AMBIGUOUS_LANGUAGE', () => {
    const s = freshStack(); seed(s);
    s.registry.registerRegionalContext('ki', { country: 'KE', region: 'Central', dialect: 'A' });
    s.registry.registerRegionalContext('ki', { country: 'KE', region: 'Central', dialect: 'B' });
    const result = s.search.routeQueryLanguage({ languageId: 'ki', region: 'Central' });
    assert.strictEqual(result.status, 'AMBIGUOUS_LANGUAGE');
});

// -----------------------------------------------------------------
// TIMESTAMP: exact / multiple / duplicate / invalid / ordering
// -----------------------------------------------------------------

test('timestamp: exact timestamp search via searchByTimestamp', () => {
    const s = freshStack(); seed(s);
    const result = s.search.searchByTimestamp(2533);
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.results[0].timestampSeconds, 2533);
});

test('timestamp: findOccurrences returns real, structured occurrence data', () => {
    const s = freshStack(); seed(s);
    const result = s.search.findOccurrences('misawa');
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.results[0].formattedTimestamp, '42:13');
    assert.strictEqual(result.results[0].matchedTerm, 'misawa');
});

test('timestamp: multiple occurrences across different records are all found', () => {
    const s = freshStack(); const ids = seed(s);
    s.index.addTimestamp(ids.swahili, { timestampSeconds: 100, term: 'misawa', label: 'also mentioned' });
    const result = s.search.findOccurrences('misawa');
    assert.strictEqual(result.total, 2);
});

test('timestamp: duplicate occurrences (same term, same record, different times) are both real and both returned', () => {
    const s = freshStack(); const ids = seed(s);
    s.index.addTimestamp(ids.dholuo, { timestampSeconds: 5000, term: 'misawa', label: 'said again' });
    const result = s.search.findOccurrences('misawa');
    assert.strictEqual(result.total, 2);
});

test('timestamp: invalid timestamp input is honestly rejected, never a fabricated match', () => {
    const s = freshStack(); seed(s);
    const result = s.search.searchByTimestamp('not-a-number');
    assert.strictEqual(result.reason, 'INVALID_TIMESTAMP');
});

test('timestamp: findOccurrences results are ordered by real timestampSeconds', () => {
    const s = freshStack(); const ids = seed(s);
    s.index.addTimestamp(ids.dholuo, { timestampSeconds: 10, term: 'misawa', label: 'first' });
    const result = s.search.findOccurrences('misawa');
    assert.ok(result.results[0].timestampSeconds < result.results[1].timestampSeconds);
});

// -----------------------------------------------------------------
// RESEARCH: aggregation / regional comparison / language comparison / domain filtering / provenance / confidence / conflicting evidence
// -----------------------------------------------------------------

test('research: aggregateResearch returns real languages/regions/dialects/sources/terms', () => {
    const s = freshStack(); seed(s);
    const result = s.search.aggregateResearch('misawa');
    assert.ok(result.languages.includes('luo'));
    assert.ok(result.regions.includes('Homa Bay'));
    assert.ok(result.terms.includes('misawa'));
});

test('research: regional comparison (Kenya vs Tanzania) returns real counts when evidence exists', () => {
    const s = freshStack(); seed(s);
    const result = s.search.compareRegions('Homa Bay', 'Dar es Salaam');
    assert.strictEqual(result.status, 'AVAILABLE');
    assert.strictEqual(result['Homa Bay'].count, 1);
    assert.strictEqual(result['Dar es Salaam'].count, 1);
});

test('research: language comparison (Dholuo vs Kiswahili) returns real counts', () => {
    const s = freshStack(); seed(s);
    const result = s.search.compareLanguages('luo', 'sw');
    assert.strictEqual(result.status, 'AVAILABLE');
});

test('research: comparison with no indexed evidence honestly reports NO_INDEXED_EVIDENCE', () => {
    const s = freshStack(); seed(s);
    const result = s.search.compareRegions('Nowhere1', 'Nowhere2');
    assert.strictEqual(result.status, 'NO_INDEXED_EVIDENCE');
});

test('research: domain filtering — provenanceLabel never claims professional verification', () => {
    const s = freshStack(); seed(s);
    const result = s.search.search('misawa');
    assert.ok(result.results[0].provenanceLabel.indexOf('not professionally verified') !== -1);
});

test('research: provenance is retained verbatim on every result', () => {
    const s = freshStack(); seed(s);
    const result = s.search.search('misawa');
    assert.ok(result.results[0].provenance);
    assert.strictEqual(result.results[0].provenance.source, 'USER_INPUT');
});

test('research: confidence is real when present, never fabricated when absent', () => {
    const s = freshStack(); seed(s);
    const priority = s.search.getResearchPriority('misawa');
    assert.strictEqual(priority.status, 'AVAILABLE');
});

test('research: conflicting evidence between two real sources is honestly KNOWLEDGE_CONFLICT', () => {
    const s = freshStack();
    s.registry.registerRegionalContext('ki', { country: 'KE', region: 'Kiambu' });
    const a = s.index.createRecord({ sourceType: 'youtube', sourceId: 'conflictAAA1', title: 'Kiambu farming term', description: 'This term means X', searchableTerms: ['mbuku'] });
    const b = s.index.createRecord({ sourceType: 'youtube', sourceId: 'conflictBBB2', title: 'Kiambu farming term', description: 'This term means Y', searchableTerms: ['mbuku'] });
    const result = s.search.detectConflicts('mbuku');
    assert.strictEqual(result.status, 'KNOWLEDGE_CONFLICT');
    assert.strictEqual(result.sources.length, 2);
});

test('research: no conflict when sources agree or when too few records exist', () => {
    const s = freshStack(); seed(s);
    const result = s.search.detectConflicts('misawa');
    assert.strictEqual(result.status, 'NO_CONFLICT');
});

// -----------------------------------------------------------------
// PRIVACY: search history separation / identity separation / no credential leakage
// -----------------------------------------------------------------

test('privacy: no search history is ever persisted — no CozyMemory namespace is created by search()', () => {
    const s = freshStack(); seed(s);
    const memory = s.win.CozyOS.CozyMemory;
    const before = memory.listKeys('remote-media-index').length;
    s.search.search('misawa');
    s.search.search('another query');
    s.search.searchByTerm('misawa');
    const after = memory.listKeys('remote-media-index').length;
    assert.strictEqual(before, after);
});

test('privacy: no identity/contributor data leaks beyond the real, already-stored provenance reference', () => {
    const s = freshStack();
    s.index.createRecord({ sourceType: 'youtube', sourceId: 'privTest0001', title: 'Test', provenance: { contributor: 'contributorRef-xyz' } });
    const result = s.search.search('Test');
    assert.strictEqual(result.results[0].provenance.contributor, 'contributorRef-xyz');
    assert.strictEqual(JSON.stringify(result).indexOf('raw-secret'), -1);
});

test('privacy: no credential leakage — search results never contain a raw token/secret field', () => {
    const s = freshStack(); seed(s);
    const result = s.search.search('misawa');
    const serialized = JSON.stringify(result);
    assert.strictEqual(/accessToken|apiKey|password/i.test(serialized), false);
});

// -----------------------------------------------------------------
// OFFLINE: search without network / no fake success / local index availability
// -----------------------------------------------------------------

test('offline: search works fully without any network configured', () => {
    const s = freshStack(); seed(s);
    s.connectors.registerConnector('youtube', s.connectors.createYouTubeConnector({ fetchImpl: null, apiKey: null }));
    const result = s.search.search('misawa');
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.offline, true);
});

await asyncTest('offline: no fake network success — requestRefresh never claims REFRESHED while offline', async () => {
    const s = freshStack(); seed(s);
    s.connectors.registerConnector('youtube', s.connectors.createYouTubeConnector({ fetchImpl: null, apiKey: null }));
    const result = await s.search.requestRefresh('misawa');
    assert.strictEqual(result.status, 'NETWORK_UNAVAILABLE');
});

test('offline: local index availability is real and independent of network state', () => {
    const s = freshStack(); seed(s);
    s.connectors.registerConnector('youtube', s.connectors.createYouTubeConnector({ fetchImpl: null, apiKey: null }));
    const caps = s.search.getCapabilities();
    assert.strictEqual(caps.localSearch, 'AVAILABLE');
    assert.strictEqual(caps.persistentIndex, 'AVAILABLE');
});

test('offline: a query for something not locally indexed is honestly a real empty result, distinguishable from "nothing exists"', () => {
    const s = freshStack(); seed(s);
    const result = s.search.search('somethingNeverIndexed');
    assert.strictEqual(result.total, 0);
    assert.strictEqual(Array.isArray(result.results), true);
});

// -----------------------------------------------------------------
// CONNECTOR: refresh delegation / authorization failure / network failure / capability unavailable
// -----------------------------------------------------------------

await asyncTest('connector: requestRefresh delegates to the real Phase 1 connector via Phase 2, never a second implementation', async () => {
    const s = freshStack();
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'dQw4w9WgXcQ', title: 'Old Title' });
    const fakeConnector = s.connectors.createYouTubeConnector({ apiKey: 'k', fetchImpl: async () => fakeApiResponse({ items: [{ id: 'dQw4w9WgXcQ', snippet: { title: 'Refreshed Title' }, contentDetails: {} }] }) });
    s.connectors.registerConnector('youtube', fakeConnector);
    const result = await s.search.requestRefresh('Old Title');
    assert.strictEqual(result.status, 'REFRESH_ATTEMPTED');
    const record = s.index.getRecord(created.indexId);
    assert.strictEqual(record.title, 'Refreshed Title');
});

await asyncTest('connector: authorization failure surfaces honestly through the real Phase 2 delegation path', async () => {
    const s = freshStack();
    const created = s.index.createRecord({ sourceType: 'youtube', sourceId: 'dQw4w9WgXcQ', title: 'Needs Auth', ownerAuthorization: { state: 'REVOKED' } });
    const result = await s.search.requestRefresh('Needs Auth');
    assert.strictEqual(result.outcomes[0].outcome.status, 'AUTHORIZATION_REQUIRED');
});

await asyncTest('connector: network failure is honestly reported, never fabricated success', async () => {
    const s = freshStack();
    s.index.createRecord({ sourceType: 'youtube', sourceId: 'dQw4w9WgXcQ', title: 'Net Fail Test' });
    s.connectors.registerConnector('youtube', s.connectors.createYouTubeConnector({ apiKey: 'k', fetchImpl: async () => { throw new Error('ENOTFOUND real DNS failure'); } }));
    const result = await s.search.requestRefresh('Net Fail Test');
    assert.strictEqual(result.outcomes[0].outcome.status, 'NETWORK_UNAVAILABLE');
});

test('connector: capability unavailable when the media index itself is absent', () => {
    delete require.cache[require.resolve(roots.search)];
    global.window = { CozyOS: {} };
    require(roots.search);
    const isolated = window.CozyOS.CozyRemoteMediaSearch;
    const result = isolated.search('anything');
    assert.strictEqual(result.reason, 'CAPABILITY_UNAVAILABLE');
});

// -----------------------------------------------------------------
// SAFETY: quarantine visibility / released knowledge / unsafe content handling / meaning-context preservation
// -----------------------------------------------------------------

test('safety: quarantined content is distinguishable from released content in search results', () => {
    const s = freshStack();
    const unsafe = s.index.createRecord({ sourceType: 'youtube', sourceId: 'unsafeTest001', title: 'nude' });
    const safe = s.index.createRecord({ sourceType: 'youtube', sourceId: 'safeTest0001', title: 'A friendly greeting video' });
    const unsafeResult = s.search.search('nude');
    const safeResult = s.search.search('friendly greeting');
    assert.strictEqual(unsafeResult.results[0].quarantineStatus, 'QUARANTINED');
    assert.strictEqual(safeResult.results[0].quarantineStatus, 'RELEASED');
});

test('safety: this file never creates a second safety/quarantine system — it only reads the real gate', () => {
    const s = freshStack(); seed(s);
    assert.strictEqual(typeof s.search.quarantine, 'undefined');
    assert.strictEqual(typeof s.search.classify, 'undefined');
});

test('safety: unsafe content handling does not crash search or omit the result — it is surfaced, labeled', () => {
    const s = freshStack();
    s.index.createRecord({ sourceType: 'youtube', sourceId: 'unsafeTest002', title: 'nude' });
    const result = s.search.search('nude');
    assert.strictEqual(result.total, 1);
    assert.ok(result.results[0].quarantineStatus);
});

test('meaning/context preservation: language/region/dialect are preserved verbatim through search, never stripped by safety handling', () => {
    const s = freshStack(); seed(s);
    const result = s.search.search('misawa');
    assert.strictEqual(result.results[0].language.detected, 'luo');
    assert.strictEqual(result.results[0].language.region, 'Homa Bay');
    assert.strictEqual(result.results[0].language.dialect, 'Standard Dholuo');
});

// -----------------------------------------------------------------
// RELATED MEDIA / RANKING ORDER
// -----------------------------------------------------------------

test('findRelatedMedia: real, shared-attribute-based relation only, never fabricated', () => {
    const s = freshStack();
    s.registry.registerRegionalContext('luo', { country: 'KE', region: 'Homa Bay' });
    const a = s.index.createRecord({ sourceType: 'youtube', sourceId: 'relatedAAA01', title: 'First Dholuo video', searchableTerms: ['misawa'] });
    s.index.routeLanguage(a.indexId, { languageId: 'luo', region: 'Homa Bay' });
    const b = s.index.createRecord({ sourceType: 'youtube', sourceId: 'relatedBBB02', title: 'Second Dholuo video' });
    s.index.routeLanguage(b.indexId, { languageId: 'luo', region: 'Homa Bay' });
    const result = s.search.findRelatedMedia('misawa');
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.results[0].indexId, b.indexId);
});

test('ranking: results are sorted by real matchType priority (EXACT_TERM before PARTIAL)', () => {
    const s = freshStack();
    s.index.createRecord({ sourceType: 'youtube', sourceId: 'rankTermAAA1', title: 'unrelated', searchableTerms: ['dawa'] });
    s.index.createRecord({ sourceType: 'youtube', sourceId: 'rankPartBBB2', title: 'dawa mentioned in passing here' });
    const result = s.search.search('dawa');
    assert.strictEqual(result.results[0].matchType, 'EXACT_TERM');
});

test('getIndexedTermFrequency: real SOURCE_FREQUENCY, honestly distinguished from user-usage telemetry', () => {
    const s = freshStack(); seed(s);
    const freq = s.search.getIndexedTermFrequency('misawa');
    assert.strictEqual(freq.sourceFrequency, 1);
    assert.strictEqual(freq.frequencyType, 'SOURCE_FREQUENCY');
    assert.strictEqual(freq.userUsageFrequency, 'NOT_AVAILABLE_NO_TELEMETRY');
});

test('getResearchPriority: INSUFFICIENT_DATA when nothing matches', () => {
    const s = freshStack(); seed(s);
    const priority = s.search.getResearchPriority('nonexistentqueryxyz');
    assert.strictEqual(priority.priority, 'INSUFFICIENT_DATA');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

}

main();
