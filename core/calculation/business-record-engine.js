/**
 * CozyOS Business Record Engine — Core
 * File Reference: core/calculation/business-record-engine.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * MILESTONE: Universal Business Calculation + Flexible Data Table Core
 *
 * RESPONSIBILITY (and only this)
 *   Business Records + Flexible Fields/Columns + Persistence composition +
 *   Aggregation + Reversal/Correction + Audit provenance — for ANY
 *   application (MpesaOS, PharmacyOS, RetailOS, QuarryOS, WholesaleOS,
 *   Logistics, Schools, Clinics, Farms, Restaurants, service businesses,
 *   ...). Nothing application-specific lives in this file.
 *
 * OWNERSHIP AUDIT RESULT (do not re-litigate without a new audit)
 *   - Arithmetic is NEVER reimplemented here. Every calculated field is
 *     produced by calling the real, existing window.CozyOS.CalculationEngine
 *     .calculate(formulaId, inputs), which itself owns FormulaRegistry /
 *     formula packs. This file adds exactly one missing formula
 *     (Business.LineTotal, in formula-library.js) and composes existing
 *     Business.Profit for the rest.
 *   - Persistence is NEVER reimplemented here. Every read/write goes
 *     through the real, existing window.CozyStorage (core/storage.js,
 *     "Universal Core Storage Gateway"). Two stores were added to its
 *     BLUEPRINT_OBJECT_STORES config ("business_records",
 *     "business_record_schemas") — that is the only change made to it.
 *   - Organization existence is checked via the real, existing
 *     window.CozyOS.OrganizationRegistry.organizationExists(orgId).
 *   - WHO may act is checked via the real, existing
 *     window.CozyOS.OrganizationMembership.isAuthorized(userId, orgId,
 *     permission) — a SEPARATE concern from organization existence, per
 *     explicit instruction. Both must pass, fail-closed, for every
 *     protected operation.
 *   - Entitlement/subscription truth is NOT introduced here. This engine
 *     does not currently need a feature-gate of its own, so
 *     EntitlementEngine is intentionally not composed — composing it
 *     with nothing to check would be theater, not integration.
 *
 * DEPENDENCY / LOAD-ORDER NOTE (disclosed, not hidden)
 *   window.CozyStorage (core/storage.js) has ZERO <script> tags anywhere
 *   in this repository today — it is a real, complete file that has never
 *   actually been wired into a page. That is a PRE-EXISTING gap, not
 *   something this milestone was asked to fix (compare: Administrative
 *   Request Coordinator milestone, which found and disclosed the same
 *   class of gap for PolicyEngine rather than adding script tags just to
 *   manufacture "Browser Runtime Verified"). Every dependency below is
 *   therefore resolved LAZILY, at the moment each operation runs, never
 *   assumed to exist at file-load time — this also means load ORDER
 *   between this file and its dependencies does not matter; only
 *   AVAILABILITY at call time does. Fail closed, always, when a
 *   dependency is unavailable. Never a fallback implementation.
 *
 * STORAGE TENANCY NOTE (real constraint found during the dependency audit)
 *   core/storage.js's tenant binding (initModule()/_activeTenantId) is a
 *   single module-level mutable value, not a per-call parameter — once
 *   bound it OVERRIDES whatever tenantId a caller passes. That is safe for
 *   its original one-browser-tab-one-session model, but is NOT safe for a
 *   reusable multi-organization engine: if two organizations' async
 *   operations interleave, one org's initModule() call could silently
 *   redirect another org's in-flight read/write. BusinessRecordEngine
 *   therefore NEVER calls CozyStorage.initModule() and instead passes the
 *   real organizationId explicitly as the `tenantId` argument on every
 *   single storage call — the Storage Gateway's own per-record tenant
 *   check (`result.tenantId !== resolvedTenantId` → rejected) then gives
 *   real, per-call organization isolation with no shared mutable state.
 *   The module-context RBAC layer inside storage.js (STORE_PERMISSIONS)
 *   consequently stays inactive for this engine's calls (it only engages
 *   when _activeModuleContext is set) — that is not a gap, because
 *   authorization for business records is owned by OrganizationMembership
 *   .isAuthorized(), not by the Storage Gateway's module-context RBAC,
 *   which exists for a different purpose (isolating plugin/app *module
 *   code*, not organization *business data*).
 *
 * REVERSAL MODEL
 *   Historical records are never rewritten and never deleted. Reversing a
 *   record creates a NEW record carrying the arithmetic negation of the
 *   original's calculated fields (a real compensating entry, the same
 *   shape used by modules/quarry/quarry-transaction.js's compensation
 *   pattern — but no Quarry-specific code is imported; this is a generic
 *   reimplementation of the *pattern* only). The original is only ever
 *   updated with bookkeeping metadata (status/reversedBy/updatedAt) via
 *   Storage Gateway's optimistic-locked update() — its fields and
 *   calculatedFields are never touched again after creation. Summing a
 *   record and its reversal nets to zero, so aggregation needs no special
 *   "exclude reversed" logic to stay correct — it can also be told to
 *   exclude reversed pairs explicitly, for reports that want a "clean"
 *   ledger.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const BRE_VERSION = "1.0.0-ENTERPRISE";

    const STORE_RECORDS  = "business_records";
    const STORE_SCHEMAS  = "business_record_schemas";

    const PERMISSIONS = Object.freeze({
        CREATE:         "business-records:create",
        READ:           "business-records:read",
        REVERSE:        "business-records:reverse",
        MANAGE_SCHEMA:  "business-records:manage-schema"
    });

    /** Default calculation definitions used when a schema does not supply
     *  its own. "__calc:X" as a source means "read already-computed
     *  calculatedFields.X", not a raw input field — this is how profit
     *  can depend on cost/sales without recomputing arithmetic itself. */
    const DEFAULT_CALCULATIONS = Object.freeze([
        { key: "cost",   formulaId: "Business.LineTotal", inputs: { quantity: "quantity", unitPrice: "buyingPrice" } },
        { key: "sales",  formulaId: "Business.LineTotal", inputs: { quantity: "quantity", unitPrice: "sellingPrice" } },
        { key: "profit", formulaId: "Business.Profit",    inputs: { revenue: "__calc:sales", cost: "__calc:cost" } }
    ]);

    function nowIso() { return new Date().toISOString(); }
    function generateId(prefix) {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    }
    function schemaKey(organizationId, applicationId, recordType) {
        return `${organizationId}::${applicationId}::${recordType}`;
    }

    class CozyBusinessRecordEngine {
        getVersion() { return BRE_VERSION; }

        // ──────────────────────────────────────────────────────────────
        // Dependency resolution — always lazy, always fail-closed, never
        // a fallback implementation of the dependency itself.
        // ──────────────────────────────────────────────────────────────

        #storage() {
            return (typeof window !== "undefined" && window.CozyStorage) ? window.CozyStorage : null;
        }
        #calcEngine() {
            return (window.CozyOS && window.CozyOS.CalculationEngine) ? window.CozyOS.CalculationEngine : null;
        }
        #orgRegistry() {
            return (window.CozyOS && window.CozyOS.OrganizationRegistry) ? window.CozyOS.OrganizationRegistry : null;
        }
        #membership() {
            return (window.CozyOS && window.CozyOS.OrganizationMembership) ? window.CozyOS.OrganizationMembership : null;
        }
        #formulaRegistry() {
            return (window.CozyOS && window.CozyOS.FormulaRegistry) ? window.CozyOS.FormulaRegistry : null;
        }
        #eventBus() {
            return (window.CozyOS && window.CozyOS.PlatformEventBus) ? window.CozyOS.PlatformEventBus : null;
        }
        #emit(event, data) {
            const bus = this.#eventBus();
            if (!bus || typeof bus.emit !== "function") return;
            try { bus.emit(event, data); } catch (_err) { /* non-fatal */ }
        }

        /** Organization existence (WHAT) + organization-scoped authorization
         *  (WHO) — two distinct real dependencies, both required, fail-closed
         *  on any missing piece. Never a fallback authority. */
        #authorize(organizationId, userId, permission) {
            if (!organizationId || typeof organizationId !== "string") {
                return { ok: false, reason: "organizationId is required." };
            }
            const orgRegistry = this.#orgRegistry();
            if (!orgRegistry) return { ok: false, reason: "OrganizationRegistry is not loaded — failing closed." };
            if (!orgRegistry.organizationExists(organizationId)) {
                return { ok: false, reason: `Organization '${organizationId}' does not exist.` };
            }
            if (!userId || typeof userId !== "string") {
                return { ok: false, reason: "userId is required." };
            }
            const membership = this.#membership();
            if (!membership) return { ok: false, reason: "OrganizationMembership is not loaded — failing closed." };
            if (!membership.isAuthorized(userId, organizationId, permission)) {
                return { ok: false, reason: `User '${userId}' is not authorized for '${permission}' in organization '${organizationId}'.` };
            }
            return { ok: true };
        }

        // ──────────────────────────────────────────────────────────────
        // Flexible Table / Column configuration
        // ──────────────────────────────────────────────────────────────

        /**
         * defineSchema — create or replace an org+application+recordType's
         * column/calculation configuration. Config data (not ledger data),
         * so it is fully overwritten in place — never append-only.
         */
        async defineSchema({ organizationId, applicationId, recordType, userId, columns = [], calculations } = {}) {
            const auth = this.#authorize(organizationId, userId, PERMISSIONS.MANAGE_SCHEMA);
            if (!auth.ok) return { success: false, reason: auth.reason };
            if (!applicationId || !recordType) return { success: false, reason: "applicationId and recordType are required." };
            if (!Array.isArray(columns) || columns.length === 0) return { success: false, reason: "At least one column is required." };

            for (const col of columns) {
                if (!col || typeof col.key !== "string" || !col.key) {
                    return { success: false, reason: "Every column requires a string 'key'." };
                }
            }

            let resolvedCalculations = DEFAULT_CALCULATIONS;
            if (calculations !== undefined) {
                if (!Array.isArray(calculations)) return { success: false, reason: "calculations must be an array." };
                const registry = this.#formulaRegistry();
                if (!registry) return { success: false, reason: "FormulaRegistry is not loaded — failing closed, cannot validate calculation definitions." };
                for (const def of calculations) {
                    if (!def || typeof def.key !== "string" || !def.key) return { success: false, reason: "Every calculation requires a string 'key'." };
                    if (typeof def.formulaId !== "string" || !registry.has(def.formulaId)) {
                        // Safety rule: only REAL, already-registered formulas may be
                        // referenced. No eval(), no Function(), no arbitrary
                        // expressions — an unknown formulaId is refused outright.
                        return { success: false, reason: `Unknown/unregistered formulaId '${def.formulaId}' for calculation '${def.key}'. Register it in the FormulaRegistry first — arbitrary expressions are never accepted.` };
                    }
                    if (!def.inputs || typeof def.inputs !== "object") {
                        return { success: false, reason: `Calculation '${def.key}' requires an 'inputs' map.` };
                    }
                }
                resolvedCalculations = calculations;
            }

            const storage = this.#storage();
            if (!storage) return { success: false, reason: "Storage Gateway (window.CozyStorage) is not loaded — failing closed." };

            const id = schemaKey(organizationId, applicationId, recordType);
            const schema = {
                id, organizationId, applicationId, recordType,
                columns: columns.map((c, idx) => ({
                    key: c.key, label: c.label || c.key, type: c.type || "string",
                    required: !!c.required, order: idx
                })),
                calculations: resolvedCalculations,
                updatedBy: userId, updatedAt: nowIso()
            };

            try {
                await storage.save(STORE_SCHEMAS, schema, organizationId);
            } catch (err) {
                return { success: false, reason: `Storage save failed: ${err.message || err}` };
            }
            this.#emit("BusinessRecordEngine:SchemaDefined", { organizationId, applicationId, recordType });
            return { success: true, schema };
        }

        async getSchema(organizationId, applicationId, recordType, userId) {
            const auth = this.#authorize(organizationId, userId, PERMISSIONS.READ);
            if (!auth.ok) return { success: false, reason: auth.reason };
            const storage = this.#storage();
            if (!storage) return { success: false, reason: "Storage Gateway (window.CozyStorage) is not loaded — failing closed." };
            try {
                const schema = await storage.get(STORE_SCHEMAS, schemaKey(organizationId, applicationId, recordType), organizationId);
                if (!schema) return { success: true, schema: null };
                return { success: true, schema };
            } catch (err) {
                return { success: false, reason: `Storage get failed: ${err.message || err}` };
            }
        }

        async #mutateColumns(organizationId, applicationId, recordType, userId, mutateFn) {
            const auth = this.#authorize(organizationId, userId, PERMISSIONS.MANAGE_SCHEMA);
            if (!auth.ok) return { success: false, reason: auth.reason };
            const storage = this.#storage();
            if (!storage) return { success: false, reason: "Storage Gateway (window.CozyStorage) is not loaded — failing closed." };
            const id = schemaKey(organizationId, applicationId, recordType);
            let schema;
            try {
                schema = await storage.get(STORE_SCHEMAS, id, organizationId);
            } catch (err) {
                return { success: false, reason: `Storage get failed: ${err.message || err}` };
            }
            if (!schema) return { success: false, reason: `No schema defined yet for ${applicationId}/${recordType} — call defineSchema() first.` };

            const result = mutateFn(schema.columns.slice());
            if (result.error) return { success: false, reason: result.error };

            schema.columns = result.columns.map((c, idx) => ({ ...c, order: idx }));
            schema.updatedBy = userId; schema.updatedAt = nowIso();
            try {
                await storage.save(STORE_SCHEMAS, schema, organizationId);
            } catch (err) {
                return { success: false, reason: `Storage save failed: ${err.message || err}` };
            }
            return { success: true, schema };
        }

        addColumn(organizationId, applicationId, recordType, userId, column) {
            return this.#mutateColumns(organizationId, applicationId, recordType, userId, columns => {
                if (!column || typeof column.key !== "string" || !column.key) return { error: "column.key is required." };
                if (columns.some(c => c.key === column.key)) return { error: `Column '${column.key}' already exists.` };
                columns.push({ key: column.key, label: column.label || column.key, type: column.type || "string", required: !!column.required });
                return { columns };
            });
        }

        removeColumn(organizationId, applicationId, recordType, userId, columnKey) {
            return this.#mutateColumns(organizationId, applicationId, recordType, userId, columns => {
                const next = columns.filter(c => c.key !== columnKey);
                if (next.length === columns.length) return { error: `Column '${columnKey}' does not exist.` };
                return { columns: next };
            });
        }

        renameColumn(organizationId, applicationId, recordType, userId, columnKey, newLabel) {
            return this.#mutateColumns(organizationId, applicationId, recordType, userId, columns => {
                const col = columns.find(c => c.key === columnKey);
                if (!col) return { error: `Column '${columnKey}' does not exist.` };
                col.label = newLabel;
                return { columns };
            });
        }

        reorderColumns(organizationId, applicationId, recordType, userId, orderedKeys) {
            return this.#mutateColumns(organizationId, applicationId, recordType, userId, columns => {
                if (!Array.isArray(orderedKeys) || orderedKeys.length !== columns.length) {
                    return { error: "orderedKeys must list every existing column key exactly once." };
                }
                const byKey = new Map(columns.map(c => [c.key, c]));
                const next = orderedKeys.map(k => byKey.get(k));
                if (next.some(c => !c)) return { error: "orderedKeys references an unknown column key." };
                return { columns: next };
            });
        }

        // ──────────────────────────────────────────────────────────────
        // Calculated fields — always via the real CalculationEngine
        // ──────────────────────────────────────────────────────────────

        #computeCalculatedFields(fields, calcDefs, organizationId, applicationId, userId) {
            const calc = this.#calcEngine();
            const calculatedFields = {};
            if (!calc) {
                for (const def of calcDefs) calculatedFields[def.key] = { available: false, reason: "CalculationEngine is not loaded." };
                return calculatedFields;
            }
            for (const def of calcDefs) {
                const inputs = {};
                let missing = null;
                for (const [inputName, sourceKey] of Object.entries(def.inputs)) {
                    let value;
                    if (typeof sourceKey === "string" && sourceKey.startsWith("__calc:")) {
                        const depKey = sourceKey.slice("__calc:".length);
                        const dep = calculatedFields[depKey];
                        value = (dep && dep.available) ? dep.value : undefined;
                    } else {
                        value = fields[sourceKey];
                    }
                    if (value === undefined) { missing = sourceKey; break; }
                    inputs[inputName] = value;
                }
                if (missing) {
                    // Fail honestly rather than inventing a value.
                    calculatedFields[def.key] = { available: false, reason: `Missing input '${missing}'.` };
                    continue;
                }
                const result = calc.calculate(def.formulaId, inputs, { application: applicationId, user: userId, organization: organizationId });
                calculatedFields[def.key] = result.success
                    ? { available: true, value: result.result, formulaId: def.formulaId }
                    : { available: false, reason: result.reason };
            }
            return calculatedFields;
        }

        // ──────────────────────────────────────────────────────────────
        // Records
        // ──────────────────────────────────────────────────────────────

        async createRecord({ organizationId, applicationId, recordType, userId, fields } = {}) {
            const auth = this.#authorize(organizationId, userId, PERMISSIONS.CREATE);
            if (!auth.ok) return { success: false, reason: auth.reason };
            if (!applicationId || !recordType) return { success: false, reason: "applicationId and recordType are required." };
            if (!fields || typeof fields !== "object") return { success: false, reason: "fields is required." };

            const storage = this.#storage();
            if (!storage) return { success: false, reason: "Storage Gateway (window.CozyStorage) is not loaded — failing closed." };

            // Required-column validation, only if a schema has been defined.
            let schema = null;
            try {
                schema = await storage.get(STORE_SCHEMAS, schemaKey(organizationId, applicationId, recordType), organizationId);
            } catch (err) {
                return { success: false, reason: `Storage get failed: ${err.message || err}` };
            }
            if (schema) {
                const missingRequired = schema.columns.filter(c => c.required && fields[c.key] === undefined);
                if (missingRequired.length > 0) {
                    return { success: false, reason: `Missing required field(s): ${missingRequired.map(c => c.key).join(", ")}.` };
                }
            }

            const calcDefs = (schema && Array.isArray(schema.calculations) && schema.calculations.length > 0) ? schema.calculations : DEFAULT_CALCULATIONS;
            const calculatedFields = this.#computeCalculatedFields(fields, calcDefs, organizationId, applicationId, userId);

            const record = {
                id: generateId("brec"),
                organizationId, applicationId, recordType,
                fields: { ...fields },
                calculatedFields,
                status: "active",
                reversalOf: null, correctionOf: null,
                reversedBy: null, correctedBy: null, restoredBy: null,
                reason: null,
                createdBy: userId, createdAt: nowIso(), updatedAt: nowIso()
            };

            try {
                await storage.save(STORE_RECORDS, record, organizationId);
            } catch (err) {
                return { success: false, reason: `Storage save failed: ${err.message || err}` };
            }

            this.#emit("BusinessRecordEngine:RecordCreated", { organizationId, applicationId, recordType, recordId: record.id });
            return { success: true, record };
        }

        async getRecord(organizationId, recordId, userId) {
            const auth = this.#authorize(organizationId, userId, PERMISSIONS.READ);
            if (!auth.ok) return { success: false, reason: auth.reason };
            const storage = this.#storage();
            if (!storage) return { success: false, reason: "Storage Gateway (window.CozyStorage) is not loaded — failing closed." };
            try {
                const record = await storage.get(STORE_RECORDS, recordId, organizationId);
                if (!record) return { success: false, reason: `Record '${recordId}' not found.` };
                return { success: true, record };
            } catch (err) {
                return { success: false, reason: `Storage get failed: ${err.message || err}` };
            }
        }

        async listRecords({ organizationId, applicationId, recordType, userId, from, to } = {}) {
            const auth = this.#authorize(organizationId, userId, PERMISSIONS.READ);
            if (!auth.ok) return { success: false, reason: auth.reason };
            const storage = this.#storage();
            if (!storage) return { success: false, reason: "Storage Gateway (window.CozyStorage) is not loaded — failing closed." };
            let all;
            try {
                all = await storage.list(STORE_RECORDS, organizationId);
            } catch (err) {
                return { success: false, reason: `Storage list failed: ${err.message || err}` };
            }
            const fromTs = from ? new Date(from).getTime() : -Infinity;
            const toTs   = to ? new Date(to).getTime() : Infinity;
            const records = all.filter(r =>
                r.organizationId === organizationId &&
                (!applicationId || r.applicationId === applicationId) &&
                (!recordType || r.recordType === recordType) &&
                (() => { const t = new Date(r.createdAt).getTime(); return t >= fromTs && t <= toTs; })()
            );
            return { success: true, records };
        }

        // ──────────────────────────────────────────────────────────────
        // Time-based aggregation
        // ──────────────────────────────────────────────────────────────

        /** Real date-range resolution — no fabricated presets. */
        #resolveRange(preset, from, to, referenceDate) {
            const now = referenceDate ? new Date(referenceDate) : new Date();
            const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
            const endOfDay   = d => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

            switch (preset) {
                case "current":   return { from: new Date(0), to: now };
                case "today":     return { from: startOfDay(now), to: now };
                case "midday":    { const m = new Date(now); m.setHours(12, 0, 0, 0); return { from: startOfDay(now), to: m }; }
                case "endOfDay":  return { from: startOfDay(now), to: endOfDay(now) };
                case "yesterday": { const y = new Date(now); y.setDate(y.getDate() - 1); return { from: startOfDay(y), to: endOfDay(y) }; }
                case "week":      { const w = new Date(now); const day = (w.getDay() + 6) % 7; w.setDate(w.getDate() - day); return { from: startOfDay(w), to: now }; }
                case "month":     { const m = new Date(now.getFullYear(), now.getMonth(), 1); return { from: startOfDay(m), to: now }; }
                case "year":      { const y = new Date(now.getFullYear(), 0, 1); return { from: startOfDay(y), to: now }; }
                case "custom":
                case undefined:
                case null:
                    if (!from || !to) return { error: "custom date range requires both 'from' and 'to'." };
                    return { from: new Date(from), to: new Date(to) };
                default:
                    return { error: `Unknown preset '${preset}'.` };
            }
        }

        async aggregate({ organizationId, applicationId, recordType, userId, preset, from, to, referenceDate, excludeReversedPairs = false } = {}) {
            const auth = this.#authorize(organizationId, userId, PERMISSIONS.READ);
            if (!auth.ok) return { success: false, reason: auth.reason };

            const range = this.#resolveRange(preset, from, to, referenceDate);
            if (range.error) return { success: false, reason: range.error };

            const listResult = await this.listRecords({
                organizationId, applicationId, recordType, userId,
                from: range.from.toISOString(), to: range.to.toISOString()
            });
            if (!listResult.success) return listResult;

            let records = listResult.records;
            if (excludeReversedPairs) {
                records = records.filter(r => r.status !== "reversed" && r.status !== "reversal");
            }

            const totals = {};
            let count = 0;
            for (const r of records) {
                count++;
                for (const [key, calc] of Object.entries(r.calculatedFields || {})) {
                    if (!calc.available) continue;
                    totals[key] = (totals[key] || 0) + calc.value;
                }
            }

            return {
                success: true,
                organizationId, applicationId, recordType,
                range: { from: range.from.toISOString(), to: range.to.toISOString() },
                recordCount: count,
                totals
            };
        }

        // ──────────────────────────────────────────────────────────────
        // Reversal / Correction / Restoration — never destructive
        // ──────────────────────────────────────────────────────────────

        #negate(calculatedFields) {
            const out = {};
            for (const [key, calc] of Object.entries(calculatedFields || {})) {
                out[key] = calc.available ? { available: true, value: -calc.value, formulaId: calc.formulaId } : calc;
            }
            return out;
        }

        async reverseRecord({ organizationId, recordId, userId, reason } = {}) {
            const auth = this.#authorize(organizationId, userId, PERMISSIONS.REVERSE);
            if (!auth.ok) return { success: false, reason: auth.reason };
            const storage = this.#storage();
            if (!storage) return { success: false, reason: "Storage Gateway (window.CozyStorage) is not loaded — failing closed." };

            let original;
            try {
                original = await storage.get(STORE_RECORDS, recordId, organizationId);
            } catch (err) {
                return { success: false, reason: `Storage get failed: ${err.message || err}` };
            }
            if (!original) return { success: false, reason: `Record '${recordId}' not found.` };
            if (original.reversedBy) return { success: false, reason: `Record '${recordId}' has already been reversed by '${original.reversedBy}'.` };

            const reversal = {
                id: generateId("brev"),
                organizationId, applicationId: original.applicationId, recordType: original.recordType,
                fields: { ...original.fields },
                calculatedFields: this.#negate(original.calculatedFields),
                status: "reversal",
                reversalOf: original.id, correctionOf: null,
                reversedBy: null, correctedBy: null, restoredBy: null,
                reason: reason || null,
                createdBy: userId, createdAt: nowIso(), updatedAt: nowIso()
            };

            try {
                await storage.save(STORE_RECORDS, reversal, organizationId);
                await storage.update(STORE_RECORDS, original.id,
                    { status: "reversed", reversedBy: reversal.id, updatedAt: nowIso(), _version: original._version },
                    organizationId);
            } catch (err) {
                return { success: false, reason: `Storage operation failed: ${err.message || err}` };
            }

            this.#emit("BusinessRecordEngine:RecordReversed", { organizationId, recordId, reversalId: reversal.id, actor: userId, reason: reason || null });
            return { success: true, original: { ...original, status: "reversed", reversedBy: reversal.id }, reversal };
        }

        /** correctRecord — a correction is a reversal of the original plus a
         *  new replacement record, both real, both auditable. Nothing is
         *  rewritten in place. */
        async correctRecord({ organizationId, recordId, userId, correctedFields, reason } = {}) {
            const reversalResult = await this.reverseRecord({ organizationId, recordId, userId, reason: reason || "correction" });
            if (!reversalResult.success) return reversalResult;

            const createResult = await this.createRecord({
                organizationId,
                applicationId: reversalResult.original.applicationId,
                recordType: reversalResult.original.recordType,
                userId,
                fields: correctedFields
            });
            if (!createResult.success) return { success: false, reason: `Reversal succeeded but replacement record failed: ${createResult.reason}`, reversal: reversalResult.reversal };

            const storage = this.#storage();
            if (storage) {
                try {
                    const currentOriginal = await storage.get(STORE_RECORDS, recordId, organizationId);
                    await storage.update(STORE_RECORDS, recordId,
                        { correctedBy: createResult.record.id, updatedAt: nowIso(), _version: currentOriginal._version },
                        organizationId);
                    await storage.update(STORE_RECORDS, createResult.record.id,
                        { correctionOf: recordId, updatedAt: nowIso(), _version: createResult.record._version },
                        organizationId);
                } catch (err) {
                    return { success: false, reason: `Correction linkage update failed: ${err.message || err}`, reversal: reversalResult.reversal, corrected: createResult.record };
                }
            }

            this.#emit("BusinessRecordEngine:RecordCorrected", { organizationId, recordId, correctedRecordId: createResult.record.id, actor: userId });
            return { success: true, reversal: reversalResult.reversal, corrected: { ...createResult.record, correctionOf: recordId } };
        }

        /** restoreRecord — legitimate only for a record currently in
         *  'reversed' status; creates a compensating entry that cancels the
         *  reversal (bringing net totals back to the original value)
         *  instead of deleting the reversal or rewriting the original. */
        async restoreRecord({ organizationId, recordId, userId, reason } = {}) {
            const auth = this.#authorize(organizationId, userId, PERMISSIONS.REVERSE);
            if (!auth.ok) return { success: false, reason: auth.reason };
            const storage = this.#storage();
            if (!storage) return { success: false, reason: "Storage Gateway (window.CozyStorage) is not loaded — failing closed." };

            let original;
            try {
                original = await storage.get(STORE_RECORDS, recordId, organizationId);
            } catch (err) {
                return { success: false, reason: `Storage get failed: ${err.message || err}` };
            }
            if (!original) return { success: false, reason: `Record '${recordId}' not found.` };
            if (original.status !== "reversed" || !original.reversedBy) {
                return { success: false, reason: `Record '${recordId}' is not currently reversed — nothing to restore.` };
            }

            let reversalRecord;
            try {
                reversalRecord = await storage.get(STORE_RECORDS, original.reversedBy, organizationId);
            } catch (err) {
                return { success: false, reason: `Storage get failed: ${err.message || err}` };
            }
            if (!reversalRecord) return { success: false, reason: `Reversal record '${original.reversedBy}' not found — cannot restore safely.` };

            const restoration = {
                id: generateId("brst"),
                organizationId, applicationId: original.applicationId, recordType: original.recordType,
                fields: { ...original.fields },
                calculatedFields: this.#negate(reversalRecord.calculatedFields),
                status: "restoration",
                reversalOf: null, correctionOf: null, restorationOf: reversalRecord.id,
                reversedBy: null, correctedBy: null, restoredBy: null,
                reason: reason || null,
                createdBy: userId, createdAt: nowIso(), updatedAt: nowIso()
            };

            try {
                await storage.save(STORE_RECORDS, restoration, organizationId);
                await storage.update(STORE_RECORDS, original.id,
                    { status: "active", restoredBy: restoration.id, updatedAt: nowIso(), _version: original._version },
                    organizationId);
            } catch (err) {
                return { success: false, reason: `Storage operation failed: ${err.message || err}` };
            }

            this.#emit("BusinessRecordEngine:RecordRestored", { organizationId, recordId, restorationId: restoration.id, actor: userId });
            return { success: true, original: { ...original, status: "active", restoredBy: restoration.id }, restoration };
        }

        getDiagnosticsReport() {
            return {
                moduleVersion: BRE_VERSION,
                dependenciesLoaded: {
                    storage: !!this.#storage(),
                    calculationEngine: !!this.#calcEngine(),
                    organizationRegistry: !!this.#orgRegistry(),
                    organizationMembership: !!this.#membership(),
                    formulaRegistry: !!this.#formulaRegistry(),
                    platformEventBus: !!this.#eventBus()
                }
            };
        }
    }

    if (window.CozyOS.BusinessRecordEngine && typeof window.CozyOS.BusinessRecordEngine.getVersion === "function") {
        const existingVersion = window.CozyOS.BusinessRecordEngine.getVersion();
        if (existingVersion !== BRE_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: BusinessRecordEngine existing v${existingVersion} conflicts with load target v${BRE_VERSION}.`);
        return;
    }

    const instance = new CozyBusinessRecordEngine();
    instance.PERMISSIONS = PERMISSIONS;
    window.CozyOS.BusinessRecordEngine = instance;

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/calculation/business-record-engine.js",
                name: "BusinessRecordEngine", category: "Platform", icon: "ledger.svg",
                description: "Reusable business records + flexible columns + aggregation + audit-safe reversal for any application (PharmacyOS, RetailOS, QuarryOS, MpesaOS, ...). Composes CalculationEngine, Storage Gateway, and Organization authorities — owns none of them."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
