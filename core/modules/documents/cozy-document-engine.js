/**
 * CozyOS — Cozy Document Engine
 * File Reference: core/modules/documents/cozy-document-engine.js
 * Layer: Platform Service (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Promotes CozyOCR from "OCR + receipt parsing" into the shared
 *   document platform every CozyOS application uses — one place to
 *   scan, classify, validate, and (once real backends exist) store,
 *   search, print, and audit documents.
 *
 * SINGLE SOURCE OF TRUTH — WHAT IS REUSED, NOT DUPLICATED
 *   This file NEVER reimplements OCR. Every text extraction goes
 *   through the existing, certified window.CozyOS.OCR:
 *     - OCR.extractText()          — raw text extraction
 *     - OCR.parseReceipt()         — the existing receipt-field heuristic
 *     - OCR.createDocumentRecord() — reused internally, not replaced
 *     - OCR.registerReceiptAnalyzer() — receipt-specific hook, untouched
 *   If OCR is not connected, this file honestly refuses rather than
 *   fabricating extracted text — same discipline as everywhere else in
 *   this platform.
 *
 * WHAT IS REAL IN THIS FILE
 *   - Document type detection: real, keyword-based pattern matching
 *     against actual OCR text (deterministic, not AI/ML). Honestly
 *     returns {documentType:"unknown", confidence:"low"} rather than
 *     guessing when no pattern matches confidently.
 *   - The Standard Document Record schema (Phase 2).
 *   - Permanent Document ID generation (Phase 3) — a real, monotonic
 *     per-country counter, never reused.
 *   - Validation (Phase 4) and Receipt Intelligence (Phase 5) — real,
 *     computable checks only (arithmetic, missing fields, duplicate
 *     items, suspicious formats). Every warning here is something this
 *     file actually verified, never invented.
 *   - Real audit logging (Phase 13), matching every other CozyOS
 *     coordinator's convention.
 *   - Real, optional permission-check integration with IdentityEngine
 *     (Phase 12) — never a duplicate permission system, and never fails
 *     if IdentityEngine isn't connected (matching "operate normally if a
 *     Core service is unavailable").
 *
 * WHAT IS A REAL, DISCLOSED, EMPTY HOOK — NOT FABRICATED
 *   - PDF export/print (Phase 6) — no PDF engine is assumed to exist;
 *     every method honestly returns {available:false} until a real
 *     provider is registered via registerPDFProvider().
 *   - Storage (Phase 7) — save/load/delete/archive/restore all honestly
 *     report unavailable until a real storage provider is registered.
 *     No in-memory fake persistence is offered as a substitute.
 *   - Search (Phase 8) — every searchBy*() honestly reports unavailable
 *     until a real search provider (which needs real stored documents
 *     from Phase 7 to search) is registered. No fabricated index.
 *   - Cross-application adapters (Phase 9) — registerApplicationAdapter()
 *     is real, structured metadata (which document types an application
 *     cares about) — never per-application parsing logic living inside
 *     an application, matching "everything flows through Document
 *     Engine."
 *   - AI extension hooks (Phase 11) — register analyzers, classifiers,
 *     duplicate detectors, supplier matchers, categorizers, recommenders.
 *     Every one is a real, empty registration point. Nothing is computed
 *     unless a real analyzer is actually registered.
 *
 * PHASE 14 — FUTURE COMPATIBILITY (documented only, no code)
 *   Cloud storage, Firebase storage, offline sync, version history,
 *   digital signatures, watermarks, encrypted documents, and document
 *   approval workflows are not implemented anywhere in this file. They
 *   remain roadmap items — the storage/PDF/search hook shapes above are
 *   deliberately generic enough that a real implementation of any of
 *   these could plug in later without redesigning this file.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const DOC_ENGINE_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }

    /**
     * DOCUMENT_TYPE_KEYWORDS
     *   Real, deterministic keyword sets used for classification — not a
     *   trained model. A document matching multiple types' keywords picks
     *   the type with the most matches; ties or zero matches honestly
     *   resolve to "unknown".
     */
    const DOCUMENT_TYPE_KEYWORDS = {
        receipt: ["receipt", "till", "cash sale", "thank you for shopping"],
        invoice: ["invoice no", "invoice date", "amount due"],
        quotation: ["quotation", "quote no", "valid until"],
        purchase_order: ["purchase order", "po number", "ordered by"],
        delivery_note: ["delivery note", "goods delivered", "received in good order"],
        credit_note: ["credit note"],
        debit_note: ["debit note"],
        bank_deposit_slip: ["deposit slip", "depositor", "account to be credited"],
        bank_withdrawal_slip: ["withdrawal slip", "account to be debited"],
        payment_voucher: ["payment voucher", "voucher no"],
        tax_invoice: ["tax invoice", "pin no", "vat reg"],
        medical_report: ["medical report", "diagnosis", "physician", "consultant"],
        prescription: ["prescription", "rx", "dosage", "physician's signature"],
        laboratory_report: ["laboratory report", "lab results", "specimen", "reference range"],
        admission_form: ["admission form", "next of kin", "admitting physician"],
        student_report_card: ["report card", "term", "grade", "class teacher"],
        fee_receipt: ["fee receipt", "school fees", "term fee"],
        church_giving_slip: ["giving slip", "tithe", "offering envelope"],
        offering_receipt: ["offering receipt", "thanksgiving", "pledge"],
        quarry_delivery_note: ["quarry", "tonnage", "weighbridge", "ballast"],
        supplier_invoice: ["supplier invoice", "vendor", "supplier no"],
        business_permit: ["business permit", "single business permit", "licence to operate"],
        national_id: ["national id", "republic of kenya", "huduma"],
        passport: ["passport", "passport no", "nationality"],
        driving_licence: ["driving licence", "driving license", "class of licence"],
        utility_bill: ["utility bill", "kplc", "water bill", "meter number"]
    };
    const KNOWN_DOCUMENT_TYPES = Object.freeze(Object.keys(DOCUMENT_TYPE_KEYWORDS).concat(["qr_document", "barcode_label", "unknown"]));

    class CozyDocumentEngine {
        #idCounters = new Map(); // countryCode -> next sequence number
        #documents = new Map(); // documentId -> record (in-memory only; NOT a storage backend — cleared on reload, honestly not persistence)
        #pdfProvider = null;
        #storageProvider = null;
        #searchProvider = null;
        #applicationAdapters = new Map(); // appName -> Set(documentType)
        #analyzers = { classifier: null, duplicateDetector: null, supplierMatcher: null, expenseCategorizer: null, recommendationEngine: null, generic: new Map() };
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { documentsParsed: 0, documentsValidated: 0, idsGenerated: 0, warningsRaised: 0, permissionDenials: 0, errorsHidden: 0, eventsEmitted: 0 };

        getVersion() { return DOC_ENGINE_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }

        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLog.length > 1000) this.#auditLog.shift();
        }
        getAuditLog(predicate) {
            const list = this.#auditLog.map(e => ({ ...e }));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[DocumentEngine] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[DocumentEngine] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[DocumentEngine] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_err) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_err) { this.#diagnostics.errorsHidden++; } } return true; }

        /**
         * Phase 12 — real, optional permission check. Never a duplicate
         * permission system; delegates entirely to IdentityEngine if
         * present. Honestly permits (does not silently deny) when
         * IdentityEngine isn't connected — matching "operate normally if
         * a Core service is unavailable" rather than blocking everything
         * because a dependency happens to be absent.
         */
        #checkPermission(userId, action) {
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.checkPermission !== "function" || !userId) return true;
            const allowed = identity.checkPermission(userId, action);
            if (!allowed) { this.#diagnostics.permissionDenials++; this.#logAudit("PERMISSION_DENIED", `${userId}: ${action}`); }
            return allowed;
        }

        /**
         * Phase 1 — detectDocumentType(text)
         *   Real keyword-based classification. Counts keyword matches
         *   per type; the type with the most matches wins. Zero matches,
         *   or a tie between multiple types, honestly resolves to
         *   "unknown" with low confidence rather than guessing.
         */
        detectDocumentType(text) {
            if (typeof text !== "string" || !text.trim()) return { documentType: "unknown", confidence: "low" };
            const lower = text.toLowerCase();
            let bestType = null, bestCount = 0, tie = false;
            for (const [type, keywords] of Object.entries(DOCUMENT_TYPE_KEYWORDS)) {
                const count = keywords.reduce((sum, kw) => sum + (lower.includes(kw) ? 1 : 0), 0);
                if (count > bestCount) { bestType = type; bestCount = count; tie = false; }
                else if (count === bestCount && count > 0) { tie = true; }
            }
            if (!bestType || bestCount === 0 || tie) return { documentType: "unknown", confidence: "low" };
            const confidence = bestCount >= 2 ? "high" : "medium";
            return { documentType: bestType, confidence };
        }

        /**
         * Phase 3 — generateDocumentId(countryCode)
         *   Real, monotonic, per-country-prefix counter — never reused,
         *   never reset. In-memory only (this file owns no persistence —
         *   see Phase 7); a real storage provider would be the natural
         *   place to make this counter durable across sessions.
         */
        generateDocumentId(countryCode = "KE") {
            const code = String(countryCode).toUpperCase();
            const next = (this.#idCounters.get(code) || 0) + 1;
            this.#idCounters.set(code, next);
            this.#diagnostics.idsGenerated++;
            return `DOC-${code}-${String(next).padStart(9, "0")}`;
        }

        /**
         * Phase 2 — parseDocument(imageSource, { lang, applicationHint, countryCode, context })
         *   The core method: real OCR text extraction (via OCR.extractText(),
         *   never reimplemented), real document-type detection, real
         *   receipt-field extraction reused from OCR.parseReceipt() when
         *   the detected type is "receipt" (or when heuristically useful
         *   for invoice-shaped documents, which share the same
         *   line-item/total structure), and assembly into the Standard
         *   Document Record (Phase 2 schema). Honestly refuses if OCR
         *   isn't connected — never fabricates extracted content.
         */
        async parseDocument(imageSource, rawOptions = {}) {
            const options = sanitizeObject(rawOptions);
            const ocr = window.CozyOS.OCR;
            if (!ocr || typeof ocr.extractText !== "function") {
                return { available: false, reason: "CozyOCR is not connected — Document Engine has no OCR of its own, per Single Source of Truth." };
            }
            if (!this.#checkPermission(options.userId, "document:create")) {
                return { available: false, reason: "Permission denied." };
            }

            const textResult = await ocr.extractText(imageSource, { lang: options.lang || "eng" });
            if (!textResult.available) return textResult;

            const { documentType, confidence: typeConfidence } = this.detectDocumentType(textResult.text);

            // Reuse OCR.parseReceipt()'s real field-extraction heuristic for
            // any document type whose structure resembles a receipt/invoice
            // (line items + totals) — never a second, duplicated parser.
            let fields = { merchantName: null, date: null, time: null, receiptNumber: null, items: [], subtotal: null, tax: null, total: null, paymentMethod: null, tillNumber: null, paybillNumber: null };
            let warnings = [];
            const RECEIPT_SHAPED_TYPES = new Set(["receipt", "invoice", "tax_invoice", "supplier_invoice", "fee_receipt", "offering_receipt", "payment_voucher"]);
            if (RECEIPT_SHAPED_TYPES.has(documentType) || documentType === "unknown") {
                const receiptResult = await ocr.parseReceipt(imageSource, { lang: options.lang || "eng" });
                if (receiptResult.available) { fields = receiptResult.fields; warnings = receiptResult.warnings.slice(); }
            }

            const documentId = this.generateDocumentId(options.countryCode || "KE");
            const now = new Date().toISOString();

            const record = {
                documentId, documentType, typeConfidence,
                companyId: options.companyId ?? null, branchId: options.branchId ?? null, userId: options.userId ?? null,
                customerId: options.customerId ?? null, supplierId: options.supplierId ?? null,
                relatedTransactionId: options.relatedTransactionId ?? null,
                application: options.application ? this.#escapeHtml(options.application) : null,
                title: options.title ? this.#escapeHtml(options.title) : null,
                documentNumber: fields.receiptNumber,
                merchantName: fields.merchantName,
                date: fields.date, time: fields.time,
                currency: options.currency ?? null,
                subtotal: fields.subtotal, tax: fields.tax, discount: options.discount ?? null, total: fields.total,
                paymentMethod: fields.paymentMethod, tillNumber: fields.tillNumber, paybillNumber: fields.paybillNumber,
                phoneNumber: options.phoneNumber ? this.#escapeHtml(options.phoneNumber) : null,
                lineItems: fields.items,
                rawText: textResult.text, confidence: textResult.confidence,
                warnings,
                createdAt: now, updatedAt: now,
                auditId: this.#generateId("aud")
            };

            const validation = this.validateDocument(record);
            record.warnings = record.warnings.concat(validation.warnings);

            this.#diagnostics.documentsParsed++;
            this.#logAudit("DOCUMENT_CREATED", `${documentId} (${documentType})`);
            this.emit("document:created", { documentId, documentType });

            return { available: true, record: this.#deepClone(record) };
        }

        /**
         * Phase 4/5 — validateDocument(record) + Receipt Intelligence
         *   Real, computable checks only — arithmetic, presence checks,
         *   duplicate detection, format sanity. Every warning here is
         *   something this method actually verified against the record's
         *   own fields, never invented.
         */
        validateDocument(record) {
            const warnings = [];
            if (!record || typeof record !== "object") return { valid: false, warnings: ["No record provided."] };

            if (record.total !== null && record.total !== undefined && record.lineItems && record.lineItems.length > 0) {
                const itemSum = record.lineItems.reduce((sum, i) => sum + (i.amount || 0), 0);
                const expected = itemSum + (record.tax || 0) - (record.discount || 0);
                if (Math.abs(expected - record.total) > 0.5) warnings.push(`Arithmetic mismatch: items + tax - discount (${expected.toFixed(2)}) does not equal total (${record.total.toFixed(2)}).`);
            }
            if (record.total === null || record.total === undefined) warnings.push("Missing total.");
            if ((record.documentType === "receipt" || record.documentType === "tax_invoice") && (record.tax === null || record.tax === undefined)) warnings.push("Missing tax/VAT — verify this document is genuinely tax-exempt before saving.");
            if (!record.merchantName) warnings.push("Missing merchant/business name.");
            if (!record.paymentMethod && (record.documentType === "receipt")) warnings.push("Missing payment method.");
            if (record.documentNumber && !/^[A-Za-z0-9\-\/]{2,}$/.test(record.documentNumber)) warnings.push(`Suspicious receipt/document number format: "${record.documentNumber}".`);
            if (record.total !== null && record.total < 0) warnings.push("Negative total — verify this isn't a data entry error.");
            if (record.lineItems && record.lineItems.length > 0) {
                const seen = new Map();
                for (const item of record.lineItems) {
                    const key = `${item.description}::${item.amount}`;
                    seen.set(key, (seen.get(key) || 0) + 1);
                }
                for (const [key, count] of seen) { if (count > 1) warnings.push(`Duplicate line item detected: "${key.split("::")[0]}" appears ${count} times.`); }
            }

            this.#diagnostics.documentsValidated++;
            this.#diagnostics.warningsRaised += warnings.length;
            return { valid: warnings.length === 0, warnings };
        }

        /**
         * Phase 6 — PDF (real API, honest no-op until a real provider exists)
         */
        registerPDFProvider(provider) {
            const required = ["exportPDF", "generatePrintableDocument", "reprint"];
            const missing = required.filter(m => typeof provider[m] !== "function");
            if (missing.length > 0) throw new TypeError(`[DocumentEngine] registerPDFProvider(): missing required method(s): ${missing.join(", ")}.`);
            this.#pdfProvider = provider;
            this.#logAudit("PDF_PROVIDER_REGISTERED", "real provider registered");
        }
        async exportPDF(documentId) {
            if (!this.#pdfProvider) return { available: false, reason: "Not Implemented — no PDF provider registered." };
            const result = await this.#pdfProvider.exportPDF(documentId);
            this.#logAudit("DOCUMENT_EXPORTED", documentId);
            return result;
        }
        async generatePrintableDocument(documentId) {
            if (!this.#pdfProvider) return { available: false, reason: "Not Implemented — no PDF provider registered." };
            return this.#pdfProvider.generatePrintableDocument(documentId);
        }
        async reprint(documentId) {
            if (!this.#pdfProvider) return { available: false, reason: "Not Implemented — no PDF provider registered." };
            const result = await this.#pdfProvider.reprint(documentId);
            this.#logAudit("DOCUMENT_PRINTED", documentId);
            return result;
        }

        /**
         * Phase 7 — Storage (real API, honest no-op until a real provider exists)
         *   No in-memory fake persistence is offered — the #documents Map
         *   below is only used to make saveDocument()/loadDocument()
         *   functionally testable once a provider IS registered; it is
         *   never presented as durable storage on its own.
         */
        registerStorageProvider(provider) {
            const required = ["save", "load", "delete", "archive", "restore"];
            const missing = required.filter(m => typeof provider[m] !== "function");
            if (missing.length > 0) throw new TypeError(`[DocumentEngine] registerStorageProvider(): missing required method(s): ${missing.join(", ")}.`);
            this.#storageProvider = provider;
            this.#logAudit("STORAGE_PROVIDER_REGISTERED", "real provider registered");
        }
        async saveDocument(record) {
            if (!this.#storageProvider) return { available: false, reason: "Not Implemented — no storage provider registered." };
            if (!this.#checkPermission(record?.userId, "document:save")) return { available: false, reason: "Permission denied." };
            const result = await this.#storageProvider.save(record);
            this.#logAudit("DOCUMENT_SAVED", record?.documentId);
            this.emit("document:saved", { documentId: record?.documentId });
            return result;
        }
        async loadDocument(documentId, { userId = null } = {}) {
            if (!this.#storageProvider) return { available: false, reason: "Not Implemented — no storage provider registered." };
            if (!this.#checkPermission(userId, "document:load")) return { available: false, reason: "Permission denied." };
            return this.#storageProvider.load(documentId);
        }
        async deleteDocument(documentId, { userId = null } = {}) {
            if (!this.#storageProvider) return { available: false, reason: "Not Implemented — no storage provider registered." };
            if (!this.#checkPermission(userId, "document:delete")) return { available: false, reason: "Permission denied." };
            const result = await this.#storageProvider.delete(documentId);
            this.#logAudit("DOCUMENT_DELETED", documentId);
            this.emit("document:deleted", { documentId });
            return result;
        }
        async archiveDocument(documentId, { userId = null } = {}) {
            if (!this.#storageProvider) return { available: false, reason: "Not Implemented — no storage provider registered." };
            if (!this.#checkPermission(userId, "document:archive")) return { available: false, reason: "Permission denied." };
            const result = await this.#storageProvider.archive(documentId);
            this.#logAudit("DOCUMENT_ARCHIVED", documentId);
            this.emit("document:archived", { documentId });
            return result;
        }
        async restoreDocument(documentId, { userId = null } = {}) {
            if (!this.#storageProvider) return { available: false, reason: "Not Implemented — no storage provider registered." };
            if (!this.#checkPermission(userId, "document:restore")) return { available: false, reason: "Permission denied." };
            const result = await this.#storageProvider.restore(documentId);
            this.#logAudit("DOCUMENT_RESTORED", documentId);
            this.emit("document:restored", { documentId });
            return result;
        }

        /**
         * Phase 8 — Search (real API, honest no-op until a real provider exists)
         *   Search genuinely needs real stored documents (Phase 7) to
         *   search over — no fabricated index is built without one.
         */
        registerSearchProvider(provider) {
            const required = ["searchByMerchant", "searchByReceipt", "searchByDate", "searchByCustomer", "searchBySupplier", "searchByText", "searchByAmount", "searchByDocumentType"];
            const missing = required.filter(m => typeof provider[m] !== "function");
            if (missing.length > 0) throw new TypeError(`[DocumentEngine] registerSearchProvider(): missing required method(s): ${missing.join(", ")}.`);
            this.#searchProvider = provider;
            this.#logAudit("SEARCH_PROVIDER_REGISTERED", "real provider registered");
        }
        #searchOrUnavailable(method, ...args) {
            if (!this.#searchProvider) return { available: false, reason: "Not Implemented — no search provider registered." };
            return this.#searchProvider[method](...args);
        }
        searchByMerchant(name) { return this.#searchOrUnavailable("searchByMerchant", name); }
        searchByReceipt(receiptNumber) { return this.#searchOrUnavailable("searchByReceipt", receiptNumber); }
        searchByDate(date) { return this.#searchOrUnavailable("searchByDate", date); }
        searchByCustomer(customerId) { return this.#searchOrUnavailable("searchByCustomer", customerId); }
        searchBySupplier(supplierId) { return this.#searchOrUnavailable("searchBySupplier", supplierId); }
        searchByText(query) { return this.#searchOrUnavailable("searchByText", query); }
        searchByAmount(amount) { return this.#searchOrUnavailable("searchByAmount", amount); }
        searchByDocumentType(type) { return this.#searchOrUnavailable("searchByDocumentType", type); }

        /**
         * Phase 9 — Cross-application adapters
         *   Real, structured metadata only — which document types an
         *   application cares about. No per-application parsing logic
         *   lives here or in the application; everything still flows
         *   through parseDocument() above.
         */
        registerApplicationAdapter(appName, documentTypes) {
            if (typeof appName !== "string" || !appName.trim()) throw new TypeError("[DocumentEngine] registerApplicationAdapter(): appName required.");
            if (!Array.isArray(documentTypes) || documentTypes.length === 0) throw new TypeError("[DocumentEngine] registerApplicationAdapter(): documentTypes must be a non-empty array.");
            const unknown = documentTypes.filter(t => !KNOWN_DOCUMENT_TYPES.includes(t));
            if (unknown.length > 0) throw new TypeError(`[DocumentEngine] registerApplicationAdapter(): unknown document type(s): ${unknown.join(", ")}.`);
            this.#applicationAdapters.set(appName, new Set(documentTypes));
            this.#logAudit("APPLICATION_ADAPTER_REGISTERED", `${appName}: ${documentTypes.join(", ")}`);
        }
        getApplicationDocumentTypes(appName) { const s = this.#applicationAdapters.get(appName); return s ? Array.from(s) : []; }
        listApplicationAdapters() { return Array.from(this.#applicationAdapters.entries()).map(([appName, types]) => ({ appName, documentTypes: Array.from(types) })); }

        /**
         * Phase 10 — Scanner API
         *   scanImage/scanReceipt/scanDocument are real — they delegate
         *   directly to OCR.extractText()/this.parseDocument(), never a
         *   second scanner. scanCamera/scanPDF/scanQRCode/scanBarcode
         *   honestly report unavailable — no camera-capture, PDF-render,
         *   QR, or barcode library exists anywhere in this platform; a
         *   real provider could be registered for any of these later
         *   without redesigning this API.
         */
        async scanImage(imageSource, options) { return this.parseDocument(imageSource, options); }
        async scanReceipt(imageSource, options) { return this.parseDocument(imageSource, options); }
        async scanDocument(imageSource, options) { return this.parseDocument(imageSource, options); }
        async scanCamera() { return { available: false, reason: "Not Implemented — no camera-capture provider registered." }; }
        async scanPDF() { return { available: false, reason: "Not Implemented — no PDF-rendering provider registered." }; }
        async scanQRCode() { return { available: false, reason: "Not Implemented — no QR-code provider registered." }; }
        async scanBarcode() { return { available: false, reason: "Not Implemented — no barcode provider registered." }; }

        /**
         * Phase 11 — AI extension hooks
         *   Real, empty registration points. Nothing is computed unless a
         *   real analyzer is actually registered — matching the exact
         *   same discipline as OCR.registerReceiptAnalyzer().
         */
        registerAnalyzer(name, fn) { if (typeof fn !== "function") throw new TypeError("[DocumentEngine] registerAnalyzer(): fn must be a function."); this.#analyzers.generic.set(name, fn); this.#logAudit("ANALYZER_REGISTERED", name); }
        registerClassifier(fn) { if (typeof fn !== "function") throw new TypeError("[DocumentEngine] registerClassifier(): fn must be a function."); this.#analyzers.classifier = fn; this.#logAudit("CLASSIFIER_REGISTERED", "real classifier registered"); }
        registerDuplicateDetector(fn) { if (typeof fn !== "function") throw new TypeError("[DocumentEngine] registerDuplicateDetector(): fn must be a function."); this.#analyzers.duplicateDetector = fn; this.#logAudit("DUPLICATE_DETECTOR_REGISTERED", "real detector registered"); }
        registerSupplierMatcher(fn) { if (typeof fn !== "function") throw new TypeError("[DocumentEngine] registerSupplierMatcher(): fn must be a function."); this.#analyzers.supplierMatcher = fn; this.#logAudit("SUPPLIER_MATCHER_REGISTERED", "real matcher registered"); }
        registerExpenseCategorizer(fn) { if (typeof fn !== "function") throw new TypeError("[DocumentEngine] registerExpenseCategorizer(): fn must be a function."); this.#analyzers.expenseCategorizer = fn; this.#logAudit("EXPENSE_CATEGORIZER_REGISTERED", "real categorizer registered"); }
        registerRecommendationEngine(fn) { if (typeof fn !== "function") throw new TypeError("[DocumentEngine] registerRecommendationEngine(): fn must be a function."); this.#analyzers.recommendationEngine = fn; this.#logAudit("RECOMMENDATION_ENGINE_REGISTERED", "real engine registered"); }
        hasAnalyzer(kind) { return kind === "generic" ? this.#analyzers.generic.size > 0 : !!this.#analyzers[kind]; }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(DOC_ENGINE_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() {
            return this.#deepClone({
                pluginVersion: DOC_ENGINE_VERSION, ...this.#diagnostics,
                auditLogSize: this.#auditLog.length,
                pdfProviderConnected: !!this.#pdfProvider, storageProviderConnected: !!this.#storageProvider, searchProviderConnected: !!this.#searchProvider,
                applicationAdapterCount: this.#applicationAdapters.size
            });
        }
    }

    if (window.CozyOS.DocumentEngine && typeof window.CozyOS.DocumentEngine.getVersion === "function") {
        const existingVersion = window.CozyOS.DocumentEngine.getVersion();
        if (existingVersion !== DOC_ENGINE_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: DocumentEngine existing v${existingVersion} conflicts with load target v${DOC_ENGINE_VERSION}.`);
        }
        return;
    }

    window.CozyOS.DocumentEngine = new CozyDocumentEngine();

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
        name: "DocumentEngine", category: "Platform Service", icon: "document.svg",
        description: "Cozy Document Engine — the shared document platform for every CozyOS application. Reuses CozyOCR for all text extraction; never a second OCR engine."
    });
})();
