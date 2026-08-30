/**
 * CozyOS — Capability Repair / Build Planner
 * File Reference: core/modules/builder/capability-repair-planner.js
 * Phase: Unified Capability Registry + Dependency Graph — Phase 5
 *
 * OWNERSHIP — additive only, no existing file modified
 *   This file does not touch, redesign, or duplicate:
 *     core/modules/builder/unified-capability-contract.js   (Phase 2)
 *     core/modules/builder/capability-dependency-graph.js   (Phase 3)
 *     core/modules/builder/capability-self-diagnosis.js     (Phase 4)
 *     core/modules/builder/builder-orchestrator.js           (M280)
 *     docs/builder/knowledge/repair-queue.md                 (Rule 62)
 *   It is a consumer of Phase 4 only.
 *
 * CONSUME PHASE 4 ONLY (spec §2)
 *   Every fact this planner uses comes from calling
 *   window.CozyOS.CapabilitySelfDiagnosis.diagnose(question) and reading
 *   its returned `result`/`diagnosis`/`stages`. This file never calls
 *   window.CozyOS.CapabilityDependencyGraph or
 *   window.CozyOS.UnifiedCapabilityContract directly, never parses a
 *   markdown registry, and never scans arbitrary repository files. The
 *   chain stays: Repair Planner -> Self-Diagnosis -> Dependency Graph ->
 *   Unified Contract -> real registries. No shortcut.
 *
 * WHAT THIS FILE DOES NOT DO (spec §14 — critical)
 *   Does NOT edit application source code, does NOT create the missing
 *   Kiswahili vocabulary implementation (or any implementation), does NOT
 *   install dependencies, does NOT modify the language pack or any
 *   production registry, does NOT automatically execute a build, and does
 *   NOT claim any capability is repaired. This file produces an
 *   inspectable, governed PLAN only. buildPlan()/simulatePlan() never
 *   mutate anything — no source files, no registries, no Repair Queue, no
 *   tests, no configuration (spec §12).
 *
 * BUILD PLAN CONTRACT (spec §3)
 *   Field names below were chosen to match this repository's existing
 *   naming conventions (camelCase, verbatim status/vocabulary reuse —
 *   see capability-self-diagnosis.js's own header) rather than the
 *   spec's suggested names verbatim, per spec §3's own instruction:
 *   planId, targetCapability, targetDimension, diagnosis, priority (see
 *   classifyDependency), blockingDependencies, requiredBuilds,
 *   buildOrder, integrationPoints, requiredTests, verificationCriteria,
 *   risk, limitations, status, provenance.
 *
 * REQUIRED VS OPTIONAL VS INFERRED VS UNKNOWN (spec §5)
 *   classifyDependency() below is the single, explicit, inspectable rule
 *   table for this — it exists specifically so a placeholder dimension
 *   (e.g. Kiswahili "grammar", not required, no registry source) can
 *   never outrank a real, required, evidence-backed blocker (e.g.
 *   Kiswahili "vocabulary") the way Phase 4's first implementation
 *   mistakenly did before its own fix. See tests 4/5/16 in
 *   capability-repair-planner.test.js, which reproduce that exact
 *   failure mode and prove this planner does not repeat it.
 *
 * PLAN SAFETY / STATUS VOCABULARY (spec §6)
 *   READY, BLOCKED, INSUFFICIENT_EVIDENCE, DEPENDENCY_CONFLICT,
 *   AMBIGUOUS, NOT_BUILDABLE — taken from the spec verbatim where the
 *   spec's own words already match this repository's existing
 *   terminology (INSUFFICIENT_EVIDENCE is Phase 4's own
 *   DIAGNOSIS_RESULT value, reused rather than reinvented; AMBIGUOUS
 *   maps 1:1 onto Phase 4's IDENTIFICATION_UNCERTAIN result).
 *
 * REPAIR QUEUE INTEGRATION (spec §7)
 *   docs/builder/knowledge/repair-queue.md is a human-governed,
 *   append-only markdown log (Rule 62) — this file does not parse it at
 *   runtime (that would be exactly the "parse a markdown registry
 *   directly" shortcut spec §2 forbids) and does not write to it (that
 *   would duplicate/bypass Rule 62's Compose step, which is a governed,
 *   human/session action, not a runtime side effect of a diagnosis
 *   call). Instead, REPAIR_QUEUE_REFERENCE_TABLE below is an explicit,
 *   inspectable, hand-verified table — the same pattern Phase 4 already
 *   uses for CAPABILITY_REGISTRY — of dependency ids this session
 *   confirmed already have a real, open Repair Queue entry (verified by
 *   reading docs/builder/knowledge/repair-queue.md directly during this
 *   Phase 5 build session, not fabricated). "language:sw:vocabulary" is
 *   mapped to "RP-030-CONTENT" (Composed, High priority, Depends On
 *   RP-030 — confirmed present in the repair queue as of this Phase 5
 *   session). A dependency with no table entry is reported as
 *   `referenced: false` — this planner never invents or auto-creates a
 *   Repair Queue row; that remains a later, separately governed step per
 *   Rule 62.
 *
 * BUILDER ORCHESTRATOR INTEGRATION (spec §8)
 *   core/modules/builder/builder-orchestrator.js already has an
 *   11-phase lifecycle (Understanding..Certification/Registry) with its
 *   own, differently-scoped runPhase5Planning(sessionId) that aggregates
 *   THAT lifecycle's Phases 1-4 (Understanding/Analysis/Imagination/
 *   Reasoning) — a "build a new app/feature from a description" planner.
 *   This file is a different kind of Phase 5: "turn a capability
 *   self-diagnosis into a repair/build plan." It does not replace, call
 *   into, or create a second copy of that orchestrator or its session
 *   store. toBuilderOrchestratorPlanningShape() below is a pure,
 *   read-only adapter that reshapes this file's plan into the same
 *   field shape runPhase5Planning() returns, so a caller wiring this
 *   planner's output into that orchestrator's PLANNING boundary (rather
 *   than a parallel pipeline) has a ready-made, honest mapping — it
 *   never calls BuilderOrchestrator itself, since this plan was not
 *   produced by that lifecycle's Phases 1-4.
 *
 * NO FABRICATED IMPLEMENTATION (spec §10)
 *   Every requiredBuilds[] entry's `implementationDetail` is either a
 *   real fact copied from the Phase 4 diagnosis (dependencyMeta/evidence
 *   already read from a live registry) or the literal marker
 *   "IMPLEMENTATION_DETAIL_UNKNOWN" with an explanation of what must be
 *   discovered before Build. This file never invents a filename, model,
 *   language resource, test, API, or provider.
 *
 * ARCHITECTURAL BOUNDARY (spec §1, §14, §15)
 *   This file only plans. It never builds. STOP AFTER PHASE 5.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["capability-repair-planner"]) return;

    const VERSION = "0.1.0-PHASE5";

    // -------------------------------------------------------------------
    // PLAN_STATUS — spec §6, verbatim state names.
    // -------------------------------------------------------------------
    const PLAN_STATUS = Object.freeze({
        READY: "READY",
        BLOCKED: "BLOCKED",
        INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
        DEPENDENCY_CONFLICT: "DEPENDENCY_CONFLICT",
        AMBIGUOUS: "AMBIGUOUS",
        NOT_BUILDABLE: "NOT_BUILDABLE"
    });

    // -------------------------------------------------------------------
    // DEPENDENCY_CLASS — spec §5.
    // -------------------------------------------------------------------
    const DEPENDENCY_CLASS = Object.freeze({
        REQUIRED: "REQUIRED",
        OPTIONAL: "OPTIONAL",
        INFERRED: "INFERRED",
        UNKNOWN: "UNKNOWN"
    });

    const IMPLEMENTATION_DETAIL_UNKNOWN = "IMPLEMENTATION_DETAIL_UNKNOWN";

    // -------------------------------------------------------------------
    // REPAIR_QUEUE_REFERENCE_TABLE — spec §7. Explicit, inspectable,
    // hand-verified against docs/builder/knowledge/repair-queue.md at
    // the time this file was written. Never read from disk at runtime;
    // never written to. Add an entry only after independently confirming
    // it exists in the real repair queue.
    // -------------------------------------------------------------------
    const REPAIR_QUEUE_REFERENCE_TABLE = Object.freeze({
        "language:sw:vocabulary": Object.freeze({
            id: "RP-030-CONTENT",
            status: "Composed",
            priority: "High",
            dependsOn: Object.freeze(["RP-030"]),
            note: "Confirmed present in docs/builder/knowledge/repair-queue.md: \"populate vocabulary/phrases/grammar for the 13 registered language packs; currently all NOT_READY\"."
        })
    });

    // ===================================================================
    // classifyDependency() — spec §5. The single rule table deciding
    // REQUIRED/OPTIONAL/INFERRED/UNKNOWN for one blocker entry as
    // reported by Phase 4's BLOCKER_IDENTIFICATION stage.
    //   requiredFlag: true/false from Phase 4's own DIMENSION_ANALYSIS
    //     stage (matched by dependency id), or null if this blocker does
    //     not correspond to any known dimension (e.g. a dependencyRefs
    //     pointer, which Phase 2 stores as a pointer only, never a
    //     required/optional dimension).
    // ===================================================================
    function classifyDependency(blocker, requiredFlag) {
        if (requiredFlag === true) return DEPENDENCY_CLASS.REQUIRED;
        if (requiredFlag === false) return DEPENDENCY_CLASS.OPTIONAL;
        // requiredFlag unknown (pointer-type dependency, not a dimension):
        if (blocker.confidence === "best-effort") return DEPENDENCY_CLASS.INFERRED;
        return DEPENDENCY_CLASS.UNKNOWN;
    }

    // Ordering rank within requiredBuilds — lower runs first. Mirrors
    // Phase 4's own recommendNextBuild() priority (required
    // evidence-backed > required missing > other), generalized across
    // every blocker instead of picking only the single top one.
    function rankBlocker(entry) {
        if (entry.dependencyClass === DEPENDENCY_CLASS.REQUIRED) {
            if (entry.confidence === "manifest" && entry.status !== "MISSING") return 0; // evidence-backed
            if (entry.status === "MISSING") return 1;
            return 2; // required but only best-effort/unverified, non-missing
        }
        if (entry.dependencyClass === DEPENDENCY_CLASS.INFERRED) return 3;
        if (entry.dependencyClass === DEPENDENCY_CLASS.UNKNOWN) return 4;
        return 5; // OPTIONAL / placeholder — never outranks a real required blocker
    }

    // ===================================================================
    // topologicalOrder() — general-purpose, reusable dependency-first
    // ordering. Same DFS shape already established in this repository by
    // DependencyEngine.detectCircular(), DependencyEngineFormula
    // .detectCircularDependencies(), and CapabilityDependencyGraph
    // .detectCapabilityCircular() — a fourth application of that proven
    // shape, not a competing algorithm (spec §4).
    //   nodes: [{ id, requires: [id, ...] }]
    //   Returns { order: [id,...], cycle: null } or
    //           { order: null, cycle: [id,...,id] } if a cycle exists.
    // Phase 4's current real data (Kiswahili) exposes only one level of
    // capability -> dependency edges, so `requires` defaults to [] for
    // every real blocker today (spec-honest limitation — see the Phase 5
    // checkpoint's LIMITATIONS section: this algorithm is proven here
    // against synthetic multi-level/circular inputs so it is ready the
    // moment a future capability's dependencies expose real
    // dependency-of-dependency edges; nothing about today's flat
    // Kiswahili case is invented to look deeper than it is).
    // ===================================================================
    function topologicalOrder(nodes) {
        const byId = new Map(nodes.map((n) => [n.id, n]));
        const visiting = new Set();
        const visited = new Set();
        const stack = [];
        const order = [];
        let foundCycle = null;

        function dfs(id) {
            if (foundCycle) return;
            if (visiting.has(id)) {
                const cycleStart = stack.indexOf(id);
                foundCycle = stack.slice(cycleStart).concat(id);
                return;
            }
            if (visited.has(id)) return;
            const node = byId.get(id);
            if (!node) { visited.add(id); return; } // unknown ref — treated as a leaf, not fabricated
            visiting.add(id);
            stack.push(id);
            for (const dep of node.requires || []) {
                dfs(dep);
                if (foundCycle) break;
            }
            stack.pop();
            visiting.delete(id);
            visited.add(id);
            order.push(id);
        }

        for (const n of nodes) {
            dfs(n.id);
            if (foundCycle) break;
        }
        if (foundCycle) return { order: null, cycle: foundCycle };
        return { order, cycle: null };
    }

    // ===================================================================
    // Stage lookups into a Phase 4 diagnose() result — reads only the
    // fields Phase 4 already returns, never re-derives them.
    // ===================================================================
    function findStage(diagnosisResult, stageName) {
        return (diagnosisResult.stages || []).find((s) => s.stage === stageName) || null;
    }

    function requiredFlagFor(diagnosisResult, dependencyId, capabilityId) {
        const dimStage = findStage(diagnosisResult, "DIMENSION_ANALYSIS");
        if (!dimStage) return null;
        const match = (dimStage.dimensions || []).find((d) => `${capabilityId}:${d.dimension}` === dependencyId);
        return match ? !!match.required : null;
    }

    // ===================================================================
    // buildPlan(question, diagnosisEngine) — spec §9. Orchestrates the
    // full DIAGNOSE -> CLASSIFY -> ORDER -> VALIDATE pipeline. Consumes
    // only diagnosisEngine.diagnose() (defaults to
    // window.CozyOS.CapabilitySelfDiagnosis, Phase 4's own real export).
    // ===================================================================
    function buildPlan(question, diagnosisEngine) {
        const engine = diagnosisEngine || window.CozyOS.CapabilitySelfDiagnosis;
        if (!engine || typeof engine.diagnose !== "function") {
            return makePlan({
                question, status: PLAN_STATUS.INSUFFICIENT_EVIDENCE,
                limitations: ["window.CozyOS.CapabilitySelfDiagnosis (Phase 4) is not loaded in this runtime — this planner never diagnoses on its own (spec §2)."]
            });
        }

        const diagnosisResult = engine.diagnose(question);

        if (diagnosisResult.result === engine.DIAGNOSIS_RESULT.IDENTIFICATION_UNCERTAIN) {
            const last = diagnosisResult.stages[diagnosisResult.stages.length - 1];
            return makePlan({
                question, diagnosisResult, status: PLAN_STATUS.AMBIGUOUS,
                limitations: [last.reason || "Phase 4 could not uniquely identify a capability for this question."]
            });
        }
        if (diagnosisResult.result === engine.DIAGNOSIS_RESULT.INSUFFICIENT_EVIDENCE) {
            const last = diagnosisResult.stages[diagnosisResult.stages.length - 1];
            return makePlan({
                question, diagnosisResult, status: PLAN_STATUS.INSUFFICIENT_EVIDENCE,
                limitations: [last.reason || "Phase 4 could not reach a real graph for this capability."]
            });
        }

        const d = diagnosisResult.diagnosis;
        const capabilityId = d.capability;
        const blockerStage = findStage(diagnosisResult, "BLOCKER_IDENTIFICATION");
        const rawBlockers = (blockerStage && blockerStage.available) ? blockerStage.blockers : [];

        if (rawBlockers.length === 0) {
            return makePlan({
                question, diagnosisResult, targetCapability: capabilityId,
                status: PLAN_STATUS.NOT_BUILDABLE,
                blockingDependencies: [],
                limitations: [`No blockers found for "${capabilityId}" — overall status is ${d.overallStatus}. There is nothing for a build/repair plan to target.`]
            });
        }

        // CLASSIFY every blocker (spec §5) — never just the single
        // Phase-4-recommended one, so ordering can be proven correct
        // across ALL of them, not just re-stating Phase 4's own pick.
        const blockingDependencies = rawBlockers.map((b) => {
            const requiredFlag = requiredFlagFor(diagnosisResult, b.dependency, capabilityId);
            const dependencyClass = classifyDependency(b, requiredFlag);
            return Object.freeze({
                dependency: b.dependency,
                dependencyClass,
                status: b.status,
                confidence: b.confidence,
                evidence: b.evidence,
                sourceRegistry: b.sourceRegistry,
                dependencyMeta: b.dependencyMeta,
                repairQueue: REPAIR_QUEUE_REFERENCE_TABLE[b.dependency]
                    ? Object.freeze({ referenced: true, ...REPAIR_QUEUE_REFERENCE_TABLE[b.dependency] })
                    : Object.freeze({ referenced: false, note: "No known Repair Queue entry mapped for this dependency. Per Rule 62, a later governed stage must Compose one before this plan may be Implemented — this planner does not create one." })
            });
        }).sort((a, b) => rankBlocker(a) - rankBlocker(b));

        const requiredBuilds = blockingDependencies.filter((b) => b.dependencyClass === DEPENDENCY_CLASS.REQUIRED);

        if (requiredBuilds.length === 0) {
            return makePlan({
                question, diagnosisResult, targetCapability: capabilityId,
                status: PLAN_STATUS.NOT_BUILDABLE,
                blockingDependencies,
                limitations: [`${blockingDependencies.length} blocker(s) exist for "${capabilityId}", but none are REQUIRED dimensions (spec §4 placeholder rule) — this planner refuses to recommend building an optional/placeholder dependency as if it gated the capability.`]
            });
        }

        // ORDER (spec §4) — topological sort over the required builds.
        // Real Phase 4 data today is flat (no dependency-of-dependency
        // edges are exposed for Kiswahili), so `requires` is [] for every
        // node here; the algorithm is exercised against deeper synthetic
        // graphs directly in the test suite (tests 7/8/17).
        const orderNodes = requiredBuilds.map((rb) => ({ id: rb.dependency, requires: [] }));
        const topo = topologicalOrder(orderNodes);

        if (topo.cycle) {
            return makePlan({
                question, diagnosisResult, targetCapability: capabilityId,
                status: PLAN_STATUS.DEPENDENCY_CONFLICT,
                blockingDependencies, requiredBuilds,
                limitations: [`Circular dependency detected among required builds: ${topo.cycle.join(" -> ")}. This plan cannot be made READY until the cycle is resolved.`]
            });
        }

        // requiredBuilds is already rank-ordered by rankBlocker(); topo
        // order (currently trivial/flat) is applied as a stable
        // secondary key so a future deeper graph reorders correctly
        // without disturbing the required-evidence-first priority.
        const orderedIds = topo.order;
        const orderedRequiredBuilds = orderedIds
            .map((id) => requiredBuilds.find((rb) => rb.dependency === id))
            .filter(Boolean);

        const buildOrder = [];
        let step = 1;
        for (const rb of orderedRequiredBuilds) {
            buildOrder.push({ step: step++, type: "BUILD_DEPENDENCY", target: rb.dependency, reason: `Resolve/build required dependency "${rb.dependency}" (${rb.status}${rb.status === "MISSING" ? "" : `, ${rb.confidence}`}).` });
            buildOrder.push({ step: step++, type: "VERIFY_DEPENDENCY", target: rb.dependency, reason: `Verify "${rb.dependency}" now reports AVAILABLE/VERIFIED with confidence "manifest" — a real registry read, not a reference.` });
            buildOrder.push({ step: step++, type: "REEVALUATE_DEPENDENCY", target: rb.dependency, reason: `Re-run Phase 4 diagnosis and confirm "${rb.dependency}" no longer appears in BLOCKER_IDENTIFICATION.` });
        }
        buildOrder.push({ step: step++, type: "REEVALUATE_CAPABILITY", target: capabilityId, reason: `Re-run Phase 4 diagnosis for "${capabilityId}" and confirm overallStatus improves per unified-capability-contract.js's deriveOverallStatus().` });
        if (orderedRequiredBuilds.length > 1) {
            buildOrder.push({ step: step++, type: "CONTINUE_IF_BLOCKERS_REMAIN", target: capabilityId, reason: "If any required blocker still appears, this plan must be regenerated (not assumed fixed) before further build steps proceed." });
        }

        // NO FABRICATED IMPLEMENTATION (spec §10)
        const requiredBuildsWithDetail = orderedRequiredBuilds.map((rb) => {
            const hasRealDetail = rb.confidence === "manifest" && rb.dependencyMeta;
            return Object.freeze({
                ...rb,
                implementationDetail: hasRealDetail
                    ? Object.freeze({ known: true, source: rb.dependencyMeta })
                    : Object.freeze({ known: false, marker: IMPLEMENTATION_DETAIL_UNKNOWN, mustDiscover: `A real implementation (file/model/provider/API) for "${rb.dependency}" is not disclosed by any registry this diagnosis reached. Before Build, a human/governed session must locate or create the real source and re-run this diagnosis to confirm confidence "manifest".` })
            });
        });

        const requiredTests = [
            `Re-run this repository's existing regression suite for "${capabilityId}"'s upstream registries unchanged (see this plan's provenance).`,
            ...requiredBuildsWithDetail.map((rb) => `A new or existing test proving "${rb.dependency}" reports AVAILABLE/VERIFIED with confidence "manifest" (not merely referenced).`),
            `Re-run Phase 4's own diagnose("${question}") and confirm the primary blocker changes or clears.`
        ];

        const verificationStage = d.verificationRequired;
        const verificationCriteria = verificationStage && verificationStage.required
            ? verificationStage.verification
            : `No further verification is defined by Phase 4 for "${capabilityId}" beyond what is already recorded.`;

        const plan = makePlan({
            question, diagnosisResult, targetCapability: capabilityId,
            targetDimension: requiredBuildsWithDetail[0] ? requiredBuildsWithDetail[0].dependency.replace(`${capabilityId}:`, "") : null,
            status: PLAN_STATUS.READY, // provisional — validatePlan() below may downgrade it
            blockingDependencies, requiredBuilds: requiredBuildsWithDetail, buildOrder,
            requiredTests, verificationCriteria,
            integrationPoints: (findStage(diagnosisResult, "EVIDENCE_ANALYSIS") || {}).implementations || [],
            risk: requiredBuildsWithDetail.some((rb) => !rb.implementationDetail.known)
                ? "Implementation source for at least one required build is unknown — Build cannot start until it is discovered (see requiredBuilds[].implementationDetail)."
                : "Implementation sources for all required builds are disclosed; residual risk is limited to real-world build/verification outcome, not planning uncertainty.",
            limitations: []
        });

        const validation = validatePlan(plan);
        if (!validation.valid) {
            plan.status = PLAN_STATUS.BLOCKED;
            plan.limitations = plan.limitations.concat(validation.failedChecks.map((c) => `[${c.id}] ${c.name}: ${c.reason}`));
        }
        plan.validation = validation;
        return Object.freeze(plan);
    }

    // ===================================================================
    // makePlan() — single place every returned plan shape is assembled,
    // per the Build Plan Contract (spec §3).
    // ===================================================================
    let planCounter = 0;
    function makePlan({ question, diagnosisResult, targetCapability, targetDimension, status, blockingDependencies, requiredBuilds, buildOrder, requiredTests, verificationCriteria, integrationPoints, risk, limitations }) {
        planCounter += 1;
        return {
            planId: `PLAN:${targetCapability || "UNIDENTIFIED"}:${planCounter}:${Date.now()}`,
            targetCapability: targetCapability || null,
            targetDimension: targetDimension || null,
            diagnosis: diagnosisResult ? { question, result: diagnosisResult.result, overallStatus: diagnosisResult.diagnosis ? diagnosisResult.diagnosis.overallStatus : null } : { question, result: null, overallStatus: null },
            status,
            blockingDependencies: blockingDependencies || [],
            requiredBuilds: requiredBuilds || [],
            buildOrder: buildOrder || [],
            integrationPoints: integrationPoints || [],
            requiredTests: requiredTests || [],
            verificationCriteria: verificationCriteria || null,
            risk: risk || null,
            limitations: limitations || [],
            provenance: `capability-repair-planner v${VERSION} buildPlan(), consuming CapabilitySelfDiagnosis v${(window.CozyOS.CapabilitySelfDiagnosis && window.CozyOS.CapabilitySelfDiagnosis.getVersion) ? window.CozyOS.CapabilitySelfDiagnosis.getVersion() : "unknown"} only.`,
            createdAt: new Date().toISOString(),
            validation: null // filled in by buildPlan() after validatePlan() runs
        };
    }

    // ===================================================================
    // validatePlan() — spec §11, the 10-point checklist. A plan may only
    // report/remain READY if every check passes.
    // ===================================================================
    function validatePlan(plan) {
        const checks = [];
        function check(id, name, passed, reason) { checks.push({ id, name, passed: !!passed, reason: passed ? "OK" : reason }); }

        check("1", "target capability exists", !!plan.targetCapability, "No target capability was identified.");
        check("2", "diagnosis is supported", !!(plan.diagnosis && plan.diagnosis.result === "DIAGNOSED"), "Diagnosis did not reach a DIAGNOSED result.");
        check("3", "blocker exists", plan.blockingDependencies.length > 0, "No blocker was found for this capability.");
        check("4", "dependency relationship exists", plan.requiredBuilds.length > 0, "No REQUIRED dependency relationship exists to build against.");
        check("5", "dependency ordering is valid", plan.buildOrder.length >= plan.requiredBuilds.length, "Build order does not cover every required build.");
        check("6", "no unresolved required dependency exists outside the plan", plan.requiredBuilds.every((rb) => plan.buildOrder.some((s) => s.target === rb.dependency)), "A required dependency is missing from buildOrder.");
        check("7", "required verification can be defined", !!plan.verificationCriteria, "No verification criteria could be stated.");
        check("8", "no circular dependency blocks the plan", plan.status !== PLAN_STATUS.DEPENDENCY_CONFLICT, "A circular dependency was detected among required builds.");
        check("9", "provenance exists", !!plan.provenance, "No provenance string was recorded for this plan.");
        check("10", "plan does not contain fabricated implementation details", plan.requiredBuilds.every((rb) => rb.implementationDetail && (rb.implementationDetail.known === true || rb.implementationDetail.marker === IMPLEMENTATION_DETAIL_UNKNOWN)), "A required build's implementationDetail is neither a real known source nor explicitly marked IMPLEMENTATION_DETAIL_UNKNOWN.");

        const failedChecks = checks.filter((c) => !c.passed);
        return { valid: failedChecks.length === 0, checks, failedChecks };
    }

    // ===================================================================
    // simulatePlan() — spec §12. Dry-run wrapper: identical to
    // buildPlan(), explicit about the fact that nothing is mutated.
    // ===================================================================
    function simulatePlan(question, diagnosisEngine) {
        const plan = buildPlan(question, diagnosisEngine);
        return Object.freeze({
            simulated: true,
            mutatesNothing: true,
            note: "Dry-run only — no source file, registry, Repair Queue entry, test, or configuration was created or modified.",
            plan
        });
    }

    // ===================================================================
    // toBuilderOrchestratorPlanningShape() — spec §8, pure read-only
    // adapter. See header. Never calls window.CozyOS.BuilderOrchestrator.
    // ===================================================================
    function toBuilderOrchestratorPlanningShape(plan) {
        return Object.freeze({
            phase: 5,
            name: "Planning",
            success: plan.status === PLAN_STATUS.READY,
            understandingSummary: plan.diagnosis,
            selectedArchitecture: null, // this planner does not run Phases 1-3 of that lifecycle (Understanding/Analysis/Imagination); nothing to report here without fabricating it
            dependencyStatus: { circular: plan.status === PLAN_STATUS.DEPENDENCY_CONFLICT, blockingDependencies: plan.blockingDependencies },
            integrationOrder: plan.buildOrder,
            rollbackStrategy: "Not applicable — this plan has not authorized any Build step (Phase 5 architectural boundary, spec §14/§15).",
            note: "Produced by capability-repair-planner.js (a capability self-diagnosis repair plan), reshaped only for callers wiring it into builder-orchestrator.js's existing PLANNING boundary — this is not that orchestrator's own runPhase5Planning() output and was not produced by its Phases 1-4."
        });
    }

    const api = Object.freeze({
        getVersion() { return VERSION; },
        PLAN_STATUS,
        DEPENDENCY_CLASS,
        IMPLEMENTATION_DETAIL_UNKNOWN,
        REPAIR_QUEUE_REFERENCE_TABLE,
        classifyDependency,
        rankBlocker,
        topologicalOrder,
        buildPlan,
        validatePlan,
        simulatePlan,
        toBuilderOrchestratorPlanningShape
    });

    window.CozyOS.CapabilityRepairPlanner = api;
    window.CozyOS.Modules["capability-repair-planner"] = Object.freeze({
        version: VERSION,
        description: "Phase 5 — governed capability repair/build planner. Pure consumer of capability-self-diagnosis.js (Phase 4); converts a verified diagnosis into a dependency-ordered, validated build plan. Plans only — never builds, never mutates source/registries/Repair Queue/tests/config (Phase 6+)."
    });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "CapabilityRepairPlanner",
                version: VERSION,
                category: "Builder",
                description: "Phase 5 capability repair/build planner (pure consumer of Phase 4 self-diagnosis). Produces governed, dependency-ordered plans only.",
                sourcePath: "core/modules/builder/capability-repair-planner.js"
            });
        } catch (_e) { /* registration is best-effort, never load-bearing */ }
    }
})();
