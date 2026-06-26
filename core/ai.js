/**
 * ── COZYOS CORE MULTI-TENANT AI OPERATIONS GATEWAY ──
 * DOMAIN: core/ai.js
 * REFERENCE: [source: 1]
 */

import Permissions from './permissions.js';
import AuditLogger from './audit.js';
import Config from './config.js';

export default {
    /**
     * Entry hook endpoint from [source: 1]: CozyOS.AI.execute({module, action, payload})
     */
    async execute({ module = "General", action = "readState", payload = {} }) {
        const session = window.CozyOS.Session;

        // 1. Validate Session Authentication Boundary
        if (!session || !session.authenticated) {
            throw new Error("🚫 Security Intercept: Context structure uninitialized or unauthenticated.");
        }

        // 2. Universal Multi-Tenant Cross-Contamination Guard Frame Check
        const targetOrgCheck = payload.organizationId || session.organizationId;
        const targetWorkspaceCheck = payload.workspaceId || session.workspaceId;

        if (targetOrgCheck !== session.organizationId || targetWorkspaceCheck !== session.workspaceId) {
            await AuditLogger.log("Security Exception", `Cross-Tenant boundary access blocked for User ${session.userId}`);
            throw new Error("🚨 Cross-Tenant Security Block: Execution aborted. Attempted resource access outside tenant workspace context.");
        }

        // 3. Enforce Fine-Grained Active Scope Permissions Token Matrix Checks
        if (!Permissions.check("ai.execute")) {
            throw new Error(`🚫 Access Blocked: Context account is missing explicit fine-grained string token 'ai.execute'.`);
        }

        // Module operational checkpoint (e.g., finance.read scope validation verification checks)
        if (module.toLowerCase() === "finance" && !Permissions.check("finance.read")) {
            throw new Error(`🚫 Access Blocked: Operational request context missing required 'finance.read' scope token validation profile.`);
        }

        // 4. Handle Offline Execution Scopes
        if (!navigator.onLine) {
            if (window.CozyOS.SyncEngine?.enqueueMutation) {
                await window.CozyOS.SyncEngine.enqueueMutation("queued_ai_jobs", "SET", {
                    id: `ai_${Date.now()}`, module, action, payload, processed: false
                });
                return "Task cached locally. Synchronization will process automatically when network connectivity returns.";
            }
            throw new Error("🚨 Connectivity Intercept: Offline. Request dropped because storage queues are disconnected.");
        }

        // 5. Fire Request with Isolated Context Variables
        try {
            const resultText = await this._dispatchToIsolatedLLM(module, action, payload, session);

            // 6. Record Ledger Entry Trail (Audit System Hook)
            await AuditLogger.log("AI request", `Executed [${module}:${action}] for Session ID: ${session.sessionId}`);

            return resultText;
        } catch (fault) {
            console.error("AI Node Execution Defect Trace:", fault);
            throw fault;
        }
    }
};

// Bind directly into system core global context array maps
window.CozyOS.AI = {
    execute: async (argsObject) => {
        const moduleInstance = await import('./ai.js');
        return await moduleInstance.default.execute(argsObject);
    }
};        

        
