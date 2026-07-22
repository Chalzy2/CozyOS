/**
 * CozyOS Authentication Coordinator
 * File Reference: core/security/auth-coordinator.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   The one, real entry point callers (CozyBuilder, Developer Hub,
 *   Certification Center, etc.) should use instead of talking to
 *   `CozyOS.Auth`, `AuthPolicyEngine`, and `AuthFactorRegistry`
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

    class CozyAuthCoordinator {
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
                console.warn(`[CozyOS.AuthCoordinator] Unknown event "${eventName}" — not emitted.`);
                return;
            }
            this.#logAudit(eventName, detail);
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`authcoordinator:${eventName}`, detail); } catch (_err) { /* non-fatal */ }
            }
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

        publishAuditReport() {
            const outputCenter = window.CozyOS.OutputCenter;
            if (!outputCenter) return { success: false, reason: "OutputCenter is not loaded." };
            this.#emitReal("audit-report", { entryCount: this.#auditLog.length });
            return outputCenter.publish({
                name: `auth-coordinator-report-${Date.now()}.json`, category: "Reports",
                content: JSON.stringify({ generatedAt: new Date().toISOString(), auditLog: this.getAuditLog() }, null, 2), mimeType: "application/json",
                sourceApplication: "CozyOS.Auth", sourceEngine: "AuthCoordinator", sourceOperation: "Publish Authentication Audit Report"
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

    if (window.CozyOS.AuthCoordinator && typeof window.CozyOS.AuthCoordinator.getVersion === "function") {
        const existingVersion = window.CozyOS.AuthCoordinator.getVersion();
        if (existingVersion !== AUTH_COORDINATOR_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: AuthCoordinator existing v${existingVersion} conflicts with load target v${AUTH_COORDINATOR_VERSION}.`);
        return;
    }

    window.CozyOS.AuthCoordinator = new CozyAuthCoordinator();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "AuthCoordinator", category: "Platform", icon: "key.svg",
                description: "Real, single facade over CozyOS.Auth, AuthPolicyEngine, and AuthFactorRegistry. Callers ask authenticate(operationName, context) instead of talking to the three underlying coordinators directly. Performs no authentication or policy logic itself — orchestrates real results, publishes real events, records real audit history."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
