/**
 * core/modules/media/cozy-live-participation-controller.js
 * CozyOS — Live Participation — Speaking Authority ↔ Media Composition
 * Milestone: R040 Phase 4A (COS-STEP3-PH3E-CHECKPOINT continuation)
 *
 * REAL SCOPE DISCLOSURE
 *   The Phase 4A audit confirmed: SessionAuthority's speak-state machine
 *   (requestSpeaking/grantSpeaking/revokeSpeaking/getSpeakState) was fully
 *   real and fully tested server-side, but nothing in the repository
 *   actually connected it to a real microphone. This file is that
 *   connection. It creates no new authority, no new transport, no new
 *   device abstraction — it composes:
 *     - CozyAudioDeviceManager (this same directory) for real mic capture
 *     - RemoteRelayTransportProvider (core/shell/live/providers/) for the
 *       real signaling wire to SessionAuthority
 *   and enforces one hard rule the whole rest of this file exists for:
 *
 *     MICROPHONE CAPTURE MUST NEVER START MERELY BECAUSE A PARTICIPANT
 *     JOINED. IT MAY ONLY START AFTER THE SERVER HAS CONFIRMED
 *     SPEAKING_ALLOWED. LOCAL/UI STATE NEVER OVERRIDES THAT.
 *
 * WIRING REQUIREMENT (read before use)
 *   RemoteRelayTransportProvider takes a single onEvent sink at
 *   construction (see its file header) — it is not a multi-listener bus.
 *   This controller does not construct the provider itself (the provider
 *   is shared platform infrastructure other code also uses for
 *   publish/join/roster). The integrating call site MUST route the
 *   provider's onEvent messages into this controller's
 *   handleTransportEvent(type, msg), e.g.:
 *
 *     const controller = new CozyLiveParticipationController({ deviceManager, transportProvider, sessionId, userId });
 *     const provider = new RemoteRelayTransportProvider({
 *       url, getToken,
 *       onEvent: (type, msg) => {
 *         controller.handleTransportEvent(type, msg);
 *         existingAppHandler(type, msg); // still receives everything too
 *       },
 *     });
 *
 *   This file does not implement WebRTC peer-connection publishing of the
 *   resulting MediaStream — that remains the existing
 *   LiveHotspotEngine/RTCPeerConnection path (see
 *   server/live-relay/README.md's own scope table, unchanged by this
 *   milestone). What this file guarantees is that a real, permission-
 *   gated MediaStream exists at the right moment and stops at the right
 *   moment — the actual RTP leg is a separate, already-scoped concern.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CozyOS = root.CozyOS || {};
        var _mod = factory();
        root.CozyOS.CozyLiveParticipationController = _mod.CozyLiveParticipationController;
        root.CozyOS.CozyLiveParticipationController.STATE = _mod.STATE;
    }
})(typeof window !== "undefined" ? window : globalThis, function () {
    "use strict";

    const STATE = Object.freeze({
        JOINED: "JOINED",
        SPEAK_REQUESTED: "SPEAK_REQUESTED",
        SPEAKING_ALLOWED: "SPEAKING_ALLOWED",
        SPEAKING: "SPEAKING",
        MUTED: "MUTED",
        REMOVED: "REMOVED",
        DISCONNECTED: "DISCONNECTED",
    });

    class CozyLiveParticipationController {
        /**
         * @param {object} opts
         * @param {object} opts.deviceManager  A CozyAudioDeviceManager instance (not constructed here — caller owns its lifecycle).
         * @param {object} opts.transportProvider  A RemoteRelayTransportProvider instance, already connected/connecting for opts.sessionId.
         * @param {string} opts.sessionId
         * @param {string} opts.userId  This participant's own id (the sub the session token was issued for).
         * @param {function(string, object)} [opts.onEvent]  Local state-change sink: (eventName, detail).
         */
        constructor(opts = {}) {
            if (!opts.deviceManager) throw new TypeError("[CozyLiveParticipationController] opts.deviceManager is required.");
            if (!opts.transportProvider) throw new TypeError("[CozyLiveParticipationController] opts.transportProvider is required.");
            if (!opts.sessionId) throw new TypeError("[CozyLiveParticipationController] opts.sessionId is required.");
            if (!opts.userId) throw new TypeError("[CozyLiveParticipationController] opts.userId is required.");

            this._deviceManager = opts.deviceManager;
            this._transport = opts.transportProvider;
            this._sessionId = opts.sessionId;
            this._userId = opts.userId;
            this._onEvent = typeof opts.onEvent === "function" ? opts.onEvent : () => {};

            this._state = STATE.JOINED;
            this._selfMuted = false;
        }

        getState() {
            return this._state;
        }

        _setState(next, detail) {
            const prev = this._state;
            this._state = next;
            this._onEvent("participation-state", { previous: prev, current: next, ...detail });
        }

        // -------------------------------------------------------------
        // Outbound: participant actions
        // -------------------------------------------------------------

        /** Viewer -> "Request to Speak". Server is authoritative; this only
         * sends the request and optimistically reflects SPEAK_REQUESTED —
         * a failed ack (see handleTransportEvent) reverts it honestly. */
        requestToSpeak() {
            if (this._state === STATE.REMOVED) {
                return { success: false, reason: "REMOVED_CANNOT_REQUEST" };
            }
            const result = this._transport.requestSpeak(this._sessionId);
            if (result.success) this._setState(STATE.SPEAK_REQUESTED, {});
            return result;
        }

        /**
         * Actually starts microphone capture. HARD GATE: only proceeds if
         * the server has already granted SPEAKING_ALLOWED. This is the
         * enforcement point for the mandatory rule in this file's header —
         * no caller, UI bug, or race condition can start capture from any
         * other state.
         */
        async startSpeaking() {
            if (this._state !== STATE.SPEAKING_ALLOWED) {
                return { success: false, reason: "NOT_AUTHORIZED_TO_SPEAK", currentState: this._state };
            }
            const result = await this._deviceManager.createMicrophoneStream();
            if (!result.success) return result;
            this._setState(STATE.SPEAKING, {});
            return { success: true, stream: result.stream };
        }

        /** Self-mute (4A-4): always allowed, never touches server-side
         * speaking authority, never affects another participant. Stops
         * outgoing audio locally; does not fabricate a state change to
         * MUTED at the authority level — the participant remains
         * SPEAKING_ALLOWED (still permitted to unmute themselves), we
         * just also track a separate local self-muted flag so callers
         * can tell "allowed but chose to mute" apart from "revoked". */
        selfMute() {
            this._deviceManager.muteLocalMicrophone();
            this._selfMuted = true;
            this._transport.selfMute(this._sessionId, true);
            this._onEvent("participation-self-mute", { muted: true });
            return { success: true, muted: true };
        }

        /** Self-unmute requires the participant still actually hold
         * SPEAKING_ALLOWED (or be actively SPEAKING) — matches 4A-12's
         * required test "self-unmute requires SPEAKING_ALLOWED". Revoked
         * or removed participants cannot unmute their way back to
         * transmitting. */
        selfUnmute() {
            if (this._state !== STATE.SPEAKING_ALLOWED && this._state !== STATE.SPEAKING) {
                return { success: false, reason: "NOT_AUTHORIZED_TO_SPEAK", currentState: this._state };
            }
            this._deviceManager.unmuteLocalMicrophone();
            this._selfMuted = false;
            this._transport.selfMute(this._sessionId, false);
            this._onEvent("participation-self-mute", { muted: false });
            return { success: true, muted: false };
        }

        isSelfMuted() {
            return this._selfMuted;
        }

        /** Participant-initiated leave. Stops any active capture and
         * reports departure over the existing transport (leaveViewer is
         * the existing, unmodified method on the provider). */
        leave() {
            this._deviceManager.stopMicrophone();
            this._transport.leaveViewer(this._sessionId, this._userId);
            this._setState(STATE.DISCONNECTED, {});
        }

        // -------------------------------------------------------------
        // Inbound: server-authoritative events
        // (see file header — the call site must route the transport
        // provider's onEvent(type, msg) here)
        // -------------------------------------------------------------

        handleTransportEvent(type, msg) {
            switch (type) {
                case "request-speak-ack":
                    if (!msg.success && this._state === STATE.SPEAK_REQUESTED) {
                        // Server rejected the request (e.g. already REMOVED) —
                        // never keep a local state the server didn't grant.
                        this._setState(STATE.JOINED, { reason: msg.reason });
                    }
                    break;

                case "speaking-state":
                    if (msg.granted) {
                        this._setState(STATE.SPEAKING_ALLOWED, {});
                    } else {
                        // Revoked. Hard-stop capture immediately — local/UI
                        // state must never keep transmitting past a
                        // server revoke (4A-3).
                        this._deviceManager.stopMicrophone();
                        this._setState(STATE.MUTED, {});
                    }
                    break;

                case "removed":
                    this._deviceManager.stopMicrophone();
                    this._setState(STATE.REMOVED, { removedBy: msg.removedBy });
                    break;

                default:
                    break; // not a speaking-authority event this controller owns
            }
        }
    }

    return { CozyLiveParticipationController, STATE };
});
