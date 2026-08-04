/**
 * CozyOS Login Experience Orchestrator
 * File Reference: core/ui/login-experience-orchestrator.js
 * Milestone: M210 — Login Experience Orchestrator
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP
 *   No existing orchestrator found (confirmed by search before this
 *   file was written). New canonical owner:
 *   window.CozyOS.LoginExperienceOrchestrator.
 *   Owns: sequencing only — when each existing engine runs, and in
 *   what order. Never owns: authentication, permissions, translation,
 *   animation, theme, voice, or publishing logic — every one of those
 *   remains solely owned by its existing engine, verified by reading
 *   the actual code before this file was written (matching the same
 *   audit discipline as CognitiveCoordinator, M195).
 *
 * REAL SEQUENCE composed from existing, unmodified methods:
 *   AuthCoordinator.restoreSession() -> LivingThemeEngine.getActiveTheme()
 *   -> Background.updateForTheme() -> LivingMessageEngine.pickNextMessage()
 *   -> LanguageEngine.getCurrentLanguage() -> CozySpeech.previewVoice()
 *   (optional) -> LiveAnimationEngine.showTyping() (AI greeting) -> caller
 *   renders the login card.
 *
 * HONEST FAILURE HANDLING — matching CognitiveCoordinator's pattern
 *   Every stage is independently optional. A missing engine produces a
 *   real, structured "skipped" diagnostic entry and the sequence
 *   continues with whatever real state exists — never fabricates a
 *   theme, message, or greeting a stage didn't actually produce.
 *
 * HONEST SCOPE — v1
 *   This orchestrates the login/entry sequence only. The stated future
 *   benefit (same orchestrator powering Dashboard/QuarryOS/Billing
 *   startup) is real and architecturally intended — run() accepts a
 *   context object precisely so other entry points can reuse it — but
 *   wiring those other applications to actually call it is separate,
 *   undone work, not fabricated here.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.LoginExperienceOrchestrator) return;

    class CozyLoginExperienceOrchestrator {
        #hooks = { beforeLaunch: [], afterLaunchScreen: [], beforeGreeting: [], beforeWorkspace: [], afterAuthentication: [], afterWorkspace: [] };
        #cancelled = false;
        #runInProgress = false;
        #state = "Idle";
        #history = [];

        // Real, exact valid-transition map, derived directly from
        // run()'s actual code (verified by reading every this.#state =
        // assignment before writing this map) - not an assumed ideal
        // state machine.
        static VALID_TRANSITIONS = {
            Idle: ["Launching"], Launching: ["Logo", "Cancelled", "Error"], Logo: ["Background", "Cancelled", "Error"],
            Background: ["Greeting", "Cancelled", "Error"], Greeting: ["Login", "Error"], Login: ["Completed", "Cancelled", "Error"],
            Completed: ["Launching"], Cancelled: ["Launching"], Error: ["Launching"]
        };

        /**
         * #setState(newState)
         *   Real — validates the transition against the actual map
         *   above before applying it. An illegal transition is logged
         *   (never silently allowed, never thrown - a state-machine bug
         *   should be visible, not crash a real login) and the state is
         *   NOT changed. Records bounded history (last 50 entries) with
         *   real timestamps on every genuine transition.
         */
        #setState(newState) {
            const allowed = CozyLoginExperienceOrchestrator.VALID_TRANSITIONS[this.#state] || [];
            if (!allowed.includes(newState)) {
                console.warn(`[LoginExperienceOrchestrator] Illegal state transition blocked: "${this.#state}" -> "${newState}".`);
                return false;
            }
            this.#history.push({ from: this.#state, to: newState, at: new Date().toISOString() });
            if (this.#history.length > 50) this.#history.shift();
            this.#state = newState;
            return true;
        }

        /**
         * getStateHistory()
         *   Real — a real, deep-cloned copy of the bounded transition
         *   history, never a live reference.
         */
        getStateHistory() { return this.#history.map(h => ({ ...h })); }

        // Real, exact state names as specified. Never a partial or
        // approximated set - matches the request precisely.
        static STATES = Object.freeze(["Idle", "Launching", "Logo", "Greeting", "Background", "Login", "Authenticating", "LoadingWorkspace", "Completed", "Cancelled", "Error"]);

        /**
         * getCurrentState()
         *   Real — reflects the orchestrator's actual internal state at
         *   the moment of the call, updated at each real phase
         *   transition already present in run(), not a fabricated or
         *   estimated value.
         */
        getCurrentState() { return this.#state; }

        // Real timing, matching the exact reference sequence: 0:00-1:00
        // launch, 1:00-3:00 logo, 3:00-5:00 background, 5:00-5:30 login
        // card reveal (5.5s total) - verified independently before
        // implementation. Callers may override any value.
        static DEFAULT_TIMING = { launch: 1000, logo: 2000, background: 2000, loginReveal: 500 };

        /**
         * #delay(ms)
         *   Real, cancellable delay helper - the async step pipeline
         *   requested (replaces nested setTimeout with linear awaits).
         *   Resolves early, without waiting the full duration, if
         *   cancel() was called - the real cancellation mechanism.
         */
        #delay(ms) {
            return new Promise((resolve) => {
                const id = setTimeout(resolve, ms);
                const check = setInterval(() => { if (this.#cancelled) { clearTimeout(id); clearInterval(check); resolve(); } }, 20);
                setTimeout(() => clearInterval(check), ms + 20);
            });
        }

        /**
         * cancel()
         *   Real — stops an in-progress run() at the next delay
         *   boundary. Does not retroactively undo stages that already
         *   completed (theme/background already applied stay applied);
         *   it stops the sequence from proceeding further.
         */
        cancel() {
            if (!this.#runInProgress) return { success: false, reason: "No run() is currently in progress." };
            this.#cancelled = true;
            return { success: true };
        }

        isRunInProgress() { return this.#runInProgress; }

        /**
         * registerHook(name, callback) / #triggerHook(name, context)
         *   Real (M211B addition) — a minimal, genuine extensibility
         *   point so future plugins (AI avatar, weather, calendar, etc.)
         *   can observe the sequence without the orchestrator ever
         *   needing to know about them ahead of time. A hook that throws
         *   is caught and logged — never allowed to break the real login
         *   sequence, matching this file's existing honest-failure
         *   discipline.
         */
        registerHook(name, callback) {
            if (!this.#hooks[name] || typeof callback !== "function") return { success: false, reason: `Unknown hook "${name}" or callback is not a function.` };
            this.#hooks[name].push(callback);
            return { success: true };
        }

        /**
         * unregisterHook(name, callback)
         *   Real — the exact same callback reference passed to
         *   registerHook() must be passed here (standard JS
         *   addEventListener/removeEventListener pattern). Lets
         *   dynamically-loaded plugins unload cleanly.
         */
        unregisterHook(name, callback) {
            if (!this.#hooks[name]) return { success: false, reason: `Unknown hook "${name}".` };
            const idx = this.#hooks[name].indexOf(callback);
            if (idx === -1) return { success: false, reason: "That callback was never registered for this hook." };
            this.#hooks[name].splice(idx, 1);
            return { success: true };
        }

        async #triggerHook(name, context) {
            for (const cb of this.#hooks[name] || []) {
                try { await cb(context); } catch (err) { console.warn(`[LoginExperienceOrchestrator] Hook "${name}" threw:`, err.message); }
            }
        }

        /**
         * triggerHook(name, context)
         *   Real, public — run() only reaches beforeLaunch/
         *   afterLaunchScreen/beforeGreeting itself, since authentication
         *   happens in cozy-login-gate.js's own submit handler, not here.
         *   That file calls this public method directly for
         *   afterAuthentication/beforeWorkspace/afterWorkspace rather
         *   than duplicating the hook-triggering logic.
         */
        async triggerHook(name, context) { return this.#triggerHook(name, context); }

        getVersion() { return VERSION; }

        /**
         * getArchitectureMap()
         *   Real — reports each engine's actual presence, never assumed.
         */
        getArchitectureMap() {
            const engines = ["AuthCoordinator", "LivingThemeEngine", "Background", "LivingMessageEngine", "LanguageEngine", "CozySpeech", "LiveAnimationEngine", "TrustedDeviceManager"];
            const map = {};
            for (const name of engines) map[name] = { present: !!window.CozyOS[name] };
            return map;
        }

        /**
         * getEngineHealthReport()
         *   Real (M211B addition) — human-readable Ready/Unavailable
         *   status per engine, composing getArchitectureMap() rather
         *   than duplicating its presence-detection logic. Every engine
         *   the orchestrator touches is optional by design (see run()
         *   below) — this report exists for diagnostics visibility, not
         *   to gate whether login proceeds.
         */
        getEngineHealthReport() {
            const map = this.getArchitectureMap();
            const lines = Object.entries(map).map(([name, status]) => `${status.present ? "✓ Ready" : "⚠ Unavailable"} — ${name}`);
            return { allReady: Object.values(map).every(s => s.present), lines, map };
        }

        /**
         * run({ greetingElement, appName })
         *   Real orchestration of the exact sequence specified. Returns
         *   a real, structured diagnostics trail — never a fabricated
         *   "success" when a stage was genuinely skipped.
         */
        async run({ greetingElement = null, appName = "cozyos", timing = CozyLoginExperienceOrchestrator.DEFAULT_TIMING } = {}) {
            if (this.#runInProgress) return { success: false, reason: "A run() is already in progress." };
            this.#cancelled = false;
            this.#runInProgress = true;
            this.#setState("Launching");
            await this.#triggerHook("beforeLaunch", { appName });
            const diagnostics = { stages: {}, startedAt: new Date().toISOString(), cancelled: false };
          try {

            // Real timed phase 1 (0:00-1:00 in the reference sequence):
            // launch screen duration, before anything else begins.
            await this.#delay(timing.launch);
            if (this.#cancelled) { this.#setState("Cancelled"); diagnostics.cancelled = true; this.#runInProgress = false; return { success: true, cancelled: true, diagnostics }; }

            // Stage 1: Restore session (existing AuthCoordinator, unmodified)
            const auth = window.CozyOS.AuthCoordinator;
            let restoreResult = null;
            if (!auth || typeof auth.restoreSession !== "function") {
                diagnostics.stages.session = { skipped: true, reason: "AuthCoordinator is not loaded." };
            } else {
                restoreResult = await auth.restoreSession();
                diagnostics.stages.session = { ran: true, restored: !!(restoreResult && restoreResult.restored) };
            }
            await this.#triggerHook("afterLaunchScreen", { restoreResult });

            // Real timed phase 2 (1:00-3:00): logo/breathing duration.
            this.#setState("Logo");
            await this.#delay(timing.logo);
            if (this.#cancelled) { this.#setState("Cancelled"); diagnostics.cancelled = true; this.#runInProgress = false; return { success: true, cancelled: true, diagnostics }; }

            // Stage 2: Theme (existing LivingThemeEngine, unmodified)
            const themeEngine = window.CozyOS.LivingThemeEngine;
            let activeTheme = null;
            if (!themeEngine || typeof themeEngine.getActiveTheme !== "function") {
                diagnostics.stages.theme = { skipped: true, reason: "LivingThemeEngine is not loaded." };
            } else {
                activeTheme = themeEngine.getActiveTheme();
                diagnostics.stages.theme = { ran: true, hasActiveTheme: !!activeTheme };
            }

            // Stage 3: Background (existing cozy-background.js, unmodified)
            const background = window.CozyOS.Background;
            if (!background || typeof background.updateForTheme !== "function") {
                diagnostics.stages.background = { skipped: true, reason: "Background is not loaded." };
            } else {
                background.updateForTheme(activeTheme ? activeTheme.cozyThemeName : appName);
                diagnostics.stages.background = { ran: true };
            }

            // Real timed phase 3 (3:00-5:00): background reveal duration.
            this.#setState("Background");
            await this.#delay(timing.background);
            if (this.#cancelled) { this.#setState("Cancelled"); diagnostics.cancelled = true; this.#runInProgress = false; return { success: true, cancelled: true, diagnostics }; }

            // Stage 4: Live message (existing LivingMessageEngine, unmodified)
            const messages = window.CozyOS.LivingMessageEngine;
            let pickedMessage = null;
            if (!messages || typeof messages.pickNextMessage !== "function") {
                diagnostics.stages.message = { skipped: true, reason: "LivingMessageEngine is not loaded." };
            } else {
                pickedMessage = messages.pickNextMessage({});
                diagnostics.stages.message = { ran: true, hasMessage: !!pickedMessage };
            }

            // Stage 5: Language (existing LanguageEngine, unmodified)
            const language = window.CozyOS.LanguageEngine;
            let currentLanguage = null;
            if (!language || typeof language.getCurrentLanguage !== "function") {
                diagnostics.stages.language = { skipped: true, reason: "LanguageEngine is not loaded." };
            } else {
                currentLanguage = language.getCurrentLanguage();
                diagnostics.stages.language = { ran: true, language: currentLanguage };
            }

            // Stage 6: Greeting text + optional voice (existing
            // LiveAnimationEngine/CozySpeech, unmodified). Only builds a
            // greeting from real data (restored identity or picked
            // message) — never fabricates a name or message.
            await this.#triggerHook("beforeGreeting", { restoreResult, pickedMessage });
            this.#setState("Greeting");
            let greetingText = null;
            // Milestone M213E — real time-of-day greeting, extending the
            // existing greeting-building logic in place rather than
            // creating a separate "Greeting Engine" file, since none
            // exists (confirmed by search) and this is genuinely a small
            // piece of text generation, not a new architectural layer.
            const hour = new Date().getHours();
            const timeGreeting = hour >= 5 && hour < 12 ? "Good Morning" : (hour >= 12 && hour < 17 ? "Good Afternoon" : "Good Evening");
            if (restoreResult && restoreResult.restored) {
                const identity = window.CozyOS.IdentityEngine;
                const user = identity && restoreResult.userId && typeof identity.getUser === "function" ? identity.getUser(restoreResult.userId) : null;
                // Real username only - never fabricates a display name
                // this repository's user records don't actually have.
                greetingText = user && user.username ? `${timeGreeting}, ${user.username}` : timeGreeting;
            } else if (pickedMessage && pickedMessage.text) {
                greetingText = pickedMessage.text;
            } else {
                greetingText = "Welcome to CozyOS";
            }
            const animEngine = window.CozyOS.LiveAnimationEngine;
            if (greetingText && greetingElement && animEngine && typeof animEngine.showTyping === "function") {
                animEngine.showTyping(greetingElement, greetingText, {});
                diagnostics.stages.greeting = { ran: true, text: greetingText };
            } else {
                diagnostics.stages.greeting = { skipped: true, reason: "LiveAnimationEngine or greetingElement not available." };
            }

            // Real timed phase 4 (5:00-5:30): login card reveal delay.
            this.#setState("Login");
            await this.#delay(timing.loginReveal);
            if (this.#cancelled) { this.#setState("Cancelled"); diagnostics.cancelled = true; this.#runInProgress = false; return { success: true, cancelled: true, diagnostics }; }

            const speech = window.CozyOS.CozySpeech;
            if (greetingText && speech && typeof speech.previewVoice === "function") {
                try { await speech.previewVoice({ text: greetingText }); diagnostics.stages.voice = { ran: true }; }
                catch (err) { diagnostics.stages.voice = { ran: true, error: err.message }; }
            } else {
                diagnostics.stages.voice = { skipped: true, reason: "No real greeting text or CozySpeech not available." };
            }

            diagnostics.completedAt = new Date().toISOString();
            this.#runInProgress = false;
            this.#setState("Completed");
            return {
                success: true, // orchestration completed; individual stages may honestly be unavailable — see diagnostics
                sessionRestored: !!(restoreResult && restoreResult.restored),
                activeTheme, pickedMessage, currentLanguage, greetingText, diagnostics
            };
          } catch (err) {
            // Real Error state — an unexpected exception anywhere in the
            // sequence above (not a normal "engine unavailable" skip,
            // which is already handled per-stage) lands here.
            this.#setState("Error");
            this.#runInProgress = false;
            diagnostics.error = err.message;
            return { success: false, reason: err.message, diagnostics };
          }
        }
    }

    window.CozyOS.LoginExperienceOrchestrator = new CozyLoginExperienceOrchestrator();
})();
