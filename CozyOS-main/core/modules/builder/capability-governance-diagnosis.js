/**
 * CozyOS — Capability Governance Diagnosis (Phase 8, extended Phase 10A)
 * File Reference: core/modules/builder/capability-governance-diagnosis.js
 *
 * PHASE 10A ADDENDUM (Step 1 baseline re-audit performed against this
 * exact merged repository before any line below was written)
 *   - Provider-gate correction to the Phase 9 audit: Phase 9 stated
 *     CozyInterpretation/CozyThinking/CozyReasoning have "no provider
 *     registered anywhere in the repo — currently inert." That was true
 *     of the tree Phase 9 was run against, but this merged tree also
 *     contains core/modules/intelligence/ai-bootstrap.js (M366.9),
 *     wired via a real <script> tag on dashboard.html, which DOES call
 *     each engine's own real registerProvider()/registerRule() with a
 *     real (if simple, rule/keyword-based) baseline implementation. That
 *     stack is therefore no longer structurally inert in this baseline —
 *     it is real but deliberately low-capability, honestly self-labeled
 *     ("Living NLU Baseline", "Living Planner Baseline", "Living
 *     Reasoning Baseline"), and never claims deep understanding. This is
 *     a documentation correction only; ai-bootstrap.js is untouched.
 *   - Per Step 6, the header above previously listed WEIGH as a stage
 *     but no `pushTrace("WEIGH", ...)` call existed anywhere in this
 *     file — confirmed by direct inspection, not assumed. A real WEIGH
 *     stage is added below (smallest safe addition): it compares the
 *     chosen top-ranked blocker against any other real candidate
 *     blockers already present in the live plan's `requiredBuilds`,
 *     using the exact same confidence taxonomy capability-self-
 *     diagnosis.js's classifyEvidenceStrength() already established
 *     (`manifest` / `best-effort` / `unverified` →
 *     SOURCE_VERIFIED_LIVE / REFERENCED_NOT_VERIFIED / NO_EVIDENCE) —
 *     reused verbatim, not a second taxonomy.
 *   - Per Phase 9's own "minor, additive gap" finding, every
 *     cognitiveTrace entry now additionally carries `confidence`,
 *     `whatRemainsUnknown`, and `discardedAlternatives`. Each is
 *     populated only from real data already computed at that point in
 *     the call — never a fabricated number or invented alternative.
 *     Where no real confidence concept applies (deterministic rule
 *     evaluation, a plan-status pass-through), the field is the literal
 *     value `NOT_APPLICABLE`, not a guessed score. Where nothing further
 *     is genuinely unknown, `whatRemainsUnknown` is an empty array, not
 *     omitted. This is purely additive — `operation`/`description`/
 *     `input`/`output` are unchanged, and no existing trace op name
 *     moved or was removed. Phase 8 test 38 continues to pass unmodified.
 *   - Nothing else in this file changed. Phase 8's own header below is
 *     preserved verbatim as the historical record of that phase.
 *
 * BASELINE (Phase 8 Step 1 audit, performed against the real repository
 * before any line of this file was written)
 *   - capability-repair-planner.js (Phase 5) buildPlan() is unmodified and
 *     is the only source of a ranked, classified blocker list — read-only.
 *   - capability-knowledge-acquisition.js (Phase 7) is unmodified. Its
 *     REQUEST_STATUS taxonomy (REQUESTED / CONTRIBUTION_RECEIVED /
 *     QUARANTINED / REJECTED / PROMOTION_PENDING / PROMOTION_BLOCKED /
 *     PROMOTED) is reused verbatim below, never redefined.
 *   - cozy-knowledge-review.js's evaluateRule82Gate() was independently
 *     re-read this pass. Two things confirmed, neither previously
 *     disclosed at this level of precision:
 *       1. `runtimeBehaviorObserved` is unconditionally hard-coded to
 *          `NOT_TESTED_LIVE` / `false` (Rule 81 — no DOM/browser runtime
 *          in this environment). Because `allTrue` requires it, Rule 82's
 *          gate is STRUCTURALLY UNREACHABLE at "ELIGIBLE" in this
 *          environment today, independent of the RP-027/RP-030 axis
 *          mismatch Phase 7 already disclosed. This is stated plainly in
 *          every reevaluateCapability() result that reaches a gate call
 *          (`rule82StructurallyUnreachable: true`) rather than left
 *          implicit.
 *       2. It has no separate "review pending" sub-state of its own — a
 *          contribution is SUBMITTED or it is not. The closest real
 *          analogue to "review pending" is capability-knowledge-
 *          acquisition.js's own CONTRIBUTION_RECEIVED status, which is
 *          reached only when a SUBMITTED contribution could not yet be
 *          run through the gate (no review engine loaded, or the
 *          request's language could not be parsed). This file's
 *          GOVERNANCE_STATUS.REVIEW_PENDING maps to exactly that real
 *          state — it is not a new invented review phase.
 *   - unified-capability-contract.js's DIMENSION_SIGNAL_MAP (MD-028) was
 *     re-read this pass. `cozy-language-pack-registry`'s map already
 *     covers NOT_READY and COMMUNITY_BUILDING (both "negative") — the
 *     only real resourceState values any live code path in this
 *     repository can currently produce, since requestPromotion() is
 *     always BLOCKED and no mutator can set AVAILABLE/VALIDATING/
 *     DEPRECATED. MD-028 (the missing map entries for those three
 *     values) is therefore CONFIRMED STILL DORMANT — not an active
 *     blocker to anything this file does — and is left untouched, per
 *     the phase's own Step 5 rule. See capability-governance-
 *     diagnosis.test.js test 14 for the executable proof of this claim.
 *   - Rule 82 axis mismatch (RP-027 templates vs RP-030 vocabulary
 *     content): re-confirmed unchanged. This file does not attempt a
 *     generic/parameterized Rule 82 rewrite — Step 6 of the phase spec
 *     requires that only if a real architectural need forces it, and
 *     nothing here forces it. The mismatch is surfaced, not fixed.
 *
 * WHAT THIS FILE ADDS (and nothing more)
 *   1. GOVERNANCE_STATUS — a narrow, additive vocabulary layered ONLY on
 *      top of capability-repair-planner.js's DEPENDENCY_CLASS/domain
 *      classification and capability-knowledge-acquisition.js's own
 *      REQUEST_STATUS. It reuses both verbatim wherever they already say
 *      what is needed (per the phase's own "do not create unnecessary
 *      duplicate state taxonomies" rule) and adds only the handful of
 *      narrative states neither source has: SOFTWARE_DEPENDENCY,
 *      NOT_APPLICABLE_NO_BLOCKER, KNOWLEDGE_MISSING, SAFETY_BLOCKED (a
 *      disambiguation of acquisition's own REJECTED/QUARANTINED by real
 *      teach-pipeline status, not a new judgment), CONTRIBUTION_REJECTED
 *      (the non-safety half of that same disambiguation), REVIEW_PENDING,
 *      RULE_82_BLOCKED, and AVAILABLE_BUT_CAPABILITY_STILL_INCOMPLETE.
 *   2. reevaluateCapability(question, options) — read-only. Calls the
 *      real, live, uncached Phase 5 buildPlan() (which itself calls
 *      Phase 4 -> Phase 3 -> Phase 2 -> the real registries) and, when the
 *      top blocker is KNOWLEDGE-domain, looks up (never creates) a
 *      matching Phase 7 acquisition request to report its real governance
 *      state. It never calls createAcquisitionRequest() or
 *      submitAcquisitionContribution() itself.
 *   3. compareDiagnoses(previous, current) — pure function, no side
 *      effects, no stored history. Diffs two reevaluateCapability()
 *      results and reports NO_CHANGE / BLOCKER_CHANGED / STATUS_CHANGED /
 *      EVIDENCE_CHANGED / GOVERNANCE_STATE_CHANGED / DEPENDENCY_RESOLVED /
 *      NEW_DEPENDENCY_DISCOVERED / NO_PRIOR_DIAGNOSIS.
 *   4. explain(reevaluation) — formats the real fields already present on
 *      a reevaluateCapability() result into a human-readable narrative
 *      using generic, capability-agnostic sentence templates (the same
 *      pattern as Phase 4's own renderHumanReadable()) — never a
 *      hard-coded per-capability demo string.
 *   5. A small, inspectable `cognitiveTrace` array attached to every
 *      reevaluateCapability() result, one entry per real stage already
 *      computed (PONDER/TRIANGULATE/UNTANGLE/SIFT/WEIGH/CRYSTALLIZE/
 *      RECKON), each carrying its own real input/output — not 17
 *      separate engines, one pipeline with named, inspectable steps.
 *
 * NO FABRICATION / NO FALSE GREEN
 *   - This file has no mutator. It cannot set a pack's resourceState, a
 *     capability's overallStatus, or an acquisition request's status.
 *     Every fact reported is re-read live on every call.
 *   - It never fabricates consent, provenance, or attestation, and never
 *     calls a function that would (it never itself calls
 *     evaluateRule82Gate() — that already happened, if at all, inside
 *     Phase 7's submitAcquisitionContribution(); this file only reads the
 *     stored `rule82GateResult` off the acquisition record).
 *   - COMMUNITY_BUILDING is never treated as AVAILABLE; AVAILABLE (were it
 *     ever reachable) is never treated as VERIFIED. Each is read and
 *     reported as exactly what the real upstream layer says it is.
 *
 * PHASE BOUNDARY
 *   Phase 8 delivers a read-only re-evaluation + change-detection layer
 *   only. It does not modify capability-repair-planner.js, capability-
 *   knowledge-acquisition.js, cozy-knowledge-review.js, cozy-knowledge-
 *   safety-gate.js, cozy-teach-cozyai-routing-core.js, cozy-language-pack-
 *   registry.js, unified-capability-contract.js (MD-028 untouched), or
 *   Rule 82's own rule file. STOP AFTER PHASE 8.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["capability-governance-diagnosis"]) return;

    const VERSION = "0.2.0-PHASE10A";

    // -----------------------------------------------------------------
    // 0. DEPENDENCY COMPOSITION (read real APIs; never fabricate them)
    // -----------------------------------------------------------------

    function repairPlanner() { return (window.CozyOS && window.CozyOS.CapabilityRepairPlanner) || null; }
    function acquisition() { return (window.CozyOS && window.CozyOS.CapabilityKnowledgeAcquisition) || null; }

    // -----------------------------------------------------------------
    // 0a. TRACE_CONFIDENCE — Phase 10A addition. Reuses capability-self-
    //     diagnosis.js's own classifyEvidenceStrength() taxonomy
    //     verbatim (that file's real, existing 'manifest'/'best-effort'/
    //     'unverified' -> strength labels), plus one additive value,
    //     NOT_APPLICABLE, for trace stages that are deterministic rule
    //     evaluations or pass-throughs rather than confidence-scored
    //     judgments. Never a second, competing confidence taxonomy.
    // -----------------------------------------------------------------

    const TRACE_CONFIDENCE = Object.freeze({
        SOURCE_VERIFIED_LIVE: "SOURCE_VERIFIED_LIVE",
        REFERENCED_NOT_VERIFIED: "REFERENCED_NOT_VERIFIED",
        NO_EVIDENCE: "NO_EVIDENCE",
        UNKNOWN_CONFIDENCE_LEVEL: "UNKNOWN_CONFIDENCE_LEVEL",
        NOT_APPLICABLE: "NOT_APPLICABLE"
    });

    function describeConfidence(rawConfidence) {
        if (rawConfidence === "manifest") return TRACE_CONFIDENCE.SOURCE_VERIFIED_LIVE;
        if (rawConfidence === "best-effort") return TRACE_CONFIDENCE.REFERENCED_NOT_VERIFIED;
        if (rawConfidence === "unverified") return TRACE_CONFIDENCE.NO_EVIDENCE;
        return TRACE_CONFIDENCE.UNKNOWN_CONFIDENCE_LEVEL;
    }

    // -----------------------------------------------------------------
    // 0b. OPERATION_SEMANTICS — Phase 10A, Step 3/4's "smallest additive
    //     contract necessary to represent cognitive operations."
    //     Every one of the 16 requested operation names gets a real,
    //     inspectable semantic purpose here — a shared vocabulary, not
    //     16 separate engines. `emittedByThisPipeline: true` marks the
    //     operations this file's reevaluateCapability() actually
    //     computes and pushes onto cognitiveTrace today (PONDER,
    //     TRIANGULATE, UNTANGLE, SIFT, WEIGH, CRYSTALLIZE, RECKON — the
    //     real Phase 8 pipeline, Phase 10A's real WEIGH addition). The
    //     remaining 9 names are defined here as real, inspectable
    //     semantics but are honestly marked `emittedByThisPipeline:
    //     false` — this file has no real computed step that corresponds
    //     to CONTEMPLATE/THINK/HOME_IN/MUSE/FATHOM/MULL/COGITATE/FIGURE/
    //     HONE today, and per Step 8's "no fabrication" rule, a
    //     pushTrace() call is never emitted for an operation with no
    //     real computation behind it. A future phase that adds a real
    //     computed step matching one of these semantics may set its flag
    //     to true and start emitting it — this contract does not need to
    //     change shape when that happens.
    // -----------------------------------------------------------------

    const OPERATION_SEMANTICS = Object.freeze({
        PONDER: { purpose: "Consider candidate explanations.", emittedByThisPipeline: true },
        CONTEMPLATE: { purpose: "Retain multiple hypotheses without premature commitment.", emittedByThisPipeline: false },
        THINK: { purpose: "General-purpose deliberation over available evidence.", emittedByThisPipeline: false },
        HOME_IN: { purpose: "Narrow candidates using evidence.", emittedByThisPipeline: false },
        MUSE: { purpose: "Generate alternative hypotheses without treating them as facts.", emittedByThisPipeline: false },
        FATHOM: { purpose: "Seek the deepest evidence-supported explanation.", emittedByThisPipeline: false },
        MULL: { purpose: "Reconsider a conclusion against contradictory evidence.", emittedByThisPipeline: false },
        SIFT: { purpose: "Discard unsupported or weak candidates.", emittedByThisPipeline: true },
        CRYSTALLIZE: { purpose: "Convert surviving evidence into a structured conclusion.", emittedByThisPipeline: true },
        TRIANGULATE: { purpose: "Compare independent evidence sources.", emittedByThisPipeline: true },
        UNTANGLE: { purpose: "Separate apparently conflicting dimensions.", emittedByThisPipeline: true },
        WEIGH: { purpose: "Compare evidence by relevance/confidence/authority.", emittedByThisPipeline: true },
        COGITATE: { purpose: "Perform deliberate multi-step consideration.", emittedByThisPipeline: false },
        FIGURE: { purpose: "Derive an actionable relationship.", emittedByThisPipeline: false },
        HONE: { purpose: "Refine an existing conclusion or plan.", emittedByThisPipeline: false },
        RECKON: { purpose: "Produce the current best-supported conclusion while retaining uncertainty.", emittedByThisPipeline: true }
    });

    // -----------------------------------------------------------------
    // 1. GOVERNANCE_STATUS — additive narrative layer only
    // -----------------------------------------------------------------

    const GOVERNANCE_STATUS = Object.freeze({
        SOFTWARE_DEPENDENCY: "SOFTWARE_DEPENDENCY",
        NOT_APPLICABLE_NO_BLOCKER: "NOT_APPLICABLE_NO_BLOCKER",
        KNOWLEDGE_MISSING: "KNOWLEDGE_MISSING",
        // Below this line, values are Phase 7's own REQUEST_STATUS
        // strings reused verbatim except where explicitly disambiguated:
        KNOWLEDGE_REQUESTED: "REQUESTED",                 // == acquisition.REQUEST_STATUS.REQUESTED
        REVIEW_PENDING: "CONTRIBUTION_RECEIVED",           // == acquisition.REQUEST_STATUS.CONTRIBUTION_RECEIVED
        SAFETY_BLOCKED: "SAFETY_BLOCKED",                  // disambiguated: QUARANTINED, or REJECTED with a safety-origin teachStatus
        CONTRIBUTION_REJECTED: "CONTRIBUTION_REJECTED",    // disambiguated: REJECTED for a non-safety reason (consent/validation)
        RULE_82_BLOCKED: "PROMOTION_BLOCKED",              // == acquisition.REQUEST_STATUS.PROMOTION_BLOCKED
        PROMOTION_PENDING: "PROMOTION_PENDING",            // == acquisition.REQUEST_STATUS.PROMOTION_PENDING
        PROMOTED: "PROMOTED",                              // == acquisition.REQUEST_STATUS.PROMOTED (unreachable today; see header)
        AVAILABLE_BUT_CAPABILITY_STILL_INCOMPLETE: "AVAILABLE_BUT_CAPABILITY_STILL_INCOMPLETE"
    });

    const SAFETY_ORIGIN_TEACH_STATUSES = Object.freeze(["QUARANTINED", "REJECTED_UNSAFE"]);

    function mapAcquisitionRequestToGovernanceStatus(requestRecord) {
        if (!requestRecord) return null;
        const st = requestRecord.status;
        if (st === "REQUESTED") return GOVERNANCE_STATUS.KNOWLEDGE_REQUESTED;
        if (st === "CONTRIBUTION_RECEIVED") return GOVERNANCE_STATUS.REVIEW_PENDING;
        if (st === "QUARANTINED") return GOVERNANCE_STATUS.SAFETY_BLOCKED;
        if (st === "PROMOTION_PENDING") return GOVERNANCE_STATUS.PROMOTION_PENDING;
        if (st === "PROMOTION_BLOCKED") return GOVERNANCE_STATUS.RULE_82_BLOCKED;
        if (st === "PROMOTED") return GOVERNANCE_STATUS.PROMOTED;
        if (st === "REJECTED") {
            const history = requestRecord.contributionHistory || [];
            const last = history.length ? history[history.length - 1] : null;
            const safetyOrigin = last && SAFETY_ORIGIN_TEACH_STATUSES.indexOf(last.teachStatus) !== -1;
            return safetyOrigin ? GOVERNANCE_STATUS.SAFETY_BLOCKED : GOVERNANCE_STATUS.CONTRIBUTION_REJECTED;
        }
        return null; // unrecognized status — never guessed
    }

    // -----------------------------------------------------------------
    // 2. Find the most relevant existing acquisition request for a
    //    dependency (never creates one).
    // -----------------------------------------------------------------

    function findRequestForDependency(acq, dependency, requestId) {
        if (requestId) {
            const byId = acq.getAcquisitionRequest(requestId);
            if (byId && byId.dependency === dependency) return byId;
        }
        const all = acq.listAcquisitionRequests().filter((r) => r.dependency === dependency);
        if (all.length === 0) return null;
        // Most recently updated wins — a real, inspectable tie-break,
        // never an arbitrary first-match.
        all.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        return all[0];
    }

    // -----------------------------------------------------------------
    // 3. reevaluateCapability(question, options)
    // -----------------------------------------------------------------

    function reevaluateCapability(question, options) {
        const opts = options || {};
        const planner = opts.repairPlannerEngine || repairPlanner();
        const acq = opts.acquisitionEngine || acquisition();
        const trace = [];

        // Phase 10A: pushTrace() gains three optional, additive fields.
        // Every existing call site below is updated to pass real values
        // (never fabricated); a call site with nothing genuinely
        // computable for a field passes NOT_APPLICABLE / [] explicitly,
        // never omits the field.
        function pushTrace(operation, description, input, output, meta) {
            const m = meta || {};
            trace.push({
                operation,
                description,
                input,
                output,
                confidence: m.confidence || TRACE_CONFIDENCE.NOT_APPLICABLE,
                whatRemainsUnknown: m.whatRemainsUnknown || [],
                discardedAlternatives: m.discardedAlternatives || []
            });
        }

        if (!planner || typeof planner.buildPlan !== "function") {
            return { status: "CAPABILITY_UNAVAILABLE", reason: "window.CozyOS.CapabilityRepairPlanner (Phase 5) is not loaded in this runtime.", cognitiveTrace: trace };
        }
        if (!acq || typeof acq.classifyDependencyDomain !== "function") {
            return { status: "CAPABILITY_UNAVAILABLE", reason: "window.CozyOS.CapabilityKnowledgeAcquisition (Phase 7) is not loaded in this runtime.", cognitiveTrace: trace };
        }

        pushTrace("PONDER", "Inspect the real live diagnosis/plan before drawing any conclusion.", { question }, null, {
            whatRemainsUnknown: ["real plan not yet computed"]
        });
        const plan = planner.buildPlan(question, opts.diagnosisEngine);
        pushTrace("PONDER", "Real plan received from capability-repair-planner.js.", null, { status: plan.status, targetCapability: plan.targetCapability || null }, {
            whatRemainsUnknown: plan.status !== "READY" ? [`plan status is ${plan.status}, not READY`] : []
        });

        if (plan.status === "AMBIGUOUS" || plan.status === "INSUFFICIENT_EVIDENCE") {
            return { status: plan.status, plan, governanceStatus: null, reason: (plan.limitations || [])[0] || plan.status, cognitiveTrace: trace };
        }

        const overallStatus = plan.diagnosis ? plan.diagnosis.overallStatus : null;

        if (plan.status === "NOT_BUILDABLE") {
            pushTrace("RECKON", "No REQUIRED blocker exists for this capability right now.", { blockingDependencies: (plan.blockingDependencies || []).length }, { overallStatus });
            // (no meta override — genuinely nothing left unknown or discarded at this branch)
            return {
                status: "EVALUATED",
                plan,
                targetCapability: plan.targetCapability,
                overallStatus,
                topBlocker: null,
                dependencyDomain: null,
                governanceStatus: GOVERNANCE_STATUS.NOT_APPLICABLE_NO_BLOCKER,
                acquisitionRequest: null,
                rule82GateResult: null,
                rule82StructurallyUnreachable: null,
                cognitiveTrace: trace
            };
        }

        if (plan.status !== "READY") {
            // DEPENDENCY_CONFLICT / BLOCKED — real edge cases from Phase
            // 5's own validation. Disclosed as-is, never reinterpreted.
            return { status: plan.status, plan, governanceStatus: null, reason: (plan.limitations || [])[0] || plan.status, cognitiveTrace: trace };
        }

        const top = plan.requiredBuilds[0];
        const otherCandidates = plan.requiredBuilds.slice(1);
        pushTrace(
            "WEIGH",
            "Compare the top-ranked blocker against any other real candidate blockers already present in the live plan's requiredBuilds, by the plan's own real confidence/evidence taxonomy — justifies rank, does not re-rank (capability-repair-planner.js has already ordered requiredBuilds; this only makes that existing ordering's evidentiary basis inspectable).",
            { candidateCount: plan.requiredBuilds.length, chosen: top.dependency },
            { chosenConfidence: top.confidence || null, otherCandidateCount: otherCandidates.length },
            {
                confidence: describeConfidence(top.confidence),
                whatRemainsUnknown: top.confidence !== "manifest" ? ["runtimeBehaviorObserved not verified live for the chosen blocker"] : [],
                discardedAlternatives: otherCandidates.map((c) => ({ dependency: c.dependency, confidence: c.confidence || null, status: c.status || null }))
            }
        );

        pushTrace("TRIANGULATE", "Compare the top-ranked blocker against its own registry evidence and Repair Queue reference.", { dependency: top.dependency, status: top.status }, { evidence: top.evidence, repairQueue: top.repairQueue }, {
            confidence: describeConfidence(top.confidence)
        });

        const domainResult = acq.classifyDependencyDomain(top);
        pushTrace("UNTANGLE", "Distinguish a software blocker from a knowledge blocker using the real Repair Queue id convention.", { repairQueueId: top.repairQueue && top.repairQueue.id }, domainResult, {
            whatRemainsUnknown: domainResult.domain === acq.DEPENDENCY_DOMAIN.UNKNOWN ? [domainResult.reason] : []
        });

        if (domainResult.domain !== acq.DEPENDENCY_DOMAIN.KNOWLEDGE) {
            pushTrace("RECKON", "Top blocker is not knowledge-domain; this layer has nothing further to add.", null, { governanceStatus: GOVERNANCE_STATUS.SOFTWARE_DEPENDENCY }, {
                confidence: describeConfidence(top.confidence)
            });
            return {
                status: "EVALUATED",
                plan,
                targetCapability: plan.targetCapability,
                overallStatus,
                topBlocker: top,
                dependencyDomain: domainResult.domain,
                governanceStatus: GOVERNANCE_STATUS.SOFTWARE_DEPENDENCY,
                acquisitionRequest: null,
                rule82GateResult: null,
                rule82StructurallyUnreachable: null,
                cognitiveTrace: trace
            };
        }

        pushTrace("SIFT", "Discard: 'no acquisition request exists yet' as a candidate explanation, by actually checking the store.", { dependency: top.dependency }, null, {
            whatRemainsUnknown: ["whether a real acquisition request exists for this dependency"]
        });
        const request = findRequestForDependency(acq, top.dependency, opts.requestId);
        pushTrace("SIFT", "Result of the real acquisition-request lookup.", null, request ? { requestId: request.requestId, status: request.status } : null, {
            confidence: request ? TRACE_CONFIDENCE.SOURCE_VERIFIED_LIVE : TRACE_CONFIDENCE.NO_EVIDENCE,
            whatRemainsUnknown: request ? [] : ["no acquisition request currently exists for this dependency"]
        });

        let governanceStatus;
        let rule82GateResult = null;
        let rule82StructurallyUnreachable = null;

        if (!request) {
            governanceStatus = GOVERNANCE_STATUS.KNOWLEDGE_MISSING;
        } else {
            governanceStatus = mapAcquisitionRequestToGovernanceStatus(request) || GOVERNANCE_STATUS.KNOWLEDGE_REQUESTED;
            rule82GateResult = request.rule82GateResult || null;
            if (rule82GateResult) {
                // Rule 81/82: runtimeBehaviorObserved is unconditionally
                // NOT_TESTED_LIVE in this environment, so "ELIGIBLE" can
                // never actually be reached here today — stated plainly,
                // never left for the caller to discover by accident.
                rule82StructurallyUnreachable = rule82GateResult.requirements
                    && rule82GateResult.requirements.runtimeBehaviorObserved
                    && rule82GateResult.requirements.runtimeBehaviorObserved.state === "NOT_TESTED_LIVE";
            }
        }
        pushTrace("CRYSTALLIZE", "Produce the smallest accurate governance-state label for the current evidence.", null, { governanceStatus }, {
            confidence: describeConfidence(top.confidence),
            whatRemainsUnknown: rule82StructurallyUnreachable ? ["Rule 82 ELIGIBLE cannot currently be reached — runtimeBehaviorObserved stays NOT_TESTED_LIVE in this environment"] : []
        });

        // AVAILABLE_BUT_CAPABILITY_STILL_INCOMPLETE: a promoted/available
        // dependency whose capability nonetheless still isn't VERIFIED
        // (a different, real, currently-unrelated blocker would have to
        // be the one actually surfaced by `top` in that scenario — this
        // branch documents the label for when the acquisition record
        // itself reports PROMOTED while overallStatus still is not
        // VERIFIED; it is never inferred from a status this repository
        // cannot yet produce).
        if (governanceStatus === GOVERNANCE_STATUS.PROMOTED && overallStatus !== "VERIFIED") {
            governanceStatus = GOVERNANCE_STATUS.AVAILABLE_BUT_CAPABILITY_STILL_INCOMPLETE;
        }

        pushTrace("RECKON", "Derive the resulting capability-level facts from the real, live evidence gathered above — nothing cached, nothing assumed.", null, { overallStatus, governanceStatus }, {
            confidence: describeConfidence(top.confidence),
            whatRemainsUnknown: [
                ...(rule82StructurallyUnreachable ? ["Rule 82 ELIGIBLE cannot currently be reached in this environment"] : []),
                ...(governanceStatus === GOVERNANCE_STATUS.AVAILABLE_BUT_CAPABILITY_STILL_INCOMPLETE ? ["a different, real blocker beyond this one still keeps overallStatus from VERIFIED"] : [])
            ]
        });

        return {
            status: "EVALUATED",
            plan,
            targetCapability: plan.targetCapability,
            overallStatus,
            topBlocker: top,
            dependencyDomain: domainResult.domain,
            governanceStatus,
            acquisitionRequest: request,
            rule82GateResult,
            rule82StructurallyUnreachable,
            cognitiveTrace: trace
        };
    }

    // -----------------------------------------------------------------
    // 4. compareDiagnoses(previous, current) — pure, no side effects
    // -----------------------------------------------------------------

    const CHANGE = Object.freeze({
        NO_PRIOR_DIAGNOSIS: "NO_PRIOR_DIAGNOSIS",
        NO_CHANGE: "NO_CHANGE",
        BLOCKER_CHANGED: "BLOCKER_CHANGED",
        STATUS_CHANGED: "STATUS_CHANGED",
        EVIDENCE_CHANGED: "EVIDENCE_CHANGED",
        GOVERNANCE_STATE_CHANGED: "GOVERNANCE_STATE_CHANGED",
        DEPENDENCY_RESOLVED: "DEPENDENCY_RESOLVED",
        NEW_DEPENDENCY_DISCOVERED: "NEW_DEPENDENCY_DISCOVERED"
    });

    function compareDiagnoses(previous, current) {
        if (!previous) return { changes: [CHANGE.NO_PRIOR_DIAGNOSIS], previous: null, current };
        const changes = [];

        if (previous.overallStatus !== current.overallStatus) changes.push(CHANGE.STATUS_CHANGED);

        const prevDep = previous.topBlocker ? previous.topBlocker.dependency : null;
        const currDep = current.topBlocker ? current.topBlocker.dependency : null;

        if (prevDep && !currDep) {
            changes.push(CHANGE.DEPENDENCY_RESOLVED);
        } else if (!prevDep && currDep) {
            changes.push(CHANGE.NEW_DEPENDENCY_DISCOVERED);
        } else if (prevDep && currDep && prevDep !== currDep) {
            changes.push(CHANGE.DEPENDENCY_RESOLVED, CHANGE.NEW_DEPENDENCY_DISCOVERED);
        } else if (prevDep && currDep && prevDep === currDep) {
            const prevStatus = previous.topBlocker.status;
            const currStatus = current.topBlocker.status;
            if (prevStatus !== currStatus) changes.push(CHANGE.BLOCKER_CHANGED);
            const prevEvidence = JSON.stringify(previous.topBlocker.evidence || null);
            const currEvidence = JSON.stringify(current.topBlocker.evidence || null);
            if (prevEvidence !== currEvidence) changes.push(CHANGE.EVIDENCE_CHANGED);
        }

        if (previous.governanceStatus !== current.governanceStatus) changes.push(CHANGE.GOVERNANCE_STATE_CHANGED);

        if (changes.length === 0) changes.push(CHANGE.NO_CHANGE);

        return {
            changes,
            previous: { overallStatus: previous.overallStatus, topBlockerDependency: prevDep, governanceStatus: previous.governanceStatus },
            current: { overallStatus: current.overallStatus, topBlockerDependency: currDep, governanceStatus: current.governanceStatus }
        };
    }

    // -----------------------------------------------------------------
    // 5. explain(reevaluation) — generic templates, real values only
    // -----------------------------------------------------------------

    const EXPLANATION_TEMPLATES = Object.freeze({
        SOFTWARE_DEPENDENCY: (r) => `I checked "${r.targetCapability}". The blocking dependency "${r.topBlocker.dependency}" is a software dependency, not a knowledge dependency, so a build/repair plan can target it directly.`,
        NOT_APPLICABLE_NO_BLOCKER: (r) => `I checked "${r.targetCapability}". No required blocker was found; overall status is currently ${r.overallStatus}.`,
        KNOWLEDGE_MISSING: (r) => `I checked "${r.targetCapability}". "${r.topBlocker.dependency}" is currently ${r.topBlocker.status}. This is a knowledge dependency, not a missing software module, and no acquisition request exists for it yet.`,
        REQUESTED: (r) => `A governed acquisition request exists for "${r.topBlocker.dependency}" (request ${r.acquisitionRequest.requestId}), but no contribution has been attached to it yet.`,
        CONTRIBUTION_RECEIVED: (r) => `A contribution for "${r.topBlocker.dependency}" was submitted and accepted into the review pipeline; this layer could not yet evaluate the Rule 82 gate for it.`,
        SAFETY_BLOCKED: (r) => `A contribution for "${r.topBlocker.dependency}" was blocked by the safety gate.`,
        CONTRIBUTION_REJECTED: (r) => `A contribution for "${r.topBlocker.dependency}" was rejected by the review pipeline (not a safety rejection) — see its contributionHistory for the real reason.`,
        PROMOTION_BLOCKED: (r) => `Rule 82 evaluated the contribution for "${r.topBlocker.dependency}" and reported LOCKED` + (r.rule82StructurallyUnreachable ? "; note that runtimeBehaviorObserved is always NOT_TESTED_LIVE in this environment, so ELIGIBLE cannot currently be reached at all." : "."),
        PROMOTION_PENDING: (r) => `Rule 82 reported ELIGIBLE for "${r.topBlocker.dependency}", but no mutator in this repository can currently move it to PROMOTED.`,
        PROMOTED: (r) => `"${r.topBlocker.dependency}" reports PROMOTED, but that state is not currently reachable by any real code path in this repository.`,
        AVAILABLE_BUT_CAPABILITY_STILL_INCOMPLETE: (r) => `"${r.topBlocker.dependency}" reports PROMOTED, but "${r.targetCapability}" overall status is still ${r.overallStatus} — a different, real blocker remains.`
    });

    function explain(reevaluation) {
        if (reevaluation.status !== "EVALUATED") {
            return `Could not evaluate: ${reevaluation.status}${reevaluation.reason ? " — " + reevaluation.reason : ""}`;
        }
        const key = Object.keys(GOVERNANCE_STATUS).find((k) => GOVERNANCE_STATUS[k] === reevaluation.governanceStatus) === "AVAILABLE_BUT_CAPABILITY_STILL_INCOMPLETE"
            ? "AVAILABLE_BUT_CAPABILITY_STILL_INCOMPLETE"
            : reevaluation.governanceStatus;
        const template = EXPLANATION_TEMPLATES[key];
        if (!template) return `Governance status: ${reevaluation.governanceStatus} (no explanation template registered).`;
        return template(reevaluation);
    }

    // -----------------------------------------------------------------
    // 6. EXPORT
    // -----------------------------------------------------------------

    const api = Object.freeze({
        getVersion() { return VERSION; },
        GOVERNANCE_STATUS,
        CHANGE,
        TRACE_CONFIDENCE,
        OPERATION_SEMANTICS,
        reevaluateCapability,
        compareDiagnoses,
        explain
    });

    window.CozyOS.CapabilityGovernanceDiagnosis = api;
    window.CozyOS.Modules["capability-governance-diagnosis"] = Object.freeze({
        version: VERSION,
        description: "Phase 8 (extended Phase 10A) — read-only governance-aware re-evaluation and change-detection layer. Composes Phase 5's capability-repair-planner.js and Phase 7's capability-knowledge-acquisition.js only; never mutates pack state, capability status, or acquisition-request state; every fact is re-derived live on every call. Phase 10A additively completed the cognitiveTrace: added the previously-missing WEIGH stage and confidence/whatRemainsUnknown/discardedAlternatives on every trace entry, reusing capability-self-diagnosis.js's existing confidence taxonomy verbatim."
    });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "CapabilityGovernanceDiagnosis",
                version: VERSION,
                category: "Builder",
                description: "Phase 8 (extended Phase 10A) read-only governance-aware re-evaluation + change-detection layer (composes Phase 5 repair-planner + Phase 7 knowledge-acquisition only); cognitiveTrace now includes WEIGH plus confidence/whatRemainsUnknown/discardedAlternatives on every entry.",
                sourcePath: "core/modules/builder/capability-governance-diagnosis.js"
            });
        } catch (_e) { /* registration is best-effort, never load-bearing */ }
    }
})();
