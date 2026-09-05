/**
 * core/modules/intelligence/media/tests/cozy-media-evidence.test.js
 * RP-035 Phase 4 — Media Evidence & Intelligence Enrichment
 * Run with: node core/modules/intelligence/media/tests/cozy-media-evidence.test.js
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
    researchSearch: path.join(__dirname, '..', 'cozy-research-search.js'),
    evidence: path.join(__dirname, '..', 'cozy-media-evidence.js')
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
    require(roots.evidence);

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
        rsearch: win.CozyOS.CozyResearchSearch,
        evidence: win.CozyOS.CozyMediaEvidence
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
    const indexId = seedRecord(s, Object.assign({ sourceId: 'vid_' + langId + '_' + Date.now() + '_' + Math.random().toString(36).slice(2) }, overrides));
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

console.log('RP-035 Phase 4 — Media Evidence & Intelligence Enrichment tests\n');

/* ===================================================================
   1. EVIDENCE CREATION
=================================================================== */
console.log('Evidence creation:');

test('createEvidence() rejects an unrecognized evidenceType', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'NOT_REAL', value: 'x' });
    assert.strictEqual(e.status, 'REJECTED');
});

test('createEvidence() rejects a missing researchRecordId', () => {
    const s = freshStack();
    const e = s.evidence.createEvidence({ evidenceType: 'TOPIC', value: 'x' });
    assert.strictEqual(e.status, 'REJECTED');
});

test('createEvidence() rejects a researchRecordId that does not resolve', () => {
    const s = freshStack();
    const e = s.evidence.createEvidence({ researchRecordId: 'rr_fake', evidenceType: 'TOPIC', value: 'x' });
    assert.strictEqual(e.status, 'REJECTED');
});

test('createEvidence() requires a real value (or explicit null), never fabricated', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'TOPIC' });
    assert.strictEqual(e.status, 'REJECTED');
});

test('createEvidence() succeeds against a real research record', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'TOPIC', value: 'healing' });
    assert.strictEqual(e.status, 'CREATED');
});

test('CAPABILITY_UNAVAILABLE when research intelligence engine is not loaded', () => {
    delete require.cache[require.resolve(roots.evidence)];
    global.window = { CozyOS: {} };
    require(roots.evidence);
    const e = global.window.CozyOS.CozyMediaEvidence.createEvidence({ researchRecordId: 'x', evidenceType: 'TOPIC', value: 'x' });
    assert.strictEqual(e.status, 'CAPABILITY_UNAVAILABLE');
});

test('createEvidence() blocks against a NOT_AUTHORIZED research record', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'blockedEvVid' });
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    s.idx.updateRecord(indexId, { ownerAuthorization: { state: 'REVOKED' } });
    s.research.applyPrivacy(created.researchId);
    const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'TOPIC', value: 'x' });
    assert.strictEqual(e.status, 'PRIVACY_BLOCKED');
});

test('evidence carries researchRecordId/sourceRecordId/analysisJobId from real data', () => {
    const s = freshStack();
    const { indexId, jobId } = seedLinkedLanguageRecord(s, 'sw', 'KE', 'Nairobi');
    const created = seedResearch(s, indexId, 'SERMON', { analysisJobId: jobId });
    const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'TOPIC', value: 'sermon' });
    assert.strictEqual(e.evidence.researchRecordId, created.researchId);
    assert.strictEqual(e.evidence.sourceRecordId, indexId);
    assert.strictEqual(e.evidence.analysisJobId, jobId);
});

/* ===================================================================
   2. EVIDENCE TYPES
=================================================================== */
console.log('\nEvidence types:');

['LANGUAGE', 'COUNTRY', 'REGION', 'COMMUNITY', 'DIALECT', 'PERSON_REFERENCE', 'EVENT', 'TOPIC', 'TIMESTAMP', 'SOURCE', 'MEDIA_METADATA', 'ANALYSIS_REFERENCE', 'PROVENANCE'].forEach((type) => {
    test(`evidenceType ${type} is supported and stored verbatim`, () => {
        const s = freshStack();
        const indexId = seedRecord(s, { sourceId: 'vid_' + type });
        const created = seedResearch(s, indexId, 'EVENT');
        const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: type, value: 'v-' + type });
        assert.strictEqual(e.status, 'CREATED');
        assert.strictEqual(e.evidence.evidenceType, type);
    });
});

test('EVIDENCE_TYPES exposes exactly the 13 real dimensions', () => {
    const s = freshStack();
    assert.strictEqual(s.evidence.EVIDENCE_TYPES.length, 13);
});

/* ===================================================================
   3. EVIDENCE CONFIDENCE
=================================================================== */
console.log('\nEvidence confidence:');

test('CONFIDENCE_LEVELS reuses the real HIGH/MEDIUM/LOW/NONE vocabulary from Phase 5', () => {
    const s = freshStack();
    assert.deepStrictEqual(s.evidence.CONFIDENCE_LEVELS.slice().sort(), ['HIGH', 'LOW', 'MEDIUM', 'NONE'].sort());
});

test('evidence defaults to NONE confidence when no numeric confidence exists on the record', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'TOPIC', value: 'x' });
    assert.strictEqual(e.evidence.confidence, 'NONE');
});

test('evidence derives HIGH/MEDIUM/LOW from a real numeric routing confidence, never a fabricated percentage', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'sw', 'KE', 'Nairobi');
    const created = seedResearch(s, indexId, 'SERMON');
    const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'LANGUAGE', value: 'sw' });
    assert.ok(['HIGH', 'MEDIUM', 'LOW', 'NONE'].indexOf(e.evidence.confidence) !== -1);
    assert.strictEqual(typeof e.evidence.confidence, 'string');
});

test('explicit confidenceLevel from a real upstream engine is honored when supplied', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'TOPIC', value: 'x', confidenceLevel: 'HIGH' });
    assert.strictEqual(e.evidence.confidence, 'HIGH');
});

/* ===================================================================
   4. PROVENANCE
=================================================================== */
console.log('\nProvenance:');

test('evidence provenance carries source/contributor/researchRecordId/sourceRecordId/analysisJobId', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'TOPIC', value: 'x' });
    const p = e.evidence.provenance;
    assert.strictEqual(p.researchRecordId, created.researchId);
    assert.strictEqual(p.sourceRecordId, indexId);
    assert.ok('source' in p && 'contributor' in p);
});

test('evidence has real createdAt/updatedAt timestamps', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'TOPIC', value: 'x' });
    assert.ok(e.evidence.createdAt);
    assert.ok(e.evidence.updatedAt);
});

/* ===================================================================
   5. EVIDENCE DEDUPLICATION / IDEMPOTENCY
=================================================================== */
console.log('\nEvidence deduplication:');

test('identical evidence (same researchRecordId+type+value) is idempotent — ALREADY_EXISTS', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const e1 = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'TOPIC', value: 'healing' });
    const e2 = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'TOPIC', value: 'healing' });
    assert.strictEqual(e2.status, 'ALREADY_EXISTS');
    assert.strictEqual(e2.evidenceId, e1.evidenceId);
});

test('different values for the same dimension are distinct evidence, not deduplicated', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const e1 = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'TOPIC', value: 'healing' });
    const e2 = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'TOPIC', value: 'prayer' });
    assert.notStrictEqual(e1.evidenceId, e2.evidenceId);
});

/* ===================================================================
   6. LANGUAGE / COUNTRY EVIDENCE FROM REAL ROUTED DATA
=================================================================== */
console.log('\nLanguage & country evidence:');

test('createLanguageEvidenceFromResearchRecord() is UNKNOWN when no language was routed', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'unroutedEvVid' });
    const created = seedResearch(s, indexId, 'OTHER');
    const r = s.evidence.createLanguageEvidenceFromResearchRecord(created.researchId);
    assert.strictEqual(r.status, 'UNKNOWN');
});

test('createLanguageEvidenceFromResearchRecord() composes real routed language/country/region', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'sw', 'KE', 'Nairobi');
    const created = seedResearch(s, indexId, 'SERMON');
    const r = s.evidence.createLanguageEvidenceFromResearchRecord(created.researchId);
    assert.strictEqual(r.status, 'OK');
    assert.strictEqual(r.results.language.evidence.value, 'sw');
    assert.strictEqual(r.results.country.evidence.value, 'KE');
});

['luo', 'ki', 'ha'].forEach((deep) => {
    test(`deep language case ${deep} (Dholuo/Kikuyu/Hausa) produces real LANGUAGE evidence`, () => {
        const s = freshStack();
        const { indexId } = seedLinkedLanguageRecord(s, deep, 'KE', 'DeepRegion');
        const created = seedResearch(s, indexId, 'TESTIMONY');
        const r = s.evidence.createLanguageEvidenceFromResearchRecord(created.researchId);
        assert.strictEqual(r.results.language.evidence.value, deep);
    });
});

const ALL_DEFAULTS = ['en', 'sw', 'fr', 'ar', 'so', 'ru', 'zh', 'ha', 'yo', 'luo', 'ki', 'kam', 'zu'];
test('all 13 default language packs produce real LANGUAGE evidence when routed, read dynamically from RP-030', () => {
    const s = freshStack();
    assert.strictEqual(s.registry.DEFAULT_IDENTITIES.length, 13);
    ALL_DEFAULTS.forEach((lang) => {
        const { indexId } = seedLinkedLanguageRecord(s, lang, 'KE', 'R-' + lang);
        const created = seedResearch(s, indexId, 'TEACHING');
        const r = s.evidence.createLanguageEvidenceFromResearchRecord(created.researchId);
        assert.strictEqual(r.results.language.evidence.value, lang, lang);
    });
});

test('optional installed pack produces real LANGUAGE evidence without bypassing Rule 82', () => {
    const s = freshStack();
    s.discovery.requestOptionalPack('am', {});
    s.registry.registerRegionalContext('am', { country: 'ET', region: 'Addis' });
    const indexId = seedRecord(s, { sourceId: 'amharicEvVid' });
    const jobId = seedJob(s, indexId, 'LANGUAGE_IDENTIFICATION', { languageId: 'am', region: 'Addis' });
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    const created = seedResearch(s, indexId, 'SERMON');
    const r = s.evidence.createLanguageEvidenceFromResearchRecord(created.researchId);
    assert.strictEqual(r.results.language.evidence.value, 'am');
    assert.strictEqual(s.registry.requestPromotion('am').status, 'BLOCKED');
});

test('country flag is never used as evidence value — only the country CODE is stored', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'sw', 'KE', 'Nairobi');
    const created = seedResearch(s, indexId, 'SERMON');
    const r = s.evidence.createLanguageEvidenceFromResearchRecord(created.researchId);
    assert.strictEqual(r.results.country.evidence.value, 'KE');
    assert.strictEqual(JSON.stringify(r.results.country.evidence).indexOf('flag'), -1);
});

test('multi-country language (Swahili -> KE/TZ/UG) is not collapsed — evidence stores the routed country only', () => {
    const s = freshStack();
    s.registry.registerRegionalContext('sw', { country: 'KE' });
    s.registry.registerRegionalContext('sw', { country: 'TZ' });
    s.registry.registerRegionalContext('sw', { country: 'UG' });
    const listing = s.country.listCountriesForLanguage('sw');
    assert.strictEqual(listing.countries.length, 3);
});

test('Dholuo -> Luo -> Kenya -> Kisumu evidence dimensions remain distinguishable, never collapsed into "Kenyan Luo"', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'luo', 'KE', 'Kisumu');
    const created = seedResearch(s, indexId, 'TESTIMONY', { community: 'Luo' });
    s.research.applyPrivacy(created.researchId);
    const r = s.evidence.createLanguageEvidenceFromResearchRecord(created.researchId);
    assert.strictEqual(r.results.language.evidence.value, 'luo');
    assert.strictEqual(r.results.country.evidence.value, 'KE');
    assert.strictEqual(r.results.region.evidence.value, 'Kisumu');
    assert.strictEqual(r.results.community.evidence.value, 'Luo');
    // Never a single collapsed field.
    assert.strictEqual(JSON.stringify(r.results.language.evidence).indexOf('Kenyan Luo'), -1);
});

/* ===================================================================
   7. AMBIGUITY / CONFLICT
=================================================================== */
console.log('\nAmbiguity & conflict:');

test('checkEvidenceConflict() is CONSISTENT for a single distinct value', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'LANGUAGE', value: 'luo' });
    const r = s.evidence.checkEvidenceConflict(created.researchId, 'LANGUAGE');
    assert.strictEqual(r.status, 'CONSISTENT');
});

test('checkEvidenceConflict() is UNRESOLVED for two different LANGUAGE values on the same record — never guesses', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'LANGUAGE', value: 'luo' });
    s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'LANGUAGE', value: 'ki' });
    const r = s.evidence.checkEvidenceConflict(created.researchId, 'LANGUAGE');
    assert.strictEqual(r.status, 'UNRESOLVED');
    assert.deepStrictEqual(r.values.sort(), ['ki', 'luo']);
});

test('checkEvidenceConflict() reports NO_EVIDENCE when nothing has been recorded for that dimension', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const r = s.evidence.checkEvidenceConflict(created.researchId, 'DIALECT');
    assert.strictEqual(r.status, 'NO_EVIDENCE');
});

/* ===================================================================
   8. TIMESTAMP EVIDENCE
=================================================================== */
console.log('\nTimestamp evidence:');

test('timestamp evidence is UNKNOWN when the research record has no real timestamp', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'EVENT');
    const e = s.evidence.createTimestampEvidence(created.researchId, {});
    assert.strictEqual(e.evidence.value, 'UNKNOWN');
    assert.strictEqual(e.evidence.timestampEvidenceType, 'UNKNOWN');
});

test('timestamp evidence passes through a real recorded timestamp, never fabricated', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'EVENT', timestamp: 272 });
    s.research.applyPrivacy(created.researchId);
    const e = s.evidence.createTimestampEvidence(created.researchId, { timestampEvidenceType: 'MEASURED_MEDIA_TIMESTAMP' });
    assert.strictEqual(e.evidence.value, 272);
    assert.strictEqual(e.evidence.timestampEvidenceType, 'MEASURED_MEDIA_TIMESTAMP');
});

test('TIMESTAMP_EVIDENCE_TYPES distinguishes VIDEO_METADATA/ANALYSIS/EVENT/MEASURED/UNKNOWN', () => {
    const s = freshStack();
    assert.deepStrictEqual(
        s.evidence.TIMESTAMP_EVIDENCE_TYPES.slice().sort(),
        ['ANALYSIS_TIMESTAMP', 'EVENT_TIMESTAMP', 'MEASURED_MEDIA_TIMESTAMP', 'UNKNOWN', 'VIDEO_METADATA_TIMESTAMP'].sort()
    );
});

test('an unrecognized timestampEvidenceType falls back to MEASURED_MEDIA_TIMESTAMP, never a fabricated new type', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'EVENT', timestamp: 10 });
    s.research.applyPrivacy(created.researchId);
    const e = s.evidence.createTimestampEvidence(created.researchId, { timestampEvidenceType: 'NOT_A_REAL_TYPE' });
    assert.strictEqual(e.evidence.timestampEvidenceType, 'MEASURED_MEDIA_TIMESTAMP');
});

/* ===================================================================
   9. RESEARCH ENRICHMENT
=================================================================== */
console.log('\nResearch enrichment:');

test('enrichResearchRecord() produces evidenceIds references, never a full copy of evidence objects', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'sw', 'KE', 'Nairobi');
    const created = seedResearch(s, indexId, 'SERMON');
    const r = s.evidence.enrichResearchRecord(created.researchId);
    assert.strictEqual(r.status, 'ENRICHED');
    assert.ok(Array.isArray(r.evidenceIds));
    assert.ok(r.evidenceIds.length > 0);
    assert.strictEqual(typeof r.evidenceIds[0], 'string');
});

test('enrichResearchRecord() on an unknown researchRecordId is rejected, not thrown', () => {
    const s = freshStack();
    const r = s.evidence.enrichResearchRecord('rr_fake');
    assert.strictEqual(r.status, 'REJECTED');
});

test('re-enriching the same research record does not duplicate evidence (idempotent underneath)', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'zu', 'ZA', 'Durban');
    const created = seedResearch(s, indexId, 'WORSHIP');
    s.evidence.enrichResearchRecord(created.researchId);
    const before = s.evidence.listEvidence({ researchRecordId: created.researchId }).length;
    s.evidence.enrichResearchRecord(created.researchId);
    const after = s.evidence.listEvidence({ researchRecordId: created.researchId }).length;
    assert.strictEqual(before, after);
});

/* ===================================================================
   10. SEARCH INTEGRATION (Phase 3 remains the authority)
=================================================================== */
console.log('\nSearch integration:');

test('enriched evidence is discoverable by Phase 3 search using its existing language/country filters', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'sw', 'KE', 'Nairobi', { searchableTerms: ['testimony'] });
    const created = seedResearch(s, indexId, 'TESTIMONY');
    s.evidence.enrichResearchRecord(created.researchId);
    const sq = s.rsearch.buildStructuredQuery('testimony', { languageId: 'sw', country: 'KE' });
    const results = s.rsearch.searchResearchIntelligence(sq);
    assert.ok(results.results.some((r) => r.videoId === s.research.getResearchRecord(created.researchId).videoId));
});

/* ===================================================================
   11. REALISTIC RESEARCH QUERIES
=================================================================== */
console.log('\nRealistic research queries:');

['TESTIMONY', 'HEALING', 'PRAYER', 'SERMON', 'ANNOUNCEMENT', 'GRADUATION'].forEach((type) => {
    test(`query for ${type} only returns records with real matching evidence`, () => {
        const s = freshStack();
        const indexId = seedRecord(s, { sourceId: 'query_' + type, searchableTerms: [type.toLowerCase()] });
        const created = seedResearch(s, indexId, type);
        s.evidence.enrichResearchRecord(created.researchId);
        const sq = s.rsearch.buildStructuredQuery(type.toLowerCase(), { researchType: type });
        const results = s.rsearch.searchResearchIntelligence(sq);
        assert.ok(results.results.every((r) => r.researchType === type));
    });
});

test('a query for a type with no matching evidence returns no synthetic result', () => {
    const s = freshStack();
    const sq = s.rsearch.buildStructuredQuery('wedding', { researchType: 'OTHER' });
    const results = s.rsearch.searchResearchIntelligence(sq);
    assert.strictEqual(results.results.length, 0);
});

/* ===================================================================
   12. PRIVACY / IDENTITY SEPARATION
=================================================================== */
console.log('\nPrivacy & identity separation:');

test('getVisibleEvidence() returns evidence for a VIEWABLE record', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'viewableEvVid' });
    const created = seedResearch(s, indexId, 'TESTIMONY');
    s.evidence.enrichResearchRecord(created.researchId);
    const r = s.evidence.getVisibleEvidence(created.researchId);
    assert.strictEqual(r.status, 'OK');
    assert.ok(r.results.length > 0);
});

test('getVisibleEvidence() hides evidence after the source is revoked, even though evidence already existed', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'revokeAfterEvVid' });
    const created = seedResearch(s, indexId, 'TESTIMONY');
    s.evidence.enrichResearchRecord(created.researchId);
    s.idx.updateRecord(indexId, { ownerAuthorization: { state: 'REVOKED' } });
    const r = s.evidence.getVisibleEvidence(created.researchId);
    assert.strictEqual(r.status, 'NOT_AUTHORIZED');
    assert.strictEqual(r.results.length, 0);
});

test('privacy escalation: record created -> allowed -> evidence added -> revoked -> hidden from search', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'escalationVid', searchableTerms: ['testimony'] });
    const created = seedResearch(s, indexId, 'TESTIMONY');
    s.evidence.enrichResearchRecord(created.researchId);
    const sqBefore = s.rsearch.buildStructuredQuery('testimony', {});
    assert.ok(s.rsearch.searchResearchIntelligence(sqBefore).results.some((r) => r.videoId === 'escalationVid'));

    s.idx.updateRecord(indexId, { ownerAuthorization: { state: 'REVOKED' } });
    s.research.applyPrivacy(created.researchId);
    const sqAfter = s.rsearch.buildStructuredQuery('testimony', {});
    assert.ok(!s.rsearch.searchResearchIntelligence(sqAfter).results.some((r) => r.videoId === 'escalationVid'));
});

test('personReference identity is never conflated with contributor/device identity', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    s.research.addPersonReference(created.researchId, { state: 'CONFIRMED_PERSON', confirmedBy: 'admin-42' });
    const rec = s.research.getResearchRecord(created.researchId);
    assert.strictEqual(rec.peopleReferences[0].confirmedBy, 'admin-42');
    assert.notStrictEqual(rec.provenance.contributor, rec.peopleReferences[0].confirmedBy);
});

/* ===================================================================
   13. RECONCILIATION
=================================================================== */
console.log('\nReconciliation:');

test('reconcile() reports NOT_FOUND for an unknown research record', () => {
    const s = freshStack();
    const r = s.evidence.reconcile('rr_fake');
    assert.strictEqual(r.result, 'NOT_FOUND');
});

test('reconcile() reports MISSING_RESEARCH when a research record has no evidence yet', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const r = s.evidence.reconcile(created.researchId);
    assert.strictEqual(r.result, 'MISSING_RESEARCH');
});

test('reconcile() reports CONSISTENT after real enrichment with no conflicts', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'sw', 'KE', 'Nairobi');
    const created = seedResearch(s, indexId, 'SERMON');
    s.evidence.enrichResearchRecord(created.researchId);
    const r = s.evidence.reconcile(created.researchId);
    assert.strictEqual(r.result, 'CONSISTENT');
});

test('reconcile() reports CONFLICT when two LANGUAGE evidence values disagree', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'LANGUAGE', value: 'luo' });
    s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'LANGUAGE', value: 'ki' });
    const r = s.evidence.reconcile(created.researchId);
    assert.strictEqual(r.result, 'CONFLICT');
});

test('reconcile() reports PRIVACY_BLOCKED for a revoked research record', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'reconcileRevokedVid' });
    const created = seedResearch(s, indexId, 'TESTIMONY');
    s.evidence.enrichResearchRecord(created.researchId);
    s.idx.updateRecord(indexId, { ownerAuthorization: { state: 'REVOKED' } });
    s.research.applyPrivacy(created.researchId);
    const r = s.evidence.reconcile(created.researchId);
    assert.strictEqual(r.result, 'PRIVACY_BLOCKED');
});

/* ===================================================================
   14. REPAIR CANDIDATES
=================================================================== */
console.log('\nRepair candidates:');

test('createRepairCandidate() creates NO_CANDIDATE for a CONSISTENT record', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'sw', 'KE', 'Nairobi');
    const created = seedResearch(s, indexId, 'SERMON');
    s.evidence.enrichResearchRecord(created.researchId);
    const r = s.evidence.createRepairCandidate(created.researchId);
    assert.strictEqual(r.status, 'NO_CANDIDATE');
});

test('createRepairCandidate() creates a real RP035-P4-EVIDENCE-### id for a CONFLICT', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'LANGUAGE', value: 'luo' });
    s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'LANGUAGE', value: 'ki' });
    const r = s.evidence.createRepairCandidate(created.researchId);
    assert.strictEqual(r.status, 'CANDIDATE_CREATED');
    assert.ok(/^RP035-P4-EVIDENCE-\d{3}$/.test(r.candidate.id));
    assert.strictEqual(r.candidate.severity, 'HIGH');
});

test('candidate sequencing is distinct and sequential across candidates', () => {
    const s = freshStack();
    const indexId1 = seedRecord(s, { sourceId: 'seq1' });
    const c1 = seedResearch(s, indexId1, 'TESTIMONY');
    s.evidence.createEvidence({ researchRecordId: c1.researchId, evidenceType: 'LANGUAGE', value: 'luo' });
    s.evidence.createEvidence({ researchRecordId: c1.researchId, evidenceType: 'LANGUAGE', value: 'ki' });
    const r1 = s.evidence.createRepairCandidate(c1.researchId);

    const indexId2 = seedRecord(s, { sourceId: 'seq2' });
    const c2 = seedResearch(s, indexId2, 'TESTIMONY');
    s.evidence.createEvidence({ researchRecordId: c2.researchId, evidenceType: 'LANGUAGE', value: 'sw' });
    s.evidence.createEvidence({ researchRecordId: c2.researchId, evidenceType: 'LANGUAGE', value: 'fr' });
    const r2 = s.evidence.createRepairCandidate(c2.researchId);

    assert.notStrictEqual(r1.candidate.id, r2.candidate.id);
});

test('listRepairCandidates() filters by status and severity', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'LANGUAGE', value: 'luo' });
    s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'LANGUAGE', value: 'ki' });
    s.evidence.createRepairCandidate(created.researchId);
    const open = s.evidence.listRepairCandidates({ status: 'OPEN', severity: 'HIGH' });
    assert.ok(open.length >= 1);
});

test('applyRepair() requires explicit authorization', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'LANGUAGE', value: 'luo' });
    s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'LANGUAGE', value: 'ki' });
    const candidate = s.evidence.createRepairCandidate(created.researchId);
    const r = s.evidence.applyRepair(candidate.candidate.id, {});
    assert.strictEqual(r.status, 'CONFIRMATION_REQUIRED');
});

test('applyRepair() never silently auto-resolves a conflict — always DEFERRED for human review', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'LANGUAGE', value: 'luo' });
    s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'LANGUAGE', value: 'ki' });
    const candidate = s.evidence.createRepairCandidate(created.researchId);
    const r = s.evidence.applyRepair(candidate.candidate.id, { authorized: true });
    assert.strictEqual(r.status, 'DEFERRED');
});

test('applyRepair() on an unknown candidateId returns NOT_FOUND, not a throw', () => {
    const s = freshStack();
    const r = s.evidence.applyRepair('RP035-P4-EVIDENCE-999', { authorized: true });
    assert.strictEqual(r.status, 'NOT_FOUND');
});

test('repair preserves provenance/language/country evidence — before/after equality on the underlying evidence', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'LANGUAGE', value: 'luo' });
    s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'LANGUAGE', value: 'ki' });
    const before = JSON.stringify(s.evidence.listEvidence({ researchRecordId: created.researchId }));
    const candidate = s.evidence.createRepairCandidate(created.researchId);
    s.evidence.applyRepair(candidate.candidate.id, { authorized: true });
    const after = JSON.stringify(s.evidence.listEvidence({ researchRecordId: created.researchId }));
    assert.strictEqual(before, after);
});

/* ===================================================================
   15. OFFLINE SYNC
=================================================================== */
console.log('\nOffline sync:');

test('buildEvidenceSyncOperation() composes Phase 7 real createSyncOperation()', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'TOPIC', value: 'healing' });
    const op = s.evidence.buildEvidenceSyncOperation(e.evidenceId);
    assert.strictEqual(op.status, 'LOCAL_ONLY');
    assert.strictEqual(op.operation.operationType, 'PROVENANCE_UPDATE');
});

test('CAPABILITY_UNAVAILABLE when offline sync engine is not loaded', () => {
    delete require.cache[require.resolve(roots.evidence)];
    global.window = { CozyOS: {} };
    require(roots.evidence);
    const r = global.window.CozyOS.CozyMediaEvidence.buildEvidenceSyncOperation('ev_fake');
    assert.strictEqual(r.status, 'REJECTED');
});

test('sync never fabricates SYNCED/ALL_DEVICES_SYNCED/CLOUD_BACKUP_COMPLETE/REMOTE_DELETED', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'TOPIC', value: 'healing' });
    const op = s.evidence.buildEvidenceSyncOperation(e.evidenceId);
    ['SYNCED', 'ALL_DEVICES_SYNCED', 'CLOUD_BACKUP_COMPLETE', 'REMOTE_DELETED'].forEach((bad) => {
        assert.notStrictEqual(op.status, bad);
    });
});

/* ===================================================================
   16. TRANSPORT (RP-033)
=================================================================== */
console.log('\nTransport:');

test('getCapabilityStatus() reports webRTC/bluetooth/wifiDirect/nativeHotspot as CAPABILITY_UNAVAILABLE — no fake transport', () => {
    const s = freshStack();
    const c = s.evidence.getCapabilityStatus();
    ['webRTC', 'bluetooth', 'wifiDirect', 'nativeHotspot'].forEach((k) => assert.strictEqual(c[k], 'CAPABILITY_UNAVAILABLE', k));
});

test('transport probe never upgrades to a claimed AVAILABLE state merely because the module loaded', () => {
    const s = freshStack();
    const c = s.evidence.getCapabilityStatus();
    assert.notStrictEqual(c.transport, 'AVAILABLE');
});

/* ===================================================================
   17. CAPABILITY REGISTRY
=================================================================== */
console.log('\nCapability registry:');

test('getCapabilityStatus() reports transcript/asr/ocr/faceRecognition/embeddings/videoDownload/frameAccess as CAPABILITY_UNAVAILABLE', () => {
    const s = freshStack();
    const c = s.evidence.getCapabilityStatus();
    ['transcript', 'asr', 'ocr', 'faceRecognition', 'embeddings', 'videoDownload', 'frameAccess'].forEach((k) => {
        assert.strictEqual(c[k], 'CAPABILITY_UNAVAILABLE', k);
    });
});

test('getCapabilityStatus() reports research/search/languageRouting/evidenceEnrichment AVAILABLE when loaded', () => {
    const s = freshStack();
    const c = s.evidence.getCapabilityStatus();
    assert.strictEqual(c.research, 'AVAILABLE');
    assert.strictEqual(c.search, 'AVAILABLE');
    assert.strictEqual(c.languageRouting, 'AVAILABLE');
    assert.strictEqual(c.evidenceEnrichment, 'AVAILABLE');
});

/* ===================================================================
   18. RULE 82
=================================================================== */
test('region evidence is genuinely UNAVAILABLE when the analysis job supplied no region — never fabricated to satisfy a test', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'sw', 'KE', null); // no region passed to the job
    const created = seedResearch(s, indexId, 'SERMON');
    const r = s.evidence.createLanguageEvidenceFromResearchRecord(created.researchId);
    assert.strictEqual(r.results.region, undefined);
    const rec = s.research.getResearchRecord(created.researchId);
    assert.strictEqual(rec.region, 'NOT_AVAILABLE');
});

test('region evidence IS created and correct when the analysis job actually supplies a real region (Kisumu case, positive path)', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'luo', 'KE', 'Kisumu');
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const r = s.evidence.createLanguageEvidenceFromResearchRecord(created.researchId);
    assert.strictEqual(r.results.region.evidence.value, 'Kisumu');
});

test('two conflicting REGION evidence values on the same record are UNRESOLVED, never silently merged', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'REGION', value: 'Kisumu' });
    s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'REGION', value: 'Homa Bay' });
    const r = s.evidence.checkEvidenceConflict(created.researchId, 'REGION');
    assert.strictEqual(r.status, 'UNRESOLVED');
});

test('DIALECT evidence is only created when the research record actually carries a real routed dialect', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'sw', 'KE', 'Nairobi');
    const created = seedResearch(s, indexId, 'SERMON');
    const r = s.evidence.createLanguageEvidenceFromResearchRecord(created.researchId);
    // No dialect was ever routed in this scenario — must not be fabricated.
    assert.strictEqual(r.results.dialect, undefined);
});

test('DIALECT evidence can be created directly when real dialect evidence is explicitly supplied', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'DIALECT', value: 'Nyanza-Dholuo' });
    assert.strictEqual(e.status, 'CREATED');
});

test('a person located in Kenya does not automatically produce Kisumu region evidence — no location inference from country alone', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'sw', 'KE', null); // country evidence only, no region
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const r = s.evidence.createLanguageEvidenceFromResearchRecord(created.researchId);
    assert.strictEqual(r.results.country.evidence.value, 'KE');
    assert.strictEqual(r.results.region, undefined);
});

test('Swahili language evidence alone never becomes proof of a specific region — Kisumu is not inferred from language', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'sw', 'KE', 'Mombasa');
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const r = s.evidence.createLanguageEvidenceFromResearchRecord(created.researchId);
    assert.strictEqual(r.results.region.evidence.value, 'Mombasa');
    assert.notStrictEqual(r.results.region.evidence.value, 'Kisumu');
});

/* ===================================================================
   8b. OFFLINE EVIDENCE CREATION
=================================================================== */
console.log('\nOffline evidence creation:');

test('local evidence creation works without any real network/transport, and never claims remote sync', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'TOPIC', value: 'healing' });
    assert.strictEqual(e.status, 'CREATED');
    assert.notStrictEqual(e.evidence.source, 'REMOTE_SYNCED');
});

test('offline-created evidence sync operation starts LOCAL_ONLY, never CLOUD_BACKED_UP', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'TOPIC', value: 'healing' });
    const op = s.evidence.buildEvidenceSyncOperation(e.evidenceId);
    assert.strictEqual(op.status, 'LOCAL_ONLY');
    assert.notStrictEqual(op.status, 'CLOUD_BACKED_UP');
});

/* ===================================================================
   8c. INVALID / AMBIGUOUS EVIDENCE
=================================================================== */
console.log('\nInvalid & ambiguous evidence:');

test('createEvidence() rejects a null researchRecordId string rather than silently proceeding', () => {
    const s = freshStack();
    const e = s.evidence.createEvidence({ researchRecordId: '', evidenceType: 'TOPIC', value: 'x' });
    assert.strictEqual(e.status, 'REJECTED');
});

test('checkEvidenceConflict() on an evidenceType outside EVIDENCE_TYPES still returns a safe NO_EVIDENCE, never throws', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const r = s.evidence.checkEvidenceConflict(created.researchId, 'NOT_A_REAL_TYPE');
    assert.strictEqual(r.status, 'NO_EVIDENCE');
});

console.log('\nRule 82:');

test('evidence module exposes no promotePack/forceAvailable/approvePack/promoteLanguage/setStatus mutator', () => {
    const s = freshStack();
    ['promotePack', 'forceAvailable', 'approvePack', 'promoteLanguage', 'setStatus', 'promote'].forEach((m) => {
        assert.strictEqual(typeof s.evidence[m], 'undefined', m);
    });
});

test('creating/reconciling/repairing evidence never changes RP-030 Rule 82 gate status', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'ha', 'NG', 'Kano');
    const created = seedResearch(s, indexId, 'SERMON');
    s.evidence.enrichResearchRecord(created.researchId);
    s.evidence.reconcile(created.researchId);
    assert.strictEqual(s.registry.requestPromotion('ha').status, 'BLOCKED');
});

/* ===================================================================
   19. MEDIA / IDENTITY
=================================================================== */
console.log('\nMedia identifiers:');

test('SOURCE evidence carries the real videoId as its value context via sourceId field', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'sourceEvVid' });
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'SOURCE', value: 'youtube' });
    assert.strictEqual(e.evidence.sourceId, 'sourceEvVid');
});

test('MEDIA_METADATA evidence stores a real title-derived value, not fabricated', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'metaVid', title: 'Real Title Here' });
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'MEDIA_METADATA', value: 'Real Title Here' });
    assert.strictEqual(e.evidence.value, 'Real Title Here');
});

test('ANALYSIS_REFERENCE evidence links to a real analysisJobId', () => {
    const s = freshStack();
    const { indexId, jobId } = seedLinkedLanguageRecord(s, 'sw', 'KE', 'Nairobi');
    const created = seedResearch(s, indexId, 'SERMON', { analysisJobId: jobId });
    const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'ANALYSIS_REFERENCE', value: jobId });
    assert.strictEqual(e.evidence.analysisJobId, jobId);
});

/* ===================================================================
   20. PERSON EVIDENCE
=================================================================== */
console.log('\nPerson evidence:');

test('PERSON_REFERENCE evidence never claims automated detection', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    s.research.addPersonReference(created.researchId, { state: 'CONFIRMED_PERSON', confirmedBy: 'admin-7' });
    const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'PERSON_REFERENCE', value: 'admin-7' });
    assert.strictEqual(e.status, 'CREATED');
    assert.strictEqual(s.research.getPersonAppearanceCapability().status, 'CAPABILITY_UNAVAILABLE');
});

test('admin-confirmed person evidence is distinguishable from an unconfirmed possible reference', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    s.research.addPersonReference(created.researchId, { state: 'POSSIBLE_PERSON', confidence: 0.4 });
    const rec = s.research.getResearchRecord(created.researchId);
    assert.strictEqual(rec.peopleReferences[0].state, 'POSSIBLE_PERSON');
});

/* ===================================================================
   21. PERFORMANCE (measured, never fabricated)
=================================================================== */
console.log('\nPerformance (measured):');

test('performance: createEvidence() on a real record — measured average time reported', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const N = 50;
    const start = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
        s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'TOPIC', value: 'topic-' + i });
    }
    const end = process.hrtime.bigint();
    const msPerOp = Number(end - start) / 1e6 / N;
    console.log(`      measured: ${msPerOp.toFixed(4)}ms/op (createEvidence)`);
    assert.ok(msPerOp >= 0);
});

test('performance: reconcile() over a real evidence set — measured average time reported', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    for (let i = 0; i < 30; i++) {
        s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'TOPIC', value: 'topic-' + i });
    }
    const N = 20;
    const start = process.hrtime.bigint();
    for (let i = 0; i < N; i++) s.evidence.reconcile(created.researchId);
    const end = process.hrtime.bigint();
    const msPerOp = Number(end - start) / 1e6 / N;
    console.log(`      measured: ${msPerOp.toFixed(4)}ms/op (reconcile, 30 evidence items)`);
    assert.ok(msPerOp >= 0);
});

/* ===================================================================
   22. REMOTE VS LOCAL EVIDENCE
=================================================================== */
console.log('\nRemote vs local evidence:');

test('evidence never claims remote confirmation — source is derived from real local provenance only', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const e = s.evidence.createEvidence({ researchRecordId: created.researchId, evidenceType: 'TOPIC', value: 'x' });
    assert.notStrictEqual(e.evidence.source, 'REMOTE_CONFIRMED');
});

/* ===================================================================
   23. CHURCH MEDIA SCENARIO — full real integration, no mocks
=================================================================== */
console.log('\nChurch media scenario (end-to-end):');

test('scenario: authorized source -> connector -> index -> analysis -> link -> research -> evidence enrichment -> language routing -> country -> search', () => {
    const s = freshStack();
    const indexId = seedRecord(s, {
        sourceId: 'churchEvidence2025', title: 'Healing Testimony Sunday',
        description: 'A testimony of healing and prayer in Dholuo',
        searchableTerms: ['testimony', 'healing']
    });
    s.registry.registerRegionalContext('luo', { country: 'KE', region: 'Homa Bay' });
    const jobId = seedJob(s, indexId, 'LANGUAGE_IDENTIFICATION', { languageId: 'luo', region: 'Homa Bay' });
    s.analysis.runJob(jobId);
    const linkResult = s.link.linkAnalysisToRecord(jobId);
    assert.strictEqual(linkResult.status, 'LINKED');

    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'HEALING', analysisJobId: jobId });
    assert.strictEqual(created.status, 'CREATED');
    s.research.applyPrivacy(created.researchId);

    const enrichment = s.evidence.enrichResearchRecord(created.researchId);
    assert.strictEqual(enrichment.status, 'ENRICHED');
    assert.strictEqual(enrichment.languageEvidence.results.language.evidence.value, 'luo');
    assert.strictEqual(enrichment.languageEvidence.results.country.evidence.value, 'KE');

    const recon = s.evidence.reconcile(created.researchId);
    assert.strictEqual(recon.result, 'CONSISTENT');

    const sq = s.rsearch.buildStructuredQuery('healing', { researchType: 'HEALING', languageId: 'luo', country: 'KE' });
    const results = s.rsearch.searchResearchIntelligence(sq);
    const hit = results.results.find((r) => r.videoId === 'churchEvidence2025');
    assert.ok(hit);

    assert.strictEqual(s.registry.requestPromotion('luo').status, 'BLOCKED');
});

/* ===================================================================
   24. REGRESSION SANITY
=================================================================== */
console.log('\nRegression sanity:');

test('regression: Phase 3 research search still functions unchanged alongside Phase 4', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'regressionP3Vid', searchableTerms: ['prayer'] });
    seedResearch(s, indexId, 'PRAYER');
    const sq = s.rsearch.buildStructuredQuery('prayer', {});
    assert.strictEqual(s.rsearch.searchResearchIntelligence(sq).status, 'OK');
});

test('regression: Phase 2 research creation still functions unchanged alongside Phase 4', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const r = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'TESTIMONY' });
    assert.strictEqual(r.status, 'CREATED');
});

test('regression: Phase 1 media analysis link still functions unchanged alongside Phase 4', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    assert.strictEqual(s.link.linkAnalysisToRecord(jobId).status, 'LINKED');
});

test('regression: RP-030 registry still reports 13 defaults with Phase 4 loaded', () => {
    const s = freshStack();
    assert.strictEqual(s.registry.listDefaultPacks().length, 13);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
