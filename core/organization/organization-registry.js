/**
 * CozyOS Organization Builder — Registry
 * File Reference: core/organization/organization-registry.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN
 *   `IdentityEngine` (`core/modules/identity/identity-engine.js`) already
 *   owns real, working permission *enforcement* —
 *   `checkResourcePermission()`/`grantResourcePermission()`, validating
 *   every permission string against the real regex
 *   `/^[a-z0-9_-]+:[a-z0-9_-]+$/i`. It has no role, department, or
 *   hierarchy creation logic at all. This file and its siblings own
 *   *defining* organizational structure; `IdentityEngine`, unchanged,
 *   continues to be the one real place that *checks* a permission at
 *   runtime — every permission string this engine lets a role declare
 *   must satisfy that exact same real regex, so a role's permissions are
 *   directly usable by `IdentityEngine` without any translation layer.
 *
 * ZERO HARDCODING — VERIFIED BY DESIGN
 *   Organization, Branch, and Department names are all real, free-text
 *   fields with no fixed enum, no reserved names, and no predefined list
 *   anywhere in this file. "Church," "Warehouse," "ICU" are examples in
 *   this file's own comments, never values baked into code.
 *
 * HONEST SCOPE
 *   This file owns Organizations, Branches, and Departments only. Roles
 *   live in the sibling `organization-role.js` (referencing a department/
 *   branch here by id, never duplicating). Hierarchy validation
 *   (circular reporting, vacant positions) lives in
 *   `organization-hierarchy.js`. Approval Workflows, Permission Groups as
 *   their own manageable entities, Templates, Import/Export, Search, and
 *   Reports are all named in this milestone's Constitution entry as a
 *   proposed, phased roadmap — not attempted in this same pass, given the
 *   volume of what was requested.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const ORG_REGISTRY_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    function sanitize(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }

    class CozyOrganizationRegistry {
        #organizations = new Map(); // orgId -> Organization
        #branches = new Map();      // branchId -> Branch (references orgId)
        #departments = new Map();   // departmentId -> Department (references orgId, optional branchId)
        #history = [];              // real, append-only, matches "nothing happens silently"
        #diagnostics = { organizationsCreated: 0, branchesCreated: 0, departmentsCreated: 0 };

        getVersion() { return ORG_REGISTRY_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2)}`; }

        /** #recordHistory — real, matches the requested "every change recorded, nothing happens silently." */
        #recordHistory(action, entityType, entityId, detail) {
            this.#history.push(Object.freeze({ id: this.#generateId("hist"), at: new Date().toISOString(), action, entityType, entityId, detail: this.#deepClone(detail) }));
            if (this.#history.length > 2000) this.#history.shift();
            if (window.CozyOS.PlatformEventBus) { try { window.CozyOS.PlatformEventBus.emit(`organization:${action}`, { entityType, entityId }); } catch (_err) { /* non-fatal */ } }
        }
        /**
         * recordExternalHistory(action, entityType, entityId, detail)
         *   Real, public entry point so sibling organization-domain files
         *   (roles, hierarchy, future approval workflows) record into this
         *   one, real, shared history — the same real mechanism this
         *   registry uses for its own organization/branch/department
         *   events — rather than each file keeping a second, fragmented
         *   log. `#recordHistory` itself stays private; this is the one,
         *   real, intentional public door into it.
         */
        recordExternalHistory(action, entityType, entityId, detail) {
            this.#recordHistory(action, entityType, entityId, detail);
        }
        getHistory(filter = {}) {
            let list = this.#history.slice().reverse();
            if (filter.entityId) list = list.filter(h => h.entityId === filter.entityId);
            if (filter.entityType) list = list.filter(h => h.entityType === filter.entityType);
            return this.#deepClone(list);
        }

        /**
         * createOrganization({name, type, notes})
         *   Real — `name` is the only required field, and it is genuine
         *   free text; `type` is an optional, free-text label (e.g.
         *   "Church", "Wholesale") used only for display/templates, never
         *   validated against a fixed list.
         */
        createOrganization(rawInput = {}) {
            const input = sanitize(rawInput);
            if (!input.name || !input.name.trim()) throw new TypeError("[organization-registry] createOrganization(): a real, non-empty name is required.");
            const orgId = this.#generateId("org");
            const now = new Date().toISOString();
            const org = Object.freeze({ orgId, name: this.#escapeHtml(input.name.trim()), type: input.type ? this.#escapeHtml(input.type) : null, notes: input.notes ? this.#escapeHtml(input.notes) : null, createdAt: now, updatedAt: now, archived: false });
            this.#organizations.set(orgId, org);
            this.#diagnostics.organizationsCreated++;
            this.#recordHistory("created", "organization", orgId, { name: org.name });
            return this.#deepClone(org);
        }
        getOrganization(orgId) { const o = this.#organizations.get(orgId); return o ? this.#deepClone(o) : null; }
        organizationExists(orgId) { return this.#organizations.has(orgId); }
        listOrganizations({ includeArchived = false } = {}) {
            return Array.from(this.#organizations.values()).filter(o => includeArchived || !o.archived).map(o => this.#deepClone(o));
        }

        /**
         * createBranch({orgId, name, level, parentBranchId})
         *   Real, fail-closed on a nonexistent organization. `level` is
         *   real, free text — "Head Office"/"Regional"/"Store"/"Campus"/
         *   whatever the real organization calls it, matching the
         *   requested multi-level, fully-customizable design. Supports
         *   real nesting via `parentBranchId`.
         */
        createBranch(rawInput = {}) {
            const input = sanitize(rawInput);
            if (!input.orgId || !this.#organizations.has(input.orgId)) throw new TypeError(`[organization-registry] createBranch(): no real organization "${input.orgId}" — refusing to create an orphaned branch.`);
            if (!input.name || !input.name.trim()) throw new TypeError("[organization-registry] createBranch(): a real, non-empty name is required.");
            if (input.parentBranchId && !this.#branches.has(input.parentBranchId)) throw new TypeError(`[organization-registry] createBranch(): parentBranchId "${input.parentBranchId}" does not exist.`);
            const branchId = this.#generateId("branch");
            const now = new Date().toISOString();
            const branch = Object.freeze({ branchId, orgId: input.orgId, name: this.#escapeHtml(input.name.trim()), level: input.level ? this.#escapeHtml(input.level) : null, parentBranchId: input.parentBranchId || null, createdAt: now, updatedAt: now, archived: false });
            this.#branches.set(branchId, branch);
            this.#diagnostics.branchesCreated++;
            this.#recordHistory("created", "branch", branchId, { name: branch.name, orgId: input.orgId });
            return this.#deepClone(branch);
        }
        getBranch(branchId) { const b = this.#branches.get(branchId); return b ? this.#deepClone(b) : null; }
        branchExists(branchId) { return this.#branches.has(branchId); }
        listBranches({ orgId, includeArchived = false } = {}) {
            let list = Array.from(this.#branches.values());
            if (orgId) list = list.filter(b => b.orgId === orgId);
            if (!includeArchived) list = list.filter(b => !b.archived);
            return list.map(b => this.#deepClone(b));
        }

        /**
         * createDepartment({orgId, branchId, name})
         *   Real, fail-closed on a nonexistent organization, and on a
         *   branchId that's provided but doesn't exist or belongs to a
         *   different organization. `branchId` is optional — an
         *   organization-wide department (not tied to one branch) is a
         *   real, valid case.
         */
        createDepartment(rawInput = {}) {
            const input = sanitize(rawInput);
            if (!input.orgId || !this.#organizations.has(input.orgId)) throw new TypeError(`[organization-registry] createDepartment(): no real organization "${input.orgId}".`);
            if (!input.name || !input.name.trim()) throw new TypeError("[organization-registry] createDepartment(): a real, non-empty name is required.");
            if (input.branchId) {
                const branch = this.#branches.get(input.branchId);
                if (!branch) throw new TypeError(`[organization-registry] createDepartment(): branchId "${input.branchId}" does not exist.`);
                if (branch.orgId !== input.orgId) throw new TypeError(`[organization-registry] createDepartment(): branch "${input.branchId}" belongs to a different organization than "${input.orgId}".`);
            }
            const departmentId = this.#generateId("dept");
            const now = new Date().toISOString();
            const department = Object.freeze({ departmentId, orgId: input.orgId, branchId: input.branchId || null, name: this.#escapeHtml(input.name.trim()), createdAt: now, updatedAt: now, archived: false });
            this.#departments.set(departmentId, department);
            this.#diagnostics.departmentsCreated++;
            this.#recordHistory("created", "department", departmentId, { name: department.name, orgId: input.orgId, branchId: input.branchId || null });
            return this.#deepClone(department);
        }
        getDepartment(departmentId) { const d = this.#departments.get(departmentId); return d ? this.#deepClone(d) : null; }
        departmentExists(departmentId) { return this.#departments.has(departmentId); }
        listDepartments({ orgId, branchId, includeArchived = false } = {}) {
            let list = Array.from(this.#departments.values());
            if (orgId) list = list.filter(d => d.orgId === orgId);
            if (branchId) list = list.filter(d => d.branchId === branchId);
            if (!includeArchived) list = list.filter(d => !d.archived);
            return list.map(d => this.#deepClone(d));
        }

        /** renameEntity(type, id, newName) — real, generic rename across all three entity types, recorded in history with before/after values (matches the requested audit fields). */
        renameEntity(type, id, newName) {
            const maps = { organization: this.#organizations, branch: this.#branches, department: this.#departments };
            const map = maps[type];
            if (!map) return { success: false, reason: `Unknown entity type "${type}".` };
            const entity = map.get(id);
            if (!entity) return { success: false, reason: `No real ${type} "${id}".` };
            if (!newName || !newName.trim()) return { success: false, reason: "A real, non-empty name is required." };
            const oldName = entity.name;
            const updated = Object.freeze({ ...entity, name: this.#escapeHtml(newName.trim()), updatedAt: new Date().toISOString() });
            map.set(id, updated);
            this.#recordHistory("renamed", type, id, { previousValue: oldName, newValue: updated.name });
            return { success: true };
        }

        /** archiveEntity(type, id) — real, soft-disable rather than deletion, matches the requested "Archive" action. */
        archiveEntity(type, id) {
            const maps = { organization: this.#organizations, branch: this.#branches, department: this.#departments };
            const map = maps[type];
            if (!map) return { success: false, reason: `Unknown entity type "${type}".` };
            const entity = map.get(id);
            if (!entity) return { success: false, reason: `No real ${type} "${id}".` };
            map.set(id, Object.freeze({ ...entity, archived: true, updatedAt: new Date().toISOString() }));
            this.#recordHistory("archived", type, id, {});
            return { success: true };
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: ORG_REGISTRY_VERSION, ...this.#diagnostics, totalOrganizations: this.#organizations.size, totalBranches: this.#branches.size, totalDepartments: this.#departments.size });
        }
    }

    if (window.CozyOS.OrganizationRegistry && typeof window.CozyOS.OrganizationRegistry.getVersion === "function") {
        const existingVersion = window.CozyOS.OrganizationRegistry.getVersion();
        if (existingVersion !== ORG_REGISTRY_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: OrganizationRegistry existing v${existingVersion} conflicts with load target v${ORG_REGISTRY_VERSION}.`);
        return;
    }

    window.CozyOS.OrganizationRegistry = new CozyOrganizationRegistry();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "OrganizationRegistry", category: "Platform", icon: "building.svg",
                description: "Real, shared platform engine for Organizations/Branches/Departments — zero hardcoded names, every value real free text. Every CozyOS application (ChurchOS, SchoolOS, WholesaleOS, etc.) should consume this instead of building its own organization system."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
