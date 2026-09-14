/**
 * CozyOS — Unified Capability Contract
 * File Reference: core/modules/builder/unified-capability-contract.js
 * Phase: Unified Capability Registry + Dependency Graph — Phase 2
 *
 * OWNERSHIP — additive only, no existing file modified
 *   This file does not replace, rewrite, or duplicate any existing
 *   registry. It defines a data CONTRACT (a shape + a small set of pure
 *   functions to build and derive from that shape) and, separately, one
 *   real builder function that composes today's actual live registries
 *   into that shape at call time. Nothing here stores its own competing
 *   copy of registry data — every fact in a built record is read live
 *   from its real source when the builder function runs, never cached
 *   or hand-entered.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO (Phase 2 scope discipline)
 *   - Does NOT build the full dependency graph (core/platform/
 *     dependency-engine.js remains the sole authority for file
 *     dependencies; this file only lets a capability record carry a
 *     POINTER to a dependency-engine path key — it never calls
 *     getDependencies()/getDependents() itself).
 *   - Does NOT implement the self-diagnosis engine ("why isn't CozyAI
 *     fully fluent in Kiswahili" as an answerable live query). It only
 *     makes the data model capable of supporting that later.
 *   - Does NOT audit every dimension of Kiswahili. Only the two
 *     dimensions with real registry evidence found in the Phase 1 audit
 *     (response_generation, vocabulary) are populated from live data;
 *     every other listed dimension is an honest, disclosed placeholder.
 *   - Does NOT introduce a new overall-status vocabulary. See "OVERALL
 *     STATUS" below — it reuses the real, existing evidence taxonomy
 *     already in this repository.
 *
 * WHY THIS DOES NOT FLATTEN EXISTING REGISTRY TAXONOMIES
 *   Phase 1 found the real Kiswahili case: cozy-language-registry.js
 *   reports `state: "AVAILABLE"` (response-template readiness) while
 *   cozy-language-pack-registry.js reports `resourceState: "NOT_READY"`
 *   (vocabulary-content acquisition) for the same language code — two
 *   different, real, honest facts about two different capability axes.
 *   A DimensionRecord below preserves each source's own field name and
 *   raw value UNCHANGED (`sourceStatus.field`, `sourceStatus.rawValue`).
 *   The only thing derived is a small internal `derivationSignal`
 *   ("positive"/"negative"/"unknown") used purely to compute the
 *   OVERALL status — it is stored ALONGSIDE the raw value, never in
 *   place of it, and every mapping used to produce it is an explicit,
 *   inspectable table (DIMENSION_SIGNAL_MAP below), not a hidden rule.
 *
 * OVERALL STATUS — reused, not invented
 *   core/modules/intelligence/knowledge/cozy-knowledge-registry.js
 *   already defines a real, live evidence taxonomy (RP-027 "Fact Safety
 *   Rule"): VERIFIED / PARTIALLY_VERIFIED / NOT_FOUND / NOT_A_CAPABILITY.
 *   This file reuses exactly those four values for a capability's
 *   overall status, rather than inventing VERIFIED/PARTIAL/NOT_VERIFIED/
 *   BLOCKED/ASSUMED from the original prompt's suggested list. One
 *   disclosed extension is made and documented at deriveOverallStatus():
 *   PARTIALLY_VERIFIED is used not only for "some required dimensions
 *   have no evidence" but also for "a required dimension has real,
 *   honest evidence that it is NOT ready" — RP-027's own taxonomy did
 *   not need to distinguish these two cases in its original single-fact
 *   context, but a multidimensional capability record does. This
 *   extension is stated here explicitly, not applied silently.
 *
 * TIMESTAMPS — reused convention, not a new format
 *   core/modules/certification/cozy-certification.js and
 *   core/modules/builder/evidence-engine.js both timestamp records with
 *   `new Date().toISOString()` under the field name `timestamp`. This
 *   file follows the same ISO-8601 convention, under the field name
 *   `observedAt` — deliberately NOT named `verifiedAt`/`lastVerified`,
 *   because neither cozy-language-registry.js nor
 *   cozy-language-pack-registry.js carries any per-record verification
 *   timestamp of its own (confirmed absent by grep this session, see
 *   Phase 1 audit checkpoint). `observedAt` honestly means "when this
 *   contract read the source," not "when the source was last verified."
 *   `sourceVerifiedAt` is carried as an explicit field and is `null`
 *   whenever the source registry doesn't track it — never backfilled.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["unified-capability-contract"]) return;

    const VERSION = "0.1.0-PHASE2";

    // -----------------------------------------------------------------
    // Reused overall-status vocabulary (see header) — not redefined
    // anywhere else; this IS cozy-knowledge-registry.js's own taxonomy.
    // -----------------------------------------------------------------
    const OVERALL_STATUS = Object.freeze({
        VERIFIED: "VERIFIED",
        PARTIALLY_VERIFIED: "PARTIALLY_VERIFIED",
        NOT_FOUND: "NOT_FOUND",
        NOT_A_CAPABILITY: "NOT_A_CAPABILITY"
    });

    // -----------------------------------------------------------------
    // Explicit, inspectable per-source signal maps. Adding a new source
    // means adding a new table entry here — never inferring a mapping
    // at read time. Unmapped raw values degrade to "unknown" with a
    // recorded limitation, never a guessed positive/negative.
    // -----------------------------------------------------------------
    const DIMENSION_SIGNAL_MAP = Object.freeze({
        "cozy-language-registry": Object.freeze({
            field: "state",
            map: Object.freeze({ AVAILABLE: "positive", PARTIAL: "unknown", NOT_READY: "negative" })
        }),
        "cozy-language-pack-registry": Object.freeze({
            field: "resourceState",
            map: Object.freeze({
                NOT_READY: "negative",
                COMMUNITY_BUILDING: "negative",
                REGISTERED: "unknown",
                PARTIAL: "unknown",
                UNREGISTERED: "unknown"
            })
        })
    });

    function classifySignal(registry, rawValue) {
        const entry = DIMENSION_SIGNAL_MAP[registry];
        if (!entry) return { signal: "unknown", limitation: `No DIMENSION_SIGNAL_MAP entry exists for registry "${registry}" — add one before trusting derived status for this source.` };
        const signal = entry.map[rawValue];
        if (!signal) return { signal: "unknown", limitation: `Raw value "${rawValue}" from "${registry}" has no entry in DIMENSION_SIGNAL_MAP — treated as unknown, not guessed.` };
        return { signal, limitation: null };
    }

    // -----------------------------------------------------------------
    // DimensionRecord factory — every field here is either copied
    // verbatim from a real source or explicitly marked as this
    // contract's own derived/observational metadata.
    // -----------------------------------------------------------------
    function makeDimension({ key, required, registry, file, exportedAs, rawValue, hasSource, sourceVerifiedAt, evidenceRef, extraLimitations }) {
        if (typeof key !== "string" || !key.trim()) throw new TypeError("[UnifiedCapabilityContract] makeDimension(): key is required.");
        const limitations = Array.isArray(extraLimitations) ? extraLimitations.slice() : [];
        let signal = "unknown";
        let sourceStatus = null;

        if (hasSource) {
            const mapEntry = DIMENSION_SIGNAL_MAP[registry];
            const field = mapEntry ? mapEntry.field : null;
            const classification = classifySignal(registry, rawValue);
            signal = classification.signal;
            if (classification.limitation) limitations.push(classification.limitation);
            sourceStatus = Object.freeze({ registry, file, exportedAs, field, rawValue });
        } else {
            limitations.push(`No registry in this repository currently reports a status for dimension "${key}" — placeholder only, per Phase 1 audit.`);
        }

        return Object.freeze({
            key,
            required: !!required,
            hasSource: !!hasSource,
            sourceStatus,           // null when hasSource is false — never fabricated
            derivationSignal: signal, // "positive" | "negative" | "unknown" — internal only
            evidenceRef: evidenceRef || null,
            observedAt: new Date().toISOString(),
            sourceVerifiedAt: sourceVerifiedAt === undefined ? null : sourceVerifiedAt,
            limitations: Object.freeze(limitations)
        });
    }

    // -----------------------------------------------------------------
    // deriveOverallStatus — pure function, real trace of reasoning.
    // -----------------------------------------------------------------
    function deriveOverallStatus(dimensions) {
        const required = dimensions.filter((d) => d.required);
        const reasoning = [];

        if (required.length === 0) {
            reasoning.push("No dimension is marked required (or none exist) — nothing to verify against.");
            return Object.freeze({ value: OVERALL_STATUS.NOT_A_CAPABILITY, derivedBy: `unified-capability-contract v${VERSION} deriveOverallStatus()`, reasoning: Object.freeze(reasoning) });
        }

        const withSource = required.filter((d) => d.hasSource);
        if (withSource.length === 0) {
            reasoning.push(`${required.length} required dimension(s) declared, none has a registry source.`);
            return Object.freeze({ value: OVERALL_STATUS.NOT_FOUND, derivedBy: `unified-capability-contract v${VERSION} deriveOverallStatus()`, reasoning: Object.freeze(reasoning) });
        }

        const allPositive = required.every((d) => d.hasSource && d.derivationSignal === "positive");
        if (allPositive) {
            reasoning.push(`All ${required.length} required dimension(s) have a real source reporting a positive signal.`);
            return Object.freeze({ value: OVERALL_STATUS.VERIFIED, derivedBy: `unified-capability-contract v${VERSION} deriveOverallStatus()`, reasoning: Object.freeze(reasoning) });
        }

        for (const d of required) {
            if (!d.hasSource) reasoning.push(`Dimension "${d.key}": no registry source — contributes to a non-VERIFIED overall.`);
            else reasoning.push(`Dimension "${d.key}": source "${d.sourceStatus.registry}" field "${d.sourceStatus.field}" = "${d.sourceStatus.rawValue}" → classified "${d.derivationSignal}".`);
        }
        reasoning.push("Not every required dimension is positive-with-source — see header note on the disclosed PARTIALLY_VERIFIED extension (covers both 'no evidence' and 'evidence of not-ready').");
        return Object.freeze({ value: OVERALL_STATUS.PARTIALLY_VERIFIED, derivedBy: `unified-capability-contract v${VERSION} deriveOverallStatus()`, reasoning: Object.freeze(reasoning) });
    }

    // -----------------------------------------------------------------
    // Conflict detection — distinguishes a true same-dimension conflict
    // from an ordinary cross-dimension difference (the Kiswahili case).
    // -----------------------------------------------------------------
    function detectConflicts(dimensions) {
        const byKey = new Map();
        for (const d of dimensions) {
            if (!byKey.has(d.key)) byKey.set(d.key, []);
            byKey.get(d.key).push(d);
        }
        const findings = [];
        for (const [key, group] of byKey) {
            const signals = new Set(group.filter((d) => d.hasSource).map((d) => d.derivationSignal));
            if (signals.size > 1) {
                findings.push({ type: "CONFLICT", key, detail: `Dimension "${key}" has disagreeing sources: ${group.map((d) => `${d.sourceStatus.registry}=${d.sourceStatus.rawValue}`).join(", ")}.` });
            }
        }
        const distinctKeysWithSource = dimensions.filter((d) => d.hasSource).map((d) => d.key);
        if (new Set(distinctKeysWithSource).size > 1) {
            findings.push({ type: "DIMENSION_DIFFERENCE", detail: `Multiple distinct dimensions each carry their own real status (${Array.from(new Set(distinctKeysWithSource)).join(", ")}) — this is expected multidimensionality, not a conflict.` });
        }
        return findings;
    }

    // -----------------------------------------------------------------
    // CapabilityRecord factory
    // -----------------------------------------------------------------
    function createCapabilityRecord({ id, name, description, dimensions, integrationPoints, dependencyRefs, provenance }) {
        if (typeof id !== "string" || !id.trim()) throw new TypeError("[UnifiedCapabilityContract] createCapabilityRecord(): id is required.");
        if (!Array.isArray(dimensions) || dimensions.length === 0) throw new TypeError("[UnifiedCapabilityContract] createCapabilityRecord(): at least one dimension is required.");

        const overallStatus = deriveOverallStatus(dimensions);
        const conflicts = detectConflicts(dimensions);

        return Object.freeze({
            id,
            name: name || id,
            description: description || null,
            dimensions: Object.freeze(dimensions.slice()),
            overallStatus,
            conflicts: Object.freeze(conflicts),
            integrationPoints: Object.freeze((integrationPoints || []).slice()),
            dependencyRefs: Object.freeze((dependencyRefs || []).slice()), // pointers only — see header
            provenance: Object.freeze((provenance || []).slice()),
            contractVersion: VERSION
        });
    }

    // -----------------------------------------------------------------
    // buildKiswahiliValidationRecord() — the Phase 2 "first real
    // design-validation case" required by spec. Reads the two live
    // registries at call time; nothing here is cached or hardcoded.
    // Explicitly NOT a Kiswahili audit (only 2 of 10 illustrative
    // dimensions have real sources; the rest are honest placeholders).
    // -----------------------------------------------------------------
    function buildKiswahiliValidationRecord() {
        const languageRegistry = window.CozyOS.CozyLanguageRegistry;
        const packRegistry = window.CozyOS.CozyLanguagePacks;

        const provenance = [];
        let responseGenDim;
        if (languageRegistry && typeof languageRegistry.getLanguage === "function") {
            const lang = languageRegistry.getLanguage("sw");
            provenance.push({ registry: "cozy-language-registry", file: "core/modules/intelligence/language/cozy-language-registry.js", exportedAs: "window.CozyOS.CozyLanguageRegistry", retrievedVia: "getLanguage('sw')" });
            responseGenDim = makeDimension({
                key: "response_generation", required: true,
                registry: "cozy-language-registry", file: "core/modules/intelligence/language/cozy-language-registry.js", exportedAs: "window.CozyOS.CozyLanguageRegistry",
                rawValue: lang ? lang.state : null, hasSource: !!lang,
                evidenceRef: { note: "Re-verified by cozy-language-registry.test.js per this file's own header — not re-executed by this call." }
            });
        } else {
            responseGenDim = makeDimension({ key: "response_generation", required: true, hasSource: false, extraLimitations: ["window.CozyOS.CozyLanguageRegistry is not loaded in this runtime."] });
        }

        let vocabDim;
        if (packRegistry && typeof packRegistry.getPack === "function") {
            const pack = packRegistry.getPack("sw");
            provenance.push({ registry: "cozy-language-pack-registry", file: "core/modules/intelligence/language-packs/cozy-language-pack-registry.js", exportedAs: "window.CozyOS.CozyLanguagePacks", retrievedVia: "getPack('sw')" });
            vocabDim = makeDimension({
                key: "vocabulary", required: true,
                registry: "cozy-language-pack-registry", file: "core/modules/intelligence/language-packs/cozy-language-pack-registry.js", exportedAs: "window.CozyOS.CozyLanguagePacks",
                rawValue: pack ? pack.resourceState : null, hasSource: !!pack
            });
        } else {
            vocabDim = makeDimension({ key: "vocabulary", required: true, hasSource: false, extraLimitations: ["window.CozyOS.CozyLanguagePacks is not loaded in this runtime."] });
        }

        // Placeholder dimensions — no registry in this repository reports
        // these for any language (confirmed absent, Phase 1 audit). Not
        // required, so they cannot by themselves drag overall status down,
        // and they are not silently omitted either.
        const placeholderKeys = ["grammar", "morphology", "stt", "nlu", "translation", "tts", "conversation", "contextual_understanding"];
        const placeholders = placeholderKeys.map((key) => makeDimension({ key, required: false, hasSource: false }));

        return createCapabilityRecord({
            id: "language:sw",
            name: "Kiswahili",
            description: "Phase 2 design-validation record — not a full Kiswahili audit. See AA-007 (docs/builder/knowledge/architecture-ambiguity-registry.md) for the finding this record was built to represent correctly.",
            dimensions: [responseGenDim, vocabDim, ...placeholders],
            integrationPoints: [
                { type: "provider", ref: "core/modules/intelligence/providers/rule-based-conversational-provider.js" },
                { type: "engine", ref: "core/modules/intelligence/language-packs/cozy-language-acquisition-pipeline.js" }
            ],
            dependencyRefs: [
                { engine: "core/platform/dependency-engine.js", note: "Pointer only — this contract does not call DependencyEngine.getDependencies()/getDependents() itself. See Phase 4 (not this phase)." }
            ],
            provenance
        });
    }

    const api = Object.freeze({
        getVersion() { return VERSION; },
        OVERALL_STATUS,
        DIMENSION_SIGNAL_MAP,
        makeDimension,
        deriveOverallStatus,
        detectConflicts,
        createCapabilityRecord,
        buildKiswahiliValidationRecord
    });

    window.CozyOS.UnifiedCapabilityContract = api;
    window.CozyOS.Modules["unified-capability-contract"] = Object.freeze({
        version: VERSION,
        description: "Phase 2 — additive, read-only unified capability data contract. Preserves source-native, multidimensional status; reuses cozy-knowledge-registry.js's real VERIFIED/PARTIALLY_VERIFIED/NOT_FOUND/NOT_A_CAPABILITY taxonomy for overall status rather than inventing a new one. Does not build the dependency graph or self-diagnosis engine (later phases)."
    });

    // Self-registration only — descriptive metadata, never execution.
    // Guarded exactly like every other module in this repository.
    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "UnifiedCapabilityContract",
                version: VERSION,
                category: "Builder",
                description: "Phase 2 unified capability data contract (read-only view over existing registries).",
                sourcePath: "core/modules/builder/unified-capability-contract.js"
            });
        } catch (_e) { /* registration is best-effort, never load-bearing */ }
    }
})();
