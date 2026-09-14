/**
 * CozyOS Learning Camera Adapter
 * File Reference: core/modules/learning/learning-camera-adapter.js
 *
 * ============================================================
 * OWNERSHIP
 * ============================================================
 * Owns: real browser camera acquisition (navigator.mediaDevices.
 *   getUserMedia), live video stream lifecycle, and frame capture
 *   (canvas snapshot -> base64 image) for LEARNING/EDUCATIONAL
 *   observation only.
 * Does NOT own: OCR, text extraction, object detection, face
 *   detection/matching, or any verification decision. This file
 *   captures a real image; it never claims to have read or understood
 *   anything in it.
 * Does NOT own: the general camera registry/adapter bookkeeping —
 *   that is CozyCamera's (core/modules/camera/cozy-camera.js), which
 *   explicitly never drives a camera itself. This file is exactly the
 *   kind of adapter CozyCamera's own header describes: the real driver
 *   registers a plain-data descriptor with window.CozyOS.Camera.Adapters
 *   for discoverability, then performs the real work itself, outside
 *   the registry (functions are rejected by CozyCamera's security
 *   choke point at any nesting level, by design).
 * Does NOT own: OCREngine, UniversalLearningPipeline, or
 *   MultimodalObservationCore — those remain their own existing,
 *   real, unmodified owners; this file only calls their already-public
 *   methods.
 * Registers: window.CozyOS.Camera.Adapters (descriptor only,
 *   best-effort, non-fatal if CozyCamera is not loaded).
 *
 * REAL AUDIT — WHY THIS FILE EXISTS RATHER THAN REUSING
 * core/security/face-capture-module.js
 *   face-capture-module.js already proves the exact real pattern this
 *   file needs (getUserMedia -> real stream -> canvas frame capture ->
 *   CozyCamera.Adapters registration) and was read in full before
 *   writing this file. It is not reused directly because it is
 *   explicitly, narrowly scoped to biometric face-capture (its own
 *   header: "Owns: ... for the 'face' factor only") and is a
 *   security-layer module (core/security/), not a learning-layer one.
 *   Repurposing it would mean either weakening its documented scope or
 *   silently overloading a security module for an unrelated purpose —
 *   this file instead follows the SAME proven pattern independently,
 *   in the learning layer where it belongs, with zero dependency on
 *   FaceCaptureModule (verified: this file does not reference it).
 *
 * HONEST LIMITATION — THE OCR BOUNDARY
 *   captureForLearning() below calls the existing
 *   UniversalLearningPipeline.learnFromOCR() with the real captured
 *   frame. That method's own honest gate (already true before this
 *   file existed) reports OCR as unavailable whenever OCREngine is not
 *   actually loaded — which is the case on every ordinary user-facing
 *   page today (confirmed: OCREngine is not loaded in index.html or
 *   dashboard.html). This file does NOT pretend otherwise: a
 *   successful camera capture with OCR unavailable is reported as
 *   exactly that — real capture, honestly-unavailable OCR — never as
 *   "text was extracted."
 *
 * SECURITY
 *   Requests camera permission only inside startCapture(), never on
 *   load. Always stops all MediaStreamTracks in stopCapture() / on
 *   error, so no dangling camera indicator is left active. Frames are
 *   returned to the caller and never persisted, transmitted, or logged
 *   by this file — only handed to the caller and, if the caller opts
 *   into captureForLearning(), to the existing learning pipeline.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const LEARNING_CAMERA_ADAPTER_VERSION = "1.0.0";

    if (window.CozyOS.LearningCameraAdapter && typeof window.CozyOS.LearningCameraAdapter.getVersion === "function") {
        const existingVersion = window.CozyOS.LearningCameraAdapter.getVersion();
        if (existingVersion !== LEARNING_CAMERA_ADAPTER_VERSION) {
            throw new Error(`[CozyOS] VERSION_CONFLICT: LearningCameraAdapter existing v${existingVersion} conflicts with load target v${LEARNING_CAMERA_ADAPTER_VERSION}.`);
        }
        return; // same version already loaded — state-preserving no-op
    }

    class CozyLearningCameraAdapter {
        #stream = null;
        #history = [];

        getVersion() { return LEARNING_CAMERA_ADAPTER_VERSION; }

        #logHistory(event, detail) {
            this.#history.push({ event, at: new Date(Date.now()).toISOString(), detail: detail || null });
            if (this.#history.length > 200) this.#history.shift();
        }
        #emit(eventName, detail) {
            this.#logHistory(eventName, detail);
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`learning-camera:${eventName}`, detail); } catch (_err) { /* non-fatal */ }
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
         *   live preview is needed. Defaults to the rear/environment
         *   camera where available — a learning capture (a book, a
         *   screen, a sign) is far more often something the user points
         *   the device AT than a selfie, distinct from
         *   face-capture-module.js's front-facing default.
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
                    constraints || { video: { facingMode: "environment" }, audio: false }
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
         *   OCR and makes no claim about any text/object it might
         *   contain.
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
                    note: "Real captured frame. No OCR/text-extraction has been performed on it."
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

        /**
         * captureForLearning(videoEl, { context })
         *   The real CONNECT-TO-PIPELINE boundary: captures a real
         *   frame (captureFrame() above), then — only if
         *   UniversalLearningPipeline.learnFromOCR() is actually
         *   available and OCREngine is actually loaded — attempts real
         *   OCR on it. Every branch is an honestly labeled outcome:
         *     stage: "capture-failed"   — captureFrame() itself failed
         *     stage: "capture-only"     — real frame captured, OCR was
         *                                 not attempted (pipeline not
         *                                 loaded) or was attempted and
         *                                 is genuinely unavailable
         *                                 (OCREngine not loaded / still
         *                                 a stub)
         *     stage: "capture-and-ocr"  — real frame captured AND real
         *                                 OCR text was genuinely
         *                                 extracted
         *   Never returns stage:"capture-and-ocr" unless
         *   learnFromOCR() itself reported success:true — this file
         *   adds no independent claim about OCR working.
         */
        async captureForLearning(videoEl, { context = null } = {}) {
            const frame = this.captureFrame(videoEl);
            if (!frame.success) return { success: false, stage: "capture-failed", reason: frame.reason };

            const pipeline = window.CozyOS.UniversalLearningPipeline;
            if (!pipeline || typeof pipeline.learnFromOCR !== "function") {
                return { success: true, stage: "capture-only", frame, context, ocr: { attempted: false, reason: "UniversalLearningPipeline is not loaded." } };
            }
            const ocrResult = await pipeline.learnFromOCR(frame.imageDataUrl);
            if (!ocrResult.success) {
                return { success: true, stage: "capture-only", frame, context, ocr: { attempted: true, available: false, reason: ocrResult.reason } };
            }
            return { success: true, stage: "capture-and-ocr", frame, context, ocr: { attempted: true, available: true, extracted: ocrResult.extracted } };
        }

        getDiagnosticsReport() {
            return {
                moduleVersion: LEARNING_CAMERA_ADAPTER_VERSION,
                supported: this.isSupported(),
                captureActive: this.#stream !== null,
                historyEntries: this.#history.length
            };
        }

        getIntegrationManifest() {
            return {
                ownership: {
                    owns: ["real camera acquisition for learning observation", "live stream lifecycle", "frame-to-image capture", "the honest camera->OCR boundary via captureForLearning()"],
                    doesNotOwn: ["OCR/text extraction", "object detection", "face detection/matching", "general camera registry (owned by CozyCamera)", "learning/verification decisions (owned by UniversalLearningPipeline)"]
                },
                uses: ["navigator.mediaDevices.getUserMedia (browser)", "PlatformEventBus", "window.CozyOS.Camera.Adapters (registry descriptor only)", "UniversalLearningPipeline.learnFromOCR() (optional, honest no-op if unavailable)"],
                registers: ["window.CozyOS.Camera.Adapters (best-effort)"],
                publishes: ["learning-camera:started", "learning-camera:start-failed", "learning-camera:frame-captured", "learning-camera:frame-capture-failed", "learning-camera:stopped"],
                consumes: [],
                security: {
                    failClosed: "isSupported()/startCapture() never assume camera availability; both report real, honest failures.",
                    honestLimitation: "captureForLearning() never claims OCR succeeded unless UniversalLearningPipeline.learnFromOCR() itself reports success:true."
                }
            };
        }
    }

    window.CozyOS.LearningCameraAdapter = new CozyLearningCameraAdapter();

    // Best-effort, plain-data-only descriptor registration with CozyCamera's
    // adapter registry — same real contract face-capture-module.js already
    // proved. No function values are included — CozyCamera's security choke
    // point rejects them at any nesting level, and this module's real
    // behavior lives entirely in this file regardless.
    if (window.CozyOS.Camera && window.CozyOS.Camera.Adapters && typeof window.CozyOS.Camera.Adapters.register === "function") {
        try {
            window.CozyOS.Camera.Adapters.register({
                id: "learning-camera-adapter",
                name: "LearningCameraAdapter",
                capability: "learning-frame-capture",
                driver: "browser-getUserMedia",
                performsOCR: false
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
