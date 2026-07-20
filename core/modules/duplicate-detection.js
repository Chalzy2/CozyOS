/**
 * CozyOS — Duplicate Detection Coordinator
 * File Reference: core/modules/duplicate-detection/duplicate-detection.js
 * Layer: Shared Platform Coordinator
 * Version: 1.0.0-ENTERPRISE
 *
 * PHASE 3
 *   Consumes the outputs of the two certified upstream coordinators —
 *   DocumentEngine (classification/parsing) and DocumentUnderstanding
 *   (enrichment) — and never reimplements either. Never calls OCR or
 *   Tesseract. Input is strictly { documentRecord, understanding }.
 *
 * OWNERSHIP
 *   Owns only: duplicate analysis, similarity analysis, version
 *   comparison, fingerprinting, duplicate reporting.
 *   Does NOT own: OCR, document classification, document understanding,
 *   knowledge extraction, storage.
 *
 * DISCLOSED DESIGN DECISION — no corpus exists yet
 *   DocumentEngine's own internal #documents Map is declared but never
 *   populated anywhere in the certified codebase (verified) — there is
 *   no real, live corpus of previously-processed documents anywhere in
 *   this platform yet. Per "Real Data Only" / "No Fake Status", this
 *   file does not invent one. It follows DocumentEngine's own
 *   established pattern for missing backends (Storage/PDF/Search): a
 *   real, disclosed, empty extension hook.
 *     - registerCandidateProvider(fn) — a real hook an application can
 *       register once a real document store exists. Until one is
 *       registered, and unless an explicit `candidates` array is passed
 *       to analyze(), comparedDocuments is honestly empty and the
 *       result is NEW_DOCUMENT (nothing exists to compare against) —
 *       never a fabricated match.
 *     - analyze({documentRecord, understanding}, { candidates }) also
 *       accepts an optional, explicit candidate list for callers that
 *       already hold a real corpus (e.g. an application-level index).
 *       This does not change the required two-field domain input; it
 *       is comparison context, not a new required field.
 *
 * FINGERPRINT
 *   Deterministic SHA-256 (Web Crypto, crypto.subtle.digest) over
 *   normalized text + sorted identifiers + documentType + language —
 *   the same real hashing approach already used by
 *   cozy-document-storage-provider.js, cozy-bugfixer.js, and
 *   cozy-workspace.js. No custom/invented hashing algorithm.
 *
 * HONESTY DISCIPLINE
 *   - Similarity scores are a documented, deterministic weighted
 *     average over up to six comparison layers. Layers with no data on
 *     either side are excluded from the average (never scored as a
 *     fabricated match or mismatch).
 *   - HealthEngine / AuditEngine / ResourceManager / OperationsEngine
 *     do not exist as live globals anywhere in this codebase (verified,
 *     same finding as Phase 2). This file does not claim integration
 *     with them. It exposes its own real, internal equivalents
 *     (getHealthReport / getAuditLog / getResourceReport) that a real
 *     external service could consume later, without fabricating the
 *     other direction.
 *   - Never stores, deletes, updates, replaces, restarts, or reloads
 *     anything. Read-only analysis; no Identity authorization required.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const DD_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    const STATUSES = Object.freeze(["NEW_DOCUMENT", "EXACT_DUPLICATE", "NEAR_DUPLICATE", "UPDATED_VERSION", "CONFLICT", "UNKNOWN"]);

    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }
    function asString(v) { return typeof v === "string" ? v : ""; }
    function asArray(v) { return Array.isArray(v) ? v : []; }

    function normalizeText(text) {
        return asString(text).toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
    }

    function dedupe(arr) { return Array.from(new Set(arr.map(v => String(v).trim().toLowerCase()).filter(Boolean))); }

    function jaccard(setA, setB) {
        const a = new Set(dedupe(setA));
        const b = new Set(dedupe(setB));
        if (a.size === 0 && b.size === 0) return null; // no data either side — not applicable
        let intersection = 0;
        for (const v of a) if (b.has(v)) intersection++;
        const union = a.size + b.size - intersection;
        return union === 0 ? 0 : intersection / union;
    }

    function wordShingles(text, n = 5) {
        const words = normalizeText(text).split(" ").filter(Boolean);
        if (words.length < n) return words.length ? [words.join(" ")] : [];
        const shingles = [];
        for (let i = 0; i <= words.length - n; i++) shingles.push(words.slice(i, i + n).join(" "));
        return shingles;
    }

    /**
     * #computeFingerprint(content) — identical real SHA-256 pattern used
     * throughout the platform (see cozy-document-storage-provider.js).
     * Honestly returns null if crypto.subtle is unavailable — never a
     * fabricated fingerprint.
     */
    async function computeFingerprint(canonicalString) {
        if (typeof crypto === "undefined" || !crypto.subtle || !canonicalString) return null;
        try {
            const data = new TextEncoder().encode(canonicalString);
            const hashBuffer = await crypto.subtle.digest("SHA-256", data);
            return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
        } catch (_err) { return null; }
    }

    function buildCanonicalString(record, understanding) {
        const identifiers = collectIdentifiers(record, understanding).sort();
        return [
            normalizeText(record?.rawText),
            identifiers.join("|"),
            asString(record?.documentType).toLowerCase(),
            asString(understanding?.language || record?.language).toLowerCase()
        ].join("::");
    }

    function collectIdentifiers(record, understanding) {
        const entities = (understanding && understanding.entities) || {};
        return dedupe([
            record?.documentNumber,
            ...asArray(entities.invoiceNumbers),
            ...asArray(entities.receiptNumbers),
            ...asArray(entities.referenceNumbers),
            ...asArray(entities.registrationNumbers),
            ...asArray(entities.ids),
            ...asArray(entities.passportNumbers),
            ...asArray(entities.licenceNumbers)
        ].filter(v => typeof v === "string" && v.trim()));
    }

    function collectEntitySets(understanding) {
        const e = (understanding && understanding.entities) || {};
        return {
            people: asArray(e.people), organizations: dedupe([...asArray(e.organizations), ...asArray(e.companies)]),
            countries: asArray(e.countries), locations: asArray(e.locations), currencies: asArray(e.currencies),
            amounts: asArray(e.amounts), phoneNumbers: asArray(e.phoneNumbers), emails: asArray(e.emails)
        };
    }

    function extractProfile(record, understanding) {
        record = sanitizeObject(record);
        understanding = sanitizeObject(understanding);
        return {
            documentId: record.documentId ?? null,
            documentType: asString(record.documentType).toLowerCase() || null,
            language: asString(understanding.language || record.language).toLowerCase() || null,
            title: asString(record.title || understanding.title) || null,
            date: record.date ?? null,
            updatedAt: record.updatedAt ?? null,
            owner: record.userId ?? null,
            issuer: record.merchantName ?? (collectEntitySets(understanding).organizations[0] || null),
            total: record.total ?? null,
            identifiers: collectIdentifiers(record, understanding),
            entities: collectEntitySets(understanding),
            summaryWords: (asString(understanding.summary).toLowerCase().match(/[a-z]{3,}/g) || []),
            keywords: asArray(understanding.keywords),
            topic: understanding.topic ?? null,
            sectionTypes: asArray(understanding.sections).map(s => s && s.type).filter(Boolean),
            rawText: asString(record.rawText)
        };
    }

    // ------------------------------------------------------------------
    // Layered comparison. Each layer returns a score in [0,1] or null
    // (not applicable — excluded from the weighted average, never
    // fabricated as a match or mismatch).
    // ------------------------------------------------------------------

    const LAYER_WEIGHTS = Object.freeze({ identifiers: 0.30, metadata: 0.15, entities: 0.20, summary: 0.10, keywords: 0.10, content: 0.15 });

    function compareLayers(a, b) {
        const layers = {};

        layers.identifiers = (a.identifiers.length === 0 && b.identifiers.length === 0) ? null
            : (a.identifiers.some(id => b.identifiers.includes(id)) ? 1 : 0);

        const metaFields = [
            [a.title, b.title], [a.documentType, b.documentType], [a.language, b.language],
            [a.date, b.date], [a.owner, b.owner], [a.issuer, b.issuer]
        ].filter(([x, y]) => x || y);
        layers.metadata = metaFields.length === 0 ? null
            : metaFields.filter(([x, y]) => x && y && x === y).length / metaFields.length;

        const entityCats = Object.keys(a.entities);
        const entityScores = entityCats.map(cat => jaccard(a.entities[cat], b.entities[cat])).filter(s => s !== null);
        layers.entities = entityScores.length === 0 ? null : entityScores.reduce((s, v) => s + v, 0) / entityScores.length;

        layers.summary = jaccard(a.summaryWords, b.summaryWords);

        const kwScore = jaccard(a.keywords, b.keywords);
        const topicScore = (a.topic || b.topic) ? (a.topic && b.topic && a.topic === b.topic ? 1 : 0) : null;
        const sectionScore = (a.sectionTypes.length || b.sectionTypes.length)
            ? (1 - Math.abs(a.sectionTypes.length - b.sectionTypes.length) / Math.max(a.sectionTypes.length, b.sectionTypes.length, 1)) : null;
        const kwParts = [kwScore, topicScore, sectionScore].filter(s => s !== null);
        layers.keywords = kwParts.length === 0 ? null : kwParts.reduce((s, v) => s + v, 0) / kwParts.length;

        layers.content = jaccard(wordShingles(a.rawText), wordShingles(b.rawText));

        const applicable = Object.entries(layers).filter(([, v]) => v !== null);
        const overall = applicable.length === 0 ? null
            : applicable.reduce((sum, [k, v]) => sum + v * LAYER_WEIGHTS[k], 0) / applicable.reduce((sum, [k]) => sum + LAYER_WEIGHTS[k], 0);

        return { layers, overall, applicableLayers: applicable.map(([k]) => k) };
    }

    function detectConflict(a, b, layerResult) {
        if (layerResult.layers.identifiers !== 1) return null;
        const reasons = [];
        if (a.title && b.title && a.title !== b.title) reasons.push("Different title");
        if (a.issuer && b.issuer && a.issuer !== b.issuer) reasons.push("Different issuer");
        if (a.owner && b.owner && a.owner !== b.owner) reasons.push("Different owner");
        if (a.total !== null && b.total !== null && a.total !== b.total) reasons.push("Different totals");
        if (a.date && b.date && a.date !== b.date) reasons.push("Different dates");
        return reasons.length ? reasons : null;
    }

    function classifyCandidate(newProfile, candidateProfile, fingerprintMatch) {
        if (fingerprintMatch) {
            return { status: "EXACT_DUPLICATE", similarity: 100, matchedLayers: ["fingerprint"], reasons: [] };
        }
        const layerResult = compareLayers(newProfile, candidateProfile);
        if (layerResult.overall === null) {
            return { status: "UNKNOWN", similarity: 0, matchedLayers: [], reasons: ["Insufficient data on both documents to compare."] };
        }
        const similarity = Math.round(layerResult.overall * 100);
        const conflictReasons = detectConflict(newProfile, candidateProfile, layerResult);
        if (conflictReasons) {
            return { status: "CONFLICT", similarity, matchedLayers: layerResult.applicableLayers, reasons: conflictReasons };
        }
        if (similarity >= 90) {
            const identifierMatch = layerResult.layers.identifiers === 1;
            const dateDiffers = newProfile.updatedAt && candidateProfile.updatedAt && newProfile.updatedAt !== candidateProfile.updatedAt;
            if (identifierMatch && (dateDiffers || similarity < 100)) {
                const versionType = layerResult.layers.content !== null && layerResult.layers.content >= 0.95 ? "minor revision" : "major revision";
                return { status: "UPDATED_VERSION", similarity, matchedLayers: layerResult.applicableLayers, reasons: [], versionType };
            }
            return { status: "NEAR_DUPLICATE", similarity, matchedLayers: layerResult.applicableLayers, reasons: [] };
        }
        if (similarity >= 60) {
            return { status: "NEAR_DUPLICATE", similarity, matchedLayers: layerResult.applicableLayers, reasons: [] };
        }
        return { status: "NEW_DOCUMENT", similarity, matchedLayers: layerResult.applicableLayers, reasons: [] };
    }

    const STATUS_PRIORITY = Object.freeze({ CONFLICT: 5, EXACT_DUPLICATE: 4, UPDATED_VERSION: 3, NEAR_DUPLICATE: 2, UNKNOWN: 1, NEW_DOCUMENT: 0 });

    const RECOMMENDATIONS = Object.freeze({
        NEW_DOCUMENT: "Store as new document",
        EXACT_DUPLICATE: "Reject duplicate",
        UPDATED_VERSION: "Replace previous version",
        NEAR_DUPLICATE: "Review manually",
        CONFLICT: "Review manually",
        UNKNOWN: "Review manually"
    });

    class CozyDuplicateDetection {
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #candidateProvider = null;
        #status = "Ready";
        #resource = { analysisCount: 0, duplicateCount: 0, versionCount: 0, conflictCount: 0, similaritySum: 0, similarityCount: 0, processingTimeSumMs: 0 };
        #diagnostics = { analysesRun: 0, analysesFailed: 0, unknownResults: 0, eventsEmitted: 0, errorsHidden: 0 };

        getVersion() { return DD_VERSION; }
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

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[DuplicateDetection] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[DuplicateDetection] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[DuplicateDetection] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_err) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_err) { this.#diagnostics.errorsHidden++; } } return true; }

        /**
         * registerCandidateProvider(fn)
         *   Real, disclosed, empty extension hook — fn(newProfileInput)
         *   must return/resolve an array of { documentRecord,
         *   understanding, fingerprint? } candidates. Never invented;
         *   analyze() only compares against what a real provider (or an
         *   explicit `candidates` option) actually supplies.
         */
        registerCandidateProvider(fn) {
            if (typeof fn !== "function") throw new TypeError("[DuplicateDetection] registerCandidateProvider(): fn must be a function.");
            this.#candidateProvider = fn;
            this.#logAudit("CANDIDATE_PROVIDER_REGISTERED", "candidate provider attached");
        }

        /**
         * analyze({documentRecord, understanding}, {candidates})
         *   Strict two-field domain input per spec. `candidates` (or a
         *   registered provider) supplies real comparison context;
         *   with neither, the honest result is NEW_DOCUMENT against an
         *   empty comparedDocuments list.
         */
        async analyze(input, rawOptions = {}) {
            const startedAt = Date.now();
            this.#status = "Running";
            const options = sanitizeObject(rawOptions);
            const clean = sanitizeObject(input);

            if (!clean.documentRecord || typeof clean.documentRecord !== "object") {
                this.#diagnostics.analysesFailed++;
                this.#status = "Failed";
                return { available: false, reason: "documentRecord is required — Duplicate Detection never performs its own OCR or classification." };
            }

            const record = clean.documentRecord;
            const understanding = (clean.understanding && typeof clean.understanding === "object") ? clean.understanding : {};
            const newProfile = extractProfile(record, understanding);
            const fingerprint = await computeFingerprint(buildCanonicalString(record, understanding));

            let candidates = Array.isArray(options.candidates) ? options.candidates : null;
            if (!candidates && this.#candidateProvider) {
                try { candidates = await this.#candidateProvider({ documentRecord: record, understanding }); }
                catch (_err) { candidates = []; this.#logAudit("CANDIDATE_PROVIDER_FAILED", _err && _err.message); }
            }
            candidates = Array.isArray(candidates) ? candidates : [];

            const comparedDocuments = [];
            const exactMatches = [];
            const nearMatches = [];
            const versionMatches = [];
            const conflicts = [];
            let best = null;

            for (const candidate of candidates) {
                const candRecord = candidate && candidate.documentRecord;
                const candUnderstanding = (candidate && candidate.understanding) || {};
                if (!candRecord || typeof candRecord !== "object") continue;
                const candidateProfile = extractProfile(candRecord, candUnderstanding);
                const candidateFingerprint = candidate.fingerprint || await computeFingerprint(buildCanonicalString(candRecord, candUnderstanding));
                const fingerprintMatch = Boolean(fingerprint) && Boolean(candidateFingerprint) && fingerprint === candidateFingerprint;

                const result = classifyCandidate(newProfile, candidateProfile, fingerprintMatch);
                const entry = { documentId: candidateProfile.documentId, similarity: result.similarity, matchedLayers: result.matchedLayers };
                comparedDocuments.push(entry);

                if (result.status === "EXACT_DUPLICATE") exactMatches.push(entry);
                else if (result.status === "NEAR_DUPLICATE") nearMatches.push(entry);
                else if (result.status === "UPDATED_VERSION") versionMatches.push({ ...entry, versionType: result.versionType });
                else if (result.status === "CONFLICT") conflicts.push({ documentId: candidateProfile.documentId, reasons: result.reasons });

                if (!best || STATUS_PRIORITY[result.status] > STATUS_PRIORITY[best.status]
                    || (STATUS_PRIORITY[result.status] === STATUS_PRIORITY[best.status] && result.similarity > best.similarity)) {
                    best = result;
                }
            }

            let duplicateStatus, confidence;
            if (candidates.length === 0) {
                const hasAnyBasis = newProfile.identifiers.length || newProfile.rawText || newProfile.keywords.length || newProfile.summaryWords.length;
                duplicateStatus = hasAnyBasis ? "NEW_DOCUMENT" : "UNKNOWN";
                confidence = 0;
            } else {
                duplicateStatus = best ? best.status : "NEW_DOCUMENT";
                confidence = best ? best.similarity : 0;
            }

            const processingTimeMs = Date.now() - startedAt;
            this.#resource.analysisCount++;
            this.#resource.processingTimeSumMs += processingTimeMs;
            if (duplicateStatus === "EXACT_DUPLICATE" || duplicateStatus === "NEAR_DUPLICATE") this.#resource.duplicateCount++;
            if (duplicateStatus === "UPDATED_VERSION") this.#resource.versionCount++;
            if (duplicateStatus === "CONFLICT") this.#resource.conflictCount++;
            if (duplicateStatus === "UNKNOWN") this.#diagnostics.unknownResults++;
            if (candidates.length > 0) { this.#resource.similaritySum += confidence; this.#resource.similarityCount++; }

            this.#diagnostics.analysesRun++;
            this.#status = "Idle";
            this.#logAudit("ANALYSIS_COMPLETE", `${newProfile.documentId || "unknown"} -> ${duplicateStatus}`);
            this.emit("duplicate:analyzed", { documentId: newProfile.documentId, duplicateStatus });

            return {
                available: true,
                duplicateStatus,
                confidence,
                fingerprint,
                comparedDocuments,
                exactMatches,
                nearMatches,
                versionMatches,
                conflicts,
                recommendation: RECOMMENDATIONS[duplicateStatus],
                diagnostics: {
                    candidatesCompared: candidates.length,
                    processingTimeMs,
                    warnings: fingerprint ? [] : ["Fingerprint unavailable (Web Crypto not present in this environment)."]
                }
            };
        }

        /**
         * validate(result) — real, computable checks on the analysis
         * output itself. Never re-validates classification or OCR.
         */
        validate(result) {
            const warnings = [];
            if (!result || result.available !== true) return { valid: false, warnings: ["No analysis result provided."] };
            if (!STATUSES.includes(result.duplicateStatus)) warnings.push(`Unrecognized duplicateStatus: ${result.duplicateStatus}`);
            if (result.duplicateStatus === "CONFLICT" && result.conflicts.length === 0) warnings.push("CONFLICT status with no recorded conflict reasons.");
            if (typeof result.confidence !== "number" || result.confidence < 0 || result.confidence > 100) warnings.push("Confidence out of expected 0-100 range.");
            return { valid: warnings.length === 0, warnings };
        }

        /** refresh() — real re-analysis, not a restart/reload. */
        async refresh(input, options = {}) {
            this.#logAudit("REFRESH_REQUESTED", input && input.documentRecord ? (input.documentRecord.documentId || "unknown") : "unknown");
            return this.analyze(input, options);
        }

        getDiagnosticsReport() {
            return Object.freeze({ ...this.#diagnostics, version: DD_VERSION, generatedAt: new Date().toISOString() });
        }

        /** Internal equivalent of "Resource Manager" tracking — real, own counters; no external service fabricated. */
        getResourceReport() {
            const r = this.#resource;
            return Object.freeze({
                analysisCount: r.analysisCount, duplicateCount: r.duplicateCount, versionCount: r.versionCount, conflictCount: r.conflictCount,
                averageSimilarity: r.similarityCount ? Number((r.similaritySum / r.similarityCount).toFixed(2)) : null,
                averageProcessingTimeMs: r.analysisCount ? Number((r.processingTimeSumMs / r.analysisCount).toFixed(2)) : null
            });
        }

        /** Internal equivalent of "Health Engine" states — Ready/Running/Idle/Failed/Healthy, all real internal state. */
        getHealthReport() {
            const healthy = this.#diagnostics.analysesFailed === 0;
            return Object.freeze({ status: this.#status, healthy, version: DD_VERSION });
        }
    }

    window.CozyOS.DuplicateDetection = new CozyDuplicateDetection();
    Object.freeze(window.CozyOS.DuplicateDetection);

    // Real coordinator registration — same established pattern as
    // DocumentEngine and DocumentUnderstanding. registerManifest() is
    // still not a real API anywhere in this codebase (re-verified), so
    // it is not called.
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
        name: "DuplicateDetection", category: "Platform Service", icon: "duplicate-detection.svg",
        description: "Duplicate Detection — layered similarity analysis, versioning, and fingerprinting over DocumentEngine + DocumentUnderstanding outputs. Never classifies, never performs OCR, never stores documents.",
        capabilities: ["duplicate-detection", "similarity-analysis", "version-detection", "fingerprinting"]
    });

    let kernelRegistrationAttempted = false;
    async function registerWithKernel() {
        if (kernelRegistrationAttempted) return;
        const bootstrap = window.CozyOS?.Kernel?.Bootstrap;
        if (!bootstrap) return;
        kernelRegistrationAttempted = true;
        try {
            await bootstrap.registerService({ name: "DuplicateDetection", version: DD_VERSION, apiVersion: "1.0.0", mandatory: false, dependencies: ["DocumentEngine", "DocumentUnderstanding"] });
            bootstrap.initializeService("DuplicateDetection");
            await bootstrap.verifyService("DuplicateDetection", async () => window.CozyOS.DuplicateDetection.getVersion() === DD_VERSION);
            bootstrap.startService("DuplicateDetection");
        } catch (_err) { /* non-fatal — DuplicateDetection remains fully functional standalone even if Kernel registration fails */ }
    }
    registerWithKernel();
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
        document.addEventListener("cozyos:kernel-bridge-ready", registerWithKernel, { once: true });
    }
})();
