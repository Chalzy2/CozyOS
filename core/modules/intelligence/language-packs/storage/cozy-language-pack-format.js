/**
 * core/modules/intelligence/language-packs/storage/cozy-language-pack-format.js
 * RP-035 COS-LANG-PM-001 — Portable Language-Pack Manifest Format + Integrity
 *
 * SCOPE
 *   Defines ONE manifest shape for a portable CozyOS language pack and the
 *   real SHA-256 integrity primitives used to build/verify it. This file
 *   does not touch storage, teaching, or registry internals — it is a pure
 *   format/verification layer consumed by cozy-language-pack-export-import.js
 *   and by the Termux CLI tool (tools/termux/cozy-pack.js), so both the
 *   in-app path and the Termux path hash and validate manifests identically.
 *
 * ISOMORPHIC
 *   Runs unmodified under a browser (window.crypto.subtle) and under
 *   Node.js/Termux (require('crypto')). Callers await sha256Hex(); neither
 *   environment is assumed silently — if neither crypto API is present,
 *   sha256Hex() rejects rather than returning a fabricated hash.
 *
 * CANONICAL IDENTITIES
 *   Deliberately duplicated (not imported) from cozy-language-pack-registry.js
 *   DEFAULT_IDENTITIES as a small, frozen, read-only cross-check list. This
 *   file never registers, mutates, or promotes a pack — see Rule 82. It only
 *   validates that a manifest's languageCode is one of the 17 canonical
 *   identities, or is honestly flagged as non-canonical.
 *
 * PACK LIFECYCLE STATES (must exactly match cozy-language-pack-registry.js
 * PACK_STATES so a manifest's `resourceState` and the in-app registry's
 * `resourceState` never diverge):
 *   REGISTERED, NOT_READY, PARTIAL, COMMUNITY_BUILDING, VALIDATING,
 *   AVAILABLE, DEPRECATED
 *
 * NO FABRICATION
 *   - buildManifest() never invents recordCount/byteSize/hashes — every
 *     field is computed from the content actually passed in.
 *   - A pack with zero content records is built with resourceState
 *     NOT_READY, never AVAILABLE. Nothing in this file can promote that
 *     state (same Rule 82 boundary the registry enforces).
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        const w = root.window || root;
        w.CozyOS = w.CozyOS || {};
        w.CozyOS.Modules = w.CozyOS.Modules || {};
        if (w.CozyOS.Modules["cozy-language-pack-format"]) return;
        const api = factory();
        w.CozyOS.CozyLanguagePackFormat = api;
        w.CozyOS.Modules["cozy-language-pack-format"] = Object.freeze({
            version: api.VERSION,
            api,
            description: "RP-035 COS-LANG-PM-001 — Portable language-pack manifest format + SHA-256 integrity, shared by the in-app export/import path and the Termux CLI tool."
        });
    }
})(typeof window !== "undefined" ? { window: window } : {}, function () {
    "use strict";

    const VERSION = "1.0.0";
    const SCHEMA_VERSION = "1.0.0";

    const CANONICAL_IDENTITIES = Object.freeze([
        "en", "sw", "fr", "ar", "so", "ru", "zh", "ha", "yo", "luo", "ki", "kam", "zu"
    ]);

    const PACK_STATES = Object.freeze([
        "REGISTERED", "NOT_READY", "PARTIAL", "COMMUNITY_BUILDING",
        "VALIDATING", "AVAILABLE", "DEPRECATED"
    ]);

    const VERIFY_RESULTS = Object.freeze([
        "PACK_VERIFIED", "PACK_CORRUPTED", "PACK_INCOMPLETE",
        "PACK_SCHEMA_UNSUPPORTED", "PACK_IDENTITY_MISMATCH"
    ]);

    // -----------------------------------------------------------------
    // SHA-256 — real, isomorphic, never fabricated
    // -----------------------------------------------------------------

    async function sha256Hex(input) {
        const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;

        if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
            const digest = await window.crypto.subtle.digest("SHA-256", bytes);
            return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
        }
        if (typeof require === "function") {
            try {
                const nodeCrypto = require("crypto");
                const hash = nodeCrypto.createHash("sha256");
                hash.update(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
                return hash.digest("hex");
            } catch (_err) {
                // fall through to rejection below
            }
        }
        throw new Error("No real SHA-256 implementation available in this environment (no window.crypto.subtle, no Node 'crypto'). Refusing to fabricate a hash.");
    }

    // -----------------------------------------------------------------
    // Manifest
    // -----------------------------------------------------------------

    /**
     * buildManifest({ packId, languageCode, languageName, source, licenseState,
     *                  records: { vocabulary, translations, provenance,
     *                             corrections, conflicts, phrases }, version })
     *   `records` must be the REAL arrays being packaged. Counts and byte
     *   size are derived, never supplied by the caller.
     */
    async function buildManifest(input) {
        const opts = input || {};
        if (!opts.languageCode) throw new Error("buildManifest requires languageCode");
        if (!opts.packId) throw new Error("buildManifest requires packId");

        const records = opts.records || {};
        const vocabulary = records.vocabulary || [];
        const translations = records.translations || [];
        const phrases = records.phrases || [];
        const provenance = records.provenance || [];
        const corrections = records.corrections || [];
        const conflicts = records.conflicts || [];

        const recordCount = vocabulary.length + translations.length + phrases.length;
        const serializedContent = JSON.stringify({ vocabulary, translations, phrases, provenance, corrections, conflicts });
        const contentHash = await sha256Hex(serializedContent);
        const byteSize = (typeof Buffer !== "undefined" ? Buffer.byteLength(serializedContent, "utf8") : new TextEncoder().encode(serializedContent).length);

        const isCanonical = CANONICAL_IDENTITIES.includes(opts.languageCode);

        // Honest resourceState: a manifest is never built AVAILABLE here.
        // NOT_READY with zero records; PARTIAL/COMMUNITY_BUILDING/VALIDATING
        // may be passed through from the caller's real registry state, but
        // AVAILABLE may only be echoed if the caller supplies it AND
        // recordCount > 0 — this file never invents the promotion itself.
        let resourceState = opts.resourceState || (recordCount === 0 ? "NOT_READY" : "PARTIAL");
        if (resourceState === "AVAILABLE" && recordCount === 0) {
            resourceState = "NOT_READY"; // never allow a fabricated AVAILABLE
        }
        if (!PACK_STATES.includes(resourceState)) resourceState = "NOT_READY";

        const manifest = {
            packId: opts.packId,
            languageCode: opts.languageCode,
            languageName: opts.languageName || opts.languageCode,
            isCanonicalIdentity: isCanonical,
            schemaVersion: SCHEMA_VERSION,
            packVersion: opts.version || "0.1.0",
            resourceState,
            createdAt: opts.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source: opts.source || "UNKNOWN",
            licenseState: opts.licenseState || "LICENSE_UNKNOWN",
            counts: {
                vocabulary: vocabulary.length,
                translations: translations.length,
                phrases: phrases.length,
                provenance: provenance.length,
                corrections: corrections.length,
                conflicts: conflicts.length,
                recordCount
            },
            byteSize,
            contentHash,
            minimumCozyOSVersion: opts.minimumCozyOSVersion || "0.0.0",
            requiredEngineCapabilities: opts.requiredEngineCapabilities || []
        };

        manifest.manifestHash = await sha256Hex(JSON.stringify(manifest));
        return manifest;
    }

    /**
     * verifyManifest(manifest, records)
     *   Recomputes contentHash from the REAL records and compares. Never
     *   trusts a manifest's self-reported hash without recomputation.
     */
    async function verifyManifest(manifest, records) {
        if (!manifest || typeof manifest !== "object") {
            return { result: "PACK_CORRUPTED", reason: "MANIFEST_MISSING_OR_MALFORMED" };
        }
        if (manifest.schemaVersion !== SCHEMA_VERSION) {
            return { result: "PACK_SCHEMA_UNSUPPORTED", reason: `Manifest schemaVersion ${manifest.schemaVersion} != supported ${SCHEMA_VERSION}` };
        }
        const required = ["packId", "languageCode", "contentHash", "manifestHash", "counts"];
        for (const field of required) {
            if (!(field in manifest)) {
                return { result: "PACK_INCOMPLETE", reason: `Manifest missing required field: ${field}` };
            }
        }

        const recs = records || {};
        const vocabulary = recs.vocabulary || [];
        const translations = recs.translations || [];
        const phrases = recs.phrases || [];
        const provenance = recs.provenance || [];
        const corrections = recs.corrections || [];
        const conflicts = recs.conflicts || [];

        const serializedContent = JSON.stringify({ vocabulary, translations, phrases, provenance, corrections, conflicts });
        const recomputedContentHash = await sha256Hex(serializedContent);

        if (recomputedContentHash !== manifest.contentHash) {
            return { result: "PACK_CORRUPTED", reason: "CONTENT_HASH_MISMATCH", expected: manifest.contentHash, actual: recomputedContentHash };
        }

        const recomputedRecordCount = vocabulary.length + translations.length + phrases.length;
        if (recomputedRecordCount !== manifest.counts.recordCount) {
            return { result: "PACK_INCOMPLETE", reason: "RECORD_COUNT_MISMATCH", expected: manifest.counts.recordCount, actual: recomputedRecordCount };
        }

        // manifestHash self-check: recompute over the manifest minus its own hash field.
        const clone = Object.assign({}, manifest);
        delete clone.manifestHash;
        const recomputedManifestHash = await sha256Hex(JSON.stringify(clone));
        if (recomputedManifestHash !== manifest.manifestHash) {
            return { result: "PACK_CORRUPTED", reason: "MANIFEST_HASH_MISMATCH" };
        }

        return { result: "PACK_VERIFIED" };
    }

    /**
     * verifyIdentity(manifest, expectedLanguageCode)
     *   Rejects a pack silently mislabeled or swapped for another language.
     */
    function verifyIdentity(manifest, expectedLanguageCode) {
        if (!manifest || !expectedLanguageCode) return { result: "PACK_IDENTITY_MISMATCH", reason: "MISSING_INPUT" };
        if (manifest.languageCode !== expectedLanguageCode) {
            return { result: "PACK_IDENTITY_MISMATCH", expected: expectedLanguageCode, actual: manifest.languageCode };
        }
        return { result: "PACK_VERIFIED" };
    }

    function packFileName(manifest) {
        return `CozyOS-LanguagePack-${manifest.packId}-${manifest.languageCode}-v${manifest.packVersion}.json`;
    }

    return Object.freeze({
        VERSION,
        SCHEMA_VERSION,
        CANONICAL_IDENTITIES,
        PACK_STATES,
        VERIFY_RESULTS,
        sha256Hex,
        buildManifest,
        verifyManifest,
        verifyIdentity,
        packFileName
    });
});
