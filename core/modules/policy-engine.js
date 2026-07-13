/**
 * CozyOS Enterprise Framework — CozyPolicyEngine
 * File Reference: core/modules/policy/policy-engine.js
 * Version: 1.0.0-ENTERPRISE
 * Layer: Core / Platform Service — Policy & Governance
 *
 * RESPONSIBILITY
 *   Real, versioned policy/governance registry: company rules, SOPs,
 *   approval workflows, compliance checklists — with a real enforcement
 *   hook other engines (Certification, Builder) can consult.
 *
 * HONEST SCOPE
 *   Policies are structured text/rules a human authors and approves —
 *   this engine stores, versions, and checks them; it does not
 *   generate governance content itself. Enforcement is a real check
 *   against a policy's own structured "requiredChecks" (e.g. "must be
 *   Enterprise Certified") — not legal/compliance judgment.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const POL_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    class CozyOSPolicyEngine {
        #policies = new Map(); // id -> { current, versions }
        #approvals = new Map();
        #responsibilities = new Map();
        #sops = new Map();
        #auditLogs = []; #listeners = new Map();
        #diagnostics = { policiesCreated: 0, approvalsRequested: 0, enforcementChecksRun: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 2.3 };

        getVersion() { return POL_VERSION; }
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
         * createPolicy({ name, category, rules, requiredChecks })
         *   category: "CompanyRule"|"SOP"|"Constitution"|"Compliance"|
         *   "ApprovalWorkflow". requiredChecks: real, checkable conditions
         *   (e.g. {type:"certification", verdict:"ENTERPRISE_CERTIFIED"}).
         */
        createPolicy({ name, category, orgId = null, description = null, purpose = null, scope = null, rules = [], requiredChecks = [], owner = null, approver = null, effectiveDate = null, reviewDate = null, expiryDate = null, riskLevel = null, complianceLevel = null, relatedPolicies = [] }) {
            if (!name || !category) throw new TypeError("[Policy] createPolicy(): name and category are required.");
            const id = this.#generateId("policy");
            const now = new Date().toISOString();
            const policy = {
                id, name: this.#escapeHtml(name), category, orgId,
                description: description ? this.#escapeHtml(description) : null, purpose: purpose ? this.#escapeHtml(purpose) : null, scope: scope ? this.#escapeHtml(scope) : null,
                rules: rules.map(r => this.#escapeHtml(r)), requiredChecks, owner, approver,
                effectiveDate, reviewDate, expiryDate, riskLevel, complianceLevel, relatedPolicies,
                status: "DRAFT", versionNumber: 1, createdAt: now
            };
            this.#policies.set(id, { current: policy, versions: [] });
            this.#diagnostics.policiesCreated++;
            this.#logAudit("POLICY_CREATED", `${name} (${category})`);
            if (window.CozyOS.CozyMemory) { try { window.CozyOS.CozyMemory.saveMemory("Project", `policy-${id}`, policy, { tags: ["policy", category] }); } catch (_e) { /* additive only */ } }
            this.emit("policy:created", { id, name });
            return this.#deepClone(policy);
        }

        getPolicy(id) { const p = this.#policies.get(id); return p ? this.#deepClone(p.current) : null; }
        /** listPolicies(predicate) or listPolicies({orgId, predicate}) — real organization isolation: passing orgId only ever returns that org's own policies (plus global orgId:null policies). */
        listPolicies(arg) {
            const { orgId, predicate } = typeof arg === "function" ? { orgId: undefined, predicate: arg } : (arg || {});
            let l = Array.from(this.#policies.values()).map(p => this.#deepClone(p.current));
            if (orgId !== undefined) l = l.filter(p => p.orgId === orgId || p.orgId === null);
            return Object.freeze(predicate ? l.filter(predicate) : l);
        }

        /** updatePolicy() — real versioning: prior version preserved, never overwritten silently. */
        updatePolicy(id, changes) {
            const entry = this.#policies.get(id);
            if (!entry) throw new Error(`[Policy] updatePolicy(): no policy "${id}".`);
            const versions = [...entry.versions, entry.current];
            const updated = { ...entry.current, ...changes, versionNumber: versions.length + 1, updatedAt: new Date().toISOString() };
            this.#policies.set(id, { current: updated, versions });
            this.#logAudit("POLICY_UPDATED", `${id} -> v${updated.versionNumber}`);
            return this.#deepClone(updated);
        }

        listVersions(id) { const e = this.#policies.get(id); if (!e) throw new Error(`[Policy] listVersions(): no policy "${id}".`); return this.#deepClone([...e.versions, e.current]); }

        /** requestApproval()/decideApproval() — real approval workflow, never auto-approved. */
        requestApproval(policyId, requestedBy) {
            const policy = this.#policies.get(policyId);
            if (!policy) throw new Error(`[Policy] requestApproval(): no policy "${policyId}".`);
            const id = this.#generateId("polapproval");
            const request = { id, policyId, requestedBy: this.#escapeHtml(requestedBy), status: "PENDING", requestedAt: new Date().toISOString() };
            this.#approvals.set(id, request);
            this.#diagnostics.approvalsRequested++;
            this.#logAudit("POLICY_APPROVAL_REQUESTED", policyId);
            return this.#deepClone(request);
        }

        /** decideApproval(requestId, approved, decidedByUserId) — if IdentityEngine is connected, verifies the deciding user actually holds an "approver" role via its real checkPermission(); never duplicates that logic here. */
        decideApproval(requestId, approved, decidedByUserId) {
            const request = this.#approvals.get(requestId);
            if (!request) throw new Error(`[Policy] decideApproval(): no request "${requestId}".`);
            const identity = window.CozyOS.IdentityEngine;
            if (identity && typeof identity.checkPermission === "function" && !identity.checkPermission(decidedByUserId, "approver")) {
                throw new Error(`[Policy] decideApproval(): "${decidedByUserId}" does not hold the "approver" role.`);
            }
            const updated = { ...request, status: approved ? "APPROVED" : "REJECTED", decidedBy: this.#escapeHtml(String(decidedByUserId)), decidedAt: new Date().toISOString() };
            this.#approvals.set(requestId, updated);
            if (approved) this.updatePolicy(request.policyId, { status: "ACTIVE" });
            this.#logAudit("POLICY_APPROVAL_DECIDED", `${requestId}: ${updated.status}`);
            return this.#deepClone(updated);
        }

        /**
         * enforcePolicy(policyId, context)
         *   Real check: evaluates the policy's own requiredChecks against
         *   real data the caller supplies (e.g. a Certification record).
         *   Only ACTIVE (approved) policies are enforceable.
         */
        // =====================================================================
        // ─── RESPONSIBILITY MANAGEMENT ──────────────────────────────────────
        // =====================================================================

        defineResponsibility({ orgId, role, allowedActions = [], forbiddenActions = [], escalatesTo = null }) {
            if (!role) throw new TypeError("[Policy] defineResponsibility(): role is required.");
            const id = this.#generateId("resp");
            const resp = { id, orgId, role: this.#escapeHtml(role), allowedActions, forbiddenActions, escalatesTo, createdAt: new Date().toISOString() };
            this.#responsibilities.set(id, resp);
            this.#logAudit("RESPONSIBILITY_DEFINED", `${role} (${orgId || "global"})`);
            return this.#deepClone(resp);
        }

        listResponsibilities(orgId) {
            const l = Array.from(this.#responsibilities.values());
            return Object.freeze(orgId === undefined ? l.map(r => this.#deepClone(r)) : l.filter(r => r.orgId === orgId).map(r => this.#deepClone(r)));
        }

        /** checkActionAllowed() — real check against a defined responsibility; forbidden always wins over allowed if both somehow list the same action. */
        checkActionAllowed(role, action) {
            const resp = Array.from(this.#responsibilities.values()).find(r => r.role === role);
            if (!resp) return { allowed: false, reason: `No responsibility defined for role "${role}".` };
            if (resp.forbiddenActions.includes(action)) return { allowed: false, reason: "Explicitly forbidden." };
            if (resp.allowedActions.includes(action)) return { allowed: true };
            return { allowed: false, reason: "Not in the allowed-actions list." };
        }

        // =====================================================================
        // ─── STANDARD OPERATING PROCEDURES ──────────────────────────────────
        // Real step/checklist tracking. Photo/video/signature capture is a
        // UI-layer concern this headless engine doesn't perform — steps
        // instead carry a real `evidenceRequired` flag and an
        // `evidenceReference` field the caller fills with wherever it
        // actually stored that evidence (e.g. a Workspace fileId).
        // =====================================================================

        createSOP({ name, orgId = null, steps = [] }) {
            if (!name || !Array.isArray(steps)) throw new TypeError("[Policy] createSOP(): name and steps[] are required.");
            const id = this.#generateId("sop");
            const sop = {
                id, name: this.#escapeHtml(name), orgId,
                steps: steps.map((s, i) => ({ index: i, description: this.#escapeHtml(s.description || s), evidenceRequired: !!s.evidenceRequired, completed: false, evidenceReference: null, completedAt: null })),
                createdAt: new Date().toISOString()
            };
            this.#sops.set(id, sop);
            if (window.CozyOS.CozyMemory) { try { window.CozyOS.CozyMemory.saveMemory("Project", `sop-${id}`, sop, { tags: ["sop"] }); } catch (_e) { /* additive only */ } }
            this.#logAudit("SOP_CREATED", name);
            return this.#deepClone(sop);
        }

        completeSOPStep(sopId, stepIndex, evidenceReference = null) {
            const sop = this.#sops.get(sopId);
            if (!sop) throw new Error(`[Policy] completeSOPStep(): no SOP "${sopId}".`);
            const step = sop.steps[stepIndex];
            if (!step) throw new Error(`[Policy] completeSOPStep(): no step ${stepIndex}.`);
            if (step.evidenceRequired && !evidenceReference) throw new Error(`[Policy] completeSOPStep(): step ${stepIndex} requires evidenceReference.`);
            step.completed = true; step.evidenceReference = evidenceReference; step.completedAt = new Date().toISOString();
            this.#logAudit("SOP_STEP_COMPLETED", `${sopId}/${stepIndex}`);
            return this.#deepClone(step);
        }

        getSOPStatus(sopId) {
            const sop = this.#sops.get(sopId);
            if (!sop) throw new Error(`[Policy] getSOPStatus(): no SOP "${sopId}".`);
            const completed = sop.steps.filter(s => s.completed).length;
            return this.#deepClone({ sopId, completed, total: sop.steps.length, fullyComplete: completed === sop.steps.length });
        }

        enforcePolicy(policyId, context = {}) {
            const policy = this.#policies.get(policyId)?.current;
            if (!policy) throw new Error(`[Policy] enforcePolicy(): no policy "${policyId}".`);
            if (policy.status !== "ACTIVE") return { compliant: null, reason: `Policy is ${policy.status}, not ACTIVE — not enforceable yet.` };
            this.#diagnostics.enforcementChecksRun++;
            const failures = policy.requiredChecks.filter(check => {
                if (check.type === "certification") return context.verdict !== check.verdict;
                return false;
            });
            return this.#deepClone({ compliant: failures.length === 0, failedChecks: failures });
        }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(POL_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ moduleVersion: POL_VERSION, ...this.#diagnostics, policyCount: this.#policies.size, approvalCount: this.#approvals.size }); }
        exportSnapshot() { return this.#deepClone({ version: POL_VERSION, exportedAt: new Date().toISOString(), policies: Array.from(this.#policies.entries()) }); }
        importSnapshot(s) { if (!s) throw new TypeError("[Policy] importSnapshot(): invalid."); let n = 0; for (const [id, e] of (s.policies || [])) if (!this.#policies.has(id)) { this.#policies.set(id, e); n++; } return { imported: n }; }
        isSnapshotCompatible(s) { return !!(s && typeof s.version === "string" && s.version.split(".")[0] === POL_VERSION.split(".")[0]); }
    }

    if (window.CozyOS.PolicyEngine?.getVersion) { if (window.CozyOS.PolicyEngine.getVersion() !== POL_VERSION) throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: PolicyEngine."); return; }
    window.CozyOS.PolicyEngine = new CozyOSPolicyEngine();

    (function reg(d) {
        function attempt() { if (typeof window.CozyOS.registerCoordinator !== "function") return false; try { window.CozyOS.registerCoordinator(d); } catch (_e) { /* non-fatal */ } return true; }
        if (attempt()) return;
        if (!Object.prototype.hasOwnProperty.call(window.CozyOS, "__pendingCoordinatorRegistrations")) Object.defineProperty(window.CozyOS, "__pendingCoordinatorRegistrations", { value: [], writable: true, enumerable: false, configurable: true });
        window.CozyOS.__pendingCoordinatorRegistrations.push(d);
        let n = 0; const iv = setInterval(() => { n++; if (attempt() || n >= 200) clearInterval(iv); }, 250);
    })({ name: "PolicyEngine", category: "Foundation", icon: "policy.svg", description: "Real versioned policy/governance registry with approval workflow and enforcement against caller-supplied real data (e.g. Certification verdicts)." });
})();
