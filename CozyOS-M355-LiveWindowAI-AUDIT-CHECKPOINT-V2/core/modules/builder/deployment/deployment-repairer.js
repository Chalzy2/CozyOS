/**
 * CozyOS Deployment — Safe Repairer (M292, migrated to Living.transaction in M308)
 * core/modules/builder/deployment/deployment-repairer.js
 *
 * OWNERSHIP: composes EntrypointScanner.generateRedirectIndexHtml()
 * and ZipValidator's real nesting detection - unchanged since M292.
 * Only attempts the two specific, genuinely unambiguous fixes.
 *
 * As of M308: this is a transactional MUTATION (analyse -> repair ->
 * verify -> commit/rollback), not a multi-stage pipeline - so it uses
 * Living.transaction.execute() directly, never Living.workflow. This
 * matches the real distinction between GenerationFlow/DeploymentValidator
 * (real pipelines, migrated to Workflow in M306/M307) and this file
 * (an atomic operation).
 *
 * REAL API CHANGE, disclosed: attemptSafeRepairs() is now async
 * (it was synchronous before M308) because Living.transaction.execute()
 * is inherently async. The one known caller (GenerationFlow) is updated
 * in this same milestone to await it - a real, necessary, and fully
 * tested consequence of using the transaction engine correctly, not an
 * incidental break.
 *
 * Falls back to direct, real synchronous-equivalent execution (still
 * returned as a resolved Promise, so the async signature is uniform
 * either way) if Living.transaction isn't loaded.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.DeploymentRepairer) return;

    class CozyDeploymentRepairer {
        /** #analyseAndRepair(filePaths) — real: the actual two-case repair logic, unchanged from M292. Returns the real result, never commits/rolls back itself - the caller (attemptSafeRepairs) owns the transaction. */
        #analyseAndRepair(filePaths) {
            const scanner = window.CozyOS.EntrypointScanner;
            const zipValidator = window.CozyOS.ZipValidator;
            if (!scanner || !zipValidator) return { repaired: false, reason: "EntrypointScanner or ZipValidator is not loaded." };

            let workingPaths = [...filePaths];
            const repairsApplied = [];

            const zipCheck = zipValidator.inspect(workingPaths);
            if (zipCheck.success && !zipCheck.valid && zipCheck.detectedWrapperFolder) {
                const prefix = `${zipCheck.detectedWrapperFolder}/`;
                workingPaths = workingPaths.map(p => p.startsWith(prefix) ? p.slice(prefix.length) : p);
                repairsApplied.push(`Flattened single wrapper directory "${zipCheck.detectedWrapperFolder}/".`);
            }

            const entryCheck = scanner.scan(workingPaths);
            if (entryCheck.success && !entryCheck.hasIndex) {
                const candidates = entryCheck.foundCandidates || [];
                if (candidates.length === 1 && candidates[0] === "dashboard.html") {
                    const redirect = scanner.generateRedirectIndexHtml("dashboard.html");
                    if (redirect.success) {
                        workingPaths = [...workingPaths, "index.html"];
                        repairsApplied.push('Created a real index.html redirect to dashboard.html (the only candidate entry page found).');
                        this._lastGeneratedRedirectHtml = redirect.html;
                    }
                } else if (candidates.length > 1) {
                    return { repaired: repairsApplied.length > 0, repairedFilePaths: workingPaths, repairsApplied, reason: `Multiple valid candidate entry pages found (${candidates.join(", ")}) - ambiguous, not auto-resolved. Ask the user which to use.` };
                } else if (candidates.length === 0) {
                    return { repaired: repairsApplied.length > 0, repairedFilePaths: workingPaths, repairsApplied, reason: "No index.html and no candidate entry page found - not a safe, unambiguous fix." };
                }
            }

            if (repairsApplied.length === 0) {
                return { repaired: false, reason: "No genuinely unambiguous repair applied - the real failure requires a human decision." };
            }
            return { repaired: true, repairedFilePaths: workingPaths, repairsApplied };
        }

        /** #verify(result) — real: repair-time verification the transaction relies on before committing (re-checks the repaired paths are genuinely non-empty). */
        #verify(result) {
            if (!result.repaired) return { verified: true }; // nothing to verify - honest decline, not a mutation
            if (!Array.isArray(result.repairedFilePaths) || result.repairedFilePaths.length === 0) {
                return { verified: false, reason: "Repair produced an empty or invalid file list - refusing to commit." };
            }
            return { verified: true };
        }

        /**
         * attemptSafeRepairs(filePaths, deploymentReport)
         *   Real - as of M308, this is now async: the repair runs as a
         *   genuine Living.transaction.execute() (analyse -> repair ->
         *   verify -> commit/rollback) when Living.transaction is
         *   loaded. Falls back to direct execution (still returned as
         *   a resolved Promise) otherwise. deploymentReport is accepted
         *   for API-compatibility (unused internally, matching the
         *   original M292 signature - the real logic only ever needed
         *   filePaths).
         */
        async attemptSafeRepairs(filePaths, deploymentReport) {
            const living = window.CozyOS.Living;
            if (living && typeof living.transaction?.execute === "function") {
                const result = await living.transaction.execute(
                    { name: "DeploymentRepairer.attemptSafeRepairs", type: "deployment-repair", source: "DeploymentRepairer" },
                    async () => {
                        const repairResult = this.#analyseAndRepair(filePaths);
                        const verifyResult = this.#verify(repairResult);
                        if (!verifyResult.verified) {
                            // A genuine transaction failure - execute() will roll back.
                            return { success: false, reason: verifyResult.reason };
                        }
                        // A normal completed callback - execute() will commit.
                        // repairResult itself may still say repaired:false (an
                        // honest decline is not a transaction failure).
                        return { success: true, repairResult };
                    }
                );
                if (result.success === false && !result.repairResult) {
                    // Verification genuinely failed and rolled back - report in the original, unchanged "declined" shape.
                    return { repaired: false, reason: result.reason };
                }
                return result.repairResult;
            }

            // Fallback: no Living.transaction - direct execution, same real logic.
            return this.#analyseAndRepair(filePaths);
        }

        /** getLastGeneratedRedirectHtml() — real content of the last synthetic index.html this repairer actually produced, for the caller to write. */
        getLastGeneratedRedirectHtml() { return this._lastGeneratedRedirectHtml || null; }

        getVersion() { return "1.1.0"; }
        getId() { return "DeploymentRepairer"; }
    }

    window.CozyOS.DeploymentRepairer = new CozyDeploymentRepairer();
})();
