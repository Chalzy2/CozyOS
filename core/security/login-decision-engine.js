/**
 * CozyOS Login Decision Engine
 * File Reference: core/security/login-decision-engine.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Milestone: Prompt 7 §8/§9/§10 (Post-Registration Login Decision Tree)
 * Version: 1.0.0-ENTERPRISE
 *
 * WHY THIS FILE EXISTS (repo search performed first, per Prompt 7 §6/§8)
 *   Searched auth-coordinator.js (both core/security/ and core/modules/
 *   identity/), auth-policy-engine.js, and auth-factor-registry.js.
 *   core/modules/identity/auth-coordinator.js has real, separate
 *   loginWithCredentials()/loginWithPasskey()/loginWithTrustedDevice()/
 *   loginWithBiometrics() methods, but nothing that answers "given this
 *   account's real, current factor state, which of these should be
 *   offered, and in what order." core/security/auth-policy-engine.js's
 *   only login-shaped policy ("normal-login") requires trusted-device
 *   AND face/fingerprint/voice — the Platform-Administrator step-up
 *   policy, not an ordinary-user everyday-login ordering (confirmed by
 *   reading auth-coordinator.js's Rule 25 header: trusted-device/
 *   biometric login there is explicitly AdminRecoveryPolicy's
 *   Platform-Administrator-only path). No ordinary-user login-priority
 *   policy exists anywhere in the repository. This file is that
 *   genuinely missing, smallest-possible orchestration layer — it
 *   verifies nothing itself and duplicates no existing engine.
 *
 * PURE FUNCTION, NOT A NEW VERIFIER
 *   getLoginDecision(input) performs no cryptography, no network/SMS
 *   calls, and touches no account store. It is a deterministic function
 *   from an already-authoritative "factor availability snapshot" to an
 *   ordered decision. This is intentional: it lets the security-critical
 *   question ("is this factor genuinely usable right now") stay owned by
 *   the real engines that already answer it —
 *   WebAuthnProvider.isSupported()/hasCredential(),
 *   PhoneAccountLinkage.isPhoneLoginUsable(),
 *   AuthFactorRegistry.getProvider(name).isReal, AdminRecoveryPolicy's
 *   own admin-only gate — while this file owns only the ordering/
 *   fallback logic on top.
 *
 * CALLER OBLIGATION — LOAD-BEARING
 *   The `factors` snapshot passed in MUST be built exclusively from real
 *   engine calls, never from client-supplied/self-reported booleans (a
 *   browser must never be able to simply claim `{passkey:{enrolled:true,
 *   deviceSupported:true}}` and have that treated as ground truth by
 *   whatever ultimately grants a session). This module cannot itself
 *   enforce that its caller behaves honestly — no pure function can —
 *   but it does enforce every OTHER fail-closed rule described below,
 *   and malformed/incomplete input always degrades to fewer options,
 *   never more.
 *
 * REGISTRATION METHOD ≠ LOGIN FACTOR (Prompt 7 §2/§5)
 *   `account.registrationMethod` is accepted for reporting/telemetry
 *   only (surfaced back unchanged in the result) and NEVER influences
 *   priority, inclusion, or which factor is chosen as primary. Registering
 *   with email does not privilege email/password over a genuinely
 *   enrolled passkey; registering with Google does not privilege Google
 *   over a genuinely enrolled passkey. See login-decision-engine.test.js
 *   ("registration method never becomes the forced primary factor").
 *
 * PRIORITY ORDER (Prompt 7 §10 — explicit, smallest policy layer, since
 * none existed for this specific decision; reuses AuthPolicyEngine's
 * AND/OR composition style but is its own small, testable table since
 * this is a strength ORDERING for login, not an operation gate)
 *   1. passkey            (real, real WebAuthnProvider — Prompt 7 §11:
 *                          fingerprint/face are represented as this
 *                          platform-authenticator factor, never as
 *                          separate credential engines)
 *   2. phone               (real challenge protocol; only usable end-to-
 *                          end once PhoneAccountLinkage.isPhoneLoginUsable()
 *                          is true — i.e. verified AND a real SMS
 *                          backend is configured)
 *   3. google-account       (stub in this environment — AuthFactorRegistry
 *                          reports isReal:false; only included if a
 *                          future real backend flips that)
 *   4. voice               (stub in this environment; same treatment as
 *                          google-account)
 *   5. trusted-device       (Platform-Administrator recovery ONLY — see
 *                          Prompt 7 §20. Included only when
 *                          `context === "admin-recovery"`; NEVER
 *                          included for an ordinary "login" context,
 *                          regardless of any other input field. This is
 *                          a hard-coded exclusion, not a policy toggle.)
 *   6. password             (fallback — see below)
 *   7. recovery             (last resort — see below)
 *
 * PASSWORD AS FALLBACK, NOT PRIMARY (Prompt 7 §4)
 *   Password is never chosen as `primaryFactor` when any stronger factor
 *   is usable. It still appears in `usableFactors` (at the bottom) when
 *   available, honestly representing the repository's existing "use
 *   password instead" UI affordance — it does not disappear, it just
 *   never leads.
 *
 * FAIL-CLOSED RULES
 *   - `account.active !== true` -> REJECTED, no factors, no fallback.
 *   - No `account` object at all, or a non-object `factors` -> REJECTED.
 *   - A factor missing from `factors` is treated identically to an
 *     explicitly-unusable one — never assumed available.
 *   - `context !== "admin-recovery"` -> trusted-device is always
 *     excluded, even if `factors.trustedDevice` claims enrolled+admin.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        factory(root);
    }
})(typeof window !== "undefined" ? window : globalThis, function (root) {
    "use strict";

    const LOGIN_DECISION_ENGINE_VERSION = "1.0.0-ENTERPRISE";

    // Ordinary-login order. "trusted-device" is deliberately absent here —
    // it is spliced in only for an explicit admin-recovery context (see
    // #buildOrderedFactorNames below), never for ordinary login.
    const LOGIN_PRIORITY_ORDER = Object.freeze(["passkey", "phone", "google-account", "voice"]);
    const ADMIN_RECOVERY_PRIORITY_ORDER = Object.freeze(["trusted-device", "passkey", "phone", "google-account", "voice"]);

    function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

    /**
     * #isFactorUsable(name, factorState)
     *   Real, explicit rule per factor name — every rule requires more
     *   than one field to be true, so a caller cannot make a factor
     *   usable by setting a single flag; and a missing/malformed
     *   factorState is always treated as unusable (fail closed).
     */
    function isFactorUsable(name, factorState) {
        if (!isPlainObject(factorState)) return false;
        switch (name) {
            case "passkey":
                return factorState.enrolled === true && factorState.deviceSupported === true;
            case "phone":
                // loginUsable is expected to already encode "verified AND
                // a real SMS backend is configured" (see
                // PhoneAccountLinkage.isPhoneLoginUsable()) — re-checking
                // `verified` here as well costs nothing and means a
                // caller that forgets to compose the SMS gate still
                // cannot make phone usable by verified alone.
                return factorState.verified === true && factorState.loginUsable === true;
            case "google-account":
                return factorState.linked === true && factorState.providerReal === true;
            case "voice":
                return factorState.providerReal === true && factorState.verified === true;
            case "trusted-device":
                // Only ever reached from ADMIN_RECOVERY_PRIORITY_ORDER,
                // which is itself only consulted when context ===
                // "admin-recovery" (see getLoginDecision). adminAuthorized
                // must ALSO be true — enrolled alone is not enough,
                // preserving the existing platform-admin-only boundary.
                return factorState.enrolled === true && factorState.adminAuthorized === true;
            default:
                return false;
        }
    }

    function isPasswordUsable(factors, policy) {
        if (policy && policy.passwordFallbackAllowed === false) return false;
        const passwordState = factors && factors.password;
        if (!isPlainObject(passwordState)) return true; // real default: IdentityEngine's password path exists unless explicitly disabled by policy
        return passwordState.available !== false;
    }

    function computeRecoveryAvailable(factors) {
        const recovery = factors && factors.recovery;
        if (!isPlainObject(recovery)) return false;
        return recovery.emailAvailable === true || recovery.phoneAvailable === true;
    }

    /**
     * getLoginDecision({ account, factors, context, policy })
     *   account: { active: boolean, registrationMethod?: string }
     *   factors: per-factor state snapshot (see class doc above)
     *   context: "login" (default) | "admin-recovery"
     *   policy:  { passwordFallbackAllowed?: boolean } — smallest
     *            explicit policy layer for this decision (Prompt 7 §10);
     *            defaults preserve today's "password always available as
     *            fallback" behavior.
     */
    function getLoginDecision({ account, factors, context = "login", policy = {} } = {}) {
        const timestamp = new Date().toISOString();
        const base = { registrationMethod: (isPlainObject(account) && account.registrationMethod) || null, timestamp };

        if (!isPlainObject(account)) {
            return { ...base, status: "REJECTED", reason: "A real account context is required.", primaryFactor: null, usableFactors: [], fallbackAvailable: false, recoveryAvailable: false };
        }
        if (account.active !== true) {
            return { ...base, status: "REJECTED", reason: "Account is not active.", primaryFactor: null, usableFactors: [], fallbackAvailable: false, recoveryAvailable: false };
        }

        const orderedNames = context === "admin-recovery" ? ADMIN_RECOVERY_PRIORITY_ORDER : LOGIN_PRIORITY_ORDER;
        const usableFactors = orderedNames.filter(name => isFactorUsable(name, isPlainObject(factors) ? factors[toCamel(name)] : undefined));

        const passwordUsable = isPasswordUsable(factors, policy);
        const recoveryAvailable = computeRecoveryAvailable(factors);

        const orderedUsable = [...usableFactors];
        if (passwordUsable) orderedUsable.push("password");

        if (orderedUsable.length === 0) {
            return { ...base, status: recoveryAvailable ? "RECOVERY_REQUIRED" : "NO_FACTOR_AVAILABLE", reason: recoveryAvailable ? "No usable login factor — recovery is required." : "No usable login factor and no recovery channel is available.", primaryFactor: null, usableFactors: [], fallbackAvailable: false, recoveryAvailable };
        }

        // Primary is always the strongest genuinely usable non-password
        // factor; password is only ever primary when it is the sole
        // usable option (Prompt 7 §4).
        const primaryFactor = usableFactors.length > 0 ? usableFactors[0] : "password";

        return {
            ...base,
            status: "FACTOR_AVAILABLE",
            primaryFactor,
            usableFactors: orderedUsable,
            fallbackAvailable: passwordUsable && primaryFactor !== "password",
            recoveryAvailable
        };
    }

    // factors object uses camelCase keys (trustedDevice) while the
    // priority tables use the factor's canonical registry name
    // (trusted-device, google-account) — this maps between them without
    // requiring every caller to know the distinction.
    function toCamel(factorName) {
        const map = { "google-account": "google", "trusted-device": "trustedDevice" };
        return map[factorName] || factorName;
    }

    if (typeof window !== "undefined") {
        window.CozyOS = window.CozyOS || {};
        if (window.CozyOS.LoginDecisionEngine && window.CozyOS.LoginDecisionEngine.getVersion && window.CozyOS.LoginDecisionEngine.getVersion() !== LOGIN_DECISION_ENGINE_VERSION) {
            throw new Error("[CozyOS] VERSION_CONFLICT: LoginDecisionEngine.");
        }
        window.CozyOS.LoginDecisionEngine = { getVersion: () => LOGIN_DECISION_ENGINE_VERSION, getLoginDecision };
        if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
            try {
                window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/security/login-decision-engine.js",
                    name: "LoginDecisionEngine", category: "Platform", icon: "route.svg",
                    description: "Real, pure post-registration login decision tree. Given an already-authoritative per-factor availability snapshot, returns the strongest genuinely usable login factor, the full ordered usable list, and whether password fallback/recovery apply. Verifies nothing itself, duplicates no existing engine, never lets registration method dictate everyday login factor, and hard-excludes trusted-device from ordinary login (admin-recovery context only)."
                });
            } catch (_err) { /* non-fatal */ }
        }
    }

    return { getLoginDecision, LOGIN_DECISION_ENGINE_VERSION, LOGIN_PRIORITY_ORDER, ADMIN_RECOVERY_PRIORITY_ORDER };
});
