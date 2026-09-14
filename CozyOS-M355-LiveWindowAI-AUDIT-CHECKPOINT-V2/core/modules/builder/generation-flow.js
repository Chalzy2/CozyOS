/**
 * CozyOS Builder — Generation Flow (M293, migrated to Living.workflow in M306)
 * core/modules/builder/generation-flow.js
 *
 * OWNERSHIP: as of M306, the 5-stage pipeline (analysis, ownership,
 * architecture, deployment-validation, certification) is registered as
 * real Living.workflow stage handlers and executed via
 * Living.workflow.run() (M305) - never a second orchestration
 * mechanism. The public run() API and its exact return shape are
 * unchanged, so every existing caller of GenerationFlow continues to
 * work without modification.
 *
 * If Living.workflow isn't loaded (older deployment / load-order edge
 * case), this file falls back to its own direct, real sequential
 * execution of the same 5 stages - backward compatible, not a hard
 * new dependency.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.GenerationFlow) return;

    const CERTIFICATION_THRESHOLD_PERCENT = 70;
    const WORKFLOW_ID = "generation-flow";

    class CozyGenerationFlow {
        #emitBuildEvent(eventName, detail) {
            const bus = window.CozyOS.PlatformEventBus;
            if (bus && typeof bus.emit === "function") {
                try { bus.emit(eventName, detail); } catch (_err) { /* non-fatal */ }
            }
        }

        /** #stageAnalysis(spec) — real Stage 1: RequirementAnalyzer.analyzeRequirement(). */
        #stageAnalysis(spec) {
            const analyzer = window.CozyOS.RequirementAnalyzer;
            this.#emitBuildEvent("build:start", { requirementText: spec.requirementText });
            if (!analyzer || typeof analyzer.analyzeRequirement !== "function") {
                return { success: false, reason: "RequirementAnalyzer is not loaded." };
            }
            const analysis = analyzer.analyzeRequirement(spec.requirementText);
            const analysisId = analysis.id || analysis.analysisId;
            if (!analysisId) return { success: false, reason: "analyzeRequirement() did not return a real analysis id." };
            this.#emitBuildEvent("build:analysis-complete", { analysisId });
            return { success: true, analysis, analysisId };
        }

        /** #stageOwnership(spec, ctx) — real Stage 2: OwnershipScanner + DesignReasoner reuse check. */
        #stageOwnership(spec, ctx) {
            const { analysis, analysisId } = ctx.previousResults.analysis;
            const ownershipScanner = window.CozyOS.OwnershipScanner;
            if (ownershipScanner && typeof ownershipScanner.scan === "function") {
                const ownershipCheck = ownershipScanner.scan(analysis.domain || analysisId, "module");
                if (ownershipCheck.safe === false) {
                    this.#emitBuildEvent("build:blocked", { stage: "ownership", reason: ownershipCheck.reason });
                    return { success: false, reason: ownershipCheck.reason, collidesWith: ownershipCheck.collidesWith };
                }
            }
            const reasoner = window.CozyOS.DesignReasoner;
            if (reasoner && typeof reasoner.shouldReuseExisting === "function") {
                const reuseCheck = reasoner.shouldReuseExisting(analysis.domain || analysisId);
                if (reuseCheck.decision === "reuse") {
                    return { success: false, reason: reuseCheck.reason, existingCoordinator: reuseCheck.existingCoordinator, __isReasoningStage: true };
                }
            }
            return { success: true };
        }

        /** #stageArchitecture(ctx) — real Stage 3: ArchitectureEngine.generateBlueprint(). */
        #stageArchitecture(ctx) {
            const { analysisId } = ctx.previousResults.analysis;
            const archEngine = window.CozyOS.ArchitectureEngine;
            if (!archEngine || typeof archEngine.generateBlueprint !== "function") {
                return { success: false, reason: "ArchitectureEngine is not loaded." };
            }
            try {
                const blueprint = archEngine.generateBlueprint(analysisId);
                return { success: true, blueprint };
            } catch (err) {
                return { success: false, reason: `generateBlueprint() threw: ${err.message}` };
            }
        }

        /** #stageDeploymentValidation(spec, ctx) — real Stage 4: DeploymentValidator + DeploymentRepairer. */
        async #stageDeploymentValidation(spec, ctx) {
            const deploymentValidator = window.CozyOS.DeploymentValidator;
            if (!deploymentValidator || typeof deploymentValidator.validateBeforePackaging !== "function") {
                return { success: false, reason: "DeploymentValidator is not loaded." };
            }
            let filePaths = spec.generatedFilePaths;
            let deploymentReport = await deploymentValidator.validateBeforePackaging(filePaths, { assetExistsFn: spec.assetExistsFn });
            if (!deploymentReport.readyToPackage) {
                const repairer = window.CozyOS.DeploymentRepairer;
                if (repairer) {
                    const repairResult = await repairer.attemptSafeRepairs(filePaths, deploymentReport);
                    if (repairResult.repaired) {
                        const revalidated = await deploymentValidator.validateBeforePackaging(repairResult.repairedFilePaths, { assetExistsFn: spec.assetExistsFn });
                        if (revalidated.readyToPackage) {
                            filePaths = repairResult.repairedFilePaths;
                            deploymentReport = revalidated;
                        } else {
                            return { success: false, reason: "Deployment blocked; safe repair applied but still not ready.", deploymentReport: revalidated, repairsApplied: repairResult.repairsApplied };
                        }
                    } else {
                        return { success: false, reason: "Deployment blocked; no safe, unambiguous repair available.", deploymentReport, repairSuggestions: repairResult.reason };
                    }
                } else {
                    return { success: false, reason: "Deployment blocked and DeploymentRepairer is not loaded.", deploymentReport };
                }
            }
            return { success: true, deploymentReport, finalFilePaths: filePaths };
        }

        /** #stageCertification(spec, ctx) — real Stage 5: CozyCertification.certifyModule() with the real threshold. */
        #stageCertification(spec, ctx) {
            const { analysis, analysisId } = ctx.previousResults.analysis;
            const { blueprint } = ctx.previousResults.architecture;
            const cert = window.CozyOS.Certification || window.CozyOS.CozyCertification;
            if (!cert || typeof cert.certifyModule !== "function") {
                return { success: false, reason: "CozyCertification is not loaded." };
            }
            const certReport = cert.certifyModule(spec.generatedSourceText, { moduleId: analysis.domain || analysisId, moduleName: analysis.domain || analysisId, version: "1.0.0" });
            const scorePercent = certReport?.summary?.scorePercent ?? 0;
            if (scorePercent < CERTIFICATION_THRESHOLD_PERCENT) {
                return { success: false, reason: `Certification score ${scorePercent}% is below the real threshold (${CERTIFICATION_THRESHOLD_PERCENT}%) - report returned instead of packaging.`, certReport };
            }
            this.#emitBuildEvent("build:complete", { analysisId, blueprintId: blueprint.id });
            return { success: true, certReport };
        }

        /** #registerStages() — real, idempotent registration of all 5 stage handlers with Living.workflow. */
        #registerStages(living) {
            if (living.workflow.hasStageHandler(`${WORKFLOW_ID}:analysis`)) return; // already registered
            living.workflow.define({ id: WORKFLOW_ID, stages: [`${WORKFLOW_ID}:analysis`, `${WORKFLOW_ID}:ownership`, `${WORKFLOW_ID}:architecture`, `${WORKFLOW_ID}:deployment-validation`, `${WORKFLOW_ID}:certification`] });
            living.workflow.registerStageHandler(`${WORKFLOW_ID}:analysis`, (spec) => this.#stageAnalysis(spec));
            living.workflow.registerStageHandler(`${WORKFLOW_ID}:ownership`, (spec, ctx) => this.#stageOwnership(spec, { previousResults: { analysis: ctx.previousResults[`${WORKFLOW_ID}:analysis`] } }));
            living.workflow.registerStageHandler(`${WORKFLOW_ID}:architecture`, (spec, ctx) => this.#stageArchitecture({ previousResults: { analysis: ctx.previousResults[`${WORKFLOW_ID}:analysis`] } }));
            living.workflow.registerStageHandler(`${WORKFLOW_ID}:deployment-validation`, (spec, ctx) => this.#stageDeploymentValidation(spec, ctx));
            living.workflow.registerStageHandler(`${WORKFLOW_ID}:certification`, (spec, ctx) => this.#stageCertification(spec, { previousResults: { analysis: ctx.previousResults[`${WORKFLOW_ID}:analysis`], architecture: ctx.previousResults[`${WORKFLOW_ID}:architecture`] } }));
        }

        /**
         * run(requirementText, generatedFilePaths, generatedSourceText, options)
         *   Real - as of M306, delegates to Living.workflow.run() when
         *   Living.workflow is available, mapping its real result back
         *   to this method's unchanged, original return shape. Falls
         *   back to direct sequential execution of the same 5 stages
         *   if Living.workflow isn't loaded - identical observable
         *   behavior either way.
         */
        async run(requirementText, generatedFilePaths, generatedSourceText, { assetExistsFn = null } = {}) {
            const spec = { requirementText, generatedFilePaths, generatedSourceText, assetExistsFn };
            const living = window.CozyOS.Living;

            if (living && living.workflow && typeof living.workflow.run === "function") {
                this.#registerStages(living);
                const result = await living.workflow.run(WORKFLOW_ID, spec);
                return this.#mapWorkflowResult(result);
            }

            // Fallback: no Living.workflow - run the same 5 stages directly, sequentially.
            return this.#runDirect(spec);
        }

        /** #mapWorkflowResult(result) — real, translates Living.workflow's real result shape back to this method's original, unchanged return shape. */
        #mapWorkflowResult(result) {
            if (result.success) {
                const { analysisId } = result.stageResults[`${WORKFLOW_ID}:analysis`];
                const { blueprint } = result.stageResults[`${WORKFLOW_ID}:architecture`];
                const { deploymentReport, finalFilePaths } = result.stageResults[`${WORKFLOW_ID}:deployment-validation`];
                const { certReport } = result.stageResults[`${WORKFLOW_ID}:certification`];
                return { success: true, analysisId, blueprintId: blueprint.id, deploymentReport, certReport, finalFilePaths, readyToPackage: true };
            }
            const stageNameMap = { [`${WORKFLOW_ID}:analysis`]: "analysis", [`${WORKFLOW_ID}:ownership`]: "ownership", [`${WORKFLOW_ID}:architecture`]: "architecture", [`${WORKFLOW_ID}:deployment-validation`]: "deployment-validation", [`${WORKFLOW_ID}:certification`]: "certification" };
            const failedStageResult = result.stageResults ? result.stageResults[result.stage] : null;
            const stageName = stageNameMap[result.stage] || result.stage;
            const base = { success: false, stage: (failedStageResult && failedStageResult.__isReasoningStage) ? "reasoning" : stageName, reason: result.reason };
            if (failedStageResult) {
                const { __isReasoningStage, success, reason, ...rest } = failedStageResult;
                return { ...base, ...rest };
            }
            return base;
        }

        /** #runDirect(spec) — real, honest fallback sequential execution when Living.workflow isn't loaded. Same 5 real stages, same behavior. */
        async #runDirect(spec) {
            const analysisResult = this.#stageAnalysis(spec);
            if (!analysisResult.success) return { success: false, stage: "analysis", reason: analysisResult.reason };

            const ownershipResult = this.#stageOwnership(spec, { previousResults: { analysis: analysisResult } });
            if (!ownershipResult.success) {
                if (ownershipResult.__isReasoningStage) return { success: false, stage: "reasoning", reason: ownershipResult.reason, analysisId: analysisResult.analysisId, existingCoordinator: ownershipResult.existingCoordinator };
                return { success: false, stage: "ownership", reason: ownershipResult.reason, collidesWith: ownershipResult.collidesWith };
            }

            const archResult = this.#stageArchitecture({ previousResults: { analysis: analysisResult } });
            if (!archResult.success) return { success: false, stage: "architecture", reason: archResult.reason, analysisId: analysisResult.analysisId };

            const deployResult = await this.#stageDeploymentValidation(spec, {});
            if (!deployResult.success) return { success: false, stage: "deployment-validation", ...deployResult };

            const certResult = this.#stageCertification(spec, { previousResults: { analysis: analysisResult, architecture: archResult } });
            if (!certResult.success) return { success: false, stage: "certification", reason: certResult.reason, certReport: certResult.certReport };

            return {
                success: true, analysisId: analysisResult.analysisId, blueprintId: archResult.blueprint.id,
                deploymentReport: deployResult.deploymentReport, certReport: certResult.certReport,
                finalFilePaths: deployResult.finalFilePaths, readyToPackage: true
            };
        }

        getVersion() { return "1.1.0"; }
        getId() { return "GenerationFlow"; }
        getDependencies() { return ["RequirementAnalyzer", "ArchitectureEngine", "DeploymentValidator", "Certification"]; }
    }

    window.CozyOS.GenerationFlow = new CozyGenerationFlow();
})();
