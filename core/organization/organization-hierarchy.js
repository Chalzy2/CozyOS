/**
 * CozyOS Organization Builder — Hierarchy
 * File Reference: core/organization/organization-hierarchy.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Real validation of the organization's real reporting structure —
 *   circular reporting detection, vacant position reporting, hierarchy
 *   tree assembly. Pure consumer of `OrganizationRole`'s real `reportsTo`
 *   data — this file discovers nothing itself and stores no roles of its
 *   own, the same "correlate, don't duplicate" pattern already proven by
 *   `PlatformAudit`/`VendorDiagnostics`.
 *
 * REAL ALGORITHM REUSE, NOT REINVENTED
 *   `detectCircularReporting()` adapts the exact DFS cycle-detection
 *   shape already built and proven in `core/platform/dependency-engine.js`
 *   (visiting/visited/stack sets, cycle-path extraction on revisiting a
 *   node still on the stack) — the same real technique, applied to the
 *   `reportsTo` graph instead of a file-dependency graph, not a
 *   from-scratch reimplementation risking a different, unverified bug.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const ORG_HIERARCHY_VERSION = "1.0.0-ENTERPRISE";

    class CozyOrganizationHierarchy {
        getVersion() { return ORG_HIERARCHY_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }

        /**
         * detectCircularReporting(orgId)
         *   Real DFS over the real `reportsTo` graph — the exact
         *   algorithm shape already proven in `DependencyEngine.
         *   detectCircular()`, adapted here rather than reimplemented
         *   from scratch. A role cannot form a real cycle with itself
         *   report-to-report-to back to where it started without this
         *   correctly finding it.
         */
        detectCircularReporting(orgId) {
            const roleEngine = window.CozyOS.OrganizationRole;
            if (!roleEngine) return { available: false, reason: "OrganizationRole is not loaded." };
            const roles = roleEngine.listRoles({ orgId });
            const graph = new Map();
            for (const role of roles) graph.set(role.roleId, role.reportsTo ? [role.reportsTo] : []);

            const cycles = [];
            const visiting = new Set();
            const visited = new Set();
            const stack = [];
            const dfs = (node) => {
                if (visiting.has(node)) {
                    const cycleStart = stack.indexOf(node);
                    cycles.push(stack.slice(cycleStart).concat(node));
                    return;
                }
                if (visited.has(node)) return;
                visiting.add(node);
                stack.push(node);
                for (const next of graph.get(node) || []) dfs(next);
                stack.pop();
                visiting.delete(node);
                visited.add(node);
            };
            for (const node of graph.keys()) dfs(node);
            return { available: true, cycles, bestEffort: true };
        }

        /** getVacantPositions(orgId) — real, delegates entirely to OrganizationRole.listVacantRoles(), not a second implementation. */
        getVacantPositions(orgId) {
            const roleEngine = window.CozyOS.OrganizationRole;
            if (!roleEngine) return { available: false, reason: "OrganizationRole is not loaded." };
            return { available: true, vacant: roleEngine.listVacantRoles({ orgId }) };
        }

        /**
         * buildHierarchyTree(orgId)
         *   Real tree assembly from the real, flat role list — roles with
         *   no real `reportsTo` become real roots; every other role
         *   nests under its real supervisor. A role whose declared
         *   `reportsTo` doesn't resolve to any real role in this org
         *   (shouldn't happen given createRole()'s own fail-closed check,
         *   but checked here defensively) is honestly placed at the root
         *   rather than silently dropped.
         */
        buildHierarchyTree(orgId) {
            const roleEngine = window.CozyOS.OrganizationRole;
            if (!roleEngine) return { available: false, reason: "OrganizationRole is not loaded." };
            const roles = roleEngine.listRoles({ orgId });
            const byId = new Map(roles.map(r => [r.roleId, { ...r, children: [] }]));
            const roots = [];
            for (const role of byId.values()) {
                if (role.reportsTo && byId.has(role.reportsTo)) byId.get(role.reportsTo).children.push(role);
                else roots.push(role);
            }
            return { available: true, tree: this.#deepClone(roots) };
        }

        getDiagnosticsReport() {
            return { moduleVersion: ORG_HIERARCHY_VERSION };
        }
    }

    if (window.CozyOS.OrganizationHierarchy && typeof window.CozyOS.OrganizationHierarchy.getVersion === "function") {
        const existingVersion = window.CozyOS.OrganizationHierarchy.getVersion();
        if (existingVersion !== ORG_HIERARCHY_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: OrganizationHierarchy existing v${existingVersion} conflicts with load target v${ORG_HIERARCHY_VERSION}.`);
        return;
    }

    window.CozyOS.OrganizationHierarchy = new CozyOrganizationHierarchy();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "OrganizationHierarchy", category: "Platform", icon: "sitemap.svg",
                description: "Pure consumer of OrganizationRole's real reportsTo data — circular reporting detection (reusing DependencyEngine's proven DFS technique), vacant position reporting, and hierarchy tree assembly. Discovers nothing itself, duplicates no role data."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
