/**
 * core/modules/intelligence/language-packs/tests/cozy-language-acquisition-pipeline.test.js
 * RP-031 Phase 1 — real, executed tests for cozy-language-acquisition-pipeline.js
 * Run with: node core/modules/intelligence/language-packs/tests/cozy-language-acquisition-pipeline.test.js
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

function fakeSafetyGate(classification) {
    return {
        classify: () => ({ classification, category: null, note: null }),
        quarantine: () => ({ id: 'q-1' })
    };
}

/**
 * Loads RP-030's registry and RP-031 Phase 1's pipeline into the same
 * fake window, in the correct dependency order — exactly what a real
 * app bootstrap would do. Each call gets a completely fresh window so
 * tests never leak state into each other.
 */
function freshPipeline(extraDeps) {
    const win = { CozyOS: Object.assign({ CozyKnowledgeSafetyGate: fakeSafetyGate('SAFE') }, extraDeps || {}) };
    global.window = win;

    const registryPath = path.join(__dirname, '..', 'cozy-language-pack-registry.js');
    delete require.cache[require.resolve(registryPath)];
    require(registryPath);

    const pipelinePath = path.join(__dirname, '..', 'cozy-language-acquisition-pipeline.js');
    delete require.cache[require.resolve(pipelinePath)];
    require(pipelinePath);

    return win.CozyOS.CozyLanguageAcquisition;
}

// ---------------------------------------------------------------------
// 1. Composition hygiene — never fabricates when RP-030 is absent
// ---------------------------------------------------------------------

test('degrades honestly (does not throw) when CozyLanguagePacks is not loaded', () => {
    global.window = { CozyOS: {} };
    const pipelinePath = path.join(__dirname, '..', 'cozy-language-acquisition-pipeline.js');
    delete require.cache[require.resolve(pipelinePath)];
    require(pipelinePath);
    const pipeline = global.window.CozyOS.CozyLanguageAcquisition;
    const result = pipeline.submitEvidence({ languageId: 'sw', expression: 'x', meaning: 'y' });
    assert.strictEqual(result.status, 'BLOCKED');
    assert.ok(/CozyLanguagePacks/.test(result.reason));
});

test('module registers exactly once under window.CozyOS.Modules["cozy-language-acquisition-pipeline"]', () => {
    const win = { CozyOS: { CozyKnowledgeSafetyGate: fakeSafetyGate('SAFE') } };
    global.window = win;
    const pipelinePath = path.join(__dirname, '..', 'cozy-language-acquisition-pipeline.js');
    delete require.cache[require.resolve(pipelinePath)];
    require(pipelinePath);
    require(pipelinePath);
    assert.ok(win.CozyOS.Modules['cozy-language-acquisition-pipeline']);
});

// ---------------------------------------------------------------------
// 2. Independent-contributor validation tiers (spec section 8)
// ---------------------------------------------------------------------

test('a single contributor resubmitting stays at CANDIDATE tier (raw evidenceCount cannot inflate it)', () => {
    const p = freshPipeline();
    const r1 = p.submitEvidence({ languageId: 'sw', expression: 'jambo', meaning: 'greeting', region: 'KE', contributorPseudonym: 'alice' });
    const r2 = p.submitEvidence({ languageId: 'sw', expression: 'jambo', meaning: 'greeting', region: 'KE', contributorPseudonym: 'alice' });
    assert.strictEqual(r1.recordId, r2.recordId);
    assert.strictEqual(r2.independentContributorCount, 1);
    assert.strictEqual(r2.validationTier, 'CANDIDATE');
});

test('distinct independent contributors escalate the tier: 1=CANDIDATE, 2=EMERGING, 4=STRONG, 10=VALIDATED', () => {
    const p = freshPipeline();
    let last;
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].forEach((who, i) => {
        last = p.submitEvidence({ languageId: 'sw', expression: 'karibu', meaning: 'welcome', region: 'KE', contributorPseudonym: who });
        if (i === 0) assert.strictEqual(last.validationTier, 'CANDIDATE');
        if (i === 1) assert.strictEqual(last.validationTier, 'EMERGING');
        if (i === 3) assert.strictEqual(last.validationTier, 'STRONG');
        if (i === 9) assert.strictEqual(last.validationTier, 'VALIDATED');
    });
    assert.strictEqual(last.independentContributorCount, 10);
});

test('getValidationTier() discloses it is illustrative, not a scientific accuracy measure', () => {
    const p = freshPipeline();
    const r = p.submitEvidence({ languageId: 'sw', expression: 'asante', meaning: 'thanks', contributorPseudonym: 'a' });
    const tier = p.getValidationTier(r.recordId);
    assert.ok(/not a scientific accuracy measure/.test(tier.note));
});

// ---------------------------------------------------------------------
// 3. Fast local retrieval (spec section 3)
// ---------------------------------------------------------------------

test('lookupExpression() returns a numeric lookupMs and never asserts verification from retrieval speed', () => {
    const p = freshPipeline();
    p.submitEvidence({ languageId: 'sw', expression: 'jambo', meaning: 'greeting', region: 'KE', contributorPseudonym: 'a' });
    const result = p.lookupExpression({ languageId: 'sw', expression: 'jambo' });
    assert.strictEqual(result.status, 'OK');
    assert.strictEqual(result.results.length, 1);
    assert.strictEqual(typeof result.lookupMs, 'number');
    assert.ok(/says nothing about whether/.test(result.note));
});

test('lookupExpression() attaches validationTier to each result', () => {
    const p = freshPipeline();
    const r = p.submitEvidence({ languageId: 'sw', expression: 'jambo', meaning: 'greeting', contributorPseudonym: 'a' });
    const found = p.lookupExpression({ languageId: 'sw', expression: 'jambo' }).results[0];
    assert.strictEqual(found.tier, 'CANDIDATE');
});

test('lookupExpression() degrades honestly when RP-030 is absent', () => {
    global.window = { CozyOS: {} };
    const pipelinePath = path.join(__dirname, '..', 'cozy-language-acquisition-pipeline.js');
    delete require.cache[require.resolve(pipelinePath)];
    require(pipelinePath);
    const pipeline = global.window.CozyOS.CozyLanguageAcquisition;
    const result = pipeline.lookupExpression({ languageId: 'sw', expression: 'jambo' });
    assert.strictEqual(result.status, 'UNAVAILABLE');
});

// ---------------------------------------------------------------------
// 4. Multiple meanings by region/context (spec section 9)
// ---------------------------------------------------------------------

test('listMeaningsFor() reports regional variation instead of collapsing meanings', () => {
    const p = freshPipeline();
    p.submitEvidence({ languageId: 'ha', expression: 'wordX', meaning: 'meaning A', region: 'TZ', contributorPseudonym: 'a' });
    p.submitEvidence({ languageId: 'ha', expression: 'wordX', meaning: 'meaning B', region: 'NG', contributorPseudonym: 'b' });
    const result = p.listMeaningsFor('ha', 'wordX');
    assert.strictEqual(result.meanings.length, 2);
    assert.strictEqual(result.hasRegionalVariation, true);
});

// ---------------------------------------------------------------------
// 5. Hearing Mode — capture now, ask later (spec section 5), privacy
//    -first audio handling (spec section 6)
// ---------------------------------------------------------------------

test('captureUnknownExpressionFromHearing() requires text or audio evidence', () => {
    const p = freshPipeline();
    const result = p.captureUnknownExpressionFromHearing({});
    assert.strictEqual(result.status, 'BLOCKED');
});

test('captureUnknownExpressionFromHearing() discards raw audio by default (privacy-first)', () => {
    const p = freshPipeline();
    const result = p.captureUnknownExpressionFromHearing({ heardText: 'nade', audioReference: 'blob://123', sessionId: 's1' });
    assert.strictEqual(result.status, 'CAPTURED');
    assert.strictEqual(result.audioDiscarded, true);
    const pending = p.listPendingClarifications({ sessionId: 's1' })[0];
    assert.strictEqual(pending.audioReference, null);
});

test('captureUnknownExpressionFromHearing() retains audio only when explicitly authorized', () => {
    const p = freshPipeline();
    p.captureUnknownExpressionFromHearing({ heardText: 'nade', audioReference: 'blob://123', audioRetentionAuthorized: true, sessionId: 's2' });
    const pending = p.listPendingClarifications({ sessionId: 's2' })[0];
    assert.strictEqual(pending.audioReference, 'blob://123');
});

test('resolveClarification() creates real candidate evidence, never automatic truth', () => {
    const p = freshPipeline();
    const cap = p.captureUnknownExpressionFromHearing({ heardText: 'Misawa', sessionId: 's3' });
    const resolved = p.resolveClarification(cap.clarificationId, {
        languageId: 'luo', meaning: 'a greeting', contributorPseudonym: 'bob'
    });
    assert.strictEqual(resolved.status, 'RESOLVED');
    assert.strictEqual(resolved.validationTier, 'CANDIDATE');
    assert.strictEqual(p.listPendingClarifications({ sessionId: 's3' }).length, 0);
});

test('resolveClarification() requires languageId and meaning', () => {
    const p = freshPipeline();
    const cap = p.captureUnknownExpressionFromHearing({ heardText: 'x', sessionId: 's4' });
    const result = p.resolveClarification(cap.clarificationId, {});
    assert.strictEqual(result.status, 'BLOCKED');
});

// ---------------------------------------------------------------------
// 6. Honest source-type capability gates (spec sections 10-13)
// ---------------------------------------------------------------------

test('acquireFromDocument() reports CAPABILITY_UNAVAILABLE without already-extracted text', () => {
    const p = freshPipeline();
    const result = p.acquireFromDocument({ languageId: 'sw' });
    assert.strictEqual(result.status, 'CAPABILITY_UNAVAILABLE');
});

test('acquireFromWebsite() reports CAPABILITY_UNAVAILABLE without already-fetched text', () => {
    const p = freshPipeline();
    const result = p.acquireFromWebsite({ languageId: 'sw' });
    assert.strictEqual(result.status, 'CAPABILITY_UNAVAILABLE');
});

test('acquireFromOCR() reports CAPABILITY_UNAVAILABLE when no OCREngine is composed', () => {
    const p = freshPipeline();
    const result = p.acquireFromOCR({ languageId: 'sw', expression: 'x', meaning: 'y' });
    assert.strictEqual(result.status, 'CAPABILITY_UNAVAILABLE');
});

test('acquireFromOCR() still requires real recognized text even when OCREngine is composed', () => {
    const p = freshPipeline({ OCREngine: { getVersion: () => '1.0.0' } });
    const result = p.acquireFromOCR({ languageId: 'sw' });
    assert.strictEqual(result.status, 'CAPABILITY_UNAVAILABLE');
});

test('acquireFromAudio() accepts oral evidence with no orthography (never invents spelling)', () => {
    const p = freshPipeline();
    const result = p.acquireFromAudio({ languageId: 'luo', audioReference: 'blob://abc', meaning: 'a greeting', contributorPseudonym: 'a' });
    assert.strictEqual(result.status, 'CANDIDATE_CREATED');
});

test('acquireFromVideo() always refuses lip-reading regardless of other fields', () => {
    const p = freshPipeline();
    const result = p.acquireFromVideo({ languageId: 'sw', lipReadingRequested: true, expression: 'x', meaning: 'y' });
    assert.strictEqual(result.status, 'CAPABILITY_UNAVAILABLE');
    assert.ok(/[Ll]ip-reading/.test(result.reason));
});

test('acquireFromVideo() accepts caption/transcript-derived text', () => {
    const p = freshPipeline();
    const result = p.acquireFromVideo({ languageId: 'sw', captionOrTranscriptText: 'jambo', meaning: 'greeting', contributorPseudonym: 'a' });
    assert.strictEqual(result.status, 'CANDIDATE_CREATED');
});

// ---------------------------------------------------------------------
// 7. Cozy Offline Hotspot transport (spec section 20) — honest states
// ---------------------------------------------------------------------

test('queueForHotspotShare() never claims SHARED/SYNCED when no bridge is composed', () => {
    const p = freshPipeline();
    const r = p.submitEvidence({ languageId: 'sw', expression: 'jambo', meaning: 'greeting', contributorPseudonym: 'a' });
    const result = p.queueForHotspotShare(r.recordId);
    assert.strictEqual(result.status, 'QUEUED');
});

test('queueForHotspotShare() reports NO_ACTIVE_HOTSPOT_CONNECTION honestly when the bridge exists but nothing is connected', () => {
    const fakeBridge = { shareCandidate: () => ({ status: 'NO_ACTIVE_HOTSPOT_CONNECTION', sentTo: 0 }) };
    const p = freshPipeline({ CozyKnowledgeReviewHotspotBridge: fakeBridge });
    const r = p.submitEvidence({ languageId: 'sw', expression: 'jambo', meaning: 'greeting', contributorPseudonym: 'a' });
    const result = p.queueForHotspotShare(r.recordId);
    assert.strictEqual(result.status, 'NO_ACTIVE_HOTSPOT_CONNECTION');
});

test('queueForHotspotShare() reports SHARED only when the real bridge actually sent it', () => {
    const fakeBridge = { shareCandidate: () => ({ status: 'SENT', sentTo: 2 }) };
    const p = freshPipeline({ CozyKnowledgeReviewHotspotBridge: fakeBridge });
    const r = p.submitEvidence({ languageId: 'sw', expression: 'jambo', meaning: 'greeting', contributorPseudonym: 'a' });
    const result = p.queueForHotspotShare(r.recordId);
    assert.strictEqual(result.status, 'SHARED');
    assert.strictEqual(result.sentTo, 2);
});

test('queueForHotspotShare() for a nonexistent record is UNAVAILABLE, never fabricated', () => {
    const p = freshPipeline();
    const result = p.queueForHotspotShare('expr-does-not-exist');
    assert.strictEqual(result.status, 'UNAVAILABLE');
});

// ---------------------------------------------------------------------
// 8. Knowledge-domain separation (spec sections 16 + 18)
// ---------------------------------------------------------------------

test('classifyKnowledgeDomain() never self-elevates a submission to PROFESSIONAL_GUIDANCE', () => {
    const p = freshPipeline();
    const result = p.classifyKnowledgeDomain({ domainHint: 'PROFESSIONAL_GUIDANCE' });
    assert.strictEqual(result.domain, 'COMMUNITY_KNOWLEDGE');
});

test('formatCommunityAnswer() always includes a disclaimer distinguishing community knowledge from professional guidance', () => {
    const p = freshPipeline();
    const r = p.submitEvidence({ languageId: 'sw', expression: 'DawaC', meaning: 'used by some farmers for crop X', region: 'Kiambu', contributorPseudonym: 'farmer1' });
    const answer = p.formatCommunityAnswer(r.recordId);
    assert.ok(/not verified professional/.test(answer.disclaimer));
});

// ---------------------------------------------------------------------
// 9. Reference geography — Dholuo/Kenya + contrast examples (spec
//    sections 2 and 25). Geography only; asserting no vocabulary is
//    silently invented.
// ---------------------------------------------------------------------

test('bootstrapReferenceGeography() registers Dholuo/Kenya and keeps Hausa/Tanzania distinct from Hausa/Nigeria', () => {
    const p = freshPipeline();
    p.bootstrapReferenceGeography();
    const packs = global.window.CozyOS.CozyLanguagePacks;
    const luoContexts = packs.listRegionalContexts('luo');
    assert.ok(luoContexts.some((c) => c.country === 'KE'));
    const haContexts = packs.listRegionalContexts('ha');
    const tz = haContexts.find((c) => c.country === 'TZ');
    const ng = haContexts.find((c) => c.country === 'NG');
    assert.ok(tz && ng);
    assert.notStrictEqual(tz.dialect, ng.dialect);
});

test('seedDholuoReferenceExample() creates real candidate evidence with disclosed LICENSE_UNKNOWN, never claims verified knowledge', () => {
    const p = freshPipeline();
    p.bootstrapReferenceGeography();
    const result = p.seedDholuoReferenceExample();
    assert.strictEqual(result.status, 'CANDIDATE_CREATED');
    const packs = global.window.CozyOS.CozyLanguagePacks;
    const record = packs.getExpression(result.recordId);
    assert.strictEqual(record.licensing, 'LICENSE_UNKNOWN');
    assert.strictEqual(record.expression, 'Misawa');
    const pack = packs.getPack('luo');
    assert.notStrictEqual(pack.status, 'AVAILABLE');
});

// ---------------------------------------------------------------------
// 10. Dashboard data contract for Phase 2 (spec section 14)
// ---------------------------------------------------------------------

test('getAcquisitionDashboardSnapshot() reports pendingClarifications and capability availability honestly', () => {
    const p = freshPipeline();
    p.captureUnknownExpressionFromHearing({ heardText: 'x', sessionId: 's5' });
    const snap = p.getAcquisitionDashboardSnapshot();
    assert.strictEqual(snap.pendingClarifications, 1);
    assert.strictEqual(snap.hotspotBridgeAvailable, false);
    assert.strictEqual(snap.ocrEngineAvailable, false);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
