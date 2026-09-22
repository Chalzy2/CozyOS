'use strict';

/**
 * core/modules/learning/test/continuous-learning-fabric.test.js
 * COZYAI CONTINUOUS MULTIMODAL LEARNING — CML-6 Continuous Authorized
 * Observation & Repeated-Evidence Learning Fabric. Real, executed tests
 * for the 52 required scenarios (sections A-K), composing only real,
 * existing/newly-added engines via loadFullStackWithFabric().
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFullStackWithFabric, AUTHORIZED_CONSENT, UNAUTHORIZED_CONSENT } = require('./_test-helpers');

function verifyTenIndependentContributors(s, term, meaning, language) {
    let verifiedObservation = null;
    for (let i = 1; i <= 10; i++) {
        const obsResult = s.adapter.fromCommunityContribution({ term, meaning, candidateLanguage: language, actorId: `contributor_${i}`, consent: AUTHORIZED_CONSENT, context: {} });
        let obs = obsResult.observation;
        const cand = s.lifecycle.toCandidate(obs, { actorId: `contributor_${i}`, scope: 'COMMUNITY', contributorPseudonym: `contributor_${i}`, region: 'nairobi' });
        if (!cand.success) continue;
        obs = cand.observation;
        const val = s.lifecycle.toValidated(obs, { actorId: `contributor_${i}` });
        if (val.success) obs = val.observation;
        const ver = s.lifecycle.toVerified(obs, { actorId: `contributor_${i}` });
        if (ver.success) verifiedObservation = ver.observation;
    }
    return verifiedObservation;
}

// =====================================================================
// A. OBSERVATION
// =====================================================================

test('A1. text observation', () => {
    const s = loadFullStackWithFabric();
    const r = s.fabric.observeEvent({ kind: 'TEXT', text: 'habari', term: 'habari', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.success, true);
    assert.equal(r.observation.sourceType, 'TEXT');
});

test('A2. audio capability available', () => {
    const s = loadFullStackWithFabric();
    const r = s.fabric.observeEvent({ kind: 'AUDIO', transcriptResult: { transcript: 'karibu', confidence: 0.9, language: 'sw' }, term: 'karibu', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.success, true);
    assert.equal(r.observation.sourceType, 'AUDIO');
});

test('A3. audio capability unavailable (no real transcript supplied — honest gap, never fabricated)', () => {
    const s = loadFullStackWithFabric();
    const r = s.fabric.observeEvent({ kind: 'AUDIO', transcriptResult: null, candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.success, false);
    assert.equal(r.reason, 'CAPABILITY_UNAVAILABLE');
});

test('A4. video capability available (fromLiveMedia with real, already-derived visual+audio)', () => {
    const s = loadFullStackWithFabric();
    const r = s.fabric.observeEvent({ kind: 'LIVE_MEDIA', visual: { text: 'onscreen text', confidence: 0.8 }, audio: { transcript: 'spoken words', confidence: 0.7 }, candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.success, true);
    assert.equal(r.observation.sourceType, 'LIVE_MEDIA');
});

test('A5. video capability unavailable (no visual/audio derived data at all)', () => {
    const s = loadFullStackWithFabric();
    const r = s.fabric.observeEvent({ kind: 'LIVE_MEDIA', visual: null, audio: null, consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.success, false);
});

test('A6. OCR capability (available and unavailable, both honest)', () => {
    const s = loadFullStackWithFabric();
    const ok = s.fabric.observeEvent({ kind: 'OCR', ocrResult: { available: true, text: 'MCHANGO', confidence: 0.6 }, candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(ok.success, true);
    const unavailable = s.fabric.observeEvent({ kind: 'OCR', ocrResult: { available: false, reason: 'no camera' }, consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(unavailable.success, false);
    assert.equal(unavailable.reason, 'CAPABILITY_UNAVAILABLE');
});

test('A7. document capability (real extracted text required, honest gap otherwise)', () => {
    const s = loadFullStackWithFabric();
    const ok = s.fabric.observeEvent({ kind: 'DOCUMENT', extractedText: 'mchango wa kanisa ni muhimu', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(ok.success, true);
    const gap = s.fabric.observeEvent({ kind: 'DOCUMENT', extractedText: null, consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(gap.success, false);
    assert.equal(gap.reason, 'CAPABILITY_UNAVAILABLE');
});

test('A8. unsupported modality is honestly refused, never fabricated', () => {
    const s = loadFullStackWithFabric();
    const r = s.fabric.observeEvent({ kind: 'TELEPATHY', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.success, false);
    assert.match(r.reason, /Unknown observation kind/);
});

// =====================================================================
// B. REPETITION
// =====================================================================

test('B9. repeated same expression accumulates occurrences', () => {
    const s = loadFullStackWithFabric();
    s.fabric.observeEvent({ kind: 'TEXT', term: 'mchango', text: 'mchango', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    s.fabric.observeEvent({ kind: 'TEXT', term: 'mchango', text: 'mchango', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u2' });
    const profile = s.evidenceProfile.getProfile('mchango', 'sw');
    assert.equal(profile.occurrences.length, 2);
});

test('B10. same expression, different context is tracked as a distinct context', () => {
    const s = loadFullStackWithFabric();
    s.fabric.observeEvent({ kind: 'TEXT', term: 'mchango', text: 'mchango', candidateLanguage: 'sw', contextLabel: 'church', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    s.fabric.observeEvent({ kind: 'TEXT', term: 'mchango', text: 'mchango', candidateLanguage: 'sw', contextLabel: 'community meeting', consent: AUTHORIZED_CONSENT, actorId: 'u2' });
    const profile = s.evidenceProfile.getProfile('mchango', 'sw');
    assert.equal(profile.contexts.length, 2);
});

test('B11. same expression, different meaning is detected as a possible conflict, not silently merged', () => {
    const s = loadFullStackWithFabric();
    s.fabric.observeEvent({ kind: 'TEXT', term: 'bank', text: 'bank', meaning: 'financial institution', candidateLanguage: 'en', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    const r2 = s.fabric.observeEvent({ kind: 'TEXT', term: 'bank', text: 'bank', meaning: 'river bank', candidateLanguage: 'en', consent: AUTHORIZED_CONSENT, actorId: 'u2' });
    assert.equal(r2.profile.possibleConflict, true);
    assert.equal(r2.conflict.conflict.status, 'OPEN');
});

test('B12. same source repeated does not inflate independent-source count', () => {
    const s = loadFullStackWithFabric();
    s.fabric.observeEvent({ kind: 'TEXT', term: 'salama', text: 'salama', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    s.fabric.observeEvent({ kind: 'TEXT', term: 'salama', text: 'salama', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u2' });
    const profile = s.evidenceProfile.getProfile('salama', 'sw');
    assert.equal(profile.independentSourceTypes.length, 1); // both TEXT
});

test('B13. independent sources (different sourceType) are tracked separately', () => {
    const s = loadFullStackWithFabric();
    s.fabric.observeEvent({ kind: 'TEXT', term: 'imani', text: 'imani', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    s.fabric.observeEvent({ kind: 'DOCUMENT', term: 'imani', extractedText: 'imani', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u2' });
    const profile = s.evidenceProfile.getProfile('imani', 'sw');
    assert.equal(profile.independentSourceTypes.length, 2);
});

test('B14. independent contributors — a repeated contributor never double-counts', () => {
    const s = loadFullStackWithFabric();
    s.fabric.observeEvent({ kind: 'TEXT', term: 'amani', text: 'amani', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'sameUser' });
    s.fabric.observeEvent({ kind: 'TEXT', term: 'amani', text: 'amani variant', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'sameUser' });
    const profile = s.evidenceProfile.getProfile('amani', 'sw');
    assert.equal(profile.independentContributors.length, 1);
});

// =====================================================================
// C. LANGUAGE
// =====================================================================

test('C15. English observation works through the same fabric', () => {
    const s = loadFullStackWithFabric();
    const r = s.fabric.observeEvent({ kind: 'TEXT', term: 'water', text: 'water', candidateLanguage: 'en', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.success, true);
    assert.equal(r.observation.candidateLanguage, 'en');
});

test('C16. Kiswahili observation works through the same fabric', () => {
    const s = loadFullStackWithFabric();
    const r = s.fabric.observeEvent({ kind: 'TEXT', term: 'maji', text: 'maji', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.success, true);
    assert.equal(r.observation.candidateLanguage, 'sw');
});

test('C17. the SAME concept connects expressions across languages without a per-language engine', () => {
    const s = loadFullStackWithFabric();
    const rSw = s.fabric.observeEvent({ kind: 'TEXT', term: 'maji', text: 'maji', meaning: 'water', candidateLanguage: 'sw', conceptId: 'concept-water-c17', domain: 'general', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    const rEn = s.fabric.observeEvent({ kind: 'TEXT', term: 'water', text: 'water', meaning: 'water', candidateLanguage: 'en', conceptId: 'concept-water-c17', domain: 'general', relationshipType: 'TRANSLATION', consent: AUTHORIZED_CONSENT, actorId: 'u2' });
    assert.equal(rSw.correlation.success, true);
    assert.equal(rEn.correlation.success, true);
    const listed = s.conceptRegistry.listAttachments('concept-water-c17', { actorId: 'system' });
    assert.equal(listed.attachments.length, 2);
});

test('C17b. identical spelling, identical meaning, DIFFERENT language never strengthens the same attachment (language is part of the match key, not just the term)', () => {
    const s = loadFullStackWithFabric();
    // "pole" happens to be spelled the same in Kiswahili and English but
    // must never be treated as the same expression merely because the
    // string and even the supplied meaning gloss coincide.
    const r1 = s.fabric.observeEvent({ kind: 'TEXT', term: 'pole', text: 'pole', meaning: 'same-gloss-for-test', candidateLanguage: 'sw', conceptId: 'concept-c17b', domain: 'general', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    const r2 = s.fabric.observeEvent({ kind: 'TEXT', term: 'pole', text: 'pole', meaning: 'same-gloss-for-test', candidateLanguage: 'en', conceptId: 'concept-c17b', domain: 'general', consent: AUTHORIZED_CONSENT, actorId: 'u2' });
    assert.equal(r1.correlation.strengthened, false);
    assert.equal(r2.correlation.strengthened, false, 'a different language must never strengthen an existing attachment even when term and meaning happen to match');
    assert.notEqual(r1.correlation.attachment.attachmentId, r2.correlation.attachment.attachmentId);
});

test('C18. unknown/unspecified language is handled honestly, never guessed', () => {
    const s = loadFullStackWithFabric();
    const r = s.fabric.observeEvent({ kind: 'TEXT', term: 'xyzunknown', text: 'xyzunknown', candidateLanguage: null, consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.success, true);
    assert.equal(r.observation.candidateLanguage, null);
});

test('C19. language gap is recorded when a concept lacks verified coverage in a target language', () => {
    const s = loadFullStackWithFabric();
    s.conceptRegistry.getOrCreateConcept({ conceptId: 'concept-contribution-c19', domain: 'community-life', actorId: 'system' });
    const result = s.languageGapRegistry.checkConceptLanguageCoverage({ conceptId: 'concept-contribution-c19', targetLanguages: ['en', 'sw', 'luo'], actorId: 'system' });
    assert.equal(result.success, true);
    assert.equal(result.coverage.luo.verified, false);
    assert.ok(result.gapsCreated.some((g) => g.language === 'luo'));
});

test('C20. dialect/regional variant is preserved as a distinct attachment, never flattened into one artificial form', () => {
    const s = loadFullStackWithFabric();
    s.conceptRegistry.getOrCreateConcept({ conceptId: 'concept-greeting-c20', domain: 'general', actorId: 'system' });
    const a1 = s.conceptRegistry.attachObservation({ conceptId: 'concept-greeting-c20', language: 'sw', term: 'sasa', relationshipType: 'PRIMARY_TERM', evidenceIds: ['ev1'], meaning: 'greeting (urban/coastal)', actorId: 'system' });
    const a2 = s.conceptRegistry.attachObservation({ conceptId: 'concept-greeting-c20', language: 'sw', term: 'niaje', relationshipType: 'PRIMARY_TERM', evidenceIds: ['ev2'], meaning: 'greeting (Sheng variant)', actorId: 'system' });
    assert.notEqual(a1.attachment.attachmentId, a2.attachment.attachmentId);
});

// =====================================================================
// D. CORRECTION (reuses correction-learning.js — never reimplemented)
// =====================================================================

test('D21. spelling correction reuses the existing CorrectionLearning pipeline', () => {
    const s = loadFullStackWithFabric();
    const r = s.correctionLearning.recordCorrection({ targetRecordId: 'expr_d21', targetRecordType: 'EXPRESSION', originalValue: 'muhim', correctedValue: 'muhimu', correctionType: 'SPELLING', language: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.success, true);
});

test('D22. grammar correction', () => {
    const s = loadFullStackWithFabric();
    const r = s.correctionLearning.recordCorrection({ targetRecordId: 'expr_d22', targetRecordType: 'EXPRESSION', originalValue: 'she go', correctedValue: 'she goes', correctionType: 'GRAMMAR', language: 'en', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.correctionRecord.correctionType, 'GRAMMAR');
});

test('D23. meaning correction', () => {
    const s = loadFullStackWithFabric();
    const r = s.correctionLearning.recordCorrection({ targetRecordId: 'expr_d23', targetRecordType: 'EXPRESSION', originalValue: 'mchango means gift', correctedValue: 'mchango means contribution', correctionType: 'MEANING', language: 'en', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.correctionRecord.correctionType, 'MEANING');
});

test('D24. conflicting corrections for the same target remain separate', () => {
    const s = loadFullStackWithFabric();
    const first = s.correctionLearning.recordCorrection({ targetRecordId: 'expr_d24', targetRecordType: 'EXPRESSION', originalValue: 'x', correctedValue: 'y', correctionType: 'MEANING', language: 'en', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    const second = s.correctionLearning.recordCorrection({ targetRecordId: 'expr_d24', targetRecordType: 'EXPRESSION', originalValue: 'x', correctedValue: 'z', correctionType: 'MEANING', language: 'en', consent: AUTHORIZED_CONSENT, actorId: 'u2' });
    assert.notEqual(first.correctionRecord.id, second.correctionRecord.id);
    assert.equal(s.correctionLearning.listCorrectionsFor('expr_d24').length, 2);
});

test('D25. original is never overwritten by a correction', () => {
    const s = loadFullStackWithFabric();
    const r = s.correctionLearning.recordCorrection({ targetRecordId: 'expr_d25', targetRecordType: 'EXPRESSION', originalValue: 'muhim', correctedValue: 'muhimu', correctionType: 'SPELLING', language: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    s.correctionLearning.confirmCorrection(r.correctionRecord.id, { reviewerId: 'reviewer_1' });
    const after = s.knowledgeModel.getCorrection(r.correctionRecord.id);
    assert.equal(after.originalValue, 'muhim');
});

// =====================================================================
// E. CONCEPTS
// =====================================================================

test('E26. concept match — two observations correlate onto the same concept', () => {
    const s = loadFullStackWithFabric();
    const r1 = s.fabric.observeEvent({ kind: 'TEXT', term: 'mchango', text: 'mchango', meaning: 'a contribution', candidateLanguage: 'sw', conceptId: 'concept-e26', domain: 'community-life', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    const r2 = s.fabric.observeEvent({ kind: 'TEXT', term: 'mchango', text: 'mchango', meaning: 'a contribution', candidateLanguage: 'sw', conceptId: 'concept-e26', domain: 'community-life', consent: AUTHORIZED_CONSENT, actorId: 'u2' });
    assert.equal(r1.correlation.strengthened, false);
    assert.equal(r2.correlation.strengthened, true);
});

test('E27. same spelling, different meaning produces distinct attachments under concept matching, never merged', () => {
    const s = loadFullStackWithFabric();
    const r1 = s.fabric.observeEvent({ kind: 'TEXT', term: 'kanisa', text: 'kanisa', meaning: 'church building', candidateLanguage: 'sw', conceptId: 'concept-e27', domain: 'general', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    const r2 = s.fabric.observeEvent({ kind: 'TEXT', term: 'kanisa', text: 'kanisa', meaning: 'congregation', candidateLanguage: 'sw', conceptId: 'concept-e27', domain: 'general', consent: AUTHORIZED_CONSENT, actorId: 'u2' });
    assert.notEqual(r1.correlation.attachment.attachmentId, r2.correlation.attachment.attachmentId);
});

test('E28. related expression attaches with RELATED_CONTEXT, distinct from PRIMARY_TERM', () => {
    const s = loadFullStackWithFabric();
    const primary = s.fabric.observeEvent({ kind: 'TEXT', term: 'mchango', text: 'mchango', meaning: 'a contribution', candidateLanguage: 'sw', conceptId: 'concept-e28', domain: 'community-life', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    const related = s.fabric.observeEvent({ kind: 'TEXT', term: 'kutoa mchango', text: 'kutoa mchango', meaning: 'to give a contribution', candidateLanguage: 'sw', conceptId: 'concept-e28', domain: 'community-life', relationshipType: 'RELATED_CONTEXT', consent: AUTHORIZED_CONSENT, actorId: 'u2' });
    assert.equal(primary.correlation.attachment.relationshipType, 'PRIMARY_TERM');
    assert.equal(related.correlation.attachment.relationshipType, 'RELATED_CONTEXT');
});

test('E29. an unknown concept (no existing attachment) triggers gap discovery once evidence repeats', () => {
    const s = loadFullStackWithFabric();
    for (let i = 1; i <= 3; i++) {
        s.fabric.observeEvent({ kind: 'TEXT', term: 'ushirikiano', text: 'ushirikiano', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: `u${i}` });
    }
    const gaps = s.learningGapDiscovery.listOpenGaps({ actorId: 'system' });
    assert.ok(gaps.some((g) => g.type === 'UNKNOWN_WORD_REPEATED' && g.term === 'ushirikiano'));
});

test('E30. entity distinction — identical spelling across unrelated domains is never auto-merged into one concept', () => {
    const s = loadFullStackWithFabric();
    const financial = s.fabric.observeEvent({ kind: 'TEXT', term: 'bank', text: 'bank', meaning: 'financial institution', candidateLanguage: 'en', conceptId: 'concept-bank-financial', domain: 'finance', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    const river = s.fabric.observeEvent({ kind: 'TEXT', term: 'bank', text: 'bank', meaning: 'river bank', candidateLanguage: 'en', conceptId: 'concept-bank-river', domain: 'geography', consent: AUTHORIZED_CONSENT, actorId: 'u2' });
    assert.notEqual(financial.correlation.attachment.conceptId, river.correlation.attachment.conceptId);
});

// =====================================================================
// F. GOVERNANCE
// =====================================================================

test('F31. a candidate is not itself verified', () => {
    const s = loadFullStackWithFabric();
    const r = s.fabric.observeEvent({ kind: 'COMMUNITY_CONTRIBUTION', term: 'utu', meaning: 'humanity/dignity', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    const cand = s.fabric.advanceToCandidate(r.observation, { actorId: 'u1', scope: 'COMMUNITY', contributorPseudonym: 'u1', region: 'nairobi' });
    assert.equal(cand.success, true);
    assert.equal(cand.observation.lifecycleStatus, 'CANDIDATE');
    assert.notEqual(cand.observation.lifecycleStatus, 'VERIFIED');
});

test('F32. verified promotion follows the existing real authority (10 independent contributors)', () => {
    const s = loadFullStackWithFabric();
    const verified = verifyTenIndependentContributors(s, 'haki', 'justice/rights', 'sw');
    assert.ok(verified, 'ten independent contributors must reach a real VERIFIED observation');
    assert.equal(verified.lifecycleStatus, 'VERIFIED');
});

test('F32b. VALIDATED lifecycle status (tier STRONG, 5 contributors) is NOT itself enough to reach VERIFIED — the real ceiling is re-checked fresh, never trusted from a stale toValidated() pass', () => {
    const s = loadFullStackWithFabric();
    const term = 'kiapo';
    let obs = null;
    for (let i = 1; i <= 5; i++) {
        const built = s.adapter.fromCommunityContribution({ term, meaning: 'oath/pledge', candidateLanguage: 'sw', actorId: `contribF32b_${i}`, consent: AUTHORIZED_CONSENT, context: {} });
        if (i === 1) {
            const cand = s.lifecycle.toCandidate(built.observation, { actorId: `contribF32b_${i}`, scope: 'COMMUNITY', contributorPseudonym: `contribF32b_${i}`, region: 'nairobi' });
            obs = cand.observation;
        } else {
            s.acquisition.submitEvidence({ languageId: 'sw', expression: term, meaning: 'oath/pledge', region: 'nairobi', dialect: null, sourceType: 'COMMUNITY', contributionType: 'TEXT', contributorPseudonym: `contribF32b_${i}` });
        }
    }
    const tier = s.acquisition.getValidationTier(obs.governanceRef.recordId);
    assert.equal(tier.tier, 'STRONG', 'this test requires exactly the STRONG band (4-9 contributors) to isolate the VALIDATED-vs-VERIFIED gap');
    const validated = s.lifecycle.toValidated(obs, { actorId: 'contribF32b_1' });
    assert.equal(validated.success, true, 'STRONG tier is real, sufficient evidence for VALIDATED lifecycle status');
    const verified = s.lifecycle.toVerified(validated.observation, { actorId: 'contribF32b_1' });
    assert.equal(verified.success, false, 'STRONG (not the true VALIDATED ceiling) must never be accepted by toVerified()');
});

test('F33. rejected evidence stays rejected (terminal)', () => {
    const s = loadFullStackWithFabric();
    const r = s.fabric.observeEvent({ kind: 'COMMUNITY_CONTRIBUTION', term: 'badword', meaning: 'x', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    const cand = s.fabric.advanceToCandidate(r.observation, { actorId: 'u1', scope: 'COMMUNITY', contributorPseudonym: 'u1', region: 'nairobi' });
    const rejected = s.lifecycle.toRejected(cand.observation, { actorId: 'u1', reason: 'not real evidence' });
    assert.equal(rejected.observation.lifecycleStatus, 'REJECTED');
    const secondReject = s.lifecycle.toRejected(rejected.observation, { actorId: 'u1', reason: 'again' });
    assert.equal(secondReject.success, false, 'an already-terminal observation cannot be re-transitioned');
});

test('F34. disputed evidence (an open conflict) remains disputed until an explicit resolution', () => {
    const s = loadFullStackWithFabric();
    s.fabric.observeEvent({ kind: 'TEXT', term: 'pole', text: 'pole', meaning: 'sorry', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    s.fabric.observeEvent({ kind: 'TEXT', term: 'pole', text: 'pole', meaning: 'slowly', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u2' });
    const conflict = s.conflictDetection.getConflict('pole', 'sw');
    assert.equal(conflict.status, 'OPEN');
});

// =====================================================================
// G. PRIVACY
// =====================================================================

test('G35. an unauthorized observation (no/false consent) is rejected, fail-closed', () => {
    const s = loadFullStackWithFabric();
    const noConsent = s.fabric.observeEvent({ kind: 'TEXT', term: 'x', text: 'x', actorId: 'u1' });
    assert.equal(noConsent.success, false);
    const falseConsent = s.fabric.observeEvent({ kind: 'TEXT', term: 'x', text: 'x', consent: UNAUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(falseConsent.success, false);
});

test('G36. private-scope evidence remains private (learningScope never auto-elevated)', () => {
    const s = loadFullStackWithFabric();
    const r = s.fabric.observeEvent({ kind: 'TEXT', term: 'privatething', text: 'privatething', candidateLanguage: 'en', learningScope: 'PERSONAL', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.observation.learningScope, 'PERSONAL');
});

test('G37. raw media is not retained by default — the observation contract structurally forbids it', () => {
    const s = loadFullStackWithFabric();
    const bad = s.observationContract.validate({
        schemaVersion: s.observationContract.SCHEMA_VERSION, observationId: 'obs_g37', sourceType: 'AUDIO', modality: 'AUDIO',
        provenance: { sessionId: 's1', application: 'x' }, timestamps: { observedAt: 1, ingestedAt: 1 },
        contentRef: { derivedText: 'hello', mediaRetentionPolicy: 'NOT_RETAINED', rawAudio: 'base64...' },
        consent: AUTHORIZED_CONSENT, learningScope: 'PERSONAL', lifecycleStatus: 'OBSERVED',
    });
    assert.equal(bad.valid, false);
    const r = s.fabric.observeEvent({ kind: 'AUDIO', transcriptResult: { transcript: 'hello', confidence: 0.9 }, consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.observation.contentRef.mediaRetentionPolicy, 'NOT_RETAINED');
});

test('G38. organization/community evidence cannot become global merely by being observed', () => {
    const s = loadFullStackWithFabric();
    const r = s.fabric.observeEvent({ kind: 'COMMUNITY_CONTRIBUTION', term: 'orgfact', meaning: 'x', candidateLanguage: 'en', learningScope: 'COMMUNITY_CANDIDATE', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.observation.lifecycleStatus, 'OBSERVED');
    assert.notEqual(r.observation.learningScope, 'VERIFIED_GLOBAL');
    // A client cannot smuggle VERIFIED_GLOBAL as a claim either — the
    // contract accepts the string (a REQUESTED label only), but nothing
    // in the composed pipeline reads it as a grant: only
    // ObservationLifecycle's own real governance can change
    // lifecycleStatus, and it never even inspects learningScope to do so.
    const claimed = s.fabric.observeEvent({ kind: 'COMMUNITY_CONTRIBUTION', term: 'orgfact2', meaning: 'x', candidateLanguage: 'en', learningScope: 'VERIFIED_GLOBAL', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(claimed.observation.lifecycleStatus, 'OBSERVED', 'a client-claimed scope must never itself grant VERIFIED lifecycle status');
});

// =====================================================================
// H. ACTIVE LEARNING
// =====================================================================

test('H39. meaningful ambiguity (real conflict + independent contributors) produces a candidate question', () => {
    const s = loadFullStackWithFabric();
    s.fabric.observeEvent({ kind: 'TEXT', term: 'kanisa', text: 'kanisa', meaning: 'church building', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    const r2 = s.fabric.observeEvent({ kind: 'TEXT', term: 'kanisa', text: 'kanisa', meaning: 'congregation', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u2', enableActiveLearning: true, utilityThreshold: 2 });
    assert.ok(r2.activeLearningQuestion);
    assert.deepEqual(r2.activeLearningQuestion.options.sort(), ['church building', 'congregation'].sort());
});

test('H40. trivial ambiguity does not interrupt the user', () => {
    const s = loadFullStackWithFabric();
    // Same single contributor providing both meanings — a real conflict
    // exists, but with only one independent contributor and few
    // occurrences, it is not yet "meaningful" (see evaluateAmbiguity()).
    s.fabric.observeEvent({ kind: 'TEXT', term: 'lonelyword', text: 'lonelyword', meaning: 'meaning A', candidateLanguage: 'en', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    const r2 = s.fabric.observeEvent({ kind: 'TEXT', term: 'lonelyword', text: 'lonelyword', meaning: 'meaning B', candidateLanguage: 'en', consent: AUTHORIZED_CONSENT, actorId: 'u1', enableActiveLearning: true, utilityThreshold: 10 });
    assert.equal(r2.deduplicated, false);
    assert.equal(r2.activeLearningQuestion, null, 'a single contributor with too few occurrences must never trigger an interruption');
});

test('H41. the user\'s answer becomes real evidence', () => {
    const s = loadFullStackWithFabric();
    s.fabric.observeEvent({ kind: 'TEXT', term: 'sawa', text: 'sawa', meaning: 'okay', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    const r2 = s.fabric.observeEvent({ kind: 'TEXT', term: 'sawa', text: 'sawa', meaning: 'fair/just', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u2', enableActiveLearning: true, utilityThreshold: 2 });
    assert.ok(r2.activeLearningQuestion);
    const answer = s.activeLearning.submitAnswer({ questionId: r2.activeLearningQuestion.questionId, selectedOption: 'okay', consent: AUTHORIZED_CONSENT, actorId: 'u3' });
    assert.equal(answer.success, true);
    assert.equal(answer.observation.lifecycleStatus, 'OBSERVED');
    assert.match(answer.observation.contentRef.derivedText, /sawa/);
});

// =====================================================================
// I. GAP DETECTION
// =====================================================================

test('I42. unknown word repeated triggers UNKNOWN_WORD_REPEATED', () => {
    const s = loadFullStackWithFabric();
    for (let i = 1; i <= 3; i++) s.fabric.observeEvent({ kind: 'TEXT', term: 'jumuiya', text: 'jumuiya', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: `u${i}` });
    const result = s.learningGapDiscovery.discoverUnknownWordGap({ term: 'jumuiya', language: 'sw', actorId: 'system' });
    assert.ok(result.gap);
    assert.equal(result.gap.type, 'UNKNOWN_WORD_REPEATED');
});

test('I43. missing language expression for a known concept', () => {
    const s = loadFullStackWithFabric();
    s.conceptRegistry.getOrCreateConcept({ conceptId: 'concept-i43', domain: 'general', actorId: 'system' });
    const result = s.learningGapDiscovery.discoverConceptMissingExpressionGap({ conceptId: 'concept-i43', targetLanguages: ['en', 'luo'], actorId: 'system' });
    assert.equal(result.success, true);
    assert.ok(result.gaps.some((g) => g.language === 'luo'));
});

test('I44. repeated correction gap', () => {
    const s = loadFullStackWithFabric();
    s.correctionLearning.recordCorrection({ targetRecordId: 'expr_i44', targetRecordType: 'EXPRESSION', originalValue: 'a', correctedValue: 'b', correctionType: 'MEANING', language: 'en', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    s.correctionLearning.recordCorrection({ targetRecordId: 'expr_i44', targetRecordType: 'EXPRESSION', originalValue: 'a', correctedValue: 'c', correctionType: 'MEANING', language: 'en', consent: AUTHORIZED_CONSENT, actorId: 'u2' });
    const result = s.learningGapDiscovery.discoverRepeatedCorrectionGap({ targetRecordId: 'expr_i44', threshold: 2, actorId: 'system' });
    assert.ok(result.gap);
    assert.equal(result.gap.type, 'REPEATED_CORRECTION');
});

test('I45. semantic capability gap composes the real planner, never a second understanding engine', () => {
    const s = loadFullStackWithFabric();
    const result = s.learningGapDiscovery.discoverSemanticCapabilityGap({ text: 'totallyunknownconceptxyz una umuhimu gani', entityHint: 'totallyunknownconceptxyz', requestedLanguage: 'sw', actorId: 'system' });
    assert.equal(result.success, true);
    assert.ok(result.gap);
    assert.equal(result.gap.type, 'SEMANTIC_CAPABILITY_GAP');
    assert.equal(result.gap.cognitiveStatus, 'INSUFFICIENT_EVIDENCE');
});

// =====================================================================
// J. IMPROVEMENT
// =====================================================================

test('J46. verified knowledge creates real regression evidence via the fabric', () => {
    const s = loadFullStackWithFabric();
    const verified = verifyTenIndependentContributors(s, 'stahili', 'deserve/worthy', 'sw');
    assert.ok(verified);
    s.correlation.correlateObservation({ conceptId: 'concept-stahili', domain: 'general', observation: verified, meaning: 'deserve/worthy', actorId: 'system' });
    const gen = s.fabric.generateRegression(verified, { text: 'stahili una umuhimu gani', actorId: 'system' });
    assert.equal(gen.success, true);
});

test('J46b. only a real, VERIFIED observation may generate a regression case — CANDIDATE/OBSERVED are refused', () => {
    const s = loadFullStackWithFabric();
    const r = s.fabric.observeEvent({ kind: 'COMMUNITY_CONTRIBUTION', term: 'notyetverified', meaning: 'x', candidateLanguage: 'en', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.observation.lifecycleStatus, 'OBSERVED');
    const gen = s.fabric.generateRegression(r.observation, { text: 'notyetverified', actorId: 'system' });
    assert.equal(gen.success, false);
    const cand = s.fabric.advanceToCandidate(r.observation, { actorId: 'u1', scope: 'COMMUNITY', contributorPseudonym: 'u1', region: 'nairobi' });
    const gen2 = s.fabric.generateRegression(cand.observation, { text: 'notyetverified', actorId: 'system' });
    assert.equal(gen2.success, false, 'a CANDIDATE observation must not be able to generate regression evidence either');
});

test('J47. a previous planner failure becomes a correct answer after learning', () => {
    const s = loadFullStackWithFabric();
    const term = 'mshikamano';
    const before = s.planner.planAnswer({ text: 'mshikamano una umuhimu gani', entityHint: term, requestedLanguage: 'sw' });
    assert.equal(before.success, false);
    const verified = verifyTenIndependentContributors(s, term, 'solidarity between community members', 'sw');
    s.correlation.correlateObservation({ conceptId: 'concept-mshikamano', domain: 'community-life', observation: verified, meaning: 'solidarity between community members', actorId: 'system' });
    const after = s.planner.planAnswer({ text: 'mshikamano una umuhimu gani', entityHint: term, requestedLanguage: 'sw' });
    assert.equal(after.success, true);
    assert.equal(after.diagnostics.learnedSupplementUsed, true);
});

test('J48. previously correct behavior remains correct after new, unrelated learning', () => {
    const s = loadFullStackWithFabric();
    const before = s.planner.planAnswer({ text: 'churchos ni nini', requestedLanguage: 'sw' });
    verifyTenIndependentContributors(s, 'unrelatedTermJ48', 'an unrelated concept', 'sw');
    const after = s.planner.planAnswer({ text: 'churchos ni nini', requestedLanguage: 'sw' });
    assert.deepEqual(
        { success: before.success, goal: before.goal, status: before.diagnostics && before.diagnostics.cognitiveStatus },
        { success: after.success, goal: after.goal, status: after.diagnostics && after.diagnostics.cognitiveStatus },
    );
});

test('J49. no unrelated regression across multiple regression cases', () => {
    const s = loadFullStackWithFabric();
    const v1 = verifyTenIndependentContributors(s, 'termJ49a', 'meaning A', 'sw');
    const v2 = verifyTenIndependentContributors(s, 'termJ49b', 'meaning B', 'en');
    s.fabric.generateRegression(v1, { text: 'termJ49a una umuhimu gani', actorId: 'system' });
    s.fabric.generateRegression(v2, { text: 'what is the importance of termJ49b', actorId: 'system' });
    const result = s.fabric.verifyImprovement({ actorId: 'system' });
    assert.equal(result.success, true);
    assert.equal(result.regressions, 0);
});

// =====================================================================
// K. PERFORMANCE
// =====================================================================

test('K50. background learning observation does not couple to or block a Live Window planner call', () => {
    const s = loadFullStackWithFabric();
    // Interleave a fabric observation with a real planner call — neither
    // throws, neither depends on the other's completion, proving the
    // two paths are not accidentally coupled into one blocking call.
    const obsResult = s.fabric.observeEvent({ kind: 'TEXT', term: 'interleavetest', text: 'interleavetest', candidateLanguage: 'en', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    const planResult = s.planner.planAnswer({ text: 'churchos ni nini', requestedLanguage: 'sw' });
    assert.equal(obsResult.success, true);
    assert.equal(typeof planResult.success, 'boolean');
});

test('K51. duplicate observations submitted in immediate succession are controlled (deduplicated)', () => {
    const s = loadFullStackWithFabric();
    const r1 = s.fabric.observeEvent({ kind: 'TEXT', term: 'dupterm', text: 'dupterm', candidateLanguage: 'en', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    const r2 = s.fabric.observeEvent({ kind: 'TEXT', term: 'dupterm', text: 'dupterm', candidateLanguage: 'en', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r1.deduplicated, false);
    assert.equal(r2.deduplicated, true);
});

test('K52. the learning queue remains bounded under sustained load', () => {
    const s = loadFullStackWithFabric();
    for (let i = 0; i < 600; i++) {
        s.fabric.observeEvent({ kind: 'TEXT', term: `queueterm${i}`, text: `queueterm${i}`, candidateLanguage: 'en', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    }
    const stats = s.fabric.getQueueStats();
    assert.ok(stats.trackedEvents <= stats.maxTrackedEvents);
    assert.equal(stats.maxTrackedEvents, 500);
});

// =====================================================================
// SINGLE-AI / NO-DUPLICATE-SYSTEM GUARANTEE
// =====================================================================

test('SINGLE-AI: no second learning/observation/concept/correction engine is introduced by CML-6', () => {
    const s = loadFullStackWithFabric();
    const forbidden = ['ContinuousAI', 'LearningAI', 'LanguageAI', 'ObservationAI', 'MediaAI', 'SecondObservationCore', 'SecondConceptStore', 'SecondCorrectionDatabase', 'SecondLanguageRegistry', 'SecondMemoryStore', 'SecondSemanticAnswerEngine'];
    for (const name of forbidden) assert.equal(typeof s.window.CozyOS[name], 'undefined', `must not introduce window.CozyOS.${name}`);
});

test('STRUCTURAL: CML-6 does not touch cozy-living-assistant.js/CognitiveCoordinator/the memory engine directly, and never wires its own fabric into admin-workspace.html', () => {
    const { execSync } = require('node:child_process');
    const path = require('node:path');
    const repoRoot = path.join(__dirname, '..', '..', '..', '..');
    // core/modules/intelligence/language-packs/cozy-language-pack-
    // registry.js was REMOVED from this list (Phase 5 Extension —
    // Universal Language Fluency; see the comment this replaced). It is
    // no longer CML-6-exclusive territory: Phase 4's own P4-6 already
    // extended getLanguageCapabilities() on this exact file (now part
    // of HEAD itself), and Phase 5's language-fluency-diagnostic.js
    // composes it further, additively.
    //
    // index.html/dashboard.html were ALSO removed here (PHASE 5 —
    // Universal Rewiring, PRIORITY 1). This original guarantee assumed
    // CML-6 would forever remain "built but unreachable" — exactly the
    // Phase 5 architecture audit's own central finding, and exactly
    // what Phase 5 exists to fix. cozy-teach-flow.js's own CONFIRM
    // branch is now the fabric's one real, live, explicitly-consented
    // entry point (see that file's own PHASE 5 comment), which
    // necessarily requires the fabric's real script chain to be loaded
    // on the same real pages cozy-teach-flow.js already loads on —
    // confirmed via a real end-to-end test (core/living/tests/
    // phase5-teach-flow-cml6-wiring.test.js) and a real Chromium
    // reachability test (core/living/tests/phase5-cml6-real-browser-
    // reachability.test.js), both proving zero regression to every
    // existing page behavior.
    const fullyProtectedPaths = [
        'core/living/cozy-living-assistant.js',
        'core/modules/cognitive/cognitive-coordinator.js',
        'core/modules/memory/cozy-memory-engine.js',
    ];
    const coreDiff = execSync(`git diff --name-only HEAD -- ${fullyProtectedPaths.join(' ')}`, { cwd: repoRoot }).toString().trim();
    assert.equal(coreDiff, '', 'CML-6 must not modify cozy-living-assistant.js/CognitiveCoordinator/the memory engine directly');

    // admin-workspace.html — SEMANTIC CHECK (Phase 5 ADDITION — User
    // Dashboard <-> Administrator Application Control Plane).
    //   A real, later, separately-authorized milestone
    //   (core/organization/application-access-admin-panel.js) now
    //   legitimately modifies admin-workspace.html for a reason entirely
    //   unrelated to CML-6 (turning an approved application-access
    //   request into a real IdentityEngine.assignApplication() grant —
    //   nothing to do with the learning fabric). A blanket "this file
    //   must have zero diff" check can no longer distinguish CML-6
    //   touching this file from a different, unrelated milestone
    //   touching it, so a bare `git diff --name-only` check on this one
    //   path was replaced with a real content inspection: this still
    //   fails, correctly, if admin-workspace.html's diff ever wires in
    //   CML-6's own real script chain (anything under
    //   core/modules/learning/) or references any of CML-6's own real,
    //   registered window.CozyOS globals — the actual, concrete shape
    //   any real CML-6-into-admin-workspace wiring would necessarily
    //   take. It does NOT fail merely because admin-workspace.html has
    //   *some* diff, which is the real gap the old blanket check had.
    const adminDiff = execSync('git diff HEAD -- admin-workspace.html', { cwd: repoRoot }).toString();
    assert.doesNotMatch(adminDiff, /core\/modules\/learning\//, 'CML-6 must not wire its own fabric script chain into admin-workspace.html');
    const cml6Globals = [
        'ContinuousLearningFabric', 'EvidenceProfile', 'ConflictDetection', 'LanguageGapRegistry',
        'LearningGapDiscovery', 'ActiveLearning', 'LearningPriority', 'ObservationLifecycle',
        'ObservationEvidenceBridge', 'CanonicalConceptRegistry', 'CorrectionLearning',
        'LearningEvidenceSupplement', 'GapDetection', 'LearningCorrelation', 'ObservationStore',
        'MultimodalObservationAdapter', 'RegressionGenerator', 'SearchLearnBridge',
        'LanguageFluencyDiagnostic', 'UniversalLearningPipeline', 'LearningInteractionCore',
        'LearningCameraAdapter', 'MultimodalObservationCore',
    ];
    for (const name of cml6Globals) {
        assert.doesNotMatch(adminDiff, new RegExp(`\\b${name}\\b`), `CML-6 must not reference window.CozyOS.${name} in admin-workspace.html`);
    }
});
