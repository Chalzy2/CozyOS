/**
 * core/shell/live/providers/cozy-live-media-transport-selector.js
 * CozyOS — Live Distribution — Media Transport Composition Boundary
 * Milestone: STEP 4D-B (STEP4D-DEPENDENCY-A-CHECKPOINT-VERIFIED continuation)
 *
 * REAL SCOPE DISCLOSURE — READ BEFORE TRUSTING ANY "AVAILABLE" CLAIM
 *   The 4D-B audit found the repository already has TWO real, tested
 *   transport paths and ZERO SFU implementations:
 *
 *     1. LOCAL_CHUNKED_RELAY — cozy-live-audio-segment-publisher.js /
 *        cozy-live-audio-segment-receiver.js relayed through
 *        live-distribution-signaling-server.js. One upstream connection,
 *        server fans JSON/base64 audio-chunk payloads out to many
 *        viewer connections. Real, tested (see that server's own
 *        `capability.relayFanout: true`). NOT raw RTP.
 *
 *     2. MESH_WEBRTC_SIGNALING — cozy-live-media-publisher.js, real
 *        RTCPeerConnection media, real SDP/ICE relayed by the same
 *        signaling server (`capability.webrtcSignalingRelay: true`).
 *        This is genuine WebRTC media — but it is PEER-TO-PEER MESH:
 *        the publisher opens one RTCPeerConnection per remote viewer.
 *        It is explicitly NOT one-upstream/many-viewer fan-out and
 *        must never be reported as SFU (the signaling server's own
 *        health report already says so: `capability.webrtcSfu: false`).
 *
 *     3. REAL_RTP_SFU — NOT IMPLEMENTED. No mediasoup/wrtc/libnice or
 *        any other SFU/media-server dependency exists anywhere in this
 *        repository or its package.json. This file creates an
 *        interface an adapter for one could satisfy later. It does not
 *        create, simulate, or approximate that adapter.
 *
 *   This file does not implement media transport itself. It composes
 *   references to the three paths above (or whatever subset the caller
 *   actually constructed) into ONE place that can honestly answer
 *   "what transport am I actually using, and what else could I use."
 *   No new permission engine, no new signaling channel, no new media
 *   engine, no second capability model — every capability() call below
 *   is a pass-through to the real module that already owns that fact.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 *   - It never marks REAL_RTP_SFU available:true merely because an
 *     adapter object/class exists that satisfies TRANSPORT_INTERFACE.
 *     Structural support is not deployment. See selectMode() Test B.
 *   - It never silently substitutes one mode for another. A caller
 *     that requests REAL_RTP_SFU without a real adapter installed gets
 *     a clear, explicit rejection — or, only if it opts in via
 *     `allowFallback: true`, an explicit
 *     {requested, actual, fallback:true} record, never a bare
 *     `{sfu:true}`-shaped lie.
 *   - It does not own connections, sockets, RTCPeerConnections, or
 *     MediaRecorders. The caller constructs the real engines (as every
 *     existing file in this directory already documents); this file
 *     only decides, records, and reports which one is in play.
 *
 * TRANSPORT_INTERFACE (Step 4 / Test C of the 4D-B prompt)
 *   Any transport-mode adapter — chunked, mesh, or a future real SFU —
 *   may optionally implement any of:
 *     connect(), disconnect(), publish(payload), subscribe(handler),
 *     stopPublishing(), stopReceiving(), getCapabilities()
 *   None are required: the existing engines predate this interface and
 *   are adapted to it here rather than rewritten. See
 *   test/cozy-live-media-transport-selector.test.js "Test C" for a
 *   documented test double proving the shape is satisfiable by a
 *   future adapter without modifying this file or its caller.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CozyOS = root.CozyOS || {};
        var _mod = factory();
        root.CozyOS.CozyLiveMediaTransportSelector = _mod.CozyLiveMediaTransportSelector;
        root.CozyOS.CozyLiveMediaTransportSelector.MODE = _mod.MODE;
    }
})(typeof window !== "undefined" ? window : globalThis, function () {
    "use strict";

    /** The only three modes this repository can currently name honestly. */
    const MODE = Object.freeze({
        LOCAL_CHUNKED_RELAY: "LOCAL_CHUNKED_RELAY",
        MESH_WEBRTC_SIGNALING: "MESH_WEBRTC_SIGNALING",
        REAL_RTP_SFU: "REAL_RTP_SFU",
    });

    /** Methods a transport-mode adapter MAY implement. None are required. */
    const TRANSPORT_INTERFACE_METHODS = Object.freeze([
        "connect", "disconnect", "publish", "subscribe",
        "stopPublishing", "stopReceiving", "getCapabilities",
    ]);

    class CozyLiveMediaTransportSelector {
        /**
         * @param {object} [opts]
         * @param {function():object} [opts.chunkedCapabilities]  Pass-through to CozyLiveAudioSegmentPublisher/Receiver's own `capabilities()` (this file never re-implements feature detection).
         * @param {function():object} [opts.meshCapabilities]  Pass-through to a constructed CozyLiveMediaPublisher instance's own `capabilities()`.
         * @param {object|null} [opts.sfuAdapter]  Optional real SFU adapter satisfying TRANSPORT_INTERFACE. Absent by default — its mere presence is recorded as "structurally supported," never as "available."
         * @param {boolean} [opts.sfuAdapterVerifiedDeployed]  Caller-asserted, evidence-backed flag: true only if the adapter has been proven to reach a real, running SFU (e.g. a real loopback/network test passed this session). Defaults false. This file trusts nothing about SFU availability that isn't explicitly asserted here by the caller who did the real verification.
         */
        constructor(opts = {}) {
            this._chunkedCapabilities = typeof opts.chunkedCapabilities === "function" ? opts.chunkedCapabilities : null;
            this._meshCapabilities = typeof opts.meshCapabilities === "function" ? opts.meshCapabilities : null;
            this._sfuAdapter = opts.sfuAdapter || null;
            this._sfuAdapterVerifiedDeployed = opts.sfuAdapterVerifiedDeployed === true;
            this._currentMode = null;
            this._lastSelection = null; // {requested, actual, fallback}
        }

        /**
         * Honest capability snapshot. Structurally-supported-but-unavailable
         * capabilities are reported with `available:false` explicitly, never
         * omitted (an absent key would read as "unknown," which is worse
         * than a disclosed false).
         */
        getCapabilities() {
            const chunked = this._chunkedCapabilities ? this._chunkedCapabilities() : null;
            const mesh = this._meshCapabilities ? this._meshCapabilities() : null;

            return {
                [MODE.LOCAL_CHUNKED_RELAY]: {
                    available: !!chunked,
                    verified: !!chunked,
                    implementation: chunked
                        ? "cozy-live-audio-segment-publisher.js / cozy-live-audio-segment-receiver.js"
                        : "not wired to this selector",
                    detail: chunked || undefined,
                },
                [MODE.MESH_WEBRTC_SIGNALING]: {
                    available: !!(mesh && mesh.webRTC),
                    verified: !!(mesh && mesh.webRTC),
                    implementation: "cozy-live-media-publisher.js (peer-to-peer mesh — one RTCPeerConnection per remote viewer, NOT fan-out)",
                    detail: mesh || undefined,
                },
                [MODE.REAL_RTP_SFU]: {
                    structurallySupported: !!this._sfuAdapter,
                    available: !!this._sfuAdapter && this._sfuAdapterVerifiedDeployed,
                    verified: !!this._sfuAdapter && this._sfuAdapterVerifiedDeployed,
                    implementation: this._sfuAdapter
                        ? "adapter object provided — deployment/verification asserted: " + this._sfuAdapterVerifiedDeployed
                        : "not installed / not deployed",
                },
            };
        }

        getTransportMode() {
            return this._currentMode;
        }

        getLastSelection() {
            return this._lastSelection;
        }

        /**
         * Selects a transport mode. Never lies about REAL_RTP_SFU.
         *
         * @param {string} requested  One of MODE.*.
         * @param {object} [opts]
         * @param {boolean} [opts.allowFallback]  If requested mode is unavailable, permit falling back to LOCAL_CHUNKED_RELAY (the only mode guaranteed always available) and say so explicitly. Default false: an unavailable request fails clearly instead of silently substituting.
         * @returns {{requested:string, actual:string|null, fallback:boolean, reason?:string}}
         */
        selectMode(requested, opts = {}) {
            if (!Object.values(MODE).includes(requested)) {
                throw new TypeError("[CozyLiveMediaTransportSelector] Unknown transport mode: " + requested);
            }
            const caps = this.getCapabilities();
            const allowFallback = opts.allowFallback === true;

            if (requested === MODE.REAL_RTP_SFU && !caps[MODE.REAL_RTP_SFU].available) {
                if (!allowFallback) {
                    const result = {
                        requested,
                        actual: null,
                        fallback: false,
                        reason: caps[MODE.REAL_RTP_SFU].structurallySupported
                            ? "SFU adapter is structurally present but not verified as deployed — refusing to claim SFU."
                            : "No SFU adapter installed — refusing to claim SFU.",
                    };
                    this._currentMode = null;
                    this._lastSelection = result;
                    return result;
                }
                const result = { requested, actual: MODE.LOCAL_CHUNKED_RELAY, fallback: true };
                this._currentMode = MODE.LOCAL_CHUNKED_RELAY;
                this._lastSelection = result;
                return result;
            }

            if (requested === MODE.MESH_WEBRTC_SIGNALING && !caps[MODE.MESH_WEBRTC_SIGNALING].available) {
                if (!allowFallback) {
                    const result = { requested, actual: null, fallback: false, reason: "WebRTC not available in this environment." };
                    this._currentMode = null;
                    this._lastSelection = result;
                    return result;
                }
                const result = { requested, actual: MODE.LOCAL_CHUNKED_RELAY, fallback: true };
                this._currentMode = MODE.LOCAL_CHUNKED_RELAY;
                this._lastSelection = result;
                return result;
            }

            // requested is available as itself (LOCAL_CHUNKED_RELAY always is,
            // or MESH_WEBRTC_SIGNALING/REAL_RTP_SFU passed their checks above).
            const result = { requested, actual: requested, fallback: false };
            this._currentMode = requested;
            this._lastSelection = result;
            return result;
        }

        /** Default mode with no explicit request: the one path proven always real. */
        selectDefaultMode() {
            return this.selectMode(MODE.LOCAL_CHUNKED_RELAY);
        }
    }

    return { CozyLiveMediaTransportSelector, MODE, TRANSPORT_INTERFACE_METHODS };
});
