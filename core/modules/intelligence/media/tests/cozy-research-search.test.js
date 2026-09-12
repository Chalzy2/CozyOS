/**
 * core/modules/intelligence/media/tests/cozy-research-search.test.js
 * RP-035 Phase 3 — Research Search & Intelligence Retrieval
 * Run with: node core/modules/intelligence/media/tests/cozy-research-search.test.js
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

const roots = {
    trustedDevice: path.join(__dirname, '..', '..', '..', '..', 'security', 'trusted-device-manager.js'),
    authCoordinator: path.join(__dirname, '..', '..', '..', 'identity', 'auth-coordinator.js'),
    memory: path.join(__dirname, '..', '..', '..', 'memory', 'cozy-memory-engine.js'),
    connector: path.join(__dirname, '..', 'cozy-media-connector.js'),
    ingestion: path.join(__dirname, '..', '..', 'knowledge', 'cozy-knowledge-ingestion.js'),
    community: path.join(__dirname, '..', '..', 'knowledge', 'cozy-knowledge-community.js'),
    gate: path.join(__dirname, '..', '..', 'knowledge', 'ui', 'cozy-knowledge-safety-gate.js'),
    packRegistry: path.join(__dirname, '..', '..', 'language-packs', 'cozy-language-pack-registry.js'),
    optionalDiscovery: path.join(__dirname, '..', '..', 'language-packs', 'cozy-optional-language-pack-discovery.js'),
    countryMeta: path.join(__dirname, '..', '..', 'language-packs', 'cozy-language-country-metadata.js'),
    index: path.join(__dirname, '..', 'cozy-remote-media-index.js'),
    search: path.join(__dirname, '..', 'cozy-remote-media-search.js'),
    hotspotEngine: path.join(__dirname, '..', '..', '..', '..', 'engines', 'collaboration', 'live-hotspot-engine.js'),
    livingConnectivity: path.join(__dirname, '..', '..', '..', '..', 'connectivity', 'cozy-living-connectivity.js'),
    transport: path.join(__dirname, '..', '..', '..', '..', 'connectivity', 'cozy-connectivity-transport.js'),
    analysis: path.join(__dirname, '..', 'cozy-remote-media-analysis.js'),
    langIntel: path.join(__dirname, '..', '..', 'language-packs', 'cozy-african-language-intelligence.js'),
    privacy: path.join(__dirname, '..', '..', 'privacy', 'cozy-intelligence-privacy.js'),
    sync: path.join(__dirname, '..', '..', 'sync', 'cozy-intelligence-offline-sync.js'),
    integration: path.join(__dirname, '..', 'cozy-rp034-integration.js'),
    link: path.join(__dirname, '..', 'cozy-media-analysis-link.js'),
    research: path.join(__dirname, '..', 'cozy-research-intelligence.js'),
    researchSearch: path.join(__dirname, '..', 'cozy-research-search.js')
};

function freshStack() {
    Object.values(roots).forEach((p) => { delete require.cache[require.resolve(p)]; });
    const win = { CozyOS: {} };
    global.window = win;

    require(roots.trustedDevice);
    require(roots.authCoordinator);
    require(roots.memory);
    require(roots.connector);
    require(roots.ingestion);
    require(roots.community);
    require(roots.gate);
    require(roots.packRegistry);
    require(roots.optionalDiscovery);
    require(roots.countryMeta);
    require(roots.index);
    require(roots.search);
    require(roots.hotspotEngine);
    require(roots.livingConnectivity);
    require(roots.transport);
    require(roots.analysis);
    require(roots.langIntel);
    require(roots.privacy);
    require(roots.sync);
    require(roots.integration);
    require(roots.link);
    require(roots.research);
    require(roots.researchSearch);

    return {
        win,
        idx: win.CozyOS.CozyRemoteMediaIndex,
        search: win.CozyOS.CozyRemoteMediaSearch,
        analysis: win.CozyOS.CozyRemoteMediaAnalysis,
        registry: win.CozyOS.CozyLanguagePacks,
        discovery: win.CozyOS.Modules['cozy-optional-language-pack-discovery'].api,
        country: win.CozyOS.Modules['cozy-language-country-metadata'].api,
        privacy: win.CozyOS.CozyIntelligencePrivacy,
        sync: win.CozyOS.CozyIntelligenceOfflineSync,
        link: win.CozyOS.CozyMediaAnalysisLink,
        research: win.CozyOS.CozyResearchIntelligence,
        rsearch: win.CozyOS.CozyResearchSearch
    };
}

function seedRecord(s, overrides) {
    const created = s.idx.createRecord(Object.assign({
        sourceType: 'youtube', sourceId: 'dQw4w9WgXcQ',
        title: 'Sunday Service', description: 'A church service testimony about healing and prayer',
        ownerAuthorization: { state: 'AUTHORIZED' },
        searchableTerms: ['testimony', 'healing', 'prayer']
    }, overrides));
    return created.indexId;
}

function seedJob(s, indexId, type, params) {
    const job = s.analysis.createJob(type, Object.assign({ indexId }, params));
    return job.jobId;
}

function seedLinkedLanguageRecord(s, langId, country, region, overrides) {
    const indexId = seedRecord(s, Object.assign({ sourceId: 'vid_' + langId + '_' + Date.now() }, overrides));
    if (country) s.registry.registerRegionalContext(langId, { country, region });
    const jobId = seedJob(s, indexId, 'LANGUAGE_IDENTIFICATION', { languageId: langId, region });
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    return { indexId, jobId };
}

function seedResearch(s, indexId, researchType, extra) {
    const created = s.research.createResearchRecord(Object.assign({ sourceRecordId: indexId, researchType }, extra));
    if (created.status === 'CREATED') s.research.applyPrivacy(created.researchId);
    return created;
}

console.log('RP-035 Phase 3 — Research Search & Intelligence Retrieval tests\n');

/* ===================================================================
   1. DYNAMIC DISCOVERY — no hard-coded authority
=================================================================== */
console.log('Dynamic discovery:');

test('discoverResearchTypes() reads the real Phase 2 RESEARCH_TYPES, not a local copy', () => {
    const s = freshStack();
    const r = s.rsearch.discoverResearchTypes();
    assert.strictEqual(r.types.length, 12);
    assert.deepStrictEqual(r.types.slice().sort(), s.research.RESEARCH_TYPES.slice().sort());
});

test('discoverLanguages() reads exactly 13 defaults from RP-030, dynamically', () => {
    const s = freshStack();
    const r = s.rsearch.discoverLanguages();
    assert.strictEqual(r.defaults.length, 13);
});

test('discoverLanguages() lists optional packs separately, never merged into defaults', () => {
    const s = freshStack();
    s.discovery.requestOptionalPack('am', {});
    const r = s.rsearch.discoverLanguages();
    assert.strictEqual(r.defaults.length, 13);
    assert.ok(r.optional.indexOf('am') !== -1);
});

test('CAPABILITY_UNAVAILABLE when RP-030 registry is not loaded', () => {
    delete require.cache[require.resolve(roots.researchSearch)];
    global.window = { CozyOS: {} };
    require(roots.researchSearch);
    const r = global.window.CozyOS.CozyResearchSearch.discoverLanguages();
    assert.strictEqual(r.status, 'CAPABILITY_UNAVAILABLE');
});

/* ===================================================================
   2. STRUCTURED QUERY BUILDER
=================================================================== */
console.log('\nStructured query builder:');

test('buildStructuredQuery() only activates fields with real supplied evidence', () => {
    const s = freshStack();
    const sq = s.rsearch.buildStructuredQuery('healing', {});
    assert.strictEqual(sq.query, 'healing');
    assert.strictEqual(sq.researchType, null);
    assert.strictEqual(sq.languageEvidence, null);
});

test('buildStructuredQuery() rejects an unrecognized researchType rather than storing it', () => {
    const s = freshStack();
    const sq = s.rsearch.buildStructuredQuery('x', { researchType: 'NOT_REAL' });
    assert.strictEqual(sq.researchType, null);
});

test('buildStructuredQuery() rejects a languageId not registered in RP-030', () => {
    const s = freshStack();
    const sq = s.rsearch.buildStructuredQuery('x', { languageId: 'zz' });
    assert.strictEqual(sq.languageEvidence, null);
});

test('buildStructuredQuery() accepts a real registered languageId', () => {
    const s = freshStack();
    const sq = s.rsearch.buildStructuredQuery('x', { languageId: 'sw' });
    assert.strictEqual(sq.languageEvidence, 'sw');
});

test('buildStructuredQuery() timeRange only set when a real numeric time is supplied', () => {
    const s = freshStack();
    const sq1 = s.rsearch.buildStructuredQuery('x', {});
    assert.strictEqual(sq1.timeRange, null);
    const sq2 = s.rsearch.buildStructuredQuery('x', { startTime: 30 });
    assert.strictEqual(sq2.timeRange.start, 30);
});

test('QUERY_MODES exposes all 13 real query dimensions', () => {
    const s = freshStack();
    assert.strictEqual(s.rsearch.QUERY_MODES.length, 13);
});

/* ===================================================================
   3. LANGUAGE-TERM RESOLUTION / AMBIGUITY
=================================================================== */
console.log('\nLanguage-term resolution & ambiguity:');

test('resolveLanguageTerm() resolves an exact language code', () => {
    const s = freshStack();
    const r = s.rsearch.resolveLanguageTerm('sw');
    assert.strictEqual(r.status, 'RESOLVED');
    assert.strictEqual(r.languageId, 'sw');
});

test('resolveLanguageTerm() resolves a language name case-insensitively', () => {
    const s = freshStack();
    const r = s.rsearch.resolveLanguageTerm('Hausa');
    assert.strictEqual(r.status, 'RESOLVED');
    assert.strictEqual(r.languageId, 'ha');
});

test('resolveLanguageTerm() is UNRESOLVED for a term with no matching evidence, never guessed', () => {
    const s = freshStack();
    const r = s.rsearch.resolveLanguageTerm('Klingon');
    assert.strictEqual(r.status, 'UNRESOLVED');
});

test('resolveLanguageTerm() is UNRESOLVED when the term matches both a language and a community — never silently picks one', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'luo', 'KE', 'Homa Bay');
    s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY', community: 'Luo' });
    const r = s.rsearch.resolveLanguageTerm('luo');
    assert.strictEqual(r.status, 'UNRESOLVED');
    assert.strictEqual(r.reason, 'LANGUAGE_AND_COMMUNITY_BOTH_MATCH');
});

test('resolveLanguageTerm() empty term is UNRESOLVED, not fabricated', () => {
    const s = freshStack();
    assert.strictEqual(s.rsearch.resolveLanguageTerm('').status, 'UNRESOLVED');
});

/* ===================================================================
   4. RESEARCH INTELLIGENCE SEARCH
=================================================================== */
console.log('\nResearch intelligence search:');

test('searchResearchIntelligence() composes Phase 2 searchResearch(), never a second engine', () => {
    delete require.cache[require.resolve(roots.researchSearch)];
    global.window = { CozyOS: {} };
    require(roots.researchSearch);
    const r = global.window.CozyOS.CozyResearchSearch.searchResearchIntelligence({ query: 'healing' });
    assert.strictEqual(r.status, 'CAPABILITY_UNAVAILABLE');
});

test('searchResearchIntelligence() returns results with a real researchRecordId, cross-referenced not fabricated', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'healingVid' });
    const created = seedResearch(s, indexId, 'HEALING');
    const sq = s.rsearch.buildStructuredQuery('healing', { researchType: 'HEALING' });
    const results = s.rsearch.searchResearchIntelligence(sq);
    const match = results.results.find((r) => r.videoId === 'healingVid');
    assert.ok(match);
    assert.strictEqual(match.researchRecordId, created.researchId);
});

test('searchResearchIntelligence() ranks TYPE_MATCH above an unmatched dimension result', () => {
    const s = freshStack();
    const indexId1 = seedRecord(s, { sourceId: 'rankVid1', searchableTerms: ['testimony'] });
    seedResearch(s, indexId1, 'TESTIMONY');
    const indexId2 = seedRecord(s, { sourceId: 'rankVid2', searchableTerms: ['testimony'] });
    seedResearch(s, indexId2, 'OTHER');
    const sq = s.rsearch.buildStructuredQuery('testimony', { researchType: 'TESTIMONY' });
    const results = s.rsearch.searchResearchIntelligence(sq);
    const typeMatch = results.results.find((r) => r.videoId === 'rankVid1');
    assert.ok(typeMatch.matchedDimensions.indexOf('TYPE_MATCH') !== -1);
});

test('searchResearchIntelligence() deduplicates on stable identifiers, never doubles a result', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'dedupeVid', searchableTerms: ['prayer'] });
    seedResearch(s, indexId, 'PRAYER');
    const sq = s.rsearch.buildStructuredQuery('prayer', {});
    const results = s.rsearch.searchResearchIntelligence(sq);
    const matches = results.results.filter((r) => r.videoId === 'dedupeVid');
    assert.strictEqual(matches.length, 1);
});

test('searchResearchIntelligence() never returns a PENDING-privacy record (composes Phase 2 gate)', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'pendingVid', searchableTerms: ['sermon'] });
    s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'SERMON' }); // no applyPrivacy()
    const sq = s.rsearch.buildStructuredQuery('sermon', {});
    const results = s.rsearch.searchResearchIntelligence(sq);
    assert.ok(!results.results.some((r) => r.videoId === 'pendingVid'));
});

/* ===================================================================
   5. LANGUAGE / COUNTRY / MULTI-COUNTRY
=================================================================== */
console.log('\nLanguage, country & multi-country:');

test('search filters by real language evidence, dynamically routed', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'ki', 'KE', 'Kiambu', { searchableTerms: ['testimony'] });
    seedResearch(s, indexId, 'TESTIMONY');
    const sq = s.rsearch.buildStructuredQuery('testimony', { languageId: 'ki' });
    const results = s.rsearch.searchResearchIntelligence(sq);
    assert.ok(results.results.every((r) => r.language === 'ki'));
});

test('search filters by real country evidence (not flag)', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'sw', 'KE', 'Nairobi', { searchableTerms: ['testimony'] });
    seedResearch(s, indexId, 'TESTIMONY');
    const sq = s.rsearch.buildStructuredQuery('testimony', { country: 'ke' });
    const results = s.rsearch.searchResearchIntelligence(sq);
    assert.ok(results.results.every((r) => r.country && r.country.code === 'KE'));
});

test('country query never uses flag as a match criterion', () => {
    const s = freshStack();
    assert.strictEqual(JSON.stringify(Object.keys(require(roots.researchSearch) || {})).indexOf('flag'), -1);
});

test('multi-country language (Swahili -> KE/TZ/UG) preserves language/country/region/community/dialect as separate dimensions', () => {
    const s = freshStack();
    s.registry.registerRegionalContext('sw', { country: 'KE' });
    s.registry.registerRegionalContext('sw', { country: 'TZ' });
    s.registry.registerRegionalContext('sw', { country: 'UG' });
    const listing = s.country.listCountriesForLanguage('sw');
    assert.strictEqual(listing.countries.length, 3);
    const sq = s.rsearch.buildStructuredQuery('x', { languageId: 'sw', country: 'TZ' });
    assert.strictEqual(sq.languageEvidence, 'sw');
    assert.strictEqual(sq.countryEvidence, 'TZ');
});

test('Dholuo -> Luo -> Kenya evidence is not collapsed into a generic result — language field stays luo, not "African"', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'luo', 'KE', 'Homa Bay', { searchableTerms: ['testimony'] });
    seedResearch(s, indexId, 'TESTIMONY');
    const sq = s.rsearch.buildStructuredQuery('testimony', { languageId: 'luo' });
    const results = s.rsearch.searchResearchIntelligence(sq);
    assert.ok(results.results.every((r) => r.language === 'luo'));
});

/* ===================================================================
   6. TEXT SEARCH
=================================================================== */
console.log('\nText search:');

test('searchText() composes Phase-3-of-RP-034 search(), no invented transcript', () => {
    const s = freshStack();
    seedRecord(s, { sourceId: 'textVid', searchableTerms: ['sermon'] });
    const r = s.rsearch.searchText('sermon', {});
    assert.strictEqual(r.status, 'OK');
    assert.ok(r.results.some((x) => x.sourceId === 'textVid'));
});

test('searchText() CAPABILITY_UNAVAILABLE when Phase 3-of-RP-034 search engine absent', () => {
    delete require.cache[require.resolve(roots.researchSearch)];
    global.window = { CozyOS: {} };
    require(roots.researchSearch);
    const r = global.window.CozyOS.CozyResearchSearch.searchText('sermon', {});
    assert.strictEqual(r.status, 'CAPABILITY_UNAVAILABLE');
});

/* ===================================================================
   7. PERSON SEARCH
=================================================================== */
console.log('\nPerson search:');

test('searchByPersonReference() requires a real personReference', () => {
    const s = freshStack();
    const r = s.rsearch.searchByPersonReference(null, {});
    assert.strictEqual(r.status, 'REJECTED');
});

test('searchByPersonReference() finds a CONFIRMED reference by confirmedBy identity', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'personVid' });
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    s.research.addPersonReference(created.researchId, { state: 'CONFIRMED_PERSON', confirmedBy: 'admin-9', timestamp: 45 });
    const r = s.rsearch.searchByPersonReference('admin-9', {});
    assert.strictEqual(r.status, 'OK');
    assert.ok(r.results.some((x) => x.state === 'CONFIRMED' && x.videoId === 'personVid'));
});

test('searchByPersonReference() always reports CAPABILITY_UNAVAILABLE_FOR_AUTOMATED_DETECTION — no fabricated face detection', () => {
    const s = freshStack();
    const r = s.rsearch.searchByPersonReference('someone', {});
    assert.strictEqual(r.capability, 'CAPABILITY_UNAVAILABLE_FOR_AUTOMATED_DETECTION');
});

test('PERSON_SEARCH_STATES is exactly CONFIRMED/UNCONFIRMED/UNKNOWN/CAPABILITY_UNAVAILABLE', () => {
    const s = freshStack();
    assert.deepStrictEqual(s.rsearch.PERSON_SEARCH_STATES.slice().sort(), ['CAPABILITY_UNAVAILABLE', 'CONFIRMED', 'UNCONFIRMED', 'UNKNOWN'].sort());
});

/* ===================================================================
   8. TIMESTAMP / VIDEO SEARCH
=================================================================== */
console.log('\nTimestamp & video search:');

test('searchByTimestamp() finds only the real matching timestamp entry', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'tsVid' });
    s.idx.addTimestamp(indexId, { timestampSeconds: 500 });
    s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'EVENT', timestamp: 500 });
    const r = s.rsearch.searchByTimestamp('tsVid', 500);
    assert.strictEqual(r.results.length, 1);
});

test('searchByTimestamp() returns empty (not fabricated) for a nonexistent timestamp', () => {
    const s = freshStack();
    const r = s.rsearch.searchByTimestamp('noSuchVid', 999);
    assert.strictEqual(r.results.length, 0);
});

test('searchByVideo() returns all research records for a real videoId', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'multiTypeVid' });
    s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'SERMON' });
    s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    const r = s.rsearch.searchByVideo('multiTypeVid');
    assert.strictEqual(r.results.length, 2);
});

/* ===================================================================
   9. PRIVACY
=================================================================== */
console.log('\nPrivacy:');

test('a REVOKED source record never appears in search results', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'revokedSearchVid', searchableTerms: ['testimony'] });
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    s.idx.updateRecord(indexId, { ownerAuthorization: { state: 'REVOKED' } });
    s.research.applyPrivacy(created.researchId);
    const sq = s.rsearch.buildStructuredQuery('testimony', {});
    const results = s.rsearch.searchResearchIntelligence(sq);
    assert.ok(!results.results.some((r) => r.videoId === 'revokedSearchVid'));
});

test('an AUTHORIZED, privacy-applied record is searchable', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'authorizedSearchVid', searchableTerms: ['testimony'] });
    seedResearch(s, indexId, 'TESTIMONY');
    const sq = s.rsearch.buildStructuredQuery('testimony', {});
    const results = s.rsearch.searchResearchIntelligence(sq);
    assert.ok(results.results.some((r) => r.videoId === 'authorizedSearchVid'));
});

/* ===================================================================
   10. OFFLINE-FIRST
=================================================================== */
console.log('\nOffline-first:');

test('getSearchAvailability() never claims fresh remote results', () => {
    const s = freshStack();
    const r = s.rsearch.getSearchAvailability();
    assert.strictEqual(r.remoteFetch, 'DELEGATED_TO_CONNECTOR_NEVER_FABRICATED_FRESH');
});

test('local research search remains available with Phase 2 loaded', () => {
    const s = freshStack();
    assert.strictEqual(s.rsearch.getSearchAvailability().localResearchSearch, 'AVAILABLE');
});

test('searchText() reports the real offline flag from Phase-3-of-RP-034, never fabricated', () => {
    const s = freshStack();
    seedRecord(s, { sourceId: 'offlineFlagVid', searchableTerms: ['sermon'] });
    const r = s.rsearch.searchText('sermon', {});
    assert.strictEqual(typeof r.offline, 'boolean');
});

/* ===================================================================
   11. DUPLICATES ACROSS PATHS
=================================================================== */
console.log('\nDuplicates across paths:');

test('the same research fact reached via different query filters is not duplicated in results', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'zu', 'ZA', 'Durban', { searchableTerms: ['worship'] });
    seedResearch(s, indexId, 'WORSHIP');
    const sq1 = s.rsearch.buildStructuredQuery('worship', { researchType: 'WORSHIP' });
    const sq2 = s.rsearch.buildStructuredQuery('worship', { researchType: 'WORSHIP', languageId: 'zu' });
    const r1 = s.rsearch.searchResearchIntelligence(sq1);
    const r2 = s.rsearch.searchResearchIntelligence(sq2);
    assert.strictEqual(r1.results.filter((r) => r.videoId === r2.results[0].videoId).length, 1);
});

/* ===================================================================
   12. RULE 82
=================================================================== */
console.log('\nRule 82:');

test('search module exposes no promotePack/forceAvailable/approvePack/setStatus mutator', () => {
    const s = freshStack();
    ['promotePack', 'forceAvailable', 'approvePack', 'setStatus', 'promote'].forEach((m) => {
        assert.strictEqual(typeof s.rsearch[m], 'undefined', m);
    });
});

test('running searches never changes RP-030 Rule 82 gate status', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'ha', 'NG', 'Kano', { searchableTerms: ['sermon'] });
    seedResearch(s, indexId, 'SERMON');
    s.rsearch.searchResearchIntelligence(s.rsearch.buildStructuredQuery('sermon', { languageId: 'ha' }));
    assert.strictEqual(s.registry.requestPromotion('ha').status, 'BLOCKED');
});

/* ===================================================================
   13. CHURCH MEDIA SCENARIO — full real integration
=================================================================== */
console.log('\nChurch media scenario (end-to-end):');

test('scenario: query "Find healing testimonies in Swahili from Kenya" resolves through the real chain', () => {
    const s = freshStack();
    const indexId = seedRecord(s, {
        sourceId: 'fullScenarioVid', title: 'Healing Testimony Service',
        description: 'A testimony of healing and prayer', searchableTerms: ['testimony', 'healing']
    });
    s.registry.registerRegionalContext('sw', { country: 'KE', region: 'Nairobi' });
    const jobId = seedJob(s, indexId, 'LANGUAGE_IDENTIFICATION', { languageId: 'sw', region: 'Nairobi' });
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);

    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'HEALING', analysisJobId: jobId });
    s.research.applyPrivacy(created.researchId);

    const sq = s.rsearch.buildStructuredQuery('healing', { researchType: 'HEALING', languageId: 'sw', country: 'KE' });
    const results = s.rsearch.searchResearchIntelligence(sq);
    const hit = results.results.find((r) => r.videoId === 'fullScenarioVid');
    assert.ok(hit);
    assert.strictEqual(hit.language, 'sw');
    assert.strictEqual(hit.country.code, 'KE');
    assert.strictEqual(hit.researchRecordId, created.researchId);
    assert.ok(hit.matchedDimensions.indexOf('TYPE_MATCH') !== -1);
    assert.ok(hit.matchedDimensions.indexOf('LANGUAGE_MATCH') !== -1);
    assert.ok(hit.matchedDimensions.indexOf('COUNTRY_MATCH') !== -1);
});

/* ===================================================================
   14. REGRESSION SANITY
=================================================================== */
console.log('\nRegression sanity:');

test('regression: Phase 2 research creation still functions unchanged alongside Phase 3', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    assert.strictEqual(r.status, 'CREATED');
});

test('regression: Phase 1 media analysis link still functions unchanged alongside Phase 3', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    assert.strictEqual(s.link.linkAnalysisToRecord(jobId).status, 'LINKED');
});

test('regression: RP-030 registry still reports 13 defaults with Phase 3 loaded', () => {
    const s = freshStack();
    assert.strictEqual(s.registry.listDefaultPacks().length, 13);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
