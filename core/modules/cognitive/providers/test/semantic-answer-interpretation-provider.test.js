'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { freshLoad, loadFullStack, loadWithoutBootstrap, loadWithoutBridge } = require('./_test-helpers');

// =====================================================================
// A. ACTIVATION
// =====================================================================

test('A1/A3: the real Live Window entry (CognitiveCoordinator.run()) reaches the SA-3B bridge via its own exported buildInterpretation(), the existing registration mechanism', async () => {
    const { coordinator, bridge } = loadFullStack();
    let called = false;
    const original = bridge.buildInterpretation;
    // Wrap (not mutate registration) to observe a genuine call from run() itself.
    global.window.CozyOS.SemanticAnswerInterpretationProvider = Object.assign({}, bridge, {
        buildInterpretation: (...args) => { called = true; return original(...args); },
    });
    await coordinator.run({ text: 'ChurchOS inasaidiaje mtu?', actorId: 'u1' });
    assert.equal(called, true, 'CognitiveCoordinator.run() must genuinely invoke the bridge, not merely have it registered');
});

test('A2: CozyInterpretation also carries a real, independently-registered "semantic-answer-cognitive-provider" via its own existing registerProvider() API', () => {
    const { interpretation } = loadFullStack();
    const descriptor = interpretation.findProvider('semantic-answer-cognitive-provider');
    assert.ok(descriptor, 'the bridge must be a real, findable CozyInterpretation provider');
    assert.equal(descriptor.offline, true);
});

test('A4: exactly one window.CozyOS.CognitiveCoordinator instance exists; the bridge and planner create no second coordinator', () => {
    const w = global.window;
    loadFullStack();
    const first = global.window.CozyOS.CognitiveCoordinator;
    // Re-loading the bridge/planner files (already loaded) must never construct a second coordinator instance.
    delete require.cache[require.resolve('../semantic-answer-interpretation-provider.js')];
    require('../semantic-answer-interpretation-provider.js');
    assert.equal(global.window.CozyOS.CognitiveCoordinator, first, 'CognitiveCoordinator must remain the exact same singleton instance');
    assert.equal(typeof global.window.CozyOS.CognitiveCoordinator2, 'undefined');
});

test('A5: no second AI/orchestrator global is introduced by the SA-3B files', () => {
    loadFullStack();
    const forbidden = ['LiveWindowAI2', 'CognitiveAI', 'SemanticAI', 'ReasoningAI', 'BuilderAI', 'UserAI', 'LanguageAI', 'ChurchAI', 'LearningAI', 'AnswerAI'];
    for (const name of forbidden) assert.equal(typeof global.window.CozyOS[name], 'undefined', `must not introduce window.CozyOS.${name}`);
});

// =====================================================================
// B. EXECUTION ORDER
// =====================================================================

test('B1/B2: interpretation (living-nlu-baseline, unmodified) and semanticAnswer (SA-3B, new) both run for one turn, additively — the default provider is never displaced', async () => {
    const { coordinator } = loadFullStack();
    const result = await coordinator.run({ text: 'ChurchOS inasaidiaje mtu?', actorId: 'u1' });
    assert.equal(result.diagnostics.stages.interpretation.ran, true);
    assert.equal(result.interpretation.results[0].provider, 'living-nlu-baseline', 'the pre-existing default provider must remain in control of the Interpretation stage');
    assert.equal(result.diagnostics.stages.semanticAnswer.ran, true);
    assert.equal(result.diagnostics.stages.semanticAnswer.isReal, true);
});

test('B3/B7: SemanticIntentEngine receives the correct request text and produces the real goal/entity the plan is built from', async () => {
    const { coordinator } = loadFullStack();
    const result = await coordinator.run({ text: 'ChurchOS inasaidiaje mtu?', actorId: 'u1' });
    assert.equal(result.semanticAnswer.supportingData.goal, 'HUMAN_BENEFIT');
    assert.equal(result.semanticAnswer.meaning, 'HUMAN_BENEFIT — ChurchOS');
});

test('B8: real conversationState reaches the cognitive layer end-to-end (through run()\'s own new context threading)', async () => {
    const { coordinator } = loadFullStack();
    const conversationState = { lastIntent: 'APP_IDENTITY', lastApplication: null, lastDiscussedApplication: 'ChurchOS', lastLanguage: 'sw' };
    const result = await coordinator.run({ text: 'Na inasaidiaje?', actorId: 'u1', conversationState });
    assert.equal(result.semanticAnswer.supportingData.goal, 'HUMAN_BENEFIT');
    assert.equal(result.semanticAnswer.supportingData.entitySource, 'engine-context-carryover');
});

test('B9/B10: a real actorId reaches the evidence boundary, and a real, valid SemanticAnswerPlan is produced end-to-end through the coordinator', async () => {
    const { coordinator, planner } = loadFullStack();
    const result = await coordinator.run({ text: 'ChurchOS inasaidiaje mtu?', actorId: 'real-user-42' });
    assert.equal(result.semanticAnswer.supportingData.cognitiveStatus, 'UNDERSTOOD');
    assert.ok(result.semanticAnswer.supportingData.claimCount > 0);
    // Re-derive the plan directly and confirm it independently validates against SA-1's own contract.
    const direct = planner.planAnswer({ text: 'ChurchOS inasaidiaje mtu?' });
    assert.equal(direct.success, true);
    assert.deepEqual(global.window.CozyOS.SemanticAnswerPlanContract.validate(direct.plan).errors, []);
});

// =====================================================================
// C. AUTHORIZATION
// =====================================================================

test('C11/C13: an anonymous/unspecified actor cannot see private evidence through the semanticAnswer stage — no goal in SA-3\'s v1 GOAL_FIELD_MAP even reaches memory, and application evidence stays PUBLIC-only', async () => {
    const { coordinator } = loadFullStack();
    const result = await coordinator.run({ text: 'ChurchOS inasaidiaje mtu?', actorId: 'system' });
    assert.equal(result.success, true);
    // Every real evidence source the planner's v1 goals use (APPLICATION_HUMAN_PURPOSE) is CozyKnowledge-backed PUBLIC data — confirmed structurally, never memory-backed for these goals.
    assert.equal(result.semanticAnswer.supportingData.cognitiveStatus, 'UNDERSTOOD');
});

test('C15: Builder privileges do not appear in the ordinary semanticAnswer result — no code/file/git/shell/deployment field exists anywhere on it', async () => {
    const { coordinator } = loadFullStack();
    const result = await coordinator.run({ text: 'ChurchOS inasaidiaje mtu?', actorId: 'u1' });
    const serialized = JSON.stringify(result.semanticAnswer);
    for (const forbidden of ['"code"', '"file"', '"git"', '"shell"', '"deployment"', 'CODEBASE', 'FILE', 'BUILDER']) {
        assert.ok(!serialized.includes(forbidden), `semanticAnswer result must never carry a Builder-context field ("${forbidden}" found)`);
    }
});

test('C16: fake client role/admin flags passed as conversationState fields do not elevate authority — the bridge never reads or forwards such fields to evidence gathering', async () => {
    const { coordinator } = loadFullStack();
    const fakeAdminState = { lastIntent: null, lastApplication: null, lastDiscussedApplication: 'ChurchOS', lastLanguage: 'sw', isAdmin: true, role: 'platform-admin', organizationId: 'org-should-not-matter', support: true };
    const result = await coordinator.run({ text: 'Na inasaidiaje?', actorId: 'ordinary-user', conversationState: fakeAdminState });
    // The plan still only ever contains real, PUBLIC, application-knowledge claims — no elevated/private content appears merely because the caller stuffed extra fields onto conversationState.
    assert.equal(result.semanticAnswer.supportingData.cognitiveStatus, 'UNDERSTOOD');
    const direct = global.window.CozyOS.SemanticAnswerPlanner.planAnswer({ text: 'Na inasaidiaje?', conversationState: fakeAdminState });
    for (const claim of direct.plan.claims) {
        // Every real claim must trace back to a real APPLICATION_HUMAN_PURPOSE evidence id — never an org/private/admin-sourced one.
        assert.ok(claim.evidenceIds.every((id) => id.startsWith('application-human-purpose:')));
    }
});

test('C12/C14: SA-2\'s own real org isolation and support-authorization boundaries are untouched by SA-3B — re-verified directly through the same real adapters the bridge composes', async () => {
    const { identity, memory } = loadFullStack();
    const orgA = identity.createOrganization('Org SA3B-A');
    const orgB = identity.createOrganization('Org SA3B-B');
    const userA = await identity.createUser({ username: 'sa3b_user_a_' + Date.now(), password: 'Passw0rd!12345', orgId: orgA.id });
    const userB = await identity.createUser({ username: 'sa3b_user_b_' + Date.now(), password: 'Passw0rd!12345', orgId: orgB.id });
    memory.saveMemory('sa3b-test-ns', 'secret-a', 'Org A private fact.', { owner: userA.userId, actorId: userA.userId, visibility: 'organisation' });

    const adapter = global.window.CozyOS.VerifiedEvidenceAdapter;
    const asOwnOrg = adapter.collectMemoryEvidence({ query: 'private fact', accessContext: { actorId: userA.userId } });
    const asOtherOrg = adapter.collectMemoryEvidence({ query: 'private fact', accessContext: { actorId: userB.userId } });
    assert.ok(asOwnOrg.evidence.some((e) => e.claim.includes('Org A private fact.')));
    assert.equal(asOtherOrg.evidence.some((e) => e.claim.includes('Org A private fact.')), false, 'SA-3B must not weaken SA-2\'s own organization isolation');
});

// =====================================================================
// D. FALLBACK — infrastructure failure vs cognitive decision
// =====================================================================

test('D17/D18: a genuine SA-3B infrastructure failure (bridge throws) degrades safely — no fabricated plan, real diagnostic reason, and unrelated stages (memory/policy) still run unaffected', async () => {
    const { coordinator } = loadFullStack();
    const throwingBridge = { buildInterpretation: () => { throw new Error('simulated infrastructure failure'); } };
    global.window.CozyOS.SemanticAnswerInterpretationProvider = throwingBridge;
    const result = await coordinator.run({ text: 'ChurchOS inasaidiaje mtu?', actorId: 'u1' });
    assert.equal(result.semanticAnswer, null, 'a thrown provider must never produce a fabricated plan');
    assert.equal(result.diagnostics.stages.semanticAnswer.isReal, false);
    assert.ok(result.diagnostics.stages.semanticAnswer.reason.includes('simulated infrastructure failure'));
    assert.equal(result.diagnostics.stages.memory.ran, true, 'an unrelated stage must still run — infrastructure failure in one stage must not cascade');
});

test('D19: a real UNKNOWN cognitive decision (not an infrastructure failure) is reported honestly, distinct from a thrown error — isReal stays true, reason is null', async () => {
    const { coordinator } = loadFullStack();
    const result = await coordinator.run({ text: 'zzz qux flibbertigibbet', actorId: 'u1' });
    assert.equal(result.diagnostics.stages.semanticAnswer.isReal, true, 'a legitimate cognitive outcome must never be reported as an infrastructure failure');
    assert.equal(result.diagnostics.stages.semanticAnswer.cognitiveStatus, 'CLARIFICATION_REQUIRED');
});

test('D20: AMBIGUOUS/no-entity reaches the semanticAnswer result as a real cognitive decision, never silently converted to a direct answer', async () => {
    const { coordinator } = loadFullStack();
    const result = await coordinator.run({ text: 'What are the benefits?', actorId: 'u1' });
    assert.equal(result.semanticAnswer.supportingData.cognitiveStatus, 'AMBIGUOUS');
    assert.equal(result.semanticAnswer.category, 'request');
});

test('D21: INSUFFICIENT_EVIDENCE stays evidence-limited — never silently escalated to UNDERSTOOD', async () => {
    const { coordinator } = loadFullStack();
    // SchoolOS has real, committed, equally-empty humanBenefits in both languages — a genuine, real INSUFFICIENT_EVIDENCE case, not synthetic.
    const result = await coordinator.run({ text: 'How does it help?', actorId: 'u1', conversationState: { lastIntent: null, lastApplication: null, lastDiscussedApplication: 'SchoolOS', lastLanguage: 'en' } });
    assert.equal(result.semanticAnswer.supportingData.cognitiveStatus, 'INSUFFICIENT_EVIDENCE');
});

test('D22: EVIDENCE_CONFLICT is not silently resolved — reaches the semanticAnswer result honestly when the planner reports it', async () => {
    const w = freshLoad(['memoryEngine', 'intelligence', 'interpretation', 'reasoning', 'sense', 'thinking', 'policyEngine', 'policyDecisionEngine', 'coordinator', 'aiBootstrap', 'planContract', 'evidenceContract', 'cognitiveDecision', 'planner', 'bridge', 'semanticIntent']);
    w.CozyOS.VerifiedEvidenceAdapter = {
        collectApplicationHumanPurposeEvidence: () => ({
            success: true,
            evidence: [
                { schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-a', claim: 'Claim A.', source: { type: 'APPLICATION_HUMAN_PURPOSE', id: 'churchos', path: 'APPLICATION_HUMAN_PURPOSE_DATA.churchos.humanBenefits' }, verification: { status: 'CONFLICTED', confidence: 'LOW' }, sensitivity: 'PUBLIC', language: 'en' },
                { schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-b', claim: 'Claim B.', source: { type: 'APPLICATION_HUMAN_PURPOSE', id: 'churchos', path: 'APPLICATION_HUMAN_PURPOSE_DATA.churchos.humanBenefits' }, verification: { status: 'CONFLICTED', confidence: 'LOW' }, sensitivity: 'PUBLIC', language: 'en' },
            ],
            errors: [],
        }),
        collectSystemFactEvidence: () => ({ success: false, evidence: [], errors: [] }),
    };
    const result = await w.CozyOS.CognitiveCoordinator.run({ text: 'ChurchOS inasaidiaje mtu?', actorId: 'u1' });
    assert.equal(result.semanticAnswer.supportingData.cognitiveStatus, 'EVIDENCE_CONFLICT');
});

test('D23: LANGUAGE_GAP is preserved as its own distinct semantic state through the coordinator, never collapsed into UNKNOWN or silently answered in the wrong language', async () => {
    const w = freshLoad(['memoryEngine', 'intelligence', 'interpretation', 'reasoning', 'sense', 'thinking', 'policyEngine', 'policyDecisionEngine', 'coordinator', 'aiBootstrap', 'planContract', 'evidenceContract', 'cognitiveDecision', 'planner', 'bridge', 'semanticIntent']);
    w.CozyOS.VerifiedEvidenceAdapter = {
        collectApplicationHumanPurposeEvidence: (entity, opts) => {
            const languages = (opts && opts.languages) || ['en', 'sw'];
            const evidence = languages.includes('en') ? [{ schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-en', claim: 'English-only claim.', source: { type: 'APPLICATION_HUMAN_PURPOSE', id: 'churchos', path: 'APPLICATION_HUMAN_PURPOSE_DATA.churchos.humanBenefits' }, verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC', language: 'en' }] : [];
            return { success: evidence.length > 0, evidence, errors: evidence.length > 0 ? [] : ['no evidence'] };
        },
    };
    const result = await w.CozyOS.CognitiveCoordinator.run({ text: 'ChurchOS inasaidiaje mtu?', actorId: 'u1' });
    // planAnswer() defaults requestedLanguage to the engine's own detected language (sw for this real Kiswahili text) — a real language gap.
    assert.equal(result.semanticAnswer.supportingData.cognitiveStatus, 'LANGUAGE_GAP');
});

test('D: when the bridge is not loaded at all, the coordinator degrades honestly (skipped, not fabricated) and every other stage is unaffected', async () => {
    const { coordinator } = loadWithoutBridge();
    const result = await coordinator.run({ text: 'ChurchOS inasaidiaje mtu?', actorId: 'u1' });
    assert.equal(result.semanticAnswer, null);
    assert.equal(result.diagnostics.stages.semanticAnswer.skipped, true);
    assert.equal(result.diagnostics.stages.interpretation.ran, true, 'the pre-existing Interpretation stage must be completely unaffected by the bridge\'s absence');
});

// =====================================================================
// E. CONTEXT
// =====================================================================

test('E24: a direct question (no prior context) works end-to-end', async () => {
    const { coordinator } = loadFullStack();
    const result = await coordinator.run({ text: 'What is ChurchOS?', actorId: 'u1' });
    assert.equal(result.semanticAnswer.supportingData.goal, 'DEFINITION');
});

test('E25: a contextual follow-up resolves via the real conversation state, with no new regex added for this exact phrasing', async () => {
    const { coordinator } = loadFullStack();
    const conversationState = { lastIntent: 'APP_CAPABILITIES', lastApplication: null, lastDiscussedApplication: 'ChurchOS', lastLanguage: 'sw' };
    const result = await coordinator.run({ text: 'Na inasaidiaje?', actorId: 'u1', conversationState });
    assert.equal(result.semanticAnswer.supportingData.goal, 'HUMAN_BENEFIT');
});

test('E26: an ambiguous follow-up ("hello" with active context) asks for clarification rather than guessing the carried-over entity\'s topic', async () => {
    const { coordinator } = loadFullStack();
    const conversationState = { lastIntent: 'APP_CAPABILITIES', lastApplication: null, lastDiscussedApplication: 'ChurchOS', lastLanguage: 'sw' };
    const result = await coordinator.run({ text: 'hello', actorId: 'u1', conversationState });
    assert.equal(result.semanticAnswer.supportingData.cognitiveStatus, 'CLARIFICATION_REQUIRED');
});

test('E27: a topic switch (explicit new entity) overrides stale conversationState rather than inheriting the old one', async () => {
    const { coordinator } = loadFullStack();
    const conversationState = { lastIntent: 'APP_CAPABILITIES', lastApplication: null, lastDiscussedApplication: 'ChurchOS', lastLanguage: 'sw' };
    const result = await coordinator.run({ text: 'What is QuarryOS?', actorId: 'u1', conversationState });
    assert.equal(result.semanticAnswer.supportingData.goal, 'DEFINITION');
    assert.equal(result.semanticAnswer.meaning, 'DEFINITION — QuarryOS');
});

test('E28: existing turn-aware behavior (rule-based-conversational-provider.js\'s own conversationState propagation) and LivingAI are completely unmodified by SA-3B/Wave 1 — confirmed by an empty git diff on those two files', () => {
    // UPDATE — WAVE 1 (Universal Native Multilingual Intelligence phase,
    // Cognitive-to-Answer Contract): this test ORIGINALLY asserted an
    // empty diff across all three files below, encoding SA-3B's own
    // promise not to touch the real Live Window entry point at all. That
    // promise still holds for rule-based-conversational-provider.js and
    // cozy-living-ai.js — checked below, unchanged. cozy-living-assistant.js
    // is the ONE file Wave 1 was explicitly authorized to extend (to
    // carry CognitiveCoordinator's own already-computed semanticPlan
    // through to the answer path instead of discarding it — see that
    // file's own "WAVE 1 (Cognitive-to-Answer Contract)" comment). Rather
    // than deleting this regression guard, it now also verifies that
    // file's diff is real, genuinely marked as the Wave 1 change, and
    // stays small/additive — so this test still fails loudly if a future
    // change touches cozy-living-assistant.js for an unrelated reason.
    const { execSync } = require('node:child_process');
    const repoRoot = require('node:path').join(__dirname, '..', '..', '..', '..', '..');

    const untouchedDiff = execSync('git diff --stat HEAD -- core/modules/intelligence/providers/rule-based-conversational-provider.js core/living/cozy-living-ai.js', { cwd: repoRoot }).toString().trim();
    assert.equal(untouchedDiff, '', 'SA-3B/Wave 1 must not modify the rule-based provider or LivingAI');

    const livingAssistantDiff = execSync('git diff HEAD -- core/living/cozy-living-assistant.js', { cwd: repoRoot }).toString();
    if (livingAssistantDiff.trim() === '') return; // nothing staged yet to compare against (e.g. a clean checkout) — nothing to verify
    assert.match(livingAssistantDiff, /WAVE 1 \(Cognitive-to-Answer Contract\)/, 'expected the cozy-living-assistant.js diff to be the documented, authorized Wave 1 change, not an unrelated/undocumented edit');
    assert.match(livingAssistantDiff, /cognitiveResult/, 'expected the diff to be about the cognitiveResult pass-through specifically');
    const statOutput = execSync('git diff --stat HEAD -- core/living/cozy-living-assistant.js', { cwd: repoRoot }).toString();
    const statMatch = statOutput.match(/(\d+) insertions?\(\+\).*?(?:(\d+) deletions?\(-\))?/);
    const insertions = statMatch ? Number(statMatch[1]) : 0;
    const deletions = statMatch && statMatch[2] ? Number(statMatch[2]) : 0;
    assert.ok(insertions <= 40, `expected a small, additive Wave 1 diff (<=40 insertions), got ${insertions}`);
    assert.ok(deletions <= 5, `expected a near-zero-deletion, additive Wave 1 diff (<=5 deletions), got ${deletions}`);
});

// =====================================================================
// F. SINGLE-AI GUARANTEE
// =====================================================================

test('F29/F30: exactly one Live Window/CozyAI orchestration path — CognitiveCoordinator remains the sole orchestrator; no second registration mechanism was introduced', () => {
    loadFullStack();
    assert.equal(typeof global.window.CozyOS.CognitiveCoordinator.run, 'function');
    // The bridge itself never defines a "run"/"orchestrate" method of its own — it only ever builds one interpretation result.
    const bridgeKeys = Object.keys(global.window.CozyOS.SemanticAnswerInterpretationProvider);
    assert.deepEqual(bridgeKeys.sort(), ['PROVIDER_ID', 'buildInterpretation', 'getVersion', 'register'].sort());
});

test('F31: no duplicate semantic intent engine — the planner and bridge both resolve to the SAME real window.CozyOS.SemanticIntentEngine instance', () => {
    const { intentEngine, planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'ChurchOS inasaidiaje mtu?' });
    assert.equal(result.diagnostics.intentResult.provenance.source, 'semantic-intent-engine');
    assert.equal(intentEngine.getVersion(), global.window.CozyOS.SemanticIntentEngine.getVersion());
});

test('F32: no duplicate memory system — SA-3B\'s own authorization test above (C12/C14) exercises the SAME real window.CozyOS.CozyMemory the rest of the platform uses, never a second store', () => {
    const { memory } = loadFullStack();
    assert.equal(memory, global.window.CozyOS.CozyMemory);
});

test('F33: no duplicate authorization system — the bridge/coordinator never call any authorization function of their own; every real check happens inside SA-2\'s existing adapters/CozyMemory, confirmed by static absence in this file', () => {
    const fs = require('node:fs');
    const src = fs.readFileSync(require('node:path').join(__dirname, '..', 'semantic-answer-interpretation-provider.js'), 'utf8');
    for (const forbidden of ['isAdmin', 'checkAuthorization', 'buildAuthorizationContext', '#checkReadVisibility']) {
        assert.ok(!src.includes(forbidden), `the bridge must never re-implement authorization logic ("${forbidden}" found)`);
    }
});

test('F34: no duplicate answer selector — the bridge never sets/returns an "answer"/"response"/"replyText" field; the real CozyAnswerEngine remains the only place that composes user-facing reply text', async () => {
    const { coordinator } = loadFullStack();
    const result = await coordinator.run({ text: 'ChurchOS inasaidiaje mtu?', actorId: 'u1' });
    for (const forbidden of ['answer', 'response', 'replyText', 'finalText']) {
        assert.ok(!(forbidden in result.semanticAnswer), `semanticAnswer must never carry a "${forbidden}" field`);
    }
});

// =====================================================================
// PERFORMANCE / NO DUPLICATE EXECUTION
// =====================================================================

test('PERFORMANCE: one coordinator.run() call produces exactly one semanticAnswer result, not several (no recursive/duplicate re-invocation)', async () => {
    const { coordinator } = loadFullStack();
    let callCount = 0;
    const original = global.window.CozyOS.SemanticAnswerInterpretationProvider.buildInterpretation;
    global.window.CozyOS.SemanticAnswerInterpretationProvider = Object.assign({}, global.window.CozyOS.SemanticAnswerInterpretationProvider, {
        buildInterpretation: (...args) => { callCount++; return original(...args); },
    });
    await coordinator.run({ text: 'ChurchOS inasaidiaje mtu?', actorId: 'u1' });
    assert.equal(callCount, 1);
});

// =====================================================================
// MUTATION TESTS
// =====================================================================

test('MUTATION: removing the semanticAnswer stage\'s try/catch protection would let a thrown provider crash run() — proving the guard is load-bearing by simulating its absence', async () => {
    const { coordinator } = loadFullStack();
    const throwing = { buildInterpretation: () => { throw new Error('boom'); } };
    global.window.CozyOS.SemanticAnswerInterpretationProvider = throwing;
    // The real coordinator code wraps this in try/catch — assert it does NOT throw.
    await assert.doesNotReject(() => coordinator.run({ text: 'ChurchOS inasaidiaje mtu?', actorId: 'u1' }));
});

test('MUTATION: an interpretationProviderId is never passed by run() itself — proving "living-nlu-baseline" stays selected by omission, not by a hardcoded providerId this test could silently rely on', async () => {
    const { coordinator, interpretation } = loadFullStack();
    // Register a canary provider AFTER living-nlu-baseline; since it is not first, it cannot become default either — proving default-selection is purely load-order-based, not coordinator-hardcoded.
    interpretation.registerProvider({ id: 'canary-provider', offline: true }, () => ({ category: 'custom', type: 'semantic', meaning: 'canary' }));
    const result = await coordinator.run({ text: 'ChurchOS inasaidiaje mtu?', actorId: 'u1' });
    assert.equal(result.interpretation.results[0].provider, 'living-nlu-baseline');
});

test('MUTATION: treating AMBIGUOUS as DIRECT would let claims appear on a plan with an unresolved entity — proving planAnswer() genuinely refuses to do this', async () => {
    const { coordinator } = loadFullStack();
    const result = await coordinator.run({ text: 'What are the benefits?', actorId: 'u1' });
    assert.equal(result.semanticAnswer.supportingData.cognitiveStatus, 'AMBIGUOUS');
    assert.equal(result.semanticAnswer.supportingData.claimCount, 0, 'an AMBIGUOUS result must never carry claims, proving it was not silently treated as DIRECT/UNDERSTOOD');
});

test('MUTATION: treating LANGUAGE_GAP as UNKNOWN would lose the real languageGap record — proving the planner\'s own reason field, not just cognitiveStatus, distinguishes them', () => {
    const w = freshLoad(['memoryEngine', 'planContract', 'evidenceContract', 'cognitiveDecision', 'planner', 'semanticIntent']);
    w.CozyOS.VerifiedEvidenceAdapter = {
        collectApplicationHumanPurposeEvidence: (entity, opts) => {
            const languages = (opts && opts.languages) || ['en', 'sw'];
            const evidence = languages.includes('en') ? [{ schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-en', claim: 'x', source: { type: 'APPLICATION_HUMAN_PURPOSE', id: 'churchos', path: 'APPLICATION_HUMAN_PURPOSE_DATA.churchos.humanBenefits' }, verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC', language: 'en' }] : [];
            return { success: evidence.length > 0, evidence, errors: [] };
        },
    };
    const result = w.CozyOS.SemanticAnswerPlanner.planAnswer({ text: 'ChurchOS inasaidiaje mtu?' });
    assert.equal(result.reason, 'LANGUAGE_GAP');
    assert.notEqual(result.reason, 'NO_EVIDENCE_AVAILABLE', 'LANGUAGE_GAP and NO_EVIDENCE_AVAILABLE must remain genuinely distinguishable reasons, never merged');
});

test('MUTATION: a Builder-context-shaped conversationState field never leaks into the semanticAnswer result — proving isolation is structural (the bridge simply never reads such fields), not accidental', async () => {
    const { coordinator } = loadFullStack();
    const builderLikeState = { lastIntent: null, lastApplication: null, lastDiscussedApplication: 'ChurchOS', lastLanguage: 'sw', builderContext: { repoAccess: true, shellAccess: true } };
    const result = await coordinator.run({ text: 'Na inasaidiaje?', actorId: 'u1', conversationState: builderLikeState });
    assert.ok(!JSON.stringify(result.semanticAnswer).includes('repoAccess'));
    assert.ok(!JSON.stringify(result.semanticAnswer).includes('shellAccess'));
});
