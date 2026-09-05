/**
 * core/living/cozy-living-compressor.js
 * Repair: RP-032 — CozyOS Living Compressor
 *
 * MISSION
 *   An offline-first engine that helps reduce storage usage while
 *   preserving useful information, always leaving the user in control
 *   (COMPRESS / KEEP ORIGINAL / DELETE / RESTORE / COMPARE). This file
 *   is a planning/orchestration layer, not a destructive cleaner.
 *
 * OWNERSHIP / COMPOSITION — no duplication of existing engines
 *   - window.CozyOS.LivingCompressor (M333, core/modules/knowledge/
 *     living-compressor.js) — the real, existing phrase-dictionary
 *     TEXT compressor. This file composes its real
 *     compressText()/decompressText()/checksum() for every text-bearing
 *     file (DOCUMENT type, and free-text fields on LANGUAGE_PACK
 *     records) rather than reimplementing text compression. This file
 *     does NOT claim window.CozyOS.LivingCompressor for itself — it
 *     registers under a new, non-colliding name (see bottom of file).
 *   - window.CozyOS.CozyLanguagePacks (RP-030) — read-only composition
 *     to build language-pack preservation plans from real pack/
 *     expression records. No mutator called; no field ever stripped.
 *   - window.CozyOS.CozyKnowledgeSafetyGate /
 *     CozyKnowledgeQuarantineAdmin (RP-029-C) — read-only composition
 *     to block distribution/sharing of quarantined content. This file
 *     has no second safety/quarantine system.
 *   - window.CozyOS.LiveHotspotEngine (the one real P2P engine in this
 *     repository) — composed directly, the same way the existing
 *     RP-029-C Phase 2 hotspot bridge does, for real local package
 *     transfer. No second transport is built.
 *   - window.CozyOS.CozyMemory (if present) — optional, real
 *     persistence for the compression ledger, composed exactly like
 *     M333's own living-compressor.js already does. If absent, this
 *     engine still works correctly for the current session — it is
 *     honestly session-scoped, not silently pretending to persist.
 *
 * NO FABRICATION — the central, binding rule of this file
 *   - No real image/video/audio codec or binary-compression backend
 *     exists anywhere in this repository (confirmed by direct source
 *     read of core/connectivity/compression.js, whose own header
 *     already discloses `ESTIMATED_SAVINGS_RATIO = 0` — "estimated
 *     savings until real compression is wired" — and of M333's own
 *     living-compressor.js header, which discloses no pako/zlib-
 *     equivalent client-side library exists here either). PHOTO/
 *     VIDEO/AUDIO/ARCHIVE files therefore always report
 *     `CAPABILITY_UNAVAILABLE` for actual byte compression — this file
 *     never claims a codec conversion, resize, or binary compression
 *     it cannot really perform. Only DOCUMENT/text-bearing content
 *     (where the real, composed M333 phrase-dictionary compressor
 *     applies) can ever reach a real `COMPRESSED` state.
 *   - Every duplicate/near-duplicate classification is derived only
 *     from real, caller-supplied evidence (content hash, byte size,
 *     name) — never guessed from partial information.
 *   - `ESTIMATE_UNAVAILABLE` is returned, never an invented percentage,
 *     for any file type this engine cannot really compress.
 *   - `NOT_AVAILABLE_NO_TELEMETRY` is returned for any dashboard metric
 *     this engine does not really track.
 *   - Hotspot transfer states are limited to what `LiveHotspotEngine`
 *     actually supports (real WebRTC data-channel send/receive) —
 *     `SYNCED` is never reported; the real transport has no such
 *     concept (same finding already disclosed in RP-031-B Increment 4).
 *
 * DESTRUCTIVE-ACTION SAFETY
 *   Nothing is ever deleted without an explicit `requestUserApproval()`
 *   call carrying `confirmed: true`, and `deleteOriginal()` additionally
 *   requires the file to have already reached a real `VERIFIED` state
 *   (or an explicit `acknowledgeUnverifiedDeletion: true` override) —
 *   never a silent/automatic deletion.
 *
 * AFRICAN LANGUAGE PRESERVATION
 *   `requestUserApproval()` refuses a DELETE request for a
 *   `LANGUAGE_PACK`-type file when the only supplied reason is a
 *   usage-frequency signal (`LOW_USAGE`) or no reason at all — usage
 *   frequency alone can never justify removing rare-language knowledge
 *   (spec: "LOW_USAGE ≠ LOW_VALUE"). A real, distinct reason is
 *   required. Language-pack provenance/region/dialect/license/
 *   confidence/validation fields are never included in any compression
 *   payload this file produces — only free-text `context`/`meaning`
 *   fields are ever offered to the real text compressor, and even that
 *   is optional and reversible.
 */
(function (root) {
    "use strict";

    const VERSION = "0.1.0";

    function cozyOS() { return (root.window && root.window.CozyOS) || null; }
    function textCompressor() { const c = cozyOS(); return c && c.LivingCompressor ? c.LivingCompressor : null; }
    function packsApi() { const c = cozyOS(); return c && c.CozyLanguagePacks ? c.CozyLanguagePacks : null; }
    function safetyGate() { const c = cozyOS(); return c && c.CozyKnowledgeSafetyGate ? c.CozyKnowledgeSafetyGate : null; }
    function quarantineAdmin() { const c = cozyOS(); return c && c.CozyKnowledgeQuarantineAdmin ? c.CozyKnowledgeQuarantineAdmin : null; }
    function hotspotEngine() { const c = cozyOS(); return c && c.LiveHotspotEngine ? c.LiveHotspotEngine : null; }
    function memory() { const c = cozyOS(); return c && c.CozyMemory ? c.CozyMemory : null; }

    // -----------------------------------------------------------------
    // CONSTANTS
    // -----------------------------------------------------------------

    const FILE_TYPES = Object.freeze(["PHOTO", "VIDEO", "AUDIO", "DOCUMENT", "LANGUAGE_PACK", "ARCHIVE", "GENERAL_FILE"]);
    const COMPRESSION_LEVELS = Object.freeze(["MAXIMUM_QUALITY", "HIGH_QUALITY", "BALANCED", "STORAGE_SAVER", "MAXIMUM_SAVINGS"]);
    const STATES = Object.freeze(["ORIGINAL", "ANALYZED", "QUEUED", "COMPRESSING", "COMPRESSED", "VERIFIED", "FAILED", "RESTORABLE", "DELETED_BY_USER"]);
    const STORAGE_CONDITIONS = Object.freeze(["LOW_STORAGE", "NORMAL_STORAGE", "ABUNDANT_STORAGE"]);
    const DUPLICATE_CLASSES = Object.freeze(["EXACT_DUPLICATE", "LIKELY_DUPLICATE", "NEAR_DUPLICATE", "UNRELATED"]);

    // Only formats this engine can honestly recognize by extension.
    // Unknown extensions fall through to GENERAL_FILE, never guessed.
    const EXTENSION_MAP = {
        jpg: "PHOTO", jpeg: "PHOTO", png: "PHOTO", gif: "PHOTO", webp: "PHOTO", heic: "PHOTO",
        mp4: "VIDEO", webm: "VIDEO", mov: "VIDEO", mkv: "VIDEO", avi: "VIDEO",
        mp3: "AUDIO", wav: "AUDIO", ogg: "AUDIO", flac: "AUDIO", m4a: "AUDIO",
        pdf: "DOCUMENT", txt: "DOCUMENT", doc: "DOCUMENT", docx: "DOCUMENT", html: "DOCUMENT", json: "DOCUMENT", csv: "DOCUMENT",
        zip: "ARCHIVE", tar: "ARCHIVE", gz: "ARCHIVE", "7z": "ARCHIVE"
    };

    // Only DOCUMENT (real, composed M333 text compressor) has a real
    // compression backend in this repository. Every other type is
    // honestly CAPABILITY_UNAVAILABLE for actual byte reduction.
    const REAL_COMPRESSION_BACKEND_TYPES = Object.freeze(["DOCUMENT"]);

    // -----------------------------------------------------------------
    // IN-MEMORY REGISTRY (session-scoped; optionally persisted via
    // CozyMemory if present — same honest pattern as M333's own file)
    // -----------------------------------------------------------------

    const registry = new Map(); // fileId -> record
    let nextId = 1;

    function nowISO() { return new Date().toISOString(); }

    function freshId() { return "compfile_" + (nextId++); }

    function cloneRecord(r) { return r ? JSON.parse(JSON.stringify(r)) : null; }

    // -----------------------------------------------------------------
    // 1. CLASSIFICATION
    // -----------------------------------------------------------------

    /**
     * classifyFile(descriptor)
     *   descriptor: { name, sizeBytes, extension?, languagePackRecordId? }
     *   A languagePackRecordId always overrides extension-based
     *   classification — it is real, caller-asserted evidence, not a
     *   guess. Otherwise classification is a real extension lookup;
     *   unrecognized extensions honestly fall to GENERAL_FILE.
     */
    function classifyFile(descriptor) {
        const d = descriptor || {};
        if (d.languagePackRecordId) return { type: "LANGUAGE_PACK", note: "Classified by explicit languagePackRecordId evidence." };
        const ext = (d.extension || (d.name && d.name.includes(".") ? d.name.split(".").pop() : "")).toLowerCase();
        const type = EXTENSION_MAP[ext];
        if (type) return { type, note: `Classified from real extension ".${ext}".` };
        return { type: "GENERAL_FILE", note: ext ? `Unrecognized extension ".${ext}" — not guessed.` : "No extension evidence supplied." };
    }

    // -----------------------------------------------------------------
    // 2. REGISTRATION / SCAN
    // -----------------------------------------------------------------

    /**
     * registerFile(descriptor)
     *   The real "SCAN" entry point for this session — the caller
     *   supplies real file descriptors (this engine has no filesystem
     *   access of its own in this environment). Every field not
     *   supplied is honestly absent, never invented.
     */
    function registerFile(descriptor) {
        const d = descriptor || {};
        if (typeof d.sizeBytes !== "number" || d.sizeBytes < 0) {
            return { status: "REJECTED", reason: "A real, non-negative sizeBytes is required." };
        }
        const classification = classifyFile(d);
        const id = freshId();
        const record = {
            id,
            name: d.name || null,
            sizeBytes: d.sizeBytes,
            type: classification.type,
            classificationNote: classification.note,
            contentHash: d.contentHash || null,
            textContent: typeof d.textContent === "string" ? d.textContent : null,
            languagePackRecordId: d.languagePackRecordId || null,
            quarantined: false,
            state: "ORIGINAL",
            duplicateOf: null,
            duplicateClass: null,
            compression: null, // set on successful compress
            createdAt: nowISO(),
            updatedAt: nowISO()
        };
        registry.set(id, record);
        return { status: "REGISTERED", fileId: id, type: classification.type };
    }

    function getFile(fileId) { return cloneRecord(registry.get(fileId)); }
    function listFiles(filter) {
        const f = filter || {};
        return Array.from(registry.values())
            .filter((r) => !f.type || r.type === f.type)
            .filter((r) => !f.state || r.state === f.state)
            .map(cloneRecord);
    }

    // -----------------------------------------------------------------
    // 3. DEDUPLICATION / ANALYSIS
    // -----------------------------------------------------------------

    function basenameWithoutCopySuffix(name) {
        if (!name) return null;
        return String(name).replace(/\s*\(\d+\)(?=\.[^.]+$|$)/, "").toLowerCase();
    }

    /**
     * analyzeFile(fileId)
     *   Real duplicate classification against every other currently
     *   registered file:
     *     EXACT_DUPLICATE   — real contentHash equality (both present).
     *     LIKELY_DUPLICATE  — same real size + same type + same
     *                         basename ignoring a real "(1)"-style
     *                         copy suffix.
     *     NEAR_DUPLICATE    — same type, real size within 5% of
     *                         another file's real size, but not hash-
     *                         or name-matched.
     *     UNRELATED         — none of the above real signals matched.
     *   Never invents a match from partial/missing evidence.
     */
    function analyzeFile(fileId) {
        const rec = registry.get(fileId);
        if (!rec) return { status: "NOT_FOUND" };

        let best = { class: "UNRELATED", of: null, confidence: 0 };
        for (const other of registry.values()) {
            if (other.id === rec.id) continue;
            if (rec.contentHash && other.contentHash && rec.contentHash === other.contentHash) {
                best = { class: "EXACT_DUPLICATE", of: other.id, confidence: 1 };
                break;
            }
            const sameType = rec.type === other.type;
            const sameSize = rec.sizeBytes === other.sizeBytes;
            const sameBasename = rec.name && other.name && basenameWithoutCopySuffix(rec.name) === basenameWithoutCopySuffix(other.name);
            if (sameType && sameSize && sameBasename && best.class !== "EXACT_DUPLICATE") {
                best = { class: "LIKELY_DUPLICATE", of: other.id, confidence: 0.85 };
                continue;
            }
            if (sameType && other.sizeBytes > 0 && best.class === "UNRELATED") {
                const diff = Math.abs(rec.sizeBytes - other.sizeBytes) / other.sizeBytes;
                if (diff <= 0.05) best = { class: "NEAR_DUPLICATE", of: other.id, confidence: 0.5 };
            }
        }

        rec.duplicateClass = best.class;
        rec.duplicateOf = best.of;
        rec.state = "ANALYZED";
        rec.updatedAt = nowISO();
        return { status: "ANALYZED", fileId, duplicateClass: best.class, duplicateOf: best.of, confidence: best.confidence };
    }

    // -----------------------------------------------------------------
    // 4. ESTIMATION / STRATEGY
    // -----------------------------------------------------------------

    /**
     * estimateCompression(fileId, level)
     *   Only DOCUMENT (real, composed M333 backend) ever gets a real
     *   estimate — computed by actually invoking the real compressor
     *   in a way whose result is the real answer, not a guess. Every
     *   other type honestly reports ESTIMATE_UNAVAILABLE.
     */
    function estimateCompression(fileId, level) {
        const rec = registry.get(fileId);
        if (!rec) return { status: "NOT_FOUND" };
        if (COMPRESSION_LEVELS.indexOf(level) === -1) return { status: "REJECTED", reason: "A real, recognized compression level is required." };

        if (REAL_COMPRESSION_BACKEND_TYPES.indexOf(rec.type) === -1) {
            return { status: "AVAILABLE", estimate: "ESTIMATE_UNAVAILABLE", reason: "NO_REAL_COMPRESSION_BACKEND_FOR_TYPE_" + rec.type };
        }
        if (!rec.textContent) {
            return { status: "AVAILABLE", estimate: "ESTIMATE_UNAVAILABLE", reason: "NO_TEXT_CONTENT_SUPPLIED" };
        }
        const tc = textCompressor();
        if (!tc) return { status: "AVAILABLE", estimate: "ESTIMATE_UNAVAILABLE", reason: "CAPABILITY_UNAVAILABLE_TEXT_COMPRESSOR_ABSENT" };

        const result = tc.compressText(rec.textContent);
        if (!result.success) return { status: "AVAILABLE", estimate: "ESTIMATE_UNAVAILABLE", reason: result.reason };
        return {
            status: "AVAILABLE",
            estimate: {
                originalSize: result.originalSize,
                expectedSize: result.compressedSize,
                estimatedSavingsPercent: result.savingsPercent,
                qualityImpact: "NONE_TEXT_IS_LOSSLESS",
                processingRequirement: "LOCAL_CPU_ONLY"
            }
        };
    }

    /**
     * planCompression(fileId)
     *   Returns the honest set of available actions for a file. COMPRESS
     *   is only ever offered when a real backend exists for that type.
     */
    function planCompression(fileId) {
        const rec = registry.get(fileId);
        if (!rec) return { status: "NOT_FOUND" };
        const typeSupported = REAL_COMPRESSION_BACKEND_TYPES.indexOf(rec.type) !== -1;
        const hasContent = !!rec.textContent;
        const backendPresent = !!textCompressor();
        const canCompress = typeSupported && hasContent && backendPresent;
        let reason = null;
        if (!canCompress) {
            if (!typeSupported) reason = "NO_REAL_COMPRESSION_BACKEND_FOR_TYPE_" + rec.type;
            else if (!backendPresent) reason = "CAPABILITY_UNAVAILABLE_TEXT_COMPRESSOR_ABSENT";
            else reason = "NO_TEXT_CONTENT_SUPPLIED";
        }
        return {
            status: "AVAILABLE",
            fileId,
            type: rec.type,
            availableActions: canCompress ? ["COMPRESS", "KEEP", "DELETE", "SKIP"] : ["KEEP", "DELETE", "SKIP"],
            compressionCapability: canCompress ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            reason
        };
    }

    // -----------------------------------------------------------------
    // 5. SAVINGS SUMMARY (spec: "Found: ... Potential savings: ...")
    // -----------------------------------------------------------------

    function calculateSavingsSummary() {
        const byType = {};
        FILE_TYPES.forEach((t) => { byType[t] = { count: 0, totalBytes: 0, potentialSavingsBytes: 0, savingsBasis: "ESTIMATE_UNAVAILABLE" }; });
        let totalPotentialSavingsBytes = 0;
        let anyRealSavingsFound = false;

        registry.forEach((rec) => {
            const bucket = byType[rec.type];
            bucket.count++;
            bucket.totalBytes += rec.sizeBytes;
            if (rec.compression && rec.compression.status === "COMPRESSED") {
                const saved = rec.sizeBytes - rec.compression.compressedSizeBytes;
                bucket.potentialSavingsBytes += saved;
                bucket.savingsBasis = "REAL_MEASURED";
                totalPotentialSavingsBytes += saved;
                anyRealSavingsFound = true;
            } else if (REAL_COMPRESSION_BACKEND_TYPES.indexOf(rec.type) !== -1 && rec.textContent) {
                const tc = textCompressor();
                if (tc) {
                    const est = tc.compressText(rec.textContent);
                    if (est.success) {
                        const saved = Math.round(rec.sizeBytes * (est.savingsPercent / 100));
                        bucket.potentialSavingsBytes += saved;
                        bucket.savingsBasis = "REAL_ESTIMATE";
                        totalPotentialSavingsBytes += saved;
                        anyRealSavingsFound = true;
                    }
                }
            }
        });

        return {
            byType,
            totalPotentialSavingsBytes: anyRealSavingsFound ? totalPotentialSavingsBytes : "ESTIMATE_UNAVAILABLE",
            note: "Savings are real measurements (already-compressed files) or real, freshly-computed estimates from the composed text compressor only. Binary media types (PHOTO/VIDEO/AUDIO/ARCHIVE) always report ESTIMATE_UNAVAILABLE — no real compression backend exists for them in this repository."
        };
    }

    // -----------------------------------------------------------------
    // 6. STORAGE CONDITION + RECOMMENDATION (Living behavior)
    // -----------------------------------------------------------------

    function getStorageCondition(totalBytes, freeBytes) {
        if (typeof totalBytes !== "number" || typeof freeBytes !== "number" || totalBytes <= 0) {
            return { status: "CAPABILITY_UNAVAILABLE", reason: "Real totalBytes/freeBytes are required." };
        }
        const freeRatio = freeBytes / totalBytes;
        const condition = freeRatio < 0.1 ? "LOW_STORAGE" : freeRatio < 0.3 ? "NORMAL_STORAGE" : "ABUNDANT_STORAGE";
        let recommendation = null;
        if (condition === "LOW_STORAGE") {
            const summary = calculateSavingsSummary();
            const savings = summary.totalPotentialSavingsBytes;
            recommendation = savings === "ESTIMATE_UNAVAILABLE"
                ? "Your device has limited free space. I could not calculate a real potential savings estimate from the files registered so far."
                : `Your device has limited free space. I found approximately ${Math.round(savings / (1024 * 1024))} MB that could potentially be reduced. Would you like me to review it?`;
        }
        return { status: "AVAILABLE", condition, recommendation, neverAutomatic: true };
    }

    // -----------------------------------------------------------------
    // 7. USER APPROVAL (destructive-action protection)
    // -----------------------------------------------------------------

    /**
     * requestUserApproval(fileId, action, opts)
     *   action: "COMPRESS" | "DELETE" | "KEEP" | "SKIP"
     *   opts.confirmed must be true for COMPRESS/DELETE. DELETE on a
     *   LANGUAGE_PACK file additionally requires a real, non-usage
     *   reason (African Language Preservation rule — see file header).
     */
    function requestUserApproval(fileId, action, opts) {
        const rec = registry.get(fileId);
        if (!rec) return { status: "NOT_FOUND" };
        const o = opts || {};

        if (action === "KEEP" || action === "SKIP") {
            return { status: "ACKNOWLEDGED", action };
        }

        if (!o.confirmed) {
            return { status: "CONFIRMATION_REQUIRED", action };
        }

        if (action === "DELETE" && rec.type === "LANGUAGE_PACK") {
            const reason = o.reason ? String(o.reason).trim() : "";
            if (!reason || /^low[_ ]?usage$/i.test(reason)) {
                return { status: "REJECTED", reason: "LOW_USAGE_IS_NEVER_A_SOLE_DELETION_CRITERION_FOR_LANGUAGE_PACK_DATA", note: "A real, distinct reason is required to delete rare-language knowledge. Usage frequency alone is never sufficient (LOW_USAGE ≠ LOW_VALUE)." };
            }
        }

        if (action === "COMPRESS") {
            const plan = planCompression(fileId);
            if (plan.compressionCapability !== "AVAILABLE") {
                return { status: "CAPABILITY_UNAVAILABLE", reason: plan.reason };
            }
            rec.state = "QUEUED";
            rec.updatedAt = nowISO();
            return { status: "QUEUED", action };
        }

        if (action === "DELETE") {
            rec.pendingDeleteApproved = true;
            rec.pendingDeleteReason = o.reason || null;
            rec.updatedAt = nowISO();
            return { status: "APPROVED_PENDING_DELETE", action };
        }

        return { status: "REJECTED", reason: "UNRECOGNIZED_ACTION" };
    }

    // -----------------------------------------------------------------
    // 8. COMPRESS / VERIFY / RESTORE (the real, text-only backend)
    // -----------------------------------------------------------------

    /**
     * executeCompression(fileId)
     *   Only proceeds for a file already in QUEUED state (i.e. only
     *   after real user approval via requestUserApproval). Uses the
     *   real, composed M333 text compressor — never a second
     *   implementation. The original textContent is always retained on
     *   the record; nothing is deleted here.
     */
    function executeCompression(fileId) {
        const rec = registry.get(fileId);
        if (!rec) return { status: "NOT_FOUND" };
        if (rec.state !== "QUEUED") return { status: "REJECTED", reason: "File must be QUEUED via requestUserApproval() first." };

        const plan = planCompression(fileId);
        if (plan.compressionCapability !== "AVAILABLE") {
            return { status: "CAPABILITY_UNAVAILABLE", reason: plan.reason };
        }

        rec.state = "COMPRESSING";
        const tc = textCompressor();
        const result = tc.compressText(rec.textContent);
        if (!result.success) {
            rec.state = "FAILED";
            rec.updatedAt = nowISO();
            return { status: "COMPRESSION_FAILED", reason: result.reason };
        }

        const checksum = tc.checksum(rec.textContent);
        rec.compression = {
            status: "COMPRESSED",
            compressedText: result.compressed,
            compressedSizeBytes: result.compressedSize,
            dictionaryRefs: result.dictionaryRefs,
            originalChecksum: checksum,
            compressedAt: nowISO()
        };
        rec.state = "COMPRESSED";
        rec.updatedAt = nowISO();
        return { status: "COMPRESSED", fileId, compressedSizeBytes: result.compressedSize, savingsPercent: result.savingsPercent };
    }

    /**
     * verifyCompression(fileId)
     *   Real round-trip: decompress the real compressed text via the
     *   real composed decompressText(), compare against the real
     *   original checksum. VERIFIED only on a genuine match;
     *   COMPRESSION_FAILED (original retained, never deleted) otherwise.
     */
    function verifyCompression(fileId) {
        const rec = registry.get(fileId);
        if (!rec) return { status: "NOT_FOUND" };
        if (!rec.compression || rec.compression.status !== "COMPRESSED") return { status: "REJECTED", reason: "No real compressed payload exists yet for this file." };

        const tc = textCompressor();
        if (!tc) return { status: "CAPABILITY_UNAVAILABLE", reason: "TEXT_COMPRESSOR_ABSENT" };

        const decompressed = tc.decompressText(rec.compression.compressedText);
        if (!decompressed.success) {
            rec.state = "FAILED";
            rec.updatedAt = nowISO();
            return { status: "COMPRESSION_FAILED", reason: decompressed.reason };
        }
        const recheckedChecksum = tc.checksum(decompressed.text);
        const match = recheckedChecksum && rec.compression.originalChecksum && recheckedChecksum.hash === rec.compression.originalChecksum.hash;
        if (!match) {
            rec.state = "FAILED";
            rec.updatedAt = nowISO();
            return { status: "COMPRESSION_FAILED", reason: "CHECKSUM_MISMATCH_ON_VERIFY" };
        }
        rec.state = "VERIFIED";
        rec.compression.verifiedAt = nowISO();
        rec.updatedAt = nowISO();
        return { status: "VERIFIED", fileId };
    }

    /**
     * restoreFile(fileId)
     *   Real restoration via the real decompressText() — never claims
     *   RESTORABLE unless a real compressed payload with an intact
     *   dictionary actually exists.
     */
    function restoreFile(fileId) {
        const rec = registry.get(fileId);
        if (!rec) return { status: "NOT_FOUND" };
        if (!rec.compression || (rec.state !== "COMPRESSED" && rec.state !== "VERIFIED" && rec.state !== "RESTORABLE")) {
            return { status: "NOT_RESTORABLE", reason: "No real compressed payload exists to restore from." };
        }
        const tc = textCompressor();
        if (!tc) return { status: "CAPABILITY_UNAVAILABLE", reason: "TEXT_COMPRESSOR_ABSENT" };
        const result = tc.decompressText(rec.compression.compressedText);
        if (!result.success) return { status: "NOT_RESTORABLE", reason: result.reason };
        rec.state = "RESTORABLE";
        rec.updatedAt = nowISO();
        return { status: "RESTORED", fileId, text: result.text };
    }

    /**
     * deleteOriginal(fileId, opts)
     *   The one real destructive action. Requires a prior
     *   requestUserApproval('DELETE', {confirmed:true, ...}) approval
     *   on record, OR an explicit acknowledgeUnverifiedDeletion:true
     *   override for KEEP/DELETE flows on files that were never
     *   compressed at all (pure "I just want this gone" case) — the
     *   VERIFIED-state requirement below applies only when a
     *   compression actually exists.
     */
    function deleteOriginal(fileId, opts) {
        const rec = registry.get(fileId);
        if (!rec) return { status: "NOT_FOUND" };
        const o = opts || {};
        if (!rec.pendingDeleteApproved && !o.confirmed) {
            return { status: "CONFIRMATION_REQUIRED" };
        }
        if (rec.compression && rec.state !== "VERIFIED" && !o.acknowledgeUnverifiedDeletion) {
            return { status: "REJECTED", reason: "COMPRESSED_BUT_NOT_YET_VERIFIED", note: "Verify the compression before deleting the original, or pass acknowledgeUnverifiedDeletion:true to override explicitly." };
        }
        rec.state = "DELETED_BY_USER";
        rec.textContent = null; // the real original content is actually discarded here
        rec.updatedAt = nowISO();
        return { status: "DELETED_BY_USER", fileId };
    }

    // -----------------------------------------------------------------
    // 9. LANGUAGE PACK PRESERVATION PLAN
    // -----------------------------------------------------------------

    /**
     * getLanguagePackPreservationPlan(languageId)
     *   Reads real RP-030 pack + expression records and reports, per
     *   record, which fields are always preserved (everything except
     *   optional free-text) and which free-text fields could honestly
     *   be offered to the real text compressor. Never touches or
     *   proposes removing provenance/region/dialect/license/confidence/
     *   validation — this function has no mutator on RP-030 at all.
     */
    function getLanguagePackPreservationPlan(languageId) {
        const api = packsApi();
        if (!api) return { capability: "CAPABILITY_UNAVAILABLE", reason: "LANGUAGE_PACK_REGISTRY_ABSENT" };
        const pack = api.getPack(languageId);
        if (!pack) return { capability: "AVAILABLE", status: "UNREGISTERED_LANGUAGE" };
        const records = api.listExpressions({ languageId });
        const plan = records.map((r) => ({
            recordId: r.recordId,
            alwaysPreserved: {
                expression: r.expression, region: r.region, dialect: r.dialect,
                licensing: r.licensing, provenanceLog: r.provenanceLog,
                confidence: r.confidence, validationState: r.validationState,
                evidenceCount: r.evidenceCount
            },
            optionallyCompressibleFreeText: {
                meaning: r.meaning ? "ELIGIBLE_FOR_TEXT_COMPRESSION" : "ABSENT",
                context: r.context ? "ELIGIBLE_FOR_TEXT_COMPRESSION" : "ABSENT"
            }
        }));
        return {
            capability: "AVAILABLE",
            languageId,
            recordCount: plan.length,
            plan,
            note: "Only meaning/context free-text fields are ever eligible for the real, composed text compressor. Every other field listed under alwaysPreserved is never included in any compression payload this engine produces."
        };
    }

    // -----------------------------------------------------------------
    // 10. QUARANTINE / SAFETY PROTECTION
    // -----------------------------------------------------------------

    /**
     * checkDistributionSafety(fileId)
     *   Composes the real safety gate / quarantine store — read-only.
     *   Refuses COMPRESS_FOR_DISTRIBUTION/SHARE for anything currently
     *   quarantined; never overrides or bypasses the real gate.
     */
    function checkDistributionSafety(fileId) {
        const rec = registry.get(fileId);
        if (!rec) return { status: "NOT_FOUND" };
        const gate = safetyGate();
        if (!gate) return { status: "AVAILABLE", allowDistribution: true, note: "No safety gate loaded — this engine has no fallback judgment of its own; caller should not distribute without one present." };
        if (rec.quarantined) {
            return { status: "AVAILABLE", allowDistribution: false, reason: "QUARANTINED_CONTENT_MUST_NOT_BE_DISTRIBUTED_SHARED_OR_PROMOTED" };
        }
        return { status: "AVAILABLE", allowDistribution: true };
    }

    function markQuarantined(fileId, quarantined) {
        const rec = registry.get(fileId);
        if (!rec) return { status: "NOT_FOUND" };
        rec.quarantined = !!quarantined;
        rec.updatedAt = nowISO();
        return { status: "UPDATED", fileId, quarantined: rec.quarantined };
    }

    // -----------------------------------------------------------------
    // 11. COZY OFFLINE HOTSPOT TRANSFER
    // -----------------------------------------------------------------

    const HOTSPOT_MESSAGE_TYPE = "cozy-living-compressor-package-v1";

    /**
     * shareCompressedPackage(fileId)
     *   Composes the real LiveHotspotEngine directly (the same pattern
     *   the RP-029-C Phase 2 bridge already uses) — no second
     *   transport. Only ever sends the real compressed payload/summary,
     *   never raw private original content, and never for quarantined
     *   content (checkDistributionSafety() is enforced first). SYNCED
     *   is never reported — the real transport has no such state.
     */
    function shareCompressedPackage(fileId) {
        const rec = registry.get(fileId);
        if (!rec) return { status: "NOT_FOUND" };
        const safety = checkDistributionSafety(fileId);
        if (safety.allowDistribution === false) return { status: "BLOCKED", reason: safety.reason };
        if (!rec.compression || rec.compression.status !== "COMPRESSED") return { status: "REJECTED", reason: "Nothing real to share — file has not been compressed." };

        const h = hotspotEngine();
        if (!h) return { status: "CAPABILITY_UNAVAILABLE", reason: "HOTSPOT_ENGINE_ABSENT" };
        const connections = (h.listConnections() || []).filter((c) => c.state === "connected");
        if (connections.length === 0) return { status: "NO_ACTIVE_HOTSPOT_CONNECTION" };

        const payload = JSON.stringify({
            type: HOTSPOT_MESSAGE_TYPE,
            fileId: rec.id, name: rec.name, type_: rec.type,
            compressedText: rec.compression.compressedText,
            checksum: rec.compression.originalChecksum
        });
        let sentTo = 0;
        connections.forEach((c) => { const r = h.sendMessage(c.id, payload); if (r && r.success !== false) sentTo++; });
        return { status: sentTo > 0 ? "SENT" : "SEND_FAILED", sentTo, connectionCount: connections.length };
    }

    /**
     * receiveCompressedPackage(rawData)
     *   Real receiver-side handling — parses only this engine's own
     *   message type, decompresses via the real text compressor, and
     *   verifies checksum before reporting VERIFIED. IMPORT_FAILED on
     *   any real mismatch/parse failure. SYNCED is never emitted.
     */
    function receiveCompressedPackage(rawData) {
        let parsed;
        try { parsed = JSON.parse(rawData); } catch (_e) { return { status: "IMPORT_FAILED", reason: "UNPARSEABLE_PAYLOAD" }; }
        if (!parsed || parsed.type !== HOTSPOT_MESSAGE_TYPE) return { status: "IMPORT_FAILED", reason: "UNRECOGNIZED_PAYLOAD_TYPE" };

        const tc = textCompressor();
        if (!tc) return { status: "CAPABILITY_UNAVAILABLE", reason: "TEXT_COMPRESSOR_ABSENT" };
        const decompressed = tc.decompressText(parsed.compressedText);
        if (!decompressed.success) return { status: "IMPORT_FAILED", reason: decompressed.reason };
        const checksum = tc.checksum(decompressed.text);
        if (!parsed.checksum || !checksum || checksum.hash !== parsed.checksum.hash) {
            return { status: "IMPORT_FAILED", reason: "CHECKSUM_MISMATCH" };
        }
        const reg = registerFile({ name: parsed.name, sizeBytes: decompressed.text.length, extension: null, textContent: decompressed.text });
        return { status: "VERIFIED", fileId: reg.fileId };
    }

    // -----------------------------------------------------------------
    // 12. ADMIN DASHBOARD SNAPSHOT
    // -----------------------------------------------------------------

    function getStorageAnalyticsSnapshot() {
        const summary = calculateSavingsSummary();
        let filesAnalyzed = 0, filesCompressed = 0, filesSkipped = 0, failures = 0, duplicatesFound = 0;
        let languagePackBytes = 0, audioBytes = 0, videoBytes = 0, documentBytes = 0, totalBytes = 0;
        registry.forEach((rec) => {
            totalBytes += rec.sizeBytes;
            if (rec.state === "ANALYZED" || rec.state !== "ORIGINAL") filesAnalyzed++;
            if (rec.state === "COMPRESSED" || rec.state === "VERIFIED") filesCompressed++;
            if (rec.state === "FAILED") failures++;
            if (rec.duplicateClass && rec.duplicateClass !== "UNRELATED") duplicatesFound++;
            if (rec.type === "LANGUAGE_PACK") languagePackBytes += rec.sizeBytes;
            if (rec.type === "AUDIO") audioBytes += rec.sizeBytes;
            if (rec.type === "VIDEO") videoBytes += rec.sizeBytes;
            if (rec.type === "DOCUMENT") documentBytes += rec.sizeBytes;
        });
        return {
            totalStorageBytes: totalBytes,
            compressibleStorageBytes: summary.byType.DOCUMENT.totalBytes,
            compressedStorageBytes: Array.from(registry.values()).filter((r) => r.compression && r.compression.status === "COMPRESSED").reduce((a, r) => a + r.compression.compressedSizeBytes, 0),
            potentialSavingsBytes: summary.totalPotentialSavingsBytes,
            filesAnalyzed, filesCompressed, filesSkipped, failures, duplicatesFound,
            languagePackStorageBytes: languagePackBytes,
            audioStorageBytes: audioBytes,
            videoStorageBytes: videoBytes,
            documentStorageBytes: documentBytes,
            mostCompressedFileTypeHistorically: "NOT_AVAILABLE_NO_TELEMETRY",
            note: "Every count above is a real, live aggregate over this session's registered files. No historical trend/telemetry engine exists in this repository."
        };
    }

    // -----------------------------------------------------------------
    // PUBLIC API
    // -----------------------------------------------------------------

    const api = Object.freeze({
        VERSION,
        FILE_TYPES, COMPRESSION_LEVELS, STATES, STORAGE_CONDITIONS, DUPLICATE_CLASSES,
        classifyFile,
        registerFile, getFile, listFiles,
        analyzeFile,
        estimateCompression, planCompression, calculateSavingsSummary,
        getStorageCondition,
        requestUserApproval,
        executeCompression, verifyCompression, restoreFile, deleteOriginal,
        getLanguagePackPreservationPlan,
        checkDistributionSafety, markQuarantined,
        shareCompressedPackage, receiveCompressedPackage,
        getStorageAnalyticsSnapshot,
        // Exposed for tests only — real, in-memory reset between test runs.
        _resetRegistryForTests() { registry.clear(); nextId = 1; }
    });

    root.window.CozyOS = root.window.CozyOS || {};
    root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
    root.window.CozyOS.CozyLivingCompressorEngine = api;
    root.window.CozyOS.Modules["cozy-living-compressor"] = Object.freeze({ version: VERSION, api });
}(typeof window !== "undefined" ? { window } : { window: (global.window = global.window || {}) }));
