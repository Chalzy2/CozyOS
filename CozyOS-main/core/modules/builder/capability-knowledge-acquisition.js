/**
 * CozyOS — Capability Knowledge Acquisition (Phase 7)
 * File Reference: core/modules/builder/capability-knowledge-acquisition.js
 * Repair: RP-030-CONTENT — governed acquisition request + contribution
 *         wrapper for a missing KNOWLEDGE dependency identified by
 *         Phase 4/5's self-diagnosis/repair-planning chain.
 *
 * BASELINE (Phase 7 Step 1 audit, performed against the real repository
 * before any line of this file was written)
 *   - registerDefaultPacks() auto-registers "sw"; language:sw:vocabulary
 *     resourceState is NOT_READY.
 *   - RP-029-A/B/C ingestion -> community/review -> safety/review
 *     infrastructure already exists and is wired together.
 *   - cozy-teach-cozyai-routing-core.js already routes a safe
 *     contribution into both the review pipeline and the language-pack
 *     registry.
 *   - cozy-knowledge-safety-gate.js already gates content before any
 *     candidate is created.
 *   - cozy-knowledge-review.js already owns Rule 82's five-part gate
 *     (evaluateRule82Gate()) and never promotes anything itself.
 *   - cozy-language-pack-registry.js's requestPromotion() is always
 *     BLOCKED; no mutator anywhere in this chain can set resourceState
 *     to AVAILABLE or a capability to VERIFIED.
 *   - RP-030-CONTENT remains open (Composed, High priority).
 *   - MD-028 (unified-capability-contract.js's DIMENSION_SIGNAL_MAP has
 *     no entry for AVAILABLE/VALIDATING/DEPRECATED) is real but dormant
 *     and out of scope for this file — not touched here.
 *   - church_sw.json / church_language_pack.py belong to a separate,
 *     ungoverned subsystem (ChurchOS live translation) and carry no
 *     provenance/consent metadata usable by RP-030's governance chain.
 *     This file never reads, imports, or references either.
 *
 * WHAT THIS FILE ADDS (and nothing more)
 *   1. classifyDependencyDomain() — an explicit, inspectable rule
 *      distinguishing a KNOWLEDGE dependency (content that must be
 *      community-sourced and human-governed) from a SOFTWARE dependency
 *      (something Build/Verify/Reevaluate steps can address), using the
 *      real Repair Queue reference already carried on every blocker by
 *      capability-repair-planner.js's buildPlan(). The rule is the
 *      repository's own naming convention: a Repair Queue id ending in
 *      "-CONTENT" (today's only real example: RP-030-CONTENT) marks
 *      content/knowledge work, never a code build. If a blocker has no
 *      Repair Queue reference at all, or an id that doesn't match this
 *      convention, the result is UNKNOWN/SOFTWARE respectively — never
 *      guessed.
 *   2. createAcquisitionRequest(question, ...) — derives a structured,
 *      machine-readable acquisition request FROM the real diagnosis/
 *      plan produced by capability-self-diagnosis.js +
 *      capability-repair-planner.js. Refuses to create a request for an
 *      unknown capability, an already-satisfied dependency, or a
 *      dependency that classifies as SOFTWARE rather than KNOWLEDGE.
 *   3. submitAcquisitionContribution(requestId, fields, ...) — a thin
 *      wrapper that attaches a real contribution (supplied by the
 *      caller, never fabricated by this file) to an existing request
 *      and routes it through the real, unmodified
 *      cozy-teach-cozyai-routing-core.js pipeline, then reads (never
 *      writes) cozy-knowledge-review.js's evaluateRule82Gate() to
 *      report whether promotion is even structurally reachable.
 *   4. A request-status taxonomy (REQUEST_STATUS) that is explicitly
 *      SEPARATE from cozy-language-pack-registry.js's PACK_STATES — see
 *      section 3 below. No search of this repository (Phase 7 Step 1
 *      audit) found an existing canonical acquisition-request status
 *      taxonomy to reuse, so this is a new, additive, narrowly-scoped
 *      one, never fed back into the pack registry's own state field.
 *
 * OWNERSHIP / COMPOSITION (no rewriting of any locked file)
 *   New, additive, standalone file. Composes — never duplicates — these
 *   existing, frozen public APIs, all read/called at call time only,
 *   all degrading honestly (CAPABILITY_UNAVAILABLE) if absent:
 *     - window.CozyOS.CapabilityRepairPlanner   (Phase 5) buildPlan()
 *     - window.CozyOS.CapabilitySelfDiagnosis   (Phase 4) diagnose() —
 *       only ever passed through to buildPlan() as its diagnosisEngine
 *       argument, never called directly by this file.
 *     - window.CozyOS.CozyTeachCozyAIRouting    (RP-031 Phase 2A)
 *       submitTeachingContribution() — the ONE real path into the
 *       RP-029 review pipeline + RP-030 pack routing. Never
 *       reimplemented.
 *     - window.CozyOS.CozyKnowledgeReview       (RP-029-C Phase 1)
 *       evaluateRule82Gate() — read-only. This file never calls a
 *       mutator on it.
 *   None of the above are modified. If a dependency is absent, every
 *   function below fails closed / degrades honestly.
 *
 * RULE 82 — UNAFFECTED, AND A DISCLOSED LIMITATION INHERITED AS-IS
 *   This file has no promotion mutator and never calls one.
 *   IMPORTANT, HONESTLY DISCLOSED: cozy-knowledge-review.js's
 *   evaluateRule82Gate(languageCode, attestation) evaluates the
 *   response-TEMPLATE completeness axis owned by
 *   window.CozyOS.CozyLanguageRegistry (RP-027) — not RP-030's
 *   vocabulary-content axis this file's requests are actually about.
 *   cozy-language-pack-registry.js's own requestPromotion() already
 *   composes this same gate for the same reason (it is the only Rule 82
 *   gate that exists), so this file inherits, rather than introduces,
 *   that mismatch. A gate result of "ELIGIBLE" here means the templates
 *   axis is satisfied — it does NOT mean the vocabulary-content
 *   dependency this request targets has been verified. This file
 *   labels that explicitly in every promotion-facing result
 *   (`rule82GateCaveat`) rather than implying the two axes are the same
 *   thing. Building a genuine vocabulary-content Rule 82 check is
 *   explicitly out of scope for Phase 7 (would be "a second gate" —
 *   forbidden by the phase boundary) and is not attempted here.
 *
 * NO FABRICATION
 *   - This file never invents a contributor id, consent acknowledgement,
 *     resource attestation, or test evidence. Every one of those must
 *     be supplied by the caller in the `fields` argument to
 *     submitAcquisitionContribution(); if absent, the real downstream
 *     pipeline honestly rejects/reports UNKNOWN exactly as it already
 *     does for any other caller.
 *   - This file never reads church_sw.json, church_language_pack.py, or
 *     kiswahili_coverage_gaps.txt, and never bulk-imports any file into
 *     an authoritative pack record.
 *   - No function in this file can set a pack's resourceState or a
 *     capability's overallStatus to anything. Both are always re-read
 *     live from the real chain (unified-capability-contract.js ->
 *     capability-self-diagnosis.js) by calling diagnose() again — this
 *     file never mirrors or caches that judgment itself.
 *
 * PHASE BOUNDARY
 *   Phase 7 delivers the acquisition-request + contribution-wrapper
 *   layer only. It does not implement a second knowledge/review/safety/
 *   promotion engine, does not modify any of the four existing
 *   governance files, and does not generate or promote any Kiswahili
 *   vocabulary. STOP AFTER PHASE 7.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["capability-knowledge-acquisition"]) return;

    const VERSION = "0.1.0-PHASE7";

    // -----------------------------------------------------------------
    // 0. DEPENDENCY COMPOSITION (read real APIs; never fabricate them)
    // -----------------------------------------------------------------

    function repairPlanner() { return (window.CozyOS && window.CozyOS.CapabilityRepairPlanner) || null; }
    function teachRouting() { return (window.CozyOS && window.CozyOS.CozyTeachCozyAIRouting) || null; }
    function knowledgeReview() { return (window.CozyOS && window.CozyOS.CozyKnowledgeReview) || null; }

    function nowISO() { return new Date().toISOString(); }

    // -----------------------------------------------------------------
    // 1. DEPENDENCY DOMAIN CLASSIFICATION
    //    Explicit, inspectable, and grounded in the repository's own
    //    Repair Queue id convention — never a heuristic on free text.
    // -----------------------------------------------------------------

    const DEPENDENCY_DOMAIN = Object.freeze({
        KNOWLEDGE: "KNOWLEDGE",   // e.g. RP-030-CONTENT — human/community governed content
        SOFTWARE: "SOFTWARE",     // a Repair Queue entry that is not a "-CONTENT" id
        UNKNOWN: "UNKNOWN"        // no Repair Queue reference exists for this blocker at all
    });

    const CONTENT_REPAIR_ID_PATTERN = /-CONTENT$/;

    function classifyDependencyDomain(blockingDependencyEntry) {
        const rq = blockingDependencyEntry && blockingDependencyEntry.repairQueue;
        if (!rq || rq.referenced !== true || !rq.id) {
            return {
                domain: DEPENDENCY_DOMAIN.UNKNOWN,
                reason: "No Repair Queue entry is referenced for this dependency — cannot classify content vs. code without one (Rule 62)."
            };
        }
        if (CONTENT_REPAIR_ID_PATTERN.test(rq.id)) {
            return {
                domain: DEPENDENCY_DOMAIN.KNOWLEDGE,
                reason: `Repair Queue id "${rq.id}" matches the repository's content-repair naming convention (suffix "-CONTENT").`
            };
        }
        return {
            domain: DEPENDENCY_DOMAIN.SOFTWARE,
            reason: `Repair Queue id "${rq.id}" does not match the content-repair naming convention — treated as a software/code dependency, addressable through capability-repair-planner.js's own BUILD_DEPENDENCY step.`
        };
    }

    // -----------------------------------------------------------------
    // 2. DEPENDENCY-ID PARSING — fails closed, never guesses
    //    Expected real shape (confirmed live against
    //    capability-self-diagnosis.js's CAPABILITY_REGISTRY and
    //    capability-repair-planner.js's REPAIR_QUEUE_REFERENCE_TABLE):
    //      "<capabilityId>:<dimension>" where capabilityId may itself
    //      contain ":" (e.g. "language:sw" + ":vocabulary" ->
    //      "language:sw:vocabulary").
    // -----------------------------------------------------------------

    function parseDependency(dependency, capabilityId) {
        if (typeof dependency !== "string" || !dependency) {
            return { parsed: false, reason: "Dependency id is missing or not a string." };
        }
        if (typeof capabilityId !== "string" || !capabilityId) {
            return { parsed: false, reason: "Capability id is missing or not a string." };
        }
        const prefix = capabilityId + ":";
        if (dependency.indexOf(prefix) !== 0) {
            return { parsed: false, reason: `Dependency "${dependency}" does not start with capability id "${capabilityId}:" — refusing to guess a dimension.` };
        }
        const dimension = dependency.slice(prefix.length);
        if (!dimension) {
            return { parsed: false, reason: `Dependency "${dependency}" has no dimension segment after the capability id.` };
        }
        // language:<code>:<dimension> is the only real pattern seen in
        // this repository today (capability-self-diagnosis.js's
        // CAPABILITY_REGISTRY id "language:sw"); parse the language
        // code only when the capability id itself matches that shape,
        // never inferred otherwise.
        const capParts = capabilityId.split(":");
        const languageCode = (capParts.length === 2 && capParts[0] === "language") ? capParts[1] : null;
        return { parsed: true, dimension, languageCode };
    }

    // -----------------------------------------------------------------
    // 3. REQUEST STATUS — separate taxonomy from PACK_STATES
    //    (cozy-language-pack-registry.js) and from RP-029-B's own
    //    reviewState. Never written back into either.
    // -----------------------------------------------------------------

    const REQUEST_STATUS = Object.freeze({
        REQUESTED: "REQUESTED",                     // request created, no contribution yet
        CONTRIBUTION_RECEIVED: "CONTRIBUTION_RECEIVED", // a contribution reached SUBMITTED in the real review pipeline
        QUARANTINED: "QUARANTINED",                  // real safety gate returned UNCERTAIN/HIGH_RISK
        REJECTED: "REJECTED",                        // real pipeline rejected the most recent contribution attempt
        PROMOTION_PENDING: "PROMOTION_PENDING",       // Rule 82 gate (templates axis) reported ELIGIBLE — see rule82GateCaveat
        PROMOTION_BLOCKED: "PROMOTION_BLOCKED",       // Rule 82 gate reported LOCKED
        PROMOTED: "PROMOTED"                          // structurally unreachable via any mutator in this repository today;
                                                       // retained only so the taxonomy is complete and honest, never set by this file
    });

    const RULE82_GATE_CAVEAT =
        "evaluateRule82Gate() evaluates cozy-language-registry.js's response-template " +
        "completeness axis (RP-027), not this request's vocabulary-content dependency " +
        "(RP-030). An ELIGIBLE result here does not mean the vocabulary content itself " +
        "has been verified. See this file's header for why.";

    // Governance requirements are a fixed restatement of Rule 82
    // (docs/builder/rules/27-language-availability-verification-rule.md)
    // and Rule 62 (docs/builder/rules/07-repair-queue-rule.md) — quoted
    // here as paraphrase/pointer, not copied verbatim, and never used
    // to fabricate an evaluation result.
    const GOVERNANCE_REQUIREMENTS = Object.freeze([
        "Real language resources must exist (fluent speaker / reviewed reference source) — Rule 82 condition 1.",
        "Reviewed content must be committed, not live/uncontrolled machine translation — Rule 82 conditions 2-3.",
        "The content's own tests must exist and pass before any promotion — Rule 82 condition 4.",
        "Runtime behavior must be actually observed, or honestly recorded NOT_TESTED_LIVE — Rule 82 condition 5.",
        "The finding stays tracked in the Repair Queue (RP-030-CONTENT) until its own governance criteria are met — Rule 62."
    ]);

    const PROVENANCE_REQUIREMENTS = Object.freeze([
        "contributorId (pseudonymized upstream by cozy-knowledge-review.js's audit trail)",
        "consent.acknowledged === true (enforced by cozy-knowledge-contribution-core.js's validateDraft())",
        "source / sourceType (COMMUNITY, DOCUMENT, BOOK, etc. — cozy-language-pack-registry.js SOURCE_TYPES)",
        "timestamp (recorded automatically by the review pipeline and the pack registry)",
        "license state (defaults to LICENSE_UNKNOWN, never treated as approved — cozy-language-pack-registry.js)"
    ]);

    // -----------------------------------------------------------------
    // 4. IN-MEMORY REQUEST STORE
    // -----------------------------------------------------------------

    let nextRequestSeq = 1;
    const requests = new Map(); // requestId -> request record

    function cloneRequest(r) { return JSON.parse(JSON.stringify(r)); }

    function makeRequestId(capabilityId, dependency) {
        const safeCap = String(capabilityId).replace(/[^a-zA-Z0-9]+/g, "-");
        const safeDep = String(dependency).replace(/[^a-zA-Z0-9]+/g, "-");
        return `AQR-${safeCap}-${safeDep}-${nextRequestSeq++}`;
    }

    // -----------------------------------------------------------------
    // 5. createAcquisitionRequest()
    // -----------------------------------------------------------------

    function createAcquisitionRequest(question, options) {
        const opts = options || {};
        const planner = opts.repairPlannerEngine || repairPlanner();
        if (!planner || typeof planner.buildPlan !== "function") {
            return { status: "CAPABILITY_UNAVAILABLE", reason: "window.CozyOS.CapabilityRepairPlanner (Phase 5) is not loaded in this runtime." };
        }

        const plan = planner.buildPlan(question, opts.diagnosisEngine);

        if (plan.status === "AMBIGUOUS") {
            return { status: "REJECTED", reason: "UNKNOWN_CAPABILITY", detail: plan.limitations, plan };
        }
        if (plan.status === "INSUFFICIENT_EVIDENCE") {
            return { status: "REJECTED", reason: "INSUFFICIENT_EVIDENCE", detail: plan.limitations, plan };
        }
        if (plan.status === "NOT_BUILDABLE") {
            // buildPlan() itself only reaches NOT_BUILDABLE when the real
            // diagnosis found zero blockers for this capability — i.e.
            // the dependency is not currently missing/incomplete.
            return { status: "NOT_APPLICABLE", reason: "NO_BLOCKER_FOUND", detail: plan.limitations, plan };
        }
        if (!plan.requiredBuilds || plan.requiredBuilds.length === 0) {
            return { status: "NOT_APPLICABLE", reason: "NO_REQUIRED_DEPENDENCY", detail: plan.limitations || ["No REQUIRED-class blocker exists for this capability."], plan };
        }

        // buildPlan() already rank-orders requiredBuilds; the first
        // entry is the same one Phase 4/5's own recommendation targets.
        const top = plan.requiredBuilds[0];
        const domainResult = classifyDependencyDomain(top);

        if (domainResult.domain !== DEPENDENCY_DOMAIN.KNOWLEDGE) {
            return {
                status: "NOT_APPLICABLE",
                reason: "NOT_A_KNOWLEDGE_DEPENDENCY",
                dependencyDomain: domainResult.domain,
                detail: [domainResult.reason, "This module only creates requests for KNOWLEDGE-domain blockers; a SOFTWARE-domain blocker belongs to capability-repair-planner.js's own BUILD_DEPENDENCY step instead."],
                plan
            };
        }

        const parsed = parseDependency(top.dependency, plan.targetCapability);

        const requestId = makeRequestId(plan.targetCapability, top.dependency);
        const record = {
            requestId,
            capability: plan.targetCapability,
            dimension: parsed.parsed ? parsed.dimension : null,
            language: parsed.parsed ? parsed.languageCode : null,
            knowledgeType: parsed.parsed ? parsed.dimension : null, // no richer taxonomy exists in this repo to draw from; same real value, not invented
            dependency: top.dependency,
            reason: `Dependency "${top.dependency}" is currently ${top.status}` +
                (top.confidence ? ` (confidence: ${top.confidence})` : "") +
                " and is blocking full verification of this capability. Real diagnosis evidence: " +
                JSON.stringify(top.evidence || null) + ".",
            relatedRepair: top.repairQueue, // the real, unmodified repairQueue object from buildPlan()
            requestedEvidence: { blockerEvidence: top.evidence || null, dependencyMeta: top.dependencyMeta || null, sourceRegistry: top.sourceRegistry || null },
            status: REQUEST_STATUS.REQUESTED,
            provenanceRequirements: PROVENANCE_REQUIREMENTS,
            governanceRequirements: GOVERNANCE_REQUIREMENTS,
            dependencyDomain: domainResult.domain,
            createdAt: nowISO(),
            updatedAt: nowISO(),
            contributionHistory: [], // append-only; never mutated in place
            rule82GateResult: null
        };

        if (!parsed.parsed) {
            record.parseLimitation = parsed.reason; // honest, never silently dropped
        }

        requests.set(requestId, record);
        return { status: "CREATED", request: cloneRequest(record) };
    }

    // -----------------------------------------------------------------
    // 6. submitAcquisitionContribution()
    // -----------------------------------------------------------------

    function submitAcquisitionContribution(requestId, fields, options) {
        const opts = options || {};
        const record = requests.get(requestId);
        if (!record) {
            return { accepted: false, status: "REQUEST_NOT_FOUND", requestId };
        }
        if (record.status === REQUEST_STATUS.PROMOTED) {
            return { accepted: false, status: "ALREADY_PROMOTED", requestId, note: "No further contribution is meaningful once a request reaches PROMOTED (which no mutator in this repository can actually cause today)." };
        }

        const teach = opts.teachRoutingEngine || teachRouting();
        if (!teach || typeof teach.submitTeachingContribution !== "function") {
            return { accepted: false, status: "CAPABILITY_UNAVAILABLE", requestId, reason: "window.CozyOS.CozyTeachCozyAIRouting (RP-031 Phase 2A) is not loaded in this runtime." };
        }

        const f = fields || {};

        // Fail closed on an obvious language mismatch BEFORE calling the
        // real pipeline — a contribution for the wrong language cannot
        // legitimately satisfy this request, and this check requires no
        // fabrication (it only compares two already-supplied strings).
        if (record.language && f.language && String(f.language).toLowerCase() !== String(record.language).toLowerCase()) {
            return { accepted: false, status: "LANGUAGE_MISMATCH", requestId, expected: record.language, received: f.language };
        }

        const teachResult = teach.submitTeachingContribution(f);

        const historyEntry = { at: nowISO(), teachStatus: teachResult.status };
        record.contributionHistory = record.contributionHistory.concat([historyEntry]);
        record.updatedAt = nowISO();

        let rule82GateResult = null;

        if (teachResult.status === "REJECTED" || teachResult.status === "REJECTED_UNSAFE") {
            record.status = REQUEST_STATUS.REJECTED;
        } else if (teachResult.status === "QUARANTINED") {
            record.status = REQUEST_STATUS.QUARANTINED;
        } else if (teachResult.status === "CAPABILITY_UNAVAILABLE") {
            // Do not change record.status — this is an environment gap,
            // not a judgment on the contribution itself.
        } else if (teachResult.status === "SUBMITTED") {
            record.status = REQUEST_STATUS.CONTRIBUTION_RECEIVED;

            const review = opts.knowledgeReviewEngine || knowledgeReview();
            if (review && typeof review.evaluateRule82Gate === "function" && record.language) {
                // Only ever forwards attestation/testEvidence the caller
                // explicitly supplied — never fabricated by this file.
                const attestation = {};
                if (f.resourceAttestation) attestation.resourcesAttestedBy = f.resourceAttestation;
                if (f.testEvidence) attestation.testEvidence = f.testEvidence;

                rule82GateResult = review.evaluateRule82Gate(record.language, attestation);
                record.rule82GateResult = rule82GateResult;
                record.status = rule82GateResult.promotion === "ELIGIBLE"
                    ? REQUEST_STATUS.PROMOTION_PENDING
                    : REQUEST_STATUS.PROMOTION_BLOCKED;
            }
        }

        requests.set(requestId, record);

        return {
            accepted: teachResult.status === "SUBMITTED",
            requestId,
            status: record.status,
            teachResult,
            rule82Gate: rule82GateResult,
            rule82GateCaveat: rule82GateResult ? RULE82_GATE_CAVEAT : null
        };
    }

    // -----------------------------------------------------------------
    // 7. READ-ONLY ACCESSORS
    // -----------------------------------------------------------------

    function getAcquisitionRequest(requestId) {
        const r = requests.get(requestId);
        return r ? cloneRequest(r) : null;
    }

    function listAcquisitionRequests() {
        return Array.from(requests.values()).map(cloneRequest);
    }

    // -----------------------------------------------------------------
    // 8. EXPORT
    // -----------------------------------------------------------------

    const api = Object.freeze({
        getVersion() { return VERSION; },
        DEPENDENCY_DOMAIN,
        REQUEST_STATUS,
        classifyDependencyDomain,
        createAcquisitionRequest,
        submitAcquisitionContribution,
        getAcquisitionRequest,
        listAcquisitionRequests
    });

    window.CozyOS.CapabilityKnowledgeAcquisition = api;
    window.CozyOS.Modules["capability-knowledge-acquisition"] = Object.freeze({
        version: VERSION,
        description: "Phase 7 — governed knowledge-acquisition request + contribution wrapper. Consumes Phase 5's capability-repair-planner.js (read-only) to derive a structured acquisition request for a real KNOWLEDGE-domain blocker (never a software one), and routes real contributions through the existing, unmodified cozy-teach-cozyai-routing-core.js pipeline. No mutator anywhere in this file can set a pack's resourceState or a capability's overallStatus; both are always re-derived live from the real chain. Never generates, imports, or promotes Kiswahili (or any other) vocabulary."
    });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "CapabilityKnowledgeAcquisition",
                version: VERSION,
                category: "Builder",
                description: "Phase 7 governed knowledge-acquisition request + contribution wrapper (composes Phase 5 repair-planner + RP-031 teach-routing + RP-029-C review only).",
                sourcePath: "core/modules/builder/capability-knowledge-acquisition.js"
            });
        } catch (_e) { /* registration is best-effort, never load-bearing */ }
    }
})();
