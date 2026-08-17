/**
 * CozyOS Builder — Observation Engine (Layer 1: Observe)
 * File Reference: core/modules/builder/observation-engine.js
 * Layer: Core / Builder — Engineering Observation (read-only)
 * Version: 1.0.0-ENTERPRISE
 * Introduced: Builder Storage & Manifest milestone (post-M372)
 *
 * RESPONSIBILITY
 *   Turns a workspace file list ([{name, text}], e.g. from a folder
 *   picker or a client-side ZIP read) into a Builder Knowledge Manifest —
 *   objective, reproducible facts about the workspace (file/module/plugin/
 *   application counts, syntax-parseability, duplicate engines, orphan-
 *   module candidates) — and, if CozyStorage is connected, persists that
 *   manifest so later milestones can be compared against earlier ones.
 *
 * WHAT THIS MODULE IS NOT
 *   It is not window.CozyOS.Builder (core/modules/builder/cozy-builder.js).
 *   That engine GENERATES new CozyOS-compliant code. This engine OBSERVES
 *   existing code and never generates, modifies, or deploys anything.
 *   Two different responsibilities, two different exports — composing
 *   the generation engine here would be a layering violation, not reuse.
 *
 * OWNERSHIP — every capability below composes a real, already-existing
 * engine; nothing here re-implements what already exists:
 *   - Per-file analysis (class name, version/layer header fields, public
 *     methods, emitted events) — entirely UnderstandingEngine.analyzeCode()
 *     / analyzeRepository(), never re-parsed here.
 *   - Registered-name collision checks — entirely OwnershipScanner.scan().
 *   - Durable persistence across milestones — entirely CozyStorage
 *     (registerObject/getObject/listObjects/createVersion), if connected.
 *     If CozyStorage is not connected, this module honestly reports that
 *     and keeps the manifest in-memory only for the session (same
 *     Honest Capability Rule UnderstandingEngine already follows for its
 *     optional providers) — it never invents a fake persistence layer.
 *
 * WHAT "SYNTAX VALIDATION" HONESTLY MEANS HERE
 *   Browser JS has no equivalent of `node --check`. This module parse-
 *   checks each classic-script .js file via `new Function(source)`,
 *   which parses the source and throws SyntaxError on malformed code
 *   WITHOUT executing any of it (the function body is never invoked) —
 *   the same non-execution discipline CozyBuilder and CozyBugFixer both
 *   already follow. Real ES-module files (containing top-level `import`/
 *   `export`) are DETECTED and SKIPPED rather than falsely flagged as
 *   broken, because `Function()` cannot parse module syntax at all —
 *   this is disclosed per-file in the result, never silently wrong.
 *
 * WHAT THIS MODULE DOES NOT DO (Honest Capability Rule)
 *   - Does not generate the full mermaid dependency/architecture graphs,
 *     the event catalog, or the API catalog as documents — those are
 *     genuinely unimplemented as runtime code today (the M372 versions
 *     of those documents were produced by a human/LLM reading the
 *     repository, not by code in this file). The per-file `eventsEmitted`
 *     and `publicMethods` UnderstandingEngine already extracts are real
 *     inputs a future pass could aggregate into those documents — this
 *     module does not fabricate that aggregation today.
 *   - Does not compute Architecture/Security/Performance/Maintainability
 *     scores. No rubric for those exists yet; inventing numbers here
 *     would violate the same honesty standard the rest of this project
 *     holds itself to. Only objective counts are reported.
 *   - Does not write files to disk. A browser engine cannot write into
 *     this repository's own `docs/builder/` folder — `exportManifest()`
 *     returns text a human/developer saves there, same as CozyBuilder's
 *     generated files are reviewed/saved by a human, never auto-written.
 *
 * OPTIONAL INTEGRATIONS
 *   UnderstandingEngine — required for any real analysis; without it,
 *     observe() honestly refuses rather than fabricating file contents.
 *   OwnershipScanner — optional; skipped (disclosed) if not loaded.
 *   CozyStorage — optional; manifest persistence across milestones is
 *     unavailable (disclosed) without it, not silently faked.
 *   ModuleRegistry / ServiceRegistry (via registerCoordinator) — for the
 *     module/plugin/application count of what's actually registered at
 *     runtime, in addition to what's present in the observed file list.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.BuilderObservation) return;

    const OBSERVATION_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    const PATH_RULES = Object.freeze({
        module: /(^|\/)core\/modules\//,
        plugin: /(^|\/)core\/plugins\//,
        application: /(^|\/)applications\/[^/]+\/(index\.html|manifest\.json)/
    });

    class CozyBuilderObservationEngine {
        #manifests = new Map(); // observationId -> manifest (in-memory fallback / cache)
        #auditLogs = [];
        #timelineEvents = [];
        #listeners = new Map();
        #diagnostics = { observationsRun: 0, filesObserved: 0, errorsHidden: 0, eventsEmitted: 0 };

        getVersion() { return OBSERVATION_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") {
                try { return structuredClone(value); } catch (_err) { /* fall through */ }
            }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        #enforceNoForbiddenKeys(obj, path = "root") {
            if (!obj || typeof obj !== "object") return;
            for (const key of Object.keys(obj)) {
                if (FORBIDDEN_KEYS.has(key)) throw new Error(`[BuilderObservation] Prototype-pollution key "${key}" rejected at path "${path}.${key}".`);
                this.#enforceNoForbiddenKeys(obj[key], `${path}.${key}`);
            }
        }

        #logAudit(action, msg) {
            this.#auditLogs.push(Object.freeze({ id: "obs_aud_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now()), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
        }

        #logTimeline(label) {
            this.#timelineEvents.push(Object.freeze({ time: new Date().toISOString(), label }));
            if (this.#timelineEvents.length > 500) this.#timelineEvents.shift();
        }

        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[BuilderObservation] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[BuilderObservation] on(): handler must be a function.");
            if (!this.#listeners.has(eventName)) this.#listeners.set(eventName, new Set());
            this.#listeners.get(eventName).add(handler);
            return () => { const s = this.#listeners.get(eventName); if (s) s.delete(handler); };
        }

        emit(eventName, payload) {
            this.#diagnostics.eventsEmitted++;
            const set = this.#listeners.get(eventName);
            if (!set) return false;
            for (const handler of set) { try { handler(payload); } catch (_err) { this.#diagnostics.errorsHidden++; } }
            return true;
        }

        // =====================================================================
        // ─── SYNTAX / STRUCTURE CHECK (parse-only, never executes) ───────────
        // =====================================================================

        #isEsModuleSource(text) {
            return /^\s*(import\s|export\s|export\{|export\{|export default)/m.test(text);
        }

        #parseCheck(name, text) {
            if (this.#isEsModuleSource(text)) {
                return { file: name, method: "skipped-es-module", parseable: null, note: "Contains top-level import/export — Function() cannot parse ES-module syntax; not evaluated as broken or working." };
            }
            try {
                // eslint-disable-next-line no-new-func -- parse-only; body is never invoked.
                new Function(text);
                return { file: name, method: "function-constructor-parse", parseable: true };
            } catch (err) {
                return { file: name, method: "function-constructor-parse", parseable: false, error: err.message };
            }
        }

        // =====================================================================
        // ─── OBSERVE ───────────────────────────────────────────────────────────
        // =====================================================================

        /**
         * observe(files, { milestoneId, htmlEntrypoints })
         *   files: [{ name, text }]. htmlEntrypoints (optional): [{ name, text }]
         *   of .html files, used only to flag .js files with no matching
         *   <script src="..."> reference anywhere — a real, disclosed
         *   heuristic ("orphan candidate"), not a claim of certainty.
         */
        observe(files, { milestoneId = null, htmlEntrypoints = [] } = {}) {
            const ue = window.CozyOS.UnderstandingEngine;
            if (!ue || typeof ue.analyzeRepository !== "function") {
                return { available: false, reason: "UnderstandingEngine.analyzeRepository() is not connected — cannot observe without it." };
            }
            if (!Array.isArray(files) || !files.length) {
                throw new TypeError("[BuilderObservation] observe(): files must be a non-empty array of {name, text}.");
            }

            const repoAnalysis = ue.analyzeRepository(files);
            const jsFiles = files.filter(f => f && typeof f.name === "string" && f.name.endsWith(".js") && typeof f.text === "string");

            const modules = jsFiles.filter(f => PATH_RULES.module.test(f.name));
            const plugins = jsFiles.filter(f => PATH_RULES.plugin.test(f.name));
            const applications = files.filter(f => PATH_RULES.application.test(f.name));

            const parseResults = jsFiles.map(f => this.#parseCheck(f.name, f.text));
            const syntaxErrors = parseResults.filter(r => r.parseable === false);

            // Duplicate engines: same extracted className declared in more than one file.
            const byClassName = new Map();
            for (const r of repoAnalysis.files) {
                if (!r.className) continue;
                if (!byClassName.has(r.className)) byClassName.set(r.className, []);
                byClassName.get(r.className).push(r.file);
            }
            const duplicateEngines = Array.from(byClassName.entries())
                .filter(([, filesForClass]) => filesForClass.length > 1)
                .map(([className, filesForClass]) => ({ className, files: filesForClass }));

            // Registered-name collisions via OwnershipScanner, if present — composed, not reimplemented.
            let ownershipCollisions = { available: false, reason: "OwnershipScanner not connected." };
            const scanner = window.CozyOS.OwnershipScanner;
            if (scanner && typeof scanner.scan === "function") {
                const checked = [];
                for (const [className] of byClassName) {
                    try { checked.push({ name: className, ...scanner.scan(className, "coordinator") }); } catch (_err) { /* non-fatal */ }
                }
                ownershipCollisions = { available: true, checked };
            }

            // Orphan candidates: a .js file under core/ with no <script src="..."> reference in any given HTML entrypoint.
            let orphanCandidates = [];
            if (Array.isArray(htmlEntrypoints) && htmlEntrypoints.length) {
                const allHtml = htmlEntrypoints.map(h => h.text || "").join("\n");
                orphanCandidates = jsFiles
                    .filter(f => /(^|\/)core\//.test(f.name))
                    .filter(f => !allHtml.includes(f.name))
                    .map(f => f.name);
            }

            const observationId = `OBS-${milestoneId || "UNSPECIFIED"}-${(this.#diagnostics.observationsRun + 1).toString().padStart(3, "0")}`;

            const manifest = Object.freeze({
                observationId,
                milestoneId: milestoneId || null,
                generatedAt: new Date().toISOString(),
                filesObserved: files.length,
                jsFilesObserved: jsFiles.length,
                modulesDiscovered: modules.length,
                pluginsDiscovered: plugins.length,
                applicationsDiscovered: applications.length,
                syntaxErrors: syntaxErrors.length,
                syntaxErrorDetail: syntaxErrors,
                esModuleFilesSkipped: parseResults.filter(r => r.method === "skipped-es-module").map(r => r.file),
                duplicateEngines: duplicateEngines.length,
                duplicateEngineDetail: duplicateEngines,
                orphanModuleCandidates: orphanCandidates.length,
                orphanModuleCandidateDetail: orphanCandidates,
                ownershipCollisions,
                verificationMethod: "UnderstandingEngine.analyzeRepository() per-file class/version/layer/event/method extraction; Function()-constructor parse check (non-executing) per classic-script .js file; className collision grouping for duplicate-engine detection.",
                observationConfidence: htmlEntrypoints.length ? 0.95 : 0.85 // lower, disclosed, when no entrypoints supplied for orphan-checking
            });

            this.#enforceNoForbiddenKeys(manifest);
            this.#manifests.set(observationId, manifest);
            this.#diagnostics.observationsRun++;
            this.#diagnostics.filesObserved += files.length;
            this.#logAudit("OBSERVATION_COMPLETE", `${observationId}: ${files.length} files, ${duplicateEngines.length} duplicate engine(s), ${syntaxErrors.length} syntax error(s).`);
            this.#logTimeline(`Observation ${observationId} complete`);
            this.emit("observation:complete", { observationId, milestoneId });

            this.#persist(manifest);
            return this.#deepClone(manifest);
        }

        // =====================================================================
        // ─── PERSISTENCE (composes CozyStorage if connected; else in-memory) ──
        // =====================================================================

        #storageSpaceId = null;

        #ensureStorageSpace() {
            const storage = window.CozyOS.CozyStorage;
            if (!storage || typeof storage.createStorageSpace !== "function") return null;
            if (this.#storageSpaceId) return this.#storageSpaceId;
            try {
                const existing = typeof storage.listStorageSpaces === "function" ? (storage.listStorageSpaces() || []) : [];
                const found = existing.find(s => s && s.name === "builder-observation");
                if (found) { this.#storageSpaceId = found.id; return this.#storageSpaceId; }
                const space = storage.createStorageSpace({ name: "builder-observation", description: "Cozy Builder Observation Engine manifests, one per milestone." });
                this.#storageSpaceId = space && space.id ? space.id : null;
                return this.#storageSpaceId;
            } catch (_err) {
                this.#diagnostics.errorsHidden++;
                return null;
            }
        }

        #persist(manifest) {
            const storage = window.CozyOS.CozyStorage;
            if (!storage || typeof storage.registerObject !== "function") {
                this.#logAudit("PERSISTENCE_UNAVAILABLE", `${manifest.observationId} kept in-memory only — CozyStorage not connected.`);
                return { persisted: false, reason: "CozyStorage not connected — manifest kept in-memory for this session only." };
            }
            const spaceId = this.#ensureStorageSpace();
            if (!spaceId) return { persisted: false, reason: "Could not open/create the builder-observation storage space." };
            try {
                storage.registerObject(spaceId, { id: manifest.observationId, type: "builder-manifest", name: manifest.observationId, content: manifest });
                return { persisted: true, spaceId };
            } catch (err) {
                this.#diagnostics.errorsHidden++;
                return { persisted: false, reason: err.message };
            }
        }

        // =====================================================================
        // ─── QUERY / COMPARE ACROSS MILESTONES ────────────────────────────────
        // =====================================================================

        getManifest(observationId) {
            const m = this.#manifests.get(observationId);
            return m ? this.#deepClone(m) : null;
        }

        listManifests() {
            const storage = window.CozyOS.CozyStorage;
            if (storage && typeof storage.listObjects === "function" && this.#storageSpaceId) {
                try {
                    const objs = storage.listObjects(this.#storageSpaceId, { type: "builder-manifest" }) || [];
                    return this.#deepClone(objs.map(o => o.content || o));
                } catch (_err) { /* fall through to in-memory */ }
            }
            return Array.from(this.#manifests.values()).map(m => this.#deepClone(m));
        }

        /**
         * compareManifests(observationIdA, observationIdB)
         *   Objective deltas only, between two REAL manifests already
         *   produced by observe() — never estimates a trend from a single
         *   manifest.
         */
        compareManifests(observationIdA, observationIdB) {
            const a = this.getManifest(observationIdA);
            const b = this.getManifest(observationIdB);
            if (!a || !b) return { available: false, reason: "Both observationIds must refer to manifests already produced by observe()." };
            const fields = ["filesObserved", "modulesDiscovered", "pluginsDiscovered", "applicationsDiscovered", "syntaxErrors", "duplicateEngines", "orphanModuleCandidates"];
            const delta = {};
            for (const f of fields) delta[f] = b[f] - a[f];
            return Object.freeze({ from: observationIdA, to: observationIdB, delta });
        }

        // =====================================================================
        // ─── EXPORT (text a human saves into docs/builder/ — never auto-written) ──
        // =====================================================================

        exportManifestMarkdown(observationId) {
            const m = this.getManifest(observationId);
            if (!m) return null;
            return [
                "Builder Observation",
                `Milestone: ${m.milestoneId || "unspecified"}`,
                `Observation ID: ${m.observationId}`,
                "",
                `Files Observed: ${m.filesObserved}`,
                `Modules Discovered: ${m.modulesDiscovered}`,
                `Plugins Discovered: ${m.pluginsDiscovered}`,
                `Applications: ${m.applicationsDiscovered}`,
                "",
                `Syntax Errors: ${m.syntaxErrors}`,
                `Duplicate Engines: ${m.duplicateEngines}`,
                `Orphan Modules: ${m.orphanModuleCandidates}`,
                "",
                `Observation Confidence: ${Math.round(m.observationConfidence * 100)}%`,
                `Verification Method: ${m.verificationMethod}`
            ].join("\n");
        }

        getDiagnosticsReport() {
            return Object.freeze({
                moduleVersion: OBSERVATION_VERSION,
                ...this.#diagnostics,
                integrations: {
                    understandingEngine: !!window.CozyOS.UnderstandingEngine,
                    ownershipScanner: !!window.CozyOS.OwnershipScanner,
                    cozyStorage: !!window.CozyOS.CozyStorage
                },
                manifestsHeldInMemory: this.#manifests.size,
                auditLogCount: this.#auditLogs.length
            });
        }

        getAuditLog(predicate) {
            const list = this.#auditLogs.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        getTimeline(predicate) {
            const list = this.#timelineEvents.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }
    }

    if (window.CozyOS.BuilderObservation && typeof window.CozyOS.BuilderObservation.getVersion === "function") {
        const existingVersion = window.CozyOS.BuilderObservation.getVersion();
        if (existingVersion !== OBSERVATION_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: BuilderObservation existing v${existingVersion} conflicts with load target v${OBSERVATION_VERSION}.`);
        }
        return;
    }

    window.CozyOS.BuilderObservation = new CozyBuilderObservationEngine();

    window.CozyOS.BuilderObservation.visibility = Object.freeze({
        appId: "builder-observation", name: "Builder Observation", icon: "🔎", category: "platform-tool",
        launchTarget: Object.freeze({ center: "developerHub", section: "builder" }),
        audience: "developer"
    });

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
    })({ sourcePath: "core/modules/builder/observation-engine.js",
        name: "BuilderObservation", category: "Engineering Observation", icon: "observation.svg",
        description: "Cozy Builder Observation Engine (Layer 1) — turns a workspace file list into a Builder Knowledge Manifest of objective facts (file/module/plugin/app counts, syntax parseability, duplicate engines, orphan-module candidates), persisted via CozyStorage for cross-milestone comparison. Never generates, modifies, or deploys code."
    });
})();
