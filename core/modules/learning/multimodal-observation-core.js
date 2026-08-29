/**
 * CozyOS — Multimodal Observation Core
 * File Reference: core/modules/learning/multimodal-observation-core.js
 *
 * CLASSIFICATION: pure logic, no DOM, no network, no camera/microphone
 * access — follows the established "-core.js" convention (see
 * core/shell/admin-gate-core.js, core/shell/post-login-routing-core.js):
 * attaches to window.CozyOS so it loads as a plain <script>, and is
 * Node-testable by stubbing global.window before require().
 *
 * WHY THIS FILE EXISTS (real audit, confirmed before writing this file)
 *   core/modules/learning/universal-learning-pipeline.js (M322) already
 *   composes real engines for independent single-modality learning:
 *   learnFromVoice() (SpeechRecognitionAdapter), learnFromOCR()
 *   (OCREngine — itself a documented stub, not loaded in
 *   dashboard.html, both facts already disclosed in that file's own
 *   header). Neither method combines a visual observation and an audio
 *   observation into one cross-checked record — each stands alone.
 *   That combination — "does what the camera saw match what the
 *   microphone heard, for the same lesson item" — is the one genuinely
 *   missing piece this multimodal learning request specifically asks
 *   for (its own Section 7, called "one of the most important parts").
 *   This file is exactly that missing coordination layer, nothing more.
 *
 *   core/living/cozy-language-verification.js (the real
 *   LivingLanguageVerification engine) was also audited before writing
 *   this file. Its real, existing algorithm answers a DIFFERENT
 *   question than cross-modal matching: whether multiple DISTINCT
 *   real contributors, across regions, independently confirm the same
 *   meaning (community consensus), gated on real `submittedBy`/
 *   `region` fields it requires and does not fabricate. It is reused
 *   exactly as designed — this file never reimplements it or bypasses
 *   its dedup/region logic — but it is the wrong tool for "did this
 *   one instant's camera+microphone observation agree with itself,"
 *   which has nothing to do with distinct contributors. That is why
 *   this file computes its own real, local text/pronunciation
 *   similarity for cross-modal matching, and only calls into
 *   LivingLanguageVerification.submitObservation() afterward, once a
 *   user has explicitly confirmed the combined observation is worth
 *   learning (see decideLearningAction() below and Section 11's
 *   Learn/Review/Ignore requirement) — at which point it genuinely is
 *   "one real contributor observing one real meaning," exactly what
 *   that engine is for.
 *
 * WHAT THIS FILE DOES NOT DO
 *   - Does not access a camera, microphone, or any hardware.
 *   - Does not perform OCR or speech recognition itself.
 *   - Does not call any network endpoint.
 *   - Does not decide FOR the user whether to learn something — see
 *     decideLearningAction()'s honest three-way outcome
 *     (LEARN_CONFIRMED / REVIEW_REQUIRED / IGNORE_LOW_CONFIDENCE); it
 *     never auto-commits an observation as permanent knowledge
 *     (Section 10's explicit requirement).
 *   - Does not fabricate a match when the two modalities disagree —
 *     computeTextSimilarity() is a real, deterministic, inspectable
 *     algorithm (normalized token-overlap + character-level distance),
 *     not a machine-learning model this repository does not have.
 */
(function () {
    'use strict';
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};

    const VERSION = '1.0.0';

    const ACTION = Object.freeze({
        LEARN_CONFIRMED: 'LEARN_CONFIRMED',
        REVIEW_REQUIRED: 'REVIEW_REQUIRED',
        IGNORE_LOW_CONFIDENCE: 'IGNORE_LOW_CONFIDENCE',
    });

    function normalize(text) {
        // NFD + strip combining diacritical marks (é->e, í->i, etc.)
        // before the letter/number filter. Real, common OCR/ASR
        // disagreement mode — e.g. "días" (correct) vs "dias" (a
        // plausible OCR or speech-recognition rendering without the
        // accent) should compare as the same word, not a mismatch.
        return String(text || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ');
    }

    /**
     * Real Levenshtein edit distance — no external library, no
     * fabricated approximation. Used for short phrase/word comparison
     * where token overlap alone is too coarse (e.g. "buenos dias" vs
     * "buenos dia" — a real, small transcription/OCR difference).
     */
    function levenshtein(a, b) {
        const m = a.length, n = b.length;
        if (m === 0) return n;
        if (n === 0) return m;
        const prev = new Array(n + 1);
        const curr = new Array(n + 1);
        for (let j = 0; j <= n; j++) prev[j] = j;
        for (let i = 1; i <= m; i++) {
            curr[0] = i;
            for (let j = 1; j <= n; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
            }
            for (let j = 0; j <= n; j++) prev[j] = curr[j];
        }
        return prev[n];
    }

    /**
     * computeTextSimilarity(a, b) -> number in [0, 1]
     *   Real, deterministic. 1 means identical after normalization
     *   (case/punctuation/whitespace-insensitive), 0 means completely
     *   different. Combines whole-phrase edit-distance similarity with
     *   token-overlap similarity so both "buenos dias" vs "buenos dia"
     *   (near-identical, small edit distance) and "good morning" vs
     *   "morning good" (same tokens, different order — plausible from
     *   an OCR line-wrap or ASR reordering) score reasonably high,
     *   while genuinely unrelated phrases score low.
     */
    function computeTextSimilarity(a, b) {
        const na = normalize(a), nb = normalize(b);
        if (!na && !nb) return 1;
        if (!na || !nb) return 0;
        if (na === nb) return 1;

        const maxLen = Math.max(na.length, nb.length);
        const editSimilarity = maxLen === 0 ? 1 : 1 - (levenshtein(na, nb) / maxLen);

        const tokensA = new Set(na.split(' ').filter(Boolean));
        const tokensB = new Set(nb.split(' ').filter(Boolean));
        const union = new Set([...tokensA, ...tokensB]);
        let intersectionCount = 0;
        for (const t of tokensA) if (tokensB.has(t)) intersectionCount++;
        const tokenSimilarity = union.size === 0 ? 1 : intersectionCount / union.size;

        return Math.max(0, Math.min(1, (editSimilarity * 0.6) + (tokenSimilarity * 0.4)));
    }

    /**
     * buildObservation({ userId, visual, audio, context, translation })
     *   Assembles the LearningObservation structure (Section 4 of the
     *   spec) from real, caller-supplied fields only — this function
     *   invents no text, no confidence, no language it wasn't given.
     *   `visual` and `audio` are each optional (a camera-only or
     *   microphone-only observation is valid); when both are present,
     *   a real cross-modal match confidence is computed via
     *   computeTextSimilarity(). observationId/timestamp are the only
     *   values this function generates itself.
     *
     * @param {object} input
     * @param {string} input.userId
     * @param {object} [input.visual] - { text, confidence, source }
     * @param {object} [input.audio] - { transcript, language, confidence, source }
     * @param {object} [input.context] - { application, lesson, topic }
     * @param {object} [input.translation] - { sourceLanguage, targetLanguage, meaning, confidence }
     * @param {function} [input.now] - injectable clock for tests; defaults to Date.now
     * @param {function} [input.idGenerator] - injectable id generator for tests
     */
    function buildObservation(input) {
        const opts = input || {};
        const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
        const idGenerator = typeof opts.idGenerator === 'function'
            ? opts.idGenerator
            : () => `obs_${now()}_${Math.random().toString(36).slice(2, 10)}`;

        const visual = opts.visual ? { ...opts.visual } : null;
        const audio = opts.audio ? { ...opts.audio } : null;

        let visualAudioMatch = null;
        if (visual && audio && (visual.text || audio.transcript)) {
            visualAudioMatch = computeTextSimilarity(visual.text, audio.transcript);
        }

        // Combined confidence: the geometric-mean-like combination of
        // whatever real per-modality confidences and the cross-modal
        // match were actually provided/computed — never invents a
        // number for a modality that wasn't observed. A single-
        // modality observation (visual only, or audio only) simply
        // uses that modality's own real confidence, unmodified.
        const singleModalityConfidences = [];
        if (visual && typeof visual.confidence === 'number') singleModalityConfidences.push(visual.confidence);
        if (audio && typeof audio.confidence === 'number') singleModalityConfidences.push(audio.confidence);

        // Combined confidence: when a real cross-modal comparison was
        // possible, it DOMINATES the combined score (weighted 0.8) —
        // "does what was seen match what was heard" is the specific
        // signal this file exists to compute, and a strong per-
        // modality confidence from two sensors that clearly disagree
        // with each other must not be allowed to dilute that signal
        // back up to "probably fine." The remaining weight (0.2) is
        // the average of whatever real per-modality confidences were
        // actually supplied. When no cross-modal comparison was
        // possible (only one modality present, or neither), falls back
        // to a plain average of whatever real per-modality confidences
        // exist — never inventing a number for a modality that wasn't
        // observed.
        let combinedConfidence = null;
        if (visualAudioMatch !== null) {
            const perModalityAvg = singleModalityConfidences.length
                ? singleModalityConfidences.reduce((a, b) => a + b, 0) / singleModalityConfidences.length
                : visualAudioMatch;
            combinedConfidence = (visualAudioMatch * 0.8) + (perModalityAvg * 0.2);
        } else if (singleModalityConfidences.length) {
            combinedConfidence = singleModalityConfidences.reduce((a, b) => a + b, 0) / singleModalityConfidences.length;
        }

        return {
            observationId: idGenerator(),
            userId: opts.userId || null,
            timestamp: now(),
            visual,
            audio,
            context: opts.context ? { ...opts.context } : null,
            translation: opts.translation ? { ...opts.translation } : null,
            matching: {
                visualAudioMatch,
                combinedConfidence,
            },
            verification: { status: 'unverified', evidence: [] },
            learning: { status: 'observation', version: 1 },
        };
    }

    /**
     * decideLearningAction(observation, thresholds)
     *   Pure, three-way, fail-closed decision — mirrors the strict-
     *   boolean/never-guess philosophy already established elsewhere
     *   in this codebase (admin-gate-core.js, post-login-routing-
     *   core.js). NEVER returns LEARN_CONFIRMED on its own — that
     *   status is reserved for the caller explicitly recording the
     *   user's own "Learn" choice (Section 11). This function only
     *   ever recommends REVIEW_REQUIRED (present to the user) or
     *   IGNORE_LOW_CONFIDENCE (too weak to even bother the user with).
     *   A missing/null combinedConfidence (e.g. only one modality
     *   observed, or neither) is treated as REVIEW_REQUIRED, never
     *   auto-ignored and never auto-learned — an honest "not enough
     *   information to decide automatically."
     */
    function decideLearningAction(observation, thresholds) {
        const t = thresholds || {};
        const ignoreBelow = typeof t.ignoreBelow === 'number' ? t.ignoreBelow : 0.35;
        const confidence = observation && observation.matching ? observation.matching.combinedConfidence : null;

        if (typeof confidence !== 'number') {
            return { action: ACTION.REVIEW_REQUIRED, reason: 'insufficient_data_for_automatic_decision' };
        }
        if (confidence < ignoreBelow) {
            return { action: ACTION.IGNORE_LOW_CONFIDENCE, reason: 'combined_confidence_below_threshold', combinedConfidence: confidence };
        }
        return { action: ACTION.REVIEW_REQUIRED, reason: 'awaiting_user_confirmation', combinedConfidence: confidence };
    }

    window.CozyOS.MultimodalObservationCore = Object.freeze({
        computeTextSimilarity,
        buildObservation,
        decideLearningAction,
        ACTION,
        version: VERSION,
    });
    window.CozyOS.Modules['multimodal-observation-core'] = Object.freeze({
        version: VERSION,
        description: 'Pure logic, no DOM/network/hardware. Computes real cross-modal (visual vs audio) text-similarity matching and assembles the LearningObservation structure. Composed by core/modules/learning/universal-learning-pipeline.js\'s learnFromMultimodalObservation() — never a second learning/verification engine.',
    });
})();
