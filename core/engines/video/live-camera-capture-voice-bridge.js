'use strict';

/**
 * core/engines/video/live-camera-capture-voice-bridge.js
 *
 * Universal CozyOS Voice — Application Integration Matrix, Live Camera
 * Capture row. Real trace (VOICE-APPLICATION-INTEGRATION-AUDIT.md §5.1)
 * found that LiveVideoCapture (live-video-capture-engine.js) already
 * has a real on()/#emit() event surface with zero subscribers anywhere
 * in the repository — a live, disclosed, but entirely unused
 * broadcast. This file is the first subscriber, forwarding those real
 * events through the one shared voice authority
 * (LivingAssistant.announceStatus(), which itself calls the existing
 * private #speak() -> VoiceManager chain — the exact same entry point
 * live-session-voice-bridge.js uses for the Live Session row).
 *
 * TEXT SOURCE HONESTY
 *   No existing human-readable sentence exists anywhere for these
 *   engine events (unlike Live Session's #logToTranscript() strings) —
 *   the standalone camera dashboard constructs its own inline strings
 *   from *return values*, not from these events, so there is no
 *   canonical wording to reuse or duplicate. The sentences below state
 *   only what the real, disclosed event itself represents (a plain
 *   present-tense confirmation of the action, or the engine's own real
 *   error message) — never a description of captured image/video
 *   content, which this app has no capability to produce and must not
 *   fabricate via voice (explicit Matrix constraint).
 *
 * DELIBERATE OMISSIONS
 *   cameraConnected/cameraDisconnected are NOT voiced separately: both
 *   always fire in the same call as previewStarted/previewStopped
 *   (see live-video-capture-engine.js's own startPreview()/
 *   stopPreview()), so voicing both would announce the same real user-
 *   facing action twice in a row. previewStarted/previewStopped alone
 *   cover it honestly.
 */
(function (root) {
    root.CozyOS = root.CozyOS || {};
    if (root.CozyOS.LiveCameraCaptureVoiceBridge) return;

    const VERSION = '1.0.0';

    // Handlers, not a flat text map (unlike live-session-voice-bridge.js):
    // "error" is the one event here whose real payload (event.message)
    // must be included, since the engine's own honest error string is
    // the only description of WHAT went wrong — omitting it would make
    // the announcement less true, not more careful.
    function buildTextMap() {
        return Object.freeze({
            previewStarted: () => 'Camera preview started.',
            previewStopped: () => 'Camera preview stopped.',
            photoCaptured: () => 'Photo captured.',
            recordStarted: () => 'Recording started.',
            recordStopped: () => 'Recording stopped.',
            recordPaused: () => 'Recording paused.',
            recordResumed: () => 'Recording resumed.',
            error: (detail) => {
                const message = detail && typeof detail.message === 'string' && detail.message.trim();
                return message ? `Camera error: ${message}` : 'Camera error.';
            },
        });
    }

    /**
     * install(opts) -> { unsubscribeAll }
     *
     * @param {object} [opts]
     * @param {object} [opts.liveVideoCapture]  Test-injection seam / real CozyOS.LiveVideoCapture.
     * @param {object} [opts.livingAssistant]  Test-injection seam / real CozyOS.LivingAssistant.
     */
    function install(opts) {
        opts = opts || {};
        const engine = opts.liveVideoCapture || root.CozyOS.LiveVideoCapture;
        const assistant = opts.livingAssistant || root.CozyOS.LivingAssistant;

        if (!engine || typeof engine.on !== 'function' || !assistant || typeof assistant.announceStatus !== 'function') {
            // Honest no-op — same "fail closed, never fabricate the
            // missing dependency" convention as live-session-voice-bridge.js.
            return { unsubscribeAll: () => {} };
        }

        const textMap = buildTextMap();
        // core/engines/video/live-video-capture-engine.js's own on()
        // never returns an unsubscribe function (unlike LDCESessionEngine's),
        // so this file tracks handlers itself and relies on the engine's
        // real #listeners Set for detachment via its own off()-equivalent
        // if one is ever added; today there is none, so unsubscribeAll()
        // here only stops THIS bridge's own handlers from acting, for
        // test isolation — it does not remove them from the engine.
        const activeHandlers = [];
        Object.keys(textMap).forEach((eventName) => {
            let active = true;
            const handler = (detail) => {
                if (!active) return;
                try { assistant.announceStatus(textMap[eventName](detail)); }
                catch (_err) { /* a voice failure must never break the real camera engine it is only reporting on */ }
            };
            engine.on(eventName, handler);
            activeHandlers.push(() => { active = false; });
        });

        return {
            unsubscribeAll() {
                activeHandlers.forEach((deactivate) => deactivate());
            },
        };
    }

    root.CozyOS.LiveCameraCaptureVoiceBridge = Object.freeze({
        getVersion() { return VERSION; },
        getEventTextMap() { return buildTextMap(); },
        install,
    });

    // Auto-install against the real singletons — safe at this script's
    // own load time; see dashboard.html/index.html's own comment on
    // this file's required script order (after both real dependencies).
    install();
})(typeof window !== 'undefined' ? window : globalThis);
