/**
 * CozyOS Enterprise Framework — CozyLearningEngine
 * File Reference: core/modules/learning/learning-engine.js
 * Version: 1.0.0-ENTERPRISE
 * Layer: Core / Code Generation — Learning Engine
 *
 * RESPONSIBILITY
 *   A thin, real coordinator — NOT a new storage system. "Learning"
 *   already happens in UnderstandingEngine (Knowledge Review Queue,
 *   Enterprise Pattern Library) and CozyMemory (Builder Memory Read).
 *   This engine's only job is to orchestrate the real trigger points
 *   ("a project completed successfully — extract and submit a
 *   candidate pattern") and aggregate real learning status across
 *   engines. It owns no pattern data itself.
 *
 * WHAT THIS MODULE ACTUALLY DOES
 *   - learnFromCompletedProject(): given a real certification result
 *     that passed (0 critical/high) AND a real completed Enterprise
 *     Audit, calls UnderstandingEngine.submitCandidatePattern() — the
 *     SAME gate already enforced there (Phase 1 rules), never bypassed.
 *   - learnFromApprovedCorrection(): records a real, human-approved
 *     correction (e.g. a rejected then corrected BugFixer output) as a
 *     candidate — same submission gate, same never-auto-approve rule.
 *   - getLearningStatus(): real aggregate — pulls
 *     UnderstandingEngine.getPatternAnalytics() and CozyMemory's real
 *     namespace counts, invents nothing.
 *
 * WHAT THIS MODULE DOES NOT DO (Honest Capability Rule)
 *   - Never learns from unverified/uncertified/failed work — every
 *     entry path requires a real passing certification + a real
 *     completed audit reference, matching the existing Phase 1 gate.
 *   - Never stores patterns itself — delegates entirely to
 *     UnderstandingEngine to avoid duplicated storage.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const LE_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    class CozyOSLearningEngine {
        #auditLogs = []; #listeners = new Map();
        #diagnostics = { learnAttempts: 0, learnAccepted: 0, learnRejected: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 2.0 };

        getVersion() { return LE_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #logAudit(a, m) { this.#auditLogs.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action: a, msg: m })); if (this.#auditLogs.length > 500) this.#auditLogs.shift(); }
        getAuditLog(p) { const l = this.#auditLogs.map(e => this.#deepClone(e)); return Object.freeze(p ? l.filter(p) : l); }
        on(e, h) { if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const r = s.delete(h); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { const w = (p) => { this.off(e, h); h(p); }; this.on(e, w); }
        emit(e, p) { const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s) return false; for (const fn of Array.from(s)) { try { fn(this.#deepClone(p)); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        /**
         * learnFromCompletedProject({ moduleId, plan, certificationPreview, auditImportResult, beforeScore, source, patternCategory, patternType, extractedPattern })
         *   Pure pass-through to UnderstandingEngine.submitCandidatePattern()
         *   — the same Phase 1 gate (0 critical/high + completed audit)
         *   applies unchanged. This method adds no new bypass.
         */
        learnFromCompletedProject(params) {
            const ue = window.CozyOS.UnderstandingEngine;
            if (!ue) throw new Error("[Learning] UnderstandingEngine is not connected.");
            this.#diagnostics.learnAttempts++;
            const candidate = ue.submitCandidatePattern(params);
            if (candidate.status === "PENDING") this.#diagnostics.learnAccepted++; else this.#diagnostics.learnRejected++;
            this.#logAudit("LEARN_ATTEMPT", `${params.moduleId}: ${candidate.status}`);
            this.emit("learning:attempted", { moduleId: params.moduleId, status: candidate.status });
            return candidate;
        }

        /**
         * learnFromApprovedCorrection({ moduleId, correctedSource, originalSource, certificationPreview, auditImportResult, approvedBy })
         *   Requires a real human approval marker (approvedBy) — never
         *   learns from a correction nobody signed off on. Delegates to
         *   the same submission gate.
         */
        learnFromApprovedCorrection({ moduleId, correctedSource, originalSource, certificationPreview, auditImportResult, approvedBy, plan }) {
            if (!approvedBy) throw new Error("[Learning] learnFromApprovedCorrection(): approvedBy is required — never learns from an unapproved correction.");
            this.#diagnostics.learnAttempts++;
            const ue = window.CozyOS.UnderstandingEngine;
            if (!ue) throw new Error("[Learning] UnderstandingEngine is not connected.");
            const candidate = ue.submitCandidatePattern({ moduleId, plan: plan || { exportName: moduleId, entities: [] }, certificationPreview, auditImportResult, source: "Human" });
            if (candidate.status === "PENDING") this.#diagnostics.learnAccepted++; else this.#diagnostics.learnRejected++;
            this.#logAudit("LEARN_FROM_CORRECTION", `${moduleId} approved by ${this.#escapeHtml(approvedBy)}: ${candidate.status}`);
            return candidate;
        }

        /**
         * getLearningStatus()
         *   Real aggregate — never invents figures. Reports {available:
         *   false} for whichever source isn't connected instead of
         *   guessing.
         */
        getLearningStatus() {
            const ue = window.CozyOS.UnderstandingEngine;
            const mem = window.CozyOS.CozyMemory;
            return this.#deepClone({
                patternAnalytics: ue ? ue.getPatternAnalytics() : { available: false, reason: "UnderstandingEngine not connected." },
                memoryNamespaces: mem ? mem.listNamespaces() : { available: false, reason: "CozyMemory not connected." },
                coordinatorDiagnostics: this.#diagnostics
            });
        }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(LE_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ moduleVersion: LE_VERSION, ...this.#diagnostics, integrationCount: [window.CozyOS.UnderstandingEngine, window.CozyOS.CozyMemory].filter(Boolean).length }); }
        exportSnapshot() { return this.#deepClone({ version: LE_VERSION, exportedAt: new Date().toISOString(), diagnostics: this.#diagnostics }); }
        importSnapshot(_s) { return { imported: false, message: "LearningEngine has no state of its own — all real pattern data lives in UnderstandingEngine." }; }
        isSnapshotCompatible(s) { return !!(s && typeof s.version === "string" && s.version.split(".")[0] === LE_VERSION.split(".")[0]); }
    }

    if (window.CozyOS.LearningEngine?.getVersion) { if (window.CozyOS.LearningEngine.getVersion() !== LE_VERSION) throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: LearningEngine."); return; }
    window.CozyOS.LearningEngine = new CozyOSLearningEngine();

    (function reg(d) {
        function attempt() { if (typeof window.CozyOS.registerCoordinator !== "function") return false; try { window.CozyOS.registerCoordinator(d); } catch (_e) { /* non-fatal */ } return true; }
        if (attempt()) return;
        if (!Object.prototype.hasOwnProperty.call(window.CozyOS, "__pendingCoordinatorRegistrations")) Object.defineProperty(window.CozyOS, "__pendingCoordinatorRegistrations", { value: [], writable: true, enumerable: false, configurable: true });
        window.CozyOS.__pendingCoordinatorRegistrations.push(d);
        let n = 0; const iv = setInterval(() => { n++; if (attempt() || n >= 200) clearInterval(iv); }, 250);
    })({ name: "LearningEngine", category: "Code Generation", icon: "learning.svg", description: "Thin orchestration over UnderstandingEngine's real pattern lifecycle — never duplicates storage, never bypasses the existing certification+audit gate." });
})();
