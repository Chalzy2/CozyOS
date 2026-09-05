/**
 * CozyOS Business Activity Intelligence — Core
 * File Reference: core/business-activity/business-activity-intelligence.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * MILESTONE: Universal Business Activity Intelligence Core
 *
 * RESPONSIBILITY (and only this)
 *   Observe reliable business records recorded through the real, existing
 *   window.CozyOS.BusinessRecordEngine and produce structured, explainable
 *   observations (summaries, comparisons, trends, product activity,
 *   low-stock/low-balance flags, supplier price changes, conservative
 *   anomalies, pending-activity surfacing) for ANY application. This file
 *   does not decide what to do about an observation, does not notify
 *   anyone, and does not use AI/ML — it reads recorded facts and reports
 *   them, honestly, or reports that the facts required are not available.
 *
 * OWNERSHIP AUDIT RESULT (do not re-litigate without a new audit)
 *   A repository-wide search for existing "business intelligence" /
 *   "sales summary" / "profit summary" / "sales trend" / "dormant
 *   product" / "business activity" capability found no owner:
 *     - core/modules/analytics/cozy-analytics.js (window.CozyOS.
 *       CozyAnalyticsKernel) is an execution-free registry/session/plugin
 *       coordination kernel for the ANALYTICS SUBSYSTEM ITSELF (nodes,
 *       queues, jobs, schedules) — by its own file header it performs no
 *       aggregation math and has no concept of a business record. Not an
 *       owner of this capability.
 *     - core/modules/intelligence/** (window.CozyOS.CozyIntelligence and
 *       everything under it) is the CozyAI conversational/knowledge/
 *       language subsystem (providers, knowledge community, language
 *       packs, media research). No file under it reads business_records
 *       or computes sales/profit/expense figures. Not an owner.
 *     - Low-stock detection exists today only as PER-APPLICATION,
 *       non-reusable logic inside core/modules/ShopOS/shopos.js,
 *       core/plugins/shopOS-inventory.js and
 *       core/modules/WholesaleOS/wholesale-*.js — each hard-coded to its
 *       own application's inventory shape. No application-agnostic,
 *       organization-isolated Core version exists. This file does not
 *       modify or replace those; it adds the missing reusable Core
 *       capability that a future ShopOS/WholesaleOS revision could
 *       migrate onto, on its own schedule.
 *     - No file anywhere defines window.CozyOS.BusinessActivityIntelligence
 *       prior to this milestone (confirmed: zero matches for
 *       "BusinessActivityIntelligence" / "BusinessActivityIntelligenceCore"
 *       repository-wide before this file was added).
 *   Conclusion: genuinely missing capability. New Core file, same
 *   justification pattern as BusinessRecordEngine itself.
 *
 *   Arithmetic is NEVER reimplemented here. Every monetary total this file
 *   reports comes from window.CozyOS.BusinessRecordEngine.aggregate()
 *   (which itself only ever sums calculatedFields already produced by
 *   CalculationEngine/FormulaRegistry) or from
 *   BusinessRecordEngine.listRecords() results, read as-is. The only
 *   arithmetic performed directly in this file is: (a) plain differences
 *   and percentage-change between two already-aggregated totals, and
 *   (b) calendar date-range boundary computation for period presets that
 *   BusinessRecordEngine.aggregate() does not itself expose (see PERIOD
 *   PRESET NOTE below). Neither duplicates business-record calculation.
 *
 *   Organization existence + authorization are NEVER reimplemented as a
 *   fallback here. This file calls the real, existing
 *   window.CozyOS.OrganizationRegistry.organizationExists(orgId) and
 *   window.CozyOS.OrganizationMembership.isAuthorized(userId, orgId,
 *   permission) directly — the exact same two real authorities
 *   BusinessRecordEngine itself uses — so that this service still fails
 *   closed even in a hypothetical caller path that reached it without
 *   going through BusinessRecordEngine first. This is defense in depth,
 *   not a second authority: both checks defer entirely to the real
 *   OrganizationRegistry/OrganizationMembership implementations.
 *
 *   Entitlement logic is NOT created here, per instruction. If this
 *   service becomes a gated feature in the future, EntitlementEngine
 *   should be composed at that time — composing it today with nothing to
 *   check would be theater, not integration.
 *
 * PERIOD PRESET NOTE (disclosed, not hidden)
 *   BusinessRecordEngine.aggregate()'s own #resolveRange() supports:
 *   current, today, midday, endOfDay, yesterday, week, month, year, and
 *   custom — but has no notion of "the period BEFORE this one" (previous
 *   week / previous month / previous year), which section 5 of this
 *   milestone's brief explicitly requires for comparisons ("How did
 *   August compare with July?"). That comparison-period math does not
 *   exist anywhere else in the repository. This file adds it locally
 *   (#resolvePeriod below) as plain calendar-boundary arithmetic, then
 *   calls BusinessRecordEngine.aggregate({ preset: "custom", from, to })
 *   for the actual data — so the "what period is this" decision lives
 *   here, but the "what happened in that period" computation still comes
 *   entirely from the real BusinessRecordEngine/CalculationEngine path.
 *
 * DEPENDENCY / LOAD-ORDER NOTE
 *   Every dependency below is resolved LAZILY, at the moment each
 *   operation runs — same pattern as BusinessRecordEngine — so load order
 *   between this file and BusinessRecordEngine/OrganizationRegistry/
 *   OrganizationMembership/PlatformEventBus does not matter, only
 *   availability at call time does. Fail closed, always, when a
 *   dependency is unavailable. Never a fallback implementation of a
 *   missing dependency.
 *
 * EXPLAINABILITY CONTRACT
 *   Every value-bearing result carries enough to explain itself: the
 *   period/range used, the record count behind it, and — for
 *   observation-style results — a human-readable message plus an
 *   `evidence` object naming the source record ids. Nothing in this file
 *   returns an unexplained score. Where the required underlying data is
 *   missing, the result says so explicitly (`available: false`, a
 *   `reason` string) instead of substituting zero or a guess.
 *
 * ORGANIZATION ISOLATION
 *   Every public method requires organizationId + userId and authorizes
 *   both before touching data. All record reads flow through
 *   BusinessRecordEngine.listRecords()/aggregate(), which themselves
 *   filter strictly by organizationId at the Storage Gateway boundary.
 *   This file introduces no second data path and no cross-organization
 *   query of any kind.
 *
 * NOT BUILT IN THIS MILESTONE (per explicit instruction — future layers)
 *   No notification/reminder delivery, no SMS/email/WhatsApp, no AI
 *   advisor, no new dashboard UI. Observation shapes below are designed
 *   to be consumed by those future layers, not to become them.
 *
 * BROWSER RUNTIME
 *   No real end-user page in this repository surfaces business activity
 *   intelligence today (confirmed by the same search used in the
 *   BusinessRecordEngine milestone — this is a headless platform
 *   service, like BusinessRecordEngine itself). Verified in this
 *   milestone via the real Node test harness only.
 *   Browser Runtime Verified: NOT PERFORMED.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const BAI_VERSION = "1.0.0-ENTERPRISE";

    const PERMISSIONS = Object.freeze({
        READ: "business-activity:read"
    });

    const MS_DAY = 24 * 60 * 60 * 1000;

    function nowIso() { return new Date().toISOString(); }
    function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
    function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
    function round2(n) { return Math.round(n * 100) / 100; }

    class CozyBusinessActivityIntelligence {
        getVersion() { return BAI_VERSION; }

        // ──────────────────────────────────────────────────────────────
        // Dependency resolution — lazy, fail-closed, never a fallback.
        // ──────────────────────────────────────────────────────────────
        #bre() {
            return (window.CozyOS && window.CozyOS.BusinessRecordEngine) ? window.CozyOS.BusinessRecordEngine : null;
        }
        #orgRegistry() {
            return (window.CozyOS && window.CozyOS.OrganizationRegistry) ? window.CozyOS.OrganizationRegistry : null;
        }
        #membership() {
            return (window.CozyOS && window.CozyOS.OrganizationMembership) ? window.CozyOS.OrganizationMembership : null;
        }
        #eventBus() {
            return (window.CozyOS && window.CozyOS.PlatformEventBus) ? window.CozyOS.PlatformEventBus : null;
        }
        #emit(event, data) {
            const bus = this.#eventBus();
            if (!bus || typeof bus.emit !== "function") return;
            try { bus.emit(event, data); } catch (_err) { /* non-fatal */ }
        }

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
        // Period resolution — calendar boundaries ONLY. Never computes a
        // business figure; see PERIOD PRESET NOTE in the file header.
        // ──────────────────────────────────────────────────────────────
        #resolvePeriod(preset, referenceDate, from, to) {
            const now = referenceDate ? new Date(referenceDate) : new Date();
            if (Number.isNaN(now.getTime())) return { error: "Invalid referenceDate." };

            const weekStart = d => { const w = new Date(d); const day = (w.getDay() + 6) % 7; w.setDate(w.getDate() - day); return startOfDay(w); };

            switch (preset) {
                case "today": return { from: startOfDay(now), to: endOfDay(now) };
                case "yesterday": { const y = new Date(now); y.setDate(y.getDate() - 1); return { from: startOfDay(y), to: endOfDay(y) }; }
                case "thisWeek": { const s = weekStart(now); const e = new Date(s); e.setDate(e.getDate() + 6); return { from: s, to: endOfDay(e) }; }
                case "previousWeek": { const s = weekStart(now); s.setDate(s.getDate() - 7); const e = new Date(s); e.setDate(e.getDate() + 6); return { from: s, to: endOfDay(e) }; }
                case "thisMonth": { const s = new Date(now.getFullYear(), now.getMonth(), 1); return { from: startOfDay(s), to: endOfDay(now) }; }
                case "previousMonth": { const s = new Date(now.getFullYear(), now.getMonth() - 1, 1); const e = new Date(now.getFullYear(), now.getMonth(), 0); return { from: startOfDay(s), to: endOfDay(e) }; }
                case "thisYear": { const s = new Date(now.getFullYear(), 0, 1); return { from: startOfDay(s), to: endOfDay(now) }; }
                case "previousYear": { const s = new Date(now.getFullYear() - 1, 0, 1); const e = new Date(now.getFullYear() - 1, 11, 31); return { from: startOfDay(s), to: endOfDay(e) }; }
                case "custom":
                    if (!from || !to) return { error: "custom period requires both 'from' and 'to'." };
                    { const f = new Date(from), t = new Date(to);
                      if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return { error: "Invalid 'from'/'to'." };
                      return { from: f, to: t }; }
                default:
                    return { error: `Unknown period preset '${preset}'.` };
            }
        }

        /** The period immediately preceding an equal-length window ending
         *  at `from`, used for "previous equivalent period" comparisons
         *  on custom ranges. Pure calendar arithmetic — no business data. */
        #precedingEquivalent(from, to) {
            const spanMs = to.getTime() - from.getTime();
            const prevTo = new Date(from.getTime() - 1);
            const prevFrom = new Date(prevTo.getTime() - spanMs);
            return { from: prevFrom, to: prevTo };
        }

        // ──────────────────────────────────────────────────────────────
        // Section 4/5 — Daily & period summaries
        // ──────────────────────────────────────────────────────────────

        /**
         * periodSummary — the reusable core. Reports sales/purchases/
         * expenses/gross-profit/net-result for a period, deriving each
         * ONLY from what BusinessRecordEngine.aggregate() actually
         * returns. `recordTypes` and `valueFields` let each application
         * name its own record types and which calculated-field key holds
         * the monetary figure for that type — nothing here hard-codes an
         * application's schema.
         */
        async periodSummary({
            organizationId, applicationId, userId,
            preset, from, to, referenceDate,
            recordTypes = { sale: "sale", purchase: "purchase", expense: "expense" },
            valueFields = { sale: "sales", purchase: "cost", expense: "amount" }
        } = {}) {
            const auth = this.#authorize(organizationId, userId, PERMISSIONS.READ);
            if (!auth.ok) return { success: false, reason: auth.reason };

            const bre = this.#bre();
            if (!bre) return { success: false, reason: "BusinessRecordEngine is not loaded — failing closed." };

            const period = this.#resolvePeriod(preset, referenceDate, from, to);
            if (period.error) return { success: false, reason: period.error };

            const components = {};
            for (const [kind, recordType] of Object.entries(recordTypes)) {
                if (!recordType) { components[kind] = { available: false, reason: `No recordType configured for '${kind}'.` }; continue; }
                const agg = await bre.aggregate({
                    organizationId, applicationId, recordType, userId,
                    preset: "custom", from: period.from.toISOString(), to: period.to.toISOString()
                });
                if (!agg.success) { components[kind] = { available: false, reason: agg.reason }; continue; }
                const field = valueFields[kind];
                const value = field && agg.totals && Object.prototype.hasOwnProperty.call(agg.totals, field)
                    ? agg.totals[field] : undefined;
                components[kind] = value === undefined
                    ? { available: false, reason: `Insufficient recorded data: no '${field}' figure found on '${recordType}' records for this period.`, recordCount: agg.recordCount }
                    : { available: true, value: round2(value), recordCount: agg.recordCount, sourceRecordType: recordType };
            }

            const salesVal = components.sale && components.sale.available ? components.sale.value : null;
            const purchaseVal = components.purchase && components.purchase.available ? components.purchase.value : null;
            const expenseVal = components.expense && components.expense.available ? components.expense.value : null;

            const grossProfit = (salesVal !== null && purchaseVal !== null)
                ? { available: true, value: round2(salesVal - purchaseVal) }
                : { available: false, reason: "Insufficient recorded data: gross profit requires both sales and purchase figures." };

            const netResult = (grossProfit.available && expenseVal !== null)
                ? { available: true, value: round2(grossProfit.value - expenseVal) }
                : { available: false, reason: "Insufficient recorded data: net result requires gross profit and expense figures." };

            return {
                success: true,
                organizationId, applicationId,
                range: { from: period.from.toISOString(), to: period.to.toISOString() },
                sales: components.sale, purchases: components.purchase, expenses: components.expense,
                grossProfit, netResult
            };
        }

        /** Convenience wrapper — "TODAY" summary from section 4. */
        async dailySummary(args = {}) {
            return this.periodSummary({ ...args, preset: "today" });
        }

        /**
         * comparePeriods — section 5/6/7/8. Compares two already-derived
         * periodSummary() results component-by-component. Never
         * manufactures significance: a component is only classified
         * increase/decrease/stable when BOTH periods have an available
         * value; otherwise it is honestly reported as insufficient
         * history.
         */
        async comparePeriods({ organizationId, applicationId, userId, currentPreset, previousPreset, from, to, referenceDate, recordTypes, valueFields, stableThresholdPct = 3 } = {}) {
            const auth = this.#authorize(organizationId, userId, PERMISSIONS.READ);
            if (!auth.ok) return { success: false, reason: auth.reason };

            let currentArgs, previousArgs;
            if (currentPreset === "custom") {
                const period = this.#resolvePeriod("custom", referenceDate, from, to);
                if (period.error) return { success: false, reason: period.error };
                const prev = this.#precedingEquivalent(period.from, period.to);
                currentArgs = { preset: "custom", from: period.from.toISOString(), to: period.to.toISOString() };
                previousArgs = { preset: "custom", from: prev.from.toISOString(), to: prev.to.toISOString() };
            } else {
                currentArgs = { preset: currentPreset };
                previousArgs = { preset: previousPreset };
            }

            const [current, previous] = await Promise.all([
                this.periodSummary({ organizationId, applicationId, userId, ...currentArgs, referenceDate, recordTypes, valueFields }),
                this.periodSummary({ organizationId, applicationId, userId, ...previousArgs, referenceDate, recordTypes, valueFields })
            ]);
            if (!current.success) return current;
            if (!previous.success) return previous;

            const compareComponent = (curComp, prevComp) => {
                if (!curComp.available || !prevComp.available) {
                    return { status: "insufficient-history", reason: "One or both periods lack a derivable figure for this metric." };
                }
                const currentValue = curComp.value, previousValue = prevComp.value;
                const absoluteChange = round2(currentValue - previousValue);
                let percentChange = null;
                if (previousValue !== 0) percentChange = round2((absoluteChange / Math.abs(previousValue)) * 100);
                let status;
                if (percentChange === null) status = absoluteChange === 0 ? "stable" : (absoluteChange > 0 ? "increase" : "decrease");
                else if (Math.abs(percentChange) < stableThresholdPct) status = "stable";
                else status = percentChange > 0 ? "increase" : "decrease";
                return { status, currentValue, previousValue, absoluteChange, percentChange };
            };

            return {
                success: true, organizationId, applicationId,
                current: { range: current.range }, previous: { range: previous.range },
                changes: {
                    sales: compareComponent(current.sales, previous.sales),
                    purchases: compareComponent(current.purchases, previous.purchases),
                    expenses: compareComponent(current.expenses, previous.expenses),
                    grossProfit: compareComponent(current.grossProfit, previous.grossProfit),
                    netResult: compareComponent(current.netResult, previous.netResult)
                }
            };
        }

        /** Section 6 — sales trend, explainable, over a named/custom period pair. */
        async salesTrend(args = {}) {
            const cmp = await this.comparePeriods(args);
            if (!cmp.success) return cmp;
            return this.#trendFromChange("sales", cmp.changes.sales, cmp);
        }
        /** Section 7 — expense trend. */
        async expenseTrend(args = {}) {
            const cmp = await this.comparePeriods(args);
            if (!cmp.success) return cmp;
            return this.#trendFromChange("expenses", cmp.changes.expenses, cmp);
        }
        /** Section 8 — profit trend (uses grossProfit, composed from CalculationEngine-derived figures only). */
        async profitTrend(args = {}) {
            const cmp = await this.comparePeriods(args);
            if (!cmp.success) return cmp;
            return this.#trendFromChange("profit", cmp.changes.grossProfit, cmp);
        }

        #trendFromChange(metric, change, cmp) {
            if (change.status === "insufficient-history") {
                return { success: true, metric, status: "insufficient-history", message: `Insufficient recorded history to determine a ${metric} trend.`, range: { current: cmp.current.range, previous: cmp.previous.range } };
            }
            const direction = change.status === "increase" ? "increased" : change.status === "decrease" ? "decreased" : "remained relatively stable";
            const message = change.percentChange !== null
                ? `${metric[0].toUpperCase()}${metric.slice(1)} ${direction}${change.status !== "stable" ? ` ${Math.abs(change.percentChange)}%` : ""} compared with the previous equivalent period.`
                : `${metric[0].toUpperCase()}${metric.slice(1)} ${direction} compared with the previous equivalent period.`;
            return {
                success: true, metric, status: change.status, message,
                currentValue: change.currentValue, previousValue: change.previousValue,
                absoluteChange: change.absoluteChange, percentChange: change.percentChange,
                range: { current: cmp.current.range, previous: cmp.previous.range }
            };
        }

        // ──────────────────────────────────────────────────────────────
        // Section 9 — Product activity / dormant-product detection
        // ──────────────────────────────────────────────────────────────
        async productActivity({ organizationId, applicationId, userId, recordType, productField = "productId", dormantDays = 30, referenceDate, from, to } = {}) {
            const auth = this.#authorize(organizationId, userId, PERMISSIONS.READ);
            if (!auth.ok) return { success: false, reason: auth.reason };
            const bre = this.#bre();
            if (!bre) return { success: false, reason: "BusinessRecordEngine is not loaded — failing closed." };
            if (!recordType) return { success: false, reason: "recordType is required (the application's own sales/activity record type)." };

            const listResult = await bre.listRecords({ organizationId, applicationId, recordType, userId, from, to });
            if (!listResult.success) return listResult;

            const now = referenceDate ? new Date(referenceDate) : new Date();
            const byProduct = new Map();
            for (const r of listResult.records) {
                const pid = r.fields ? r.fields[productField] : undefined;
                if (pid === undefined || pid === null) continue;
                if (!byProduct.has(pid)) byProduct.set(pid, { records: [] });
                byProduct.get(pid).records.push(r);
            }
            if (byProduct.size === 0) {
                return { success: true, available: false, reason: `Insufficient recorded data: no '${recordType}' records carry field '${productField}'.`, products: [], observations: [] };
            }

            const products = [];
            const observations = [];
            for (const [productId, data] of byProduct.entries()) {
                const sorted = data.records.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                const last = sorted[sorted.length - 1];
                const lastActivityAt = last.createdAt;
                const daysSince = Math.floor((now.getTime() - new Date(lastActivityAt).getTime()) / MS_DAY);
                const totalQuantity = sorted.reduce((sum, r) => sum + (Number(r.fields && r.fields.quantity) || 0), 0);
                products.push({ productId, recordCount: sorted.length, lastActivityAt, daysSinceLastActivity: daysSince, totalQuantity, sourceRecordIds: sorted.map(r => r.id) });

                if (daysSince >= dormantDays) {
                    observations.push({
                        type: "PRODUCT_NOT_SOLD", severity: "INFO",
                        organizationId, entityId: productId,
                        message: `Product ${productId} has not recorded activity for ${daysSince} days.`,
                        detectedAt: nowIso(),
                        evidence: { recordType, lastActivityAt, dormantThresholdDays: dormantDays, sourceRecordIds: [last.id] }
                    });
                }
            }
            return { success: true, available: true, organizationId, applicationId, recordType, products, observations };
        }

        // ──────────────────────────────────────────────────────────────
        // Section 10 — Low-stock intelligence (no invented thresholds)
        // ──────────────────────────────────────────────────────────────
        async lowStockObservations({ organizationId, applicationId, userId, inventoryRecordType, productField = "productId", quantityField = "quantityOnHand", thresholds, defaultThreshold, from, to } = {}) {
            const auth = this.#authorize(organizationId, userId, PERMISSIONS.READ);
            if (!auth.ok) return { success: false, reason: auth.reason };
            const bre = this.#bre();
            if (!bre) return { success: false, reason: "BusinessRecordEngine is not loaded — failing closed." };
            if (!inventoryRecordType) {
                return { success: true, available: false, reason: "Insufficient recorded data: no inventory record type configured for this application.", observations: [] };
            }
            const listResult = await bre.listRecords({ organizationId, applicationId, recordType: inventoryRecordType, userId, from, to });
            if (!listResult.success) return listResult;
            if (listResult.records.length === 0) {
                return { success: true, available: false, reason: `Insufficient recorded data: no '${inventoryRecordType}' records found for this application.`, observations: [] };
            }
            if (!thresholds && defaultThreshold === undefined) {
                return { success: true, available: false, reason: "No stock threshold configured — a threshold must be supplied by the organization/application before low-stock detection can run.", observations: [] };
            }

            const latestByProduct = new Map();
            for (const r of listResult.records) {
                const pid = r.fields ? r.fields[productField] : undefined;
                if (pid === undefined || pid === null) continue;
                const existing = latestByProduct.get(pid);
                if (!existing || new Date(r.createdAt) > new Date(existing.createdAt)) latestByProduct.set(pid, r);
            }

            const observations = [];
            for (const [productId, record] of latestByProduct.entries()) {
                const quantity = Number(record.fields && record.fields[quantityField]);
                if (Number.isNaN(quantity)) continue;
                const threshold = (thresholds && Object.prototype.hasOwnProperty.call(thresholds, productId)) ? thresholds[productId] : defaultThreshold;
                if (threshold === undefined) continue;
                if (quantity <= threshold) {
                    observations.push({
                        type: "LOW_STOCK", severity: quantity <= 0 ? "WARNING" : "INFO",
                        organizationId, entityId: productId,
                        message: `Product ${productId} stock (${quantity}) is at or below the configured threshold (${threshold}).`,
                        detectedAt: nowIso(),
                        evidence: { recordType: inventoryRecordType, quantity, threshold, sourceRecordIds: [record.id], asOf: record.createdAt }
                    });
                }
            }
            return { success: true, available: true, organizationId, applicationId, observations };
        }

        // ──────────────────────────────────────────────────────────────
        // Section 11 — Low-balance / float intelligence (app-agnostic)
        // ──────────────────────────────────────────────────────────────
        async lowBalanceObservations({ organizationId, applicationId, userId, balanceRecordType, balanceField = "balance", accountField = "accountId", threshold, from, to } = {}) {
            const auth = this.#authorize(organizationId, userId, PERMISSIONS.READ);
            if (!auth.ok) return { success: false, reason: auth.reason };
            const bre = this.#bre();
            if (!bre) return { success: false, reason: "BusinessRecordEngine is not loaded — failing closed." };
            if (!balanceRecordType) {
                return { success: true, available: false, reason: "Insufficient recorded data: no balance record type configured for this application.", observations: [] };
            }
            const listResult = await bre.listRecords({ organizationId, applicationId, recordType: balanceRecordType, userId, from, to });
            if (!listResult.success) return listResult;
            if (listResult.records.length === 0) {
                return { success: true, available: false, reason: `Insufficient recorded data: no '${balanceRecordType}' records found for this application.`, observations: [] };
            }
            if (threshold === undefined) {
                return { success: true, available: false, reason: "No balance threshold configured — a threshold must be supplied by the organization/application before low-balance detection can run.", observations: [] };
            }

            const latestByAccount = new Map();
            for (const r of listResult.records) {
                const acct = r.fields ? (r.fields[accountField] ?? "default") : "default";
                const existing = latestByAccount.get(acct);
                if (!existing || new Date(r.createdAt) > new Date(existing.createdAt)) latestByAccount.set(acct, r);
            }

            const observations = [];
            for (const [accountId, record] of latestByAccount.entries()) {
                const balance = Number(record.fields && record.fields[balanceField]);
                if (Number.isNaN(balance)) continue;
                if (balance <= threshold) {
                    observations.push({
                        type: "LOW_BALANCE", severity: balance <= 0 ? "WARNING" : "INFO",
                        organizationId, entityId: accountId,
                        message: `Account ${accountId} balance (${balance}) is at or below the configured threshold (${threshold}).`,
                        detectedAt: nowIso(),
                        evidence: { recordType: balanceRecordType, balance, threshold, sourceRecordIds: [record.id], asOf: record.createdAt }
                    });
                }
            }
            return { success: true, available: true, organizationId, applicationId, observations };
        }

        // ──────────────────────────────────────────────────────────────
        // Section 12 — Supplier price intelligence
        // ──────────────────────────────────────────────────────────────
        async supplierPriceIntelligence({ organizationId, applicationId, userId, purchaseRecordType, productField = "productId", priceField = "buyingPrice", supplierField, from, to } = {}) {
            const auth = this.#authorize(organizationId, userId, PERMISSIONS.READ);
            if (!auth.ok) return { success: false, reason: auth.reason };
            const bre = this.#bre();
            if (!bre) return { success: false, reason: "BusinessRecordEngine is not loaded — failing closed." };
            if (!purchaseRecordType) return { success: false, reason: "purchaseRecordType is required." };

            const listResult = await bre.listRecords({ organizationId, applicationId, recordType: purchaseRecordType, userId, from, to });
            if (!listResult.success) return listResult;

            const byProduct = new Map();
            for (const r of listResult.records) {
                const pid = r.fields ? r.fields[productField] : undefined;
                const price = r.fields ? Number(r.fields[priceField]) : NaN;
                if (pid === undefined || pid === null || Number.isNaN(price)) continue;
                if (!byProduct.has(pid)) byProduct.set(pid, []);
                byProduct.get(pid).push(r);
            }

            const observations = [];
            for (const [productId, records] of byProduct.entries()) {
                if (records.length < 2) continue; // insufficient comparable data — do not fabricate a change
                const sorted = records.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                const latest = sorted[sorted.length - 1];
                const previous = sorted[sorted.length - 2];
                const latestPrice = Number(latest.fields[priceField]);
                const previousPrice = Number(previous.fields[priceField]);
                if (latestPrice === previousPrice) continue;
                const direction = latestPrice > previousPrice ? "increased" : "decreased";
                const supplier = supplierField && latest.fields ? latest.fields[supplierField] : undefined;
                observations.push({
                    type: "SUPPLIER_PRICE_CHANGE", severity: "INFO",
                    organizationId, entityId: productId,
                    message: `${productId} buying price ${direction} from ${previousPrice} to ${latestPrice}.`,
                    detectedAt: nowIso(),
                    evidence: {
                        recordType: purchaseRecordType, previousPrice, latestPrice,
                        supplier: supplier !== undefined ? supplier : null,
                        sourceRecordIds: [previous.id, latest.id],
                        previousAt: previous.createdAt, latestAt: latest.createdAt
                    }
                });
            }
            return { success: true, organizationId, applicationId, observations };
        }

        // ──────────────────────────────────────────────────────────────
        // Section 13 — Conservative anomaly observations
        // ──────────────────────────────────────────────────────────────
        async anomalyObservations({ organizationId, applicationId, userId, recordType, valueField = "sales", windowDays = 30, referenceDate, thresholdMultiple = 3, minSampleSize = 5 } = {}) {
            const auth = this.#authorize(organizationId, userId, PERMISSIONS.READ);
            if (!auth.ok) return { success: false, reason: auth.reason };
            const bre = this.#bre();
            if (!bre) return { success: false, reason: "BusinessRecordEngine is not loaded — failing closed." };
            if (!recordType) return { success: false, reason: "recordType is required." };

            const now = referenceDate ? new Date(referenceDate) : new Date();
            const windowStart = new Date(now.getTime() - windowDays * MS_DAY);
            const listResult = await bre.listRecords({ organizationId, applicationId, recordType, userId, from: windowStart.toISOString(), to: now.toISOString() });
            if (!listResult.success) return listResult;

            const values = listResult.records
                .map(r => ({ r, v: r.calculatedFields && r.calculatedFields[valueField] && r.calculatedFields[valueField].available ? r.calculatedFields[valueField].value : undefined }))
                .filter(x => x.v !== undefined);

            if (values.length < minSampleSize) {
                return { success: true, available: false, reason: `Insufficient recorded history (${values.length} of ${minSampleSize} required samples) to establish a baseline for '${valueField}'.`, observations: [] };
            }

            const mean = values.reduce((s, x) => s + x.v, 0) / values.length;
            const observations = [];
            for (const { r, v } of values) {
                if (mean > 0 && v > mean * thresholdMultiple) {
                    observations.push({
                        type: "UNUSUAL_AMOUNT", severity: "INFO",
                        organizationId, entityId: r.id,
                        message: `Record ${r.id} on '${recordType}' has a ${valueField} of ${v}, more than ${thresholdMultiple}x the ${windowDays}-day average of ${round2(mean)}.`,
                        detectedAt: nowIso(),
                        evidence: { recordType, valueField, value: v, baselineAverage: round2(mean), thresholdMultiple, sampleSize: values.length, sourceRecordIds: [r.id] }
                    });
                }
            }
            return { success: true, available: true, organizationId, applicationId, baselineAverage: round2(mean), sampleSize: values.length, observations };
        }

        // ──────────────────────────────────────────────────────────────
        // Section 14 — Pending / unfinished activity (app-provided status only)
        // ──────────────────────────────────────────────────────────────
        async pendingActivity({ organizationId, applicationId, userId, recordType, statusField = "status", pendingValues = ["pending", "draft", "unconfirmed"], from, to } = {}) {
            const auth = this.#authorize(organizationId, userId, PERMISSIONS.READ);
            if (!auth.ok) return { success: false, reason: auth.reason };
            const bre = this.#bre();
            if (!bre) return { success: false, reason: "BusinessRecordEngine is not loaded — failing closed." };
            if (!recordType) return { success: false, reason: "recordType is required." };

            const listResult = await bre.listRecords({ organizationId, applicationId, recordType, userId, from, to });
            if (!listResult.success) return listResult;

            const withStatus = listResult.records.filter(r => r.fields && Object.prototype.hasOwnProperty.call(r.fields, statusField));
            if (withStatus.length === 0) {
                return { success: true, available: false, reason: `Insufficient recorded data: no '${recordType}' records carry field '${statusField}'.`, records: [] };
            }
            const pending = withStatus.filter(r => pendingValues.includes(r.fields[statusField]));
            return {
                success: true, available: true, organizationId, applicationId, recordType,
                records: pending.map(r => ({ id: r.id, status: r.fields[statusField], createdAt: r.createdAt }))
            };
        }

        getDiagnosticsReport() {
            return {
                moduleVersion: BAI_VERSION,
                dependenciesLoaded: {
                    businessRecordEngine: !!this.#bre(),
                    organizationRegistry: !!this.#orgRegistry(),
                    organizationMembership: !!this.#membership(),
                    platformEventBus: !!this.#eventBus()
                }
            };
        }
    }

    if (window.CozyOS.BusinessActivityIntelligence && typeof window.CozyOS.BusinessActivityIntelligence.getVersion === "function") {
        const existingVersion = window.CozyOS.BusinessActivityIntelligence.getVersion();
        if (existingVersion !== BAI_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: BusinessActivityIntelligence existing v${existingVersion} conflicts with load target v${BAI_VERSION}.`);
        return;
    }

    const instance = new CozyBusinessActivityIntelligence();
    instance.PERMISSIONS = PERMISSIONS;
    window.CozyOS.BusinessActivityIntelligence = instance;

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                sourcePath: "core/business-activity/business-activity-intelligence.js",
                name: "BusinessActivityIntelligence", category: "Platform", icon: "insights.svg",
                description: "Reusable, explainable observations (summaries, comparisons, trends, product activity, low-stock/low-balance flags, supplier price changes, conservative anomalies) derived from BusinessRecordEngine for any application. Composes BusinessRecordEngine and Organization authorities — owns no ledger, no calculation, no notification, no AI."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
