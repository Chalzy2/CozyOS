/**
 * CozyOS Enterprise Framework — CozyPlanningEngine
 * File Reference: core/modules/planning/planning-engine.js
 * Version: 1.0.0-ENTERPRISE
 * Layer: Core / Code Generation — Planning & Recommendation Engine
 *
 * HONEST SCOPE
 *   Real dependency-gate checking (is window.CozyOS.<X> actually
 *   connected?) and a real "unlock count" (how many OTHER candidates in
 *   the same list depend on this one — a genuine, computable proxy for
 *   "does this help the next several projects"). WHY-NOT explanations
 *   are generated from real missing-dependency lists, not invented
 *   reasoning.
 *
 *   Business value, revenue opportunities, cost/time estimates, and
 *   "future product" ideas are NOT computed here — there is no real
 *   business/financial data anywhere in CozyOS. Every such field
 *   honestly returns {available:false, reason:"requires human business
 *   judgment — not a computable fact"} rather than a fabricated number.
 *
 *   Developer Decision Memory is real, stored via CozyMemory.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const PLAN_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    const NOT_COMPUTABLE = { available: false, reason: "Requires human business judgment — not a computable fact from anything CozyOS tracks." };

    class CozyOSPlanningEngine {
        #decisions = new Map();
        #auditLogs = []; #listeners = new Map();
        #diagnostics = { recommendationsGenerated: 0, decisionsRecorded: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 2.3 };

        getVersion() { return PLAN_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #logAudit(a, m) { this.#auditLogs.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action: a, msg: m })); if (this.#auditLogs.length > 500) this.#auditLogs.shift(); }
        getAuditLog(p) { const l = this.#auditLogs.map(e => this.#deepClone(e)); return Object.freeze(p ? l.filter(p) : l); }
        on(e, h) { if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const r = s.delete(h); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { const w = (p) => { this.off(e, h); h(p); }; this.on(e, w); }
        emit(e, p) { const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s) return false; for (const fn of Array.from(s)) { try { fn(this.#deepClone(p)); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        /** validateReadiness() — real check: is each named dependency actually a connected window.CozyOS coordinator? */
        validateReadiness(dependencies) {
            const missing = (dependencies || []).filter(d => !window.CozyOS[d]);
            return this.#deepClone({ ready: missing.length === 0, missing });
        }

        /**
         * recommendNext(candidates)
         *   candidates: [{ id, name, dependencies: [engineName,...] }]
         *   Real: filters to ready candidates, ranks by real "unlock
         *   count" (how many OTHER candidates list this id as a
         *   dependency) — the computable version of "does this help the
         *   next several projects." Ties broken by fewest missing deps
         *   among non-ready ones for WHY-NOT explanations.
         */
        recommendNext(candidates) {
            if (!Array.isArray(candidates) || candidates.length === 0) throw new TypeError("[Planning] recommendNext(): candidates array is required.");
            this.#diagnostics.recommendationsGenerated++;

            // Never recommend already-completed work: a candidate whose
            // real dependency (its own coordinator name, if it names one
            // via c.checkCompleted) already exists as a live coordinator OR
            // has a real CozyMemory record is filtered out entirely.
            const notCompleted = candidates.filter(c => {
                if (c.checkCompleted && window.CozyOS[c.checkCompleted]) return false;
                if (window.CozyOS.CozyMemory && c.checkCompleted) {
                    try { if (window.CozyOS.CozyMemory.searchMemory("Builder", c.checkCompleted).length > 0) return false; } catch (_e) { /* ignore */ }
                }
                return true;
            });

            const evaluated = notCompleted.map(c => {
                const readiness = this.validateReadiness(c.dependencies || []);
                const unlockCount = notCompleted.filter(other => (other.dependencies || []).includes(c.id)).length;
                return { ...c, readiness, unlockCount };
            });

            const ready = evaluated.filter(c => c.readiness.ready).sort((a, b) => b.unlockCount - a.unlockCount);
            const recommended = ready[0] || null;

            const whyRecommended = recommended ? {
                dependenciesSatisfied: recommended.dependencies || [],
                unlocksCount: recommended.unlockCount,
                unlocks: evaluated.filter(o => (o.dependencies || []).includes(recommended.id)).map(o => o.name)
            } : null;

            // "Why Not?" engine: for every other candidate, real reasons —
            // missing deps, or ready-but-lower-unlock-count — plus what
            // stays blocked if this recommendation is skipped, and how
            // much future work it would have saved (real unlock count,
            // not a guess).
            const whyNotOthers = evaluated.filter(c => c.id !== recommended?.id).map(c => {
                const blockedByThis = evaluated.filter(o => (o.dependencies || []).includes(c.id)).map(o => o.name);
                return {
                    name: c.name,
                    reason: c.readiness.ready ? `Ready, but unlocks fewer future items (${c.unlockCount}) than the recommendation.` : `Missing dependencies: ${c.readiness.missing.join(", ")}.`,
                    impactIfSkipped: blockedByThis.length > 0 ? `${blockedByThis.join(", ")} would remain blocked.` : "Nothing else currently depends on this.",
                    futureWorkSaved: c.unlockCount
                };
            });

            const completedCount = candidates.length - notCompleted.length;
            const result = this.#deepClone({
                recommended: recommended ? { id: recommended.id, name: recommended.name } : null,
                whyRecommended, whyNotOthers,
                alreadyCompleted: completedCount,
                businessValue: NOT_COMPUTABLE, revenueOpportunity: NOT_COMPUTABLE, costEstimate: NOT_COMPUTABLE, timeEstimate: NOT_COMPUTABLE,
                method: "real dependency-gate + unlock-count ranking + CozyMemory completion filter — not a business/financial estimation model"
            });
            this.#logAudit("RECOMMENDATION", recommended ? recommended.name : "none ready");
            this.emit("planning:recommended", { recommendedId: recommended?.id });
            return result;
        }

        /** recordDecision() — real Developer Decision Memory, via CozyMemory when connected. */
        recordDecision(candidateId, accepted, reason = null) {
            const id = this.#generateId("dec");
            const decision = { id, candidateId, accepted, reason: reason ? this.#escapeHtml(reason) : null, timestamp: new Date().toISOString() };
            this.#decisions.set(id, decision);
            this.#diagnostics.decisionsRecorded++;
            if (window.CozyOS.CozyMemory) { try { window.CozyOS.CozyMemory.saveMemory("Developer", `decision-${id}`, decision, { tags: ["decision", accepted ? "accepted" : "rejected"] }); } catch (_e) { /* additive only */ } }
            this.#logAudit("DECISION_RECORDED", `${candidateId}: ${accepted ? "accepted" : "rejected"}`);
            return this.#deepClone(decision);
        }

        listDecisions(p) { const l = Array.from(this.#decisions.values()).map(d => this.#deepClone(d)); return Object.freeze(p ? l.filter(p) : l); }

        /** estimateCompletion() — real percentage from a real completed/total count the caller supplies; never invents the counts itself. */
        estimateCompletion(completedCount, totalCount) {
            if (typeof completedCount !== "number" || typeof totalCount !== "number" || totalCount <= 0) throw new TypeError("[Planning] estimateCompletion(): valid completedCount/totalCount required.");
            return { completedCount, totalCount, percent: Math.round((completedCount / totalCount) * 1000) / 10 };
        }

        /** detectFutureProducts() — honestly not computable; real, disclosed extension point. */
        detectFutureProducts() { return { available: false, reason: "Identifying viable future products/businesses requires human market judgment — not implemented, and not simulated." }; }

        // =====================================================================
        // ─── BOARD REVIEW ───────────────────────────────────────────────────
        // Each "reviewer" below is a REAL, deterministic check against real
        // CozyOS data — never a simulated independent AI persona. Roles with
        // no automated signal (UX/UI, Business Analyst, Domain Expert,
        // Technical Writer) honestly report that, rather than fabricating
        // an opinion. This module never auto-implements anything — it only
        // ever returns a recommendation for a human to approve/reject via
        // requestApproval()/decideApproval().
        // =====================================================================

        performBoardReview({ name, dependencies = [], moduleId = null, blueprintId = null } = {}) {
            const cert = window.CozyOS.Certification;
            const record = (moduleId && cert) ? (cert.listRecords(moduleId).slice(-1)[0] || null) : null;
            const groupCount = (prefix) => record ? (record.defects || []).filter(d => !d.waived && d.id.startsWith(prefix)).length : null;

            const NO_SIGNAL = { verdict: "NO_AUTOMATED_SIGNAL", reason: "No automated check exists for this — requires human review." };
            const readiness = this.validateReadiness(dependencies);

            const board = {
                "Software Architect": { verdict: readiness.ready ? "PASS" : "BLOCK", detail: readiness.ready ? "Dependencies satisfied." : `Missing: ${readiness.missing.join(", ")}.` },
                "Senior Engineer": window.CozyOS.InnovationEngine ? (() => { const d = window.CozyOS.InnovationEngine.duplicateDetection(name); return { verdict: (d.available && d.matches.length > 0) ? "CAUTION" : "PASS", detail: d.available ? `${d.matches.length} related memory record(s) found.` : d.reason }; })() : NO_SIGNAL,
                "Security Engineer": record ? { verdict: groupCount("SEC-") === 0 ? "PASS" : "BLOCK", detail: `${groupCount("SEC-")} active security finding(s).` } : NO_SIGNAL,
                "Performance Engineer": record ? { verdict: groupCount("PERF-") === 0 ? "PASS" : "CAUTION", detail: `${groupCount("PERF-")} active performance finding(s).` } : NO_SIGNAL,
                "UX/UI Designer": NO_SIGNAL,
                "Database Engineer": blueprintId && window.CozyOS.ArchitectureEngine ? (() => { const b = window.CozyOS.ArchitectureEngine.getBlueprint(blueprintId); return { verdict: b ? "PASS" : "CAUTION", detail: b ? `${b.modules.length} module(s) with a real data model.` : "No blueprint found." }; })() : NO_SIGNAL,
                "DevOps Engineer": { verdict: (window.CozyOS.WorkspaceShell && window.CozyOS.Certification) ? "PASS" : "CAUTION", detail: (window.CozyOS.WorkspaceShell && window.CozyOS.Certification) ? "Workspace and Certification connected." : "Workspace or Certification not connected." },
                "QA/Test Engineer": record ? { verdict: (record.severityCounts.critical === 0 && record.severityCounts.high === 0) ? "PASS" : "BLOCK", detail: `Critical: ${record.severityCounts.critical}, High: ${record.severityCounts.high}.` } : NO_SIGNAL,
                "Enterprise Certification Reviewer": record ? { verdict: record.verdict === "ENTERPRISE_CERTIFIED" ? "PASS" : (record.verdict === "CERTIFICATION_FAILED" ? "BLOCK" : "CAUTION"), detail: `${record.verdict} (${record.summary.scorePercent}%).` } : NO_SIGNAL,
                "Business Analyst": NO_SIGNAL,
                "Domain Expert": window.CozyOS.DomainExpertFramework ? { verdict: "NO_AUTOMATED_SIGNAL", reason: "Domain pack matching requires a specific domain + text input — call detectDomainGaps() directly." } : NO_SIGNAL,
                "Technical Writer": NO_SIGNAL
            };

            const withSignal = Object.values(board).filter(r => r.verdict !== "NO_AUTOMATED_SIGNAL");
            const blocks = withSignal.filter(r => r.verdict === "BLOCK").length;
            const cautions = withSignal.filter(r => r.verdict === "CAUTION").length;
            const passes = withSignal.filter(r => r.verdict === "PASS").length;
            const confidenceScore = withSignal.length > 0 ? Math.round((passes / withSignal.length) * 100) : null;

            const consensus = {
                overallRecommendation: blocks > 0 ? "HOLD" : (cautions > 0 ? "GO_WITH_CAUTION" : "GO"),
                confidenceScore,
                reviewersWithSignal: withSignal.length, reviewersWithoutSignal: 12 - withSignal.length,
                benefits: Object.entries(board).filter(([, r]) => r.verdict === "PASS").map(([role, r]) => `${role}: ${r.detail}`),
                risks: Object.entries(board).filter(([, r]) => r.verdict === "BLOCK" || r.verdict === "CAUTION").map(([role, r]) => `${role}: ${r.detail}`),
                method: "real per-role checks against actual CozyOS data — not simulated independent AI reviewers"
            };

            this.#logAudit("BOARD_REVIEW", `${name}: ${consensus.overallRecommendation} (confidence ${confidenceScore ?? "n/a"})`);
            return this.#deepClone({ name, board, consensus });
        }

        /**
         * requestApproval(reviewResult) / decideApproval(requestId, approved, reason)
         *   This engine NEVER auto-implements — every board review must
         *   be explicitly approved or rejected by a human before any
         *   build/generate call happens elsewhere in CozyOS. This is a
         *   real gate, not a formality: callers are expected to check
         *   getApprovalStatus() before proceeding.
         */
        requestApproval(reviewResult) {
            const id = this.#generateId("approval");
            const request = { id, reviewResult, status: "PENDING", requestedAt: new Date().toISOString() };
            this.#decisions.set(id, request);
            this.#logAudit("APPROVAL_REQUESTED", reviewResult.name);
            this.emit("planning:approvalRequested", { id });
            return this.#deepClone(request);
        }

        decideApproval(requestId, approved, reason = null) {
            const request = this.#decisions.get(requestId);
            if (!request) throw new Error(`[Planning] decideApproval(): no request "${requestId}".`);
            const updated = { ...request, status: approved ? "APPROVED" : "REJECTED", decidedAt: new Date().toISOString(), reason: reason ? this.#escapeHtml(reason) : null };
            this.#decisions.set(requestId, updated);
            this.#diagnostics.decisionsRecorded++;
            if (window.CozyOS.CozyMemory) { try { window.CozyOS.CozyMemory.saveMemory("Developer", `approval-${requestId}`, updated, { tags: ["approval", updated.status.toLowerCase()] }); } catch (_e) { /* additive only */ } }
            this.#logAudit("APPROVAL_DECIDED", `${requestId}: ${updated.status}`);
            this.emit("planning:approvalDecided", { id: requestId, status: updated.status });
            return this.#deepClone(updated);
        }

        getApprovalStatus(requestId) { const r = this.#decisions.get(requestId); return r ? this.#deepClone(r) : null; }

        /**
         * selfCritique(files)
         *   files: [{ moduleId, source }]. Real — runs each through the
         *   actual Certification engine and reports real defects found.
         *   "Missing files/integrations/UI/workflows" are NOT inferred —
         *   only what CozyCertification's own rules actually detect is
         *   reported.
         */
        selfCritique(files) {
            const cert = window.CozyOS.Certification;
            if (!cert) return { available: false, reason: "CozyCertification is not connected." };
            const results = files.map(f => {
                const r = cert.quickCertification(f.source, { moduleId: f.moduleId, moduleName: f.moduleId, version: "self-critique" });
                return { moduleId: f.moduleId, verdict: r.verdict, criticalCount: r.severityCounts.critical, highCount: r.severityCounts.high, issues: (r.defects || []).filter(d => !d.waived).map(d => `[${d.severity}] ${d.id}: ${d.description}`) };
            });
            const allClean = results.every(r => r.criticalCount === 0 && r.highCount === 0);
            return this.#deepClone({ available: true, allClean, results });
        }

        // =====================================================================
        // ─── ROADMAP ENGINE ───────────────────────────────────────────────────
        // "Completed" is real (ServiceRegistry's actual registered
        // coordinators). Current/Future/Blocked/Deferred/Deprecated are
        // caller-supplied — this engine has no way to know unannounced
        // future plans, so it organizes what it's told rather than
        // inventing a roadmap from nothing.
        // =====================================================================

        getRoadmap({ current = [], future = [], blocked = [], deferred = [], deprecated = [] } = {}) {
            const registry = window.CozyOS.ServiceRegistry;
            const completed = registry && typeof registry.listCoordinators === "function" ? registry.listCoordinators().map(c => c.name) : [];
            const roadmap = { completed, current, future, blocked, deferred, deprecated, generatedAt: new Date().toISOString() };
            if (window.CozyOS.CozyMemory) { try { window.CozyOS.CozyMemory.saveMemory("Project", "roadmap-current", roadmap, { tags: ["roadmap"] }); } catch (_e) { /* additive only */ } }
            return this.#deepClone(roadmap);
        }

        // =====================================================================
        // ─── TECHNICAL DEBT DETECTION ──────────────────────────────────────────
        // Real, mechanical checks only — line-count threshold for "large
        // file," InnovationEngine's real duplicate search for "duplicate
        // code." "Missing tests" is honestly disclosed: CozyOS has no
        // automated test-runner infrastructure to check against.
        // =====================================================================

        detectTechnicalDebt(files) {
            const largeFiles = files.filter(f => (f.source.match(/\n/g) || []).length > 800).map(f => f.moduleId);
            let duplicates = [];
            if (window.CozyOS.InnovationEngine) {
                for (const f of files) {
                    const d = window.CozyOS.InnovationEngine.duplicateDetection(f.moduleId);
                    if (d.available && d.matches.length > 0) duplicates.push({ moduleId: f.moduleId, matchCount: d.matches.length });
                }
            }
            return this.#deepClone({
                largeFiles, duplicates,
                missingTests: { available: false, reason: "CozyOS has no automated test-runner infrastructure to check coverage against — not implemented." },
                deprecatedApis: { available: false, reason: "No deprecation registry exists yet to check against." }
            });
        }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(PLAN_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ moduleVersion: PLAN_VERSION, ...this.#diagnostics, decisionCount: this.#decisions.size }); }
        exportSnapshot() { return this.#deepClone({ version: PLAN_VERSION, exportedAt: new Date().toISOString(), decisions: Array.from(this.#decisions.values()) }); }
        importSnapshot(s) { if (!s) throw new TypeError("[Planning] importSnapshot(): invalid."); let n = 0; for (const d of (s.decisions || [])) if (d?.id && !this.#decisions.has(d.id)) { this.#decisions.set(d.id, d); n++; } return { imported: n }; }
        isSnapshotCompatible(s) { return !!(s && typeof s.version === "string" && s.version.split(".")[0] === PLAN_VERSION.split(".")[0]); }
    }

    if (window.CozyOS.PlanningEngine?.getVersion) { if (window.CozyOS.PlanningEngine.getVersion() !== PLAN_VERSION) throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: PlanningEngine."); return; }
    window.CozyOS.PlanningEngine = new CozyOSPlanningEngine();

    (function reg(d) {
        function attempt() { if (typeof window.CozyOS.registerCoordinator !== "function") return false; try { window.CozyOS.registerCoordinator(d); } catch (_e) { /* non-fatal */ } return true; }
        if (attempt()) return;
        if (!Object.prototype.hasOwnProperty.call(window.CozyOS, "__pendingCoordinatorRegistrations")) Object.defineProperty(window.CozyOS, "__pendingCoordinatorRegistrations", { value: [], writable: true, enumerable: false, configurable: true });
        window.CozyOS.__pendingCoordinatorRegistrations.push(d);
        let n = 0; const iv = setInterval(() => { n++; if (attempt() || n >= 200) clearInterval(iv); }, 250);
    })({ name: "PlanningEngine", category: "Foundation", icon: "planning.svg", description: "Real dependency-gated recommendation + unlock-count ranking + WHY-NOT explanations + Developer Decision Memory. Business value/cost/revenue honestly not computed." });
})();
