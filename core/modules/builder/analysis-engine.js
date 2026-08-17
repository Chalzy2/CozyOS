/**
 * CozyOS Enterprise Framework — CozyBuilder Layer 3 Analysis Engine
 * File Reference: core/modules/builder/analysis-engine.js
 * Layer: Core / Builder — Architectural Understanding (Layer 3: analysis)
 * Version: 1.0.0-ENTERPRISE
 * Introduced: M373 Layer 3 milestone
 *
 * RESPONSIBILITY
 *   Consumes Layer 1 (BuilderObservation manifest) and Layer 2
 *   (Layer2GraphComposer graphs) output and produces structured,
 *   evidence-backed findings. This layer ANALYZES ONLY — it never
 *   modifies production code and never performs repairs. That is a
 *   different, later responsibility (a Repair Layer), deliberately not
 *   built here.
 *
 * OWNERSHIP BOUNDARY
 *   understanding-engine.js owns per-file structural extraction.
 *   layer2-graph-composer.js owns cross-file graph composition. This
 *   file owns a third, separate responsibility — reasoning about what
 *   Layer 2's graphs already contain, plus a narrow, deterministic set
 *   of new regex extractions explicitly authorized below (Tier B) —
 *   and never re-implements Layer 1 or Layer 2's own extraction logic.
 *
 * TIER STRUCTURE (per M373 Decision 3 — authorized, do not expand
 * without a new Conflict/Ownership Review)
 *   Tier A — compose-only, built entirely from Layer2GraphComposer's
 *            existing verified signals: duplicate module candidates,
 *            circular dependencies, event routing problems, broken
 *            interface candidates, version compatibility issues,
 *            large/complex modules.
 *   Tier B — minimal, deterministic, rule-based regex extraction over
 *            raw file text (a signal neither Layer 1 nor Layer 2
 *            retains). Security heuristics and static leak heuristics
 *            only. No AI inference. No speculative findings.
 *   Tier C — NOT IMPLEMENTED. Dead/unreachable code, deep architecture
 *            violations, signature-level API inconsistencies, runtime
 *            performance bottlenecks, deep plugin compatibility,
 *            offline synchronization risk. No signal for any of these
 *            exists anywhere in the verified workspace. Fabricating
 *            findings for them is forbidden. See AA-003
 *            (architecture-ambiguity-registry.md) for the per-capability
 *            missing-signal breakdown. listUnimplementedTier() below
 *            returns that same list at runtime.
 *
 * FINDING STRUCTURE (per M373 Decision 5 — every emitted finding)
 *   findingId, findingType, severity, confidence, evidence,
 *   affectedModules, rootCause, recommendedRepair, compatibilityImpact,
 *   regressionRisk, suggestedRepairOrder. No finding is emitted without
 *   supporting evidence — every field above is populated from a real,
 *   traceable signal, never inferred or guessed.
 *
 * BUILDER MEMORY (per M373 Decision 2)
 *   Findings are persisted to window.CozyOS.CozyMemory, namespace
 *   "builder-analysis", one key per finding (findingId). Additive only
 *   — this engine fully functions (returns findings, just doesn't
 *   persist them) if CozyMemory is unavailable.
 *
 * REGISTRY SYSTEM (per M373 Decision 1)
 *   No Registry Loader / parser / registry engine is implemented here.
 *   AA/MD/DC/DI/SF/PF/RG registries remain documentation artifacts, not
 *   runtime services. This engine does not read or write those .md
 *   files at runtime.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const ENGINE_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    // AA-003 — capabilities this module deliberately does not analyze,
    // and why. Kept in code (not just in the doc registry) so callers
    // get the same honest answer at runtime without reading a separate
    // file. Registered as "Insufficient Signal" per M373 authorization
    // (not "Missing Feature" — these are evidence gaps, not absent
    // functionality).
    const UNIMPLEMENTED_TIER = Object.freeze([
        { capability: "Dead/unreachable code", reason: "No control-flow or reachability engine exists anywhere in the verified workspace; would require executing or symbolically tracing code, which this engine never does.", registryRef: "AA-003" },
        { capability: "Deep architecture violations", reason: "No engine encodes a machine-checkable architecture model beyond declared Layer headers and directory grouping (already in Module Graph); deeper rules would need a human-authored policy spec that does not yet exist.", registryRef: "AA-003" },
        { capability: "Signature-level API inconsistencies", reason: "API Graph carries method names only (regex-extracted), not parameter lists, types, or return shapes; no signal exists to compare signatures across callers/implementers.", registryRef: "AA-003" },
        { capability: "Runtime performance bottlenecks", reason: "No profiling or runtime-tracing capability exists in this sandbox or in any composed engine; would need real browser/device measurement, not static analysis.", registryRef: "AA-003" },
        { capability: "Deep plugin compatibility", reason: "Plugin Relationship Graph itself is unimplemented (AA-002); no signal exists yet to reason about plugin/host compatibility on top of it.", registryRef: "AA-003" },
        { capability: "Offline synchronization risk", reason: "Synchronization Flow Graph is unimplemented (AA-002, needs a call-graph engine); no signal exists to assess sync risk without it.", registryRef: "AA-003" }
    ]);

    // Tier B heuristics — deterministic, rule-based, regex-only. No AI
    // inference. Every pattern here maps 1:1 to an M373 Decision 3 Tier B
    // item; do not add patterns without a corresponding authorization.
    const SECURITY_PATTERNS = Object.freeze([
        { id: "eval-call", label: "eval( call", regex: /\beval\s*\(/g, severity: "high" },
        { id: "function-constructor", label: "Function( constructor", regex: /\bnew\s+Function\s*\(|\bFunction\s*\(\s*["'`]/g, severity: "high" },
        { id: "unsafe-innerhtml", label: "unsafe innerHTML assignment", regex: /\.innerHTML\s*=\s*(?!["'`]\s*["'`])/g, severity: "medium" },
        { id: "inline-event-handler", label: "inline event handler attribute", regex: /\bon(click|load|error|mouseover|focus|change|submit)\s*=\s*["']/gi, severity: "medium" },
        { id: "insecure-storage", label: "insecure storage of sensitive-looking data", regex: /(localStorage|sessionStorage)\.setItem\(\s*["'`][^"'`]*(password|token|secret|apikey|api_key)[^"'`]*["'`]/gi, severity: "high" }
    ]);

    const STATIC_LEAK_PATTERNS = Object.freeze([
        { id: "unmatched-setinterval", label: "setInterval without visible clearInterval in same file", severity: "medium" },
        { id: "unmatched-addeventlistener", label: "addEventListener without visible removeEventListener in same file", severity: "low" }
    ]);

    class CozyOSAnalysisEngine {
        #auditLogs = [];
        #listeners = new Map();
        #diagnostics = { analysesRun: 0, findingsEmitted: 0, findingsPersisted: 0, errorsHidden: 0, eventsEmitted: 0 };

        getVersion() { return ENGINE_VERSION; }
        getId() { return "AnalysisEngine"; }
        getDependencies() { return ["Layer2GraphComposer", "UnderstandingEngine", "CozyMemory"]; }

        #deepClone(value) {
            if (typeof structuredClone === "function") {
                try { return structuredClone(value); } catch (_err) { /* fall through */ }
            }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        #enforceNoForbiddenKeys(obj, path = "root") {
            if (!obj || typeof obj !== "object") return;
            for (const key of Object.keys(obj)) {
                if (FORBIDDEN_KEYS.has(key)) throw new Error(`[AnalysisEngine] Prototype-pollution key "${key}" rejected at path "${path}.${key}".`);
                this.#enforceNoForbiddenKeys(obj[key], `${path}.${key}`);
            }
        }

        #logAudit(action, msg) {
            this.#auditLogs.push(Object.freeze({ id: "l3_aud_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now()), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
        }

        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[AnalysisEngine] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[AnalysisEngine] on(): handler must be a function.");
            if (!this.#listeners.has(eventName)) this.#listeners.set(eventName, new Set());
            this.#listeners.get(eventName).add(handler);
            return () => { const s = this.#listeners.get(eventName); if (s) s.delete(handler); };
        }

        emit(eventName, payload) {
            this.#diagnostics.eventsEmitted++;
            const set = this.#listeners.get(eventName);
            if (!set) return false;
            for (const handler of set) { try { handler(payload); } catch (_err) { this.#diagnostics.errorsHidden++; } }
            return true;
        }

        #nextFindingId(prefix) {
            return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        }

        #baseFinding(overrides) {
            return Object.assign({
                findingId: null,
                findingType: null,
                severity: "low",
                confidence: "verified",
                evidence: [],
                affectedModules: [],
                rootCause: null,
                recommendedRepair: null,
                compatibilityImpact: "unknown — not assessed by this engine",
                regressionRisk: "unknown — not assessed by this engine",
                suggestedRepairOrder: null
            }, overrides);
        }

        // =====================================================================
        // ─── ENTRY POINT ────────────────────────────────────────────────────
        // =====================================================================

        /**
         * analyze(files, { graphs, manifest, repoAnalysis, persist })
         *   files: [{name, text}] — required for Tier B (raw-text regex
         *   scan); optional if only Tier A is desired and graphs is
         *   supplied directly.
         *   opts.graphs: an already-built Layer2GraphComposer.buildGraphs()
         *   result. If omitted, this engine calls Layer2GraphComposer
         *   itself (never re-implements graph composition).
         *   opts.persist: if true (default), emitted findings are saved
         *   to CozyMemory under namespace "builder-analysis" when
         *   available; additive only, never required for this method to
         *   return a complete result.
         */
        analyze(files, { graphs = null, manifest = null, repoAnalysis = null, persist = true } = {}) {
            this.#diagnostics.analysesRun++;

            if (!graphs) {
                const composer = window.CozyOS.Layer2GraphComposer;
                if (!composer || typeof composer.buildGraphs !== "function") {
                    return { available: false, reason: "Layer2GraphComposer is not connected — Layer 3 cannot analyze without Layer 2's graphs, and will not re-derive them itself." };
                }
                graphs = composer.buildGraphs(files || [], { manifest, repoAnalysis });
                if (graphs && graphs.available === false) return graphs;
            }

            const tierAFindings = [
                ...this.#findDuplicateModules(graphs),
                ...this.#findCircularDependencies(graphs),
                ...this.#findEventRoutingProblems(graphs),
                ...this.#findBrokenInterfaceCandidates(graphs),
                ...this.#findVersionCompatibilityIssues(graphs),
                ...this.#findLargeComplexModules(graphs)
            ];

            const tierBFindings = Array.isArray(files) && files.length
                ? [...this.#scanSecurityHeuristics(files), ...this.#scanStaticLeakHeuristics(files)]
                : [];

            const allFindings = [...tierAFindings, ...tierBFindings];
            allFindings.forEach(f => { this.#enforceNoForbiddenKeys(f); });

            let persistedCount = 0;
            if (persist) persistedCount = this.#persistFindings(allFindings);

            const result = {
                generatedAt: new Date().toISOString(),
                engineVersion: ENGINE_VERSION,
                sourceComposerVersion: graphs.composerVersion || null,
                findingCount: allFindings.length,
                findings: allFindings,
                tierACount: tierAFindings.length,
                tierBCount: tierBFindings.length,
                unimplementedTier: UNIMPLEMENTED_TIER,
                persisted: persistedCount
            };

            this.#diagnostics.findingsEmitted += allFindings.length;
            this.#logAudit("ANALYSIS_RUN", `${allFindings.length} findings emitted (${tierAFindings.length} Tier A, ${tierBFindings.length} Tier B); ${persistedCount} persisted to CozyMemory.`);
            this.emit("analysis:complete", { findingCount: allFindings.length });
            return this.#deepClone(result);
        }

        listUnimplementedTier() { return this.#deepClone(UNIMPLEMENTED_TIER); }

        // =====================================================================
        // ─── TIER A — COMPOSE ONLY (Layer2GraphComposer's own signals) ─────
        // =====================================================================

        // Real signal: Module Graph nodes grouped by className. Two+ files
        // declaring the same className is the verified duplicate-module
        // signal already implicit in Layer 2's moduleGraph.nodes.
        #findDuplicateModules(graphs) {
            const nodes = (graphs.moduleGraph && graphs.moduleGraph.nodes) || [];
            const byClassName = new Map();
            for (const n of nodes) {
                if (!byClassName.has(n.id)) byClassName.set(n.id, []);
                byClassName.get(n.id).push(n);
            }
            const findings = [];
            for (const [className, group] of byClassName.entries()) {
                if (group.length < 2) continue;
                findings.push(this.#baseFinding({
                    findingId: this.#nextFindingId("DUP"),
                    findingType: "duplicate-module-candidate",
                    severity: "medium",
                    confidence: "verified",
                    evidence: group.map(g => `${g.file} declares class "${className}"${g.version ? ` (version ${g.version})` : ""}`),
                    affectedModules: group.map(g => g.file),
                    rootCause: `Module Graph shows ${group.length} files declaring the same className "${className}".`,
                    recommendedRepair: "Human review required to confirm whether this is a genuine duplicate engine (Repository Integrity: No Duplicate Systems) or an intentional multi-file split under one class name; this engine does not repair, only reports.",
                    suggestedRepairOrder: "After Root Cause Discovery Rule review — not automatic."
                }));
            }
            return findings;
        }

        // Real signal: Dependency Graph's own #detectCycles() output,
        // reused verbatim — never re-derived here.
        #findCircularDependencies(graphs) {
            const cycles = (graphs.dependencyGraph && graphs.dependencyGraph.circularDependencies) || [];
            return cycles.map(cycle => this.#baseFinding({
                findingId: this.#nextFindingId("CYC"),
                findingType: "circular-dependency",
                severity: "high",
                confidence: "verified",
                evidence: [`Dependency Graph cycle: ${cycle.join(" -> ")}`],
                affectedModules: Array.from(new Set(cycle)),
                rootCause: "Layer2GraphComposer.buildDependencyGraph()'s DFS cycle detection found a closed loop in window.CozyOS.<Name> reference edges.",
                recommendedRepair: "Human review required to determine which edge should be broken (e.g. via a lazy getter, event-based decoupling, or a shared sibling module); this engine does not select or apply a repair.",
                suggestedRepairOrder: "Before any further composition work touching the involved files — circular init order is a real runtime risk."
            }));
        }

        // Real signal: Event Graph's noObservedConsumer / noObservedProducer
        // flags, reused verbatim.
        #findEventRoutingProblems(graphs) {
            const events = (graphs.eventGraph && graphs.eventGraph.events) || [];
            const findings = [];
            for (const e of events) {
                if (e.noObservedConsumer) {
                    findings.push(this.#baseFinding({
                        findingId: this.#nextFindingId("EVT"),
                        findingType: "event-no-observed-consumer",
                        severity: "low",
                        confidence: "unverified-may-be-external",
                        evidence: [`Event "${e.event}" emitted by: ${e.producers.join(", ") || "(none recorded)"}; no .on("${e.event}") found in the analyzed file set.`],
                        affectedModules: e.producers,
                        rootCause: "Event Graph found a producer with no matching consumer within the analyzed files.",
                        recommendedRepair: "Not necessarily a defect — the consumer may live outside the analyzed file set. Human review before treating as dead code, per Event Graph's own verificationMethod disclosure.",
                        suggestedRepairOrder: "Low priority; confirm scope first."
                    }));
                }
                if (e.noObservedProducer) {
                    findings.push(this.#baseFinding({
                        findingId: this.#nextFindingId("EVT"),
                        findingType: "event-no-observed-producer",
                        severity: "low",
                        confidence: "unverified-may-be-external",
                        evidence: [`Event "${e.event}" consumed by: ${e.consumers.join(", ") || "(none recorded)"}; no emit("${e.event}") found in the analyzed file set.`],
                        affectedModules: e.consumers,
                        rootCause: "Event Graph found a consumer with no matching producer within the analyzed files.",
                        recommendedRepair: "May indicate the listener is dormant, or the producer lives outside the analyzed file set. Human review required.",
                        suggestedRepairOrder: "Low priority; confirm scope first."
                    }));
                }
            }
            return findings;
        }

        // Real signal: Dependency Graph's unresolvedReferences — a
        // window.CozyOS.<Name> read with no matching exportedAs in the
        // analyzed set is the verified "broken interface candidate" signal.
        #findBrokenInterfaceCandidates(graphs) {
            const unresolved = (graphs.dependencyGraph && graphs.dependencyGraph.unresolvedReferences) || [];
            return unresolved.map(u => this.#baseFinding({
                findingId: this.#nextFindingId("IFC"),
                findingType: "broken-interface-candidate",
                severity: "low",
                confidence: "unverified-may-be-external",
                evidence: [`${u.from} references window.CozyOS.${u.via}, which has no matching exportedAs in the analyzed file set.`],
                affectedModules: [u.from],
                rootCause: "Dependency Graph could not resolve this reference within the analyzed files.",
                recommendedRepair: "May be a real file outside the analyzed set, an optional integration, or a genuinely broken reference. Human review required before concluding it's broken.",
                suggestedRepairOrder: "After confirming analysis scope covers the full repository."
            }));
        }

        // Real signal: Module Graph's version field, grouped by className.
        // Same-name modules declaring different version strings is the
        // verified signal — no semantic semver comparison is claimed.
        #findVersionCompatibilityIssues(graphs) {
            const nodes = (graphs.moduleGraph && graphs.moduleGraph.nodes) || [];
            const byClassName = new Map();
            for (const n of nodes) {
                if (!n.version) continue;
                if (!byClassName.has(n.id)) byClassName.set(n.id, new Set());
                byClassName.get(n.id).add(n.version);
            }
            const findings = [];
            for (const [className, versions] of byClassName.entries()) {
                if (versions.size < 2) continue;
                const affected = nodes.filter(n => n.id === className).map(n => n.file);
                findings.push(this.#baseFinding({
                    findingId: this.#nextFindingId("VER"),
                    findingType: "version-compatibility-issue",
                    severity: "medium",
                    confidence: "verified",
                    evidence: [`className "${className}" declares ${versions.size} distinct version strings across analyzed files: ${Array.from(versions).join(", ")}`],
                    affectedModules: affected,
                    rootCause: "Module Graph shows differing declared Version headers for the same className.",
                    recommendedRepair: "Human review required to confirm intended baseline version and reconcile per Repository Integrity rules; this engine does not select the correct version.",
                    suggestedRepairOrder: "Before further composition work depends on this module's version-specific behavior."
                }));
            }
            return findings;
        }

        // Real signal: API Graph's methodCount per file, already extracted
        // by Layer 2. A threshold flag on an existing signal, not a new
        // parser — complexity is approximated honestly as method-count,
        // and disclosed as such, not claimed as cyclomatic complexity.
        #findLargeComplexModules(graphs) {
            const THRESHOLD = 25;
            const nodes = (graphs.apiGraph && graphs.apiGraph.nodes) || [];
            return nodes
                .filter(n => n.methodCount >= THRESHOLD)
                .map(n => this.#baseFinding({
                    findingId: this.#nextFindingId("LRG"),
                    findingType: "large-complex-module",
                    severity: "low",
                    confidence: "verified-as-proxy-signal",
                    evidence: [`${n.file} (className "${n.className}") has ${n.methodCount} extracted public methods, at/above the ${THRESHOLD}-method review threshold.`],
                    affectedModules: [n.file],
                    rootCause: "API Graph method-count used as an honest proxy for size/complexity; true cyclomatic complexity is not extracted by any engine in this workspace.",
                    recommendedRepair: "Not necessarily a defect. Human review recommended to consider a responsibility split if the file's own header scope has grown beyond its original boundary.",
                    suggestedRepairOrder: "Low priority; informational."
                }));
        }

        // =====================================================================
        // ─── TIER B — MINIMAL DETERMINISTIC EXTRACTION (raw text only) ─────
        // =====================================================================

        #scanSecurityHeuristics(files) {
            const findings = [];
            for (const f of files) {
                if (!f || typeof f.name !== "string" || typeof f.text !== "string" || !f.name.endsWith(".js")) continue;
                for (const pattern of SECURITY_PATTERNS) {
                    const matches = Array.from(f.text.matchAll(pattern.regex));
                    if (!matches.length) continue;
                    const lines = matches.slice(0, 10).map(m => this.#lineNumberAt(f.text, m.index));
                    findings.push(this.#baseFinding({
                        findingId: this.#nextFindingId("SEC"),
                        findingType: `security-heuristic:${pattern.id}`,
                        severity: pattern.severity,
                        confidence: "verified-pattern-match",
                        evidence: [`${f.name}: ${matches.length} match(es) for "${pattern.label}" at line(s) ${lines.join(", ")}${matches.length > 10 ? " (+more)" : ""}`],
                        affectedModules: [f.name],
                        rootCause: `Deterministic regex match for "${pattern.label}" (Tier B security heuristic, per M373 Decision 3).`,
                        recommendedRepair: "Human review required — a regex match is not proof of an exploitable defect. This engine performs no AI inference and makes no severity judgment beyond the pattern's own fixed rating.",
                        suggestedRepairOrder: pattern.severity === "high" ? "Prioritize review before next release." : "Review at next convenient pass."
                    }));
                }
            }
            return findings;
        }

        #scanStaticLeakHeuristics(files) {
            const findings = [];
            for (const f of files) {
                if (!f || typeof f.name !== "string" || typeof f.text !== "string" || !f.name.endsWith(".js")) continue;

                const setIntervalCount = (f.text.match(/\bsetInterval\s*\(/g) || []).length;
                const clearIntervalCount = (f.text.match(/\bclearInterval\s*\(/g) || []).length;
                if (setIntervalCount > clearIntervalCount) {
                    findings.push(this.#baseFinding({
                        findingId: this.#nextFindingId("LEAK"),
                        findingType: "static-leak-heuristic:unmatched-setinterval",
                        severity: "medium",
                        confidence: "verified-pattern-match",
                        evidence: [`${f.name}: ${setIntervalCount} setInterval( call(s) vs ${clearIntervalCount} clearInterval( call(s)) in the same file.`],
                        affectedModules: [f.name],
                        rootCause: "Deterministic count comparison (Tier B static leak heuristic, per M373 Decision 3). Does not trace whether the interval is actually cleared elsewhere (e.g. stored and cleared via a different variable name, or intentionally long-lived).",
                        recommendedRepair: "Human review required to confirm whether this is a genuine leak or an intentional long-lived interval.",
                        suggestedRepairOrder: "Review at next convenient pass."
                    }));
                }

                const addListenerCount = (f.text.match(/\baddEventListener\s*\(/g) || []).length;
                const removeListenerCount = (f.text.match(/\bremoveEventListener\s*\(/g) || []).length;
                if (addListenerCount > removeListenerCount) {
                    findings.push(this.#baseFinding({
                        findingId: this.#nextFindingId("LEAK"),
                        findingType: "static-leak-heuristic:unmatched-addeventlistener",
                        severity: "low",
                        confidence: "verified-pattern-match",
                        evidence: [`${f.name}: ${addListenerCount} addEventListener( call(s) vs ${removeListenerCount} removeEventListener( call(s)) in the same file.`],
                        affectedModules: [f.name],
                        rootCause: "Deterministic count comparison (Tier B static leak heuristic, per M373 Decision 3). Many listeners are intentionally permanent (e.g. bound once at module init); this is a review flag, not a confirmed leak.",
                        recommendedRepair: "Human review required.",
                        suggestedRepairOrder: "Low priority; informational."
                    }));
                }
            }
            return findings;
        }

        #lineNumberAt(text, index) {
            if (typeof index !== "number" || index < 0) return "?";
            let line = 1;
            for (let i = 0; i < index && i < text.length; i++) { if (text[i] === "\n") line++; }
            return line;
        }

        // =====================================================================
        // ─── BUILDER MEMORY (Decision 2) ────────────────────────────────────
        // =====================================================================

        #persistFindings(findings) {
            const memory = window.CozyOS.CozyMemory;
            if (!memory || typeof memory.saveMemory !== "function") return 0;
            let count = 0;
            for (const finding of findings) {
                try {
                    memory.saveMemory("builder-analysis", finding.findingId, finding, {
                        actorId: "AnalysisEngine",
                        tags: ["layer3", finding.findingType, finding.severity]
                    });
                    count++;
                } catch (_err) {
                    this.#diagnostics.errorsHidden++;
                }
            }
            this.#diagnostics.findingsPersisted += count;
            return count;
        }

        // =====================================================================
        // ─── DIAGNOSTICS ────────────────────────────────────────────────────
        // =====================================================================

        getDiagnosticsReport() {
            return this.#deepClone({
                engineVersion: ENGINE_VERSION,
                ...this.#diagnostics,
                unimplementedTierCount: UNIMPLEMENTED_TIER.length,
                dependencies: [
                    { name: "Layer2GraphComposer", required: true, purpose: "Tier A findings are composed entirely from its graphs." },
                    { name: "UnderstandingEngine", required: false, purpose: "Indirectly required — Layer2GraphComposer depends on it when graphs are not pre-supplied." },
                    { name: "CozyMemory", required: false, purpose: "Persists findings under namespace \"builder-analysis\"; engine fully functions without it." }
                ],
                auditLogCount: this.#auditLogs.length
            });
        }

        getAuditLog(predicate) {
            const list = this.#auditLogs.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        isVersionCompatible(version) {
            const a = /^v?(\d+)\./.exec(String(ENGINE_VERSION));
            const b = /^v?(\d+)\./.exec(String(version || ""));
            if (!a || !b) return false;
            return a[1] === b[1];
        }
    }

    if (window.CozyOS.AnalysisEngine && typeof window.CozyOS.AnalysisEngine.getVersion === "function") {
        const existingVersion = window.CozyOS.AnalysisEngine.getVersion();
        if (existingVersion !== ENGINE_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: AnalysisEngine existing v${existingVersion} conflicts with load target v${ENGINE_VERSION}.`);
        }
        return;
    }

    window.CozyOS.AnalysisEngine = new CozyOSAnalysisEngine();

    (function registerWithServiceRegistry(descriptor) {
        function attempt() {
            if (typeof window.CozyOS.registerCoordinator !== "function") return false;
            try { window.CozyOS.registerCoordinator(descriptor); } catch (_err) { /* non-fatal */ }
            return true;
        }
        if (attempt()) return;
        if (!Object.prototype.hasOwnProperty.call(window.CozyOS, "__pendingCoordinatorRegistrations")) {
            Object.defineProperty(window.CozyOS, "__pendingCoordinatorRegistrations", { value: [], writable: true, enumerable: false, configurable: true });
        }
        window.CozyOS.__pendingCoordinatorRegistrations.push(descriptor);
        let attempts = 0;
        const maxAttempts = 200;
        const intervalId = setInterval(() => {
            attempts++;
            if (attempt() || attempts >= maxAttempts) {
                clearInterval(intervalId);
                const idx = window.CozyOS.__pendingCoordinatorRegistrations.indexOf(descriptor);
                if (idx !== -1) window.CozyOS.__pendingCoordinatorRegistrations.splice(idx, 1);
            }
        }, 250);
    })({ sourcePath: "core/modules/builder/analysis-engine.js",
        name: "AnalysisEngine", category: "Living Engine", icon: "analysis-engine.svg",
        description: "CozyBuilder's Layer 3 analysis — consumes Layer2GraphComposer's graphs to emit evidence-backed findings (Tier A: duplicate modules, circular dependencies, event routing problems, broken interface candidates, version compatibility issues, large/complex modules) plus deterministic Tier B security/static-leak heuristics. Analyzes only; never repairs. See listUnimplementedTier() / AA-003 for what it deliberately does not cover."
    });
})();
