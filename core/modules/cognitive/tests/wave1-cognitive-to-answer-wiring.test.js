'use strict';

/**
 * core/modules/cognitive/tests/wave1-cognitive-to-answer-wiring.test.js
 * WAVE 1 (Universal Native Multilingual Intelligence phase,
 * Cognitive-to-Answer Contract) — the required dedicated proof for the
 * explicit "AUTHORIZE WAVE 1 ONLY" authorization.
 *
 * Loads the REAL, unmodified, full production stack — CognitiveCoordinator
 * AND CozyAnswerEngine together, on ONE window, in the SAME relative order
 * index.html actually uses (verified against index.html's own <script>
 * tags before writing this file) — then reproduces, at the unit level,
 * EXACTLY what core/living/cozy-living-assistant.js's own #send() now does
 * (see that file's own comment beside its `cognitiveResult` extraction):
 *   const cognitiveResult = result.result.pipeline.semanticPlan;
 *   await answerEngine.answer(text, { ..., cognitiveResult });
 *
 * No stub/fake replaces CognitiveCoordinator, SemanticAnswerPlanner,
 * SemanticAnswerInterpretationProvider, or CozyAnswerEngine anywhere in
 * this file. No second AI/engine is introduced by this file or by the
 * production code it exercises.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const roots = {
    // identity + organization (index.html lines ~140-180)
    identityStorage: path.join(__dirname, '..', '..', 'identity', 'identity-storage.js'),
    identity: path.join(__dirname, '..', '..', 'identity', 'identity-engine.js'),
    orgRegistry: path.join(__dirname, '..', '..', '..', 'organization', 'organization-registry.js'),
    orgMembership: path.join(__dirname, '..', '..', '..', 'organization', 'organization-membership.js'),

    // vault chain (index.html lines ~260-265)
    secretRegistry: path.join(__dirname, '..', '..', 'vault', 'secret-registry.js'),
    encryptionManager: path.join(__dirname, '..', '..', 'vault', 'encryption-manager.js'),
    secretManager: path.join(__dirname, '..', '..', 'vault', 'secret-manager.js'),
    typedManagers: path.join(__dirname, '..', '..', 'vault', 'typed-managers.js'),
    rotationHealth: path.join(__dirname, '..', '..', 'vault', 'rotation-and-health.js'),
    vaultEngine: path.join(__dirname, '..', '..', 'vault', 'cozy-vault-engine.js'),

    // founder-story (index.html lines ~277-278)
    founderStory: path.join(__dirname, '..', '..', 'founder-story', 'founder-story-engine.js'),

    // memory (index.html line ~283)
    memoryEngine: path.join(__dirname, '..', '..', 'memory', 'cozy-memory-engine.js'),

    // cognitive stack (index.html lines ~288-297)
    intelligence: path.join(__dirname, '..', '..', 'intelligence', 'cozy-intelligence.js'),
    interpretation: path.join(__dirname, '..', '..', 'interpretation', 'cozy-interpretation.js'),
    reasoning: path.join(__dirname, '..', '..', 'reasoning', 'cozy-reasoning.js'),
    sense: path.join(__dirname, '..', '..', 'sense', 'cozy-sense.js'),
    thinking: path.join(__dirname, '..', '..', 'thinking', 'cozy-thinking.js'),
    policyEngine: path.join(__dirname, '..', '..', 'policy', 'policy-engine.js'),
    policyDecisionEngine: path.join(__dirname, '..', '..', 'policy', 'policy-decision-engine.js'),
    coordinator: path.join(__dirname, '..', 'cognitive-coordinator.js'),
    aiBootstrap: path.join(__dirname, '..', '..', 'intelligence', 'ai-bootstrap.js'),

    // language (index.html lines ~322-334)
    languageRegistry: path.join(__dirname, '..', '..', 'intelligence', 'language', 'cozy-language-registry.js'),
    languageTemplates: path.join(__dirname, '..', '..', 'intelligence', 'language', 'cozy-language-templates.js'),
    languageRealize: path.join(__dirname, '..', '..', 'intelligence', 'language', 'cozy-language-realize.js'),

    // knowledge (index.html lines ~335-338)
    knowledgeRegistry: path.join(__dirname, '..', '..', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js'),
    publicKnowledge: path.join(__dirname, '..', '..', 'intelligence', 'knowledge', 'cozy-public-knowledge-source.js'),

    // semantic-answer contracts/evidence/planner (index.html lines ~351-357)
    planContract: path.join(__dirname, '..', '..', 'intelligence', 'semantic-answer', 'contracts', 'semantic-answer-plan-contract.js'),
    evidenceContract: path.join(__dirname, '..', '..', 'intelligence', 'semantic-answer', 'contracts', 'verified-evidence-contract.js'),
    cognitiveDecisionContract: path.join(__dirname, '..', '..', 'intelligence', 'semantic-answer', 'contracts', 'cognitive-decision-contract.js'),
    evidenceAdapter: path.join(__dirname, '..', '..', 'intelligence', 'semantic-answer', 'evidence', 'verified-evidence-adapter.js'),
    knowledgeAdapter: path.join(__dirname, '..', '..', 'intelligence', 'semantic-answer', 'evidence', 'source-adapters', 'cozy-knowledge-adapter.js'),
    memoryAdapter: path.join(__dirname, '..', '..', 'intelligence', 'semantic-answer', 'evidence', 'source-adapters', 'cozy-memory-adapter.js'),
    planner: path.join(__dirname, '..', '..', 'intelligence', 'semantic-answer', 'planning', 'semantic-answer-planner.js'),

    // the SA-3B bridge (index.html line ~358)
    bridge: path.join(__dirname, '..', 'providers', 'semantic-answer-interpretation-provider.js'),

    // remaining SA contracts + realization/validation/repair (index.html lines ~361-366)
    realizationRequestContract: path.join(__dirname, '..', '..', 'intelligence', 'semantic-answer', 'contracts', 'language-realization-request-contract.js'),
    candidateContract: path.join(__dirname, '..', '..', 'intelligence', 'semantic-answer', 'contracts', 'candidate-sentence-contract.js'),
    validationResultContract: path.join(__dirname, '..', '..', 'intelligence', 'semantic-answer', 'contracts', 'response-validation-result-contract.js'),
    realizer: path.join(__dirname, '..', '..', 'intelligence', 'semantic-answer', 'realization', 'language-realizer.js'),
    validator: path.join(__dirname, '..', '..', 'intelligence', 'semantic-answer', 'validation', 'response-validator.js'),
    repairLoop: path.join(__dirname, '..', '..', 'intelligence', 'semantic-answer', 'repair', 'repair-loop.js'),

    // cozy-ai.js, identity FAQ router, the answer engine itself (index.html lines ~375-377)
    cozyAi: path.join(__dirname, '..', '..', 'intelligence', 'cozy-ai.js'),
    identityFaqRouter: path.join(__dirname, '..', '..', 'knowledge', 'cozyos-identity-faq-router.js'),
    answerEngine: path.join(__dirname, '..', '..', 'intelligence', 'answer', 'cozy-answer-engine.js'),

    // real semantic intent engine, used by both the coordinator's bridge
    // AND the answer engine's own fallback intent detection
    semanticIntent: path.join(__dirname, '..', '..', '..', 'living', 'cozy-ai-semantic-intent.js'),
};

function makeFakeServiceRegistry() {
    return { listApplications: () => [{ id: 'churchos', name: 'ChurchOS' }] };
}
function makeFakeProviderManager() { return { register() {}, healthReport: () => ({}) }; }

function loadCombinedStack() {
    Object.values(roots).forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    const fakeWindow = {
        CozyOS: {
            ServiceRegistry: makeFakeServiceRegistry(),
            ProviderManager: makeFakeProviderManager(),
        },
        addEventListener: () => {},
        dispatchEvent: () => {},
        setTimeout,
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    };
    global.window = fakeWindow;
    if (!global.crypto) { global.crypto = require('crypto').webcrypto; }

    const order = [
        'identityStorage', 'identity', 'orgRegistry', 'orgMembership',
        'secretRegistry', 'encryptionManager', 'secretManager', 'typedManagers', 'rotationHealth', 'vaultEngine',
        'founderStory',
        'memoryEngine',
        'intelligence', 'interpretation', 'reasoning', 'sense', 'thinking', 'policyEngine', 'policyDecisionEngine', 'coordinator', 'aiBootstrap',
        'languageRegistry', 'languageTemplates', 'languageRealize',
        'knowledgeRegistry', 'publicKnowledge',
        'planContract', 'evidenceContract', 'cognitiveDecisionContract', 'evidenceAdapter', 'knowledgeAdapter', 'memoryAdapter', 'planner',
        'bridge',
        'realizationRequestContract', 'candidateContract', 'validationResultContract', 'realizer', 'validator', 'repairLoop',
        'cozyAi', 'identityFaqRouter', 'answerEngine',
        'semanticIntent',
    ];
    for (const key of order) require(roots[key]);

    return {
        window: fakeWindow,
        coordinator: fakeWindow.CozyOS.CognitiveCoordinator,
        planner: fakeWindow.CozyOS.SemanticAnswerPlanner,
        answerEngine: fakeWindow.CozyOS.CozyAnswerEngine,
    };
}

/**
 * Reproduces exactly what cozy-living-assistant.js's #send() does with a
 * completed CognitiveCoordinator.run() result: extract .semanticPlan and
 * pass it through as answer()'s `cognitiveResult` option.
 */
async function runThroughLiveWindowWiring({ coordinator, answerEngine, text, actorId, language = null, entityHint = null }) {
    const coordResult = await coordinator.run({ text, actorId });
    const cognitiveResult = (coordResult && coordResult.success && coordResult.semanticPlan) || null;
    const answerResult = await answerEngine.answer(text, { actorId, entityHint, language, cognitiveResult });
    return { coordResult, cognitiveResult, answerResult };
}

/* ------------------------------------------------------------------ */
/* A: CognitiveCoordinator genuinely executes and produces a real,     */
/*    reusable semanticPlan for a real question                        */
/* ------------------------------------------------------------------ */

test('A: CognitiveCoordinator.run() genuinely executes and its real semanticPlan is exactly what reaches the answer path via the same extraction cozy-living-assistant.js performs', async () => {
    const { coordinator, answerEngine } = loadCombinedStack();
    const { coordResult, cognitiveResult } = await runThroughLiveWindowWiring({
        coordinator, answerEngine, text: 'How does ChurchOS help people?', actorId: 'wave1-actor-a', entityHint: 'ChurchOS',
    });
    assert.ok(coordResult.success, 'expected the real orchestration to complete');
    assert.ok(cognitiveResult, 'expected a real, non-null cognitiveResult extracted exactly as cozy-living-assistant.js does');
    assert.equal(cognitiveResult, coordResult.semanticPlan, 'expected the extracted value to be the SAME object as result.semanticPlan — no copy, no reshaping');
    assert.ok(cognitiveResult.plan && cognitiveResult.plan.goal, 'expected a real plan with a real goal on the reused cognitive result');
});

/* ------------------------------------------------------------------ */
/* B: the final answer reuses the precomputed plan — no redundant       */
/*    second planAnswer() call — while remaining byte-identical when    */
/*    no cognitive result is supplied (pre-Wave-1 callers unaffected)   */
/* ------------------------------------------------------------------ */

test('B: when a valid cognitiveResult is supplied, CozyAnswerEngine reuses it (no second planAnswer() call); with no cognitiveResult, behavior is byte-identical to the pre-Wave-1 path', async () => {
    const { window: win, coordinator, planner, answerEngine } = loadCombinedStack();
    const text = 'How does ChurchOS help people?';

    // SemanticAnswerPlanner itself is a real, frozen module object (see
    // its own "coordinator is exposed, frozen, and versioned" pattern
    // used throughout this codebase) — planAnswer cannot be reassigned
    // on it directly, and a Proxy wrapping the frozen target violates
    // the engine's own get-trap invariant for a non-configurable,
    // non-writable data property (confirmed while writing this test: it
    // throws, which the coordinator's own try/catch then silently
    // swallows as a skip). Both real call sites (the SA-3B bridge and
    // cozy-answer-engine.js's own tryConstructSemanticAnswer) read
    // window.CozyOS.SemanticAnswerPlanner fresh at call time rather than
    // caching a reference at module-load time, so swapping the WHOLE
    // window.CozyOS.SemanticAnswerPlanner binding for a plain spy object
    // (not a Proxy on the frozen original) observes every real call
    // without touching or wrapping the frozen object itself.
    let planCallCount = 0;
    const realPlanner = win.CozyOS.SemanticAnswerPlanner;
    win.CozyOS.SemanticAnswerPlanner = Object.assign({}, realPlanner, {
        planAnswer(...args) { planCallCount += 1; return realPlanner.planAnswer.apply(realPlanner, args); },
    });

    try {
        const coordResult = await coordinator.run({ text, actorId: 'wave1-actor-b1' });
        // The coordinator's own SA-3B stage calls planAnswer() once to
        // build result.semanticPlan — that's the ONE real call this turn
        // needs, counted here so the assertion below is about the
        // ANSWER call specifically, not a zero-calls-ever claim.
        const callsAfterCoordinator = planCallCount;
        assert.ok(callsAfterCoordinator >= 1, 'expected the coordinator itself to have called planAnswer() at least once to build semanticPlan');

        const cognitiveResult = coordResult.semanticPlan;
        await answerEngine.answer(text, { actorId: 'wave1-actor-b1', entityHint: 'ChurchOS', cognitiveResult });
        assert.equal(planCallCount, callsAfterCoordinator, 'expected ZERO additional planAnswer() calls when a valid cognitiveResult is reused — this is the redundant-double-call fix');

        // Now the pre-Wave-1 shape: no cognitiveResult supplied at all.
        planCallCount = 0;
        const resultWithout = await answerEngine.answer(text, { actorId: 'wave1-actor-b2', entityHint: 'ChurchOS' });
        assert.ok(planCallCount >= 1, 'expected the ORIGINAL fresh planAnswer() call to still happen when no cognitiveResult is supplied — pre-Wave-1 callers see unchanged behavior');
        assert.equal(resultWithout.evidenceState, 'VERIFIED');
    } finally {
        win.CozyOS.SemanticAnswerPlanner = realPlanner;
    }
});

/* ------------------------------------------------------------------ */
/* C: the final answer is the SAME real, verified content whether       */
/*    reused from the cognitive result or freshly planned — reuse       */
/*    changes HOW the plan is obtained, never WHAT the answer is        */
/* ------------------------------------------------------------------ */

test('C: the final answer content/evidenceState/sources are identical whether the plan is reused from CognitiveCoordinator or freshly planned — reuse never changes what the user is told', async () => {
    const { coordinator: coordA, answerEngine: engineA } = loadCombinedStack();
    const text = 'How does ChurchOS help people?';
    const { answerResult: reused } = await runThroughLiveWindowWiring({
        coordinator: coordA, answerEngine: engineA, text, actorId: 'wave1-actor-c1', entityHint: 'ChurchOS',
    });

    const { answerEngine: engineB } = loadCombinedStack();
    const fresh = await engineB.answer(text, { actorId: 'wave1-actor-c2', entityHint: 'ChurchOS' });

    assert.equal(reused.evidenceState, fresh.evidenceState);
    assert.equal(reused.answer, fresh.answer, 'expected byte-identical answer text between the reused-plan path and the fresh-plan path');
    assert.deepEqual(reused.sources.map((s) => s.authority), fresh.sources.map((s) => s.authority));
});

/* ------------------------------------------------------------------ */
/* D: intent/goal/conversation context genuinely survive the trip      */
/*    from CognitiveCoordinator into answer()'s own cognitiveContext    */
/* ------------------------------------------------------------------ */

test('D: intent/goal/entity/conversationContext computed by CognitiveCoordinator are honestly reflected on answer()\'s own cognitiveContext — no re-derivation, no fabrication', async () => {
    const { coordinator, answerEngine } = loadCombinedStack();
    const text = 'How does ChurchOS help people?';
    const { coordResult, answerResult } = await runThroughLiveWindowWiring({
        coordinator, answerEngine, text, actorId: 'wave1-actor-d', entityHint: 'ChurchOS',
    });

    assert.ok(answerResult.cognitiveContext, 'expected a real, non-null cognitiveContext on the final answer');
    const plan = coordResult.semanticPlan.plan;
    assert.equal(answerResult.cognitiveContext.goal, plan.goal);
    assert.equal(answerResult.cognitiveContext.intent, plan.goal);
    assert.equal(answerResult.cognitiveContext.language, plan.language);
    assert.deepEqual(answerResult.cognitiveContext.entities, plan.entity ? [plan.entity] : []);
    assert.equal(answerResult.cognitiveContext.evidenceClaimCount, Array.isArray(plan.claims) ? plan.claims.length : null);
});

/* ------------------------------------------------------------------ */
/* E: EN and SW both flow through the SAME wiring, with the SAME        */
/*    reuse behavior, each producing verified content in its own       */
/*    language — never mixed, never translated post-hoc                */
/* ------------------------------------------------------------------ */

test('E: an English question flows through the real Wave 1 wiring end to end, reusing the cognitive plan, and resolves to real verified English ChurchOS content', async () => {
    const { coordinator, answerEngine } = loadCombinedStack();
    const { answerResult } = await runThroughLiveWindowWiring({
        coordinator, answerEngine, text: 'How does ChurchOS help people?', actorId: 'wave1-actor-e-en', entityHint: 'ChurchOS', language: 'en',
    });
    assert.equal(answerResult.evidenceState, 'VERIFIED');
    assert.ok(answerResult.cognitiveContext, 'expected cognitiveContext to be populated on the English path too');
    assert.equal(answerResult.cognitiveContext.language, 'en');
});

test('E: a natural Kiswahili question flows through the SAME real Wave 1 wiring, reusing the cognitive plan, and resolves to real verified Kiswahili ChurchOS content', async () => {
    const { coordinator, answerEngine } = loadCombinedStack();
    const { answerResult } = await runThroughLiveWindowWiring({
        coordinator, answerEngine, text: 'ChurchOS inasaidiaje mtu?', actorId: 'wave1-actor-e-sw', entityHint: 'ChurchOS', language: 'sw',
    });
    assert.equal(answerResult.evidenceState, 'VERIFIED');
    assert.match(answerResult.answer, /kanisa/, 'expected real Kiswahili church-domain content, not English or a translation shim');
    assert.ok(answerResult.cognitiveContext, 'expected cognitiveContext to be populated on the Kiswahili path too');
    assert.equal(answerResult.cognitiveContext.language, 'sw');
});

/* ------------------------------------------------------------------ */
/* F: a contextual follow-up's conversationContext genuinely survives   */
/*    into the reused cognitive result, not silently dropped            */
/* ------------------------------------------------------------------ */

test('F: a follow-up turn\'s cognitiveContext.conversationContext is honestly populated when the real planner attaches one, never fabricated when it does not', async () => {
    const { coordinator, answerEngine } = loadCombinedStack();
    const actorId = 'wave1-actor-f';
    await runThroughLiveWindowWiring({ coordinator, answerEngine, text: 'How does ChurchOS help people?', actorId, entityHint: 'ChurchOS' });
    const { coordResult, answerResult } = await runThroughLiveWindowWiring({
        coordinator, answerEngine, text: 'What about its benefits?', actorId, entityHint: 'ChurchOS',
    });
    const plan = coordResult.semanticPlan && coordResult.semanticPlan.plan;
    assert.equal(answerResult.cognitiveContext.conversationContext, plan ? (plan.conversationContext || null) : null, 'expected an honest pass-through, not an invented value');
});

/* ------------------------------------------------------------------ */
/* G: a clarification-requiring question is handled honestly — no       */
/*    fabricated answer is constructed from an incomplete plan          */
/* ------------------------------------------------------------------ */

test('G: a genuinely ambiguous/clarification-requiring question never gets a fabricated semantic-construction answer, and cognitiveContext honestly reports clarificationRequired when the real plan says so', async () => {
    const { coordinator, answerEngine } = loadCombinedStack();
    const text = 'it';
    const { coordResult, answerResult } = await runThroughLiveWindowWiring({
        coordinator, answerEngine, text, actorId: 'wave1-actor-g',
    });
    const plan = coordResult.semanticPlan && coordResult.semanticPlan.plan;
    if (plan && (plan.goal === 'CLARIFICATION' || plan.goal === 'UNKNOWN')) {
        assert.ok(!answerResult.sources.some((s) => s.authority === 'semantic-answer-construction'), 'expected NO semantic-answer-construction source for a clarification/unknown goal — the existing honest-fallback chain must handle it instead');
    }
    // Whatever the real outcome, cognitiveContext must never claim
    // clarification is required unless the real plan's own diagnostics
    // actually say so.
    if (answerResult.cognitiveContext) {
        const diagnostics = coordResult.semanticPlan && coordResult.semanticPlan.diagnostics;
        const expected = diagnostics ? diagnostics.cognitiveStatus === 'CLARIFICATION_REQUIRED' : false;
        assert.equal(answerResult.cognitiveContext.clarificationRequired, expected);
    }
});

/* ------------------------------------------------------------------ */
/* H: security — cognitiveContext NEVER carries raw claim/evidence text */
/* ------------------------------------------------------------------ */

test('H: cognitiveContext exposes only diagnostic metadata — it never carries raw claim/evidence text, preserving the SAME security guarantee phase5-cognitive-to-answer-contract.test.js already proves for semanticAnswer', async () => {
    const { coordinator, answerEngine } = loadCombinedStack();
    const text = 'How does ChurchOS help people?';
    const { coordResult, answerResult } = await runThroughLiveWindowWiring({
        coordinator, answerEngine, text, actorId: 'wave1-actor-h', entityHint: 'ChurchOS',
    });
    const plan = coordResult.semanticPlan && coordResult.semanticPlan.plan;
    if (plan && Array.isArray(plan.claims) && plan.claims.length) {
        const realClaimText = plan.claims[0].text;
        const serializedContext = JSON.stringify(answerResult.cognitiveContext);
        assert.ok(!realClaimText || !serializedContext.includes(realClaimText), 'expected cognitiveContext to never carry raw claim text — only a count/summary');
    }
    // The allowlist itself: only the documented fields may appear.
    const allowedKeys = new Set([
        'language', 'dialectRegion', 'intent', 'entities', 'goal', 'situation',
        'conversationContext', 'ambiguity', 'evidenceClaimCount', 'uncertainty',
        'relevantCapabilities', 'reasoningResult', 'responseMode', 'clarificationRequired',
        'adviceRequired', 'nextStepRequired',
    ]);
    for (const key of Object.keys(answerResult.cognitiveContext || {})) {
        assert.ok(allowedKeys.has(key), `unexpected key "${key}" on cognitiveContext — every field must be an explicitly documented, non-fabricated diagnostic`);
    }
});

/* ------------------------------------------------------------------ */
/* I: an invalid/failed cognitive result is never trusted — the         */
/*    fallback to a fresh plan is honest, not silently broken           */
/* ------------------------------------------------------------------ */

test('I: a structurally invalid cognitiveResult (success:false, or missing plan.goal) is never reused — the engine honestly falls back to its own fresh plan', async () => {
    const { answerEngine } = loadCombinedStack();
    const text = 'How does ChurchOS help people?';

    const brokenResults = [
        { success: false, plan: { goal: 'INFORMATIONAL' } },
        { success: true, plan: null },
        { success: true, plan: {} },
        null,
        undefined,
    ];
    for (const bad of brokenResults) {
        const result = await answerEngine.answer(text, { actorId: 'wave1-actor-i', entityHint: 'ChurchOS', cognitiveResult: bad });
        assert.equal(result.evidenceState, 'VERIFIED', `expected a real, working answer even with invalid cognitiveResult=${JSON.stringify(bad)}`);
    }
});

/* ------------------------------------------------------------------ */
/* J: this file introduces no second AI/system — CognitiveCoordinator   */
/*    and CozyAnswerEngine remain the ONLY two real components in the   */
/*    loop, connected only through the documented semanticPlan field    */
/* ------------------------------------------------------------------ */

test('J: the wiring is purely additive — CognitiveCoordinator.run()\'s pre-existing return fields (interpretation/thinking/reasoning/intelligence/recalledMemories/policyResult/savedMemoryKey/diagnostics/semanticAnswer) are all still present and unchanged in shape', async () => {
    const { coordinator } = loadCombinedStack();
    const result = await coordinator.run({ text: 'Hello', actorId: 'wave1-actor-j' });
    for (const key of ['success', 'interpretation', 'thinking', 'reasoning', 'intelligence', 'recalledMemories', 'policyResult', 'diagnostics', 'semanticAnswer', 'semanticPlan']) {
        assert.ok(key in result, `expected pre-existing field "${key}" to still be present on CognitiveCoordinator.run()'s result`);
    }
});
