/**
 * ── COZYOS STRUCTURAL BUSINESS REVENUE AUDIT LOGGER ──
 * FILE: core/business/audit.js
 */

import Storage from '../storage.js';

export default {
    /**
     * WRITE EVENT PACKET DIRECTLY TO SECURED LEDGERS
     */
    async log(session, actionType, descriptiveNotes) {
        const auditLogNode = {
            eventId: `EVT_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            tenantId: session.tenantId,
            operatorEmail: session.profile?.email || "SYSTEM_DAEMON",
            assignedRole: session.profile?.role || "NONE",
            actionType, // "Login", "Sale", "Stock Added", "M-Pesa Action", "Price Changed"
            descriptiveNotes,
            timestamp: new Date().toISOString()
        };

        // Persist block record directly using underlying kernel engine layers
        await Storage.writeLocal("cozy_audit_events", { key: auditLogNode.eventId, ...auditLogNode });
        console.log(`[Audit Trail] [${actionType}] recorded safely for Tenant: ${session.tenantId}`);
    }
};
