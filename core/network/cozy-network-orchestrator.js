/**
 * ── CozyOS ENTERPRISE NETWORK SPECIFICATION V4.2 ──
 * FILE: core/network/cozy-network-orchestrator.js
 * STATUS: FROZEN PUBLIC INTERFACE INTERCEPTOR
 *
 * V4.2 changelog over V4.1 (additive — no breaking changes):
 *   [ADDITIVE] Event Privacy Levels (§ 3.2c): meta.privacyLevel, one of
 *              EVENT_PRIVACY_LEVEL. VENUE_ONLY and ROOM_ONLY are
 *              genuinely enforced via topology membership. PUBLIC is a
 *              no-op. LEADERS_ONLY/PRIVATE are passed through untouched
 *              for OurCozy Live / CozyIdentity to enforce, since
 *              resolving "who is a leader" is identity/business logic
 *              this module does not own — same boundary already
 *              established for Audience Routing's identity-based types.
 *              IMPORTANT ASYMMETRY: unlike an unrecognized
 *              audience.type (fails OPEN — it's enrichment metadata),
 *              an unrecognized privacyLevel fails CLOSED (drops the
 *              message) because privacy is a security boundary. See
 *              EVENT_PRIVACY_LEVEL doc comment.
 *              Applies to both emergency and non-emergency traffic —
 *              an explicit privacy scope is intentional sender scope,
 *              not an access-policy block, so Emergency Broadcast does
 *              not bypass it (same reasoning as why emergencies still
 *              honor explicit targetNodeId). Storage Node replication
 *              is exempt (redundancy copies are not audience-facing).
 *
 * V4.1 changelog over V4 (breaking changes called out explicitly per
 * Freeze Policy — a certified contract should change additively where
 * possible, and any break must be stated, not silently shipped):
 *
 *   [BUGFIX]   _resolveOptimalTransports declared `zoneId` and
 *              `sessionId` parameters that were never referenced
 *              anywhere in the filter body — zone/session-based
 *              routing was silently non-functional in V4. Removed
 *              the dead parameters; room/zone targeting is now
 *              implemented for real via the existing topology
 *              mechanism (see Audience Routing below).
 *   [BREAKING] registerAINode(languageCode, nodeInfo) is replaced by
 *              registerAINode(nodeType, nodeInfo). V4 only supported
 *              language-keyed nodes; AI Node Types (below) requires
 *              nodes to be organized by type first. There is no safe
 *              way to keep the old 2-arg shape working unambiguously
 *              alongside the new one, so this is a genuine break, not
 *              an additive change. resolveAINode/getAINodes signatures
 *              changed to match (see § 3.12).
 *   [ADDITIVE] Audience Routing (§ 3.2b), Device Classes (§ 3.11a),
 *              AI Node Types (§ 3.12), Storage Nodes (§ 3.20),
 *              Time Machine sequencing (§ 3.9, extended), Dynamic AI
 *              Distribution (§ 3.12), hardened Emergency Broadcast
 *              (§ 3.3).
 *   [NO CHANGE NEEDED] Future Satellite Gateway: already achievable
 *              today by implementing ICozyTransportV2 and calling
 *              registerTransport() — no orchestrator change required,
 *              noted here rather than adding unused speculative code.
 *
 * V4 additions over V3 (unchanged from original header):
 *   [1]  Topology awareness        — hierarchical node graph (Hub→Building→Floor→Room→Seat)
 *   [2]  Automatic host election   — leader failover without manual intervention
 *   [3]  Congestion control        — adaptive traffic shaping under load
 *   [4]  Network segmentation      — fully isolated event partitions on shared infrastructure
 *   [5]  Geographic awareness      — venue coordinate metadata for routing efficiency
 *   [6]  Media synchronization     — sequence numbers + master clock alignment
 *   [7]  Capability negotiation    — device joins declare support; host adapts
 *   [8]  Priority broadcast        — Priority-0 Emergency above all QoS tiers
 *   [9]  Transport security policy — requiresIdentity / requiresEncryption contracts
 *   [10] Scheduler hook            — recovery timers delegated to CozyScheduler when available
 */

"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// § 0. SHARED CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

export const QoS_PRIORITY = Object.freeze({
    EMERGENCY_BROADCAST: 0,   // [V4] Pre-empts everything — disaster / safety alerts
    CRITICAL_AUDIO:      1,   // Real-time Audio Streaming
    LIVE_SUBTITLES:      2,   // Real-time Multilingual Captions
    TRANSLATION_TEXT:    3,   // Translation Frame Vectors
    CHAT_MESSAGING:      4,   // Interactive Local Peer Chat
    MARKETPLACE_DATA:    5,   // Offline Marketplace & Sync Transactions
});

export const TRANSPORT_STATUS = Object.freeze({
    CONNECTED:    "CONNECTED",
    DEGRADED:     "DEGRADED",
    TESTING:      "TESTING",
    DISCONNECTED: "DISCONNECTED",
});

export const POWER_SOURCE = Object.freeze({
    AC:      "AC",
    SOLAR:   "SOLAR",
    BATTERY: "BATTERY",
    UPS:     "UPS",
    UNKNOWN: "UNKNOWN",
});

/** [V4] Host election roles */
export const HOST_ROLE = Object.freeze({
    MAIN:     "MAIN",
    REGIONAL: "REGIONAL",
    PEER:     "PEER",
});

/** [V4] Congestion thresholds */
const CONGESTION = Object.freeze({
    NORMAL:   "NORMAL",    // < 60 % buffer utilisation
    MODERATE: "MODERATE",  // 60–80 %
    SEVERE:   "SEVERE",    // > 80 %
});

/**
 * [V4.1] Audience Routing target types.
 * ROOM/ZONE are enforced at the network layer via topology (a room or
 * zone maps to a real topology node, so restricting delivery to it is
 * a genuine transport-routing decision).
 * All other types (GROUP, LANGUAGE beyond the existing single-language
 * meta.languageCode field, USER, MODERATORS, HOSTS, SECURITY, LEADERS,
 * CUSTOM) require resolving WHO belongs to that audience — an identity/
 * business-logic concern this module does not own (consistent with the
 * existing identity-token passthrough contract in § 3.18: "It NEVER
 * authenticates, validates, or decodes tokens"). For those types, the
 * audience descriptor is stamped onto the outgoing payload verbatim so
 * a higher layer (e.g. OurCozy Live, or the receiving client) can apply
 * the actual filtering. This module never fabricates that resolution.
 */
export const AUDIENCE_TYPE = Object.freeze({
    ALL:        "ALL",
    ROOM:       "ROOM",
    ZONE:       "ZONE",
    GROUP:      "GROUP",
    LANGUAGE:   "LANGUAGE",
    USER:       "USER",
    MODERATORS: "MODERATORS",
    HOSTS:      "HOSTS",
    SECURITY:   "SECURITY",
    LEADERS:    "LEADERS",
    CUSTOM:     "CUSTOM",
});

/** [V4.1] Audience types enforced via real topology-based routing. */
const TOPOLOGY_ENFORCED_AUDIENCE_TYPES = Object.freeze([AUDIENCE_TYPE.ROOM, AUDIENCE_TYPE.ZONE]);

/**
 * [V4.2] Event Privacy Levels — a distinct concept from Audience Routing.
 * Audience Routing answers "who is this message FOR"; Privacy Level
 * answers "how exposed is this message allowed to be, from a security
 * standpoint". Only VENUE_ONLY and ROOM_ONLY map to decisions this
 * module can genuinely make (topology membership). LEADERS_ONLY and
 * PRIVATE require resolving identity/authorization, which belongs to
 * OurCozy Live / CozyIdentity, not this module — consistent with the
 * existing identity-token passthrough contract (§ 3.18).
 *
 * SECURITY-CRITICAL ASYMMETRY WITH AUDIENCE_TYPE: an unrecognized
 * audience.type fails OPEN (delivers unrestricted, with a warning),
 * because audience is enrichment metadata, not an access boundary.
 * An unrecognized privacyLevel fails CLOSED (drops the message
 * entirely, with a warning), because privacyLevel IS an access
 * boundary — failing open here would silently broadcast something the
 * sender explicitly tried to restrict. Do not make these consistent
 * with each other; the asymmetry is intentional.
 */
export const EVENT_PRIVACY_LEVEL = Object.freeze({
    PUBLIC:       "PUBLIC",       // Anyone connected may receive.
    VENUE_ONLY:   "VENUE_ONLY",   // Only devices physically part of this venue's topology.
    ROOM_ONLY:    "ROOM_ONLY",    // Only a specific room (requires a room reference).
    LEADERS_ONLY: "LEADERS_ONLY", // Not network-enforceable — passed through.
    PRIVATE:      "PRIVATE",      // Not network-enforceable — passed through.
});

/** [V4.2] Privacy levels this module can genuinely enforce via topology. */
const NETWORK_ENFORCED_PRIVACY_LEVELS = Object.freeze([EVENT_PRIVACY_LEVEL.VENUE_ONLY, EVENT_PRIVACY_LEVEL.ROOM_ONLY]);

/**
 * [V4.1] Device classification labels. Purely descriptive metadata —
 * this module does not branch core routing logic on device class
 * (routing operates on transports, not individual devices), but
 * consuming layers can use getDevicesByClass() to build role-aware UI
 * or coordination logic.
 */
export const DEVICE_CLASS = Object.freeze({
    LIVE_HUB:             "LIVE_HUB",
    REGIONAL_HUB:         "REGIONAL_HUB",
    CHURCH_HUB:           "CHURCH_HUB",
    TRANSLATOR_DEVICE:    "TRANSLATOR_DEVICE",
    AI_DEVICE:            "AI_DEVICE",
    CAMERA_DEVICE:        "CAMERA_DEVICE",
    AUDIO_DEVICE:         "AUDIO_DEVICE",
    DISPLAY_SCREEN:       "DISPLAY_SCREEN",
    VIEWER_PHONE:         "VIEWER_PHONE",
    ADMINISTRATOR_PHONE:  "ADMINISTRATOR_PHONE",
    VOLUNTEER_PHONE:      "VOLUNTEER_PHONE",
});

/**
 * [V4.1] AI node specializations. Nodes are now organized primarily by
 * type, not just language — most types are language-agnostic (e.g.
 * VISION, ATTENDANCE, OCR); only some (SPEECH, TRANSLATION, BIBLE,
 * VOICE) meaningfully carry a languageCode.
 */
export const AI_NODE_TYPE = Object.freeze({
    SPEECH:          "SPEECH",
    TRANSLATION:     "TRANSLATION",
    BIBLE:           "BIBLE",
    VISION:          "VISION",
    ATTENDANCE:      "ATTENDANCE",
    MEETING:         "MEETING",
    SUMMARY:         "SUMMARY",
    OCR:             "OCR",
    VOICE:           "VOICE",
    NOISE_REDUCTION: "NOISE_REDUCTION",
});

// ─────────────────────────────────────────────────────────────────────────────
// § 1. TRANSPORT INTERFACE  (V3 contract preserved, V4 additive)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extended Interface for Hardware-Agnostic Core Transports.
 * Validated across: Raspberry Pi, ESP32 Gateways, Android, Mini PCs,
 * Linux, and custom Live Hubs.
 */
export class ICozyTransportV2 {
    constructor(id) {
        if (this.constructor === ICozyTransportV2) {
            throw new TypeError(
                "Cannot instantiate abstract interface class directly."
            );
        }
        this.id     = id;
        this.status = TRANSPORT_STATUS.DISCONNECTED;

        // Comprehensive Capability Profiling
        this.capabilities = {
            supportsAudio:      false,
            supportsVideo:      false,
            supportsBroadcast:  false,
            supportsMesh:       false,
            maxBandwidthMbps:   0,
            estimatedLatencyMs: 999,
            offline:            true,
        };

        /**
         * Transport Policy Contract
         * [V3] Content / QoS / language routing
         * [V4] Security contracts — declared only; never authenticated here
         */
        this.policy = {
            allowedQoS:          [],     // [] = accepts all
            allowedContentTypes: [],     // [] = accepts all
            languageCodes:       [],     // [] = all languages
            requiresIdentity:    false,  // [V4]
            requiresEncryption:  false,  // [V4]
            requiresTrustedDevice: false,// [V4]
        };

        // Real-Time Health Telemetry Metrics Matrix
        this.healthMetrics = {
            signalStrength: 100,
            latency:          0,
            packetLoss:       0,
            jitter:           0,
            bandwidth:        0,
            batteryImpact:    0,
            reliability:    1.0,
        };

        // Adaptive recovery bookkeeping
        this._degradationCount  = 0;
        this._recoveryTimerMs   = 30_000;
    }

    async initialize()          { throw new Error("Method missing."); }
    async send(payloadEnvelope) { throw new Error("Method missing."); }
    async probe()               { return false; }
    async getMetrics()          { return this.healthMetrics; }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 2. TOPOLOGY NODE  [V4]
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Represents one node in the venue topology tree.
 *
 * Hierarchy: Hub → Building → Floor → Room → SeatSection
 *
 * [V4.1] `type` may also be "zone" for Audience Routing purposes — a
 * zone is just a topology node like any other; it is not a distinct
 * mechanism. This is a documentation extension only, not a runtime
 * restriction (the field was always a plain string).
 *
 * @typedef {{
 *   nodeId:     string,
 *   type:       "hub"|"building"|"floor"|"room"|"seat_section"|"zone",
 *   parentId:   string|null,
 *   label:      string,
 *   geo?:       { lat: number, lng: number, altitudeM?: number },
 *   transportIds: string[],
 * }} TopologyNode
 */

// ─────────────────────────────────────────────────────────────────────────────
// § 3. ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────

class CozyNetworkOrchestrator {

    // ── Private state ─────────────────────────────────────────────────────────

    #transports            = new Map();  // id → ICozyTransportV2
    #storeAndForwardBuffer = [];
    #timeOffsetMs          = 0;
    #mediaSyncSequence     = 0;          // [V4] global fallback sequence (no sessionId case)
    #sessionSequences      = new Map();  // [V4.1] sessionId → monotonic per-session counter
    #emergencyMode         = false;
    #discoveredDevices     = new Map();  // deviceId → DeviceRecord
    #aiNodes               = new Map();  // [V4.1] nodeType → Map<nodeId, AINodeRecord>
    #recoveryTimers        = new Map();  // transportId → timer handle | scheduler key
    #powerState            = {
        source:         POWER_SOURCE.UNKNOWN,
        batteryPercent: 100,
        solarWatts:     0,
    };

    // [V4] Topology
    #topology              = new Map();  // nodeId → TopologyNode
    #topologyRoot          = null;       // root nodeId

    // [V4] Host election
    #hostTable             = new Map();  // hostId → { id, role, priority, lastSeen, address }
    #localHostId           = null;
    #localRole             = HOST_ROLE.PEER;

    // [V4] Network segments (isolated event partitions)
    #segments              = new Map();  // segmentId → SegmentConfig

    // [V4] Congestion state
    #congestionLevel       = CONGESTION.NORMAL;
    #congestionBufferCap   = 500;       // max buffered payloads before congestion kicks in

    // [V4] Capability registry
    #deviceCapabilities    = new Map();  // deviceId → CapabilitySet

    // [V4.1] Storage Nodes — guaranteed-delivery redundancy targets
    #storageNodes           = new Map(); // storageNodeId → StorageNodeConfig

    constructor() {
        if (window?.CozyOS?.NetworkV2) return window.CozyOS.NetworkV2;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.1  Transport registration
    // ─────────────────────────────────────────────────────────────────────────

    registerTransport(transportInstance) {
        if (!(transportInstance instanceof ICozyTransportV2)) {
            throw new TypeError(
                "Must implement ICozyTransportV2 standard specification."
            );
        }
        this.#transports.set(transportInstance.id, transportInstance);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.2  Payload routing
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Route a payload through the optimal transport set.
     *
     * [V4] Respects segment isolation, topology path constraints,
     *      congestion level, emergency broadcast pre-emption,
     *      capability negotiation, and security policy contracts.
     * [V4.1] Also respects Audience Routing (ROOM/ZONE topology
     *      enforcement) and replicates matching traffic to registered
     *      Storage Nodes for failover redundancy. Emergency broadcasts
     *      now bypass ALL policy-level filtering, not just congestion
     *      (see _resolveOptimalTransports).
     */
    async routePayload(payloadEnvelope) {
        const meta = payloadEnvelope.meta ?? {};

        // [V4] Emergency broadcast pre-empts all congestion controls
        const isEmergency = meta.qos === QoS_PRIORITY.EMERGENCY_BROADCAST;

        // [V4] Segment isolation guard
        if (meta.segmentId && !this.#segments.has(meta.segmentId)) {
            console.warn(
                `[CozyNetwork] Payload dropped: unknown segmentId "${meta.segmentId}".`
            );
            return false;
        }

        // [V4] Congestion: shed low-priority traffic when network is under load
        if (!isEmergency && this.#congestionLevel === CONGESTION.SEVERE) {
            if (meta.qos >= QoS_PRIORITY.CHAT_MESSAGING) {
                this.#storeAndForwardBuffer.push(payloadEnvelope);
                return false;
            }
        }
        if (!isEmergency && this.#congestionLevel === CONGESTION.MODERATE) {
            if (meta.qos >= QoS_PRIORITY.MARKETPLACE_DATA) {
                this.#storeAndForwardBuffer.push(payloadEnvelope);
                return false;
            }
        }

        // [V4.1] Media synchronization / Time Machine — stamp sequence,
        // aligned clock, and session/speaker/room context on EVERY payload.
        const stamped = this.#stampMediaSync(payloadEnvelope);

        // [V3] Battery-aware payload annotation
        const shaped = this.#applyBatteryShaping(stamped);

        // [V4.1] Resolve Audience Routing → candidate topology node id(s).
        // ROOM/ZONE are enforced here; other audience types are not
        // topology-restricted (see AUDIENCE_TYPE doc comment) — they are
        // simply carried through in `shaped.meta.audience` already, since
        // stampMediaSync/applyBatteryShaping both preserve unknown meta
        // fields via spread.
        const targetNodeIds = this.#resolveAudienceTargetNodeIds(meta) ??
            (meta.targetNodeId ? [meta.targetNodeId] : [null]);

        const seenTransportIds = new Set();
        let targetTransports = [];
        for (const nodeId of targetNodeIds) {
            const resolved = this._resolveOptimalTransports(
                meta.qos,
                meta.contentType,
                meta.languageCode,
                meta.segmentId,
                nodeId,
                meta.identityToken,
                isEmergency,
            );
            for (const t of resolved) {
                if (!seenTransportIds.has(t.id)) {
                    seenTransportIds.add(t.id);
                    targetTransports.push(t);
                }
            }
        }

        // [V4.2] Event Privacy Level enforcement. Applied to the audience-
        // resolved target set, for BOTH emergency and non-emergency traffic
        // (privacy scoping is intentional sender-specified scope, like
        // explicit topology targeting — emergencies bypass ACCESS POLICY,
        // not intentional scope). Storage Node replication is NOT subject
        // to this filter — see § 3.20 header for why redundancy copies are
        // exempt from audience-facing access rules.
        targetTransports = this.#applyPrivacyFilter(targetTransports, meta);

        // [V4.1] Storage Node replication — guaranteed-delivery redundancy.
        // Bypasses normal filtering by design: a storage node's purpose is
        // to hold a complete offline copy for failover, not to serve as an
        // audience-facing transport subject to the same access policy.
        for (const t of this.#resolveStorageNodeTransports(meta.contentType)) {
            if (!seenTransportIds.has(t.id)) {
                seenTransportIds.add(t.id);
                targetTransports.push(t);
            }
        }

        if (targetTransports.length === 0) {
            this.#storeAndForwardBuffer.push(shaped);
            this.#updateCongestion();

            if (!this.#emergencyMode) {
                const anyLive = Array.from(this.#transports.values())
                    .some(t => t.status === TRANSPORT_STATUS.CONNECTED ||
                               t.status === TRANSPORT_STATUS.DEGRADED);
                if (!anyLive) {
                    this.#emergencyMode = true;
                    console.warn(
                        "[CozyNetwork] Emergency mode activated. Buffering all payloads."
                    );
                }
            }
            return false;
        }

        if (this.#emergencyMode) {
            this.#emergencyMode = false;
            console.info("[CozyNetwork] Emergency mode cleared. Transports restored.");
            setTimeout(() => this.flushForwardBuffer(), 0);
        }

        const executionPromises = targetTransports.map(t =>
            t.send(shaped).catch(err => {
                this._handleTransportDegradation(t.id, err);
                return false;
            })
        );

        const results = await Promise.all(executionPromises);
        this.#updateCongestion();
        return results.some(r => r === true);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.2b  Audience Routing  [V4.1]
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Resolves meta.audience into an array of topology node ids to route
     * through, for the audience types this module can genuinely enforce
     * (ROOM, ZONE). Returns null when there is no topology-level
     * restriction to apply (audience absent, type ALL, or a
     * non-topology audience type that must be handled by a higher layer).
     *
     * An unrecognized audience.type is treated as a soft error (warned,
     * not thrown) and falls back to no restriction — routePayload is a
     * hot per-message path, and this metadata is enriching, not
     * structurally required, so failing open (with a warning) is more
     * appropriate here than failing the send entirely.
     *
     * @param {object} meta
     * @returns {string[]|null}
     */
    #resolveAudienceTargetNodeIds(meta) {
        const audience = meta?.audience;
        if (!audience || typeof audience !== "object") return null;

        const type = audience.type;
        if (type === undefined || type === AUDIENCE_TYPE.ALL) return null;

        if (!Object.values(AUDIENCE_TYPE).includes(type)) {
            console.warn(`[CozyNetwork] Unrecognized audience.type "${type}" — treating as unrestricted.`);
            return null;
        }

        if (!TOPOLOGY_ENFORCED_AUDIENCE_TYPES.includes(type)) {
            // GROUP / LANGUAGE / USER / MODERATORS / HOSTS / SECURITY /
            // LEADERS / CUSTOM: not a network-layer routing decision.
            // The descriptor is already carried through in the payload
            // meta for a higher layer to resolve — see class header.
            return null;
        }

        const ids = Array.isArray(audience.ids) ? audience.ids.filter(id => typeof id === "string" && id.length > 0) : [];
        return ids.length > 0 ? ids : null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.2c  Event Privacy Levels  [V4.2]
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Returns the set of transport ids that are part of the local venue's
     * registered topology (i.e. appear in some topology node's
     * transportIds). Used to enforce VENUE_ONLY: a transport not declared
     * anywhere in the topology tree is treated as not "of this venue" —
     * e.g. a future off-site bridging transport (satellite/internet
     * gateway) that was registered with registerTransport() but never
     * placed in the topology graph.
     *
     * @returns {Set<string>}
     */
    #venueLocalTransportIds() {
        const ids = new Set();
        for (const node of this.#topology.values()) {
            for (const tid of (node.transportIds || [])) ids.add(tid);
        }
        return ids;
    }

    /**
     * Enforces meta.privacyLevel against an already-resolved transport
     * list. See EVENT_PRIVACY_LEVEL doc comment for the fail-open vs.
     * fail-closed asymmetry with Audience Routing — this method fails
     * CLOSED (returns an empty array) for anything it cannot confidently
     * enforce as specified, because privacy is a security boundary.
     *
     * @param {ICozyTransportV2[]} transports
     * @param {object} meta
     * @returns {ICozyTransportV2[]}
     */
    #applyPrivacyFilter(transports, meta) {
        const level = meta?.privacyLevel;
        if (!level) return transports; // no privacy restriction specified

        if (!Object.values(EVENT_PRIVACY_LEVEL).includes(level)) {
            console.warn(`[CozyNetwork] Unrecognized privacyLevel "${level}" — failing CLOSED (dropping all targets). Privacy is a security boundary, unlike audience.type.`);
            return [];
        }

        if (level === EVENT_PRIVACY_LEVEL.PUBLIC) {
            return transports;
        }

        if (level === EVENT_PRIVACY_LEVEL.VENUE_ONLY) {
            const venueIds = this.#venueLocalTransportIds();
            return transports.filter(t => venueIds.has(t.id));
        }

        if (level === EVENT_PRIVACY_LEVEL.ROOM_ONLY) {
            const roomId = meta.privacyRoomId ?? meta.room ?? meta.targetNodeId ?? null;
            if (!roomId) {
                console.warn("[CozyNetwork] privacyLevel ROOM_ONLY requires meta.privacyRoomId (or meta.room/meta.targetNodeId) — failing CLOSED.");
                return [];
            }
            return transports.filter(t => this.#transportServesNode(t.id, roomId));
        }

        // LEADERS_ONLY / PRIVATE: not network-enforceable. Pass through
        // unrestricted at this layer — the privacyLevel tag survives in
        // the payload (meta is always carried forward via spread), and
        // OurCozy Live / CozyIdentity are responsible for actually
        // restricting who receives it once it arrives.
        return transports;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.3  Transport resolution
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * [V4.1] Signature change from V4: removed the dead `zoneId` and
     * `sessionId` parameters (they were never used in the filter body —
     * a real bug in V4). Room/zone targeting is now handled by the
     * caller via `targetNodeId` (see routePayload's Audience Routing
     * resolution above), which actually works via the topology graph.
     *
     * [V4.1] Added `isEmergency`: when true, ALL policy-level filters
     * (QoS allowlist, content type allowlist, language allowlist,
     * segment isolation, identity requirement) are bypassed, so a
     * Priority-0 broadcast cannot be silently dropped by a transport's
     * access policy. The liveness filter (must be CONNECTED/DEGRADED)
     * is never bypassed — sending over a dead transport isn't a policy
     * choice, it's physically impossible. Explicit topology targeting
     * (targetNodeId) is still honored even for emergencies, since a
     * caller who explicitly scoped an emergency to one area presumably
     * meant to.
     */
    _resolveOptimalTransports(
        qos, contentType, languageCode,
        segmentId, targetNodeId, identityToken, isEmergency = false
    ) {
        const activeCandidates = Array.from(this.#transports.values())
            .filter(t =>
                t.status === TRANSPORT_STATUS.CONNECTED ||
                t.status === TRANSPORT_STATUS.DEGRADED
            );

        // [V4] Topology-aware candidate filtering
        const topologyFiltered = targetNodeId
            ? activeCandidates.filter(t =>
                this.#transportServesNode(t.id, targetNodeId)
              )
            : activeCandidates;

        if (isEmergency) {
            // Bypass all policy filters; still sort by reliability.
            return topologyFiltered
                .slice()
                .sort((a, b) => b.healthMetrics.reliability - a.healthMetrics.reliability);
        }

        return topologyFiltered
            .filter(transport => {

                // V2: audio capability
                if (qos === QoS_PRIORITY.CRITICAL_AUDIO &&
                    !transport.capabilities.supportsAudio) return false;

                // V2: packet-loss guard for real-time audio
                if (transport.healthMetrics.packetLoss > 15 &&
                    qos === QoS_PRIORITY.CRITICAL_AUDIO) return false;

                // V3: QoS allowlist
                if (transport.policy.allowedQoS.length > 0 &&
                    !transport.policy.allowedQoS.includes(qos)) return false;

                // V3: content type allowlist
                if (contentType &&
                    transport.policy.allowedContentTypes.length > 0 &&
                    !transport.policy.allowedContentTypes.includes(contentType)) return false;

                // V3: language-aware routing
                if (languageCode &&
                    transport.policy.languageCodes.length > 0 &&
                    !transport.policy.languageCodes.includes(languageCode)) return false;

                // [V4] Security policy: identity token required
                if (transport.policy.requiresIdentity && !identityToken) return false;

                // [V4] Segment isolation: transport must belong to segment
                if (segmentId) {
                    const seg = this.#segments.get(segmentId);
                    if (seg?.allowedTransportIds?.length > 0 &&
                        !seg.allowedTransportIds.includes(transport.id)) return false;
                }

                return true;
            })
            .sort((a, b) => b.healthMetrics.reliability - a.healthMetrics.reliability);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.4  Adaptive transport recovery
    // ─────────────────────────────────────────────────────────────────────────

    _handleTransportDegradation(id, error) {
        const transport = this.#transports.get(id);
        if (!transport) return;

        transport.status = TRANSPORT_STATUS.DEGRADED;
        transport.healthMetrics.reliability *= 0.8;
        transport._degradationCount++;

        if (this.#recoveryTimers.has(id)) {
            clearTimeout(this.#recoveryTimers.get(id));
        }

        const delay = Math.min(
            transport._recoveryTimerMs *
                Math.pow(2, transport._degradationCount - 1),
            300_000
        );

        // [V4] Delegate to CozyScheduler when available; fall back to setTimeout
        const scheduler = window?.CozyOS?.Scheduler;
        if (scheduler && typeof scheduler.scheduleOnce === "function") {
            const key = scheduler.scheduleOnce(
                `transport_recovery_${id}`,
                delay,
                () => this.#probeTransportRecovery(id)
            );
            this.#recoveryTimers.set(id, key);
        } else {
            const handle = setTimeout(
                () => this.#probeTransportRecovery(id),
                delay
            );
            this.#recoveryTimers.set(id, handle);
        }
    }

    async #probeTransportRecovery(id) {
        const transport = this.#transports.get(id);
        if (!transport) return;

        transport.status = TRANSPORT_STATUS.TESTING;
        let recovered = false;

        try { recovered = await transport.probe(); }
        catch (_) { recovered = false; }

        if (recovered) {
            transport.status = TRANSPORT_STATUS.CONNECTED;
            transport.healthMetrics.reliability = Math.min(
                transport.healthMetrics.reliability + 0.2,
                1.0
            );
            transport._degradationCount = 0;
            this.#recoveryTimers.delete(id);
            console.info(`[CozyNetwork] Transport "${id}" recovered.`);
            await this.flushForwardBuffer();
        } else {
            transport.status = TRANSPORT_STATUS.DEGRADED;
            this._handleTransportDegradation(id, new Error("probe_failed"));
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.5  Topology awareness  [V4]
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Register or update a topology node.
     * Nodes form a tree rooted at the first node registered without a parentId.
     *
     * @param {TopologyNode} node
     */
    registerTopologyNode(node) {
        if (!node?.nodeId || !node.type) {
            throw new TypeError(
                "[CozyNetwork] registerTopologyNode: nodeId and type are required."
            );
        }
        this.#topology.set(node.nodeId, { ...node });
        if (!node.parentId && !this.#topologyRoot) {
            this.#topologyRoot = node.nodeId;
        }
    }

    /**
     * Return the ordered path from a node up to the topology root.
     * Used by the router to avoid duplicate transmissions over parent links.
     *
     * @param {string} nodeId
     * @returns {string[]}  [ nodeId, parentId, grandparentId, ... , rootId ]
     */
    getTopologyPath(nodeId) {
        const path = [];
        let current = nodeId;
        const visited = new Set();
        while (current && !visited.has(current)) {
            visited.add(current);
            path.push(current);
            const node = this.#topology.get(current);
            current = node?.parentId ?? null;
        }
        return path;
    }

    /**
     * Returns true if a transport is declared on a node that lies on the
     * path between the orchestrator and the target node.
     *
     * @param {string} transportId
     * @param {string} targetNodeId
     * @returns {boolean}
     */
    #transportServesNode(transportId, targetNodeId) {
        const path = this.getTopologyPath(targetNodeId);
        return path.some(nodeId => {
            const node = this.#topology.get(nodeId);
            return node?.transportIds?.includes(transportId);
        });
    }

    /**
     * Return a frozen snapshot of the full topology map.
     *
     * @returns {Readonly<object[]>}
     */
    getTopology() {
        return Object.freeze(Array.from(this.#topology.values()));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.6  Automatic host election  [V4]
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Initialise this node's host record and register it in the host table.
     *
     * @param {{ hostId: string, role: string, priority: number, address: string }} config
     */
    initLocalHost(config) {
        if (!config?.hostId) {
            throw new TypeError("[CozyNetwork] initLocalHost: hostId is required.");
        }
        this.#localHostId = config.hostId;
        this.#localRole   = config.role ?? HOST_ROLE.PEER;
        this.#hostTable.set(config.hostId, {
            id:       config.hostId,
            role:     this.#localRole,
            priority: config.priority ?? 100,
            address:  config.address  ?? "local",
            lastSeen: Date.now(),
        });
    }

    /**
     * Announce or update a remote host's heartbeat.
     * Call this when a heartbeat frame is received from another node.
     *
     * @param {{ id: string, role: string, priority: number, address: string }} hostInfo
     */
    receiveHostHeartbeat(hostInfo) {
        if (!hostInfo?.id) return;
        this.#hostTable.set(hostInfo.id, {
            ...hostInfo,
            lastSeen: Date.now(),
        });
    }

    /**
     * Trigger leader election.
     * The host with the lowest priority value (highest precedence) that is
     * still alive (seen within ttlMs) becomes MAIN.
     *
     * @param {number} [ttlMs=10000]
     */
    electLeader(ttlMs = 10_000) {
        const cutoff  = Date.now() - ttlMs;
        const alive   = Array.from(this.#hostTable.values())
            .filter(h => h.lastSeen >= cutoff)
            .sort((a, b) => a.priority - b.priority);

        if (alive.length === 0) return;

        const newLeaderId = alive[0].id;

        for (const [id, host] of this.#hostTable.entries()) {
            host.role = (id === newLeaderId)
                ? HOST_ROLE.MAIN
                : HOST_ROLE.REGIONAL;
        }

        if (this.#localHostId) {
            const local = this.#hostTable.get(this.#localHostId);
            if (local) this.#localRole = local.role;
        }

        console.info(
            `[CozyNetwork] Leader elected: ${newLeaderId} ` +
            `(local role: ${this.#localRole})`
        );
    }

    /** @returns {{ role: string, hostId: string|null }} */
    getLocalHostInfo() {
        return Object.freeze({
            hostId: this.#localHostId,
            role:   this.#localRole,
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.7  Congestion control  [V4]
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Recalculate congestion level based on buffer utilisation.
     * Called after every route attempt and after buffer flushes.
     */
    #updateCongestion() {
        const utilisation =
            this.#storeAndForwardBuffer.length / this.#congestionBufferCap;

        if (utilisation >= 0.8) {
            if (this.#congestionLevel !== CONGESTION.SEVERE) {
                this.#congestionLevel = CONGESTION.SEVERE;
                console.warn("[CozyNetwork] Congestion SEVERE — shedding low-priority traffic.");
            }
        } else if (utilisation >= 0.6) {
            if (this.#congestionLevel !== CONGESTION.MODERATE) {
                this.#congestionLevel = CONGESTION.MODERATE;
                console.warn("[CozyNetwork] Congestion MODERATE — deferring marketplace traffic.");
            }
        } else {
            this.#congestionLevel = CONGESTION.NORMAL;
        }
    }

    /** @returns {string}  One of CONGESTION values */
    getCongestionLevel() {
        return this.#congestionLevel;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.8  Network segmentation  [V4]
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Register an isolated event segment on shared infrastructure.
     *
     * @param {{
     *   segmentId:          string,
     *   label:              string,
     *   allowedTransportIds?: string[],
     *   allowedSessionIds?:   string[],
     * }} config
     */
    registerSegment(config) {
        if (!config?.segmentId) {
            throw new TypeError("[CozyNetwork] registerSegment: segmentId is required.");
        }
        this.#segments.set(config.segmentId, {
            segmentId:           config.segmentId,
            label:               config.label ?? config.segmentId,
            allowedTransportIds: config.allowedTransportIds ?? [],
            allowedSessionIds:   config.allowedSessionIds   ?? [],
        });
    }

    removeSegment(segmentId) {
        this.#segments.delete(segmentId);
    }

    getSegments() {
        return Object.freeze(Array.from(this.#segments.values()));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.9  Media synchronisation / Time Machine  [V4, extended V4.1]
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Stamp a media sequence number and a synchronized timestamp onto the
     * payload envelope so all language streams remain aligned, plus
     * (V4.1) session/speaker/room context needed for later seek/replay
     * features. Returns a new object — never mutates the caller's envelope.
     *
     * [V4.1] Previously gated to contentType audio/subtitles/translation
     * only. Time Machine requires every packet to carry this context, so
     * the gate is removed — stamping now always happens. This is a safe,
     * additive change for existing consumers: it only adds fields.
     *
     * [V4.1] Sequence numbering is now per-session when meta.sessionId is
     * present (via #sessionSequences), so seeking within one session is
     * meaningful even if other sessions are running concurrently. When no
     * sessionId is given, falls back to the original global counter for
     * backward compatibility.
     *
     * NOTE: this module only stamps the metadata that makes seeking
     * *possible*. It does not implement seek/replay/search itself — that
     * requires persisted, queryable storage this module does not have.
     * Fabricating that capability here would be exactly the kind of
     * "claim work not performed" this codebase's architecture explicitly
     * forbids. That capability belongs on top of Storage Nodes (§ 3.20)
     * or a higher layer such as OurCozy Live.
     *
     * @param {object} payloadEnvelope
     * @returns {object}
     */
    #stampMediaSync(payloadEnvelope) {
        const meta = payloadEnvelope.meta ?? {};

        let seq;
        if (meta.sessionId) {
            const current = this.#sessionSequences.get(meta.sessionId) ?? 0;
            seq = current + 1;
            this.#sessionSequences.set(meta.sessionId, seq);
        } else {
            this.#mediaSyncSequence++;
            seq = this.#mediaSyncSequence;
        }

        return {
            ...payloadEnvelope,
            meta: {
                ...meta,
                mediaSeq:      seq,
                syncTimestamp: this.getSynchronizedTime(),
                // Passed through only if the caller supplied them —
                // never fabricated when absent.
                speaker: meta.speaker ?? null,
                room:    meta.room ?? meta.targetNodeId ?? null,
            },
        };
    }

    /**
     * Expose the current global media sequence counter (payloads with no
     * sessionId) for external alignment checks.
     *
     * @returns {number}
     */
    getMediaSyncSequence() {
        return this.#mediaSyncSequence;
    }

    /**
     * [V4.1] Expose the current sequence counter for a specific session.
     * Returns 0 if the session has not had any payloads stamped yet.
     *
     * @param {string} sessionId
     * @returns {number}
     */
    getSessionSequence(sessionId) {
        return this.#sessionSequences.get(sessionId) ?? 0;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.10  Capability negotiation  [V4]
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Register the declared capabilities of a device as it joins the network.
     * The orchestrator uses this to avoid pushing unsupported payloads.
     *
     * @param {string} deviceId
     * @param {{
     *   supportsAudio:     boolean,
     *   supportsVideo:     boolean,
     *   supportsSubtitles: boolean,
     *   supportsChat:      boolean,
     *   supportsMarketplace: boolean,
     *   languageCodes:     string[],
     * }} capabilities
     */
    registerDeviceCapabilities(deviceId, capabilities) {
        if (!deviceId) {
            throw new TypeError(
                "[CozyNetwork] registerDeviceCapabilities: deviceId is required."
            );
        }
        this.#deviceCapabilities.set(deviceId, { ...capabilities, registeredAt: Date.now() });
    }

    /**
     * Return the declared capabilities of a device, or null if unknown.
     *
     * @param {string} deviceId
     * @returns {object|null}
     */
    getDeviceCapabilities(deviceId) {
        return this.#deviceCapabilities.get(deviceId) ?? null;
    }

    /**
     * Return true if a device has declared support for the given content type.
     * Defaults to true when capabilities are unknown (graceful degradation).
     *
     * @param {string} deviceId
     * @param {string} contentType
     * @returns {boolean}
     */
    deviceSupports(deviceId, contentType) {
        const caps = this.#deviceCapabilities.get(deviceId);
        if (!caps) return true; // unknown device — do not block
        const map = {
            audio:       caps.supportsAudio,
            video:       caps.supportsVideo,
            subtitles:   caps.supportsSubtitles,
            chat:        caps.supportsChat,
            marketplace: caps.supportsMarketplace,
        };
        return map[contentType] ?? true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.11  Device discovery  (V3 preserved)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * [V4.1] `device.deviceClass`, if supplied, must be one of
     * DEVICE_CLASS. This is validated (unlike most other optional
     * fields on this record) because it is a controlled, finite enum
     * intended to power role-aware coordination — silently accepting a
     * typo'd class would make getDevicesByClass() unreliable.
     */
    registerDiscoveredDevice(device) {
        if (!device?.id) throw new TypeError("[CozyNetwork] Device must have an id.");
        if (device.deviceClass !== undefined && !Object.values(DEVICE_CLASS).includes(device.deviceClass)) {
            throw new TypeError(`[CozyNetwork] registerDiscoveredDevice: unrecognized deviceClass "${device.deviceClass}".`);
        }
        this.#discoveredDevices.set(device.id, { ...device, seenAt: Date.now() });
    }

    getDiscoveredDevices() {
        return Object.freeze(Array.from(this.#discoveredDevices.values()));
    }

    /**
     * [V4.1] Returns all currently discovered devices with the given
     * deviceClass. Purely descriptive — does not affect routing.
     *
     * @param {string} deviceClass
     * @returns {ReadonlyArray<object>}
     */
    getDevicesByClass(deviceClass) {
        return Object.freeze(
            Array.from(this.#discoveredDevices.values()).filter(d => d.deviceClass === deviceClass)
        );
    }

    pruneStaleDevices(ttlMs = 60_000) {
        const cutoff = Date.now() - ttlMs;
        for (const [id, dev] of this.#discoveredDevices.entries()) {
            if (dev.seenAt < cutoff) this.#discoveredDevices.delete(id);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.12  AI workload distribution  [V4.1 — BREAKING CHANGE from V4]
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Registers an AI node under a specific AI_NODE_TYPE.
     *
     * BREAKING CHANGE from V4: the old signature was
     * registerAINode(languageCode, nodeInfo) — nodes were keyed only by
     * language, with an implicit single node per language. AI Node
     * Types requires organizing nodes by type first, and Dynamic AI
     * Distribution (below) requires supporting MULTIPLE nodes per
     * type+language so load can be balanced across them. There is no
     * way to keep both call shapes working unambiguously (a string
     * languageCode and a string nodeType are indistinguishable), so
     * this is a genuine break, not an additive change.
     *
     * @param {string} nodeType — one of AI_NODE_TYPE
     * @param {{ nodeId: string, languageCode?: string, load?: number, [key: string]: * }} nodeInfo
     */
    registerAINode(nodeType, nodeInfo) {
        if (!Object.values(AI_NODE_TYPE).includes(nodeType)) {
            throw new TypeError(`[CozyNetwork] registerAINode: unrecognized nodeType "${nodeType}".`);
        }
        if (!nodeInfo?.nodeId) {
            throw new TypeError("[CozyNetwork] registerAINode: nodeInfo.nodeId is required.");
        }
        if (!this.#aiNodes.has(nodeType)) {
            this.#aiNodes.set(nodeType, new Map());
        }
        this.#aiNodes.get(nodeType).set(nodeInfo.nodeId, {
            ...nodeInfo,
            load: nodeInfo.load ?? 0,
            registeredAt: Date.now(),
        });
    }

    /**
     * [V4.1] Reports a node's current load, for Dynamic AI Distribution.
     * No-op (returns false) if the node isn't registered.
     *
     * @param {string} nodeType
     * @param {string} nodeId
     * @param {number} load
     * @returns {boolean}
     */
    updateAINodeLoad(nodeType, nodeId, load) {
        const bucket = this.#aiNodes.get(nodeType);
        const node = bucket?.get(nodeId);
        if (!node) return false;
        node.load = load;
        return true;
    }

    /**
     * [V4.1] Dynamic AI Distribution: resolves the least-loaded available
     * node of a given type (optionally matching a languageCode), instead
     * of a fixed assignment. Returns null if no matching node exists.
     *
     * @param {string} nodeType
     * @param {string} [languageCode]
     * @returns {object|null}
     */
    resolveAINode(nodeType, languageCode = null) {
        const bucket = this.#aiNodes.get(nodeType);
        if (!bucket || bucket.size === 0) return null;

        const candidates = Array.from(bucket.values())
            .filter(n => !languageCode || n.languageCode === languageCode);

        if (candidates.length === 0) return null;

        return candidates.reduce((best, n) => (n.load < best.load ? n : best), candidates[0]);
    }

    /**
     * Returns registered AI nodes. If nodeType is given, returns a frozen
     * array of that type's nodes; otherwise returns a frozen object keyed
     * by nodeType, each value a frozen array.
     *
     * @param {string} [nodeType]
     * @returns {ReadonlyArray<object>|Readonly<Object<string, object[]>>}
     */
    getAINodes(nodeType = null) {
        if (nodeType) {
            const bucket = this.#aiNodes.get(nodeType);
            return Object.freeze(bucket ? Array.from(bucket.values()) : []);
        }
        const out = {};
        for (const [type, bucket] of this.#aiNodes.entries()) {
            out[type] = Object.freeze(Array.from(bucket.values()));
        }
        return Object.freeze(out);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.13  Battery & power awareness  (V3 preserved)
    // ─────────────────────────────────────────────────────────────────────────

    updatePowerState(state) {
        if (!state || typeof state !== "object") {
            throw new TypeError(
                "[CozyNetwork] updatePowerState: state must be an object."
            );
        }
        this.#powerState = {
            source:         state.source        ?? POWER_SOURCE.UNKNOWN,
            batteryPercent: state.batteryPercent ?? 100,
            solarWatts:     state.solarWatts     ?? 0,
        };
    }

    getPowerState() {
        return Object.freeze({ ...this.#powerState });
    }

    #applyBatteryShaping(payloadEnvelope) {
        const pct = this.#powerState.batteryPercent;
        let batteryHint = "NORMAL";
        if (pct < 15)       batteryHint = "CRITICAL";
        else if (pct < 30)  batteryHint = "LOW";
        if (batteryHint === "NORMAL") return payloadEnvelope;
        return {
            ...payloadEnvelope,
            meta: { ...payloadEnvelope.meta, batteryHint },
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.14  Clock synchronisation  (V2 preserved)
    // ─────────────────────────────────────────────────────────────────────────

    synchronizeSystemClock(masterTimestamp) {
        this.#timeOffsetMs = masterTimestamp - Date.now();
    }

    getSynchronizedTime() {
        return Date.now() + this.#timeOffsetMs;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.15  Store-and-Forward buffer flush  (V2 preserved)
    // ─────────────────────────────────────────────────────────────────────────

    async flushForwardBuffer() {
        if (this.#storeAndForwardBuffer.length === 0) return;

        const transientQueue = [...this.#storeAndForwardBuffer];
        this.#storeAndForwardBuffer = [];

        for (const bufferedPayload of transientQueue) {
            const success = await this.routePayload(bufferedPayload);
            if (!success) {
                this.#storeAndForwardBuffer.push(bufferedPayload);
            }
        }

        this.#updateCongestion();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.16  Degradation handler  (V3 preserved)
    // ─────────────────────────────────────────────────────────────────────────
    // Already fully V4-upgraded in § 3.4 above.

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.17  Emergency mode accessor  (V3 preserved)
    // ─────────────────────────────────────────────────────────────────────────

    isEmergencyMode() {
        return this.#emergencyMode;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.18  Identity token passthrough contract  [V4]
    // ─────────────────────────────────────────────────────────────────────────
    //
    // Identity tokens carried in payloadEnvelope.meta.identityToken:
    //   • Face recognition result  (optional, consent-gated)
    //   • QR code attendance token
    //   • Anonymous guest token
    //   • Device trust certificate
    //   • Moderator auth token
    //
    // The orchestrator routes or rejects based on transport.policy.requiresIdentity.
    // It NEVER authenticates, validates, or decodes tokens — that is CozyIdentity.
    //
    // [V4.1] The same principle now explicitly extends to Audience Routing's
    // identity/role-based types (USER, MODERATORS, HOSTS, SECURITY, LEADERS,
    // GROUP, CUSTOM) — see AUDIENCE_TYPE doc comment. This module carries
    // that data, it does not interpret it.

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.19  Diagnostics
    // ─────────────────────────────────────────────────────────────────────────

    getDiagnostics() {
        const transportSnapshot = {};
        for (const [id, t] of this.#transports.entries()) {
            transportSnapshot[id] = Object.freeze({
                status:      t.status,
                reliability: t.healthMetrics.reliability,
                packetLoss:  t.healthMetrics.packetLoss,
                latency:     t.healthMetrics.latency,
                policy:      Object.freeze({ ...t.policy }),
            });
        }

        let aiNodeCount = 0;
        for (const bucket of this.#aiNodes.values()) aiNodeCount += bucket.size;

        return Object.freeze({
            transportCount:    this.#transports.size,
            bufferedPayloads:  this.#storeAndForwardBuffer.length,
            discoveredDevices: this.#discoveredDevices.size,
            aiNodes:           aiNodeCount,
            storageNodes:      this.#storageNodes.size,
            emergencyMode:     this.#emergencyMode,
            congestionLevel:   this.#congestionLevel,
            mediaSyncSequence: this.#mediaSyncSequence,
            topologyNodes:     this.#topology.size,
            segments:          this.#segments.size,
            hosts:             this.#hostTable.size,
            localRole:         this.#localRole,
            timeOffsetMs:      this.#timeOffsetMs,
            powerState:        Object.freeze({ ...this.#powerState }),
            transports:        Object.freeze(transportSnapshot),
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3.20  Storage Nodes  [V4.1] — offline redundancy for failover
    // ─────────────────────────────────────────────────────────────────────────
    //
    // A Storage Node is a designated transport that should receive a
    // guaranteed copy of matching traffic, so that if the Main Host dies,
    // another node already has a complete copy of relevant content. This
    // module only manages WHICH transport gets guaranteed delivery of
    // WHICH content types — it does not itself store, index, or retrieve
    // any content. That is the storage node device's own job (or a
    // higher layer's), consistent with this module's transport/routing/
    // failover/sync responsibility, not storage/history.

    /**
     * Registers a transport as a Storage Node for one or more content
     * types. An empty/omitted retainedContentTypes list means "replicate
     * everything" (consistent with the [] = accepts-all convention used
     * elsewhere in this file, e.g. transport.policy.allowedQoS).
     *
     * @param {{ nodeId: string, transportId: string, retainedContentTypes?: string[] }} config
     */
    registerStorageNode(config) {
        if (!config?.nodeId) {
            throw new TypeError("[CozyNetwork] registerStorageNode: nodeId is required.");
        }
        if (!config?.transportId) {
            throw new TypeError("[CozyNetwork] registerStorageNode: transportId is required.");
        }
        this.#storageNodes.set(config.nodeId, {
            nodeId:               config.nodeId,
            transportId:          config.transportId,
            retainedContentTypes: Array.isArray(config.retainedContentTypes) ? [...config.retainedContentTypes] : [],
            registeredAt:         Date.now(),
        });
    }

    unregisterStorageNode(nodeId) {
        return this.#storageNodes.delete(nodeId);
    }

    getStorageNodes() {
        return Object.freeze(Array.from(this.#storageNodes.values()));
    }

    /**
     * Resolves the set of live transports belonging to registered Storage
     * Nodes whose retainedContentTypes matches the given contentType (or
     * whose list is empty, meaning "all"). Only CONNECTED/DEGRADED
     * transports are returned — a dead storage node can't receive
     * anything regardless of its configuration.
     *
     * @param {string} [contentType]
     * @returns {ICozyTransportV2[]}
     */
    #resolveStorageNodeTransports(contentType) {
        const matches = [];
        for (const node of this.#storageNodes.values()) {
            if (node.retainedContentTypes.length > 0 && contentType &&
                !node.retainedContentTypes.includes(contentType)) {
                continue;
            }
            const transport = this.#transports.get(node.transportId);
            if (transport && (transport.status === TRANSPORT_STATUS.CONNECTED ||
                               transport.status === TRANSPORT_STATUS.DEGRADED)) {
                matches.push(transport);
            }
        }
        return matches;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4. GLOBAL REGISTRATION
// ─────────────────────────────────────────────────────────────────────────────

if (!window.CozyOS) window.CozyOS = {};
if (!window.CozyOS.NetworkV2) {
    window.CozyOS.NetworkV2 = new CozyNetworkOrchestrator();
    Object.freeze(window.CozyOS.NetworkV2);
}
