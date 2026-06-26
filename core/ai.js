/**
 * ── COZYOS CENTRAL INTELLIGENCE GATEWAY CONTROLLER ──
 * FILE: core/ai.js
 * 
 * DESIGN PRINCIPLE: Kernel-First Plugin Architecture
 * Enforces dynamic runtime hot-swapping without modifying base kernel logic.
 */

import SecurityGuard from './permissions.js';
import AuditTrail from './audit.js';

// Setup global namespace registry if not already mounted by the system core bootloader
window.CozyOS = window.CozyOS || {};
window.CozyOS.IndustryRegistry = window.CozyOS.IndustryRegistry || new Map();

/**
 * Baseline Core Dynamic Registry Interface Architecture
 */
export const CoreIndustryRegistry = {
    /**
     * Registers a new industry module sub-handler into the active kernel memory map.
     * Can be invoked dynamically during runtime initialization or script lazy-loading.
     * @param {string} industryKey - Unique domain identifier (e.g., 'pharmacy', 'county')
     * @param {Function} handlerFunc - Stateless resolution handler matching architectural specs
     */
    register(industryKey, handlerFunc) {
        const key = industryKey.toLowerCase();
        window.CozyOS.IndustryRegistry.set(key, handlerFunc);
        console.log(`🔌 CozyOS Kernel: Dynamically mounted industry handler link -> [${key.toUpperCase()}]`);
    },

    /**
     * Removes an operational target safely from system routing configurations
     */
    unregister(industryKey) {
        window.CozyOS.IndustryRegistry.delete(industryKey.toLowerCase());
    }
};

// Seed our baseline architecture handlers directly into the dynamic registry matrix
// This maps our certified Stage 3 portfolio onto the new hot-registration model
const BASELINE_HANDLERS = {
    school: () => import('./ai/schoolHandler.js').then(m => m.processSchoolVoiceIntent || Object.values(m)[0]),
    business: () => import('./ai/businessHandler.js').then(m => m.processBusinessVoiceIntent || Object.values(m)[0]),
    retail: () => import('./ai/businessHandler.js').then(m => m.processBusinessVoiceIntent || Object.values(m)[0]),
    mpesa: () => import('./ai/mpesaHandler.js').then(m => m.processMpesaVoiceIntent || Object.values(m)[0]),
    church: () => import('./ai/churchHandler.js').then(m => m.processChurchVoiceIntent || Object.values(m)[0]),
    hospital: () => import('./ai/hospitalHandler.js').then(m => m.processHospitalVoiceIntent || Object.values(m)[0]),
    hotel: () => import('./ai/hotelHandler.js').then(m => m.processHotelVoiceIntent || Object.values(m)[0]),
    sacco: () => import('./ai/saccoHandler.js').then(m => m.processSaccoVoiceIntent || Object.values(m)[0]),
    agritech: () => import('./ai/agritechHandler.js').then(m => m.processAgritechVoiceIntent || Object.values(m)[0])
};

// Initialize foundational registry allocation blocks
Object.entries(BASELINE_HANDLERS).forEach(([key, factory]) => {
    CoreIndustryRegistry.register(key, async (query, context, security) => {
        const activeTargetFunction = await factory();
        return activeTargetFunction(query, context, security);
    });
});

export default {
    /**
     * Single Entry Point Natural Language Processing Routing Engine Interceptor
     * @param {string} rawPromptText - Raw user language input string
     * @param {Object} session - Authenticated execution context parameters from Firebase
     */
    async processVoiceIntent(rawPromptText, session) {
        // 1. Kernel Security Safeguard Guardrail & Tenant Isolation Enforcements
        if (!session || !session.tenantId || !session.profile?.role) {
            return { responseText: "🔒 Access Refused: Invalid context or missing token parameters.", pipelineState: "blocked" };
        }

        const normalizedQuery = rawPromptText.toLowerCase();
        const activeIndustry = session.industry?.toLowerCase();

        // 2. Automated Language Detection Vector
        const context = {
            tenantId: session.tenantId,
            role: session.profile.role,
            language: /leo|mauzo|bado|pesa|faida/.test(normalizedQuery) ? "sw" :
                      /tinde|pesa|nyisa|omiyoyo/.test(normalizedQuery) ? "luo" : "en"
        };

        // 3. Dynamic Registry Resolution Handshake
        const targetHandler = window.CozyOS.IndustryRegistry.get(activeIndustry);
        if (!targetHandler) {
            return {
                responseText: `⚠️ System Notification: Industry configuration block [${activeIndustry.toUpperCase()}] is not registered in this kernel context space.`,
                pipelineState: "unsupported"
            };
        }

        try {
            // 4. Invoke the stateless sub-handler function block
            // Passes down shared verification parameters directly from the system core
            const outcome = await targetHandler(normalizedQuery, context, SecurityGuard);

            if (!outcome) {
                return {
                    responseText: "💡 Dynamic AI Engine: Core matching rules returned no matching intent routines.",
                    pipelineState: "ambiguous"
                };
            }

            // 5. Immutable Core Audit Logging Integration Loop
            await AuditTrail.log(session, "AI_DYNAMIC_REQUEST_PASSED", `Query routed successfully to dynamic space handler: [${activeIndustry}]`);

            return outcome;

        } catch (error) {
            await AuditTrail.log(session, "AI_DYNAMIC_REGISTRY_FAULT", `System exception thrown in routing runtime: ${error.message}`);
            return {
                responseText: "🚨 Kernel Exception: Intermittent failure inside the industry plugin block.",
                pipelineState: "fault"
            };
        }
    }
};
