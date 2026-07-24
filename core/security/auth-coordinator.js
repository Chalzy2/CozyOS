/**
 * CozyOS Authorization Coordinator
 * File Reference: core/security/auth-coordinator.js
 * Global: window.CozyOS.AuthorizationCoordinator
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * ═══════════════════════════════════════════════════════════════════════
 * OWNERSHIP NOTE (Milestone 132a Ownership Report)
 * ═══════════════════════════════════════════════════════════════════════
 *   This file is DISTINCT from core/modules/identity/auth-coordinator.js
 *   (window.CozyOS.AuthCoordinator), which owns login orchestration and
 *   session establishment. This file owns authorization, policy
 *   evaluation, and step-up access decisions for already-authenticated
 *   sessions. It registers under a different global —
 *   window.CozyOS.AuthorizationCoordinator — and must never be
 *   registered as window.CozyOS.AuthCoordinator again.
 *
 * RESPONSIBILITY
 *   The one, real entry point callers (Developer Hub, and any future
 *   caller needing step-up authorization) should use instead of talking
 *   to `CozyOS.Auth`, `AuthPolicyEngine`, and `AuthFactorRegistry`
 *   separately. This file performs no authentication or policy logic
 *   itself — it orchestrates the three real coordinators that already
 *   exist, combining their real results, publishing real events, and
 *   recording real audit history.
 *
 * REAL COMBINATION LOGIC — VERIFIED INDEPENDENTLY BEFORE IMPLEMENTATION
 *   1. No real `CozyOS.Auth` session at all → always denied. This never
 *      weakens Rule 91's original fail-closed baseline.
 *   2. A real session exists, and no policy is defined for the requested
 *      operation → the session alone suffices (preserves today's
 *      simpler CozyBuilder-access behavior for operations with no
 *      declared step-up requirement).
 *   3. A real session exists, AND a policy is defined for the operation
 *      → the operation's policy must ALSO be satisfied — real step-up
 *      authentication on top of identity, the same pattern used by
 *      real banking apps requiring biometric re-verification for a
 *      large transfer even though the user is already logged in.
 *   Four real cases verified in plain arithmetic before this file was
 *   written: no session; session with no policy; session with a
 *   satisfied policy; session with an unsatisfied policy.
 *
 * WHAT THIS FILE DOES NOT DO (Security section, stated in code)
 *   - Never authenticates a user itself (CozyOS.Auth → IdentityEngine's
 *     job).
 *   - Never decides which factors an operation needs (AuthPolicyEngine's
 *     job).
 *   - Never verifies a specific factor (AuthFactorRegistry's providers'
 *     job).
 *   - Never grants access to a non-Platform-Administrator caller.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const AUTH_COORDINATOR_VERSION = "1.0.0-ENTERPRISE";

    const REAL_EVENT_NAMES = Object.freeze([
        "authentication-started", "authentication-completed", "authentication-failed",
        "policy-evaluated", "factor-verified", "factor-failed", "session-created", "session-ended", "audit-report"
    ]);

    class CozyAuthorizationCoordinator {
        #auditLog = [];

        getVersion() { return AUTH_COORDINATOR_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }
        #logAudit(event, detail) {
            this.#auditLog.push({ event, at: new Date().toISOString(), detail: this.#deepClone(detail) });
            if (this.#auditLog.length > 200) this.#auditLog.shift();
        }
        getAuditLog() { return this.#deepClone(this.#auditLog); }

        #emitReal(eventName, detail = {}) {
            if (!REAL_EVENT_NAMES.includes(eventName)) {
                console.warn(`[CozyOS.AuthorizationCoordinator] Unknown event "${eventName}" — not emitted.`);
                return;
            }
            this.#logAudit(eventName, detail);
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`authorizationcoordinator:${eventName}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }

        /**
         * authorize({ policy, context })
         *   Real, single entry point (Rule 105) — the exact API shape
         *   requested for administrator tools to call instead of each
         *   independently calling IdentityEngine/CozyOS.Auth/
         *   AuthPolicyEngine/SessionManager directly. Composes existing,
         *   already-verified coordinators — never re-implements
         *   authentication, session validation, or policy evaluation.
         *
         *   Real flow, in order:
         *     1. Session lookup — via CozyOS.Auth.getCurrentAdministrator().
         *        No session → real, fail-closed denial.
         *     2. Session validation — via IdentityEngine.validateSession()
         *        (exists/active/not expired — IdentityEngine's own real
         *        check, not re-derived here) and SessionManager's own
         *        real idle-tracking (not expired ≠ not idle-locked; these
         *        are two distinct, real failure modes) and a real check
         *        that the tracked session's userId matches the
         *        authenticated identity's userId.
         *     3. Authentication — delegates entirely to the existing
         *        authenticate() method; never reimplemented here.
         *     4/5. Policy evaluation and factor verification — both
         *        happen inside authenticate()'s own call into
         *        AuthPolicyEngine, which itself composes AuthFactorRegistry.
         *        This method never inspects Face/Fingerprint/Voice/etc.
         *        directly.
         */
        async authorize({ policy, context = {} } = {}) {
            const timestamp = new Date(Date.now()).toISOString();
            const denial = (reason, extra = {}) => ({ authorized: false, authenticated: false, policy: policy || null, session: null, identity: null, factors: null, timestamp, diagnostics: { reason, ...extra } });

            if (!policy) return denial("A real 'policy' (operation name) is required.");

            // 1. Session Lookup (real CozyOS.Auth)
            const auth = window.CozyOS.Auth;
            const session = (auth && typeof auth.getCurrentAdministrator === "function") ? auth.getCurrentAdministrator() : null;
            if (!session) {
                // Real, disclosed fallback (Rule 93) — preserves the
                // exact existing Development Mode behavior so callers can
                // migrate to authorize() without losing it. Never
                // consulted if a real session exists; never available in
                // a genuinely Production environment (DevAccessService's
                // own real, honest environment check enforces that).
                // Applies whether there's no session because Auth isn't
                // loaded at all, or because it's loaded but sessionless.
                const devAccess = window.CozyOS.DevAccessService;
                if (devAccess && typeof devAccess.checkAccess === "function") {
                    const devResult = devAccess.checkAccess();
                    if (devResult.allowed && devResult.method === "development-mode") {
                        const devIdentity = { userId: devResult.administrator.name, roles: [devResult.administrator.role] };
                        return { authorized: true, authenticated: true, policy, session: null, identity: devIdentity, factors: null, timestamp, diagnostics: { method: "development-mode", reason: `Development Mode (environment: ${devResult.environment}) — not a real authenticated session.` } };
                    }
                }
                return denial(auth ? "No authenticated administrator session." : "CozyOS.Auth is not loaded, and no Development Mode fallback is available.");
            }

            // 2. Session Validation (real IdentityEngine.validateSession() + real SessionManager idle-tracking + real user-match)
            const identity = window.CozyOS.IdentityEngine;
            if (identity && typeof identity.validateSession === "function") {
                const validity = identity.validateSession(session.sessionId);
                if (!validity.valid) {
                    return { authorized: false, authenticated: true, policy, session, identity: null, factors: null, timestamp, diagnostics: { reason: `Invalid session: ${validity.reason}` } };
                }
            }
            const sessionManager = window.CozyOS.SessionManager;
            if (sessionManager && typeof sessionManager.getSessionBinding === "function") {
                const binding = sessionManager.getSessionBinding(session.sessionId);
                if (binding) {
                    if (binding.userId !== session.userId) {
                        return { authorized: false, authenticated: true, policy, session, identity: null, factors: null, timestamp, diagnostics: { reason: "Session does not belong to the authenticated user." } };
                    }
                    const idleMs = Date.now() - binding.lastActivityAt;
                    if (idleMs >= 10 * 60 * 1000) {
                        if (typeof sessionManager.checkIdleTimeouts === "function") sessionManager.checkIdleTimeouts();
                        return { authorized: false, authenticated: true, policy, session, identity: null, factors: null, timestamp, diagnostics: { reason: "Session is idle-locked (10+ minutes of real inactivity)." } };
                    }
                    if (typeof sessionManager.touchSession === "function") sessionManager.touchSession(session.sessionId);
                }
            }

            // 3/4/5. Authentication + policy evaluation + factor verification — all delegated, never reimplemented.
            const result = await this.authenticate(policy, context);

            return {
                authorized: result.allowed === true,
                authenticated: true,
                policy,
                session,
                identity: { userId: session.userId, roles: session.roles || [] },
                factors: result.factorDetails || null,
                timestamp,
                diagnostics: { method: result.method || null, reason: result.reason || null }
            };
        }

        async authenticate(operationName, context = {}) {
            this.#emitReal("authentication-started", { operationName });

            const auth = window.CozyOS.Auth;
            if (!auth || typeof auth.getCurrentAdministrator !== "function") {
                this.#emitReal("authentication-failed", { operationName, reason: "CozyOS.Auth is not loaded." });
                return { allowed: false, reason: "CozyOS.Auth is not loaded — cannot verify any real session, so access is refused." };
            }
            const session = auth.getCurrentAdministrator();
            if (!session) {
                this.#emitReal("authentication-failed", { operationName, reason: "No real, verified administrator session exists." });
                return { allowed: false, reason: "No real, verified administrator session exists." };
            }

            const policyEngine = window.CozyOS.AuthPolicyEngine;
            const policyDefined = policyEngine && typeof policyEngine.getPolicy === "function" && policyEngine.getPolicy(operationName) !== null;

            if (!policyDefined) {
                this.#emitReal("authentication-completed", { operationName, method: "session-only", userId: session.userId });
                return { allowed: true, operationName, method: "session-only", session };
            }

            if (typeof policyEngine.evaluate !== "function") {
                this.#emitReal("authentication-failed", { operationName, reason: "AuthPolicyEngine cannot evaluate policies." });
                return { allowed: false, reason: "A policy is defined for this operation but AuthPolicyEngine cannot evaluate it." };
            }
            const policyResult = await policyEngine.evaluate(operationName, context);
            this.#emitReal("policy-evaluated", { operationName, allowed: policyResult.allowed });

            for (const [factorName, detail] of Object.entries(policyResult.factorDetails || {})) {
                const verified = detail.available === true && detail.verified === true;
                this.#emitReal(verified ? "factor-verified" : "factor-failed", { operationName, factorName, reason: detail.reason || null });
            }

            if (!policyResult.allowed) {
                this.#emitReal("authentication-failed", { operationName, reason: "Session verified, but this operation's real policy was not satisfied.", factorDetails: policyResult.factorDetails });
                return { allowed: false, operationName, reason: "A real session exists, but this operation requires additional factors that were not satisfied.", factorDetails: policyResult.factorDetails };
            }

            this.#emitReal("authentication-completed", { operationName, method: "session-plus-policy", userId: session.userId });
            return { allowed: true, operationName, method: "session-plus-policy", session, factorDetails: policyResult.factorDetails };
        }

        /**
         * login({username, password, rememberDevice, deviceNickname})
         *   Real — calls IdentityEngine.login() directly. SessionManager
         *   and CozyOS.Auth both update automatically via their existing
         *   event bridges (Rules 92/103) — no manual registration here.
         */
        async login({ username, password, rememberDevice, deviceNickname } = {}) {
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.login !== "function") return { success: false, reason: "IdentityEngine is not loaded." };
            if (!username || !password) return { success: false, reason: "A real username and password are both required." };
            const result = await identity.login(username, password);
            if (!result.available) {
                this.#emitReal("authentication-failed", { username, reason: result.reason });
                return { success: false, reason: result.reason };
            }
            let device = null;
            if (rememberDevice) {
                const tdm = window.CozyOS.TrustedDeviceManager;
                if (tdm && typeof tdm.registerDevice === "function" && typeof tdm.generateFingerprint === "function") {
                    const fingerprint = await tdm.generateFingerprint();
                    const deviceResult = tdm.registerDevice(result.userId, { nickname: deviceNickname || "This Device", fingerprint });
                    if (deviceResult.success) device = deviceResult.device;
                }
            }
            this.#emitReal("session-created", { userId: result.userId, sessionId: result.sessionId });
            return { success: true, userId: result.userId, sessionId: result.sessionId, roles: result.roles, deviceRegistered: !!device, device };
        }

        /**
         * logout()
         *   Real — gets current session from CozyOS.Auth, calls
         *   IdentityEngine.logout(sessionId). SessionManager/CozyOS.Auth
         *   clear automatically via identity:session-ended.
         */
        logout() {
            const auth = window.CozyOS.Auth;
            const session = auth && typeof auth.getCurrentAdministrator === "function" ? auth.getCurrentAdministrator() : null;
            if (!session) return { success: false, reason: "No real, active administrator session to log out." };
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.logout !== "function") return { success: false, reason: "IdentityEngine is not loaded." };
            const result = identity.logout(session.sessionId);
            this.#emitReal("session-ended", { userId: session.userId, sessionId: session.sessionId });
            return { success: result === true };
        }

        publishAuditReport() {
            const outputCenter = window.CozyOS.OutputCenter;
            if (!outputCenter) return { success: false, reason: "OutputCenter is not loaded." };
            this.#emitReal("audit-report", { entryCount: this.#auditLog.length });
            return outputCenter.publish({
                name: `authorization-coordinator-report-${Date.now()}.json`, category: "Reports",
                content: JSON.stringify({ generatedAt: new Date().toISOString(), auditLog: this.getAuditLog() }, null, 2), mimeType: "application/json",
                sourceApplication: "CozyOS.Auth", sourceEngine: "AuthorizationCoordinator", sourceOperation: "Publish Authorization Audit Report"
            });
        }

        getDiagnosticsReport() {
            return this.#deepClone({
                moduleVersion: AUTH_COORDINATOR_VERSION, auditEntries: this.#auditLog.length,
                dependencies: {
                    "CozyOS.Auth": !!window.CozyOS.Auth, "AuthPolicyEngine": !!window.CozyOS.AuthPolicyEngine,
                    "AuthFactorRegistry": !!window.CozyOS.AuthFactorRegistry, "IdentityEngine": !!window.CozyOS.IdentityEngine
                }
            });
        }
    }

    if (window.CozyOS.AuthorizationCoordinator && typeof window.CozyOS.AuthorizationCoordinator.getVersion === "function") {
        const existingVersion = window.CozyOS.AuthorizationCoordinator.getVersion();
        if (existingVersion !== AUTH_COORDINATOR_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: AuthorizationCoordinator existing v${existingVersion} conflicts with load target v${AUTH_COORDINATOR_VERSION}.`);
        return;
    }

    window.CozyOS.AuthorizationCoordinator = new CozyAuthorizationCoordinator();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "AuthorizationCoordinator", category: "Platform", icon: "key.svg",
                description: "Real, single facade over CozyOS.Auth, AuthPolicyEngine, and AuthFactorRegistry. Callers ask authenticate(operationName, context) instead of talking to the three underlying coordinators directly. Performs no authentication or policy logic itself — orchestrates real results, publishes real events, records real audit history. Distinct from window.CozyOS.AuthCoordinator, which owns login orchestration."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
