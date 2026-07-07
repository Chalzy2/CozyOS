/**
 * ── CozyOS ENTERPRISE SPEECH COORDINATION KERNEL ──
 * FILE: core/modules/speech/cozy-speech.js
 * VERSION: 2.1.0-ENTERPRISE
 *
 * Mission: Orchestrate every speech source, destination, session, stream,
 * pipeline, segment, device, language, and adapter across CozyOS.
 *
 * CozySpeech IS:
 *   Coordinator · Bookkeeper · Registry · Lifecycle manager · Diagnostics
 *
 * CozySpeech is NOT:
 *   Speech recognition · Synthesis · Translation · Audio processing ·
 *   Noise cancellation · Voice cloning · AI model · Codec · Streaming engine
 *   Those belong to registered adapters.
 *
 * Offline operation: MANDATORY
 * Internet support:  OPTIONAL
 *
 * V2 additions over V1:
 *   [1]  Session environment types  — church, school, hospital, emergency, …
 *   [2]  Richer source hierarchy    — wired, wireless, mixer, IP, satellite, …
 *   [3]  Richer destination types   — hearing aid, interpreter booth, vehicle, …
 *   [4]  Device class registry      — ESP32, Hub, Gateway, Hearing Aid, Drone, …
 *   [5]  Audio topology graph       — Source→Input→Pipeline→Channel→Stream→Dest→Device
 *   [6]  Audio zone registry        — Campus→Building→Floor→Hall→Room→Stage→Outdoor
 *   [7]  Speaker group registry     — Choir, Panel, Audience Mic, Remote, …
 *   [8]  Extended recording metadata — chapters, highlights, testimony type
 *   [9]  Device health registry     — muted, battery, cable, latency, packet loss
 *   [10] Event graph node registry  — every entity as a graph node + edge store
 *   [11] Expanded accessibility     — hearing, captions, interpreter, emergency override
 *   [12] Full integration contracts — CozyAI, CozyEmergency, CozySync, …
 *   [13] Offline-first sync metadata — localId, globalId, syncState, conflictState
 *   [14] Time synchronisation       — clock offset + per-entity sequence counters
 *
 * V2.1 additions over V2.0 (this revision):
 *   [15] Multiple simultaneous active speakers — replaces the single
 *        _activeSpeakerId bottleneck with an active-speaker set, so a
 *        pastor, interpreter, choir, and remote guest can all be
 *        marked active at the same time.
 *   [16] Expanded device-class vocabulary reference (DEVICE_CLASS).
 *   [17] Expanded, generic audio-topology node-type reference
 *        (TOPOLOGY_NODE_TYPE) — documents a deeper example chain
 *        (mic → mixer → DSP → noise filter → recognition → translation
 *        → synthesis → language channel → output → speaker) without
 *        the kernel enforcing or hard-coding any particular chain.
 *   [18] Expanded zone-type reference (ZONE_TYPE), including
 *        wing/section/seat-block/seat granularity.
 *   [19] Expanded device-health telemetry fields — signal strength,
 *        Bluetooth RSSI, Wi-Fi quality, PLC quality, overheating,
 *        CPU load, RAM usage, storage remaining, battery health/
 *        charging state, last heartbeat. Store-only; never interpreted.
 *   [20] Automatic event-graph node registration — every entity
 *        registered through the kernel (session, speaker, group,
 *        stream, language, channel, source, destination, pipeline,
 *        segment, device, zone, output, recording, profile, output
 *        group) is automatically mirrored into the event graph as a
 *        node, so any CozyOS module can query relationships without
 *        each caller having to remember to call registerGraphNode()
 *        itself.
 *   [21] Completed integration registry (§3.23) with an expanded,
 *        reference-only list of known/future CozyOS integrations.
 *   [22] NEW: Audio Profile registry (§3.24) — environment presets
 *        (church, classroom, hospital, courtroom, conference,
 *        outdoor_crusade, concert, emergency, radio, podcast) that
 *        store preferred routing/adapter defaults. CozySpeech only
 *        stores the profile; adapters are responsible for applying it.
 *   [23] NEW: Output Group registry (§3.25) — named groups of output
 *        references (e.g. "English Speakers", "Interpreter Booth",
 *        "Overflow Room", "Livestream") so a single stream can target
 *        many outputs without duplicating per-output configuration.
 *
 * Public API (frozen after registration) — full list in § 0 / § 4.
 */

"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// § 0. MODULE CONSTANTS & ENUMERATIONS
// ─────────────────────────────────────────────────────────────────────────────

const SPEECH_VERSION = "2.1.0-ENTERPRISE";

const SESSION_STATE = Object.freeze({
    CREATED:  "CREATED",
    ACTIVE:   "ACTIVE",
    PAUSED:   "PAUSED",
    STOPPED:  "STOPPED",
    ENDED:    "ENDED",
    ARCHIVED: "ARCHIVED",
});

/**
 * [V2-1] Session environment types — open-ended; custom values accepted.
 * Stored as a reference constant for documentation; not enforced by the kernel.
 */
const SESSION_ENV = Object.freeze({
    CHURCH:       "church",
    SCHOOL:       "school",
    CONFERENCE:   "conference",
    HOSPITAL:     "hospital",
    COURT:        "court",
    MEETING:      "meeting",
    EMERGENCY:    "emergency",
    MARKETPLACE:  "marketplace",
    PODCAST:      "podcast",
    BROADCAST:    "broadcast",
    PRIVATE_CALL: "private_call",
    CUSTOM:       "custom",
});

/** [V2-13] Offline-first sync states */
const SYNC_STATE = Object.freeze({
    LOCAL_ONLY: "local_only",
    PENDING:    "pending",
    SYNCED:     "synced",
    CONFLICT:   "conflict",
});

/**
 * [V2.1-16] Reference-only device class vocabulary. Not enforced —
 * registerDevice() accepts any string. Provided so callers/UI layers
 * have a discoverable, canonical vocabulary to draw from.
 */
const DEVICE_CLASS = Object.freeze({
    PHONE:              "phone",
    TABLET:             "tablet",
    LAPTOP:             "laptop",
    DESKTOP:            "desktop",
    MINI_PC:            "mini_pc",
    OURCOZY_HUB:        "ourcozy_hub",
    ESP32:              "esp32",
    RASPBERRY_PI:       "raspberry_pi",
    SERVER:             "server",
    GATEWAY:            "gateway",
    SATELLITE_TERMINAL: "satellite_terminal",

    WIRED_MICROPHONE:      "wired_microphone",
    WIRELESS_MICROPHONE:   "wireless_microphone",
    LAPEL_MICROPHONE:      "lapel_microphone",
    CHOIR_MICROPHONE:      "choir_microphone",
    BOUNDARY_MICROPHONE:   "boundary_microphone",
    CONFERENCE_MICROPHONE: "conference_microphone",

    MIXER:            "mixer",
    AUDIO_INTERFACE:  "audio_interface",
    AMPLIFIER:        "amplifier",
    DSP:              "dsp",

    HEARING_AID:         "hearing_aid",
    INTERPRETER_HEADSET: "interpreter_headset",
    BLUETOOTH_HEADSET:   "bluetooth_headset",
    USB_HEADSET:         "usb_headset",

    PA_SPEAKER:        "pa_speaker",
    CEILING_SPEAKER:   "ceiling_speaker",
    WALL_SPEAKER:      "wall_speaker",
    VEHICLE_SPEAKER:   "vehicle_speaker",
    BILLBOARD_SPEAKER: "billboard_speaker",

    SMART_TV:          "smart_tv",
    PROJECTOR:         "projector",
    LED_WALL:          "led_wall",
    MIRACAST_RECEIVER: "miracast_receiver",
    HDMI_DISPLAY:      "hdmi_display",

    CAMERA: "camera",
    DRONE:  "drone",
    CUSTOM: "custom",
});

/**
 * [V2.1-17] Reference-only audio topology node types. The kernel's
 * registerTopologyEdge() accepts arbitrary fromType/toType strings —
 * this constant simply documents a representative, generic chain so
 * new stages (e.g. a future noise-filter or synthesis stage) can be
 * inserted tomorrow without any kernel change.
 *
 * Example chain: MICROPHONE → MIXER → DSP → NOISE_FILTER →
 *   SPEECH_RECOGNITION → TRANSLATION → VOICE_SYNTHESIS →
 *   LANGUAGE_CHANNEL → OUTPUT → SPEAKER
 */
const TOPOLOGY_NODE_TYPE = Object.freeze({
    SOURCE:             "source",
    MICROPHONE:         "microphone",
    MIXER:              "mixer",
    DSP:                "dsp",
    NOISE_FILTER:       "noise_filter",
    SPEECH_RECOGNITION: "speech_recognition",
    TRANSLATION:        "translation",
    VOICE_SYNTHESIS:    "voice_synthesis",
    PIPELINE:           "pipeline",
    CHANNEL:            "channel",
    LANGUAGE_CHANNEL:   "language_channel",
    STREAM:             "stream",
    DESTINATION:        "destination",
    OUTPUT:             "output",
    SPEAKER_DEVICE:     "speaker",
    DEVICE:             "device",
    CUSTOM:             "custom",
});

/**
 * [V2.1-18] Reference-only zone type vocabulary, expanded to campus-
 * through-seat granularity. Not enforced — registerZone() accepts any
 * string for `type`.
 */
const ZONE_TYPE = Object.freeze({
    CAMPUS:     "campus",
    BUILDING:   "building",
    FLOOR:      "floor",
    WING:       "wing",
    HALL:       "hall",
    ROOM:       "room",
    STAGE:      "stage",
    SECTION:    "section",
    SEAT_BLOCK: "seat_block",
    SEAT:       "seat",
    CHOIR:      "choir",
    OUTDOOR:    "outdoor",
    OVERFLOW:   "overflow",
    VEHICLE:    "vehicle",
    REMOTE:     "remote",
    CUSTOM:     "custom",
});

/**
 * [V2-12 / V2.1-21] Reference-only list of known and anticipated
 * CozyOS integrations. registerIntegration() accepts any string name —
 * this constant exists purely so an integration contract can be
 * reserved/documented before the corresponding kernel is built.
 */
const KNOWN_INTEGRATIONS = Object.freeze({
    OURCOZY_LIVE:       "OurCozyLive",
    COZY_NETWORK:       "CozyNetwork",
    COZY_IDENTITY:      "CozyIdentity",
    COZY_STORAGE:       "CozyStorage",
    COZY_SYNC:          "CozySync",
    COZY_TRANSLATE:     "CozyTranslate",
    COZY_VISION:        "CozyVision",
    COZY_ATTENDANCE:    "CozyAttendance",
    COZY_ACCESSIBILITY: "CozyAccessibility",
    COZY_RECORDING:     "CozyRecording",
    COZY_ANALYTICS:     "CozyAnalytics",
    COZY_EMERGENCY:     "CozyEmergency",
    COZY_MARKETPLACE:   "CozyMarketplace",
    COZY_EDUCATION:     "CozyEducation",
    COZY_HEALTH:        "CozyHealth",
    COZY_JUSTICE:       "CozyJustice",
    COZY_FINANCE:       "CozyFinance",
    COZY_CLOUD:         "CozyCloud",
    COZY_AI:            "CozyAI",
});

/**
 * [V2.1-22] Reference-only audio profile environment presets.
 * registerProfile() accepts any string for `environment`.
 */
const PROFILE_ENV = Object.freeze({
    CHURCH:          "church",
    CLASSROOM:       "classroom",
    HOSPITAL:        "hospital",
    COURTROOM:       "courtroom",
    CONFERENCE:      "conference",
    OUTDOOR_CRUSADE: "outdoor_crusade",
    CONCERT:         "concert",
    EMERGENCY:       "emergency",
    RADIO:           "radio",
    PODCAST:         "podcast",
    CUSTOM:          "custom",
});

/** [V2-14] Per-entity sequence counter seeds */
let _clockOffsetMs      = 0;
let _speakerSeq         = 0;
let _streamSeq          = 0;
let _segmentSeq         = 0;
let _languageSeq        = 0;

// ─────────────────────────────────────────────────────────────────────────────
// § 1. PRIVATE UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function _uid(prefix) {
    try {
        if (typeof crypto !== "undefined" &&
            typeof crypto.randomUUID === "function") {
            return `${prefix}_${crypto.randomUUID()}`;
        }
        if (typeof crypto !== "undefined" &&
            typeof crypto.getRandomValues === "function") {
            const b = new Uint8Array(16);
            crypto.getRandomValues(b);
            return `${prefix}_` +
                Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
        }
    } catch (_) {}
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function _requireString(value, fieldName) {
    if (typeof value !== "string" || !value.trim()) {
        throw new TypeError(
            `[CozySpeech] ${fieldName} must be a non-empty string. ` +
            `Received: ${typeof value}`
        );
    }
}

function _requireSession(store, sessionId, allowedStates) {
    _requireString(sessionId, "sessionId");
    const session = store.get(sessionId);
    if (!session) {
        throw new Error(`[CozySpeech] Session "${sessionId}" not found.`);
    }
    if (allowedStates && !allowedStates.includes(session.state)) {
        throw new Error(
            `[CozySpeech] Session "${sessionId}" is in state "${session.state}". ` +
            `Required: ${allowedStates.join(" | ")}.`
        );
    }
    return session;
}

/** [V2-13] Attach offline-first sync metadata to any record config. */
function _syncMeta(config = {}) {
    return {
        localId:       config.localId       ?? _uid("local"),
        globalId:      config.globalId      ?? null,
        syncState:     config.syncState     ?? SYNC_STATE.LOCAL_ONLY,
        createdOffline: config.createdOffline ?? true,
        lastModified:  new Date().toISOString(),
        version:       config.version       ?? 1,
        conflictState: config.conflictState ?? null,
    };
}

/** [V2-14] Return the current synchronized timestamp. */
function _now() {
    return new Date(Date.now() + _clockOffsetMs).toISOString();
}

/**
 * [V2.1-20] Mirror an entity into the event graph as a node,
 * automatically. Uses the entity's own id as the graph node id so
 * lookups stay predictable (graphNodeId === entityId). Idempotent:
 * re-registering the same entity simply overwrites its node with
 * fresh label/session info. Never throws — this is a best-effort
 * bookkeeping mirror, not a required side effect, so a bad sessionId
 * or label must never block the entity's own registration.
 *
 * @param {string} entityType
 * @param {string} entityId
 * @param {?string} sessionId
 * @param {?string} label
 */
function _autoGraphNode(entityType, entityId, sessionId, label) {
    try {
        _graphNodes.set(entityId, Object.freeze({
            nodeId:     entityId,
            entityType: entityType,
            entityId:   entityId,
            sessionId:  sessionId ?? null,
            label:      label ?? "",
            createdAt:  _now(),
        }));
    } catch (_) {
        // Best-effort mirror only — never let graph bookkeeping break
        // the caller's own registration.
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 2. KERNEL REGISTRIES
// ─────────────────────────────────────────────────────────────────────────────

const _sessions        = new Map(); // sessionId      → SessionRecord
const _speakers        = new Map(); // speakerId      → SpeakerRecord
const _speakerGroups   = new Map(); // groupId        → SpeakerGroupRecord   [V2-7]
const _streams         = new Map(); // streamId       → StreamRecord
const _languages       = new Map(); // languageCode   → LanguageRecord
const _channels        = new Map(); // channelId      → ChannelRecord
const _sources         = new Map(); // sourceId       → SourceRecord
const _destinations    = new Map(); // destinationId  → DestinationRecord
const _pipelines       = new Map(); // pipelineId     → PipelineRecord
const _segments        = new Map(); // segmentId      → SegmentRecord
const _devices         = new Map(); // deviceId       → DeviceRecord
const _deviceHealth    = new Map(); // deviceId       → HealthRecord         [V2-9]
const _outputs         = new Map(); // outputId       → OutputRecord
const _outputGroups    = new Map(); // groupId        → OutputGroupRecord    [V2.1-23]
const _zones           = new Map(); // zoneId         → ZoneRecord           [V2-6]
const _profiles        = new Map(); // profileId      → ProfileRecord        [V2.1-22]
const _topology        = new Map(); // topologyId     → TopologyEdgeRecord   [V2-5]
const _accessibility   = new Map(); // id             → AccessibilityRecord
const _recordings      = new Map(); // recordingId    → RecordingRecord
const _timeline        = [];        // TimelineEvent[] — append-only
const _adapters        = new Map(); // adapterId      → AdapterRecord
const _plugins         = new Map(); // pluginId       → PluginRecord
const _integrations    = new Map(); // integrationId  → IntegrationRecord
const _graphNodes      = new Map(); // nodeId         → GraphNodeRecord      [V2-10]
const _graphEdges      = new Map(); // edgeId         → GraphEdgeRecord      [V2-10]

/**
 * [V2.1-15] Set of speakerIds currently marked active. Replaces the
 * V2.0 single `_activeSpeakerId` bottleneck — a pastor, interpreter,
 * choir, and remote guest can all be active simultaneously.
 * @type {Set<string>}
 */
const _activeSpeakerIds = new Set();

// ─────────────────────────────────────────────────────────────────────────────
// § 3. KERNEL IMPLEMENTATION
// ─────────────────────────────────────────────────────────────────────────────

const _kernel = {

    // ── § 3.1  SPEECH SESSION LIFECYCLE ──────────────────────────────────────

    /**
     * Create a new speech session.
     *
     * [V2-1] Supports environment type (church, school, hospital, …).
     * [V2-13] Offline-first sync metadata included on every record.
     * [V2.1-22] Optionally references an Audio Profile via profileId.
     *
     * @param {{
     *   sessionId?:    string,
     *   label?:        string,
     *   environment?:  string,   — SESSION_ENV value or custom string
     *   roomId?:       string,
     *   zoneId?:       string,
     *   segmentId?:    string,
     *   profileId?:    string,   — [V2.1-22] optional Audio Profile reference
     *   localId?:      string,
     *   globalId?:     string,
     * }} [config]
     * @returns {string} sessionId
     */
    createSpeechSession(config = {}) {
        const sessionId = config.sessionId || _uid("session");
        if (_sessions.has(sessionId)) {
            throw new Error(`[CozySpeech] Session "${sessionId}" already exists.`);
        }
        _sessions.set(sessionId, Object.freeze({
            sessionId,
            label:       config.label       ?? "",
            environment: config.environment ?? SESSION_ENV.CUSTOM,
            roomId:      config.roomId      ?? null,
            zoneId:      config.zoneId      ?? null,
            segmentId:   config.segmentId   ?? null,
            profileId:   config.profileId   ?? null,
            state:       SESSION_STATE.CREATED,
            createdAt:   _now(),
            startedAt:   null,
            pausedAt:    null,
            stoppedAt:   null,
            endedAt:     null,
            archivedAt:  null,
            ..._syncMeta(config),
        }));
        _autoGraphNode("session", sessionId, sessionId, config.label ?? "");
        return sessionId;
    },

    startSpeechSession(sessionId) {
        const s = _requireSession(_sessions, sessionId,
            [SESSION_STATE.CREATED, SESSION_STATE.STOPPED]);
        _sessions.set(sessionId, Object.freeze({
            ...s, state: SESSION_STATE.ACTIVE, startedAt: _now(),
            lastModified: _now(),
        }));
        return sessionId;
    },

    pauseSpeechSession(sessionId) {
        const s = _requireSession(_sessions, sessionId, [SESSION_STATE.ACTIVE]);
        _sessions.set(sessionId, Object.freeze({
            ...s, state: SESSION_STATE.PAUSED, pausedAt: _now(),
            lastModified: _now(),
        }));
        return sessionId;
    },

    resumeSpeechSession(sessionId) {
        const s = _requireSession(_sessions, sessionId, [SESSION_STATE.PAUSED]);
        _sessions.set(sessionId, Object.freeze({
            ...s, state: SESSION_STATE.ACTIVE, lastModified: _now(),
        }));
        return sessionId;
    },

    stopSpeechSession(sessionId) {
        const s = _requireSession(_sessions, sessionId,
            [SESSION_STATE.ACTIVE, SESSION_STATE.PAUSED]);
        _sessions.set(sessionId, Object.freeze({
            ...s, state: SESSION_STATE.STOPPED, stoppedAt: _now(),
            lastModified: _now(),
        }));
        return sessionId;
    },

    endSpeechSession(sessionId) {
        const s = _requireSession(_sessions, sessionId,
            [SESSION_STATE.STOPPED, SESSION_STATE.PAUSED, SESSION_STATE.ACTIVE]);
        _sessions.set(sessionId, Object.freeze({
            ...s, state: SESSION_STATE.ENDED, endedAt: _now(),
            lastModified: _now(),
        }));
        return sessionId;
    },

    archiveSpeechSession(sessionId) {
        const s = _requireSession(_sessions, sessionId, [SESSION_STATE.ENDED]);
        _sessions.set(sessionId, Object.freeze({
            ...s, state: SESSION_STATE.ARCHIVED, archivedAt: _now(),
            lastModified: _now(),
        }));
        return sessionId;
    },

    exportSpeechSession(sessionId) {
        const s = _requireSession(_sessions, sessionId);
        const segments = Array.from(_segments.values())
            .filter(seg => seg.sessionId === sessionId);
        return Object.freeze({ session: { ...s }, segments: Object.freeze(segments) });
    },

    importSpeechSession(data) {
        if (!data?.session?.sessionId) {
            throw new TypeError(
                "[CozySpeech] importSpeechSession: data.session.sessionId is required."
            );
        }
        const { sessionId } = data.session;
        if (!_sessions.has(sessionId)) {
            _sessions.set(sessionId, Object.freeze({ ...data.session }));
        }
        if (Array.isArray(data.segments)) {
            for (const seg of data.segments) {
                if (seg.segmentId && !_segments.has(seg.segmentId)) {
                    _segments.set(seg.segmentId, Object.freeze({ ...seg }));
                }
            }
        }
        return sessionId;
    },

    // ── § 3.2  SPEAKER REGISTRY ───────────────────────────────────────────────

    /**
     * [V2-7] Roles now include: pastor, interpreter, choir, mc, guest, teacher,
     * doctor, judge, presenter, moderator, panelist, audience_mic, remote.
     *
     * @param {{
     *   speakerId?:    string,
     *   name:          string,
     *   role?:         string,
     *   groupId?:      string,
     *   languageCode?: string,
     * }} config
     */
    registerSpeaker(config) {
        _requireString(config?.name, "name");
        const speakerId = config.speakerId || _uid("speaker");
        _speakers.set(speakerId, Object.freeze({
            speakerId,
            name:           config.name,
            role:           config.role           ?? "speaker",
            groupId:        config.groupId        ?? null,
            languageCode:   config.languageCode   ?? null,
            sequenceNumber: ++_speakerSeq,
            registeredAt:   _now(),
            ..._syncMeta(config),
        }));
        _autoGraphNode("speaker", speakerId, null, config.name);
        return speakerId;
    },

    removeSpeaker(speakerId) {
        _requireString(speakerId, "speakerId");
        _activeSpeakerIds.delete(speakerId);
        return _speakers.delete(speakerId);
    },

    listSpeakers() {
        return Object.freeze(Array.from(_speakers.values()));
    },

    /**
     * [V2.1-15] Mark a registered speaker as active. Multiple speakers
     * may be active at once (e.g. pastor + interpreter + choir).
     * Idempotent — marking an already-active speaker active again is a
     * no-op.
     * @param {string} speakerId
     * @returns {string} speakerId
     */
    addActiveSpeaker(speakerId) {
        _requireString(speakerId, "speakerId");
        if (!_speakers.has(speakerId)) {
            throw new Error(`[CozySpeech] Speaker "${speakerId}" is not registered.`);
        }
        _activeSpeakerIds.add(speakerId);
        return speakerId;
    },

    /**
     * [V2.1-15] Unmark a speaker as active. Safe to call on a speaker
     * that isn't currently active.
     * @param {string} speakerId
     * @returns {boolean} true if the speaker was active and is now removed
     */
    removeActiveSpeaker(speakerId) {
        _requireString(speakerId, "speakerId");
        return _activeSpeakerIds.delete(speakerId);
    },

    /**
     * [V2.1-15] Clears every active speaker at once (e.g. end of session).
     */
    clearActiveSpeakers() {
        _activeSpeakerIds.clear();
    },

    /**
     * [V2.1-15] Returns whether a given speaker is currently active.
     * @param {string} speakerId
     * @returns {boolean}
     */
    isSpeakerActive(speakerId) {
        _requireString(speakerId, "speakerId");
        return _activeSpeakerIds.has(speakerId);
    },

    /**
     * [V2.1-15] Returns the full speaker records for every currently
     * active speaker (replaces the V2.0 single getActiveSpeaker()).
     * Any active id that no longer resolves to a registered speaker is
     * silently skipped rather than fabricated.
     * @returns {Readonly<object[]>}
     */
    listActiveSpeakers() {
        const records = [];
        for (const id of _activeSpeakerIds) {
            const record = _speakers.get(id);
            if (record) records.push(record);
        }
        return Object.freeze(records);
    },

    // ── § 3.3  SPEAKER GROUP REGISTRY  [V2-7] ────────────────────────────────

    /**
     * @param {{
     *   groupId?:    string,
     *   name:        string,
     *   type?:       string,   — "choir"|"panel"|"audience"|"remote"|custom
     *   speakerIds?: string[],
     * }} config
     * @returns {string} groupId
     */
    registerSpeakerGroup(config) {
        _requireString(config?.name, "name");
        const groupId = config.groupId || _uid("group");
        _speakerGroups.set(groupId, Object.freeze({
            groupId,
            name:       config.name,
            type:       config.type ?? "general",
            speakerIds: Object.freeze(config.speakerIds ?? []),
            registeredAt: _now(),
            ..._syncMeta(config),
        }));
        _autoGraphNode("speakerGroup", groupId, null, config.name);
        return groupId;
    },

    removeSpeakerGroup(groupId) {
        _requireString(groupId, "groupId");
        return _speakerGroups.delete(groupId);
    },

    listSpeakerGroups() {
        return Object.freeze(Array.from(_speakerGroups.values()));
    },

    // ── § 3.4  SPEECH STREAM REGISTRY ────────────────────────────────────────

    registerStream(config) {
        _requireString(config?.speakerId, "speakerId");
        _requireString(config?.sessionId, "sessionId");
        _requireString(config?.language,  "language");
        const streamId = config.streamId || _uid("stream");
        _streams.set(streamId, Object.freeze({
            streamId,
            speakerId:      config.speakerId,
            sessionId:      config.sessionId,
            language:       config.language,
            type:           config.type           ?? "original",
            sequenceNumber: config.sequenceNumber ?? ++_streamSeq,
            channelId:      config.channelId      ?? null,
            zoneId:         config.zoneId         ?? null,
            timestamp:      _now(),
            ..._syncMeta(config),
        }));
        _autoGraphNode("stream", streamId, config.sessionId, config.language);
        return streamId;
    },

    removeStream(streamId) {
        _requireString(streamId, "streamId");
        return _streams.delete(streamId);
    },

    listStreams() {
        return Object.freeze(Array.from(_streams.values()));
    },

    // ── § 3.5  LANGUAGE REGISTRY ──────────────────────────────────────────────

    registerLanguage(config) {
        _requireString(config?.languageCode, "languageCode");
        _requireString(config?.name,         "name");
        _languages.set(config.languageCode, Object.freeze({
            languageCode:   config.languageCode,
            name:           config.name,
            direction:      config.direction ?? "ltr",
            sequenceNumber: ++_languageSeq,
            registeredAt:   _now(),
            ..._syncMeta(config),
        }));
        _autoGraphNode("language", config.languageCode, null, config.name);
        return config.languageCode;
    },

    removeLanguage(languageCode) {
        _requireString(languageCode, "languageCode");
        return _languages.delete(languageCode);
    },

    listLanguages() {
        return Object.freeze(Array.from(_languages.values()));
    },

    // ── § 3.6  AUDIO CHANNEL REGISTRY ────────────────────────────────────────

    registerChannel(config) {
        _requireString(config?.name, "name");
        const channelId = config.channelId || _uid("channel");
        _channels.set(channelId, Object.freeze({
            channelId,
            name:         config.name,
            type:         config.type         ?? "original",
            languageCode: config.languageCode ?? null,
            zoneId:       config.zoneId       ?? null,
            registeredAt: _now(),
            ..._syncMeta(config),
        }));
        _autoGraphNode("channel", channelId, null, config.name);
        return channelId;
    },

    removeChannel(channelId) {
        _requireString(channelId, "channelId");
        return _channels.delete(channelId);
    },

    listChannels() {
        return Object.freeze(Array.from(_channels.values()));
    },

    // ── § 3.7  SPEECH SOURCE REGISTRY  [V2-2] ────────────────────────────────

    /**
     * Richer source type vocabulary.
     * type examples: wired_microphone · wireless_microphone · lapel ·
     *   headset · choir_microphone · instrument · mixer · audio_interface ·
     *   hdmi_audio · usb_audio · bluetooth · wifi_audio · plc · satellite ·
     *   radio · telephone · sip · ip_audio · ai_generated ·
     *   recording_playback · file · custom
     *
     * The kernel stores references only — never accesses hardware.
     */
    registerSource(config) {
        _requireString(config?.label, "label");
        const sourceId = config.sourceId || _uid("source");
        _sources.set(sourceId, Object.freeze({
            sourceId,
            label:        config.label,
            type:         config.type      ?? "wired_microphone",
            adapterId:    config.adapterId ?? null,
            deviceId:     config.deviceId  ?? null,
            zoneId:       config.zoneId    ?? null,
            channelId:    config.channelId ?? null,
            registeredAt: _now(),
            ..._syncMeta(config),
        }));
        _autoGraphNode("source", sourceId, null, config.label);
        return sourceId;
    },

    removeSource(sourceId) {
        _requireString(sourceId, "sourceId");
        return _sources.delete(sourceId);
    },

    listSources() {
        return Object.freeze(Array.from(_sources.values()));
    },

    // ── § 3.8  SPEECH DESTINATION REGISTRY  [V2-3] ───────────────────────────

    /**
     * Richer destination type vocabulary.
     * type examples: earphones · hearing_aid · interpreter_booth ·
     *   translation_headset · pa_system · tv · projector · led_wall ·
     *   miracast · hdmi · usb_audio · bluetooth_speakers · vehicle_speakers ·
     *   classroom_speakers · overflow_room · outdoor_speakers · recording ·
     *   archive · streaming_adapter · custom
     *
     * The kernel never sends audio directly.
     */
    registerDestination(config) {
        _requireString(config?.label, "label");
        const destinationId = config.destinationId || _uid("dest");
        _destinations.set(destinationId, Object.freeze({
            destinationId,
            label:        config.label,
            type:         config.type      ?? "room_speakers",
            adapterId:    config.adapterId ?? null,
            deviceId:     config.deviceId  ?? null,
            zoneId:       config.zoneId    ?? null,
            channelId:    config.channelId ?? null,
            registeredAt: _now(),
            ..._syncMeta(config),
        }));
        _autoGraphNode("destination", destinationId, null, config.label);
        return destinationId;
    },

    removeDestination(destinationId) {
        _requireString(destinationId, "destinationId");
        return _destinations.delete(destinationId);
    },

    listDestinations() {
        return Object.freeze(Array.from(_destinations.values()));
    },

    // ── § 3.9  SPEECH PIPELINE REGISTRY ──────────────────────────────────────

    registerPipeline(config) {
        _requireString(config?.label,     "label");
        _requireString(config?.sessionId, "sessionId");
        if (!Array.isArray(config?.steps)) {
            throw new TypeError("[CozySpeech] registerPipeline: steps must be an array.");
        }
        const pipelineId = config.pipelineId || _uid("pipeline");
        _pipelines.set(pipelineId, Object.freeze({
            pipelineId,
            label:        config.label,
            sessionId:    config.sessionId,
            steps:        Object.freeze(config.steps.map(s => Object.freeze({ ...s }))),
            registeredAt: _now(),
            ..._syncMeta(config),
        }));
        _autoGraphNode("pipeline", pipelineId, config.sessionId, config.label);
        return pipelineId;
    },

    removePipeline(pipelineId) {
        _requireString(pipelineId, "pipelineId");
        return _pipelines.delete(pipelineId);
    },

    listPipelines() {
        return Object.freeze(Array.from(_pipelines.values()));
    },

    // ── § 3.10  SPEECH SEGMENT REGISTRY ──────────────────────────────────────

    registerSegment(config) {
        _requireString(config?.speakerId, "speakerId");
        _requireString(config?.streamId,  "streamId");
        _requireString(config?.sessionId, "sessionId");
        _requireString(config?.language,  "language");
        const segmentId = config.segmentId || _uid("segment");
        _segments.set(segmentId, Object.freeze({
            segmentId,
            speakerId:      config.speakerId,
            streamId:       config.streamId,
            sessionId:      config.sessionId,
            language:       config.language,
            sequenceNumber: config.sequenceNumber ?? ++_segmentSeq,
            duration:       config.duration       ?? 0,
            roomId:         config.roomId         ?? null,
            zoneId:         config.zoneId         ?? null,
            timestamp:      config.timestamp      ?? _now(),
            ..._syncMeta(config),
        }));
        _autoGraphNode("segment", segmentId, config.sessionId, "");
        return segmentId;
    },

    listSegments(filter = {}) {
        let results = Array.from(_segments.values());
        if (filter.sessionId) results = results.filter(s => s.sessionId === filter.sessionId);
        if (filter.streamId)  results = results.filter(s => s.streamId  === filter.streamId);
        if (filter.speakerId) results = results.filter(s => s.speakerId === filter.speakerId);
        if (filter.zoneId)    results = results.filter(s => s.zoneId    === filter.zoneId);
        return Object.freeze(results);
    },

    // ── § 3.11  DEVICE REGISTRY  [V2-4] ──────────────────────────────────────

    /**
     * [V2.1-16] Device classes — see DEVICE_CLASS for the full,
     * reference-only vocabulary (phones, mixers, hearing aids,
     * speakers, displays, single-board computers, and more). Not
     * enforced — any string is accepted for `deviceClass`/`type`.
     */
    registerDevice(config) {
        _requireString(config?.label, "label");
        const deviceId = config.deviceId || _uid("device");
        _devices.set(deviceId, Object.freeze({
            deviceId,
            label:        config.label,
            type:         config.type         ?? "unknown",
            deviceClass:  config.deviceClass  ?? "generic",
            capabilities: Object.freeze(config.capabilities ?? []),
            zoneId:       config.zoneId       ?? null,
            registeredAt: _now(),
            ..._syncMeta(config),
        }));
        _autoGraphNode("device", deviceId, null, config.label);
        return deviceId;
    },

    removeDevice(deviceId) {
        _requireString(deviceId, "deviceId");
        _deviceHealth.delete(deviceId);
        return _devices.delete(deviceId);
    },

    listDevices() {
        return Object.freeze(Array.from(_devices.values()));
    },

    // ── § 3.12  DEVICE HEALTH REGISTRY  [V2-9 / V2.1-19] ─────────────────────

    /**
     * Store-only. The kernel never reads hardware state, and never
     * interprets any of these values (no alerting/thresholds here).
     *
     * @param {{
     *   deviceId:            string,
     *   muted?:              boolean,
     *   batteryPercent?:     number,
     *   batteryHealthPct?:   number,   — [V2.1-19]
     *   batteryCharging?:    boolean,  — [V2.1-19]
     *   cableConnected?:     boolean,
     *   adapterOnline?:      boolean,
     *   latencyMs?:          number,
     *   packetLossPct?:      number,
     *   signalStrengthDbm?:  number,   — [V2.1-19]
     *   bluetoothRssi?:      number,   — [V2.1-19]
     *   wifiQualityPct?:     number,   — [V2.1-19]
     *   plcQualityPct?:      number,   — [V2.1-19]
     *   overheating?:        boolean,  — [V2.1-19]
     *   cpuLoadPct?:         number,   — [V2.1-19]
     *   ramUsagePct?:        number,   — [V2.1-19]
     *   storageRemainingPct?: number,  — [V2.1-19]
     *   lastHeartbeatAt?:    string,   — [V2.1-19] ISO timestamp
     * }} config
     */
    updateDeviceHealth(config) {
        _requireString(config?.deviceId, "deviceId");
        _deviceHealth.set(config.deviceId, Object.freeze({
            deviceId:            config.deviceId,
            muted:               config.muted               ?? false,
            batteryPercent:      config.batteryPercent       ?? null,
            batteryHealthPct:    config.batteryHealthPct     ?? null,
            batteryCharging:     config.batteryCharging      ?? null,
            cableConnected:      config.cableConnected       ?? null,
            adapterOnline:       config.adapterOnline        ?? null,
            latencyMs:           config.latencyMs            ?? null,
            packetLossPct:       config.packetLossPct        ?? null,
            signalStrengthDbm:   config.signalStrengthDbm    ?? null,
            bluetoothRssi:       config.bluetoothRssi        ?? null,
            wifiQualityPct:      config.wifiQualityPct       ?? null,
            plcQualityPct:       config.plcQualityPct        ?? null,
            overheating:         config.overheating          ?? null,
            cpuLoadPct:          config.cpuLoadPct            ?? null,
            ramUsagePct:         config.ramUsagePct           ?? null,
            storageRemainingPct: config.storageRemainingPct   ?? null,
            lastHeartbeatAt:     config.lastHeartbeatAt       ?? _now(),
            reportedAt:          _now(),
        }));
        return config.deviceId;
    },

    getDeviceHealth(deviceId) {
        _requireString(deviceId, "deviceId");
        return _deviceHealth.get(deviceId) ?? null;
    },

    listDeviceHealth() {
        return Object.freeze(Array.from(_deviceHealth.values()));
    },

    // ── § 3.13  AUDIO OUTPUT REGISTRY ────────────────────────────────────────

    registerOutput(config) {
        _requireString(config?.label, "label");
        const outputId = config.outputId || _uid("output");
        _outputs.set(outputId, Object.freeze({
            outputId,
            label:        config.label,
            type:         config.type    ?? "room_speakers",
            roomId:       config.roomId  ?? null,
            zoneId:       config.zoneId  ?? null,
            deviceId:     config.deviceId ?? null,
            registeredAt: _now(),
            ..._syncMeta(config),
        }));
        _autoGraphNode("output", outputId, null, config.label);
        return outputId;
    },

    removeOutput(outputId) {
        _requireString(outputId, "outputId");
        return _outputs.delete(outputId);
    },

    listOutputs() {
        return Object.freeze(Array.from(_outputs.values()));
    },

    // ── § 3.14  AUDIO ZONE REGISTRY  [V2-6 / V2.1-18] ────────────────────────

    /**
     * Zone hierarchy — see ZONE_TYPE for the full, reference-only
     * vocabulary: campus → building → floor → wing → hall → room →
     *   stage · section · seat_block · seat · choir · outdoor ·
     *   overflow · vehicle · remote · custom
     *
     * @param {{
     *   zoneId?:   string,
     *   label:     string,
     *   type:      string,
     *   parentId?: string,
     * }} config
     * @returns {string} zoneId
     */
    registerZone(config) {
        _requireString(config?.label, "label");
        const zoneId = config.zoneId || _uid("zone");
        _zones.set(zoneId, Object.freeze({
            zoneId,
            label:        config.label,
            type:         config.type    ?? "room",
            parentId:     config.parentId ?? null,
            registeredAt: _now(),
            ..._syncMeta(config),
        }));
        _autoGraphNode("zone", zoneId, null, config.label);
        return zoneId;
    },

    removeZone(zoneId) {
        _requireString(zoneId, "zoneId");
        return _zones.delete(zoneId);
    },

    listZones() {
        return Object.freeze(Array.from(_zones.values()));
    },

    /**
     * Return the ordered path from a zone up to the root.
     * @param {string} zoneId
     * @returns {string[]}
     */
    getZonePath(zoneId) {
        const path    = [];
        let   current = zoneId;
        const visited = new Set();
        while (current && !visited.has(current)) {
            visited.add(current);
            path.push(current);
            const zone = _zones.get(current);
            current = zone?.parentId ?? null;
        }
        return path;
    },

    // ── § 3.15  AUDIO TOPOLOGY GRAPH  [V2-5 / V2.1-17] ───────────────────────

    /**
     * Store a directional edge in the audio topology graph.
     * See TOPOLOGY_NODE_TYPE for a representative, generic chain
     * (mic → mixer → DSP → noise filter → recognition → translation →
     * synthesis → language channel → output → speaker). fromType/toType
     * are arbitrary strings — the kernel enforces no particular chain,
     * so new stages can be inserted without a kernel change.
     *
     * The kernel stores edges; it never executes audio routing.
     *
     * @param {{
     *   topologyId?:   string,
     *   sessionId:     string,
     *   fromType:      string,
     *   fromId:        string,
     *   toType:        string,
     *   toId:          string,
     *   label?:        string,
     * }} config
     * @returns {string} topologyId
     */
    registerTopologyEdge(config) {
        _requireString(config?.sessionId, "sessionId");
        _requireString(config?.fromId,    "fromId");
        _requireString(config?.toId,      "toId");
        const topologyId = config.topologyId || _uid("topo");
        _topology.set(topologyId, Object.freeze({
            topologyId,
            sessionId: config.sessionId,
            fromType:  config.fromType ?? "source",
            fromId:    config.fromId,
            toType:    config.toType   ?? "destination",
            toId:      config.toId,
            label:     config.label    ?? "",
            createdAt: _now(),
        }));
        return topologyId;
    },

    removeTopologyEdge(topologyId) {
        _requireString(topologyId, "topologyId");
        return _topology.delete(topologyId);
    },

    /**
     * @param {{ sessionId?: string, fromId?: string, toId?: string }} [filter]
     * @returns {Readonly<object[]>}
     */
    listTopologyEdges(filter = {}) {
        let results = Array.from(_topology.values());
        if (filter.sessionId) results = results.filter(e => e.sessionId === filter.sessionId);
        if (filter.fromId)    results = results.filter(e => e.fromId    === filter.fromId);
        if (filter.toId)      results = results.filter(e => e.toId      === filter.toId);
        return Object.freeze(results);
    },

    // ── § 3.16  EVENT GRAPH  [V2-10 / V2.1-20] ───────────────────────────────

    /**
     * Register any entity as a graph node. Most kernel register*()
     * calls now do this automatically (see _autoGraphNode / V2.1-20) —
     * this method remains available for manual/custom node types not
     * covered by a dedicated registry (e.g. "participant", "identity",
     * "subtitle", "translation", "attendance").
     *
     * node types: speaker · microphone · language · stream · channel ·
     *   destination · output · recording · device · session · segment ·
     *   participant · attendance · identity · subtitle · translation
     *
     * @param {{
     *   nodeId?:    string,
     *   entityType: string,
     *   entityId:   string,
     *   sessionId?: string,
     *   label?:     string,
     * }} config
     * @returns {string} nodeId
     */
    registerGraphNode(config) {
        _requireString(config?.entityType, "entityType");
        _requireString(config?.entityId,   "entityId");
        const nodeId = config.nodeId || _uid("node");
        _graphNodes.set(nodeId, Object.freeze({
            nodeId,
            entityType: config.entityType,
            entityId:   config.entityId,
            sessionId:  config.sessionId ?? null,
            label:      config.label     ?? "",
            createdAt:  _now(),
        }));
        return nodeId;
    },

    /**
     * Register a directed edge between two graph nodes.
     *
     * @param {{
     *   edgeId?:      string,
     *   fromNodeId:   string,
     *   toNodeId:     string,
     *   relationship: string,   — e.g. "speaks_through", "outputs_to", "translates_into"
     *   sessionId?:   string,
     * }} config
     * @returns {string} edgeId
     */
    registerGraphEdge(config) {
        _requireString(config?.fromNodeId,   "fromNodeId");
        _requireString(config?.toNodeId,     "toNodeId");
        _requireString(config?.relationship, "relationship");
        const edgeId = config.edgeId || _uid("edge");
        _graphEdges.set(edgeId, Object.freeze({
            edgeId,
            fromNodeId:   config.fromNodeId,
            toNodeId:     config.toNodeId,
            relationship: config.relationship,
            sessionId:    config.sessionId ?? null,
            createdAt:    _now(),
        }));
        return edgeId;
    },

    removeGraphNode(nodeId) {
        _requireString(nodeId, "nodeId");
        return _graphNodes.delete(nodeId);
    },

    removeGraphEdge(edgeId) {
        _requireString(edgeId, "edgeId");
        return _graphEdges.delete(edgeId);
    },

    listGraphNodes(filter = {}) {
        let results = Array.from(_graphNodes.values());
        if (filter.entityType) results = results.filter(n => n.entityType === filter.entityType);
        if (filter.sessionId)  results = results.filter(n => n.sessionId  === filter.sessionId);
        return Object.freeze(results);
    },

    listGraphEdges(filter = {}) {
        let results = Array.from(_graphEdges.values());
        if (filter.fromNodeId)   results = results.filter(e => e.fromNodeId   === filter.fromNodeId);
        if (filter.toNodeId)     results = results.filter(e => e.toNodeId     === filter.toNodeId);
        if (filter.relationship) results = results.filter(e => e.relationship === filter.relationship);
        if (filter.sessionId)    results = results.filter(e => e.sessionId    === filter.sessionId);
        return Object.freeze(results);
    },

    // ── § 3.17  ACCESSIBILITY REGISTRY  [V2-11] ──────────────────────────────

    /**
     * Requirements: hearing_assistance · audio_amplification · captions_requested ·
     *   interpreter_requested · sign_language · high_contrast ·
     *   emergency_override · custom
     */
    registerAccessibility(config) {
        _requireString(config?.sessionId,   "sessionId");
        _requireString(config?.requirement, "requirement");
        const id = config.accessibilityId || _uid("a11y");
        _accessibility.set(id, Object.freeze({
            accessibilityId: id,
            sessionId:       config.sessionId,
            requirement:     config.requirement,
            priority:        config.priority   ?? "normal",
            deviceId:        config.deviceId   ?? null,
            adapterId:       config.adapterId  ?? null,
            zoneId:          config.zoneId     ?? null,
            registeredAt:    _now(),
            ..._syncMeta(config),
        }));
        return id;
    },

    removeAccessibility(accessibilityId) {
        _requireString(accessibilityId, "accessibilityId");
        return _accessibility.delete(accessibilityId);
    },

    listAccessibility() {
        return Object.freeze(Array.from(_accessibility.values()));
    },

    // ── § 3.18  RECORDING REGISTRY  [V2-8] ───────────────────────────────────

    /**
     * Extended metadata: chapters, highlights, content type.
     *
     * @param {{
     *   recordingId?:  string,
     *   sessionId:     string,
     *   type:          "live"|"archive",
     *   adapterId?:    string,
     *   label?:        string,
     *   contentType?:  string,   — "sermon"|"lesson"|"meeting"|"evidence"|"emergency_log"|…
     *   chapters?:     Array<{ title: string, timestampMs: number }>,
     *   highlights?:   Array<{ title: string, timestampMs: number }>,
     * }} config
     * @returns {string} recordingId
     */
    registerRecording(config) {
        _requireString(config?.sessionId, "sessionId");
        const recordingId = config.recordingId || _uid("recording");
        _recordings.set(recordingId, Object.freeze({
            recordingId,
            sessionId:   config.sessionId,
            type:        config.type        ?? "live",
            adapterId:   config.adapterId   ?? null,
            label:       config.label       ?? "",
            contentType: config.contentType ?? "general",
            chapters:    Object.freeze((config.chapters   ?? []).map(c => Object.freeze({ ...c }))),
            highlights:  Object.freeze((config.highlights ?? []).map(h => Object.freeze({ ...h }))),
            startedAt:   _now(),
            ..._syncMeta(config),
        }));
        _autoGraphNode("recording", recordingId, config.sessionId, config.label ?? "");
        return recordingId;
    },

    listRecordings(filter = {}) {
        let results = Array.from(_recordings.values());
        if (filter.sessionId)  results = results.filter(r => r.sessionId  === filter.sessionId);
        if (filter.contentType)results = results.filter(r => r.contentType === filter.contentType);
        return Object.freeze(results);
    },

    // ── § 3.19  SPEECH TIMELINE ───────────────────────────────────────────────

    addTimelineEvent(event) {
        _requireString(event?.eventType, "eventType");
        _timeline.push(Object.freeze({
            ...event,
            timestamp:      _now(),
            clockOffsetMs:  _clockOffsetMs,
        }));
    },

    getTimeline(filter = {}) {
        let results = [..._timeline];
        if (filter.sessionId) results = results.filter(e => e.sessionId === filter.sessionId);
        if (filter.speakerId) results = results.filter(e => e.speakerId === filter.speakerId);
        if (filter.eventType) results = results.filter(e => e.eventType === filter.eventType);
        if (filter.zoneId)    results = results.filter(e => e.zoneId    === filter.zoneId);
        return Object.freeze(results);
    },

    // ── § 3.20  TIME SYNCHRONISATION  [V2-14] ────────────────────────────────

    /**
     * Update the clock offset so all kernel timestamps stay aligned
     * with CozyNetwork's master clock.
     *
     * @param {number} masterTimestampMs   Unix ms from the clock master
     */
    synchronizeClock(masterTimestampMs) {
        _clockOffsetMs = masterTimestampMs - Date.now();
    },

    getSynchronizedTime() {
        return Date.now() + _clockOffsetMs;
    },

    getSequenceCounters() {
        return Object.freeze({
            speaker:  _speakerSeq,
            stream:   _streamSeq,
            segment:  _segmentSeq,
            language: _languageSeq,
        });
    },

    // ── § 3.21  ADAPTER REGISTRY ──────────────────────────────────────────────

    registerAdapter(config) {
        _requireString(config?.name, "name");
        _requireString(config?.type, "type");
        const adapterId = config.adapterId || _uid("adapter");
        _adapters.set(adapterId, Object.freeze({
            adapterId,
            name:         config.name,
            type:         config.type,
            capabilities: Object.freeze(config.capabilities ?? []),
            offline:      config.offline  ?? true,
            version:      config.version  ?? "unknown",
            registeredAt: _now(),
            ..._syncMeta(config),
        }));
        return adapterId;
    },

    removeAdapter(adapterId) {
        _requireString(adapterId, "adapterId");
        return _adapters.delete(adapterId);
    },

    listAdapters() {
        return Object.freeze(Array.from(_adapters.values()));
    },

    // ── § 3.22  PLUGIN REGISTRY ───────────────────────────────────────────────

    registerPlugin(config) {
        _requireString(config?.name, "name");
        const pluginId = config.pluginId || _uid("plugin");
        _plugins.set(pluginId, Object.freeze({
            pluginId,
            name:         config.name,
            type:         config.type ?? "general",
            registeredAt: _now(),
            ..._syncMeta(config),
        }));
        return pluginId;
    },

    listPlugins() {
        return Object.freeze(Array.from(_plugins.values()));
    },
    // ── § 3.23  INTEGRATION REGISTRY (CLOSED)  [V2.1] ────────────────────────

    /**
     * CozySpeech Integration Registry.
     *
     * This registry is CLOSED.
     *
     * Unlike the Plugin Registry, integrations are official CozyOS kernel
     * contracts and cannot be added or removed at runtime by applications.
     *
     * CozySpeech never instantiates, executes, or depends on these modules.
     * The registry simply documents the official kernels that CozySpeech is
     * designed to coordinate with.
     *
     * Future CozyOS kernel integrations are added only through official
     * CozyOS releases, not application code.
     *
     * @returns {ReadonlyArray<string>}
     */
    listIntegrations() {
        return Object.freeze([
            "OurCozyLive",
            "CozyNetwork",
            "CozyIdentity",
            "CozyStorage",
            "CozySync",
            "CozyTranslate",
            "CozyVision",
            "CozyAttendance",
            "CozyAccessibility",
            "CozyRecording",
            "CozyAnalytics",
            "CozyEmergency",
            "CozyMarketplace",
            "CozyEducation",
            "CozyHealth",
            "CozyJustice",
            "CozyFinance",
            "CozyCloud",
            "CozyAI"
        ]);
    },

    // ── § 3.24  AUDIO PROFILE REGISTRY  [V2.1-22, NEW] ───────────────────────

    /**
     * An Audio Profile is an environment preset (church, classroom,
     * hospital, courtroom, conference, outdoor_crusade, concert,
     * emergency, radio, podcast, …) that stores preferred routing and
     * adapter defaults for that environment. CozySpeech only stores
     * the profile as opaque, producer-supplied data — it never
     * interprets, applies, or executes routingDefaults/adapterDefaults.
     * Adapters (or a future orchestration kernel) are responsible for
     * reading and applying a profile's contents.
     *
     * @param {{
     *   profileId?:        string,
     *   name:              string,
     *   environment?:      string,   — PROFILE_ENV value or custom string
     *   routingDefaults?:  object,    — opaque; never interpreted here
     *   adapterDefaults?:  object,    — opaque; never interpreted here
     * }} config
     * @returns {string} profileId
     */
    registerProfile(config) {
        _requireString(config?.name, "name");
        const profileId = config.profileId || _uid("profile");
        _profiles.set(profileId, Object.freeze({
            profileId,
            name:            config.name,
            environment:     config.environment     ?? PROFILE_ENV.CUSTOM,
            routingDefaults: Object.freeze({ ...(config.routingDefaults ?? {}) }),
            adapterDefaults: Object.freeze({ ...(config.adapterDefaults ?? {}) }),
            registeredAt:    _now(),
            ..._syncMeta(config),
        }));
        _autoGraphNode("profile", profileId, null, config.name);
        return profileId;
    },

    removeProfile(profileId) {
        _requireString(profileId, "profileId");
        return _profiles.delete(profileId);
    },

    getProfile(profileId) {
        _requireString(profileId, "profileId");
        return _profiles.get(profileId) ?? null;
    },

    listProfiles() {
        return Object.freeze(Array.from(_profiles.values()));
    },

    // ── § 3.25  OUTPUT GROUP REGISTRY  [V2.1-23, NEW] ────────────────────────

    /**
     * A named group of existing output references (e.g. "English
     * Speakers", "Swahili Speakers", "Interpreter Booth", "Overflow
     * Room", "Outdoor Speakers", "Recording", "Livestream"), so a
     * single stream can target many outputs at once without
     * duplicating per-output configuration. This registry stores
     * outputId references only — it never validates that a
     * referenced outputId currently exists in _outputs, since a group
     * may legitimately be assembled before all its outputs are
     * registered (or reference an output that is later removed).
     *
     * @param {{
     *   groupId?:   string,
     *   label:      string,
     *   outputIds?: string[],
     * }} config
     * @returns {string} groupId
     */
    registerOutputGroup(config) {
        _requireString(config?.label, "label");
        const groupId = config.groupId || _uid("outgroup");
        _outputGroups.set(groupId, Object.freeze({
            groupId,
            label:        config.label,
            outputIds:    Object.freeze([...(config.outputIds ?? [])]),
            registeredAt: _now(),
            ..._syncMeta(config),
        }));
        _autoGraphNode("outputGroup", groupId, null, config.label);
        return groupId;
    },

    removeOutputGroup(groupId) {
        _requireString(groupId, "groupId");
        return _outputGroups.delete(groupId);
    },

    /**
     * Adds an outputId to an existing group (idempotent — adding the
     * same id twice does not duplicate it).
     * @param {string} groupId
     * @param {string} outputId
     * @returns {string} groupId
     */
    addOutputToGroup(groupId, outputId) {
        _requireString(groupId, "groupId");
        _requireString(outputId, "outputId");
        const group = _outputGroups.get(groupId);
        if (!group) {
            throw new Error(`[CozySpeech] Output group "${groupId}" not found.`);
        }
        if (group.outputIds.includes(outputId)) return groupId;
        _outputGroups.set(groupId, Object.freeze({
            ...group,
            outputIds:    Object.freeze([...group.outputIds, outputId]),
            lastModified: _now(),
        }));
        return groupId;
    },

    /**
     * Removes an outputId from an existing group.
     * @param {string} groupId
     * @param {string} outputId
     * @returns {string} groupId
     */
    removeOutputFromGroup(groupId, outputId) {
        _requireString(groupId, "groupId");
        _requireString(outputId, "outputId");
        const group = _outputGroups.get(groupId);
        if (!group) {
            throw new Error(`[CozySpeech] Output group "${groupId}" not found.`);
        }
        _outputGroups.set(groupId, Object.freeze({
            ...group,
            outputIds:    Object.freeze(group.outputIds.filter(id => id !== outputId)),
            lastModified: _now(),
        }));
        return groupId;
    },

    getOutputGroup(groupId) {
        _requireString(groupId, "groupId");
        return _outputGroups.get(groupId) ?? null;
    },

    listOutputGroups() {
        return Object.freeze(Array.from(_outputGroups.values()));
    },

    // ── § 3.26  MODULE METADATA ───────────────────────────────────────────────

    getVersion() {
        return SPEECH_VERSION;
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// § 4. PUBLIC API EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Frozen public API. Exposes every kernel method above plus the
 * reference-only enumeration constants. No private state (the Maps,
 * Sets, or sequence counters themselves) is ever exposed directly —
 * only the frozen records the kernel's own list/get methods already
 * return.
 */
if (typeof window !== "undefined") {
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.CozySpeech = Object.freeze({
        ..._kernel,
        SESSION_STATE,
        SESSION_ENV,
        SYNC_STATE,
        DEVICE_CLASS,
        TOPOLOGY_NODE_TYPE,
        ZONE_TYPE,
        KNOWN_INTEGRATIONS,
        PROFILE_ENV,
    });
}
