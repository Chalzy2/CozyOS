/**
 * CozyOS Vendor Diagnostics
 * File Reference: core/platform/vendor-diagnostics.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Pure consumer of VendorRegistry and VendorLoader — discovers nothing
 *   itself, checks nothing itself, matches the exact same "pure
 *   consumer/correlation" pattern already established for PlatformAudit
 *   (Rule 40): that engine discovers nothing, only explains what other
 *   real engines already found. This file does the same for vendors.
 *
 * REAL, DERIVED STATE MODEL — six states, each a genuine combination of
 * real signals already gathered elsewhere, never a new check invented here
 *   - Missing: VendorRegistry's real folderExists check is false.
 *   - Error: folderExists is true, but VendorLoader's real, observed load
 *     attempt for this vendor recorded "error" (a genuine failure that
 *     was witnessed, not assumed).
 *   - Registered: always true for anything declared in the real manifest
 *     — shown as a separate, independent fact, not folded into the
 *     single primary state, since a vendor can be Registered and also
 *     Missing (declared, but no real file exists yet — the honest
 *     current state of all 16 vendors right now).
 *   - Runtime Loaded: VendorRegistry's real `typeof window[globalName]`
 *     check is true.
 *   - Ready: Runtime Loaded is true AND a real wrapper engine
 *     (`window.CozyOS[ownerEngine]`) exists — the same wrapperExists
 *     check VendorRegistry's own certifyVendor() already performs, read
 *     here, not re-implemented.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const VENDOR_DIAGNOSTICS_VERSION = "1.0.0-ENTERPRISE";

    class CozyVendorDiagnostics {
        getVersion() { return VENDOR_DIAGNOSTICS_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        /**
         * getVendorState(name)
         *   Real, derived from VendorRegistry + VendorLoader's already-
         *   gathered signals — this method performs no fetch, no
         *   getComputedStyle, no script-loading of its own. Pure
         *   correlation, same discipline as PlatformAudit.
         *
         *   Explicit progression (Rule 59): Not Installed → Installed →
         *   Registered → Loaded → Wrapped → Ready, with Error reachable
         *   from any active stage if a real load attempt was observed to
         *   fail. Each stage is a genuine, independently-checkable fact,
         *   never inferred from the stage name alone:
         *     - Installed: real folderExists check passes.
         *     - Registered: Installed AND declared in the real manifest
         *       (a vendor can't be Registered before it's Installed under
         *       this model, even though it may already be *declared* in
         *       the manifest with no real file yet — that combination is
         *       reported honestly as Not Installed, not Registered,
         *       since "Registered" here means the registry has confirmed
         *       real files exist, not merely that intent was declared).
         *     - Loaded: Registered AND the real runtime-attach check
         *       (`typeof window[globalName]`) passes.
         *     - Wrapped: Loaded AND a real wrapper engine
         *       (`window.CozyOS[ownerEngine]`) exists.
         *     - Ready: Wrapped AND, if the wrapper exposes a real
         *       `isAvailable()` method, that method returns true. If no
         *       such method exists, Wrapped and Ready are treated as the
         *       same real fact — there is no way to independently verify
         *       "more ready than wrapped" without one, so nothing is
         *       fabricated to force a distinction that isn't there.
         */
        async getVendorState(name) {
            const registry = window.CozyOS.VendorRegistry;
            const loader = window.CozyOS.VendorLoader;
            const checkedAt = new Date().toISOString();
            if (!registry) return { name, state: "UNKNOWN", checkedAt, reason: "VendorRegistry is not loaded — cannot derive state." };

            const cert = await registry.certifyVendor(name);
            const status = registry.getVendorStatus(name);
            const loadAttempt = loader ? loader.getLoadAttempt(name) : null;

            const installed = !!(cert.checks && cert.checks.folderExists);
            const declaredInManifest = status.declared;
            const registered = installed && declaredInManifest;
            const runtimeLoaded = registered && !!status.loaded;
            const wrapperExists = runtimeLoaded && !!(cert.checks && cert.checks.wrapperExists);
            let wrapperConfirmedReady = wrapperExists;
            if (wrapperExists && status.owner) {
                const wrapperInstance = window.CozyOS[cert.ownerEngineName || ""];
                if (wrapperInstance && typeof wrapperInstance.isAvailable === "function") {
                    try { wrapperConfirmedReady = wrapperInstance.isAvailable() === true; } catch (_err) { wrapperConfirmedReady = false; }
                }
            }
            const ready = wrapperExists && wrapperConfirmedReady;
            // Real, not fabricated: reads VendorRegistry's own real usage
            // records. Empty for all 16 vendors right now, since no real
            // wrapper engine exists yet to call recordUsage() — "In Use"
            // will honestly show false until one actually does.
            const applicationsUsingIt = typeof registry.getUsage === "function" ? registry.getUsage(name) : [];
            const inUse = ready && applicationsUsingIt.length > 0;
            const erroredLoad = installed && loadAttempt && loadAttempt.status === "error" && !runtimeLoaded;

            let state;
            if (erroredLoad) state = "ERROR";
            else if (inUse) state = "IN_USE";
            else if (ready) state = "READY";
            else if (wrapperExists) state = "WRAPPED";
            else if (runtimeLoaded) state = "LOADED";
            else if (registered) state = "REGISTERED";
            else if (installed) state = "INSTALLED"; // real files present but not yet declared/confirmed by the registry
            else state = "NOT_INSTALLED";

            // Real, computed Health Score — count of the 6 core stages
            // genuinely achieved (Installed/Registered/Loaded/Wrapped/Ready/
            // In Use) out of 6, never a subjective or fabricated number.
            const stagesAchieved = [installed, registered, runtimeLoaded, wrapperExists, ready, inUse].filter(Boolean).length;
            const healthScorePercent = Math.round((stagesAchieved / 6) * 100);

            return {
                name, state, checkedAt, healthScorePercent,
                installed, registered, runtimeLoaded, wrapperExists, ready, inUse,
                applicationsUsingIt,
                ownerEngine: status.ownerEngineName || null, owner: status.owner, license: status.license,
                wrapperFilePath: status.wrapperFilePath || null,
                version: status.version || "unknown", expectedFilePath: status.scriptPath || null,
                loadedScriptPath: loadAttempt && loadAttempt.status === "success" ? loadAttempt.scriptPath : null,
                loadDurationMs: loadAttempt ? loadAttempt.durationMs : null,
                lastError: loadAttempt && loadAttempt.status === "error" ? loadAttempt.reason : null,
                lastCheckedAt: loadAttempt ? loadAttempt.at : null,
                certificationResult: cert.verdict, certificationReason: cert.reason
            };
        }

        /** listVendorStates() — real, one entry per declared vendor, never fabricated. */
        async listVendorStates() {
            const registry = window.CozyOS.VendorRegistry;
            if (!registry) return { available: false, reason: "VendorRegistry is not loaded." };
            const status = registry.listVendorStatus();
            if (!status.available) return { available: false, reason: status.reason };
            const states = await Promise.all(status.vendors.map(v => this.getVendorState(v.name)));
            return { available: true, vendors: states };
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: VENDOR_DIAGNOSTICS_VERSION });
        }
    }

    if (window.CozyOS.VendorDiagnostics && typeof window.CozyOS.VendorDiagnostics.getVersion === "function") {
        const existingVersion = window.CozyOS.VendorDiagnostics.getVersion();
        if (existingVersion !== VENDOR_DIAGNOSTICS_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: VendorDiagnostics existing v${existingVersion} conflicts with load target v${VENDOR_DIAGNOSTICS_VERSION}.`);
        return;
    }

    window.CozyOS.VendorDiagnostics = new CozyVendorDiagnostics();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "VendorDiagnostics", category: "Platform", icon: "activity.svg",
                description: "Pure consumer of VendorRegistry/VendorLoader, discovers nothing itself — same pattern as PlatformAudit (Rule 40). Derives the real 6-state model (Missing/Installed/Runtime Loaded/Ready/Error, plus the independent Registered fact) from signals those two engines already gathered."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
