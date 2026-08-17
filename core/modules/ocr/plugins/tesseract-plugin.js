/**

── CozyOS UNIVERSAL COGNITIVE CORE ── TESSERACT OCR DRIVER ADAPTER

FILE: core/modules/ocr/plugins/tesseract-plugin.js

VERSION: 2.1.0-PRODUCTION-READY (Tesseract.js v6)

Enterprise-grade hardware driver adapter bridging the Tesseract.js v6 runtime

worker instance with the frozen CozyOCR Core engine v1.1.0 pipeline.

Enforces absolute separation of concerns: this driver ONLY turns an image into

raw text + a confidence score. It does not classify documents, extract named

fields, validate formats, verify identity, or perform any KYC/AML/fraud-

detection function — those remain the responsibility of CozyOCR Core (document

type detection, regex field extraction, format validation) and are explicitly

out of scope here.

── REQUIRED LIBRARY VERSION ──────────────────────────────────────────────

This driver targets Tesseract.js v6.x ONLY. In v6, worker.loadLanguage() and

worker.initialize() were REMOVED (not just deprecated) — language and OCR

Engine Mode are supplied directly to createWorker(lang, oem, options). Calling

this driver against Tesseract.js v2-v5 is unsupported and out of scope

(DEFERRED); reliable runtime version detection isn't available, so rather than

silently branching for older APIs, this file declares its requirement plainly

via metadata.requiredLibraryVersion and fails fast if createWorker is missing.

── LANGUAGE SUBSYSTEM (v2.1.0) ─────────────────────────────────────────────

Language support is a modular registry, not a hardcoded list. SUPPORTED_LANGUAGES

below is the frozen "CozyOS Core OCR Language Pack v1" — these five codes are

protected and can never be unregistered. Everything else (Amharic, Portuguese,

Spanish, German, Italian, Chinese, Japanese, Hindi, Yoruba, Zulu, Luganda,

Kinyarwanda, Lingala, etc.) is added at runtime via registerLanguage() without

touching this file or CozyOCR Core. The engine only depends on the registry's

public interface (has/get/list/register/unregister), never on a fixed list of

languages, so growing language support is purely additive.
*/


"use strict";

(() => {
// Structural Guard: Ensure module execution context drops into place only if CozyOCR Core is ready
if (!window.CozyOS || !window.CozyOS.OCR) {
throw new Error("❌ [CRITICAL COZYOS PLUGIN FAULT] CozyOCR Core v1.1.0 baseline substrate must be initialized before loading the Tesseract driver extension layer.");
}

// ── CozyOS Core OCR Language Pack v1 (frozen, protected, never removable) ──  
const SUPPORTED_LANGUAGES = Object.freeze({  
    eng: "English",  
    swa: "Kiswahili",  
    ara: "Arabic",  
    fra: "French",  
    som: "Somali"  
});  

// Tesseract.js language codes follow ISO 639-2/T style, sometimes with a  
// script suffix (e.g. "chi_sim", "chi_tra"). Accept lowercase letters plus  
// an optional underscore-separated suffix; reject '+' (reserved as the  
// multi-language join operator) and anything else that isn't a plausible code.  
const LANGUAGE_CODE_PATTERN = /^[a-z]{2,4}(_[a-z]{2,8})?$/;  

// ── Live Language Registry ──────────────────────────────────────────────  
// Seeded from the core pack, then grown via registerLanguage(). Kept as a  
// Map<code, { name, core }> internal to this module — CozyOCR Core never  
// touches this directly, only through this plugin's public API.  
const _languageRegistry = new Map(  
    Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => [code, { name, core: true }])  
);  

function isRegistered(code) {  
    return _languageRegistry.has(code);  
}  

function parseLanguageTarget(langString) {  
    return langString.split("+").map(c => c.trim().toLowerCase()).filter(Boolean);  
}  

function validateLanguageTarget(langString) {  
    if (!langString || typeof langString !== "string") {  
        throw new Error("❌ [TESSERACT_DRIVER_FAULT] Language target must be a non-empty string, e.g. 'eng+swa'.");  
    }  
    const codes = parseLanguageTarget(langString);  
    if (codes.length === 0) {  
        throw new Error("❌ [TESSERACT_DRIVER_FAULT] Language target parsed to zero valid codes.");  
    }  
    const unknown = codes.filter(c => !isRegistered(c));  
    if (unknown.length > 0) {  
        throw new Error(  
            `❌ [TESSERACT_DRIVER_FAULT] Unknown/unregistered language code(s): ${unknown.join(", ")}. ` +  
            `Registered codes: ${[..._languageRegistry.keys()].join(", ")}. ` +  
            `Use registerLanguage(code, name) to add a new language pack first.`  
        );  
    }  
    return codes;  
}  

// ── Operational Telemetry Vectors ───────────────────────────────────────  
let _workerInstance = null;  
let _isInitializing = false;  
let _isWarmingUp = false;  
let _totalScansExecuted = 0;  
let _totalExecutionTimeMs = 0;  
let _lastScanTimestamp = null;  
let _lastFailureReason = "NONE";  
let _consecutiveFailures = 0;  
let _languageLoaded = null; // language string the current worker was actually built with  
const _registeredPriority = 100;  

// ── Configuration Constants ─────────────────────────────────────────────  
const TIMEOUT_LIMIT_MS = 25000;  
const OEM_MODE = 1; // LSTM engine (Tesseract.js v6 default)  
const MAX_CONSECUTIVE_FAILURES_BEFORE_RESET = 3;  
const REQUIRED_LIBRARY_VERSION = "^6.0.0";  
let _activeLanguageTarget = "eng+swa"; // English + Kiswahili default for Kenyan documents  

// Friendly stage labels for known Tesseract logger statuses. Anything not in  
// this map is passed through as-is rather than guessed at.  
const PROGRESS_STAGE_LABELS = Object.freeze({  
    "loading tesseract core": "Initializing…",  
    "initializing tesseract": "Initializing…",  
    "loading language traineddata": "Loading language…",  
    "initializing api": "Preparing recognizer…",  
    "recognizing text": "Recognizing…"  
});  

function dispatchProgress(message) {  
    if (typeof document === "undefined" || !document.dispatchEvent) return;  
    const status = message && message.status ? message.status : "unknown";  
    const progress = message && typeof message.progress === "number" ? message.progress : null;  
    document.dispatchEvent(new CustomEvent("OCR_PROGRESS", {  
        detail: {  
            driver: "tesseract",  
            status: status,  
            stage: PROGRESS_STAGE_LABELS[status] || status,  
            progress: progress, // 0.0 - 1.0, or null if not reported for this status  
            progressPercent: progress !== null ? Math.round(progress * 100) : null  
        }  
    }));  
}  

// ── Preprocessing (canvas-based) ────────────────────────────────────────  
// Implemented: EXIF orientation correction, grayscale, auto contrast stretch,  
// upscale-if-too-small, light sharpen.  
// DEFERRED (not implemented): deskew, denoise. Both require real algorithms  
// (skew-angle estimation via projection profiling/Hough transform; noise-  
// model-aware filtering) — a naive version risks degrading accuracy rather  
// than improving it, so this driver does not attempt either.  
const PREPROCESS_MIN_DIMENSION = 800; // upscale if smaller than this on the long edge  

async function preprocessImage(file) {  
    if (typeof document === "undefined" || typeof createImageBitmap === "undefined") {  
        // No canvas environment available (e.g. non-browser context) — skip preprocessing.  
        return file;  
    }  

    try {  
        // imageOrientation: "from-image" applies the file's EXIF orientation tag  
        // (this is also the browser default, but set explicitly so behavior does  
        // not silently depend on a default that could change).  
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });  
        const { width, height } = bitmap;  

        const longEdge = Math.max(width, height);  
        const scale = longEdge < PREPROCESS_MIN_DIMENSION ? (PREPROCESS_MIN_DIMENSION / longEdge) : 1;  

        const targetW = Math.round(width * scale);  
        const targetH = Math.round(height * scale);  

        const canvas = document.createElement("canvas");  
        canvas.width = targetW;  
        canvas.height = targetH;  
        const ctx = canvas.getContext("2d");  
        ctx.drawImage(bitmap, 0, 0, targetW, targetH);  
        bitmap.close?.();  

        const imageData = ctx.getImageData(0, 0, targetW, targetH);  
        const data = imageData.data;  
        const pixelCount = targetW * targetH;  

        // Grayscale (luminance-weighted) + track min/max for contrast stretch  
        let min = 255, max = 0;  
        const gray = new Uint8ClampedArray(pixelCount);  
        for (let i = 0, p = 0; i < data.length; i += 4, p++) {  
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];  
            gray[p] = lum;  
            if (lum < min) min = lum;  
            if (lum > max) max = lum;  
        }  

        // Auto contrast stretch (guard against divide-by-zero on flat images)  
        const range = Math.max(1, max - min);  
        for (let p = 0; p < pixelCount; p++) {  
            gray[p] = ((gray[p] - min) / range) * 255;  
        }  

        // Light sharpen via 3x3 unsharp-style convolution kernel  
        const sharpened = new Uint8ClampedArray(pixelCount);  
        const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];  
        for (let y = 0; y < targetH; y++) {  
            for (let x = 0; x < targetW; x++) {  
                if (x === 0 || y === 0 || x === targetW - 1 || y === targetH - 1) {  
                    sharpened[y * targetW + x] = gray[y * targetW + x];  
                    continue;  
                }  
                let sum = 0, k = 0;  
                for (let ky = -1; ky <= 1; ky++) {  
                    for (let kx = -1; kx <= 1; kx++) {  
                        sum += gray[(y + ky) * targetW + (x + kx)] * kernel[k++];  
                    }  
                }  
                sharpened[y * targetW + x] = sum;  
            }  
        }  

        for (let i = 0, p = 0; i < data.length; i += 4, p++) {  
            data[i] = data[i + 1] = data[i + 2] = sharpened[p];  
            // alpha channel (data[i+3]) left untouched  
        }  
        ctx.putImageData(imageData, 0, 0);  

        const processedBlob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));  
        return processedBlob || file;  
    } catch (e) {  
        // Preprocessing is a best-effort enhancement. If it fails for any reason,  
        // fall back to the original file rather than blocking recognition.  
        console.warn("[TesseractPlugin] Preprocessing failed, using original image:", e.message || e);  
        return file;  
    }  
}  

function computeWorkerStatus() {  
    if (_isInitializing) return "initializing";  
    if (_isWarmingUp) return "warming_up";  
    if (!_workerInstance) return "uninitialized";  
    return _lastFailureReason === "NONE" ? "ready" : "degraded";  
}  

const TesseractPlugin = {  
    version: "2.1.0",  

    metadata: Object.freeze({  
        pluginId: "tesseract",  
        vendor: "Tesseract.js",  
        version: "2.1.0",  
        requiredLibraryVersion: REQUIRED_LIBRARY_VERSION,  
        compatibleWith: "CozyOCR 1.1.0",  
        priority: _registeredPriority  
    }),  

    // ── Language Registry Public API ──────────────────────────────────  

    /**  
     * Returns the currently registered languages (core + dynamically added)  
     * as a frozen { code: name } map, safe to display in a UI language picker.  
     */  
    getSupportedLanguages() {  
        const out = {};  
        for (const [code, entry] of _languageRegistry.entries()) {  
            out[code] = entry.name;  
        }  
        return Object.freeze(out);  
    },  

    /**  
     * Register a new language pack so it can be used in setLanguage().  
     * Does NOT touch CozyOCR Core — purely additive to this plugin's registry.  
     * Rejects: malformed codes, the '+' join character, and duplicate codes  
     * (call unregisterLanguage first if you intend to replace a non-core entry).  
     */  
    registerLanguage(code, name) {  
        if (!code || typeof code !== "string") {  
            throw new Error("❌ [TESSERACT_DRIVER_FAULT] registerLanguage requires a non-empty string code.");  
        }  
        const normalizedCode = code.trim().toLowerCase();  
        if (!LANGUAGE_CODE_PATTERN.test(normalizedCode)) {  
            throw new Error(`❌ [TESSERACT_DRIVER_FAULT] '${code}' is not a valid Tesseract language code (expected lowercase letters, optionally with an underscore suffix, e.g. 'eng', 'chi_sim').`);  
        }  
        if (!name || typeof name !== "string" || !name.trim()) {  
            throw new Error("❌ [TESSERACT_DRIVER_FAULT] registerLanguage requires a non-empty display name.");  
        }  
        if (_languageRegistry.has(normalizedCode)) {  
            throw new Error(`❌ [TESSERACT_DRIVER_FAULT] Language code '${normalizedCode}' is already registered as '${_languageRegistry.get(normalizedCode).name}'. Unregister it first if you want to replace it.`);  
        }  

        _languageRegistry.set(normalizedCode, { name: name.trim(), core: false });  
        return { code: normalizedCode, name: name.trim(), core: false };  
    },  

    /**  
     * Remove a previously self-registered language pack. Protected core  
     * languages (SUPPORTED_LANGUAGES) can never be unregistered. A language  
     * currently in use by the active recognition target also cannot be  
     * removed — change the active language first.  
     */  
    unregisterLanguage(code) {  
        if (!code || typeof code !== "string") {  
            throw new Error("❌ [TESSERACT_DRIVER_FAULT] unregisterLanguage requires a non-empty string code.");  
        }  
        const normalizedCode = code.trim().toLowerCase();  
        const entry = _languageRegistry.get(normalizedCode);  

        if (!entry) {  
            throw new Error(`❌ [TESSERACT_DRIVER_FAULT] Language code '${normalizedCode}' is not registered.`);  
        }  
        if (entry.core) {  
            throw new Error(`❌ [TESSERACT_DRIVER_FAULT] '${normalizedCode}' is a protected CozyOS Core OCR Language Pack v1 language and cannot be unregistered.`);  
        }  
        if (parseLanguageTarget(_activeLanguageTarget).includes(normalizedCode)) {  
            throw new Error(`❌ [TESSERACT_DRIVER_FAULT] '${normalizedCode}' is part of the currently active language target ('${_activeLanguageTarget}'). Call setLanguage() to switch away from it before unregistering.`);  
        }  

        _languageRegistry.delete(normalizedCode);  
        return true;  
    },  

    /**  
     * Configure the active recognition language(s). All codes are validated  
     * against the registry first — unknown codes are rejected with a clear  
     * error rather than silently passed through to Tesseract. Takes effect  
     * immediately if a worker is already running (via worker.reinitialize());  
     * otherwise applies on next initialize().  
     * Examples: "eng", "swa", "eng+swa", "eng+fra", "eng+ara"  
     */  
    async setLanguage(languageString) {  
        const codes = validateLanguageTarget(languageString);  
        const normalizedTarget = codes.join("+");  
        _activeLanguageTarget = normalizedTarget;  

        if (_workerInstance && typeof _workerInstance.reinitialize === "function") {  
            await _workerInstance.reinitialize(normalizedTarget, OEM_MODE);  
            _languageLoaded = normalizedTarget;  
        }  
        return normalizedTarget;  
    },  

    getLanguage() {  
        return _activeLanguageTarget;  
    },  

    // ── Lifecycle ────────────────────────────────────────────────────  

    /**  
     * Lifecycle Hook: Pre-flight Initializer Loop  
     * Safe to call multiple times; prevents duplicate workers using concurrent gating blocks.  
     */  
    async initialize() {  
        if (_workerInstance) return;  
        if (_isInitializing) {  
            while (_isInitializing) {  
                await new Promise(resolve => setTimeout(resolve, 50));  
            }  
            return;  
        }  

        _isInitializing = true;  

        try {  
            if (typeof globalThis.Tesseract === "undefined" || !globalThis.Tesseract.createWorker) {  
                throw new Error("Tesseract.js v6 script library binding not found in global runtime context.");  
            }  

            // Re-validate in case a code was unregistered after being set active.  
            validateLanguageTarget(_activeLanguageTarget);  

            // v6 API: language + OEM are supplied directly to createWorker.  
            // logger streams progress events which we re-broadcast as OCR_PROGRESS  
            // so the host UI can render an accurate loading/recognition indicator.  
            const worker = await globalThis.Tesseract.createWorker(_activeLanguageTarget, OEM_MODE, {  
                logger: (m) => dispatchProgress(m)  
            });  

            _workerInstance = worker;  
            _languageLoaded = _activeLanguageTarget;  
            _isInitializing = false;  
            _lastFailureReason = "NONE";  
            _consecutiveFailures = 0;  
        } catch (fault) {  
            _isInitializing = false;  
            _lastFailureReason = `INITIALIZATION_FAILED: ${fault.message || String(fault)}`;  
            throw new Error(`❌ [TESSERACT_DRIVER_FAULT] Worker orchestration configuration failed: ${fault.message}`);  
        }  
    },  

    /**  
     * Readiness guard. In v6, language/OEM loading happens inside initialize()  
     * via createWorker(), so this simply ensures a worker exists.  
     */  
    async warmup() {  
        if (_isWarmingUp) return;  
        _isWarmingUp = true;  
        try {  
            await this.initialize();  
            _isWarmingUp = false;  
            _lastFailureReason = "NONE";  
        } catch (fault) {  
            _isWarmingUp = false;  
            _lastFailureReason = `WARMUP_FAILED: ${fault.message || String(fault)}`;  
            throw new Error(`❌ [TESSERACT_DRIVER_FAULT] Worker resource pre-load sequence failure: ${fault.message}`);  
        }  
    },  

    /**  
     * Lifecycle Hook: Graceful Worker Thread Termination Sequence  
     */  
    async shutdown() {  
        if (!_workerInstance) return;  
        try {  
            await _workerInstance.terminate();  
        } catch (err) {  
            // Silently trap context termination anomalies during clean teardown  
        } finally {  
            _workerInstance = null;  
            _languageLoaded = null;  
            _isInitializing = false;  
            _isWarmingUp = false;  
        }  
    },  

    /**  
     * Explicit manual reset — tears down and immediately rebuilds the worker.  
     * Useful for long-running sessions or after external error reports.  
     */  
    async resetWorker() {  
        await this.shutdown();  
        _consecutiveFailures = 0;  
        await this.initialize();  
    },  

    

        // ── Recognition ──────────────────────────────────────────────────

        /**
         * Core Processing Engine: Performs OCR on a single image Blob/File.
         * Returns ONLY { rawText, confidence } — no document classification, no
         * field extraction, no verification. Those stay in CozyOCR Core.
         */
        async process(file, options = {}) {
            const startTime = performance.now();

            if (!file || !(file instanceof Blob)) {
                _lastFailureReason = "INVALID_INPUT_OBJECT";
                throw new Error("❌ [TESSERACT_DRIVER_FAULT] Input source must be an active File or Blob memory instance mapping format.");
            }

            const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/bmp", "image/tiff", "image/heic"];
            if (file.type && !validTypes.includes(file.type.toLowerCase())) {
                _lastFailureReason = "UNSUPPORTED_MIME_TYPE";
                throw new Error(`❌ [TESSERACT_DRIVER_FAULT] MIME file type variance '${file.type}' rejected by hardware adapter wrapper layer.`);
            }

            await this.warmup();

            if (!_workerInstance) {
                _lastFailureReason = "WORKER_LOST_OR_UNAVAILABLE";
                throw new Error("❌ [TESSERACT_DRIVER_FAULT] Runtime execution context processing pipeline is completely disconnected.");
            }

            const inputForRecognition = options.skipPreprocessing
                ? file
                : await preprocessImage(file);

            try {
                const extractionResult = await Promise.race([
                    _workerInstance.recognize(inputForRecognition),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error("OCR_RECOGNITION_TIMEOUT_EXCEEDED")), TIMEOUT_LIMIT_MS)
                    )
                ]);

                if (!extractionResult || !extractionResult.data || typeof extractionResult.data.text !== "string") {
                    throw new Error("Invalid structure or character array stream returned from native driver core layers.");
                }

                const computedConfidence = typeof extractionResult.data.confidence === "number"
                    ? +(extractionResult.data.confidence / 100).toFixed(4)
                    : null;

                _totalScansExecuted += 1;
                _lastScanTimestamp = new Date().toISOString();
                _totalExecutionTimeMs += (performance.now() - startTime);
                _lastFailureReason = "NONE";
                _consecutiveFailures = 0;

                return {
                    rawText: extractionResult.data.text,
                    confidence: computedConfidence
                };

            } catch (fault) {
                const errorString = fault.message || String(fault);
                _lastFailureReason = `PROCESSING_FAULT: ${errorString}`;
                _consecutiveFailures += 1;

                const isHardCrash = errorString.includes("Worker crashed") || errorString.includes("TIMEOUT");
                const exceededFailureThreshold = _consecutiveFailures >= MAX_CONSECUTIVE_FAILURES_BEFORE_RESET;

                if (isHardCrash || exceededFailureThreshold) {
                    // Recreate the worker so the next call gets a clean instance instead
                    // of a permanently terminated (or silently degraded) one.
                    await this.shutdown();
                    _consecutiveFailures = 0;
                    try {
                        await this.initialize();
                    } catch (reinitFault) {
                        // If rebuild also fails, leave _workerInstance null; next process()
                        // call will attempt warmup() again via the normal lazy-init path.
                    }
                }

                throw new Error(`❌ [TESSERACT_DRIVER_FAULT] Recognition execution process failure: ${errorString}`);
            }
        },

        // ── Diagnostics ──────────────────────────────────────────────────

        /**
         * Diagnostics Engine: Exposes local performance + language + worker state
         * to the platform core monitor.
         */
        getHealthStatus() {
            let averageTimeMs = 0;
            if (_totalScansExecuted > 0) {
                averageTimeMs = +(_totalExecutionTimeMs / _totalScansExecuted).toFixed(2);
            }

            let memoryEstimate = null;
            if (typeof window !== "undefined" && window.performance && window.performance.memory) {
                // Chrome-only API; other browsers will leave this null.
                memoryEstimate = window.performance.memory.usedJSHeapSize;
            }

            const registeredLanguagePacks = [..._languageRegistry.entries()].map(([code, entry]) => ({
                code, name: entry.name, core: entry.core
            }));

            return Object.freeze({
                driverName: "tesseract",
                version: this.version,
                requiredLibraryVersion: REQUIRED_LIBRARY_VERSION,

                // Worker status
                workerStatus: computeWorkerStatus(),
                isWorkerActive: _workerInstance !== null,
                workerReady: _workerInstance !== null && !_isInitializing && !_isWarmingUp,
                isInitializing: _isInitializing,
                isWarmingUp: _isWarmingUp,
                consecutiveFailures: _consecutiveFailures,
                lastFailureReason: _lastFailureReason,

                // Language subsystem
                activeLanguage: _activeLanguageTarget,
                activeLanguages: parseLanguageTarget(_activeLanguageTarget),
                languageLoaded: _languageLoaded,
                registeredLanguagePacks: registeredLanguagePacks,

                // Performance
                totalScansProcessed: _totalScansExecuted,
                averageProcessingTimeMs: averageTimeMs,
                lastScanProcessedAt: _lastScanTimestamp,
                memoryEstimate: memoryEstimate,
                pluginPriority: _registeredPriority
            });
        }
    };

    // Platform Registration Protocol Phase
    // Registers with Priority level 100 directly into frozen CozyOCR Core Layer
    window.CozyOS.OCR.registerPlugin("tesseract", TesseractPlugin, _registeredPriority);
})();
