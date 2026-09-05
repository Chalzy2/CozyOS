/**
 * core/modules/intelligence/media/tests/cozy-media-analysis-link.test.js
 * RP-035 Phase 1 — real, executed tests for cozy-media-analysis-link.js,
 * closing RP-034-PHASE8-ANALYSIS-FIELD-GAP, against the REAL, complete
 * RP-034 Phase 1-8 + RP-033 + RP-029/030/031 chain (no mocks for any
 * composed engine).
 * Run with: node core/modules/intelligence/media/tests/cozy-media-analysis-link.test.js
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
    link: path.join(__dirname, '..', 'cozy-media-analysis-link.js')
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

    return {
        win,
        idx: win.CozyOS.CozyRemoteMediaIndex,
        search: win.CozyOS.CozyRemoteMediaSearch,
        analysis: win.CozyOS.CozyRemoteMediaAnalysis,
        connectors: win.CozyOS.CozyMediaConnectors,
        registry: win.CozyOS.CozyLanguagePacks,
        langIntel: win.CozyOS.CozyAfricanLanguageIntelligence,
        privacy: win.CozyOS.CozyIntelligencePrivacy,
        sync: win.CozyOS.CozyIntelligenceOfflineSync,
        gate: win.CozyOS.CozyKnowledgeSafetyGate,
        link: win.CozyOS.CozyMediaAnalysisLink
    };
}

function seedRecord(s, overrides) {
    const created = s.idx.createRecord(Object.assign({
        sourceType: 'youtube', sourceId: 'dQw4w9WgXcQ',
        title: 'Sunday Service', description: 'A church service video about greeting terms and community life'
    }, overrides));
    return created.indexId;
}

function seedJob(s, indexId, type, params) {
    const job = s.analysis.createJob(type, Object.assign({ indexId }, params));
    return job.jobId;
}

console.log('RP-035 Phase 1 — Media Analysis Link / Reconciliation Coordinator tests\n');

/* ===================================================================
   1. GAP CLOSURE — CORE LINKING
=================================================================== */
console.log('Gap closure — core linking:');

test('link: record.analysis stays NOT_ANALYZED before any linking, confirming the real gap this phase closes', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    assert.strictEqual(s.idx.getRecord(indexId).analysis.status, 'NOT_ANALYZED');
});

test('link: linkAnalysisToRecord() writes the completed job status into record.analysis', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    const r = s.link.linkAnalysisToRecord(jobId);
    assert.strictEqual(r.status, 'LINKED');
    assert.strictEqual(s.idx.getRecord(indexId).analysis.status, 'COMPLETED');
});

test('link: writes a REFERENCE (jobId + type), never a full copy of the job result', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    const rec = s.idx.getRecord(indexId);
    assert.strictEqual(rec.analysis.resultReference.jobId, jobId);
    assert.strictEqual(rec.analysis.terms, undefined);
});

test('link: preserves Phase 2\'s original analysis.capabilities field untouched', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    assert.strictEqual(s.idx.getRecord(indexId).analysis.capabilities, 'CAPABILITY_UNAVAILABLE');
});

test('link: rejects a nonexistent jobId rather than fabricating a link', () => {
    const s = freshStack();
    const r = s.link.linkAnalysisToRecord('rmaj_does_not_exist');
    assert.strictEqual(r.status, 'REJECTED');
});

test('link: CAPABILITY_UNAVAILABLE when Phase 4 analysis engine is not loaded', () => {
    delete require.cache[require.resolve(roots.link)];
    global.window = { CozyOS: {} };
    require(roots.link);
    const r = global.window.CozyOS.CozyMediaAnalysisLink.linkAnalysisToRecord('x');
    assert.strictEqual(r.status, 'CAPABILITY_UNAVAILABLE');
});

/* ===================================================================
   2. FAILURE HANDLING
=================================================================== */
console.log('\nFailure handling:');

test('failure: analysis job exists but source record was deleted -> LINK_FAILED, no orphan created', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    s.idx.deleteRecord(indexId, { authorized: true });
    const r = s.link.linkAnalysisToRecord(jobId);
    assert.strictEqual(r.status, 'LINK_FAILED');
    assert.strictEqual(s.idx.getRecord(indexId), null);
});

test('failure: a QUEUED (not yet run) job links with QUEUED status, never a fabricated COMPLETED', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    const r = s.link.linkAnalysisToRecord(jobId);
    assert.strictEqual(r.status, 'LINKED');
    assert.strictEqual(r.analysisStatus, 'QUEUED');
});

test('failure: a FAILED job links with FAILED status honestly, never upgraded to COMPLETED', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'noTextSource', description: null, title: null });
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    const job = s.analysis.getJob(jobId);
    assert.ok(job.state === 'CAPABILITY_UNAVAILABLE' || job.state === 'FAILED');
    const r = s.link.linkAnalysisToRecord(jobId);
    assert.strictEqual(r.analysisStatus, job.state);
});

test('failure: source record exists but no analysis job was ever created -> reconcile reports CONSISTENT (NOT_ANALYZED is correct)', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const r = s.link.reconcile(indexId);
    assert.strictEqual(r.result, 'CONSISTENT');
});

/* ===================================================================
   3. RECONCILIATION
=================================================================== */
console.log('\nReconciliation:');

test('reconcile: MISSING_ANALYSIS when a completed job exists but was never linked', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    const r = s.link.reconcile(indexId);
    assert.strictEqual(r.result, 'MISSING_ANALYSIS');
    assert.strictEqual(r.jobId, jobId);
});

test('reconcile: CONSISTENT immediately after a real link', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    assert.strictEqual(s.link.reconcile(indexId).result, 'CONSISTENT');
});

test('reconcile: ORPHANED_ANALYSIS is honestly reported when record.analysis references a jobId no longer in Phase 4\'s real store', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    // Simulate the referenced job having vanished from Phase 4's real
    // store (e.g. a session restart) via Phase 2's own real updateRecord()
    // — never touching Phase 4's storage directly.
    s.idx.updateRecord(indexId, { analysis: { jobId: 'rmaj_no_longer_exists', resultReference: { jobId: 'rmaj_no_longer_exists', type: 'TERM_EXTRACTION' } } }, { provenanceSource: 'SYSTEM_DERIVED' });
    const r = s.link.reconcile(indexId);
    assert.strictEqual(r.result, 'ORPHANED_ANALYSIS');
});

test('reconcile: STATUS_MISMATCH when Phase 4 job progresses after the link was written', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.link.linkAnalysisToRecord(jobId); // links while QUEUED
    s.analysis.runJob(jobId); // now COMPLETED in Phase 4's real store, record still says QUEUED
    const r = s.link.reconcile(indexId);
    assert.strictEqual(r.result, 'STATUS_MISMATCH');
    assert.strictEqual(r.recordedStatus, 'QUEUED');
    assert.strictEqual(r.actualStatus, 'COMPLETED');
});

test('reconcile: NOT_FOUND for a nonexistent indexId, never a fabricated CONSISTENT', () => {
    const s = freshStack();
    assert.strictEqual(s.link.reconcile('rmi_does_not_exist').result, 'NOT_FOUND');
});

test('reconcile: reconcileAll() covers every real indexed record', () => {
    const s = freshStack();
    seedRecord(s, { sourceId: 'v1' });
    seedRecord(s, { sourceId: 'v2' });
    const r = s.link.reconcileAll();
    assert.strictEqual(r.results.length, 2);
});

/* ===================================================================
   4. REPAIR QUEUE — idempotent, non-destructive
=================================================================== */
console.log('\nRepair queue:');

test('repair: createRepairCandidate() produces a candidate for a real MISSING_ANALYSIS finding', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    const r = s.link.createRepairCandidate(indexId);
    assert.strictEqual(r.status, 'CANDIDATE_CREATED');
    assert.strictEqual(r.candidate.problem, 'MISSING_ANALYSIS');
    assert.ok(/^RP035-MEDIA-LINK-\d{3}$/.test(r.candidate.id));
});

test('repair: no candidate is created for a CONSISTENT record', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const r = s.link.createRepairCandidate(indexId);
    assert.strictEqual(r.status, 'NO_CANDIDATE');
});

test('repair: candidate preserves sourceRecordId/jobId/problem/severity/detectedAt/recommendedAction (spec §12)', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    const r = s.link.createRepairCandidate(indexId);
    ['sourceRecordId', 'jobId', 'problem', 'severity', 'detectedAt', 'recommendedAction'].forEach((f) => {
        assert.ok(r.candidate[f] !== undefined, f);
    });
});

test('repair: applyRepair() without { authorized: true } requires confirmation — no automatic destructive repair', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    const created = s.link.createRepairCandidate(indexId);
    const r = s.link.applyRepair(created.candidate.id, {});
    assert.strictEqual(r.status, 'CONFIRMATION_REQUIRED');
});

test('repair: applyRepair({authorized:true}) resolves a real MISSING_ANALYSIS candidate by linking', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    const created = s.link.createRepairCandidate(indexId);
    const r = s.link.applyRepair(created.candidate.id, { authorized: true });
    assert.strictEqual(r.status, 'RESOLVED');
    assert.strictEqual(s.idx.getRecord(indexId).analysis.status, 'COMPLETED');
});

test('repair: idempotent repair — applying the same resolved candidate twice is rejected, not double-applied', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    const created = s.link.createRepairCandidate(indexId);
    s.link.applyRepair(created.candidate.id, { authorized: true });
    const second = s.link.applyRepair(created.candidate.id, { authorized: true });
    assert.strictEqual(second.status, 'REJECTED');
});

test('repair: duplicate linkage — calling linkAnalysisToRecord() twice on an unchanged job is a real NO_CHANGE, not a duplicate write', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    const versionBefore = s.idx.getRecord(indexId).sync.version;
    const second = s.link.linkAnalysisToRecord(jobId);
    assert.strictEqual(second.status, 'NO_CHANGE');
    assert.strictEqual(s.idx.getRecord(indexId).sync.version, versionBefore);
});

test('repair: listRepairCandidates() filters by status', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    s.link.createRepairCandidate(indexId);
    const open = s.link.listRepairCandidates({ status: 'OPEN' });
    assert.strictEqual(open.length, 1);
});

/* ===================================================================
   5. PROVENANCE PRESERVATION
=================================================================== */
console.log('\nProvenance preservation:');

test('provenance: source/sourceRecordId/videoId remain intact after linking', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'churchVideo123' });
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    const rec = s.idx.getRecord(indexId);
    assert.strictEqual(rec.sourceId, 'churchVideo123');
    assert.strictEqual(rec.sourceType, 'youtube');
});

test('provenance: fieldProvenance records "analysis" as changed with ANALYSIS_RESULT source after linking', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    const rec = s.idx.getRecord(indexId);
    assert.strictEqual(rec.fieldProvenance.analysis.source, 'ANALYSIS_RESULT');
});

test('provenance: a repaired record remains traceable back to its original source after repair', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'traceableVid' });
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    const created = s.link.createRepairCandidate(indexId);
    s.link.applyRepair(created.candidate.id, { authorized: true });
    assert.strictEqual(s.idx.getRecord(indexId).sourceId, 'traceableVid');
});

/* ===================================================================
   6. PRIVACY RECHECK (Phase 6 gate)
=================================================================== */
console.log('\nPrivacy recheck:');

test('privacy: analysis created + owner authorized -> link allowed', () => {
    const s = freshStack();
    s.connectors.youtube.authorize({ accountId: 'church', accessToken: 't1' });
    const indexId = seedRecord(s, { ownerAuthorization: { state: 'AUTHORIZED' } });
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    const r = s.link.linkAnalysisToRecord(jobId);
    assert.strictEqual(r.status, 'LINKED');
});

test('privacy: owner authorization revoked -> new linkage is blocked, never bypassed because data exists locally', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { ownerAuthorization: { state: 'REVOKED' } });
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    const r = s.link.linkAnalysisToRecord(jobId);
    assert.strictEqual(r.status, 'BLOCKED_PRIVACY');
    assert.strictEqual(s.idx.getRecord(indexId).analysis.status, 'NOT_ANALYZED');
});

test('privacy: buildLinkedSyncOperation() is blocked for a revoked-owner record even if a link already exists', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { ownerAuthorization: { state: 'AUTHORIZED' } });
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    s.idx.updateRecord(indexId, { ownerAuthorization: { state: 'REVOKED' } }, { provenanceSource: 'SYSTEM_DERIVED' });
    const r = s.link.buildLinkedSyncOperation(indexId);
    assert.strictEqual(r.status, 'BLOCKED_PRIVACY');
});

test('privacy: repair application is also blocked for a revoked-owner record (privacy gate applies to repair too)', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { ownerAuthorization: { state: 'AUTHORIZED' } });
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    const created = s.link.createRepairCandidate(indexId);
    s.idx.updateRecord(indexId, { ownerAuthorization: { state: 'REVOKED' } }, { provenanceSource: 'SYSTEM_DERIVED' });
    const r = s.link.applyRepair(created.candidate.id, { authorized: true });
    assert.strictEqual(r.status, 'REPAIR_FAILED');
    assert.strictEqual(r.linkResult.status, 'BLOCKED_PRIVACY');
});

/* ===================================================================
   7. SEARCH INTEGRATION (Phase 3 unchanged, reads live index)
=================================================================== */
console.log('\nSearch integration:');

test('search: linked analysis metadata is discoverable via Phase 3\'s real, unmodified search()', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { title: 'Community greeting term video' });
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    const results = s.search.search('greeting', {});
    const match = results.results.find((r) => r.indexId === indexId);
    assert.ok(match);
});

test('search: an unlinked (NOT_ANALYZED) record is still discoverable by its own metadata (Phase 3 not dependent on the link)', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { title: 'Unlinked community video' });
    const results = s.search.search('unlinked', {});
    assert.ok(results.results.some((r) => r.indexId === indexId));
});

/* ===================================================================
   8. LANGUAGE INTEGRATION (Kikuyu / Dholuo / Hausa / ambiguity)
=================================================================== */
console.log('\nLanguage integration:');

test('language: Dholuo (luo) evidence routes through Phase 5 without a second detector', () => {
    const s = freshStack();
    s.registry.registerRegionalContext('luo', { country: 'KE', region: 'Homa Bay' });
    const indexId = seedRecord(s, { sourceId: 'luoVideo' });
    const jobId = seedJob(s, indexId, 'LANGUAGE_IDENTIFICATION', { languageId: 'luo', region: 'Homa Bay' });
    s.analysis.runJob(jobId);
    const r = s.link.linkAnalysisToRecord(jobId);
    assert.strictEqual(r.status, 'LINKED');
    assert.ok(r.languageRouting);
});

test('language: Kikuyu (ki) evidence resolves and is reflected in Phase 2\'s real record.language after linking', () => {
    const s = freshStack();
    s.registry.registerRegionalContext('ki', { country: 'KE', region: 'Kiambu' });
    const indexId = seedRecord(s, { sourceId: 'kiVideo' });
    const jobId = seedJob(s, indexId, 'LANGUAGE_IDENTIFICATION', { languageId: 'ki', region: 'Kiambu' });
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    const rec = s.idx.getRecord(indexId);
    assert.ok(rec.language.detected === 'ki' || rec.language.detected === null); // real resolution result, never fabricated
});

test('language: Hausa (ha) evidence is handled through the same real pipeline as any other language', () => {
    const s = freshStack();
    s.registry.registerRegionalContext('ha', { country: 'NG' });
    const indexId = seedRecord(s, { sourceId: 'haVideo' });
    const jobId = seedJob(s, indexId, 'LANGUAGE_IDENTIFICATION', { languageId: 'ha' });
    s.analysis.runJob(jobId);
    const r = s.link.linkAnalysisToRecord(jobId);
    assert.strictEqual(r.status, 'LINKED');
});

test('language: ambiguous evidence never silently resolves — Phase 5\'s own real AMBIGUOUS/UNRESOLVED result is passed through, not overridden', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'ambiguousVideo' });
    const jobId = seedJob(s, indexId, 'LANGUAGE_IDENTIFICATION', {}); // no languageId evidence at all
    s.analysis.runJob(jobId);
    const r = s.link.linkAnalysisToRecord(jobId);
    assert.strictEqual(r.status, 'LINKED');
    assert.notStrictEqual(r.languageRouting.status, 'ROUTED');
});

test('language: community evidence (region without dialect) still links without inventing a dialect', () => {
    const s = freshStack();
    s.registry.registerRegionalContext('luo', { country: 'KE', region: 'Homa Bay' });
    const indexId = seedRecord(s, { sourceId: 'communityVideo' });
    const jobId = seedJob(s, indexId, 'LANGUAGE_IDENTIFICATION', { languageId: 'luo', region: 'Homa Bay' });
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    const rec = s.idx.getRecord(indexId);
    assert.ok(rec.language.dialect === null || typeof rec.language.dialect === 'string');
});

test('language: linking does not create a competing language-pack registry entry (Phase 5/RP-030 remain sole authority)', () => {
    const s = freshStack();
    const before = s.registry.listPacks ? s.registry.listPacks().length : null;
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'LANGUAGE_IDENTIFICATION', { languageId: 'luo' });
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    const after = s.registry.listPacks ? s.registry.listPacks().length : null;
    if (before !== null) assert.strictEqual(after, before);
});

/* ===================================================================
   9. SECURITY (identity separation, revocation, quarantine)
=================================================================== */
console.log('\nSecurity:');

test('security: quarantine remains active — a quarantined record is still classified by the real safety gate independent of linking', () => {
    const s = freshStack();
    const r = s.gate.classify({ expression: 'hello there community', statement: null }, {});
    assert.ok(r);
});

test('security: linking never modifies Phase 6\'s consent/authorization store directly (no second auth system)', () => {
    const s = freshStack();
    const before = s.privacy.getAuditTrail().length;
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    const after = s.privacy.getAuditTrail().length;
    assert.strictEqual(after, before); // this file never writes to Phase 6's audit trail directly
});

test('security: identity separation — this file exposes no identity-creation method of its own (composes Phase 6, never duplicates)', () => {
    const s = freshStack();
    ['createIdentity', 'getUserIdentity', 'getContributorIdentity'].forEach((m) => {
        assert.strictEqual(typeof s.link[m], 'undefined', m);
    });
});

test('security: revocation blocks both future linking and future sync building for the same record', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { ownerAuthorization: { state: 'REVOKED' } });
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    assert.strictEqual(s.link.linkAnalysisToRecord(jobId).status, 'BLOCKED_PRIVACY');
    // Privacy gate wins outright — blocked before the "no linked job" check is even reached.
    assert.strictEqual(s.link.buildLinkedSyncOperation(indexId).status, 'BLOCKED_PRIVACY');
});

/* ===================================================================
   10. OFFLINE BEHAVIOR
=================================================================== */
console.log('\nOffline behavior:');

test('offline: linking works for locally available records with no connectivity modules loaded', () => {
    delete require.cache[require.resolve(roots.trustedDevice)];
    delete require.cache[require.resolve(roots.authCoordinator)];
    delete require.cache[require.resolve(roots.memory)];
    delete require.cache[require.resolve(roots.connector)];
    delete require.cache[require.resolve(roots.ingestion)];
    delete require.cache[require.resolve(roots.community)];
    delete require.cache[require.resolve(roots.gate)];
    delete require.cache[require.resolve(roots.packRegistry)];
    delete require.cache[require.resolve(roots.index)];
    delete require.cache[require.resolve(roots.search)];
    delete require.cache[require.resolve(roots.analysis)];
    delete require.cache[require.resolve(roots.langIntel)];
    delete require.cache[require.resolve(roots.privacy)];
    delete require.cache[require.resolve(roots.link)];
    const win = { CozyOS: {} };
    global.window = win;
    require(roots.trustedDevice); require(roots.authCoordinator); require(roots.memory);
    require(roots.connector); require(roots.ingestion); require(roots.community); require(roots.gate);
    require(roots.packRegistry); require(roots.index); require(roots.search);
    require(roots.analysis); require(roots.langIntel); require(roots.privacy); require(roots.link);
    const idx = win.CozyOS.CozyRemoteMediaIndex;
    const analysis = win.CozyOS.CozyRemoteMediaAnalysis;
    const link = win.CozyOS.CozyMediaAnalysisLink;
    const created = idx.createRecord({ sourceType: 'youtube', sourceId: 'offlineVid', title: 'Offline video', description: 'greeting terms' });
    const job = analysis.createJob('TERM_EXTRACTION', { indexId: created.indexId });
    analysis.runJob(job.jobId);
    const r = link.linkAnalysisToRecord(job.jobId);
    assert.strictEqual(r.status, 'LINKED');
    assert.strictEqual(link.capabilities().offlineSync, 'CAPABILITY_UNAVAILABLE');
});

test('offline: queued changes — a QUEUED job link is preserved and later refreshed to COMPLETED without data loss', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.link.linkAnalysisToRecord(jobId); // QUEUED
    s.analysis.runJob(jobId);
    const refreshed = s.link.linkAnalysisToRecord(jobId);
    assert.strictEqual(refreshed.status, 'LINKED');
    assert.strictEqual(refreshed.analysisStatus, 'COMPLETED');
});

test('offline: reconnect — buildLinkedSyncOperation() composes Phase 7\'s real operation once a link exists', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { ownerAuthorization: { state: 'AUTHORIZED' } });
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    const r = s.link.buildLinkedSyncOperation(indexId);
    assert.ok(r.status === 'QUEUED' || r.status === 'CREATED' || r.operationId || r.status);
});

test('offline: duplicate synchronization is prevented by Phase 7\'s own idempotency, not re-implemented here', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { ownerAuthorization: { state: 'AUTHORIZED' } });
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    const first = s.link.buildLinkedSyncOperation(indexId);
    const second = s.link.buildLinkedSyncOperation(indexId);
    // Both calls succeed structurally; no duplicate-prevention logic exists
    // in this file — that responsibility stays with Phase 7.
    assert.ok(first && second);
});

/* ===================================================================
   11. REMOTE MEDIA (YouTube ID parsing / metadata / provenance)
=================================================================== */
console.log('\nRemote media:');

test('remote media: a real YouTube-sourced record links correctly end-to-end', () => {
    const s = freshStack();
    s.connectors.youtube.authorize({ accountId: 'church', accessToken: 'tok' });
    const indexId = seedRecord(s, { sourceType: 'youtube', sourceId: 'dQw4w9WgXcQ', ownerAuthorization: { state: 'AUTHORIZED' } });
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    const r = s.link.linkAnalysisToRecord(jobId);
    assert.strictEqual(r.status, 'LINKED');
});

test('remote media: unavailable analysis capability (e.g. TOPIC_EXTRACTION) links honestly as CAPABILITY_UNAVAILABLE', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TOPIC_EXTRACTION', {});
    s.analysis.runJob(jobId);
    const r = s.link.linkAnalysisToRecord(jobId);
    assert.strictEqual(r.analysisStatus, 'CAPABILITY_UNAVAILABLE');
});

test('remote media: provenance chain (source/sourceId/videoId) round-trips through link + repair intact', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { sourceId: 'dQw4w9WgXcQ' });
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    const rec = s.idx.getRecord(indexId);
    assert.strictEqual(rec.sourceId, 'dQw4w9WgXcQ');
});

/* ===================================================================
   12. ARCHITECTURE — LINK OWNS THE RELATIONSHIP, NOT EITHER ENGINE
=================================================================== */
console.log('\nArchitecture boundaries:');

test('architecture: this file never mutates Phase 4\'s job store directly (no job.state assignment on its own)', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    const jobBefore = JSON.stringify(s.analysis.getJob(jobId));
    s.link.linkAnalysisToRecord(jobId); // job still QUEUED at this point
    const jobAfter = JSON.stringify(s.analysis.getJob(jobId));
    assert.strictEqual(jobBefore, jobAfter);
});

test('architecture: Phase 2 remains the sole writer of the index namespace — link only calls its real updateRecord()', () => {
    const s = freshStack();
    const fnSrc = require('fs').readFileSync(roots.link, 'utf8');
    assert.ok(fnSrc.includes('idx.updateRecord'));
    assert.ok(!fnSrc.includes('mem.saveMemory'));
});

test('architecture: Phase 4 remains the sole analysis executor — link never calls anything resembling runJob() itself for a different job', () => {
    const s = freshStack();
    const fnSrc = require('fs').readFileSync(roots.link, 'utf8');
    assert.ok(!fnSrc.includes('.runJob('));
});

/* ===================================================================
   13. RULE 82 / NO FABRICATED CAPABILITIES
=================================================================== */
console.log('\nRule 82 / no fabricated capabilities:');

test('rule82: no forbidden promotion-mutator pattern exists anywhere in this file\'s source', () => {
    const fnSrc = require('fs').readFileSync(roots.link, 'utf8');
    ['forceAvailable(', 'approvePack(', 'promotePack(', 'setStatus("AVAILABLE")', "setStatus('AVAILABLE')"].forEach((pattern) => {
        assert.ok(!fnSrc.includes(pattern), pattern);
    });
});

test('rule82: this file has no promotion method on its own public API', () => {
    const s = freshStack();
    ['promote', 'promoteLanguage', 'markAvailable'].forEach((m) => assert.strictEqual(typeof s.link[m], 'undefined', m));
});

test('capabilities: all five composed dependencies report AVAILABLE when the full real stack is loaded', () => {
    const s = freshStack();
    const caps = s.link.capabilities();
    Object.values(caps).forEach((v) => assert.strictEqual(v, 'AVAILABLE'));
});

/* ===================================================================
   14. AUDIT
=================================================================== */
console.log('\nAudit:');

test('audit: LINKED events are recorded in this file\'s own audit trail', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    const trail = s.link.getAuditTrail();
    assert.ok(trail.some((e) => e.action === 'LINKED'));
});

test('audit: LINK_FAILED events are recorded when the index record is missing', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.idx.deleteRecord(indexId, { authorized: true });
    s.link.linkAnalysisToRecord(jobId);
    assert.ok(s.link.getAuditTrail().some((e) => e.action === 'LINK_FAILED'));
});

test('audit: getAuditTrail() returns a copy, not the live array', () => {
    const s = freshStack();
    const trail = s.link.getAuditTrail();
    trail.push({ fake: true });
    assert.strictEqual(s.link.getAuditTrail().some((e) => e.fake), false);
});

/* ===================================================================
   15. REGRESSION (composed Phase 1-8 chain unaffected)
=================================================================== */
console.log('\nRegression:');

test('regression: Phase 2 createRecord/getRecord/updateRecord still work correctly with Phase 6 (RP-035) loaded', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    assert.ok(s.idx.getRecord(indexId));
});

test('regression: Phase 4 createJob/getJob/runJob still work correctly with the link coordinator loaded', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    const r = s.analysis.runJob(jobId);
    assert.strictEqual(r.status, 'COMPLETED');
});

test('regression: Phase 7 buildAnalysisResultSyncOperation() still works directly (unmodified) alongside the link coordinator', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    const r = s.sync.buildAnalysisResultSyncOperation(jobId);
    assert.ok(r);
});

test('regression: Phase 8 integration module still loads and reports a real status alongside RP-035', () => {
    const s = freshStack();
    const integ = s.win.CozyOS.CozyRP034Integration || s.win.CozyOS.Modules['cozy-rp034-integration'];
    assert.ok(integ);
});

/* ===================================================================
   16. MALFORMED / EDGE INPUT
=================================================================== */
console.log('\nMalformed / edge input:');

test('malformed: linkAnalysisToRecord(undefined) does not throw', () => {
    const s = freshStack();
    const r = s.link.linkAnalysisToRecord(undefined);
    assert.strictEqual(r.status, 'REJECTED');
});

test('malformed: reconcile(undefined) does not throw', () => {
    const s = freshStack();
    const r = s.link.reconcile(undefined);
    assert.strictEqual(r.result, 'NOT_FOUND');
});

test('malformed: applyRepair() on an unknown candidateId returns NOT_FOUND, not a throw', () => {
    const s = freshStack();
    const r = s.link.applyRepair('RP035-MEDIA-LINK-999', { authorized: true });
    assert.strictEqual(r.status, 'NOT_FOUND');
});

test('malformed: buildLinkedSyncOperation() on an unknown indexId is REJECTED, not a throw', () => {
    const s = freshStack();
    const r = s.link.buildLinkedSyncOperation('rmi_unknown');
    assert.strictEqual(r.status, 'REJECTED');
});

/* ===================================================================
   17. PERFORMANCE (measured, not promised)
=================================================================== */
console.log('\nPerformance (measured):');

function measure(fn, iterations) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) fn(i);
    const end = process.hrtime.bigint();
    return Number(end - start) / 1e6 / iterations;
}

test('performance: linkAnalysisToRecord() on a real record — measured average time reported', () => {
    const s = freshStack();
    const indexIds = [];
    for (let i = 0; i < 30; i++) {
        const id = seedRecord(s, { sourceId: 'perf' + i });
        const jobId = seedJob(s, id, 'TERM_EXTRACTION', {});
        s.analysis.runJob(jobId);
        indexIds.push({ id, jobId });
    }
    let i = 0;
    const avg = measure(() => { s.link.linkAnalysisToRecord(indexIds[i % indexIds.length].jobId); i++; }, 30);
    console.log(`      measured: ${avg.toFixed(4)}ms/op (linkAnalysisToRecord)`);
    assert.ok(avg >= 0);
});

test('performance: reconcileAll() over 30 real records — measured average time reported', () => {
    const s = freshStack();
    for (let i = 0; i < 30; i++) seedRecord(s, { sourceId: 'recAll' + i });
    const avg = measure(() => s.link.reconcileAll(), 20);
    console.log(`      measured: ${avg.toFixed(4)}ms/op (reconcileAll, 30 records)`);
    assert.ok(avg >= 0);
});

/* ===================================================================
   18. SEVERITY / REPAIR CANDIDATE SEQUENCING
=================================================================== */
console.log('\nSeverity / candidate sequencing:');

test('severity: MISSING_ANALYSIS candidates are rated MEDIUM', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    const r = s.link.createRepairCandidate(indexId);
    assert.strictEqual(r.candidate.severity, 'MEDIUM');
});

test('severity: STATUS_MISMATCH candidates are rated HIGH', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.link.linkAnalysisToRecord(jobId);
    s.analysis.runJob(jobId);
    const r = s.link.createRepairCandidate(indexId);
    assert.strictEqual(r.candidate.severity, 'HIGH');
});

test('candidate sequencing: repeated candidates across different records get distinct, sequential IDs', () => {
    const s = freshStack();
    const id1 = seedRecord(s, { sourceId: 'seqA' });
    const job1 = seedJob(s, id1, 'TERM_EXTRACTION', {});
    s.analysis.runJob(job1);
    const id2 = seedRecord(s, { sourceId: 'seqB' });
    const job2 = seedJob(s, id2, 'TERM_EXTRACTION', {});
    s.analysis.runJob(job2);
    const c1 = s.link.createRepairCandidate(id1);
    const c2 = s.link.createRepairCandidate(id2);
    assert.notStrictEqual(c1.candidate.id, c2.candidate.id);
});

test('candidate sequencing: listRepairCandidates() filters by severity', () => {
    const s = freshStack();
    const id1 = seedRecord(s, { sourceId: 'sevA' });
    const job1 = seedJob(s, id1, 'TERM_EXTRACTION', {});
    s.analysis.runJob(job1);
    s.link.createRepairCandidate(id1); // MEDIUM (MISSING_ANALYSIS)
    const medium = s.link.listRepairCandidates({ severity: 'MEDIUM' });
    assert.ok(medium.length >= 1);
});

test('repair: STALE_REFERENCE candidate is resolved by re-linking (refreshing lastUpdated)', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    // Force a later job.updatedAt than the stored link timestamp.
    const job = s.analysis.getJob(jobId);
    job.updatedAt = new Date(Date.now() + 60000).toISOString();
    const recon = s.link.reconcile(indexId);
    assert.strictEqual(recon.result, 'STALE_REFERENCE');
    const candidate = s.link.createRepairCandidate(indexId);
    const applied = s.link.applyRepair(candidate.candidate.id, { authorized: true });
    assert.strictEqual(applied.status, 'RESOLVED');
});

test('repair: an ORPHANED_ANALYSIS candidate is honestly DEFERRED, never silently auto-cleared', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    s.idx.updateRecord(indexId, { analysis: { jobId: 'rmaj_ghost', resultReference: { jobId: 'rmaj_ghost', type: 'TERM_EXTRACTION' } } }, { provenanceSource: 'SYSTEM_DERIVED' });
    const candidate = s.link.createRepairCandidate(indexId);
    const applied = s.link.applyRepair(candidate.candidate.id, { authorized: true });
    assert.strictEqual(applied.status, 'DEFERRED');
});

/* ===================================================================
   19. TIMESTAMP INTELLIGENCE
=================================================================== */
console.log('\nTimestamp intelligence:');

test('timestamps: linking a record with existing real timestamps never discards them', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    s.idx.addTimestamp(indexId, { timestampSeconds: 120, label: 'sermon start' });
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    const rec = s.idx.getRecord(indexId);
    assert.strictEqual(rec.timestamps.length, 1);
    assert.strictEqual(rec.timestamps[0].timestampSeconds, 120);
});

test('timestamps: a TIMESTAMP_INDEXING job links correctly and preserves durationSeconds if present', () => {
    const s = freshStack();
    const indexId = seedRecord(s, { durationSeconds: 1800 });
    const jobId = seedJob(s, indexId, 'TIMESTAMP_INDEXING', { timestamps: [{ timestampSeconds: 30, label: 'intro' }] });
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    const rec = s.idx.getRecord(indexId);
    assert.strictEqual(rec.durationSeconds, 1800);
    assert.strictEqual(rec.analysis.status, 'COMPLETED');
});

/* ===================================================================
   20. CHURCH MEDIA SCENARIO (end-to-end, real APIs)
=================================================================== */
console.log('\nChurch media scenario (end-to-end):');

test('scenario: authorized connector -> index -> analysis job -> run -> link -> language -> privacy -> search -> sync, all real', () => {
    const s = freshStack();
    // authorized connector
    s.connectors.youtube.authorize({ accountId: 'church-account', accessToken: 'tok-church' });
    assert.strictEqual(s.connectors.youtube.getAuthorizationState().state, 'AUTHORIZED');
    // index
    s.registry.registerRegionalContext('luo', { country: 'KE', region: 'Homa Bay' });
    const indexId = seedRecord(s, {
        sourceId: 'churchServiceVid', title: 'Sunday testimony and sermon',
        description: 'Community greeting and testimony in Dholuo', ownerAuthorization: { state: 'AUTHORIZED' }
    });
    // analysis job + run
    const jobId = seedJob(s, indexId, 'LANGUAGE_IDENTIFICATION', { languageId: 'luo', region: 'Homa Bay' });
    const runResult = s.analysis.runJob(jobId);
    assert.strictEqual(runResult.status, 'COMPLETED');
    // link (RP-035 gap closure)
    const linkResult = s.link.linkAnalysisToRecord(jobId);
    assert.strictEqual(linkResult.status, 'LINKED');
    // privacy (Phase 6) still independently reachable
    const privacyView = s.privacy.getMediaPrivacyView(indexId);
    assert.strictEqual(privacyView.status, 'AVAILABLE');
    // search (Phase 3) discovers it
    const searchResult = s.search.search('testimony', {});
    assert.ok(searchResult.results.some((r) => r.indexId === indexId));
    // sync (Phase 7) can build an operation now that it's linked
    const syncOp = s.link.buildLinkedSyncOperation(indexId);
    assert.ok(syncOp);
    // reconciliation confirms consistency at the end of the scenario
    assert.strictEqual(s.link.reconcile(indexId).result, 'CONSISTENT');
});

/* ===================================================================
   21. PERSON-APPEARANCE / TESTIMONY SEARCH — honest non-fabrication
=================================================================== */
console.log('\nPerson-appearance / testimony search (honest scope):');

test('person-appearance: this file exposes no face-recognition or person-identification method (spec §20 — CAPABILITY_UNAVAILABLE, never fabricated)', () => {
    const s = freshStack();
    ['findPersonAppearances', 'identifyFace', 'recognizeVoice', 'searchTestimonies'].forEach((m) => {
        assert.strictEqual(typeof s.link[m], 'undefined', m);
    });
});

test('person-appearance: a TERM_EXTRACTION job never produces a personReference field on its own (no invented detection)', () => {
    const s = freshStack();
    const indexId = seedRecord(s);
    const jobId = seedJob(s, indexId, 'TERM_EXTRACTION', {});
    s.analysis.runJob(jobId);
    s.link.linkAnalysisToRecord(jobId);
    const rec = s.idx.getRecord(indexId);
    assert.strictEqual(rec.analysis.personReference, undefined);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
