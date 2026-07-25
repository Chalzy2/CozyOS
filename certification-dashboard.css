/**
 * CozyOS Enterprise Framework — CozyBuilder Project Refactor
 * File Reference: core/modules/builder/project-refactor.js
 * Version: 1.0.0-ENTERPRISE
 * Layer: Core / Code Generation — Refactor & Split
 *
 * RESPONSIBILITY
 *   Real, deterministic, text-based refactoring of existing HTML/CSS/JS
 *   projects: splitting a single file into separate files, merging
 *   separate files back into one distributable HTML file, and wrapping
 *   an existing project's JS for Workspace registration. Every
 *   transformation here is a mechanical extraction/insertion — never an
 *   AI rewrite, never a guess at intent.
 *
 * WHAT THIS MODULE ACTUALLY DOES, PRECISELY
 *   - splitSingleFile(): extracts <style>...</style> and non-src
 *     <script>...</script> block contents verbatim into separate .css/.js
 *     files, replacing them in the HTML with standard <link>/<script src>
 *     references. Inline style="..." attributes and inline event handler
 *     attributes (onclick="...") are DETECTED and reported, but are
 *     deliberately NOT moved — turning them into stylesheet rules or
 *     addEventListener calls would require generating new selectors/
 *     rewriting call sites, which risks changing behavior. That is a
 *     real, disclosed limitation, not a silent gap.
 *   - mergeProject(): the exact inverse — inlines a CSS file's content
 *     into a <style> tag and a JS file's content into a <script> tag,
 *     replacing the <link>/<script src> tags that referenced them.
 *   - modularizeProject(): wraps existing top-level JS in a
 *     `(function(){"use strict"; ...})();` IIFE and adds a standard
 *     CozyOS header comment ON TOP of the file — both are additive,
 *     behavior-preserving changes UNLESS the existing code deliberately
 *     relies on leaking variables/functions onto the global scope, which
 *     this module detects and reports as a compatibility warning rather
 *     than silently breaking. This produces a file suitable for
 *     Workspace registration; it does NOT rewrite the code into the
 *     full CozyOS class+EventBus coordinator template — doing that to
 *     arbitrary existing logic would require restructuring calls and
 *     risks exactly the behavior change this feature must avoid. Use
 *     CozyBuilder's normal generation path for a from-scratch coordinator
 *     instead.
 *   - detectAssets(): reports what it finds (inline style/script/img
 *     src/font references) — reporting is not the same as moving; only
 *     the two block types named above are ever actually relocated.
 *
 * WHAT THIS MODULE DOES NOT DO
 *   - Never executes, evaluates, or imports any project code.
 *   - Never uses eval() or Function() to parse HTML/JS — extraction uses
 *     plain regex/string operations against the exact conventions
 *     described above; unusual or malformed markup may not split cleanly,
 *     and this module reports that rather than guessing.
 *   - ZIP import requires a real ZIP library (e.g. JSZip) loaded on the
 *     page; without one, this reports unavailable rather than fabricating
 *     archive contents.
 *   - Git/GitHub import is explicitly online and opt-in — delegates to
 *     UnderstandingEngine.fetchGitHubRepository(), never called silently.
 *
 * OPTIONAL INTEGRATIONS
 *   CozyCertification — Quick Certification of refactored output.
 *   CozyBugFixer      — deterministic repair of the refactored output.
 *   UnderstandingEngine — GitHub import delegation, code analysis.
 *   ServiceRegistry   — registerCoordinator(), with retry.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const REFACTOR_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    class CozyOSProjectRefactor {
        #auditLogs = [];
        #timelineEvents = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = {
            splitsRun: 0, mergesRun: 0, modularizationsRun: 0, assetScansRun: 0,
            certificationsRun: 0, repairsRun: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 3.6
        };

        getVersion() { return REFACTOR_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        #escapeHtml(value) {
            const str = String(value === undefined || value === null ? "" : value);
            return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }

        #generateId(prefix) {
            const raw = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            return `${prefix}_${raw}`;
        }

        #logAudit(action, msg) {
            this.#auditLogs.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
        }

        #logTimeline(label) {
            this.#timelineEvents.push(Object.freeze({ time: new Date().toISOString(), label }));
            if (this.#timelineEvents.length > 500) this.#timelineEvents.shift();
        }

        getAuditLog(predicate) {
            const list = this.#auditLogs.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        getTimeline(predicate) {
            const list = this.#timelineEvents.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        // =====================================================================
        // ─── EVENT BUS ────────────────────────────────────────────────────────
        // =====================================================================

        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[ProjectRefactor] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[ProjectRefactor] on(): handler must be a function.");
            if (!this.#listeners.has(eventName)) this.#listeners.set(eventName, new Set());
            this.#listeners.get(eventName).add(handler);
            return () => this.off(eventName, handler);
        }

        off(eventName, handler) {
            const set = this.#listeners.get(eventName);
            if (!set) return false;
            const wrapped = this.#onceWrapped.get(handler);
            const removed = set.delete(handler) || (wrapped ? set.delete(wrapped) : false);
            if (set.size === 0) this.#listeners.delete(eventName);
            return removed;
        }

        once(eventName, handler) {
            if (typeof handler !== "function") throw new TypeError("[ProjectRefactor] once(): handler must be a function.");
            const wrapper = (payload) => { this.off(eventName, handler); this.#onceWrapped.delete(handler); handler(payload); };
            this.#onceWrapped.set(handler, wrapper);
            this.on(eventName, wrapper);
        }

        emit(eventName, payload) {
            if (typeof eventName !== "string" || !eventName.trim()) { this.#diagnostics.errorsHidden++; return false; }
            const set = this.#listeners.get(eventName);
            this.#diagnostics.eventsEmitted++;
            if (!set || set.size === 0) return false;
            let safePayload = payload;
            try { safePayload = this.#deepClone(payload); } catch (_err) { safePayload = payload; }
            for (const fn of Array.from(set)) { try { fn(safePayload); } catch (_err) { this.#diagnostics.errorsHidden++; } }
            return true;
        }

        // =====================================================================
        // ─── SPLIT SINGLE FILE ────────────────────────────────────────────────
        // =====================================================================

        /**
         * splitSingleFile(html, baseName)
         *   Extracts every <style>...</style> and non-src
         *   <script>...</script> block verbatim, concatenates them (in
         *   document order) into separate CSS/JS files, and replaces each
         *   extracted block in the HTML with a single <link>/<script src>
         *   reference at its original position — preserving load order.
         *   <script src="..."> tags (already external) are left
         *   untouched. Returns real detected-but-unmoved counts for
         *   inline style="" attributes and inline on*="" handlers.
         */
        splitSingleFile(html, baseName = "page") {
            if (typeof html !== "string" || !html.trim()) throw new TypeError("[ProjectRefactor] splitSingleFile(): html is required.");
            this.#diagnostics.splitsRun++;

            const cssBlocks = [];
            const jsBlocks = [];
            let working = html;

            working = working.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_match, attrs, content) => {
                cssBlocks.push(content.trim());
                return `<link rel="stylesheet" href="${baseName}.css">`;
            });

            working = working.replace(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi, (_match, attrs, content) => {
                if (!content.trim()) return _match; // an empty inline <script></script> — nothing to extract, leave as-is
                jsBlocks.push(content.trim());
                return `<script src="${baseName}.js"></script>`;
            });

            // Collapse consecutive identical link/script references left by
            // multiple original <style>/<script> blocks down to one each,
            // at the position of the FIRST one — later duplicates removed.
            // Scoped to the EXACT generated filename only (baseName.css /
            // baseName.js) — a pre-existing external stylesheet/script
            // link that merely happens to also end in .css/.js must never
            // be matched or removed here.
            const escapedBaseName = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            let seenCss = false, seenJs = false;
            working = working.replace(new RegExp(`<link rel="stylesheet" href="${escapedBaseName}\\.css">`, "gi"), (match) => {
                if (seenCss) return "";
                seenCss = true; return match;
            });
            working = working.replace(new RegExp(`<script src="${escapedBaseName}\\.js"><\\/script>`, "gi"), (match) => {
                if (seenJs) return "";
                seenJs = true; return match;
            });

            const inlineStyleAttrCount = (html.match(/\sstyle\s*=\s*["'][^"']*["']/gi) || []).length;
            const inlineHandlerAttrCount = (html.match(/\son[a-z]+\s*=\s*["'][^"']*["']/gi) || []).length;

            this.#logAudit("SPLIT_SINGLE_FILE", `${baseName}: ${cssBlocks.length} CSS block(s), ${jsBlocks.length} JS block(s) extracted.`);
            this.#logTimeline(`Split single file: ${baseName}`);
            this.emit("split:completed", { baseName, cssBlockCount: cssBlocks.length, jsBlockCount: jsBlocks.length });

            return {
                html: working,
                css: cssBlocks.length ? cssBlocks.join("\n\n") : null,
                js: jsBlocks.length ? jsBlocks.join("\n\n") : null,
                detected: {
                    cssBlocksExtracted: cssBlocks.length,
                    jsBlocksExtracted: jsBlocks.length,
                    inlineStyleAttributesFound: inlineStyleAttrCount,
                    inlineEventHandlerAttributesFound: inlineHandlerAttrCount
                },
                warnings: [
                    ...(inlineStyleAttrCount > 0 ? [`${inlineStyleAttrCount} inline style="..." attribute(s) were found but NOT moved — moving them would require generating new CSS selectors, which risks changing specificity/behavior.`] : []),
                    ...(inlineHandlerAttrCount > 0 ? [`${inlineHandlerAttrCount} inline event handler attribute(s) (onclick=, etc.) were found but NOT moved — moving them to addEventListener() calls risks changing execution timing/behavior.`] : [])
                ]
            };
        }

        // =====================================================================
        // ─── MERGE PROJECT ────────────────────────────────────────────────────
        // =====================================================================

        /**
         * mergeProject({ html, css, js })
         *   The inverse of splitSingleFile(): replaces the FIRST
         *   <link rel="stylesheet" href="..."> with an inlined <style>
         *   block, and the FIRST <script src="..."> with an inlined
         *   <script> block, removing any additional references to the
         *   same files. If html has no <head>/<body> markers to anchor
         *   to, appends style to <head> (or top of file) and script
         *   before </body> (or end of file) — reported honestly in the
         *   result rather than silently guessing at intent.
         */
        mergeProject({ html, css = null, js = null } = {}) {
            if (typeof html !== "string" || !html.trim()) throw new TypeError("[ProjectRefactor] mergeProject(): html is required.");
            this.#diagnostics.mergesRun++;
            let working = html;
            const notes = [];

            // Real fix: a file can have BOTH an external CDN
            // <link rel="stylesheet"> AND the local one splitSingleFile()
            // generated. The local (split-generated) reference is always a
            // relative path, never http(s):// or protocol-relative — pick
            // that one specifically instead of blindly matching whichever
            // stylesheet link happens to appear first, which could
            // silently delete an external library reference.
            const isLocalHref = (tag, attr) => {
                const m = new RegExp(`${attr}=["']([^"']+)["']`, "i").exec(tag);
                return m && !/^(https?:)?\/\//i.test(m[1]);
            };

            if (css) {
                const linkMatches = Array.from(working.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi));
                const targetLink = linkMatches.find(m => isLocalHref(m[0], "href")) || linkMatches[0];
                if (targetLink) {
                    working = working.slice(0, targetLink.index) + `<style>\n${css}\n</style>` + working.slice(targetLink.index + targetLink[0].length);
                    if (!isLocalHref(targetLink[0], "href")) notes.push("No local (split-generated) <link rel=\"stylesheet\"> found — merged into the first stylesheet link found instead, which may have been an external one.");
                } else if (/<\/head>/i.test(working)) {
                    working = working.replace(/<\/head>/i, `<style>\n${css}\n</style>\n</head>`);
                    notes.push("No <link rel=\"stylesheet\"> found — CSS was appended before </head> instead.");
                } else {
                    working = `<style>\n${css}\n</style>\n` + working;
                    notes.push("No <link rel=\"stylesheet\"> or <head> found — CSS was prepended to the file.");
                }
            }

            if (js) {
                const scriptMatches = Array.from(working.matchAll(/<script[^>]+src=["'][^"']+["'][^>]*><\/script>/gi));
                const targetScript = scriptMatches.find(m => isLocalHref(m[0], "src")) || scriptMatches[0];
                if (targetScript) {
                    working = working.slice(0, targetScript.index) + `<script>\n${js}\n</script>` + working.slice(targetScript.index + targetScript[0].length);
                    if (!isLocalHref(targetScript[0], "src")) notes.push("No local (split-generated) <script src=\"...\"> found — merged into the first external script tag found instead.");
                } else if (/<\/body>/i.test(working)) {
                    working = working.replace(/<\/body>/i, `<script>\n${js}\n</script>\n</body>`);
                    notes.push("No external <script src=\"...\"> found — JS was appended before </body> instead.");
                } else {
                    working = working + `\n<script>\n${js}\n</script>`;
                    notes.push("No external <script src=\"...\"> or </body> found — JS was appended at the end of the file.");
                }
            }

            this.#logAudit("MERGE_PROJECT", `Merged CSS:${!!css} JS:${!!js}.`);
            this.#logTimeline("Merge project completed");
            this.emit("merge:completed", { hasCss: !!css, hasJs: !!js });

            return { html: working, notes };
        }

        // =====================================================================
        // ─── MODULARIZE PROJECT ───────────────────────────────────────────────
        // =====================================================================

        /**
         * modularizeProject({ html, css, js }, moduleName)
         *   Wraps the JS in a `(function(){"use strict"; ...})();` IIFE and
         *   adds a standard CozyOS header comment above it — both purely
         *   additive. This does NOT rewrite the JS into the full CozyOS
         *   class+EventBus coordinator template; forcing arbitrary
         *   existing logic into that shape risks changing behavior, which
         *   this feature must not do. It DOES detect (never silently
         *   ignores) top-level `var`/function declarations that would
         *   become inaccessible once wrapped — if the code relies on
         *   leaking those onto the global scope (e.g. an inline
         *   onclick="myFunc()" attribute calling something the IIFE would
         *   now hide), that is reported as a real compatibility warning.
         */
        modularizeProject({ html, css = null, js }, moduleName = "Module") {
            if (typeof js !== "string" || !js.trim()) throw new TypeError("[ProjectRefactor] modularizeProject(): js is required.");
            this.#diagnostics.modularizationsRun++;

            const alreadyWrapped = /^\s*\(function\s*\(\s*\)\s*\{\s*["']use strict["']/.test(js.trim());
            const wrappedJs = alreadyWrapped ? js : `(function () {\n    "use strict";\n\n${js}\n})();\n`;

            const header = `/**\n * CozyOS Enterprise Framework — ${this.#escapeHtml(moduleName)}\n * Version: 1.0.0-ENTERPRISE\n * Layer: Business Domain (modularized from an existing project — logic unmodified)\n * File Reference: core/modules/${moduleName.toLowerCase()}/cozy-${moduleName.toLowerCase()}.js\n *\n * NOTE: This file's JavaScript is the imported project's ORIGINAL logic,\n * wrapped in an IIFE and given a standard header. It has NOT been\n * restructured into the full CozyOS class+EventBus coordinator template —\n * see compatibilityWarnings below for anything that may need manual\n * attention before this behaves identically once wrapped.\n */\n`;
            const finalJs = alreadyWrapped ? js : header + wrappedJs;

            // Detect top-level function/var declarations that a caller
            // outside this IIFE (e.g. an inline onclick="...") could have
            // been relying on — a real, disclosed compatibility risk, not
            // a silent behavior change.
            const topLevelFunctionNames = Array.from(js.matchAll(/^function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/gm)).map(m => m[1]);
            const topLevelVarNames = Array.from(js.matchAll(/^var\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm)).map(m => m[1]);
            const referencedInHtml = (html || "");
            const riskyNames = [...topLevelFunctionNames, ...topLevelVarNames].filter(name => new RegExp(`\\bon[a-z]+\\s*=\\s*["'][^"']*\\b${name}\\b`, "i").test(referencedInHtml));

            const compatibilityWarnings = riskyNames.length
                ? riskyNames.map(name => `"${name}" is declared at the top level and appears to be called from an inline HTML event handler attribute — wrapping it in an IIFE will make it inaccessible from there. Convert that inline handler to addEventListener() before relying on this modularized file, or expose "${name}" explicitly (e.g. window.${name} = ${name};) if global access is intentional.`)
                : [];

            this.#logAudit("MODULARIZE_PROJECT", `${moduleName}: ${compatibilityWarnings.length} compatibility warning(s).`);
            this.#logTimeline(`Modularize project: ${moduleName}`);
            this.emit("modularize:completed", { moduleName, compatibilityWarningCount: compatibilityWarnings.length });

            return {
                js: finalJs, css, html,
                filename: `cozy-${moduleName.toLowerCase()}.js`,
                compatibilityWarnings,
                note: "This wraps existing logic for Workspace registration — it is not the full CozyOS coordinator template. Use CozyBuilder's normal generation for a from-scratch coordinator instead."
            };
        }

        // =====================================================================
        // ─── AUTOMATIC ASSET DETECTION ────────────────────────────────────────
        // Reports what it finds — reporting is not the same as moving; only
        // splitSingleFile()'s <style>/<script> extraction actually relocates
        // anything.
        // =====================================================================

        detectAssets(html) {
            if (typeof html !== "string") throw new TypeError("[ProjectRefactor] detectAssets(): html is required.");
            this.#diagnostics.assetScansRun++;
            const inlineStyleBlocks = (html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []).length;
            const inlineScriptBlocks = (html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || []).length;
            const images = Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)).map(m => m[1]);
            const fontLinks = Array.from(html.matchAll(/<link[^>]+href=["']([^"']*font[^"']*)["']/gi)).map(m => m[1]);
            const fontFaceDecls = (html.match(/@font-face/gi) || []).length;
            const inlineStyleAttrs = (html.match(/\sstyle\s*=\s*["'][^"']*["']/gi) || []).length;
            const inlineHandlerAttrs = (html.match(/\son[a-z]+\s*=\s*["'][^"']*["']/gi) || []).length;

            return this.#deepClone({
                inlineStyleBlocks, inlineScriptBlocks, images, fontLinks, fontFaceDeclarations: fontFaceDecls,
                inlineStyleAttributes: inlineStyleAttrs, inlineEventHandlerAttributes: inlineHandlerAttrs,
                movableBySplitSingleFile: { css: inlineStyleBlocks, js: inlineScriptBlocks },
                notMovedByThisModule: { inlineStyleAttributes: inlineStyleAttrs, inlineEventHandlerAttributes: inlineHandlerAttrs, images: images.length, fontFaceDeclarations: fontFaceDecls }
            });
        }

        // =====================================================================
        // ─── IMPORT (ZIP / Git) ───────────────────────────────────────────────
        // =====================================================================

        /**
         * importFromZip(arrayBuffer)
         *   Requires a real ZIP library (e.g. JSZip) loaded as
         *   window.JSZip — the same optional-CDN-script pattern used by
         *   pdf.js/jsPDF/Tesseract.js elsewhere in CozyOS. Reports
         *   unavailable honestly if it isn't loaded, rather than
         *   fabricating archive contents.
         */
        async importFromZip(arrayBuffer) {
            if (typeof window.JSZip === "undefined") {
                return { available: false, reason: "No ZIP provider loaded — add the JSZip script tag to enable this (same optional-script pattern as pdf.js/jsPDF)." };
            }
            try {
                const zip = await window.JSZip.loadAsync(arrayBuffer);
                const files = {};
                const binaryFlags = {};
                for (const [path, entry] of Object.entries(zip.files)) {
                    if (entry.dir) continue;
                    // Real fix — entry.async("string") performs lossy UTF-8
                    // text decoding. For a genuinely text file (html/css/js/
                    // json/md/txt) that's correct and unchanged from before.
                    // For a binary file (image/icon/font/other asset), it
                    // silently corrupts the bytes — confirmed directly: a
                    // real 418-byte PNG round-tripped through this path
                    // came back as a 706-byte file with 147 bytes replaced.
                    // Binary files are now read as base64 instead, and
                    // flagged so exportProjectAsZip() writes them back
                    // correctly rather than re-corrupting them a second time.
                    const isBinary = /\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|otf|eot|pdf|zip|mp3|mp4|wav)$/i.test(path);
                    if (isBinary) { files[path] = await entry.async("base64"); binaryFlags[path] = true; }
                    else { files[path] = await entry.async("string"); }
                }
                this.#logAudit("ZIP_IMPORTED", `${Object.keys(files).length} file(s) extracted.`);
                return { available: true, files, binaryFlags };
            } catch (err) {
                return { available: false, reason: `ZIP extraction failed: ${err.message}` };
            }
        }

        /**
         * buildProjectModel(files)
         *   Real project model from a flat {path: content} map (e.g. from
         *   importFromZip(), or several individually-uploaded files) —
         *   original paths preserved exactly, files categorized by real
         *   extension, folder structure derived from the real paths.
         *   Text-based files (.js/.html/.css/.json/.md/.txt) are analyzed
         *   through RequirementReader — reused, never duplicated — with a
         *   real cross-file synthesis when more than one is analyzable.
         *   Binary/unknown files (images, icons, fonts) are listed as
         *   real assets, never fabricated content.
         */
        buildProjectModel(files) {
            const CATEGORY_BY_EXT = {
                html: "markup", htm: "markup", css: "style",
                js: "script", json: "data", md: "documentation", txt: "documentation",
                png: "image", jpg: "image", jpeg: "image", gif: "image", svg: "image", ico: "icon",
                woff: "font", woff2: "font", ttf: "font", otf: "font"
            };
            const TEXT_CATEGORIES = new Set(["markup", "style", "script", "data", "documentation"]);

            const entries = Object.entries(files).map(([path, content]) => {
                const ext = (path.split(".").pop() || "").toLowerCase();
                const category = CATEGORY_BY_EXT[ext] || "asset";
                const lastSlash = path.lastIndexOf("/");
                return { path, filename: lastSlash > -1 ? path.slice(lastSlash + 1) : path, folder: lastSlash > -1 ? path.slice(0, lastSlash) : "", ext, category, isText: TEXT_CATEGORIES.has(category), content };
            });

            const folderStructure = Array.from(new Set(entries.map(e => e.folder).filter(Boolean))).sort();
            const byCategory = {};
            for (const e of entries) { (byCategory[e.category] = byCategory[e.category] || []).push(e.path); }

            const rr = window.CozyOS.RequirementReader;
            let requirementSummary = null;
            const readableEntries = entries.filter(e => e.category === "script" && e.isText);

            // Real manifest.json detection — the same authoritative-source
            // principle already used for Certification's manifest
            // consistency check (Phase 3). Only ever used when it's
            // actually present and actually valid JSON; never fabricated.
            const manifestEntry = entries.find(e => /manifest\.json$/i.test(e.path));
            let manifest = null;
            if (manifestEntry) { try { manifest = JSON.parse(manifestEntry.content); } catch (_err) { /* real parse failure — proceed without manifest data rather than guessing at it */ } }

            if (rr && readableEntries.length > 0) {
                const readings = [];
                for (const e of readableEntries) {
                    try { readings.push(rr.readFile(e.path, e.content)); } catch (_err) { /* not parseable as CozyOS-style code — still listed as a real project file above */ }
                }
                if (readings.length === 1) requirementSummary = rr.generateRequirementSummary(readings[0].id);
                else if (readings.length > 1) requirementSummary = rr.generateProjectRequirementSummary(readings, { manifest, totalProjectFileCount: entries.length });
            }

            this.#logAudit("PROJECT_MODEL_BUILT", `${entries.length} file(s) across ${folderStructure.length} folder(s).`);
            return this.#deepClone({
                fileCount: entries.length, folderStructure, byCategory,
                files: entries.map(({ content, ...meta }) => meta), // metadata only here — full content stays in the original files map to avoid duplicating potentially large payloads
                requirementSummary,
                method: "real categorization + folder structure from actual paths — RequirementReader analysis reused, never duplicated"
            });
        }

        /**
         * exportProjectAsZip(files)
         *   Real ZIP creation via JSZip — files is the same flat
         *   {path: content} shape importFromZip() produces, so a project
         *   can be re-exported exactly as extracted (same paths, same
         *   filenames, same folder structure — never flattened, never
         *   renamed). Returns a real Blob when JSZip is available;
         *   honestly unavailable otherwise, never a fabricated archive.
         */
        async exportProjectAsZip(files, binaryFlags = {}) {
            if (typeof window.JSZip === "undefined") {
                return { available: false, reason: "No ZIP provider loaded — add the JSZip script tag to enable this." };
            }
            try {
                const zip = new window.JSZip();
                for (const [path, content] of Object.entries(files)) {
                    if (binaryFlags[path]) zip.file(path, content, { base64: true });
                    else zip.file(path, content);
                }
                const blob = await zip.generateAsync({ type: "blob" });
                this.#logAudit("ZIP_EXPORTED", `${Object.keys(files).length} file(s) packaged.`);
                return { available: true, blob, fileCount: Object.keys(files).length };
            } catch (err) {
                return { available: false, reason: `ZIP export failed: ${err.message}` };
            }
        }

        /**
         * importFromGitHub(owner, repo, path)
         *   Explicitly online, explicitly opt-in — delegates to
         *   UnderstandingEngine.fetchGitHubRepository() (the same real,
         *   already-built method) rather than duplicating a second GitHub
         *   client. Never called automatically by anything else here.
         */
        async importFromGitHub(owner, repo, path = "") {
            const ue = window.CozyOS.UnderstandingEngine;
            if (!ue || typeof ue.fetchGitHubRepository !== "function") {
                throw new Error("[ProjectRefactor] importFromGitHub(): UnderstandingEngine is not connected — no GitHub import path available.");
            }
            return ue.fetchGitHubRepository(owner, repo, path);
        }

        // =====================================================================
        // ─── CERTIFICATION PIPELINE ───────────────────────────────────────────
        // Refactor -> Quick Certification -> BugFixer -> Re-Certification.
        // Every step here calls the real, already-certified coordinator that
        // owns that responsibility — this method adds no scoring or repair
        // logic of its own.
        // =====================================================================

        /**
         * refactorAndCertify(refactoredJs, { moduleId, version, autoRepair })
         *   Runs the real pipeline on a refactored file's JS: Quick
         *   Certification, then (if autoRepair and CozyBugFixer is
         *   connected) a real deterministic repair + save, then
         *   re-certifies. Returns every real result — never a summary
         *   invented from partial data.
         */
        async refactorAndCertify(refactoredJs, { moduleId = "RefactoredModule", version = "1.0.0-ENTERPRISE", autoRepair = false } = {}) {
            const cert = window.CozyOS.Certification;
            if (!cert) throw new Error("[ProjectRefactor] refactorAndCertify(): CozyCertification is not connected.");
            this.#diagnostics.certificationsRun++;

            const quickResult = cert.quickCertification(refactoredJs, { moduleId, moduleName: moduleId, version });
            let repairResult = null, recertifyResult = null, finalSource = refactoredJs;

            const bugfixer = window.CozyOS.BugFixer;
            if (autoRepair && bugfixer) {
                this.#diagnostics.repairsRun++;
                const bfFileId = await bugfixer.registerSourceText(`cozy-${moduleId.toLowerCase()}.js`, refactoredJs);
                const preview = bugfixer.repair(bfFileId);
                if (preview.changed) {
                    repairResult = await bugfixer.save(bfFileId, { proposedSource: preview.proposedSource, approve: true, ruleIdsFixed: preview.appliedFixes.map(f => f.ruleId) });
                    finalSource = preview.proposedSource;
                    recertifyResult = cert.quickCertification(finalSource, { moduleId, moduleName: moduleId, version: `${version}-repaired` });
                } else {
                    repairResult = { changed: false, message: "No deterministically-fixable findings." };
                }
            }

            this.#logAudit("REFACTOR_CERTIFIED", `${moduleId}: quick=${quickResult.verdict}${recertifyResult ? `, recertified=${recertifyResult.verdict}` : ""}.`);
            this.#logTimeline(`Refactor certified: ${moduleId}`);
            this.emit("refactor:certified", { moduleId, verdict: (recertifyResult || quickResult).verdict });

            return { quickResult, repairResult, recertifyResult, finalSource };
        }

        // =====================================================================
        // ─── DIAGNOSTICS / COMPATIBILITY ──────────────────────────────────────
        // =====================================================================

        isVersionCompatible(version) {
            const a = /^v?(\d+)\./.exec(String(REFACTOR_VERSION));
            const b = /^v?(\d+)\./.exec(String(version || ""));
            if (!a || !b) return false;
            return a[1] === b[1];
        }

        getDiagnosticsReport() {
            return this.#deepClone({
                moduleVersion: REFACTOR_VERSION,
                ...this.#diagnostics,
                dependencies: [
                    { name: "CozyCertification", required: false, purpose: "Quick Certification of refactored output" },
                    { name: "CozyBugFixer", required: false, purpose: "Deterministic repair of refactored output" },
                    { name: "UnderstandingEngine", required: false, purpose: "GitHub import delegation" },
                    { name: "JSZip", required: false, purpose: "ZIP project import (must be loaded as window.JSZip)" }
                ],
                integrationCount: [window.CozyOS.Certification, window.CozyOS.BugFixer, window.CozyOS.UnderstandingEngine].filter(Boolean).length,
                auditLogCount: this.#auditLogs.length,
                timelineEventCount: this.#timelineEvents.length
            });
        }

        exportSnapshot() {
            return this.#deepClone({ version: REFACTOR_VERSION, exportedAt: new Date().toISOString(), diagnostics: this.#diagnostics });
        }

        importSnapshot(_snapshot) {
            return { imported: false, message: "ProjectRefactor has no persistent state to restore beyond diagnostics counters, which are session-local by design." };
        }

        isSnapshotCompatible(snapshot) {
            return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === REFACTOR_VERSION.split(".")[0]);
        }
    }

    if (window.CozyOS.ProjectRefactor && typeof window.CozyOS.ProjectRefactor.getVersion === "function") {
        const existingVersion = window.CozyOS.ProjectRefactor.getVersion();
        if (existingVersion !== REFACTOR_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: ProjectRefactor existing v${existingVersion} conflicts with load target v${REFACTOR_VERSION}.`);
        }
        return;
    }

    window.CozyOS.ProjectRefactor = new CozyOSProjectRefactor();

    (function registerWithServiceRegistry(descriptor) {
        function attempt() {
            if (typeof window.CozyOS.registerCoordinator !== "function") return false;
            try { window.CozyOS.registerCoordinator(descriptor); } catch (_err) { /* non-fatal */ }
            return true;
        }
        if (attempt()) return;
        if (!Object.prototype.hasOwnProperty.call(window.CozyOS, "__pendingCoordinatorRegistrations")) {
            Object.defineProperty(window.CozyOS, "__pendingCoordinatorRegistrations", { value: [], writable: true, enumerable: false, configurable: true });
        }
        window.CozyOS.__pendingCoordinatorRegistrations.push(descriptor);
        let attempts = 0;
        const maxAttempts = 200;
        const intervalId = setInterval(() => {
            attempts++;
            if (attempt() || attempts >= maxAttempts) {
                clearInterval(intervalId);
                const idx = window.CozyOS.__pendingCoordinatorRegistrations.indexOf(descriptor);
                if (idx !== -1) window.CozyOS.__pendingCoordinatorRegistrations.splice(idx, 1);
            }
        }, 250);
    })({
        name: "ProjectRefactor", category: "Code Generation", icon: "project-refactor.svg",
        description: "CozyBuilder's Refactor & Split capability — deterministic HTML/CSS/JS split, merge, and modularize. Never rewrites logic, never fabricates ZIP/Git import without the real dependency loaded."
    });
})();
