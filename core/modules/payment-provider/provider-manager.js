/**
 * CozyOS — Payment Provider Engine — Provider Manager (internal module)
 * File Reference: core/modules/payment-provider/provider-manager.js
 *
 * RESPONSIBILITY
 *   Owns provider lifecycle — initialize, connect, disconnect, restart,
 *   shutdown. This module is the only one that calls a real adapter's
 *   lifecycle methods and updates Provider Registry's status
 *   accordingly. Internal module — composed by the public façade.
 *
 * HONEST SCOPE
 *   Every state transition here reflects what the real adapter's own
 *   method actually returned or threw — never a fabricated success.
 *   If an adapter's connect() throws, the provider genuinely becomes
 *   FAILED, not silently ACTIVE.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.__PaymentProviderInternals = window.CozyOS.__PaymentProviderInternals || {};

    class ProviderManager {
        #registry;
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { initializations: 0, connections: 0, disconnections: 0, restarts: 0, shutdowns: 0, failures: 0, errorsHidden: 0, eventsEmitted: 0 };

        constructor(registry) {
            if (!registry) throw new TypeError("[ProviderManager] constructor(): a ProviderRegistry instance is required.");
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

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[ProviderManager] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[ProviderManager] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[ProviderManager] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        /** initializeProvider(providerId) — real, calls the adapter's own initialize(). Honestly marks FAILED on a real thrown error, never silently swallowed. */
        async initializeProvider(providerId) {
            const adapter = this.#registry.getAdapter(providerId);
            if (!adapter) throw new Error(`[ProviderManager] initializeProvider(): unknown providerId "${providerId}".`);
            try {
                await adapter.initialize();
                this.#diagnostics.initializations++;
                this.#logAudit("PROVIDER_INITIALIZED", providerId);
                this.emit("provider-initialized", { providerId });
                return true;
            } catch (err) {
                this.#diagnostics.failures++;
                this.#registry.setStatus(providerId, "FAILED");
                this.#logAudit("PROVIDER_INIT_FAILED", `${providerId}: ${err.message}`);
                this.emit("provider-failed", { providerId, phase: "initialize", error: err.message });
                throw err;
            }
        }

        /** connectProvider(providerId) — real, calls the adapter's own connect(). Only marks ACTIVE if connect() genuinely succeeds. */
        async connectProvider(providerId) {
            const adapter = this.#registry.getAdapter(providerId);
            if (!adapter) throw new Error(`[ProviderManager] connectProvider(): unknown providerId "${providerId}".`);
            try {
                await adapter.connect();
                this.#registry.setStatus(providerId, "ACTIVE");
                this.#diagnostics.connections++;
                this.#logAudit("PROVIDER_CONNECTED", providerId);
                this.emit("provider-connected", { providerId });
                return true;
            } catch (err) {
                this.#diagnostics.failures++;
                this.#registry.setStatus(providerId, "FAILED");
                this.#logAudit("PROVIDER_CONNECT_FAILED", `${providerId}: ${err.message}`);
                this.emit("provider-failed", { providerId, phase: "connect", error: err.message });
                throw err;
            }
        }

        /** disconnectProvider(providerId) — real, calls the adapter's own disconnect(). */
        async disconnectProvider(providerId) {
            const adapter = this.#registry.getAdapter(providerId);
            if (!adapter) throw new Error(`[ProviderManager] disconnectProvider(): unknown providerId "${providerId}".`);
            await adapter.disconnect();
            this.#registry.setStatus(providerId, "DISCONNECTED");
            this.#diagnostics.disconnections++;
            this.#logAudit("PROVIDER_DISCONNECTED", providerId);
            this.emit("provider-disconnected", { providerId });
            return true;
        }

        /** restartProvider(providerId) — real: disconnect then reconnect through the same real adapter calls, never a fabricated instant success. */
        async restartProvider(providerId) {
            await this.disconnectProvider(providerId).catch(() => { /* best-effort disconnect before restart */ });
            await this.connectProvider(providerId);
            this.#diagnostics.restarts++;
            this.#logAudit("PROVIDER_RESTARTED", providerId);
            this.emit("provider-restarted", { providerId });
            return true;
        }

        /** shutdownProvider(providerId) — real, calls the adapter's own shutdown(). */
        async shutdownProvider(providerId) {
            const adapter = this.#registry.getAdapter(providerId);
            if (!adapter) throw new Error(`[ProviderManager] shutdownProvider(): unknown providerId "${providerId}".`);
            await adapter.shutdown();
            this.#registry.setStatus(providerId, "INACTIVE");
            this.#diagnostics.shutdowns++;
            this.#logAudit("PROVIDER_SHUTDOWN", providerId);
            this.emit("provider-shutdown", { providerId });
            return true;
        }

        getDiagnosticsReport() { return this.#deepClone({ ...this.#diagnostics, auditLogSize: this.#auditLog.length }); }
    }

    window.CozyOS.__PaymentProviderInternals.ProviderManager = ProviderManager;
})();
