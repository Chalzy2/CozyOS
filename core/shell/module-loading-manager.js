/**
 * CozyOS Module Loading Manager
 * File Reference: core/shell/module-loading-manager.js
 * Layer: Core / Shared Shell Service — Application Load Lifecycle
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP (Rule 32)
 *   The ONE shared load-lifecycle manager for every CozyOS application load:
 *   concurrent-load deduplication (calling loadModule() twice for the same
 *   app while the first load is still in flight returns the SAME promise
 *   instead of double-loading), history, and diagnostics. Real gap this
 *   fills: cozy-ui.js's loadModule() previously had zero protection against
 *   rapid double-clicks or programmatic double-calls triggering the same
 *   app's load() twice concurrently.
 *
 * BEHAVIOR PRESERVED EXACTLY AS PROVIDED
 *   Every method below is unchanged from what was given — only wrapped in
 *   CozyOS's standard file/registration/version conventions. No logic was
 *   altered; this is integration, not a redesign, per the directive.
 *
 * INTEGRATION (see cozy-ui.js)
 *   cozy-ui.js calls init() once with an adapter function that delegates to
 *   the EXISTING window.CozyOS.Modules[name].load() contract — this file
 *   has no opinion about HOW an application loads, only about deduplicating,
 *   timing, and recording whatever loader it's given. The "path" argument
 *   is the module's real registered .js file (from ModuleRegistry) used for
 *   diagnostics/history, not a dynamic-import path this file resolves itself.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const LOADER_VERSION = "1.0.0-ENTERPRISE";

    const ModuleLoadingManager = {
        activeLoads: new Map(), // Map<name, Promise>
        loadMetadata: new Map(), // Map<name, metadata>
        history: [],
        DEFAULT_CONFIG: Object.freeze({ MAX_HISTORY: 100 }),
        config: { MAX_HISTORY: 100 },
        _internalLoader: null,

        getVersion() { return LOADER_VERSION; },

        init(loader) {
            if (this._internalLoader) throw new Error("ModuleLoadingManager already initialized.");
            if (typeof loader !== "function") throw new TypeError("Internal loader must be a function.");
            this._internalLoader = loader;
        },

        async loadModule(path, name) {
            if (!path || !name) throw new Error("Invalid module path or name");
            if (typeof this._internalLoader !== "function") throw new Error("ModuleLoadingManager not initialized.");

            if (this.activeLoads.has(name)) return this.activeLoads.get(name);

            const startedAt = Date.now();
            const startTime = performance.now();

            const loadPromise = (async () => {
                window.CozyOS.PlatformEventBus?.emit("module-loading", { name, path, startTime, startedAt });
                try {
                    const result = await this._internalLoader(path, name);
                    const finishTime = performance.now();

                    this._recordHistory({ name, path, status: "success", startTime, finishTime, startedAt, duration: finishTime - startTime, retryCount: 0 });
                    window.CozyOS.PlatformEventBus?.emit("module-loaded", { name, path, duration: finishTime - startTime });
                    return result;
                } catch (error) {
                    const finishTime = performance.now();
                    this._recordHistory({ name, path, status: "failed", error: error.message, stack: error.stack, startTime, finishTime, startedAt, retryCount: 0 });
                    window.CozyOS.PlatformEventBus?.emit("module-failed", { name, path, error: error.message });
                    throw error;
                } finally {
                    this.activeLoads.delete(name);
                    this.loadMetadata.delete(name);
                }
            })();

            this.activeLoads.set(name, loadPromise);
            this.loadMetadata.set(name, { startedAt, path });
            return loadPromise;
        },

        _recordHistory(entry) {
            this.history.push(entry);
            if (this.history.length > this.config.MAX_HISTORY) this.history.shift();
        },

        getDiagnostics() {
            const activeDetails = Array.from(this.loadMetadata.entries()).map(([name, data]) => ({
                module: name,
                path: data.path,
                startedAt: data.startedAt,
                elapsed: Date.now() - data.startedAt
            }));

            return {
                moduleVersion: LOADER_VERSION,
                active: activeDetails,
                history: [...this.history],
                eventBus: window.CozyOS.PlatformEventBus ? window.CozyOS.PlatformEventBus.getDiagnostics() : { connected: false, message: "PlatformEventBus not loaded." }
            };
        }
    };

    if (window.CozyOS.ModuleLoadingManager && typeof window.CozyOS.ModuleLoadingManager.getVersion === "function") {
        const existingVersion = window.CozyOS.ModuleLoadingManager.getVersion();
        if (existingVersion !== LOADER_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: ModuleLoadingManager existing v${existingVersion} conflicts with load target v${LOADER_VERSION}.`);
        }
        return;
    }

    window.CozyOS.ModuleLoadingManager = ModuleLoadingManager;

    (function registerWithServiceRegistry(descriptor) {
        function attempt() {
            if (typeof window.CozyOS.registerCoordinator !== "function") return false;
            try { window.CozyOS.registerCoordinator(descriptor); } catch (_err) { /* non-fatal */ }
            return true;
        }
        if (attempt()) return;
        let attempts = 0;
        const maxAttempts = 200;
        const intervalId = setInterval(() => {
            attempts++;
            if (attempt() || attempts >= maxAttempts) clearInterval(intervalId);
        }, 250);
    })({
        name: "ModuleLoadingManager", category: "Foundation", icon: "loader.svg",
        description: "CozyOS Module Loading Manager — concurrent-load deduplication, history, and diagnostics for application loads. Integrated with cozy-ui.js's loadModule()."
    });
})();
