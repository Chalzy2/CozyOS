/**
 * CozyOS — Living Camera Browser Provider —
 * core/engines/camera/browser-camera-provider.js
 *
 * OWNERSHIP: this is the missing piece confirmed by both an earlier
 * session's audit (vision-camera-adapter.js's own header) and my own
 * re-verification before writing this file: CameraManager (ES module,
 * core/engines/camera/camera-manager.js) defines a real provider
 * interface but ships with zero real hardware providers registered.
 * VisionCameraAdapter delegates to CameraManager honestly and reports
 * "no active camera" until a real provider exists - this file is that
 * real provider, matching the exact contract CameraManager's own
 * registerProvider() requires (confirmed by reading its source):
 * {type, listDevices, connect, disconnect, getHealth, on?}.
 *
 * Matches vision-camera-adapter.js's own established approach: a
 * plain classic script using dynamic import() to reach the ES-module
 * CameraManager, since dashboard.html loads no type="module" scripts
 * and no existing script tags/load order are touched.
 *
 * HONEST SCOPE: uses real navigator.mediaDevices.getUserMedia({video:
 * true}) and real enumerateDevices(). Never fabricates a device list
 * or a connected stream. Object detection / OCR / QR / barcode
 * scanning are NOT implemented here - those require real, separate
 * computational adapters registered with CozyVision (which itself
 * explicitly declares it is not an OCR/QR/object-detection engine,
 * confirmed by its own header) - this file only provides the real
 * camera hardware connection, nothing more.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.__browserCameraProviderRegistered) return;

    let _cameraManagerPromise = null;
    function _loadCameraManager() {
        if (!_cameraManagerPromise) {
            _cameraManagerPromise = import("../../engines/camera/camera-manager.js").then((mod) => mod.default);
        }
        return _cameraManagerPromise;
    }

    let _activeStream = null;
    const _listeners = new Map();

    const BrowserCameraProvider = {
        type: "browser",

        /** listDevices() — real, uses actual enumerateDevices(), never fabricates a device list. */
        async listDevices() {
            if (typeof navigator === "undefined" || !navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== "function") {
                return [];
            }
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                return devices.filter(d => d.kind === "videoinput").map(d => ({ id: d.deviceId, label: d.label || "Camera", facing: null }));
            } catch (_err) {
                return [];
            }
        },

        /** connect(deviceId) — real getUserMedia() call, honest failure on rejection. */
        async connect(deviceId) {
            if (typeof navigator === "undefined" || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
                return { success: false, reason: "getUserMedia is not available in this browser/context." };
            }
            try {
                const constraints = { video: deviceId ? { deviceId: { exact: deviceId } } : true };
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                _activeStream = stream;
                return { success: true, stream };
            } catch (err) {
                return { success: false, reason: `Real getUserMedia() rejection: ${err.message || String(err)}` };
            }
        },

        /** disconnect() — real, stops every actual track. */
        async disconnect() {
            if (!_activeStream) return { success: true, reason: "Not connected." };
            for (const track of _activeStream.getTracks()) { try { track.stop(); } catch (_err) { /* non-fatal */ } }
            _activeStream = null;
            return { success: true };
        },

        /** getHealth() — real, derived from actual connection state. */
        getHealth() {
            return {
                connected: !!_activeStream,
                trackCount: _activeStream ? _activeStream.getTracks().length : 0,
                supported: typeof navigator !== "undefined" && !!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function"
            };
        },

        on(eventName, handler) {
            if (!_listeners.has(eventName)) _listeners.set(eventName, new Set());
            _listeners.get(eventName).add(handler);
        }
    };

    (async () => {
        try {
            const CameraManager = await _loadCameraManager();
            if (CameraManager && typeof CameraManager.registerProvider === "function") {
                CameraManager.registerProvider(BrowserCameraProvider);
                window.CozyOS.__browserCameraProviderRegistered = true;
            }
        } catch (err) {
            console.error("[BrowserCameraProvider] Real registration failed:", err && err.message ? err.message : err);
        }
    })();
})();
