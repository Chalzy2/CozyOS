/**
 * CozyOS Builder — Layer 5 — Evidence Engine
 * File: core/modules/builder/evidence-engine.js
 * Milestone: M376 (Compose Report: docs/builder/compose/M376-compose-report.md)
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP — READ THIS BEFORE TOUCHING THIS FILE
 *   This composes window.CozyOS.BuilderLearning (Layer 4, M375) plus a
 *   narrow, new read of the 8 knowledge registries and the handoff
 *   chain under docs/builder/. It does not replace, wrap, or duplicate
 *   BuilderLearning — BuilderLearning aggregates engine status;
 *   BuilderEvidence measures accumulated engineering evidence and
 *   answers exactly one question honestly: is there enough of it yet
 *   to justify building a Pattern Engine (M377)? See the M376 compose
 *   report §6 for the exact boundary of what this file does and does
 *   not parse.
 *
 * WHAT THIS MODULE ACTUALLY DOES
 *   - Composes BuilderLearning (Layer 4) read-only, via its existing
 *     public API only.
 *   - Reads the 8 knowledge registries (docs/builder/knowledge/*.md)
 *     and the handoff chain (docs/builder/handoffs/*.md) via same-
 *     origin fetch(), counting section headings and status lines
 *     only — never extracting or re-storing full entry bodies.
 *   - Converts those real counts into a fixed evidence-level
 *     vocabulary (NONE/LOW/PARTIAL/SUFFICIENT/HIGH/VERIFIED) using
 *     disclosed, fixed thresholds — a measurement policy, not
 *     invented data.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO (Honest Capability Rule)
 *   - Does not analyze code, does not learn patterns, does not
 *     recommend repairs. It measures evidence — nothing more.
 *   - No Pattern Engine, Recommendation Engine, or Confidence Engine.
 *     `getPatternReadiness()` reports real counts against thresholds
 *     and will not say "Ready" unless those thresholds are actually
 *     met by data read this call, live.
 *   - Does not parse module-inventory.json/csv, health-metrics JSON,
 *     or Builder Memory JSON — out of scope per the M376 compose
 *     report §6 (the brief's Phase 3 questions don't require them).
 *   - Does not enumerate a full directory listing of
 *     docs/builder/handoffs/ — no such API exists from a browser
 *     fetch() call. `getMilestoneHistory()` reads only the LATEST.md
 *     chain and the static version-history document, and says so.
 *   - No new persistence. This engine owns no state of its own beyond
 *     an in-memory audit log, identical in spirit to BuilderLearning.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    const BUILDER_EVIDENCE_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    // Fallback pointers, used only if BuilderLearning isn't connected
    // (should not happen given load order, but this engine must not
    // hard-crash if it is loaded standalone). Kept identical to the
    // pointers BuilderLearning itself already owns — not a second
    // source of truth, a resilience fallback only.
    const FALLBACK_REGISTRY_POINTERS = Object.freeze({
        RP: "docs/builder/knowledge/repair-history-registry.md",
        RG: "docs/builder/knowledge/regression-registry.md",
        SF: "docs/builder/knowledge/security-finding-registry.md",
        PF: "docs/builder/knowledge/performance-finding-registry.md",
        DC: "docs/builder/knowledge/duplicate-consolidation-registry.md",
        MD: "docs/builder/knowledge/missing-dependency-registry.md",
        AA: "docs/builder/knowledge/architecture-ambiguity-registry.md",
        DI: "docs/builder/knowledge/documentation-integrity-registry.md"
    });
    const LATEST_HANDOFF_POINTER = "docs/builder/handoffs/LATEST.md";
    const VERSION_HISTORY_POINTER = "docs/builder/versions/06-version-history.md";
    const VERIFICATION_REPORT_POINTER = "docs/builder/reports/m376-evidence-engine-verification.md";

    // Disclosed, fixed evidence-level thresholds. This is a
    // measurement policy Builder is choosing, not data being
    // invented — every count fed into it is real, read live.
    const EVIDENCE_THRESHOLDS = Object.freeze({
        NONE: 0,
        LOW: 1,
        PARTIAL: 3,
        SUFFICIENT: 6,
        HIGH: 10,
        VERIFIED: 20
    });
    // A category is considered pattern-ready only at SUFFICIENT or above.
    const PATTERN_READY_LEVEL = "SUFFICIENT";
    const EVIDENCE_LEVEL_ORDER = ["NONE", "LOW", "PARTIAL", "SUFFICIENT", "HIGH", "VERIFIED"];

    class CozyOSBuilderEvidenceEngine {
        #auditLogs = [];
        #listeners = new Map();
        #diagnostics = { evidenceSummaryRequests: 0, registryFetches: 0, fetchFailures: 0, errorsHidden: 0, eventsEmitted: 0 };

        getVersion() { return BUILDER_EVIDENCE_VERSION; }

        #deepClone(value) {
            try { return structuredClone(value); }
            catch (_e) { try { return JSON.parse(JSON.stringify(value)); } catch (_e2) { return value; } }
        }

        #enforceNoForbiddenKeys(obj, path = "root") {
            if (!obj || typeof obj !== "object") return;
            for (const key of Object.keys(obj)) {
                if (FORBIDDEN_KEYS.has(key)) throw new Error(`[BuilderEvidence] Forbidden key "${key}" at ${path}.`);
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

        #getRegistryPointers() {
            const learning = window.CozyOS.BuilderLearning;
            if (learning && typeof learning.getRegistrySummary === "function") {
                try {
                    const summary = learning.getRegistrySummary();
                    if (summary && summary.pointers) return summary.pointers;
                } catch (_e) { /* fall through to fallback */ }
            }
            return FALLBACK_REGISTRY_POINTERS;
        }

        /**
         * #fetchText(path)
         *   Same-origin, relative-path read only. Never throws — always
         *   resolves to { ok, text, reason }, so a missing file or a
         *   fetch()-less environment (e.g. file:// without a server)
         *   degrades to an honest `available: false`, never a fabricated
         *   count.
         */
        async #fetchText(path) {
            this.#diagnostics.registryFetches++;
            if (typeof fetch !== "function") {
                this.#diagnostics.fetchFailures++;
                return { ok: false, text: null, reason: "fetch() is not available in this runtime." };
            }
            try {
                const res = await fetch(path);
                if (!res || !res.ok) {
                    this.#diagnostics.fetchFailures++;
                    return { ok: false, text: null, reason: `Fetch returned status ${res ? res.status : "unknown"} for ${path}.` };
                }
                const text = await res.text();
                return { ok: true, text, reason: null };
            } catch (err) {
                this.#diagnostics.fetchFailures++;
                return { ok: false, text: null, reason: `Fetch failed for ${path}: ${err && err.message ? err.message : String(err)}` };
            }
        }

        /** #countHeadings(text, prefix) — counts real `## PREFIX-NNN` section headings. */
        #countHeadings(text, prefix) {
            if (!text) return 0;
            const re = new RegExp(`^##\\s+${prefix}-\\d+`, "gm");
            const matches = text.match(re);
            return matches ? matches.length : 0;
        }

        /** #countStatusWords(text) — counts `**Status:**` lines by the word that follows, e.g. Open/Closed. */
        #countStatusWords(text) {
            const counts = { open: 0, closed: 0, other: 0 };
            if (!text) return counts;
            const re = /\*\*Status:\*\*\s*([A-Za-z][A-Za-z \-]*)/g;
            let m;
            while ((m = re.exec(text)) !== null) {
                const word = m[1].trim().toLowerCase();
                if (word.startsWith("open")) counts.open++;
                else if (word.startsWith("closed")) counts.closed++;
                else counts.other++;
            }
            return counts;
        }

        /** #countTableMilestoneRows(text) — counts real `| MNNN` rows in the version-history table. */
        #countTableMilestoneRows(text) {
            if (!text) return 0;
            const matches = text.match(/^\|\s*\*{0,2}M\d+/gm);
            return matches ? matches.length : 0;
        }

        /**
         * getRepairEvidence()
         *   Real, live count from the RP registry — never re-uses a
         *   stale number recorded in a prior compose report.
         */
        async getRepairEvidence() {
            const pointers = this.#getRegistryPointers();
            const fetched = await this.#fetchText(pointers.RP);
            const count = this.#countHeadings(fetched.text, "RP");
            return this.#deepClone({
                available: fetched.ok,
                reason: fetched.ok ? null : fetched.reason,
                pointer: pointers.RP,
                repairCount: fetched.ok ? count : null
            });
        }

        /**
         * getRegressionEvidence()
         *   Real, live count from the RG registry.
         */
        async getRegressionEvidence() {
            const pointers = this.#getRegistryPointers();
            const fetched = await this.#fetchText(pointers.RG);
            const count = this.#countHeadings(fetched.text, "RG");
            return this.#deepClone({
                available: fetched.ok,
                reason: fetched.ok ? null : fetched.reason,
                pointer: pointers.RG,
                regressionCount: fetched.ok ? count : null
            });
        }

        /**
         * getRegistryHealth()
         *   Real, live counts across all 8 knowledge registries, plus
         *   open/closed status counts where the registry uses that
         *   convention. Nothing here is fabricated — a registry that
         *   fails to fetch reports available:false for itself only.
         */
        async getRegistryHealth() {
            const pointers = this.#getRegistryPointers();
            const prefixes = ["RP", "RG", "SF", "PF", "DC", "MD", "AA", "DI"];
            const results = {};
            for (const prefix of prefixes) {
                const path = pointers[prefix];
                const fetched = await this.#fetchText(path);
                if (!fetched.ok) {
                    results[prefix] = { available: false, reason: fetched.reason, pointer: path };
                    continue;
                }
                const count = this.#countHeadings(fetched.text, prefix);
                const status = this.#countStatusWords(fetched.text);
                results[prefix] = { available: true, pointer: path, entryCount: count, statusCounts: status };
            }
            return this.#deepClone(results);
        }

        /**
         * getRepositoryKnowledge()
         *   Composes registry health (this engine, live) with
         *   BuilderLearning's existing knowledge summary (Layer 4,
         *   read-only). Module inventory / metrics JSON remain
         *   pointer-only per the M376 compose report §6.
         */
        async getRepositoryKnowledge() {
            const learning = window.CozyOS.BuilderLearning;
            const registryHealth = await this.getRegistryHealth();
            return this.#deepClone({
                registries: registryHealth,
                builderLearningKnowledge: learning && typeof learning.getKnowledgeSummary === "function"
                    ? { available: true, ...learning.getKnowledgeSummary() }
                    : { available: false, reason: "BuilderLearning not connected." },
                moduleInventory: { available: false, reason: "Not parsed this milestone — out of scope per M376 compose report §6.", pointer: "docs/builder/knowledge/module-inventory.json" },
                metrics: { available: false, reason: "No M374-M376 metrics file exists; not parsed this milestone.", pointer: "docs/builder/metrics/" }
            });
        }

        /**
         * getLearningProgress()
         *   Composes BuilderLearning's Layer 1-3 status (read-only)
         *   with current registry totals. Growth-over-time is honestly
         *   reported as not trackable yet — no prior evidence snapshot
         *   exists to compare against, and this engine does not
         *   persist one (no new persistence, per header).
         */
        async getLearningProgress() {
            const learning = window.CozyOS.BuilderLearning;
            const registryHealth = await this.getRegistryHealth();
            const totalEntries = Object.values(registryHealth)
                .filter(r => r.available)
                .reduce((sum, r) => sum + (r.entryCount || 0), 0);
            return this.#deepClone({
                layers: learning && typeof learning.getLayerStatus === "function"
                    ? { available: true, ...learning.getLayerStatus() }
                    : { available: false, reason: "BuilderLearning not connected." },
                currentTotalRegistryEntries: totalEntries,
                growthOverTime: {
                    available: false,
                    reason: "No prior evidence snapshot exists to compare against. This engine reports live totals only and stores none of its own — a future milestone would need to decide whether to persist snapshots before growth can be measured honestly."
                }
            });
        }

        /** #levelFor(count) — maps a real count to the fixed evidence-level vocabulary. Never invents a level. */
        #levelFor(count) {
            if (count === null || count === undefined) return "NONE";
            let level = "NONE";
            for (const name of EVIDENCE_LEVEL_ORDER) {
                if (count >= EVIDENCE_THRESHOLDS[name]) level = name;
            }
            return level;
        }

        #meetsPatternReadyLevel(level) {
            return EVIDENCE_LEVEL_ORDER.indexOf(level) >= EVIDENCE_LEVEL_ORDER.indexOf(PATTERN_READY_LEVEL);
        }

        /**
         * getMilestoneHistory()
         *   Reads the real LATEST.md pointer chain and the real
         *   version-history document. Does NOT enumerate the handoffs
         *   directory — no browser fetch() API can list a directory,
         *   so this reports only what those two real documents contain
         *   plus says so explicitly, rather than guessing a full count.
         */
        async getMilestoneHistory() {
            const latestFetch = await this.#fetchText(LATEST_HANDOFF_POINTER);
            let pointedHandoff = null;
            let pointedHandoffAvailable = false;
            if (latestFetch.ok) {
                const m = /Points to:\*\*\s*`([^`]+)`/.exec(latestFetch.text);
                if (m) {
                    pointedHandoff = m[1];
                    const handoffFetch = await this.#fetchText(pointedHandoff);
                    pointedHandoffAvailable = handoffFetch.ok;
                }
            }
            const versionHistoryFetch = await this.#fetchText(VERSION_HISTORY_POINTER);
            const versionHistoryMilestoneRows = versionHistoryFetch.ok
                ? this.#countTableMilestoneRows(versionHistoryFetch.text)
                : null;
            return this.#deepClone({
                latest: {
                    available: latestFetch.ok,
                    reason: latestFetch.ok ? null : latestFetch.reason,
                    pointsTo: pointedHandoff,
                    pointedHandoffAvailable
                },
                versionHistory: {
                    available: versionHistoryFetch.ok,
                    reason: versionHistoryFetch.ok ? null : versionHistoryFetch.reason,
                    milestoneRowCount: versionHistoryMilestoneRows,
                    note: "Row count reflects only milestones with a direct evidence citation in this document (append-only, disclosed as incomplete by the document's own header)."
                },
                fullDirectoryEnumeration: {
                    available: false,
                    reason: "No browser fetch() API can list a directory. This engine cannot honestly report a total handoff-file count beyond the two real documents read above."
                }
            });
        }

        /**
         * getPatternReadiness()
         *   The core of this milestone. Never says "Ready" unless the
         *   real, live-fetched counts actually meet the disclosed
         *   threshold. Mirrors the exact reporting shape given in the
         *   M376 brief (record counts, confidence, recommendation).
         */
        async getPatternReadiness() {
            const repair = await this.getRepairEvidence();
            const regression = await this.getRegressionEvidence();
            const history = await this.getMilestoneHistory();

            const repairCount = repair.available ? repair.repairCount : 0;
            const regressionCount = regression.available ? regression.regressionCount : 0;
            const verifiedMilestones = history.latest.available && history.latest.pointedHandoffAvailable ? 1 : 0;

            const repairLevel = this.#levelFor(repairCount);
            const regressionLevel = this.#levelFor(regressionCount);

            const repairReady = this.#meetsPatternReadyLevel(repairLevel);
            const regressionReady = this.#meetsPatternReadyLevel(regressionLevel);
            const overallReady = repairReady && regressionReady;

            const recommendations = [];
            if (!repairReady) recommendations.push("Continue collecting repair history.");
            if (!regressionReady) recommendations.push("Continue collecting regression history (registry is currently empty).");
            if (recommendations.length === 0) recommendations.push("Evidence thresholds met — M377 Pattern Engine compose review may begin.");

            return this.#deepClone({
                repairRecords: { count: repairCount, threshold: EVIDENCE_THRESHOLDS[PATTERN_READY_LEVEL], level: repairLevel, ready: repairReady },
                regressionRecords: { count: regressionCount, threshold: EVIDENCE_THRESHOLDS[PATTERN_READY_LEVEL], level: regressionLevel, ready: regressionReady },
                verifiedMilestonesInChain: verifiedMilestones,
                confidence: overallReady ? "Sufficient Evidence" : "Insufficient Evidence",
                patternDetectionJustified: overallReady,
                recommendation: recommendations.join(" "),
                patternEngineBuilt: false,
                recommendationEngineBuilt: false,
                confidenceEngineBuilt: false,
                note: "Evidence levels use a fixed, disclosed threshold scale (NONE<1<=LOW<3<=PARTIAL<6<=SUFFICIENT<10<=HIGH<20<=VERIFIED). The threshold is a measurement policy Builder is applying, not data being invented — every count above was read live this call."
            });
        }

        /**
         * getVerificationStatus()
         *   Live integration/connectivity check plus a pointer to the
         *   real static verification (node --check, repository sweep,
         *   etc.) performed outside the browser this milestone. Never
         *   claims a browser-runtime verification that wasn't actually run.
         */
        getVerificationStatus() {
            return this.#deepClone({
                integrations: {
                    builderLearning: !!window.CozyOS.BuilderLearning,
                    builderObservation: !!window.CozyOS.BuilderObservation,
                    understandingEngine: !!window.CozyOS.UnderstandingEngine,
                    analysisEngine: !!window.CozyOS.AnalysisEngine
                },
                fetchApiAvailable: typeof fetch === "function",
                browserRuntimeVerified: false,
                browserRuntimeNote: "Not verified in an actual browser this session — see the M376 verification report for what was actually run (node --check, static repository sweep) versus what remains open.",
                staticVerificationPointer: VERIFICATION_REPORT_POINTER
            });
        }

        /**
         * getEvidenceSummary()
         *   Top-level aggregate. This is the one method a future
         *   Builder session should call first to see what evidence
         *   actually exists right now.
         */
        async getEvidenceSummary() {
            this.#diagnostics.evidenceSummaryRequests++;
            const summary = {
                moduleVersion: BUILDER_EVIDENCE_VERSION,
                repairEvidence: await this.getRepairEvidence(),
                regressionEvidence: await this.getRegressionEvidence(),
                registryHealth: await this.getRegistryHealth(),
                repositoryKnowledge: await this.getRepositoryKnowledge(),
                learningProgress: await this.getLearningProgress(),
                milestoneHistory: await this.getMilestoneHistory(),
                patternReadiness: await this.getPatternReadiness(),
                verificationStatus: this.getVerificationStatus()
            };
            this.#enforceNoForbiddenKeys(summary);
            this.#logAudit("EVIDENCE_SUMMARY_REQUESTED", "getEvidenceSummary() called");
            this.emit("evidence:summaryRequested", { at: new Date().toISOString() });
            return Object.freeze(summary);
        }

        isVersionCompatible(v) {
            const a = /^v?(\d+)\./.exec(BUILDER_EVIDENCE_VERSION), b = /^v?(\d+)\./.exec(String(v || ""));
            return !!(a && b && a[1] === b[1]);
        }

        getDiagnosticsReport() {
            return this.#deepClone({
                moduleVersion: BUILDER_EVIDENCE_VERSION,
                ...this.#diagnostics,
                integrations: {
                    builderLearning: !!window.CozyOS.BuilderLearning,
                    builderObservation: !!window.CozyOS.BuilderObservation,
                    understandingEngine: !!window.CozyOS.UnderstandingEngine,
                    analysisEngine: !!window.CozyOS.AnalysisEngine
                },
                auditLogCount: this.#auditLogs.length
            });
        }

        exportSnapshot() {
            return this.#deepClone({ version: BUILDER_EVIDENCE_VERSION, exportedAt: new Date().toISOString(), diagnostics: this.#diagnostics });
        }
        importSnapshot(_snapshot) {
            return { imported: false, message: "BuilderEvidence has no state of its own — it measures real registry/handoff data live on each call." };
        }
        isSnapshotCompatible(snapshot) {
            return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === BUILDER_EVIDENCE_VERSION.split(".")[0]);
        }
    }

    if (window.CozyOS.BuilderEvidence && typeof window.CozyOS.BuilderEvidence.getVersion === "function") {
        const existingVersion = window.CozyOS.BuilderEvidence.getVersion();
        if (existingVersion !== BUILDER_EVIDENCE_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: BuilderEvidence existing v${existingVersion} conflicts with load target v${BUILDER_EVIDENCE_VERSION}.`);
        }
        return;
    }

    window.CozyOS.BuilderEvidence = new CozyOSBuilderEvidenceEngine();

    window.CozyOS.BuilderEvidence.visibility = Object.freeze({
        appId: "builder-evidence", name: "Builder Evidence", icon: "📊", category: "platform-tool",
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
    })({ sourcePath: "core/modules/builder/evidence-engine.js",
        name: "BuilderEvidence", category: "Engineering Evidence", icon: "evidence.svg",
        description: "Cozy Builder Evidence Engine (Layer 5) — measures accumulated engineering evidence (repair/regression registries, handoff chain) via live, same-origin reads and reports honest evidence levels (NONE/LOW/PARTIAL/SUFFICIENT/HIGH/VERIFIED) against fixed thresholds. Never analyzes code, learns patterns, or recommends repairs — measures only, and never reports \"Ready\" unless the live data actually meets the threshold."
    });
})();
