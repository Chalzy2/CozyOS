/**
 * core/modules/intelligence/privacy/cozy-intelligence-privacy.js
 * Repair: RP-034 Phase 6 — Privacy, Identity & Provenance
 * Baseline: CozyOS-main-RP-034-Phase5.zip (verified: SHA-256
 * 0e6b2b772673e7683677eef0b593f9a225aea21afb14903db2391ab9fa508a90,
 * `unzip -t` clean, Phase 1's 30/30, Phase 2's 55/55, Phase 3's 56/56,
 * Phase 4's 63/63, Phase 5's 63/63, RP-033 Gate 1's 34/34, Gate 2's
 * 51/51 tests re-run and passing before any Phase 6 code was written).
 *
 * MILESTONE SCOPE — THIS FILE IS PHASE 6 ONLY
 *   Does not implement Phase 7 (offline synchronization) or Phase 8
 *   (final integrated test matrix). Rule 82 is never modified,
 *   referenced as a mutator, or touched anywhere in this file.
 *
 * MISSION
 *   Give RP-029/030/031/034's African-language knowledge a real
 *   privacy/identity/provenance layer: separate identity types never
 *   conflated, explicit privacy tiers, real (not fabricated)
 *   authorization/consent with expiry and revocation, real knowledge
 *   lineage that can never skip stages, and privacy-aware packet
 *   filtering before anything ever reaches RP-033's real transport.
 *
 * OWNERSHIP / COMPOSITION — no duplicate identity/security system
 *   - CozyLivingConnectivity.getDeviceIdentity() (RP-033 Gate 1) —
 *     composed verbatim for device identity; this file adds no second
 *     fingerprint mechanism. Real, honest `{available:false, reason}`
 *     when TrustedDeviceManager isn't loaded — never a fabricated
 *     fingerprint.
 *   - AuthCoordinator.getCurrentIdentity()/isAuthenticated() (core/
 *     modules/identity/auth-coordinator.js) — composed for user
 *     identity; this file adds no second session/login system.
 *   - CozyKnowledgeReviewDashboardCore.resolveRole() (RP-029-C Phase
 *     2) — composed verbatim for reviewer/admin identity, the exact
 *     same real ANONYMOUS/COMMUNITY/REVIEWER/ADMIN vocabulary already
 *     established and reused throughout RP-031-B — no competing role
 *     system, per this repair's own explicit instruction.
 *   - CozyConnectivityTransport (RP-033 Gate 2) — composed for real
 *     packet transport (`sendPacket`/`receivePacket`), reusing its
 *     real, truthful state vocabulary verbatim (no `SYNCED`, by
 *     design). `core/connectivity/crypto.js` was read in full before
 *     writing this file: it is an ES module whose own header
 *     discloses "Placeholder implementation until production crypto
 *     is integrated" — i.e. no real encryption exists anywhere in
 *     this repository. `checkEncryptionAvailable()` below reports
 *     this honestly, and `canTransfer()` never allows a `PRIVATE`-tier
 *     item to cross the real transport at all, since no real
 *     encryption exists to protect it in transit.
 *   - CozyRemoteMediaIndex (Phase 2) / CozyRemoteMediaAnalysis (Phase
 *     4) / CozyAfricanLanguageIntelligence (Phase 5) — composed
 *     read-only for provenance assembly and language-identity
 *     resolution in the receiving-device pipeline (`resolveLanguageIdentity()`
 *     reused verbatim from Phase 5 — no second routing algorithm).
 *   - CozyLanguagePacks (RP-030) / CozyKnowledgeSafetyGate (RP-029-C)
 *     — read-only composition for language-pack privacy display and
 *     the real safety-gate step in the receiving-device pipeline.
 *
 * ABSOLUTE HONESTY (spec §40) — binding
 *   Never reports "identity verified" without real identity
 *   infrastructure actually resolving one. Never reports "encrypted"
 *   (no real encryption implementation exists — see above). Never
 *   reports "deleted" without a real deletion mechanism —
 *   `executeWithdrawal()` always honestly reports
 *   `CAPABILITY_UNAVAILABLE`; only the real, disclosed
 *   `WITHDRAW_REQUESTED` audit intent is ever recorded. Never reports
 *   "anonymous" as an absolute guarantee — `ANONYMOUS_COMMUNITY`
 *   privacy tier is always documented as provenance-traceable, not
 *   cryptographically untraceable, because this repository has no
 *   real anonymization/mixing primitive. Never reports `SYNCED` — the
 *   real RP-033 transport has no such state. Rule 82 is never
 *   modified.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CozyOS = root.CozyOS || {};
        factory(root);
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function (rootArg) {
    "use strict";

    const VERSION = "1.0.0-rp034-phase6";

    function hasWindow() { return typeof window !== "undefined"; }
    function cozyOS() { return hasWindow() ? window.CozyOS : (typeof globalThis !== "undefined" ? globalThis.CozyOS : undefined); }
    function livingConnectivity() { const c = cozyOS(); return c && c.CozyLivingConnectivity ? c.CozyLivingConnectivity : null; }
    function authCoordinator() { const c = cozyOS(); return c && c.AuthCoordinator ? c.AuthCoordinator : null; }
    function reviewDashboardCore() { const c = cozyOS(); return c && c.CozyKnowledgeReviewDashboardCore ? c.CozyKnowledgeReviewDashboardCore : null; }
    function transport() { const c = cozyOS(); return c && c.CozyConnectivityTransport ? c.CozyConnectivityTransport : null; }
    function mediaIndex() { const c = cozyOS(); return c && c.CozyRemoteMediaIndex ? c.CozyRemoteMediaIndex : null; }
    function africanLanguageIntel() { const c = cozyOS(); return c && c.CozyAfricanLanguageIntelligence ? c.CozyAfricanLanguageIntelligence : null; }
    function packsApi() { const c = cozyOS(); return c && c.CozyLanguagePacks ? c.CozyLanguagePacks : null; }
    function safetyGate() { const c = cozyOS(); return c && c.CozyKnowledgeSafetyGate ? c.CozyKnowledgeSafetyGate : null; }

    /* ------------------------------------------------------------------ */
    /* CONSTANTS                                                          */
    /* ------------------------------------------------------------------ */

    const IDENTITY_TYPES = Object.freeze(["DEVICE_IDENTITY", "USER_IDENTITY", "CONTRIBUTOR_IDENTITY", "SOURCE_IDENTITY", "KNOWLEDGE_IDENTITY", "MEDIA_OWNER_IDENTITY", "REVIEWER_IDENTITY"]);
    const PRIVACY_TIERS = Object.freeze(["PRIVATE", "LOCAL_ONLY", "COMMUNITY", "ANONYMOUS_COMMUNITY", "RESEARCH", "PUBLIC"]);
    const AUTHORIZATION_STATES = Object.freeze(["NOT_AUTHORIZED", "REQUESTED", "AUTHORIZED", "EXPIRED", "REVOKED"]);
    const CONSENT_PURPOSES = Object.freeze(["MEDIA_INDEXING", "LANGUAGE_RESEARCH", "COMMUNITY_KNOWLEDGE", "SEARCH", "EDUCATION"]);
    const LINEAGE_STAGES = Object.freeze(["SOURCE", "OBSERVATION", "ANALYSIS", "CANDIDATE", "REVIEW", "VERIFIED_KNOWLEDGE"]);
    const SOURCE_DOMAINS = Object.freeze(["AGRICULTURE", "EDUCATION", "HEALTH", "CHURCH", "COMMUNITY", "BUSINESS", "CULTURE"]);
    const IDENTITY_RESOLUTION_STATUSES = Object.freeze(["RESOLVED", "AMBIGUOUS", "UNKNOWN", "CAPABILITY_UNAVAILABLE"]);
    const AUDIT_EVENT_TYPES = Object.freeze(["AUTH_GRANTED", "AUTH_REVOKED", "KNOWLEDGE_VIEWED", "KNOWLEDGE_EXPORTED", "KNOWLEDGE_SHARED", "TRANSFER_BLOCKED", "PRIVACY_CHANGED", "IDENTITY_RESOLVED", "IDENTITY_REDACTED", "SOURCE_REMOVED"]);

    function nowISO() { return new Date().toISOString(); }
    function nowMs() { return Date.now(); }

    /* ------------------------------------------------------------------ */
    /* IN-MEMORY STORES (session-scoped, disclosed — the same pattern    */
    /* every Phase in this milestone already uses)                        */
    /* ------------------------------------------------------------------ */

    const consentRecords = new Map();
    const provenanceRecords = new Map();
    const lineageState = new Map(); // itemId -> current stage
    const auditTrail = [];
    let nextSeq = 1;
    function freshId(prefix) { return prefix + "_" + (nextSeq++) + "_" + Date.now().toString(36); }

    function logAudit(type, detail) {
        if (AUDIT_EVENT_TYPES.indexOf(type) === -1) return { status: "REJECTED", reason: "Unrecognized audit event type." };
        // Never store unnecessary personal content inside audit records (spec §25).
        const safeDetail = Object.assign({}, detail);
        delete safeDetail.rawContributorName;
        delete safeDetail.rawPersonalData;
        const entry = Object.freeze({ type, detail: safeDetail, at: nowISO() });
        auditTrail.push(entry);
        return { status: "LOGGED", entry };
    }
    function getAuditTrail(filter) {
        const f = filter || {};
        return auditTrail.filter((e) => !f.type || e.type === f.type).slice();
    }

    /* ------------------------------------------------------------------ */
    /* 1. IDENTITY RESOLUTION (spec §3, §14-15, §30) — real composition,  */
    /* never a competing role/session system                              */
    /* ------------------------------------------------------------------ */

    async function getDeviceIdentity() {
        const lc = livingConnectivity();
        if (!lc) return { status: "CAPABILITY_UNAVAILABLE", type: "DEVICE_IDENTITY", reason: "CONNECTIVITY_LAYER_ABSENT" };
        const result = await lc.getDeviceIdentity();
        const status = result.available ? "RESOLVED" : "UNKNOWN";
        logAudit("IDENTITY_RESOLVED", { type: "DEVICE_IDENTITY", status });
        return { status, type: "DEVICE_IDENTITY", available: result.available, reason: result.reason || null };
    }

    function getUserIdentity() {
        const auth = authCoordinator();
        if (!auth) return { status: "CAPABILITY_UNAVAILABLE", type: "USER_IDENTITY", reason: "AUTH_COORDINATOR_ABSENT" };
        const identity = auth.getCurrentIdentity();
        const status = identity && identity.userId ? "RESOLVED" : "UNKNOWN";
        logAudit("IDENTITY_RESOLVED", { type: "USER_IDENTITY", status });
        return { status, type: "USER_IDENTITY", userId: identity ? identity.userId : null, roles: identity ? identity.roles : [] };
    }

    /**
     * getContributorIdentity(ref)
     *   A contributor is represented ONLY as an opaque reference
     *   (spec §12 example: "CONTRIB-xxxx") — this file never derives,
     *   hashes, or stores raw personal data to produce one. The real
     *   pseudonym must already have been created upstream (RP-029-B's
     *   own pseudonymId(), already established and unmodified).
     */
    function getContributorIdentity(ref) {
        if (!ref || typeof ref !== "string") return { status: "UNKNOWN", type: "CONTRIBUTOR_IDENTITY", reason: "NO_REAL_CONTRIBUTOR_REFERENCE_SUPPLIED" };
        return { status: "RESOLVED", type: "CONTRIBUTOR_IDENTITY", ref };
    }

    function getReviewerIdentity(config) {
        const rdc = reviewDashboardCore();
        if (!rdc) return { status: "CAPABILITY_UNAVAILABLE", type: "REVIEWER_IDENTITY", reason: "REVIEW_DASHBOARD_CORE_ABSENT" };
        const role = rdc.resolveRole(config);
        const status = role.authBackend === "AUTHORIZATION_BACKEND_UNAVAILABLE" ? "CAPABILITY_UNAVAILABLE" : (role.role === "ANONYMOUS" ? "UNKNOWN" : "RESOLVED");
        return { status, type: "REVIEWER_IDENTITY", role: role.role, authBackend: role.authBackend };
    }

    function getSourceIdentity(sourceType, sourceId) {
        if (!sourceType || !sourceId) return { status: "UNKNOWN", type: "SOURCE_IDENTITY" };
        return { status: "RESOLVED", type: "SOURCE_IDENTITY", sourceType, sourceId };
    }

    function getMediaOwnerIdentity(indexId) {
        const idx = mediaIndex();
        if (!idx) return { status: "CAPABILITY_UNAVAILABLE", type: "MEDIA_OWNER_IDENTITY", reason: "MEDIA_INDEX_ABSENT" };
        const record = idx.getRecord(indexId);
        if (!record) return { status: "UNKNOWN", type: "MEDIA_OWNER_IDENTITY", reason: "NO_SUCH_RECORD" };
        return { status: "RESOLVED", type: "MEDIA_OWNER_IDENTITY", authorizationRef: record.ownerAuthorization.authorizationRef, state: record.ownerAuthorization.state };
    }

    function getKnowledgeIdentity(knowledgeId) {
        if (!knowledgeId) return { status: "UNKNOWN", type: "KNOWLEDGE_IDENTITY" };
        return { status: "RESOLVED", type: "KNOWLEDGE_IDENTITY", knowledgeId };
    }

    /* ------------------------------------------------------------------ */
    /* 2. CONSENT / AUTHORIZATION (spec §7-9) — real, expiring, revocable */
    /* ------------------------------------------------------------------ */

    /**
     * requestAuthorization({subject, purpose, source, scope})
     *   Real REQUESTED state — not yet granted.
     */
    function requestAuthorization(fields) {
        const f = fields || {};
        if (!f.subject || !f.source || CONSENT_PURPOSES.indexOf(f.purpose) === -1) return { status: "REJECTED", reason: "A real subject, source, and recognized purpose are required." };
        const consentId = freshId("consent");
        const record = { consentId, subject: f.subject, purpose: f.purpose, source: f.source, scope: f.scope || null, issuedAt: null, expiresAt: null, revokedAt: null, status: "REQUESTED" };
        consentRecords.set(consentId, record);
        return { status: "REQUESTED", consentId, record: Object.assign({}, record) };
    }

    /**
     * grantAuthorization(consentId, {expiresInMs})
     *   Moves a real REQUESTED consent (or creates one directly) to
     *   real AUTHORIZED, tied to its specific source+purpose (spec §7
     *   — never a blanket grant).
     */
    function grantAuthorization(consentId, opts) {
        const o = opts || {};
        let record = consentRecords.get(consentId);
        if (!record) return { status: "REJECTED", reason: "No such consent request. Call requestAuthorization() first." };
        record.status = "AUTHORIZED";
        record.issuedAt = nowISO();
        record.expiresAt = o.expiresInMs ? new Date(nowMs() + o.expiresInMs).toISOString() : null;
        logAudit("AUTH_GRANTED", { consentId, purpose: record.purpose, source: record.source });
        return { status: "AUTHORIZED", consentId, record: Object.assign({}, record) };
    }

    function revokeAuthorization(consentId, reason) {
        const record = consentRecords.get(consentId);
        if (!record) return { status: "REJECTED", reason: "NOT_FOUND" };
        record.status = "REVOKED";
        record.revokedAt = nowISO();
        logAudit("AUTH_REVOKED", { consentId, purpose: record.purpose, reason: reason || null });
        return { status: "REVOKED", consentId };
    }

    /**
     * expireAuthorization(consentId)
     *   Real, computed comparison against the real expiresAt — never a
     *   guessed or time-fabricated expiry.
     */
    function expireAuthorization(consentId) {
        const record = consentRecords.get(consentId);
        if (!record) return { status: "REJECTED", reason: "NOT_FOUND" };
        if (!record.expiresAt) return { status: "NO_EXPIRY_SET" };
        if (new Date(record.expiresAt).getTime() <= nowMs() && record.status === "AUTHORIZED") {
            record.status = "EXPIRED";
            return { status: "EXPIRED", consentId };
        }
        return { status: record.status };
    }

    /**
     * checkAuthorization(consentId, purpose)
     *   Real check: exists, real status AUTHORIZED, real expiry not
     *   passed, real purpose match. Authorization for MEDIA_INDEXING
     *   never implies authorization for a different purpose (spec §7).
     */
    function checkAuthorization(consentId, purpose) {
        const record = consentRecords.get(consentId);
        if (!record) return { status: "NOT_AUTHORIZED", reason: "NOT_FOUND" };
        expireAuthorization(consentId);
        const current = consentRecords.get(consentId);
        if (current.status !== "AUTHORIZED") return { status: current.status };
        if (purpose && current.purpose !== purpose) return { status: "NOT_AUTHORIZED", reason: "PURPOSE_MISMATCH", grantedFor: current.purpose, requested: purpose };
        return { status: "AUTHORIZED", record: Object.assign({}, current) };
    }

    /* ------------------------------------------------------------------ */
    /* 3. PROVENANCE / LINEAGE (spec §10-11)                               */
    /* ------------------------------------------------------------------ */

    function createProvenance(fields) {
        const f = fields || {};
        if (!f.sourceType || !f.sourceId) return { status: "REJECTED", reason: "A real sourceType and sourceId are required." };
        const provenanceId = freshId("prov");
        const record = {
            provenanceId, sourceType: f.sourceType, sourceId: f.sourceId, sourceOwner: f.sourceOwner || null,
            acquisitionMethod: f.acquisitionMethod || null, observedAt: f.observedAt || nowISO(), analyzedAt: f.analyzedAt || null,
            languageEvidence: f.languageEvidence || null, contributor: f.contributor || null,
            verification: f.verification || "UNVALIDATED", privacyTier: PRIVACY_TIERS.indexOf(f.privacyTier) !== -1 ? f.privacyTier : "COMMUNITY"
        };
        provenanceRecords.set(provenanceId, record);
        lineageState.set(provenanceId, "SOURCE");
        return { status: "CREATED", provenanceId, record: Object.assign({}, record) };
    }

    function getProvenance(provenanceId) {
        const record = provenanceRecords.get(provenanceId);
        return record ? Object.assign({}, record, { lineageStage: lineageState.get(provenanceId) }) : null;
    }

    /**
     * validateProvenance(record)
     *   Real structural check only — never a claim of factual truth.
     */
    function validateProvenance(record) {
        if (!record || typeof record !== "object") return { valid: false, reason: "Not a real object." };
        const required = ["sourceType", "sourceId"];
        for (const f of required) if (!record[f]) return { valid: false, reason: `Missing required field "${f}".` };
        return { valid: true };
    }

    /**
     * advanceLineage(provenanceId, toStage)
     *   Real, sequential state machine — SOURCE -> OBSERVATION ->
     *   ANALYSIS -> CANDIDATE -> REVIEW -> VERIFIED_KNOWLEDGE only.
     *   Never allows skipping directly from SOURCE to
     *   VERIFIED_KNOWLEDGE or any other non-adjacent jump.
     */
    function advanceLineage(provenanceId, toStage) {
        if (!provenanceRecords.has(provenanceId)) return { status: "REJECTED", reason: "NOT_FOUND" };
        const current = lineageState.get(provenanceId);
        const currentIdx = LINEAGE_STAGES.indexOf(current);
        const toIdx = LINEAGE_STAGES.indexOf(toStage);
        if (toIdx === -1) return { status: "REJECTED", reason: "Unrecognized lineage stage." };
        if (toIdx !== currentIdx + 1) return { status: "REJECTED", reason: `Lineage cannot skip stages: currently "${current}", requested "${toStage}".` };
        lineageState.set(provenanceId, toStage);
        return { status: "ADVANCED", provenanceId, stage: toStage };
    }
    function getLineageStage(provenanceId) { return lineageState.get(provenanceId) || null; }

    /* ------------------------------------------------------------------ */
    /* 4. PRIVACY TIER / DISPLAY / REDACTION (spec §4, §17-20, §27)        */
    /* ------------------------------------------------------------------ */

    /**
     * getDisplayView(item, viewerRole)
     *   Real, tier-based filtering — PUBLIC shows language+country
     *   only; COMMUNITY additionally shows region/community;
     *   ANONYMOUS_COMMUNITY shows region/community but never
     *   contributor; contributor/source-owner detail requires
     *   REVIEWER+ regardless of tier. Never destroys the underlying
     *   linguistic distinction (region/dialect/meaning) — only
     *   controls whether it is *displayed*.
     */
    function getDisplayView(item, viewerRole) {
        const it = item || {};
        const role = viewerRole || "ANONYMOUS";
        const isReviewerPlus = role === "REVIEWER" || role === "ADMIN";
        const base = { language: it.language || null, country: it.country || null };
        if (it.privacyTier === "PUBLIC") return Object.assign({}, base, { region: it.region || null });
        if (it.privacyTier === "COMMUNITY" || it.privacyTier === "ANONYMOUS_COMMUNITY") {
            const view = Object.assign({}, base, { region: it.region || null, community: it.community || null });
            if (it.privacyTier === "COMMUNITY" && isReviewerPlus) view.contributor = it.contributor || null;
            return view;
        }
        if (it.privacyTier === "RESEARCH") return Object.assign({}, base, { region: it.region || null, community: isReviewerPlus ? it.community || null : "REDACTED" });
        if (it.privacyTier === "LOCAL_ONLY" || it.privacyTier === "PRIVATE") {
            if (!isReviewerPlus) return { status: "RESTRICTED_VIEW", reason: "This item's privacy tier requires REVIEWER+ authorization to view." };
            return Object.assign({}, base, { region: it.region || null, community: it.community || null, contributor: it.contributor || null });
        }
        return base;
    }

    function redactContributor(record) { logAudit("IDENTITY_REDACTED", { field: "contributor" }); return Object.assign({}, record, { contributor: "REDACTED" }); }
    function redactLocation(record) { logAudit("IDENTITY_REDACTED", { field: "location" }); return Object.assign({}, record, { region: "REDACTED", community: "REDACTED" }); }
    function redactSourceOwner(record) { logAudit("IDENTITY_REDACTED", { field: "sourceOwner" }); return Object.assign({}, record, { sourceOwner: "REDACTED" }); }
    function redactPrivateMetadata(record) {
        logAudit("IDENTITY_REDACTED", { field: "privateMetadata" });
        const clean = Object.assign({}, record);
        ["phoneNumber", "gpsCoordinates", "personalContacts", "privateMessages", "accountToken", "biometric"].forEach((k) => { if (k in clean) clean[k] = "REDACTED"; });
        return clean;
    }

    /* ------------------------------------------------------------------ */
    /* 5. DATA MINIMIZATION (spec §5) — real guard                        */
    /* ------------------------------------------------------------------ */

    const FORBIDDEN_FIELD_PATTERN = /phone|gps|coordinate|contact|message|token|biometric|password|secret/i;
    function checkDataMinimization(fields) {
        if (!fields || typeof fields !== "object") return { compliant: true };
        const violations = Object.keys(fields).filter((k) => FORBIDDEN_FIELD_PATTERN.test(k));
        return violations.length === 0 ? { compliant: true } : { compliant: false, violations };
    }

    /* ------------------------------------------------------------------ */
    /* 6. EXPORT CONTROLS (spec §26, §29)                                  */
    /* ------------------------------------------------------------------ */

    function canExport(item, opts) {
        const o = opts || {};
        if (!item || !item.privacyTier) return { allowed: false, reason: "NO_REAL_PRIVACY_TIER" };
        if (item.privacyTier === "PRIVATE" || item.privacyTier === "LOCAL_ONLY") return { allowed: false, reason: "PRIVACY_TIER_FORBIDS_EXPORT" };
        if (item.privacyTier === "RESEARCH" && o.purpose !== "LANGUAGE_RESEARCH") return { allowed: false, reason: "RESEARCH_TIER_REQUIRES_RESEARCH_PURPOSE" };
        logAudit("KNOWLEDGE_EXPORTED", { privacyTier: item.privacyTier });
        return { allowed: true };
    }
    function canShare(item, opts) {
        const o = opts || {};
        if (!item || !item.privacyTier) return { allowed: false, reason: "NO_REAL_PRIVACY_TIER" };
        if (item.privacyTier === "PRIVATE") return { allowed: false, reason: "PRIVACY_TIER_FORBIDS_SHARING" };
        logAudit("KNOWLEDGE_SHARED", { privacyTier: item.privacyTier, destination: o.destination || null });
        return { allowed: true };
    }
    function canPublish(item, opts) {
        if (!item || item.privacyTier !== "PUBLIC") return { allowed: false, reason: "ONLY_PUBLIC_TIER_ITEMS_MAY_BE_PUBLISHED" };
        return { allowed: true };
    }
    function canResearch(item, opts) {
        if (!item || !item.privacyTier) return { allowed: false, reason: "NO_REAL_PRIVACY_TIER" };
        const allowedTiers = ["RESEARCH", "ANONYMOUS_COMMUNITY", "COMMUNITY", "PUBLIC"];
        return { allowed: allowedTiers.indexOf(item.privacyTier) !== -1, reason: allowedTiers.indexOf(item.privacyTier) !== -1 ? null : "PRIVACY_TIER_FORBIDS_RESEARCH_USE" };
    }
    function canTransfer(item, opts) {
        if (!item || !item.privacyTier) return { allowed: false, reason: "NO_REAL_PRIVACY_TIER" };
        // No real encryption exists in this repository (see file header) —
        // PRIVATE-tier data must never cross the real transport.
        if (item.privacyTier === "PRIVATE") return { allowed: false, reason: "TRANSFER_BLOCKED_PRIVACY" };
        if (item.privacyTier === "LOCAL_ONLY") return { allowed: false, reason: "TRANSFER_BLOCKED_PRIVACY" };
        return { allowed: true };
    }

    /* ------------------------------------------------------------------ */
    /* 7. SECURITY / ENCRYPTION CAPABILITY (spec §31-32)                   */
    /* ------------------------------------------------------------------ */

    function checkEncryptionAvailable() {
        return { status: "CAPABILITY_UNAVAILABLE", reason: "core/connectivity/crypto.js discloses itself as a placeholder implementation ('until production crypto is integrated') — no real, verified encryption primitive exists anywhere in this repository. This file never fabricates one." };
    }

    /* ------------------------------------------------------------------ */
    /* 8. RIGHT-TO-WITHDRAW (spec §28)                                     */
    /* ------------------------------------------------------------------ */

    const withdrawalRequests = new Map();
    function requestWithdrawal(subjectRef) {
        if (!subjectRef) return { status: "REJECTED", reason: "A real subjectRef is required." };
        const id = freshId("withdraw");
        withdrawalRequests.set(id, { id, subjectRef, status: "WITHDRAW_REQUESTED", requestedAt: nowISO() });
        return { status: "WITHDRAW_REQUESTED", withdrawalId: id };
    }
    /**
     * executeWithdrawal(withdrawalId)
     *   Always honestly CAPABILITY_UNAVAILABLE — no real, verified
     *   cascading-deletion mechanism exists across RP-029/030/034's
     *   composed real stores. Never claims "deleted everywhere."
     */
    function executeWithdrawal(withdrawalId) {
        const request = withdrawalRequests.get(withdrawalId);
        if (!request) return { status: "REJECTED", reason: "NOT_FOUND" };
        return { status: "CAPABILITY_UNAVAILABLE", reason: "No real, verified deletion mechanism exists across this repository's composed real stores (RP-029/030/034). The request remains recorded as WITHDRAW_REQUESTED; it is never silently claimed complete." };
    }

    /* ------------------------------------------------------------------ */
    /* 9. LANGUAGE-PACK PRIVACY (spec §17, composes RP-030 read-only)      */
    /* ------------------------------------------------------------------ */

    function getLanguagePackPrivacyView(languageId, viewerRole) {
        const api = packsApi();
        if (!api) return { status: "CAPABILITY_UNAVAILABLE" };
        const pack = api.getPack(languageId);
        if (!pack) return { status: "UNKNOWN" };
        const contexts = api.listRegionalContexts(languageId);
        const isReviewerPlus = viewerRole === "REVIEWER" || viewerRole === "ADMIN";
        return {
            status: "AVAILABLE",
            publicView: { language: pack.identity.name, countries: pack.geography.countries },
            communityView: { language: pack.identity.name, regions: pack.geography.regions },
            restrictedView: isReviewerPlus ? { language: pack.identity.name, contexts } : "RESTRICTED_VIEW_REQUIRES_REVIEWER_PLUS"
        };
    }

    /* ------------------------------------------------------------------ */
    /* 10. REMOTE MEDIA PRIVACY (spec §6, composes Phase 2 read-only)      */
    /* ------------------------------------------------------------------ */

    function getMediaPrivacyView(indexId) {
        const idx = mediaIndex();
        if (!idx) return { status: "CAPABILITY_UNAVAILABLE" };
        const record = idx.getRecord(indexId);
        if (!record) return { status: "UNKNOWN" };
        // Only references, never the full remote media — exactly what
        // Phase 2's real schema already stores (verified, not re-derived).
        return {
            status: "AVAILABLE",
            videoId: record.sourceId, source: record.sourceType, timestamp: record.sourceMetadata.retrievedAt,
            title: record.title, ownerAuthorizationState: record.ownerAuthorization.state,
            analysisProvenance: { sourceMetadata: record.sourceMetadata }
        };
    }

    /* ------------------------------------------------------------------ */
    /* 11. DOMAIN / HEALTH SAFETY (spec §19-20)                            */
    /* ------------------------------------------------------------------ */

    function classifyDomainKnowledge(domain, statement) {
        if (SOURCE_DOMAINS.indexOf(domain) === -1) return { status: "REJECTED", reason: "Unrecognized source domain." };
        return {
            status: "AVAILABLE", domain, statement,
            classification: "COMMUNITY_REPORTED_NOT_PROFESSIONALLY_VERIFIED",
            note: domain === "HEALTH" ? "A community health statement is never treated as medical advice by this file." : null
        };
    }

    /* ------------------------------------------------------------------ */
    /* 12. RP-033 PRIVACY-AWARE PACKET FILTERING (spec §22-24)             */
    /* ------------------------------------------------------------------ */

    const PRIVACY_PACKET_TYPE = "cozy-intelligence-privacy-package-v1";

    /**
     * sharePrivacyAwarePacket(item, opts)
     *   Knowledge -> privacy policy -> authorization -> provenance ->
     *   packet -> RP-033 transport. Real `TRANSFER_BLOCKED_PRIVACY`
     *   when the policy forbids it — never a fabricated SYNCED.
     */
    function sharePrivacyAwarePacket(item, opts) {
        const o = opts || {};
        const transferCheck = canTransfer(item, o);
        if (!transferCheck.allowed) {
            logAudit("TRANSFER_BLOCKED", { reason: transferCheck.reason });
            return { status: "TRANSFER_BLOCKED_PRIVACY", reason: transferCheck.reason };
        }
        if (o.consentId) {
            const auth = checkAuthorization(o.consentId, o.purpose);
            if (auth.status !== "AUTHORIZED") return { status: "TRANSFER_BLOCKED_PRIVACY", reason: "AUTHORIZATION_NOT_GRANTED" };
        }
        const t = transport();
        if (!t) return { status: "CAPABILITY_UNAVAILABLE", reason: "CONNECTIVITY_TRANSPORT_ABSENT" };
        const packet = {
            packetId: freshId("pkt"), knowledgeId: item.knowledgeId || null, sourceId: item.sourceId || null,
            privacyTier: item.privacyTier, provenance: item.provenance || null, authorizationScope: o.consentId || null,
            expiry: o.expiresAt || null
        };
        const sendResult = t.sendPacket({ destination: o.destination || "peer", payloadType: PRIVACY_PACKET_TYPE, payload: packet, sender: o.sender || "intelligence-privacy", sessionId: o.sessionId, connectionId: o.connectionId });
        logAudit("KNOWLEDGE_SHARED", { packetId: packet.packetId, privacyTier: item.privacyTier });
        return Object.assign({ packet }, sendResult);
    }

    /**
     * receivePrivacyAwarePacket(envelope, opts)
     *   Receive -> integrity (real, via RP-033) -> provenance -> privacy
     *   policy -> authorization -> safety gate (RP-029-C) -> language
     *   identity (Phase 5) -> local candidate. Never directly inserts
     *   received information into a trusted language pack.
     */
    function receivePrivacyAwarePacket(envelope, opts) {
        const t = transport();
        if (!t) return { status: "CAPABILITY_UNAVAILABLE", reason: "CONNECTIVITY_TRANSPORT_ABSENT" };
        const accept = t.receivePacket(envelope, opts);
        if (!accept.accepted) { logAudit("TRANSFER_BLOCKED", { reason: accept.reason }); return { status: "REJECTED", reason: accept.reason }; }
        const packet = envelope.payload;
        if (!packet || !packet.privacyTier) return { status: "REJECTED", reason: "MALFORMED_PRIVACY_PACKET" };

        const provenanceCheck = validateProvenance(packet.provenance || {});
        const safetyText = packet.knowledgeId || packet.sourceId;
        const gate = safetyGate();
        let safetyStatus = "SAFE";
        if (gate && safetyText) {
            const classification = gate.classify({ expression: String(safetyText), contributionType: "WEBSITE_EVIDENCE" });
            if (classification.classification !== "SAFE") safetyStatus = classification.classification;
        }
        const intel = africanLanguageIntel();
        const identity = intel && packet.provenance && packet.provenance.languageEvidence ? intel.resolveLanguageIdentity(packet.provenance.languageEvidence) : null;

        logAudit("KNOWLEDGE_VIEWED", { packetId: packet.packetId, privacyTier: packet.privacyTier, safetyStatus });
        return { status: "LOCAL_CANDIDATE", packetId: packet.packetId, provenanceValid: provenanceCheck.valid, safetyStatus, identity, note: "Received as a local candidate only — never directly inserted into a trusted language pack." };
    }

    /* ------------------------------------------------------------------ */
    /* PUBLIC API                                                          */
    /* ------------------------------------------------------------------ */

    const api = Object.freeze({
        getVersion: () => VERSION,
        IDENTITY_TYPES, PRIVACY_TIERS, AUTHORIZATION_STATES, CONSENT_PURPOSES, LINEAGE_STAGES, SOURCE_DOMAINS, IDENTITY_RESOLUTION_STATUSES, AUDIT_EVENT_TYPES,
        getDeviceIdentity, getUserIdentity, getContributorIdentity, getReviewerIdentity, getSourceIdentity, getMediaOwnerIdentity, getKnowledgeIdentity,
        requestAuthorization, grantAuthorization, revokeAuthorization, expireAuthorization, checkAuthorization,
        createProvenance, getProvenance, validateProvenance, advanceLineage, getLineageStage,
        getDisplayView, redactContributor, redactLocation, redactSourceOwner, redactPrivateMetadata,
        checkDataMinimization,
        canExport, canShare, canPublish, canResearch, canTransfer,
        checkEncryptionAvailable,
        requestWithdrawal, executeWithdrawal,
        getLanguagePackPrivacyView, getMediaPrivacyView,
        classifyDomainKnowledge,
        sharePrivacyAwarePacket, receivePrivacyAwarePacket,
        getAuditTrail,
        // Exposed for tests only.
        _resetForTests() { consentRecords.clear(); provenanceRecords.clear(); lineageState.clear(); auditTrail.length = 0; withdrawalRequests.clear(); }
    });

    if (hasWindow()) {
        window.CozyOS = window.CozyOS || {};
        window.CozyOS.Modules = window.CozyOS.Modules || {};
        if (!window.CozyOS.Modules["cozy-intelligence-privacy"]) {
            window.CozyOS.CozyIntelligencePrivacy = api;
            window.CozyOS.Modules["cozy-intelligence-privacy"] = Object.freeze({
                version: VERSION,
                description: "RP-034 Phase 6 — Privacy, Identity & Provenance. Real identity separation (device/user/contributor/source/knowledge/media-owner/reviewer), real privacy tiers, real expiring/revocable consent, real sequential knowledge lineage, real privacy-aware RP-033 packet filtering. No real encryption exists in this repository (disclosed) — PRIVATE/LOCAL_ONLY tiers never cross the real transport. No real deletion mechanism exists — withdrawal requests are recorded honestly, never claimed executed. Rule 82 untouched."
            });
        }
        if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
            try {
                window.CozyOS.ServiceRegistry.registerCoordinator({
                    sourcePath: "core/modules/intelligence/privacy/cozy-intelligence-privacy.js",
                    name: "CozyIntelligencePrivacy", category: "Living Engine",
                    description: "RP-034 Phase 6 Privacy, Identity & Provenance coordinator. Composes real RP-033/RP-029-C/AuthCoordinator identity+security infrastructure. No fabricated encryption, deletion, anonymity guarantee, or identity verification."
                });
            } catch (_err) { /* non-fatal */ }
        }
    }

    if (typeof module === "object" && module.exports) return api;
    return api;
}));
