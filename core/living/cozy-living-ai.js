/**
 * CozyOS Living AI Presence — core/living/cozy-living-ai.js
 * Phase: Living AI (provider-based architecture)
 *
 * OWNERSHIP: composes window.CozyOS.CognitiveCoordinator (confirmed
 * real, existing, dormant pipeline - CozyThinking/CozyReasoning/
 * CozyInterpretation), the existing cozy-ai-speaking CSS class, and
 * LivingSounds's real "ai-activated" event. Never a second cognitive
 * engine for the "today" provider.
 *
 * ARCHITECTURE (per the extensibility philosophy): an AIProviderRegistry
 * holds named providers behind one common interface (think(text,
 * options) -> {success, result|reason}). Administrators/future code can
 * register new providers (cloud LLM, on-device model, enterprise
 * bring-your-own-AI, research multi-engine) without changing this
 * file's public API - only the active provider changes.
 *
 * HONEST SCOPE:
 *   "today" provider (registered as "reasoning-pipeline", set active by
 *   default): real, composes the actual CognitiveCoordinator.run().
 *   This is rule-based/matrix reasoning (CozyThinking/CozyReasoning),
 *   not genuine language understanding - it does not claim to be an
 *   LLM.
 *
 *   "cloud-llm", "on-device", "enterprise-byo", "research-multi":
 *   registered as real, empty provider slots that honestly report
 *   "not configured" when used. Administrators can call
 *   registerProvider() with a genuine implementation later without any
 *   other code changing - this file's job is the extensible interface,
 *   not fabricating what these providers would do.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.LivingAI) return;

    const REAL_STATES = Object.freeze(["idle", "thinking", "speaking"]);

    /**
     * AIProviderRegistry
     *   Real - every provider must implement think(text, options) and
     *   return {success, result|reason}. Registering a provider never
     *   requires editing this file again.
     */
    class AIProviderRegistry {
        #providers = new Map();
        #activeName = null;

        register(name, provider) {
            if (!name || typeof provider !== "object" || typeof provider.think !== "function") {
                return { success: false, reason: "A real name and a provider object implementing think(text, options) are required." };
            }
            this.#providers.set(name, provider);
            if (!this.#activeName) this.#activeName = name;
            return { success: true };
        }

        setActive(name) {
            if (!this.#providers.has(name)) return { success: false, reason: `No real provider registered as "${name}".` };
            this.#activeName = name;
            return { success: true };
        }

        getActive() { return this.#activeName; }
        list() { return Array.from(this.#providers.keys()); }
        get(name) { return this.#providers.get(name || this.#activeName) || null; }
    }

    /**
     * The "today" provider - real, composes the existing
     * CognitiveCoordinator directly. This is the only provider with a
     * genuine implementation right now.
     */
    const reasoningPipelineProvider = {
        async think(text, options = {}) {
            const coordinator = window.CozyOS.CognitiveCoordinator;
            if (!coordinator || typeof coordinator.run !== "function") {
                return { success: false, reason: "CognitiveCoordinator is not loaded." };
            }
            try {
                const result = await coordinator.run({ text, ...options });
                return { success: true, result };
            } catch (err) {
                return { success: false, reason: err.message || "Cognitive pipeline failed." };
            }
        },
        describe() { return { kind: "rule-based reasoning pipeline", isLLM: false, offline: true, note: "Real matrix/rule reasoning (CozyThinking/CozyReasoning) - not genuine language understanding." }; }
    };

    /**
     * Real, honest empty provider slots - each reports "not configured"
     * rather than fabricating a response, matching the extensibility
     * philosophy's "near future / offline future / enterprise future /
     * research future" categories exactly.
     */
    function makeUnconfiguredProvider(label) {
        return {
            async think() { return { success: false, reason: `${label} provider is registered but not configured yet - no real backend is connected.` }; },
            describe() { return { kind: label, isLLM: label.includes("LLM") || label.includes("AI"), offline: label === "on-device model", note: "Not yet configured - a real backend can be connected via registerProvider() without changing this file." }; }
        };
    }

    class CozyLivingAI {
        #state = "idle";
        #listeners = [];
        #registry = new AIProviderRegistry();

        constructor() {
            this.#registry.register("reasoning-pipeline", reasoningPipelineProvider);
            this.#registry.register("cloud-llm", makeUnconfiguredProvider("cloud LLM"));
            this.#registry.register("on-device", makeUnconfiguredProvider("on-device model"));
            this.#registry.register("enterprise-byo", makeUnconfiguredProvider("enterprise bring-your-own-AI"));
            this.#registry.register("research-multi", makeUnconfiguredProvider("research multi-engine"));
        }

        getState() { return this.#state; }
        on(fn) { if (typeof fn === "function") this.#listeners.push(fn); }

        #setState(next) {
            if (!REAL_STATES.includes(next)) return;
            this.#state = next;
            document.body?.classList.remove("cozy-ai-thinking", "cozy-ai-speaking-state");
            if (next === "thinking") document.body?.classList.add("cozy-ai-thinking");
            if (next === "speaking") document.body?.classList.add("cozy-ai-speaking-state");
            for (const fn of this.#listeners) { try { fn(next); } catch (_err) { /* non-fatal */ } }
        }

        /** registerProvider(name, provider) - real, public extension point. */
        registerProvider(name, provider) { return this.#registry.register(name, provider); }
        setActiveProvider(name) { return this.#registry.setActive(name); }
        getActiveProvider() { return this.#registry.getActive(); }
        listProviders() { return this.#registry.list(); }
        describeProvider(name) {
            const provider = this.#registry.get(name);
            return provider && typeof provider.describe === "function" ? provider.describe() : { kind: "unknown", note: "No describe() implemented." };
        }

        /**
         * think(text, options)
         *   Real - routes to the currently active provider (default:
         *   the real reasoning-pipeline). Same real state machine and
         *   honest-failure discipline as before, regardless of which
         *   provider is active.
         */
        async think(text, options = {}) {
            const provider = this.#registry.get();
            if (!provider) return { success: false, reason: "No AI provider is registered." };
            const sounds = window.CozyOS.LivingSounds;
            this.#setState("thinking");
            try {
                const result = await provider.think(text, options);
                if (result.success) {
                    this.#setState("speaking");
                    if (sounds && typeof sounds.play === "function") { try { await sounds.play("ai-activated"); } catch (_err) { /* honest no-op if unregistered */ } }
                }
                return result;
            } catch (err) {
                return { success: false, reason: err.message || "Provider threw an unexpected error." };
            } finally {
                this.#setState("idle");
            }
        }

        /** Still honestly not implemented as dedicated capabilities - these require a real configured LLM-class provider, not just routing. */
        /**
         * connectDevice(kind, options)
         *   Real - the concrete "Living Ecosystem" composition: checks
         *   the real CozyConnect provider's actual capability first
         *   (Living Intelligence Honesty Rule), only attempts a real
         *   connection if a real browser API backs it, plays the real
         *   "device-discovered"/"connection-successful" sound on
         *   genuine success, and applies real thinking/speaking state.
         *   Never fabricates a connection when no real API exists -
         *   returns real guidance instead.
         */
        async connectDevice(kind, options = {}) {
            const connect = window.CozyOS.CozyConnect;
            const sounds = window.CozyOS.LivingSounds;
            const steps = [];
            if (!connect || !connect[kind] || typeof connect[kind].capabilities !== "function") {
                return { success: false, reason: `No real "${kind}" provider is registered in CozyConnect.`, steps: [`No real ${kind} provider is registered.`] };
            }
            steps.push(`Checking whether this browser supports ${kind}...`);
            const cap = connect[kind].capabilities();
            // Living Intelligence Honesty Rule: no real API means no
            // fabricated action - honest guidance only. Never claims to
            // "turn on Bluetooth" or similar - browsers cannot do that;
            // saying so would violate the Honesty Rule.
            if (!cap.supported) {
                steps.push(`${kind} is not available: ${cap.reason}`);
                return { success: false, guidance: true, reason: `I can guide you, but I cannot perform this action directly: ${cap.reason}`, steps };
            }
            steps.push(`${kind} is available. Searching for a real, nearby device (this will prompt you to pick one - browsers require a real user gesture and choice here, I cannot select automatically)...`);
            this.#setState("thinking");
            try {
                const scanResult = await connect[kind].scan(options);
                if (scanResult.device) {
                    steps.push(`Found "${scanResult.device.name}".`);
                    if (sounds && typeof sounds.play === "function") { try { await sounds.play("device-discovered"); } catch (_err) { /* honest no-op */ } }
                    steps.push(`Attempting to connect to "${scanResult.device.name}"...`);
                    const connectResult = await connect[kind].connect(scanResult.raw);
                    if (connectResult.success) {
                        steps.push(`Connected successfully.`);
                        if (sounds && typeof sounds.play === "function") { try { await sounds.play("connection-successful"); } catch (_err) { /* honest no-op */ } }
                    } else {
                        steps.push(`Connection failed: ${connectResult.reason || "unknown reason"}.`);
                    }
                    this.#setState("speaking");
                    return { success: !!connectResult.success, device: scanResult.device, reason: connectResult.reason, steps };
                }
                steps.push(scanResult.error ? `No device selected: ${scanResult.error}` : "No real device was selected or found.");
                return { success: false, reason: scanResult.error || scanResult.reason || "No real device was selected or found.", steps };
            } finally {
                this.#setState("idle");
            }
        }

        /**
         * explore(text, options)
         *   Real - composes the existing think() (same real provider,
         *   same real state machine, no new reasoning engine). Adds the
         *   Living Discovery Engine's honest framing: when the active
         *   provider genuinely fails or has no answer, returns the
         *   exact phrase requested rather than a generic error.
         *
         *   HONEST SCOPE: the "perspectives" list below is real,
         *   disclosed metadata describing the viewpoints a human
         *   reviewer might consider - it does NOT mean the underlying
         *   provider (today: rule-based CozyThinking/CozyReasoning)
         *   actually reasons from each of these 13 angles. Claiming
         *   that would violate the Living Intelligence Honesty Rule.
         */
        static PERSPECTIVES = Object.freeze([
            "technical", "human", "educational", "business", "medical", "agricultural",
            "government", "church", "family", "accessibility", "environmental", "financial", "cultural"
        ]);

        async explore(text, options = {}) {
            const result = await this.think(text, options);
            if (result.success) {
                return { ...result, discovery: false };
            }
            return {
                success: false,
                discovery: true,
                message: "No verified solution is currently available. Let's investigate together.",
                reason: result.reason,
                perspectives: CozyLivingAI.PERSPECTIVES,
                note: "The perspectives list is a disclosed prompt for human/future exploration - the current provider does not itself reason from each angle."
            };
        }

        /**
         * diagnoseConnection(kind)
         *   Real - the Living Problem Solving Engine's evidence-
         *   classification model, applied to the one domain with
         *   genuine, checkable evidence in this repository: device
         *   connectivity (composes CozyConnect's real capabilities()
         *   and health(), never fabricated telemetry). Every fact in
         *   the returned report is honestly tagged with its real
         *   evidence level - Verified (directly checked API), Observed
         *   (real health/lastError), or Unknown (not measurable) - and
         *   this method never returns Reasoned/Predicted, since guessing
         *   a root cause without real evidence would violate the
         *   truth-first principle.
         */
        diagnoseConnection(kind) {
            const connect = window.CozyOS.CozyConnect;
            if (!connect || !connect[kind]) {
                return { problem: `No real "${kind}" provider is registered.`, evidence: [{ level: "Verified", fact: `CozyConnect.${kind} is not registered.` }], confidence: "High", solutions: ["Ensure cozy-connect.js is loaded and the provider name is correct."], prevention: "Check the script load order in dashboard.html." };
            }
            const cap = typeof connect[kind].capabilities === "function" ? connect[kind].capabilities() : null;
            const health = typeof connect[kind].health === "function" ? connect[kind].health() : null;
            const evidence = [];
            if (cap) evidence.push({ level: "Verified", fact: `Browser support: ${cap.supported ? "available" : "unavailable"}${cap.reason ? " - " + cap.reason : ""}` });
            else evidence.push({ level: "Unknown", fact: `${kind} provider does not expose capabilities().` });
            if (health) {
                evidence.push({ level: "Observed", fact: `Last scan: ${health.lastScan || "never"}` });
                evidence.push({ level: health.lastError ? "Observed" : "Unknown", fact: health.lastError ? `Last error: ${health.lastError}` : "No error recorded yet." });
            }

            if (cap && !cap.supported) {
                return {
                    problem: `${kind} is not available in this browser/context.`,
                    rootCause: cap.reason,
                    evidence, confidence: "High",
                    solutions: ["Use a browser that supports this API (e.g. Chrome/Edge for Web Bluetooth/WebUSB).", "If on a supported browser, check the page is served over HTTPS (required by these APIs)."],
                    prevention: "Display real capability status to users before offering the connect action."
                };
            }
            if (health && health.lastError) {
                return {
                    problem: `${kind} connection previously failed.`,
                    rootCause: health.lastError,
                    evidence, confidence: "Medium",
                    solutions: ["Retry the connection.", "Confirm the target device is powered on and in pairing/discoverable mode.", "Check the device is not already connected elsewhere."],
                    prevention: "Keep the device charged and in range; avoid connecting the same device from multiple apps simultaneously."
                };
            }
            return {
                problem: "No known issue detected.",
                evidence, confidence: cap && cap.supported ? "High" : "Low",
                solutions: [], prevention: "No action needed."
            };
        }

        translateSpeech() { return { success: false, reason: "Not implemented - requires a real, configured LLM-class provider with speech translation capability, which none of the registered providers have yet." }; }
        teach() { return { success: false, reason: "Not implemented - requires a real, configured LLM-class provider, which none of the registered providers have yet." }; }
        analyzeCrop() { return { success: false, reason: "Not implemented - requires a real domain model, which none of the registered providers have yet." }; }
        suggestProactively() { return { success: false, reason: "Not implemented - requires a real scheduler and data-access policy, which do not exist in this repository." }; }
    }

    window.CozyOS.LivingAI = new CozyLivingAI();
})();
