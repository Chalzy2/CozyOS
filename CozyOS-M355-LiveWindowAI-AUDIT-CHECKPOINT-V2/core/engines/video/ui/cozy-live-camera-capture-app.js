/**
 * CozyOS — Live Camera Capture Application
 * File Reference: core/engines/video/ui/cozy-live-camera-capture-app.js
 * Repair: RP-035 Section 14
 *
 * Baseline: CozyOS-main-RP-035-Section13-LiveConnectivity.zip
 * SHA-256 fe599e95c461f85d0809917cf4a304a8840b911a9ad7f2a44617c0d4081f7ffa
 *
 * OWNERSHIP / COMPOSITION — no duplicated engine
 *   LiveVideoCapture (core/engines/video/live-video-capture-engine.js,
 *     window.CozyOS.LiveVideoCapture) — sole camera/recording
 *     authority; this file only calls its real startPreview/
 *     stopPreview/pausePreview/resumePreview/switchCamera/
 *     capturePhoto/startRecording/stopRecording/pauseRecording/
 *     resumeRecording/getDevices/getCapabilities/getStatus. No new
 *     getUserMedia/MediaRecorder logic exists in this file.
 *   CozyLivingConnectivity (RP-033 Gate 1, already composed in
 *     Section 13) — sole camera/microphone permission-state
 *     authority; this file reads its real detectCapabilities().camera/
 *     .microphone entries (AVAILABLE/PARTIAL/UNAVAILABLE/
 *     CAPABILITY_UNAVAILABLE/REQUIRES_USER_ACTION/
 *     REQUIRES_NATIVE_COMPANION) rather than inventing a second
 *     capability-detection source.
 *   ServiceRegistry.registerApplication() / IdentityEngine — sole
 *     application-registry and authorization mechanisms.
 *
 * EXPLICITLY NOT REPAIRED
 *   core/engines/camera/camera-manager.js and
 *   core/engines/audio/audio-manager.js are real files but ES
 *   modules (`export default`) that never register
 *   window.CozyOS.CameraEngine/AudioManager. live-capture-engine.js's
 *   claim to compose them is a disclosed, pre-existing mismatch —
 *   recorded in the repair queue, not fixed here, and NOT the
 *   foundation this file composes. LiveVideoCapture already falls
 *   through this mismatch gracefully on its own (see its getDevices()
 *   try/catch around the dynamic import of camera-manager.js).
 *
 * CAPTURE / CLARITY BOUNDARY — HARD LINE
 *   This file performs capture only: preview, photo, recording,
 *   device/permission/capability reporting. It contains NO image
 *   processing, enhancement, sharpening, denoising, HDR, fusion,
 *   alignment, super-resolution, face/subject reconstruction, OCR, or
 *   face recognition — none of that exists anywhere below. A captured
 *   photo/video is handed back to the caller as real raw output
 *   (`dataUrl`/`blob`) with a `clarityProcessed: false` marker, so a
 *   future Section 15 Camera Clarity Engine can consume it without
 *   this file ever needing to be rewritten.
 *
 * VISIBILITY DECISION (explicit, not silent)
 *   Same discipline as Section 13: this application is registered
 *   through ServiceRegistry but is NOT granted BUILT_IN here. The
 *   Section 14 spec gave no core-visibility instruction, so it stays
 *   admin-assignable.
 *
 * NO FABRICATION
 *   Permission/capability states are read verbatim from the real
 *   engines. This file never upgrades REQUIRES_USER_ACTION to
 *   AVAILABLE, never claims a camera is connected without a real
 *   successful startPreview(), and never claims SYNCED for captured
 *   media — offline capture is reported LOCAL_ONLY unless a real
 *   sync mechanism confirms otherwise.
 */
(function (root) {
    "use strict";

    const VERSION = "1.0.0";
    const APP_ID = "live_camera_capture_001";
    const APP_NAME = "live-camera-capture";

    function cozyOS() { return root.window.CozyOS; }
    function capture() { const c = cozyOS(); return (c && c.LiveVideoCapture) || null; }
    function living() { const c = cozyOS(); return (c && c.CozyLivingConnectivity) || null; }
    function serviceRegistry() { const c = cozyOS(); return (c && c.ServiceRegistry) || null; }
    function identity() { const c = cozyOS(); return (c && c.IdentityEngine) || null; }

    // -----------------------------------------------------------------
    // 1. CAPABILITY / PERMISSION STATE — composed, never re-detected
    // -----------------------------------------------------------------

    function getCameraCapabilityStatus() {
        const eng = living();
        const cap = capture();
        if (!eng && !cap) return { status: "CAPABILITY_UNAVAILABLE", camera: null, microphone: null, engine: null };

        const report = eng ? eng.detectCapabilities() : {};
        const cameraEntry = report.camera || { status: "CAPABILITY_UNAVAILABLE", reason: "CozyLivingConnectivity not loaded.", source: null };
        const microphoneEntry = report.microphone || { status: "CAPABILITY_UNAVAILABLE", reason: "CozyLivingConnectivity not loaded.", source: null };
        const engineCaps = cap ? cap.getCapabilities() : { getUserMedia: false, mediaRecorder: false, supportedMimeTypes: [] };

        return {
            status: "OK",
            camera: cameraEntry,
            microphone: microphoneEntry,
            engine: {
                getUserMedia: engineCaps.getUserMedia,
                mediaRecorder: engineCaps.mediaRecorder,
                supportedMimeTypes: engineCaps.supportedMimeTypes
            }
        };
    }

    // -----------------------------------------------------------------
    // 2. DEVICE LIST — real, composed only
    // -----------------------------------------------------------------

    async function getDevices() {
        const cap = capture();
        if (!cap) return { status: "CAPABILITY_UNAVAILABLE", devices: [] };
        const devices = await cap.getDevices();
        return { status: "OK", devices };
    }

    // -----------------------------------------------------------------
    // 3. PREVIEW LIFECYCLE — thin passthrough only
    // -----------------------------------------------------------------

    async function startPreview(videoElement, opts) {
        const cap = capture();
        if (!cap) return { success: false, status: "CAPABILITY_UNAVAILABLE" };
        return cap.startPreview(videoElement, opts || {});
    }
    function stopPreview() {
        const cap = capture();
        if (!cap) return { success: false, status: "CAPABILITY_UNAVAILABLE" };
        return cap.stopPreview();
    }
    function pausePreview() {
        const cap = capture();
        if (!cap) return { success: false, status: "CAPABILITY_UNAVAILABLE" };
        return cap.pausePreview();
    }
    function resumePreview() {
        const cap = capture();
        if (!cap) return { success: false, status: "CAPABILITY_UNAVAILABLE" };
        return cap.resumePreview();
    }
    async function switchCamera(deviceId) {
        const cap = capture();
        if (!cap) return { success: false, status: "CAPABILITY_UNAVAILABLE" };
        return cap.switchCamera(deviceId);
    }

    // -----------------------------------------------------------------
    // 4. PHOTO CAPTURE — raw output only, never clarity-processed
    // -----------------------------------------------------------------

    async function capturePhoto() {
        const cap = capture();
        if (!cap) return { success: false, status: "CAPABILITY_UNAVAILABLE" };
        const result = await cap.capturePhoto();
        if (!result.success) return result;
        // Explicit, honest marker for the future Section 15 boundary —
        // this file never sets this to true anywhere.
        return Object.assign({}, result, { clarityProcessed: false, syncState: "LOCAL_ONLY" });
    }

    // -----------------------------------------------------------------
    // 5. RECORDING LIFECYCLE — thin passthrough only
    // -----------------------------------------------------------------

    function startRecording(opts) {
        const cap = capture();
        if (!cap) return { success: false, status: "CAPABILITY_UNAVAILABLE" };
        return cap.startRecording(opts || {});
    }
    async function stopRecording() {
        const cap = capture();
        if (!cap) return { success: false, status: "CAPABILITY_UNAVAILABLE" };
        const result = await cap.stopRecording();
        if (!result.success) return result;
        return Object.assign({}, result, { clarityProcessed: false, syncState: "LOCAL_ONLY" });
    }
    function pauseRecording() {
        const cap = capture();
        if (!cap) return { success: false, status: "CAPABILITY_UNAVAILABLE" };
        return cap.pauseRecording();
    }
    function resumeRecording() {
        const cap = capture();
        if (!cap) return { success: false, status: "CAPABILITY_UNAVAILABLE" };
        return cap.resumeRecording();
    }

    // -----------------------------------------------------------------
    // 6. STATUS — real state machine only
    // -----------------------------------------------------------------

    function getStatus() {
        const cap = capture();
        if (!cap) return { status: "CAPABILITY_UNAVAILABLE" };
        return Object.assign({ status: "OK" }, cap.getStatus());
    }

    // -----------------------------------------------------------------
    // 7. DASHBOARD REGISTRATION — visibility stays an explicit,
    //    separate decision; NOT auto-registered BUILT_IN.
    // -----------------------------------------------------------------

    function registerAsApplication() {
        const sr = serviceRegistry();
        if (!sr || typeof sr.registerApplication !== "function") return { serviceRegistry: "CAPABILITY_UNAVAILABLE" };
        try {
            sr.registerApplication({
                id: APP_ID, name: "Live Camera Capture", version: VERSION, category: "Media",
                description: "RP-035 Section 14 — real camera preview/photo/recording capture composing LiveVideoCapture. Capture only; no image enhancement of any kind. Future Section 15 Camera Clarity Engine consumes this output without requiring this file to change."
            });
            return { serviceRegistry: "REGISTERED" };
        } catch (e) { return { serviceRegistry: "FAILED" }; }
    }

    // -----------------------------------------------------------------
    // 8. CAPABILITY REGISTRY — truthful only
    // -----------------------------------------------------------------

    function getCapabilityStatus() {
        const camCap = getCameraCapabilityStatus();
        return {
            cameraCapture: capture() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            cameraPermission: camCap.status === "OK" ? camCap.camera.status : "CAPABILITY_UNAVAILABLE",
            microphonePermission: camCap.status === "OK" ? camCap.microphone.status : "CAPABILITY_UNAVAILABLE",
            photoCapture: capture() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            videoRecording: (camCap.status === "OK" && camCap.engine.mediaRecorder) ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            cameraSwitching: capture() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            // Explicitly, permanently unavailable in Section 14 — belongs
            // to the future Section 15 Camera Clarity Engine.
            superResolution: "CAPABILITY_UNAVAILABLE",
            denoising: "CAPABILITY_UNAVAILABLE",
            hdrProcessing: "CAPABILITY_UNAVAILABLE",
            multiFrameFusion: "CAPABILITY_UNAVAILABLE",
            aiEnhancement: "CAPABILITY_UNAVAILABLE",
            faceRecognition: "CAPABILITY_UNAVAILABLE",
            ocr: "CAPABILITY_UNAVAILABLE",
            dashboardVisibility: (identity() && identity().isCoreApplication(APP_NAME)) ? "BUILT_IN" : "NOT_CORE"
        };
    }

    // -----------------------------------------------------------------
    // 9. PUBLIC API
    // -----------------------------------------------------------------

    const api = Object.freeze({
        getVersion: () => VERSION,
        APP_ID, APP_NAME,
        getCameraCapabilityStatus,
        getDevices,
        startPreview,
        stopPreview,
        pausePreview,
        resumePreview,
        switchCamera,
        capturePhoto,
        startRecording,
        stopRecording,
        pauseRecording,
        resumeRecording,
        getStatus,
        registerAsApplication,
        getCapabilityStatus
    });

    root.window.CozyOS = root.window.CozyOS || {};
    root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
    if (!root.window.CozyOS.Modules["cozy-live-camera-capture-app"]) {
        root.window.CozyOS.CozyLiveCameraCaptureApp = api;
        root.window.CozyOS.Modules["cozy-live-camera-capture-app"] = Object.freeze({
            version: VERSION,
            api,
            description: "RP-035 Section 14 — Live Camera Capture application. Composes LiveVideoCapture + RP-033 Gate 1 camera/microphone detection + ServiceRegistry + IdentityEngine real APIs only. Capture only — no image enhancement of any kind; Section 15 Camera Clarity Engine remains completely separate."
        });
    }
    if (root.window.CozyOS.ServiceRegistry && typeof root.window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            root.window.CozyOS.ServiceRegistry.registerCoordinator({
                id: "cozy-live-camera-capture-app",
                version: VERSION,
                description: "RP-035 Section 14 Live Camera Capture application coordinator."
            });
        } catch (e) { /* registry optional */ }
    }
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
