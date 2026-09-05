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
            // CP7 Login Gate resync — real, configurable timing. Every
            // duration used by this sequence lives here, in one place,
            // so future tuning never requires touching the logic below
            // it.
            //
            // RETIMED to the current authoritative Login Gate spec:
            //   0.0-1.5s  Living Green Opening   (preRevealDelayMs, in
            //             startup-orchestrator.js's DEFAULT_CONFIG)
            //   1.5-3.0s  Logo Reveal            (LOGO_STAGE_MS + GLOW_FADE_MS = 1500)
            //   3.0-3.8s  COZYOS Typing          (LETTER_STAGE_MS = 800, TITLE_HOLD_MS = 0)
            //   3.8-13.8s ABOVE ONLY identity    (ABOVE_ONLY_STAGE_MS = 10000, unchanged)
            //   13.8s+    Motto
            // TOTAL_DURATION_MS is intentionally left at 30000 and
            // BACKGROUND_FADE_MS at 2000, both unchanged from M373 — the
            // existing "however much time remains" hold calculation
            // further below already absorbs any stage-duration change
            // automatically; retiming Stages 1-3 here does not require
            // touching that formula.
            const STARTUP_TIMING = Object.freeze({
                TOTAL_DURATION_MS: 30000,
                LOGO_STAGE_MS: 1000,
                GLOW_FADE_MS: 500,
                LETTER_STAGE_MS: 800,
                MOTTO_STAGE_MS: 1500,
                BACKGROUND_FADE_MS: 2000,
                // ABOVE ONLY stage. The whole inserted stage is 10s — the
                // exact identity extension the authoritative spec calls
                // for (COZYOS typing complete -> ABOVE ONLY -> Motto),
                // not a generic hold added anywhere else.
                // ABOVE_ONLY_DISAPPEAR_BY_MS is the FALLBACK disappear
                // point used only when the real above-only.m4a duration
                // can't be measured (audio missing/blocked/muted) — see
                // computeAboveOnlyPlan()'s real-duration-aware logic
                // below, which is what actually drives timing whenever
                // real audio is playing.
                ABOVE_ONLY_STAGE_MS: 10000,
                ABOVE_ONLY_DISAPPEAR_BY_MS: 9000,
                // How long before the hard removal cutoff the CSS
                // fade-out transition should begin, so it genuinely
                // completes rather than being clipped. Matches the
                // existing #cozy-launch-above-only.cozy-above-only-fade
                // CSS transition duration (1.1s).
                ABOVE_ONLY_FADE_TRANSITION_MS: 1100
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
            // CP7 Login Gate resync — ABOVE ONLY must begin exactly at
            // the 3.8s mark (end of Stage 3 typing), per the
            // authoritative timeline. The prior 400ms post-typing hold
            // is removed so the identity stage begins immediately once
            // the last letter settles.
            const TITLE_HOLD_MS = 0;
            // M373 — the inserted "ABOVE ONLY" segment's exact text, per
            // the authorized spec. Lives here alongside TITLE/SLOGAN so
            // every real on-screen string this file ever renders is
            // defined in one place.
            const ABOVE_ONLY_TEXT = "ABOVE ONLY";
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
             *
             *   CP7 Login Gate resync — particle response: composes the
             *   existing window.CozyOS.LivingParticles engine's real
             *   setGlow() API (the only per-moment intensity control it
             *   exposes — see that file's own header; there is no
             *   discrete "burst"/"pulse" method to fabricate one) for a
             *   brief elevated-glow flicker synced to each letter,
             *   reverting to the base level shortly after. Honest no-op
             *   if LivingParticles isn't loaded or is disabled.
             */
            let letterGlowRevertTimer = null;
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
                const particles = window.CozyOS && window.CozyOS.LivingParticles;
                if (particles && typeof particles.setGlow === "function" && (typeof particles.isEnabled !== "function" || particles.isEnabled())) {
                    try {
                        if (letterGlowRevertTimer) clearTimeout(letterGlowRevertTimer);
                        particles.setGlow(1.6);
                        letterGlowRevertTimer = setTimeout(() => { try { particles.setGlow(1); } catch (_err) { /* honest no-op */ } }, 180);
                    } catch (_err) { /* honest no-op */ }
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

            // M373 — Mute wiring: reuses StartupOrchestrator's existing,
            // already-persisted (localStorage `cozyos.startup.config`)
            // `audioEnabled` setting as the real launch-gate mute switch,
            // rather than inventing a second settings store. `cfg` was
            // already read once above via orchestrator.getConfig() before
            // this sequence began, matching how every other cfg-derived
            // value in this file (taglineText, preRevealDelayMs, …) is
            // used. Muting only ever gates the voice/audio calls below —
            // it never touches a setTimeout duration, never skips the
            // ABOVE ONLY stage, and never alters STARTUP_TIMING.
            const LAUNCH_AUDIO_MUTED = cfg.audioEnabled === false;

            // M373 — User voice-selection wiring: VoiceManager (core/
            // modules/speech/voice-manager.js) already owns real,
            // persisted per-context voice routing (getContextVoice/
            // setContextVoice), with "charles" (the real, official CozyOS
            // voice - core/modules/speech/providers/charles-voice-
            // provider.js) as its real, unconditional default until a
            // user explicitly overrides it. Reading it here (read-only)
            // lets an authenticated user's real, already-persisted
            // override apply to the launch gate without this file
            // inventing a second preference store, and without ever
            // requiring an account merely to hear the default voice
            // (no override recorded -> getContextVoice() itself returns
            // "charles").
            function currentLaunchVoiceProviderId() {
                const vm = window.CozyOS && window.CozyOS.VoiceManager;
                if (vm && typeof vm.getContextVoice === "function") {
                    try { return vm.getContextVoice("startup"); } catch (_err) { /* honest no-op */ }
                }
                return "charles"; // real, documented VoiceManager default even if VoiceManager itself isn't loaded yet
            }

            // Single-Voice Startup Integration — resolved ONCE, here, for
            // the whole sequence, rather than separately inside each of
            // the three voice functions below (as it was before). This
            // is the one thing that makes "the complete introduction is
            // owned by one selected speaker" actually true: every call
            // site downstream reads this same constant, never
            // re-resolving VoiceManager's context per phrase, so a
            // preference change mid-sequence (which cannot realistically
            // happen inside one ~30s run anyway, but this removes even
            // the theoretical possibility) can never split the
            // narration across two voices.
            const ACTIVE_VOICE_PROVIDER_ID = currentLaunchVoiceProviderId();
            // IS_OWNER_VOICE gates whether the existing pre-recorded
            // LivingSounds clips ("welcome"/"above-only" — real uploaded
            // .m4a recordings, see startup-orchestrator.js's
            // loadOfficialSoundPack()) are used at all. Those specific
            // files are Owner Voice recordings; they are not
            // re-synthesizable in a different (AI) voice. So when the
            // resolved voice is NOT "charles", this file must skip them
            // entirely and route every phrase through CozySpeech/
            // VoiceManager.speak() with the SAME resolved provider
            // instead — never playing an Owner Voice recording and an
            // AI voice line back to back in the same run.
            const IS_OWNER_VOICE = ACTIVE_VOICE_PROVIDER_ID === "charles";

            /**
             * playStartupVoice()
             *   Real - when the resolved startup voice is Owner Voice
             *   (Charles), checks the official Living Voice Pack first
             *   (recorded audio via LivingSounds' "welcome" event,
             *   admin-protected and locked - never hard-coded audio in
             *   this file), falling back to browser TTS only if no real
             *   voice pack phrase is registered. When a DIFFERENT voice
             *   is resolved (Single-Voice Startup Integration), the
             *   pre-recorded Owner Voice clip is skipped entirely and
             *   this goes straight to CozySpeech/VoiceManager with that
             *   same resolved provider — never mixing the two. Resolves
             *   only after the actual audio genuinely finishes, so the
             *   motto correctly waits for real completion. Resolves
             *   immediately if disabled or nothing is available -
             *   honest no-op, never a fabricated delay.
             *
             *   M373 fix (still true): passes context:"welcome" through
             *   to CozySpeech.previewVoice() -> VoiceManager.speak() so
             *   VoiceManager's real routing can match Charles's real,
             *   registered "welcome" phrase key when Owner Voice falls
             *   through to TTS. Also honors LAUNCH_AUDIO_MUTED - muting
             *   suppresses this call entirely (resolves immediately)
             *   without touching the visual sequence around it.
             */
            async function playStartupVoice() {
                if (!STARTUP_VOICE_ENABLED || LAUNCH_AUDIO_MUTED) return;
                if (IS_OWNER_VOICE) {
                    const sounds = window.CozyOS && window.CozyOS.LivingSounds;
                    if (sounds && typeof sounds.play === "function") {
                        const result = await sounds.play("welcome").catch(() => null);
                        if (result && result.success) return; // real voice pack phrase played - done, no TTS fallback needed
                    }
                }
                // Honest fallback (Owner Voice, no real asset registered)
                // OR the deliberate Single-Voice path for a non-Owner
                // resolved voice — either way, the SAME resolved
                // provider speaks it, never a silently different one.
                const speech = window.CozyOS && window.CozyOS.CozySpeech;
                if (!speech || typeof speech.previewVoice !== "function") return; // honest no-op if not loaded yet
                // M364.1 fix: this used to also speak the motto in the
                // SAME utterance, which meant the motto was narrated
                // several seconds before its own 5-6s fall-in animation
                // ever played, out of sync. Welcome-only here now;
                // playMottoVoice() below is the motto's own real, timed cue.
                try { await speech.previewVoice({ text: "Welcome to CozyOS.", context: "welcome", providerId: ACTIVE_VOICE_PROVIDER_ID }); } catch (_err) { /* honest no-op */ }
            }

            /**
             * playMottoVoice()
             *   M364.1 addition — real, honest, same pattern as
             *   playStartupVoice(): when Owner Voice is the resolved
             *   startup voice, checks a real LivingSounds voice-pack
             *   phrase first ("motto"), falling back to browser TTS if
             *   none is registered. For a non-Owner resolved voice
             *   (Single-Voice Startup Integration), goes straight to
             *   CozySpeech with that same provider — Charles's
             *   recordings are never mixed into another voice's
             *   narration. Resolves immediately (no fabricated delay) if
             *   neither is available. Timed to accompany the motto's
             *   fall-in animation, not folded into the earlier welcome
             *   line.
             */
            async function playMottoVoice() {
                if (!STARTUP_VOICE_ENABLED || LAUNCH_AUDIO_MUTED) return;
                if (IS_OWNER_VOICE) {
                    const sounds = window.CozyOS && window.CozyOS.LivingSounds;
                    if (sounds && typeof sounds.play === "function") {
                        const result = await sounds.play("motto").catch(() => null);
                        if (result && result.success) return;
                    }
                }
                const speech = window.CozyOS && window.CozyOS.CozySpeech;
                if (!speech || typeof speech.previewVoice !== "function") return;
                // M373: context:"motto" is passed through honestly - Charles
                // (core/modules/speech/providers/charles-voice-provider.js)
                // has no real recording registered under that phrase key
                // today, so Owner Voice honestly falls through to the
                // browser TTS fallback (if available) exactly as before;
                // the moment a real "motto" recording is added to
                // Charles's PHRASE_MAP, this same call starts using it
                // with no further code changes here. For a non-Owner
                // resolved voice, this is simply that voice's own
                // synthesis of the same text, same as the other two
                // phrases — one speaker throughout.
                try { await speech.previewVoice({ text: SLOGAN, context: "motto", providerId: ACTIVE_VOICE_PROVIDER_ID }); } catch (_err) { /* honest no-op */ }
            }

            /**
             * playAboveOnlyVoice()
             *   M373 addition — same real, honest pattern as
             *   playStartupVoice()/playMottoVoice() above: when Owner
             *   Voice is the resolved startup voice, tries LivingSounds'
             *   registered "above-only" event first (the real, uploaded
             *   recording — see core/living/cozy-living-sounds.js's
             *   REAL_SOUND_EVENTS), then CozySpeech/VoiceManager via
             *   context "above-only". For a non-Owner resolved voice
             *   (Single-Voice Startup Integration), the pre-recorded
             *   Owner Voice clip is skipped entirely so this phrase is
             *   spoken by the SAME provider as the other two, never
             *   mixed. Charles has no real TTS-fallback recording under
             *   this phrase key today (only "startup"/"welcome" exist -
             *   see charles-voice-provider.js's own PHRASE_MAP), so the
             *   Owner Voice TTS-fallback path honestly resolves to the
             *   generic browser TTS fallback (if available) or to a
             *   genuine { available:false } - never a fabricated
             *   playback. Honors LAUNCH_AUDIO_MUTED exactly like the
             *   other two voice functions.
             */
            async function playAboveOnlyVoice() {
                if (!STARTUP_VOICE_ENABLED || LAUNCH_AUDIO_MUTED) return { attempted: false, reason: "muted" };
                if (IS_OWNER_VOICE) {
                    const sounds = window.CozyOS && window.CozyOS.LivingSounds;
                    if (sounds && typeof sounds.play === "function") {
                        const result = await sounds.play("above-only").catch(() => null);
                        // CP7 Login Gate resync: real, measured durationMs
                        // (see cozy-living-sounds.js's play() extension)
                        // passed straight through so runAboveOnlyStage() can
                        // synchronize the visual's disappearance with the
                        // real audio length instead of a fixed guess. null
                        // if genuinely unavailable — never estimated here.
                        if (result && result.success) return { attempted: true, played: true, via: "living-sounds", durationMs: result.durationMs || null };
                    }
                }
                const speech = window.CozyOS && window.CozyOS.CozySpeech;
                if (!speech || typeof speech.previewVoice !== "function") return { attempted: true, played: false, reason: "AUDIO ASSET REQUIRED — IMPLEMENTATION BLOCKED FOR REAL VOICE PLAYBACK: CozySpeech not loaded.", durationMs: null };
                try {
                    const res = await speech.previewVoice({ text: "Above Only", context: "above-only", providerId: ACTIVE_VOICE_PROVIDER_ID });
                    return { attempted: true, played: !!(res && res.played), reason: res && res.reason, durationMs: null };
                } catch (_err) {
                    return { attempted: true, played: false, reason: "AUDIO ASSET REQUIRED — IMPLEMENTATION BLOCKED FOR REAL VOICE PLAYBACK", durationMs: null };
                }
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

            /**
             * computeAboveOnlyPlan(timing, audioDurationMs)
             *   M373 — pure, real timing math for the ABOVE ONLY stage,
             *   deliberately extracted as a standalone function (no DOM,
             *   no timers) so it is exactly and directly unit-testable
             *   (see core/shell/tests/launch-sequence-above-only.test.js)
             *   rather than only verifiable by running the full browser
             *   sequence. runAboveOnlyStage() below is the only caller in
             *   real use; this function makes zero decisions on its own
             *   beyond the arithmetic itself.
             *
             *   CP7 Login Gate resync — audioDurationMs (optional): the
             *   real, measured duration (ms) of the above-only.m4a
             *   playback, from LivingSounds.play()'s honest durationMs
             *   field. When a valid positive number is given, the plan
             *   is driven by it directly — removeMs/stageCompleteMs
             *   equal the real audio length, fadeStartMs begins
             *   ABOVE_ONLY_FADE_TRANSITION_MS before that — so the
             *   visual and its sound finish together, never leaving the
             *   visual gone while sound keeps playing (the exact bleed
             *   the CP7 audit found). Omitted/invalid/NaN falls back to
             *   the original fixed plan (fadeStartMs=7800, removeMs=9000,
             *   stageCompleteMs=10000) unchanged — this is what happens
             *   whenever real audio isn't available (missing file,
             *   autoplay blocked, muted), so the sequence's overall
             *   timing/tests remain identical to before in that case. A
             *   duration wildly larger than the intended stage (a
             *   corrupt read, or the wrong file registered) also falls
             *   back rather than being trusted blindly and stalling the
             *   whole Login Gate.
             */
            function computeAboveOnlyPlan(timing, audioDurationMs) {
                const disappearByMs = timing.ABOVE_ONLY_DISAPPEAR_BY_MS;
                const stageMs = timing.ABOVE_ONLY_STAGE_MS;
                const fadeTransitionMs = timing.ABOVE_ONLY_FADE_TRANSITION_MS || 1200;
                const fallback = Object.freeze({
                    fadeStartMs: Math.max(0, disappearByMs - 1200),
                    removeMs: disappearByMs,
                    stageCompleteMs: stageMs,
                    audioDriven: false
                });
                if (typeof audioDurationMs !== "number" || !isFinite(audioDurationMs) || audioDurationMs <= 0) return fallback;
                const SAFETY_CEILING_MS = stageMs + 3000; // guards against one corrupt/implausible duration reading stalling the Login Gate
                if (audioDurationMs > SAFETY_CEILING_MS) return fallback;
                const removeMs = Math.round(audioDurationMs);
                const fadeStartMs = Math.max(0, removeMs - fadeTransitionMs);
                return Object.freeze({ fadeStartMs, removeMs, stageCompleteMs: removeMs, audioDriven: true });
            }

            /**
             * runAboveOnlyStage(onComplete)
             *   M373 addition — the inserted "ABOVE ONLY" segment.
             *   Inserted at the exact audited seam: called from inside
             *   afterTitleRevealed()'s own existing setTimeout, BEFORE
             *   the existing fallBounceSplitColorText(slogan, …) call,
             *   so the existing motto stage is delayed by exactly this
             *   stage's real duration and begins no earlier. Reuses the
             *   existing #cozy-launch-screen host (no second overlay
             *   root), the existing title font/color system (see
             *   launch-sequence.css's #cozy-launch-above-only rules,
             *   layered alongside - not replacing - the existing
             *   #cozy-launch-title/#cozy-launch-slogan color tokens), and
             *   the existing honest voice-call pattern via
             *   playAboveOnlyVoice(). Never touches the Background/
             *   clouds/birds/particles system's own state directly -
             *   those keep rendering on their own independent
             *   requestAnimationFrame loop in cozy-background.js; the
             *   only real coupling is the existing LivingParticles
             *   setGlow() call below (the engine's own real, intended
             *   API for exactly this), never a reassignment of its
             *   internal state.
             *
             *   CP7 Login Gate resync: the visual (CSS transform:
             *   scale + translateY rise, see launch-sequence.css) starts
             *   immediately via requestAnimationFrame, exactly as
             *   before. The audio call is now awaited so its real,
             *   measured duration (if any) can drive
             *   computeAboveOnlyPlan()'s fade/remove timers - this adds
             *   at most a few milliseconds (the time for
             *   HTMLAudioElement.play()'s own promise to resolve) before
             *   those timers are scheduled, not a perceptible delay to
             *   the visual, which has already started animating by then.
             */
            function runAboveOnlyStage(onComplete) {
                const host = document.getElementById("cozy-launch-screen");
                if (!host) { if (onComplete) onComplete(); return; }

                const el = document.createElement("div");
                el.id = "cozy-launch-above-only";
                el.setAttribute("aria-live", "polite");
                el.textContent = ABOVE_ONLY_TEXT;
                host.appendChild(el);

                requestAnimationFrame(() => el.classList.add("cozy-above-only-expand"));

                // Particle response: a sustained, gentle glow elevation
                // for the whole growth window (distinct from the
                // sharper per-letter typing flicker in
                // playLetterEffect()), reverted once the stage
                // completes. Composes the existing LivingParticles
                // engine's real setGlow() API - the only per-moment
                // intensity control it exposes (see that file's own
                // header: no discrete "burst" method exists to
                // fabricate one). Honest no-op if not loaded/disabled.
                const particles = window.CozyOS && window.CozyOS.LivingParticles;
                const particlesActive = !!(particles && typeof particles.setGlow === "function" && (typeof particles.isEnabled !== "function" || particles.isEnabled()));
                if (particlesActive) {
                    // A pending per-letter revert-to-resting timer from
                    // the last typed character (playLetterEffect(),
                    // above) could otherwise fire a few ms into this
                    // stage and stomp the elevated glow this stage is
                    // about to set — cancel it explicitly so ABOVE ONLY's
                    // own glow state is never overridden by a stray
                    // leftover typing-effect timer.
                    if (letterGlowRevertTimer) { clearTimeout(letterGlowRevertTimer); letterGlowRevertTimer = null; }
                    try { particles.setGlow(1.3); } catch (_err) { /* honest no-op */ }
                }

                function finishStage(plan) {
                    const fadeTimer = setTimeout(() => { el.classList.add("cozy-above-only-fade"); }, plan.fadeStartMs);
                    const removeTimer = setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, plan.removeMs);
                    setTimeout(() => {
                        clearTimeout(fadeTimer); clearTimeout(removeTimer);
                        if (el.parentNode) el.parentNode.removeChild(el); // hard guarantee: gone before the motto stage below ever begins
                        if (particlesActive) { try { particles.setGlow(1); } catch (_err) { /* honest no-op */ } }
                        if (onComplete) onComplete();
                    }, plan.stageCompleteMs);
                }

                // Voice, synced to this exact visual stage (not the
                // welcome/motto voice calls, which keep their own
                // existing timing untouched per the "do not redesign the
                // existing sequence" instruction). Awaited so its real
                // duration (if any) can drive finishStage()'s timers;
                // any failure (missing asset, autoplay block, muted)
                // still resolves the promise honestly (never rejects),
                // so finishStage() always runs with at least the fixed
                // fallback plan - sound failure never stalls the Login
                // Gate.
                playAboveOnlyVoice().then((result) => {
                    finishStage(computeAboveOnlyPlan(STARTUP_TIMING, result && result.durationMs));
                }).catch(() => {
                    finishStage(computeAboveOnlyPlan(STARTUP_TIMING));
                });
            }

            setTimeout(() => {
                // Stage 2 (Logo Reveal): begins after the admin-configured
                // pre-reveal delay (CP7 Login Gate resync; default 1500ms, replacing the
                // earlier fixed 1500ms) of Stage 1's pure static green.
                const logo = document.getElementById("cozy-launch-logo");
                if (logo) logo.classList.add("cozy-reveal");

                // M364.4: real logo-chime cue at the exact moment the
                // logo reveal begins, composing the real, existing
                // LivingSounds registry (event already whitelisted) —
                // never a second/competing sound engine.
                const soundsForChime = window.CozyOS && window.CozyOS.LivingSounds;
                if (soundsForChime && typeof soundsForChime.play === "function") soundsForChime.play("logo-chime", { category: "ui" });

                // CP7 Login Gate resync — revealLiveBackground()/
                // activateLighting() now fire HERE, at Stage 2, instead
                // of only after voice + motto genuinely complete (their
                // prior M370 Phase 2 position, see the removed comment
                // that used to explain that regression fix). The
                // authoritative Login Gate spec now requires the Living
                // environment to be visible and continuous underneath
                // the ENTIRE introduction (Opening → Logo → Typing →
                // ABOVE ONLY → Motto → Welcome), not only after it
                // finishes. This is purely a CSS opacity flip on a
                // canvas that has already been rendering continuously
                // since applyStartupScene() ran at the very start of
                // this file (confirmed before making this change) — it
                // does not stop, restart, recreate, or reload the
                // background/theme in any way, only makes the
                // already-running scene visible earlier. Neither method
                // itself was modified — only when they're called, and
                // only once, here — the later call site after
                // voice/motto was removed rather than duplicated.
                if (orchestrator) {
                    if (typeof orchestrator.revealLiveBackground === "function") { orchestrator.revealLiveBackground(); backgroundRevealedAt = Date.now(); }
                    if (typeof orchestrator.activateLighting === "function") orchestrator.activateLighting();
                }

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
                            //
                            // M373 — "ABOVE ONLY" is inserted exactly
                            // here: after the title has settled, strictly
                            // BEFORE the existing motto's own
                            // fallBounceSplitColorText/voice call below,
                            // which now only begins once runAboveOnlyStage
                            // has both visually and voice-wise finished
                            // (its own onComplete callback). This is the
                            // only structural change to the existing
                            // sequence's call order.
                            runAboveOnlyStage(() => {
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

                                    // CP7 Login Gate resync: revealLiveBackground()/
                                    // activateLighting() are now called
                                    // once, earlier, at Stage 2 (see
                                    // above) — not duplicated here. The
                                    // Living environment has already
                                    // been visible and continuous since
                                    // then; nothing further needs to
                                    // happen to it at this point in the
                                    // sequence.


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
                            }); // M373 — closes runAboveOnlyStage(() => { ... }) opened above; the existing motto/voice chain above only ever runs inside this callback, i.e. only after ABOVE ONLY has genuinely finished.
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
                }, STARTUP_TIMING.LOGO_STAGE_MS + STARTUP_TIMING.GLOW_FADE_MS); // CP7 Login Gate resync — derived from config (LOGO_STAGE_MS + GLOW_FADE_MS = 1500ms), matching the current authoritative 1.5-3.0s Stage 2 (Logo Reveal).
            }, cfg.preRevealDelayMs); // CP7 Login Gate resync — admin-configurable (default 1500ms), matching the current authoritative 0.0-1.5s Stage 1 (Living Green Opening)

            // M373 — real, minimal Node test seam. `module` only exists
            // under Node/CommonJS (require()'d from the test suite below);
            // in every real browser page this file actually ships on
            // (index.html, dashboard.html) `typeof module` is
            // "undefined", so this block never runs there and nothing
            // about the live sequence above changes. Exposes only the
            // pure, already-real functions/constants this file computes
            // internally - never a second, parallel re-implementation of
            // the timing for tests to check against.
            if (typeof module !== "undefined" && module.exports) {
                module.exports = { STARTUP_TIMING, ABOVE_ONLY_TEXT, computeAboveOnlyPlan };
            }
        })();
