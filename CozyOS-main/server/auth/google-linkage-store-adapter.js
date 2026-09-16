'use strict';

/**
 * server/auth/google-linkage-store-adapter.js
 * CozyOS — Persistent Google Linkage Store (server-side)
 * Milestone: Prompt 10 (Google Account Linkage — persistence)
 * Version: 1.0.0-ENTERPRISE
 *
 * WHY THIS FILE EXISTS
 *   CozyGoogleAccountLinkage (core/security/google-account-linkage.js)
 *   requires a SYNCHRONOUS store: getRecord(userId), setRecord(userId,
 *   record), findUserIdByGoogleUid(uid) — same real contract as
 *   phone-account-linkage.js's. It runs server-side only (Node,
 *   requires firebase-identity-issuer.js's crypto/cert-fetch), and
 *   this repo's server/ directory has NO persistence mechanism at all
 *   (confirmed by repo-wide search — server/live-relay/* is stateless
 *   signaling, and google-login-endpoint.js explicitly documents it
 *   receives its store from its caller rather than owning one).
 *
 * WHY THIS IS SIMPLER THAN THE BROWSER-SIDE PHONE ADAPTER
 *   core/security/phone-linkage-store-adapter.js needed an async
 *   hydrate-then-cache design because IndexedDB is Promise-based, and
 *   a synchronous store had to be built on top of it. Node's `fs`
 *   module offers REAL synchronous file I/O
 *   (readFileSync/writeFileSync) — so this store can be genuinely,
 *   directly synchronous, with no cache/hydration-race class of bug
 *   to guard against. Every getRecord/setRecord/findUserIdByGoogleUid
 *   call reads/writes the on-disk JSON file directly (through a small
 *   in-memory mirror kept in lockstep on every write, so repeated
 *   reads in a single request don't re-parse the file each time).
 *
 * FAIL-CLOSED ON CORRUPTION
 *   If the backing file exists but contains invalid JSON, this
 *   adapter throws at construction rather than silently starting from
 *   an empty store — an empty store would look identical to "no one
 *   has ever linked Google," which could let collision detection miss
 *   a real existing link.
 *
 * NOT A GENERAL-PURPOSE DATABASE
 *   This is deliberately the smallest correct persistence primitive
 *   for exactly one record type (userId -> Google linkage record),
 *   matching Prompt 10 §17 ("store only the minimum identity
 *   information actually required"). It is not a second account
 *   database — CozyOS accounts themselves remain browser-local
 *   (IdentityEngine + IdentityStorage); this store only ever holds
 *   the server-side half of the Google identity association
 *   (googleUid, googleEmail, googleLinked, googleLinkedAt,
 *   googleLoginEnabled) keyed by the same userId the browser already
 *   uses.
 *
 * HONEST SCOPE
 *   Locally verified via node:test against a real temp file on this
 *   sandbox's real filesystem (see
 *   server/auth/test/google-linkage-store-adapter.test.js) — genuine
 *   file persistence, not a mock. NOT verified: multi-process/
 *   multi-instance concurrent access (no file locking — a real
 *   concern for a genuine production deployment with more than one
 *   server process, disclosed here rather than silently assumed
 *   away), and real production deployment/reachability.
 */

const fs = require('fs');
const path = require('path');

class GoogleLinkageStoreAdapter {
    #filePath;
    #records; // Map<userId, record>, kept in lockstep with the file on every write

    constructor({ filePath } = {}) {
        if (!filePath || typeof filePath !== 'string') {
            throw new Error('[GoogleLinkageStoreAdapter] A real filePath is required.');
        }
        this.#filePath = filePath;
        this.#records = new Map();
        this.#loadFromDisk();
    }

    #loadFromDisk() {
        let raw;
        try {
            raw = fs.readFileSync(this.#filePath, 'utf8');
        } catch (err) {
            if (err && err.code === 'ENOENT') {
                // Real first-run case: no file yet. Create an empty,
                // valid one now so a concurrent reader never sees a
                // missing-vs-corrupt ambiguity, and so file permissions
                // are validated immediately rather than deferred to
                // the first write.
                this.#persistToDisk();
                return;
            }
            throw err;
        }
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (_e) {
            throw new Error('[GoogleLinkageStoreAdapter] Backing file exists but contains invalid JSON — refusing to start from an empty store, which could silently hide real existing Google linkages: ' + this.#filePath);
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('[GoogleLinkageStoreAdapter] Backing file does not contain a JSON object: ' + this.#filePath);
        }
        for (const [userId, record] of Object.entries(parsed)) {
            this.#records.set(userId, record);
        }
    }

    #persistToDisk() {
        const obj = {};
        for (const [userId, record] of this.#records.entries()) obj[userId] = record;
        const dir = path.dirname(this.#filePath);
        fs.mkdirSync(dir, { recursive: true });
        // Write to a temp file then rename — real atomic-write
        // convention, avoids a torn/partial file if the process is
        // killed mid-write.
        const tmpPath = this.#filePath + '.tmp-' + process.pid + '-' + Date.now();
        fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2), 'utf8');
        fs.renameSync(tmpPath, this.#filePath);
    }

    getVersion() { return '1.0.0-ENTERPRISE'; }

    /** getRecord(userId) — real, synchronous, direct from the in-memory mirror (kept exactly in sync with disk on every write). */
    getRecord(userId) {
        return this.#records.has(userId) ? { ...this.#records.get(userId) } : null;
    }

    /** setRecord(userId, record) — real, synchronous write-through: in-memory mirror AND on-disk file are updated before this call returns (no background/best-effort persistence — unlike the browser case, sync fs makes a genuinely synchronous durable write possible). */
    setRecord(userId, record) {
        this.#records.set(userId, { ...record });
        this.#persistToDisk();
    }

    /** findUserIdByGoogleUid(uid) — real, synchronous reverse scan; matches InMemoryGoogleLinkageStore's own scan exactly. */
    findUserIdByGoogleUid(uid) {
        for (const [userId, record] of this.#records.entries()) {
            if (record.googleLinked && record.googleUid === uid) return userId;
        }
        return null;
    }
}

module.exports = { GoogleLinkageStoreAdapter };
