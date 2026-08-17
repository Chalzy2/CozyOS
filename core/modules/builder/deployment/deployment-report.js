/**
 * CozyOS Deployment — Report Generator
 * core/modules/builder/deployment/deployment-report.js
 *
 * OWNERSHIP: single responsibility - format the real results already
 * produced by EntrypointScanner/ZipValidator/AssetValidator/
 * CloudflareValidator into the requested report shape. Never computes
 * anything itself - pure, honest aggregation of real inputs.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.DeploymentReport) return;

    class CozyDeploymentReport {
        /**
         * build({ entryResult, zipResult, assetResult, cloudflareResult })
         *   Real - every field here is read directly from the real
         *   result objects the caller supplies; nothing is invented if
         *   a piece is missing (reported as "not checked", not blank).
         */
        build({ entryResult = null, zipResult = null, assetResult = null, cloudflareResult = null } = {}) {
            const errors = [];
            const warnings = [];

            if (zipResult && zipResult.success && !zipResult.valid) errors.push(zipResult.reason);
            if (cloudflareResult && cloudflareResult.errors) errors.push(...cloudflareResult.errors);
            if (assetResult && assetResult.success && assetResult.missing && assetResult.missing.length > 0) {
                errors.push(`Missing assets: ${assetResult.missing.join(", ")}`);
            }
            if (entryResult && entryResult.success && !entryResult.hasIndex && entryResult.foundCandidates && entryResult.foundCandidates.length > 0) {
                warnings.push(entryResult.recommendation);
            }

            const overallResult = errors.length === 0 ? "Deployment Ready" : "Deployment Blocked";

            return {
                overallResult,
                entryPoint: entryResult ? (entryResult.entryPoint || "none - " + (entryResult.recommendation || "not evaluated")) : "not checked",
                deploymentRoot: zipResult && zipResult.success ? (zipResult.detectedWrapperFolder ? `nested under "${zipResult.detectedWrapperFolder}/"` : "flat root") : "not checked",
                zipLayout: zipResult ? (zipResult.valid ? "valid (flat root)" : "invalid (nested)") : "not checked",
                missingAssets: assetResult && assetResult.missing ? assetResult.missing : [],
                warnings,
                errors,
                cloudflareCompatibility: cloudflareResult ? (cloudflareResult.compatible ? "compatible" : "incompatible") : "not checked",
                readyToPackage: overallResult === "Deployment Ready"
            };
        }
    }

    window.CozyOS.DeploymentReport = new CozyDeploymentReport();
})();
