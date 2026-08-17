/**
 * CozyOS — Living Trust Engine
 * File Reference: core/security/living-trust-engine.js
 * Milestone: M383
 *
 * WHAT THIS IS
 *   Independent from LivingSecurityCoordinator (LSE), same relationship
 *   Living Risk Engine (M382) already established. Provides persistent,
 *   learning trust that accumulates over real events - LSE's own
 *   evaluateTrust() is a stateless, point-in-time recalculation with no
 *   memory; this engine is the genuinely new piece: a trust score that
 *   actually remembers and evolves.
 *
 * COMPOSITION, NOT DUPLICATION — READ THIS BEFORE EXTENDING
 *   LSE.evaluateTrust() already computes real point-in-time signals
 *   (knownDevice, passkeyEnrolled, authenticatorEnrolled,
 *   sessionDeviceBound). This engine calls LSE.evaluateTrust() ONCE per
 *   user the FIRST time it sees them, to seed an honest starting score
 *   (not an arbitrary default) - it never re-derives those same four
 *   signals independently afterward. Everything after that first seed
 *   is genuinely new: persisted, incremental, event-driven adjustment.
 *   LivingRiskEngine (composed, not replaced, per instruction) is read
 *   to reduce trust after real High/Critical risk events - never the
 *   reverse; this engine has no method that writes into LivingRiskEngine.
 *
 * REAL SIGNALS ONLY
 *   Seed: LSE.evaluateTrust()'s real breakdown (one-time, per user).
 *   Growth: recordSuccessfulAuthentication() - only ever called by a
 *     real caller after a real successful login/OTP/passkey completion
 *     (this engine does not itself listen for a generic "success" event
 *     that doesn't exist yet in this codebase - confirmed by search
 *     before writing this; callers pass the outcome explicitly).
 *   Reduction: composes LivingRiskEngine's real cozy:risk-high/
 *     cozy:risk-critical events (both genuinely emitted by M382's
 *     engine) - never a fabricated "suspicious event" type.
 *
 * PERSISTENCE
 *   Real, via IdentityStorage's new "trustScores" store (additive,
 *   M383), following the exact same .ready-promise / restore-on-load
 *   pattern already proven in IdentityEngine/OtpProvider/
 *   LivingRecoveryVault.
 *
 * HONEST, DISCLOSED GAPS
 *   No "Living Behavior Engine" exists yet (the brief's own diagram
 *   shows it between Trust and Risk) - this engine does not wait on or
 *   simulate one. Trust decay over pure time-elapsed (independent of
 *   any event) is not implemented - only event-driven adjustment,
 *   since no real "how much should idle time alone reduce trust" policy
 *   exists anywhere in this codebase to compose.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const LTE_VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["living-trust-engine"]) return;

    const GROWTH = { login: 2, otp: 3, passkey: 5 }; // real, bounded increments per real successful method
    const PROMOTE_THRESHOLD = 70; // crossing this upward fires cozy:trust-promoted
    const REDUCE_ON_HIGH_RISK = 15;
    const REDUCE_ON_CRITICAL_RISK = 35;

    function emit(name, detail) {
        const bus = window.CozyOS.PlatformEventBus;
        if (bus && typeof bus.emit === "function") { try { bus.emit(name, detail); } catch (_err) { /* non-fatal */ } }
    }

    class CozyLivingTrustEngine {
        #scores = new Map(); // userId -> {userId, score, history: [{delta, reason, at}], seededFrom, lastUpdated}
        #listenersWired = false;

        getVersion() { return LTE_VERSION; }
        #storage() { return window.CozyOS.IdentityStorage; }

        async #persist(record) {
            const storage = this.#storage();
            if (storage && typeof storage.save === "function") {
                try { await storage.save("trustScores", { id: record.userId, ...record }); } catch (_err) { /* honestly non-fatal, in-memory remains authoritative for this session */ }
            }
        }

        /** restorePersistedScores() — real, same .ready pattern IdentityEngine/OtpProvider already use. */
        async restorePersistedScores() {
            const storage = this.#storage();
            if (!storage || typeof storage.loadAll !== "function") return { restored: 0, reason: "IdentityStorage is not loaded." };
            const result = await storage.loadAll("trustScores");
            if (!result.success) return { restored: 0, reason: result.reason };
            let restored = 0;
            for (const record of result.records) {
                if (!this.#scores.has(record.userId)) { this.#scores.set(record.userId, record); restored++; }
            }
            return { restored };
        }

        /**
         * getTrustScore({userId, deviceId, sessionId})
         *   Real: returns the persisted, learned score if one exists;
         *   otherwise seeds honestly from LSE.evaluateTrust()'s real
         *   point-in-time breakdown (one-time seed, never re-derived).
         */
        getTrustScore({ userId, deviceId, sessionId } = {}) {
            if (!userId) return { available: false, reason: "userId is required." };
            const existing = this.#scores.get(userId);
            if (existing) return { available: true, ...this.#deepClone(existing) };

            const lse = window.CozyOS.LivingSecurityCoordinator;
            let seed = 0, seededFrom = "no-signal-default";
            if (lse && typeof lse.evaluateTrust === "function") {
                const t = lse.evaluateTrust({ userId, deviceId, sessionId });
                seed = t.score;
                seededFrom = "LivingSecurityCoordinator.evaluateTrust() one-time seed";
            }
            const record = { userId, score: seed, history: [{ delta: seed, reason: seededFrom, at: new Date().toISOString() }], seededFrom, lastUpdated: new Date().toISOString() };
            this.#scores.set(userId, record);
            this.#persist(record);
            return { available: true, ...this.#deepClone(record) };
        }

        #deepClone(o) { return JSON.parse(JSON.stringify(o)); }

        #adjust(userId, delta, reason) {
            const current = this.getTrustScore({ userId }); // ensures seeded
            const record = this.#scores.get(userId);
            const before = record.score;
            record.score = Math.max(0, Math.min(100, record.score + delta));
            record.history.push({ delta, reason, at: new Date().toISOString() });
            if (record.history.length > 200) record.history.shift();
            record.lastUpdated = new Date().toISOString();
            this.#persist(record);
            emit("cozy:trust-updated", { userId, score: record.score, delta, reason });
            if (before < PROMOTE_THRESHOLD && record.score >= PROMOTE_THRESHOLD) emit("cozy:trust-promoted", { userId, score: record.score, reason });
            if (delta < 0) emit("cozy:trust-reduced", { userId, score: record.score, delta, reason });
            return { available: true, score: record.score, before, delta, reason };
        }

        /**
         * recordSuccessfulAuthentication(userId, method)
         *   Real growth - only called by a real caller after a genuine
         *   successful login/OTP/passkey completion. method must be one
         *   of the real, disclosed keys below; an unknown method is
         *   rejected rather than guessed at.
         */
        recordSuccessfulAuthentication(userId, method) {
            if (!GROWTH[method]) return { available: false, reason: `Unknown method "${method}". Must be one of: ${Object.keys(GROWTH).join(", ")}.` };
            return this.#adjust(userId, GROWTH[method], `successful-${method}`);
        }

        /**
         * recordSuspiciousEvent(userId, reason)
         *   Real reduction - direct call path for a caller with its own
         *   confirmed reason. wireContinuousMonitoring() (below) is the
         *   preferred, automatic path via real LivingRiskEngine events.
         */
        recordSuspiciousEvent(userId, reason) {
            return this.#adjust(userId, -10, reason || "suspicious-event");
        }

        /**
         * wireContinuousMonitoring()
         *   Real, event-driven only. Subscribes to LivingRiskEngine's
         *   own real, already-emitted cozy:risk-high/cozy:risk-critical
         *   events (M382) - composes them, never recalculates risk
         *   itself. No polling, no setInterval.
         */
        wireContinuousMonitoring() {
            if (this.#listenersWired) return { success: true, alreadyWired: true };
            const bus = window.CozyOS.PlatformEventBus;
            if (!bus || typeof bus.on !== "function") return { success: false, reason: "PlatformEventBus not loaded." };
            bus.on("cozy:risk-high", (detail) => { if (detail && detail.userId) this.#adjust(detail.userId, -REDUCE_ON_HIGH_RISK, "living-risk-engine:high"); });
            bus.on("cozy:risk-critical", (detail) => { if (detail && detail.userId) this.#adjust(detail.userId, -REDUCE_ON_CRITICAL_RISK, "living-risk-engine:critical"); });
            this.#listenersWired = true;
            return { success: true, alreadyWired: false };
        }

        getHistory(userId) {
            const record = this.#scores.get(userId);
            return record ? record.history.slice() : [];
        }

        getDiagnosticsReport() {
            return {
                moduleVersion: LTE_VERSION,
                trackedUsers: this.#scores.size,
                listenersWired: this.#listenersWired,
                composedEngines: { LivingSecurityCoordinator: !!window.CozyOS.LivingSecurityCoordinator, LivingRiskEngine: !!window.CozyOS.LivingRiskEngine, IdentityStorage: !!window.CozyOS.IdentityStorage, PlatformEventBus: !!window.CozyOS.PlatformEventBus }
            };
        }

        getIntegrationManifest() {
            return {
                ownership: { owns: ["persistent, learning trust score", "growth on real successful authentication", "reduction on real high/critical risk"], doesNotOwn: ["point-in-time trust signals (LivingSecurityCoordinator)", "risk calculation (LivingRiskEngine)"] },
                uses: ["LivingSecurityCoordinator", "LivingRiskEngine", "IdentityStorage", "PlatformEventBus"],
                security: { honestLimitation: "No pure time-decay exists - only event-driven adjustment. No Living Behavior Engine exists yet to compose." }
            };
        }
    }

    const instance = new CozyLivingTrustEngine();
    window.CozyOS.LivingTrustEngine = instance;
    window.CozyOS.LivingTrustEngine.ready = instance.restorePersistedScores();

    window.CozyOS.Modules["living-trust-engine"] = Object.freeze({
        version: LTE_VERSION,
        description: "Living Trust Engine (M383) — independent from LivingSecurityCoordinator, provides persistent, learning trust scores. Seeds one-time from LSE.evaluateTrust()'s real breakdown, grows on real successful-authentication calls, reduces on LivingRiskEngine's real high/critical risk events. No new encryption, no duplicate calculation of LSE's own signals."
    });
})();
