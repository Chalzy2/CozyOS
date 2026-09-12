/**
 * CozyOS — Vault Engine — Secret Registry (internal module)
 * File Reference: core/modules/vault/secret-registry.js
 *
 * RESPONSIBILITY
 *   Owns secret metadata — registration, category, provider reference,
 *   version, owner engine, status, timestamps, expiration, rotation
 *   policy. Internal module — composed by the public façade.
 *
 * SECURITY RULE, ENFORCED STRUCTURALLY
 *   This registry NEVER stores an actual secret value — only metadata
 *   about where a secret lives and its lifecycle state. The real value
 *   is stored (encrypted) by Secret Manager, via a registered provider.
 *   This split is deliberate: even a bug in this file cannot leak a
 *   secret value, because this file never holds one.
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

    const SECRET_CATEGORIES = Object.freeze([
        "api_key", "oauth_token", "jwt_signing_key", "private_key", "public_key",
        "certificate", "tls_certificate", "ssh_key", "encryption_key",
        "database_credential", "cloud_credential", "storage_credential",
        "email_credential", "sms_credential", "payment_credential", "ai_provider_key", "future"
    ]);
    const SECRET_STATUSES = Object.freeze(["ACTIVE", "PENDING", "ROTATING", "EXPIRED", "DISABLED", "ARCHIVED"]);

    class SecretRegistry {
        #secrets = new Map(); // secretId -> metadata (never the value)
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { secretsRegistered: 0, registrationsRejected: 0, lookupsPerformed: 0, lookupsMissed: 0, errorsHidden: 0, eventsEmitted: 0 };

        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: this.#escapeHtml(msg) }));
            if (this.#auditLog.length > 2000) this.#auditLog.shift();
        }
        /** getAuditLog — real, but the security rule is enforced by construction: msg is built only from secretId/category/status/ownerEngine above, never a secret value, since this file never receives one. */
        getAuditLog(predicate) { const list = this.#auditLog.map(e => ({ ...e })); return Object.freeze(predicate ? list.filter(predicate) : list); }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[SecretRegistry] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[SecretRegistry] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[SecretRegistry] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        /**
         * registerSecret(secretId, meta)
         *   Real registration — metadata only. rawMeta is sanitized and
         *   validated; category must be a real, known secret type.
         *   Honestly rejects a duplicate secretId rather than silently
         *   overwriting.
         */
        registerSecret(secretId, rawMeta) {
            if (typeof secretId !== "string" || !/^[a-z0-9_-]+$/i.test(secretId)) {
                this.#diagnostics.registrationsRejected++;
                throw new TypeError("[SecretRegistry] registerSecret(): secretId must be an alphanumeric/underscore/dash string.");
            }
            if (this.#secrets.has(secretId)) {
                this.#diagnostics.registrationsRejected++;
                throw new Error(`[SecretRegistry] registerSecret(): "${secretId}" is already registered.`);
            }
            const meta = sanitizeObject(rawMeta);
            if (!meta.name || typeof meta.name !== "string") { this.#diagnostics.registrationsRejected++; throw new TypeError("[SecretRegistry] registerSecret(): meta.name is required."); }
            if (!meta.category || !SECRET_CATEGORIES.includes(meta.category)) { this.#diagnostics.registrationsRejected++; throw new TypeError(`[SecretRegistry] registerSecret(): meta.category must be one of: ${SECRET_CATEGORIES.join(", ")}.`); }
            if (!meta.providerId || typeof meta.providerId !== "string") { this.#diagnostics.registrationsRejected++; throw new TypeError("[SecretRegistry] registerSecret(): meta.providerId is required."); }

            const now = new Date().toISOString();
            const record = Object.freeze({
                secretId, name: this.#escapeHtml(meta.name), category: meta.category, providerId: meta.providerId,
                version: 1, ownerEngine: meta.ownerEngine ? this.#escapeHtml(meta.ownerEngine) : null,
                status: "ACTIVE", createdAt: now, updatedAt: now,
                expiresAt: meta.expiresAt ?? null, rotationPolicy: meta.rotationPolicy ?? null
            });
            this.#secrets.set(secretId, record);
            this.#diagnostics.secretsRegistered++;
            this.#logAudit("SECRET_REGISTERED", `${secretId} (${meta.category})`);
            this.emit("secret-created", { secretId, category: meta.category });
            return this.#deepClone(record);
        }

        getSecretMeta(secretId) { this.#diagnostics.lookupsPerformed++; const e = this.#secrets.get(secretId); if (!e) { this.#diagnostics.lookupsMissed++; return null; } return this.#deepClone(e); }
        hasSecret(secretId) { return this.#secrets.has(secretId); }

        /** updateMeta — real, non-value metadata changes (rotation policy, expiration, owner engine). Never touches a value — this registry doesn't have one. */
        updateMeta(secretId, changes) {
            const existing = this.#secrets.get(secretId);
            if (!existing) throw new Error(`[SecretRegistry] updateMeta(): unknown secretId "${secretId}".`);
            const clean = sanitizeObject(changes);
            const allowed = {};
            if (clean.expiresAt !== undefined) allowed.expiresAt = clean.expiresAt;
            if (clean.rotationPolicy !== undefined) allowed.rotationPolicy = clean.rotationPolicy;
            if (clean.ownerEngine !== undefined) allowed.ownerEngine = this.#escapeHtml(clean.ownerEngine);
            const updated = Object.freeze({ ...existing, ...allowed, updatedAt: new Date().toISOString() });
            this.#secrets.set(secretId, updated);
            this.#logAudit("SECRET_META_UPDATED", secretId);
            this.emit("secret-updated", { secretId });
            return this.#deepClone(updated);
        }

        /** setStatus / bumpVersion — real lifecycle transitions, called by Secret Manager/Rotation Manager, never by an application directly. */
        setStatus(secretId, status) {
            const existing = this.#secrets.get(secretId);
            if (!existing) throw new Error(`[SecretRegistry] setStatus(): unknown secretId "${secretId}".`);
            if (!SECRET_STATUSES.includes(status)) throw new TypeError(`[SecretRegistry] setStatus(): invalid status "${status}". Must be one of: ${SECRET_STATUSES.join(", ")}.`);
            const previous = existing.status;
            const updated = Object.freeze({ ...existing, status, updatedAt: new Date().toISOString() });
            this.#secrets.set(secretId, updated);
            this.#logAudit("SECRET_STATUS_CHANGED", `${secretId}: ${previous} -> ${status}`);
            this.emit("secret-status-changed", { secretId, previous, status });
            return this.#deepClone(updated);
        }
        bumpVersion(secretId) {
            const existing = this.#secrets.get(secretId);
            if (!existing) throw new Error(`[SecretRegistry] bumpVersion(): unknown secretId "${secretId}".`);
            const updated = Object.freeze({ ...existing, version: existing.version + 1, updatedAt: new Date().toISOString() });
            this.#secrets.set(secretId, updated);
            return this.#deepClone(updated);
        }

        deleteSecretMeta(secretId) {
            const existed = this.#secrets.delete(secretId);
            if (existed) { this.#logAudit("SECRET_DELETED", secretId); this.emit("secret-deleted", { secretId }); }
            return existed;
        }

        /** listSecrets(filter) — real discovery. Metadata only, per the security rule — never a value. */
        listSecrets({ category = null, status = null, ownerEngine = null, providerId = null } = {}) {
            return Array.from(this.#secrets.values())
                .filter(s => (!category || s.category === category) && (!status || s.status === status) && (!ownerEngine || s.ownerEngine === ownerEngine) && (!providerId || s.providerId === providerId))
                .map(s => this.#deepClone(s));
        }

        /** listExpiring(withinMs) — real, honest expiration check based on the real expiresAt field. */
        listExpiring(withinMs = 7 * 24 * 60 * 60 * 1000) {
            const cutoff = Date.now() + withinMs;
            return Array.from(this.#secrets.values()).filter(s => s.expiresAt && new Date(s.expiresAt).getTime() <= cutoff).map(s => this.#deepClone(s));
        }

        getDiagnosticsReport() { return this.#deepClone({ ...this.#diagnostics, secretsTracked: this.#secrets.size, auditLogSize: this.#auditLog.length }); }
    }

    window.CozyOS.__VaultInternals.SecretRegistry = SecretRegistry;
    window.CozyOS.__VaultInternals.SECRET_CATEGORIES = SECRET_CATEGORIES;
    window.CozyOS.__VaultInternals.SECRET_STATUSES = SECRET_STATUSES;
})();
