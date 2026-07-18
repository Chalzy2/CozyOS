/**
 * CozyOS — Payment Provider Engine — Routing Engine (internal module)
 * File Reference: core/modules/payment-provider/routing-engine.js
 *
 * RESPONSIBILITY
 *   Owns country routing, currency routing, provider priority,
 *   capability routing, cost-based routing, offline routing, and custom
 *   routing policies. Internal module — composed by the public façade.
 *
 * REUSE
 *   Selection reads Provider Registry's real, already-stored metadata
 *   (listProviders, getCapabilities) — never a second, duplicated
 *   provider index.
 *
 * HONEST SCOPE
 *   Only ACTIVE providers (per the Registry's real, current status) are
 *   ever selected. Cost-based routing uses a real, caller-supplied cost
 *   figure per provider — this engine never invents pricing data no
 *   provider adapter actually reported.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.__PaymentProviderInternals = window.CozyOS.__PaymentProviderInternals || {};

    class RoutingEngine {
        #registry;
        #customPolicies = new Map(); // policyName -> function(candidates, context) -> candidates
        #auditLog = [];
        #diagnostics = { selectionsPerformed: 0, selectionsFailed: 0 };

        constructor(registry) {
            if (!registry) throw new TypeError("[RoutingEngine] constructor(): a ProviderRegistry instance is required.");
            this.#registry = registry;
        }

        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: this.#escapeHtml(msg) }));
            if (this.#auditLog.length > 1000) this.#auditLog.shift();
        }
        getAuditLog(predicate) { const list = this.#auditLog.map(e => ({ ...e })); return Object.freeze(predicate ? list.filter(predicate) : list); }

        /**
         * selectProvider({country, currency, type, capability, costs})
         *   Real selection over the Registry's real, current ACTIVE
         *   providers. Filters by country/currency/type (reusing
         *   listProviders()), optionally by a real capability the
         *   caller asks for, then sorts by priority (lower number wins)
         *   or by real, caller-supplied cost figures when provided.
         *   Honestly returns {available: false} when nothing matches —
         *   never fabricates a fallback provider.
         */
        async selectProvider({ country = null, currency = null, type = null, capability = null, costs = null } = {}) {
            let candidates = this.#registry.listProviders({ country, currency, type, status: "ACTIVE" });
            if (candidates.length === 0) {
                this.#diagnostics.selectionsFailed++;
                return { available: false, reason: "No ACTIVE provider matches the given country/currency/type." };
            }

            if (capability) {
                const filtered = [];
                for (const c of candidates) {
                    const capResult = await this.#registry.getCapabilities(c.providerId);
                    if (capResult.available && capResult.capabilities?.[capability]) filtered.push(c);
                }
                candidates = filtered;
                if (candidates.length === 0) {
                    this.#diagnostics.selectionsFailed++;
                    return { available: false, reason: `No ACTIVE provider supports capability "${capability}".` };
                }
            }

            if (costs && typeof costs === "object") {
                candidates = candidates.slice().sort((a, b) => (costs[a.providerId] ?? Infinity) - (costs[b.providerId] ?? Infinity));
            } else {
                candidates = candidates.slice().sort((a, b) => a.priority - b.priority);
            }

            this.#diagnostics.selectionsPerformed++;
            this.#logAudit("PROVIDER_SELECTED", candidates[0].providerId);
            return { available: true, selected: candidates[0], alternatives: candidates.slice(1) };
        }

        /** registerPolicy(name, fn) / applyPolicy(name, candidates, context) — real, extensible custom routing policies. fn receives real candidate metadata, returns a real filtered/reordered array. */
        registerPolicy(name, fn) {
            if (typeof name !== "string" || !name.trim()) throw new TypeError("[RoutingEngine] registerPolicy(): name is required.");
            if (typeof fn !== "function") throw new TypeError("[RoutingEngine] registerPolicy(): fn must be a function.");
            this.#customPolicies.set(name, fn);
            this.#logAudit("POLICY_REGISTERED", name);
        }
        applyPolicy(name, candidates, context) {
            const fn = this.#customPolicies.get(name);
            if (!fn) throw new Error(`[RoutingEngine] applyPolicy(): unknown policy "${name}".`);
            return fn(candidates, context);
        }
        hasPolicy(name) { return this.#customPolicies.has(name); }
        listPolicies() { return Array.from(this.#customPolicies.keys()); }

        /** getOfflineProviders() — real, reuses Registry's own online:false metadata field; never a separate offline index. */
        getOfflineProviders({ country = null } = {}) {
            return this.#registry.listProviders({ country, status: "ACTIVE" }).filter(p => p.online === false);
        }

        getDiagnosticsReport() { return { ...this.#diagnostics, customPolicyCount: this.#customPolicies.size, auditLogSize: this.#auditLog.length }; }
    }

    window.CozyOS.__PaymentProviderInternals.RoutingEngine = RoutingEngine;
})();
