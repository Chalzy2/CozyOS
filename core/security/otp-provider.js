/**
 * CozyOS OTP (TOTP) Authentication Factor Provider
 * File Reference: core/security/otp-provider.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Milestone: 132a
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP
 *   The real, only implementation of the "otp" factor — replaces its
 *   long-standing stub in AuthFactorRegistry ("No real one-time-passcode
 *   delivery mechanism exists yet"). Owns RFC 6238 TOTP generation/
 *   verification, RFC 4226 HOTP counter math, otpauth:// URI generation,
 *   and per-account secret enrollment. Does NOT own QR rendering (see
 *   qr-renderer.js — deferred, interface-only this milestone), sessions
 *   (CozySessionService), or policy decisions (AuthorizationCoordinator).
 *
 * REAL, NOT FAKE — WHAT THIS FILE ACTUALLY DOES
 *   Uses window.crypto.subtle (HMAC-SHA1/SHA-256/SHA-512) to compute
 *   genuine HOTP values per RFC 4226 dynamic truncation, then derives
 *   TOTP per RFC 6238 (counter = floor(unixTime / period)). Verification
 *   checks a real configurable time-step window (clock drift tolerance)
 *   and fails closed — an unmatched code never returns verified:true.
 *   Secrets are generated with crypto.getRandomValues (not Math.random)
 *   and encoded/decoded as Base32 (RFC 4648) exactly like every real
 *   authenticator app expects.
 *
 * HONEST SCOPE
 *   No QR encoder exists in this codebase this milestone — enrollment
 *   exposes the full otpauth:// URI and raw Base32 secret for manual
 *   entry; QRRenderer (qr-renderer.js) is an interface stub only, and
 *   this file never fabricates a QR image. Enrolled accounts are held
 *   in-memory for this session only — the same disclosed pattern
 *   RecoveryKeyManager/RecoveryPhraseManager already use in this static,
 *   client-side environment; there is no server and no IndexedDB store
 *   for this yet, stated plainly rather than silently assumed durable.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const OTP_PROVIDER_VERSION = "1.0.0-ENTERPRISE";

    const DEFAULTS = Object.freeze({ algorithm: "SHA-1", digits: 6, period: 30, driftWindow: 1 });
    const ALGO_TO_SUBTLE = { "SHA-1": "SHA-1", "SHA-256": "SHA-256", "SHA-512": "SHA-512" };
    const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    // ---- Base32 (RFC 4648) ----
    function base32Encode(bytes) {
        let bits = 0, value = 0, output = "";
        for (let i = 0; i < bytes.length; i++) {
            value = (value << 8) | bytes[i];
            bits += 8;
            while (bits >= 5) { output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
        }
        if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
        return output;
    }
    function base32Decode(str) {
        const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, "");
        let bits = 0, value = 0; const out = [];
        for (const ch of clean) {
            const idx = BASE32_ALPHABET.indexOf(ch);
            if (idx === -1) continue;
            value = (value << 5) | idx;
            bits += 5;
            if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
        }
        return new Uint8Array(out);
    }

    // ---- counter -> 8-byte big-endian buffer ----
    function counterToBytes(counter) {
        const buf = new ArrayBuffer(8);
        const view = new DataView(buf);
        // JS numbers are safe integers up to 2^53; counter realistically never exceeds 2^32 for decades.
        const high = Math.floor(counter / 0x100000000);
        const low = counter >>> 0;
        view.setUint32(0, high, false);
        view.setUint32(4, low, false);
        return new Uint8Array(buf);
    }

    /** Real RFC 4226 HOTP via crypto.subtle HMAC + dynamic truncation. */
    async function hotp(secretBytes, counter, { digits = DEFAULTS.digits, algorithm = DEFAULTS.algorithm } = {}) {
        const subtleAlgo = ALGO_TO_SUBTLE[algorithm];
        if (!subtleAlgo) throw new Error(`[OTP] Unsupported algorithm "${algorithm}". Use SHA-1, SHA-256, or SHA-512.`);
        const key = await crypto.subtle.importKey(
            "raw", secretBytes, { name: "HMAC", hash: { name: subtleAlgo } }, false, ["sign"]
        );
        const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterToBytes(counter)));
        const offset = sig[sig.length - 1] & 0x0f;
        const binCode = ((sig[offset] & 0x7f) << 24) | ((sig[offset + 1] & 0xff) << 16) |
                        ((sig[offset + 2] & 0xff) << 8) | (sig[offset + 3] & 0xff);
        const code = String(binCode % (10 ** digits)).padStart(digits, "0");
        return code;
    }

    /** Real RFC 6238 TOTP — counter derived from wall-clock time. */
    async function totp(secretBytes, { digits = DEFAULTS.digits, algorithm = DEFAULTS.algorithm, period = DEFAULTS.period, at = Date.now() } = {}) {
        const counter = Math.floor(at / 1000 / period);
        return hotp(secretBytes, counter, { digits, algorithm });
    }

    /** Real, fail-closed verification with a configurable time-step drift window (default ±1 step). */
    async function verifyTotp(secretBase32, token, { digits = DEFAULTS.digits, algorithm = DEFAULTS.algorithm, period = DEFAULTS.period, driftWindow = DEFAULTS.driftWindow, at = Date.now() } = {}) {
        if (!token || !/^\d+$/.test(String(token))) return { verified: false, reason: "Code must be numeric." };
        const secretBytes = base32Decode(secretBase32);
        if (secretBytes.length === 0) return { verified: false, reason: "No real secret registered for this account." };
        const nowCounter = Math.floor(at / 1000 / period);
        for (let delta = -driftWindow; delta <= driftWindow; delta++) {
            const candidate = await hotp(secretBytes, nowCounter + delta, { digits, algorithm });
            if (candidate === String(token).padStart(digits, "0")) {
                return { verified: true, reason: null, stepsOfDrift: delta };
            }
        }
        return { verified: false, reason: "Code did not match within the allowed time-step window." };
    }

    /** Real otpauth:// URI generation per the Key URI Format used by every real authenticator app. */
    function buildOtpauthUri({ issuer, accountName, secretBase32, algorithm = DEFAULTS.algorithm, digits = DEFAULTS.digits, period = DEFAULTS.period }) {
        if (!issuer || !accountName || !secretBase32) throw new Error("[OTP] issuer, accountName, and secretBase32 are all required.");
        const label = encodeURIComponent(`${issuer}:${accountName}`);
        const params = new URLSearchParams({
            secret: secretBase32, issuer, algorithm: algorithm.replace("-", ""), digits: String(digits), period: String(period)
        });
        return `otpauth://totp/${label}?${params.toString()}`;
    }

    class CozyOtpProvider {
        // In-memory only this milestone — accountId -> {accountId, issuer, accountName, secretBase32, algorithm, digits, period, createdAt}
        #accounts = new Map();
        #history = [];

        getVersion() { return OTP_PROVIDER_VERSION; }

        #logHistory(event, detail) {
            this.#history.push({ event, at: new Date().toISOString(), detail });
            if (this.#history.length > 200) this.#history.shift();
        }
        #emit(eventName, detail) {
            this.#logHistory(eventName, detail);
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`otp:${eventName}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }
        getHistory() { return this.#history.slice(); }

        /**
         * enrollAccount({issuer, accountName, algorithm, digits, period})
         *   Real — generates a genuine random secret via crypto.getRandomValues,
         *   stores it in-memory keyed by a new accountId, and returns the real
         *   otpauth:// URI plus raw Base32 secret for manual entry (no QR yet).
         */
        enrollAccount({ issuer, accountName, algorithm = DEFAULTS.algorithm, digits = DEFAULTS.digits, period = DEFAULTS.period } = {}) {
            if (!issuer || !accountName) return { success: false, reason: "issuer and accountName are both required." };
            if (!ALGO_TO_SUBTLE[algorithm]) return { success: false, reason: `Unsupported algorithm "${algorithm}".` };
            const secretBytes = crypto.getRandomValues(new Uint8Array(20)); // 160-bit secret, RFC 4226 recommended minimum
            const secretBase32 = base32Encode(secretBytes);
            const accountId = `otp_${Date.now().toString(36)}_${base32Encode(crypto.getRandomValues(new Uint8Array(4))).toLowerCase()}`;
            const record = { accountId, issuer, accountName, secretBase32, algorithm, digits, period, createdAt: new Date().toISOString() };
            this.#accounts.set(accountId, record);
            const otpauthUri = buildOtpauthUri({ issuer, accountName, secretBase32, algorithm, digits, period });
            this.#emit("account-enrolled", { accountId, issuer, accountName });
            return { success: true, accountId, secretBase32, otpauthUri, algorithm, digits, period };
        }

        /** removeAccount(accountId) — real deletion from the in-memory store. */
        removeAccount(accountId) {
            const existed = this.#accounts.delete(accountId);
            if (existed) this.#emit("account-removed", { accountId });
            return { success: existed, reason: existed ? null : "No such accountId." };
        }

        /** listAccounts() — real, current in-memory accounts, secrets redacted by default. */
        listAccounts({ revealSecrets = false } = {}) {
            return [...this.#accounts.values()].map(a => {
                const { secretBase32, ...safe } = a;
                return revealSecrets ? a : safe;
            });
        }

        getAccount(accountId, { revealSecret = false } = {}) {
            const a = this.#accounts.get(accountId);
            if (!a) return null;
            if (revealSecret) return { ...a };
            const { secretBase32, ...safe } = a;
            return safe;
        }

        /** currentCode(accountId) — real live TOTP for an enrolled account, plus seconds remaining in the current step. */
        async currentCode(accountId, { at = Date.now() } = {}) {
            const a = this.#accounts.get(accountId);
            if (!a) return { available: false, reason: "No such accountId." };
            const secretBytes = base32Decode(a.secretBase32);
            const code = await totp(secretBytes, { digits: a.digits, algorithm: a.algorithm, period: a.period, at });
            const secondsIntoStep = Math.floor(at / 1000) % a.period;
            return { available: true, code, secondsRemaining: a.period - secondsIntoStep, period: a.period };
        }

        /**
         * verify(context)
         *   Real AuthFactorRegistry contract: context = {accountId, code}.
         *   Fails closed on any missing account/secret/mismatch.
         */
        async verify(context = {}) {
            const { accountId, code } = context;
            this.#emit("verification-started", { accountId });
            const a = accountId ? this.#accounts.get(accountId) : null;
            if (!a) {
                const result = { available: true, verified: false, reason: "No such enrolled OTP account." };
                this.#emit("failed", result);
                return result;
            }
            const outcome = await verifyTotp(a.secretBase32, code, { digits: a.digits, algorithm: a.algorithm, period: a.period });
            const result = { available: true, verified: outcome.verified === true, reason: outcome.reason || null };
            this.#emit(result.verified ? "verified" : "failed", { accountId, reason: result.reason });
            return result;
        }

        getDiagnosticsReport() {
            return { moduleVersion: OTP_PROVIDER_VERSION, totalAccounts: this.#accounts.size, historyEntries: this.#history.length };
        }

        getIntegrationManifest() {
            return {
                ownership: { owns: ["RFC 6238 TOTP generation/verification", "RFC 4226 HOTP counter math", "otpauth:// URI generation", "in-memory account enrollment"], doesNotOwn: ["QR rendering (qr-renderer.js)", "sessions", "authorization policy"] },
                uses: ["crypto.subtle", "AuthFactorRegistry", "PlatformEventBus"],
                registers: ["AuthFactorRegistry"],
                security: { failClosed: "verify() returns verified:false on any missing account or code mismatch, never fabricated success.", honestLimitation: "Accounts are in-memory only this milestone — no persistence across reloads yet." }
            };
        }
    }

    if (window.CozyOS.OtpProvider && typeof window.CozyOS.OtpProvider.getVersion === "function") {
        const existingVersion = window.CozyOS.OtpProvider.getVersion();
        if (existingVersion !== OTP_PROVIDER_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: OtpProvider existing v${existingVersion} conflicts with load target v${OTP_PROVIDER_VERSION}.`);
        return;
    }

    const instance = new CozyOtpProvider();
    window.CozyOS.OtpProvider = instance;
    // Expose the pure crypto helpers too, for testing/diagnostics without needing an enrolled account.
    window.CozyOS.OtpCrypto = Object.freeze({ base32Encode, base32Decode, hotp, totp, verifyTotp, buildOtpauthUri });

    if (window.CozyOS.AuthFactorRegistry && typeof window.CozyOS.AuthFactorRegistry.registerFactor === "function") {
        window.CozyOS.AuthFactorRegistry.registerFactor("otp", {
            isReal: true,
            note: "Real RFC 6238 TOTP provider — crypto.subtle backed, in-memory account store this milestone.",
            verify: (context) => instance.verify(context)
        });
    }

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        window.CozyOS.ServiceRegistry.registerCoordinator("OtpProvider", instance);
    }
})();
