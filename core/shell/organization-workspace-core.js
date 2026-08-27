/**
 * CozyOS — Organization Workspace Core
 * File Reference: core/shell/organization-workspace-core.js
 *
 * CLASSIFICATION: pure logic, no DOM, no network, no database — follows
 * the repository's established "-core.js" convention (see
 * core/shell/admin-gate-core.js and core/shell/dashboard-navigation-core.js
 * for precedent): attaches to window.CozyOS so it loads as a plain
 * <script>, and is Node-testable by stubbing global.window before
 * require().
 *
 * OWNERSHIP / WHAT THIS FILE COMPOSES (never duplicates)
 * ---------------------------------------------------------
 * This file's only real input is the response shape of the real,
 * server-authoritative POST /organizations/context route
 * (server/webauthn-rp/server.js), itself composing the existing
 * OrganizationRegistry only (getMembership/getOrganization/
 * isAuthorized — server/webauthn-rp/organizations.js). Every field this
 * file reads off that context object — status, roles, applications,
 * permissions, isOrgAdmin, canManageWorkforce, canReadWorkforce,
 * canManageApplications, canManagePermissions — is already a real,
 * server-computed value; this file never re-derives any of them from a
 * role string or re-implements OrganizationRegistry.isAuthorized()'s
 * deny-over-allow logic. It is deliberately NOT itself a security
 * authority — every function below is a UI-presentation decision only.
 * The server remains authoritative; if this file's verdict and the
 * server's next real check ever disagree, the server wins, always. If
 * this module is ever called with anything other than the literal
 * parsed response of POST /organizations/context (or, for
 * canAttemptOrganizationSwitch(), one entry of GET /webauthn/session's
 * own `organizations` array), it is being used incorrectly.
 *
 * WHAT THIS FILE OWNS
 * ---------------------
 *   - resolveVisibleSections(): which organization workspace sections
 *     (WORKFORCE/APPLICATIONS/ENTITLEMENTS/BUSINESS/INTELLIGENCE/
 *     ADMINISTRATIVE_REQUESTS) a given context may render.
 *   - resolveWorkforceControls() / resolveApplicationControls(): finer-
 *     grained view/edit control gating within a visible section.
 *   - the app:<applicationId>:<functionId> function-entitlement naming
 *     convention (functionPermissionName/isFunctionEnabled), built on
 *     the existing OrganizationRegistry permissions array
 *     ({name, effect}) — no new entitlement storage or engine.
 *   - canAttemptOrganizationSwitch(): a client-side PRE-CHECK ONLY for
 *     disabling an obviously-stale switcher entry; never itself
 *     authority — every real switch still requires a fresh POST
 *     /organizations/context round trip (see D3, next milestone).
 *
 * DISCLOSED LIMITATION — BUSINESS / INTELLIGENCE / ADMINISTRATIVE
 * REQUESTS SECTION GATING
 *   The real server context does not yet expose a dedicated
 *   "org:business:*" / "org:intelligence:*" / "org:admin-requests:*"
 *   capability — OrganizationRegistry's ORG_ADMIN_PREFIX role-default
 *   convention today only backs org:workforce:*, org:applications:*,
 *   and org:permissions:*. Rather than invent an unbacked capability
 *   name for these three sections, this file gates them on the same
 *   real isOrgAdmin flag every other org-admin-only decision in this
 *   codebase already uses (see admin-gate-core.js's own
 *   hasOrgAdminMembership check). If a dedicated capability is added
 *   server-side later, this is the one place to update — this is
 *   recorded as a genuine, real limitation, not smoothed over.
 *
 * Do NOT create a second membership/entitlement authority here
 * (OrganizationPermissionEngine, WorkspaceAuthEngine,
 * DashboardAuthEngine, etc.) — this file is intentionally just a
 * presentation-rules composer over the one real server authority.
 */
(function () {
    'use strict';
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};

    const VERSION = '1.0.0';

    const SECTION = Object.freeze({
        WORKFORCE: 'WORKFORCE',
        APPLICATIONS: 'APPLICATIONS',
        ENTITLEMENTS: 'ENTITLEMENTS',
        BUSINESS: 'BUSINESS',
        INTELLIGENCE: 'INTELLIGENCE',
        ADMINISTRATIVE_REQUESTS: 'ADMINISTRATIVE_REQUESTS',
    });

    /**
     * A context is only ever treated as real/current if status is
     * exactly the string 'active' — strict equality, no loose/truthy
     * shortcut, mirroring admin-gate-core.js's own isPlatformAdmin/
     * isOrgAdmin === true convention.
     */
    function isActiveContext(context) {
        return !!context && typeof context === 'object' && context.status === 'active';
    }

    function resolveVisibleSections(context) {
        if (!isActiveContext(context)) return [];
        const sections = [];

        // WORKFORCE: visible to anyone who can at least read the roster.
        // Read access and edit access are two different questions - see
        // resolveWorkforceControls() for the finer-grained edit gating.
        if (context.canReadWorkforce === true || context.canManageWorkforce === true) {
            sections.push(SECTION.WORKFORCE);
        }

        // APPLICATIONS here means the org-scoped ASSIGNMENT management
        // section (assign/remove an application to/from a worker) - not
        // "the applications this member was assigned", which every
        // active member already has via context.applications regardless
        // of whether this management section is visible to them.
        if (context.canManageApplications === true) {
            sections.push(SECTION.APPLICATIONS);
        }

        if (context.canManagePermissions === true) {
            sections.push(SECTION.ENTITLEMENTS);
        }

        // See file header "DISCLOSED LIMITATION" - these three are
        // gated on isOrgAdmin, the real server-computed flag, not a new
        // capability this file invents.
        if (context.isOrgAdmin === true) {
            sections.push(SECTION.BUSINESS, SECTION.INTELLIGENCE, SECTION.ADMINISTRATIVE_REQUESTS);
        }

        return sections;
    }

    function resolveWorkforceControls(context) {
        if (!isActiveContext(context)) {
            return { canView: false, canInvite: false, canManageRoles: false, canManageMembership: false };
        }
        return {
            canView: context.canReadWorkforce === true || context.canManageWorkforce === true,
            canInvite: context.canManageWorkforce === true,
            canManageRoles: context.canManageWorkforce === true,
            canManageMembership: context.canManageWorkforce === true,
        };
    }

    function resolveApplicationControls(context) {
        if (!isActiveContext(context)) {
            return { assignedApplications: [], canAssign: false, canRemove: false };
        }
        return {
            // Every active member (worker or admin) sees their own real,
            // server-returned assignment list - never a platform-wide
            // application catalog, never invented.
            assignedApplications: Array.isArray(context.applications) ? context.applications.slice() : [],
            canAssign: context.canManageApplications === true,
            canRemove: context.canManageApplications === true,
        };
    }

    /**
     * The app:<applicationId>:<functionId> naming convention this file
     * establishes for function-level entitlement, expressed entirely in
     * terms of the existing allow/deny permission mechanism
     * (OrganizationRegistry's permissions: [{name, effect}]) already
     * returned by POST /organizations/context. No new storage, no new
     * engine - isFunctionEnabled() is the one place this convention is
     * interpreted.
     */
    function functionPermissionName(applicationId, functionId) {
        return `app:${applicationId}:${functionId}`;
    }

    function isFunctionEnabled(context, applicationId, functionId) {
        if (!isActiveContext(context)) return false;
        if (!Array.isArray(context.applications) || !context.applications.includes(applicationId)) return false;

        const permissions = Array.isArray(context.permissions) ? context.permissions : [];
        const name = functionPermissionName(applicationId, functionId);

        // Deny-over-allow, absent = denied - mirrors
        // OrganizationRegistry.isAuthorized()'s own semantics exactly,
        // including checking ALL matching entries for a deny (via
        // .some()) rather than only the first match a naive .find()
        // would see - a deny entry listed after an allow entry for the
        // same name must still win.
        const denied = permissions.some((p) => p && p.name === name && p.effect === 'deny');
        if (denied) return false;
        const allowed = permissions.some((p) => p && p.name === name && p.effect === 'allow');

        // Unlike org-admin capabilities (which default-grant to
        // owner/admin roles for org:-prefixed names), function-level
        // entitlement never role-defaults - it always requires an
        // explicit allow entry, since an org admin assigning a role
        // should not silently grant every function of every app that
        // role happens to touch.
        return allowed;
    }

    /**
     * Client-side PRE-CHECK ONLY, for disabling an obviously-stale
     * switcher entry (e.g. a membership GET /webauthn/session already
     * reported as no longer active) before the user even taps it. This
     * is explicitly NOT the authority for a switch - the real switch
     * flow (D3, next milestone) must still perform a fresh POST
     * /organizations/context call and treat THAT response, not this
     * pre-check, as the verdict.
     */
    function canAttemptOrganizationSwitch(candidateMembership) {
        return !!candidateMembership && candidateMembership.status === 'active';
    }

    function resolveWorkspacePresentation(context) {
        if (!isActiveContext(context)) {
            return {
                organizationId: null,
                organizationName: null,
                isOrgAdmin: false,
                sections: [],
                workforce: resolveWorkforceControls(null),
                applicationControls: resolveApplicationControls(null),
            };
        }
        return {
            organizationId: context.organizationId,
            organizationName: context.organizationName,
            isOrgAdmin: context.isOrgAdmin === true,
            sections: resolveVisibleSections(context),
            workforce: resolveWorkforceControls(context),
            applicationControls: resolveApplicationControls(context),
        };
    }

    window.CozyOS.OrganizationWorkspaceCore = Object.freeze({
        SECTION,
        resolveVisibleSections,
        resolveWorkforceControls,
        resolveApplicationControls,
        functionPermissionName,
        isFunctionEnabled,
        canAttemptOrganizationSwitch,
        resolveWorkspacePresentation,
        version: VERSION,
    });
    window.CozyOS.Modules['organization-workspace-core'] = Object.freeze({
        version: VERSION,
        description: 'Pure logic (no DOM, no fetch, no database) for the organization workspace: section visibility, workforce/application control gating, and the app:<id>:<functionId> function-entitlement convention. Composes only the real fields POST /organizations/context already returns. Never itself a security authority - the server remains authoritative for every field this file reads.',
    });
})();
