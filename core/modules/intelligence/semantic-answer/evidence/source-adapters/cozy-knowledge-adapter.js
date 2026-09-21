/**
 * CozyAI — CozyKnowledge Evidence Adapter (SA-2)
 * File Reference: core/modules/intelligence/semantic-answer/evidence/source-adapters/cozy-knowledge-adapter.js
 *
 * WHAT THIS IS
 *   Converts real, existing window.CozyOS.CozyKnowledge facts —
 *   including APPLICATION_HUMAN_PURPOSE_DATA via the real, public
 *   getApplicationHumanPurposeFact(name, lang) — into normalized
 *   cozy.verified-evidence.v1 records (VerifiedEvidenceContract).
 *   Read-only: never calls a CozyKnowledge mutator (none exist — this
 *   registry is itself read-only, static, committed data — see its own
 *   file header) and never rewrites/normalizes the source data itself.
 *
 * THE ONE RULE THIS FILE MUST NEVER BREAK (per explicit project
 * direction — do not lose this)
 *   A committed, per-language substance field (English text paired with
 *   its real Kiswahili sibling) is EVIDENCE — real, verified linguistic
 *   material this adapter may cite — never a pre-selected FINAL ANSWER
 *   chosen by goal+language. This file has NO knowledge of
 *   "goal" at all (it is never passed one, and never asked to resolve
 *   one) and NEVER returns a single string as "the answer" — every
 *   public method here returns an ARRAY of granular VerifiedEvidence
 *   records (one per real fact/array-item), for a future planner (SA-3)
 *   to select from and a future realizer (SA-4) to construct a sentence
 *   from. There is no per-language conditional return of a fixed
 *   string anywhere in this file, and there never should be — a
 *   source-code test in this file's own test suite checks for exactly
 *   that shape of regression.
 *
 * VERIFICATION STATUS — NOT INFLATED
 *   `currentVerifiedCapabilities`/`humanPurpose`/`realLifeProblems`/
 *   `whoBenefits`/`humanBenefits` map to VERIFIED (real, tested current
 *   capability/fact, per cozy-knowledge-registry.js's own header).
 *   `visionCapabilities` is explicitly, honestly DIFFERENT — that
 *   file's own header states "visionCapabilities are explicitly
 *   labeled and must NEVER be read as already implemented". This
 *   adapter therefore maps `visionCapabilities` claims to
 *   verification.status "UNVERIFIED" (never VERIFIED), confidence
 *   "LOW", with the source record's own real `visionSourceNote` carried
 *   through as `provenance` so a consumer can see exactly why.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-sa2";
    if (window.CozyOS.Modules["cozy-knowledge-evidence-adapter"]) return;

    const SOURCE_TYPE = Object.freeze({
        APPLICATION_HUMAN_PURPOSE: "APPLICATION_HUMAN_PURPOSE",
        APPLICATION_KNOWLEDGE: "APPLICATION_KNOWLEDGE",
        SYSTEM_FACT: "SYSTEM_FACT",
    });

    // The real SUBSTANCE_FIELDS this adapter expects on a resolved
    // purpose object (cozy-knowledge-registry.js's own private
    // SUBSTANCE_FIELDS constant, mirrored here only as the caller-side
    // contract with getApplicationHumanPurposeFact()'s real, public
    // return shape — never a second copy of the underlying DATA, only
    // of the field-name list needed to iterate it).
    const STRING_FIELDS = Object.freeze(["humanPurpose"]);
    const ARRAY_FIELDS = Object.freeze(["realLifeProblems", "whoBenefits", "humanBenefits", "currentVerifiedCapabilities"]);
    const VISION_ARRAY_FIELD = "visionCapabilities";

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

    /** Extracts the real canonical application id CozyKnowledge itself resolved to, from getApplicationHumanPurposeFact()'s own real `source` string ("core/plugins/<id>-core.js ..."), rather than re-deriving normalization logic of its own. */
    function extractCanonicalId(sourceString, fallbackName) {
        const match = typeof sourceString === "string" ? sourceString.match(/core\/plugins\/([a-z0-9]+)-core\.js/) : null;
        return match ? match[1] : String(fallbackName || "").trim().toLowerCase();
    }

    // PHASE 4 — Universal Language Capability. Generalizes the previous
    // `lang === "sw" ? "Sw" : ""` suffix builder (this is an internal
    // audit-trail `path` annotation, never user-facing text, so it is
    // generalized here rather than migrated to the language-realization
    // seam — see cozy-knowledge-registry.js's own matching `_langSuffix()`
    // helper, which this mirrors for the exact same
    // `<field>`/`<field>Sw`/`<field><Lang>` data shape it reads from.
    function _langSuffix(lang) {
        if (!lang || lang === "en") return "";
        const normalized = String(lang).trim().toLowerCase();
        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }

    function buildEvidence({ canonicalId, field, index, text, lang, status, confidence, provenance, evidenceContract }) {
        const idParts = ["application-human-purpose", canonicalId, field, lang];
        if (index !== undefined && index !== null) idParts.splice(3, 0, String(index));
        const id = idParts.join(":");
        const fields = {
            id,
            claim: text,
            source: Object.freeze({ type: SOURCE_TYPE.APPLICATION_HUMAN_PURPOSE, id: canonicalId, path: `APPLICATION_HUMAN_PURPOSE_DATA.${canonicalId}.${field}${_langSuffix(lang)}` }),
            verification: Object.freeze({ status, confidence }),
            sensitivity: "PUBLIC",
            language: lang,
            entityId: canonicalId,
            provenance,
        };
        if (evidenceContract && typeof evidenceContract.create === "function") {
            const result = evidenceContract.create(fields);
            return result.success ? result.evidence : null;
        }
        // Soft-dependency degrade (VerifiedEvidenceContract not loaded):
        // still returns a real, shape-correct record — schemaVersion is
        // simply the raw literal this contract uses, since create()
        // itself isn't available to fill it.
        return Object.assign({ schemaVersion: "cozy.verified-evidence.v1" }, fields);
    }

    /**
     * adaptApplicationHumanPurpose(applicationName, {languages, accessContext})
     *   Real. For each requested language, calls the REAL, public
     *   CozyKnowledge.getApplicationHumanPurposeFact(applicationName, lang)
     *   and turns its resolved purpose object into one VerifiedEvidence
     *   record per real fact (one per array item for array fields, one
     *   for the humanPurpose string) — never a single joined answer.
     *   A language with no real evidence (getApplicationHumanPurposeFact()
     *   itself reports non-VERIFIED — e.g. no real Kiswahili payload yet
     *   for this application) is honestly skipped, never fabricated.
     */
    function adaptApplicationHumanPurpose(applicationName, { languages = ["en", "sw"], accessContext: _accessContext } = {}) {
        const knowledge = window.CozyOS.CozyKnowledge;
        const evidenceContract = window.CozyOS.VerifiedEvidenceContract;
        if (!knowledge || typeof knowledge.getApplicationHumanPurposeFact !== "function") {
            return { success: false, evidence: [], errors: ["window.CozyOS.CozyKnowledge is not loaded."] };
        }
        if (!isNonEmptyString(applicationName)) return { success: false, evidence: [], errors: ["A real, non-empty applicationName is required."] };

        const evidence = [];
        const errors = [];
        for (const lang of languages) {
            const result = knowledge.getApplicationHumanPurposeFact(applicationName, lang);
            if (result.evidence !== "VERIFIED" || !result.purpose) {
                errors.push(`No real, VERIFIED human-purpose evidence for "${applicationName}" in language "${lang}" (reason: ${result.reason || result.evidence}).`);
                continue;
            }
            const canonicalId = extractCanonicalId(result.source, applicationName);
            const purpose = result.purpose;

            for (const field of STRING_FIELDS) {
                if (isNonEmptyString(purpose[field])) {
                    const rec = buildEvidence({ canonicalId, field, text: purpose[field], lang, status: "VERIFIED", confidence: "HIGH", provenance: result.source, evidenceContract });
                    if (rec) evidence.push(rec);
                }
            }
            for (const field of ARRAY_FIELDS) {
                if (Array.isArray(purpose[field])) {
                    purpose[field].forEach((text, index) => {
                        if (!isNonEmptyString(text)) return;
                        const rec = buildEvidence({ canonicalId, field, index, text, lang, status: "VERIFIED", confidence: "HIGH", provenance: result.source, evidenceContract });
                        if (rec) evidence.push(rec);
                    });
                }
            }
            // visionCapabilities — explicitly NOT current capability (see
            // this file's own header). Never VERIFIED.
            if (Array.isArray(purpose[VISION_ARRAY_FIELD])) {
                purpose[VISION_ARRAY_FIELD].forEach((text, index) => {
                    if (!isNonEmptyString(text)) return;
                    const rec = buildEvidence({
                        canonicalId, field: VISION_ARRAY_FIELD, index, text, lang,
                        status: "UNVERIFIED", confidence: "LOW",
                        provenance: purpose.visionSourceNote || result.source,
                        evidenceContract,
                    });
                    if (rec) evidence.push(rec);
                });
            }
        }
        return { success: evidence.length > 0, evidence, errors };
    }

    /**
     * adaptApplicationKnowledge(applicationName)
     *   Real. Composes CozyKnowledge.getApplicationFact(name) — the
     *   generic (non-human-purpose) real application registration fact
     *   (name/category/enabled/version — see that getter's own header
     *   for why nothing more sensitive is ever exposed).
     */
    function adaptApplicationKnowledge(applicationName) {
        const knowledge = window.CozyOS.CozyKnowledge;
        const evidenceContract = window.CozyOS.VerifiedEvidenceContract;
        if (!knowledge || typeof knowledge.getApplicationFact !== "function") {
            return { success: false, evidence: [], errors: ["window.CozyOS.CozyKnowledge is not loaded, or getApplicationFact() is unavailable."] };
        }
        if (!isNonEmptyString(applicationName)) return { success: false, evidence: [], errors: ["A real, non-empty applicationName is required."] };

        const result = knowledge.getApplicationFact(applicationName);
        if (result.evidence !== "VERIFIED") return { success: false, evidence: [], errors: [`No real, VERIFIED application-knowledge fact for "${applicationName}".`] };

        const claimText = isNonEmptyString(result.answer) ? result.answer : JSON.stringify(result.application || result);
        const fields = {
            id: `application-knowledge:${applicationName.trim().toLowerCase()}`,
            claim: claimText,
            source: Object.freeze({ type: SOURCE_TYPE.APPLICATION_KNOWLEDGE, id: applicationName.trim().toLowerCase() }),
            verification: Object.freeze({ status: "VERIFIED", confidence: "HIGH" }),
            sensitivity: "PUBLIC",
            entityId: applicationName.trim().toLowerCase(),
            provenance: result.source || "window.CozyOS.CozyKnowledge",
        };
        const built = evidenceContract && typeof evidenceContract.create === "function" ? evidenceContract.create(fields) : { success: true, evidence: Object.assign({ schemaVersion: "cozy.verified-evidence.v1" }, fields) };
        return built.success ? { success: true, evidence: [built.evidence], errors: [] } : { success: false, evidence: [], errors: built.errors };
    }

    /**
     * adaptSystemFact(getterName, args)
     *   Real, generic composition of CozyKnowledge's platform-level
     *   (not per-application) getters — e.g. "getFounderFact",
     *   "getVisionFact", "getWhyUseCozyOSFact", "listApplicationsFact".
     *   Only ever calls a REAL method that already exists on
     *   window.CozyOS.CozyKnowledge; an unrecognized getterName fails
     *   closed with a real error, never a silent no-op.
     */
    function adaptSystemFact(getterName, args = []) {
        const knowledge = window.CozyOS.CozyKnowledge;
        const evidenceContract = window.CozyOS.VerifiedEvidenceContract;
        if (!knowledge || typeof knowledge[getterName] !== "function") {
            return { success: false, evidence: [], errors: [`window.CozyOS.CozyKnowledge.${getterName} is not a real, available getter.`] };
        }
        const result = knowledge[getterName](...args);
        if (!result || result.evidence !== "VERIFIED") return { success: false, evidence: [], errors: [`No real, VERIFIED evidence from CozyKnowledge.${getterName}(${args.join(", ")}).`] };

        const texts = [];
        if (isNonEmptyString(result.answer)) texts.push(result.answer);
        for (const key of ["applications", "entries", "names", "records"]) {
            if (Array.isArray(result[key])) {
                for (const item of result[key]) { if (isNonEmptyString(item)) texts.push(item); else if (item != null) texts.push(JSON.stringify(item)); }
            }
        }
        if (texts.length === 0) return { success: false, evidence: [], errors: [`CozyKnowledge.${getterName} reported VERIFIED but carried no real, non-empty text to adapt.`] };

        const evidence = texts.map((text, index) => {
            const fields = {
                id: `system-fact:${getterName}:${index}`,
                claim: text,
                source: Object.freeze({ type: SOURCE_TYPE.SYSTEM_FACT, id: getterName }),
                verification: Object.freeze({ status: "VERIFIED", confidence: "HIGH" }),
                sensitivity: "PUBLIC",
                provenance: result.source || "window.CozyOS.CozyKnowledge",
            };
            const built = evidenceContract && typeof evidenceContract.create === "function" ? evidenceContract.create(fields) : { success: true, evidence: Object.assign({ schemaVersion: "cozy.verified-evidence.v1" }, fields) };
            return built.success ? built.evidence : null;
        }).filter(Boolean);

        return { success: evidence.length > 0, evidence, errors: [] };
    }

    const CozyKnowledgeEvidenceAdapter = Object.freeze({
        SOURCE_TYPE, adaptApplicationHumanPurpose, adaptApplicationKnowledge, adaptSystemFact,
        getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.CozyKnowledgeEvidenceAdapter = CozyKnowledgeEvidenceAdapter;
    window.CozyOS.Modules["cozy-knowledge-evidence-adapter"] = Object.freeze({
        version: MODULE_VERSION,
        description: "SA-2 — CozyKnowledge Evidence Adapter. Converts CozyKnowledge/APPLICATION_HUMAN_PURPOSE_DATA facts into granular VerifiedEvidence records, never a pre-selected final answer. Read-only; never mutates CozyKnowledge."
    });
})();
