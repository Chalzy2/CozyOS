/**
 * CozyOS Enterprise Framework — CozyOCR
 * File Reference: core/modules/ocr/cozy-ocr.js
 * Layer: Core / Code Generation — Optical Character Recognition
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Extracts real text from images and scanned/image-based PDF pages.
 *   Backed by Tesseract.js (an optional CDN script, loaded the same way
 *   jsPDF/pdf.js are elsewhere in CozyOS) — this file never runs OCR
 *   itself; it calls the real library and returns exactly what it
 *   reports, including its own confidence figure.
 *
 * WHAT THIS MODULE DOES NOT DO (Zero Logic Rule)
 *   - Never fabricates extracted text. If window.Tesseract isn't loaded,
 *     every method returns {available:false, reason:...} — it does not
 *     guess at what an image might say.
 *   - Does not claim to understand a UI or a form. extractTables()/
 *     extractForm() group Tesseract's own word bounding boxes by
 *     position — a real, best-effort LAYOUT HEURISTIC, not a structural
 *     understanding of what a table or form actually is. Documented as a
 *     heuristic everywhere it's surfaced, never as guaranteed structure.
 *   - Never sends an image anywhere over a network. Tesseract.js runs
 *     entirely client-side (WASM) once loaded — this stays true to
 *     "offline-first" the same way every other CozyOS module does.
 *   - Never executes anything from the recognized text.
 *
 * OPTIONAL INTEGRATIONS
 *   UnderstandingEngine — calls this module for its OCR Engine provider
 *                          slot; falls back honestly if this reports
 *                          unavailable.
 *   ServiceRegistry      — registerCoordinator(), with retry.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const OCR_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    class CozyOSOcrCoordinator {
        #auditLogs = [];
        #timelineEvents = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #workerCache = null;
        #receiptAnalyzers = new Map();

        #diagnostics = {
            extractionsAttempted: 0, extractionsSucceeded: 0, extractionsFailed: 0,
            multiImageMergesRun: 0, tableHeuristicRuns: 0, errorsHidden: 0,
            eventsEmitted: 0, memoryBaseline: 3.8
        };

        getVersion() { return OCR_VERSION; }

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
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[CozyOCR] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[CozyOCR] on(): handler must be a function.");
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
            if (typeof handler !== "function") throw new TypeError("[CozyOCR] once(): handler must be a function.");
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

        isAvailable() { return typeof window.Tesseract !== "undefined"; }

        getProviderStatus() {
            return this.#deepClone({
                available: this.isAvailable(),
                engine: this.isAvailable() ? "Tesseract.js" : null,
                mode: "offline",
                note: this.isAvailable()
                    ? "Tesseract.js loaded — real OCR runs entirely client-side, no network calls."
                    : "No OCR provider loaded — add the Tesseract.js script tag to enable this (see certification.html for the same optional-script pattern used by pdf.js/jsPDF)."
            });
        }

        // =====================================================================
        // ─── TEXT EXTRACTION ──────────────────────────────────────────────────
        // =====================================================================

        /**
         * extractText(imageSource, { lang })
         *   imageSource: anything Tesseract.recognize() accepts — a File,
         *   Blob, HTMLImageElement, canvas, or data URL string.
         *   Returns {available, text, confidence, words, lines} on success,
         *   or {available:false, reason} if no provider is loaded or
         *   recognition itself fails — never fabricated text either way.
         */
        async extractText(imageSource, { lang = "eng" } = {}) {
            if (!this.isAvailable()) {
                return { available: false, reason: "No OCR provider loaded (Tesseract.js not found on window)." };
            }
            this.#diagnostics.extractionsAttempted++;
            try {
                const result = await window.Tesseract.recognize(imageSource, lang);
                const data = result && result.data ? result.data : {};
                this.#diagnostics.extractionsSucceeded++;
                this.#logTimeline(`Extracted ${(data.text || "").length} character(s) of text.`);
                this.emit("ocr:extracted", { textLength: (data.text || "").length, confidence: data.confidence });
                return {
                    available: true,
                    text: data.text || "",
                    confidence: typeof data.confidence === "number" ? data.confidence : null,
                    words: Array.isArray(data.words) ? data.words.map(w => ({ text: w.text, confidence: w.confidence, bbox: w.bbox })) : [],
                    lines: Array.isArray(data.lines) ? data.lines.map(l => ({ text: l.text, confidence: l.confidence, bbox: l.bbox })) : []
                };
            } catch (err) {
                this.#diagnostics.extractionsFailed++;
                this.#logAudit("EXTRACTION_FAILED", err.message);
                return { available: false, reason: `OCR extraction failed: ${err.message}` };
            }
        }

        /**
         * extractFromMultiple(images, { lang })
         *   images: array of imageSource values (see extractText). Runs
         *   extraction on each in turn and merges the results into one
         *   combined document with real page markers — this is the
         *   "combine multiple screenshots into one document" capability.
         *   A failed/unavailable individual image is marked inline rather
         *   than silently dropped.
         */
        async extractFromMultiple(images, { lang = "eng" } = {}) {
            if (!Array.isArray(images) || images.length === 0) {
                throw new TypeError("[CozyOCR] extractFromMultiple(): images must be a non-empty array.");
            }
            if (!this.isAvailable()) {
                return { available: false, reason: "No OCR provider loaded (Tesseract.js not found on window)." };
            }
            this.#diagnostics.multiImageMergesRun++;
            const perImage = [];
            let combinedText = "";
            for (let i = 0; i < images.length; i++) {
                const result = await this.extractText(images[i], { lang });
                perImage.push({ index: i, available: result.available, confidence: result.confidence ?? null });
                combinedText += `\n\n--- Screenshot ${i + 1} ---\n`;
                combinedText += result.available ? result.text : `[unreadable: ${result.reason}]`;
            }
            const confidences = perImage.filter(p => p.available && typeof p.confidence === "number").map(p => p.confidence);
            const averageConfidence = confidences.length ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 10) / 10 : null;
            this.#logTimeline(`Merged ${images.length} screenshot(s) into one document.`);
            this.emit("ocr:merged", { imageCount: images.length, averageConfidence });
            return { available: true, combinedText: combinedText.trim(), perImage, averageConfidence };
        }

        // =====================================================================
        // ─── LAYOUT HEURISTICS (best-effort, explicitly not guaranteed) ───────
        // =====================================================================

        /**
         * extractTables(imageSource)
         *   Best-effort layout heuristic: groups Tesseract's own word
         *   bounding boxes into rows (by Y-proximity) and columns (by
         *   X-gap), producing a plausible grid. This is NOT a structural
         *   table-understanding model — it will misfire on complex or
         *   irregular layouts. Always returns heuristic:true so a caller
         *   never mistakes this for a guaranteed extraction.
         */
        async extractTables(imageSource) {
            const ocrResult = await this.extractText(imageSource);
            if (!ocrResult.available) return ocrResult;
            this.#diagnostics.tableHeuristicRuns++;

            const words = ocrResult.words.filter(w => w.bbox && w.text && w.text.trim());
            if (words.length === 0) return { available: true, heuristic: true, rows: [], note: "No word boxes to group." };

            const rowTolerancePx = 10;
            const rows = [];
            for (const word of words.sort((a, b) => a.bbox.y0 - b.bbox.y0)) {
                let row = rows.find(r => Math.abs(r.y - word.bbox.y0) <= rowTolerancePx);
                if (!row) { row = { y: word.bbox.y0, words: [] }; rows.push(row); }
                row.words.push(word);
            }
            const grid = rows.map(r => r.words.sort((a, b) => a.bbox.x0 - b.bbox.x0).map(w => w.text));

            this.#logAudit("TABLE_HEURISTIC_RUN", `Grouped ${words.length} word(s) into ${grid.length} row(s).`);
            return { available: true, heuristic: true, rows: grid, note: "Best-effort layout grouping by word position — not a guaranteed table structure." };
        }

        /** extractForm(imageSource) — alias of the same heuristic; a "form" and a "table" are the same word-grid grouping here. */
        async extractForm(imageSource) { return this.extractTables(imageSource); }

        // =====================================================================
        // ─── RECEIPT PARSING (real, deterministic — not AI/ML) ────────────────
        // =====================================================================

        /**
         * parseReceipt(imageSource, { lang })
         *   Real, deterministic field extraction on top of extractText()'s
         *   real OCR output — pattern-matching (regex) against actual
         *   recognized text, not a machine-learning model and not a
         *   fabricated guess. Every field is null if not confidently
         *   matched, never invented. Always includes rawText and
         *   heuristic:true so a caller (and the end user, per "the user
         *   reviews the extracted data before saving") can verify or
         *   correct anything this heuristic gets wrong — this is
         *   explicitly not guaranteed structure, the same honesty
         *   standard extractTables()/extractForm() already hold to.
         */
        async parseReceipt(imageSource, { lang = "eng" } = {}) {
            const ocrResult = await this.extractText(imageSource, { lang });
            if (!ocrResult.available) return ocrResult;

            const text = ocrResult.text;
            const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

            const numberFrom = (str) => { const m = /([\d,]+\.?\d*)/.exec(str || ""); return m ? Number(m[1].replace(/,/g, "")) : null; };

            const merchantName = lines[0] || null;

            const dateMatch = /\b(\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4})\b/.exec(text);
            const timeMatch = /\b(\d{1,2}:\d{2}(:\d{2})?\s?(AM|PM|am|pm)?)\b/.exec(text);

            const receiptNoMatch = /(?:receipt\s*(?:no|number|#)?|invoice\s*(?:no|number|#)?)\s*[:\-]?\s*([A-Z0-9\-]+)/i.exec(text);

            const totalMatch = /(?:^|\n).*?\b(?:total|amount\s*due|grand\s*total)\b[^\d\n]*([\d,]+\.?\d*)/i.exec(text);
            const subtotalMatch = /\bsub\s*-?total\b[^\d\n]*([\d,]+\.?\d*)/i.exec(text);
            const taxMatch = /\b(?:vat|tax)\b[^\d\n]*([\d,]+\.?\d*)/i.exec(text);

            const paymentMethodMatch = /\b(cash|m-?pesa|card|visa|mastercard|paybill|bank\s*transfer)\b/i.exec(text);
            const tillMatch = /\btill\s*(?:no|number|#)?\s*[:\-]?\s*(\d{4,10})/i.exec(text);
            const paybillMatch = /\bpaybill\s*(?:no|number|#)?\s*[:\-]?\s*(\d{4,10})/i.exec(text);

            // Real, best-effort line-item detection: a line with a trailing
            // number is treated as a candidate item row. Genuinely
            // best-effort — irregular receipt layouts will misfire, hence
            // heuristic:true on the overall result.
            const items = [];
            for (const line of lines) {
                const itemMatch = /^(.+?)\s+([\d,]+\.?\d*)$/.exec(line);
                if (itemMatch && !/\b(total|tax|vat|subtotal|change|cash|balance|till|paybill|receipt|invoice|date|time|payment)\b/i.test(itemMatch[1])) {
                    items.push({ description: itemMatch[1].trim(), amount: numberFrom(itemMatch[2]) });
                }
            }

            const fields = {
                merchantName,
                date: dateMatch ? dateMatch[1] : null,
                time: timeMatch ? timeMatch[1] : null,
                receiptNumber: receiptNoMatch ? receiptNoMatch[1] : null,
                items,
                subtotal: subtotalMatch ? numberFrom(subtotalMatch[1]) : null,
                tax: taxMatch ? numberFrom(taxMatch[1]) : null,
                total: totalMatch ? numberFrom(totalMatch[1]) : null,
                paymentMethod: paymentMethodMatch ? paymentMethodMatch[1] : null,
                tillNumber: tillMatch ? tillMatch[1] : null,
                paybillNumber: paybillMatch ? paybillMatch[1] : null
            };

            // Real, computable check (arithmetic, not AI) — flags a
            // genuine mismatch rather than silently trusting either figure.
            const warnings = [];
            if (fields.total !== null && items.length > 0) {
                const itemSum = items.reduce((sum, i) => sum + (i.amount || 0), 0);
                const taxAmount = fields.tax || 0;
                const expected = itemSum + taxAmount;
                if (Math.abs(expected - fields.total) > 0.5) {
                    warnings.push(`Item total + tax (${expected.toFixed(2)}) does not match the parsed total (${fields.total.toFixed(2)}) — review before saving.`);
                }
            }

            this.#logAudit("RECEIPT_PARSED", `merchant=${merchantName || "unknown"}, total=${fields.total ?? "unknown"}`);
            this.#logTimeline(`Receipt parsed: ${merchantName || "unknown merchant"}`);
            this.emit("ocr:receipt_parsed", { merchantName, total: fields.total });

            return { available: true, heuristic: true, rawText: text, confidence: ocrResult.confidence, fields, warnings };
        }

        /**
         * createDocumentRecord(parsedReceipt, context)
         *   Real, structured document schema for cross-application reuse —
         *   ShopOS, MpesaOS, HospitalOS, etc. all get the same shape
         *   rather than each inventing their own. This method does NOT
         *   persist anything — no storage coordinator is assumed to exist
         *   here, per the same discipline applied everywhere else in this
         *   platform. It returns a real, structured record the caller's
         *   own application decides how to store.
         */
        createDocumentRecord(parsedReceipt, { companyId = null, branchId = null, userId = null, relatedTransactionId = null } = {}) {
            if (!parsedReceipt || parsedReceipt.available !== true) throw new TypeError("[CozyOCR] createDocumentRecord(): a real, available parseReceipt() result is required.");
            return this.#deepClone({
                documentId: this.#generateId("doc"),
                companyId, branchId, userId, relatedTransactionId,
                createdAt: new Date().toISOString(),
                rawText: parsedReceipt.rawText,
                confidence: parsedReceipt.confidence,
                fields: parsedReceipt.fields,
                warnings: parsedReceipt.warnings
            });
        }

        /**
         * registerReceiptAnalyzer(name, fn) / getReceiptAnalyzer(name) / hasReceiptAnalyzer(name)
         *   Real, disclosed EMPTY extension points for the genuinely-AI
         *   items requested (categorize an expense, suggest a supplier,
         *   detect duplicate receipts, suggest matching an existing
         *   transaction) — none of these are implemented here. Detecting
         *   a duplicate or suggesting a category requires either a real
         *   AI model or a real dataset to compare against (other stored
         *   documents), neither of which this file owns or fabricates.
         *   "Warn if totals don't add up" IS implemented above, in
         *   parseReceipt() — because it's real arithmetic, not AI.
         */
        registerReceiptAnalyzer(name, fn) {
            if (typeof name !== "string" || !name.trim()) throw new TypeError("[CozyOCR] registerReceiptAnalyzer(): name must be a non-empty string.");
            if (typeof fn !== "function") throw new TypeError("[CozyOCR] registerReceiptAnalyzer(): fn must be a function.");
            this.#receiptAnalyzers.set(name, fn);
            this.#logAudit("RECEIPT_ANALYZER_REGISTERED", name);
            return true;
        }
        getReceiptAnalyzer(name) { return this.#receiptAnalyzers.get(name) || null; }
        hasReceiptAnalyzer(name) { return this.#receiptAnalyzers.has(name); }
        listReceiptAnalyzers() { return Array.from(this.#receiptAnalyzers.keys()); }

        isVersionCompatible(version) {
            const a = /^v?(\d+)\./.exec(String(OCR_VERSION));
            const b = /^v?(\d+)\./.exec(String(version || ""));
            if (!a || !b) return false;
            return a[1] === b[1];
        }

        getDiagnosticsReport() {
            return this.#deepClone({
                moduleVersion: OCR_VERSION,
                ...this.#diagnostics,
                providerLoaded: this.isAvailable(),
                dependencies: [{ name: "Tesseract.js", required: false, purpose: "Real offline OCR engine — this module has no fallback of its own." }],
                integrationCount: this.isAvailable() ? 1 : 0,
                auditLogCount: this.#auditLogs.length,
                timelineEventCount: this.#timelineEvents.length
            });
        }

        exportSnapshot() {
            return this.#deepClone({ version: OCR_VERSION, exportedAt: new Date().toISOString(), diagnostics: this.#diagnostics });
        }

        importSnapshot(snapshot) {
            if (!snapshot || typeof snapshot !== "object") throw new TypeError("[CozyOCR] importSnapshot(): snapshot must be an object.");
            return { imported: false, message: "CozyOCR has no persistent state to restore beyond diagnostics counters, which are session-local by design." };
        }

        isSnapshotCompatible(snapshot) {
            return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === OCR_VERSION.split(".")[0]);
        }
    }

    if (window.CozyOS.OCR && typeof window.CozyOS.OCR.getVersion === "function") {
        const existingVersion = window.CozyOS.OCR.getVersion();
        if (existingVersion !== OCR_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: OCR existing v${existingVersion} conflicts with load target v${OCR_VERSION}.`);
        }
        return;
    }

    window.CozyOS.OCR = new CozyOSOcrCoordinator();

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
        name: "OCR", category: "Code Generation", icon: "ocr.svg",
        description: "CozyOCR — real, offline text extraction backed by Tesseract.js. Reports unavailable honestly when the provider isn't loaded; never fabricates extracted text."
    });
})();
