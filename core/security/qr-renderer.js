/**
 * CozyOS QRRenderer — Interface Stub Only
 * File Reference: core/security/qr-renderer.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Milestone: 132a
 * Version: 1.0.0-ENTERPRISE
 *
 * QR DECISION (Milestone 132a, locked)
 *   QR rendering is deferred. No QR encoder exists anywhere in this
 *   codebase, and this file does not build one, vendor one, or fake one.
 *   This is the real, honest interface a real vendored QR library will
 *   plug into later via registerEncoder() — until that call happens,
 *   render() always fails closed with a specific, non-fabricated reason.
 *
 * OWNERSHIP
 *   Owns: the QRRenderer contract (render(text) -> {available, dataUrl,
 *   reason}) and registerEncoder() as the single real seam a future
 *   vendored encoder attaches to.
 *   Does NOT own: OTP secret/URI generation (otp-provider.js owns
 *   otpauth:// URIs) or any actual QR encoding algorithm.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const QR_RENDERER_VERSION = "1.0.0-ENTERPRISE";

    class CozyQrRenderer {
        #realEncoder = null;

        getVersion() { return QR_RENDERER_VERSION; }

        /**
         * registerEncoder(encodeFn)
         *   Real, explicit hook for a genuine future QR library:
         *   encodeFn(text) -> string (a data: URL) | Promise<string>.
         *   Not called anywhere in this codebase yet — no encoder exists.
         */
        registerEncoder(encodeFn) {
            if (typeof encodeFn !== "function") return { success: false, reason: "A real encode function is required." };
            this.#realEncoder = encodeFn;
            return { success: true };
        }

        unregisterEncoder() {
            this.#realEncoder = null;
            return { success: true };
        }

        hasRealEncoder() { return this.#realEncoder !== null; }

        /**
         * render(text)
         *   Honest default: no encoder registered, so this returns
         *   available:false with the real reason, every time, until a
         *   genuine encoder is vendored and registered. Never fabricates
         *   a placeholder image.
         */
        async render(text) {
            if (!this.#realEncoder) {
                return { available: false, dataUrl: null, reason: "No QR encoder is registered. QR rendering is deferred per the Milestone 132a QR Decision — no vendored QR library exists in this codebase yet." };
            }
            try {
                const dataUrl = await this.#realEncoder(text);
                return { available: true, dataUrl, reason: null };
            } catch (err) {
                return { available: false, dataUrl: null, reason: `Registered encoder threw: ${err.message}` };
            }
        }

        getIntegrationManifest() {
            return {
                ownership: { owns: ["QRRenderer.render() contract", "registerEncoder() seam"], doesNotOwn: ["Any QR encoding algorithm", "otpauth:// URI generation (otp-provider.js)"] },
                uses: [],
                registers: ["ServiceRegistry"],
                security: { failClosed: "render() with no real encoder always returns available:false, never a fabricated image.", honestLimitation: "No QR encoder exists anywhere in this codebase as of Milestone 132a — by explicit decision, not oversight." }
            };
        }
    }

    if (window.CozyOS.QRRenderer && typeof window.CozyOS.QRRenderer.getVersion === "function") {
        const existingVersion = window.CozyOS.QRRenderer.getVersion();
        if (existingVersion !== QR_RENDERER_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: QRRenderer existing v${existingVersion} conflicts with load target v${QR_RENDERER_VERSION}.`);
        return;
    }

    const instance = new CozyQrRenderer();
    window.CozyOS.QRRenderer = instance;

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        window.CozyOS.ServiceRegistry.registerCoordinator("QRRenderer", instance);
    }
})();
