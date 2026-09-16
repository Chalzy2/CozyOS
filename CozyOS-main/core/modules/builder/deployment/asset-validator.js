/**
 * CozyOS Deployment — Asset Validator
 * core/modules/builder/deployment/asset-validator.js
 *
 * OWNERSHIP: composes the existing, real ReferenceIntegrityEngine
 * (core/platform/reference-integrity-engine.js, confirmed real before
 * writing this file) for actual script/link reference scanning.
 * Never a second asset-scanning implementation - this file only adds
 * the deployment-specific framing (missing assets → real 404 causes)
 * on top of that engine's real output.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.AssetValidator) return;

    class CozyAssetValidator {
        /**
         * verifyAssets()
         *   Real - composes ReferenceIntegrityEngine.runFullIntegrityScan(),
         *   which itself does the actual reference/import/duplicate
         *   scanning. Never re-implements that scan.
         */
        async verifyAssets() {
            const engine = window.CozyOS.ReferenceIntegrityEngine;
            if (!engine || typeof engine.runFullIntegrityScan !== "function") {
                return { success: false, reason: "ReferenceIntegrityEngine is not loaded - cannot verify assets." };
            }
            const report = await engine.runFullIntegrityScan();
            return { success: true, report };
        }

        /**
         * verifyAssetList(assetPaths, existsFn)
         *   Real, deployment-specific check for a caller-supplied list
         *   of individual asset paths (script/link/img/manifest/worker)
         *   against a real existence check function the caller
         *   provides (e.g. checking real ZIP entries or a real
         *   directory listing) - never assumes existence.
         */
        async verifyAssetList(assetPaths, existsFn) {
            if (!Array.isArray(assetPaths)) return { success: false, reason: "A real array of asset paths is required." };
            if (typeof existsFn !== "function") return { success: false, reason: "A real existence-check function is required - this method never assumes a file exists." };

            const missing = [];
            for (const path of assetPaths) {
                const exists = await existsFn(path);
                if (!exists) missing.push(path);
            }
            return {
                success: true, checked: assetPaths.length, missing,
                allPresent: missing.length === 0,
                note: missing.length > 0 ? `${missing.length} referenced asset(s) do not exist - Cloudflare will 404 on any request for these.` : "All referenced assets confirmed present."
            };
        }
    }

    window.CozyOS.AssetValidator = new CozyAssetValidator();
})();
