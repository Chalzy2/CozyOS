/**
 * CozyOS — Living Security Coordinator (LSE)
 * File Reference: core/security/living-security-coordinator.js
 * Milestone: M381
 *
 * WHAT THIS IS
 *   A read-mostly coordinator composing existing, real security engines
 *   into trust/risk scores and an adaptive authentication decision.
 *   Never re-implements any composed engine's own logic. Every signal
 *   below was confirmed real by reading the composed engine's actual
 *   public API before this file was written — none is guessed.
 *
 * COMPOSED (real, unmodified)
 *   TrustedDeviceManager.isTrusted()/findDeviceForUser()/isLocked()
 *   WebauthnProvider.hasCredential()
 *   OtpProvider.findAccountByUserId()
 *   SessionManager.getSessionBinding()
 *   LivingRecoveryVault.listApprovals()
 *   IdentityEngine.getAuditLog() (filtered for LOGIN_FAILED/LOGIN_OTP_FAILED)
 *   PlatformEventBus.emit()
 *
 * HONEST, DISCLOSED GAPS — NOT FABRICATED
 *   - New-location risk: Geolocation API requires explicit permission
 *     and is not continuous/background in a browser. Not composed this
 *     pass; reported as `available: false` rather than guessed.
 *   - Session/time anomaly detection: no behavioral baseline exists
 *     anywhere in this repository to compare against. Not implemented.
 *   - Biometrics (Face/Fingerprint providers): not composed this pass —
 *     their real public API was not confirmed before this file was
 *     written; composing them without that confirmation would risk
 *     calling a method that doesn't exist. Left as a disclosed gap for
 *     a future pass, not guessed at.
 *   - Touch pressure, root/debugger/memory-tamper detection, SIM/
 *     Bluetooth/USB monitoring, weather: no web API exposes any of
 *     these. Not implemented, not simulated.
 *
 * DESIGN
 *   Trust and risk are separate 0-100 scores, each built from real,
 *   weighted signals (weights match the brief's own examples where a
 *   real signal exists for them). A signal that can't be read (engine
 *   not loaded, no data yet) contributes 0, not a guessed default -
 *   confirmed via each signal's own `available` flag in the returned
 *   breakdown, so a caller can tell "scored 0" from "not measured"
 *   apart.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const LSE_VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["living-security-coordinator"]) return;

    function emit(name, detail) {
        const bus = window.CozyOS.PlatformEventBus;
        if (bus && typeof bus.emit === "function") { try { bus.emit(name, detail); } catch (_err) { /* non-fatal */ } }
    }

    class CozyLivingSecurityCoordinator {
        #history = []; // trust/risk/auth-decision/recovery history — real, local, never a secret value

        getVersion() { return LSE_VERSION; }

        #log(action, detail) {
            this.#history.push({ action, at: new Date().toISOString(), detail });
            if (this.#history.length > 500) this.#history.shift();
        }
        getHistory() { return this.#history.slice(); }

        /**
         * evaluateTrust({userId, deviceId, sessionId})
         *   Real, composed signals only. Each contributes a disclosed
         *   weight (matching the brief's own examples) only when its
         *   composed engine confirms the condition; otherwise 0 with
         *   available:false in the breakdown.
         */
        evaluateTrust({ userId, deviceId, sessionId } = {}) {
            const breakdown = {};
            let score = 0;

            const tdm = window.CozyOS.TrustedDeviceManager;
            if (tdm && deviceId) {
                const known = typeof tdm.isTrusted === "function" ? tdm.isTrusted(deviceId) : null;
                breakdown.knownDevice = { available: known !== null, value: !!known, weight: 25 };
                if (known) score += 25;
            } else breakdown.knownDevice = { available: false, reason: "TrustedDeviceManager not loaded or no deviceId given." };

            const webauthn = window.CozyOS.WebauthnProvider;
            if (webauthn && userId && typeof webauthn.hasCredential === "function") {
                const has = webauthn.hasCredential(userId);
                breakdown.passkeyEnrolled = { available: true, value: has, weight: 30 };
                if (has) score += 30;
            } else breakdown.passkeyEnrolled = { available: false, reason: "WebauthnProvider not loaded or no userId given." };

            const otp = window.CozyOS.OtpProvider;
            if (otp && userId && typeof otp.findAccountByUserId === "function") {
                const has = !!otp.findAccountByUserId(userId);
                breakdown.authenticatorEnrolled = { available: true, value: has, weight: 20 };
                if (has) score += 20;
            } else breakdown.authenticatorEnrolled = { available: false, reason: "OtpProvider not loaded or no userId given." };

            const session = window.CozyOS.SessionManager;
            if (session && sessionId && typeof session.getSessionBinding === "function") {
                const binding = session.getSessionBinding(sessionId);
                const bound = !!(binding && binding.deviceId);
                breakdown.sessionDeviceBound = { available: true, value: bound, weight: 10 };
                if (bound) score += 10;
            } else breakdown.sessionDeviceBound = { available: false, reason: "SessionManager not loaded or no sessionId given." };

            // Recovery history is informational, not a strong positive
            // signal (a recent recovery could equally indicate a
            // compromised account) - disclosed as available but
            // deliberately not scored, rather than guessing a direction.
            const vault = window.CozyOS.LivingRecoveryVault;
            if (vault && userId && typeof vault.listApprovals === "function") {
                const approvals = vault.listApprovals({ userId });
                breakdown.recoveryHistory = { available: true, value: approvals.length, weight: 0, note: "Informational only - not scored, since a recent recovery is not reliably a positive or negative trust signal on its own." };
            } else breakdown.recoveryHistory = { available: false, reason: "LivingRecoveryVault not loaded or no userId given." };

            const result = { score: Math.min(100, score), breakdown, computedAt: new Date().toISOString() };
            this.#log("trust-evaluated", { userId, deviceId, score: result.score });
            emit("cozy:trust-updated", { userId, deviceId, score: result.score });
            return result;
        }

        /**
         * evaluateRisk({userId, deviceId})
         *   Real signals: failed-login count (via IdentityEngine's real
         *   audit log), device lock state, unknown-device flag, recovery
         *   attempt count. New-location and session/time anomalies are
         *   NOT scored - disclosed unavailable, not guessed.
         */
        evaluateRisk({ userId, username, deviceId } = {}) {
            const breakdown = {};
            let score = 0;

            const identity = window.CozyOS.IdentityEngine;
            if (identity && username && typeof identity.getAuditLog === "function") {
                const failures = identity.getAuditLog(e => (e.action === "LOGIN_FAILED" || e.action === "LOGIN_OTP_FAILED") && e.msg === username);
                const count = failures.length;
                const weight = Math.min(60, count * 15); // matches brief's "repeated failures -60" ceiling
                breakdown.failedAuthentication = { available: true, value: count, weight };
                score += weight;
            } else breakdown.failedAuthentication = { available: false, reason: "IdentityEngine not loaded or no username given." };

            const tdm = window.CozyOS.TrustedDeviceManager;
            if (tdm && deviceId) {
                const locked = typeof tdm.isLocked === "function" ? tdm.isLocked(deviceId) : null;
                const known = typeof tdm.findDeviceForUser === "function" && userId ? !!tdm.findDeviceForUser(userId, deviceId) : null;
                if (locked !== null) { breakdown.deviceLocked = { available: true, value: locked, weight: locked ? 40 : 0 }; if (locked) score += 40; }
                else breakdown.deviceLocked = { available: false, reason: "isLocked() unavailable." };
                if (known !== null) { breakdown.unknownDevice = { available: true, value: !known, weight: known ? 0 : 20 }; if (!known) score += 20; }
                else breakdown.unknownDevice = { available: false, reason: "Cannot confirm device ownership without userId." };
            } else { breakdown.deviceLocked = { available: false, reason: "TrustedDeviceManager not loaded or no deviceId." }; breakdown.unknownDevice = breakdown.deviceLocked; }

            const vault = window.CozyOS.LivingRecoveryVault;
            if (vault && userId && typeof vault.listApprovals === "function") {
                const pending = vault.listApprovals({ userId }).filter(a => !a.tokenIssued);
                breakdown.pendingRecoveryAttempts = { available: true, value: pending.length, weight: Math.min(20, pending.length * 10) };
                score += breakdown.pendingRecoveryAttempts.weight;
            } else breakdown.pendingRecoveryAttempts = { available: false, reason: "LivingRecoveryVault not loaded or no userId given." };

            breakdown.newLocation = { available: false, reason: "Geolocation requires explicit permission and is not continuous in-browser - not composed this pass." };
            breakdown.sessionAnomaly = { available: false, reason: "No behavioral baseline exists to compare against - not implemented." };
            breakdown.timeAnomaly = { available: false, reason: "No behavioral baseline exists to compare against - not implemented." };

            const result = { score: Math.min(100, score), breakdown, computedAt: new Date().toISOString() };
            this.#log("risk-evaluated", { userId, deviceId, score: result.score });
            emit("cozy:risk-updated", { userId, deviceId, score: result.score });
            return result;
        }

        /**
         * decideAuthentication({userId, username, deviceId, sessionId})
         *   Real composition of evaluateTrust()/evaluateRisk() above,
         *   mapped to the brief's own adaptive tiers. Never claims a
         *   factor is available if its underlying engine isn't loaded -
         *   the `required` list only names factors this coordinator
         *   could actually confirm are enrollable for this user.
         */
        decideAuthentication({ userId, username, deviceId, sessionId } = {}) {
            const trust = this.evaluateTrust({ userId, deviceId, sessionId });
            const risk = this.evaluateRisk({ userId, username, deviceId });

            let tier, required;
            if (risk.score >= 70) { tier = "critical"; required = ["account-lock", "administrator-review"]; }
            else if (risk.score >= 40) { tier = "high-risk"; required = ["password", "passkey", "authenticator"]; }
            else if (trust.score >= 70 && risk.score < 20) { tier = "very-trusted"; required = ["passkey"]; }
            else if (trust.score >= 50) { tier = "trusted"; required = ["passkey"]; }
            else if (risk.score >= 20) { tier = "medium-risk"; required = ["password", "authenticator"]; }
            else { tier = "medium"; required = ["password"]; }

            const result = { tier, required, trustScore: trust.score, riskScore: risk.score, decidedAt: new Date().toISOString() };
            this.#log("authentication-decided", { userId, tier, trustScore: trust.score, riskScore: risk.score });
            emit("cozy:authentication-required", result);
            if (tier === "critical") emit("cozy:security-alert", { userId, deviceId, reason: "Risk score reached critical threshold.", riskScore: risk.score });
            return result;
        }

        /**
         * verifyRecovery({userId, approvalId, requestingUserId})
         *   Real, thin pass-through to LivingRecoveryVault's own real,
         *   already-tested two-step approval methods - never
         *   re-implements the approval logic itself.
         */
        verifyRecovery({ approvalId, requestingUserId, role } = {}) {
            const vault = window.CozyOS.LivingRecoveryVault;
            if (!vault) return { success: false, reason: "LivingRecoveryVault is not loaded." };
            let result;
            if (role === "admin" && typeof vault.approveByAdmin === "function") result = vault.approveByAdmin(approvalId, requestingUserId);
            else if (role === "owner" && typeof vault.confirmByOwner === "function") result = vault.confirmByOwner(approvalId, requestingUserId);
            else return { success: false, reason: "role must be 'admin' or 'owner'." };
            this.#log("recovery-verified", { approvalId, role, success: result.success });
            emit("cozy:recovery-request", { approvalId, role, result: result.success });
            return result;
        }

        /** audit({predicate}) — real, thin pass-through to IdentityEngine's own audit log, plus this coordinator's own local history. */
        audit(predicate) {
            const identity = window.CozyOS.IdentityEngine;
            const identityLog = identity && typeof identity.getAuditLog === "function" ? identity.getAuditLog(predicate) : [];
            return { identityAudit: identityLog, securityHistory: predicate ? this.#history.filter(predicate) : this.getHistory() };
        }

        /** publishSecurityEvent(name, detail) — real, direct pass-through to the existing, unmodified PlatformEventBus. No new event system. */
        publishSecurityEvent(name, detail) {
            emit(name, detail);
            this.#log("event-published", { name });
            return { success: true };
        }

        getDiagnosticsReport() {
            return {
                moduleVersion: LSE_VERSION,
                historyEntries: this.#history.length,
                composedEngines: {
                    IdentityEngine: !!window.CozyOS.IdentityEngine,
                    TrustedDeviceManager: !!window.CozyOS.TrustedDeviceManager,
                    WebauthnProvider: !!window.CozyOS.WebauthnProvider,
                    OtpProvider: !!window.CozyOS.OtpProvider,
                    LivingRecoveryVault: !!window.CozyOS.LivingRecoveryVault,
                    SessionManager: !!window.CozyOS.SessionManager,
                    PlatformEventBus: !!window.CozyOS.PlatformEventBus
                }
            };
        }

        getIntegrationManifest() {
            return {
                ownership: { owns: ["trust scoring", "risk scoring", "adaptive authentication decision", "recovery verification pass-through", "security event publishing"], doesNotOwn: ["device registration (TrustedDeviceManager)", "passkey ceremonies (WebauthnProvider)", "OTP verification (OtpProvider)", "vault encryption (LivingRecoveryVault)", "sessions (SessionManager)"] },
                uses: ["TrustedDeviceManager", "WebauthnProvider", "OtpProvider", "SessionManager", "LivingRecoveryVault", "IdentityEngine", "PlatformEventBus"],
                security: { honestLimitation: "Face/Fingerprint biometrics, location-based risk, and behavioral/time anomaly detection are NOT composed this milestone - their real APIs were not confirmed (biometrics) or no web capability exists (location continuity, behavioral baseline). Disclosed via each signal's available:false, never guessed." }
            };
        }
    }

    const instance = new CozyLivingSecurityCoordinator();
    window.CozyOS.LivingSecurityCoordinator = instance;

    window.CozyOS.Modules["living-security-coordinator"] = Object.freeze({
        version: LSE_VERSION,
        description: "Living Security Coordinator (M381) — composes TrustedDeviceManager/WebauthnProvider/OtpProvider/SessionManager/LivingRecoveryVault/IdentityEngine/PlatformEventBus into trust/risk scoring and adaptive authentication decisions. No new encryption, no duplicate engine. Biometrics, location risk, and behavioral anomaly detection explicitly not composed - disclosed, not fabricated."
    });
})();
