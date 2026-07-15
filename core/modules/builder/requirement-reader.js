/**
 * CozyOS Enterprise Framework — CozyRequirementReader
 * File Reference: core/modules/builder/requirement-reader.js
 * Version: 1.0.0-ENTERPRISE
 * Layer: Core / Code Generation — Enterprise Requirement Reader
 *
 * RESPONSIBILITY
 *   Turns an uploaded file into a structured, editable Requirement
 *   Summary — the module identity, public interface, internal
 *   structure, dependencies, existing quality features, and dev notes
 *   (TODO/FIXME/NOTE) — so Builder/BugFixer/Certification can work from
 *   what already exists instead of asking the user to re-describe it in
 *   prose.
 *
 * WHAT THIS MODULE ACTUALLY DOES
 *   - Delegates identity/public-method/event extraction entirely to
 *     UnderstandingEngine.analyzeCode() — never duplicates that logic.
 *   - Adds real, regex-based extraction this project doesn't have yet:
 *     private methods/fields, constants, window.CozyOS.* dependency
 *     references, quality-feature presence checks (audit log, timeline,
 *     snapshot, deep freeze, forbidden keys, escapeHtml), and
 *     TODO/FIXME/NOTE comment extraction.
 *   - generateRequirementSummary() produces a real, editable text
 *     summary built entirely from the above — every line traces to an
 *     actual regex match, never inferred prose.
 *
 * WHAT THIS MODULE DOES NOT DO (Honest Capability Rule)
 *   - "Business domain" / "Module purpose" / "Suggested improvements"
 *     are NOT genuine understanding — they reuse UnderstandingEngine's
 *     own disclosed keyword heuristic (applicationType) rather than
 *     inventing a new, undisclosed classification.
 *   - ZIP project support is honestly unavailable — no ZIP library is
 *     loaded in this environment. readZipProject() reports
 *     {available:false} rather than fabricating extraction.
 *   - Never executes the uploaded source.
 *
 * OPTIONAL INTEGRATIONS
 *   UnderstandingEngine — the only code-analysis path this module uses.
 *   RequirementAnalyzer — generateRequirementSummary()'s output can be
 *                        fed into its analyzeRequirement() by the
 *                        caller; this file doesn't call it directly,
 *                        keeping the dependency one-directional.
 *   ServiceRegistry     — registerCoordinator(), with retry.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const RR_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    const QUALITY_FEATURES = Object.freeze({
        "Audit Logging": /#auditLogs|#logAudit/,
        "Timeline Support": /#timelineEvents|#logTimeline/,
        "Snapshot Support": /exportSnapshot\s*\(/,
        "Deep Freeze": /#deepFreeze|Object\.freeze/,
        "Prototype Pollution Guard": /FORBIDDEN_KEYS/,
        "HTML Escaping": /#escapeHtml/,
        "Diagnostics": /getDiagnosticsReport\s*\(/,
        "Event Bus": /\bemit\s*\(|(^|\s)on\s*\(/m
    });

    class CozyOSRequirementReader {
        #readings = new Map();
        #auditLogs = []; #timelineEvents = []; #listeners = new Map();
        #diagnostics = { filesRead: 0, summariesGenerated: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 2.2 };

        getVersion() { return RR_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #logAudit(a, m) { this.#auditLogs.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action: a, msg: m })); if (this.#auditLogs.length > 500) this.#auditLogs.shift(); }
        #logTimeline(l) { this.#timelineEvents.push(Object.freeze({ time: new Date().toISOString(), label: l })); if (this.#timelineEvents.length > 500) this.#timelineEvents.shift(); }
        getAuditLog(p) { const l = this.#auditLogs.map(e => this.#deepClone(e)); return Object.freeze(p ? l.filter(p) : l); }
        getTimeline(p) { const l = this.#timelineEvents.map(e => this.#deepClone(e)); return Object.freeze(p ? l.filter(p) : l); }
        on(e, h) { if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const r = s.delete(h); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { const w = (p) => { this.off(e, h); h(p); }; this.on(e, w); }
        emit(e, p) { const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s) return false; for (const fn of Array.from(s)) { try { fn(this.#deepClone(p)); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        #ue() { return (window.CozyOS && window.CozyOS.UnderstandingEngine) || null; }

        // =====================================================================
        // ─── EXTRACTION ───────────────────────────────────────────────────────
        // =====================================================================

        #extractPrivateMembers(sourceText) {
            const fields = Array.from(sourceText.matchAll(/^\s{4,12}#([A-Za-z][A-Za-z0-9_]*)\s*=/gm)).map(m => m[1]);
            const methods = Array.from(sourceText.matchAll(/^\s{4,12}#([A-Za-z][A-Za-z0-9_]*)\s*\(/gm)).map(m => m[1]);
            return { privateFields: Array.from(new Set(fields)), privateMethods: Array.from(new Set(methods)) };
        }

        #extractConstants(sourceText) {
            return Array.from(new Set(Array.from(sourceText.matchAll(/\bconst\s+([A-Z][A-Z0-9_]{2,})\s*=/g)).map(m => m[1])));
        }

        #extractDependencies(sourceText, ownClassName = null) {
            const refs = Array.from(sourceText.matchAll(/window\.CozyOS\.([A-Za-z][A-Za-z0-9_]*)/g)).map(m => m[1]);
            const unique = Array.from(new Set(refs)).filter(name => name !== "CozyOS" && name !== ownClassName);
            return {
                references: unique,
                workspaceUsage: unique.includes("WorkspaceShell"),
                serviceRegistryUsage: unique.includes("ServiceRegistry") || /registerCoordinator/.test(sourceText),
                certificationIntegration: unique.includes("Certification"),
                builderIntegration: unique.includes("Builder"),
                bugFixerIntegration: unique.includes("BugFixer")
            };
        }

        #extractQualityFeatures(sourceText) {
            return Object.entries(QUALITY_FEATURES).filter(([, pattern]) => pattern.test(sourceText)).map(([name]) => name);
        }

        #extractDevNotes(sourceText) {
            const grab = (tag) => {
                const lineStyle = Array.from(sourceText.matchAll(new RegExp(`//\\s*${tag}:?\\s*(.+)`, "g"))).map(m => m[1].trim());
                const blockStyle = Array.from(sourceText.matchAll(new RegExp(`/\\*\\s*${tag}:?\\s*([^*]+?)\\s*\\*/`, "g"))).map(m => m[1].trim());
                return Array.from(new Set([...lineStyle, ...blockStyle]));
            };
            return { todos: grab("TODO"), fixes: grab("FIX(?:ME)?"), notes: grab("NOTE") };
        }

        #extractDocumentation(sourceText) {
            const headerMatch = /\/\*\*([\s\S]*?)\*\//.exec(sourceText);
            return headerMatch ? headerMatch[1].split("\n").map(l => l.replace(/^\s*\*\s?/, "").trim()).filter(Boolean) : [];
        }

        /**
         * readFile(filename, sourceText)
         *   The real, complete extraction — public identity/methods/
         *   events from UnderstandingEngine.analyzeCode() (never
         *   duplicated), plus this module's own real additions.
         */
        readFile(filename, sourceText) {
            const ue = this.#ue();
            if (!ue) throw new Error("[RequirementReader] UnderstandingEngine is not connected — no code-analysis path is available.");
            if (typeof sourceText !== "string" || !sourceText.trim()) throw new TypeError("[RequirementReader] readFile(): sourceText is required.");

            const base = ue.analyzeCode(sourceText);
            const { privateFields, privateMethods } = this.#extractPrivateMembers(sourceText);
            const constants = this.#extractConstants(sourceText);
            const dependencies = this.#extractDependencies(sourceText, base.className);
            const qualityFeatures = this.#extractQualityFeatures(sourceText);
            const devNotes = this.#extractDevNotes(sourceText);
            const documentation = this.#extractDocumentation(sourceText);

            const readingId = this.#generateId("read");
            const reading = Object.freeze({
                id: readingId, filename: this.#escapeHtml(filename), readAt: new Date().toISOString(),
                identity: { className: base.className, version: base.version, filePath: base.filePath, layer: base.layer, namespace: base.className ? `window.CozyOS.${base.className}` : null },
                publicInterface: { methods: base.publicMethods, events: base.eventsEmitted },
                internalStructure: { privateFields, privateMethods, constants },
                dependencies, qualityFeatures, devNotes, documentation,
                sourceLength: sourceText.length, lineCount: sourceText.split("\n").length
            });
            this.#readings.set(readingId, reading);
            this.#diagnostics.filesRead++;
            this.#logAudit("FILE_READ", `${filename}: ${base.className || "unknown class"}`);
            this.#logTimeline(`Read: ${filename}`);
            this.emit("requirement:fileRead", { readingId, filename });
            return this.#deepClone(reading);
        }

        getReading(id) { const r = this.#readings.get(id); return r ? this.#deepClone(r) : null; }
        listReadings(predicate) { const l = Array.from(this.#readings.values()).map(r => this.#deepClone(r)); return Object.freeze(predicate ? l.filter(predicate) : l); }

        /**
         * readZipProject(_arrayBuffer)
         *   Honestly unavailable — no ZIP library is loaded in this
         *   environment. Real, disclosed extension point.
         */
        readZipProject(_arrayBuffer) {
            return { available: false, reason: "No ZIP-reading provider is loaded in this environment. Supported today: .js, .html, .css, .json, .md, .txt via readFile()." };
        }

        // =====================================================================
        // ─── REQUIREMENT SUMMARY ────────────────────────────────────────────
        // =====================================================================

        /**
         * generateRequirementSummary(readingId, { businessDomainText })
         *   businessDomainText is optional plain-language text (e.g. the
         *   file's own header purpose line, or something the user types)
         *   run through UnderstandingEngine.analyzeText() for
         *   applicationType — the SAME disclosed keyword heuristic used
         *   everywhere else, never a new undisclosed classifier.
         */
        generateRequirementSummary(readingId, { businessDomainText = null } = {}) {
            const reading = this.#readings.get(readingId);
            if (!reading) throw new Error(`[RequirementReader] generateRequirementSummary(): no reading "${readingId}".`);
            this.#diagnostics.summariesGenerated++;

            const ue = this.#ue();
            let applicationType = null;
            if (businessDomainText && ue) { try { applicationType = ue.analyzeText(businessDomainText).applicationType; } catch (_err) { /* optional */ } }

            const lines = [`Module: ${reading.identity.className || reading.filename}`];
            if (applicationType) lines.push(`Purpose: ${applicationType}`);
            if (reading.identity.version) lines.push(`Version: ${reading.identity.version}`);
            if (reading.identity.namespace) lines.push(`Namespace: ${reading.identity.namespace}`);

            const existing = [];
            if (reading.publicInterface.methods.length) existing.push(`Public methods: ${reading.publicInterface.methods.join(", ")}`);
            if (reading.publicInterface.events.length) existing.push(`Events: ${reading.publicInterface.events.join(", ")}`);
            if (reading.qualityFeatures.length) existing.push(`Enterprise features: ${reading.qualityFeatures.join(", ")}`);
            if (existing.length) lines.push("", "Existing capabilities:", ...existing.map(e => `- ${e}`));

            const missing = Object.keys(QUALITY_FEATURES).filter(f => !reading.qualityFeatures.includes(f));
            if (missing.length) lines.push("", "Missing capabilities:", ...missing.map(m => `- ${m}`));

            if (reading.devNotes.todos.length || reading.devNotes.fixes.length || reading.devNotes.notes.length) {
                lines.push("", "Developer notes found in source:");
                for (const t of reading.devNotes.todos) lines.push(`- TODO: ${t}`);
                for (const f of reading.devNotes.fixes) lines.push(`- FIX: ${f}`);
                for (const n of reading.devNotes.notes) lines.push(`- NOTE: ${n}`);
            }

            if (reading.dependencies.references.length) lines.push("", `Dependencies: ${reading.dependencies.references.join(", ")}`);

            const summary = lines.join("\n");
            this.emit("requirement:summaryGenerated", { readingId });
            return summary;
        }

        // =====================================================================
        // ─── MULTI-FILE PROJECT UNDERSTANDING ───────────────────────────────
        // Real cross-file aggregation over readFile() results — never a
        // second, separate analysis pass. Every field below traces to an
        // actual fact already extracted from the individual readings.
        // =====================================================================

        /**
         * synthesizeProjectRequirement(readings)
         *   Replaces plain per-file summary concatenation with a real,
         *   deterministic cross-reference: which classes are coordinators
         *   (registered), which private members repeat across files
         *   (shared utilities, a real name-collision signal — not proven
         *   code sharing), which dependencies are referenced but never
         *   found among the readings themselves (missing modules), which
         *   files look like entry points (real Service Registry self-
         *   registration pattern). "Project purpose" reuses
         *   UnderstandingEngine's own disclosed keyword heuristic on the
         *   combined documentation text — never a new, undisclosed
         *   classifier.
         */
        /**
         * synthesizeProjectRequirement(readings, { manifest, totalProjectFileCount })
         *   manifest (optional) — the real, already-parsed manifest.json
         *   object, when one exists in the project. Its name/short_name/
         *   description become the authoritative project identity and
         *   purpose — a manifest is a genuine, human-authored source of
         *   truth, more reliable than inferring identity from a single
         *   JS file's internal class name (which may legitimately differ
         *   from the application's public name, e.g. an internal engine
         *   class vs. the app's branded name).
         *   totalProjectFileCount (optional) — the real total file count
         *   from the whole uploaded project (e.g. from
         *   ProjectRefactor.buildProjectModel()), so the summary can
         *   honestly report "N JavaScript file(s) analyzed of M total"
         *   instead of implying the JS count IS the whole project.
         */
        synthesizeProjectRequirement(readings, { manifest = null, totalProjectFileCount = null } = {}) {
            if (!Array.isArray(readings) || readings.length === 0) throw new TypeError("[RequirementReader] synthesizeProjectRequirement(): readings array is required.");
            const ue = this.#ue();

            const classNames = new Set(readings.map(r => r.identity.className).filter(Boolean));
            const coordinators = readings.filter(r => r.dependencies.serviceRegistryUsage).map(r => r.identity.className).filter(Boolean);
            const entryPoints = readings.filter(r => r.dependencies.serviceRegistryUsage).map(r => r.filename);

            // Shared utilities: a private method/field name appearing in
            // 2+ files — a real name-collision signal, disclosed as such,
            // not a proof of actual code sharing.
            const memberCounts = new Map();
            for (const r of readings) {
                for (const m of [...r.internalStructure.privateMethods, ...r.internalStructure.privateFields]) {
                    memberCounts.set(m, (memberCounts.get(m) || 0) + 1);
                }
            }
            const sharedUtilities = Array.from(memberCounts.entries()).filter(([, count]) => count > 1).map(([name]) => name);

            // Dependencies referenced anywhere but not found among the
            // uploaded readings' own class names — real, computed gap.
            const allReferences = new Set(readings.flatMap(r => r.dependencies.references));
            const missingModules = Array.from(allReferences).filter(ref => !classNames.has(ref) && !["registerCoordinator", "WorkspaceShell", "ServiceRegistry", "Certification", "Builder", "BugFixer"].includes(ref));

            const allEvents = Array.from(new Set(readings.flatMap(r => r.publicInterface.events)));
            const allConstants = Array.from(new Set(readings.flatMap(r => r.internalStructure.constants)));
            const combinedDocs = readings.flatMap(r => r.documentation).join(" ");

            // Manifest is the authoritative source when present — a real,
            // human-declared name/purpose beats inferring one from a
            // single JS class name or generic keyword matching.
            const projectName = manifest && (manifest.short_name || manifest.name) ? (manifest.short_name || manifest.name) : null;
            let purpose = manifest && manifest.description ? manifest.description : null;
            if (!purpose && ue && combinedDocs.trim()) { try { purpose = ue.analyzeText(combinedDocs).applicationType; } catch (_err) { /* optional */ } }

            const synthesis = {
                projectName, jsFileCount: readings.length, totalProjectFileCount,
                purpose, purposeSource: manifest && manifest.description ? "manifest.json" : (purpose ? "keyword heuristic on JS header comments" : null),
                modules: Array.from(classNames),
                coordinators: Array.from(new Set(coordinators)),
                entryPoints: Array.from(new Set(entryPoints)),
                sharedUtilities, missingModules,
                events: allEvents, constants: allConstants,
                assets: readings.filter(r => !r.identity.className).map(r => r.filename),
                manifestVersion: manifest && manifest.version ? manifest.version : null,
                method: "real cross-file aggregation over readFile() results, plus real manifest.json fields when present — not a new analysis pass"
            };
            this.#logAudit("PROJECT_SYNTHESIZED", `${readings.length} JS file(s)${totalProjectFileCount ? ` of ${totalProjectFileCount} total` : ""}, ${synthesis.modules.length} module(s)${projectName ? `, project="${projectName}"` : ""}`);
            return this.#deepClone(synthesis);
        }

        /** generateProjectRequirementSummary(readings, options) — real, editable text built from synthesizeProjectRequirement(), replacing plain per-file concatenation. Same optional {manifest, totalProjectFileCount} as synthesizeProjectRequirement(). */
        generateProjectRequirementSummary(readings, options = {}) {
            const synthesis = this.synthesizeProjectRequirement(readings, options);
            const lines = [`Project: ${synthesis.projectName || "(name not declared in manifest.json — inferred from analyzed files below)"}`];
            lines.push(synthesis.totalProjectFileCount
                ? `Files: ${synthesis.totalProjectFileCount} total in project — ${synthesis.jsFileCount} JavaScript file(s) analyzed`
                : `JavaScript files analyzed: ${synthesis.jsFileCount}`);
            if (synthesis.manifestVersion) lines.push(`Version (from manifest.json): ${synthesis.manifestVersion}`);
            if (synthesis.purpose) lines.push(`Purpose: ${synthesis.purpose} (source: ${synthesis.purposeSource})`);
            if (synthesis.modules.length) lines.push("", "Modules:", ...synthesis.modules.map(m => `- ${m}`));
            if (synthesis.coordinators.length) lines.push("", "Coordinators (Service Registry integration detected):", ...synthesis.coordinators.map(m => `- ${m}`));
            if (synthesis.entryPoints.length) lines.push("", "Entry Points:", ...synthesis.entryPoints.map(m => `- ${m}`));
            if (synthesis.sharedUtilities.length) lines.push("", "Shared Utilities (name repeats across files — verify actual sharing):", ...synthesis.sharedUtilities.map(m => `- ${m}`));
            if (synthesis.missingModules.length) lines.push("", "Missing Modules (referenced but not found among uploaded files):", ...synthesis.missingModules.map(m => `- ${m}`));
            if (synthesis.events.length) lines.push("", `Events: ${synthesis.events.join(", ")}`);
            if (synthesis.assets.length) lines.push("", "Non-module files:", ...synthesis.assets.map(m => `- ${m}`));
            return lines.join("\n");
        }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(RR_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ moduleVersion: RR_VERSION, ...this.#diagnostics, readingCount: this.#readings.size, integrationCount: this.#ue() ? 1 : 0 }); }
        exportSnapshot() { return this.#deepClone({ version: RR_VERSION, exportedAt: new Date().toISOString(), readings: Array.from(this.#readings.values()) }); }
        importSnapshot(s) { if (!s) throw new TypeError("[RequirementReader] importSnapshot(): invalid."); let n = 0; for (const r of (s.readings || [])) if (r?.id && !this.#readings.has(r.id)) { this.#readings.set(r.id, r); n++; } return { imported: n }; }
        isSnapshotCompatible(s) { return !!(s && typeof s.version === "string" && s.version.split(".")[0] === RR_VERSION.split(".")[0]); }
    }

    if (window.CozyOS.RequirementReader && typeof window.CozyOS.RequirementReader.getVersion === "function") {
        const existingVersion = window.CozyOS.RequirementReader.getVersion();
        if (existingVersion !== RR_VERSION) throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: RequirementReader existing v${existingVersion} conflicts with load target v${RR_VERSION}.`);
        return;
    }
    window.CozyOS.RequirementReader = new CozyOSRequirementReader();

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
        const intervalId = setInterval(() => {
            attempts++;
            if (attempt() || attempts >= 200) {
                clearInterval(intervalId);
                const idx = window.CozyOS.__pendingCoordinatorRegistrations.indexOf(descriptor);
                if (idx !== -1) window.CozyOS.__pendingCoordinatorRegistrations.splice(idx, 1);
            }
        }, 250);
    })({
        name: "RequirementReader", category: "Code Generation", icon: "requirement-reader.svg",
        description: "Real extraction of identity/public-interface/internal-structure/dependencies/quality-features/dev-notes from an uploaded file, built entirely on UnderstandingEngine.analyzeCode(). ZIP support honestly unavailable — no ZIP library loaded."
    });
})();
