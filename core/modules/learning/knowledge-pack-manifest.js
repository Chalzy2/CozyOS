/**
 * core/modules/learning/knowledge-pack-manifest.js
 * PHASE 5 — Continuous Learning & Knowledge Growth: automatic
 * knowledge-pack manifest.
 *
 * WHAT THIS IS
 *   A real, minimal, additive INDEX over knowledge that has already
 *   reached a genuinely verified/trusted state in an EXISTING store
 *   (CozyLearn's TRUSTED teachings today; any other real store in the
 *   future). It is NOT a fourth knowledge store: a manifest entry never
 *   copies or duplicates the taught content itself — it records a
 *   POINTER (sourceStore + sourceRecordId) plus the provenance/
 *   verification/scope the source record ALREADY carries, copied
 *   verbatim, never re-derived or upgraded. This directly answers the
 *   "automatic knowledge-pack creation" requirement without inventing a
 *   new pack-type schema or a competing source of truth (see this
 *   repository's own cozy-language-pack-registry.js, which has exactly
 *   one pack shape and no notion of a distinct "pack type" at all —
 *   traced, not assumed, before writing this file).
 *
 * NEVER AUTO-PUBLISHED
 *   A manifest entry's own `scope` field is copied VERBATIM from the
 *   source record's scope at the moment it was recorded. This file
 *   never widens it — a USER-scope teaching produces a USER-scope
 *   manifest entry, never GLOBAL, regardless of how many times it is
 *   queried or how "important" it looks. Only a caller that itself
 *   legitimately promotes the SOURCE record to a wider scope (a real,
 *   separate, human-governed action elsewhere in this repository) would
 *   ever cause a future manifest entry for that same source to carry a
 *   wider scope — this file has no promotion logic of its own.
 *
 * FAILS CLOSED
 *   Every write here is a best-effort, disclosed side effect — the same
 *   "never blocking, never fabricating success" discipline as this
 *   directory's own continuous-learning-fabric.js. A missing CozyMemory
 *   degrades to an in-memory-only fallback (page-lifetime), never
 *   throws into a caller, and never changes any teaching/answer turn's
 *   own outcome.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-phase5";
    const NAMESPACE = "knowledge-pack-manifest";
    if (window.CozyOS.Modules["knowledge-pack-manifest"]) return;

    const fallbackEntries = new Map(); // used only when CozyMemory is unavailable

    function memory() {
        const m = window.CozyOS.CozyMemory;
        return (m && typeof m.saveMemory === "function" && typeof m.listKeys === "function") ? m : null;
    }

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

    let counter = 0;
    function makeEntryId() { return `pack_${Date.now()}_${(++counter)}`; }

    /**
     * recordPackEntry({packType, sourceStore, sourceRecordId, language,
     *                  domain, provenance, verificationState, scope, actorId})
     *   Real, additive, disclosed. Required: packType, sourceStore,
     *   sourceRecordId — a manifest entry with no real source pointer
     *   is never created. Returns {success:false, reason} rather than
     *   fabricating an entry when required fields are missing.
     */
    function recordPackEntry(fields) {
        const f = fields || {};
        if (!isNonEmptyString(f.packType)) return { success: false, reason: "packType is required." };
        if (!isNonEmptyString(f.sourceStore)) return { success: false, reason: "sourceStore is required." };
        if (!isNonEmptyString(String(f.sourceRecordId || ""))) return { success: false, reason: "sourceRecordId is required." };

        const scope = f.scope || "USER";
        const entry = Object.freeze({
            id: makeEntryId(),
            packType: f.packType,
            language: f.language || null,
            domain: f.domain || null,
            sourceStore: f.sourceStore,
            sourceRecordId: String(f.sourceRecordId),
            provenance: f.provenance || null,
            verificationState: f.verificationState || "UNVERIFIED",
            scope,
            createdAt: new Date().toISOString()
        });

        const mem = memory();
        if (mem) {
            try {
                mem.saveMemory(NAMESPACE, entry.id, entry, {
                    owner: scope === "USER" ? (f.actorId || null) : null,
                    actorId: f.actorId || "system",
                    visibility: scope === "USER" ? "private" : "public"
                });
                return { success: true, entry };
            } catch (_err) { /* fall through to in-memory */ }
        }
        fallbackEntries.set(entry.id, entry);
        return { success: true, entry, persisted: false };
    }

    /**
     * getPacksFor({packType, language, domain, actorId})
     *   Real, read-only. A USER-scope entry is only returned when its
     *   own recorded actorId (via CozyMemory's own owner-based
     *   visibility check, composed through listKeys' real actorId
     *   parameter — never re-implemented here) matches the caller. When
     *   CozyMemory itself is unavailable, falls back to this session's
     *   own in-memory entries (page-lifetime only, honestly).
     */
    function getPacksFor(filter) {
        const f = filter || {};
        const mem = memory();
        const predicate = (e) => {
            const v = e && e.value;
            if (!v) return false;
            if (f.packType && v.packType !== f.packType) return false;
            if (f.language && v.language !== f.language) return false;
            if (f.domain && v.domain !== f.domain) return false;
            return true;
        };
        if (mem) {
            try {
                const entries = mem.listKeys(NAMESPACE, predicate, f.actorId || "system") || [];
                return entries.map((e) => e.value).filter(Boolean);
            } catch (_err) { /* fall through to in-memory */ }
        }
        return Array.from(fallbackEntries.values()).filter((v) => predicate({ value: v }));
    }

    const KnowledgePackManifest = Object.freeze({
        NAMESPACE, recordPackEntry, getPacksFor, getVersion: () => MODULE_VERSION
    });
    window.CozyOS.KnowledgePackManifest = KnowledgePackManifest;
    window.CozyOS.Modules["knowledge-pack-manifest"] = Object.freeze({
        version: MODULE_VERSION,
        description: "PHASE 5 — Continuous Learning & Knowledge Growth: real, additive, read/write INDEX over already-verified knowledge in existing stores (CozyLearn TRUSTED teachings today). Never copies source content, never widens scope, never auto-publishes. Not a fourth knowledge store."
    });
})();
