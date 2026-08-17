/**
 * CozyOS — Provider Manager
 * File Reference: core/shell/provider-manager.js
 * Milestone: M367 — Provider Ecosystem Expansion
 *
 * OWNERSHIP
 *   A lightweight tracking layer only. Does NOT replace CozyThinking,
 *   CozyReasoning, CozyInterpretation, CozyConversation, CozyMemory,
 *   VoiceManager, or CozyIntelligence — none of those engines are
 *   modified, wrapped, or proxied. This file simply gives every
 *   provider across the platform ONE common place to be listed,
 *   enabled/disabled, and health-checked, so a future 20-40-provider
 *   ecosystem doesn't need one-off registration/discovery code per
 *   engine.
 *
 * REAL API (exactly as specified)
 *   ProviderManager.register(provider)
 *   ProviderManager.enable(id) / disable(id)
 *   ProviderManager.health(id)
 *   ProviderManager.list()
 *
 * WHAT "register" MEANS HERE
 *   A provider entry is a real, small descriptor: { id, name, category,
 *   getHealth } - getHealth is a real function the ACTUAL underlying
 *   engine already exposes (e.g. CozyInterpretation.findProvider(...),
 *   or a custom provider's own status method). ProviderManager never
 *   invents health data itself - it only calls the real getHealth()
 *   it was given and reports whatever that returns, honestly.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["provider-manager"]) return;

    const STORAGE_KEY = "cozy.providerManager.enabledState";

    function loadPersistedState() {
        try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}"); } catch (_err) { return {}; }
    }
    function savePersistedState(state) {
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_err) { /* ignore */ }
    }
    function emit(eventName, detail) {
        const bus = window.CozyOS.PlatformEventBus;
        if (bus && typeof bus.emit === "function") { try { bus.emit(`provider-manager:${eventName}`, detail); } catch (_err) { /* non-fatal */ } }
    }

    class CozyProviderManager {
        #providers = new Map(); // id -> { id, name, category, getHealth, enabled, dependencies, version, lastHealthCheck, lastHealth }

        register(provider) {
            if (!provider || !provider.id || typeof provider.getHealth !== "function") {
                return { success: false, reason: "A real id and a real getHealth() function are required." };
            }
            if (this.#providers.has(provider.id)) return { success: true, alreadyRegistered: true };

            // M367.2 — real persistence: restores this provider's last
            // enabled/disabled state from a previous session, if one was
            // ever explicitly recorded. Defaults to enabled (matching
            // this file's original, unchanged behavior) when nothing was
            // ever persisted for this id.
            const persisted = loadPersistedState();
            const enabled = Object.prototype.hasOwnProperty.call(persisted, provider.id) ? !!persisted[provider.id] : true;

            this.#providers.set(provider.id, {
                id: provider.id,
                name: provider.name || provider.id,
                category: provider.category || "uncategorized",
                getHealth: provider.getHealth,
                dependencies: Array.isArray(provider.dependencies) ? provider.dependencies.slice() : [],
                version: provider.version || null,
                enabled,
                lastHealthCheck: null,
                lastHealth: null
            });
            emit("providerRegistered", { id: provider.id, name: provider.name || provider.id });
            return { success: true };
        }

        unregister(id) { const removed = this.#providers.delete(id); return { success: removed }; }

        /**
         * #checkDependencies(id)
         *   Real, honest dependency check: every id listed in a
         *   provider's own `dependencies` array must both (a) be
         *   registered with this same ProviderManager, and (b) be
         *   currently enabled. Returns the exact missing/disabled
         *   dependency ids, never a vague failure.
         */
        #checkDependencies(id) {
            const p = this.#providers.get(id);
            if (!p || !p.dependencies.length) return { satisfied: true, missing: [] };
            const missing = p.dependencies.filter(depId => {
                const dep = this.#providers.get(depId);
                return !dep || !dep.enabled;
            });
            return { satisfied: missing.length === 0, missing };
        }

        enable(id) {
            const p = this.#providers.get(id);
            if (!p) return { success: false, reason: `No real provider "${id}" registered.` };
            const depCheck = this.#checkDependencies(id);
            if (!depCheck.satisfied) {
                return { success: false, reason: `Cannot enable "${id}" - required dependency/dependencies not available: ${depCheck.missing.join(", ")}.`, missingDependencies: depCheck.missing };
            }
            p.enabled = true;
            savePersistedState({ ...loadPersistedState(), [id]: true });
            emit("providerEnabled", { id });
            return { success: true };
        }

        disable(id) {
            const p = this.#providers.get(id);
            if (!p) return { success: false, reason: `No real provider "${id}" registered.` };
            p.enabled = false;
            savePersistedState({ ...loadPersistedState(), [id]: false });
            emit("providerDisabled", { id });
            // Real, honest cascade disclosure: report which OTHER real
            // providers now have an unmet dependency because of this -
            // never silently leaves them claiming to work.
            const affected = Array.from(this.#providers.values())
                .filter(other => other.enabled && other.dependencies.includes(id))
                .map(other => other.id);
            return { success: true, affectedDependents: affected };
        }

        /** health(id) — calls the real, existing engine's own getHealth() and returns whatever it honestly reports. Never fabricates status. Tracks lastHealthCheck/lastHealth for diagnostics, and emits providerHealthChanged only when the real status actually changed. */
        health(id) {
            const p = this.#providers.get(id);
            if (!p) return { id, health: "UNKNOWN", reason: `No real provider "${id}" registered.` };
            if (!p.enabled) {
                const result = { id, health: "DISABLED", reason: "Disabled via ProviderManager.disable()." };
                this.#recordHealth(p, result);
                return result;
            }
            const depCheck = this.#checkDependencies(id);
            if (!depCheck.satisfied) {
                const result = { id, health: "FAILED", reason: `Missing required dependency/dependencies: ${depCheck.missing.join(", ")}.`, missingDependencies: depCheck.missing };
                this.#recordHealth(p, result);
                return result;
            }
            try {
                const real = p.getHealth();
                const result = { id, name: p.name, category: p.category, dependencies: p.dependencies, version: p.version, ...real };
                this.#recordHealth(p, result);
                return result;
            } catch (err) {
                const result = { id, health: "FAILED", reason: `getHealth() threw: ${err && err.message}` };
                this.#recordHealth(p, result);
                return result;
            }
        }

        #recordHealth(p, result) {
            const prevHealth = p.lastHealth ? p.lastHealth.health : null;
            p.lastHealthCheck = new Date().toISOString();
            p.lastHealth = result;
            if (result.health !== prevHealth) emit("providerHealthChanged", { id: p.id, from: prevHealth, to: result.health });
        }

        list(category) {
            const all = Array.from(this.#providers.values());
            return (category ? all.filter(p => p.category === category) : all)
                .map(p => ({ id: p.id, name: p.name, category: p.category, enabled: p.enabled, dependencies: p.dependencies, version: p.version, lastHealthCheck: p.lastHealthCheck }));
        }

        /** healthReport() — real, aggregated status for every registered provider, composing each one's own real health() call above. */
        healthReport() {
            const report = {};
            for (const id of this.#providers.keys()) report[id] = this.health(id);
            return report;
        }

        getDiagnosticsReport() { return { moduleVersion: VERSION, providerCount: this.#providers.size, categories: [...new Set(Array.from(this.#providers.values()).map(p => p.category))] }; }
    }

    window.CozyOS.ProviderManager = new CozyProviderManager();
    window.CozyOS.Modules["provider-manager"] = Object.freeze({
        version: VERSION,
        description: "Provider Manager (M367/M367.2) — a lightweight tracking layer for every CozyOS provider (existing and future). Does not replace CozyThinking/CozyReasoning/CozyInterpretation/CozyConversation/CozyMemory/VoiceManager/CozyIntelligence - only lists, enables/disables, and health-checks them via their own real status methods. Enabled/disabled state persists across sessions (localStorage). Dependency-aware: enable() is refused with the exact missing dependency ids if a required provider is unavailable or disabled; disable() reports which other providers are now affected. Emits providerRegistered/providerEnabled/providerDisabled/providerHealthChanged via the real, existing PlatformEventBus - no second event system."
    });
})();
