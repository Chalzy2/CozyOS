/**
 * CozyOS Living Connectivity — core/connectivity/cozy-living-connectivity.js
 * RP-033 Gate 1: Connectivity Core + Capability Detection
 * Milestone: Cozy Living Offline Connectivity
 *
 * OWNERSHIP: core/connectivity/cozy-connect.js is the existing, real owner
 * of physical-transport capability detection (Bluetooth/USB/Presentation/
 * Wifi-status/Camera/Microphone/Screen/Serial/HID/NFC/Cast). This file does
 * NOT duplicate that registry. It is a thin, additive coordinator that:
 *   1. Composes CozyConnect for the transports it already detects.
 *   2. Composes LiveHotspotEngine (core/engines/collaboration/
 *      live-hotspot-engine.js) for the transports IT already detects for
 *      real (WebRTC, WebRTC DataChannel, manual/QR SDP pairing).
 *   3. Adds honest, non-fabricated status reporting for the handful of
 *      transports neither file can ever detect from a browser at all
 *      (native Wi-Fi Direct, native OS-level hotspot creation) — reported
 *      as REQUIRES_NATIVE_COMPANION, never as available.
 *   4. Defines the offline-first connectivity state machine, the
 *      store-and-forward packet contract, and the identity/session/
 *      invitation contracts that later RP-033 gates (real transport,
 *      real multi-hop relay) will build on.
 *
 * ARCHITECTURE (composition, not duplication):
 *   cozy-connect.js  ---\
 *                         >--  cozy-living-connectivity.js (this file)
 *   live-hotspot-engine.js -/         |
 *                                     v
 *                    existing routing/orchestrator (core/network/
 *                    cozy-network-orchestrator.js, an ES-module-flavored
 *                    file addressed by later gates for real packet
 *                    routing) + Cozy Share (core/collaboration/
 *                    cozy-share.js) where appropriate.
 *
 * HONEST SCOPE — GATE 1 ONLY:
 *   This file detects capability and defines contracts. It does NOT
 *   perform real multi-hop relay, does NOT implement crypto settlement,
 *   and does NOT claim CONNECTED/SYNCED/VERIFIED for anything that has
 *   not genuinely happened. Real pairing/transport already exists in
 *   LiveHotspotEngine (createHost/joinHost/completeHostPairing) and is
 *   composed here for status reporting only — Gate 1 does not re-wire
 *   those flows; that composition work belongs to the next gate
 *   (real QR/manual pairing + transport), per the RP-033 roadmap.
 *
 * LIVING ENGINES COMPOSED IN GATE 1:
 *   - CozyConnect (core/connectivity/cozy-connect.js)              [composed]
 *   - LiveHotspotEngine (core/engines/collaboration/
 *     live-hotspot-engine.js)                                     [composed]
 *   - TrustedDeviceManager (core/security/trusted-device-manager.js)
 *     [composed, best-effort: used only for real device-fingerprint
 *     generation when loaded; never fabricated when absent]
 *
 * LIVING ENGINES DEFERRED (not composed in Gate 1, documented not hidden):
 *   - cozy-network-orchestrator.js (core/network/) — real packet routing;
 *     deferred because Gate 1 defines the packet contract, not the
 *     router. Also written in an ES-module-flavored dialect that this
 *     gate does not attempt to bridge.
 *   - cozy-share.js (core/collaboration/) — higher-level sharing UX;
 *     deferred to the gate that wires real transfer flows.
 *   - Living security infra beyond TrustedDeviceManager (e.g.
 *     living-security-coordinator.js, living-trust-engine.js) — deferred;
 *     Gate 1 only prepares identity/session *contracts*, not full trust
 *     evaluation.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.CozyLivingConnectivity) return;

    const VERSION = "1.0.0-gate1";

    /* ------------------------------------------------------------------ */
    /* 1. CAPABILITY STATUS VOCABULARY                                    */
    /* ------------------------------------------------------------------ */

    const CAPABILITY_STATUS = Object.freeze({
        AVAILABLE: "AVAILABLE",
        PARTIAL: "PARTIAL",
        UNAVAILABLE: "UNAVAILABLE",
        CAPABILITY_UNAVAILABLE: "CAPABILITY_UNAVAILABLE",
        REQUIRES_USER_ACTION: "REQUIRES_USER_ACTION",
        REQUIRES_NATIVE_COMPANION: "REQUIRES_NATIVE_COMPANION"
    });

    function hasWindow() { return typeof window !== "undefined"; }
    function hasNavigator() { return typeof navigator !== "undefined"; }

    /* ------------------------------------------------------------------ */
    /* 2. CAPABILITY DETECTION — composes CozyConnect + LiveHotspotEngine */
    /* ------------------------------------------------------------------ */

    /**
     * #fromCozyConnect(name)
     *   Reads a real capabilities().supported boolean from the existing
     *   CozyConnect provider registry. Never re-implements detection.
     */
    function fromCozyConnect(providerKey, apiKey) {
        const connect = hasWindow() && window.CozyOS.CozyConnect;
        if (!connect) return { available: false, reason: "CozyConnect (core/connectivity/cozy-connect.js) is not loaded." };
        const surface = apiKey ? connect[apiKey] : connect[providerKey];
        if (!surface || typeof surface.capabilities !== "function") {
            return { available: false, reason: `CozyConnect exposes no "${providerKey}" capability surface.` };
        }
        try {
            const cap = surface.capabilities();
            return { available: !!cap.supported, reason: cap.reason || null };
        } catch (err) {
            return { available: false, reason: err.message || "CozyConnect capability check failed." };
        }
    }

    function fromLiveHotspot() {
        const engine = hasWindow() && window.CozyOS.LiveHotspotEngine;
        if (!engine || typeof engine.capabilities !== "function") {
            return { webRTC: false, reason: "LiveHotspotEngine (core/engines/collaboration/live-hotspot-engine.js) is not loaded." };
        }
        try {
            const cap = engine.capabilities();
            return { webRTC: !!cap.webRTC, reason: null };
        } catch (err) {
            return { webRTC: false, reason: err.message || "LiveHotspotEngine capability check failed." };
        }
    }

    function detectCapabilities() {
        const report = {};

        // --- Composed from CozyConnect (real, existing provider registry) ---
        const bt = fromCozyConnect("bluetooth");
        report.bluetooth = {
            status: bt.available ? CAPABILITY_STATUS.PARTIAL : CAPABILITY_STATUS.UNAVAILABLE,
            reason: bt.available
                ? "Web Bluetooth (BLE) is available via CozyConnect; Bluetooth Classic pairing is not exposed by any browser."
                : (bt.reason || "Web Bluetooth API is not available."),
            source: "CozyConnect.bluetooth"
        };

        const usb = fromCozyConnect("usb");
        report.usb = {
            status: usb.available ? CAPABILITY_STATUS.AVAILABLE : CAPABILITY_STATUS.UNAVAILABLE,
            reason: usb.reason,
            source: "CozyConnect.usb"
        };

        const presentation = fromCozyConnect("presentation");
        report.presentationApi = {
            status: presentation.available ? CAPABILITY_STATUS.AVAILABLE : CAPABILITY_STATUS.UNAVAILABLE,
            reason: presentation.reason,
            source: "CozyConnect.presentation"
        };

        const cast = fromCozyConnect("cast");
        report.cast = {
            status: CAPABILITY_STATUS.CAPABILITY_UNAVAILABLE,
            reason: cast.reason || "Chromecast/Miracast/AirPlay control is not exposed by any browser; requires a native provider bridge that does not exist in this repository.",
            source: "CozyConnect.cast"
        };

        const serial = fromCozyConnect("serial");
        report.serial = {
            status: serial.available ? CAPABILITY_STATUS.AVAILABLE : CAPABILITY_STATUS.UNAVAILABLE,
            reason: serial.reason,
            source: "CozyConnect.serial"
        };

        const hid = fromCozyConnect("hid");
        report.hid = {
            status: hid.available ? CAPABILITY_STATUS.AVAILABLE : CAPABILITY_STATUS.UNAVAILABLE,
            reason: hid.reason,
            source: "CozyConnect.hid"
        };

        const nfc = fromCozyConnect("nfc");
        report.nfc = {
            status: nfc.available ? CAPABILITY_STATUS.AVAILABLE : CAPABILITY_STATUS.UNAVAILABLE,
            reason: nfc.reason || "Web NFC is only ever exposed by Chromium on Android; not available in this browser/context.",
            source: "CozyConnect.nfc"
        };

        const camera = fromCozyConnect("camera");
        report.camera = {
            status: camera.available ? CAPABILITY_STATUS.REQUIRES_USER_ACTION : CAPABILITY_STATUS.UNAVAILABLE,
            reason: camera.available ? "getUserMedia is available; a user permission prompt is required before any stream is granted." : camera.reason,
            source: "CozyConnect.camera"
        };

        const microphone = fromCozyConnect("microphone");
        report.microphone = {
            status: microphone.available ? CAPABILITY_STATUS.REQUIRES_USER_ACTION : CAPABILITY_STATUS.UNAVAILABLE,
            reason: microphone.available ? "getUserMedia is available; a user permission prompt is required before any stream is granted." : microphone.reason,
            source: "CozyConnect.microphone"
        };

        // --- Composed from LiveHotspotEngine (real RTCPeerConnection usage) ---
        const hotspot = fromLiveHotspot();
        report.webRTC = {
            status: hotspot.webRTC ? CAPABILITY_STATUS.AVAILABLE : CAPABILITY_STATUS.UNAVAILABLE,
            reason: hotspot.reason,
            source: "LiveHotspotEngine.capabilities"
        };
        // Matches LiveHotspotEngine's own unqualified `typeof RTCPeerConnection`
        // check (equivalent to window.RTCPeerConnection in a real browser) so
        // Gate 1 never disagrees with the engine it composes.
        const hasDataChannel = typeof RTCPeerConnection !== "undefined" &&
            typeof RTCDataChannel !== "undefined";
        report.webRTCDataChannel = {
            status: (hotspot.webRTC && hasDataChannel) ? CAPABILITY_STATUS.AVAILABLE : CAPABILITY_STATUS.UNAVAILABLE,
            reason: hotspot.webRTC ? null : "RTCPeerConnection is unavailable, so RTCDataChannel cannot be created.",
            source: "LiveHotspotEngine.capabilities + RTCDataChannel"
        };
        report.qrManualPairing = {
            status: hotspot.webRTC ? CAPABILITY_STATUS.AVAILABLE : CAPABILITY_STATUS.UNAVAILABLE,
            reason: hotspot.webRTC
                ? "LiveHotspotEngine.createHost()/joinHost() generate real manual offer/answer codes; QR is an encoding of that same text and requires the camera capability to scan (see 'camera')."
                : "Manual/QR pairing depends on real WebRTC support, which is unavailable.",
            source: "LiveHotspotEngine.createHost/joinHost"
        };

        // --- Network availability: composed from CozyConnect.wifi.status() ---
        const netStatus = (() => {
            const connect = hasWindow() && window.CozyOS.CozyConnect;
            if (!connect || !connect.wifi || typeof connect.wifi.status !== "function") {
                return { supported: hasNavigator() && typeof navigator.onLine === "boolean", online: hasNavigator() ? navigator.onLine : null };
            }
            try { return connect.wifi.status(); } catch (_err) { return { supported: false }; }
        })();
        report.internetAvailability = {
            status: !netStatus.supported
                ? CAPABILITY_STATUS.UNAVAILABLE
                : (netStatus.online ? CAPABILITY_STATUS.AVAILABLE : CAPABILITY_STATUS.PARTIAL),
            reason: !netStatus.supported
                ? "navigator.onLine is not available in this environment."
                : (netStatus.online ? null : "navigator.onLine reports offline; device-detectable but not currently connected."),
            source: "CozyConnect.wifi.status"
        };

        // --- Honestly never available from a browser, no fabrication ---
        report.nativeWifiDirect = {
            status: CAPABILITY_STATUS.REQUIRES_NATIVE_COMPANION,
            reason: "Browsers expose no Wi-Fi Direct API. Requires a native companion app/OS integration that does not exist in this repository.",
            source: "none (honest, non-fabricated)"
        };
        report.nativeHotspotCreation = {
            status: CAPABILITY_STATUS.REQUIRES_NATIVE_COMPANION,
            reason: "Browsers expose no API to create or configure an OS-level Wi-Fi hotspot. Requires a native companion app/OS integration that does not exist in this repository.",
            source: "none (honest, non-fabricated)"
        };

        return report;
    }

    /* ------------------------------------------------------------------ */
    /* 3. OFFLINE-FIRST CONNECTIVITY STATE MACHINE                        */
    /* ------------------------------------------------------------------ */

    const CONNECTIVITY_STATES = Object.freeze([
        "DISCOVERING", "PAIRING_REQUIRED", "PAIRING", "PAIRED", "READY",
        "TRANSFERRING", "QUEUED", "WAITING_FOR_NETWORK", "SYNCING",
        "VERIFIED", "FAILED", "CAPABILITY_UNAVAILABLE"
    ]);

    // No fake CONNECTED/SYNCED states exist anywhere in this vocabulary.
    const TRANSITIONS = Object.freeze({
        DISCOVERING: ["PAIRING_REQUIRED", "CAPABILITY_UNAVAILABLE", "FAILED"],
        PAIRING_REQUIRED: ["PAIRING", "FAILED"],
        PAIRING: ["PAIRED", "FAILED"],
        PAIRED: ["READY", "FAILED"],
        READY: ["TRANSFERRING", "QUEUED", "WAITING_FOR_NETWORK", "SYNCING", "FAILED"],
        TRANSFERRING: ["SYNCING", "QUEUED", "READY", "FAILED"],
        QUEUED: ["WAITING_FOR_NETWORK", "TRANSFERRING", "FAILED"],
        WAITING_FOR_NETWORK: ["QUEUED", "TRANSFERRING", "FAILED"],
        SYNCING: ["VERIFIED", "FAILED"],
        VERIFIED: ["READY"],
        FAILED: ["DISCOVERING"],
        CAPABILITY_UNAVAILABLE: []
    });

    class ConnectivitySession {
        #state = "DISCOVERING";
        #history = [];
        constructor(id) {
            this.id = id || `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            this.#history.push({ state: this.#state, at: new Date().toISOString() });
        }
        get state() { return this.#state; }
        getHistory() { return this.#history.map(h => ({ ...h })); }
        transition(nextState, detail) {
            if (!CONNECTIVITY_STATES.includes(nextState)) {
                return { success: false, reason: `"${nextState}" is not a real connectivity state.` };
            }
            const allowed = TRANSITIONS[this.#state] || [];
            if (!allowed.includes(nextState)) {
                return { success: false, reason: `Invalid transition: ${this.#state} -> ${nextState}.` };
            }
            this.#state = nextState;
            this.#history.push({ state: nextState, at: new Date().toISOString(), detail: detail || null });
            return { success: true, state: this.#state };
        }
    }

    /* ------------------------------------------------------------------ */
    /* 4. STORE-AND-FORWARD PACKET CONTRACT                               */
    /* ------------------------------------------------------------------ */

    const PACKET_PRIORITY = Object.freeze(["LOW", "NORMAL", "HIGH", "CRITICAL"]);
    const ENCRYPTION_STATE = Object.freeze(["NONE", "PENDING", "ENCRYPTED"]);
    // Transport state re-uses the same connectivity vocabulary - a packet's
    // transport state is always one of the real states above, never a
    // fabricated one.
    const PACKET_TRANSPORT_STATES = CONNECTIVITY_STATES;

    let packetSeq = 0;
    function createPacket(fields) {
        const f = fields || {};
        if (!f.destination) return { success: false, reason: "A real destination is required." };
        if (!f.payloadType) return { success: false, reason: "A real payloadType is required." };
        const ttl = Number.isFinite(f.ttlMs) ? f.ttlMs : 24 * 60 * 60 * 1000;
        if (ttl <= 0) return { success: false, reason: "ttlMs must be a positive number." };
        const priority = PACKET_PRIORITY.includes(f.priority) ? f.priority : "NORMAL";
        const encryptionState = ENCRYPTION_STATE.includes(f.encryptionState) ? f.encryptionState : "NONE";

        packetSeq += 1;
        const packet = Object.freeze({
            id: f.payloadId || `pkt_${Date.now()}_${packetSeq}_${Math.random().toString(36).slice(2, 6)}`,
            destination: f.destination,
            payloadType: f.payloadType,
            payloadId: f.payloadId || null,
            createdAt: new Date().toISOString(),
            ttlMs: ttl,
            priority,
            encryptionState,
            transportState: "QUEUED",
            retryCount: 0,
            provenance: Object.freeze({
                createdBy: f.createdBy || null,
                chain: Array.isArray(f.provenanceChain) ? Object.freeze(f.provenanceChain.slice()) : Object.freeze([])
            })
        });
        return { success: true, packet };
    }

    function isPacketExpired(packet, nowIso) {
        if (!packet || !packet.createdAt) return true;
        const now = nowIso ? new Date(nowIso).getTime() : Date.now();
        return (now - new Date(packet.createdAt).getTime()) > packet.ttlMs;
    }

    function withTransportState(packet, nextState) {
        if (!packet) return { success: false, reason: "A real packet is required." };
        if (!PACKET_TRANSPORT_STATES.includes(nextState)) return { success: false, reason: `"${nextState}" is not a real transport state.` };
        return { success: true, packet: Object.freeze({ ...packet, transportState: nextState }) };
    }

    function withRetry(packet) {
        if (!packet) return { success: false, reason: "A real packet is required." };
        return { success: true, packet: Object.freeze({ ...packet, retryCount: packet.retryCount + 1 }) };
    }

    /* ------------------------------------------------------------------ */
    /* 5. IDENTITY / SESSION / INVITATION CONTRACTS (structural only —    */
    /*    no cryptographic primitives invented; composes                  */
    /*    TrustedDeviceManager where genuinely loaded)                    */
    /* ------------------------------------------------------------------ */

    async function getDeviceIdentity() {
        const tdm = hasWindow() && window.CozyOS.TrustedDeviceManager;
        if (!tdm || typeof tdm.generateFingerprint !== "function") {
            return { available: false, reason: "TrustedDeviceManager (core/security/trusted-device-manager.js) is not loaded; no fingerprint fabricated." };
        }
        try {
            const fingerprint = await tdm.generateFingerprint();
            return { available: true, fingerprint };
        } catch (err) {
            return { available: false, reason: err.message || "generateFingerprint() failed." };
        }
    }

    /**
     * createSessionIdentity(deviceIdentity)
     *   A session identity is deliberately separate from device identity
     *   (a device may open many sessions; a session must not leak the raw
     *   device fingerprint into a QR code). This is a structural contract,
     *   not a cryptographic one - the actual signing/verification of
     *   session tokens belongs to a later gate composing real Cozy
     *   security infrastructure (living-security-coordinator.js /
     *   living-trust-engine.js), not to Gate 1.
     */
    function createSessionIdentity(deviceRef, { expiresInMs = 15 * 60 * 1000 } = {}) {
        if (!deviceRef) return { success: false, reason: "A real deviceRef is required." };
        const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        return {
            success: true,
            session: Object.freeze({
                sessionId,
                deviceRef,
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
                trustState: "UNVERIFIED"
            })
        };
    }

    /**
     * createInvitationCode(sessionId)
     *   Deliberately contains ONLY a session reference and expiry - never
     *   private keys, never the raw device fingerprint. This is what gets
     *   encoded into a QR code or shared as a manual pairing code.
     */
    function createInvitationCode(sessionId, { expiresInMs = 5 * 60 * 1000 } = {}) {
        if (!sessionId) return { success: false, reason: "A real sessionId is required." };
        return {
            success: true,
            invitation: Object.freeze({
                version: 1,
                sessionRef: sessionId,
                issuedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + expiresInMs).toISOString()
            })
        };
    }

    function isInvitationExpired(invitation, nowIso) {
        if (!invitation || !invitation.expiresAt) return true;
        const now = nowIso ? new Date(nowIso).getTime() : Date.now();
        return now > new Date(invitation.expiresAt).getTime();
    }

    /**
     * Challenge/response + replay protection.
     *   Real, working nonce bookkeeping (a genuine, testable replay guard)
     *   - NOT a cryptographic signature scheme. issueChallenge() hands out
     *   a single-use nonce; verifyResponse() honestly rejects reuse or
     *   expiry. Actual cryptographic signing of the response is explicitly
     *   out of scope for Gate 1 and deferred to composition with real
     *   Cozy security infrastructure.
     */
    class ChallengeRegistry {
        #issued = new Map();
        issueChallenge(sessionId, { expiresInMs = 60 * 1000 } = {}) {
            if (!sessionId) return { success: false, reason: "A real sessionId is required." };
            const nonce = `chal_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            this.#issued.set(nonce, { sessionId, expiresAt: Date.now() + expiresInMs, used: false });
            return { success: true, nonce, expiresInMs };
        }
        verifyResponse(nonce, sessionId) {
            const entry = this.#issued.get(nonce);
            if (!entry) return { success: false, reason: "Unknown challenge nonce." };
            if (entry.used) return { success: false, reason: "Replay detected: this challenge nonce was already used." };
            if (entry.sessionId !== sessionId) return { success: false, reason: "Session mismatch for this challenge." };
            if (Date.now() > entry.expiresAt) return { success: false, reason: "Challenge has expired." };
            entry.used = true;
            return { success: true };
        }
    }

    /* ------------------------------------------------------------------ */
    /* 6. COORDINATOR                                                     */
    /* ------------------------------------------------------------------ */

    class CozyLivingConnectivityCoordinator {
        #sessions = new Map();
        #challenges = new ChallengeRegistry();

        detectCapabilities() { return detectCapabilities(); }

        createConnectivitySession(id) {
            const session = new ConnectivitySession(id);
            this.#sessions.set(session.id, session);
            return session;
        }
        getConnectivitySession(id) { return this.#sessions.get(id) || null; }
        listConnectivitySessions() { return Array.from(this.#sessions.values()).map(s => ({ id: s.id, state: s.state })); }

        createPacket(fields) { return createPacket(fields); }
        isPacketExpired(packet, nowIso) { return isPacketExpired(packet, nowIso); }
        withTransportState(packet, nextState) { return withTransportState(packet, nextState); }
        withRetry(packet) { return withRetry(packet); }

        getDeviceIdentity() { return getDeviceIdentity(); }
        createSessionIdentity(deviceRef, opts) { return createSessionIdentity(deviceRef, opts); }
        createInvitationCode(sessionId, opts) { return createInvitationCode(sessionId, opts); }
        isInvitationExpired(invitation, nowIso) { return isInvitationExpired(invitation, nowIso); }
        issueChallenge(sessionId, opts) { return this.#challenges.issueChallenge(sessionId, opts); }
        verifyChallengeResponse(nonce, sessionId) { return this.#challenges.verifyResponse(nonce, sessionId); }

        getVersion() { return VERSION; }
        getId() { return "CozyLivingConnectivity"; }
        getDependencies() { return ["CozyConnect", "LiveHotspotEngine"]; }
        getGateStatus() {
            return {
                gate: 1,
                milestone: "Cozy Living Offline Connectivity",
                implemented: ["capability-detection", "connectivity-state-machine", "packet-contract", "identity-session-invitation-contracts", "challenge-replay-guard"],
                deferred: ["real-multi-hop-relay", "crypto-settlement", "cozy-network-orchestrator-routing-integration", "cozy-share-integration", "full-trust-evaluation"]
            };
        }
    }

    window.CozyOS.CozyLivingConnectivity = new CozyLivingConnectivityCoordinator();
    window.CozyOS.CozyLivingConnectivity.CAPABILITY_STATUS = CAPABILITY_STATUS;
    window.CozyOS.CozyLivingConnectivity.CONNECTIVITY_STATES = CONNECTIVITY_STATES;
    window.CozyOS.CozyLivingConnectivity.PACKET_PRIORITY = PACKET_PRIORITY;
    window.CozyOS.CozyLivingConnectivity.ENCRYPTION_STATE = ENCRYPTION_STATE;

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                sourcePath: "core/connectivity/cozy-living-connectivity.js",
                name: "CozyLivingConnectivity", category: "Living Engine",
                description: "RP-033 Gate 1 connectivity coordinator: honest capability detection composed from CozyConnect and LiveHotspotEngine, plus the offline-first connectivity state machine, store-and-forward packet contract, and identity/session/invitation contracts for later gates."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
