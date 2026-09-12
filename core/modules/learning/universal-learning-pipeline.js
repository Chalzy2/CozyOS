/**
 * CozyAI Universal Learning Pipeline — core/modules/learning/universal-learning-pipeline.js (M322)
 *
 * OWNERSHIP: composes existing, real engines via Living.serviceContracts
 * (M315) - never a second learning system, never a second speech/OCR/
 * verification implementation.
 *
 * REAL AUDIT RESULTS (confirmed before writing this file):
 *   REAL and composed: SpeechRecognitionAdapter (Source 1: Voice - real
 *   speech-to-text, event-driven start()/stop()/on()), CozyMemory
 *   (Knowledge Memory storage), LivingLanguageVerification (the real,
 *   existing L1-L4 confidence engine - the closest genuine match to the
 *   requested Unknown->Pending->Confirmed->Expert->Trusted verification
 *   layer; reused rather than building a second verification system),
 *   OCREngine (Source 3/5: OCR/Camera - real code exists but is itself
 *   a documented stub with no executable pipeline yet, and is not
 *   currently loaded in dashboard.html - both facts disclosed).
 *
 *   FULLY REAL, no engine needed: Source 6 (Questions) and Source 7
 *   (User Corrections) - direct user input flows composing only
 *   LivingLanguageVerification + CozyMemory, both real.
 *
 *   HONEST GAPS, not fabricated: Source 2 (Audiobook chapter/topic
 *   detection), Source 4 (PDF/DOCX/EPUB document parser - confirmed no
 *   DocumentParser/PDFParser exists anywhere), Source 5's object
 *   detection (beyond OCR text), Source 8 (screen-reading), Source 9
 *   (internet research), Source 11 (expert-role verification tiers
 *   beyond LivingLanguageVerification's existing L4 admin-gated
 *   review), Source 12 (offline learning - not wired to CozyOffline
 *   here).
 *
 * MULTIMODAL LEARNING ADDITION (real audit, confirmed before extending
 * this file): learnFromVoice() and learnFromOCR() above are each
 * independent, single-modality flows — neither ever compares a visual
 * observation against an audio observation for the same lesson item.
 * That comparison ("does what the camera saw match what the
 * microphone heard") is the one genuinely missing coordination piece
 * a Living Multimodal Learning request specifically needs, and it does
 * not belong inside LivingLanguageVerification (that engine's real
 * algorithm answers a different question — whether multiple DISTINCT
 * real contributors across regions independently confirm the same
 * meaning — not single-instant cross-modal agreement). So the new
 * cross-modal matching itself lives in the new, pure
 * core/modules/learning/multimodal-observation-core.js, and
 * learnFromMultimodalObservation()/confirmMultimodalObservation()
 * below only ever COMPOSE it plus the existing real engines — no
 * second learning, verification, OCR, or speech system was created.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.UniversalLearningPipeline) return;

    class CozyUniversalLearningPipeline {
        #declareRealCapabilities(living) {
            if (living.serviceContracts.listDeclared().some(d => d.capabilityName === "voice-learning")) return;
            if (window.CozyOS.SpeechRecognitionAdapter) living.serviceContracts.declare("voice-learning", "SpeechRecognitionAdapter", "Real speech-to-text capture.");
            if (window.CozyOS.OCREngine) living.serviceContracts.declare("ocr-learning", "OCREngine", "Extract text from scanned images (currently a stub - see honest gap).");
            if (window.CozyOS.LivingLanguageVerification) living.serviceContracts.declare("verification", "LivingLanguageVerification", "L1-L4 confidence-based knowledge verification.");
            if (window.CozyOS.CozyMemory) living.serviceContracts.declare("knowledge-memory", "CozyMemory", "Persist learned knowledge.");
        }

        async learnFromQuestion(userId, question, explanation, region = "unspecified") {
            const living = window.CozyOS.Living;
            if (!living) return { success: false, reason: "Living is not loaded." };
            this.#declareRealCapabilities(living);

            const result = living.serviceContracts.require("universal-learning", ["verification", "knowledge-memory"]);
            if (!result.allSatisfied) return { success: false, reason: `Missing real capabilities: ${result.missing.join(", ")}.` };

            const verifier = result.resolved.verification.provider;
            if (typeof verifier.submitObservation !== "function") return { success: false, reason: "LivingLanguageVerification has no real submitObservation() method." };
            const submission = verifier.submitObservation(question, explanation, { region, submittedBy: userId });
            return { success: true, question, submission };
        }

        async learnFromCorrection(userId, priorClaim, correction, region = "unspecified") {
            const living = window.CozyOS.Living;
            if (!living) return { success: false, reason: "Living is not loaded." };
            this.#declareRealCapabilities(living);

            const result = living.serviceContracts.require("universal-learning", ["verification"]);
            if (!result.allSatisfied) return { success: false, reason: `Missing real capabilities: ${result.missing.join(", ")}.` };

            const verifier = result.resolved.verification.provider;
            if (typeof verifier.submitObservation !== "function") return { success: false, reason: "LivingLanguageVerification has no real submitObservation() method." };
            const submission = verifier.submitObservation(priorClaim, correction, { region, submittedBy: userId, context: "correction" });
            return { success: true, priorClaim, correction, submission };
        }

        /**
         * learnFromVoice(audioConfig)
         *   CP14 MERGE (reconciling two independent lines of work — see
         *   docs/checkpoints/CP14-MERGE-KISWAHILI-HEARING-CHECKPOINT.md
         *   for the full comparison): this method's external contract
         *   (resolves {success, transcript, confidence, sessionId} or
         *   {success:false, reason}) is unchanged, so
         *   captureVoiceForLearning()/learnFromCameraAndVoice() below and
         *   learning-panel-ui.js needed zero changes for this merge.
         *
         *   What changed internally: this used to talk to
         *   SpeechRecognitionAdapter directly (bypassing CozyHearing/
         *   AudioEngine entirely). It now delegates to the real
         *   window.CozyOS.LivingHearingSession (core/modules/hearing/
         *   living-hearing-session.js — a genuinely universal, language-
         *   agnostic coordinator, not specific to any one language),
         *   which registers its own adapter listeners exactly once ever
         *   and routes real microphone permission through CozyHearing/
         *   AudioEngine first — closing a real gap (Listen previously
         *   never touched the actual Hearing engine at all).
         *
         *   MERGE FIX — real regression found and fixed here: the
         *   version of this method that first introduced
         *   LivingHearingSession only supplied onFinalResult/onError
         *   callbacks to session.start(), never onStop. Confirmed by
         *   inspection: this reintroduced the exact hang-on-manual-stop
         *   bug CP13 (Living Hearing Integration) had already fixed at
         *   the bare-adapter level — a Stop button calling
         *   stopVoiceCapture() would trigger the real onStop event, which
         *   nothing was listening for, leaving this Promise pending
         *   forever. Fixed by adding a real onStop handler that uses the
         *   session's own, already-tested `wasExpectedStop` flag (see
         *   living-hearing-session.test.js) to distinguish a genuine
         *   user-initiated Stop from an unexpected disconnect, rather
         *   than reporting both identically.
         */
        async learnFromVoice(audioConfig = {}) {
            const living = window.CozyOS.Living;
            if (!living) return { success: false, reason: "Living is not loaded." };
            this.#declareRealCapabilities(living);
            const result = living.serviceContracts.require("universal-learning", ["voice-learning"]);
            if (!result.allSatisfied) return { success: false, reason: result.resolved["voice-learning"].reason };

            const session = window.CozyOS.LivingHearingSession;
            if (!session) return { success: false, reason: "LivingHearingSession is not loaded." };

            return new Promise((resolve) => {
                let settled = false;
                function finish(value) {
                    if (settled) return;
                    settled = true;
                    resolve(value);
                }
                session.start(audioConfig, {
                    onFinalResult: (payload) => {
                        session.stop();
                        finish({ success: true, transcript: payload.transcript, confidence: payload.confidence, sessionId: payload.sessionId });
                    },
                    onError: (err) => {
                        session.stop();
                        finish({ success: false, reason: `Real speech recognition error: ${(err && (err.error || err.reason)) || JSON.stringify(err)}` });
                    },
                    // MERGE FIX (see header above): without this, a real
                    // Stop or an unexpected disconnect left this Promise
                    // pending forever. wasExpectedStop is real, measured
                    // by the adapter itself (see speech-recognition-
                    // adapter.js's own #stopWasRequested) — never guessed.
                    onStop: (p) => {
                        finish({ success: false, reason: (p && p.wasExpectedStop) ? "Stopped by user." : "No speech detected." });
                    },
                }).then((startResult) => {
                    if (!startResult.success) finish({ success: false, reason: startResult.reason });
                });
            });
        }

        /**
         * stopVoiceCapture()
         *   CP13 (Living Hearing Integration) addition, updated in the
         *   CP14 merge to call the real LivingHearingSession.stop()
         *   (full teardown: stops recognition AND releases the
         *   microphone via CozyHearing) rather than the bare adapter's
         *   stop() alone — the more complete real path now that
         *   learnFromVoice() routes through the session coordinator.
         *   No second microphone/speech engine — this is the one real
         *   session, stopped the one real way.
         */
        stopVoiceCapture() {
            const session = window.CozyOS.LivingHearingSession;
            if (!session || typeof session.stop !== "function") return { success: false, reason: "LivingHearingSession is not loaded." };
            return session.stop();
        }

        learnFromAudiobook() { return { success: false, reason: "No real audiobook chapter/topic-detection engine exists in this repository." }; }
        learnFromDocument() { return { success: false, reason: "No real PDF/DOCX/EPUB document parser exists in this repository." }; }
        learnFromCameraObject() { return { success: false, reason: "OCR text extraction may be available (see learnFromOCR), but no real object-detection engine (beyond text) exists in this repository." }; }
        learnFromScreen() { return { success: false, reason: "No real screen/document-structure learning engine exists in this repository." }; }
        learnFromInternet() { return { success: false, reason: "No real internet-research engine exists in this repository." }; }

        async learnFromOCR(imagePayload) {
            const living = window.CozyOS.Living;
            if (!living) return { success: false, reason: "Living is not loaded." };
            this.#declareRealCapabilities(living);
            const result = living.serviceContracts.require("universal-learning", ["ocr-learning"]);
            if (!result.allSatisfied) return { success: false, reason: result.resolved["ocr-learning"].reason };
            const ocr = result.resolved["ocr-learning"].provider;
            const frame = ocr.process({ payload: imagePayload });
            if (frame.status === "REJECTED") return { success: false, reason: `Real OCR rejected: ${frame.reason}` };
            return { success: true, extracted: frame };
        }

        /**
         * learnFromMultimodalObservation({ userId, visual, audio, context, translation })
         *   Real - composes the new, pure MultimodalObservationCore to
         *   build a LearningObservation and compute a real cross-modal
         *   match confidence, then MultimodalObservationCore's own
         *   fail-closed decideLearningAction() to recommend
         *   REVIEW_REQUIRED or IGNORE_LOW_CONFIDENCE. Never itself
         *   decides "learn this" - matches Section 10/11's explicit
         *   requirement that observation, candidate, and learned are
         *   distinct states, and that uncertain observations require
         *   real user confirmation (see confirmMultimodalObservation()
         *   below for what happens once the user actually says "Learn").
         *
         *   `visual`/`audio` here are ALREADY-EXTRACTED values (e.g.
         *   { text, confidence, source } / { transcript, language,
         *   confidence, source }) - this method does not itself invoke
         *   a camera or microphone. Real capture composes
         *   learnFromOCR()/learnFromVoice() above (each already
         *   honestly gated on whether OCREngine/SpeechRecognitionAdapter
         *   are actually real+loaded); wiring their real output into
         *   this method's visual/audio fields is the caller's job,
         *   kept separate so this method's own matching/decision logic
         *   is independently testable without needing a real camera or
         *   microphone in the test environment.
         */
        learnFromMultimodalObservation({ userId, visual, audio, context, translation } = {}) {
            const core = window.CozyOS.MultimodalObservationCore;
            if (!core) return { success: false, reason: "MultimodalObservationCore is not loaded." };
            const observation = core.buildObservation({ userId, visual, audio, context, translation });
            const decision = core.decideLearningAction(observation);
            return { success: true, observation, decision };
        }

        /**
         * confirmMultimodalObservation(observation, { userId, region })
         *   Real - the ONLY path that turns a multimodal observation
         *   into anything durable, and only once the caller represents
         *   a real, explicit user "Learn" choice (Section 11) - this
         *   method takes no confidence threshold and makes no decision
         *   of its own; it trusts that the caller already obtained
         *   real user confirmation via learnFromMultimodalObservation()'s
         *   decision output.
         *
         *   Composes exactly two existing real engines, never a third
         *   storage/verification system:
         *     - CozyMemory.saveMemory() stores the FULL observation
         *       record (visual/audio/context/translation/matching) -
         *       LivingLanguageVerification has no field for most of
         *       this richer structure, so the complete record lives in
         *       real Memory, under its own namespace.
         *     - LivingLanguageVerification.submitObservation() records
         *       the (termId, meaning) pair as one real contributor's
         *       observation for community confidence-scoring - exactly
         *       the real, existing purpose that engine has, invoked
         *       honestly (real submittedBy/region required fields, no
         *       fabricated values).
         */
        confirmMultimodalObservation(observation, { userId, region = "unspecified" } = {}) {
            if (!observation || typeof observation !== "object") return { success: false, reason: "A real observation object (from learnFromMultimodalObservation()) is required." };
            const memory = window.CozyOS.CozyMemory;
            if (!memory || typeof memory.saveMemory !== "function") return { success: false, reason: "CozyMemory is not loaded." };

            const termText = (observation.visual && observation.visual.text) || (observation.audio && observation.audio.transcript) || null;
            const meaning = (observation.translation && observation.translation.meaning) || null;
            if (!termText || !meaning) return { success: false, reason: "A confirmed observation needs at least a real observed term (visual.text/audio.transcript) and a real translation.meaning to record." };

            memory.saveMemory("multimodal-learning", observation.observationId, { ...observation, confirmedBy: userId, confirmedAt: Date.now() }, { owner: userId || "system", actorId: userId || "system", visibility: "private" });

            let verification = { success: false, reason: "LivingLanguageVerification is not loaded." };
            const verifier = window.CozyOS.LivingLanguageVerification;
            if (verifier && typeof verifier.submitObservation === "function") {
                verification = verifier.submitObservation(termText, meaning, {
                    region,
                    context: observation.context && observation.context.topic ? observation.context.topic : null,
                    submittedBy: userId || null,
                });
            }
            return { success: true, storedObservationId: observation.observationId, verification };
        }

        /**
         * captureVoiceForLearning({ languageCode, context })
         *   Real, thin composing wrapper — NOT a new speech engine.
         *   SpeechRecognitionAdapter already owns real microphone
         *   access internally (the Web Speech API manages its own
         *   audio capture; there is no separate getUserMedia call for
         *   this file to wrap, unlike the camera side). This method's
         *   only job is calling the now-fixed learnFromVoice() and
         *   reshaping its honest result into the exact `audio` field
         *   shape multimodal-observation-core.js's buildObservation()
         *   expects ({transcript, confidence, language, source}) —
         *   symmetric to how learning-camera-adapter.js's
         *   captureForLearning() reshapes a real OCR result for the
         *   `visual` field, but with zero new hardware-driving code,
         *   because none is needed here.
         */
        async captureVoiceForLearning({ languageCode, continuous, interimResults, context = null } = {}) {
            const voiceResult = await this.learnFromVoice({ languageCode, continuous, interimResults });
            if (!voiceResult.success) return { success: false, stage: "voice-capture-failed", reason: voiceResult.reason };
            return {
                success: true,
                stage: "voice-captured",
                context,
                audio: {
                    transcript: voiceResult.transcript,
                    confidence: typeof voiceResult.confidence === "number" ? voiceResult.confidence : null,
                    language: languageCode || null,
                    source: "microphone",
                },
            };
        }

        /**
         * learnFromCameraAndVoice({ userId, visual, languageCode, context, translation })
         *   The real "join camera and hearing into one multimodal
         *   session" coordination point requested for this increment.
         *   `visual` is the already-real result of a prior
         *   LearningCameraAdapter.captureForLearning() call (this
         *   method does not itself drive a camera — composing that
         *   adapter's output is the caller's job, kept separate so
         *   this method needs no camera/DOM/video element to be
         *   independently testable, exactly like
         *   learnFromMultimodalObservation() already does for its
         *   visual/audio inputs). Captures a REAL voice observation via
         *   captureVoiceForLearning() above, then feeds both into the
         *   existing, unmodified learnFromMultimodalObservation() — no
         *   third matching/decision implementation is created here.
         */
        async learnFromCameraAndVoice({ userId, visual, languageCode, continuous, interimResults, context, translation } = {}) {
            const voice = await this.captureVoiceForLearning({ languageCode, continuous, interimResults, context });
            if (!voice.success) return { success: false, stage: voice.stage, reason: voice.reason };
            return this.learnFromMultimodalObservation({ userId, visual, audio: voice.audio, context, translation });
        }

        getVersion() { return "1.0.0"; }
        getId() { return "UniversalLearningPipeline"; }
    }

    window.CozyOS.UniversalLearningPipeline = new CozyUniversalLearningPipeline();
})();
