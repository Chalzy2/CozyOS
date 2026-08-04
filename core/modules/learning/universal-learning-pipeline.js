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

        async learnFromVoice(audioConfig = {}) {
            const living = window.CozyOS.Living;
            if (!living) return { success: false, reason: "Living is not loaded." };
            this.#declareRealCapabilities(living);
            const result = living.serviceContracts.require("universal-learning", ["voice-learning"]);
            if (!result.allSatisfied) return { success: false, reason: result.resolved["voice-learning"].reason };
            const adapter = result.resolved["voice-learning"].provider;
            if (!adapter.isReal()) return { success: false, reason: "Real browser SpeechRecognition API is not available in this environment." };
            return new Promise((resolve) => {
                adapter.on("result", (text) => resolve({ success: true, transcript: text }));
                adapter.on("error", (err) => resolve({ success: false, reason: `Real speech recognition error: ${err}` }));
                adapter.start(audioConfig);
            });
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

        getVersion() { return "1.0.0"; }
        getId() { return "UniversalLearningPipeline"; }
    }

    window.CozyOS.UniversalLearningPipeline = new CozyUniversalLearningPipeline();
})();
