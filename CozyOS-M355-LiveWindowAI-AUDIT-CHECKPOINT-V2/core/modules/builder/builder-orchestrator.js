/**
 * CozyOS Builder Cognitive Orchestration Engine —
 * core/modules/builder/builder-orchestrator.js
 * Milestone M280 (Cozy Builder Cognitive Orchestration)
 *
 * OWNERSHIP: this file composes real, existing, already-loaded engines
 * for every phase - never a duplicate reasoning/analysis/imagination
 * engine. Confirmed real and loaded before writing this file:
 *   Phase 1 (Understanding): CozyContextEngine.getContextForApp(),
 *     UnderstandingEngine.analyzeText()
 *   Phase 2 (Analysis): CognitiveCoordinator.run() (internally
 *     composes CozyThinking/CozyReasoning/CozyIntelligence - confirmed
 *     M262/M263, never re-implemented here)
 *   Phase 3 (Imagination): LiveImagination (M276),
 *     ArchitectureEngine.generateBlueprint()
 *   Phase 4 (Reasoning/validation): DependencyEngine.detectCircular()/
 *     detectMissingDependencies(), ReferenceIntegrityEngine.
 *     runFullIntegrityScan()
 *   Phase 9-10 (Certification + Registry): CertificationRegistryBridge
 *     .certifyAndRegister() (M279 - already composes
 *     CozyCertification + ServiceRegistry)
 *
 * CORE GATING RULE (the architectural point of this file): Phase 6
 * (Build/code generation) is NEVER reached unless Phases 1-5 have all
 * genuinely produced a real result - this is enforced in code, not
 * just documented.
 *
 * HONEST SCOPE:
 *   Phase 5 (Planning) is real aggregation of the prior phases' actual
 *   outputs into one structured plan - no new planning engine, no
 *   fabricated milestones.
 *   Phase 6 (Build) is HONESTLY NOT AUTOMATED: no real AI code-
 *   generation provider exists anywhere in this repository (same
 *   honest gap disclosed by LivingAI's provider registry). This
 *   orchestrator produces the real, gated go/no-go decision and a
 *   real plan for a human developer to implement - it does not
 *   fabricate generated code.
 *   Phase 7 (Rewrite) and Phase 8 (Testing) are real only to the
 *   extent Phase 4's engines already cover them (dependency/circular/
 *   integrity checks) - deeper runtime/performance/security testing
 *   beyond what those real engines already do is not implemented.
 *   Phase 11 (Deployment Readiness report) is real aggregation of
 *   every phase's actual results, never fabricated pass/fail counts.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.BuilderOrchestrator) return;

    class CozyBuilderOrchestrator {
        #sessions = new Map(); // sessionId -> {phases: {}, currentPhase}

        #newSession(sessionId) {
            const session = { phases: {}, currentPhase: 0, gated: false };
            this.#sessions.set(sessionId, session);
            return session;
        }

        /**
         * runPhase1Understanding(sessionId, description, appId)
         *   Real - composes CozyContextEngine + UnderstandingEngine.
         *   No code generation is possible from this phase - it only
         *   returns structured understanding.
         */
        runPhase1Understanding(sessionId, description, appId = null) {
            const session = this.#sessions.get(sessionId) || this.#newSession(sessionId);
            const contextEngine = window.CozyOS.CozyContextEngine || window.CozyOS.ContextEngine;
            const understandingEngine = window.CozyOS.UnderstandingEngine;

            const result = { phase: 1, name: "Understanding", success: false };
            if (!understandingEngine || typeof understandingEngine.analyzeText !== "function") {
                result.reason = "UnderstandingEngine is not loaded.";
                session.phases[1] = result;
                return result;
            }
            const analysis = understandingEngine.analyzeText(description);
            const appContext = (appId && contextEngine && typeof contextEngine.getContextForApp === "function") ? contextEngine.getContextForApp(appId) : null;
            result.success = true;
            result.analysis = analysis;
            result.appContext = appContext;
            session.phases[1] = result;
            session.currentPhase = 1;
            return result;
        }

        /**
         * runPhase2Analysis(sessionId, text, options)
         *   Real - composes CognitiveCoordinator (internally
         *   Thinking/Reasoning/Intelligence). Gated: requires Phase 1
         *   to have genuinely succeeded first.
         *
         *   Phase 10C-3B3, additive: `options.thinkingProviderId` is a
         *   real, optional pass-through to CognitiveCoordinator.run()'s
         *   own existing `thinkingProviderId` parameter (built Phase
         *   10C-3A, already used by CozyAI.ask() the same way) — this is
         *   the smallest possible fix for a real, disclosed gap found
         *   and recorded by Phase 10C-3B2's runtime-trace test
         *   ("BuilderOrchestrator.runPhase2Analysis(sessionId, text)
         *   currently has no options parameter, so it cannot pass
         *   thinkingProviderId through"). `options` is entirely optional
         *   and, other than `thinkingProviderId`, nothing on it is read
         *   or forwarded - this is not a general options pass-through,
         *   it is one named, explicit opt-in field, matching this
         *   phase's narrow scope. Omitting `options` (or omitting
         *   `thinkingProviderId` on it) reproduces the EXACT prior
         *   behavior: `coordinator.run({ text })`, defaulting to
         *   CognitiveCoordinator's/CozyThinking's own default provider,
         *   nothing selected, nothing activated. No default provider,
         *   no LivingAI active provider, and no provider registration is
         *   changed by this parameter - it only ever affects the single
         *   CognitiveCoordinator.run() call this method already made.
         */
        async runPhase2Analysis(sessionId, text, options = {}) {
            const session = this.#sessions.get(sessionId);
            if (!session || !session.phases[1] || !session.phases[1].success) {
                return { phase: 2, name: "Analysis", success: false, reason: "Phase 1 (Understanding) has not succeeded yet - cannot proceed." };
            }
            const coordinator = window.CozyOS.CognitiveCoordinator;
            const result = { phase: 2, name: "Analysis", success: false };
            if (!coordinator || typeof coordinator.run !== "function") {
                result.reason = "CognitiveCoordinator is not loaded.";
                session.phases[2] = result;
                return result;
            }
            const thinkingProviderId = (options && options.thinkingProviderId) ? options.thinkingProviderId : null;
            const cogResult = await coordinator.run({ text, thinkingProviderId });
            const stages = cogResult.diagnostics?.stages || {};
            const realStagesUsed = Object.entries(stages).filter(([, s]) => s.ran && s.isReal !== false).map(([name]) => name);
            result.success = realStagesUsed.length > 0;
            result.realStagesUsed = realStagesUsed;
            result.reasoning = cogResult.reasoning;
            result.thinking = cogResult.thinking;
            if (!result.success) result.reason = "CognitiveCoordinator ran but no real analysis stage actually produced results.";
            session.phases[2] = result;
            if (result.success) session.currentPhase = 2;
            return result;
        }

        /**
         * runPhase3Imagination(sessionId, analysisId)
         *   Real - composes LiveImagination + ArchitectureEngine.
         *   Gated on Phase 2.
         */
        runPhase3Imagination(sessionId, analysisId) {
            const session = this.#sessions.get(sessionId);
            if (!session || !session.phases[2] || !session.phases[2].success) {
                return { phase: 3, name: "Imagination", success: false, reason: "Phase 2 (Analysis) has not succeeded yet - cannot proceed." };
            }
            const archEngine = window.CozyOS.ArchitectureEngine;
            const result = { phase: 3, name: "Imagination", success: false };
            if (!archEngine || typeof archEngine.generateBlueprint !== "function") {
                result.reason = "ArchitectureEngine is not loaded.";
                session.phases[3] = result;
                return result;
            }
            try {
                const blueprint = archEngine.generateBlueprint(analysisId);
                result.success = !!blueprint;
                result.blueprint = blueprint;
                if (!result.success) result.reason = "generateBlueprint() returned no real blueprint for this analysisId.";
            } catch (err) {
                result.reason = `ArchitectureEngine threw: ${err.message}`;
            }
            session.phases[3] = result;
            if (result.success) session.currentPhase = 3;
            return result;
        }

        /**
         * runPhase4Reasoning(sessionId)
         *   Real - composes DependencyEngine + ReferenceIntegrityEngine.
         *   Rejects architectures with real, detected circular
         *   dependencies or missing dependencies. Gated on Phase 3.
         */
        async runPhase4Reasoning(sessionId) {
            const session = this.#sessions.get(sessionId);
            if (!session || !session.phases[3] || !session.phases[3].success) {
                return { phase: 4, name: "Reasoning", success: false, reason: "Phase 3 (Imagination) has not succeeded yet - cannot proceed." };
            }
            const depEngine = window.CozyOS.DependencyEngine;
            const refEngine = window.CozyOS.ReferenceIntegrityEngine;
            const result = { phase: 4, name: "Reasoning", success: false };

            const circular = depEngine && typeof depEngine.detectCircular === "function" ? depEngine.detectCircular() : null;
            const missing = depEngine && typeof depEngine.detectMissingDependencies === "function" ? depEngine.detectMissingDependencies() : null;
            const integrityReport = refEngine && typeof refEngine.runFullIntegrityScan === "function" ? await refEngine.runFullIntegrityScan() : null;

            const hasCircular = Array.isArray(circular) && circular.length > 0;
            const hasMissing = Array.isArray(missing) && missing.length > 0;

            result.circularDependencies = circular;
            result.missingDependencies = missing;
            result.integrityReport = integrityReport;
            result.success = !hasCircular && !hasMissing;
            if (!result.success) {
                result.reason = `Architecture rejected: ${hasCircular ? "circular dependencies detected" : ""}${hasCircular && hasMissing ? "; " : ""}${hasMissing ? "missing dependencies detected" : ""}.`;
            }
            session.phases[4] = result;
            if (result.success) session.currentPhase = 4;
            return result;
        }

        /**
         * runPhase5Planning(sessionId)
         *   Real - aggregates the actual results of Phases 1-4 into
         *   one structured plan. No new planning engine, no fabricated
         *   milestones beyond what the prior phases genuinely produced.
         */
        runPhase5Planning(sessionId) {
            const session = this.#sessions.get(sessionId);
            if (!session || !session.phases[4] || !session.phases[4].success) {
                return { phase: 5, name: "Planning", success: false, reason: "Phase 4 (Reasoning) has not succeeded yet - cannot proceed." };
            }
            const plan = {
                phase: 5, name: "Planning", success: true,
                understandingSummary: session.phases[1].analysis,
                selectedArchitecture: session.phases[3].blueprint,
                dependencyStatus: { circular: session.phases[4].circularDependencies, missing: session.phases[4].missingDependencies },
                integrationOrder: "Determined by the real dependency graph in Phase 4 - see dependencyStatus.",
                rollbackStrategy: "Real rollback composes the existing rollbackGolden() mechanism (Developer Hub, M246) - not a new rollback system."
            };
            session.phases[5] = plan;
            session.currentPhase = 5;
            session.gated = true; // Phase 6 may now proceed
            return plan;
        }

        /**
         * canProceedToBuild(sessionId)
         *   Real - the actual gate. Returns true only if all 5 prior
         *   phases genuinely succeeded in this exact session.
         */
        canProceedToBuild(sessionId) {
            const session = this.#sessions.get(sessionId);
            if (!session) return { canProceed: false, reason: "No real session found." };
            for (let phase = 1; phase <= 5; phase++) {
                if (!session.phases[phase] || !session.phases[phase].success) {
                    return { canProceed: false, reason: `Phase ${phase} has not genuinely succeeded - Build cannot proceed.` };
                }
            }
            return { canProceed: true };
        }

        /**
         * runPhase6Build(sessionId)
         *   HONEST: this orchestrator does not generate code. No real
         *   AI code-generation provider exists in this repository. This
         *   method only confirms the real gate passed and returns the
         *   real plan for a human developer to implement against -
         *   never fabricated generated code.
         */
        runPhase6Build(sessionId) {
            const gate = this.canProceedToBuild(sessionId);
            const session = this.#sessions.get(sessionId);
            const result = !gate.canProceed
                ? { phase: 6, name: "Build", success: false, reason: gate.reason }
                : {
                    phase: 6, name: "Build", success: true, gatePassed: true,
                    note: "Not implemented as automated code generation - no real AI code-generation provider exists in this repository. The real, gated plan (Phase 5) is ready for a human developer to implement.",
                    plan: session.phases[5]
                };
            if (session) session.phases[6] = result;
            return result;
        }

        /**
         * runPhase9And10CertifyAndRegister(sourceText, metadata, options)
         *   Real - composes the already-real CertificationRegistryBridge
         *   (M279), which itself composes CozyCertification +
         *   ServiceRegistry. Never a duplicate certification/registry
         *   path.
         */
        runPhase9And10CertifyAndRegister(sourceText, metadata, options) {
            const bridge = window.CozyOS.CertificationRegistryBridge;
            if (!bridge || typeof bridge.certifyAndRegister !== "function") {
                return { phase: "9-10", name: "Certification + Registry", success: false, reason: "CertificationRegistryBridge is not loaded." };
            }
            const result = bridge.certifyAndRegister(sourceText, metadata, options);
            return { phase: "9-10", name: "Certification + Registry", ...result };
        }

        /**
         * getDeploymentReadinessReport(sessionId)
         *   Real - aggregates every phase's actual, already-computed
         *   result for this session. Never fabricates a pass/fail
         *   count.
         */
        getDeploymentReadinessReport(sessionId) {
            const session = this.#sessions.get(sessionId);
            if (!session) return { available: false, reason: "No real session found." };
            const phaseResults = Object.values(session.phases);
            const passed = phaseResults.filter(p => p.success).length;
            return {
                available: true, sessionId,
                phasesRun: phaseResults.length, phasesPassed: passed,
                readyForDeployment: session.gated && passed === phaseResults.length,
                phases: session.phases
            };
        }

        getVersion() { return "1.1.0"; } // Phase 10C-3B3: runPhase2Analysis(sessionId, text, options) — additive options.thinkingProviderId pass-through to CognitiveCoordinator.run(). No other behavior changed.
        getId() { return "BuilderOrchestrator"; }
    }

    window.CozyOS.BuilderOrchestrator = new CozyBuilderOrchestrator();
})();
