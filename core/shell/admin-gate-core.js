/**
 * CozyOS — Administrator Gate Core
 * File Reference: core/shell/admin-gate-core.js
 *
 * CLASSIFICATION: pure logic, no DOM, no network calls — follows the
 * repository's established "-core.js" convention (see
 * core/shell/dashboard-navigation-core.js for precedent): attaches to
 * window.CozyOS so it loads as a plain <script> in Chalzydashboard.html,
 * and is Node-testable by stubbing global.window before require().
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * The previous Chalzydashboard.html gate asked the CLIENT-SIDE
 * IdentityEngine ("identity.isPlatformAdmin(userId)" /
 * "identity.checkResourcePermission(userId, 'admin:dashboard')")
 * whether the current user was an administrator. That check never left
 * the browser: it read state that any JavaScript running on the page —
 * including a user's own devtools console — can set arbitrarily. It is
 * not a security boundary, only a UI convenience.
 *
 * This module replaces that decision with one driven entirely by the
 * response of a real server call: GET /webauthn/session, served by
 * server/webauthn-rp/server.js. That endpoint reads isPlatformAdmin
 * from the sessions/users row in server/webauthn-rp/db.js — no HTTP
 * route in that server ever lets a client write to is_platform_admin
 * directly (see server.js: the only routes that touch it are internal
 * reads). This module's job is only to turn that server verdict into a
 * UI action; it is deliberately NOT itself the security boundary — the
 * server is. If this function is ever called with anything other than
 * the literal parsed response of a same-origin fetch("/webauthn/session",
 * {credentials:"include"}), it is being used incorrectly.
 *
 * MILESTONE — SERVER SESSION + 3-WAY GATE FOUNDATION
 * ----------------------------------------------------
 * decideGateAction() now also considers sessionCheck.organizations, the
 * additive array GET /webauthn/session returns of the caller's own
 * ACTIVE organization memberships (see server.js's own comment on that
 * route). Each entry's isOrgAdmin flag is itself computed server-side
 * from the real OrganizationRegistry.isAuthorized() capability check —
 * this file never re-derives admin-ness from a role string itself, it
 * only reads the boolean verdict the server already computed. This
 * keeps the three privilege tiers distinct and non-elevating:
 *   PLATFORM     — isPlatformAdmin === true (unchanged path/behavior)
 *   ORGANIZATION — not a platform admin, but at least one ACTIVE
 *                  membership has isOrgAdmin === true
 *   WORKER       — not a platform admin, no ORGANIZATION-tier
 *                  membership, but at least one ACTIVE membership exists
 *   DENIED       — none of the above (including: organizations missing/
 *                  empty, exactly today's pre-existing behavior)
 * An organization membership NEVER upgrades to PLATFORM, and a WORKER
 * membership NEVER upgrades to ORGANIZATION — each tier is checked
 * independently against server-supplied data, never inferred from the
 * other. This function still takes no scope/organizationId argument:
 * picking *which* organization is active for a multi-org user is
 * explicitly out of scope for this foundation milestone (see the next
 * milestone's organization-switching endpoint) — this function only
 * answers "what is the highest workspace tier this session may load".
 */
(function () {
    'use strict';
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};

    const VERSION = '1.2.0';

    const GATE_ACTION = Object.freeze({
        LOAD_ADMIN_WORKSPACE: 'LOAD_ADMIN_WORKSPACE',
        LOAD_ORGANIZATION_WORKSPACE: 'LOAD_ORGANIZATION_WORKSPACE',
        LOAD_WORKER_WORKSPACE: 'LOAD_WORKER_WORKSPACE',
        REDIRECT_TO_LOGIN: 'REDIRECT_TO_LOGIN',
        ACCESS_DENIED: 'ACCESS_DENIED',
        GATE_ERROR: 'GATE_ERROR',
    });

    // The workspace tier a decision resolves to. Kept separate from
    // GATE_ACTION (rather than parsed back out of the action string) so
    // callers have one explicit, unambiguous field to branch UI on.
    const GATE_SCOPE = Object.freeze({
        PLATFORM: 'PLATFORM',
        ORGANIZATION: 'ORGANIZATION',
        WORKER: 'WORKER',
        NONE: 'NONE',
    });

    // D1 FIX (CHALZYDASHBOARD-ROUTING-DEFECT): the workspace target a
    // caller must load for a given decideGateAction() result. Kept as an
    // explicit, exhaustively-switched mapping — never an "else falls
    // through" — because that exact fallthrough was the real defect:
    // Chalzydashboard.html previously treated any non-denied,
    // non-login, non-error action as permission to load the PLATFORM
    // admin workspace, so ORGANIZATION and WORKER sessions were sent
    // into admin-workspace.html (which then rejected/redirected them).
    // resolveWorkspaceRoute() is the single place that turns a gate
    // decision into "which workspace", so that mistake cannot recur
    // silently — any decision.action this switch does not recognize
    // fails closed to WORKSPACE_ROUTE.ERROR, never to PLATFORM.
    const WORKSPACE_ROUTE = Object.freeze({
        PLATFORM: 'PLATFORM',
        ORGANIZATION: 'ORGANIZATION',
        WORKER: 'WORKER',
        LOGIN: 'LOGIN',
        DENIED: 'DENIED',
        ERROR: 'ERROR',
    });

    /**
     * resolveWorkspaceRoute(decision) -> { route, reason }
     *
     * @param {object} decision - the object returned by decideGateAction()
     *   above. Never called with anything else — this function does not
     *   itself re-derive privilege, it only maps an already-computed
     *   decision to a workspace target, and cross-checks action/scope
     *   agree before trusting either.
     */
    function resolveWorkspaceRoute(decision) {
        if (!decision || typeof decision !== 'object') {
            return { route: WORKSPACE_ROUTE.ERROR, reason: 'malformed_decision' };
        }

        switch (decision.action) {
            case GATE_ACTION.REDIRECT_TO_LOGIN:
                return { route: WORKSPACE_ROUTE.LOGIN, reason: decision.reason };
            case GATE_ACTION.ACCESS_DENIED:
                return { route: WORKSPACE_ROUTE.DENIED, reason: decision.reason };
            case GATE_ACTION.GATE_ERROR:
                return { route: WORKSPACE_ROUTE.ERROR, reason: decision.reason };
            case GATE_ACTION.LOAD_ADMIN_WORKSPACE:
                if (decision.scope !== GATE_SCOPE.PLATFORM) {
                    return { route: WORKSPACE_ROUTE.ERROR, reason: 'action_scope_mismatch' };
                }
                return { route: WORKSPACE_ROUTE.PLATFORM, reason: decision.reason };
            case GATE_ACTION.LOAD_ORGANIZATION_WORKSPACE:
                if (decision.scope !== GATE_SCOPE.ORGANIZATION) {
                    return { route: WORKSPACE_ROUTE.ERROR, reason: 'action_scope_mismatch' };
                }
                return { route: WORKSPACE_ROUTE.ORGANIZATION, reason: decision.reason };
            case GATE_ACTION.LOAD_WORKER_WORKSPACE:
                if (decision.scope !== GATE_SCOPE.WORKER) {
                    return { route: WORKSPACE_ROUTE.ERROR, reason: 'action_scope_mismatch' };
                }
                return { route: WORKSPACE_ROUTE.WORKER, reason: decision.reason };
            default:
                return { route: WORKSPACE_ROUTE.ERROR, reason: 'unrecognized_gate_action' };
        }
    }

    /**
     * decideGateAction(sessionCheck) -> { action, scope, reason }
     *
     * @param {object} sessionCheck - { httpStatus, authenticated, isPlatformAdmin, email, organizations }
     *   the parsed JSON body of GET /webauthn/session, plus its HTTP status code.
     *   organizations, if present, is an array of ACTIVE memberships the
     *   server already resolved: { organizationId, name, membershipId,
     *   status, isOrgAdmin }. Anything else on this object (a raw role
     *   string, a client-supplied organizationId to "select", etc.) is
     *   deliberately never read here — see file header.
     */
    function decideGateAction(sessionCheck) {
        if (!sessionCheck || typeof sessionCheck !== 'object') {
            return { action: GATE_ACTION.GATE_ERROR, scope: GATE_SCOPE.NONE, reason: 'malformed_session_response' };
        }

        const httpStatus = sessionCheck.httpStatus;
        const authenticated = sessionCheck.authenticated;
        const isPlatformAdmin = sessionCheck.isPlatformAdmin;

        // Any non-200 fails closed. 401 (the real "not authenticated" shape
        // the server returns) sends the visitor to login; anything else
        // (5xx, a malformed/absent status from a failed fetch) is treated
        // as an error state, never as an implicit grant.
        if (httpStatus !== 200 || authenticated !== true) {
            if (httpStatus === 401) {
                return { action: GATE_ACTION.REDIRECT_TO_LOGIN, scope: GATE_SCOPE.NONE, reason: 'not_authenticated' };
            }
            return { action: GATE_ACTION.GATE_ERROR, scope: GATE_SCOPE.NONE, reason: 'unexpected_status_' + String(httpStatus) };
        }

        // Authenticated. Strict === true — no loose-equality bypass (e.g.
        // isPlatformAdmin: 1 or "true" must NOT grant access).
        if (isPlatformAdmin === true) {
            return { action: GATE_ACTION.LOAD_ADMIN_WORKSPACE, scope: GATE_SCOPE.PLATFORM, reason: 'verified_admin_session' };
        }

        // Not a platform admin. Fall through to organization/worker tiers,
        // driven only by the server-resolved organizations array — never
        // by any other field on this object. A missing/malformed/empty
        // array is exactly today's pre-existing "not_admin" outcome.
        const organizations = Array.isArray(sessionCheck.organizations) ? sessionCheck.organizations : [];
        const activeMemberships = organizations.filter((m) => m && m.status === 'active');

        if (activeMemberships.length === 0) {
            return { action: GATE_ACTION.ACCESS_DENIED, scope: GATE_SCOPE.NONE, reason: 'not_admin' };
        }

        // Strict === true here too, for the exact same reason as the
        // isPlatformAdmin check above — a truthy-but-not-boolean isOrgAdmin
        // must never grant organization-tier access.
        const hasOrgAdminMembership = activeMemberships.some((m) => m.isOrgAdmin === true);
        if (hasOrgAdminMembership) {
            return { action: GATE_ACTION.LOAD_ORGANIZATION_WORKSPACE, scope: GATE_SCOPE.ORGANIZATION, reason: 'verified_organization_admin_session' };
        }

        return { action: GATE_ACTION.LOAD_WORKER_WORKSPACE, scope: GATE_SCOPE.WORKER, reason: 'verified_worker_session' };
    }

    window.CozyOS.AdminGateCore = Object.freeze({
        decideGateAction,
        resolveWorkspaceRoute,
        GATE_ACTION,
        GATE_SCOPE,
        WORKSPACE_ROUTE,
        version: VERSION,
    });
    window.CozyOS.Modules['admin-gate-core'] = Object.freeze({
        version: VERSION,
        description: 'Server-authoritative decision logic for the /chalzydashboard entry gate. Pure logic, no DOM, no network. Consumes GET /webauthn/session responses only. Resolves the PLATFORM/ORGANIZATION/WORKER/DENIED workspace tier, and (resolveWorkspaceRoute) maps that decision to an exhaustively-switched workspace route so a non-PLATFORM tier can never fall through into the platform workspace.'
    });
})();
