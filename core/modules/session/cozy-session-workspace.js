/**
 * CozyOS Session Workspace
 * File Reference: core/modules/session/cozy-session-workspace.js
 * Global: window.CozyOS.SessionWorkspace
 * Layer: Core / Orchestration Facade — Milestone 176B
 * Version: 1.0.0-ENTERPRISE
 *
 * ═══════════════════════════════════════════════════════════════════════
 * OWNERSHIP NOTE (Milestone 176B Gate 1)
 * ═══════════════════════════════════════════════════════════════════════
 *   This file owns NO session state, NO trusted-device state, and NO
 *   authentication or authorization logic. It is a read-only
 *   orchestration / facade layer over five already-canonical owners,
 *   verified against this repository before this file was written:
 *
 *     window.CozyOS.SessionManager            core/security/session-manager.js
 *     window.CozyOS.TrustedDeviceManager       core/security/trusted-device-manager.js
 *     window.CozyOS.IdentityEngine             core/modules/identity/identity-engine.js
 *     window.CozyOS.AuthorizationCoordinator   core/security/auth-coordinator.js
 *     window.CozyOS.PlatformAudit              core/platform/audit-engine.js
 *
 *   It never stores, computes, or decides idle-timeout state, device
 *   trust, session tokens, roles, permissions, or audit ownership. Every
 *   data-bearing method below calls straight through to one or more of
 *   the five dependencies and reshapes/merges their already-real return
 *   values. If a dependency is absent, the corresponding section reports
 *   { available: false, reason: "<Name> is not loaded." } rather than
 *   fabricating data.
 *
 *   This milestone is a precondition unblocked by Milestone 176A (Session
 *   Runtime Reconciliation), which fixed SessionManager and
 *   TrustedDeviceManager reachability. No functional change was made to
 *   any of the five dependencies by this file.
 *
 *   window.CozyOS.Session (core/modules/session/cozy-session-service.js)
 *   is a distinct, unrelated responsibility (the live sign-in snapshot)
 *   and is not referenced here to avoid conflating the two.
 *
 * RESPONSIBILITY
 *   - session workspace bootstrap (dependency presence check)
 *   - unified session summary (getSessionSummary)
 *   - aggregated session + device diagnostics (getWorkspaceHealth)
 *   - unified active-session view across the platform (getActivityOverview)
 *   - workspace's own module diagnostics (getDiagnosticsReport)
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const SESSION_WORKSPACE_VERSION = "1.0.0-ENTERPRISE";

    class CozySessionWorkspace {
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }

        getVersion() { return SESSION_WORKSPACE_VERSION; }

        // ---- delegation accessors (never cached — always the live global) ----
        #sessionManager() { return window.CozyOS.SessionManager || null; }
        #trustedDeviceManager() { return window.CozyOS.TrustedDeviceManager || null; }
        #identity() { return window.CozyOS.IdentityEngine || null; }
        #authzCoordinator() { return window.CozyOS.AuthorizationCoordinator || null; }
        #platformAudit() { return window.CozyOS.PlatformAudit || null; }

        /**
         * getWorkspaceHealth()
         *   Reports whether each of the five verified dependencies is
         *   present and, where available, its own reported diagnostics.
         *   Does not evaluate or interpret their health — only relays it.
         */
        getWorkspaceHealth() {
            const sm = this.#sessionManager();
            const tdm = this.#trustedDeviceManager();
            const identity = this.#identity();
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
                moduleVersion: SESSION_WORKSPACE_VERSION,
                generatedAt: new Date().toISOString(),
                dependencies: {
                    SessionManager: section(sm, "SessionManager"),
                    TrustedDeviceManager: section(tdm, "TrustedDeviceManager"),
                    IdentityEngine: section(identity, "IdentityEngine"),
                    AuthorizationCoordinator: section(authz, "AuthorizationCoordinator"),
                    PlatformAudit: section(audit, "PlatformAudit")
                },
                allDependenciesPresent: !!(sm && tdm && identity && authz && audit)
            };
        }

        /**
         * getSessionSummary(userId)
         *   Unified per-user session view. Calls each owner's own
         *   already-real method and merges the results under clearly
         *   separated keys — no cross-owner computation, no new session
         *   truth derived by this file.
         */
        getSessionSummary(userId) {
            const sm = this.#sessionManager();
            const tdm = this.#trustedDeviceManager();
            const identity = this.#identity();

            const activeSessions = identity && typeof identity.listActiveSessions === "function"
                ? this.#deepClone(identity.listActiveSessions(userId))
                : { available: false, reason: "IdentityEngine.listActiveSessions() is not available." };

            const enrichedSessions = sm && typeof sm.listActiveSessionsEnriched === "function"
                ? (() => { try { return this.#deepClone(sm.listActiveSessionsEnriched(userId)); } catch (_err) { return { available: false, reason: "SessionManager.listActiveSessionsEnriched() threw." }; } })()
                : { available: false, reason: "SessionManager.listActiveSessionsEnriched() is not available." };

            const trustedDevices = tdm && typeof tdm.listDevicesForUser === "function"
                ? (() => { try { return this.#deepClone(tdm.listDevicesForUser(userId)); } catch (_err) { return { available: false, reason: "TrustedDeviceManager.listDevicesForUser() threw." }; } })()
                : { available: false, reason: "TrustedDeviceManager.listDevicesForUser() is not available." };

            return {
                generatedAt: new Date().toISOString(),
                userId,
                identitySessions: { available: !!identity, sessions: activeSessions },
                enrichedSessions: { available: !!sm, sessions: enrichedSessions },
                trustedDevices: { available: !!tdm, devices: trustedDevices }
            };
        }

        /**
         * getActivityOverview({ limit })
         *   Aggregates each owner's own already-real, already-bounded
         *   audit/history log into one chronological feed, tagged by
         *   source. Read-only merge for display — nothing is persisted
         *   here, and each entry's original owner is preserved in the
         *   `source` field.
         */
        getActivityOverview({ limit = 100 } = {}) {
            const sm = this.#sessionManager();
            const authz = this.#authzCoordinator();

            const pull = (mod, method, source) => {
                if (!mod || typeof mod[method] !== "function") return [];
                try {
                    return this.#deepClone(mod[method]()).map(entry => ({ ...entry, source }));
                } catch (_err) { return []; }
            };

            const merged = [
                ...pull(sm, "getHistory", "SessionManager"),
                ...pull(authz, "getAuditLog", "AuthorizationCoordinator")
            ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

            return {
                generatedAt: new Date().toISOString(),
                count: Math.min(merged.length, limit),
                totalAvailable: merged.length,
                entries: merged.slice(0, limit)
            };
        }

        /**
         * getDeviceExpirationReport()
         *   Straight passthrough to TrustedDeviceManager's own
         *   already-real trust-expiration check. No reshaping —
         *   TrustedDeviceManager remains the sole owner of trust state.
         */
        getDeviceExpirationReport() {
            const tdm = this.#trustedDeviceManager();
            if (!tdm || typeof tdm.checkTrustExpirations !== "function") {
                return { available: false, reason: "TrustedDeviceManager is not loaded." };
            }
            try { return { available: true, report: this.#deepClone(tdm.checkTrustExpirations()) }; }
            catch (_err) { return { available: false, reason: "TrustedDeviceManager.checkTrustExpirations() threw." }; }
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
            const sm = this.#sessionManager(), tdm = this.#trustedDeviceManager(),
                  identity = this.#identity(), authz = this.#authzCoordinator(), audit = this.#platformAudit();
            return this.#deepClone({
                moduleVersion: SESSION_WORKSPACE_VERSION,
                dependencies: {
                    SessionManager: !!sm, TrustedDeviceManager: !!tdm,
                    IdentityEngine: !!identity, AuthorizationCoordinator: !!authz, PlatformAudit: !!audit
                }
            });
        }
    }

    if (window.CozyOS.SessionWorkspace && typeof window.CozyOS.SessionWorkspace.getVersion === "function") {
        const existingVersion = window.CozyOS.SessionWorkspace.getVersion();
        if (existingVersion !== SESSION_WORKSPACE_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: SessionWorkspace existing v${existingVersion} conflicts with load target v${SESSION_WORKSPACE_VERSION}.`);
        return;
    }

    window.CozyOS.SessionWorkspace = new CozySessionWorkspace();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "SessionWorkspace", category: "Platform", icon: "clock.svg",
                description: "Read-only orchestration facade over SessionManager, TrustedDeviceManager, IdentityEngine, AuthorizationCoordinator, and PlatformAudit. Owns no session state, no trusted-device state, no authentication or authorization logic — merges and relays what those five canonical owners already report."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
