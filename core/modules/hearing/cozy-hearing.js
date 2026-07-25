/**
 * CozyOS Hearing Engine
 * File Reference: core/modules/hearing/cozy-hearing.js
 * Layer: Core / Platform Foundation — Kernel-adjacent Engine
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 158 (prerequisite) — Cozy Hearing Engine
 *
 * OWNERSHIP
 *   The one, canonical owner of sound classification in CozyOS:
 *   window.CozyOS.CozyHearing. Owns the classifier registry, dispatch
 *   (classifySound/analyseSound), capability aggregation, and health
 *   aggregation. No other file may create a second classifier registry
 *   — Milestone 158's providers register here, through
 *   registerClassifier(), and nowhere else.
 * Does NOT own
 *   Any actual classification model or backend (TensorFlow, ONNX,
 *   MediaPipe, cloud, etc.) — those are providers, built in Milestone
 *   158 proper, against the real extension point below. Does not own
 *   microphone capture (a real, separate, not-yet-built Listening
 *   Engine sits between the microphone and this file per the
 *   architecture diagram — this file accepts already-captured audio
 *   data, it does not open a microphone itself).
 *
 * REAL, NOT FAKE
 *   With zero providers registered, every classification call fails
 *   closed: isReal:false, confidence:null, category:"Unknown", and a
 *   stated reason — never a fabricated category or score. Capability
 *   and health are aggregated ONLY from what registered providers
 *   themselves declare — this engine invents no capability a provider
 *   didn't state.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const HEARING_VERSION = "1.0.0-ENTERPRISE";

    // Canonical classification categories (Milestone 158 spec). Providers
    // declare which of these they support; this list is the one source
    // of truth for valid category names — not re-declared per provider.
    const CATEGORIES = Object.freeze([
        "Speech", "Music", "Applause", "Door Knock", "Door Bell", "Glass Break",
        "Baby Cry", "Dog Bark", "Cat Meow", "Gunshot", "Explosion", "Alarm",
        "Fire Alarm", "Smoke Alarm", "Siren", "Vehicle", "Motorcycle", "Truck",
        "Train", "Aircraft", "Footsteps", "Keyboard", "Mouse Click", "Rain",
        "Thunder", "Wind", "Ocean", "River", "Machine", "Factory",
        "Construction", "Crowd", "Silence", "Unknown"
    ]);

    const CAPABILITY_FLAGS = [
        "supportsRealtimeClassification", "supportsOfflineClassification", "supportsStreaming",
        "supportsBatchClassification", "supportsMultiLabel", "supportsConfidenceScores"
    ];

    const HEALTH_STATES = Object.freeze(["Ready", "Loading", "Unavailable", "Offline", "Error", "Busy"]);

    class CozyHearingEngine {
        #classifiers = new Map(); // id -> { descriptor, provider }
        #history = [];

        getVersion() { return HEARING_VERSION; }
        listCategories() { return [...CATEGORIES]; }

        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }
        #logHistory(event, detail) {
            this.#history.push({ event, at: new Date(Date.now()).toISOString(), detail: this.#deepClone(detail) });
            if (this.#history.length > 200) this.#history.shift();
        }
        #emit(eventName, detail) {
            this.#logHistory(eventName, detail);
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`hearing:${eventName}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }
        getHistory() { return this.#deepClone(this.#history); }

        /**
         * registerClassifier(descriptor, provider)
         *   THE real extension point Milestone 158's providers register
         *   through. descriptor: { id, name, type (Browser/TensorFlow/
         *   ONNX/MediaPipe/Cloud/LocalModel/Enterprise/Custom),
         *   categories (subset of listCategories()), capabilities
         *   (subset of the 6 real flags — undeclared ones are false,
         *   never assumed true), priority (number, higher = preferred
         *   default), metadata }. provider: an object implementing at
         *   least classify(audioData, options); supportsCategory(),
         *   listCategories(), getCapabilities(), getHealth(), load(),
         *   unload(), reset() are all optional and checked for presence
         *   before use — a provider's own declarations are never
         *   duplicated or second-guessed here.
         */
        registerClassifier(descriptor, provider) {
            if (!descriptor || !descriptor.id) return { success: false, reason: "descriptor.id is required." };
            if (!provider || typeof provider.classify !== "function") return { success: false, reason: "provider.classify(audioData, options) is required." };
            if (this.#classifiers.has(descriptor.id)) return { success: false, reason: `A classifier with id "${descriptor.id}" is already registered — extend it, do not re-register.` };
            const clean = {
                id: descriptor.id, name: descriptor.name || descriptor.id, type: descriptor.type || "Custom",
                categories: Array.isArray(descriptor.categories) ? descriptor.categories.filter(c => CATEGORIES.includes(c)) : [],
                capabilities: descriptor.capabilities && typeof descriptor.capabilities === "object" ? descriptor.capabilities : {},
                priority: typeof descriptor.priority === "number" ? descriptor.priority : 0,
                metadata: descriptor.metadata || {}
            };
            this.#classifiers.set(descriptor.id, { descriptor: clean, provider });
            this.#emit("classifier-registered", { id: descriptor.id, type: clean.type });
            return { success: true };
        }

        removeClassifier(id) {
            const existed = this.#classifiers.delete(id);
            if (existed) this.#emit("classifier-removed", { id });
            return { success: existed };
        }

        listClassifiers() {
            return [...this.#classifiers.values()].map(c => this.#deepClone(c.descriptor));
        }

        #selectClassifier(providerId) {
            if (providerId) return this.#classifiers.get(providerId) || null;
            if (this.#classifiers.size === 0) return null;
            return [...this.#classifiers.values()].sort((a, b) => b.descriptor.priority - a.descriptor.priority)[0];
        }

        /**
         * classifySound(audioData, options)
         *   Real dispatch to ONE selected registered provider (highest
         *   priority, or options.providerId). Fails closed — isReal:
         *   false, confidence:null, category:"Unknown" — if none are
         *   registered, the requested providerId doesn't exist, or the
         *   provider itself throws. Never fabricates a result.
         */
        async classifySound(audioData, options = {}) {
            const timestamp = new Date(Date.now()).toISOString();
            const entry = this.#selectClassifier(options.providerId);
            if (!entry) {
                this.#emit("classify-failed-closed", { reason: "no-provider" });
                return { category: "Unknown", confidence: null, duration: 0, timestamp, provider: null, metadata: {}, isReal: false, reason: options.providerId ? `No classifier registered with id "${options.providerId}".` : "No classifier providers are registered." };
            }
            const startedAt = Date.now();
            try {
                const raw = await entry.provider.classify(audioData, options);
                const duration = Date.now() - startedAt;
                if (!raw || typeof raw.category !== "string") {
                    this.#emit("classify-failed-closed", { reason: "malformed-provider-result", providerId: entry.descriptor.id });
                    return { category: "Unknown", confidence: null, duration, timestamp, provider: entry.descriptor.id, metadata: {}, isReal: false, reason: "Provider returned a malformed result." };
                }
                this.#emit("classified", { providerId: entry.descriptor.id, category: raw.category });
                return {
                    category: raw.category, confidence: typeof raw.confidence === "number" ? raw.confidence : null,
                    duration, timestamp, provider: entry.descriptor.id, metadata: raw.metadata || {}, isReal: raw.isReal === true
                };
            } catch (err) {
                this.#emit("classify-error", { providerId: entry.descriptor.id, message: err.message });
                return { category: "Unknown", confidence: null, duration: Date.now() - startedAt, timestamp, provider: entry.descriptor.id, metadata: {}, isReal: false, reason: `Provider threw: ${err.message}` };
            }
        }

        /**
         * analyseSound(audioData, options)
         *   Real dispatch to EVERY registered provider (or
         *   options.providerIds, a real subset filter) — a genuinely
         *   different, richer operation than classifySound's single-
         *   provider dispatch, useful for multi-provider comparison.
         *   Returns one real (or real-fail-closed) result per provider;
         *   an empty providers array if none are registered.
         */
        async analyseSound(audioData, options = {}) {
            const timestamp = new Date(Date.now()).toISOString();
            const targets = Array.isArray(options.providerIds) && options.providerIds.length
                ? options.providerIds.map(id => this.#classifiers.get(id)).filter(Boolean)
                : [...this.#classifiers.values()];
            if (targets.length === 0) {
                this.#emit("analyse-failed-closed", { reason: "no-provider" });
                return { timestamp, results: [], isReal: false, reason: "No classifier providers are registered." };
            }
            const results = await Promise.all(targets.map(async (entry) => {
                const startedAt = Date.now();
                try {
                    const raw = await entry.provider.classify(audioData, options);
                    const duration = Date.now() - startedAt;
                    if (!raw || typeof raw.category !== "string") return { category: "Unknown", confidence: null, duration, provider: entry.descriptor.id, metadata: {}, isReal: false, reason: "Provider returned a malformed result." };
                    return { category: raw.category, confidence: typeof raw.confidence === "number" ? raw.confidence : null, duration, provider: entry.descriptor.id, metadata: raw.metadata || {}, isReal: raw.isReal === true };
                } catch (err) {
                    return { category: "Unknown", confidence: null, duration: Date.now() - startedAt, provider: entry.descriptor.id, metadata: {}, isReal: false, reason: `Provider threw: ${err.message}` };
                }
            }));
            this.#emit("analysed", { providerCount: results.length });
            return { timestamp, results, isReal: results.some(r => r.isReal) };
        }

        /**
         * getCapabilities(providerId?)
         *   Real aggregation — OR of each registered provider's own
         *   declared descriptor.capabilities (or their live
         *   getCapabilities() if the provider implements it, which
         *   takes precedence as the more current source). No providers
         *   registered ⇒ every flag is honestly false.
         */
        getCapabilities(providerId = null) {
            const entries = providerId ? [this.#classifiers.get(providerId)].filter(Boolean) : [...this.#classifiers.values()];
            const result = {};
            for (const flag of CAPABILITY_FLAGS) result[flag] = false;
            for (const entry of entries) {
                const live = typeof entry.provider.getCapabilities === "function" ? (entry.provider.getCapabilities() || {}) : entry.descriptor.capabilities;
                for (const flag of CAPABILITY_FLAGS) if (live[flag] === true) result[flag] = true;
            }
            return result;
        }

        /**
         * getHealth(providerId?)
         *   Real — "Unavailable" with zero providers (honest, not
         *   "Ready"). Otherwise defers to each provider's own
         *   getHealth() if implemented; a provider without one is
         *   reported "Ready" only because it registered successfully
         *   and declared nothing else — never upgraded beyond what's
         *   known.
         */
        async getHealth(providerId = null) {
            if (this.#classifiers.size === 0) return { state: "Unavailable", reason: "No classifier providers are registered.", providers: [] };
            const entries = providerId ? [this.#classifiers.get(providerId)].filter(Boolean) : [...this.#classifiers.values()];
            if (entries.length === 0) return { state: "Unavailable", reason: `No classifier registered with id "${providerId}".`, providers: [] };
            const providerHealth = await Promise.all(entries.map(async (entry) => {
                if (typeof entry.provider.getHealth === "function") {
                    try {
                        const h = await entry.provider.getHealth();
                        const state = HEALTH_STATES.includes(h && h.state) ? h.state : "Error";
                        return { id: entry.descriptor.id, state, reason: (h && h.reason) || null };
                    } catch (err) { return { id: entry.descriptor.id, state: "Error", reason: err.message }; }
                }
                return { id: entry.descriptor.id, state: "Ready", reason: null };
            }));
            const overall = providerHealth.some(p => p.state === "Ready") ? "Ready"
                : providerHealth.some(p => p.state === "Busy") ? "Busy"
                : providerHealth.some(p => p.state === "Loading") ? "Loading"
                : providerHealth.every(p => p.state === "Offline") ? "Offline"
                : "Error";
            return { state: overall, reason: null, providers: providerHealth };
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: HEARING_VERSION, registeredClassifiers: this.#classifiers.size, categoryCount: CATEGORIES.length, historyEntries: this.#history.length });
        }
    }

    if (window.CozyOS.CozyHearing && typeof window.CozyOS.CozyHearing.getVersion === "function") {
        const existingVersion = window.CozyOS.CozyHearing.getVersion();
        if (existingVersion !== HEARING_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: CozyHearing existing v${existingVersion} conflicts with load target v${HEARING_VERSION}.`);
        return;
    }

    window.CozyOS.CozyHearing = new CozyHearingEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "CozyHearing", category: "Platform", icon: "ear.svg",
                description: "Canonical Sound Classification owner. Real classifier registry + dispatch (classifySound/analyseSound), real capability/health aggregation from registered providers only. Zero providers registered ⇒ fails closed (isReal:false, confidence:null) — never fabricates a category or score. Providers register via registerClassifier(descriptor, provider); built in Milestone 158 proper."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
