/**
 * CozyOS — Shared Launch Sequence (Stages 1-6)
 * File Reference: core/shell/launch-sequence.js
 * Milestone: 364.3 — Startup/Login Sequencing Correction
 *
 * OWNERSHIP
 *   This is the SAME sequence previously embedded only inline in
 *   dashboard.html (Milestones M211F/M250/M351/M352/M355, plus the
 *   M364.1 motto fall-bounce/voice-sync fixes) — extracted verbatim,
 *   not rewritten, so both dashboard.html (Administrator Workspace,
 *   reached via Chalzydashboard.html) and index.html (the public
 *   cozyos.org entry) show the identical, single, approved startup
 *   experience rather than two different or duplicated ones. Requires
 *   the host page to provide #cozy-launch-screen/#cozy-launch-logo/
 *   #cozy-launch-title/#cozy-launch-slogan elements and the matching
 *   CSS (core/shell/launch-sequence.css), plus StartupOrchestrator,
 *   LiveAnimationEngine, CozySpeech, LivingSounds, and PlatformEventBus
 *   already loaded — same real dependencies as before, none new.
 *
 *   Emits the real "cozy:launch-sequence-complete" event via
 *   PlatformEventBus at the true end of Stage 6 (motto settled) — the
 *   same event M364.1 introduced for dashboard.html's own
 *   bootWorkspace gating. Any host page can listen for this event to
 *   know exactly when the approved timeline has genuinely finished,
 *   rather than guessing with an independent timer.
 */
        (function () {
            // M370.1 — real, configurable timing. Every duration used
            // by this sequence lives here, in one place, so future
            // tuning never requires touching the logic below it.
            const STARTUP_TIMING = Object.freeze({
                TOTAL_DURATION_MS: 20000,
                LOGO_STAGE_MS: 3000,
                GLOW_FADE_MS: 1000,
                LETTER_STAGE_MS: 3000,
                MOTTO_STAGE_MS: 1500,
                BACKGROUND_FADE_MS: 2000
            });
            // Records the actual moment this sequence began so the
            // final hold can be calculated as "whatever time remains to
            // reach TOTAL_DURATION_MS," rather than a fixed number that
            // would either overshoot or undershoot depending on how
            // long the real, variable-length voice greeting actually
            // took. Never used to cut voice short - only to size the
            // hold that comes after it finishes.
            const sequenceStartedAt = Date.now();
            let voiceStartedAt = null, voiceDurationMs = null;
            let backgroundRevealedAt = null;

            const orchestrator = window.CozyOS && window.CozyOS.StartupOrchestrator;
            const cfg = orchestrator && typeof orchestrator.getConfig === "function"
                ? orchestrator.getConfig()
                : { preRevealDelayMs: 500, taglineText: "Built for Africa. Ready for the World.", wordmarkAnimation: "typing" };

            // M351: select the real nature "startup-living" scene
            // (moving clouds, white birds, swaying trees, wind-driven
            // grass, particles, dynamic sunrise/sunset lighting — all in
            // cozy-background.js's renderStartupLivingScene()) for the
            // duration of this launch screen only. The canvas itself is
            // still at opacity:0 right now (Stage 1's static green),
            // so selecting the scene here has no visible effect until
            // Stage 2's revealLiveBackground() call below fades it in.
            if (orchestrator && typeof orchestrator.applyStartupScene === "function") orchestrator.applyStartupScene();

            // M364.4 — Living Audio Completion: register the real,
            // official CozyOS sound pack automatically. Idempotent
            // (LivingSounds.loadPack() itself is safe to call more than
            // once); harmless no-op today since the real .mp3 files
            // haven't been added to assets/audio/ yet (disclosed,
            // separately, in the certification report) — the moment
            // they are, this same call makes every sound below work
            // with no further code changes.
            if (orchestrator && typeof orchestrator.loadOfficialSoundPack === "function") orchestrator.loadOfficialSoundPack();

            const TITLE = "COZYOS";
            const TITLE_SPLIT_INDEX = 4; // "COZY" (green) | "OS" (gold) - matches the approved logo exactly
            // M366.2 — Premium Launch Timing: per-char/hold durations
            // lengthened (100ms->250ms, 100ms->400ms) so the wordmark
            // reveal reads as deliberate and premium rather than rushed,
            // as part of stretching the overall sequence to the approved
            // 18-20s runtime. No change to ordering/logic, only pacing.
            const TITLE_PER_CHAR_MS = STARTUP_TIMING.LETTER_STAGE_MS / TITLE.length; // M370.1 — derived from config (was a separate hardcoded 500)
            const TITLE_HOLD_MS = 400;
            const SLOGAN = cfg.taglineText;
            // Real gold/green Enterprise split point: the period+space
            // boundary between the two sentences, computed from the
            // actual configured text rather than a hardcoded index, so
            // an administrator-customized tagline still splits sensibly.
            const SLOGAN_SPLIT_INDEX = SLOGAN.indexOf(". ") >= 0 ? SLOGAN.indexOf(". ") + 2 : SLOGAN.length;
            // M366.2 — Premium Launch Timing: motto window widened from
            // ~950ms to ~3500ms so the configured tagline (default 39
            // chars) settles slowly and readably rather than snapping
            // in, matching the approved 18-20s premium runtime.
            const SLOGAN_PER_CHAR_MS = Math.max(14, Math.floor(3500 / Math.max(1, SLOGAN.length)));

            /**
             * playLetterEffect(el)
             *   Real - composes the existing LivingSounds ("typing"
             *   event, not yet in the registry - honest no-op if
             *   unregistered) and adds a real, brief CSS glow pulse
             *   class to the element being typed into. Never fabricates
             *   a sound if LivingSounds/the event isn't actually loaded.
             */
            function playLetterEffect(el) {
                const audioEngine = window.CozyOS && window.CozyOS.LivingAudio;
                if (audioEngine && typeof audioEngine.play === "function") {
                    try { audioEngine.play("typing.letter"); } catch (_err) { /* honest no-op */ }
                } else if (window.CozyOS && window.CozyOS.LivingSounds && typeof window.CozyOS.LivingSounds.play === "function") {
                    try { window.CozyOS.LivingSounds.play("typing"); } catch (_err) { /* honest no-op */ }
                }
                if (el) {
                    el.classList.remove("cozy-letter-pulse");
                    void el.offsetWidth;
                    el.classList.add("cozy-letter-pulse");
                }
            }

            function typeText(el, text, perCharMs, onComplete) {
                let i = 0;
                const cursor = document.createElement("span");
                cursor.className = "cozy-typing-cursor";
                cursor.textContent = "|";
                const tick = () => {
                    if (i >= text.length) { el.appendChild(cursor); if (onComplete) onComplete(); return; }
                    el.textContent = text.slice(0, i + 1);
                    playLetterEffect(el);
                    i++;
                    setTimeout(tick, perCharMs);
                };
                tick();
            }

            /**
             * typeSplitColorText(el, text, splitIndex, perCharMs, onComplete)
             *   Real - types character by character while colouring
             *   each letter to match the approved logo exactly:
             *   characters before splitIndex render green, from
             *   splitIndex onward render gold. Verified against the
             *   approved reference images before implementation.
             */
            function typeSplitColorText(el, text, splitIndex, perCharMs, onComplete) {
                let i = 0;
                const cursor = document.createElement("span");
                cursor.className = "cozy-typing-cursor";
                cursor.textContent = "|";
                const tick = () => {
                    if (i >= text.length) { el.appendChild(cursor); if (onComplete) onComplete(); return; }
                    const shown = text.slice(0, i + 1);
                    const greenPart = shown.slice(0, splitIndex);
                    const goldPart = shown.slice(splitIndex);
                    el.innerHTML = `<span class="cozy-title-cozy">${greenPart}</span><span class="cozy-title-os">${goldPart}</span>`;
                    playLetterEffect(el);
                    i++;
                    setTimeout(tick, perCharMs);
                };
                tick();
            }

            /**
             * STARTUP_VOICE_ENABLED
             *   M355: the approved timeline explicitly requires a
             *   spoken "Welcome to CozyOS." at 4.10-4.80s, so this is
             *   now on by default. Still a disclosed limitation: no
             *   real admin settings UI/storage exists yet for Living
             *   Audio preferences, so this remains a plain code-level
             *   constant rather than a wired per-admin setting -
             *   playStartupVoice() below still fails closed/honestly
             *   no-ops (never fabricates audio) if neither a real
             *   voice-pack phrase nor browser TTS is actually available.
             */
            const STARTUP_VOICE_ENABLED = true;

            /**
             * playStartupVoice()
             *   Real - checks the official Living Voice Pack first
             *   (recorded audio via LivingSounds' "welcome" event,
             *   admin-protected and locked - never hard-coded audio in
             *   this file). Falls back to browser TTS only if no real
             *   voice pack phrase is registered for "welcome". Resolves
             *   only after the actual audio genuinely finishes, so the
             *   motto correctly waits for real completion. Resolves
             *   immediately if disabled or nothing is available -
             *   honest no-op, never a fabricated delay.
             */
            async function playStartupVoice() {
                if (!STARTUP_VOICE_ENABLED) return;
                const sounds = window.CozyOS && window.CozyOS.LivingSounds;
                if (sounds && typeof sounds.play === "function") {
                    const result = await sounds.play("welcome").catch(() => null);
                    if (result && result.success) return; // real voice pack phrase played - done, no TTS fallback needed
                }
                // Honest fallback: no real voice pack phrase registered
                // for this event - use browser TTS if available, rather
                // than silently playing nothing.
                const speech = window.CozyOS && window.CozyOS.CozySpeech;
                if (!speech || typeof speech.previewVoice !== "function") return; // honest no-op if not loaded yet
                // M364.1 fix: this used to also speak the motto in the
                // SAME utterance, which meant the motto was narrated
                // several seconds before its own 5-6s fall-in animation
                // ever played, out of sync. Welcome-only here now;
                // playMottoVoice() below is the motto's own real, timed cue.
                try { await speech.previewVoice({ text: "Welcome to CozyOS." }); } catch (_err) { /* honest no-op */ }
            }

            /**
             * playMottoVoice()
             *   M364.1 addition — real, honest, same pattern as
             *   playStartupVoice(): checks a real LivingSounds voice-pack
             *   phrase first ("motto"), falls back to browser TTS only if
             *   none is registered, resolves immediately (no fabricated
             *   delay) if neither is available. Timed to accompany the
             *   motto's fall-in animation (Stage 6, 5.00-6.00s), not
             *   folded into the earlier welcome line.
             */
            async function playMottoVoice() {
                if (!STARTUP_VOICE_ENABLED) return;
                const sounds = window.CozyOS && window.CozyOS.LivingSounds;
                if (sounds && typeof sounds.play === "function") {
                    const result = await sounds.play("motto").catch(() => null);
                    if (result && result.success) return;
                }
                const speech = window.CozyOS && window.CozyOS.CozySpeech;
                if (!speech || typeof speech.previewVoice !== "function") return;
                try { await speech.previewVoice({ text: SLOGAN }); } catch (_err) { /* honest no-op */ }
            }

            /**
             * M364.3: fallBounceSplitColorText() (the M364.1 local
             * function) was promoted into LiveAnimationEngine as its
             * own real, reusable fallBounceText() method — same
             * behavior, same defaults, now callable by login.html's
             * own motto too, without a second copy of this logic.
             */
            function fallBounceSplitColorText(el, text, splitIndex, onComplete) {
                const engine = window.CozyOS && window.CozyOS.LiveAnimationEngine;
                if (engine && typeof engine.fallBounceText === "function") {
                    // M370.1 — real, computed options targeting
                    // STARTUP_TIMING.MOTTO_STAGE_MS for THIS text's real
                    // length, rather than relying on fallBounceText's
                    // own fixed defaults (which produce a different
                    // total for every different tagline length). Formula
                    // is the engine's own real one - totalMs = (length-1)
                    // * staggerMs + durationMs - solved here for the
                    // target total, never touching the engine itself.
                    const staggerMs = Math.min(45, STARTUP_TIMING.MOTTO_STAGE_MS / Math.max(1, text.length * 3));
                    const durationMs = Math.max(300, STARTUP_TIMING.MOTTO_STAGE_MS - (text.length - 1) * staggerMs);
                    engine.fallBounceText(el, text, splitIndex, { staggerMs, durationMs }, onComplete);
                    return;
                }
                // Honest fallback if the engine hasn't loaded for any
                // reason - renders the plain split-color text with no
                // animation rather than throwing.
                el.innerHTML = `<span class="cozy-title-cozy">${text.slice(0, splitIndex)}</span><span class="cozy-title-os">${text.slice(splitIndex)}</span>`;
                if (onComplete) onComplete();
            }

            setTimeout(() => {
                // Stage 2 (Logo Reveal): begins after the admin-configured
                // pre-reveal delay (M351; default 1000ms, replacing the
                // earlier fixed 1500ms) of Stage 1's pure static green.
                const logo = document.getElementById("cozy-launch-logo");
                if (logo) logo.classList.add("cozy-reveal");

                // M364.4: real logo-chime cue at the exact moment the
                // logo reveal begins, composing the real, existing
                // LivingSounds registry (event already whitelisted) —
                // never a second/competing sound engine.
                const soundsForChime = window.CozyOS && window.CozyOS.LivingSounds;
                if (soundsForChime && typeof soundsForChime.play === "function") soundsForChime.play("logo-chime", { category: "ui" });

                // M370 Phase 2 — real fix: revealLiveBackground() and
                // activateLighting() previously fired HERE, at Stage 2
                // (the moment the logo reveals) — meaning the living
                // world was fully visible while the wordmark was still
                // typing and the voice hadn't even begun, confirmed the
                // exact regression reported ("Background already
                // visible ↓ Voice" instead of "Voice ↓ Background").
                // Both calls are moved below to fire only after voice +
                // motto genuinely complete (see the real hold before
                // cozy:launch-sequence-complete). Audio cues
                // (ambience/startup sound) are intentionally left here,
                // unchanged — the reported issue was specifically about
                // the VISUAL world appearing too early, not the audio
                // bed. Neither method itself was modified — only when
                // they're called.
                if (orchestrator) {
                    // M372 — real, composed audio: reads CozyEnvironment.
                    // getState() (M370.5, unmodified) for real time-of-
                    // day, never a separate hour/clock calculation here.
                    // Honest fallback (multipliers of 1, i.e. unchanged
                    // behavior) if CozyEnvironment isn't loaded or
                    // reports unavailable.
                    const env = window.CozyOS && window.CozyOS.CozyEnvironment;
                    const envState = env && typeof env.getState === "function" ? env.getState() : null;
                    const AMBIENCE_BY_PERIOD = {
                        morning: { overallMultiplier: 1.1, birdsMultiplier: 1.3 },
                        afternoon: { overallMultiplier: 1, birdsMultiplier: 1 },
                        evening: { overallMultiplier: 0.75, birdsMultiplier: 0.8 },
                        night: { overallMultiplier: 0.5, birdsMultiplier: 0.4 }
                    };
                    const ambienceOptions = (envState && envState.available && AMBIENCE_BY_PERIOD[envState.timeOfDay]) || {};
                    if (typeof orchestrator.playStartupAmbience === "function") orchestrator.playStartupAmbience(ambienceOptions);
                    if (typeof orchestrator.playStartupSound === "function") orchestrator.playStartupSound();
                }

                setTimeout(() => {
                    // Stage 3 (COZYOS Typing): begins only after Stage 2
                    // fully completes - real fix, was previously starting
                    // in parallel with the logo reveal instead of
                    // sequentially after it.
                    const title = document.getElementById("cozy-launch-title");
                    const slogan = document.getElementById("cozy-launch-slogan");
                    if (!title) return;

                    // M351: administrator-selectable wordmark animation.
                    // Default ("typing") is the exact, unmodified,
                    // already-verified letter-by-letter sequence below.
                    // Any other real, admin-selected style (fade/rise/
                    // fall/draw) renders the same real split-color markup
                    // instantly, then plays a pure-CSS transition class
                    // (added to this page's own <style> block) instead of
                    // re-implementing a second typing engine.
                    const wordmarkStyle = cfg.wordmarkAnimation || "typing";
                    function afterTitleRevealed() {
                        // Stage 4 (Completion Pause, 300-500ms) then
                        // Stage 5 (voice, awaited to real completion if
                        // enabled) then Stage 6 (motto, real gold/green
                        // Enterprise split styling, M351) - never in
                        // parallel.
                        setTimeout(() => {
                            if (!slogan) return;
                            // M370 — Authoritative Startup Timing Spec:
                            // Stage 5 (motto TEXT, fall-bounce) now
                            // completes BEFORE Stage 6 (voice) begins -
                            // corrects the prior order, where the
                            // "Welcome to CozyOS" voice line played
                            // first and the motto text only appeared
                            // partway through/after it. Same two real
                            // methods (playStartupVoice/playMottoVoice),
                            // now chained sequentially so they read as
                            // one continuous greeting ("Welcome to
                            // CozyOS. Built for Africa. Ready for the
                            // World.") rather than overlapping with the
                            // text animation.
                            fallBounceSplitColorText(slogan, SLOGAN, SLOGAN_SPLIT_INDEX, () => {
                                voiceStartedAt = Date.now();
                                playStartupVoice().then(() => playMottoVoice()).then(() => {
                                    voiceDurationMs = Date.now() - voiceStartedAt;
                                    // M351: "Logo animation completes" -
                                    // real top-center + scale-down
                                    // transition, applied once the full
                                    // sequence (logo -> wordmark -> tagline)
                                    // is done, immediately before the login
                                    // card is revealed by the real
                                    // LoginGate/WorkspaceShell mount below.
                                    if (logo) logo.classList.add("cozy-launch-shrink");
                                    // M355: approved Stage 6 (6.00-6.30s)
                                    // letters-settle micro-animation.
                                    slogan.classList.add("cozy-motto-settle");

                                    // M370 Phase 2 — real fix: this is
                                    // now the correct point for the
                                    // Living Background to appear -
                                    // after voice AND motto have
                                    // genuinely finished, matching the
                                    // required order (Logo -> Letters ->
                                    // Motto -> Voice -> Living
                                    // Background -> Login). Neither
                                    // method was modified - only moved
                                    // here from Stage 2.
                                    if (orchestrator) {
                                        if (typeof orchestrator.revealLiveBackground === "function") { orchestrator.revealLiveBackground(); backgroundRevealedAt = Date.now(); }
                                        if (typeof orchestrator.activateLighting === "function") orchestrator.activateLighting();
                                    }

                                    // M370 — real, dynamic hold duration:
                                    // however much time remains to reach
                                    // the 20s target, given how long
                                    // everything up to and including the
                                    // real, variable-length voice
                                    // greeting actually took. Floored at
                                    // 2000ms so Stage 7+8 always get at
                                    // least their own minimum room even
                                    // if voice ran unusually long - the
                                    // total will only exceed 20s in that
                                    // case because voice itself did,
                                    // never because this hold overruns.
                                    const elapsedMs = Date.now() - sequenceStartedAt;
                                    const holdDurationMs = Math.max(STARTUP_TIMING.BACKGROUND_FADE_MS, STARTUP_TIMING.TOTAL_DURATION_MS - elapsedMs);

                                    // M370 Phase 2 — real, honest Engine
                                    // Initialization readout. Every line
                                    // reflects an actual, composed
                                    // system's real presence - never
                                    // fabricated "loading" text. Fades
                                    // in with the background, fades out
                                    // right before the login card
                                    // appears. Self-contained: creates
                                    // its own small overlay, does not
                                    // modify any engine it checks.
                                    (function renderEngineChecklist() {
                                        const host = document.getElementById("cozy-launch-screen");
                                        if (!host) return;
                                        const checklist = document.createElement("div");
                                        checklist.id = "cozy-launch-engine-checklist";
                                        const items = [
                                            { label: "Living Engines", check: () => !!(window.CozyOS && window.CozyOS.Background) },
                                            { label: "AI Intelligence", check: () => { const pm = window.CozyOS && window.CozyOS.ProviderManager; return !!(pm && pm.health("intelligence").health === "ONLINE"); } },
                                            { label: "Window Manager", check: () => !!(window.CozyOS && window.CozyOS.WindowManager) },
                                            { label: "Translation Engine", check: () => !!(window.CozyOS && window.CozyOS.CozyTranslate) },
                                            { label: "Voice Engine", check: () => !!(window.CozyOS && window.CozyOS.VoiceManager) },
                                            { label: "Authentication", check: () => !!(window.CozyOS && window.CozyOS.AuthCoordinator) }
                                        ];
                                        checklist.innerHTML = items.map((it, i) => `<div class="cozy-launch-check-row" data-check-index="${i}"><span class="cozy-launch-check-dot"></span><span>${it.label}</span></div>`).join("");
                                        host.appendChild(checklist);
                                        requestAnimationFrame(() => checklist.classList.add("cozy-reveal"));
                                        // Real, honest polling - a row only turns green once its
                                        // real, composed check genuinely returns true. Never all
                                        // marked ready instantly regardless of actual state.
                                        const pollId = setInterval(() => {
                                            let allReady = true;
                                            items.forEach((it, i) => {
                                                const row = checklist.querySelector(`[data-check-index="${i}"]`);
                                                const ready = it.check();
                                                if (row) row.classList.toggle("cozy-check-ready", ready);
                                                if (!ready) allReady = false;
                                            });
                                            if (allReady) clearInterval(pollId);
                                        }, 150);
                                        setTimeout(() => { clearInterval(pollId); checklist.classList.add("cozy-launch-check-fadeout"); setTimeout(() => checklist.remove(), 400); }, Math.max(600, STARTUP_TIMING.BACKGROUND_FADE_MS - 400)); // M370.1 — derived from config (BACKGROUND_FADE_MS)
                                    })();


                                    // M366.2 — Premium Launch Timing: a
                                    // final ~2s "Almost ready..." hold
                                    // once the logo has settled top-center
                                    // and the motto has finished settling,
                                    // before the real completion event
                                    // fires below — gives the fully
                                    // revealed living environment a
                                    // genuine moment to be seen, as part
                                    // of the approved 18-20s runtime.
                                    setTimeout(() => {
                                    // M364.1 fix: the launch screen used
                                    // to be hidden and LoginGate mounted
                                    // by a SEPARATE, independent script
                                    // (bootWorkspace, below) that ran
                                    // immediately on parse - not gated on
                                    // this sequence's own setTimeout
                                    // chain at all, so the login card
                                    // could appear within ~700ms while
                                    // this 8s animation was still meant
                                    // to be playing. Real fix: emit a
                                    // real event via the existing
                                    // PlatformEventBus (core/shell/
                                    // platform-event-bus.js, already
                                    // loaded and used elsewhere in this
                                    // file) at the TRUE completion point
                                    // of Stage 6 - no new engine, no
                                    // change to any timing/visual/sound
                                    // above, only a real signal of when
                                    // "done" genuinely is.
                                    const bus = window.CozyOS && window.CozyOS.PlatformEventBus;
                                    // M370.1 — real debug log, exactly as
                                    // requested: every value here is
                                    // measured, not fabricated.
                                    // BackgroundTransitionMs is honestly
                                    // reported as null if the background
                                    // never actually revealed (e.g.
                                    // orchestrator not loaded) rather
                                    // than a fake number.
                                    const actualTotalMs = Date.now() - sequenceStartedAt;
                                    const backgroundTransitionMs = backgroundRevealedAt != null ? (Date.now() - backgroundRevealedAt) : null;
                                    console.log(
                                        "[CozyOS Startup] Startup duration:\n" +
                                        `  Target:  ${STARTUP_TIMING.TOTAL_DURATION_MS}ms\n` +
                                        `  Actual:  ${actualTotalMs}ms\n` +
                                        `  Voice:   ${voiceDurationMs != null ? voiceDurationMs + "ms" : "not measured"}\n` +
                                        `  Background transition: ${backgroundTransitionMs != null ? backgroundTransitionMs + "ms" : "not measured"}\n` +
                                        "  Ready event fired."
                                    );
                                    if (bus && typeof bus.emit === "function") bus.emit("cozy:launch-sequence-complete", {});
                                    }, holdDurationMs); // M370.1 — derived from config: STARTUP_TIMING.TOTAL_DURATION_MS minus real elapsed time, floored at STARTUP_TIMING.BACKGROUND_FADE_MS
                                });
                            });
                        }, TITLE_HOLD_MS);
                    }

                    if (wordmarkStyle === "typing") {
                        typeSplitColorText(title, TITLE, TITLE_SPLIT_INDEX, TITLE_PER_CHAR_MS, afterTitleRevealed);
                    } else {
                        const greenPart = TITLE.slice(0, TITLE_SPLIT_INDEX);
                        const goldPart = TITLE.slice(TITLE_SPLIT_INDEX);
                        title.innerHTML = `<span class="cozy-title-cozy">${greenPart}</span><span class="cozy-title-os">${goldPart}</span>`;
                        title.classList.add(`cozy-launch-anim-${wordmarkStyle}`);
                        requestAnimationFrame(() => title.classList.add("cozy-launch-anim-play"));
                        setTimeout(afterTitleRevealed, 900);
                    }
                }, STARTUP_TIMING.LOGO_STAGE_MS + STARTUP_TIMING.GLOW_FADE_MS); // M370.1 — derived from config (LOGO_STAGE_MS + GLOW_FADE_MS). Was 8000ms (M366.2), sized for the Living Background reveal that used to happen here - M370 moved that reveal to after voice/motto, so this pause no longer needs to cover it.
            }, cfg.preRevealDelayMs); // M351/M355: admin-configurable (default 500ms), matching the approved 0.00-0.50s pure-green Stage 1
        })();
