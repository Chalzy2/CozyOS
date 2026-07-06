/**
 * ============================================================================
 * CozyOS Universal Cognitive Core
 * Module:  core/modules/identity/cozy-identity.js
 * Name:    CozyIdentity — Identity, Trust, Permission, Membership and
 *          Access Coordination Kernel
 * Version: 1.0.0-ENTERPRISE
 * Target:  CozyOS Kernel v2+
 * ============================================================================
 *
 * MISSION
 * -------
 * CozyIdentity is the universal Identity, Trust, Permission, Membership and
 * Access Coordination Kernel for CozyOS. Its responsibility is ONLY
 * identity coordination: it tracks identities, organizations, memberships,
 * roles, permissions, access policies, device trust, identity sessions,
 * groups, and privacy preferences, and it emits events describing every
 * change. It is the conductor, never the performer.
 *
 * THIS MODULE MUST NEVER:
 *   - Implement networking, transport, or synchronization protocols.
 *   - Perform speech recognition, translation, or OCR.
 *   - Perform AI reasoning of any kind.
 *   - Implement face recognition, fingerprint recognition, palm/voice
 *     biometrics, or any biometric processing algorithm.
 *   - Implement QR generation, NFC drivers, or smart-card protocols.
 *   - Encrypt, hash, or otherwise perform cryptography.
 *   - Authenticate anyone directly — authentication is ALWAYS delegated to
 *     a registered adapter (see AUTHENTICATION ADAPTERS below).
 *   - Implement business logic of any kind: marketplace rules, church
 *     rules, attendance rules, payment processing, audio/video processing.
 *
 * All of the above belong to adapters (registered via `registerAuthAdapter`
 * or `registerPlugin`) or to application modules built on top of this
 * kernel. CozyIdentity only ever coordinates plain-data identity objects
 * and delegates real work to whatever adapter was registered for it.
 *
 * PRIMARY DESIGN PRINCIPLE: Identity First, Offline First, Internet Optional
 * ---------------------------------------------------------------------------
 * Every read (`getIdentity`, `hasRole`, `checkPermission`, `evaluateAccess`,
 * `validateIdentitySession`, ...) is answered purely from local, in-memory
 * state — none of them make a network call or require connectivity. Identity
 * must keep working when a church, school, or clinic has no internet at
 * all. Where a network/cloud sync is actually wanted, it is an explicit,
 * optional, adapter-delegated act (`syncIdentity`) — never an implicit
 * requirement of any other method.
 *
 * SECURITY MODEL
 * ---------------
 *   - CozyIdentity never encrypts, hashes, or authenticates directly, and
 *     never performs biometric recognition — see `authenticate()`, which
 *     only calls a registered adapter's `verify(...)` method and coordinates
 *     the resulting identity session.
 *   - No credential material, biometric templates, or secrets are ever
 *     accepted, stored, or logged (see `PROHIBITED_FIELD_PATTERN`). Any
 *     metadata/config field that looks like a password, key, token,
 *     biometric template, or credential is rejected defensively.
 *   - Identity never exposes sensitive information without permission —
 *     see `getPublicProfile`, which filters fields by the identity's own
 *     stored visibility preference rather than returning the full record.
 *   - `checkPermission`/`hasRole`/`evaluateAccess` answer "what was granted
 *     to this identity id", never "is this identity id really who it claims
 *     to be" — that is what `authenticate()` (via a registered adapter) and
 *     device trust are for.
 *
 * ARCHITECTURAL PATTERN
 * -----------------------
 * This module follows the same coordinator pattern used throughout CozyOS
 * (see OurCozy Live): a factory function returns a frozen public API object;
 * every value returned across that boundary is a deep-frozen snapshot, never
 * a live internal reference; every mutation emits a corresponding event;
 * subsystem-style integrations are a CLOSED list of core CozyOS modules
 * this kernel's own coordination methods may optionally call
 * (`registerIntegration`, closed to `KNOWN_INTEGRATIONS`), while the
 * open Plugin registry (`registerPlugin`) is pure bookkeeping for
 * application/adapter extensions that receive data exclusively through the
 * public event bus.
 *
 * THREAD SAFETY ASSUMPTIONS
 * -------------------------
 * Single-threaded JS execution per instance, exactly as documented in
 * OurCozy Live. No cross-process locking is implemented; multi-host
 * deployments must serialize state via `exportIdentity`/`importIdentity`
 * and synchronize through a registered integration adapter.
 *
 * INTEGRATION CONTRACTS
 * -----------------------
 * CozyIdentity integrates with OurCozy Live, CozyNetwork, CozyStorage,
 * CozyMarketplace, CozyAttendance, CozySpeech, CozyTranslate, and CozyVision
 * exclusively through `registerIntegration(name, adapter)` — a closed list
 * (`KNOWN_INTEGRATIONS`) of core CozyOS modules this kernel's own
 * coordination methods (currently just `syncIdentity`) may call. It never
 * imports any of these modules directly.
 *
 * Authentication is delegated to adapters registered per method via
 * `registerAuthAdapter(method, adapter)` — Password, PIN, QR Code, Face
 * Recognition, Fingerprint, Palm, Voice, NFC, RFID, Smart Card, Device
 * Certificate, Biometric, One Time Code, and future methods. `authenticate()`
 * calls the adapter's `verify(identityId, credentialRef)` method and
 * coordinates the resulting identity session — it never inspects, stores,
 * or evaluates the credential itself.
 *
 * Everything else that isn't a core integration or an authentication method
 * — Face/Fingerprint/QR/NFC/Voice adapters that aren't used for
 * authentication, Government ID adapters, Church Membership adapters,
 * School adapters, Marketplace adapters, and future plugins — registers
 * through the open Plugin registry (`registerPlugin`) and receives data
 * exclusively through the public event bus, never through direct
 * invocation from this module.
 * ============================================================================
 */

'use strict';

/* ----------------------------------------------------------------------- *
 * SECTION 1: FROZEN CONSTANTS
 * ----------------------------------------------------------------------- */

/** @type {string} Semantic version of this module. */
const VERSION = '1.0.0-ENTERPRISE';

/** @type {Object<string,string>} Supported identity types. `OTHER` is an escape hatch for future identity types. */
const IDENTITY_TYPES = Object.freeze({
  USER: 'USER',
  GUEST: 'GUEST',
  VISITOR: 'VISITOR',
  MEMBER: 'MEMBER',
  CHILD: 'CHILD',
  STUDENT: 'STUDENT',
  TEACHER: 'TEACHER',
  PARENT: 'PARENT',
  PASTOR: 'PASTOR',
  ELDER: 'ELDER',
  LEADER: 'LEADER',
  MODERATOR: 'MODERATOR',
  ADMINISTRATOR: 'ADMINISTRATOR',
  OPERATOR: 'OPERATOR',
  VOLUNTEER: 'VOLUNTEER',
  EMPLOYEE: 'EMPLOYEE',
  VENDOR: 'VENDOR',
  ORGANIZATION: 'ORGANIZATION',
  OTHER: 'OTHER'
});

/** @type {Object<string,string>} Identity lifecycle states. */
const IDENTITY_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  ARCHIVED: 'ARCHIVED',
  REVOKED: 'REVOKED'
});

/** @type {Object<string,string>} Supported organization types. `OTHER` is an escape hatch. */
const ORGANIZATION_TYPES = Object.freeze({
  CHURCH: 'CHURCH',
  SCHOOL: 'SCHOOL',
  HOSPITAL: 'HOSPITAL',
  BUSINESS: 'BUSINESS',
  MARKETPLACE: 'MARKETPLACE',
  GOVERNMENT: 'GOVERNMENT',
  NGO: 'NGO',
  COMMUNITY: 'COMMUNITY',
  FAMILY: 'FAMILY',
  COMPANY: 'COMPANY',
  OTHER: 'OTHER'
});

/** @type {Object<string,string>} Membership lifecycle states. */
const MEMBERSHIP_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  ARCHIVED: 'ARCHIVED',
  TRANSFERRED: 'TRANSFERRED'
});

/**
 * @type {Object<string,string>} Authentication methods this module can
 * delegate to. CozyIdentity never implements any of these itself — see
 * `registerAuthAdapter`/`authenticate`.
 */
const AUTH_METHODS = Object.freeze({
  PASSWORD: 'PASSWORD',
  PIN: 'PIN',
  QR_CODE: 'QR_CODE',
  FACE_RECOGNITION: 'FACE_RECOGNITION',
  FINGERPRINT: 'FINGERPRINT',
  PALM: 'PALM',
  VOICE: 'VOICE',
  NFC: 'NFC',
  RFID: 'RFID',
  SMART_CARD: 'SMART_CARD',
  DEVICE_CERTIFICATE: 'DEVICE_CERTIFICATE',
  BIOMETRIC: 'BIOMETRIC',
  ONE_TIME_CODE: 'ONE_TIME_CODE',
  OTHER: 'OTHER'
});

/**
 * @type {Object<string,string>} Where an identity's authoritative record
 * originates. Purely descriptive metadata — this module treats every
 * identity identically regardless of provider.
 */
const IDENTITY_PROVIDERS = Object.freeze({
  LOCAL: 'LOCAL',
  OFFLINE: 'OFFLINE',
  CLOUD: 'CLOUD',
  GOVERNMENT: 'GOVERNMENT',
  CHURCH: 'CHURCH',
  SCHOOL: 'SCHOOL',
  ORGANIZATION: 'ORGANIZATION',
  OTHER: 'OTHER'
});

/** @type {Object<string,string>} Device categories for the device trust registry. */
const DEVICE_TYPES = Object.freeze({
  PHONE: 'PHONE',
  TABLET: 'TABLET',
  LAPTOP: 'LAPTOP',
  DESKTOP: 'DESKTOP',
  MINI_PC: 'MINI_PC',
  RASPBERRY_PI: 'RASPBERRY_PI',
  ESP32: 'ESP32',
  OURCOZY_HUB: 'OURCOZY_HUB',
  TV: 'TV',
  PROJECTOR: 'PROJECTOR',
  SPEAKER: 'SPEAKER',
  CAMERA: 'CAMERA',
  OTHER: 'OTHER'
});

/** @type {Object<string,string>} Device trust states. */
const DEVICE_TRUST_STATUSES = Object.freeze({
  TRUSTED: 'TRUSTED',
  PENDING: 'PENDING',
  BLOCKED: 'BLOCKED',
  REVOKED: 'REVOKED',
  UNKNOWN: 'UNKNOWN'
});

/**
 * @type {Object<string,string>} Suggested/native permission names. Like
 * OurCozy Live, `grantPermission`/`checkPermission` accept ANY non-empty
 * string so future permissions never require a core change — this enum is
 * a convenience reference for the common ones, not an enforced whitelist.
 */
const PERMISSIONS = Object.freeze({
  READ: 'READ',
  WRITE: 'WRITE',
  DELETE: 'DELETE',
  MODERATE: 'MODERATE',
  BROADCAST: 'BROADCAST',
  TRANSLATE: 'TRANSLATE',
  RECORD: 'RECORD',
  STREAM: 'STREAM',
  MANAGE_DEVICES: 'MANAGE_DEVICES',
  MANAGE_VENUE: 'MANAGE_VENUE',
  MANAGE_MARKETPLACE: 'MANAGE_MARKETPLACE',
  MANAGE_PAYMENTS: 'MANAGE_PAYMENTS',
  EMERGENCY_ACCESS: 'EMERGENCY_ACCESS'
});

/**
 * @type {Object<string,string>} Suggested/native role names. Like
 * PERMISSIONS, `assignRole`/`hasRole` accept ANY non-empty string — this
 * enum is a convenience reference, not an enforced whitelist.
 */
const ROLES = Object.freeze({
  GUEST: 'GUEST',
  VISITOR: 'VISITOR',
  MEMBER: 'MEMBER',
  MODERATOR: 'MODERATOR',
  LEADER: 'LEADER',
  PASTOR: 'PASTOR',
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
  ADMINISTRATOR: 'ADMINISTRATOR',
  SECURITY: 'SECURITY',
  OPERATOR: 'OPERATOR',
  VOLUNTEER: 'VOLUNTEER'
});

/**
 * @type {Object<string,string>} Access levels, ordered from broadest to
 * narrowest via ACCESS_LEVEL_RANK below. `PRIVATE`, `RESTRICTED`, and
 * `EMERGENCY` are special: they are not part of the broad->narrow
 * geographic ladder and are compared for exact match only (see
 * `evaluateAccess`).
 */
const ACCESS_LEVELS = Object.freeze({
  PUBLIC: 'PUBLIC',
  ORGANIZATION: 'ORGANIZATION',
  CAMPUS: 'CAMPUS',
  BUILDING: 'BUILDING',
  FLOOR: 'FLOOR',
  ROOM: 'ROOM',
  PRIVATE: 'PRIVATE',
  RESTRICTED: 'RESTRICTED',
  EMERGENCY: 'EMERGENCY'
});

/**
 * @type {Object<string,number>} Geographic broad->narrow ranking used by
 * `evaluateAccess` for the ladder levels (PUBLIC..ROOM). PRIVATE,
 * RESTRICTED, and EMERGENCY are intentionally excluded from the ranking —
 * they are matched exactly, not compared numerically, since "more private"
 * vs "less private" is not a meaningful geographic ordering.
 */
const ACCESS_LEVEL_RANK = Object.freeze({
  PUBLIC: 0,
  ORGANIZATION: 1,
  CAMPUS: 2,
  BUILDING: 3,
  FLOOR: 4,
  ROOM: 5
});

/** @type {Object<string,string>} Group categories. `CUSTOM`/`OTHER` are escape hatches for arbitrary future groups. */
const GROUP_TYPES = Object.freeze({
  FAMILY: 'FAMILY',
  CHURCH_GROUP: 'CHURCH_GROUP',
  CHOIR: 'CHOIR',
  YOUTH: 'YOUTH',
  CHILDREN: 'CHILDREN',
  DEPARTMENT: 'DEPARTMENT',
  COMMITTEE: 'COMMITTEE',
  SCHOOL_CLASS: 'SCHOOL_CLASS',
  MARKETPLACE_TEAM: 'MARKETPLACE_TEAM',
  CUSTOM: 'CUSTOM',
  OTHER: 'OTHER'
});

/** @type {Object<string,string>} Visibility levels for privacy preferences and `getPublicProfile`. */
const VISIBILITY_LEVELS = Object.freeze({
  PUBLIC: 'PUBLIC',
  ORGANIZATION: 'ORGANIZATION',
  PRIVATE: 'PRIVATE'
});

/**
 * @type {string[]} Closed list of core CozyOS modules CozyIdentity's own
 * coordination methods (currently `syncIdentity`) may optionally call
 * through a registered adapter. Contrast with the open Plugin registry.
 */
const KNOWN_INTEGRATIONS = Object.freeze([
  'OurCozyLive',
  'CozyNetwork',
  'CozyStorage',
  'CozyMarketplace',
  'CozyAttendance',
  'CozySpeech',
  'CozyTranslate',
  'CozyVision'
]);

/** @type {Object<string,string>} Stable error codes for programmatic handling. */
const ERROR_CODES = Object.freeze({
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  INVALID_STATE: 'INVALID_STATE',
  FORBIDDEN: 'FORBIDDEN',
  ADAPTER_NOT_REGISTERED: 'ADAPTER_NOT_REGISTERED',
  ADAPTER_CONTRACT_VIOLATION: 'ADAPTER_CONTRACT_VIOLATION',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED'
});

/**
 * @type {RegExp} Defensive rejection of anything that smells like a secret
 * or biometric template. CozyIdentity never stores credential material.
 */
const PROHIBITED_FIELD_PATTERN =
  /(password|secret|token|apikey|api_key|credential|privatekey|private_key|biometrictemplate|face(scan|template)|fingerprinttemplate|palmtemplate|voiceprint|encryptionkey)/i;

/** @type {Object} Frozen module metadata surfaced through getMetadata(). */
const METADATA = Object.freeze({
  name: 'cozy-identity',
  version: VERSION,
  kernelTarget: 'CozyOS Kernel v2+',
  role: 'identity-trust-permission-membership-access-coordination-kernel',
  isAuthenticationEngine: false,
  isBiometricEngine: false,
  isCryptographyEngine: false,
  isNetworkEngine: false,
  isBusinessLogicEngine: false
});

/* ----------------------------------------------------------------------- *
 * SECTION 2: UTILITIES
 * ----------------------------------------------------------------------- */

let __idCounter = 0;

/**
 * Generates a collision-resistant identifier. Not cryptographically
 * secure — identity verification is the responsibility of registered
 * authentication adapters, not this function.
 * @param {string} prefix
 * @returns {string}
 */
function generateId(prefix) {
  __idCounter += 1;
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${__idCounter.toString(36)}_${rand}`;
}

/**
 * Recursively freezes a plain object/array graph so it is safe to hand
 * across the public API boundary without risking internal-state mutation
 * by the caller.
 * @param {*} value
 * @returns {*} the same value, deeply frozen
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    const child = value[key];
    if (child && typeof child === 'object' && !Object.isFrozen(child)) deepFreeze(child);
  }
  return value;
}

/**
 * Produces a deep, plain-data clone (no functions, no class instances).
 * Functions are dropped intentionally: adapters and callbacks must never
 * leak into snapshots.
 * @param {*} value
 * @returns {*}
 */
function cloneData(value) {
  if (value === undefined || typeof value === 'function') return undefined;
  if (value === null || typeof value !== 'object') return value;
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
 * Rejects payloads carrying anything resembling a secret, credential, or
 * biometric template. CozyIdentity never stores this kind of data.
 * @param {Object} obj
 * @throws {CozyIdentityError} if a forbidden field name is present
 */
function assertNoSecrets(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (PROHIBITED_FIELD_PATTERN.test(key)) {
      throw new CozyIdentityError(
        ERROR_CODES.FORBIDDEN,
        `Field "${key}" looks like a credential/biometric template. CozyIdentity never stores this kind of data.`
      );
    }
  }
}

/** Enterprise error type carrying a stable machine-readable code. */
class CozyIdentityError extends Error {
  /**
   * @param {string} code - one of ERROR_CODES
   * @param {string} message
   * @param {Object} [details]
   */
  constructor(code, message, details) {
    super(message);
    this.name = 'CozyIdentityError';
    this.code = code;
    this.details = details ? deepFreeze(cloneData(details)) : undefined;
  }
}

function assert(condition, code, message, details) {
  if (!condition) throw new CozyIdentityError(code, message, details);
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Minimal, dependency-free enterprise event emitter backing the public
 * on/once/off surface. A throwing handler never prevents other handlers
 * from running and never throws back into the mutation that caused it.
 */
class InternalEventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._handlers = new Map();
  }

  on(eventName, handler) {
    assert(isNonEmptyString(eventName), ERROR_CODES.INVALID_ARGUMENT, 'eventName must be a non-empty string');
    assert(typeof handler === 'function', ERROR_CODES.INVALID_ARGUMENT, 'handler must be a function');
    if (!this._handlers.has(eventName)) this._handlers.set(eventName, new Set());
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
              errHandler({ sourceEvent: eventName, message: err && err.message ? err.message : String(err) });
            } catch (_ignored) {
              /* a broken error handler must never crash the bus */
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
 * SECTION 3: EVENT TAXONOMY
 * ----------------------------------------------------------------------- */

/** @type {Object<string,string>} Enterprise event taxonomy. Frozen. */
const EVENT_TYPES = Object.freeze({
  IDENTITY_CREATED: 'IDENTITY_CREATED',
  IDENTITY_UPDATED: 'IDENTITY_UPDATED',
  IDENTITY_STATUS_CHANGED: 'IDENTITY_STATUS_CHANGED',
  IDENTITY_REMOVED: 'IDENTITY_REMOVED',
  IDENTITIES_MERGED: 'IDENTITIES_MERGED',

  ORGANIZATION_REGISTERED: 'ORGANIZATION_REGISTERED',
  ORGANIZATION_REMOVED: 'ORGANIZATION_REMOVED',

  ORGANIZATION_JOINED: 'ORGANIZATION_JOINED',
  ORGANIZATION_LEFT: 'ORGANIZATION_LEFT',
  MEMBERSHIP_SUSPENDED: 'MEMBERSHIP_SUSPENDED',
  MEMBERSHIP_RESTORED: 'MEMBERSHIP_RESTORED',
  MEMBERSHIP_TRANSFERRED: 'MEMBERSHIP_TRANSFERRED',
  MEMBERSHIP_ARCHIVED: 'MEMBERSHIP_ARCHIVED',

  ROLE_ASSIGNED: 'ROLE_ASSIGNED',
  ROLE_REVOKED: 'ROLE_REVOKED',

  PERMISSION_GRANTED: 'PERMISSION_GRANTED',
  PERMISSION_REVOKED: 'PERMISSION_REVOKED',

  ACCESS_LEVEL_ASSIGNED: 'ACCESS_LEVEL_ASSIGNED',
  ACCESS_POLICY_CREATED: 'ACCESS_POLICY_CREATED',
  ACCESS_POLICY_REMOVED: 'ACCESS_POLICY_REMOVED',

  DEVICE_REGISTERED: 'DEVICE_REGISTERED',
  DEVICE_TRUST_CHANGED: 'DEVICE_TRUST_CHANGED',
  DEVICE_BOUND: 'DEVICE_BOUND',
  DEVICE_UNBOUND: 'DEVICE_UNBOUND',
  DEVICE_REMOVED: 'DEVICE_REMOVED',

  GROUP_CREATED: 'GROUP_CREATED',
  GROUP_REMOVED: 'GROUP_REMOVED',
  GROUP_JOINED: 'GROUP_JOINED',
  GROUP_LEFT: 'GROUP_LEFT',

  PRIVACY_PREFERENCES_SET: 'PRIVACY_PREFERENCES_SET',
  CONSENT_RECORDED: 'CONSENT_RECORDED',

  IDENTITY_SESSION_CREATED: 'IDENTITY_SESSION_CREATED',
  IDENTITY_SESSION_REVOKED: 'IDENTITY_SESSION_REVOKED',

  AUTH_ADAPTER_REGISTERED: 'AUTH_ADAPTER_REGISTERED',
  AUTH_ADAPTER_UNREGISTERED: 'AUTH_ADAPTER_UNREGISTERED',
  AUTHENTICATION_SUCCEEDED: 'AUTHENTICATION_SUCCEEDED',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',

  PLUGIN_REGISTERED: 'PLUGIN_REGISTERED',
  PLUGIN_UNREGISTERED: 'PLUGIN_UNREGISTERED',

  INTEGRATION_REGISTERED: 'INTEGRATION_REGISTERED',
  INTEGRATION_UNREGISTERED: 'INTEGRATION_UNREGISTERED',

  IDENTITY_SYNCED: 'IDENTITY_SYNCED',

  SYSTEM_WARNING: 'SYSTEM_WARNING',
  SYSTEM_ERROR: 'SYSTEM_ERROR'
});

/* ----------------------------------------------------------------------- *
 * SECTION 4: FACTORY
 * ----------------------------------------------------------------------- */

/**
 * Creates an isolated CozyIdentity coordination engine instance.
 *
 * @param {Object} [options]
 * @param {Object} [options.logger] - optional `{ log(level, message, meta) }` convenience hook.
 *   This is NOT the CozyLogger integration contract — use `registerIntegration`
 *   for a real logging integration if one is ever added to KNOWN_INTEGRATIONS.
 * @returns {Readonly<Object>} a frozen public API object
 */
function createCozyIdentity(options) {
  const opts = options || {};
  const localLogger = opts.logger && typeof opts.logger.log === 'function' ? opts.logger : null;

  /* ---------------------- PRIVATE STATE (closure-scoped) ---------------------- */

  /** @type {Map<string, Object>} identityId -> identity record */
  const identities = new Map();
  /** @type {Map<string, Object>} organizationId -> organization record */
  const organizations = new Map();

  /** @type {Map<string, Object>} membershipId -> membership record */
  const memberships = new Map();
  /** @type {Map<string, Set<string>>} identityId -> Set<membershipId> */
  const membershipsByIdentity = new Map();
  /** @type {Map<string, Set<string>>} organizationId -> Set<membershipId> */
  const membershipsByOrganization = new Map();

  /** @type {Map<string, Map<string, Object>>} identityId -> roleKey -> { role, organizationId, assignedAt } */
  const rolesByIdentity = new Map();
  /** @type {Map<string, Set<string>>} identityId -> Set<permission> (identity-global) */
  const permissionsByIdentity = new Map();

  /** @type {Map<string, string>} identityId -> access level */
  const accessLevelByIdentity = new Map();
  /** @type {Map<string, Object>} policyId -> access policy record */
  const accessPolicies = new Map();

  /** @type {Map<string, Object>} deviceId -> device trust record */
  const devices = new Map();
  /** @type {Map<string, Set<string>>} identityId -> Set<deviceId> bound to that identity */
  const devicesByIdentity = new Map();

  /** @type {Map<string, Object>} identitySessionId -> session record */
  const identitySessions = new Map();
  /** @type {Map<string, Set<string>>} identityId -> Set<identitySessionId> */
  const identitySessionsByIdentity = new Map();

  /** @type {Map<string, Object>} groupId -> group record */
  const groups = new Map();
  /** @type {Map<string, Set<string>>} groupId -> Set<identityId> */
  const groupMembers = new Map();
  /** @type {Map<string, Set<string>>} identityId -> Set<groupId> */
  const groupsByIdentity = new Map();

  /** @type {Map<string, Object>} identityId -> privacy preferences */
  const privacyPrefsByIdentity = new Map();
  /** @type {Map<string, Object[]>} identityId -> consent records[] */
  const consentsByIdentity = new Map();

  /** @type {Map<string, Object>} AUTH_METHODS value -> registered adapter */
  const authAdapters = new Map();
  /** @type {Map<string, Object>} plugin name -> adapter (bookkeeping only) */
  const plugins = new Map();
  /** @type {Map<string, Object>} KNOWN_INTEGRATIONS name -> adapter */
  const integrations = new Map();

  const diagnostics = {
    identitiesCreated: 0,
    identitiesRemoved: 0,
    organizationsRegistered: 0,
    membershipsJoined: 0,
    membershipsLeft: 0,
    rolesAssigned: 0,
    permissionsGranted: 0,
    devicesRegistered: 0,
    authenticationSuccesses: 0,
    authenticationFailures: 0,
    identitySessionsCreated: 0,
    identitySessionsRevoked: 0,
    createdAt: Date.now()
  };

  const bus = new InternalEventBus();

  /* ---------------------- PRIVATE HELPERS ---------------------- */

  function log(level, message, meta) {
    if (!localLogger) return;
    try {
      localLogger.log(level, message, meta);
    } catch (_ignored) {
      /* a broken local logger must never break coordination */
    }
  }

  function emit(eventName, payload) {
    const finalPayload = deepFreeze(Object.assign({ eventType: eventName, timestamp: Date.now() }, cloneData(payload) || {}));
    bus.emit(eventName, finalPayload);
    return finalPayload;
  }

  function bumpDiagnostic(field, amount) {
    diagnostics[field] = (diagnostics[field] || 0) + (amount === undefined ? 1 : amount);
  }

  function toPublicSnapshot(entity) {
    return deepFreeze(cloneData(entity));
  }

  function getIdentityOrThrow(identityId) {
    assert(isNonEmptyString(identityId), ERROR_CODES.INVALID_ARGUMENT, 'identityId must be a non-empty string');
    const identity = identities.get(identityId);
    assert(!!identity, ERROR_CODES.NOT_FOUND, `Identity "${identityId}" not found`);
    return identity;
  }

  function getOrganizationOrThrow(organizationId) {
    assert(isNonEmptyString(organizationId), ERROR_CODES.INVALID_ARGUMENT, 'organizationId must be a non-empty string');
    const organization = organizations.get(organizationId);
    assert(!!organization, ERROR_CODES.NOT_FOUND, `Organization "${organizationId}" not found`);
    return organization;
  }

  function getMembershipsByIdentitySet(identityId) {
    if (!membershipsByIdentity.has(identityId)) membershipsByIdentity.set(identityId, new Set());
    return membershipsByIdentity.get(identityId);
  }

  function getMembershipsByOrgSet(organizationId) {
    if (!membershipsByOrganization.has(organizationId)) membershipsByOrganization.set(organizationId, new Set());
    return membershipsByOrganization.get(organizationId);
  }

  function findActiveMembership(identityId, organizationId) {
    for (const membershipId of getMembershipsByIdentitySet(identityId)) {
      const membership = memberships.get(membershipId);
      if (membership && membership.organizationId === organizationId && membership.status !== MEMBERSHIP_STATUSES.TRANSFERRED) {
        return membership;
      }
    }
    return null;
  }

  function getMembershipOrThrow(membershipId) {
    assert(isNonEmptyString(membershipId), ERROR_CODES.INVALID_ARGUMENT, 'membershipId must be a non-empty string');
    const membership = memberships.get(membershipId);
    assert(!!membership, ERROR_CODES.NOT_FOUND, `Membership "${membershipId}" not found`);
    return membership;
  }

  function getRolesMap(identityId) {
    if (!rolesByIdentity.has(identityId)) rolesByIdentity.set(identityId, new Map());
    return rolesByIdentity.get(identityId);
  }

  function roleKey(role, organizationId) {
    return `${role}::${organizationId || 'GLOBAL'}`;
  }

  function getPermissionsSet(identityId) {
    if (!permissionsByIdentity.has(identityId)) permissionsByIdentity.set(identityId, new Set());
    return permissionsByIdentity.get(identityId);
  }

  function getDeviceOrThrow(deviceId) {
    assert(isNonEmptyString(deviceId), ERROR_CODES.INVALID_ARGUMENT, 'deviceId must be a non-empty string');
    const device = devices.get(deviceId);
    assert(!!device, ERROR_CODES.NOT_FOUND, `Device "${deviceId}" not found`);
    return device;
  }

  function getDevicesByIdentitySet(identityId) {
    if (!devicesByIdentity.has(identityId)) devicesByIdentity.set(identityId, new Set());
    return devicesByIdentity.get(identityId);
  }

  function getGroupOrThrow(groupId) {
    assert(isNonEmptyString(groupId), ERROR_CODES.INVALID_ARGUMENT, 'groupId must be a non-empty string');
    const group = groups.get(groupId);
    assert(!!group, ERROR_CODES.NOT_FOUND, `Group "${groupId}" not found`);
    return group;
  }

  function getGroupMembersSet(groupId) {
    if (!groupMembers.has(groupId)) groupMembers.set(groupId, new Set());
    return groupMembers.get(groupId);
  }

  function getGroupsByIdentitySet(identityId) {
    if (!groupsByIdentity.has(identityId)) groupsByIdentity.set(identityId, new Set());
    return groupsByIdentity.get(identityId);
  }

  function getIdentitySessionsByIdentitySet(identityId) {
    if (!identitySessionsByIdentity.has(identityId)) identitySessionsByIdentity.set(identityId, new Set());
    return identitySessionsByIdentity.get(identityId);
  }

  function getAdapterOrThrow(registryLabel, map, key) {
    const adapter = map.get(key);
    assert(!!adapter, ERROR_CODES.ADAPTER_NOT_REGISTERED, `${registryLabel} "${key}" is not registered`);
    return adapter;
  }

  /* ============================================================= *
   * IDENTITY LIFECYCLE
   * ============================================================= */

  /**
   * Creates a new identity. Emits IDENTITY_CREATED.
   * @param {Object} config
   * @param {string} config.displayName
   * @param {string} [config.identityType='USER'] - one of IDENTITY_TYPES
   * @param {string} [config.providerType='LOCAL'] - one of IDENTITY_PROVIDERS
   * @param {Object} [config.metadata] - arbitrary plain data; no credentials permitted
   * @returns {Readonly<Object>} the created identity snapshot
   */
  function createIdentity(config) {
    assert(config && typeof config === 'object', ERROR_CODES.INVALID_ARGUMENT, 'config object is required');
    assert(isNonEmptyString(config.displayName), ERROR_CODES.INVALID_ARGUMENT, 'config.displayName must be a non-empty string');
    const identityType = config.identityType || IDENTITY_TYPES.USER;
    assert(
      Object.values(IDENTITY_TYPES).indexOf(identityType) !== -1,
      ERROR_CODES.INVALID_ARGUMENT,
      `config.identityType must be one of: ${Object.values(IDENTITY_TYPES).join(', ')}`
    );
    const providerType = config.providerType || IDENTITY_PROVIDERS.LOCAL;
    assert(
      Object.values(IDENTITY_PROVIDERS).indexOf(providerType) !== -1,
      ERROR_CODES.INVALID_ARGUMENT,
      `config.providerType must be one of: ${Object.values(IDENTITY_PROVIDERS).join(', ')}`
    );
    assertNoSecrets(config.metadata);

    const id = generateId('identity');
    const identity = {
      id,
      displayName: config.displayName,
      identityType,
      providerType,
      status: IDENTITY_STATUSES.ACTIVE,
      metadata: cloneData(config.metadata) || {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    identities.set(id, identity);
    accessLevelByIdentity.set(id, ACCESS_LEVELS.PUBLIC);
    bumpDiagnostic('identitiesCreated');

    emit(EVENT_TYPES.IDENTITY_CREATED, { identity: cloneData(identity) });
    return toPublicSnapshot(identity);
  }

  /**
   * Updates mutable identity fields (displayName, metadata). Emits
   * IDENTITY_UPDATED.
   * @param {string} identityId
   * @param {Object} updates
   * @returns {Readonly<Object>}
   */
  function updateIdentity(identityId, updates) {
    const identity = getIdentityOrThrow(identityId);
    assert(updates && typeof updates === 'object', ERROR_CODES.INVALID_ARGUMENT, 'updates object is required');
    assertNoSecrets(updates.metadata);

    if (Object.prototype.hasOwnProperty.call(updates, 'displayName')) {
      assert(isNonEmptyString(updates.displayName), ERROR_CODES.INVALID_ARGUMENT, 'updates.displayName must be a non-empty string');
      identity.displayName = updates.displayName;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'metadata')) {
      identity.metadata = Object.assign({}, identity.metadata, cloneData(updates.metadata));
    }
    identity.updatedAt = Date.now();

    emit(EVENT_TYPES.IDENTITY_UPDATED, { identity: cloneData(identity) });
    return toPublicSnapshot(identity);
  }

  /**
   * Transitions an identity's lifecycle status. Emits
   * IDENTITY_STATUS_CHANGED.
   * @param {string} identityId
   * @param {string} status - one of IDENTITY_STATUSES
   * @returns {Readonly<Object>}
   */
  function setIdentityStatus(identityId, status) {
    const identity = getIdentityOrThrow(identityId);
    assert(
      Object.values(IDENTITY_STATUSES).indexOf(status) !== -1,
      ERROR_CODES.INVALID_ARGUMENT,
      `status must be one of: ${Object.values(IDENTITY_STATUSES).join(', ')}`
    );
    const previousStatus = identity.status;
    identity.status = status;
    identity.updatedAt = Date.now();
    emit(EVENT_TYPES.IDENTITY_STATUS_CHANGED, { identityId, previousStatus, status });
    return toPublicSnapshot(identity);
  }

  /** @param {string} identityId @returns {Readonly<Object>} */
  function suspendIdentity(identityId) {
    return setIdentityStatus(identityId, IDENTITY_STATUSES.SUSPENDED);
  }

  /** @param {string} identityId @returns {Readonly<Object>} */
  function restoreIdentity(identityId) {
    return setIdentityStatus(identityId, IDENTITY_STATUSES.ACTIVE);
  }

  /** @param {string} identityId @returns {Readonly<Object>} */
  function archiveIdentity(identityId) {
    return setIdentityStatus(identityId, IDENTITY_STATUSES.ARCHIVED);
  }

  /**
   * Permanently removes an identity and every record that references it
   * (memberships, roles, permissions, access level, group memberships,
   * device bindings — the devices themselves are unbound, not deleted —
   * identity sessions, privacy preferences, consents). Irreversible.
   * Emits IDENTITY_REMOVED.
   * @param {string} identityId
   * @returns {boolean}
   */
  function removeIdentity(identityId) {
    const identity = getIdentityOrThrow(identityId);

    for (const membershipId of Array.from(getMembershipsByIdentitySet(identityId))) {
      const membership = memberships.get(membershipId);
      if (membership) {
        getMembershipsByOrgSet(membership.organizationId).delete(membershipId);
        memberships.delete(membershipId);
      }
    }
    membershipsByIdentity.delete(identityId);
    rolesByIdentity.delete(identityId);
    permissionsByIdentity.delete(identityId);
    accessLevelByIdentity.delete(identityId);

    for (const deviceId of Array.from(getDevicesByIdentitySet(identityId))) {
      const device = devices.get(deviceId);
      if (device) device.boundIdentityId = null;
    }
    devicesByIdentity.delete(identityId);

    for (const sessionId of Array.from(getIdentitySessionsByIdentitySet(identityId))) {
      identitySessions.delete(sessionId);
    }
    identitySessionsByIdentity.delete(identityId);

    for (const groupId of Array.from(getGroupsByIdentitySet(identityId))) {
      const memberSet = groupMembers.get(groupId);
      if (memberSet) memberSet.delete(identityId);
    }
    groupsByIdentity.delete(identityId);

    privacyPrefsByIdentity.delete(identityId);
    consentsByIdentity.delete(identityId);

    identities.delete(identityId);
    bumpDiagnostic('identitiesRemoved');

    emit(EVENT_TYPES.IDENTITY_REMOVED, { identity: cloneData(identity) });
    return true;
  }

  /** @param {string} identityId @returns {Readonly<Object>} */
  function getIdentity(identityId) {
    return toPublicSnapshot(getIdentityOrThrow(identityId));
  }

  /**
   * @param {Object} [filter]
   * @param {string} [filter.identityType]
   * @param {string} [filter.status]
   * @returns {Readonly<Object[]>}
   */
  function listIdentities(filter) {
    const f = filter || {};
    let list = Array.from(identities.values());
    if (f.identityType) list = list.filter((i) => i.identityType === f.identityType);
    if (f.status) list = list.filter((i) => i.status === f.status);
    return deepFreeze(list.map((i) => cloneData(i)));
  }

  /**
   * Consolidates a duplicate identity into a primary one: every
   * membership, role, permission, group membership, and device binding
   * held by `secondaryIdentityId` is moved to `primaryIdentityId` (skipping
   * anything the primary already has), and the secondary identity is
   * archived (not deleted, for audit purposes). This is a pure data
   * consolidation operation — CozyIdentity makes no judgment about which
   * identity *should* be primary; the caller decides. Emits
   * IDENTITIES_MERGED.
   * @param {string} primaryIdentityId
   * @param {string} secondaryIdentityId
   * @returns {Readonly<Object>} the updated primary identity snapshot
   */
  function mergeIdentities(primaryIdentityId, secondaryIdentityId) {
    const primary = getIdentityOrThrow(primaryIdentityId);
    getIdentityOrThrow(secondaryIdentityId);
    assert(
      primaryIdentityId !== secondaryIdentityId,
      ERROR_CODES.INVALID_ARGUMENT,
      'primaryIdentityId and secondaryIdentityId must be different identities'
    );

    // Memberships: move any organization membership the secondary has that
    // the primary doesn't already hold.
    for (const membershipId of Array.from(getMembershipsByIdentitySet(secondaryIdentityId))) {
      const membership = memberships.get(membershipId);
      if (!membership) continue;
      if (!findActiveMembership(primaryIdentityId, membership.organizationId)) {
        membership.identityId = primaryIdentityId;
        getMembershipsByIdentitySet(primaryIdentityId).add(membershipId);
      }
      getMembershipsByIdentitySet(secondaryIdentityId).delete(membershipId);
    }

    // Roles: copy any role the secondary holds that the primary doesn't.
    const secondaryRoles = getRolesMap(secondaryIdentityId);
    const primaryRoles = getRolesMap(primaryIdentityId);
    for (const [key, roleRecord] of secondaryRoles.entries()) {
      if (!primaryRoles.has(key)) primaryRoles.set(key, Object.assign({}, roleRecord));
    }

    // Permissions: union.
    const secondaryPerms = getPermissionsSet(secondaryIdentityId);
    const primaryPerms = getPermissionsSet(primaryIdentityId);
    for (const permission of secondaryPerms) primaryPerms.add(permission);

    // Group memberships.
    for (const groupId of Array.from(getGroupsByIdentitySet(secondaryIdentityId))) {
      getGroupMembersSet(groupId).delete(secondaryIdentityId);
      getGroupMembersSet(groupId).add(primaryIdentityId);
      getGroupsByIdentitySet(primaryIdentityId).add(groupId);
    }
    groupsByIdentity.delete(secondaryIdentityId);

    // Devices bound to the secondary are rebound to the primary.
    for (const deviceId of Array.from(getDevicesByIdentitySet(secondaryIdentityId))) {
      const device = devices.get(deviceId);
      if (device) device.boundIdentityId = primaryIdentityId;
      getDevicesByIdentitySet(primaryIdentityId).add(deviceId);
    }
    devicesByIdentity.delete(secondaryIdentityId);

    setIdentityStatus(secondaryIdentityId, IDENTITY_STATUSES.ARCHIVED);

    emit(EVENT_TYPES.IDENTITIES_MERGED, { primaryIdentityId, secondaryIdentityId });
    return toPublicSnapshot(primary);
  }

  /* ============================================================= *
   * ORGANIZATION REGISTRY
   * ============================================================= */

  /**
   * Registers an organization (Church, School, Hospital, Business,
   * Marketplace, Government, NGO, Community, Family, Company, ...).
   * Emits ORGANIZATION_REGISTERED.
   * @param {Object} config
   * @param {string} config.name
   * @param {string} [config.organizationType='OTHER'] - one of ORGANIZATION_TYPES
   * @param {Object} [config.metadata]
   * @returns {Readonly<Object>}
   */
  function registerOrganization(config) {
    assert(config && typeof config === 'object', ERROR_CODES.INVALID_ARGUMENT, 'config is required');
    assert(isNonEmptyString(config.name), ERROR_CODES.INVALID_ARGUMENT, 'config.name must be a non-empty string');
    const organizationType = config.organizationType || ORGANIZATION_TYPES.OTHER;
    assert(
      Object.values(ORGANIZATION_TYPES).indexOf(organizationType) !== -1,
      ERROR_CODES.INVALID_ARGUMENT,
      `config.organizationType must be one of: ${Object.values(ORGANIZATION_TYPES).join(', ')}`
    );
    assertNoSecrets(config.metadata);

    const id = generateId('org');
    const organization = {
      id,
      name: config.name,
      organizationType,
      metadata: cloneData(config.metadata) || {},
      createdAt: Date.now()
    };
    organizations.set(id, organization);
    bumpDiagnostic('organizationsRegistered');

    emit(EVENT_TYPES.ORGANIZATION_REGISTERED, { organization: cloneData(organization) });
    return toPublicSnapshot(organization);
  }

  /** @param {string} organizationId @returns {Readonly<Object>} */
  function getOrganization(organizationId) {
    return toPublicSnapshot(getOrganizationOrThrow(organizationId));
  }

  /**
   * @param {Object} [filter]
   * @param {string} [filter.organizationType]
   * @returns {Readonly<Object[]>}
   */
  function listOrganizations(filter) {
    const f = filter || {};
    let list = Array.from(organizations.values());
    if (f.organizationType) list = list.filter((o) => o.organizationType === f.organizationType);
    return deepFreeze(list.map((o) => cloneData(o)));
  }

  /**
   * Removes an organization and every membership referencing it. Emits
   * ORGANIZATION_REMOVED.
   * @param {string} organizationId
   * @returns {boolean}
   */
  function removeOrganization(organizationId) {
    const organization = getOrganizationOrThrow(organizationId);
    for (const membershipId of Array.from(getMembershipsByOrgSet(organizationId))) {
      const membership = memberships.get(membershipId);
      if (membership) {
        getMembershipsByIdentitySet(membership.identityId).delete(membershipId);
        memberships.delete(membershipId);
      }
    }
    membershipsByOrganization.delete(organizationId);
    organizations.delete(organizationId);

    emit(EVENT_TYPES.ORGANIZATION_REMOVED, { organization: cloneData(organization) });
    return true;
  }

  /* ============================================================= *
   * MEMBERSHIP LIFECYCLE
   * ============================================================= */

  /**
   * Joins an identity to an organization. Emits ORGANIZATION_JOINED.
   * @param {string} identityId
   * @param {string} organizationId
   * @returns {Readonly<Object>} the created membership snapshot
   */
  function joinOrganization(identityId, organizationId) {
    getIdentityOrThrow(identityId);
    getOrganizationOrThrow(organizationId);
    assert(
      !findActiveMembership(identityId, organizationId),
      ERROR_CODES.ALREADY_EXISTS,
      `Identity "${identityId}" already has an active membership in organization "${organizationId}"`
    );

    const id = generateId('member');
    const membership = {
      id,
      identityId,
      organizationId,
      status: MEMBERSHIP_STATUSES.ACTIVE,
      joinedAt: Date.now(),
      updatedAt: Date.now()
    };
    memberships.set(id, membership);
    getMembershipsByIdentitySet(identityId).add(id);
    getMembershipsByOrgSet(organizationId).add(id);
    bumpDiagnostic('membershipsJoined');

    emit(EVENT_TYPES.ORGANIZATION_JOINED, { membership: cloneData(membership) });
    return toPublicSnapshot(membership);
  }

  /**
   * Ends a membership entirely (as opposed to suspending it). Emits
   * ORGANIZATION_LEFT.
   * @param {string} identityId
   * @param {string} organizationId
   * @returns {boolean}
   */
  function leaveOrganization(identityId, organizationId) {
    const membership = findActiveMembership(identityId, organizationId);
    assert(!!membership, ERROR_CODES.NOT_FOUND, `No active membership for identity "${identityId}" in organization "${organizationId}"`);
    getMembershipsByIdentitySet(identityId).delete(membership.id);
    getMembershipsByOrgSet(organizationId).delete(membership.id);
    memberships.delete(membership.id);
    bumpDiagnostic('membershipsLeft');

    emit(EVENT_TYPES.ORGANIZATION_LEFT, { membership: cloneData(membership) });
    return true;
  }

  /**
   * Suspends a membership without ending it. Emits MEMBERSHIP_SUSPENDED.
   * @param {string} identityId
   * @param {string} organizationId
   * @returns {Readonly<Object>}
   */
  function suspendMembership(identityId, organizationId) {
    const membership = findActiveMembership(identityId, organizationId);
    assert(!!membership, ERROR_CODES.NOT_FOUND, `No active membership for identity "${identityId}" in organization "${organizationId}"`);
    membership.status = MEMBERSHIP_STATUSES.SUSPENDED;
    membership.updatedAt = Date.now();
    emit(EVENT_TYPES.MEMBERSHIP_SUSPENDED, { membership: cloneData(membership) });
    return toPublicSnapshot(membership);
  }

  /**
   * Restores a suspended membership to active. Emits MEMBERSHIP_RESTORED.
   * @param {string} membershipId
   * @returns {Readonly<Object>}
   */
  function restoreMembership(membershipId) {
    const membership = getMembershipOrThrow(membershipId);
    assert(
      membership.status === MEMBERSHIP_STATUSES.SUSPENDED,
      ERROR_CODES.INVALID_STATE,
      `Membership "${membershipId}" is not suspended`
    );
    membership.status = MEMBERSHIP_STATUSES.ACTIVE;
    membership.updatedAt = Date.now();
    emit(EVENT_TYPES.MEMBERSHIP_RESTORED, { membership: cloneData(membership) });
    return toPublicSnapshot(membership);
  }

  /**
   * Archives a membership (kept for audit, no longer active). Emits
   * MEMBERSHIP_ARCHIVED.
   * @param {string} membershipId
   * @returns {Readonly<Object>}
   */
  function archiveMembership(membershipId) {
    const membership = getMembershipOrThrow(membershipId);
    membership.status = MEMBERSHIP_STATUSES.ARCHIVED;
    membership.updatedAt = Date.now();
    emit(EVENT_TYPES.MEMBERSHIP_ARCHIVED, { membership: cloneData(membership) });
    return toPublicSnapshot(membership);
  }

  /**
   * Transfers an identity's membership from one organization to another
   * (e.g. a member relocating to a sister branch). The old membership is
   * marked TRANSFERRED (kept for audit) and a new ACTIVE membership is
   * created. Emits MEMBERSHIP_TRANSFERRED.
   * @param {string} identityId
   * @param {string} fromOrganizationId
   * @param {string} toOrganizationId
   * @returns {Readonly<Object>} the new membership snapshot
   */
  function transferMembership(identityId, fromOrganizationId, toOrganizationId) {
    const fromMembership = findActiveMembership(identityId, fromOrganizationId);
    assert(
      !!fromMembership,
      ERROR_CODES.NOT_FOUND,
      `No active membership for identity "${identityId}" in organization "${fromOrganizationId}"`
    );
    getOrganizationOrThrow(toOrganizationId);

    fromMembership.status = MEMBERSHIP_STATUSES.TRANSFERRED;
    fromMembership.updatedAt = Date.now();

    const id = generateId('member');
    const newMembership = {
      id,
      identityId,
      organizationId: toOrganizationId,
      status: MEMBERSHIP_STATUSES.ACTIVE,
      joinedAt: Date.now(),
      updatedAt: Date.now(),
      transferredFromOrganizationId: fromOrganizationId
    };
    memberships.set(id, newMembership);
    getMembershipsByIdentitySet(identityId).add(id);
    getMembershipsByOrgSet(toOrganizationId).add(id);

    emit(EVENT_TYPES.MEMBERSHIP_TRANSFERRED, {
      identityId,
      fromOrganizationId,
      toOrganizationId,
      membership: cloneData(newMembership)
    });
    return toPublicSnapshot(newMembership);
  }

  /** @param {string} membershipId @returns {Readonly<Object>} */
  function getMembership(membershipId) {
    return toPublicSnapshot(getMembershipOrThrow(membershipId));
  }

  /** @param {string} identityId @returns {Readonly<Object[]>} */
  function listMemberships(identityId) {
    getIdentityOrThrow(identityId);
    return deepFreeze(
      Array.from(getMembershipsByIdentitySet(identityId))
        .map((id) => memberships.get(id))
        .filter(Boolean)
        .map((m) => cloneData(m))
    );
  }

  /** @param {string} organizationId @returns {Readonly<Object[]>} */
  function listOrganizationMembers(organizationId) {
    getOrganizationOrThrow(organizationId);
    return deepFreeze(
      Array.from(getMembershipsByOrgSet(organizationId))
        .map((id) => memberships.get(id))
        .filter(Boolean)
        .map((m) => cloneData(m))
    );
  }

  /* ============================================================= *
   * ROLES
   * ============================================================= */

  /**
   * Assigns a role to an identity, optionally scoped to an organization.
   * A role assigned with no `organizationId` is global and satisfies
   * `hasRole` checks for any organization. Emits ROLE_ASSIGNED.
   * @param {string} identityId
   * @param {string} role - one of ROLES, or a custom string for a future role
   * @param {string} [organizationId] - scope the role to one organization; omit for a global role
   * @returns {Readonly<Object>} the role record
   */
  function assignRole(identityId, role, organizationId) {
    getIdentityOrThrow(identityId);
    assert(isNonEmptyString(role), ERROR_CODES.INVALID_ARGUMENT, 'role must be a non-empty string');
    if (organizationId) getOrganizationOrThrow(organizationId);

    const key = roleKey(role, organizationId);
    const record = { role, organizationId: organizationId || null, assignedAt: Date.now() };
    getRolesMap(identityId).set(key, record);
    bumpDiagnostic('rolesAssigned');

    emit(EVENT_TYPES.ROLE_ASSIGNED, { identityId, role, organizationId: organizationId || null });
    return toPublicSnapshot(record);
  }

  /**
   * Revokes a role from an identity. Emits ROLE_REVOKED.
   * @param {string} identityId
   * @param {string} role
   * @param {string} [organizationId]
   * @returns {boolean}
   */
  function revokeRole(identityId, role, organizationId) {
    const key = roleKey(role, organizationId);
    const removed = getRolesMap(identityId).delete(key);
    if (removed) emit(EVENT_TYPES.ROLE_REVOKED, { identityId, role, organizationId: organizationId || null });
    return removed;
  }

  /**
   * @param {string} identityId
   * @param {string} role
   * @param {string} [organizationId] - if provided, also matches a global role of the same name
   * @returns {boolean}
   */
  function hasRole(identityId, role, organizationId) {
    const rolesMap = getRolesMap(identityId);
    if (organizationId && rolesMap.has(roleKey(role, organizationId))) return true;
    return rolesMap.has(roleKey(role, null));
  }

  /** @param {string} identityId @returns {Readonly<Object[]>} */
  function listRoles(identityId) {
    getIdentityOrThrow(identityId);
    return deepFreeze(Array.from(getRolesMap(identityId).values()).map((r) => cloneData(r)));
  }

  /* ============================================================= *
   * PERMISSIONS
   * ============================================================= */

  /**
   * Grants a permission to an identity (identity-global — use `hasRole`
   * with an organizationId for organization-scoped access nuance, or an
   * Access Policy for room/floor-level nuance). Emits PERMISSION_GRANTED.
   * @param {string} identityId
   * @param {string} permission - one of PERMISSIONS, or a custom string for a future permission
   * @returns {boolean}
   */
  function grantPermission(identityId, permission) {
    getIdentityOrThrow(identityId);
    assert(isNonEmptyString(permission), ERROR_CODES.INVALID_ARGUMENT, 'permission must be a non-empty string');
    getPermissionsSet(identityId).add(permission);
    bumpDiagnostic('permissionsGranted');
    emit(EVENT_TYPES.PERMISSION_GRANTED, { identityId, permission });
    return true;
  }

  /**
   * Revokes a permission from an identity. Emits PERMISSION_REVOKED.
   * @param {string} identityId
   * @param {string} permission
   * @returns {boolean}
   */
  function revokePermission(identityId, permission) {
    const set = permissionsByIdentity.get(identityId);
    const removed = set ? set.delete(permission) : false;
    if (removed) emit(EVENT_TYPES.PERMISSION_REVOKED, { identityId, permission });
    return removed;
  }

  /**
   * @param {string} identityId
   * @param {string} permission
   * @returns {boolean}
   */
  function checkPermission(identityId, permission) {
    const set = permissionsByIdentity.get(identityId);
    return !!set && set.has(permission);
  }

  /** @param {string} identityId @returns {Readonly<string[]>} */
  function listPermissions(identityId) {
    getIdentityOrThrow(identityId);
    return deepFreeze(Array.from(getPermissionsSet(identityId).values()));
  }

  /* ============================================================= *
   * ACCESS LEVELS & ACCESS POLICIES
   * ============================================================= */

  /**
   * Sets an identity's access level. Emits ACCESS_LEVEL_ASSIGNED.
   * @param {string} identityId
   * @param {string} accessLevel - one of ACCESS_LEVELS
   * @returns {Readonly<Object>} { identityId, accessLevel }
   */
  function setAccessLevel(identityId, accessLevel) {
    getIdentityOrThrow(identityId);
    assert(
      Object.values(ACCESS_LEVELS).indexOf(accessLevel) !== -1,
      ERROR_CODES.INVALID_ARGUMENT,
      `accessLevel must be one of: ${Object.values(ACCESS_LEVELS).join(', ')}`
    );
    accessLevelByIdentity.set(identityId, accessLevel);
    emit(EVENT_TYPES.ACCESS_LEVEL_ASSIGNED, { identityId, accessLevel });
    return deepFreeze({ identityId, accessLevel });
  }

  /** @param {string} identityId @returns {string} */
  function getAccessLevel(identityId) {
    getIdentityOrThrow(identityId);
    return accessLevelByIdentity.get(identityId) || ACCESS_LEVELS.PUBLIC;
  }

  /**
   * Creates a named access policy: a deterministic bar an identity must
   * clear (see `evaluateAccess`). Emits ACCESS_POLICY_CREATED.
   * @param {Object} config
   * @param {string} config.name
   * @param {string} [config.requiredAccessLevel] - one of ACCESS_LEVELS
   * @param {string[]} [config.requiredPermissions]
   * @param {Array<{role: string, organizationId?: string}>} [config.requiredRoles]
   * @returns {Readonly<Object>}
   */
  function createAccessPolicy(config) {
    assert(config && typeof config === 'object', ERROR_CODES.INVALID_ARGUMENT, 'config is required');
    assert(isNonEmptyString(config.name), ERROR_CODES.INVALID_ARGUMENT, 'config.name must be a non-empty string');
    if (config.requiredAccessLevel) {
      assert(
        Object.values(ACCESS_LEVELS).indexOf(config.requiredAccessLevel) !== -1,
        ERROR_CODES.INVALID_ARGUMENT,
        `config.requiredAccessLevel must be one of: ${Object.values(ACCESS_LEVELS).join(', ')}`
      );
    }

    const id = generateId('policy');
    const policy = {
      id,
      name: config.name,
      requiredAccessLevel: config.requiredAccessLevel || null,
      requiredPermissions: Array.isArray(config.requiredPermissions) ? config.requiredPermissions.slice() : [],
      requiredRoles: Array.isArray(config.requiredRoles) ? cloneData(config.requiredRoles) : [],
      createdAt: Date.now()
    };
    accessPolicies.set(id, policy);

    emit(EVENT_TYPES.ACCESS_POLICY_CREATED, { policy: cloneData(policy) });
    return toPublicSnapshot(policy);
  }

  /**
   * Removes an access policy. Emits ACCESS_POLICY_REMOVED.
   * @param {string} policyId
   * @returns {boolean}
   */
  function removeAccessPolicy(policyId) {
    const policy = accessPolicies.get(policyId);
    assert(!!policy, ERROR_CODES.NOT_FOUND, `Access policy "${policyId}" not found`);
    accessPolicies.delete(policyId);
    emit(EVENT_TYPES.ACCESS_POLICY_REMOVED, { policy: cloneData(policy) });
    return true;
  }

  /** @param {string} policyId @returns {Readonly<Object>} */
  function getAccessPolicy(policyId) {
    const policy = accessPolicies.get(policyId);
    assert(!!policy, ERROR_CODES.NOT_FOUND, `Access policy "${policyId}" not found`);
    return toPublicSnapshot(policy);
  }

  /** @returns {Readonly<Object[]>} */
  function listAccessPolicies() {
    return deepFreeze(Array.from(accessPolicies.values()).map((p) => cloneData(p)));
  }

  /**
   * Evaluates whether an identity clears an access policy. This is a
   * deterministic set/rank check — not business logic, not AI, not a
   * capability-negotiation engine: it is the basic access-decision
   * primitive any permission kernel provides (the same category of
   * operation as `checkPermission`). The check passes only if ALL of the
   * following that the policy specifies are true:
   *   - `requiredAccessLevel` is on the PUBLIC..ROOM geographic ladder and
   *     the identity's own access level rank is >= the policy's rank
   *     (PRIVATE/RESTRICTED/EMERGENCY are compared for exact match only,
   *     since they aren't part of that geographic ladder);
   *   - every permission in `requiredPermissions` is granted;
   *   - every `{role, organizationId}` pair in `requiredRoles` is held.
   * @param {string} identityId
   * @param {string} policyId
   * @returns {boolean}
   */
  function evaluateAccess(identityId, policyId) {
    getIdentityOrThrow(identityId);
    const policy = accessPolicies.get(policyId);
    assert(!!policy, ERROR_CODES.NOT_FOUND, `Access policy "${policyId}" not found`);

    if (policy.requiredAccessLevel) {
      const identityLevel = getAccessLevel(identityId);
      const requiredRank = ACCESS_LEVEL_RANK[policy.requiredAccessLevel];
      const identityRank = ACCESS_LEVEL_RANK[identityLevel];
      if (requiredRank !== undefined && identityRank !== undefined) {
        if (identityRank < requiredRank) return false;
      } else if (identityLevel !== policy.requiredAccessLevel) {
        return false;
      }
    }

    for (const permission of policy.requiredPermissions) {
      if (!checkPermission(identityId, permission)) return false;
    }

    for (const roleReq of policy.requiredRoles) {
      if (!hasRole(identityId, roleReq.role, roleReq.organizationId)) return false;
    }

    return true;
  }

  /* ============================================================= *
   * DEVICE TRUST REGISTRY
   * ============================================================= */

  /**
   * Registers a device for trust tracking. Emits DEVICE_REGISTERED.
   * @param {Object} config
   * @param {string} config.deviceType - one of DEVICE_TYPES
   * @param {string} config.name
   * @param {string} [config.trustStatus='UNKNOWN'] - one of DEVICE_TRUST_STATUSES
   * @param {string} [config.boundIdentityId]
   * @param {Object} [config.metadata]
   * @returns {Readonly<Object>}
   */
  function registerDevice(config) {
    assert(config && typeof config === 'object', ERROR_CODES.INVALID_ARGUMENT, 'config is required');
    assert(
      Object.values(DEVICE_TYPES).indexOf(config.deviceType) !== -1,
      ERROR_CODES.INVALID_ARGUMENT,
      `config.deviceType must be one of: ${Object.values(DEVICE_TYPES).join(', ')}`
    );
    assert(isNonEmptyString(config.name), ERROR_CODES.INVALID_ARGUMENT, 'config.name must be a non-empty string');
    const trustStatus = config.trustStatus || DEVICE_TRUST_STATUSES.UNKNOWN;
    assert(
      Object.values(DEVICE_TRUST_STATUSES).indexOf(trustStatus) !== -1,
      ERROR_CODES.INVALID_ARGUMENT,
      `config.trustStatus must be one of: ${Object.values(DEVICE_TRUST_STATUSES).join(', ')}`
    );
    assertNoSecrets(config.metadata);
    if (config.boundIdentityId) getIdentityOrThrow(config.boundIdentityId);

    const id = generateId('device');
    const device = {
      id,
      deviceType: config.deviceType,
      name: config.name,
      trustStatus,
      boundIdentityId: config.boundIdentityId || null,
      metadata: cloneData(config.metadata) || {},
      registeredAt: Date.now()
    };
    devices.set(id, device);
    if (device.boundIdentityId) getDevicesByIdentitySet(device.boundIdentityId).add(id);
    bumpDiagnostic('devicesRegistered');

    emit(EVENT_TYPES.DEVICE_REGISTERED, { device: cloneData(device) });
    return toPublicSnapshot(device);
  }

  /**
   * Transitions a device's trust status (Trusted/Pending/Blocked/Revoked/
   * Unknown). Emits DEVICE_TRUST_CHANGED.
   * @param {string} deviceId
   * @param {string} trustStatus - one of DEVICE_TRUST_STATUSES
   * @returns {Readonly<Object>}
   */
  function setDeviceTrustStatus(deviceId, trustStatus) {
    const device = getDeviceOrThrow(deviceId);
    assert(
      Object.values(DEVICE_TRUST_STATUSES).indexOf(trustStatus) !== -1,
      ERROR_CODES.INVALID_ARGUMENT,
      `trustStatus must be one of: ${Object.values(DEVICE_TRUST_STATUSES).join(', ')}`
    );
    const previousTrustStatus = device.trustStatus;
    device.trustStatus = trustStatus;
    emit(EVENT_TYPES.DEVICE_TRUST_CHANGED, { deviceId, previousTrustStatus, trustStatus });
    return toPublicSnapshot(device);
  }

  /**
   * Binds a device to an identity. Emits DEVICE_BOUND.
   * @param {string} deviceId
   * @param {string} identityId
   * @returns {Readonly<Object>}
   */
  function bindDeviceToIdentity(deviceId, identityId) {
    const device = getDeviceOrThrow(deviceId);
    getIdentityOrThrow(identityId);
    if (device.boundIdentityId) getDevicesByIdentitySet(device.boundIdentityId).delete(deviceId);
    device.boundIdentityId = identityId;
    getDevicesByIdentitySet(identityId).add(deviceId);
    emit(EVENT_TYPES.DEVICE_BOUND, { deviceId, identityId });
    return toPublicSnapshot(device);
  }

  /**
   * Unbinds a device from whichever identity it's bound to. Emits
   * DEVICE_UNBOUND.
   * @param {string} deviceId
   * @returns {Readonly<Object>}
   */
  function unbindDevice(deviceId) {
    const device = getDeviceOrThrow(deviceId);
    const previousIdentityId = device.boundIdentityId;
    if (previousIdentityId) getDevicesByIdentitySet(previousIdentityId).delete(deviceId);
    device.boundIdentityId = null;
    emit(EVENT_TYPES.DEVICE_UNBOUND, { deviceId, previousIdentityId });
    return toPublicSnapshot(device);
  }

  /**
   * Removes a device registration entirely. Emits DEVICE_REMOVED.
   * @param {string} deviceId
   * @returns {boolean}
   */
  function removeDevice(deviceId) {
    const device = getDeviceOrThrow(deviceId);
    if (device.boundIdentityId) getDevicesByIdentitySet(device.boundIdentityId).delete(deviceId);
    devices.delete(deviceId);
    emit(EVENT_TYPES.DEVICE_REMOVED, { device: cloneData(device) });
    return true;
  }

  /** @param {string} deviceId @returns {Readonly<Object>} */
  function getDevice(deviceId) {
    return toPublicSnapshot(getDeviceOrThrow(deviceId));
  }

  /**
   * @param {Object} [filter]
   * @param {string} [filter.deviceType]
   * @param {string} [filter.trustStatus]
   * @param {string} [filter.boundIdentityId]
   * @returns {Readonly<Object[]>}
   */
  function listDevices(filter) {
    const f = filter || {};
    let list = Array.from(devices.values());
    if (f.deviceType) list = list.filter((d) => d.deviceType === f.deviceType);
    if (f.trustStatus) list = list.filter((d) => d.trustStatus === f.trustStatus);
    if (f.boundIdentityId) list = list.filter((d) => d.boundIdentityId === f.boundIdentityId);
    return deepFreeze(list.map((d) => cloneData(d)));
  }

  /* ============================================================= *
   * IDENTITY SESSIONS
   * ============================================================= */

  /**
   * Creates an identity session (a coordination record for "this identity
   * is currently signed in", not a network/HTTP session). Emits
   * IDENTITY_SESSION_CREATED.
   * @param {string} identityId
   * @param {Object} [config]
   * @param {string} [config.deviceId]
   * @param {string} [config.authMethod] - one of AUTH_METHODS
   * @param {number} [config.ttlMs] - time-to-live in milliseconds; omit for no expiry
   * @returns {Readonly<Object>}
   */
  function createIdentitySession(identityId, config) {
    getIdentityOrThrow(identityId);
    const cfg = config || {};
    if (cfg.deviceId) getDeviceOrThrow(cfg.deviceId);
    if (cfg.authMethod) {
      assert(
        Object.values(AUTH_METHODS).indexOf(cfg.authMethod) !== -1,
        ERROR_CODES.INVALID_ARGUMENT,
        `config.authMethod must be one of: ${Object.values(AUTH_METHODS).join(', ')}`
      );
    }

    const id = generateId('idsession');
    const session = {
      id,
      identityId,
      deviceId: cfg.deviceId || null,
      authMethod: cfg.authMethod || null,
      createdAt: Date.now(),
      expiresAt: typeof cfg.ttlMs === 'number' ? Date.now() + cfg.ttlMs : null,
      revoked: false
    };
    identitySessions.set(id, session);
    getIdentitySessionsByIdentitySet(identityId).add(id);
    bumpDiagnostic('identitySessionsCreated');

    emit(EVENT_TYPES.IDENTITY_SESSION_CREATED, { session: cloneData(session) });
    return toPublicSnapshot(session);
  }

  /**
   * Revokes an identity session. Emits IDENTITY_SESSION_REVOKED.
   * @param {string} identitySessionId
   * @returns {boolean}
   */
  function revokeIdentitySession(identitySessionId) {
    const session = identitySessions.get(identitySessionId);
    assert(!!session, ERROR_CODES.NOT_FOUND, `Identity session "${identitySessionId}" not found`);
    session.revoked = true;
    bumpDiagnostic('identitySessionsRevoked');
    emit(EVENT_TYPES.IDENTITY_SESSION_REVOKED, { session: cloneData(session) });
    return true;
  }

  /**
   * Checks whether an identity session is currently valid (exists, not
   * revoked, not expired). Pure local state check — no network call.
   * @param {string} identitySessionId
   * @returns {boolean}
   */
  function validateIdentitySession(identitySessionId) {
    const session = identitySessions.get(identitySessionId);
    if (!session) return false;
    if (session.revoked) return false;
    if (session.expiresAt !== null && Date.now() >= session.expiresAt) return false;
    return true;
  }

  /** @param {string} identityId @returns {Readonly<Object[]>} */
  function listIdentitySessions(identityId) {
    getIdentityOrThrow(identityId);
    return deepFreeze(
      Array.from(getIdentitySessionsByIdentitySet(identityId))
        .map((id) => identitySessions.get(id))
        .filter(Boolean)
        .map((s) => cloneData(s))
    );
  }

  /* ============================================================= *
   * AUTHENTICATION (delegated — CozyIdentity never authenticates directly)
   * ============================================================= */

  /**
   * Registers an authentication adapter for a method. Registering the
   * same method again overwrites the previous adapter (hot-swap). Emits
   * AUTH_ADAPTER_REGISTERED.
   * @param {string} method - one of AUTH_METHODS
   * @param {Object} adapter - must expose `verify(identityId, credentialRef)` returning
   *   a boolean or `{ success: boolean }`; this module never inspects `credentialRef`.
   * @returns {boolean}
   */
  function registerAuthAdapter(method, adapter) {
    assert(
      Object.values(AUTH_METHODS).indexOf(method) !== -1,
      ERROR_CODES.INVALID_ARGUMENT,
      `method must be one of: ${Object.values(AUTH_METHODS).join(', ')}`
    );
    assert(adapter && typeof adapter === 'object', ERROR_CODES.INVALID_ARGUMENT, 'adapter must be an object');
    assert(typeof adapter.verify === 'function', ERROR_CODES.INVALID_ARGUMENT, 'adapter must expose verify(identityId, credentialRef)');
    authAdapters.set(method, adapter);
    emit(EVENT_TYPES.AUTH_ADAPTER_REGISTERED, { method });
    return true;
  }

  /**
   * Unregisters an authentication adapter. Emits AUTH_ADAPTER_UNREGISTERED.
   * @param {string} method
   * @returns {boolean}
   */
  function unregisterAuthAdapter(method) {
    const removed = authAdapters.delete(method);
    if (removed) emit(EVENT_TYPES.AUTH_ADAPTER_UNREGISTERED, { method });
    return removed;
  }

  /** @param {string} method @returns {boolean} */
  function hasAuthAdapter(method) {
    return authAdapters.has(method);
  }

  /** @returns {Readonly<string[]>} */
  function listRegisteredAuthAdapters() {
    return deepFreeze(Array.from(authAdapters.keys()));
  }

  /**
   * Coordinates authentication: calls the registered adapter for `method`
   * with `(identityId, credentialRef)` and interprets its result. This
   * module never inspects, stores, or evaluates `credentialRef` itself —
   * that is entirely the adapter's concern (a password checker, a face
   * recognition engine, an NFC reader, etc.). On success, creates and
   * returns an identity session; on failure, throws AUTHENTICATION_FAILED.
   * Emits AUTHENTICATION_SUCCEEDED or AUTHENTICATION_FAILED.
   * @param {string} identityId
   * @param {string} method - one of AUTH_METHODS
   * @param {*} credentialRef - opaque reference to the credential; never inspected by this module
   * @param {Object} [sessionConfig] - passed through to `createIdentitySession` on success (deviceId, ttlMs)
   * @returns {Readonly<Object>} the created identity session
   * @throws {CozyIdentityError} ADAPTER_NOT_REGISTERED if no adapter is registered for `method`
   * @throws {CozyIdentityError} AUTHENTICATION_FAILED if the adapter reports failure
   */
  function authenticate(identityId, method, credentialRef, sessionConfig) {
    const identity = getIdentityOrThrow(identityId);
    assert(
      identity.status === IDENTITY_STATUSES.ACTIVE,
      ERROR_CODES.INVALID_STATE,
      `Identity "${identityId}" is not ACTIVE`
    );
    const adapter = getAdapterOrThrow('Authentication adapter', authAdapters, method);

    const rawResult = adapter.verify(identityId, credentialRef);
    const success = typeof rawResult === 'boolean' ? rawResult : !!(rawResult && rawResult.success);

    if (!success) {
      bumpDiagnostic('authenticationFailures');
      emit(EVENT_TYPES.AUTHENTICATION_FAILED, { identityId, method });
      throw new CozyIdentityError(ERROR_CODES.AUTHENTICATION_FAILED, `Authentication failed for identity "${identityId}" via ${method}`);
    }

    bumpDiagnostic('authenticationSuccesses');
    emit(EVENT_TYPES.AUTHENTICATION_SUCCEEDED, { identityId, method });

    const cfg = Object.assign({}, sessionConfig || {}, { authMethod: method });
    return createIdentitySession(identityId, cfg);
  }

  /* ============================================================= *
   * GROUPS
   * ============================================================= */

  /**
   * Creates a group (Family, Church Group, Choir, Youth, Children,
   * Department, Committee, School Class, Marketplace Team, Custom).
   * Emits GROUP_CREATED.
   * @param {Object} config
   * @param {string} config.name
   * @param {string} [config.groupType='OTHER'] - one of GROUP_TYPES
   * @param {string} [config.organizationId] - optionally scope the group to an organization
   * @returns {Readonly<Object>}
   */
  function createGroup(config) {
    assert(config && typeof config === 'object', ERROR_CODES.INVALID_ARGUMENT, 'config is required');
    assert(isNonEmptyString(config.name), ERROR_CODES.INVALID_ARGUMENT, 'config.name must be a non-empty string');
    const groupType = config.groupType || GROUP_TYPES.OTHER;
    assert(
      Object.values(GROUP_TYPES).indexOf(groupType) !== -1,
      ERROR_CODES.INVALID_ARGUMENT,
      `config.groupType must be one of: ${Object.values(GROUP_TYPES).join(', ')}`
    );
    if (config.organizationId) getOrganizationOrThrow(config.organizationId);

    const id = generateId('group');
    const group = {
      id,
      name: config.name,
      groupType,
      organizationId: config.organizationId || null,
      createdAt: Date.now()
    };
    groups.set(id, group);

    emit(EVENT_TYPES.GROUP_CREATED, { group: cloneData(group) });
    return toPublicSnapshot(group);
  }

  /**
   * Removes a group and clears every identity's membership in it. Emits
   * GROUP_REMOVED.
   * @param {string} groupId
   * @returns {boolean}
   */
  function removeGroup(groupId) {
    const group = getGroupOrThrow(groupId);
    for (const identityId of Array.from(getGroupMembersSet(groupId))) {
      getGroupsByIdentitySet(identityId).delete(groupId);
    }
    groupMembers.delete(groupId);
    groups.delete(groupId);
    emit(EVENT_TYPES.GROUP_REMOVED, { group: cloneData(group) });
    return true;
  }

  /**
   * @param {Object} [filter]
   * @param {string} [filter.organizationId]
   * @param {string} [filter.groupType]
   * @returns {Readonly<Object[]>}
   */
  function listGroups(filter) {
    const f = filter || {};
    let list = Array.from(groups.values());
    if (f.organizationId) list = list.filter((g) => g.organizationId === f.organizationId);
    if (f.groupType) list = list.filter((g) => g.groupType === f.groupType);
    return deepFreeze(list.map((g) => cloneData(g)));
  }

  /**
   * Adds an identity to a group. Emits GROUP_JOINED.
   * @param {string} identityId
   * @param {string} groupId
   * @returns {boolean}
   */
  function joinGroup(identityId, groupId) {
    getIdentityOrThrow(identityId);
    getGroupOrThrow(groupId);
    getGroupMembersSet(groupId).add(identityId);
    getGroupsByIdentitySet(identityId).add(groupId);
    emit(EVENT_TYPES.GROUP_JOINED, { identityId, groupId });
    return true;
  }

  /**
   * Removes an identity from a group. Emits GROUP_LEFT.
   * @param {string} identityId
   * @param {string} groupId
   * @returns {boolean}
   */
  function leaveGroup(identityId, groupId) {
    getGroupOrThrow(groupId);
    const removed = getGroupMembersSet(groupId).delete(identityId);
    if (removed) {
      getGroupsByIdentitySet(identityId).delete(groupId);
      emit(EVENT_TYPES.GROUP_LEFT, { identityId, groupId });
    }
    return removed;
  }

  /** @param {string} groupId @returns {Readonly<string[]>} */
  function listGroupMembers(groupId) {
    getGroupOrThrow(groupId);
    return deepFreeze(Array.from(getGroupMembersSet(groupId)));
  }

  /** @param {string} identityId @returns {Readonly<string[]>} */
  function listIdentityGroups(identityId) {
    getIdentityOrThrow(identityId);
    return deepFreeze(Array.from(getGroupsByIdentitySet(identityId)));
  }

  /* ============================================================= *
   * PRIVACY
   * ============================================================= */

  /**
   * Sets (merges) an identity's privacy preferences — visibility,
   * consent flags, profile/sharing preferences. Emits
   * PRIVACY_PREFERENCES_SET.
   * @param {string} identityId
   * @param {Object} prefs - arbitrary plain-data preference flags; `visibility` if present must be one of VISIBILITY_LEVELS
   * @returns {Readonly<Object>} merged preferences
   */
  function setPrivacyPreferences(identityId, prefs) {
    getIdentityOrThrow(identityId);
    assert(prefs && typeof prefs === 'object', ERROR_CODES.INVALID_ARGUMENT, 'prefs object is required');
    assertNoSecrets(prefs);
    if (prefs.visibility) {
      assert(
        Object.values(VISIBILITY_LEVELS).indexOf(prefs.visibility) !== -1,
        ERROR_CODES.INVALID_ARGUMENT,
        `prefs.visibility must be one of: ${Object.values(VISIBILITY_LEVELS).join(', ')}`
      );
    }

    const merged = Object.assign({}, privacyPrefsByIdentity.get(identityId) || {}, cloneData(prefs));
    privacyPrefsByIdentity.set(identityId, merged);
    emit(EVENT_TYPES.PRIVACY_PREFERENCES_SET, { identityId, prefs: cloneData(merged) });
    return deepFreeze(cloneData(merged));
  }

  /** @param {string} identityId @returns {Readonly<Object>} */
  function getPrivacyPreferences(identityId) {
    getIdentityOrThrow(identityId);
    return deepFreeze(cloneData(privacyPrefsByIdentity.get(identityId) || {}));
  }

  /**
   * Records a consent decision. Emits CONSENT_RECORDED.
   * @param {string} identityId
   * @param {string} consentType - freeform, e.g. "data-sharing", "photo-release"
   * @param {boolean} granted
   * @param {Object} [meta]
   * @returns {Readonly<Object>}
   */
  function recordConsent(identityId, consentType, granted, meta) {
    getIdentityOrThrow(identityId);
    assert(isNonEmptyString(consentType), ERROR_CODES.INVALID_ARGUMENT, 'consentType must be a non-empty string');
    assert(typeof granted === 'boolean', ERROR_CODES.INVALID_ARGUMENT, 'granted must be a boolean');
    assertNoSecrets(meta);

    const record = {
      id: generateId('consent'),
      identityId,
      consentType,
      granted,
      meta: cloneData(meta) || {},
      recordedAt: Date.now()
    };
    if (!consentsByIdentity.has(identityId)) consentsByIdentity.set(identityId, []);
    consentsByIdentity.get(identityId).push(record);

    emit(EVENT_TYPES.CONSENT_RECORDED, { consent: cloneData(record) });
    return deepFreeze(cloneData(record));
  }

  /** @param {string} identityId @returns {Readonly<Object[]>} */
  function listConsents(identityId) {
    getIdentityOrThrow(identityId);
    return deepFreeze((consentsByIdentity.get(identityId) || []).map((c) => cloneData(c)));
  }

  /**
   * Returns only the fields of an identity permitted by its own stored
   * visibility preference — a deterministic data filter, never a
   * judgment call. `PUBLIC` returns displayName/identityType; `ORGANIZATION`
   * additionally includes organization memberships; `PRIVATE` (the
   * default if no preference was set) returns only the identity id.
   * @param {string} identityId
   * @returns {Readonly<Object>}
   */
  function getPublicProfile(identityId) {
    const identity = getIdentityOrThrow(identityId);
    const prefs = privacyPrefsByIdentity.get(identityId) || {};
    const visibility = prefs.visibility || VISIBILITY_LEVELS.PRIVATE;

    if (visibility === VISIBILITY_LEVELS.PRIVATE) {
      return deepFreeze({ id: identity.id, visibility });
    }
    const profile = { id: identity.id, displayName: identity.displayName, identityType: identity.identityType, visibility };
    if (visibility === VISIBILITY_LEVELS.ORGANIZATION) {
      profile.organizationIds = Array.from(getMembershipsByIdentitySet(identityId))
        .map((mId) => memberships.get(mId))
        .filter((m) => m && m.status === MEMBERSHIP_STATUSES.ACTIVE)
        .map((m) => m.organizationId);
    }
    return deepFreeze(profile);
  }

  /* ============================================================= *
   * PLUGIN REGISTRY (open — Face/Fingerprint/QR/NFC/Voice adapters that
   * aren't used for authentication, Government ID, Church Membership,
   * School, Marketplace, and future plugins)
   * ============================================================= *
   * Pure bookkeeping, exactly like OurCozy Live's plugin registry.
   * Plugins receive data exclusively through the public event bus — this
   * registry never invokes a plugin's methods directly.
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

  /** @param {string} name @returns {boolean} */
  function hasPlugin(name) {
    return plugins.has(name);
  }

  /** @returns {Readonly<string[]>} */
  function listPlugins() {
    return deepFreeze(Array.from(plugins.keys()));
  }

  /* ============================================================= *
   * INTEGRATION REGISTRY (closed — core CozyOS modules only)
   * ============================================================= */

  /**
   * Registers an adapter for a named core CozyOS integration
   * (`KNOWN_INTEGRATIONS`). Registering the same name again overwrites
   * the previous adapter. Emits INTEGRATION_REGISTERED.
   * @param {string} name - one of KNOWN_INTEGRATIONS
   * @param {Object} adapter
   * @returns {boolean}
   */
  function registerIntegration(name, adapter) {
    assert(
      KNOWN_INTEGRATIONS.indexOf(name) !== -1,
      ERROR_CODES.INVALID_ARGUMENT,
      `Unknown integration "${name}". Expected one of: ${KNOWN_INTEGRATIONS.join(', ')}`
    );
    assert(adapter && typeof adapter === 'object', ERROR_CODES.INVALID_ARGUMENT, 'adapter must be an object');
    integrations.set(name, adapter);
    emit(EVENT_TYPES.INTEGRATION_REGISTERED, { name });
    return true;
  }

  /**
   * Unregisters an integration adapter. Emits INTEGRATION_UNREGISTERED.
   * @param {string} name
   * @returns {boolean}
   */
  function unregisterIntegration(name) {
    const removed = integrations.delete(name);
    if (removed) emit(EVENT_TYPES.INTEGRATION_UNREGISTERED, { name });
    return removed;
  }

  /** @param {string} name @returns {boolean} */
  function hasIntegration(name) {
    return integrations.has(name);
  }

  /** @returns {Readonly<string[]>} */
  function listRegisteredIntegrations() {
    return deepFreeze(Array.from(integrations.keys()));
  }

  /* ============================================================= *
   * IDENTITY EXPORT / IMPORT / SYNC
   * ============================================================= */

  /**
   * Serializes an identity and everything that references it
   * (memberships, roles, permissions, access level, group memberships,
   * bound device ids, privacy preferences, consents) into a plain-data
   * snapshot. Identity sessions are intentionally excluded (ephemeral,
   * security-sensitive — re-authenticate on the receiving instance
   * instead). Integration/plugin/auth adapters (functions) are never
   * included.
   * @param {string} identityId
   * @returns {Readonly<Object>} snapshot
   */
  function exportIdentity(identityId) {
    const identity = getIdentityOrThrow(identityId);
    const membershipRecords = Array.from(getMembershipsByIdentitySet(identityId))
      .map((id) => memberships.get(id))
      .filter(Boolean)
      .map((m) => cloneData(m));

    const roleRecords = Array.from(getRolesMap(identityId).values()).map((r) => cloneData(r));
    const permissionRecords = Array.from(getPermissionsSet(identityId));
    const groupIds = Array.from(getGroupsByIdentitySet(identityId));
    const deviceIds = Array.from(getDevicesByIdentitySet(identityId));

    const snapshot = {
      formatVersion: 1,
      exportedAt: Date.now(),
      moduleVersion: VERSION,
      identity: cloneData(identity),
      accessLevel: accessLevelByIdentity.get(identityId) || ACCESS_LEVELS.PUBLIC,
      memberships: membershipRecords,
      roles: roleRecords,
      permissions: permissionRecords,
      groupIds,
      boundDeviceIds: deviceIds,
      privacyPreferences: cloneData(privacyPrefsByIdentity.get(identityId) || {}),
      consents: (consentsByIdentity.get(identityId) || []).map((c) => cloneData(c))
    };
    return deepFreeze(snapshot);
  }

  /**
   * Restores an identity (and everything that references it) from a
   * snapshot produced by `exportIdentity`. If an identity with the same
   * id already exists, it is rejected. Group and organization references
   * are only relinked if those groups/organizations already exist on the
   * receiving instance; missing ones are silently skipped (create them
   * first if a full relink is required).
   * @param {Object} snapshot - value produced by exportIdentity
   * @returns {Readonly<Object>} the restored identity snapshot
   */
  function importIdentity(snapshot) {
    assert(snapshot && typeof snapshot === 'object', ERROR_CODES.INVALID_ARGUMENT, 'snapshot object is required');
    assert(snapshot.identity && isNonEmptyString(snapshot.identity.id), ERROR_CODES.INVALID_ARGUMENT, 'snapshot.identity.id is required');
    assert(!identities.has(snapshot.identity.id), ERROR_CODES.ALREADY_EXISTS, `Identity "${snapshot.identity.id}" already exists`);

    const identityId = snapshot.identity.id;
    identities.set(identityId, cloneData(snapshot.identity));
    accessLevelByIdentity.set(identityId, snapshot.accessLevel || ACCESS_LEVELS.PUBLIC);

    for (const membership of snapshot.memberships || []) {
      const m = cloneData(membership);
      if (!organizations.has(m.organizationId)) continue;
      memberships.set(m.id, m);
      getMembershipsByIdentitySet(identityId).add(m.id);
      getMembershipsByOrgSet(m.organizationId).add(m.id);
    }

    const rolesMap = getRolesMap(identityId);
    for (const role of snapshot.roles || []) {
      rolesMap.set(roleKey(role.role, role.organizationId), cloneData(role));
    }

    const permSet = getPermissionsSet(identityId);
    for (const permission of snapshot.permissions || []) permSet.add(permission);

    for (const groupId of snapshot.groupIds || []) {
      if (!groups.has(groupId)) continue;
      getGroupMembersSet(groupId).add(identityId);
      getGroupsByIdentitySet(identityId).add(groupId);
    }

    for (const deviceId of snapshot.boundDeviceIds || []) {
      if (!devices.has(deviceId)) continue;
      devices.get(deviceId).boundIdentityId = identityId;
      getDevicesByIdentitySet(identityId).add(deviceId);
    }

    if (snapshot.privacyPreferences) privacyPrefsByIdentity.set(identityId, cloneData(snapshot.privacyPreferences));
    if (snapshot.consents) consentsByIdentity.set(identityId, snapshot.consents.map(cloneData));

    const restored = toPublicSnapshot(identities.get(identityId));
    emit(EVENT_TYPES.IDENTITY_CREATED, { identity: cloneData(identities.get(identityId)), imported: true });
    return restored;
  }

  /**
   * Coordinates syncing an identity snapshot to a registered core
   * integration (e.g. CozyStorage or CozyNetwork), by calling that
   * adapter's `pushIdentity(snapshot)` method if it exposes one. This
   * module never implements the sync/transport itself — it only builds
   * the snapshot (via `exportIdentity`) and hands it to the adapter.
   * Emits IDENTITY_SYNCED.
   * @param {string} identityId
   * @param {string} integrationName - one of KNOWN_INTEGRATIONS
   * @returns {Readonly<Object>} the snapshot that was handed to the adapter
   * @throws {CozyIdentityError} ADAPTER_NOT_REGISTERED if the integration isn't registered
   * @throws {CozyIdentityError} ADAPTER_CONTRACT_VIOLATION if it doesn't expose `pushIdentity`
   */
  function syncIdentity(identityId, integrationName) {
    const adapter = getAdapterOrThrow('Integration', integrations, integrationName);
    assert(
      typeof adapter.pushIdentity === 'function',
      ERROR_CODES.ADAPTER_CONTRACT_VIOLATION,
      `Integration "${integrationName}" adapter must expose pushIdentity(snapshot)`
    );
    const snapshot = exportIdentity(identityId);
    adapter.pushIdentity(cloneData(snapshot));
    emit(EVENT_TYPES.IDENTITY_SYNCED, { identityId, integrationName });
    return snapshot;
  }

  /* ============================================================= *
   * EVENT SYSTEM
   * ============================================================= */

  /**
   * Subscribes to an identity event. Returns an unsubscribe function.
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

  const customEventTypes = new Set();

  /**
   * Registers a brand-new event type name for a future feature so it can
   * be used with `on`/`emitCustomEvent` without modifying this module's
   * source.
   * @param {string} eventName
   * @returns {boolean} true if newly registered, false if it already existed
   */
  function registerEventType(eventName) {
    assert(isNonEmptyString(eventName), ERROR_CODES.INVALID_ARGUMENT, 'eventName must be a non-empty string');
    assert(!Object.values(EVENT_TYPES).includes(eventName), ERROR_CODES.ALREADY_EXISTS, `"${eventName}" collides with a built-in event type`);
    if (customEventTypes.has(eventName)) return false;
    customEventTypes.add(eventName);
    return true;
  }

  /**
   * Emits a previously registered custom event type.
   * @param {string} eventName - must have been registered via registerEventType
   * @param {Object} payload
   * @returns {Readonly<Object>} the emitted payload
   */
  function emitCustomEvent(eventName, payload) {
    assert(customEventTypes.has(eventName), ERROR_CODES.INVALID_ARGUMENT, `"${eventName}" was not registered via registerEventType`);
    return emit(eventName, payload);
  }

  /* ============================================================= *
   * DIAGNOSTICS / HEALTH
   * ============================================================= */

  /** @returns {Readonly<Object>} counters this module actually tracked — never fabricated */
  function getDiagnostics() {
    return deepFreeze(cloneData(diagnostics));
  }

  /**
   * Reports the health of this coordination instance. Reflects only
   * what this module itself can observe; it cannot and does not report
   * on the health of authentication hardware, biometric engines, or
   * network transport — those are each adapter's own responsibility to
   * expose (e.g. via a Service Registry health check in an application
   * module built on top of this kernel).
   * @returns {Readonly<Object>}
   */
  function getHealth() {
    return deepFreeze({
      status: 'ok',
      version: VERSION,
      identityCount: identities.size,
      organizationCount: organizations.size,
      registeredAuthAdapters: Array.from(authAdapters.keys()),
      registeredIntegrations: Array.from(integrations.keys()),
      registeredPlugins: Array.from(plugins.keys()),
      uptimeCheckedAt: Date.now()
    });
  }

  /* ============================================================= *
   * PUBLIC API SURFACE (frozen)
   * ============================================================= */

  const api = {
    // Metadata / version
    getVersion: () => VERSION,
    getMetadata: () => METADATA,

    // Identity lifecycle
    createIdentity,
    updateIdentity,
    setIdentityStatus,
    suspendIdentity,
    restoreIdentity,
    archiveIdentity,
    removeIdentity,
    mergeIdentities,
    getIdentity,
    listIdentities,

    // Organizations
    registerOrganization,
    getOrganization,
    listOrganizations,
    removeOrganization,

    // Membership lifecycle
    joinOrganization,
    leaveOrganization,
    suspendMembership,
    restoreMembership,
    archiveMembership,
    transferMembership,
    getMembership,
    listMemberships,
    listOrganizationMembers,

    // Roles
    assignRole,
    revokeRole,
    hasRole,
    listRoles,

    // Permissions
    grantPermission,
    revokePermission,
    checkPermission,
    listPermissions,

    // Access levels & policies
    setAccessLevel,
    getAccessLevel,
    createAccessPolicy,
    removeAccessPolicy,
    getAccessPolicy,
    listAccessPolicies,
    evaluateAccess,

    // Device trust
    registerDevice,
    setDeviceTrustStatus,
    bindDeviceToIdentity,
    unbindDevice,
    removeDevice,
    getDevice,
    listDevices,

    // Identity sessions
    createIdentitySession,
    revokeIdentitySession,
    validateIdentitySession,
    listIdentitySessions,

    // Authentication (delegated)
    registerAuthAdapter,
    unregisterAuthAdapter,
    hasAuthAdapter,
    listRegisteredAuthAdapters,
    authenticate,

    // Groups
    createGroup,
    removeGroup,
    listGroups,
    joinGroup,
    leaveGroup,
    listGroupMembers,
    listIdentityGroups,

    // Privacy
    setPrivacyPreferences,
    getPrivacyPreferences,
    recordConsent,
    listConsents,
    getPublicProfile,

    // Plugin registry (open)
    registerPlugin,
    unregisterPlugin,
    hasPlugin,
    listPlugins,

    // Integration registry (closed)
    registerIntegration,
    unregisterIntegration,
    hasIntegration,
    listRegisteredIntegrations,

    // Export / import / sync
    exportIdentity,
    importIdentity,
    syncIdentity,

    // Event system
    on,
    once,
    off,
    registerEventType,
    emitCustomEvent,

    // Diagnostics / health
    getDiagnostics,
    getHealth
  };

  return Object.freeze(api);
}

/* ----------------------------------------------------------------------- *
 * SECTION 5: MODULE EXPORTS
 * ----------------------------------------------------------------------- */

const CozyIdentityModule = Object.freeze({
  createCozyIdentity,
  VERSION,
  EVENT_TYPES,
  IDENTITY_TYPES,
  IDENTITY_STATUSES,
  ORGANIZATION_TYPES,
  MEMBERSHIP_STATUSES,
  AUTH_METHODS,
  IDENTITY_PROVIDERS,
  DEVICE_TYPES,
  DEVICE_TRUST_STATUSES,
  PERMISSIONS,
  ROLES,
  ACCESS_LEVELS,
  ACCESS_LEVEL_RANK,
  GROUP_TYPES,
  VISIBILITY_LEVELS,
  KNOWN_INTEGRATIONS,
  ERROR_CODES,
  METADATA,
  CozyIdentityError
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CozyIdentityModule;
} else if (typeof globalThis !== 'undefined') {
  globalThis.CozyIdentity = CozyIdentityModule;
}
