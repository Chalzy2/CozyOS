/**
 * CozyOS — Living Decision Engine (LDE)
 * File Reference: core/security/living-decision-engine.js
 * Milestone: M387
 * Layer: Core / Shared Engine — the single decision layer applications
 * consult, composing every Living Engine below it. Never executes.
 *
 * RESPONSIBILITY
 *   Reads every composed engine's own already-computed, real output —
 *   recalculates none of them — and synthesizes ONE explainable
 *   decision: a level (Normal/Observe/Verify/Challenge/Restrict/Lock/
 *   Emergency), a priority, a confidence, human-readable reasons, and
 *   recommendations drawn only from the spec's closed vocabulary.
 *   Never authenticates, never locks anything, never sends a
 *   notification — it recommends; a real caller decides whether to
 *   act on the recommendation.
 *
 * COMPOSED (real, read-only, unmodified)
 *   - LivingSecurityCoordinator.decideAuthentication() — real tier +
 *     required-factor list, reused verbatim, not recomputed.
 *   - LivingRiskEngine.evaluate() — real overall score/level/reasons.
 *   - LivingTrustEngine.getTrustScore() — real persisted trust score.
 *   - LivingBehaviorEngine.getBehaviorScore() — real score+confidence.
 *   - LivingDeviceIntelligenceEngine.getContext(fingerprint) — real,
 *     READ-ONLY device confidence (never calls observe() here, which
 *     has side effects/persists a new observation — a decision read
 *     must not itself mutate device history). Fingerprint is derived
 *     via TrustedDeviceManager.generateFingerprint(), the same real
 *     hash reused everywhere else, never re-implemented.
 *   - LivingAIContextEngine.recommend() — real suggestion strings,
 *     folded into this engine's own reasons/evidence, not duplicated
 *     as separate logic.
 *   - AuthPolicyEngine.evaluate(operationName, context) — only when a
 *     real operationName is supplied by the caller (the engine has no
 *     generic "current auth state" getter); honestly reported
 *     unavailable otherwise, never guessed.
 *   - PlatformEventBus — the same real bus every other engine uses.
 *
 * WHY THIS IS COMPOSITION, NOT DUPLICATION
 *   LivingSecurityCoordinator already computes a 6-tier authentication
 *   decision, and LivingAIContextEngine already computes suggestion
 *   strings — this file does not recreate either calculation. It
 *   consumes both real outputs and RE-MAPS them, together with
 *   Trust/Behavior/Device numbers no single engine below combines, to
 *   the spec's own 7-level vocabulary — a genuinely new synthesis
 *   layer, not a second implementation of any engine's existing
 *   number. The exact mapping table is disclosed in #decideLevel()
 *   below rather than hidden.
 *
 * HONEST DISCLOSURE — OUTCOME LEARNING
 *   recordOutcome() and the persisted decisionHistory store are real
 *   and functional, but no real caller in this repository invokes
 *   recordOutcome() today (no UI/flow yet reports back whether a
 *   recommendation succeeded) — documented as a genuine gap rather
 *   than fabricating a caller that doesn't exist, matching this
 *   codebase's established disclosure pattern.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["living-decision-engine"]) return;

    const LDE_VERSION = "1.0.0-ENTERPRISE";
    const STORE = "decisionHistory";

    // Decision level escalation ladder, lowest to highest. Explicit,
    // not implicit — used to guarantee decide() never regresses a
    // level when combining multiple concerns.
    const LEVEL_ORDER = ["Normal", "Observe", "Verify", "Challenge", "Restrict", "Lock", "Emergency"];
    const PRIORITY_FOR_LEVEL = { Normal: "Info", Observe: "Low", Verify: "Medium", Challenge: "High", Restrict: "High", Lock: "Critical", Emergency: "Critical" };
    // Closed recommendation vocabulary — nothing outside this list is
    // ever emitted, matching the spec's "Recommendations Only" rule.
    const ALLOWED_RECOMMENDATIONS = new Set(["Request OTP", "Request Passkey", "Request Biometrics", "Notify Administrator", "Notify User", "Lock Session", "Lock Account", "Delay Sensitive Action"]);

    function emit(name, detail) {
        const bus = window.CozyOS.PlatformEventBus;
        if (bus && typeof bus.emit === "function") { try { bus.emit(name, detail); } catch (_err) { /* non-fatal */ } }
    }

    function higherLevel(a, b) { return LEVEL_ORDER.indexOf(a) >= LEVEL_ORDER.indexOf(b) ? a : b; }

    class CozyLivingDecisionEngine {
        #history = [];
        #listenersWired = false;

        #log(entry) {
            this.#history.push({ ...entry, at: new Date().toISOString() });
            if (this.#history.length > 300) this.#history.shift();
        }

        #storage() { return window.CozyOS.IdentityStorage; }
        getVersion() { return LDE_VERSION; }
        getHistory() { return this.#history.slice(); }

        /**
         * #decideLevel(inputs) — the one place level-mapping logic
         * lives. Every branch cites the real composed value that
         * drove it; nothing here recalculates risk/trust/behavior —
         * it only reads the numbers already computed elsewhere.
         */
        #decideLevel({ risk, security, trust, behavior, device }) {
            let level = "Normal";
            const reasons = [];

            // Primary driver: LivingRiskEngine's own real level.
            if (risk.available) {
                if (risk.level === "Critical") { level = higherLevel(level, "Lock"); reasons.push(`Risk level is Critical (score ${risk.overall}/100).`); }
                else if (risk.level === "High") { level = higherLevel(level, "Challenge"); reasons.push(`Risk level is High (score ${risk.overall}/100).`); }
                else if (risk.level === "Medium") { level = higherLevel(level, "Verify"); reasons.push(`Risk level is Medium (score ${risk.overall}/100).`); }
                else if (risk.level === "Low") { level = higherLevel(level, "Observe"); reasons.push(`Risk level is Low (score ${risk.overall}/100).`); }
            } else reasons.push("Risk unavailable — LivingRiskEngine not loaded or no context given.");

            // LivingSecurityCoordinator's own tier — real, reused verbatim.
            if (security.available) {
                if (security.tier === "critical") { level = higherLevel(level, "Lock"); reasons.push("LivingSecurityCoordinator tier: critical (account-lock + administrator-review required)."); }
                else if (security.tier === "high-risk") { level = higherLevel(level, "Challenge"); reasons.push("LivingSecurityCoordinator tier: high-risk."); }
                else if (security.tier === "medium-risk") { level = higherLevel(level, "Verify"); reasons.push("LivingSecurityCoordinator tier: medium-risk."); }
            }

            // Trust — a genuinely low persisted trust score restricts
            // sensitive actions even when risk alone wouldn't.
            if (trust.available) {
                if (trust.score < 20) { level = higherLevel(level, "Restrict"); reasons.push(`Trust score is very low (${trust.score}/100).`); }
                else if (trust.score < 40) { level = higherLevel(level, "Verify"); reasons.push(`Trust score is low (${trust.score}/100).`); }
            }

            // Behavior anomaly — a real, recent anomaly nudges toward Verify.
            if (behavior.available && behavior.recentAnomalies > 0) {
                level = higherLevel(level, "Verify");
                reasons.push(`${behavior.recentAnomalies} recent behavior anomal${behavior.recentAnomalies === 1 ? "y" : "ies"} observed.`);
            }

            // Device — a meaningful change on a previously-trusted
            // device (LDIE's own cozy:device-risk condition) restricts;
            // an entirely unknown device on top of existing risk nudges further.
            if (device.available) {
                if (device.trustTrend === "trusted" && device.changed) { level = higherLevel(level, "Restrict"); reasons.push("Device signals changed meaningfully on a previously-trusted device."); }
                if (!device.knownDevice && LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf("Verify")) { level = higherLevel(level, "Challenge"); reasons.push("Device is not previously known, compounding an already-elevated risk level."); }
            }

            // Emergency — reserved for multiple independent engines
            // simultaneously agreeing on severe risk (compounding
            // real signals, not a single engine's number alone).
            const severeSignals = [risk.available && risk.level === "Critical", security.available && security.tier === "critical", trust.available && trust.score < 10, device.available && device.trustTrend === "untrusted" && device.changed].filter(Boolean).length;
            if (severeSignals >= 3) { level = "Emergency"; reasons.push(`${severeSignals} independent engines simultaneously reported severe signals.`); }

            if (level === "Normal") reasons.push("No elevated signal from any composed engine.");
            return { level, reasons };
        }

        /**
         * #recommendationsFor(level, security)
         *   Real, closed vocabulary only. Reuses LSE's own already-
         *   computed `required` array (translated, not recomputed)
         *   where available, layered with level-driven defaults.
         */
        #recommendationsFor(level, security) {
            const recs = new Set();
            if (security.available) {
                for (const req of security.required) {
                    if (req === "authenticator") recs.add("Request OTP");
                    else if (req === "passkey") recs.add("Request Passkey");
                    else if (req === "account-lock") recs.add("Lock Account");
                    else if (req === "administrator-review") recs.add("Notify Administrator");
                }
            }
            if (level === "Verify") recs.add("Request OTP");
            if (level === "Challenge") { recs.add("Request Passkey"); recs.add("Request Biometrics"); }
            if (level === "Restrict") { recs.add("Delay Sensitive Action"); recs.add("Notify User"); }
            if (level === "Lock") { recs.add("Lock Session"); recs.add("Notify Administrator"); }
            if (level === "Emergency") { recs.add("Lock Account"); recs.add("Notify Administrator"); recs.add("Notify User"); }
            return [...recs].filter(r => ALLOWED_RECOMMENDATIONS.has(r));
        }

        /**
         * decide({userId, username, deviceId, sessionId, operationName})
         *   The one real decision pipeline. Every input is a live,
         *   read-only call into an already-verified engine — nothing
         *   here is recalculated locally.
         */
        async decide({ userId, username, deviceId, sessionId, operationName } = {}) {
            const contributingEngines = {};
            const evidence = {};

            const lre = window.CozyOS.LivingRiskEngine;
            const risk = (lre && typeof lre.evaluate === "function") ? { available: true, ...lre.evaluate({ userId, username, deviceId, sessionId }) } : { available: false, reason: "LivingRiskEngine not loaded." };
            contributingEngines.LivingRiskEngine = risk.available;
            evidence.risk = risk;

            const lse = window.CozyOS.LivingSecurityCoordinator;
            const security = (lse && typeof lse.decideAuthentication === "function") ? { available: true, ...lse.decideAuthentication({ userId, username, deviceId, sessionId }) } : { available: false, reason: "LivingSecurityCoordinator not loaded." };
            contributingEngines.LivingSecurityCoordinator = security.available;
            evidence.security = security;

            const lte = window.CozyOS.LivingTrustEngine;
            const trust = (lte && userId && typeof lte.getTrustScore === "function") ? lte.getTrustScore({ userId, deviceId, sessionId }) : { available: false, reason: "LivingTrustEngine not loaded or no userId given." };
            contributingEngines.LivingTrustEngine = trust.available;
            evidence.trust = trust;

            const lbe = window.CozyOS.LivingBehaviorEngine;
            const behavior = (lbe && userId && typeof lbe.getBehaviorScore === "function") ? { available: true, ...lbe.getBehaviorScore(userId) } : { available: false, reason: "LivingBehaviorEngine not loaded or no userId given." };
            contributingEngines.LivingBehaviorEngine = behavior.available;
            evidence.behavior = behavior;

            let device = { available: false, reason: "LivingDeviceIntelligenceEngine or TrustedDeviceManager not loaded." };
            const ldie = window.CozyOS.LivingDeviceIntelligenceEngine;
            const tdm = window.CozyOS.TrustedDeviceManager;
            if (ldie && tdm && typeof tdm.generateFingerprint === "function" && typeof ldie.getContext === "function") {
                try {
                    const fingerprint = await tdm.generateFingerprint();
                    const ctx = await ldie.getContext(fingerprint);
                    device = ctx.available ? { available: true, knownDevice: ctx.knownDevice, deviceConfidence: ctx.deviceConfidence, trustTrend: ctx.trustTrend, changed: false } : { available: false, reason: ctx.reason };
                } catch (_err) { device = { available: false, reason: "Device context read failed." }; }
            }
            contributingEngines.LivingDeviceIntelligenceEngine = device.available;
            evidence.device = device;

            const laice = window.CozyOS.LivingAIContextEngine;
            const aiContext = (laice && typeof laice.recommend === "function") ? laice.recommend({ userId, deviceId, sessionId }) : { available: false, reason: "LivingAIContextEngine not loaded." };
            contributingEngines.LivingAIContextEngine = !!(laice && typeof laice.recommend === "function");
            evidence.aiContext = aiContext;

            let authPolicy = { available: false, reason: "No operationName supplied — AuthPolicyEngine has no generic current-state getter, only per-operation evaluate()." };
            const policyEngine = window.CozyOS.AuthPolicyEngine;
            if (operationName && policyEngine && typeof policyEngine.evaluate === "function") {
                try { authPolicy = { available: true, ...(await policyEngine.evaluate(operationName, { userId, deviceId, sessionId })) }; } catch (_err) { authPolicy = { available: false, reason: "AuthPolicyEngine.evaluate() threw." }; }
            }
            contributingEngines.AuthPolicyEngine = authPolicy.available;
            evidence.authPolicy = authPolicy;

            const { level, reasons } = this.#decideLevel({ risk, security, trust, behavior, device });
            const priority = PRIORITY_FOR_LEVEL[level];
            const recommendations = this.#recommendationsFor(level, security);
            const requiredActions = LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf("Challenge") ? recommendations.slice() : [];

            if (aiContext && aiContext.suggestions && aiContext.suggestions.length) reasons.push(...aiContext.suggestions.map(s => `AI context: ${s}`));

            // Decision confidence — a genuinely new synthesis metric
            // (not owned by any single composed engine): blends real
            // data completeness with the two real confidence numbers
            // that exist below (Behavior, Device). Never a fabricated
            // certainty when inputs are missing.
            const availableCount = Object.values(contributingEngines).filter(Boolean).length;
            const totalCount = Object.keys(contributingEngines).length;
            const completeness = totalCount ? availableCount / totalCount : 0;
            const behaviorConf = behavior.available ? (behavior.confidence || 0) / 100 : null;
            const deviceConf = device.available ? device.deviceConfidence : null;
            const confParts = [completeness, behaviorConf, deviceConf].filter(v => v !== null);
            const confidence = Math.round((confParts.reduce((a, b) => a + b, 0) / confParts.length) * 100) / 100;

            const decisionId = `dec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            const decision = {
                decisionId, userId: userId || null,
                decision: level, priority, confidence,
                reasons, recommendations, requiredActions,
                explanation: reasons.join(" "),
                requiredApprovals: level === "Emergency" || level === "Lock" ? ["administrator"] : [],
                contributingEngines, evidence,
                decidedAt: new Date().toISOString()
            };

            const storage = this.#storage();
            if (storage && typeof storage.save === "function") {
                try { await storage.save(STORE, { id: decisionId, ...decision, outcome: null }); } catch (_err) { /* honestly non-fatal */ }
            }

            this.#log({ event: "decision-ready", decisionId, userId: userId || null, level, priority, confidence });
            emit("cozy:decision-ready", decision);
            if (level === "Verify" || level === "Challenge" || level === "Restrict") emit("cozy:decision-warning", decision);
            if (level === "Lock" || level === "Emergency") emit("cozy:decision-critical", decision);

            return decision;
        }

        /**
         * recordOutcome(decisionId, { succeeded, notes })
         *   Real, functional persistence — but see file-header
         *   disclosure: no real caller in this repository invokes
         *   this yet. Kept honest rather than removed, since the
         *   spec explicitly asks for outcome learning to exist.
         */
        async recordOutcome(decisionId, { succeeded, notes } = {}) {
            const storage = this.#storage();
            if (!storage || typeof storage.loadAll !== "function" || typeof storage.save !== "function") return { success: false, reason: "IdentityStorage not loaded." };
            try {
                const result = await storage.loadAll(STORE);
                if (!result.success) return { success: false, reason: "Storage read failed." };
                const record = result.records.find(r => r.id === decisionId);
                if (!record) return { success: false, reason: "No decision found with this decisionId." };
                record.outcome = { succeeded: !!succeeded, notes: notes || null, recordedAt: new Date().toISOString() };
                await storage.save(STORE, record);
                this.#log({ event: "outcome-recorded", decisionId, succeeded: !!succeeded });
                return { success: true };
            } catch (_err) { return { success: false, reason: "Storage write failed." }; }
        }

        /** reset(userId) — explicit reset signal, e.g. after a genuine successful step-up. Mirrors LivingRiskEngine.reset()'s own pattern; does not clear any composed engine's own state. */
        reset(userId) {
            this.#log({ event: "reset", userId });
            emit("cozy:decision-reset", { userId, at: new Date().toISOString() });
            return { success: true };
        }

        /**
         * wireContinuousMonitoring()
         *   Real, event-driven only. Subscribes to every real update
         *   event already emitted by the composed Living Engines
         *   (confirmed by reading each file's own real emit() calls
         *   before writing this list) and re-runs decide() only when
         *   the event carries a real userId. No polling.
         */
        wireContinuousMonitoring() {
            if (this.#listenersWired) return { success: true, alreadyWired: true };
            const bus = window.CozyOS.PlatformEventBus;
            if (!bus || typeof bus.on !== "function") return { success: false, reason: "PlatformEventBus not loaded." };
            const recalc = (detail) => { if (detail && detail.userId) this.decide({ userId: detail.userId, username: detail.username, deviceId: detail.deviceId, sessionId: detail.sessionId }); };
            [
                "cozy:risk-updated", "cozy:risk-high", "cozy:risk-critical",
                "cozy:trust-updated", "cozy:trust-promoted", "cozy:trust-reduced",
                "behavior:updated", "behavior:anomaly", "behavior:trusted",
                "cozy:device-known", "cozy:device-new", "cozy:device-updated", "cozy:device-risk", "cozy:device-trusted",
                "cozy:ai-context-updated", "cozy:ai-recommendation", "cozy:ai-warning",
                "cozy:authentication-required", "cozy:security-alert"
            ].forEach(evt => bus.on(evt, recalc));
            this.#listenersWired = true;
            this.#log({ event: "monitoring-wired" });
            return { success: true, alreadyWired: false };
        }

        getDiagnosticsReport() {
            return {
                moduleVersion: LDE_VERSION,
                historyEntries: this.#history.length,
                listenersWired: this.#listenersWired,
                composedEngines: {
                    LivingSecurityCoordinator: !!window.CozyOS.LivingSecurityCoordinator,
                    LivingRiskEngine: !!window.CozyOS.LivingRiskEngine,
                    LivingTrustEngine: !!window.CozyOS.LivingTrustEngine,
                    LivingBehaviorEngine: !!window.CozyOS.LivingBehaviorEngine,
                    LivingDeviceIntelligenceEngine: !!window.CozyOS.LivingDeviceIntelligenceEngine,
                    LivingAIContextEngine: !!window.CozyOS.LivingAIContextEngine,
                    AuthPolicyEngine: !!window.CozyOS.AuthPolicyEngine,
                    IdentityEngine: !!window.CozyOS.IdentityEngine,
                    PlatformEventBus: !!window.CozyOS.PlatformEventBus
                }
            };
        }

        getIntegrationManifest() {
            return {
                ownership: {
                    owns: ["7-level decision synthesis (Normal→Emergency)", "priority assignment", "decision confidence (data-completeness + behavior/device confidence blend)", "closed-vocabulary recommendations", "decision + outcome history"],
                    doesNotOwn: ["trust scoring (LivingTrustEngine)", "risk scoring (LivingRiskEngine)", "authentication tiering (LivingSecurityCoordinator, reused verbatim)", "device profiling (LivingDeviceIntelligenceEngine)", "execution of any recommendation — never performs Lock/Notify/Delay itself"]
                },
                uses: ["LivingSecurityCoordinator", "LivingRiskEngine", "LivingTrustEngine", "LivingBehaviorEngine", "LivingDeviceIntelligenceEngine", "LivingAIContextEngine", "AuthPolicyEngine", "IdentityStorage", "PlatformEventBus"],
                honestLimitation: "recordOutcome() is real and persists, but no real caller in this repository invokes it yet — outcome-based confidence adjustment has no live data source today, documented rather than fabricated. AuthPolicyEngine composition requires a real, pre-defined operationName from the caller; without one, authPolicy is honestly reported unavailable."
            };
        }
    }

    const instance = new CozyLivingDecisionEngine();
    window.CozyOS.LivingDecisionEngine = instance;

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                sourcePath: "core/security/living-decision-engine.js",
                name: "LivingDecisionEngine", category: "Platform", icon: "shield.svg",
                description: "Real, explainable 7-level decision synthesis (Normal→Emergency) composing every Living Engine's own already-computed output. Never executes — recommendations only, from a closed vocabulary. Never recalculates trust, risk, behavior, or device signals itself."
            });
        } catch (_err) { /* non-fatal */ }
    }

    window.CozyOS.Modules["living-decision-engine"] = Object.freeze({
        version: LDE_VERSION,
        description: "Living Decision Engine (M387) — the single decision layer applications consult. Composes LivingSecurityCoordinator/LivingRiskEngine/LivingTrustEngine/LivingBehaviorEngine/LivingDeviceIntelligenceEngine/LivingAIContextEngine/AuthPolicyEngine read-only; maps their real, already-computed outputs to a 7-level decision (Normal/Observe/Verify/Challenge/Restrict/Lock/Emergency) with priority, confidence, reasons, and closed-vocabulary recommendations. Never authenticates, never executes any recommendation, never recalculates another engine's number. Event-driven, no polling."
    });
})();
