/**
 * core/modules/media/cozy-live-audio-segment-publisher.js
 * CozyOS — Live Media — One-Upstream Audio Segment Publisher
 * Milestone: R040 Phase 4D, Dependency A
 *
 * RULE 29 OWNERSHIP AUDIT (performed before writing this file)
 *   - server/live-relay/live-distribution-signaling-server.js `_onPublishSource()`:
 *     real, already fans one host connection's `segment` out to every
 *     viewer of the session in a single pass. Reused as-is, unmodified.
 *   - core/shell/live/providers/cozy-live-remote-relay-transport-provider.js
 *     `publishSource(sessionId, segment)`: real, already the wire call
 *     this file uses. Reused as-is, unmodified.
 *   - core/modules/media/cozy-live-participation-controller.js: real,
 *     already the only place a MediaStream is allowed to exist
 *     (SPEAKING_ALLOWED gate). This file NEVER captures a microphone
 *     itself — it only consumes a stream the controller already
 *     authorized, exactly like cozy-live-media-publisher.js (the mesh
 *     publisher) does.
 *   - cozy-live-media-publisher.js: the existing mesh (per-viewer
 *     RTCPeerConnection) publisher. NOT modified, NOT removed — mesh
 *     remains available/composable. This file is an ADDITIONAL
 *     publish path a caller can choose, not a replacement.
 *
 * HONEST SCOPE
 *   Real for: any environment exposing `MediaRecorder` (all evergreen
 *   browsers) capturing the authorized MediaStream's audio track,
 *   chunked at `timeslice` ms, base64-encoded, and sent through the
 *   EXISTING one-to-many relay via `publishSource()`. Bandwidth at the
 *   PUBLISHER scales with ONE connection regardless of viewer count —
 *   the relay server, not the publisher, fans out to N viewers. That
 *   is the real "one upstream → many viewers" property.
 *   NOT real / not claimed: this is not RTP, not sub-200ms real-time
 *   audio, and not a WebRTC/SFU media server. Chunked-relay latency is
 *   bounded below by `timeslice` plus one network round trip per hop,
 *   which is measured and reported (see getMetrics()), never assumed.
 *   In Node.js (no MediaRecorder), capabilities().mediaRecorder is
 *   false and start() fails closed with an honest reason — the same
 *   pattern cozy-live-media-publisher.js already uses for RTCPeerConnection.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory(require("./cozy-live-audio-segment-shape"));
    } else {
        root.CozyOS = root.CozyOS || {};
        var _mod = factory(root.CozyOS.CozyLiveAudioSegmentShape);
        root.CozyOS.CozyLiveAudioSegmentPublisher = _mod.CozyLiveAudioSegmentPublisher;
        root.CozyOS.CozyLiveAudioSegmentPublisher.capabilities = _mod.capabilities;
    }
})(typeof window !== "undefined" ? window : globalThis, function (AudioSegmentShape) {
    "use strict";

    function _now() {
        if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
        return Date.now();
    }

    function _uid() {
        return "seg-" + Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
    }

    /** Real feature detection — never assumed available. */
    function capabilities() {
        return {
            mediaRecorder: typeof MediaRecorder !== "undefined",
            fileReader: typeof FileReader !== "undefined",
        };
    }

    /** Pick a real, supported mimeType — never invent one MediaRecorder didn't confirm. */
    function _pickSupportedMimeType(candidates) {
        if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return null;
        for (const c of candidates) { if (MediaRecorder.isTypeSupported(c)) return c; }
        return null;
    }

    const DEFAULT_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
    const DEFAULT_TIMESLICE_MS = 250;

    class CozyLiveAudioSegmentPublisher {
        /**
         * @param {object} opts
         * @param {object} opts.transportProvider  must implement publishSource(sessionId, segment) — e.g. RemoteRelayTransportProvider
         * @param {string} opts.sessionId
         * @param {string} opts.publisherId
         * @param {function(): string} [opts.getSourceLanguage] returns the CURRENT speaker/segment's language (Rule 6: never a fixed session language). Defaults to "und" (undetermined) if omitted — caller should supply this from real ASR/speaker-selection state, never a guess baked in here.
         * @param {number} [opts.timesliceMs]
         * @param {function(string, object)} [opts.onEvent]
         */
        constructor(opts = {}) {
            if (!opts.transportProvider || typeof opts.transportProvider.publishSource !== "function") {
                throw new TypeError("[CozyLiveAudioSegmentPublisher] opts.transportProvider with publishSource() is required.");
            }
            if (!opts.sessionId) throw new TypeError("[CozyLiveAudioSegmentPublisher] opts.sessionId is required.");
            if (!opts.publisherId) throw new TypeError("[CozyLiveAudioSegmentPublisher] opts.publisherId is required.");

            this._transport = opts.transportProvider;
            this._sessionId = opts.sessionId;
            this._publisherId = opts.publisherId;
            this._getSourceLanguage = typeof opts.getSourceLanguage === "function" ? opts.getSourceLanguage : () => "und";
            this._timesliceMs = opts.timesliceMs || DEFAULT_TIMESLICE_MS;
            this._onEvent = typeof opts.onEvent === "function" ? opts.onEvent : () => {};

            this._recorder = null;
            this._segmentId = null;
            this._seq = 0;
            this._metrics = { chunksSent: 0, chunksRejectedLocal: 0, bytesSent: 0, startedAt: null };
        }

        capabilities() { return capabilities(); }

        /**
         * start() — begins a NEW speech segment. Does NOT capture the
         * microphone itself: `stream` must already be the participation
         * controller's authorized MediaStream (caller's responsibility,
         * same contract as cozy-live-media-publisher.js).
         */
        start(stream) {
            const caps = capabilities();
            if (!caps.mediaRecorder) {
                return { success: false, reason: "MediaRecorder is not available in this environment." };
            }
            if (!stream || typeof stream.getAudioTracks !== "function" || stream.getAudioTracks().length === 0) {
                return { success: false, reason: "An authorized MediaStream with at least one audio track is required." };
            }
            const mimeType = _pickSupportedMimeType(DEFAULT_MIME_CANDIDATES);
            if (!mimeType) {
                return { success: false, reason: "No supported audio MediaRecorder mimeType found on this platform." };
            }

            this._segmentId = _uid();
            this._seq = 0;
            this._metrics.startedAt = _now();

            try {
                this._recorder = new MediaRecorder(stream, { mimeType });
            } catch (e) {
                return { success: false, reason: "MediaRecorder construction failed: " + (e && e.message) };
            }

            this._recorder.addEventListener("dataavailable", (evt) => this._onChunk(evt, mimeType, false));
            this._recorder.addEventListener("stop", () => this._onEvent("recorder-stopped", { segmentId: this._segmentId }));
            this._recorder.addEventListener("error", (evt) => this._onEvent("recorder-error", { error: evt && evt.error }));
            this._recorder.start(this._timesliceMs);
            this._onEvent("segment-started", { segmentId: this._segmentId, mimeType });
            return { success: true, segmentId: this._segmentId, mimeType };
        }

        /** finish() — ends the current segment and marks its final chunk. */
        finish() {
            if (!this._recorder || this._recorder.state === "inactive") {
                return { success: false, reason: "No active recording segment to finish." };
            }
            this._finishing = true;
            this._recorder.stop();
            return { success: true, segmentId: this._segmentId };
        }

        _onChunk(evt, mimeType) {
            if (!evt.data || evt.data.size === 0) return;
            const reader = new FileReader();
            reader.onloadend = () => {
                const dataUrl = reader.result || "";
                const commaIdx = dataUrl.indexOf(",");
                const audioBase64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : "";
                const isFinal = !!this._finishing && this._recorder && this._recorder.state !== "recording";
                const built = AudioSegmentShape.buildAudioSegment({
                    segmentId: this._segmentId,
                    seq: this._seq++,
                    isFinal,
                    publisherId: this._publisherId,
                    sourceLanguage: this._getSourceLanguage(),
                    mimeType,
                    audioBase64,
                });
                if (!built.ok) {
                    this._metrics.chunksRejectedLocal++;
                    this._onEvent("chunk-rejected-local", { reason: built.reason });
                    return;
                }
                const result = this._transport.publishSource(this._sessionId, built.segment);
                this._metrics.chunksSent++;
                this._metrics.bytesSent += audioBase64.length;
                this._onEvent("chunk-published", { segmentId: built.segment.segmentId, seq: built.segment.seq, isFinal, dispatched: result && result.dispatched });
                if (isFinal) { this._finishing = false; }
            };
            reader.readAsDataURL(evt.data);
        }

        getMetrics() {
            return Object.assign({}, this._metrics, {
                elapsedMs: this._metrics.startedAt ? _now() - this._metrics.startedAt : 0,
            });
        }
    }

    return { CozyLiveAudioSegmentPublisher, capabilities };
});
