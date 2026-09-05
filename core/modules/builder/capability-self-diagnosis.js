/**
 * CozyOS — Capability Self-Diagnosis Engine
 * File Reference: core/modules/builder/capability-self-diagnosis.js
 * Phase: Unified Capability Registry + Dependency Graph — Phase 4
 *
 * OWNERSHIP — additive only, no existing file modified
 *   This file does not touch, redesign, or duplicate:
 *     core/modules/builder/unified-capability-contract.js (Phase 2)
 *     core/modules/builder/capability-dependency-graph.js  (Phase 3)
 *   It is a consumer/orchestrator of both. It never reads a language
 *   registry, a language-pack registry, a test file, or any other raw
 *   source directly. Every fact in a diagnosis traces back through the
 *   Phase 3 graph to the Phase 2 contract to a real registry — never
 *   around them.
 *
 * MANDATORY PIPELINE ARCHITECTURE (do not shortcut)
 *   QUESTION
 *     -> CAPABILITY_IDENTIFICATION   (alias match against a registry of
 *                                      known Phase 3 graph-builders — no
 *                                      NLP/semantic invention, see §3)
 *     -> CAPABILITY_LOOKUP           (calls the Phase 3 graph-builder,
 *                                      which itself calls the Phase 2
 *                                      contract, which itself calls the
 *                                      real registries)
 *     -> DIMENSION_ANALYSIS          (reads record.dimensions — Phase 2)
 *     -> STATUS_ANALYSIS             (reads record.overallStatus — Phase 2,
 *                                      unmodified vocabulary)
 *     -> EVIDENCE_ANALYSIS           (reads dim.evidenceRef / edge.evidence
 *                                      / edge.confidence — Phase 2 + 3,
 *                                      never executes a test file)
 *     -> DEPENDENCY_TRAVERSAL        (reads graph.listEdges()/getNode() —
 *                                      Phase 3)
 *     -> BLOCKER_IDENTIFICATION      (reads graph.getBlockers() — Phase 3,
 *                                      unmodified NON_BLOCKING_STATUSES)
 *     -> MISSING_DEPENDENCY_IDENTIFICATION (filters blockers by status
 *                                      MISSING — never reclassifies
 *                                      NOT_VERIFIED as MISSING, §6)
 *     -> NEXT_BUILD_RECOMMENDATION   (graph-based selection, see below)
 *     -> VERIFICATION_REQUIREMENT    (states what would need to become
 *                                      true and how it would be checked —
 *                                      does not perform it, §15)
 *   Every stage below is its own named function with inspectable output.
 *   diagnose() composes them; it does not fold them into one opaque body.
 *
 * NO SECOND CAPABILITY SYSTEM (§1)
 *   CAPABILITY_REGISTRY below stores nothing but an id, alias strings, and
 *   a pointer to the real Phase 3 graph-builder function for that
 *   capability. It is not a parallel data store — resolving an id still
 *   means calling into Phase 3 -> Phase 2 -> the live registries at
 *   diagnose() call time, every time, uncached.
 *
 * OVERALL STATUS — reused, not invented (§5)
 *   This file introduces zero new status words. STATUS_ANALYSIS reports
 *   Phase 2's own OVERALL_STATUS value (VERIFIED / PARTIALLY_VERIFIED /
 *   NOT_FOUND / NOT_A_CAPABILITY) verbatim, and separately reports whether
 *   Phase 3 blockers exist. Exactly like the Phase 3 header itself, the
 *   two vocabularies are kept side by side, never collapsed into one new
 *   word — a diagnosis with overallStatus PARTIALLY_VERIFIED and one real
 *   blocker is reported as both facts, not re-labelled "BLOCKED".
 *
 * EVIDENCE ANALYSIS DISCIPLINE (§7)
 *   This engine distinguishes existence from verification using only the
 *   fields Phase 2/3 already expose:
 *     confidence "manifest"    -> a real registry was read live this call
 *                                  (source-verified, not merely present)
 *     confidence "best-effort" -> pointer/reference exists (e.g. an
 *                                  integrationPoints file path); its
 *                                  existence on disk is NOT checked here
 *     confidence "unverified"  -> no evidence at all
 *   A "verified_by" TEST edge is reported as REFERENCED, never as PASSED —
 *   Phase 2's own header already discloses the referenced test is "not
 *   re-executed by this call," and Phase 4 does not execute it either
 *   (running a test would be a build/verification action, §15 boundary).
 *
 * NO FALSE AUTONOMY (§12)
 *   If CAPABILITY_LOOKUP cannot reach a real graph (Phase 3 module or its
 *   upstream registries not loaded), diagnose() stops and returns
 *   INSUFFICIENT_EVIDENCE with the exact reason — it never fabricates a
 *   dependency, guesses a blocker, or invents a missing file.
 *
 * ARCHITECTURAL BOUNDARY (§15)
 *   This file only diagnoses. NEXT_BUILD_RECOMMENDATION describes what a
 *   later, separately governed build phase should do — it never writes,
 *   installs, or executes anything itself.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["capability-self-diagnosis"]) return;

    const VERSION = "0.1.0-PHASE4";

    // -------------------------------------------------------------------
    // Result markers. Not a status vocabulary for a capability — these are
    // markers for "did the pipeline reach a diagnosis at all."
    // -------------------------------------------------------------------
    const DIAGNOSIS_RESULT = Object.freeze({
        IDENTIFICATION_UNCERTAIN: "IDENTIFICATION_UNCERTAIN",
        INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
        DIAGNOSED: "DIAGNOSED"
    });

    // -------------------------------------------------------------------
    // CAPABILITY_REGISTRY — explicit, inspectable alias table (§3). Adding
    // a capability means adding a table entry that points at a real Phase 3
    // graph-builder — never inferring a match at read time, never storing
    // capability facts here directly.
    // -------------------------------------------------------------------
    const CAPABILITY_REGISTRY = Object.freeze([
        Object.freeze({
            id: "language:sw",
            aliases: Object.freeze(["kiswahili", "swahili", "sw", "language:sw"]),
            buildGraph() {
                const mod = window.CozyOS.CapabilityDependencyGraph;
                if (!mod || typeof mod.buildKiswahiliDependencyGraph !== "function") {
                    return { available: false, reason: "window.CozyOS.CapabilityDependencyGraph (Phase 3) is not loaded in this runtime." };
                }
                return mod.buildKiswahiliDependencyGraph();
            }
        })
    ]);

    // ===================================================================
    // STAGE: CAPABILITY_IDENTIFICATION
    // ===================================================================
    function identifyCapability(question) {
        if (typeof question !== "string" || !question.trim()) {
            return {
                stage: "CAPABILITY_IDENTIFICATION",
                result: DIAGNOSIS_RESULT.IDENTIFICATION_UNCERTAIN,
                candidates: CAPABILITY_REGISTRY.map((e) => e.id),
                reason: "Empty or non-string question — nothing to match."
            };
        }
        const normalized = question.toLowerCase();
        const matches = CAPABILITY_REGISTRY.filter((entry) => entry.aliases.some((alias) => normalized.includes(alias)));

        if (matches.length === 0) {
            return {
                stage: "CAPABILITY_IDENTIFICATION",
                result: DIAGNOSIS_RESULT.IDENTIFICATION_UNCERTAIN,
                candidates: CAPABILITY_REGISTRY.map((e) => e.id),
                reason: "No registered capability alias matched the question text. This engine does not guess a capability from unmatched text."
            };
        }
        if (matches.length > 1) {
            return {
                stage: "CAPABILITY_IDENTIFICATION",
                result: DIAGNOSIS_RESULT.IDENTIFICATION_UNCERTAIN,
                candidates: matches.map((e) => e.id),
                reason: "More than one registered capability matched the question text — ambiguous, not guessed."
            };
        }
        return { stage: "CAPABILITY_IDENTIFICATION", result: "MATCHED", capabilityId: matches[0].id, entry: matches[0] };
    }

    // ===================================================================
    // STAGE: CAPABILITY_LOOKUP — calls into Phase 3 only. Phase 3 in turn
    // calls Phase 2. This engine never skips that chain.
    // ===================================================================
    function lookupCapability(entry) {
        const built = entry.buildGraph();
        if (!built.available) {
            return { stage: "CAPABILITY_LOOKUP", result: DIAGNOSIS_RESULT.INSUFFICIENT_EVIDENCE, reason: built.reason };
        }
        return { stage: "CAPABILITY_LOOKUP", result: "FOUND", graph: built.graph, record: built.record };
    }

    // ===================================================================
    // STAGE: DIMENSION_ANALYSIS  ("SIFTING" — compare dimensions, §11)
    // ===================================================================
    function analyzeDimensions(record, graph) {
        return record.dimensions.map((dim) => {
            const depId = `${record.id}:${dim.key}`;
            const depNode = graph.getNode("DEPENDENCY", depId);
            const edges = graph.listEdges({ source: record.id, target: depId, relationship: "depends_on" });
            const edge = edges[0] || null;
            return Object.freeze({
                stage: "DIMENSION_ANALYSIS",
                dimension: dim.key,
                required: dim.required,
                hasSource: dim.hasSource,
                source: dim.hasSource ? dim.sourceStatus.registry : null,
                sourceFile: dim.hasSource ? dim.sourceStatus.file : null,
                sourceStatus: dim.hasSource ? { field: dim.sourceStatus.field, rawValue: dim.sourceStatus.rawValue } : null,
                // Phase 2 vocabulary — internal signal, unmodified:
                derivedSignal: dim.derivationSignal,
                // Phase 3 vocabulary — graph edge status, unmodified, kept
                // side by side with derivedSignal, never merged into it:
                graphStatus: edge ? edge.status : null,
                confidence: edge ? edge.confidence : null,
                evidence: edge ? edge.evidence : Object.freeze([]),
                evidenceRef: dim.evidenceRef,
                limitations: dim.limitations
            });
        });
    }

    // ===================================================================
    // STAGE: STATUS_ANALYSIS ("RECKONING" — the resulting state, §11)
    //   Reports Phase 2's own overallStatus verbatim. Adds nothing new.
    // ===================================================================
    function analyzeStatus(record) {
        return {
            stage: "STATUS_ANALYSIS",
            overallStatus: record.overallStatus.value,
            derivedBy: record.overallStatus.derivedBy,
            reasoning: record.overallStatus.reasoning,
            conflicts: record.conflicts
        };
    }

    // ===================================================================
    // STAGE: EVIDENCE_ANALYSIS ("WEIGHING" — evidence strength, §11)
    //   Existence vs verification, per the discipline documented above.
    // ===================================================================
    function classifyEvidenceStrength(confidence) {
        if (confidence === "manifest") return "SOURCE_VERIFIED_LIVE";
        if (confidence === "best-effort") return "REFERENCED_NOT_VERIFIED";
        if (confidence === "unverified") return "NO_EVIDENCE";
        return "UNKNOWN_CONFIDENCE_LEVEL";
    }

    function analyzeEvidence(graph, record, dimensionAnalyses) {
        const perDimension = dimensionAnalyses.map((d) => ({
            dimension: d.dimension,
            confidence: d.confidence,
            strength: d.confidence ? classifyEvidenceStrength(d.confidence) : "NO_EVIDENCE",
            evidence: d.evidence
        }));

        const testEdges = graph.listEdges({ source: record.id, relationship: "verified_by" });
        const tests = testEdges.map((edge) => ({
            target: edge.target,
            // Honest per §7: TEST EXISTS (this edge/node exists) is reported
            // separately from TEST PASSED (never claimed — Phase 4 does not
            // execute tests during diagnosis).
            testReferenced: true,
            testExecutedByThisDiagnosis: false,
            confidence: edge.confidence,
            evidence: edge.evidence
        }));

        const implEdges = graph.listEdges({ source: record.id, relationship: "implemented_by" });
        const implementations = implEdges.map((edge) => ({
            target: edge.target,
            // IMPLEMENTATION EXISTS as a referenced integration point (§7);
            // NOT the same claim as IMPLEMENTATION VERIFIED, which would
            // require confidence "manifest" and is reported as such above.
            implementationReferenced: true,
            confidence: edge.confidence,
            evidence: edge.evidence
        }));

        return { stage: "EVIDENCE_ANALYSIS", perDimension, tests, implementations };
    }

    // ===================================================================
    // STAGE: DEPENDENCY_TRAVERSAL ("TRIANGULATING" — compare independent
    //   sources across the graph, §11). Pure read of Phase 3's own edges.
    // ===================================================================
    function traverseDependencies(graph, capabilityId) {
        const edges = graph.listEdges({ source: capabilityId });
        return {
            stage: "DEPENDENCY_TRAVERSAL",
            edges: edges.map((e) => ({
                relationship: e.relationship,
                target: e.target,
                targetType: e.targetType,
                status: e.status,
                confidence: e.confidence,
                evidence: e.evidence
            })),
            capabilityLevelCircular: typeof graph.detectCapabilityCircular === "function" ? graph.detectCapabilityCircular() : null
        };
    }

    // ===================================================================
    // STAGE: BLOCKER_IDENTIFICATION ("UNTANGLING" — separate blockers from
    //   status, §11). Pure pass-through to Phase 3's own getBlockers().
    // ===================================================================
    function identifyBlockers(graph, capabilityId) {
        const result = graph.getBlockers(capabilityId);
        return { stage: "BLOCKER_IDENTIFICATION", ...result };
    }

    // ===================================================================
    // STAGE: MISSING_DEPENDENCY_IDENTIFICATION
    //   Filters blockers down to status MISSING specifically. Never
    //   reclassifies NOT_VERIFIED/BLOCKED/FAILED as MISSING (§6) — each
    //   keeps its own source-native status in the output.
    // ===================================================================
    function identifyMissingDependencies(blockerReport) {
        if (!blockerReport.available) {
            return { stage: "MISSING_DEPENDENCY_IDENTIFICATION", available: false, reason: blockerReport.reason };
        }
        const missing = blockerReport.blockers.filter((b) => b.status === "MISSING");
        const otherBlockers = blockerReport.blockers.filter((b) => b.status !== "MISSING");
        return { stage: "MISSING_DEPENDENCY_IDENTIFICATION", available: true, missing, otherBlockers };
    }

    // ===================================================================
    // STAGE: NEXT_BUILD_RECOMMENDATION ("FIGURING" — derive the next
    //   required dependency, §11). Graph-based selection only, in this
    //   explicit priority order (no invented severity score):
    //   1. A REQUIRED dependency that is a real, evidence-backed blocker
    //      (hasSource, e.g. NOT_VERIFIED with a real negative reading) —
    //      this is actionable now and is what the capability record's own
    //      required/positive rule (Phase 2 deriveOverallStatus) is already
    //      withholding VERIFIED for.
    //   2. A REQUIRED dependency with status MISSING (no source at all).
    //   3. Any other blocker (typically a non-required placeholder
    //      dimension, §4) in traversal order — flagged as non-required so
    //      a caller does not mistake it for the capability's real gap.
    //   This function recommends; it never builds (§15).
    // ===================================================================
    function recommendNextBuild(record, missingDependencyReport, blockerReport) {
        if (!blockerReport.available) {
            return { stage: "NEXT_BUILD_RECOMMENDATION", available: false, reason: blockerReport.reason };
        }
        if (blockerReport.blockers.length === 0) {
            return { stage: "NEXT_BUILD_RECOMMENDATION", available: true, recommendation: null, reason: "No blockers found — nothing further is required by this graph." };
        }

        const requiredDimKeys = new Set(record.dimensions.filter((d) => d.required).map((d) => `${record.id}:${d.key}`));
        const requiredBlockers = blockerReport.blockers.filter((b) => requiredDimKeys.has(b.dependency));
        const requiredEvidenceBacked = requiredBlockers.find((b) => b.status !== "MISSING");
        const requiredMissing = requiredBlockers.find((b) => b.status === "MISSING");
        const chosen = requiredEvidenceBacked || requiredMissing || blockerReport.blockers[0];
        const isRequired = requiredDimKeys.has(chosen.dependency);

        let reason;
        if (!isRequired) {
            reason = `Dependency "${chosen.dependency}" has status ${chosen.status} but is NOT a required dimension of this capability (§4 placeholder) — no required blocker was found, so this is surfaced only as the first remaining blocker in traversal order, not as the capability's real gap.`;
        } else if (chosen.status === "MISSING") {
            reason = `Required dependency "${chosen.dependency}" has status MISSING — no registry currently reports it. This blocks everything downstream of it and cannot be verified until it exists.`;
        } else {
            reason = `Required dependency "${chosen.dependency}" has real, evidence-backed status ${chosen.status} (${(chosen.evidence || []).join("; ") || "no evidence string"}) — this is the actual gap withholding this capability from an overall VERIFIED status (Phase 2 deriveOverallStatus).`;
        }

        return {
            stage: "NEXT_BUILD_RECOMMENDATION",
            available: true,
            recommendation: {
                dependency: chosen.dependency,
                required: isRequired,
                reason,
                blocks: record.id,
                evidence: chosen.evidence,
                status: chosen.status,
                confidence: chosen.confidence
            }
        };
    }

    // ===================================================================
    // STAGE: VERIFICATION_REQUIREMENT ("CRYSTALLIZING" — final diagnosis
    //   shape, §11). States what must become true and how it would be
    //   checked. Never performs the check itself (§15).
    // ===================================================================
    function stateVerificationRequirement(nextBuildReport) {
        if (!nextBuildReport.available || !nextBuildReport.recommendation) {
            return { stage: "VERIFICATION_REQUIREMENT", required: false, reason: nextBuildReport.reason || "No further build is recommended by this graph." };
        }
        const rec = nextBuildReport.recommendation;
        return {
            stage: "VERIFICATION_REQUIREMENT",
            required: true,
            dependency: rec.dependency,
            verification: `After "${rec.dependency}" is built, a future diagnosis call must show its dependency edge status change from "${rec.status}" to AVAILABLE or VERIFIED, backed by confidence "manifest" (a real registry read, not a reference) — the same test discipline already used by the Phase 2/3 regression suites for this dependency's source registry.`
        };
    }

    // ===================================================================
    // ORCHESTRATION — diagnose(). Composes the pipeline above; does not
    // fold the stages into one opaque body (§2).
    // ===================================================================
    function diagnose(question) {
        const stages = [];

        const identification = identifyCapability(question);
        stages.push(identification);
        if (identification.result !== "MATCHED") {
            return { question, result: identification.result, stages, diagnosis: null };
        }

        const lookup = lookupCapability(identification.entry);
        stages.push(lookup);
        if (lookup.result !== "FOUND") {
            return { question, result: lookup.result, stages, diagnosis: null };
        }
        const { graph, record } = lookup;

        const dimensionAnalyses = analyzeDimensions(record, graph);
        stages.push({ stage: "DIMENSION_ANALYSIS", dimensions: dimensionAnalyses });

        const statusAnalysis = analyzeStatus(record);
        stages.push(statusAnalysis);

        const evidenceAnalysis = analyzeEvidence(graph, record, dimensionAnalyses);
        stages.push(evidenceAnalysis);

        const traversal = traverseDependencies(graph, record.id);
        stages.push(traversal);

        const blockerReport = identifyBlockers(graph, record.id);
        stages.push(blockerReport);

        const missingReport = identifyMissingDependencies(blockerReport);
        stages.push(missingReport);

        const nextBuild = recommendNextBuild(record, missingReport, blockerReport);
        stages.push(nextBuild);

        const verification = stateVerificationRequirement(nextBuild);
        stages.push(verification);

        return {
            question,
            result: DIAGNOSIS_RESULT.DIAGNOSED,
            stages,
            diagnosis: {
                capability: record.id,
                name: record.name,
                overallStatus: statusAnalysis.overallStatus,
                overallStatusReasoning: statusAnalysis.reasoning,
                workingDimensions: dimensionAnalyses.filter((d) => d.derivedSignal === "positive").map((d) => d.dimension),
                incompleteDimensions: dimensionAnalyses.filter((d) => d.derivedSignal !== "positive").map((d) => d.dimension),
                primaryBlocker: (blockerReport.blockers && blockerReport.blockers[0]) || null,
                dependencyTraversal: traversal.edges,
                nextRequiredBuild: nextBuild.recommendation || null,
                verificationRequired: verification
            }
        };
    }

    // ===================================================================
    // HUMAN-READABLE RENDERER — structured diagnosis remains authoritative
    // (§10). This only formats it; it derives nothing new.
    // ===================================================================
    function renderHumanReadable(diagnosisResult) {
        if (diagnosisResult.result === DIAGNOSIS_RESULT.IDENTIFICATION_UNCERTAIN) {
            const last = diagnosisResult.stages[diagnosisResult.stages.length - 1];
            return `IDENTIFICATION_UNCERTAIN\n${last.reason}\nCandidates: ${(last.candidates || []).join(", ") || "(none registered)"}`;
        }
        if (diagnosisResult.result === DIAGNOSIS_RESULT.INSUFFICIENT_EVIDENCE) {
            const last = diagnosisResult.stages[diagnosisResult.stages.length - 1];
            return `INSUFFICIENT_EVIDENCE\n${last.reason}`;
        }
        const d = diagnosisResult.diagnosis;
        const lines = [
            `CAPABILITY: ${d.name}`,
            `OVERALL: ${d.overallStatus}`,
            `WORKING DIMENSIONS: ${d.workingDimensions.join(", ") || "(none)"}`,
            `INCOMPLETE DIMENSIONS: ${d.incompleteDimensions.join(", ") || "(none)"}`,
            `PRIMARY BLOCKER: ${d.primaryBlocker ? `${d.primaryBlocker.dependency} (${d.primaryBlocker.status})` : "(none)"}`,
            `NEXT REQUIRED BUILD: ${d.nextRequiredBuild ? d.nextRequiredBuild.dependency : "(none)"}`,
            `VERIFICATION REQUIRED: ${d.verificationRequired.required ? d.verificationRequired.verification : "(none)"}`
        ];
        return lines.join("\n");
    }

    const api = Object.freeze({
        getVersion() { return VERSION; },
        DIAGNOSIS_RESULT,
        CAPABILITY_REGISTRY,
        identifyCapability,
        lookupCapability,
        analyzeDimensions,
        analyzeStatus,
        analyzeEvidence,
        traverseDependencies,
        identifyBlockers,
        identifyMissingDependencies,
        recommendNextBuild,
        stateVerificationRequirement,
        diagnose,
        renderHumanReadable
    });

    window.CozyOS.CapabilitySelfDiagnosis = api;
    window.CozyOS.Modules["capability-self-diagnosis"] = Object.freeze({
        version: VERSION,
        description: "Phase 4 — capability self-diagnosis engine. Pure consumer/orchestrator of Phase 2 (unified-capability-contract.js) and Phase 3 (capability-dependency-graph.js); maintains no independent capability data. Diagnoses only — does not build, install, or execute anything (Phase 5+)."
    });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "CapabilitySelfDiagnosis",
                version: VERSION,
                category: "Builder",
                description: "Phase 4 capability self-diagnosis engine (orchestrates Phase 2 contract + Phase 3 graph only).",
                sourcePath: "core/modules/builder/capability-self-diagnosis.js"
            });
        } catch (_e) { /* registration is best-effort, never load-bearing */ }
    }
})();
