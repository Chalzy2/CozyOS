/**
 * core/plugins/interestOS-business-workspace.js
 * InterestOS — Business Management Workspace (Full Completion, Phase 1
 * of the "COZYOS — InterestOS Full Completion" mission).
 *
 * REPOSITORY-FIRST AUDIT (performed before writing this file)
 *   Read core/plugins/interestOS-core.js in full: it composes only
 *   CozyMemory (namespaces "interestos:directives"/"interestos:taught"),
 *   Goals (pure passthrough), CozyNotification (its own existing generic
 *   registry), and FormulaRegistry/CalculationEngine (pure passthrough
 *   for 19 real, existing business/construction/church formulas) — no
 *   business-table/schema capability exists anywhere in this repository
 *   today (confirmed by search: no "business table", "flexible schema",
 *   "stock movement", or row/column CRUD owner exists). This file is
 *   therefore a genuinely new, additive capability, not a duplicate of
 *   anything real — it follows interestOS-core.js's own exact
 *   composition pattern (requireMemory()/unwrapMemoryValue()/owner+
 *   actorId on every call) rather than inventing a second one.
 *
 * ARCHITECTURAL DISCIPLINE
 *   NO second memory engine: persistence is CozyMemory only, under its
 *   own dedicated namespace ("interestos:business-tables"), same
 *   real owner/actorId visibility enforcement CozyMemory itself already
 *   provides — this file adds no authorization logic of its own.
 *   NO forced schema: a table's columns are entirely user-defined
 *   (label + a plain data TYPE). Automatic calculations are driven by an
 *   OPTIONAL semantic ROLE a user may tag onto a column (see ROLES
 *   below) — a table with zero tagged roles still works as a plain
 *   editable grid; computeSummary() only ever reports what the actually
 *   tagged roles support, never inventing a number it cannot derive.
 *   NO second calculation engine: computeSummary() is a real, disclosed,
 *   row-role-based aggregation specific to the business-workspace
 *   concept (revenue/cost/profit/expenses/savings/cash/stock) that has
 *   no existing owner in FormulaRegistry (confirmed: none of its 19 real
 *   formulas operate over a set of table rows) — it does not touch or
 *   duplicate FormulaRegistry/CalculationEngine, which InterestOSCore
 *   already exposes unchanged for its own, unrelated per-value formulas.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    const NAMESPACE = "interestos:business-tables";
    const VERSION = "1.0.0-FULLCOMPLETION-PHASE1";

    const COLUMN_TYPES = Object.freeze(["TEXT", "NUMBER", "DATE"]);
    // A closed, disclosed vocabulary — never free text — so
    // computeSummary() only ever reads a role it actually understands.
    // A table may use any subset, all, or none of these; untagged
    // columns are still real, editable, ordinary grid columns.
    const COLUMN_ROLES = Object.freeze([
        "PRODUCT", "DATE", "BUYING_PRICE", "SELLING_PRICE", "QUANTITY",
        "CUSTOMER", "EXPENSE_AMOUNT", "SAVINGS_AMOUNT", "PAYMENT_STATUS", "CATEGORY", "NOTE",
    ]);
    const PERIODS = Object.freeze(["daily", "weekly", "monthly", "yearly"]);
    // Case-insensitive, disclosed "this looks paid" vocabulary for the
    // optional PAYMENT_STATUS role — never inferred beyond an exact
    // match against this small, honest list.
    const PAID_STATUS_WORDS = Object.freeze(["paid", "received", "complete", "completed", "done", "cleared"]);

    function requireMemory() {
        const mem = window.CozyOS.CozyMemory;
        if (!mem) throw new Error("[InterestOS.BusinessWorkspace] CozyMemory is not loaded — no second memory engine is created here by design.");
        return mem;
    }

    function unwrapMemoryValue(entry) {
        if (!entry) return null;
        return { ...entry.value, owner: entry.owner };
    }

    function generateId(prefix) {
        return `${prefix}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2)}`;
    }

    function escapeHtml(v) {
        return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function nowISO() { return new Date().toISOString(); }

    function toNumber(v) {
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string" && v.trim() !== "") {
            const n = Number(v.trim());
            return Number.isFinite(n) ? n : null;
        }
        return null;
    }

    class InterestOSBusinessWorkspace {
        getVersion() { return VERSION; }

        // -------------------------------------------------- table CRUD

        createTable({ owner, actorId, name } = {}) {
            if (!owner || typeof owner !== "string") throw new TypeError("[BusinessWorkspace] createTable(): owner is required.");
            const memory = requireMemory();
            const id = generateId("bizt");
            const now = nowISO();
            const record = {
                id, owner,
                name: escapeHtml(String(name || "New Table").trim() || "New Table"),
                columns: [], rows: [],
                createdAt: now, updatedAt: now,
            };
            memory.saveMemory(NAMESPACE, id, record, { owner, actorId: actorId || owner, tags: ["interestos", "business-table"] });
            return unwrapMemoryValue(memory.readMemory(NAMESPACE, id, actorId || owner));
        }

        getTable(id, actorId) {
            return unwrapMemoryValue(requireMemory().readMemory(NAMESPACE, id, actorId));
        }

        listTables(owner, actorId) {
            if (!owner) throw new TypeError("[BusinessWorkspace] listTables(): owner is required.");
            return requireMemory().listKeys(NAMESPACE, (entry) => entry.owner === owner, actorId || owner)
                .map((entry) => ({ key: entry.key, ...entry.value, owner: entry.owner }));
        }

        #mutate(tableId, actorId, mutator) {
            const memory = requireMemory();
            const current = unwrapMemoryValue(memory.readMemory(NAMESPACE, tableId, actorId));
            if (!current) throw new Error(`[BusinessWorkspace] No table "${tableId}" (or not visible to this actor).`);
            const updated = mutator({ ...current, columns: current.columns.map((c) => ({ ...c })), rows: current.rows.map((r) => ({ ...r, cells: { ...r.cells } })) });
            updated.updatedAt = nowISO();
            memory.updateMemory(NAMESPACE, tableId, updated, { owner: current.owner, actorId });
            return unwrapMemoryValue(memory.readMemory(NAMESPACE, tableId, actorId));
        }

        renameTable(tableId, name, actorId) {
            if (!name || !String(name).trim()) throw new TypeError("[BusinessWorkspace] renameTable(): name is required.");
            return this.#mutate(tableId, actorId, (t) => ({ ...t, name: escapeHtml(String(name).trim()) }));
        }

        deleteTable(tableId, actorId) {
            return requireMemory().deleteMemory(NAMESPACE, tableId, { actorId, authorized: true });
        }

        // -------------------------------------------------- columns

        addColumn(tableId, { label, type = "TEXT", role = null } = {}, actorId) {
            if (!label || !String(label).trim()) throw new TypeError("[BusinessWorkspace] addColumn(): label is required.");
            if (!COLUMN_TYPES.includes(type)) throw new TypeError(`[BusinessWorkspace] addColumn(): type must be one of ${COLUMN_TYPES.join(", ")}.`);
            if (role !== null && !COLUMN_ROLES.includes(role)) throw new TypeError(`[BusinessWorkspace] addColumn(): role must be one of ${COLUMN_ROLES.join(", ")} or null.`);
            return this.#mutate(tableId, actorId, (t) => {
                const column = { id: generateId("col"), label: escapeHtml(String(label).trim()), type, role };
                t.columns.push(column);
                return t;
            });
        }

        renameColumn(tableId, columnId, label, actorId) {
            if (!label || !String(label).trim()) throw new TypeError("[BusinessWorkspace] renameColumn(): label is required.");
            return this.#mutate(tableId, actorId, (t) => {
                const col = t.columns.find((c) => c.id === columnId);
                if (!col) throw new Error(`[BusinessWorkspace] No column "${columnId}" on this table.`);
                col.label = escapeHtml(String(label).trim());
                return t;
            });
        }

        setColumnRole(tableId, columnId, role, actorId) {
            if (role !== null && !COLUMN_ROLES.includes(role)) throw new TypeError(`[BusinessWorkspace] setColumnRole(): role must be one of ${COLUMN_ROLES.join(", ")} or null.`);
            return this.#mutate(tableId, actorId, (t) => {
                const col = t.columns.find((c) => c.id === columnId);
                if (!col) throw new Error(`[BusinessWorkspace] No column "${columnId}" on this table.`);
                col.role = role;
                return t;
            });
        }

        removeColumn(tableId, columnId, actorId) {
            return this.#mutate(tableId, actorId, (t) => {
                t.columns = t.columns.filter((c) => c.id !== columnId);
                for (const row of t.rows) delete row.cells[columnId];
                return t;
            });
        }

        reorderColumns(tableId, orderedColumnIds, actorId) {
            if (!Array.isArray(orderedColumnIds)) throw new TypeError("[BusinessWorkspace] reorderColumns(): orderedColumnIds must be an array.");
            return this.#mutate(tableId, actorId, (t) => {
                const byId = new Map(t.columns.map((c) => [c.id, c]));
                if (orderedColumnIds.length !== t.columns.length || !orderedColumnIds.every((id) => byId.has(id))) {
                    throw new Error("[BusinessWorkspace] reorderColumns(): orderedColumnIds must be exactly the table's current column ids.");
                }
                t.columns = orderedColumnIds.map((id) => byId.get(id));
                return t;
            });
        }

        // -------------------------------------------------- rows

        addRow(tableId, cells, actorId) {
            return this.#mutate(tableId, actorId, (t) => {
                const validIds = new Set(t.columns.map((c) => c.id));
                const cleanCells = {};
                for (const [k, v] of Object.entries(cells || {})) {
                    if (validIds.has(k)) cleanCells[k] = typeof v === "string" ? escapeHtml(v) : v;
                }
                const now = nowISO();
                t.rows.push({ id: generateId("row"), cells: cleanCells, createdAt: now, updatedAt: now });
                return t;
            });
        }

        updateRow(tableId, rowId, cells, actorId) {
            return this.#mutate(tableId, actorId, (t) => {
                const row = t.rows.find((r) => r.id === rowId);
                if (!row) throw new Error(`[BusinessWorkspace] No row "${rowId}" on this table.`);
                const validIds = new Set(t.columns.map((c) => c.id));
                for (const [k, v] of Object.entries(cells || {})) {
                    if (validIds.has(k)) row.cells[k] = typeof v === "string" ? escapeHtml(v) : v;
                }
                row.updatedAt = nowISO();
                return t;
            });
        }

        removeRow(tableId, rowId, actorId) {
            return this.#mutate(tableId, actorId, (t) => {
                t.rows = t.rows.filter((r) => r.id !== rowId);
                return t;
            });
        }

        reorderRows(tableId, orderedRowIds, actorId) {
            if (!Array.isArray(orderedRowIds)) throw new TypeError("[BusinessWorkspace] reorderRows(): orderedRowIds must be an array.");
            return this.#mutate(tableId, actorId, (t) => {
                const byId = new Map(t.rows.map((r) => [r.id, r]));
                if (orderedRowIds.length !== t.rows.length || !orderedRowIds.every((id) => byId.has(id))) {
                    throw new Error("[BusinessWorkspace] reorderRows(): orderedRowIds must be exactly the table's current row ids.");
                }
                t.rows = orderedRowIds.map((id) => byId.get(id));
                return t;
            });
        }

        // -------------------------------------------------- automatic calculations

        /**
         * periodRange(period, referenceDate)
         *   Real, deterministic calendar bucketing — no external library.
         *   weekly = Monday-start ISO week. All ranges are [start, end).
         */
        periodRange(period, referenceDate) {
            if (!PERIODS.includes(period)) throw new TypeError(`[BusinessWorkspace] periodRange(): period must be one of ${PERIODS.join(", ")}.`);
            const ref = referenceDate ? new Date(referenceDate) : new Date();
            if (Number.isNaN(ref.getTime())) throw new TypeError("[BusinessWorkspace] periodRange(): referenceDate is not a real date.");
            let start, end;
            if (period === "daily") {
                start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
                end = new Date(start); end.setDate(end.getDate() + 1);
            } else if (period === "weekly") {
                const isoDay = (ref.getDay() + 6) % 7; // 0=Mon..6=Sun
                start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - isoDay);
                end = new Date(start); end.setDate(end.getDate() + 7);
            } else if (period === "monthly") {
                start = new Date(ref.getFullYear(), ref.getMonth(), 1);
                end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
            } else {
                start = new Date(ref.getFullYear(), 0, 1);
                end = new Date(ref.getFullYear() + 1, 0, 1);
            }
            return { start: start.toISOString(), end: end.toISOString() };
        }

        /**
         * computeSummary(tableId, {period, referenceDate}, actorId)
         *   Real, row-role-based aggregation. For every row whose real,
         *   tagged DATE-role cell falls within the computed period range
         *   (a row is excluded from every period total when no DATE-role
         *   column exists or that row's date cell is empty/invalid —
         *   never guessed):
         *     revenue += sellingPrice * quantity   (quantity defaults to
         *       1 only when the table has NO QUANTITY-role column at
         *       all; when a QUANTITY-role column exists but this row's
         *       cell is empty, that row contributes nothing to revenue —
         *       an honest "insufficient data for this row", not a guess)
         *     cost    += buyingPrice * quantity     (same rule)
         *     expenses += expenseAmount
         *     savings  += savingsAmount
         *     profit = revenue - cost - expenses
         *     cashBalance: revenue collected (see PAID_STATUS_WORDS
         *       above) minus expenses when a PAYMENT_STATUS-role column
         *       exists; otherwise the simpler, disclosed
         *       revenue - expenses (assumes every recorded sale was
         *       already cash-settled — stated in the returned
         *       `cashBalanceAssumption` field, never silently implied).
         *   stockMovement: real per-PRODUCT quantity totals within the
         *   period, only when both PRODUCT and QUANTITY roles exist.
         *   Every total is 0/empty, never fabricated, when its required
         *   role(s) are not tagged on this table.
         */
        computeSummary(tableId, { period = "monthly", referenceDate = null } = {}, actorId) {
            const table = this.getTable(tableId, actorId);
            if (!table) return { available: false, reason: `No table "${tableId}" (or not visible to this actor).` };

            const roleColumn = (role) => table.columns.find((c) => c.role === role) || null;
            const dateCol = roleColumn("DATE");
            const productCol = roleColumn("PRODUCT");
            const buyCol = roleColumn("BUYING_PRICE");
            const sellCol = roleColumn("SELLING_PRICE");
            const qtyCol = roleColumn("QUANTITY");
            const expenseCol = roleColumn("EXPENSE_AMOUNT");
            const savingsCol = roleColumn("SAVINGS_AMOUNT");
            const paymentCol = roleColumn("PAYMENT_STATUS");

            const { start, end } = this.periodRange(period, referenceDate);
            const startMs = new Date(start).getTime();
            const endMs = new Date(end).getTime();

            let revenue = 0, cost = 0, expenses = 0, savings = 0, collected = 0;
            const stockByProduct = new Map();
            let rowsInPeriod = 0;

            for (const row of table.rows) {
                if (dateCol) {
                    const dateVal = row.cells[dateCol.id];
                    const t = dateVal ? new Date(dateVal).getTime() : NaN;
                    if (!Number.isFinite(t) || t < startMs || t >= endMs) continue;
                } else {
                    // No DATE role tagged at all: this table cannot be
                    // period-bucketed — every row is honestly reported as
                    // out of scope for this call rather than assumed to
                    // be "current".
                    continue;
                }
                rowsInPeriod++;

                const qty = qtyCol ? toNumber(row.cells[qtyCol.id]) : 1;
                if (sellCol) {
                    const sell = toNumber(row.cells[sellCol.id]);
                    if (sell !== null && qty !== null) revenue += sell * qty;
                }
                if (buyCol) {
                    const buy = toNumber(row.cells[buyCol.id]);
                    if (buy !== null && qty !== null) cost += buy * qty;
                }
                if (expenseCol) {
                    const exp = toNumber(row.cells[expenseCol.id]);
                    if (exp !== null) expenses += exp;
                }
                if (savingsCol) {
                    const sav = toNumber(row.cells[savingsCol.id]);
                    if (sav !== null) savings += sav;
                }
                if (sellCol && qty !== null) {
                    const sell = toNumber(row.cells[sellCol.id]);
                    if (sell !== null) {
                        const isPaid = paymentCol ? PAID_STATUS_WORDS.includes(String(row.cells[paymentCol.id] || "").trim().toLowerCase()) : true;
                        if (isPaid) collected += sell * qty;
                    }
                }
                if (productCol && qtyCol) {
                    const product = String(row.cells[productCol.id] || "").trim();
                    const q = toNumber(row.cells[qtyCol.id]);
                    if (product && q !== null) stockByProduct.set(product, (stockByProduct.get(product) || 0) + q);
                }
            }

            const cashBalanceAssumption = paymentCol
                ? "Cash balance counts only rows whose payment-status column reads as paid; unpaid/unknown-status sales are excluded from revenue collected."
                : (sellCol ? "No payment-status column is tagged — cash balance assumes every recorded sale was already collected in cash." : "No selling-price column is tagged — cash balance reflects expenses only.");

            return {
                available: true, period, range: { start, end }, rowsInPeriod,
                revenue: Math.round(revenue * 100) / 100,
                cost: Math.round(cost * 100) / 100,
                profit: Math.round((revenue - cost - expenses) * 100) / 100,
                expenses: Math.round(expenses * 100) / 100,
                savings: Math.round(savings * 100) / 100,
                cashBalance: Math.round((collected - expenses) * 100) / 100,
                cashBalanceAssumption,
                stockMovement: [...stockByProduct.entries()].map(([product, quantity]) => ({ product, quantity })),
                rolesUsed: { dateCol: !!dateCol, productCol: !!productCol, buyCol: !!buyCol, sellCol: !!sellCol, qtyCol: !!qtyCol, expenseCol: !!expenseCol, savingsCol: !!savingsCol, paymentCol: !!paymentCol },
            };
        }
    }

    const instance = new InterestOSBusinessWorkspace();
    window.CozyOS.InterestOSBusinessWorkspace = instance;
    window.CozyOS.InterestOSBusinessWorkspace.COLUMN_TYPES = COLUMN_TYPES;
    window.CozyOS.InterestOSBusinessWorkspace.COLUMN_ROLES = COLUMN_ROLES;
    window.CozyOS.InterestOSBusinessWorkspace.PERIODS = PERIODS;
})();
