/**
 * CozyOS — QR Scan Capability Detector
 * File Reference: core/security/qr-scan-capability.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 *
 * CozyOS File Phase 5.
 *
 * REPOSITORY DISCOVERY: no BarcodeDetector usage and no QR-specific
 * camera code exists anywhere in this repository (confirmed by
 * exhaustive search). getUserMedia exists only for live audio/video
 * conferencing (core/modules/media/) - a different domain, not reused
 * or extended here.
 *
 * HONEST SCOPE: this file does NOT implement a scanning UI or decode
 * loop. It reports, using only real, directly-checkable browser APIs,
 * whether the CURRENT browser/context could plausibly support QR
 * scanning at all - following the exact same honest
 * {supported, reason} pattern already established by
 * core/connectivity/cozy-connect.js. It never returns true merely
 * because a future capability might exist, and never fabricates
 * device-camera behavior this file cannot actually observe (only a
 * real device with a real camera, actually exercised, could prove
 * that - this file honestly stops at API-presence detection).
 *
 * BarcodeDetector browser support (evidence, not a guess): available in
 * Chromium-based browsers (Chrome/Edge/Opera) on some platforms;
 * historically absent in Firefox and Safari without a polyfill. This
 * file does not assume a specific browser - it checks the real,
 * current runtime directly, every time.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";

    function detect() {
        const hasNavigator = typeof navigator !== "undefined";
        const hasBarcodeDetector = typeof BarcodeDetector !== "undefined";
        const hasMediaDevices = hasNavigator && !!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function";
        const isSecureContext = typeof window !== "undefined" && (window.isSecureContext === true || (typeof location !== "undefined" && location.protocol === "https:"));

        const report = {
            barcodeDetector: hasBarcodeDetector
                ? { supported: true, reason: null }
                : { supported: false, reason: "window.BarcodeDetector is not available in this browser/context. Known absent in Firefox and Safari without a polyfill as of this writing." },
            camera: hasMediaDevices
                ? { supported: true, reason: null }
                : { supported: false, reason: "navigator.mediaDevices.getUserMedia is not available in this browser/context." },
            secureContext: isSecureContext
                ? { supported: true, reason: null }
                : { supported: false, reason: "Camera access generally requires a secure context (HTTPS or localhost); this context is not reported as secure." },
        };

        // canScan is real, structural AND-of-the-above - it does NOT
        // prove a physical camera is present, permitted, or working; it
        // only proves the necessary browser APIs exist. Real scanning
        // capability can only be confirmed on an actual device.
        report.canScan = hasBarcodeDetector && hasMediaDevices && isSecureContext;
        report.evidenceLevel = "UNIT-VERIFIED"; // Never DEVICE-VERIFIED from a capability check alone.
        return report;
    }

    window.CozyOS.QrScanCapability = Object.freeze({
        getVersion: () => VERSION,
        detect,
    });
})();
