/**
 * ── COZYOS CENTRAL BOOTSTRAP MICROKERNEL ──
 * VERSION: 9.0.0 (Production Architecture Complete)
 */
(function() {
    // 1. Establish early-stage namespace maps to shield dashboard templates from file load latency
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
                // Parallel asynchronous import allocation
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

                // Spread extended proxy capabilities (AI, Wallet, CRM) onto global layout frame API
                Object.assign(CozyOS, services.default);

                // Initialize local database clusters
                await CozyOS.Storage.initInternal();
                
                // Fire dynamic background transaction flushes
                CozyOS.Sync.startSyncOrchestrator();

                // Allocate systemic resource telemetry loops using the scheduler engine
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

    /**
     * Centralized Process Fault-Isolation Boundary Protocol
     * Wraps background errors to keep your dashboard running smoothly even if an individual module fails.
     */
    CozyOS.handleFault = function(sourceContext, errorPayload) {
        if (CozyOS.Logger && CozyOS.Logger.error) {
            CozyOS.Logger.error(`FAULT_ISOLATION [${sourceContext}]`, errorPayload?.message || errorPayload, errorPayload);
        } else {
            console.error(`🚨 [Kernel Fault Isolation] ${sourceContext} ->`, errorPayload);
        }
        
        // Push a non-blocking UI alert notification toast
        if (CozyOS.Notifications && CozyOS.Notifications.dispatchSystemToast) {
            CozyOS.Notifications.dispatchSystemToast(`⚠️ Isolated Process Alert: ${sourceContext}`);
        } else {
            let toastEl = document.getElementById('cc-toast');
            if (toastEl) {
                toastEl.textContent = `⚠️ Isolated Process Alert: ${sourceContext}`;
                toastEl.className = 'show';
                setTimeout(() => toastEl.className = '', 3000);
            }
        }
        
        if (CozyOS.Telemetry && CozyOS.Telemetry.updateMetrics) {
            CozyOS.Telemetry.updateMetrics({ lastErrorContext: sourceContext });
        }
    };

    window.CozyOS = CozyOS;
})();
                    
