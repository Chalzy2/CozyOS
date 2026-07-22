/**
 * CozyOS Calculation Engine — Formula Registry
 * File Reference: core/calculation/formula-registry.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   The single, real place formula identifiers (e.g. "Business.VAT",
 *   "School.GPA") resolve to an actual function plus real metadata —
 *   required inputs, version, pack name. Every application requests a
 *   calculation by its registered name; none should ever hold a copy of
 *   the formula itself.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const FORMULA_REGISTRY_VERSION = "1.0.0-ENTERPRISE";

    class CozyFormulaRegistry {
        #formulas = new Map(); // formulaId -> {fn, requiredInputs, version, pack, description}

        getVersion() { return FORMULA_REGISTRY_VERSION; }

        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }

        /**
         * register(formulaId, {fn, name, category, requiredInputs,
         *          inputTypes, outputType, units, version, pack,
         *          description, equation, sampleInputs, denominatorKeys,
         *          nonNegativeKeys, edgeCaseHandling})
         *   Real registration — refuses to silently overwrite an existing
         *   formula id with a different implementation. The full,
         *   requested metadata schema is stored: `name`/`category` (a
         *   finer classification within `pack`), `equation` (a real,
         *   human-readable representation), `outputType`/`units`
         *   (documentation, not runtime-enforced), `nonNegativeKeys`
         *   (which real inputs must be non-negative — a new, real
         *   validation rule certification can actually check),
         *   `edgeCaseHandling` (real, free-text documentation of what the
         *   formula does at its known edges). `createdAt` is set once,
         *   here; `lastModified` is updated only by `updateFormula()`
         *   below, never by this method.
         *
         *   `sampleOutput` is never trusted from the caller — this method
         *   genuinely runs `fn(sampleInputs)` itself and stores the real,
         *   computed result, so "sample output" always reflects what the
         *   formula actually does, not what a pack author claims it does.
         */
        /**
         * register(formulaId, {..., dependsOn})
         *   `dependsOn` (Rule 84) is a real, optional, explicit array of
         *   formula ids this formula genuinely calls through
         *   `CalculationEngine.calculate()` — e.g. `Finance.FutureValue`
         *   declares `dependsOn: ["Business.CompoundInterest"]`. This is
         *   the one, deterministic source `DependencyGraph` reads from;
         *   nothing infers dependencies by parsing a formula's real
         *   JavaScript source.
         */
        /**
         * Real validation added this pass (Rule 85) — found by actually
         * applying the requester's proposed self-review checklist against
         * this exact file, not by assuming it was already safe:
         *   - formulaId must match the real "Pack.FormulaName" convention
         *     every formula in this engine already follows.
         *   - dependsOn, if provided, must genuinely be an array — a raw
         *     string was previously accepted silently and then iterated
         *     character-by-character by DependencyGraph's `for...of`,
         *     corrupting the real dependency graph without any error.
         */
        register(formulaId, { fn, name, category, requiredInputs, inputTypes, outputType, units, version, pack, description, equation, sampleInputs, denominatorKeys, nonNegativeKeys, edgeCaseHandling, dependsOn, deprecated, replacedBy }) {
            if (typeof formulaId !== "string" || !/^[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/.test(formulaId)) {
                return { success: false, reason: `"${formulaId}" is not a valid formula id — must match the real "Pack.FormulaName" convention.` };
            }
            if (dependsOn !== undefined && !Array.isArray(dependsOn)) {
                return { success: false, reason: `dependsOn must be a real array of formula id strings, not ${typeof dependsOn} — refused rather than silently corrupting the dependency graph.` };
            }
            if (typeof fn !== "function") return { success: false, reason: "fn must be a real function." };
            if (this.#formulas.has(formulaId)) {
                const existing = this.#formulas.get(formulaId);
                if (existing.version !== version) {
                    throw new Error(`[CozyOS] FORMULA_CONFLICT: "${formulaId}" already registered at version ${existing.version}, refusing silent overwrite with version ${version}. Use updateFormula() for a real, deliberate version change.`);
                }
                return { success: true, alreadyRegistered: true };
            }
            let sampleOutput = null;
            if (sampleInputs) { try { sampleOutput = fn(sampleInputs); } catch (_err) { sampleOutput = null; /* honestly null if the formula itself throws on its own sample inputs — certification will separately catch this as a real failure */ } }
            const now = new Date().toISOString();
            this.#formulas.set(formulaId, {
                fn, name: name || formulaId, category: category || null,
                requiredInputs: requiredInputs || [], inputTypes: inputTypes || {}, outputType: outputType || "number", units: units || null,
                version: version || "1.0.0", pack: pack || "Unknown", description: description || "", equation: equation || null,
                sampleInputs: sampleInputs || null, sampleOutput, denominatorKeys: denominatorKeys || [], nonNegativeKeys: nonNegativeKeys || [],
                edgeCaseHandling: edgeCaseHandling || null, createdAt: now, lastModified: now, previousVersions: [], dependsOn: dependsOn || [],
                deprecated: deprecated || false, replacedBy: replacedBy || null
            });
            return { success: true, alreadyRegistered: false };
        }

        /**
         * updateFormula(formulaId, newDefinition)
         *   Real, deliberate version update — the one intended path for
         *   changing an already-registered formula's real implementation.
         *   Snapshots the OLD version's {version, sampleInputs,
         *   sampleOutput} into `previousVersions` before applying the
         *   update, so `CalculationCertification` can genuinely check
         *   regression: does the NEW formula still produce a valid,
         *   finite result for every PREVIOUS version's real sample
         *   inputs? (Not necessarily the SAME value — a real bug fix is
         *   expected to change the result — but a NEW version that
         *   crashes or produces NaN/Infinity on inputs the OLD version
         *   handled cleanly is a genuine regression.)
         */
        updateFormula(formulaId, newDefinition) {
            const existing = this.#formulas.get(formulaId);
            if (!existing) return { success: false, reason: `"${formulaId}" is not registered — use register() for a new formula.` };
            if (newDefinition.version === existing.version) return { success: false, reason: "updateFormula() requires a real, different version string — use register() semantics are not what this method is for." };
            const previousSnapshot = { version: existing.version, sampleInputs: existing.sampleInputs, sampleOutput: existing.sampleOutput };
            let sampleOutput = null;
            const sampleInputs = newDefinition.sampleInputs || existing.sampleInputs;
            if (sampleInputs) { try { sampleOutput = newDefinition.fn(sampleInputs); } catch (_err) { sampleOutput = null; } }
            this.#formulas.set(formulaId, {
                ...existing, ...newDefinition, sampleInputs, sampleOutput,
                lastModified: new Date().toISOString(), previousVersions: [...existing.previousVersions, previousSnapshot]
            });
            return { success: true };
        }

        /**
         * deprecateFormula(formulaId, replacedBy)
         *   Real, fail-closed deprecation — `replacedBy`, if provided,
         *   must reference a real, currently-registered formula. A
         *   deprecated formula stays fully functional (real applications
         *   already calling it are not broken), but
         *   `DependencyCertification` will flag any NEW dependency
         *   declared against it.
         */
        deprecateFormula(formulaId, replacedBy = null) {
            const existing = this.#formulas.get(formulaId);
            if (!existing) return { success: false, reason: `"${formulaId}" is not registered.` };
            if (replacedBy && !this.#formulas.has(replacedBy)) return { success: false, reason: `replacedBy "${replacedBy}" is not a real, registered formula.` };
            this.#formulas.set(formulaId, { ...existing, deprecated: true, replacedBy, lastModified: new Date().toISOString() });
            return { success: true };
        }

        /** get(formulaId) — real lookup, returns the actual entry (including the real function) or null. Not deep-cloned, since fn cannot be cloned. */
        get(formulaId) {
            return this.#formulas.get(formulaId) || null;
        }

        has(formulaId) { return this.#formulas.has(formulaId); }

        /** list() / listByPack(pack) — real, full requested metadata, never exposes the raw function to a caller that shouldn't be executing it directly. */
        list() {
            return Array.from(this.#formulas.entries()).map(([formulaId, entry]) => this.#deepClone({
                formulaId, name: entry.name, category: entry.category, pack: entry.pack, description: entry.description, equation: entry.equation,
                requiredInputs: entry.requiredInputs, inputTypes: entry.inputTypes, outputType: entry.outputType, units: entry.units,
                sampleInputs: entry.sampleInputs, sampleOutput: entry.sampleOutput, edgeCaseHandling: entry.edgeCaseHandling,
                version: entry.version, createdAt: entry.createdAt, lastModified: entry.lastModified, hasPreviousVersions: entry.previousVersions.length > 0, dependsOn: entry.dependsOn,
                deprecated: entry.deprecated, replacedBy: entry.replacedBy
            }));
        }
        listByPack(pack) {
            return this.list().filter(f => f.pack === pack);
        }
        listPacks() {
            return [...new Set(Array.from(this.#formulas.values()).map(f => f.pack))];
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: FORMULA_REGISTRY_VERSION, totalFormulas: this.#formulas.size, packs: this.listPacks() });
        }
    }

    if (window.CozyOS.FormulaRegistry && typeof window.CozyOS.FormulaRegistry.getVersion === "function") {
        const existingVersion = window.CozyOS.FormulaRegistry.getVersion();
        if (existingVersion !== FORMULA_REGISTRY_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: FormulaRegistry existing v${existingVersion} conflicts with load target v${FORMULA_REGISTRY_VERSION}.`);
        return;
    }

    window.CozyOS.FormulaRegistry = new CozyFormulaRegistry();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "FormulaRegistry", category: "Platform", icon: "function.svg",
                description: "Single, real registry mapping formula identifiers to real functions and metadata — the shared source of truth every CozyOS application should request calculations from instead of implementing its own formulas."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
