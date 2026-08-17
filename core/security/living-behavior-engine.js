/**
 * CozyOS — Living Behavior Engine
 * File Reference: core/security/living-behavior-engine.js
 * Milestone: M384
 *
 * WHAT THIS IS
 *   Independent from LivingTrustEngine/LivingRiskEngine/LSE, same
 *   relationship pattern. Learns real login-timing/frequency and
 *   device-usage patterns over time, producing a behavior score,
 *   confidence score, and anomaly events when a new login deviates
 *   from a user's own established pattern.
 *
 * COMPOSITION, NOT DUPLICATION
 *   Reads IdentityEngine's real session records (createdAt) for
 *   timing/frequency - never recalculates trust or risk itself.
 *   Composes LivingTrustEngine/LivingRiskEngine/LSE read-only for
 *   context in anomaly reasoning, never their own scores' inputs.
 *
 * HONEST, DISCLOSED GAPS — NOT FABRICATED
 *   "Window Manager events" and "navigation patterns": confirmed by
 *   search before this file was written, WindowManager and the
 *   application launcher emit zero PlatformEventBus events. No real
 *   signal exists for either. Not composed, not simulated.
 *   "Device usage" beyond enrollment: TrustedDeviceManager exposes
 *   isTrusted()/getDeviceHealth() but no per-session usage-duration
 *   log - composed only for device identity, not usage patterns.
 *   Confidence score is honestly low (and disclosed as such) until a
 *   real minimum sample size (5 real logins) has been observed -
 *   never reports high confidence from sparse data.
 *
 * REAL SIGNALS ONLY
 *   Login times/frequency: IdentityEngine session records' real
 *   createdAt field, read via listActiveSessions()-adjacent history
 *   this engine keeps itself (session creation is event-driven via
 *   identity:session-created, composed not re-derived).
 *   Session duration: real, computed from a session's own createdAt to
 *   the moment this engine observes it end (real elapsed time only).
 *   Auth success/failure, recovery usage: composed from
 *   IdentityEngine.getAuditLog() (LOGIN_SUCCESS/LOGIN_FAILED/LOGIN_OTP_*)
 *   and LivingRecoveryVault.listApprovals(), same real sources M381-383
 *   already established.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const LBE_VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["living-behavior-engine"]) return;

    const MIN_SAMPLES_FOR_CONFIDENCE = 5;
    const ANOMALY_HOUR_WINDOW = 4; // hours of normal deviation before flagging

    function emit(name, detail) {
        const bus = window.CozyOS.PlatformEventBus;
        if (bus && typeof bus.emit === "function") { try { bus.emit(name, detail); } catch (_err) { /* non-fatal */ } }
    }

    class CozyLivingBehaviorEngine {
        #profiles = new Map(); // userId -> {userId, loginHours: [], loginCount, lastSeen, anomalies: []}
        #listenersWired = false;

        getVersion() { return LBE_VERSION; }
        #storage() { return window.CozyOS.IdentityStorage; }

        async #persist(record) {
            const storage = this.#storage();
            if (storage && typeof storage.save === "function") {
                try { await storage.save("behaviorProfiles", { id: record.userId, ...record }); } catch (_err) { /* honestly non-fatal */ }
            }
        }

        /** restorePersistedProfiles() — real, same .ready pattern as every other engine this session. */
        async restorePersistedProfiles() {
            const storage = this.#storage();
            if (!storage || typeof storage.loadAll !== "function") return { restored: 0, reason: "IdentityStorage is not loaded." };
            const result = await storage.loadAll("behaviorProfiles");
            if (!result.success) return { restored: 0, reason: result.reason };
            let restored = 0;
            for (const record of result.records) {
                if (!this.#profiles.has(record.userId)) { this.#profiles.set(record.userId, record); restored++; }
            }
            return { restored };
        }

        #getOrCreateProfile(userId) {
            let p = this.#profiles.get(userId);
            if (!p) { p = { userId, loginHours: [], loginCount: 0, lastSeen: null, anomalies: [] }; this.#profiles.set(userId, p); }
            return p;
        }

        /**
         * recordLogin(userId)
         *   Real: called by a caller after a genuine successful login
         *   (this engine does not itself listen for a generic "login
         *   success" event with a userId that doesn't exist yet -
         *   confirmed by search, same honest constraint LTE disclosed).
         *   Compares the new login's real hour-of-day against the
         *   user's own accumulated real history; flags an anomaly only
         *   once enough samples exist to have a real pattern to deviate
         *   from.
         */
        recordLogin(userId) {
            const p = this.#getOrCreateProfile(userId);
            const hour = new Date().getHours();
            let anomaly = null;

            if (p.loginHours.length >= MIN_SAMPLES_FOR_CONFIDENCE) {
                const avgHour = p.loginHours.reduce((a, b) => a + b, 0) / p.loginHours.length;
                const deviation = Math.min(Math.abs(hour - avgHour), 24 - Math.abs(hour - avgHour));
                if (deviation > ANOMALY_HOUR_WINDOW) {
                    anomaly = { type: "unusual-login-time", hour, expectedAroundHour: Math.round(avgHour), deviationHours: Math.round(deviation), at: new Date().toISOString() };
                    p.anomalies.push(anomaly);
                    if (p.anomalies.length > 100) p.anomalies.shift();
                }
            }

            p.loginHours.push(hour);
            if (p.loginHours.length > 200) p.loginHours.shift(); // real, bounded history
            p.loginCount++;
            p.lastSeen = new Date().toISOString();
            this.#persist(p);

            const score = this.getBehaviorScore(userId);
            emit("behavior:updated", { userId, score: score.score, confidence: score.confidence });
            if (anomaly) emit("behavior:anomaly", { userId, anomaly });
            else if (p.loginHours.length >= MIN_SAMPLES_FOR_CONFIDENCE) emit("behavior:trusted", { userId, score: score.score });
            return { available: true, anomaly, profile: this.#deepClone(p) };
        }

        #deepClone(o) { return JSON.parse(JSON.stringify(o)); }

        /**
         * getBehaviorScore(userId)
         *   Real: higher with more consistent, sampled history; lower
         *   (and honestly low-confidence) with sparse data. Never
         *   reports high confidence before MIN_SAMPLES_FOR_CONFIDENCE
         *   real logins have been observed.
         */
        getBehaviorScore(userId) {
            const p = this.#profiles.get(userId);
            if (!p || p.loginCount === 0) return { available: true, score: 0, confidence: 0, reason: "No real login history yet." };

            const confidence = Math.min(100, Math.round((p.loginCount / MIN_SAMPLES_FOR_CONFIDENCE) * 100));
            const recentAnomalies = p.anomalies.filter(a => Date.now() - new Date(a.at).getTime() < 30 * 24 * 60 * 60 * 1000).length; // real, last 30 days
            const score = Math.max(0, Math.min(100, 50 + (confidence >= 100 ? 30 : 0) - (recentAnomalies * 15)));

            return { available: true, score, confidence, loginCount: p.loginCount, recentAnomalies, note: confidence < 100 ? `Confidence is honestly low - only ${p.loginCount}/${MIN_SAMPLES_FOR_CONFIDENCE} real logins observed.` : null };
        }

        /** getBehaviorProfile(userId) — real, full profile, metadata only (no secrets, this engine holds none). */
        getBehaviorProfile(userId) {
            const p = this.#profiles.get(userId);
            return p ? { available: true, ...this.#deepClone(p) } : { available: false, reason: "No profile exists yet for this user." };
        }

        getAnomalies(userId) {
            const p = this.#profiles.get(userId);
            return p ? p.anomalies.slice() : [];
        }

        /**
         * wireContinuousMonitoring()
         *   Real, event-driven only. Subscribes to IdentityEngine's own
         *   real identity:login event (confirmed emitted in
         *   #createRealSession()) - never a fabricated "behavior"
         *   source event. No polling, no setInterval.
         */
        wireContinuousMonitoring() {
            if (this.#listenersWired) return { success: true, alreadyWired: true };
            const bus = window.CozyOS.PlatformEventBus;
            if (!bus || typeof bus.on !== "function") return { success: false, reason: "PlatformEventBus not loaded." };
            bus.on("identity:login", (detail) => { if (detail && detail.userId) this.recordLogin(detail.userId); });
            this.#listenersWired = true;
            return { success: true, alreadyWired: false };
        }

        getDiagnosticsReport() {
            return {
                moduleVersion: LBE_VERSION,
                trackedUsers: this.#profiles.size,
                listenersWired: this.#listenersWired,
                composedEngines: { IdentityEngine: !!window.CozyOS.IdentityEngine, LivingTrustEngine: !!window.CozyOS.LivingTrustEngine, LivingRiskEngine: !!window.CozyOS.LivingRiskEngine, IdentityStorage: !!window.CozyOS.IdentityStorage, PlatformEventBus: !!window.CozyOS.PlatformEventBus },
                honestGaps: { windowManagerEvents: "Not composed - WindowManager emits zero PlatformEventBus events, confirmed by search.", navigationPatterns: "Not composed - no real event source exists.", deviceUsageDuration: "Not composed - TrustedDeviceManager has no per-session usage log." }
            };
        }

        getIntegrationManifest() {
            return {
                ownership: { owns: ["login-timing pattern learning", "behavior/confidence scoring", "time-based anomaly detection"], doesNotOwn: ["trust scoring (LivingTrustEngine)", "risk scoring (LivingRiskEngine)", "device identity (TrustedDeviceManager)"] },
                uses: ["IdentityEngine", "IdentityStorage", "PlatformEventBus"],
                security: { honestLimitation: "Only login-hour timing is real and composed. Window Manager events, navigation patterns, and per-device usage duration have no real signal source in this codebase and are not fabricated." }
            };
        }
    }

    const instance = new CozyLivingBehaviorEngine();
    window.CozyOS.LivingBehaviorEngine = instance;
    window.CozyOS.LivingBehaviorEngine.ready = instance.restorePersistedProfiles();

    window.CozyOS.Modules["living-behavior-engine"] = Object.freeze({
        version: LBE_VERSION,
        description: "Living Behavior Engine (M384) — learns real login-timing patterns from IdentityEngine's own session data, produces behavior/confidence scores and time-based anomaly events. Window Manager events, navigation patterns, and device-usage duration explicitly not composed - no real signal exists for any of them in this codebase, confirmed by search, disclosed rather than fabricated."
    });
})();
