/**
 * CozyOS — Living Floating Assistant
 * File Reference: core/living/cozy-living-assistant.js
 * Layer: Living Ecosystem — Composed Living Component
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 364.7.1
 *
 * ═══════════════════════════════════════════════════════════════════════
 * CLASSIFICATION: COMPOSED LIVING COMPONENT (per Gate 1/2 verification —
 * see M364.7.1 Phase 1 reports). This is NOT a new subsystem, NOT a new
 * application, NOT a new AI. Every layer below composes a real, existing
 * CozyOS engine confirmed present before this file was written:
 * ═══════════════════════════════════════════════════════════════════════
 *   - window.CozyOS.LivingAI — real state machine (idle/thinking/
 *     speaking) + think(text, options), already loaded in dashboard.html,
 *     previously unconsumed by any UI. This file is that UI.
 *   - core/living/cozy-living.css — .cozy-living-btn, .cozy-living-panel
 *     (+ .cozy-bloom), .cozy-living-glass, .cozy-living-border-glow,
 *     .cozy-living-input, .cozy-living-card — all real, all reused
 *     verbatim. Only two genuinely new, narrow CSS additions were made
 *     to that same file: fixed-position host rules for the button/panel
 *     (nothing in the Living CSS library previously positioned anything
 *     as a floating corner element) and a user/assistant message-color
 *     distinction — disclosed in that file's own changelog comment.
 *   - window.CozyOS.CozySpeech / VoiceManager — real voice output,
 *     composed exactly the same way Founder Story's narration engine
 *     already does (M361 Stage 3): VoiceManager.speak({text}).
 *   - window.CozyOS.SpeechRecognitionAdapter — real mic input.
 *   - window.CozyOS.PlatformEventBus — real, existing bus. This file
 *     adds no new bus and no polling; it listens for exactly one real,
 *     newly-emitted WorkspaceShell event (see below).
 *   - window.CozyOS.WorkspaceShell — its own real, generic on()/emit()
 *     (delegating to PlatformEventBus) already existed; the ONE genuine
 *     extension made this milestone is a single `this.emit("center:changed",
 *     {center})` call added at WorkspaceShell's existing section-switch
 *     site (core/shell/cozy-workspace.js) — no new event system, one new
 *     event name on an existing, real emitter.
 *   - #renderList()-equivalent: this file's own #renderMessage() mirrors
 *     the same real row/card rendering convention cozy-workspace.js's
 *     Notification Center already uses (.cozy-event-row/.cozy-living-card),
 *     not a new rendering framework.
 *
 * MOUNTING (Workspace persistence — composed, not new)
 *   Mounted once, as a direct child of <body>, sibling to
 *   #cozy-workspace-root and the Living Background canvas — the exact
 *   same structural pattern already confirmed (M364.7 Phase 1) to keep
 *   the Living Background untouched by WorkspaceShell's own re-renders.
 *   Conversation state lives in this file's own module scope, entirely
 *   outside #cozy-workspace-root, so it is never reset by navigation.
 *
 * HONEST, DISCLOSED SCOPE
 *   - LivingAI's "think" is a real, honestly-disclosed rule-based
 *     reasoning pipeline (not an LLM) — this file does not change or
 *     upgrade that; it only gives it a real UI for the first time.
 *   - Voice output/input depend on the same real, browser-dependent
 *     engines already disclosed elsewhere in this codebase (Web Speech
 *     API availability varies by browser) — no new capability claimed.
 *   - Only ever appears after a real, successful login (mounted from
 *     dashboard.html only, never index.html/login.html) — never shown
 *     during the startup/login sequence, per explicit scope.
 *
 * RP-024 — HONEST CONVERSATIONAL-REPLY SELECTION (this pass)
 *   P-023 fixed the *path* (reading result.result.intelligence.insights
 *   instead of the wrong nesting) but that path led to
 *   living-composition-adapter's evidence/diagnostic summary (see
 *   core/modules/intelligence/cozy-intelligence-provider.js), which was
 *   never meant to be a conversational answer - it honestly describes
 *   the evidence CozyIntelligence.analyse() received (source count,
 *   character totals, isReal flags for upstream stages), not a reply to
 *   what the user said. CognitiveCoordinator.run() (confirmed by reading
 *   its actual return shape before this change) has no genuine
 *   conversational-answer field anywhere in its result - only
 *   {interpretation, thinking, reasoning, intelligence, recalledMemories,
 *   policyResult, diagnostics}. So this pass stops reading
 *   intelligence.insights entirely and instead ONLY renders a reply when
 *   a genuine conversational field (.text/.reply/.answer) is present on
 *   the pipeline's result. No such field exists anywhere in this
 *   codebase today (confirmed by search before writing this) - so this
 *   change honestly falls back to NO_CONVERSATIONAL_ENGINE_FALLBACK
 *   below for every message, rather than inventing a rule-based
 *   conversational engine that doesn't exist. resolveConversationalReply()
 *   is a pure, DOM-free function (module scope, outside the IIFE below)
 *   specifically so it can be required and regression-tested directly in
 *   Node without stubbing window/document - see
 *   core/living/tests/cozy-living-assistant-reply.test.js.
 *
 * CHECKPOINT K — WIRING THE VERIFIED CHAIN INTO THIS UI (this pass)
 *   RP-024 (above) proved WHERE the reply-formatting bug lived; it
 *   deliberately stopped short of building a real conversational
 *   engine, since none existed on any page this file loads from. One
 *   now does: CozyAI.getContext() -> CozyIdentityFAQRouter ->
 *   CozyAnswerEngine -> CozyAdvisor (Checkpoints F-J), proven real by
 *   core/modules/intelligence/advisor/tests/
 *   cozy-runtime-wiring-audit.test.js, but as of Checkpoint J only
 *   <script>-included on admin-workspace.html and never called by any
 *   UI. This milestone (1) adds the same script tags, in the same
 *   proven dependency order, to index.html and dashboard.html, and (2)
 *   changes #send() below to compose that chain as the real reply
 *   source, via the new pure renderAdvisorReply(advice) function.
 *   CognitiveCoordinator/LivingAI are NOT replaced — they own a
 *   different pipeline (sensing/interpretation/thinking/reasoning/
 *   intelligence/memory/policy diagnostics, per that file's own
 *   getIntegrationManifest()), never conversational answers, and
 *   #send() still calls ai.think() for its real, unchanged state/
 *   sound/diagnostic side effects. The old #matchDeveloperIdentityTopic()
 *   shortcut is removed: CozyIdentityFAQRouter, now reachable, already
 *   covers the same founder/vision/origin questions with real evidence
 *   tagging, so the narrower duplicate would only have kept the
 *   verified chain unreachable for exactly the questions it exists to
 *   answer. actorId is resolved for real (#resolveActorId(), never
 *   "system") so CozyMemory's existing owner/visibility enforcement is
 *   inherited unchanged — this file adds no second permission check.
 */

/**
 * resolveConversationalReply(container)
 *   Pure - given the object that would hold a genuine conversational
 *   answer (LivingAI.think()'s result.result, or
 *   CognitiveCoordinator.runFromImage()'s result), returns the first
 *   non-empty string found among .text / .reply / .answer - the only
 *   fields this codebase treats as a real conversational answer.
 *   Deliberately never reads .intelligence, .insights, .thinking,
 *   .interpretation, .reasoning, .diagnostics, .isReal, or any other
 *   pipeline-internal field: those are evidence/diagnostic data, not an
 *   answer to the user (RP-024). Returns null - never a fabricated
 *   string - when no genuine field is present; callers must render the
 *   honest fallback in that case.
 */
function resolveConversationalReply(container) {
    if (!container || typeof container !== "object") return null;
    const candidates = [container.text, container.reply, container.answer];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim().length > 0) return candidate;
    }
    return null;
}

/** The one honest, static fallback string used whenever no genuine conversational field is present. Never dynamic, never built from pipeline internals. */
const NO_CONVERSATIONAL_ENGINE_FALLBACK = "I heard you, but CozyOS's real conversational response engine isn't connected or available yet - so I don't have a genuine answer to give you right now.";

function isNonEmptyReplyText(v) { return typeof v === "string" && v.trim().length > 0; }

/**
 * renderAdvisorReply(advice)
 *   CHECKPOINT K — pure. `advice` is the real, unmodified return value
 *   of window.CozyOS.CozyAdvisor.advise({question, answerResult}) (see
 *   core/modules/intelligence/advisor/cozy-advisor.js's own documented
 *   OUTPUT SHAPE). Never fabricates text of its own — every string
 *   returned here already exists verbatim on `advice` itself:
 *     ADVICE                  -> advice.advice
 *     ENCOURAGEMENT           -> advice.encouragement
 *     ADVICE_AND_ENCOURAGEMENT-> both, joined
 *     everything else (UNKNOWN_REQUEST / INSUFFICIENT_EVIDENCE, or a
 *     malformed/absent advice) -> advice.advice, which CozyAdvisor
 *     itself already sets to the underlying CozyAnswerEngine answer
 *     (or an honest insufficient-evidence message) for exactly these
 *     cases — this function never re-derives or guesses at that text.
 *   Returns null (never a fabricated string) when advice is absent/
 *   malformed or genuinely has nothing on it — callers must fall back
 *   to the honest side-effect-pipeline path in that case, same as
 *   resolveConversationalReply()'s own contract.
 */
function renderAdvisorReply(advice) {
    if (!advice || typeof advice !== "object") return null;
    if (advice.responseMode === "ADVICE_AND_ENCOURAGEMENT") {
        const parts = [advice.encouragement, advice.advice].filter(isNonEmptyReplyText);
        return parts.length > 0 ? parts.join(" ") : null;
    }
    if (advice.responseMode === "ENCOURAGEMENT") {
        return isNonEmptyReplyText(advice.encouragement) ? advice.encouragement : null;
    }
    // ADVICE, UNKNOWN_REQUEST, INSUFFICIENT_EVIDENCE, and any other
    // real responseMode CozyAdvisor may return all carry their real
    // text on .advice (CozyAdvisor's own pass-through/insufficient-
    // evidence discipline — never re-implemented here).
    return isNonEmptyReplyText(advice.advice) ? advice.advice : null;
}

// Node-safe export for regression testing (RP-024 + CHECKPOINT K). A
// classic <script> in the browser never defines `module`, so this is a
// no-op there - the rest of this file's browser behavior is completely
// unchanged. This lets core/living/tests/cozy-living-assistant-reply.
// test.js (and this milestone's new test) require() the real,
// unmodified functions directly, instead of duplicating their logic
// into a test (which would test a copy, not the real code).
/**
 * shouldLaunchApplication(result)
 *   Domain 4I dependency #3 — the EXACT, sole gate #send() uses before
 *   ever calling window.CozyOS.ApplicationLauncher.open(). Extracted as
 *   a small, real, pure function (same testability precedent as
 *   renderAdvisorReply()/isNonEmptyReplyText() above) so this decisive
 *   security boundary can be verified directly against real
 *   rule-based-conversational-provider.js output, without needing a
 *   browser. Returns the applicationId to launch, or null — never a
 *   truthy value for AUTHORIZATION_DENIED, AUTHORIZATION_REQUIRED, or
 *   an unresolved application.
 */
function shouldLaunchApplication(result) {
    if (!result || !result.success || !result.result) return null;
    const r = result.result;
    if (r.intent !== "app-launch") return null;
    if (r.authorizationState !== "AUTHORIZATION_GRANTED") return null;
    if (!r.application || !r.application.id) return null;
    return r.application.id;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { resolveConversationalReply, NO_CONVERSATIONAL_ENGINE_FALLBACK, renderAdvisorReply, isNonEmptyReplyText, shouldLaunchApplication };
}

// The rest of this file mounts a real, live UI component and touches
// window/document throughout - it only ever runs in a browser. Guarding
// it this way lets the pure function above be require()'d in Node (for
// the regression test) without the DOM-mounting code below throwing on
// a missing `window`/`document`. In every real browser load this
// condition is always true, so behavior is unchanged there.
if (typeof window !== "undefined" && typeof document !== "undefined") {
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.5"; // CHECKPOINT K: #send() now composes the verified CozyAI.getContext() -> CozyAnswerEngine -> CozyAdvisor chain as its real conversational-answer source (real actorId via #resolveActorId(), never "system"), replacing the narrower #matchDeveloperIdentityTopic() shortcut it supersedes. LivingAI.think()'s real state/sounds/diagnostics side effects are unchanged; its own reply-derivation path is kept only as an honest fallback for environments where the verified chain isn't loaded.
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    // P-023 (prior pass): fixed #send()'s reply-formatting path - it was
    // reading result.result.insights, but CognitiveCoordinator.run()
    // nests the real intelligence output at result.result.intelligence.
    // insights. That path fix was real, but what it led to
    // (living-composition-adapter's evidence-summary text) was never a
    // conversational answer - see the RP-024 note above this IIFE and
    // resolveConversationalReply()'s doc comment. Also added a real
    // image-attach button (#wireImageInput()/#sendImage()) composing the
    // existing, unmodified CognitiveCoordinator.runFromImage()/
    // window.CozyOS.OCR - that pipeline already existed but had no UI
    // able to reach it. Honestly disables itself if OCR reports no real
    // backend loaded, never fakes availability.
    if (window.CozyOS.Modules["cozy-living-assistant"] && window.CozyOS.Modules["cozy-living-assistant"].version) return;

    const MAX_BIND_ATTEMPTS = 40;
    const BIND_RETRY_MS = 250;

    /**
     * NAV_INTENT_ACTIONS — RP-036
     *   Maps the rule-based-conversational-provider's own new
     *   navigation intent ids (nav-dashboard/notifications/recent/
     *   search/aiproviders/diagnostics — see that file's INTENT_RULES)
     *   onto the exact same action strings #runQuickAction() already
     *   handles for the quick-action buttons. This is the ONLY new
     *   code here: it reuses #runQuickAction() unmodified rather than
     *   duplicating its real [data-center] click / WorkspaceShell
     *   search / getNotificationFeed logic a second time. Typed text
     *   that classifies as one of these intents now actually performs
     *   the action, in addition to the rule-based composer's own
     *   confirmation text — previously, typed text could only ever
     *   produce a reply, never an action; only the quick-action
     *   buttons could act.
     */
    const NAV_INTENT_ACTIONS = Object.freeze({
        "nav-dashboard": "goto-dashboard",
        "nav-notifications": "notifications",
        "nav-recent": "recent",
        "nav-search": "search",
        "nav-aiproviders": "goto-aiProviders",
        "nav-diagnostics": "goto-diagnostics"
    });

    class LivingAssistant {
        #messages = [];      // { role: "user"|"assistant", text, timestamp }
        #expanded = false;
        #currentSection = "dashboard";
        // Kiswahili Capability Dependency #2 — the smallest possible
        // state representing the current conversational language
        // identity (not a locale, not an authorization signal). Holds
        // the plain CozyOS language code ("sw", "en", ...) exactly as
        // CozyLanguageRegistry/rule-based-conversational-provider.js
        // already produce it - never a BCP-47 tag itself (that
        // resolution stays owned entirely by the already-verified
        // SpeechLanguageAdapter, Dependency #1). null until a real
        // conversational turn has actually resolved one - never
        // guessed, never defaulted to Kiswahili.
        #currentLanguage = null;
        #conversationId = null; // M366.3 - lazily created once per session via #getOrCreateConversationId(), reused thereafter
        // UNIVERSAL QUESTION UNDERSTANDING REPAIR — real, confirmed gap:
        // rule-based-conversational-provider.js's own think() already
        // computes and RETURNS a real cross-turn entity/intent tracker
        // (result.result.conversationState — lastDiscussedApplication,
        // lastIntent, lastApplication, lastLanguage; see that file's own
        // extensive RP-037/M363 comments) specifically so a pronoun
        // follow-up ("Why is it important?", "Who benefits from it?")
        // can resolve against whatever entity (a named application, OR
        // — since this repair — CozyOS the platform itself) the
        // PREVIOUS real turn discussed. Before this fix, #send() below
        // never read this field back in on the NEXT call, so every
        // single turn was answered as if it were the first message of
        // the conversation — the entire cross-turn resolution mechanism
        // existed, was unit-tested, and was completely disconnected
        // from this, the one live, user-facing conversational window.
        // Holds the real, previously-RETURNED conversationState object
        // verbatim (never invented here) - null until a first real turn
        // has produced one.
        #conversationState = null;
        // Phase 2: CozyAI + Live Window Business-Data Q&A — a SEPARATE
        // private field (never merged into #conversationState above,
        // which the rule-based-conversational-provider.js wholesale-
        // replaces every turn via ai.think()'s own returned object) so a
        // bare business-data follow-up ("And yesterday?") can carry
        // forward the real {lastBusinessMetric, lastBusinessTimeRange,
        // lastBusinessTableId} CozyBusinessDataIntent itself returned on
        // the previous turn (see cozy-ai.js's own comment) without
        // depending on that unrelated provider preserving fields it
        // doesn't own. Page-lifetime only, never persisted, never a
        // second CozyMemory — same discipline as #currentLanguage below.
        #businessConversationState = null;
        // Phase 3: Teach Cozy / Governed Learning — SAME pattern as
        // #businessConversationState immediately above: a separate
        // private field carrying CozyTeachFlow's own real, previously-
        // returned { pendingCandidateId, pendingClaim, pendingLanguage }
        // so a pending yes/no teaching-confirmation exchange survives to
        // the next turn without depending on the unrelated rule-based
        // provider's own #conversationState. Page-lifetime only, never
        // persisted here (CozyLearn's own candidate persistence, via
        // CozyMemory, is the real durable store — see cozy-learn.js).
        #teachConversationState = null;
        #root = null;
        #windowHandle = null; // M366.7 - the real WindowManager handle for the panel, once opened
        #panel = null;
        #button = null;
        #messagesEl = null;
        #stateUnsubscribe = null;
        #recognitionWired = false;

        mount() {
            if (this.#root) return; // already mounted - never recreated
            this.#root = document.createElement("div");
            this.#root.id = "cozy-living-assistant-root";
            this.#root.innerHTML = `
                <button type="button" id="cozy-living-assistant-btn"
                    class="cozy-living-btn cozy-btn-breathing cozy-living-border-glow cozy-living-assistant-btn"
                    aria-label="Open CozyOS Assistant" aria-expanded="false" title="CozyOS Assistant">🟢</button>
            `;
            document.body.appendChild(this.#root);
            this.#button = this.#root.querySelector("#cozy-living-assistant-btn");

            // M366.7 — the panel is built separately and only registered
            // with the real Window Manager the first time it's opened,
            // not eagerly at mount - matching the same lazy-create
            // pattern already proven safe elsewhere in this codebase.
            // The floating button itself remains a simple, small, fixed
            // launcher icon (the same real role a taskbar/dock icon
            // plays) - it is not itself a managed window.
            this.#panel = document.createElement("div");
            this.#panel.id = "cozy-living-assistant-panel";
            this.#panel.className = "cozy-living-assistant-panel";
            this.#panel.innerHTML = `
                <span id="cozy-living-assistant-status" class="cozy-living-assistant-status" aria-live="polite"></span>
                <div id="cozy-living-assistant-quick-actions" class="cozy-living-assistant-quick-actions"></div>
                <div id="cozy-living-assistant-messages" class="cozy-living-assistant-messages" role="log" aria-live="polite"></div>
                <form id="cozy-living-assistant-form" class="cozy-living-assistant-form">
                    <button type="button" id="cozy-living-assistant-mic" aria-label="Voice input" title="Speak">🎙️</button>
                    <button type="button" id="cozy-living-assistant-image" aria-label="Attach an image" title="Attach an image (OCR)">📷</button>
                    <input type="file" id="cozy-living-assistant-image-input" accept="image/*" style="display:none;">
                    <input type="text" id="cozy-living-assistant-input" class="cozy-living-input" placeholder="Ask CozyOS..." autocomplete="off">
                    <button type="submit" id="cozy-living-assistant-send" aria-label="Send">➤</button>
                </form>
            `;
            this.#messagesEl = this.#panel.querySelector("#cozy-living-assistant-messages");

            this.#wireButton();
            this.#wireForm();
            this.#wireVoiceInput();
            this.#wireImageInput();
            this.#wireLivingAIState();
            this.#bindWorkspaceContext();
            this.#renderQuickActions();
            this.#seedWelcomeMessage();
        }

        #wireButton() {
            this.#button.addEventListener("click", () => this.toggle());
        }

        toggle() { this.#expanded ? this.close() : this.open(); }
        open() {
            this.#expanded = true;
            this.#button.setAttribute("aria-expanded", "true");
            const wm = window.CozyOS.WindowManager;
            if (wm && typeof wm.create === "function") {
                // Real, idempotent: create() itself already focuses and
                // returns the existing handle if this id is already open
                // - no duplicate registration on repeated toggles.
                this.#windowHandle = wm.create({
                    id: "cozy-assistant", title: "CozyOS Assistant", element: this.#panel,
                    icon: "🟢", draggable: true, resizable: true, minimizable: true, maximizable: true, closable: true,
                    onClose: () => { this.#expanded = false; this.#button.setAttribute("aria-expanded", "false"); this.#windowHandle = null; }
                });
            } else {
                // Honest fallback only if the real Window Manager somehow
                // isn't loaded - a plain, non-floating mount, never a
                // second window-management system.
                if (!this.#panel.isConnected) document.body.appendChild(this.#panel);
                this.#panel.hidden = false;
            }
            const input = this.#panel.querySelector("#cozy-living-assistant-input");
            if (input) input.focus();
        }
        close() {
            this.#expanded = false;
            this.#button.setAttribute("aria-expanded", "false");
            if (this.#windowHandle) this.#windowHandle.close();
            else this.#panel.hidden = true;
        }

        /**
         * enterTeachingMode() — PHASE 3: Teach Cozy / Governed Learning.
         *   The real Profile "Teach Cozy" entry point calls this (see
         *   user-dashboard.js's #renderProfileSurface()). It does exactly
         *   two things, both already real and existing: (1) this.open() —
         *   the SAME open() above every other entry point into this Live
         *   Window already uses, never a second chat surface/window; (2)
         *   seeds a real disclosure message via #addMessage(), the SAME
         *   mechanism #seedWelcomeMessage() already uses. It sets no new
         *   mode flag anywhere in the answer chain — the teaching flow
         *   below is driven entirely by the user's own next message
         *   actually containing an explicit teaching statement (see
         *   cozy-teach-intent.js's own header on why explicit-marker-only
         *   detection is used) or a reply to a pending confirmation. This
         *   banner exists purely so the user knows what phrasing to use;
         *   removing it would not change what CozyAI does or does not
         *   learn.
         */
        enterTeachingMode() {
            this.open();
            const language = this.#currentLanguage === "sw" ? "sw" : "en";
            const banner = language === "sw"
                ? "Uko kwenye hali ya kufundisha. Niambie jambo unalotaka nikumbuke (mfano: \"Nataka kukufundisha kwamba...\"), na nitakuuliza uthibitishe kabla sijalikumbuka."
                : "You're in teaching mode. Tell me something you'd like me to remember (e.g. \"I want to teach you that...\"), and I'll ask you to confirm before I remember it.";
            this.#addMessage("assistant", banner);
        }

        /**
         * #renderQuickActions() — real quick actions, composing only
         * existing services. No new feed, search index, help system, or
         * navigation mechanism is created:
         *   - Search / Notifications / Recent Activity all compose
         *     WorkspaceShell's real, existing search()/getNotificationFeed()
         *     (the same real data Enterprise Search / Notification Center
         *     already use — "recent activity" reuses the identical feed,
         *     not a second one, since no separate activity feed exists).
         *   - Help composes the assistant's own real #send() → LivingAI.think()
         *     pipeline — not a fabricated docs/help content system (none
         *     exists in this repository, confirmed before writing this).
         *   - Workspace shortcuts dispatch a real click() on the existing,
         *     already-rendered [data-center] nav elements — the exact same
         *     mechanism a person clicking the sidebar already uses, never
         *     a second navigation path.
         */
        #renderQuickActions() {
            const host = this.#panel.querySelector("#cozy-living-assistant-quick-actions");
            if (!host) return;
            host.innerHTML = `
                <button type="button" data-quick="search" class="cozy-living-assistant-qa">🔎 Search</button>
                <button type="button" data-quick="notifications" class="cozy-living-assistant-qa">🔔 Notifications</button>
                <button type="button" data-quick="recent" class="cozy-living-assistant-qa">🕘 Recent</button>
                <button type="button" data-quick="help" class="cozy-living-assistant-qa">❓ Help</button>
                <button type="button" data-quick="goto-dashboard" class="cozy-living-assistant-qa">⌂ Dashboard</button>
            `;
            host.addEventListener("click", (evt) => {
                const btn = evt.target.closest("[data-quick]");
                if (!btn) return;
                this.#runQuickAction(btn.getAttribute("data-quick"));
            });
        }

        #runQuickAction(action) {
            const shell = window.CozyOS && window.CozyOS.WorkspaceShell;
            if (action === "search") {
                const term = window.prompt("Search CozyOS:");
                if (!term) return;
                if (!shell || typeof shell.search !== "function") { this.#addMessage("assistant", "Search is not available right now."); return; }
                const { results } = shell.search(term);
                if (!results.length) { this.#addMessage("assistant", `No results for "${term}".`); return; }
                this.#addMessage("assistant", `Found ${results.length} result(s) for "${term}": ${results.slice(0, 5).map(r => r.label).join(", ")}`);
                return;
            }
            if (action === "notifications" || action === "recent") {
                if (!shell || typeof shell.getNotificationFeed !== "function") { this.#addMessage("assistant", "Notifications are not available right now."); return; }
                const feed = shell.getNotificationFeed(5);
                if (!feed.length) { this.#addMessage("assistant", "Nothing to show yet — no real events have been logged."); return; }
                const label = action === "recent" ? "Recent activity" : "Latest notifications";
                this.#addMessage("assistant", `${label}: ` + feed.map(e => `${e.eventName} (${e.source})`).join("; "));
                return;
            }
            if (action === "help") { this.#send("What can you help me with?"); return; }
            if (action.startsWith("goto-")) {
                const center = action.replace("goto-", "");
                const navLink = document.querySelector(`[data-center="${center}"]`);
                if (navLink && typeof navLink.click === "function") { navLink.click(); this.close(); }
                else this.#addMessage("assistant", `"${center}" isn't available in the current navigation.`);
                return;
            }
        }

        /**
         * #seedWelcomeMessage()
         *   M371/M372 — composes CozyEnvironment.getState() (M370.5)
         *   for a real, environment-aware greeting - no separate hour/
         *   time calculation of its own. M372: also composes a real
         *   username, using the exact same window.CozyOS.Session.
         *   current()/IdentityEngine.getUser() pattern
         *   cozy-workspace.js's own #resolveCurrentUserId() already
         *   uses - genuine personalization, since the Assistant only
         *   mounts post-login (unlike the pre-login screen, where no
         *   such real "who is this" data exists yet - disclosed
         *   separately). Honest fallback to a neutral greeting if
         *   either isn't available.
         */
        #seedWelcomeMessage() {
            const env = window.CozyOS && window.CozyOS.CozyEnvironment;
            const state = env && typeof env.getState === "function" ? env.getState() : null;

            const session = window.CozyOS && window.CozyOS.Session;
            const identity = window.CozyOS && window.CozyOS.IdentityEngine;
            let name = "";
            if (session && typeof session.current === "function") {
                const snap = session.current();
                if (snap && snap.uid && identity && typeof identity.getUser === "function") {
                    const user = identity.getUser(snap.uid);
                    if (user && user.username) name = `, ${user.username}`;
                }
            }

            let greeting = "Hi";
            if (state && state.available) {
                const byPeriod = {
                    morning: `Good morning${name}.`,
                    afternoon: "Good afternoon.",
                    evening: "Good evening.",
                    night: "Good evening. I hope you're having a peaceful night."
                };
                greeting = byPeriod[state.timeOfDay] || `Hi${name}.`;
            } else {
                greeting = `Hi${name}.`;
            }
            this.#addMessage("assistant", `${greeting} I'm the CozyOS Assistant. I can help with what you're currently working on.`);
        }

        /** #addMessage() — mirrors cozy-workspace.js's own real .cozy-event-row/.cozy-living-card row convention (Notification Center), not a new rendering framework. */
        #addMessage(role, text) {
            const entry = { role, text, timestamp: new Date().toISOString() };
            this.#messages.push(entry);
            const row = document.createElement("div");
            row.className = `cozy-living-card cozy-event-row cozy-living-assistant-msg cozy-living-assistant-msg-${role === "user" ? "user" : "assistant"}`;
            row.textContent = text;
            this.#messagesEl.appendChild(row);
            this.#messagesEl.scrollTop = this.#messagesEl.scrollHeight;
        }

        #wireForm() {
            const form = this.#panel.querySelector("#cozy-living-assistant-form");
            const input = this.#panel.querySelector("#cozy-living-assistant-input");
            form.addEventListener("submit", async (evt) => {
                evt.preventDefault();
                const text = input.value.trim();
                if (!text) return;
                input.value = "";
                await this.#send(text);
            });
        }

        /**
         * #getOrCreateConversationId()
         *   M366.3 — real fix: composes the existing, unmodified
         *   CozyConversation.createConversation()/startConversation(),
         *   never a second conversation store. Creates exactly one real
         *   conversation the first time this assistant session sends a
         *   message, then reuses that same real ID for every subsequent
         *   turn - never fabricates an ID, honestly returns null if
         *   CozyConversation isn't loaded (the pipeline already handles
         *   a null/missing conversationId gracefully, unchanged).
         */
        #getOrCreateConversationId() {
            if (this.#conversationId) return this.#conversationId;
            const conversation = window.CozyOS && window.CozyOS.CozyConversation;
            if (!conversation || typeof conversation.createConversation !== "function") return null;
            const created = conversation.createConversation({ type: "custom", participants: ["assistant-session"] });
            if (!created.success) return null;
            if (typeof conversation.startConversation === "function") conversation.startConversation(created.conversationId);
            this.#conversationId = created.conversationId;
            return this.#conversationId;
        }

        /**
         * #resolveActorId()
         *   CHECKPOINT K — real, composes the exact same
         *   Session.current()/IdentityEngine.getUser() pattern
         *   #seedWelcomeMessage() already uses (below). Returns the
         *   real signed-in uid, or null — NEVER "system" and NEVER a
         *   guess — so a question that reaches CozyAI.getContext() ->
         *   CozyMemory carries the caller's real identity (or none),
         *   the same fail-closed contract
         *   cozy-runtime-wiring-audit.test.js already proves for this
         *   chain ("an unidentified caller never defaults to
         *   \"system\"").
         */
        #resolveActorId() {
            const session = window.CozyOS && window.CozyOS.Session;
            if (session && typeof session.current === "function") {
                const snap = session.current();
                if (snap && snap.uid) return snap.uid;
            }
            return null;
        }

        /** #send() — composes LivingAI.think() (real state/sounds/cognitive-diagnostics side effects, unchanged) AND the verified Question -> Context -> Answer -> Advisor chain (CHECKPOINT K, real conversational answer source). Never a second reasoning/answer/advisor engine. */
        async #send(text) {
            this.#addMessage("user", text);
            const actorId = this.#resolveActorId();

            // Real side-effect pipeline — unchanged from before this
            // milestone: LivingAI's state machine (thinking/speaking),
            // LivingSounds, and CognitiveCoordinator's own diagnostics/
            // memory-save (under its own "cognitive-default" namespace,
            // distinct from the project-knowledge namespaces
            // CozyMemory/getContext() below actually search). Its
            // return shape has no genuine conversational-answer field
            // (RP-024) — kept here only for these real, disclosed side
            // effects, never as the reply source anymore.
            const ai = window.CozyOS && window.CozyOS.LivingAI;
            const conversationId = this.#getOrCreateConversationId();
            // Domain 4I dependency #2 (App-Launch Authorization) — the
            // real, resolved actorId is now passed through to
            // ai.think() too (same #resolveActorId() call already used
            // for the verified identity/knowledge chain below), so a
            // rule-based-conversational provider's app-launch intent
            // can call the existing, real
            // IdentityEngine.canAccessApplication(userId, appName) —
            // the exact function cozy-workspace.js itself already uses
            // to decide which applications to show — instead of having
            // no user context to authorize against at all.
            // M363 — considered also feeding this.#currentLanguage
            // forward into ai.think() as a carried-forward language
            // hint, but reverted: the provider's resolveLanguage() has
            // no "soft, only-if-nothing-else-detected" precedence tier
            // lower than per-message detection — passing it as `manual`
            // (the only slot that could carry it) would have made a
            // clearly English follow-up message after one Kiswahili turn
            // incorrectly stay in Kiswahili for the whole conversation
            // (manual outranks this-turn detection). Real per-message
            // detection (detectLanguageHeuristic() below) already runs
            // fresh on every turn — improving via the marker list
            // (below) is the safe fix; forcing continuity across turns
            // is not, without a real "soft preference" precedence tier
            // this file does not have today.
            const result = (ai && typeof ai.think === "function")
                ? await ai.think(text, { context: this.#currentSection, conversationId, actorId: this.#resolveActorId(), conversationState: this.#conversationState })
                : null;

            // UNIVERSAL QUESTION UNDERSTANDING REPAIR — capture the
            // real, freshly-returned conversationState for the NEXT
            // turn's ai.think() call above (see the #conversationState
            // field's own comment). Only ever the provider's own real,
            // returned object - never invented or merged with a guess.
            if (result && result.success && result.result && result.result.conversationState) {
                this.#conversationState = result.result.conversationState;
            }

            // Kiswahili Capability Dependency #2 — reuses this exact,
            // already-existing, already-computed result.result.language
            // (rule-based-conversational-provider.js's own resolved,
            // AVAILABLE language for this turn - the same value used
            // throughout Domains 4B/4D/4C) as the current conversational
            // language signal for voice input below. Not a new
            // detector: this value was already being computed and
            // returned on every real turn, simply not previously read
            // for this purpose. Only updates when a real, successful
            // resolution occurred - an unsuccessful/absent result
            // leaves the prior value (or null) untouched, never
            // guessing or defaulting to Kiswahili.
            if (result && result.success && result.result && result.result.language) {
                this.#currentLanguage = result.result.language;
            }

            // CHECKPOINT K — the real conversational-answer source:
            // the verified chain proven in
            // core/modules/intelligence/advisor/tests/
            // cozy-runtime-wiring-audit.test.js, composed here for the
            // first time by any visible UI. This supersedes the old
            // #matchDeveloperIdentityTopic() shortcut (removed this
            // milestone) — CozyIdentityFAQRouter, composed inside
            // CozyAnswerEngine.answer() below, already covers the same
            // founder/vision/origin questions with real evidence
            // tagging (VERIFIED/sources/intentId), so keeping a
            // narrower, untagged duplicate ahead of it would have kept
            // the verified chain unreachable for exactly the questions
            // this milestone requires it to answer.
            let replyText = null;
            const answerEngine = window.CozyOS && window.CozyOS.CozyAnswerEngine;
            const advisor = window.CozyOS && window.CozyOS.CozyAdvisor;
            let unknownRequestFallbackAnswer = null;
            // UNIVERSAL QUESTION UNDERSTANDING REPAIR — the SAME single
            // entity-context tracker as #conversationState above (never
            // a second/competing one): when the previous real turn left
            // a specific NAMED application under discussion (not the
            // "CozyOS" platform sentinel, not null), pass it through to
            // the verified chain too. Without this, a bare pronoun
            // follow-up with no application name in ITS OWN text (e.g.
            // "Who benefits from it?" right after discussing ShopOS)
            // could still satisfy CozyAnswerEngine/getContext()'s own
            // generic CozyOS-platform benefit/problem/importance routes
            // (see cozy-ai.js's own comment) and answer with GENERIC
            // platform content ahead of the correctly-scoped,
            // ShopOS-specific answer rule-based-conversational-
            // provider.js's own (now correctly context-aware) fallback
            // would have given — the verified chain is tried FIRST, so
            // it must know the same real entity context to defer
            // correctly, not just to guess.
            const contextualEntityName = (this.#conversationState && this.#conversationState.lastDiscussedApplication && this.#conversationState.lastDiscussedApplication !== "CozyOS")
                ? this.#conversationState.lastDiscussedApplication
                : null;
            // LIVE INTEGRATION AUDIT — the SAME real "which live service
            // is currently on screen" signal living-worship-player.js
            // already tracks internally (its own private #serviceId,
            // bound by bindToService() when a real worship service is
            // joined/started), read here via its own disclosed
            // getDiagnosticsReport() rather than a second, competing
            // tracker. null on every turn where no live worship service
            // is currently bound — the exact same honest default as
            // contextualEntityName above.
            const liveWorshipPlayer = window.CozyOS && window.CozyOS.LivingWorshipPlayer;
            const activeLiveSessionId = (liveWorshipPlayer && typeof liveWorshipPlayer.getDiagnosticsReport === "function")
                ? (liveWorshipPlayer.getDiagnosticsReport().serviceId || null)
                : null;
            // SUPPORT INTEGRATION addition — a THIRD, distinct
            // authorization context (see cozy-ai.js's own getContext()
            // header): when a CozyOS platform admin has chosen, via
            // organization-support-panel.js's real "Inspect via Live
            // Window" action on one of their own real, active
            // OrganizationSupport grants, to inspect a specific live
            // session, that choice is read here (core/organization/
            // live-support-context.js — a disclosed hand-off variable
            // only, never a second identity/authorization system) and
            // takes priority over the participant-facing
            // activeLiveSessionId above. getContext() independently,
            // freshly re-verifies the real grant every call regardless
            // of what is read here — a stale/cleared value can only ever
            // cause it to compose LESS, never more.
            const liveSupportContext = window.CozyOS && window.CozyOS.LiveSupportContext && typeof window.CozyOS.LiveSupportContext.get === "function"
                ? window.CozyOS.LiveSupportContext.get() : null;
            const effectiveLiveSessionId = liveSupportContext ? liveSupportContext.liveSessionId : activeLiveSessionId;
            const supportScope = liveSupportContext ? liveSupportContext.supportScope : null;
            if (answerEngine && typeof answerEngine.answer === "function") {
                // LIVE WINDOW APPLICATION SEMANTIC UNDERSTANDING REPAIR —
                // this.#currentLanguage was already refreshed above from
                // THIS turn's real, resolved result.result.language (the
                // SAME rule-based-conversational-provider.js signal
                // Kiswahili Capability Dependency #2 already reuses for
                // voice input) — passed straight through so the verified
                // chain can answer a named-application question in the
                // SAME language the user actually asked in, instead of
                // defaulting to English. No new language detector.
                const answerResult = await answerEngine.answer(text, { actorId, entityHint: contextualEntityName, liveSessionId: effectiveLiveSessionId, supportScope, language: this.#currentLanguage, businessConversationState: this.#businessConversationState, teachConversationState: this.#teachConversationState });
                // Phase 2: CozyAI + Live Window Business-Data Q&A — only
                // update when this turn's real business-data flow
                // actually returned a fresh state (see cozy-ai.js's own
                // comment on when it returns null: a clarification was
                // asked, or the question carried no business-data signal
                // at all) — an unrelated turn must never silently clear
                // an unresolved follow-up context.
                if (answerResult.businessDataConversationState) {
                    this.#businessConversationState = answerResult.businessDataConversationState;
                }
                // Phase 3: Teach Cozy / Governed Learning — same
                // carry-forward discipline as businessDataConversationState
                // immediately above, but this one DOES need to clear on a
                // falsy return (CozyTeachFlow returns null once a pending
                // candidate is confirmed/rejected/trusted — see that
                // file's own comment): an unrelated later turn must never
                // keep re-asking a yes/no question about an already-
                // resolved candidate.
                this.#teachConversationState = answerResult.teachDataConversationState || null;
                if (advisor && typeof advisor.advise === "function") {
                    const advice = advisor.advise({ question: text, answerResult });
                    // Domain 4B (AI Integration discovery): CozyAdvisor's
                    // own "UNKNOWN_REQUEST" responseMode means the
                    // question matched neither an advice- nor
                    // encouragement-framing pattern, so advise() is just
                    // passing answerResult.answer straight through
                    // unmodified (see cozy-advisor.js's own advise()) —
                    // it added no real value here. ADVICE/ENCOURAGEMENT/
                    // ADVICE_AND_ENCOURAGEMENT responses are used exactly
                    // as before this fix, unconditionally, regardless of
                    // evidenceState (unchanged pre-existing behavior — a
                    // genuine encouragement reply must still work even
                    // when the underlying answer isn't VERIFIED). Only in
                    // the plain UNKNOWN_REQUEST + non-VERIFIED case do we
                    // hold this answer back to let the separately-
                    // evidenced rule-based-conversational-provider.js
                    // (below) try first — e.g. "Do you speak Kiswahili?",
                    // which CozyIdentityFAQRouter has no intent for at
                    // all but which composes real, live
                    // CozyLanguageRegistry (RP-027) + CozyKnowledge.
                    // getLanguageSupportListFact() evidence elsewhere.
                    if (advice.responseMode === "UNKNOWN_REQUEST" && answerResult.evidenceState !== "VERIFIED") {
                        unknownRequestFallbackAnswer = isNonEmptyReplyText(answerResult.answer) ? answerResult.answer : null;
                    } else {
                        replyText = renderAdvisorReply(advice);
                    }
                } else if (answerResult.evidenceState === "VERIFIED") {
                    replyText = isNonEmptyReplyText(answerResult.answer) ? answerResult.answer : null;
                } else {
                    unknownRequestFallbackAnswer = isNonEmptyReplyText(answerResult.answer) ? answerResult.answer : null;
                }
            }

            // Honest fallback — reached when the verified identity/
            // knowledge chain genuinely is not loaded in this environment
            // (e.g. CozyAnswerEngine/CozyAdvisor scripts absent), AND when
            // it loaded but produced only a plain, non-advice/
            // encouragement, non-VERIFIED pass-through (see comment
            // above). Never fabricates an answer: falls back to the same
            // RP-024 discipline as before (a genuine .text/.reply/.answer
            // field on the side-effect pipeline's result — which is where
            // rule-based-conversational-provider.js's real, separately-
            // evidenced reply actually surfaces, when it is CozyOS's
            // active LivingAI provider — or CozyAnswerEngine's own honest
            // message, or the static "engine not connected" string).
            if (!isNonEmptyReplyText(replyText)) {
                const ruleBasedReply = (result && result.success) ? resolveConversationalReply(result.result) : null;
                const ruleBasedHasRealAnswer = !!ruleBasedReply && result.result && result.result.intent !== "unsupported";
                // M363 fix — real gap found via a live browser test: a
                // genuinely unmatched, non-English turn (e.g. Kiswahili)
                // was always answered with CozyAnswerEngine's own
                // English-only, hardcoded "I don't have verified
                // information..." fallback (unknownRequestFallbackAnswer),
                // completely bypassing the rule-based provider's own
                // honest, LANGUAGE-AWARE "unsupported"/clarifying reply
                // (M360's Kiswahili "Unamaanisha nini?") that was sitting
                // right there in ruleBasedReply. CozyAnswerEngine has no
                // language concept at all (confirmed by reading it) — it
                // is not being duplicated or modified here; this only
                // changes which of the two EXISTING honest fallbacks
                // cozy-living-assistant.js prefers, and only when the
                // resolved language for this turn is not English, so
                // every existing English-path test/behavior (where
                // CozyAnswerEngine's fallback was already being used) is
                // completely unaffected.
                const resolvedLanguage = result && result.result && result.result.language;
                const preferLocalizedFallback = !ruleBasedHasRealAnswer && !!ruleBasedReply && resolvedLanguage && resolvedLanguage !== "en";
                if (ruleBasedHasRealAnswer) {
                    replyText = ruleBasedReply;
                } else if (preferLocalizedFallback) {
                    replyText = ruleBasedReply;
                } else if (unknownRequestFallbackAnswer) {
                    replyText = unknownRequestFallbackAnswer;
                } else if (!result || !result.success) {
                    replyText = (result && result.reason) || NO_CONVERSATIONAL_ENGINE_FALLBACK;
                } else {
                    replyText = ruleBasedReply || NO_CONVERSATIONAL_ENGINE_FALLBACK;
                }
            }
            this.#addMessage("assistant", replyText);
            this.#speak(replyText);

            // RP-036 — if the classified intent is a real, known
            // navigation action, actually perform it (via the existing,
            // unmodified #runQuickAction()) rather than only describing
            // it. A missing/unrecognized intent is a no-op here, same
            // as before this change. Unchanged this milestone —
            // CognitiveCoordinator.run() still has no top-level
            // .intent field (a real, disclosed, pre-existing gap, not
            // introduced or fixed here — out of this milestone's scope).
            const navAction = result && result.success && result.result && NAV_INTENT_ACTIONS[result.result.intent];
            if (navAction) this.#runQuickAction(navAction);

            // Domain 4I dependency #3 (Authorized Application Launch —
            // Real Navigation) — the ONLY consumer of
            // AUTHORIZATION_GRANTED anywhere in this codebase. Reuses
            // the existing, real, canonical launcher
            // (window.CozyOS.ApplicationLauncher.open(applicationId) —
            // core/shell/application-launcher.js, the exact same
            // mechanism cozy-workspace.js's own app-card click handler
            // already composes, confirmed by reading that call site
            // before writing this). No second launcher, no AI-supplied
            // URL, no DOM selector, no arbitrary navigation: the ONLY
            // value ever passed is application.id, itself only ever
            // populated by resolveApplicationByName() reading the real
            // application registry — never text the AI generated.
            //
            // The gate is exact and non-negotiable: ONLY
            // authorizationState === "AUTHORIZATION_GRANTED" reaches
            // this call. AUTHORIZATION_DENIED, AUTHORIZATION_REQUIRED,
            // and an unresolved application (authorizationState absent)
            // all fall through to a no-op here — the honest reply text
            // computed above is the only thing those cases ever produce.
            const applicationIdToLaunch = shouldLaunchApplication(result);
            if (applicationIdToLaunch) {
                const launcher = window.CozyOS && window.CozyOS.ApplicationLauncher;
                if (launcher && typeof launcher.open === "function") {
                    launcher.open(applicationIdToLaunch).then((launchResult) => {
                        if (!launchResult || !launchResult.success) {
                            // Honest failure surface only — the reply
                            // already sent never claimed execution, so
                            // there is nothing to retract; this is
                            // purely a disclosed diagnostic, matching
                            // cozy-workspace.js's own click-handler
                            // pattern for the same real launcher.
                            console.warn(`[LivingAssistant] ApplicationLauncher.open("${applicationIdToLaunch}") did not succeed:`, launchResult && launchResult.reason);
                        }
                    }).catch((err) => {
                        console.warn(`[LivingAssistant] ApplicationLauncher.open("${applicationIdToLaunch}") threw:`, err && err.message);
                    });
                }
            }
        }

        /** #speak() — composes the real VoiceManager, exactly as Founder Story's narration engine already does (M361 Stage 3). Never a second TTS path. */
        #speak(text) {
            const vm = window.CozyOS && window.CozyOS.VoiceManager;
            // TTS language-propagation dependency (output-side counterpart
            // to Dependency #2's mic wiring) — reuses the exact same
            // #currentLanguage state, never a second detector. When null
            // (no real conversational language resolved yet), this is
            // simply omitted, preserving the existing default behavior
            // exactly as before this change.
            if (vm && typeof vm.speak === "function") { try { vm.speak(this.#currentLanguage ? { text, language: this.#currentLanguage } : { text }); } catch (_err) { /* honest no-op */ } }
        }

        /** #wireVoiceInput() — composes the real SpeechRecognitionAdapter (singleton, per-tab, same real engine already used elsewhere in this codebase). Honestly disables the mic button if unavailable, never fakes listening. */
        #wireVoiceInput() {
            const micBtn = this.#panel.querySelector("#cozy-living-assistant-mic");
            const asr = window.CozyOS && window.CozyOS.SpeechRecognitionAdapter;
            if (!asr || typeof asr.isReal !== "function" || !asr.isReal()) {
                micBtn.disabled = true;
                micBtn.title = "Voice input is not available in this browser.";
                return;
            }
            if (!this.#recognitionWired) {
                this.#recognitionWired = true;
                asr.on("onFinalResult", (payload) => {
                    const input = this.#panel.querySelector("#cozy-living-assistant-input");
                    if (input && payload && payload.transcript) { input.value = payload.transcript; this.#send(payload.transcript); input.value = ""; }
                });
            }
            micBtn.addEventListener("click", () => {
                if (asr.isActive()) { asr.stop(); return; }
                // Kiswahili Capability Dependency #2 — requests
                // recognition in the current conversational language
                // (Dependency #2's own new #currentLanguage state, set
                // only from a real, successful language resolution in
                // #send() above) rather than always defaulting to
                // English. Generic wiring, not a Kiswahili-specific
                // branch: any language the existing conversational
                // provider resolves benefits identically. When no real
                // language has been resolved yet, languageCode is
                // omitted entirely, so SpeechRecognitionAdapter's own
                // existing "en-US" default applies exactly as before -
                // the existing fallback is preserved, not replaced.
                asr.start(this.#currentLanguage ? { continuous: false, interimResults: false, languageCode: this.#currentLanguage } : { continuous: false, interimResults: false });
            });
        }

        /**
         * #wireImageInput() — P-023: the real door into
         * CognitiveCoordinator.runFromImage(), which already existed but
         * had no UI able to reach it. Composes the existing, unmodified
         * window.CozyOS.OCR for a real, live availability check -
         * honestly disables the button rather than offering an attach
         * flow that would fail. Never a second OCR/vision engine.
         */
        #wireImageInput() {
            const imageBtn = this.#panel.querySelector("#cozy-living-assistant-image");
            const imageInput = this.#panel.querySelector("#cozy-living-assistant-image-input");
            const ocr = window.CozyOS && window.CozyOS.OCR;
            if (!ocr || typeof ocr.isAvailable !== "function" || !ocr.isAvailable()) {
                imageBtn.disabled = true;
                imageBtn.title = "Image reading is not available - no real OCR backend (Tesseract.js) is loaded in this build.";
                return;
            }
            imageBtn.addEventListener("click", () => imageInput.click());
            imageInput.addEventListener("change", () => {
                const file = imageInput.files && imageInput.files[0];
                imageInput.value = ""; // real reset - allows re-selecting the same file next time
                if (file) this.#sendImage(file);
            });
        }

        /**
         * #sendImage(file) — composes the existing, unmodified
         * CognitiveCoordinator.runFromImage() (real OCR -> the same real
         * pipeline text input already uses). Same honest reply-path
         * discipline as #send(): reads the real intelligence.insights
         * shape, never fabricates a reply when OCR or the pipeline
         * genuinely has nothing.
         */
        async #sendImage(file) {
            this.#addMessage("user", `📷 ${file && file.name ? file.name : "image"}`);
            const coordinator = window.CozyOS && window.CozyOS.CognitiveCoordinator;
            if (!coordinator || typeof coordinator.runFromImage !== "function") {
                this.#addMessage("assistant", "The CozyOS vision pipeline is not available right now.");
                return;
            }
            const conversationId = this.#getOrCreateConversationId();
            const result = await coordinator.runFromImage(file, { conversationId });
            // RP-024: same honest selection as #send() - only a genuine
            // .text/.reply/.answer field counts as an answer;
            // result.intelligence.insights is an evidence/diagnostic
            // summary, never rendered as if it were a reply.
            let replyText;
            if (!result || !result.success) {
                replyText = (result && result.reason) || "I couldn't read that image right now.";
            } else {
                replyText = resolveConversationalReply(result) || NO_CONVERSATIONAL_ENGINE_FALLBACK;
            }
            this.#addMessage("assistant", replyText);
            this.#speak(replyText);
        }

        /** #wireLivingAIState() — subscribes to LivingAI's own real, existing state machine (idle/thinking/speaking) to reflect it visually. No new state machine. */
        #wireLivingAIState() {
            const ai = window.CozyOS && window.CozyOS.LivingAI;
            const statusEl = this.#panel.querySelector("#cozy-living-assistant-status");
            if (!ai || typeof ai.on !== "function") return;
            ai.on((state) => {
                if (statusEl) statusEl.textContent = state === "thinking" ? "Thinking..." : state === "speaking" ? "Speaking..." : "";
                this.#button.classList.toggle("cozy-ai-thinking", state === "thinking");
                this.#button.classList.toggle("cozy-ai-speaking", state === "speaking");
            });
        }

        /**
         * #bindWorkspaceContext() — real context-awareness, composing
         * WorkspaceShell's own existing on()/emit() (which already
         * delegates to PlatformEventBus, no new bus). Listens for the
         * one new, minimal "center:changed" event added this milestone
         * at WorkspaceShell's existing section-switch call site. Bounded
         * retry (same convention as dashboard.html's own
         * mountWorkspaceWhenReady()) since WorkspaceShell may not exist
         * yet at the moment this file's script runs.
         */
        #bindWorkspaceContext() {
            let attempts = 0;
            const tryBind = () => {
                const shell = window.CozyOS && window.CozyOS.WorkspaceShell;
                if (shell && typeof shell.on === "function") {
                    shell.on("center:changed", ({ center }) => { if (center) this.#currentSection = center; });
                    return;
                }
                attempts++;
                if (attempts < MAX_BIND_ATTEMPTS) setTimeout(tryBind, BIND_RETRY_MS);
            };
            tryBind();
        }

        getDiagnosticsReport() {
            return { moduleVersion: VERSION, messageCount: this.#messages.length, expanded: this.#expanded, currentSection: this.#currentSection };
        }
    }

    const instance = new LivingAssistant();
    window.CozyOS.LivingAssistant = instance;
    window.CozyOS.Modules["cozy-living-assistant"] = Object.freeze({
        version: VERSION,
        description: "Living Floating Assistant — a COMPOSED LIVING COMPONENT (M364.7.1 / RP-024 / CHECKPOINT K). Composes LivingAI (real state machine + think(), kept for its real state/sounds/diagnostics side effects), the verified Question -> Context -> Answer -> Advisor chain (CozyAI.getContext() -> CozyIdentityFAQRouter -> CozyAnswerEngine -> CozyAdvisor, Checkpoints F-J, now the real conversational-answer source for this UI), core/living/cozy-living.css, VoiceManager/CozySpeech (real TTS), SpeechRecognitionAdapter (real ASR), CognitiveCoordinator.runFromImage()/window.CozyOS.OCR (real, Tesseract-backed OCR), and WorkspaceShell's own existing event system ('center:changed'). CHECKPOINT K: replies are now sourced from the verified chain's structured, evidence-tagged {answer,evidenceState,sources} result (via CozyAdvisor.advise(), renderAdvisorReply()) using the real, non-'system' actorId from #resolveActorId() — CozyMemory's own visibility/organisation enforcement is inherited unchanged. This supersedes the old #matchDeveloperIdentityTopic() shortcut (removed — the verified chain's CozyIdentityFAQRouter already covers the same questions with real evidence tagging). resolveConversationalReply()/NO_CONVERSATIONAL_ENGINE_FALLBACK remain as an honest fallback only for environments where the verified chain isn't loaded. Mounts once, outside #cozy-workspace-root, sibling to the Living Background canvas — never recreated on navigation, conversation state never lost. Only ever mounted from dashboard.html/index.html, after real authentication — never shown during startup/login."
    });

    // Auto-mount: this file is only ever loaded on an authenticated
    // workspace page (dashboard.html) - real, same convention as every
    // other self-mounting Living component in this codebase.
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => instance.mount());
    } else {
        instance.mount();
    }
})();
} // end RP-024 browser-only guard (see note above the IIFE)
