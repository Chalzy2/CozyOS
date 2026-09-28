/**
 * CozyOS — Live Next-Step Intelligence: Live Window Suggestion UI
 * File Reference: core/shell/live/cozy-next-step-suggestions-ui.js
 *
 * WHAT THIS IS
 *   The ONE real UI surface for Live Next-Step Intelligence, rendered
 *   inside the SAME Live Window every other mode already shares —
 *   never a second window, never a popup. Composes, additively:
 *     - window.CozyOS.NextStepEngine / NextStepActionRegistry / NextStepLifecycle
 *       (see those files — this file adds no ranking/action/state logic
 *       of its own beyond owning ONE lifecycle variable per page).
 *     - The real 'cozyos:next-step-suggestions' DOM event dispatched by
 *       cozy-answer-engine.js's own answer() choke point (see that
 *       file's attachNextStepSuggestions()) — the real per-turn trigger.
 *     - The Live Window's own real, PUBLIC DOM ids
 *       (#cozy-living-assistant-panel, #cozy-living-assistant-messages,
 *       #cozy-living-assistant-form) — reached exactly the way
 *       live-window-controller.js's own ensureRegion() and
 *       worship-live-window-mode.js already reach them: real DOM
 *       composition on a stable, public id, never a private class-field
 *       edit, and cozy-living-assistant.js/cozy-living-ai.js/
 *       rule-based-conversational-provider.js are never touched.
 *
 * WHERE IT RENDERS
 *   A new <section id="cozy-next-step-suggestions-region"> is inserted
 *   into #cozy-living-assistant-panel immediately BEFORE
 *   #cozy-living-assistant-form — i.e. below the answer (which is
 *   already the last row in #cozy-living-assistant-messages) and
 *   directly above the Speak/Type/Reply input row, exactly the layout
 *   the product spec asks for. It is the SAME single region regardless
 *   of which application mode (worship, or none) is currently active —
 *   an application's own mode region (#cozy-live-window-mode-region,
 *   inserted as the panel's first child) is a completely separate node
 *   this file never writes into.
 *
 * LIFECYCLE (window.CozyOS.NextStepLifecycle — one variable, this file
 * is its only writer per Live Window instance)
 *   NO_SUGGESTIONS -> SUGGESTIONS_AVAILABLE -> SUGGESTION_SELECTED ->
 *   [ACTION_PENDING_AUTHORIZATION ->] ACTION_RUNNING ->
 *   ACTION_SUCCESS|ACTION_FAILED -> SUGGESTIONS_REFRESHED -> ...
 *   Every transition is validated by NextStepLifecycle.transition()
 *   before this file's own #state is assigned — an illegal transition
 *   is logged and the render is skipped rather than corrupting state.
 *   Every transition also dispatches 'cozyos:next-step-lifecycle'
 *   ({detail:{from,to}}) for tests/diagnostics.
 *
 * TEARDOWN ON CONTEXT/MODE SWITCH (test 6)
 *   A MutationObserver watches the real #cozy-live-window-mode-region
 *   node (created by live-window-controller.js's own ensureRegion() —
 *   read-only observation, never mutated by this file) for the
 *   childList/attribute changes activate() itself already makes on
 *   every mode switch (innerHTML clear + repopulate, hidden toggle).
 *   On any such mutation this file clears its own suggestions and
 *   returns to NO_SUGGESTIONS — the SAME teardown discipline
 *   LiveWindow.activate() already applies to the mode region itself,
 *   composed rather than duplicated. Minimizing/restoring the Live
 *   Window window is a WindowManager-level display change that never
 *   touches the mode region, so suggestion state is correctly left
 *   untouched by this observer (test 8).
 *
 * ACTION EXECUTION + AUTHORIZATION + CONFIRMATION (Phase 4)
 *   Tapping a non-destructive suggestion calls
 *   NextStepActionRegistry.execute(actionId, payload, authContext)
 *   directly — ACTION_RUNNING then ACTION_SUCCESS/ACTION_FAILED from
 *   whatever that REAL app handler honestly returns (see that file's
 *   header for the exact, disclosed authorization ceiling per action).
 *   A destructive suggestion (action.destructive===true) instead shows
 *   a real inline confirm (ACTION_PENDING_AUTHORIZATION) — Yes/Cancel,
 *   both real buttons, both realized via CozyLanguageRealize — and only
 *   calls execute() after an explicit "Yes, continue" tap. execute()
 *   itself performs NO extra authorization of its own; a role-denied
 *   call surfaces the real, honest 403 reason from the app handler as
 *   ACTION_FAILED text — never presented as success.
 *
 *   authContext resolution — HONEST, DISCLOSED LIMITATION: this file
 *   has no universal "what is this signed-in user's QuarryOS/ChurchOS
 *   business role" source (none exists repository-wide beyond each
 *   app's own internal records — confirmed before writing this). It
 *   resolves `actorId` from the real window.CozyOS.Session.current()
 *   (same real source worship-live-window-mode.js already uses), and
 *   `role` from an OPTIONAL, real, pluggable
 *   `window.CozyOS.NextStepAuthContextResolver(actorId)` hook a host
 *   page may set to supply its own real role lookup. With no resolver
 *   set, role is null, which QuarryOS's own handle() honestly treats as
 *   its lowest-privilege default ("Machine Operator") — actions stay
 *   safely blocked by default rather than silently granted. This file
 *   never invents a role or bypasses that check.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const VERSION = "1.0.0";
    if (window.CozyOS.Modules["next-step-suggestions-ui"]) return;

    const PANEL_ID = "cozy-living-assistant-panel";
    const MESSAGES_ID = "cozy-living-assistant-messages";
    const FORM_ID = "cozy-living-assistant-form";
    const INPUT_ID = "cozy-living-assistant-input";
    const MODE_REGION_ID = "cozy-live-window-mode-region";
    const REGION_ID = "cozy-next-step-suggestions-region";

    let state = "NO_SUGGESTIONS";
    let currentSuggestions = [];
    let currentLanguage = "en";
    let currentApplicationName = null;
    let modeObserver = null;
    let observedModeRegion = null;

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function realize(key, language, ...params) {
        const r = window.CozyOS && window.CozyOS.CozyLanguageRealize;
        if (r && typeof r.realize === "function") {
            const out = r.realize(key, language, ...params);
            if (typeof out === "string" && out.trim()) return out;
        }
        return null;
    }

    function currentActorId() {
        const session = window.CozyOS && window.CozyOS.Session;
        if (session && typeof session.current === "function") {
            const snap = session.current();
            if (snap && snap.uid) return snap.uid;
        }
        return "anonymous";
    }

    function resolveAuthContext() {
        const actorId = currentActorId();
        let role = null;
        const resolver = window.CozyOS && window.CozyOS.NextStepAuthContextResolver;
        if (typeof resolver === "function") {
            try { role = resolver(actorId) || null; } catch (_err) { role = null; }
        }
        return { actorId, role };
    }

    function panelEl() { return document.getElementById(PANEL_ID); }

    function ensureRegion() {
        const panel = panelEl();
        if (!panel) return null;
        let region = panel.querySelector("#" + REGION_ID);
        if (!region) {
            region = document.createElement("section");
            region.id = REGION_ID;
            region.setAttribute("aria-label", "Suggested next steps");
            region.className = "cozy-next-step-suggestions";
            region.hidden = true;
            const form = panel.querySelector("#" + FORM_ID);
            if (form) panel.insertBefore(region, form); else panel.appendChild(region);
        }
        return region;
    }

    /** #postResultMessage() — mirrors cozy-living-assistant.js's OWN #addMessage() row markup exactly (.cozy-living-card.cozy-event-row.cozy-living-assistant-msg.cozy-living-assistant-msg-assistant), appended to the same real, public #cozy-living-assistant-messages log. Never calls the guarded file's private #addMessage(); this is real, disclosed DOM composition on a public id, the same discipline live-window-controller.js's own header already establishes. */
    function postResultMessage(text) {
        const panel = panelEl();
        const messagesEl = panel && panel.querySelector("#" + MESSAGES_ID);
        if (!messagesEl || typeof text !== "string" || !text.trim()) return;
        const row = document.createElement("div");
        row.className = "cozy-living-card cozy-event-row cozy-living-assistant-msg cozy-living-assistant-msg-assistant";
        row.textContent = text;
        messagesEl.appendChild(row);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function setState(to, detail) {
        const lifecycle = window.CozyOS && window.CozyOS.NextStepLifecycle;
        const from = state;
        if (lifecycle && typeof lifecycle.transition === "function") {
            const result = lifecycle.transition(from, to);
            if (!result.allowed) {
                console.warn(`[NextStepSuggestionsUI] ${result.reason}`);
                return false;
            }
        }
        state = to;
        if (typeof document !== "undefined" && typeof document.dispatchEvent === "function" && typeof CustomEvent !== "undefined") {
            try { document.dispatchEvent(new CustomEvent("cozyos:next-step-lifecycle", { detail: { from, to, ...detail } })); } catch (_err) { /* non-fatal */ }
        }
        return true;
    }

    function clearSuggestions() {
        currentSuggestions = [];
        const region = ensureRegion();
        if (region) { region.innerHTML = ""; region.hidden = true; }
        setState("NO_SUGGESTIONS");
    }

    function renderSuggestions(suggestions, language, applicationName) {
        currentSuggestions = Array.isArray(suggestions) ? suggestions : [];
        currentLanguage = language || "en";
        currentApplicationName = applicationName || null;
        const region = ensureRegion();
        if (!region) return;
        region.innerHTML = "";
        if (currentSuggestions.length === 0) {
            region.hidden = true;
            setState("NO_SUGGESTIONS");
            return;
        }
        region.hidden = false;
        const list = document.createElement("div");
        list.className = "cozy-next-step-suggestions-list";
        list.setAttribute("role", "group");
        list.setAttribute("aria-label", "Suggested next steps");
        currentSuggestions.forEach((s) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "cozy-btn cozy-next-step-suggestion-btn";
            btn.textContent = s.label; // real, accessible, visible text — never icon-only.
            btn.setAttribute("aria-label", s.label);
            btn.dataset.suggestionId = s.id;
            btn.addEventListener("click", () => onSuggestionTap(s));
            list.appendChild(btn);
        });
        region.appendChild(list);
        setState("SUGGESTIONS_AVAILABLE");
    }

    function renderResultAndRefresh(actionId, applicationName) {
        // SUGGESTIONS_REFRESHED — real, freshly-computed suggestions for
        // the new state (e.g. a CONTINUATION offer right after a real
        // success). Never re-shows the just-executed suggestion as-is.
        const engine = window.CozyOS && window.CozyOS.NextStepEngine;
        const registry = window.CozyOS && window.CozyOS.NextStepActionRegistry;
        if (!engine || !registry) { clearSuggestions(); return; }
        const availableActions = registry.listActions(applicationName ? { appId: applicationName } : {});
        let result = { suggestions: [] };
        try {
            result = engine.suggest({
                input: "", intent: null, goal: "perform_action",
                context: { language: currentLanguage },
                application: { appId: applicationName, lastActionId: actionId },
                availableActions, permissions: null
            });
        } catch (_err) { result = { suggestions: [] }; }
        setState("SUGGESTIONS_REFRESHED");
        renderSuggestions(result.suggestions, currentLanguage, applicationName);
    }

    async function runAction(suggestion) {
        setState("ACTION_RUNNING");
        const runningNote = realize("next-step:action-running", currentLanguage) || "Working on it…";
        postResultMessage(runningNote);

        const registry = window.CozyOS && window.CozyOS.NextStepActionRegistry;
        if (!registry || typeof registry.execute !== "function") {
            setState("ACTION_FAILED");
            postResultMessage(realize("next-step:action-failed", currentLanguage, "NextStepActionRegistry is not loaded.") || "That didn't work.");
            renderFailureOptions(suggestion);
            return;
        }

        if (suggestion.action.actionId === "cozyos.clarify") {
            // Re-submit the disambiguated text as this user's own next
            // real Live Window turn — the SAME real answer pipeline
            // every typed message already goes through.
            const text = (suggestion.action.payload && suggestion.action.payload.text) || suggestion.label;
            const panel = panelEl();
            const input = panel && panel.querySelector("#" + INPUT_ID);
            const form = panel && panel.querySelector("#" + FORM_ID);
            clearSuggestions();
            if (input && form && typeof form.requestSubmit === "function") {
                input.value = text;
                form.requestSubmit();
            } else if (input && form) {
                input.value = text;
                form.dispatchEvent(new Event("submit", { cancelable: true }));
            }
            return;
        }

        const authContext = resolveAuthContext();
        const result = await registry.execute(suggestion.action.actionId, suggestion.action.payload, authContext);
        if (result && result.success) {
            setState("ACTION_SUCCESS");
            const message = result.responseText || (result.member && `Member "${result.member.name || result.member.memberId}" created.`) || "Done.";
            postResultMessage(realize("next-step:action-success", currentLanguage, message) || message);
            renderResultAndRefresh(suggestion.action.actionId, currentApplicationName);
        } else {
            setState("ACTION_FAILED");
            const reason = (result && result.reason) || "the real action could not be completed.";
            postResultMessage(realize("next-step:action-failed", currentLanguage, reason) || `That didn't work: ${reason}`);
            renderFailureOptions(suggestion);
        }
    }

    function renderFailureOptions(suggestion) {
        const region = ensureRegion();
        if (!region) return;
        region.innerHTML = "";
        region.hidden = false;
        const wrap = document.createElement("div");
        wrap.className = "cozy-next-step-suggestions-list";
        wrap.setAttribute("role", "group");
        wrap.setAttribute("aria-label", "Action failed — choose next step");

        const tryAgainBtn = document.createElement("button");
        tryAgainBtn.type = "button";
        tryAgainBtn.className = "cozy-btn cozy-next-step-suggestion-btn";
        const tryAgainLabel = realize("next-step:try-again", currentLanguage) || "Try Again";
        tryAgainBtn.textContent = tryAgainLabel;
        tryAgainBtn.setAttribute("aria-label", tryAgainLabel);
        tryAgainBtn.addEventListener("click", () => { setState("SUGGESTION_SELECTED"); onSuggestionTap(suggestion); });

        const chooseAnotherBtn = document.createElement("button");
        chooseAnotherBtn.type = "button";
        chooseAnotherBtn.className = "cozy-btn cozy-next-step-suggestion-btn";
        const chooseAnotherLabel = realize("next-step:choose-another", currentLanguage) || "Choose Another Action";
        chooseAnotherBtn.textContent = chooseAnotherLabel;
        chooseAnotherBtn.setAttribute("aria-label", chooseAnotherLabel);
        chooseAnotherBtn.addEventListener("click", () => { setState("SUGGESTIONS_AVAILABLE"); renderSuggestions(currentSuggestions, currentLanguage, currentApplicationName); });

        wrap.appendChild(tryAgainBtn);
        wrap.appendChild(chooseAnotherBtn);
        region.appendChild(wrap);
    }

    function renderConfirm(suggestion) {
        const region = ensureRegion();
        if (!region) return;
        region.innerHTML = "";
        region.hidden = false;
        const wrap = document.createElement("div");
        wrap.className = "cozy-next-step-confirm";
        const message = document.createElement("p");
        message.className = "cozy-disclosure-note";
        message.textContent = realize("next-step:confirm-destructive", currentLanguage, suggestion.label) || `This will "${suggestion.label}" and cannot be undone. Continue?`;
        wrap.appendChild(message);

        const actions = document.createElement("div");
        actions.className = "cozy-next-step-suggestions-list";
        actions.setAttribute("role", "group");
        actions.setAttribute("aria-label", "Confirm destructive action");

        const yesBtn = document.createElement("button");
        yesBtn.type = "button";
        yesBtn.className = "cozy-btn cozy-next-step-suggestion-btn";
        const yesLabel = realize("next-step:confirm-yes", currentLanguage) || "Yes, continue";
        yesBtn.textContent = yesLabel;
        yesBtn.setAttribute("aria-label", yesLabel);
        yesBtn.addEventListener("click", () => { setState("ACTION_RUNNING"); runAction(suggestion); });

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "cozy-btn cozy-next-step-suggestion-btn";
        const cancelLabel = realize("next-step:confirm-cancel", currentLanguage) || "Cancel";
        cancelBtn.textContent = cancelLabel;
        cancelBtn.setAttribute("aria-label", cancelLabel);
        cancelBtn.addEventListener("click", () => { setState("SUGGESTIONS_AVAILABLE"); renderSuggestions(currentSuggestions, currentLanguage, currentApplicationName); });

        actions.appendChild(yesBtn);
        actions.appendChild(cancelBtn);
        wrap.appendChild(actions);
        region.appendChild(wrap);
    }

    function onSuggestionTap(suggestion) {
        if (!setState("SUGGESTION_SELECTED")) return;
        if (suggestion.destructive) {
            setState("ACTION_PENDING_AUTHORIZATION");
            renderConfirm(suggestion);
            return;
        }
        setState("ACTION_RUNNING");
        runAction(suggestion);
    }

    // -----------------------------------------------------------------
    // Real per-turn trigger — the 'cozyos:next-step-suggestions' event
    // cozy-answer-engine.js's own answer() dispatches.
    // -----------------------------------------------------------------
    function onAnswerEvent(evt) {
        const detail = evt && evt.detail;
        if (!detail || !detail.answerResult) return;
        const suggestions = Array.isArray(detail.answerResult.suggestions) ? detail.answerResult.suggestions : [];
        const language = (detail.answerResult.cognitiveContext && detail.answerResult.cognitiveContext.language) || "en";
        renderSuggestions(suggestions, language, detail.applicationName || null);
    }

    // -----------------------------------------------------------------
    // Teardown on context/mode switch (test 6) — observes the real
    // mode-region node created by live-window-controller.js's own
    // ensureRegion(). Read-only observation; never mutates that node.
    // -----------------------------------------------------------------
    function attachModeObserver() {
        const panel = panelEl();
        if (!panel) return false;
        const modeRegion = panel.querySelector("#" + MODE_REGION_ID);
        if (!modeRegion || modeRegion === observedModeRegion) return !!modeRegion;
        if (modeObserver) modeObserver.disconnect();
        observedModeRegion = modeRegion;
        if (typeof MutationObserver === "undefined") return true;
        modeObserver = new MutationObserver(() => { clearSuggestions(); });
        modeObserver.observe(modeRegion, { childList: true, attributes: true, attributeFilter: ["hidden"] });
        return true;
    }

    function init() {
        if (typeof document === "undefined" || typeof document.addEventListener !== "function") return;
        document.addEventListener("cozyos:next-step-suggestions", onAnswerEvent);
        let attempts = 0;
        const retry = () => { if (!attachModeObserver() && ++attempts < 40) setTimeout(retry, 250); };
        retry();
    }
    init();

    const NextStepSuggestionsUI = Object.freeze({
        getVersion: () => VERSION,
        getState: () => state,
        getCurrentSuggestions: () => currentSuggestions.slice(),
        // Test-only real hooks — no fabricated behavior, same functions the real event listener calls.
        _renderSuggestions: renderSuggestions,
        _onSuggestionTap: onSuggestionTap,
        _clearSuggestions: clearSuggestions,
        _attachModeObserver: attachModeObserver
    });
    window.CozyOS.NextStepSuggestionsUI = NextStepSuggestionsUI;

    window.CozyOS.Modules["next-step-suggestions-ui"] = Object.freeze({
        version: VERSION,
        description: "Live Next-Step Intelligence — window.CozyOS.NextStepSuggestionsUI. Renders 0-3 real suggestion buttons into the ONE existing Live Window panel (#cozy-living-assistant-panel), below the answer, above the Speak/Type/Reply row — never a second window/popup. Listens for cozy-answer-engine.js's real 'cozyos:next-step-suggestions' event, drives the shared NextStepLifecycle state machine, executes real actions via NextStepActionRegistry (with an inline confirm step for destructive actions), posts an honest result row into the real #cozy-living-assistant-messages log (same markup convention as the guarded file's own #addMessage(), never calling it directly), and tears down (NO_SUGGESTIONS) on any real Live Window mode/context switch via a MutationObserver on the existing mode region — never on minimize/restore."
    });
})();
