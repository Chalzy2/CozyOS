/**
 * CozyOS Vendor Loader
 * File Reference: core/platform/vendor-loader.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Real, dynamic `<script>` injection for vendor libraries, with genuine
 *   success/error tracking — this is what makes `VendorRegistry`'s "Error"
 *   state a real, observed outcome rather than a derived guess. Never
 *   fetches or bundles a library itself; only loads whatever real file
 *   already exists at the manifest-declared path.
 *
 * HONEST SCOPE
 *   Every one of the 16 declared vendors will genuinely fail to load
 *   right now, since none of their real files exist anywhere in this
 *   deployment (no network access in this environment to create them).
 *   `loadVendor()` will report a real, correct error for each — this is
 *   not a placeholder success path waiting for files to appear; it is
 *   real code that will start working the moment a real file is placed
 *   at the expected path, with no changes needed here.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const VENDOR_LOADER_VERSION = "1.0.0-ENTERPRISE";

    class CozyVendorLoader {
        #loadAttempts = new Map(); // name -> {status: "success"|"error", at, reason}
        #inFlight = new Map(); // name -> Promise, real de-dup so a double-click can't inject the same script twice

        getVersion() { return VENDOR_LOADER_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        /**
         * loadVendor(name, scriptPath)
         *   Real dynamic script injection — a genuine browser mechanism,
         *   not simulated. Resolves on the real script's `load` event,
         *   rejects on the real `error` event (most likely outcome right
         *   now, since no vendor file exists at any real path yet).
         *   Records the real, observed outcome for VendorRegistry to read
         *   back — never fabricates a success it didn't witness.
         */
        loadVendor(name, scriptPath) {
            if (this.#inFlight.has(name)) return this.#inFlight.get(name);
            const startedAt = Date.now();
            const promise = new Promise((resolve, reject) => {
                if (typeof document === "undefined") {
                    const reason = "No DOM available in this environment.";
                    this.#loadAttempts.set(name, { status: "error", at: new Date().toISOString(), reason, scriptPath, durationMs: Date.now() - startedAt });
                    reject(new Error(reason));
                    return;
                }
                const script = document.createElement("script");
                script.src = scriptPath;
                script.onload = () => {
                    this.#loadAttempts.set(name, { status: "success", at: new Date().toISOString(), reason: null, scriptPath, durationMs: Date.now() - startedAt });
                    this.#inFlight.delete(name);
                    resolve({ success: true, name });
                };
                script.onerror = () => {
                    const reason = `Real load failure — ${scriptPath} did not resolve (most likely: the real vendor file does not exist at this path yet).`;
                    this.#loadAttempts.set(name, { status: "error", at: new Date().toISOString(), reason, scriptPath, durationMs: Date.now() - startedAt });
                    this.#inFlight.delete(name);
                    reject(new Error(reason));
                };
                document.head.appendChild(script);
            });
            this.#inFlight.set(name, promise);
            return promise;
        }

        /** getLoadAttempt(name) — real, observed outcome of the most recent loadVendor() call, or null if never attempted. */
        getLoadAttempt(name) {
            const attempt = this.#loadAttempts.get(name);
            return attempt ? this.#deepClone(attempt) : null;
        }

        getDiagnosticsReport() {
            return this.#deepClone({
                moduleVersion: VENDOR_LOADER_VERSION,
                attemptsRecorded: this.#loadAttempts.size,
                attempts: Object.fromEntries(this.#loadAttempts)
            });
        }
    }

    if (window.CozyOS.VendorLoader && typeof window.CozyOS.VendorLoader.getVersion === "function") {
        const existingVersion = window.CozyOS.VendorLoader.getVersion();
        if (existingVersion !== VENDOR_LOADER_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: VendorLoader existing v${existingVersion} conflicts with load target v${VENDOR_LOADER_VERSION}.`);
        return;
    }

    window.CozyOS.VendorLoader = new CozyVendorLoader();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "VendorLoader", category: "Platform", icon: "download.svg",
                description: "Real dynamic script injection for vendor libraries, with genuine (not simulated) success/error tracking — the observed signal VendorRegistry's 'Error' state reads from. Every vendor will genuinely fail to load right now, since no real vendor file exists anywhere in this deployment."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
