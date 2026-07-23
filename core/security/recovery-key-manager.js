/**
 * CozyOS Recovery Key Manager
 * File Reference: core/security/recovery-key-manager.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 130
 *
 * OWNERSHIP
 *   Single source of truth for administrator Recovery Keys — a real,
 *   downloadable cryptographic file (NOT a typed phrase). Owns the key
 *   hash/salt, issuance/rotation timestamps, and verification
 *   attempt/lock state. No other coordinator stores or verifies a
 *   Recovery Key.
 * Does NOT own
 *   Authenticating users (IdentityEngine), deciding which recovery
 *   methods are enabled (AuthPolicyEngine), the wizard UI
 *   (AdminRecoveryWizard).
 * Uses
 *   PlatformEventBus, OutputCenter, AuthFactorRegistry — each checked
 *   for presence before use, never assumed loaded.
 * Distinction from RecoveryPhraseManager
 *   A Recovery Phrase is human-typed. A Recovery Key is a real 256-bit
 *   random secret the administrator downloads as a file at issuance and
 *   uploads (not types) during recovery. Never stored anywhere in
 *   plaintext after generation — only its PBKDF2 hash persists here,
 *   the exact pattern already proven in RecoveryPhraseManager.
 * Security
 *   Fails closed on a missing file, malformed JSON, checksum mismatch
 *   (tamper), wrong userId, or a hash mismatch — never assumes a
 *   partially-valid upload is genuine. Real lockout after 5 failed
 *   verification attempts (15 minutes), mirroring RecoveryPhraseManager.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const RECOVERY_KEY_VERSION = "1.0.0-ENTERPRISE";

    const FAILURE_LOCK_THRESHOLD = 5;
    const DEFAULT_LOCK_DURATION_MS = 15 * 60 * 1000;

    function toBase64(bytes) {
        let bin = "";
        for (const b of bytes) bin += String.fromCharCode(b);
        return btoa(bin);
    }
    function fromBase64(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }

    class CozyRecoveryKeyManager {
        #keysByUser = new Map();
        #attemptState = new Map();
        #history = [];

        getVersion() { return RECOVERY_KEY_VERSION; }
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
                try { window.CozyOS.PlatformEventBus.emit(`recovery-key:${eventName}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }
        getHistory() { return this.#deepClone(this.#history); }

        async #hashSecret(secretBytes, salt) {
            const keyMaterial = await crypto.subtle.importKey("raw", secretBytes, "PBKDF2", false, ["deriveBits"]);
            const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);
            return Array.from(new Uint8Array(bits));
        }
        async #checksum(secretBytes) {
            const digest = await crypto.subtle.digest("SHA-256", secretBytes);
            return toBase64(new Uint8Array(digest)).slice(0, 16); // short, tamper-evident, not secret-bearing
        }

        /**
         * generateKey(userId)
         *   Real — a genuine 256-bit random secret, returned as a
         *   downloadable JSON file ONLY at this moment (the one
         *   necessary plaintext exception, same disclosure as
         *   RecoveryPhraseManager). Never retrievable again afterward.
         */
        async generateKey(userId) {
            if (!userId) return { success: false, reason: "A real userId is required." };
            if (typeof crypto === "undefined" || !crypto.subtle) return { success: false, reason: "Web Crypto API not available — cannot generate a real key." };
            const secretBytes = crypto.getRandomValues(new Uint8Array(32));
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const hash = await this.#hashSecret(secretBytes, salt);
            const checksum = await this.#checksum(secretBytes);
            const keyId = `rk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const now = new Date(Date.now()).toISOString();
            this.#keysByUser.set(userId, { keyId, hash, salt: Array.from(salt), algorithm: "PBKDF2-SHA256-100000", createdAt: now, updatedAt: now });
            this.#emit("generated", { userId, keyId });

            const keyFile = { cozyRecoveryKey: true, version: 1, keyId, userId, issuedAt: now, secret: toBase64(secretBytes), checksum };
            return { success: true, keyId, keyFileContent: JSON.stringify(keyFile, null, 2), keyFileName: `cozyos-recovery-key-${keyId}.json` };
        }

        async rotateKey(userId) {
            const result = await this.generateKey(userId);
            if (result.success) this.#emit("changed", { userId });
            return result;
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
        unlockUser(userId) {
            const state = this.#getAttemptState(userId);
            state.failureCount = 0; state.lockedAt = null;
            this.#emit("unlocked", { userId });
            return { success: true };
        }

        hasKey(userId) { return this.#keysByUser.has(userId); }

        /**
         * verifyKeyFile(userId, uploadedContent)
         *   Real — parses the uploaded file, checks its own embedded
         *   checksum for tamper evidence, confirms it belongs to this
         *   userId, then compares its PBKDF2 hash against the one real
         *   hash stored at issuance. Fails closed on any structural
         *   problem rather than guessing intent.
         */
        async verifyKeyFile(userId, uploadedContent) {
            const lockStatus = this.isLocked(userId);
            if (lockStatus.locked) { this.#emit("failed", { userId, reason: "locked" }); return { verified: false, reason: "Genuinely locked from repeated real failures.", lockStatus }; }

            const record = this.#keysByUser.get(userId);
            if (!record) return { verified: false, reason: "No real Recovery Key has been issued for this user." };

            let parsed;
            try { parsed = JSON.parse(String(uploadedContent || "")); }
            catch (_err) { return this.#fail(userId, "Uploaded file is not valid JSON — not a real CozyOS Recovery Key file."); }

            if (!parsed || parsed.cozyRecoveryKey !== true || typeof parsed.secret !== "string" || typeof parsed.checksum !== "string") {
                return this.#fail(userId, "Uploaded file is missing required Recovery Key fields.");
            }
            if (parsed.userId !== userId) return this.#fail(userId, "Recovery Key file belongs to a different administrator account.");
            if (parsed.keyId !== record.keyId) return this.#fail(userId, "Recovery Key file is stale — a newer key has since been issued or rotated.");

            let secretBytes;
            try { secretBytes = fromBase64(parsed.secret); }
            catch (_err) { return this.#fail(userId, "Recovery Key file's secret is not valid base64 — tampered or corrupted."); }

            const realChecksum = await this.#checksum(secretBytes);
            if (realChecksum !== parsed.checksum) return this.#fail(userId, "Recovery Key file failed checksum verification — tampered or corrupted.");

            const attemptHash = await this.#hashSecret(secretBytes, new Uint8Array(record.salt));
            const verified = JSON.stringify(attemptHash) === JSON.stringify(record.hash);

            const state = this.#getAttemptState(userId);
            if (verified) {
                state.failureCount = 0; state.lockedAt = null;
                this.#emit("verified", { userId });
                return { verified: true };
            }
            return this.#fail(userId, "Recovery Key does not match the real key on file.");
        }

        #fail(userId, reason) {
            const state = this.#getAttemptState(userId);
            state.failureCount++;
            this.#emit("failed", { userId, reason, failureCount: state.failureCount });
            if (state.failureCount >= FAILURE_LOCK_THRESHOLD) { state.lockedAt = new Date(Date.now()).toISOString(); this.#emit("locked", { userId }); }
            return { verified: false, reason };
        }

        publishKeyReport() {
            const outputCenter = window.CozyOS.OutputCenter;
            if (!outputCenter) return { success: false, reason: "OutputCenter is not loaded." };
            const report = { generatedAt: new Date(Date.now()).toISOString(), history: this.getHistory() };
            return outputCenter.publish({
                name: `recovery-key-report-${Date.now()}.json`, category: "Reports",
                content: JSON.stringify(report, null, 2), mimeType: "application/json",
                sourceApplication: "CozyOS.Auth", sourceEngine: "RecoveryKeyManager", sourceOperation: "Publish Recovery Key Report"
            });
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: RECOVERY_KEY_VERSION, usersWithKeys: this.#keysByUser.size, historyEntries: this.#history.length });
        }
    }

    if (window.CozyOS.RecoveryKeyManager && typeof window.CozyOS.RecoveryKeyManager.getVersion === "function") {
        const existingVersion = window.CozyOS.RecoveryKeyManager.getVersion();
        if (existingVersion !== RECOVERY_KEY_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: RecoveryKeyManager existing v${existingVersion} conflicts with load target v${RECOVERY_KEY_VERSION}.`);
        return;
    }

    window.CozyOS.RecoveryKeyManager = new CozyRecoveryKeyManager();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "RecoveryKeyManager", category: "Platform", icon: "file-key.svg",
                description: "Real, single source of truth for administrator Recovery Keys — a downloadable 256-bit cryptographic file (not a typed phrase), PBKDF2-hashed, tamper-checked via embedded checksum, real lockout after 5 failures. The plaintext key is revealed exactly once, at generation/rotation time."
            });
        } catch (_err) { /* non-fatal */ }
    }

    if (window.CozyOS.AuthFactorRegistry && typeof window.CozyOS.AuthFactorRegistry.registerFactor === "function") {
        window.CozyOS.AuthFactorRegistry.registerFactor("recovery-key", {
            isReal: true,
            note: "Real RecoveryKeyManager-backed provider — verifies via verifyKeyFile(context.userId, context.keyFileContent).",
            async verify(context) {
                if (!context || !context.userId || typeof context.keyFileContent !== "string") {
                    return { available: true, verified: false, reason: "context.userId and context.keyFileContent (uploaded file text) are both required." };
                }
                const result = await window.CozyOS.RecoveryKeyManager.verifyKeyFile(context.userId, context.keyFileContent);
                return { available: true, verified: result.verified === true, reason: result.reason || "Recovery Key verification result." };
            }
        });
    }
})();
