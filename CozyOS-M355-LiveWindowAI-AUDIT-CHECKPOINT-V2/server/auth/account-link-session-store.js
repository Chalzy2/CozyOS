'use strict';

/**
 * server/auth/account-link-session-store.js
 * CozyOS — Persistent Account-Link Session Store
 * Milestone: Prompt 10 (Browser -> Server Account Linkage boundary)
 * Version: 1.0.0-ENTERPRISE
 *
 * WHY THIS FILE EXISTS
 *   Repo-wide search (this milestone, §1/§4) confirmed CozyOS's real
 *   session concept (identity-engine.js's `identity:session-created`
 *   event / session-manager.js's CozySessionManager) is entirely
 *   browser-local — it has never been sent to, or recognized by, any
 *   server. The server has no pre-existing way to know "which CozyOS
 *   account is making this request." This file is the persistence
 *   half of the smallest real boundary that closes that gap (see
 *   account-link-session-issuer.js for the actual issue/verify logic
 *   and its HONEST SECURITY MODEL disclosure — read that before
 *   relying on this).
 *
 * WHAT IS STORED
 *   sha256(rawToken) -> { userId, createdAt, expiresAt }. The RAW
 *   token is never persisted — only its hash, the same principle
 *   password-reset-service.js already uses for reset tokens in this
 *   repo (never store the secret itself, only a value an attacker
 *   with read access to the file cannot use to impersonate a session).
 *
 * SAME REAL, SYNCHRONOUS, FS-BACKED DESIGN AS
 *   server/auth/google-linkage-store-adapter.js — same
 *   atomic-write-via-rename convention, same fail-closed-on-corruption
 *   behavior, same disclosed single-process/no-file-locking scope.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AccountLinkSessionStore {
    #filePath;
    #records; // Map<tokenHash, { userId, createdAt, expiresAt }>

    constructor({ filePath } = {}) {
        if (!filePath || typeof filePath !== 'string') {
            throw new Error('[AccountLinkSessionStore] A real filePath is required.');
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
            if (err && err.code === 'ENOENT') { this.#persistToDisk(); return; }
            throw err;
        }
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (_e) {
            throw new Error('[AccountLinkSessionStore] Backing file exists but contains invalid JSON — refusing to start from an empty store: ' + this.#filePath);
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('[AccountLinkSessionStore] Backing file does not contain a JSON object: ' + this.#filePath);
        }
        for (const [tokenHash, record] of Object.entries(parsed)) this.#records.set(tokenHash, record);
    }

    #persistToDisk() {
        const obj = {};
        for (const [tokenHash, record] of this.#records.entries()) obj[tokenHash] = record;
        const dir = path.dirname(this.#filePath);
        fs.mkdirSync(dir, { recursive: true });
        const tmpPath = this.#filePath + '.tmp-' + process.pid + '-' + Date.now();
        fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2), 'utf8');
        fs.renameSync(tmpPath, this.#filePath);
    }

    static hashToken(rawToken) {
        return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
    }

    /** put(tokenHash, record) — real, synchronous write-through. */
    put(tokenHash, record) {
        this.#records.set(tokenHash, { ...record });
        this.#persistToDisk();
    }

    /** get(tokenHash) — real, synchronous read; never fabricates a record. */
    get(tokenHash) {
        return this.#records.has(tokenHash) ? { ...this.#records.get(tokenHash) } : null;
    }

    /** delete(tokenHash) — real, synchronous; used to consume a session token after use (reduces replay window). */
    delete(tokenHash) {
        const existed = this.#records.delete(tokenHash);
        if (existed) this.#persistToDisk();
        return existed;
    }

    /** deleteExpired(now) — real, synchronous sweep; not called automatically (no background timers in this file — callers decide when to sweep). */
    deleteExpired(now = Date.now()) {
        let removed = 0;
        for (const [tokenHash, record] of this.#records.entries()) {
            if (record.expiresAt && record.expiresAt <= now) { this.#records.delete(tokenHash); removed++; }
        }
        if (removed > 0) this.#persistToDisk();
        return removed;
    }
}

module.exports = { AccountLinkSessionStore };
