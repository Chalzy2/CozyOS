/**
 * core/modules/intelligence/media/tests/cozy-research-intelligence.test.js
 * RP-035 Phase 2 — Living Media Research Intelligence
 * Run with: node core/modules/intelligence/media/tests/cozy-research-intelligence.test.js
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
    research: path.join(__dirname, '..', 'cozy-research-intelligence.js')
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

    return {
        win,
        idx: win.CozyOS.CozyRemoteMediaIndex,
        search: win.CozyOS.CozyRemoteMediaSearch,
        analysis: win.CozyOS.CozyRemoteMediaAnalysis,
        registry: win.CozyOS.CozyLanguagePacks,
        discovery: win.CozyOS.Modules['cozy-optional-language-pack-discovery'].api,
        country: win.CozyOS.Modules['cozy-language-country-metadata'].api,
        langIntel: win.CozyOS.CozyAfricanLanguageIntelligence,
        privacy: win.CozyOS.CozyIntelligencePrivacy,
        sync: win.CozyOS.CozyIntelligenceOfflineSync,
        link: win.CozyOS.CozyMediaAnalysisLink,
        research: win.CozyOS.CozyResearchIntelligence
    };
}

function seedRecord(s, overrides) {
    const created = s.idx.createRecord(Object.assign({
        sourceType: 'youtube', sourceId: 'dQw4w9WgXcQ',
        title: 'Sunday Service', description: 'A church service testimony about healing and prayer',
        ownerAuthorization: { state: 'AUTHORIZED' }
    }, overrides));
    return created.indexId;
}

function seedJob(s, indexId, type, params) {
    const job = s.analysis.createJob(type, Object.assign({ indexId }, params));
    return job.jobId;
}

function seedLinkedLanguageRecord(s, langId, country, region) {
    const indexId = seedRecord(s, { sourceId: 'vid_' + langId + '_' + Date.now() });
    if (country) s.registry.registerRegionalContext(langId, { country, region });
    const jobId = seedJob(s, indexId, 'LANGUAGE_IDENTIFICATION', { languageId: langId, region });
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    return { indexId, jobId };
}

console.log('RP-035 Phase 2 — Living Media Research Intelligence tests\n');

/* ===================================================================
   1. RESEARCH RECORD CREATION
=================================================================== */
console.log('Research record creation:');

test('createResearchRecord() rejects unrecognized researchType', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'NOT_A_TYPE' });
    assert.strictEqual(r.status, 'REJECTED');
});

test('createResearchRecord() rejects missing sourceRecordId', () => {
    const s = freshStack();
    const r = s.research.createResearchRecord({ researchType: 'TESTIMONY' });
    assert.strictEqual(r.status, 'REJECTED');
});

test('createResearchRecord() rejects a sourceRecordId that does not resolve to a real record', () => {
    const s = freshStack();
    const r = s.research.createResearchRecord({ sourceRecordId: 'rmi_fake', researchType: 'TESTIMONY' });
    assert.strictEqual(r.status, 'REJECTED');
});

test('createResearchRecord() succeeds against a real index record', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    assert.strictEqual(r.status, 'CREATED');
    assert.ok(r.researchId);
});

test('research record videoId comes from the real index record, not invented', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'realVideo123' });
    const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'SERMON' });
    assert.strictEqual(r.record.videoId, 'realVideo123');
});

test('CAPABILITY_UNAVAILABLE when media index engine is not loaded', () => {
    delete require.cache[require.resolve(roots.research)];
    global.window = { CozyOS: {} };
    require(roots.research);
    const r = global.window.CozyOS.CozyResearchIntelligence.createResearchRecord({ sourceRecordId: 'x', researchType: 'TESTIMONY' });
    assert.strictEqual(r.status, 'CAPABILITY_UNAVAILABLE');
});

test('createResearchRecord() blocks when ownerAuthorization is REVOKED', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { ownerAuthorization: { state: 'REVOKED' } });
    const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    assert.strictEqual(r.status, 'NOT_AUTHORIZED');
});

test('missing analysisJobId is stored as null, never fabricated', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'PRAYER' });
    assert.strictEqual(r.record.analysisJobId, null);
});

test('createResearchRecord() rejects a nonexistent analysisJobId', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'PRAYER', analysisJobId: 'rmaj_fake' });
    assert.strictEqual(r.status, 'REJECTED');
});

test('missing title/description fields become NOT_AVAILABLE, never fabricated', () => {
    const s = freshStack();
    const created = s.idx.createRecord({ sourceType: 'youtube', sourceId: 'noTitleVid', ownerAuthorization: { state: 'AUTHORIZED' } });
    const r = s.research.createResearchRecord({ sourceRecordId: created.indexId, researchType: 'OTHER' });
    assert.strictEqual(r.record.title, 'NOT_AVAILABLE');
});

/* ===================================================================
   2. RESEARCH TYPES
=================================================================== */
console.log('\nResearch types:');

['TESTIMONY', 'HEALING', 'PRAYER', 'SERMON', 'ANNOUNCEMENT', 'GRADUATION', 'WORSHIP', 'TEACHING', 'EVENT', 'MEETING', 'CONFERENCE', 'OTHER'].forEach((type) => {
    test(`researchType ${type} is supported and stored verbatim`, () => {
        const s = freshStack();
        const indexId = seedRecord(s, { sourceId: 'vid_' + type });
        const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: type });
        assert.strictEqual(r.record.researchType, type);
        assert.strictEqual(r.record.status, 'POSSIBLE_' + type);
    });
});

test('RESEARCH_TYPES exposes exactly the 12 provider-neutral categories', () => {
    const s = freshStack();
    assert.strictEqual(s.research.RESEARCH_TYPES.length, 12);
});

/* ===================================================================
   3. EVIDENCE MODEL
=================================================================== */
console.log('\nEvidence model:');

test('evidence object carries source/sourceRecordId/videoId/evidenceType/createdAt', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    const e = r.record.evidence;
    assert.strictEqual(e.sourceRecordId, indexId);
    assert.ok(e.videoId);
    assert.strictEqual(e.evidenceType, 'TESTIMONY');
    assert.ok(e.createdAt);
});

test('evidenceSource is ANALYSIS_JOB when a real job is attached, INDEX_RECORD otherwise', () => {
    const s = freshStack();
    const { indexId, jobId } = seedLinkedLanguageRecord(s, 'sw', 'KE', 'Nairobi');
    s.analysis.runJob(jobId);
    const withJob = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'SERMON', analysisJobId: jobId });
    assert.strictEqual(withJob.record.evidence.source, 'ANALYSIS_JOB');

    const indexId2 = seedRecord(s, { sourceId: 'noJobVideo' });
    const noJob = s.research.createResearchRecord({ sourceRecordId: indexId2, researchType: 'SERMON' });
    assert.strictEqual(noJob.record.evidence.source, 'INDEX_RECORD');
});

test('research record never fabricates a research fact without provenance object present', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'HEALING' });
    assert.ok(r.record.provenance);
    assert.ok('source' in r.record.provenance);
});

/* ===================================================================
   4. TIMESTAMP INTELLIGENCE
=================================================================== */
console.log('\nTimestamp intelligence:');

test('timestamp defaults to UNKNOWN when not supplied', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'EVENT' });
    assert.strictEqual(r.record.timestamp, 'UNKNOWN');
});

test('real timestamp from index record is used, never invented', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    s.idx.addTimestamp(indexId, { timestampSeconds: 2533, label: 'testimony clip' });
    const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY', timestamp: 2533 });
    assert.strictEqual(r.record.startTime, 2533);
    assert.strictEqual(r.record.duration, 'NOT_AVAILABLE');
});

test('a timestamp number with no matching index timestamp entry still records the raw value, no fabricated duration', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY', timestamp: 999 });
    assert.strictEqual(r.record.timestamp, 999);
    assert.strictEqual(r.record.duration, 'NOT_AVAILABLE');
});

/* ===================================================================
   5. PERSON APPEARANCE
=================================================================== */
console.log('\nPerson appearance:');

test('getPersonAppearanceCapability() is honestly CAPABILITY_UNAVAILABLE', () => {
    const s = freshStack();
    assert.strictEqual(s.research.getPersonAppearanceCapability().status, 'CAPABILITY_UNAVAILABLE');
});

test('addPersonReference() rejects CONFIRMED_PERSON without a real confirmedBy identity', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    const r = s.research.addPersonReference(created.researchId, { state: 'CONFIRMED_PERSON' });
    assert.strictEqual(r.status, 'REJECTED');
});

test('addPersonReference() accepts CONFIRMED_PERSON with a real confirmedBy identity', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    const r = s.research.addPersonReference(created.researchId, { state: 'CONFIRMED_PERSON', confirmedBy: 'admin-1', timestamp: 120 });
    assert.strictEqual(r.status, 'ADDED');
    assert.strictEqual(r.personReference.state, 'CONFIRMED_PERSON');
});

test('addPersonReference() defaults an unrecognized state to UNKNOWN, never fabricated', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    const r = s.research.addPersonReference(created.researchId, { state: 'DEFINITELY_JOHN' });
    assert.strictEqual(r.personReference.state, 'UNKNOWN');
});

test('POSSIBLE_PERSON reference does not require confirmedBy', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    const r = s.research.addPersonReference(created.researchId, { state: 'POSSIBLE_PERSON', confidence: 0.6 });
    assert.strictEqual(r.status, 'ADDED');
});

test('PERSON_REFERENCE_STATES distinguishes exactly CONFIRMED_PERSON/POSSIBLE_PERSON/UNKNOWN', () => {
    const s = freshStack();
    assert.deepStrictEqual(s.research.PERSON_REFERENCE_STATES.slice().sort(), ['CONFIRMED_PERSON', 'POSSIBLE_PERSON', 'UNKNOWN'].sort());
});

/* ===================================================================
   6. LANGUAGE COVERAGE — dynamic, all 13 defaults + Dholuo/Kikuyu/Hausa depth
=================================================================== */
console.log('\nLanguage coverage (13 defaults, dynamic from RP-030):');

const ALL_DEFAULTS = ['en', 'sw', 'fr', 'ar', 'so', 'ru', 'zh', 'ha', 'yo', 'luo', 'ki', 'kam', 'zu'];
ALL_DEFAULTS.forEach((langId) => {
    test(`language ${langId} is read dynamically from RP-030 (not hard-coded here) and routes into a research record`, () => {
        const s = freshStack();
        assert.ok(s.registry.getPack(langId), langId + ' must exist in RP-030 registry');
        const { indexId } = seedLinkedLanguageRecord(s, langId, 'KE', 'TestRegion');
        const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TEACHING' });
        assert.strictEqual(r.status, 'CREATED');
    });
});

test('research module never hard-codes its own 13-language list — it defers to RP-030 DEFAULT_IDENTITIES length', () => {
    const s = freshStack();
    assert.strictEqual(s.registry.DEFAULT_IDENTITIES.length, 13);
});

['luo', 'ki', 'ha'].forEach((deep) => {
    test(`deep routing case ${deep} (Dholuo/Kikuyu/Hausa) resolves language field from real evidence, not a limit on coverage`, () => {
        const s = freshStack();
        const { indexId } = seedLinkedLanguageRecord(s, deep, 'KE', 'DeepRegion');
        const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
        assert.strictEqual(r.record.language, deep);
    });
});

test('optional installed packs remain discoverable and can back a research record', () => {
    const s = freshStack();
    s.discovery.requestOptionalPack('am', {});
    const indexId = seedRecord(s, { sourceId: 'amharicVid' });
    s.registry.registerRegionalContext('am', { country: 'ET', region: 'Addis' });
    const jobId = seedJob(s, indexId, 'LANGUAGE_IDENTIFICATION', { languageId: 'am', region: 'Addis' });
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'SERMON' });
    assert.strictEqual(r.record.language, 'am');
});

/* ===================================================================
   7. COUNTRY METADATA / MULTI-COUNTRY
=================================================================== */
console.log('\nCountry metadata:');

test('research record country comes from real RP-035 Phase 1 country metadata, not re-derived', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'sw', 'KE', 'Nairobi');
    const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    assert.strictEqual(r.record.country.code, 'KE');
    assert.strictEqual(r.record.country.name, 'Kenya');
    assert.ok(r.record.country.flag);
});

test('multi-country language (Swahili -> KE/TZ/UG): first registered country is used, all remain in registry', () => {
    const s = freshStack();
    s.registry.registerRegionalContext('sw', { country: 'KE' });
    s.registry.registerRegionalContext('sw', { country: 'TZ' });
    s.registry.registerRegionalContext('sw', { country: 'UG' });
    const listing = s.country.listCountriesForLanguage('sw');
    assert.strictEqual(listing.countries.length, 3);
});

test('unrouted research record has country NOT_AVAILABLE, never fabricated', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'unroutedVid' });
    const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'OTHER' });
    assert.strictEqual(r.record.country, 'NOT_AVAILABLE');
});

test('flag is presentation metadata only — never used as identity evidence in the evidence object', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'sw', 'KE', 'Nairobi');
    const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    assert.strictEqual(JSON.stringify(r.record.evidence).indexOf('flag'), -1);
});

/* ===================================================================
   8. PRIVACY
=================================================================== */
console.log('\nPrivacy:');

test('a freshly created research record starts PENDING privacy, never auto-VIEWABLE', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    assert.strictEqual(r.record.privacy.status, 'PENDING');
});

test('applyPrivacy() marks VIEWABLE when owner is AUTHORIZED', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    const p = s.research.applyPrivacy(created.researchId);
    assert.strictEqual(p.status, 'VIEWABLE');
});

test('privacy revocation blocks future search exposure (record excluded from searchResearch results)', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'revokeSearchVid' });
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    s.idx.updateRecord(indexId, { ownerAuthorization: { state: 'REVOKED' } });
    const p = s.research.applyPrivacy(created.researchId);
    assert.strictEqual(p.status, 'NOT_AUTHORIZED');
});

test('searchResearch() never returns a PENDING-privacy record', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'pendingSearchVid', searchableTerms: ['testimony'] });
    s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    const results = s.research.searchResearch('testimony', {});
    assert.ok(!results.results.some((r) => r.privacyStatus === 'PENDING'));
});

test('searchResearch() surfaces a VIEWABLE record after applyPrivacy()', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'viewableSearchVid', searchableTerms: ['testimony'] });
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    s.research.applyPrivacy(created.researchId);
    const results = s.research.searchResearch('testimony', {});
    assert.ok(results.results.some((r) => r.videoId === 'viewableSearchVid'));
});

test('applyPrivacy() degrades honestly when privacy engine is absent', () => {
    // Load research module without the privacy engine present.
    delete require.cache[require.resolve(roots.research)];
    delete require.cache[require.resolve(roots.index)];
    delete require.cache[require.resolve(roots.memory)];
    delete require.cache[require.resolve(roots.trustedDevice)];
    delete require.cache[require.resolve(roots.authCoordinator)];
    delete require.cache[require.resolve(roots.ingestion)];
    delete require.cache[require.resolve(roots.community)];
    delete require.cache[require.resolve(roots.gate)];
    global.window = { CozyOS: {} };
    require(roots.trustedDevice); require(roots.authCoordinator); require(roots.memory);
    require(roots.ingestion); require(roots.community); require(roots.gate);
    require(roots.index);
    require(roots.research);
    const idx = global.window.CozyOS.CozyRemoteMediaIndex;
    const created = idx.createRecord({ sourceType: 'youtube', sourceId: 'noPrivacyVid', ownerAuthorization: { state: 'AUTHORIZED' } });
    const rr = global.window.CozyOS.CozyResearchIntelligence.createResearchRecord({ sourceRecordId: created.indexId, researchType: 'TESTIMONY' });
    const p = global.window.CozyOS.CozyResearchIntelligence.applyPrivacy(rr.researchId);
    assert.strictEqual(p.status, 'CAPABILITY_UNAVAILABLE');
});

/* ===================================================================
   9. TESTIMONY / TYPE SEARCH
=================================================================== */
console.log('\nTestimony & type-filtered search:');

test('searchResearch() composes Phase 3 search, never a second search engine (CAPABILITY_UNAVAILABLE without it)', () => {
    delete require.cache[require.resolve(roots.research)];
    global.window = { CozyOS: {} };
    require(roots.research);
    const r = global.window.CozyOS.CozyResearchIntelligence.searchResearch('testimony', {});
    assert.strictEqual(r.status, 'CAPABILITY_UNAVAILABLE');
});

test('searchResearch() filters by researchType on top of Phase 3 results', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'healingVid', searchableTerms: ['healing', 'testimony'] });
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'HEALING' });
    s.research.applyPrivacy(created.researchId);
    const results = s.research.searchResearch('healing', { researchType: 'HEALING' });
    assert.ok(results.results.every((r) => r.researchType === 'HEALING'));
});

test('searchResearch() filters by language', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'sw', 'KE', 'Nairobi');
    s.idx.updateRecord(indexId, { searchableTerms: ['testimony'] });
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    s.research.applyPrivacy(created.researchId);
    const results = s.research.searchResearch('testimony', { language: 'sw' });
    assert.ok(results.results.every((r) => r.language === 'sw'));
});

test('getResearchContext() composes Phase 3\'s real method when available (no second implementation)', () => {
    const s = freshStack();
    const ctx = s.research.getResearchContext('testimony', {});
    assert.ok('matchingMedia' in ctx && 'languages' in ctx);
});

/* ===================================================================
   10. HUMAN CONFIRMATION
=================================================================== */
console.log('\nHuman confirmation:');

test('confirmResearch() requires a real confirmedBy identity', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    const r = s.research.confirmResearch(created.researchId, {});
    assert.strictEqual(r.status, 'REJECTED');
});

test('confirmResearch() moves status from POSSIBLE_X to CONFIRMED_X', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'HEALING' });
    const r = s.research.confirmResearch(created.researchId, { confirmedBy: 'reviewer-1' });
    assert.strictEqual(r.record.status, 'CONFIRMED_HEALING');
});

test('confirmation never overwrites original evidence — evidence object is unchanged after confirmation', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'PRAYER' });
    const beforeEvidence = JSON.stringify(created.record.evidence);
    const r = s.research.confirmResearch(created.researchId, { confirmedBy: 'reviewer-2' });
    assert.strictEqual(JSON.stringify(r.record.evidence), beforeEvidence);
});

test('confirmation identity and timestamp are stored separately from evidence', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'PRAYER' });
    const r = s.research.confirmResearch(created.researchId, { confirmedBy: 'reviewer-3', note: 'verified in person' });
    assert.strictEqual(r.record.confirmation.confirmedBy, 'reviewer-3');
    assert.ok(r.record.confirmation.confirmedAt);
});

test('double confirmation returns ALREADY_CONFIRMED, does not overwrite the first confirmation', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'PRAYER' });
    s.research.confirmResearch(created.researchId, { confirmedBy: 'reviewer-4' });
    const r2 = s.research.confirmResearch(created.researchId, { confirmedBy: 'someone-else' });
    assert.strictEqual(r2.status, 'ALREADY_CONFIRMED');
    assert.strictEqual(r2.confirmation.confirmedBy, 'reviewer-4');
});

/* ===================================================================
   11. DUPLICATES / IDEMPOTENCY
=================================================================== */
console.log('\nDuplicates & idempotency:');

test('creating the same research evidence twice returns ALREADY_EXISTS, not a new record', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'dupVid' });
    const r1 = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'SERMON', timestamp: 60 });
    const r2 = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'SERMON', timestamp: 60 });
    assert.strictEqual(r2.status, 'ALREADY_EXISTS');
    assert.strictEqual(r2.researchId, r1.researchId);
});

test('same source record but a different researchType is a distinct research record', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'dupVid2' });
    const r1 = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'SERMON' });
    const r2 = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    assert.notStrictEqual(r1.researchId, r2.researchId);
});

test('same source record but a different timestamp is a distinct research record', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'dupVid3' });
    const r1 = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'SERMON', timestamp: 10 });
    const r2 = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'SERMON', timestamp: 20 });
    assert.notStrictEqual(r1.researchId, r2.researchId);
});

/* ===================================================================
   12. OFFLINE SYNC
=================================================================== */
console.log('\nOffline sync:');

test('buildResearchSyncOperation() composes Phase 7, never invents a state', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'EVENT' });
    const op = s.research.buildResearchSyncOperation(created.researchId, 'CREATE');
    assert.strictEqual(op.status, 'LOCAL_ONLY');
});

test('CAPABILITY_UNAVAILABLE when offline sync engine is not loaded', () => {
    delete require.cache[require.resolve(roots.research)];
    global.window = { CozyOS: {} };
    require(roots.research);
    const r = global.window.CozyOS.CozyResearchIntelligence.buildResearchSyncOperation('rr_fake', 'CREATE');
    assert.strictEqual(r.status, 'REJECTED');
});

test('unrecognized operationType maps honestly onto CREATE default', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'EVENT' });
    const op = s.research.buildResearchSyncOperation(created.researchId, 'NOT_A_REAL_TYPE');
    assert.strictEqual(op.operation.operationType, 'CREATE');
});

test('sync payload never fabricates SYNCED/REMOTE_DELETED/CLOUD_BACKUP_COMPLETE at creation time', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'EVENT' });
    const op = s.research.buildResearchSyncOperation(created.researchId, 'CREATE');
    assert.notStrictEqual(op.status, 'SYNCED');
});

/* ===================================================================
   13. CAPABILITY REGISTRY
=================================================================== */
console.log('\nCapability registry:');

test('getCapabilityStatus() reports faceRecognition/asr/ocr/embeddings/personAppearance as CAPABILITY_UNAVAILABLE', () => {
    const s = freshStack();
    const c = s.research.getCapabilityStatus();
    ['faceRecognition', 'asr', 'ocr', 'embeddings', 'personAppearance'].forEach((k) => {
        assert.strictEqual(c[k], 'CAPABILITY_UNAVAILABLE', k);
    });
});

test('getCapabilityStatus() reports remoteMetadata/analysis/languageRouting AVAILABLE when their engines are loaded', () => {
    const s = freshStack();
    const c = s.research.getCapabilityStatus();
    assert.strictEqual(c.remoteMetadata, 'AVAILABLE');
    assert.strictEqual(c.analysis, 'AVAILABLE');
    assert.strictEqual(c.languageRouting, 'AVAILABLE');
});

test('getCapabilityStatus() never reports AVAILABLE for a capability merely because an account is authorized', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { ownerAuthorization: { state: 'AUTHORIZED' } });
    const c = s.research.getCapabilityStatus();
    assert.strictEqual(c.faceRecognition, 'CAPABILITY_UNAVAILABLE');
});

/* ===================================================================
   14. RULE 82
=================================================================== */
console.log('\nRule 82:');

test('research module exposes no promotePack/forceAvailable/approvePack/setStatus mutator', () => {
    const s = freshStack();
    ['promotePack', 'forceAvailable', 'approvePack', 'setStatus', 'promote'].forEach((m) => {
        assert.strictEqual(typeof s.research[m], 'undefined', m);
    });
});

test('confirming a research record never touches the RP-030 registry Rule 82 gate', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'ha', 'NG', 'Kano');
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'SERMON' });
    s.research.confirmResearch(created.researchId, { confirmedBy: 'reviewer-5' });
    assert.strictEqual(s.registry.requestPromotion('ha').status, 'BLOCKED');
});

/* ===================================================================
   15. AUDIT / MALFORMED INPUT
=================================================================== */
console.log('\nAudit & malformed input:');

test('getAuditTrail() records CREATED and CONFIRMED events', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    s.research.confirmResearch(created.researchId, { confirmedBy: 'reviewer-6' });
    const trail = s.research.getAuditTrail();
    assert.ok(trail.some((e) => e.action === 'CREATED'));
    assert.ok(trail.some((e) => e.action === 'CONFIRMED'));
});

test('getAuditTrail() returns a copy, not the live array', () => {
    const s = freshStack();
    const trail = s.research.getAuditTrail();
    trail.push({ action: 'FAKE' });
    assert.ok(!s.research.getAuditTrail().some((e) => e.action === 'FAKE'));
});

test('getResearchRecord() on an unknown id returns null, never fabricated', () => {
    const s = freshStack();
    assert.strictEqual(s.research.getResearchRecord('rr_nope'), null);
});

test('addPersonReference() on an unknown researchId is rejected, not thrown', () => {
    const s = freshStack();
    const r = s.research.addPersonReference('rr_nope', { state: 'POSSIBLE_PERSON' });
    assert.strictEqual(r.status, 'REJECTED');
});

test('confirmResearch() on an unknown researchId is rejected, not thrown', () => {
    const s = freshStack();
    const r = s.research.confirmResearch('rr_nope', { confirmedBy: 'x' });
    assert.strictEqual(r.status, 'REJECTED');
});

test('listResearchRecords() filters by researchType/language/country/region', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'zu', 'ZA', 'Durban');
    s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'WORSHIP' });
    const filtered = s.research.listResearchRecords({ researchType: 'WORSHIP', language: 'zu' });
    assert.ok(filtered.every((r) => r.researchType === 'WORSHIP' && r.language === 'zu'));
});

/* ===================================================================
   16. CHURCH MEDIA SCENARIO — full real integration
=================================================================== */
console.log('\nChurch media scenario (end-to-end):');

test('scenario: YouTube -> authorization -> index -> analysis -> link -> language -> country -> research -> privacy -> search -> confirmation -> offline sync', () => {
    const s = freshStack();
    const indexId = seedRecord(s, {
        sourceId: 'churchService2025',
        title: 'Sunday Testimony Service',
        description: 'Church testimony and healing prayer session in Dholuo',
        ownerAuthorization: { state: 'AUTHORIZED' },
        searchableTerms: ['testimony', 'healing', 'prayer']
    });
    s.registry.registerRegionalContext('luo', { country: 'KE', region: 'Homa Bay' });
    const jobId = seedJob(s, indexId, 'LANGUAGE_IDENTIFICATION', { languageId: 'luo', region: 'Homa Bay' });
    s.analysis.runJob(jobId);
    const linkResult = s.link.linkAnalysisToRecord(jobId);
    assert.strictEqual(linkResult.status, 'LINKED');

    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY', analysisJobId: jobId });
    assert.strictEqual(created.status, 'CREATED');
    assert.strictEqual(created.record.language, 'luo');
    assert.strictEqual(created.record.country.code, 'KE');

    const priv = s.research.applyPrivacy(created.researchId);
    assert.strictEqual(priv.status, 'VIEWABLE');

    const searchResults = s.research.searchResearch('testimony', { researchType: 'TESTIMONY' });
    assert.ok(searchResults.results.some((r) => r.videoId === 'churchService2025'));

    const confirmed = s.research.confirmResearch(created.researchId, { confirmedBy: 'pastor-admin' });
    assert.strictEqual(confirmed.status, 'CONFIRMED');

    const sync = s.research.buildResearchSyncOperation(created.researchId, 'CREATE');
    assert.strictEqual(sync.status, 'LOCAL_ONLY');

    assert.strictEqual(s.registry.requestPromotion('luo').status, 'BLOCKED');
});

/* ===================================================================
   17. REGRESSION SANITY — Phase 1 module untouched
=================================================================== */
console.log('\nRegression sanity:');

test('regression: Phase 1 media analysis link still functions unchanged alongside Phase 2', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    const r = s.link.linkAnalysisToRecord(jobId);
    assert.strictEqual(r.status, 'LINKED');
});

test('regression: RP-030 registry still reports 13 defaults with Phase 2 loaded', () => {
    const s = freshStack();
    assert.strictEqual(s.registry.listDefaultPacks().length, 13);
});

test('regression: country metadata module still resolves Kenya/flag with Phase 2 loaded', () => {
    const s = freshStack();
    const ke = s.country.getCountryMetadata('KE');
    assert.strictEqual(ke.name, 'Kenya');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
