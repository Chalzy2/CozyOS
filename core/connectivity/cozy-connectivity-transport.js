/**
 * CozyOS Living Connectivity — core/connectivity/cozy-connectivity-transport.js
 * RP-033 Gate 2: Real Pairing + Transport
 * Milestone: Cozy Living Connectivity
 * Baseline: CozyOS-main-RP-033-Gate1.zip (verified 34/34 before this file
 * was written; core/connectivity/cozy-connect.js, core/engines/collaboration/
 * live-hotspot-engine.js, and core/collaboration/cozy-share.js were read in
 * full and are composed, not modified, not duplicated).
 *
 * OWNERSHIP: Gate 1 (core/connectivity/cozy-living-connectivity.js) defined
 * capability detection, the offline-first connectivity state machine, the
 * store-and-forward packet contract, and identity/session/invitation/
 * challenge contracts — but did not itself invoke a single real pairing or
 * transport call (documented in its own header as deferred to "the next
 * gate"). This file is that next gate. It owns nothing Gate 1 already owns;
 * it wires Gate 1's contracts to the real, already-existing engines that
 * can execute them:
 *
 *   cozy-connect.js  ────────────┐
 *   (Bluetooth/USB/etc detection)│
 *                                 v
 *   cozy-living-connectivity.js (Gate 1 coordinator: packet/session/
 *   invitation/challenge contracts + state machine)
 *                                 |
 *                                 v
 *   live-hotspot-engine.js (real RTCPeerConnection host/join/
 *   completeHostPairing + real RTCDataChannel send/receive)
 *                                 |
 *                                 v
 *   cozy-connectivity-transport.js (THIS FILE — Gate 2 adapter: turns the
 *   above into an actual pairing flow, a real transport send/receive path,
 *   packet-integrity validation, and an offline store-and-forward queue)
 *                                 |
 *                                 v
 *   cozy-share.js (Cozy Share collaboration layer — composed, read-only,
 *   for its trust certificates when a caller supplies a shareSessionId;
 *   never required, never duplicated)
 *
 * HONEST SCOPE — GATE 2:
 *   REAL: invitation generation/validation (expiry, replay, wrong-session,
 *   duplicate, malformed, explicit confirmation gate); actual invocation of
 *   LiveHotspotEngine.createHost()/joinHost()/completeHostPairing(); a real
 *   send/receive adapter over the real RTCDataChannel with packet-ID replay
 *   tracking, malformed-packet rejection, and a documented backpressure
 *   check; the packet-integrity validation pipeline (envelope → session →
 *   sender → expiration → replay → integrity → ACCEPT); a real offline
 *   queue with retry/TTL/cancellation that never marks a packet VERIFIED
 *   without a genuine round trip through the pipeline above.
 *
 *   NOT REAL, honestly reported rather than fabricated: Bluetooth/BLE GATT
 *   used as a *data transport* (this file composes CozyConnect's already-
 *   real Bluetooth *detection/pairing* only — no GATT read/write protocol
 *   is implemented here, CAPABILITY_UNAVAILABLE or DEFERRED as accurate);
 *   Wi-Fi Direct and native OS hotspot creation (still
 *   REQUIRES_NATIVE_COMPANION, unchanged from Gate 1, an adapter contract
 *   stub only); full cryptographic trust evaluation (this file composes
 *   Cozy Share's real TrustLayer certificates where a caller supplies one,
 *   but performs no signature verification of its own — deferred, per
 *   Gate 1's own documented scope, to living-security-coordinator.js /
 *   living-trust-engine.js, neither of which this gate wires); multi-hop
 *   relay/routing (single hop, direct-peer only); "SYNCED" is never
 *   reported anywhere in this file — the real terminal state is VERIFIED,
 *   and only after packet integrity genuinely passed.
 *
 * DOES NOT DUPLICATE: no second identity system (composes Gate 1's
 * getDeviceIdentity/createSessionIdentity/issueChallenge/verifyChallenge
 * Response), no second device registry (composes CozyConnect.devices via
 * CozyShare where relevant), no second session/role/trust model (composes
 * CozyShare.SessionManager/TrustLayer read-only), no second packet format
 * (composes Gate 1's createPacket() and extends it with the transport-only
 * fields item 6 of the Gate 2 prompt calls for — sender/recipient/sequence/
 * transport/integrity — via envelope wrapping, not a new packet shape).
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CozyOS = root.CozyOS || {};
        root.CozyOS.CozyConnectivityTransport = factory();
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const VERSION = "1.0.0-gate2";

    function hasWindow() { return typeof window !== "undefined"; }
    function cozyOS() { return hasWindow() ? window.CozyOS : (typeof globalThis !== "undefined" ? globalThis.CozyOS : undefined); }
    function coordinator() { const c = cozyOS(); return c && c.CozyLivingConnectivity; }
    function hotspot() { const c = cozyOS(); return c && c.LiveHotspotEngine; }
    function cozyConnect() { const c = cozyOS(); return c && c.CozyConnect; }
    function cozyShare() { const c = cozyOS(); return c && c.CozyShare; }

    function nowIso() { return new Date().toISOString(); }
    function uid(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`; }

    /* ------------------------------------------------------------------ */
    /* 1. PAIRING STATE VOCABULARY (Gate 2 §5, distinct from and layered  */
    /*    on top of Gate 1's ConnectivitySession states)                  */
    /* ------------------------------------------------------------------ */

    const PAIRING_STATES = Object.freeze({
        HOST_CREATED: "HOST_CREATED",
        INVITATION_CREATED: "INVITATION_CREATED",
        INVITATION_ACCEPTED: "INVITATION_ACCEPTED",
        NEGOTIATING: "NEGOTIATING",
        CONNECTED: "CONNECTED",
        CHANNEL_READY: "CHANNEL_READY",
        PAIRING_FAILED: "PAIRING_FAILED",
        NEGOTIATION_FAILED: "NEGOTIATION_FAILED",
        CONNECTION_FAILED: "CONNECTION_FAILED",
        TIMEOUT: "TIMEOUT",
        CAPABILITY_UNAVAILABLE: "CAPABILITY_UNAVAILABLE"
    });
    const PAIRING_FAILURE_STATES = Object.freeze([
        PAIRING_STATES.PAIRING_FAILED, PAIRING_STATES.NEGOTIATION_FAILED,
        PAIRING_STATES.CONNECTION_FAILED, PAIRING_STATES.TIMEOUT,
        PAIRING_STATES.CAPABILITY_UNAVAILABLE
    ]);

    /* ------------------------------------------------------------------ */
    /* 2. COZYPAIR INVITATION — real payload, composes Gate 1's session/  */
    /*    invitation/challenge contracts; never carries private keys.     */
    /* ------------------------------------------------------------------ */

    /**
     * InvitationRegistry
     *   Real, in-memory bookkeeping (mirrors Gate 1's own ChallengeRegistry
     *   pattern) so THIS process can honestly detect duplicate/replayed
     *   invitations and wrong-session acceptance. Not a second challenge
     *   system — composes coordinator.issueChallenge/verifyChallengeResponse
     *   for the actual replay-protected nonce; this registry only tracks
     *   which invitation IDs have already been consumed.
     */
    class InvitationRegistry {
        #issued = new Map();   // invitationId -> { sessionId, expiresAt, consumed }
        create(sessionId, fields) {
            const invitationId = uid("invite");
            this.#issued.set(invitationId, { sessionId, expiresAt: fields.expiresAt, consumed: false });
            return invitationId;
        }
        markConsumed(invitationId) {
            const entry = this.#issued.get(invitationId);
            if (entry) entry.consumed = true;
        }
        isKnown(invitationId) { return this.#issued.has(invitationId); }
        isConsumed(invitationId) { const e = this.#issued.get(invitationId); return !!e && e.consumed; }
        sessionFor(invitationId) { const e = this.#issued.get(invitationId); return e ? e.sessionId : null; }
    }

    const COZYPAIR_VERSION = 2;

    /**
     * createInvitation({ deviceId, role, transportCapabilities, expiresInMs })
     *   Real COZYPAIR payload: version, sessionId, deviceId (public
     *   identity only — see getDeviceIdentity, no private key material),
     *   role, transport capabilities (read from CozyConnect/LiveHotspot
     *   capability detection, never fabricated), expiration, and a real,
     *   single-use nonce/challenge from Gate 1's ChallengeRegistry. This is
     *   the invitation, not the security credential — pairing still
     *   requires completeHostPairing()/the challenge response below.
     */
    function createInvitation(registry, { deviceId, role = "guest", expiresInMs = 5 * 60 * 1000 } = {}) {
        const coord = coordinator();
        if (!coord) return { success: false, reason: "Gate 1 coordinator (cozy-living-connectivity.js) is not loaded." };
        if (!deviceId) return { success: false, reason: "A real deviceId is required to create an invitation." };

        const sessionResult = coord.createSessionIdentity(deviceId, { expiresInMs });
        if (!sessionResult.success) return sessionResult;
        const session = sessionResult.session;

        const challenge = coord.issueChallenge(session.sessionId, { expiresInMs });
        if (!challenge.success) return challenge;

        const invitationId = registry.create(session.sessionId, { expiresAt: session.expiresAt });

        const transportCapabilities = detectTransportCapabilities();

        return {
            success: true,
            invitationId,
            session,
            payload: Object.freeze({
                type: "COZYPAIR",
                version: COZYPAIR_VERSION,
                invitationId,
                sessionId: session.sessionId,
                deviceId,
                role,
                transportCapabilities,
                issuedAt: nowIso(),
                expiresAt: session.expiresAt,
                nonce: challenge.nonce
            })
        };
    }

    /**
     * validateInvitation(registry, payload, { expectedSessionId })
     *   Rejects, honestly and specifically: malformed shape, expiry,
     *   wrong-session acceptance, and duplicate/replayed invitation IDs.
     *   Does NOT itself decide user confirmation — see confirmInvitation().
     */
    function validateInvitation(registry, payload, { expectedSessionId } = {}) {
        if (!payload || typeof payload !== "object") return { valid: false, reason: "Malformed invitation: not an object." };
        if (payload.type !== "COZYPAIR") return { valid: false, reason: "Malformed invitation: missing/incorrect COZYPAIR type marker." };
        const required = ["version", "invitationId", "sessionId", "deviceId", "expiresAt", "nonce"];
        for (const field of required) {
            if (payload[field] === undefined || payload[field] === null) {
                return { valid: false, reason: `Malformed invitation: missing required field "${field}".` };
            }
        }
        if (payload.version !== COZYPAIR_VERSION) return { valid: false, reason: `Unsupported COZYPAIR version "${payload.version}".` };
        if (new Date(payload.expiresAt).getTime() < Date.now()) return { valid: false, reason: "Invitation has expired." };
        if (expectedSessionId && payload.sessionId !== expectedSessionId) return { valid: false, reason: "Wrong-session invitation: sessionId does not match the expected session." };
        if (!registry.isKnown(payload.invitationId)) return { valid: false, reason: "Unknown invitation (was not issued by this process, or process state was lost)." };
        if (registry.isConsumed(payload.invitationId)) return { valid: false, reason: "Replayed/duplicate invitation: this invitationId was already accepted once." };
        const registeredSessionId = registry.sessionFor(payload.invitationId);
        if (registeredSessionId !== payload.sessionId) return { valid: false, reason: "Wrong-session invitation: sessionId does not match the session this invitationId was issued for." };
        return { valid: true };
    }

    /**
     * confirmInvitation(registry, payload, { userConfirmed })
     *   Explicit user-confirmation gate, required by the Gate 2 prompt.
     *   Never proceeds to negotiation on a false/omitted confirmation, and
     *   marks the invitation consumed only once, here, on success — this
     *   is the single point that prevents duplicate acceptance.
     */
    function confirmInvitation(registry, payload, { userConfirmed = false, expectedSessionId } = {}) {
        const validity = validateInvitation(registry, payload, { expectedSessionId });
        if (!validity.valid) return { success: false, reason: validity.reason };
        if (!userConfirmed) return { success: false, reason: "Pairing requires explicit user confirmation; none was given." };
        registry.markConsumed(payload.invitationId);
        return { success: true };
    }

    /* ------------------------------------------------------------------ */
    /* 3. TRANSPORT CAPABILITY DETECTION (composed, never re-implemented) */
    /* ------------------------------------------------------------------ */

    function detectTransportCapabilities() {
        const coord = coordinator();
        const detected = coord ? coord.detectCapabilities() : null;
        if (!detected) {
            return { webRTC: false, webRTCDataChannel: false, bluetooth: false, reason: "Gate 1 coordinator not loaded; capabilities not fabricated." };
        }
        return {
            webRTC: detected.webRTC.status === "AVAILABLE",
            webRTCDataChannel: detected.webRTCDataChannel.status === "AVAILABLE",
            bluetooth: detected.bluetooth.status !== "UNAVAILABLE",
            nativeWifiDirect: detected.nativeWifiDirect.status,   // always REQUIRES_NATIVE_COMPANION
            nativeHotspotCreation: detected.nativeHotspotCreation.status // always REQUIRES_NATIVE_COMPANION
        };
    }

    /* ------------------------------------------------------------------ */
    /* 4. WEBRTC HOST/JOIN — real invocation of LiveHotspotEngine          */
    /* ------------------------------------------------------------------ */

    /**
     * PairingSession
     *   A thin, real state wrapper around LiveHotspotEngine's actual
     *   createHost/joinHost/completeHostPairing calls. Never converts a
     *   failed negotiation into CONNECTED — every failure path sets one of
     *   the real failure states and stops, honestly.
     */
    class PairingSession {
        #state = null;
        #history = [];
        #connectionId = null;
        #engine;
        #timeoutMs;

        constructor({ timeoutMs = 15000 } = {}) {
            this.#engine = hotspot();
            this.#timeoutMs = timeoutMs;
        }
        get state() { return this.#state; }
        get connectionId() { return this.#connectionId; }
        getHistory() { return this.#history.map(h => ({ ...h })); }
        #set(state, detail) {
            this.#state = state;
            this.#history.push({ state, at: nowIso(), detail: detail || null });
        }
        #withTimeout(promise) {
            return Promise.race([
                promise,
                new Promise((_resolve, reject) => setTimeout(() => reject(new Error("TIMEOUT")), this.#timeoutMs))
            ]);
        }

        /** hostInvite() — real createHost(), yields a real offerCode. */
        async hostInvite() {
            if (!this.#engine) { this.#set(PAIRING_STATES.CAPABILITY_UNAVAILABLE, "LiveHotspotEngine is not loaded."); return { success: false, state: this.#state }; }
            const cap = this.#engine.capabilities();
            if (!cap.webRTC) { this.#set(PAIRING_STATES.CAPABILITY_UNAVAILABLE, "WebRTC is not available in this environment."); return { success: false, state: this.#state }; }
            try {
                const result = await this.#withTimeout(this.#engine.createHost());
                if (!result.success) { this.#set(PAIRING_STATES.PAIRING_FAILED, result.reason); return { success: false, state: this.#state, reason: result.reason }; }
                this.#connectionId = result.connectionId;
                this.#set(PAIRING_STATES.HOST_CREATED);
                this.#set(PAIRING_STATES.INVITATION_CREATED, { offerCode: result.offerCode });
                return { success: true, state: this.#state, connectionId: result.connectionId, offerCode: result.offerCode };
            } catch (err) {
                this.#set(err.message === "TIMEOUT" ? PAIRING_STATES.TIMEOUT : PAIRING_STATES.PAIRING_FAILED, err.message);
                return { success: false, state: this.#state, reason: err.message };
            }
        }

        /** acceptInvite(offerCode) — real joinHost(), yields a real answerCode. */
        async acceptInvite(offerCode) {
            if (!this.#engine) { this.#set(PAIRING_STATES.CAPABILITY_UNAVAILABLE, "LiveHotspotEngine is not loaded."); return { success: false, state: this.#state }; }
            const cap = this.#engine.capabilities();
            if (!cap.webRTC) { this.#set(PAIRING_STATES.CAPABILITY_UNAVAILABLE, "WebRTC is not available in this environment."); return { success: false, state: this.#state }; }
            this.#set(PAIRING_STATES.INVITATION_ACCEPTED);
            this.#set(PAIRING_STATES.NEGOTIATING);
            try {
                const result = await this.#withTimeout(this.#engine.joinHost(offerCode));
                if (!result.success) { this.#set(PAIRING_STATES.NEGOTIATION_FAILED, result.reason); return { success: false, state: this.#state, reason: result.reason }; }
                this.#connectionId = result.connectionId;
                return { success: true, state: this.#state, connectionId: result.connectionId, answerCode: result.answerCode };
            } catch (err) {
                this.#set(err.message === "TIMEOUT" ? PAIRING_STATES.TIMEOUT : PAIRING_STATES.NEGOTIATION_FAILED, err.message);
                return { success: false, state: this.#state, reason: err.message };
            }
        }

        /**
         * completeHost(answerCode) — real completeHostPairing(), then waits
         * for the engine's real "device-connected" event (channel.onopen)
         * before ever reporting CHANNEL_READY. A negotiation that never
         * actually opens the channel stays at CONNECTION_FAILED/TIMEOUT,
         * never silently promoted.
         */
        async completeHost(answerCode) {
            if (!this.#engine || !this.#connectionId) { this.#set(PAIRING_STATES.CONNECTION_FAILED, "No real host connection to complete."); return { success: false, state: this.#state }; }
            this.#set(PAIRING_STATES.NEGOTIATING);
            try {
                const result = await this.#withTimeout(this.#engine.completeHostPairing(this.#connectionId, answerCode));
                if (!result.success) { this.#set(PAIRING_STATES.NEGOTIATION_FAILED, result.reason); return { success: false, state: this.#state, reason: result.reason }; }
                return await this.#awaitChannelReady();
            } catch (err) {
                this.#set(err.message === "TIMEOUT" ? PAIRING_STATES.TIMEOUT : PAIRING_STATES.CONNECTION_FAILED, err.message);
                return { success: false, state: this.#state, reason: err.message };
            }
        }

        /** awaitChannelOpen() — joiner side: wait for its own channel to open. */
        async awaitChannelOpen() {
            return this.#awaitChannelReady();
        }

        async #awaitChannelReady() {
            const connectionId = this.#connectionId;
            const already = this.#engine.getConnectionState(connectionId);
            if (already.state === "connected") { this.#set(PAIRING_STATES.CONNECTED); this.#set(PAIRING_STATES.CHANNEL_READY); return { success: true, state: this.#state, connectionId }; }
            return await new Promise((resolve) => {
                let settled = false;
                const timer = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    this.#set(PAIRING_STATES.TIMEOUT, "Data channel did not open before timeout.");
                    resolve({ success: false, state: this.#state, reason: "TIMEOUT" });
                }, this.#timeoutMs);
                this.#engine.on("device-connected", (detail) => {
                    if (settled || detail.connectionId !== connectionId) return;
                    settled = true;
                    clearTimeout(timer);
                    this.#set(PAIRING_STATES.CONNECTED);
                    this.#set(PAIRING_STATES.CHANNEL_READY);
                    resolve({ success: true, state: this.#state, connectionId });
                });
            });
        }

        disconnect() {
            if (this.#engine && this.#connectionId) this.#engine.disconnect(this.#connectionId);
        }
    }

    /* ------------------------------------------------------------------ */
    /* 5. DATACHANNEL TRANSPORT ADAPTER — real send/receive over the real */
    /*    channel LiveHotspotEngine already opened.                       */
    /* ------------------------------------------------------------------ */

    class DataChannelAdapter {
        #engine;
        #connectionId;
        #seenPacketIds = new Set();
        #onPacket = null;
        #onReject = null;
        #maxSeen = 2000;

        constructor(connectionId) {
            this.#engine = hotspot();
            this.#connectionId = connectionId;
            if (this.#engine) {
                this.#engine.on("message-received", (detail) => this.#handleRaw(detail));
            }
        }

        onPacket(fn) { this.#onPacket = fn; }
        onReject(fn) { this.#onReject = fn; }

        /**
         * send(envelope)
         *   Real send over LiveHotspotEngine.sendMessage(). Reports the
         *   engine's own real open/closed state honestly instead of
         *   assuming success. Backpressure: RTCDataChannel exposes
         *   bufferedAmount on the real channel; this adapter surfaces it
         *   when present rather than inventing a flow-control scheme this
         *   gate does not implement end-to-end.
         */
        send(envelope) {
            if (!this.#engine) return { success: false, reason: "LiveHotspotEngine is not loaded." };
            const state = this.#engine.getConnectionState(this.#connectionId);
            if (state.state !== "connected") return { success: false, reason: `Channel is not open (state: "${state.state}").` };
            let serialized;
            try { serialized = JSON.stringify(envelope); }
            catch (err) { return { success: false, reason: `Envelope is not serializable: ${err.message}` }; }
            const result = this.#engine.sendMessage(this.#connectionId, serialized);
            return result;
        }

        getBackpressure() {
            const raw = this.#engine && typeof this.#engine.listConnections === "function"
                ? this.#engine.listConnections().find(c => c.id === this.#connectionId) : null;
            return { reported: false, reason: "bufferedAmount is only observable on the real RTCDataChannel instance itself; LiveHotspotEngine does not currently expose it through listConnections(). Documented as a real Gate 2 limitation, not fabricated.", connectionState: raw ? raw.state : "not-found" };
        }

        #handleRaw(detail) {
            if (detail.connectionId !== this.#connectionId) return;
            let envelope;
            try { envelope = JSON.parse(detail.data); }
            catch (_err) { this.#reject("malformed-json", detail.data); return; }
            if (!envelope || typeof envelope !== "object" || !envelope.packetId) { this.#reject("malformed-envelope", envelope); return; }
            if (this.#seenPacketIds.has(envelope.packetId)) { this.#reject("duplicate-packet", envelope); return; }
            this.#seenPacketIds.add(envelope.packetId);
            if (this.#seenPacketIds.size > this.#maxSeen) {
                const first = this.#seenPacketIds.values().next().value;
                this.#seenPacketIds.delete(first);
            }
            if (this.#onPacket) this.#onPacket(envelope);
        }
        #reject(reason, raw) {
            if (this.#onReject) this.#onReject({ reason, at: nowIso() });
        }

        close() { if (this.#engine) this.#engine.disconnect(this.#connectionId); }
    }

    /* ------------------------------------------------------------------ */
    /* 6. PACKET INTEGRITY PIPELINE                                       */
    /*    envelope -> session -> sender -> expiration -> replay ->        */
    /*    integrity -> ACCEPT                                             */
    /* ------------------------------------------------------------------ */

    /**
     * computeIntegrity(payload)
     *   A real, checkable checksum over the actual payload bytes (not a
     *   cryptographic signature — Gate 1/Gate 2 both explicitly defer real
     *   signing to composed security infrastructure that isn't wired yet).
     *   FNV-1a: small, fast, deterministic, dependency-free, and exact —
     *   good enough to genuinely catch corruption/tampering-in-transit for
     *   this gate's honest scope, not claimed as cryptographic proof.
     */
    function computeIntegrity(payload) {
        const str = typeof payload === "string" ? payload : JSON.stringify(payload);
        let hash = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(16);
    }

    const MAX_PAYLOAD_BYTES = 262144; // 256KB — a documented, disclosed Gate 2 limit, not a spec requirement discovered elsewhere in this repository.

    class PacketIntegrityPipeline {
        #seenPacketIds = new Set();
        #maxSeen = 5000;

        /**
         * accept(envelope, { expectedSessionId, knownSenders })
         *   Returns { accepted:true, packet } or { accepted:false, stage,
         *   reason } — the stage tells you exactly which step rejected it,
         *   for honest logging (never logs raw payload content, only
         *   metadata, per the Gate 2 prompt's "log safely" requirement).
         */
        accept(envelope, { expectedSessionId, knownSenders } = {}) {
            // envelope
            if (!envelope || typeof envelope !== "object") return this.#rejectAt("envelope", "Not a real object.");
            const required = ["packetId", "sender", "sessionId", "createdAt", "expiresAt", "payloadType", "payload", "sequence", "transport", "integrity"];
            for (const field of required) {
                if (envelope[field] === undefined) return this.#rejectAt("envelope", `Missing required field "${field}".`);
            }
            const payloadSize = (() => { try { return JSON.stringify(envelope.payload).length; } catch (_err) { return Infinity; } })();
            if (payloadSize > MAX_PAYLOAD_BYTES) return this.#rejectAt("envelope", `Oversized packet: ${payloadSize} bytes exceeds the ${MAX_PAYLOAD_BYTES}-byte limit.`);
            // session
            if (expectedSessionId && envelope.sessionId !== expectedSessionId) return this.#rejectAt("session", "sessionId does not match this transport session.");
            // sender
            if (Array.isArray(knownSenders) && knownSenders.length && !knownSenders.includes(envelope.sender)) return this.#rejectAt("sender", `Sender "${envelope.sender}" is not a recognized participant of this session.`);
            // expiration
            if (new Date(envelope.expiresAt).getTime() < Date.now()) return this.#rejectAt("expiration", "Packet has expired.");
            // replay/duplicate
            if (this.#seenPacketIds.has(envelope.packetId)) return this.#rejectAt("replay", "Duplicate/replayed packetId.");
            // integrity
            const expected = computeIntegrity(envelope.payload);
            if (expected !== envelope.integrity) return this.#rejectAt("integrity", "Checksum mismatch — payload may be corrupted or tampered with.");

            this.#remember(envelope.packetId);
            return { accepted: true, stage: "ACCEPT", packet: envelope };
        }
        #remember(id) {
            this.#seenPacketIds.add(id);
            if (this.#seenPacketIds.size > this.#maxSeen) { const f = this.#seenPacketIds.values().next().value; this.#seenPacketIds.delete(f); }
        }
        #rejectAt(stage, reason) { return { accepted: false, stage, reason }; }
    }

    /**
     * wrapEnvelope(packet, { sender, sessionId, sequence, transport })
     *   Extends Gate 1's real createPacket() output with the transport-only
     *   envelope fields item 6 of the Gate 2 prompt requires
     *   (sender/recipient/sequence/transport/integrity), without inventing
     *   a second packet format — `destination` from Gate 1 IS the
     *   recipient field on the wire.
     */
    function wrapEnvelope(packet, { sender, sessionId, sequence = 0, transport = "webrtc-datachannel" } = {}) {
        return Object.freeze({
            packetId: packet.id,
            sender: sender || null,
            recipient: packet.destination,
            sessionId: sessionId || null,
            createdAt: packet.createdAt,
            expiresAt: new Date(new Date(packet.createdAt).getTime() + packet.ttlMs).toISOString(),
            payloadType: packet.payloadType,
            payload: packet.provenance,
            sequence,
            transport,
            integrity: computeIntegrity(packet.provenance)
        });
    }

    /**
     * NEVER routes accepted content directly into a domain system. Per the
     * Gate 2 prompt (§7/§13), those systems keep their own validation
     * gates; this function only tells the caller which real domain gate a
     * given payloadType belongs to, honestly, without invoking it.
     */
    const DOMAIN_ROUTES = Object.freeze({
        "language-pack-update": "RP-031 acquisition -> RP-029 safety gate -> RP-029 community validation -> language-pack governance",
        "community-knowledge-candidate": "RP-029 safety gate -> RP-029 community validation",
        "media": "media storage's own validation gate (not composed by this file)",
        "application-sync": "application state's own validation gate (not composed by this file)",
        "financial": "financial systems' own validation gate (not composed by this file) — Gate 2 explicitly excludes crypto/settlement"
    });
    function domainRouteFor(payloadType) {
        return DOMAIN_ROUTES[payloadType] || "No domain route is defined for this payloadType in Gate 2; a generic message/file stays in application-level connectivity state only.";
    }

    /* ------------------------------------------------------------------ */
    /* 7. SECURITY COMPOSITION                                            */
    /*    Device Identity -> Session Identity -> Pairing Challenge ->     */
    /*    Trust Decision -> Transport Authorization                       */
    /* ------------------------------------------------------------------ */

    /**
     * authorizeTransport({ deviceId, sessionId, nonce, shareSessionId })
     *   Real composition of Gate 1's identity/session/challenge contracts
     *   plus Cozy Share's real TrustLayer certificate, when the caller
     *   supplies a shareSessionId it actually belongs to. If Cozy Share is
     *   not loaded, or no certificate exists, trust is honestly UNVERIFIED
     *   — never fabricated as trusted. This is NOT full production trust
     *   evaluation (that's living-security-coordinator.js /
     *   living-trust-engine.js, deferred per Gate 1's own scope) — it is
     *   the real composition of what already exists.
     */
    async function authorizeTransport({ deviceId, sessionId, nonce, shareSessionId, shareDeviceId } = {}) {
        const coord = coordinator();
        if (!coord) return { authorized: false, reason: "Gate 1 coordinator not loaded." };

        const identity = await coord.getDeviceIdentity();
        // Not fatal by itself — TrustedDeviceManager is best-effort per Gate 1.

        const challengeResult = coord.verifyChallengeResponse(nonce, sessionId);
        if (!challengeResult.success) return { authorized: false, stage: "PAIRING_CHALLENGE", reason: challengeResult.reason, deviceIdentity: identity };

        let trustDecision = { trusted: false, reason: "Cozy Share not loaded; trust honestly UNVERIFIED (no certificate to check).", source: "none" };
        const share = cozyShare();
        if (share && shareSessionId && shareDeviceId) {
            try {
                const isTrusted = share.isTrusted(shareDeviceId);
                const cert = share.getCertificate(shareDeviceId);
                trustDecision = {
                    trusted: !!isTrusted,
                    reason: isTrusted ? "Active Cozy Share trust certificate found." : (cert ? "Certificate exists but is revoked." : "No Cozy Share trust certificate exists for this device."),
                    source: "CozyShare.TrustLayer",
                    certificateId: cert ? cert.certificateId : null
                };
            } catch (err) {
                trustDecision = { trusted: false, reason: err.message || "CozyShare trust check failed.", source: "CozyShare.TrustLayer" };
            }
        }

        // Transport authorization: the challenge (proof of live session
        // possession) is REQUIRED. A Cozy Share certificate, when present,
        // upgrades trustLevel but its absence does not itself block guest-
        // tier transport — that mirrors CozyShare's own OPERATOR_ROLES-only
        // certificate requirement, composed rather than re-invented here.
        return {
            authorized: true,
            deviceIdentity: identity,
            trustDecision,
            trustLevel: trustDecision.trusted ? "CERTIFIED" : "UNVERIFIED"
        };
    }

    /* ------------------------------------------------------------------ */
    /* 8. OFFLINE STORE-AND-FORWARD QUEUE                                 */
    /*    CREATE PACKET -> QUEUED -> WAITING_FOR_TRANSPORT ->             */
    /*    TRANSPORT_AVAILABLE -> TRANSFERRING -> RECEIVED -> VERIFIED     */
    /* ------------------------------------------------------------------ */

    const QUEUE_STATES = Object.freeze([
        "QUEUED", "WAITING_FOR_TRANSPORT", "TRANSPORT_AVAILABLE",
        "TRANSFERRING", "RECEIVED", "VERIFIED", "FAILED", "CANCELLED", "EXPIRED"
    ]);
    const QUEUE_TRANSITIONS = Object.freeze({
        QUEUED: ["WAITING_FOR_TRANSPORT", "TRANSPORT_AVAILABLE", "CANCELLED", "EXPIRED", "FAILED"],
        WAITING_FOR_TRANSPORT: ["TRANSPORT_AVAILABLE", "CANCELLED", "EXPIRED", "FAILED"],
        TRANSPORT_AVAILABLE: ["TRANSFERRING", "WAITING_FOR_TRANSPORT", "CANCELLED", "EXPIRED", "FAILED"],
        TRANSFERRING: ["RECEIVED", "FAILED", "WAITING_FOR_TRANSPORT"],
        RECEIVED: ["VERIFIED", "FAILED"],
        VERIFIED: [],
        FAILED: ["WAITING_FOR_TRANSPORT"],
        CANCELLED: [],
        EXPIRED: []
    });

    class QueueItem {
        constructor(packet) {
            this.packet = packet;
            this.state = "QUEUED";
            this.retryCount = 0;
            this.maxRetries = 5;
            this.failureReason = null;
            this.history = [{ state: "QUEUED", at: nowIso() }];
        }
        transition(next, detail) {
            const allowed = QUEUE_TRANSITIONS[this.state] || [];
            if (!allowed.includes(next)) return { success: false, reason: `Invalid queue transition: ${this.state} -> ${next}.` };
            this.state = next;
            this.history.push({ state: next, at: nowIso(), detail: detail || null });
            if (next === "FAILED") this.failureReason = detail || "Unspecified failure.";
            return { success: true, state: this.state };
        }
    }

    class OfflineQueue {
        #items = new Map(); // packetId -> QueueItem

        enqueue(packet) {
            const item = new QueueItem(packet);
            this.#items.set(packet.id, item);
            return item;
        }
        markWaitingForTransport(packetId, reason) {
            const item = this.#items.get(packetId);
            if (!item) return { success: false, reason: "No such queued packet." };
            return item.transition("WAITING_FOR_TRANSPORT", reason || "No live transport session.");
        }
        markTransportAvailable(packetId) {
            const item = this.#items.get(packetId);
            if (!item) return { success: false, reason: "No such queued packet." };
            if (this.isExpired(packetId)) return this.expire(packetId);
            return item.transition("TRANSPORT_AVAILABLE");
        }
        markTransferring(packetId) {
            const item = this.#items.get(packetId);
            if (!item) return { success: false, reason: "No such queued packet." };
            return item.transition("TRANSFERRING");
        }
        /** markReceived — the remote peer's DataChannelAdapter genuinely got it. */
        markReceived(packetId) {
            const item = this.#items.get(packetId);
            if (!item) return { success: false, reason: "No such queued packet." };
            return item.transition("RECEIVED");
        }
        /**
         * markVerified — ONLY ever called after PacketIntegrityPipeline.accept()
         * genuinely returned accepted:true for this packetId. Never called
         * speculatively; never reports "SYNCED" (that state does not exist
         * in this vocabulary at all, deliberately).
         */
        markVerified(packetId) {
            const item = this.#items.get(packetId);
            if (!item) return { success: false, reason: "No such queued packet." };
            return item.transition("VERIFIED");
        }
        markFailed(packetId, reason) {
            const item = this.#items.get(packetId);
            if (!item) return { success: false, reason: "No such queued packet." };
            return item.transition("FAILED", reason);
        }
        retry(packetId) {
            const item = this.#items.get(packetId);
            if (!item) return { success: false, reason: "No such queued packet." };
            if (item.state !== "FAILED") return { success: false, reason: `Can only retry from FAILED (currently ${item.state}).` };
            if (item.retryCount >= item.maxRetries) return { success: false, reason: `Max retries (${item.maxRetries}) exceeded.` };
            item.retryCount += 1;
            return item.transition("WAITING_FOR_TRANSPORT", `retry #${item.retryCount}`);
        }
        cancel(packetId) {
            const item = this.#items.get(packetId);
            if (!item) return { success: false, reason: "No such queued packet." };
            return item.transition("CANCELLED", "Cancelled by caller.");
        }
        isExpired(packetId) {
            const coord = coordinator();
            const item = this.#items.get(packetId);
            if (!item) return false;
            return coord ? coord.isPacketExpired(item.packet) : false;
        }
        expire(packetId) {
            const item = this.#items.get(packetId);
            if (!item) return { success: false, reason: "No such queued packet." };
            return item.transition("EXPIRED", "TTL exceeded.");
        }
        get(packetId) { const item = this.#items.get(packetId); return item ? { packetId, state: item.state, retryCount: item.retryCount, failureReason: item.failureReason, history: item.history.slice() } : null; }
        list() { return Array.from(this.#items.keys()).map(id => this.get(id)); }
        listByState(state) { return this.list().filter(i => i.state === state); }
    }

    /* ------------------------------------------------------------------ */
    /* 9. BLUETOOTH/BLE — detection + real CozyConnect scan/connect only  */
    /*    (no GATT data-transport protocol implemented in Gate 2)         */
    /* ------------------------------------------------------------------ */

    async function attemptBluetoothPairing(options) {
        const connect = cozyConnect();
        if (!connect || !connect.bluetooth) return { success: false, state: "CAPABILITY_UNAVAILABLE", reason: "CozyConnect Bluetooth provider not loaded." };
        const cap = connect.bluetooth.capabilities();
        if (!cap.supported) return { success: false, state: "CAPABILITY_UNAVAILABLE", reason: cap.reason };
        const scan = await connect.bluetooth.scan(options);
        if (!scan.supported) return { success: false, state: "CAPABILITY_UNAVAILABLE", reason: scan.reason };
        if (scan.error) return { success: false, state: "PAIRING_FAILED", reason: scan.error };
        return { success: true, state: "PAIRED_DEVICE_SELECTED", device: scan.device, note: "GATT data-channel transport is not implemented in Gate 2 — device selection/pairing only, honestly. See RP-033-BLE-TRANSPORT in the repair queue." };
    }

    /* ------------------------------------------------------------------ */
    /* 10. COORDINATOR (Gate 2 public surface)                            */
    /* ------------------------------------------------------------------ */

    class CozyConnectivityTransport {
        #invitations = new InvitationRegistry();
        #integrity = new PacketIntegrityPipeline();
        #queue = new OfflineQueue();
        #adapters = new Map(); // connectionId -> DataChannelAdapter
        #sequence = 0;

        getVersion() { return VERSION; }
        getId() { return "CozyConnectivityTransport"; }
        getDependencies() { return ["CozyLivingConnectivity", "LiveHotspotEngine", "CozyConnect", "CozyShare (optional)"]; }

        // ---- pairing -----------------------------------------------------
        createInvitation(opts) { return createInvitation(this.#invitations, opts); }
        validateInvitation(payload, opts) { return validateInvitation(this.#invitations, payload, opts); }
        confirmInvitation(payload, opts) { return confirmInvitation(this.#invitations, payload, opts); }
        createPairingSession(opts) { return new PairingSession(opts); }

        // ---- transport -----------------------------------------------------
        openAdapter(connectionId) {
            const adapter = new DataChannelAdapter(connectionId);
            this.#adapters.set(connectionId, adapter);
            return adapter;
        }
        getAdapter(connectionId) { return this.#adapters.get(connectionId) || null; }

        // ---- packet integrity -----------------------------------------------------
        wrapEnvelope(packet, opts) { return wrapEnvelope(packet, opts); }
        acceptIncoming(envelope, opts) { return this.#integrity.accept(envelope, opts); }
        domainRouteFor(payloadType) { return domainRouteFor(payloadType); }
        computeIntegrity(payload) { return computeIntegrity(payload); }

        // ---- security -----------------------------------------------------
        authorizeTransport(opts) { return authorizeTransport(opts); }

        // ---- offline queue -----------------------------------------------------
        get queue() { return this.#queue; }
        nextSequence() { this.#sequence += 1; return this.#sequence; }

        /**
         * sendPacket({destination, payloadType, provenanceChain, ttlMs,
         * priority, sender, sessionId, connectionId})
         *   The generic SEND_PACKET entry point (§9/§13 of the Gate 2
         *   prompt): creates a real Gate 1 packet, queues it, and either
         *   transfers it now (a real, open DataChannelAdapter exists) or
         *   honestly leaves it WAITING_FOR_TRANSPORT — never deletes a
         *   queued packet merely because transport is unavailable.
         */
        sendPacket({ destination, payloadType, payload, provenanceChain, ttlMs, priority, sender, sessionId, connectionId } = {}) {
            const coord = coordinator();
            if (!coord) return { success: false, reason: "Gate 1 coordinator not loaded." };
            const created = coord.createPacket({ destination, payloadType, provenanceChain, ttlMs, priority, createdBy: sender });
            if (!created.success) return created;

            const item = this.#queue.enqueue(created.packet);
            const envelope = wrapEnvelope(created.packet, { sender, sessionId, sequence: this.nextSequence() });
            // The real payload travels inside `payload`, not `provenance`
            // (wrapEnvelope's default is structural-only); a caller sending
            // real content assigns it before transfer.
            const fullEnvelope = Object.freeze({ ...envelope, payload: payload !== undefined ? payload : envelope.payload, integrity: computeIntegrity(payload !== undefined ? payload : envelope.payload) });

            const adapter = connectionId ? this.getAdapter(connectionId) : null;
            if (!adapter) {
                this.#queue.markWaitingForTransport(created.packet.id, "No open transport adapter for this connection.");
                return { success: true, packetId: created.packet.id, state: "WAITING_FOR_TRANSPORT", envelope: fullEnvelope };
            }
            this.#queue.markTransportAvailable(created.packet.id);
            this.#queue.markTransferring(created.packet.id);
            const sendResult = adapter.send(fullEnvelope);
            if (!sendResult.success) {
                this.#queue.markFailed(created.packet.id, sendResult.reason);
                return { success: false, packetId: created.packet.id, state: "FAILED", reason: sendResult.reason };
            }
            return { success: true, packetId: created.packet.id, state: "TRANSFERRING", envelope: fullEnvelope };
        }

        /**
         * receivePacket(envelope, { expectedSessionId, knownSenders })
         *   Runs the full integrity pipeline; on ACCEPT, marks the queue
         *   item RECEIVED then VERIFIED (a fresh QueueItem is created here
         *   for inbound packets that weren't already tracked locally, so
         *   receive-only peers get real queue visibility too).
         */
        receivePacket(envelope, opts) {
            const result = this.#integrity.accept(envelope, opts);
            if (!result.accepted) return result;
            let item = this.#queue.get(envelope.packetId);
            if (!item) {
                const coord = coordinator();
                const fakePacket = coord ? { id: envelope.packetId, destination: envelope.recipient, payloadType: envelope.payloadType, createdAt: envelope.createdAt, ttlMs: new Date(envelope.expiresAt).getTime() - new Date(envelope.createdAt).getTime() } : { id: envelope.packetId };
                this.#queue.enqueue(fakePacket);
            }
            this.#queue.markReceived(envelope.packetId);
            this.#queue.markVerified(envelope.packetId);
            return result;
        }

        // ---- bluetooth -----------------------------------------------------
        attemptBluetoothPairing(opts) { return attemptBluetoothPairing(opts); }

        // ---- cozy share -----------------------------------------------------
        /**
         * getAuthorizedShareSession(shareSessionId)
         *   Read-only composition of CozyShare.getSession()/listMembers() —
         *   never duplicates its session/role model. Returns null, honestly,
         *   if Cozy Share isn't loaded or the session doesn't exist.
         */
        getAuthorizedShareSession(shareSessionId) {
            const share = cozyShare();
            if (!share) return null;
            const session = share.getSession(shareSessionId);
            if (!session) return null;
            const members = share.listMembers(shareSessionId);
            return { session, members: members.available ? members.members : [] };
        }

        // ---- native-companion contract stub (never fabricated) --------------
        /**
         * prepareNativeCompanionAdapter(kind)
         *   kind: "wifi-direct" | "os-hotspot". Returns the contract shape a
         *   future Android/native CozyOS companion would need to implement
         *   — never claims the capability exists today.
         */
        prepareNativeCompanionAdapter(kind) {
            const known = { "wifi-direct": true, "os-hotspot": true };
            if (!known[kind]) return { success: false, reason: `"${kind}" is not a recognized native-companion adapter kind.` };
            return {
                success: true,
                status: "REQUIRES_NATIVE_COMPANION",
                contract: { kind, methods: ["discover", "connect", "disconnect", "status"], note: "Adapter contract only — no implementation exists in this repository. A native companion app would implement this interface and register it with CozyConnect.registerProvider()." }
            };
        }

        getGateStatus() {
            return {
                gate: 2,
                milestone: "Cozy Living Connectivity — Real Pairing + Transport",
                composed: [
                    "CozyConnect (Bluetooth detection/scan/connect, capability detection)",
                    "CozyLivingConnectivity (packet contract, session/invitation/challenge contracts)",
                    "LiveHotspotEngine (createHost/joinHost/completeHostPairing, real RTCDataChannel send/receive)",
                    "CozyShare (TrustLayer certificates, SessionManager — read-only)"
                ],
                implemented: [
                    "real-cozypair-invitation-with-replay-and-duplicate-protection",
                    "real-webrtc-host-join-pairing-state-machine",
                    "real-datachannel-send-receive-adapter-with-packet-id-tracking",
                    "packet-integrity-pipeline-envelope-session-sender-expiration-replay-integrity",
                    "offline-store-and-forward-queue-with-retry-ttl-cancellation",
                    "security-composition-identity-session-challenge-trust-decision-authorization"
                ],
                deferred: [
                    "ble-gatt-data-transport (detection/device-selection only, see RP-033-BLE-TRANSPORT)",
                    "full-cryptographic-trust-evaluation (living-security-coordinator.js / living-trust-engine.js not wired)",
                    "multi-hop-relay-routing (single-hop direct-peer only)",
                    "cozy-network-orchestrator-integration (unchanged from Gate 1)"
                ],
                capabilityUnavailable: ["native-wifi-direct-transport", "native-os-hotspot-creation-transport"],
                requiresNativeCompanion: ["wifi-direct", "os-hotspot"]
            };
        }
    }

    const instance = new CozyConnectivityTransport();
    instance.PAIRING_STATES = PAIRING_STATES;
    instance.PAIRING_FAILURE_STATES = PAIRING_FAILURE_STATES;
    instance.QUEUE_STATES = QUEUE_STATES;
    instance.COZYPAIR_VERSION = COZYPAIR_VERSION;

    if (hasWindow()) {
        window.CozyOS = window.CozyOS || {};
        window.CozyOS.CozyConnectivityTransport = instance;
        if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
            try {
                window.CozyOS.ServiceRegistry.registerCoordinator({
                    sourcePath: "core/connectivity/cozy-connectivity-transport.js",
                    name: "CozyConnectivityTransport", category: "Living Engine",
                    description: "RP-033 Gate 2 transport adapter: real COZYPAIR invitation flow, real WebRTC host/join pairing via LiveHotspotEngine, a real DataChannel send/receive adapter, the packet-integrity pipeline, and an offline store-and-forward queue that never fabricates SYNCED. Composes CozyConnect/CozyLivingConnectivity/LiveHotspotEngine/CozyShare; duplicates none of them."
                });
            } catch (_err) { /* non-fatal */ }
        }
    }

    return instance;
}));
