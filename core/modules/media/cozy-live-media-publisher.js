/**
 * core/modules/media/cozy-live-media-publisher.js
 * CozyOS — Live Participation — Real Media Publication ↔ Transport
 * Milestone: R040 Phase 4B (COS-STEP4A-CHECKPOINT continuation)
 *
 * REAL SCOPE DISCLOSURE
 *   The Phase 4A audit (this file's own predecessor,
 *   cozy-live-participation-controller.js) confirmed a permission-gated
 *   MediaStream could exist at the right moment, but explicitly
 *   disclosed that it did not implement WebRTC peer-connection
 *   publishing — that remained "a separate, already-scoped concern."
 *   Auditing that concern for Phase 4B found it was NOT actually
 *   scoped anywhere real: the only existing RTCPeerConnection code in
 *   this repository is core/engines/collaboration/live-hotspot-engine.js,
 *   which is a manual-SDP-copy/paste (or QR code) local-hotspot data/
 *   collaboration engine with no connection whatsoever to
 *   SessionAuthority, the live-relay signaling server, or the church
 *   session at all. This file is the real, previously-missing piece:
 *   it composes
 *     - CozyLiveParticipationController (this same directory) — the
 *       existing, unmodified hard gate on WHEN a MediaStream may exist
 *     - RemoteRelayTransportProvider's new sendWebrtcOffer()/
 *       sendWebrtcAnswer()/sendWebrtcIceCandidate() wire methods
 *       (R040 Phase 4B addition to that file) — the existing,
 *       authenticated signaling wire to the session
 *     - the standard, native RTCPeerConnection API — feature-detected,
 *       never assumed present (same honest pattern as
 *       live-hotspot-engine.js's own capabilities())
 *   No second transport abstraction, no second permission engine, no
 *   second signaling channel is created here.
 *
 *   HONEST BOUNDARY — read before trusting any "connected" claim:
 *     This composes PEER-TO-PEER (mesh) WebRTC signaling relayed
 *     through the existing server: a publisher creates one
 *     RTCPeerConnection per remote participant it publishes to. The
 *     server remains a signaling relay only (see
 *     live-distribution-signaling-server.js #_onWebrtcSignal —
 *     webrtcSfu stays false in its own health report). This file does
 *     NOT implement or claim an SFU/CDN that lets one upstream
 *     connection fan out media to many viewers without per-viewer
 *     peer connections — that remains explicitly out of scope and is
 *     the next real dependency (see server/live-relay/README.md
 *     "WebRTC/SFU media relay: Not implemented, not claimed").
 *     MEDIA_CONNECTED is only ever reported when the browser's own
 *     RTCPeerConnection.connectionState genuinely reports "connected"
 *     — never merely because a local MediaStream or offer exists.
 *
 * WIRING REQUIREMENT (read before use)
 *   This module does not itself listen to CozyLiveParticipationController's
 *   speaking-state events. If a moderator revokes speaking permission or
 *   removes the participant, CozyLiveParticipationController already
 *   hard-stops the underlying microphone track (deviceManager.stopMicrophone()),
 *   which will naturally silence outgoing audio, but the RTCPeerConnection(s)
 *   this file opened stay open until the integrating call site also calls
 *   stopAllPublishing(). The integrating call site MUST route
 *   CozyLiveParticipationController's onEvent("participation-state", ...)
 *   callback into this controller, e.g.:
 *
 *     const publisher = new CozyLiveMediaPublisher({ participationController, transportProvider, sessionId, userId });
 *     const controller = new CozyLiveParticipationController({
 *       deviceManager, transportProvider, sessionId, userId,
 *       onEvent: (name, detail) => {
 *         if (name === "participation-state" && detail.current !== "SPEAKING" && detail.current !== "SPEAKING_ALLOWED") {
 *           publisher.stopAllPublishing();
 *         }
 *       },
 *     });
 *
 *   Inbound webrtc-offer/webrtc-answer/webrtc-ice-candidate messages
 *   must also be routed here the same way
 *   CozyLiveParticipationController's own handleTransportEvent() is
 *   wired (see that file's header) — this module does not construct or
 *   own the transportProvider either.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CozyOS = root.CozyOS || {};
        root.CozyOS.CozyLiveMediaPublisher = factory();
    }
})(typeof window !== "undefined" ? window : globalThis, function () {
    "use strict";

    const PEER_STATE = Object.freeze({
        IDLE: "IDLE",
        MEDIA_CAPTURING: "MEDIA_CAPTURING",
        MEDIA_PUBLISHED: "MEDIA_PUBLISHED",
        MEDIA_CONNECTED: "MEDIA_CONNECTED",
        MEDIA_DEGRADED: "MEDIA_DEGRADED",
        MEDIA_DISCONNECTED: "MEDIA_DISCONNECTED",
        MEDIA_ERROR: "MEDIA_ERROR",
    });

    // Same disclosed default as live-hotspot-engine.js: free, public
    // Google STUN, no credentials required. TURN needs real
    // operator-provided credentials this environment does not have —
    // never fabricated or defaulted here either.
    const DEFAULT_ICE_SERVERS = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

    function _rtcAvailable() {
        return typeof RTCPeerConnection !== "undefined";
    }

    class CozyLiveMediaPublisher {
        /**
         * @param {object} opts
         * @param {object} opts.participationController  A CozyLiveParticipationController instance (not constructed here). Used only to READ getState() as the hard publish gate — never mutated.
         * @param {object} opts.transportProvider  A RemoteRelayTransportProvider instance (already connected/connecting for opts.sessionId), providing sendWebrtcOffer/sendWebrtcAnswer/sendWebrtcIceCandidate.
         * @param {string} opts.sessionId
         * @param {string} opts.userId  This participant's own id.
         * @param {Array<object>} [opts.iceServers]
         * @param {function(string, object)} [opts.onEvent]
         */
        constructor(opts = {}) {
            if (!opts.participationController) throw new TypeError("[CozyLiveMediaPublisher] opts.participationController is required.");
            if (!opts.transportProvider) throw new TypeError("[CozyLiveMediaPublisher] opts.transportProvider is required.");
            if (!opts.sessionId) throw new TypeError("[CozyLiveMediaPublisher] opts.sessionId is required.");
            if (!opts.userId) throw new TypeError("[CozyLiveMediaPublisher] opts.userId is required.");

            this._participation = opts.participationController;
            this._transport = opts.transportProvider;
            this._sessionId = opts.sessionId;
            this._userId = opts.userId;
            this._iceServers = Array.isArray(opts.iceServers) ? opts.iceServers : DEFAULT_ICE_SERVERS;
            this._onEvent = typeof opts.onEvent === "function" ? opts.onEvent : () => {};

            /** remoteUserId -> { pc, role: "publisher"|"receiver", state, pendingCandidates:[] } */
            this._peers = new Map();
        }

        capabilities() {
            return { webRTC: _rtcAvailable() };
        }

        getPeerState(remoteUserId) {
            return this._peers.get(remoteUserId)?.state || PEER_STATE.IDLE;
        }

        listPeers() {
            return Array.from(this._peers.keys());
        }

        _setPeerState(remoteUserId, next) {
            const rec = this._peers.get(remoteUserId);
            const previous = rec ? rec.state : PEER_STATE.IDLE;
            if (rec) rec.state = next;
            this._onEvent("media-peer-state", { remoteUserId, previous, current: next });
        }

        _createPeerConnection(remoteUserId, role) {
            const pc = new RTCPeerConnection({ iceServers: this._iceServers });
            const rec = { pc, role, state: PEER_STATE.IDLE, pendingCandidates: [] };
            this._peers.set(remoteUserId, rec);

            pc.onicecandidate = (evt) => {
                if (evt.candidate) this._transport.sendWebrtcIceCandidate(this._sessionId, remoteUserId, evt.candidate);
            };
            pc.ontrack = (evt) => {
                this._onEvent("remote-track", { remoteUserId, streams: evt.streams || [] });
            };
            pc.onconnectionstatechange = () => {
                const cs = pc.connectionState;
                if (cs === "connected") this._setPeerState(remoteUserId, PEER_STATE.MEDIA_CONNECTED);
                else if (cs === "disconnected") this._setPeerState(remoteUserId, PEER_STATE.MEDIA_DEGRADED);
                else if (cs === "failed" || cs === "closed") this._setPeerState(remoteUserId, PEER_STATE.MEDIA_DISCONNECTED);
            };
            return rec;
        }

        // -------------------------------------------------------------
        // Publisher path — HARD GATE identical in spirit to
        // CozyLiveParticipationController.startSpeaking(): this method
        // reads the participation controller's server-confirmed state
        // and refuses to create any RTCPeerConnection or send any offer
        // unless that state is SPEAKING or SPEAKING_ALLOWED. No local/
        // UI flag can override this — the same rule Phase 4A's
        // controller enforces for microphone capture itself now also
        // gates whether that stream may ever reach a real transport.
        // -------------------------------------------------------------

        /**
         * publishTo(remoteUserId, stream) — begin publishing an
         * already-captured MediaStream (the return value of
         * CozyLiveParticipationController.startSpeaking().stream — this
         * method never captures a microphone itself) to one specific
         * remote participant.
         */
        async publishTo(remoteUserId, stream) {
            const authState = this._participation.getState();
            if (authState !== "SPEAKING" && authState !== "SPEAKING_ALLOWED") {
                return { success: false, reason: "NOT_AUTHORIZED_TO_PUBLISH", currentState: authState };
            }
            if (!_rtcAvailable()) {
                return { success: false, reason: "WebRTC (RTCPeerConnection) is not available in this environment." };
            }
            if (!stream) return { success: false, reason: "A MediaStream is required to publish." };

            const rec = this._createPeerConnection(remoteUserId, "publisher");
            this._setPeerState(remoteUserId, PEER_STATE.MEDIA_CAPTURING);
            for (const track of stream.getTracks()) rec.pc.addTrack(track, stream);

            let offer;
            try {
                offer = await rec.pc.createOffer();
                await rec.pc.setLocalDescription(offer);
            } catch (err) {
                this._setPeerState(remoteUserId, PEER_STATE.MEDIA_ERROR);
                return { success: false, reason: `Failed to create/set local offer: ${err.message}` };
            }

            const dispatch = this._transport.sendWebrtcOffer(this._sessionId, remoteUserId, rec.pc.localDescription);
            this._setPeerState(remoteUserId, PEER_STATE.MEDIA_PUBLISHED);
            return { success: true, dispatched: dispatch.dispatched };
        }

        /** Re-verifies the SAME hard gate as publishTo() before honoring
         * a moderator/UI-triggered attempt to re-publish after a prior
         * revoke — a stale local peer/rec never bypasses this. */
        canPublish() {
            const authState = this._participation.getState();
            return authState === "SPEAKING" || authState === "SPEAKING_ALLOWED";
        }

        stopPublishingTo(remoteUserId) {
            const rec = this._peers.get(remoteUserId);
            if (!rec) return { success: false, reason: "No active peer connection for this participant." };
            try { rec.pc.close(); } catch (_e) { /* already closing */ }
            this._peers.delete(remoteUserId);
            this._setPeerState(remoteUserId, PEER_STATE.MEDIA_DISCONNECTED);
            return { success: true };
        }

        /** MUST be called by the integrating call site whenever
         * CozyLiveParticipationController's state leaves SPEAKING/
         * SPEAKING_ALLOWED (revoke, removal, self-leave) — see this
         * file's WIRING REQUIREMENT. Closes every open peer connection
         * this participant was publishing to; never silently leaves one
         * running past a server-side revoke. */
        stopAllPublishing() {
            const remoteUserIds = Array.from(this._peers.keys());
            for (const remoteUserId of remoteUserIds) {
                const rec = this._peers.get(remoteUserId);
                if (rec && rec.role === "publisher") this.stopPublishingTo(remoteUserId);
            }
            return { success: true, stopped: remoteUserIds.length };
        }

        // -------------------------------------------------------------
        // Receiver path — receiving media requires no speaking
        // authority (any joined participant may listen); this only
        // reacts to an inbound offer someone else's publishTo() sent.
        // -------------------------------------------------------------

        async _handleIncomingOffer(fromUserId, sdp) {
            if (!_rtcAvailable()) {
                this._onEvent("media-error", { remoteUserId: fromUserId, reason: "WebRTC (RTCPeerConnection) is not available in this environment." });
                return;
            }
            let rec = this._peers.get(fromUserId);
            if (!rec) rec = this._createPeerConnection(fromUserId, "receiver");

            try {
                await rec.pc.setRemoteDescription(sdp);
                for (const candidate of rec.pendingCandidates.splice(0)) {
                    try { await rec.pc.addIceCandidate(candidate); } catch (_e) { /* honestly best-effort — see header */ }
                }
                const answer = await rec.pc.createAnswer();
                await rec.pc.setLocalDescription(answer);
                this._transport.sendWebrtcAnswer(this._sessionId, fromUserId, rec.pc.localDescription);
                this._setPeerState(fromUserId, PEER_STATE.MEDIA_PUBLISHED);
            } catch (err) {
                this._setPeerState(fromUserId, PEER_STATE.MEDIA_ERROR);
                this._onEvent("media-error", { remoteUserId: fromUserId, reason: `Failed to answer offer: ${err.message}` });
            }
        }

        async _handleIncomingAnswer(fromUserId, sdp) {
            const rec = this._peers.get(fromUserId);
            if (!rec) return; // no matching outbound offer on record — honestly ignored, not fabricated
            try {
                await rec.pc.setRemoteDescription(sdp);
            } catch (err) {
                this._setPeerState(fromUserId, PEER_STATE.MEDIA_ERROR);
                this._onEvent("media-error", { remoteUserId: fromUserId, reason: `Failed to apply answer: ${err.message}` });
            }
        }

        async _handleIncomingIceCandidate(fromUserId, candidate) {
            let rec = this._peers.get(fromUserId);
            if (!rec) return; // candidate for a peer we have no record of — honestly dropped, not fabricated
            if (!rec.pc.remoteDescription) { rec.pendingCandidates.push(candidate); return; }
            try { await rec.pc.addIceCandidate(candidate); } catch (_e) { /* honestly best-effort — see header */ }
        }

        // -------------------------------------------------------------
        // Inbound: transport events (see WIRING REQUIREMENT — the call
        // site must route the transport provider's onEvent(type, msg)
        // here, same convention as CozyLiveParticipationController).
        // -------------------------------------------------------------

        handleTransportEvent(type, msg) {
            if (!msg || msg.sessionId !== this._sessionId) return;
            switch (type) {
                case "webrtc-offer":
                    if (msg.targetUserId === this._userId) this._handleIncomingOffer(msg.fromUserId, msg.sdp);
                    break;
                case "webrtc-answer":
                    if (msg.targetUserId === this._userId) this._handleIncomingAnswer(msg.fromUserId, msg.sdp);
                    break;
                case "webrtc-ice-candidate":
                    if (msg.targetUserId === this._userId) this._handleIncomingIceCandidate(msg.fromUserId, msg.candidate);
                    break;
                default:
                    break; // not a media-signaling event this module owns
            }
        }
    }

    return { CozyLiveMediaPublisher, PEER_STATE };
});
