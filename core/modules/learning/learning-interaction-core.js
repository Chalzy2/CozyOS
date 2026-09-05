/**
 * CozyOS — Learning Interaction Core
 * File Reference: core/modules/learning/learning-interaction-core.js
 *
 * CLASSIFICATION: pure logic, no DOM, no network, no camera/microphone
 * access — follows the established "-core.js" convention (see
 * core/shell/admin-gate-core.js, core/shell/post-login-routing-core.js,
 * core/shell/dashboard-navigation-core.js).
 *
 * OWNERSHIP: owns the Living Learn panel's session STATE MACHINE
 * (idle -> mode selection -> permission -> capturing -> reviewing ->
 * confirmed/ignored), a real, evidence-based DIAGNOSTICS builder (does
 * each real dependency actually exist right now?), and pure text
 * formatting for the review card and structured error reports. It owns
 * no camera, microphone, OCR, translation, learning, or memory
 * capability itself — every diagnostic below reads a real
 * window.CozyOS global's actual presence at call time; nothing here is
 * a second implementation of any engine.
 *
 * WHY A SEPARATE PURE FILE
 *   core/shell/learning-panel-ui.js (the DOM-wiring counterpart to this
 *   file) is browser-only and cannot be exercised by Node's test
 *   runner without a real or simulated DOM. Every decision that CAN be
 *   pure — which state comes next, what a diagnostics report should
 *   say, how a review card's text should read, how to classify a
 *   failure into {component, problem, impact, possibleSolution} — is
 *   extracted here so it is directly, exhaustively unit-tested,
 *   exactly like admin-gate-core.js/post-login-routing-core.js already
 *   established for authentication/routing decisions.
 */
(function () {
    'use strict';
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};

    const VERSION = '1.0.0';

    const STAGE = Object.freeze({
        IDLE: 'IDLE',
        MODE_SELECT: 'MODE_SELECT',
        PERMISSION_PENDING: 'PERMISSION_PENDING',
        CAPTURING: 'CAPTURING',
        REVIEWING: 'REVIEWING',
        CONFIRMED: 'CONFIRMED',
        IGNORED: 'IGNORED',
        FAILED: 'FAILED',
    });

    const MODE = Object.freeze({ SCAN: 'SCAN', LISTEN: 'LISTEN', BOTH: 'BOTH' });

    const VALID_TRANSITIONS = Object.freeze({
        IDLE: ['MODE_SELECT'],
        MODE_SELECT: ['PERMISSION_PENDING', 'IDLE'],
        PERMISSION_PENDING: ['CAPTURING', 'FAILED', 'MODE_SELECT'],
        CAPTURING: ['REVIEWING', 'FAILED', 'MODE_SELECT'],
        REVIEWING: ['CONFIRMED', 'IGNORED', 'MODE_SELECT'],
        CONFIRMED: ['IDLE', 'MODE_SELECT'],
        IGNORED: ['IDLE', 'MODE_SELECT'],
        FAILED: ['IDLE', 'MODE_SELECT'],
    });

    /**
     * transition(currentStage, targetStage)
     *   Pure, fail-closed state transition check. Refuses (never
     *   silently coerces) a transition this state machine hasn't
     *   explicitly allowed — e.g. jumping straight from IDLE to
     *   CONFIRMED without ever capturing/reviewing anything is refused,
     *   matching "do not automatically commit every observation."
     */
    function transition(currentStage, targetStage) {
        if (!STAGE[currentStage]) return { success: false, reason: `"${currentStage}" is not a real learning-panel stage.` };
        if (!STAGE[targetStage]) return { success: false, reason: `"${targetStage}" is not a real learning-panel stage.` };
        const allowed = VALID_TRANSITIONS[currentStage] || [];
        if (!allowed.includes(targetStage)) {
            return { success: false, reason: `Cannot move from ${currentStage} to ${targetStage}. Valid next stages: ${allowed.join(', ') || '(none)'}.` };
        }
        return { success: true, stage: targetStage, previous: currentStage };
    }

    /**
     * buildDiagnostics()
     *   Real, evidence-based capability check — every field reflects
     *   whether the named real window.CozyOS global genuinely exists
     *   right now, never assumed. Distinguishes LOADED (the file is
     *   present) from the deeper, honest "is it actually usable"
     *   signal where a real self-check method exists (e.g. Camera's
     *   isSupported(), SpeechRecognitionAdapter's isReal()) — a loaded
     *   adapter on a browser with no camera hardware is reported
     *   differently from one that is genuinely usable.
     */
    function buildDiagnostics() {
        const w = (typeof window !== 'undefined' && window.CozyOS) || {};

        const cameraAdapter = w.LearningCameraAdapter;
        const camera = !cameraAdapter
            ? { available: false, reason: 'LearningCameraAdapter is not loaded.' }
            : (typeof cameraAdapter.isSupported === 'function' && !cameraAdapter.isSupported())
                ? { available: false, reason: 'Camera API (getUserMedia) is not available in this environment.' }
                : { available: true };

        const speechAdapter = w.SpeechRecognitionAdapter;
        const hearing = !speechAdapter
            ? { available: false, reason: 'SpeechRecognitionAdapter is not loaded.' }
            : (typeof speechAdapter.isReal === 'function' && !speechAdapter.isReal())
                ? { available: false, reason: 'Browser SpeechRecognition API is not available in this environment.' }
                : { available: true };

        const ocr = w.OCREngine
            ? { available: true }
            : { available: false, reason: 'OCREngine is not loaded (documented stub — no real text-extraction pipeline exists yet).' };

        const translation = w.CozyTranslate
            ? { available: true }
            : { available: false, reason: 'CozyTranslate is not loaded.' };

        const cognitive = w.CognitiveCoordinator
            ? { available: true }
            : { available: false, reason: 'CognitiveCoordinator is not loaded.' };

        const learning = w.UniversalLearningPipeline
            ? { available: true }
            : { available: false, reason: 'UniversalLearningPipeline is not loaded.' };

        const memory = w.CozyMemory
            ? { available: true }
            : { available: false, reason: 'CozyMemory is not loaded.' };

        const matching = w.MultimodalObservationCore
            ? { available: true }
            : { available: false, reason: 'MultimodalObservationCore is not loaded.' };

        return { camera, hearing, ocr, translation, cognitive, learning, memory, matching };
    }

    /**
     * classifyError(component, reason)
     *   Pure structured-diagnostics formatter (Section 16/19's
     *   "identify the actual broken dependency" requirement). Never
     *   invents a solution it wasn't given a real basis for — falls
     *   back to an honest "no automatic remedy is known" rather than a
     *   generic platitude.
     */
    const KNOWN_SOLUTIONS = Object.freeze({
        camera: 'Grant camera permission when prompted, or check that this device has a working camera.',
        hearing: 'Grant microphone permission when prompted, or check that this browser supports SpeechRecognition.',
        ocr: 'No real OCR pipeline is installed yet — this requires new infrastructure, not a permission or setting.',
        translation: 'No real translation engine is loaded on this page yet.',
        cognitive: 'No real reasoning/thinking engine is loaded on this page yet.',
        learning: 'The core learning pipeline is not loaded — this is a page-configuration issue, not a user action.',
        memory: 'No real memory engine is loaded on this page yet.',
        matching: 'The cross-modal matching module is not loaded on this page yet.',
    });

    function classifyError(component, reason) {
        return {
            component: component || 'unknown',
            problem: reason || 'An unspecified failure occurred.',
            impact: `The ${component || 'requested'} step of this learning session cannot continue.`,
            possibleSolution: KNOWN_SOLUTIONS[component] || 'No automatic remedy is known for this failure.',
        };
    }

    /**
     * buildReviewCardText(observation, decision)
     *   Pure formatter for the "what CozyOS detected" review card
     *   (Section 8). Never fabricates a field the observation doesn't
     *   actually have — omits, rather than inventing placeholder text
     *   for, any missing visual/audio/translation field.
     */
    function buildReviewCardText(observation, decision) {
        if (!observation) return { lines: [], confidencePercent: null };
        const lines = [];
        if (observation.visual && observation.visual.text) lines.push({ label: 'Text', value: observation.visual.text });
        if (observation.audio && observation.audio.transcript) lines.push({ label: 'Spoken', value: observation.audio.transcript });
        if (observation.translation && observation.translation.meaning) lines.push({ label: 'Meaning', value: observation.translation.meaning });

        const combined = observation.matching && typeof observation.matching.combinedConfidence === 'number'
            ? observation.matching.combinedConfidence
            : null;
        const confidencePercent = combined === null ? null : Math.round(combined * 100);
        if (confidencePercent !== null) lines.push({ label: 'Confidence', value: `${confidencePercent}%` });

        return {
            lines,
            confidencePercent,
            recommendedAction: decision && decision.action ? decision.action : null,
        };
    }

    window.CozyOS.LearningInteractionCore = Object.freeze({
        STAGE,
        MODE,
        transition,
        buildDiagnostics,
        classifyError,
        buildReviewCardText,
        version: VERSION,
    });
    window.CozyOS.Modules['learning-interaction-core'] = Object.freeze({
        version: VERSION,
        description: 'Pure logic, no DOM/network/hardware. Learning-panel session state machine, real capability diagnostics, and review-card/error text formatting. Composed by core/shell/learning-panel-ui.js — owns no camera/microphone/OCR/translation/learning/memory capability itself.',
    });
})();
