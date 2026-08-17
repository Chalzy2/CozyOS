/**
 * CozyOS Deployment — Entry Point Scanner
 * core/modules/builder/deployment/entrypoint-scanner.js
 *
 * OWNERSHIP: single responsibility only - determine whether a real
 * index.html exists in a given file list, and if not, identify real
 * candidate pages. Never picks a substitute automatically ("never
 * guess" per spec) - always returns a recommendation for a human/
 * caller to act on.
 *
 * HONEST SCOPE: operates only on a real, caller-supplied list of file
 * paths (e.g. from a real directory listing or ZIP entry list) - does
 * not itself scan a live filesystem, since the caller may be working
 * from a ZIP-entries array, a File System Access API listing, or a
 * fetched manifest. No network, no assumptions about content.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.EntrypointScanner) return;

    const CANDIDATE_PAGES = Object.freeze(["dashboard.html", "home.html", "app.html", "main.html"]);

    class CozyEntrypointScanner {
        /**
         * scan(filePaths)
         *   Real - filePaths is an array of real, repo-relative paths.
         *   Checks for a real "index.html" at the deployment root
         *   (i.e., a path with no directory separator), then checks the
         *   real candidate list. Never invents a recommendation beyond
         *   what's actually present.
         */
        scan(filePaths) {
            if (!Array.isArray(filePaths)) return { success: false, reason: "A real array of file paths is required." };

            const rootFiles = filePaths.filter(p => !p.includes("/"));
            const hasIndex = rootFiles.includes("index.html");

            if (hasIndex) {
                return { success: true, hasIndex: true, entryPoint: "index.html", recommendation: null };
            }

            const foundCandidates = CANDIDATE_PAGES.filter(c => rootFiles.includes(c));
            if (foundCandidates.length === 0) {
                return {
                    success: true, hasIndex: false, entryPoint: null, foundCandidates: [],
                    recommendation: "No real index.html or candidate entry page found at the deployment root. Cloudflare Pages will return 404 for GET /. A real entry page must be added before deployment."
                };
            }

            return {
                success: true, hasIndex: false, entryPoint: null, foundCandidates,
                recommendation: `Found real candidate page(s): ${foundCandidates.join(", ")}. None will be auto-selected. Choose one of: rename it to index.html, duplicate it as index.html, or generate a real redirect index.html that points to it.`
            };
        }

        /**
         * generateRedirectIndexHtml(targetPage)
         *   Real - produces genuine, minimal HTML that redirects to the
         *   real target page. Does not write any file itself - returns
         *   the real content for the caller to place.
         */
        generateRedirectIndexHtml(targetPage) {
            if (typeof targetPage !== "string" || !targetPage.trim()) {
                return { success: false, reason: "A real target page name is required." };
            }
            const html = `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${targetPage}"><title>Redirecting…</title></head><body><p>Redirecting to <a href="${targetPage}">${targetPage}</a>…</p></body></html>\n`;
            return { success: true, html };
        }
    }

    window.CozyOS.EntrypointScanner = new CozyEntrypointScanner();
})();
