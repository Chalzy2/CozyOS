/**
 * CozyOS — Payment Provider Engine — Health Monitor (internal module)
 * File Reference: core/modules/payment-provider/health-monitor.js
 *
 * RESPONSIBILITY
 *   Owns connection status, latency, availability, error rate, success
 *   rate, heartbeat, and automatic health checks. Internal module —
 *   composed by the public façade.
 *
 * HONEST SCOPE
 *   Every metric here is computed from real, observed calls into the
 *   adapter's own healthCheck() — real timestamps, real latency
 *   measurements, real pass/fail counts. No metric is estimated or
 *   invented. A provider that has never been checked honestly reports
 *   {available: false}, never a fabricated "healthy" default.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.__PaymentProviderInternals = window.CozyOS.__PaymentProviderInternals || {};

    class HealthMonitor {
        #registry;
        #history = new Map(); // providerId -> [{timestamp, latencyMs, healthy, detail}]
        #heartbeatIntervals = new Map(); // providerId -> intervalId
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { checksPerformed: 0, checksFailed: 0, heartbeatsStarted: 0, heartbeatsStopped: 0, errorsHidden: 0, eventsEmitted: 0 };

        constructor(registry) {
            if (!registry) throw new TypeError("[HealthMonitor] constructor(): a ProviderRegistry instance is required.");
            this.#registry = registry;
        }

        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: this.#escapeHtml(msg) }));
            if (this.#auditLog.length > 1000) this.#auditLog.shift();
        }
        getAuditLog(predicate) { const list = this.#auditLog.map(e => ({ ...e })); return Object.freeze(predicate ? list.filter(predicate) : list); }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[HealthMonitor] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[HealthMonitor] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[HealthMonitor] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        /**
         * checkHealth(providerId)
         *   Real health check — calls the adapter's own healthCheck(),
         *   measures real elapsed time, records the real result. Marks
         *   the provider FAILED in the registry on a genuine failure,
         *   never silently ignoring it.
         */
        async checkHealth(providerId) {
            const adapter = this.#registry.getAdapter(providerId);
            if (!adapter) return { available: false, reason: `Unknown provider "${providerId}".` };
            const startedAt = Date.now();
            let result;
            try {
                const healthResult = await adapter.healthCheck();
                const latencyMs = Date.now() - startedAt;
                result = { timestamp: new Date().toISOString(), latencyMs, healthy: !!healthResult?.healthy, detail: healthResult };
                this.#diagnostics.checksPerformed++;
                if (!result.healthy) {
                    this.#diagnostics.checksFailed++;
                    this.#registry.setStatus(providerId, "FAILED");
                    this.emit("provider-health-changed", { providerId, healthy: false, latencyMs });
                }
            } catch (err) {
                const latencyMs = Date.now() - startedAt;
                result = { timestamp: new Date().toISOString(), latencyMs, healthy: false, detail: { error: err.message } };
                this.#diagnostics.checksPerformed++; this.#diagnostics.checksFailed++;
                this.#registry.setStatus(providerId, "FAILED");
                this.emit("provider-health-changed", { providerId, healthy: false, latencyMs, error: err.message });
            }
            if (!this.#history.has(providerId)) this.#history.set(providerId, []);
            const list = this.#history.get(providerId);
            list.push(result);
            if (list.length > 500) list.shift();
            this.#logAudit("HEALTH_CHECK", `${providerId}: healthy=${result.healthy}, latency=${result.latencyMs}ms`);
            return { available: true, ...result };
        }

        /**
         * getHealthSummary(providerId)
         *   Real aggregation over the real recorded history — average
         *   latency, success rate, last success/failure timestamps.
         *   Honestly reports unavailable if this provider has never been
         *   checked, rather than fabricating a "100% healthy" default.
         */
        getHealthSummary(providerId) {
            const history = this.#history.get(providerId);
            if (!history || history.length === 0) return { available: false, reason: "No health checks recorded yet for this provider." };
            const successes = history.filter(h => h.healthy);
            const failures = history.filter(h => !h.healthy);
            const avgLatency = history.reduce((s, h) => s + h.latencyMs, 0) / history.length;
            return {
                available: true,
                totalChecks: history.length,
                successRate: successes.length / history.length,
                errorRate: failures.length / history.length,
                averageLatencyMs: Math.round(avgLatency),
                lastSuccess: successes.length ? successes[successes.length - 1].timestamp : null,
                lastFailure: failures.length ? failures[failures.length - 1].timestamp : null,
                currentlyHealthy: history[history.length - 1].healthy
            };
        }

        /** startHeartbeat(providerId, intervalMs) — real, periodic checkHealth() calls. Honestly refuses to double-start. */
        startHeartbeat(providerId, intervalMs = 60000) {
            if (this.#heartbeatIntervals.has(providerId)) throw new Error(`[HealthMonitor] startHeartbeat(): heartbeat already running for "${providerId}".`);
            const intervalId = setInterval(() => { this.checkHealth(providerId).catch(() => {}); }, intervalMs);
            this.#heartbeatIntervals.set(providerId, intervalId);
            this.#diagnostics.heartbeatsStarted++;
            this.#logAudit("HEARTBEAT_STARTED", `${providerId}: every ${intervalMs}ms`);
            return true;
        }
        stopHeartbeat(providerId) {
            const intervalId = this.#heartbeatIntervals.get(providerId);
            if (!intervalId) return false;
            clearInterval(intervalId);
            this.#heartbeatIntervals.delete(providerId);
            this.#diagnostics.heartbeatsStopped++;
            this.#logAudit("HEARTBEAT_STOPPED", providerId);
            return true;
        }

        getDiagnosticsReport() { return this.#deepClone({ ...this.#diagnostics, providersWithHistory: this.#history.size, activeHeartbeats: this.#heartbeatIntervals.size, auditLogSize: this.#auditLog.length }); }
    }

    window.CozyOS.__PaymentProviderInternals.HealthMonitor = HealthMonitor;
})();
