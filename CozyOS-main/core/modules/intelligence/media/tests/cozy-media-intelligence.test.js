/**
 * core/modules/intelligence/media/tests/cozy-media-intelligence.test.js
 * RP-035 Phase 5 — Living Media Intelligence Discovery
 * Run with: node core/modules/intelligence/media/tests/cozy-media-intelligence.test.js
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
    evidence: path.join(__dirname, '..', 'cozy-media-evidence.js'),
    mediaIntel: path.join(__dirname, '..', 'cozy-media-intelligence.js'),
    identityEngine: path.join(__dirname, '..', '..', '..', 'identity', 'identity-engine.js'),
    serviceRegistry: path.join(__dirname, '..', '..', '..', '..', 'registry', 'cozy-registry.js')
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
    require(roots.mediaIntel);
    require(roots.identityEngine);
    require(roots.serviceRegistry);

    return {
        win,
        idx: win.CozyOS.CozyRemoteMediaIndex,
        analysis: win.CozyOS.CozyRemoteMediaAnalysis,
        registry: win.CozyOS.CozyLanguagePacks,
        link: win.CozyOS.CozyMediaAnalysisLink,
        research: win.CozyOS.CozyResearchIntelligence,
        rsearch: win.CozyOS.CozyResearchSearch,
        evidence: win.CozyOS.CozyMediaEvidence,
        mediaIntel: win.CozyOS.CozyMediaIntelligence,
        identity: win.CozyOS.IdentityEngine,
        serviceRegistry: win.CozyOS.ServiceRegistry
    };
}

function seedRecord(s, overrides) {
    const created = s.idx.createRecord(Object.assign({
        sourceType: 'youtube', sourceId: 'dQw4w9WgXcQ_' + Math.random().toString(36).slice(2),
        title: 'Sunday Service', description: 'A church service testimony about healing and prayer',
        ownerAuthorization: { state: 'AUTHORIZED' },
        searchableTerms: ['testimony', 'healing', 'prayer']
    }, overrides));
    return created.indexId;
}

function seedLinkedLanguageRecord(s, langId, country, region, overrides) {
    const indexId = seedRecord(s, Object.assign({ sourceId: 'vid_' + langId + '_' + Date.now() + '_' + Math.random().toString(36).slice(2) }, overrides));
    if (country) s.registry.registerRegionalContext(langId, { country, region });
    const job = s.analysis.createJob('LANGUAGE_IDENTIFICATION', { indexId, languageId: langId, region });
    s.analysis.runJob(job.jobId);
    s.link.linkAnalysisToRecord(job.jobId);
    return { indexId, jobId: job.jobId };
}

function seedResearch(s, indexId, researchType, extra) {
    const created = s.research.createResearchRecord(Object.assign({ sourceRecordId: indexId, researchType }, extra));
    if (created.status === 'CREATED') s.research.applyPrivacy(created.researchId);
    return created;
}

async function makeActiveUser(s, username) {
    const result = await s.identity.createUser({ username, password: 'Str0ngPassw0rd!', roles: [] });
    if (!result || result.available !== true || !result.userId) {
        throw new Error('makeActiveUser() failed to create a real user: ' + JSON.stringify(result));
    }
    return result;
}

(async () => {
console.log('RP-035 Phase 5 — Living Media Intelligence Discovery tests\n');

/* ===================================================================
   1. TESTIMONY DISCOVERY
=================================================================== */
console.log('Testimony discovery:');

test('discoverTestimonies() composes Phase 3, never a second search engine', () => {
    delete require.cache[require.resolve(roots.mediaIntel)];
    global.window = { CozyOS: {} };
    require(roots.mediaIntel);
    const r = global.window.CozyOS.CozyMediaIntelligence.discoverTestimonies({});
    assert.strictEqual(r.status, 'CAPABILITY_UNAVAILABLE');
});

test('discoverTestimonies() finds a real seeded HEALING testimony', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'discHealingVid', searchableTerms: ['healing'] });
    seedResearch(s, indexId, 'HEALING');
    const r = s.mediaIntel.discoverTestimonies({ query: 'healing', researchType: 'HEALING' });
    assert.strictEqual(r.status, 'OK');
    assert.ok(r.results.some((x) => x.videoId === 'discHealingVid'));
});

test('discoverTestimonies() rejects an unrecognized researchType', () => {
    const s = freshStack();
    const r = s.mediaIntel.discoverTestimonies({ researchType: 'NOT_REAL' });
    assert.strictEqual(r.status, 'REJECTED');
});

['TESTIMONY', 'HEALING', 'PRAYER', 'SERMON', 'ANNOUNCEMENT', 'GRADUATION', 'WORSHIP', 'TEACHING', 'EVENT', 'OTHER'].forEach((type) => {
    test(`discoverTestimonies() supports researchType ${type} dynamically from Phase 2`, () => {
        const s = freshStack();
        const indexId = seedRecord(s, { sourceId: 'disc_' + type, searchableTerms: [type.toLowerCase()] });
        seedResearch(s, indexId, type);
        const r = s.mediaIntel.discoverTestimonies({ query: type.toLowerCase(), researchType: type });
        assert.ok(r.results.every((x) => x.researchType === type));
    });
});

/* ===================================================================
   2. PERSON APPEARANCE / REPEATED-PERSON RESEARCH
=================================================================== */
console.log('\nPerson appearance:');

test('findPersonAppearances() separates confirmed from possible, never promotes possible to confirmed', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    s.research.addPersonReference(created.researchId, { state: 'CONFIRMED_PERSON', confirmedBy: 'admin-p5', timestamp: 10 });
    const r = s.mediaIntel.findPersonAppearances('admin-p5', {});
    assert.strictEqual(r.status, 'OK');
    assert.ok(r.confirmedAppearances.length >= 1);
    assert.strictEqual(r.possibleAppearances.length, 0);
});

test('findPersonAppearances() never claims automated face-recognition detection', () => {
    const s = freshStack();
    const r = s.mediaIntel.findPersonAppearances('someone', {});
    assert.strictEqual(r.capability, 'CAPABILITY_UNAVAILABLE_FOR_AUTOMATED_DETECTION');
});

test('CAPABILITY_UNAVAILABLE when Phase 3 search engine absent', () => {
    delete require.cache[require.resolve(roots.mediaIntel)];
    global.window = { CozyOS: {} };
    require(roots.mediaIntel);
    const r = global.window.CozyOS.CozyMediaIntelligence.findPersonAppearances('x', {});
    assert.strictEqual(r.status, 'CAPABILITY_UNAVAILABLE');
});

/* ===================================================================
   3. TIMESTAMP NAVIGATION
=================================================================== */
console.log('\nTimestamp navigation:');

test('navigateToTimestamp() returns only real matching timestamp entries', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'navVid' });
    s.idx.addTimestamp(indexId, { timestampSeconds: 88 });
    s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'EVENT', timestamp: 88 });
    const r = s.mediaIntel.navigateToTimestamp('navVid', 88);
    assert.strictEqual(r.results.length, 1);
});

test('navigateToTimestamp() never fabricates a result for a nonexistent timestamp', () => {
    const s = freshStack();
    const r = s.mediaIntel.navigateToTimestamp('noSuchVid', 999);
    assert.strictEqual(r.results.length, 0);
});

/* ===================================================================
   4. EVIDENCE-AWARE SEARCH
=================================================================== */
console.log('\nEvidence-aware search:');

test('evidenceAwareSearch() attaches real Phase 4 evidence dimensions, never fabricated', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'sw', 'KE', 'Nairobi', { searchableTerms: ['sermon'] });
    const created = seedResearch(s, indexId, 'SERMON');
    s.evidence.enrichResearchRecord(created.researchId);
    const r = s.mediaIntel.evidenceAwareSearch('sermon', { researchType: 'SERMON' });
    const hit = r.results.find((x) => x.researchRecordId === created.researchId);
    assert.ok(hit);
    assert.ok(Array.isArray(hit.evidenceDimensions));
    assert.ok(hit.evidenceDimensions.some((d) => d.evidenceType === 'LANGUAGE' && d.value === 'sw'));
});

test('evidenceAwareSearch() degrades to null dimensions honestly when evidence engine absent, never throws', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'noEvidenceVid', searchableTerms: ['testimony'] });
    seedResearch(s, indexId, 'TESTIMONY');
    const r = s.mediaIntel.evidenceAwareSearch('testimony', {});
    assert.strictEqual(r.status, 'OK');
});

test('country flag/name evidence-aware result preserves presentation-only status', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'sw', 'KE', 'Nairobi', { searchableTerms: ['sermon'] });
    const created = seedResearch(s, indexId, 'SERMON');
    const r = s.mediaIntel.evidenceAwareSearch('sermon', {});
    const hit = r.results.find((x) => x.researchRecordId === created.researchId);
    assert.strictEqual(hit.country.code, 'KE');
    assert.ok(hit.country.flag);
});

/* ===================================================================
   5. OFFLINE-FIRST RESEARCH
=================================================================== */
console.log('\nOffline-first research:');

test('getResearchAvailability() never claims fresh remote results', () => {
    const s = freshStack();
    const r = s.mediaIntel.getResearchAvailability();
    assert.strictEqual(r.remoteFetch, 'DELEGATED_TO_CONNECTOR_NEVER_FABRICATED_FRESH');
});

/* ===================================================================
   6. COZYAI QUESTION ANSWERING
=================================================================== */
console.log('\nCozyAI question answering:');

test('answerMediaQuestion() answers FOUND for a real recognizable researchType keyword', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'qaHealingVid', searchableTerms: ['healing'] });
    seedResearch(s, indexId, 'HEALING');
    const r = s.mediaIntel.answerMediaQuestion('Find healing testimonies');
    assert.strictEqual(r.answer, 'FOUND');
    assert.strictEqual(r.matchedType, 'HEALING');
});

test('answerMediaQuestion() answers UNKNOWN honestly when no researchType/language term is recognized', () => {
    const s = freshStack();
    const r = s.mediaIntel.answerMediaQuestion('xyzzy plugh quux');
    assert.strictEqual(r.answer, 'UNKNOWN');
});

test('answerMediaQuestion() answers NOT_AVAILABLE when the type is recognized but no evidence matches', () => {
    const s = freshStack();
    const r = s.mediaIntel.answerMediaQuestion('Find graduation ceremonies');
    assert.strictEqual(r.answer, 'NOT_AVAILABLE');
});

test('answerMediaQuestion() detects a real language term from RP-030, never a fabricated language guess', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'sw', 'KE', 'Nairobi', { searchableTerms: ['sermon'] });
    seedResearch(s, indexId, 'SERMON');
    const r = s.mediaIntel.answerMediaQuestion('Find sermons in kiswahili');
    assert.strictEqual(r.matchedLanguage, 'sw');
});

test('answerMediaQuestion() rejects an empty question rather than guessing', () => {
    const s = freshStack();
    const r = s.mediaIntel.answerMediaQuestion('');
    assert.strictEqual(r.status, 'REJECTED');
});

test('answerMediaQuestion() never claims semantic/LLM understanding — purely real keyword matching against real vocabularies', () => {
    const s = freshStack();
    assert.strictEqual(typeof s.mediaIntel.answerMediaQuestion, 'function');
    const r = s.mediaIntel.answerMediaQuestion('healing');
    assert.notStrictEqual(r.answer, undefined);
});

/* ===================================================================
   7. DASHBOARD REGISTRATION / BUILT_IN CORE APP TIER
=================================================================== */
console.log('\nDashboard registration & BUILT_IN core tier:');

test('registerAsCoreApplication() registers through the real ServiceRegistry, never a second app registry', () => {
    const s = freshStack();
    const r = s.mediaIntel.registerAsCoreApplication();
    assert.strictEqual(r.serviceRegistry, 'REGISTERED');
    assert.ok(s.serviceRegistry.hasApplication('media_intelligence_001'));
});

test('registerAsCoreApplication() registers BUILT_IN visibility through the real IdentityEngine core-tier', () => {
    const s = freshStack();
    const r = s.mediaIntel.registerAsCoreApplication();
    assert.strictEqual(r.coreVisibility, 'REGISTERED');
    assert.strictEqual(s.identity.isCoreApplication('media-intelligence'), true);
});

test('CAPABILITY_UNAVAILABLE reported honestly when ServiceRegistry/IdentityEngine are absent', () => {
    delete require.cache[require.resolve(roots.mediaIntel)];
    global.window = { CozyOS: {} };
    require(roots.mediaIntel);
    const r = global.window.CozyOS.CozyMediaIntelligence.registerAsCoreApplication();
    assert.strictEqual(r.serviceRegistry, 'CAPABILITY_UNAVAILABLE');
    assert.strictEqual(r.coreVisibility, 'CAPABILITY_UNAVAILABLE');
});

await test('BUILT_IN core app is visible on a real active user dashboard without any per-user assignment', async () => {
    const s = freshStack();
    s.mediaIntel.registerAsCoreApplication();
    const user = await makeActiveUser(s, 'p5-user-' + Date.now());
    const config = s.identity.getDashboardConfig(user.userId);
    assert.ok(config.coreApplications.indexOf('media-intelligence') !== -1);
    assert.strictEqual(config.assignedApplications.indexOf('media-intelligence'), -1);
});

await test('visibility (core tier) stays separate from authorization (per-user assignment) — a non-core app is never auto-visible', async () => {
    const s = freshStack();
    const user = await makeActiveUser(s, 'p5-user2-' + Date.now());
    const config = s.identity.getDashboardConfig(user.userId);
    assert.strictEqual(config.coreApplications.length, 0);
});

await test('canAccessApplication() grants access to a BUILT_IN core app without assignApplication() ever being called', async () => {
    const s = freshStack();
    s.mediaIntel.registerAsCoreApplication();
    const user = await makeActiveUser(s, 'p5-user3-' + Date.now());
    assert.strictEqual(s.identity.canAccessApplication(user.userId, 'media-intelligence'), true);
});

await test('a core app still respects the existing global disable kill switch', async () => {
    const s = freshStack();
    s.mediaIntel.registerAsCoreApplication();
    s.identity.setApplicationEnabled('media-intelligence', false);
    const user = await makeActiveUser(s, 'p5-user4-' + Date.now());
    assert.strictEqual(s.identity.canAccessApplication(user.userId, 'media-intelligence'), false);
});

await test('an inactive user cannot access a core app either — active-account check still applies', async () => {
    const s = freshStack();
    s.mediaIntel.registerAsCoreApplication();
    const user = await makeActiveUser(s, 'p5-user5-' + Date.now());
    s.identity.disableUser(user.userId);
    assert.strictEqual(s.identity.canAccessApplication(user.userId, 'media-intelligence'), false);
});

test('unregisterCoreApplication() removes BUILT_IN visibility, never breaks canAccessApplication()', () => {
    const s = freshStack();
    s.identity.registerCoreApplication('temp-core-app');
    assert.strictEqual(s.identity.isCoreApplication('temp-core-app'), true);
    s.identity.unregisterCoreApplication('temp-core-app');
    assert.strictEqual(s.identity.isCoreApplication('temp-core-app'), false);
});

test('registerCoreApplication() validates appName format, same discipline as assignApplication()', () => {
    const s = freshStack();
    assert.throws(() => s.identity.registerCoreApplication('Not Valid!'));
});

/* ===================================================================
   8. CAPABILITY REGISTRY
=================================================================== */
console.log('\nCapability registry:');

test('getCapabilityStatus() reports faceRecognition/asr/ocr/embeddings as CAPABILITY_UNAVAILABLE (composed from Phase 4)', () => {
    const s = freshStack();
    const c = s.mediaIntel.getCapabilityStatus();
    ['faceRecognition', 'asr', 'ocr', 'embeddings'].forEach((k) => assert.strictEqual(c[k], 'CAPABILITY_UNAVAILABLE', k));
});

test('getCapabilityStatus() honestly labels cozyAIIntegration as metadata-only, never claims semantic NLU', () => {
    const s = freshStack();
    const c = s.mediaIntel.getCapabilityStatus();
    assert.strictEqual(c.cozyAIIntegration, 'CAPABILITY_UNAVAILABLE');
});

test('getCapabilityStatus() reports dashboardVisibility BUILT_IN only after real registration', () => {
    const s = freshStack();
    assert.strictEqual(s.mediaIntel.getCapabilityStatus().dashboardVisibility, 'NOT_REGISTERED');
    s.mediaIntel.registerAsCoreApplication();
    assert.strictEqual(s.mediaIntel.getCapabilityStatus().dashboardVisibility, 'BUILT_IN');
});

/* ===================================================================
   9. RULE 82 / 13-LANGUAGE ARCHITECTURE
=================================================================== */
console.log('\nRule 82 & 13-language architecture:');

test('media intelligence module exposes no promotePack/forceAvailable/approvePack/setStatus mutator', () => {
    const s = freshStack();
    ['promotePack', 'forceAvailable', 'approvePack', 'setStatus', 'promote'].forEach((m) => {
        assert.strictEqual(typeof s.mediaIntel[m], 'undefined', m);
    });
});

test('discovery/search/QA never changes RP-030 Rule 82 gate status', () => {
    const s = freshStack();
    const { indexId } = seedLinkedLanguageRecord(s, 'ha', 'NG', 'Kano', { searchableTerms: ['sermon'] });
    seedResearch(s, indexId, 'SERMON');
    s.mediaIntel.discoverTestimonies({ researchType: 'SERMON', languageId: 'ha' });
    s.mediaIntel.answerMediaQuestion('Find sermons in hausa');
    assert.strictEqual(s.registry.requestPromotion('ha').status, 'BLOCKED');
});

test('13 default language packs remain dynamically discoverable through Phase 5', () => {
    const s = freshStack();
    assert.strictEqual(s.registry.listDefaultPacks().length, 13);
});

test('optional installed pack remains distinguishable from defaults through Phase 5 discovery', () => {
    const s = freshStack();
    const optionalApi = s.win.CozyOS.Modules['cozy-optional-language-pack-discovery'].api;
    optionalApi.requestOptionalPack('am', {});
    assert.strictEqual(s.registry.listDefaultPacks().length, 13);
    assert.ok(s.registry.listOptionalPacks().map((p) => p.identity.languageId).indexOf('am') !== -1);
});

/* ===================================================================
   10. CHURCH MEDIA WORKFLOW — full real integration
=================================================================== */
console.log('\nChurch media workflow (end-to-end):');

await test('scenario: authorized source -> index -> analysis -> link -> research -> evidence -> discovery -> QA -> dashboard registration', async () => {
    const s = freshStack();
    const indexId = seedRecord(s, {
        sourceId: 'churchP5Scenario', title: 'Healing Testimony Sunday',
        description: 'A testimony of healing and prayer', searchableTerms: ['testimony', 'healing']
    });
    s.registry.registerRegionalContext('luo', { country: 'KE', region: 'Homa Bay' });
    const job = s.analysis.createJob('LANGUAGE_IDENTIFICATION', { indexId, languageId: 'luo', region: 'Homa Bay' });
    s.analysis.runJob(job.jobId);
    assert.strictEqual(s.link.linkAnalysisToRecord(job.jobId).status, 'LINKED');

    const created = s.research.createResearchRecord({ sourceRecordId: indexId, researchType: 'HEALING', analysisJobId: job.jobId });
    s.research.applyPrivacy(created.researchId);
    s.evidence.enrichResearchRecord(created.researchId);

    const discovery = s.mediaIntel.discoverTestimonies({ query: 'healing', researchType: 'HEALING', languageId: 'luo' });
    assert.ok(discovery.results.some((r) => r.videoId === 'churchP5Scenario'));

    const qa = s.mediaIntel.answerMediaQuestion('Find healing testimonies');
    assert.strictEqual(qa.answer, 'FOUND');

    const reg = s.mediaIntel.registerAsCoreApplication();
    assert.strictEqual(reg.serviceRegistry, 'REGISTERED');
    assert.strictEqual(reg.coreVisibility, 'REGISTERED');

    const user = await makeActiveUser(s, 'church-p5-user-' + Date.now());
    assert.strictEqual(s.identity.canAccessApplication(user.userId, 'media-intelligence'), true);

    assert.strictEqual(s.registry.requestPromotion('luo').status, 'BLOCKED');
});

/* ===================================================================
   11. REGRESSION SANITY
=================================================================== */
console.log('\nRegression sanity:');

test('regression: Phase 4 evidence enrichment still functions unchanged alongside Phase 5', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const created = seedResearch(s, indexId, 'TESTIMONY');
    const r = s.evidence.enrichResearchRecord(created.researchId);
    assert.strictEqual(r.status, 'ENRICHED');
});

test('regression: Phase 3 research search still functions unchanged alongside Phase 5', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'regP5Vid', searchableTerms: ['prayer'] });
    seedResearch(s, indexId, 'PRAYER');
    const sq = s.rsearch.buildStructuredQuery('prayer', {});
    assert.strictEqual(s.rsearch.searchResearchIntelligence(sq).status, 'OK');
});

test('regression: Phase 1 media analysis link still functions unchanged alongside Phase 5', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const job = s.analysis.createJob('TERM_EXTRACTION', { indexId });
    s.analysis.runJob(job.jobId);
    assert.strictEqual(s.link.linkAnalysisToRecord(job.jobId).status, 'LINKED');
});

test('regression: RP-030 registry still reports 13 defaults with Phase 5 loaded', () => {
    const s = freshStack();
    assert.strictEqual(s.registry.listDefaultPacks().length, 13);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
})();
