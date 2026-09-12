/**
 * CozyOS — Community Contribution + Knowledge Validation Engine
 * File Reference: core/modules/intelligence/knowledge/cozy-knowledge-community.js
 * Repair: RP-029-B (Phase 2 of the Community Language & Living Knowledge
 *         Engine, continuing directly from RP-029-A's ingestion pipeline)
 *
 * OWNERSHIP
 *   New, additive, standalone file. Does NOT rewrite or duplicate
 *   core/modules/intelligence/knowledge/cozy-knowledge-ingestion.js
 *   (RP-029-A) — that file is loaded, read, and composed via its real,
 *   frozen public API (window.CozyOS.CozyKnowledgeIngestion) only:
 *   ingestCommunitySubmission(), confirmCandidate(), contributeToCommunity(),
 *   contributeToPublic(), getCandidate(), listCandidates(), searchCandidates().
 *   RP-029-A's file is not modified by this repair; its own 26/26 test
 *   suite is re-run, unmodified, as part of this repair's regression pass.
 *
 * WHAT THIS FILE ADDS ON TOP OF RP-029-A
 *   RP-029-A already lands every submission as a private CANDIDATE and
 *   already counts independent confirmations by distinct contributorId
 *   (PARTIALLY_VERIFIED at 5). What it does not yet have is a review
 *   *workflow* (UNDER_REVIEW/DISPUTED/REJECTED/UNRESOLVED are legal
 *   values in its own VERIFICATION_STATES enum, but nothing ever sets
 *   DISPUTED/REJECTED), a stricter independence check that looks past
 *   contributorId to shared source/document/website provenance, labeled
 *   (not single-number) confidence reporting, contribution-type
 *   metadata, and a read-only Rule 82 compliance reporter. Those gaps
 *   are this file's whole scope.
 *
 *   Candidates created via RP-029-A remain RP-029-A's own objects
 *   (obtained by live reference via its real getCandidate()). This file
 *   attaches exactly one new, namespaced property to those live objects
 *   — candidate.communityExtensions — so RP-029-A's own fields
 *   (verificationState, visibility, confidence, independentConfirmations,
 *   language, provenance, etc.) are never shadowed, renamed, or
 *   recomputed by a second, parallel store. The one exception, disclosed
 *   here explicitly: disputeContribution()/rejectContribution() below
 *   set candidate.verificationState directly to "DISPUTED"/"REJECTED" —
 *   both are RP-029-A's own pre-existing, already-frozen enum values
 *   that RP-029-A itself defines but never reaches; no other code path
 *   sets them, so there is no collision, and RP-029-A's tests (which
 *   never exercise those two values) are unaffected.
 *
 * OUT OF SCOPE (do not claim any of this is implemented here)
 *   Real speech recognition, audio/video understanding, lip reading,
 *   machine-learning inference of any kind, PDF intelligence beyond
 *   RP-029-A's existing delegated-extractor pattern, automatic
 *   synchronization over a real network, and automatic promotion of any
 *   language's registry state. See Rule 82 section below.
 *
 * RULE 82 (docs/builder/rules/27-language-availability-verification-rule.md)
 *   This file never calls, wraps, or exposes any mutator for
 *   window.CozyOS.CozyLanguageRegistry — that registry does not even
 *   expose a state-mutating function (confirmed by inspection before
 *   writing this file: getLanguage/listLanguages/isAvailable/
 *   suggestFromCountry/resolveLanguage are all read-only). This file's
 *   only interaction with it is getRule82Status(), a read-only reporter
 *   composing getLanguage()/isAvailable(), used to make the boundary
 *   between "community knowledge exists" and "language is runtime-
 *   available" visible and auditable — never to cross it.
 *
 * PRIVACY
 *   Every contribution inherits RP-029-A's own PRIVATE-by-default
 *   visibility (hardcoded in RP-029-A's candidate constructor — this
 *   file never overrides it). promoteVisibility() below is the only
 *   path to COMMUNITY/PUBLIC, and is itself a thin wrapper over
 *   RP-029-A's own contributeToCommunity()/contributeToPublic() — no
 *   new promotion mechanism is invented. Contributor identifiers are
 *   pseudonymized (see pseudonymId() below) before being stored in any
 *   field this file exposes through a shallow-copy read accessor.
 *
 * OFFLINE / SYNC
 *   This module is memory-only, exactly like RP-029-A (see RP-029-A's
 *   own header — "Local Knowledge Memory... cleared on reload"). No
 *   real network synchronization exists anywhere in this repository, so
 *   none is claimed here. getSyncStatus() honestly always reports
 *   SYNC_PENDING; reconcileConflict() is a pure, real function that
 *   preserves both versions of a disputed record for a future,
 *   separately-governed sync engine to resolve — it does not itself
 *   perform any network operation.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["cozy-knowledge-community"]) return;

    const VERSION = "1.0.0";

    // -----------------------------------------------------------------
    // Real dependency check — never silently substitutes its own store
    // if RP-029-A is missing; every public function below fails honestly
    // instead.
    // -----------------------------------------------------------------
    function ingestion() {
        return (window.CozyOS && window.CozyOS.CozyKnowledgeIngestion) || null;
    }

    function nowISO() { return new Date().toISOString(); }

    /** djb2 — same disclosed, NON-cryptographic pattern RP-029-A already
     *  uses for contentHash (see that file's header) — used here only to
     *  pseudonymize a contributor id before it is exposed through any
     *  read accessor. Not offered as a security/anonymity guarantee
     *  against a determined adversary; it is a disclosed, deterministic
     *  de-identification of raw ids in read-only output. */
    function pseudonymId(raw) {
        const str = String(raw == null ? "" : raw);
        if (!str) return null;
        let hash = 5381;
        for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
        return "contributor:" + hash.toString(16);
    }

    // -----------------------------------------------------------------
    // Enums (this file's own, additive — never edits RP-029-A's frozen
    // SOURCE_TYPES/VISIBILITY_STATES/VERIFICATION_STATES).
    // -----------------------------------------------------------------

    const CONTRIBUTION_TYPES = Object.freeze([
        "WORD", "PHRASE", "TRANSLATION", "MEANING", "CONTEXT",
        "DIALECT_VARIATION", "PRONUNCIATION", "CULTURAL_CONTEXT"
    ]);

    // Workflow dimension, deliberately separate from RP-029-A's own
    // verificationState (see file header). SUBMITTED is intentionally
    // absent here: RP-029-A's ingestCommunitySubmission() already
    // collapses "submitted" and "candidate created" into one atomic
    // step, so tracking a distinct stored SUBMITTED state would just be
    // a fabricated extra step with no real underlying event to record.
    const REVIEW_STATES = Object.freeze([
        "CANDIDATE", "UNDER_REVIEW", "CONFIRMED", "DISPUTED", "REJECTED", "UNRESOLVED"
    ]);

    // Confidence-guidance tiers per the governing spec (§9). Purely
    // descriptive metadata — never auto-applied to verificationState,
    // reviewState, or visibility. A real reviewer decision (confirmReview()
    // below) is always required for reviewState to become CONFIRMED,
    // regardless of tier.
    function tierForCount(n) {
        if (n >= 100) return "HIGHLY_VALIDATED";
        if (n >= 20) return "STRONG";
        if (n >= 5) return "EMERGING";
        if (n >= 1) return "CANDIDATE";
        return "NONE";
    }

    /** Labels a single 0..1 confidence number honestly — including the
     *  case where it was never set (0/undefined -> NOT_VERIFIED, distinct
     *  from a real, measured LOW). Never collapses multiple dimensions
     *  into one score (see describeConfidence() below and spec §11). */
    function confidenceLabel(value) {
        if (value === null || value === undefined) return "NOT_VERIFIED";
        if (value <= 0) return "NOT_VERIFIED";
        if (value < 0.34) return "LOW";
        if (value < 0.7) return "MEDIUM";
        return "HIGH";
    }

    // -----------------------------------------------------------------
    // Internal helper — every public function below goes through this
    // for a live RP-029-A candidate + its (possibly not-yet-created)
    // communityExtensions side-record.
    // -----------------------------------------------------------------
    function getLiveCandidate(candidateId) {
        const ing = ingestion();
        if (!ing) return null;
        return ing.getCandidate(candidateId);
    }

    function ensureExtensions(candidate) {
        if (!candidate.communityExtensions) {
            candidate.communityExtensions = {
                contributionType: null,
                pronunciation: null,
                orthography: null,
                audioReference: null,
                documentReference: null,
                variant: null,
                reviewState: "CANDIDATE",
                reviewHistory: [],
                confirmations: [],           // [{contributorPseudId, sourceId, sourceType, independent, at}]
                independentConfirmationCount: 0,
                disputes: [],                // [{contributorPseudId, reason, interpretation, at}]
                syncState: "SYNC_PENDING"
            };
        }
        return candidate.communityExtensions;
    }

    // -----------------------------------------------------------------
    // 1. CONTRIBUTION
    // -----------------------------------------------------------------

    /**
     * submitContribution(input)
     *   Composes RP-029-A's real ingestCommunitySubmission() for the
     *   actual candidate creation/dedup/language-ID/privacy-default
     *   logic — none of that is reimplemented here. Adds contribution-
     *   type validation and the community-specific fields (pronunciation/
     *   orthography/audioReference/documentReference/variant) as a
     *   namespaced extension on the resulting live candidate.
     */
    function submitContribution(input) {
        const ing = ingestion();
        if (!ing) return { status: "REJECTED", reason: "RP-029-A ingestion pipeline (CozyKnowledgeIngestion) is not loaded.", record: null };

        const opts = input || {};
        if (!opts.contributionType || CONTRIBUTION_TYPES.indexOf(opts.contributionType) === -1) {
            return { status: "REJECTED", reason: `contributionType is required and must be one of: ${CONTRIBUTION_TYPES.join(", ")}.`, record: null };
        }
        if (!opts.statement || typeof opts.statement !== "string" || !opts.statement.trim()) {
            return { status: "REJECTED", reason: "A statement is required.", record: null };
        }

        const meta = {
            meaning: opts.meaning || null,
            translation: opts.translation || null,
            context: opts.context || null,
            language: opts.language || null,
            region: opts.region || null,
            community: opts.community || null,
            dialect: opts.dialect || null,
            subject: opts.contributionType
        };

        const result = ing.ingestCommunitySubmission({
            statement: opts.statement,
            contributorId: opts.contributorId || null,
            meta
        });

        if (result.status !== "CANDIDATE_CREATED" || !result.candidate) {
            // Honest pass-through — REJECTED / SOURCE_UNAVAILABLE / DUPLICATE
            // are RP-029-A's own real statuses, not reinterpreted here.
            return { status: result.status, reason: result.reason, record: result.candidate ? toRecord(result.candidate) : null };
        }

        const candidate = result.candidate;
        const ext = ensureExtensions(candidate);
        ext.contributionType = opts.contributionType;
        ext.pronunciation = opts.pronunciation || null;
        ext.orthography = opts.orthography || null;
        ext.audioReference = opts.audioReference || null;
        ext.documentReference = opts.documentReference || null;
        ext.variant = opts.variant || null;
        ext.reviewHistory.push({ event: "SUBMITTED", at: nowISO(), contributorPseudId: pseudonymId(opts.contributorId) });

        // translation is not a field RP-029-A's candidate carries — store
        // it in the extension, never invented onto RP-029-A's own object.
        ext.translation = opts.translation || null;

        // Preserve translation/meaning confidence as their own dimensions
        // (RP-029-A already tracks meaningConfidence/translationConfidence/
        // dialectConfidence/sourceConfidence/communityConfidence on
        // candidate.confidence — this only adds the pronunciation
        // dimension the spec calls for, honestly starting at NOT_VERIFIED
        // unless real pronunciation evidence was actually supplied).
        candidate.confidence.pronunciationConfidence = opts.pronunciation ? 0.3 : 0;

        return { status: "SUBMITTED", reason: null, record: toRecord(candidate) };
    }

    // -----------------------------------------------------------------
    // 2. REVIEW LIFECYCLE
    // -----------------------------------------------------------------

    function beginReview(candidateId, opts) {
        const candidate = getLiveCandidate(candidateId);
        if (!candidate) return { status: "NOT_FOUND", record: null };
        const ext = ensureExtensions(candidate);
        if (ext.reviewState !== "CANDIDATE") {
            return { status: "REJECTED", reason: `Cannot begin review from state "${ext.reviewState}".`, record: toRecord(candidate) };
        }
        ext.reviewState = "UNDER_REVIEW";
        ext.reviewHistory.push({ event: "REVIEW_STARTED", at: nowISO(), reviewerPseudId: pseudonymId((opts || {}).reviewerId) });
        return { status: "UNDER_REVIEW", record: toRecord(candidate) };
    }

    /**
     * confirmReview(candidateId, {reviewerId})
     *   The deliberate, explicit action that moves reviewState to
     *   CONFIRMED. Never automatic on reaching a numeric confirmation
     *   tier (see tierForCount() above and spec §9's "confidence
     *   guidance, not permission to blindly promote"). Requires at
     *   least one real independent confirmation to exist first.
     */
    function confirmReview(candidateId, opts) {
        const candidate = getLiveCandidate(candidateId);
        if (!candidate) return { status: "NOT_FOUND", record: null };
        const ext = ensureExtensions(candidate);
        if (ext.independentConfirmationCount < 1) {
            return { status: "REJECTED", reason: "Cannot confirm review with zero independent confirmations.", record: toRecord(candidate) };
        }
        if (ext.reviewState === "DISPUTED" || ext.reviewState === "REJECTED") {
            return { status: "REJECTED", reason: `Cannot confirm review from state "${ext.reviewState}" - resolve the dispute/rejection first.`, record: toRecord(candidate) };
        }
        ext.reviewState = "CONFIRMED";
        ext.reviewHistory.push({ event: "CONFIRMED", at: nowISO(), reviewerPseudId: pseudonymId((opts || {}).reviewerId) });
        return { status: "CONFIRMED", record: toRecord(candidate) };
    }

    /**
     * disputeContribution(candidateId, {contributorId, reason, interpretation})
     *   Preserves disagreement rather than erasing it (spec §12) — each
     *   dispute is appended, never overwrites a prior one. Also sets
     *   RP-029-A's own candidate.verificationState to "DISPUTED" - a
     *   pre-existing, already-legal value in RP-029-A's own enum (see
     *   file header for why this is safe).
     */
    function disputeContribution(candidateId, input) {
        const candidate = getLiveCandidate(candidateId);
        if (!candidate) return { status: "NOT_FOUND", record: null };
        const opts = input || {};
        if (!opts.reason) return { status: "REJECTED", reason: "A reason is required to record a dispute.", record: toRecord(candidate) };
        const ext = ensureExtensions(candidate);
        ext.disputes.push({
            contributorPseudId: pseudonymId(opts.contributorId),
            reason: opts.reason,
            interpretation: opts.interpretation || null,
            at: nowISO()
        });
        ext.reviewState = "DISPUTED";
        candidate.verificationState = "DISPUTED";
        candidate.updatedAt = nowISO();
        ext.reviewHistory.push({ event: "DISPUTED", at: nowISO(), contributorPseudId: pseudonymId(opts.contributorId) });
        return { status: "DISPUTED", record: toRecord(candidate) };
    }

    function rejectContribution(candidateId, input) {
        const candidate = getLiveCandidate(candidateId);
        if (!candidate) return { status: "NOT_FOUND", record: null };
        const opts = input || {};
        if (!opts.reason) return { status: "REJECTED", reason: "A reason is required to reject a contribution.", record: toRecord(candidate) };
        const ext = ensureExtensions(candidate);
        ext.reviewState = "REJECTED";
        candidate.verificationState = "REJECTED";
        candidate.updatedAt = nowISO();
        ext.reviewHistory.push({ event: "REJECTED", at: nowISO(), reviewerPseudId: pseudonymId(opts.reviewerId), reason: opts.reason });
        return { status: "REJECTED", record: toRecord(candidate) };
    }

    /** markUnresolved() — for when evidence is genuinely insufficient
     *  either way (spec §4: "do not force every submission into
     *  confirmed/rejected"). Deliberately does NOT touch RP-029-A's own
     *  verificationState, since UNRESOLVED is not one of its values and
     *  the underlying candidate is not being rejected — only the
     *  community review workflow is marked as inconclusive. */
    function markUnresolved(candidateId, input) {
        const candidate = getLiveCandidate(candidateId);
        if (!candidate) return { status: "NOT_FOUND", record: null };
        const opts = input || {};
        const ext = ensureExtensions(candidate);
        ext.reviewState = "UNRESOLVED";
        ext.reviewHistory.push({ event: "UNRESOLVED", at: nowISO(), reviewerPseudId: pseudonymId(opts.reviewerId), reason: opts.reason || null });
        return { status: "UNRESOLVED", record: toRecord(candidate) };
    }

    // -----------------------------------------------------------------
    // 3. INDEPENDENT CONFIRMATION (composes, then adds a stricter check)
    // -----------------------------------------------------------------

    /**
     * addIndependentConfirmation(candidateId, {contributorId, sourceId, sourceType})
     *   Step 1 reuses RP-029-A's own, real confirmCandidate() — the
     *   actual dedup-by-contributorId and PARTIALLY_VERIFIED-at-5 logic
     *   is not reimplemented here. Step 2 (new in RP-029-B) additionally
     *   checks the supplied sourceId/sourceType against every prior
     *   confirmation already recorded as independent for this candidate:
     *   if this confirmation shares a non-null sourceId with one already
     *   counted, it is honestly recorded as NOT independent
     *   (INDEPENDENCE_UNVERIFIED) and does not increase this file's own
     *   independentConfirmationCount, even though RP-029-A's own,
     *   contributor-only counter already incremented. This is the
     *   "same document/website/source chain must not inflate confidence"
     *   rule (spec §10) that RP-029-A's contributor-only dedup cannot by
     *   itself detect.
     */
    function addIndependentConfirmation(candidateId, input) {
        const ing = ingestion();
        if (!ing) return { status: "REJECTED", reason: "RP-029-A ingestion pipeline is not loaded.", record: null };
        const opts = input || {};
        if (!opts.contributorId) return { status: "REJECTED", reason: "A contributorId is required to confirm.", record: null };

        const base = ing.confirmCandidate(candidateId, opts.contributorId);
        if (base.status === "NOT_FOUND") return { status: "NOT_FOUND", record: null };
        if (base.status === "REJECTED") return { status: "REJECTED", reason: base.reason, record: null };

        const candidate = base.candidate;
        const ext = ensureExtensions(candidate);

        if (base.status === "ALREADY_COUNTED") {
            return { status: "ALREADY_COUNTED", reason: "This contributor already confirmed this candidate.", record: toRecord(candidate) };
        }

        // base.status === "CONFIRMED" - a genuinely new contributor by
        // RP-029-A's own dedup. Now apply the stricter, source-aware check.
        const sourceId = opts.sourceId || null;
        const collision = sourceId && ext.confirmations.some((c) => c.independent && c.sourceId === sourceId);

        const record = {
            contributorPseudId: pseudonymId(opts.contributorId),
            sourceId: sourceId,
            sourceType: opts.sourceType || null,
            independent: !collision,
            at: nowISO()
        };
        ext.confirmations.push(record);

        if (collision) {
            return {
                status: "INDEPENDENCE_UNVERIFIED",
                reason: "This confirmation shares a source with an already-counted confirmation and was not counted as independent.",
                record: toRecord(candidate)
            };
        }

        ext.independentConfirmationCount = ext.confirmations.filter((c) => c.independent).length;
        candidate.updatedAt = nowISO();
        return { status: "CONFIRMED", record: toRecord(candidate) };
    }

    // -----------------------------------------------------------------
    // 4. VISIBILITY / PUBLIC PROMOTION (thin wrapper, no new mechanism)
    // -----------------------------------------------------------------

    /**
     * promoteVisibility(candidateId, target)
     *   target: "COMMUNITY" | "PUBLIC". Delegates the actual state
     *   change to RP-029-A's own contributeToCommunity()/
     *   contributeToPublic() - this function adds only the DISPUTED
     *   guard the spec requires (§12) before allowing PUBLIC, plus an
     *   audit entry in reviewHistory.
     */
    function promoteVisibility(candidateId, target) {
        const ing = ingestion();
        if (!ing) return { status: "REJECTED", reason: "RP-029-A ingestion pipeline is not loaded.", record: null };
        const candidate = getLiveCandidate(candidateId);
        if (!candidate) return { status: "NOT_FOUND", record: null };
        const ext = ensureExtensions(candidate);

        if (target === "PUBLIC" && ext.reviewState === "DISPUTED") {
            return { status: "REJECTED", reason: "A disputed candidate cannot be promoted to PUBLIC until the dispute is resolved.", record: toRecord(candidate) };
        }

        let result;
        if (target === "COMMUNITY") result = ing.contributeToCommunity(candidateId);
        else if (target === "PUBLIC") result = ing.contributeToPublic(candidateId);
        else return { status: "REJECTED", reason: 'target must be "COMMUNITY" or "PUBLIC".', record: toRecord(candidate) };

        if (result.status === "UPDATED") {
            ext.reviewHistory.push({ event: "VISIBILITY_" + target, at: nowISO() });
        }
        return { status: result.status, reason: result.reason || null, record: toRecord(candidate) };
    }

    // -----------------------------------------------------------------
    // 5. CONFIDENCE REPORTING (labeled, multi-dimension — never one score)
    // -----------------------------------------------------------------

    function describeConfidence(candidateId) {
        const candidate = getLiveCandidate(candidateId);
        if (!candidate) return null;
        const c = candidate.confidence || {};
        return {
            meaning: confidenceLabel(c.meaningConfidence),
            translation: confidenceLabel(c.translationConfidence),
            dialect: confidenceLabel(c.dialectConfidence),
            pronunciation: confidenceLabel(c.pronunciationConfidence),
            community: confidenceLabel(c.communityConfidence),
            source: confidenceLabel(c.sourceConfidence),
            raw: Object.assign({}, c)
        };
    }

    // -----------------------------------------------------------------
    // 6. RULE 82 (read-only reporter — never a mutation path)
    // -----------------------------------------------------------------

    function getRule82Status(languageCode) {
        const registry = window.CozyOS && window.CozyOS.CozyLanguageRegistry;
        const ing = ingestion();
        const communityCandidateCount = ing
            ? ing.listCandidates({ language: languageCode }).length
            : 0;
        if (!registry || typeof registry.getLanguage !== "function") {
            return {
                languageCode, registryChecked: false, registryState: null,
                communityKnowledgeCandidates: communityCandidateCount,
                note: "CozyLanguageRegistry is not loaded - registry state unknown. Community validation cannot change language availability (Rule 82) regardless."
            };
        }
        const lang = registry.getLanguage(languageCode);
        return {
            languageCode,
            registryChecked: true,
            registryState: lang ? lang.state : "UNREGISTERED",
            communityKnowledgeCandidates: communityCandidateCount,
            note: "Community knowledge volume is a separate metric from runtime language availability (Rule 82 / spec §27). This function never writes to the language registry - it has no mutator to call."
        };
    }

    // -----------------------------------------------------------------
    // 7. OFFLINE / SYNC DATA MODEL (honest placeholders only)
    // -----------------------------------------------------------------

    function getSyncStatus(candidateId) {
        const candidate = getLiveCandidate(candidateId);
        if (!candidate) return { status: "NOT_FOUND" };
        // Always SYNC_PENDING: no real network sync engine exists in this
        // repository (see file header). Never claim otherwise.
        return { status: ensureExtensions(candidate).syncState };
    }

    /**
     * reconcileConflict(localVersion, remoteVersion)
     *   Pure function - given two version snapshots of the same
     *   candidateId (e.g. from two offline devices), returns a real
     *   conflict report preserving both, never silently picking one
     *   (spec §29). Does not perform any network operation - this
     *   module has none to perform.
     */
    function reconcileConflict(localVersion, remoteVersion) {
        if (!localVersion || !remoteVersion || localVersion.id !== remoteVersion.id) {
            return { status: "REJECTED", reason: "Both versions must be supplied and share the same candidateId.", conflict: null };
        }
        if (JSON.stringify(localVersion) === JSON.stringify(remoteVersion)) {
            return { status: "NO_CONFLICT", conflict: null };
        }
        return {
            status: "CONFLICT",
            conflict: {
                candidateId: localVersion.id,
                local: { snapshot: localVersion, updatedAt: localVersion.updatedAt || null },
                remote: { snapshot: remoteVersion, updatedAt: remoteVersion.updatedAt || null },
                detectedAt: nowISO(),
                note: "Both versions preserved for a future, separately-governed synchronization engine to resolve - neither was silently discarded."
            }
        };
    }

    // -----------------------------------------------------------------
    // 8. QUERY
    // -----------------------------------------------------------------

    /** Shallow, safe read view merging an RP-029-A candidate with its
     *  communityExtensions - never returns the live object, so callers
     *  cannot mutate the real store through this accessor (matches
     *  RP-029-A's own listCandidates()/searchCandidates() copy-on-read
     *  convention).
     *
     *  PRIVACY FIX (found by this repair's own test suite, not assumed
     *  safe): RP-029-A's ingestCommunitySubmission() stores the raw,
     *  un-pseudonymized contributorId in two of ITS OWN fields -
     *  candidate.provenance.sourceId and the internal candidate.
     *  _contributors array - since that file's job is dedup/counting,
     *  not identity protection (RP-029-A never claims otherwise; privacy
     *  is explicitly this file's responsibility per the header). A naive
     *  Object.assign({}, candidate) would silently re-expose both raw
     *  ids through this accessor. Neither RP-029-A field is modified -
     *  only this read-only copy redacts/pseudonymizes them before
     *  handing the record to a caller. */
    function toRecord(candidate) {
        if (!candidate) return null;
        const ext = ensureExtensions(candidate);
        const sourceIsCommunitySubmission = candidate.provenance && candidate.provenance.sourceType === "COMMUNITY_SUBMISSION";
        const record = Object.assign({}, candidate, {
            confidence: Object.assign({}, candidate.confidence),
            provenance: Object.assign({}, candidate.provenance, {
                sourceId: sourceIsCommunitySubmission ? pseudonymId(candidate.provenance.sourceId) : candidate.provenance.sourceId
            }),
            communityExtensions: Object.assign({}, ext, {
                reviewHistory: ext.reviewHistory.slice(),
                confirmations: ext.confirmations.slice(),
                disputes: ext.disputes.slice()
            })
        });
        // RP-029-A's own internal contributor list is raw identity -
        // never exposed here at all (independentConfirmations, the real
        // numeric count already on `candidate`, carries the
        // non-identifying signal callers need).
        delete record._contributors;
        return record;
    }

    function getRecord(candidateId) {
        const candidate = getLiveCandidate(candidateId);
        return candidate ? toRecord(candidate) : null;
    }

    function listCommunityRecords(filters) {
        const ing = ingestion();
        if (!ing) return [];
        const f = filters || {};
        return ing.listCandidates({ visibility: f.visibility, language: f.language, sourceType: "COMMUNITY_SUBMISSION" })
            // listCandidates() returns shallow copies (by RP-029-A design) -
            // re-fetch each live object to read/attach communityExtensions.
            .map((c) => getLiveCandidate(c.id))
            .filter((c) => c && c.communityExtensions)
            .filter((c) => !f.reviewState || c.communityExtensions.reviewState === f.reviewState)
            .filter((c) => !f.contributionType || c.communityExtensions.contributionType === f.contributionType)
            .map(toRecord);
    }

    // -----------------------------------------------------------------
    const api = {
        getVersion() { return VERSION; },
        CONTRIBUTION_TYPES,
        REVIEW_STATES,
        tierForCount,
        submitContribution,
        beginReview,
        confirmReview,
        disputeContribution,
        rejectContribution,
        markUnresolved,
        addIndependentConfirmation,
        promoteVisibility,
        describeConfidence,
        getRule82Status,
        getSyncStatus,
        reconcileConflict,
        getRecord,
        listCommunityRecords,
        // Exposed for tests only.
        _pseudonymIdForTests: pseudonymId
    };

    window.CozyOS.CozyKnowledgeCommunity = Object.freeze(api);
    window.CozyOS.Modules["cozy-knowledge-community"] = Object.freeze({
        version: VERSION,
        description: "RP-029-B — Community Contribution + Validation Engine. Composes RP-029-A's real CozyKnowledgeIngestion (ingestCommunitySubmission/confirmCandidate/contributeToCommunity/contributeToPublic/getCandidate) rather than duplicating it; adds a review workflow (CANDIDATE/UNDER_REVIEW/CONFIRMED/DISPUTED/REJECTED/UNRESOLVED), source-aware independent-confirmation checking beyond RP-029-A's contributor-only dedup, labeled multi-dimension confidence reporting, contribution-type/pronunciation/orthography/audio/document/variant metadata, a read-only Rule 82 compliance reporter (never a language-registry mutator), and an honest offline/sync data model (SYNC_PENDING only - no real network sync engine exists in this repository). Never promotes any language to AVAILABLE; never fabricates speech/audio/video/ML capability."
    });

})();
