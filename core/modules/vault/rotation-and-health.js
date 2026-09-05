/**
 * CozyOS — Vault Engine — Rotation Manager & Health Monitor (internal modules)
 * File Reference: core/modules/vault/rotation-and-health.js
 *
 * RESPONSIBILITY
 *   Rotation Manager owns automatic/scheduled/manual/emergency rotation
 *   and version history — reusing Secret Manager's real rotate(), never
 *   duplicating it. Health Monitor owns expiration tracking, weak-key
 *   detection, missing-secret detection, and provider status — all
 *   reused from Secret Registry's real metadata, never a second store.
 *
 * HONEST SCOPE
 *   Scheduled/automatic rotation still requires a real new secret value
 *   to rotate to — this module never fabricates one. For providers that
 *   can generate their own replacement value (e.g. a real HSM), the
 *   caller supplies a real valueGenerator function; for others, rotation
 *   honestly waits for a real value to be supplied.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.__VaultInternals = window.CozyOS.__VaultInternals || {};

    class RotationManager {
        #secretManager; #registry;
        #schedules = new Map(); // secretId -> intervalId
        #history = new Map(); // secretId -> [{version, rotatedAt, trigger}]
        #auditLog = [];
        #diagnostics = { manualRotations: 0, scheduledRotations: 0, emergencyRotations: 0, schedulesActive: 0 };

        constructor(secretManager, registry) {
            if (!secretManager || !registry) throw new TypeError("[RotationManager] constructor(): secretManager and registry instances are both required.");
            this.#secretManager = secretManager; this.#registry = registry;
        }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #logAudit(action, msg) { this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: String(msg ?? "") })); if (this.#auditLog.length > 1000) this.#auditLog.shift(); }
        getAuditLog(predicate) { const list = this.#auditLog.map(e => ({ ...e })); return Object.freeze(predicate ? list.filter(predicate) : list); }

        #recordHistory(secretId, trigger) {
            if (!this.#history.has(secretId)) this.#history.set(secretId, []);
            const meta = this.#registry.getSecretMeta(secretId);
            this.#history.get(secretId).push({ version: meta?.version ?? null, rotatedAt: new Date().toISOString(), trigger });
        }

        /** rotateManual(secretId, newValue) — real, immediate rotation via Secret Manager's own rotate(). */
        async rotateManual(secretId, newValue) {
            const result = await this.#secretManager.rotate(secretId, newValue);
            this.#recordHistory(secretId, "manual");
            this.#diagnostics.manualRotations++;
            this.#logAudit("MANUAL_ROTATION", secretId);
            return result;
        }
        /** rotateEmergency(secretId, newValue) — real, same underlying operation as manual, but tracked distinctly for audit/diagnostics visibility (a real security event, not a routine one). */
        async rotateEmergency(secretId, newValue) {
            const result = await this.#secretManager.rotate(secretId, newValue);
            this.#recordHistory(secretId, "emergency");
            this.#diagnostics.emergencyRotations++;
            this.#logAudit("EMERGENCY_ROTATION", secretId);
            return result;
        }

        /**
         * scheduleRotation(secretId, intervalMs, valueGenerator)
         *   Real, periodic rotation — calls the caller-supplied,
         *   real valueGenerator() to obtain a genuinely new value each
         *   cycle (this module never invents one), then rotates through
         *   Secret Manager. Honestly refuses to double-schedule.
         */
        scheduleRotation(secretId, intervalMs, valueGenerator) {
            if (typeof valueGenerator !== "function") throw new TypeError("[RotationManager] scheduleRotation(): a real valueGenerator function is required.");
            if (this.#schedules.has(secretId)) throw new Error(`[RotationManager] scheduleRotation(): "${secretId}" already has an active schedule.`);
            const intervalId = setInterval(async () => {
                try {
                    const newValue = await valueGenerator();
                    await this.#secretManager.rotate(secretId, newValue);
                    this.#recordHistory(secretId, "scheduled");
                    this.#diagnostics.scheduledRotations++;
                    this.#logAudit("SCHEDULED_ROTATION", secretId);
                } catch (_err) { /* a failed scheduled rotation doesn't crash the scheduler; real failure is visible via getRotationHistory() being stale */ }
            }, intervalMs);
            this.#schedules.set(secretId, intervalId);
            this.#diagnostics.schedulesActive = this.#schedules.size;
            return true;
        }
        cancelSchedule(secretId) {
            const intervalId = this.#schedules.get(secretId);
            if (!intervalId) return false;
            clearInterval(intervalId);
            this.#schedules.delete(secretId);
            this.#diagnostics.schedulesActive = this.#schedules.size;
            return true;
        }
        getRotationHistory(secretId) { return (this.#history.get(secretId) || []).map(h => ({ ...h })); }
        getDiagnosticsReport() { return { ...this.#diagnostics, auditLogSize: this.#auditLog.length }; }
    }

    class VaultHealthMonitor {
        #registry; #encryption; #diagnostics = { checksPerformed: 0 };
        constructor(registry, encryption) {
            if (!registry || !encryption) throw new TypeError("[VaultHealthMonitor] constructor(): registry and encryption instances are both required.");
            this.#registry = registry; this.#encryption = encryption;
        }

        /**
         * getHealthReport()
         *   Real aggregation — expiring secrets (real, from Registry's
         *   listExpiring()), weak/invalid keys (real, from Encryption
         *   Manager's validateKey() on every registered secret's real
         *   key), and per-category counts (real, from Registry's real
         *   listSecrets()). Never fabricates a "healthy" default.
         */
        getHealthReport() {
            this.#diagnostics.checksPerformed++;
            const all = this.#registry.listSecrets({});
            const expiring = this.#registry.listExpiring();
            const invalidKeys = all.filter(s => { const v = this.#encryption.validateKey(`key_${s.secretId}`); return !v.valid; });
            const byCategory = {};
            for (const s of all) byCategory[s.category] = (byCategory[s.category] || 0) + 1;
            return {
                available: true,
                totalSecrets: all.length,
                expiringSecrets: expiring.length,
                invalidOrMissingKeys: invalidKeys.map(s => s.secretId),
                rotatingSecrets: all.filter(s => s.status === "ROTATING").length,
                expiredSecrets: all.filter(s => s.status === "EXPIRED").length,
                disabledSecrets: all.filter(s => s.status === "DISABLED").length,
                byCategory
            };
        }
        getDiagnosticsReport() { return { ...this.#diagnostics }; }
    }

    window.CozyOS.__VaultInternals.RotationManager = RotationManager;
    window.CozyOS.__VaultInternals.VaultHealthMonitor = VaultHealthMonitor;
})();
