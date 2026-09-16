# CozyOS Live Distribution — Signaling & Relay Server

## What this is

A real, standalone Node.js server (`live-distribution-signaling-server.js`, zero npm
dependencies) that gives a church's live teaching session an actual **remote-reachable
distribution point**. This is the piece Phase 2 explicitly disclosed as missing
(`cozy-live-distribution-transport.js` shipped only `local-relay`, an in-process
provider). It is the server half of Section 4/7/8 of the R040 Phase 3 brief.

Paired client: `core/shell/live/providers/cozy-live-remote-relay-transport-provider.js`,
which registers into the existing, unmodified `CozyLiveDistributionTransport`
orchestrator through its real `registerTransportProvider()`/`selectTransport()`
extension points — no ChurchOS language, moderation, or attendance code changed.

## Status — read this before trusting any capability claim

| Layer | Status |
|---|---|
| Protocol design (auth, publish, join/leave, heartbeat, roster, degrade/reconnect) | **Implemented** |
| RFC6455 WebSocket handshake + framing | **Implemented**, hand-rolled (no `ws` package — this sandbox has no network egress to install it) |
| Signed participant tokens (HMAC-SHA256, expiry, tamper detection) | **Implemented** |
| Server-side token issuance (`POST /session/:id/token/:requesterId`), secret never in client code | **Implemented** |
| Server-side role authorization (viewer cannot publish/moderate/query roster/grant-speak/remove) | **Implemented** |
| Speaking permission (grant/revoke), moderator removal + reconnect-block, self-mute | **Implemented** |
| Session-role resolution composed against LDCE's real `getParticipant()` contract | **Implemented against a documented-contract double; live LDCE instance wiring is the next step (see above)** |
| Rate limiting (token bucket per connection) | **Implemented** |
| Local integration tests (real server, real loopback socket, real native `WebSocket` client) | **Locally tested** — 17 passing assertions across `test/live-distribution-signaling-server.test.js`, `test/session-token.test.js`, `test/remote-relay-provider-integration.test.js` |
| Cross-machine / public-internet reachability | **Not verified.** No network egress in this environment. |
| TLS (wss://) | **Not implemented here.** Terminate TLS at a reverse proxy (see below) — this server speaks plain `ws://` on its own listening socket, same pattern most Node WS servers use in production. |
| Horizontal scale-out (multiple server instances sharing session state) | **Not implemented.** Current implementation holds session/connection state in-process (a `Map`). Real deployment beyond one instance needs a shared session-state backend (Redis, etc.) — explicitly out of scope for this pass. |
| WebRTC/SFU media relay | **Not implemented, not claimed.** This server relays JSON segment/caption/translation-ready payloads, not raw camera/mic RTP. Direct media legs still go through the existing `LiveHotspotEngine`/`RTCPeerConnection` path. |

## R040 Phase 3B/3C/3D/3K addition — Session Authority

`session-authority.js` fixes a real defect the Phase 3A slice shipped: the
client provider's `getToken()` signed tokens **in browser code**, which
requires the HMAC secret to be reachable from the client — a direct
violation of this project's own "no secrets in browser code" rule.

Now: `POST /session/<sessionId>/token/<requesterId>` mints and signs the
token **server-side**, with the role always resolved from a real roster
lookup (`roleResolver`), never trusted from the client. The documented
`roleResolver` contract matches `LDCESessionEngine.getParticipant()`'s real
return shape field-for-field — a production deployment wires it straight to
a running LDCE instance; this pass's tests exercise that exact contract
via a disclosed double (loading the full browser-oriented LDCE dependency
graph — Firebase, IdentityEngine, AuthorizationCoordinator, CozyConversation
— inside this Node server process is the next concrete integration step,
not a hidden gap).

New WebSocket message types (all server-authoritative, verified against the
signed token's role — never a client claim):

```
Host/moderator only:
-> { type: "grant-speak",  sessionId, targetUserId }
-> { type: "revoke-speak", sessionId, targetUserId }
-> { type: "remove-participant", sessionId, targetUserId }
<- { type: "<cmd>-ack", success, reason?, targetUserId }

Delivered to the affected participant:
<- { type: "speaking-state", sessionId, granted }
<- { type: "removed", sessionId, removedBy }        (connection is then force-closed)

Any authenticated participant:
-> { type: "self-mute", sessionId, muted }
<- { type: "self-mute-ack", success, muted }
```

A removed participant's still-unexpired token is rejected on any
subsequent `auth` (reconnect), not only blocked from future `issueToken()`
calls — verified by test (`moderation-and-token-endpoint.test.js`).

## Running it

```bash
COZY_LIVE_RELAY_SECRET="<a real random secret, e.g. `openssl rand -hex 32`>" \
COZY_LIVE_RELAY_PORT=8787 \
node server/live-relay/live-distribution-signaling-server.js
```

Health check: `GET http://<host>:8787/healthz` → real session/connection counters, never fabricated.

## Deploying for real internet reachability (what an operator still has to do)

1. Run the process behind a process supervisor (systemd, pm2, or a container orchestrator).
2. Put a TLS-terminating reverse proxy in front of it (nginx, Caddy, or a cloud load
   balancer) so viewers connect to `wss://church-live.example.org` — browsers require a
   secure context for microphone access anyway, so this is required, not optional.
3. Point DNS at the reverse proxy.
4. Set `COZY_LIVE_RELAY_SECRET` from a real secrets manager, not a checked-in value.
5. If you need more than one server process, add a shared session-state backend before
   scaling out — the current implementation assumes one process owns all sessions.

## Protocol summary

Client connects, then:

```
-> { type: "auth", token }                                  (token minted server-side per participant/session)
<- { type: "auth-ack", success, role, sessionId }

Host/moderator only:
-> { type: "publish-source", sessionId, segment }
<- { type: "publish-ack", success, segmentId, delivered: [viewerIds] }
-> { type: "roster-request", sessionId }
<- { type: "roster", sessionId, viewers: [...], sourceConnected }

Any authenticated role:
-> { type: "join-viewer", sessionId, viewerId }
<- { type: "join-ack", success }
-> { type: "leave-viewer", sessionId, viewerId }
-> { type: "heartbeat", sessionId, connectionKey }
<- { type: "heartbeat-ack", success, serverTime }

Server-initiated, any connection:
<- { type: "segment", sessionId, segment }        (real fan-out delivery to a joined viewer)
<- { type: "state", sessionId, connectionKey, state }   (connecting|connected|degraded|reconnecting|disconnected)
<- { type: "error", reason }
```
