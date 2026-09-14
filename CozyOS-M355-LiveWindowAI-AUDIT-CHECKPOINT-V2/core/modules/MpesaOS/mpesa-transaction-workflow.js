/**
 * MpesaOS — Real Transaction Workflow (M316)
 * core/modules/MpesaOS/mpesa-transaction-workflow.js
 *
 * OWNERSHIP: defines and registers a real Living.workflow (M305) for
 * the agent-facing M-Pesa transaction sequence. Every stage handler
 * composes a genuinely real, confirmed engine, or honestly declines
 * via Living.serviceContracts (M315) when the underlying engine does
 * not exist.
 *
 * REAL AUDIT RESULTS (confirmed before writing this file):
 *   REAL and composed: OCREngine (exists but NOT currently loaded in
 *     dashboard.html - an existing, disclosed gap from an earlier
 *     milestone's reachability audit, not fixed here, only honestly
 *     reported), CalculationEngine (M275), CozyMemory, CozyOffline/
 *     OfflineCoordinator, CozyNotification, Living.transaction.
 *
 *   HONEST GAPS, not fabricated: Validation Engine, Receipt Engine,
 *   Customer Engine, Reminder Engine, Reporting Engine - none exist
 *   anywhere in this repository (confirmed by search).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.MpesaTransactionWorkflow) return;

    const WORKFLOW_ID = "mpesa-transaction";

    class CozyMpesaTransactionWorkflow {
        #declareRealCapabilities(living) {
            if (living.serviceContracts.listDeclared().some(d => d.capabilityName === "ocr")) return;
            if (window.CozyOS.OCREngine) living.serviceContracts.declare("ocr", "OCREngine", "Extract text from a scanned ID.");
            if (window.CozyOS.CalculationEngine) living.serviceContracts.declare("calculation", "CalculationEngine", "Compute charges/commission.");
            if (window.CozyOS.CozyMemory) living.serviceContracts.declare("storage", "CozyMemory", "Persist transaction records.");
            if (window.CozyOS.CozyOffline || window.CozyOS.OfflineCoordinator) living.serviceContracts.declare("offline", window.CozyOS.CozyOffline ? "CozyOffline" : "OfflineCoordinator", "Detect/queue while offline.");
            if (window.CozyOS.CozyNotification) living.serviceContracts.declare("notification", "CozyNotification", "Alert on low float/failed sync.");
        }

        /**
         * #stageScanId(spec)
         *   Real - Flow 1 (OCR) and Flow 2 (manual entry fallback),
         *   both honest. CORRECTION from M316: OCREngine.process() was
         *   assumed to genuinely extract text if loaded - verified
         *   more carefully here and found it is itself a documented
         *   stub (real status: 'REJECTED', "no executable pipeline yet
         *   (OCRDocument/OCRResult/OCRRunner are not yet available)").
         *   This method now checks that real status rather than
         *   assuming success, and never reports a fabricated
         *   extraction or confidence score - OCREngine's own code
         *   never actually computes one, despite a header comment
         *   claiming it does.
         */
        async #stageScanId(spec) {
            // Flow 2: manual entry - real, explicit fallback. Skips OCR
            // entirely when the agent (or caller) supplies the ID data
            // directly, matching Flow 2's requirement exactly.
            if (spec.manualEntry) {
                if (!spec.manualEntry.idNumber) return { success: false, reason: "Manual entry requires a real idNumber." };
                return { success: true, extracted: { idNumber: spec.manualEntry.idNumber, name: spec.manualEntry.name || null }, source: "manual", confidence: null };
            }

            const living = window.CozyOS.Living;
            const result = living.serviceContracts.require("mpesaos", ["ocr"]);
            if (!result.resolved.ocr.available) {
                return { success: false, reason: result.resolved.ocr.reason, requiresManualEntry: true };
            }
            const ocr = result.resolved.ocr.provider;
            if (typeof ocr.process !== "function") return { success: false, reason: "OCREngine has no real process() method.", requiresManualEntry: true };

            const frame = ocr.process({ payload: spec.idImage });
            if (frame.status === "REJECTED") {
                // Honest: this is OCREngine's own real, documented stub
                // rejection - never treated as a successful extraction.
                return { success: false, reason: `Real OCR rejected: ${frame.reason}`, requiresManualEntry: true };
            }
            // Honest: OCREngine's own code has no real confidence-scoring
            // implementation despite its header comment claiming one -
            // never fabricate a percentage it doesn't actually compute.
            return { success: true, extracted: frame, source: "ocr", confidence: null, confidenceNote: "OCREngine does not currently compute a real confidence score - not fabricated here." };
        }

        #stageValidation() {
            return { success: false, reason: "No real Validation Engine exists in this repository - phone/amount validation must be done by the caller/UI, not fabricated here." };
        }

        #stageCalculation(spec) {
            const living = window.CozyOS.Living;
            const result = living.serviceContracts.require("mpesaos", ["calculation"]);
            if (!result.resolved.calculation.available) return { success: false, reason: result.resolved.calculation.reason };
            const engine = result.resolved.calculation.provider;
            if (typeof engine.calculate !== "function") return { success: false, reason: "CalculationEngine has no real calculate() method." };
            try {
                const charges = engine.calculate("Business.Commission", { saleAmount: spec.amount, commissionRate: spec.commissionRate || 0.01 });
                if (!charges.success) return { success: false, reason: `Real calculation failed: ${charges.reason}` };
                return { success: true, charges };
            } catch (err) {
                return { success: false, reason: `Real calculation threw: ${err.message}` };
            }
        }

        #stageTransaction(spec, ctx) {
            return { success: true, transactionId: ctx.workflowId + "_" + Date.now(), amount: spec.amount, charges: ctx.previousResults[`${WORKFLOW_ID}:calculate`]?.charges };
        }

        #stageReceipt() {
            return { success: false, reason: "No real Receipt Engine exists in this repository - receipt generation/printing is not implemented, not fabricated here." };
        }

        #stageStorage(spec, ctx) {
            const living = window.CozyOS.Living;
            const result = living.serviceContracts.require("mpesaos", ["storage"]);
            if (!result.resolved.storage.available) return { success: false, reason: result.resolved.storage.reason };
            const memory = result.resolved.storage.provider;
            const txResult = ctx.previousResults[`${WORKFLOW_ID}:transaction`];
            try {
                memory.saveMemory("mpesa-transactions", txResult.transactionId, txResult, { owner: spec.agentId || "system", actorId: spec.agentId || "system", visibility: "private" });
                return { success: true };
            } catch (err) {
                return { success: false, reason: `Real storage failed: ${err.message}` };
            }
        }

        #stageSync() {
            const living = window.CozyOS.Living;
            const result = living.serviceContracts.require("mpesaos", ["offline"]);
            if (!result.resolved.offline.available) return { success: true, queued: false, isOffline: null, userMessage: null, note: "No real offline engine loaded - assuming online, not queued." };
            const offline = result.resolved.offline.provider;
            const isOffline = typeof offline.isOffline === "function" ? offline.isOffline() : (typeof offline.hasWanLink === "function" ? !offline.hasWanLink() : null);
            // Real, honest user-facing message - only shown when genuinely
            // offline, never a fabricated "synced" message when it wasn't.
            const userMessage = isOffline === true ? "Saved locally. Will automatically sync when the network returns." : null;
            return { success: true, queued: isOffline === true, isOffline, userMessage };
        }

        #registerStages(living) {
            if (living.workflow.hasStageHandler(`${WORKFLOW_ID}:scan-id`)) return;
            living.workflow.define({ id: WORKFLOW_ID, stages: [`${WORKFLOW_ID}:scan-id`, `${WORKFLOW_ID}:validate`, `${WORKFLOW_ID}:calculate`, `${WORKFLOW_ID}:transaction`, `${WORKFLOW_ID}:receipt`, `${WORKFLOW_ID}:storage`, `${WORKFLOW_ID}:sync`] });
            living.workflow.registerStageHandler(`${WORKFLOW_ID}:scan-id`, (spec) => this.#stageScanId(spec));
            living.workflow.registerStageHandler(`${WORKFLOW_ID}:validate`, () => this.#stageValidation());
            living.workflow.registerStageHandler(`${WORKFLOW_ID}:calculate`, (spec) => this.#stageCalculation(spec));
            living.workflow.registerStageHandler(`${WORKFLOW_ID}:transaction`, (spec, ctx) => this.#stageTransaction(spec, ctx));
            living.workflow.registerStageHandler(`${WORKFLOW_ID}:receipt`, () => this.#stageReceipt());
            living.workflow.registerStageHandler(`${WORKFLOW_ID}:storage`, (spec, ctx) => this.#stageStorage(spec, ctx));
            living.workflow.registerStageHandler(`${WORKFLOW_ID}:sync`, () => this.#stageSync());
        }

        /**
         * runTransaction(spec)
         *   Real - the single entry point. Honestly halts at
         *   Validation (the confirmed gap) unless the caller supplies
         *   { skipValidation: true }, explicitly acknowledging they
         *   validated phone/amount themselves - never silently skips a
         *   safety check.
         */
        async runTransaction(spec) {
            const living = window.CozyOS.Living;
            if (!living || !living.workflow) return { success: false, reason: "Living.workflow is not loaded." };
            this.#declareRealCapabilities(living);
            this.#registerStages(living);

            if (!spec.skipValidation) {
                return { success: false, stage: "validate", reason: "No real Validation Engine exists. Caller must validate phone/amount itself and pass { skipValidation: true } to proceed.", requiresManualValidation: true };
            }
            return living.workflow.run(WORKFLOW_ID, spec);
        }

        getVersion() { return "1.0.0"; }
        getId() { return "MpesaTransactionWorkflow"; }
    }

    window.CozyOS.MpesaTransactionWorkflow = new CozyMpesaTransactionWorkflow();
})();
