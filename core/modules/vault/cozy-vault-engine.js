/**
 * CozyOS — Vault Engine (public façade)
 * File Reference: core/modules/vault/cozy-vault-engine.js
 * Layer: Platform Service (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 25 — CANONICAL OWNERSHIP DECLARATION
 * ═══════════════════════════════════════════════════════════════════════
 *   Canonical Owner
 *   This engine is the authoritative owner of:
 *     ✓ Secrets, Encryption Keys, Certificates, Tokens, Credentials
 *     ✓ Encryption (real AES-GCM via Web Crypto), Key Rotation
 *     ✓ Secret Registry, Health, Provider Registry (for Vault's own
 *       storage providers — Memory/Encrypted File/HSM/Cloud KMS)
 *
 *   Does NOT Own
 *     ✗ Users, Roles, Permissions, Authentication — Identity's domain.
 *     ✗ Organization, Company, Branch, Division, Department, Team —
 *       Company Engine's domain.
 *     ✗ Provider connectivity (M-Pesa/PayPal/Visa/etc.) — Payment
 *       Provider Engine's domain; that engine REQUESTS secrets from
 *       Vault, it never stores them itself.
 *     ✗ Documents — Document Engine's domain; that engine may request
 *       encryption from Vault, but Vault never stores document content.
 *     ✗ Transactions, Ledger, Accounting, Wallet — Financial Platform's
 *       domain.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * RESPONSIBILITY
 *   Every engine that needs an API key, certificate, encryption key,
 *   token, or credential requests it through this façade — never storing
 *   it internally. This file is a pure delegation façade over seven
 *   internal modules (Secret Registry, Encryption Manager, Secret
 *   Manager, Key Manager, Certificate Manager, Token Manager, Rotation
 *   Manager, Health Monitor), each independently testable.
 *
 * SECURITY RULES, ENFORCED STRUCTURALLY, NOT JUST BY POLICY
 *   - Secrets are never logged: every internal module's audit log is
 *     built only from secretId/category/status — verified directly by
 *     test, not just asserted here.
 *   - Secrets are never exported in plain text: exportSnapshot() below
 *     exports only Registry's real metadata, never a value — there is
 *     no code path in this façade that could include one.
 *   - Diagnostics never reveal secret values: getDiagnosticsReport()
 *     aggregates only counters, never touches Secret Manager's
 *     retrieve().
 *
 * HONEST ENGINEERING
 *   Only "memory" is a genuinely complete storage provider — real
 *   encryption via Web Crypto, but held in memory only, not durable
 *   across reload (disclosed, matching the Document Storage Provider's
 *   precedent). HSM/Cloud KMS/Azure/AWS/GCP/HashiCorp providers are not
 *   built — no real infrastructure for any of them exists in this
 *   platform, and building disclosed stubs for all of them without a
 *   real, concrete integration target would be speculative (Rule 15).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VAULT_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    function sanitizeObject(input) { if (!input || typeof input !== "object") return {}; const clean = {}; for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; } return clean; }

    const internals = window.CozyOS.__VaultInternals;
    if (!internals || !internals.SecretRegistry || !internals.EncryptionManager || !internals.SecretManager || !internals.KeyManager || !internals.CertificateManager || !internals.TokenManager || !internals.RotationManager || !internals.VaultHealthMonitor) {
        throw new Error("[VaultEngine] Required internal modules are not loaded. Load secret-registry.js, encryption-manager.js, secret-manager.js, typed-managers.js, and rotation-and-health.js before this file.");
    }

    class CozyVaultEngine {
        #registry; #encryption; #secretManager; #keyManager; #certManager; #tokenManager; #rotationManager; #health;
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();

        constructor() {
            this.#registry = new internals.SecretRegistry();
            this.#encryption = new internals.EncryptionManager();
            this.#secretManager = new internals.SecretManager(this.#registry, this.#encryption);
            this.#keyManager = new internals.KeyManager(this.#secretManager);
            this.#certManager = new internals.CertificateManager(this.#secretManager, this.#registry);
            this.#tokenManager = new internals.TokenManager(this.#secretManager, this.#registry);
            this.#rotationManager = new internals.RotationManager(this.#secretManager, this.#registry);
            this.#health = new internals.VaultHealthMonitor(this.#registry, this.#encryption);
        }

        getVersion() { return VAULT_VERSION; }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #logAudit(action, msg) { this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: this.#escapeHtml(msg) })); if (this.#auditLog.length > 2000) this.#auditLog.shift(); }
        /** getAuditLog — structurally cannot contain a secret value; msg is only ever built from secretId/action names above, across every internal module. */
        getAuditLog(predicate) { const list = this.#auditLog.map(e => ({ ...e })); return Object.freeze(predicate ? list.filter(predicate) : list); }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[VaultEngine] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[VaultEngine] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[VaultEngine] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { const s = this.#listeners.get(e); if (!s || s.size === 0) return false; for (const fn of Array.from(s)) { try { fn(p); } catch (_err) { /* listener errors never break the engine */ } } return true; }

        // ---- Provider Registry (for Vault's own storage providers) ----
        registerProvider(providerId, adapter) { this.#secretManager.registerProvider(providerId, adapter); this.#logAudit("PROVIDER_REGISTERED", providerId); }
        hasProvider(providerId) { return this.#secretManager.hasProvider(providerId); }

        // ---- Secret Manager (delegated) — the only methods that ever touch a real value ----
        async storeSecret(secretId, value, meta) { const r = await this.#secretManager.store(secretId, value, sanitizeObject(meta)); this.#logAudit("SECRET_STORED", secretId); this.emit("secret-created", { secretId }); return r; }
        async retrieveSecret(secretId) { return this.#secretManager.retrieve(secretId); }
        async deleteSecret(secretId) { const r = await this.#secretManager.delete(secretId); this.#logAudit("SECRET_DELETED", secretId); this.emit("secret-deleted", { secretId }); return r; }
        async rotateSecret(secretId, newValue) { const r = await this.#secretManager.rotate(secretId, newValue); this.#logAudit("SECRET_ROTATED", secretId); this.emit("secret-rotated", { secretId }); return r; }

        // ---- Secret Registry (delegated) — metadata only ----
        getSecretMeta(secretId) { return this.#registry.getSecretMeta(secretId); }
        listSecrets(filter) { return this.#registry.listSecrets(filter); }
        listExpiring(withinMs) { return this.#registry.listExpiring(withinMs); }

        // ---- Encryption Manager (delegated) ----
        async generateKey(keyId) { const r = await this.#encryption.generateKey(keyId); this.emit("key-generated", { keyId }); return r; }
        async encrypt(keyId, plaintext) { return this.#encryption.encrypt(keyId, plaintext); }
        async decrypt(keyId, payload) { return this.#encryption.decrypt(keyId, payload); }
        validateKey(keyId) { return this.#encryption.validateKey(keyId); }
        destroyKey(keyId) { return this.#encryption.destroyKey(keyId); }

        // ---- Key/Certificate/Token Managers (delegated) ----
        async storeKey(keyId, value, meta) { return this.#keyManager.storeKey(keyId, value, sanitizeObject(meta)); }
        async getKey(keyId) { return this.#keyManager.getKey(keyId); }
        async importCertificate(certId, pem, meta) { const r = await this.#certManager.importCertificate(certId, pem, sanitizeObject(meta)); this.emit("certificate-renewed", { certId, action: "imported" }); return r; }
        async exportPublicCertificate(certId) { return this.#certManager.exportPublicCertificate(certId); }
        async renewCertificate(certId, pem) { const r = await this.#certManager.renew(certId, pem); this.emit("certificate-renewed", { certId }); return r; }
        async revokeCertificate(certId) { return this.#certManager.revoke(certId); }
        validateCertificate(certId) { return this.#certManager.validate(certId); }
        getExpiringCertificates(withinMs) { return this.#certManager.getExpiringCertificates(withinMs); }
        async storeToken(tokenId, value, meta) { return this.#tokenManager.storeToken(tokenId, value, sanitizeObject(meta)); }
        async getToken(tokenId) { return this.#tokenManager.getToken(tokenId); }
        async refreshToken(tokenId, newValue) { const r = await this.#tokenManager.refreshToken(tokenId, newValue); this.emit("token-refreshed", { tokenId }); return r; }
        async revokeToken(tokenId) { return this.#tokenManager.revokeToken(tokenId); }
        validateToken(tokenId) { return this.#tokenManager.validateToken(tokenId); }

        // ---- Rotation Manager (delegated) ----
        async rotateManual(secretId, newValue) { return this.#rotationManager.rotateManual(secretId, newValue); }
        async rotateEmergency(secretId, newValue) { return this.#rotationManager.rotateEmergency(secretId, newValue); }
        scheduleRotation(secretId, intervalMs, valueGenerator) { return this.#rotationManager.scheduleRotation(secretId, intervalMs, valueGenerator); }
        cancelRotationSchedule(secretId) { return this.#rotationManager.cancelSchedule(secretId); }
        getRotationHistory(secretId) { return this.#rotationManager.getRotationHistory(secretId); }

        // ---- Health Monitor (delegated) ----
        getHealthReport() { return this.#health.getHealthReport(); }

        /** getDiagnosticsReport() — real aggregation of every internal module's own counters. Never touches retrieve() — a secret value can never appear here. */
        getDiagnosticsReport() {
            return {
                pluginVersion: VAULT_VERSION,
                registry: this.#registry.getDiagnosticsReport(),
                encryption: this.#encryption.getDiagnosticsReport(),
                secretManager: this.#secretManager.getDiagnosticsReport(),
                rotation: this.#rotationManager.getDiagnosticsReport(),
                health: this.#health.getDiagnosticsReport(),
                auditLogSize: this.#auditLog.length
            };
        }

        /**
         * exportSnapshot() — real, but structurally cannot contain a
         * secret value: only Registry's real metadata is exported
         * (secretId/category/provider/status/timestamps), matching the
         * explicit security rule "snapshot exports must contain only
         * metadata."
         */
        exportSnapshot() {
            return { version: VAULT_VERSION, exportedAt: new Date().toISOString(), secrets: this.#registry.listSecrets({}) };
        }
        /**
         * importSnapshot(snapshot, {mergeStrategy})
         *   Real, but honestly limited: restores secret *metadata*
         *   status only (never a value — this snapshot never contained
         *   one). A secret whose value was deleted cannot be
         *   "un-deleted" by this import; it can only re-align status
         *   (e.g. re-marking something ACTIVE vs DISABLED) for a secret
         *   whose real value is still present via its registered
         *   provider.
         */
        importSnapshot(snapshot, { mergeStrategy = "merge" } = {}) {
            if (!snapshot || !Array.isArray(snapshot.secrets)) throw new TypeError("[VaultEngine] importSnapshot(): snapshot.secrets array is required.");
            if (mergeStrategy !== "merge" && mergeStrategy !== "replace") throw new TypeError('[VaultEngine] importSnapshot(): mergeStrategy must be "merge" or "replace".');
            let restored = 0, skipped = 0;
            for (const s of snapshot.secrets) {
                if (!s?.secretId || !this.#registry.hasSecret(s.secretId)) { skipped++; continue; }
                if (s.status) { this.#registry.setStatus(s.secretId, s.status); restored++; }
            }
            this.#logAudit("SNAPSHOT_IMPORTED", `${restored} restored, ${skipped} skipped (no matching registered secret), strategy=${mergeStrategy}.`);
            return { restored, skipped, mergeStrategy };
        }
        isSnapshotCompatible(snapshot) { return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === VAULT_VERSION.split(".")[0]); }
        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(VAULT_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
    }

    if (window.CozyOS.Vault && typeof window.CozyOS.Vault.getVersion === "function") {
        const existingVersion = window.CozyOS.Vault.getVersion();
        if (existingVersion !== VAULT_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: Vault existing v${existingVersion} conflicts with load target v${VAULT_VERSION}.`);
        return;
    }

    const engineInstance = new CozyVaultEngine();
    window.CozyOS.Vault = engineInstance;

    // Real, disclosed provider registration — memory is genuinely complete.
    const providers = window.CozyOS.__VaultProviders || {};
    if (providers.memory) {
        const memoryAdapter = providers.memory();
        try { engineInstance.registerProvider("memory", memoryAdapter); memoryAdapter.connect(); } catch (_err) { /* non-fatal at load time */ }
    }

    const manifest = {
        id: "vault",
        name: "CozyOS Vault Engine",
        version: VAULT_VERSION,
        description: "Real secure secret management — encryption (Web Crypto AES-GCM), key/certificate/token lifecycle, rotation, health. Never stores users/documents/transactions/provider connectivity (other engines' domains) and never logs or exports a secret value in plain text.",
        dependencies: { required: [], optional: ["window.CozyOS.Kernel"] }
    };

    let kernelRegistrationAttempted = false;
    async function registerWithKernel() {
        if (kernelRegistrationAttempted) return;
        const bootstrap = window.CozyOS?.Kernel?.Bootstrap;
        if (!bootstrap) return;
        kernelRegistrationAttempted = true;
        try {
            await bootstrap.registerService({ name: "Vault", version: VAULT_VERSION, apiVersion: "1.0.0", mandatory: false, dependencies: [] });
            bootstrap.initializeService("Vault");
            await bootstrap.verifyService("Vault", async () => window.CozyOS.Vault.getVersion() === VAULT_VERSION);
            bootstrap.startService("Vault");
        } catch (_err) { /* non-fatal — Vault remains fully functional standalone even if Kernel registration fails */ }
    }
    registerWithKernel();
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
        document.addEventListener("cozyos:kernel-bridge-ready", registerWithKernel, { once: true });
    }

    let registrationBound = false;
    function initRegistration() {
        if (registrationBound) return;
        registrationBound = true;
        if (window.CozyOS && window.CozyOS.PluginManager) {
            window.CozyOS.PluginManager.register(manifest, engineInstance);
        } else {
            if (!window.CozyOS.KernelPlugins) window.CozyOS.KernelPlugins = new Map();
            window.CozyOS.KernelPlugins.set(manifest.id, { name: manifest.name, version: manifest.version, handler: engineInstance });
        }
    }
    initRegistration();
    if (typeof window !== "undefined") {
        window.addEventListener("kernel:ready", initRegistration, { once: true });
        window.addEventListener("DOMContentLoaded", initRegistration, { once: true });
    }
})();
