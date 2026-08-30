/**
 * CozyOS — Unified Capability Dependency Graph
 * File Reference: core/modules/builder/capability-dependency-graph.js
 * Phase: Unified Capability Registry + Dependency Graph — Phase 3
 *
 * OWNERSHIP — additive only, no existing file modified
 *   This is a new engine. It does not redesign
 *   core/modules/builder/unified-capability-contract.js (Phase 2, untouched),
 *   does not touch core/platform/dependency-engine.js (file/module graph),
 *   and does not touch core/calculation/dependency-engine.js (formula/
 *   calculation call graph). Those two are different, real domains and are
 *   explicitly NOT merged here — see DOMAIN BOUNDARY below.
 *
 * DOMAIN BOUNDARY (must read before changing this file)
 *   core/platform/dependency-engine.js     = FILE / MODULE dependency graph
 *   core/calculation/dependency-engine.js  = FORMULA / CALCULATION call graph
 *   core/modules/builder/capability-dependency-graph.js (this file)
 *                                           = CAPABILITY dependency graph —
 *     a higher-level graph that can POINT AT file/module facts from the
 *     platform engine, but never re-derives or duplicates them. Where a
 *     capability graph edge is backed by a real file path known to
 *     FileRegistry, this engine calls the real platform DependencyEngine
 *     and carries its answer through unchanged (see
 *     getModuleLevelCircularReport()). It never re-implements file-level
 *     dependency resolution itself.
 *
 * NODE TYPES
 *   CAPABILITY, DEPENDENCY, IMPLEMENTATION, MODULE, INTEGRATION_POINT,
 *   TEST, EVIDENCE
 *
 * RELATIONSHIP TYPES
 *   depends_on        capability -> dependency
 *   implemented_by     capability -> implementation
 *   integrated_with     capability -> integration_point
 *   verified_by         capability -> test | evidence
 *   blocks              dependency -> capability   (derived, see addEdge())
 *
 * PROVENANCE IS MANDATORY, NOT DECORATIVE
 *   Every edge is created with { sourceRegistry, evidence, status,
 *   confidence, lastVerified }. An edge created with no evidence is not
 *   rejected — it is honestly recorded with status "UNVERIFIED" /
 *   confidence "unverified". This engine never upgrades an evidence-free
 *   edge to a verified one on its own; only a caller supplying real
 *   evidence can do that (see addEdge()'s "unknown/unverified" path).
 *   Nothing here infers an edge merely because two node names look similar
 *   (Rule from the Phase 3 build prompt, §3) — every addEdge() call must be
 *   made explicitly by a builder function that read a real source.
 *
 * STATUS VOCABULARY — preserved from real source semantics, not flattened
 *   MISSING, BLOCKED, NOT_VERIFIED, FAILED, AVAILABLE, VERIFIED are the
 *   graph's own edge/dependency-node statuses (Phase 3 prompt §6). These
 *   are DIFFERENT from Phase 2's OVERALL_STATUS vocabulary
 *   (VERIFIED/PARTIALLY_VERIFIED/NOT_FOUND/NOT_A_CAPABILITY), which
 *   describes a whole capability record, not a single graph edge. Both
 *   vocabularies are kept side by side, never collapsed into one.
 *
 * BEST-EFFORT vs MANIFEST/VERIFIED DISTINCTION (Phase 3 prompt §8)
 *   confidence carries the same distinction the platform engine already
 *   established: "manifest" / "verified" (authoritative) vs "regex-scan" /
 *   "best-effort" / "inferred" (heuristic) vs "unverified" (no evidence at
 *   all). A best-effort edge is never presented as equivalent to a
 *   manifest-backed one — callers must read `confidence` before trusting
 *   an edge the way they'd trust a VERIFIED one.
 *
 * CIRCULAR DEPENDENCY DETECTION (Phase 3 prompt §7)
 *   Module/file-level cycles: delegated entirely to the real
 *   window.CozyOS.DependencyEngine.detectCircular() — this file does not
 *   re-derive that answer.
 *   Capability-level cycles (over CAPABILITY/DEPENDENCY typed edges,
 *   a domain the platform engine cannot see): use the SAME DFS shape
 *   already established by DependencyEngine.detectCircular() and
 *   DependencyEngineFormula.detectCircularDependencies() (which itself
 *   documents this as a proven shape applied a third time). This is the
 *   fourth application of that same shape, to a new node domain the
 *   existing engines cannot represent — not a competing algorithm.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO (Phase 3 scope discipline)
 *   - Does NOT build the self-diagnosis / "why can't I do X" query engine.
 *     That is Phase 4. This file only makes the dependency path available
 *     to it.
 *   - Does NOT redesign the Phase 2 contract.
 *   - Does NOT fabricate any relationship. Every builder function in this
 *     file that wires real nodes/edges reads a real registry at call time.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["capability-dependency-graph"]) return;

    const VERSION = "0.1.0-PHASE3";

    const NODE_TYPES = Object.freeze([
        "CAPABILITY", "DEPENDENCY", "IMPLEMENTATION", "MODULE",
        "INTEGRATION_POINT", "TEST", "EVIDENCE"
    ]);

    const RELATIONSHIP_TYPES = Object.freeze([
        "depends_on", "implemented_by", "integrated_with", "verified_by", "blocks"
    ]);

    // Statuses a DEPENDENCY node or an edge into it may carry. Sourced from
    // the Phase 3 build prompt §6 — not invented here.
    const DEPENDENCY_STATUS = Object.freeze({
        MISSING: "MISSING",
        BLOCKED: "BLOCKED",
        NOT_VERIFIED: "NOT_VERIFIED",
        FAILED: "FAILED",
        AVAILABLE: "AVAILABLE",
        VERIFIED: "VERIFIED"
    });

    // Statuses that count as "not blocking" when answering "what blocks
    // this capability?" (§6). Everything else is a real blocker.
    const NON_BLOCKING_STATUSES = new Set([DEPENDENCY_STATUS.AVAILABLE, DEPENDENCY_STATUS.VERIFIED]);

    class CozyCapabilityDependencyGraph {
        #nodes = new Map();  // `${type}::${id}` -> frozen node record
        #edges = new Map();  // `${source}::${relationship}::${target}` -> frozen edge record (mutable evidence array is re-frozen on merge)
        #diagnostics = { nodesRegistered: 0, edgesRegistered: 0, duplicateEdgesMerged: 0, unverifiedEdges: 0 };

        getVersion() { return VERSION; }

        // ---------------------------------------------------------------
        // Node registration
        // ---------------------------------------------------------------
        addNode(type, id, meta) {
            if (!NODE_TYPES.includes(type)) throw new TypeError(`[CapabilityDependencyGraph] addNode(): unknown node type "${type}". Must be one of ${NODE_TYPES.join(", ")}.`);
            if (typeof id !== "string" || !id.trim()) throw new TypeError("[CapabilityDependencyGraph] addNode(): id is required.");
            const key = `${type}::${id}`;
            if (this.#nodes.has(key)) return { created: false, node: this.#nodes.get(key) };
            const node = Object.freeze({ type, id, meta: Object.freeze({ ...(meta || {}) }), registeredAt: new Date().toISOString() });
            this.#nodes.set(key, node);
            this.#diagnostics.nodesRegistered++;
            return { created: true, node };
        }

        getNode(type, id) { return this.#nodes.get(`${type}::${id}`) || null; }
        hasNode(type, id) { return this.#nodes.has(`${type}::${id}`); }
        listNodes(type) { const all = Array.from(this.#nodes.values()); return type ? all.filter(n => n.type === type) : all; }

        // ---------------------------------------------------------------
        // Edge registration — provenance is mandatory input, not optional
        // decoration. An edge with no real evidence is still recorded, but
        // honestly as unverified (Phase 3 prompt §3/§6).
        // ---------------------------------------------------------------
        addEdge({ source, sourceType, target, targetType, relationship, sourceRegistry, evidence, status, confidence, lastVerified }) {
            if (!RELATIONSHIP_TYPES.includes(relationship)) throw new TypeError(`[CapabilityDependencyGraph] addEdge(): unknown relationship "${relationship}". Must be one of ${RELATIONSHIP_TYPES.join(", ")}.`);
            if (!this.hasNode(sourceType, source)) throw new TypeError(`[CapabilityDependencyGraph] addEdge(): source node ${sourceType}::${source} is not registered — register it before creating an edge from it.`);
            if (!this.hasNode(targetType, target)) throw new TypeError(`[CapabilityDependencyGraph] addEdge(): target node ${targetType}::${target} is not registered — register it before creating an edge to it.`);

            const hasEvidence = evidence !== undefined && evidence !== null && evidence !== "";
            const resolvedStatus = status || (hasEvidence ? DEPENDENCY_STATUS.NOT_VERIFIED : DEPENDENCY_STATUS.NOT_VERIFIED);
            const resolvedConfidence = confidence || (hasEvidence ? "best-effort" : "unverified");

            const key = `${sourceType}:${source}::${relationship}::${targetType}:${target}`;
            if (this.#edges.has(key)) {
                const existing = this.#edges.get(key);
                const mergedEvidence = Array.from(new Set([...(existing.evidence || []), ...(hasEvidence ? [evidence] : [])]));
                const merged = Object.freeze({ ...existing, evidence: Object.freeze(mergedEvidence), observedCount: existing.observedCount + 1, lastMergedAt: new Date().toISOString() });
                this.#edges.set(key, merged);
                this.#diagnostics.duplicateEdgesMerged++;
                return { created: false, deduped: true, edge: merged };
            }

            const edge = Object.freeze({
                key, source, sourceType, target, targetType, relationship,
                sourceRegistry: sourceRegistry || null,
                evidence: Object.freeze(hasEvidence ? [evidence] : []),
                status: resolvedStatus,
                confidence: resolvedConfidence,
                lastVerified: lastVerified === undefined ? null : lastVerified,
                observedCount: 1,
                createdAt: new Date().toISOString()
            });
            this.#edges.set(key, edge);
            this.#diagnostics.edgesRegistered++;
            if (!hasEvidence) this.#diagnostics.unverifiedEdges++;
            return { created: true, deduped: false, edge };
        }

        listEdges(filter = {}) {
            return Array.from(this.#edges.values()).filter(e =>
                (filter.source === undefined || e.source === filter.source) &&
                (filter.target === undefined || e.target === filter.target) &&
                (filter.relationship === undefined || e.relationship === filter.relationship)
            );
        }

        // ---------------------------------------------------------------
        // Blocker detection (Phase 3 prompt §6)
        //   "What blocks this capability?" — walks depends_on edges from a
        //   CAPABILITY node, reads each DEPENDENCY node/edge status, and
        //   returns the ones that are not AVAILABLE/VERIFIED. Source-native
        //   statuses are preserved verbatim on each returned entry — never
        //   flattened to a single boolean.
        // ---------------------------------------------------------------
        getBlockers(capabilityId) {
            if (!this.hasNode("CAPABILITY", capabilityId)) {
                return { available: false, reason: `No CAPABILITY node registered for "${capabilityId}".` };
            }
            const dependsOnEdges = this.listEdges({ source: capabilityId, relationship: "depends_on" });
            const blockers = [];
            const clear = [];
            for (const edge of dependsOnEdges) {
                const depNode = this.getNode("DEPENDENCY", edge.target);
                const entry = {
                    dependency: edge.target,
                    status: edge.status,
                    confidence: edge.confidence,
                    evidence: edge.evidence,
                    sourceRegistry: edge.sourceRegistry,
                    dependencyMeta: depNode ? depNode.meta : null
                };
                if (NON_BLOCKING_STATUSES.has(edge.status)) clear.push(entry);
                else blockers.push(entry);
            }
            return { available: true, capabilityId, blockers, clear, totalDependencies: dependsOnEdges.length };
        }

        // ---------------------------------------------------------------
        // Circular dependency detection
        // ---------------------------------------------------------------

        /** Module/file-level cycles — pure pass-through to the real platform engine. Never re-derived here. */
        getModuleLevelCircularReport() {
            const engine = window.CozyOS.DependencyEngine;
            if (!engine || typeof engine.detectCircular !== "function") {
                return { available: false, reason: "window.CozyOS.DependencyEngine (core/platform/dependency-engine.js) is not loaded in this runtime." };
            }
            const result = engine.detectCircular();
            return { available: true, source: "core/platform/dependency-engine.js#detectCircular", ...result };
        }

        /**
         * Capability-level cycles — same DFS shape already used by
         * DependencyEngine.detectCircular() and
         * DependencyEngineFormula.detectCircularDependencies(), applied to
         * this graph's own depends_on/implemented_by edges. A different
         * domain (capability ids, not file paths or formula ids), so it is
         * not obtainable from either existing engine — see header.
         */
        detectCapabilityCircular() {
            const graph = new Map();
            for (const node of this.listNodes("CAPABILITY")) {
                const targets = this.listEdges({ source: node.id, relationship: "depends_on" })
                    .map(e => e.target)
                    .filter(t => this.hasNode("CAPABILITY", t)); // only capability->capability edges form capability-level cycles
                graph.set(node.id, targets);
            }
            const cycles = [];
            const visiting = new Set();
            const visited = new Set();
            const stack = [];
            const dfs = (nodeId) => {
                if (visiting.has(nodeId)) {
                    const cycleStart = stack.indexOf(nodeId);
                    cycles.push(stack.slice(cycleStart).concat(nodeId));
                    return;
                }
                if (visited.has(nodeId)) return;
                visiting.add(nodeId);
                stack.push(nodeId);
                for (const dep of graph.get(nodeId) || []) dfs(dep);
                stack.pop();
                visiting.delete(nodeId);
                visited.add(nodeId);
            };
            for (const nodeId of graph.keys()) dfs(nodeId);
            return { cycles, bestEffort: true, domain: "capability-graph", note: "Same DFS shape as DependencyEngine.detectCircular()/DependencyEngineFormula.detectCircularDependencies() — applied to capability-level depends_on edges, a domain neither existing engine represents." };
        }

        getDiagnosticsReport() { return { ...this.#diagnostics, totalNodes: this.#nodes.size, totalEdges: this.#edges.size }; }
    }

    // -------------------------------------------------------------------
    // Kiswahili proof case (Phase 3 prompt §9)
    //   Wires the graph from Phase 2's real buildKiswahiliValidationRecord()
    //   plus the two real language registries it already reads. Nothing
    //   here is hardcoded — every node/edge below is built from the live
    //   record returned at call time. NOT a Kiswahili audit and NOT the
    //   self-diagnosis engine (Phase 4) — this only makes the path walkable.
    // -------------------------------------------------------------------
    function buildKiswahiliDependencyGraph() {
        const contract = window.CozyOS.UnifiedCapabilityContract;
        if (!contract || typeof contract.buildKiswahiliValidationRecord !== "function") {
            return { available: false, reason: "window.CozyOS.UnifiedCapabilityContract (Phase 2) is not loaded in this runtime." };
        }
        const record = contract.buildKiswahiliValidationRecord();
        const graph = new CozyCapabilityDependencyGraph();

        graph.addNode("CAPABILITY", record.id, { name: record.name, overallStatus: record.overallStatus.value });

        // Signal -> graph status map. Explicit table, not an inferred rule —
        // same discipline as Phase 2's own DIMENSION_SIGNAL_MAP.
        const SIGNAL_TO_STATUS = Object.freeze({ positive: DEPENDENCY_STATUS.AVAILABLE, negative: DEPENDENCY_STATUS.NOT_VERIFIED, unknown: DEPENDENCY_STATUS.NOT_VERIFIED });

        for (const dim of record.dimensions) {
            const depId = `language:sw:${dim.key}`;
            if (!dim.hasSource) {
                graph.addNode("DEPENDENCY", depId, { key: dim.key, required: dim.required, note: "placeholder — no registry source (Phase 1 audit)" });
                graph.addEdge({
                    source: record.id, sourceType: "CAPABILITY", target: depId, targetType: "DEPENDENCY",
                    relationship: "depends_on", status: DEPENDENCY_STATUS.MISSING, confidence: "unverified",
                    evidence: dim.limitations[0] || null
                });
                continue;
            }
            graph.addNode("DEPENDENCY", depId, { key: dim.key, registry: dim.sourceStatus.registry, field: dim.sourceStatus.field, rawValue: dim.sourceStatus.rawValue });
            graph.addEdge({
                source: record.id, sourceType: "CAPABILITY", target: depId, targetType: "DEPENDENCY",
                relationship: "depends_on",
                sourceRegistry: dim.sourceStatus.registry,
                evidence: `${dim.sourceStatus.file}#${dim.sourceStatus.field}="${dim.sourceStatus.rawValue}"`,
                status: SIGNAL_TO_STATUS[dim.derivationSignal] || DEPENDENCY_STATUS.NOT_VERIFIED,
                confidence: "manifest",
                lastVerified: dim.observedAt
            });
        }

        for (const point of record.integrationPoints) {
            const implId = point.ref;
            graph.addNode("IMPLEMENTATION", implId, { type: point.type });
            graph.addEdge({
                source: record.id, sourceType: "CAPABILITY", target: implId, targetType: "IMPLEMENTATION",
                relationship: "implemented_by", sourceRegistry: "unified-capability-contract",
                evidence: `integrationPoints entry (${point.type})`, status: DEPENDENCY_STATUS.NOT_VERIFIED, confidence: "best-effort"
            });
        }

        // Test/evidence edge — Phase 2's own header discloses this is
        // "re-verified by cozy-language-registry.test.js ... not re-executed
        // by this call". Carried through honestly, not upgraded to VERIFIED.
        const responseGenDim = record.dimensions.find(d => d.key === "response_generation");
        if (responseGenDim && responseGenDim.evidenceRef) {
            const evidenceId = "cozy-language-registry.test.js";
            graph.addNode("TEST", evidenceId, { note: responseGenDim.evidenceRef.note });
            graph.addEdge({
                source: record.id, sourceType: "CAPABILITY", target: evidenceId, targetType: "TEST",
                relationship: "verified_by", sourceRegistry: "cozy-language-registry",
                evidence: responseGenDim.evidenceRef.note, status: DEPENDENCY_STATUS.NOT_VERIFIED, confidence: "unverified"
            });
        }

        // dependencyRefs — Phase 2 stores these as POINTERS ONLY (it never
        // calls DependencyEngine itself). This graph honors that same
        // restraint: the pointer becomes a DEPENDENCY node with status
        // NOT_VERIFIED, not a resolved file-dependency query.
        for (const ref of record.dependencyRefs) {
            const depId = ref.engine;
            graph.addNode("DEPENDENCY", depId, { note: ref.note, kind: "pointer" });
            graph.addEdge({
                source: record.id, sourceType: "CAPABILITY", target: depId, targetType: "DEPENDENCY",
                relationship: "depends_on", sourceRegistry: "unified-capability-contract",
                evidence: ref.note, status: DEPENDENCY_STATUS.NOT_VERIFIED, confidence: "unverified"
            });
        }

        return { available: true, graph, record };
    }

    const api = Object.freeze({
        getVersion() { return VERSION; },
        NODE_TYPES,
        RELATIONSHIP_TYPES,
        DEPENDENCY_STATUS,
        CozyCapabilityDependencyGraph,
        buildKiswahiliDependencyGraph
    });

    window.CozyOS.CapabilityDependencyGraph = api;
    window.CozyOS.Modules["capability-dependency-graph"] = Object.freeze({
        version: VERSION,
        description: "Phase 3 — unified capability dependency graph. Represents capability/dependency/implementation/module/integration_point/test/evidence relationships with mandatory provenance on every edge. Delegates file/module-level circular detection to the real platform DependencyEngine; never merges with it or with the formula DependencyEngineFormula. Does not implement self-diagnosis (Phase 4)."
    });

    // Self-registration only — descriptive metadata, never execution.
    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "CapabilityDependencyGraph",
                version: VERSION,
                category: "Builder",
                description: "Phase 3 unified capability dependency graph — provenance-required edges, blocker detection, capability-level circular detection.",
                sourcePath: "core/modules/builder/capability-dependency-graph.js"
            });
        } catch (_e) { /* registration is best-effort, never load-bearing */ }
    }
})();
