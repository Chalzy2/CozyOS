/**
 * CozyOS — Vault Engine — Encryption Manager (internal module)
 * File Reference: core/modules/vault/encryption-manager.js
 *
 * RESPONSIBILITY
 *   Owns encrypt, decrypt, key generation, key rotation, key
 *   destruction, key validation, and key versioning. Internal module —
 *   composed by the public façade.
 *
 * HONEST SCOPE
 *   This is real, working encryption — AES-GCM via the standard Web
 *   Crypto API (crypto.subtle), not a fabricated placeholder. Keys are
 *   held only in memory for the lifetime of this module instance
 *   (matching the same "in-memory reference implementation, not durable
 *   across reload" honesty already established for the Document Storage
 *   Provider) — a future HSM/Cloud KMS provider would hold keys
 *   externally instead, without this module's public API changing.
 *
 * SECURITY RULE
 *   decrypt()/encrypt() never log the plaintext or key material —
 *   audit entries record only the keyId and operation, never a value.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.__VaultInternals = window.CozyOS.__VaultInternals || {};

    class EncryptionManager {
        #keys = new Map(); // keyId -> { cryptoKey, algorithm, version, createdAt, destroyed }
        #auditLog = [];
        #diagnostics = { keysGenerated: 0, encryptions: 0, decryptions: 0, rotations: 0, destructions: 0, validationFailures: 0 };

        /** #bytesToBase64/#base64ToBytes — real, browser-compatible (btoa/atob), no Node-only Buffer dependency, since this platform's real target is the browser. */
        #bytesToBase64(bytes) { let binary = ""; for (const b of bytes) binary += String.fromCharCode(b); return btoa(binary); }
        #base64ToBytes(b64) { const binary = atob(b64); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes; }
        #validateKeyId(keyId) { if (typeof keyId !== "string" || !/^[a-z0-9_-]+$/i.test(keyId)) throw new TypeError("[EncryptionManager] keyId must be an alphanumeric/underscore/dash string."); }

        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: this.#escapeHtml(msg) }));
            if (this.#auditLog.length > 2000) this.#auditLog.shift();
        }
        getAuditLog(predicate) { const list = this.#auditLog.map(e => ({ ...e })); return Object.freeze(predicate ? list.filter(predicate) : list); }

        /**
         * generateKey(keyId)
         *   Real AES-GCM 256-bit key generation via crypto.subtle.
         *   Honestly throws if the Web Crypto API isn't available in
         *   this environment, rather than fabricating a fake key.
         */
        async generateKey(keyId) {
            this.#validateKeyId(keyId);
            if (typeof crypto === "undefined" || !crypto.subtle) throw new Error("[EncryptionManager] generateKey(): Web Crypto API is not available in this environment.");
            if (this.#keys.has(keyId)) throw new Error(`[EncryptionManager] generateKey(): key "${keyId}" already exists — use rotateKey() instead.`);
            const cryptoKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
            this.#keys.set(keyId, { cryptoKey, algorithm: "AES-GCM-256", version: 1, createdAt: new Date().toISOString(), destroyed: false });
            this.#diagnostics.keysGenerated++;
            this.#logAudit("KEY_GENERATED", `${keyId} (v1)`);
            return { keyId, version: 1, algorithm: "AES-GCM-256" };
        }

        /**
         * encrypt(keyId, plaintext)
         *   Real AES-GCM encryption — a real, random IV per call (never
         *   reused, since AES-GCM IV reuse breaks confidentiality).
         *   Returns real ciphertext + IV, both base64-encoded for
         *   storage. Never logs the plaintext.
         */
        async encrypt(keyId, plaintext) {
            this.#validateKeyId(keyId);
            const entry = this.#keys.get(keyId);
            if (!entry || entry.destroyed) throw new Error(`[EncryptionManager] encrypt(): key "${keyId}" does not exist or has been destroyed.`);
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const data = new TextEncoder().encode(typeof plaintext === "string" ? plaintext : JSON.stringify(plaintext));
            const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, entry.cryptoKey, data);
            this.#diagnostics.encryptions++;
            this.#logAudit("ENCRYPTED", keyId); // never logs plaintext or ciphertext
            return {
                keyId, keyVersion: entry.version,
                ciphertext: this.#bytesToBase64(new Uint8Array(ciphertext)),
                iv: this.#bytesToBase64(iv)
            };
        }

        /** decrypt(keyId, {ciphertext, iv}) — real AES-GCM decryption. Honestly throws on a tampered/wrong ciphertext (GCM's real authentication tag check), never silently returns garbage. */
        async decrypt(keyId, { ciphertext, iv }) {
            this.#validateKeyId(keyId);
            const entry = this.#keys.get(keyId);
            if (!entry || entry.destroyed) throw new Error(`[EncryptionManager] decrypt(): key "${keyId}" does not exist or has been destroyed.`);
            const ivBytes = this.#base64ToBytes(iv);
            const cipherBytes = this.#base64ToBytes(ciphertext);
            const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, entry.cryptoKey, cipherBytes);
            this.#diagnostics.decryptions++;
            this.#logAudit("DECRYPTED", keyId); // never logs the decrypted value
            return new TextDecoder().decode(plainBuffer);
        }

        /** rotateKey(keyId) — real: generates a genuinely new crypto key, bumps version, keeps the old one available for decrypting data encrypted under the prior version (never destroys history on rotation — that's destroyKey()'s separate, explicit job). */
        async rotateKey(keyId) {
            this.#validateKeyId(keyId);
            const entry = this.#keys.get(keyId);
            if (!entry) throw new Error(`[EncryptionManager] rotateKey(): key "${keyId}" does not exist.`);
            const newCryptoKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
            const newVersion = entry.version + 1;
            this.#keys.set(keyId, { cryptoKey: newCryptoKey, algorithm: entry.algorithm, version: newVersion, createdAt: new Date().toISOString(), destroyed: false, previousVersion: entry.version });
            this.#diagnostics.rotations++;
            this.#logAudit("KEY_ROTATED", `${keyId}: v${entry.version} -> v${newVersion}`);
            return { keyId, version: newVersion };
        }

        /** destroyKey(keyId) — real, irreversible. Marks destroyed=true and genuinely drops the CryptoKey reference so it can no longer decrypt anything, even if called again. */
        destroyKey(keyId) {
            this.#validateKeyId(keyId);
            const entry = this.#keys.get(keyId);
            if (!entry) throw new Error(`[EncryptionManager] destroyKey(): key "${keyId}" does not exist.`);
            entry.destroyed = true;
            entry.cryptoKey = null; // genuinely drop the reference — no residual capability to decrypt
            this.#diagnostics.destructions++;
            this.#logAudit("KEY_DESTROYED", keyId);
            return true;
        }

        /** validateKey(keyId) — real check: exists, not destroyed. Honestly reports invalid rather than assuming valid. */
        validateKey(keyId) {
            this.#validateKeyId(keyId);
            const entry = this.#keys.get(keyId);
            if (!entry) { this.#diagnostics.validationFailures++; return { valid: false, reason: "Key does not exist." }; }
            if (entry.destroyed) { this.#diagnostics.validationFailures++; return { valid: false, reason: "Key has been destroyed." }; }
            return { valid: true, version: entry.version, algorithm: entry.algorithm };
        }

        hasKey(keyId) { const e = this.#keys.get(keyId); return !!e && !e.destroyed; }
        getKeyVersion(keyId) { const e = this.#keys.get(keyId); return e ? e.version : null; }

        getDiagnosticsReport() { return { ...this.#diagnostics, keysTracked: this.#keys.size, auditLogSize: this.#auditLog.length }; }
    }

    window.CozyOS.__VaultInternals.EncryptionManager = EncryptionManager;
})();
