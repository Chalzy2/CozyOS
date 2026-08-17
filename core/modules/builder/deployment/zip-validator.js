/**
 * CozyOS Deployment — ZIP Layout Validator
 * core/modules/builder/deployment/zip-validator.js
 *
 * OWNERSHIP: single responsibility - given a real list of ZIP entry
 * paths, detect whether the deployment is nested under a single
 * wrapping folder (e.g. "CozyOS/index.html" instead of "index.html"),
 * which is exactly what causes a successful-upload-but-404 Cloudflare
 * Pages deployment. Real, deterministic string analysis only - no
 * assumptions about ZIP file content, only its real entry paths.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.ZipValidator) return;

    class CozyZipValidator {
        /**
         * inspect(entryPaths)
         *   Real - if every real entry shares one common top-level
         *   folder name, the ZIP is nested (rejected). Accepts only a
         *   flat root layout (index.html, core/, applications/,
         *   assets/, etc. directly at the ZIP root).
         */
        inspect(entryPaths) {
            if (!Array.isArray(entryPaths) || entryPaths.length === 0) {
                return { success: false, reason: "A real, non-empty array of ZIP entry paths is required." };
            }

            const topLevelSegments = new Set(entryPaths.map(p => p.split("/")[0]));

            const singleTopLevel = topLevelSegments.size === 1;
            const onlySegment = singleTopLevel ? [...topLevelSegments][0] : null;
            const isWrappingFolder = singleTopLevel && entryPaths.some(p => p !== onlySegment && p.startsWith(`${onlySegment}/`));

            if (isWrappingFolder) {
                return {
                    success: true, valid: false,
                    reason: `Every real entry is nested under a single top-level folder ("${onlySegment}/"). Cloudflare Pages will look for index.html at the true ZIP root and find nothing there — this causes a successful upload that still returns 404.`,
                    detectedWrapperFolder: onlySegment,
                    repair: `Repackage so index.html, core/, applications/, and assets/ are directly at the ZIP root — not inside "${onlySegment}/".`
                };
            }

            const hasRootIndex = topLevelSegments.has("index.html");
            return {
                success: true, valid: true,
                topLevelEntries: [...topLevelSegments],
                hasRootIndex,
                note: hasRootIndex ? "Flat root layout confirmed; index.html is at the true ZIP root." : "Flat root layout confirmed, but no index.html at the root — see EntrypointScanner for the real entry-point check."
            };
        }
    }

    window.CozyOS.ZipValidator = new CozyZipValidator();
})();
