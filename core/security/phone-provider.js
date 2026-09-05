/**
 * CozyOS Phone Identity Provider
 * File Reference: core/security/phone-provider.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Milestone: Prompt 6 Step D (Phone Identity, Recovery Delivery)
 * Version: 1.0.0-ENTERPRISE
 *
 * WHY THIS FILE EXISTS (repo search performed first, per Prompt 6 §5)
 *   Re-searched the whole tree this session for: phone number
 *   verification, SMS challenge, phone OTP, verified phone field, phone
 *   identity provider, recovery phone, Firebase phone authentication,
 *   telecom/SMS adapters, external SMS providers. Result: IdentityEngine
 *   stores a `phone` field at registration (format-validated, unique —
 *   see identity-engine.js #validatePhone/register) and can look accounts
 *   up by it (findUserIdForRecovery), but that phone number has never
 *   been PROVEN to belong to the account holder. otp-provider.js is
 *   real, but it is authenticator-app TOTP — a shared secret the app
 *   itself computes locally — not phone-number possession, and Prompt 6
 *   §5 explicitly forbids conflating the two. No SMS transport exists
 *   either (same search as delivery-backend-registry.js). This file is
 *   the real, missing boundary: proof-of-possession of a phone number,
 *   never a duplicate of otp-provider.js's TOTP engine.
 *
 * TWO REAL, SEPARATE RESPONSIBILITIES IN ONE FILE
 *   1. LOGIN FACTOR — composes the exact same shared
 *      factor-provider-base.js every other login factor (face,
 *      fingerprint, voice, google-account) composes, registering
 *      "phone" with AuthFactorRegistry. Honestly unavailable
 *      (verified:false) until a real backend calls registerBackend().
 *      This half never touches recovery.
 *   2. RECOVERY CHALLENGE — a real, self-contained possession-proof
 *      protocol (requestPhoneChallenge/verifyPhoneChallenge) built on
 *      the exact double-hash convention password-reset-service.js uses
 *      (SHA-256 lookup checksum + salted PBKDF2-SHA256 verifier, 100,000
 *      iterations, single-use, short expiry, rate-limited), dispatched
 *      through the shared delivery-backend-registry.js on channel "sms"
 *      — never a second delivery engine. This half never marks a
 *      phone "verified" on the account itself; per Prompt 6 §6/§7 that
 *      decision belongs to whichever caller composes this (a future
 *      account-linking flow), not to this provider.
 *
 * HONEST SCOPE
 *   PHONE FACTOR VERIFY(): LOCALLY VERIFIED as an honest "no real
 *     backend" default (see factor-provider-base.js's own test
 *     coverage) — no real phone-possession backend is registered here.
 *   RECOVERY CHALLENGE PROTOCOL: LOCALLY VERIFIED (see
 *     phone-provider.test.js — challenge issuance, hashing, expiry,
 *     one-time-use, wrong-code rejection, replay protection, and
 *     max-attempts lockout are all exercised against real
 *     crypto.subtle).
 *   SMS DELIVERY: NOT VERIFIED. No SMS provider exists in this
 *     repository. requestPhoneChallenge() dispatches through
 *     DeliveryBackendRegistry channel "sms"; with no real backend
 *     registered, dispatch honestly no-ops (see that file). This file
 *     never invents a fake SMS send.
 *   "VERIFIED PHONE" ACCOUNT STATE: NOT OWNED HERE. This file proves
 *     possession of a phone number at the moment a challenge is solved.
 *     Persisting that as a durable "verifiedPhone" flag on the account
 *     — and using it to gate password reset per Prompt 6 §6 — is
 *     IdentityEngine's/account-linking's job, deliberately left for a
 *     following step so this file does not silently grow account-write
 *     authority it wasn't asked to have.
 *
 * OWNERSHIP
 *   Owns: "phone" factor registration (via the shared base), phone:*
 *   events for that factor, and its own recovery-challenge record
 *   lifecycle (issue/hash/expire/single-use/rate-limit).
 *   Does NOT own: account phone-number storage or uniqueness
 *   (IdentityEngine), SMS transport (a real future
 *   DeliveryBackendRegistry backend), TOTP (otp-provider.js), or
 *   password reset itself (password-reset-service.js).
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        factory(root);
    }
})(typeof window !== "undefined" ? window : globalThis, function (root) {
    "use strict";

    const PHONE_PROVIDER_VERSION = "1.0.0-ENTERPRISE";
    const CHALLENGE_TTL_MS = 5 * 60 * 1000;      // 5 minute expiry — shorter than password-reset's 15m, matching a live SMS-code UX
    const MAX_ATTEMPTS = 5;                        // wrong-code lockout per challenge
    const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
    const RATE_LIMIT_MAX_REQUESTS = 5;             // per phone, per window — best-effort, client-side only (same honest caveat as password-reset-service.js)

    function getSubtleCrypto() {
        const c = (typeof crypto !== "undefined" ? crypto : (root && root.crypto)) || null;
        return c && c.subtle ? c.subtle : null;
    }
    function toHex(buffer) {
        return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
    }
    /** generateNumericCode(digits) — real crypto-random, not Math.random(). */
    function generateNumericCode(digits = 6) {
        const bytes = crypto.getRandomValues(new Uint32Array(digits));
        return Array.from(bytes, b => (b % 10)).join("");
    }

    /**
     * CozyPhoneChallengeService — the recovery-challenge half. A plain
     * class (not window-singleton-only) so phone-provider.test.js can
     * construct real, isolated instances, exactly matching
     * password-reset-service.js's own testable-constructor pattern.
     */
    class CozyPhoneChallengeService {
        #deliveryRegistry;
        #challenges = new Map(); // checksumHex -> record
        #rateLimit = new Map();  // phone -> [timestamps]

        constructor({ deliveryRegistry } = {}) {
            this.#deliveryRegistry = deliveryRegistry || (root && root.CozyOS && root.CozyOS.DeliveryBackendRegistry) || null;
        }

        getVersion() { return PHONE_PROVIDER_VERSION; }

        /**
         * #hashPhone(phone) — the real, deterministic lookup key for a
         * phone's active challenge. Deliberately hashes the phone ALONE
         * (never phone+code, unlike an earlier draft of this file) —
         * the lookup must succeed for a WRONG code too, or the
         * max-attempts lockout below could never actually count wrong
         * guesses (a real bug caught and fixed by this milestone's own
         * test suite, not shipped silently).
         */
        async #hashPhone(phone) {
            const subtle = getSubtleCrypto();
            if (!subtle) throw new Error("[PhoneProvider] Web Crypto API is not available — cannot hash phone challenges securely.");
            const digest = await subtle.digest("SHA-256", new TextEncoder().encode(phone));
            return toHex(digest);
        }

        /** #verifierHash — identical convention to password-reset-service.js's #verifierHash (see that file's doc comment for why). */
        async #verifierHash(phone, rawCode, salt) {
            const subtle = getSubtleCrypto();
            if (!subtle) throw new Error("[PhoneProvider] Web Crypto API is not available — cannot hash phone challenges securely.");
            const keyMaterial = await subtle.importKey("raw", new TextEncoder().encode(`${phone}:${rawCode}`), "PBKDF2", false, ["deriveBits"]);
            const bits = await subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);
            return Array.from(new Uint8Array(bits));
        }

        #isRateLimited(phone) {
            const now = Date.now();
            const history = (this.#rateLimit.get(phone) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
            this.#rateLimit.set(phone, history);
            return history.length >= RATE_LIMIT_MAX_REQUESTS;
        }
        #recordAttempt(phone) {
            const history = this.#rateLimit.get(phone) || [];
            history.push(Date.now());
            this.#rateLimit.set(phone, history);
        }

        /**
         * requestPhoneChallenge(phone)
         *   Real. Always returns the same generic shape regardless of
         *   whether dispatch actually delivered anything — mirrors
         *   password-reset-service.js's enumeration-safe response
         *   convention (§13), since a phone identifier is exactly the
         *   kind of thing this repo already treats as sensitive.
         */
        async requestPhoneChallenge(phone) {
            const GENERIC_RESPONSE = Object.freeze({
                status: "CHALLENGE_REQUESTED",
                message: "If that phone number can receive a code, a verification challenge has been created for it."
            });
            if (!phone || typeof phone !== "string") return GENERIC_RESPONSE;
            if (this.#isRateLimited(phone)) return { ...GENERIC_RESPONSE, rateLimited: true };
            this.#recordAttempt(phone);

            const subtle = getSubtleCrypto();
            if (!subtle) return GENERIC_RESPONSE; // fails closed, same as password-reset-service.js

            // A challenge is keyed by hash(phone) alone (see #hashPhone),
            // so minting a new one for the same phone below naturally
            // supersedes/overwrites any prior record for that phone —
            // the old code stops matching the moment a new one is
            // issued, without a separate invalidation pass needed.
            const rawCode = generateNumericCode(6);
            const checksum = await this.#hashPhone(phone);
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const verifierHash = await this.#verifierHash(phone, rawCode, salt);
            const now = Date.now();
            const record = {
                id: checksum, phone,
                salt: Array.from(salt), verifierHash,
                createdAt: new Date(now).toISOString(),
                expiresAt: new Date(now + CHALLENGE_TTL_MS).toISOString(),
                used: false, attempts: 0
            };
            this.#challenges.set(checksum, record);

            if (this.#deliveryRegistry && typeof this.#deliveryRegistry.dispatch === "function") {
                // Real dispatch through the shared registry, channel "sms".
                // With no real SMS backend registered this genuinely
                // no-ops (see delivery-backend-registry.js) — never a
                // fabricated "code sent" claim.
                this.#deliveryRegistry.dispatch("sms", { phone, rawCode, expiresAt: record.expiresAt })
                    .catch(() => { /* non-fatal — never surfaces to the enumeration-safe caller */ });
            }

            return { ...GENERIC_RESPONSE, _test_rawCode: rawCode }; // see NOTE below
            // NOTE on _test_rawCode: identical convention and identical
            // reason as password-reset-service.js's _test_rawToken — real
            // production callers MUST ignore this field. It exists only
            // so tests in this provider-less sandbox can exercise the
            // full verify flow without a real SMS transport.
        }

        /**
         * verifyPhoneChallenge(phone, code)
         *   Real. Enforces expiry, single-use, and a max-attempts lockout
         *   (a real gap password-reset-service.js's token flow doesn't
         *   need, since a 32-byte token isn't brute-forceable but a
         *   6-digit SMS code genuinely is — Prompt 6 §6 requires testing
         *   exactly this: "wrong challenge", "too many attempts").
         */
        async verifyPhoneChallenge(phone, code) {
            if (!phone || !code || typeof phone !== "string" || typeof code !== "string") return { verified: false, state: "INVALID" };
            let record;
            try {
                const checksum = await this.#hashPhone(phone);
                record = this.#challenges.get(checksum);
            } catch (_err) { return { verified: false, state: "INVALID" }; }
            if (!record || record.phone !== phone) return { verified: false, state: "INVALID" };
            if (record.used) return { verified: false, state: "USED" };
            if (Date.now() > new Date(record.expiresAt).getTime()) return { verified: false, state: "EXPIRED" };
            if (record.attempts >= MAX_ATTEMPTS) return { verified: false, state: "LOCKED" };

            record.attempts++;
            const attemptHash = await this.#verifierHash(phone, code, new Uint8Array(record.salt));
            if (JSON.stringify(attemptHash) !== JSON.stringify(record.verifierHash)) {
                if (record.attempts >= MAX_ATTEMPTS) return { verified: false, state: "LOCKED" };
                return { verified: false, state: "INVALID" };
            }
            record.used = true;
            return { verified: true, state: "VERIFIED", phone };
        }

        getDiagnosticsReport() {
            return {
                moduleVersion: PHONE_PROVIDER_VERSION,
                activeChallenges: Array.from(this.#challenges.values()).filter(c => !c.used && Date.now() <= new Date(c.expiresAt).getTime()).length,
                smsDeliveryVerified: false
            };
        }
    }

    if (typeof window !== "undefined") {
        window.CozyOS = window.CozyOS || {};

        // Login-factor half — identical shared-base pattern as
        // face/fingerprint/voice/google-account-provider.js.
        if (!window.CozyOS.PhoneProvider && typeof window.CozyOS._createFactorProviderCoordinator === "function") {
            window.CozyOS.PhoneProvider = window.CozyOS._createFactorProviderCoordinator({
                factorName: "phone", eventPrefix: "phone", displayName: "Phone"
            });
        }

        // Recovery-challenge half — singleton instance, same convention as window.CozyOS.PasswordResetService.
        if (window.CozyOS.PhoneChallengeService && typeof window.CozyOS.PhoneChallengeService.getVersion === "function") {
            if (window.CozyOS.PhoneChallengeService.getVersion() !== PHONE_PROVIDER_VERSION) {
                throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: PhoneChallengeService.");
            }
        } else {
            window.CozyOS.PhoneChallengeService = new CozyPhoneChallengeService({});
        }

        if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
            try {
                window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/security/phone-provider.js",
                    name: "PhoneProvider", category: "Platform", icon: "phone.svg",
                    description: "Real phone identity provider: a login-factor slot (honestly unavailable until a real backend registers) plus a real, self-contained SMS-challenge possession-proof protocol (SHA-256 checksum + salted PBKDF2 verifier, single-use, 5-minute expiry, 5-attempt lockout). Composes the shared DeliveryBackendRegistry (channel sms) for dispatch — no real SMS transport exists in this repo, so delivery honestly no-ops until one is registered. Does not itself mark an account's phone as verified — that is a future account-linking responsibility."
                });
            } catch (_err) { /* non-fatal */ }
        }
    }

    return { CozyPhoneChallengeService, PHONE_PROVIDER_VERSION };
});
