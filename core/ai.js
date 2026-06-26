/**
 * ── COZYOS CENTRAL INTELLIGENCE GATEWAY CONTROLLER ──
 * FILE: core/ai.js
 * 
 * CRITICAL RULE: This is the single entry point for all AI intent processing.
 * Industry modules inherit services entirely from the Kernel.
 */

import SecurityGuard from './permissions.js';
import AuditTrail from './audit.js';

// Dynamic Strategy Map for Industry Handlers
const SECTOR_REGISTRY = {
    school: () => import('./ai/schoolHandler.js'),
    business: () => import('./ai/businessHandler.js'),
    retail: () => import('./ai/businessHandler.js'), // Alias for shop/duka contexts
    mpesa: () => import('./ai/mpesaHandler.js'),
    agent: () => import('./ai/mpesaHandler.js'), // Alias
    church: () => import('./ai/churchHandler.js'),
    hospital: () => import('./ai/hospitalHandler.js'),
    hotel: () => import('./ai/hotelHandler.js'),
    sacco: () => import('./ai/saccoHandler.js'),
    chama: () => import('./ai/saccoHandler.js'), // Alias
    agritech: () => import('./ai/agritechHandler.js'),
    agrovet: () => import('./ai/agritechHandler.js'), // Alias

    /* Future Scalability Extension Vectors */
    county: () => import('./ai/countyHandler.js'),
    pharmacy: () => import('./ai/pharmacyHandler.js'),
    manufacturing: () => import('./ai/manufacturingHandler.js'),
    transport: () => import('./ai/transportHandler.js'),
    ngo: () => import('./ai/ngoHandler.js'),
    tourism: () => import('./ai/tourismHandler.js'),
    legal: () => import('./ai/legalHandler.js')
};

export default {
    /**
     * Centralized Natural Language Orchestration Pipeline
     * @param {string} rawPromptText - User spoken or typed prompt string
     * @param {Object} session - Authenticated execution profile context from Firebase
     */
    async processVoiceIntent(rawPromptText, session) {
        // 1. Kernel Security Safeguard Guardrail
        if (!session || !session.tenantId || !session.profile?.role) {
            return { responseText: "🔒 Access Refused: Invalid context or missing token parameters.", pipelineState: "blocked" };
        }

        const normalizedQuery = rawPromptText.toLowerCase();
        const activeIndustry = session.industry?.toLowerCase();

        // 2. Automated Language Detection Hook
        const context = {
            tenantId: session.tenantId,
            role: session.profile.role,
            language: /leo|mauzo|bado|pesa|faida/.test(normalizedQuery) ? "sw" :
                      /tinde|pesa|nyisa|omiyoyo/.test(normalizedQuery) ? "luo" : "en"
        };

        // 3. Dynamic Strategy Resolver
        const loader = SECTOR_REGISTRY[activeIndustry];
        if (!loader) {
            return {
                responseText: `⚠️ Error: The active subsystem workspace profile [${activeIndustry.toUpperCase()}] is not mapped to this kernel cluster core.`,
                pipelineState: "unsupported"
            };
        }

        try {
            // 4. Lazy-load Industry Handler on demand to preserve low memory overhead
            const module = await loader();
            const handlerName = `process${activeIndustry.charAt(0).toUpperCase() + activeIndustry.slice(1)}VoiceIntent`;
            const sectorTargetFunction = module[handlerName] || Object.values(module)[0];

            // 5. Handshake Execution via Kernel Access and Isolation Layers
            // Sub-handlers expect security data passed directly from the Kernel
            const outcome = await sectorTargetFunction(normalizedQuery, context, SecurityGuard);

            if (!outcome) {
                return {
                    responseText: "💡 Core AI Engine: Intent could not be confidently mapped to a module action mutation script.",
                    pipelineState: "ambiguous"
                };
            }

            // 6. Immutable Kernel Audit Logger Push
            await AuditTrail.log(session, "AI_REQUEST_PROCESSED", `Query parsed via [${activeIndustry}Handler.js]. State: ${outcome.pipelineState}`);

            return outcome;

        } catch (error) {
            await AuditTrail.log(session, "AI_EXCEPTION_FAULT", `System fault in sector handler: ${error.message}`);
            return {
                responseText: "🚨 Kernel Exception: Intermittent processing fault inside the industry application layer loop.",
                pipelineState: "fault"
            };
        }
    }
};
