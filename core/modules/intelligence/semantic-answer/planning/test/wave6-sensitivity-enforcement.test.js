'use strict';

/**
 * core/modules/intelligence/semantic-answer/planning/test/wave6-sensitivity-enforcement.test.js
 *
 * WAVE 6 — smallest reusable privacy/visibility enforcement layer.
 *
 * BACKGROUND (PRE-EXISTING-FAILURE-REGISTER.md §7.1's own finding, this
 * session's re-audit): every real VerifiedEvidence record already
 * carries a required `sensitivity` field (SA-1's own
 * VerifiedEvidenceContract.SENSITIVITY enum — PUBLIC/ORGANIZATION/
 * PRIVATE/ADMIN/SYSTEM/SECRET), but before this repair, nothing in SA-3
 * ever read it — `partitionEvidenceByAuthority()` only checked
 * `verification.status`. Today's real non-leakage was a side effect of
 * every evidence source SA-3 currently draws from (CozyKnowledge)
 * defaulting to PUBLIC, never an enforced control — exactly the gap
 * master-spec item 63 names ("security must not depend on wording...
 * the meaning being exposed must be controlled").
 *
 * REPAIR: `partitionEvidenceByAuthority()` now only ever places a
 * structurally-authoritative evidence record into `authoritative`
 * (the bucket `planAnswer()` turns into plan claims) when its own
 * `sensitivity` is exactly "PUBLIC". Everything else goes to a new,
 * honestly-reported `restricted` bucket and can never become a claim.
 * Reuses the existing SENSITIVITY taxonomy and the existing, already-
 * populated `sensitivity` field — no new classification system, no new
 * evidence field, no new AI/response engine/database.
 *
 * These tests inject a FAKE VerifiedEvidenceAdapter (same technique
 * semantic-answer-planner.test.js's own `fakeAdapterStack()` uses) so
 * they can directly control evidence sensitivity — proving the gate
 * itself, independent of whether any real, currently-wired evidence
 * source happens to be non-PUBLIC today.
 *
 * Run with: node --test core/modules/intelligence/semantic-answer/planning/test/wave6-sensitivity-enforcement.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { freshLoad } = require('./_test-helpers');

function fakeAdapterStack(collectApplicationHumanPurposeEvidence) {
    const w = freshLoad(['semanticIntent', 'planContract', 'evidenceContract', 'cognitiveDecision', 'planner']);
    w.CozyOS.VerifiedEvidenceAdapter = { collectApplicationHumanPurposeEvidence, collectSystemFactEvidence: () => ({ success: false, evidence: [], errors: ['not used in this fixture'] }) };
    return w.CozyOS.SemanticAnswerPlanner;
}

function fakeEvidence(id, claim, sensitivity, path) {
    return {
        schemaVersion: 'cozy.verified-evidence.v1', id, claim,
        source: { type: 'APPLICATION_HUMAN_PURPOSE', id: 'churchos', path: path || 'APPLICATION_HUMAN_PURPOSE_DATA.churchos.humanBenefits' },
        verification: { status: 'VERIFIED', confidence: 'HIGH' },
        sensitivity, language: 'en',
    };
}

/* ------------------------------------------------------------------ */
/* A: partitionEvidenceByAuthority() itself                            */
/* ------------------------------------------------------------------ */

test('A: partitionEvidenceByAuthority() places PUBLIC, VERIFIED evidence in `authoritative`', () => {
    const planner = fakeAdapterStack(() => ({ success: true, evidence: [] }));
    const result = planner.partitionEvidenceByAuthority([fakeEvidence('e1', 'a real public claim', 'PUBLIC')]);
    assert.equal(result.authoritative.length, 1);
    assert.equal(result.restricted.length, 0);
});

test('B: partitionEvidenceByAuthority() places PRIVATE, VERIFIED evidence in `restricted`, never `authoritative`', () => {
    const planner = fakeAdapterStack(() => ({ success: true, evidence: [] }));
    const result = planner.partitionEvidenceByAuthority([fakeEvidence('e1', 'a real private claim', 'PRIVATE')]);
    assert.equal(result.authoritative.length, 0);
    assert.equal(result.restricted.length, 1);
    assert.equal(result.restricted[0].id, 'e1');
});

test('C: SYSTEM and SECRET sensitivity evidence is likewise never authoritative — the exact classes master-spec item 63 is concerned about', () => {
    const planner = fakeAdapterStack(() => ({ success: true, evidence: [] }));
    for (const sensitivity of ['SYSTEM', 'SECRET', 'ADMIN', 'ORGANIZATION']) {
        const result = planner.partitionEvidenceByAuthority([fakeEvidence('e1', 'claim', sensitivity)]);
        assert.equal(result.authoritative.length, 0, `expected ${sensitivity} evidence to never be authoritative`);
        assert.equal(result.restricted.length, 1, `expected ${sensitivity} evidence to be reported as restricted`);
    }
});

test('D: a missing/malformed sensitivity value fails CLOSED (treated as restricted, never assumed PUBLIC)', () => {
    const planner = fakeAdapterStack(() => ({ success: true, evidence: [] }));
    const noSensitivity = fakeEvidence('e1', 'claim', undefined);
    delete noSensitivity.sensitivity;
    const result = planner.partitionEvidenceByAuthority([noSensitivity]);
    assert.equal(result.authoritative.length, 0);
    assert.equal(result.restricted.length, 1);
});

/* ------------------------------------------------------------------ */
/* E: end-to-end through planAnswer() — the real, live seam            */
/* ------------------------------------------------------------------ */

test('E: planAnswer() never produces a plan/claim from PRIVATE evidence, even when it is the ONLY evidence returned by the (fake, injected) evidence source — reports the honest, distinct RESTRICTED_EVIDENCE_ONLY reason, never a fabricated success', () => {
    const planner = fakeAdapterStack((_entity, _opts) => ({
        success: true,
        evidence: [fakeEvidence('e1', 'a private fact that must never be asserted', 'PRIVATE', 'APPLICATION_HUMAN_PURPOSE_DATA.churchos.currentVerifiedCapabilities')],
    }));
    const result = planner.planAnswer({ text: 'What does ChurchOS do?', entityHint: 'ChurchOS' });
    assert.equal(result.success, false);
    assert.equal(result.reason, 'RESTRICTED_EVIDENCE_ONLY');
    assert.deepEqual(result.restrictedEvidenceIds, ['e1']);
    assert.equal(result.diagnostics.cognitiveStatus, 'INSUFFICIENT_EVIDENCE');
});

test('F: planAnswer() DOES construct a real plan when the SAME evidence is PUBLIC — the gate blocks on sensitivity specifically, not on the evidence source or goal', () => {
    const planner = fakeAdapterStack((_entity, _opts) => ({
        success: true,
        evidence: [fakeEvidence('e1', 'a real public capability', 'PUBLIC', 'APPLICATION_HUMAN_PURPOSE_DATA.churchos.currentVerifiedCapabilities')],
    }));
    const result = planner.planAnswer({ text: 'What does ChurchOS do?', entityHint: 'ChurchOS' });
    assert.equal(result.success, true);
    assert.equal(result.plan.claims.length, 1);
    assert.equal(result.plan.claims[0].text, 'a real public capability');
});

test('G: a MIX of PUBLIC and PRIVATE evidence for the same goal only ever surfaces the PUBLIC claim — the private one is silently excluded from the plan, never partially leaked', () => {
    const planner = fakeAdapterStack((_entity, _opts) => ({
        success: true,
        evidence: [
            fakeEvidence('pub-1', 'a real public capability', 'PUBLIC', 'APPLICATION_HUMAN_PURPOSE_DATA.churchos.currentVerifiedCapabilities'),
            fakeEvidence('priv-1', 'an internal-only capability detail', 'PRIVATE', 'APPLICATION_HUMAN_PURPOSE_DATA.churchos.currentVerifiedCapabilities'),
        ],
    }));
    const result = planner.planAnswer({ text: 'What does ChurchOS do?', entityHint: 'ChurchOS' });
    assert.equal(result.success, true);
    assert.equal(result.plan.claims.length, 1);
    assert.equal(result.plan.claims[0].text, 'a real public capability');
    const allClaimText = result.plan.claims.map((c) => c.text).join(' ');
    assert.doesNotMatch(allClaimText, /internal-only/);
});

/* ------------------------------------------------------------------ */
/* H: real, currently-wired evidence is untouched by this gate         */
/* ------------------------------------------------------------------ */

test('H: the real, currently-wired CozyKnowledge evidence path (every real fact is PUBLIC today) is completely unaffected by this gate — no capability regression for existing goals', () => {
    const { loadFullStack } = require('./_test-helpers');
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'ChurchOS inasaidiaje mtu?' });
    assert.equal(result.success, true);
    assert.equal(result.plan.goal, 'HUMAN_BENEFIT');
    assert.ok(result.plan.claims.length > 3);
});
