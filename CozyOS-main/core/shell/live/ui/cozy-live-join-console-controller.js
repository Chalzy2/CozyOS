'use strict';

/**
 * core/shell/live/ui/cozy-live-join-console-controller.js
 * STEP 4D / LIVE UI / PART B — DIRECT JOIN
 *
 * Pure controller logic for direct Join Live: the viewer already
 * possesses a legitimate LDCE sessionId (e.g. shared out-of-band) and
 * enters it manually. Deliberately separated from
 * cozy-live-join-console.html's DOM wiring so it can be unit-tested
 * the same way live-entry-point.js and the host console controller
 * are tested — via dependency injection, no browser required.
 *
 * WHAT THIS FILE OWNS
 *   Exactly one action: validate a caller-supplied sessionId against
 *   the real signed-in identity, then call LiveEntryPoint.joinLive().
 *   Nothing else.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 *   - Does not discover, list, or guess a sessionId on the caller's
 *     behalf. The previous audit checkpoint (COS-STEP4D-LIVE-UI-PATCH-2-AUDIT.zip)
 *     confirmed no production discovery mechanism exists anywhere in
 *     the repository. This file only accepts a sessionId the caller
 *     already has.
 *   - Does not read or supply a uid itself, and never accepts one from
 *     the caller. It checks CozyOS.Session.current() only to decide
 *     whether to even attempt joinLive() (reject unauthenticated
 *     viewers before calling it); joinLive() itself is the only place
 *     a uid is ever read for the actual join.
 *   - Does not touch CozyLiveSession or any path from
 *     cozy-living-live-surface-dashboard.html.
 *   - Does not choose or expose relay transport — transportMode is a
 *     fixed, explicit "mesh-only", same scope decision as the host
 *     console controller (see PRODUCTION-SPEC-live-host-console.md).
 *   - Does not manufacture a fallback session or claim success before
 *     LiveEntryPoint.joinLive() actually resolves with { success: true }.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CozyOS = root.CozyOS || {};
        root.CozyOS.LiveJoinConsoleController = factory().LiveJoinConsoleController;
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    const VERSION = '1.0.0';
    const TRANSPORT_MODE = 'mesh-only'; // explicit; same scope decision as the host console — no relay config UI exists yet.

    /**
     * createController(opts) -> { join }
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
         * join(rawSessionId) -> { success, state, sessionId?, uid?, role?, reason? }
         * state is one of: "unauthenticated" | "missing-session-id" | "unavailable" | "error" | "joined"
         *
         * @param {string} rawSessionId  Caller-supplied sessionId (from the UI's text input). Only whitespace is trimmed — never generated, guessed, or substituted.
         */
        async function join(rawSessionId) {
            const session = root.CozyOS && root.CozyOS.Session;
            const current = session && typeof session.current === 'function' ? session.current() : null;
            if (!current || !current.uid) {
                return { success: false, state: 'unauthenticated', reason: 'You must be signed in to join a live session.' };
            }

            const sessionId = typeof rawSessionId === 'string' ? rawSessionId.trim() : '';
            if (!sessionId) {
                return { success: false, state: 'missing-session-id', reason: 'Enter a live session ID to join.' };
            }

            if (!liveEntryPoint || typeof liveEntryPoint.joinLive !== 'function') {
                return { success: false, state: 'unavailable', reason: 'LiveEntryPoint is not available.' };
            }

            const result = await liveEntryPoint.joinLive({
                transportMode: TRANSPORT_MODE,
                sessionId,
                _root: root,
            });

            if (!result || !result.success || !result.sessionId) {
                return { success: false, state: 'error', reason: (result && result.reason) || 'Join failed for an unknown reason.' };
            }

            return { success: true, state: 'joined', sessionId: result.sessionId, uid: result.uid, role: result.role };
        }

        /**
         * handleJoinMedia(sessionId, remoteVideoElement) -> LiveMediaCoordinator.joinAsViewerMedia() result
         * STEP 4D / LIVE UI, PART F addition — additive, does not change join().
         * Must be called only after join() has already resolved with
         * { success: true } for this sessionId. Never publishes the
         * viewer's own camera/microphone.
         */
        async function handleJoinMedia(sessionId, remoteVideoElement, hooks) {
            hooks = hooks || {};
            if (!mediaCoordinator || typeof mediaCoordinator.joinAsViewerMedia !== 'function') {
                return { success: false, state: 'unavailable', reason: 'LiveMediaCoordinator is not available.' };
            }
            return mediaCoordinator.joinAsViewerMedia({ sessionId, remoteVideoElement, onConnectionFailed: hooks.onConnectionFailed, _root: root });
        }

        /** handleLeaveMedia(sessionId, unsubscribe) -> LiveMediaCoordinator.leaveViewerMedia() result */
        function handleLeaveMedia(sessionId, unsubscribe) {
            if (!mediaCoordinator || typeof mediaCoordinator.leaveViewerMedia !== 'function') {
                return { success: false, reason: 'LiveMediaCoordinator is not available.' };
            }
            return mediaCoordinator.leaveViewerMedia({ sessionId, unsubscribe, _root: root });
        }

        return { join, handleJoinMedia, handleLeaveMedia };
    }

    const LiveJoinConsoleController = Object.freeze({
        getVersion() { return VERSION; },
        getTransportMode() { return TRANSPORT_MODE; },
        createController,
    });

    return { LiveJoinConsoleController };
});
