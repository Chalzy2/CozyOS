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
/**
 * RP-036 — Assistant Intent/Routing Repair (English + Kiswahili)
 *   Root cause: a bare/simple request like "Register" (and most other
 *   ordinary phrasings — "I want to register", "Create an account",
 *   "Sign me up", any Kiswahili input at all) never matched any
 *   INTENT_RULES pattern above, so classifyIntent() fell through to
 *   "unsupported" and composeReply() returned the honest-but-blocking
 *   "I don't have a rule-based answer for that yet..." fallback text —
 *   confirmed directly in this file before making any change. Two
 *   compounding gaps, both fixed here, additively, in this same file
 *   plus cozy-language-templates.js (also additive) and
 *   cozy-living-assistant.js (DOM-owning navigation execution only):
 *     1. The one existing registration-adjacent rule
 *        ("how-to-register") only matched the "how do I register"
 *        phrasing, not a bare command or its many ordinary synonyms —
 *        broadened below (same intent id, so its existing template and
 *        regression tests are unaffected).
 *     2. classifyIntent() had ZERO non-English patterns anywhere —
 *        Kiswahili input could never match any intent, register or
 *        otherwise, regardless of how CozyLanguageRegistry/Templates
 *        were configured (those only ever controlled which language
 *        the REPLY was written in, never what the input was
 *        understood as). Kiswahili trigger phrases added to the
 *        existing intents below; a new, disclosed, local
 *        keyword-overlap heuristic (detectLanguageHeuristic()) also
 *        now lets a Kiswahili message be answered in Kiswahili
 *        automatically even when no language option was explicitly
 *        passed in — see that function's own doc comment for exactly
 *        what it does and does not claim to do.
 *   Also new this pass: six navigable-action intents (nav-dashboard/
 *   notifications/recent/search/aiproviders/diagnostics) so requests
 *   like "Open dashboard" or "Fungua dashibodi" are recognized here and
 *   actually executed by cozy-living-assistant.js's #send() against the
 *   SAME real, existing navigation mechanism the assistant's quick-
 *   action buttons already used (#runQuickAction()) — never a new or
 *   invented route. No file was deleted; no existing intent, template,
 *   rule, or registration/activation logic was removed or weakened.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.3.0"; // RP-036: broadened register/synonym matching, added Kiswahili intent patterns + language auto-detection, added 6 navigation intents. COZYAI-PUBLIC-VISION-KNOWLEDGE: added why-use-cozyos/differentiation/language-support-list intents (EN+SW) sourced from the owner-approved vision-policy doc only. REGISTRATION/AUTH: how-to-register is now evidence-backed via getRegistrationFlowFact() (real, audited registration source), added 2 more Kiswahili "create account" verb-stem patterns + detection markers.
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

        // ── COZYAI-PUBLIC-VISION-KNOWLEDGE — why-use / differentiation /
        // language-support-list. Placed here (after the project-
        // knowledge cluster, ahead of "founder"/"what-is-cozyos") for
        // the same reason those are: more specific patterns must be
        // checked before the shorter, more general ones below can
        // swallow them. Sourced exclusively from cozy-public-
        // knowledge-source.js (owner-approved vision-policy doc) —
        // never founder-story-seed.js.
        { id: "why-use-cozyos", pattern: /\bwhy\s+(?:should|would)\s+(?:i|someone|you)\s+use\s+cozyos\b|\bwhy\s+use\s+cozyos\b|\bbenefits?\s+of\s+cozyos\b|\bwhy\s+cozyos\b|\bkwa\s+nini\s+nitumie(?:\s+cozyos)?\b|\bkwa\s+nini\s+(?:ni)?tumie\s+cozyos\b|\bfaida\s+za\s+cozyos\b/i },
        { id: "differentiation", pattern: /\bhow\s+is\s+cozyos\s+different\b|\bwhat\s+makes\s+cozyos\s+different\b|\bhow\s+does\s+cozyos\s+differ\b|\bcozyos\s+vs\.?\s|\bcompared\s+to\s+other\s+apps?\b|\binatofautianaje\b|\btofauti\s+(?:ya|na)\s+cozyos\b|\bcozyos\s+inatofautiana(?:naje)?\b/i },
        { id: "language-support-list", pattern: /\bwhich\s+languages?\s+(?:does\s+)?cozyos\s+support\b|\bwhat\s+languages?\s+(?:does\s+)?cozyos\s+support\b|\blanguage\s+support\b|\bsupported\s+languages\b|\blugha\s+(?:zipi|gani)\s+(?:zinazoungwa\s+mkono|zinazotumika)\b|\bcozyos\s+inaunga\s+mkono\s+lugha\s+gani\b/i },

        { id: "founder", pattern: /\bwho\s+(?:created|made|built|founded)\s+(?:you|cozyos)\b|\bfounder\b|\bwho\s+owns\s+cozyos\b|\bowner\s+of\s+cozyos\b/i },
        { id: "what-is-cozyos", pattern: /\bwhat\s+is\s+cozyos\b|\bcozyos\s+ni\s+nini\b/i },
        { id: "list-apps", pattern: /\b(?:what|which)\s+apps?\b|\bshow\s+me\s+the\s+apps\b|\bapplications?\s+(?:are\s+)?(?:available|installed)\b|\bwant\s+to\s+see\s+the\s+apps\b|\bfind\s+an?\s+app\b/i },
        // RP-036 fix — the previous pattern only matched the "how do I
        // register" phrasing, so a bare "Register", "I want to
        // register", "Create an account", "Sign me up", or any
        // Kiswahili phrasing fell through to "unsupported". Broadened,
        // still a single named intent (id unchanged, so the existing
        // "how-to-register" template/tests keep working unmodified):
        //   - \bregist(?:er|ration)\b catches every English surface
        //     form built on the same root ("register", "registration",
        //     "How do I register?", "Where do I register?", "Take me
        //     to registration", "registration requirements", etc.)
        //     without needing a separate clause per phrasing.
        //   - sign up / sign me up covers the two English synonyms
        //     that don't share that root.
        //   - "create an/account" (no longer requiring "how") covers
        //     the bare "Create an account" / "I want to create an
        //     account" phrasing. The optional (?:\w+\s+)? before
        //     "account" (added this milestone) also covers "create a
        //     CozyOS account" / "create an X account" phrasing, where
        //     a single product-name/adjective word sits between the
        //     article and "account" — confirmed necessary by the
        //     REGISTRATION/AUTH milestone's own required test phrase
        //     "How can I create a CozyOS account?".
        //   - sajili (no leading \b — the Kiswahili verb stem "-sajili"
        //     is a suffix on its own subject/tense prefixes, e.g.
        //     "kujisajili", "kusajili", so a leading word-boundary
        //     would never match it; a trailing \b is kept so it still
        //     requires the real stem, not a coincidental substring)
        //     covers kujisajili/kusajili/sajili in any of the tested
        //     phrasings (Nataka kujisajili, Nataka kusajili akaunti,
        //     Ninawezaje kujisajili?, Nisaidie kujisajili).
        //   - \bkufungua\s+akaunti\b / \bfungua\s+akaunti\b covers the
        //     "open an account" phrasing (Nataka kufungua akaunti) —
        //     "akaunti" alone is intentionally NOT used as a trigger
        //     (it would collide with the Kiswahili account-status
        //     intent below), only this specific two-word phrase.
        //   - REGISTRATION/AUTH milestone: \bkutengeneza\s+akaunti\b /
        //     \btengeneza\s+akaunti\b and \bkuunda\s+akaunti\b /
        //     \bunda\s+akaunti\b add the two other real Kiswahili "make/
        //     create an account" verb stems ("Ninawezaje kutengeneza
        //     akaunti?", "Ninawezaje kuunda akaunti ya CozyOS?") — same
        //     "always the two-word phrase, never bare akaunti" discipline
        //     as kufungua/fungua above, so this still never collides
        //     with the Kiswahili account-status intent below.
        { id: "how-to-register", pattern: /\bregist(?:er|ration)\b|\bsign\s*me\s*up\b|\bsign\s*up\b|\bcreate\s+an?\s+(?:\w+\s+)?account\b|sajili\b|\bkufungua\s+akaunti\b|\bfungua\s+akaunti\b|\bkutengeneza\s+akaunti\b|\btengeneza\s+akaunti\b|\bkuunda\s+akaunti\b|\bunda\s+akaunti\b/i },

        // RP-036 — real navigation intents. Each maps (in
        // cozy-living-assistant.js's #send(), the DOM-owning file — this
        // file stays DOM-free/pure by design, unchanged discipline) onto
        // the SAME existing, real navigation mechanisms the quick-action
        // buttons already use (#runQuickAction()'s "goto-<center>" click
        // on the real [data-center] nav link, and its real "notifications"
        // /"recent"/"search" branches) — never a new/invented route.
        // "settings"/"profile" are deliberately NOT included here: no
        // single, unambiguous existing route for them was found in this
        // repository (closest candidates - "configuration",
        // "themeStudio" - aren't a confident match), so per this repair's
        // own "do not invent routes" constraint they fall through to the
        // honest "unsupported" fallback instead of a guessed navigation.
        { id: "nav-dashboard", pattern: /\b(?:open|go\s+to|show\s+me?|take\s+me\s+to)\s+(?:the\s+)?dashboard\b/i },
        { id: "nav-notifications", pattern: /\b(?:open|show(?:\s+me)?)\s+(?:the\s+)?notifications?\b|\bwhat\s+are\s+my\s+notifications?\b/i },
        { id: "nav-recent", pattern: /\bshow\s+(?:me\s+)?recent\s+activity\b|\bwhat\s+happened\s+recently\b/i },
        { id: "nav-search", pattern: /\bopen\s+(?:the\s+)?search\b|\bshow\s+(?:me\s+)?search\b/i },
        { id: "nav-aiproviders", pattern: /\btake\s+me\s+to\s+ai\s+providers\b|\bopen\s+ai\s+providers\b|\bfind\s+(?:an?\s+)?ai\s+providers?\b|\bhelp\s+me\s+find\s+ai\s+providers\b/i },
        { id: "nav-diagnostics", pattern: /\bopen\s+(?:the\s+)?diagnostics\s+center\b/i },
        // Kiswahili navigation phrasing (RP-036) — "fungua"/"nionyeshe"
        // (open/show) combined with the specific target noun, so these
        // never collide with the bare "sajili"/register patterns above.
        { id: "nav-dashboard", pattern: /\bfungua\s+dashibodi\b|\bnenda\s+(?:kwenye\s+)?dashibodi\b/i },
        { id: "nav-notifications", pattern: /\bnionyeshe\s+arifa\b|\bfungua\s+arifa\b/i },
        { id: "nav-recent", pattern: /\bshughuli\s+za\s+hivi\s+karibuni\b/i },
        { id: "phone-verification", pattern: /\bphone\s+verification\b|\bverify\s+my\s+phone\b|\bwhy\s+(?:is\s+)?my\s+phone\s+not\s+verified\b|\bwhy\s+did\s+my\s+verification\s+fail\b/i },
        { id: "how-authentication-works", pattern: /\bhow\s+(?:does\s+)?authentication\s+works?\b|\bwhat\s+happens\s+during\s+authentication\b|\bwhy\s+is\s+authentication\s+failing\b/i },
        { id: "account-status", pattern: /\baccount\s+not\s+active\b|\bwhy\s+is\s+my\s+account\b|\baccount\s+status\b|\baccount\s+(?:disabled|pending|inactive)\b/i },
        { id: "provider-not-ready", pattern: /\bnot_ready\b|\bwhat\s+does\s+not_ready\s+mean\b|\bwhy\s+is\s+(?:an?\s+)?(?:ai\s+)?provider\s+disabled\b/i },
        { id: "list-providers", pattern: /\blist\s+providers\b|\bprovider\s+status\b|\bwhat\s+providers\b/i },
        { id: "what-is-provider", pattern: /\bwhat\s+(?:is|are)\s+(?:an?\s+)?(?:ai\s+)?providers?\b/i },
        { id: "control-center", pattern: /\bcontrol\s+center\b|\bdashboard\s+navigation\b|\bwhere\s+is\b.*\bfeature\b/i },

        // ── RP-026 original 4 (generic patterns — must stay after the
        //    more specific RP-027 patterns above), extended (RP-036)
        //    with Kiswahili equivalents so classifyIntent() is no
        //    longer English-only for these — same intent ids, so
        //    existing templates/tests are unaffected. ──────────────────
        { id: "greeting-generic", pattern: /\b(hi|hello|hey|greetings)\b|\bhabari\b|\bhujambo\b|\bmambo\b/i },
        { id: "thanks", pattern: /\b(thanks|thank\s?you|appreciate\s+it)\b|\basante\b/i },
        { id: "identity", pattern: /\bwho\s+are\s+you\b|\bwhat\s+are\s+you\b|\bwewe\s+ni\s+nani\b/i },
        { id: "help", pattern: /\bhelp\b|\bwhat\s+can\s+you\s+do\b|\bnisaidie\b|\bmsaada\b|\bunaweza\s+kufanya\s+nini\b/i }
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
     * detectLanguageHeuristic(text) — RP-036
     *   A small, disclosed, real keyword-overlap heuristic — NOT a
     *   language-ID model — used only to fill in the "requested"
     *   language slot when the caller didn't already supply one (via
     *   options.language/options.requestedLanguage). Mirrors the same
     *   honesty discipline core/engines/media/language/provider-
     *   lexical.js already uses elsewhere in this codebase (real,
     *   computed keyword overlap against a curated reference lexicon;
     *   an honest `null` — never a guess — when nothing matches). Kept
     *   local/self-contained here (rather than importing that ES
     *   module) since this file is a plain, non-module script loaded
     *   the same way as every other CozyOS core script. Only Kiswahili
     *   is covered this pass — the same disclosed, partial-coverage
     *   pattern RP-027 already established for its 5 default languages.
     */
    function detectLanguageHeuristic(text) {
        if (typeof text !== "string" || !text.trim()) return null;
        const SW_MARKERS = new Set([
            "habari", "hujambo", "mambo", "nataka", "nisaidie", "nisaidi", "fungua",
            "nionyeshe", "ninawezaje", "naweza", "wapi", "akaunti", "sajili", "kujisajili",
            "kusajili", "dashibodi", "mipangilio", "arifa", "nini", "karibuni", "shughuli",
            "kuona", "kufungua", "kuingia", "msaada", "nipe", "asante", "sawa", "kwenye",
            // COZYAI-PUBLIC-VISION-KNOWLEDGE — markers for the new
            // why-use-cozyos/differentiation/language-support-list
            // Swahili trigger phrasings above (e.g. "Kwa nini
            // nitumie CozyOS?", "CozyOS inatofautianaje?", "Lugha
            // zipi zinazoungwa mkono?").
            "nitumie", "tumie", "faida", "inatofautianaje", "tofauti", "tofautiana",
            "lugha", "zinazoungwa", "mkono", "zinazotumika", "zipi", "gani",
            // REGISTRATION/AUTH milestone — markers for the new
            // registration-phrasing Swahili trigger phrases above.
            // "usajili" closes a real gap: this heuristic matches
            // whole words only (not substrings), so "usajili" (as in
            // "Ninaanzaje usajili wa CozyOS?") needs its own entry —
            // it is not covered by the existing "sajili"/"kusajili"/
            // "kujisajili" entries. "kutengeneza"/"tengeneza"/
            // "kuunda"/"unda"/"nifanye"/"ninaanzaje" are added for the
            // same reason, to genuinely detect the new phrasings
            // rather than relying on "akaunti" alone happening to be
            // present.
            "usajili", "kutengeneza", "tengeneza", "kuunda", "unda", "nifanye", "ninaanzaje"
        ]);
        const words = text.toLowerCase().match(/[a-zà-ÿ]+/g) || [];
        if (words.length === 0) return null;
        const hits = words.filter((w) => SW_MARKERS.has(w)).length;
        return hits > 0 ? "sw" : null;
    }

    /**
     * resolveLanguage(options)
     *   Defensive wrapper around CozyLanguageRegistry.resolveLanguage()
     *   (RP-027). If that module hasn't loaded on this page, degrades
     *   honestly to English — never throws, never invents a language
     *   state. This is the ONLY place language is resolved; composeReply()
     *   always receives an already-resolved, AVAILABLE code.
     *
     *   RP-036: precedence stays exactly what RP-027 already
     *   documented — manual (explicit, persistent user setting) >
     *   requested > country-suggested > English. The one addition is
     *   that "requested" now also accepts a real, heuristically
     *   detected language for THIS message (options.detectedLanguage)
     *   as a fallback, ONLY when the caller supplied neither an
     *   explicit manual setting nor an explicit per-call requested
     *   language — so an explicit preference always still wins, and
     *   detection is never allowed to override it.
     */
    function resolveLanguage(options) {
        const registry = window.CozyOS && window.CozyOS.CozyLanguageRegistry;
        const requested = (options && options.requestedLanguage) || (options && options.detectedLanguage) || undefined;
        if (registry && typeof registry.resolveLanguage === "function") {
            const resolved = safeCall(() => registry.resolveLanguage({
                manual: options && options.language,
                requested,
                country: options && options.country
            }));
            if (resolved && resolved.code) return resolved;
        }
        return { code: "en", preferred: (options && options.language) || requested || "en", fallback: false, reason: null };
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
        // RP-036 navigation intents — same "never blank" discipline,
        // kept here so a page missing cozy-language-templates.js still
        // gets a real English confirmation instead of an empty reply.
        "nav-dashboard": "Opening the dashboard for you.",
        "nav-notifications": "Opening notifications for you.",
        "nav-recent": "Here's your recent activity.",
        "nav-search": "Opening search for you.",
        "nav-aiproviders": "Opening AI Providers for you.",
        "nav-diagnostics": "Opening the Diagnostics Center for you.",
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
        "project-history:not_found": "CozyOS's project history hasn't been published yet, so I don't have an authoritative account of it.",
        // COZYAI-PUBLIC-VISION-KNOWLEDGE — same "never blank" discipline
        // for a page that loaded cozy-knowledge-registry.js and
        // cozy-public-knowledge-source.js but not cozy-language-
        // templates.js.
        "why-use-cozyos:not_found": "I don't have a verified answer yet for why someone might want to use CozyOS.",
        "differentiation:not_found": "I don't have a verified answer yet for how CozyOS differs from other options.",
        "language-support-list:not_found": "I don't have a verified answer yet for CozyOS's language support."
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
                const fact = knowledge && typeof knowledge.getFounderFact === "function" ? safeCall(() => knowledge.getFounderFact(lang)) : null;
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
            // ── COZYAI-PUBLIC-VISION-KNOWLEDGE ─────────────────────
            // Synchronous, same pattern as founder/list-apps/
            // list-providers below (CozyPublicKnowledge's facts have
            // no async dependency, unlike the five FounderStory
            // project-knowledge cases above). Evidence absence never
            // becomes a positive claim — an honest ":not_found"
            // template is returned instead, per the Fact Safety Rule.
            case "why-use-cozyos": {
                const fact = knowledge && typeof knowledge.getWhyUseCozyOSFact === "function" ? safeCall(() => knowledge.getWhyUseCozyOSFact()) : null;
                if (fact && fact.evidence === "VERIFIED") {
                    const frame = template("why-use-cozyos:verified", lang);
                    if (typeof frame === "function") return frame(fact.answer);
                }
                return template("why-use-cozyos:not_found", lang);
            }
            case "differentiation": {
                const fact = knowledge && typeof knowledge.getDifferentiationFact === "function" ? safeCall(() => knowledge.getDifferentiationFact()) : null;
                if (fact && fact.evidence === "VERIFIED") {
                    const frame = template("differentiation:verified", lang);
                    if (typeof frame === "function") return frame(fact.answer);
                }
                return template("differentiation:not_found", lang);
            }
            case "language-support-list": {
                const fact = knowledge && typeof knowledge.getLanguageSupportListFact === "function" ? safeCall(() => knowledge.getLanguageSupportListFact()) : null;
                if (fact && fact.evidence === "PARTIALLY_VERIFIED" && Array.isArray(fact.targetLanguages) && fact.targetLanguages.length > 0) {
                    const frame = template("language-support-list:verified", lang);
                    if (typeof frame === "function") return frame(fact);
                }
                return template("language-support-list:not_found", lang);
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
            case "how-to-register": {
                // REGISTRATION/AUTH milestone — now evidence-backed via
                // getRegistrationFlowFact() (real, committed, directly-
                // audited registration source code) rather than a fixed
                // static template. Same fail-closed shape as list-apps/
                // list-providers above: VERIFIED fact -> dynamic frame;
                // anything else -> an honest :not_found reply, never a
                // guessed set of steps.
                const fact = knowledge && typeof knowledge.getRegistrationFlowFact === "function" ? safeCall(() => knowledge.getRegistrationFlowFact()) : null;
                if (fact && fact.evidence === "VERIFIED" && Array.isArray(fact.steps) && fact.steps.length > 0) {
                    const frame = template("how-to-register:verified", lang);
                    if (typeof frame === "function") return frame(fact);
                }
                return template("how-to-register:not_found", lang);
            }
            case "what-is-cozyos-enterprise":
            case "what-is-cozyos":
            case "how-authentication-works":
            case "phone-verification":
            case "account-status":
            case "what-is-provider":
            case "provider-not-ready":
            case "control-center":
            // RP-036 — navigation intents. Same direct template lookup
            // as every other fixed-text intent; the actual navigation
            // side effect (clicking the real [data-center] link, etc.)
            // is performed by the DOM-owning caller
            // (cozy-living-assistant.js's #send()), never by this
            // pure/DOM-free file.
            case "nav-dashboard":
            case "nav-notifications":
            case "nav-recent":
            case "nav-search":
            case "nav-aiproviders":
            case "nav-diagnostics":
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
            // substituting language. RP-036: also passes a real,
            // heuristically detected language for this message
            // (detectLanguageHeuristic()) so typed Kiswahili is
            // recognized and answered in Kiswahili automatically, even
            // when the caller passed no explicit language option at
            // all — see resolveLanguage()'s own doc comment for the
            // precedence rule this never overrides.
            const resolvedLanguage = resolveLanguage({ ...options, detectedLanguage: detectLanguageHeuristic(text) });
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
                // RP-036: dedupe — a handful of intents (e.g.
                // nav-dashboard) now have two rules (English + Kiswahili
                // phrasing) sharing one id, which is intentional (see
                // INTENT_RULES comments above), but describe() should
                // still report each real intent once.
                supportedIntents: Array.from(new Set(INTENT_RULES.map((r) => r.id).concat(["unsupported"]))),
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
        description: "RP-026 + RP-027 + COZYAI-PUBLIC-VISION-KNOWLEDGE + REGISTRATION/AUTH — real rule-based conversational Reply Composer. Classifies raw input text against a disclosed intent set: RP-026's original 7 (greeting-morning/afternoon/evening/generic, thanks, identity, help) plus RP-027's CozyOS-identity (founder, what-is-cozyos, what-is-cozyos-enterprise), applications (list-apps), registration (how-to-register), authentication (how-authentication-works, phone-verification), account (account-status), providers (what-is-provider, list-providers, provider-not-ready), architecture (control-center), public-vision (why-use-cozyos, differentiation, language-support-list) intents — and composes an honest, verified-template .text reply for each in a resolved language (English, Kiswahili, French, Arabic, or Somali — RP-027's 5 default languages), including an equally honest 'no rule-based answer yet' reply for unsupported input. Evidence-backed intents (founder/list-apps/list-providers/why-use-cozyos/differentiation/language-support-list/how-to-register) read live repository/runtime state or committed, owner-approved/audited source content via CozyKnowledge and only ever state VERIFIED/PARTIALLY_VERIFIED facts, never inventing an answer when evidence is absent. The three public-vision intents compose only cozy-public-knowledge-source.js (owner-approved vision-policy doc) — never the private founder-story-seed.js. registration (how-to-register), as of the REGISTRATION/AUTH milestone, composes getRegistrationFlowFact() — real, committed, directly-audited registration source code (identity-engine.js register(), cozy-login-gate.js's registration form) — with a genuine, committed Kiswahili translation (Kiswahili-first per this milestone's requirement) alongside English; falls back to an honest :not_found reply, never a guessed step list, if that evidence is ever unavailable. Calls CognitiveCoordinator.run() first (same entry point reasoningPipelineProvider already uses) so Memory/Policy/Interpretation/Thinking/Reasoning/Intelligence still genuinely execute; a missing/failing coordinator never blocks this provider's own reply. Registers into LivingAI's existing 'rule-based-conversational' provider slot and (optionally) ProviderManager for visibility/health, then explicitly activates itself via the existing LivingAI.setActiveProvider() choke point as one disclosed, separate step — never a side effect of registration. Never claims LLM/neural/machine-learning capability, never performs a live/uncontrolled translation call."
    });
})();
