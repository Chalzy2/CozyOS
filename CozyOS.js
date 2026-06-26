/**
 * ── COZYOS CENTRAL BOOTSTRAP MICROKERNEL ──
 * VERSION: 8.0.0 (Production-Ready Architecture)
 */
(function() {
    // Early allocation namespace stubbing to insulate view layouts from resource race conditions
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
            console.log("🌌 [CozyOS Kernel] Initiating asynchronous runlevel boot sequence...");
            try {
                // Parallel fetching of highly decoupled micro-service components
                const [config, logger, events, storage, sync, permissions, scheduler, telemetry, router, modules, services] = await Promise.all([
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
                    import('./core/services.js')
                ]);

                // Map microservices onto global namespace target core
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

                // Spread core capability handlers and proxy slices cleanly onto namespace
                Object.assign(CozyOS, services.default);

                // Initialize transactional database layers internally
                await CozyOS.Storage.initInternal();
                
                // Initialize ambient network listeners and sync engine background flushes
                CozyOS.Sync.startSyncOrchestrator();

                // Setup automated telemetric sampling job via kernel background scheduler 
                CozyOS.Scheduler.createJob("kernel_health_heartbeat", 15000, () => {
                    const dbInstance = CozyOS.Storage.getRawInstance();
                    if (dbInstance) {
                        const tx = dbInstance.transaction("cozy_sync_queue", "readonly");
                        tx.objectStore("cozy_sync_queue").getAll().onsuccess = (e) => {
                            const pendingDepth = e.target.result?.length || 0;
                            CozyOS.Telemetry.updateMetrics({ syncQueueDepth: pendingDepth });
                        };
                    }
                });

                CozyOS._isReady = true;
                CozyOS.Logger.info("Kernel", `CozyOS successfully initialized on runlevel 1. Build Tag: ${CozyOS.Config.buildTag}`);
                CozyOS.Events.publish('kernel:ready', true);
                return true;
            } catch (panic) {
                // Invoke local fault isolation immediately if core execution thread breaks
                let toastEl = document.getElementById('cc-toast');
                if (toastEl) {
                    toastEl.textContent = `🚨 Catastrophic Kernel Panic during system boot allocation. Check logging logs.`;
                    toastEl.className = 'show';
                }
                console.error("🚨 [CozyOS Kernel Panic] Core architecture load failure:", panic);
                return false;
            }
        })();

        return this._initPromise;
    };

    window.CozyOS = CozyOS;
})();
                    
