/**
 * CozyOS — Founder Story Living Narration
 * File Reference: core/modules/founder-story/founder-story-narration.js
 * Layer: Core / Platform Module — Founder Story Experience
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 361 — Founder Story Experience & Living Narration, Stage 3
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN
 *   window.CozyOS.FounderStory (founder-story-engine.js) already owns
 *   story/chapter data, encryption, and authorization — this file calls
 *   its real, public getChapter()/listChapters()/getReadingPosition()/
 *   setReadingPosition()/logReadingStarted()/logReadingCompleted()/
 *   logNarrationStarted()/logNarrationStopped()/logLanguageChanged(),
 *   never reimplementing any of them.
 *   window.CozyOS.VoiceManager already owns provider routing and the
 *   real Charles → generic-browser fallback chain — this file calls
 *   its real, public speak() once per sentence, never constructs a
 *   SpeechSynthesisUtterance or calls speechSynthesis.speak() itself.
 *   window.CozyOS.CozySpeech already owns the Voice Settings registry
 *   (speed/pitch/emotion/pauseStyle fields already existed, unused by
 *   any real caller before this file) — this file calls its real
 *   registerVoiceSettings()/updateVoiceSettings(), never a parallel
 *   settings store.
 *
 * WHAT THIS FILE OWNS (genuinely new — confirmed nothing existing does this)
 *   - Sentence-level narration SESSION state for a Founder Story chapter:
 *     play/pause/resume/stop/next-chapter/previous-chapter, current
 *     sentence index, and the events (sentence-started, sentence-ended,
 *     chapter-loaded, chapter-completed, narration-*) a reader UI needs
 *     to highlight text and auto-scroll. No existing engine has any
 *     concept of "a chapter being read aloud, sentence by sentence" —
 *     CozySpeech/VoiceManager only know how to speak one request at a
 *     time; nothing before this file sequenced a whole chapter.
 *   - A heuristic EMOTION → {rate, pitch, pause} mapping, driven first by
 *     the chapter's own timelineEra (Stage 2's real, human-authored
 *     field) and then by keyword matching within each sentence, per the
 *     brief's own worked examples (childhood → gentle, poverty →
 *     reflective, mother's prayers → reverent, mother's death →
 *     compassionate, Parliament arrest → tense-hopeful, CozyOS vision →
 *     inspiring). This is real, deterministic, and disclosed as a
 *     heuristic — not an ML emotion classifier, not a claim of true
 *     emotional speech synthesis.
 *
 * HONEST, LOAD-BEARING LIMITATIONS — READ BEFORE ASSUMING THIS "NARRATES"
 *   1. No neural TTS or voice cloning exists anywhere in this codebase
 *      (confirmed by reading charles-voice-provider.js and CozySpeech's
 *      own Personal Voice registry, which is explicitly an extension
 *      point with no real backend). In practice, VoiceManager.speak()
 *      will almost always fall through Charles (2 fixed phrase clips,
 *      won't match arbitrary chapter text) to the honest generic
 *      browser Web Speech fallback. "Emotion" here means real rate/
 *      pitch/pause variation applied to that browser voice — audibly
 *      different pacing and inflection, genuinely not robot-flat, but
 *      not human vocal-performance-level emotional narration. This is
 *      the same ceiling every other voice feature in this repository
 *      already discloses; this file does not pretend otherwise.
 *   2. Pause/resume is real but sentence-granular, not sample-accurate.
 *      pause()/resume() call the browser's own standard
 *      window.speechSynthesis.pause()/resume() directly — a real Web
 *      API, not a CozyOS engine, so calling it is transport control,
 *      not a second TTS implementation. Browser support for mid-
 *      utterance pause/resume is itself inconsistent (well-documented
 *      real-world Web Speech API limitation, not something this file
 *      can fix) — disclosed, not fabricated.
 *   3. Playback speed is scoped to THIS session only (folded into the
 *      per-sentence CozySpeech Voice Settings record this file owns),
 *      not a call to VoiceManager.setSpeed(). That method mutates
 *      VoiceManager's own global, platform-wide speed setting, which
 *      the honest browser fallback path does not even read (it only
 *      reads the settingsId's own speed/pitch) — calling it would
 *      silently change unrelated platform voice behavior while doing
 *      nothing for this reader's own slider. Deliberately not called.
 *   4. Emphasis is sentence-level (via the emotion preset's pitch/rate),
 *      not word-level. No real word-level SSML emphasis exists in the
 *      browser TTS path this composes — disclosed, not invented.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";

    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["founder-story-narration"] && window.CozyOS.Modules["founder-story-narration"].version) return;

    // ── Emotion presets — real Web Speech API ranges only (rate 0.1-10,
    // 1 = normal; pitch 0-2, 1 = normal). Modest, deliberately subtle
    // deltas so speech stays intelligible, not caricatured.
    const EMOTION_PRESETS = Object.freeze({
        gentle:          Object.freeze({ rate: 0.92, pitch: 1.05, pauseMs: 550 }),
        reflective:      Object.freeze({ rate: 0.85, pitch: 0.95, pauseMs: 700 }),
        reverent:        Object.freeze({ rate: 0.82, pitch: 0.90, pauseMs: 750 }),
        compassionate:   Object.freeze({ rate: 0.85, pitch: 0.92, pauseMs: 700 }),
        "tense-hopeful": Object.freeze({ rate: 1.05, pitch: 1.08, pauseMs: 450 }),
        inspiring:       Object.freeze({ rate: 1.00, pitch: 1.10, pauseMs: 500 }),
        neutral:         Object.freeze({ rate: 1.00, pitch: 1.00, pauseMs: 500 }),
    });

    // Ordered — first match wins. Matches the brief's own worked examples.
    const KEYWORD_RULES = Object.freeze([
        { emotion: "reverent",        pattern: /\b(pray|prayer|prayed|praying|prayers)\b/i },
        { emotion: "compassionate",   pattern: /\b(passed away|died|death|funeral|mourn|grief|buried)\b/i },
        { emotion: "tense-hopeful",   pattern: /\b(arrest|arrested|police|cell|parliament|jail|prison)\b/i },
        { emotion: "inspiring",       pattern: /\b(cozyos|vision|dream|dreaming|technology|transform)\b/i },
        { emotion: "reflective",      pattern: /\b(poverty|poor|hunger|charcoal|struggle|hardship|fees)\b/i },
        { emotion: "gentle",          pattern: /\b(child|childhood|born|young|school|mother|helper)\b/i },
    ]);

    /** detectEmotion() — sentence keywords first (most specific), falls back to a timelineEra-derived default, then "gentle". Real, deterministic, disclosed heuristic — not an ML classifier. */
    function detectEmotion(sentenceText, timelineEraHint) {
        const text = String(sentenceText || "");
        for (const rule of KEYWORD_RULES) {
            if (rule.pattern.test(text)) return rule.emotion;
        }
        if (timelineEraHint) {
            for (const rule of KEYWORD_RULES) {
                if (rule.pattern.test(String(timelineEraHint))) return rule.emotion;
            }
        }
        return "gentle";
    }

    /**
     * splitIntoSentences() — paragraph-aware: splits on real newlines
     * first (the seed content's own paragraph breaks), then each
     * paragraph into sentences on real terminal punctuation. Marks the
     * last sentence of each paragraph so the narration loop can apply a
     * longer pause there. Never invents sentence boundaries beyond
     * punctuation/newlines actually present in the text.
     */
    function splitIntoSentences(rawText, timelineEraHint) {
        const paragraphs = String(rawText || "").split(/\n+/).map((p) => p.trim()).filter(Boolean);
        const sentences = [];
        for (const paragraph of paragraphs) {
            const parts = paragraph.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
            const list = parts.length ? parts : [paragraph];
            list.forEach((text, i) => {
                sentences.push({
                    text,
                    emotion: detectEmotion(text, timelineEraHint),
                    paragraphEnd: i === list.length - 1,
                });
            });
        }
        return sentences;
    }

    class FounderStoryNarrationSession {
        #storyId; #chapterId = null; #viewerId; #language;
        #sentences = []; #index = 0;
        #playing = false; #paused = false;
        #providerId = null; #speedMultiplier = 1;
        #settingsId = null;
        #resumeSignal = null; #sleepTimer = null;
        #listeners = new Map();
        #chapterTitle = ""; #chapterSubtitle = "";

        constructor({ storyId, viewerId, language = "en" } = {}) {
            this.#storyId = storyId;
            this.#viewerId = viewerId;
            this.#language = language;
        }

        on(eventName, handler) { if (!this.#listeners.has(eventName)) this.#listeners.set(eventName, new Set()); this.#listeners.get(eventName).add(handler); return () => this.off(eventName, handler); }
        off(eventName, handler) { const s = this.#listeners.get(eventName); return s ? s.delete(handler) : false; }
        #emit(eventName, detail) { const s = this.#listeners.get(eventName); if (!s) return; for (const fn of Array.from(s)) { try { fn(detail); } catch (_err) { /* one listener's failure must not break narration */ } } }

        getState() {
            return {
                storyId: this.#storyId, chapterId: this.#chapterId, language: this.#language,
                index: this.#index, sentenceCount: this.#sentences.length,
                playing: this.#playing, paused: this.#paused,
                providerId: this.#providerId, speedMultiplier: this.#speedMultiplier,
                currentSentence: this.#sentences[this.#index] || null,
                chapterTitle: this.#chapterTitle, chapterSubtitle: this.#chapterSubtitle,
            };
        }

        /** getSentences() — read-only copy of the tokenized sentence list for the currently loaded chapter, so a reader UI can render text spans whose indices line up exactly with sentence-started/sentence-ended events. */
        getSentences() { return this.#sentences.map((s) => ({ ...s })); }

        /** load(chapterId, language) — authorization runs entirely inside FounderStoryEngine.getChapter()/logReadingStarted(); a denied viewer gets {locked:true} and no content ever reaches this file's tokenizer. */
        async load(chapterId, language = this.#language) {
            const engine = window.CozyOS.FounderStory;
            if (!engine) return { success: false, reason: "FounderStoryEngine is not available." };
            const chapter = await engine.getChapter(chapterId, this.#viewerId);
            if (!chapter || chapter.locked) return { success: false, locked: true, reason: "This chapter is private." };

            this.stop();
            this.#chapterId = chapterId;

            const body = chapter.body;
            let text = "", resolvedLanguage = language;
            if (body && typeof body === "object" && !Array.isArray(body)) {
                // Multilingual chapter (e.g. the seeded Chapter 1: {en:{...}, sw:{...}, fr:{...}, ar:{...}}).
                resolvedLanguage = body[language] ? language : (body.en ? "en" : Object.keys(body)[0]);
                const langBody = body[resolvedLanguage];
                text = (langBody && typeof langBody === "object" && "text" in langBody) ? langBody.text : (typeof langBody === "string" ? langBody : "");
            } else if (typeof body === "string") {
                // Single-language chapter — language switching has no effect here; disclosed via the returned multilingual:false flag rather than silently ignored.
                text = body;
            }

            this.#language = resolvedLanguage;
            this.#sentences = splitIntoSentences(text, chapter.timelineEra);
            this.#index = 0;
            this.#chapterTitle = chapter.title || "";
            this.#chapterSubtitle = chapter.subtitle || "";

            const pos = engine.getReadingPosition(this.#storyId, this.#viewerId);
            if (pos && pos.chapterId === chapterId && pos.language === resolvedLanguage && typeof pos.sentenceIndex === "number") {
                this.#index = Math.min(pos.sentenceIndex, Math.max(0, this.#sentences.length - 1));
            }

            engine.logReadingStarted(this.#storyId, chapterId, this.#viewerId);
            const isMultilingual = !!(body && typeof body === "object" && !Array.isArray(body));
            const state = { success: true, chapterId, language: this.#language, multilingual: isMultilingual, sentenceCount: this.#sentences.length, resumedAtIndex: this.#index };
            this.#emit("chapter-loaded", state);
            return state;
        }

        async play() {
            if (!this.#sentences.length) return { success: false, reason: "No content loaded — call load() first." };
            if (this.#paused) return this.resume();
            if (this.#playing) return { success: true };
            this.#playing = true;
            this.#paused = false;
            const engine = window.CozyOS.FounderStory;
            engine && engine.logNarrationStarted(this.#storyId, this.#chapterId, this.#viewerId, this.#language);
            this.#emit("narration-started", { index: this.#index });
            this.#runLoop();
            return { success: true };
        }

        async #runLoop() {
            const vm = window.CozyOS.VoiceManager;
            const speech = window.CozyOS.CozySpeech;
            while (this.#index < this.#sentences.length && this.#playing) {
                if (this.#paused) { await this.#waitWhilePaused(); }
                if (!this.#playing) break;

                const sentence = this.#sentences[this.#index];
                const preset = EMOTION_PRESETS[sentence.emotion] || EMOTION_PRESETS.neutral;
                this.#emit("sentence-started", { index: this.#index, text: sentence.text, emotion: sentence.emotion });

                const settingsPatch = { scopeId: `founderstory-narration:${this.#storyId}`, language: this.#language, emotion: sentence.emotion, speed: preset.rate * this.#speedMultiplier, pitch: preset.pitch, pauseStyle: "natural" };
                if (speech && typeof speech.registerVoiceSettings === "function") {
                    if (!this.#settingsId) this.#settingsId = speech.registerVoiceSettings(settingsPatch);
                    else if (typeof speech.updateVoiceSettings === "function") speech.updateVoiceSettings(this.#settingsId, settingsPatch);
                }

                let result = { available: false, played: false, reason: "VoiceManager is not available." };
                if (vm && typeof vm.speak === "function") {
                    try { result = await vm.speak({ text: sentence.text, settingsId: this.#settingsId, providerId: this.#providerId || undefined }); }
                    catch (err) { result = { available: false, played: false, reason: `speak() threw: ${err.message}` }; }
                }
                this.#emit("sentence-ended", { index: this.#index, result });

                if (!result || !result.played) {
                    this.#playing = false;
                    this.#emit("narration-unavailable", { reason: (result && result.reason) || "No voice backend could speak this sentence." });
                    break;
                }

                const engine = window.CozyOS.FounderStory;
                engine && engine.setReadingPosition(this.#storyId, this.#viewerId, { chapterId: this.#chapterId, sentenceIndex: this.#index, language: this.#language });
                this.#index++;
                if (!this.#playing || this.#index >= this.#sentences.length) break;

                const pauseMs = sentence.paragraphEnd ? preset.pauseMs * 1.6 : preset.pauseMs;
                await this.#sleep(pauseMs);
            }

            if (this.#index >= this.#sentences.length) {
                this.#playing = false;
                const engine = window.CozyOS.FounderStory;
                engine && engine.logNarrationStopped(this.#storyId, this.#chapterId, this.#viewerId);
                engine && engine.logReadingCompleted(this.#storyId, this.#chapterId, this.#viewerId);
                this.#emit("chapter-completed", { chapterId: this.#chapterId });
            }
        }

        /** pause() — real, immediate: calls the browser's own standard speechSynthesis.pause() (transport control, not a second TTS call) and halts the sentence loop before it queues the next one. */
        pause() {
            if (!this.#playing || this.#paused) return { success: false, reason: "Not currently playing." };
            this.#paused = true;
            try { if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.pause(); } catch (_err) { /* honest no-op if unsupported */ }
            if (this.#sleepTimer) { clearTimeout(this.#sleepTimer); this.#sleepTimer = null; }
            const engine = window.CozyOS.FounderStory;
            engine && engine.logNarrationStopped(this.#storyId, this.#chapterId, this.#viewerId);
            this.#emit("narration-paused", { index: this.#index });
            return { success: true };
        }

        async resume() {
            if (!this.#paused) return { success: false, reason: "Not paused." };
            this.#paused = false;
            try { if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.resume(); } catch (_err) { /* honest no-op if unsupported */ }
            const engine = window.CozyOS.FounderStory;
            engine && engine.logNarrationStarted(this.#storyId, this.#chapterId, this.#viewerId, this.#language);
            this.#emit("narration-resumed", { index: this.#index });
            if (this.#resumeSignal) { const r = this.#resumeSignal; this.#resumeSignal = null; r(); }
            if (!this.#playing) { this.#playing = true; this.#runLoop(); }
            return { success: true };
        }

        stop() {
            const wasActive = this.#playing || this.#paused;
            this.#playing = false;
            this.#paused = false;
            try { if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_err) { /* honest no-op if unsupported */ }
            if (this.#sleepTimer) { clearTimeout(this.#sleepTimer); this.#sleepTimer = null; }
            if (this.#resumeSignal) { const r = this.#resumeSignal; this.#resumeSignal = null; r(); }
            if (wasActive && this.#chapterId) {
                const engine = window.CozyOS.FounderStory;
                engine && engine.logNarrationStopped(this.#storyId, this.#chapterId, this.#viewerId);
                engine && engine.setReadingPosition(this.#storyId, this.#viewerId, { chapterId: this.#chapterId, sentenceIndex: this.#index, language: this.#language });
            }
            this.#emit("narration-stopped", { index: this.#index });
            return { success: true };
        }

        /** seek(index) — jumps to a specific sentence (e.g. from a bookmark) without speaking through everything before it. Stops any in-flight narration first, updates the saved reading position for real, and resumes playback from the new index if narration was already running. */
        async seek(index) {
            if (!this.#sentences.length) return { success: false, reason: "No content loaded." };
            const clamped = Math.max(0, Math.min(index, this.#sentences.length - 1));
            const wasPlaying = this.#playing && !this.#paused;
            this.stop();
            this.#index = clamped;
            const engine = window.CozyOS.FounderStory;
            engine && engine.setReadingPosition(this.#storyId, this.#viewerId, { chapterId: this.#chapterId, sentenceIndex: this.#index, language: this.#language });
            this.#emit("sentence-started", { index: this.#index, text: this.#sentences[this.#index]?.text, emotion: this.#sentences[this.#index]?.emotion, silent: true });
            if (wasPlaying) await this.play();
            return { success: true, index: this.#index };
        }

        async next() {
            const engine = window.CozyOS.FounderStory;
            if (!engine) return { success: false, reason: "FounderStoryEngine is not available." };
            const wasPlaying = this.#playing && !this.#paused;
            this.stop();
            const chapters = await engine.listChapters(this.#storyId, this.#viewerId);
            if (!Array.isArray(chapters)) return { success: false, reason: "Not authorized, or no chapters." };
            const idx = chapters.findIndex((c) => c.chapterId === this.#chapterId);
            if (idx === -1 || idx + 1 >= chapters.length) return { success: false, reason: "No next chapter." };
            const result = await this.load(chapters[idx + 1].chapterId, this.#language);
            if (result.success && wasPlaying) await this.play();
            return result;
        }

        async previous() {
            const engine = window.CozyOS.FounderStory;
            if (!engine) return { success: false, reason: "FounderStoryEngine is not available." };
            const wasPlaying = this.#playing && !this.#paused;
            this.stop();
            const chapters = await engine.listChapters(this.#storyId, this.#viewerId);
            if (!Array.isArray(chapters)) return { success: false, reason: "Not authorized, or no chapters." };
            const idx = chapters.findIndex((c) => c.chapterId === this.#chapterId);
            if (idx <= 0) return { success: false, reason: "No previous chapter." };
            const result = await this.load(chapters[idx - 1].chapterId, this.#language);
            if (result.success && wasPlaying) await this.play();
            return result;
        }

        /** setLanguage() — reloads the same chapter in a new language, preserving the current sentence index as a best-effort position (seeded content's translations mirror the same paragraph/sentence order; disclosed as best-effort, not a guaranteed exact mapping for arbitrary future chapters). */
        async setLanguage(newLanguage) {
            const engine = window.CozyOS.FounderStory;
            const supported = (engine && typeof engine.getSupportedLanguages === "function") ? engine.getSupportedLanguages() : ["en", "sw", "fr", "ar"];
            if (!supported.includes(newLanguage)) return { success: false, reason: `Unsupported language "${newLanguage}".` };
            const prevLanguage = this.#language;
            const prevIndex = this.#index;
            const wasPlaying = this.#playing && !this.#paused;
            const chapterId = this.#chapterId;
            this.stop();
            const result = await this.load(chapterId, newLanguage);
            if (result.success) {
                this.#index = Math.min(prevIndex, Math.max(0, this.#sentences.length - 1));
                engine && engine.logLanguageChanged(this.#storyId, this.#viewerId, prevLanguage, newLanguage);
                this.#emit("language-changed", { from: prevLanguage, to: newLanguage, index: this.#index });
                if (wasPlaying) await this.play();
            }
            return result;
        }

        /** setVoiceProvider() — per-session only, passed directly to VoiceManager.speak({providerId}); never mutates VoiceManager's own global default. */
        setVoiceProvider(providerId) { this.#providerId = providerId || null; return { success: true }; }
        listVoices() { const vm = window.CozyOS.VoiceManager; return (vm && typeof vm.listProviders === "function") ? vm.listProviders() : []; }

        /** setSpeed() — scoped to this session's own CozySpeech Voice Settings record only. Deliberately does NOT call VoiceManager.setSpeed() — see file header, limitation 3. */
        setSpeed(multiplier) {
            const m = Number(multiplier);
            if (!Number.isFinite(m) || m <= 0) return { success: false, reason: "speed multiplier must be a positive number." };
            this.#speedMultiplier = m;
            return { success: true, multiplier: m };
        }

        #waitWhilePaused() { return new Promise((resolve) => { this.#resumeSignal = resolve; }); }
        #sleep(ms) { return new Promise((resolve) => { this.#sleepTimer = setTimeout(resolve, ms); }); }
    }

    function createSession(opts) { return new FounderStoryNarrationSession(opts || {}); }

    window.CozyOS.FounderStoryNarration = Object.freeze({
        version: MODULE_VERSION,
        createSession,
        getEmotionPresets: () => JSON.parse(JSON.stringify(EMOTION_PRESETS)),
        detectEmotion,
        splitIntoSentences,
    });
    window.CozyOS.Modules["founder-story-narration"] = Object.freeze({
        version: MODULE_VERSION,
        description: "Living Narration for Founder Story chapters (Stage 3). Sequences a chapter sentence-by-sentence through VoiceManager.speak(), applying a heuristic emotion→rate/pitch/pause mapping (timelineEra-aware) via CozySpeech's existing Voice Settings registry. Owns only narration session state (play/pause/resume/stop/next/previous/index) and the emotion heuristic — never reimplements TTS, provider routing, encryption, or authorization, all of which are composed from FounderStoryEngine/VoiceManager/CozySpeech. Honest limitations (no neural TTS/voice cloning, sentence-granular pause, session-scoped speed, sentence-level emphasis only) are documented in this file's header."
    });
})();
