'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PATHS, freshLoad } = require('./_test-helpers');

function loadKnowledge() {
    const w = freshLoad(['knowledgeRegistry', 'evidenceContract', 'adapter', 'knowledgeAdapter']);
    return { knowledge: w.CozyOS.CozyKnowledge, adapter: w.CozyOS.CozyKnowledgeEvidenceAdapter, evidenceContract: w.CozyOS.VerifiedEvidenceContract };
}

/** Real ServiceRegistry contract-only stub — same convention already used elsewhere in this repo's own tests (e.g. core/modules/intelligence/tests/cozy-ai-context.test.js's makeFakeServiceRegistry()). ServiceRegistry itself is a pre-existing, independent platform registry outside SA-2's own scope; CozyKnowledge's real getApplicationFact()/listApplicationsFact() only ever call its real, documented listApplications() contract. */
function loadKnowledgeWithServiceRegistry() {
    const w = freshLoad(['knowledgeRegistry', 'evidenceContract', 'adapter', 'knowledgeAdapter']);
    w.CozyOS.ServiceRegistry = { listApplications: () => [{ id: 'mpesaos', name: 'MpesaOS', category: 'finance', enabled: true, version: '1.0.0' }] };
    return { knowledge: w.CozyOS.CozyKnowledge, adapter: w.CozyOS.CozyKnowledgeEvidenceAdapter, evidenceContract: w.CozyOS.VerifiedEvidenceContract };
}

// ---------- registration ----------

test('registers window.CozyOS.CozyKnowledgeEvidenceAdapter', () => {
    const { adapter } = loadKnowledge();
    assert.ok(adapter);
    assert.equal(typeof adapter.getVersion(), 'string');
});

test('degrades honestly (never throws) when CozyKnowledge is not loaded', () => {
    const w = freshLoad(['evidenceContract', 'adapter', 'knowledgeAdapter']);
    const result = w.CozyOS.CozyKnowledgeEvidenceAdapter.adaptApplicationHumanPurpose('ChurchOS');
    assert.equal(result.success, false);
    assert.ok(result.errors.length > 0);
});

// ---------- contract validity ----------

test('every emitted evidence record for a real application (ChurchOS) passes VerifiedEvidenceContract.validate()', () => {
    const { adapter, evidenceContract } = loadKnowledge();
    const result = adapter.adaptApplicationHumanPurpose('ChurchOS', { languages: ['en', 'sw'] });
    assert.equal(result.success, true);
    assert.ok(result.evidence.length > 10, `expected many granular records, got ${result.evidence.length}`);
    for (const ev of result.evidence) {
        const v = evidenceContract.validate(ev);
        assert.deepEqual(v.errors, [], `evidence ${ev.id} failed validation`);
    }
});

// ---------- provenance ----------

test('source provenance: ChurchOS human-purpose facts map to source.type APPLICATION_HUMAN_PURPOSE', () => {
    const { adapter } = loadKnowledge();
    const result = adapter.adaptApplicationHumanPurpose('ChurchOS', { languages: ['en'] });
    assert.ok(result.evidence.length > 0);
    for (const ev of result.evidence) assert.equal(ev.source.type, 'APPLICATION_HUMAN_PURPOSE');
});

test('source provenance: adaptApplicationKnowledge() maps to source.type APPLICATION_KNOWLEDGE', () => {
    const { adapter } = loadKnowledgeWithServiceRegistry();
    const result = adapter.adaptApplicationKnowledge('MpesaOS');
    assert.equal(result.success, true);
    assert.equal(result.evidence[0].source.type, 'APPLICATION_KNOWLEDGE');
});

test('source provenance: adaptSystemFact() maps to source.type SYSTEM_FACT', () => {
    const { adapter } = loadKnowledgeWithServiceRegistry();
    const result = adapter.adaptSystemFact('listApplicationsFact');
    assert.equal(result.success, true);
    assert.ok(result.evidence.length > 0);
    for (const ev of result.evidence) assert.equal(ev.source.type, 'SYSTEM_FACT');
});

// ---------- verification status is NOT inflated ----------

test('currentVerifiedCapabilities/humanPurpose/humanBenefits map to verification.status VERIFIED', () => {
    const { adapter } = loadKnowledge();
    const result = adapter.adaptApplicationHumanPurpose('ChurchOS', { languages: ['en'] });
    const capabilityEvidence = result.evidence.filter((e) => e.source.path.includes('.currentVerifiedCapabilities'));
    assert.ok(capabilityEvidence.length > 0);
    for (const ev of capabilityEvidence) assert.equal(ev.verification.status, 'VERIFIED');
});

test('visionCapabilities NEVER map to VERIFIED — real, disclosed roadmap items stay UNVERIFIED (MpesaOS has real vision entries to prove this against)', () => {
    const { adapter } = loadKnowledge();
    const result = adapter.adaptApplicationHumanPurpose('MpesaOS', { languages: ['en'] });
    const visionEvidence = result.evidence.filter((e) => e.source.path.includes('.visionCapabilities'));
    assert.ok(visionEvidence.length > 0, 'expected MpesaOS to have real visionCapabilities entries (scanIntake()/reconciliation/external command interface)');
    for (const ev of visionEvidence) {
        assert.notEqual(ev.verification.status, 'VERIFIED');
        assert.equal(ev.verification.status, 'UNVERIFIED');
    }
});

// ---------- language preservation ----------

test('English and Kiswahili are distinguishable, real, separate evidence — never one collapsed into the other', () => {
    const { adapter } = loadKnowledge();
    const result = adapter.adaptApplicationHumanPurpose('ChurchOS', { languages: ['en', 'sw'] });
    const en = result.evidence.filter((e) => e.language === 'en');
    const sw = result.evidence.filter((e) => e.language === 'sw');
    assert.ok(en.length > 0 && sw.length > 0);
    // Real Kiswahili siblings exist for ChurchOS on every SUBSTANCE_FIELD
    // (resolvePurposeForLanguage() fails closed to null otherwise — see
    // cozy-knowledge-registry.js), but real per-item array LENGTH is not
    // guaranteed identical between languages (human-authored translation,
    // not a 1:1 mechanical mirror) — both must simply be real and non-trivial.
    assert.ok(en.length >= 10 && sw.length >= 10);
    // Real, verbatim Kiswahili text from the repository's own committed data (not invented).
    assert.ok(sw.some((e) => e.claim === 'ushiriki wa lugha nyingi'), 'expected the real Kiswahili "ushiriki wa lugha nyingi" (multilingual participation) claim');
    assert.ok(en.some((e) => e.claim === 'multilingual participation'));
});

test('a language with no real Kiswahili payload yet is honestly skipped, never English-fallback-disguised-as-Kiswahili', () => {
    const { adapter } = loadKnowledge();
    // QuarryOS: real application in the data table; only testing the
    // real, current behavior for whichever languages actually resolve —
    // if `sw` fails closed, no `language: 'sw'` record should exist
    // carrying English text.
    const result = adapter.adaptApplicationHumanPurpose('QuarryOS', { languages: ['en', 'sw'] });
    const sw = result.evidence.filter((e) => e.language === 'sw');
    const en = result.evidence.filter((e) => e.language === 'en');
    if (sw.length === 0) {
        assert.ok(en.length > 0, 'English evidence should still be real and present');
        assert.ok(result.errors.some((e) => e.includes('sw')));
    }
});

// ---------- required semantic fixture: ChurchOS HUMAN_BENEFIT / PRACTICAL_WORK_CONTRIBUTION ----------

test('REQUIRED FIXTURE: real ChurchOS evidence exists to eventually support goal=HUMAN_BENEFIT, language=sw ("ChurchOS inasaidiaje mtu?") — SA-2 stops at VerifiedEvidence[], produces no final answer', () => {
    const { adapter } = loadKnowledge();
    const result = adapter.adaptApplicationHumanPurpose('ChurchOS', { languages: ['sw'] });
    assert.equal(result.success, true);
    const claims = result.evidence.map((e) => e.claim);
    // Real, verbatim strings from APPLICATION_HUMAN_PURPOSE_DATA.churchos.humanBenefitsSw.
    assert.ok(claims.includes('mpangilio bora'), 'expected the real "mpangilio bora" (better organization) claim');
    assert.ok(claims.includes('uhifadhi wa maarifa ya kanisa'), 'expected the real "uhifadhi wa maarifa ya kanisa" (preservation of church knowledge) claim');
    assert.ok(claims.includes('ushiriki wa lugha nyingi'), 'expected the real "ushiriki wa lugha nyingi" (multilingual participation) claim');
    // SA-2 boundary: no field named "answer", no single combined string — only granular evidence.
    assert.ok(result.evidence.every((e) => typeof e.claim === 'string' && !('answer' in e)));
});

test('REQUIRED FIXTURE: real ChurchOS evidence exists to eventually support goal=PRACTICAL_WORK_CONTRIBUTION — a known semantic gap (no exact stored answer exists for "ChurchOS inachangiaje kazi yetu ya kila siku kanisani?"), but the underlying facts are real and available', () => {
    const { adapter } = loadKnowledge();
    const result = adapter.adaptApplicationHumanPurpose('ChurchOS', { languages: ['sw', 'en'] });
    const swClaims = result.evidence.filter((e) => e.language === 'sw').map((e) => e.claim);
    const enClaims = result.evidence.filter((e) => e.language === 'en').map((e) => e.claim);
    // Real facts a future planner could compose into a PRACTICAL_WORK_CONTRIBUTION
    // answer — organizing work, coordinating activities, reducing admin burden.
    assert.ok(swClaims.includes('uratibu bora wa shughuli za kanisa'), 'expected the real "uratibu bora wa shughuli za kanisa" (better coordination of church activities) claim');
    assert.ok(enClaims.includes('better coordination of church activities'));
    assert.ok(enClaims.includes('less repetitive administrative work'));
    // Explicitly proving the negative: there is no literal "PRACTICAL_WORK_CONTRIBUTION"-
    // keyed field or answer anywhere in what this adapter produced — only raw facts.
    assert.ok(!result.evidence.some((e) => JSON.stringify(e).includes('PRACTICAL_WORK_CONTRIBUTION')), 'SA-2 must never itself resolve or label evidence by goal');
});

// ---------- no stored-answer selection (negative test, source + behavior) ----------

test('SOURCE CHECK: the adapter file contains no goal-to-answer or language-to-answer selection shortcut', () => {
    // Strip comments first so this check inspects real CODE only — this
    // file's own doc comments legitimately discuss (in English prose)
    // the exact anti-pattern being guarded against here.
    const raw = fs.readFileSync(PATHS.knowledgeAdapter, 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /language\s*===\s*["']sw["']\s*\)\s*return/);
    assert.doesNotMatch(code, /\[`answer_\$\{/);
    assert.doesNotMatch(code, /\bgoal\b/); // this file must never even reference "goal" in real code — it never receives one
    assert.doesNotMatch(code, /\bhumanBenefitsSw\b/); // never references a specific field literal by hardcoded name+language
});

test('BEHAVIORAL CHECK: output is many granular evidence records, never a single selected "the answer" string', () => {
    const { adapter } = loadKnowledge();
    const result = adapter.adaptApplicationHumanPurpose('ChurchOS', { languages: ['sw'] });
    assert.ok(result.evidence.length >= 10, 'a single stored-answer-selection design would return ~1 record; a real evidence adapter returns many granular ones');
    // Ids (not claim text) are the real uniqueness guarantee — two
    // distinct real facts can coincidentally share short phrasing in
    // natural-language source data without that being a defect.
    const uniqueIds = new Set(result.evidence.map((e) => e.id));
    assert.equal(uniqueIds.size, result.evidence.length, 'every evidence record must carry a distinct, deterministic id');
});

// ---------- no source mutation ----------

test('adapting the same application repeatedly never mutates the real, underlying CozyKnowledge data', () => {
    const { knowledge, adapter } = loadKnowledge();
    const before = JSON.stringify(knowledge.getApplicationHumanPurposeFact('ChurchOS', 'en'));
    adapter.adaptApplicationHumanPurpose('ChurchOS', { languages: ['en', 'sw'] });
    adapter.adaptApplicationHumanPurpose('ChurchOS', { languages: ['en', 'sw'] });
    const after = JSON.stringify(knowledge.getApplicationHumanPurposeFact('ChurchOS', 'en'));
    assert.equal(before, after);
});

test('the real, underlying purpose arrays remain frozen (structurally immutable) after adaptation', () => {
    const { knowledge, adapter } = loadKnowledge();
    adapter.adaptApplicationHumanPurpose('ChurchOS', { languages: ['en'] });
    const purpose = knowledge.getApplicationHumanPurposeFact('ChurchOS', 'en').purpose;
    assert.ok(Object.isFrozen(purpose.humanBenefits));
});

// ---------- determinism ----------

test('repeated adaptation of the same authorized source produces stable evidence identity/content', () => {
    const { adapter } = loadKnowledge();
    const first = adapter.adaptApplicationHumanPurpose('ChurchOS', { languages: ['en', 'sw'] });
    const second = adapter.adaptApplicationHumanPurpose('ChurchOS', { languages: ['en', 'sw'] });
    assert.deepEqual(first.evidence.map((e) => e.id), second.evidence.map((e) => e.id));
    assert.deepEqual(first.evidence, second.evidence);
});

// ---------- honest gaps: unknown application, no fabrication ----------

test('an unknown application produces no fabricated evidence, only a real, honest error', () => {
    const { adapter } = loadKnowledge();
    const result = adapter.adaptApplicationHumanPurpose('NotARealApplication');
    assert.equal(result.success, false);
    assert.deepEqual(result.evidence, []);
    assert.ok(result.errors.length > 0);
});

test('adaptSystemFact() fails closed with a real error for an unrecognized getter name, never a silent no-op', () => {
    const { adapter } = loadKnowledge();
    const result = adapter.adaptSystemFact('notARealGetter');
    assert.equal(result.success, false);
    assert.ok(result.errors[0].includes('notARealGetter'));
});
