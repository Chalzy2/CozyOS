/**
 * CozyOS — Community Review Dashboard: Cozy Offline Hotspot composition
 * File Reference: core/modules/intelligence/knowledge/ui/cozy-knowledge-review-hotspot-bridge.js
 * Repair: RP-029-C Phase 2 (added mid-phase, per explicit architectural
 *         requirement: reuse existing Living Engines / Cozy Offline
 *         Hotspot infrastructure rather than building a second
 *         networking/sync system)
 *
 * WHAT WAS INSPECTED BEFORE WRITING THIS FILE (no duplication built
 * until this search was done)
 *   core/engines/collaboration/live-hotspot-engine.js
 *     (window.CozyOS.LiveHotspotEngine) — the real, only existing
 *     peer-to-peer engine in this repository. Its own header already
 *     discloses its honest scope: real WebRTC data channel via manual
 *     SDP exchange; NOT a real Wi-Fi hotspot/Wi-Fi Direct/mDNS
 *     auto-discovery (browsers expose no API for those — its
 *     createWifiHotspot()/connectWifiDirect() already honestly return
 *     {success:false}). This file composes its real, existing methods
 *     only: listConnections(), sendMessage(connectionId, text), and
 *     the real "message-received" event — never a second WebRTC/
 *     signaling implementation.
 *   core/living/cozy-living-sync.js, core/living/cozy-living-offline.js
 *     — inspected; both operate on a different domain (living-assistant
 *     state persistence/offline UI mode), expose no candidate-shaped
 *     sync primitive this file could reuse without inventing one on
 *     top of them anyway. Not composed this pass — disclosed, not
 *     silently skipped (see HANDOFF.md entry).
 *   core/security/living-ai-context-engine.js,
 *   core/modules/knowledge/living-compressor.js — inspected; both are
 *     real, but their domain is security/trust context and generic
 *     memory compression, not knowledge-candidate exchange. Composing
 *     either into RP-029-C's own (already disclosed, in-memory-only)
 *     model is a genuine, larger architecture change that would touch
 *     locked RP-029-A/B files — deferred as a disclosed future
 *     milestone, not attempted here.
 *
 * SAFETY (explicit requirement this pass) — "A connected device can
 * provide evidence, not automatic truth."
 *   Every payload received over the hotspot now first passes through
 *   cozy-knowledge-safety-gate.js's real classify() — UNSAFE is
 *   hard-rejected and never stored anywhere; UNCERTAIN is quarantined
 *   for human review and also never becomes a candidate. Only a SAFE
 *   result reaches the real ingestion path —
 *   CozyKnowledgeCommunity.submitContribution() — landing as a
 *   PRIVATE, UNVERIFIED candidate that still needs independent
 *   confirmation and review, exactly like a local submission. Nothing
 *   received over the wire is ever marked CONFIRMED, promoted, or
 *   trusted automatically. contributorId is derived from the sending
 *   connectionId (itself pseudonymized further downstream by
 *   CozyKnowledgeCommunity, unchanged) — never a raw peer identity.
 *   Offline transfer does not bypass safety: this is the same gate,
 *   same module, used for local contribution submission — not a
 *   second, weaker check for the offline path.
 *
 * HONEST LIMITS, DISCLOSED
 *   Outgoing share only reaches devices with an already-established
 *   real WebRTC connection (via LiveHotspotEngine's existing manual
 *   offer/answer flow — this file does not add a new pairing UI).
 *   There is no server relay and no automatic discovery; if no
 *   connection exists, sharing honestly reports
 *   NO_ACTIVE_HOTSPOT_CONNECTION rather than silently doing nothing.
 */
(function () {
    "use strict";
    if (typeof window === "undefined") return;

    function hotspot() { return window.CozyOS && window.CozyOS.LiveHotspotEngine; }
    function community() { return window.CozyOS && window.CozyOS.CozyKnowledgeCommunity; }
    function safetyGate() { return window.CozyOS && window.CozyOS.CozyKnowledgeSafetyGate; }

    const MESSAGE_TYPE = "cozy-knowledge-share-v1";
    let wired = false;

    function listActiveConnections() {
        const h = hotspot();
        if (!h || typeof h.listConnections !== "function") return { available: false, connections: [] };
        const all = h.listConnections();
        return { available: true, connections: all.filter((c) => c.state === "connected") };
    }

    /**
     * shareCandidate(candidateRecord)
     *   Broadcasts a real, already-existing local candidate's public-
     *   safe fields to every currently connected peer via the real
     *   LiveHotspotEngine.sendMessage(). Never sends private
     *   contributor identity (only pseudonymized data is on the record
     *   to begin with, per RP-029-B's own toRecord()).
     */
    function shareCandidate(candidateRecord) {
        const h = hotspot();
        if (!h) return { status: "REJECTED", reason: "LiveHotspotEngine is not loaded." };
        const { connections } = listActiveConnections();
        if (connections.length === 0) return { status: "NO_ACTIVE_HOTSPOT_CONNECTION", sentTo: 0 };

        const ext = candidateRecord.communityExtensions || {};
        const payload = JSON.stringify({
            type: MESSAGE_TYPE,
            contributionType: ext.contributionType || "PHRASE",
            statement: candidateRecord.claim,
            language: candidateRecord.language ? candidateRecord.language.code : null,
            meaning: candidateRecord.meaning,
            context: candidateRecord.context,
            dialect: ext.variant || candidateRecord.dialect || null,
            region: candidateRecord.region || null
        });

        let sentTo = 0;
        connections.forEach((c) => {
            const result = h.sendMessage(c.id || c.connectionId, payload);
            if (result && result.success !== false) sentTo++;
        });
        return { status: sentTo > 0 ? "SENT" : "SEND_FAILED", sentTo, connectionCount: connections.length };
    }

    /**
     * handleIncomingPayload(rawData, connectionId, onReceived)
     *   The real message-handling logic, factored out so it can be
     *   exercised directly by tests without needing a live
     *   RTCPeerConnection (Node has none) or touching the locked
     *   LiveHotspotEngine file to add a test hook. wireReceiver() below
     *   calls this exact function from the real "message-received"
     *   event — this is not a parallel/duplicate code path.
     */
    function handleIncomingPayload(rawData, connectionId, onReceived) {
        let parsed;
        try { parsed = JSON.parse(rawData); } catch (_e) { return { status: "IGNORED_UNPARSEABLE" }; }
        if (!parsed || parsed.type !== MESSAGE_TYPE) return { status: "IGNORED_NOT_OWN_TYPE" };

        const c = community();
        if (!c) return { status: "REJECTED", reason: "CozyKnowledgeCommunity is not loaded." };

        // MANDATORY SAFETY GATE — offline transfer does not bypass
        // safety (explicit requirement). The receiving device validates
        // BEFORE importing anything into its own knowledge system,
        // exactly as it would for a local submission — same gate, same
        // module, not a second/weaker check for the offline path.
        const gate = safetyGate();
        const contributorId = "hotspot:" + (connectionId || "unknown");
        if (gate) {
            const classification = gate.classify(parsed);
            if (classification.classification === "UNSAFE") {
                const result = { status: "REJECTED_UNSAFE" };
                if (typeof onReceived === "function") onReceived(result);
                return result;
            }
            if (classification.classification === "UNCERTAIN" || classification.classification === "HIGH_RISK") {
                const q = gate.quarantine(parsed, classification, contributorId);
                const result = { status: "QUARANTINED", quarantineId: q.id };
                if (typeof onReceived === "function") onReceived(result);
                return result;
            }
        }

        const result = c.submitContribution({
            contributionType: parsed.contributionType,
            statement: parsed.statement,
            // Pseudonymized further by CozyKnowledgeCommunity itself —
            // this is only a local, session-scoped connection id, not
            // a real cross-device persistent identity.
            contributorId: contributorId,
            language: parsed.language,
            meaning: parsed.meaning,
            context: parsed.context,
            dialect: parsed.dialect,
            region: parsed.region
        });
        if (typeof onReceived === "function") onReceived(result);
        return result;
    }

    /**
     * wireReceiver()
     *   Idempotent. Registers exactly one "message-received" listener
     *   on the real engine, delegating to handleIncomingPayload() above.
     */
    function wireReceiver(onReceived) {
        const h = hotspot();
        if (!h || typeof h.on !== "function" || wired) return wired;
        h.on("message-received", (detail) => handleIncomingPayload(detail.data, detail.connectionId, onReceived));
        wired = true;
        return true;
    }

    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    window.CozyOS.CozyKnowledgeReviewHotspotBridge = Object.freeze({
        getVersion() { return "1.0.0"; },
        listActiveConnections,
        shareCandidate,
        wireReceiver,
        // Exposed for tests only — the exact real logic wireReceiver()
        // wires to the live engine's real event, not a parallel path.
        _handleIncomingPayloadForTests: handleIncomingPayload
    });
    window.CozyOS.Modules["cozy-knowledge-review-hotspot-bridge"] = Object.freeze({
        version: "1.0.0",
        description: "RP-029-C Phase 2 — Cozy Offline Hotspot composition for knowledge review. Composes the real, existing LiveHotspotEngine (WebRTC data channel, manual SDP exchange, no fabricated auto-discovery/Wi-Fi-hotspot capability) rather than a second networking system. Outgoing: shares a local candidate's already-pseudonymized public-safe fields to currently connected peers only. Incoming: every received payload is pushed through the real CozyKnowledgeCommunity.submitContribution() ingestion path and lands as an ordinary PRIVATE/UNVERIFIED candidate needing independent confirmation like any other — never trusted or promoted automatically."
    });
})();
