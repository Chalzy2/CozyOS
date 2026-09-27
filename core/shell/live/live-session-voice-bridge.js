'use strict';

/**
 * core/shell/live/live-session-voice-bridge.js
 *
 * Universal CozyOS Voice — Application Integration Matrix, Live Session
 * row. Real trace (VOICE-APPLICATION-INTEGRATION-AUDIT.md §5.3) found
 * that LDCESessionEngine (core/modules/communication/ldce-session-engine.js)
 * already emits real, disclosed lifecycle events and already writes
 * matching human-readable text via its own #logToTranscript() — this
 * file only forwards that already-real text through the one shared
 * voice authority (LivingAssistant.announceStatus(), which itself calls
 * the existing private #speak() -> VoiceManager chain). No new AI, no
 * new speak path, no invented status text.
 *
 * TEXT SOURCE HONESTY
 *   "Session started."/"Session paused."/"Session resumed." are the
 *   exact strings LDCESessionEngine's own #logToTranscript() already
 *   writes for these same three events (session-started/paused/
 *   resumed) — copied here, not invented. "Session ended."/"Session
 *   cancelled." are the plain, unembellished description of what each
 *   event name itself represents; the real #emit() payload for both is
 *   {sessionId} only (no actorId/reason), so no additional detail is
 *   fabricated for them here.
 *
 * DELIBERATELY NARROW SCOPE
 *   Only the five session-level lifecycle events. Participant-level
 *   events (participant-joined/left/invited/role-changed/language-
 *   changed/state-changed, metadata-changed, translation-session-linked,
 *   signaling-*) are NOT voiced by this file — each carries per-person
 *   or per-connection detail this pass has not traced a safe, honest
 *   spoken form for, and voicing them was not proven necessary by the
 *   governing directive's own trace instructions. Extending this map is
 *   a separate, later decision, not assumed here.
 */
(function (root) {
    root.CozyOS = root.CozyOS || {};
    if (root.CozyOS.LiveSessionVoiceBridge) return;

    const VERSION = '1.0.0';

    // Frozen so the mapping itself cannot be silently expanded/altered by
    // anything other than a real edit to this file.
    const EVENT_TEXT = Object.freeze({
        'session-started': 'Session started.',
        'session-paused': 'Session paused.',
        'session-resumed': 'Session resumed.',
        'session-ended': 'Session ended.',
        'session-cancelled': 'Session cancelled.',
    });

    /**
     * install(opts) -> { unsubscribeAll }
     *
     * @param {object} [opts]
     * @param {object} [opts.ldceSessionEngine]  Test-injection seam / real CozyOS.LDCESessionEngine.
     * @param {object} [opts.livingAssistant]  Test-injection seam / real CozyOS.LivingAssistant.
     */
    function install(opts) {
        opts = opts || {};
        const ldce = opts.ldceSessionEngine || root.CozyOS.LDCESessionEngine;
        const assistant = opts.livingAssistant || root.CozyOS.LivingAssistant;

        if (!ldce || typeof ldce.on !== 'function' || !assistant || typeof assistant.announceStatus !== 'function') {
            // Honest no-op — matches this codebase's established
            // "fail closed, never fabricate the missing dependency"
            // convention (see e.g. LiveHostConsoleController).
            return { unsubscribeAll: () => {} };
        }

        const unsubscribers = Object.keys(EVENT_TEXT).map((eventName) => {
            return ldce.on(eventName, () => {
                try { assistant.announceStatus(EVENT_TEXT[eventName]); }
                catch (_err) { /* a voice failure must never break the real session lifecycle it is only reporting on */ }
            });
        });

        return {
            unsubscribeAll() {
                unsubscribers.forEach((fn) => { if (typeof fn === 'function') fn(); });
            },
        };
    }

    root.CozyOS.LiveSessionVoiceBridge = Object.freeze({
        getVersion() { return VERSION; },
        getEventTextMap() { return EVENT_TEXT; },
        install,
    });

    // Auto-install against the real singletons. Safe to call at this
    // script's own load time: dashboard.html/index.html load
    // ldce-session-engine.js and cozy-living-assistant.js earlier in the
    // page (both synchronously attach their singleton before any later
    // script runs), and this file's own <script> tag is placed after
    // both — see those files' own script-order comments.
    install();
})(typeof window !== 'undefined' ? window : globalThis);
