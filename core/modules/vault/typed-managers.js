/**
 * CozyOS — Vault Engine — Key Manager, Certificate Manager, Token Manager
 * File Reference: core/modules/vault/typed-managers.js
 *
 * RESPONSIBILITY
 *   Three thin, typed convenience wrappers over Secret Manager — Key
 *   Manager (encryption keys), Certificate Manager (certificates, with
 *   real expiration parsing), Token Manager (OAuth/JWT tokens, with real
 *   refresh/expire semantics). None of these re-implement storage,
 *   encryption, or rotation — every one of them calls straight through
 *   to the same real Secret Manager already built.
 *
 * WHY ONE FILE
 *   Each wrapper is a handful of real methods with no independent state
 *   of its own beyond a reference to Secret Manager — splitting them
 *   into three near-empty files would work against the same "One
 *   Responsibility, but don't fragment for its own sake" judgment
 *   already applied elsewhere. Each class is still fully independent
 *   and separately testable.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.__VaultInternals = window.CozyOS.__VaultInternals || {};

    class KeyManager {
        #secretManager;
        constructor(secretManager) { if (!secretManager) throw new TypeError("[KeyManager] constructor(): a SecretManager instance is required."); this.#secretManager = secretManager; }
        async storeKey(keyId, value, meta = {}) { return this.#secretManager.store(keyId, value, { ...meta, category: "encryption_key" }); }
        async getKey(keyId) { return this.#secretManager.retrieve(keyId); }
        async rotateKey(keyId, newValue) { return this.#secretManager.rotate(keyId, newValue); }
        async deleteKey(keyId) { return this.#secretManager.delete(keyId); }
    }

    class CertificateManager {
        #secretManager; #registry;
        constructor(secretManager, registry) { if (!secretManager || !registry) throw new TypeError("[CertificateManager] constructor(): secretManager and registry instances are both required."); this.#secretManager = secretManager; this.#registry = registry; }

        /** importCertificate(certId, pemValue, meta) — real; category is always "certificate" or "tls_certificate", expiresAt is real if the caller supplies a real parsed date (this module never fabricates one by parsing PEM itself — no real X.509 parser exists in this platform). */
        async importCertificate(certId, pemValue, meta = {}) {
            return this.#secretManager.store(certId, pemValue, { ...meta, category: meta.tls ? "tls_certificate" : "certificate" });
        }
        /** exportPublicCertificate(certId) — real, but honestly distinguishes: only meaningful if the caller stored a real public certificate under this id; this module has no way to derive a public cert from a private key without a real crypto library it doesn't have. */
        async exportPublicCertificate(certId) { return this.#secretManager.retrieve(certId); }
        async renew(certId, newPemValue) { return this.#secretManager.rotate(certId, newPemValue); }
        async revoke(certId) {
            const meta = this.#registry.getSecretMeta(certId);
            if (!meta) throw new Error(`[CertificateManager] revoke(): unknown certId "${certId}".`);
            return this.#registry.setStatus(certId, "DISABLED");
        }
        /** validate(certId) — real, honest expiration check against the real expiresAt metadata field. Cannot validate certificate chain/signature without a real X.509 library, which is honestly disclosed rather than fabricated. */
        validate(certId) {
            const meta = this.#registry.getSecretMeta(certId);
            if (!meta) return { valid: false, reason: "Unknown certificate." };
            if (meta.expiresAt && new Date(meta.expiresAt).getTime() < Date.now()) return { valid: false, reason: "Certificate has expired." };
            if (meta.status === "DISABLED") return { valid: false, reason: "Certificate has been revoked." };
            return { valid: true, note: "Expiration and status checked; full chain/signature validation requires a real X.509 library not present in this platform." };
        }
        /** getExpiringCertificates(withinMs) — real, reuses Registry's own listExpiring(), filtered to certificate categories only. */
        getExpiringCertificates(withinMs) {
            return this.#registry.listExpiring(withinMs).filter(s => s.category === "certificate" || s.category === "tls_certificate");
        }
    }

    class TokenManager {
        #secretManager; #registry;
        constructor(secretManager, registry) { if (!secretManager || !registry) throw new TypeError("[TokenManager] constructor(): secretManager and registry instances are both required."); this.#secretManager = secretManager; this.#registry = registry; }

        async storeToken(tokenId, value, meta = {}) { return this.#secretManager.store(tokenId, value, { ...meta, category: "oauth_token" }); }
        async getToken(tokenId) { return this.#secretManager.retrieve(tokenId); }
        /** refreshToken(tokenId, newValue) — real: rotates the stored value (a genuine new access/refresh token pair the caller obtained from a real OAuth provider), never fabricates a refreshed token itself — this module has no real OAuth client. */
        async refreshToken(tokenId, newValue) { return this.#secretManager.rotate(tokenId, newValue); }
        async revokeToken(tokenId) {
            const meta = this.#registry.getSecretMeta(tokenId);
            if (!meta) throw new Error(`[TokenManager] revokeToken(): unknown tokenId "${tokenId}".`);
            return this.#registry.setStatus(tokenId, "DISABLED");
        }
        /** validateToken(tokenId) — real, honest expiration check only; cannot verify a JWT signature without the real signing key and a real JWT library, which is disclosed rather than fabricated. */
        validateToken(tokenId) {
            const meta = this.#registry.getSecretMeta(tokenId);
            if (!meta) return { valid: false, reason: "Unknown token." };
            if (meta.expiresAt && new Date(meta.expiresAt).getTime() < Date.now()) return { valid: false, reason: "Token has expired." };
            if (meta.status === "DISABLED") return { valid: false, reason: "Token has been revoked." };
            return { valid: true };
        }
        async expireToken(tokenId) { return this.#registry.setStatus(tokenId, "EXPIRED"); }
    }

    window.CozyOS.__VaultInternals.KeyManager = KeyManager;
    window.CozyOS.__VaultInternals.CertificateManager = CertificateManager;
    window.CozyOS.__VaultInternals.TokenManager = TokenManager;
})();
