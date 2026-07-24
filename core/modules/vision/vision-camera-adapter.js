/**
 * ── CozyOS — Vision Camera Adapter (Milestone 139) ──
 * FILE: core/modules/vision/vision-camera-adapter.js
 * VERSION: 1.0.0
 *
 * PURPOSE
 * -------
 * Backs Vision's "camera" provider slot by delegating to the canonical
 * Camera Engine — core/engines/camera/camera-manager.js — LOCKED as the
 * single owner of camera hardware per Milestone 138. This adapter owns
 * NOTHING itself: no device access, no capture logic, no fabricated
 * results. It only calls CameraManager's real, existing API and passes
 * back exactly what it reports (Rule 6 — Honest Engineering).
 *
 * DISCLOSED CONSTRAINT
 * ---------------------
 * core/engines/camera/camera-manager.js is an ES module (`export default`).
 * dashboard.html currently loads no `type="module"` scripts, so this file
 * — itself a plain classic script, consistent with every other CozyOS
 * coordinator — loads CameraManager via a dynamic import() (valid inside
 * classic <script> tags in modern browsers) instead of requiring a
 * dashboard.html script-tag/type change. No existing script tags or load
 * order were touched.
 *
 * HONESTY NOTE
 * ------------
 * CameraManager ships with zero hardware-specific code and no default
 * connected camera (per its own header — it defines a provider interface,
 * not real device I/O). Until a real camera provider is registered with
 * CameraManager elsewhere, this adapter's open() will honestly report
 * "no active camera" rather than fabricate a preview.
 */
"use strict";

(function () {
    const ADAPTER_VERSION = "1.0.0";

    let _cameraManagerPromise = null;
    function _loadCameraManager() {
        if (!_cameraManagerPromise) {
            _cameraManagerPromise = import("../../engines/camera/camera-manager.js")
                .then((mod) => mod.default);
        }
        return _cameraManagerPromise;
    }

    const VisionCameraAdapter = {
        getVersion() { return ADAPTER_VERSION; },

        /**
         * @param {{mode: string, sessionId: string, requestId: string}} req
         * @returns {Promise<{success: boolean, reason?: string, cameraId?: string, previewHandle?: object}>}
         */
        async open(req) {
            let CameraManager;
            try {
                CameraManager = await _loadCameraManager();
            } catch (err) {
                return { success: false, reason: `Could not load CameraManager module: ${err && err.message ? err.message : String(err)}` };
            }

            const active = CameraManager.getActiveCamera();
            if (!active) {
                return {
                    success: false,
                    reason: "CameraManager reports no active camera. Register and connect a camera provider with CameraManager first — this adapter does not fabricate hardware access.",
                };
            }

            let previewHandle;
            try {
                previewHandle = CameraManager.previewCamera(active.id);
            } catch (err) {
                return { success: false, reason: `CameraManager.previewCamera() threw: ${err && err.message ? err.message : String(err)}` };
            }

            return { success: true, cameraId: active.id, mode: req && req.mode, previewHandle };
        },

        /**
         * @param {object} handle — the object previously returned by open()
         * @returns {Promise<{success: boolean, note?: string}>}
         */
        async close(_handle) {
            // CameraManager's current public API (Milestone 138 review) has no
            // "stop preview" / teardown method — previewCamera() returns a
            // descriptor, not a live stream handle. Nothing to release yet;
            // disclosed rather than fabricated. Revisit if CameraManager gains
            // a teardown method in a future milestone.
            return { success: true, note: "CameraManager exposes no preview-teardown method yet — nothing to release." };
        },

        /**
         * @returns {Promise<{cameraCount: number, cameras: Array<object>}>}
         */
        async getCapabilities() {
            let CameraManager;
            try {
                CameraManager = await _loadCameraManager();
            } catch (err) {
                return { cameraCount: 0, cameras: [], error: err && err.message ? err.message : String(err) };
            }
            const cameras = CameraManager.listCameras();
            return {
                cameraCount: cameras.length,
                cameras: cameras.map((c) => ({ id: c.id, state: c.state, providerType: c.providerType })),
            };
        },
    };

    if (typeof window !== "undefined") {
        if (!window.CozyOS) window.CozyOS = {};
        window.CozyOS.VisionCameraAdapter = VisionCameraAdapter;

        function _tryRegister() {
            if (window.CozyOS.Vision && typeof window.CozyOS.Vision.registerProvider === "function") {
                try {
                    window.CozyOS.Vision.registerProvider("camera", VisionCameraAdapter);
                } catch (_err) { /* non-fatal — e.g. already registered on hot-reload */ }
                return true;
            }
            return false;
        }

        if (!_tryRegister() && typeof document !== "undefined") {
            // Vision's script tag must load before this one in dashboard.html,
            // but retry once on DOMContentLoaded as a defensive fallback,
            // matching the pattern used elsewhere in CozyOS (e.g. Vault).
            document.addEventListener("DOMContentLoaded", _tryRegister, { once: true });
        }
    }
})();
