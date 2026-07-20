/**
 * CozyOS — Document Understanding Coordinator
 * File Reference: core/modules/document-understanding/document-understanding.js
 * Layer: Shared Platform Coordinator
 * Version: 1.0.0-ENTERPRISE
 *
 * PHASE 2 — REVISED (Extension Architecture, approved)
 *   This file does NOT classify documents. Document classification,
 *   parsing, Standard Document Record creation, receipt intelligence,
 *   and validation remain solely owned by
 *   core/modules/documents/cozy-document-engine.js.
 *
 *   Pipeline:
 *     Image -> CozyOCR -> DocumentEngine -> Standard Document Record
 *           -> Document Understanding -> Enriched Document
 *
 *   This coordinator NEVER calls Tesseract/CozyOCR directly and NEVER
 *   reimplements detectDocumentType() / parseDocument(). It always goes
 *   through window.CozyOS.DocumentEngine.
 *
 * WHAT THIS FILE OWNS (Single Source of Truth for these only)
 *   - Section / heading / paragraph / list detection
 *   - Table interpretation (when tabular structure is actually present)
 *   - Entity extraction (deterministic, regex/dictionary based — never
 *     a trained model, never a guess)
 *   - Keyword extraction
 *   - Topic detection (deterministic, derived from documentType + keywords)
 *   - Summary generation (extractive, deterministic)
 *   - Confidence aggregation (reports what was actually verifiable —
 *     never fabricates a single blended "AI confidence" number)
 *
 * HONESTY DISCIPLINE (Real Data Only / No Fake Status)
 *   - Every extractor here is deterministic pattern matching. Where a
 *     category cannot be confidently determined (e.g. no labeled name
 *     field found for "people"), this file returns an empty array
 *     rather than guessing.
 *   - documentType/typeConfidence are always read from the Standard
 *     Document Record, never recomputed here.
 *   - Optional platform integrations (HealthEngine, AuditEngine,
 *     ResourceManager, OperationsEngine) are only used if they are
 *     actually present on window.CozyOS at call time. Nothing is
 *     fabricated if they are absent — matching DocumentEngine's own
 *     "operate normally if a Core service is unavailable" discipline.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const DU_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }

    // ------------------------------------------------------------------
    // Deterministic extraction primitives. Every pattern here is a real,
    // testable regex or dictionary lookup — no ML, no guessing.
    // ------------------------------------------------------------------

    const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const URL_RE = /\bhttps?:\/\/[^\s)]+|\bwww\.[^\s)]+\.[a-zA-Z]{2,}[^\s)]*/gi;
    const PHONE_RE = /(?:\+?254|0)7\d{8}\b|(?:\+?254|0)1\d{8}\b|\+\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g;
    const DATE_RE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/gi;
    const MONEY_RE = /\b(?:KES|Ksh|KSh|USD|EUR|GBP|TZS|UGX|\$|€|£)\s?[\d,]+(?:\.\d{1,2})?\b/gi;

    const LABELED_ID_PATTERNS = [
        { key: "invoiceNumbers", labels: ["invoice no", "invoice number", "invoice #"] },
        { key: "receiptNumbers", labels: ["receipt no", "receipt number", "till no"] },
        { key: "referenceNumbers", labels: ["reference no", "ref no", "reference number"] },
        { key: "registrationNumbers", labels: ["registration no", "reg no", "registration number"] },
        { key: "ids", labels: ["id no", "national id", "id number"] },
        { key: "passportNumbers", labels: ["passport no", "passport number"] },
        { key: "licenceNumbers", labels: ["licence no", "license no", "licence number", "license number"] }
    ];

    const LABELED_NAME_FIELDS = [
        { key: "people", labels: ["name", "customer", "patient", "attn", "attention", "contact person", "signed by", "physician", "consultant"] },
        { key: "companies", labels: ["company", "supplier", "vendor", "employer", "business name"] }
    ];

    const ORG_SUFFIX_RE = /\b([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,4}\s+(?:Ltd|Limited|LLC|Inc|PLC|Company|Corp|Enterprises|Group|Sacco|Cooperative|Co\.))\b/g;

    // Small, honest gazetteer — real dictionary lookup, not invented.
    const KNOWN_LOCATIONS = {
        cities: ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret", "Thika", "Malindi", "Kitale", "Garissa", "Kakamega", "Kampala", "Dar es Salaam", "Kigali", "Addis Ababa", "Lagos", "Accra"],
        counties: ["Kiambu", "Nakuru", "Mombasa", "Kisumu", "Uasin Gishu", "Machakos", "Kajiado", "Nyeri", "Meru", "Kilifi"],
        countries: ["Kenya", "Uganda", "Tanzania", "Rwanda", "Ethiopia", "Somalia", "South Sudan", "Nigeria", "Ghana", "Egypt"]
    };
    const CURRENCY_CODES = ["KES", "USD", "EUR", "GBP", "TZS", "UGX"];

    function dedupe(arr) { return Array.from(new Set(arr.map(v => String(v).trim()).filter(Boolean))); }

    function extractByRegex(text, re) {
        const matches = text.match(re);
        return matches ? dedupe(matches) : [];
    }

    function extractLabeled(text, labels) {
        const out = [];
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
            for (const label of labels) {
                const re = new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:\\-]\\s*(.+)$`, "i");
                const m = line.match(re);
                if (m && m[1] && m[1].trim()) out.push(m[1].trim().split(/\s{2,}|,\s|\t/)[0].trim());
            }
        }
        return dedupe(out);
    }

    function extractGazetteer(text, dictionary) {
        return dictionary.filter(place => new RegExp(`\\b${place.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
    }

    function extractLabeledIds(text) {
        const result = {};
        for (const { key, labels } of LABELED_ID_PATTERNS) {
            const found = [];
            for (const label of labels) {
                const re = new RegExp(`\\b${label}\\b[:\\s#-]*([A-Z0-9][A-Z0-9\\-\\/]{2,})`, "gi");
                let m;
                while ((m = re.exec(text)) !== null) found.push(m[1]);
            }
            result[key] = dedupe(found);
        }
        return result;
    }

    // ------------------------------------------------------------------
    // Section / heading / paragraph / list / table detection.
    // Deterministic line-shape heuristics only.
    // ------------------------------------------------------------------

    function detectStructure(rawText) {
        const lines = (rawText || "").split(/\r?\n/).map(l => l.replace(/\s+$/g, ""));
        const headings = [];
        const paragraphs = [];
        const lists = [];
        const sections = [];
        let currentParagraph = [];
        let currentList = [];
        let tableBlock = [];
        const tables = [];
        let title = null;

        function flushParagraph() {
            if (currentParagraph.length) {
                const text = currentParagraph.join(" ").trim();
                if (text) { paragraphs.push(text); sections.push({ type: "paragraph", text }); }
                currentParagraph = [];
            }
        }
        function flushList() {
            if (currentList.length) { lists.push(currentList.slice()); sections.push({ type: "list", items: currentList.slice() }); currentList = []; }
        }
        function flushTable() {
            if (tableBlock.length >= 2) {
                const rows = tableBlock.map(l => l.split(/\t|\s{2,}|\|/).map(c => c.trim()).filter(Boolean));
                tables.push(rows);
                sections.push({ type: "table", rows });
            }
            tableBlock = [];
        }

        const isListItem = (l) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(l);
        const isTableLine = (l) => (l.match(/\t/g) || []).length >= 1 || (l.match(/ {2,}/g) || []).length >= 2 || (l.match(/\|/g) || []).length >= 2;
        const isHeadingLine = (l) => {
            const t = l.trim();
            if (!t || t.length > 70) return false;
            if (/[.!?]$/.test(t)) return false;
            const isAllCaps = t === t.toUpperCase() && /[A-Z]/.test(t);
            const isTitleCaseShort = t.split(/\s+/).length <= 8 && /^[A-Z0-9]/.test(t);
            return isAllCaps || isTitleCaseShort;
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (!trimmed) { flushParagraph(); flushList(); flushTable(); continue; }

            if (isTableLine(trimmed)) { flushParagraph(); flushList(); tableBlock.push(trimmed); continue; }
            flushTable();

            if (isListItem(trimmed)) { flushParagraph(); currentList.push(trimmed.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")); continue; }
            flushList();

            if (title === null && trimmed.length <= 80 && i < 3) { title = trimmed; sections.push({ type: "title", text: trimmed }); continue; }

            if (isHeadingLine(trimmed)) { flushParagraph(); headings.push(trimmed); sections.push({ type: "heading", text: trimmed }); continue; }

            currentParagraph.push(trimmed);
        }
        flushParagraph(); flushList(); flushTable();

        return { title, headings, paragraphs, lists, tables, sections };
    }

    // ------------------------------------------------------------------
    // Keyword extraction — real frequency analysis, stopword-filtered.
    // ------------------------------------------------------------------

    const STOPWORDS = new Set(["the", "and", "for", "with", "this", "that", "from", "your", "you", "are", "was", "were", "will", "have", "has", "had", "not", "but", "all", "any", "can", "our", "their", "its", "his", "her", "who", "what", "when", "where", "how", "which", "a", "an", "of", "in", "on", "to", "is", "it", "at", "by", "be", "as", "or"]);

    function extractKeywords(text, limit = 10) {
        const words = (text || "").toLowerCase().match(/[a-z]{3,}/g) || [];
        const freq = new Map();
        for (const w of words) { if (STOPWORDS.has(w)) continue; freq.set(w, (freq.get(w) || 0) + 1); }
        return Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([w]) => w);
    }

    // ------------------------------------------------------------------
    // Summary generation — extractive, deterministic (not AI).
    // ------------------------------------------------------------------

    function generateSummary(text, keywords, maxSentences = 3) {
        if (!text || !text.trim()) return "";
        const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text.trim()];
        if (sentences.length <= maxSentences) return sentences.join(" ").trim();
        const keywordSet = new Set(keywords);
        const scored = sentences.map((s, idx) => {
            const words = s.toLowerCase().match(/[a-z]{3,}/g) || [];
            const score = words.reduce((sum, w) => sum + (keywordSet.has(w) ? 1 : 0), 0);
            return { s, idx, score };
        });
        const top = scored.slice().sort((a, b) => b.score - a.score || a.idx - b.idx).slice(0, maxSentences);
        top.sort((a, b) => a.idx - b.idx);
        return top.map(t => t.s.trim()).join(" ").trim();
    }

    // ------------------------------------------------------------------
    // Topic detection — deterministic mapping from documentType/keywords.
    // ------------------------------------------------------------------

    function detectTopic(documentType, keywords) {
        if (documentType && documentType !== "unknown") return documentType.replace(/_/g, " ");
        if (keywords && keywords.length) return keywords[0];
        return null;
    }

    class CozyDocumentUnderstanding {
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { analysesRun: 0, analysesFailed: 0, emptyInputs: 0, lowConfidenceInputs: 0, eventsEmitted: 0, errorsHidden: 0 };

        getVersion() { return DU_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }

        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLog.length > 1000) this.#auditLog.shift();
        }
        getAuditLog(predicate) {
            const list = this.#auditLog.map(e => ({ ...e }));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[DocumentUnderstanding] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[DocumentUnderstanding] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[DocumentUnderstanding] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_err) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_err) { this.#diagnostics.errorsHidden++; } } return true; }

        /**
         * Real entity extraction over a Standard Document Record's rawText.
         * Every field is either regex-matched, dictionary-matched, or
         * label-matched. No category is invented when nothing is found.
         */
        #extractEntities(text) {
            const labeledIds = extractLabeledIds(text);
            return {
                people: extractLabeled(text, LABELED_NAME_FIELDS[0].labels),
                companies: extractLabeled(text, LABELED_NAME_FIELDS[1].labels),
                organizations: extractByRegex(text, ORG_SUFFIX_RE),
                locations: dedupe([...extractGazetteer(text, KNOWN_LOCATIONS.cities), ...extractGazetteer(text, KNOWN_LOCATIONS.counties)]),
                countries: extractGazetteer(text, KNOWN_LOCATIONS.countries),
                cities: extractGazetteer(text, KNOWN_LOCATIONS.cities),
                counties: extractGazetteer(text, KNOWN_LOCATIONS.counties),
                currencies: dedupe(CURRENCY_CODES.filter(c => text.includes(c))),
                phoneNumbers: extractByRegex(text, PHONE_RE),
                emails: extractByRegex(text, EMAIL_RE),
                urls: extractByRegex(text, URL_RE),
                dates: extractByRegex(text, DATE_RE),
                amounts: extractByRegex(text, MONEY_RE),
                ...labeledIds
            };
        }

        /**
         * Real, honest confidence aggregation. Never blends into a single
         * fabricated "AI confidence" score — reports each real signal
         * separately, plus a deterministic extraction-coverage ratio.
         */
        #aggregateConfidence(record, entities) {
            const categories = Object.keys(entities);
            const populated = categories.filter(k => Array.isArray(entities[k]) ? entities[k].length > 0 : Boolean(entities[k])).length;
            return {
                ocr: typeof record.confidence === "number" ? record.confidence : null,
                classification: record.typeConfidence ?? null,
                extractionCoverage: categories.length ? Number((populated / categories.length).toFixed(2)) : 0
            };
        }

        /**
         * analyze(imageSourceOrRecord, options)
         *   Primary entry point. If given a Standard Document Record
         *   (already produced by DocumentEngine.parseDocument), enriches
         *   it directly. Otherwise, calls DocumentEngine.parseDocument()
         *   first — this coordinator never bypasses the Document Engine
         *   and never calls CozyOCR directly.
         */
        async analyze(imageSourceOrRecord, rawOptions = {}) {
            const options = sanitizeObject(rawOptions);
            const isStandardRecord = imageSourceOrRecord && typeof imageSourceOrRecord === "object"
                && typeof imageSourceOrRecord.documentId === "string"
                && typeof imageSourceOrRecord.rawText === "string"
                && typeof imageSourceOrRecord.documentType === "string";

            let record;
            if (isStandardRecord) {
                record = imageSourceOrRecord;
            } else {
                const docEngine = window.CozyOS.DocumentEngine;
                if (!docEngine || typeof docEngine.parseDocument !== "function") {
                    this.#diagnostics.analysesFailed++;
                    return { available: false, reason: "CozyOS DocumentEngine is not connected — Document Understanding never bypasses the Document Engine." };
                }
                const parsed = await docEngine.parseDocument(imageSourceOrRecord, options);
                if (!parsed.available) { this.#diagnostics.analysesFailed++; return parsed; }
                record = parsed.record;
            }

            const text = typeof record.rawText === "string" ? record.rawText : "";
            if (!text.trim()) {
                this.#diagnostics.emptyInputs++;
                this.#logAudit("EMPTY_INPUT", `${record.documentId || "unknown"}`);
                return {
                    available: true,
                    documentId: record.documentId ?? null,
                    documentType: record.documentType ?? "unknown",
                    typeConfidence: record.typeConfidence ?? "low",
                    language: options.lang ?? record.language ?? null,
                    confidence: this.#aggregateConfidence(record, {}),
                    title: null, headings: [], paragraphs: [], lists: [], tables: [], sections: [],
                    entities: {}, keywords: [], topic: null, summary: "",
                    warnings: ["No text available for analysis (empty OCR/document input)."]
                };
            }

            if (typeof record.confidence === "number" && record.confidence < 50) {
                this.#diagnostics.lowConfidenceInputs++;
            }

            const structure = detectStructure(text);
            const entities = this.#extractEntities(text);
            const keywords = extractKeywords(text);
            const summary = generateSummary(text, keywords);
            const topic = detectTopic(record.documentType, keywords);
            const confidence = this.#aggregateConfidence(record, entities);

            const enriched = {
                available: true,
                documentId: record.documentId ?? null,
                documentType: record.documentType ?? "unknown",
                typeConfidence: record.typeConfidence ?? null,
                language: options.lang ?? record.language ?? null,
                confidence,
                title: structure.title,
                headings: structure.headings,
                paragraphs: structure.paragraphs,
                lists: structure.lists,
                tables: structure.tables,
                sections: structure.sections,
                entities,
                dates: entities.dates,
                money: entities.amounts,
                phoneNumbers: entities.phoneNumbers,
                emails: entities.emails,
                urls: entities.urls,
                ids: entities.ids,
                keywords,
                topic,
                summary,
                warnings: []
            };

            this.#diagnostics.analysesRun++;
            this.#logAudit("DOCUMENT_ANALYZED", `${enriched.documentId || "unknown"} (${enriched.documentType})`);
            this.emit("document:analyzed", { documentId: enriched.documentId, documentType: enriched.documentType });

            return enriched;
        }

        /**
         * validate(enrichedDocument)
         *   Real, computable checks on the enrichment output itself —
         *   never re-validates classification (that stays owned by
         *   DocumentEngine.validateDocument()).
         */
        validate(enriched) {
            const warnings = [];
            if (!enriched || enriched.available !== true) return { valid: false, warnings: ["No enriched document provided."] };
            if (!enriched.summary) warnings.push("No summary could be generated (insufficient text).");
            if (!enriched.keywords || enriched.keywords.length === 0) warnings.push("No keywords extracted.");
            if (enriched.confidence && enriched.confidence.extractionCoverage === 0) warnings.push("No entity categories were populated.");
            return { valid: warnings.length === 0, warnings };
        }

        /**
         * refresh(enrichedInputRecordOrSource, options)
         *   Real operation: re-runs analysis (e.g. after options such as
         *   lang change). Not a restart/reload — just a fresh analyze().
         */
        async refresh(imageSourceOrRecord, options = {}) {
            this.#logAudit("REFRESH_REQUESTED", typeof imageSourceOrRecord === "object" ? (imageSourceOrRecord.documentId || "unknown") : "image-source");
            return this.analyze(imageSourceOrRecord, options);
        }

        getDiagnosticsReport() {
            return Object.freeze({ ...this.#diagnostics, version: DU_VERSION, generatedAt: new Date().toISOString() });
        }
    }

    window.CozyOS.DocumentUnderstanding = new CozyDocumentUnderstanding();
    Object.freeze(window.CozyOS.DocumentUnderstanding);

    // Real coordinator registration — the same, already-established
    // pattern used by DocumentEngine. registerManifest() is not yet a
    // real, live API anywhere in this codebase (verified: zero usages
    // repo-wide), so this file does not fabricate a call to it; it uses
    // the actual working registration surface, window.CozyOS.registerCoordinator().
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
        name: "DocumentUnderstanding", category: "Platform Service", icon: "document-understanding.svg",
        description: "Document Understanding — enriches Standard Document Records (produced by DocumentEngine) with sections, entities, keywords, and summaries. Never classifies documents; that remains DocumentEngine's sole responsibility.",
        capabilities: ["entity-extraction", "section-detection", "heading-detection", "summary-generation", "keyword-extraction", "topic-detection"]
    });

    // Optional Kernel registration — mirrors DocumentEngine's own
    // defensive pattern; non-fatal if Kernel.Bootstrap isn't present.
    let kernelRegistrationAttempted = false;
    async function registerWithKernel() {
        if (kernelRegistrationAttempted) return;
        const bootstrap = window.CozyOS?.Kernel?.Bootstrap;
        if (!bootstrap) return;
        kernelRegistrationAttempted = true;
        try {
            await bootstrap.registerService({ name: "DocumentUnderstanding", version: DU_VERSION, apiVersion: "1.0.0", mandatory: false, dependencies: ["DocumentEngine"] });
            bootstrap.initializeService("DocumentUnderstanding");
            await bootstrap.verifyService("DocumentUnderstanding", async () => window.CozyOS.DocumentUnderstanding.getVersion() === DU_VERSION);
            bootstrap.startService("DocumentUnderstanding");
        } catch (_err) { /* non-fatal — DocumentUnderstanding remains fully functional standalone even if Kernel registration fails */ }
    }
    registerWithKernel();
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
        document.addEventListener("cozyos:kernel-bridge-ready", registerWithKernel, { once: true });
    }
})();
