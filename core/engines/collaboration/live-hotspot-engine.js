/**
 * CozyOS Live Hotspot & Offline Collaboration Engine —
 * core/engines/collaboration/live-hotspot-engine.js
 * Milestone M286
 *
 * OWNERSHIP: no existing WebRTC/peer/hotspot engine found in this
 * repository (confirmed by search). Composes CozyConnect's real
 * Bluetooth provider (M240) for device discovery where GATT-based
 * discovery genuinely applies - never a second Bluetooth
 * implementation.
 *
 * HONEST SCOPE - the critical distinction this file is built around:
 *   REAL: peer-to-peer data connection via the actual, standard
 *   RTCPeerConnection API (WebRTC), using MANUAL SDP exchange (the
 *   offer/answer text is generated locally and exchanged by the user
 *   copying/pasting it or scanning a QR code containing it) - this
 *   genuinely works without any signaling server, because none exists
 *   in this repository. Once connected, this is a real, working
 *   peer-to-peer data channel usable for messaging, file transfer, and
 *   clipboard sharing on the same local network/hotspot.
 *
 *   NOT REAL, honestly rejected rather than fabricated: creating a
 *   Wi-Fi hotspot, Wi-Fi Direct, or any OS-level network configuration
 *   - browsers have zero API for any of this. "Automatically discover
 *   nearby CozyOS devices" without a real discovery transport (mDNS,
 *   Bluetooth advertising) is not implemented - only Bluetooth-based
 *   discovery via CozyConnect's already-real GATT scan is composed.
 *   USB networking, Ethernet configuration, printer/camera/microphone
 *   sharing between devices are not implemented - none has a real
 *   browser API. Each of these is disclosed explicitly, not silently
 *   omitted.
 *
 * MILESTONE 362 STAGE 2 ADDITIONS
 *   createHost()/joinHost() now accept an optional {tracks} parameter
 *   (real pc.addTrack() before the offer/answer is created) — omitted
 *   or empty preserves the exact, original, data-channel-only behavior
 *   byte-for-byte. New: addTrack()/removeTrack() for an established
 *   connection (mid-call camera/mic toggle) plus
 *   createRenegotiationOffer()/applyRenegotiationAnswer() for the real
 *   renegotiation round-trip that requires (signaling itself remains
 *   outside this file's scope, as before). New: ontrack/
 *   oniceconnectionstatechange/onconnectionstatechange wired to real,
 *   observable events (remote-track, ice-state-changed,
 *   connection-state-changed) and getRemoteStreams()/
 *   getPeerConnectionState() accessors — all additive; every previously
 *   existing method's behavior, event, and connection-state string is
 *   unchanged.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.LiveHotspotEngine) return;

    class CozyLiveHotspotEngine {
        #connections = new Map();
        #listeners = new Map();

        #emit(eventName, detail) {
            const handlers = this.#listeners.get(eventName);
            if (handlers) for (const fn of handlers) { try { fn(detail); } catch (_err) { /* one listener's failure must not break others */ } }
        }
        on(eventName, handler) {
            if (!this.#listeners.has(eventName)) this.#listeners.set(eventName, new Set());
            this.#listeners.get(eventName).add(handler);
        }

        /**
         * M364 addition: configurable ICE servers. Previously hardcoded
         * to iceServers:[] (no STUN/TURN at all — disclosed at Stage 2
         * Gate 1 as a real, inherited limitation likely to cause
         * cross-network connection failures). Defaults now to Google's
         * public STUN servers (free, no credentials required, standard
         * practice) — a deliberate, disclosed behavior IMPROVEMENT for
         * every existing caller, not a silent change: STUN-only still
         * fails the same way empty iceServers did for symmetric NAT/
         * strict firewalls, but fixes the common case. TURN (which
         * requires real, operator-provided credentials this environment
         * does not have) remains opt-in via configureIceServers() —
         * never fabricated or defaulted.
         */
        #iceServers = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
        configureIceServers(servers) {
            if (!Array.isArray(servers)) return { success: false, reason: "servers must be an array of RTCIceServer objects." };
            this.#iceServers = servers;
            return { success: true, iceServers: this.#iceServers.slice() };
        }
        getIceServers() { return this.#iceServers.slice(); }

        capabilities() {
            return {
                webRTC: typeof RTCPeerConnection !== "undefined",
                bluetoothDiscovery: typeof window.CozyOS.CozyConnect !== "undefined" && !!window.CozyOS.CozyConnect.bluetooth,
                wifiHotspotCreation: false,
                wifiDirect: false,
                usbNetworking: false
            };
        }

        async createHost({ tracks = [] } = {}) {
            if (typeof RTCPeerConnection === "undefined") {
                return { success: false, reason: "WebRTC (RTCPeerConnection) is not available in this browser." };
            }
            const connectionId = `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const pc = new RTCPeerConnection({ iceServers: this.#iceServers });
            const channel = pc.createDataChannel("cozy-collab");
            const entry = { pc, channel, state: "creating-offer", remoteStreams: [] };
            this.#connections.set(connectionId, entry);

            this.#wireChannel(connectionId, channel);
            this.#wireMediaObservability(connectionId, pc);
            this.#attachTracks(pc, tracks);

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            return await new Promise((resolve) => {
                if (pc.iceGatheringState === "complete") {
                    resolve({ success: true, connectionId, offerCode: JSON.stringify(pc.localDescription) });
                    return;
                }
                pc.onicegatheringstatechange = () => {
                    if (pc.iceGatheringState === "complete") {
                        resolve({ success: true, connectionId, offerCode: JSON.stringify(pc.localDescription) });
                    }
                };
            });
        }

        async joinHost(offerCode, { tracks = [] } = {}) {
            if (typeof RTCPeerConnection === "undefined") {
                return { success: false, reason: "WebRTC (RTCPeerConnection) is not available in this browser." };
            }
            let offer;
            try { offer = JSON.parse(offerCode); } catch (_err) { return { success: false, reason: "The provided pairing code is not real, valid offer data." }; }

            const connectionId = `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const pc = new RTCPeerConnection({ iceServers: this.#iceServers });
            const entry = { pc, channel: null, state: "joining", remoteStreams: [] };
            this.#connections.set(connectionId, entry);

            pc.ondatachannel = (event) => {
                entry.channel = event.channel;
                this.#wireChannel(connectionId, event.channel);
            };
            this.#wireMediaObservability(connectionId, pc);
            this.#attachTracks(pc, tracks);

            await pc.setRemoteDescription(offer);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            return await new Promise((resolve) => {
                if (pc.iceGatheringState === "complete") {
                    resolve({ success: true, connectionId, answerCode: JSON.stringify(pc.localDescription) });
                    return;
                }
                pc.onicegatheringstatechange = () => {
                    if (pc.iceGatheringState === "complete") {
                        resolve({ success: true, connectionId, answerCode: JSON.stringify(pc.localDescription) });
                    }
                };
            });
        }

        async completeHostPairing(connectionId, answerCode) {
            const entry = this.#connections.get(connectionId);
            if (!entry) return { success: false, reason: `No real connection with id "${connectionId}".` };
            let answer;
            try { answer = JSON.parse(answerCode); } catch (_err) { return { success: false, reason: "The provided answer code is not real, valid data." }; }
            await entry.pc.setRemoteDescription(answer);
            entry.state = "connecting";
            return { success: true };
        }

        /**
         * #attachTracks(pc, tracks) — Milestone 362 Stage 2 addition. Real
         * pc.addTrack() for each provided MediaStreamTrack, before the
         * offer/answer is created (the only point WebRTC allows a track
         * to be included in the initial SDP without a renegotiation
         * round-trip). `tracks` is an array of {track, stream} pairs, or
         * plain MediaStreamTrack instances (stream inferred as a new
         * MediaStream if omitted). Never fabricates a track — an empty
         * or omitted `tracks` array preserves the exact, original,
         * data-channel-only behavior byte-for-byte.
         */
        #attachTracks(pc, tracks) {
            if (!Array.isArray(tracks) || !tracks.length) return;
            for (const item of tracks) {
                const track = item && item.track ? item.track : item;
                const stream = item && item.stream ? item.stream : undefined;
                if (track && typeof pc.addTrack === "function") {
                    try { stream ? pc.addTrack(track, stream) : pc.addTrack(track); }
                    catch (_err) { /* a track failing to attach must not break the whole connection attempt */ }
                }
            }
        }

        /**
         * #wireMediaObservability(connectionId, pc) — Milestone 362 Stage 2
         * addition. Real, standard RTCPeerConnection events:
         *   - ontrack: fires with genuine remote MediaStreams the moment
         *     the other side's tracks arrive. Accumulated in the entry's
         *     own remoteStreams array and emitted as "remote-track".
         *   - oniceconnectionstatechange / onconnectionstatechange: real
         *     browser-reported connection health, emitted as
         *     "ice-state-changed" / "connection-state-changed" so a
         *     caller can observe reconnection/failure without polling.
         * Never invents a state — every value emitted here is read
         * directly off the real pc object.
         */
        #wireMediaObservability(connectionId, pc) {
            pc.ontrack = (event) => {
                const entry = this.#connections.get(connectionId);
                if (entry) {
                    for (const stream of event.streams) {
                        if (!entry.remoteStreams.includes(stream)) entry.remoteStreams.push(stream);
                    }
                }
                this.#emit("remote-track", { connectionId, streams: event.streams, kind: event.track ? event.track.kind : null });
            };
            pc.oniceconnectionstatechange = () => {
                this.#emit("ice-state-changed", { connectionId, iceConnectionState: pc.iceConnectionState });
            };
            if ("onconnectionstatechange" in pc) {
                pc.onconnectionstatechange = () => {
                    this.#emit("connection-state-changed", { connectionId, connectionState: pc.connectionState });
                };
            }
        }

        /** addTrack(connectionId, track, stream) — Milestone 362 Stage 2 addition. Adds a track to an ALREADY-established connection (e.g. turning the camera on mid-call). Real pc.addTrack(); the caller is responsible for real renegotiation afterward (createRenegotiationOffer() below) — this method never silently renegotiates on its own, since that requires a fresh round-trip through signaling this file does not own. */
        addTrack(connectionId, track, stream) {
            const entry = this.#connections.get(connectionId);
            if (!entry) return { success: false, reason: `No real connection with id "${connectionId}".` };
            if (typeof entry.pc.addTrack !== "function") return { success: false, reason: "addTrack is not available on this RTCPeerConnection." };
            try {
                const sender = stream ? entry.pc.addTrack(track, stream) : entry.pc.addTrack(track);
                return { success: true, needsRenegotiation: true, sender: !!sender };
            } catch (err) { return { success: false, reason: err.message || "addTrack failed." }; }
        }

        /** removeTrack(connectionId, track) — real pc.removeTrack() via the matching RTCRtpSender, found by comparing .track to the real track instance. Same renegotiation caveat as addTrack(). */
        removeTrack(connectionId, track) {
            const entry = this.#connections.get(connectionId);
            if (!entry) return { success: false, reason: `No real connection with id "${connectionId}".` };
            const sender = entry.pc.getSenders ? entry.pc.getSenders().find((s) => s.track === track) : null;
            if (!sender) return { success: false, reason: "No matching real sender found for this track." };
            try { entry.pc.removeTrack(sender); return { success: true, needsRenegotiation: true }; }
            catch (err) { return { success: false, reason: err.message || "removeTrack failed." }; }
        }

        /** createRenegotiationOffer(connectionId) — real createOffer()/setLocalDescription() after addTrack()/removeTrack() changed the connection's tracks. The resulting offerCode must be sent through the same signaling channel (Stage 1's Firebase-based signaling) as the original offer — this file does not perform signaling itself, consistent with its own scope. */
        async createRenegotiationOffer(connectionId) {
            const entry = this.#connections.get(connectionId);
            if (!entry) return { success: false, reason: `No real connection with id "${connectionId}".` };
            try {
                const offer = await entry.pc.createOffer();
                await entry.pc.setLocalDescription(offer);
                return { success: true, offerCode: JSON.stringify(entry.pc.localDescription) };
            } catch (err) { return { success: false, reason: err.message || "Renegotiation offer failed." }; }
        }
        /** applyRenegotiationAnswer(connectionId, answerCode) — the other side's real answer to a renegotiation offer. */
        async applyRenegotiationAnswer(connectionId, answerCode) {
            const entry = this.#connections.get(connectionId);
            if (!entry) return { success: false, reason: `No real connection with id "${connectionId}".` };
            try { const answer = JSON.parse(answerCode); await entry.pc.setRemoteDescription(answer); return { success: true }; }
            catch (err) { return { success: false, reason: err.message || "Applying renegotiation answer failed." }; }
        }

        /** getRemoteStreams(connectionId) — real MediaStreams accumulated from this connection's own ontrack events. Never fabricates a stream; returns an empty array until the remote side's tracks genuinely arrive. */
        getRemoteStreams(connectionId) {
            const entry = this.#connections.get(connectionId);
            return entry ? entry.remoteStreams.slice() : [];
        }

        /** getPeerConnectionState(connectionId) — real, read directly off the RTCPeerConnection: iceConnectionState, connectionState (where supported), signalingState. Never a second, shadow state machine. */
        getPeerConnectionState(connectionId) {
            const entry = this.#connections.get(connectionId);
            if (!entry) return { state: "not-found" };
            return {
                state: entry.state,
                iceConnectionState: entry.pc.iceConnectionState,
                connectionState: "connectionState" in entry.pc ? entry.pc.connectionState : "unsupported-in-this-browser",
                signalingState: entry.pc.signalingState
            };
        }

        #wireChannel(connectionId, channel) {
            channel.onopen = () => { const entry = this.#connections.get(connectionId); if (entry) entry.state = "connected"; this.#emit("device-connected", { connectionId }); };
            channel.onclose = () => { const entry = this.#connections.get(connectionId); if (entry) entry.state = "disconnected"; this.#emit("device-disconnected", { connectionId }); };
            channel.onmessage = (event) => { this.#emit("message-received", { connectionId, data: event.data }); };
        }

        sendMessage(connectionId, text) {
            const entry = this.#connections.get(connectionId);
            if (!entry || !entry.channel || entry.channel.readyState !== "open") {
                return { success: false, reason: "No real, open data channel for this connection." };
            }
            entry.channel.send(text);
            return { success: true };
        }

        sendFile(connectionId, filename, content) {
            const entry = this.#connections.get(connectionId);
            if (!entry || !entry.channel || entry.channel.readyState !== "open") {
                return { success: false, reason: "No real, open data channel for this connection." };
            }
            entry.channel.send(JSON.stringify({ type: "file", filename, content }));
            return { success: true };
        }

        getConnectionState(connectionId) {
            const entry = this.#connections.get(connectionId);
            return entry ? { state: entry.state } : { state: "not-found" };
        }

        disconnect(connectionId) {
            const entry = this.#connections.get(connectionId);
            if (!entry) return { success: false, reason: "No real connection found." };
            if (entry.channel) entry.channel.close();
            entry.pc.close();
            this.#connections.delete(connectionId);
            return { success: true };
        }

        listConnections() {
            return Array.from(this.#connections.entries()).map(([id, e]) => ({ id, state: e.state }));
        }

        async discoverNearbyDevices() {
            const connect = window.CozyOS.CozyConnect;
            if (!connect || !connect.bluetooth || typeof connect.bluetooth.scan !== "function") {
                return { success: false, reason: "CozyConnect's Bluetooth provider is not loaded." };
            }
            return connect.bluetooth.scan();
        }

        createWifiHotspot() { return { success: false, reason: "Not implemented - browsers have no API to create or configure a Wi-Fi hotspot." }; }
        connectWifiDirect() { return { success: false, reason: "Not implemented - browsers have no Wi-Fi Direct API." }; }
        shareUSBNetwork() { return { success: false, reason: "Not implemented - browsers have no USB networking configuration API." }; }
        sharePrinter() { return { success: false, reason: "Not implemented - no real printer-sharing protocol is integrated." }; }

        getVersion() { return "1.2.0"; }
        getId() { return "LiveHotspotEngine"; }
        getDependencies() { return ["CozyConnect"]; }
    }

    window.CozyOS.LiveHotspotEngine = new CozyLiveHotspotEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/engines/collaboration/live-hotspot-engine.js",
                name: "LiveHotspotEngine", category: "Living Engine",
                description: "Real peer-to-peer collaboration via genuine RTCPeerConnection with manual SDP-exchange pairing (no signaling server exists in this repository, so this is the real, working mechanism). Wi-Fi hotspot creation/Wi-Fi Direct/USB networking are honestly not implemented - no browser API exists for any of them."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
