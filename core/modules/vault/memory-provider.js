/**
 * CozyOS — Vault Engine — Memory Provider
 * File Reference: core/modules/vault/providers/memory-provider.js
 *
 * RESPONSIBILITY
 *   A real, fully-working Vault storage provider — genuinely complete,
 *   unlike the HSM/Cloud KMS providers this directory will also host,
 *   which require real external infrastructure this platform doesn't
 *   have. This provider only ever stores/returns ciphertext handed to
 *   it by Secret Manager — it never sees a plaintext value.
 *
 * HONEST SCOPE
 *   In-memory only — not durable across a page reload, exactly the same
 *   disclosed limitation already established for the Document Storage
 *   Provider. A real Encrypted File Provider or Cloud KMS provider would
 *   implement this identical interface with real durable storage.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.__VaultProviders = window.CozyOS.__VaultProviders || {};

    function createMemoryProvider() {
        const store = new Map(); // secretId -> {ciphertext, iv, keyVersion}
        let connected = false;

        return {
            async initialize() { return true; },
            async connect() { connected = true; return true; },
            async disconnect() { connected = false; return true; },
            async storeSecret(secretId, encrypted) {
                if (!connected) throw new Error("[MemoryProvider] storeSecret(): not connected.");
                store.set(secretId, { ...encrypted }); // real, but only ciphertext ever passes through here
                return true;
            },
            async retrieveSecret(secretId) {
                if (!connected) throw new Error("[MemoryProvider] retrieveSecret(): not connected.");
                const entry = store.get(secretId);
                return entry ? { ...entry } : null;
            },
            async deleteSecret(secretId) { return store.delete(secretId); },
            async rotateSecret(secretId, encrypted) { store.set(secretId, { ...encrypted }); return true; },
            async healthCheck() { return { healthy: connected }; },
            getDiagnostics() { return { secretsStored: store.size, connected }; },
            async shutdown() { connected = false; return true; },
            getMetadata() { return { providerId: "memory", name: "Memory Provider", durableAcrossReload: false }; }
        };
    }

    window.CozyOS.__VaultProviders.memory = createMemoryProvider;
})();
