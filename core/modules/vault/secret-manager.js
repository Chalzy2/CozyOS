/**
 * CozyOS — Vault Engine — Secret Manager (internal module)
 * File Reference: core/modules/vault/secret-manager.js
 *
 * RESPONSIBILITY
 *   Owns store/retrieve/delete/rotate for actual secret values. This is
 *   the only module that ever handles a plaintext secret value in
 *   memory, and only transiently — it's encrypted via Encryption
 *   Manager before being handed to a storage provider, and decrypted
 *   only on a real, explicit retrieve() call. Internal module — composed
 *   by the public façade.
 *
 * REUSE
 *   Never re-implements metadata tracking (Secret Registry's job) or
 *   encryption (Encryption Manager's job) — composes both.
 *
 * SECURITY RULE, ENFORCED STRUCTURALLY
 *   store()/retrieve() never log a plaintext value. The storage
 *   provider only ever receives/returns ciphertext — this module
 *   encrypts before calling provider.storeSecret() and decrypts only
 *   after provider.retrieveSecret() returns.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.__VaultInternals = window.CozyOS.__VaultInternals || {};

    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }

    class SecretManager {
        #registry; #encryption; #providers = new Map(); // providerId -> adapter
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { secretsStored: 0, secretsRetrieved: 0, secretsDeleted: 0, secretsRotated: 0, errorsHidden: 0, eventsEmitted: 0 };

        constructor(registry, encryption) {
            if (!registry || !encryption) throw new TypeError("[SecretManager] constructor(): registry and encryption instances are both required.");
            this.#registry = registry; this.#encryption = encryption;
        }

        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: this.#escapeHtml(msg) }));
            if (this.#auditLog.length > 2000) this.#auditLog.shift();
        }
        /** getAuditLog — msg is built only from secretId/keyId above, structurally never a value, since neither store() nor retrieve() ever passes one to #logAudit. */
        getAuditLog(predicate) { const list = this.#auditLog.map(e => ({ ...e })); return Object.freeze(predicate ? list.filter(predicate) : list); }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[SecretManager] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[SecretManager] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[SecretManager] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; for (const fn of Array.from(s)) { try { fn(p); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        /** registerProvider(providerId, adapter) — real, validates the required Vault Provider Interface. */
        registerProvider(providerId, adapter) {
            const required = ["initialize", "connect", "disconnect", "storeSecret", "retrieveSecret", "deleteSecret", "rotateSecret", "healthCheck", "getDiagnostics", "shutdown", "getMetadata"];
            const missing = required.filter(m => typeof adapter?.[m] !== "function");
            if (missing.length > 0) throw new TypeError(`[SecretManager] registerProvider(): adapter for "${providerId}" is missing required method(s): ${missing.join(", ")}.`);
            this.#providers.set(providerId, adapter);
        }
        hasProvider(providerId) { return this.#providers.has(providerId); }

        /**
         * store(secretId, value, meta)
         *   Real, end-to-end: registers metadata (Registry), generates a
         *   real encryption key (Encryption Manager) if one doesn't
         *   already exist for this secret, encrypts the real value, and
         *   hands only ciphertext to the storage provider. Never logs
         *   or returns the plaintext value.
         */
        async store(secretId, rawValue, rawMeta) {
            if (typeof rawValue !== "string" || !rawValue) throw new TypeError("[SecretManager] store(): a real, non-empty string value is required.");
            const meta = sanitizeObject(rawMeta);
            const providerId = meta.providerId;
            const provider = this.#providers.get(providerId);
            if (!provider) throw new Error(`[SecretManager] store(): unknown providerId "${providerId}" — register it first.`);

            if (!this.#registry.hasSecret(secretId)) this.#registry.registerSecret(secretId, meta);
            const keyId = `key_${secretId}`;
            if (!this.#encryption.hasKey(keyId)) await this.#encryption.generateKey(keyId);
            const encrypted = await this.#encryption.encrypt(keyId, rawValue);

            await provider.storeSecret(secretId, encrypted);
            this.#diagnostics.secretsStored++;
            this.#logAudit("SECRET_STORED", secretId); // never the value
            this.emit("secret-created", { secretId });
            return { secretId, stored: true };
        }

        /**
         * retrieve(secretId)
         *   Real, end-to-end: fetches ciphertext from the real storage
         *   provider, decrypts via the real key, returns the real
         *   plaintext to the caller only — never logged, never returned
         *   in any diagnostics/audit surface.
         */
        async retrieve(secretId) {
            const meta = this.#registry.getSecretMeta(secretId);
            if (!meta) return { available: false, reason: `Unknown secretId "${secretId}".` };
            if (meta.status === "DISABLED" || meta.status === "ARCHIVED") return { available: false, reason: `Secret "${secretId}" is ${meta.status}.` };
            const provider = this.#providers.get(meta.providerId);
            if (!provider) return { available: false, reason: `Provider "${meta.providerId}" is not registered.` };

            const encrypted = await provider.retrieveSecret(secretId);
            if (!encrypted) return { available: false, reason: "No value found in the storage provider for this secretId." };
            const keyId = `key_${secretId}`;
            const value = await this.#encryption.decrypt(keyId, encrypted);
            this.#diagnostics.secretsRetrieved++;
            this.#logAudit("SECRET_RETRIEVED", secretId); // never the value
            return { available: true, value };
        }

        /** delete(secretId) — real, removes both the provider's stored ciphertext and the registry's metadata. */
        async delete(secretId) {
            const meta = this.#registry.getSecretMeta(secretId);
            if (!meta) return false;
            const provider = this.#providers.get(meta.providerId);
            if (provider) await provider.deleteSecret(secretId);
            this.#registry.deleteSecretMeta(secretId);
            this.#diagnostics.secretsDeleted++;
            this.#logAudit("SECRET_DELETED", secretId);
            this.emit("secret-deleted", { secretId });
            return true;
        }

        /**
         * rotate(secretId, newValue)
         *   Real rotation — genuinely rotates the encryption key (new
         *   key version), re-encrypts the new real value under it, and
         *   bumps the registry's version. Never logs either the old or
         *   new value.
         */
        async rotate(secretId, newValue) {
            const meta = this.#registry.getSecretMeta(secretId);
            if (!meta) throw new Error(`[SecretManager] rotate(): unknown secretId "${secretId}".`);
            const provider = this.#providers.get(meta.providerId);
            if (!provider) throw new Error(`[SecretManager] rotate(): provider "${meta.providerId}" is not registered.`);

            this.#registry.setStatus(secretId, "ROTATING");
            const keyId = `key_${secretId}`;
            await this.#encryption.rotateKey(keyId);
            const encrypted = await this.#encryption.encrypt(keyId, newValue);
            await provider.rotateSecret(secretId, encrypted);
            this.#registry.bumpVersion(secretId);
            this.#registry.setStatus(secretId, "ACTIVE");
            this.#diagnostics.secretsRotated++;
            this.#logAudit("SECRET_ROTATED", secretId); // never the value
            this.emit("secret-rotated", { secretId });
            return { secretId, version: this.#registry.getSecretMeta(secretId).version };
        }

        getDiagnosticsReport() { return { ...this.#diagnostics, providersRegistered: this.#providers.size, auditLogSize: this.#auditLog.length }; }
    }

    window.CozyOS.__VaultInternals.SecretManager = SecretManager;
})();
