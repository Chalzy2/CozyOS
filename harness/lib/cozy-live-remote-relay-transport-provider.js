/**
 * core/shell/live/providers/cozy-live-remote-relay-transport-provider.js
 * CozyOS — Live Distribution — Remote Relay Transport Provider (client)
 * Milestone: R040 Phase 3
 *
 * REAL SCOPE DISCLOSURE
 *   Genuine remote-capable transport provider (remoteCapable = true).
 *   It speaks the real WebSocket protocol to a real, independently
 *   deployable server: server/live-relay/live-distribution-signaling-server.js.
 *   Uses the standard, native `WebSocket` global — the same one every
 *   browser ships, and the one Node.js (v21+) ships natively — so this
 *   file needs zero bundler/npm dependency and is unmodified between a
 *   real browser runtime and this repository's Node test harness.
 *
 *   HONEST INTERFACE DIFFERENCE FROM local-relay:
 *     local-relay lives inside one process and can synchronously answer
 *     "who are all the viewers of session X" because it IS the hub.
 *     A remote-relay client is, correctly, only ONE participant's
 *     connection to a server-side hub it does not own. Its
 *     publishSource()/joinViewer()/leaveViewer() therefore return
 *     immediately with a REAL dispatch result (the message really was
 *     sent over the wire) but success/delivery confirmation is
 *     inherently asynchronous and arrives via the shared
 *     CozyLiveDistributionTransport.reportAsyncState() hook — this file
 *     never fabricates a synchronous "delivered" claim for a network
 *     round trip that has not happened yet.
 *     listViewers()/getViewerLastHeartbeat() are honestly best-effort:
 *     they reflect only the last roster snapshot this connection
 *     explicitly requested via requestRoster() (real async, privileged-
 *     role only, server-authoritative) — never a guess.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CozyOS = root.CozyOS || {};
        root.CozyOS.CozyLiveRemoteRelayTransportProvider = factory().RemoteRelayTransportProvider;
    }
})(typeof window !== "undefined" ? window : globalThis, function () {
    "use strict";

    function _now() {
        if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
        return Date.now();
    }

    const RECONNECT_BASE_MS = 500;
    const RECONNECT_MAX_MS = 15000;

    class RemoteRelayTransportProvider {
        /**
         * @param {object} opts
         * @param {string} opts.url  ws:// or wss:// URL of the signaling server
         * @param {function(sessionId:string, role:string, sub:string):string} opts.getToken
         *        Real, caller-supplied signed-token issuer (the server mints
         *        and signs tokens server-side; this provider never signs
         *        its own — see server/live-relay/session-token.js).
         * @param {object} [opts.transport] The CozyLiveDistributionTransport
         *        instance to report real async state back into via
         *        reportAsyncState(). If omitted, state is only observable
         *        through onEvent().
         * @param {function(string, object)} [opts.onEvent] optional raw event sink
         */
        constructor(opts = {}) {
            if (!opts.url) throw new TypeError("[RemoteRelayTransportProvider] opts.url is required.");
            if (typeof opts.getToken !== "function") throw new TypeError("[RemoteRelayTransportProvider] opts.getToken(sessionId, role, sub) is required.");
            this.id = "remote-relay";
            this.type = "websocket";
            this.remoteCapable = true; // honest: this really can reach a separate process/network
            this._url = opts.url;
            this._getToken = opts.getToken;
            this._transport = opts.transport || null;
            this._onEvent = typeof opts.onEvent === "function" ? opts.onEvent : () => {};

            /** sessionId -> connection record */
            this._conns = new Map();
            /** sessionId -> last known roster snapshot (from requestRoster) */
            this._rosterCache = new Map();
        }

        // ---- internal connection lifecycle ----
        _connectionFor(sessionId, role, sub) {
            let rec = this._conns.get(sessionId);
            if (rec && (rec.ws.readyState === 0 || rec.ws.readyState === 1)) return rec;
            rec = {
                ws: null,
                authed: false,
                role,
                sub,
                sessionId,
                pendingSend: [],
                reconnectAttempt: 0,
                closedByUser: false,
                lastHeartbeatAt: _now(),
            };
            this._conns.set(sessionId, rec);
            this._open(rec);
            return rec;
        }

        _open(rec) {
            const ws = new WebSocket(this._url);
            rec.ws = ws;
            ws.addEventListener("open", () => {
                rec.reconnectAttempt = 0;
                const token = this._getToken(rec.sessionId, rec.role, rec.sub);
                this._raw(rec, { type: "auth", token });
            });
            ws.addEventListener("message", (evt) => this._onMessage(rec, evt));
            ws.addEventListener("close", () => this._onClose(rec));
            ws.addEventListener("error", () => { /* real transport error; close handler follows */ });
        }

        _onMessage(rec, evt) {
            let msg;
            try { msg = JSON.parse(evt.data); } catch (_e) { return; }
            this._onEvent(msg.type, msg);

            switch (msg.type) {
                case "auth-ack":
                    if (msg.success) {
                        rec.authed = true;
                        const queued = rec.pendingSend;
                        rec.pendingSend = [];
                        for (const m of queued) this._raw(rec, m);
                    } else {
                        this._report(rec.sessionId, rec.connectionKey || rec.role, "disconnected", { reason: msg.reason, authFailed: true });
                    }
                    break;
                case "join-ack":
                    if (msg.success) this._report(rec.sessionId, msg.viewerId, "connected", { ack: "join" });
                    break;
                case "publish-ack":
                    this._report(rec.sessionId, "source", "connected", { ack: "publish", segmentId: msg.segmentId, delivered: msg.delivered });
                    break;
                case "segment":
                    this._onEvent("segment-received", msg); // real inbound segment delivery for a viewer connection
                    break;
                case "translated-segment":
                    this._onEvent("translated-segment-received", msg); // real inbound per-language-group translated delivery
                    break;
                case "publish-translated-ack":
                    this._report(rec.sessionId, "source", "connected", { ack: "publish-translated", segmentId: msg.segmentId, language: msg.language, delivered: msg.delivered });
                    break;
                case "state":
                    this._report(msg.sessionId, msg.connectionKey, msg.state, { fromServer: true });
                    break;
                case "roster":
                    this._rosterCache.set(msg.sessionId, { at: _now(), viewers: msg.viewers, sourceConnected: msg.sourceConnected });
                    break;
                case "heartbeat-ack":
                    rec.lastHeartbeatAt = _now();
                    break;
                case "error":
                    this._onEvent("provider-error", msg);
                    break;
                default:
                    break;
            }
        }

        _onClose(rec) {
            rec.authed = false;
            if (rec.closedByUser) { this._conns.delete(rec.sessionId); return; }
            this._report(rec.sessionId, rec.connectionKey || rec.role, "reconnecting", {});
            const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * Math.pow(2, rec.reconnectAttempt++));
            setTimeout(() => { if (this._conns.get(rec.sessionId) === rec && !rec.closedByUser) this._open(rec); }, delay);
        }

        _raw(rec, obj) {
            if (rec.ws && rec.ws.readyState === 1 && rec.authed) {
                rec.ws.send(JSON.stringify(obj));
                return true;
            }
            if (rec.ws && rec.ws.readyState === 1 && obj.type === "auth") {
                rec.ws.send(JSON.stringify(obj));
                return true;
            }
            rec.pendingSend.push(obj);
            return false;
        }

        _report(sessionId, connectionKey, state, detail) {
            if (this._transport && typeof this._transport.reportAsyncState === "function") {
                this._transport.reportAsyncState(sessionId, connectionKey, state, detail);
            }
            this._onEvent("connection-state", { sessionId, connectionKey, state, detail });
        }

        // ---- CozyLiveDistributionTransport provider interface ----
        publishSource(sessionId, segment) {
            const rec = this._connectionFor(sessionId, "host", segment.publisherId || "source");
            rec.connectionKey = "source";
            const dispatched = this._raw(rec, { type: "publish-source", sessionId, segment });
            return { success: true, dispatched, delivered: "pending" };
        }

        /**
         * publishTranslatedSegment() — R040 Phase 3E addition. Sends an
         * ALREADY-COMPUTED translation result (from the real
         * LiveLanguageFanoutRouter/LiveChurchLanguageOrchestrator — this
         * provider never translates anything itself) to a specific set
         * of viewerIds only. Distinct wire from publishSource(): that
         * carries the raw source segment to everyone; this carries one
         * language group's result to just that group's viewers. Only
         * the host/moderator connection (the one already publishing
         * source) may call this — same server-side role check as
         * publish-source.
         */
        publishTranslatedSegment(sessionId, targetViewerIds, payload) {
            const rec = this._connectionFor(sessionId, "host", (payload && payload.publisherId) || "source");
            rec.connectionKey = "source";
            const dispatched = this._raw(rec, {
                type: "publish-translated",
                sessionId,
                segmentId: payload.segmentId,
                language: payload.language,
                translated: payload,
                targetViewerIds,
            });
            return { success: true, dispatched, delivered: "pending" };
        }

        /**
         * connectAsHost() — R040 Phase 4A continuation (STEP 4D
         * dependency A). Establishes this connection's real
         * authenticated session presence for a host/moderator-role
         * participant, with none of the side effects publishSource()
         * carries.
         *
         * THE GAP THIS CLOSES: previously the only way a host-role
         * participant obtained a connection was publishSource() (an
         * ALREADY-AUTHORIZED publisher path — it immediately declares
         * this connection the session's source) or joinViewer()
         * (viewer-role identity, wrong role entirely). There was no
         * way for a host to reach an authenticated session presence
         * BEFORE requestSpeak() — a genuine chicken-and-egg gap: a
         * host cannot request-to-speak without a connection, and the
         * only host-role path to a connection itself required already
         * being authorized to speak.
         *
         * HOW THIS STAYS CONSISTENT WITH EVERY EXISTING RULE:
         *   - No bypass of SessionAuthority: this method sends nothing
         *     but the same {type:"auth"} message _open() already sends
         *     for every connection (publishSource/joinViewer included).
         *     Speaking permission is untouched — the participant stays
         *     server-side "not yet granted" until a real grantSpeak.
         *   - No trusting a client-supplied role: opts.getToken(...)
         *     already exists and must return a SERVER-SIGNED token;
         *     this method takes no role argument of its own — the
         *     signed token's role is what the server actually
         *     enforces, exactly as it always has for every other
         *     method on this class.
         *   - No second authentication system: this calls the SAME
         *     _connectionFor()/_open()/{type:"auth"} path every other
         *     method already uses. Nothing new is introduced.
         *   - No automatic speaking grant: this method never sends
         *     request-speak, grant-speak, or any authority message —
         *     it only opens+authenticates. The caller still must call
         *     requestSpeak() (and a moderator/host must still call
         *     grantSpeak()) exactly as before.
         *   - No viewer-roster pollution: this mirrors joinViewer()'s
         *     shape (open + auth + set connectionKey to the real
         *     identity) but deliberately does NOT send "join-viewer" —
         *     the server never adds this connection to
         *     session.viewers; it only learns of the connection via
         *     the same auth-ack every connection gets, until this same
         *     connection later calls publishSource()/reportRoster()/
         *     etc., at which point the server's own existing,
         *     unmodified checks (conn.role from the signed token)
         *     apply exactly as before.
         *
         * @param {string} sessionId
         * @param {string} hostId  The real host/moderator identity
         *        (the sub the session token was issued for) — never a
         *        synthetic or placeholder id.
         * @returns {{success:true, pending:true}} Connection has been
         *        initiated; completion is observed the same way every
         *        other connection's completion is: an "auth-ack" event
         *        via opts.onEvent (and reportAsyncState() if a
         *        transport was supplied), never a fabricated
         *        synchronous "connected" claim.
         */
        connectAsHost(sessionId, hostId) {
            const rec = this._connectionFor(sessionId, "host", hostId);
            rec.connectionKey = hostId;
            return { success: true, pending: true };
        }

        joinViewer(sessionId, viewerId) {
            const rec = this._connectionFor(sessionId, "viewer", viewerId);
            rec.connectionKey = viewerId;
            const dispatched = this._raw(rec, { type: "join-viewer", sessionId, viewerId });
            return { success: true, dispatched, pending: true };
        }

        leaveViewer(sessionId, viewerId) {
            const rec = this._conns.get(sessionId);
            if (!rec) return { success: false, reason: "No active connection for session." };
            const dispatched = this._raw(rec, { type: "leave-viewer", sessionId, viewerId });
            rec.closedByUser = true;
            try { rec.ws.close(1000, "leave"); } catch (_e) { /* already closing */ }
            return { success: true, dispatched };
        }

        /**
         * reportRoster() — R040 Phase 3 (continuation) addition. Sends
         * this session's real, already-computed LDCE roster snapshot
         * (see core/modules/communication/ldce-roster-reporter.js, the
         * paired composer — this method never computes a roster
         * itself) over the SAME host connection publishSource() uses.
         * Server-side, only an authenticated 'host'-role connection may
         * report a roster (see live-distribution-signaling-server.js
         * #_onRosterSync()) — this method does not itself enforce that;
         * the server independently re-verifies role from the signed
         * token, never from this call.
         *
         * Deliberately does NOT open a new connection: reusing
         * _connectionFor() here without an existing session record
         * would mint a connection under a synthetic identity (not the
         * real host's), which the server's roleResolver would then
         * correctly refuse as an unrecognized participant. A roster can
         * only be reported over the SAME connection publishSource()
         * already opened with the real hostId/publisherId — so this
         * honestly fails if that connection doesn't exist yet, rather
         * than fabricating one.
         */
        reportRoster(sessionId, participants) {
            const rec = this._conns.get(sessionId);
            if (!rec) return { success: false, reason: "No active host connection for this session — call publishSource() to establish one before reporting a roster." };
            const dispatched = this._raw(rec, { type: "roster-sync", sessionId, participants });
            return { success: true, dispatched };
        }

        heartbeat(sessionId, connectionKey) {
            const rec = this._conns.get(sessionId);
            if (!rec) return { success: false, reason: "No active connection for session." };
            const dispatched = this._raw(rec, { type: "heartbeat", sessionId, connectionKey });
            return { success: dispatched };
        }

        /** requestRoster() — real async, privileged-role only. Resolves once the server answers, not before. */
        requestRoster(sessionId, { timeoutMs = 5000 } = {}) {
            const rec = this._conns.get(sessionId);
            if (!rec) return Promise.reject(new Error("No active connection for session."));
            this._raw(rec, { type: "roster-request", sessionId });
            const startedAt = _now();
            return new Promise((resolve, reject) => {
                const check = () => {
                    const cached = this._rosterCache.get(sessionId);
                    if (cached && cached.at >= startedAt) return resolve(cached);
                    if (_now() - startedAt > timeoutMs) return reject(new Error("Roster request timed out."));
                    setTimeout(check, 50);
                };
                check();
            });
        }

        // ---- Speaking authority wire methods (R040 Phase 4A) ----
        // The Phase 4A audit confirmed the server (session-authority.js +
        // live-distribution-signaling-server.js) already implements the
        // full speak-request/grant/revoke/remove/self-mute state machine
        // and was already fully tested server-side — but this client
        // provider had no methods to actually send any of those message
        // types. These compose the existing wire protocol (see
        // server/live-relay/README.md's message table); they invent no
        // new authority or state of their own. Every response arrives
        // through the existing raw event sink (_onEvent, already called
        // for every message type in _onMessage above) — callers listen
        // for "request-speak-ack", "speaking-state", "removed",
        // "speak-requested", "grant-speak-ack", "revoke-speak-ack",
        // "remove-participant-ack", "self-mute-ack" via opts.onEvent.

        /** Any authenticated participant may request to speak. */
        requestSpeak(sessionId) {
            const rec = this._conns.get(sessionId);
            if (!rec) return { success: false, reason: "No active connection for session." };
            const dispatched = this._raw(rec, { type: "request-speak", sessionId });
            return { success: true, dispatched };
        }

        /** Host/moderator only — server independently re-verifies the
         * actor's real (token-issued) role; this method does not enforce
         * authorization itself, matching the existing pattern used by
         * publishSource()/reportRoster() above. */
        grantSpeak(sessionId, targetUserId) {
            const rec = this._conns.get(sessionId);
            if (!rec) return { success: false, reason: "No active connection for session." };
            const dispatched = this._raw(rec, { type: "grant-speak", sessionId, targetUserId });
            return { success: true, dispatched };
        }

        revokeSpeak(sessionId, targetUserId) {
            const rec = this._conns.get(sessionId);
            if (!rec) return { success: false, reason: "No active connection for session." };
            const dispatched = this._raw(rec, { type: "revoke-speak", sessionId, targetUserId });
            return { success: true, dispatched };
        }

        removeParticipant(sessionId, targetUserId) {
            const rec = this._conns.get(sessionId);
            if (!rec) return { success: false, reason: "No active connection for session." };
            const dispatched = this._raw(rec, { type: "remove-participant", sessionId, targetUserId });
            return { success: true, dispatched };
        }

        /** Self-mute never requires moderator authorization (server-side
         * _onSelfMute() confirms this) — any authenticated participant may
         * mute/unmute themselves. This only reports transport-level state;
         * it does not itself stop microphone capture — pairing that with
         * real mic muting is cozy-live-participation-controller.js's job. */
        selfMute(sessionId, muted) {
            const rec = this._conns.get(sessionId);
            if (!rec) return { success: false, reason: "No active connection for session." };
            const dispatched = this._raw(rec, { type: "self-mute", sessionId, muted: !!muted });
            return { success: true, dispatched };
        }

        // ---- WebRTC signaling relay wire methods (R040 Phase 4B) ----
        // This provider never creates or touches an RTCPeerConnection
        // itself (single-responsibility: this file stays "authenticated
        // wire to the relay server"; the actual MediaStream/
        // RTCPeerConnection composition lives in the new
        // core/modules/media/cozy-live-media-publisher.js). These
        // methods only forward an already-created SDP/ICE payload over
        // the SAME connection every other message on this provider
        // uses; the server independently re-verifies publish
        // authorization from the caller's real token role, never from a
        // client claim (see live-distribution-signaling-server.js
        // #_onWebrtcSignal()). Inbound webrtc-offer/webrtc-answer/
        // webrtc-ice-candidate/*-ack messages already reach callers via
        // the existing onEvent(type, msg) raw sink — this._onEvent(msg.type, msg)
        // at the top of _onMessage() fires for every message type,
        // including these new ones — so no new inbound routing is added
        // here.
        sendWebrtcOffer(sessionId, targetUserId, sdp) {
            const rec = this._conns.get(sessionId);
            if (!rec) return { success: false, reason: "No active connection for session." };
            const dispatched = this._raw(rec, { type: "webrtc-offer", sessionId, targetUserId, sdp });
            return { success: true, dispatched };
        }

        sendWebrtcAnswer(sessionId, targetUserId, sdp) {
            const rec = this._conns.get(sessionId);
            if (!rec) return { success: false, reason: "No active connection for session." };
            const dispatched = this._raw(rec, { type: "webrtc-answer", sessionId, targetUserId, sdp });
            return { success: true, dispatched };
        }

        sendWebrtcIceCandidate(sessionId, targetUserId, candidate) {
            const rec = this._conns.get(sessionId);
            if (!rec) return { success: false, reason: "No active connection for session." };
            const dispatched = this._raw(rec, { type: "webrtc-ice-candidate", sessionId, targetUserId, candidate });
            return { success: true, dispatched };
        }

        // Honest best-effort, local-cache-only — see file header.
        listViewers(sessionId) {
            const cached = this._rosterCache.get(sessionId);
            return cached ? cached.viewers.map((v) => v.viewerId) : [];
        }
        getViewerLastHeartbeat(sessionId, viewerId) {
            const cached = this._rosterCache.get(sessionId);
            if (!cached) return null;
            const v = cached.viewers.find((x) => x.viewerId === viewerId);
            return v ? v.lastHeartbeatAt : null;
        }

        /** disconnectAll() — test/teardown helper. */
        disconnectAll() {
            for (const rec of this._conns.values()) {
                rec.closedByUser = true;
                try { rec.ws.close(1000, "shutdown"); } catch (_e) { /* ignore */ }
            }
            this._conns.clear();
        }
    }

    return { RemoteRelayTransportProvider };
});
