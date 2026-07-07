/**
 * ── CozyOS ENTERPRISE VISION COORDINATION KERNEL ──
 * FILE: core/modules/vision/cozy-vision.js
 * VERSION: 1.0.0-ENTERPRISE
 *
 * Mission: Coordinate every vision request, session, image analysis,
 * video analysis, OCR, barcode, QR, object detection, face recognition,
 * document analysis, adapter, device, pipeline, workflow, registry,
 * timeline, diagnostics, and synchronization process across CozyOS.
 *
 * CozyVision IS:
 *   Coordinator · Registry · Lifecycle Manager · Session Manager ·
 *   Pipeline Coordinator · Adapter Coordinator · Device Coordinator ·
 *   Timeline Manager · Event Coordinator · Diagnostics Provider ·
 *   Bookkeeper · Offline-first Kernel
 *
 * CozyVision is NOT:
 *   OCR engine · Barcode reader · QR scanner · Face recognition ·
 *   Object detector · Image classifier · Video classifier · AI model ·
 *   TensorFlow · ONNX · OpenCV · YOLO · Neural network · ML engine ·
 *   Computer Vision algorithm · Image enhancer · Media processor
 *   ── Everything computational belongs ONLY to registered adapters ──
 *
 * Offline operation: MANDATORY
 * Internet support:  OPTIONAL
 */

"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// § 0. MODULE CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const VISION_VERSION = "1.0.0-ENTERPRISE";

const SESSION_STATE = Object.freeze({
    CREATED:  "CREATED",
    ACTIVE:   "ACTIVE",
    PAUSED:   "PAUSED",
    STOPPED:  "STOPPED",
    ENDED:    "ENDED",
    ARCHIVED: "ARCHIVED",
});

const SYNC_STATE = Object.freeze({
    LOCAL_ONLY: "local_only",
    PENDING:    "pending",
    SYNCED:     "synced",
    CONFLICT:   "conflict",
});

// ─────────────────────────────────────────────────────────────────────────────
// § 1. PRIVATE UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a collision-free prefixed identifier.
 * Delegates to crypto.randomUUID when available.
 * @param {string} prefix
 * @returns {string}
 */
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

/**
 * Validate that a value is a non-empty string.
 * @param {unknown} value
 * @param {string}  fieldName
 */
function _requireString(value, fieldName) {
    if (typeof value !== "string" || !value.trim()) {
        throw new TypeError(
            `[CozyVision] ${fieldName} must be a non-empty string. ` +
            `Received: ${typeof value}`
        );
    }
}

/**
 * Validate that a registry entry exists.
 * @param {Map}    store
 * @param {string} id
 * @param {string} label
 * @returns {object}
 */
function _requireEntry(store, id, label) {
    const entry = store.get(id);
    if (!entry) {
        throw new Error(`[CozyVision] ${label} "${id}" not found.`);
    }
    return entry;
}

/**
 * Recursively deep-freeze an object.
 * Already-frozen objects are returned immediately.
 * @param {unknown} obj
 * @returns {unknown}
 */
function _deepFreeze(obj) {
    if (obj === null || typeof obj !== "object" || Object.isFrozen(obj)) {
        return obj;
    }
    for (const key of Object.keys(obj)) {
        _deepFreeze(obj[key]);
    }
    return Object.freeze(obj);
}

/**
 * Produce a deep-frozen defensive clone of a value.
 * Drops non-serialisable values (functions, undefined) via JSON round-trip.
 * @param {unknown} value
 * @returns {Readonly<unknown>}
 */
function _clone(value) {
    if (value === null || value === undefined) return value;
    try {
        return _deepFreeze(JSON.parse(JSON.stringify(value)));
    } catch (_) {
        return _deepFreeze(Object.assign(Object.create(null), value));
    }
}

/**
 * Security choke-point — shared by every registry write.
 * Rejects objects that contain prohibited sensitive fields anywhere
 * in the object graph (including nested objects).
 *
 * Prohibited keys: password · passwd · token · jwt · refreshToken ·
 *   accessToken · apiKey · secret · privateKey · certificate ·
 *   biometric · fingerprint · faceTemplate · irisTemplate ·
 *   retinaTemplate · voicePrint
 *
 * @param {unknown} obj
 * @param {string}  context
 */
const _PROHIBITED_KEYS = new Set([
    "password", "passwd", "token", "jwt", "refreshToken", "accessToken",
    "apiKey", "secret", "privateKey", "certificate", "biometric",
    "fingerprint", "faceTemplate", "irisTemplate", "retinaTemplate", "voicePrint",
]);

function _securityCheck(obj, context = "input") {
    if (obj === null || typeof obj !== "object") return;
    for (const key of Object.keys(obj)) {
        if (_PROHIBITED_KEYS.has(key)) {
            throw new Error(
                `[CozyVision] Security violation: prohibited key "${key}" ` +
                `rejected in ${context}.`
            );
        }
        _securityCheck(obj[key], `${context}.${key}`);
    }
}

/**
 * Attach offline-first synchronisation metadata to any entity config.
 * @param {object} [config]
 * @returns {object}
 */
function _syncMeta(config = {}) {
    return {
        localId:        config.localId        ?? _uid("local"),
        globalId:       config.globalId       ?? null,
        syncState:      config.syncState      ?? SYNC_STATE.LOCAL_ONLY,
        createdOffline: config.createdOffline ?? true,
        lastModified:   _now(),
        version:        config.version        ?? 1,
        conflictState:  config.conflictState  ?? null,
    };
}

/** Clock offset in ms — set by synchronizeClock(). */
let _clockOffsetMs = 0;

/** Return the current synchronized ISO timestamp. */
function _now() {
    return new Date(Date.now() + _clockOffsetMs).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// § 2. EVENT BUS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enterprise event bus.
 * Supports: on · off · once · emit
 * Fault-isolated: one failing listener never stops others.
 */
const _bus = (() => {
    const _listeners = new Map(); // event → Set<{ fn, once }>

    return Object.freeze({

        /** @param {string} event @param {Function} fn */
        on(event, fn) {
            _requireString(event, "event");
            if (typeof fn !== "function") {
                throw new TypeError("[CozyVision] Event listener must be a function.");
            }
            if (!_listeners.has(event)) _listeners.set(event, new Set());
            _listeners.get(event).add({ fn, once: false });
        },

        /** @param {string} event @param {Function} fn */
        off(event, fn) {
            const set = _listeners.get(event);
            if (!set) return;
            for (const entry of set) {
                if (entry.fn === fn) { set.delete(entry); break; }
            }
        },

        /** @param {string} event @param {Function} fn */
        once(event, fn) {
            _requireString(event, "event");
            if (typeof fn !== "function") {
                throw new TypeError("[CozyVision] Event listener must be a function.");
            }
            if (!_listeners.has(event)) _listeners.set(event, new Set());
            _listeners.get(event).add({ fn, once: true });
        },

        /**
         * Emit an event. Every listener is called in isolation —
         * a thrown exception in one listener never prevents others from running.
         * @param {string} event
         * @param {unknown} [data]
         */
        emit(event, data) {
            const set = _listeners.get(event);
            if (!set || set.size === 0) return;
            const toRemove = [];
            for (const entry of set) {
                try {
                    entry.fn(_clone(data));
                } catch (err) {
                    console.warn(
                        `[CozyVision] Event listener error on "${event}":`, err
                    );
                }
                if (entry.once) toRemove.push(entry);
            }
            for (const entry of toRemove) set.delete(entry);
        },
    });
})();

// ─────────────────────────────────────────────────────────────────────────────
// § 3. KERNEL REGISTRIES
// ─────────────────────────────────────────────────────────────────────────────

const _sessions        = new Map(); // sessionId      → SessionRecord
const _requests        = new Map(); // requestId      → RequestRecord
const _tasks           = new Map(); // taskId         → TaskRecord
const _images          = new Map(); // imageId        → ImageMetaRecord
const _videos          = new Map(); // videoId        → VideoMetaRecord
const _documents       = new Map(); // documentId     → DocumentMetaRecord
const _cameraSources   = new Map(); // cameraId       → CameraSourceRecord
const _devices         = new Map(); // deviceId       → DeviceRecord
const _deviceHealth    = new Map(); // deviceId       → DeviceHealthRecord
const _pipelines       = new Map(); // pipelineId     → PipelineRecord
const _detections      = new Map(); // detectionId    → DetectionMetaRecord
const _ocrRequests     = new Map(); // ocrId          → OcrRequestRecord
const _barcodeRequests = new Map(); // barcodeId      → BarcodeRequestRecord
const _qrRequests      = new Map(); // qrId           → QrRequestRecord
const _faceRequests    = new Map(); // faceId         → FaceRequestRecord
const _objectRequests  = new Map(); // objectId       → ObjectRequestRecord
const _classRequests   = new Map(); // classId        → ClassificationRequestRecord
const _annotations     = new Map(); // annotationId   → AnnotationRecord
const _results         = new Map(); // resultId       → ResultRecord
const _confidence      = new Map(); // confidenceId   → ConfidenceRecord
const _models          = new Map(); // modelId        → VisionModelRecord
const _adapters        = new Map(); // adapterId      → AdapterRecord
const _plugins         = new Map(); // pluginId       → PluginRecord
const _integrations    = new Map(); // integrationId  → IntegrationRecord
const _timeline        = [];        // TimelineEvent[] — append-only
const _graphNodes      = new Map(); // nodeId         → GraphNodeRecord
const _graphEdges      = new Map(); // edgeId         → GraphEdgeRecord
const _permissions     = new Map(); // permissionId   → PermissionRecord
const _audit           = [];        // AuditRecord[]  — append-only
const _exports         = new Map(); // exportId       → ExportRecord
const _imports         = new Map(); // importId       → ImportRecord

// ─────────────────────────────────────────────────────────────────────────────
// § 4. INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Append an audit record. Append-only, never mutated. */
function _audit_log(action, entityType, entityId, meta = {}) {
    _audit.push(Object.freeze({
        auditId:    _uid("audit"),
        action,
        entityType,
        entityId,
        meta:       _clone(meta),
        timestamp:  _now(),
    }));
}

/** Append a timeline event. Append-only, never mutated. */
function _timeline_push(eventType, payload = {}) {
    _timeline.push(Object.freeze({
        timelineId: _uid("tl"),
        eventType,
        payload:    _clone(payload),
        timestamp:  _now(),
    }));
    _bus.emit(`vision.${eventType}`, payload);
}

/** Validate session exists and is in allowed states. */
function _requireSession(sessionId, allowedStates) {
    _requireString(sessionId, "sessionId");
    const s = _sessions.get(sessionId);
    if (!s) throw new Error(`[CozyVision] Session "${sessionId}" not found.`);
    if (allowedStates && !allowedStates.includes(s.state)) {
        throw new Error(
            `[CozyVision] Session "${sessionId}" is "${s.state}". ` +
            `Required: ${allowedStates.join(" | ")}.`
        );
    }
    return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5. KERNEL IMPLEMENTATION
// ─────────────────────────────────────────────────────────────────────────────

const _kernel = {

    // ── § 5.1  VISION SESSION LIFECYCLE ──────────────────────────────────────

    /**
     * Create a new vision session.
     * @param {{
     *   sessionId?:   string,
     *   label?:       string,
     *   environment?: string,
     *   zoneId?:      string,
     *   localId?:     string,
     *   globalId?:    string,
     * }} [config]
     * @returns {string} sessionId
     */
    createVisionSession(config = {}) {
        _securityCheck(config, "createVisionSession");
        const sessionId = config.sessionId || _uid("vsession");
        if (_sessions.has(sessionId)) {
            throw new Error(`[CozyVision] Session "${sessionId}" already exists.`);
        }
        const record = _deepFreeze({
            sessionId,
            label:       config.label       ?? "",
            environment: config.environment ?? "general",
            zoneId:      config.zoneId      ?? null,
            state:       SESSION_STATE.CREATED,
            createdAt:   _now(),
            startedAt:   null,
            pausedAt:    null,
            stoppedAt:   null,
            endedAt:     null,
            archivedAt:  null,
            ..._syncMeta(config),
        });
        _sessions.set(sessionId, record);
        _audit_log("SESSION_CREATED", "session", sessionId);
        _timeline_push("session.created", { sessionId });
        return sessionId;
    },

    /** @param {string} sessionId @returns {string} */
    startVisionSession(sessionId) {
        const s = _requireSession(sessionId,
            [SESSION_STATE.CREATED, SESSION_STATE.STOPPED]);
        _sessions.set(sessionId, _deepFreeze({
            ...s, state: SESSION_STATE.ACTIVE, startedAt: _now(), lastModified: _now(),
        }));
        _audit_log("SESSION_STARTED", "session", sessionId);
        _timeline_push("session.started", { sessionId });
        return sessionId;
    },

    /** @param {string} sessionId @returns {string} */
    pauseVisionSession(sessionId) {
        const s = _requireSession(sessionId, [SESSION_STATE.ACTIVE]);
        _sessions.set(sessionId, _deepFreeze({
            ...s, state: SESSION_STATE.PAUSED, pausedAt: _now(), lastModified: _now(),
        }));
        _audit_log("SESSION_PAUSED", "session", sessionId);
        _timeline_push("session.paused", { sessionId });
        return sessionId;
    },

    /** @param {string} sessionId @returns {string} */
    resumeVisionSession(sessionId) {
        const s = _requireSession(sessionId, [SESSION_STATE.PAUSED]);
        _sessions.set(sessionId, _deepFreeze({
            ...s, state: SESSION_STATE.ACTIVE, lastModified: _now(),
        }));
        _audit_log("SESSION_RESUMED", "session", sessionId);
        _timeline_push("session.resumed", { sessionId });
        return sessionId;
    },

    /** @param {string} sessionId @returns {string} */
    stopVisionSession(sessionId) {
        const s = _requireSession(sessionId,
            [SESSION_STATE.ACTIVE, SESSION_STATE.PAUSED]);
        _sessions.set(sessionId, _deepFreeze({
            ...s, state: SESSION_STATE.STOPPED, stoppedAt: _now(), lastModified: _now(),
        }));
        _audit_log("SESSION_STOPPED", "session", sessionId);
        _timeline_push("session.stopped", { sessionId });
        return sessionId;
    },

    /** @param {string} sessionId @returns {string} */
    endVisionSession(sessionId) {
        const s = _requireSession(sessionId,
            [SESSION_STATE.STOPPED, SESSION_STATE.PAUSED, SESSION_STATE.ACTIVE]);
        _sessions.set(sessionId, _deepFreeze({
            ...s, state: SESSION_STATE.ENDED, endedAt: _now(), lastModified: _now(),
        }));
        _audit_log("SESSION_ENDED", "session", sessionId);
        _timeline_push("session.ended", { sessionId });
        return sessionId;
    },

    /** @param {string} sessionId @returns {string} */
    archiveVisionSession(sessionId) {
        const s = _requireSession(sessionId, [SESSION_STATE.ENDED]);
        _sessions.set(sessionId, _deepFreeze({
            ...s, state: SESSION_STATE.ARCHIVED, archivedAt: _now(), lastModified: _now(),
        }));
        _audit_log("SESSION_ARCHIVED", "session", sessionId);
        _timeline_push("session.archived", { sessionId });
        return sessionId;
    },

    /**
     * Export a session and all associated entities as a frozen data package.
     * @param {string} sessionId
     * @returns {Readonly<object>}
     */
    exportVisionSession(sessionId) {
        const s = _requireSession(sessionId);
        const pkg = _clone({
            session:    { ...s },
            requests:   Array.from(_requests.values()).filter(r => r.sessionId === sessionId),
            tasks:      Array.from(_tasks.values()).filter(t => t.sessionId === sessionId),
            results:    Array.from(_results.values()).filter(r => r.sessionId === sessionId),
            segments:   Array.from(_detections.values()).filter(d => d.sessionId === sessionId),
            timeline:   _timeline.filter(e => e.payload?.sessionId === sessionId),
        });
        const exportId = _uid("export");
        _exports.set(exportId, _deepFreeze({ exportId, sessionId, exportedAt: _now(), pkg }));
        _audit_log("SESSION_EXPORTED", "session", sessionId, { exportId });
        return _clone(pkg);
    },

    /**
     * Import a previously exported session package.
     * Merge-only — never overwrites existing records, never duplicates.
     * @param {{ session: object, requests?: object[], tasks?: object[], results?: object[] }} data
     * @returns {string} sessionId
     */
    importVisionSession(data) {
        _securityCheck(data, "importVisionSession");
        if (!data?.session?.sessionId) {
            throw new TypeError(
                "[CozyVision] importVisionSession: data.session.sessionId is required."
            );
        }
        const { sessionId } = data.session;
        if (!_sessions.has(sessionId)) {
            _sessions.set(sessionId, _deepFreeze({ ...data.session }));
        }
        const merge = (store, arr) => {
            if (!Array.isArray(arr)) return;
            for (const item of arr) {
                const key = Object.values(item).find(v =>
                    typeof v === "string" && v.includes("_")
                );
                if (key && !store.has(key)) store.set(key, _deepFreeze({ ...item }));
            }
        };
        merge(_requests, data.requests);
        merge(_tasks,    data.tasks);
        merge(_results,  data.results);

        const importId = _uid("import");
        _imports.set(importId, _deepFreeze({ importId, sessionId, importedAt: _now() }));
        _audit_log("SESSION_IMPORTED", "session", sessionId, { importId });
        return sessionId;
    },

    /** @returns {Readonly<object>} Session diagnostics snapshot */
    getSessionDiagnostics() {
        const byState = {};
        for (const s of _sessions.values()) {
            byState[s.state] = (byState[s.state] ?? 0) + 1;
        }
        return _clone({ total: _sessions.size, byState });
    },

    // ── § 5.2  VISION REQUEST REGISTRY ───────────────────────────────────────

    /**
     * Register a vision request. Coordinator only — never processes.
     * @param {{
     *   requestId?:  string,
     *   sessionId:   string,
     *   type:        string,   — "ocr"|"barcode"|"qr"|"object_detection"|…
     *   label?:      string,
     *   imageId?:    string,
     *   videoId?:    string,
     *   priority?:   number,
     *   adapterId?:  string,
     * }} config
     * @returns {string} requestId
     */
    registerVisionRequest(config) {
        _securityCheck(config, "registerVisionRequest");
        _requireString(config?.sessionId, "sessionId");
        _requireString(config?.type,      "type");
        const requestId = config.requestId || _uid("vreq");
        const record = _deepFreeze({
            requestId,
            sessionId:  config.sessionId,
            type:       config.type,
            label:      config.label     ?? "",
            imageId:    config.imageId   ?? null,
            videoId:    config.videoId   ?? null,
            priority:   config.priority  ?? 5,
            adapterId:  config.adapterId ?? null,
            status:     "pending",
            createdAt:  _now(),
            ..._syncMeta(config),
        });
        _requests.set(requestId, record);
        _audit_log("REQUEST_REGISTERED", "request", requestId, { type: config.type });
        _timeline_push("request.registered", { requestId, type: config.type });
        return requestId;
    },

    /** @param {string} requestId @returns {boolean} */
    removeVisionRequest(requestId) {
        _requireString(requestId, "requestId");
        const removed = _requests.delete(requestId);
        if (removed) _audit_log("REQUEST_REMOVED", "request", requestId);
        return removed;
    },

    /** @param {{ sessionId?: string, type?: string, status?: string }} [filter] */
    listVisionRequests(filter = {}) {
        let r = Array.from(_requests.values());
        if (filter.sessionId) r = r.filter(x => x.sessionId === filter.sessionId);
        if (filter.type)      r = r.filter(x => x.type      === filter.type);
        if (filter.status)    r = r.filter(x => x.status    === filter.status);
        return _clone(r);
    },

    // ── § 5.3  VISION TASK REGISTRY ───────────────────────────────────────────

    /**
     * Register a task assigned to an adapter.
     * @param {{
     *   taskId?:    string,
     *   requestId:  string,
     *   sessionId:  string,
     *   adapterId:  string,
     *   type:       string,
     *   status?:    string,
     * }} config
     * @returns {string} taskId
     */
    registerVisionTask(config) {
        _securityCheck(config, "registerVisionTask");
        _requireString(config?.requestId, "requestId");
        _requireString(config?.sessionId, "sessionId");
        _requireString(config?.adapterId, "adapterId");
        _requireString(config?.type,      "type");
        const taskId = config.taskId || _uid("vtask");
        _tasks.set(taskId, _deepFreeze({
            taskId,
            requestId:  config.requestId,
            sessionId:  config.sessionId,
            adapterId:  config.adapterId,
            type:       config.type,
            status:     config.status ?? "queued",
            assignedAt: _now(),
            ..._syncMeta(config),
        }));
        _audit_log("TASK_REGISTERED", "task", taskId);
        _timeline_push("task.registered", { taskId, adapterId: config.adapterId });
        return taskId;
    },

    /** @param {string} taskId @returns {boolean} */
    removeVisionTask(taskId) {
        _requireString(taskId, "taskId");
        const removed = _tasks.delete(taskId);
        if (removed) _audit_log("TASK_REMOVED", "task", taskId);
        return removed;
    },

    /** @param {{ sessionId?: string, adapterId?: string, status?: string }} [filter] */
    listVisionTasks(filter = {}) {
        let r = Array.from(_tasks.values());
        if (filter.sessionId) r = r.filter(x => x.sessionId === filter.sessionId);
        if (filter.adapterId) r = r.filter(x => x.adapterId === filter.adapterId);
        if (filter.status)    r = r.filter(x => x.status    === filter.status);
        return _clone(r);
    },

    // ── § 5.4  IMAGE REGISTRY  (metadata only) ────────────────────────────────

    /**
     * @param {{
     *   imageId?:   string,
     *   sessionId?: string,
     *   label?:     string,
     *   mimeType?:  string,
     *   width?:     number,
     *   height?:    number,
     *   sizeBytes?: number,
     *   sourceId?:  string,
     * }} config
     * @returns {string} imageId
     */
    registerImage(config) {
        _securityCheck(config, "registerImage");
        const imageId = config.imageId || _uid("vimg");
        _images.set(imageId, _deepFreeze({
            imageId,
            sessionId:  config.sessionId ?? null,
            label:      config.label     ?? "",
            mimeType:   config.mimeType  ?? "image/jpeg",
            width:      config.width     ?? null,
            height:     config.height    ?? null,
            sizeBytes:  config.sizeBytes ?? null,
            sourceId:   config.sourceId  ?? null,
            registeredAt: _now(),
            ..._syncMeta(config),
        }));
        _audit_log("IMAGE_REGISTERED", "image", imageId);
        return imageId;
    },

    /** @param {string} imageId @returns {boolean} */
    removeImage(imageId) {
        _requireString(imageId, "imageId");
        return _images.delete(imageId);
    },

    /** @param {{ sessionId?: string }} [filter] */
    listImages(filter = {}) {
        let r = Array.from(_images.values());
        if (filter.sessionId) r = r.filter(x => x.sessionId === filter.sessionId);
        return _clone(r);
    },

    // ── § 5.5  VIDEO REGISTRY  (metadata only) ────────────────────────────────

    /**
     * @param {{
     *   videoId?:      string,
     *   sessionId?:    string,
     *   label?:        string,
     *   mimeType?:     string,
     *   durationMs?:   number,
     *   fps?:          number,
     *   width?:        number,
     *   height?:       number,
     *   sizeBytes?:    number,
     * }} config
     * @returns {string} videoId
     */
    registerVideo(config) {
        _securityCheck(config, "registerVideo");
        const videoId = config.videoId || _uid("vvid");
        _videos.set(videoId, _deepFreeze({
            videoId,
            sessionId:   config.sessionId  ?? null,
            label:       config.label      ?? "",
            mimeType:    config.mimeType   ?? "video/mp4",
            durationMs:  config.durationMs ?? null,
            fps:         config.fps        ?? null,
            width:       config.width      ?? null,
            height:      config.height     ?? null,
            sizeBytes:   config.sizeBytes  ?? null,
            registeredAt: _now(),
            ..._syncMeta(config),
        }));
        _audit_log("VIDEO_REGISTERED", "video", videoId);
        return videoId;
    },

    /** @param {string} videoId @returns {boolean} */
    removeVideo(videoId) {
        _requireString(videoId, "videoId");
        return _videos.delete(videoId);
    },

    /** @param {{ sessionId?: string }} [filter] */
    listVideos(filter = {}) {
        let r = Array.from(_videos.values());
        if (filter.sessionId) r = r.filter(x => x.sessionId === filter.sessionId);
        return _clone(r);
    },

    // ── § 5.6  DOCUMENT REGISTRY  (metadata only) ─────────────────────────────

    /**
     * @param {{
     *   documentId?: string,
     *   sessionId?:  string,
     *   label?:      string,
     *   type?:       string,
     *   pageCount?:  number,
     *   language?:   string,
     * }} config
     * @returns {string} documentId
     */
    registerDocument(config) {
        _securityCheck(config, "registerDocument");
        const documentId = config.documentId || _uid("vdoc");
        _documents.set(documentId, _deepFreeze({
            documentId,
            sessionId:   config.sessionId  ?? null,
            label:       config.label      ?? "",
            type:        config.type       ?? "general",
            pageCount:   config.pageCount  ?? null,
            language:    config.language   ?? null,
            registeredAt: _now(),
            ..._syncMeta(config),
        }));
        _audit_log("DOCUMENT_REGISTERED", "document", documentId);
        return documentId;
    },

    /** @param {string} documentId @returns {boolean} */
    removeDocument(documentId) {
        _requireString(documentId, "documentId");
        return _documents.delete(documentId);
    },

    /** @param {{ sessionId?: string, type?: string }} [filter] */
    listDocuments(filter = {}) {
        let r = Array.from(_documents.values());
        if (filter.sessionId) r = r.filter(x => x.sessionId === filter.sessionId);
        if (filter.type)      r = r.filter(x => x.type      === filter.type);
        return _clone(r);
    },

    // ── § 5.7  CAMERA SOURCE REGISTRY ────────────────────────────────────────

    /**
     * Coordinates CozyCamera sources. Never accesses hardware.
     * @param {{
     *   cameraId?:  string,
     *   label:      string,
     *   type?:      string,
     *   deviceId?:  string,
     *   zoneId?:    string,
     *   adapterId?: string,
     * }} config
     * @returns {string} cameraId
     */
    registerCameraSource(config) {
        _securityCheck(config, "registerCameraSource");
        _requireString(config?.label, "label");
        const cameraId = config.cameraId || _uid("vcam");
        _cameraSources.set(cameraId, _deepFreeze({
            cameraId,
            label:       config.label,
            type:        config.type      ?? "usb",
            deviceId:    config.deviceId  ?? null,
            zoneId:      config.zoneId    ?? null,
            adapterId:   config.adapterId ?? null,
            registeredAt: _now(),
            ..._syncMeta(config),
        }));
        _audit_log("CAMERA_REGISTERED", "camera", cameraId);
        return cameraId;
    },

    /** @param {string} cameraId @returns {boolean} */
    removeCameraSource(cameraId) {
        _requireString(cameraId, "cameraId");
        return _cameraSources.delete(cameraId);
    },

    /** @returns {Readonly<object[]>} */
    listCameraSources() {
        return _clone(Array.from(_cameraSources.values()));
    },

    // ── § 5.8  DEVICE REGISTRY ────────────────────────────────────────────────

    /**
     * @param {{
     *   deviceId?:    string,
     *   label:        string,
     *   type?:        string,
     *   capabilities?: string[],
     *   zoneId?:      string,
     * }} config
     * @returns {string} deviceId
     */
    registerDevice(config) {
        _securityCheck(config, "registerDevice");
        _requireString(config?.label, "label");
        const deviceId = config.deviceId || _uid("vdev");
        _devices.set(deviceId, _deepFreeze({
            deviceId,
            label:        config.label,
            type:         config.type          ?? "generic",
            capabilities: Object.freeze(config.capabilities ?? []),
            zoneId:       config.zoneId        ?? null,
            registeredAt: _now(),
            ..._syncMeta(config),
        }));
        _audit_log("DEVICE_REGISTERED", "device", deviceId);
        return deviceId;
    },

    /** @param {string} deviceId @returns {boolean} */
    removeDevice(deviceId) {
        _requireString(deviceId, "deviceId");
        _deviceHealth.delete(deviceId);
        const removed = _devices.delete(deviceId);
        if (removed) _audit_log("DEVICE_REMOVED", "device", deviceId);
        return removed;
    },

    /** @returns {Readonly<object[]>} */
    listDevices() {
        return _clone(Array.from(_devices.values()));
    },

    // ── § 5.9  DEVICE HEALTH REGISTRY ────────────────────────────────────────

    /**
     * Store-only. The kernel never reads hardware directly.
     * @param {{
     *   deviceId:       string,
     *   online?:        boolean,
     *   temperatureC?:  number,
     *   batteryPercent?: number,
     *   latencyMs?:     number,
     *   memoryUsedPct?: number,
     *   cpuUsedPct?:    number,
     *   gpuUsedPct?:    number,
     *   accelerator?:   string,
     *   errors?:        string[],
     *   warnings?:      string[],
     * }} config
     * @returns {string} deviceId
     */
    updateDeviceHealth(config) {
        _securityCheck(config, "updateDeviceHealth");
        _requireString(config?.deviceId, "deviceId");
        _deviceHealth.set(config.deviceId, _deepFreeze({
            deviceId:        config.deviceId,
            online:          config.online          ?? null,
            temperatureC:    config.temperatureC    ?? null,
            batteryPercent:  config.batteryPercent  ?? null,
            latencyMs:       config.latencyMs       ?? null,
            memoryUsedPct:   config.memoryUsedPct   ?? null,
            cpuUsedPct:      config.cpuUsedPct      ?? null,
            gpuUsedPct:      config.gpuUsedPct      ?? null,
            accelerator:     config.accelerator     ?? null,
            errors:          Object.freeze(config.errors   ?? []),
            warnings:        Object.freeze(config.warnings ?? []),
            reportedAt:      _now(),
        }));
        return config.deviceId;
    },

    /** @param {string} deviceId @returns {Readonly<object>|null} */
    getDeviceHealth(deviceId) {
        _requireString(deviceId, "deviceId");
        const h = _deviceHealth.get(deviceId);
        return h ? _clone(h) : null;
    },

    /** @returns {Readonly<object[]>} */
    listDeviceHealth() {
        return _clone(Array.from(_deviceHealth.values()));
    },

    // ── § 5.10  VISION PIPELINE REGISTRY ─────────────────────────────────────

    /**
     * Coordinator only — never executes pipelines.
     * @param {{
     *   pipelineId?: string,
     *   sessionId:   string,
     *   label:       string,
     *   steps:       Array<{ role: string, adapterId: string }>,
     * }} config
     * @returns {string} pipelineId
     */
    registerVisionPipeline(config) {
        _securityCheck(config, "registerVisionPipeline");
        _requireString(config?.sessionId, "sessionId");
        _requireString(config?.label,     "label");
        if (!Array.isArray(config?.steps)) {
            throw new TypeError("[CozyVision] registerVisionPipeline: steps must be an array.");
        }
        const pipelineId = config.pipelineId || _uid("vpipe");
        _pipelines.set(pipelineId, _deepFreeze({
            pipelineId,
            sessionId:   config.sessionId,
            label:       config.label,
            steps:       Object.freeze(config.steps.map(s => Object.freeze({ ...s }))),
            registeredAt: _now(),
            ..._syncMeta(config),
        }));
        _audit_log("PIPELINE_REGISTERED", "pipeline", pipelineId);
        _timeline_push("pipeline.registered", { pipelineId });
        return pipelineId;
    },

    /** @param {string} pipelineId @returns {boolean} */
    removeVisionPipeline(pipelineId) {
        _requireString(pipelineId, "pipelineId");
        return _pipelines.delete(pipelineId);
    },

    /** @param {{ sessionId?: string }} [filter] */
    listVisionPipelines(filter = {}) {
        let r = Array.from(_pipelines.values());
        if (filter.sessionId) r = r.filter(x => x.sessionId === filter.sessionId);
        return _clone(r);
    },

    // ── § 5.11  DETECTION REGISTRY ────────────────────────────────────────────

    /**
     * Stores detection metadata only. Never performs detection.
     * @param {{
     *   detectionId?: string,
     *   requestId:    string,
     *   sessionId:    string,
     *   type:         string,
     *   label?:       string,
     *   count?:       number,
     * }} config
     * @returns {string} detectionId
     */
    registerDetection(config) {
        _securityCheck(config, "registerDetection");
        _requireString(config?.requestId, "requestId");
        _requireString(config?.sessionId, "sessionId");
        _requireString(config?.type,      "type");
        const detectionId = config.detectionId || _uid("vdet");
        _detections.set(detectionId, _deepFreeze({
            detectionId,
            requestId:   config.requestId,
            sessionId:   config.sessionId,
            type:        config.type,
            label:       config.label ?? "",
            count:       config.count ?? 0,
            detectedAt:  _now(),
            ..._syncMeta(config),
        }));
        _audit_log("DETECTION_REGISTERED", "detection", detectionId);
        return detectionId;
    },

    /** @param {{ sessionId?: string, type?: string }} [filter] */
    listDetections(filter = {}) {
        let r = Array.from(_detections.values());
        if (filter.sessionId) r = r.filter(x => x.sessionId === filter.sessionId);
        if (filter.type)      r = r.filter(x => x.type      === filter.type);
        return _clone(r);
    },

    // ── § 5.12  OCR REQUEST REGISTRY ─────────────────────────────────────────

    /**
     * Stores OCR request metadata. Never extracts text.
     * @param {{ ocrId?: string, requestId: string, sessionId: string,
     *   imageId?: string, documentId?: string, languageHint?: string,
     *   adapterId?: string }} config
     * @returns {string} ocrId
     */
    registerOcrRequest(config) {
        _securityCheck(config, "registerOcrRequest");
        _requireString(config?.requestId, "requestId");
        _requireString(config?.sessionId, "sessionId");
        const ocrId = config.ocrId || _uid("vocr");
        _ocrRequests.set(ocrId, _deepFreeze({
            ocrId,
            requestId:    config.requestId,
            sessionId:    config.sessionId,
            imageId:      config.imageId     ?? null,
            documentId:   config.documentId  ?? null,
            languageHint: config.languageHint ?? null,
            adapterId:    config.adapterId   ?? null,
            createdAt:    _now(),
            ..._syncMeta(config),
        }));
        _audit_log("OCR_REGISTERED", "ocr", ocrId);
        return ocrId;
    },

    /** @param {{ sessionId?: string }} [filter] */
    listOcrRequests(filter = {}) {
        let r = Array.from(_ocrRequests.values());
        if (filter.sessionId) r = r.filter(x => x.sessionId === filter.sessionId);
        return _clone(r);
    },

    // ── § 5.13  BARCODE REQUEST REGISTRY ─────────────────────────────────────

    /**
     * Stores barcode request metadata. Never decodes.
     * @param {{ barcodeId?: string, requestId: string, sessionId: string,
     *   imageId?: string, format?: string, adapterId?: string }} config
     * @returns {string} barcodeId
     */
    registerBarcodeRequest(config) {
        _securityCheck(config, "registerBarcodeRequest");
        _requireString(config?.requestId, "requestId");
        _requireString(config?.sessionId, "sessionId");
        const barcodeId = config.barcodeId || _uid("vbar");
        _barcodeRequests.set(barcodeId, _deepFreeze({
            barcodeId,
            requestId:  config.requestId,
            sessionId:  config.sessionId,
            imageId:    config.imageId   ?? null,
            format:     config.format    ?? "auto",
            adapterId:  config.adapterId ?? null,
            createdAt:  _now(),
            ..._syncMeta(config),
        }));
        _audit_log("BARCODE_REGISTERED", "barcode", barcodeId);
        return barcodeId;
    },

    /** @param {{ sessionId?: string }} [filter] */
    listBarcodeRequests(filter = {}) {
        let r = Array.from(_barcodeRequests.values());
        if (filter.sessionId) r = r.filter(x => x.sessionId === filter.sessionId);
        return _clone(r);
    },

  // ── § 5.14  QR REQUEST REGISTRY ──────────────────────────────────────────

    /**
     * Stores QR request metadata. Never decodes.
     * @param {{ qrId?: string, requestId: string, sessionId: string,
     *   imageId?: string, adapterId?: string }} config
     * @returns {string} qrId
     */
    registerQrRequest(config) {
        _securityCheck(config, "registerQrRequest");
        _requireString(config?.requestId, "requestId");
        _requireString(config?.sessionId, "sessionId");
        const qrId = config.qrId || _uid("vqr");
        _qrRequests.set(qrId, _deepFreeze({
            qrId,
            requestId:  config.requestId,
            sessionId:  config.sessionId,
            imageId:    config.imageId   ?? null,
            adapterId:  config.adapterId ?? null,
            createdAt:  _now(),
            ..._syncMeta(config),
        }));
        _audit_log("QR_REGISTERED", "qr", qrId);
        return qrId;
    },

    /** @param {{ sessionId?: string }} [filter] */
    listQrRequests(filter = {}) {
        let r = Array.from(_qrRequests.values());
        if (filter.sessionId) r = r.filter(x => x.sessionId === filter.sessionId);
        return _clone(r);
    },

    // ── § 5.15  FACE REQUEST REGISTRY ─────────────────────────────────────────

    /**
     * Stores recognition requests. Never recognizes faces.
     * @param {{ faceId?: string, requestId: string, sessionId: string,
     *   imageId?: string, videoId?: string, adapterId?: string,
     *   consentGranted?: boolean }} config
     * @returns {string} faceId
     */
    registerFaceRequest(config) {
        _securityCheck(config, "registerFaceRequest");
        _requireString(config?.requestId, "requestId");
        _requireString(config?.sessionId, "sessionId");
        const faceId = config.faceId || _uid("vface");
        _faceRequests.set(faceId, _deepFreeze({
            faceId,
            requestId:      config.requestId,
            sessionId:      config.sessionId,
            imageId:        config.imageId       ?? null,
            videoId:        config.videoId       ?? null,
            adapterId:      config.adapterId     ?? null,
            consentGranted: config.consentGranted ?? false,
            createdAt:      _now(),
            ..._syncMeta(config),
        }));
        _audit_log("FACE_REGISTERED", "face", faceId);
        return faceId;
    },

    /** @param {{ sessionId?: string }} [filter] */
    listFaceRequests(filter = {}) {
        let r = Array.from(_faceRequests.values());
        if (filter.sessionId) r = r.filter(x => x.sessionId === filter.sessionId);
        return _clone(r);
    },

    // ── § 5.16  OBJECT REQUEST REGISTRY ──────────────────────────────────────

    /**
     * Stores object detection requests. Never detects objects.
     * @param {{ objectId?: string, requestId: string, sessionId: string,
     *   imageId?: string, videoId?: string, adapterId?: string,
     *   classes?: string[] }} config
     * @returns {string} objectId
     */
    registerObjectRequest(config) {
        _securityCheck(config, "registerObjectRequest");
        _requireString(config?.requestId, "requestId");
        _requireString(config?.sessionId, "sessionId");
        const objectId = config.objectId || _uid("vobj");
        _objectRequests.set(objectId, _deepFreeze({
            objectId,
            requestId:  config.requestId,
            sessionId:  config.sessionId,
            imageId:    config.imageId   ?? null,
            videoId:    config.videoId   ?? null,
            adapterId:  config.adapterId ?? null,
            classes:    Object.freeze(config.classes ?? []),
            createdAt:  _now(),
            ..._syncMeta(config),
        }));
        _audit_log("OBJECT_REGISTERED", "object", objectId);
        return objectId;
    },

    /** @param {{ sessionId?: string }} [filter] */
    listObjectRequests(filter = {}) {
        let r = Array.from(_objectRequests.values());
        if (filter.sessionId) r = r.filter(x => x.sessionId === filter.sessionId);
        return _clone(r);
    },

    // ── § 5.17  CLASSIFICATION REQUEST REGISTRY ───────────────────────────────

    /**
     * Stores classification requests. Never classifies.
     * @param {{ classId?: string, requestId: string, sessionId: string,
     *   imageId?: string, modelId?: string, adapterId?: string }} config
     * @returns {string} classId
     */
    registerClassificationRequest(config) {
        _securityCheck(config, "registerClassificationRequest");
        _requireString(config?.requestId, "requestId");
        _requireString(config?.sessionId, "sessionId");
        const classId = config.classId || _uid("vcls");
        _classRequests.set(classId, _deepFreeze({
            classId,
            requestId:  config.requestId,
            sessionId:  config.sessionId,
            imageId:    config.imageId   ?? null,
            modelId:    config.modelId   ?? null,
            adapterId:  config.adapterId ?? null,
            createdAt:  _now(),
            ..._syncMeta(config),
        }));
        _audit_log("CLASS_REGISTERED", "classification", classId);
        return classId;
    },

    /** @param {{ sessionId?: string }} [filter] */
    listClassificationRequests(filter = {}) {
        let r = Array.from(_classRequests.values());
        if (filter.sessionId) r = r.filter(x => x.sessionId === filter.sessionId);
        return _clone(r);
    },

    // ── § 5.18  ANNOTATION REGISTRY ───────────────────────────────────────────

    /**
     * Metadata only — bounding boxes, regions, labels, polygons, keypoints.
     * @param {{
     *   annotationId?: string,
     *   sessionId:     string,
     *   imageId?:      string,
     *   type:          string,   — "bbox"|"polygon"|"keypoint"|"label"|"region"
     *   label?:        string,
     *   data:          object,   — geometry data, metadata only
     * }} config
     * @returns {string} annotationId
     */
    registerAnnotation(config) {
        _securityCheck(config, "registerAnnotation");
        _requireString(config?.sessionId, "sessionId");
        _requireString(config?.type,      "type");
        const annotationId = config.annotationId || _uid("vanno");
        _annotations.set(annotationId, _deepFreeze({
            annotationId,
            sessionId:   config.sessionId,
            imageId:     config.imageId ?? null,
            type:        config.type,
            label:       config.label   ?? "",
            data:        _clone(config.data ?? {}),
            createdAt:   _now(),
            ..._syncMeta(config),
        }));
        _audit_log("ANNOTATION_REGISTERED", "annotation", annotationId);
        return annotationId;
    },

    /** @param {string} annotationId @returns {boolean} */
    removeAnnotation(annotationId) {
        _requireString(annotationId, "annotationId");
        return _annotations.delete(annotationId);
    },

    /** @param {{ sessionId?: string, imageId?: string, type?: string }} [filter] */
    listAnnotations(filter = {}) {
        let r = Array.from(_annotations.values());
        if (filter.sessionId) r = r.filter(x => x.sessionId === filter.sessionId);
        if (filter.imageId)   r = r.filter(x => x.imageId   === filter.imageId);
        if (filter.type)      r = r.filter(x => x.type      === filter.type);
        return _clone(r);
    },

    // ── § 5.19  RESULT REGISTRY ───────────────────────────────────────────────

    /**
     * Stores completed adapter results. Coordinator only.
     * @param {{
     *   resultId?:  string,
     *   requestId:  string,
     *   sessionId:  string,
     *   taskId?:    string,
     *   adapterId?: string,
     *   type:       string,
     *   summary:    object,
     *   status?:    string,
     * }} config
     * @returns {string} resultId
     */
    registerVisionResult(config) {
        _securityCheck(config, "registerVisionResult");
        _requireString(config?.requestId, "requestId");
        _requireString(config?.sessionId, "sessionId");
        _requireString(config?.type,      "type");
        const resultId = config.resultId || _uid("vres");
        _results.set(resultId, _deepFreeze({
            resultId,
            requestId:  config.requestId,
            sessionId:  config.sessionId,
            taskId:     config.taskId     ?? null,
            adapterId:  config.adapterId  ?? null,
            type:       config.type,
            summary:    _clone(config.summary ?? {}),
            status:     config.status     ?? "completed",
            createdAt:  _now(),
            ..._syncMeta(config),
        }));
        _audit_log("RESULT_REGISTERED", "result", resultId, { type: config.type });
        _timeline_push("result.registered", { resultId, type: config.type });
        return resultId;
    },

    /** @param {{ sessionId?: string, type?: string, status?: string }} [filter] */
    listVisionResults(filter = {}) {
        let r = Array.from(_results.values());
        if (filter.sessionId) r = r.filter(x => x.sessionId === filter.sessionId);
        if (filter.type)      r = r.filter(x => x.type      === filter.type);
        if (filter.status)    r = r.filter(x => x.status    === filter.status);
        return _clone(r);
    },

    // ── § 5.20  CONFIDENCE REGISTRY ───────────────────────────────────────────

    /**
     * Stores confidence values reported by adapters. Never calculates.
     * @param {{
     *   confidenceId?: string,
     *   resultId:      string,
     *   sessionId:     string,
     *   value:         number,
     *   label?:        string,
     * }} config
     * @returns {string} confidenceId
     */
    registerConfidence(config) {
        _securityCheck(config, "registerConfidence");
        _requireString(config?.resultId,  "resultId");
        _requireString(config?.sessionId, "sessionId");
        if (typeof config?.value !== "number") {
            throw new TypeError("[CozyVision] confidence.value must be a number.");
        }
        const confidenceId = config.confidenceId || _uid("vconf");
        _confidence.set(confidenceId, _deepFreeze({
            confidenceId,
            resultId:   config.resultId,
            sessionId:  config.sessionId,
            value:      config.value,
            label:      config.label   ?? "",
            createdAt:  _now(),
            ..._syncMeta(config),
        }));
        return confidenceId;
    },

    /** @param {{ sessionId?: string, resultId?: string }} [filter] */
    listConfidence(filter = {}) {
        let r = Array.from(_confidence.values());
        if (filter.sessionId) r = r.filter(x => x.sessionId === filter.sessionId);
        if (filter.resultId)  r = r.filter(x => x.resultId  === filter.resultId);
        return _clone(r);
    },

    // ── § 5.21  VISION MODEL REGISTRY ────────────────────────────────────────

    /**
     * Metadata only. Never executes models.
     * @param {{
     *   modelId?:          string,
     *   name:              string,
     *   version?:          string,
     *   capabilities:      string[],
     *   offlineSupported?: boolean,
     *   hardwareRequirements?: string[],
     *   provider?:         string,
     * }} config
     * @returns {string} modelId
     */
    registerVisionModel(config) {
        _securityCheck(config, "registerVisionModel");
        _requireString(config?.name, "name");
        const modelId = config.modelId || _uid("vmod");
        _models.set(modelId, _deepFreeze({
            modelId,
            name:                 config.name,
            version:              config.version              ?? "unknown",
            capabilities:         Object.freeze(config.capabilities         ?? []),
            offlineSupported:     config.offlineSupported     ?? true,
            hardwareRequirements: Object.freeze(config.hardwareRequirements ?? []),
            provider:             config.provider             ?? "unknown",
            registeredAt:         _now(),
            ..._syncMeta(config),
        }));
        _audit_log("MODEL_REGISTERED", "model", modelId);
        return modelId;
    },

    /** @param {string} modelId @returns {boolean} */
    removeVisionModel(modelId) {
        _requireString(modelId, "modelId");
        return _models.delete(modelId);
    },

    /** @param {{ offlineSupported?: boolean }} [filter] */
    listVisionModels(filter = {}) {
        let r = Array.from(_models.values());
        if (filter.offlineSupported !== undefined) {
            r = r.filter(x => x.offlineSupported === filter.offlineSupported);
        }
        return _clone(r);
    },

    // ── § 5.22  ADAPTER REGISTRY ──────────────────────────────────────────────

    /**
     * Open registry. Adapters perform all computation — OCR, vision,
     * recognition, detection, classification, tracking, segmentation.
     * The kernel never performs computation.
     * @param {{
     *   adapterId?:   string,
     *   name:         string,
     *   type:         string,
     *   capabilities: string[],
     *   offline?:     boolean,
     *   version?:     string,
     *   modelIds?:    string[],
     * }} config
     * @returns {string} adapterId
     */
    registerAdapter(config) {
        _securityCheck(config, "registerAdapter");
        _requireString(config?.name, "name");
        _requireString(config?.type, "type");
        const adapterId = config.adapterId || _uid("vadapter");
        _adapters.set(adapterId, _deepFreeze({
            adapterId,
            name:         config.name,
            type:         config.type,
            capabilities: Object.freeze(config.capabilities ?? []),
            offline:      config.offline   ?? true,
            version:      config.version   ?? "unknown",
            modelIds:     Object.freeze(config.modelIds ?? []),
            registeredAt: _now(),
            ..._syncMeta(config),
        }));
        _audit_log("ADAPTER_REGISTERED", "adapter", adapterId);
        return adapterId;
    },

    /** @param {string} adapterId @returns {boolean} */
    removeAdapter(adapterId) {
        _requireString(adapterId, "adapterId");
        const removed = _adapters.delete(adapterId);
        if (removed) _audit_log("ADAPTER_REMOVED", "adapter", adapterId);
        return removed;
    },

    /** @param {{ type?: string, offline?: boolean }} [filter] */
    listAdapters(filter = {}) {
        let r = Array.from(_adapters.values());
        if (filter.type !== undefined)    r = r.filter(x => x.type    === filter.type);
        if (filter.offline !== undefined) r = r.filter(x => x.offline === filter.offline);
        return _clone(r);
    },

    // ── § 5.23  PLUGIN REGISTRY ───────────────────────────────────────────────

    /**
     * Open registry. Bookkeeping only.
     * @param {{ pluginId?: string, name: string, type?: string }} config
     * @returns {string} pluginId
     */
    registerPlugin(config) {
        _securityCheck(config, "registerPlugin");
        _requireString(config?.name, "name");
        const pluginId = config.pluginId || _uid("vplugin");
        _plugins.set(pluginId, _deepFreeze({
            pluginId,
            name:        config.name,
            type:        config.type ?? "general",
            registeredAt: _now(),
            ..._syncMeta(config),
        }));
        _audit_log("PLUGIN_REGISTERED", "plugin", pluginId);
        return pluginId;
    },

    /** @returns {Readonly<object[]>} */
    listPlugins() {
        return _clone(Array.from(_plugins.values()));
    },

    // ── § 5.24  INTEGRATION REGISTRY ─────────────────────────────────────────

    /**
     * Closed integration registry. Structured metadata only.
     * Known: CozyCamera · CozyMedia · CozyStorage · CozySpeech ·
     *   CozyTranslate · CozyIdentity · CozyNetwork · CozyEmergency ·
     *   OurCozyLive · CozyAI
     * @param {{
     *   integrationId?: string,
     *   name:           string,
     *   status?:        string,
     *   contract?:      string,
     * }} config
     * @returns {string} integrationId
     */
    registerIntegration(config) {
        _securityCheck(config, "registerIntegration");
        _requireString(config?.name, "name");
        const integrationId = config.integrationId || _uid("vint");
        _integrations.set(integrationId, _deepFreeze({
            integrationId,
            name:        config.name,
            status:      config.status   ?? "unknown",
            contract:    config.contract ?? null,
            registeredAt: _now(),
            ..._syncMeta(config),
        }));
        _audit_log("INTEGRATION_REGISTERED", "integration", integrationId);
        return integrationId;
    },

    /** @returns {Readonly<object[]>} */
    listIntegrations() {
        return _clone(Array.from(_integrations.values()));
    },

    // ── § 5.25  TIMELINE REGISTRY ─────────────────────────────────────────────

    /**
     * Append a custom timeline event.
     * @param {{ eventType: string, sessionId?: string, payload?: object }} event
     */
    addTimelineEvent(event) {
        _securityCheck(event, "addTimelineEvent");
        _requireString(event?.eventType, "eventType");
        _timeline_push(event.eventType, { sessionId: event.sessionId, ...(event.payload ?? {}) });
    },

    /**
     * @param {{ sessionId?: string, eventType?: string }} [filter]
     * @returns {Readonly<object[]>}
     */
    getTimeline(filter = {}) {
        let r = [..._timeline];
        if (filter.sessionId) r = r.filter(e => e.payload?.sessionId === filter.sessionId);
        if (filter.eventType) r = r.filter(e => e.eventType === filter.eventType);
        return _clone(r);
    },
   // ── § 5.26  EVENT GRAPH REGISTRY ─────────────────────────────────────────

    /**
     * Register any entity as a graph node.
     * @param {{ nodeId?: string, entityType: string, entityId: string,
     *   sessionId?: string, label?: string }} config
     * @returns {string} nodeId
     */
    registerGraphNode(config) {
        _securityCheck(config, "registerGraphNode");
        _requireString(config?.entityType, "entityType");
        _requireString(config?.entityId,   "entityId");
        const nodeId = config.nodeId || _uid("vnode");
        _graphNodes.set(nodeId, _deepFreeze({
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
     * @param {{ edgeId?: string, fromNodeId: string, toNodeId: string,
     *   relationship: string, sessionId?: string }} config
     * @returns {string} edgeId
     */
    registerGraphEdge(config) {
        _securityCheck(config, "registerGraphEdge");
        _requireString(config?.fromNodeId,   "fromNodeId");
        _requireString(config?.toNodeId,     "toNodeId");
        _requireString(config?.relationship, "relationship");
        const edgeId = config.edgeId || _uid("vedge");
        _graphEdges.set(edgeId, _deepFreeze({
            edgeId,
            fromNodeId:   config.fromNodeId,
            toNodeId:     config.toNodeId,
            relationship: config.relationship,
            sessionId:    config.sessionId ?? null,
            createdAt:    _now(),
        }));
        return edgeId;
    },

    removeGraphNode(nodeId) { _requireString(nodeId, "nodeId"); return _graphNodes.delete(nodeId); },
    removeGraphEdge(edgeId) { _requireString(edgeId, "edgeId"); return _graphEdges.delete(edgeId); },

    listGraphNodes(filter = {}) {
        let r = Array.from(_graphNodes.values());
        if (filter.entityType) r = r.filter(n => n.entityType === filter.entityType);
        if (filter.sessionId)  r = r.filter(n => n.sessionId  === filter.sessionId);
        return _clone(r);
    },

    listGraphEdges(filter = {}) {
        let r = Array.from(_graphEdges.values());
        if (filter.relationship) r = r.filter(e => e.relationship === filter.relationship);
        if (filter.sessionId)    r = r.filter(e => e.sessionId    === filter.sessionId);
        return _clone(r);
    },

    // ── § 5.27  PERMISSION REGISTRY ───────────────────────────────────────────

    /**
     * Vision, camera, privacy, consent, document, medical, identity permissions.
     * Coordinator only.
     * @param {{
     *   permissionId?: string,
     *   sessionId:     string,
     *   type:          string,
     *   granted:       boolean,
     *   subjectId?:    string,
     *   notes?:        string,
     * }} config
     * @returns {string} permissionId
     */
    registerPermission(config) {
        _securityCheck(config, "registerPermission");
        _requireString(config?.sessionId, "sessionId");
        _requireString(config?.type,      "type");
        const permissionId = config.permissionId || _uid("vperm");
        _permissions.set(permissionId, _deepFreeze({
            permissionId,
            sessionId:  config.sessionId,
            type:       config.type,
            granted:    config.granted    ?? false,
            subjectId:  config.subjectId  ?? null,
            notes:      config.notes      ?? "",
            grantedAt:  _now(),
            ..._syncMeta(config),
        }));
        _audit_log("PERMISSION_REGISTERED", "permission", permissionId, { type: config.type });
        return permissionId;
    },

    /** @param {{ sessionId?: string, type?: string, granted?: boolean }} [filter] */
    listPermissions(filter = {}) {
        let r = Array.from(_permissions.values());
        if (filter.sessionId) r = r.filter(x => x.sessionId === filter.sessionId);
        if (filter.type)      r = r.filter(x => x.type      === filter.type);
        if (filter.granted !== undefined) r = r.filter(x => x.granted === filter.granted);
        return _clone(r);
    },

    // ── § 5.28  AUDIT REGISTRY ────────────────────────────────────────────────

    /**
     * Append-only. Every mutation is recorded automatically.
     * This method allows external callers to log custom audit entries.
     * @param {{ action: string, entityType: string, entityId: string, meta?: object }} entry
     */
    addAuditEntry(entry) {
        _securityCheck(entry, "addAuditEntry");
        _requireString(entry?.action,     "action");
        _requireString(entry?.entityType, "entityType");
        _requireString(entry?.entityId,   "entityId");
        _audit_log(entry.action, entry.entityType, entry.entityId, entry.meta ?? {});
    },

    /**
     * @param {{ entityType?: string, action?: string }} [filter]
     * @returns {Readonly<object[]>}
     */
    getAuditLog(filter = {}) {
        let r = [..._audit];
        if (filter.entityType) r = r.filter(a => a.entityType === filter.entityType);
        if (filter.action)     r = r.filter(a => a.action     === filter.action);
        return _clone(r);
    },

    // ── § 5.29  TIME SYNCHRONIZATION ─────────────────────────────────────────

    /**
     * Set the clock offset to stay synchronized with CozyNetwork master clock.
     * @param {number} masterTimestampMs
     */
    synchronizeClock(masterTimestampMs) {
        _clockOffsetMs = masterTimestampMs - Date.now();
    },

    /** @returns {number} Current synchronized Unix timestamp in ms */
    getSynchronizedTime() {
        return Date.now() + _clockOffsetMs;
    },

    // ── § 5.30  OFFLINE SYNC METADATA ────────────────────────────────────────

    /**
     * Update the sync state of any entity that supports offline sync metadata.
     * The caller provides the store reference lookup — the kernel stores only.
     * @param {string} entityType
     * @param {string} entityId
     * @param {{ syncState: string, globalId?: string, conflictState?: string }} update
     */
    updateSyncState(entityType, entityId, update) {
        _securityCheck(update, "updateSyncState");
        _requireString(entityType, "entityType");
        _requireString(entityId,   "entityId");

        const STORE_MAP = {
            session:        _sessions,
            request:        _requests,
            task:           _tasks,
            image:          _images,
            video:          _videos,
            document:       _documents,
            camera:         _cameraSources,
            device:         _devices,
            pipeline:       _pipelines,
            detection:      _detections,
            ocr:            _ocrRequests,
            barcode:        _barcodeRequests,
            qr:             _qrRequests,
            face:           _faceRequests,
            object:         _objectRequests,
            classification: _classRequests,
            annotation:     _annotations,
            result:         _results,
            confidence:     _confidence,
            model:          _models,
            adapter:        _adapters,
            plugin:         _plugins,
            integration:    _integrations,
            permission:     _permissions,
        };

        const store = STORE_MAP[entityType];
        if (!store) {
            throw new Error(`[CozyVision] Unknown entityType for sync: "${entityType}".`);
        }
        const existing = store.get(entityId);
        if (!existing) {
            throw new Error(
                `[CozyVision] Entity "${entityId}" of type "${entityType}" not found.`
            );
        }
        store.set(entityId, _deepFreeze({
            ...existing,
            syncState:     update.syncState     ?? existing.syncState,
            globalId:      update.globalId      ?? existing.globalId,
            conflictState: update.conflictState ?? existing.conflictState,
            lastModified:  _now(),
        }));
        _audit_log("SYNC_STATE_UPDATED", entityType, entityId, { syncState: update.syncState });
    },

    // ── § 5.31  EVENT BUS EXPOSURE ────────────────────────────────────────────

    /**
     * Subscribe to a vision kernel event.
     * @param {string}   event
     * @param {Function} fn
     */
    on(event, fn)   { _bus.on(event, fn); },

    /**
     * Unsubscribe from a vision kernel event.
     * @param {string}   event
     * @param {Function} fn
     */
    off(event, fn)  { _bus.off(event, fn); },

    /**
     * Subscribe to a vision kernel event for one invocation.
     * @param {string}   event
     * @param {Function} fn
     */
    once(event, fn) { _bus.once(event, fn); },

    // ── § 5.32  DIAGNOSTICS ───────────────────────────────────────────────────

    /**
     * Return a frozen diagnostic snapshot.
     * @returns {Readonly<object>}
     */
    getDiagnostics() {
        const sessionsByState = {};
        for (const s of _sessions.values()) {
            sessionsByState[s.state] = (sessionsByState[s.state] ?? 0) + 1;
        }
        const adaptersByType = {};
        for (const a of _adapters.values()) {
            adaptersByType[a.type] = (adaptersByType[a.type] ?? 0) + 1;
        }

        return _clone({
            version:           VISION_VERSION,
            generatedAt:       _now(),
            clockOffsetMs:     _clockOffsetMs,

            sessions:          _sessions.size,
            sessionsByState,
            requests:          _requests.size,
            tasks:             _tasks.size,
            images:            _images.size,
            videos:            _videos.size,
            documents:         _documents.size,
            cameraSources:     _cameraSources.size,
            devices:           _devices.size,
            deviceHealthEntries: _deviceHealth.size,
            pipelines:         _pipelines.size,
            detections:        _detections.size,
            ocrRequests:       _ocrRequests.size,
            barcodeRequests:   _barcodeRequests.size,
            qrRequests:        _qrRequests.size,
            faceRequests:      _faceRequests.size,
            objectRequests:    _objectRequests.size,
            classRequests:     _classRequests.size,
            annotations:       _annotations.size,
            results:           _results.size,
            confidenceEntries: _confidence.size,
            models:            _models.size,
            adapters:          _adapters.size,
            adaptersByType,
            plugins:           _plugins.size,
            integrations:      _integrations.size,
            timelineEvents:    _timeline.length,
            graphNodes:        _graphNodes.size,
            graphEdges:        _graphEdges.size,
            permissions:       _permissions.size,
            auditEntries:      _audit.length,
            exports:           _exports.size,
            imports:           _imports.size,
        });
    },

    // ── § 5.33  VERSION ───────────────────────────────────────────────────────

    /** @returns {string} */
    getVersion() { return VISION_VERSION; },
};

// ─────────────────────────────────────────────────────────────────────────────
// § 6. GLOBAL REGISTRATION
// ─────────────────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
    if (!window.CozyOS) window.CozyOS = {};

    if (window.CozyOS.Vision) {
        let existingVersion = "(unknown)";
        try {
            if (typeof window.CozyOS.Vision.getVersion === "function") {
                existingVersion = window.CozyOS.Vision.getVersion();
            }
        } catch (_) {}

        if (existingVersion !== VISION_VERSION) {
            throw new Error(
                `[CozyVision] VERSION_CONFLICT: registered version is ` +
                `${existingVersion}, attempted load is ${VISION_VERSION}. ` +
                `Only one version of CozyVision may be active at a time.`
            );
        }
        // Same version — hot-reload no-op, existing instance preserved.
    } else {
        window.CozyOS.Vision = _deepFreeze(_kernel);
    }
      }
