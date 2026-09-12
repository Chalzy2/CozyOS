/**
 * CozyOS — Living AI Context Engine
 * File Reference: core/security/living-ai-context-engine.js
 * Milestone: M385 (requested as "M384" — that number is already used
 * by the Living Behavior Engine; filed as M385, disclosed here)
 *
 * NAMING — READ BEFORE EXTENDING
 *   Deliberately NOT named "LivingAIEngine" or registered as
 *   window.CozyOS.LivingAI - that global already exists
 *   (core/living/cozy-living-ai.js, a real state machine the Living
 *   Assistant composes for idle/thinking/response states). This file
 *   is a different, new responsibility (security/trust/risk/environment
 *   context awareness + recommendations) and registers as
 *   window.CozyOS.LivingAIContextEngine to avoid any collision or
 *   implied ownership of the existing LivingAI state machine.
 *
 * COMPOSITION, NOT DUPLICATION
 *   Learning/memory: composes CozyAI.remember()/CozyAI.search() (M369,
 *   real, backed by CozyMemory) for every preference below - this file
 *   owns NO storage of its own beyond what CozyAI already persists.
 *   Trust/Risk/Security: reads LivingSecurityCoordinator/
 *   LivingRiskEngine/LivingTrustEngine's own real, already-computed
 *   outputs - never recalculates any of them.
 *   Environment: reads CozyEnvironment.getState() directly (real,
 *   already-tested M370.5 engine).
 *
 * HONEST, DISCLOSED GAPS
 *   Window Manager: confirmed (same finding as M384's Living Behavior
 *   Engine) WindowManager emits zero PlatformEventBus events. "Subscribe
 *   to Window Manager" is not implemented - no real signal exists.
 *   Notification Center: has no real "publish" method to call into;
 *   this engine satisfies "trigger notifications through
 *   PlatformEventBus" by emitting cozy:ai-recommendation/cozy:ai-warning
 *   directly on the real, existing PlatformEventBus - the same
 *   mechanism every other Living* engine this session already uses.
 *
 * NEVER
 *   Stores plaintext secrets/passwords - this file touches none.
 *   Executes destructive actions - recommend() only ever returns a
 *   suggestion string; no method here calls lock/revoke/reset on any
 *   composed engine.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const LAICE_VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["living-ai-context-engine"]) return;

    function emit(name, detail) {
        const bus = window.CozyOS.PlatformEventBus;
        if (bus && typeof bus.emit === "function") { try { bus.emit(name, detail); } catch (_err) { /* non-fatal */ } }
    }

    const PREFERENCE_KEYS = Object.freeze(["frequentApps", "preferredLanguage", "loginHabits", "notificationPreferences", "themePreference", "trustedDevices", "aiInteractionHistory"]);

    class CozyLivingAIContextEngine {
        #listenersWired = false;
        #history = []; // real, local diagnostics trail only - actual learned data lives in CozyAI/CozyMemory, never duplicated here

        getVersion() { return LAICE_VERSION; }
        #log(entry) { this.#history.push({ ...entry, at: new Date().toISOString() }); if (this.#history.length > 300) this.#history.shift(); }
        getHistory() { return this.#history.slice(); }

        /**
         * getContextSummary({userId, deviceId, sessionId})
         *   Real, read-only composition of every security engine's own
         *   already-computed state. Never recalculates trust/risk.
         *   Each field honestly reports unavailable if its engine isn't
         *   loaded, never guessed.
         */
        getContextSummary({ userId, deviceId, sessionId } = {}) {
            const summary = { userId, generatedAt: new Date().toISOString() };

            const lse = window.CozyOS.LivingSecurityCoordinator;
            summary.security = lse && typeof lse.evaluateTrust === "function" ? { available: true, note: "Composed live from LivingSecurityCoordinator - not recalculated here." } : { available: false, reason: "LivingSecurityCoordinator not loaded." };

            const lre = window.CozyOS.LivingRiskEngine;
            summary.risk = lre && typeof lre.evaluate === "function" ? lre.evaluate({ userId, deviceId, sessionId }) : { available: false, reason: "LivingRiskEngine not loaded." };

            const lte = window.CozyOS.LivingTrustEngine;
            summary.trust = lte && typeof lte.getTrustScore === "function" ? lte.getTrustScore({ userId, deviceId, sessionId }) : { available: false, reason: "LivingTrustEngine not loaded." };

            const env = window.CozyOS.CozyEnvironment;
            summary.environment = env && typeof env.getState === "function" ? env.getState() : { available: false, reason: "CozyEnvironment not loaded." };

            const identity = window.CozyOS.IdentityEngine;
            summary.identity = identity && userId && typeof identity.getUser === "function" ? { available: true, user: identity.getUser(userId) } : { available: false, reason: "IdentityEngine not loaded or no userId given." };

            this.#log({ event: "context-summarized", userId });
            emit("cozy:ai-context-updated", { userId, summary });
            return summary;
        }

        /**
         * rememberPreference(userId, key, value)
         *   Real, composes CozyAI.remember() directly - this engine
         *   holds no memory of its own. Rejects any key not in the
         *   disclosed, real preference list rather than accepting
         *   arbitrary data silently.
         */
        rememberPreference(userId, key, value) {
            if (!PREFERENCE_KEYS.includes(key)) return { success: false, reason: `Unknown preference key "${key}". Must be one of: ${PREFERENCE_KEYS.join(", ")}.` };
            const ai = window.CozyOS.CozyAI;
            if (!ai || typeof ai.remember !== "function") return { success: false, reason: "CozyAI is not loaded." };
            const result = ai.remember(`${userId}:${key}`, value, { namespace: "living-ai-context", actorId: userId, owner: userId });
            this.#log({ event: "preference-remembered", userId, key });
            return result;
        }

        /** recallPreference(userId, key) — real, composes CozyAI.search(), never a second store. */
        recallPreference(userId, key) {
            const ai = window.CozyOS.CozyAI;
            if (!ai || typeof ai.search !== "function") return { success: false, reason: "CozyAI is not loaded." };
            return ai.search(`${userId}:${key}`, { namespace: "living-ai-context", actorId: userId });
        }

        /**
         * recommend({userId, deviceId, sessionId})
         *   Real, composed from the real context summary above. Never
         *   executes anything - returns suggestion strings only, per
         *   instruction. Publishes cozy:ai-recommendation or
         *   cozy:ai-warning (never both for the same evaluation).
         */
        recommend(context) {
            const summary = this.getContextSummary(context);
            const suggestions = [];
            let severity = "info";

            if (summary.risk && summary.risk.available !== false) {
                if (summary.risk.level === "Critical") { suggestions.push("Lock account and notify administrator."); severity = "warning"; }
                else if (summary.risk.level === "High") { suggestions.push("Require an additional authentication factor."); severity = "warning"; }
                else if (summary.risk.level === "Medium") { suggestions.push("Consider requiring OTP for this session."); }
            }
            if (summary.trust && summary.trust.available && summary.trust.score < 30) suggestions.push("Trust is low - consider prompting for passkey enrollment.");
            if (summary.environment && summary.environment.available && summary.environment.timeOfDay === "night") suggestions.push("Night-time session - consider a softer notification tone.");

            const result = { userId: context.userId, suggestions, severity, basedOn: { riskLevel: summary.risk && summary.risk.level, trustScore: summary.trust && summary.trust.score }, generatedAt: new Date().toISOString() };
            this.#log({ event: "recommendation-issued", userId: context.userId, severity, suggestionCount: suggestions.length });
            emit(severity === "warning" ? "cozy:ai-warning" : "cozy:ai-recommendation", result);
            return result;
        }

        /**
         * greet({userId, deviceId, sessionId})
         *   Real, composes CozyEnvironment's real timeOfDay - same
         *   pattern already proven in M371/M372's greeting work,
         *   composed here rather than reimplemented.
         */
        greet({ userId } = {}) {
            const env = window.CozyOS.CozyEnvironment;
            const state = env && typeof env.getState === "function" ? env.getState() : null;
            if (!state || !state.available) return { available: false, reason: "CozyEnvironment not loaded." };
            const byPeriod = { morning: "Good morning.", afternoon: "Good afternoon.", evening: "Good evening.", night: "Good evening. I hope you're having a peaceful night." };
            return { available: true, greeting: byPeriod[state.timeOfDay] || "Welcome back." };
        }

        /**
         * wireContinuousMonitoring()
         *   Real, event-driven only. Subscribes to real events already
         *   confirmed emitted this session: cozy:risk-high,
         *   cozy:risk-critical (LivingRiskEngine), cozy:trust-reduced
         *   (LivingTrustEngine), behavior:anomaly (LivingBehaviorEngine).
         *   Window Manager is NOT subscribed - confirmed to emit no
         *   real events. No polling, no setInterval.
         */
        wireContinuousMonitoring() {
            if (this.#listenersWired) return { success: true, alreadyWired: true };
            const bus = window.CozyOS.PlatformEventBus;
            if (!bus || typeof bus.on !== "function") return { success: false, reason: "PlatformEventBus not loaded." };
            const onSignal = (source) => (detail) => { if (detail && detail.userId) this.recommend({ userId: detail.userId, deviceId: detail.deviceId, sessionId: detail.sessionId }); this.#log({ event: "signal-received", source, userId: detail && detail.userId }); };
            ["cozy:risk-high", "cozy:risk-critical", "cozy:trust-reduced", "behavior:anomaly"].forEach(evt => bus.on(evt, onSignal(evt)));
            this.#listenersWired = true;
            emit("cozy:ai-ready", { at: new Date().toISOString() });
            return { success: true, alreadyWired: false };
        }

        getDiagnosticsReport() {
            return {
                moduleVersion: LAICE_VERSION,
                historyEntries: this.#history.length,
                listenersWired: this.#listenersWired,
                composedEngines: {
                    LivingSecurityCoordinator: !!window.CozyOS.LivingSecurityCoordinator,
                    LivingRiskEngine: !!window.CozyOS.LivingRiskEngine,
                    LivingTrustEngine: !!window.CozyOS.LivingTrustEngine,
                    CozyEnvironment: !!window.CozyOS.CozyEnvironment,
                    IdentityEngine: !!window.CozyOS.IdentityEngine,
                    LivingRecoveryVault: !!window.CozyOS.LivingRecoveryVault,
                    CozyAI: !!window.CozyOS.CozyAI,
                    PlatformEventBus: !!window.CozyOS.PlatformEventBus
                },
                honestGaps: { windowManagerEvents: "Not subscribed - confirmed zero real emissions (same finding as M384).", notificationCenterPublish: "No real publish method exists - satisfied via direct PlatformEventBus emission instead, same pattern as every other Living* engine." }
            };
        }

        getIntegrationManifest() {
            return {
                ownership: { owns: ["security/trust/risk/environment context aggregation", "non-executing recommendations", "environment-aware greetings"], doesNotOwn: ["trust/risk calculation (their real engines)", "conversational AI (window.CozyOS.LivingAI, the existing Assistant state machine)", "memory storage (CozyAI/CozyMemory)"] },
                uses: ["LivingSecurityCoordinator", "LivingRiskEngine", "LivingTrustEngine", "CozyEnvironment", "IdentityEngine", "CozyAI", "PlatformEventBus"],
                security: { neverStores: "No plaintext secrets or passwords - this engine touches none.", neverExecutes: "recommend() only returns suggestion strings - no method here locks/revokes/resets anything." }
            };
        }
    }

    const instance = new CozyLivingAIContextEngine();
    window.CozyOS.LivingAIContextEngine = instance;

    window.CozyOS.Modules["living-ai-context-engine"] = Object.freeze({
        version: LAICE_VERSION,
        description: "Living AI Context Engine (M385) — registered as window.CozyOS.LivingAIContextEngine, deliberately distinct from the existing window.CozyOS.LivingAI state machine. Composes LivingSecurityCoordinator/LivingRiskEngine/LivingTrustEngine/CozyEnvironment/IdentityEngine/CozyAI read-only into context summaries and non-executing recommendations. Memory composes CozyAI.remember()/search() - no separate storage. Window Manager not subscribed - confirmed zero real events exist."
    });
})();
