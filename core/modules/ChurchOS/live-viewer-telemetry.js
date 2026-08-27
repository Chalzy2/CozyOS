/**
 * CozyOS — Live Viewer Telemetry
 * File Reference: core/modules/ChurchOS/live-viewer-telemetry.js
 * Layer: Core / ChurchOS — Live Multilingual Distribution
 * Version: 1.0.0
 * Milestone: R040 Phase 2
 *
 * RULE 29 OWNERSHIP AUDIT
 *   core/modules/communication/ldce-session-engine.js (LDCESessionEngine)
 *   already owns the real participant roster: identity, role, language,
 *   muted/cameraOn/speaking, join/leave lifecycle (read in full before
 *   writing this file). This file does NOT duplicate any of that. It
 *   adds exactly what LDCE does not track and genuinely does not exist
 *   anywhere else in the repository: per-viewer LIVE DISTRIBUTION state
 *   — connection state, last segment received, playback state, buffered
 *   duration, and latency samples. It is keyed by the same
 *   (sessionId, participantId) pair LDCE uses, and is garbage-collected
 *   from LDCE's own real "participant-left" event (composed via
 *   LDCESessionEngine.on(), never a second event bus) — never a second
 *   source of truth for WHO is in the session, only HOW their live
 *   connection is doing.
 *
 * FAIL-CLOSED WHEN LDCE IS ABSENT
 *   If LDCESessionEngine is not loaded, this file still functions (it
 *   does not require LDCE to construct), but attach()/detach() (which
 *   wire the auto-cleanup) become no-ops and report so honestly via
 *   getVersion()-adjacent diagnostics rather than throwing.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["live-viewer-telemetry"] && window.CozyOS.Modules["live-viewer-telemetry"].version) return;

    function _now() {
        if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
        return Date.now();
    }

    const CONNECTION_STATES = Object.freeze(["connecting", "connected", "degraded", "reconnecting", "disconnected"]);
    const PLAYBACK_STATES = Object.freeze(["idle", "buffering", "playing", "paused", "stalled"]);

    class LiveViewerTelemetry {
        // `${sessionId}:${participantId}` -> telemetry record
        #records = new Map();
        #ldceUnsubscribe = null;

        getVersion() { return MODULE_VERSION; }
        getConnectionStates() { return CONNECTION_STATES.slice(); }
        getPlaybackStates() { return PLAYBACK_STATES.slice(); }

        #key(sessionId, participantId) { return `${sessionId}:${participantId}`; }

        /** attach() — composes LDCESessionEngine's real "participant-left" event for automatic cleanup. Idempotent; safe to call more than once. */
        attach() {
            const ldce = window.CozyOS.LDCESessionEngine;
            if (!ldce || typeof ldce.on !== "function") return { attached: false, reason: "LDCESessionEngine is not loaded." };
            if (this.#ldceUnsubscribe) return { attached: true, alreadyAttached: true };
            this.#ldceUnsubscribe = ldce.on("participant-left", ({ sessionId, userId }) => {
                this.#records.delete(this.#key(sessionId, userId));
            });
            return { attached: true, alreadyAttached: false };
        }

        detach() {
            if (this.#ldceUnsubscribe) { this.#ldceUnsubscribe(); this.#ldceUnsubscribe = null; return true; }
            return false;
        }

        /** ensureViewer() — creates a default record on first contact; never overwrites an existing record's history. */
        ensureViewer(sessionId, participantId) {
            const key = this.#key(sessionId, participantId);
            if (!this.#records.has(key)) {
                this.#records.set(key, {
                    sessionId, participantId,
                    connectionState: "connecting",
                    lastSegmentId: null,
                    lastSegmentDeliveredAt: null,
                    playbackState: "idle",
                    bufferedMs: 0,
                    languageChangeCount: 0,
                    latencySamples: [],
                    reconnectCount: 0,
                    updatedAt: _now(),
                });
            }
            return this.#records.get(key);
        }

        getViewer(sessionId, participantId) {
            const rec = this.#records.get(this.#key(sessionId, participantId));
            return rec ? { ...rec, latencySamples: rec.latencySamples.slice() } : null;
        }

        setConnectionState(sessionId, participantId, state) {
            if (!CONNECTION_STATES.includes(state)) throw new TypeError(`[LiveViewerTelemetry] Unknown connection state "${state}".`);
            const rec = this.ensureViewer(sessionId, participantId);
            if (state === "reconnecting" && rec.connectionState !== "reconnecting") rec.reconnectCount += 1;
            rec.connectionState = state;
            rec.updatedAt = _now();
            const bus = window.CozyOS.PlatformEventBus;
            if (bus && typeof bus.emit === "function") {
                try { bus.emit("live-distribution:viewer-connection-state", { sessionId, participantId, state }); } catch (_e) { /* observability only */ }
            }
            return { ...rec };
        }

        setPlaybackState(sessionId, participantId, state, { bufferedMs } = {}) {
            if (!PLAYBACK_STATES.includes(state)) throw new TypeError(`[LiveViewerTelemetry] Unknown playback state "${state}".`);
            const rec = this.ensureViewer(sessionId, participantId);
            rec.playbackState = state;
            if (typeof bufferedMs === "number") rec.bufferedMs = bufferedMs;
            rec.updatedAt = _now();
            return { ...rec };
        }

        recordSegmentDelivered(sessionId, participantId, segmentId, latencyMs = null) {
            const rec = this.ensureViewer(sessionId, participantId);
            rec.lastSegmentId = segmentId;
            rec.lastSegmentDeliveredAt = _now();
            if (typeof latencyMs === "number") {
                rec.latencySamples.push(latencyMs);
                if (rec.latencySamples.length > 100) rec.latencySamples.shift();
            }
            rec.updatedAt = _now();
            return { ...rec };
        }

        recordLanguageChange(sessionId, participantId) {
            const rec = this.ensureViewer(sessionId, participantId);
            rec.languageChangeCount += 1;
            rec.updatedAt = _now();
            return { ...rec };
        }

        /** listViewers() — real snapshot for a session; used by fan-out router to know who is currently connected. */
        listViewers(sessionId) {
            const out = [];
            for (const rec of this.#records.values()) {
                if (rec.sessionId === sessionId) out.push({ ...rec, latencySamples: rec.latencySamples.slice() });
            }
            return out;
        }

        removeViewer(sessionId, participantId) {
            return this.#records.delete(this.#key(sessionId, participantId));
        }

        getDiagnosticsReport() {
            return { moduleVersion: MODULE_VERSION, trackedViewerCount: this.#records.size, ldceAttached: !!this.#ldceUnsubscribe };
        }

        _clearAll() { this.#records.clear(); }
    }

    window.CozyOS.LiveViewerTelemetry = new LiveViewerTelemetry();
    window.CozyOS.Modules["live-viewer-telemetry"] = Object.freeze({
        version: MODULE_VERSION,
        description: "R040 Phase 2 — per-viewer connection/playback/latency telemetry keyed to LDCESessionEngine's real roster; auto-cleans on LDCE's real participant-left event. Does not duplicate LDCE's identity/roster/language store.",
    });
})();
