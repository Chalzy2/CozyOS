/**
 * ── COZYOS UNIVERSAL AI OPERATIONS GATEWAY CORE ──
 * DOMAIN: core/ai.js
 */

import { processVoiceSpeechToText } from './ai/voice.js';
import { processSmallBusinessVoiceIntent } from './ai/smallBizHandler.js';
import { processMpesaAgentVoiceIntent } from './ai/mpesaAgentHandler.js';
import { processBillingSystemIntent } from './ai/billingHandler.js';
import Permissions from './permissions.js';
import Logger from './logger.js';

window.CozyOS = window.CozyOS || {};

window.CozyOS.AI = {
    /**
     * MAIN AI EXECUTION ENGINE WRAPPER
     * Accepts voice input audio buffers or natural language text strings
     */
    async execute(inputPayload) {
        const session = window.CozyOS.Session;
        if (!session) {
            return { responseText: "Authentication missing. Please log in.", status: "error" };
        }

        // 1. If input is raw voice/audio speech, convert it to a unified text string first
        let cleanTextPrompt = typeof inputPayload === "string" ? inputPayload : await processVoiceSpeechToText(inputPayload);
        Logger.info("AI Core", `Processing unified intent for string: "${cleanTextPrompt}"`);

        const context = {
            language: session.profile?.language || "en",
            role: session.profile?.role || "Salesperson",
            tenantId: session.tenantId
        };

        // 2. Route Intent Level A: Subscription & Enterprise Plan Queries
        const billingResult = await processBillingSystemIntent(cleanTextPrompt, context);
        if (billingResult) return billingResult;

        // 3. Route Intent Level B: Mobile Money Agent Transactions
        if (Permissions.check("finance.read") || Permissions.check("agent.execute")) {
            const mpesaResult = await processMpesaAgentVoiceIntent(cleanTextPrompt, context);
            if (mpesaResult) return mpesaResult;
        }

        // 4. Route Intent Level C: Retail, Duka, & Small Business Operations
        if (Permissions.check("sales.write")) {
            const businessResult = await processSmallBusinessVoiceIntent(cleanTextPrompt, context);
            if (businessResult) return businessResult;
        }

        // 5. Default Fallback: Standard Gemini UI assistance if no specific industry patterns match
        return {
            responseText: `I analyzed your phrase "${cleanTextPrompt}", but it didn't trigger an automatic transaction workflow. Can you specify if you want to sell, record a deposit, or view your current profit statements?`,
            status: "ambiguous"
        };
    }
};
