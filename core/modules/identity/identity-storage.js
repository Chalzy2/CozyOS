/**
 * CozyOS Identity Storage
 * File Reference: core/modules/identity/identity-storage.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   A real, generic, reusable persistence layer over IndexedDB — not
 *   IdentityEngine-specific, so any coordinator needing durable
 *   browser-local storage can compose it rather than each implementing
 *   its own IndexedDB boilerplate (Rule 80/81). IdentityEngine composes
 *   this to persist users/trusted devices/recovery data; this file
 *   itself knows nothing about passwords, hashes, or authentication.
 *
 * ============================================================
 * HONEST, LOAD-BEARING LIMITATION — READ BEFORE TRUSTING THIS FILE
 * ============================================================
 *   This was written and syntax-checked in a sandboxed Node.js
 *   environment with no browser and no real `indexedDB` global — it
 *   cannot be executed here the way every other file in this project
 *   has been executed and verified. The API calls below follow the
 *   real, standard IndexedDB contract exactly (the same
 *   open/onupgradeneeded/transaction/objectStore pattern documented by
 *   MDN and used in every real browser), and the internal *logic* around
 *   it (save→load round-tripping, restore-before-render ordering) was
 *   separately verified against a faithful in-memory stand-in — but the
 *   real IndexedDB calls themselves are unverified by execution. This
 *   needs real confirmation on an actual device after deployment, and
 *   that gap is stated here rather than implied to be tested.
 *
 * SECURITY
 *   Never stores plaintext — only whatever the caller passes in, and
 *   every real caller in this codebase (IdentityEngine) only ever
 *   passes already-PBKDF2-hashed records, never a raw password or
 *   recovery answer. This file does not add its own encryption at rest
 *   — it relies on the browser's own IndexedDB origin isolation, the
 *   same real security boundary every browser-based app depends on.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const IDENTITY_STORAGE_VERSION = "1.0.0-ENTERPRISE";
    const DB_NAME = "cozyos-identity";
    const DB_VERSION = 1;
    const STORE_NAMES = Object.freeze(["users", "trustedDevices", "recoveryQuestions", "recoveryPhrases"]);

    class CozyIdentityStorage {
        #dbPromise = null;

        getVersion() { return IDENTITY_STORAGE_VERSION; }

        isAvailable() { return typeof indexedDB !== "undefined"; }

        #openDatabase() {
            if (this.#dbPromise) return this.#dbPromise;
            this.#dbPromise = new Promise((resolve, reject) => {
                if (!this.isAvailable()) { reject(new Error("IndexedDB is not available in this environment.")); return; }
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    for (const storeName of STORE_NAMES) {
                        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: "id" });
                    }
                };
                request.onsuccess = (event) => resolve(event.target.result);
                request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB."));
            });
            return this.#dbPromise;
        }

        async save(storeName, record) {
            if (!STORE_NAMES.includes(storeName)) return { success: false, reason: `Unknown store "${storeName}".` };
            if (!record || !record.id) return { success: false, reason: "record.id is required as the real storage key." };
            try {
                const db = await this.#openDatabase();
                return await new Promise((resolve) => {
                    const tx = db.transaction(storeName, "readwrite");
                    tx.objectStore(storeName).put(record);
                    tx.oncomplete = () => resolve({ success: true });
                    tx.onerror = () => resolve({ success: false, reason: tx.error ? tx.error.message : "Unknown transaction error." });
                });
            } catch (err) {
                return { success: false, reason: err.message };
            }
        }

        async loadAll(storeName) {
            if (!STORE_NAMES.includes(storeName)) return { success: false, reason: `Unknown store "${storeName}".`, records: [] };
            try {
                const db = await this.#openDatabase();
                return await new Promise((resolve) => {
                    const tx = db.transaction(storeName, "readonly");
                    const request = tx.objectStore(storeName).getAll();
                    request.onsuccess = () => resolve({ success: true, records: request.result || [] });
                    request.onerror = () => resolve({ success: false, reason: request.error ? request.error.message : "Unknown read error.", records: [] });
                });
            } catch (err) {
                return { success: false, reason: err.message, records: [] };
            }
        }

        async deleteRecord(storeName, id) {
            if (!STORE_NAMES.includes(storeName)) return { success: false, reason: `Unknown store "${storeName}".` };
            try {
                const db = await this.#openDatabase();
                return await new Promise((resolve) => {
                    const tx = db.transaction(storeName, "readwrite");
                    tx.objectStore(storeName).delete(id);
                    tx.oncomplete = () => resolve({ success: true });
                    tx.onerror = () => resolve({ success: false, reason: tx.error ? tx.error.message : "Unknown delete error." });
                });
            } catch (err) {
                return { success: false, reason: err.message };
            }
        }

        getDiagnosticsReport() {
            return { moduleVersion: IDENTITY_STORAGE_VERSION, available: this.isAvailable(), stores: [...STORE_NAMES] };
        }
    }

    if (window.CozyOS.IdentityStorage && typeof window.CozyOS.IdentityStorage.getVersion === "function") {
        const existingVersion = window.CozyOS.IdentityStorage.getVersion();
        if (existingVersion !== IDENTITY_STORAGE_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: IdentityStorage existing v${existingVersion} conflicts with load target v${IDENTITY_STORAGE_VERSION}.`);
        return;
    }

    window.CozyOS.IdentityStorage = new CozyIdentityStorage();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "IdentityStorage", category: "Platform", icon: "database.svg",
                description: "Real, generic IndexedDB persistence layer. Written to the standard IndexedDB API contract but not executable in this sandboxed environment — needs real verification on an actual browser/device. Never adds its own encryption; relies on browser origin isolation, and only ever persists whatever the caller passes (IdentityEngine only ever passes already-hashed records)."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
