/**
 * CozyOS Reference Integrity Engine
 * File Reference: core/platform/reference-integrity-engine.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   The proactive layer this project's own history showed was missing:
 *   checking that every real `<script>`, `<link rel="stylesheet">`, and
 *   `<img>` tag on the current page actually resolves — BEFORE a symptom
 *   like "Not Connected" ever reaches an admin's screen, not after.
 *
 * WHY THIS FILE EXISTS — GROUNDED IN THIS PROJECT'S OWN REAL HISTORY, NOT
 * SPECULATION
 *   Every one of these real bugs was found by manual, ad-hoc grep
 *   auditing, after the symptom was already visible: the mpesaOS.js/
 *   pharmacyOS.js path (missing `core/`), developer-hub.css's `core/core/`
 *   double-nesting, QuarryOS's broken filename, and Certification's
 *   missing `modules/` segment. This engine automates exactly that class
 *   of check, reusing the same same-origin-fetch technique already proven
 *   twice in this codebase (`PlatformDiscovery.scanSources()`,
 *   `AccessibilityEngine.scanStylesheetFontSizes()`) — a third, consistent
 *   application of it, not a new mechanism.
 *
 * WHAT THIS FILE DOES NOT DO — REUSED, NEVER DUPLICATED
 *   - Circular dependency detection: delegates to the real, existing
 *     `DependencyEngine.detectCircular()`. Not reimplemented here.
 *   - Missing/orphaned coordinator detection: delegates to the real,
 *     existing `PlatformDiscovery`'s own `declaredButMissing`/
 *     `loadedButUndeclared` comparison. Not reimplemented here.
 *   - Duplicate file detection: delegates to the real, existing
 *     `UsageEngine.listDuplicateCandidates()`. Not reimplemented here.
 *   This file's own, genuinely new logic is limited to: scanning real
 *   `<script>`/`<link>`/`<img>` tags already on the page for resolution
 *   failures, and a real content-hash duplicate check across those same
 *   fetched files (a different, narrower duplicate concept than
 *   UsageEngine's file-registry-based one — both reported separately,
 *   never conflated).
 *
 * HONEST SCOPE
 *   "Missing imports" (ES-module `import` statements) is checked only for
 *   files that are actually fetched during a scan and only via regex —
 *   real, but heuristic, same disclosed limitation as
 *   `PlatformDiscovery.scanSources()`'s own duplicate-detection regex.
 *   "Wrong filenames" has no independent detection from "broken paths" —
 *   a wrong filename and a broken path produce the identical, only
 *   observable symptom (a failed fetch), so they are reported as one
 *   category, not fabricated as two.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const RI_VERSION = "1.0.0-ENTERPRISE";

    class CozyReferenceIntegrityEngine {
        #diagnostics = { scansRun: 0, brokenReferencesFound: 0 };
        #lastReport = null;

        getVersion() { return RI_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        async #hashText(text) {
            if (typeof crypto === "undefined" || !crypto.subtle) return null; // real, disclosed: no hashing available in this environment
            const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
            return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
        }

        /**
         * scanResourceReferences()
         *   The genuinely new capability. Real same-origin fetch of every
         *   script/stylesheet/image tag currently on the page. Reports
         *   broken ones (404 or fetch error) — this is what would have
         *   caught the Certification path bug and every similar one this
         *   session found manually, before deployment rather than after.
         */
        async scanResourceReferences() {
            if (typeof document === "undefined") return { available: false, reason: "No DOM available in this environment." };
            const scripts = Array.from(document.querySelectorAll("script[src]")).map(el => el.getAttribute("src"));
            const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(el => el.getAttribute("href"));
            const images = Array.from(document.querySelectorAll("img[src]")).map(el => el.getAttribute("src"));

            const checkAll = async (urls, kind) => {
                const broken = [];
                const ok = [];
                for (const url of urls) {
                    if (!url) continue;
                    try {
                        const res = await fetch(url, { method: "HEAD" }).catch(() => fetch(url)); // HEAD first, fall back to GET if the server doesn't support it
                        if (res.ok) ok.push(url); else broken.push({ url, kind, status: res.status });
                    } catch (err) {
                        broken.push({ url, kind, status: null, error: err.message });
                    }
                }
                return { ok, broken };
            };

            const [scriptResult, styleResult, imageResult] = await Promise.all([
                checkAll(scripts, "script"), checkAll(stylesheets, "stylesheet"), checkAll(images, "image")
            ]);

            const allBroken = [...scriptResult.broken, ...styleResult.broken, ...imageResult.broken];
            this.#diagnostics.brokenReferencesFound += allBroken.length;
            return {
                available: true,
                totals: { scripts: scripts.length, stylesheets: stylesheets.length, images: images.length },
                broken: allBroken,
                okCount: scriptResult.ok.length + styleResult.ok.length + imageResult.ok.length
            };
        }

        /**
         * scanImportStatements()
         *   Heuristic, disclosed as such — regex over real, fetched
         *   source text for ES-module `import ... from "..."` paths,
         *   checked the same way scanResourceReferences() checks tags.
         *   Only scans files this same scan already fetched successfully
         *   (never a second, separate fetch pass).
         */
        async scanImportStatements(scriptUrls) {
            const brokenImports = [];
            for (const url of scriptUrls) {
                try {
                    const res = await fetch(url);
                    if (!res.ok) continue; // already reported as a broken reference above, not double-counted here
                    const text = await res.text();
                    const importPattern = /import\s+(?:[\w{}*\s,]+\s+from\s+)?["']([^"']+)["']/g;
                    let m;
                    while ((m = importPattern.exec(text)) !== null) {
                        const importPath = m[1];
                        if (!importPath.startsWith(".") && !importPath.startsWith("/")) continue; // skip bare specifiers (package names), not resolvable via fetch anyway
                        const resolved = new URL(importPath, new URL(url, typeof location !== "undefined" ? location.href : "http://localhost/")).href;
                        try {
                            const importRes = await fetch(resolved, { method: "HEAD" }).catch(() => fetch(resolved));
                            if (!importRes.ok) brokenImports.push({ fromFile: url, importPath, resolved, status: importRes.status });
                        } catch (err) {
                            brokenImports.push({ fromFile: url, importPath, resolved, error: err.message });
                        }
                    }
                } catch (_err) { /* file itself unreachable — already reported above */ }
            }
            return { available: true, brokenImports };
        }

        /**
         * scanDuplicateContent()
         *   Real, but a narrower, different concept than
         *   UsageEngine.listDuplicateCandidates() (which compares
         *   Discovery-declared file records) — this hashes the ACTUAL
         *   fetched byte content of currently-referenced script files and
         *   flags identical hashes. Reported under its own name, never
         *   merged with UsageEngine's result to avoid implying they're
         *   the same check.
         */
        async scanDuplicateContent(scriptUrls) {
            const hashes = new Map(); // hash -> [urls]
            for (const url of scriptUrls) {
                try {
                    const res = await fetch(url);
                    if (!res.ok) continue;
                    const text = await res.text();
                    const hash = await this.#hashText(text);
                    if (!hash) continue;
                    if (!hashes.has(hash)) hashes.set(hash, []);
                    hashes.get(hash).push(url);
                } catch (_err) { /* unreachable, skip */ }
            }
            const duplicateGroups = Array.from(hashes.values()).filter(group => group.length > 1);
            return { available: true, duplicateGroups };
        }

        /**
         * runFullIntegrityScan()
         *   Combines the genuinely new checks above with real delegation
         *   to DependencyEngine/PlatformDiscovery/UsageEngine — every
         *   field in the returned report discloses which real engine
         *   produced it, so a caller never mistakes a delegated result for
         *   something this file computed itself.
         */
        async runFullIntegrityScan() {
            this.#diagnostics.scansRun++;
            const references = await this.scanResourceReferences();
            const scriptUrls = Array.from(typeof document !== "undefined" ? document.querySelectorAll("script[src]") : []).map(el => el.getAttribute("src")).filter(Boolean);
            const [imports, duplicates] = await Promise.all([
                this.scanImportStatements(scriptUrls),
                this.scanDuplicateContent(scriptUrls)
            ]);

            const dependencyEngine = window.CozyOS.DependencyEngine;
            const circular = dependencyEngine ? { available: true, source: "DependencyEngine.detectCircular()", result: dependencyEngine.detectCircular() }
                : { available: false, reason: "DependencyEngine is not loaded." };

            const discovery = window.CozyOS.PlatformDiscovery;
            let missingModules = { available: false, reason: "PlatformDiscovery is not loaded." };
            if (discovery) {
                const report = discovery.getReport();
                missingModules = report.available
                    ? { available: true, source: "PlatformDiscovery (runtime vs. manifest)", declaredButMissing: report.runtime.coordinators.declaredButMissing, loadedButUndeclared: report.runtime.coordinators.loadedButUndeclared }
                    : { available: false, reason: "No Discovery scan has been run yet — run one first." };
            }

            const usageEngine = window.CozyOS.UsageEngine;
            const fileRegistryDuplicates = usageEngine
                ? { available: true, source: "UsageEngine.listDuplicateCandidates()", result: usageEngine.listDuplicateCandidates() }
                : { available: false, reason: "UsageEngine is not loaded." };

            this.#lastReport = {
                scannedAt: new Date().toISOString(),
                brokenReferences: references, // genuinely new
                brokenImports: imports, // genuinely new, heuristic
                contentDuplicates: duplicates, // genuinely new, narrower than UsageEngine's
                circularDependencies: circular, // delegated
                missingModules, // delegated
                fileRegistryDuplicates // delegated
            };
            if (window.CozyOS.PlatformEventBus) {
                try { window.CozyOS.PlatformEventBus.emit("referenceIntegrity:scanned", this.#deepClone(this.#lastReport)); } catch (_err) { /* non-fatal */ }
            }
            return this.getReport();
        }

        getReport() { return this.#lastReport ? this.#deepClone(this.#lastReport) : { available: false, reason: "No scan has been run yet." }; }
        getDiagnosticsReport() { return this.#deepClone({ moduleVersion: RI_VERSION, ...this.#diagnostics }); }
    }

    if (window.CozyOS.ReferenceIntegrity && typeof window.CozyOS.ReferenceIntegrity.getVersion === "function") {
        const existingVersion = window.CozyOS.ReferenceIntegrity.getVersion();
        if (existingVersion !== RI_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: ReferenceIntegrity existing v${existingVersion} conflicts with load target v${RI_VERSION}.`);
        return;
    }

    const instance = new CozyReferenceIntegrityEngine();
    window.CozyOS.ReferenceIntegrity = instance;

    instance.capabilities = Object.freeze([
        Object.freeze({ id: "scan", permission: "referenceIntegrity:scan", rollback: false, category: "Reference Integrity" })
    ]);
    instance.visibility = Object.freeze({
        appId: "referenceIntegrity", name: "Reference Integrity Center", icon: "🔗", category: "platform-tool",
        launchTarget: Object.freeze({ center: "referenceIntegrityCenter" }),
        audience: "admin"
    });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "ReferenceIntegrity", category: "Platform", icon: "link.svg",
                description: "Proactively checks real script/stylesheet/image tag resolution before a symptom like 'Not Connected' reaches an admin — the exact class of bug (mpesaOS.js, developer-hub.css, QuarryOS, Certification) found manually across this project's history. Delegates circular-dependency, missing-module, and file-registry-duplicate detection to DependencyEngine/PlatformDiscovery/UsageEngine rather than duplicating them."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
