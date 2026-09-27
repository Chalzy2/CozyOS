/**
 * CozyOS Speech Segmenter — core/modules/speech/speech-segmenter.js
 * Layer: Core / Platform Foundation — Voice Presentation Utility
 * Version: 1.0.0
 * Workstream: Universal CozyOS Voice — Phase 1 (Progressive Speech)
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN
 *   core/modules/founder-story/founder-story-narration.js already owns a
 *   real, working paragraph/sentence tokenizer (splitIntoSentences()) that
 *   VoiceManager.speak() has been sequenced through, one sentence at a
 *   time, since Milestone 361. That function is deliberately scoped to
 *   Founder Story chapters (its own header documents this): it also
 *   detects a heuristic EMOTION per sentence and accepts a chapter's own
 *   timelineEra hint, neither of which has any meaning for an arbitrary
 *   CozyAI Live Window reply. Rather than making the general voice
 *   pipeline depend on a Founder-Story-scoped module (or making that
 *   module's emotion concept leak into unrelated replies), this file
 *   extracts the REUSABLE PART of that same pattern — real, punctuation-
 *   based sentence-boundary splitting, never inventing a boundary that
 *   isn't actually present in the text — into its own small, general
 *   utility. The splitting rule itself (paragraph-first on real newlines,
 *   then sentence-final punctuation) is deliberately identical to
 *   founder-story-narration.js's splitIntoSentences() so both stay
 *   consistent; this is the SAME concept adapted, not a competing one.
 *
 * WHAT THIS FILE OWNS
 *   splitIntoSegments(text) — a pure function, no state, no I/O. Turns
 *   one resolved response string into an ordered list of speakable
 *   segments so a caller (VoiceManager.speakProgressive()) can begin
 *   speaking the first segment immediately rather than waiting for the
 *   entire response.
 *
 * WHAT THIS FILE DOES NOT DO
 *   - Does not speak anything itself, does not call VoiceManager, does
 *     not touch CozyAI/answer construction. Pure text -> segments only.
 *   - Does not detect emotion, language, or intent — that remains
 *     CozyAI's/CozyLanguageIdentifier's, untouched.
 *   - Does not invent a sentence boundary beyond real newlines/terminal
 *     punctuation (.!?…) actually present in the text — a response with
 *     no such punctuation is honestly returned as ONE segment (the whole
 *     text), never artificially chopped at a word/character count.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const SEGMENTER_VERSION = "1.0.0";
    if (window.CozyOS.SpeechSegmenter) return; // duplicate-load guard

    /**
     * splitIntoSegments(text)
     *   Real, punctuation-based only — same rule as founder-story-
     *   narration.js's splitIntoSentences(): split on real newlines
     *   (paragraph breaks) first, then each paragraph on real sentence-
     *   final punctuation (.!?…) followed by whitespace. Never fabricates
     *   a boundary; a paragraph with no terminal punctuation is returned
     *   as a single segment.
     *
     *   Returns: string[] — always at least one element for any non-empty
     *   input; [] for empty/non-string input (honest, never throws).
     */
    function splitIntoSegments(text) {
        const raw = String(text || "");
        if (!raw.trim()) return [];
        const paragraphs = raw.split(/\n+/).map((p) => p.trim()).filter(Boolean);
        const segments = [];
        for (const paragraph of paragraphs) {
            const parts = paragraph.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
            if (parts.length) segments.push(...parts);
            else segments.push(paragraph);
        }
        return segments.length ? segments : [raw.trim()];
    }

    const SpeechSegmenter = Object.freeze({
        getVersion() { return SEGMENTER_VERSION; },
        splitIntoSegments,
    });

    window.CozyOS.SpeechSegmenter = SpeechSegmenter;
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    window.CozyOS.Modules["speech-segmenter"] = Object.freeze({
        version: SEGMENTER_VERSION,
        description: "Real, punctuation-based text -> speakable-segment splitter, adapting founder-story-narration.js's existing splitIntoSentences() rule (minus its chapter-specific emotion/timelineEra concerns) for general use by VoiceManager.speakProgressive(). Pure function, no TTS, no state, no fabricated boundaries.",
    });
})();
