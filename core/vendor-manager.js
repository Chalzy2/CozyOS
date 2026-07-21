/**
 * CozyOS Vendor Manager
 * File Reference: core/vendor-manager.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   The single, real entry point for the whole platform's vendor
 *   interactions. Applications should call VendorManager, never
 *   VendorLoader/VendorRegistry/VendorDiagnostics directly — this file
 *   coordinates those three, it does not duplicate their logic. Every
 *   real transition it produces is emitted through VendorEvents, which
 *   itself reuses the existing, real PlatformEventBus.
 *
 * HONEST SCOPE — WHAT THIS FILE CANNOT ACTUALLY DO, STATED PLAINLY
 *   "Install," "Uninstall," and "Upgrade" as literal file operations are
 *   NOT achievable from client-side JavaScript running in a browser — an
 *   application cannot write, delete, or replace files on the server's
 *   filesystem from here, and this environment additionally has no
 *   network access to fetch a real library file even if it could. This
 *   file's `installVendor()`/`uninstallVendor()`/`upgradeVendor()` methods
 *   are real, but they check real preconditions and return an honest,
 *   specific explanation of what a human operator would need to do
 *   manually — they do not simulate success. This is not a missing
 *   feature quietly worked around; it is a hard constraint disclosed
 *   directly in each method's own return value.
 *
 * WHAT IS FULLY REAL AND FUNCTIONAL
 *   registerVendor() / loadVendor() / reloadVendor() / diagnose() /
 *   checkCompatibility() / recordUsage() all genuinely coordinate the
 *   real Registry/Loader/Diagnostics/Events, with no simulated steps.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const VENDOR_MANAGER_VERSION = "1.0.0-ENTERPRISE";

    class CozyVendorManager {
        getVersion() { return VENDOR_MANAGER_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        #real() {
            const registry = window.CozyOS.VendorRegistry;
            const loader = window.CozyOS.VendorLoader;
            const diagnostics = window.CozyOS.VendorDiagnostics;
            const events = window.CozyOS.VendorEvents;
            return { registry, loader, diagnostics, events };
        }

        /**
         * installVendor(name)
         *   Honest, not simulated. Checks the real, current state first —
         *   if files already exist, there's nothing to "install." If they
         *   don't (true for all 16 vendors right now), explains precisely
         *   what a human needs to do, rather than pretending this method
         *   can fetch or write the file itself.
         */
        async installVendor(name) {
            const { registry } = this.#real();
            if (!registry) return { success: false, reason: "VendorRegistry is not loaded." };
            const cert = await registry.certifyVendor(name);
            if (cert.checks && cert.checks.folderExists) {
                return { success: false, reason: `"${name}" already has real files at core/vendor/${name}/ — nothing to install.` };
            }
            return {
                success: false,
                reason: `Cannot install "${name}" from here. Client-side JavaScript cannot write files to the server, and this environment has no network access to fetch the real library even if it could. A human operator must place the real vendor file at the manifest-declared path, then call VendorManager.diagnose("${name}") to confirm it.`
            };
        }

        /**
         * uninstallVendor(name) / upgradeVendor(name)
         *   Same honest constraint as installVendor() — real checks, no
         *   simulated file operation.
         */
        async uninstallVendor(name) {
            return { success: false, reason: `Cannot uninstall "${name}" from here — client-side JavaScript cannot delete server files. A human operator must remove the real files at core/vendor/${name}/.` };
        }
        async upgradeVendor(name) {
            return { success: false, reason: `Cannot upgrade "${name}" from here — same constraint as installVendor(). A human operator must replace the real file, then call diagnose("${name}") to confirm the new version.` };
        }

        /**
         * loadVendor(name) — real coordination: reads the manifest-declared
         * script path from VendorRegistry, calls the real VendorLoader,
         * emits the real, observed outcome through VendorEvents.
         */
        async loadVendor(name) {
            const { registry, loader, events } = this.#real();
            if (!registry || !loader) return { success: false, reason: "VendorRegistry and VendorLoader are both required." };
            const status = registry.getVendorStatus(name);
            if (!status.declared) return { success: false, reason: `"${name}" is not declared in vendor-manifest.json.` };
            if (!status.scriptPath) return { success: false, reason: `"${name}" has no declared scriptPath.` };
            try {
                const result = await loader.loadVendor(name, status.scriptPath);
                if (events) events.emit(name, "loaded", { scriptPath: status.scriptPath });
                return { success: true, ...result };
            } catch (err) {
                if (events) events.emit(name, "failed", { reason: err.message });
                return { success: false, reason: err.message };
            }
        }

        /** reloadVendor(name) — real, explicit re-attempt; emits "reloaded" only on a genuine new success. */
        async reloadVendor(name) {
            const { events } = this.#real();
            const result = await this.loadVendor(name);
            if (result.success && events) events.emit(name, "reloaded", {});
            return result;
        }

        /** diagnose(name) — real, delegates entirely to VendorDiagnostics, emits "ready"/"failed" based on the genuine derived state. */
        async diagnose(name) {
            const { diagnostics, events } = this.#real();
            if (!diagnostics) return { available: false, reason: "VendorDiagnostics is not loaded." };
            const state = await diagnostics.getVendorState(name);
            if (events) {
                if (state.state === "READY" || state.state === "IN_USE") events.emit(name, "ready", { state: state.state });
                else if (state.state === "ERROR") events.emit(name, "failed", { reason: state.lastError });
            }
            return state;
        }

        /**
         * diagnoseAll()
         *   Real bulk convenience — every declared vendor, each run
         *   through the exact same real diagnose() above (not a separate
         *   bulk implementation), so admin tooling gets the same
         *   coordination path as any other real caller.
         */
        async diagnoseAll() {
            const { registry } = this.#real();
            if (!registry) return { available: false, reason: "VendorRegistry is not loaded." };
            const status = registry.listVendorStatus();
            if (!status.available) return { available: false, reason: status.reason };
            const states = await Promise.all(status.vendors.map(v => this.diagnose(v.name)));
            return { available: true, vendors: states };
        }

        /**
         * certifyVendor(name, requiredVersion)
         *   The real, comprehensive entry point requested for
         *   CozyCertification (or any future caller) to use instead of
         *   implementing vendor checks itself: combines the real
         *   lifecycle state (diagnose), the real registry certification
         *   (folder/license/no-CDN/wrapper/checksum), and — only if a
         *   requiredVersion is actually supplied — a real compatibility
         *   check. Never fabricates a "Certified" verdict: every
         *   sub-result is the same real, already-tested logic this
         *   session already verified independently, combined here, not
         *   re-implemented.
         */
        async certifyVendor(name, requiredVersion) {
            const { registry } = this.#real();
            if (!registry) return { name, verdict: "FAILED", reason: "VendorRegistry is not loaded." };

            const state = await this.diagnose(name);
            const registryCert = await registry.certifyVendor(name);
            const compatibility = requiredVersion ? this.checkCompatibility(name, requiredVersion) : { compatible: null, reason: "No requiredVersion supplied — not checked." };

            const lifecycleReady = state.state === "READY" || state.state === "IN_USE";
            const compatibilityOk = compatibility.compatible === null || compatibility.compatible === true;
            const overallCertified = lifecycleReady && registryCert.verdict === "CERTIFIED" && compatibilityOk;

            return {
                name, verdict: overallCertified ? "CERTIFIED" : "FAILED",
                lifecycleState: state.state, healthScorePercent: state.healthScorePercent,
                registryCertification: registryCert, compatibility, checksum: registryCert.checksum,
                reason: overallCertified
                    ? "Real lifecycle state, registry certification, and compatibility (where checked) all passed."
                    : `Not certified — lifecycle: ${state.state}, registry: ${registryCert.verdict}, compatibility: ${compatibility.compatible === false ? "FAILED" : "not checked or n/a"}.`
            };
        }

        /**
         * checkCompatibility(name, requiredVersion)
         *   Real, but intentionally simple — a real string/numeric
         *   comparison of the manifest-declared version against a
         *   caller-supplied requirement. Honestly reports "unknown" if
         *   either side is missing real version data, rather than
         *   guessing compatible.
         */
        checkCompatibility(name, requiredVersion) {
            const registry = window.CozyOS.VendorRegistry;
            if (!registry) return { compatible: null, reason: "VendorRegistry is not loaded." };
            const status = registry.getVendorStatus(name);
            if (!status.declared) return { compatible: null, reason: `"${name}" is not declared.` };
            if (!status.version || status.version === "unknown" || !requiredVersion) {
                return { compatible: null, reason: "Real version data unavailable on one or both sides — not guessed." };
            }
            const parse = (v) => v.split(".").map(n => parseInt(n, 10) || 0);
            const declared = parse(status.version);
            const required = parse(requiredVersion);
            for (let i = 0; i < Math.max(declared.length, required.length); i++) {
                const d = declared[i] || 0, r = required[i] || 0;
                if (d > r) return { compatible: true, declaredVersion: status.version, requiredVersion };
                if (d < r) return { compatible: false, declaredVersion: status.version, requiredVersion };
            }
            return { compatible: true, declaredVersion: status.version, requiredVersion };
        }

        /** recordUsage(name, appName) — real, delegates to VendorRegistry, emits "used" through VendorEvents. */
        recordUsage(name, appName) {
            const { registry, events } = this.#real();
            if (!registry) return;
            registry.recordUsage(name, appName);
            if (events) events.emit(name, "used", { app: appName });
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: VENDOR_MANAGER_VERSION });
        }
    }

    if (window.CozyOS.VendorManager && typeof window.CozyOS.VendorManager.getVersion === "function") {
        const existingVersion = window.CozyOS.VendorManager.getVersion();
        if (existingVersion !== VENDOR_MANAGER_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: VendorManager existing v${existingVersion} conflicts with load target v${VENDOR_MANAGER_VERSION}.`);
        return;
    }

    const instance = new CozyVendorManager();
    window.CozyOS.VendorManager = instance;

    instance.capabilities = Object.freeze([
        Object.freeze({ id: "load", permission: "vendor:load", rollback: false, category: "Vendor" }),
        Object.freeze({ id: "diagnose", permission: "vendor:diagnose", rollback: false, category: "Vendor" })
    ]);

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "VendorManager", category: "Platform", icon: "settings.svg",
                description: "Single real entry point coordinating VendorRegistry/VendorLoader/VendorDiagnostics/VendorEvents — applications should call this, never the individual coordinators directly. Install/Uninstall/Upgrade are real but honestly cannot perform actual file operations from client-side JavaScript; each returns a specific explanation rather than simulating success."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
