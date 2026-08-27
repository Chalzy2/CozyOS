/**
 * core/modules/media/cozy-live-audio-segment-receiver.js
 * CozyOS — Live Media — One-Upstream Audio Segment Receiver (viewer side)
 * Milestone: R040 Phase 4D, Dependency A
 *
 * RULE 29 OWNERSHIP AUDIT
 *   - RemoteRelayTransportProvider already emits a real "segment-received"
 *     event for every `segment` message a viewer connection receives
 *     (see that file's _onMessage()). This class subscribes to that
 *     existing event; it does not open its own connection or duplicate
 *     joinViewer()/leaveViewer().
 *   - cozy-live-audio-segment-shape.js SegmentOrderer is reused
 *     unmodified for gap/duplicate handling.
 *   - cozy-live-playback-receiver.js (the mesh playback receiver) is
 *     NOT modified. This is an additional receive path a viewer UI can
 *     choose depending on which publish path the source used, mirroring
 *     the publisher side's addition.
 *
 * HONEST SCOPE
 *   Real for: any environment exposing `MediaSource` + `Audio`/`HTMLAudioElement`
 *   (evergreen browsers) — chunks are appended to a real MediaSource
 *   SourceBuffer and played through a real <audio> element.
 *   In Node.js (no MediaSource), capabilities().mediaSource is false;
 *   this class still correctly ORDERS and DECODES (base64->bytes)
 *   incoming chunks and reports them via onEvent("chunk-ready", ...)
 *   so the ordering/decoding logic itself is testable without a
 *   browser — but it will not claim PLAYBACK_STARTED unless a real
 *   MediaSource+audio element pipeline actually reports it, matching
 *   the honest-flag pattern the mesh receiver already uses
 *   (ONE_UPSTREAM_MANY_VIEWERS_AVAILABLE-style flags — see
 *   getCapabilityReport()).
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory(require("./cozy-live-audio-segment-shape"));
    } else {
        root.CozyOS = root.CozyOS || {};
        var _mod = factory(root.CozyOS.CozyLiveAudioSegmentShape);
        root.CozyOS.CozyLiveAudioSegmentReceiver = _mod.CozyLiveAudioSegmentReceiver;
        root.CozyOS.CozyLiveAudioSegmentReceiver.capabilities = _mod.capabilities;
    }
})(typeof window !== "undefined" ? window : globalThis, function (AudioSegmentShape) {
    "use strict";

    function capabilities() {
        return {
            mediaSource: typeof MediaSource !== "undefined",
            audioElement: typeof Audio !== "undefined",
            atobAvailable: typeof atob !== "undefined" || typeof Buffer !== "undefined",
        };
    }

    function _base64ToBytes(base64) {
        if (typeof atob === "function") {
            const bin = atob(base64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return bytes;
        }
        if (typeof Buffer !== "undefined") {
            return new Uint8Array(Buffer.from(base64, "base64"));
        }
        throw new Error("No base64 decoder available in this environment.");
    }

    class CozyLiveAudioSegmentReceiver {
        /**
         * @param {object} opts
         * @param {object} opts.transportProvider must support onEvent-style subscription; caller wires this receiver's handleTransportEvent(type, msg) into the SAME onEvent callback the transport was constructed with (mirrors cozy-live-media-publisher.js's own documented wiring requirement).
         * @param {string} opts.sessionId
         * @param {function(string, object)} [opts.onEvent]
         */
        constructor(opts = {}) {
            if (!opts.sessionId) throw new TypeError("[CozyLiveAudioSegmentReceiver] opts.sessionId is required.");
            this._sessionId = opts.sessionId;
            this._onEvent = typeof opts.onEvent === "function" ? opts.onEvent : () => {};
            this._orderer = new AudioSegmentShape.SegmentOrderer();
            this._metrics = { chunksAccepted: 0, chunksRejected: 0, bytesReceived: 0, segmentsCompleted: 0 };
            this._mediaSourceState = "NOT_ATTACHED"; // NOT_ATTACHED | ATTACHED | PLAYBACK_STARTED | PLAYBACK_FAILED
        }

        capabilities() { return capabilities(); }

        /**
         * handleTransportEvent() — call this from the SAME onEvent(type, msg)
         * sink passed to RemoteRelayTransportProvider. Ignores every event
         * that isn't this session's audio-chunk segment delivery.
         */
        handleTransportEvent(type, msg) {
            if (type !== "segment-received") return;
            if (!msg || msg.sessionId !== this._sessionId) return;
            const segment = msg.segment;
            if (!AudioSegmentShape.isAudioChunkSegment(segment)) return; // not an audio chunk (e.g. a caption/translation segment) — not ours to handle

            const result = this._orderer.accept(segment);
            if (!result.accepted) {
                this._metrics.chunksRejected++;
                this._onEvent("chunk-rejected", { segmentId: segment.segmentId, seq: segment.seq, reason: result.reason });
                return;
            }
            let bytes;
            try {
                bytes = _base64ToBytes(segment.audioBase64);
            } catch (e) {
                this._metrics.chunksRejected++;
                this._onEvent("chunk-decode-failed", { segmentId: segment.segmentId, seq: segment.seq, reason: e.message });
                return;
            }
            this._metrics.chunksAccepted++;
            this._metrics.bytesReceived += bytes.length;
            this._onEvent("chunk-ready", {
                segmentId: segment.segmentId,
                seq: segment.seq,
                isFinal: segment.isFinal,
                sourceLanguage: segment.sourceLanguage,
                mimeType: segment.mimeType,
                bytes,
            });
            this._maybeAppendToMediaSource(segment.mimeType, bytes);
            if (segment.isFinal) {
                this._metrics.segmentsCompleted++;
                this._onEvent("segment-complete", { segmentId: segment.segmentId, sourceLanguage: segment.sourceLanguage });
            }
        }

        /**
         * _maybeAppendToMediaSource() — real MediaSource append when the
         * platform supports it; a no-op (state stays NOT_ATTACHED) otherwise.
         * Never fabricates PLAYBACK_STARTED.
         */
        _maybeAppendToMediaSource(mimeType, bytes) {
            const caps = capabilities();
            if (!caps.mediaSource) return;
            try {
                if (!this._mediaSource) {
                    if (typeof MediaSource.isTypeSupported === "function" && !MediaSource.isTypeSupported(mimeType)) {
                        this._mediaSourceState = "PLAYBACK_FAILED";
                        this._onEvent("playback-failed", { reason: `MediaSource does not support mimeType ${mimeType}` });
                        return;
                    }
                    this._mediaSource = new MediaSource();
                    this._audioEl = caps.audioElement ? new Audio() : null;
                    if (this._audioEl) this._audioEl.src = URL.createObjectURL(this._mediaSource);
                    this._mediaSource.addEventListener("sourceopen", () => {
                        try {
                            this._sourceBuffer = this._mediaSource.addSourceBuffer(mimeType);
                            this._mediaSourceState = "ATTACHED";
                            if (this._audioEl && typeof this._audioEl.play === "function") {
                                this._audioEl.play().then(() => {
                                    this._mediaSourceState = "PLAYBACK_STARTED";
                                    this._onEvent("playback-started", {});
                                }).catch((e) => {
                                    // Real browsers may block autoplay without a user gesture — honestly reported, not fabricated as started.
                                    this._onEvent("playback-autoplay-blocked", { reason: e && e.message });
                                });
                            }
                        } catch (e) {
                            this._mediaSourceState = "PLAYBACK_FAILED";
                            this._onEvent("playback-failed", { reason: e.message });
                        }
                    });
                }
                if (this._sourceBuffer && !this._sourceBuffer.updating) {
                    this._sourceBuffer.appendBuffer(bytes);
                }
            } catch (e) {
                this._mediaSourceState = "PLAYBACK_FAILED";
                this._onEvent("playback-failed", { reason: e.message });
            }
        }

        getMetrics() { return Object.assign({}, this._metrics); }

        /**
         * getCapabilityReport() — the honest flag Rule 15/16 requires:
         * distinguishes "the relay genuinely fanned one upstream out to
         * many viewers" (always true for anything reaching this class —
         * see server/live-relay test suite) from "this specific viewer's
         * browser is actually playing audio right now" (only true when
         * mediaSourceState === PLAYBACK_STARTED).
         */
        getCapabilityReport() {
            return {
                ONE_UPSTREAM_MANY_VIEWERS_AUDIO_SEGMENT_RELAY: true, // architectural property of the relay this class rides — verified at transport level, not fabricated per-viewer
                ONE_UPSTREAM_MANY_VIEWERS_RTP_SFU: false, // still genuinely absent — see server/live-relay/README.md
                PLAYBACK_STATE: this._mediaSourceState,
                capabilities: capabilities(),
            };
        }
    }

    return { CozyLiveAudioSegmentReceiver, capabilities };
});
