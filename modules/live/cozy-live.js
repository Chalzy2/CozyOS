/**
 * ============================================================================
 * CozyOS Universal Cognitive Core
 * Module:  core/modules/live/ourcozy-live.js
 * Name:    OurCozy Live — Central Orchestration Engine
 * Version: 1.2.0-ENTERPRISE
 * Target:  CozyOS Kernel v2+
 * ============================================================================
 *
 * v1.2.0 ADDITIONS (additive, fully backward compatible with v1.1.0/v1.0.0)
 * --------------------------------------------------------------------------
 *   - Cozy Event Graph: a lightweight node/edge mirror of the entities this
 *     module already tracks (`addGraphNode`/`addGraphEdge`/`removeGraphNode`/
 *     `removeGraphEdge`/`getGraphNode`/`listGraphNodes`/`getGraphNeighbors`),
 *     so callers can traverse Venue -> Room -> Speaker -> Stream ->
 *     TranslationStream -> Display -> Participant -> Segment relationships
 *     without this module implementing any traversal/reasoning logic itself.
 *   - Venue Digital Twin: Venue -> Building -> Floor -> Room, plus
 *     VenueFeature records (stage, screen, mic/camera/speaker position,
 *     seating, emergency exit, accessibility device) — purely descriptive.
 *   - Session Context (`context`) and Venue Kind (`venueKind`) — descriptive
 *     labels only; this module makes no decisions based on them.
 *   - Accessibility preference registry (participant-scoped requirement
 *     flags only — no captioning/rendering/signing logic).
 *   - Venue-scoped Local Knowledge Base (`setVenuePreference`/...).
 *   - Open Service Registry (`registerService`/`getService`/
 *     `getServiceCapabilities`/`getServiceHealth`/`listServices`) for
 *     arbitrary business/AI services, explicitly distinct from the closed
 *     Subsystem registry this module's own pipeline calls.
 *   - Hardware Capability Profile on devices (`config.capabilities` in
 *     `registerDevice`/`updateDevice`, plus `getDeviceCapabilities`/
 *     `deviceSupportsCapability`) — a common, hardware-agnostic shape so
 *     applications can ask "does this device support X" without knowing
 *     its model. Pure data; no capability-negotiation logic.
 *   - Optional, purely delegated "Translation Pipeline Intelligence" hooks
 *     in `relaySpeechSegment` (CozyLanguage.detectLanguage,
 *     CozyKnowledge.lookupTerminology) and a Resilience Layer coordination
 *     point (`reportDeviceHealthEvent` forwards FAILED events to a
 *     registered CozyResilience adapter). Both are no-ops if the adapter
 *     isn't registered.
 *   - New adapter contracts added to KNOWN_SUBSYSTEMS: CozyVision,
 *     CozyMaintenance, CozyNetworkIntelligence, CozyResilience,
 *     CozyAccessibility, CozyAttendance, CozyRecording, CozyAnalytics —
 *     all optional, all called only if registered, none implemented here.
 *
 * v1.1.0 ADDITIONS (additive, fully backward compatible with v1.0.0)
 * --------------------------------------------------------------------------
 * Introduced to support the long-term offline-first, multi-million-user,
 * multi-hardware vision, WITHOUT changing any existing public method
 * signature or removing any existing behavior:
 *   - Stream / TranslationStream objects representing the live broadcast
 *     object graph (Session -> Room -> Stream -> TranslationStreams),
 *     layered on top of (not replacing) the existing language/audio/
 *     subtitle channel routing model.
 *   - Speaker registry + active-speaker tracking per room, wired into
 *     `relaySpeechSegment` so the pipeline knows who is speaking.
 *   - Camera registry (coordination only — no video capture/encoding).
 *   - Display registry + room assignment + broadcast coordination
 *     (coordination only — no rendering).
 *   - Device registry (phones, tablets, hubs, TVs, projectors, speaker
 *     boxes, headphones, etc.) for future transport/session-membership
 *     bookkeeping.
 *   - Attendance recording as a pure data sink: this module never performs
 *     face recognition, QR/NFC scanning, or identity verification — it only
 *     records whatever a Face/QR/NFC/Manual adapter chain upstream already
 *     decided, tagged with a method enum.
 *   - Plugin registry (Attendance, Bible, Marketplace, Education,
 *     Emergency, Voting, Donation, Kids, Accessibility, etc.) — a pure
 *     bookkeeping registry; plugins receive data exclusively through the
 *     existing public event bus (`on`/`registerEventType`/`emitCustomEvent`),
 *     never through hidden direct invocation.
 *   - Expanded host hierarchy (Campus/Building/Floor/Room host tiers)
 *     added to HOST_TYPES for very large multi-building campuses.
 *   - Per-session Segment/Timeline recording with monotonic sequence
 *     numbers, produced by `relaySpeechSegment`, to support out-of-order
 *     packet reassembly and future testimony/notes/highlights generation.
 * See the "STREAMS", "SPEAKERS", "CAMERAS", "DISPLAYS", "DEVICES",
 * "ATTENDANCE", "PLUGIN REGISTRY", and "TIMELINE / SEGMENTS" sections
 * below for full documentation of each addition.
 *
 * ARCHITECTURAL ROLE
 * -------------------
 * This module is the CONDUCTOR of an offline-first, multilingual live event.
 * It owns no media, no network sockets, no AI models, and no credentials.
 * It exists solely to coordinate the lifecycle of sessions, rooms, zones,
 * streams, language/audio/subtitle channels, participants, speakers,
 * cameras, displays, devices, hosts, permissions, attendance records, and
 * plugins, and to relay pipeline steps between subsystems that are
 * injected as opaque interfaces (Dependency Injection). It never reaches
 * into a subsystem's internals — it only calls the methods the subsystem
 * exposes on the adapter contract it registered.
 *
 * THIS MODULE MUST NEVER:
 *   - Perform Speech Recognition, Translation, OCR, or Speech Synthesis.
 *   - Modify, encode, or decode audio/video.
 *   - Implement networking/transport.
 *   - Access cameras or microphones.
 *   - Store user credentials.
 *   - Connect directly to cloud APIs.
 *   - Perform AI reasoning or business logic of its own.
 *
 * DESIGN RULES
 * ------------
 *   - Single Responsibility Principle: orchestration only.
 *   - Microkernel + plugin-ready: subsystems are registered, never imported.
 *   - Dependency Injection: all capability comes from injected adapters.
 *   - Immutable public responses: every value returned across the public
 *     API boundary is a deep-frozen snapshot, never a live internal
 *     reference. Callers cannot mutate internal state by mutating a
 *     returned object.
 *   - Frozen metadata: VERSION/METADATA/EVENT_TYPES/etc. are frozen once,
 *     at module load, and never mutated.
 *   - No fabricated telemetry: diagnostics only ever report values this
 *     module actually tracked; nothing is invented to look "enterprise".
 *   - No hidden side effects: every mutation emits a corresponding event.
 *
 * THREAD SAFETY ASSUMPTIONS
 * -------------------------
 * JavaScript execution in the target runtimes (Node.js on a Host device,
 * or a single-threaded JS engine embedded in CozyOS Kernel) is single
 * threaded per event loop. This module makes NO attempt at cross-process
 * or cross-worker locking. If CozyOS Kernel later runs this module across
 * worker threads or separate processes (e.g. Main Host / Regional Host /
 * Zone Host / Client Device), synchronization must be handled by the
 * CozyKernel/CozyNetwork layer via serialized state transfer using
 * `exportSession` / `importSession`. All internal mutation in a single
 * instance happens synchronously within a single call, so there are no
 * partial-update race windows inside one process.
 *
 * SECURITY MODEL
 * ---------------
 *   - This module tracks *authorization intent* (roles, moderator flags,
 *     permission grants) but never authenticates identity. Identity
 *     verification is the responsibility of the injected CozyIdentity
 *     subsystem. `checkPermission` answers "what has this participant ID
 *     been granted", not "is this participant ID really who they claim".
 *   - No credentials, tokens, or secrets are ever accepted, stored, or
 *     logged by this module. Any field named like a secret is rejected
 *     defensively (see `FORBIDDEN_FIELD_PATTERN`).
 *   - `exportSession` never includes subsystem adapters (functions are
 *     never serializable and are explicitly stripped).
 *
 * INTEGRATION CONTRACTS (Subsystems)
 * -----------------------------------
 * This module integrates with CozySpeech, CozyTranslate, CozyLanguage,
 * CozyKnowledge, CozyAI, CozyNetwork, CozyAudio, CozyVideo, CozyIdentity,
 * CozyEvents, CozyPermissions, CozyLogger, and CozyKernel exclusively
 * through `registerSubsystem(name, adapter)`. An adapter is any object
 * exposing whatever methods the coordination pipeline calls (see
 * `relaySpeechSegment`). This module never requires a subsystem package
 * directly and never inspects a subsystem's internals beyond calling the
 * documented method names on the adapter object it was given.
 *
 * FUTURE EXPANSION POINTS
 * ------------------------
 * The following are explicitly designed to be added WITHOUT modifying
 * this module's architecture, by registering new subsystems, new event
 * types via `registerEventType`, or new room/zone metadata:
 *   Live captions, live subtitles, multi-language audio, AI summaries,
 *   meeting notes, scripture/verse detection, attendance, voting,
 *   questions, polls, emergency alerts, sign-language modules, local
 *   marketplace, offline messaging, offline file sharing, offline
 *   education, offline commerce.
 * These all layer on top of: sessions, rooms, zones, channels,
 * participants, hosts, permissions, announcements, and the event bus.
 *
 * LIFECYCLE (high level)
 * ------------------------
 *   createSession -> startSession -> (joinSession/leaveSession, room &
 *   zone & channel management, relaySpeechSegment, announcements)* ->
 *   stopSession
 *
 * ============================================================================
 */

'use strict';

/* ----------------------------------------------------------------------- *
 * SECTION 1: FROZEN CONSTANTS
 * ----------------------------------------------------------------------- */

/** @type {string} Semantic version of this module. */
const VERSION = '1.2.0-ENTERPRISE';

/** @type {Object<string,string>} Enterprise event taxonomy. Frozen. */
const EVENT_TYPES = Object.freeze({
  SESSION_CREATED: 'SESSION_CREATED',
  SESSION_STARTED: 'SESSION_STARTED',
  SESSION_STOPPED: 'SESSION_STOPPED',
  SESSION_ENDED: 'SESSION_ENDED',

  PARTICIPANT_JOINED: 'PARTICIPANT_JOINED',
  PARTICIPANT_LEFT: 'PARTICIPANT_LEFT',
  PARTICIPANT_LANGUAGE_CHANGED: 'PARTICIPANT_LANGUAGE_CHANGED',
  PARTICIPANT_ROOM_ASSIGNED: 'PARTICIPANT_ROOM_ASSIGNED',

  ROOM_CREATED: 'ROOM_CREATED',
  ROOM_UPDATED: 'ROOM_UPDATED',
  ROOM_REMOVED: 'ROOM_REMOVED',

  ZONE_CREATED: 'ZONE_CREATED',
  ZONE_UPDATED: 'ZONE_UPDATED',
  ZONE_REMOVED: 'ZONE_REMOVED',

  LANGUAGE_CHANGED: 'LANGUAGE_CHANGED',
  LANGUAGE_CHANNEL_CREATED: 'LANGUAGE_CHANNEL_CREATED',
  LANGUAGE_CHANNEL_REMOVED: 'LANGUAGE_CHANNEL_REMOVED',

  AUDIO_CHANNEL_CREATED: 'AUDIO_CHANNEL_CREATED',
  AUDIO_CHANNEL_REMOVED: 'AUDIO_CHANNEL_REMOVED',

  SUBTITLE_CHANNEL_CREATED: 'SUBTITLE_CHANNEL_CREATED',
  SUBTITLE_CHANNEL_REMOVED: 'SUBTITLE_CHANNEL_REMOVED',

  HOST_REGISTERED: 'HOST_REGISTERED',
  HOST_CHANGED: 'HOST_CHANGED',
  HOST_UNREGISTERED: 'HOST_UNREGISTERED',

  MODERATOR_ASSIGNED: 'MODERATOR_ASSIGNED',
  MODERATOR_REVOKED: 'MODERATOR_REVOKED',
  PERMISSION_GRANTED: 'PERMISSION_GRANTED',
  PERMISSION_REVOKED: 'PERMISSION_REVOKED',

  ANNOUNCEMENT_BROADCAST: 'ANNOUNCEMENT_BROADCAST',

  SUBSYSTEM_REGISTERED: 'SUBSYSTEM_REGISTERED',
  SUBSYSTEM_UNREGISTERED: 'SUBSYSTEM_UNREGISTERED',

  EVENT_SYNC: 'EVENT_SYNC',
  PIPELINE_SEGMENT_RELAYED: 'PIPELINE_SEGMENT_RELAYED',

  STREAM_CREATED: 'STREAM_CREATED',
  STREAM_STATUS_CHANGED: 'STREAM_STATUS_CHANGED',
  STREAM_REMOVED: 'STREAM_REMOVED',
  TRANSLATION_STREAM_CREATED: 'TRANSLATION_STREAM_CREATED',
  TRANSLATION_STREAM_REMOVED: 'TRANSLATION_STREAM_REMOVED',

  SPEAKER_REGISTERED: 'SPEAKER_REGISTERED',
  SPEAKER_REMOVED: 'SPEAKER_REMOVED',
  ACTIVE_SPEAKER_CHANGED: 'ACTIVE_SPEAKER_CHANGED',

  CAMERA_REGISTERED: 'CAMERA_REGISTERED',
  CAMERA_REMOVED: 'CAMERA_REMOVED',
  CAMERA_ASSIGNED: 'CAMERA_ASSIGNED',

  DISPLAY_REGISTERED: 'DISPLAY_REGISTERED',
  DISPLAY_REMOVED: 'DISPLAY_REMOVED',
  DISPLAY_ROOM_ASSIGNED: 'DISPLAY_ROOM_ASSIGNED',
  DISPLAY_BROADCAST: 'DISPLAY_BROADCAST',

  DEVICE_REGISTERED: 'DEVICE_REGISTERED',
  DEVICE_UPDATED: 'DEVICE_UPDATED',
  DEVICE_REMOVED: 'DEVICE_REMOVED',

  ATTENDANCE_RECORDED: 'ATTENDANCE_RECORDED',

  PLUGIN_REGISTERED: 'PLUGIN_REGISTERED',
  PLUGIN_UNREGISTERED: 'PLUGIN_UNREGISTERED',

  SEGMENT_RECORDED: 'SEGMENT_RECORDED',

  VENUE_REGISTERED: 'VENUE_REGISTERED',
  BUILDING_CREATED: 'BUILDING_CREATED',
  FLOOR_CREATED: 'FLOOR_CREATED',
  VENUE_FEATURE_CREATED: 'VENUE_FEATURE_CREATED',
  VENUE_FEATURE_REMOVED: 'VENUE_FEATURE_REMOVED',
  VENUE_PREFERENCE_SET: 'VENUE_PREFERENCE_SET',

  SESSION_CONTEXT_CHANGED: 'SESSION_CONTEXT_CHANGED',
  ACCESSIBILITY_PREFERENCES_SET: 'ACCESSIBILITY_PREFERENCES_SET',

  SERVICE_REGISTERED: 'SERVICE_REGISTERED',
  SERVICE_UNREGISTERED: 'SERVICE_UNREGISTERED',

  DEVICE_HEALTH_EVENT: 'DEVICE_HEALTH_EVENT',

  GRAPH_NODE_ADDED: 'GRAPH_NODE_ADDED',
  GRAPH_NODE_REMOVED: 'GRAPH_NODE_REMOVED',
  GRAPH_EDGE_ADDED: 'GRAPH_EDGE_ADDED',
  GRAPH_EDGE_REMOVED: 'GRAPH_EDGE_REMOVED',

  SYSTEM_WARNING: 'SYSTEM_WARNING',
  SYSTEM_ERROR: 'SYSTEM_ERROR'
});

/**
 * @type {string[]} Subsystems this module may integrate with via interface
 * only. This is a CLOSED list: it names the core CozyOS platform engines
 * that THIS MODULE'S OWN PIPELINE (relaySpeechSegment, reportDeviceHealthEvent,
 * etc.) may call directly by documented contract. Contrast with the open
 * Service Registry (`registerService`/`getService`), which lets
 * applications and plugins register arbitrary business/AI services that
 * THIS MODULE NEVER CALLS ITSELF — those are looked up and invoked by the
 * caller, not by this orchestrator's internal pipeline.
 */
const KNOWN_SUBSYSTEMS = Object.freeze([
  'CozySpeech',
  'CozyTranslate',
  'CozyLanguage',
  'CozyKnowledge',
  'CozyAI',
  'CozyVision',
  'CozyNetwork',
  'CozyNetworkIntelligence',
  'CozyAudio',
  'CozyVideo',
  'CozyIdentity',
  'CozyEvents',
  'CozyPermissions',
  'CozyLogger',
  'CozyKernel',
  'CozyMaintenance',
  'CozyResilience',
  'CozyAccessibility',
  'CozyAttendance',
  'CozyRecording',
  'CozyAnalytics'
]);

/**
 * @type {Object<string,string>} Distributed host hierarchy roles.
 * Two hierarchies are supported side by side so small deployments (a
 * village church) and very large ones (a multi-building campus or a
 * mega-conference) both fit without forcing unused tiers on anyone:
 *   Small/medium: MAIN_HOST -> REGIONAL_HOST -> ZONE_HOST -> CLIENT_DEVICE
 *   Large campus: MAIN_HOST -> CAMPUS_HOST -> BUILDING_HOST -> FLOOR_HOST
 *                 -> ROOM_HOST -> CLIENT_DEVICE
 * A host's `parentHostId` may point to any other registered host
 * regardless of tier name, so deployments may mix tiers freely (e.g. a
 * ZONE_HOST parented directly under a CAMPUS_HOST) without this module
 * enforcing a rigid shape.
 */
const HOST_TYPES = Object.freeze({
  MAIN_HOST: 'MAIN_HOST',
  REGIONAL_HOST: 'REGIONAL_HOST',
  ZONE_HOST: 'ZONE_HOST',
  CAMPUS_HOST: 'CAMPUS_HOST',
  BUILDING_HOST: 'BUILDING_HOST',
  FLOOR_HOST: 'FLOOR_HOST',
  ROOM_HOST: 'ROOM_HOST',
  CLIENT_DEVICE: 'CLIENT_DEVICE'
});

/** @type {Object<string,string>} Session lifecycle states. */
const SESSION_STATES = Object.freeze({
  CREATED: 'CREATED',
  STARTED: 'STARTED',
  STOPPED: 'STOPPED'
});

/** @type {Object<string,string>} Coarse-grained permission actions understood natively. */
const PERMISSIONS = Object.freeze({
  MODERATE: 'MODERATE',
  BROADCAST_ANNOUNCEMENT: 'BROADCAST_ANNOUNCEMENT',
  MANAGE_ROOMS: 'MANAGE_ROOMS',
  MANAGE_ZONES: 'MANAGE_ZONES',
  MANAGE_HOSTS: 'MANAGE_HOSTS',
  RELAY_SPEECH: 'RELAY_SPEECH'
});

/** @type {Object<string,string>} Stable error codes for programmatic handling. */
const ERROR_CODES = Object.freeze({
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  INVALID_STATE: 'INVALID_STATE',
  FORBIDDEN: 'FORBIDDEN',
  SUBSYSTEM_NOT_REGISTERED: 'SUBSYSTEM_NOT_REGISTERED',
  SUBSYSTEM_CONTRACT_VIOLATION: 'SUBSYSTEM_CONTRACT_VIOLATION'
});

/** @type {Object<string,string>} Lifecycle states for a live Stream object. */
const STREAM_STATUSES = Object.freeze({
  IDLE: 'IDLE',
  LIVE: 'LIVE',
  ENDED: 'ENDED'
});

/**
 * @type {Object<string,string>} Common device categories for the device
 * registry. `OTHER` is always available as an escape hatch so this list
 * never has to change to support a new physical form factor.
 */
const DEVICE_TYPES = Object.freeze({
  PHONE: 'PHONE',
  TABLET: 'TABLET',
  HUB: 'HUB',
  TV: 'TV',
  PROJECTOR: 'PROJECTOR',
  SPEAKER_BOX: 'SPEAKER_BOX',
  HEADPHONES: 'HEADPHONES',
  OTHER: 'OTHER'
});

/** @type {Object<string,string>} Common display categories. `OTHER` is an escape hatch. */
const DISPLAY_TYPES = Object.freeze({
  PROJECTOR: 'PROJECTOR',
  LED_WALL: 'LED_WALL',
  TV: 'TV',
  OUTDOOR_SCREEN: 'OUTDOOR_SCREEN',
  OTHER: 'OTHER'
});

/**
 * @type {Object<string,string>} Attendance capture methods. This module
 * never implements any of these detection mechanisms itself — it only
 * tags and stores the final result an upstream adapter chain already
 * produced (Attendance Adapter -> Face/QR/NFC Adapter -> CozyIdentity ->
 * this module).
 */
const ATTENDANCE_METHODS = Object.freeze({
  FACE_SCAN: 'FACE_SCAN',
  QR: 'QR',
  NFC: 'NFC',
  MANUAL: 'MANUAL',
  GUEST: 'GUEST'
});

/**
 * @type {Object<string,string>} What kind of venue/institution this
 * deployment serves. Purely descriptive — it never changes this module's
 * behavior, but lets applications and services (e.g. a Context-aware
 * translation terminology service) branch on it. `OTHER` is an escape hatch.
 */
const VENUE_KINDS = Object.freeze({
  CHURCH: 'CHURCH',
  SCHOOL: 'SCHOOL',
  HOSPITAL: 'HOSPITAL',
  CONFERENCE: 'CONFERENCE',
  GOVERNMENT: 'GOVERNMENT',
  COMMUNITY_HALL: 'COMMUNITY_HALL',
  DISASTER_RESPONSE: 'DISASTER_RESPONSE',
  EMERGENCY_SHELTER: 'EMERGENCY_SHELTER',
  OTHER: 'OTHER'
});

/**
 * @type {Object<string,string>} What a session represents. Purely
 * descriptive metadata (Venue Digital Twin / "Context Objects") that
 * downstream services may use to tailor translation terminology,
 * recording policy, or layout — this module itself makes no decisions
 * based on it.
 */
const SESSION_CONTEXTS = Object.freeze({
  SUNDAY_SERVICE: 'SUNDAY_SERVICE',
  WEDDING: 'WEDDING',
  FUNERAL: 'FUNERAL',
  CONFERENCE: 'CONFERENCE',
  BIBLE_STUDY: 'BIBLE_STUDY',
  YOUTH_SERVICE: 'YOUTH_SERVICE',
  PRAYER_MEETING: 'PRAYER_MEETING',
  OTHER: 'OTHER'
});

/**
 * @type {Object<string,string>} Physical layout feature categories for the
 * Venue Digital Twin (`createVenueFeature`). These are descriptive
 * location/coverage records only — this module never reasons about
 * coverage or placement, it just remembers what was registered.
 */
const VENUE_FEATURE_TYPES = Object.freeze({
  STAGE: 'STAGE',
  SCREEN: 'SCREEN',
  SPEAKER_POSITION: 'SPEAKER_POSITION',
  MICROPHONE_POSITION: 'MICROPHONE_POSITION',
  CAMERA_POSITION: 'CAMERA_POSITION',
  SEATING_SECTION: 'SEATING_SECTION',
  EMERGENCY_EXIT: 'EMERGENCY_EXIT',
  ACCESSIBILITY_DEVICE: 'ACCESSIBILITY_DEVICE',
  OTHER: 'OTHER'
});

/**
 * @type {Object<string,string>} Coarse device health states used by
 * `reportDeviceHealthEvent`. This module only records the state and
 * forwards FAILED events to a registered CozyResilience adapter — it
 * never predicts failure and never decides what to fail over to.
 */
const DEVICE_HEALTH_STATUSES = Object.freeze({
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  FAILED: 'FAILED'
});

/** @type {RegExp} Defensive rejection of anything that smells like a secret. */
const FORBIDDEN_FIELD_PATTERN = /(password|secret|token|apikey|api_key|credential|privatekey|private_key)/i;

/** @type {Object} Frozen module metadata surfaced through getMetadata(). */
const METADATA = Object.freeze({
  name: 'ourcozy-live',
  version: VERSION,
  kernelTarget: 'CozyOS Kernel v2+',
  role: 'central-orchestration-engine',
  isMediaEngine: false,
  isTranslationEngine: false,
  isNetworkEngine: false,
  isAIEngine: false
});

/* ----------------------------------------------------------------------- *
 * SECTION 2: UTILITIES
 * ----------------------------------------------------------------------- */

let __idCounter = 0;

/**
 * Generates a collision-resistant identifier for entities created by this
 * module. Not cryptographically secure — identity/security guarantees are
 * the responsibility of CozyIdentity.
 * @param {string} prefix - short entity prefix, e.g. "sess", "room".
 * @returns {string}
 */
function generateId(prefix) {
  __idCounter += 1;
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${__idCounter.toString(36)}_${rand}`;
}

/**
 * Recursively freezes a plain object/array graph so it is safe to hand
 * across the public API boundary without risking internal state mutation
 * by the caller. Only touches plain objects/arrays; leaves functions
 * (e.g. unsubscribe handles) untouched since freezing does not affect
 * function callability.
 * @param {*} value
 * @returns {*} the same value, deeply frozen
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  const keys = Object.getOwnPropertyNames(value);
  for (const key of keys) {
    const child = value[key];
    if (child && typeof child === 'object' && !Object.isFrozen(child)) {
      deepFreeze(child);
    }
  }
  return value;
}

/**
 * Produces a deep, plain-data clone (no functions, no class instances)
 * suitable for freezing and returning across the public API, or for
 * serialization via exportSession. Functions are dropped intentionally:
 * adapters and callbacks must never leak into snapshots.
 * @param {*} value
 * @returns {*}
 */
function cloneData(value) {
  if (value === undefined || typeof value === 'function') {
    return undefined;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => {
      const cloned = cloneData(item);
      return cloned === undefined ? null : cloned;
    });
  }
  if (value instanceof Map) {
    const out = {};
    for (const [k, v] of value.entries()) {
      const c = cloneData(v);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  if (value instanceof Set) {
    return Array.from(value.values()).map(cloneData);
  }
  const out = {};
  for (const key of Object.keys(value)) {
    const c = cloneData(value[key]);
    if (c !== undefined) out[key] = c;
  }
  return out;
}

/**
 * Rejects payloads carrying anything resembling a secret/credential. This
 * module must never store credentials (architectural rule).
 * @param {Object} obj
 * @throws {CozyLiveError} if a forbidden field name is present
 */
function assertNoSecrets(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_FIELD_PATTERN.test(key)) {
      throw new CozyLiveError(
        ERROR_CODES.FORBIDDEN,
        `Field "${key}" looks like a credential/secret. This module never stores credentials.`
      );
    }
  }
}

/**
 * Enterprise error type carrying a stable machine-readable code.
 */
class CozyLiveError extends Error {
  /**
   * @param {string} code - one of ERROR_CODES
   * @param {string} message - human readable description
   * @param {Object} [details] - optional structured context
   */
  constructor(code, message, details) {
    super(message);
    this.name = 'CozyLiveError';
    this.code = code;
    this.details = details ? deepFreeze(cloneData(details)) : undefined;
  }
}

function assert(condition, code, message, details) {
  if (!condition) {
    throw new CozyLiveError(code, message, details);
  }
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Minimal, dependency-free enterprise event emitter used internally to
 * back the public on/once/off surface. Synchronous dispatch; a throwing
 * handler does not prevent other handlers from running, and is instead
 * reported via the SYSTEM_ERROR event on the next tick of the same emit
 * cycle (best-effort; never throws back into the mutation that caused it).
 */
class InternalEventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._handlers = new Map();
  }

  on(eventName, handler) {
    assert(isNonEmptyString(eventName), ERROR_CODES.INVALID_ARGUMENT, 'eventName must be a non-empty string');
    assert(typeof handler === 'function', ERROR_CODES.INVALID_ARGUMENT, 'handler must be a function');
    if (!this._handlers.has(eventName)) {
      this._handlers.set(eventName, new Set());
    }
    this._handlers.get(eventName).add(handler);
    return () => this.off(eventName, handler);
  }

  once(eventName, handler) {
    const wrapped = (payload) => {
      this.off(eventName, wrapped);
      handler(payload);
    };
    return this.on(eventName, wrapped);
  }

  off(eventName, handler) {
    const set = this._handlers.get(eventName);
    if (!set) return false;
    const removed = set.delete(handler);
    if (set.size === 0) this._handlers.delete(eventName);
    return removed;
  }

  emit(eventName, payload) {
    const set = this._handlers.get(eventName);
    if (!set || set.size === 0) return 0;
    let dispatched = 0;
    for (const handler of Array.from(set)) {
      try {
        handler(payload);
        dispatched += 1;
      } catch (err) {
        const errSet = this._handlers.get(EVENT_TYPES.SYSTEM_ERROR);
        if (errSet && eventName !== EVENT_TYPES.SYSTEM_ERROR) {
          for (const errHandler of Array.from(errSet)) {
            try {
              errHandler({
                sourceEvent: eventName,
                message: err && err.message ? err.message : String(err)
              });
            } catch (_ignored) {
              /* swallow — a broken error handler must never crash the bus */
            }
          }
        }
      }
    }
    return dispatched;
  }

  listenerCount(eventName) {
    const set = this._handlers.get(eventName);
    return set ? set.size : 0;
  }
}

/* ----------------------------------------------------------------------- *
 * SECTION 3: FACTORY
 * ----------------------------------------------------------------------- */

/**
 * Creates an isolated OurCozy Live orchestration engine instance.
 *
 * Each instance owns its own private state (sessions, rooms, zones,
 * channels, participants, hosts, permissions, subsystem registry, event
 * bus). Nothing is shared across instances, which allows a single process
 * to coordinate multiple independent events (e.g. multiple churches on
 * one Regional Host) if the embedding CozyKernel chooses to do so.
 *
 * @param {Object} [options]
 * @param {Object} [options.logger] - optional object with a `log(level, message, meta)`
 *   method. If omitted, diagnostics are tracked internally but nothing is
 *   printed. This is NOT the CozyLogger subsystem contract — it is a local
 *   convenience hook. Use `registerSubsystem('CozyLogger', adapter)` for the
 *   real integration point.
 * @returns {Readonly<Object>} a frozen public API object
 */
function createOurCozyLive(options) {
  const opts = options || {};
  const localLogger = opts.logger && typeof opts.logger.log === 'function' ? opts.logger : null;

  /* ---------------------- PRIVATE STATE (closure-scoped) ---------------------- */

  /** @type {Map<string, Object>} sessionId -> session record */
  const sessions = new Map();
  /** @type {Map<string, Map<string, Object>>} sessionId -> participantId -> participant */
  const participantsBySession = new Map();
  /** @type {Map<string, Map<string, Object>>} sessionId -> roomId -> room */
  const roomsBySession = new Map();
  /** @type {Map<string, Map<string, Object>>} sessionId -> zoneId -> zone */
  const zonesBySession = new Map();
  /** @type {Map<string, Map<string, Object>>} roomId -> languageChannelId -> channel */
  const languageChannelsByRoom = new Map();
  /** @type {Map<string, Map<string, Object>>} languageChannelId -> audioChannelId -> channel */
  const audioChannelsByLanguageChannel = new Map();
  /** @type {Map<string, Map<string, Object>>} languageChannelId -> subtitleChannelId -> channel */
  const subtitleChannelsByLanguageChannel = new Map();
  /** @type {Map<string, Object>} hostId -> host record */
  const hosts = new Map();
  /** @type {Map<string, Set<string>>} sessionId -> Set<participantId> (moderators) */
  const moderatorsBySession = new Map();
  /** @type {Map<string, Map<string, Set<string>>>} sessionId -> participantId -> Set<permission> */
  const permissionsBySession = new Map();
  /** @type {Map<string, Object[]>} sessionId -> announcements[] */
  const announcementsBySession = new Map();
  /** @type {Map<string, Object>} subsystem name -> adapter */
  const subsystems = new Map();
  /** @type {Map<string, Object>} sessionId -> diagnostics counters */
  const diagnosticsBySession = new Map();
  /** @type {Set<string>} custom event type names registered by future features */
  const customEventTypes = new Set();

  /** @type {Map<string, Map<string, Object>>} roomId -> streamId -> Stream record */
  const streamsByRoom = new Map();
  /** @type {Map<string, Map<string, Object>>} streamId -> translationStreamId -> TranslationStream record */
  const translationStreamsByStream = new Map();

  /** @type {Map<string, Map<string, Object>>} sessionId -> speakerId -> speaker record */
  const speakersBySession = new Map();
  /** @type {Map<string, string>} roomId -> currently active speakerId */
  const activeSpeakerByRoom = new Map();

  /** @type {Map<string, Map<string, Object>>} sessionId -> cameraId -> camera record */
  const camerasBySession = new Map();
  /** @type {Map<string, Map<string, Object>>} sessionId -> displayId -> display record */
  const displaysBySession = new Map();
  /** @type {Map<string, Map<string, Object>>} sessionId -> deviceId -> device record */
  const devicesBySession = new Map();

  /** @type {Map<string, Object[]>} sessionId -> attendance records[] */
  const attendanceBySession = new Map();

  /** @type {Map<string, Object>} plugin name -> plugin adapter (bookkeeping only, never invoked directly) */
  const plugins = new Map();

  /** @type {Map<string, Object[]>} sessionId -> ordered timeline of recorded segments */
  const timelineBySession = new Map();
  /** @type {Map<string, number>} sessionId -> next monotonic sequence number */
  const sequenceCounterBySession = new Map();

  /** @type {Map<string, Object>} venueId -> venue record */
  const venues = new Map();
  /** @type {Map<string, Map<string, Object>>} venueId -> buildingId -> building record */
  const buildingsByVenue = new Map();
  /** @type {Map<string, Map<string, Object>>} buildingId -> floorId -> floor record */
  const floorsByBuilding = new Map();
  /** @type {Map<string, Object>} floorId -> floor record (flat index for cross-building lookups) */
  const floorsById = new Map();
  /** @type {Map<string, Map<string, Object>>} roomId -> featureId -> venue feature record */
  const venueFeaturesByRoom = new Map();
  /** @type {Map<string, Map<string, Object>>} sessionId -> participantId -> accessibility preferences */
  const accessibilityPrefsBySession = new Map();
  /** @type {Map<string, Map<string, *>>} venueId -> preference key -> value (Local Knowledge Base) */
  const venuePreferences = new Map();
  /** @type {Map<string, Object>} service name -> { adapter, capabilities, registeredAt } (open Service Registry) */
  const services = new Map();

  /* --- Cozy Event Graph: a lightweight node/edge mirror of the entities --- *
   * this module already tracks in the concrete maps above. The concrete   *
   * maps remain the source of truth; the graph exists purely so callers   *
   * can traverse relationships (Venue -> Room -> Speaker -> Stream ->     *
   * Translation -> Subtitle -> Display -> Participant) without this       *
   * module implementing any traversal logic itself beyond adjacency       *
   * lookup. Nodes reuse the id of their underlying entity. */
  /** @type {Map<string, Object>} nodeId -> { id, type, sessionId, data, createdAt } */
  const graphNodes = new Map();
  /** @type {Map<string, Object>} edgeId -> { id, from, to, relation, createdAt } */
  const graphEdgeRecords = new Map();
  /** @type {Map<string, Set<string>>} nodeId -> Set<edgeId> where node is the `from` */
  const graphEdgesOut = new Map();
  /** @type {Map<string, Set<string>>} nodeId -> Set<edgeId> where node is the `to` */
  const graphEdgesIn = new Map();

  /** @type {Map<string, Set<string>>} sessionId -> Set<nodeId>, so endSession can cascade-clean the graph */
  const graphNodesBySession = new Map();

  const bus = new InternalEventBus();

  /* ---------------------- PRIVATE HELPERS ---------------------- */

  function log(level, message, meta) {
    if (localLogger) {
      try {
        localLogger.log(level, message, meta);
      } catch (_ignored) {
        /* a broken local logger must never break orchestration */
      }
    }
  }

  function emit(eventName, payload) {
    const finalPayload = deepFreeze(
      Object.assign({ eventType: eventName, timestamp: Date.now() }, cloneData(payload) || {})
    );
    bus.emit(eventName, finalPayload);
    return finalPayload;
  }

  function ensureDiagnostics(sessionId) {
    if (!diagnosticsBySession.has(sessionId)) {
      diagnosticsBySession.set(sessionId, {
        participantsJoined: 0,
        participantsLeft: 0,
        roomsCreated: 0,
        roomsRemoved: 0,
        zonesCreated: 0,
        announcementsBroadcast: 0,
        segmentsRelayed: 0,
        warnings: 0,
        errors: 0,
        createdAt: Date.now()
      });
    }
    return diagnosticsBySession.get(sessionId);
  }

  function bumpDiagnostic(sessionId, field, amount) {
    const d = ensureDiagnostics(sessionId);
    d[field] = (d[field] || 0) + (amount === undefined ? 1 : amount);
  }

  function getSessionOrThrow(sessionId) {
    assert(isNonEmptyString(sessionId), ERROR_CODES.INVALID_ARGUMENT, 'sessionId must be a non-empty string');
    const session = sessions.get(sessionId);
    assert(!!session, ERROR_CODES.NOT_FOUND, `Session "${sessionId}" was not found`, { sessionId });
    return session;
  }

  function getRoomsMap(sessionId) {
    if (!roomsBySession.has(sessionId)) roomsBySession.set(sessionId, new Map());
    return roomsBySession.get(sessionId);
  }

  function getZonesMap(sessionId) {
    if (!zonesBySession.has(sessionId)) zonesBySession.set(sessionId, new Map());
    return zonesBySession.get(sessionId);
  }

  function getParticipantsMap(sessionId) {
    if (!participantsBySession.has(sessionId)) participantsBySession.set(sessionId, new Map());
    return participantsBySession.get(sessionId);
  }

  function getRoomOrThrow(sessionId, roomId) {
    assert(isNonEmptyString(roomId), ERROR_CODES.INVALID_ARGUMENT, 'roomId must be a non-empty string');
    const room = getRoomsMap(sessionId).get(roomId);
    assert(!!room, ERROR_CODES.NOT_FOUND, `Room "${roomId}" was not found in session "${sessionId}"`, {
      sessionId,
      roomId
    });
    return room;
  }

  function getLanguageChannelsMap(roomId) {
    if (!languageChannelsByRoom.has(roomId)) languageChannelsByRoom.set(roomId, new Map());
    return languageChannelsByRoom.get(roomId);
  }

  function getLanguageChannelOrThrow(roomId, channelId) {
    assert(isNonEmptyString(channelId), ERROR_CODES.INVALID_ARGUMENT, 'languageChannelId must be a non-empty string');
    const channel = getLanguageChannelsMap(roomId).get(channelId);
    assert(!!channel, ERROR_CODES.NOT_FOUND, `Language channel "${channelId}" not found in room "${roomId}"`, {
      roomId,
      channelId
    });
    return channel;
  }

  function findLanguageChannelAnywhere(sessionId, languageChannelId) {
    const rooms = getRoomsMap(sessionId);
    for (const room of rooms.values()) {
      const channels = getLanguageChannelsMap(room.id);
      if (channels.has(languageChannelId)) {
        return { room, channel: channels.get(languageChannelId) };
      }
    }
    return null;
  }

  function toPublicSession(session) {
    return deepFreeze(cloneData(session));
  }

  function toPublicRoom(room) {
    return deepFreeze(cloneData(room));
  }

  function toPublicZone(zone) {
    return deepFreeze(cloneData(zone));
  }

  function toPublicParticipant(participant) {
    return deepFreeze(cloneData(participant));
  }

  function toPublicChannel(channel) {
    return deepFreeze(cloneData(channel));
  }

  function toPublicHost(host) {
    return deepFreeze(cloneData(host));
  }

  function toPublicSnapshot(entity) {
    return deepFreeze(cloneData(entity));
  }

  function getStreamsMap(roomId) {
    if (!streamsByRoom.has(roomId)) streamsByRoom.set(roomId, new Map());
    return streamsByRoom.get(roomId);
  }

  function getStreamOrThrow(sessionId, roomId, streamId) {
    assert(isNonEmptyString(streamId), ERROR_CODES.INVALID_ARGUMENT, 'streamId must be a non-empty string');
    const stream = getStreamsMap(roomId).get(streamId);
    assert(!!stream, ERROR_CODES.NOT_FOUND, `Stream "${streamId}" not found in room "${roomId}"`, {
      sessionId,
      roomId,
      streamId
    });
    return stream;
  }

  function getTranslationStreamsMap(streamId) {
    if (!translationStreamsByStream.has(streamId)) translationStreamsByStream.set(streamId, new Map());
    return translationStreamsByStream.get(streamId);
  }

  function getSpeakersMap(sessionId) {
    if (!speakersBySession.has(sessionId)) speakersBySession.set(sessionId, new Map());
    return speakersBySession.get(sessionId);
  }

  function getSpeakerOrThrow(sessionId, speakerId) {
    assert(isNonEmptyString(speakerId), ERROR_CODES.INVALID_ARGUMENT, 'speakerId must be a non-empty string');
    const speaker = getSpeakersMap(sessionId).get(speakerId);
    assert(!!speaker, ERROR_CODES.NOT_FOUND, `Speaker "${speakerId}" not found in session "${sessionId}"`);
    return speaker;
  }

  function getCamerasMap(sessionId) {
    if (!camerasBySession.has(sessionId)) camerasBySession.set(sessionId, new Map());
    return camerasBySession.get(sessionId);
  }

  function getDisplaysMap(sessionId) {
    if (!displaysBySession.has(sessionId)) displaysBySession.set(sessionId, new Map());
    return displaysBySession.get(sessionId);
  }

  function getDevicesMap(sessionId) {
    if (!devicesBySession.has(sessionId)) devicesBySession.set(sessionId, new Map());
    return devicesBySession.get(sessionId);
  }

  function nextSequenceNumber(sessionId) {
    const current = sequenceCounterBySession.get(sessionId) || 0;
    const next = current + 1;
    sequenceCounterBySession.set(sessionId, next);
    return next;
  }

  function getBuildingsMap(venueId) {
    if (!buildingsByVenue.has(venueId)) buildingsByVenue.set(venueId, new Map());
    return buildingsByVenue.get(venueId);
  }

  function getFloorsMap(buildingId) {
    if (!floorsByBuilding.has(buildingId)) floorsByBuilding.set(buildingId, new Map());
    return floorsByBuilding.get(buildingId);
  }

  function getVenueFeaturesMap(roomId) {
    if (!venueFeaturesByRoom.has(roomId)) venueFeaturesByRoom.set(roomId, new Map());
    return venueFeaturesByRoom.get(roomId);
  }

  function getAccessibilityPrefsMap(sessionId) {
    if (!accessibilityPrefsBySession.has(sessionId)) accessibilityPrefsBySession.set(sessionId, new Map());
    return accessibilityPrefsBySession.get(sessionId);
  }

  function getVenuePreferencesMap(venueId) {
    if (!venuePreferences.has(venueId)) venuePreferences.set(venueId, new Map());
    return venuePreferences.get(venueId);
  }

  function getVenueOrThrow(venueId) {
    assert(isNonEmptyString(venueId), ERROR_CODES.INVALID_ARGUMENT, 'venueId must be a non-empty string');
    const venue = venues.get(venueId);
    assert(!!venue, ERROR_CODES.NOT_FOUND, `Venue "${venueId}" not found`);
    return venue;
  }

  function getBuildingOrThrow(venueId, buildingId) {
    assert(isNonEmptyString(buildingId), ERROR_CODES.INVALID_ARGUMENT, 'buildingId must be a non-empty string');
    const building = getBuildingsMap(venueId).get(buildingId);
    assert(!!building, ERROR_CODES.NOT_FOUND, `Building "${buildingId}" not found in venue "${venueId}"`);
    return building;
  }

  function floorExists(floorId) {
    return floorsById.has(floorId);
  }

  function getFloorOrThrow(floorId) {
    assert(isNonEmptyString(floorId), ERROR_CODES.INVALID_ARGUMENT, 'floorId must be a non-empty string');
    const floor = floorsById.get(floorId);
    assert(!!floor, ERROR_CODES.NOT_FOUND, `Floor "${floorId}" not found`);
    return floor;
  }

  /* --- Cozy Event Graph helpers --- */

  function graphUpsertNode(type, id, sessionId, data) {
    const node = { id, type, sessionId: sessionId || null, data: cloneData(data) || {}, createdAt: Date.now() };
    graphNodes.set(id, node);
    if (sessionId) {
      if (!graphNodesBySession.has(sessionId)) graphNodesBySession.set(sessionId, new Set());
      graphNodesBySession.get(sessionId).add(id);
    }
    return node;
  }

  function graphAddEdgeInternal(fromId, toId, relation) {
    const id = generateId('edge');
    const edge = { id, from: fromId, to: toId, relation, createdAt: Date.now() };
    graphEdgeRecords.set(id, edge);
    if (!graphEdgesOut.has(fromId)) graphEdgesOut.set(fromId, new Set());
    graphEdgesOut.get(fromId).add(id);
    if (!graphEdgesIn.has(toId)) graphEdgesIn.set(toId, new Set());
    graphEdgesIn.get(toId).add(id);
    return edge;
  }

  function graphRemoveEdgeInternal(edgeId) {
    const edge = graphEdgeRecords.get(edgeId);
    if (!edge) return false;
    graphEdgeRecords.delete(edgeId);
    const out = graphEdgesOut.get(edge.from);
    if (out) out.delete(edgeId);
    const inc = graphEdgesIn.get(edge.to);
    if (inc) inc.delete(edgeId);
    return true;
  }

  function graphRemoveNodeInternal(id) {
    if (!graphNodes.has(id)) return false;
    const node = graphNodes.get(id);
    graphNodes.delete(id);
    if (node.sessionId && graphNodesBySession.has(node.sessionId)) {
      graphNodesBySession.get(node.sessionId).delete(id);
    }
    const out = graphEdgesOut.get(id) || new Set();
    const inc = graphEdgesIn.get(id) || new Set();
    for (const edgeId of Array.from(out)) graphRemoveEdgeInternal(edgeId);
    for (const edgeId of Array.from(inc)) graphRemoveEdgeInternal(edgeId);
    graphEdgesOut.delete(id);
    graphEdgesIn.delete(id);
    return true;
  }

  function toPublicGraphNode(node) {
    return deepFreeze(cloneData(node));
  }

  function toPublicGraphEdge(edge) {
    return deepFreeze(cloneData(edge));
  }

  /* ============================================================= *
   * SESSION LIFECYCLE
   * ============================================================= */

  /**
   * Creates a new live session in the CREATED state. Does not start
   * distribution — call `startSession` when ready. Emits SESSION_CREATED.
   *
   * @param {Object} config
   * @param {string} config.title - human readable session title
   * @param {string} [config.primaryLanguage='en'] - BCP-47-ish language code spoken by the speaker
   * @param {string} [config.venueId] - links this session to a venue registered via `registerVenue`
   * @param {string} [config.context] - one of SESSION_CONTEXTS, or a custom string for a future context
   * @param {Object} [config.metadata] - arbitrary event metadata (no secrets permitted)
   * @returns {Readonly<Object>} the created session snapshot
   * @throws {CozyLiveError} INVALID_ARGUMENT if config is malformed
   */
  function createSession(config) {
    assert(config && typeof config === 'object', ERROR_CODES.INVALID_ARGUMENT, 'config object is required');
    assert(isNonEmptyString(config.title), ERROR_CODES.INVALID_ARGUMENT, 'config.title must be a non-empty string');
    assertNoSecrets(config.metadata);
    if (config.venueId) {
      getVenueOrThrow(config.venueId);
    }

    const id = generateId('sess');
    const session = {
      id,
      title: config.title,
      primaryLanguage: config.primaryLanguage || 'en',
      venueId: config.venueId || null,
      context: config.context || null,
      metadata: cloneData(config.metadata) || {},
      state: SESSION_STATES.CREATED,
      createdAt: Date.now(),
      startedAt: null,
      stoppedAt: null
    };
    sessions.set(id, session);
    getRoomsMap(id);
    getZonesMap(id);
    getParticipantsMap(id);
    moderatorsBySession.set(id, new Set());
    permissionsBySession.set(id, new Map());
    announcementsBySession.set(id, []);
    ensureDiagnostics(id);

    graphUpsertNode('session', id, id, { title: session.title });
    if (session.venueId) {
      graphAddEdgeInternal(session.venueId, id, 'hosts_session');
    }

    emit(EVENT_TYPES.SESSION_CREATED, { sessionId: id, session: cloneData(session) });
    return toPublicSession(session);
  }

  /**
   * Updates a session's context (e.g. from SUNDAY_SERVICE to a special
   * WEDDING context for a one-off event). Purely descriptive — downstream
   * services may use it to tailor behavior; this module does not. Emits
   * SESSION_CONTEXT_CHANGED.
   * @param {string} sessionId
   * @param {string} context - one of SESSION_CONTEXTS, or a custom string
   * @returns {Readonly<Object>} updated session snapshot
   */
  function updateSessionContext(sessionId, context) {
    const session = getSessionOrThrow(sessionId);
    assert(isNonEmptyString(context), ERROR_CODES.INVALID_ARGUMENT, 'context must be a non-empty string');
    const previousContext = session.context;
    session.context = context;
    emit(EVENT_TYPES.SESSION_CONTEXT_CHANGED, { sessionId, previousContext, context });
    return toPublicSession(session);
  }

  /**
   * Transitions a session from CREATED (or STOPPED) into STARTED.
   * Emits SESSION_STARTED.
   * @param {string} sessionId
   * @returns {Readonly<Object>} updated session snapshot
   */
  function startSession(sessionId) {
    const session = getSessionOrThrow(sessionId);
    assert(
      session.state !== SESSION_STATES.STARTED,
      ERROR_CODES.INVALID_STATE,
      `Session "${sessionId}" is already started`
    );
    session.state = SESSION_STATES.STARTED;
    session.startedAt = Date.now();
    emit(EVENT_TYPES.SESSION_STARTED, { sessionId, session: cloneData(session) });
    return toPublicSession(session);
  }

  /**
   * Stops distribution for a session. Participants remain joined (they can
   * still be listed) but the session is marked STOPPED. Emits
   * SESSION_STOPPED.
   * @param {string} sessionId
   * @returns {Readonly<Object>} updated session snapshot
   */
  function stopSession(sessionId) {
    const session = getSessionOrThrow(sessionId);
    assert(
      session.state === SESSION_STATES.STARTED,
      ERROR_CODES.INVALID_STATE,
      `Session "${sessionId}" is not currently started`
    );
    session.state = SESSION_STATES.STOPPED;
    session.stoppedAt = Date.now();
    emit(EVENT_TYPES.SESSION_STOPPED, { sessionId, session: cloneData(session) });
    return toPublicSession(session);
  }

  /**
   * Permanently ends a session and releases all associated in-memory
   * state (rooms, zones, channels, participants, permissions,
   * announcements, diagnostics). This is irreversible. Emits
   * SESSION_ENDED.
   * @param {string} sessionId
   * @returns {boolean} true if the session existed and was ended
   */
  function endSession(sessionId) {
    const session = getSessionOrThrow(sessionId);
    const rooms = getRoomsMap(sessionId);
    for (const room of rooms.values()) {
      const channels = getLanguageChannelsMap(room.id);
      for (const channel of channels.values()) {
        audioChannelsByLanguageChannel.delete(channel.id);
        subtitleChannelsByLanguageChannel.delete(channel.id);
      }
      languageChannelsByRoom.delete(room.id);

      const streams = getStreamsMap(room.id);
      for (const stream of streams.values()) {
        translationStreamsByStream.delete(stream.id);
      }
      streamsByRoom.delete(room.id);
      activeSpeakerByRoom.delete(room.id);
      venueFeaturesByRoom.delete(room.id);
    }
    roomsBySession.delete(sessionId);
    zonesBySession.delete(sessionId);
    participantsBySession.delete(sessionId);
    moderatorsBySession.delete(sessionId);
    permissionsBySession.delete(sessionId);
    announcementsBySession.delete(sessionId);
    diagnosticsBySession.delete(sessionId);
    speakersBySession.delete(sessionId);
    camerasBySession.delete(sessionId);
    displaysBySession.delete(sessionId);
    devicesBySession.delete(sessionId);
    attendanceBySession.delete(sessionId);
    timelineBySession.delete(sessionId);
    sequenceCounterBySession.delete(sessionId);
    accessibilityPrefsBySession.delete(sessionId);

    // Cascade-remove every graph node this session ever mirrored (room,
    // stream, translationStream, speaker, camera, display, participant,
    // segment, venueFeature, and the session node itself). Venue/building/
    // floor nodes are session-independent and are intentionally untouched.
    const nodeIds = graphNodesBySession.get(sessionId);
    if (nodeIds) {
      for (const nodeId of Array.from(nodeIds)) {
        graphRemoveNodeInternal(nodeId);
      }
    }
    graphNodesBySession.delete(sessionId);

    sessions.delete(sessionId);

    emit(EVENT_TYPES.SESSION_ENDED, { sessionId, session: cloneData(session) });
    return true;
  }

  /**
   * @param {string} sessionId
   * @returns {Readonly<Object>} session snapshot
   */
  function getSession(sessionId) {
    return toPublicSession(getSessionOrThrow(sessionId));
  }

  /**
   * @returns {Readonly<Object[]>} snapshot of every known session
   */
  function listSessions() {
    return deepFreeze(Array.from(sessions.values()).map((s) => cloneData(s)));
  }

  /* ============================================================= *
   * PARTICIPANT MANAGEMENT
   * ============================================================= */

  /**
   * Joins a participant to a session. The session need not be STARTED
   * (people may join a lobby before the event begins). Emits
   * PARTICIPANT_JOINED.
   *
   * @param {string} sessionId
   * @param {Object} participant
   * @param {string} participant.id - caller-supplied stable participant id
   *   (identity verification belongs to CozyIdentity; this module trusts
   *   the id it is given)
   * @param {string} [participant.displayName]
   * @param {string} [participant.languageCode='en'] - preferred listening language
   * @param {string} [participant.roomId] - optional initial room assignment
   * @returns {Readonly<Object>} participant snapshot
   */
  function joinSession(sessionId, participant) {
    getSessionOrThrow(sessionId);
    assert(participant && typeof participant === 'object', ERROR_CODES.INVALID_ARGUMENT, 'participant object is required');
    assert(isNonEmptyString(participant.id), ERROR_CODES.INVALID_ARGUMENT, 'participant.id must be a non-empty string');
    assertNoSecrets(participant);

    const pMap = getParticipantsMap(sessionId);
    assert(
      !pMap.has(participant.id),
      ERROR_CODES.ALREADY_EXISTS,
      `Participant "${participant.id}" already joined session "${sessionId}"`
    );

    if (participant.roomId) {
      getRoomOrThrow(sessionId, participant.roomId);
    }

    const record = {
      id: participant.id,
      displayName: participant.displayName || participant.id,
      languageCode: participant.languageCode || 'en',
      roomId: participant.roomId || null,
      joinedAt: Date.now(),
      leftAt: null
    };
    pMap.set(participant.id, record);
    bumpDiagnostic(sessionId, 'participantsJoined');

    const graphNodeId = `participant:${sessionId}:${participant.id}`;
    graphUpsertNode('participant', graphNodeId, sessionId, { displayName: record.displayName });
    graphAddEdgeInternal(sessionId, graphNodeId, 'has_participant');
    if (record.roomId) graphAddEdgeInternal(record.roomId, graphNodeId, 'has_participant');

    emit(EVENT_TYPES.PARTICIPANT_JOINED, { sessionId, participant: cloneData(record) });
    return toPublicParticipant(record);
  }

  /**
   * Removes a participant from a session's active roster. Emits
   * PARTICIPANT_LEFT.
   * @param {string} sessionId
   * @param {string} participantId
   * @returns {boolean} true if the participant existed and left
   */
  function leaveSession(sessionId, participantId) {
    getSessionOrThrow(sessionId);
    const pMap = getParticipantsMap(sessionId);
    const record = pMap.get(participantId);
    assert(!!record, ERROR_CODES.NOT_FOUND, `Participant "${participantId}" not found in session "${sessionId}"`);
    pMap.delete(participantId);
    bumpDiagnostic(sessionId, 'participantsLeft');
    const leftRecord = Object.assign({}, record, { leftAt: Date.now() });
    emit(EVENT_TYPES.PARTICIPANT_LEFT, { sessionId, participant: cloneData(leftRecord) });
    return true;
  }

  /**
   * @param {string} sessionId
   * @param {string} participantId
   * @returns {Readonly<Object>} participant snapshot
   */
  function getParticipant(sessionId, participantId) {
    getSessionOrThrow(sessionId);
    const record = getParticipantsMap(sessionId).get(participantId);
    assert(!!record, ERROR_CODES.NOT_FOUND, `Participant "${participantId}" not found in session "${sessionId}"`);
    return toPublicParticipant(record);
  }

  /**
   * @param {string} sessionId
   * @returns {Readonly<Object[]>} all participants currently in the session
   */
  function listParticipants(sessionId) {
    getSessionOrThrow(sessionId);
    return deepFreeze(Array.from(getParticipantsMap(sessionId).values()).map((p) => cloneData(p)));
  }

  /**
   * Updates which language a participant wants to receive. This only
   * updates coordination state; it is the injected CozyTranslate/CozySpeech
   * adapters that actually produce audio/text in that language. Emits
   * PARTICIPANT_LANGUAGE_CHANGED and the higher-level LANGUAGE_CHANGED.
   * @param {string} sessionId
   * @param {string} participantId
   * @param {string} languageCode
   * @returns {Readonly<Object>} updated participant snapshot
   */
  function updateParticipantLanguage(sessionId, participantId, languageCode) {
    getSessionOrThrow(sessionId);
    assert(isNonEmptyString(languageCode), ERROR_CODES.INVALID_ARGUMENT, 'languageCode must be a non-empty string');
    const pMap = getParticipantsMap(sessionId);
    const record = pMap.get(participantId);
    assert(!!record, ERROR_CODES.NOT_FOUND, `Participant "${participantId}" not found in session "${sessionId}"`);
    const previousLanguage = record.languageCode;
    record.languageCode = languageCode;
    emit(EVENT_TYPES.PARTICIPANT_LANGUAGE_CHANGED, {
      sessionId,
      participantId,
      previousLanguage,
      languageCode
    });
    emit(EVENT_TYPES.LANGUAGE_CHANGED, { sessionId, participantId, previousLanguage, languageCode });
    return toPublicParticipant(record);
  }

  /**
   * Assigns (or re-assigns) a participant to a room. Emits
   * PARTICIPANT_ROOM_ASSIGNED.
   * @param {string} sessionId
   * @param {string} participantId
   * @param {string} roomId
   * @returns {Readonly<Object>} updated participant snapshot
   */
  function assignParticipantToRoom(sessionId, participantId, roomId) {
    getSessionOrThrow(sessionId);
    getRoomOrThrow(sessionId, roomId);
    const pMap = getParticipantsMap(sessionId);
    const record = pMap.get(participantId);
    assert(!!record, ERROR_CODES.NOT_FOUND, `Participant "${participantId}" not found in session "${sessionId}"`);
    const previousRoomId = record.roomId;
    record.roomId = roomId;
    emit(EVENT_TYPES.PARTICIPANT_ROOM_ASSIGNED, { sessionId, participantId, previousRoomId, roomId });
    return toPublicParticipant(record);
  }

  /* ============================================================= *
   * ROOM MANAGEMENT
   * ============================================================= */

  /**
   * Creates a room within a session (e.g. "Main Sanctuary", "Arabic Room").
   * Emits ROOM_CREATED.
   * @param {string} sessionId
   * @param {Object} roomConfig
   * @param {string} roomConfig.name
   * @param {string} [roomConfig.zoneId] - optional zone this room belongs to
   * @param {string} [roomConfig.floorId] - optional Venue Digital Twin floor this room is physically on
   * @param {Object} [roomConfig.metadata]
   * @returns {Readonly<Object>} room snapshot
   */
  function createRoom(sessionId, roomConfig) {
    getSessionOrThrow(sessionId);
    assert(roomConfig && typeof roomConfig === 'object', ERROR_CODES.INVALID_ARGUMENT, 'roomConfig is required');
    assert(isNonEmptyString(roomConfig.name), ERROR_CODES.INVALID_ARGUMENT, 'roomConfig.name must be a non-empty string');
    assertNoSecrets(roomConfig.metadata);

    if (roomConfig.zoneId) {
      const zones = getZonesMap(sessionId);
      assert(zones.has(roomConfig.zoneId), ERROR_CODES.NOT_FOUND, `Zone "${roomConfig.zoneId}" not found`);
    }
    if (roomConfig.floorId) {
      assert(
        floorExists(roomConfig.floorId),
        ERROR_CODES.NOT_FOUND,
        `Floor "${roomConfig.floorId}" not found`
      );
    }

    const id = generateId('room');
    const room = {
      id,
      sessionId,
      name: roomConfig.name,
      zoneId: roomConfig.zoneId || null,
      floorId: roomConfig.floorId || null,
      metadata: cloneData(roomConfig.metadata) || {},
      createdAt: Date.now()
    };
    getRoomsMap(sessionId).set(id, room);
    getLanguageChannelsMap(id);
    bumpDiagnostic(sessionId, 'roomsCreated');

    graphUpsertNode('room', id, sessionId, { name: room.name });
    graphAddEdgeInternal(sessionId, id, 'has_room');
    if (room.floorId) {
      graphAddEdgeInternal(room.floorId, id, 'has_room');
    }

    emit(EVENT_TYPES.ROOM_CREATED, { sessionId, room: cloneData(room) });
    return toPublicRoom(room);
  }

  /**
   * Updates mutable room fields (name, zoneId, metadata). Emits
   * ROOM_UPDATED.
   * @param {string} sessionId
   * @param {string} roomId
   * @param {Object} updates
   * @returns {Readonly<Object>} updated room snapshot
   */
  function updateRoom(sessionId, roomId, updates) {
    const room = getRoomOrThrow(sessionId, roomId);
    assert(updates && typeof updates === 'object', ERROR_CODES.INVALID_ARGUMENT, 'updates object is required');
    assertNoSecrets(updates.metadata);

    if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
      assert(isNonEmptyString(updates.name), ERROR_CODES.INVALID_ARGUMENT, 'updates.name must be a non-empty string');
      room.name = updates.name;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'zoneId')) {
      if (updates.zoneId) {
        assert(getZonesMap(sessionId).has(updates.zoneId), ERROR_CODES.NOT_FOUND, `Zone "${updates.zoneId}" not found`);
      }
      room.zoneId = updates.zoneId || null;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'metadata')) {
      room.metadata = cloneData(updates.metadata) || {};
    }

    emit(EVENT_TYPES.ROOM_UPDATED, { sessionId, room: cloneData(room) });
    return toPublicRoom(room);
  }

  /**
   * Removes a room and all of its language/audio/subtitle channels and
   * streams/translation streams. Any participants assigned to this room
   * are NOT removed from the session, but their `roomId` will now point
   * at a nonexistent room until reassigned — callers should reassign
   * participants first if that matters for their use case. Emits
   * ROOM_REMOVED.
   * @param {string} sessionId
   * @param {string} roomId
   * @returns {boolean}
   */
  function removeRoom(sessionId, roomId) {
    const room = getRoomOrThrow(sessionId, roomId);
    const channels = getLanguageChannelsMap(roomId);
    for (const channel of channels.values()) {
      audioChannelsByLanguageChannel.delete(channel.id);
      subtitleChannelsByLanguageChannel.delete(channel.id);
    }
    languageChannelsByRoom.delete(roomId);

    const streams = getStreamsMap(roomId);
    for (const stream of streams.values()) {
      const translationStreams = getTranslationStreamsMap(stream.id);
      for (const translationStream of translationStreams.values()) {
        graphRemoveNodeInternal(translationStream.id);
      }
      translationStreamsByStream.delete(stream.id);
      graphRemoveNodeInternal(stream.id);
    }
    streamsByRoom.delete(roomId);
    activeSpeakerByRoom.delete(roomId);

    const features = getVenueFeaturesMap(roomId);
    for (const feature of features.values()) {
      graphRemoveNodeInternal(feature.id);
    }
    venueFeaturesByRoom.delete(roomId);

    getRoomsMap(sessionId).delete(roomId);
    graphRemoveNodeInternal(roomId);
    bumpDiagnostic(sessionId, 'roomsRemoved');

    emit(EVENT_TYPES.ROOM_REMOVED, { sessionId, room: cloneData(room) });
    return true;
  }

  /**
   * @param {string} sessionId
   * @param {string} roomId
   * @returns {Readonly<Object>}
   */
  function getRoom(sessionId, roomId) {
    return toPublicRoom(getRoomOrThrow(sessionId, roomId));
  }

  /**
   * @param {string} sessionId
   * @returns {Readonly<Object[]>}
   */
  function listRooms(sessionId) {
    getSessionOrThrow(sessionId);
    return deepFreeze(Array.from(getRoomsMap(sessionId).values()).map((r) => cloneData(r)));
  }

  /* ============================================================= *
   * ZONE MANAGEMENT
   * ============================================================= */

  /**
   * Creates a broadcast zone (e.g. "Zone A"). Zones group rooms/hosts for
   * distributed scaling; they do not themselves hold participants. Emits
   * ZONE_CREATED.
   * @param {string} sessionId
   * @param {Object} zoneConfig
   * @param {string} zoneConfig.name
   * @param {Object} [zoneConfig.metadata]
   * @returns {Readonly<Object>}
   */
  function createZone(sessionId, zoneConfig) {
    getSessionOrThrow(sessionId);
    assert(zoneConfig && typeof zoneConfig === 'object', ERROR_CODES.INVALID_ARGUMENT, 'zoneConfig is required');
    assert(isNonEmptyString(zoneConfig.name), ERROR_CODES.INVALID_ARGUMENT, 'zoneConfig.name must be a non-empty string');
    assertNoSecrets(zoneConfig.metadata);

    const id = generateId('zone');
    const zone = {
      id,
      sessionId,
      name: zoneConfig.name,
      metadata: cloneData(zoneConfig.metadata) || {},
      createdAt: Date.now()
    };
    getZonesMap(sessionId).set(id, zone);
    bumpDiagnostic(sessionId, 'zonesCreated');

    emit(EVENT_TYPES.ZONE_CREATED, { sessionId, zone: cloneData(zone) });
    return toPublicZone(zone);
  }

  /**
   * Updates a zone's mutable fields. Emits ZONE_UPDATED.
   * @param {string} sessionId
   * @param {string} zoneId
   * @param {Object} updates
   * @returns {Readonly<Object>}
   */
  function updateZone(sessionId, zoneId, updates) {
    getSessionOrThrow(sessionId);
    const zones = getZonesMap(sessionId);
    const zone = zones.get(zoneId);
    assert(!!zone, ERROR_CODES.NOT_FOUND, `Zone "${zoneId}" not found in session "${sessionId}"`);
    assert(updates && typeof updates === 'object', ERROR_CODES.INVALID_ARGUMENT, 'updates object is required');
    assertNoSecrets(updates.metadata);

    if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
      assert(isNonEmptyString(updates.name), ERROR_CODES.INVALID_ARGUMENT, 'updates.name must be a non-empty string');
      zone.name = updates.name;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'metadata')) {
      zone.metadata = cloneData(updates.metadata) || {};
    }

    emit(EVENT_TYPES.ZONE_UPDATED, { sessionId, zone: cloneData(zone) });
    return toPublicZone(zone);
  }

  /**
   * Removes a zone. Rooms referencing this zone have their `zoneId`
   * cleared (set to null) rather than being removed themselves. Emits
   * ZONE_REMOVED.
   * @param {string} sessionId
   * @param {string} zoneId
   * @returns {boolean}
   */
  function removeZone(sessionId, zoneId) {
    getSessionOrThrow(sessionId);
    const zones = getZonesMap(sessionId);
    const zone = zones.get(zoneId);
    assert(!!zone, ERROR_CODES.NOT_FOUND, `Zone "${zoneId}" not found in session "${sessionId}"`);

    const rooms = getRoomsMap(sessionId);
    for (const room of rooms.values()) {
      if (room.zoneId === zoneId) {
        room.zoneId = null;
      }
    }

    zones.delete(zoneId);
    emit(EVENT_TYPES.ZONE_REMOVED, { sessionId, zone: cloneData(zone) });
    return true;
  }

  /**
   * @param {string} sessionId
   * @returns {Readonly<Object[]>}
   */
  function listZones(sessionId) {
    getSessionOrThrow(sessionId);
    return deepFreeze(Array.from(getZonesMap(sessionId).values()).map((z) => cloneData(z)));
  }

  /* ============================================================= *
   * LANGUAGE / AUDIO / SUBTITLE CHANNEL MANAGEMENT
   * ============================================================= */

  /**
   * Creates a language channel within a room (e.g. Arabic Room gets a
   * "fr" channel too, for a bilingual overflow room). This module only
   * tracks the existence and metadata of the channel; actual translated
   * content is produced by CozyTranslate/CozySpeech adapters and relayed
   * via `relaySpeechSegment`. Emits LANGUAGE_CHANNEL_CREATED.
   * @param {string} sessionId
   * @param {string} roomId
   * @param {string} languageCode
   * @returns {Readonly<Object>}
   */
  function createLanguageChannel(sessionId, roomId, languageCode) {
    getSessionOrThrow(sessionId);
    getRoomOrThrow(sessionId, roomId);
    assert(isNonEmptyString(languageCode), ERROR_CODES.INVALID_ARGUMENT, 'languageCode must be a non-empty string');

    const id = generateId('lang');
    const channel = {
      id,
      sessionId,
      roomId,
      languageCode,
      createdAt: Date.now()
    };
    getLanguageChannelsMap(roomId).set(id, channel);

    emit(EVENT_TYPES.LANGUAGE_CHANNEL_CREATED, { sessionId, roomId, channel: cloneData(channel) });
    return toPublicChannel(channel);
  }

  /**
   * Removes a language channel and any audio/subtitle channels attached
   * to it. Emits LANGUAGE_CHANNEL_REMOVED.
   * @param {string} sessionId
   * @param {string} roomId
   * @param {string} languageChannelId
   * @returns {boolean}
   */
  function removeLanguageChannel(sessionId, roomId, languageChannelId) {
    getSessionOrThrow(sessionId);
    getRoomOrThrow(sessionId, roomId);
    const channel = getLanguageChannelOrThrow(roomId, languageChannelId);

    audioChannelsByLanguageChannel.delete(languageChannelId);
    subtitleChannelsByLanguageChannel.delete(languageChannelId);
    getLanguageChannelsMap(roomId).delete(languageChannelId);

    emit(EVENT_TYPES.LANGUAGE_CHANNEL_REMOVED, { sessionId, roomId, channel: cloneData(channel) });
    return true;
  }

  /**
   * @param {string} sessionId
   * @param {string} roomId
   * @returns {Readonly<Object[]>}
   */
  function listLanguageChannels(sessionId, roomId) {
    getSessionOrThrow(sessionId);
    getRoomOrThrow(sessionId, roomId);
    return deepFreeze(Array.from(getLanguageChannelsMap(roomId).values()).map((c) => cloneData(c)));
  }

  /**
   * Creates an audio channel attached to a language channel. Emits
   * AUDIO_CHANNEL_CREATED.
   * @param {string} sessionId
   * @param {string} roomId
   * @param {string} languageChannelId
   * @param {Object} [config]
   * @param {string} [config.codec] - purely descriptive metadata; this module never encodes/decodes audio
   * @returns {Readonly<Object>}
   */
  function createAudioChannel(sessionId, roomId, languageChannelId, config) {
    getSessionOrThrow(sessionId);
    getRoomOrThrow(sessionId, roomId);
    getLanguageChannelOrThrow(roomId, languageChannelId);

    if (!audioChannelsByLanguageChannel.has(languageChannelId)) {
      audioChannelsByLanguageChannel.set(languageChannelId, new Map());
    }
    const id = generateId('audio');
    const channel = {
      id,
      sessionId,
      roomId,
      languageChannelId,
      codec: (config && config.codec) || 'opaque',
      createdAt: Date.now()
    };
    audioChannelsByLanguageChannel.get(languageChannelId).set(id, channel);

    emit(EVENT_TYPES.AUDIO_CHANNEL_CREATED, { sessionId, roomId, languageChannelId, channel: cloneData(channel) });
    return toPublicChannel(channel);
  }

  /**
   * @param {string} languageChannelId
   * @returns {Readonly<Object[]>}
   */
  function listAudioChannels(languageChannelId) {
    const map = audioChannelsByLanguageChannel.get(languageChannelId);
    return deepFreeze(map ? Array.from(map.values()).map((c) => cloneData(c)) : []);
  }

  /**
   * Removes an audio channel. Emits AUDIO_CHANNEL_REMOVED.
   * @param {string} languageChannelId
   * @param {string} audioChannelId
   * @returns {boolean}
   */
  function removeAudioChannel(languageChannelId, audioChannelId) {
    const map = audioChannelsByLanguageChannel.get(languageChannelId);
    assert(!!map && map.has(audioChannelId), ERROR_CODES.NOT_FOUND, `Audio channel "${audioChannelId}" not found`);
    const channel = map.get(audioChannelId);
    map.delete(audioChannelId);
    emit(EVENT_TYPES.AUDIO_CHANNEL_REMOVED, { languageChannelId, channel: cloneData(channel) });
    return true;
  }

  /**
   * Creates a subtitle channel attached to a language channel. Emits
   * SUBTITLE_CHANNEL_CREATED.
   * @param {string} sessionId
   * @param {string} roomId
   * @param {string} languageChannelId
   * @returns {Readonly<Object>}
   */
  function createSubtitleChannel(sessionId, roomId, languageChannelId) {
    getSessionOrThrow(sessionId);
    getRoomOrThrow(sessionId, roomId);
    getLanguageChannelOrThrow(roomId, languageChannelId);

    if (!subtitleChannelsByLanguageChannel.has(languageChannelId)) {
      subtitleChannelsByLanguageChannel.set(languageChannelId, new Map());
    }
    const id = generateId('subs');
    const channel = {
      id,
      sessionId,
      roomId,
      languageChannelId,
      createdAt: Date.now()
    };
    subtitleChannelsByLanguageChannel.get(languageChannelId).set(id, channel);

    emit(EVENT_TYPES.SUBTITLE_CHANNEL_CREATED, { sessionId, roomId, languageChannelId, channel: cloneData(channel) });
    return toPublicChannel(channel);
  }

  /**
   * @param {string} languageChannelId
   * @returns {Readonly<Object[]>}
   */
  function listSubtitleChannels(languageChannelId) {
    const map = subtitleChannelsByLanguageChannel.get(languageChannelId);
    return deepFreeze(map ? Array.from(map.values()).map((c) => cloneData(c)) : []);
  }

  /**
   * Removes a subtitle channel. Emits SUBTITLE_CHANNEL_REMOVED.
   * @param {string} languageChannelId
   * @param {string} subtitleChannelId
   * @returns {boolean}
   */
  function removeSubtitleChannel(languageChannelId, subtitleChannelId) {
    const map = subtitleChannelsByLanguageChannel.get(languageChannelId);
    assert(!!map && map.has(subtitleChannelId), ERROR_CODES.NOT_FOUND, `Subtitle channel "${subtitleChannelId}" not found`);
    const channel = map.get(subtitleChannelId);
    map.delete(subtitleChannelId);
    emit(EVENT_TYPES.SUBTITLE_CHANNEL_REMOVED, { languageChannelId, channel: cloneData(channel) });
    return true;
  }

  /* ============================================================= *
   * HOST REGISTRATION (Distributed scaling / future hardware)
   * ============================================================= */

  /**
   * Registers a host in the distributed hierarchy (Main Host, Regional
   * Host, Zone Host, or Client Device). This exists so future hardware
   * (OurCozy Live Hub, Portable/School/Church/Community Hub, Edge AI Box)
   * can be represented today even though no physical transport is wired
   * up yet — this module only tracks the registration, it never talks to
   * the hardware directly (that is CozyNetwork's job). Emits
   * HOST_REGISTERED.
   * @param {Object} hostConfig
   * @param {string} hostConfig.hostType - one of HOST_TYPES
   * @param {string} [hostConfig.sessionId] - session this host serves, if any
   * @param {string} [hostConfig.zoneId] - zone this host serves, if any
   * @param {string} [hostConfig.parentHostId] - the host above this one in the hierarchy
   * @param {Object} [hostConfig.metadata]
   * @returns {Readonly<Object>}
   */
  function registerHost(hostConfig) {
    assert(hostConfig && typeof hostConfig === 'object', ERROR_CODES.INVALID_ARGUMENT, 'hostConfig is required');
    const validHostTypes = Object.values(HOST_TYPES);
    assert(
      validHostTypes.indexOf(hostConfig.hostType) !== -1,
      ERROR_CODES.INVALID_ARGUMENT,
      `hostConfig.hostType must be one of: ${validHostTypes.join(', ')}`
    );
    assertNoSecrets(hostConfig.metadata);

    if (hostConfig.parentHostId) {
      assert(hosts.has(hostConfig.parentHostId), ERROR_CODES.NOT_FOUND, `Parent host "${hostConfig.parentHostId}" not found`);
    }

    const id = generateId('host');
    const host = {
      id,
      hostType: hostConfig.hostType,
      sessionId: hostConfig.sessionId || null,
      zoneId: hostConfig.zoneId || null,
      parentHostId: hostConfig.parentHostId || null,
      metadata: cloneData(hostConfig.metadata) || {},
      registeredAt: Date.now()
    };
    hosts.set(id, host);

    emit(EVENT_TYPES.HOST_REGISTERED, { host: cloneData(host) });
    return toPublicHost(host);
  }

  /**
   * Changes which host currently serves a role (e.g. failover from one
   * Regional Host to another). Emits HOST_CHANGED.
   * @param {string} hostId
   * @param {Object} updates
   * @param {string} [updates.zoneId]
   * @param {string} [updates.parentHostId]
   * @param {Object} [updates.metadata]
   * @returns {Readonly<Object>}
   */
  function changeHost(hostId, updates) {
    const host = hosts.get(hostId);
    assert(!!host, ERROR_CODES.NOT_FOUND, `Host "${hostId}" not found`);
    assert(updates && typeof updates === 'object', ERROR_CODES.INVALID_ARGUMENT, 'updates object is required');
    assertNoSecrets(updates.metadata);

    if (Object.prototype.hasOwnProperty.call(updates, 'zoneId')) {
      host.zoneId = updates.zoneId || null;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'parentHostId')) {
      if (updates.parentHostId) {
        assert(hosts.has(updates.parentHostId), ERROR_CODES.NOT_FOUND, `Parent host "${updates.parentHostId}" not found`);
      }
      host.parentHostId = updates.parentHostId || null;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'metadata')) {
      host.metadata = cloneData(updates.metadata) || {};
    }

    emit(EVENT_TYPES.HOST_CHANGED, { host: cloneData(host) });
    return toPublicHost(host);
  }

  /**
   * Unregisters a host. Child hosts (hosts whose parentHostId equals this
   * host) have their parentHostId cleared rather than being cascaded away,
   * so a lower tier can be re-parented instead of being force-removed.
   * Emits HOST_UNREGISTERED.
   * @param {string} hostId
   * @returns {boolean}
   */
  function unregisterHost(hostId) {
    const host = hosts.get(hostId);
    assert(!!host, ERROR_CODES.NOT_FOUND, `Host "${hostId}" not found`);
    for (const other of hosts.values()) {
      if (other.parentHostId === hostId) {
        other.parentHostId = null;
      }
    }
    hosts.delete(hostId);
    emit(EVENT_TYPES.HOST_UNREGISTERED, { host: cloneData(host) });
    return true;
  }

  /**
   * @param {Object} [filter]
   * @param {string} [filter.sessionId]
   * @param {string} [filter.zoneId]
   * @param {string} [filter.hostType]
   * @returns {Readonly<Object[]>}
   */
  function listHosts(filter) {
    const f = filter || {};
    let list = Array.from(hosts.values());
    if (f.sessionId) list = list.filter((h) => h.sessionId === f.sessionId);
    if (f.zoneId) list = list.filter((h) => h.zoneId === f.zoneId);
    if (f.hostType) list = list.filter((h) => h.hostType === f.hostType);
    return deepFreeze(list.map((h) => cloneData(h)));
  }

  /* ============================================================= *
   * PERMISSIONS & MODERATORS
   * ============================================================= */

  /**
   * Grants a participant moderator status within a session. Moderators
   * implicitly hold MODERATE; specific finer-grained permissions must
   * still be granted via `grantPermission`. Emits MODERATOR_ASSIGNED.
   * @param {string} sessionId
   * @param {string} participantId
   * @returns {boolean}
   */
  function assignModerator(sessionId, participantId) {
    getSessionOrThrow(sessionId);
    const pMap = getParticipantsMap(sessionId);
    assert(pMap.has(participantId), ERROR_CODES.NOT_FOUND, `Participant "${participantId}" not found in session "${sessionId}"`);
    moderatorsBySession.get(sessionId).add(participantId);
    emit(EVENT_TYPES.MODERATOR_ASSIGNED, { sessionId, participantId });
    return true;
  }

  /**
   * Revokes moderator status. Emits MODERATOR_REVOKED.
   * @param {string} sessionId
   * @param {string} participantId
   * @returns {boolean}
   */
  function revokeModerator(sessionId, participantId) {
    getSessionOrThrow(sessionId);
    const set = moderatorsBySession.get(sessionId);
    const removed = set ? set.delete(participantId) : false;
    if (removed) {
      emit(EVENT_TYPES.MODERATOR_REVOKED, { sessionId, participantId });
    }
    return removed;
  }

  /**
   * @param {string} sessionId
   * @param {string} participantId
   * @returns {boolean}
   */
  function isModerator(sessionId, participantId) {
    getSessionOrThrow(sessionId);
    const set = moderatorsBySession.get(sessionId);
    return !!set && set.has(participantId);
  }

  /**
   * Grants a specific permission to a participant. Emits
   * PERMISSION_GRANTED.
   * @param {string} sessionId
   * @param {string} participantId
   * @param {string} permission - one of PERMISSIONS, or a custom string for future features
   * @returns {boolean}
   */
  function grantPermission(sessionId, participantId, permission) {
    getSessionOrThrow(sessionId);
    assert(isNonEmptyString(permission), ERROR_CODES.INVALID_ARGUMENT, 'permission must be a non-empty string');
    const pMap = getParticipantsMap(sessionId);
    assert(pMap.has(participantId), ERROR_CODES.NOT_FOUND, `Participant "${participantId}" not found in session "${sessionId}"`);

    const permMap = permissionsBySession.get(sessionId);
    if (!permMap.has(participantId)) permMap.set(participantId, new Set());
    permMap.get(participantId).add(permission);

    emit(EVENT_TYPES.PERMISSION_GRANTED, { sessionId, participantId, permission });
    return true;
  }

  /**
   * Revokes a specific permission from a participant. Emits
   * PERMISSION_REVOKED.
   * @param {string} sessionId
   * @param {string} participantId
   * @param {string} permission
   * @returns {boolean}
   */
  function revokePermission(sessionId, participantId, permission) {
    getSessionOrThrow(sessionId);
    const permMap = permissionsBySession.get(sessionId);
    const set = permMap ? permMap.get(participantId) : null;
    const removed = set ? set.delete(permission) : false;
    if (removed) {
      emit(EVENT_TYPES.PERMISSION_REVOKED, { sessionId, participantId, permission });
    }
    return removed;
  }

  /**
   * Answers whether a participant currently holds a permission —
   * including the implicit MODERATE permission granted to moderators.
   * This checks *authorization intent only*; it does not verify identity
   * (that is CozyIdentity's responsibility).
   * @param {string} sessionId
   * @param {string} participantId
   * @param {string} permission
   * @returns {boolean}
   */
  function checkPermission(sessionId, participantId, permission) {
    getSessionOrThrow(sessionId);
    if (permission === PERMISSIONS.MODERATE && isModerator(sessionId, participantId)) {
      return true;
    }
    const permMap = permissionsBySession.get(sessionId);
    const set = permMap ? permMap.get(participantId) : null;
    if (set && set.has(permission)) return true;
    // Moderators are granted every native PERMISSIONS entry implicitly.
    const nativePermissionValues = Object.values(PERMISSIONS);
    if (nativePermissionValues.indexOf(permission) !== -1 && isModerator(sessionId, participantId)) {
      return true;
    }
    return false;
  }

  /* ============================================================= *
   * ANNOUNCEMENTS
   * ============================================================= */

  /**
   * Broadcasts an announcement (coordination only — actual distribution
   * to devices is CozyNetwork's job; actual audio/subtitle rendering, if
   * requested, is CozySpeech's job via the pipeline). Emits
   * ANNOUNCEMENT_BROADCAST.
   * @param {string} sessionId
   * @param {string} message
   * @param {Object} [options]
   * @param {string} [options.roomId] - restrict to one room; omit for session-wide
   * @param {string} [options.priority='normal'] - 'normal' | 'high' | 'emergency'
   * @returns {Readonly<Object>} the announcement record
   */
  function broadcastAnnouncement(sessionId, message, options) {
    getSessionOrThrow(sessionId);
    assert(isNonEmptyString(message), ERROR_CODES.INVALID_ARGUMENT, 'message must be a non-empty string');
    const opts = options || {};
    if (opts.roomId) getRoomOrThrow(sessionId, opts.roomId);

    const record = {
      id: generateId('announce'),
      sessionId,
      message,
      roomId: opts.roomId || null,
      priority: opts.priority || 'normal',
      createdAt: Date.now()
    };
    announcementsBySession.get(sessionId).push(record);
    bumpDiagnostic(sessionId, 'announcementsBroadcast');

    emit(EVENT_TYPES.ANNOUNCEMENT_BROADCAST, { sessionId, announcement: cloneData(record) });
    return deepFreeze(cloneData(record));
  }

  /**
   * @param {string} sessionId
   * @returns {Readonly<Object[]>}
   */
  function listAnnouncements(sessionId) {
    getSessionOrThrow(sessionId);
    return deepFreeze((announcementsBySession.get(sessionId) || []).map((a) => cloneData(a)));
  }

  /* ============================================================= *
   * SUBSYSTEM REGISTRY (Dependency Injection surface)
   * ============================================================= */

  /**
   * Registers an adapter for a named CozyOS subsystem. The adapter is an
   * opaque object; this module calls only the method names documented for
   * the coordination pipeline (see `relaySpeechSegment`) and never
   * inspects or depends on how the adapter implements them. Registering a
   * subsystem again overwrites the previous adapter (useful for hot
   * swapping an implementation, e.g. swapping a cloud CozyTranslate
   * adapter for a fully offline one without touching this module). Emits
   * SUBSYSTEM_REGISTERED.
   * @param {string} name - one of KNOWN_SUBSYSTEMS
   * @param {Object} adapter
   * @returns {boolean}
   */
  function registerSubsystem(name, adapter) {
    assert(
      KNOWN_SUBSYSTEMS.indexOf(name) !== -1,
      ERROR_CODES.INVALID_ARGUMENT,
      `Unknown subsystem "${name}". Expected one of: ${KNOWN_SUBSYSTEMS.join(', ')}`
    );
    assert(adapter && typeof adapter === 'object', ERROR_CODES.INVALID_ARGUMENT, 'adapter must be an object');
    subsystems.set(name, adapter);
    emit(EVENT_TYPES.SUBSYSTEM_REGISTERED, { name });
    return true;
  }

  /**
   * Unregisters a subsystem adapter. Emits SUBSYSTEM_UNREGISTERED.
   * @param {string} name
   * @returns {boolean}
   */
  function unregisterSubsystem(name) {
    const removed = subsystems.delete(name);
    if (removed) {
      emit(EVENT_TYPES.SUBSYSTEM_UNREGISTERED, { name });
    }
    return removed;
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  function hasSubsystem(name) {
    return subsystems.has(name);
  }

  /**
   * @returns {Readonly<string[]>} names of every currently registered subsystem
   */
  function listRegisteredSubsystems() {
    return deepFreeze(Array.from(subsystems.keys()));
  }

  function getSubsystemOrThrow(name) {
    const adapter = subsystems.get(name);
    assert(
      !!adapter,
      ERROR_CODES.SUBSYSTEM_NOT_REGISTERED,
      `Subsystem "${name}" is not registered. Call registerSubsystem("${name}", adapter) first.`
    );
    return adapter;
  }

  /* ============================================================= *
   * PIPELINE COORDINATION
   * ============================================================= */

  /**
   * Coordinates one hop of the live pipeline for a single speech segment:
   *
   *   Speaker audio ref
   *     -> CozyLanguage.detectLanguage(...)   (optional, informational only)
   *     -> CozyKnowledge.lookupTerminology(...) (optional, informational only)
   *     -> CozySpeech.transcribe(...)        (this module does NOT do STT)
   *     -> CozyTranslate.translate(...)      (per target language channel)
   *     -> CozySpeech.synthesize(...)        (this module does NOT do TTS)
   *     -> Segment recorded to the session timeline
   *     -> collected relay result
   *
   * This method's job is ONLY to call the registered adapters in the
   * right order, with the right arguments, and to emit
   * PIPELINE_SEGMENT_RELAYED and SEGMENT_RECORDED with the aggregated
   * (non-audio, metadata-only) result so that CozyNetwork (also called
   * through its adapter) can distribute it. This module never inspects,
   * modifies, or generates the actual transcript/translation/audio
   * content beyond passing it through; it does not implement any
   * recognition, translation, synthesis, language-detection, or
   * terminology-lookup algorithm itself — CozyLanguage and CozyKnowledge
   * are optional, purely delegated hooks ("Translation Pipeline
   * Intelligence"): if not registered, those steps are silently skipped
   * and the pipeline behaves exactly as it did before they existed.
   *
   * @param {string} sessionId
   * @param {string} roomId - the room whose language channels should receive this segment
   * @param {Object} sourceAudioRef - opaque reference to the raw audio (e.g. a buffer handle
   *   or URI produced by CozyAudio); never inspected by this module
   * @param {Object} [options]
   * @param {string} [options.speakerId] - who is speaking; defaults to the room's active speaker if set
   * @param {string} [options.streamId] - which Stream this segment belongs to, for stream-scoped sync
   * @returns {Readonly<Object>} relay result summary: { sessionId, roomId, segmentId, sequenceNumber,
   *   speakerId, streamId, sourceLanguage, detectedLanguage, terminologyHints, transcript,
   *   translations: [{ languageChannelId, languageCode, text, audioRef }] }
   * @throws {CozyLiveError} SUBSYSTEM_NOT_REGISTERED if CozySpeech/CozyTranslate are missing
   * @throws {CozyLiveError} SUBSYSTEM_CONTRACT_VIOLATION if an adapter doesn't return the
   *   documented shape
   */
  function relaySpeechSegment(sessionId, roomId, sourceAudioRef, options) {
    const session = getSessionOrThrow(sessionId);
    getRoomOrThrow(sessionId, roomId);
    assert(
      session.state === SESSION_STATES.STARTED,
      ERROR_CODES.INVALID_STATE,
      `Session "${sessionId}" must be STARTED to relay speech`
    );
    const opts = options || {};
    let speakerId = null;
    if (opts.speakerId) {
      getSpeakerOrThrow(sessionId, opts.speakerId);
      speakerId = opts.speakerId;
    } else if (activeSpeakerByRoom.has(roomId)) {
      speakerId = activeSpeakerByRoom.get(roomId);
    }
    if (opts.streamId) {
      getStreamOrThrow(sessionId, roomId, opts.streamId);
    }

    const speech = getSubsystemOrThrow('CozySpeech');
    const translate = getSubsystemOrThrow('CozyTranslate');
    assert(
      typeof speech.transcribe === 'function',
      ERROR_CODES.SUBSYSTEM_CONTRACT_VIOLATION,
      'CozySpeech adapter must expose transcribe(audioRef, languageCode)'
    );
    assert(
      typeof speech.synthesize === 'function',
      ERROR_CODES.SUBSYSTEM_CONTRACT_VIOLATION,
      'CozySpeech adapter must expose synthesize(text, languageCode)'
    );
    assert(
      typeof translate.translate === 'function',
      ERROR_CODES.SUBSYSTEM_CONTRACT_VIOLATION,
      'CozyTranslate adapter must expose translate(text, sourceLanguage, targetLanguage)'
    );

    // Optional "Translation Pipeline Intelligence" hooks. Purely delegated;
    // skipped entirely if the adapter isn't registered or doesn't expose
    // the method, so the core pipeline never depends on them.
    let detectedLanguage = null;
    if (hasSubsystem('CozyLanguage')) {
      const languageAdapter = subsystems.get('CozyLanguage');
      if (typeof languageAdapter.detectLanguage === 'function') {
        const detection = languageAdapter.detectLanguage(sourceAudioRef);
        detectedLanguage = detection && typeof detection.languageCode === 'string' ? detection.languageCode : null;
      }
    }
    let terminologyHints = null;
    if (hasSubsystem('CozyKnowledge')) {
      const knowledgeAdapter = subsystems.get('CozyKnowledge');
      if (typeof knowledgeAdapter.lookupTerminology === 'function') {
        const hints = knowledgeAdapter.lookupTerminology(sourceAudioRef, session.context);
        terminologyHints = hints && Array.isArray(hints.terms) ? hints.terms : null;
      }
    }

    const transcript = speech.transcribe(sourceAudioRef, session.primaryLanguage);
    assert(
      transcript && typeof transcript.text === 'string',
      ERROR_CODES.SUBSYSTEM_CONTRACT_VIOLATION,
      'CozySpeech.transcribe must return { text: string }'
    );

    const channels = Array.from(getLanguageChannelsMap(roomId).values());
    const translations = channels.map((channel) => {
      const translated = translate.translate(transcript.text, session.primaryLanguage, channel.languageCode);
      assert(
        translated && typeof translated.text === 'string',
        ERROR_CODES.SUBSYSTEM_CONTRACT_VIOLATION,
        'CozyTranslate.translate must return { text: string }'
      );
      let audioRef = null;
      if (hasSubsystem('CozySpeech')) {
        const synthesized = speech.synthesize(translated.text, channel.languageCode);
        audioRef = synthesized && Object.prototype.hasOwnProperty.call(synthesized, 'audioRef') ? synthesized.audioRef : null;
      }
      return {
        languageChannelId: channel.id,
        languageCode: channel.languageCode,
        text: translated.text,
        audioRef
      };
    });

    bumpDiagnostic(sessionId, 'segmentsRelayed');

    const segmentId = generateId('seg');
    const sequenceNumber = nextSequenceNumber(sessionId);

    const result = {
      sessionId,
      roomId,
      segmentId,
      sequenceNumber,
      speakerId,
      streamId: opts.streamId || null,
      sourceLanguage: session.primaryLanguage,
      detectedLanguage,
      terminologyHints,
      transcript: transcript.text,
      translations
    };

    const segment = {
      id: segmentId,
      sessionId,
      roomId,
      streamId: opts.streamId || null,
      speakerId,
      sourceLanguage: session.primaryLanguage,
      detectedLanguage,
      sequenceNumber,
      transcript: transcript.text,
      translations: translations.map((t) => ({ languageChannelId: t.languageChannelId, languageCode: t.languageCode })),
      timestamp: Date.now()
    };
    if (!timelineBySession.has(sessionId)) timelineBySession.set(sessionId, []);
    timelineBySession.get(sessionId).push(segment);

    graphUpsertNode('segment', segmentId, sessionId, { sequenceNumber, roomId });
    graphAddEdgeInternal(roomId, segmentId, 'produced_segment');
    if (speakerId) {
      graphAddEdgeInternal(speakerId, segmentId, 'spoke_segment');
    }

    emit(EVENT_TYPES.PIPELINE_SEGMENT_RELAYED, result);
    emit(EVENT_TYPES.SEGMENT_RECORDED, { sessionId, segment: cloneData(segment) });
    return deepFreeze(cloneData(result));
  }

  /**
   * @param {string} sessionId
   * @param {Object} [filter]
   * @param {string} [filter.roomId]
   * @param {string} [filter.speakerId]
   * @returns {Readonly<Object[]>} the recorded segment timeline, in recording order
   */
  function getTimeline(sessionId, filter) {
    getSessionOrThrow(sessionId);
    const f = filter || {};
    let list = timelineBySession.get(sessionId) || [];
    if (f.roomId) list = list.filter((s) => s.roomId === f.roomId);
    if (f.speakerId) list = list.filter((s) => s.speakerId === f.speakerId);
    return deepFreeze(list.map((s) => cloneData(s)));
  }

  /**
   * @param {string} sessionId
   * @param {string} segmentId
   * @returns {Readonly<Object>} a single recorded segment
   */
  function getSegment(sessionId, segmentId) {
    getSessionOrThrow(sessionId);
    const list = timelineBySession.get(sessionId) || [];
    const found = list.find((s) => s.id === segmentId);
    assert(!!found, ERROR_CODES.NOT_FOUND, `Segment "${segmentId}" not found in session "${sessionId}"`);
    return deepFreeze(cloneData(found));
  }

  /* ============================================================= *
   * SYNCHRONIZATION
   * ============================================================= */

  /**
   * Records a synchronization checkpoint (e.g. a shared timeline offset
   * used to keep subtitles/audio aligned across rooms). This module does
   * not perform clock discipline itself — it only records and re-emits
   * the checkpoint so CozyNetwork can propagate it. Emits EVENT_SYNC.
   * @param {string} sessionId
   * @param {number} timestampMs - epoch-ms sync point supplied by the caller
   * @param {Object} [meta]
   * @returns {Readonly<Object>}
   */
  function syncTimestamp(sessionId, timestampMs, meta) {
    getSessionOrThrow(sessionId);
    assert(typeof timestampMs === 'number' && Number.isFinite(timestampMs), ERROR_CODES.INVALID_ARGUMENT, 'timestampMs must be a finite number');
    const payload = { sessionId, timestampMs, meta: cloneData(meta) || {} };
    return emit(EVENT_TYPES.EVENT_SYNC, payload);
  }

  /* ============================================================= *
   * STREAMS (live broadcast object model)
   * ============================================================= *
   * Session -> Room -> Stream -> TranslationStream(s) -> AudioChannel +
   * SubtitleChannel. A Stream represents "the live broadcast" for a
   * room; TranslationStreams reuse the existing language/audio/subtitle
   * channel entities as their underlying storage rather than duplicating
   * them, so the routing model introduced in v1.0.0 remains the single
   * source of truth for "which languages/channels exist" — Streams add a
   * broadcast-lifecycle (IDLE/LIVE/ENDED) view on top.
   */

  /**
   * Creates a Stream for a room, representing its live broadcast object.
   * Emits STREAM_CREATED.
   * @param {string} sessionId
   * @param {string} roomId
   * @returns {Readonly<Object>}
   */
  function createStream(sessionId, roomId) {
    getSessionOrThrow(sessionId);
    getRoomOrThrow(sessionId, roomId);
    const id = generateId('stream');
    const stream = { id, sessionId, roomId, status: STREAM_STATUSES.IDLE, createdAt: Date.now() };
    getStreamsMap(roomId).set(id, stream);

    graphUpsertNode('stream', id, sessionId, { roomId });
    graphAddEdgeInternal(roomId, id, 'has_stream');

    emit(EVENT_TYPES.STREAM_CREATED, { sessionId, roomId, stream: cloneData(stream) });
    return toPublicSnapshot(stream);
  }

  /**
   * Transitions a Stream's status. Emits STREAM_STATUS_CHANGED.
   * @param {string} sessionId
   * @param {string} roomId
   * @param {string} streamId
   * @param {string} status - one of STREAM_STATUSES
   * @returns {Readonly<Object>}
   */
  function setStreamStatus(sessionId, roomId, streamId, status) {
    getSessionOrThrow(sessionId);
    const stream = getStreamOrThrow(sessionId, roomId, streamId);
    const validStatuses = Object.values(STREAM_STATUSES);
    assert(
      validStatuses.indexOf(status) !== -1,
      ERROR_CODES.INVALID_ARGUMENT,
      `status must be one of: ${validStatuses.join(', ')}`
    );
    const previousStatus = stream.status;
    stream.status = status;
    emit(EVENT_TYPES.STREAM_STATUS_CHANGED, { sessionId, roomId, streamId, previousStatus, status });
    return toPublicSnapshot(stream);
  }

  /**
   * Removes a Stream and cascades to its TranslationStreams (the
   * underlying audio/subtitle channels they reference are left intact,
   * since those remain owned by the language channel routing model —
   * remove them explicitly via `removeAudioChannel`/`removeSubtitleChannel`
   * if desired). Emits STREAM_REMOVED.
   * @param {string} sessionId
   * @param {string} roomId
   * @param {string} streamId
   * @returns {boolean}
   */
  function removeStream(sessionId, roomId, streamId) {
    const stream = getStreamOrThrow(sessionId, roomId, streamId);
    translationStreamsByStream.delete(streamId);
    getStreamsMap(roomId).delete(streamId);
    graphRemoveNodeInternal(streamId);
    emit(EVENT_TYPES.STREAM_REMOVED, { sessionId, roomId, stream: cloneData(stream) });
    return true;
  }

  /**
   * @param {string} sessionId
   * @param {string} roomId
   * @param {string} streamId
   * @returns {Readonly<Object>}
   */
  function getStream(sessionId, roomId, streamId) {
    return toPublicSnapshot(getStreamOrThrow(sessionId, roomId, streamId));
  }

  /**
   * @param {string} sessionId
   * @param {string} roomId
   * @returns {Readonly<Object[]>}
   */
  function listStreams(sessionId, roomId) {
    getSessionOrThrow(sessionId);
    getRoomOrThrow(sessionId, roomId);
    return deepFreeze(Array.from(getStreamsMap(roomId).values()).map((s) => cloneData(s)));
  }

  /**
   * Creates a TranslationStream under a Stream for a given language
   * channel, automatically provisioning the audio channel and subtitle
   * channel that carry it (reusing `createAudioChannel`/
   * `createSubtitleChannel` rather than duplicating that logic). Emits
   * TRANSLATION_STREAM_CREATED.
   * @param {string} sessionId
   * @param {string} roomId
   * @param {string} streamId
   * @param {string} languageChannelId - an existing language channel on this room
   * @returns {Readonly<Object>}
   */
  function createTranslationStream(sessionId, roomId, streamId, languageChannelId) {
    getSessionOrThrow(sessionId);
    getStreamOrThrow(sessionId, roomId, streamId);
    const languageChannel = getLanguageChannelOrThrow(roomId, languageChannelId);

    const audioChannel = createAudioChannel(sessionId, roomId, languageChannelId);
    const subtitleChannel = createSubtitleChannel(sessionId, roomId, languageChannelId);

    const id = generateId('tstream');
    const translationStream = {
      id,
      streamId,
      languageChannelId,
      languageCode: languageChannel.languageCode,
      audioChannelId: audioChannel.id,
      subtitleChannelId: subtitleChannel.id,
      createdAt: Date.now()
    };
    getTranslationStreamsMap(streamId).set(id, translationStream);

    graphUpsertNode('translationStream', id, sessionId, { languageCode: translationStream.languageCode });
    graphAddEdgeInternal(streamId, id, 'has_translation_stream');
    graphAddEdgeInternal(id, audioChannel.id, 'carries_audio');
    graphAddEdgeInternal(id, subtitleChannel.id, 'carries_subtitles');

    emit(EVENT_TYPES.TRANSLATION_STREAM_CREATED, { sessionId, roomId, streamId, translationStream: cloneData(translationStream) });
    return toPublicSnapshot(translationStream);
  }

  /**
   * Removes a TranslationStream and its underlying audio/subtitle
   * channels. Emits TRANSLATION_STREAM_REMOVED.
   * @param {string} streamId
   * @param {string} translationStreamId
   * @returns {boolean}
   */
  function removeTranslationStream(streamId, translationStreamId) {
    const map = getTranslationStreamsMap(streamId);
    const translationStream = map.get(translationStreamId);
    assert(!!translationStream, ERROR_CODES.NOT_FOUND, `Translation stream "${translationStreamId}" not found`);

    const audioMap = audioChannelsByLanguageChannel.get(translationStream.languageChannelId);
    if (audioMap && audioMap.has(translationStream.audioChannelId)) {
      audioMap.delete(translationStream.audioChannelId);
    }
    const subtitleMap = subtitleChannelsByLanguageChannel.get(translationStream.languageChannelId);
    if (subtitleMap && subtitleMap.has(translationStream.subtitleChannelId)) {
      subtitleMap.delete(translationStream.subtitleChannelId);
    }
    map.delete(translationStreamId);
    graphRemoveNodeInternal(translationStreamId);

    emit(EVENT_TYPES.TRANSLATION_STREAM_REMOVED, { streamId, translationStream: cloneData(translationStream) });
    return true;
  }

  /**
   * @param {string} streamId
   * @returns {Readonly<Object[]>}
   */
  function listTranslationStreams(streamId) {
    return deepFreeze(Array.from(getTranslationStreamsMap(streamId).values()).map((t) => cloneData(t)));
  }

  /* ============================================================= *
   * SPEAKERS
   * ============================================================= */

  /**
   * Registers a speaker (Pastor, Worship Leader, Interpreter, MC, Guest
   * Preacher, etc.) so the pipeline can know who is currently speaking.
   * Emits SPEAKER_REGISTERED.
   * @param {string} sessionId
   * @param {Object} config
   * @param {string} config.displayName
   * @param {string} [config.role] - freeform role label, e.g. "Pastor", "Interpreter"
   * @param {string} [config.roomId] - room this speaker is primarily associated with
   * @returns {Readonly<Object>}
   */
  function registerSpeaker(sessionId, config) {
    getSessionOrThrow(sessionId);
    assert(config && typeof config === 'object', ERROR_CODES.INVALID_ARGUMENT, 'config is required');
    assert(isNonEmptyString(config.displayName), ERROR_CODES.INVALID_ARGUMENT, 'config.displayName must be a non-empty string');
    if (config.roomId) getRoomOrThrow(sessionId, config.roomId);

    const id = generateId('speaker');
    const speaker = {
      id,
      sessionId,
      displayName: config.displayName,
      role: config.role || null,
      roomId: config.roomId || null,
      registeredAt: Date.now()
    };
    getSpeakersMap(sessionId).set(id, speaker);

    graphUpsertNode('speaker', id, sessionId, { displayName: speaker.displayName, role: speaker.role });
    graphAddEdgeInternal(sessionId, id, 'has_speaker');
    if (speaker.roomId) graphAddEdgeInternal(speaker.roomId, id, 'has_speaker');

    emit(EVENT_TYPES.SPEAKER_REGISTERED, { sessionId, speaker: cloneData(speaker) });
    return toPublicSnapshot(speaker);
  }

  /**
   * Removes a speaker. If they were the active speaker in any room, that
   * room's active speaker is cleared. Emits SPEAKER_REMOVED.
   * @param {string} sessionId
   * @param {string} speakerId
   * @returns {boolean}
   */
  function removeSpeaker(sessionId, speakerId) {
    const speaker = getSpeakerOrThrow(sessionId, speakerId);
    for (const [roomId, activeId] of Array.from(activeSpeakerByRoom.entries())) {
      if (activeId === speakerId) activeSpeakerByRoom.delete(roomId);
    }
    getSpeakersMap(sessionId).delete(speakerId);
    graphRemoveNodeInternal(speakerId);
    emit(EVENT_TYPES.SPEAKER_REMOVED, { sessionId, speaker: cloneData(speaker) });
    return true;
  }

  /**
   * @param {string} sessionId
   * @returns {Readonly<Object[]>}
   */
  function listSpeakers(sessionId) {
    getSessionOrThrow(sessionId);
    return deepFreeze(Array.from(getSpeakersMap(sessionId).values()).map((s) => cloneData(s)));
  }

  /**
   * Marks a speaker as the one currently speaking in a room. The
   * pipeline (`relaySpeechSegment`) reads this to default `speakerId`
   * when the caller doesn't pass one explicitly. Emits
   * ACTIVE_SPEAKER_CHANGED.
   * @param {string} sessionId
   * @param {string} roomId
   * @param {string} speakerId
   * @returns {Readonly<Object>} the now-active speaker snapshot
   */
  function setActiveSpeaker(sessionId, roomId, speakerId) {
    getSessionOrThrow(sessionId);
    getRoomOrThrow(sessionId, roomId);
    const speaker = getSpeakerOrThrow(sessionId, speakerId);
    const previousSpeakerId = activeSpeakerByRoom.get(roomId) || null;
    activeSpeakerByRoom.set(roomId, speakerId);
    emit(EVENT_TYPES.ACTIVE_SPEAKER_CHANGED, { sessionId, roomId, previousSpeakerId, speakerId });
    return toPublicSnapshot(speaker);
  }

  /**
   * @param {string} sessionId
   * @param {string} roomId
   * @returns {Readonly<Object>|null} the active speaker snapshot, or null if none is set
   */
  function getActiveSpeaker(sessionId, roomId) {
    getSessionOrThrow(sessionId);
    getRoomOrThrow(sessionId, roomId);
    const speakerId = activeSpeakerByRoom.get(roomId);
    if (!speakerId) return null;
    const speaker = getSpeakersMap(sessionId).get(speakerId);
    return speaker ? toPublicSnapshot(speaker) : null;
  }

  /* ============================================================= *
   * CAMERAS (coordination only — no capture/encoding)
   * ============================================================= */

  /**
   * Registers a camera as a coordination record. This module never
   * accesses cameras or encodes video — it only remembers that a camera
   * exists and which room it currently covers. Emits CAMERA_REGISTERED.
   * @param {string} sessionId
   * @param {Object} config
   * @param {string} config.name - e.g. "Camera 1", "Stage Camera", "Drone"
   * @param {string} [config.roomId]
   * @param {Object} [config.metadata]
   * @returns {Readonly<Object>}
   */
  function registerCamera(sessionId, config) {
    getSessionOrThrow(sessionId);
    assert(config && typeof config === 'object', ERROR_CODES.INVALID_ARGUMENT, 'config is required');
    assert(isNonEmptyString(config.name), ERROR_CODES.INVALID_ARGUMENT, 'config.name must be a non-empty string');
    assertNoSecrets(config.metadata);
    if (config.roomId) getRoomOrThrow(sessionId, config.roomId);

    const id = generateId('camera');
    const camera = {
      id,
      sessionId,
      name: config.name,
      roomId: config.roomId || null,
      metadata: cloneData(config.metadata) || {},
      registeredAt: Date.now()
    };
    getCamerasMap(sessionId).set(id, camera);

    graphUpsertNode('camera', id, sessionId, { name: camera.name });
    if (camera.roomId) graphAddEdgeInternal(camera.roomId, id, 'covered_by_camera');

    emit(EVENT_TYPES.CAMERA_REGISTERED, { sessionId, camera: cloneData(camera) });
    return toPublicSnapshot(camera);
  }

  /**
   * Removes a camera registration. Emits CAMERA_REMOVED.
   * @param {string} sessionId
   * @param {string} cameraId
   * @returns {boolean}
   */
  function removeCamera(sessionId, cameraId) {
    getSessionOrThrow(sessionId);
    const map = getCamerasMap(sessionId);
    const camera = map.get(cameraId);
    assert(!!camera, ERROR_CODES.NOT_FOUND, `Camera "${cameraId}" not found in session "${sessionId}"`);
    map.delete(cameraId);
    graphRemoveNodeInternal(cameraId);
    emit(EVENT_TYPES.CAMERA_REMOVED, { sessionId, camera: cloneData(camera) });
    return true;
  }

  /**
   * @param {string} sessionId
   * @returns {Readonly<Object[]>}
   */
  function listCameras(sessionId) {
    getSessionOrThrow(sessionId);
    return deepFreeze(Array.from(getCamerasMap(sessionId).values()).map((c) => cloneData(c)));
  }

  /**
   * Assigns a camera to cover a room. Emits CAMERA_ASSIGNED.
   * @param {string} sessionId
   * @param {string} cameraId
   * @param {string} roomId
   * @returns {Readonly<Object>}
   */
  function assignCameraToRoom(sessionId, cameraId, roomId) {
    getSessionOrThrow(sessionId);
    getRoomOrThrow(sessionId, roomId);
    const camera = getCamerasMap(sessionId).get(cameraId);
    assert(!!camera, ERROR_CODES.NOT_FOUND, `Camera "${cameraId}" not found in session "${sessionId}"`);
    const previousRoomId = camera.roomId;
    camera.roomId = roomId;
    graphAddEdgeInternal(roomId, cameraId, 'covered_by_camera');
    emit(EVENT_TYPES.CAMERA_ASSIGNED, { sessionId, cameraId, previousRoomId, roomId });
    return toPublicSnapshot(camera);
  }

  /* ============================================================= *
   * DISPLAYS (coordination only — no rendering)
   * ============================================================= */

  /**
   * Registers a display (projector, LED wall, TV, outdoor screen).
   * Emits DISPLAY_REGISTERED.
   * @param {string} sessionId
   * @param {Object} config
   * @param {string} config.name
   * @param {string} [config.displayType] - one of DISPLAY_TYPES, defaults to 'OTHER'
   * @param {string} [config.roomId]
   * @returns {Readonly<Object>}
   */
  function registerDisplay(sessionId, config) {
    getSessionOrThrow(sessionId);
    assert(config && typeof config === 'object', ERROR_CODES.INVALID_ARGUMENT, 'config is required');
    assert(isNonEmptyString(config.name), ERROR_CODES.INVALID_ARGUMENT, 'config.name must be a non-empty string');
    const displayType = config.displayType || DISPLAY_TYPES.OTHER;
    assert(
      Object.values(DISPLAY_TYPES).indexOf(displayType) !== -1,
      ERROR_CODES.INVALID_ARGUMENT,
      `config.displayType must be one of: ${Object.values(DISPLAY_TYPES).join(', ')}`
    );
    if (config.roomId) getRoomOrThrow(sessionId, config.roomId);

    const id = generateId('display');
    const display = {
      id,
      sessionId,
      name: config.name,
      displayType,
      roomId: config.roomId || null,
      lastBroadcastAt: null,
      registeredAt: Date.now()
    };
    getDisplaysMap(sessionId).set(id, display);

    graphUpsertNode('display', id, sessionId, { name: display.name, displayType });
    if (display.roomId) graphAddEdgeInternal(display.roomId, id, 'has_display');

    emit(EVENT_TYPES.DISPLAY_REGISTERED, { sessionId, display: cloneData(display) });
    return toPublicSnapshot(display);
  }

  /**
   * Removes a display registration. Emits DISPLAY_REMOVED.
   * @param {string} sessionId
   * @param {string} displayId
   * @returns {boolean}
   */
  function removeDisplay(sessionId, displayId) {
    getSessionOrThrow(sessionId);
    const map = getDisplaysMap(sessionId);
    const display = map.get(displayId);
    assert(!!display, ERROR_CODES.NOT_FOUND, `Display "${displayId}" not found in session "${sessionId}"`);
    map.delete(displayId);
    graphRemoveNodeInternal(displayId);
    emit(EVENT_TYPES.DISPLAY_REMOVED, { sessionId, display: cloneData(display) });
    return true;
  }

  /**
   * @param {string} sessionId
   * @returns {Readonly<Object[]>}
   */
  function listDisplays(sessionId) {
    getSessionOrThrow(sessionId);
    return deepFreeze(Array.from(getDisplaysMap(sessionId).values()).map((d) => cloneData(d)));
  }

  /**
   * Assigns a display to a room. Emits DISPLAY_ROOM_ASSIGNED.
   * @param {string} sessionId
   * @param {string} displayId
   * @param {string} roomId
   * @returns {Readonly<Object>}
   */
  function assignDisplayRoom(sessionId, displayId, roomId) {
    getSessionOrThrow(sessionId);
    getRoomOrThrow(sessionId, roomId);
    const display = getDisplaysMap(sessionId).get(displayId);
    assert(!!display, ERROR_CODES.NOT_FOUND, `Display "${displayId}" not found in session "${sessionId}"`);
    const previousRoomId = display.roomId;
    display.roomId = roomId;
    graphAddEdgeInternal(roomId, displayId, 'has_display');
    emit(EVENT_TYPES.DISPLAY_ROOM_ASSIGNED, { sessionId, displayId, previousRoomId, roomId });
    return toPublicSnapshot(display);
  }

  /**
   * Coordinates broadcasting content to a display. This module never
   * renders anything — it only records that a broadcast was requested
   * (for diagnostics/replay) and emits DISPLAY_BROADCAST so CozyVideo/
   * CozyNetwork (via their adapters, outside this call) can actually
   * push pixels to the device.
   * @param {string} sessionId
   * @param {string} displayId
   * @param {Object} payload - opaque, caller-defined content descriptor (never inspected)
   * @returns {Readonly<Object>} the display snapshot, updated with lastBroadcastAt
   */
  function broadcastDisplay(sessionId, displayId, payload) {
    getSessionOrThrow(sessionId);
    const display = getDisplaysMap(sessionId).get(displayId);
    assert(!!display, ERROR_CODES.NOT_FOUND, `Display "${displayId}" not found in session "${sessionId}"`);
    display.lastBroadcastAt = Date.now();
    emit(EVENT_TYPES.DISPLAY_BROADCAST, { sessionId, displayId, payload: cloneData(payload) || {} });
    return toPublicSnapshot(display);
  }

  /* ============================================================= *
   * DEVICES
   * ============================================================= */

  /**
   * Registers a device (phone, tablet, hub, TV, projector, speaker box,
   * headphones, etc.). Optional `telemetry` (e.g. `{ batteryLevel: 82 }`)
   * is stored as opaque data for a registered CozyMaintenance service (via
   * the Service Registry) to read and forecast from — this module never
   * predicts anything itself.
   *
   * `capabilities` is a Hardware Capability Profile: a common,
   * hardware-agnostic shape every device can expose so future
   * applications can ask "does this device support X" without knowing
   * its model. This module never interprets these values — it only
   * stores and returns whatever plain data the caller supplied. Recommended
   * (all optional) keys: `powerSource` ('AC'|'DC'|'BATTERY'), `transportPlugins`
   * (string[], e.g. ['wifi-direct','bluetooth']), `audio` (e.g. `{ microphone: true,
   * codecs: ['opus'] }`), `video` (e.g. `{ camera: true }`), `display` (e.g.
   * `{ hdmi: true, miracast: true, subtitles: true }`), `storage` (e.g.
   * `{ bytesFree: 1e9 }`), `battery` (e.g. `{ capacityMah: 3000 }`), `aiSupport`
   * (e.g. `{ onDeviceModels: true }`), `sensors` (string[]), `accessibility`
   * (e.g. `{ hearingAidCompatible: true }`), `firmwareVersion` (string).
   * Emits DEVICE_REGISTERED.
   * @param {string} sessionId
   * @param {Object} config
   * @param {string} config.deviceType - one of DEVICE_TYPES
   * @param {string} config.name
   * @param {string} [config.roomId]
   * @param {string} [config.participantId]
   * @param {Object} [config.telemetry] - arbitrary plain-data health telemetry
   * @param {Object} [config.capabilities] - Hardware Capability Profile, see above
   * @returns {Readonly<Object>}
   */
  function registerDevice(sessionId, config) {
    getSessionOrThrow(sessionId);
    assert(config && typeof config === 'object', ERROR_CODES.INVALID_ARGUMENT, 'config is required');
    assert(
      Object.values(DEVICE_TYPES).indexOf(config.deviceType) !== -1,
      ERROR_CODES.INVALID_ARGUMENT,
      `config.deviceType must be one of: ${Object.values(DEVICE_TYPES).join(', ')}`
    );
    assert(isNonEmptyString(config.name), ERROR_CODES.INVALID_ARGUMENT, 'config.name must be a non-empty string');
    assertNoSecrets(config.telemetry);
    assertNoSecrets(config.capabilities);
    if (config.roomId) getRoomOrThrow(sessionId, config.roomId);
    if (config.participantId) {
      assert(
        getParticipantsMap(sessionId).has(config.participantId),
        ERROR_CODES.NOT_FOUND,
        `Participant "${config.participantId}" not found in session "${sessionId}"`
      );
    }

    const id = generateId('device');
    const device = {
      id,
      sessionId,
      deviceType: config.deviceType,
      name: config.name,
      roomId: config.roomId || null,
      participantId: config.participantId || null,
      telemetry: cloneData(config.telemetry) || {},
      capabilities: cloneData(config.capabilities) || {},
      healthStatus: DEVICE_HEALTH_STATUSES.HEALTHY,
      registeredAt: Date.now()
    };
    getDevicesMap(sessionId).set(id, device);

    emit(EVENT_TYPES.DEVICE_REGISTERED, { sessionId, device: cloneData(device) });
    return toPublicSnapshot(device);
  }

  /**
   * Updates mutable device fields (name, roomId, participantId,
   * telemetry, capabilities). `capabilities` and `telemetry` are merged
   * (shallow) into the existing object rather than replaced, so callers
   * can update one capability at a time. Emits DEVICE_UPDATED.
   * @param {string} sessionId
   * @param {string} deviceId
   * @param {Object} updates
   * @returns {Readonly<Object>}
   */
  function updateDevice(sessionId, deviceId, updates) {
    getSessionOrThrow(sessionId);
    const device = getDevicesMap(sessionId).get(deviceId);
    assert(!!device, ERROR_CODES.NOT_FOUND, `Device "${deviceId}" not found in session "${sessionId}"`);
    assert(updates && typeof updates === 'object', ERROR_CODES.INVALID_ARGUMENT, 'updates object is required');
    assertNoSecrets(updates.telemetry);
    assertNoSecrets(updates.capabilities);

    if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
      assert(isNonEmptyString(updates.name), ERROR_CODES.INVALID_ARGUMENT, 'updates.name must be a non-empty string');
      device.name = updates.name;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'roomId')) {
      if (updates.roomId) getRoomOrThrow(sessionId, updates.roomId);
      device.roomId = updates.roomId || null;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'participantId')) {
      if (updates.participantId) {
        assert(
          getParticipantsMap(sessionId).has(updates.participantId),
          ERROR_CODES.NOT_FOUND,
          `Participant "${updates.participantId}" not found in session "${sessionId}"`
        );
      }
      device.participantId = updates.participantId || null;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'telemetry')) {
      device.telemetry = Object.assign({}, device.telemetry, cloneData(updates.telemetry));
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'capabilities')) {
      device.capabilities = Object.assign({}, device.capabilities, cloneData(updates.capabilities));
    }

    emit(EVENT_TYPES.DEVICE_UPDATED, { sessionId, device: cloneData(device) });
    return toPublicSnapshot(device);
  }

  /**
   * Reads a device's Hardware Capability Profile so an application can
   * decide "can this device display subtitles?" etc. without knowing its
   * model. This module performs no interpretation — it returns exactly
   * what was stored.
   * @param {string} sessionId
   * @param {string} deviceId
   * @returns {Readonly<Object>}
   */
  function getDeviceCapabilities(sessionId, deviceId) {
    getSessionOrThrow(sessionId);
    const device = getDevicesMap(sessionId).get(deviceId);
    assert(!!device, ERROR_CODES.NOT_FOUND, `Device "${deviceId}" not found in session "${sessionId}"`);
    return deepFreeze(cloneData(device.capabilities));
  }

  /**
   * Convenience presence/truthiness check against a device's Hardware
   * Capability Profile (e.g. `deviceSupportsCapability(sid, did, 'display')`
   * to check a truthy/object `display` capability, since callers commonly
   * just want a yes/no answer without walking the object themselves).
   * This is a plain property lookup, not a capability-negotiation engine —
   * it never reasons about sub-fields or compatibility.
   * @param {string} sessionId
   * @param {string} deviceId
   * @param {string} capabilityKey - top-level key in the capability profile, e.g. "audio"
   * @returns {boolean}
   */
  function deviceSupportsCapability(sessionId, deviceId, capabilityKey) {
    getSessionOrThrow(sessionId);
    const device = getDevicesMap(sessionId).get(deviceId);
    assert(!!device, ERROR_CODES.NOT_FOUND, `Device "${deviceId}" not found in session "${sessionId}"`);
    assert(isNonEmptyString(capabilityKey), ERROR_CODES.INVALID_ARGUMENT, 'capabilityKey must be a non-empty string');
    return !!device.capabilities[capabilityKey];
  }

  /**
   * Removes a device registration. Emits DEVICE_REMOVED.
   * @param {string} sessionId
   * @param {string} deviceId
   * @returns {boolean}
   */
  function removeDevice(sessionId, deviceId) {
    getSessionOrThrow(sessionId);
    const map = getDevicesMap(sessionId);
    const device = map.get(deviceId);
    assert(!!device, ERROR_CODES.NOT_FOUND, `Device "${deviceId}" not found in session "${sessionId}"`);
    map.delete(deviceId);
    emit(EVENT_TYPES.DEVICE_REMOVED, { sessionId, device: cloneData(device) });
    return true;
  }

  /**
   * @param {string} sessionId
   * @param {Object} [filter]
   * @param {string} [filter.deviceType]
   * @param {string} [filter.roomId]
   * @param {string} [filter.participantId]
   * @returns {Readonly<Object[]>}
   */
  function listDevices(sessionId, filter) {
    getSessionOrThrow(sessionId);
    const f = filter || {};
    let list = Array.from(getDevicesMap(sessionId).values());
    if (f.deviceType) list = list.filter((d) => d.deviceType === f.deviceType);
    if (f.roomId) list = list.filter((d) => d.roomId === f.roomId);
    if (f.participantId) list = list.filter((d) => d.participantId === f.participantId);
    return deepFreeze(list.map((d) => cloneData(d)));
  }

  /**
   * Records a device health transition (Resilience Layer coordination
   * point). This module never predicts or decides failover — it only
   * updates the stored `healthStatus` and, if a CozyResilience adapter
   * is registered with a `handleDeviceFailure` method, forwards a FAILED
   * event to it and stores whatever plain-data plan it returns for
   * inspection. Emits DEVICE_HEALTH_EVENT.
   * @param {string} sessionId
   * @param {string} deviceId
   * @param {string} healthStatus - one of DEVICE_HEALTH_STATUSES
   * @param {Object} [meta]
   * @returns {Readonly<Object>} updated device snapshot
   */
  function reportDeviceHealthEvent(sessionId, deviceId, healthStatus, meta) {
    getSessionOrThrow(sessionId);
    const device = getDevicesMap(sessionId).get(deviceId);
    assert(!!device, ERROR_CODES.NOT_FOUND, `Device "${deviceId}" not found in session "${sessionId}"`);
    assert(
      Object.values(DEVICE_HEALTH_STATUSES).indexOf(healthStatus) !== -1,
      ERROR_CODES.INVALID_ARGUMENT,
      `healthStatus must be one of: ${Object.values(DEVICE_HEALTH_STATUSES).join(', ')}`
    );
    device.healthStatus = healthStatus;

    let resiliencePlan = null;
    if (healthStatus === DEVICE_HEALTH_STATUSES.FAILED && hasSubsystem('CozyResilience')) {
      const resilience = subsystems.get('CozyResilience');
      if (typeof resilience.handleDeviceFailure === 'function') {
        try {
          resiliencePlan = cloneData(resilience.handleDeviceFailure({ sessionId, deviceId, meta: cloneData(meta) || {} })) || null;
        } catch (_err) {
          resiliencePlan = null;
        }
      }
    }
    device.lastResiliencePlan = resiliencePlan;

    emit(EVENT_TYPES.DEVICE_HEALTH_EVENT, { sessionId, deviceId, healthStatus, meta: cloneData(meta) || {}, resiliencePlan });
    return toPublicSnapshot(device);
  }

  /* ============================================================= *
   * ATTENDANCE (pure data sink — no detection logic)
   * ============================================================= *
   * This module never performs face recognition, QR/NFC scanning, or
   * identity verification. It only records the final result an upstream
   * adapter chain (Attendance Adapter -> Face/QR/NFC Adapter ->
   * CozyIdentity) has already produced, tagged with a capture method.
   */

  /**
   * Records an attendance entry. Emits ATTENDANCE_RECORDED.
   * @param {string} sessionId
   * @param {Object} record
   * @param {string} record.participantId
   * @param {string} record.method - one of ATTENDANCE_METHODS
   * @param {number} [record.capturedAt] - epoch-ms; defaults to now
   * @param {Object} [record.meta]
   * @returns {Readonly<Object>} the stored attendance record
   */
  function recordAttendance(sessionId, record) {
    getSessionOrThrow(sessionId);
    assert(record && typeof record === 'object', ERROR_CODES.INVALID_ARGUMENT, 'record is required');
    assert(isNonEmptyString(record.participantId), ERROR_CODES.INVALID_ARGUMENT, 'record.participantId must be a non-empty string');
    assert(
      Object.values(ATTENDANCE_METHODS).indexOf(record.method) !== -1,
      ERROR_CODES.INVALID_ARGUMENT,
      `record.method must be one of: ${Object.values(ATTENDANCE_METHODS).join(', ')}`
    );
    assertNoSecrets(record.meta);

    const entry = {
      id: generateId('attend'),
      sessionId,
      participantId: record.participantId,
      method: record.method,
      capturedAt: typeof record.capturedAt === 'number' ? record.capturedAt : Date.now(),
      meta: cloneData(record.meta) || {}
    };
    if (!attendanceBySession.has(sessionId)) attendanceBySession.set(sessionId, []);
    attendanceBySession.get(sessionId).push(entry);

    emit(EVENT_TYPES.ATTENDANCE_RECORDED, { sessionId, attendance: cloneData(entry) });
    return deepFreeze(cloneData(entry));
  }

  /**
   * @param {string} sessionId
   * @param {Object} [filter]
   * @param {string} [filter.participantId]
   * @param {string} [filter.method]
   * @returns {Readonly<Object[]>}
   */
  function listAttendance(sessionId, filter) {
    getSessionOrThrow(sessionId);
    const f = filter || {};
    let list = attendanceBySession.get(sessionId) || [];
    if (f.participantId) list = list.filter((a) => a.participantId === f.participantId);
    if (f.method) list = list.filter((a) => a.method === f.method);
    return deepFreeze(list.map((a) => cloneData(a)));
  }

  /* ============================================================= *
   * PLUGIN REGISTRY
   * ============================================================= *
   * A pure bookkeeping registry for feature plugins (Attendance, Bible,
   * Marketplace, Education, Emergency, Voting, Donation, Kids,
   * Accessibility, etc.). Plugins receive data EXCLUSIVELY through the
   * existing public event bus (`on` / `registerEventType` /
   * `emitCustomEvent`) — this registry never invokes a plugin's methods
   * directly, so there is no hidden dispatch mechanism to reason about.
   */

  /**
   * Registers a plugin adapter under a name. Registering the same name
   * again overwrites the previous adapter (hot-swap). Emits
   * PLUGIN_REGISTERED.
   * @param {string} name
   * @param {Object} plugin - opaque object; this module never calls its methods
   * @returns {boolean}
   */
  function registerPlugin(name, plugin) {
    assert(isNonEmptyString(name), ERROR_CODES.INVALID_ARGUMENT, 'name must be a non-empty string');
    assert(plugin && typeof plugin === 'object', ERROR_CODES.INVALID_ARGUMENT, 'plugin must be an object');
    plugins.set(name, plugin);
    emit(EVENT_TYPES.PLUGIN_REGISTERED, { name });
    return true;
  }

  /**
   * Unregisters a plugin. Emits PLUGIN_UNREGISTERED.
   * @param {string} name
   * @returns {boolean}
   */
  function unregisterPlugin(name) {
    const removed = plugins.delete(name);
    if (removed) emit(EVENT_TYPES.PLUGIN_UNREGISTERED, { name });
    return removed;
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  function hasPlugin(name) {
    return plugins.has(name);
  }

  /**
   * @returns {Readonly<string[]>}
   */
  function listPlugins() {
    return deepFreeze(Array.from(plugins.keys()));
  }

  /* ============================================================= *
   * SERVICE REGISTRY (open, application-facing — distinct from Subsystems)
   * ============================================================= *
   * Subsystems (`registerSubsystem`) are a CLOSED list this module's OWN
   * pipeline calls directly (CozySpeech, CozyTranslate, ...). Services
   * are an OPEN registry for arbitrary business/AI capabilities
   * (CozyBible, CozyMarketplace, CozyDonation, CozyVoting, CozyEmergency,
   * CozyMaintenance, CozyAnalytics, ...) that APPLICATIONS look up and
   * call directly via `getService` — this module never invokes a
   * service's methods itself except the optional, best-effort
   * `healthCheck` in `getServiceHealth`.
   */

  /**
   * Registers a named service adapter. Emits SERVICE_REGISTERED.
   * @param {string} name - any non-empty string, e.g. "CozyBible"
   * @param {Object} adapter - opaque object exposing whatever methods the service defines
   * @param {Object} [config]
   * @param {string[]} [config.capabilities] - freeform capability labels for discovery
   * @returns {boolean}
   */
  function registerService(name, adapter, config) {
    assert(isNonEmptyString(name), ERROR_CODES.INVALID_ARGUMENT, 'name must be a non-empty string');
    assert(adapter && typeof adapter === 'object', ERROR_CODES.INVALID_ARGUMENT, 'adapter must be an object');
    const capabilities = (config && Array.isArray(config.capabilities)) ? config.capabilities.slice() : [];
    services.set(name, { name, adapter, capabilities, registeredAt: Date.now() });
    emit(EVENT_TYPES.SERVICE_REGISTERED, { name, capabilities });
    return true;
  }

  /**
   * Unregisters a service. Emits SERVICE_UNREGISTERED.
   * @param {string} name
   * @returns {boolean}
   */
  function unregisterService(name) {
    const removed = services.delete(name);
    if (removed) emit(EVENT_TYPES.SERVICE_UNREGISTERED, { name });
    return removed;
  }

  /**
   * Retrieves the raw adapter object for a registered service so an
   * application can call it directly. Unlike subsystem adapters (which
   * stay internal to this module's own pipeline), service adapters are
   * meant to be retrieved and invoked by callers, so this intentionally
   * returns the live object rather than a frozen clone (functions cannot
   * be cloned).
   * @param {string} name
   * @returns {Object} the registered adapter
   * @throws {CozyLiveError} NOT_FOUND if no such service is registered
   */
  function getService(name) {
    const entry = services.get(name);
    assert(!!entry, ERROR_CODES.NOT_FOUND, `Service "${name}" is not registered`);
    return entry.adapter;
  }

  /**
   * @param {string} name
   * @returns {Readonly<string[]>}
   */
  function getServiceCapabilities(name) {
    const entry = services.get(name);
    assert(!!entry, ERROR_CODES.NOT_FOUND, `Service "${name}" is not registered`);
    return deepFreeze(entry.capabilities.slice());
  }

  /**
   * Best-effort health check: if the registered adapter exposes a
   * `healthCheck()` method it is called defensively (never throws back
   * to the caller); otherwise health is reported as 'unknown'. This
   * module never fabricates a health value.
   * @param {string} name
   * @returns {Readonly<Object>}
   */
  function getServiceHealth(name) {
    const entry = services.get(name);
    assert(!!entry, ERROR_CODES.NOT_FOUND, `Service "${name}" is not registered`);
    let health = 'unknown';
    if (typeof entry.adapter.healthCheck === 'function') {
      try {
        health = entry.adapter.healthCheck();
      } catch (err) {
        health = { error: err && err.message ? err.message : String(err) };
      }
    }
    return deepFreeze({ name, registered: true, health: cloneData(health) });
  }

  /**
   * @returns {Readonly<Object[]>} { name, capabilities, registeredAt } for every registered service
   */
  function listServices() {
    return deepFreeze(
      Array.from(services.values()).map((entry) => ({
        name: entry.name,
        capabilities: entry.capabilities.slice(),
        registeredAt: entry.registeredAt
      }))
    );
  }

  /* ============================================================= *
   * VENUE DIGITAL TWIN
   * ============================================================= *
   * Campus/Venue -> Building -> Floor -> Room -> VenueFeature (stage,
   * screen, mic/camera/speaker positions, seating, emergency exits,
   * accessibility devices). This module only remembers what was
   * registered — it never reasons about coverage, placement, or
   * capacity.
   */

  /**
   * Registers a venue. Emits VENUE_REGISTERED.
   * @param {Object} config
   * @param {string} config.name
   * @param {string} [config.venueKind] - one of VENUE_KINDS, defaults to 'OTHER'
   * @returns {Readonly<Object>}
   */
  function registerVenue(config) {
    assert(config && typeof config === 'object', ERROR_CODES.INVALID_ARGUMENT, 'config is required');
    assert(isNonEmptyString(config.name), ERROR_CODES.INVALID_ARGUMENT, 'config.name must be a non-empty string');
    const venueKind = config.venueKind || VENUE_KINDS.OTHER;
    assert(
      Object.values(VENUE_KINDS).indexOf(venueKind) !== -1,
      ERROR_CODES.INVALID_ARGUMENT,
      `config.venueKind must be one of: ${Object.values(VENUE_KINDS).join(', ')}`
    );

    const id = generateId('venue');
    const venue = { id, name: config.name, venueKind, createdAt: Date.now() };
    venues.set(id, venue);

    graphUpsertNode('venue', id, null, { name: venue.name, venueKind });

    emit(EVENT_TYPES.VENUE_REGISTERED, { venue: cloneData(venue) });
    return toPublicSnapshot(venue);
  }

  /**
   * @param {string} venueId
   * @returns {Readonly<Object>}
   */
  function getVenue(venueId) {
    return toPublicSnapshot(getVenueOrThrow(venueId));
  }

  /**
   * @returns {Readonly<Object[]>}
   */
  function listVenues() {
    return deepFreeze(Array.from(venues.values()).map((v) => cloneData(v)));
  }

  /**
   * Creates a building under a venue. Emits BUILDING_CREATED.
   * @param {string} venueId
   * @param {Object} config
   * @param {string} config.name
   * @returns {Readonly<Object>}
   */
  function createBuilding(venueId, config) {
    getVenueOrThrow(venueId);
    assert(config && typeof config === 'object', ERROR_CODES.INVALID_ARGUMENT, 'config is required');
    assert(isNonEmptyString(config.name), ERROR_CODES.INVALID_ARGUMENT, 'config.name must be a non-empty string');

    const id = generateId('bldg');
    const building = { id, venueId, name: config.name, createdAt: Date.now() };
    getBuildingsMap(venueId).set(id, building);

    graphUpsertNode('building', id, null, { name: building.name });
    graphAddEdgeInternal(venueId, id, 'has_building');

    emit(EVENT_TYPES.BUILDING_CREATED, { venueId, building: cloneData(building) });
    return toPublicSnapshot(building);
  }

  /**
   * @param {string} venueId
   * @returns {Readonly<Object[]>}
   */
  function listBuildings(venueId) {
    getVenueOrThrow(venueId);
    return deepFreeze(Array.from(getBuildingsMap(venueId).values()).map((b) => cloneData(b)));
  }

  /**
   * Creates a floor under a building. Emits FLOOR_CREATED.
   * @param {string} venueId
   * @param {string} buildingId
   * @param {Object} config
   * @param {string} config.name
   * @returns {Readonly<Object>}
   */
  function createFloor(venueId, buildingId, config) {
    getVenueOrThrow(venueId);
    getBuildingOrThrow(venueId, buildingId);
    assert(config && typeof config === 'object', ERROR_CODES.INVALID_ARGUMENT, 'config is required');
    assert(isNonEmptyString(config.name), ERROR_CODES.INVALID_ARGUMENT, 'config.name must be a non-empty string');

    const id = generateId('floor');
    const floor = { id, buildingId, venueId, name: config.name, createdAt: Date.now() };
    getFloorsMap(buildingId).set(id, floor);
    floorsById.set(id, floor);

    graphUpsertNode('floor', id, null, { name: floor.name });
    graphAddEdgeInternal(buildingId, id, 'has_floor');

    emit(EVENT_TYPES.FLOOR_CREATED, { venueId, buildingId, floor: cloneData(floor) });
    return toPublicSnapshot(floor);
  }

  /**
   * @param {string} buildingId
   * @returns {Readonly<Object[]>}
   */
  function listFloors(buildingId) {
    return deepFreeze(Array.from(getFloorsMap(buildingId).values()).map((f) => cloneData(f)));
  }

  /**
   * Registers a physical layout feature for a room (stage, screen,
   * microphone/camera/speaker position, seating section, emergency
   * exit, accessibility device). Purely descriptive. Emits
   * VENUE_FEATURE_CREATED.
   * @param {string} sessionId
   * @param {string} roomId
   * @param {Object} config
   * @param {string} config.featureType - one of VENUE_FEATURE_TYPES
   * @param {string} config.name
   * @param {Object} [config.metadata] - e.g. coordinates, coverage notes
   * @returns {Readonly<Object>}
   */
  function createVenueFeature(sessionId, roomId, config) {
    getSessionOrThrow(sessionId);
    getRoomOrThrow(sessionId, roomId);
    assert(config && typeof config === 'object', ERROR_CODES.INVALID_ARGUMENT, 'config is required');
    assert(
      Object.values(VENUE_FEATURE_TYPES).indexOf(config.featureType) !== -1,
      ERROR_CODES.INVALID_ARGUMENT,
      `config.featureType must be one of: ${Object.values(VENUE_FEATURE_TYPES).join(', ')}`
    );
    assert(isNonEmptyString(config.name), ERROR_CODES.INVALID_ARGUMENT, 'config.name must be a non-empty string');
    assertNoSecrets(config.metadata);

    const id = generateId('feature');
    const feature = {
      id,
      sessionId,
      roomId,
      featureType: config.featureType,
      name: config.name,
      metadata: cloneData(config.metadata) || {},
      createdAt: Date.now()
    };
    getVenueFeaturesMap(roomId).set(id, feature);

    graphUpsertNode('venueFeature', id, sessionId, { featureType: feature.featureType, name: feature.name });
    graphAddEdgeInternal(roomId, id, 'has_feature');

    emit(EVENT_TYPES.VENUE_FEATURE_CREATED, { sessionId, roomId, feature: cloneData(feature) });
    return toPublicSnapshot(feature);
  }

  /**
   * Removes a venue feature. Emits VENUE_FEATURE_REMOVED.
   * @param {string} roomId
   * @param {string} featureId
   * @returns {boolean}
   */
  function removeVenueFeature(roomId, featureId) {
    const map = getVenueFeaturesMap(roomId);
    const feature = map.get(featureId);
    assert(!!feature, ERROR_CODES.NOT_FOUND, `Venue feature "${featureId}" not found in room "${roomId}"`);
    map.delete(featureId);
    graphRemoveNodeInternal(featureId);
    emit(EVENT_TYPES.VENUE_FEATURE_REMOVED, { roomId, feature: cloneData(feature) });
    return true;
  }

  /**
   * @param {string} roomId
   * @returns {Readonly<Object[]>}
   */
  function listVenueFeatures(roomId) {
    return deepFreeze(Array.from(getVenueFeaturesMap(roomId).values()).map((f) => cloneData(f)));
  }

  /**
   * Sets a venue-level preference (Local Knowledge Base) — e.g. the
   * pastor's preferred language order, or "Projector A always on the
   * left wall" — so a venue doesn't need reconfiguring every week. Pure
   * key/value storage; this module never acts on these values itself.
   * Emits VENUE_PREFERENCE_SET.
   * @param {string} venueId
   * @param {string} key
   * @param {*} value - plain data (no functions, no secrets)
   * @returns {Readonly<Object>} { venueId, key, value }
   */
  function setVenuePreference(venueId, key, value) {
    getVenueOrThrow(venueId);
    assert(isNonEmptyString(key), ERROR_CODES.INVALID_ARGUMENT, 'key must be a non-empty string');
    if (value && typeof value === 'object') assertNoSecrets(value);
    const clonedValue = cloneData(value);
    getVenuePreferencesMap(venueId).set(key, clonedValue);
    emit(EVENT_TYPES.VENUE_PREFERENCE_SET, { venueId, key, value: clonedValue });
    return deepFreeze({ venueId, key, value: cloneData(clonedValue) });
  }

  /**
   * @param {string} venueId
   * @param {string} key
   * @returns {*} the stored value
   * @throws {CozyLiveError} NOT_FOUND if the key was never set
   */
  function getVenuePreference(venueId, key) {
    getVenueOrThrow(venueId);
    const map = getVenuePreferencesMap(venueId);
    assert(map.has(key), ERROR_CODES.NOT_FOUND, `Venue preference "${key}" not set for venue "${venueId}"`);
    return cloneData(map.get(key));
  }

  /**
   * @param {string} venueId
   * @returns {Readonly<Object>} all preferences for a venue as a plain object
   */
  function listVenuePreferences(venueId) {
    getVenueOrThrow(venueId);
    const map = getVenuePreferencesMap(venueId);
    const out = {};
    for (const [key, value] of map.entries()) out[key] = cloneData(value);
    return deepFreeze(out);
  }

  /* ============================================================= *
   * ACCESSIBILITY PREFERENCE REGISTRY
   * ============================================================= *
   * This module tracks accessibility REQUIREMENTS/PREFERENCES only
   * (captions required, sign language requested, high contrast, large
   * text, audio description requested, personal audio channel, etc.). A
   * registered CozyAccessibility service (via the Service Registry)
   * decides how to act on them — this module never renders captions,
   * signs, or adjusts contrast itself.
   */

  /**
   * Sets (merges) accessibility preferences for a participant. Emits
   * ACCESSIBILITY_PREFERENCES_SET.
   * @param {string} sessionId
   * @param {string} participantId
   * @param {Object} prefs - arbitrary plain-data preference flags
   * @returns {Readonly<Object>} the merged preferences
   */
  function setAccessibilityPreferences(sessionId, participantId, prefs) {
    getSessionOrThrow(sessionId);
    assert(
      getParticipantsMap(sessionId).has(participantId),
      ERROR_CODES.NOT_FOUND,
      `Participant "${participantId}" not found in session "${sessionId}"`
    );
    assert(prefs && typeof prefs === 'object', ERROR_CODES.INVALID_ARGUMENT, 'prefs object is required');
    assertNoSecrets(prefs);

    const map = getAccessibilityPrefsMap(sessionId);
    const merged = Object.assign({}, map.get(participantId) || {}, cloneData(prefs));
    map.set(participantId, merged);

    emit(EVENT_TYPES.ACCESSIBILITY_PREFERENCES_SET, { sessionId, participantId, prefs: cloneData(merged) });
    return deepFreeze(cloneData(merged));
  }

  /**
   * @param {string} sessionId
   * @param {string} participantId
   * @returns {Readonly<Object>} stored preferences, or {} if none were set
   */
  function getAccessibilityPreferences(sessionId, participantId) {
    getSessionOrThrow(sessionId);
    const map = getAccessibilityPrefsMap(sessionId);
    return deepFreeze(cloneData(map.get(participantId) || {}));
  }

  /**
   * @param {string} sessionId
   * @returns {Readonly<Object>} participantId -> preferences, for every participant with preferences set
   */
  function listAccessibilityPreferences(sessionId) {
    getSessionOrThrow(sessionId);
    const map = getAccessibilityPrefsMap(sessionId);
    const out = {};
    for (const [participantId, prefs] of map.entries()) out[participantId] = cloneData(prefs);
    return deepFreeze(out);
  }

  /* ============================================================= *
   * COZY EVENT GRAPH (public traversal surface)
   * ============================================================= *
   * The concrete Maps throughout this module remain the source of
   * truth; this graph is a lightweight relationship mirror maintained
   * automatically wherever a documented entity (venue, building, floor,
   * room, stream, translationStream, speaker, camera, display,
   * participant, segment, ...) is created or removed. Subscribe to the
   * entity-specific event (e.g. ROOM_CREATED) to know when its graph
   * node is guaranteed to exist — mirroring itself does not emit a
   * separate event, to avoid doubling every entity event. The
   * `addGraphNode`/`addGraphEdge`/`removeGraphNode`/`removeGraphEdge`
   * methods below are for plugins/applications that want to extend the
   * graph with their own node types (e.g. Reaction, Donation, Question)
   * — those DO emit events, since they have no other accompanying event.
   */

  /**
   * Adds a custom node to the event graph (for plugin/application use —
   * built-in entity types already mirror themselves automatically).
   * Emits GRAPH_NODE_ADDED.
   * @param {string} type - freeform node type, e.g. "reaction", "donation", "question"
   * @param {Object} [data] - plain data payload (no secrets)
   * @param {string} [sessionId] - optional session this node belongs to
   * @param {string} [nodeId] - optional caller-supplied id; generated if omitted
   * @returns {Readonly<Object>} the created node
   */
  function addGraphNode(type, data, sessionId, nodeId) {
    assert(isNonEmptyString(type), ERROR_CODES.INVALID_ARGUMENT, 'type must be a non-empty string');
    if (data && typeof data === 'object') assertNoSecrets(data);
    const id = nodeId || generateId('node');
    assert(!graphNodes.has(id), ERROR_CODES.ALREADY_EXISTS, `Graph node "${id}" already exists`);
    const node = graphUpsertNode(type, id, sessionId || null, data);
    emit(EVENT_TYPES.GRAPH_NODE_ADDED, { node: cloneData(node) });
    return toPublicGraphNode(node);
  }

  /**
   * Removes a graph node and cascades to its edges. Emits
   * GRAPH_NODE_REMOVED.
   * @param {string} nodeId
   * @returns {boolean}
   */
  function removeGraphNode(nodeId) {
    const node = graphNodes.get(nodeId);
    assert(!!node, ERROR_CODES.NOT_FOUND, `Graph node "${nodeId}" not found`);
    graphRemoveNodeInternal(nodeId);
    emit(EVENT_TYPES.GRAPH_NODE_REMOVED, { node: cloneData(node) });
    return true;
  }

  /**
   * Adds a directed, labeled edge between two existing graph nodes.
   * Emits GRAPH_EDGE_ADDED.
   * @param {string} fromNodeId
   * @param {string} toNodeId
   * @param {string} relation - freeform relation label, e.g. "reacted_to"
   * @returns {Readonly<Object>} the created edge
   */
  function addGraphEdge(fromNodeId, toNodeId, relation) {
    assert(graphNodes.has(fromNodeId), ERROR_CODES.NOT_FOUND, `Graph node "${fromNodeId}" not found`);
    assert(graphNodes.has(toNodeId), ERROR_CODES.NOT_FOUND, `Graph node "${toNodeId}" not found`);
    assert(isNonEmptyString(relation), ERROR_CODES.INVALID_ARGUMENT, 'relation must be a non-empty string');
    const edge = graphAddEdgeInternal(fromNodeId, toNodeId, relation);
    emit(EVENT_TYPES.GRAPH_EDGE_ADDED, { edge: cloneData(edge) });
    return toPublicGraphEdge(edge);
  }

  /**
   * Removes a graph edge. Emits GRAPH_EDGE_REMOVED.
   * @param {string} edgeId
   * @returns {boolean}
   */
  function removeGraphEdge(edgeId) {
    const edge = graphEdgeRecords.get(edgeId);
    assert(!!edge, ERROR_CODES.NOT_FOUND, `Graph edge "${edgeId}" not found`);
    graphRemoveEdgeInternal(edgeId);
    emit(EVENT_TYPES.GRAPH_EDGE_REMOVED, { edge: cloneData(edge) });
    return true;
  }

  /**
   * @param {string} nodeId
   * @returns {Readonly<Object>}
   */
  function getGraphNode(nodeId) {
    const node = graphNodes.get(nodeId);
    assert(!!node, ERROR_CODES.NOT_FOUND, `Graph node "${nodeId}" not found`);
    return toPublicGraphNode(node);
  }

  /**
   * @param {Object} [filter]
   * @param {string} [filter.type]
   * @param {string} [filter.sessionId]
   * @returns {Readonly<Object[]>}
   */
  function listGraphNodes(filter) {
    const f = filter || {};
    let list = Array.from(graphNodes.values());
    if (f.type) list = list.filter((n) => n.type === f.type);
    if (f.sessionId) list = list.filter((n) => n.sessionId === f.sessionId);
    return deepFreeze(list.map((n) => cloneData(n)));
  }

  /**
   * Returns a node's incoming and outgoing edges, for graph traversal.
   * @param {string} nodeId
   * @returns {Readonly<{incoming: Object[], outgoing: Object[]}>}
   */
  function getGraphNeighbors(nodeId) {
    assert(graphNodes.has(nodeId), ERROR_CODES.NOT_FOUND, `Graph node "${nodeId}" not found`);
    const outgoing = Array.from(graphEdgesOut.get(nodeId) || []).map((edgeId) => cloneData(graphEdgeRecords.get(edgeId)));
    const incoming = Array.from(graphEdgesIn.get(nodeId) || []).map((edgeId) => cloneData(graphEdgeRecords.get(edgeId)));
    return deepFreeze({ incoming, outgoing });
  }

  /* ============================================================= *
   * EVENT SYSTEM (public surface over the internal bus)
   * ============================================================= */

  /**
   * Subscribes to an orchestration event. Returns an unsubscribe
   * function. Handlers receive a frozen payload; they cannot mutate
   * internal state through it.
   * @param {string} eventName - one of EVENT_TYPES, or a name registered via registerEventType
   * @param {Function} handler
   * @returns {Function} unsubscribe
   */
  function on(eventName, handler) {
    return bus.on(eventName, handler);
  }

  /**
   * Subscribes to exactly one occurrence of an event.
   * @param {string} eventName
   * @param {Function} handler
   * @returns {Function} unsubscribe
   */
  function once(eventName, handler) {
    return bus.once(eventName, handler);
  }

  /**
   * Unsubscribes a previously registered handler.
   * @param {string} eventName
   * @param {Function} handler
   * @returns {boolean}
   */
  function off(eventName, handler) {
    return bus.off(eventName, handler);
  }

  /**
   * Registers a brand-new event type name for a future feature (e.g. a
   * "VOTE_CAST" event for a future polling feature) so it can be used
   * with `on`/`emitCustomEvent` without modifying this module's source.
   * This is how future features plug into the event bus without
   * requiring a core architecture change.
   * @param {string} eventName
   * @returns {boolean} true if newly registered, false if it already existed
   */
  function registerEventType(eventName) {
    assert(isNonEmptyString(eventName), ERROR_CODES.INVALID_ARGUMENT, 'eventName must be a non-empty string');
    assert(
      !Object.values(EVENT_TYPES).includes(eventName),
      ERROR_CODES.ALREADY_EXISTS,
      `"${eventName}" collides with a built-in event type`
    );
    if (customEventTypes.has(eventName)) return false;
    customEventTypes.add(eventName);
    return true;
  }

  /**
   * Emits a previously registered custom event type. This is the only
   * sanctioned way for a future feature module to push events through
   * OurCozy Live's bus, keeping a single source of truth for event flow
   * without this module needing to know about that feature.
   * @param {string} eventName - must have been registered via registerEventType
   * @param {Object} payload
   * @returns {Readonly<Object>} the emitted payload
   */
  function emitCustomEvent(eventName, payload) {
    assert(
      customEventTypes.has(eventName),
      ERROR_CODES.INVALID_ARGUMENT,
      `"${eventName}" was not registered via registerEventType`
    );
    return emit(eventName, payload);
  }

  /* ============================================================= *
   * DIAGNOSTICS / HEALTH / STATISTICS
   * ============================================================= */

  /**
   * @param {string} sessionId
   * @returns {Readonly<Object>} counters this module actually tracked — never fabricated
   */
  function getDiagnostics(sessionId) {
    getSessionOrThrow(sessionId);
    return deepFreeze(cloneData(ensureDiagnostics(sessionId)));
  }

  /**
   * Reports the health of this orchestration instance. This reflects
   * only what this module itself can observe (registered subsystems,
   * session counts); it cannot and does not report on the health of
   * CozyNetwork transports, hardware, or subsystem internals — that is
   * each subsystem's own responsibility to expose.
   * @returns {Readonly<Object>}
   */
  function getHealth() {
    return deepFreeze({
      status: 'ok',
      version: VERSION,
      activeSessions: sessions.size,
      registeredSubsystems: Array.from(subsystems.keys()),
      registeredHosts: hosts.size,
      uptimeCheckedAt: Date.now()
    });
  }

  /**
   * @param {string} sessionId
   * @returns {Readonly<Object>} aggregate statistics for a session
   */
  function getStatistics(sessionId) {
    const session = getSessionOrThrow(sessionId);
    const diagnostics = ensureDiagnostics(sessionId);
    return deepFreeze({
      sessionId,
      state: session.state,
      participantCount: getParticipantsMap(sessionId).size,
      roomCount: getRoomsMap(sessionId).size,
      zoneCount: getZonesMap(sessionId).size,
      moderatorCount: (moderatorsBySession.get(sessionId) || new Set()).size,
      announcementCount: (announcementsBySession.get(sessionId) || []).length,
      diagnostics: cloneData(diagnostics)
    });
  }

  /* ============================================================= *
   * METADATA / VERSION
   * ============================================================= */

  /** @returns {string} */
  function getVersion() {
    return VERSION;
  }

  /** @returns {Readonly<Object>} */
  function getMetadata() {
    return METADATA;
  }

  /* ============================================================= *
   * EXPORT / IMPORT (state transfer across Main/Regional/Zone/Client hosts)
   * ============================================================= */

  /**
   * Serializes a session and everything under it (rooms, zones,
   * channels, streams, participants, speakers, cameras, displays,
   * devices, moderators, permissions, announcements, attendance,
   * accessibility preferences, timeline, and diagnostics) into a
   * plain-data snapshot suitable for transferring to another host tier
   * via CozyNetwork, or persisting via CozyKernel. Subsystem/service/
   * plugin adapters (functions) are never included. Venue/building/floor
   * records are venue-scoped, not session-scoped, and are intentionally
   * excluded — re-link via `venueId` on the receiving instance if needed.
   * Does not include any other session.
   * @param {string} sessionId
   * @returns {Readonly<Object>} snapshot
   */
  function exportSession(sessionId) {
    const session = getSessionOrThrow(sessionId);
    const rooms = Array.from(getRoomsMap(sessionId).values()).map((room) => {
      const channels = Array.from(getLanguageChannelsMap(room.id).values()).map((channel) => ({
        channel: cloneData(channel),
        audioChannels: Array.from((audioChannelsByLanguageChannel.get(channel.id) || new Map()).values()).map(cloneData),
        subtitleChannels: Array.from((subtitleChannelsByLanguageChannel.get(channel.id) || new Map()).values()).map(cloneData)
      }));
      const streams = Array.from(getStreamsMap(room.id).values()).map((stream) => ({
        stream: cloneData(stream),
        translationStreams: Array.from(getTranslationStreamsMap(stream.id).values()).map(cloneData)
      }));
      const features = Array.from(getVenueFeaturesMap(room.id).values()).map(cloneData);
      return { room: cloneData(room), languageChannels: channels, streams, venueFeatures: features };
    });

    const permMap = permissionsBySession.get(sessionId) || new Map();
    const permsPlain = {};
    for (const [participantId, permSet] of permMap.entries()) {
      permsPlain[participantId] = Array.from(permSet.values());
    }

    const accessibilityMap = accessibilityPrefsBySession.get(sessionId) || new Map();
    const accessibilityPlain = {};
    for (const [participantId, prefs] of accessibilityMap.entries()) {
      accessibilityPlain[participantId] = cloneData(prefs);
    }

    const snapshot = {
      formatVersion: 2,
      exportedAt: Date.now(),
      moduleVersion: VERSION,
      session: cloneData(session),
      rooms,
      zones: Array.from(getZonesMap(sessionId).values()).map(cloneData),
      participants: Array.from(getParticipantsMap(sessionId).values()).map(cloneData),
      speakers: Array.from(getSpeakersMap(sessionId).values()).map(cloneData),
      activeSpeakerByRoom: Array.from(activeSpeakerByRoom.entries()).filter(([rId]) => getRoomsMap(sessionId).has(rId)),
      cameras: Array.from(getCamerasMap(sessionId).values()).map(cloneData),
      displays: Array.from(getDisplaysMap(sessionId).values()).map(cloneData),
      devices: Array.from(getDevicesMap(sessionId).values()).map(cloneData),
      moderators: Array.from((moderatorsBySession.get(sessionId) || new Set()).values()),
      permissions: permsPlain,
      accessibilityPreferences: accessibilityPlain,
      announcements: (announcementsBySession.get(sessionId) || []).map(cloneData),
      attendance: (attendanceBySession.get(sessionId) || []).map(cloneData),
      timeline: (timelineBySession.get(sessionId) || []).map(cloneData),
      nextSequenceNumber: sequenceCounterBySession.get(sessionId) || 0,
      diagnostics: cloneData(ensureDiagnostics(sessionId))
    };
    return deepFreeze(snapshot);
  }

  /**
   * Restores a session (and everything under it) from a snapshot produced
   * by `exportSession`. If a session with the same id already exists, it
   * is rejected — import a copy into a fresh instance, or `endSession`
   * the existing one first. Host registrations, subsystem/service/plugin
   * adapters, and venue/building/floor records are process-local and are
   * intentionally NOT part of the snapshot; re-register/re-link them on
   * the receiving instance. Rebuilds this instance's event-graph mirror
   * for the restored session so graph queries work immediately.
   * @param {Object} snapshot - value produced by exportSession
   * @returns {Readonly<Object>} the restored session snapshot
   */
  function importSession(snapshot) {
    assert(snapshot && typeof snapshot === 'object', ERROR_CODES.INVALID_ARGUMENT, 'snapshot object is required');
    assert(snapshot.session && isNonEmptyString(snapshot.session.id), ERROR_CODES.INVALID_ARGUMENT, 'snapshot.session.id is required');
    assert(
      !sessions.has(snapshot.session.id),
      ERROR_CODES.ALREADY_EXISTS,
      `A session with id "${snapshot.session.id}" already exists in this instance`
    );

    const sessionId = snapshot.session.id;
    sessions.set(sessionId, cloneData(snapshot.session));
    getRoomsMap(sessionId);
    getZonesMap(sessionId);
    getParticipantsMap(sessionId);
    moderatorsBySession.set(sessionId, new Set(snapshot.moderators || []));
    announcementsBySession.set(sessionId, (snapshot.announcements || []).map(cloneData));
    attendanceBySession.set(sessionId, (snapshot.attendance || []).map(cloneData));
    timelineBySession.set(sessionId, (snapshot.timeline || []).map(cloneData));
    sequenceCounterBySession.set(sessionId, snapshot.nextSequenceNumber || 0);
    diagnosticsBySession.set(sessionId, Object.assign(ensureDiagnostics(sessionId), cloneData(snapshot.diagnostics) || {}));

    graphUpsertNode('session', sessionId, sessionId, { title: snapshot.session.title });
    if (snapshot.session.venueId && venues.has(snapshot.session.venueId)) {
      graphAddEdgeInternal(snapshot.session.venueId, sessionId, 'hosts_session');
    }

    for (const zone of snapshot.zones || []) {
      getZonesMap(sessionId).set(zone.id, cloneData(zone));
    }
    for (const entry of snapshot.rooms || []) {
      const room = cloneData(entry.room);
      getRoomsMap(sessionId).set(room.id, room);
      graphUpsertNode('room', room.id, sessionId, { name: room.name });
      graphAddEdgeInternal(sessionId, room.id, 'has_room');

      for (const chEntry of entry.languageChannels || []) {
        const channel = cloneData(chEntry.channel);
        getLanguageChannelsMap(room.id).set(channel.id, channel);
        if (chEntry.audioChannels && chEntry.audioChannels.length) {
          const map = new Map();
          for (const ac of chEntry.audioChannels) map.set(ac.id, cloneData(ac));
          audioChannelsByLanguageChannel.set(channel.id, map);
        }
        if (chEntry.subtitleChannels && chEntry.subtitleChannels.length) {
          const map = new Map();
          for (const sc of chEntry.subtitleChannels) map.set(sc.id, cloneData(sc));
          subtitleChannelsByLanguageChannel.set(channel.id, map);
        }
      }
      for (const streamEntry of entry.streams || []) {
        const stream = cloneData(streamEntry.stream);
        getStreamsMap(room.id).set(stream.id, stream);
        graphUpsertNode('stream', stream.id, sessionId, { roomId: room.id });
        graphAddEdgeInternal(room.id, stream.id, 'has_stream');
        for (const translationStream of streamEntry.translationStreams || []) {
          const ts = cloneData(translationStream);
          getTranslationStreamsMap(stream.id).set(ts.id, ts);
          graphUpsertNode('translationStream', ts.id, sessionId, { languageCode: ts.languageCode });
          graphAddEdgeInternal(stream.id, ts.id, 'has_translation_stream');
        }
      }
      for (const feature of entry.venueFeatures || []) {
        const f = cloneData(feature);
        getVenueFeaturesMap(room.id).set(f.id, f);
        graphUpsertNode('venueFeature', f.id, sessionId, { featureType: f.featureType, name: f.name });
        graphAddEdgeInternal(room.id, f.id, 'has_feature');
      }
    }
    for (const participant of snapshot.participants || []) {
      const p = cloneData(participant);
      getParticipantsMap(sessionId).set(p.id, p);
      const graphNodeId = `participant:${sessionId}:${p.id}`;
      graphUpsertNode('participant', graphNodeId, sessionId, { displayName: p.displayName });
      graphAddEdgeInternal(sessionId, graphNodeId, 'has_participant');
      if (p.roomId) graphAddEdgeInternal(p.roomId, graphNodeId, 'has_participant');
    }
    for (const speaker of snapshot.speakers || []) {
      const s = cloneData(speaker);
      getSpeakersMap(sessionId).set(s.id, s);
      graphUpsertNode('speaker', s.id, sessionId, { displayName: s.displayName, role: s.role });
      graphAddEdgeInternal(sessionId, s.id, 'has_speaker');
      if (s.roomId) graphAddEdgeInternal(s.roomId, s.id, 'has_speaker');
    }
    for (const [roomId, speakerId] of snapshot.activeSpeakerByRoom || []) {
      activeSpeakerByRoom.set(roomId, speakerId);
    }
    for (const camera of snapshot.cameras || []) {
      const c = cloneData(camera);
      getCamerasMap(sessionId).set(c.id, c);
      graphUpsertNode('camera', c.id, sessionId, { name: c.name });
      if (c.roomId) graphAddEdgeInternal(c.roomId, c.id, 'covered_by_camera');
    }
    for (const display of snapshot.displays || []) {
      const d = cloneData(display);
      getDisplaysMap(sessionId).set(d.id, d);
      graphUpsertNode('display', d.id, sessionId, { name: d.name, displayType: d.displayType });
      if (d.roomId) graphAddEdgeInternal(d.roomId, d.id, 'has_display');
    }
    for (const device of snapshot.devices || []) {
      getDevicesMap(sessionId).set(device.id, cloneData(device));
    }
    for (const segment of snapshot.timeline || []) {
      graphUpsertNode('segment', segment.id, sessionId, { sequenceNumber: segment.sequenceNumber, roomId: segment.roomId });
      graphAddEdgeInternal(segment.roomId, segment.id, 'produced_segment');
      if (segment.speakerId) graphAddEdgeInternal(segment.speakerId, segment.id, 'spoke_segment');
    }

    const permMap = new Map();
    for (const [participantId, perms] of Object.entries(snapshot.permissions || {})) {
      permMap.set(participantId, new Set(perms));
    }
    permissionsBySession.set(sessionId, permMap);

    const accessibilityMap = new Map();
    for (const [participantId, prefs] of Object.entries(snapshot.accessibilityPreferences || {})) {
      accessibilityMap.set(participantId, cloneData(prefs));
    }
    accessibilityPrefsBySession.set(sessionId, accessibilityMap);

    const restored = toPublicSession(sessions.get(sessionId));
    emit(EVENT_TYPES.SESSION_CREATED, { sessionId, session: cloneData(sessions.get(sessionId)), imported: true });
    return restored;
  }

  /* ============================================================= *
   * PUBLIC API SURFACE (frozen)
   * ============================================================= */

  const api = {
    // Metadata / version
    getVersion,
    getMetadata,

    // Session lifecycle
    createSession,
    startSession,
    stopSession,
    endSession,
    getSession,
    listSessions,
    updateSessionContext,

    // Participants
    joinSession,
    leaveSession,
    getParticipant,
    listParticipants,
    updateParticipantLanguage,
    assignParticipantToRoom,

    // Rooms
    createRoom,
    updateRoom,
    removeRoom,
    getRoom,
    listRooms,

    // Zones
    createZone,
    updateZone,
    removeZone,
    listZones,

    // Language / audio / subtitle channels
    createLanguageChannel,
    removeLanguageChannel,
    listLanguageChannels,
    createAudioChannel,
    removeAudioChannel,
    listAudioChannels,
    createSubtitleChannel,
    removeSubtitleChannel,
    listSubtitleChannels,

    // Streams (live broadcast object model)
    createStream,
    setStreamStatus,
    removeStream,
    getStream,
    listStreams,
    createTranslationStream,
    removeTranslationStream,
    listTranslationStreams,

    // Speakers
    registerSpeaker,
    removeSpeaker,
    listSpeakers,
    setActiveSpeaker,
    getActiveSpeaker,

    // Cameras
    registerCamera,
    removeCamera,
    listCameras,
    assignCameraToRoom,

    // Displays
    registerDisplay,
    removeDisplay,
    listDisplays,
    assignDisplayRoom,
    broadcastDisplay,

    // Devices
    registerDevice,
    updateDevice,
    removeDevice,
    listDevices,
    reportDeviceHealthEvent,
    getDeviceCapabilities,
    deviceSupportsCapability,

    // Attendance (pure data sink)
    recordAttendance,
    listAttendance,

    // Hosts (distributed scaling / future hardware)
    registerHost,
    changeHost,
    unregisterHost,
    listHosts,

    // Permissions / moderators
    assignModerator,
    revokeModerator,
    isModerator,
    grantPermission,
    revokePermission,
    checkPermission,

    // Accessibility preferences (Accessibility Engine extension point)
    setAccessibilityPreferences,
    getAccessibilityPreferences,
    listAccessibilityPreferences,

    // Announcements
    broadcastAnnouncement,
    listAnnouncements,

    // Subsystem registry (closed, internal-pipeline dependency injection)
    registerSubsystem,
    unregisterSubsystem,
    hasSubsystem,
    listRegisteredSubsystems,

    // Service registry (open, application-facing business/AI services)
    registerService,
    unregisterService,
    getService,
    getServiceCapabilities,
    getServiceHealth,
    listServices,

    // Plugin registry (bookkeeping only; plugins use the event bus)
    registerPlugin,
    unregisterPlugin,
    hasPlugin,
    listPlugins,

    // Pipeline coordination
    relaySpeechSegment,

    // Timeline / segments (Event Replay Graph)
    getTimeline,
    getSegment,

    // Synchronization
    syncTimestamp,

    // Venue Digital Twin
    registerVenue,
    getVenue,
    listVenues,
    createBuilding,
    listBuildings,
    createFloor,
    listFloors,
    createVenueFeature,
    removeVenueFeature,
    listVenueFeatures,
    setVenuePreference,
    getVenuePreference,
    listVenuePreferences,

    // Cozy Event Graph
    addGraphNode,
    removeGraphNode,
    addGraphEdge,
    removeGraphEdge,
    getGraphNode,
    listGraphNodes,
    getGraphNeighbors,

    // Event system
    on,
    once,
    off,
    registerEventType,
    emitCustomEvent,

    // Diagnostics / health / statistics
    getDiagnostics,
    getHealth,
    getStatistics,

    // Export / import
    exportSession,
    importSession
  };

  return Object.freeze(api);
}

/* ----------------------------------------------------------------------- *
 * SECTION 4: MODULE EXPORTS
 * ----------------------------------------------------------------------- */

const OurCozyLiveModule = Object.freeze({
  createOurCozyLive,
  VERSION,
  EVENT_TYPES,
  KNOWN_SUBSYSTEMS,
  HOST_TYPES,
  SESSION_STATES,
  PERMISSIONS,
  ERROR_CODES,
  METADATA,
  STREAM_STATUSES,
  DEVICE_TYPES,
  DISPLAY_TYPES,
  ATTENDANCE_METHODS,
  VENUE_KINDS,
  SESSION_CONTEXTS,
  VENUE_FEATURE_TYPES,
  DEVICE_HEALTH_STATUSES,
  CozyLiveError
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = OurCozyLiveModule;
} else if (typeof globalThis !== 'undefined') {
  globalThis.OurCozyLive = OurCozyLiveModule;
}
