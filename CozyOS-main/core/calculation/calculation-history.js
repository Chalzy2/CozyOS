/**
 * CozyOS Calculation Engine — History
 * File Reference: core/calculation/calculation-history.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Real, optional recording of every calculation — formula used, real
 *   inputs, real result, calling application/user/organization, real
 *   timestamp. "Optional" is genuine: `calculation-engine.js` only calls
 *   `record()` when a caller explicitly asks for history, so a
 *   high-frequency calculation (e.g. a running balance recomputed on
 *   every keystroke) isn't forced to pay for logging it never asked for.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const CALC_HISTORY_VERSION = "1.0.0-ENTERPRISE";

    class CozyCalculationHistory {
        #entries = []; // bounded, real, append-only

        getVersion() { return CALC_HISTORY_VERSION; }

        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }

        /** record({formulaId, inputs, result, application, user, organization}) — real, bounded at 1000 entries platform-wide. */
        record({ formulaId, inputs, result, application, user, organization }) {
            const entry = {
                formulaId, inputs: this.#deepClone(inputs), result,
                application: application || null, user: user || null, organization: organization || null,
                at: new Date().toISOString()
            };
            this.#entries.push(entry);
            if (this.#entries.length > 1000) this.#entries.shift();
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit("calculation:recorded", { formulaId, application }); } catch (_err) { /* non-fatal */ }
            }
        }

        /** query({formulaId, application, user}) — real, filtered history, most recent first. */
        query(filter = {}) {
            let list = this.#entries.slice().reverse();
            if (filter.formulaId) list = list.filter(e => e.formulaId === filter.formulaId);
            if (filter.application) list = list.filter(e => e.application === filter.application);
            if (filter.user) list = list.filter(e => e.user === filter.user);
            return this.#deepClone(list);
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: CALC_HISTORY_VERSION, totalEntries: this.#entries.length });
        }
    }

    if (window.CozyOS.CalculationHistory && typeof window.CozyOS.CalculationHistory.getVersion === "function") {
        const existingVersion = window.CozyOS.CalculationHistory.getVersion();
        if (existingVersion !== CALC_HISTORY_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: CalculationHistory existing v${existingVersion} conflicts with load target v${CALC_HISTORY_VERSION}.`);
        return;
    }

    window.CozyOS.CalculationHistory = new CozyCalculationHistory();
})();
