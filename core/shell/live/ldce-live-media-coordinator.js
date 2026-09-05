'use strict';

/**
 * core/shell/live/ldce-live-media-coordinator.js
 * STEP 4D / LIVE UI, PART F — LDCE NATIVE MEDIA + MINIMAL 1:1 MEDIA PATH
 *
 * REAL SCOPE DISCLOSURE
 *   Part E's audit (COS-STEP4D-LIVE-UI-PATCH-5-AUDIT.zip) confirmed that
 *   core/modules/communication/ldce-media-session-engine.js is a real,
 *   already-shipped LDCE-native media module, but that no production
 *   caller wires it to a host going live or a viewer joining. This file
 *   is that smallest orchestration seam — nothing more.
 *
 *   It composes two already-real, already-tested pieces, in order:
 *     1. window.CozyOS.LDCESessionEngine — real session/roster/host
 *        identity (getSession, getParticipant, listenForOffer,
 *        "participant-joined" event). This file does not touch its
 *        internals, does not add methods to it, and does not duplicate
 *        its session/roster/language ownership.
 *     2. window.CozyOS.LDCEMediaSessionEngine — real camera/mic capture
 *        and peer-connection orchestration (attachLocalMedia,
 *        connectToPeer, acceptPeerConnection, getRemoteStreams/
 *        "remote-track"). This file does not reimplement WebRTC or
 *        media capture; it only decides WHEN to call these and wires
 *        the resulting MediaStream to a caller-supplied UI element.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO (Part F Section 3/11)
 *   - Does not own Firebase authentication, identity storage,
 *     SessionAuthority, speaking authorization, moderation, translation,
 *     captions, LDCE roster internals, transport implementation,
 *     worldwide discovery, or any SFU behavior.
 *   - Does not touch LDCESessionEngine, Patch #6 relay
 *     (live-relay-composition-bridge.js / cozy-live-participation-
 *     controller.js / cozy-live-remote-relay-transport-provider.js /
 *     cozy-live-playback-receiver.js), CozyLiveSession, or
 *     living-worship-player.js. This file references none of them.
 *   - Does not invent signaling. Offer/answer exchange is entirely
 *     LDCESessionEngine.initiateSignaling()/listenForOffer()/
 *     answerOffer()/completeSignaling(), reached only through
 *     LDCEMediaSessionEngine's own connectToPeer()/acceptPeerConnection()
 *     wrappers.
 *   - Does not implement session discovery. The caller must already
 *     have a sessionId (from LiveEntryPoint.goLive()/joinLive()).
 *   - Does not silently activate camera/microphone. startHostMedia()
 *     only ever calls LDCEMediaSessionEngine.attachLocalMedia(), whose
 *     real getUserMedia() prompt is the one and only consent gate; a
 *     denial/failure is propagated honestly, never overridden or
 *     retried as success.
 *   - Does not let the viewer auto-publish camera/microphone.
 *     joinAsViewerMedia() never calls attachLocalMedia() for the
 *     viewer; connectToPeer() is called with the viewer's (empty)
 *     local capture, which is a real receive-only connection.
 *   - Does not allow more than one viewer to be serviced per session
 *     (Stage-1 bound). A second "participant-joined" event for a
 *     session that already has an accepted viewer is explicitly
 *     ignored — reported via opts.onSecondViewerRejected, never
 *     silently connected and never enforced by modifying
 *     LDCESessionEngine's roster.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CozyOS = root.CozyOS || {};
        root.CozyOS.LiveMediaCoordinator = factory().LiveMediaCoordinator;
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const VERSION = '1.0.0';
    const MAX_VIEWERS_PER_SESSION = 1; // Stage-1 bound — see Part F Section 7. Not a claim of multi-viewer scaling.

    /** _currentUid() — the ONLY place this file reads identity, same pattern/contract as live-entry-point.js's _currentUid(). Never a caller-supplied uid unless explicitly injected for tests via opts._uid. */
    function _currentUid(root) {
        const session = root.CozyOS && root.CozyOS.Session;
        if (!session || typeof session.current !== 'function') return null;
        const current = session.current();
        return current && typeof current.uid === 'string' && current.uid ? current.uid : null;
    }

    function _ldce(root, opts) {
        const engine = opts._LDCESessionEngine || (root.CozyOS && root.CozyOS.LDCESessionEngine);
        return engine && typeof engine.getSession === 'function' && typeof engine.getParticipant === 'function' ? engine : null;
    }

    function _media(root, opts) {
        const engine = opts._LDCEMediaSessionEngine || (root.CozyOS && root.CozyOS.LDCEMediaSessionEngine);
        return engine && typeof engine.attachLocalMedia === 'function' && typeof engine.connectToPeer === 'function' ? engine : null;
    }

    // Per-sessionId host-side coordination bookkeeping (which viewer has been
    // accepted, and the unsubscribe handle for the "participant-joined"
    // listener). This is the ONLY new state this file owns — it never
    // duplicates LDCESessionEngine's own roster or LDCEMediaSessionEngine's
    // own connection map.
    const _hostState = new Map(); // sessionId -> { acceptedViewerId, unsubscribe }

    /**
     * startHostMedia(opts) -> { success, state, sessionId?, uid?, reason? }
     * state: "unauthenticated" | "missing-session-id" | "unavailable" |
     *        "unknown-session" | "not-host" | "media-denied" | "live-media-active"
     *
     * Host path. Requires explicit camera/microphone consent (real
     * getUserMedia() via attachLocalMedia()), then listens for exactly one
     * viewer to join and services that one viewer's offer.
     *
     * @param {object} opts
     * @param {string} opts.sessionId  Required. An existing LDCE sessionId this file did not create (from LiveEntryPoint.goLive()).
     * @param {*} [opts.videoElement]  Local preview element, forwarded to LDCEMediaSessionEngine.attachLocalMedia().
     * @param {string} [opts.deviceId]
     * @param {function} [opts.onSecondViewerRejected]  Called (never throws the caller) when a second viewer joins after one is already accepted.
     * @param {function} [opts.onViewerConnectionResult]  Called with the real acceptPeerConnection() result once the one accepted viewer's offer is answered.
     * @param {object} [opts._root] Test-injection seam.
     * @param {object} [opts._LDCESessionEngine] Test-injection seam.
     * @param {object} [opts._LDCEMediaSessionEngine] Test-injection seam.
     * @param {string} [opts._uid] Test-injection seam.
     */
    async function startHostMedia(opts) {
        opts = opts || {};
        const root = opts._root || (typeof window !== 'undefined' ? window : globalThis);

        if (!opts.sessionId) return { success: false, state: 'missing-session-id', reason: 'opts.sessionId is required. Failing closed.' };

        const uid = opts._uid !== undefined ? opts._uid : _currentUid(root);
        if (!uid) return { success: false, state: 'unauthenticated', reason: 'No authenticated CozyOS.Session user. Failing closed.' };

        const ldce = _ldce(root, opts);
        if (!ldce) return { success: false, state: 'unavailable', reason: 'LDCESessionEngine is not available. Failing closed.' };
        const media = _media(root, opts);
        if (!media) return { success: false, state: 'unavailable', reason: 'LDCEMediaSessionEngine is not available. Failing closed.' };

        const session = ldce.getSession(opts.sessionId);
        if (!session) return { success: false, state: 'unknown-session', reason: 'Unknown LDCE session. Failing closed.' };

        // The authenticated identity remains authoritative — a caller cannot substitute another uid as "host" (Part F Section 5).
        if (session.hostId !== uid) return { success: false, state: 'not-host', reason: 'Only the real LDCE session host may start host media. Failing closed.' };

        // Explicit consent gate — the ONLY camera/mic activation in this file. A denial/failure is propagated honestly; no session is falsely reported live.
        const attachResult = await media.attachLocalMedia(opts.sessionId, uid, opts.videoElement, { deviceId: opts.deviceId || null });
        if (!attachResult || !attachResult.success) {
            return { success: false, state: 'media-denied', reason: (attachResult && attachResult.reason) || 'Camera/microphone capture failed or was denied.' };
        }

        const hostState = { acceptedViewerId: null, unsubscribeJoined: null, unsubscribeLeft: null };
        _hostState.set(opts.sessionId, hostState);

        function _serviceViewer(viewerId) {
            hostState.acceptedViewerId = viewerId;
            ldce.listenForOffer(opts.sessionId, viewerId, uid, async (offerCode) => {
                const acceptResult = await media.acceptPeerConnection(opts.sessionId, uid, viewerId, offerCode);
                // TASK 2/K fix (Part H): a failed negotiation must not leave the one-viewer
                // slot permanently occupied by a peer that never actually connected — that
                // would silently reject every future (and even the same, non-rejoin-shaped)
                // viewer forever. Only clear the slot if it still points at this viewerId
                // (a rejoin or a newer service call may have already replaced it).
                if ((!acceptResult || !acceptResult.success) && hostState.acceptedViewerId === viewerId) {
                    hostState.acceptedViewerId = null;
                }
                if (typeof opts.onViewerConnectionResult === 'function') opts.onViewerConnectionResult({ sessionId: opts.sessionId, viewerId, ...acceptResult });
            });
        }

        // TASK 2/L fix (Part H): ICE/connection failure after a successful accept previously
        // went undetected — the host-side slot and the (now-dead) peer connection would
        // survive forever, silently blocking the one-viewer slot. Composes the real, already-
        // existing LDCEMediaSessionEngine "connection-state-changed" event (itself a
        // passthrough of LiveHotspotEngine's real RTCPeerConnection state) — no new transport
        // or polling is invented here. Only the terminal states are acted on; "disconnected"
        // is often transient in real WebRTC and is deliberately left alone.
        const TERMINAL_CONNECTION_STATES = new Set(['failed', 'closed']);
        hostState.unsubscribeConnectionState = typeof media.on === 'function' ? media.on('connection-state-changed', (evt) => {
            if (!evt || evt.sessionId !== opts.sessionId) return;
            if (!hostState.acceptedViewerId || hostState.acceptedViewerId !== evt.userId) return;
            if (!TERMINAL_CONNECTION_STATES.has(evt.connectionState)) return;
            media.disconnectFromPeer(opts.sessionId, evt.userId);
            hostState.acceptedViewerId = null;
            if (typeof opts.onViewerConnectionResult === 'function') {
                opts.onViewerConnectionResult({ sessionId: opts.sessionId, viewerId: evt.userId, success: false, reason: `Peer connection ended (${evt.connectionState}).` });
            }
        }) : null;

        hostState.unsubscribeJoined = ldce.on('participant-joined', (evt) => {
            if (!evt || evt.sessionId !== opts.sessionId) return;
            if (evt.userId === uid) return; // the host's own createSession() roster entry — never treated as a viewer

            if (hostState.acceptedViewerId && hostState.acceptedViewerId === evt.userId) {
                // The already-accepted viewer rejoining (e.g. after a Join/Leave/Join cycle) — a
                // reconnect, not a second viewer. Tear down any stale peer connection for them
                // first (real disconnectFromPeer(), never reimplemented here), then re-service.
                media.disconnectFromPeer(opts.sessionId, evt.userId);
                _serviceViewer(evt.userId);
                return;
            }

            if (hostState.acceptedViewerId) {
                // One-viewer limit (Part F Section 7) — enforced here only, never by redesigning LDCESessionEngine's roster.
                if (typeof opts.onSecondViewerRejected === 'function') opts.onSecondViewerRejected({ sessionId: opts.sessionId, userId: evt.userId });
                return;
            }

            _serviceViewer(evt.userId);
        });

        // Real LDCESessionEngine "participant-left" (already exists — this file only listens,
        // it does not add it). Frees the one-viewer slot and tears down the now-stale host-side
        // peer connection so a different viewer (or the same one rejoining later) is serviced
        // cleanly instead of leaving a dangling RTCPeerConnection.
        hostState.unsubscribeLeft = typeof ldce.on === 'function' ? ldce.on('participant-left', (evt) => {
            if (!evt || evt.sessionId !== opts.sessionId) return;
            if (!hostState.acceptedViewerId || hostState.acceptedViewerId !== evt.userId) return;
            media.disconnectFromPeer(opts.sessionId, evt.userId);
            hostState.acceptedViewerId = null;
        }) : null;

        return { success: true, state: 'live-media-active', sessionId: opts.sessionId, uid };
    }

    /**
     * stopHostMedia(opts) -> { success, reason? }
     * Real teardown: stops the participant-joined listener, then composes
     * LDCEMediaSessionEngine.cleanupSession() (its own real peer-connection +
     * local-capture teardown — never reimplemented here).
     */
    function stopHostMedia(opts) {
        opts = opts || {};
        const root = opts._root || (typeof window !== 'undefined' ? window : globalThis);
        if (!opts.sessionId) return { success: false, reason: 'opts.sessionId is required.' };

        const uid = opts._uid !== undefined ? opts._uid : _currentUid(root);
        const media = _media(root, opts);

        const hostState = _hostState.get(opts.sessionId);
        if (hostState && typeof hostState.unsubscribeJoined === 'function') hostState.unsubscribeJoined();
        if (hostState && typeof hostState.unsubscribeLeft === 'function') hostState.unsubscribeLeft();
        if (hostState && typeof hostState.unsubscribeConnectionState === 'function') hostState.unsubscribeConnectionState();
        _hostState.delete(opts.sessionId);

        if (media && uid) media.cleanupSession(opts.sessionId, uid);

        // TASK 4 (Part H): close the real LDCE session through the existing mechanism —
        // previously stopHostMedia() only tore down media/peer state and left the LDCE
        // session itself "active" forever, even though the host console has no other way
        // to end it. Best-effort and fire-and-forget: endSession() is real and async, but
        // this function's signature (and every existing caller/test) is synchronous, so a
        // failure here must never surface as a stopHostMedia() failure — the media teardown
        // above has already genuinely happened either way.
        const ldce = _ldce(root, opts);
        if (ldce && uid && typeof ldce.endSession === 'function') {
            try {
                const maybePromise = ldce.endSession(opts.sessionId, uid, { confirm: true });
                if (maybePromise && typeof maybePromise.catch === 'function') maybePromise.catch(() => { /* best-effort */ });
            } catch (_err) { /* best-effort — media teardown above already succeeded */ }
        }

        return { success: true };
    }

    /**
     * joinAsViewerMedia(opts) -> { success, state, sessionId?, uid?, hostId?, unsubscribe?, reason? }
     * state: "unauthenticated" | "missing-session-id" | "unavailable" |
     *        "not-joined" | "unknown-session" | "connect-failed" | "connecting"
     *
     * Viewer path. Requires the caller to already be a joined LDCE
     * participant (via LiveEntryPoint.joinLive()). Never publishes the
     * viewer's own camera/microphone — only receives the host's stream.
     *
     * @param {object} opts
     * @param {string} opts.sessionId  Required. Known LDCE sessionId the viewer already joined.
     * @param {*} [opts.remoteVideoElement]  If supplied, its .srcObject is set to the host's real remote MediaStream when it arrives.
     * @param {object} [opts._root] Test-injection seam.
     * @param {object} [opts._LDCESessionEngine] Test-injection seam.
     * @param {object} [opts._LDCEMediaSessionEngine] Test-injection seam.
     * @param {string} [opts._uid] Test-injection seam.
     */
    async function joinAsViewerMedia(opts) {
        opts = opts || {};
        const root = opts._root || (typeof window !== 'undefined' ? window : globalThis);

        if (!opts.sessionId) return { success: false, state: 'missing-session-id', reason: 'opts.sessionId is required. Failing closed.' };

        const uid = opts._uid !== undefined ? opts._uid : _currentUid(root);
        if (!uid) return { success: false, state: 'unauthenticated', reason: 'No authenticated CozyOS.Session user. Failing closed.' };

        const ldce = _ldce(root, opts);
        if (!ldce) return { success: false, state: 'unavailable', reason: 'LDCESessionEngine is not available. Failing closed.' };
        const media = _media(root, opts);
        if (!media) return { success: false, state: 'unavailable', reason: 'LDCEMediaSessionEngine is not available. Failing closed.' };

        const participant = ldce.getParticipant(opts.sessionId, uid, uid);
        if (!participant) return { success: false, state: 'not-joined', reason: 'Not a joined participant of this session. Call LiveEntryPoint.joinLive() first. Failing closed.' };

        const session = ldce.getSession(opts.sessionId);
        if (!session || !session.hostId) return { success: false, state: 'unknown-session', reason: 'Unknown LDCE session or no resolvable host. Failing closed.' };
        const hostId = session.hostId;

        // Deliberately no attachLocalMedia() call here — the viewer never auto-publishes camera/microphone (Part F Section 4/6).
        let unsubscribeRemoteTrack = null;
        if (opts.remoteVideoElement) {
            unsubscribeRemoteTrack = media.on('remote-track', (evt) => {
                if (!evt || evt.sessionId !== opts.sessionId || evt.userId !== hostId) return;
                if (evt.streams && evt.streams[0]) opts.remoteVideoElement.srcObject = evt.streams[0];
            });
        }

        // TASK 2/L fix (Part H): the viewer side had no visibility into the connection ever
        // failing after it started — the UI would be stuck on "Connecting…" forever with a
        // black video element and no honest failure state. Composes the same real, existing
        // "connection-state-changed" event used on the host side; only the terminal states
        // are surfaced, and the caller-supplied video element's stale frame is cleared so the
        // UI never shows a frozen frame as if it were still live.
        let unsubscribeConnectionState = null;
        if (typeof media.on === 'function') {
            const TERMINAL_CONNECTION_STATES = new Set(['failed', 'closed']);
            unsubscribeConnectionState = media.on('connection-state-changed', (evt) => {
                if (!evt || evt.sessionId !== opts.sessionId || evt.userId !== hostId) return;
                if (!TERMINAL_CONNECTION_STATES.has(evt.connectionState)) return;
                if (opts.remoteVideoElement) opts.remoteVideoElement.srcObject = null;
                if (typeof opts.onConnectionFailed === 'function') {
                    opts.onConnectionFailed({ sessionId: opts.sessionId, hostId, connectionState: evt.connectionState });
                }
            });
        }

        const unsubscribeAll = () => {
            if (unsubscribeRemoteTrack) unsubscribeRemoteTrack();
            if (unsubscribeConnectionState) unsubscribeConnectionState();
        };

        const connectResult = await media.connectToPeer(opts.sessionId, uid, hostId);
        if (!connectResult || !connectResult.success) {
            unsubscribeAll();
            return { success: false, state: 'connect-failed', reason: (connectResult && connectResult.reason) || 'Could not connect to host media.' };
        }

        return { success: true, state: 'connecting', sessionId: opts.sessionId, uid, hostId, unsubscribe: unsubscribeAll };
    }

    /**
     * leaveViewerMedia(opts) -> { success, reason? }
     * Real teardown: composes LDCEMediaSessionEngine.disconnectFromPeer()
     * against the resolved host, then releases this file's own remote-track
     * subscription (if any).
     */
    function leaveViewerMedia(opts) {
        opts = opts || {};
        const root = opts._root || (typeof window !== 'undefined' ? window : globalThis);
        if (!opts.sessionId) return { success: false, reason: 'opts.sessionId is required.' };

        const uid = opts._uid !== undefined ? opts._uid : _currentUid(root);
        const ldce = _ldce(root, opts);
        const media = _media(root, opts);
        const session = ldce && ldce.getSession(opts.sessionId);
        if (media && session && session.hostId) media.disconnectFromPeer(opts.sessionId, session.hostId);
        if (typeof opts.unsubscribe === 'function') opts.unsubscribe();

        // Real LDCESessionEngine.leaveSession() — already exists, unchanged; this file only
        // calls it. Without this, the viewer's departure never reaches the session roster, so
        // the host never sees a "participant-left" and a later rejoin (same or different
        // viewer) can be serviced incorrectly. Best-effort: a leaveSession() failure here must
        // never fail the media teardown that already happened above.
        if (ldce && uid && typeof ldce.leaveSession === 'function') {
            try { ldce.leaveSession(opts.sessionId, uid); } catch (_err) { /* best-effort — media teardown above already succeeded */ }
        }

        return { success: true };
    }

    const LiveMediaCoordinator = Object.freeze({
        getVersion() { return VERSION; },
        getMaxViewersPerSession() { return MAX_VIEWERS_PER_SESSION; },
        startHostMedia,
        stopHostMedia,
        joinAsViewerMedia,
        leaveViewerMedia,
    });

    return { LiveMediaCoordinator };
});
