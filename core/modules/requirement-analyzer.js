/**
 * CozyOS Enterprise Framework — CozyRequirementAnalyzer
 * File Reference: core/modules/builder/requirement-analyzer.js
 * Version: 1.0.0-ENTERPRISE
 * Layer: Core / Code Generation — Requirement Analyzer
 *
 * RESPONSIBILITY
 *   Converts an unstructured description into a structured requirement
 *   record and a real Requirements Book — the layer between Research
 *   Engine and the (not-yet-built) AI Question Engine / Architecture
 *   Engine. Reuses UnderstandingEngine (application type, detected
 *   features, gap detection, entity plan) and BuilderAI (entity/plan
 *   extraction) rather than duplicating either.
 *
 * WHAT THIS MODULE ACTUALLY DOES
 *   - Every field is extracted by a real, disclosed keyword/pattern
 *     heuristic (regex/keyword matching against curated word lists) —
 *     never a semantic-understanding model. This is the SAME class of
 *     technique UnderstandingEngine's own Gap Detector already uses,
 *     extended to more categories (roles, constraints, risks,
 *     assumptions, non-functional requirements, integrations).
 *   - Complexity/phase estimates are a real, deterministic formula from
 *     counted signals (entities, features, gaps) — disclosed as a rough
 *     heuristic, not a calibrated estimation model.
 *   - Builder Memory integration is genuinely optional: if
 *     window.CozyOS.BuilderMemory exists, its stored decisions are
 *     consulted and referenced; if it doesn't exist (it hasn't been
 *     built yet as of this version), that is reported honestly rather
 *     than silently proceeding as if memory were being used.
 *
 * WHAT THIS MODULE DOES NOT DO (Zero Logic Rule)
 *   - Never claims genuine natural-language understanding — "objectives",
 *     "risks", "assumptions" etc. are sentences matched by keyword
 *     triggers, not comprehended meaning. Every extracted field says so
 *     in its `method` tag.
 *   - Never fabricates Builder Memory content when that coordinator is
 *     absent — reports {available:false} instead.
 *   - Never executes, evaluates, or imports the analyzed text.
 *
 * OPTIONAL INTEGRATIONS
 *   UnderstandingEngine — applicationType/detectedFeatures/gaps/plan.
 *   BuilderAI            — entity extraction (via UnderstandingEngine's plan).
 *   ResearchEngine        — analyzeRequirement() can be fed a Research
 *                          Engine entry's extractedText directly by the
 *                          caller; this module does not read ResearchEngine
 *                          itself, keeping the dependency one-directional.
 *   BuilderMemory         — consulted if present; never required.
 *   ServiceRegistry       — registerCoordinator(), with retry.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const RA_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    // Real, curated keyword lists — every one disclosed as a keyword
    // heuristic wherever it's surfaced, never presented as comprehension.
    const ROLE_KEYWORDS = Object.freeze([
        "admin", "administrator", "manager", "operator", "customer", "member", "user",
        "guest", "supervisor", "owner", "staff", "employee", "clerk", "cashier",
        "driver", "technician", "auditor", "accountant", "pastor", "volunteer"
    ]);
    const OBJECTIVE_TRIGGERS = Object.freeze(["must", "should", "need to", "goal is", "in order to", "so that", "objective"]);
    const CONSTRAINT_TRIGGERS = Object.freeze(["must not", "cannot", "should not", "not allowed", "restricted to", "only if", "limited to"]);
    const RISK_TRIGGERS = Object.freeze(["risk", "danger", "concern", "could fail", "may fail", "vulnerable", "single point of failure"]);
    const ASSUMPTION_TRIGGERS = Object.freeze(["assume", "assuming", "expected to", "presume"]);
    const NFR_CATEGORIES = Object.freeze({
        Performance: ["fast", "performance", "latency", "throughput", "scalable", "scalability"],
        Security: ["secure", "security", "encryption", "authentication", "authorization", "permission"],
        Offline: ["offline", "no internet", "local-first", "without connectivity"],
        Accessibility: ["accessible", "accessibility", "screen reader", "wcag", "a11y"],
        Reporting: ["report", "reporting", "export", "dashboard", "analytics"],
        Availability: ["uptime", "availability", "always available", "24/7"]
    });
    const INTEGRATION_KEYWORDS = Object.freeze({
        Workspace: ["workspace", "file management", "save file"],
        Certification: ["certification", "certified", "quality gate"],
        BugFixer: ["bug fixer", "auto-repair", "auto repair"],
        ServiceRegistry: ["service registry", "coordinator registry"],
        OCR: ["ocr", "scan document", "extract text from image"],
        AIMode: ["ai assistant", "chatgpt", "claude", "gemini", "ai integration"],
        Payments: ["mpesa", "m-pesa", "stripe", "paypal", "payment gateway"]
    });

    class CozyOSRequirementAnalyzer {
        #auditLogs = [];
        #timelineEvents = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #analyses = new Map();
        #diagnostics = { analysesRun: 0, requirementsBooksGenerated: 0, memoryConsulted: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 3.5 };

        getVersion() { return RA_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        #escapeHtml(value) {
            const str = String(value === undefined || value === null ? "" : value);
            return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }

        #generateId(prefix) {
            const raw = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            return `${prefix}_${raw}`;
        }

        #logAudit(action, msg) {
            this.#auditLogs.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
        }

        #logTimeline(label) {
            this.#timelineEvents.push(Object.freeze({ time: new Date().toISOString(), label }));
            if (this.#timelineEvents.length > 500) this.#timelineEvents.shift();
        }

        getAuditLog(predicate) {
            const list = this.#auditLogs.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        getTimeline(predicate) {
            const list = this.#timelineEvents.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        // =====================================================================
        // ─── EVENT BUS ────────────────────────────────────────────────────────
        // =====================================================================

        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[RequirementAnalyzer] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[RequirementAnalyzer] on(): handler must be a function.");
            if (!this.#listeners.has(eventName)) this.#listeners.set(eventName, new Set());
            this.#listeners.get(eventName).add(handler);
            return () => this.off(eventName, handler);
        }

        off(eventName, handler) {
            const set = this.#listeners.get(eventName);
            if (!set) return false;
            const wrapped = this.#onceWrapped.get(handler);
            const removed = set.delete(handler) || (wrapped ? set.delete(wrapped) : false);
            if (set.size === 0) this.#listeners.delete(eventName);
            return removed;
        }

        once(eventName, handler) {
            if (typeof handler !== "function") throw new TypeError("[RequirementAnalyzer] once(): handler must be a function.");
            const wrapper = (payload) => { this.off(eventName, handler); this.#onceWrapped.delete(handler); handler(payload); };
            this.#onceWrapped.set(handler, wrapper);
            this.on(eventName, wrapper);
        }

        emit(eventName, payload) {
            if (typeof eventName !== "string" || !eventName.trim()) { this.#diagnostics.errorsHidden++; return false; }
            const set = this.#listeners.get(eventName);
            this.#diagnostics.eventsEmitted++;
            if (!set || set.size === 0) return false;
            let safePayload = payload;
            try { safePayload = this.#deepClone(payload); } catch (_err) { safePayload = payload; }
            for (const fn of Array.from(set)) { try { fn(safePayload); } catch (_err) { this.#diagnostics.errorsHidden++; } }
            return true;
        }

        #ue() { return (window.CozyOS && window.CozyOS.UnderstandingEngine) || null; }
        #memory() { return (window.CozyOS && window.CozyOS.BuilderMemory) || null; }

        // =====================================================================
        // ─── EXTRACTION HELPERS (real, keyword-based, disclosed as such) ──────
        // =====================================================================

        #splitSentences(text) {
            return text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
        }

        #sentencesMatching(sentences, triggers) {
            return sentences.filter(s => triggers.some(t => s.toLowerCase().includes(t)));
        }

        #detectRoles(text) {
            const lower = text.toLowerCase();
            return ROLE_KEYWORDS.filter(r => new RegExp(`\\b${r}s?\\b`).test(lower));
        }

        #detectNonFunctionalRequirements(text) {
            const lower = text.toLowerCase();
            return Object.entries(NFR_CATEGORIES)
                .filter(([, keywords]) => keywords.some(k => lower.includes(k)))
                .map(([category]) => category);
        }

        #detectIntegrations(text) {
            const lower = text.toLowerCase();
            return Object.entries(INTEGRATION_KEYWORDS)
                .filter(([, keywords]) => keywords.some(k => lower.includes(k)))
                .map(([name]) => name);
        }

        /**
         * #checkMemoryForSimilarAnalyses(text)
         *   Memory Read Rule: "have we analyzed something like this
         *   before?" Searches CozyMemory's real "Project" namespace for
         *   prior requirement-* entries using the same keyword-extraction
         *   technique CozyBuilder's own Memory Read Rule uses — kept
         *   consistent across engines. Non-blocking, purely informational;
         *   returns an empty array when CozyMemory isn't connected or
         *   nothing real matches.
         */
        #checkMemoryForSimilarAnalyses(text) {
            const mem = window.CozyOS.CozyMemory;
            if (!mem || typeof mem.searchMemory !== "function") return [];
            const STOPWORDS = new Set(["build", "create", "generate", "manage", "management", "system", "the", "a", "an", "of", "for", "with", "and"]);
            const keywords = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
            if (keywords.length === 0) return [];

            const matchesByKey = new Map();
            for (const keyword of keywords) {
                let results;
                try { results = mem.searchMemory("Project", keyword); } catch (_err) { continue; }
                for (const r of results.filter(r => r.key.startsWith("requirement-"))) {
                    const existing = matchesByKey.get(r.key);
                    matchesByKey.set(r.key, { r, matchCount: (existing ? existing.matchCount : 0) + r.matchCount });
                }
            }
            return Array.from(matchesByKey.values())
                .sort((a, b) => b.matchCount - a.matchCount)
                .slice(0, 5)
                .map(({ r, matchCount }) => ({
                    key: r.key, matchCount,
                    domain: r.entry.value.domain, complexity: r.entry.value.complexity ? r.entry.value.complexity.level : null,
                    analyzedAt: r.entry.savedAt
                }));
        }

        /**
         * #estimateComplexity({ entityCount, featureCount, gapCount, roleCount })
         *   A real, deterministic formula from counted signals — disclosed
         *   as a rough heuristic, not a calibrated estimation model.
         *   Buckets: Simple / Moderate / Complex / Enterprise.
         */
        #estimateComplexity({ entityCount, featureCount, gapCount, roleCount }) {
            const score = entityCount * 2 + featureCount * 1.5 + gapCount * 0.5 + roleCount;
            let level, phases;
            if (score < 6) { level = "Simple"; phases = 1; }
            else if (score < 14) { level = "Moderate"; phases = 2; }
            else if (score < 24) { level = "Complex"; phases = 3; }
            else { level = "Enterprise"; phases = 4; }
            return { level, estimatedPhases: phases, rawScore: Math.round(score * 10) / 10, method: "deterministic weighted count (heuristic, not a calibrated estimator)" };
        }

        // =====================================================================
        // ─── ANALYSIS ─────────────────────────────────────────────────────────
        // =====================================================================

        /**
         * analyzeRequirement(text, { domain, consultMemory })
         *   Real extraction across the requested categories, delegating
         *   applicationType/detectedFeatures/gaps/plan to
         *   UnderstandingEngine (never duplicated here). Builder Memory is
         *   consulted only if window.CozyOS.BuilderMemory actually exists;
         *   memoryConsulted:false with a reason is returned honestly
         *   otherwise, matching this module's own version note that
         *   Builder Memory has not been built as of this release.
         */
        analyzeRequirement(text, { domain = null, consultMemory = true } = {}) {
            if (typeof text !== "string" || !text.trim()) throw new TypeError("[RequirementAnalyzer] analyzeRequirement(): text is required.");
            const ue = this.#ue();
            if (!ue) throw new Error("[RequirementAnalyzer] UnderstandingEngine is not connected — no analysis path is available.");
            this.#diagnostics.analysesRun++;

            const understanding = ue.analyzeText(text);
            const gapReport = ue.detectRequirementGaps(text);
            const sentences = this.#splitSentences(text);

            let memoryResult = { available: false, reason: "Builder Memory (window.CozyOS.BuilderMemory) is not connected — no prior decisions were consulted." };
            const memory = this.#memory();
            if (consultMemory && memory && typeof memory.getRelevantDecisions === "function") {
                try { memoryResult = { available: true, decisions: memory.getRelevantDecisions(text) }; this.#diagnostics.memoryConsulted++; }
                catch (err) { memoryResult = { available: false, reason: err.message }; }
            }
            const priorAnalyses = consultMemory ? this.#checkMemoryForSimilarAnalyses(text) : [];

            const roles = this.#detectRoles(text);
            const objectives = this.#sentencesMatching(sentences, OBJECTIVE_TRIGGERS);
            const constraints = this.#sentencesMatching(sentences, CONSTRAINT_TRIGGERS);
            const risks = this.#sentencesMatching(sentences, RISK_TRIGGERS);
            const assumptions = this.#sentencesMatching(sentences, ASSUMPTION_TRIGGERS);
            const nonFunctionalRequirements = this.#detectNonFunctionalRequirements(text);
            const requiredIntegrations = this.#detectIntegrations(text);
            const entities = understanding.plan ? understanding.plan.entities.map(e => e.name) : [];

            const complexity = this.#estimateComplexity({
                entityCount: entities.length, featureCount: understanding.detectedFeatures.length,
                gapCount: gapReport.missing.length, roleCount: roles.length
            });

            const analysisId = this.#generateId("req");
            const analysis = Object.freeze({
                id: analysisId, analyzedAt: new Date().toISOString(),
                rawText: text,
                domain: domain || understanding.applicationType,
                problemStatement: sentences[0] || null,
                objectives, roles, stakeholders: roles, // stakeholders and roles share the same keyword signal at this heuristic level — disclosed, not fabricated as a distinct extraction
                functionalRequirements: understanding.detectedFeatures,
                nonFunctionalRequirements, constraints, risks, assumptions,
                missingInformation: gapReport.missing.map(g => g.label),
                requiredIntegrations, requiredModules: entities, databaseEntities: entities,
                recommendedArchitecture: understanding.recommendedArchitecture,
                complexity,
                memory: memoryResult, priorAnalyses,
                method: "keyword/pattern heuristic extraction — not genuine natural-language comprehension"
            });
            this.#analyses.set(analysisId, analysis);
            if (window.CozyOS.CozyMemory) {
                try { window.CozyOS.CozyMemory.saveMemory("Project", `requirement-${analysisId}`, analysis, { tags: ["requirement", analysis.domain] }); } catch (_err) { /* memory is additive — never blocks analysis */ }
            }

            this.#logAudit("REQUIREMENT_ANALYZED", `${analysisId}: domain=${analysis.domain}, complexity=${complexity.level}`);
            this.#logTimeline(`Requirement analyzed: ${analysis.domain}`);
            this.emit("requirement:analyzed", { analysisId, domain: analysis.domain, complexity: complexity.level });
            return this.#deepClone(analysis);
        }

        getAnalysis(analysisId) {
            const a = this.#analyses.get(analysisId);
            return a ? this.#deepClone(a) : null;
        }

        listAnalyses(predicate) {
            const list = Array.from(this.#analyses.values()).map(a => this.#deepClone(a));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        // =====================================================================
        // ─── REQUIREMENTS BOOK ────────────────────────────────────────────────
        // Same "omit what's empty, never fabricate a placeholder" discipline
        // as the Build Package / Enterprise Audit renderers elsewhere.
        // =====================================================================

        generateRequirementsBook(analysisId) {
            const analysis = this.#analyses.get(analysisId);
            if (!analysis) throw new Error(`[RequirementAnalyzer] generateRequirementsBook(): no analysis "${analysisId}".`);
            this.#diagnostics.requirementsBooksGenerated++;

            const lines = ["Requirements Book", ""];
            const section = (title, content) => { if (content && content.length) { lines.push(title, ...(Array.isArray(content) ? content.map(c => `- ${c}`) : [content]), ""); } };

            section("Executive Summary", `Domain: ${analysis.domain.replace(/\.$/, "")}. Complexity: ${analysis.complexity.level} (${analysis.complexity.estimatedPhases} phase(s), heuristic estimate).`);
            section("Problem Analysis", analysis.problemStatement);
            section("Business Goals", analysis.objectives);
            section("Actors / Stakeholders", analysis.roles);
            section("Functional Requirements", analysis.functionalRequirements);
            section("Non-Functional Requirements", analysis.nonFunctionalRequirements);
            section("Business Rules / Constraints", analysis.constraints);
            section("Database Suggestions (Entities)", analysis.databaseEntities);
            section("Required Integrations", analysis.requiredIntegrations);
            section("Risk Assessment", analysis.risks);
            section("Assumptions", analysis.assumptions);
            section("Missing Information", analysis.missingInformation);
            section("Implementation Plan", `Recommended architecture: ${analysis.recommendedArchitecture}. Estimated phases: ${analysis.complexity.estimatedPhases}.`);
            section("Builder Memory Consulted", analysis.memory.available ? "Yes — prior decisions referenced." : `No — ${analysis.memory.reason}`);
            section("Similar Prior Projects (Memory Read Rule)", (analysis.priorAnalyses || []).map(p => `${p.domain} (${p.complexity || "n/a"} complexity, analyzed ${p.analyzedAt})`));

            this.#logAudit("REQUIREMENTS_BOOK_GENERATED", analysisId);
            this.emit("requirement:bookGenerated", { analysisId });
            return lines.join("\n");
        }

        // =====================================================================
        // ─── DIAGNOSTICS / COMPATIBILITY ──────────────────────────────────────
        // =====================================================================

        isVersionCompatible(version) {
            const a = /^v?(\d+)\./.exec(String(RA_VERSION));
            const b = /^v?(\d+)\./.exec(String(version || ""));
            if (!a || !b) return false;
            return a[1] === b[1];
        }

        getDiagnosticsReport() {
            return this.#deepClone({
                moduleVersion: RA_VERSION,
                ...this.#diagnostics,
                analysisCount: this.#analyses.size,
                dependencies: [
                    { name: "UnderstandingEngine", required: true, purpose: "applicationType/detectedFeatures/gaps/plan — this module never duplicates that extraction." },
                    { name: "BuilderMemory", required: false, purpose: "Consulted if present — not yet built as of this version; degrades honestly when absent." }
                ],
                integrationCount: [this.#ue(), this.#memory()].filter(Boolean).length,
                auditLogCount: this.#auditLogs.length,
                timelineEventCount: this.#timelineEvents.length
            });
        }

        exportSnapshot() {
            return this.#deepClone({ version: RA_VERSION, exportedAt: new Date().toISOString(), analyses: Array.from(this.#analyses.values()) });
        }

        importSnapshot(snapshot, { mergeStrategy = "merge" } = {}) {
            if (!snapshot || typeof snapshot !== "object") throw new TypeError("[RequirementAnalyzer] importSnapshot(): snapshot must be an object.");
            if (mergeStrategy !== "merge" && mergeStrategy !== "replace") throw new TypeError('[RequirementAnalyzer] importSnapshot(): mergeStrategy must be "merge" or "replace".');
            if (mergeStrategy === "replace") this.#analyses.clear();
            let imported = 0;
            for (const a of (snapshot.analyses || [])) {
                if (a && a.id && !this.#analyses.has(a.id)) { this.#analyses.set(a.id, Object.freeze(a)); imported++; }
            }
            this.#logAudit("SNAPSHOT_IMPORTED", `${imported} analysis(es) imported (strategy: ${mergeStrategy}).`);
            return { imported };
        }

        isSnapshotCompatible(snapshot) {
            return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === RA_VERSION.split(".")[0]);
        }
    }

    if (window.CozyOS.RequirementAnalyzer && typeof window.CozyOS.RequirementAnalyzer.getVersion === "function") {
        const existingVersion = window.CozyOS.RequirementAnalyzer.getVersion();
        if (existingVersion !== RA_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: RequirementAnalyzer existing v${existingVersion} conflicts with load target v${RA_VERSION}.`);
        }
        return;
    }

    window.CozyOS.RequirementAnalyzer = new CozyOSRequirementAnalyzer();

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
    })({
        name: "RequirementAnalyzer", category: "Code Generation", icon: "requirement-analyzer.svg",
        description: "CozyBuilder's Requirement Analyzer — real keyword/pattern extraction of roles, objectives, constraints, risks, NFRs, and integrations on top of UnderstandingEngine. Consults Builder Memory only if it exists; never fabricates it."
    });
})();
