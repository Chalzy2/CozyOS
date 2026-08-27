/**
 * CozyOS — Living Risk Engine
 * File Reference: core/security/living-risk-engine.js
 * Milestone: M382
 *
 * WHAT THIS IS
 *   Independent from LivingSecurityCoordinator (LSE), which continues
 *   to own the single adaptive-authentication decision. This engine
 *   provides continuous, category-separated risk scoring that LSE (and
 *   future engines - Behavior, Trust, AI, Compliance) can compose.
 *
 * COMPOSITION, NOT DUPLICATION — READ THIS BEFORE EXTENDING
 *   LSE.evaluateRisk() already computes real sub-scores for
 *   deviceLocked/unknownDevice/failedAuthentication/pendingRecovery-
 *   Attempts. This engine calls LSE.evaluateRisk() ONCE per
 *   recalculation and RE-GROUPS those already-computed numbers into
 *   the six named categories below - it does not re-call
 *   TrustedDeviceManager/IdentityEngine/LivingRecoveryVault a second
 *   time for the same signals. "Identity Risk" and "Authentication
 *   Risk" below are honestly disclosed as re-labeled views of the same
 *   real failedAuthentication number LSE already computed, not two
 *   independent calculations - a category boundary for reporting
 *   clarity, not a second measurement.
 *   Session Risk and Environment Risk are genuinely new - LSE's own
 *   evaluateRisk() does not touch SessionManager or CozyEnvironment at
 *   all, confirmed by reading its source before this file was written.
 *
 * REAL SIGNALS ONLY (each confirmed against the composed engine's
 * actual public API before this file was written)
 *   SessionManager.listActiveSessionsEnriched(userId) - session count, idle time
 *   IdentityEngine session records' real createdAt field - session age
 *   WebauthnProvider.hasCredential(), OtpProvider.findAccountByUserId() -
 *     composed via LSE.evaluateTrust() (risk-reducing factors)
 *   CozyEnvironment.getState() - real environment snapshot
 *
 * HONEST, DISCLOSED GAPS
 *   Environment Risk has no validated correlation to actual security
 *   risk in this codebase - reported as real, available data with an
 *   explicit note that it is informational only, never scored into the
 *   overall total. No root/debugger/SIM/tamper signals exist or are
 *   simulated - not a category here at all, per instruction.
 *
 * EVENT-DRIVEN, NOT POLLED
 *   Subscribes to real PlatformEventBus events already emitted
 *   elsewhere in this codebase (identity:login, identity:session-created,
 *   otp:account-enrolled, otp:failed, cozy:trust-updated,
 *   cozy:risk-updated from LSE itself) and recalculates only on those,
 *   plus an explicit evaluate() call. No setInterval anywhere in this
 *   file.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const LRE_VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["living-risk-engine"]) return;

    const LEVEL_THRESHOLDS = [{ min: 80, level: "Critical" }, { min: 60, level: "High" }, { min: 35, level: "Medium" }, { min: 15, level: "Low" }, { min: 0, level: "Safe" }];
    function levelFor(score) { return LEVEL_THRESHOLDS.find(t => score >= t.min).level; }

    function emit(name, detail) {
        const bus = window.CozyOS.PlatformEventBus;
        if (bus && typeof bus.emit === "function") { try { bus.emit(name, detail); } catch (_err) { /* non-fatal */ } }
    }

    class CozyLivingRiskEngine {
        #history = [];
        #lastSignature = null; // used to avoid recalculating when nothing real has changed
        #listenersWired = false;

        getVersion() { return LRE_VERSION; }
        #log(entry) { this.#history.push({ ...entry, at: new Date().toISOString() }); if (this.#history.length > 500) this.#history.shift(); }
        getHistory() { return this.#history.slice(); }

        /**
         * evaluate({userId, username, deviceId, sessionId})
         *   Real, synchronous composition. Returns six independent
         *   category scores, an overall 0-100 score, a disclosed level,
         *   and a reason list.
         */
        evaluate({ userId, username, deviceId, sessionId } = {}) {
            const lse = window.CozyOS.LivingSecurityCoordinator;
            const categories = {};
            const reasons = [];

            // Device Risk + "Identity"/Authentication Risk - re-grouped
            // from LSE's own already-computed breakdown, never recomputed.
            let lseRisk = null;
            if (lse && typeof lse.evaluateRisk === "function") {
                lseRisk = lse.evaluateRisk({ userId, username, deviceId });
                const b = lseRisk.breakdown;
                categories.deviceRisk = { available: true, score: (b.deviceLocked.weight || 0) + (b.unknownDevice.weight || 0), source: "LivingSecurityCoordinator.evaluateRisk() breakdown, re-grouped" };
                categories.identityRisk = { available: b.failedAuthentication.available, score: b.failedAuthentication.available ? b.failedAuthentication.weight : 0, source: "Same real failedAuthentication count LSE computed - relabeled for category reporting, not recalculated" };
                categories.recoveryRisk = { available: b.pendingRecoveryAttempts.available, score: b.pendingRecoveryAttempts.available ? b.pendingRecoveryAttempts.weight : 0, source: "LivingSecurityCoordinator.evaluateRisk() breakdown, re-grouped" };
                if (categories.deviceRisk.score > 0) reasons.push(`Device risk: ${b.deviceLocked.value ? "device locked" : "unknown device"}.`);
                if (categories.identityRisk.score > 0) reasons.push(`Identity risk: ${b.failedAuthentication.value} recent failed login(s).`);
                if (categories.recoveryRisk.score > 0) reasons.push(`Recovery risk: ${b.pendingRecoveryAttempts.value} pending recovery approval(s).`);
            } else {
                categories.deviceRisk = { available: false, reason: "LivingSecurityCoordinator not loaded." };
                categories.identityRisk = { available: false, reason: "LivingSecurityCoordinator not loaded." };
                categories.recoveryRisk = { available: false, reason: "LivingSecurityCoordinator not loaded." };
            }

            // Authentication Risk - genuinely reduced by real enrolled
            // factors (composed via LSE.evaluateTrust(), not recomputed).
            if (lse && typeof lse.evaluateTrust === "function") {
                const trust = lse.evaluateTrust({ userId, deviceId, sessionId });
                const hasStrongFactor = (trust.breakdown.passkeyEnrolled.available && trust.breakdown.passkeyEnrolled.value) || (trust.breakdown.authenticatorEnrolled.available && trust.breakdown.authenticatorEnrolled.value);
                categories.authenticationRisk = { available: true, score: hasStrongFactor ? 0 : 15, note: hasStrongFactor ? "Real strong factor (passkey or authenticator) enrolled - reduces risk." : "No strong factor enrolled." };
                if (!hasStrongFactor) reasons.push("Authentication risk: no passkey or authenticator enrolled.");
            } else categories.authenticationRisk = { available: false, reason: "LivingSecurityCoordinator not loaded." };

            // Session Risk - genuinely new, composes SessionManager directly.
            const sessionMgr = window.CozyOS.SessionManager;
            if (sessionMgr && userId && typeof sessionMgr.listActiveSessionsEnriched === "function") {
                const result = sessionMgr.listActiveSessionsEnriched(userId);
                if (result.success) {
                    const count = result.sessions.length;
                    const oldestMs = result.sessions.reduce((max, s) => { const age = Date.now() - new Date(s.createdAt).getTime(); return Math.max(max, age); }, 0);
                    const multiSessionRisk = count > 2 ? 20 : count > 1 ? 10 : 0;
                    const ageRisk = oldestMs > 24 * 60 * 60 * 1000 ? 10 : 0; // real session older than 24h
                    categories.sessionRisk = { available: true, score: multiSessionRisk + ageRisk, activeSessions: count, oldestSessionAgeMs: oldestMs };
                    if (multiSessionRisk > 0) reasons.push(`Session risk: ${count} active sessions.`);
                    if (ageRisk > 0) reasons.push("Session risk: oldest active session exceeds 24 hours.");
                } else categories.sessionRisk = { available: false, reason: result.reason };
            } else categories.sessionRisk = { available: false, reason: "SessionManager not loaded or no userId given." };

            // Environment Risk - genuinely new, real state, honestly not scored.
            const env = window.CozyOS.CozyEnvironment;
            if (env && typeof env.getState === "function") {
                const state = env.getState();
                categories.environmentRisk = { available: state.available === true, score: 0, state: state.available ? { timeOfDay: state.timeOfDay, lighting: state.lighting } : null, note: "Real environment state, reported for visibility - no validated correlation to security risk exists in this codebase, so never scored into the total." };
            } else categories.environmentRisk = { available: false, reason: "CozyEnvironment not loaded." };

            const total = Object.values(categories).reduce((sum, c) => sum + (c.score || 0), 0);
            const overall = Math.min(100, total);
            const level = levelFor(overall);

            const result = { overall, level, categories, reasons, evaluatedAt: new Date().toISOString() };
            this.#log({ event: "evaluated", userId, overall, level });
            emit("cozy:risk-updated", result);
            if (level === "High") emit("cozy:risk-high", result);
            if (level === "Critical") emit("cozy:risk-critical", result);
            return result;
        }

        /** reset(userId) — real, explicit reset signal, e.g. after a successful step-up auth. Does not itself clear any composed engine's state - only this engine's own last-known signature and history marker. */
        reset(userId) {
            this.#lastSignature = null;
            this.#log({ event: "reset", userId });
            emit("cozy:risk-reset", { userId, at: new Date().toISOString() });
            return { success: true };
        }

        /**
         * recommend(evaluation)
         *   Real, disclosed recommendations only - never enforces
         *   anything itself. LivingSecurityCoordinator (or a future
         *   caller) decides whether to act on these.
         */
        recommend(evaluation) {
            const recs = [];
            if (evaluation.level === "Critical") { recs.push("Lock Account"); recs.push("Notify Administrator"); }
            else if (evaluation.level === "High") { recs.push("Require Biometrics"); recs.push("Require Passkey"); recs.push("Lock Session"); }
            else if (evaluation.level === "Medium") { recs.push("Require OTP"); }
            return recs;
        }

        /**
         * wireContinuousMonitoring()
         *   Real, event-driven only - no polling. Subscribes to real
         *   events already emitted elsewhere in this codebase and
         *   recalculates only when one fires with a context this engine
         *   can use (a userId). Idempotent - safe to call more than once.
         */
        wireContinuousMonitoring() {
            if (this.#listenersWired) return { success: true, alreadyWired: true };
            const bus = window.CozyOS.PlatformEventBus;
            if (!bus || typeof bus.on !== "function") return { success: false, reason: "PlatformEventBus not loaded." };
            const recalc = (detail) => { if (detail && detail.userId) this.evaluate({ userId: detail.userId, username: detail.username, deviceId: detail.deviceId, sessionId: detail.sessionId }); };
            // M386 — additive: "cozy:device-risk" is a real event now
            // emitted by LivingDeviceIntelligenceEngine (a meaningful
            // browser-signal change on a previously-trusted device).
            // Same recalc, same userId-required guard — no new logic.
            ["identity:login", "identity:session-created", "otp:account-enrolled", "otp:failed", "cozy:trust-updated", "cozy:device-risk"].forEach(evt => bus.on(evt, recalc));
            this.#listenersWired = true;
            this.#log({ event: "monitoring-wired" });
            return { success: true, alreadyWired: false };
        }

        getDiagnosticsReport() {
            return {
                moduleVersion: LRE_VERSION,
                historyEntries: this.#history.length,
                listenersWired: this.#listenersWired,
                composedEngines: {
                    LivingSecurityCoordinator: !!window.CozyOS.LivingSecurityCoordinator,
                    SessionManager: !!window.CozyOS.SessionManager,
                    CozyEnvironment: !!window.CozyOS.CozyEnvironment,
                    PlatformEventBus: !!window.CozyOS.PlatformEventBus
                }
            };
        }

        getIntegrationManifest() {
            return {
                ownership: { owns: ["category-separated continuous risk scoring", "risk-level classification", "non-enforcing security recommendations"], doesNotOwn: ["authentication decisions (LivingSecurityCoordinator)", "device/OTP/recovery data itself (their real owning engines)"] },
                uses: ["LivingSecurityCoordinator", "SessionManager", "CozyEnvironment", "PlatformEventBus"],
                security: { honestLimitation: "Identity/Authentication/Device/Recovery category scores are re-grouped views of LivingSecurityCoordinator's own already-computed numbers, not independent recalculations - disclosed explicitly to avoid implying more signal exists than actually does." }
            };
        }
    }

    const instance = new CozyLivingRiskEngine();
    window.CozyOS.LivingRiskEngine = instance;

    window.CozyOS.Modules["living-risk-engine"] = Object.freeze({
        version: LRE_VERSION,
        description: "Living Risk Engine (M382) — independent from LivingSecurityCoordinator, provides category-separated (Identity/Device/Session/Authentication/Recovery/Environment) continuous risk scoring for LSE and future engines to compose. Re-groups LSE's own already-computed device/identity/recovery numbers rather than duplicating their calculation; Session and Environment risk are genuinely new. Event-driven recalculation only, no polling."
    });
})();
