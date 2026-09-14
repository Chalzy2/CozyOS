'use strict';

/**
 * core/shell/live/ui/cozy-live-host-console-controller.js
 * STEP 4D / LIVE UI ENTRY, Patch #2
 *
 * Pure controller logic for the new Live Host Console. Deliberately
 * separated from cozy-live-host-console.html's DOM wiring so it can be
 * unit-tested the same way live-entry-point.js is tested — via
 * dependency injection, no browser required.
 *
 * WHAT THIS FILE OWNS
 *   Exactly one action: read the real signed-in identity and call
 *   LiveEntryPoint.goLive(). Nothing else.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 *   - Does not read or supply a uid itself. It checks
 *     CozyOS.Session.current() only to decide whether to even attempt
 *     goLive() (reject unauthenticated users before calling it);
 *     goLive() itself is the only place a uid is ever read for the
 *     actual session creation, exactly as live-entry-point.js requires.
 *   - Does not touch CozyLiveSession, the old demo-identity helper, or
 *     any other path from cozy-living-live-surface-dashboard.html.
 *   - Does not choose or expose relay transport — transportMode is a
 *     fixed, explicit "mesh-only" (see PRODUCTION-SPEC-live-host-console.md
 *     for why: no relay config UI exists yet, and inventing one is new
 *     transport logic that is out of scope here).
 *   - Does not claim success before LiveEntryPoint.goLive() actually
 *     resolves with { success: true }.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CozyOS = root.CozyOS || {};
        root.CozyOS.LiveHostConsoleController = factory().LiveHostConsoleController;
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    const VERSION = '1.0.0';
    const TRANSPORT_MODE = 'mesh-only'; // explicit; see spec doc — not a default, a fixed choice for this page's current scope.

    /**
     * createController(opts) -> { handleGoLive }
     *
     * @param {object} [opts]
     * @param {object} [opts.root]  Test-injection seam / real window.
     * @param {object} [opts.LiveEntryPoint]  Test-injection seam / real CozyOS.LiveEntryPoint.
     */
    function createController(opts) {
        opts = opts || {};
        const root = opts.root || (typeof window !== 'undefined' ? window : globalThis);
        const liveEntryPoint = opts.LiveEntryPoint || (root.CozyOS && root.CozyOS.LiveEntryPoint);
        const mediaCoordinator = opts.LiveMediaCoordinator || (root.CozyOS && root.CozyOS.LiveMediaCoordinator);

        /**
         * handleGoLive(fields) -> { success, state, sessionId?, uid?, reason? }
         * state is one of: "unauthenticated" | "unavailable" | "error" | "live"
         *
         * @param {object} [fields]  Optional forwarded fields (title/language/metadata) — see spec doc, no form exists yet so these are typically undefined.
         */
        async function handleGoLive(fields) {
            fields = fields || {};

            const session = root.CozyOS && root.CozyOS.Session;
            const current = session && typeof session.current === 'function' ? session.current() : null;
            if (!current || !current.uid) {
                return { success: false, state: 'unauthenticated', reason: 'You must be signed in to go live.' };
            }

            if (!liveEntryPoint || typeof liveEntryPoint.goLive !== 'function') {
                return { success: false, state: 'unavailable', reason: 'LiveEntryPoint is not available.' };
            }

            const result = await liveEntryPoint.goLive({
                transportMode: TRANSPORT_MODE,
                title: fields.title,
                language: fields.language,
                metadata: fields.metadata,
                _root: root,
            });

            if (!result || !result.success) {
                return { success: false, state: 'error', reason: (result && result.reason) || 'Go Live failed for an unknown reason.' };
            }

            return { success: true, state: 'live', sessionId: result.sessionId, uid: result.uid };
        }

        /**
         * handleStartMedia(sessionId, videoElement, hooks) -> LiveMediaCoordinator.startHostMedia() result
         * STEP 4D / LIVE UI, PART F addition — additive, does not change handleGoLive().
         * Requests explicit camera/microphone consent and starts servicing
         * the one Stage-1 viewer. Never called automatically by handleGoLive().
         */
        async function handleStartMedia(sessionId, videoElement, hooks) {
            hooks = hooks || {};
            if (!mediaCoordinator || typeof mediaCoordinator.startHostMedia !== 'function') {
                return { success: false, state: 'unavailable', reason: 'LiveMediaCoordinator is not available.' };
            }
            return mediaCoordinator.startHostMedia({
                sessionId,
                videoElement,
                onSecondViewerRejected: hooks.onSecondViewerRejected,
                onViewerConnectionResult: hooks.onViewerConnectionResult,
                _root: root,
            });
        }

        /** handleStopMedia(sessionId) -> LiveMediaCoordinator.stopHostMedia() result */
        function handleStopMedia(sessionId) {
            if (!mediaCoordinator || typeof mediaCoordinator.stopHostMedia !== 'function') {
                return { success: false, reason: 'LiveMediaCoordinator is not available.' };
            }
            return mediaCoordinator.stopHostMedia({ sessionId, _root: root });
        }

        return { handleGoLive, handleStartMedia, handleStopMedia };
    }

    const LiveHostConsoleController = Object.freeze({
        getVersion() { return VERSION; },
        getTransportMode() { return TRANSPORT_MODE; },
        createController,
    });

    return { LiveHostConsoleController };
});
