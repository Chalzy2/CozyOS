/**
 * CozyOS Enterprise Framework — AdminRecoveryPolicy (Minimal Stub)
 * File Reference: core/modules/identity/admin-recovery-policy.js
 * Milestone: 124
 *
 * RULE 25 — CANONICAL OWNERSHIP DECLARATION
 *   Canonical Owner: trusted-device + biometric Administrator recovery
 *   login, admin session listing, and forced sign-out. Real implementation
 *   is NOT yet built (see Migration Log). This stub exists only so
 *   AuthCoordinator's dependency exists and callers get an explicit
 *   "Not Implemented" instead of a silent crash or fabricated success.
 *
 * FAIL-CLOSED CONTRACT
 *   Every method below returns/throws an explicit not-implemented result.
 *   None of them grant access, report a session as valid, or claim a
 *   sign-out occurred. No fake authentication. No fake recovery.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    class AdminRecoveryPolicyStub {
        constructor() {
            this.implemented = false;
        }

        getVersion() {
            return "0.0.1-STUB";
        }

        /**
         * Trusted-device + biometric login. NOT IMPLEMENTED.
         * Always denies. Never grants access.
         */
        async attemptNormalLogin({ userId, deviceId } = {}) {
            return {
                granted: false,
                reason: "Not Implemented — AdminRecoveryPolicy trusted-device/biometric login does not exist yet.",
            };
        }

        /**
         * List active admin sessions for a user. NOT IMPLEMENTED.
         * Always returns an empty list — never fabricates an active session.
         */
        listAdminSessions(userId) {
            return [];
        }

        /**
         * Force sign-out all sessions for a user. NOT IMPLEMENTED.
         * Performs no action. Callers must not treat this as having
         * revoked anything real.
         */
        forceSignOutAllSessions(userId) {
            return {
                success: false,
                reason: "Not Implemented — AdminRecoveryPolicy cannot force sign-out; no real session store exists here.",
            };
        }
    }

    window.CozyOS.AdminRecoveryPolicy = new AdminRecoveryPolicyStub();
})();
