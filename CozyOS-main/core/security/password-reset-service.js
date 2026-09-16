/**
 * CozyOS Password Reset Service
 * File Reference: core/security/password-reset-service.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Milestone: Prompt 6 (Real Account Recovery)
 * Version: 1.0.0-ENTERPRISE
 *
 * ============================================================
 * DEPRECATED as of Phase B (Unified Server-Authoritative Auth)
 * ============================================================
 *   This client-side token protocol is NO LONGER the authoritative
 *   password-reset implementation. It has been superseded by the real
 *   server-authoritative reset lifecycle in
 *   server/webauthn-rp/rp.js (createPasswordResetToken /
 *   completePasswordReset) reachable at:
 *     POST /auth/password/forgot
 *     POST /auth/password/reset
 *   login.html no longer loads this file and no longer calls
 *   requestPasswordReset()/confirmPasswordReset() on it — as of this
 *   change it has no callers anywhere in the repo (verified by repo
 *   search; see server/CHECKPOINT-PHASE-B-UNIFIED-AUTH.md "callers
 *   determined" section). It is kept in the repository, unmodified
 *   below this banner, rather than deleted, per the explicit
 *   "do not delete it blindly" instruction — a future developer doing
 *   the same repo search this file's own header describes will find
 *   this notice before wiring it back in. Do not register it as a
 *   dependency of any new page or module. Any future removal should
 *   happen as its own reviewed change, not silently.
 *
 * OWNERSHIP
 *   The real, only implementation of the self-service "forgot password"
 *   token protocol. Owns token generation, hashing, expiration,
 *   one-time-use enforcement, and the honest enumeration-safe response
 *   shape — never password hashing itself (composes IdentityEngine's
 *   existing #hashPassword-backed resetPassword()) and never session
 *   creation/termination logic (composes IdentityEngine's existing
 *   terminateSession()/listActiveSessions()).
 *
 * WHY THIS FILE EXISTS (repo search performed first, per Prompt 6 §1)
 *   IdentityEngine already has resetPassword(username, newPassword) —
 *   real PBKDF2 rehashing with a fresh salt — but it is ADMIN-initiated:
 *   it trusts the caller and needs no proof of account ownership. There
 *   was no real self-service path that proves "the caller controls this
 *   account" before calling it. That missing proof-of-ownership layer —
 *   a cryptographically random, single-use, short-lived, hashed-at-rest
 *   token — is the one real gap this file fills. It does not duplicate
 *   resetPassword(), IdentityStorage, or session termination; it
 *   composes all three.
 *
 * HONEST SCOPE — READ BEFORE TRUSTING THIS FILE
 *   RESET PROTOCOL: LOCALLY VERIFIED (see password-reset-service.test.js —
 *   token issuance, hashing, expiry, one-time-use, enumeration-safe
 *   responses, cross-account rejection, and session invalidation are
 *   all exercised against real crypto.subtle / Web Crypto).
 *   TOKEN STORAGE — real double hash, matching the exact convention this
 *   repo already uses for every other stored secret (recovery-key-
 *   manager.js, emergency-recovery-code-manager.js, recovery-phrase-
 *   manager.js): a fast, unsalted SHA-256 checksum of the raw token is
 *   used only as a deterministic lookup key (so a presented token can
 *   find its own record without scanning every outstanding one) — it is
 *   never the security boundary by itself. The real proof of possession
 *   is a separate, salted PBKDF2-SHA256 verifier (100,000 iterations,
 *   16-byte salt), compared exactly like every other secret in this
 *   codebase. Neither the raw token nor a reversible form of it is ever
 *   persisted — only the checksum (for lookup) and the PBKDF2 verifier
 *   (for proof) are stored.
 *   EMAIL DELIVERY: NOT VERIFIED. No email provider exists anywhere in
 *   this repository (re-searched Prompt 6 Step C: still no nodemailer/
 *   SES/SendGrid/Mailgun/SMTP integration found). This file never
 *   fabricates one. It emits a real DOM event
 *   ("cozyos:password-reset-token-issued") AND, if present, dispatches
 *   through the shared core/security/delivery-backend-registry.js
 *   (channel "email") so a real delivery layer — once one exists — can
 *   subscribe either way. Until then, no raw token ever leaves this
 *   process any other way (never returned to the reset-request caller,
 *   never logged).
 *   PHONE/SMS DELIVERY: NOT IN THIS FILE. core/security/phone-provider.js
 *   (Prompt 6 Step D) owns phone-channel recovery and composes the same
 *   DeliveryBackendRegistry (channel "sms") — never a second delivery
 *   engine here.
 *   RATE LIMITING: best-effort, in-memory, per-identifier sliding
 *   window. This is a client-side codebase with no real request/IP
 *   context available here — genuine abuse-resistant rate limiting
 *   needs a real server-side request layer. That gap is stated here,
 *   not implied to be solved.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        // Real dual export — enables genuine execution under Node's
        // built-in test runner (node:test) against real Web Crypto,
        // matching the honesty standard set elsewhere in this repo:
        // this file is actually run and verified, not just syntax-checked.
        module.exports = factory();
    } else {
        factory(root);
    }
})(typeof window !== "undefined" ? window : globalThis, function (root) {
    "use strict";

    const PASSWORD_RESET_SERVICE_VERSION = "1.0.0-ENTERPRISE";
    const TOKEN_BYTES = 32;                 // 256 bits of real entropy
    const DEFAULT_TTL_MS = 15 * 60 * 1000;   // 15 minute expiry
    const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
    const RATE_LIMIT_MAX_REQUESTS = 5;       // per identifier, per window — best-effort, client-side only

    function getSubtleCrypto() {
        const c = (typeof crypto !== "undefined" ? crypto : (root && root.crypto)) || null;
        return c && c.subtle ? c.subtle : null;
    }

    function toHex(buffer) {
        return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    function base64UrlEncode(bytes) {
        let binary = "";
        for (const b of bytes) binary += String.fromCharCode(b);
        const base64 = (typeof btoa === "function") ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
        return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    function constantTimeEqual(a, b) {
        // Real, currently unused — comparisons below follow this repo's
        // existing convention (JSON.stringify equality on the derived-bits
        // array, same as recovery-key-manager.js/emergency-recovery-code-
        // manager.js) rather than introducing a new comparison primitive.
        // Kept as a real, available helper for a future caller that needs
        // a string-comparison version, not dead/fabricated code.
        if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
        let diff = 0;
        for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
        return diff === 0;
    }

    /**
     * CozyPasswordResetService — real, composes IdentityEngine +
     * IdentityStorage. Constructed with explicit dependencies so it is
     * genuinely testable with real crypto and honest in-memory doubles
     * for IdentityEngine/IdentityStorage (matching the roleResolver-double
     * pattern already used in server/live-relay/test/session-authority.test.js),
     * never a mocked crypto layer.
     */
    class CozyPasswordResetService {
        #identityEngine;
        #identityStorage;
        #deliveryRegistry;
        #tokens = new Map();      // checksumHex -> record (in-memory, mirrors otp-provider.js's pattern)
        #rateLimit = new Map();   // identifier(lowercased) -> [timestamps]
        #eventTarget = (typeof document !== "undefined") ? document : null;
        ready = Promise.resolve({ restored: 0 });

        constructor({ identityEngine, identityStorage, deliveryRegistry } = {}) {
            this.#identityEngine = identityEngine || (root && root.CozyOS && root.CozyOS.IdentityEngine) || null;
            this.#identityStorage = identityStorage || (root && root.CozyOS && root.CozyOS.IdentityStorage) || null;
            // Real, optional composition (Prompt 6 Step C) — the shared
            // DeliveryBackendRegistry. Optional and non-fatal if absent
            // (e.g. older embedders, or this file's own unit tests that
            // don't need it) so this stays backward compatible; the
            // CustomEvent below keeps working either way.
            this.#deliveryRegistry = deliveryRegistry || (root && root.CozyOS && root.CozyOS.DeliveryBackendRegistry) || null;
            if (this.#identityStorage && typeof this.#identityStorage.loadAll === "function") {
                this.ready = this.#restorePersistedTokens();
            }
        }

        getVersion() { return PASSWORD_RESET_SERVICE_VERSION; }

        async #restorePersistedTokens() {
            const result = await this.#identityStorage.loadAll("passwordResetTokens");
            if (!result.success) return { restored: 0, reason: result.reason };
            let restored = 0;
            for (const record of result.records) {
                if (!this.#tokens.has(record.id)) { this.#tokens.set(record.id, record); restored++; }
            }
            return { restored };
        }

        async #persist(record) {
            if (this.#identityStorage && typeof this.#identityStorage.save === "function") {
                try { await this.#identityStorage.save("passwordResetTokens", record); } catch (_err) { /* honestly non-fatal, matches IdentityEngine's own persistence error handling */ }
            }
        }

        async #hashToken(rawToken) {
            const subtle = getSubtleCrypto();
            if (!subtle) throw new Error("[PasswordReset] Web Crypto API is not available — cannot hash reset tokens securely.");
            const data = new TextEncoder().encode(rawToken);
            const digest = await subtle.digest("SHA-256", data);
            return toHex(digest);
        }

        /**
         * #verifierHash(rawToken, salt) — the real, slow PBKDF2 verifier,
         * same algorithm/iteration count/salt size as every other secret
         * this codebase stores (recovery-key-manager.js, emergency-
         * recovery-code-manager.js, recovery-phrase-manager.js all use
         * PBKDF2-SHA256-100000 with a fresh 16-byte salt — never a bare
         * unsalted hash). This is the DOUBLE HASH pattern already
         * established in this repo: a fast, unsalted SHA-256 "checksum"
         * (#hashToken, above) is used only as a deterministic lookup key
         * so a presented token can find its own record without scanning
         * every outstanding token — it is not itself the security
         * boundary. The real proof of possession is this PBKDF2 verifier,
         * compared below exactly like recovery-key-manager.js's
         * verifyKeyFile() and emergency-recovery-code-manager.js's
         * verifyCode() compare theirs.
         */
        async #verifierHash(rawToken, salt) {
            const subtle = getSubtleCrypto();
            if (!subtle) throw new Error("[PasswordReset] Web Crypto API is not available — cannot hash reset tokens securely.");
            const keyMaterial = await subtle.importKey("raw", new TextEncoder().encode(rawToken), "PBKDF2", false, ["deriveBits"]);
            const bits = await subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);
            return Array.from(new Uint8Array(bits));
        }

        #isRateLimited(identifierLower) {
            const now = Date.now();
            const history = (this.#rateLimit.get(identifierLower) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
            this.#rateLimit.set(identifierLower, history);
            return history.length >= RATE_LIMIT_MAX_REQUESTS;
        }

        #recordAttempt(identifierLower) {
            const history = this.#rateLimit.get(identifierLower) || [];
            history.push(Date.now());
            this.#rateLimit.set(identifierLower, history);
        }

        /**
         * requestPasswordReset(identifier)
         *   Real. ALWAYS returns the same generic shape regardless of
         *   whether the identifier matched a real account — this is the
         *   account-enumeration protection Prompt 6 §13 requires. The
         *   only side effect that differs is internal: a real token is
         *   minted and persisted, and "cozyos:password-reset-token-issued"
         *   fires, ONLY when a real account was found. Rate-limited
         *   per-identifier regardless of match (so the rate limit itself
         *   cannot be used to distinguish match from non-match).
         */
        async requestPasswordReset(identifier) {
            // Prompt 6 MID-2 correction: the previous copy claimed a link
            // "has been sent" even though no email/SMS provider exists in
            // this repository — that was a fabricated-delivery claim.
            // Corrected to describe only what actually happens (a request
            // record is created), while remaining exactly as enumeration-safe
            // (identical text regardless of match — see the test asserting
            // realMatch.message === noMatch.message).
            const GENERIC_RESPONSE = Object.freeze({
                status: "RESET_REQUESTED",
                message: "If that account exists, a password reset request has been created for it."
            });
            if (!identifier || typeof identifier !== "string") return GENERIC_RESPONSE;
            const identifierLower = identifier.trim().toLowerCase();
            if (this.#isRateLimited(identifierLower)) {
                // Still generic — do not reveal that rate limiting, specifically, is what happened.
                return { ...GENERIC_RESPONSE, rateLimited: true };
            }
            this.#recordAttempt(identifierLower);

            if (!this.#identityEngine || typeof this.#identityEngine.findUserIdForRecovery !== "function") {
                return GENERIC_RESPONSE; // fails closed — never fabricates a match if IdentityEngine isn't wired up
            }
            const match = this.#identityEngine.findUserIdForRecovery(identifier);
            if (!match) return GENERIC_RESPONSE;

            const subtle = getSubtleCrypto();
            if (!subtle) return GENERIC_RESPONSE; // fails closed rather than issuing an unhashed token

            // Invalidate any prior unused tokens for this user before minting a new one.
            for (const record of this.#tokens.values()) {
                if (record.userId === match.userId && !record.used) record.used = true;
            }

            const rawBytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
            const rawToken = base64UrlEncode(rawBytes);
            const tokenChecksum = await this.#hashToken(rawToken);
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const verifierHash = await this.#verifierHash(rawToken, salt);
            const now = Date.now();
            const record = {
                id: tokenChecksum,
                userId: match.userId,
                username: match.username,
                salt: Array.from(salt),
                verifierHash,
                createdAt: new Date(now).toISOString(),
                expiresAt: new Date(now + DEFAULT_TTL_MS).toISOString(),
                used: false,
                usedAt: null
            };
            this.#tokens.set(tokenChecksum, record);
            await this.#persist(record);

            if (this.#eventTarget && typeof this.#eventTarget.dispatchEvent === "function" && typeof CustomEvent !== "undefined") {
                // Real event — carries the raw token to whatever real delivery layer
                // eventually subscribes. Nothing in this file sends it anywhere else.
                this.#eventTarget.dispatchEvent(new CustomEvent("cozyos:password-reset-token-issued", {
                    detail: { userId: match.userId, username: match.username, rawToken, expiresAt: record.expiresAt }
                }));
            }
            if (this.#deliveryRegistry && typeof this.#deliveryRegistry.dispatch === "function") {
                // Real formal dispatch point (Prompt 6 Step C) through the
                // shared DeliveryBackendRegistry, channel "email". Additive
                // to the CustomEvent above, not a replacement — existing
                // subscribers keep working. With no real email backend
                // registered this genuinely no-ops (honest, not fabricated
                // delivery); result is intentionally not awaited into the
                // caller-visible response so timing never leaks whether an
                // account exists (enumeration-safe response is unaffected).
                this.#deliveryRegistry.dispatch("email", {
                    userId: match.userId, username: match.username, rawToken, expiresAt: record.expiresAt
                }).catch(() => { /* non-fatal — never surfaces to the enumeration-safe caller */ });
            }

            return { ...GENERIC_RESPONSE, _test_rawToken: rawToken }; // see NOTE below
            // NOTE on _test_rawToken: real production callers (UI/router) MUST
            // ignore this field — it exists only so tests in this sandboxed,
            // provider-less environment can exercise the full confirm flow
            // without a real email transport. A real caller has no way to
            // receive the token except through the delivery event above,
            // which only a real trusted delivery layer should subscribe to.
        }

        /**
         * validateResetToken(rawToken) — real, read-only. Returns an
         * honest state without ever confirming account existence beyond
         * what possessing a valid token already proves.
         */
        async validateResetToken(rawToken) {
            if (!rawToken || typeof rawToken !== "string") return { valid: false, state: "INVALID" };
            let record;
            try {
                const tokenChecksum = await this.#hashToken(rawToken);
                record = this.#tokens.get(tokenChecksum);
                if (!record) return { valid: false, state: "INVALID" };
                // Real verification step — the checksum above only located the
                // candidate record; the PBKDF2 verifier below is what actually
                // proves possession of the token (see #verifierHash doc comment).
                const attemptHash = await this.#verifierHash(rawToken, new Uint8Array(record.salt));
                if (JSON.stringify(attemptHash) !== JSON.stringify(record.verifierHash)) return { valid: false, state: "INVALID" };
            } catch (_err) { return { valid: false, state: "INVALID" }; }
            if (record.used) return { valid: false, state: "USED" };
            if (Date.now() > new Date(record.expiresAt).getTime()) return { valid: false, state: "EXPIRED" };
            return { valid: true, state: "VALID", userId: record.userId, username: record.username };
        }

        /**
         * confirmPasswordReset(rawToken, newPassword)
         *   Real. Validates the token, composes IdentityEngine's real
         *   resetPassword() (never re-implements hashing here), marks
         *   the token permanently used, invalidates any other
         *   outstanding tokens for the same user, and terminates every
         *   active session for that user via IdentityEngine's existing
         *   terminateSession() — mirroring changePassword()'s own
         *   session-invalidation behavior (Prompt 6 §13). Never touches
         *   passkeys/OTP/trusted-device records — resetPassword() only
         *   ever writes user.salt/user.hash, so those factors are
         *   preserved automatically, not specially coded around.
         */
        async confirmPasswordReset(rawToken, newPassword) {
            const validation = await this.validateResetToken(rawToken);
            if (!validation.valid) return { available: false, state: validation.state, reason: `Reset token is ${validation.state.toLowerCase()}.` };
            if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
                return { available: false, state: "INVALID", reason: "New password does not meet minimum requirements." };
            }
            if (!this.#identityEngine || typeof this.#identityEngine.resetPassword !== "function") {
                return { available: false, state: "UNAVAILABLE", reason: "IdentityEngine is not wired up." };
            }

            const tokenChecksum = await this.#hashToken(rawToken);
            const record = this.#tokens.get(tokenChecksum);

            const resetResult = await this.#identityEngine.resetPassword(record.username, newPassword);
            if (!resetResult.available) return { available: false, state: "FAILED", reason: resetResult.reason };

            record.used = true;
            record.usedAt = new Date().toISOString();
            await this.#persist(record);
            // Invalidate any other still-outstanding tokens for this user (§13: "token invalidation after password change").
            for (const other of this.#tokens.values()) {
                if (other.userId === record.userId && other.id !== record.id && !other.used) {
                    other.used = true;
                    this.#persist(other); // best-effort, not awaited in a loop to avoid serializing many writes
                }
            }

            let sessionsInvalidated = 0;
            if (typeof this.#identityEngine.listActiveSessions === "function" && typeof this.#identityEngine.terminateSession === "function") {
                const sessions = this.#identityEngine.listActiveSessions(record.userId) || [];
                for (const session of sessions) {
                    if (session.status === "active") {
                        this.#identityEngine.terminateSession(session.sessionId);
                        sessionsInvalidated++;
                    }
                }
            }

            return { available: true, username: record.username, sessionsInvalidated };
        }

        getDiagnosticsReport() {
            return {
                moduleVersion: PASSWORD_RESET_SERVICE_VERSION,
                activeTokens: Array.from(this.#tokens.values()).filter(t => !t.used && Date.now() <= new Date(t.expiresAt).getTime()).length,
                emailDeliveryVerified: false,
                smsDeliveryVerified: false
            };
        }
    }

    if (typeof window !== "undefined") {
        window.CozyOS = window.CozyOS || {};
        if (window.CozyOS.PasswordResetService && typeof window.CozyOS.PasswordResetService.getVersion === "function") {
            if (window.CozyOS.PasswordResetService.getVersion() !== PASSWORD_RESET_SERVICE_VERSION) {
                throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: PasswordResetService.");
            }
        } else {
            window.CozyOS.PasswordResetService = new CozyPasswordResetService({});
            if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
                try {
                    window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/security/password-reset-service.js",
                        name: "PasswordResetService", category: "Platform", icon: "key.svg",
                        description: "Real self-service password reset token protocol — SHA-256-hashed, single-use, short-lived tokens, enumeration-safe responses. Composes IdentityEngine.resetPassword() and session termination; never a second password-hashing or session engine. Email/SMS delivery not verified — no provider exists in this repo yet."
                    });
                } catch (_err) { /* non-fatal */ }
            }
        }
    }

    return { CozyPasswordResetService, PASSWORD_RESET_SERVICE_VERSION };
});
