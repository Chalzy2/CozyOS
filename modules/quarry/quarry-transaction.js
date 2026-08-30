/**
 * CozyOS Quarry Manager — Shared Transaction Compensation Helper
 * Wraps the common "write a storage record, then route money through
 * Finance" pattern used across loans, sales, royalties, expenses, and
 * payroll. If the storage write succeeds but the downstream Finance
 * call fails or throws, this compensates by marking the storage record
 * reversed (rather than leaving an orphaned, unsettled record behind).
 *
 * Does not change the storage schema or the Finance adapter contract —
 * it only sequences existing calls and adds a `reversed`/`reversalReason`
 * flag to records on rollback. Attaches to
 * window.CozyOS.Shared.QuarryTransaction.
 */
"use strict";

(function () {
    if (!window.CozyOS) window.CozyOS = {};
    if (!window.CozyOS.Shared) window.CozyOS.Shared = {};

    /**
     * @param {object} opts
     * @param {object} opts.record - the record already (or about to be) persisted
     * @param {string} opts.collection - storage collection the record lives in
     * @param {string} opts.idField - field name on record used as its primary key
     * @param {Function} opts.insert - async () => insert the record (no-op if already inserted)
     * @param {Function} opts.financeCall - async () => calls _routeExternalFinancialLegger(...)
     */
    async function runWithCompensation({ record, collection, idField, insert, financeCall }) {
        const storage = window.CozyOS?.Storage;

        if (typeof insert === "function") {
            await insert();
        }

        try {
            const financeResponse = await financeCall();
            return { record, financeResponse, rolledBack: false };
        } catch (err) {
            console.warn(`⚠️ [Quarry Transaction] Finance step failed for ${collection}/${record?.[idField]} — compensating.`, err.message);

            if (storage && typeof storage.update === "function" && record && idField) {
                try {
                    await storage.update(collection, { [idField]: record[idField] }, {
                        reversed: true,
                        reversalReason: err.message
                    });
                } catch (compErr) {
                    console.warn("⚠️ [Quarry Transaction] Compensation write also failed:", compErr.message);
                }
            }

            return {
                record,
                financeResponse: { state: "Failed_RolledBack", digest: null, error: err.message },
                rolledBack: true
            };
        }
    }

    window.CozyOS.Shared.QuarryTransaction = { runWithCompensation };
})();
