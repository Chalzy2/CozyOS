/**
 * CozyOS Enterprise Framework — CozyResearchEngine
 * File Reference: core/modules/research/cozy-research-engine.js
 * Version: 1.0.0-ENTERPRISE
 * Layer: Core / Code Generation — Research Engine
 *
 * RESPONSIBILITY
 *   Ingests documents (text, code, text-based PDFs, screenshots) into a
 *   real, queryable Knowledge Base, and tags entries with engineering
 *   principles using a deterministic keyword heuristic. Every piece of
 *   analysis is delegated to UnderstandingEngine (which itself delegates
 *   OCR to CozyOCR) — this module owns none of that logic, only the
 *   storage/search/principle-tagging layer on top of it.
 *
 * WHAT THIS MODULE ACTUALLY DOES
 *   - ingestDocument({type, content, title}): "text"/"code"/"pdf"/
 *     "screenshot" all delegate to the matching real UnderstandingEngine
 *     method (analyzeText/analyzeCode/analyzePDF/analyzeScreenshot).
 *     Nothing here re-implements text/code/PDF/OCR analysis.
 *   - extractPrinciples(entryId): tags a stored entry against a small,
 *     curated list of real engineering-principle keywords (validation,
 *     error handling, caching, idempotency, retry logic, security,
 *     performance, logging, testing) found in its extracted text —
 *     explicitly a keyword heuristic, not semantic understanding.
 *   - searchKnowledgeBase(query): real substring/keyword search over
 *     stored entries.
 *
 * WHAT THIS MODULE DOES NOT DO (Zero Logic Rule)
 *   - ingestVideo()/ingestBook() exist as real methods and always return
 *     {ingested:false, reason:...} — no video/long-document processing
 *     capability exists anywhere in CozyOS. This is a disclosed, empty
 *     extension point, never simulated.
 *   - Never executes, evaluates, or imports ingested content.
 *   - Never claims OCR/PDF/vision capability beyond what
 *     UnderstandingEngine/CozyOCR/CozyAIMode actually report as available
 *     right now — every ingest call surfaces their real {available:false}
 *     responses unchanged rather than papering over them.
 *   - Does not modify Builder, Workspace, Certification, BugFixer, or
 *     Developer Hub. Integration is via this module's own public,
 *     read-only query API (getKnowledgeBase/searchKnowledgeBase) — any of
 *     those coordinators may call it; none are required to.
 *
 * OPTIONAL INTEGRATIONS
 *   UnderstandingEngine — the only analysis path this module ever calls.
 *   ServiceRegistry      — registerCoordinator(), with retry.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const RESEARCH_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    // Real, curated keyword -> principle map. Deliberately small and
    // literal — this is a keyword heuristic, disclosed as such everywhere
    // it's surfaced, never presented as genuine semantic comprehension.
    const PRINCIPLE_KEYWORDS = Object.freeze({
        "Input Validation": ["validate", "validation", "sanitize", "sanitization"],
        "Error Handling": ["try", "catch", "error handling", "exception"],
        "Caching": ["cache", "caching", "memoize"],
        "Idempotency": ["idempotent", "idempotency"],
        "Retry Logic": ["retry", "backoff", "exponential backoff"],
        "Security": ["security", "encryption", "authentication", "authorization", "prototype pollution"],
        "Performance": ["performance", "optimization", "latency", "throughput"],
        "Logging / Observability": ["logging", "audit log", "telemetry", "diagnostics"],
        "Testing": ["unit test", "integration test", "test coverage"],
        "Documentation": ["documentation", "docstring", "readme"]
    });

    class CozyOSResearchEngine {
        #knowledgeBase = new Map();
        #projects = new Map();
        #auditLogs = [];
        #timelineEvents = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = {
            documentsIngested: 0, ingestAttemptsBlocked: 0, principleExtractionsRun: 0,
            searchesRun: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 3.4
        };

        getVersion() { return RESEARCH_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        #generateId(prefix) {
            const raw = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            return `${prefix}_${raw}`;
        }

        #escapeHtml(value) {
            const str = String(value === undefined || value === null ? "" : value);
            return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[ResearchEngine] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[ResearchEngine] on(): handler must be a function.");
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
            if (typeof handler !== "function") throw new TypeError("[ResearchEngine] once(): handler must be a function.");
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

        // =====================================================================
        // ─── INGESTION ────────────────────────────────────────────────────────
        // Every branch delegates to a real UnderstandingEngine method — this
        // class adds no text/code/PDF/OCR analysis of its own.
        // =====================================================================

        /**
         * ingestDocument({ type, content, title })
         *   type: "text" | "code" | "pdf" | "screenshot"
         *   content: string for text/code, an ArrayBuffer for pdf, an
         *   image source (data URL, File, etc.) for screenshot.
         *   Returns { ingested:true, entryId, summary } on success, or
         *   { ingested:false, reason } — always the REAL reason from the
         *   delegated engine, never invented.
         */
        async ingestDocument({ type, content, title = null, projectId = null, tags = [] } = {}) {
            const ue = this.#ue();
            if (!ue) return { ingested: false, reason: "UnderstandingEngine is not connected — no analysis path is available." };
            if (!content) return { ingested: false, reason: "content is required." };
            if (projectId && !this.#projects.has(projectId)) return { ingested: false, reason: `Unknown projectId "${projectId}" — create it first with createProject().` };

            let analysisResult;
            try {
                if (type === "text") {
                    analysisResult = { available: true, understanding: ue.analyzeText(content) };
                } else if (type === "code") {
                    analysisResult = { available: true, understanding: ue.analyzeCode(content) };
                } else if (type === "pdf") {
                    analysisResult = await ue.analyzePDF(content);
                } else if (type === "screenshot") {
                    analysisResult = await ue.analyzeScreenshot(content);
                } else {
                    return { ingested: false, reason: `Unknown ingestion type "${type}". Supported: text, code, pdf, screenshot.` };
                }
            } catch (err) {
                return { ingested: false, reason: err.message };
            }

            if (analysisResult.available === false) {
                this.#diagnostics.ingestAttemptsBlocked++;
                this.#logAudit("INGEST_BLOCKED", `${type}: ${analysisResult.reason}`);
                return { ingested: false, reason: analysisResult.reason };
            }

            const entryId = this.#generateId("doc");
            const understanding = analysisResult.understanding || analysisResult;
            const entry = Object.freeze({
                id: entryId, type, title: this.#escapeHtml(title || `${type}-document-${entryId.slice(-6)}`),
                ingestedAt: new Date().toISOString(),
                projectId, tags: Array.isArray(tags) ? tags.map(t => this.#escapeHtml(t)) : [],
                summary: understanding.applicationType || understanding.className || null,
                detectedFeatures: understanding.detectedFeatures || [],
                extractedText: (type === "text" || type === "code") ? content : (type === "screenshot" ? (analysisResult.extractedText || null) : null),
                rawUnderstanding: understanding,
                principles: [],
                revisions: []
            });
            this.#knowledgeBase.set(entryId, entry);
            if (projectId) { const p = this.#projects.get(projectId); this.#projects.set(projectId, { ...p, entryIds: [...p.entryIds, entryId] }); }
            this.#diagnostics.documentsIngested++;
            this.#logAudit("DOCUMENT_INGESTED", `${entryId}: type=${type}`);
            this.#logTimeline(`Ingested: ${entry.title}`);
            this.emit("research:ingested", { entryId, type });
            return { ingested: true, entryId, summary: entry.summary };
        }

        /**
         * ingestVideo(_source) / ingestBook(_source)
         *   Real, present methods — always honestly report unavailable.
         *   No video/long-document processing capability exists anywhere
         *   in CozyOS. This is the disclosed extension point Architectural-
         *   First requires, not a simulation.
         */
        ingestVideo(_source) {
            this.#diagnostics.ingestAttemptsBlocked++;
            return { ingested: false, reason: "No video-processing provider exists in CozyOS. This is a real, currently-empty extension point — not simulated." };
        }

        ingestBook(_source) {
            this.#diagnostics.ingestAttemptsBlocked++;
            return { ingested: false, reason: "No long-document/book-processing provider exists in CozyOS beyond text-based PDF analysis (use type:\"pdf\" for that). This is a real, currently-empty extension point — not simulated." };
        }

        // =====================================================================
        // ─── KNOWLEDGE BASE ───────────────────────────────────────────────────
        // =====================================================================

        getKnowledgeBase(predicate) {
            const list = Array.from(this.#knowledgeBase.values()).map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        getEntry(entryId) {
            const entry = this.#knowledgeBase.get(entryId);
            return entry ? this.#deepClone(entry) : null;
        }

        deleteEntry(entryId) {
            const existed = this.#knowledgeBase.delete(entryId);
            if (existed) { this.#logAudit("ENTRY_DELETED", entryId); this.emit("research:entryDeleted", { entryId }); }
            return existed;
        }

        /**
         * extractPrinciples(entryId)
         *   Deterministic keyword tagging against PRINCIPLE_KEYWORDS —
         *   explicitly a heuristic, not semantic understanding. Searches
         *   the entry's detected features, summary, and (for text entries)
         *   the ingested text itself.
         */
        extractPrinciples(entryId) {
            const entry = this.#knowledgeBase.get(entryId);
            if (!entry) throw new Error(`[ResearchEngine] extractPrinciples(): no entry "${entryId}".`);
            this.#diagnostics.principleExtractionsRun++;

            const haystack = [
                entry.summary || "", ...(entry.detectedFeatures || []),
                entry.type === "text" ? (entry.extractedText || "") : "",
                JSON.stringify(entry.rawUnderstanding || {})
            ].join(" ").toLowerCase();

            const found = Object.entries(PRINCIPLE_KEYWORDS)
                .filter(([, keywords]) => keywords.some(k => haystack.includes(k)))
                .map(([principle]) => principle);

            const updated = { ...entry, principles: found };
            this.#knowledgeBase.set(entryId, Object.freeze(updated));
            this.#logAudit("PRINCIPLES_EXTRACTED", `${entryId}: ${found.length} principle(s) found (keyword heuristic).`);
            this.emit("research:principlesExtracted", { entryId, principles: found });
            return this.#deepClone({ entryId, principles: found, method: "keyword-heuristic" });
        }

        /** searchKnowledgeBase(query) — real substring/keyword search, no fabricated relevance ranking beyond match count. */
        searchKnowledgeBase(query) {
            if (typeof query !== "string" || !query.trim()) throw new TypeError("[ResearchEngine] searchKnowledgeBase(): query is required.");
            this.#diagnostics.searchesRun++;
            const q = query.toLowerCase();
            const results = Array.from(this.#knowledgeBase.values())
                .map(entry => {
                    const haystack = [entry.title, entry.summary || "", entry.extractedText || "", ...(entry.detectedFeatures || []), ...(entry.principles || [])].join(" ").toLowerCase();
                    const matchCount = (haystack.match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
                    return { entry: this.#deepClone(entry), matchCount };
                })
                .filter(r => r.matchCount > 0)
                .sort((a, b) => b.matchCount - a.matchCount);
            return Object.freeze(results);
        }

        listAvailableIngestTypes() {
            const ue = this.#ue();
            const ocrAvailable = !!(window.CozyOS.OCR && window.CozyOS.OCR.isAvailable());
            return this.#deepClone({
                text: { available: !!ue, note: ue ? "Always available via UnderstandingEngine.analyzeText()." : "UnderstandingEngine not connected." },
                code: { available: !!ue, note: ue ? "Always available via UnderstandingEngine.analyzeCode()." : "UnderstandingEngine not connected." },
                pdf: { available: !!ue, note: ue ? "Text-based PDFs only, and only if a PDF library (pdf.js) is loaded — see UnderstandingEngine's own provider status." : "UnderstandingEngine not connected." },
                screenshot: { available: !!ue && ocrAvailable, note: ocrAvailable ? "CozyOCR provider loaded." : "No OCR provider loaded — see CozyOCR.getProviderStatus()." },
                video: { available: false, note: "No video-processing provider exists anywhere in CozyOS." },
                book: { available: false, note: "No long-document/book-processing provider exists beyond text-based PDF (use type:\"pdf\")." }
            });
        }

        // =====================================================================
        // ─── RESEARCH DATABASE: PROJECTS / SESSIONS / TAGS ─────────────────────
        // Real, in-memory grouping over the same knowledge base entries —
        // no separate storage engine invented, no duplicated indexing logic.
        // =====================================================================

        createProject(name, description = null) {
            if (typeof name !== "string" || !name.trim()) throw new TypeError("[ResearchEngine] createProject(): name is required.");
            const id = this.#generateId("proj");
            const project = Object.freeze({ id, name: this.#escapeHtml(name), description: description ? this.#escapeHtml(description) : null, createdAt: new Date().toISOString(), entryIds: [] });
            this.#projects.set(id, project);
            this.#logAudit("PROJECT_CREATED", name);
            this.emit("research:projectCreated", { id, name });
            return this.#deepClone(project);
        }

        listProjects(predicate) {
            const list = Array.from(this.#projects.values()).map(p => this.#deepClone(p));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        getProject(projectId) {
            const p = this.#projects.get(projectId);
            return p ? this.#deepClone(p) : null;
        }

        /** Every entry belonging to a project, resolved from the shared knowledge base — no duplicated storage. */
        getProjectEntries(projectId) {
            const project = this.#projects.get(projectId);
            if (!project) throw new Error(`[ResearchEngine] getProjectEntries(): no project "${projectId}".`);
            return this.getKnowledgeBase(e => project.entryIds.includes(e.id));
        }

        addTags(entryId, tags) {
            const entry = this.#knowledgeBase.get(entryId);
            if (!entry) throw new Error(`[ResearchEngine] addTags(): no entry "${entryId}".`);
            const newTags = Array.from(new Set([...entry.tags, ...tags.map(t => this.#escapeHtml(t))]));
            this.#knowledgeBase.set(entryId, Object.freeze({ ...entry, tags: newTags }));
            this.emit("research:tagged", { entryId, tags: newTags });
            return newTags;
        }

        listTags() {
            const counts = new Map();
            for (const entry of this.#knowledgeBase.values()) for (const t of entry.tags) counts.set(t, (counts.get(t) || 0) + 1);
            return this.#deepClone(Array.from(counts.entries()).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count));
        }

        // =====================================================================
        // ─── AI SUMMARIES ─────────────────────────────────────────────────────
        // Tries CozyAIMode first (same provider gateway, same trust policy as
        // every other AI path in CozyOS); falls back to a real, deterministic
        // summary built from the entry's own stored facts — never a
        // fabricated narrative claiming to be AI-authored when it isn't.
        // =====================================================================

        async generateSummary(entryId) {
            const entry = this.#knowledgeBase.get(entryId);
            if (!entry) throw new Error(`[ResearchEngine] generateSummary(): no entry "${entryId}".`);
            const aimode = window.CozyOS.AIMode;
            if (aimode && typeof aimode.requestAssistance === "function" && !aimode.isOfflineMode()) {
                const assistance = await aimode.requestAssistance("summarize-research", { entry });
                if (assistance.handled) {
                    this.#logAudit("SUMMARY_GENERATED", `${entryId} via ${assistance.provider}`);
                    return { source: assistance.provider, summary: assistance.result };
                }
            }
            const deterministic = `${entry.title} (${entry.type}): ${entry.summary || "no classified type"}. `
                + `Detected features: ${entry.detectedFeatures.join(", ") || "none"}. `
                + `Principles: ${entry.principles.join(", ") || "none extracted yet — run extractPrinciples() first"}.`;
            this.#logAudit("SUMMARY_GENERATED", `${entryId} via deterministic fallback (no AI provider)`);
            return { source: "deterministic-fallback (no AI provider connected)", summary: deterministic };
        }

        // =====================================================================
        // ─── COMPARE DOCUMENTS ────────────────────────────────────────────────
        // Real, structural diff over stored facts — not a semantic comparison.
        // =====================================================================

        compareDocuments(entryIdA, entryIdB) {
            const a = this.#knowledgeBase.get(entryIdA);
            const b = this.#knowledgeBase.get(entryIdB);
            if (!a || !b) throw new Error("[ResearchEngine] compareDocuments(): both entryIds must exist.");
            const featuresA = new Set(a.detectedFeatures), featuresB = new Set(b.detectedFeatures);
            const principlesA = new Set(a.principles), principlesB = new Set(b.principles);
            return this.#deepClone({
                entryA: { id: a.id, title: a.title }, entryB: { id: b.id, title: b.title },
                sharedFeatures: [...featuresA].filter(f => featuresB.has(f)),
                onlyInA: [...featuresA].filter(f => !featuresB.has(f)),
                onlyInB: [...featuresB].filter(f => !featuresA.has(f)),
                sharedPrinciples: [...principlesA].filter(p => principlesB.has(p)),
                sameApplicationType: a.summary === b.summary
            });
        }

        // =====================================================================
        // ─── HANDOFFS: SEND TO BUILDER / BUGFIXER / CERTIFICATION ─────────────
        // Every handoff calls the real, already-certified coordinator that
        // owns that responsibility — no duplicated logic.
        // =====================================================================

        sendToBuilder(entryId) {
            const entry = this.#knowledgeBase.get(entryId);
            if (!entry) throw new Error(`[ResearchEngine] sendToBuilder(): no entry "${entryId}".`);
            const builder = window.CozyOS.Builder;
            if (!builder) throw new Error("[ResearchEngine] CozyBuilder is not connected.");
            const description = entry.type === "text" ? entry.extractedText : (entry.summary || entry.title);
            const plan = builder.planFromDescription(description);
            this.#logAudit("SENT_TO_BUILDER", entryId);
            this.emit("research:sentToBuilder", { entryId });
            return plan;
        }

        async sendToBugFixer(entryId) {
            const entry = this.#knowledgeBase.get(entryId);
            if (!entry) throw new Error(`[ResearchEngine] sendToBugFixer(): no entry "${entryId}".`);
            if (entry.type !== "code") throw new Error(`[ResearchEngine] sendToBugFixer(): entry "${entryId}" is not code (type: ${entry.type}).`);
            const bugfixer = window.CozyOS.BugFixer;
            if (!bugfixer) throw new Error("[ResearchEngine] CozyBugFixer is not connected.");
            const bfFileId = await bugfixer.registerSourceText(`${entry.title.replace(/\s+/g, "-").toLowerCase()}.js`, entry.extractedText);
            this.#logAudit("SENT_TO_BUGFIXER", entryId);
            this.emit("research:sentToBugFixer", { entryId });
            return bfFileId;
        }

        sendToCertification(entryId, moduleId) {
            const entry = this.#knowledgeBase.get(entryId);
            if (!entry) throw new Error(`[ResearchEngine] sendToCertification(): no entry "${entryId}".`);
            if (entry.type !== "code") throw new Error(`[ResearchEngine] sendToCertification(): entry "${entryId}" is not code (type: ${entry.type}).`);
            const cert = window.CozyOS.Certification;
            if (!cert) throw new Error("[ResearchEngine] CozyCertification is not connected.");
            this.#logAudit("SENT_TO_CERTIFICATION", entryId);
            this.emit("research:sentToCertification", { entryId });
            return cert.quickCertification(entry.extractedText, { moduleId: moduleId || entryId, moduleName: moduleId || entry.title, version: "from-research" });
        }

        // =====================================================================
        // ─── DIAGNOSTICS / COMPATIBILITY ──────────────────────────────────────
        // =====================================================================

        isVersionCompatible(version) {
            const a = /^v?(\d+)\./.exec(String(RESEARCH_VERSION));
            const b = /^v?(\d+)\./.exec(String(version || ""));
            if (!a || !b) return false;
            return a[1] === b[1];
        }

        getDiagnosticsReport() {
            return this.#deepClone({
                moduleVersion: RESEARCH_VERSION,
                ...this.#diagnostics,
                knowledgeBaseSize: this.#knowledgeBase.size,
                dependencies: [{ name: "UnderstandingEngine", required: false, purpose: "The only analysis path this module ever calls (text/code/PDF/screenshot)." }],
                integrationCount: this.#ue() ? 1 : 0,
                auditLogCount: this.#auditLogs.length,
                timelineEventCount: this.#timelineEvents.length
            });
        }

        exportSnapshot() {
            return this.#deepClone({ version: RESEARCH_VERSION, exportedAt: new Date().toISOString(), knowledgeBase: Array.from(this.#knowledgeBase.values()) });
        }

        importSnapshot(snapshot, { mergeStrategy = "merge" } = {}) {
            if (!snapshot || typeof snapshot !== "object") throw new TypeError("[ResearchEngine] importSnapshot(): snapshot must be an object.");
            if (mergeStrategy !== "merge" && mergeStrategy !== "replace") throw new TypeError('[ResearchEngine] importSnapshot(): mergeStrategy must be "merge" or "replace".');
            if (mergeStrategy === "replace") this.#knowledgeBase.clear();
            let imported = 0;
            for (const entry of (snapshot.knowledgeBase || [])) {
                if (entry && entry.id && !this.#knowledgeBase.has(entry.id)) { this.#knowledgeBase.set(entry.id, Object.freeze(entry)); imported++; }
            }
            this.#logAudit("SNAPSHOT_IMPORTED", `${imported} entry(ies) imported (strategy: ${mergeStrategy}).`);
            return { imported };
        }

        isSnapshotCompatible(snapshot) {
            return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === RESEARCH_VERSION.split(".")[0]);
        }
    }

    if (window.CozyOS.ResearchEngine && typeof window.CozyOS.ResearchEngine.getVersion === "function") {
        const existingVersion = window.CozyOS.ResearchEngine.getVersion();
        if (existingVersion !== RESEARCH_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: ResearchEngine existing v${existingVersion} conflicts with load target v${RESEARCH_VERSION}.`);
        }
        return;
    }

    window.CozyOS.ResearchEngine = new CozyOSResearchEngine();

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
        name: "ResearchEngine", category: "Code Generation", icon: "research-engine.svg",
        description: "CozyBuilder's Research Engine — real document ingestion (text/code/PDF/screenshot) delegated entirely to UnderstandingEngine/CozyOCR, with keyword-based principle tagging. Video/book ingestion honestly reports unavailable."
    });
})();
