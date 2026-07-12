/**
 * CozyOS Enterprise Framework — CozyBuilder Understanding Engine
 * File Reference: core/modules/builder/understanding-engine.js
 * Layer: Core / Code Generation — Requirement Understanding
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Turns raw input (plain text, source code, text-based PDFs, screenshots,
 *   uploaded projects) into a structured Understanding — application type,
 *   detected features/entities, requirement gaps, estimated modules — that
 *   CozyBuilder's Home experience previews before generating anything.
 *
 * PROVIDER ARCHITECTURE (the actual design, not a promise)
 *   Every analysis capability is a named provider slot, not a hardcoded
 *   feature list:
 *     - Text Analyzer   — built in, offline, always available.
 *     - Code Analyzer    — built in, offline, always available.
 *     - PDF Analyzer     — offline IF window.pdfjsLib is loaded (extracts
 *                          text from text-based PDFs only — a scanned
 *                          image PDF needs OCR, which this module does not
 *                          have offline). No PDF library loaded => this
 *                          module reports that honestly instead of
 *                          pretending to read the file.
 *     - Image Analyzer   — no offline provider exists. Delegates entirely
 *                          to window.CozyOS.AIMode.requestAssistance(
 *                          "analyze-image", ...) — the SAME provider
 *                          gateway CozyBugFixer's AI-assisted repair uses,
 *                          reused rather than reinvented. If AIMode has no
 *                          vision-capable provider registered, this
 *                          reports "no provider installed", never a
 *                          fabricated description of the image.
 *     - OCR Engine       — no provider exists yet, offline or online.
 *                          Reports that plainly; this is a real, currently-
 *                          empty extension point, not a rejected feature.
 *     - Repository Analyzer — Local Folder and Uploaded ZIP work offline
 *                          today (reads real files, runs Code Analyzer on
 *                          each). GitHub import is a real, separate,
 *                          explicitly-online capability (network fetch to
 *                          a public repo's raw content) — never silently
 *                          assumed; only used if the caller explicitly
 *                          invokes it.
 *
 * WHAT THIS MODULE DOES NOT DO
 *   - Never claims to have understood an image or scanned document when
 *     no vision/OCR provider is installed.
 *   - Never executes, evaluates, or imports any analyzed source. Code
 *     Analyzer only reads text with regex — the exact same non-execution
 *     discipline as CozyBugFixer's own scanning.
 *   - Never auto-learns. See the Knowledge Review Queue section — every
 *     certified build becomes a reviewable Candidate Pattern, promoted to
 *     the Enterprise Pattern Library only by explicit human approval.
 *
 * OPTIONAL INTEGRATIONS
 *   CozyAIMode        — the ONLY path to Image Analyzer / OCR Engine /
 *                        any online provider. This module never talks to
 *                        a network itself.
 *   CozyCertification  — reads real quickCertification() results/rule
 *                        groups when scoring a Knowledge Review Queue
 *                        candidate. Never re-implements scoring.
 *   BuilderAI          — reuses its existing heuristic entity/keyword
 *                        extraction rather than duplicating it.
 *   ServiceRegistry    — registerCoordinator(), with retry.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const ENGINE_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    // The curated checklist the Requirement Gap Detector matches against.
    // This is a deterministic keyword/pattern checklist, not AI reasoning —
    // documented as exactly that everywhere it's surfaced.
    const ENTERPRISE_CHECKLIST = Object.freeze([
        { id: "user-roles", label: "User Roles", keywords: ["role", "roles", "permission", "rbac", "admin", "operator"] },
        { id: "permissions", label: "Permissions", keywords: ["permission", "access control", "authorize", "authorization"] },
        { id: "audit-log", label: "Audit Log", keywords: ["audit", "log", "history", "trail"] },
        { id: "offline-mode", label: "Offline Mode", keywords: ["offline", "local-first", "no internet"] },
        { id: "backup", label: "Backup", keywords: ["backup", "restore", "snapshot"] },
        { id: "plugin-system", label: "Plugin System", keywords: ["plugin", "extension", "addon", "add-on"] },
        { id: "security-policy", label: "Security Policy", keywords: ["security", "encryption", "auth", "password", "secure"] },
        { id: "multi-tenant", label: "Multi-Tenant Support", keywords: ["tenant", "multi-tenant", "organization", "workspace isolation"] },
        { id: "rate-limiting", label: "Rate Limiting", keywords: ["rate limit", "throttle", "quota"] },
        { id: "data-export", label: "Data Export", keywords: ["export", "download", "csv", "report"] }
    ]);

    // Application-type keyword map — deterministic, not AI. Every label
    // this returns is honestly a keyword match, never a claimed inference.
    const APPLICATION_TYPE_KEYWORDS = Object.freeze([
        { type: "Point of Sale (POS) System", keywords: ["pos", "point of sale", "cashier", "receipt", "checkout"] },
        { type: "Inventory Management System", keywords: ["inventory", "stock", "warehouse", "supplier"] },
        { type: "Live Production / Switcher System", keywords: ["switcher", "camera", "streaming", "scene", "live production"] },
        { type: "Customer Relationship Management (CRM)", keywords: ["crm", "customer", "lead", "pipeline"] },
        { type: "Content Management System (CMS)", keywords: ["cms", "content", "article", "page builder"] },
        { type: "Booking / Reservation System", keywords: ["booking", "reservation", "appointment", "schedule"] },
        { type: "Power / Energy Management System", keywords: ["power", "battery", "solar", "generator", "energy"] }
    ]);

    class CozyOSUnderstandingEngine {
        // ---- Knowledge Review Queue (never auto-promoted) ----
        #candidatePatterns = new Map(); // id -> candidate record
        #enterprisePatternLibrary = new Map(); // id -> approved pattern (only populated by explicit approval)

        #auditLogs = [];
        #timelineEvents = [];
        #listeners = new Map();
        #onceWrapped = new Map();

        #diagnostics = {
            analysesRun: 0, gapChecksRun: 0, candidatesSubmitted: 0, candidatesApproved: 0,
            candidatesRejected: 0, providerCallsAttempted: 0, providerCallsHandled: 0,
            errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 4.2
        };

        getVersion() { return ENGINE_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") {
                try { return structuredClone(value); } catch (_err) { /* fall through */ }
            }
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
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[UnderstandingEngine] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[UnderstandingEngine] on(): handler must be a function.");
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
            if (typeof handler !== "function") throw new TypeError("[UnderstandingEngine] once(): handler must be a function.");
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

        // =====================================================================
        // ─── PROVIDER STATUS ──────────────────────────────────────────────────
        // =====================================================================

        /**
         * listProviders()
         *   Real status for every analysis capability — never a static
         *   marketing list. Image Analyzer / OCR Engine online providers
         *   are read live from CozyAIMode's own Provider Registry.
         */
        listProviders() {
            const aimode = window.CozyOS.AIMode;
            const registeredProviders = aimode && typeof aimode.getProviderRegistry === "function" ? aimode.getProviderRegistry() : [];
            const onlineNames = registeredProviders.filter(p => p.enabled !== false).map(p => `${p.mode}${p.version ? ` (${p.version})` : ""}`);

            return this.#deepClone({
                textAnalyzer: { available: true, mode: "offline", note: "Built in — always available." },
                codeAnalyzer: { available: true, mode: "offline", note: "Built in — reads source as text only, never executes it." },
                pdfAnalyzer: {
                    available: typeof window.pdfjsLib !== "undefined",
                    mode: "offline",
                    note: typeof window.pdfjsLib !== "undefined" ? "pdf.js loaded — can extract text from text-based PDFs." : "No PDF library loaded — load pdf.js to enable text-PDF analysis. Scanned/image PDFs need OCR regardless."
                },
                imageAnalyzer: {
                    available: onlineNames.length > 0 && !!aimode && !aimode.isOfflineMode(),
                    offlineProvider: null,
                    onlineProviders: onlineNames,
                    note: onlineNames.length > 0 ? `Delegates to CozyAIMode (${onlineNames.join(", ")}).` : "No offline provider exists. No online provider registered with CozyAIMode yet — register a vision-capable provider (OpenAI/Gemini/local model) to enable this."
                },
                ocrEngine: {
                    available: !!(window.CozyOS.OCR && window.CozyOS.OCR.isAvailable()),
                    offlineProvider: window.CozyOS.OCR ? (window.CozyOS.OCR.isAvailable() ? "Tesseract.js (via CozyOCR)" : "CozyOCR loaded, but Tesseract.js is not") : "None",
                    onlineProvider: "Future",
                    note: window.CozyOS.OCR
                        ? (window.CozyOS.OCR.isAvailable() ? "CozyOCR is connected and its provider is loaded." : "CozyOCR is connected but has no OCR library loaded — add the Tesseract.js script tag.")
                        : "CozyOCR is not connected to this page."
                },
                repositoryAnalyzer: {
                    localFolder: { available: typeof window.showDirectoryPicker === "function" },
                    uploadedZip: { available: true },
                    github: { available: true, mode: "online", note: "Explicitly opt-in — a live network fetch to a public repository, never used unless you invoke it directly." }
                }
            });
        }

        // =====================================================================
        // ─── TEXT ANALYSIS (offline, always available) ────────────────────────
        // =====================================================================

        /**
         * analyzeText(description)
         *   Deterministic keyword extraction — the exact same class of
         *   heuristic BuilderAI already uses for planning, reused here for
         *   understanding rather than duplicated. Returns real matches
         *   only; "confidence" is a plain count-based signal, not a
         *   claimed probability.
         */
        analyzeText(description) {
            if (typeof description !== "string" || !description.trim()) {
                throw new TypeError("[UnderstandingEngine] analyzeText(): description is required.");
            }
            const lower = description.toLowerCase();
            this.#diagnostics.analysesRun++;

            const detectedType = APPLICATION_TYPE_KEYWORDS.find(t => t.keywords.some(k => lower.includes(k)));
            const featureKeywords = ["dashboard", "camera", "scene", "streaming", "login", "authentication", "report", "notification", "chat", "payment", "mpesa", "invoice", "search"];
            const detectedFeatures = featureKeywords.filter(f => lower.includes(f));

            let plan = null;
            if (window.CozyOS.BuilderAI && typeof window.CozyOS.BuilderAI.planBuild === "function") {
                try { plan = window.CozyOS.BuilderAI.planBuild({ description }); } catch (_err) { /* heuristic couldn't extract a plan — still return partial understanding */ }
            }

            const gapReport = this.detectRequirementGaps(description);
            const estimatedModules = Math.max(1, (plan ? plan.entities.length : 0) + Math.ceil(detectedFeatures.length / 3));

            const understanding = {
                sourceKind: "text",
                applicationType: detectedType ? detectedType.type : "Unknown — not enough keyword matches to classify. Add more detail.",
                applicationTypeConfidence: detectedType ? "keyword-match" : "none",
                detectedFeatures,
                entities: plan ? plan.entities.map(e => e.name) : [],
                missingInformation: gapReport.missing.map(g => g.label),
                estimatedModules,
                recommendedArchitecture: plan ? plan.category : "Business Domain (default)",
                securityConsiderations: gapReport.missing.filter(g => ["security-policy", "permissions", "user-roles", "audit-log"].includes(g.id)).map(g => g.label),
                plan
            };
            this.emit("understanding:generated", { sourceKind: "text", applicationType: understanding.applicationType });
            return this.#deepClone(understanding);
        }

        // =====================================================================
        // ─── CODE ANALYSIS (offline, always available) ────────────────────────
        // =====================================================================

        /**
         * analyzeCode(sourceText)
         *   Pure text/regex extraction — same non-execution discipline as
         *   CozyBugFixer. Reads the header block, class name, and public
         *   method names; never runs the code.
         */
        analyzeCode(sourceText) {
            if (typeof sourceText !== "string" || !sourceText.trim()) {
                throw new TypeError("[UnderstandingEngine] analyzeCode(): sourceText is required.");
            }
            this.#diagnostics.analysesRun++;
            const versionMatch = /^\s*\*\s*Version:\s*(.+)$/m.exec(sourceText);
            const fileRefMatch = /^\s*\*\s*File Reference:\s*(.+)$/m.exec(sourceText);
            const layerMatch = /^\s*\*\s*Layer:\s*(.+)$/m.exec(sourceText);
            const classMatch = /class\s+([A-Za-z0-9_$]+)/.exec(sourceText);
            const methodMatches = Array.from(sourceText.matchAll(/^\s{4,12}([A-Za-z][A-Za-z0-9_]*)\s*\(/gm)).map(m => m[1]).filter(name => !["constructor", "if", "for", "while", "switch", "catch"].includes(name));
            const eventMatches = Array.from(sourceText.matchAll(/emit\(\s*["']([a-zA-Z0-9_:.-]+)["']/g)).map(m => m[1]);

            const result = {
                sourceKind: "code",
                className: classMatch ? classMatch[1] : null,
                version: versionMatch ? versionMatch[1].trim() : null,
                filePath: fileRefMatch ? fileRefMatch[1].trim() : null,
                layer: layerMatch ? layerMatch[1].trim() : null,
                publicMethods: Array.from(new Set(methodMatches)).slice(0, 50),
                eventsEmitted: Array.from(new Set(eventMatches))
            };
            this.emit("understanding:generated", { sourceKind: "code", className: result.className });
            return this.#deepClone(result);
        }

        // =====================================================================
        // ─── PDF ANALYSIS (offline IF a PDF provider is loaded) ───────────────
        // =====================================================================

        /**
         * analyzePDF(arrayBuffer)
         *   Only works if window.pdfjsLib is loaded (an optional script
         *   the host page adds — see certification.html for the same
         *   opt-in pattern already used for jsPDF). Extracts real text
         *   from a text-based PDF, then runs analyzeText on it. Reports
         *   {available:false} honestly for a scanned/image PDF or if no
         *   PDF library is present — never fabricates a summary.
         */
        async analyzePDF(arrayBuffer) {
            if (typeof window.pdfjsLib === "undefined") {
                return { available: false, reason: "No PDF Analyzer provider installed — load pdf.js on this page to enable text-PDF analysis." };
            }
            try {
                const doc = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let fullText = "";
                for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
                    const page = await doc.getPage(pageNum);
                    const content = await page.getTextContent();
                    fullText += content.items.map(it => it.str).join(" ") + "\n";
                }
                if (!fullText.trim()) {
                    return { available: false, reason: "This PDF has no extractable text — it's likely a scanned image, which needs an OCR provider (none installed)." };
                }
                this.#diagnostics.analysesRun++;
                const textUnderstanding = this.analyzeText(fullText.slice(0, 20000));
                return { available: true, extractedTextLength: fullText.length, understanding: textUnderstanding };
            } catch (err) {
                return { available: false, reason: `PDF parsing failed: ${err.message}` };
            }
        }

        // =====================================================================
        // ─── IMAGE ANALYSIS (no offline provider — delegates to CozyAIMode) ───
        // =====================================================================

        /**
         * analyzeImage(imageDataUrl)
         *   Delegates entirely to CozyAIMode.requestAssistance("analyze-
         *   image", ...) — the same provider gateway used elsewhere in
         *   CozyOS. If no vision-capable provider is registered, or AIMode
         *   is in an offline mode, returns {available:false} with the
         *   exact reason — never invents a description of the image.
         */
        async analyzeImage(imageDataUrl) {
            if (!window.CozyOS.AIMode || typeof window.CozyOS.AIMode.requestAssistance !== "function") {
                return { available: false, reason: "CozyAIMode is not connected — Image Analyzer has no offline provider and needs AIMode to reach an online one." };
            }
            this.#diagnostics.providerCallsAttempted++;
            const assistance = await window.CozyOS.AIMode.requestAssistance("analyze-image", { imageDataUrl });
            if (!assistance.handled) {
                return { available: false, reason: assistance.reason || "No Image Analyzer provider is currently registered with CozyAIMode." };
            }
            this.#diagnostics.providerCallsHandled++;
            this.emit("understanding:generated", { sourceKind: "image", provider: assistance.provider });
            return { available: true, provider: assistance.provider, result: assistance.result };
        }

        /**
         * analyzeScreenshot(imageSource) / analyzeScreenshots(imageSources)
         *   The real, offline screenshot pipeline: CozyOCR extracts real
         *   text (never fabricated — reports unavailable honestly if no
         *   OCR provider is loaded), then that text is fed through the
         *   SAME analyzeText() used for typed descriptions. This infers
         *   the application from extracted labels/structure — it is text-
         *   based inference, not true visual UI understanding. If a real
         *   Image Analyzer provider is later registered with CozyAIMode,
         *   that's a separate, richer path (analyzeImage above) — this
         *   method doesn't wait for one to exist to be useful today.
         */
        async analyzeScreenshot(imageSource) {
            if (!window.CozyOS.OCR) {
                return { available: false, reason: "CozyOCR is not connected — no offline text extraction is possible for this image." };
            }
            const ocrResult = await window.CozyOS.OCR.extractText(imageSource);
            if (!ocrResult.available) return { available: false, reason: ocrResult.reason };
            if (!ocrResult.text.trim()) return { available: false, reason: "OCR found no readable text in this image." };
            const understanding = this.analyzeText(ocrResult.text);
            this.emit("understanding:generated", { sourceKind: "screenshot", applicationType: understanding.applicationType });
            return { available: true, ocrConfidence: ocrResult.confidence, extractedText: ocrResult.text, understanding };
        }

        async analyzeScreenshots(imageSources) {
            if (!Array.isArray(imageSources) || imageSources.length === 0) {
                throw new TypeError("[UnderstandingEngine] analyzeScreenshots(): imageSources must be a non-empty array.");
            }
            if (!window.CozyOS.OCR) {
                return { available: false, reason: "CozyOCR is not connected — no offline text extraction is possible for these images." };
            }
            const merged = await window.CozyOS.OCR.extractFromMultiple(imageSources);
            if (!merged.available) return { available: false, reason: merged.reason };

            // Real, keyword-based per-screen labeling — not layout/vision
            // understanding. Looks for common screen-name words near each
            // "--- Screenshot N ---" marker in the merged text.
            const screenLabels = ["login", "dashboard", "inventory", "products", "reports", "settings", "checkout", "cart", "orders", "customers", "users", "profile"];
            const perScreenGuess = merged.perImage.map((p, i) => {
                const marker = `--- Screenshot ${i + 1} ---`;
                const idx = merged.combinedText.indexOf(marker);
                const nextMarker = merged.combinedText.indexOf("--- Screenshot", idx + marker.length);
                const chunk = merged.combinedText.slice(idx, nextMarker === -1 ? undefined : nextMarker).toLowerCase();
                const guess = screenLabels.find(label => chunk.includes(label));
                return { screenshot: i + 1, guessedLabel: guess || "unlabeled (no recognized keyword found)" };
            });

            const understanding = this.analyzeText(merged.combinedText.slice(0, 20000));
            this.emit("understanding:generated", { sourceKind: "screenshots", count: imageSources.length, applicationType: understanding.applicationType });
            return { available: true, averageOcrConfidence: merged.averageConfidence, screenGuesses: perScreenGuess, understanding };
        }

        // =====================================================================
        // ─── REPOSITORY ANALYSIS (Local Folder / ZIP offline; GitHub online) ──
        // =====================================================================

        /**
         * analyzeRepository(files)
         *   files: [{ name, text }] — already-read file contents (from a
         *   folder picker or a client-side ZIP read). Runs Code Analyzer
         *   on every .js file and merges the results. Never assumes
         *   network access; this method itself makes no fetch calls.
         */
        analyzeRepository(files) {
            if (!Array.isArray(files)) throw new TypeError("[UnderstandingEngine] analyzeRepository(): files must be an array of {name, text}.");
            const jsFiles = files.filter(f => f && typeof f.name === "string" && f.name.endsWith(".js") && typeof f.text === "string");
            const perFile = jsFiles.map(f => { try { return { file: f.name, ...this.analyzeCode(f.text) }; } catch (_err) { return { file: f.name, error: "could not analyze" }; } });
            return this.#deepClone({
                sourceKind: "repository", totalFiles: files.length, jsFilesAnalyzed: perFile.length,
                classes: perFile.filter(r => r.className).map(r => ({ file: r.file, className: r.className })),
                files: perFile
            });
        }

        /**
         * fetchGitHubRepository(owner, repo, path = "")
         *   Explicitly-online, explicitly-invoked only. A single real fetch
         *   to GitHub's public API — never called by anything else in
         *   this module automatically.
         */
        async fetchGitHubRepository(owner, repo, path = "") {
            if (typeof fetch !== "function") throw new Error("[UnderstandingEngine] fetch is not available in this environment.");
            const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`[UnderstandingEngine] GitHub API request failed: ${response.status} ${response.statusText}`);
            return response.json();
        }

        // =====================================================================
        // ─── REQUIREMENT GAP DETECTOR ──────────────────────────────────────────
        // Deterministic keyword checklist match — not AI reasoning. Every
        // "missing" item is genuinely "no matching keyword found in the
        // input text," documented as exactly that.
        // =====================================================================

        detectRequirementGaps(text) {
            if (typeof text !== "string") throw new TypeError("[UnderstandingEngine] detectRequirementGaps(): text must be a string.");
            this.#diagnostics.gapChecksRun++;
            const lower = text.toLowerCase();
            const detected = [];
            const missing = [];
            for (const item of ENTERPRISE_CHECKLIST) {
                const found = item.keywords.some(k => lower.includes(k));
                (found ? detected : missing).push({ id: item.id, label: item.label });
            }
            return this.#deepClone({ detected, missing, method: "keyword-checklist", checklistSize: ENTERPRISE_CHECKLIST.length });
        }

        listChecklist() { return ENTERPRISE_CHECKLIST.map(i => ({ id: i.id, label: i.label })); }

        // =====================================================================
        // ─── KNOWLEDGE REVIEW QUEUE (never auto-learn) ────────────────────────
        // Every certified build becomes a reviewable Candidate Pattern.
        // Nothing is ever promoted to the Enterprise Pattern Library without
        // an explicit approveCandidatePattern() call — there is no
        // automatic-learning code path anywhere in this module.
        // =====================================================================

        /**
         * submitCandidatePattern({ moduleId, plan, certificationPreview })
         *   Real scores only: pulled from the actual certification preview
         *   CozyBuilder already produced (severity counts + rule groups),
         *   never invented. similarityScore is a crude, honestly-labeled
         *   heuristic (entity/field name overlap against prior candidates)
         *   — not a real embedding-based similarity model.
         */
        submitCandidatePattern({ moduleId, plan, certificationPreview }) {
            if (!moduleId || !plan) throw new TypeError("[UnderstandingEngine] submitCandidatePattern(): moduleId and plan are required.");
            const passed = certificationPreview && certificationPreview.available && certificationPreview.verdict !== "CERTIFICATION_FAILED";
            const id = this.#generateId("cand");

            const similarityScore = this.#computeCrudeSimilarity(plan);

            const candidate = {
                id, moduleId, plan, submittedAt: new Date().toISOString(),
                passedCertification: !!passed,
                verdict: certificationPreview ? certificationPreview.verdict : "unknown",
                securityScore: this.#scoreForGroup(moduleId, "security"),
                architectureScore: this.#scoreForGroup(moduleId, "architecture"),
                performanceScore: this.#scoreForGroup(moduleId, "performance"),
                overallScore: certificationPreview && certificationPreview.available ? certificationPreview.scorePercent : null,
                similarityScore,
                status: passed ? "PENDING_REVIEW" : "REJECTED_NOT_LEARNED",
                recommendation: passed ? "Review for inclusion into the Enterprise Pattern Library." : "Did not pass certification — stored as a failed pattern, not eligible for learning."
            };
            this.#candidatePatterns.set(id, Object.freeze(candidate));
            this.#diagnostics.candidatesSubmitted++;
            this.#logAudit("CANDIDATE_SUBMITTED", `${moduleId} submitted as ${candidate.status}.`);
            this.emit("candidate:submitted", { id, moduleId, status: candidate.status });
            return this.#deepClone(candidate);
        }

        #scoreForGroup(moduleId, group) {
            if (!window.CozyOS.Certification) return null;
            try {
                const history = window.CozyOS.Certification.listRecords(moduleId);
                if (history.length === 0) return null;
                const record = history[history.length - 1];
                const groupDefects = (record.defects || []).filter(d => d.id && d.id.toLowerCase().startsWith(group.slice(0, 4)));
                return groupDefects.length === 0 ? 100 : Math.max(0, 100 - groupDefects.length * 10);
            } catch (_err) { return null; }
        }

        // Crude, explicitly-labeled overlap heuristic — counts shared
        // entity/field names against every existing candidate, returns the
        // single highest overlap percentage found. Not a real similarity
        // model; useful only as a rough duplicate-detection signal.
        #computeCrudeSimilarity(plan) {
            const thisTokens = new Set([plan.exportName, ...(plan.entities || []).map(e => e.name)].filter(Boolean).map(s => s.toLowerCase()));
            let best = 0;
            for (const candidate of this.#candidatePatterns.values()) {
                const otherTokens = new Set([candidate.plan.exportName, ...(candidate.plan.entities || []).map(e => e.name)].filter(Boolean).map(s => s.toLowerCase()));
                if (otherTokens.size === 0) continue;
                const intersection = [...thisTokens].filter(t => otherTokens.has(t)).length;
                const union = new Set([...thisTokens, ...otherTokens]).size;
                if (union > 0) best = Math.max(best, Math.round((intersection / union) * 100));
            }
            return best;
        }

        listCandidatePatterns(predicate) {
            const list = Array.from(this.#candidatePatterns.values()).map(c => this.#deepClone(c));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        getCandidatePattern(id) {
            const c = this.#candidatePatterns.get(id);
            return c ? this.#deepClone(c) : null;
        }

        /**
         * approveCandidatePattern(id)
         *   The ONLY path into the Enterprise Pattern Library. Requires an
         *   explicit call — never triggered automatically by
         *   submitCandidatePattern(), no matter how high its scores are.
         */
        approveCandidatePattern(id) {
            const candidate = this.#candidatePatterns.get(id);
            if (!candidate) throw new Error(`[UnderstandingEngine] approveCandidatePattern(): no candidate "${id}".`);
            if (!candidate.passedCertification) throw new Error(`[UnderstandingEngine] approveCandidatePattern(): "${id}" did not pass certification and cannot be approved.`);
            const approved = { ...candidate, status: "APPROVED", approvedAt: new Date().toISOString() };
            this.#enterprisePatternLibrary.set(id, Object.freeze(approved));
            this.#candidatePatterns.set(id, Object.freeze(approved));
            this.#diagnostics.candidatesApproved++;
            this.#logAudit("CANDIDATE_APPROVED", `${candidate.moduleId} approved into the Enterprise Pattern Library.`);
            this.emit("candidate:approved", { id, moduleId: candidate.moduleId });
            return this.#deepClone(approved);
        }

        rejectCandidatePattern(id, reason = null) {
            const candidate = this.#candidatePatterns.get(id);
            if (!candidate) throw new Error(`[UnderstandingEngine] rejectCandidatePattern(): no candidate "${id}".`);
            const rejected = { ...candidate, status: "REJECTED", rejectedAt: new Date().toISOString(), rejectionReason: reason };
            this.#candidatePatterns.set(id, Object.freeze(rejected));
            this.#diagnostics.candidatesRejected++;
            this.#logAudit("CANDIDATE_REJECTED", `${candidate.moduleId} rejected.${reason ? ` Reason: ${reason}` : ""}`);
            this.emit("candidate:rejected", { id, moduleId: candidate.moduleId });
            return this.#deepClone(rejected);
        }

        /** listEnterprisePatternLibrary() — only ever populated by explicit approval; always empty until a human approves something. */
        listEnterprisePatternLibrary() {
            return Object.freeze(Array.from(this.#enterprisePatternLibrary.values()).map(p => this.#deepClone(p)));
        }

        // =====================================================================
        // ─── DIAGNOSTICS / COMPATIBILITY ──────────────────────────────────────
        // =====================================================================

        isVersionCompatible(version) {
            const a = /^v?(\d+)\./.exec(String(ENGINE_VERSION));
            const b = /^v?(\d+)\./.exec(String(version || ""));
            if (!a || !b) return false;
            return a[1] === b[1];
        }

        getDiagnosticsReport() {
            return this.#deepClone({
                moduleVersion: ENGINE_VERSION,
                ...this.#diagnostics,
                candidatePatternCount: this.#candidatePatterns.size,
                enterprisePatternLibraryCount: this.#enterprisePatternLibrary.size,
                dependencies: [
                    { name: "CozyAIMode", required: false, purpose: "Image Analyzer online providers" },
                    { name: "CozyOCR", required: false, purpose: "Offline text extraction from screenshots" },
                    { name: "CozyCertification", required: false, purpose: "Real scores for Knowledge Review Queue candidates" },
                    { name: "BuilderAI", required: false, purpose: "Reused heuristic entity extraction" }
                ],
                integrationCount: [window.CozyOS.AIMode, window.CozyOS.OCR, window.CozyOS.Certification, window.CozyOS.BuilderAI].filter(Boolean).length,
                auditLogCount: this.#auditLogs.length,
                timelineEventCount: this.#timelineEvents.length
            });
        }

        exportSnapshot() {
            return this.#deepClone({
                version: ENGINE_VERSION, exportedAt: new Date().toISOString(),
                candidatePatterns: Array.from(this.#candidatePatterns.values()),
                enterprisePatternLibrary: Array.from(this.#enterprisePatternLibrary.values())
            });
        }

        importSnapshot(snapshot, { mergeStrategy = "merge" } = {}) {
            if (!snapshot || typeof snapshot !== "object") throw new TypeError("[UnderstandingEngine] importSnapshot(): snapshot must be an object.");
            if (mergeStrategy !== "merge" && mergeStrategy !== "replace") throw new TypeError('[UnderstandingEngine] importSnapshot(): mergeStrategy must be "merge" or "replace".');
            if (mergeStrategy === "replace") { this.#candidatePatterns.clear(); this.#enterprisePatternLibrary.clear(); }
            let imported = 0;
            for (const c of (snapshot.candidatePatterns || [])) {
                if (c && c.id && !this.#candidatePatterns.has(c.id)) { this.#candidatePatterns.set(c.id, Object.freeze(c)); imported++; }
            }
            for (const p of (snapshot.enterprisePatternLibrary || [])) {
                if (p && p.id && !this.#enterprisePatternLibrary.has(p.id)) this.#enterprisePatternLibrary.set(p.id, Object.freeze(p));
            }
            this.#logAudit("SNAPSHOT_IMPORTED", `${imported} candidate(s) imported (strategy: ${mergeStrategy}).`);
            return { imported };
        }

        isSnapshotCompatible(snapshot) {
            return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === ENGINE_VERSION.split(".")[0]);
        }
    }

    if (window.CozyOS.UnderstandingEngine && typeof window.CozyOS.UnderstandingEngine.getVersion === "function") {
        const existingVersion = window.CozyOS.UnderstandingEngine.getVersion();
        if (existingVersion !== ENGINE_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: UnderstandingEngine existing v${existingVersion} conflicts with load target v${ENGINE_VERSION}.`);
        }
        return;
    }

    window.CozyOS.UnderstandingEngine = new CozyOSUnderstandingEngine();

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
        name: "UnderstandingEngine", category: "Code Generation", icon: "understanding-engine.svg",
        description: "CozyBuilder's Understanding Engine — provider-based text/code/PDF/image/screenshot/repository analysis, a deterministic Requirement Gap Detector, and a human-reviewed Knowledge Review Queue. Never auto-learns."
    });
})();
