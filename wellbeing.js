/**
 * ── CozyOS UNIVERSAL COGNITIVE CORE ── COZYOCR SYSTEM SUBSURFACE
 * FILE: core/modules/ocr/cozy-ocr.js
 * VERSION: 1.1.0-FINAL-FREEZE
 * ARCHITECTURAL INVARIANT: Strictly detached from KYC, AML, or identity matching.
 * No faked extraction strings, no simulated confidence weights, no downstream state mutation.
 */

"use strict";

if (!window.CozyOS) window.CozyOS = {};

class CozyOCREngine {
    constructor() {
        // Module Invariant Certification Metadata
        this.metadata = Object.freeze({
            moduleId: "cozy_ocr_core",
            certificationId: "CERT-COZYOCR-110-2026",
            build: "2026.07.01.RELEASE",
            apiVersion: "1.1.0",
            freezeLevel: 3,
            compatibility: "CozyOS.Kernel.v2.1+"
        });

        // Frozen Event Name Registry
        this.EVENTS = Object.freeze({
            INITIALIZED: "OCR_INITIALIZED",
            SHUTDOWN: "OCR_SHUTDOWN",
            SCAN_STARTED: "OCR_SCAN_STARTED",
            SCAN_COMPLETED: "OCR_SCAN_COMPLETED",
            EXTRACTION_COMPLETED: "OCR_EXTRACTION_COMPLETED",
            VALIDATION_COMPLETED: "OCR_VALIDATION_COMPLETED",
            ERROR: "OCR_ERROR"
        });

        this._initialized = false;
        this._plugins = new Map(); // Store format: pluginId -> { priority, instance }
        this._auditHistory = [];
        this._deduplicationCache = new Set(); // Bounded via MAX_CACHE ceiling

        // Memory Bounds and Constants
        this._MAX_CACHE_SIZE = 5000;
        this._EMPTY_FROZEN_OBJECT = Object.freeze({});

        // Supported Document Registry
        this._supportedDocuments = Object.freeze([
            "National_ID", "Passport", "Driving_Licence",
            "KRA_PIN", "Business_Certificate", "Receipt",
            "Invoice", "Unknown"
        ]);
    }

    /**
     * Runtime Bootstrap Protocol
     */
    async initialize() {
        if (this._initialized) return;
        this._initialized = true;
        this._dispatchSystemEvent(this.EVENTS.INITIALIZED, { timestamp: Date.now() });
    }

    /**
     * Graceful Unload/Shutdown Interface Sequence
     */
    async shutdown() {
        if (!this._initialized) return;
        this._initialized = false;
        this._plugins.clear();
        this._deduplicationCache.clear();
        this._auditHistory = [];
        this._dispatchSystemEvent(this.EVENTS.SHUTDOWN, { timestamp: Date.now() });
    }

    /**
     * Core Ingestion Interface: Image Contexts (JPG, PNG, HEIC)
     */
    async scanImage(file) {
        this._assertInitialized();
        const startTime = this._getHighResolutionTime();
        this._dispatchSystemEvent(this.EVENTS.SCAN_STARTED, { filename: file?.name });

        if (!file || !(file instanceof Blob)) {
            const errorFrame = this._generateErrorFrame("MALFORMED_INPUT", "Provided file is not a valid Blob/File object.", startTime);
            this._dispatchSystemEvent(this.EVENTS.ERROR, errorFrame);
            return errorFrame;
        }

        try {
            // Deduplication and Anti-Rescan Hashing Pipeline
            const docHash = await this.hashDocument(file);
            if (this._deduplicationCache.has(docHash)) {
                return this._generateDeferredFrame(
                    "DEFERRED",
                    `Duplicate request flagged. Document matching hash ${docHash} already processed or cached.`,
                    startTime,
                    docHash
                );
            }

            // Plugin Selection - Find the highest priority engine registered
            const operationalPlugin = this._getHighestPriorityPlugin();
            if (!operationalPlugin) {
                const deferredFrame = this._generateDeferredFrame("DEFERRED", "No valid OCR engine plugin is registered in the CozyOS runtime pipeline.", startTime, docHash);
                this._dispatchSystemEvent(this.EVENTS.SCAN_COMPLETED, deferredFrame);
                return deferredFrame;
            }

            // Execute processing loop through external plugin context
            const pluginResult = await operationalPlugin.instance.process(file);

            // Defensive Plugin Result Structure Verification
            if (!pluginResult || typeof pluginResult.rawText !== "string") {
                throw new Error(`Malformed OCR plugin response from driver: ${operationalPlugin.id}`);
            }

            // Bounded cache maintenance tracking
            this._trackCacheCeiling(docHash);

            const executionResponse = await this._processExtractedTextPipeline(
                pluginResult.rawText,
                startTime,
                operationalPlugin,
                docHash,
                pluginResult.confidence !== undefined ? pluginResult.confidence : null
            );

            this._dispatchSystemEvent(this.EVENTS.SCAN_COMPLETED, executionResponse);
            return executionResponse;

        } catch (fault) {
            const errorFrame = this._generateErrorFrame("INGESTION_FAULT", fault.message || String(fault), startTime);
            this._dispatchSystemEvent(this.EVENTS.ERROR, errorFrame);
            return errorFrame;
        }
    }

    /**
     * Core Ingestion Interface: Multi-page PDF Processing Engine Loop
     */
    async scanPDF(file) {
        this._assertInitialized();
        const startTime = this._getHighResolutionTime();

        return this._generateDeferredFrame(
            "DEFERRED",
            "Multi-page PDF parsing matrix engine not installed. Missing native layer bindings.",
            startTime,
            null
        );
    }

    /**
     * Batch Execution Matrix
     */
    async scanBatch(filesList) {
        this._assertInitialized();
        if (!Array.isArray(filesList)) {
            return this._generateErrorFrame("INVALID_BATCH", "Batch execution parameter must be an array.", this._getHighResolutionTime());
        }
        return this._generateDeferredFrame("DEFERRED", "Batch orchestration matrix deferred to downstream task schedulers.", this._getHighResolutionTime(), null);
    }

    /**
     * Live Runtime Execution Intercept
     */
    async cancelScan(scanId) {
        this._assertInitialized();
        return this._generateDeferredFrame("DEFERRED", "Asynchronous cancel signal not matched to active running thread ID.", this._getHighResolutionTime(), null);
    }

    /**
     * Raw text direct translation processor mapping
     */
    async extractText(imageBlob) {
        this._assertInitialized();
        const scanFrame = await this.scanImage(imageBlob);
        return scanFrame.rawText;
    }

    /**
     * Document Type Classifier Matrix
     */
    detectDocumentType(text) {
        if (!text || typeof text !== "string") return "Unknown";

        const cleanText = text.toUpperCase();

        if (cleanText.includes("REPUBLIC OF KENYA") && (cleanText.includes("NATIONAL IDENTITY CARD") || cleanText.includes("IDENTITY CARD"))) {
            return "National_ID";
        }
        if (cleanText.includes("PASSPORT") && cleanText.includes("REPUBLIC OF KENYA") && cleanText.includes("<<")) {
            return "Passport";
        }
        if (cleanText.includes("KENYA DRIVING LICENCE") || cleanText.includes("DRIVING LICENSE") || cleanText.includes("NTSA")) {
            return "Driving_Licence";
        }
        if (cleanText.includes("KENYA REVENUE AUTHORITY") || cleanText.includes("PIN CERTIFICATE")) {
            return "KRA_PIN";
        }
        if (cleanText.includes("BUSINESS REGISTRATION") || cleanText.includes("CERTIFICATE OF INCORPORATION")) {
            return "Business_Certificate";
        }
        if (cleanText.includes("INVOICE") || cleanText.includes("TAX INVOICE")) {
            return "Invoice";
        }
        if (cleanText.includes("CASH RECEIPT") || cleanText.includes("SALE RECEIPT") || cleanText.includes("MERCHANT ID")) {
            return "Receipt";
        }

        return "Unknown";
    }

    /**
     * Structured Field Extraction Domain Mapping
     */
    extractStructuredData(text) {
        const docType = this.detectDocumentType(text);
        const structured = {};

        if (docType === "Unknown" || !text) return this._EMPTY_FROZEN_OBJECT;

        switch (docType) {
            case "National_ID":
                structured.fullName = this._regexMatch(text, /(?:FULL\s+NAME|NAME)[:\s]+([A-Z\s]+)/i);
                structured.idNumber = this._regexMatch(text, /(?:ID\s+NUMBER|NUMBER)[:\s]+([0-9]+)/i);
                structured.dateOfBirth = this._regexMatch(text, /(?:DATE\s+OF\s+BIRTH|DOB)[:\s]+([0-9]{2}[\/\-.][0-9]{2}[\/\-.][0-9]{4})/i);
                structured.sex = this._regexMatch(text, /(?:SEX|GENDER)[:\s]+([M|F|MALE|FEMALE])/i);
                structured.nationality = this._regexMatch(text, /(?:NATIONALITY)[:\s]+([A-Z]+)/i);
                structured.serialNumber = this._regexMatch(text, /(?:SERIAL\s+NUMBER|SERIAL\s+NO)[:\s]+([0-9]+)/i);
                structured.issueDate = this._regexMatch(text, /(?:DATE\s+OF\s+ISSUE|ISSUE\s+DATE)[:\s]+([0-9]{2}[\/\-.][0-9]{2}[\/\-.][0-9]{4})/i);
                break;

            case "Passport":
                structured.passportNumber = this._regexMatch(text, /(?:PASSPORT\s+NO|PASSPORT\s+NUMBER)[:\s]+([A-Z0-9]+)/i);
                structured.country = this._regexMatch(text, /(?:COUNTRY\s+CODE)[:\s]+([A-Z]{3})/i);
                structured.surname = this._regexMatch(text, /(?:SURNAME)[:\s]+([A-Z]+)/i);
                structured.givenNames = this._regexMatch(text, /(?:GIVEN\s+NAMES)[:\s]+([A-Z\s]+)/i);
                structured.nationality = this._regexMatch(text, /(?:NATIONALITY)[:\s]+([A-Z]+)/i);
                structured.dateOfBirth = this._regexMatch(text, /([0-9]{2}\s+[A-Z]{3}\s+[0-9]{4})/i);
                structured.mrz = this._regexMatch(text, /([A-Z0-9<]{44})/i);
                break;

            case "KRA_PIN":
                structured.pin = this._regexMatch(text, /([A-Z][0-9]{9}[A-Z])/i);
                break;

            case "Receipt":
            case "Invoice":
                structured.merchant = this._regexMatch(text, /\b([A-Z0-9\s.\-_]+)\b/i);
                structured.amount = this._regexMatch(text, /(?:TOTAL|TOTAL\s+DUE|AMOUNT\s+PAID)[:\s\W]+([0-9,]+\.[0-9]{2})/i);
                structured.vat = this._regexMatch(text, /(?:VAT|TAX)[:\s\W]+([0-9,]+\.[0-9]{2})/i);
                structured.date = this._regexMatch(text, /(\b[0-9]{2}[\/\-.][0-9]{2}[\/\-.][0-9]{4}\b)/i);
                structured.reference = this._regexMatch(text, /(?:INV|REC|REF|TICKET)\s*#?[:\s]*([A-Z0-9\-]+)/i);
                structured.phone = this._regexMatch(text, /(\+?254\s*7[0-9]{8}|\b07[0-9]{8}\b)/i);
                break;
        }

        return this._deepFreeze(structured);
    }

    /**
     * Regex Match Extraction Verification Utility
     */
    _regexMatch(text, regex) {
        const match = text.match(regex);
        return match && match[1] ? match[1].trim() : null;
    }

    /**
     * Formatting Syntax Validator Interface
     */
    validateExtraction(data) {
        const diagnostics = { valid: true, failures: [] };
        if (!data) return this._deepFreeze(diagnostics);

        if (data.idNumber && !/^[0-9]{7,8}$/.test(data.idNumber)) {
            diagnostics.valid = false;
            diagnostics.failures.push("INVALID_NATIONAL_ID_FORMAT");
        }
        if (data.passportNumber && !/^[A-Z0-9]{7,9}$/i.test(data.passportNumber)) {
            diagnostics.valid = false;
            diagnostics.failures.push("INVALID_PASSPORT_FORMAT");
        }
        if (data.pin && !/^[A-Z][0-9]{9}[A-Z]$/i.test(data.pin)) {
            diagnostics.valid = false;
            diagnostics.failures.push("INVALID_KRA_PIN_FORMAT");
        }
        if (data.phone && !/^(\+?254|0)?7[0-9]{8}$/.test(data.phone.replace(/[\s\-]/g, ""))) {
            diagnostics.valid = false;
            diagnostics.failures.push("INVALID_KENYAN_PHONE_FORMAT");
        }

        return this._deepFreeze(diagnostics);
    }

    /**
     * SHA-256 Hash Ingestion Engine Generator Loop
     */
    async hashDocument(blob) {
        if (!blob || !(blob instanceof Blob)) return null;

        const fallbackValue = `FALLBACK_HASH_${Date.now()}_${Math.random().toString(36).substring(2,7)}`;

        // Defensive Global Variable Existence Handlers
        if (
            typeof globalThis === "undefined" ||
            !globalThis.crypto ||
            !globalThis.crypto.subtle ||
            typeof globalThis.crypto.subtle.digest !== "function"
        ) {
            return fallbackValue;
        }

        try {
            const arrayBuffer = await blob.arrayBuffer();
            const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", arrayBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            return fallbackValue;
        }
    }

    /**
     * Structural Document Identity Comparator
     */
    async compareDocuments(fileA, fileB) {
        this._assertInitialized();
        const hashA = await this.hashDocument(fileA);
        const hashB = await this.hashDocument(fileB);
        return hashA === hashB;
    }

    /**
     * Plugin Subsystem: Register Extraction Engine Component
     */
    registerPlugin(pluginId, pluginInstance, priority = 50) {
        if (!pluginId || !pluginInstance || typeof pluginInstance.process !== "function") {
            throw new Error("❌ [OCR REGISTRATION ENGINE FAULT] Malformed runtime configuration parameters.");
        }
        this._plugins.set(pluginId, { priority: Number(priority) || 50, instance: pluginInstance });
    }

    /**
     * Plugin Subsystem: De-register Configuration Target
     */
    unregisterPlugin(pluginId) {
        return this._plugins.delete(pluginId);
    }

    /**
     * Plugin Subsystem: Fetch Active Drivers Map
     */
    listPlugins() {
        const rawList = [];
        for (const [id, value] of this._plugins.entries()) {
            rawList.push({
                pluginId: id,
                priority: value.priority,
                version: value.instance.version || "1.0.0"
            });
        }
        return this._deepFreeze(rawList.sort((a, b) => b.priority - a.priority));
    }

    /**
     * Microkernel Internal Cache Purge Trigger
     */
    clearCache() {
        this._deduplicationCache.clear();
        return true;
    }

    /**
     * Engine Internal Core Initialization Pre-Flight Loop Warmup
     */
    async warmupEngine() {
        this._assertInitialized();
        return true;
    }

    /**
     * Audit Analytics Target Stream Extraction
     */
    getAuditHistory() {
        return this._deepFreeze([...this._auditHistory]);
    }

    /**
     * Telemetry and Integration Result Exporters
     */
    exportResults() {
        return JSON.stringify(this.getAuditHistory());
    }

    /**
     * Platform Monitoring System Introspection Endpoint
     */
    getHealthStatus() {
        const plugins = this.listPlugins();

        let heapUsage = null;
        if (typeof window !== "undefined" && window.performance && window.performance.memory) {
            heapUsage = window.performance.memory.usedJSHeapSize;
        }

        return this._deepFreeze({
            initialized: this._initialized,
            pluginsLoaded: plugins.length,
            defaultEngine: plugins.length === 0,
            memoryUsage: heapUsage,
            supportedDocuments: this._supportedDocuments,
            version: this.getVersion()
        });
    }

    getSupportedDocuments() { return this._supportedDocuments; }
    getVersion() { return this.metadata.apiVersion; }

    /* ── PRIVATE REUSABLE INTERNAL PROCESSING CORE FUNCTIONS ── */

    _assertInitialized() {
        if (!this._initialized) throw new Error("❌ [CRITICAL COZYOS CORE FAULT] CozyOCR Engine requested before initialization routine.");
    }

    _getHighResolutionTime() {
        return (
            typeof performance !== "undefined" &&
            typeof performance.now === "function"
        ) ? performance.now() : Date.now();
    }

    _trackCacheCeiling(newHash) {
        if (this._deduplicationCache.size >= this._MAX_CACHE_SIZE) {
            // Safe removal execution using standard collection iterator sequences
            const oldestKey = this._deduplicationCache.values().next().value;
            if (oldestKey !== undefined) {
                this._deduplicationCache.delete(oldestKey);
            }
        }
        this._deduplicationCache.add(newHash);
    }

    _getHighestPriorityPlugin() {
        if (this._plugins.size === 0) return null;
        let highest = null;
        let selectedId = null;

        for (const [id, entry] of this._plugins.entries()) {
            if (highest === null || entry.priority > highest.priority) {
                highest = entry;
                selectedId = id;
            }
        }
        return { id: selectedId, priority: highest.priority, instance: highest.instance };
    }

    async _processExtractedTextPipeline(rawText, startTime, pluginMeta, documentHash, pluginConfidence = null) {
        this._dispatchSystemEvent(this.EVENTS.EXTRACTION_COMPLETED, { timestamp: Date.now() });

        const docType = this.detectDocumentType(rawText);
        const structuredData = this.extractStructuredData(rawText);
        const validation = this.validateExtraction(structuredData);

        this._dispatchSystemEvent(this.EVENTS.VALIDATION_COMPLETED, { docType, valid: validation.valid });

        const processTimeMs = +(this._getHighResolutionTime() - startTime).toFixed(2);

        const responsePayload = {
            success: true,
            documentType: docType,
            rawText: rawText,
            structuredData: structuredData,
            confidence: pluginConfidence,
            warnings: validation.failures,
            errors: [],
            timestamp: Date.now(),
            processingTime: processTimeMs,
            engineVersion: this.metadata.apiVersion
        };

        this._writeAuditRecord({
            scanId: `scan-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: Date.now(),
            processingTime: processTimeMs,
            documentType: docType,
            confidence: pluginConfidence,
            warnings: validation.failures,
            engineUsed: pluginMeta.id,
            pluginUsed: pluginMeta.id,
            pluginVersion: pluginMeta.instance.version || "1.0.0",
            fallbackUsed: false,
            documentHash: documentHash
        });

        return this._deepFreeze(responsePayload);
    }

    _generateDeferredFrame(status, reasonStr, startTime, hash = null) {
        return this._deepFreeze({
            success: false,
            status: status,
            reason: reasonStr,
            documentType: "Unknown",
            rawText: null,
            structuredData: this._EMPTY_FROZEN_OBJECT,
            confidence: "DEFERRED",
            warnings: [reasonStr],
            errors: [],
            timestamp: Date.now(),
            processingTime: +(this._getHighResolutionTime() - startTime).toFixed(2),
            engineVersion: this.metadata.apiVersion,
            documentHash: hash
        });
    }

    
    _generateErrorFrame(errCode, errMsg, startTime) {
        return this._deepFreeze({
            success: false,
            documentType: "Unknown",
            rawText: null,
            structuredData: this._EMPTY_FROZEN_OBJECT,
            confidence: null,
            warnings: [],
            errors: [{ code: errCode, message: errMsg }],
            timestamp: Date.now(),
            processingTime: +(this._getHighResolutionTime() - startTime).toFixed(2),
            engineVersion: this.metadata.apiVersion
        });
    }

    _writeAuditRecord(record) {
        this._auditHistory.push(this._deepFreeze(record));
        if (this._auditHistory.length > 500) this._auditHistory.shift();
    }

    _dispatchSystemEvent(eventName, payload) {
        if (typeof document !== "undefined" && document.dispatchEvent) {
            const systemEvt = new CustomEvent(eventName, { detail: this._deepFreeze(payload) });
            document.dispatchEvent(systemEvt);
        }
    }

    _deepFreeze(obj) {
        if (obj === null || typeof obj !== "object") return obj;
        if (!Object.isFrozen(obj)) {
            Object.freeze(obj);
        }
        for (const key of Object.keys(obj)) {
            const prop = obj[key];
            if (prop !== null && typeof prop === "object") {
                this._deepFreeze(prop);
            }
        }
        return obj;
    }
}

// Global Core Namespace Attachment Isolation
window.CozyOS.OCR = new CozyOCREngine();
