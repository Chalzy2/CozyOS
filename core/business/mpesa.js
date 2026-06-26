/**
 * ── COZYOS M-PESA AGENT OPERATIONS UTILITY ──
 * FILE: core/business/mpesa.js
 */

import AuditLogger from './audit.js';

export default {
    /**
     * GENERATE TRANSACTION MATRIX PACKET
     */
    async executeAgentAction(session, { type, amount, targetIdentity, referenceNum }) {
        const state = window.CozyOS.OfflineEngine;
        const currentFloat = await state.getCachedFloat(session.tenantId);
        
        let calculatedCommission = 0;
        let runningFloatDelta = 0;

        // Structured Safaricom Agent Tier Approximations
        if (type === "Deposit") {
            runningFloatDelta = -amount;
            calculatedCommission = amount * 0.004; // 0.4% baseline agent tier tracking
        } else if (type === "Withdrawal") {
            runningFloatDelta = amount;
            calculatedCommission = amount * 0.005; 
        }

        const transactionPayload = {
            id: `MPESA_${Date.now()}`,
            tenantId: session.tenantId,
            type,
            amount,
            targetIdentity,
            referenceNum,
            calculatedCommission,
            processedBy: session.profile.email,
            timestamp: new Date().toISOString(),
            syncStatus: state.isOnline() ? "SYNCED" : "PENDING_SYNC"
        };

        if (state.isOnline()) {
            // Apply live balances
            await state.updateFloatLedger(session.tenantId, runningFloatDelta, calculatedCommission);
        } else {
            // Queue locally for later background reconciliation processing
            await state.queueOfflineTx(transactionPayload);
        }

        await AuditLogger.log(session, "M-Pesa Action Executed", `${type} of KES ${amount} handled via ${referenceNum}`);
        return transactionPayload;
    }
};
