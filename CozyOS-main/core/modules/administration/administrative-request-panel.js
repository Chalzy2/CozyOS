/**
 * CozyOS Administrative Requests — Administrator UI Panel
 * File Reference: core/modules/administration/administrative-request-panel.js
 * Layer: Application / Administrator Workspace Panel
 * Version: 1.0.0-ENTERPRISE
 * Milestone: Administrative Requests Browser Integration
 *
 * OWNERSHIP (Zero Duplication Rule)
 *   This file owns exactly one thing: rendering an honest, real-data
 *   Administrative Requests surface on admin-workspace.html and wiring
 *   its buttons to the REAL AdministrativeRequestCoordinator
 *   (core/modules/administration/administrative-request-coordinator.js)
 *   APIs — submitRequest(), decideRequest(), dispatchRequest(). It does
 *   not re-implement approval logic (owned by PolicyEngine/IdentityEngine
 *   via the coordinator), workflow execution (owned by Cozy Workflow
 *   Runtime), or permission checks (owned by IdentityEngine). It never
 *   invents a coordinator method that doesn't exist and never fabricates
 *   a request state the coordinator didn't actually report.
 *
 *   Matches the established sibling-module pattern (see
 *   core/modules/security/authentication-settings-module.js and
 *   authentication-enrollment-panel.js): a self-contained module
 *   registered at window.CozyOS.Modules["administrative-requests-panel"]
 *   with getDashboard()/init()/destroy()/getVersion(), pure build/render
 *   functions exposed for the Node regression harness, and lazy init()
 *   that does not self-attach to page navigation — a future milestone
 *   wires this into the Admin Workspace nav, matching
 *   founder-story-panel.js's own documented convention for the same
 *   reason.
 *
 * NOT MERGED INTO cozy-admin-workspace.js
 *   core/modules/admin/cozy-admin-workspace.js's own header states its
 *   four-owner scope (IdentityEngine, CozyOS.Auth, AuthorizationCoordinator,
 *   PlatformAudit) is closed and explicitly excludes PolicyEngine/
 *   PolicyDecisionEngine. Administrative Requests is a fifth, unrelated
 *   responsibility (request/approval/execution lifecycle) and lives here,
 *   in its own file, per Rule 17 (Scope Isolation).
 *
 * CLIENT-SIDE ROLE CHECKS ARE UI CONVENIENCE ONLY
 *   Any isPlatformAdmin()/checkPermission() call in this file only hides
 *   or shows a button. It is never treated as a security boundary — the
 *   real authorization check happens inside
 *   AdministrativeRequestCoordinator.decideRequest(), which delegates to
 *   PolicyEngine.decideApproval() or IdentityEngine.checkPermission()
 *   directly (see that file's own header). A user who bypasses this UI
 *   and calls decideRequest() directly still hits the same real,
 *   fail-closed check — this panel adds no new authority and removes
 *   none (matches core/shell/admin-gate-core.js's own documented
 *   "not a security boundary, only a UI convenience" principle).
 *
 * FAIL-CLOSED / HONEST-UNAVAILABLE
 *   If window.CozyOS.AdministrativeRequestCoordinator is not loaded
 *   (e.g. PolicyEngine, IdentityEngine, or WorkflowEngine was missing at
 *   load time, so the coordinator's own fail-closed guard refused to
 *   attach), this panel renders a clear "Administrative Requests is
 *   unavailable" state and does not fabricate a working surface. It
 *   never dispatches a PENDING or REJECTED request, and never reports a
 *   COMPLETED/FAILED execution that the real coordinator/runtime didn't
 *   actually report.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";

    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["administrative-requests-panel"] && window.CozyOS.Modules["administrative-requests-panel"].version) return;

    let rootEl = null;

    // ── Real accessors (never cached — always the live global) ──────────
    function coordinator() { return window.CozyOS.AdministrativeRequestCoordinator || null; }
    function identity() { return window.CozyOS.IdentityEngine || null; }
    function auth() { return window.CozyOS.Auth || null; }
    function workflowEngine() { return window.CozyOS.WorkflowEngine || null; }

    /**
     * getCurrentUserId()
     *   The one real place this panel asks "who is signed in" — delegates
     *   to CozyOS.Auth.getCurrentAdministrator(), same canonical source
     *   cozy-admin-workspace.js already uses. Never invents a user.
     */
    function getCurrentUserId() {
        const a = auth();
        if (!a || typeof a.getCurrentAdministrator !== "function") return null;
        const current = a.getCurrentAdministrator();
        return current ? current.userId : null;
    }

    /**
     * isApproverForDisplay(userId)
     *   UI-convenience-only check (see file header). Real enforcement
     *   always happens inside the coordinator regardless of this value.
     */
    function isApproverForDisplay(userId) {
        const id = identity();
        if (!id || !userId || typeof id.checkPermission !== "function") return false;
        try { return !!id.checkPermission(userId, "approver"); } catch (_err) { return false; }
    }

    /**
     * getAvailability()
     *   Honest dependency snapshot. Never reports available:true unless
     *   the real coordinator is actually attached.
     */
    function getAvailability() {
        const c = coordinator();
        return {
            available: !!c,
            reason: c ? null : "AdministrativeRequestCoordinator is not loaded (PolicyEngine, IdentityEngine, or WorkflowEngine was missing at page load — see that file's fail-closed guard).",
        };
    }

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    }

    /**
     * buildWorkflowOptions()
     *   Real workflow definitions from Cozy Workflow Runtime, never a
     *   hand-authored list.
     */
    function buildWorkflowOptions() {
        const wf = workflowEngine();
        if (!wf || typeof wf.listWorkflowDefinitions !== "function") return [];
        try { return wf.listWorkflowDefinitions() || []; } catch (_err) { return []; }
    }

    /**
     * buildRequestRow(request)
     *   Pure transform of one real coordinator request record into the
     *   fields this panel displays. Honestly represents all six real
     *   lifecycle states — never invents a seventh.
     */
    function buildRequestRow(request) {
        const canDispatch = request.state === "APPROVED";
        const canDecide = request.state === "REQUESTED";
        return {
            id: request.id,
            action: request.action,
            requester: request.requester,
            state: request.state,
            policyId: request.policyId,
            workflowId: request.workflowId,
            executionId: request.executionId,
            approver: request.approver,
            failureReason: request.failureReason,
            requestedAt: request.requestedAt,
            canDecide,
            canDispatch,
        };
    }

    function buildAllRows() {
        const c = coordinator();
        if (!c) return [];
        return c.listRequests().slice().reverse().map(buildRequestRow);
    }

    const STATE_BADGE_CLASS = {
        REQUESTED: "cozy-adminreq-badge-pending",
        APPROVED: "cozy-adminreq-badge-approved",
        REJECTED: "cozy-adminreq-badge-rejected",
        EXECUTING: "cozy-adminreq-badge-executing",
        COMPLETED: "cozy-adminreq-badge-completed",
        FAILED: "cozy-adminreq-badge-failed",
    };

    function renderRow(row) {
        const badgeClass = STATE_BADGE_CLASS[row.state] || "cozy-adminreq-badge-pending";
        const decideButtons = row.canDecide
            ? `<button class="cozy-adminreq-btn" data-action="approve" data-request-id="${escapeHtml(row.id)}">Approve</button>
               <button class="cozy-adminreq-btn cozy-adminreq-btn-danger" data-action="reject" data-request-id="${escapeHtml(row.id)}">Reject</button>`
            : "";
        const dispatchButton = row.canDispatch
            ? `<button class="cozy-adminreq-btn" data-action="dispatch" data-request-id="${escapeHtml(row.id)}">Dispatch</button>`
            : "";
        const detail = [
            row.workflowId ? `Workflow: ${escapeHtml(row.workflowId)}` : null,
            row.executionId ? `Execution: ${escapeHtml(row.executionId)}` : null,
            row.approver ? `Decided by: ${escapeHtml(row.approver)}` : null,
            row.failureReason ? `Reason: ${escapeHtml(row.failureReason)}` : null,
        ].filter(Boolean).join(" · ");

        return `
        <tr data-request-id="${escapeHtml(row.id)}">
            <td>${escapeHtml(row.id)}</td>
            <td>${escapeHtml(row.action)}</td>
            <td>${escapeHtml(row.requester)}</td>
            <td><span class="cozy-adminreq-badge ${badgeClass}">${escapeHtml(row.state)}</span></td>
            <td class="cozy-adminreq-detail">${detail || "—"}</td>
            <td class="cozy-adminreq-actions">${decideButtons}${dispatchButton}</td>
        </tr>`;
    }

    function renderRequestsTable() {
        const rows = buildAllRows();
        if (rows.length === 0) {
            return `<tr><td colspan="6" class="cozy-adminreq-empty">No administrative requests yet.</td></tr>`;
        }
        return rows.map(renderRow).join("\n");
    }

    function renderWorkflowOptions() {
        const defs = buildWorkflowOptions();
        if (defs.length === 0) return `<option value="">No workflow definitions available</option>`;
        return defs.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name || d.id)}</option>`).join("\n");
    }

    function renderUnavailable(reason) {
        return `
        <div id="cozy-adminreq-root">
            <h2>Administrative Requests</h2>
            <p class="cozy-adminreq-unavailable">Administrative Requests is unavailable — ${escapeHtml(reason)}</p>
        </div>`;
    }

    function getDashboard() {
        const availability = getAvailability();
        if (!availability.available) return renderUnavailable(availability.reason);

        const currentUserId = getCurrentUserId();
        const showApproverHint = currentUserId && !isApproverForDisplay(currentUserId);

        return `
        <style>
            #cozy-adminreq-root {
                --cozy-green: #00C853; --cozy-gold: #FFD700; --cozy-dark: #0A0A0A;
                --cozy-card-bg: #141414; --cozy-border: #222222;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background-color: var(--cozy-dark); color: #ffffff; padding: 20px; min-height: 100%;
            }
            #cozy-adminreq-root h2 { color: var(--cozy-gold); text-align: center; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 5px; }
            #cozy-adminreq-root p.subtitle { text-align: center; color: #aaaaaa; font-size: 14px; margin-bottom: 20px; }
            #cozy-adminreq-root .cozy-adminreq-unavailable { text-align: center; color: #ff5252; padding: 30px; }
            #cozy-adminreq-root .cozy-adminreq-form {
                max-width: 900px; margin: 0 auto 24px auto; background: var(--cozy-card-bg);
                border: 2px solid var(--cozy-border); border-radius: 12px; padding: 18px;
                display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end;
            }
            #cozy-adminreq-root .cozy-adminreq-field { display: flex; flex-direction: column; gap: 4px; }
            #cozy-adminreq-root .cozy-adminreq-field label { color: var(--cozy-gold); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
            #cozy-adminreq-root .cozy-adminreq-field input, #cozy-adminreq-root .cozy-adminreq-field select {
                background: #0d0d0d; border: 1px solid var(--cozy-border); color: #fff; padding: 6px 8px; border-radius: 6px; font-size: 13px;
            }
            #cozy-adminreq-root .cozy-adminreq-hint { width: 100%; color: #aaaaaa; font-size: 12px; font-style: italic; }
            #cozy-adminreq-root table { width: 100%; max-width: 1200px; margin: 0 auto; border-collapse: collapse; }
            #cozy-adminreq-root th, #cozy-adminreq-root td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--cozy-border); font-size: 13px; }
            #cozy-adminreq-root th { color: var(--cozy-gold); text-transform: uppercase; font-size: 11px; letter-spacing: 1px; }
            #cozy-adminreq-root .cozy-adminreq-empty { text-align: center; color: #777; font-style: italic; padding: 20px; }
            #cozy-adminreq-root .cozy-adminreq-badge { padding: 3px 8px; border-radius: 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
            #cozy-adminreq-root .cozy-adminreq-badge-pending { background: rgba(255, 215, 0, 0.15); color: var(--cozy-gold); }
            #cozy-adminreq-root .cozy-adminreq-badge-approved { background: rgba(0, 200, 83, 0.15); color: var(--cozy-green); }
            #cozy-adminreq-root .cozy-adminreq-badge-rejected { background: rgba(255, 82, 82, 0.15); color: #ff5252; }
            #cozy-adminreq-root .cozy-adminreq-badge-executing { background: rgba(41, 121, 255, 0.15); color: #82b1ff; }
            #cozy-adminreq-root .cozy-adminreq-badge-completed { background: rgba(0, 200, 83, 0.25); color: var(--cozy-green); }
            #cozy-adminreq-root .cozy-adminreq-badge-failed { background: rgba(255, 82, 82, 0.25); color: #ff5252; }
            #cozy-adminreq-root .cozy-adminreq-btn {
                background: transparent; border: 1px solid var(--cozy-green); color: var(--cozy-green);
                border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px; margin-right: 4px;
            }
            #cozy-adminreq-root .cozy-adminreq-btn:hover { background: rgba(0, 200, 83, 0.15); }
            #cozy-adminreq-root .cozy-adminreq-btn-danger { border-color: #ff5252; color: #ff5252; }
            #cozy-adminreq-root .cozy-adminreq-btn-danger:hover { background: rgba(255, 82, 82, 0.15); }
            #cozy-adminreq-root .cozy-adminreq-btn:disabled { opacity: 0.4; cursor: not-allowed; }
            #cozy-adminreq-root .cozy-adminreq-error { color: #ff5252; text-align: center; margin-bottom: 10px; font-size: 13px; }
        </style>
        <div id="cozy-adminreq-root">
            <h2>Administrative Requests</h2>
            <p class="subtitle">Real requests, real approvals, real dispatch — composed from PolicyEngine, IdentityEngine, and Cozy Workflow Runtime via AdministrativeRequestCoordinator.</p>
            <div id="cozy-adminreq-error"></div>
            <form class="cozy-adminreq-form" id="cozy-adminreq-submit-form">
                <div class="cozy-adminreq-field">
                    <label for="cozy-adminreq-action">Action</label>
                    <input type="text" id="cozy-adminreq-action" placeholder="e.g. disable-user" required />
                </div>
                <div class="cozy-adminreq-field">
                    <label for="cozy-adminreq-policyid">Policy ID (optional)</label>
                    <input type="text" id="cozy-adminreq-policyid" placeholder="leave blank for none" />
                </div>
                <div class="cozy-adminreq-field">
                    <label for="cozy-adminreq-workflowid">Workflow</label>
                    <select id="cozy-adminreq-workflowid">
                        <option value="">Select later at dispatch</option>
                        ${renderWorkflowOptions()}
                    </select>
                </div>
                <button type="submit" class="cozy-adminreq-btn" id="cozy-adminreq-submit-btn">Submit Request</button>
                ${showApproverHint ? `<span class="cozy-adminreq-hint">Signed in as "${escapeHtml(currentUserId)}" — this user does not currently hold the "approver" role, so Approve/Reject may be refused (real check happens in PolicyEngine/IdentityEngine, not here).</span>` : ""}
            </form>
            <table>
                <thead>
                    <tr><th>ID</th><th>Action</th><th>Requester</th><th>State</th><th>Detail</th><th>Actions</th></tr>
                </thead>
                <tbody id="cozy-adminreq-tbody">
                    ${renderRequestsTable()}
                </tbody>
            </table>
        </div>`;
    }

    function refreshView() {
        if (!rootEl) return;
        const tbody = rootEl.querySelector("#cozy-adminreq-tbody");
        if (tbody) tbody.innerHTML = renderRequestsTable();
    }

    function showError(message) {
        if (!rootEl) return;
        const box = rootEl.querySelector("#cozy-adminreq-error");
        if (box) box.innerHTML = message ? `<p class="cozy-adminreq-error">${escapeHtml(message)}</p>` : "";
    }

    /**
     * doSubmit({ action, requester, policyId, workflowId })
     *   Calls the real coordinator.submitRequest(). Never fabricates a
     *   REQUESTED row locally — the returned record is the only source
     *   of truth for what gets rendered next.
     */
    function doSubmit({ action, requester, policyId, workflowId }) {
        const c = coordinator();
        if (!c) throw new Error("AdministrativeRequestCoordinator is not loaded.");
        return c.submitRequest({
            action,
            requester,
            policyId: policyId || null,
            workflowId: workflowId || null,
        });
    }

    /**
     * doDecide(requestId, approved)
     *   Calls the real coordinator.decideRequest(). Any authorization
     *   failure (not an approver, already decided) is a real thrown
     *   error from PolicyEngine/IdentityEngine via the coordinator —
     *   surfaced honestly, never swallowed into a fake success.
     */
    function doDecide(requestId, approved) {
        const c = coordinator();
        if (!c) throw new Error("AdministrativeRequestCoordinator is not loaded.");
        const decidedBy = getCurrentUserId();
        if (!decidedBy) throw new Error("No signed-in administrator — cannot record a decision.");
        return c.decideRequest(requestId, approved, decidedBy);
    }

    /**
     * doDispatch(requestId, workflowId)
     *   Calls the real coordinator.dispatchRequest(). The coordinator
     *   itself refuses (throws) if the request is not APPROVED — this
     *   panel adds no separate gate and fabricates no success state.
     */
    async function doDispatch(requestId, workflowId) {
        const c = coordinator();
        if (!c) throw new Error("AdministrativeRequestCoordinator is not loaded.");
        return c.dispatchRequest(requestId, { workflowId: workflowId || undefined });
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        if (!rootEl) return;
        showError(null);
        const actionInput = rootEl.querySelector("#cozy-adminreq-action");
        const policyInput = rootEl.querySelector("#cozy-adminreq-policyid");
        const workflowSelect = rootEl.querySelector("#cozy-adminreq-workflowid");
        const submitBtn = rootEl.querySelector("#cozy-adminreq-submit-btn");
        const requester = getCurrentUserId();
        if (!requester) { showError("No signed-in administrator — cannot submit a request."); return; }

        if (submitBtn) submitBtn.disabled = true;
        try {
            doSubmit({
                action: actionInput ? actionInput.value.trim() : "",
                requester,
                policyId: policyInput ? policyInput.value.trim() : "",
                workflowId: workflowSelect ? workflowSelect.value : "",
            });
            if (actionInput) actionInput.value = "";
            if (policyInput) policyInput.value = "";
            refreshView();
        } catch (err) {
            showError(String(err && err.message ? err.message : err));
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    async function handleTableClick(event) {
        const btn = event.target.closest(".cozy-adminreq-btn");
        if (!btn || !rootEl) return;
        const requestId = btn.getAttribute("data-request-id");
        const action = btn.getAttribute("data-action");
        if (!requestId || !action) return;
        showError(null);
        btn.disabled = true;
        try {
            if (action === "approve") doDecide(requestId, true);
            else if (action === "reject") doDecide(requestId, false);
            else if (action === "dispatch") await doDispatch(requestId, null);
            refreshView();
        } catch (err) {
            showError(String(err && err.message ? err.message : err));
            btn.disabled = false;
        }
    }

    window.CozyOS.Modules["administrative-requests-panel"] = {
        version: MODULE_VERSION,
        getDashboard,
        async init() {
            rootEl = document.getElementById("cozy-adminreq-root")?.parentElement || document;
            const form = rootEl && rootEl.querySelector ? rootEl.querySelector("#cozy-adminreq-submit-form") : null;
            if (form && form.addEventListener) form.addEventListener("submit", handleFormSubmit);
            if (rootEl && rootEl.addEventListener) rootEl.addEventListener("click", handleTableClick);
        },
        destroy() {
            if (rootEl && rootEl.removeEventListener) rootEl.removeEventListener("click", handleTableClick);
            rootEl = null;
        },
        // Exposed for the Node regression harness to test the framework without a DOM.
        getAvailability, getCurrentUserId, isApproverForDisplay, buildWorkflowOptions,
        buildRequestRow, buildAllRows, renderRequestsTable, renderRow, renderWorkflowOptions,
        doSubmit, doDecide, doDispatch,
        getVersion() { return MODULE_VERSION; }
    };

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                sourcePath: "core/modules/administration/administrative-request-panel.js",
                name: "Administrative Requests Panel",
                category: "Platform",
                description: "Administrator UI for the real Administrative Request Coordinator lifecycle (REQUESTED→APPROVED/REJECTED→EXECUTING→COMPLETED/FAILED). Renders and calls only real coordinator/PolicyEngine/IdentityEngine/WorkflowEngine APIs — no parallel approval or execution logic.",
            });
        } catch (_err) { /* non-fatal — cataloguing is descriptive only */ }
    }
})();
