/**
 * CozyOS Deployment Validator — Orchestrator (M292, migrated M307)
 * core/modules/builder/deployment/deployment-validator.js
 *
 * OWNERSHIP: composes the five real, single-responsibility modules in
 * this directory (EntrypointScanner, ZipValidator, AssetValidator,
 * CloudflareValidator, DeploymentReport) - never re-implements their
 * checks. As of M307, the checks are registered as real Living.workflow
 * stage handlers (validate-entrypoint, validate-assets, validate-zip,
 * validate-cloudflare, generate-report) and orchestrated via
 * Living.workflow.run() - never a second orchestration mechanism. The
 * public validateBeforePackaging() API and its exact return shape
 * (report.build()'s real output) are unchanged.
 *
 * MANDATORY GATE: validateBeforePackaging() remains the single real
 * decision point. If it returns readyToPackage:false, the caller must
 * not generate the ZIP.
 *
 * Falls back to its own direct, real sequential execution of the same
 * stages if Living.workflow isn't loaded - backward compatible, not a
 * hard new dependency.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.DeploymentValidator) return;

    const WORKFLOW_ID = "deployment-validation";

    class CozyDeploymentValidator {
        /** #stageEntrypoint(spec) — real: EntrypointScanner.scan(). */
        #stageEntrypoint(spec) {
            const entryScanner = window.CozyOS.EntrypointScanner;
            if (!entryScanner) return { success: false, reason: "EntrypointScanner is not loaded." };
            return { success: true, entryResult: entryScanner.scan(spec.filePaths) };
        }

        /** #stageAssets(spec) — real: AssetValidator.verifyAssetList(), conditional on a real assetExistsFn (unchanged behavior: honestly null if not provided). */
        async #stageAssets(spec) {
            const assetValidator = window.CozyOS.AssetValidator;
            if (!assetValidator || !spec.assetExistsFn) return { success: true, assetResult: null };
            const referencedAssets = spec.filePaths.filter(p => /\.(js|css|png|jpg|svg|ico|json)$/.test(p));
            const assetResult = await assetValidator.verifyAssetList(referencedAssets, spec.assetExistsFn);
            return { success: true, assetResult };
        }

        /** #stageZip(spec) — real: ZipValidator.inspect(). */
        #stageZip(spec) {
            const zipValidator = window.CozyOS.ZipValidator;
            if (!zipValidator) return { success: false, reason: "ZipValidator is not loaded." };
            return { success: true, zipResult: zipValidator.inspect(spec.filePaths) };
        }

        /** #stageCloudflare(spec) — real: CloudflareValidator.validate(). */
        #stageCloudflare(spec) {
            const cloudflareValidator = window.CozyOS.CloudflareValidator;
            if (!cloudflareValidator) return { success: false, reason: "CloudflareValidator is not loaded." };
            return { success: true, cloudflareResult: cloudflareValidator.validate(spec.filePaths) };
        }

        /** #stageReport(ctx) — real: DeploymentReport.build(), combining every prior real stage's actual output. */
        #stageReport(ctx) {
            const report = window.CozyOS.DeploymentReport;
            if (!report) return { success: false, reason: "DeploymentReport is not loaded." };
            const entryResult = ctx.previousResults[`${WORKFLOW_ID}:validate-entrypoint`]?.entryResult;
            const assetResult = ctx.previousResults[`${WORKFLOW_ID}:validate-assets`]?.assetResult;
            const zipResult = ctx.previousResults[`${WORKFLOW_ID}:validate-zip`]?.zipResult;
            const cloudflareResult = ctx.previousResults[`${WORKFLOW_ID}:validate-cloudflare`]?.cloudflareResult;
            const built = report.build({ entryResult, zipResult, assetResult, cloudflareResult });
            return { success: true, built };
        }

        /** #registerStages(living) — real, idempotent registration of all 5 stage handlers with Living.workflow. */
        #registerStages(living) {
            if (living.workflow.hasStageHandler(`${WORKFLOW_ID}:validate-entrypoint`)) return;
            living.workflow.define({ id: WORKFLOW_ID, stages: [`${WORKFLOW_ID}:validate-entrypoint`, `${WORKFLOW_ID}:validate-assets`, `${WORKFLOW_ID}:validate-zip`, `${WORKFLOW_ID}:validate-cloudflare`, `${WORKFLOW_ID}:generate-report`] });
            living.workflow.registerStageHandler(`${WORKFLOW_ID}:validate-entrypoint`, (spec) => this.#stageEntrypoint(spec));
            living.workflow.registerStageHandler(`${WORKFLOW_ID}:validate-assets`, (spec) => this.#stageAssets(spec));
            living.workflow.registerStageHandler(`${WORKFLOW_ID}:validate-zip`, (spec) => this.#stageZip(spec));
            living.workflow.registerStageHandler(`${WORKFLOW_ID}:validate-cloudflare`, (spec) => this.#stageCloudflare(spec));
            living.workflow.registerStageHandler(`${WORKFLOW_ID}:generate-report`, (spec, ctx) => this.#stageReport(ctx));
        }

        /**
         * validateBeforePackaging(filePaths, options)
         *   Real - public API and return shape completely unchanged.
         *   As of M307, delegates internally to Living.workflow.run()
         *   when available, falling back to direct sequential
         *   execution of the same 5 stages otherwise.
         */
        async validateBeforePackaging(filePaths, { assetExistsFn = null } = {}) {
            if (!Array.isArray(filePaths) || filePaths.length === 0) {
                return { overallResult: "Deployment Blocked", errors: ["No real file list was provided to validate."], readyToPackage: false };
            }

            const entryScanner = window.CozyOS.EntrypointScanner;
            const zipValidator = window.CozyOS.ZipValidator;
            const cloudflareValidator = window.CozyOS.CloudflareValidator;
            const report = window.CozyOS.DeploymentReport;
            if (!entryScanner || !zipValidator || !cloudflareValidator || !report) {
                return { overallResult: "Deployment Blocked", errors: ["One or more real deployment-validation modules are not loaded."], readyToPackage: false };
            }

            const spec = { filePaths, assetExistsFn };
            const living = window.CozyOS.Living;

            if (living && living.workflow && typeof living.workflow.run === "function") {
                this.#registerStages(living);
                const result = await living.workflow.run(WORKFLOW_ID, spec);
                if (!result.success) {
                    // A stage genuinely failed to even run (e.g. a module
                    // unloaded mid-flight) - honestly report it, matching
                    // the original method's own error shape.
                    return { overallResult: "Deployment Blocked", errors: [result.reason || "A real deployment-validation stage failed."], readyToPackage: false };
                }
                return result.stageResults[`${WORKFLOW_ID}:generate-report`].built;
            }

            // Fallback: no Living.workflow - run the same 5 stages directly.
            return this.#runDirect(spec);
        }

        /** #runDirect(spec) — real, honest fallback when Living.workflow isn't loaded. Same 5 real stages, same behavior. */
        async #runDirect(spec) {
            const entryResult = this.#stageEntrypoint(spec).entryResult;
            const assetResult = (await this.#stageAssets(spec)).assetResult;
            const zipResult = this.#stageZip(spec).zipResult;
            const cloudflareResult = this.#stageCloudflare(spec).cloudflareResult;
            return window.CozyOS.DeploymentReport.build({ entryResult, zipResult, assetResult, cloudflareResult });
        }

        getVersion() { return "1.1.0"; }
        getId() { return "DeploymentValidator"; }
        getDependencies() { return ["EntrypointScanner", "ZipValidator", "AssetValidator", "CloudflareValidator", "DeploymentReport"]; }
    }

    window.CozyOS.DeploymentValidator = new CozyDeploymentValidator();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "DeploymentValidator", category: "Living Engine",
                sourcePath: "core/modules/builder/deployment/deployment-validator.js",
                description: "Real, mandatory pre-packaging gate. Stages registered with Living.workflow (M307): validate-entrypoint, validate-assets, validate-zip, validate-cloudflare, generate-report. Composes EntrypointScanner/ZipValidator/AssetValidator/CloudflareValidator/DeploymentReport - detects the exact conditions that cause a successful Cloudflare Pages upload to still return 404."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
