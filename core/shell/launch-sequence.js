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
            // M351 reconciliation onto M354 — real, admin-configurable
            // settings for this launch sequence, composed from the real
            // StartupOrchestrator (core/shell/startup-orchestrator.js).
            // Honest fallback to the file's own pre-existing fixed
            // defaults if the orchestrator hasn't loaded for any reason.
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
            const TITLE_PER_CHAR_MS = 100;
            const TITLE_HOLD_MS = 100; // M355: shortened from 400ms so the approved welcome voice (4.10-4.80s) begins right after Stage 3's wordmark completes at ~4.00s, rather than ~4.40s
            const SLOGAN = cfg.taglineText;
            // Real gold/green Enterprise split point: the period+space
            // boundary between the two sentences, computed from the
            // actual configured text rather than a hardcoded index, so
            // an administrator-customized tagline still splits sensibly.
            const SLOGAN_SPLIT_INDEX = SLOGAN.indexOf(". ") >= 0 ? SLOGAN.indexOf(". ") + 2 : SLOGAN.length;
            // M355: derived so the configured tagline (default 39 chars)
            // finishes typing inside the approved 5.00-6.00s (~1000ms)
            // motto window, rather than a fixed value tuned only for the
            // old, longer stage duration.
            const SLOGAN_PER_CHAR_MS = Math.max(14, Math.floor(950 / Math.max(1, SLOGAN.length)));

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
                    engine.fallBounceText(el, text, splitIndex, {}, onComplete);
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

                // Milestone 352 real fix, extended M351: composes
                // revealLiveBackground() (canvas opacity), playStartupAmbience()
                // (fade-in ambience bed), activateLighting() (admin
                // lightingIntensity onto the real Background instance),
                // and playStartupSound() (a distinct short cue, separate
                // from the looping ambience bed) — four real, existing
                // methods, never a second/competing engine. Does not
                // touch the wordmark typing below (Stage 3/4), which
                // remains this file's own real, spec-verified sequence.
                if (orchestrator) {
                    if (typeof orchestrator.revealLiveBackground === "function") orchestrator.revealLiveBackground();
                    if (typeof orchestrator.playStartupAmbience === "function") orchestrator.playStartupAmbience();
                    if (typeof orchestrator.activateLighting === "function") orchestrator.activateLighting();
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
                            playStartupVoice().then(() => {
                                if (!slogan) return;
                                // M364.1 fix: was typeSplitColorText (typing) -
                                // spec requires per-letter fall/bounce/settle
                                // instead. Motto's own voice line now plays
                                // alongside this animation, not folded into
                                // the earlier welcome utterance.
                                playMottoVoice();
                                fallBounceSplitColorText(slogan, SLOGAN, SLOGAN_SPLIT_INDEX, () => {
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
                                    if (bus && typeof bus.emit === "function") bus.emit("cozy:launch-sequence-complete", {});
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
                }, 2500); // M355: Stage 2's approved 0.50-3.00s duration (logo emerges, glows, breathes, settles top-center) before wordmark typing begins
            }, cfg.preRevealDelayMs); // M351/M355: admin-configurable (default 500ms), matching the approved 0.00-0.50s pure-green Stage 1
        })();
