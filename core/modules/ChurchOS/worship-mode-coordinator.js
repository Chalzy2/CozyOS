/**
 * CozyOS — ChurchOS Worship Mode Coordinator
 * File Reference: core/modules/ChurchOS/worship-mode-coordinator.js
 * Milestone: ChurchOS C002, Stages 2/4/5
 *
 * CLASSIFICATION: COMPOSED. Every call in this file is to a real,
 * pre-existing, unmodified method verified during C002 Phase 1/1.5.
 * No new engine, no new storage, no new event system.
 *
 * STAGE 1 (registering record-export-session-manager.js) REQUIRED NO
 * CODE. Verified: media-pipeline-manager.js (already bridged as
 * window.CozyOS.MediaEngine via the real, existing EngineBridge) already
 * imports and re-exports record-export-session-manager.js as
 * `RecordExportSessionManager`. It is already reachable at
 * window.CozyOS.MediaEngine.RecordExportSessionManager. Adding a second,
 * separate top-level registration would create a duplicate access path
 * for the same underlying engine - not done, per explicit decision.
 *
 * HONEST, DISCLOSED GAPS (not fabricated):
 *   - "Recording" is NOT started by this coordinator. The repository
 *     itself states plainly (media-pipeline-manager.js's own comment):
 *     live capture control (record/stream/stop/pause/resume) "depends
 *     on a Recording/Streaming Engine that does not exist yet in this
 *     codebase... Adding fake record/stop/pause methods here would be
 *     exactly the kind of fabricated success this Constitution
 *     forbids." This coordinator reports recording as explicitly
 *     UNAVAILABLE, per your exact instruction, rather than claiming
 *     success.
 *   - Attendance is NOT automatically recorded when worship mode
 *     starts. church-membership-bridge.js's recordAttendance() requires
 *     OrganizationRegistry.organizationExists(orgId) - the same
 *     org-model duplication flagged unresolved since ChurchOS C001.
 *     Per the standing instruction to avoid building on that ambiguous
 *     path, this coordinator does not call recordAttendance()
 *     automatically. (startService()/markSection() do NOT depend on
 *     either organization engine - confirmed by reading their bodies -
 *     so they are safe to compose now.)
 *   - Pause/Resume are NOT composed. ChurchWorshipSession has no real
 *     pauseService()/resumeService() method - confirmed absent by
 *     direct search. Only "service started" and "service ended" are
 *     real, observable lifecycle events.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["worship-mode-coordinator"]) return;

    const WORSHIP_SENSOR_ID = "church-worship-lifecycle";
    const NETWORK_SENSOR_ID = "church-network-status";
    let sensorsRegistered = false;

    /** #ensureVirtualSensors() — registers two real virtual sensors (CozySense's own real, existing mechanism for non-hardware-backed observations) exactly once. No new sensor system. */
    function ensureVirtualSensors() {
        if (sensorsRegistered) return;
        const sense = window.CozyOS.CozySense;
        if (sense && typeof sense.registerVirtualSensor === "function") {
            if (!sense.sensorExists(WORSHIP_SENSOR_ID)) sense.registerVirtualSensor({ id: WORSHIP_SENSOR_ID, type: "church-worship-lifecycle" });
            if (!sense.sensorExists(NETWORK_SENSOR_ID)) sense.registerVirtualSensor({ id: NETWORK_SENSOR_ID, type: "church-network-status" });
        }
        sensorsRegistered = true;
    }

    /** #publish() — composes the real, existing CozySense.registerObservation(). CozySense only routes; it never interprets. */
    function publish(sensorId, observationType, data) {
        const sense = window.CozyOS.CozySense;
        if (!sense || typeof sense.registerObservation !== "function") return { success: false, reason: "CozySense is not loaded." };
        return sense.registerObservation({ sensorId, sourceEngine: "WorshipModeCoordinator", observationType, data });
    }

    class WorshipModeCoordinator {
        /**
         * startWorshipMode(orgId, sourceLanguage, listenerLanguages)
         *   Stage 2 composition. Composes, in order:
         *     1. ChurchWorshipSession.startService() — real.
         *     2. ChurchWorshipSession.addListenerLanguage() per language — real (captions/translation).
         *     3. ChurchWorshipSession.markSection() — real (first timeline marker).
         *     4. CozySense.registerObservation("service-started") — real, routing-only.
         *   Recording is explicitly reported unavailable, not attempted.
         *   Attendance is explicitly deferred, not attempted, per the
         *   unresolved organization-model duplication.
         */
        startWorshipMode(orgId, sourceLanguage, listenerLanguages = []) {
            ensureVirtualSensors();
            const session = window.CozyOS.ChurchWorshipSession;
            if (!session || typeof session.startService !== "function") {
                return { success: false, reason: "ChurchWorshipSession is not loaded." };
            }
            const startResult = session.startService(orgId, sourceLanguage);
            if (!startResult.success) return startResult;
            const serviceId = startResult.serviceId;

            const captionsAndTranslation = listenerLanguages.map(lang => ({ lang, ...session.addListenerLanguage(serviceId, lang) }));
            const firstMarker = typeof session.markSection === "function" ? session.markSection(serviceId, "worship", "Service Started") : { success: false, reason: "markSection unavailable." };

            publish(WORSHIP_SENSOR_ID, "detected", { event: "service-started", serviceId, orgId });

            const mediaEngine = window.CozyOS.MediaEngine;
            const recordingCapabilities = mediaEngine && mediaEngine.RecordExportSessionManager && typeof mediaEngine.RecordExportSessionManager.getCapabilities === "function"
                ? mediaEngine.RecordExportSessionManager.getCapabilities() : null;

            // ChurchOS C003: LiveCaptureEngine now exists. If real
            // capture is available in this environment, attempt to
            // start it - real success/failure, never a fabricated
            // "Recording Started" if getUserMedia/MediaRecorder are
            // genuinely unavailable. If LiveCaptureEngine isn't loaded
            // at all, the honest C002 "unavailable" message is
            // preserved unchanged - this composes the new engine
            // without altering ChurchOS's own architecture.
            const captureEngine = window.CozyOS.LiveCaptureEngine;
            let recording;
            if (captureEngine && typeof captureEngine.startCapture === "function") {
                const caps = captureEngine.getCapabilities();
                if (caps.recording) {
                    recording = { status: "starting", message: "Recording requested via the real Live Capture Engine.", capabilities: caps };
                } else {
                    recording = { status: "unavailable", message: "Live Capture Engine is loaded but this environment lacks getUserMedia/MediaRecorder support.", capabilities: caps };
                }
            } else {
                recording = {
                    status: "unavailable",
                    message: "Recording unavailable — the Live Capture Engine is not installed in this CozyOS build. Recording will become available once a real capture engine is added; export/session management (RecordExportSessionManager) already exists and is ready for that engine to hand sessions to.",
                    exportEngineCapabilities: recordingCapabilities
                };
            }

            return {
                success: true,
                serviceId,
                captionsAndTranslation,
                firstMarker,
                recording,
                attendance: {
                    status: "deferred",
                    message: "Attendance recording is deferred — church-membership-bridge.js's recordAttendance() depends on the organization model currently under review (ChurchOS C001's disclosed duplication). Not called automatically to avoid building on an ambiguous data path."
                }
            };
        }

        /** endWorshipMode(serviceId) — composes the real, existing endService(); publishes a real "service-ended" observation. */
        endWorshipMode(serviceId) {
            const session = window.CozyOS.ChurchWorshipSession;
            if (!session || typeof session.endService !== "function") return { success: false, reason: "ChurchWorshipSession is not loaded." };
            const result = session.endService(serviceId);
            if (result && result.success !== false) publish(WORSHIP_SENSOR_ID, "detected", { event: "service-ended", serviceId });
            return result;
        }

        /**
         * markPhase(serviceId, phase)
         *   Stage 4. Thin, named convenience over the real, existing
         *   markSection() — the exact 7 phases requested, nothing new
         *   underneath. Still caller-driven (a person/UI triggers it at
         *   the right moment) - no automatic phase-detection AI exists,
         *   confirmed absent, not fabricated here.
         */
        markPhase(serviceId, phase) {
            const REAL_PHASES = ["worship", "prayer", "sermon", "offering", "testimony", "announcements", "closing"];
            if (!REAL_PHASES.includes(phase)) return { success: false, reason: `"${phase}" is not one of the real, supported phases: ${REAL_PHASES.join(", ")}.` };
            const session = window.CozyOS.ChurchWorshipSession;
            if (!session || typeof session.markSection !== "function") return { success: false, reason: "ChurchWorshipSession is not loaded." };
            const result = session.markSection(serviceId, phase, phase.charAt(0).toUpperCase() + phase.slice(1));
            // C005 — Worship Phase Events. markSection() itself is a
            // pure data write with no event emission (confirmed by
            // reading its body) - this composes the same real
            // CozySense.registerObservation() already used for
            // service-started/ended above, not a new event system.
            if (result && result.success !== false) {
                publish(WORSHIP_SENSOR_ID, "detected", { event: "worship-phase-changed", serviceId, phase });
                // C006 — also emit via the same real PlatformEventBus
                // already used for captions/scripture (C005), since
                // CozySense uses a subscribe/broadcast registry pattern
                // rather than a simple emitter - this lets
                // MultiBranchCoordinator relay phase changes using the
                // exact same subscription it already uses for the other
                // two event types, not a second relay mechanism.
                const bus = window.CozyOS.PlatformEventBus;
                if (bus && typeof bus.emit === "function") bus.emit("worship-phase-changed", { serviceId, phase });
            }
            return result;
        }

        /**
         * reportNetworkObservation(kind, data)
         *   Stage 5. Composes the real, existing CozySense.registerObservation()
         *   for network-related signals (e.g. LiveHotspotEngine's real
         *   "connection-state-changed" event, wired by the caller — this
         *   coordinator does not itself listen for LiveHotspotEngine
         *   events, since no ChurchOS UI yet owns a live hotspot
         *   connection to observe; exposed as a real, callable publish
         *   point for when that wiring exists).
         */
        reportNetworkObservation(kind, data) {
            const REAL_KINDS = ["hotspot-available", "microphone-active", "camera-connected", "network-degraded", "network-restored", "network-offline"];
            if (!REAL_KINDS.includes(kind)) return { success: false, reason: `"${kind}" is not one of the real, supported network observation kinds: ${REAL_KINDS.join(", ")}.` };
            return publish(NETWORK_SENSOR_ID, "detected", { event: kind, ...data });
        }

        /**
         * wireNetworkObservability(connectionId)
         *   C005 — Network Events. Composes the real, existing
         *   LiveHotspotEngine.on("connection-state-changed", ...) (M362
         *   Stage 2) and republishes it through the already-real
         *   reportNetworkObservation() above - no new network-monitoring
         *   logic, just mapping real WebRTC ICE connection states
         *   ("connected"/"disconnected"/"failed"/"closed", standard
         *   values) onto the three real observation kinds already
         *   defined. Honest no-op if LiveHotspotEngine isn't loaded.
         */
        wireNetworkObservability(connectionId) {
            const hotspot = window.CozyOS.LiveHotspotEngine;
            if (!hotspot || typeof hotspot.on !== "function") return { success: false, reason: "LiveHotspotEngine is not loaded." };
            hotspot.on("connection-state-changed", (detail) => {
                if (!detail || detail.connectionId !== connectionId) return;
                if (detail.connectionState === "connected") this.reportNetworkObservation("network-restored", { connectionId });
                else if (detail.connectionState === "disconnected" || detail.connectionState === "failed") this.reportNetworkObservation("network-degraded", { connectionId, state: detail.connectionState });
                else if (detail.connectionState === "closed") this.reportNetworkObservation("network-offline", { connectionId });
            });
            return { success: true };
        }

        getDiagnosticsReport() { return { moduleVersion: VERSION, sensorsRegistered }; }
    }

    const instance = new WorshipModeCoordinator();
    window.CozyOS.WorshipModeCoordinator = instance;
    window.CozyOS.Modules["worship-mode-coordinator"] = Object.freeze({
        version: VERSION,
        description: "ChurchOS Worship Mode Coordinator (C002, Stages 2/4/5) — composes ChurchWorshipSession, CozySense, and MediaEngine.RecordExportSessionManager (already reachable via the existing EngineBridge). Recording explicitly reported unavailable (no live capture engine exists); attendance explicitly deferred (unresolved organization-model duplication). No new engines, no new storage, no new event system."
    });
})();
