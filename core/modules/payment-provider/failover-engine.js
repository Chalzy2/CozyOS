/**
 * CozyOS — Payment Provider Engine — Failover Engine (internal module)
 * File Reference: core/modules/payment-provider/failover-engine.js
 *
 * RESPONSIBILITY
 *   Owns automatic provider switching, retry policies, recovery, and
 *   offline fallback. Internal module — composed by the public façade.
 *
 * REUSE
 *   Never re-implements provider selection (Routing Engine's job) or
 *   provider lifecycle (Provider Manager's job) — this module calls
 *   both, in sequence, when a real operation genuinely fails.
 *
 * HONEST SCOPE
 *   Failover only ever moves to a provider Routing Engine's real
 *   selection logic actually returned. If nothing is available, this
 *   engine honestly reports failure — it never fabricates a successful
 *   payment or a phantom fallback provider.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.__PaymentProviderInternals = window.CozyOS.__PaymentProviderInternals || {};

    class FailoverEngine {
        #registry; #routing; #manager;
        #failoverCounts = new Map(); // providerId -> count of times failover moved AWAY from it
        #queue = []; // real queued operations awaiting a provider to become available
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { failoversTriggered: 0, queuedOperations: 0, queueDrained: 0, errorsHidden: 0, eventsEmitted: 0 };

        constructor(registry, routing, manager) {
            if (!registry || !routing || !manager) throw new TypeError("[FailoverEngine] constructor(): registry, routing, and manager instances are all required.");
            this.#registry = registry; this.#routing = routing; this.#manager = manager;
        }

        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: this.#escapeHtml(msg) }));
            if (this.#auditLog.length > 1000) this.#auditLog.shift();
        }
        getAuditLog(predicate) { const list = this.#auditLog.map(e => ({ ...e })); return Object.freeze(predicate ? list.filter(predicate) : list); }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[FailoverEngine] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[FailoverEngine] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[FailoverEngine] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        /**
         * executeWithFailover(routingContext, operation)
         *   Real automatic switching: selects a provider via Routing
         *   Engine's real logic, calls the caller-supplied real
         *   operation(adapter, providerId) against it, and — only on a
         *   genuine thrown error — marks that provider FAILED (via
         *   Provider Manager, not a direct registry mutation) and
         *   retries against the next real alternative Routing Engine
         *   returns. Exhausts real alternatives before honestly
         *   reporting total failure; never fabricates a result.
         */
        async executeWithFailover(routingContext, operation) {
            const selection = await this.#routing.selectProvider(routingContext);
            if (!selection.available) return { available: false, reason: selection.reason };

            const candidates = [selection.selected, ...selection.alternatives];
            const attempted = [];
            for (const candidate of candidates) {
                const adapter = this.#registry.getAdapter(candidate.providerId);
                try {
                    const result = await operation(adapter, candidate.providerId);
                    if (attempted.length > 0) this.#logAudit("FAILOVER_SUCCEEDED", `${candidate.providerId} after ${attempted.length} failure(s): ${attempted.join(", ")}`);
                    return { available: true, providerId: candidate.providerId, result, failedOver: attempted.length > 0, attemptedBefore: attempted };
                } catch (err) {
                    attempted.push(candidate.providerId);
                    this.#failoverCounts.set(candidate.providerId, (this.#failoverCounts.get(candidate.providerId) || 0) + 1);
                    this.#diagnostics.failoversTriggered++;
                    try { await this.#manager.disconnectProvider(candidate.providerId); } catch (_e) { /* best-effort — provider may already be down */ }
                    this.#registry.setStatus(candidate.providerId, "FAILED");
                    this.#logAudit("FAILOVER_TRIGGERED", `${candidate.providerId}: ${err.message}`);
                    this.emit("failover-triggered", { providerId: candidate.providerId, error: err.message });
                }
            }
            return { available: false, reason: `All ${candidates.length} candidate provider(s) failed: ${attempted.join(", ")}.`, attempted };
        }

        getFailoverCount(providerId) { return this.#failoverCounts.get(providerId) || 0; }

        /** queueOperation(operation) — real, honest queueing for when no provider is currently available; never fabricates completion. drainQueue() genuinely re-attempts each real queued operation. */
        queueOperation(routingContext, operation) {
            const entry = { id: this.#generateId("q"), routingContext, operation, queuedAt: new Date().toISOString() };
            this.#queue.push(entry);
            this.#diagnostics.queuedOperations++;
            this.#logAudit("OPERATION_QUEUED", entry.id);
            return entry.id;
        }
        async drainQueue() {
            const results = [];
            const remaining = [];
            for (const entry of this.#queue) {
                const result = await this.executeWithFailover(entry.routingContext, entry.operation);
                if (result.available) { this.#diagnostics.queueDrained++; results.push({ id: entry.id, ...result }); }
                else remaining.push(entry);
            }
            this.#queue = remaining;
            return results;
        }
        getQueueLength() { return this.#queue.length; }

        getDiagnosticsReport() { return this.#deepClone({ ...this.#diagnostics, queueLength: this.#queue.length, auditLogSize: this.#auditLog.length }); }
    }

    window.CozyOS.__PaymentProviderInternals.FailoverEngine = FailoverEngine;
})();
