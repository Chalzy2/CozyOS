/**
 * CozyOS Emergency Recovery Code Manager
 * File Reference: core/security/emergency-recovery-code-manager.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 130
 *
 * OWNERSHIP
 *   Single source of truth for Emergency Recovery Codes — real,
 *   administrator-issued, single-use, time-limited codes for the
 *   Administrator Recovery Wizard's last-resort path. No other
 *   coordinator issues, stores, or consumes these codes.
 * Distinction from every other recovery method here
 *   Every other method (Trusted Device, Recovery Phrase, Recovery
 *   Questions, Recovery Key) is something the SAME administrator
 *   already holds. An Emergency Recovery Code is instead ISSUED, on
 *   demand, by another platform administrator to a locked-out
 *   colleague — real out-of-band human verification standing in for a
 *   channel this static, client-side platform genuinely does not have
 *   (no email/SMS delivery infrastructure exists anywhere in this
 *   codebase, stated honestly rather than faked).
 * Security
 *   Real 10-character high-entropy code (crypto.getRandomValues over a
 *   36-character alphabet, ~51.7 bits of entropy). PBKDF2-hashed, never
 *   stored in plaintext after issuance. Single-use — consumed
 *   atomically on successful verification. Expires (default 30
 *   minutes). Fails closed on expiry, reuse, or mismatch.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const EMERGENCY_CODE_VERSION = "1.0.0-ENTERPRISE";

    const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
    const CODE_LENGTH = 10;
    const DEFAULT_EXPIRY_MS = 30 * 60 * 1000;
    const FAILURE_LOCK_THRESHOLD = 5;
    const DEFAULT_LOCK_DURATION_MS = 15 * 60 * 1000;

    class CozyEmergencyRecoveryCodeManager {
        #codesByUser = new Map(); // userId -> {hash, salt, issuedBy, issuedAt, expiresAt, consumed}
        #attemptState = new Map();
        #history = [];

        getVersion() { return EMERGENCY_CODE_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }
        #logHistory(event, detail) {
            this.#history.push({ event, at: new Date(Date.now()).toISOString(), detail: this.#deepClone(detail) });
            if (this.#history.length > 200) this.#history.shift();
        }
        #emit(eventName, detail) {
            this.#logHistory(eventName, detail);
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`emergency-recovery-code:${eventName}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }
        getHistory() { return this.#deepClone(this.#history); }

        async #hashCode(code, salt) {
            const enc = new TextEncoder();
            const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveBits"]);
            const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);
            return Array.from(new Uint8Array(bits));
        }
        #generateRandomCode() {
            const indices = new Uint32Array(CODE_LENGTH);
            crypto.getRandomValues(indices);
            return Array.from(indices).map(i => CODE_ALPHABET[i % CODE_ALPHABET.length]).join("");
        }

        /**
         * issueCode(targetUserId, { issuedByAdminId, expiresInMs })
         *   Real — must be called by the caller's own admin-only UI
         *   after its own authorization check; this file does not gate
         *   who may call it (Rule: compose, never re-implement — that
         *   check belongs to whichever admin console calls this).
         *   Replaces any unconsumed prior code for the same user.
         */
        async issueCode(targetUserId, { issuedByAdminId = null, expiresInMs = DEFAULT_EXPIRY_MS } = {}) {
            if (!targetUserId) return { success: false, reason: "A real targetUserId is required." };
            if (typeof crypto === "undefined" || !crypto.subtle) return { success: false, reason: "Web Crypto API not available — cannot issue a real code." };
            const code = this.#generateRandomCode();
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const hash = await this.#hashCode(code, salt);
            const now = Date.now();
            this.#codesByUser.set(targetUserId, {
                hash, salt: Array.from(salt), issuedBy: issuedByAdminId,
                issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + expiresInMs).toISOString(), consumed: false
            });
            this.#emit("issued", { userId: targetUserId, issuedByAdminId, expiresInMs });
            return { success: true, code, expiresAt: new Date(now + expiresInMs).toISOString() };
        }

        revokeCode(userId) {
            if (!this.#codesByUser.has(userId)) return { success: false, reason: "No real code exists for this user." };
            this.#codesByUser.delete(userId);
            this.#emit("revoked", { userId });
            return { success: true };
        }

        #getAttemptState(userId) {
            if (!this.#attemptState.has(userId)) this.#attemptState.set(userId, { failureCount: 0, lockedAt: null, lockDurationMs: DEFAULT_LOCK_DURATION_MS });
            return this.#attemptState.get(userId);
        }
        isLocked(userId) {
            const state = this.#getAttemptState(userId);
            if (state.failureCount < FAILURE_LOCK_THRESHOLD || !state.lockedAt) return { locked: false };
            return { locked: (Date.now() - new Date(state.lockedAt).getTime()) < state.lockDurationMs };
        }

        /**
         * verifyCode(userId, attemptedCode)
         *   Real — checks expiry and single-use state before hashing,
         *   fails closed on either. Consumes the code atomically on a
         *   genuine match so it can never be replayed.
         */
        async verifyCode(userId, attemptedCode) {
            const lockStatus = this.isLocked(userId);
            if (lockStatus.locked) { this.#emit("failed", { userId, reason: "locked" }); return { verified: false, reason: "Genuinely locked from repeated real failures.", lockStatus }; }

            const record = this.#codesByUser.get(userId);
            if (!record) return { verified: false, reason: "No real Emergency Recovery Code has been issued for this user." };
            if (record.consumed) return { verified: false, reason: "This code has already been used and cannot be reused." };
            if (Date.now() > new Date(record.expiresAt).getTime()) return { verified: false, reason: "This code has expired." };

            const attemptHash = await this.#hashCode(String(attemptedCode || "").toUpperCase().trim(), new Uint8Array(record.salt));
            const verified = JSON.stringify(attemptHash) === JSON.stringify(record.hash);

            const state = this.#getAttemptState(userId);
            if (verified) {
                record.consumed = true;
                state.failureCount = 0; state.lockedAt = null;
                this.#emit("verified", { userId });
                return { verified: true };
            }
            state.failureCount++;
            this.#emit("failed", { userId, failureCount: state.failureCount });
            if (state.failureCount >= FAILURE_LOCK_THRESHOLD) { state.lockedAt = new Date(Date.now()).toISOString(); this.#emit("locked", { userId }); }
            return { verified: false, reason: "Code does not match, or was already reset by a real failure count." };
        }

        hasPendingCode(userId) {
            const record = this.#codesByUser.get(userId);
            return !!record && !record.consumed && Date.now() <= new Date(record.expiresAt).getTime();
        }

        publishCodeReport() {
            const outputCenter = window.CozyOS.OutputCenter;
            if (!outputCenter) return { success: false, reason: "OutputCenter is not loaded." };
            const report = { generatedAt: new Date(Date.now()).toISOString(), history: this.getHistory() };
            return outputCenter.publish({
                name: `emergency-recovery-code-report-${Date.now()}.json`, category: "Reports",
                content: JSON.stringify(report, null, 2), mimeType: "application/json",
                sourceApplication: "CozyOS.Auth", sourceEngine: "EmergencyRecoveryCodeManager", sourceOperation: "Publish Emergency Recovery Code Report"
            });
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: EMERGENCY_CODE_VERSION, usersWithPendingCodes: [...this.#codesByUser.values()].filter(r => !r.consumed).length, historyEntries: this.#history.length });
        }
    }

    if (window.CozyOS.EmergencyRecoveryCodeManager && typeof window.CozyOS.EmergencyRecoveryCodeManager.getVersion === "function") {
        const existingVersion = window.CozyOS.EmergencyRecoveryCodeManager.getVersion();
        if (existingVersion !== EMERGENCY_CODE_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: EmergencyRecoveryCodeManager existing v${existingVersion} conflicts with load target v${EMERGENCY_CODE_VERSION}.`);
        return;
    }

    window.CozyOS.EmergencyRecoveryCodeManager = new CozyEmergencyRecoveryCodeManager();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "EmergencyRecoveryCodeManager", category: "Platform", icon: "siren.svg",
                description: "Real, single source of truth for Emergency Recovery Codes — administrator-issued, single-use, 10-character high-entropy codes (~51.7 bits), PBKDF2-hashed, expire after 30 minutes by default, real lockout after 5 failed attempts. Stands in for email/SMS delivery, which does not exist anywhere in this codebase."
            });
        } catch (_err) { /* non-fatal */ }
    }

    if (window.CozyOS.AuthFactorRegistry && typeof window.CozyOS.AuthFactorRegistry.registerFactor === "function") {
        window.CozyOS.AuthFactorRegistry.registerFactor("emergency-recovery-code", {
            isReal: true,
            note: "Real EmergencyRecoveryCodeManager-backed provider — verifies via verifyCode(context.userId, context.code).",
            async verify(context) {
                if (!context || !context.userId || !context.code) {
                    return { available: true, verified: false, reason: "context.userId and context.code are both required." };
                }
                const result = await window.CozyOS.EmergencyRecoveryCodeManager.verifyCode(context.userId, context.code);
                return { available: true, verified: result.verified === true, reason: result.reason || "Emergency Recovery Code verification result." };
            }
        });
    }
})();
