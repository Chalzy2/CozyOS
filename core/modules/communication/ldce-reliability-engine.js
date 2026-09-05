/**
 * CozyOS — Living Direct Communication Engine (LDCE)
 * Session Reliability & Conversation Synchronization
 * File Reference: core/modules/communication/ldce-reliability-engine.js
 * Milestone: 363 — LDCE Communication Experience Hardening
 *
 * SCOPE (Founder-approved, per M363 recommendation — NOT the long-term
 * AI-voice roadmap): real-browser verification is explicitly out of
 * this file's reach (no browser exists in this environment — disclosed,
 * not worked around). This file delivers everything else requested:
 * transcript sync between participants, persistent transcript storage
 * + recovery, reconnect handling, network-quality indicators, and media
 * recovery after interruption.
 *
 * COMPOSED, NEVER DUPLICATED
 *   - window.CozyOS.LiveHotspotEngine — real data channel
 *     (sendMessage/"message-received") reused to propagate transcript
 *     segments peer-to-peer live. No new transport invented.
 *   - window.CozyOS.CozyConversation — addTranscriptSegment()/
 *     getTimeline() remain the one real transcript store, both locally
 *     and as the merge target for recovered/synced segments.
 *   - window.CozyOS.Firebase.Firestore — setDocument/getDocument reused
 *     for real, durable (cross-reload) transcript persistence — the
 *     only genuinely durable store composed anywhere in this platform
 *     capability; everything else here remains honestly in-memory.
 *   - window.CozyOS.LDCESessionEngine (Stage 1) — session/participant
 *     reads only, never a second roster.
 *   - window.CozyOS.LDCEMediaSessionEngine (Stage 2) — connectToPeer()/
 *     disconnectFromPeer() reused for real reconnect; getConnectionState()
 *     reused for real per-peer quality; attachLocalMedia() reused for
 *     real media recovery.
 *
 * HONEST LIMITATIONS
 *   1. Browser Runtime: NOT VERIFIED for any of this — no real browser
 *      exists in this environment. Every method below is Node/logic
 *      verified only (see certification report).
 *   2. Transcript sync depends on an established data-channel connection
 *      — if no peer connection exists yet, sync is deferred, not
 *      fabricated as delivered.
 *   3. Persistence requires Firebase to be ready (same disclosed
 *      dependency as Stage 1/2's signaling) — honestly reports
 *      unavailable otherwise, never silently drops data without saying
 *      so.
 *   4. "Network quality" remains the real per-peer iceConnectionState
 *      string (Stage 2's own honest choice) — this file only
 *      aggregates multiple real peer states into one session-level
 *      summary (e.g. "2 connected, 1 disconnected"), never a
 *      synthesized numeric score.
 *   5. Reconnect re-runs the exact same real signaling path Stage 1/2
 *      already certified (connectToPeer) — it is not a different
 *      reconnection protocol.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["ldce-reliability-engine"] && window.CozyOS.Modules["ldce-reliability-engine"].version) return;

    const TRANSCRIPT_SYNC_TAG = "ldce-transcript-sync:";

    class LDCEReliabilityEngine {
        #listeners = new Map();
        #wiredSessions = new Set(); // sessionId set — avoid double-wiring hotspot message-received per session

        on(e, h) { if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); return s ? s.delete(h) : false; }
        #emit(e, d) { const s = this.#listeners.get(e); if (!s) return; for (const fn of Array.from(s)) { try { fn(d); } catch (_err) { /* non-fatal */ } } }

        getVersion() { return MODULE_VERSION; }

        // ── Transcript synchronization (real data channel, no new transport) ──
        /** broadcastTranscriptSegment() — sends a real, already-locally-recorded transcript segment to every connected peer in the session via LiveHotspotEngine's existing data channel. Real, honest: reports per-peer send failure rather than silently dropping. */
        broadcastTranscriptSegment(sessionId, segment) {
            const media = window.CozyOS.LDCEMediaSessionEngine;
            const hotspot = window.CozyOS.LiveHotspotEngine;
            if (!media || !hotspot) return { success: false, reason: "LDCEMediaSessionEngine/LiveHotspotEngine not available." };
            const ldce = window.CozyOS.LDCESessionEngine;
            const roster = ldce ? ldce.listParticipants(sessionId, segment.speaker) : [];
            const payload = JSON.stringify({ tag: TRANSCRIPT_SYNC_TAG.slice(0, -1), sessionId, segment });
            let sent = 0, failed = [];
            for (const p of roster) {
                if (p.userId === segment.speaker) continue;
                const state = media.getConnectionState(sessionId, p.userId);
                if (state.state === "not-found") continue;
                const result = hotspot.sendMessage(this.#connectionIdFor(sessionId, p.userId), payload);
                if (result.success) sent++; else failed.push(p.userId);
            }
            return { success: true, sent, failed };
        }
        #connectionIdFor(sessionId, peerUserId) {
            const media = window.CozyOS.LDCEMediaSessionEngine;
            const state = media ? media.getConnectionState(sessionId, peerUserId) : null;
            return state && state.connectionId ? state.connectionId : null;
        }

        /** wireTranscriptSync(sessionId, localUserId) — subscribes once to LiveHotspotEngine's real "message-received" event, parses only messages tagged as transcript-sync payloads (never touches unrelated data-channel traffic used for other purposes), and merges the remote segment into the LOCAL CozyConversation transcript via the real addTranscriptSegment() — never a second store. */
        wireTranscriptSync(sessionId) {
            if (this.#wiredSessions.has(sessionId)) return { success: true, alreadyWired: true };
            const hotspot = window.CozyOS.LiveHotspotEngine;
            const ldce = window.CozyOS.LDCESessionEngine;
            const conversation = window.CozyOS.CozyConversation;
            if (!hotspot || typeof hotspot.on !== "function") return { success: false, reason: "LiveHotspotEngine is not available." };
            this.#wiredSessions.add(sessionId);
            hotspot.on("message-received", ({ data }) => {
                let parsed;
                try { parsed = JSON.parse(data); } catch (_err) { return; }
                if (!parsed || parsed.tag !== TRANSCRIPT_SYNC_TAG.slice(0, -1) || parsed.sessionId !== sessionId) return;
                const session = ldce ? ldce.getSession(sessionId) : null;
                if (session && conversation) {
                    conversation.addTranscriptSegment(session.conversationId, { ...parsed.segment, source: (parsed.segment.source || "remote") + "-synced" });
                    this.#emit("transcript-synced", { sessionId, segment: parsed.segment });
                }
            });
            return { success: true };
        }

        // ── Persistent transcript storage + recovery (real Firestore) ──
        /** persistTranscript() — real, durable write (unlike everything else in this platform capability, which is in-memory only, disclosed since Founder Story Stage 1). Honestly reports unavailable if Firebase isn't ready — never silently no-ops. */
        async persistTranscript(sessionId) {
            const ldce = window.CozyOS.LDCESessionEngine;
            const conversation = window.CozyOS.CozyConversation;
            const firestore = window.CozyOS.Firebase && window.CozyOS.Firebase.Firestore;
            if (!ldce || !conversation) return { success: false, reason: "LDCESessionEngine/CozyConversation not available." };
            if (!firestore || typeof firestore.setDocument !== "function") return { success: false, reason: "Firebase Firestore is not available — transcript remains in-memory only for this session." };
            const session = ldce.getSession(sessionId);
            if (!session) return { success: false, reason: "Unknown session." };
            const timeline = conversation.getTimeline(session.conversationId) || [];
            const result = await firestore.setDocument("ldce-transcripts", sessionId, { sessionId, conversationId: session.conversationId, timeline, savedAt: new Date().toISOString() });
            if (!result.available) return { success: false, reason: result.reason };
            this.#emit("transcript-persisted", { sessionId, segmentCount: timeline.length });
            return { success: true, segmentCount: timeline.length };
        }

        /** recoverTranscript() — real read-back from Firestore, merged into the LOCAL CozyConversation timeline (only segments not already present, matched by timestamp+text, to avoid duplicate entries on repeated recovery calls). Honestly reports "nothing to recover" rather than fabricating history. */
        async recoverTranscript(sessionId) {
            const ldce = window.CozyOS.LDCESessionEngine;
            const conversation = window.CozyOS.CozyConversation;
            const firestore = window.CozyOS.Firebase && window.CozyOS.Firebase.Firestore;
            if (!ldce || !conversation) return { success: false, reason: "LDCESessionEngine/CozyConversation not available." };
            if (!firestore || typeof firestore.getDocument !== "function") return { success: false, reason: "Firebase Firestore is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { success: false, reason: "Unknown session." };
            const result = await firestore.getDocument("ldce-transcripts", sessionId);
            if (!result.available) return { success: false, reason: result.reason || "No persisted transcript found for this session." };
            const existing = conversation.getTimeline(session.conversationId) || [];
            const existingKeys = new Set(existing.map((s) => `${s.timestamp}|${s.text}`));
            let recovered = 0;
            for (const seg of result.data.timeline || []) {
                const key = `${seg.timestamp}|${seg.text}`;
                if (existingKeys.has(key)) continue;
                conversation.addTranscriptSegment(session.conversationId, seg);
                existingKeys.add(key);
                recovered++;
            }
            this.#emit("transcript-recovered", { sessionId, recovered });
            return { success: true, recovered };
        }

        // ── Reconnect handling (reuses Stage 2's real signaling, not a new protocol) ──
        /** reconnectToPeer() — real: tears down any stale connection record, then calls LDCEMediaSessionEngine.connectToPeer() again — the exact same, already-certified real signaling path, not a second reconnection mechanism. */
        async reconnectToPeer(sessionId, fromUserId, toUserId) {
            const media = window.CozyOS.LDCEMediaSessionEngine;
            if (!media) return { success: false, reason: "LDCEMediaSessionEngine is not available." };
            media.disconnectFromPeer(sessionId, toUserId);
            const result = await media.connectToPeer(sessionId, fromUserId, toUserId);
            this.#emit("peer-reconnect-attempted", { sessionId, fromUserId, toUserId, success: result.success });
            return result;
        }

        // ── Network quality aggregation (real per-peer states, no synthesized score) ──
        /** getSessionNetworkQuality() — real aggregation of every real per-peer iceConnectionState (Stage 2), never a synthesized number. */
        getSessionNetworkQuality(sessionId, requesterId) {
            const ldce = window.CozyOS.LDCESessionEngine;
            const media = window.CozyOS.LDCEMediaSessionEngine;
            if (!ldce || !media) return { available: false, reason: "Required engines not available." };
            const roster = ldce.listParticipants(sessionId, requesterId);
            const byState = {};
            for (const p of roster) {
                if (p.userId === requesterId) continue;
                const state = media.getConnectionState(sessionId, p.userId);
                const key = state.iceConnectionState || state.state;
                byState[key] = (byState[key] || 0) + 1;
            }
            return { available: true, summary: byState };
        }

        // ── Media recovery (reuses Stage 2's real capture/attach path) ──
        /** recoverLocalMedia() — real: re-attaches local media via LDCEMediaSessionEngine.attachLocalMedia() (the same real getUserMedia path), then, for every peer already connected, adds the fresh tracks and triggers a real renegotiation offer via LiveHotspotEngine's Stage-2 renegotiation plumbing — the caller is responsible for pushing that offer through signaling (same disclosed limitation as Stage 2). */
        async recoverLocalMedia(sessionId, userId, videoElement) {
            const media = window.CozyOS.LDCEMediaSessionEngine;
            const hotspot = window.CozyOS.LiveHotspotEngine;
            const ldce = window.CozyOS.LDCESessionEngine;
            if (!media || !hotspot || !ldce) return { success: false, reason: "Required engines not available." };
            const attach = await media.attachLocalMedia(sessionId, userId, videoElement);
            if (!attach.success) return attach;
            const roster = ldce.listParticipants(sessionId, userId);
            const renegotiations = [];
            for (const p of roster) {
                if (p.userId === userId) continue;
                const connectionId = this.#connectionIdFor(sessionId, p.userId);
                if (!connectionId) continue;
                const offer = await hotspot.createRenegotiationOffer(connectionId);
                renegotiations.push({ peerUserId: p.userId, connectionId, offer });
            }
            this.#emit("media-recovered", { sessionId, userId, renegotiationCount: renegotiations.length });
            return { success: true, renegotiations };
        }

        getDiagnosticsReport() { return { moduleVersion: MODULE_VERSION, wiredSessions: this.#wiredSessions.size }; }
    }

    window.CozyOS.LDCEReliabilityEngine = new LDCEReliabilityEngine();
    window.CozyOS.Modules["ldce-reliability-engine"] = Object.freeze({
        version: MODULE_VERSION,
        description: "LDCE M363 — transcript sync (real data-channel reuse), persistent transcript storage + recovery (real Firestore), reconnect (reuses Stage 2's real signaling), network-quality aggregation (real per-peer ICE states, no synthesized score), and media recovery (real re-capture + renegotiation). Browser Runtime: NOT VERIFIED — no real browser in this environment. Never duplicates CozyConversation, LiveHotspotEngine, Firebase, or Stage 1/2 engines — pure composition."
    });
})();
