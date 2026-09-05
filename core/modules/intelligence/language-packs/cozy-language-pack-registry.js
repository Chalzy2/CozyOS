/**
 * CozyOS — Language Pack Foundation Registry
 * File Reference: core/modules/intelligence/language-packs/cozy-language-pack-registry.js
 * Repair: RP-030 — CozyAI Language Pack Foundation
 *
 * MISSION
 *   "Africa teaches AI" -> "CozyAI learns from people" -> "CozyAI
 *   preserves language + context + provenance" -> "CozyAI helps
 *   people" -> "Knowledge improves community life."
 *
 *   This file is the canonical LanguagePack architecture: identity,
 *   geography, dialects, vocabulary/phrase records, confidence,
 *   provenance, licensing, validation and safety state. It is a
 *   CONTAINER for verified knowledge, not a claim that CozyAI already
 *   understands any of these languages. Creating a pack identity does
 *   NOT make a language AVAILABLE (Rule 82, docs/builder/rules/27).
 *
 * OWNERSHIP / COMPOSITION (no rewriting of RP-029-A/B/C files)
 *   This is a new, additive, standalone file. It composes — never
 *   duplicates — the following existing, frozen public APIs:
 *     - window.CozyOS.CozyKnowledgeIngestion   (RP-029-A: candidate
 *       lifecycle, ingestCommunitySubmission, confirmCandidate)
 *     - window.CozyOS.Modules["cozy-knowledge-community"] extensions
 *       (RP-029-B: describeConfidence, getRule82Status)
 *     - window.CozyOS.CozyKnowledgeSafetyGate   (RP-029-C Phase 5:
 *       classify(), quarantine(), releaseFromQuarantine())
 *     - window.CozyOS.CozyLanguageRegistry       (RP-027: the chat/
 *       response-template language selector — a DIFFERENT, narrower
 *       concern than a language pack; read only, never mutated here)
 *   None of the above files are modified, rewritten, or duplicated.
 *   If any dependency is absent (e.g. running standalone), every
 *   function here fails closed / degrades honestly rather than
 *   fabricating a result — see composeXxx() helpers below.
 *
 * RULE 82 (docs/builder/rules/27) — BINDING
 *   Nothing in this file can move a pack from NOT_READY/REGISTERED to
 *   AVAILABLE. There is no such mutator. requestPromotion() always
 *   returns BLOCKED with a reason; only a human-governed process
 *   outside this file (and outside this repair) can ever change that,
 *   and even then Rule 82's own five-part gate (owned by
 *   cozy-knowledge-review.js) is the sole authority consulted.
 *
 * NO FABRICATION
 *   - No OCR, speech-recognition, translation-ML, or video-analysis
 *     engine exists in this repository. This file never claims one
 *     does; provenance sourceType values like AUDIO/OCR/VIDEO_METADATA
 *     describe evidence *references*, not automated extraction.
 *   - "Most used" is never reported — no usage telemetry exists in
 *     this repository. Only MOST_SUBMITTED / MOST_VALIDATED (both
 *     derivable from real, counted records) are ever reported.
 *   - Unknown licensing is never silently treated as approved.
 */
(function (root) {
    "use strict";

    const VERSION = "1.0.0";

    // -----------------------------------------------------------------
    // 0. DEPENDENCY COMPOSITION (read real APIs; never fabricate them)
    // -----------------------------------------------------------------

    function cozyOS() {
        return (root && root.window && root.window.CozyOS) || (typeof window !== "undefined" ? window.CozyOS : null);
    }
    function ingestion() {
        const c = cozyOS();
        return c && c.CozyKnowledgeIngestion ? c.CozyKnowledgeIngestion : null;
    }
    function communityExt() {
        const c = cozyOS();
        return c && c.Modules && c.Modules["cozy-knowledge-community"]
            ? c.Modules["cozy-knowledge-community"].api
            : null;
    }
    function safetyGate() {
        const c = cozyOS();
        return c && c.CozyKnowledgeSafetyGate ? c.CozyKnowledgeSafetyGate : null;
    }
    function chatLanguageRegistry() {
        const c = cozyOS();
        return c && c.CozyLanguageRegistry ? c.CozyLanguageRegistry : null;
    }

    // -----------------------------------------------------------------
    // 1. PACK STATES (explicit, never auto-promoted)
    // -----------------------------------------------------------------

    const PACK_STATES = Object.freeze([
        "UNREGISTERED", "REGISTERED", "NOT_READY", "PARTIAL",
        "COMMUNITY_BUILDING", "VALIDATING", "AVAILABLE", "DEPRECATED"
    ]);

    const LICENSE_STATES = Object.freeze([
        "LICENSE_UNKNOWN", "PUBLIC_DOMAIN", "COMMUNITY_CONSENTED",
        "LICENSED_PERMITTED", "LICENSE_REJECTED"
    ]);

    const SOURCE_TYPES = Object.freeze([
        "COMMUNITY", "DOCUMENT", "BOOK", "BIBLE", "WEBSITE", "OCR",
        "AUDIO", "VIDEO_METADATA", "RESEARCH", "ADMIN", "USER_CORRECTION"
    ]);

    // Illustrative-only evidence-count bands (spec: "not scientific
    // truth" — never presented to a user as a guaranteed accuracy
    // figure, only used to label emerging/strong/highly-validated for
    // dashboard sorting).
    const EVIDENCE_BANDS = Object.freeze([
        { min: 0, max: 0, label: "NONE" },
        { min: 1, max: 4, label: "CANDIDATE" },
        { min: 5, max: 19, label: "EMERGING" },
        { min: 20, max: 99, label: "STRONG" },
        { min: 100, max: Infinity, label: "HIGHLY_VALIDATED" }
    ]);

    function evidenceBand(count) {
        const n = Number(count) || 0;
        const band = EVIDENCE_BANDS.find((b) => n >= b.min && n <= b.max);
        return band ? band.label : "NONE";
    }

    // -----------------------------------------------------------------
    // 2. THE 17 DEFAULT LANGUAGE-PACK IDENTITIES
    //    Registered here == a canonical container exists. It does NOT
    //    mean vocabulary/phrases/grammar are populated or verified —
    //    see resourceState, separate from identity registration.
    // -----------------------------------------------------------------

    const DEFAULT_IDENTITIES = Object.freeze([
        { languageId: "en", name: "English", nativeName: "English", iso: "en", flag: "🇬🇧" },
        { languageId: "sw", name: "Kiswahili", nativeName: "Kiswahili", iso: "sw", flag: "🇰🇪" },
        { languageId: "fr", name: "French", nativeName: "Français", iso: "fr", flag: "🇫🇷" },
        { languageId: "ar", name: "Arabic", nativeName: "العربية", iso: "ar", flag: "🌍" },
        { languageId: "so", name: "Somali", nativeName: "Soomaali", iso: "so", flag: "🇸🇴" },
        { languageId: "ru", name: "Russian", nativeName: "Русский", iso: "ru", flag: "🇷🇺" },
        { languageId: "zh", name: "Chinese / Mandarin", nativeName: "中文", iso: "zh", flag: "🇨🇳" },
        { languageId: "ha", name: "Hausa", nativeName: "Hausa", iso: "ha", flag: "🇳🇬" },
        { languageId: "yo", name: "Yorùbá", nativeName: "Yorùbá", iso: "yo", flag: "🇳🇬" },
        { languageId: "luo", name: "Luo / Dholuo", nativeName: "Dholuo", iso: null, flag: "🇰🇪" },
        { languageId: "ki", name: "Kikuyu", nativeName: "Gĩkũyũ", iso: null, flag: "🇰🇪" },
        { languageId: "kam", name: "Kikamba", nativeName: "Kikamba", iso: null, flag: "🇰🇪" },
        { languageId: "zu", name: "isiZulu", nativeName: "isiZulu", iso: "zu", flag: "🇿🇦" },
        { languageId: "am", name: "Amharic", nativeName: "አማርኛ", iso: "am", flag: "🇪🇹" },
        { languageId: "ln", name: "Lingala", nativeName: "Lingála", iso: "ln", flag: "🇨🇩" },
        { languageId: "ig", name: "Igbo", nativeName: "Igbo", iso: "ig", flag: "🇳🇬" },
        { languageId: "hi", name: "Hindi", nativeName: "हिन्दी", iso: "hi", flag: "🇮🇳" }
    ]);

    // =======================================================================
    // LANGUAGE CAPABILITY OWNERSHIP MODEL (Phase C-1)
    // =======================================================================
    // Repository discovery (docs/builder/knowledge/NLLB-TRACE-PROVIDER-NEUTRAL-DISCOVERY.md)
    // established three genuinely distinct, non-duplicate authorities:
    //   Tier 1 (identity)      -> THIS registry, DEFAULT_IDENTITIES above.
    //   Tier 2 (conversational)-> core/modules/intelligence/language/cozy-language-registry.js
    //                             (a separate, real, already-existing file — NOT read or
    //                             modified here; composing it is a deliberately deferred
    //                             follow-up, not attempted this round, to avoid one
    //                             function silently taking on two authorities' worth of
    //                             responsibility in a single, rushed step).
    //   Tier 3 (NLLB coverage) -> language-packs/shared/NLLB-200-600M-INT8/nllb_http_bridge.py's
    //                             COZY_TO_NLLB dict (Python, a different file/runtime —
    //                             cannot be required() from here; the 17-entry key list
    //                             below is a manually-kept-in-sync mirror of that dict's
    //                             *keys only*, confirmed identical by direct comparison
    //                             this round — never the NLLB codes themselves, which
    //                             remain that bridge's own internal implementation detail).
    //
    // HONESTY RULES enforced by getLanguageCapabilities()/getOnlineProviderStatus() below:
    //   - NLLB runtime status is NEVER reported as RUNTIME_VERIFIED by this synchronous,
    //     offline, Core-safe function — doing so would require a live network health
    //     check, which Core must never perform silently (see Offline-First Rule). It is
    //     always DOCUMENTED_ONLY here; only a real, separate, explicit online-edge check
    //     (not this file) may ever report RUNTIME_VERIFIED, and only after actually
    //     observing a live bridge.
    //   - Gemini is NOT language-specific the way NLLB is (one general-purpose model, not
    //     a per-language map) — represented once, generically, via getOnlineProviderStatus(),
    //     never folded into each language's own capability object as if it had a per-
    //     language mapping fact the way NLLB genuinely does.
    //   - Neither function performs a network call. Both are pure, synchronous, and safe
    //     to call from fully offline Core initialization.
    const NLLB_MAPPED_LANGUAGE_IDS = Object.freeze([
        "en", "sw", "fr", "ar", "so", "ru", "zh", "ha", "yo",
        "luo", "ki", "kam", "zu", "am", "ln", "ig", "hi"
    ]);

    /**
     * getLanguageCapabilities(languageId) — the minimal, honest, per-
     * language capability answer this registry (and only this registry,
     * per the ownership trace above) can safely give without reaching
     * into another file's authority or performing a network call.
     * Returns null for an unknown languageId — never fabricates a
     * capability profile for an identity this registry has never heard of.
     */
    function getLanguageCapabilities(languageId) {
        const pack = getPack(languageId);
        if (!pack) return null;
        const id = pack.identity.languageId;
        return {
            languageId: id,
            origin: pack.origin,                 // DEFAULT | OPTIONAL — this registry's own real field, untouched
            packStatus: pack.status,              // this registry's own real field, untouched
            resourceState: pack.resourceState,    // this registry's own real field, untouched
            nllb: {
                mapped: NLLB_MAPPED_LANGUAGE_IDS.includes(id),
                mappingSource: "language-packs/shared/NLLB-200-600M-INT8/nllb_http_bridge.py",
                runtimeStatus: "DOCUMENTED_ONLY" // never claimed RUNTIME_VERIFIED from a synchronous, offline-safe function
            },
            // Deliberately NOT included here: conversational-template
            // availability (Tier 2), Gemini (see getOnlineProviderStatus()),
            // STT/TTS/OCR/UI (separate authorities, not traced deeply
            // enough this round to safely represent — reported UNKNOWN
            // by omission rather than guessed at).
        };
    }

    /**
     * getOnlineProviderStatus() — a static, honest description of the
     * two currently-known ONLINE capabilities this repository contains
     * real infrastructure for (NLLB, Gemini), per the Offline-First Rule:
     * this never performs a live check and never claims a specific
     * environment's network state — that determination belongs to
     * whatever online-edge boundary code actually attempts the call,
     * not to this offline-safe registry.
     */
    function getOnlineProviderStatus() {
        return Object.freeze({
            nllb: {
                implemented: true,
                mappingCoverage: `${NLLB_MAPPED_LANGUAGE_IDS.length}/${DEFAULT_IDENTITIES.length}`,
                networkRequired: true,
                runtimeStatus: "DOCUMENTED_ONLY",
                note: "Requires a live local bridge process with the real model loaded. Never assumed available."
            },
            gemini: {
                implemented: true,
                languageSpecific: false,
                networkRequired: true,
                runtimeStatus: "NETWORK_REQUIRED",
                note: "General-purpose provider, not a per-language mapping. Requires real credentials and network egress."
            }
        });
    }

    // languageId -> pack record. Populated by registerDefaultPacks().
    const packs = new Map();

    // languageId -> Set of "country|region|dialect" regional-context keys
    const regionalContexts = new Map();

    // In-memory expression store, keyed by recordId. A real storage
    // abstraction (see section 7) sits in front of this so callers
    // never assume a particular physical medium.
    let nextRecordId = 1;
    const expressionRecords = new Map();

    // matchKey -> recordId, enforcing "same spelling != same record"
    // (section 6): merges require language+region+dialect+meaning+
    // provenance-source-type agreement, never spelling alone.
    const matchIndex = new Map();

    // Optional {get,set,remove,list}-shaped adapter (same shape
    // createStorageAdapter() already produces) that, when bound, the
    // expression store write-throughs to. Unbound by default so every
    // existing caller/test keeps today's pure in-memory behavior
    // unchanged — this is additive, not a behavior change. See
    // bindExpressionStorage()/restoreExpressions() in section 7.
    let expressionStorageAdapter = null;

    function freshPackRecord(identity, origin) {
        return {
            identity: {
                languageId: identity.languageId,
                name: identity.name,
                nativeName: identity.nativeName,
                iso: identity.iso || null,
                flag: identity.flag || null,
            },
            origin: origin === "OPTIONAL" ? "OPTIONAL" : "DEFAULT", // RP-035 Phase 1 correction: distinguishes the 17 default identities from any RP-030/031-governed optional pack; never used to bypass Rule 82
            status: "REGISTERED",          // pack container exists
            resourceState: "NOT_READY",     // vocabulary/phrases NOT populated
            geography: { countries: [], regions: [], communities: [] },
            dialects: [],
            counts: { submitted: 0, validated: 0, quarantined: 0, rejected: 0 },
            licensingProblems: 0,
            createdAt: new Date().toISOString()
        };
    }

    function registerDefaultPacks() {
        DEFAULT_IDENTITIES.forEach((identity) => {
            if (!packs.has(identity.languageId)) {
                packs.set(identity.languageId, freshPackRecord(identity, "DEFAULT"));
            }
        });
        return listPacks();
    }

    // -----------------------------------------------------------------
    // 2b. OPTIONAL PACKS (RP-035 Phase 1 correction)
    //     Additive only. Never touches DEFAULT_IDENTITIES or the 17
    //     default records. Still the SAME registry/Map — no
    //     second registry is created. Registration here creates a
    //     container identical in shape/state to a default pack (still
    //     REGISTERED/NOT_READY, never AVAILABLE); actual acquisition/
    //     governance flow lives in the separate discovery module.
    // -----------------------------------------------------------------

    function isDefaultIdentity(languageId) {
        return DEFAULT_IDENTITIES.some((d) => d.languageId === languageId);
    }

    function registerOptionalPack(identity) {
        const id = String((identity && identity.languageId) || "").toLowerCase();
        if (!id) return { ok: false, reason: "LANGUAGE_ID_REQUIRED" };
        if (isDefaultIdentity(id)) return { ok: false, reason: "COLLIDES_WITH_DEFAULT_IDENTITY" };
        if (packs.has(id)) return { ok: false, reason: "ALREADY_REGISTERED", pack: clonePack(packs.get(id)) };
        if (!identity.name) return { ok: false, reason: "NAME_REQUIRED" };
        const record = freshPackRecord({ languageId: id, name: identity.name, nativeName: identity.nativeName || identity.name, iso: identity.iso || null }, "OPTIONAL");
        packs.set(id, record);
        return { ok: true, pack: clonePack(record) };
    }

    function listOptionalPacks() {
        return listPacks().filter((p) => p.origin === "OPTIONAL");
    }

    function listDefaultPacks() {
        return listPacks().filter((p) => p.origin === "DEFAULT");
    }

    function getPack(languageId) {
        const p = packs.get(String(languageId || "").toLowerCase());
        return p ? clonePack(p) : null;
    }

    function listPacks() {
        return Array.from(packs.values()).map(clonePack);
    }

    function clonePack(p) {
        return JSON.parse(JSON.stringify(p));
    }

    // -----------------------------------------------------------------
    // 3. RULE 82 — promotion is always BLOCKED from this file
    // -----------------------------------------------------------------

    function requestPromotion(languageId /*, requestedState */) {
        const p = packs.get(String(languageId || "").toLowerCase());
        if (!p) {
            return { status: "BLOCKED", reason: "UNREGISTERED_LANGUAGE" };
        }
        // Compose the real Rule 82 gate if it exists (read-only). This
        // file never calls a mutator on it and never trusts its own
        // judgment above that gate's.
        const review = cozyOS() && cozyOS().Modules && cozyOS().Modules["cozy-knowledge-review"];
        let gate = null;
        if (review && review.api && typeof review.api.evaluateRule82Gate === "function") {
            gate = review.api.evaluateRule82Gate(languageId);
        }
        return {
            status: "BLOCKED",
            reason: "PACK_CREATION_IS_NOT_LANGUAGE_VERIFICATION",
            note: "RP-030 language packs are containers. Only Rule 82's own five-part gate (cozy-knowledge-review.js) can ever be consulted for promotion, and this file has no mutator that acts on its result. No language is promoted automatically.",
            rule82Gate: gate
        };
    }

    // -----------------------------------------------------------------
    // 4. GEOGRAPHY / DIALECTS — language != country != dialect
    // -----------------------------------------------------------------

    function registerRegionalContext(languageId, context) {
        const id = String(languageId || "").toLowerCase();
        const p = packs.get(id);
        if (!p) return { ok: false, reason: "UNREGISTERED_LANGUAGE" };
        const country = context && context.country ? String(context.country).toUpperCase() : null;
        const region = context && context.region ? String(context.region) : null;
        const dialect = context && context.dialect ? String(context.dialect) : null;
        if (!country) return { ok: false, reason: "COUNTRY_REQUIRED_AS_EVIDENCE" };

        if (p.geography.countries.indexOf(country) === -1) p.geography.countries.push(country);
        if (region && p.geography.regions.indexOf(region) === -1) p.geography.regions.push(region);
        if (dialect && p.dialects.indexOf(dialect) === -1) p.dialects.push(dialect);

        const key = [country, region || "", dialect || ""].join("|");
        if (!regionalContexts.has(id)) regionalContexts.set(id, new Set());
        regionalContexts.get(id).add(key);

        return { ok: true, contextKey: key, note: "Country is evidence, not proof of dialect." };
    }

    function listRegionalContexts(languageId) {
        const id = String(languageId || "").toLowerCase();
        return Array.from(regionalContexts.get(id) || []).map((key) => {
            const [country, region, dialect] = key.split("|");
            return { country, region: region || null, dialect: dialect || null };
        });
    }

    // -----------------------------------------------------------------
    // 5. PROVENANCE / LICENSING HELPERS
    // -----------------------------------------------------------------

    function buildProvenance(fields) {
        const f = fields || {};
        const sourceType = SOURCE_TYPES.indexOf(f.sourceType) !== -1 ? f.sourceType : "COMMUNITY";
        return {
            sourceType,
            sourceId: f.sourceId || null,
            language: f.languageId || null,
            region: f.region || null,
            dialect: f.dialect || null,
            contributor: f.contributorPseudonym || null,
            date: f.date || new Date().toISOString(),
            license: LICENSE_STATES.indexOf(f.license) !== -1 ? f.license : "LICENSE_UNKNOWN",
            validationState: "CANDIDATE",
            evidenceCount: 1
        };
    }

    // -----------------------------------------------------------------
    // 6. WORD/EXPRESSION-LEVEL RECORDS
    //    Same spelling never auto-merges. Merge key = language +
    //    region + dialect + meaning + provenance.sourceType.
    // -----------------------------------------------------------------

    function matchKeyFor(languageId, region, dialect, meaning, sourceType) {
        return [
            String(languageId || "").toLowerCase(),
            String(region || "").toLowerCase(),
            String(dialect || "").toLowerCase(),
            String(meaning || "").trim().toLowerCase(),
            String(sourceType || "").toUpperCase()
        ].join("::");
    }

    /**
     * submitExpression(fields)
     *   The single entry point for word/phrase-level community
     *   knowledge. Always routes through the real RP-029-C safety gate
     *   first (meaning-before-judgment). Never stores UNSAFE content.
     *   UNCERTAIN/HIGH_RISK go to the real quarantine store, not here.
     *   Only SAFE content becomes a candidate expression record, and
     *   only via RP-029-A's real ingestCommunitySubmission() when
     *   available — this file keeps its own local record purely as
     *   pack-scoped metadata (region/dialect/provenance/licensing),
     *   never as a second, competing source of truth for verification
     *   state.
     */
    function submitExpression(fields) {
        const f = fields || {};
        const languageId = String(f.languageId || "").toLowerCase();
        const p = packs.get(languageId);
        if (!p) return { status: "BLOCKED", reason: "UNREGISTERED_LANGUAGE" };

        // Oral-language support: audio may be present with no
        // orthography yet. Never invent spelling.
        const hasExpressionText = !!(f.expression && String(f.expression).trim());
        const hasAudio = !!f.audioReference;
        if (!hasExpressionText && !hasAudio) {
            return { status: "BLOCKED", reason: "NO_EXPRESSION_OR_AUDIO_EVIDENCE" };
        }
        const orthography = hasExpressionText ? "AVAILABLE" : "UNAVAILABLE";

        // Safety first.
        const gate = safetyGate();
        let safety = { classification: "SAFE", category: null, note: "Safety gate module not loaded — cannot classify. Failing closed by quarantine, not silent accept." };
        if (gate && typeof gate.classify === "function") {
            safety = gate.classify({
                expression: f.expression, meaning: f.meaning, translation: f.translation,
                language: languageId, contributionType: f.contributionType || (hasAudio ? "AUDIO_REFERENCE" : "TEXT"),
                audioReference: f.audioReference, documentReference: f.documentReference
            });
        } else {
            safety.classification = "UNCERTAIN";
        }

        if (safety.classification === "UNSAFE") {
            p.counts.rejected++;
            return { status: "REJECTED", safety };
        }
        if (safety.classification === "UNCERTAIN" || safety.classification === "HIGH_RISK") {
            let quarantineId = null;
            if (gate && typeof gate.quarantine === "function") {
                const q = gate.quarantine({
                    expression: f.expression, meaning: f.meaning, language: languageId,
                    contributionType: f.contributionType || "TEXT"
                }, safety, f.contributorPseudonym || null);
                quarantineId = q && q.id != null ? q.id : null;
            }
            p.counts.quarantined++;
            return { status: "QUARANTINED", safety, quarantineId };
        }

        // SAFE — build the pack-scoped record + provenance.
        const provenance = buildProvenance(Object.assign({}, f, { languageId }));
        if (provenance.license === "LICENSE_UNKNOWN") p.licensingProblems++;

        const meaning = f.meaning || null;
        const key = matchKeyFor(languageId, f.region, f.dialect, meaning, provenance.sourceType);
        if (matchIndex.has(key)) {
            // Independent additional evidence for an existing distinct
            // record — never a silent spelling-based merge.
            const recordId = matchIndex.get(key);
            const rec = expressionRecords.get(recordId);
            rec.evidenceCount++;
            rec.provenanceLog.push(provenance);
            if (ingestion() && typeof ingestion().confirmCandidate === "function" && rec.ingestionCandidateId) {
                ingestion().confirmCandidate(rec.ingestionCandidateId, f.contributorPseudonym || "anonymous");
            }
            p.counts.submitted++;
            persistExpressionBestEffort(recordId, rec);
            return { status: "EVIDENCE_ADDED", recordId, evidenceCount: rec.evidenceCount, evidenceBand: evidenceBand(rec.evidenceCount) };
        }

        let ingestionCandidateId = null;
        if (ingestion() && typeof ingestion().ingestCommunitySubmission === "function") {
            try {
                const result = ingestion().ingestCommunitySubmission({
                    language: languageId, expression: f.expression, meaning: f.meaning,
                    translation: f.translation, contributorId: f.contributorPseudonym || "anonymous",
                    contributionType: f.contributionType || "TEXT"
                });
                ingestionCandidateId = result && result.id != null ? result.id : (result && result.candidateId != null ? result.candidateId : null);
            } catch (e) {
                ingestionCandidateId = null; // compose best-effort; never fabricate success
            }
        }

        const recordId = "expr-" + (nextRecordId++);
        expressionRecords.set(recordId, {
            recordId, languageId, region: f.region || null, dialect: f.dialect || null,
            expression: hasExpressionText ? f.expression : null,
            literalMeaning: f.literalMeaning || null,
            meaning, context: f.context || null,
            orthography, audioReference: f.audioReference || null,
            evidenceCount: 1, provenanceLog: [provenance],
            licensing: provenance.license,
            validationState: "CANDIDATE",
            ingestionCandidateId,
            confidence: {
                languageConfidence: numOrNull(f.languageConfidence),
                regionConfidence: numOrNull(f.regionConfidence),
                dialectConfidence: numOrNull(f.dialectConfidence),
                meaningConfidence: numOrNull(f.meaningConfidence),
                pronunciationConfidence: numOrNull(f.pronunciationConfidence),
                translationConfidence: numOrNull(f.translationConfidence)
            }
        });
        matchIndex.set(key, recordId);
        p.counts.submitted++;
        p.resourceState = p.resourceState === "NOT_READY" ? "COMMUNITY_BUILDING" : p.resourceState;

        persistExpressionBestEffort(recordId, expressionRecords.get(recordId));
        return { status: "CANDIDATE_CREATED", recordId, evidenceBand: "CANDIDATE" };
    }

    function numOrNull(v) { return typeof v === "number" ? v : null; }

    // RP-035 Phase 2 disclosure (not a new confidence system — a label
    // on the one that already existed here in RP-030). This registry
    // has always carried TWO different confidence concepts that must
    // not be conflated:
    //   1. evidenceBand(count) — a qualitative, count-derived band
    //      (NONE/CANDIDATE/EMERGING/STRONG/HIGHLY_VALIDATED) computed
    //      from real, counted independent evidence.
    //   2. record.confidence.{languageConfidence,...} — per-field
    //      numbers a CALLER may optionally supply at submission time
    //      (numOrNull passes through only what was given; nothing is
    //      computed or invented here). These are caller-declared
    //      heuristic estimates, not a validated system score, and Phase
    //      2's UI/API layer must present them as such — never as
    //      "N% correct" — per this repository's no-fabricated-
    //      confidence rule.
    const CONFIDENCE_FIELD_CLASSIFICATION = Object.freeze({
        type: "CALLER_SUPPLIED_HEURISTIC_ESTIMATE",
        computedBy: "NONE — passed through as-is from the submitExpression() caller, never calculated by this file",
        distinctFrom: "evidenceBand(), which IS computed here from real counted evidence",
        presentationRule: "Never display as a guaranteed accuracy percentage; label as a caller-supplied estimate if shown at all."
    });

    function getExpression(recordId) {
        const r = expressionRecords.get(recordId);
        return r ? JSON.parse(JSON.stringify(r)) : null;
    }

    function listExpressions(filter) {
        const f = filter || {};
        return Array.from(expressionRecords.values())
            .filter((r) => !f.languageId || r.languageId === String(f.languageId).toLowerCase())
            .filter((r) => !f.region || r.region === f.region)
            .filter((r) => !f.dialect || r.dialect === f.dialect)
            .map((r) => JSON.parse(JSON.stringify(r)));
    }

    // -----------------------------------------------------------------
    // 6.5 EXPRESSION PERSISTENCE (RP-035 Phase 2 addition)
    //    submitExpression()'s own return contract stays synchronous and
    //    unchanged (existing callers/tests are untouched). Persistence
    //    is a best-effort, fire-and-forget side effect on top — exactly
    //    the "queued, never blocking, never fabricating success" pattern
    //    already used by createRealBackend() elsewhere in this file. If
    //    no adapter is bound (the default), this is a silent no-op and
    //    behavior is identical to before this addition.
    // -----------------------------------------------------------------

    function bindExpressionStorage(adapter) {
        // adapter: {get,set,remove,list} — same shape createStorageAdapter()
        // already produces / cozy-language-pack-persistence.js's
        // createRealBackend() already adapts core/storage.js to. Passing
        // null/undefined unbinds (returns to pure in-memory), never throws.
        expressionStorageAdapter = adapter || null;
        return { bound: !!expressionStorageAdapter };
    }

    function getExpressionStorageState() {
        return expressionStorageAdapter ? "PERSISTENT_CAPABLE" : "IN_MEMORY_ONLY";
    }

    function persistExpressionBestEffort(recordId, record) {
        if (!expressionStorageAdapter || typeof expressionStorageAdapter.set !== "function") return;
        try {
            const snapshot = JSON.parse(JSON.stringify(record));
            const result = expressionStorageAdapter.set(recordId, snapshot);
            // Never let a rejected/failed persistence write surface as an
            // unhandled rejection or change submitExpression()'s honest,
            // already-returned in-memory result.
            if (result && typeof result.catch === "function") result.catch(() => {});
        } catch (_err) {
            // Best-effort only — in-memory state (the source of truth for
            // this call) is already correct regardless.
        }
    }

    /**
     * restoreExpressions(records)
     *   Rehydrates expressionRecords/matchIndex/nextRecordId from
     *   previously-persisted records (e.g. loaded from real storage on
     *   app start). This is a REPLAY of already-accepted knowledge, not
     *   a new submission — it does NOT re-run the safety gate or
     *   ingestion pipeline (those already ran before this record was
     *   persisted the first time) and does NOT re-increment any pack's
     *   submitted/quarantined counters. Records with a recordId already
     *   present in memory are skipped (never overwritten) so this is
     *   always safe to call more than once.
     */
    function restoreExpressions(records) {
        const list = Array.isArray(records) ? records : [];
        let restoredCount = 0;
        let skippedCount = 0;
        let highestSeen = 0;
        list.forEach((rec) => {
            if (!rec || !rec.recordId || !rec.languageId) { skippedCount++; return; }
            if (expressionRecords.has(rec.recordId)) { skippedCount++; return; }
            expressionRecords.set(rec.recordId, rec);
            const key = matchKeyFor(rec.languageId, rec.region, rec.dialect, rec.meaning, rec.provenanceLog && rec.provenanceLog[0] && rec.provenanceLog[0].sourceType);
            if (!matchIndex.has(key)) matchIndex.set(key, rec.recordId);
            const n = Number(String(rec.recordId).replace("expr-", ""));
            if (!isNaN(n) && n > highestSeen) highestSeen = n;
            restoredCount++;
        });
        if (highestSeen >= nextRecordId) nextRecordId = highestSeen + 1;
        return { restoredCount, skippedCount, totalInMemory: expressionRecords.size };
    }

    // -----------------------------------------------------------------
    // 7. STORAGE ABSTRACTION (offline-first, medium-agnostic)
    //    Never claims SYNCED when only QUEUED exists.
    // -----------------------------------------------------------------

    function createStorageAdapter(backend) {
        // backend: optional {get,set,remove,list} — defaults to an
        // in-memory Map so this works identically offline. A real
        // phone/SD-card/network backend can be swapped in later
        // without this file (or callers) changing.
        const mem = new Map();
        const impl = backend || {
            get: (k) => (mem.has(k) ? mem.get(k) : null),
            set: (k, v) => { mem.set(k, v); return true; },
            remove: (k) => mem.delete(k),
            list: (prefix) => Array.from(mem.keys()).filter((k) => !prefix || k.indexOf(prefix) === 0)
        };
        const queue = [];
        return {
            get: impl.get, set: impl.set, remove: impl.remove, list: impl.list,
            queueForSync(item) { queue.push({ item, status: "QUEUED", queuedAt: new Date().toISOString() }); return { status: "QUEUED" }; },
            listQueue() { return queue.map((q) => Object.assign({}, q)); },
            // Deliberately no markSynced() default implementation that
            // fabricates success — a real transport must call this.
            markSynced(index) {
                if (queue[index]) queue[index].status = "SYNCED";
                return queue[index] ? { status: "SYNCED" } : { status: "NOT_FOUND" };
            }
        };
    }

    // -----------------------------------------------------------------
    // 8. AUTOMATIC ROUTING (foundation only — heuristic, disclosed)
    // -----------------------------------------------------------------

    function detectLanguagePack(evidence) {
        const e = evidence || {};
        const languageId = e.languageId ? String(e.languageId).toLowerCase() : null;
        const country = e.country ? String(e.country).toUpperCase() : null;
        const dialect = e.dialect || null;

        if (!languageId || !packs.has(languageId)) {
            return { matched: false, reason: "NO_LANGUAGE_EVIDENCE_OR_UNREGISTERED", confidence: { language: 0 } };
        }
        const contexts = listRegionalContexts(languageId);
        const contextMatch = country ? contexts.find((c) => c.country === country) : null;

        // Distinct regional variants are never merged automatically —
        // Tanzanian Hausa stays distinct from Nigerian Hausa even
        // though both resolve to the same languageId here.
        return {
            matched: true,
            languageId,
            region: contextMatch ? (contextMatch.region || country) : (country || null),
            dialect: contextMatch ? contextMatch.dialect : dialect,
            confidence: {
                language: e.languageConfidence != null ? e.languageConfidence : 0.5,
                region: contextMatch ? 0.7 : (country ? 0.3 : 0),
                dialect: contextMatch && contextMatch.dialect ? 0.6 : 0
            },
            note: "Foundation heuristic only — no ML language-ID/ASR backend exists in this repository."
        };
    }

    // -----------------------------------------------------------------
    // 9. ADMIN DASHBOARD FOUNDATION DATA
    //    Distinguishes SUBMITTED vs VALIDATED. Never reports "most
    //    used" — no usage telemetry exists.
    // -----------------------------------------------------------------

    function getDashboardSnapshot() {
        const rows = listPacks().map((p) => {
            const exprs = listExpressions({ languageId: p.identity.languageId });
            const validated = exprs.filter((r) => r.validationState === "VALIDATED").length;
            return {
                languageId: p.identity.languageId,
                name: p.identity.name,
                status: p.status,
                resourceState: p.resourceState,
                submitted: p.counts.submitted,
                validated,
                quarantined: p.counts.quarantined,
                rejected: p.counts.rejected,
                licensingProblems: p.licensingProblems,
                regionalContexts: listRegionalContexts(p.identity.languageId).length,
                mostUsed: "NOT_AVAILABLE_NO_TELEMETRY"
            };
        });
        return {
            packs: rows,
            mostSubmitted: rows.slice().sort((a, b) => b.submitted - a.submitted),
            mostValidated: rows.slice().sort((a, b) => b.validated - a.validated),
            note: "mostUsed is intentionally NOT_AVAILABLE_NO_TELEMETRY — no usage-tracking engine exists in this repository."
        };
    }

    // -----------------------------------------------------------------
    // 10. PUBLIC API
    // -----------------------------------------------------------------

    registerDefaultPacks();

    const api = Object.freeze({
        VERSION,
        PACK_STATES,
        LICENSE_STATES,
        SOURCE_TYPES,
        DEFAULT_IDENTITIES,
        registerDefaultPacks,
        registerOptionalPack,
        listOptionalPacks,
        listDefaultPacks,
        getPack,
        listPacks,
        getLanguageCapabilities,
        getOnlineProviderStatus,
        requestPromotion,
        registerRegionalContext,
        listRegionalContexts,
        buildProvenance,
        submitExpression,
        getExpression,
        listExpressions,
        bindExpressionStorage,
        getExpressionStorageState,
        restoreExpressions,
        createStorageAdapter,
        detectLanguagePack,
        getDashboardSnapshot,
        evidenceBand,
        CONFIDENCE_FIELD_CLASSIFICATION
    });

    root.window.CozyOS = root.window.CozyOS || {};
    root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
    root.window.CozyOS.CozyLanguagePacks = api;
    root.window.CozyOS.Modules["cozy-language-pack-registry"] = Object.freeze({ version: VERSION, api });
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
