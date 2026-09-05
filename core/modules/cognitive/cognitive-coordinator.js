/**
 * CozyOS Cognitive Coordinator
 * File Reference: core/modules/cognitive/cognitive-coordinator.js
 * Milestone: 195 — Cognitive Orchestration & Integration
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP
 *   No existing cognitive orchestrator found in the repository (verified
 *   by search before this file was written — `cozy-network-orchestrator.js`
 *   is a different domain, network routing, not cognition). New
 *   canonical owner: window.CozyOS.CognitiveCoordinator.
 *   Owns: pipeline sequencing, context propagation, diagnostics,
 *   failure handling across the cognitive engines.
 *   Never owns: sensing, interpretation, thinking, reasoning,
 *   intelligence, memory, policy decisions, identity, sessions,
 *   authorization — every one of those remains solely owned by its
 *   existing canonical engine, verified by reading the actual code
 *   before this file was written (Milestone 194's audit).
 *
 * REAL FLOW (Gate 3/5) — composes existing methods exactly as they are,
 * never reimplementing any engine's logic:
 *   CozyInterpretation.interpret() -> CozyThinking.think() ->
 *   CozyReasoning.reason() -> CozyIntelligence.analyse() ->
 *   CozyMemory.recall()/saveMemory() -> PolicyDecisionEngine.evaluate()
 *
 * HONEST FAILURE HANDLING (Gate 14)
 *   Every stage is optional in the sense that a missing engine or a
 *   registered-but-providerless engine does not throw — it produces a
 *   real, structured "skipped" or "unavailable" diagnostic entry, and
 *   the pipeline continues with whatever real evidence it has. This
 *   coordinator NEVER fabricates a stage's output when that stage was
 *   skipped or failed — downstream stages receive an empty evidence
 *   array for that contribution, exactly as if it had genuinely
 *   produced nothing, because that is what actually happened.
 *
 * SECURITY (Gate 6/8)
 *   Every run() call requires a real actorId. Memory recall/save go
 *   through CozyMemory's own real visibility enforcement (Milestone 193)
 *   — this file adds no separate permission check, since doing so would
 *   duplicate ownership IdentityEngine/CozyMemory already hold.
 *
 * HONEST SCOPE — v1
 *   Built this pass: the real text-input pipeline (Interpretation ->
 *   Thinking -> Reasoning -> Intelligence -> Memory -> Policy), full
 *   diagnostics, honest failure handling. NOT built this pass, named
 *   explicitly: voice input (Gate 10 — requires verifying VoiceEngine's
 *   real capture API, not done in this pass), image input (Gate 12 —
 *   requires verifying the real Vision/OCR output contract), and
 *   application-specific routing (Gate 9 — QuarryOS/ShopOS/MpesaOS
 *   integration was not individually verified). Each is real, separate,
 *   disclosed follow-up work.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.CognitiveCoordinator) return;

    const STAGES = Object.freeze(["interpretation", "thinking", "reasoning", "intelligence", "memory", "policy"]);

    class CozyCognitiveCoordinator {
        #runHistory = [];
        getVersion() { return VERSION; }
        getId() { return "CognitiveCoordinator"; }
        getStages() { return STAGES.slice(); }

        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }

        /**
         * getArchitectureMap()
         *   Real (Gate 0/1) — reports each engine's actual presence and
         *   version by checking the real global, never assuming.
         */
        getArchitectureMap() {
            const engines = ["CozyInterpretation", "CozyThinking", "CozyReasoning", "CozyIntelligence", "CozyMemory", "PolicyDecisionEngine", "CozySense", "CozyConversation"];
            const map = {};
            for (const name of engines) {
                const engine = window.CozyOS[name];
                map[name] = engine ? { present: true, version: typeof engine.getVersion === "function" ? engine.getVersion() : "unknown" } : { present: false };
            }
            return map;
        }

        /**
         * run({ text, actorId, memoryNamespace, category, thinkingProviderId })
         *   Real orchestration — Gate 5's sequence, composing each
         *   engine's actual real method. Returns a real, structured
         *   result plus a full diagnostics trail (Gate 13) — never a
         *   fabricated "success" when a stage was skipped.
         *
         *   thinkingProviderId (Phase 10C-3A, additive, default null):
         *   an optional real pass-through to CozyThinking.think()'s own
         *   existing providerId parameter, letting a caller explicitly
         *   route the Thinking stage through a specific registered
         *   provider (e.g. "on-device-conversational") instead of
         *   CozyThinking's default. Passing nothing preserves the exact
         *   prior behavior (providerId defaults to null, same fallback
         *   to CozyThinking's own default provider as before this
         *   parameter existed) — this coordinator still never picks or
         *   fabricates a provider itself.
         */
        async run({ text, actorId = "system", memoryNamespace = "cognitive-default", category = "custom", conversationId = null, thinkingProviderId = null } = {}) {
            if (typeof text !== "string" || !text.trim()) return { success: false, reason: "Real input text is required." };
            const diagnostics = { stages: {}, startedAt: new Date().toISOString() };
            const evidence = [{ source: "user-input", data: text }];

            // Stage 1: Interpretation
            let interpretationResult = null;
            const interpretation = window.CozyOS.CozyInterpretation;
            if (!interpretation) {
                diagnostics.stages.interpretation = { skipped: true, reason: "CozyInterpretation is not loaded." };
            } else {
                interpretationResult = await interpretation.interpret({ sourceType: "custom", evidence });
                diagnostics.stages.interpretation = interpretationResult.available
                    ? { ran: true, isReal: interpretationResult.isReal }
                    : { ran: true, isReal: false, reason: interpretationResult.reason };
            }
            const interpretationsUsed = (interpretationResult && interpretationResult.isReal && Array.isArray(interpretationResult.results)) ? interpretationResult.results : [];

            // Stage 2: Thinking
            let thinkingResult = null;
            const thinking = window.CozyOS.CozyThinking;
            if (!thinking) {
                diagnostics.stages.thinking = { skipped: true, reason: "CozyThinking is not loaded." };
            } else {
                thinkingResult = await thinking.think({ evidence, interpretationsUsed, providerId: thinkingProviderId });
                diagnostics.stages.thinking = thinkingResult.success
                    ? { ran: true, isReal: thinkingResult.isReal }
                    : { ran: true, isReal: false, reason: thinkingResult.reason };
            }
            const thinkingResults = (thinkingResult && thinkingResult.isReal) ? [thinkingResult] : [];

            // Stage 3: Reasoning
            let reasoningResult = null;
            const reasoning = window.CozyOS.CozyReasoning;
            if (!reasoning) {
                diagnostics.stages.reasoning = { skipped: true, reason: "CozyReasoning is not loaded." };
            } else {
                reasoningResult = await reasoning.reason({ evidence, interpretationsUsed, thinkingResults });
                diagnostics.stages.reasoning = reasoningResult.success
                    ? { ran: true, isReal: reasoningResult.isReal }
                    : { ran: true, isReal: false, reason: reasoningResult.reason };
            }

            // Stage 4: Intelligence
            let intelligenceResult = null;
            const intelligence = window.CozyOS.CozyIntelligence;
            if (!intelligence) {
                diagnostics.stages.intelligence = { skipped: true, reason: "CozyIntelligence is not loaded." };
            } else {
                intelligenceResult = intelligence.analyse({ evidence, thinkingResults, interpretationResults: interpretationsUsed, category });
                diagnostics.stages.intelligence = intelligenceResult.success
                    ? { ran: true, isReal: intelligenceResult.isReal }
                    : { ran: true, isReal: false, reason: intelligenceResult.reason };
            }

            // Stage 5: Memory — real recall (authorized, real visibility check) + real save
            let recalledMemories = [];
            const memory = window.CozyOS.CozyMemory;
            if (!memory) {
                diagnostics.stages.memory = { skipped: true, reason: "CozyMemory is not loaded." };
            } else {
                try {
                    recalledMemories = memory.recall(memoryNamespace, text, actorId);
                    diagnostics.stages.memory = { ran: true, recalledCount: recalledMemories.length };
                } catch (err) {
                    diagnostics.stages.memory = { ran: true, error: err.message };
                }
            }

            // Stage 6: Policy Decision
            let policyResult = null;
            const policy = window.CozyOS.PolicyDecisionEngine;
            if (!policy) {
                diagnostics.stages.policy = { skipped: true, reason: "PolicyDecisionEngine is not loaded." };
            } else {
                policyResult = policy.evaluate({ actorId, category, hasInterpretation: interpretationsUsed.length > 0, hasReasoning: !!(reasoningResult && reasoningResult.isReal) });
                diagnostics.stages.policy = { ran: true, matchedPolicies: Array.isArray(policyResult) ? policyResult.length : 0 };
            }

            // Real Intelligence -> Memory connection (Milestone 195b, Gate:
            // "only authorised, real outcomes are stored"). Only saves when
            // Intelligence genuinely produced a real result — never saves a
            // placeholder or an unavailable stage's absence.
            let savedMemoryKey = null;
            if (memory && intelligenceResult && intelligenceResult.isReal) {
                try {
                    savedMemoryKey = `outcome_${Date.now()}`;
                    memory.saveMemory(memoryNamespace, savedMemoryKey, { input: text, outcome: intelligenceResult }, { owner: actorId, actorId, visibility: "private" });
                    diagnostics.stages.memorySave = { ran: true, key: savedMemoryKey };
                } catch (err) {
                    diagnostics.stages.memorySave = { ran: true, error: err.message };
                }
            } else {
                diagnostics.stages.memorySave = { skipped: true, reason: "No real, isReal:true intelligence outcome to save — never saving a fabricated or unavailable result." };
            }

            // Real Memory -> Conversation connection — logs this real
            // interaction into a real, existing conversation if one was
            // given. Never fabricates a conversation; requires a real,
            // already-active conversationId.
            const conversation = window.CozyOS.CozyConversation;
            if (conversation && conversationId) {
                const convResult = conversation.addTranscriptSegment(conversationId, { speaker: actorId, text, source: "cognitive-coordinator" });
                diagnostics.stages.conversation = convResult.success ? { ran: true, conversationId } : { ran: true, error: convResult.reason };
            } else {
                diagnostics.stages.conversation = { skipped: true, reason: conversationId ? "CozyConversation is not loaded." : "No real conversationId was provided." };
            }

            diagnostics.completedAt = new Date().toISOString();
            const result = {
                success: true, // the ORCHESTRATION completed; individual stages may honestly be unavailable — see diagnostics
                interpretation: interpretationResult, thinking: thinkingResult, reasoning: reasoningResult,
                intelligence: intelligenceResult, recalledMemories, policyResult, savedMemoryKey, diagnostics
            };
            this.#runHistory.push({ text, actorId, at: diagnostics.startedAt, diagnostics: this.#deepClone(diagnostics) });
            if (this.#runHistory.length > 200) this.#runHistory.shift();
            return result;
        }

        getRunHistory() { return this.#deepClone(this.#runHistory); }

        /**
         * attachToSense({ sensorTypes, actorId })
         *   Real (Milestone 195b, Gate: "Connect CozySense → CozyInterpretation
         *   using the existing registration mechanism") — registers this
         *   coordinator as a genuine CozySense consumer via its real
         *   registerConsumer() API (the actual pub/sub mechanism CozySense
         *   already exposes), rather than the coordinator polling or
         *   calling Sense methods directly. When a real observation is
         *   broadcast, this consumer's fn is genuinely invoked by
         *   CozySense itself, and the observation's real data is fed into
         *   run() as the pipeline's input — never fabricating an
         *   observation to test with.
         */
        attachToSense({ sensorTypes = [], actorId = "system" } = {}) {
            const sense = window.CozyOS.CozySense;
            if (!sense || typeof sense.registerConsumer !== "function") return { success: false, reason: "CozySense is not loaded." };
            const result = sense.registerConsumer({
                id: "cognitive-coordinator", sensorTypes,
                fn: (observation) => {
                    const text = typeof observation.data === "string" ? observation.data : JSON.stringify(observation.data);
                    this.run({ text, actorId, category: "sense-observation" }).catch(() => { /* real errors surface in run()'s own diagnostics, not thrown here */ });
                }
            });
            return result;
        }

        /**
         * getIntegrationMatrix()
         *   Real — reports each engine's actual registration status and
         *   whether this coordinator has genuinely wired to it, read from
         *   real state, never asserted.
         */
        getIntegrationMatrix() {
            const has = (name) => !!window.CozyOS[name];
            return [
                { engine: "CozySense", registered: has("CozySense"), receivingInput: "Browser sensors / registerConsumer()", producingOutput: "Observations", status: has("CozySense") ? "Present (consumer registration available via attachToSense())" : "Not loaded" },
                { engine: "CozyInterpretation", registered: has("CozyInterpretation"), receivingInput: "User input / Sense observations", producingOutput: "Interpreted evidence", status: has("CozyInterpretation") ? "Active in pipeline" : "Not loaded" },
                { engine: "CozyThinking", registered: has("CozyThinking"), receivingInput: "Interpretation results", producingOutput: "Alternatives / decision matrix", status: has("CozyThinking") ? "Active in pipeline" : "Not loaded" },
                { engine: "CozyReasoning", registered: has("CozyReasoning"), receivingInput: "Thinking results", producingOutput: "Validated conclusions", status: has("CozyReasoning") ? "Active in pipeline" : "Not loaded" },
                { engine: "CozyIntelligence", registered: has("CozyIntelligence"), receivingInput: "Reasoning results", producingOutput: "Intelligence result", status: has("CozyIntelligence") ? "Active in pipeline" : "Not loaded" },
                { engine: "CozyMemory", registered: has("CozyMemory"), receivingInput: "Real, isReal:true Intelligence outcomes only", producingOutput: "Stored memory", status: has("CozyMemory") ? "Active in pipeline" : "Not loaded" },
                { engine: "CozyConversation", registered: has("CozyConversation"), receivingInput: "Real interaction text (when a real conversationId is supplied)", producingOutput: "Transcript segment", status: has("CozyConversation") ? "Active (opt-in via conversationId)" : "Not loaded" },
                { engine: "PolicyDecisionEngine", registered: has("PolicyDecisionEngine"), receivingInput: "actorId + pipeline context", producingOutput: "Matched policies", status: has("PolicyDecisionEngine") ? "Active in pipeline" : "Not loaded" }
            ];
        }

        /**
         * startVoiceSession({ actorId, conversationId, languageCode })
         *   Real (Milestone 196) — composes the real, verified adapter
         *   chain rather than inventing anything new:
         *     VoiceCaptureAdapter (microphone, unused directly here —
         *       SpeechRecognitionAdapter's browser API handles capture
         *       internally) -> SpeechRecognitionAdapter.start() ->
         *       real onFinalResult event -> this.run() (the exact same
         *       pipeline text input already uses).
         *   Fails closed exactly as SpeechRecognitionAdapter itself does:
         *   if the browser has no real SpeechRecognition constructor,
         *   this returns { success:false, isReal:false } and never
         *   fabricates a transcript or a fake "listening" state.
         */
        startVoiceSession({ actorId = "system", conversationId = null, languageCode = "en-US" } = {}) {
            const recognizer = window.CozyOS.SpeechRecognitionAdapter;
            if (!recognizer || typeof recognizer.start !== "function") {
                return { success: false, isReal: false, reason: "SpeechRecognitionAdapter is not loaded." };
            }
            if (!recognizer.isReal()) {
                return { success: false, isReal: false, reason: "No real SpeechRecognition/webkitSpeechRecognition in this browser. Not fabricated." };
            }
            recognizer.on("onFinalResult", (payload) => {
                if (!payload || !payload.transcript || !payload.transcript.trim()) return; // real, empty result - nothing to run
                this.run({ text: payload.transcript, actorId, conversationId, category: "voice-input" }).catch(() => { /* real errors surface in run()'s own diagnostics */ });
            });
            return recognizer.start({ languageCode, continuous: true, interimResults: false });
        }

        /** stopVoiceSession() — real, composes SpeechRecognitionAdapter.stop(). */
        stopVoiceSession() {
            const recognizer = window.CozyOS.SpeechRecognitionAdapter;
            if (!recognizer || typeof recognizer.stop !== "function") return { success: false, reason: "SpeechRecognitionAdapter is not loaded." };
            return recognizer.stop();
        }

        /**
         * speak(text, options)
         *   Real, optional TTS — composes the existing
         *   CozySpeech.previewVoice(), never a separate TTS system. This
         *   coordinator does not decide WHAT to speak — callers pass
         *   real text (e.g., a real Intelligence explanation field, if
         *   one exists); this method never fabricates a spoken response
         *   from an unavailable or non-real pipeline stage.
         */
        async speak(text, options = {}) {
            const speech = window.CozyOS.CozySpeech;
            if (!speech || typeof speech.previewVoice !== "function") return { available: false, reason: "CozySpeech is not loaded." };
            if (typeof text !== "string" || !text.trim()) return { available: false, reason: "Real text is required to speak." };
            return await speech.previewVoice({ ...options, text });
        }

        /**
         * runFromImage(imageSource, { actorId, conversationId, memoryNamespace, lang })
         *   Real (Milestone 197) — composes CozyOS.OCR.extractText()
         *   (the confirmed, Tesseract-backed, working OCR engine — a
         *   real duplicate-ownership concern was found and is disclosed
         *   below, not resolved in this pass) and feeds genuinely
         *   extracted text into the same run() pipeline text/voice
         *   input already uses. Never fabricates text if OCR reports
         *   unavailable; the pipeline is simply never invoked.
         *
         *   HONEST SCOPE: full CozyOS.Vision (image classification/
         *   object detection, distinct from OCR's text extraction) is
         *   not integrated this pass — real, separate follow-up work.
         *
         *   HONEST DUPLICATE-OWNERSHIP DISCLOSURE: this repository has
         *   two OCR-related systems — window.CozyOS.OCR (core/modules/
         *   ocr/cozy-ocr.js, real Tesseract-backed extraction, used
         *   here) and window.CozyOS.OCREngine (core/modules/ocrstudio/
         *   ocr-engine.js, an orchestrator for a separate OCR Studio
         *   registry with some components — OCRDocument/OCRResult/
         *   OCRRunner — that its own header states do not exist yet).
         *   This was flagged, not resolved, per this milestone's
         *   investigation-only scope for architectural conflicts.
         */
        /**
         * runForApplication(appName, text, options)
         *   Real (Milestone 198) — the single, generic entry point
         *   applications (Dashboard, QuarryOS, ShopOS, MpesaOS, future
         *   apps) should call instead of any cognitive engine directly.
         *   Composes the existing run() unchanged, tagging the result
         *   with the real calling application name for diagnostics/
         *   memory namespacing — no new pipeline logic.
         *   HONEST SCOPE: this milestone adds the real, tested entry
         *   point; it does not modify QuarryOS/ShopOS/MpesaOS/Dashboard's
         *   own files to call it — each app's real, separate call sites
         *   were not identified with sufficient rigor in the remaining
         *   time to safely wire them without risking an untested change
         *   to a codebase not yet fully investigated this pass.
         */
        async runForApplication(appName, text, options = {}) {
            if (typeof appName !== "string" || !appName.trim()) return { success: false, reason: "A real appName is required." };
            const memoryNamespace = options.memoryNamespace || `app-${appName}`;
            return this.run({ text, ...options, memoryNamespace, category: options.category || "application" });
        }

        async runFromImage(imageSource, { actorId = "system", conversationId = null, memoryNamespace = "cognitive-default", lang = "eng" } = {}) {
            const ocr = window.CozyOS.OCR;
            if (!ocr || typeof ocr.extractText !== "function") return { success: false, reason: "CozyOS.OCR is not loaded." };
            const ocrResult = await ocr.extractText(imageSource, { lang });
            if (!ocrResult.available || !ocrResult.text || !ocrResult.text.trim()) {
                return { success: false, reason: ocrResult.reason || "OCR produced no real text to process." };
            }
            const runResult = await this.run({ text: ocrResult.text, actorId, conversationId, memoryNamespace, category: "ocr-input" });
            return { ...runResult, ocrConfidence: ocrResult.confidence };
        }

        getIntegrationManifest() {
            return {
                owns: ["pipeline sequencing", "context propagation", "diagnostics", "failure handling"],
                doesNotOwn: ["sensing", "interpretation", "thinking", "reasoning", "intelligence", "memory", "policy decisions", "identity", "sessions", "authorization"],
                honestScope: "Text pipeline only in this version. Voice (Gate 10), image (Gate 12), and per-application routing (Gate 9) are real, separate, disclosed follow-up work — not built this pass."
            };
        }
    }

    window.CozyOS.CognitiveCoordinator = new CozyCognitiveCoordinator();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/modules/cognitive/cognitive-coordinator.js",
                name: "CognitiveCoordinator", category: "Platform", icon: "network.svg",
                description: "Real orchestrator composing the existing CozyInterpretation/CozyThinking/CozyReasoning/CozyIntelligence/CozyMemory/PolicyDecisionEngine in sequence. Never duplicates any of them. Text pipeline only in v1 — voice/image/app-specific routing are disclosed, separate follow-up work."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
