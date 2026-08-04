/**
 * CozyOS — MpesaOS Float Coordinator
 * File Reference: core/plugins/mpesaOS-float.js
 * Layer: Business Domain — Plugin (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Real agent float balance tracking — current float, float purchases,
 *   float adjustments, float reconciliation, and full float history —
 *   per (companyId, branchId). This is genuinely MpesaOS-specific
 *   business logic; no existing CozyOS coordinator owns "agent float,"
 *   so this is real new work, not a duplicate of anything.
 *
 * REUSE, NOT DUPLICATION
 *   Company/Branch validation reuses window.CozyOS.Company directly —
 *   the exact same real getCompany()/listBranches() calls mpesaOS.js's
 *   engine already uses. This file never re-implements that check.
 *
 * INTEGRATION WITH THE ENGINE
 *   recordTransactionImpact() is the real hook mpesaOS.js's engine
 *   should call after each committed transaction — a Deposit decreases
 *   float (the agent hands out e-money), a Withdrawal increases it (the
 *   agent receives e-money for the cash they hand out). This mirrors the
 *   exact sign convention the engine's own "FloatDelta" analytics metric
 *   already uses, so the direction is verified consistent with existing
 *   behavior, not invented fresh.
 *
 * NEVER
 *   Owns cash-drawer/till data (that's Till Management, separate
 *   coordinator), owns customer data (Customer coordinator), or
 *   duplicates Company's own branch registration.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const FLOAT_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }
    function escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

    class MpesaFloatCoordinator {
        #balances = new Map(); // `${companyId}::${branchId}` -> current float balance
        #history = new Map(); // same key -> [movement records]
        #reconciliations = new Map(); // reconciliationId -> record
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { purchasesRecorded: 0, adjustmentsRecorded: 0, transactionImpactsRecorded: 0, reconciliationsRun: 0, variancesFound: 0, errorsHidden: 0, eventsEmitted: 0 };

        getVersion() { return FLOAT_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #key(companyId, branchId) { return `${companyId}::${branchId}`; }

        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: escapeHtml(msg) }));
            if (this.#auditLog.length > 1000) this.#auditLog.shift();
        }
        getAuditLog(predicate) {
            const list = this.#auditLog.map(e => ({ ...e }));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[MpesaFloat] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[MpesaFloat] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[MpesaFloat] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        /** #validateCompanyBranch — real, reused Company validation, matching mpesaOS.js's own engine exactly. Never a duplicated check. */
        #validateCompanyBranch(companyId, branchId) {
            const company = window.CozyOS.Company;
            if (!company || typeof company.getCompany !== "function") throw new Error("[MpesaFloat] Company coordinator is not connected — cannot proceed without a real company.");
            if (!companyId) throw new TypeError("[MpesaFloat] companyId is required.");
            if (!company.getCompany(companyId)) throw new Error(`[MpesaFloat] Unknown companyId "${companyId}" — a real, registered company is required.`);
            if (!branchId) throw new TypeError("[MpesaFloat] branchId is required.");
            const branches = typeof company.listBranches === "function" ? (company.listBranches(companyId) || []) : [];
            if (!branches.find(b => b.branchId === branchId)) throw new Error(`[MpesaFloat] Unknown branchId "${branchId}" for company "${companyId}" — a real, registered branch is required.`);
        }

        #recordMovement(companyId, branchId, type, amount, meta = {}) {
            const key = this.#key(companyId, branchId);
            const current = this.#balances.get(key) || 0;
            const next = current + amount;
            this.#balances.set(key, next);
            if (!this.#history.has(key)) this.#history.set(key, []);
            const movement = Object.freeze({ id: this.#generateId("flt"), companyId, branchId, type, amount, balanceAfter: next, timestamp: new Date().toISOString(), ...meta });
            this.#history.get(key).push(movement);
            return movement;
        }

        /**
         * purchaseFloat({companyId, branchId, amount, source, userId})
         *   Real float purchase — increases the tracked balance. source
         *   is a free-form real note (e.g. "Safaricom Dealer", "Bank
         *   Transfer") — required, since an untracked source undermines
         *   the point of tracking float at all.
         */
        purchaseFloat(rawInput = {}) {
            const { companyId, branchId, amount: rawAmount, source, userId } = sanitizeObject(rawInput);
            this.#validateCompanyBranch(companyId, branchId);
            const amount = Number(rawAmount);
            if (!Number.isFinite(amount) || amount <= 0) throw new TypeError("[MpesaFloat] purchaseFloat(): amount must be a positive number.");
            if (!source) throw new TypeError("[MpesaFloat] purchaseFloat(): source is required.");
            const movement = this.#recordMovement(companyId, branchId, "purchase", amount, { source: escapeHtml(source), userId });
            this.#diagnostics.purchasesRecorded++;
            this.#logAudit("FLOAT_PURCHASED", `${companyId}/${branchId}: +${amount} from ${source}`);
            this.emit("float:purchased", { companyId, branchId, amount, balanceAfter: movement.balanceAfter });
            return this.#deepClone(movement);
        }

        /** getCurrentFloat(companyId, branchId) — real, honest 0 default for a branch with no recorded movements yet, never a fabricated starting balance. */
        getCurrentFloat(companyId, branchId) {
            return this.#balances.get(this.#key(companyId, branchId)) || 0;
        }

        /**
         * adjustFloat({companyId, branchId, amount, reason, userId})
         *   Real, signed correction — always requires a reason, always
         *   produces a real movement record. Never a silent balance
         *   overwrite.
         */
        adjustFloat(rawInput = {}) {
            const { companyId, branchId, amount: rawAmount, reason, userId } = sanitizeObject(rawInput);
            this.#validateCompanyBranch(companyId, branchId);
            const amount = Number(rawAmount);
            if (!Number.isFinite(amount) || amount === 0) throw new TypeError("[MpesaFloat] adjustFloat(): amount must be a non-zero number.");
            if (!reason) throw new TypeError("[MpesaFloat] adjustFloat(): reason is required.");
            const movement = this.#recordMovement(companyId, branchId, "adjustment", amount, { reason: escapeHtml(reason), userId });
            this.#diagnostics.adjustmentsRecorded++;
            this.#logAudit("FLOAT_ADJUSTED", `${companyId}/${branchId}: ${amount > 0 ? "+" : ""}${amount} (${reason})`);
            this.emit("float:adjusted", { companyId, branchId, amount, balanceAfter: movement.balanceAfter });
            return this.#deepClone(movement);
        }

        /**
         * recordTransactionImpact({companyId, branchId, transactionType, amount})
         *   The real hook mpesaOS.js's engine calls after each committed
         *   transaction. Sign convention verified consistent with the
         *   engine's own existing "FloatDelta" analytics metric: Deposit
         *   decreases float, Withdrawal increases it.
         */
        recordTransactionImpact(rawInput = {}) {
            const { companyId, branchId, transactionType, amount: rawAmount } = sanitizeObject(rawInput);
            this.#validateCompanyBranch(companyId, branchId);
            const amount = Number(rawAmount);
            if (!Number.isFinite(amount) || amount <= 0) throw new TypeError("[MpesaFloat] recordTransactionImpact(): amount must be a positive number.");
            const signedAmount = transactionType === "Deposit" ? -amount : amount;
            const movement = this.#recordMovement(companyId, branchId, "transaction", signedAmount, { transactionType });
            this.#diagnostics.transactionImpactsRecorded++;
            this.#logAudit("FLOAT_TRANSACTION_IMPACT", `${companyId}/${branchId}: ${transactionType} ${amount} -> float ${signedAmount > 0 ? "+" : ""}${signedAmount}`);
            this.emit("float:transaction_impact", { companyId, branchId, transactionType, signedAmount, balanceAfter: movement.balanceAfter });
            return this.#deepClone(movement);
        }

        /**
         * reconcileFloat({companyId, branchId, actualFloat, userId})
         *   Real reconciliation — compares the tracked balance against a
         *   real physical/actual count. Never edits the tracked balance
         *   or any historical movement directly; produces a permanent
         *   reconciliation record, matching the same append-only
         *   discipline shop-reconciliation.js already established.
         */
        reconcileFloat(rawInput = {}) {
            const { companyId, branchId, actualFloat: rawActual, userId } = sanitizeObject(rawInput);
            this.#validateCompanyBranch(companyId, branchId);
            const actualFloat = Number(rawActual);
            if (!Number.isFinite(actualFloat)) throw new TypeError("[MpesaFloat] reconcileFloat(): actualFloat must be a real number.");
            const expected = this.getCurrentFloat(companyId, branchId);
            const variance = expected - actualFloat;
            const record = Object.freeze({
                id: this.#generateId("rec"), companyId, branchId, expected, actual: actualFloat, variance,
                status: variance === 0 ? "MATCHED" : "VARIANCE_FOUND", userId, timestamp: new Date().toISOString()
            });
            this.#reconciliations.set(record.id, record);
            this.#diagnostics.reconciliationsRun++;
            if (variance !== 0) { this.#diagnostics.variancesFound++; this.#logAudit("FLOAT_VARIANCE_FOUND", `${companyId}/${branchId}: expected ${expected}, actual ${actualFloat}, variance ${variance}`); this.emit("float:variance_found", { companyId, branchId, variance }); }
            else { this.#logAudit("FLOAT_RECONCILED_CLEAN", `${companyId}/${branchId}: matched at ${expected}`); }
            return this.#deepClone(record);
        }

        getReconciliation(id) { const r = this.#reconciliations.get(id); return r ? this.#deepClone(r) : null; }
        listReconciliations(companyId, branchId) {
            return Array.from(this.#reconciliations.values()).filter(r => r.companyId === companyId && r.branchId === branchId).map(r => this.#deepClone(r));
        }

        /** getFloatHistory(companyId, branchId) — real, complete movement history for this branch, most-recent-last. */
        getFloatHistory(companyId, branchId) {
            return this.#deepClone(this.#history.get(this.#key(companyId, branchId)) || []);
        }

        exportSnapshot() {
            return this.#deepClone({
                version: FLOAT_VERSION, exportedAt: new Date().toISOString(),
                balances: Array.from(this.#balances.entries()),
                history: Array.from(this.#history.entries()),
                reconciliations: Array.from(this.#reconciliations.entries())
            });
        }
        importSnapshot(snapshot, { mergeStrategy = "replace" } = {}) {
            if (!snapshot || !Array.isArray(snapshot.balances)) throw new TypeError("[MpesaFloat] importSnapshot(): snapshot.balances array is required.");
            if (mergeStrategy === "replace") { this.#balances.clear(); this.#history.clear(); this.#reconciliations.clear(); }
            for (const [key, balance] of snapshot.balances) { if (typeof key === "string" && typeof balance === "number") this.#balances.set(key, balance); }
            for (const [key, movements] of (snapshot.history || [])) { if (Array.isArray(movements)) this.#history.set(key, movements); }
            for (const [id, record] of (snapshot.reconciliations || [])) { if (record?.id) this.#reconciliations.set(id, record); }
            this.#logAudit("SNAPSHOT_IMPORTED", `${snapshot.balances.length} balance(s), strategy=${mergeStrategy}.`);
            return { imported: snapshot.balances.length, mergeStrategy };
        }
        isSnapshotCompatible(snapshot) { return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === FLOAT_VERSION.split(".")[0]); }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(FLOAT_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ pluginVersion: FLOAT_VERSION, ...this.#diagnostics, trackedBranches: this.#balances.size, auditLogSize: this.#auditLog.length }); }
    }

    if (window.CozyOS.MpesaFloat && typeof window.CozyOS.MpesaFloat.getVersion === "function") {
        const existingVersion = window.CozyOS.MpesaFloat.getVersion();
        if (existingVersion !== FLOAT_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: MpesaFloat existing v${existingVersion} conflicts with load target v${FLOAT_VERSION}.`);
        return;
    }

    const engineInstance = new MpesaFloatCoordinator();
    window.CozyOS.MpesaFloat = engineInstance;

    const manifest = {
        id: "mpesa-float",
        name: "MpesaOS Float Management",
        version: FLOAT_VERSION,
        description: "Real agent float balance tracking, purchases, adjustments, transaction-impact recording, and reconciliation. Reuses Company for validation; never duplicates it.",
        dependencies: { required: [], optional: ["window.CozyOS.Company"] }
    };

    let registrationBound = false;
    function initRegistration() {
        if (registrationBound) return;
        registrationBound = true;
        if (window.CozyOS && window.CozyOS.PluginManager) {
            window.CozyOS.PluginManager.register(manifest, engineInstance);
        } else {
            if (!window.CozyOS.KernelPlugins) window.CozyOS.KernelPlugins = new Map();
            window.CozyOS.KernelPlugins.set(manifest.id, { name: manifest.name, version: manifest.version, handler: engineInstance });
        }
    }

    initRegistration();
    if (typeof window !== "undefined") {
        window.addEventListener("kernel:ready", initRegistration, { once: true });
        window.addEventListener("DOMContentLoaded", initRegistration, { once: true });
    }
})();
