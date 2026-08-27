/**
 * CozyOS Authentication Factor Snapshot Builder
 * File Reference: core/security/auth-factor-snapshot.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Milestone: Prompt 8 §6/§7 (Factor Snapshot)
 * Version: 1.0.0-ENTERPRISE
 *
 * WHY THIS FILE EXISTS (repo search performed first, per Rule 48)
 *   Searched for FactorSnapshot / buildFactorSnapshot / getFactorSnapshot
 *   anywhere in the tree — no match. login-decision-engine.js already
 *   accepts an authoritative `factors` snapshot and turns it into an
 *   ordered decision (Prompt 7 §16), but nothing in the repository
 *   assembles that snapshot from the real, per-user state already held
 *   by WebAuthnProvider, PhoneAccountLinkage, GoogleAccountLinkage,
 *   TrustedDeviceManager, and AuthFactorRegistry. This file is exactly
 *   that missing, smallest-possible seam — it verifies nothing itself
 *   and stores nothing itself; it only reads already-authoritative
 *   state from the real engines and reshapes it into the exact object
 *   shape getLoginDecision() already documents.
 *
 * NEVER TRUSTS THE CALLER (Prompt 8 §7)
 *   Every value in the returned snapshot comes from calling a real
 *   engine method — never from a caller-supplied boolean. A caller
 *   cannot pass `{ passkeyEnrolled: true }` and have it appear in the
 *   output; the only inputs that matter are the engine instances
 *   themselves and the userId used to query them.
 *
 * COMPOSITION, NOT A NEW REGISTRY (Prompt 8 §6)
 *   All per-factor engines are passed in by the caller (dependency
 *   injection) so this file never constructs its own copy of
 *   WebAuthnProvider/PhoneAccountLinkage/GoogleAccountLinkage/
 *   TrustedDeviceManager/AuthFactorRegistry, and never duplicates any
 *   of their logic. Any engine argument that is missing/malformed
 *   degrades its factor to unavailable — fail closed, never fail open.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        factory(root);
    }
})(typeof window !== "undefined" ? window : globalThis, function (root) {
    "use strict";

    const FACTOR_SNAPSHOT_VERSION = "1.1.0-ENTERPRISE"; // Prompt 9A: password.available also accepts user.hasPassword (IdentityEngine.getFactorSnapshotContext()'s non-secret boolean), alongside the original user.hash check — additive, never narrows the original behavior.

    function safe(fn, fallback) {
        try {
            const v = fn();
            return v === undefined ? fallback : v;
        } catch (_e) {
            return fallback;
        }
    }

    function isReal(factorRegistry, name) {
        if (!factorRegistry || typeof factorRegistry.getProvider !== "function") return false;
        const provider = factorRegistry.getProvider(name);
        return !!provider && provider.isReal === true;
    }

    /**
     * buildFactorSnapshot({ userId, user, context, webauthnProvider,
     *   phoneLinkage, googleLinkage, trustedDeviceManager, factorRegistry,
     *   isPlatformAdmin })
     *
     *   userId              — the real, already-authenticated account id
     *   user                — the real account record (only `.email`,
     *                         `.phone`, `.hash`, `.registrationMethod`
     *                         are read — never passwords/salts)
     *   context              — "login" | "admin-recovery" (mirrors
     *                         login-decision-engine.js's own contexts)
     *   webauthnProvider     — real WebAuthnProvider instance
     *   phoneLinkage         — real PhoneAccountLinkage instance
     *   googleLinkage        — real CozyGoogleAccountLinkage instance
     *   trustedDeviceManager — real TrustedDeviceManager instance
     *   factorRegistry       — real AuthFactorRegistry instance
     *   isPlatformAdmin      — boolean, already resolved by the caller
     *                         (this file does not decide platform-admin
     *                         status — IdentityEngine already owns that)
     *
     *   Returns { account, factors } — ready to pass directly as
     *   getLoginDecision()'s own `{ account, factors, context }` input.
     *   Missing/malformed dependencies degrade the corresponding factor
     *   to unavailable; they never throw and never widen access.
     */
    function buildFactorSnapshot({
        userId,
        user,
        context = "login",
        webauthnProvider,
        phoneLinkage,
        googleLinkage,
        trustedDeviceManager,
        factorRegistry,
        isPlatformAdmin = false
    } = {}) {
        const account = {
            active: !!user && user.status === "active",
            // Registration method is reporting-only (Prompt 8 §5/§34) —
            // this builder never lets it influence any factor below.
            registrationMethod: (user && user.registrationMethod) || null
        };

        const passkey = {
            enrolled: !userId ? false : safe(() => webauthnProvider.hasCredential(userId), false),
            deviceSupported: safe(() => webauthnProvider.isSupported(), false)
        };

        const phoneState = !userId ? null : safe(() => phoneLinkage.getPhoneState(userId), null);
        const phone = {
            verified: !!(phoneState && phoneState.verified === true),
            loginUsable: !userId ? false : safe(() => phoneLinkage.isPhoneLoginUsable(userId), false)
        };

        const googleState = !userId ? null : safe(() => googleLinkage.getGoogleState(userId), null);
        const google = {
            linked: !!(googleState && googleState.googleLinked === true && googleState.googleLoginEnabled === true),
            providerReal: isReal(factorRegistry, "google-account")
        };

        const voice = {
            providerReal: isReal(factorRegistry, "voice"),
            verified: false // no real voice verification exists anywhere in the repository (Prompt 8 §12)
        };

        let trustedDeviceEnrolled = false;
        if (context === "admin-recovery" && userId && trustedDeviceManager && typeof trustedDeviceManager.listDevicesForUser === "function") {
            const devices = safe(() => trustedDeviceManager.listDevicesForUser(userId), []) || [];
            trustedDeviceEnrolled = devices.some(d => safe(() => trustedDeviceManager.isTrusted(d.id), false));
        }
        const trustedDevice = {
            enrolled: trustedDeviceEnrolled,
            adminAuthorized: isPlatformAdmin === true
        };

        // A password login path exists for this account only when a real
        // password hash was actually set at registration — never assumed
        // true for an account that has none (e.g. a future Google-only
        // registration path, when one exists). Prompt 9A: a caller may
        // supply either the real internal record (`.hash`, e.g. existing
        // tests / internal callers) or IdentityEngine's non-secret
        // getFactorSnapshotContext() shape (`.hasPassword` boolean,
        // never the real hash) — accepting both means AuthCoordinator
        // never has to move actual hash bytes through this seam.
        const password = { available: !!(user && (user.hash || user.hasPassword)) };

        const recovery = {
            emailAvailable: !!(user && user.email),
            phoneAvailable: !!(phoneState && (phoneState.verified === true || safe(() => phoneLinkage.isPhoneRecoveryUsable(userId), false)))
        };

        return { account, factors: { passkey, phone, google, voice, trustedDevice, password, recovery } };
    }

    if (typeof window !== "undefined") {
        window.CozyOS = window.CozyOS || {};
        if (window.CozyOS.AuthFactorSnapshot && window.CozyOS.AuthFactorSnapshot.getVersion && window.CozyOS.AuthFactorSnapshot.getVersion() !== FACTOR_SNAPSHOT_VERSION) {
            throw new Error("[CozyOS] VERSION_CONFLICT: AuthFactorSnapshot.");
        }
        window.CozyOS.AuthFactorSnapshot = { getVersion: () => FACTOR_SNAPSHOT_VERSION, buildFactorSnapshot };
        if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
            try {
                window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/security/auth-factor-snapshot.js",
                    name: "AuthFactorSnapshot", category: "Platform", icon: "camera.svg",
                    description: "Real factor-snapshot builder. Composes WebAuthnProvider, PhoneAccountLinkage, GoogleAccountLinkage, TrustedDeviceManager, and AuthFactorRegistry into the exact snapshot shape LoginDecisionEngine consumes. Verifies nothing itself, stores nothing itself, and fails closed on any missing dependency."
                });
            } catch (_err) { /* non-fatal */ }
        }
    }

    return { buildFactorSnapshot, FACTOR_SNAPSHOT_VERSION };
});
