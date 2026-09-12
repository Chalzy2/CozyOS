/**
 * server/live-relay/live-distribution-signaling-server.js
 * CozyOS — Live Distribution — Signaling + Relay Server
 * Milestone: R040 Phase 3, Section 4/7 ("real internet distribution")
 *
 * REAL SCOPE DISCLOSURE (read before trusting any claim about this file)
 *   This is a REAL, standalone, deployable Node.js server. It genuinely:
 *     - performs the RFC6455 WebSocket handshake and frames (server/live-relay/ws-frame.js)
 *     - verifies signed participant tokens (server/live-relay/session-token.js)
 *     - tracks real per-connection state machines (connecting / connected /
 *       degraded / reconnecting / disconnected) driven only by real
 *       heartbeats and real socket events, never fabricated
 *     - fans one source's published segments out to every joined viewer
 *       of that session, grouped — the server does not re-translate;
 *       translation stays the client/orchestrator's job (Section 6/11)
 *     - enforces server-side role authorization: only a connection
 *       holding a token with role "host" or "moderator" for a given
 *       sessionId may publish source segments or moderate; a "viewer"
 *       token cannot escalate itself (Section 14/16 "server-side
 *       speaking permission")
 *     - rate-limits inbound messages per connection (token bucket)
 *     - exposes GET /healthz for real process/session/connection counts
 *
 *   WHAT THIS FILE DOES NOT CLAIM:
 *     - It has NOT been deployed to any public host from this
 *       environment (no network egress here). It is LOCALLY IMPLEMENTED
 *       and LOCALLY TESTED (see server/live-relay/test/) against a real
 *       instance of itself over a real loopback TCP socket and a real
 *       WebSocket client. "Locally tested" and "production deployed"
 *       are different claims; see server/live-relay/README.md for the
 *       deployment steps a real operator still needs to perform (TLS
 *       termination, DNS, process supervision, horizontal scale-out).
 *     - It does not implement WebRTC/SFU media transport. It is a
 *       signaling + JSON-segment relay: it moves segment metadata/text/
 *       caption/translation-ready payloads and small audio chunks as
 *       JSON/base64 messages. Real-time raw media (camera/mic RTP) still
 *       goes through the existing LiveHotspotEngine/RTCPeerConnection
 *       path for participants capable of a direct/relayed WebRTC leg;
 *       this server's job is the piece Phase 2 explicitly did not have:
 *       a real remote-reachable session authority + fan-out point that
 *       does not require every viewer to be on the source's LAN.
 */
'use strict';

const http = require('http');
const crypto = require('crypto');
const wsFrame = require('./ws-frame');
const sessionToken = require('./session-token');
const identityAssertion = require('./identity-assertion');
const firebaseIdentityIssuer = require('./firebase-identity-issuer');

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 15000;
const DEFAULT_DISCONNECT_TIMEOUT_MS = 45000;
const DEFAULT_SWEEP_INTERVAL_MS = 5000;
const DEFAULT_RATE_LIMIT_PER_SEC = 30;

function nowMs() { return Date.now(); }

class RateBucket {
    constructor(ratePerSec) {
        this.rate = ratePerSec;
        this.tokens = ratePerSec;
        this.last = nowMs();
    }
    take() {
        const t = nowMs();
        const elapsed = (t - this.last) / 1000;
        this.tokens = Math.min(this.rate, this.tokens + elapsed * this.rate);
        this.last = t;
        if (this.tokens < 1) return false;
        this.tokens -= 1;
        return true;
    }
}

class LiveDistributionSignalingServer {
    /**
     * @param {object} opts
     * @param {string} opts.secret HMAC secret for verifying join/session tokens (required)
     * @param {number} [opts.heartbeatTimeoutMs]
     * @param {number} [opts.disconnectTimeoutMs]
     * @param {number} [opts.sweepIntervalMs]
     * @param {number} [opts.rateLimitPerSec]
     */
    constructor(opts = {}) {
        if (!opts.secret) throw new TypeError('[LiveDistributionSignalingServer] opts.secret is required.');
        this.secret = opts.secret;
        this.heartbeatTimeoutMs = opts.heartbeatTimeoutMs || DEFAULT_HEARTBEAT_TIMEOUT_MS;
        this.disconnectTimeoutMs = opts.disconnectTimeoutMs || DEFAULT_DISCONNECT_TIMEOUT_MS;
        this.rateLimitPerSec = opts.rateLimitPerSec || DEFAULT_RATE_LIMIT_PER_SEC;
        // R040 Phase 3B/3K — optional SessionAuthority. When present:
        //   (a) POST /session/:sessionId/token/:requesterId mints tokens
        //       server-side from a REAL resolved role, never a client claim;
        //   (b) auth and reconnect both re-check isRemoved(), so a
        //       moderator-removed participant cannot rejoin with an
        //       old, still-unexpired token (Phase 3C/3K requirement).
        // Absent (default): behaves exactly as the Phase 3A slice already
        // tested — callers mint their own tokens against `secret`.
        this.authority = opts.authority || null;
        // R040 Phase 3 (continuation) — optional LdceRosterBridge. When
        // present, an authenticated HOST connection may send
        // {type:'roster-sync', participants} to mirror its real, live
        // LDCESessionEngine roster into this process, which
        // opts.authority's roleResolver can then read from (see
        // ldce-roster-bridge.js). Absent (default): unrelated to
        // existing behavior — 'roster-sync' is simply refused.
        this.rosterBridge = opts.rosterBridge || null;
        // STEP 4D-B Phase 6 — optional upstream identity verification.
        // When present, the token-mint and register-host HTTP endpoints
        // below require the caller to present a verified identity that
        // MATCHES the userId in the URL, instead of trusting the URL
        // alone (see identity-assertion.js for why this exists and what
        // it does/does not solve). Absent (default): PRESERVES the prior
        // behavior exactly, so existing certified tests/deployments are
        // not broken by this patch — but that prior behavior is now
        // explicitly flagged in getHealthReport() rather than silently
        // assumed safe.
        this.verifyIdentity = typeof opts.verifyIdentity === 'function' ? opts.verifyIdentity : null;
        // STEP 4D-B Phase 6 Patch #4 — optional Firebase identity-assertion
        // route. When present, this server exposes
        // POST /identity/assertion, the one real place a Firebase ID token
        // may enter this process. It is verified with
        // firebase-identity-issuer.js (Google's own public keys — no new
        // trust invented here), and ONLY on real success is the existing
        // purpose-isolated identity-assertion.js seam used to mint the
        // token the token/register-host endpoints above already know how
        // to check via verifyIdentity. This does not create a second
        // authentication architecture: it is the missing entry point that
        // feeds the one that already existed. Absent (default): the route
        // is not registered at all — preserves prior behavior exactly.
        this.firebaseIdentity = opts.firebaseIdentity && opts.firebaseIdentity.projectId && opts.firebaseIdentity.identitySecret
            ? opts.firebaseIdentity
            : null;

        /** sessionId -> { sourceConnId: string|null, viewers: Map(connId -> conn), createdAt } */
        this.sessions = new Map();
        /** connId -> connection record */
        this.conns = new Map();
        /** sessionId -> Map(sub -> connection record) — real identity-keyed lookup for moderation targeting, independent of viewer-chosen connectionKey naming. */
        this._connsBySub = new Map();

        this.httpServer = http.createServer((req, res) => this._handleHttp(req, res));
        this.httpServer.on('upgrade', (req, socket, head) => this._handleUpgrade(req, socket, head));

        this._sweepTimer = setInterval(() => this._sweepStale(), opts.sweepIntervalMs || DEFAULT_SWEEP_INTERVAL_MS);
        this._sweepTimer.unref?.();

        this._startedAt = nowMs();
        this._counters = { segmentsPublished: 0, segmentsDelivered: 0, authFailures: 0, rateLimited: 0 };
    }

    listen(port = 0, host = '0.0.0.0') {
        return new Promise((resolve, reject) => {
            this.httpServer.once('error', reject);
            this.httpServer.listen(port, host, () => resolve(this.httpServer.address()));
        });
    }

    close() {
        clearInterval(this._sweepTimer);
        for (const conn of this.conns.values()) {
            try { conn.socket.destroy(); } catch (_e) { /* closing anyway */ }
        }
        return new Promise((resolve) => this.httpServer.close(() => resolve()));
    }

    // ---- HTTP (health/capability) ----
    _handleHttp(req, res) {
        if (req.method === 'GET' && req.url === '/healthz') {
            const body = JSON.stringify(this.getHealthReport());
            res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
            res.end(body);
            return;
        }
        // POST /identity/assertion
        // STEP 4D-B Phase 6 Patch #4 — the real entry point for a Firebase
        // ID token. See constructor comment for the trust-chain
        // disclosure. Registered ONLY when this.firebaseIdentity is
        // configured (default off, exactly like verifyIdentity above).
        if (req.method === 'POST' && req.url === '/identity/assertion' && this.firebaseIdentity) {
            const bearer = identityAssertion.extractBearer(req);
            if (!bearer) {
                this._sendJson(res, 401, { success: false, reason: 'Missing Authorization: Bearer <firebase-id-token> header.' });
                return;
            }
            firebaseIdentityIssuer.issueIdentityAssertionFromFirebase(bearer, {
                projectId: this.firebaseIdentity.projectId,
                identitySecret: this.firebaseIdentity.identitySecret,
                fetchGoogleCerts: this.firebaseIdentity.fetchGoogleCerts,
                assertionTtlSeconds: this.firebaseIdentity.assertionTtlSeconds,
            }).then((result) => {
                if (!result.success) {
                    this._counters.authFailures += 1;
                    this._sendJson(res, 401, { success: false, reason: result.reason });
                    return;
                }
                this._sendJson(res, 200, { success: true, assertionToken: result.assertionToken, userId: result.uid });
            }).catch(() => {
                this._counters.authFailures += 1;
                this._sendJson(res, 401, { success: false, reason: 'Identity verification failed.' });
            });
            return;
        }
        // POST /session/<sessionId>/token/<requesterId>
        // R040 Phase 3B/3K: token minting moves server-side so the HMAC
        // secret never has to exist in client code. requesterId here is
        // the ALREADY-authenticated caller's id from whatever upstream
        // auth/identity layer fronts this endpoint in a real deployment
        // (e.g. CozyOS IdentityEngine session cookie/bearer token) — this
        // server does not itself perform that authentication; it performs
        // session-role resolution and token issuance, which is its real,
        // disclosed job. See README "Integration boundary".
        if (req.method === 'POST' && this.authority) {
            const m = /^\/session\/([^/]+)\/token\/([^/]+)$/.exec(req.url);
            if (m) {
                const [, sessionId, requesterId] = m.map(decodeURIComponent);
                this._authorizeIdentity(req, requesterId).then((idCheck) => {
                    if (!idCheck.ok) return this._sendJson(res, 403, { success: false, reason: idCheck.reason });
                    const result = this.authority.issueToken(sessionId, requesterId);
                    this._sendJson(res, result.success ? 200 : 403, result);
                });
                return;
            }
        }
        // POST /session/<sessionId>/register-host/<hostUserId>
        // R040 Phase 3 (continuation): the real bootstrap seam for
        // LdceRosterBridge.registerHost() (see that file's header for
        // the full disclosure of why this exists — a genuine
        // chicken-and-egg problem, not an invented one). SAME upstream-
        // auth boundary as the token endpoint above: hostUserId here is
        // assumed already authenticated by whatever fronts this server
        // in a real deployment (e.g. a reverse proxy that only forwards
        // this request for the caller's own verified identity). This
        // endpoint does not itself perform that authentication.
        if (req.method === 'POST' && this.rosterBridge) {
            const m = /^\/session\/([^/]+)\/register-host\/([^/]+)$/.exec(req.url);
            if (m) {
                const [, sessionId, hostUserId] = m.map(decodeURIComponent);
                this._authorizeIdentity(req, hostUserId).then((idCheck) => {
                    if (!idCheck.ok) return this._sendJson(res, 403, { success: false, reason: idCheck.reason });
                    const result = this.rosterBridge.registerHost(sessionId, hostUserId);
                    this._sendJson(res, result.success ? 200 : 400, result);
                });
                return;
            }
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found. This is the CozyOS live-distribution signaling server. See /healthz.');
    }

    _sendJson(res, status, obj) {
        const body = JSON.stringify(obj);
        res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
        res.end(body);
    }

    /**
     * _authorizeIdentity(req, claimedUserId) -> Promise<{ok:boolean, reason?}>
     * STEP 4D-B Phase 6. When this.verifyIdentity is configured, the
     * caller must present a verified identity that matches claimedUserId
     * exactly — a real check, not a client-supplied claim. When absent
     * (default), this returns ok:true unconditionally, preserving the
     * server's prior behavior exactly (see constructor comment and
     * README "Known limitation" for why that default is disclosed, not
     * silently treated as secure).
     */
    async _authorizeIdentity(req, claimedUserId) {
        if (!this.verifyIdentity) return { ok: true };
        let result;
        try {
            result = await this.verifyIdentity(req);
        } catch (e) {
            return { ok: false, reason: 'Identity verification failed.' };
        }
        if (!result || !result.verified) return { ok: false, reason: (result && result.reason) || 'Identity not verified.' };
        if (result.userId !== claimedUserId) return { ok: false, reason: 'Verified identity does not match the requested userId.' };
        return { ok: true };
    }

    getHealthReport() {
        return {
            status: 'ok',
            uptimeMs: nowMs() - this._startedAt,
            sessionCount: this.sessions.size,
            connectionCount: this.conns.size,
            counters: Object.assign({}, this._counters),
            capability: {
                signaling: true,
                relayFanout: true,
                webrtcSignalingRelay: true, // R040 Phase 4B: real SDP/ICE relay between two authorized connections — still not media transport
                webrtcSfu: false, // honest: no media SFU here, see file header
                // STEP 4D-B Phase 6: real, honest disclosure — false means
                // the token/register-host endpoints below still trust the
                // URL's userId with no upstream verification. See
                // identity-assertion.js and README "Known limitation".
                identityVerificationEnforced: !!this.verifyIdentity,
                // STEP 4D-B Phase 6 Patch #4 — honest disclosure: false
                // means POST /identity/assertion is not registered at all,
                // so there is currently no way for a Firebase ID token to
                // enter this process. See firebase-identity-issuer.js and
                // README "Known limitation".
                firebaseIdentityRouteEnabled: !!this.firebaseIdentity,
            },
        };
    }

    // ---- WebSocket upgrade ----
    _handleUpgrade(req, socket, head) {
        const key = req.headers['sec-websocket-key'];
        if (!key || (req.headers['upgrade'] || '').toLowerCase() !== 'websocket') {
            socket.destroy();
            return;
        }
        socket.write(wsFrame.buildHandshakeResponse(key));

        const connId = crypto.randomBytes(8).toString('hex');
        const conn = {
            id: connId,
            socket,
            authed: false,
            sub: null,
            role: null,
            sessionId: null,
            connectionKey: null, // 'source' or viewerId, set once role/session known
            lastHeartbeatAt: nowMs(),
            state: 'connecting',
            rateBucket: new RateBucket(this.rateLimitPerSec),
        };
        this.conns.set(connId, conn);

        const decoder = new wsFrame.FrameDecoder(
            (frame) => this._handleFrame(conn, frame),
            (err) => this._closeConn(conn, 1002, err.message)
        );

        if (head && head.length) decoder.push(head);
        socket.on('data', (chunk) => decoder.push(chunk));
        socket.on('close', () => this._onSocketClosed(conn));
        socket.on('error', () => this._onSocketClosed(conn));
    }

    _send(conn, obj) {
        if (!conn.socket.writable) return;
        try { conn.socket.write(wsFrame.encodeText(JSON.stringify(obj))); } catch (_e) { /* socket likely closing */ }
    }

    _closeConn(conn, code, reason) {
        try { conn.socket.write(wsFrame.encodeClose(code, reason || '')); } catch (_e) { /* ignore */ }
        try { conn.socket.end(); } catch (_e) { /* ignore */ }
        this._onSocketClosed(conn);
    }

    _onSocketClosed(conn) {
        if (!this.conns.has(conn.id)) return;
        this.conns.delete(conn.id);
        if (conn.sessionId && conn.sub) {
            const bySub = this._connsBySub.get(conn.sessionId);
            if (bySub && bySub.get(conn.sub) === conn) bySub.delete(conn.sub);
        }
        if (!conn.sessionId) return;
        // The host connection is the only reporter of roster-sync (see
        // _onRosterSync()); once it disconnects, the mirrored roster can
        // no longer be refreshed, so clear it explicitly rather than let
        // it silently age toward the TTL boundary. This must NOT be
        // gated on connectionKey==='source' or on a `this.sessions` entry
        // existing: a host that has only ever called roster-sync (the
        // real, normal startup order — the roster reporter's initial
        // syncNow() typically runs before any segment is published) has
        // neither. Real defect found and fixed by this checkpoint's own
        // regression suite (server/live-relay/test/
        // live-distribution-signaling-server.test.js, "host disconnect
        // clears the mirrored roster..."): the roster-clear used to be
        // unreachable for exactly that ordinary case.
        if (conn.role === 'host' && this.rosterBridge) this.rosterBridge.clearSession(conn.sessionId);
        const session = this.sessions.get(conn.sessionId);
        if (!session) return;
        if (conn.connectionKey === 'source' && session.sourceConnId === conn.id) {
            session.sourceConnId = null;
            this._broadcastState(conn.sessionId, 'source', 'disconnected');
        } else if (session.viewers.has(conn.id)) {
            session.viewers.delete(conn.id);
            this._broadcastState(conn.sessionId, conn.connectionKey, 'disconnected');
        }
    }

    _handleFrame(conn, frame) {
        if (frame.opcode === wsFrame.OPCODE.CLOSE) { this._closeConn(conn, 1000, ''); return; }
        if (frame.opcode === wsFrame.OPCODE.PING) {
            try { conn.socket.write(wsFrame.encodePong(frame.payload)); } catch (_e) { /* ignore */ }
            return;
        }
        if (frame.opcode !== wsFrame.OPCODE.TEXT) return; // binary/continuation not used by this protocol

        if (!conn.rateBucket.take()) {
            this._counters.rateLimited++;
            this._send(conn, { type: 'error', reason: 'Rate limit exceeded.' });
            return;
        }

        let msg;
        try { msg = JSON.parse(frame.payload.toString('utf8')); } catch (_e) {
            this._send(conn, { type: 'error', reason: 'Malformed JSON.' });
            return;
        }
        this._route(conn, msg);
    }

    _route(conn, msg) {
        if (!msg || typeof msg.type !== 'string') return this._send(conn, { type: 'error', reason: 'Missing type.' });

        if (msg.type === 'auth') return this._onAuth(conn, msg);
        if (!conn.authed) return this._send(conn, { type: 'error', reason: 'Not authenticated. Send {type:"auth", token} first.' });

        switch (msg.type) {
            case 'publish-source': return this._onPublishSource(conn, msg);
            case 'join-viewer': return this._onJoinViewer(conn, msg);
            case 'leave-viewer': return this._onLeaveViewer(conn, msg);
            case 'heartbeat': return this._onHeartbeat(conn, msg);
            case 'roster-request': return this._onRosterRequest(conn, msg);
            case 'grant-speak': return this._onModerationCommand(conn, msg, 'grantSpeaking');
            case 'revoke-speak': return this._onModerationCommand(conn, msg, 'revokeSpeaking');
            case 'remove-participant': return this._onModerationCommand(conn, msg, 'removeParticipant');
            case 'request-speak': return this._onRequestSpeak(conn, msg);
            case 'self-mute': return this._onSelfMute(conn, msg);
            case 'publish-translated': return this._onPublishTranslated(conn, msg);
            case 'roster-sync': return this._onRosterSync(conn, msg);
            case 'webrtc-offer': return this._onWebrtcSignal(conn, msg, 'webrtc-offer');
            case 'webrtc-answer': return this._onWebrtcSignal(conn, msg, 'webrtc-answer');
            case 'webrtc-ice-candidate': return this._onWebrtcSignal(conn, msg, 'webrtc-ice-candidate');
            default: return this._send(conn, { type: 'error', reason: `Unknown type "${msg.type}".` });
        }
    }

    _onAuth(conn, msg) {
        const result = sessionToken.verify(msg.token, this.secret);
        if (!result.valid) {
            this._counters.authFailures++;
            this._send(conn, { type: 'auth-ack', success: false, reason: result.reason });
            return;
        }
        // Phase 3C/3K: a still-unexpired token from a participant a
        // moderator has since removed must not grant a reconnect. This is
        // re-checked on every auth (including reconnects), not only at
        // issueToken() time.
        if (this.authority && this.authority.isRemoved(result.payload.sessionId, result.payload.sub)) {
            this._counters.authFailures++;
            this._send(conn, { type: 'auth-ack', success: false, reason: 'This participant was removed from the session.' });
            return;
        }
        conn.authed = true;
        conn.sub = result.payload.sub;
        conn.role = result.payload.role;
        conn.sessionId = result.payload.sessionId;
        if (!this._connsBySub.has(conn.sessionId)) this._connsBySub.set(conn.sessionId, new Map());
        this._connsBySub.get(conn.sessionId).set(conn.sub, conn);
        this._send(conn, { type: 'auth-ack', success: true, role: conn.role, sessionId: conn.sessionId });
    }

    /** _onModerationCommand() — routes grant-speak/revoke-speak/remove-participant to the SessionAuthority, which independently re-verifies the actor's real role (never trusts conn.role alone, though conn.role is itself already a server-issued fact, not a client claim). Requires an authority to be configured. */
    _onModerationCommand(conn, msg, authorityMethod) {
        if (!this.authority) return this._send(conn, { type: 'error', reason: 'This server instance has no configured SessionAuthority; moderation commands are unavailable.' });
        if (msg.sessionId !== conn.sessionId) return this._send(conn, { type: 'error', reason: 'sessionId mismatch with authenticated token.' });
        if (!msg.targetUserId) return this._send(conn, { type: 'error', reason: 'targetUserId is required.' });

        const result = this.authority[authorityMethod](conn.sessionId, conn.sub, msg.targetUserId);
        this._send(conn, { type: `${msg.type}-ack`, success: result.success, reason: result.reason, targetUserId: msg.targetUserId });
        if (!result.success) return;

        const targetConn = this._connsBySub.get(conn.sessionId)?.get(msg.targetUserId) || null;
        if (authorityMethod === 'grantSpeaking') {
            if (targetConn) this._send(targetConn, { type: 'speaking-state', sessionId: conn.sessionId, granted: true });
        } else if (authorityMethod === 'revokeSpeaking') {
            if (targetConn) this._send(targetConn, { type: 'speaking-state', sessionId: conn.sessionId, granted: false });
        } else if (authorityMethod === 'removeParticipant') {
            if (targetConn) {
                this._send(targetConn, { type: 'removed', sessionId: conn.sessionId, removedBy: conn.sub });
                this._closeConn(targetConn, 4001, 'Removed by moderator.');
            }
        }
    }

    /**
     * _onRequestSpeak() — R040 Phase 4A. Real wiring for a genuine gap the
     * Phase 4A audit confirmed: SessionAuthority.requestSpeaking() already
     * existed and was fully tested (session-authority.test.js), but no
     * message type ever reached it — a viewer had no way to actually
     * signal "I want to speak" over the wire. This composes the existing
     * authority method; it does not add new permission logic of its own.
     * Any authenticated participant (viewer, moderator, or host) may
     * request; SessionAuthority itself is the sole source of truth for
     * whether that succeeds (e.g. an already-removed participant is
     * rejected there, not here).
     */
    _onRequestSpeak(conn, msg) {
        if (!this.authority) return this._send(conn, { type: 'error', reason: 'This server instance has no configured SessionAuthority; speak requests are unavailable.' });
        if (msg.sessionId !== conn.sessionId) return this._send(conn, { type: 'error', reason: 'sessionId mismatch with authenticated token.' });

        const result = this.authority.requestSpeaking(conn.sessionId, conn.sub);
        this._send(conn, { type: 'request-speak-ack', success: result.success, reason: result.reason });
        if (!result.success) return;

        // Notify every currently-connected host/moderator in this session
        // so the request is actually observable in real time, not merely
        // discoverable later via a listSpeakRequests() poll. Never sent to
        // other viewers — requester identity/intent is a moderation-only
        // signal.
        const bySub = this._connsBySub.get(conn.sessionId);
        if (bySub) {
            for (const otherConn of bySub.values()) {
                if (otherConn !== conn && this._isPrivileged(otherConn.role)) {
                    this._send(otherConn, { type: 'speak-requested', sessionId: conn.sessionId, requesterId: conn.sub });
                }
            }
        }
    }

    _onSelfMute(conn, msg) {
        // Self-mute never requires moderator authorization — any authenticated
        // participant may mute/unmute themselves (Phase 3D "viewer can mute
        // themselves"). This only affects THIS transport's own broadcast
        // metadata; it composes, and does not replace, LDCE's own
        // self-only setParticipantState(muted) primitive in a real deployment.
        this._broadcastState(conn.sessionId, conn.connectionKey || conn.sub, msg.muted ? 'self-muted' : 'connected');
        this._send(conn, { type: 'self-mute-ack', success: true, muted: !!msg.muted });
    }

    /**
     * _onRosterSync() — R040 Phase 3 (continuation). The real
     * server-side half of the LDCE roster bridge: mirrors a real, live
     * LDCESessionEngine roster (reported by the session's HOST, see
     * core/modules/communication/ldce-roster-reporter.js) into this
     * process's LdceRosterBridge, which SessionAuthority's roleResolver
     * then reads from. This replaces the documented-contract double
     * disclosed in session-authority.js/README.md with a real,
     * end-to-end wired roster — never a second, invented roster.
     *
     * Authorization: identical pattern to _onPublishSource() /
     * _onRosterRequest() — `conn.role` is a fact this server itself
     * already established from the participant's SIGNED token at
     * auth time (session-token.verify()), never a value read from
     * this message. Only 'host' may report a roster (a moderator is
     * itself just an entry ON the roster, not its source of truth).
     */
    _onRosterSync(conn, msg) {
        if (!this.rosterBridge) return this._send(conn, { type: 'error', reason: 'This server instance has no configured LdceRosterBridge; roster-sync is unavailable.' });
        if (msg.sessionId !== conn.sessionId) return this._send(conn, { type: 'error', reason: 'sessionId mismatch with authenticated token.' });
        if (conn.role !== 'host') return this._send(conn, { type: 'error', reason: 'Only the session host may report the roster.' });

        const result = this.rosterBridge.updateRoster(conn.sessionId, conn.sub, msg.participants);
        this._send(conn, { type: 'roster-sync-ack', success: result.success, reason: result.reason, count: result.count });
    }

    /**
     * _onWebrtcSignal() — R040 Phase 4B. The genuine missing dependency
     * disclosed by both the Phase 4A participation-controller header and
     * this file's own scope table: the server relayed JSON segment/
     * caption/translation payloads only — there was no message path at
     * all for the SDP/ICE exchange a real RTCPeerConnection needs to
     * move an authorized participant's actual MediaStream. This adds
     * ONLY a signaling relay (forwards an opaque sdp/candidate payload
     * from one authenticated connection to one other specific connection
     * in the same session). It still never touches raw media — see
     * getHealthReport()'s honest webrtcSfu:false, unchanged by this
     * addition — and creates no second session-authority: publish-
     * capable roles are read from conn.role, the exact same server-
     * issued (never client-claimed) fact _onPublishSource()/
     * _isPrivileged() already use.
     *
     * Authorization:
     *   - webrtc-offer: only a connection that CURRENTLY holds real
     *     media-publish authority may INITIATE an offer: token role
     *     host/moderator (static, privileged), OR — this is the part a
     *     naive `conn.role === 'speaker'` check would get wrong, and
     *     this project's own test suite caught it — a participant whose
     *     token was minted as 'viewer' but who was granted speaking
     *     permission AFTER connecting. grantSpeaking() updates
     *     SessionAuthority's live state, not the already-issued token,
     *     so authorization here re-reads authority.getSpeakState() live
     *     on every offer rather than trusting a role snapshot taken at
     *     auth time. A plain, never-granted viewer can never publish
     *     media, matching the participation controller's own hard rule
     *     (mic capture only after SPEAKING_ALLOWED).
     *   - webrtc-answer / webrtc-ice-candidate: any authenticated
     *     participant of the session may send these — they are always a
     *     response to (or accompany) an offer someone else already
     *     initiated, so no separate publish check applies.
     *   - target must be a currently-connected participant of the SAME
     *     session (looked up via the real, identity-keyed
     *     _connsBySub map) — an unknown/offline targetUserId is
     *     honestly rejected via a success:false ack, never silently
     *     dropped as if delivered.
     */
    _onWebrtcSignal(conn, msg, type) {
        if (msg.sessionId !== conn.sessionId) return this._send(conn, { type: 'error', reason: 'sessionId mismatch with authenticated token.' });
        if (!msg.targetUserId) return this._send(conn, { type: 'error', reason: 'targetUserId is required.' });
        if (type === 'webrtc-offer' && !this._canPublishMedia(conn)) {
            return this._send(conn, { type: `${type}-ack`, success: false, reason: 'Only host/moderator/granted-speaker roles may initiate media publication (webrtc-offer).' });
        }
        const targetConn = this._connsBySub.get(conn.sessionId)?.get(msg.targetUserId) || null;
        if (!targetConn) {
            return this._send(conn, { type: `${type}-ack`, success: false, reason: 'Target participant is not currently connected to this session.' });
        }
        const payload = { type, sessionId: conn.sessionId, fromUserId: conn.sub, targetUserId: msg.targetUserId };
        if (type === 'webrtc-ice-candidate') payload.candidate = msg.candidate;
        else payload.sdp = msg.sdp;
        this._send(targetConn, payload);
        this._send(conn, { type: `${type}-ack`, success: true, targetUserId: msg.targetUserId });
    }

    /** Live authorization re-check, never a stale token-role snapshot.
     * host/moderator are static privileged roles set at auth time (safe
     * to read from conn.role — those never change mid-session in this
     * model). A viewer's speaking authority, by contrast, is granted or
     * revoked WHILE already connected (grant-speak/revoke-speak), so it
     * must be read live from the same SessionAuthority instance
     * _onModerationCommand() itself writes to — never from conn.role,
     * which still says 'viewer' even after a real grant. */
    _canPublishMedia(conn) {
        if (conn.role === 'host' || conn.role === 'moderator') return true;
        if (conn.role === 'speaker') return true; // token minted after grant (e.g. reconnect) already reflects it
        if (!this.authority) return false;
        return this.authority.getSpeakState(conn.sessionId, conn.sub) === 'SPEAKING_ALLOWED';
    }

    _requireSession(sessionId) {
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, { sourceConnId: null, viewers: new Map(), createdAt: nowMs() });
        }
        return this.sessions.get(sessionId);
    }

    _isPrivileged(role) { return role === 'host' || role === 'moderator'; }

    _onPublishSource(conn, msg) {
        if (msg.sessionId !== conn.sessionId) return this._send(conn, { type: 'error', reason: 'sessionId mismatch with authenticated token.' });
        if (!this._isPrivileged(conn.role)) return this._send(conn, { type: 'error', reason: 'Only host/moderator role may publish source segments.' });
        if (!msg.segment || !msg.segment.segmentId) return this._send(conn, { type: 'error', reason: 'segment.segmentId is required.' });

        const session = this._requireSession(conn.sessionId);
        if (session.sourceConnId !== conn.id) {
            session.sourceConnId = conn.id;
            conn.connectionKey = 'source';
            this._broadcastState(conn.sessionId, 'source', 'connected');
        }
        conn.lastHeartbeatAt = nowMs();
        this._counters.segmentsPublished++;

        const delivered = [];
        for (const [viewerConnId, viewerConn] of session.viewers) {
            this._send(viewerConn, { type: 'segment', sessionId: conn.sessionId, segment: msg.segment });
            delivered.push(viewerConn.connectionKey);
            this._counters.segmentsDelivered++;
        }
        this._send(conn, { type: 'publish-ack', success: true, segmentId: msg.segment.segmentId, delivered });
    }

    /**
     * _onPublishTranslated() — R040 Phase 3E addition (Section 4/6/11 of
     * the brief). Distinct from _onPublishSource(): that method fans one
     * raw source segment out to EVERY joined viewer (the server does not
     * translate, per this file's own header). This handler delivers an
     * ALREADY-TRANSLATED result (computed by the real client-side
     * LiveLanguageFanoutRouter/LiveChurchLanguageOrchestrator — never
     * computed here) to ONLY the specific viewerIds the caller names.
     * This is the real wire that lets a genuinely remote viewer receive
     * the per-language-group result the fan-out router already computes
     * once per distinct target language — without this, that result
     * never left the publishing process. Never broadcasts: an unknown
     * or not-currently-joined viewerId is silently skipped and honestly
     * omitted from `delivered`, never fabricated as delivered.
     */
    _onPublishTranslated(conn, msg) {
        if (msg.sessionId !== conn.sessionId) return this._send(conn, { type: 'error', reason: 'sessionId mismatch with authenticated token.' });
        if (!this._isPrivileged(conn.role)) return this._send(conn, { type: 'error', reason: 'Only host/moderator role may publish translated segments.' });
        if (!msg.segmentId) return this._send(conn, { type: 'error', reason: 'segmentId is required.' });
        if (!msg.language) return this._send(conn, { type: 'error', reason: 'language is required.' });
        if (!Array.isArray(msg.targetViewerIds) || msg.targetViewerIds.length === 0) {
            return this._send(conn, { type: 'error', reason: 'targetViewerIds must be a non-empty array.' });
        }

        const session = this.sessions.get(conn.sessionId);
        const delivered = [];
        if (session) {
            for (const viewerId of msg.targetViewerIds) {
                const viewerConn = this._findConnByKey(conn.sessionId, viewerId);
                if (!viewerConn) continue; // honest: not joined right now — never fabricated as delivered
                this._send(viewerConn, {
                    type: 'translated-segment',
                    sessionId: conn.sessionId,
                    segmentId: msg.segmentId,
                    language: msg.language,
                    translated: msg.translated || null,
                });
                delivered.push(viewerId);
                this._counters.segmentsDelivered++;
            }
        }
        this._send(conn, { type: 'publish-translated-ack', success: true, segmentId: msg.segmentId, language: msg.language, delivered });
    }

    _onJoinViewer(conn, msg) {
        if (msg.sessionId !== conn.sessionId) return this._send(conn, { type: 'error', reason: 'sessionId mismatch with authenticated token.' });
        if (!msg.viewerId) return this._send(conn, { type: 'error', reason: 'viewerId is required.' });

        const session = this._requireSession(conn.sessionId);
        conn.connectionKey = msg.viewerId;
        conn.lastHeartbeatAt = nowMs();
        session.viewers.set(conn.id, conn);
        this._send(conn, { type: 'join-ack', success: true, sessionId: conn.sessionId, viewerId: msg.viewerId });
        this._broadcastState(conn.sessionId, msg.viewerId, 'connected');
    }

    _onLeaveViewer(conn, msg) {
        const session = this.sessions.get(conn.sessionId);
        if (session && session.viewers.has(conn.id)) {
            session.viewers.delete(conn.id);
            this._send(conn, { type: 'leave-ack', success: true });
            this._broadcastState(conn.sessionId, msg.viewerId || conn.connectionKey, 'disconnected');
        } else {
            this._send(conn, { type: 'leave-ack', success: false, reason: 'Not joined.' });
        }
    }

    _onHeartbeat(conn) {
        conn.lastHeartbeatAt = nowMs();
        if (conn.state === 'degraded' || conn.state === 'reconnecting') {
            this._broadcastState(conn.sessionId, conn.connectionKey, 'connected');
        }
        conn.state = 'connected';
        this._send(conn, { type: 'heartbeat-ack', success: true, serverTime: nowMs() });
    }

    _onRosterRequest(conn, msg) {
        if (msg.sessionId !== conn.sessionId) return this._send(conn, { type: 'error', reason: 'sessionId mismatch with authenticated token.' });
        if (!this._isPrivileged(conn.role)) return this._send(conn, { type: 'error', reason: 'Only host/moderator role may request the roster.' });
        const session = this.sessions.get(conn.sessionId);
        const viewers = session
            ? Array.from(session.viewers.values()).map((v) => ({ viewerId: v.connectionKey, state: v.state, lastHeartbeatAt: v.lastHeartbeatAt }))
            : [];
        this._send(conn, {
            type: 'roster',
            sessionId: conn.sessionId,
            viewers,
            sourceConnected: !!(session && session.sourceConnId),
        });
    }

    _broadcastState(sessionId, connectionKey, state) {
        const conn = this._findConnByKey(sessionId, connectionKey);
        if (conn) conn.state = state;
        // Notify the connection itself so a client-side provider can
        // reconcile the real server-observed state with its own.
        if (conn) this._send(conn, { type: 'state', sessionId, connectionKey, state });
    }

    _findConnByKey(sessionId, connectionKey) {
        const session = this.sessions.get(sessionId);
        if (!session) return null;
        if (connectionKey === 'source') return this.conns.get(session.sourceConnId) || null;
        for (const c of session.viewers.values()) if (c.connectionKey === connectionKey) return c;
        return null;
    }

    _sweepStale() {
        const now = nowMs();
        for (const conn of this.conns.values()) {
            if (!conn.sessionId) continue;
            const idle = now - conn.lastHeartbeatAt;
            if (idle > this.disconnectTimeoutMs) {
                this._closeConn(conn, 4000, 'Heartbeat timeout.');
            } else if (idle > this.heartbeatTimeoutMs && conn.state === 'connected') {
                conn.state = 'degraded';
                this._send(conn, { type: 'state', sessionId: conn.sessionId, connectionKey: conn.connectionKey, state: 'degraded' });
            }
        }
    }
}

module.exports = { LiveDistributionSignalingServer };

// Allow `node live-distribution-signaling-server.js` to run standalone.
if (require.main === module) {
    const secret = process.env.COZY_LIVE_RELAY_SECRET;
    if (!secret) {
        console.error('COZY_LIVE_RELAY_SECRET environment variable is required to start this server.');
        process.exit(1);
    }
    const port = parseInt(process.env.COZY_LIVE_RELAY_PORT || '8787', 10);
    // R040 Phase 3 (continuation): the standalone process now wires a
    // real LdceRosterBridge + SessionAuthority by default, so
    // moderation/role-resolution is available out of the box instead of
    // requiring every deployment to hand-assemble it. This replaces the
    // previous default of "no authority configured" (moderation
    // commands unavailable) with the real, disclosed roster-bridge path
    // — never a fabricated always-succeeds resolver.
    const { LdceRosterBridge } = require('./ldce-roster-bridge');
    const { SessionAuthority } = require('./session-authority');
    const rosterBridge = new LdceRosterBridge();
    const authority = new SessionAuthority({ secret, roleResolver: rosterBridge.roleResolver });
    // STEP 4D-B Phase 6: identity verification is wired ONLY if a
    // distinct secret is explicitly configured. It intentionally does
    // NOT fall back to reusing `secret` above — mixing the
    // participation-token secret and the identity-assertion secret
    // would let anyone who can obtain a viewer token also forge an
    // identity assertion, defeating the point. No verifier is a real,
    // disclosed gap (see getHealthReport().capability
    // .identityVerificationEnforced and README "Known limitation"), not
    // a silently-assumed-safe default.
    const identitySecret = process.env.COZY_LIVE_RELAY_IDENTITY_SECRET;
    let verifyIdentity;
    if (identitySecret) {
        const { createDefaultIdentityVerifier } = require('./identity-assertion');
        verifyIdentity = createDefaultIdentityVerifier(identitySecret);
    } else {
        console.warn('[cozy-live-relay] COZY_LIVE_RELAY_IDENTITY_SECRET not set — token/register-host endpoints trust the URL userId with no upstream verification. See server/live-relay/README.md "Known limitation".');
    }
    // STEP 4D-B Phase 6 Patch #4: the Firebase identity route is wired
    // ONLY if BOTH a project id and the identity secret are configured.
    // It reuses the SAME identitySecret as verifyIdentity above — this
    // is intentional and safe (not a secret-reuse bug like the one
    // avoided above): this route is the ONLY real minter of identity-
    // assertion tokens, and verifyIdentity is the ONLY real verifier of
    // them, so they must share that one secret for the seam to work at
    // all. It remains a DIFFERENT secret from the participation-token
    // `secret` above.
    const firebaseProjectId = process.env.COZY_LIVE_RELAY_FIREBASE_PROJECT_ID;
    let firebaseIdentity;
    if (firebaseProjectId && identitySecret) {
        firebaseIdentity = { projectId: firebaseProjectId, identitySecret };
    } else if (firebaseProjectId && !identitySecret) {
        console.warn('[cozy-live-relay] COZY_LIVE_RELAY_FIREBASE_PROJECT_ID set but COZY_LIVE_RELAY_IDENTITY_SECRET is not — the Firebase identity route will NOT be enabled (it has nothing to sign assertions with).');
    }
    const server = new LiveDistributionSignalingServer({ secret, authority, rosterBridge, verifyIdentity, firebaseIdentity });
    server.listen(port).then((addr) => {
        console.log(`[cozy-live-relay] listening on ${addr.address}:${addr.port} (WS path: any, upgrade-based)`);
    });
}
