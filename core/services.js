/**
 * ── COZYOS CENTRAL RUNTIME SERVICES & BACKGROUND JOBS ──
 * FILE: core/services.js
 * REFERENCE: CozyOS_Universal_Session_Identity_Kernel_Production_Upgrade.pdf
 */

import Config from './config.js';
import Storage from './storage.js';
import SyncEngine from './sync.js';
import AuditLogger from './audit.js';
import Logger from './logger.js';
import Events from './events.js';

export default {
    // Keep reference pointers for active background service intervals
    intervals: {
        billingCheck: null,
        offlineSync: null,
        lowStockMonitor: null
    },

    /**
     * BOOTSTRAP ALL SYSTEM SERVICES AT STARTUP
     */
    async startAllServices() {
        Logger.info("Services Engine", "Booting system background worker processes...");

        // 1. Fire Subscription Status Heartbeat Checker
        this.startBillingCheckWorker();

        // 2. Fire Offline-First Mutation Synchronization Queue
        if (Config.flags.offlineFirstMode) {
            this.startOfflineSyncWorker();
        }

        // 3. Register Global Event Bus System Observers
        this.registerCrossModuleEventSubscribers();
    },

    /**
     * WORKER A: DYNAMIC SUBSCRIPTION & METRIC VALIDATOR
     */
    startBillingCheckWorker() {
        // Run checks instantly on boot, then repeat every 6 hours
        const cycleIntervalMs = 6 * 60 * 60 * 1000; 

        const performCheck = async () => {
            const session = window.CozyOS?.Session;
            if (!session) return;

            // Instantly bypass billing calculations if config is toggled to Free Mode
            if (Config.flags.SUBSCRIPTIONS_ENABLED === false) {
                return; 
            }

            Logger.info("Services Engine", "Executing periodic multi-tenant subscription validation...");
            
            const subData = await Storage.readLocal("cozy_subscription_manifest", `sub_${session.tenantId}`);
            if (subData) {
                const now = new Date();
                const expiryDate = new Date(subData.expiresAt);

                if (now > expiryDate && subData.status !== "expired") {
                    Logger.warn("Services Engine", `Subscription expired for tenant space: ${session.tenantId}`);
                    
                    // Gracefully update system flags without dropping customer data tables
                    subData.status = "expired";
                    await Storage.writeLocal("cozy_subscription_manifest", { key: `sub_${session.tenantId}`, ...subData });
                    
                    // Broadcast warning globally so premium UI frames drop back to read-only mode
                    Events.publish("billing:subscription_expired", subData);
                }
            }
        };

        performCheck();
        this.intervals.billingCheck = setInterval(performCheck, cycleIntervalMs);
    },

    /**
     * WORKER B: AUTOMATED CONNECTION RECOVERY SYNC QUEUE
     */
    startOfflineSyncWorker() {
        // Scan the IndexedDB outbound buffer every 30 seconds for pending sales records
        const checkIntervalMs = 30000;

        this.intervals.offlineSync = setInterval(async () => {
            if (!navigator.onLine) return; 

            try {
                const pendingCount = await SyncEngine.getPendingQueueCount();
                if (pendingCount > 0) {
                    Logger.info("Services Engine", `Network link active. Processing ${pendingCount} buffered records...`);
                    await SyncEngine.processOutboundSyncQueue();
                }
            } catch (error) {
                Logger.error("Services Engine", "Offline background synchronization stalled", error);
            }
        }, checkIntervalMs);
    },

    /**
     * EVENT ROUTER: HOOK MODULE MUTATIONS TOGETHER AUTOMATICALLY
     */
    registerCrossModuleEventSubscribers() {
        // Listener 1: When a retail sale settles, immediately check stock levels and trigger alerts
        Events.subscribe("sales:mutation_complete", async (eventData) => {
            Logger.info("Services Engine", "Sale detected. Adjusting metered account API usage matrices.");
            
            // Increment metered subscription usage metrics automatically
            if (window.CozyOS?.Billing?.recordUsageMetric) {
                await window.CozyOS.Billing.recordUsageMetric("transactions", 1);
            }
        });

        // Listener 2: Push global security warnings down into the system audit tables
        Events.subscribe("billing:limit_warning", async (warning) => {
            await AuditLogger.log("Quota Warning", `Tenant is nearing maximum allocation threshold limit for feature index [${warning.metricKey}].`);
        });
    },

    /**
     * SHUT DOWN RUNTIME INTERVAl WORKERS GRACEFULLY ON LOGOUT
     */
    stopAllServices() {
        Logger.info("Services Engine", "Clearing worker threads safely.");
        clearInterval(this.intervals.billingCheck);
        clearInterval(this.intervals.offlineSync);
        clearInterval(this.intervals.lowStockMonitor);
    }
};

// Wire up directly into the kernel runtime space
window.CozyOS = window.CozyOS || {};
window.CozyOS.Services = module.exports.default;
