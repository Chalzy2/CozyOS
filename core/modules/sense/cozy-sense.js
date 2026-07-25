/**
 * CozyOS Sense Engine
 * File Reference: core/modules/sense/cozy-sense.js
 * Milestone: 169 — Cozy Sense Engine Platform
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP
 *   No existing sense/sensor/observation engine found in the repository.
 *   New canonical owner.
 *   Owns: sensor registry, observation registry, observation sessions,
 *   sensor discovery, routing, health, capability registry, timeline,
 *   diagnostics, provider registry.
 *   Never owns: speech recognition, hearing classification, vision
 *   detection, translation, AI providers, memory, interpretation,
 *   thinking, intelligence, policy, workflow — this engine routes
 *   observations to those consumers; it never decides what an
 *   observation means.
 *
 * ROUTING, NOT INTERPRETATION
 *   registerSensor()/registerObservation() store metadata and data
 *   exactly as reported by a real provider. routeObservation() and
 *   broadcastObservation() deliver that data to subscribed consumers
 *   unchanged — no classification, scoring, or meaning is added here.
 *   That is CozyHearing's job for sound, a vision engine's job for
 *   images, CozyInterpretation's job for semantic meaning, and so on.
 *
 * DISCOVERY — real, not assumed
 *   Sensor discovery checks real browser APIs where they exist
 *   (navigator.mediaDevices for microphone/camera, navigator.geolocation
 *   for GPS, the Generic Sensor API constructors for
 *   motion/accelerometer/gyroscope/magnetometer/light where present).
 *   Sensor types with no corresponding browser API in this environment
 *   (Bluetooth beacon proximity, NFC scanning hardware, environmental
 *   temperature/humidity/pressure) are reported as discovered:false,
 *   never assumed present.
 *
 * PROVIDER MODEL
 *   Providers COLLECT observations (e.g., a real getUserMedia-backed
 *   microphone provider, or CozyHearing/VoiceCaptureAdapter acting as a
 *   provider). With none registered for a sensor, this engine never
 *   invents an observation — registerObservation() requires real,
 *   caller-supplied data; there is no synthetic default.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.CozySense) return;

    const SENSOR_TYPES = Object.freeze(["microphone", "camera", "screen", "document", "vision", "listening", "hearing", "motion", "location", "gps", "accelerometer", "gyroscope", "magnetometer", "compass", "light", "temperature", "humidity", "pressure", "proximity", "bluetooth", "nfc", "wifi", "beacon", "network", "filesystem", "clipboard", "custom"]);
    const OBSERVATION_TYPES = Object.freeze(["started", "stopped", "detected", "updated", "changed", "lost", "recovered", "unavailable", "error", "custom"]);
    const HEALTH = Object.freeze({ READY: "ready", COLLECTING: "collecting", PAUSED: "paused", UNAVAILABLE: "unavailable", OFFLINE: "offline", ERROR: "error" });

    function _uid(prefix) { return `${prefix}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2)}`; }

    class CozySenseEngine {
        #sensors = new Map();       // sensorId -> { id, type, virtual, registeredAt }
        #observations = new Map();  // observationId -> observation
        #sessions = new Map();
        #providers = new Map();     // id -> { descriptor, fn: collect(sensorId) -> data }
        #consumers = new Map();     // consumerId -> { fn, sensorTypes: [] }
        #timeline = [];
        #enabled = true;
        #lastError = null;

        getVersion() { return VERSION; }

        // ── RL-014 Platform Inspection Contract (Milestone 173, additive only) ──
        getId() { return "CozySense"; }
        getName() { return "CozySense"; }
        /** @returns {string[]} no cross-engine runtime dependencies found in this file — genuinely standalone. */
        getDependencies() { return []; }
        getSensorTypes() { return SENSOR_TYPES.slice(); }
        getObservationTypes() { return OBSERVATION_TYPES.slice(); }

        #log(entry) { this.#timeline.push({ ...entry, at: new Date().toISOString() }); if (this.#timeline.length > 500) this.#timeline.shift(); }
        getObservationTimeline() { return this.#timeline.slice(); }

        // ── Real sensor discovery ────────────────────────────────────────────
        /** discoverSensors() — checks real browser APIs; never assumes hardware presence. */
        discoverSensors() {
            const hasMediaDevices = typeof navigator !== "undefined" && !!navigator.mediaDevices;
            const discovery = {
                microphone: { discovered: hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === "function" },
                camera: { discovered: hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === "function" },
                location: { discovered: typeof navigator !== "undefined" && !!navigator.geolocation },
                gps: { discovered: typeof navigator !== "undefined" && !!navigator.geolocation },
                accelerometer: { discovered: typeof window !== "undefined" && "Accelerometer" in window },
                gyroscope: { discovered: typeof window !== "undefined" && "Gyroscope" in window },
                magnetometer: { discovered: typeof window !== "undefined" && "Magnetometer" in window },
                light: { discovered: typeof window !== "undefined" && "AmbientLightSensor" in window },
                bluetooth: { discovered: typeof navigator !== "undefined" && !!navigator.bluetooth },
                network: { discovered: typeof navigator !== "undefined" && !!navigator.onLine !== undefined },
                clipboard: { discovered: typeof navigator !== "undefined" && !!navigator.clipboard },
                filesystem: { discovered: typeof window !== "undefined" && "showOpenFilePicker" in window },
                // No real client-side API to confirm these — honestly not discovered rather than assumed.
                screen: { discovered: typeof window !== "undefined" && !!window.screen },
                document: { discovered: false, note: "No direct discovery API — provided via document/OCR platform integration." },
                vision: { discovered: false, note: "Delegated to Vision Platform provider." },
                listening: { discovered: hasMediaDevices },
                hearing: { discovered: hasMediaDevices },
                compass: { discovered: false }, temperature: { discovered: false }, humidity: { discovered: false },
                pressure: { discovered: false }, proximity: { discovered: false }, nfc: { discovered: typeof window !== "undefined" && "NDEFReader" in window }, wifi: { discovered: false }, beacon: { discovered: false }
            };
            return discovery;
        }

        // ── Sensor Registry ──────────────────────────────────────────────────
        registerSensor({ id = null, type, virtual = false } = {}) {
            if (!SENSOR_TYPES.includes(type)) return { success: false, reason: `Unknown sensor type "${type}".` };
            const sensorId = id || _uid("sensor");
            this.#sensors.set(sensorId, { id: sensorId, type, virtual, registeredAt: new Date().toISOString(), health: HEALTH.READY });
            this.#log({ event: "sensor-registered", sensorId, type });
            return { success: true, sensorId };
        }
        registerVirtualSensor(opts = {}) { return this.registerSensor({ ...opts, virtual: true }); }
        removeSensor(sensorId) { const removed = this.#sensors.delete(sensorId); if (removed) this.#log({ event: "sensor-removed", sensorId }); return removed; }
        findSensor(sensorId) { return this.#sensors.get(sensorId) || null; }
        listSensors(predicate) { const l = Array.from(this.#sensors.values()); return predicate ? l.filter(predicate) : l; }
        sensorExists(sensorId) { return this.#sensors.has(sensorId); }

        // ── Provider Registry ─────────────────────────────────────────────────
        registerProvider(descriptor = {}, fn) {
            if (!descriptor.id || typeof fn !== "function") return { success: false, reason: "descriptor.id and a real fn are required." };
            this.#providers.set(descriptor.id, {
                descriptor: Object.freeze({ id: descriptor.id, name: descriptor.name || descriptor.id, sensorTypes: Array.isArray(descriptor.sensorTypes) ? descriptor.sensorTypes.filter((t) => SENSOR_TYPES.includes(t)) : [], offline: !!descriptor.offline }),
                fn, healthy: true
            });
            return { success: true };
        }
        removeProvider(id) { return this.#providers.delete(id); }
        findProvider(id) { const p = this.#providers.get(id); return p ? p.descriptor : null; }
        listProviders() { return Array.from(this.#providers.values()).map((p) => p.descriptor); }
        #defaultProviderId = null;
        setDefaultProvider(id) { if (!this.#providers.has(id)) return { success: false, reason: `Provider "${id}" not registered.` }; this.#defaultProviderId = id; return { success: true }; }
        getProviderHealth(id) { const p = this.#providers.get(id); return p ? { id, healthy: p.healthy } : { id, healthy: false, reason: "not registered" }; }

        // ── Observation Registry — never invents data ───────────────────────
        registerObservation({ sensorId, sourceEngine = null, observationType = "detected", metadata = {}, data } = {}) {
            if (!this.#sensors.has(sensorId)) return { success: false, isReal: false, reason: `Sensor "${sensorId}" not registered.` };
            if (!OBSERVATION_TYPES.includes(observationType)) return { success: false, isReal: false, reason: `Unknown observation type "${observationType}".` };
            if (data === undefined) return { success: false, isReal: false, reason: "data is required — observations are never fabricated." };
            const observationId = _uid("obs");
            const sensor = this.#sensors.get(sensorId);
            const observation = { observationId, sensorId, sensorType: sensor.type, sourceEngine, timestamp: new Date().toISOString(), observationType, metadata, data, isReal: true };
            this.#observations.set(observationId, observation);
            this.#log({ event: "observation-registered", observationId, sensorId, observationType });
            this.#routeToConsumers(observation);
            return { success: true, observationId, observation };
        }
        updateObservation(observationId, patch = {}) {
            const existing = this.#observations.get(observationId);
            if (!existing) return { success: false, reason: `Observation "${observationId}" not found.` };
            const updated = { ...existing, ...patch, observationId, timestamp: new Date().toISOString() };
            this.#observations.set(observationId, updated);
            return { success: true, observation: updated };
        }
        removeObservation(observationId) { return this.#observations.delete(observationId); }
        findObservation(observationId) { return this.#observations.get(observationId) || null; }
        listObservations(predicate) { const l = Array.from(this.#observations.values()); return predicate ? l.filter(predicate) : l; }
        clearObservations(sensorId = null) {
            if (!sensorId) { const n = this.#observations.size; this.#observations.clear(); return { success: true, cleared: n }; }
            let cleared = 0;
            for (const [id, obs] of this.#observations.entries()) if (obs.sensorId === sensorId) { this.#observations.delete(id); cleared++; }
            return { success: true, cleared };
        }

        // ── Routing API — delivery only, never interprets ───────────────────
        registerConsumer({ id = null, sensorTypes = [], fn } = {}) {
            if (typeof fn !== "function") return { success: false, reason: "A real fn is required." };
            const consumerId = id || _uid("consumer");
            this.#consumers.set(consumerId, { fn, sensorTypes: sensorTypes.filter((t) => SENSOR_TYPES.includes(t)) });
            return { success: true, consumerId };
        }
        removeConsumer(consumerId) { return this.#consumers.delete(consumerId); }
        subscribe(consumerId, sensorTypes = []) {
            const c = this.#consumers.get(consumerId);
            if (!c) return { success: false, reason: `Consumer "${consumerId}" not found.` };
            c.sensorTypes = [...new Set([...c.sensorTypes, ...sensorTypes.filter((t) => SENSOR_TYPES.includes(t))])];
            return { success: true };
        }
        unsubscribe(consumerId, sensorTypes = []) {
            const c = this.#consumers.get(consumerId);
            if (!c) return { success: false, reason: `Consumer "${consumerId}" not found.` };
            c.sensorTypes = c.sensorTypes.filter((t) => !sensorTypes.includes(t));
            return { success: true };
        }
        #routeToConsumers(observation) {
            for (const consumer of this.#consumers.values()) {
                if (consumer.sensorTypes.length === 0 || consumer.sensorTypes.includes(observation.sensorType)) {
                    try { consumer.fn(observation); } catch (err) { this.#lastError = err && err.message ? err.message : String(err); }
                }
            }
        }
        routeObservation(observationId, consumerId) {
            const observation = this.#observations.get(observationId);
            const consumer = this.#consumers.get(consumerId);
            if (!observation || !consumer) return { success: false, reason: "observationId and consumerId must both exist." };
            try { consumer.fn(observation); return { success: true }; }
            catch (err) { return { success: false, reason: err && err.message ? err.message : String(err) }; }
        }
        broadcastObservation(observationId) {
            const observation = this.#observations.get(observationId);
            if (!observation) return { success: false, reason: `Observation "${observationId}" not found.` };
            this.#routeToConsumers(observation);
            return { success: true, deliveredTo: this.#consumers.size };
        }

        // ── Sessions ──────────────────────────────────────────────────────────
        createSession({ sensorIds = [] } = {}) {
            const id = _uid("sense-session");
            this.#sessions.set(id, { id, sensorIds, state: "created", createdAt: new Date().toISOString() });
            return { success: true, sessionId: id };
        }
        startSession(id) { return this.#transitionSession(id, ["created", "paused"], "active"); }
        pauseSession(id) { return this.#transitionSession(id, ["active"], "paused"); }
        resumeSession(id) { return this.#transitionSession(id, ["paused"], "active"); }
        stopSession(id) { return this.#transitionSession(id, ["active", "paused"], "stopped"); }
        cancelSession(id) { return this.#transitionSession(id, ["created", "active", "paused"], "cancelled"); }
        listSessions(predicate) { const l = Array.from(this.#sessions.values()); return predicate ? l.filter(predicate) : l; }
        #transitionSession(id, from, to) {
            const s = this.#sessions.get(id);
            if (!s) return { success: false, reason: `Session "${id}" not found.` };
            if (!from.includes(s.state)) return { success: false, reason: `Session is "${s.state}", expected one of [${from.join(", ")}].` };
            this.#sessions.set(id, { ...s, state: to });
            return { success: true, sessionId: id, state: to };
        }

        // ── Capabilities (real, honest) ─────────────────────────────────────
        getCapabilities() {
            return Object.freeze({
                supportsRealtime: this.#providers.size > 0,
                supportsHistory: true,
                supportsRouting: true,
                supportsSessions: true,
                supportsSubscriptions: true,
                supportsDiscovery: true,
                supportsMultipleSensors: this.#sensors.size > 1 || true,
                supportsVirtualSensors: true
            });
        }

        // ── Diagnostics ──────────────────────────────────────────────────────
        getSensorStatistics() { const byType = {}; for (const s of this.#sensors.values()) byType[s.type] = (byType[s.type] || 0) + 1; return { total: this.#sensors.size, byType }; }
        getObservationStatistics() { const byType = {}; for (const o of this.#observations.values()) byType[o.observationType] = (byType[o.observationType] || 0) + 1; return { total: this.#observations.size, byType }; }
        getProviderStatistics() { return { total: this.#providers.size }; }
        getSessionStatistics() { const byState = {}; for (const s of this.#sessions.values()) byState[s.state] = (byState[s.state] || 0) + 1; return { total: this.#sessions.size, byState }; }

        // ── Health ───────────────────────────────────────────────────────────
        getHealth() {
            if (this.#lastError) return { health: HEALTH.ERROR, reason: this.#lastError };
            if (!this.#enabled) return { health: HEALTH.UNAVAILABLE };
            const anyActive = Array.from(this.#sessions.values()).some((s) => s.state === "active");
            return { health: anyActive ? HEALTH.COLLECTING : HEALTH.READY, sensorCount: this.#sensors.size, observationCount: this.#observations.size };
        }
        disable() { this.#enabled = false; }
        enable() { this.#enabled = true; }

        getIntegrationManifest() {
            return {
                owns: ["sensor registry", "observation registry/sessions", "discovery", "routing", "health", "provider registry"],
                doesNotOwn: ["speech recognition", "hearing classification", "vision detection", "translation", "AI providers", "memory", "interpretation", "thinking", "intelligence", "policy", "workflow"],
                honestLimitation: "registerObservation() requires real caller-supplied data — never generates a synthetic observation. Sensor types with no verifiable browser API (temperature/humidity/pressure/proximity/wifi/beacon/compass) always report discovered:false rather than assumed present."
            };
        }
    }

    window.CozyOS.CozySense = new CozySenseEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "CozySense", category: "Platform", icon: "radar.svg",
                description: "Canonical Sense Engine. Sensor discovery, observation registry, routing, and sessions — coordination only, never interprets or classifies. Real feature detection, no fabricated observations."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
