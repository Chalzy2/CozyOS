/**
 * CozyOS Enterprise Framework — CozyBuilder Layer 2 Graph Composer
 * File Reference: core/modules/builder/layer2-graph-composer.js
 * Layer: Core / Builder — Architectural Understanding (Layer 2: cross-file)
 * Version: 1.0.0-ENTERPRISE
 * Introduced: M372 Layer 2 milestone
 *
 * RESPONSIBILITY
 *   Turns UnderstandingEngine's per-file facts (already extracted, never
 *   re-parsed here) into cross-file, repository-wide graphs: Module Graph,
 *   Dependency Graph, API Graph, Event Graph, Ownership Graph. This is the
 *   "Layer 2" aggregate-reasoning step that observation-engine.js's own
 *   header explicitly disclosed as genuinely unimplemented runtime code
 *   before this milestone (see docs/builder/reports/layer2-compose-
 *   analysis-AA-001.md, §5-6).
 *
 * OWNERSHIP BOUNDARY (why this is a separate file, not a change inside
 * understanding-engine.js)
 *   understanding-engine.js owns per-file/per-input structural extraction
 *   for CozyBuilder's generation-preview experience. That responsibility
 *   is unchanged and untouched by this file. This module owns a different,
 *   genuinely separate responsibility — aggregate reasoning ACROSS many
 *   files' already-extracted facts — and never performs its own source
 *   parsing. Every fact this module works with came from
 *   UnderstandingEngine.analyzeCode()/analyzeRepository() or
 *   OwnershipScanner.scan(); this file only combines, groups, and
 *   cross-references those facts.
 *
 * COMPOSES (never duplicates)
 *   - UnderstandingEngine.analyzeRepository(files) — per-file className,
 *     version, filePath, layer, publicMethods, eventsEmitted,
 *     eventsListened, exportedAs, dependsOnGlobals.
 *   - OwnershipScanner.scan(name, kind) — live registered-name collision
 *     checks, used directly when no BuilderObservation manifest is
 *     supplied.
 *   - BuilderObservation manifest (optional, via opts.manifest) — if a
 *     manifest from observe() is passed in, its own already-computed
 *     ownershipCollisions.checked list is reused verbatim for the
 *     Ownership Graph instead of re-scanning.
 *
 * WHAT THIS MODULE DOES NOT DO (Honest Capability Rule — see AA-002)
 *   Does not build a Data Flow Graph, UI Hierarchy, Startup Flow,
 *   Authentication Flow, Synchronization Flow, Plugin Relationship Graph,
 *   Service Relationship Graph, or Architecture Graph. No engine anywhere
 *   in this workspace currently extracts the signals those would require
 *   (runtime call sequencing, DOM structure, boot order, auth-chain
 *   composition, sync-chain composition). Building those honestly needs
 *   new extraction work, not just composition of what already exists —
 *   see AA-002 (docs/builder/knowledge/architecture-ambiguity-registry.md)
 *   for the per-graph missing-signal breakdown and recommended order.
 *   listUnsupportedGraphs() below returns that same list at runtime so a
 *   caller never has to guess what this module can't do.
 *
 * WHAT "DEPENDENCY" HONESTLY MEANS HERE
 *   This codebase does not use require()/import for internal wiring
 *   (verified repo-wide: zero matches for internal modules). Its real,
 *   consistently-used idiom is a live read of window.CozyOS.<Name> guarded
 *   by an IIFE self-registration block. The Dependency Graph's edges are
 *   built from exactly that signal (UnderstandingEngine's dependsOnGlobals/
 *   exportedAs fields) — a raw reference list resolved against exportedAs
 *   names found in the same analyzed file set. A reference to a name not
 *   found in that set is reported as unresolved, not silently dropped and
 *   not assumed missing (it may be a real file outside the analyzed set,
 *   e.g. a coordinator loaded from another page).
 *
 * OPTIONAL INTEGRATIONS
 *   OwnershipScanner   — required for a live Ownership Graph when no
 *                        manifest is supplied; honestly unavailable
 *                        without it or a manifest.
 *   BuilderObservation — optional; if its manifest is passed in,
 *                        Ownership Graph reuses its already-computed
 *                        collision data instead of re-scanning.
 *   ServiceRegistry    — registerCoordinator(), with retry, same pattern
 *                        as every other Builder engine.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const COMPOSER_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    // AA-002 — graphs this module deliberately does not build, and why.
    // Kept in code (not just in the doc registry) so callers get the same
    // honest answer at runtime without reading a separate file.
    const UNSUPPORTED_GRAPHS = Object.freeze([
        { graph: "Data Flow Graph", reason: "No engine traces value/state flow between modules; would need call-graph or runtime tracing, not present anywhere in the verified workspace.", registryRef: "AA-002" },
        { graph: "UI Hierarchy", reason: "No engine parses DOM/component structure from HTML/JS; UnderstandingEngine's Code Analyzer only reads header/class/method/event facts, never markup structure.", registryRef: "AA-002" },
        { graph: "Startup Flow", reason: "Real boot order exists only as <script> tag order in dashboard.html; no engine extracts or verifies that order today.", registryRef: "AA-002" },
        { graph: "Authentication Flow", reason: "auth-coordinator.js and related security/ files are real, but no engine traces the actual call chain between them into a flow graph.", registryRef: "AA-002" },
        { graph: "Synchronization Flow", reason: "No engine traces CozyStorage/CozyLive synchronization call sequencing.", registryRef: "AA-002" },
        { graph: "Plugin Relationship Graph", reason: "core/plugins/*.js exist and are analyzable per-file like any other module, but no engine maps plugin-to-host relationships specifically; would need host-registration signal not currently extracted.", registryRef: "AA-002" },
        { graph: "Service Relationship Graph", reason: "ServiceRegistry.getCoordinator()/getApplication() exist at runtime, but no engine snapshots and graphs their live relationships offline.", registryRef: "AA-002" },
        { graph: "Architecture Graph", reason: "docs/builder/architecture/01-architecture-graphs.md exists as a human/LLM-authored document (observation-engine.js's own header discloses this); no runtime engine generates it.", registryRef: "AA-002" }
    ]);

    class CozyOSLayer2GraphComposer {
        #auditLogs = [];
        #listeners = new Map();
        #diagnostics = { graphsBuilt: 0, filesComposed: 0, errorsHidden: 0, eventsEmitted: 0 };

        getVersion() { return COMPOSER_VERSION; }
        getId() { return "Layer2GraphComposer"; }
        getDependencies() { return ["UnderstandingEngine", "OwnershipScanner", "BuilderObservation"]; }

        #deepClone(value) {
            if (typeof structuredClone === "function") {
                try { return structuredClone(value); } catch (_err) { /* fall through */ }
            }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        #enforceNoForbiddenKeys(obj, path = "root") {
            if (!obj || typeof obj !== "object") return;
            for (const key of Object.keys(obj)) {
                if (FORBIDDEN_KEYS.has(key)) throw new Error(`[Layer2GraphComposer] Prototype-pollution key "${key}" rejected at path "${path}.${key}".`);
                this.#enforceNoForbiddenKeys(obj[key], `${path}.${key}`);
            }
        }

        #logAudit(action, msg) {
            this.#auditLogs.push(Object.freeze({ id: "l2_aud_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now()), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
        }

        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[Layer2GraphComposer] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[Layer2GraphComposer] on(): handler must be a function.");
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
        // ─── ENTRY POINT ────────────────────────────────────────────────────
        // =====================================================================

        /**
         * buildGraphs(files, { manifest, repoAnalysis })
         *   files: [{name, text}] — same shape UnderstandingEngine.
         *   analyzeRepository() and BuilderObservation.observe() already
         *   take. opts.repoAnalysis lets a caller who already ran
         *   analyzeRepository() pass its result in directly instead of
         *   this module re-running it. opts.manifest lets a caller who
         *   already ran BuilderObservation.observe() pass that manifest in
         *   so the Ownership Graph reuses its collision data instead of
         *   re-scanning OwnershipScanner.
         */
        buildGraphs(files, { manifest = null, repoAnalysis = null } = {}) {
            const ue = window.CozyOS.UnderstandingEngine;
            if (!repoAnalysis) {
                if (!ue || typeof ue.analyzeRepository !== "function") {
                    return { available: false, reason: "UnderstandingEngine.analyzeRepository() is not connected — Layer 2 cannot compose graphs without it, and will not fabricate per-file facts itself." };
                }
                if (!Array.isArray(files) || !files.length) {
                    throw new TypeError("[Layer2GraphComposer] buildGraphs(): files must be a non-empty array of {name, text}, or pass opts.repoAnalysis directly.");
                }
                repoAnalysis = ue.analyzeRepository(files);
            }

            const moduleGraph = this.buildModuleGraph(repoAnalysis);
            const dependencyGraph = this.buildDependencyGraph(repoAnalysis);
            const apiGraph = this.buildApiGraph(repoAnalysis);
            const eventGraph = this.buildEventGraph(repoAnalysis);
            const ownershipGraph = this.buildOwnershipGraph(repoAnalysis, { manifest });

            const result = {
                generatedAt: new Date().toISOString(),
                composerVersion: COMPOSER_VERSION,
                sourceUnderstandingEngineVersion: ue && typeof ue.getVersion === "function" ? ue.getVersion() : null,
                filesAnalyzed: repoAnalysis.totalFiles ?? null,
                jsFilesAnalyzed: repoAnalysis.jsFilesAnalyzed ?? (repoAnalysis.files ? repoAnalysis.files.length : null),
                moduleGraph, dependencyGraph, apiGraph, eventGraph, ownershipGraph,
                notYetImplemented: UNSUPPORTED_GRAPHS
            };
            this.#enforceNoForbiddenKeys(result);
            this.#diagnostics.graphsBuilt++;
            this.#diagnostics.filesComposed += (repoAnalysis.files ? repoAnalysis.files.length : 0);
            this.#logAudit("GRAPHS_BUILT", `${result.jsFilesAnalyzed ?? 0} files composed into 5 graphs; ${UNSUPPORTED_GRAPHS.length} graphs deliberately not built (see AA-002).`);
            this.emit("graphs:built", { filesAnalyzed: result.jsFilesAnalyzed });
            return this.#deepClone(result);
        }

        listUnsupportedGraphs() { return this.#deepClone(UNSUPPORTED_GRAPHS); }

        // =====================================================================
        // ─── MODULE GRAPH ───────────────────────────────────────────────────
        // Real signal: per-file className/version/layer/filePath, already
        // extracted by UnderstandingEngine. Grouped by declared Layer header
        // and by directory — both real, observable facts, not inferred.
        // =====================================================================

        buildModuleGraph(repoAnalysis) {
            const perFile = (repoAnalysis && repoAnalysis.files) || [];
            const nodes = perFile
                .filter(r => r.className)
                .map(r => ({
                    id: r.className, file: r.file, version: r.version,
                    layer: r.layer, filePath: r.filePath,
                    directory: r.file.includes("/") ? r.file.slice(0, r.file.lastIndexOf("/")) : "(root)"
                }));

            const byLayer = new Map();
            const byDirectory = new Map();
            for (const n of nodes) {
                const layerKey = n.layer || "(no Layer header declared)";
                if (!byLayer.has(layerKey)) byLayer.set(layerKey, []);
                byLayer.get(layerKey).push(n.id);
                if (!byDirectory.has(n.directory)) byDirectory.set(n.directory, []);
                byDirectory.get(n.directory).push(n.id);
            }

            return {
                nodes,
                totalModules: nodes.length,
                filesWithoutClassName: perFile.filter(r => !r.className).map(r => r.file),
                groupedByLayer: Object.fromEntries(byLayer),
                groupedByDirectory: Object.fromEntries(byDirectory),
                verificationMethod: "UnderstandingEngine.analyzeRepository() per-file className/version/layer/filePath extraction; grouped here by declared Layer header and by file directory. No inferred parent/child relationship beyond directory containment."
            };
        }

        // =====================================================================
        // ─── DEPENDENCY GRAPH ───────────────────────────────────────────────
        // Real signal: dependsOnGlobals / exportedAs (window.CozyOS.<Name>
        // reads and self-registration assignments), already extracted by
        // UnderstandingEngine v1.1.0. See file header for why this — not
        // require()/import — is this codebase's real dependency idiom.
        // =====================================================================

        buildDependencyGraph(repoAnalysis) {
            const perFile = (repoAnalysis && repoAnalysis.files) || [];
            const exportMap = new Map(); // exportedAs -> file
            for (const r of perFile) {
                if (r.exportedAs) exportMap.set(r.exportedAs, r.file);
            }

            const edges = [];
            const unresolved = [];
            for (const r of perFile) {
                for (const dep of (r.dependsOnGlobals || [])) {
                    if (exportMap.has(dep)) {
                        edges.push({ from: r.file, to: exportMap.get(dep), via: dep, resolved: true });
                    } else {
                        const entry = { from: r.file, via: dep, resolved: false, note: "Referenced name not found among analyzed files' self-registration exports — may be a real file outside the analyzed set, an optional/not-yet-loaded integration, or a non-engine property." };
                        edges.push(entry);
                        unresolved.push(entry);
                    }
                }
            }

            const cycles = this.#detectCycles(edges.filter(e => e.resolved));

            return {
                edges,
                totalEdges: edges.length,
                resolvedEdges: edges.length - unresolved.length,
                unresolvedReferences: unresolved,
                circularDependencies: cycles,
                verificationMethod: "UnderstandingEngine v1.1.0 per-file dependsOnGlobals (window.CozyOS.<Name> reads) and exportedAs (self-registration assignment) fields, resolved against each other within the analyzed file set. required-vs-optional distinction is not extracted (no signal distinguishes them in source); every edge here is a raw reference, not a confirmed hard dependency."
            };
        }

        // Standard DFS cycle detection over resolved file->file edges.
        #detectCycles(resolvedEdges) {
            const adjacency = new Map();
            for (const e of resolvedEdges) {
                if (!adjacency.has(e.from)) adjacency.set(e.from, []);
                adjacency.get(e.from).push(e.to);
            }
            const visited = new Set();
            const stack = new Set();
            const path = [];
            const cycles = [];

            const visit = (node) => {
                if (stack.has(node)) {
                    const cycleStart = path.indexOf(node);
                    cycles.push(path.slice(cycleStart).concat(node));
                    return;
                }
                if (visited.has(node)) return;
                visited.add(node); stack.add(node); path.push(node);
                for (const next of (adjacency.get(node) || [])) visit(next);
                stack.delete(node); path.pop();
            };
            for (const node of adjacency.keys()) visit(node);
            return cycles;
        }

        // =====================================================================
        // ─── API GRAPH (verified scope only) ───────────────────────────────
        // Real signal: publicMethods per file, already extracted. No public/
        // private/internal/deprecated distinction — that's not extractable
        // by regex from a method-name list alone, and is not claimed here.
        // =====================================================================

        buildApiGraph(repoAnalysis) {
            const perFile = (repoAnalysis && repoAnalysis.files) || [];
            const nodes = perFile
                .filter(r => r.className)
                .map(r => ({ className: r.className, file: r.file, methods: r.publicMethods || [], methodCount: (r.publicMethods || []).length }));

            return {
                nodes,
                totalMethods: nodes.reduce((sum, n) => sum + n.methodCount, 0),
                scopeNote: "Verified scope only: method names extracted from source structure (indentation-based regex, same as UnderstandingEngine.analyzeCode()). Does not distinguish public/private/internal/deprecated, does not identify consumers/callers, and does not check semantic compatibility across versions — none of that is extractable from the current signal."
            };
        }

        // =====================================================================
        // ─── EVENT GRAPH ────────────────────────────────────────────────────
        // Real signal: eventsEmitted (producer side, pre-existing) and
        // eventsListened (consumer side, UnderstandingEngine v1.1.0), cross-
        // referenced by event name within the analyzed file set only.
        // =====================================================================

        buildEventGraph(repoAnalysis) {
            const perFile = (repoAnalysis && repoAnalysis.files) || [];
            const producers = new Map(); // event -> [files]
            const consumers = new Map(); // event -> [files]
            for (const r of perFile) {
                for (const evt of (r.eventsEmitted || [])) {
                    if (!producers.has(evt)) producers.set(evt, []);
                    producers.get(evt).push(r.file);
                }
                for (const evt of (r.eventsListened || [])) {
                    if (!consumers.has(evt)) consumers.set(evt, []);
                    consumers.get(evt).push(r.file);
                }
            }
            const allEvents = new Set([...producers.keys(), ...consumers.keys()]);
            const events = Array.from(allEvents).map(evt => ({
                event: evt,
                producers: producers.get(evt) || [],
                consumers: consumers.get(evt) || [],
                noObservedConsumer: !consumers.has(evt),
                noObservedProducer: !producers.has(evt)
            }));

            return {
                events,
                totalEvents: events.length,
                verificationMethod: "UnderstandingEngine eventsEmitted (emit(\"...\") calls) and v1.1.0 eventsListened (.on(\"...\") calls), cross-referenced by literal event-name string within the analyzed file set only. An event with no observed consumer/producer may still have one outside the analyzed files — this is disclosed per-event, not treated as dead code."
            };
        }

        // =====================================================================
        // ─── OWNERSHIP GRAPH ────────────────────────────────────────────────
        // Reuses a supplied BuilderObservation manifest's already-computed
        // collision data verbatim when available; otherwise composes
        // OwnershipScanner.scan() directly. Never re-implements collision
        // detection.
        // =====================================================================

        buildOwnershipGraph(repoAnalysis, { manifest = null } = {}) {
            if (manifest && manifest.ownershipCollisions && manifest.ownershipCollisions.available) {
                return {
                    available: true,
                    source: "BuilderObservation manifest (reused, not re-scanned)",
                    observationId: manifest.observationId || null,
                    checked: manifest.ownershipCollisions.checked
                };
            }

            const scanner = window.CozyOS.OwnershipScanner;
            if (!scanner || typeof scanner.scan !== "function") {
                return { available: false, reason: "Neither a BuilderObservation manifest nor a connected OwnershipScanner was available — Ownership Graph cannot be produced honestly without real collision data, so none is fabricated." };
            }
            const perFile = (repoAnalysis && repoAnalysis.files) || [];
            const classNames = Array.from(new Set(perFile.filter(r => r.className).map(r => r.className)));
            const checked = classNames.map(name => { try { return { name, ...scanner.scan(name, "coordinator") }; } catch (_err) { return { name, safe: null, reason: "scan() threw — treated as unknown, not safe." }; } });
            return { available: true, source: "OwnershipScanner.scan() (live)", checked };
        }

        // =====================================================================
        // ─── DIAGNOSTICS ────────────────────────────────────────────────────
        // =====================================================================

        getDiagnosticsReport() {
            return this.#deepClone({
                moduleVersion: COMPOSER_VERSION,
                ...this.#diagnostics,
                unsupportedGraphCount: UNSUPPORTED_GRAPHS.length,
                dependencies: [
                    { name: "UnderstandingEngine", required: true, purpose: "Per-file structural facts — analyzeRepository()/analyzeCode()." },
                    { name: "OwnershipScanner", required: false, purpose: "Live collision checks for Ownership Graph when no manifest is supplied." },
                    { name: "BuilderObservation", required: false, purpose: "Reused manifest data for Ownership Graph, avoiding a re-scan." }
                ],
                auditLogCount: this.#auditLogs.length
            });
        }

        getAuditLog(predicate) {
            const list = this.#auditLogs.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        isVersionCompatible(version) {
            const a = /^v?(\d+)\./.exec(String(COMPOSER_VERSION));
            const b = /^v?(\d+)\./.exec(String(version || ""));
            if (!a || !b) return false;
            return a[1] === b[1];
        }
    }

    if (window.CozyOS.Layer2GraphComposer && typeof window.CozyOS.Layer2GraphComposer.getVersion === "function") {
        const existingVersion = window.CozyOS.Layer2GraphComposer.getVersion();
        if (existingVersion !== COMPOSER_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: Layer2GraphComposer existing v${existingVersion} conflicts with load target v${COMPOSER_VERSION}.`);
        }
        return;
    }

    window.CozyOS.Layer2GraphComposer = new CozyOSLayer2GraphComposer();

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
    })({ sourcePath: "core/modules/builder/layer2-graph-composer.js",
        name: "Layer2GraphComposer", category: "Living Engine", icon: "layer2-graph-composer.svg",
        description: "CozyBuilder's Layer 2 cross-file understanding — composes UnderstandingEngine + OwnershipScanner + BuilderObservation into Module/Dependency/API/Event/Ownership graphs. Builds only what verified signals support; see listUnsupportedGraphs() / AA-002 for the rest."
    });
})();
