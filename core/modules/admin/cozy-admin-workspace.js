/**
 * CozyOS Administration Workspace
 * File Reference: core/modules/admin/cozy-admin-workspace.js
 * Global: window.CozyOS.AdminWorkspace
 * Layer: Core / Orchestration Facade — Milestone 175B
 * Version: 1.0.0-ENTERPRISE
 *
 * ═══════════════════════════════════════════════════════════════════════
 * OWNERSHIP NOTE (Milestone 175B Gate 1)
 * ═══════════════════════════════════════════════════════════════════════
 *   This file owns NO security truth. It is a read-only orchestration /
 *   facade layer over four already-canonical owners, verified against
 *   this repository before this file was written:
 *
 *     window.CozyOS.IdentityEngine            core/modules/identity/identity-engine.js
 *     window.CozyOS.Auth                      core/security/cozy-auth.js
 *     window.CozyOS.AuthorizationCoordinator  core/security/auth-coordinator.js
 *     window.CozyOS.PlatformAudit             core/platform/audit-engine.js
 *
 *   It never stores, computes, or decides:
 *     - roles
 *     - permissions
 *     - authentication outcomes
 *     - authorization outcomes
 *     - audit ownership
 *   All of the above remain exclusively owned by the four modules above.
 *   Role enumeration and permission enumeration do not exist anywhere in
 *   this repository and are NOT invented here.
 *
 *   window.CozyOS.PolicyDecisionEngine and window.CozyOS.PolicyEngine
 *   exist in this repository (core/modules/policy/) but are not loaded by
 *   dashboard.html and are out of scope for this facade — this file does
 *   not reference them.
 *
 *   window.CozyOS.DevAccessService (core/security/dev-access-service.js)
 *   exists but is not loaded by dashboard.html and is out of scope — this
 *   file does not reference it.
 *
 * RESPONSIBILITY
 *   - administrator workspace bootstrap (dependency presence check)
 *   - unified administrative view (getPlatformSummary)
 *   - administrative diagnostics (getWorkspaceHealth)
 *   - administrative activity aggregation (getAdministrativeActivity)
 *   - workspace's own module diagnostics (getDiagnosticsReport)
 *
 *   Every data-bearing method below calls straight through to one or more
 *   of the four dependencies and reshapes/merges their already-real
 *   return values. If a dependency is absent, the corresponding section
 *   reports { available: false, reason: "<Name> is not loaded." } rather
 *   than fabricating data.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const ADMIN_WORKSPACE_VERSION = "1.0.0-ENTERPRISE";

    class CozyAdminWorkspace {
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }

        getVersion() { return ADMIN_WORKSPACE_VERSION; }

        // ---- delegation accessors (never cached — always the live global) ----
        #identity() { return window.CozyOS.IdentityEngine || null; }
        #auth() { return window.CozyOS.Auth || null; }
        #authzCoordinator() { return window.CozyOS.AuthorizationCoordinator || null; }
        #platformAudit() { return window.CozyOS.PlatformAudit || null; }

        /**
         * getWorkspaceHealth()
         *   Reports whether each of the four verified dependencies is
         *   present and, where available, its own reported diagnostics.
         *   Does not evaluate or interpret their health — only relays it.
         */
        getWorkspaceHealth() {
            const identity = this.#identity();
            const auth = this.#auth();
            const authz = this.#authzCoordinator();
            const audit = this.#platformAudit();

            const section = (mod, name) => {
                if (!mod) return { available: false, reason: `${name} is not loaded.` };
                if (typeof mod.getDiagnosticsReport === "function") {
                    try { return { available: true, diagnostics: this.#deepClone(mod.getDiagnosticsReport()) }; }
                    catch (_err) { return { available: true, diagnostics: null, reason: `${name}.getDiagnosticsReport() threw.` }; }
                }
                return { available: true, diagnostics: null };
            };

            return {
                moduleVersion: ADMIN_WORKSPACE_VERSION,
                generatedAt: new Date().toISOString(),
                dependencies: {
                    IdentityEngine: section(identity, "IdentityEngine"),
                    "CozyOS.Auth": section(auth, "CozyOS.Auth"),
                    AuthorizationCoordinator: section(authz, "AuthorizationCoordinator"),
                    PlatformAudit: section(audit, "PlatformAudit")
                },
                allDependenciesPresent: !!(identity && auth && authz && audit)
            };
        }

        /**
         * getPlatformSummary()
         *   Unified administrative view. Calls each owner's own
         *   already-real summary method and merges the results under
         *   clearly separated keys — no cross-owner computation, no new
         *   totals derived by this file.
         */
        getPlatformSummary() {
            const identity = this.#identity();
            const auth = this.#auth();

            const identitySummary = identity && typeof identity.getDashboardSummary === "function"
                ? this.#deepClone(identity.getDashboardSummary())
                : { available: false, reason: "IdentityEngine.getDashboardSummary() is not available." };

            const currentAdministrator = auth && typeof auth.getCurrentAdministrator === "function"
                ? this.#deepClone(auth.getCurrentAdministrator())
                : null;

            const isSignedIn = auth && typeof auth.isSignedIn === "function" ? auth.isSignedIn() : false;

            return {
                generatedAt: new Date().toISOString(),
                identity: identitySummary,
                session: {
                    available: !!auth,
                    isSignedIn,
                    currentAdministrator
                }
            };
        }

        /**
         * getAdministrativeActivity({ limit })
         *   Aggregates each owner's own already-real, already-bounded
         *   audit log into one chronological feed, tagged by source.
         *   This is a read-only merge for display — it does not become a
         *   new audit store; nothing is persisted here, and each entry's
         *   original owner is preserved in the `source` field.
         */
        getAdministrativeActivity({ limit = 100 } = {}) {
            const identity = this.#identity();
            const auth = this.#auth();
            const authz = this.#authzCoordinator();

            const pull = (mod, source) => {
                if (!mod || typeof mod.getAuditLog !== "function") return [];
                try {
                    return this.#deepClone(mod.getAuditLog()).map(entry => ({ ...entry, source }));
                } catch (_err) { return []; }
            };

            const merged = [
                ...pull(identity, "IdentityEngine"),
                ...pull(auth, "CozyOS.Auth"),
                ...pull(authz, "AuthorizationCoordinator")
            ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

            return {
                generatedAt: new Date().toISOString(),
                count: Math.min(merged.length, limit),
                totalAvailable: merged.length,
                entries: merged.slice(0, limit)
            };
        }

        /**
         * getPlatformAuditReport()
         *   Straight passthrough to PlatformAudit's own already-real full
         *   audit report. No reshaping — PlatformAudit remains the sole
         *   owner of audit findings.
         */
        getPlatformAuditReport() {
            const audit = this.#platformAudit();
            if (!audit || typeof audit.getFullAuditReport !== "function") {
                return { available: false, reason: "PlatformAudit is not loaded." };
            }
            try { return { available: true, report: this.#deepClone(audit.getFullAuditReport()) }; }
            catch (_err) { return { available: false, reason: "PlatformAudit.getFullAuditReport() threw." }; }
        }

        getDiagnosticsReport() {
            const identity = this.#identity(), auth = this.#auth(), authz = this.#authzCoordinator(), audit = this.#platformAudit();
            return this.#deepClone({
                moduleVersion: ADMIN_WORKSPACE_VERSION,
                dependencies: {
                    IdentityEngine: !!identity, "CozyOS.Auth": !!auth,
                    AuthorizationCoordinator: !!authz, PlatformAudit: !!audit
                }
            });
        }
    }

    if (window.CozyOS.AdminWorkspace && typeof window.CozyOS.AdminWorkspace.getVersion === "function") {
        const existingVersion = window.CozyOS.AdminWorkspace.getVersion();
        if (existingVersion !== ADMIN_WORKSPACE_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: AdminWorkspace existing v${existingVersion} conflicts with load target v${ADMIN_WORKSPACE_VERSION}.`);
        return;
    }

    window.CozyOS.AdminWorkspace = new CozyAdminWorkspace();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "AdminWorkspace", category: "Platform", icon: "layout-dashboard.svg",
                description: "Read-only orchestration facade over IdentityEngine, CozyOS.Auth, AuthorizationCoordinator, and PlatformAudit. Owns no security truth, no roles, no permissions, no audit ownership — merges and relays what those four canonical owners already report."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
