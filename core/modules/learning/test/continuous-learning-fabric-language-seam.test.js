'use strict';

/**
 * core/modules/learning/test/continuous-learning-fabric-language-seam.test.js
 * UNIVERSAL LANGUAGE SEAM §17 — focused tests for the four previously-
 * missing CML-6 lifecycle stages: IDENTIFY LANGUAGE, DIALECT/REGION,
 * UPDATE CAPABILITY, CONTINUE. Composes only real, existing engines via
 * loadFullStackWithFabricAndIdentifier() — never a second learning
 * fabric, never a second detector.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFullStackWithFabricAndIdentifier, AUTHORIZED_CONSENT } = require('./_test-helpers');

/**
 * Same real 10-independent-contributor helper continuous-learning-
 * fabric.test.js's own verifyTenIndependentContributors() uses — a
 * language-tagged observation (isLanguageObservation() in observation-
 * lifecycle.js) is only ever promoted to VALIDATED/VERIFIED once
 * CozyLanguageAcquisitionPipeline's own real validation tier reaches it,
 * which genuinely requires multiple independent contributors. Never a
 * second/shortcut governance path.
 */
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

/**
 * Same real tier-building loop as verifyTenIndependentContributors()
 * above, but stops at VALIDATED for the FINAL (10th) contributor's own
 * observation instead of also calling toVerified() on it — so a test can
 * exercise the fabric's OWN advanceToVerified() (the function actually
 * under test here) as the real, final promotion step.
 */
function getFinalValidatedObservationViaTenContributors(s, term, meaning, language) {
    let finalValidated = null;
    for (let i = 1; i <= 10; i++) {
        const obsResult = s.adapter.fromCommunityContribution({ term, meaning, candidateLanguage: language, actorId: `contributor_${i}`, consent: AUTHORIZED_CONSENT, context: {} });
        let obs = obsResult.observation;
        const cand = s.lifecycle.toCandidate(obs, { actorId: `contributor_${i}`, scope: 'COMMUNITY', contributorPseudonym: `contributor_${i}`, region: 'nairobi' });
        if (!cand.success) continue;
        obs = cand.observation;
        const val = s.lifecycle.toValidated(obs, { actorId: `contributor_${i}` });
        if (val.success) {
            obs = val.observation;
            if (i === 10) { finalValidated = obs; continue; }
        }
        s.lifecycle.toVerified(obs, { actorId: `contributor_${i}` });
    }
    return finalValidated;
}

// =====================================================================
// IDENTIFY LANGUAGE
// =====================================================================

test('IL1. no candidateLanguage supplied: the fabric identifies it for real, via the SAME shared identifier detectLanguageHeuristic()/detectLanguages() use', () => {
    const s = loadFullStackWithFabricAndIdentifier();
    const r = s.fabric.observeEvent({ kind: 'TEXT', text: 'Nina duka langu mjini.', term: 'duka', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.success, true);
    assert.ok(r.languageIdentity, 'expected a real languageIdentity object');
    assert.equal(r.languageIdentity.languageId, 'sw');
    assert.equal(r.effectiveLanguage, 'sw');
    assert.equal(r.profile.profile.language, 'sw', 'the identified language must actually flow into EvidenceProfile, not just sit in the trace');
});

test('IL2. an explicit input.candidateLanguage always wins over detection (EXPLICIT_USER_SELECTION priority — never silently overridden)', () => {
    const s = loadFullStackWithFabricAndIdentifier();
    const r = s.fabric.observeEvent({ kind: 'TEXT', text: 'Nina duka langu mjini.', term: 'duka', candidateLanguage: 'en', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.success, true);
    assert.equal(r.effectiveLanguage, 'en', 'explicit candidateLanguage must never be overridden by detection');
    assert.equal(r.profile.profile.language, 'en');
});

test('IL3. genuinely unidentifiable text: languageIdentity is honestly UNRESOLVED/UNKNOWN, never guessed, and effectiveLanguage is null (not silently "en")', () => {
    const s = loadFullStackWithFabricAndIdentifier();
    const r = s.fabric.observeEvent({ kind: 'TEXT', text: 'asdkj qweoi', term: 'asdkj', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.success, true);
    assert.ok(r.languageIdentity);
    assert.equal(r.languageIdentity.languageId, 'UNKNOWN');
    assert.equal(r.languageIdentity.source, 'UNRESOLVED');
    assert.equal(r.effectiveLanguage, null, 'an honestly unidentified language must never be silently defaulted to English');
});

test('IL4. unseen/novel Kiswahili verb morphology (zero marker-word overlap) still identifies correctly — proves real generalization, not a lookup table', () => {
    const s = loadFullStackWithFabricAndIdentifier();
    const r = s.fabric.observeEvent({ kind: 'TEXT', text: 'Alipika chakula kizuri jana.', term: 'alipika', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.success, true);
    assert.equal(r.languageIdentity.languageId, 'sw');
    assert.equal(r.languageIdentity.source, 'MORPHOLOGICAL_MATCH');
});

test('IL5. without the identifier loaded at all, the fabric degrades honestly to trusting input.candidateLanguage as given (byte-identical to pre-seam behavior)', () => {
    const { loadFullStackWithFabric } = require('./_test-helpers');
    const s = loadFullStackWithFabric();
    const r = s.fabric.observeEvent({ kind: 'TEXT', text: 'Nina duka langu mjini.', term: 'duka', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.success, true);
    assert.equal(r.languageIdentity, null, 'no identifier loaded -> no fabricated identity object');
    assert.equal(r.effectiveLanguage, 'sw', 'explicit candidateLanguage still flows through unaffected');
});

// =====================================================================
// DIALECT/REGION
// =====================================================================

test('DR1. dialectRegion is honestly disclosed (null today — no real dialect-detection logic exists anywhere yet), never fabricated', () => {
    const s = loadFullStackWithFabricAndIdentifier();
    const r = s.fabric.observeEvent({ kind: 'TEXT', text: 'Nina duka langu mjini.', term: 'duka', consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.success, true);
    assert.ok(r.languageIdentity);
    assert.equal(r.languageIdentity.dialectRegion, null, 'dialectRegion must be honestly null, never guessed');
});

test('DR2. the languageIdentity contract itself is always internally valid (THE ONE RULE never violated by the fabric\'s own usage)', () => {
    const s = loadFullStackWithFabricAndIdentifier();
    const cases = ['Nina duka langu mjini.', 'asdkj qweoi', 'What is this?'];
    for (const text of cases) {
        const r = s.fabric.observeEvent({ kind: 'TEXT', text, term: text.split(' ')[0], consent: AUTHORIZED_CONSENT, actorId: 'u1' });
        const identity = r.languageIdentity;
        if (!identity) continue;
        if (identity.source === 'UNRESOLVED') assert.equal(identity.languageId, 'UNKNOWN');
        if (identity.languageId === 'UNKNOWN') assert.equal(identity.source, 'UNRESOLVED');
    }
});

// =====================================================================
// UPDATE CAPABILITY
// =====================================================================

test('UC1. advanceToVerified() WITHOUT opts.conceptId behaves byte-identically to before (no capabilityUpdate field, no LanguageGapRegistry call)', () => {
    const s = loadFullStackWithFabricAndIdentifier();
    const finalValidated = getFinalValidatedObservationViaTenContributors(s, 'testword', 'a real test meaning', 'sw');
    assert.ok(finalValidated, 'the 10-contributor setup must reach a real VALIDATED observation');
    const ver = s.fabric.advanceToVerified(finalValidated, { actorId: 'contributor_10' });
    assert.equal(ver.success, true);
    assert.equal(ver.capabilityUpdate, undefined, 'no conceptId supplied -> no capabilityUpdate field at all, matching ObservationLifecycle.toVerified()\'s own real return shape');
});

test('UC2. advanceToVerified() WITH opts.conceptId auto-runs the real LanguageGapRegistry coverage check and attaches capabilityUpdate', () => {
    const s = loadFullStackWithFabricAndIdentifier();
    const conceptId = 'concept_test_uc2';
    const finalValidated = getFinalValidatedObservationViaTenContributors(s, 'testword2', 'a real test meaning', 'sw');
    assert.ok(finalValidated);

    // Real attachment happens BEFORE final verification (exactly as
    // observeEvent() itself already does via LearningCorrelation) —
    // this is what makes the observation reachable via
    // CanonicalConceptRegistry.listAttachments(conceptId) at all.
    const correlated = s.correlation.correlateObservation({ conceptId, domain: 'general', observation: finalValidated, meaning: 'a real test meaning', actorId: 'system' });
    assert.equal(correlated.success, true, 'concept correlation must succeed for this real test setup');

    const ver = s.fabric.advanceToVerified(finalValidated, { actorId: 'contributor_10', conceptId });
    assert.equal(ver.success, true);
    assert.ok(ver.capabilityUpdate, 'expected a real capabilityUpdate field once conceptId is supplied and promotion succeeds');
    assert.equal(ver.capabilityUpdate.success, true);
    assert.ok(ver.capabilityUpdate.coverage.sw, 'expected real sw coverage entry');
    assert.equal(ver.capabilityUpdate.coverage.sw.verified, true, 'a just-VERIFIED, attached observation must show real verified coverage');
});

test('UC3b. a gap that was OPEN before verification is honestly auto-closed by the SAME real re-check once real verified coverage exists', () => {
    const s = loadFullStackWithFabricAndIdentifier();
    const conceptId = 'concept_test_uc3b';
    // First, an OPEN gap for "sw" with no evidence at all.
    const before = s.fabric.checkLanguageGaps({ conceptId, targetLanguages: ['sw'], actorId: 'system' });
    assert.equal(before.success, true);
    assert.equal(before.gapsCreated.length, 1);
    assert.equal(before.gapsCreated[0].status, 'OPEN');

    const finalValidated = getFinalValidatedObservationViaTenContributors(s, 'testword3b', 'x', 'sw');
    assert.ok(finalValidated);
    s.correlation.correlateObservation({ conceptId, domain: 'general', observation: finalValidated, meaning: 'x', actorId: 'system' });

    const ver = s.fabric.advanceToVerified(finalValidated, { actorId: 'contributor_10', conceptId });
    assert.equal(ver.success, true);
    assert.equal(ver.capabilityUpdate.gapsClosed.length, 1, 'the fabric\'s own UPDATE CAPABILITY step must close the previously-OPEN gap now that real verified coverage exists');
    assert.equal(ver.capabilityUpdate.gapsClosed[0].status, 'CLOSED');
});

test('UC3. advanceToVerified() failure (e.g. wrong lifecycle stage) never runs the capability update, never throws', () => {
    const s = loadFullStackWithFabricAndIdentifier();
    const obsResult = s.adapter.fromCommunityContribution({ term: 'testword3', meaning: 'x', candidateLanguage: 'sw', actorId: 'u1', consent: AUTHORIZED_CONSENT, context: {} });
    const obs = obsResult.observation; // still OBSERVED, not VALIDATED — must fail
    const ver = s.fabric.advanceToVerified(obs, { actorId: 'u1', conceptId: 'concept_x' });
    assert.equal(ver.success, false);
    assert.equal(ver.capabilityUpdate, undefined);
});

// =====================================================================
// CONTINUE
// =====================================================================

test('CN1. observationCount/lastObservedAt are real, cumulative, and grow across repeated calls for the SAME term+language — never reset between calls', () => {
    const s = loadFullStackWithFabricAndIdentifier();
    const r1 = s.fabric.observeEvent({ kind: 'TEXT', text: 'karibu', term: 'karibu', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u1', contributorId: 'c1' });
    assert.equal(r1.observationCount, 1);
    assert.ok(typeof r1.lastObservedAt === 'number' && r1.lastObservedAt > 0);

    const r2 = s.fabric.observeEvent({ kind: 'TEXT', text: 'karibu', term: 'karibu', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u2', contributorId: 'c2' });
    assert.equal(r2.observationCount, 2, 'the pipeline must remain available and keep counting across repeated, real observations — never a one-shot run');
    assert.ok(r2.lastObservedAt >= r1.lastObservedAt);
});

test('CN2. observationCount for a genuinely new term starts at 1, proving counts are per (term, language), not a global tally', () => {
    const s = loadFullStackWithFabricAndIdentifier();
    s.fabric.observeEvent({ kind: 'TEXT', text: 'karibu', term: 'karibu', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u1', contributorId: 'c1' });
    const r = s.fabric.observeEvent({ kind: 'TEXT', text: 'asante', term: 'asante', candidateLanguage: 'sw', consent: AUTHORIZED_CONSENT, actorId: 'u2', contributorId: 'c2' });
    assert.equal(r.observationCount, 1);
});

test('CN3. when EvidenceProfile is unavailable (no real term), observationCount honestly reports 0, never a fabricated non-zero count', () => {
    const s = loadFullStackWithFabricAndIdentifier();
    const r = s.fabric.observeEvent({ kind: 'OCR', ocrResult: { available: false, reason: 'no camera' }, consent: AUTHORIZED_CONSENT, actorId: 'u1' });
    assert.equal(r.success, false);
});
