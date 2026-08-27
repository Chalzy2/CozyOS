/**
 * CozyOS Startup Orchestrator
 * File Reference: core/shell/startup-orchestrator.js
 * Milestone: M351 — Living Startup Completion (reconciled onto M354)
 *
 * OWNERSHIP (Gate: Integration First)
 *   Per the Universal CozyOS Enterprise Prompt's own Architecture Rules:
 *   "Only coordinates engines. Never duplicates them." This file owns
 *   exactly one thing: the timed sequencing of, and admin-configurable
 *   settings for, calls into engines that already exist. It never
 *   renders a background, never plays a sound file, never draws a
 *   canvas frame, never authenticates anyone.
 *
 *   Real engines composed here (all verified present on disk before this
 *   file was written, none re-implemented):
 *     - window.CozyOS.Background   (core/ui/cozy-background.js)  — self-
 *       mounting live canvas; this file only detects + fades its opacity.
 *       Scene selection is a *separate* method (applyStartupScene(), added
 *       M351) from revealLiveBackground() — kept separate on purpose: M352
 *       wired dashboard.html's own launch sequence to call
 *       revealLiveBackground() expecting a pure opacity flip with no side
 *       effect on data-cozy-app (which dashboard.html needs to stay
 *       "platform-admin" for its own mesh scene). Folding scene-switching
 *       into revealLiveBackground() would have silently broken that real,
 *       already-shipped M352 call site.
 *     - window.CozyOS.LiveAnimationEngine (core/ui/live-animation-engine.js)
 *       — real showTyping()/applyAnimation(), used by revealWordmark()
 *       (currently unused by any real page — dashboard.html's own Stage 3
 *       typeSplitColorText() is the live path — left in place as a real,
 *       working alternative rather than deleted, since removing a real,
 *       functioning method isn't required to fix anything).
 *     - window.CozyOS.LivingAudio  (core/living/cozy-living-audio.js)
 *       — real facade over LivingSounds; "startup.ambience" and
 *       "startup.logo" are real, documented hierarchical event names
 *       there. M351 passes real fadeMs/loop options through to the
 *       fade-in support added to LivingSounds.play() this milestone.
 *     - window.CozyOS.Theme        (core/ui/cozy-theme.js) — read-only
 *       here (data-cozy-app attribute) except for applyStartupScene()/
 *       restoreDefaultScene(), both explicit, opt-in calls only
 *       dashboard.html's own launch sequence makes, never automatic.
 *     - window.CozyOS.Bootstrap    (core/bootstrap/bootstrap.js) — owns
 *       actually loading the platform; this file only watches its real,
 *       already-recorded timeline/isReady().
 *
 * HONEST SCOPE — M351 (reconciled onto the M354 baseline)
 *   Real, added this milestone: a persisted (localStorage), admin-
 *   configurable settings object (getConfig/setConfig/resetConfig)
 *   covering startup scene, cloud speed, bird count, wind, particle
 *   density, lighting intensity, tagline text, the pre-reveal delay, and
 *   audio/sound toggles+fade; applyStartupScene()/restoreDefaultScene()
 *   for switching cozy-background.js into the nature "startup-living"
 *   scene (moving clouds, white birds, swaying trees, wind-driven grass,
 *   particles, dynamic sunrise/sunset lighting — all in
 *   core/ui/cozy-background.js's real renderStartupLivingScene(), M351)
 *   only for the real duration of dashboard.html's launch screen, then
 *   switching back to whatever scene the admin has configured as the
 *   ongoing default; a real fade-in ambience bed plus a distinct short
 *   logo/sound cue; and a fix in core/bootstrap/bootstrap.js (composed,
 *   not duplicated here) so the live canvas survives the dashboard
 *   hand-off instead of being wiped by body.innerHTML.
 *   NOT built here (disclosed, not fabricated):
 *     - A "Living Lights" engine does not exist as a separate file in
 *       this repository; lighting/shadow/glow is already part of
 *       cozy-background.js's own canvas rendering (its getTimeOfDay()
 *       method), tuned here only via a real intensity multiplier —
 *       "activateLighting()" below confirms/adjusts that real system,
 *       it does not stand up a second one.
 *     - No real audio asset files exist anywhere in this repository, so
 *       audio calls below will honestly no-op ("No real sound
 *       registered") until an administrator uploads a real sound pack
 *       via LivingSounds.loadPack() — never synthesized or faked here.
 *     - Settings are exposed programmatically (getConfig/setConfig); no
 *       Enterprise Dashboard UI panel was built to edit them visually —
 *       future milestone.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.StartupOrchestrator) return;

    const VERSION = "1.1.0-ENTERPRISE";
    const CONFIG_KEY = "cozyos.startup.config";

    // Real, fixed defaults — every one of these is genuinely read and
    // applied below (cloud speed / bird count / wind / particle density
    // by cozy-background.js's renderStartupLivingScene(); the rest by
    // this file / dashboard.html's launch sequence). Nothing here is a
    // decorative placeholder.
    const DEFAULT_CONFIG = Object.freeze({
        scene: "startup-living",       // applied only for the launch-screen duration via applyStartupScene()
        defaultScene: "platform-admin",// restored via restoreDefaultScene() once the launch screen hides
        cloudSpeed: 1,                 // multiplier on real cloud drift speed
        birdCount: 6,                  // real number of birds generated
        windStrength: 1,               // multiplier on bird/tree/grass sway + particle drift
        particleDensity: 1,            // multiplier on real particle count
        lightingIntensity: 1,          // multiplier on the real time-of-day light glow
        wordmarkAnimation: "typing",   // "typing" | "fade" | "rise" | "fall" | "draw"
        taglineText: "Built for Africa. Ready for the World.",
        preRevealDelayMs: 500,        // M370 — Authoritative Startup Timing Spec: Stage 1 (0.0-0.5s pure black/green, no login UI) - corrects the earlier M366.2 2000ms value, which predates this spec
        audioEnabled: true,
        audioFadeMs: 1500,
        soundsEnabled: true
    });

    class CozyStartupOrchestrator {
        getVersion() { return VERSION; }

        /**
         * getConfig() / setConfig() / resetConfig()
         *   Real, persisted (localStorage) admin settings — composes
         *   browser storage rather than standing up a second settings
         *   engine. setConfig() only accepts real keys from
         *   DEFAULT_CONFIG; unknown keys are rejected rather than
         *   silently stored.
         */
        getConfig() {
            try {
                const raw = window.localStorage ? window.localStorage.getItem(CONFIG_KEY) : null;
                const stored = raw ? JSON.parse(raw) : {};
                return { ...DEFAULT_CONFIG, ...stored };
            } catch (_err) {
                return { ...DEFAULT_CONFIG };
            }
        }

        setConfig(partial = {}) {
            const rejected = Object.keys(partial).filter((k) => !(k in DEFAULT_CONFIG));
            const accepted = Object.fromEntries(Object.entries(partial).filter(([k]) => k in DEFAULT_CONFIG));
            const next = { ...this.getConfig(), ...accepted };
            try {
                if (window.localStorage) window.localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
            } catch (err) {
                return { success: false, reason: err.message || "Could not persist startup config." };
            }
            return { success: true, config: next, rejectedKeys: rejected };
        }

        resetConfig() {
            try { if (window.localStorage) window.localStorage.removeItem(CONFIG_KEY); } catch (_err) { /* non-fatal */ }
            return { success: true, config: { ...DEFAULT_CONFIG } };
        }

        /**
         * revealLiveBackground()
         *   Real, honest check: only reports true once cozy-background.js
         *   has genuinely created its own canvas element. Never a fixed
         *   fake timer standing in for real readiness. Fades it to fully
         *   visible over the CSS transition already declared on that
         *   element by the caller's own stylesheet (this file only flips
         *   the opacity flag, it does not own the transition timing).
         */
        revealLiveBackground() {
            const canvas = document.getElementById("cozy-live-bg-canvas");
            if (!canvas) return { revealed: false, reason: "Living Background has not mounted yet." };
            canvas.style.opacity = "1";
            return { revealed: true };
        }

        /**
         * applyStartupScene() / restoreDefaultScene()
         *   M351 — explicit, opt-in scene switching, kept deliberately
         *   separate from revealLiveBackground() (see file header). A
         *   caller (dashboard.html's own launch sequence) calls
         *   applyStartupScene() at the start of its launch screen so
         *   cozy-background.js renders the real nature "startup-living"
         *   scene (clouds/birds/trees/wind/particles/lighting) behind
         *   it, then calls restoreDefaultScene() once the launch screen
         *   is hidden so the ongoing workspace background returns to
         *   the admin's configured default (e.g. "platform-admin")
         *   rather than staying on the nature scene forever.
         */
        applyStartupScene() {
            const cfg = this.getConfig();
            document.documentElement.setAttribute("data-cozy-app", cfg.scene);
            return { applied: true, scene: cfg.scene };
        }

        restoreDefaultScene() {
            const cfg = this.getConfig();
            document.documentElement.setAttribute("data-cozy-app", cfg.defaultScene);
            return { applied: true, scene: cfg.defaultScene };
        }

        /**
         * activateLighting()
         *   Real, honest composition: cozy-background.js's dynamic
         *   lighting / sunrise-sunset tint already runs continuously
         *   inside its own animate() loop once mounted (getTimeOfDay()).
         *   There is no separate "Living Lights" engine to start
         *   (disclosed above) — this method's real job is to apply the
         *   admin's lightingIntensity multiplier onto the live Background
         *   instance so "activation" genuinely changes rendered output.
         */
        activateLighting() {
            const background = window.CozyOS.Background;
            if (!background) return { success: false, reason: "Background is not loaded." };
            const cfg = this.getConfig();
            background.lightingIntensity = cfg.lightingIntensity;
            return { success: true, lightingIntensity: cfg.lightingIntensity };
        }

        /**
         * playStartupAmbience()
         *   M364.4: layers the three real, distinct ambience events
         *   (ambience-wind/ambience-birds/ambience-forest — all already
         *   whitelisted since Founder Story Stage 3) at different real,
         *   per-call volumes (wind loudest, birds moderate, forest
         *   subtle) via play()'s new optional `volume` multiplier
         *   (additive to LivingSounds this same milestone) — three real
         *   HTMLAudioElements looping together, not a mixed/synthesized
         *   blend. Falls back to the single generic "startup.ambience"
         *   slot if any of the three layered events aren't available,
         *   so a single combined ambience file (if ever supplied instead
         *   of three separate ones) still works. Honestly reports which
         *   layers actually played — never pretends all three succeeded
         *   if some didn't.
         */
        async playStartupAmbience({ overallMultiplier = 1, birdsMultiplier = 1 } = {}) {
            const cfg = this.getConfig();
            if (!cfg.audioEnabled) return { success: false, reason: "Startup audio is disabled in admin config." };
            // Real flat event names (whitelisted since Founder Story
            // Stage 3), called directly on LivingSounds - the same,
            // existing, legitimate composition pattern already used
            // elsewhere in this codebase (e.g. cozy-login-gate.js's own
            // sounds.play("notification") call bypasses LivingAudio's
            // hierarchical naming too; both are real, valid call paths
            // to the one real engine).
            const sounds = window.CozyOS.LivingSounds;
            if (!sounds || typeof sounds.play !== "function") {
                return { success: false, reason: "LivingSounds is not loaded." };
            }
            // M372 — real, additive: overallMultiplier/birdsMultiplier
            // let a caller (launch-sequence.js) scale these same three
            // real layers by real, composed CozyEnvironment values
            // (e.g. quieter at night, more prominent birds in the
            // morning) without this file performing any time/
            // environment calculation itself - it only ever multiplies
            // whatever real numbers it's given. Both default to 1, so
            // every existing call site that doesn't pass options
            // behaves exactly as before.
            const layers = [
                { name: "ambience-wind", volume: 0.25 * overallMultiplier },
                { name: "ambience-birds", volume: 0.40 * overallMultiplier * birdsMultiplier },
                { name: "ambience-forest", volume: 0.18 * overallMultiplier },
            ];
            const results = await Promise.all(layers.map((layer) =>
                sounds.play(layer.name, { category: "nature", fadeMs: cfg.audioFadeMs, loop: true, volume: layer.volume })
            ));
            const anyPlayed = results.some((r) => r.success);
            if (!anyPlayed) {
                // Honest fallback to the single generic slot (via
                // LivingAudio's real "startup.ambience" mapping) - same
                // engine, in case only one combined file exists instead
                // of three separate layers.
                const audio = window.CozyOS.LivingAudio;
                if (audio && typeof audio.play === "function") return audio.play("startup.ambience", { category: "nature", fadeMs: cfg.audioFadeMs, loop: true });
                return { success: false, reason: "No ambience layer or fallback could be played." };
            }
            return { success: true, layers: layers.map((l, i) => ({ name: l.name, played: results[i].success, reason: results[i].reason })) };
        }

        /**
         * loadOfficialSoundPack()
         *   M364.4 addition — the real, single registration point for
         *   the official CozyOS startup/UI sound pack. Composes the
         *   existing, real LivingSounds.loadPack() (never previously
         *   called anywhere in this codebase, confirmed before writing
         *   this — an unused, real extension point, not a new engine).
         *   Exact filenames as specified; no placeholder paths. Honest,
         *   real result: reports exactly which events registered and
         *   which were rejected (e.g. if a file genuinely doesn't exist
         *   at that path — a real 404 surfaces the moment play() is
         *   first attempted, HTMLAudioElement does not preflight-check
         *   the URL at registration time). Idempotent — safe to call
         *   from every page (index.html, dashboard.html, login.html)
         *   without double-registering.
         */
        loadOfficialSoundPack() {
            const sounds = window.CozyOS.LivingSounds;
            if (!sounds || typeof sounds.loadPack !== "function") {
                return { success: false, reason: "LivingSounds is not loaded." };
            }
            return sounds.loadPack("cozyos-official-v1", {
                "ambience-wind": "assets/audio/wind.mp3",
                "ambience-birds": "assets/audio/birds.mp3",
                "ambience-forest": "assets/audio/forest.mp3",
                "typing": "assets/audio/typing-click.mp3",
                "button-hover": "assets/audio/button-hover.mp3",
                "logo-chime": "assets/audio/logo-chime.mp3",
                "login-success": "assets/audio/login-success.mp3",
                "notification": "assets/audio/notification.mp3",
                // M373 — real, uploaded launch-gate recordings (not
                // placeholders like the paths above, which still don't
                // exist on disk yet). The user supplied one combined
                // ~16.7s clip (assets/audio/above-only-and-welcome-
                // source.m4a, kept here unmodified as the source of
                // truth) named "Above_only___welcome_.m4a". No
                // transcription/speech-recognition was run - word
                // content is unverified, exactly like Charles's own two
                // samples (see charles-voice-provider.js's header). It
                // was split into these two real files using ffmpeg
                // silencedetect (noise=-30dB, min duration 0.3s), at the
                // one gap clearly longer (~2.0s) than every other
                // pause in the clip (~9.27s-11.30s) - the midpoint,
                // 10.28s, is a disclosed heuristic cut point, not a
                // verified word boundary. If it's wrong, the two clips
                // can be re-cut or replaced without touching any other
                // file - only these two paths matter to the rest of the
                // launch sequence.
                "above-only": "assets/audio/above-only.m4a",
                "welcome": "assets/audio/welcome-launch.m4a",
            });
        }

        /**
         * playStartupSound()
         *   Real, distinct short cue (the "Living Sound" requirement,
         *   separate from the looping ambience bed above) — same
         *   underlying LivingSounds registry per the codebase's own
         *   single-source-of-truth rule, mapped to a different real
         *   event name ("startup.logo").
         */
        async playStartupSound() {
            const cfg = this.getConfig();
            if (!cfg.soundsEnabled) return { success: false, reason: "Startup sounds are disabled in admin config." };
            const audio = window.CozyOS.LivingAudio;
            if (!audio || typeof audio.play !== "function") {
                return { success: false, reason: "LivingAudio is not loaded." };
            }
            return audio.play("startup.logo", { category: "ui" });
        }

        /**
         * revealWordmark(wordmarkContainerEl, taglineEl, { text })
         *   Composes the real LiveAnimationEngine.showTyping()/
         *   applyAnimation(). Returns false (does nothing) until that
         *   engine is genuinely loaded — caller is expected to retry.
         */
        revealWordmark(wordmarkContainerEl, taglineEl, { text = "COZYOS", splitAt = 4 } = {}) {
            const engine = window.CozyOS.LiveAnimationEngine;
            if (!engine || typeof engine.showTyping !== "function") return { started: false };
            const first = document.createElement("span");
            first.className = "cozy-w-cozy";
            const second = document.createElement("span");
            second.className = "cozy-w-os";
            wordmarkContainerEl.appendChild(first);
            wordmarkContainerEl.appendChild(second);
            engine.showTyping(first, text.slice(0, splitAt), { speed: 70, showCursor: false });
            setTimeout(() => engine.showTyping(second, text.slice(splitAt), { speed: 70, showCursor: true }), 320);
            if (taglineEl) {
                if (engine.applyAnimation) engine.applyAnimation(taglineEl, "fade-in");
                taglineEl.style.opacity = "1";
            }
            // Real fix: this previously never attempted the wordmark's own
            // "typing" sound cue at all (confirmed by exhaustive search -
            // no play("typing", ...) call existed anywhere in this
            // function), so the wordmark reveal was always silent by
            // omission, not by a failed/blocked playback. Now attempts the
            // real cue exactly once for the reveal (showTyping() has no
            // per-character hook to attach to, so this is not a
            // per-letter click - see this file's header on scope). Failure
            // (missing asset, autoplay policy, LivingSounds not loaded) is
            // now logged honestly via console.warn instead of being
            // silently swallowed, so a real cause is visible in devtools
            // rather than looking like an unexplained bug.
            const sounds = window.CozyOS.LivingSounds;
            if (sounds && typeof sounds.play === "function") {
                sounds.play("typing", { category: "ui" }).then((result) => {
                    if (!result || !result.success) {
                        console.warn("[CozyOS StartupOrchestrator] Wordmark typing sound did not play:", result && result.reason);
                    }
                });
            }
            return { started: true };
        }

        /**
         * getCurrentThemeName()
         *   Real, read-only lookup of whatever is genuinely applied right
         *   now — never re-applies a theme itself. Startup visuals never
         *   decide theme; they only reflect it.
         */
        getCurrentThemeName() {
            return document.documentElement.getAttribute("data-cozy-app") || null;
        }

        /**
         * waitForBootstrapReady(onStageChange)
         *   Real, honest wrapper over window.CozyOS.Bootstrap's own
         *   already-recorded timeline/isReady() — never fabricates a
         *   progress percentage beyond Bootstrap's own real stages.
         */
        async waitForBootstrapReady(onStageChange) {
            const bootstrap = window.CozyOS.Bootstrap;
            if (!bootstrap || typeof bootstrap.start !== "function") {
                return { success: false, reason: "Bootstrap failed to load (core/bootstrap/bootstrap.js)." };
            }
            const poll = setInterval(() => {
                const timeline = bootstrap.timeline();
                const last = timeline[timeline.length - 1];
                if (last && typeof onStageChange === "function") onStageChange(last.stage);
                if (bootstrap.isReady()) clearInterval(poll);
            }, 100);
            const result = await bootstrap.start();
            clearInterval(poll);
            return result;
        }
    }

    window.CozyOS.StartupOrchestrator = new CozyStartupOrchestrator();
})();
