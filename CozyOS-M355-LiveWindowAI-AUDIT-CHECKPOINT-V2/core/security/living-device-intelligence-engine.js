/**
 * CozyOS — Living Device Intelligence Engine (LDIE)
 * File Reference: core/security/living-device-intelligence-engine.js
 * Milestone: M386
 * Layer: Core / Shared Engine — composes existing verified systems only.
 *
 * RESPONSIBILITY
 *   Builds a persistent device profile from real browser signals,
 *   measures device confidence (signal completeness + observation
 *   consistency — NOT a trust or risk score), detects meaningful
 *   device change, and correlates with TrustedDeviceManager's real
 *   registered-device records. Never authenticates a user and never
 *   calculates trust or risk itself — those numbers stay owned by
 *   LivingTrustEngine / LivingRiskEngine; this engine only feeds them
 *   events to react to, exactly like LivingBehaviorEngine already does.
 *
 * COMPOSED (real, verified, unmodified except where noted)
 *   - window.CozyOS.TrustedDeviceManager — generateFingerprint() (the
 *     SAME real SHA-256(userAgent|screen|timezone) hash already used
 *     for 30-day trust tracking, reused here as-is rather than
 *     duplicated) and, when a userId is known, findDeviceForUser() /
 *     isTrusted() / getDeviceHealth() for real trust correlation.
 *   - window.CozyOS.IdentityStorage — new "deviceProfiles" store
 *     (additive, DB_VERSION bumped 6→7 in identity-storage.js,
 *     following the exact same precedent as M383's "trustScores" and
 *     M384's "behaviorProfiles" — existing databases upgrade in
 *     place, no other store touched).
 *   - window.CozyOS.PlatformEventBus — the same real bus every other
 *     Living* engine uses, no new event system.
 *
 * HONEST DISCLOSURE — SIGNALS ACTUALLY READ
 *   platform (navigator.platform — browsers are increasingly freezing
 *   this string for privacy; reported as-is, not corrected), browser
 *   (navigator.userAgent), language (navigator.language), timeZone
 *   (Intl.DateTimeFormat), screen width/height, devicePixelRatio,
 *   colorScheme (matchMedia "prefers-color-scheme"), touch capability
 *   (navigator.maxTouchPoints > 0), pointer capability (matchMedia
 *   "pointer: coarse/fine"). Every field is read directly from a real
 *   browser API with no fabricated fallback value — an unavailable
 *   signal is reported as `null`, never guessed.
 *
 * MANDATORY RULE — NOT IMPLEMENTED, BY DESIGN
 *   Root/jailbreak detection, SIM info, Bluetooth/USB device lists,
 *   hardware serial numbers, debugger detection, memory-tamper
 *   detection — none of these are real, standard browser-accessible
 *   signals. Not fabricated. `unavailableSignals` in the returned
 *   profile lists them explicitly instead of silently omitting them.
 *
 * HONEST DISCLOSURE — FAILED-LOGIN LEARNING
 *   The spec's "Failed logins" learning field is kept in the schema
 *   for forward compatibility but is never incremented today: a
 *   search of identity-engine.js confirms no real
 *   "identity:login-failed" (or equivalent) event is emitted anywhere
 *   in this repository on a failed login. Documented rather than
 *   invented — matches LivingBehaviorEngine's M384 disclosure of the
 *   same kind of absent signal.
 *
 * EVENT-DRIVEN, NO POLLING
 *   observe() is called by a real caller (e.g. the login flow) with
 *   an optional userId — this engine does not poll for device state
 *   on its own. Publishes only cozy:device-known, cozy:device-new,
 *   cozy:device-updated, cozy:device-risk, cozy:device-trusted.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["living-device-intelligence-engine"]) return;

    const LDIE_VERSION = "1.0.0-ENTERPRISE";
    const STORE = "deviceProfiles";
    // Fields that are expected to legitimately change often (e.g. a
    // resized/rotated window) and are therefore excluded from
    // "meaningful change" detection — only fields that genuinely
    // indicate a different physical device/browser trigger a change
    // event, to avoid false "device-updated" noise.
    const VOLATILE_FIELDS = new Set(["screenWidth", "screenHeight", "colorScheme"]);

    function emit(name, detail) {
        const bus = window.CozyOS.PlatformEventBus;
        if (bus && typeof bus.emit === "function") { try { bus.emit(name, detail); } catch (_err) { /* non-fatal */ } }
    }

    class CozyLivingDeviceIntelligenceEngine {
        #history = [];

        #log(entry) {
            this.#history.push({ ...entry, at: new Date().toISOString() });
            if (this.#history.length > 200) this.#history.shift();
        }

        #storage() { return window.CozyOS.IdentityStorage; }

        /**
         * #readSignals() — real, synchronous browser signals only.
         * Every field traced to a real API; unavailable → null, never
         * a fabricated default.
         */
        #readSignals() {
            const nav = (typeof navigator !== "undefined") ? navigator : {};
            const scr = (typeof screen !== "undefined") ? screen : {};
            let timeZone = null;
            try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (_e) { /* honestly unavailable */ }
            let colorScheme = null;
            let pointerCoarse = null;
            if (typeof matchMedia === "function") {
                try { colorScheme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch (_e) { /* honestly unavailable */ }
                try { pointerCoarse = matchMedia("(pointer: coarse)").matches; } catch (_e) { /* honestly unavailable */ }
            }
            return {
                platform: nav.platform || null,
                browser: nav.userAgent || null,
                language: nav.language || null,
                timeZone,
                screenWidth: typeof scr.width === "number" ? scr.width : null,
                screenHeight: typeof scr.height === "number" ? scr.height : null,
                pixelRatio: (typeof window !== "undefined" && typeof window.devicePixelRatio === "number") ? window.devicePixelRatio : null,
                colorScheme,
                touchCapable: typeof nav.maxTouchPoints === "number" ? nav.maxTouchPoints > 0 : null,
                pointerCoarse
            };
        }

        /**
         * #confidence(signals, priorObservationCount)
         *   Real, non-trust, non-risk measure: what fraction of the
         *   signals we attempted to read actually came back with a
         *   real value, blended with how many times this exact
         *   fingerprint has genuinely been observed before (a device
         *   seen once is less "known" than one seen fifty times).
         *   This is deliberately NOT a security score — it is the
         *   completeness/consistency number LivingTrustEngine and
         *   LivingRiskEngine can factor in on their own terms.
         */
        #confidence(signals, priorObservationCount) {
            const fields = Object.values(signals);
            const known = fields.filter(v => v !== null && v !== undefined).length;
            const completeness = fields.length ? known / fields.length : 0;
            const consistency = Math.min(1, priorObservationCount / 10); // caps at 10 real observations
            return Math.round(((completeness * 0.6) + (consistency * 0.4)) * 100) / 100;
        }

        /**
         * #diffSignals(previous, current) — real field-by-field diff,
         * excluding VOLATILE_FIELDS. Returns [] when nothing
         * meaningful changed.
         */
        #diffSignals(previous, current) {
            const changed = [];
            for (const key of Object.keys(current)) {
                if (VOLATILE_FIELDS.has(key)) continue;
                if (previous[key] !== current[key]) changed.push({ field: key, from: previous[key], to: current[key] });
            }
            return changed;
        }

        /**
         * observe({ userId })
         *   The one real entry point. Reads real signals, derives the
         *   real fingerprint from TrustedDeviceManager (never
         *   re-hashed here), loads/updates the persisted profile, and
         *   publishes exactly one of cozy:device-known /
         *   cozy:device-new — plus cozy:device-updated /
         *   cozy:device-risk / cozy:device-trusted when applicable.
         */
        async observe({ userId } = {}) {
            const tdm = window.CozyOS.TrustedDeviceManager;
            if (!tdm || typeof tdm.generateFingerprint !== "function") {
                return { success: false, reason: "TrustedDeviceManager is not loaded — cannot derive a device identity anchor without it." };
            }
            const signals = this.#readSignals();
            const fingerprint = await tdm.generateFingerprint();
            const storage = this.#storage();
            let existing = null;
            if (storage && typeof storage.loadAll === "function") {
                try {
                    const result = await storage.loadAll(STORE);
                    if (result.success) existing = result.records.find(r => r.id === fingerprint) || null;
                } catch (_err) { /* honestly non-fatal — treated as unknown for this call */ }
            }

            const now = new Date().toISOString();
            const isKnown = !!existing;
            const changeSummary = isKnown ? this.#diffSignals(existing.signals, signals) : [];
            const observationCount = isKnown ? (existing.observationCount || 0) + 1 : 1;
            const confidence = this.#confidence(signals, isKnown ? existing.observationCount || 0 : 0);

            // Real, read-only trust correlation — never computed here.
            let reputation = { known: isKnown, trusted: null, deviceId: null, reason: "No userId supplied — trust correlation requires TrustedDeviceManager's per-user record." };
            if (userId && typeof tdm.findDeviceForUser === "function") {
                const registered = tdm.findDeviceForUser(userId, fingerprint);
                if (registered) {
                    const trust = typeof tdm.isTrusted === "function" ? tdm.isTrusted(registered.deviceId) : { trusted: null };
                    reputation = { known: true, trusted: !!trust.trusted, deviceId: registered.deviceId, reason: trust.reason || null };
                } else {
                    reputation = { known: isKnown, trusted: false, deviceId: null, reason: "No TrustedDeviceManager registration exists yet for this user+device." };
                }
            }

            const record = {
                id: fingerprint,
                fingerprint,
                signals,
                unavailableSignals: ["rootDetection", "jailbreakDetection", "simInfo", "bluetoothDevices", "usbDevices", "hardwareSerial", "debuggerDetection", "memoryTamperDetection"],
                firstSeen: isKnown ? existing.firstSeen : now,
                lastSeen: now,
                successfulLogins: (isKnown ? existing.successfulLogins || 0 : 0) + (userId ? 1 : 0),
                failedLogins: isKnown ? existing.failedLogins || 0 : 0, // never incremented — see file header disclosure
                trustTrend: reputation.trusted === true ? "trusted" : (reputation.trusted === false ? "untrusted" : "unknown"),
                observationCount
            };

            if (storage && typeof storage.save === "function") {
                try { await storage.save(STORE, record); } catch (_err) { /* honestly non-fatal — in-memory result still returned */ }
            }

            const publicProfile = {
                deviceId: fingerprint,
                deviceProfile: { signals: record.signals, unavailableSignals: record.unavailableSignals, firstSeen: record.firstSeen, lastSeen: record.lastSeen, observationCount },
                deviceConfidence: confidence,
                deviceReputation: reputation,
                deviceChangeSummary: changeSummary
            };

            this.#log({ event: isKnown ? "device-known" : "device-new", deviceId: fingerprint, userId: userId || null });
            emit(isKnown ? "cozy:device-known" : "cozy:device-new", { ...publicProfile, userId: userId || null });

            if (isKnown && changeSummary.length > 0) {
                emit("cozy:device-updated", { ...publicProfile, userId: userId || null });
                // A meaningful signal change on a device that was
                // previously trusted is exactly the kind of thing
                // LivingRiskEngine should factor in — real, honest
                // signal, not a fabricated risk number computed here.
                if (reputation.trusted === true) emit("cozy:device-risk", { ...publicProfile, userId: userId || null, reason: "Meaningful signal change on a previously-trusted device." });
            }
            if (reputation.trusted === true) emit("cozy:device-trusted", { ...publicProfile, userId: userId || null });

            return { success: true, ...publicProfile };
        }

        /** getContext(fingerprint) — real, read-only shape for LivingAIContextEngine. Never fabricates a profile that wasn't actually observed. */
        async getContext(fingerprint) {
            const storage = this.#storage();
            if (!storage || typeof storage.loadAll !== "function") return { available: false, reason: "IdentityStorage not loaded." };
            try {
                const result = await storage.loadAll(STORE);
                if (!result.success) return { available: false, reason: "Storage read failed." };
                const record = result.records.find(r => r.id === fingerprint);
                if (!record) return { available: false, reason: "No observed profile for this device yet." };
                return {
                    available: true,
                    knownDevice: true,
                    deviceConfidence: this.#confidence(record.signals, record.observationCount || 0),
                    deviceAge: record.firstSeen,
                    trustTrend: record.trustTrend
                };
            } catch (_err) { return { available: false, reason: "Storage read failed." }; }
        }

        getHistory() { return this.#history.slice(); }

        getVersion() { return LDIE_VERSION; }

        getDiagnosticsReport() {
            return {
                moduleVersion: LDIE_VERSION,
                historyEntries: this.#history.length,
                composedEngines: {
                    TrustedDeviceManager: !!window.CozyOS.TrustedDeviceManager,
                    IdentityStorage: !!window.CozyOS.IdentityStorage,
                    PlatformEventBus: !!window.CozyOS.PlatformEventBus
                }
            };
        }

        getIntegrationManifest() {
            return {
                ownership: {
                    owns: ["persistent device profile from real browser signals", "device confidence (signal completeness + observation consistency)", "device change detection", "known/new device determination"],
                    doesNotOwn: ["trust scoring (LivingTrustEngine)", "risk scoring (LivingRiskEngine)", "device registration/30-day trust lifecycle (TrustedDeviceManager)", "authentication decisions (never — this engine never authenticates a user)"]
                },
                uses: ["TrustedDeviceManager", "IdentityStorage", "PlatformEventBus"],
                honestLimitation: "Fingerprint is the same real, non-tamper-proof convenience signal already disclosed in trusted-device-manager.js — not a hardware identifier. failedLogins is schema-present but never incremented: no real failed-login event exists anywhere in this repository today."
            };
        }
    }

    const instance = new CozyLivingDeviceIntelligenceEngine();
    window.CozyOS.LivingDeviceIntelligenceEngine = instance;

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                sourcePath: "core/security/living-device-intelligence-engine.js",
                name: "LivingDeviceIntelligenceEngine", category: "Platform", icon: "smartphone.svg",
                description: "Real browser-signal device profiling, confidence, and change detection. Composes TrustedDeviceManager for fingerprint/trust correlation. Never authenticates and never computes trust or risk itself."
            });
        } catch (_err) { /* non-fatal */ }
    }

    window.CozyOS.Modules["living-device-intelligence-engine"] = Object.freeze({
        version: LDIE_VERSION,
        description: "Living Device Intelligence Engine (M386) — real browser-signal device profiling, confidence, and change detection. Composes TrustedDeviceManager (fingerprint + trust correlation), IdentityStorage (new deviceProfiles store), PlatformEventBus. No root/jailbreak/SIM/Bluetooth/USB/hardware-serial/debugger/memory-tamper signals — none of those are real browser APIs, documented rather than fabricated. Never authenticates; never computes trust or risk itself."
    });
})();
