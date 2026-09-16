/**
 * core/modules/media/cozy-live-audio-segment-shape.js
 * CozyOS — Live Media — Audio Segment Wire Shape
 * Milestone: R040 Phase 4D, Dependency A (real one-upstream → many-viewers audio)
 *
 * REAL SCOPE DISCLOSURE
 *   This file defines and validates the wire shape of an "audio-chunk
 *   segment" — a plain JSON-serializable object carrying one base64-
 *   encoded chunk of recorded audio plus sequencing metadata. It is
 *   pure logic: no browser API, no network, no Node-only API. It is
 *   shared, unmodified, by:
 *     - cozy-live-audio-segment-publisher.js (produces these objects)
 *     - cozy-live-audio-segment-receiver.js (consumes/orders these objects)
 *   so the two sides can never silently drift out of agreement about
 *   the shape.
 *
 *   WHY THIS EXISTS (Rule 29 ownership audit, performed before writing
 *   this file): server/live-relay/live-distribution-signaling-server.js
 *   `_onPublishSource()` already fans an arbitrary `segment` object out
 *   to every viewer of a session in one pass (real, loopback-tested —
 *   see server/live-relay/test/live-distribution-signaling-server.test.js).
 *   That is a genuine, already-working one-upstream-to-many-viewers
 *   relay at the message level. It has only ever been used to carry
 *   caption/translation-ready text payloads. Nothing here duplicates
 *   that relay, the transport provider, or the server — this file only
 *   defines what an audio-carrying `segment` looks like so publisher
 *   and receiver can use the SAME existing relay for real audio data.
 *
 *   WHAT THIS DOES NOT CLAIM: this is not WebRTC, not RTP, not a media
 *   server, and not an SFU. It is chunked audio-over-WebSocket riding
 *   the existing real relay. It genuinely achieves one upstream
 *   connection fanning audio out to many viewers (bandwidth at the
 *   relay scales with viewer count, not at the publisher), which is
 *   the architectural property Dependency A requires — but it is NOT
 *   a claim of RTP-level real-time media transport. See this
 *   directory's cozy-live-media-provider-interface.js for the explicit
 *   boundary between this and a future real SFU provider.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CozyOS = root.CozyOS || {};
        root.CozyOS.CozyLiveAudioSegmentShape = factory();
    }
})(typeof window !== "undefined" ? window : globalThis, function () {
    "use strict";

    const MAX_CHUNK_BASE64_BYTES = 200000; // ~150KB raw audio per chunk ceiling; refuses to build/accept oversized chunks rather than silently truncating

    /**
     * buildAudioSegment() — pure constructor for the wire object.
     * @param {object} p
     * @param {string} p.segmentId   stable id for this speech segment (same id across all chunks of one utterance)
     * @param {number} p.seq         0-based chunk index within this segment
     * @param {boolean} p.isFinal    true on the last chunk of this segment
     * @param {string} p.publisherId authenticated publisher's sub (server re-verifies; this is informational on the wire)
     * @param {string} p.sourceLanguage BCP-47-ish tag for the language actually spoken in THIS segment (never session-fixed — Rule 6 dynamic language requirement)
     * @param {string} p.mimeType    real MIME type MediaRecorder reported (e.g. "audio/webm;codecs=opus") — never guessed
     * @param {string} p.audioBase64 base64-encoded chunk bytes
     * @returns {{ok:true, segment:object}|{ok:false, reason:string}}
     */
    function buildAudioSegment(p) {
        if (!p || typeof p !== "object") return { ok: false, reason: "params object required" };
        if (!p.segmentId || typeof p.segmentId !== "string") return { ok: false, reason: "segmentId (string) required" };
        if (typeof p.seq !== "number" || p.seq < 0 || !Number.isInteger(p.seq)) return { ok: false, reason: "seq must be a non-negative integer" };
        if (!p.publisherId || typeof p.publisherId !== "string") return { ok: false, reason: "publisherId (string) required" };
        if (!p.sourceLanguage || typeof p.sourceLanguage !== "string") return { ok: false, reason: "sourceLanguage (string) required — never assume a fixed session language" };
        if (!p.mimeType || typeof p.mimeType !== "string") return { ok: false, reason: "mimeType (string) required — must be the real value the recorder reported" };
        if (typeof p.audioBase64 !== "string" || p.audioBase64.length === 0) return { ok: false, reason: "audioBase64 (non-empty string) required" };
        if (p.audioBase64.length > MAX_CHUNK_BASE64_BYTES) return { ok: false, reason: `audioBase64 exceeds ${MAX_CHUNK_BASE64_BYTES} bytes ceiling — split into smaller chunks, do not send oversized frames` };

        return {
            ok: true,
            segment: {
                kind: "audio-chunk",
                segmentId: p.segmentId,
                seq: p.seq,
                isFinal: !!p.isFinal,
                publisherId: p.publisherId,
                sourceLanguage: p.sourceLanguage,
                mimeType: p.mimeType,
                audioBase64: p.audioBase64,
                producedAt: typeof p.producedAt === "number" ? p.producedAt : Date.now(),
            },
        };
    }

    function isAudioChunkSegment(segment) {
        return !!segment && typeof segment === "object" && segment.kind === "audio-chunk"
            && typeof segment.segmentId === "string" && typeof segment.seq === "number"
            && typeof segment.audioBase64 === "string";
    }

    /**
     * SegmentOrderer — real (not simulated) out-of-order/duplicate
     * handling for one segmentId's chunk stream. WebSocket delivers
     * messages in order on a single TCP connection in practice, but a
     * reconnect/resend can duplicate or gap a sequence — this class
     * makes that an explicit, testable state instead of an assumption.
     */
    class SegmentOrderer {
        constructor() {
            this._nextSeqBySegment = new Map(); // segmentId -> next expected seq
            this._seenBySegment = new Map(); // segmentId -> Set(seq) already accepted
        }

        /**
         * accept() — returns {accepted:true} if this chunk should be
         * played/appended now, {accepted:false, reason} if it is a
         * duplicate or arrived with a gap this orderer will not
         * silently paper over (caller decides: buffer, request resend,
         * or drop — this class never invents missing audio).
         */
        accept(segment) {
            if (!isAudioChunkSegment(segment)) return { accepted: false, reason: "not an audio-chunk segment" };
            let seen = this._seenBySegment.get(segment.segmentId);
            if (!seen) { seen = new Set(); this._seenBySegment.set(segment.segmentId, seen); }
            if (seen.has(segment.seq)) return { accepted: false, reason: "duplicate chunk (already accepted)" };
            const nextExpected = this._nextSeqBySegment.get(segment.segmentId) || 0;
            if (segment.seq !== nextExpected) {
                return { accepted: false, reason: `out-of-order: expected seq ${nextExpected}, got ${segment.seq}`, expected: nextExpected };
            }
            seen.add(segment.seq);
            this._nextSeqBySegment.set(segment.segmentId, segment.seq + 1);
            if (segment.isFinal) {
                // segment complete; free memory for this segmentId
                this._seenBySegment.delete(segment.segmentId);
                this._nextSeqBySegment.delete(segment.segmentId);
            }
            return { accepted: true };
        }

        reset(segmentId) {
            this._seenBySegment.delete(segmentId);
            this._nextSeqBySegment.delete(segmentId);
        }
    }

    return { buildAudioSegment, isAudioChunkSegment, SegmentOrderer, MAX_CHUNK_BASE64_BYTES };
});
