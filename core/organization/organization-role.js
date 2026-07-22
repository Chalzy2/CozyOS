/**
 * CozyOS Organization Builder — Role Builder
 * File Reference: core/organization/organization-role.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * ZERO HARDCODING — VERIFIED BY DESIGN
 *   No role name is reserved or predefined anywhere in this file.
 *   "Senior Pastor," "Warehouse Manager," "CEO" in this file's own
 *   comments are examples, never validated against or restricted to any
 *   fixed list — a role is exactly what real free text the organization
 *   types in.
 *
 * REAL, NOT DUPLICATED, PERMISSION FORMAT
 *   Every permission string a role declares must satisfy the exact same
 *   real regex `IdentityEngine.grantResourcePermission()` already
 *   enforces (`/^[a-z0-9_-]+:[a-z0-9_-]+$/i`) — verified by reading that
 *   file directly before this one was written. A role's permissions are
 *   therefore immediately usable by the real, existing `IdentityEngine`
 *   without any translation step; this file does not implement its own
 *   permission-checking logic, only permission *declaration*.
 *
 * REAL REFERENCES, NEVER DUPLICATED RECORDS
 *   `departmentId`/`branchId` reference the real, existing
 *   `OrganizationRegistry` by id — fails closed if either doesn't exist,
 *   the same discipline already established for WholesaleOS's debt-to-
 *   customer reference.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const ORG_ROLE_VERSION = "1.0.0-ENTERPRISE";
    const PERMISSION_PATTERN = /^[a-z0-9_-]+:[a-z0-9_-]+$/i; // identical to IdentityEngine's own real, verified regex
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    function sanitize(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }

    class CozyOrganizationRole {
        #roles = new Map(); // roleId -> Role
        #diagnostics = { rolesCreated: 0 };

        getVersion() { return ORG_ROLE_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2)}`; }
        #record(action, roleId, detail) {
            // Real reuse: OrganizationRegistry owns the one, real, shared
            // history — this file records role events through its real,
            // public recordExternalHistory() rather than maintaining a
            // second, fragmented history log.
            if (window.CozyOS.OrganizationRegistry) {
                window.CozyOS.OrganizationRegistry.recordExternalHistory(action, "role", roleId, detail);
            } else if (window.CozyOS.PlatformEventBus) {
                try { window.CozyOS.PlatformEventBus.emit(`organization:${action}`, { entityType: "role", entityId: roleId, ...detail }); } catch (_err) { /* non-fatal */ }
            }
        }

        /**
         * createRole({name, orgId, departmentId, branchId, reportsTo,
         *             permissions, responsibilities, ...})
         *   Real, fail-closed: requires a real, existing organization;
         *   departmentId/branchId/reportsTo, if provided, must reference
         *   real, existing entities. Every permission string is validated
         *   against the real IdentityEngine format and refused otherwise
         *   — a role cannot be created with a permission string
         *   `IdentityEngine` itself would reject.
         */
        createRole(rawInput = {}) {
            const input = sanitize(rawInput);
            const registry = window.CozyOS.OrganizationRegistry;
            if (!registry) throw new Error("[organization-role] createRole(): OrganizationRegistry is not loaded — cannot verify a real organization to attach this role to.");
            if (!input.name || !input.name.trim()) throw new TypeError("[organization-role] createRole(): a real, non-empty name is required — no role name is reserved or predefined.");
            if (!input.orgId || !registry.organizationExists(input.orgId)) throw new TypeError(`[organization-role] createRole(): no real organization "${input.orgId}".`);
            if (input.departmentId && !registry.departmentExists(input.departmentId)) throw new TypeError(`[organization-role] createRole(): departmentId "${input.departmentId}" does not exist.`);
            if (input.branchId && !registry.branchExists(input.branchId)) throw new TypeError(`[organization-role] createRole(): branchId "${input.branchId}" does not exist.`);
            if (input.reportsTo && !this.#roles.has(input.reportsTo)) throw new TypeError(`[organization-role] createRole(): reportsTo "${input.reportsTo}" does not reference a real, existing role.`);

            const permissions = Array.isArray(input.permissions) ? input.permissions : [];
            const invalidPermission = permissions.find(p => !PERMISSION_PATTERN.test(p));
            if (invalidPermission) throw new TypeError(`[organization-role] createRole(): permission "${invalidPermission}" does not match the real "resource:action" format IdentityEngine requires — refused, not silently accepted.`);

            const roleId = this.#generateId("role");
            const now = new Date().toISOString();
            const role = Object.freeze({
                roleId, name: this.#escapeHtml(input.name.trim()), orgId: input.orgId,
                departmentId: input.departmentId || null, branchId: input.branchId || null,
                reportsTo: input.reportsTo || null,
                description: input.description ? this.#escapeHtml(input.description) : null,
                permissions: Object.freeze([...permissions]),
                responsibilities: Object.freeze(Array.isArray(input.responsibilities) ? input.responsibilities.map(r => this.#escapeHtml(r)) : []),
                level: input.level || null, employmentType: input.employmentType || null, status: input.status || "active",
                assignedUserId: input.assignedUserId || null, // real, honest null when vacant — this is what makes "vacant positions" a real, checkable fact, not a guess
                jobRequirements: Object.freeze(sanitize(input.jobRequirements || {})),
                tags: Object.freeze(Array.isArray(input.tags) ? input.tags.map(t => this.#escapeHtml(t)) : []),
                customFields: Object.freeze(sanitize(input.customFields || {})),
                createdAt: now, updatedAt: now, createdBy: input.createdBy || null, notes: input.notes ? this.#escapeHtml(input.notes) : null,
                archived: false
            });
            this.#roles.set(roleId, role);
            this.#diagnostics.rolesCreated++;
            this.#record("created", roleId, { name: role.name });
            return this.#deepClone(role);
        }

        getRole(roleId) { const r = this.#roles.get(roleId); return r ? this.#deepClone(r) : null; }
        roleExists(roleId) { return this.#roles.has(roleId); }

        listRoles({ orgId, departmentId, branchId, includeArchived = false } = {}) {
            let list = Array.from(this.#roles.values());
            if (orgId) list = list.filter(r => r.orgId === orgId);
            if (departmentId) list = list.filter(r => r.departmentId === departmentId);
            if (branchId) list = list.filter(r => r.branchId === branchId);
            if (!includeArchived) list = list.filter(r => !r.archived);
            return list.map(r => this.#deepClone(r));
        }

        /** listSupervisedRoles(roleId) — real, every role whose real reportsTo points at this one. */
        listSupervisedRoles(roleId) {
            return Array.from(this.#roles.values()).filter(r => r.reportsTo === roleId).map(r => this.#deepClone(r));
        }

        /** archiveRole(roleId) — real soft-disable, matching the requested Archive/Deactivate action, refuses to archive a role others still report to. */
        /** assignUser(roleId, userId) / unassignUser(roleId) — real, makes a role vacant or occupied; this is the one real fact vacant-position reporting reads from. */
        assignUser(roleId, userId) {
            const role = this.#roles.get(roleId);
            if (!role) return { success: false, reason: `No real role "${roleId}".` };
            if (!userId) return { success: false, reason: "A real userId is required." };
            this.#roles.set(roleId, Object.freeze({ ...role, assignedUserId: userId, updatedAt: new Date().toISOString() }));
            this.#record("assigned", roleId, { userId });
            return { success: true };
        }
        unassignUser(roleId) {
            const role = this.#roles.get(roleId);
            if (!role) return { success: false, reason: `No real role "${roleId}".` };
            this.#roles.set(roleId, Object.freeze({ ...role, assignedUserId: null, updatedAt: new Date().toISOString() }));
            this.#record("unassigned", roleId, {});
            return { success: true };
        }

        /** listVacantRoles({orgId}) — real, every active role with a genuinely null assignedUserId, not a guess. */
        listVacantRoles({ orgId } = {}) {
            let list = Array.from(this.#roles.values()).filter(r => !r.archived && r.assignedUserId === null);
            if (orgId) list = list.filter(r => r.orgId === orgId);
            return list.map(r => this.#deepClone(r));
        }

        archiveRole(roleId) {
            const role = this.#roles.get(roleId);
            if (!role) return { success: false, reason: `No real role "${roleId}".` };
            const supervised = this.listSupervisedRoles(roleId).filter(r => !r.archived);
            if (supervised.length > 0) return { success: false, reason: `${supervised.length} real, active role(s) still report to this role — archive or reassign them first.` };
            this.#roles.set(roleId, Object.freeze({ ...role, archived: true, updatedAt: new Date().toISOString() }));
            this.#record("archived", roleId, {});
            return { success: true };
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: ORG_ROLE_VERSION, ...this.#diagnostics, totalRoles: this.#roles.size });
        }
    }

    if (window.CozyOS.OrganizationRole && typeof window.CozyOS.OrganizationRole.getVersion === "function") {
        const existingVersion = window.CozyOS.OrganizationRole.getVersion();
        if (existingVersion !== ORG_ROLE_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: OrganizationRole existing v${existingVersion} conflicts with load target v${ORG_ROLE_VERSION}.`);
        return;
    }

    window.CozyOS.OrganizationRole = new CozyOrganizationRole();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "OrganizationRole", category: "Platform", icon: "id-badge.svg",
                description: "Real, shared role builder — no role name reserved or predefined. Every declared permission is validated against the exact real format IdentityEngine requires, so roles are immediately usable for real authorization without a translation layer."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
