/**
 * CozyOS — Live Next-Step Intelligence: Lifecycle States
 * File Reference: core/modules/intelligence/next-step/cozy-next-step-lifecycle.js
 *
 * WHAT THIS IS
 *   The real, shared STATES enum + a tiny, testable state-transition
 *   guard, used by cozy-next-step-suggestions-ui.js (the only real
 *   writer of this state per Live Window instance) and by this
 *   feature's own tests (so lifecycle correctness is checkable without
 *   a DOM/browser). Not a second state machine framework — nine
 *   states, one current value, one transition function.
 *
 * STATES (per the product spec)
 *   NO_SUGGESTIONS, SUGGESTIONS_AVAILABLE, SUGGESTION_SELECTED,
 *   ACTION_PENDING_AUTHORIZATION, ACTION_RUNNING, ACTION_SUCCESS,
 *   ACTION_FAILED, SUGGESTIONS_REFRESHED
 *
 * ALLOWED TRANSITIONS (documented, enforced by canTransition()/
 * transition() — an illegal transition is rejected, never silently
 * forced, so a UI bug shows up as a real, loud "illegal transition"
 * reason instead of a corrupted lifecycle state)
 *   NO_SUGGESTIONS            -> SUGGESTIONS_AVAILABLE
 *   SUGGESTIONS_AVAILABLE     -> SUGGESTION_SELECTED, NO_SUGGESTIONS
 *   SUGGESTION_SELECTED       -> ACTION_PENDING_AUTHORIZATION,
 *                                ACTION_RUNNING (non-destructive, no
 *                                confirmation step needed),
 *                                SUGGESTIONS_AVAILABLE (selection
 *                                cancelled/re-chosen)
 *   ACTION_PENDING_AUTHORIZATION -> ACTION_RUNNING,
 *                                SUGGESTIONS_AVAILABLE (confirmation declined)
 *   ACTION_RUNNING            -> ACTION_SUCCESS, ACTION_FAILED
 *   ACTION_SUCCESS            -> SUGGESTIONS_REFRESHED
 *   ACTION_FAILED             -> SUGGESTIONS_REFRESHED,
 *                                SUGGESTION_SELECTED (Try Again),
 *                                SUGGESTIONS_AVAILABLE (Choose Another Action)
 *   SUGGESTIONS_REFRESHED     -> SUGGESTIONS_AVAILABLE, NO_SUGGESTIONS
 *   any state                 -> NO_SUGGESTIONS (context/mode switch —
 *                                the one universal teardown transition,
 *                                mirroring LiveWindow.activate()'s own
 *                                "always clear the mode region first"
 *                                discipline)
 */
(function (root) {
    "use strict";
    function cozyOS() { return (root && root.window && root.window.CozyOS) || (typeof window !== "undefined" ? window.CozyOS : null); }

    const VERSION = "1.0.0";
    const STATES = Object.freeze([
        "NO_SUGGESTIONS", "SUGGESTIONS_AVAILABLE", "SUGGESTION_SELECTED",
        "ACTION_PENDING_AUTHORIZATION", "ACTION_RUNNING", "ACTION_SUCCESS",
        "ACTION_FAILED", "SUGGESTIONS_REFRESHED"
    ]);
    const STATES_SET = new Set(STATES);

    const TRANSITIONS = Object.freeze({
        NO_SUGGESTIONS: ["SUGGESTIONS_AVAILABLE"],
        SUGGESTIONS_AVAILABLE: ["SUGGESTION_SELECTED", "NO_SUGGESTIONS"],
        SUGGESTION_SELECTED: ["ACTION_PENDING_AUTHORIZATION", "ACTION_RUNNING", "SUGGESTIONS_AVAILABLE"],
        ACTION_PENDING_AUTHORIZATION: ["ACTION_RUNNING", "SUGGESTIONS_AVAILABLE"],
        ACTION_RUNNING: ["ACTION_SUCCESS", "ACTION_FAILED"],
        ACTION_SUCCESS: ["SUGGESTIONS_REFRESHED"],
        ACTION_FAILED: ["SUGGESTIONS_REFRESHED", "SUGGESTION_SELECTED", "SUGGESTIONS_AVAILABLE"],
        SUGGESTIONS_REFRESHED: ["SUGGESTIONS_AVAILABLE", "NO_SUGGESTIONS"]
    });

    function canTransition(from, to) {
        if (!STATES_SET.has(from) || !STATES_SET.has(to)) return false;
        if (to === "NO_SUGGESTIONS") return true; // universal teardown transition
        return (TRANSITIONS[from] || []).includes(to);
    }

    /** transition(from, to) -> {allowed, to|reason} — never mutates anything; a pure guard the UI's own single state variable calls before assigning. */
    function transition(from, to) {
        if (!STATES_SET.has(to)) return { allowed: false, reason: `"${to}" is not a real lifecycle state.` };
        if (!canTransition(from, to)) return { allowed: false, reason: `Illegal transition: ${from} -> ${to}.` };
        return { allowed: true, to };
    }

    const NextStepLifecycle = Object.freeze({ STATES, TRANSITIONS, canTransition, transition, getVersion: () => VERSION });

    if (typeof module !== "undefined" && module.exports) module.exports = NextStepLifecycle;
    if (root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        root.window.CozyOS.NextStepLifecycle = NextStepLifecycle;
        root.window.CozyOS.Modules["next-step-lifecycle"] = Object.freeze({
            version: VERSION,
            description: "Live Next-Step Intelligence — window.CozyOS.NextStepLifecycle. The real, shared 8-state enum (NO_SUGGESTIONS/SUGGESTIONS_AVAILABLE/SUGGESTION_SELECTED/ACTION_PENDING_AUTHORIZATION/ACTION_RUNNING/ACTION_SUCCESS/ACTION_FAILED/SUGGESTIONS_REFRESHED) plus transition()/canTransition() guards. One state per Live Window instance, owned by cozy-next-step-suggestions-ui.js."
        });
    }
})(typeof window !== "undefined" ? { window } : { window: (typeof global !== "undefined" ? (global.window = global.window || {}) : {}) });
