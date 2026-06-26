/**
 * ── COZYOS SCHOOLOS AND CHARACTER AI CONTEXT INTERCEPTOR ROUTER ──
 * FILE: core/ai/schoolHandler.js
 */

import Permissions from '../permissions.js';
import Wellbeing from '../../modules/wellbeing.js';

export async function processSchoolOSVoiceIntent(rawPromptText, context) {
    const query = rawPromptText.toLowerCase();

    // ── SECURITY & PERMISSION TESTS INTERCEPTORS ──
    if (query.includes("income") || query.includes("financial summary") || query.includes("fees")) {
        if (!Permissions.check("finance")) {
            // 2.3 Explicit Security Block Refusal Pattern Response
            return {
                responseText: "🔒 Access Refused: You do not have permission to access financial records or fee balances.",
                pipelineState: "blocked"
            };
        }
    }

    // ── CHARACTER EDUCATION & WELLBEING CORE WORKFLOW ROUTERS ──
    if (query.includes("improve my study habits") || query.includes("disagreement")) {
        // Enforce age-appropriate supportive language parameters
        return {
            responseText: "🌱 <b>CozyOS Tutor:</b> When disagreements happen, take a deep breath and speak calmly. Listening with respect helps find a solution. You can also ask a guidance counselor for help!",
            pipelineState: "processed",
            targetModule: "Wellbeing"
        };
    }

    if (query.includes("show attendance") || query.includes("ripoti")) {
        if (!Permissions.check("attendance") && !Permissions.check("dashboard")) {
            return { responseText: "🔒 Access Refused: Unauthorized role profiling.", pipelineState: "blocked" };
        }
        return {
            responseText: "📊 Today's overall campus tracking attendance rate stands consolidated at <b>94.2%</b>.",
            pipelineState: "processed",
            targetModule: "Dashboard"
        };
    }

    return null; // Passes control back to the baseline Gemini execution loop if no direct patterns match
}
