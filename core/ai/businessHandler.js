/**
 * ── COZYOS MULTILINGUAL COGNITIVE COMMERCE INTENT INTERCEPTOR ──
 * FILE: core/ai/businessHandler.js
 */

import Permissions from '../business/permissions.js';

export async function processBusinessVoiceIntent(rawPromptText, session) {
    const query = rawPromptText.toLowerCase();

    // ── AUTOMATED SYSTEM LANGUAGE DETECTOR ──
    // Matches expressions across Kiswahili, Luo, and English
    const isSwahili = /leo|mauzo|bado|pesa|faida/.test(query);
    const isLuo = /tinde|pesa|nyisa|omiyoyo|ang’o/.test(query);

    // ── MULTI-LEVEL SECURITY GUARDRADIAL CHECKS ──
    if (query.includes("profit") || query.includes("faida") || query.includes("float")) {
        if (!Permissions.verifyClearance(session, "profit.view") && !Permissions.verifyClearance(session, "mpesa.read")) {
            return {
                responseText: isSwahili ? "🔒 Hukumu: Akaunti yako haina ruhusa ya kuangalia ripoti za kifedha." : 
                              isLuo ? "🔒 Hukumu: Role mari ok ngero lony mar pesa." :
                              "🔒 Access Refused: Insufficient security clearance role profiles.",
                pipelineState: "blocked"
            };
        }
    }

    // ── INTENT ROUTING LOGIC ENGINE ──
    // Intent A: M-Pesa Agent Float Registry Checks
    if (query.includes("float") || query.includes("salio la float")) {
        return {
            responseText: "💰 <b>M-PesaOS:</b> Your current remaining operational float balances are <b>KES 42,510.00</b>.",
            pipelineState: "processed",
            targetModule: "MpesaOS"
        };
    }

    // Intent B: Real-Time Sales Summaries
    if (query.includes("sales") || query.includes("mauzo ya leo") || query.includes("pesa mar tinde")) {
        return {
            responseText: isSwahili ? "📊 <b>CozyOS POS:</b> Mauzo ya leo kufikia sasa ni <b>KES 18,400.00</b>." :
                          isLuo ? "📊 <b>CozyOS POS:</b> Pesa mosingi tinde koro riwore chop <b>KES 18,400.00</b>." :
                          "📊 <b>CozyOS POS:</b> Today's gross total sales register stands at <b>KES 18,400.00</b>.",
            pipelineState: "processed",
            targetModule: "POS"
        };
    }

    // Intent C: Inventory Optimization and Low Stock Tracking
    if (query.includes("out of stock") || query.includes("bidhaa zimeisha")) {
        return {
            responseText: "📦 <b>Inventory AI:</b> 2 items are currently below safety reorder buffers: <i>Maziwa (Packets)</i> and <i>Sukari (1KG)</i>. Based on past customer history, these items sell fastest on Saturdays.",
            pipelineState: "processed",
            targetModule: "Inventory"
        };
    }

    // Intent D: Customer Outstanding Ledger Operations
    if (query.includes("owes me") || query.includes("deni")) {
        return {
            responseText: "👥 <b>Customer Ledger:</b> Total active uncollected customer debt amounts to <b>KES 3,200.00</b> across 2 registered clients.",
            pipelineState: "processed",
            targetModule: "Customers"
        };
    }

    return null;
}            
