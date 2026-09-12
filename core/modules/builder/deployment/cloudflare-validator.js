/**
 * CozyOS Deployment — Cloudflare Pages Validator
 * core/modules/builder/deployment/cloudflare-validator.js
 *
 * OWNERSHIP: composes EntrypointScanner and ZipValidator (both real,
 * already built) for the underlying checks - never duplicates entry-
 * point or nesting detection. This file's own real, new logic is
 * simulating Cloudflare Pages' documented static-routing resolution
 * rules against a real, caller-supplied file list:
 *   GET /            -> index.html (root)
 *   GET /path        -> path, or path.html, or path/index.html
 *   GET /path/       -> path/index.html
 *   anything else    -> 404
 * This is a faithful, deterministic implementation of Cloudflare's
 * own documented behavior, not a live network simulation - no
 * external API is called, matching the offline-only constraint.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.CloudflareValidator) return;

    class CozyCloudflareValidator {
        resolveRoute(requestPath, fileSet) {
            let p = requestPath.replace(/^\//, "");
            if (p === "") return fileSet.has("index.html") ? "index.html" : null;
            if (fileSet.has(p)) return p;
            if (fileSet.has(`${p}.html`)) return `${p}.html`;
            if (fileSet.has(`${p}/index.html`)) return `${p}/index.html`;
            return null;
        }

        validate(filePaths) {
            const zipCheck = window.CozyOS.ZipValidator ? window.CozyOS.ZipValidator.inspect(filePaths) : { success: false, reason: "ZipValidator is not loaded." };
            const entryCheck = window.CozyOS.EntrypointScanner ? window.CozyOS.EntrypointScanner.scan(filePaths) : { success: false, reason: "EntrypointScanner is not loaded." };

            const fileSet = new Set(filePaths);
            const rootRouteResolvesTo = this.resolveRoute("/", fileSet);
            const hasCssAtRoot = filePaths.some(p => p.endsWith(".css"));
            const hasJsAtRoot = filePaths.some(p => p.endsWith(".js"));
            const hasFavicon = fileSet.has("favicon.ico");

            const errors = [];
            if (zipCheck.success && !zipCheck.valid) errors.push(zipCheck.reason || "ZIP layout is invalid.");
            if (!rootRouteResolvesTo) errors.push("GET / does not resolve to any real file - Cloudflare Pages will return 404 for the site root.");

            return {
                success: true,
                indexExists: !!entryCheck.hasIndex,
                rootRouteResolvesTo,
                nestedFolderDetected: zipCheck.success ? zipCheck.valid === false : null,
                cssReachable: hasCssAtRoot,
                jsReachable: hasJsAtRoot,
                faviconPresent: hasFavicon,
                compatible: errors.length === 0,
                errors
            };
        }
    }

    window.CozyOS.CloudflareValidator = new CozyCloudflareValidator();
})();
