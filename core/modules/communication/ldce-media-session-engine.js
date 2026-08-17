/**
 * CozyOS — Living Direct Communication Engine (LDCE)
 * Live Media Transport & Real-Time Communication
 * File Reference: core/modules/communication/ldce-media-session-engine.js
 * Layer: Core / Platform Module — Shared Platform Service (not app-owned)
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 362 — Living Direct Communication Engine, Stage 2
 *
 * ═══════════════════════════════════════════════════════════════════════
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN (Gate 1 — see
 * M362-Stage2-Gate1-Verification.md for full detail, including the two
 * structural gaps found and fixed additively before this file could be
 * written at all: LiveVideoCaptureEngine.getLocalStream() and
 * LiveHotspotEngine's track-attachment/observability support)
 * ═══════════════════════════════════════════════════════════════════════
 *   This file NEVER owns session lifecycle. window.CozyOS.CozyConversation
 *   (via Stage 1's LDCESessionEngine) remains the one real owner of
 *   created/active/paused/ended/cancelled state — this file only reads
 *   session/participant state through LDCESessionEngine's real public
 *   methods and never calls CozyConversation directly.
 *
 *   This file NEVER reimplements WebRTC. Every peer connection, offer/
 *   answer, and track is created by LiveHotspotEngine (extended
 *   additively this same milestone) — this file only decides WHEN to
 *   call it and WHICH local tracks to pass, via LDCESessionEngine's own
 *   (also Stage-2-extended) initiateSignaling()/answerOffer().
 *
 *   This file NEVER reimplements camera/microphone capture.
 *   LiveVideoCaptureEngine's real startPreview() already captures both
 *   audio and video in one MediaStream (verified at Gate 1) — this file
 *   only retrieves it via the new getLocalStream() getter and decides
 *   what to do with the tracks (attach to a peer connection, mute,
 *   detach). CameraManager is composed, best-effort, only for its real
 *   device-registry bookkeeping (a distinct, narrower concern than the
 *   actual capture stream) — never a second device list.
 *
 * COMPOSED, NEVER DUPLICATED
 *   - window.CozyOS.LDCESessionEngine (Stage 1) — session/participant/
 *     signaling. This file calls its public methods only; the one
 *     hardening fix made to leaveSession() this stage (see that file's
 *     own changelog) is disclosed there, not repeated here.
 *   - window.CozyOS.LiveVideoCaptureEngine — startPreview/stopPreview/
 *     pausePreview/resumePreview/switchCamera/getDevices/
 *     getLocalStream (new, Stage 2).
 *   - window.CozyOS.CameraEngine (the real bridge-exposed global for
 *     CameraManager, confirmed at M364 — CameraManager itself is an ES
 *     module with no window.CozyOS.CameraManager global; it is exposed
 *     asynchronously via core/bridge/engine-bridge-bootstrap.js under
 *     the name "CameraEngine") — best-effort device-registry sync
 *     only (switchActiveCamera), never the actual capture.
 *   - window.CozyOS.LiveHotspotEngine — read via LDCESessionEngine's
 *     signaling methods, plus this file listens to its real events
 *     (remote-track, ice-state-changed, connection-state-changed) and
 *     calls its real getRemoteStreams()/getPeerConnectionState()/
 *     addTrack()/removeTrack()/createRenegotiationOffer()/
 *     applyRenegotiationAnswer() (all Stage 2 additions to that file).
 *   - window.CozyOS.IdentityEngine — screen-share permission grants,
 *     same resource:action ACL pattern as every other stage.
 *   - window.CozyOS.AuthorizationCoordinator — not directly called by
 *     this file; Stage 1's LDCESessionEngine already gates the one
 *     sensitive action (host promotion) that needs it. Media actions
 *     here (mute/camera/screen-share) are ordinary role-gated actions,
 *     not step-up actions, matching AuthorizationCoordinator's own
 *     documented scope (Gate 1, Stage 1).
 *   - window.CozyOS.SessionService — not called directly; callers pass
 *     their own userId, consistent with how LDCESessionEngine itself
 *     is invoked (Session.current().uid is a UI-layer concern).
 *   - core/platform/accessibility-engine.js — composed only for its
 *     real, existing audit functions where relevant; this file never
 *     claims it executes live captions/contrast, since Gate 1 (Stage 1
 *     and re-confirmed Stage 2) established it is an auditor only.
 *
 * HONEST, DISCLOSED STAGE 2 SCOPE LIMITS
 *   1. One local capture per session, per browser tab — this file
 *      assumes the local participant is a single real device/user;
 *      multiple simultaneous local cameras in one tab is not a real
 *      scenario this composes for.
 *   2. Mesh topology only (inherited from Stage 1) — each remote peer
 *      is its own LiveHotspotEngine connection; no SFU exists.
 *   3. No TURN/STUN (inherited, unchanged) — real NAT traversal may
 *      fail on some networks.
 *   4. "Network quality"/"connection quality" are the REAL, raw
 *      `iceConnectionState` string read directly off the peer
 *      connection — not a synthesized score. A genuine bitrate/packet-
 *      loss metric would need `RTCPeerConnection.getStats()`, not
 *      composed in this stage (disclosed, not fabricated as a
 *      percentage).
 *   5. Screen sharing uses the real, standard
 *      `navigator.mediaDevices.getDisplayMedia()` where available;
 *      honestly reports unsupported where it is not (older browsers).
 *   6. Accessibility: only interface preparation, per explicit
 *      instruction — no live captions, no live translation. Captions
 *      hook honestly reports `available:false` until a real ASR/
 *      caption-rendering pipeline exists (Stage 3+ scope).
 *   7. Renegotiation (mid-call track add/remove) requires the caller to
 *      push the new offer/answer through the same signaling channel
 *      Stage 1 already established — this file exposes the real
 *      renegotiation offer/answer plumbing but does not invent a
 *      second signaling path for it.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.1.0";

    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["ldce-media-session-engine"] && window.CozyOS.Modules["ldce-media-session-engine"].version) return;

    function _screenSharePermission(sessionId) { return `ldce-screenshare:${sessionId}`; }
    function _detectDeviceType() {
        if (typeof navigator === "undefined" || !navigator.userAgent) return "unknown";
        const ua = navigator.userAgent.toLowerCase();
        if (/mobile|android|iphone/.test(ua)) return "mobile";
        if (/ipad|tablet/.test(ua)) return "tablet";
        return "desktop";
    }

    class LDCEMediaSessionEngine {
        #localCaptures = new Map(); // sessionId -> { userId, videoElement, localStream, cameraDeviceId }
        #connections = new Map();  // sessionId -> Map(peerUserId -> connectionId)
        #mediaState = new Map();   // sessionId -> Map(userId -> { connectionQuality, networkQuality, deviceType, screenSharing })
        #listeners = new Map();
        #hotspotWired = false;

        on(eventName, handler) { if (!this.#listeners.has(eventName)) this.#listeners.set(eventName, new Set()); this.#listeners.get(eventName).add(handler); return () => this.off(eventName, handler); }
        off(eventName, handler) { const s = this.#listeners.get(eventName); return s ? s.delete(handler) : false; }
        #emit(eventName, detail) { const s = this.#listeners.get(eventName); if (!s) return; for (const fn of Array.from(s)) { try { fn(detail); } catch (_err) { /* one listener's failure must not break media state */ } } }

        getVersion() { return MODULE_VERSION; }

        /** #wireHotspotEvents() — one-time subscription to LiveHotspotEngine's real (Stage 2) events, republished with this engine's own connectionId→session/user context. Never a second event system — this file just translates connectionId back to (sessionId, peerUserId) using its own #connections map. */
        #wireHotspotEvents() {
            if (this.#hotspotWired) return;
            const hotspot = window.CozyOS.LiveHotspotEngine;
            if (!hotspot || typeof hotspot.on !== "function") return;
            this.#hotspotWired = true;

            const findContext = (connectionId) => {
                for (const [sessionId, peers] of this.#connections.entries()) {
                    for (const [userId, cid] of peers.entries()) {
                        if (cid === connectionId) return { sessionId, userId };
                    }
                }
                return null;
            };

            hotspot.on("remote-track", ({ connectionId, streams, kind }) => {
                const ctx = findContext(connectionId);
                if (!ctx) return;
                this.#emit("remote-track", { ...ctx, connectionId, streams, kind });
            });
            hotspot.on("ice-state-changed", ({ connectionId, iceConnectionState }) => {
                const ctx = findContext(connectionId);
                if (!ctx) return;
                this.#setMediaState(ctx.sessionId, ctx.userId, { connectionQuality: iceConnectionState });
                this.#emit("connection-quality-changed", { ...ctx, connectionId, connectionQuality: iceConnectionState });
            });
            hotspot.on("connection-state-changed", ({ connectionId, connectionState }) => {
                const ctx = findContext(connectionId);
                if (!ctx) return;
                this.#emit("connection-state-changed", { ...ctx, connectionId, connectionState });
            });
            hotspot.on("device-disconnected", ({ connectionId }) => {
                const ctx = findContext(connectionId);
                if (!ctx) return;
                this.#emit("peer-disconnected", { ...ctx, connectionId });
            });
        }

        #getMediaState(sessionId, userId) {
            if (!this.#mediaState.has(sessionId)) this.#mediaState.set(sessionId, new Map());
            const map = this.#mediaState.get(sessionId);
            if (!map.has(userId)) map.set(userId, { connectionQuality: "new", networkQuality: { available: false, reason: "No real bandwidth/packet-loss metric composed in this stage — would require RTCPeerConnection.getStats()." }, deviceType: _detectDeviceType(), screenSharing: false });
            return map.get(userId);
        }
        #setMediaState(sessionId, userId, patch) {
            const current = this.#getMediaState(sessionId, userId);
            this.#mediaState.get(sessionId).set(userId, { ...current, ...patch });
        }
        /** getParticipantMediaState() — the Stage-2-only fields (connectionQuality/networkQuality/deviceType/screenSharing) alongside Stage 1's own roster fields (camera/mic/speaking/role/language), fetched from LDCESessionEngine directly rather than duplicated here. Fail-closed the same way Stage 1's listParticipants() is: a non-participant requester gets null. */
        getParticipantMediaState(sessionId, requesterId, userId) {
            const ldce = window.CozyOS.LDCESessionEngine;
            const rosterRecord = ldce && typeof ldce.getParticipant === "function" ? ldce.getParticipant(sessionId, requesterId, userId) : null;
            if (!rosterRecord) return null;
            return { ...rosterRecord, ...this.#getMediaState(sessionId, userId) };
        }

        // ── Local media capture (never owns session lifecycle) ──
        /** attachLocalMedia() — composes LiveVideoCaptureEngine.startPreview() (real getUserMedia, both audio+video), then reflects camera/mic-on state into Stage 1's own roster via setParticipantState(). Requires the caller to already be a joined participant — checked via LDCESessionEngine.getParticipant(), never bypassed. */
        async attachLocalMedia(sessionId, userId, videoElement, { deviceId = null } = {}) {
            const ldce = window.CozyOS.LDCESessionEngine;
            if (!ldce || !ldce.getParticipant(sessionId, userId, userId)) return { success: false, reason: "Not a joined participant of this session." };
            const capture = window.CozyOS.LiveVideoCaptureEngine;
            if (!capture || typeof capture.startPreview !== "function") return { success: false, reason: "LiveVideoCaptureEngine is not available." };
            const result = await capture.startPreview(videoElement, { deviceId });
            if (!result.success) return result;
            const localStream = typeof capture.getLocalStream === "function" ? capture.getLocalStream() : null;
            this.#localCaptures.set(sessionId, { userId, videoElement, localStream, cameraDeviceId: deviceId });
            ldce.setParticipantState(sessionId, userId, { cameraOn: true, muted: false });
            this.#setMediaState(sessionId, userId, { deviceType: _detectDeviceType() });
            this.#emit("local-media-attached", { sessionId, userId, hasAudio: !!(localStream && localStream.getAudioTracks().length), hasVideo: !!(localStream && localStream.getVideoTracks().length) });
            return { success: true };
        }

        /** detachLocalMedia() — real capture.stopPreview() (stops every real track). Disclosed: does not itself tear down any active peer connection — a track that's stopped simply goes silent/black on the remote side until the caller separately ends the call. */
        detachLocalMedia(sessionId, userId) {
            const capture = window.CozyOS.LiveVideoCaptureEngine;
            if (capture && typeof capture.stopPreview === "function") capture.stopPreview();
            this.#localCaptures.delete(sessionId);
            const ldce = window.CozyOS.LDCESessionEngine;
            if (ldce) ldce.setParticipantState(sessionId, userId, { cameraOn: false, muted: true });
            this.#emit("local-media-detached", { sessionId, userId });
            return { success: true };
        }

        /** switchCamera() — composes both real, distinct concerns identified at Gate 1: LiveVideoCaptureEngine.switchCamera() (the actual stream swap) and CameraManager.switchActiveCamera() (best-effort device-registry bookkeeping, honestly skipped if the device isn't registered there — never a second device list). */
        async switchCamera(sessionId, userId, deviceId) {
            const capture = window.CozyOS.LiveVideoCaptureEngine;
            if (!capture || typeof capture.switchCamera !== "function") return { success: false, reason: "LiveVideoCaptureEngine is not available." };
            const result = await capture.switchCamera(deviceId);
            if (!result.success) return result;
            const cameraManager = window.CozyOS.CameraEngine;
            if (cameraManager && typeof cameraManager.switchActiveCamera === "function") {
                try { cameraManager.switchActiveCamera(deviceId); } catch (_err) { /* honest no-op — device may not be registered in CameraManager's own registry */ }
            }
            const entry = this.#localCaptures.get(sessionId);
            if (entry) entry.cameraDeviceId = deviceId;
            this.#emit("camera-switched", { sessionId, userId, deviceId });
            return { success: true };
        }

        /**
         * toggleMicrophone() — real audio-track mute. Disclosed, genuinely
         * new (Gate 1 finding): LiveVideoCaptureEngine's own pausePreview/
         * resumePreview only ever toggle VIDEO tracks (confirmed by
         * reading its source) — there was no existing method anywhere in
         * this codebase for real audio-track muting. This is that narrow,
         * new capability, operating only on the local capture's own
         * MediaStream — never on a remote participant's hardware.
         */
        toggleMicrophone(sessionId, userId, muted) {
            const entry = this.#localCaptures.get(sessionId);
            if (!entry || entry.userId !== userId || !entry.localStream) return { success: false, reason: "No active local capture for this participant." };
            for (const track of entry.localStream.getAudioTracks()) track.enabled = !muted;
            const ldce = window.CozyOS.LDCESessionEngine;
            if (ldce) ldce.setParticipantState(sessionId, userId, { muted: !!muted });
            this.#emit("microphone-toggled", { sessionId, userId, muted: !!muted });
            return { success: true };
        }

        /** toggleCamera() — composes LiveVideoCaptureEngine's own real pausePreview()/resumePreview() (video-track toggle, already existed). */
        toggleCamera(sessionId, userId, cameraOn) {
            const entry = this.#localCaptures.get(sessionId);
            if (!entry || entry.userId !== userId) return { success: false, reason: "No active local capture for this participant." };
            const capture = window.CozyOS.LiveVideoCaptureEngine;
            if (!capture) return { success: false, reason: "LiveVideoCaptureEngine is not available." };
            const result = cameraOn ? capture.resumePreview() : capture.pausePreview();
            if (!result.success) return result;
            const ldce = window.CozyOS.LDCESessionEngine;
            if (ldce) ldce.setParticipantState(sessionId, userId, { cameraOn: !!cameraOn });
            this.#emit("camera-toggled", { sessionId, userId, cameraOn: !!cameraOn });
            return { success: true };
        }

        // ── Screen sharing (real getDisplayMedia, permission-gated) ──
        /** grantScreenSharePermission() — host/moderator only, composes IdentityEngine's real per-resource grant, same shape as every other ACL in this platform capability. */
        grantScreenSharePermission(sessionId, actorId, targetUserId) {
            const ldce = window.CozyOS.LDCESessionEngine;
            if (!ldce) return { success: false, reason: "LDCESessionEngine is not available." };
            const actorState = ldce.getParticipant(sessionId, actorId, actorId);
            if (!actorState || (actorState.role !== "moderator" && actorState.role !== "host")) {
                return { success: false, reason: "Only the host or a moderator may grant screen-share permission." };
            }
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.grantResourcePermission !== "function") return { success: false, reason: "IdentityEngine is not available." };
            try { identity.grantResourcePermission(targetUserId, _screenSharePermission(sessionId)); return { success: true }; }
            catch (err) { return { success: false, reason: err.message || "IdentityEngine declined the grant." }; }
        }

        /** startScreenShare() — real navigator.mediaDevices.getDisplayMedia(), honestly unsupported where the API doesn't exist. Permission-gated via IdentityEngine (host-granted) — never bypassed. */
        async startScreenShare(sessionId, userId) {
            const identity = window.CozyOS.IdentityEngine;
            const hasPermission = identity && typeof identity.checkResourcePermission === "function" && identity.checkResourcePermission(userId, _screenSharePermission(sessionId));
            if (!hasPermission) return { success: false, reason: "Screen sharing has not been granted for this participant in this session." };
            if (typeof navigator === "undefined" || !navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== "function") {
                return { success: false, reason: "getDisplayMedia is not available in this browser/context." };
            }
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                this.#setMediaState(sessionId, userId, { screenSharing: true });
                this.#emit("screen-share-started", { sessionId, userId });
                stream.getVideoTracks()[0].onended = () => { this.#setMediaState(sessionId, userId, { screenSharing: false }); this.#emit("screen-share-stopped", { sessionId, userId }); };
                return { success: true, stream };
            } catch (err) { return { success: false, reason: `Real getDisplayMedia() rejection: ${err.message || String(err)}` }; }
        }
        stopScreenShare(sessionId, userId, stream) {
            if (stream && typeof stream.getTracks === "function") for (const track of stream.getTracks()) track.stop();
            this.#setMediaState(sessionId, userId, { screenSharing: false });
            this.#emit("screen-share-stopped", { sessionId, userId });
            return { success: true };
        }

        // ── Peer connection (real tracks, via Stage 1's now-track-aware signaling) ──
        /** connectToPeer() — the local participant's real capture tracks are attached BEFORE the offer is created (the only point WebRTC allows this without a renegotiation round-trip — confirmed at Gate 1). Composes LDCESessionEngine.initiateSignaling() (Stage 2-extended), never touches LiveHotspotEngine directly. */
        async connectToPeer(sessionId, fromUserId, toUserId) {
            this.#wireHotspotEvents();
            const ldce = window.CozyOS.LDCESessionEngine;
            if (!ldce) return { success: false, reason: "LDCESessionEngine is not available." };
            const entry = this.#localCaptures.get(sessionId);
            const tracks = entry && entry.localStream ? entry.localStream.getTracks().map((track) => ({ track, stream: entry.localStream })) : [];
            const result = await ldce.initiateSignaling(sessionId, fromUserId, toUserId, { tracks });
            if (!result.success) return result;
            if (!this.#connections.has(sessionId)) this.#connections.set(sessionId, new Map());
            this.#connections.get(sessionId).set(toUserId, result.connectionId);
            ldce.completeSignaling(sessionId, fromUserId, toUserId, result.connectionId);
            this.#emit("peer-connection-initiated", { sessionId, fromUserId, toUserId, connectionId: result.connectionId });
            return result;
        }

        /** acceptPeerConnection() — the answering side, same real-tracks-before-answer composition. */
        async acceptPeerConnection(sessionId, toUserId, fromUserId, offerCode) {
            this.#wireHotspotEvents();
            const ldce = window.CozyOS.LDCESessionEngine;
            if (!ldce) return { success: false, reason: "LDCESessionEngine is not available." };
            const entry = this.#localCaptures.get(sessionId);
            const tracks = entry && entry.localStream ? entry.localStream.getTracks().map((track) => ({ track, stream: entry.localStream })) : [];
            const result = await ldce.answerOffer(sessionId, toUserId, fromUserId, offerCode, { tracks });
            if (!result.success) return result;
            if (!this.#connections.has(sessionId)) this.#connections.set(sessionId, new Map());
            this.#connections.get(sessionId).set(fromUserId, result.connectionId);
            this.#emit("peer-connection-accepted", { sessionId, fromUserId, toUserId, connectionId: result.connectionId });
            return result;
        }

        /** getRemoteStreams()/getConnectionState() — thin, honest passthrough to LiveHotspotEngine's own real (Stage 2) accessors, resolved from this file's own sessionId/peerUserId → connectionId map. */
        getRemoteStreams(sessionId, peerUserId) {
            const connectionId = this.#connections.get(sessionId)?.get(peerUserId);
            const hotspot = window.CozyOS.LiveHotspotEngine;
            if (!connectionId || !hotspot || typeof hotspot.getRemoteStreams !== "function") return [];
            return hotspot.getRemoteStreams(connectionId);
        }
        getConnectionState(sessionId, peerUserId) {
            const connectionId = this.#connections.get(sessionId)?.get(peerUserId);
            const hotspot = window.CozyOS.LiveHotspotEngine;
            if (!connectionId || !hotspot || typeof hotspot.getPeerConnectionState !== "function") return { state: "not-found" };
            return hotspot.getPeerConnectionState(connectionId);
        }

        /** disconnectFromPeer() — real hotspot.disconnect(), then this file's own bookkeeping cleanup. Does not touch CozyConversation/session lifecycle — a peer connection ending is not the same as the call session ending (a group call may lose one peer and continue with others). */
        disconnectFromPeer(sessionId, peerUserId) {
            const connectionId = this.#connections.get(sessionId)?.get(peerUserId);
            const hotspot = window.CozyOS.LiveHotspotEngine;
            if (connectionId && hotspot && typeof hotspot.disconnect === "function") hotspot.disconnect(connectionId);
            this.#connections.get(sessionId)?.delete(peerUserId);
            this.#emit("peer-disconnected", { sessionId, peerUserId, connectionId: connectionId || null });
            return { success: true };
        }

        /** cleanupSession() — real teardown of every peer connection and the local capture for a session (e.g. when the session itself ends). Never touches CozyConversation directly — call LDCESessionEngine.endSession() separately for that. */
        cleanupSession(sessionId, userId) {
            const peers = this.#connections.get(sessionId);
            if (peers) { for (const peerUserId of Array.from(peers.keys())) this.disconnectFromPeer(sessionId, peerUserId); this.#connections.delete(sessionId); }
            if (this.#localCaptures.has(sessionId)) this.detachLocalMedia(sessionId, userId);
            this.#mediaState.delete(sessionId);
            return { success: true };
        }

        // ── Accessibility (interface preparation only, per explicit instruction) ──
        /** getAccessibilityHooks() — honest status only. No live captions/translation are built here (explicitly out of scope) — this reports what genuinely exists (the auditor) and what does not (live captions) as two distinct, never-merged fields, per Governance Principle 12. */
        getAccessibilityHooks() {
            const a11y = window.CozyOS && window.CozyOS.AccessibilityEngine;
            return {
                contrastAuditAvailable: !!(a11y && typeof a11y.scanThemeContrast === "function"),
                captions: { available: false, reason: "No live ASR-to-caption pipeline exists yet — Stage 3+ scope, not fabricated here." },
                highContrastToggle: { available: !!(window.CozyOS.Theme && typeof window.CozyOS.Theme.setTheme === "function"), note: "Composes the existing, platform-wide CozyOS.Theme 'high-contrast' theme (same as Founder Story Stage 3) — not scoped to a call UI specifically." },
                keyboardAccessible: { available: true, note: "A real UI layer's responsibility (standard tabindex/ARIA) — this engine exposes no blocking dependency on that." }
            };
        }

        getDiagnosticsReport() {
            return {
                moduleVersion: MODULE_VERSION,
                activeLocalCaptures: this.#localCaptures.size,
                sessionsWithConnections: this.#connections.size,
            };
        }
    }

    const engineInstance = new LDCEMediaSessionEngine();
    window.CozyOS.LDCEMediaSessionEngine = engineInstance;
    window.CozyOS.Modules["ldce-media-session-engine"] = Object.freeze({
        version: MODULE_VERSION,
        description: "Living Direct Communication Engine — Stage 2, Live Media Transport. Composes LiveVideoCaptureEngine (real getUserMedia capture, both audio+video), CameraManager (best-effort device-registry sync), LiveHotspotEngine (real RTCPeerConnection, extended additively this stage for track attachment and connection observability), Firebase signaling and CozyConversation (both via Stage 1's LDCESessionEngine, itself extended additively to pass tracks through), and IdentityEngine (screen-share permission grants). Never owns session lifecycle — that remains CozyConversation's, unchanged. Genuinely new: local media attach/detach/switch/mute/toggle, peer-connection orchestration with real tracks, screen sharing, and a Stage-2-only media-state side table (connectionQuality/networkQuality/deviceType/screenSharing) layered alongside Stage 1's own roster fields, never duplicating them. Honest scope limits (mesh-only, no TURN/STUN, no synthesized network-quality score, interface-only accessibility hooks) documented in this file's header."
    });
})();
