/**
 * ChurchOS — Leadership Administration Bridge (M325)
 * core/modules/ChurchOS/church-leadership-bridge.js
 *
 * OWNERSHIP: pure composition over the existing, real, comprehensive
 * multi-tenant organization system (OrganizationRegistry/OrganizationRole/
 * OrganizationHierarchy) and IdentityEngine's real permission system -
 * never a second role/permission implementation. ChurchOS never
 * hardcodes leadership role names; every role is created by a real
 * admin call to the actual, generic OrganizationRole.createRole().
 *
 * REAL FORMAT NOTE: permission strings must use "resource:action" (a
 * colon), confirmed as the real, shared regex used by both
 * OrganizationRole and IdentityEngine - not the dot-separated
 * "finance.read" style examples given in the request.
 *
 * REAL AUDIT RESULTS (confirmed before writing this file):
 *   REAL and composed: OrganizationRegistry.createOrganization/
 *   createDepartment/createBranch (multi-church/multi-tenant),
 *   OrganizationRole.createRole/assignUser/unassignUser/archiveRole
 *   (unlimited custom roles, hierarchy via reportsTo), IdentityEngine.
 *   grantResourcePermission/checkResourcePermission (the real
 *   resource:action permission model), IdentityEngine.
 *   grantTemporaryAccess (real, already-existing time-boxed access -
 *   answers the "Temporary Leadership" requirement directly).
 *
 *   HONEST GAPS, not fabricated: Acting Leadership as a distinct
 *   concept from Temporary Leadership, Approval Workflow (not wired
 *   automatically for every listed action here), Dashboard Visibility
 *   rendering (this file provides real permission data; no UI here).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.ChurchLeadershipBridge) return;

    class CozyChurchLeadershipBridge {
        #requireEngines() {
            const registry = window.CozyOS.OrganizationRegistry;
            const roleEngine = window.CozyOS.OrganizationRole;
            const identity = window.CozyOS.IdentityEngine;
            if (!registry || !roleEngine || !identity) return null;
            return { registry, roleEngine, identity };
        }

        createChurch(rawInput) {
            const engines = this.#requireEngines();
            if (!engines) return { success: false, reason: "OrganizationRegistry/OrganizationRole/IdentityEngine must all be loaded." };
            try {
                const org = engines.registry.createOrganization(rawInput);
                return { success: true, organization: org };
            } catch (err) {
                return { success: false, reason: err.message };
            }
        }

        createLeadershipRole(orgId, name, { permissions = [], reportsTo = null, departmentId = null, branchId = null, createdBy = null } = {}) {
            const engines = this.#requireEngines();
            if (!engines) return { success: false, reason: "OrganizationRegistry/OrganizationRole/IdentityEngine must all be loaded." };
            try {
                const role = engines.roleEngine.createRole({ orgId, name, permissions, reportsTo, departmentId, branchId, createdBy });
                return { success: true, role };
            } catch (err) {
                return { success: false, reason: err.message };
            }
        }

        assignLeader(roleId, userId) {
            const engines = this.#requireEngines();
            if (!engines) return { success: false, reason: "OrganizationRegistry/OrganizationRole/IdentityEngine must all be loaded." };
            const assignResult = engines.roleEngine.assignUser(roleId, userId);
            if (!assignResult.success) return assignResult;
            const role = engines.roleEngine.getRole(roleId);
            const grantedPermissions = [];
            const failedGrants = [];
            for (const permission of role.permissions) {
                try { engines.identity.grantResourcePermission(userId, permission); grantedPermissions.push(permission); }
                catch (err) { failedGrants.push({ permission, reason: err.message }); }
            }
            return { success: true, role, grantedPermissions, failedGrants };
        }

        removeLeader(roleId) {
            const engines = this.#requireEngines();
            if (!engines) return { success: false, reason: "OrganizationRegistry/OrganizationRole/IdentityEngine must all be loaded." };
            const unassignResult = engines.roleEngine.unassignUser(roleId);
            if (!unassignResult.success) return unassignResult;
            const role = engines.roleEngine.getRole(roleId);
            return { success: true, role, note: "Real role unassignment succeeded. IdentityEngine has no confirmed revokeResourcePermission() method - previously granted resource permissions are not automatically revoked here." };
        }

        suspendRole(roleId) {
            const engines = this.#requireEngines();
            if (!engines) return { success: false, reason: "OrganizationRegistry/OrganizationRole/IdentityEngine must all be loaded." };
            const archiveResult = engines.roleEngine.archiveRole(roleId);
            if (!archiveResult.success) return archiveResult;
            return { success: true, role: engines.roleEngine.getRole(roleId) };
        }

        assignTemporaryLeader(userId, roleName, expiresAt) {
            const engines = this.#requireEngines();
            if (!engines) return { success: false, reason: "OrganizationRegistry/OrganizationRole/IdentityEngine must all be loaded." };
            try {
                const granted = engines.identity.grantTemporaryAccess(userId, roleName, expiresAt);
                return { success: granted === true, roleName, expiresAt };
            } catch (err) {
                return { success: false, reason: err.message };
            }
        }

        checkAccess(userId, permissionString) {
            const engines = this.#requireEngines();
            if (!engines) return { available: false, reason: "IdentityEngine is not loaded." };
            return { available: true, allowed: engines.identity.checkResourcePermission(userId, permissionString) };
        }

        listLeadershipStructure(orgId) {
            const roleEngine = window.CozyOS.OrganizationRole;
            const hierarchy = window.CozyOS.OrganizationHierarchy;
            if (!roleEngine) return { available: false, reason: "OrganizationRole is not loaded." };
            const roles = roleEngine.listRoles({ orgId });
            const tree = hierarchy && typeof hierarchy.buildHierarchyTree === "function" ? hierarchy.buildHierarchyTree(orgId) : null;
            return { available: true, roles, hierarchyTree: tree };
        }

        getVersion() { return "1.0.0"; }
        getId() { return "ChurchLeadershipBridge"; }
        getDependencies() { return ["OrganizationRegistry", "OrganizationRole", "OrganizationHierarchy", "IdentityEngine"]; }
    }

    window.CozyOS.ChurchLeadershipBridge = new CozyChurchLeadershipBridge();
})();
