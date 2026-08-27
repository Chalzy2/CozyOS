/**
 * CozyOS Phone Linkage Store Adapter
 * File Reference: core/security/phone-linkage-store-adapter.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Milestone: Prompt 9B (Persistent Phone Linkage)
 * Version: 1.0.0-ENTERPRISE
 *
 * WHY THIS FILE EXISTS (repo search performed first)
 *   CozyPhoneAccountLinkage (phone-account-linkage.js) requires a
 *   SYNCHRONOUS store: getRecord(userId), setRecord(userId, record),
 *   findUserIdByVerifiedPhone(phone) — called without `await` even
 *   though confirmLink()/revokePhone() are themselves async.
 *   CozyIdentityStorage (identity-storage.js) is this repo's real,
 *   already-production persistence layer for exactly this class of
 *   account-scoped security record (trustedDevices, recoveryPhrases,
 *   otpAccounts, passwordResetTokens all live there) — but it is
 *   IndexedDB-backed and therefore entirely Promise-based.
 *
 *   Passing IdentityStorage directly into CozyPhoneAccountLinkage
 *   would be a real security bug, not just a type mismatch:
 *   `store.getRecord(userId) || emptyRecord()` would always take the
 *   first branch (a Promise is truthy), and
 *   `findUserIdByVerifiedPhone(...)` would return a pending Promise
 *   instead of a real userId or null — silently defeating the
 *   cross-account phone-collision guard in confirmLink(). This file
 *   is the smallest correct seam: a synchronous in-memory cache,
 *   hydrated once from IdentityStorage's real "phoneLinkages" store,
 *   that satisfies the linkage class's real contract while
 *   IdentityStorage remains the actual authoritative, durable store.
 *
 * NOT A SECOND PERSISTENCE ENGINE
 *   Every write here is also written through to
 *   IdentityStorage.save("phoneLinkages", ...) in the background.
 *   The in-memory Map is a cache only, not a second source of truth —
 *   if the page closes before write-through completes, the record
 *   this session already treated as linked might not have reached
 *   IndexedDB yet, exactly the same "best-effort, non-fatal,
 *   in-memory-first" tradeoff identity-engine.js's own IdentityStorage
 *   calls already make and disclose. setRecord() is never awaited
 *   internally, because it must remain synchronous to satisfy the
 *   linkage class's real, unchanged contract.
 *
 * FAIL-CLOSED HYDRATION (never an apparently-empty Map during startup)
 *   getRecord/setRecord/findUserIdByVerifiedPhone all throw until
 *   initialize() has resolved. A caller that reaches this adapter
 *   before hydration finishes fails closed — buildFactorSnapshot()'s
 *   own safe() wrapper already treats a thrown error as "unavailable",
 *   never as "verified" — rather than this file ever exposing a
 *   startup-empty Map that would let an already-linked phone appear
 *   unlinked, or let a genuine collision go undetected. Once
 *   initialize() resolves it never re-hydrates; this adapter is meant
 *   to be constructed once per application runtime (Prompt 9B §8 — one
 *   authoritative production instance).
 *
 * HONEST SCOPE
 *   Locally verified against a real node:test suite using a
 *   test-controlled IdentityStorage-shaped fixture (same
 *   save/loadAll async contract, not the real IndexedDB — no browser
 *   exists in this sandbox). Real IndexedDB round-tripping itself
 *   inherits identity-storage.js's own disclosed "unverified by
 *   execution here" limitation; this file adds no new risk on top of
 *   that, since it only calls IdentityStorage's already-existing
 *   save()/loadAll() methods and never touches indexedDB directly.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        factory(root);
    }
})(typeof window !== "undefined" ? window : globalThis, function (root) {
    "use strict";

    const ADAPTER_VERSION = "1.0.0-ENTERPRISE";
    const STORE_NAME = "phoneLinkages";

    class PhoneLinkageStoreAdapter {
        #identityStorage;
        #records = new Map(); // userId -> record (record.id === userId, matches IdentityStorage's keyPath convention)
        #ready = false;
        #initPromise = null;

        constructor({ identityStorage } = {}) {
            if (!identityStorage || typeof identityStorage.loadAll !== "function" || typeof identityStorage.save !== "function") {
                throw new Error("[PhoneLinkageStoreAdapter] A real IdentityStorage instance (loadAll/save) is required.");
            }
            this.#identityStorage = identityStorage;
        }

        getVersion() { return ADAPTER_VERSION; }

        /** isReady() — real, current hydration state; never assumed true. */
        isReady() { return this.#ready; }

        /**
         * initialize() — real, idempotent (safe to call more than
         * once; returns the same in-flight/settled promise). Must be
         * awaited before this adapter is handed to
         * CozyPhoneAccountLinkage. Never marks #ready on failure — a
         * failed hydration stays failed-closed for this adapter's
         * lifetime; the caller must construct a fresh adapter (e.g.
         * on next reload) rather than this file silently retrying
         * into a partially-empty state.
         */
        initialize() {
            if (this.#initPromise) return this.#initPromise;
            this.#initPromise = (async () => {
                const result = await this.#identityStorage.loadAll(STORE_NAME);
                if (!result || result.success !== true) {
                    throw new Error("[PhoneLinkageStoreAdapter] Hydration failed: " + (result && result.reason ? result.reason : "unknown error"));
                }
                for (const record of result.records || []) {
                    if (record && record.id) this.#records.set(record.id, record);
                }
                this.#ready = true;
                return true;
            })();
            return this.#initPromise;
        }

        #requireReady() {
            if (!this.#ready) throw new Error("[PhoneLinkageStoreAdapter] Not initialized — call and await initialize() before use.");
        }

        /** getRecord(userId) — real, synchronous cache read; never fabricates a record that was never hydrated or set. */
        getRecord(userId) {
            this.#requireReady();
            return this.#records.has(userId) ? { ...this.#records.get(userId) } : null;
        }

        /**
         * setRecord(userId, record) — real, synchronous cache write +
         * background durable write-through. Collision detection is
         * NOT this file's job — CozyPhoneAccountLinkage already calls
         * findUserIdByVerifiedPhone() itself before ever calling
         * setRecord() (see phone-account-linkage.js confirmLink()) —
         * this method only ever stores what it is told, exactly like
         * the repo's own InMemoryPhoneLinkageStore reference adapter.
         */
        setRecord(userId, record) {
            this.#requireReady();
            const stored = { ...record, id: userId };
            this.#records.set(userId, stored);
            this.#identityStorage.save(STORE_NAME, stored).then((result) => {
                if (!result || result.success !== true) {
                    if (typeof console !== "undefined") {
                        console.warn("[PhoneLinkageStoreAdapter] Persist failed for user " + userId + ": " + (result && result.reason ? result.reason : "unknown error") + " — in-memory state remains correct for this session, but this write did not reach IndexedDB.");
                    }
                }
            }).catch((err) => {
                if (typeof console !== "undefined") {
                    console.warn("[PhoneLinkageStoreAdapter] Persist threw for user " + userId + ": " + (err && err.message ? err.message : err));
                }
            });
        }

        /**
         * findUserIdByVerifiedPhone(normalizedPhone) — real,
         * synchronous reverse scan (matches
         * InMemoryPhoneLinkageStore's own O(n) scan exactly; no
         * separate reverse-index Map to keep consistent, so there is
         * no stale-index class of bug to guard against).
         */
        findUserIdByVerifiedPhone(normalizedPhone) {
            this.#requireReady();
            for (const [userId, record] of this.#records.entries()) {
                if (record.phoneVerified && record.phoneNumber === normalizedPhone) return userId;
            }
            return null;
        }
    }

    const api = { PhoneLinkageStoreAdapter, getVersion: () => ADAPTER_VERSION };

    if (typeof window !== "undefined") {
        window.CozyOS = window.CozyOS || {};
        if (window.CozyOS.PhoneLinkageStoreAdapter && window.CozyOS.PhoneLinkageStoreAdapter.getVersion && window.CozyOS.PhoneLinkageStoreAdapter.getVersion() !== ADAPTER_VERSION) {
            throw new Error("[CozyOS] VERSION_CONFLICT: PhoneLinkageStoreAdapter.");
        }
        window.CozyOS.PhoneLinkageStoreAdapter = api;
        if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
            try {
                window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/security/phone-linkage-store-adapter.js",
                    name: "PhoneLinkageStoreAdapter", category: "Platform", icon: "database.svg",
                    description: "Synchronous in-memory cache over IdentityStorage's real \"phoneLinkages\" IndexedDB store — satisfies CozyPhoneAccountLinkage's synchronous store contract. Hydrates once via initialize(); fails closed (throws) on every method until hydration completes." });
            } catch (_err) { /* non-fatal */ }
        }
    }

    return api;
});
