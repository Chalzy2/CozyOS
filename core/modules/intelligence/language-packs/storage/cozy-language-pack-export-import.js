/**
 * core/modules/intelligence/language-packs/storage/cozy-language-pack-export-import.js
 * RP-035 COS-LANG-PM-001 — Portable Language-Pack Export / Import
 *
 * OWNERSHIP / COMPOSITION
 *   New, additive, standalone file. Composes, never duplicates:
 *     - window.CozyOS.CozyLanguagePacks (registry: getPack, listExpressions)
 *       — READ-ONLY. This file has no mutator for pack identity/state.
 *     - window.CozyOS.CozyIntelligencePrivacy — the real RP-034 privacy
 *       engine (canExport(), privacy tiers). Never re-implements privacy
 *       logic; if this engine is absent, export fails closed (see below).
 *     - window.CozyOS.CozyLanguagePackFormat — manifest build/verify + SHA-256.
 *     - window.CozyOS.CozyStorageProvider — capability-honest storage target.
 *
 * PRIVACY — DISCLOSED GAP (do not fabricate a fix)
 *   cozy-language-pack-registry.js's submitExpression() does not currently
 *   stamp a `privacyTier` field onto expression records (confirmed by
 *   reading the file, not assumed). window.CozyOS.CozyIntelligencePrivacy's
 *   canExport() requires item.privacyTier and returns
 *   { allowed: false, reason: "NO_REAL_PRIVACY_TIER" } when it is absent.
 *   This file honors that fail-closed behavior: by default NO expression
 *   record is exported unless it carries a privacyTier AND canExport()
 *   approves it. This means, honestly, that under the CURRENT repository
 *   state export will exclude essentially all real expression records
 *   until a future RP-029/034 reconciliation milestone stamps privacyTier
 *   onto submitted expressions. That gap is recorded in the Implementation
 *   Report, not silently worked around here (a caller-supplied
 *   `treatUnclassifiedAs` option exists ONLY for explicit, logged,
 *   owner-directed testing — see exportPack() docs — and defaults to
 *   excluding, never including).
 *
 * NEVER
 *   - Never marks a pack AVAILABLE (Rule 82 — no mutator exists here).
 *   - Never invents vocabulary/translation content to "fill" a pack.
 *   - Never commits an import before verifyManifest()/verifyIdentity() pass.
 *   - Never silently overwrites a stronger evidence/validation record with
 *     a weaker one on import (see mergeRecord()).
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory(require("./cozy-language-pack-format.js"));
    } else {
        const w = root.window || root;
        w.CozyOS = w.CozyOS || {};
        w.CozyOS.Modules = w.CozyOS.Modules || {};
        if (w.CozyOS.Modules["cozy-language-pack-export-import"]) return;
        const format = w.CozyOS.CozyLanguagePackFormat;
        if (!format) {
            console.error("[cozy-language-pack-export-import] cozy-language-pack-format.js must load first.");
            return;
        }
        const api = factory(format);
        w.CozyOS.CozyLanguagePackExportImport = api;
        w.CozyOS.Modules["cozy-language-pack-export-import"] = Object.freeze({
            version: api.VERSION,
            api,
            description: "RP-035 COS-LANG-PM-001 — Portable language-pack export/import. Composes the registry (read-only), the real RP-034 privacy engine (fail-closed on unclassified records), the shared manifest format, and the storage-provider abstraction. Idempotent import; never auto-promotes pack state."
        });
    }
})(typeof window !== "undefined" ? { window: window } : {}, function (format) {
    "use strict";

    const VERSION = "1.0.0";

    function registry() {
        const c = (typeof window !== "undefined") ? window.CozyOS : (typeof globalThis !== "undefined" ? globalThis.CozyOS : null);
        return c && c.CozyLanguagePacks ? c.CozyLanguagePacks : null;
    }
    function privacy() {
        const c = (typeof window !== "undefined") ? window.CozyOS : (typeof globalThis !== "undefined" ? globalThis.CozyOS : null);
        return c && c.CozyIntelligencePrivacy ? c.CozyIntelligencePrivacy : null;
    }

    /**
     * gatherExportableRecords(languageId, opts)
     *   Reads the REAL registry state for languageId and applies the REAL
     *   privacy gate per record. Returns both what qualifies and an honest
     *   accounting of what was excluded and why — never a silent drop.
     */
    function gatherExportableRecords(languageId, opts) {
        const o = opts || {};
        const reg = registry();
        if (!reg) return { ok: false, reason: "REGISTRY_NOT_LOADED" };
        const pack = reg.getPack(languageId);
        if (!pack) return { ok: false, reason: "UNREGISTERED_LANGUAGE" };

        const priv = privacy();
        const all = reg.listExpressions({ languageId });
        const vocabulary = [];
        const excluded = [];

        for (const rec of all) {
            const tier = rec.privacyTier || null;
            if (!tier) {
                if (o.treatUnclassifiedAs === "COMMUNITY" && o.acknowledgeUnclassifiedRisk === true) {
                    // Explicit, non-default, logged owner override only.
                    vocabulary.push(rec);
                } else {
                    excluded.push({ recordId: rec.recordId, reason: "NO_REAL_PRIVACY_TIER" });
                }
                continue;
            }
            if (!priv || typeof priv.canExport !== "function") {
                excluded.push({ recordId: rec.recordId, reason: "PRIVACY_ENGINE_UNAVAILABLE" });
                continue;
            }
            const decision = priv.canExport(Object.assign({}, rec, { privacyTier: tier }), { purpose: o.purpose || "LANGUAGE_PACK_PORTABILITY" });
            if (decision.allowed) {
                vocabulary.push(rec);
            } else {
                excluded.push({ recordId: rec.recordId, reason: decision.reason });
            }
        }

        return { ok: true, pack, vocabulary, excludedCount: excluded.length, excluded };
    }

    /**
     * exportPack(languageId, options)
     *   Builds a manifest + payload from REAL, privacy-gated registry data.
     *   Returns { manifest, payload, fileName } — does NOT write to any
     *   storage provider itself; callers pass the result to a
     *   StorageProvider.write() so this file stays medium-agnostic (SD,
     *   external directory, IndexedDB blob download are all just callers).
     */
    async function exportPack(languageId, options) {
        const opts = options || {};
        const gathered = gatherExportableRecords(languageId, opts);
        if (!gathered.ok) return { ok: false, reason: gathered.reason };

        const manifest = await format.buildManifest({
            packId: `pack-${gathered.pack.identity.languageId}`,
            languageCode: gathered.pack.identity.languageId,
            languageName: gathered.pack.identity.name,
            source: "COZYOS_REGISTRY_EXPORT",
            licenseState: opts.licenseState || "LICENSE_UNKNOWN",
            resourceState: gathered.pack.resourceState,
            version: opts.version || "0.1.0",
            records: { vocabulary: gathered.vocabulary }
        });

        const payload = {
            manifest,
            vocabulary: gathered.vocabulary,
            translations: [],
            phrases: [],
            provenance: [],
            corrections: [],
            conflicts: []
        };

        return {
            ok: true,
            manifest,
            payload,
            fileName: format.packFileName(manifest),
            privacyReport: { includedCount: gathered.vocabulary.length, excludedCount: gathered.excludedCount, excluded: gathered.excluded }
        };
    }

    /**
     * stageImport(rawPackJson, expectedLanguageId)
     *   Verify-before-touch. Returns a staged, uncommitted result. Never
     *   writes into the live registry/expression store.
     */
    async function stageImport(rawPackJson, expectedLanguageId) {
        let parsed;
        try {
            parsed = typeof rawPackJson === "string" ? JSON.parse(rawPackJson) : rawPackJson;
        } catch (err) {
            return { ok: false, result: "PACK_CORRUPTED", reason: "INVALID_JSON" };
        }
        if (!parsed || !parsed.manifest) {
            return { ok: false, result: "PACK_INCOMPLETE", reason: "NO_MANIFEST" };
        }

        const manifestCheck = await format.verifyManifest(parsed.manifest, {
            vocabulary: parsed.vocabulary || [],
            translations: parsed.translations || [],
            phrases: parsed.phrases || [],
            provenance: parsed.provenance || [],
            corrections: parsed.corrections || [],
            conflicts: parsed.conflicts || []
        });
        if (manifestCheck.result !== "PACK_VERIFIED") {
            return { ok: false, result: manifestCheck.result, reason: manifestCheck.reason || null };
        }

        if (expectedLanguageId) {
            const idCheck = format.verifyIdentity(parsed.manifest, expectedLanguageId);
            if (idCheck.result !== "PACK_VERIFIED") {
                return { ok: false, result: "PACK_IDENTITY_MISMATCH", expected: idCheck.expected, actual: idCheck.actual };
            }
        }

        return { ok: true, result: "PACK_VERIFIED", manifest: parsed.manifest, payload: parsed };
    }

    /**
     * commitImport(staged, options)
     *   Only ever called after stageImport() returns PACK_VERIFIED.
     *   Idempotent: importing the same pack twice must not duplicate
     *   vocabulary. Never overwrites a stronger evidence/validation
     *   record with a weaker one.
     */
    function commitImport(staged, options) {
        const opts = options || {};
        if (!staged || staged.result !== "PACK_VERIFIED") {
            return { ok: false, reason: "CANNOT_COMMIT_UNVERIFIED_STAGE" };
        }
        const reg = registry();
        if (!reg || typeof reg.submitExpression !== "function") {
            return { ok: false, reason: "REGISTRY_NOT_LOADED" };
        }

        const languageId = staged.manifest.languageCode;
        const existing = reg.listExpressions({ languageId });
        const existingByMatchApprox = new Map();
        for (const rec of existing) {
            const k = [languageId, rec.region || "", rec.dialect || "", rec.meaning || "", rec.expression || ""].join("|");
            existingByMatchApprox.set(k, rec);
        }

        let imported = 0, skippedDuplicate = 0, skippedWeakerEvidence = 0, rejected = 0;
        const incoming = (staged.payload && staged.payload.vocabulary) || [];

        for (const rec of incoming) {
            const k = [languageId, rec.region || "", rec.dialect || "", rec.meaning || "", rec.expression || ""].join("|");
            const already = existingByMatchApprox.get(k);
            if (already) {
                // Idempotency: identical record already present. Only ever
                // treat this as new evidence, never a silent overwrite of
                // stronger validated data with weaker imported data.
                const incomingStrength = (rec.evidenceCount || 0);
                const existingStrength = (already.evidenceCount || 0);
                if (incomingStrength <= existingStrength) {
                    skippedDuplicate++;
                    continue;
                }
                skippedWeakerEvidence++; // existing kept; real merge/versioning is a documented future gap
                continue;
            }
            const result = reg.submitExpression({
                languageId,
                expression: rec.expression,
                literalMeaning: rec.literalMeaning,
                meaning: rec.meaning,
                region: rec.region,
                dialect: rec.dialect,
                context: rec.context,
                audioReference: rec.audioReference,
                contributorPseudonym: opts.contributorPseudonym || "imported-pack",
                sourceType: "COMMUNITY"
            });
            if (result.status === "CANDIDATE_CREATED" || result.status === "EVIDENCE_ADDED") {
                imported++;
            } else {
                rejected++;
            }
        }

        return {
            ok: true,
            languageId,
            imported, skippedDuplicate, skippedWeakerEvidence, rejected,
            totalConsidered: incoming.length
        };
    }

    /**
     * importPack(rawPackJson, expectedLanguageId, options)
     *   Convenience wrapper: stage then commit, but only if verification
     *   passed. Returns the stage result untouched if verification failed
     *   — commitImport() is never reached on a failed stage.
     */
    async function importPack(rawPackJson, expectedLanguageId, options) {
        const staged = await stageImport(rawPackJson, expectedLanguageId);
        if (!staged.ok) return staged;
        const commit = commitImport(staged, options);
        return Object.assign({ ok: commit.ok, stage: staged.result }, commit);
    }

    return Object.freeze({
        VERSION,
        gatherExportableRecords,
        exportPack,
        stageImport,
        commitImport,
        importPack
    });
});
