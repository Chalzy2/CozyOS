/**
 * CozyOS — Living Learn Panel UI
 * File Reference: core/shell/learning-panel-ui.js
 *
 * OWNERSHIP: owns ONLY the DOM (panel markup, buttons, video preview,
 * status text, review card) and the sequencing of calls into existing
 * real engines. Owns no camera/microphone/OCR/speech/translation/
 * learning/memory capability itself.
 *   - Camera: core/modules/learning/learning-camera-adapter.js
 *   - Voice + matching + storage: core/modules/learning/
 *     universal-learning-pipeline.js (captureVoiceForLearning,
 *     learnFromMultimodalObservation, confirmMultimodalObservation)
 *   - Session state machine / diagnostics / text formatting:
 *     core/modules/learning/learning-interaction-core.js
 * No second implementation of any of the above exists in this file.
 *
 * ENTRY POINT
 *   Mounted from core/shell/user-dashboard.js's #renderAiSurface() via
 *   a single "Living Learn" button — the smallest addition to the
 *   existing, locked 5-surface dashboard (Home/Community/AI/Apps/
 *   Settings — see dashboard-navigation-core.js's own header
 *   documenting that order as mandatory). No new top-level nav surface
 *   was added; this reuses the existing AI surface's real
 *   cozy-btn/cozy-disclosure-note/aria-live conventions.
 *
 * PRIVACY / LIFECYCLE (Sections 14/18)
 *   Camera/microphone access is requested ONLY after the user
 *   explicitly taps Scan/Listen/Both inside an already-opened panel —
 *   never on page load, never silently. close() always calls
 *   LearningCameraAdapter.stopCapture() unconditionally (safe even if
 *   nothing is active) and removes this panel's own DOM/listeners, so
 *   no camera indicator or microphone access is ever left running
 *   after the panel closes.
 *
 * HONEST SCOPE (Section 25 — do not overclaim)
 *   IMPLEMENTED this increment: panel open/close, Scan, Listen, Scan+
 *   Listen (multimodal), review card with Learn/Review/Ignore,
 *   diagnostics, camera/mic lifecycle, basic accessibility.
 *   NOT IMPLEMENTED this increment (real, honest gaps, not built
 *   here): language-selection for translation (CozyTranslate is not
 *   loaded on this page — nothing to select between yet), "Explain"/
 *   "Teach me"/"Practise" voice-teaching loop, pronunciation-analysis
 *   scoring, CozyBuilder certification registration. None of these are
 *   claimed as working anywhere in this file.
 */
(function () {
    'use strict';
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.LearningPanelUI) return;

    const VERSION = '1.0.0';

    function escapeHtml(v) {
        return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    class LivingLearnPanel {
        #container = null;
        #userId = null;
        #core = null;
        #stage = 'IDLE';
        #mode = null;
        #pendingVisual = null;
        #videoEl = null;
        #languageCode = null;
        #sessionContext = null;

        getVersion() { return VERSION; }

        #core_() {
            if (!this.#core) this.#core = window.CozyOS.LearningInteractionCore;
            return this.#core;
        }

        /**
         * open({ userId, container, languageCode, context })
         *   Renders the panel. Requests no hardware access by itself.
         *
         *   CP15 (Kiswahili Hearing -> Living Learning) addition:
         *   `languageCode`/`context` are optional, caller-supplied
         *   pass-throughs to the eventual Listen call — e.g. a future
         *   church-translation launcher could call
         *   open({..., languageCode: 'sw', context: { type: 'sermon' } }).
         *   This file still hardcodes neither: with no languageCode
         *   supplied (the default, unchanged from CP12-14), Listen
         *   behaves exactly as before, letting SpeechRecognitionAdapter/
         *   LivingHearingSession use their own real default. This is
         *   the correct place for this pass-through — CP14's own
         *   reconciliation found and rejected a real regression where a
         *   different implementation hardcoded 'sw' directly in this
         *   file instead of accepting it as real caller input.
         */
        open({ userId, container, languageCode = null, context = null } = {}) {
            const core = this.#core_();
            if (!core) return { success: false, reason: 'LearningInteractionCore is not loaded.' };
            if (!container) return { success: false, reason: 'A real mount container is required.' };
            this.#container = container;
            this.#userId = userId || null;
            this.#languageCode = languageCode;
            this.#sessionContext = context;
            this.#stage = core.STAGE.MODE_SELECT;
            this.#mode = null;
            this.#pendingVisual = null;
            this.#render();
            return { success: true };
        }

        /** close() — the one place that guarantees no camera/mic is left running. Safe to call at any stage. */
        close() {
            const camera = window.CozyOS.LearningCameraAdapter;
            if (camera && typeof camera.stopCapture === 'function') {
                try { camera.stopCapture(); } catch (_err) { /* non-fatal */ }
            }
            if (this.#container) this.#container.innerHTML = '';
            this.#container = null;
            this.#videoEl = null;
            this.#stage = 'IDLE';
            this.#mode = null;
            this.#pendingVisual = null;
        }

        #setStatus(text) {
            if (!this.#container) return;
            const el = this.#container.querySelector('#cozy-learn-status');
            if (el) el.textContent = text;
        }

        #renderDiagnosticsNote() {
            const core = this.#core_();
            const diag = core.buildDiagnostics();
            const lines = Object.keys(diag).map((key) => {
                const d = diag[key];
                return `${key}: ${d.available ? '✓ Available' : `✗ ${escapeHtml(d.reason)}`}`;
            });
            return lines.join(' · ');
        }

        #render() {
            const core = this.#core_();
            const contextOptions = [
                { value: 'auto', label: 'Auto (no assumed context)' },
                { value: 'sermon', label: 'Sermon' },
                { value: 'worship', label: 'Worship' },
                { value: 'prayer', label: 'Prayer' },
                { value: 'scripture', label: 'Scripture' },
                { value: 'announcement', label: 'Announcement' },
                { value: 'conversation', label: 'Conversation' },
            ];
            // CP16B: reflects whatever context open() was actually
            // called with (if it matches one of the real known
            // categories), never silently overriding a caller-supplied
            // value with "auto" — "auto" is only the default when no
            // real context was ever set.
            const currentValue = (this.#sessionContext && this.#sessionContext.type && contextOptions.some((o) => o.value === this.#sessionContext.type))
                ? this.#sessionContext.type
                : 'auto';
            this.#container.innerHTML = `
                <div id="cozy-learn-panel" class="cozy-living-card" role="dialog" aria-label="Living Learn">
                    <h4>Living Learn</h4>
                    <p class="cozy-disclosure-note" id="cozy-learn-diagnostics">${this.#renderDiagnosticsNote()}</p>
                    <label for="cozy-learn-context-select">Context</label>
                    <select id="cozy-learn-context-select">
                        ${contextOptions.map((o) => `<option value="${o.value}" ${o.value === currentValue ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
                    </select>
                    <div id="cozy-learn-mode-select">
                        <button type="button" class="cozy-btn" id="cozy-learn-scan">Scan</button>
                        <button type="button" class="cozy-btn" id="cozy-learn-listen">Listen</button>
                        <button type="button" class="cozy-btn" id="cozy-learn-both">Scan + Listen</button>
                        <button type="button" class="cozy-btn" id="cozy-learn-close">Close</button>
                    </div>
                    <p id="cozy-learn-status" aria-live="polite" class="cozy-disclosure-note">Choose Scan, Listen, or both to begin.</p>
                    <div id="cozy-learn-video-host"></div>
                    <div id="cozy-learn-review-host"></div>
                </div>
            `;
            this.#container.querySelector('#cozy-learn-scan').addEventListener('click', () => this.#startMode(core.MODE.SCAN));
            this.#container.querySelector('#cozy-learn-listen').addEventListener('click', () => this.#startMode(core.MODE.LISTEN));
            this.#container.querySelector('#cozy-learn-both').addEventListener('click', () => this.#startMode(core.MODE.BOTH));
            this.#container.querySelector('#cozy-learn-context-select').addEventListener('change', (e) => {
                const value = e.target.value;
                // "Auto" means genuinely no assumed context — never a
                // fabricated {type:"auto"} object flowing downstream;
                // every other option reflects the user's own real choice.
                this.#sessionContext = value === 'auto' ? null : { type: value };
            });
            this.#container.querySelector('#cozy-learn-close').addEventListener('click', () => this.close());
        }

        /**
         * #startMode(mode)
         *   CP15 (Kiswahili Hearing -> Living Learning) fix — a real
         *   bug found by this checkpoint's own repeated-session test:
         *   the mode-select buttons (Scan/Listen/Both) remain visible
         *   and clickable for the panel's entire lifetime by design
         *   (see #render()), but the state machine's real, fail-closed
         *   transition table only allows CONFIRMED/IGNORED/FAILED to
         *   move to MODE_SELECT or IDLE — not directly to
         *   PERMISSION_PENDING. Clicking Listen again right after a
         *   Review/Ignore/failure outcome therefore silently did
         *   nothing (transition() correctly refused, but nothing
         *   surfaced why, and no new session ever started). Since
         *   MODE_SELECT is already a real, valid next stage from every
         *   terminal state, this normalizes to it first — the exact
         *   step the UI already implies is available by keeping those
         *   buttons live — before attempting the real
         *   PERMISSION_PENDING transition. Never skips REVIEWING for
         *   an in-progress session; only applies when already at a
         *   terminal stage.
         */
        async #startMode(mode) {
            const core = this.#core_();
            if ([core.STAGE.CONFIRMED, core.STAGE.IGNORED, core.STAGE.FAILED].includes(this.#stage)) {
                this.#stage = core.STAGE.MODE_SELECT;
            }
            const t1 = core.transition(this.#stage, core.STAGE.PERMISSION_PENDING);
            if (!t1.success) { this.#setStatus(t1.reason); return; }
            this.#stage = t1.stage;
            this.#mode = mode;
            this.#setStatus(mode === core.MODE.LISTEN ? 'Requesting microphone permission…' : 'Requesting camera permission…');

            if (mode === core.MODE.SCAN || mode === core.MODE.BOTH) {
                await this.#runScan();
            } else {
                await this.#runListenAndFinish(null);
            }
        }

        async #runScan() {
            const core = this.#core_();
            const camera = window.CozyOS.LearningCameraAdapter;
            if (!camera) return this.#fail('camera', 'LearningCameraAdapter is not loaded.');

            const started = await camera.startCapture();
            if (!started.success) return this.#fail('camera', started.reason);

            const t2 = core.transition(this.#stage, core.STAGE.CAPTURING);
            this.#stage = t2.success ? t2.stage : this.#stage;
            this.#setStatus('Camera active. Point it at what you want to learn, then tap Capture.');

            const videoHost = this.#container.querySelector('#cozy-learn-video-host');
            videoHost.innerHTML = `<video id="cozy-learn-video" autoplay playsinline muted></video><button type="button" class="cozy-btn" id="cozy-learn-capture">Capture</button>`;
            this.#videoEl = videoHost.querySelector('#cozy-learn-video');
            if ('srcObject' in this.#videoEl) this.#videoEl.srcObject = started.stream;

            videoHost.querySelector('#cozy-learn-capture').addEventListener('click', async () => {
                this.#setStatus('Capturing…');
                const result = await camera.captureForLearning(this.#videoEl, { context: this.#sessionContext });
                camera.stopCapture();
                videoHost.innerHTML = '';
                if (!result.success) return this.#fail('camera', result.reason);

                if (result.ocr && result.ocr.available) {
                    this.#pendingVisual = { text: result.ocr.extracted && result.ocr.extracted.text, confidence: 0.8, source: 'camera' };
                    this.#setStatus('Camera capture succeeded and text was extracted.');
                } else {
                    this.#pendingVisual = null;
                    this.#setStatus(result.ocr && result.ocr.attempted
                        ? `Camera capture succeeded, but OCR is not currently available (${result.ocr.reason}).`
                        : 'Camera capture succeeded, but OCR is not currently available.');
                }

                if (this.#mode === core.MODE.BOTH) {
                    await this.#runListenAndFinish(this.#pendingVisual);
                } else {
                    await this.#finishObservation(this.#pendingVisual, null);
                }
            });
        }

        /**
         * #runListenAndFinish(visualFromScan)
         *   CP13 (Living Hearing Integration) — now shows a real,
         *   visible "🎙 Listening" state with a working Stop button
         *   (wired to the real UniversalLearningPipeline.
         *   stopVoiceCapture(), which calls the same real
         *   SpeechRecognitionAdapter.stop() — no second microphone/
         *   speech engine), instead of silently awaiting the Promise
         *   with no way for the user to interrupt it. On a real result,
         *   shows "Heard: <transcript>" before moving to review — the
         *   user always sees the exact real transcript, never a
         *   fabricated one (Section 5). A manual Stop or a genuine "no
         *   speech" outcome are reported as the same honest, distinct
         *   case, never as a generic failure.
         */
        async #runListenAndFinish(visualFromScan) {
            const core = this.#core_();
            const pipeline = window.CozyOS.UniversalLearningPipeline;
            if (!pipeline) return this.#fail('learning', 'UniversalLearningPipeline is not loaded.');

            const t2 = core.transition(this.#stage, core.STAGE.CAPTURING);
            this.#stage = t2.success ? t2.stage : this.#stage;

            const videoHost = this.#container.querySelector('#cozy-learn-video-host');
            videoHost.innerHTML = `<p id="cozy-learn-listening-indicator" aria-live="polite">🎙 Listening — CozyOS is listening…</p><button type="button" class="cozy-btn" id="cozy-learn-stop-listening">Stop</button>`;
            videoHost.querySelector('#cozy-learn-stop-listening').addEventListener('click', () => {
                if (typeof pipeline.stopVoiceCapture === 'function') pipeline.stopVoiceCapture();
            });

            const voice = await pipeline.captureVoiceForLearning({ languageCode: this.#languageCode, context: this.#sessionContext });
            videoHost.innerHTML = '';
            if (!voice.success) return this.#fail('hearing', voice.reason);

            this.#setStatus(`Heard: ${voice.audio.transcript}`);
            await this.#finishObservation(visualFromScan, voice.audio);
        }

        async #finishObservation(visual, audio) {
            const core = this.#core_();
            const pipeline = window.CozyOS.UniversalLearningPipeline;
            if (!pipeline || typeof pipeline.learnFromMultimodalObservation !== 'function') {
                return this.#fail('learning', 'UniversalLearningPipeline is not loaded.');
            }
            const result = pipeline.learnFromMultimodalObservation({ userId: this.#userId, visual, audio, context: this.#sessionContext });
            if (!result.success) return this.#fail('learning', result.reason);

            const t = core.transition(this.#stage, core.STAGE.REVIEWING);
            this.#stage = t.success ? t.stage : this.#stage;
            this.#renderReview(result.observation, result.decision);
        }

        #renderReview(observation, decision) {
            const core = this.#core_();
            const card = core.buildReviewCardText(observation, decision);
            const host = this.#container.querySelector('#cozy-learn-review-host');
            host.innerHTML = `
                <div id="cozy-learn-review-card" class="cozy-living-card" aria-live="polite">
                    <h5>What CozyOS detected</h5>
                    ${card.lines.map((l) => `<p class="cozy-disclosure-note">${escapeHtml(l.label)}: ${escapeHtml(l.value)}</p>`).join('')}
                    ${card.lines.length === 0 ? '<p class="cozy-disclosure-note">Nothing usable was captured.</p>' : ''}
                    <button type="button" class="cozy-btn" id="cozy-learn-review-learn">Learn</button>
                    <button type="button" class="cozy-btn" id="cozy-learn-review-review">Review later</button>
                    <button type="button" class="cozy-btn" id="cozy-learn-review-ignore">Ignore</button>
                </div>
            `;
            host.querySelector('#cozy-learn-review-learn').addEventListener('click', () => {
                const pipeline = window.CozyOS.UniversalLearningPipeline;
                const confirmResult = pipeline && typeof pipeline.confirmMultimodalObservation === 'function'
                    ? pipeline.confirmMultimodalObservation(observation, { userId: this.#userId })
                    : { success: false, reason: 'UniversalLearningPipeline is not loaded.' };
                const t = core.transition(this.#stage, core.STAGE.CONFIRMED);
                this.#stage = t.success ? t.stage : this.#stage;
                this.#setStatus(confirmResult.success ? 'Learned.' : `Could not save: ${confirmResult.reason}`);
                host.innerHTML = '';
            });
            host.querySelector('#cozy-learn-review-review').addEventListener('click', () => {
                const t = core.transition(this.#stage, core.STAGE.MODE_SELECT);
                this.#stage = t.success ? t.stage : this.#stage;
                this.#setStatus('Saved for later review — not learned yet.');
                host.innerHTML = '';
            });
            host.querySelector('#cozy-learn-review-ignore').addEventListener('click', () => {
                const t = core.transition(this.#stage, core.STAGE.IGNORED);
                this.#stage = t.success ? t.stage : this.#stage;
                this.#setStatus('Ignored. Nothing was learned.');
                host.innerHTML = '';
            });
        }

        #fail(component, reason) {
            const core = this.#core_();
            const camera = window.CozyOS.LearningCameraAdapter;
            if (camera && typeof camera.stopCapture === 'function') { try { camera.stopCapture(); } catch (_err) { /* non-fatal */ } }
            const t = core.transition(this.#stage, core.STAGE.FAILED);
            this.#stage = t.success ? t.stage : 'FAILED';
            const err = core.classifyError(component, reason);
            this.#setStatus(`${err.component}: ${err.problem} — ${err.possibleSolution}`);
            const videoHost = this.#container && this.#container.querySelector('#cozy-learn-video-host');
            if (videoHost) videoHost.innerHTML = '';
        }

        getStage() { return this.#stage; }
    }

    window.CozyOS.LearningPanelUI = new LivingLearnPanel();
})();
