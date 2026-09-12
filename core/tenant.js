/**
 * ── COZYOS MULTI-TENANT ISOLATION ENGINE ──
 * FILE: core/tenant.js
 */

import Storage from './storage.js';
import AuditLogger from './audit.js';
import Logger from './logger.js';

export default {
    /**
     * 2.1 ORGANIZATION REGISTRATION PIPELINE
     */
    async registerOrganization({ id, name, type, country, county, defaultLanguage, planId, inspirationalMode = "secular" }) {
        const organizationSchema = {
            tenantId: id,
            organizationName: name,
            organizationType: type, // "School", "Retail", "M-Pesa Agent"
            country,
            county,
            timeZone: "Africa/Nairobi",
            defaultLanguage,
            currency: "KES",
            subscriptionPlan: planId,
            flags: { aiEnabled: true, inspirationalMode },
            modulesEnabled: ["dashboard", "finance", "students", "teachers", "reports", "wellbeing"],
            createdAt: new Date().toISOString()
        };

        // Write directly to isolated schema path using current Storage Engine
        await Storage.writeLocal("cozy_organizations", { key: id, ...organizationSchema });
        
        await AuditLogger.log("Organization Registered", `Generated isolated tenant space ${id} (${name}) under plan ${planId}`);
        return organizationSchema;
    },

    /**
     * 2.5 MULTI-TENANT CROSS-TALK PREVENTER
     * Enforces strict data access boundaries at the kernel layer
     */
    enforceTenantBoundary(requestingUserSession, targetDataPayload) {
        if (!requestingUserSession || !targetDataPayload) return false;
        
        // Block data access if the tenant IDs do not match
        if (requestingUserSession.tenantId !== targetDataPayload.tenantId) {
            Logger.error("Security Alert", `Unauthorized cross-tenant data access attempt by ${requestingUserSession.profile?.email}`);
            AuditLogger.log("SECURITY_VIOLATION", `Cross-tenant access blocked for user role: ${requestingUserSession.profile?.role}`);
            return false;
        }
        return true;
    }
};

window.CozyOS = window.CozyOS || {};
window.CozyOS.TenantEngine = module.exports.default;
