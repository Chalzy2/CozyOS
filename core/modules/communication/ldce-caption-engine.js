/**
 * CozyOS — Living Direct Communication Engine (LDCE)
 * Live Captions & Text Translation
 * File Reference: core/modules/communication/ldce-caption-engine.js
 * Layer: Core / Platform Module — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 362 — Living Direct Communication Engine, Stage 3
 *
 * SCOPE (per explicit instruction — long-term LDCE vision doc is
 * roadmap only, NOT this stage's build target)
 *   Real, honest, TEXT-ONLY captions and translation. Composes:
 *   - window.CozyOS.SpeechRecognitionAdapter — real browser ASR for the
 *     LOCAL participant's own speech (singleton instance, confirmed by
 *     reading its source — one active recognition per browser tab,
 *     correct for "caption my own speech locally").
 *   - window.CozyOS.SpeechTranslationAdapter — already real, already
 *     wired (dashboard.html), never previously initialized anywhere
 *     (confirmed: no existing caller invokes its idempotent init()).
 *     This file calls it once. translateText() already honestly
 *     returns isReal:false when no translator is registered — never
 *     fabricates translated text.
 *   - window.CozyOS.LDCESessionEngine (Stage 1/2) — participant roster
 *     (language preference per participant, already real), getSession()
 *     for the conversationId.
 *   - window.CozyOS.CozyConversation — addTranscriptSegment() reused
 *     directly for the real transcript record (captions ARE the
 *     transcript; no second store).
 *
 *   NOT IN SCOPE (explicitly deferred per the long-term vision doc):
 *   speech-to-speech synthesis, emotion preservation, voice cloning,
 *   contextual pronoun resolution, conversation "AI memory". None of
 *   these are fabricated here.
 *
 * HONEST LIMITATIONS
 *   1. Translation is real only when a browser natively exposes the
 *      experimental on-device Translator API (confirmed rare — same
 *      finding as every prior stage). Otherwise every translated
 *      caption honestly reports unavailable; the ORIGINAL-language
 *      caption (from real ASR) is unaffected and always available
 *      wherever SpeechRecognition itself is supported.
 *   2. One active local recognition per browser tab (the adapter's own
 *      singleton design, unchanged) — this engine surfaces that
 *      constraint honestly rather than fabricating concurrency.
 *   3. pause()/resume() inherit the adapter's own honest limitation
 *      (stop/start, not true mid-utterance pause).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["ldce-caption-engine"] && window.CozyOS.Modules["ldce-caption-engine"].version) return;

    class LDCECaptionEngine {
        #activeSpeaker = null; // { sessionId, speakerUserId, sourceLanguage }
        #translationSessions = new Map(); // "src>tgt" -> translationSessionId
        #listeners = new Map();
        #initialized = false;

        on(e, h) { if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); return s ? s.delete(h) : false; }
        #emit(e, d) { const s = this.#listeners.get(e); if (!s) return; for (const fn of Array.from(s)) { try { fn(d); } catch (_err) { /* non-fatal */ } } }

        getVersion() { return MODULE_VERSION; }

        /** #ensureInit() — calls SpeechTranslationAdapter.init() exactly once (idempotent per its own doc). Real composition of an existing, never-before-called method — not a new init pathway. */
        async #ensureInit() {
            if (this.#initialized) return;
            this.#initialized = true;
            const adapter = window.CozyOS.SpeechTranslationAdapter;
            if (adapter && typeof adapter.init === "function") { try { await adapter.init(); } catch (_err) { /* honest no-op if it fails to detect a provider */ } }
        }

        async #getOrCreateTranslationSession(sourceLanguage, targetLanguage) {
            const key = `${sourceLanguage}>${targetLanguage}`;
            if (this.#translationSessions.has(key)) return this.#translationSessions.get(key);
            const adapter = window.CozyOS.SpeechTranslationAdapter;
            if (!adapter || typeof adapter.startTranslationSession !== "function") return null;
            try {
                const sessionId = adapter.startTranslationSession({ sourceLanguage, targetLanguage });
                this.#translationSessions.set(key, sessionId);
                return sessionId;
            } catch (_err) { return null; }
        }

        /**
         * startCaptioning(sessionId, speakerUserId, {sourceLanguage}) —
         * real ASR via SpeechRecognitionAdapter. Requires the caller to
         * already be a joined participant (checked via LDCESessionEngine,
         * never bypassed). Fails closed with the adapter's own honest
         * reason if this browser has no SpeechRecognition, or if a
         * caption session is already active in this tab.
         */
        async startCaptioning(sessionId, speakerUserId, { sourceLanguage = "en" } = {}) {
            const ldce = window.CozyOS.LDCESessionEngine;
            if (!ldce || !ldce.getParticipant(sessionId, speakerUserId, speakerUserId)) return { success: false, reason: "Not a joined participant of this session." };
            const asr = window.CozyOS.SpeechRecognitionAdapter;
            if (!asr) return { success: false, reason: "SpeechRecognitionAdapter is not available." };
            if (asr.isActive()) return { success: false, reason: "A caption session is already active in this browser tab. Call stopCaptioning() first." };
            await this.#ensureInit();

            this.#activeSpeaker = { sessionId, speakerUserId, sourceLanguage };
            asr.on("onFinalResult", (payload) => this.#handleFinal(payload));
            asr.on("onPartialResult", (payload) => this.#emit("caption-partial", { sessionId, speakerUserId, text: payload.transcript }));
            asr.on("onError", (payload) => this.#emit("caption-error", { sessionId, speakerUserId, reason: payload.reason || payload.error }));

            const result = asr.start({ languageCode: sourceLanguage, continuous: true, interimResults: true, sessionId });
            if (!result.success) { this.#activeSpeaker = null; return result; }
            this.#emit("captioning-started", { sessionId, speakerUserId, sourceLanguage });
            return { success: true };
        }

        stopCaptioning(sessionId, speakerUserId) {
            const asr = window.CozyOS.SpeechRecognitionAdapter;
            if (asr) asr.stop();
            this.#activeSpeaker = null;
            this.#emit("captioning-stopped", { sessionId, speakerUserId });
            return { success: true };
        }

        /** #handleFinal() — logs the real original-language caption to CozyConversation's own transcript (no second store), then attempts real translation into every OTHER language currently represented among joined participants. */
        async #handleFinal(payload) {
            const active = this.#activeSpeaker;
            if (!active) return;
            const { sessionId, speakerUserId, sourceLanguage } = active;
            const ldce = window.CozyOS.LDCESessionEngine;
            const session = ldce ? ldce.getSession(sessionId) : null;
            const conversation = window.CozyOS.CozyConversation;
            if (session && conversation && typeof conversation.addTranscriptSegment === "function") {
                conversation.addTranscriptSegment(session.conversationId, { speaker: speakerUserId, text: payload.transcript, languageCode: sourceLanguage, source: "ldce-caption-original" });
            }
            this.#emit("caption-final", { sessionId, speakerUserId, sourceLanguage, text: payload.transcript });

            const roster = ldce ? ldce.listParticipants(sessionId, speakerUserId) : [];
            const targetLanguages = Array.from(new Set(roster.map((p) => p.language).filter((lang) => lang && lang !== sourceLanguage)));
            await Promise.all(targetLanguages.map(async (targetLanguage) => {
                const txSessionId = await this.#getOrCreateTranslationSession(sourceLanguage, targetLanguage);
                const adapter = window.CozyOS.SpeechTranslationAdapter;
                if (!adapter) {
                    this.#emit("caption-translated", { sessionId, speakerUserId, targetLanguage, isReal: false, reason: "SpeechTranslationAdapter is not available." });
                    return;
                }

                let result;
                try {
                    result = await adapter.translateText(txSessionId, payload.transcript, { sourceLanguage, targetLanguage });
                } catch (err) {
                    result = { isReal: false, reason: err.message || "translateText threw." };
                }

                if (result.isReal) {
                    if (session && conversation) {
                        conversation.addTranscriptSegment(session.conversationId, {
                            speaker: speakerUserId,
                            text: result.translatedText,
                            languageCode: targetLanguage,
                            source: "ldce-caption-translated"
                        });
                    }
                    this.#emit("caption-translated", {
                        sessionId,
                        speakerUserId,
                        targetLanguage,
                        isReal: true,
                        text: result.translatedText
                    });
                } else {
                    this.#emit("caption-translated", {
                        sessionId,
                        speakerUserId,
                        targetLanguage,
                        isReal: false,
                        reason: result.reason
                    });
                }
            }));
        }

        /** getCaptionAvailability() — honest Current Status / What's Needed Next (Governance Principle 12), never merged into one ambiguous flag. */
        getCaptionAvailability() {
            const asr = window.CozyOS.SpeechRecognitionAdapter;
            const translateAdapter = window.CozyOS.SpeechTranslationAdapter;
            const caps = translateAdapter && typeof translateAdapter.getCapabilities === "function" ? translateAdapter.getCapabilities() : { supportsTranslation: false };
            return {
                originalCaptions: { available: !!(asr && asr.isReal()), whatsNeeded: asr && asr.isReal() ? null : "This browser has no SpeechRecognition/webkitSpeechRecognition API." },
                translatedCaptions: { available: !!caps.supportsTranslation, whatsNeeded: caps.supportsTranslation ? null : "No on-device Translator API detected in this browser — no cloud translation provider is bundled in this milestone." }
            };
        }

        getDiagnosticsReport() {
            return { moduleVersion: MODULE_VERSION, activeSpeaker: this.#activeSpeaker ? { ...this.#activeSpeaker } : null, translationSessionCount: this.#translationSessions.size };
        }
    }

    window.CozyOS.LDCECaptionEngine = new LDCECaptionEngine();
    window.CozyOS.Modules["ldce-caption-engine"] = Object.freeze({
        version: MODULE_VERSION,
        description: "LDCE Stage 3 — real, text-only live captions (SpeechRecognitionAdapter) and text translation (SpeechTranslationAdapter/CozyTranslate, real only when a browser Translator API exists — never fabricated). Reuses CozyConversation's transcript as the one real store. Never owns session lifecycle, ASR, or translation logic itself — pure composition. Speech-to-speech synthesis, emotion preservation, voice cloning, and conversation memory are explicitly out of scope this stage (long-term LDCE vision doc, not a build instruction)."
    });
})();
