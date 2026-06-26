/**
 * ── COZYOS CENTRAL BOOTSTRAP MICROKERNEL ──
 * VERSION: 9.1.0 (Production Architecture Complete)
 */
(function() {
    const CozyOS = { _isReady: false, _initPromise: null };
    const subsystems = [
        'AI', 'Storage', 'Auth', 'Security', 'Notifications', 'Analytics', 'Router', 
        'Plugins', 'Cache', 'Sync', 'Documents', 'Media', 'Wallet', 'CRM', 
        'Affiliate', 'Studio3D', 'Academy', 'Settings', 'Config', 'Logger', 
        'Events', 'Permissions', 'Scheduler', 'Telemetry'
    ];
    subsystems.forEach(api => { CozyOS[api] = CozyOS[api] || {}; });

    CozyOS.init = function() {
        if (this._isReady) return Promise.resolve(true);
        if (this._initPromise) return this._initPromise;

        this._initPromise = (async () => {
            console.log("🌌 [CozyOS Kernel] Initializing microkernel architecture layers...");
            try {
                // Parallel asynchronous import allocation — now including core/ai.js
                const [config, logger, events, storage, sync, permissions, scheduler, telemetry, router, modules, services, ai] = await Promise.all([
                    import('./core/config.js'),
                    import('./core/logger.js'),
                    import('./core/events.js'),
                    import('./core/storage.js'),
                    import('./core/sync.js'),
                    import('./core/permissions.js'),
                    import('./core/scheduler.js'),
                    import('./core/telemetry.js'),
                    import('./core/router.js'),
                    import('./core/modules.js'),
                    import('./core/services.js'),
                    import('./core/ai.js') // <── Added here
                ]);

                // Register Core Subsystems
                CozyOS.Config = config.default;
                CozyOS.Logger = logger.default;
                CozyOS.Events = events.default;
                CozyOS.Storage = storage.default;
                CozyOS.Sync = sync.default;
                CozyOS.Permissions = permissions.default;
                CozyOS.Scheduler = scheduler.default;
                CozyOS.Telemetry = telemetry.default;
                CozyOS.Router = router.default;
                CozyOS.Plugins = modules.default;
                CozyOS.AI = ai.default; // <── Mounted safely to window.CozyOS.AI

                // Spread extended capability business drivers (Wallet, CRM, etc.)
                Object.assign(CozyOS, services.default);

                // Run system initialization hook routines
                await CozyOS.Storage.initInternal();
                CozyOS.Sync.startSyncOrchestrator();

                CozyOS.Scheduler.createJob("kernel_health_heartbeat", 15000, () => {
                    const dbInstance = CozyOS.Storage.getRawInstance();
                    if (dbInstance) {
                        const tx = dbInstance.transaction("cozy_sync_queue", "readonly");
                        tx.objectStore("cozy_sync_queue").getAll().onsuccess = (e) => {
                            const count = e.target.result?.length || 0;
                            CozyOS.Telemetry.updateMetrics({ syncQueueDepth: count });
                        };
                    }
                });

                CozyOS._isReady = true;
                CozyOS.Logger.info("Kernel", `Ecosystem online. Microkernel core fully operational (v${CozyOS.Config.version})`);
                CozyOS.Events.publish('kernel:ready', true);
                return true;
            } catch (panic) {
                CozyOS.handleFault("Catastrophic Framework Boot Phase", panic);
                return false;
            }
        })();

        return this._initPromise;
    };

    CozyOS.handleFault = function(sourceContext, errorPayload) {
        if (CozyOS.Logger && CozyOS.Logger.error) {
            CozyOS.Logger.error(`FAULT_ISOLATION [${sourceContext}]`, errorPayload?.message || errorPayload, errorPayload);
        }
        let toastEl = document.getElementById('cc-toast');
        if (toastEl) {
            toastEl.textContent = `⚠️ Isolated Process Alert: ${sourceContext}`;
            toastEl.className = 'show';
            setTimeout(() => toastEl.className = '', 3000);
        }
        if (CozyOS.Telemetry && CozyOS.Telemetry.updateMetrics) {
            CozyOS.Telemetry.updateMetrics({ lastErrorContext: sourceContext });
        }
    };

    window.CozyOS = CozyOS;
})();
