/**
 * ── COZYOS SMALL BUSINESS AI INTENT ROUTER ──
 * FILE: core/ai/businessHandler.js
 */
import Permissions from '../permissions.js';

export async function processBusinessVoiceIntent(rawPromptText, context) {
    const query = rawPromptText.toLowerCase();

    // 1. Authorization Safeguard Guardrails
    if (query.includes("profit") || query.includes("faida") || query.includes("report") || query.includes("ohala")) {
        if (!Permissions.check("reports.export") && !Permissions.check("finance.read")) {
            return {
                responseText: context.language === "sw" ? "🔒 Hukumu: Huna ruhusa ya kuangalia ripoti za faida ya biashara." : "🔒 Access Refused: Your role lacks permission to review business profitability analytics.",
                pipelineState: "blocked"
            };
        }
    }

    // 2. Intent Engine Mapping
    if (query.includes("nimeuza") || query.includes("sold") || query.includes("record sale")) {
        if (!Permissions.check("sales.write")) {
            return { responseText: "🔒 Access Refused: Unauthorized to perform stock mutations or log sales.", pipelineState: "blocked" };
        }
        
        // Simulating immediate execution parsing parameters hooks
        return {
            responseText: "📦 <b>CozyOS POS:</b> Sale detected and processed. Inventory stock counts updated and WhatsApp receipt queued.",
            pipelineState: "processed",
            targetModule: "SmallBiz"
        };
    }

    if (query.includes("almost finished") || query.includes("low stock") || query.includes("bidhaa zimeisha")) {
        return {
            responseText: "⚠️ <b>Inventory Monitor:</b> 3 items are currently below your low stock threshold: Kuku (Chicken), and Maziwa (Milk Packets).",
            pipelineState: "processed",
            targetModule: "Inventory"
        };
    }

    return null;
}
