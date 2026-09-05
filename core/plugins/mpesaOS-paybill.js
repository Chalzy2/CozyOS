/**
 * CozyOS — MpesaOS Paybill Coordinator
 * File Reference: core/plugins/mpesaOS-paybill.js
 * Layer: Business Domain — Plugin (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Real paybill number management — registration, business mapping,
 *   status, and collections. The genuine distinguishing feature from
 *   Till (mpesaOS-till.js) is the account number: paybill payments
 *   always carry a customer/invoice reference (e.g. a student ID for
 *   school fees, an invoice number for a business), which till payments
 *   don't have. That's real M-Pesa business behavior, not an arbitrary
 *   difference — hence a separate coordinator rather than a flag on
 *   Till.
 *
 * REUSE, NOT DUPLICATION
 *   Company/Branch validation reuses window.CozyOS.Company directly,
 *   same as mpesaOS-float.js and mpesaOS-till.js.
 *
 * ENTITLEMENT INTEGRATION (additive, this pass only)
 *   OWNERSHIP AUDIT: this file (window.CozyOS.MpesaPaybill) is the
 *   confirmed, canonical, actually-loaded live owner of MpesaOS
 *   paybill management — referenced by
 *   <script src="core/plugins/mpesaOS-paybill.js"> in
 *   core/shell/cozy-shell.html, core/cozy-shell.html, and
 *   admin-workspace.html, and registered in
 *   core/platform/discovery-manifest.json and
 *   docs/builder/knowledge/module-inventory.json.
 *   core/plugins/mpesaOS-engine.js contains a near-duplicate Paybill
 *   code path but is confirmed dead (no <script> reference anywhere,
 *   absent from discovery-manifest.json) — left untouched, not a
 *   second live owner. The real, live money-movement caller is
 *   core/plugins/mpesaOS.js (window.CozyOS.MpesaOSEngine's
 *   transaction pipeline, the `transactionType === "Paybill Payment"`
 *   branch), which calls recordCollection()/withdrawFromPaybill()
 *   directly.
 *
 *   Feature IDs reuse the exact convention established by receipts
 *   ("mpesa"/"mpesa.receipts"), reports ("mpesa"/"mpesa.reports"),
 *   float ("mpesa"/"mpesa.float"), and till ("mpesa"/"mpesa.till") —
 *   "mpesa.paybill" is added here, verbatim style. APPLICATION-level
 *   ("mpesa") is checked before FUNCTION-level ("mpesa.paybill"), the
 *   same cascade the other four integrations use.
 *
 *   Scope of THIS integration pass: registerPaybill() and
 *   setPaybillStatus() only — the two purely administrative Paybill
 *   actions. Confirmed by repository-wide call-site audit (grep
 *   across every live plugin and every HTML entry point) to have no
 *   internal caller anywhere; both are only ever invoked from
 *   UI/admin flows outside this file.
 *
 *   recordCollection() and withdrawFromPaybill() are deliberately
 *   left UNGUARDED here, for the exact same two reasons Till's
 *   analogous methods are ungated (see mpesaOS-till.js file header):
 *     - recordCollection() is called directly by mpesaOS.js's engine
 *       for every committed "Paybill Payment" transaction (see
 *       core/plugins/mpesaOS.js, the transactionType === "Paybill
 *       Payment" branch) — it is the real money-movement hook, the
 *       exact Paybill-side analog of mpesaOS-float.js's
 *       recordTransactionImpact() and mpesaOS-till.js's
 *       recordPayment(). Gating it would let a real customer
 *       collection complete while the paybill's tracked balance
 *       silently failed to reflect it.
 *     - withdrawFromPaybill() is ALSO called directly by mpesaOS.js's
 *       engine — not only as a discretionary merchant action, but as
 *       the real best-effort ROLLBACK for a failed Paybill Payment
 *       transaction (see the `paybillApplied` reversal branch in
 *       mpesaOS.js's transaction pipeline). Gating it would risk
 *       blocking that reversal and leaving a paybill balance
 *       permanently out of sync with a transaction that was actually
 *       rolled back — exactly the transaction-integrity corruption
 *       Rule 9 exists to prevent. Since this file cannot distinguish
 *       "merchant withdrawing collections externally" from "engine
 *       correcting a failed payment" at the call site, the whole
 *       method stays ungated rather than guessing.
 *
 *   Fails closed (returns {available:false, reason, state}, never
 *   throws) when paybill management is not entitled for any reason —
 *   ADMIN_DISABLED, MUTED, PLAN_RESTRICTED, a missing organizationId,
 *   or Entitlement being completely unavailable/unwired — matching
 *   the same honest, fail-closed convention mpesaOS-till.js,
 *   mpesaOS-float.js, and mpesaOS-reporting.js already use. On
 *   success, the existing return shape (the deep-cloned
 *   paybill/status record) is unchanged.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const PAYBILL_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    const VALID_STATUSES = new Set(["active", "suspended", "closed"]);
    const PAYBILL_NUMBER_PATTERN = /^\d{5,7}$/;

    // ── Entitlement integration (additive, this pass only) ──────────────────
    const MPESA_FEATURE_APP = "mpesa";
    const MPESA_FEATURE_PAYBILL = "mpesa.paybill";

    function getEntitlementEngine() {
        return (window.CozyOS && window.CozyOS.Entitlement) || null;
    }

    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }
    function escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

    class MpesaPaybillCoordinator {
        #paybills = new Map(); // paybillNumber -> record
        #balances = new Map(); // paybillNumber -> accumulated balance
        #history = new Map(); // paybillNumber -> [collection/withdrawal records]
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { paybillsRegistered: 0, statusChanges: 0, collectionsRecorded: 0, withdrawalsRecorded: 0, errorsHidden: 0, eventsEmitted: 0 };

        getVersion() { return PAYBILL_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }

        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: escapeHtml(msg) }));
            if (this.#auditLog.length > 1000) this.#auditLog.shift();
        }
        getAuditLog(predicate) {
            const list = this.#auditLog.map(e => ({ ...e }));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[MpesaPaybill] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[MpesaPaybill] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[MpesaPaybill] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        #validateCompanyBranch(companyId, branchId) {
            const company = window.CozyOS.Company;
            if (!company || typeof company.getCompany !== "function") throw new Error("[MpesaPaybill] Company coordinator is not connected — cannot proceed without a real company.");
            if (!companyId) throw new TypeError("[MpesaPaybill] companyId is required.");
            if (!company.getCompany(companyId)) throw new Error(`[MpesaPaybill] Unknown companyId "${companyId}" — a real, registered company is required.`);
            if (!branchId) throw new TypeError("[MpesaPaybill] branchId is required.");
            const branches = typeof company.listBranches === "function" ? (company.listBranches(companyId) || []) : [];
            if (!branches.find(b => b.branchId === branchId)) throw new Error(`[MpesaPaybill] Unknown branchId "${branchId}" for company "${companyId}" — a real, registered branch is required.`);
        }

        /**
         * #checkPaybillEntitlement(organizationId)
         *   The real service-boundary gate for the two purely
         *   administrative Paybill actions below (see file header for
         *   the full scope discussion — recordCollection()/
         *   withdrawFromPaybill() are deliberately never routed
         *   through this gate). Never throws; each guarded method
         *   reacts to the returned {allowed, state, reason} the same
         *   honest way mpesaOS-till.js's till gate already does. Fails
         *   closed — an absent EntitlementEngine or a missing
         *   organizationId is a denial, never a silent bypass.
         */
        #checkPaybillEntitlement(organizationId) {
            const entitlement = getEntitlementEngine();
            if (!entitlement || typeof entitlement.guard !== "function") {
                return { allowed: false, state: "UNAVAILABLE", reason: "Entitlement engine is not available — paybill management fails closed." };
            }
            if (typeof organizationId !== "string" || !organizationId.trim()) {
                return { allowed: false, state: "UNAVAILABLE", reason: "organizationId is required to evaluate paybill entitlement." };
            }
            try {
                entitlement.guard(organizationId, MPESA_FEATURE_APP);
                entitlement.guard(organizationId, MPESA_FEATURE_PAYBILL);
                return { allowed: true };
            } catch (err) {
                const state = (err && err.decision && err.decision.state) || "DENIED";
                return { allowed: false, state, reason: `Paybill management is not available for this organization (${state}).` };
            }
        }

        /**
         * registerPaybill({companyId, branchId, paybillNumber, businessName, userId, organizationId})
         *   Real registration — validated format, honest duplicate
         *   rejection, same discipline as Till's registerTill().
         */
        registerPaybill(rawInput = {}) {
            const { companyId, branchId, paybillNumber, businessName, userId, organizationId } = sanitizeObject(rawInput);
            const gate = this.#checkPaybillEntitlement(organizationId);
            if (!gate.allowed) {
                this.#logAudit("PAYBILL_ACTION_BLOCKED", `registerPaybill blocked (${gate.state}): ${companyId}/${branchId}`);
                return { available: false, reason: gate.reason, state: gate.state };
            }
            this.#validateCompanyBranch(companyId, branchId);
            if (typeof paybillNumber !== "string" || !PAYBILL_NUMBER_PATTERN.test(paybillNumber)) throw new TypeError("[MpesaPaybill] registerPaybill(): paybillNumber must be a 5-7 digit string.");
            if (this.#paybills.has(paybillNumber)) throw new Error(`[MpesaPaybill] registerPaybill(): paybill number "${paybillNumber}" is already registered.`);
            if (!businessName) throw new TypeError("[MpesaPaybill] registerPaybill(): businessName is required.");

            const record = Object.freeze({
                paybillNumber, companyId, branchId, businessName: escapeHtml(businessName),
                status: "active", registeredAt: new Date().toISOString(), registeredBy: userId ?? null
            });
            this.#paybills.set(paybillNumber, record);
            this.#balances.set(paybillNumber, 0);
            this.#history.set(paybillNumber, []);
            this.#diagnostics.paybillsRegistered++;
            this.#logAudit("PAYBILL_REGISTERED", `${paybillNumber}: ${businessName}`);
            this.emit("paybill:registered", { paybillNumber, companyId, branchId });
            return this.#deepClone(record);
        }

        getPaybill(paybillNumber) { const p = this.#paybills.get(paybillNumber); return p ? this.#deepClone(p) : null; }
        listPaybills(companyId, branchId) {
            return Array.from(this.#paybills.values()).filter(p => (!companyId || p.companyId === companyId) && (!branchId || p.branchId === branchId)).map(p => this.#deepClone(p));
        }

        /** setPaybillStatus(paybillNumber, status, organizationId) — real, validated status change. Honestly refuses an unknown paybill or invalid status rather than silently no-op. */
        setPaybillStatus(paybillNumber, status, organizationId) {
            const gate = this.#checkPaybillEntitlement(organizationId);
            if (!gate.allowed) {
                this.#logAudit("PAYBILL_ACTION_BLOCKED", `setPaybillStatus blocked (${gate.state}): ${paybillNumber}`);
                return { available: false, reason: gate.reason, state: gate.state };
            }
            if (!this.#paybills.has(paybillNumber)) throw new Error(`[MpesaPaybill] setPaybillStatus(): unknown paybillNumber "${paybillNumber}".`);
            if (!VALID_STATUSES.has(status)) throw new TypeError(`[MpesaPaybill] setPaybillStatus(): status must be one of: ${Array.from(VALID_STATUSES).join(", ")}.`);
            const existing = this.#paybills.get(paybillNumber);
            const updated = Object.freeze({ ...existing, status });
            this.#paybills.set(paybillNumber, updated);
            this.#diagnostics.statusChanges++;
            this.#logAudit("PAYBILL_STATUS_CHANGED", `${paybillNumber}: ${status}`);
            this.emit("paybill:status_changed", { paybillNumber, status });
            return this.#deepClone(updated);
        }

        /**
         * recordCollection({paybillNumber, amount, accountNumber, customerPhone, userId})
         *   Real collection — the genuine paybill-specific behavior: an
         *   accountNumber reference is required (unlike Till's
         *   recordPayment()), since a paybill payment without knowing
         *   which account/invoice it's for isn't a usable collection —
         *   this mirrors real M-Pesa paybill behavior, not an arbitrary
         *   stricter rule.
         */
        recordCollection(rawInput = {}) {
            const { paybillNumber, amount: rawAmount, accountNumber, customerPhone, userId } = sanitizeObject(rawInput);
            const paybill = this.#paybills.get(paybillNumber);
            if (!paybill) throw new Error(`[MpesaPaybill] recordCollection(): unknown paybillNumber "${paybillNumber}".`);
            if (paybill.status !== "active") throw new Error(`[MpesaPaybill] recordCollection(): paybill "${paybillNumber}" is ${paybill.status}, not active — cannot receive collections.`);
            if (!accountNumber) throw new TypeError("[MpesaPaybill] recordCollection(): accountNumber is required.");
            const amount = Number(rawAmount);
            if (!Number.isFinite(amount) || amount <= 0) throw new TypeError("[MpesaPaybill] recordCollection(): amount must be a positive number.");

            const balance = (this.#balances.get(paybillNumber) || 0) + amount;
            this.#balances.set(paybillNumber, balance);
            const record = Object.freeze({
                id: this.#generateId("pcol"), paybillNumber, type: "collection", amount, balanceAfter: balance,
                accountNumber: escapeHtml(accountNumber), customerPhone: customerPhone ? escapeHtml(customerPhone) : null,
                userId, timestamp: new Date().toISOString()
            });
            this.#history.get(paybillNumber).push(record);
            this.#diagnostics.collectionsRecorded++;
            this.#logAudit("PAYBILL_COLLECTION_RECORDED", `${paybillNumber}: +${amount} (account ${accountNumber})`);
            this.emit("paybill:collection_recorded", { paybillNumber, amount, accountNumber, balanceAfter: balance });
            return this.#deepClone(record);
        }

        /** withdrawFromPaybill({paybillNumber, amount, userId}) — real withdrawal, honestly refuses to overdraw, same discipline as Till. */
        withdrawFromPaybill(rawInput = {}) {
            const { paybillNumber, amount: rawAmount, userId } = sanitizeObject(rawInput);
            const paybill = this.#paybills.get(paybillNumber);
            if (!paybill) throw new Error(`[MpesaPaybill] withdrawFromPaybill(): unknown paybillNumber "${paybillNumber}".`);
            const amount = Number(rawAmount);
            if (!Number.isFinite(amount) || amount <= 0) throw new TypeError("[MpesaPaybill] withdrawFromPaybill(): amount must be a positive number.");
            const current = this.#balances.get(paybillNumber) || 0;
            if (amount > current) throw new Error(`[MpesaPaybill] withdrawFromPaybill(): cannot withdraw ${amount} — paybill "${paybillNumber}" balance is only ${current}.`);

            const balance = current - amount;
            this.#balances.set(paybillNumber, balance);
            const record = Object.freeze({ id: this.#generateId("pwdr"), paybillNumber, type: "withdrawal", amount: -amount, balanceAfter: balance, userId, timestamp: new Date().toISOString() });
            this.#history.get(paybillNumber).push(record);
            this.#diagnostics.withdrawalsRecorded++;
            this.#logAudit("PAYBILL_WITHDRAWAL", `${paybillNumber}: -${amount}`);
            this.emit("paybill:withdrawal", { paybillNumber, amount, balanceAfter: balance });
            return this.#deepClone(record);
        }

        getPaybillBalance(paybillNumber) { return this.#balances.get(paybillNumber) || 0; }
        getPaybillHistory(paybillNumber) { return this.#deepClone(this.#history.get(paybillNumber) || []); }

        /**
         * getCollectionsByAccount(paybillNumber, accountNumber)
         *   Real, genuinely paybill-specific query — Till has no
         *   equivalent, since till payments carry no account reference.
         *   Useful for e.g. seeing every fee payment a specific student
         *   has made.
         */
        getCollectionsByAccount(paybillNumber, accountNumber) {
            const history = this.#history.get(paybillNumber) || [];
            return this.#deepClone(history.filter(r => r.type === "collection" && r.accountNumber === escapeHtml(accountNumber)));
        }

        exportSnapshot() {
            return this.#deepClone({
                version: PAYBILL_VERSION, exportedAt: new Date().toISOString(),
                paybills: Array.from(this.#paybills.entries()), balances: Array.from(this.#balances.entries()), history: Array.from(this.#history.entries())
            });
        }
        importSnapshot(snapshot, { mergeStrategy = "replace" } = {}) {
            if (!snapshot || !Array.isArray(snapshot.paybills)) throw new TypeError("[MpesaPaybill] importSnapshot(): snapshot.paybills array is required.");
            if (mergeStrategy === "replace") { this.#paybills.clear(); this.#balances.clear(); this.#history.clear(); }
            for (const [paybillNumber, record] of snapshot.paybills) { if (record?.paybillNumber) this.#paybills.set(paybillNumber, record); }
            for (const [paybillNumber, balance] of (snapshot.balances || [])) { if (typeof balance === "number") this.#balances.set(paybillNumber, balance); }
            for (const [paybillNumber, movements] of (snapshot.history || [])) { if (Array.isArray(movements)) this.#history.set(paybillNumber, movements); }
            this.#logAudit("SNAPSHOT_IMPORTED", `${snapshot.paybills.length} paybill(s), strategy=${mergeStrategy}.`);
            return { imported: snapshot.paybills.length, mergeStrategy };
        }
        isSnapshotCompatible(snapshot) { return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === PAYBILL_VERSION.split(".")[0]); }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(PAYBILL_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ pluginVersion: PAYBILL_VERSION, ...this.#diagnostics, paybillsTracked: this.#paybills.size, auditLogSize: this.#auditLog.length }); }
    }

    if (window.CozyOS.MpesaPaybill && typeof window.CozyOS.MpesaPaybill.getVersion === "function") {
        const existingVersion = window.CozyOS.MpesaPaybill.getVersion();
        if (existingVersion !== PAYBILL_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: MpesaPaybill existing v${existingVersion} conflicts with load target v${PAYBILL_VERSION}.`);
        return;
    }

    const engineInstance = new MpesaPaybillCoordinator();
    window.CozyOS.MpesaPaybill = engineInstance;

    const manifest = {
        id: "mpesa-paybill",
        name: "MpesaOS Paybill Management",
        version: PAYBILL_VERSION,
        description: "Real paybill registration, business mapping, status management, and account-referenced collection/withdrawal balance tracking. Reuses Company for validation; never duplicates it.",
        dependencies: { required: [], optional: ["window.CozyOS.Company"] }
    };

    let registrationBound = false;
    function initRegistration() {
        if (registrationBound) return;
        registrationBound = true;
        if (window.CozyOS && window.CozyOS.PluginManager) {
            window.CozyOS.PluginManager.register(
                manifest,
                // Real bug fix (M387.5 Finding 6): register() requires a callable
                // (query, kernelContext) intent handler, not the engine instance itself.
                window.CozyOS.PluginManager.createMinimalIntentHandler(engineInstance, "MpesaOS Paybill Management")
            );
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
