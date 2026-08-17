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
 *
 * RP-027 EXTENSION (CozyOS Conversational Knowledge + Multilingual
 * Response Expansion) — additive, this file only
 *   This file is extended, not replaced. RP-026's architecture stays
 *   exactly as documented above (registerProvider() into LivingAI's
 *   existing extension point, composition around
 *   CognitiveCoordinator.run(), an explicit, separate
 *   activateExplicitly() step) — RP-027 only grows INTENT_RULES and
 *   composeReply(). Two new, additive, standalone files are read as
 *   pure consumers, never modifying this file's own registration/
 *   activation logic:
 *     - core/modules/intelligence/knowledge/cozy-knowledge-registry.js
 *       — gathers live evidence (founder identity, application list,
 *       provider health) from already-existing real registries, always
 *       tagged with an explicit VERIFIED / PARTIALLY_VERIFIED /
 *       NOT_FOUND evidence state (RP-027 Fact Safety Rule, §3). This
 *       file never invents a fact when that registry reports NOT_FOUND
 *       or is absent — it uses the matching honest fallback template
 *       instead (see composeReply() below).
 *     - core/modules/intelligence/language/cozy-language-registry.js
 *       and cozy-language-templates.js — the 5 default (en/sw/fr/ar/so,
 *       AVAILABLE) + 6 extended (luo/ki/kam/zu/lg/ig, NOT_READY this
 *       pass) language registry and its verified per-language response
 *       templates (RP-027 §8/§9/§11). think() resolves a language via
 *       CozyLanguageRegistry.resolveLanguage() (manual > requested >
 *       country-suggested > English, RP-027 §10) and composeReply()
 *       looks up the matching template — never a live/uncontrolled
 *       translation call. If the resolved language differs from what
 *       was actually requested (i.e. the requested language isn't
 *       AVAILABLE yet), the honest fallback disclosure (RP-027 §12) is
 *       appended to the reply, in the resolved language, and
 *       result.languageFallback is set to true so callers can detect it
 *       programmatically too.
 *   Neither new file is required for this provider to keep working:
 *   both are read defensively (typeof-checked before use), so a page
 *   that hasn't loaded them yet still gets RP-026's original English
 *   behavior for the original 7 intents, never a throw.
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
        // ── RP-026 original 7 — order and patterns unchanged ──────────
        { id: "greeting-morning", pattern: /\bgood\s+morning\b/i },
        { id: "greeting-afternoon", pattern: /\bgood\s+afternoon\b/i },
        { id: "greeting-evening", pattern: /\bgood\s+evening\b/i },

        // ── RP-027 new intent families — most specific pattern first,
        //    ahead of the RP-026 generic greeting/identity/help
        //    patterns below, so (for example) "who created CozyOS"
        //    matches "founder" rather than the generic "identity"
        //    pattern, and "what is CozyOS Enterprise" matches the
        //    Enterprise intent rather than the shorter "what-is-cozyos"
        //    pattern it textually contains. ─────────────────────────
        { id: "what-is-cozyos-enterprise", pattern: /\bcozyos\s+enterprise\b/i },

        // ── CozyAI Project Knowledge & Public Story Integration —
        //    placed AHEAD of "founder" (the bare \bfounder\b pattern
        //    would otherwise swallow "why did the founder create
        //    CozyOS" — more specific patterns must be checked first,
        //    per this file's own established ordering discipline) and
        //    ahead of what-is-cozyos for the same reason. ───────────
        { id: "project-origin", pattern: /\bwhy\s+was\s+cozyos\s+started\b|\bwhy\s+did\s+(?:the\s+)?founder\s+create\s+cozyos\b|\borigin\s+of\s+cozyos\b/i },
        { id: "public-story", pattern: /\bpublic\s+story\b|\bcozyos\s+story\b|\bstory\s+of\s+cozyos\b/i },
        { id: "cozyos-vision", pattern: /\bvision\s+of\s+cozyos\b|\bcozyos'?s?\s+vision\b|\bwhat\s+is\s+cozyos\s+trying\s+to\s+accomplish\b|\bwhat\s+is\s+the\s+vision\b/i },
        { id: "cozyos-mission", pattern: /\bmission\s+of\s+cozyos\b|\bcozyos'?s?\s+mission\b|\bwhat\s+is\s+the\s+mission\b/i },
        { id: "project-history", pattern: /\bproject\s+history\b|\bhistory\s+of\s+cozyos\b|\bwhat\s+is\s+the\s+history\b/i },

        { id: "founder", pattern: /\bwho\s+(?:created|made|built|founded)\s+(?:you|cozyos)\b|\bfounder\b|\bwho\s+owns\s+cozyos\b|\bowner\s+of\s+cozyos\b/i },
        { id: "what-is-cozyos", pattern: /\bwhat\s+is\s+cozyos\b/i },
        { id: "list-apps", pattern: /\b(?:what|which)\s+apps?\b|\bshow\s+me\s+the\s+apps\b|\bapplications?\s+(?:are\s+)?(?:available|installed)\b|\bwant\s+to\s+see\s+the\s+apps\b|\bfind\s+an?\s+app\b/i },
        { id: "how-to-register", pattern: /\bhow\s+(?:do\s+i|to|can\s+i)\s+register\b|\bregistration\s+requirements?\b|\bhow\s+do\s+i\s+activate\s+an?\s+account\b|\bhow\s+(?:do\s+i|can\s+i)\s+create\s+an?\s+account\b/i },
        { id: "phone-verification", pattern: /\bphone\s+verification\b|\bverify\s+my\s+phone\b|\bwhy\s+(?:is\s+)?my\s+phone\s+not\s+verified\b|\bwhy\s+did\s+my\s+verification\s+fail\b/i },
        { id: "how-authentication-works", pattern: /\bhow\s+(?:does\s+)?authentication\s+works?\b|\bwhat\s+happens\s+during\s+authentication\b|\bwhy\s+is\s+authentication\s+failing\b/i },
        { id: "account-status", pattern: /\baccount\s+not\s+active\b|\bwhy\s+is\s+my\s+account\b|\baccount\s+status\b|\baccount\s+(?:disabled|pending|inactive)\b/i },
        { id: "provider-not-ready", pattern: /\bnot_ready\b|\bwhat\s+does\s+not_ready\s+mean\b|\bwhy\s+is\s+(?:an?\s+)?(?:ai\s+)?provider\s+disabled\b/i },
        { id: "list-providers", pattern: /\blist\s+providers\b|\bprovider\s+status\b|\bwhat\s+providers\b/i },
        { id: "what-is-provider", pattern: /\bwhat\s+(?:is|are)\s+(?:an?\s+)?(?:ai\s+)?providers?\b/i },
        { id: "control-center", pattern: /\bcontrol\s+center\b|\bdashboard\s+navigation\b|\bwhere\s+is\b.*\bfeature\b/i },

        // ── RP-026 original 4 (generic patterns — must stay after the
        //    more specific RP-027 patterns above) ──────────────────────
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
     * resolveLanguage(options)
     *   Defensive wrapper around CozyLanguageRegistry.resolveLanguage()
     *   (RP-027). If that module hasn't loaded on this page, degrades
     *   honestly to English — never throws, never invents a language
     *   state. This is the ONLY place language is resolved; composeReply()
     *   always receives an already-resolved, AVAILABLE code.
     */
    function resolveLanguage(options) {
        const registry = window.CozyOS && window.CozyOS.CozyLanguageRegistry;
        if (registry && typeof registry.resolveLanguage === "function") {
            const resolved = safeCall(() => registry.resolveLanguage({
                manual: options && options.language,
                requested: options && options.requestedLanguage,
                country: options && options.country
            }));
            if (resolved && resolved.code) return resolved;
        }
        return { code: "en", preferred: (options && (options.language || options.requestedLanguage)) || "en", fallback: false, reason: null };
    }

    /** safeCall(fn) — mirrors the knowledge registry's own helper; a throwing dependency degrades to null, never a fabricated result. */
    function safeCall(fn) {
        try { return fn(); } catch (_err) { return null; }
    }

    /** languageDisplayName(code) — honest best-effort label for the fallback disclosure sentence; falls back to the raw code if the registry can't name it. */
    function languageDisplayName(code) {
        const registry = window.CozyOS && window.CozyOS.CozyLanguageRegistry;
        if (registry && typeof registry.getLanguage === "function") {
            const lang = safeCall(() => registry.getLanguage(code));
            if (lang && lang.name) return lang.name;
        }
        return code;
    }

    /**
     * template(key, lang)
     *   Defensive lookup into CozyLanguageTemplates (RP-027). Falls back
     *   to English, and — if the templates module itself isn't loaded —
     *   to this file's own original RP-026 English strings, so the
     *   original 7 intents keep working with zero external dependency,
     *   exactly as RP-026 shipped them.
     */
    const RP026_ENGLISH_FALLBACK = Object.freeze({
        "greeting-morning": "Good morning! I'm the CozyOS Assistant — ready to help with whatever you're working on today.",
        "greeting-afternoon": "Good afternoon! I'm the CozyOS Assistant. What can I help you with?",
        "greeting-evening": "Good evening! I'm the CozyOS Assistant. How can I help?",
        "greeting-generic": "Hello! I'm the CozyOS Assistant. How can I help you?",
        "thanks": "You're welcome! Let me know if there's anything else you need.",
        "identity": "I'm the CozyOS Assistant. Right now I answer using a real, rule-based conversational composer (not a language model) alongside CozyOS's real reasoning, memory, and policy pipeline.",
        "help": "I can help with search, notifications, recent activity, and simple conversational questions. My conversational understanding today is rule-based — I honestly recognize greetings, help requests, thanks, and questions about who I am; anything outside that, I'll tell you honestly that I don't have a rule-based answer for it yet.",
        "unsupported": "I don't have a rule-based answer for that yet — right now my conversational understanding only covers greetings, help requests, thanks, and questions about who I am. That's a real, disclosed limit, not an error.",
        // RP-027 dynamic-intent honest fallbacks — kept here too (not
        // only in cozy-language-templates.js) so a page that loaded
        // cozy-knowledge-registry.js but NOT cozy-language-templates.js
        // (an unusual, but possible, partial load) still never returns
        // a blank/undefined reply for these three evidence-backed
        // intents — response text must never be empty, per RP-027 §13.
        "founder:not_found": "I'm the CozyOS Assistant. I was built as part of CozyOS, but I don't currently have a verified record of the individual who created me.",
        "list-apps:unavailable": "I can help you find the CozyOS apps, but the application registry isn't available right now.",
        "list-providers:unavailable": "I can explain what providers are, but I can't see the live Provider Manager status from here right now.",
        // CozyAI Project Knowledge & Public Story Integration —
        // same "not_found" fallback convention, so a partial-load page
        // (cozy-knowledge-registry.js without cozy-language-
        // templates.js) still never returns a blank/undefined reply
        // for these five evidence-backed intents.
        "project-origin:not_found": "The public origin story of CozyOS hasn't been published yet, so I don't have an authoritative answer to why it was started.",
        "public-story:not_found": "CozyOS doesn't have a published public story yet, so I can't share one right now.",
        "vision:not_found": "CozyOS's vision statement hasn't been published yet, so I don't have an authoritative answer for what it's trying to accomplish.",
        "mission:not_found": "CozyOS's mission statement hasn't been published yet, so I don't have an authoritative answer for that.",
        "project-history:not_found": "CozyOS's project history hasn't been published yet, so I don't have an authoritative account of it."
    });

    function template(key, lang) {
        const templates = window.CozyOS && window.CozyOS.CozyLanguageTemplates;
        if (templates && typeof templates.getTemplate === "function") {
            const found = safeCall(() => templates.getTemplate(key, lang));
            if (found) return found;
        }
        return RP026_ENGLISH_FALLBACK[key] || null;
    }

    /** safeCallAsync(fn) — same fail-closed discipline as safeCall(), for the async CozyAI Project Knowledge fact-getters below. */
    async function safeCallAsync(fn) {
        try { return await fn(); } catch (_err) { return null; }
    }

    /**
     * composeReply(intent, lang)
     *   Real template selection — the ONLY place conversational text is
     *   generated. Never reads pipeline internals. Fixed-text intents
     *   resolve directly to a per-language string (template()); the
     *   evidence-backed intents (founder/list-apps/list-providers, plus
     *   the CozyAI Project Knowledge intents below) call CozyKnowledge
     *   (RP-027) for live evidence first and select the ":verified" or
     *   the honest ":not_found"/":unavailable" template variant
     *   accordingly — per the Fact Safety Rule (RP-027 §3), absence of
     *   evidence is NEVER converted into a positive claim. async
     *   because the five project-knowledge fact-getters compose
     *   FounderStory.getPublicStory(), which is genuinely async
     *   (real Vault decryption) — this file's only caller (think())
     *   is already async and awaits this.
     */
    async function composeReply(intent, lang) {
        const knowledge = window.CozyOS && window.CozyOS.CozyKnowledge;

        switch (intent) {
            case "founder": {
                const fact = knowledge && typeof knowledge.getFounderFact === "function" ? safeCall(() => knowledge.getFounderFact()) : null;
                if (fact && fact.evidence === "VERIFIED") {
                    const frame = template("founder:verified", lang);
                    if (typeof frame === "function") return frame(fact.answer);
                }
                return template("founder:not_found", lang);
            }
            case "project-origin": {
                const fact = knowledge && typeof knowledge.getProjectOriginFact === "function" ? await safeCallAsync(() => knowledge.getProjectOriginFact()) : null;
                if (fact && fact.evidence === "VERIFIED") {
                    const frame = template("project-origin:verified", lang);
                    if (typeof frame === "function") return frame(fact.answer);
                }
                return template("project-origin:not_found", lang);
            }
            case "public-story": {
                const fact = knowledge && typeof knowledge.getPublicStoryFact === "function" ? await safeCallAsync(() => knowledge.getPublicStoryFact()) : null;
                if (fact && fact.evidence === "VERIFIED") {
                    const frame = template("public-story:verified", lang);
                    if (typeof frame === "function") return frame(fact.answer);
                }
                return template("public-story:not_found", lang);
            }
            case "cozyos-vision": {
                const fact = knowledge && typeof knowledge.getVisionFact === "function" ? await safeCallAsync(() => knowledge.getVisionFact()) : null;
                if (fact && fact.evidence === "VERIFIED") {
                    const frame = template("vision:verified", lang);
                    if (typeof frame === "function") return frame(fact.answer);
                }
                return template("vision:not_found", lang);
            }
            case "cozyos-mission": {
                const fact = knowledge && typeof knowledge.getMissionFact === "function" ? await safeCallAsync(() => knowledge.getMissionFact()) : null;
                if (fact && fact.evidence === "VERIFIED") {
                    const frame = template("mission:verified", lang);
                    if (typeof frame === "function") return frame(fact.answer);
                }
                return template("mission:not_found", lang);
            }
            case "project-history": {
                const fact = knowledge && typeof knowledge.getProjectHistoryFact === "function" ? await safeCallAsync(() => knowledge.getProjectHistoryFact()) : null;
                if (fact && fact.evidence === "VERIFIED") {
                    const frame = template("project-history:verified", lang);
                    if (typeof frame === "function") return frame(fact.answer);
                }
                return template("project-history:not_found", lang);
            }
            case "list-apps": {
                const fact = knowledge && typeof knowledge.listApplicationsFact === "function" ? safeCall(() => knowledge.listApplicationsFact()) : null;
                if (fact && fact.evidence === "VERIFIED" && Array.isArray(fact.applications) && fact.applications.length > 0) {
                    const frame = template("list-apps:verified", lang);
                    if (typeof frame === "function") return frame(fact.applications);
                }
                return template("list-apps:unavailable", lang);
            }
            case "list-providers": {
                const fact = knowledge && typeof knowledge.listProvidersFact === "function" ? safeCall(() => knowledge.listProvidersFact()) : null;
                if (fact && fact.evidence === "VERIFIED" && Array.isArray(fact.entries) && fact.entries.length > 0) {
                    const frame = template("list-providers:verified", lang);
                    if (typeof frame === "function") return frame(fact.entries);
                }
                return template("list-providers:unavailable", lang);
            }
            case "what-is-cozyos-enterprise":
            case "what-is-cozyos":
            case "how-to-register":
            case "how-authentication-works":
            case "phone-verification":
            case "account-status":
            case "what-is-provider":
            case "provider-not-ready":
            case "control-center":
            case "greeting-morning":
            case "greeting-afternoon":
            case "greeting-evening":
            case "greeting-generic":
            case "thanks":
            case "identity":
            case "help":
                return template(intent, lang) || RP026_ENGLISH_FALLBACK[intent];
            default:
                return template("unsupported", lang) || RP026_ENGLISH_FALLBACK.unsupported;
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

            // RP-027 — resolve language (manual > requested > country
            // suggestion > English), then compose the reply in that
            // resolved (AVAILABLE) language. If the person's actual
            // preference wasn't AVAILABLE yet, honestly append the
            // fallback disclosure (RP-027 §12) rather than silently
            // substituting language.
            const resolvedLanguage = resolveLanguage(options);
            let replyText = await composeReply(intent, resolvedLanguage.code);
            if (resolvedLanguage.fallback) {
                const templates = window.CozyOS && window.CozyOS.CozyLanguageTemplates;
                const disclosureFn = templates && templates.FALLBACK_DISCLOSURE && templates.FALLBACK_DISCLOSURE[resolvedLanguage.code];
                if (typeof disclosureFn === "function") {
                    replyText = `${replyText} ${disclosureFn(languageDisplayName(resolvedLanguage.preferred), languageDisplayName(resolvedLanguage.code))}`;
                }
            }

            return {
                success: true,
                result: {
                    text: replyText,
                    intent,
                    language: resolvedLanguage.code,
                    requestedLanguage: resolvedLanguage.preferred,
                    languageFallback: !!resolvedLanguage.fallback,
                    pipeline: pipelineResult
                }
            };
        },
        describe() {
            const languageRegistry = window.CozyOS && window.CozyOS.CozyLanguageRegistry;
            const languages = languageRegistry && typeof languageRegistry.listLanguages === "function" ? safeCall(() => languageRegistry.listLanguages()) : null;
            return {
                kind: "rule-based conversational composer",
                isLLM: false,
                offline: true,
                supportedIntents: INTENT_RULES.map((r) => r.id).concat(["unsupported"]),
                supportedLanguages: languages || RP026_ENGLISH_FALLBACK && ["en"],
                note: "Real, disclosed rule-based intent matching (RP-026 greeting/help/thanks/identity, plus RP-027 CozyOS-identity/apps/registration/authentication/account/provider/architecture intents) composed with CognitiveCoordinator's own real evidence/memory/policy pipeline, in a resolved, verified-template language (RP-027). Never a language model, never fabricated understanding, never a live/uncontrolled translation call — unsupported input, missing evidence, and unavailable languages are all honestly disclosed rather than guessed."
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
        description: "RP-026 + RP-027 — real rule-based conversational Reply Composer. Classifies raw input text against a disclosed intent set: RP-026's original 7 (greeting-morning/afternoon/evening/generic, thanks, identity, help) plus RP-027's CozyOS-identity (founder, what-is-cozyos, what-is-cozyos-enterprise), applications (list-apps), registration (how-to-register), authentication (how-authentication-works, phone-verification), account (account-status), providers (what-is-provider, list-providers, provider-not-ready), and architecture (control-center) intents — and composes an honest, verified-template .text reply for each in a resolved language (English, Kiswahili, French, Arabic, or Somali — RP-027's 5 default languages), including an equally honest 'no rule-based answer yet' reply for unsupported input. Evidence-backed intents (founder/list-apps/list-providers) read live repository/runtime state via CozyKnowledge and only ever state VERIFIED facts, never inventing an answer when evidence is absent. Calls CognitiveCoordinator.run() first (same entry point reasoningPipelineProvider already uses) so Memory/Policy/Interpretation/Thinking/Reasoning/Intelligence still genuinely execute; a missing/failing coordinator never blocks this provider's own reply. Registers into LivingAI's existing 'rule-based-conversational' provider slot and (optionally) ProviderManager for visibility/health, then explicitly activates itself via the existing LivingAI.setActiveProvider() choke point as one disclosed, separate step — never a side effect of registration. Never claims LLM/neural/machine-learning capability, never performs a live/uncontrolled translation call."
    });
})();
