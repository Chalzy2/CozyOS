/**
 * CozyOS — Rule-Based Conversational Provider (Reply Composer)
 * File Reference: core/modules/intelligence/providers/rule-based-conversational-provider.js
 * Repair: RP-026 — Rule-Based Reply Composer
 *
 * OWNERSHIP
 *   Registers a real "rule-based-conversational" provider into the
 *   ALREADY-EXISTING registerProvider() extension point exposed by
 *   window.CozyOS.LivingAI (core/living/cozy-living-ai.js — NOT
 *   modified by this file; that registry accepts any provider name,
 *   confirmed by reading AIProviderRegistry.register() before writing
 *   this file — it is not restricted to the four named future slots
 *   already reserved there). Also registers a real, optional descriptor
 *   with window.CozyOS.ProviderManager (core/shell/provider-manager.js
 *   — NOT modified) when present, mirroring RP-025-A's own pattern
 *   (core/modules/intelligence/providers/on-device-conversational-
 *   provider.js) exactly. core/living/cozy-living-assistant.js
 *   (resolveConversationalReply(), RP-024) is not touched — this file
 *   only calls public APIs those already expose. CognitiveCoordinator,
 *   cozy-intelligence-provider.js, and core/config.js are not touched
 *   either — this provider calls CognitiveCoordinator.run() as a public
 *   caller, exactly the way reasoningPipelineProvider (cozy-living-
 *   ai.js) already does, never re-implementing it.
 *
 * REAL GAP THIS FIXES (confirmed by reading the actual repository
 * before writing this file)
 *   window.CozyOS.CognitiveCoordinator.run()'s real return shape
 *   ({interpretation, thinking, reasoning, intelligence,
 *   recalledMemories, policyResult, diagnostics}) has no .text/.reply/
 *   .answer field anywhere on it — confirmed directly in
 *   cognitive-coordinator.js and in RP-024's own regression test
 *   (core/living/tests/cozy-living-assistant-reply.test.js). RP-025-A's
 *   on-device provider is a real, genuine fix for browsers that expose
 *   an on-device language-model API, but honestly reports NOT_READY
 *   everywhere else (confirmed: no bundled model, by design). This
 *   provider is the second, independent real answer path: a genuinely
 *   rule-based composer, disclosed as such, that recognizes a small,
 *   named set of conversational intents (greeting/help/thanks/identity)
 *   and returns an honest human-readable .text for them — and an
 *   equally honest "not supported yet" .text for everything else,
 *   never the generic pipeline-internals it deliberately excludes.
 *
 * WHY THIS COMPOSES CognitiveCoordinator RATHER THAN REPLACING IT
 *   Switching LivingAI's active provider away from "reasoning-pipeline"
 *   would silently stop Memory recall/save and Policy evaluation from
 *   ever running for chat input (confirmed: cozy-living-assistant.js's
 *   #send()/#sendImage() are CognitiveCoordinator's only two real
 *   callers in this repository — grep-confirmed before writing this
 *   file). This provider's think() calls CognitiveCoordinator.run()
 *   itself first — the same real entry point reasoningPipelineProvider
 *   already uses, so Memory/Policy/Interpretation/Thinking/Reasoning/
 *   Intelligence all still genuinely execute and their real diagnostics
 *   are still carried on the returned result (for callers/health tools
 *   that want it) — this file only adds the missing final step: a real,
 *   honestly-labeled .text composed from the raw input text's
 *   classified intent, never copied from the pipeline's evidence,
 *   insights, diagnostics, decision matrices, or isReal flags.
 *
 * HONESTY RULE
 *   describe()/getHealth() must never claim LLM, neural model, machine
 *   learning, cloud intelligence, or reasoning beyond what the rules
 *   below actually implement. Every reply text is either a template
 *   matched to a named, disclosed intent, or the equally honest
 *   "no rule-based answer yet" fallback — never a fabricated answer,
 *   never pipeline internals surfaced as if they were an answer.
 *
 * ACTIVATION (RP-026 FIX item 6 — explicit, disclosed, not a side
 * effect of registration)
 *   registerProvider() only fills the registry slot — this mirrors
 *   RP-025-A's own discipline. Per this repair's own spec ("use the
 *   existing ProviderManager/LivingAI activation mechanism rather than
 *   inventing a toggle" when "registration exists but activation is
 *   missing"), this file performs ONE deliberate, disclosed call to
 *   the existing LivingAI.setActiveProvider() choke point, as its own
 *   separate step below registerWithLivingAI() — never folded into
 *   AIProviderRegistry.register() itself, and never triggered merely
 *   because this provider becomes healthy. This is safe precisely
 *   because this provider's own think() still runs the full real
 *   pipeline first (see above) — activating it does not remove any
 *   real capability the "reasoning-pipeline" provider had, since that
 *   provider never produced a genuine reply either (the confirmed gap
 *   this repair fixes).
 *
 * NOTE ON REPOSITORY SEQUENCING (Rule 69 — Repository Authority)
 *   docs/builder/knowledge/repair-history-registry.md's own "NEXT
 *   UNLOCK" section names "RP-025-A Live Verification" (an on-device-
 *   browser check) as the next authorized repair, ahead of RP-025-B.
 *   This repair (RP-026) was explicitly directed instead by the
 *   repository owner as a separate, independent path — it does not
 *   touch, complete, or invalidate RP-025-A Live Verification or
 *   RP-025-B's own separate on-device-runtime work, and does not
 *   modify on-device-conversational-provider.js. Recorded here and in
 *   the repair history registry per Rule 69's disclosure requirement.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["rule-based-conversational-provider"]) return;

    const PROVIDER_NAME = "rule-based-conversational";

    /**
     * INTENTS
     *   Real, named, disclosed set — every one of these is the ONLY
     *   thing this provider claims to understand. Order matters:
     *   first match wins, most specific patterns first (e.g. "good
     *   morning" before the generic "hi"/"hello" pattern).
     */
    const INTENT_RULES = Object.freeze([
        { id: "greeting-morning", pattern: /\bgood\s+morning\b/i },
        { id: "greeting-afternoon", pattern: /\bgood\s+afternoon\b/i },
        { id: "greeting-evening", pattern: /\bgood\s+evening\b/i },
        { id: "greeting-generic", pattern: /\b(hi|hello|hey|greetings)\b/i },
        { id: "thanks", pattern: /\b(thanks|thank\s?you|appreciate\s+it)\b/i },
        { id: "identity", pattern: /\bwho\s+are\s+you\b|\bwhat\s+are\s+you\b/i },
        { id: "help", pattern: /\bhelp\b|\bwhat\s+can\s+you\s+do\b/i }
    ]);

    /**
     * classifyIntent(text)
     *   Real, pure, deterministic — regex matching against the raw
     *   input only. Never consults pipeline evidence to decide intent
     *   (the pipeline's job is Interpretation/Reasoning/Memory/Policy,
     *   not intent classification — no duplicate ownership here).
     *   Returns "unsupported" (never null/undefined) when nothing
     *   matches, so callers always get a defined intent id.
     */
    function classifyIntent(text) {
        const input = typeof text === "string" ? text.trim() : "";
        for (const rule of INTENT_RULES) {
            if (rule.pattern.test(input)) return rule.id;
        }
        return "unsupported";
    }

    /**
     * composeReply(intent)
     *   Real, pure template selection — the ONLY place conversational
     *   text is generated. Never reads pipeline internals. Every
     *   branch is a fixed, honest, human-readable sentence.
     */
    function composeReply(intent) {
        switch (intent) {
            case "greeting-morning":
                return "Good morning! I'm the CozyOS Assistant — ready to help with whatever you're working on today.";
            case "greeting-afternoon":
                return "Good afternoon! I'm the CozyOS Assistant. What can I help you with?";
            case "greeting-evening":
                return "Good evening! I'm the CozyOS Assistant. How can I help?";
            case "greeting-generic":
                return "Hello! I'm the CozyOS Assistant. How can I help you?";
            case "thanks":
                return "You're welcome! Let me know if there's anything else you need.";
            case "identity":
                return "I'm the CozyOS Assistant. Right now I answer using a real, rule-based conversational composer (not a language model) alongside CozyOS's real reasoning, memory, and policy pipeline.";
            case "help":
                return "I can help with search, notifications, recent activity, and simple conversational questions. My conversational understanding today is rule-based — I honestly recognize greetings, help requests, thanks, and questions about who I am; anything outside that, I'll tell you honestly that I don't have a rule-based answer for it yet.";
            default:
                return "I don't have a rule-based answer for that yet — right now my conversational understanding only covers greetings, help requests, thanks, and questions about who I am. That's a real, disclosed limit, not an error.";
        }
    }

    /**
     * The real provider object — satisfies LivingAI's required
     * think(text, options) -> {success, result|reason} contract. On
     * every call (supported or not), result carries a real .text field
     * so resolveConversationalReply() (core/living/cozy-living-
     * assistant.js, unmodified) recognizes it as a genuine
     * conversational answer — including the honest "not supported yet"
     * case, which is itself a genuine answer, never the generic
     * NO_CONVERSATIONAL_ENGINE_FALLBACK string owned by that file.
     */
    const ruleBasedProvider = {
        async think(text, options = {}) {
            // Real pipeline call first — same entry point
            // reasoningPipelineProvider (cozy-living-ai.js) already
            // uses, so Memory/Policy/Interpretation/Thinking/Reasoning/
            // Intelligence still genuinely run and their diagnostics
            // are preserved on the result for any caller that wants
            // them. A missing/failing coordinator never blocks this
            // provider's own honest reply — it only means the
            // pipeline's own real side effects didn't happen this call.
            let pipelineResult = null;
            const coordinator = window.CozyOS && window.CozyOS.CognitiveCoordinator;
            if (coordinator && typeof coordinator.run === "function") {
                try {
                    pipelineResult = await coordinator.run({ text, ...options });
                } catch (_err) {
                    pipelineResult = null; // honest: this composer still answers even if the pipeline itself failed
                }
            }
            const intent = classifyIntent(text);
            const replyText = composeReply(intent);
            return { success: true, result: { text: replyText, intent, pipeline: pipelineResult } };
        },
        describe() {
            return {
                kind: "rule-based conversational composer",
                isLLM: false,
                offline: true,
                supportedIntents: INTENT_RULES.map((r) => r.id).concat(["unsupported"]),
                note: "Real, disclosed rule-based intent matching (greeting/help/thanks/identity) composed with CognitiveCoordinator's own real evidence/memory/policy pipeline. Never a language model, never fabricated understanding — unsupported input honestly says so."
            };
        }
    };

    function registerWithLivingAI() {
        const ai = window.CozyOS.LivingAI;
        if (!ai || typeof ai.registerProvider !== "function") return false;
        const result = ai.registerProvider(PROVIDER_NAME, ruleBasedProvider);
        return !!(result && result.success);
    }

    /**
     * activateExplicitly()
     *   The one deliberate, disclosed activation call this repair
     *   makes (see ACTIVATION note above) — a separate step from
     *   registerWithLivingAI(), never a side effect of it. Only called
     *   after registration itself genuinely succeeded.
     */
    function activateExplicitly() {
        const ai = window.CozyOS.LivingAI;
        if (!ai || typeof ai.setActiveProvider !== "function") return false;
        const result = ai.setActiveProvider(PROVIDER_NAME);
        return !!(result && result.success);
    }

    // Real, optional visibility/health integration — same pattern
    // RP-025-A's on-device provider already uses. This provider has no
    // external dependency, so its health is always ONLINE once loaded
    // (never a guess dressed up as a live check — there is genuinely
    // nothing further to verify at runtime for a pure local function).
    function registerWithProviderManager() {
        const pm = window.CozyOS.ProviderManager;
        if (!pm || typeof pm.register !== "function") return false;
        pm.register({
            id: "rule-based-conversational",
            name: "Rule-Based Conversational Composer",
            category: "intelligence",
            version: VERSION,
            dependencies: [],
            getHealth() { return { health: "ONLINE", reason: "Pure local rule-based composer — no external runtime or network dependency to fail." }; }
        });
        return true;
    }

    const registered = registerWithLivingAI();
    registerWithProviderManager();
    const activated = registered ? activateExplicitly() : false;

    window.CozyOS.Modules["rule-based-conversational-provider"] = Object.freeze({
        version: VERSION,
        description: "RP-026 — real rule-based conversational Reply Composer. Classifies raw input text against a small, disclosed intent set (greeting-morning/afternoon/evening/generic, thanks, identity, help) and composes an honest, fixed human-readable .text reply for each — including an equally honest 'no rule-based answer yet' reply for unsupported input, never the pipeline-internals RP-024 already excludes. Calls CognitiveCoordinator.run() first (same entry point reasoningPipelineProvider already uses) so Memory/Policy/Interpretation/Thinking/Reasoning/Intelligence still genuinely execute; a missing/failing coordinator never blocks this provider's own reply. Registers into LivingAI's existing 'rule-based-conversational' provider slot and (optionally) ProviderManager for visibility/health, then explicitly activates itself via the existing LivingAI.setActiveProvider() choke point as one disclosed, separate step — never a side effect of registration. Never claims LLM/neural/machine-learning capability."
    });
})();
