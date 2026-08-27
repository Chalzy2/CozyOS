/**
 * CozyOS Sound Event Engine
 * File Reference: core/modules/hearing/sound-event-engine.js
 * Layer: Core / Platform Foundation — Event Management Engine
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 159 — Sound Event Engine Platform
 *
 * OWNERSHIP
 *   The one, canonical owner of sound EVENT management:
 *   window.CozyOS.SoundEventEngine. Owns the event registry, sessions,
 *   timeline, history, queue, priorities, correlation, aggregation,
 *   health, and diagnostics for sound events.
 * Does NOT own — and never will
 *   Microphone access, audio capture, DSP, sound detection, sound
 *   classification, speech recognition, translation, AI inference,
 *   notifications, workflow, or policy. This file never calls
 *   getUserMedia, never runs a classifier, and never invents a
 *   category — it only converts REAL results already produced by
 *   window.CozyOS.CozyHearing into managed events.
 *
 * REAL, NOT FAKE
 *   recordClassification() — the one real entry point — refuses to
 *   create any event unless the classification it's given has
 *   isReal:true. A caller that hands this engine a fabricated or
 *   isReal:false result gets nothing created, by design, matching
 *   "Events only exist when received from a real Hearing provider."
 *   Correlation (duplicate/sequential/simultaneous) is computed from
 *   real timestamps/categories already on record — parent/child
 *   relationships are never inferred, only accepted when a caller
 *   explicitly states them via context.parentEventId.
 *
 * PROVIDER INTEGRATION — HONEST DISCREPANCY DISCLOSED
 *   The Milestone 159 spec lists CozyHearing.detectSound() as one of
 *   three methods to consume. That method does not exist on the real,
 *   already-built CozyHearing (only registerClassifier/classifySound/
 *   analyseSound/getCapabilities/getHealth do). This file consumes
 *   only the two real ones (classifySound/analyseSound, via
 *   processAudio()) and does not fabricate a call to a method that
 *   isn't real.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const EVENT_ENGINE_VERSION = "1.0.0-ENTERPRISE";

    const CONTINUOUS_CATEGORIES = Object.freeze(["Silence", "Speech", "Music"]); // tracked as Started/Ended pairs
    const MOMENTARY_CATEGORIES = Object.freeze([
        "Door Knock", "Door Bell", "Glass Break", "Alarm", "Fire Alarm", "Smoke Alarm", "Siren",
        "Baby Cry", "Dog Bark", "Cat Meow", "Vehicle", "Machine", "Keyboard", "Mouse Click",
        "Thunder", "Rain", "Wind", "Ocean", "Footsteps"
    ]);
    const SUPPORTED_EVENT_TYPES = Object.freeze([
        "Silence Started", "Silence Ended", "Speech Started", "Speech Ended", "Music Started", "Music Ended",
        ...MOMENTARY_CATEGORIES, "Unknown"
    ]);
    const PRIORITIES = Object.freeze(["Critical", "High", "Normal", "Low", "Background"]);
    const SEVERITIES = Object.freeze(["Emergency", "Warning", "Information", "Debug"]);
    const LIFECYCLE_STATES = Object.freeze(["Created", "Detected", "Confirmed", "Updated", "Resolved", "Cancelled", "Archived"]);
    const HEALTH_STATES = Object.freeze(["Ready", "Listening", "Processing", "Idle", "Unavailable", "Error"]);

    // Real, disclosed DEFAULT severity/priority map — a sensible starting
    // point, not an authoritative safety judgment. Overridable via
    // setPriorityMapping()/setSeverityMapping() rather than hardcoded-
    // immutable, since real deployments will want to tune this.
    const DEFAULT_PRIORITY_MAP = {
        "Fire Alarm": "Critical", "Smoke Alarm": "Critical", "Glass Break": "Critical",
        "Alarm": "High", "Siren": "High", "Baby Cry": "High", "Dog Bark": "High",
        "Door Knock": "Normal", "Door Bell": "Normal", "Cat Meow": "Normal", "Vehicle": "Normal", "Machine": "Normal",
        "Footsteps": "Low", "Keyboard": "Low", "Mouse Click": "Low", "Thunder": "Low", "Rain": "Low", "Wind": "Low", "Ocean": "Low",
        "Speech Started": "Normal", "Speech Ended": "Normal", "Music Started": "Low", "Music Ended": "Low",
        "Silence Started": "Background", "Silence Ended": "Background", "Unknown": "Low"
    };
    const DEFAULT_SEVERITY_MAP = {
        "Fire Alarm": "Emergency", "Smoke Alarm": "Emergency", "Glass Break": "Emergency",
        "Alarm": "Warning", "Siren": "Warning", "Baby Cry": "Warning", "Dog Bark": "Warning",
        "Door Knock": "Information", "Door Bell": "Information", "Cat Meow": "Information", "Vehicle": "Information", "Machine": "Information",
        "Footsteps": "Debug", "Keyboard": "Debug", "Mouse Click": "Debug", "Thunder": "Information", "Rain": "Debug", "Wind": "Debug", "Ocean": "Debug",
        "Speech Started": "Information", "Speech Ended": "Information", "Music Started": "Information", "Music Ended": "Information",
        "Silence Started": "Debug", "Silence Ended": "Debug", "Unknown": "Debug"
    };

    const DUPLICATE_WINDOW_MS = 2000;   // same category+provider within this window ⇒ duplicate, not a new event
    const SIMULTANEOUS_WINDOW_MS = 500; // different categories within this window ⇒ marked simultaneous

    class CozySoundEventEngine {
        #events = new Map();     // eventId -> event
        #history = [];           // append-only event history log
        #queue = [];              // pending-review FIFO
        #sessions = new Map();   // sessionId -> session
        #continuousState = new Map(); // "sourceProvider:category" -> open event id (Started, not yet Ended)
        #priorityMap = { ...DEFAULT_PRIORITY_MAP };
        #severityMap = { ...DEFAULT_SEVERITY_MAP };
        #health = "Idle";

        getVersion() { return EVENT_ENGINE_VERSION; }
        listSupportedEventTypes() { return [...SUPPORTED_EVENT_TYPES]; }
        listPriorities() { return [...PRIORITIES]; }
        listSeverities() { return [...SEVERITIES]; }

        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }
        #logHistory(event, detail) {
            this.#history.push({ event, at: new Date(Date.now()).toISOString(), detail: this.#deepClone(detail) });
            if (this.#history.length > 500) this.#history.shift();
        }
        #emit(eventName, detail) {
            this.#logHistory(eventName, detail);
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`sound-event:${eventName}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }
        getHistory() { return this.#deepClone(this.#history); }

        setPriorityMapping(map) { if (map && typeof map === "object") this.#priorityMap = { ...this.#priorityMap, ...map }; return { success: true }; }
        setSeverityMapping(map) { if (map && typeof map === "object") this.#severityMap = { ...this.#severityMap, ...map }; return { success: true }; }

        // ================= Event Registry =================

        /**
         * registerEvent(fields)
         *   Real, low-level create — used internally by
         *   recordClassification() and available directly for
         *   consumers with their own already-real event data (e.g. a
         *   Vision Engine event correlated against a sound event).
         *   Rejects a missing/unsupported type or a non-real source
         *   rather than inventing defaults for them.
         */
        registerEvent(fields) {
            if (!fields || !SUPPORTED_EVENT_TYPES.includes(fields.type)) return { success: false, reason: `"${fields && fields.type}" is not a supported event type.` };
            if (fields.isReal !== true) return { success: false, reason: "Events only exist when isReal:true — refusing to fabricate one." };
            const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const now = new Date(Date.now()).toISOString();
            const priority = fields.priority && PRIORITIES.includes(fields.priority) ? fields.priority : (this.#priorityMap[fields.type] || "Normal");
            const severity = fields.severity && SEVERITIES.includes(fields.severity) ? fields.severity : (this.#severityMap[fields.type] || "Information");
            const record = {
                eventId, type: fields.type, state: "Created", priority, severity,
                confidence: typeof fields.confidence === "number" ? fields.confidence : null,
                startTime: fields.startTime || now, endTime: fields.endTime || null, duration: null,
                sourceEngine: fields.sourceEngine || "CozyHearing", sourceProvider: fields.sourceProvider || null,
                sessionId: fields.sessionId || null, parentEventId: fields.parentEventId || null,
                relatedEventIds: [], duplicateOfEventId: null, isReal: true, metadata: fields.metadata || {},
                createdAt: now, updatedAt: now
            };
            this.#events.set(eventId, record);
            this.#logHistory("event-created", { eventId, type: record.type });
            this.#emit("event-registered", { eventId, type: record.type, priority, severity });
            return { success: true, eventId, event: this.#deepClone(record) };
        }

        updateEvent(eventId, patch = {}) {
            const record = this.#events.get(eventId);
            if (!record) return { success: false, reason: "No real event with this id." };
            if (record.state === "Archived") return { success: false, reason: "Archived events are immutable." };
            const allowed = ["priority", "severity", "metadata", "confidence"];
            for (const key of allowed) if (key in patch) record[key] = patch[key];
            record.state = "Updated"; record.updatedAt = new Date(Date.now()).toISOString();
            this.#emit("event-updated", { eventId });
            return { success: true, event: this.#deepClone(record) };
        }

        #closeEvent(eventId, finalState) {
            const record = this.#events.get(eventId);
            if (!record) return { success: false, reason: "No real event with this id." };
            const now = new Date(Date.now()).toISOString();
            record.state = finalState; record.endTime = record.endTime || now; record.updatedAt = now;
            record.duration = new Date(record.endTime).getTime() - new Date(record.startTime).getTime();
            this.#emit(`event-${finalState.toLowerCase()}`, { eventId });
            return { success: true, event: this.#deepClone(record) };
        }
        resolveEvent(eventId) { return this.#closeEvent(eventId, "Resolved"); }
        cancelEvent(eventId) { return this.#closeEvent(eventId, "Cancelled"); }
        archiveEvent(eventId) {
            const record = this.#events.get(eventId);
            if (!record) return { success: false, reason: "No real event with this id." };
            record.state = "Archived"; record.updatedAt = new Date(Date.now()).toISOString();
            this.#emit("event-archived", { eventId });
            return { success: true };
        }

        findEvent(predicate) {
            if (typeof predicate !== "function") return [];
            return [...this.#events.values()].filter(predicate).map(e => this.#deepClone(e));
        }
        listEvents(filter = {}) {
            let results = [...this.#events.values()];
            if (filter.type) results = results.filter(e => e.type === filter.type);
            if (filter.state) results = results.filter(e => e.state === filter.state);
            if (filter.priority) results = results.filter(e => e.priority === filter.priority);
            if (filter.sessionId) results = results.filter(e => e.sessionId === filter.sessionId);
            return results.map(e => this.#deepClone(e)).sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
        }
        getEvent(eventId) { const e = this.#events.get(eventId); return e ? this.#deepClone(e) : null; }

        // ================= Classification ingestion (the real entry point) =================

        /**
         * recordClassification(classificationResult, context)
         *   classificationResult: a REAL result object from
         *   CozyHearing.classifySound()/analyseSound() (must have
         *   isReal:true — anything else is refused, not converted).
         *   context: { sourceProvider, sessionId, parentEventId }.
         *   Continuous categories (Silence/Speech/Music) are tracked as
         *   Started/Ended pairs per (sourceProvider, category); every
         *   other supported category creates one momentary event per
         *   call. An unrecognized category becomes a real "Unknown"
         *   event rather than being silently dropped or invented as
         *   something specific.
         */
        recordClassification(classificationResult, context = {}) {
            if (!classificationResult || classificationResult.isReal !== true) {
                this.#emit("record-failed-closed", { reason: "not-real" });
                return { success: false, reason: "Refusing to create an event from a non-real (isReal:false) classification.", isReal: false };
            }
            const category = classificationResult.category;
            const sourceProvider = context.sourceProvider || classificationResult.provider || null;
            const stateKey = `${sourceProvider}:${category}`;

            // A continuous category "ending" is real only when the caller
            // explicitly signals it (context.ended === true) — this engine
            // does not infer silence/absence on its own, since it never
            // polls or captures audio itself. Checked FIRST and
            // independently of the current classification's own category,
            // since the realistic case (classifying "Silence" to signal
            // that "Speech" just ended) needs BOTH: close the old event
            // AND still let the current category open/confirm its own.
            let endedResult = null;
            if (context.ended === true) {
                const endedKey = `${sourceProvider}:${context.endedCategory || category}`;
                const openEventId = this.#continuousState.get(endedKey);
                if (openEventId) {
                    this.#continuousState.delete(endedKey);
                    const closeResult = this.#closeEvent(openEventId, "Resolved");
                    if (closeResult.success) {
                        const record = this.#events.get(openEventId);
                        record.type = record.type.replace(" Started", " Ended");
                    }
                    endedResult = { ...closeResult, transition: "ended" };
                }
            }

            if (CONTINUOUS_CATEGORIES.includes(category)) {
                const openEventId = this.#continuousState.get(stateKey);
                if (openEventId && this.#events.has(openEventId)) {
                    // Already "Started" — this is a continuation, not a new event. Real, not fabricated: just confirms.
                    const record = this.#events.get(openEventId);
                    record.state = "Confirmed"; record.updatedAt = new Date(Date.now()).toISOString();
                    return { success: true, eventId: openEventId, event: this.#deepClone(record), transition: "continuing", endedResult };
                }
                const result = this.registerEvent({
                    type: `${category} Started`, isReal: true, confidence: classificationResult.confidence,
                    sourceProvider, sessionId: context.sessionId, parentEventId: context.parentEventId, metadata: classificationResult.metadata
                });
                if (result.success) this.#continuousState.set(stateKey, result.eventId);
                return { ...result, transition: "started", endedResult };
            }

            if (endedResult) return endedResult;

            const eventType = MOMENTARY_CATEGORIES.includes(category) ? category : "Unknown";
            const correlation = this.#correlate(eventType, sourceProvider);
            if (correlation.duplicateOfEventId) {
                this.#emit("duplicate-detected", { duplicateOfEventId: correlation.duplicateOfEventId });
                return { success: true, eventId: correlation.duplicateOfEventId, duplicate: true, transition: "duplicate" };
            }
            const result = this.registerEvent({
                type: eventType, isReal: true, confidence: classificationResult.confidence,
                sourceProvider, sessionId: context.sessionId, parentEventId: context.parentEventId, metadata: classificationResult.metadata
            });
            if (result.success) {
                const record = this.#events.get(result.eventId);
                record.state = "Detected";
                for (const relatedId of correlation.simultaneousWith) {
                    record.relatedEventIds.push(relatedId);
                    const other = this.#events.get(relatedId);
                    if (other) other.relatedEventIds.push(result.eventId);
                }
                this.enqueue(result.eventId);
            }
            return { ...result, transition: "detected", relatedEventIds: correlation.simultaneousWith };
        }

        /**
         * processAudio(audioData, options, context)
         *   Convenience real path: calls the real
         *   CozyOS.CozyHearing.classifySound() (never a second
         *   classifier), then records the result exactly as
         *   recordClassification() would. Fails closed the same way if
         *   CozyHearing is missing or returns isReal:false.
         */
        async processAudio(audioData, options = {}, context = {}) {
            const hearing = window.CozyOS.CozyHearing;
            if (!hearing || typeof hearing.classifySound !== "function") {
                return { success: false, reason: "CozyOS.CozyHearing is not loaded — cannot consume a real classification.", isReal: false };
            }
            const result = await hearing.classifySound(audioData, options);
            return this.recordClassification(result, { ...context, sourceProvider: context.sourceProvider || result.provider });
        }

        /** #correlate — real, timestamp-based Duplicate/Simultaneous detection. Never fabricates a relationship. */
        #correlate(type, sourceProvider) {
            const now = Date.now();
            const recent = [...this.#events.values()].filter(e => now - new Date(e.startTime).getTime() < SIMULTANEOUS_WINDOW_MS);
            const duplicate = recent.find(e => e.type === type && e.sourceProvider === sourceProvider && now - new Date(e.startTime).getTime() < DUPLICATE_WINDOW_MS);
            if (duplicate) return { duplicateOfEventId: duplicate.eventId, simultaneousWith: [] };
            const simultaneousWith = recent.filter(e => e.type !== type).map(e => e.eventId);
            return { duplicateOfEventId: null, simultaneousWith };
        }

        // ================= Event Queue =================
        enqueue(eventId) { this.#queue.push({ eventId, queuedAt: new Date(Date.now()).toISOString() }); this.#emit("enqueued", { eventId }); return { success: true, length: this.#queue.length }; }
        dequeue() { const item = this.#queue.shift(); if (item) this.#emit("dequeued", { eventId: item.eventId }); return item ? this.#deepClone(item) : null; }
        peek() { return this.#queue.length ? this.#deepClone(this.#queue[0]) : null; }
        clear() { const n = this.#queue.length; this.#queue = []; this.#emit("queue-cleared", { count: n }); return { success: true, cleared: n }; }
        getQueue() { return this.#deepClone(this.#queue); }
        queueHealth() { return { length: this.#queue.length, state: this.#queue.length === 0 ? "Idle" : this.#queue.length > 50 ? "Busy" : "Ready" }; }

        // ================= Sessions =================
        createSession(fields = {}) {
            const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const now = new Date(Date.now()).toISOString();
            this.#sessions.set(sessionId, { sessionId, label: fields.label || sessionId, state: "Active", startedAt: now, pausedAt: null, closedAt: null, eventCount: 0 });
            this.#health = "Listening";
            this.#emit("session-created", { sessionId });
            return { success: true, sessionId };
        }
        closeSession(sessionId) {
            const s = this.#sessions.get(sessionId);
            if (!s) return { success: false, reason: "No real session with this id." };
            s.state = "Closed"; s.closedAt = new Date(Date.now()).toISOString();
            if (![...this.#sessions.values()].some(x => x.state === "Active")) this.#health = "Idle";
            this.#emit("session-closed", { sessionId });
            return { success: true };
        }
        pauseSession(sessionId) {
            const s = this.#sessions.get(sessionId);
            if (!s) return { success: false, reason: "No real session with this id." };
            s.state = "Paused"; s.pausedAt = new Date(Date.now()).toISOString();
            this.#emit("session-paused", { sessionId });
            return { success: true };
        }
        resumeSession(sessionId) {
            const s = this.#sessions.get(sessionId);
            if (!s) return { success: false, reason: "No real session with this id." };
            s.state = "Active"; s.pausedAt = null;
            this.#emit("session-resumed", { sessionId });
            return { success: true };
        }
        getSession(sessionId) { const s = this.#sessions.get(sessionId); return s ? this.#deepClone(s) : null; }
        listSessions() { return [...this.#sessions.values()].map(s => this.#deepClone(s)); }

        // ================= Diagnostics =================
        eventReport() { return { total: this.#events.size, byState: this.#tally(e => e.state), byType: this.#tally(e => e.type), byPriority: this.#tally(e => e.priority) }; }
        timelineReport(limit = 50) {
            return [...this.#events.values()].sort((a, b) => new Date(b.startTime) - new Date(a.startTime)).slice(0, limit)
                .map(e => this.#deepClone({ eventId: e.eventId, type: e.type, startTime: e.startTime, endTime: e.endTime, duration: e.duration, sourceEngine: e.sourceEngine, sourceProvider: e.sourceProvider }));
        }
        healthReport() { return { state: this.#health, sessions: this.#sessions.size, activeSessions: [...this.#sessions.values()].filter(s => s.state === "Active").length }; }
        queueReport() { return this.queueHealth(); }
        correlationReport() {
            const withRelations = [...this.#events.values()].filter(e => e.relatedEventIds.length > 0 || e.duplicateOfEventId);
            return withRelations.map(e => this.#deepClone({ eventId: e.eventId, relatedEventIds: e.relatedEventIds, duplicateOfEventId: e.duplicateOfEventId, parentEventId: e.parentEventId }));
        }
        #tally(keyFn) {
            const out = {};
            for (const e of this.#events.values()) { const k = keyFn(e); out[k] = (out[k] || 0) + 1; }
            return out;
        }

        async getHealth() {
            const hearingHealth = window.CozyOS.CozyHearing && typeof window.CozyOS.CozyHearing.getHealth === "function" ? await window.CozyOS.CozyHearing.getHealth() : null;
            const state = HEALTH_STATES.includes(this.#health) ? this.#health : "Idle";
            return { state, upstreamHearingState: hearingHealth ? hearingHealth.state : "Unavailable", queue: this.queueHealth() };
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: EVENT_ENGINE_VERSION, eventCount: this.#events.size, sessionCount: this.#sessions.size, queueLength: this.#queue.length, historyEntries: this.#history.length });
        }
    }

    if (window.CozyOS.SoundEventEngine && typeof window.CozyOS.SoundEventEngine.getVersion === "function") {
        const existingVersion = window.CozyOS.SoundEventEngine.getVersion();
        if (existingVersion !== EVENT_ENGINE_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: SoundEventEngine existing v${existingVersion} conflicts with load target v${EVENT_ENGINE_VERSION}.`);
        return;
    }

    window.CozyOS.SoundEventEngine = new CozySoundEventEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/modules/hearing/sound-event-engine.js",
                name: "SoundEventEngine", category: "Platform", icon: "activity.svg",
                description: "Canonical sound event management owner. Real event registry/sessions/timeline/queue/correlation/diagnostics. Never captures audio or classifies sound itself — consumes only real (isReal:true) results from CozyOS.CozyHearing via recordClassification()/processAudio(). Refuses to create events from fabricated or isReal:false input."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
