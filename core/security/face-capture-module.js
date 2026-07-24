/**
 * CozyOS Face Capture Module
 * File Reference: core/security/face-capture-module.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 145 — Face Backend Integration
 *
 * ============================================================
 * OWNERSHIP
 * ============================================================
 * Owns: real browser camera acquisition (navigator.mediaDevices.
 *   getUserMedia), live video stream lifecycle, and frame capture
 *   (canvas snapshot -> base64 image) for the "face" factor only.
 * Does NOT own: face detection, face matching, face recognition,
 *   liveness detection, or any verification decision. This file
 *   captures a real image; it never claims to identify anyone in it.
 * Does NOT own: the general camera registry/adapter bookkeeping —
 *   that is CozyCamera's (core/modules/camera/cozy-camera.js), which
 *   explicitly never drives a camera itself. This file is exactly the
 *   kind of adapter CozyCamera's own header describes: the real driver
 *   registers a plain-data descriptor with CozyCamera.Adapters for
 *   discoverability, then performs the real work itself, outside the
 *   registry (functions are rejected by CozyCamera's security choke
 *   point at any nesting level, by design).
 * Registers: ServiceRegistry; CozyCamera.Adapters (descriptor only,
 *   best-effort, non-fatal if CozyCamera is not loaded).
 * Consumes: none. Does not call FaceProvider.registerBackend() itself
 *   — see HONEST LIMITATION below.
 *
 * HONEST LIMITATION (why this file does not wire into FaceProvider)
 *   FaceProvider.registerBackend(realVerifyFn) expects a function that
 *   makes a genuine verified/not-verified decision. This module can
 *   capture a real frame from a real camera, but it contains no face
 *   detection or face-matching model — building one honestly requires
 *   either a real trained model (e.g. a landmark/embedding network) or
 *   a server-side match, and neither is available in this static,
 *   offline, no-network environment. Rather than fabricate a matching
 *   function that always "verifies" or compares pixels superficially,
 *   this file stops at real capture and leaves FaceProvider's
 *   registerBackend() hook untouched — AuthFactorRegistry continues to
 *   honestly report `face: isReal:false` until a genuine matching
 *   backend is plugged in by a future, explicitly-scoped milestone.
 *
 * SECURITY
 *   Requests camera permission only inside startCapture(), never on
 *   load. Always stops all MediaStreamTracks in stopCapture() / on
 *   error, so no dangling camera indicator is left active. Frames are
 *   returned to the caller and never persisted, transmitted, or logged
 *   by this file.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const FACE_CAPTURE_VERSION = "1.0.0-ENTERPRISE";

    if (window.CozyOS.FaceCaptureModule && typeof window.CozyOS.FaceCaptureModule.getVersion === "function") {
        const existingVersion = window.CozyOS.FaceCaptureModule.getVersion();
        if (existingVersion !== FACE_CAPTURE_VERSION) {
            throw new Error(`[CozyOS] VERSION_CONFLICT: FaceCaptureModule existing v${existingVersion} conflicts with load target v${FACE_CAPTURE_VERSION}.`);
        }
        return; // same version already loaded — state-preserving no-op
    }

    class CozyFaceCaptureModule {
        #stream = null;
        #history = [];

        getVersion() { return FACE_CAPTURE_VERSION; }

        #logHistory(event, detail) {
            this.#history.push({ event, at: new Date(Date.now()).toISOString(), detail: detail || null });
            if (this.#history.length > 200) this.#history.shift();
        }
        #emit(eventName, detail) {
            this.#logHistory(eventName, detail);
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`face-capture:${eventName}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }
        getHistory() { return this.#history.slice(); }

        /** isSupported() — real, honest capability check. Never assumes. */
        isSupported() {
            return typeof navigator !== "undefined" &&
                !!navigator.mediaDevices &&
                typeof navigator.mediaDevices.getUserMedia === "function";
        }

        /**
         * startCapture(constraints?)
         *   Requests real camera access. Returns the honest result —
         *   never fabricates success. Caller is responsible for
         *   attaching the returned stream to a <video> element if a
         *   live preview is needed.
         */
        async startCapture(constraints) {
            if (!this.isSupported()) {
                const result = { success: false, reason: "Camera API (getUserMedia) is not available in this environment." };
                this.#emit("start-failed", result);
                return result;
            }
            if (this.#stream) {
                return { success: false, reason: "Capture already active. Call stopCapture() first." };
            }
            try {
                const media = await navigator.mediaDevices.getUserMedia(
                    constraints || { video: { facingMode: "user" }, audio: false }
                );
                this.#stream = media;
                this.#emit("started", { trackCount: media.getVideoTracks().length });
                return { success: true, stream: media };
            } catch (err) {
                const result = { success: false, reason: `Real getUserMedia rejection: ${err && err.message ? err.message : String(err)}` };
                this.#emit("start-failed", result);
                return result;
            }
        }

        /**
         * captureFrame(videoEl)
         *   Draws the current frame of an already-playing <video>
         *   element (fed by this.#stream) onto a canvas and returns a
         *   real base64 PNG. This is a real image capture — it is NOT
         *   a verification result and makes no claim about identity.
         */
        captureFrame(videoEl) {
            if (!this.#stream) {
                return { success: false, reason: "No active capture. Call startCapture() first." };
            }
            if (!videoEl || typeof videoEl.videoWidth !== "number" || videoEl.videoWidth === 0) {
                return { success: false, reason: "videoEl must be a <video> element currently playing this module's stream." };
            }
            try {
                const canvas = document.createElement("canvas");
                canvas.width = videoEl.videoWidth;
                canvas.height = videoEl.videoHeight;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                const imageDataUrl = canvas.toDataURL("image/png");
                const result = {
                    success: true,
                    imageDataUrl,
                    width: canvas.width,
                    height: canvas.height,
                    capturedAt: new Date(Date.now()).toISOString(),
                    note: "Real captured frame. No face detection or matching has been performed on it."
                };
                this.#emit("frame-captured", { width: result.width, height: result.height });
                return result;
            } catch (err) {
                const result = { success: false, reason: `Real canvas capture failed: ${err && err.message ? err.message : String(err)}` };
                this.#emit("frame-capture-failed", result);
                return result;
            }
        }

        /** stopCapture() — always stops every real track; safe to call even if nothing is active. */
        stopCapture() {
            if (!this.#stream) return { success: true, reason: "No active capture." };
            try {
                this.#stream.getTracks().forEach((track) => track.stop());
            } finally {
                this.#stream = null;
            }
            this.#emit("stopped", {});
            return { success: true };
        }

        getDiagnosticsReport() {
            return {
                moduleVersion: FACE_CAPTURE_VERSION,
                supported: this.isSupported(),
                captureActive: this.#stream !== null,
                historyEntries: this.#history.length
            };
        }

        getIntegrationManifest() {
            return {
                ownership: {
                    owns: ["real camera acquisition for face capture", "live stream lifecycle", "frame-to-image capture"],
                    doesNotOwn: ["face detection", "face matching/recognition", "liveness detection", "verification decisions", "general camera registry (owned by CozyCamera)"]
                },
                uses: ["navigator.mediaDevices.getUserMedia (browser)", "PlatformEventBus", "CozyCamera.Adapters (registry descriptor only)"],
                registers: ["ServiceRegistry", "CozyCamera.Adapters (best-effort)"],
                publishes: ["face-capture:started", "face-capture:start-failed", "face-capture:frame-captured", "face-capture:frame-capture-failed", "face-capture:stopped"],
                consumes: [],
                security: {
                    failClosed: "isSupported()/startCapture() never assume camera availability; both report real, honest failures.",
                    honestLimitation: "This module performs no face detection or matching. FaceProvider.registerBackend() is intentionally NOT called from this file — see HONEST LIMITATION in the file header."
                }
            };
        }
    }

    window.CozyOS.FaceCaptureModule = new CozyFaceCaptureModule();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "FaceCaptureModule", category: "Platform", icon: "camera.svg",
                description: "Real browser camera capture for face enrollment/verification frames. Performs no face detection or matching — honest capture only. Does not register a FaceProvider backend."
            });
        } catch (_err) { /* non-fatal */ }
    }

    // Best-effort, plain-data-only descriptor registration with CozyCamera's
    // adapter registry, per Rule 48 (extend, never duplicate, the existing
    // camera coordinator). No function values are included — CozyCamera's
    // security choke point rejects them at any nesting level, and this
    // module's real behavior lives entirely in this file regardless.
    if (window.CozyOS.Camera && window.CozyOS.Camera.Adapters && typeof window.CozyOS.Camera.Adapters.register === "function") {
        try {
            window.CozyOS.Camera.Adapters.register({
                id: "face-capture-module",
                name: "FaceCaptureModule",
                capability: "face-frame-capture",
                driver: "browser-getUserMedia",
                performsFaceMatching: false
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
