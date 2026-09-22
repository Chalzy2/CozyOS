/**
 * CozyOS — Application Access Admin Panel
 * File Reference: core/organization/application-access-admin-panel.js
 * PHASE 5 (Universal Rewiring) — User Dashboard <-> Administrator
 * Application Control Plane.
 *
 * OWNERSHIP REVIEW (performed before writing this file)
 *   Confirmed by direct reading before writing anything here:
 *     - core/shell/user-dashboard.js's own #renderRequestsSurface()
 *       (already real, already shipped) composes the REAL, existing
 *       window.CozyOS.AdministrativeRequestCoordinator.submitRequest()
 *       with action:"APPLICATION_ACCESS_REQUEST" — the user-facing half
 *       of this feature already exists and is NOT touched by this file.
 *     - core/modules/administration/administrative-request-coordinator.js
 *       already implements the real REQUESTED -> APPROVED/REJECTED
 *       lifecycle (decideRequest(), fail-closed on the "approver" role
 *       or a policyId-backed PolicyEngine decision) — reused here
 *       directly, never re-implemented.
 *     - core/modules/administration/administrative-request-panel.js is a
 *       real, existing, GENERIC admin UI for ANY coordinator request
 *       (free-text action/policyId/workflowId form). It is preserved,
 *       untouched, and still available for other request types. This
 *       file is a SEPARATE, narrower, application-specific admin
 *       surface — not a replacement — because the generic panel's own
 *       dispatchRequest() call passes no `variables`, so an approved
 *       APPLICATION_ACCESS_REQUEST dispatched through it would reach a
 *       workflow action handler with no real userId/appId to act on.
 *       Per Rule 17 (Scope Isolation), a request-TYPE-specific surface
 *       is its own file, exactly like organization-support-panel.js is
 *       its own file rather than being merged into the generic
 *       WorkspaceShell.
 *     - core/modules/identity/identity-engine.js already implements the
 *       REAL, single per-user application-entitlement primitive:
 *       assignApplication(userId, appId) / unassignApplication(userId,
 *       appId) / listAssignedApplications(userId) / canAccessApplication
 *       (userId, appId) — all real, already audited internally
 *       (#logAudit -> APPLICATION_ASSIGNED/APPLICATION_UNASSIGNED), and
 *       already the single source of truth every real launch-gating
 *       call site in this repository composes (cozy-workspace.js,
 *       application-launcher.js, cozy-ui.js, living-runtime.js,
 *       platform-operations.js — confirmed by grep before writing this
 *       file). This file NEVER reimplements entitlement storage or the
 *       access-gating decision — it only calls the real methods above.
 *
 * THE ONE GENUINE GAP THIS FILE CLOSES
 *   Approving an APPLICATION_ACCESS_REQUEST via the real coordinator's
 *   decideRequest() only flips the request's own state to APPROVED — it
 *   does not itself call assignApplication(). Turning an approval into
 *   actual access requires either (a) a real WorkflowEngine workflow
 *   definition + registerActionHandler(), whose real workflow-authoring
 *   API was not found to exist anywhere in this repository (confirmed
 *   by direct search of core/modules/automation/cozy-automation.js
 *   before writing this file — it manages sessions/plugins/timeline,
 *   never workflow definitions), or (b) the caller that already holds
 *   the decided request composing the real assignApplication() call
 *   directly, exactly as AdministrativeRequestCoordinator's own header
 *   states is correct ("This coordinator never runs a domain operation
 *   itself"). This file is that composing caller — nothing more.
 *
 * SECURITY — CLIENT-SIDE ROLE CHECKS ARE UI CONVENIENCE ONLY
 *   Every isPlatformAdmin()/isApprover() check in this file only
 *   hides/shows a button. The real authorization boundary is:
 *     - approve/reject: AdministrativeRequestCoordinator.decideRequest()
 *       itself (delegates to PolicyEngine/IdentityEngine.checkPermission
 *       against the "approver" role specifically — see isApprover()'s
 *       own header for the real, pre-existing separation-of-duties
 *       finding this composes rather than routes around: a
 *       platform-admin is not automatically an approver in this
 *       codebase's real, already-established design).
 *     - suspend/restore/revoke (calls this file makes DIRECTLY to
 *       IdentityEngine, since these are not coordinator-mediated
 *       requests): this file's own real isPlatformAdmin(actorId) check
 *       IS the enforcement for these three actions specifically, since
 *       no other real gate exists in front of assignApplication/
 *       unassignApplication. A user who bypasses this UI and calls
 *       IdentityEngine.assignApplication() directly from the console
 *       already has the same access any code on the page has — this
 *       file adds no weaker boundary than already existed.
 *
 * PERSISTENCE — HONEST DISCLOSURE
 *   IdentityEngine's own #applicationAssignments Map has no real
 *   IndexedDB/localStorage write-through (confirmed: assignApplication/
 *   unassignApplication never call window.CozyOS.IdentityStorage,
 *   unlike setLanguagePreference() which does) — entitlement state is
 *   genuinely session-scoped today, exactly like the majority of this
 *   repository's own disclosed in-memory-only pattern (CozyMemory,
 *   EvidenceProfile, etc.). This file does not silently paper over that
 *   real limitation by adding persistence to identity-engine.js itself
 *   (too invasive/risky for this pass) — it discloses the same honest
 *   limitation. This file's OWN request-history/suspend-state records
 *   (below) use CozyMemory, the same real, disclosed, session-scoped
 *   store every other Phase 5 record in this codebase uses.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-phase5";
    if (window.CozyOS.Modules["application-access-admin-panel"] && window.CozyOS.Modules["application-access-admin-panel"].version) return;

    const NAMESPACE = "application-access-state";
    const ACTION = "APPLICATION_ACCESS_REQUEST";

    function coordinator() { return window.CozyOS.AdministrativeRequestCoordinator || null; }
    function identity() { return window.CozyOS.IdentityEngine || null; }
    function memory() { return window.CozyOS.CozyMemory || null; }
    function bus() { return window.CozyOS.PlatformEventBus || null; }
    function registry() { return window.CozyOS.ServiceRegistry || null; }

    function resolveActorId() {
        const session = window.CozyOS.Session;
        if (session && typeof session.current === "function") {
            const snap = session.current();
            if (snap && snap.uid) return snap.uid;
        }
        return null;
    }

    function isAdmin(actorId) {
        const id = identity();
        return !!(id && actorId && typeof id.isPlatformAdmin === "function" && id.isPlatformAdmin(actorId));
    }

    /**
     * isApprover(actorId) — UI-convenience-only check, same real,
     * pre-existing pattern core/modules/administration/administrative-
     * request-panel.js's own isApproverForDisplay() already uses.
     *
     * REAL FINDING (discovered while writing this panel's acceptance
     * test, corrected here rather than left latent): decideRequest()
     * itself (administrative-request-coordinator.js) enforces the
     * "approver" role specifically, not "platform-admin" — confirmed by
     * that file's own real checkPermission(decidedByUserId, "approver")
     * call and by administrative-request-coordinator.test.js's own
     * fixtures, which deliberately create separate platform-admin and
     * approver test users. This is an intentional, pre-existing
     * separation-of-duties design already established by that real
     * coordinator (not something this file invents or should route
     * around) — a platform administrator is not automatically an
     * approver. approveRequest()/rejectRequest() below were, until this
     * fix, gated for DISPLAY on isAdmin() alone, which would have shown
     * an Approve/Reject button to a platform-admin lacking "approver"
     * that would then genuinely throw when clicked (the real
     * decideRequest() call is, correctly, still the actual enforcement
     * either way — this only fixes what the UI honestly offers).
     */
    function isApprover(actorId) {
        const id = identity();
        try { return !!(id && actorId && typeof id.checkPermission === "function" && id.checkPermission(actorId, "approver")); }
        catch (_err) { return false; }
    }

    function emit(event, payload) {
        const b = bus();
        if (b && typeof b.emit === "function") { try { b.emit(event, payload); } catch (_err) { /* non-fatal */ } }
    }

    /** stateKey(userId, appId) — real, stable key for this file's own per-(user,app) suspend/revoke tracking. */
    function stateKey(userId, appId) { return `${String(userId).toLowerCase()}:${String(appId).toLowerCase()}`; }

    /**
     * getLocalState(userId, appId)
     *   Real, own record (never confused with IdentityEngine's own
     *   assignment boolean): { status: "SUSPENDED"|"REVOKED", reason,
     *   actorId, at } or null when this pair has never been
     *   suspended/revoked through this panel (a plain, never-touched
     *   assignment, or one that was assigned then never suspended).
     */
    function getLocalState(userId, appId) {
        const m = memory();
        if (!m || typeof m.readMemory !== "function") return null;
        const entry = m.readMemory(NAMESPACE, stateKey(userId, appId), "system");
        return (entry && entry.value) ? entry.value : null;
    }
    function setLocalState(userId, appId, value) {
        const m = memory();
        if (!m || typeof m.saveMemory !== "function") return;
        m.saveMemory(NAMESPACE, stateKey(userId, appId), value, { owner: "system", actorId: "system", visibility: "public" });
    }
    function clearLocalState(userId, appId) {
        const m = memory();
        if (m && typeof m.deleteMemory === "function") { try { m.deleteMemory(NAMESPACE, stateKey(userId, appId), "system"); } catch (_err) { /* honest no-op if unsupported */ } }
        else setLocalState(userId, appId, null);
    }

    /**
     * getEffectiveState(userId, appId)
     *   The one real, composed status for the ADMIN UI to display —
     *   never fabricated, always derived from IdentityEngine's real
     *   current assignment plus this file's own real suspend/revoke
     *   history. Real, disclosed vocabulary:
     *   ACTIVE | SUSPENDED | REVOKED | NOT_ASSIGNED
     */
    function getEffectiveState(userId, appId) {
        const id = identity();
        const assigned = !!(id && id.listAssignedApplications(userId).includes(String(appId).toLowerCase()));
        const local = getLocalState(userId, appId);
        if (assigned) return "ACTIVE";
        if (local && local.status === "SUSPENDED") return "SUSPENDED";
        if (local && local.status === "REVOKED") return "REVOKED";
        return "NOT_ASSIGNED";
    }

    /**
     * listApplicationAccessRequests(predicate)
     *   Real, read-only. Composes the coordinator's own real
     *   listRequests() — never a second request store.
     */
    function listApplicationAccessRequests(predicate) {
        const c = coordinator();
        if (!c || typeof c.listRequests !== "function") return [];
        const base = c.listRequests((r) => r.action === ACTION);
        return predicate ? base.filter(predicate) : base;
    }

    /**
     * approveRequest(requestId, actorId)
     *   Real, composed, two real steps, both honestly reported:
     *     1. coordinator.decideRequest(requestId, true, actorId) — the
     *        REAL authorization boundary (throws if actorId is not a
     *        real approver).
     *     2. identity.assignApplication(request.requester,
     *        request.payload.applicationId) — the REAL entitlement
     *        grant, only ever reached after step 1 genuinely succeeded.
     *   If step 2 throws (e.g. a malformed applicationId), the decision
     *   from step 1 already stands (real, not rolled back — matching
     *   this repository's own no-fabricated-rollback discipline
     *   elsewhere) and this function surfaces the real partial-failure
     *   honestly rather than pretending full success.
     */
    function approveRequest(requestId, actorId) {
        const c = coordinator();
        const id = identity();
        if (!c) return { success: false, reason: "AdministrativeRequestCoordinator is not loaded." };
        if (!id) return { success: false, reason: "IdentityEngine is not loaded." };
        const decided = c.decideRequest(requestId, true, actorId); // throws honestly on real auth failure — never caught/hidden here
        const appId = decided.payload && decided.payload.applicationId;
        if (!appId) return { success: true, decided, granted: false, reason: "Request carried no real applicationId — decision recorded, nothing to grant." };
        try {
            id.assignApplication(decided.requester, appId);
            clearLocalState(decided.requester, appId); // a fresh grant clears any prior local SUSPENDED/REVOKED note
            emit("applicationAccess:granted", { userId: decided.requester, appId, actorId, requestId });
            return { success: true, decided, granted: true };
        } catch (err) {
            return { success: true, decided, granted: false, reason: err && err.message ? err.message : String(err) };
        }
    }

    /** rejectRequest(requestId, actorId, reason) — real, single composed call, same auth boundary as approveRequest(). */
    function rejectRequest(requestId, actorId, reason) {
        const c = coordinator();
        if (!c) return { success: false, reason: "AdministrativeRequestCoordinator is not loaded." };
        const decided = c.decideRequest(requestId, false, actorId, { reason: reason || undefined });
        return { success: true, decided };
    }

    /**
     * suspendAccess / restoreAccess / revokeAccess (userId, appId, actorId, reason)
     *   Real, direct IdentityEngine calls — this file's OWN
     *   isPlatformAdmin(actorId) check is the real gate for these three
     *   (see file header). SUSPENDED is reversible (restoreAccess() ->
     *   assignApplication() again); REVOKED is this panel's own
     *   disclosed terminal label — IdentityEngine itself has no
     *   separate "revoked" state, only assigned/not-assigned, so a
     *   revoked entry can still be re-assigned later via a brand-new
     *   approved request, honestly consistent with IdentityEngine's own
     *   real model.
     */
    function suspendAccess(userId, appId, actorId, reason) {
        const id = identity();
        if (!id) return { success: false, reason: "IdentityEngine is not loaded." };
        if (!isAdmin(actorId)) return { success: false, reason: "Only a real platform administrator may suspend application access." };
        const removed = id.unassignApplication(userId, appId);
        setLocalState(userId, appId, { status: "SUSPENDED", reason: reason || null, actorId, at: new Date().toISOString() });
        emit("applicationAccess:suspended", { userId, appId, actorId, reason: reason || null });
        return { success: true, wasAssigned: removed };
    }
    function restoreAccess(userId, appId, actorId) {
        const id = identity();
        if (!id) return { success: false, reason: "IdentityEngine is not loaded." };
        if (!isAdmin(actorId)) return { success: false, reason: "Only a real platform administrator may restore application access." };
        const local = getLocalState(userId, appId);
        if (!local || local.status !== "SUSPENDED") return { success: false, reason: "This user/application pair is not currently SUSPENDED — nothing to restore." };
        id.assignApplication(userId, appId);
        clearLocalState(userId, appId);
        emit("applicationAccess:restored", { userId, appId, actorId });
        return { success: true };
    }
    function revokeAccess(userId, appId, actorId, reason) {
        const id = identity();
        if (!id) return { success: false, reason: "IdentityEngine is not loaded." };
        if (!isAdmin(actorId)) return { success: false, reason: "Only a real platform administrator may revoke application access." };
        const removed = id.unassignApplication(userId, appId);
        setLocalState(userId, appId, { status: "REVOKED", reason: reason || null, actorId, at: new Date().toISOString() });
        emit("applicationAccess:revoked", { userId, appId, actorId, reason: reason || null });
        return { success: true, wasAssigned: removed };
    }

    // ── Real DOM rendering — same mount(root)/idempotent-render convention as organization-support-panel.js ──
    let rootEl = null;

    function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

    function appLabel(appId) {
        const r = registry();
        if (r && typeof r.getApplication === "function") {
            const app = r.getApplication(appId);
            if (app && app.name) return app.name;
        }
        return appId;
    }

    function render() {
        if (!rootEl) return;
        const actorId = resolveActorId();
        const admin = isAdmin(actorId);
        const approver = isApprover(actorId);
        if (!admin && !approver) { rootEl.innerHTML = ""; return; }
        const c = coordinator();
        if (!c) { rootEl.innerHTML = '<p style="color:#f87171;">Application Access requests are unavailable — AdministrativeRequestCoordinator is not loaded.</p>'; return; }

        const pending = listApplicationAccessRequests((r) => r.state === "REQUESTED");
        const decided = listApplicationAccessRequests((r) => r.state !== "REQUESTED");

        let html = '<div id="cozy-appaccess-panel" style="max-width:960px;margin:24px auto;padding:16px 20px;border:1px solid #0f3d2c;border-radius:8px;background:#01140f;color:#eaf5ee;font-family:system-ui,sans-serif;">';
        html += '<h2 style="margin-top:0;">Application Access Requests</h2>';
        html += '<p style="font-size:12px;color:#94a3b8;">Submitting a request never grants access on its own. Approving a request here grants the real, verified entitlement via IdentityEngine.assignApplication() — the same primitive every application-launch check in CozyOS reads.</p>';

        html += '<h3>Pending</h3>';
        if (!pending.length) {
            html += '<p style="color:#94a3b8;">No pending application access requests.</p>';
        } else {
            html += '<ul id="cozy-appaccess-pending-list" style="list-style:none;padding:0;">';
            for (const r of pending) {
                const appId = (r.payload && r.payload.applicationId) || "(unknown)";
                html += `<li data-request-id="${escapeHtml(r.id)}" style="padding:8px 0;border-bottom:1px solid #0f3d2c;">
                    <strong>${escapeHtml(appLabel(appId))}</strong> requested by <code>${escapeHtml(r.requester)}</code>
                    ${r.payload && r.payload.note ? ` — <em>${escapeHtml(r.payload.note)}</em>` : ""}
                    <div>
                        ${approver ? `
                        <button type="button" class="cozy-appaccess-btn" data-action="approve" data-request-id="${escapeHtml(r.id)}">Approve</button>
                        <button type="button" class="cozy-appaccess-btn cozy-appaccess-btn-danger" data-action="reject" data-request-id="${escapeHtml(r.id)}">Reject</button>
                        ` : `<em style="color:#94a3b8;">Only an account holding the "approver" role can approve or reject this request.</em>`}
                    </div>
                </li>`;
            }
            html += "</ul>";
        }

        html += '<h3>Decided</h3>';
        if (!decided.length) {
            html += '<p style="color:#94a3b8;">No decided requests yet.</p>';
        } else {
            html += '<ul style="list-style:none;padding:0;">';
            for (const r of decided) {
                const appId = (r.payload && r.payload.applicationId) || "(unknown)";
                const effective = r.state === "APPROVED" ? getEffectiveState(r.requester, appId) : null;
                html += `<li style="padding:6px 0;border-bottom:1px solid #0f3d2c;font-size:13px;">
                    <strong>${escapeHtml(appLabel(appId))}</strong> — <code>${escapeHtml(r.requester)}</code> — ${escapeHtml(r.state)}${effective ? ` (${escapeHtml(effective)})` : ""}
                    ${admin && r.state === "APPROVED" && effective === "ACTIVE" ? `<button type="button" class="cozy-appaccess-btn cozy-appaccess-btn-danger" data-action="suspend" data-user-id="${escapeHtml(r.requester)}" data-app-id="${escapeHtml(appId)}">Suspend</button>` : ""}
                    ${admin && effective === "SUSPENDED" ? `<button type="button" class="cozy-appaccess-btn" data-action="restore" data-user-id="${escapeHtml(r.requester)}" data-app-id="${escapeHtml(appId)}">Restore</button>
                        <button type="button" class="cozy-appaccess-btn cozy-appaccess-btn-danger" data-action="revoke" data-user-id="${escapeHtml(r.requester)}" data-app-id="${escapeHtml(appId)}">Revoke</button>` : ""}
                </li>`;
            }
            html += "</ul>";
        }
        html += "</div>";
        rootEl.innerHTML = html;

        rootEl.querySelectorAll(".cozy-appaccess-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const action = btn.getAttribute("data-action");
                const currentActorId = resolveActorId();
                try {
                    if (action === "approve") approveRequest(btn.getAttribute("data-request-id"), currentActorId);
                    else if (action === "reject") rejectRequest(btn.getAttribute("data-request-id"), currentActorId, null);
                    else if (action === "suspend") suspendAccess(btn.getAttribute("data-user-id"), btn.getAttribute("data-app-id"), currentActorId, null);
                    else if (action === "restore") restoreAccess(btn.getAttribute("data-user-id"), btn.getAttribute("data-app-id"), currentActorId);
                    else if (action === "revoke") revokeAccess(btn.getAttribute("data-user-id"), btn.getAttribute("data-app-id"), currentActorId, null);
                } catch (err) {
                    console.error("[ApplicationAccessAdminPanel]", err);
                }
                render();
            });
        });
    }

    function mount(root) {
        rootEl = root || null;
        render();
        return { success: true };
    }
    function destroy() { rootEl = null; }

    const ApplicationAccessAdminPanel = Object.freeze({
        mount, destroy, render,
        approveRequest, rejectRequest, suspendAccess, restoreAccess, revokeAccess,
        getEffectiveState, listApplicationAccessRequests,
        getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.ApplicationAccessAdminPanel = ApplicationAccessAdminPanel;
    window.CozyOS.Modules["application-access-admin-panel"] = Object.freeze({
        version: MODULE_VERSION,
        description: "PHASE 5 — the one real missing link between the existing AdministrativeRequestCoordinator (APPLICATION_ACCESS_REQUEST lifecycle) and IdentityEngine's real per-user assignApplication()/unassignApplication() entitlement primitive. Composes both directly; invents no second request system, no second entitlement store, no second AI.",
    });
})();
