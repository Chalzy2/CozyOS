/**
 * CozyOS — MpesaOS Till Coordinator
 * File Reference: core/plugins/mpesaOS-till.js
 * Layer: Business Domain — Plugin (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Real "Buy Goods" till number management — registration, merchant
 *   assignment, status (active/suspended/closed), and the accumulated
 *   balance from till payments until the merchant withdraws them.
 *   Genuinely M-Pesa-specific; no existing coordinator owns this.
 *
 * REUSE, NOT DUPLICATION
 *   Company/Branch validation reuses window.CozyOS.Company directly,
 *   the same real calls mpesaOS.js's engine and mpesaOS-float.js both
 *   already use.
 *
 * NEVER
 *   Owns agent float (separate coordinator, mpesaOS-float.js), customer
 *   data (Customer coordinator), or the core withdrawal/deposit
 *   transaction pipeline (mpesaOS.js's engine).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const TILL_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    const VALID_STATUSES = new Set(["active", "suspended", "closed"]);
    const TILL_NUMBER_PATTERN = /^\d{5,7}$/;

    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }
    function escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

    class MpesaTillCoordinator {
        #tills = new Map(); // tillNumber -> record
        #balances = new Map(); // tillNumber -> accumulated balance
        #history = new Map(); // tillNumber -> [transaction records]
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { tillsRegistered: 0, statusChanges: 0, paymentsRecorded: 0, withdrawalsRecorded: 0, errorsHidden: 0, eventsEmitted: 0 };

        getVersion() { return TILL_VERSION; }
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

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[MpesaTill] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[MpesaTill] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[MpesaTill] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        #validateCompanyBranch(companyId, branchId) {
            const company = window.CozyOS.Company;
            if (!company || typeof company.getCompany !== "function") throw new Error("[MpesaTill] Company coordinator is not connected — cannot proceed without a real company.");
            if (!companyId) throw new TypeError("[MpesaTill] companyId is required.");
            if (!company.getCompany(companyId)) throw new Error(`[MpesaTill] Unknown companyId "${companyId}" — a real, registered company is required.`);
            if (!branchId) throw new TypeError("[MpesaTill] branchId is required.");
            const branches = typeof company.listBranches === "function" ? (company.listBranches(companyId) || []) : [];
            if (!branches.find(b => b.branchId === branchId)) throw new Error(`[MpesaTill] Unknown branchId "${branchId}" for company "${companyId}" — a real, registered branch is required.`);
        }

        /**
         * registerTill({companyId, branchId, tillNumber, merchantName, userId})
         *   Real registration — validates the till number format (5-7
         *   digits, matching real M-Pesa till number conventions),
         *   rejects a duplicate till number honestly rather than
         *   silently overwriting an existing registration.
         */
        registerTill(rawInput = {}) {
            const { companyId, branchId, tillNumber, merchantName, userId } = sanitizeObject(rawInput);
            this.#validateCompanyBranch(companyId, branchId);
            if (typeof tillNumber !== "string" || !TILL_NUMBER_PATTERN.test(tillNumber)) throw new TypeError("[MpesaTill] registerTill(): tillNumber must be a 5-7 digit string.");
            if (this.#tills.has(tillNumber)) throw new Error(`[MpesaTill] registerTill(): till number "${tillNumber}" is already registered.`);
            if (!merchantName) throw new TypeError("[MpesaTill] registerTill(): merchantName is required.");

            const record = Object.freeze({
                tillNumber, companyId, branchId, merchantName: escapeHtml(merchantName),
                status: "active", registeredAt: new Date().toISOString(), registeredBy: userId ?? null
            });
            this.#tills.set(tillNumber, record);
            this.#balances.set(tillNumber, 0);
            this.#history.set(tillNumber, []);
            this.#diagnostics.tillsRegistered++;
            this.#logAudit("TILL_REGISTERED", `${tillNumber}: ${merchantName}`);
            this.emit("till:registered", { tillNumber, companyId, branchId });
            return this.#deepClone(record);
        }

        getTill(tillNumber) { const t = this.#tills.get(tillNumber); return t ? this.#deepClone(t) : null; }
        listTills(companyId, branchId) {
            return Array.from(this.#tills.values()).filter(t => (!companyId || t.companyId === companyId) && (!branchId || t.branchId === branchId)).map(t => this.#deepClone(t));
        }

        /** setTillStatus(tillNumber, status) — real, validated status change. Honestly refuses an unknown till or invalid status rather than silently no-op. */
        setTillStatus(tillNumber, status) {
            if (!this.#tills.has(tillNumber)) throw new Error(`[MpesaTill] setTillStatus(): unknown tillNumber "${tillNumber}".`);
            if (!VALID_STATUSES.has(status)) throw new TypeError(`[MpesaTill] setTillStatus(): status must be one of: ${Array.from(VALID_STATUSES).join(", ")}.`);
            const existing = this.#tills.get(tillNumber);
            const updated = Object.freeze({ ...existing, status });
            this.#tills.set(tillNumber, updated);
            this.#diagnostics.statusChanges++;
            this.#logAudit("TILL_STATUS_CHANGED", `${tillNumber}: ${status}`);
            this.emit("till:status_changed", { tillNumber, status });
            return this.#deepClone(updated);
        }

        /**
         * recordPayment({tillNumber, amount, customerPhone, userId})
         *   Real payment received via this till — increases the
         *   accumulated balance. Honestly refuses on an unknown or
         *   non-active till, matching the real-world constraint that a
         *   suspended/closed till shouldn't be able to receive payments.
         */
        recordPayment(rawInput = {}) {
            const { tillNumber, amount: rawAmount, customerPhone, userId } = sanitizeObject(rawInput);
            const till = this.#tills.get(tillNumber);
            if (!till) throw new Error(`[MpesaTill] recordPayment(): unknown tillNumber "${tillNumber}".`);
            if (till.status !== "active") throw new Error(`[MpesaTill] recordPayment(): till "${tillNumber}" is ${till.status}, not active — cannot receive payments.`);
            const amount = Number(rawAmount);
            if (!Number.isFinite(amount) || amount <= 0) throw new TypeError("[MpesaTill] recordPayment(): amount must be a positive number.");

            const balance = (this.#balances.get(tillNumber) || 0) + amount;
            this.#balances.set(tillNumber, balance);
            const record = Object.freeze({ id: this.#generateId("tpay"), tillNumber, type: "payment", amount, balanceAfter: balance, customerPhone: customerPhone ? escapeHtml(customerPhone) : null, userId, timestamp: new Date().toISOString() });
            this.#history.get(tillNumber).push(record);
            this.#diagnostics.paymentsRecorded++;
            this.#logAudit("TILL_PAYMENT_RECEIVED", `${tillNumber}: +${amount}`);
            this.emit("till:payment_received", { tillNumber, amount, balanceAfter: balance });
            return this.#deepClone(record);
        }

        /**
         * withdrawFromTill({tillNumber, amount, userId})
         *   Real withdrawal — decreases the accumulated balance.
         *   Honestly refuses to overdraw.
         */
        withdrawFromTill(rawInput = {}) {
            const { tillNumber, amount: rawAmount, userId } = sanitizeObject(rawInput);
            const till = this.#tills.get(tillNumber);
            if (!till) throw new Error(`[MpesaTill] withdrawFromTill(): unknown tillNumber "${tillNumber}".`);
            const amount = Number(rawAmount);
            if (!Number.isFinite(amount) || amount <= 0) throw new TypeError("[MpesaTill] withdrawFromTill(): amount must be a positive number.");
            const current = this.#balances.get(tillNumber) || 0;
            if (amount > current) throw new Error(`[MpesaTill] withdrawFromTill(): cannot withdraw ${amount} — till "${tillNumber}" balance is only ${current}.`);

            const balance = current - amount;
            this.#balances.set(tillNumber, balance);
            const record = Object.freeze({ id: this.#generateId("twdr"), tillNumber, type: "withdrawal", amount: -amount, balanceAfter: balance, userId, timestamp: new Date().toISOString() });
            this.#history.get(tillNumber).push(record);
            this.#diagnostics.withdrawalsRecorded++;
            this.#logAudit("TILL_WITHDRAWAL", `${tillNumber}: -${amount}`);
            this.emit("till:withdrawal", { tillNumber, amount, balanceAfter: balance });
            return this.#deepClone(record);
        }

        getTillBalance(tillNumber) { return this.#balances.get(tillNumber) || 0; }
        getTillHistory(tillNumber) { return this.#deepClone(this.#history.get(tillNumber) || []); }

        exportSnapshot() {
            return this.#deepClone({
                version: TILL_VERSION, exportedAt: new Date().toISOString(),
                tills: Array.from(this.#tills.entries()), balances: Array.from(this.#balances.entries()), history: Array.from(this.#history.entries())
            });
        }
        importSnapshot(snapshot, { mergeStrategy = "replace" } = {}) {
            if (!snapshot || !Array.isArray(snapshot.tills)) throw new TypeError("[MpesaTill] importSnapshot(): snapshot.tills array is required.");
            if (mergeStrategy === "replace") { this.#tills.clear(); this.#balances.clear(); this.#history.clear(); }
            for (const [tillNumber, record] of snapshot.tills) { if (record?.tillNumber) this.#tills.set(tillNumber, record); }
            for (const [tillNumber, balance] of (snapshot.balances || [])) { if (typeof balance === "number") this.#balances.set(tillNumber, balance); }
            for (const [tillNumber, movements] of (snapshot.history || [])) { if (Array.isArray(movements)) this.#history.set(tillNumber, movements); }
            this.#logAudit("SNAPSHOT_IMPORTED", `${snapshot.tills.length} till(s), strategy=${mergeStrategy}.`);
            return { imported: snapshot.tills.length, mergeStrategy };
        }
        isSnapshotCompatible(snapshot) { return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === TILL_VERSION.split(".")[0]); }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(TILL_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ pluginVersion: TILL_VERSION, ...this.#diagnostics, tillsTracked: this.#tills.size, auditLogSize: this.#auditLog.length }); }
    }

    if (window.CozyOS.MpesaTill && typeof window.CozyOS.MpesaTill.getVersion === "function") {
        const existingVersion = window.CozyOS.MpesaTill.getVersion();
        if (existingVersion !== TILL_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: MpesaTill existing v${existingVersion} conflicts with load target v${TILL_VERSION}.`);
        return;
    }

    const engineInstance = new MpesaTillCoordinator();
    window.CozyOS.MpesaTill = engineInstance;

    const manifest = {
        id: "mpesa-till",
        name: "MpesaOS Till Management",
        version: TILL_VERSION,
        description: "Real Buy-Goods till registration, merchant assignment, status management, and payment/withdrawal balance tracking. Reuses Company for validation; never duplicates it.",
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
