/**
 * ── COZYOS AUDIT LOG LAYER ENGINE ──
 * SERVICE DOMAIN: core/audit.js
 * REFERENCES: 665036.jpg, 665037.jpg
 */

import Permissions from './permissions.js';

export default {
    /**
     * Appends runtime actions directly into our decoupled data storage array layer.
     * Catches and standardizes all core actions required by 665037.jpg.
     */
    async log(actionType, descriptionsPayload) {
        const session = Permissions.getSession();
        
        const auditEntry = {
            timestamp: new Date().toISOString(),
            actionType, // Login, Logout, Print, Export PDF, AI Request, Money Received, Money Refunded, Deleted Records, Settings Changes
            userId: session ? session.userId : "unauthenticated_system_process",
            organizationId: session ? session.organizationId : "system_level",
            workspaceId: session ? session.workspaceId : "system_level",
            description: descriptionsPayload,
            clientNetworkStatus: navigator.onLine ? "online" : "offline"
        };

        console.log(`[COZYOS AUDIT MONITOR] [${actionType}]`, auditEntry);

        // Save immediately to local offline tracker first
        if (window.CozyOS?.LocalStorageEngine) {
            await window.CozyOS.LocalStorageEngine.save("audit_ledger_trail", auditEntry);
        }

        // If the system state is online, push to centralized cloud infrastructure
        if (navigator.onLine && window.CozyOS?.FirebaseCloudEngine) {
            try {
                await window.CozyOS.FirebaseCloudEngine.push("system_audit_logs", auditEntry);
            } catch (fault) {
                console.warn("Audit syncing deferred to background queues.", fault);
            }
        }
    }
};
