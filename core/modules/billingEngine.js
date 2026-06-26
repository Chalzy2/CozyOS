/**
 * ── COZYOS UNIVERSAL SUBSCRIPTION & BILLING ENGINE ──
 * VERSION: 1.0.0 (Production-Ready Universal Extension)
 * DOMAIN: modules/billingEngine.js
 * REFERENCE: CozyOS_Universal_Session_Identity_Kernel_Production_Upgrade.pdf
 */

import Storage from '../core/storage.js';
import AuditLogger from '../core/audit.js';
import Logger from '../core/logger.js';

// Global Free Mode Toggle System Flag Configuration
export const SUBSCRIPTIONS_ENABLED = false; 

let activeSubscriptionState = {
    planId: "free_tier",
    planName: "Enterprise Evaluation Mode",
    status: "active", // active, trialing, grace_period, expired, paused
    expiresAt: "2030-12-31T23:59:59.000Z",
    gracePeriodDays: 7,
    licensedModules: ["ai_assistant", "pos_duka", "mpesa_agent", "inventory", "accounting", "reports"],
    usageLimits: { ai_calls: 10000, storage_mb: 5120, transactions: 50000 },
    usageCurrent: { ai_calls: 0, storage_mb: 0, transactions: 0 }
};

export default {
    /**
     * SYSTEM INIT: Hydrate organization plan matrices safely from persistent memory
     */
    async init() {
        const session = window.CozyOS?.Session;
        if (!session) return;

        Logger.info("Billing Engine", `Hydrating subscription footprints for Tenant Profile: ${session.tenantId}`);
        
        const localRecord = await Storage.readLocal("cozy_subscription_manifest", `sub_${session.tenantId}`);
        if (localRecord) {
            activeSubscriptionState = { ...activeSubscriptionState, ...localRecord };
        } else if (!SUBSCRIPTIONS_ENABLED) {
            // Seed a master development playground if system configuration flag is toggled down
            await Storage.writeLocal("cozy_subscription_manifest", { key: `sub_${session.tenantId}`, ...activeSubscriptionState });
        }
    },

    /**
     * REVENUE ENFORCEMENT & FEATURE GUARD GATEWAY
     * Client & server-side programmatic gate checking loop
     */
    isFeatureLicensed(moduleId) {
        // If system configuration defaults to Free Mode flag, evaluate true across all features
        if (!SUBSCRIPTIONS_ENABLED) return true;

        const isModuleActive = activeSubscriptionState.licensedModules.includes(moduleId);
        const withinExpiry = new Date() < new Date(activeSubscriptionState.expiresAt);
        const withinStatus = ["active", "trialing", "grace_period"].includes(activeSubscriptionState.status);

        if (isModuleActive && withinExpiry && withinStatus) {
            return true;
        }

        Logger.warn("Billing Engine", `Subscription Block: Access denied for premium module feature [${moduleId}].`);
        return false;
    },

    /**
     * QUANTATIVE METERED CONSUMPTION METRICS ACCUMULATOR
     */
    async recordUsageMetric(metricKey, absoluteIncrementValue = 1) {
        const session = window.CozyOS?.Session;
        if (!session) return;

        if (activeSubscriptionState.usageCurrent[metricKey] !== undefined) {
            activeSubscriptionState.usageCurrent[metricKey] += absoluteIncrementValue;
            
            const currentVal = activeSubscriptionState.usageCurrent[metricKey];
            const maxLimit = activeSubscriptionState.usageLimits[metricKey];

            // Automated warning notification dispatch boundary check
            if (currentVal >= maxLimit * 0.9) {
                Logger.warn("Billing Engine", `Quota Warning: Organization is approaching limit caps for metric type: ${metricKey}`);
                window.CozyOS?.Events?.publish("billing:limit_warning", { metricKey, currentVal, maxLimit });
            }

            await Storage.writeLocal("cozy_subscription_manifest", { key: `sub_${session.tenantId}`, ...activeSubscriptionState });
        }
    },

    /**
     * ATOMIC MUTATION: STRATEGY SUBSCRIPTION MUTATOR FOR ADMINISTRATORS
     */
    async transitionSubscriptionPlan({ targetPlanId, planName, modulesList, customLimits, paymentAdapterCode = "mpesa" }) {
        const session = window.CozyOS?.Session;
        if (!session) throw new Error("Context Verification Exception: Session structural references not valid.");

        // Explicit structural role mapping permission evaluation
        if (session.profile?.role !== "Owner" && session.profile?.role !== "Accountant") {
            throw new Error("🚫 Security Guard: Context profile identity lack subscription change authority.");
        }

        activeSubscriptionState.planId = targetPlanId;
        activeSubscriptionState.planName = planName;
        activeSubscriptionState.licensedModules = modulesList;
        activeSubscriptionState.usageLimits = { ...activeSubscriptionState.usageLimits, ...customLimits };
        activeSubscriptionState.status = "active";
        
        // Calculate dynamic future date ranges (e.g. adding 30-day corporate monthly subscription cycle windows)
        const renewalDate = new Date();
        renewalDate.setDate(renewalDate.getDate() + 30);
        activeSubscriptionState.expiresAt = renewalDate.toISOString();

        await Storage.writeLocal("cozy_subscription_manifest", { key: `sub_${session.tenantId}`, ...activeSubscriptionState });
        await AuditLogger.log("Subscription Change", `Tenant ${session.tenantId} upgraded to plan: ${planName} via API source payload adapter: ${paymentAdapterCode}`);
        
        return { success: true, updatedState: activeSubscriptionState };
    },

    /**
     * RETRIEVE PLAN ANALYTICS SCHEMAS
     */
    getSubscriptionSnapshot() {
        return {
            ...activeSubscriptionState,
            isEnforcingActiveBilling: SUBSCRIPTIONS_ENABLED
        };
    }
};

window.CozyOS = window.CozyOS || {};
window.CozyOS.Billing = module.exports.default;
