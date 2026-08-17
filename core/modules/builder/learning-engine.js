/**
 * CozyOS Builder — Layer 4 — Learning Engine (Aggregator)
 * File: core/modules/builder/learning-engine.js
 * Milestone: M375 (Compose Report: docs/builder/compose/M375-compose-report.md)
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP — READ THIS BEFORE TOUCHING THIS FILE
 *   This is NOT the same engine as core/modules/leaning/learning-engine.js
 *   (window.CozyOS.LearningEngine). That engine is a real, separate,
 *   pre-existing coordinator for code-generation candidate patterns
 *   (UnderstandingEngine.submitCandidatePattern()). This engine
 *   (window.CozyOS.BuilderLearning) is a different, narrower thing:
 *   a read-only status aggregator over Builder's own Layers 1-3,
 *   CozyMemory, and the existing LearningEngine's own public API.
 *   Do not merge these two. Do not rename either to resolve the
 *   confusing directory typo ("leaning/") — that rename is out of
 *   scope for this milestone and was not approved.
 *
 * WHAT THIS MODULE ACTUALLY DOES
 *   - Composes BuilderObservation (Layer 1), UnderstandingEngine
 *     (Layer 2), AnalysisEngine (Layer 3), CozyMemory, and the
 *     existing LearningEngine — reads their real, already-computed
 *     diagnostics/status. Never re-parses files, never re-runs
 *     analysis, never duplicates their storage.
 *   - Exposes one place (getLearningStatus()) for a future Builder
 *     session, on any account, to see Builder's accumulated
 *     engineering context without re-discovering it from scratch.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO (Honest Capability Rule)
 *   - No Pattern Engine, Recommendation Engine, or Confidence Engine.
 *     Deferred per the M374 and M375 compose reports: only 2 repair
 *     records exist (RP-001, RP-002) — not enough signal to build a
 *     detector on. getPatternReadiness() reports that honestly instead
 *     of fabricating a recommendation.
 *   - No markdown registry parser/writer. The knowledge registries
 *     (RP/RG/SF/PF/DC/MD/AA/DI under docs/builder/knowledge/*.md),
 *     the metrics files under docs/builder/metrics/*.json, and the
 *     handoff documents under docs/builder/handoffs/*.md are real,
 *     but they are documentation artifacts, not part of the browser
 *     runtime object graph, and no existing engine loads them at
 *     runtime either. Building a parser for them was explicitly
 *     marked "Do Not Implement" in the M375 compose report. This
 *     engine reports those as { available: false } with a file
 *     pointer, rather than inventing a fetch/parse layer that was
 *     never verified or approved.
 *   - No new persistence. This engine owns no state of its own beyond
 *     an in-memory audit log, identical in spirit to how the existing
 *     LearningEngine owns none.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    // NOTE: deliberately a single guard (below, after the class
    // definition), not a redundant early "if (...) return;" here.
    // Observation-engine.js (Layer 1) has that redundant early guard,
    // which makes its own version-conflict check unreachable dead
    // code — verified during this milestone's Gate 3 smoke tests (see
    // M375 verification notes). Not fixed there (out of scope, would
    // be reopening a settled file without approval); fixed here since
    // this file is newly created this milestone.

    const BUILDER_LEARNING_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    // Real, verified file pointers for documentation-only artifacts this
    // engine cannot load into the runtime (see header). Kept as plain
    // reference data, not fetched or parsed.
    const KNOWLEDGE_REGISTRY_POINTERS = Object.freeze({
        RP: "docs/builder/knowledge/repair-history-registry.md",
        RG: "docs/builder/knowledge/regression-registry.md",
        SF: "docs/builder/knowledge/security-finding-registry.md",
        PF: "docs/builder/knowledge/performance-finding-registry.md",
        DC: "docs/builder/knowledge/duplicate-consolidation-registry.md",
        MD: "docs/builder/knowledge/missing-dependency-registry.md",
        AA: "docs/builder/knowledge/architecture-ambiguity-registry.md",
        DI: "docs/builder/knowledge/documentation-integrity-registry.md"
    });
    const HANDOFF_POINTER = "docs/builder/handoffs/LATEST.md";
    const METRICS_DIR_POINTER = "docs/builder/metrics/";

    class CozyOSBuilderLearningEngine {
        #auditLogs = [];
        #listeners = new Map();
        #diagnostics = { statusRequests: 0, errorsHidden: 0, eventsEmitted: 0 };

        getVersion() { return BUILDER_LEARNING_VERSION; }

        #deepClone(value) {
            try { return structuredClone(value); }
            catch (_e) { try { return JSON.parse(JSON.stringify(value)); } catch (_e2) { return value; } }
        }

        #enforceNoForbiddenKeys(obj, path = "root") {
            if (!obj || typeof obj !== "object") return;
            for (const key of Object.keys(obj)) {
                if (FORBIDDEN_KEYS.has(key)) throw new Error(`[BuilderLearning] Forbidden key "${key}" at ${path}.`);
                this.#enforceNoForbiddenKeys(obj[key], `${path}.${key}`);
            }
        }

        #generateId(prefix) {
            return `${prefix}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
        }

        #logAudit(action, msg) {
            this.#auditLogs.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
        }

        getAuditLog(predicate) {
            const list = this.#auditLogs.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        on(eventName, handler) {
            if (!this.#listeners.has(eventName)) this.#listeners.set(eventName, new Set());
            this.#listeners.get(eventName).add(handler);
            return () => this.off(eventName, handler);
        }
        off(eventName, handler) {
            const set = this.#listeners.get(eventName);
            if (!set) return false;
            const removed = set.delete(handler);
            if (set.size === 0) this.#listeners.delete(eventName);
            return removed;
        }
        once(eventName, handler) {
            const wrapped = (payload) => { this.off(eventName, handler); handler(payload); };
            this.on(eventName, wrapped);
        }
        emit(eventName, payload) {
            const set = this.#listeners.get(eventName);
            this.#diagnostics.eventsEmitted++;
            if (!set) return false;
            for (const fn of Array.from(set)) {
                try { fn(this.#deepClone(payload)); } catch (_e) { this.#diagnostics.errorsHidden++; }
            }
            return true;
        }

        /**
         * getLayerStatus()
         *   Real composition of Layer 1-3's own diagnostics reports.
         *   Reports { available: false } per layer if it isn't loaded,
         *   instead of guessing.
         */
        getLayerStatus() {
            const observation = window.CozyOS.BuilderObservation;
            const understanding = window.CozyOS.UnderstandingEngine;
            const analysis = window.CozyOS.AnalysisEngine;
            return this.#deepClone({
                layer1Observation: observation
                    ? { available: true, ...observation.getDiagnosticsReport() }
                    : { available: false, reason: "BuilderObservation not connected." },
                layer2Understanding: understanding && typeof understanding.getVersion === "function"
                    ? { available: true, version: understanding.getVersion(), candidatePatternCount: (understanding.listCandidatePatterns?.() || []).length }
                    : { available: false, reason: "UnderstandingEngine not connected." },
                layer3Analysis: analysis
                    ? { available: true, ...analysis.getDiagnosticsReport() }
                    : { available: false, reason: "AnalysisEngine not connected." }
            });
        }

        /**
         * getKnowledgeSummary()
         *   Real composition of CozyMemory's "builder-analysis" namespace
         *   (written by AnalysisEngine.#persistFindings — verified in
         *   the M375 compose report's Gate 1 review) plus the existing
         *   LearningEngine's own status. Never writes to CozyMemory.
         */
        getKnowledgeSummary() {
            const memory = window.CozyOS.CozyMemory;
            const existingLearningEngine = window.CozyOS.LearningEngine;
            return this.#deepClone({
                builderAnalysisMemory: memory && typeof memory.listNamespaces === "function"
                    ? { available: true, namespaces: memory.listNamespaces() }
                    : { available: false, reason: "CozyMemory not connected." },
                existingLearningEngine: existingLearningEngine && typeof existingLearningEngine.getLearningStatus === "function"
                    ? { available: true, version: existingLearningEngine.getVersion?.(), status: existingLearningEngine.getLearningStatus() }
                    : { available: false, reason: "core/modules/leaning/learning-engine.js (window.CozyOS.LearningEngine) not connected." }
            });
        }

        /**
         * getRegistrySummary()
         *   Honest pointer-only report. See header: no registry parser
         *   was built or approved this milestone.
         */
        getRegistrySummary() {
            return this.#deepClone({
                available: false,
                reason: "Knowledge registries are documentation (docs/builder/knowledge/*.md), not loaded into the browser runtime by any existing engine. Building a parser was explicitly out of scope for M375 (Do Not Implement: Registry parser/writer).",
                pointers: KNOWLEDGE_REGISTRY_POINTERS
            });
        }

        /** getMetricsSummary() — same honesty pattern as getRegistrySummary(). */
        getMetricsSummary() {
            return this.#deepClone({
                available: false,
                reason: "Builder metrics are JSON files on disk, not currently fetched/loaded by any existing engine at runtime.",
                pointer: METRICS_DIR_POINTER
            });
        }

        /** getRepairSummary() — same honesty pattern; RP registry is markdown-only. */
        getRepairSummary() {
            return this.#deepClone({
                available: false,
                reason: "Repair History Registry (RP) is documentation-only; not readable from the runtime this milestone.",
                pointer: KNOWLEDGE_REGISTRY_POINTERS.RP,
                knownAsOfM375ComposeReport: "2 records (RP-001, RP-002) — recorded in the M375 compose report, not re-verified live by this engine."
            });
        }

        /** getHandoffSummary() — pointer-only, same reasoning. */
        getHandoffSummary() {
            return this.#deepClone({
                available: false,
                reason: "Handoff documents are markdown files, not loaded into the runtime.",
                pointer: HANDOFF_POINTER
            });
        }

        /**
         * getPatternReadiness()
         *   Deliberately does NOT compute or suggest a pattern/
         *   recommendation. Reports the real evidence gap honestly,
         *   per Rule "if evidence is missing, fail closed rather than
         *   infer" and the M374/M375 compose reports' own conclusion.
         */
        getPatternReadiness() {
            return this.#deepClone({
                patternEngineBuilt: false,
                recommendationEngineBuilt: false,
                confidenceEngineBuilt: false,
                reason: "Insufficient signal — only 2 repair records exist as of the M375 compose report. Building pattern/recommendation/confidence logic on 2 data points was explicitly deferred, not attempted.",
                whatWouldChangeThis: "A future milestone re-checking docs/builder/knowledge/repair-history-registry.md with materially more entries, and an explicit decision to build a registry-reading capability (not present today)."
            });
        }

        /**
         * getLearningStatus()
         *   Top-level aggregate. This is the one method a future
         *   Builder session should call first.
         */
        getLearningStatus() {
            this.#diagnostics.statusRequests++;
            const status = {
                moduleVersion: BUILDER_LEARNING_VERSION,
                layers: this.getLayerStatus(),
                knowledge: this.getKnowledgeSummary(),
                registries: this.getRegistrySummary(),
                metrics: this.getMetricsSummary(),
                repairHistory: this.getRepairSummary(),
                handoffs: this.getHandoffSummary(),
                patternReadiness: this.getPatternReadiness()
            };
            this.#enforceNoForbiddenKeys(status);
            this.#logAudit("STATUS_REQUESTED", "getLearningStatus() called");
            this.emit("learning:statusRequested", { at: new Date().toISOString() });
            return Object.freeze(status);
        }

        isVersionCompatible(v) {
            const a = /^v?(\d+)\./.exec(BUILDER_LEARNING_VERSION), b = /^v?(\d+)\./.exec(String(v || ""));
            return !!(a && b && a[1] === b[1]);
        }

        getDiagnosticsReport() {
            return this.#deepClone({
                moduleVersion: BUILDER_LEARNING_VERSION,
                ...this.#diagnostics,
                integrations: {
                    builderObservation: !!window.CozyOS.BuilderObservation,
                    understandingEngine: !!window.CozyOS.UnderstandingEngine,
                    analysisEngine: !!window.CozyOS.AnalysisEngine,
                    cozyMemory: !!window.CozyOS.CozyMemory,
                    existingLearningEngine: !!window.CozyOS.LearningEngine
                },
                auditLogCount: this.#auditLogs.length
            });
        }

        exportSnapshot() {
            return this.#deepClone({ version: BUILDER_LEARNING_VERSION, exportedAt: new Date().toISOString(), diagnostics: this.#diagnostics });
        }
        importSnapshot(_snapshot) {
            return { imported: false, message: "BuilderLearning has no state of its own — it aggregates other engines' real state on demand." };
        }
        isSnapshotCompatible(snapshot) {
            return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === BUILDER_LEARNING_VERSION.split(".")[0]);
        }
    }

    if (window.CozyOS.BuilderLearning && typeof window.CozyOS.BuilderLearning.getVersion === "function") {
        const existingVersion = window.CozyOS.BuilderLearning.getVersion();
        if (existingVersion !== BUILDER_LEARNING_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: BuilderLearning existing v${existingVersion} conflicts with load target v${BUILDER_LEARNING_VERSION}.`);
        }
        return;
    }

    window.CozyOS.BuilderLearning = new CozyOSBuilderLearningEngine();

    window.CozyOS.BuilderLearning.visibility = Object.freeze({
        appId: "builder-learning", name: "Builder Learning", icon: "🧠", category: "platform-tool",
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
    })({ sourcePath: "core/modules/builder/learning-engine.js",
        name: "BuilderLearning", category: "Engineering Learning", icon: "learning.svg",
        description: "Cozy Builder Learning Engine (Layer 4) — read-only aggregator over Layers 1-3, CozyMemory, and the existing LearningEngine. Reports honest gaps (registries/metrics/handoffs not runtime-loadable; pattern/recommendation/confidence engines not built, insufficient signal) instead of fabricating data. Never generates, modifies, parses registries, or deploys code."
    });
})();
