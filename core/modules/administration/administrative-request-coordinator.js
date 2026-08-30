/**
 * CozyOS Enterprise Framework — Administrative Request Coordinator
 * File Reference: core/modules/administration/administrative-request-coordinator.js
 * Version: 1.0.0-ENTERPRISE
 * Layer: Core / Platform Service — Administrative Request & Approval Coordination
 *
 * OWNERSHIP REVIEW (performed before writing this file)
 *   Inspected core/modules/policy/policy-engine.js, core/modules/identity/
 *   identity-engine.js, and core/modules/automation/cozy-workflow-runtime.js
 *   (plus its dependency core/modules/automation/cozy-automation.js).
 *   No existing "administrative request" or cross-domain approval
 *   coordinator was found anywhere in the repository (core/modules/admin/
 *   cozy-admin-workspace.js is a workspace/dashboard UI surface, not a
 *   request lifecycle engine — a different responsibility). This file is
 *   therefore genuinely new at the coordination layer, while every piece
 *   of real authority it depends on (approval decisions, permission
 *   checks, execution) is composed from the three engines above, never
 *   reimplemented.
 *
 * WHAT THIS FILE DOES NOT OWN (Zero Duplication Rule)
 *   - Policy storage/versioning/enforcement/approval-request bookkeeping:
 *     owned by PolicyEngine. When a request carries a policyId, the
 *     approval decision itself is fully delegated to
 *     PolicyEngine.requestApproval()/decideApproval() — this file does not
 *     re-implement policy-backed approval logic.
 *   - Role/permission storage and checks: owned by IdentityEngine. The
 *     policy-less approval path below calls IdentityEngine.checkPermission()
 *     directly with the same "approver" role PolicyEngine.decideApproval()
 *     itself already checks internally — no second permission system, no
 *     new role vocabulary.
 *   - Workflow execution: owned by Cozy Workflow Runtime
 *     (window.CozyOS.WorkflowEngine). This coordinator never runs a domain
 *     operation itself — it creates an execution against an existing
 *     workflow definition and dispatches it through the real runtime,
 *     recording whatever executionId/state the runtime actually returns.
 *
 * REAL LIFECYCLE
 *   REQUESTED → APPROVED / REJECTED → EXECUTING → COMPLETED / FAILED
 *   Every transition is fail-closed: no automatic approval, no execution
 *   while approval is pending or after rejection, no fabricated success.
 *
 * FAIL-CLOSED DEPENDENCY RULE
 *   This coordinator only attaches if PolicyEngine, IdentityEngine, and
 *   WorkflowEngine (Cozy Workflow Runtime) are already loaded. If any is
 *   missing, no parallel/partial implementation is created — the module
 *   logs an honest error and does not register itself, mirroring
 *   cozy-workflow-runtime.js's own fail-closed convention against
 *   CozyAutomation.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const ARC_VERSION = "1.0.0-ENTERPRISE";

    const REQUEST_STATES = Object.freeze(["REQUESTED", "APPROVED", "REJECTED", "EXECUTING", "COMPLETED", "FAILED"]);
    const APPROVER_ROLE = "approver"; // same role PolicyEngine.decideApproval() already checks — reused, not reinvented

    class AdministrativeRequestCoordinator {
        #policy; #identity; #workflow;
        #requests = new Map();
        #auditLogs = [];
        #listeners = new Map();
        #diagnostics = { requestsSubmitted: 0, decisionsRecorded: 0, dispatches: 0, errorsHidden: 0 };

        constructor(policyEngine, identityEngine, workflowEngine) {
            this.#policy = policyEngine;
            this.#identity = identityEngine;
            this.#workflow = workflowEngine;
        }

        getVersion() { return ARC_VERSION; }

        // ── Small local utilities (mirrors PolicyEngine's own conventions) ──
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`}`; }
        #logAudit(action, detail) {
            const entry = Object.freeze({ id: this.#generateId("arcaud"), timestamp: new Date().toISOString(), action, ...detail });
            this.#auditLogs.push(entry);
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
            // Best-effort: publish on the shared platform bus if present. Never
            // required — this coordinator's own audit log is the authoritative
            // record regardless of whether the shared bus is loaded.
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`administrativeRequest:${action}`, this.#deepClone(entry)); } catch (_e) { /* non-fatal */ }
            }
            return entry;
        }
        getAuditLog(predicate) { const l = this.#auditLogs.map(e => this.#deepClone(e)); return Object.freeze(predicate ? l.filter(predicate) : l); }

        on(event, handler) { if (!this.#listeners.has(event)) this.#listeners.set(event, new Set()); this.#listeners.get(event).add(handler); return () => this.off(event, handler); }
        off(event, handler) { const s = this.#listeners.get(event); if (!s) return false; const r = s.delete(handler); if (s.size === 0) this.#listeners.delete(event); return r; }
        #emit(event, payload) { const s = this.#listeners.get(event); if (!s) return; for (const fn of Array.from(s)) { try { fn(this.#deepClone(payload)); } catch (_e) { this.#diagnostics.errorsHidden++; } } }

        #cloneRequest(r) { return this.#deepClone(r); }

        /**
         * submitRequest({ action, requester, orgId, policyId, workflowId, payload })
         *   Creates a REQUESTED record. If policyId is supplied, a real
         *   PolicyEngine approval request is opened via
         *   PolicyEngine.requestApproval() and its id stored as approvalId —
         *   this coordinator never invents its own policy-approval bookkeeping.
         *   workflowId may be supplied here or later, at dispatch time.
         */
        submitRequest({ action, requester, orgId = null, policyId = null, workflowId = null, payload = {} } = {}) {
            if (!action || !requester) throw new TypeError("[AdminRequestCoordinator] submitRequest(): action and requester are required.");
            let approvalId = null;
            if (policyId) {
                const approval = this.#policy.requestApproval(policyId, requester);
                approvalId = approval.id;
            }
            const id = this.#generateId("adminreq");
            const now = new Date().toISOString();
            const request = {
                id, action, requester, orgId,
                policyId, approvalId, approver: null, approvalDecision: null,
                workflowId, executionId: null,
                state: "REQUESTED",
                payload,
                requestedAt: now, decidedAt: null, startedAt: null, endedAt: null,
                failureReason: null,
            };
            this.#requests.set(id, request);
            this.#diagnostics.requestsSubmitted++;
            this.#logAudit("REQUEST_SUBMITTED", { requestId: id, requester, requestAction: action, policyId, approvalId });
            this.#emit("request:submitted", { requestId: id });
            return this.#cloneRequest(request);
        }

        getRequest(requestId) { const r = this.#requests.get(requestId); return r ? this.#cloneRequest(r) : null; }
        listRequests(predicate) { const l = Array.from(this.#requests.values()).map(r => this.#cloneRequest(r)); return Object.freeze(predicate ? l.filter(predicate) : l); }

        /**
         * decideRequest(requestId, approved, decidedByUserId, { reason })
         *   Fail-closed authorization:
         *     - If the request carries a policyId, the decision is fully
         *       delegated to PolicyEngine.decideApproval(), which already
         *       verifies the deciding user holds the "approver" role via
         *       IdentityEngine.checkPermission() — never re-checked or
         *       re-implemented here.
         *     - If there is no policyId, this coordinator performs the same
         *       real check directly against IdentityEngine.checkPermission()
         *       using the identical "approver" role — no second permission
         *       system, no automatic approval.
         *   A request may only be decided once (REQUESTED -> APPROVED/REJECTED).
         */
        decideRequest(requestId, approved, decidedByUserId, { reason = null } = {}) {
            const request = this.#requests.get(requestId);
            if (!request) throw new Error(`[AdminRequestCoordinator] decideRequest(): unknown request "${requestId}".`);
            if (request.state !== "REQUESTED") throw new Error(`[AdminRequestCoordinator] decideRequest(): "${requestId}" is already decided (state "${request.state}").`);

            if (request.policyId) {
                // Delegates authorization AND bookkeeping to PolicyEngine —
                // throws honestly if the user isn't an approver, or if the
                // approval request was already decided.
                this.#policy.decideApproval(request.approvalId, approved, decidedByUserId);
            } else {
                if (!this.#identity.checkPermission(decidedByUserId, APPROVER_ROLE, { orgId: request.orgId })) {
                    throw new Error(`[AdminRequestCoordinator] decideRequest(): "${decidedByUserId}" does not hold the "${APPROVER_ROLE}" role.`);
                }
            }

            request.approver = decidedByUserId;
            request.approvalDecision = approved ? "APPROVED" : "REJECTED";
            request.state = approved ? "APPROVED" : "REJECTED";
            request.decidedAt = new Date().toISOString();
            if (!approved) { request.endedAt = request.decidedAt; request.failureReason = reason || "rejected"; }

            this.#diagnostics.decisionsRecorded++;
            this.#logAudit("REQUEST_DECIDED", { requestId, approver: decidedByUserId, decision: request.approvalDecision });
            this.#emit("request:decided", { requestId, decision: request.approvalDecision });
            return this.#cloneRequest(request);
        }

        /**
         * dispatchRequest(requestId, { workflowId, variables })
         *   Only an APPROVED request may be dispatched (fail-closed — pending
         *   or rejected requests throw). Creates a real execution against the
         *   existing workflow definition via WorkflowEngine.createExecution()
         *   and, since administrative approval already happened here, enqueues
         *   it directly via WorkflowEngine.enqueueExecution() — never through
         *   its own separate approval-gated execution type, avoiding a double
         *   approval concept. Awaits the real dispatched result; COMPLETED/
         *   FAILED on the request reflects exactly what the runtime reports,
         *   never a fabricated success. A request may only be dispatched once.
         */
        async dispatchRequest(requestId, { workflowId = null, variables = {} } = {}) {
            const request = this.#requests.get(requestId);
            if (!request) throw new Error(`[AdminRequestCoordinator] dispatchRequest(): unknown request "${requestId}".`);
            if (request.state !== "APPROVED") throw new Error(`[AdminRequestCoordinator] dispatchRequest(): "${requestId}" is not APPROVED (state "${request.state}") — cannot dispatch.`);

            const resolvedWorkflowId = workflowId || request.workflowId;
            if (!resolvedWorkflowId) throw new Error(`[AdminRequestCoordinator] dispatchRequest(): "${requestId}" has no workflowId.`);

            // Synchronous state flip before any await — prevents a concurrent
            // second dispatchRequest() call on the same request from racing in.
            request.workflowId = resolvedWorkflowId;
            request.state = "EXECUTING";
            request.startedAt = new Date().toISOString();
            this.#diagnostics.dispatches++;
            this.#logAudit("REQUEST_DISPATCH_STARTED", { requestId, workflowId: resolvedWorkflowId });
            this.#emit("request:executing", { requestId });

            let execution;
            try {
                execution = this.#workflow.createExecution({ workflowId: resolvedWorkflowId, type: "user", triggeredBy: `admin-request:${requestId}`, variables });
            } catch (err) {
                request.state = "FAILED";
                request.endedAt = new Date().toISOString();
                request.failureReason = String(err.message || err).slice(0, 256);
                this.#logAudit("REQUEST_DISPATCH_FAILED", { requestId, reason: request.failureReason });
                this.#emit("request:failed", { requestId, reason: request.failureReason });
                return this.#cloneRequest(request);
            }

            request.executionId = execution.id;
            this.#logAudit("REQUEST_EXECUTION_LINKED", { requestId, executionId: execution.id });

            const result = await this.#workflow.enqueueExecution(execution.id);

            if (result && result.status === "completed") {
                request.state = "COMPLETED";
            } else {
                request.state = "FAILED";
                request.failureReason = (result && result.reason) || "workflow execution did not complete successfully";
            }
            request.endedAt = new Date().toISOString();

            this.#logAudit(request.state === "COMPLETED" ? "REQUEST_COMPLETED" : "REQUEST_FAILED", { requestId, executionId: execution.id, requester: request.requester, approver: request.approver, ...(request.state === "FAILED" ? { reason: request.failureReason } : {}) });
            this.#emit(request.state === "COMPLETED" ? "request:completed" : "request:failed", { requestId, executionId: execution.id, reason: request.failureReason });
            return this.#cloneRequest(request);
        }

        getDiagnosticsReport() { return this.#deepClone({ moduleVersion: ARC_VERSION, ...this.#diagnostics, requestCount: this.#requests.size, states: REQUEST_STATES }); }
    }

    if (window.CozyOS.AdministrativeRequestCoordinator?.getVersion) {
        if (window.CozyOS.AdministrativeRequestCoordinator.getVersion() !== ARC_VERSION) throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: AdministrativeRequestCoordinator.");
        return;
    }

    if (!window.CozyOS.PolicyEngine || !window.CozyOS.IdentityEngine || !window.CozyOS.WorkflowEngine) {
        console.error("[AdminRequestCoordinator] One or more required dependencies (PolicyEngine, IdentityEngine, WorkflowEngine) are not loaded. Coordinator cannot attach — load order dependency unmet. No fallback/partial implementation was created (fail closed).");
        return;
    }

    window.CozyOS.AdministrativeRequestCoordinator = new AdministrativeRequestCoordinator(window.CozyOS.PolicyEngine, window.CozyOS.IdentityEngine, window.CozyOS.WorkflowEngine);

    try {
        if (typeof window.CozyOS.registerCoordinator === "function") {
            window.CozyOS.registerCoordinator({
                sourcePath: "core/modules/administration/administrative-request-coordinator.js",
                name: "Administrative Request Coordinator",
                key: "AdministrativeRequestCoordinator",
                category: "platform",
                description: "Cross-domain administrative request/approval lifecycle (REQUESTED→APPROVED/REJECTED→EXECUTING→COMPLETED/FAILED) composing PolicyEngine (policy-backed approval), IdentityEngine (approver authorization), and Cozy Workflow Runtime (execution) — never a parallel implementation of any of the three.",
            });
        }
    } catch (_err) { /* non-fatal — cataloguing is descriptive only */ }
})();
