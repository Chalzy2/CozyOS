/**
 * ── COZYOS M-PESA AGENT ASSISTANT AI ROUTER ──
 * FILE: core/ai/mpesaHandler.js
 */
import Permissions from '../permissions.js';

export async function processMpesaVoiceIntent(rawPromptText, context) {
    const query = rawPromptText.toLowerCase();

    // 1. Strict Functional Permission Checking
    if (query.includes("withdraw") || query.includes("toa") || query.includes("deposit") || query.includes("weka")) {
        if (!Permissions.check("finance.write") && !Permissions.check("agent.execute")) {
            return {
                responseText: "🔒 Access Refused: Missing authorized agent session verification keys.",
                pipelineState: "blocked"
            };
        }
    }

    // 2. Core Workflow Automation Parsing
    if (query.includes("commission") || query.includes("earned today")) {
        return {
            responseText: "💰 <b>Agent Matrix:</b> Your calculated approximate ledger commission accrued today stands at <b>KES 1,450.00</b>.",
            pipelineState: "processed",
            targetModule: "MpesaAgent"
        };
    }

    if (query.includes("who made the last")) {
        if (!Permissions.check("finance.read")) return { responseText: "🔒 Access Refused.", pipelineState: "blocked" };
        return {
            responseText: "🕒 <b>Transaction Slip:</b> The last operation was a withdrawal of KES 2,000 processed by Cashier: MARY WAMBUI.",
            pipelineState: "processed",
            targetModule: "MpesaAgent"
        };
    }

    return null;
}
