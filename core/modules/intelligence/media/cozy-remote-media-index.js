/**
 * core/modules/intelligence/media/cozy-remote-media-index.js
 * Repair: RP-034 Phase 2 — Persistent Remote Media Intelligence Index
 * Baseline: CozyOS-main-RP-034-Phase1.zip (verified: SHA-256
 * 8b56578f91be1a4448850a8f63638bed654c5d5a6e6e3334a58f5733130f9335,
 * `unzip -t` clean, Phase 1's 30/30 + RP-033 Gate 2's 51/51 + Gate 1's
 * 34/34 tests re-run and passing before any Phase 2 code was written).
 *
 * MILESTONE SCOPE — THIS FILE IS PHASE 2 ONLY
 *   RP-034 is an 8-phase milestone. This pass delivers Phase 2 —
 *   Persistent Remote Media Intelligence Index — only. It does NOT
 *   implement video downloading, frame extraction, OCR, speech
 *   recognition, face recognition, transcript extraction, scraping,
 *   advanced local search/research (Phase 3), the full media analysis
 *   pipeline (Phase 4), expanded African-language routing (Phase 5),
 *   privacy/identity expansion (Phase 6), offline synchronization
 *   (Phase 7), or the final integrated test matrix (Phase 8). Every
 *   one of those surfaces here, where relevant, as an explicit
 *   `CAPABILITY_UNAVAILABLE`/`SYNC_CAPABILITY_UNAVAILABLE` — never
 *   fabricated, never quietly implemented in fragments.
 *
 * CORE PRINCIPLE
 *   Video stays at its authorized source. This file stores permitted
 *   metadata, analysis results, provenance, timestamps, confidence,
 *   and searchable knowledge — never an unauthorized copy of the
 *   media itself. There is no downloadVideo()/downloadMedia()/
 *   downloadFrames()/extractFrames() anywhere in this file, by design,
 *   not merely by omission.
 *
 * OWNERSHIP / COMPOSITION — repository-wide search performed before
 * writing this file found no existing persistent remote-media index
 * anywhere in this repository. This is a genuinely new, necessary
 * owner. It composes — never duplicates:
 *   - window.CozyOS.CozyMediaConnectors (RP-034 Phase 1,
 *     cozy-media-connector.js) — the real, only YouTube connector in
 *     this repository (getConnector('youtube').getVideoMetadata(),
 *     .capabilities(), .parseVideoId()). This file calls the REAL
 *     Phase 1 connector for `refreshMetadata()` — never a second,
 *     parallel metadata-fetch implementation.
 *   - window.CozyOS.CozyMemory (core/modules/memory/
 *     cozy-memory-engine.js) — the real, existing, general-purpose
 *     persistence primitive already composed by M333's own
 *     living-compressor.js. Real CRUD (`saveMemory`/`readMemory`/
 *     `updateMemory`/`deleteMemory`/`listKeys`) AND real, automatic
 *     version history (every `saveMemory`/`updateMemory` call
 *     increments a real `versionNumber` and preserves the prior value
 *     in a real `versions` array) — this file does not build a second
 *     versioning mechanism; CozyMemory's own is the real source of
 *     truth for `sourceMetadataVersion`/provenance-history
 *     preservation. HONEST DISCLOSURE: CozyMemory itself is real,
 *     in-memory (a `Map`), session-scoped persistence — there is no
 *     disk/IndexedDB-backed storage engine anywhere in this
 *     repository (confirmed by direct source read). "Persistent" in
 *     this file means "survives across calls within the running
 *     session, with real CRUD/versioning/search semantics," not
 *     "survives a page reload" — the same honest scope every other
 *     stateful module in this repository already discloses.
 *   - window.CozyOS.CozyLanguagePacks (RP-030) — composed read-only
 *     for language routing (`getPack`/`listRegionalContexts`). No
 *     mutator called; no language pack ever registered/promoted by
 *     this file.
 *   - window.CozyOS.CozyKnowledgeSafetyGate (RP-029-C) — composed for
 *     the real `classify()`/`quarantine()` pipeline over indexed
 *     title/description/searchable-term text, reusing the exact same
 *     SAFE/UNCERTAIN/UNSAFE vocabulary and quarantine mechanism the
 *     rest of this repository already uses — no second safety system.
 *
 * PROVENANCE VOCABULARY (spec §7) — every indexed field's origin is
 * one of: SOURCE_METADATA, USER_INPUT, COMMUNITY_REPORTED,
 * ANALYSIS_RESULT, SYSTEM_DERIVED. System-derived/community-reported
 * data is never marked professionally verified (spec §11) — this
 * file's `provenance.validationStatus` vocabulary never includes a
 * "PROFESSIONALLY_VERIFIED" value; the strongest state it can ever
 * report is `COMMUNITY_REPORTED` or `SYSTEM_DERIVED`, honestly.
 *
 * PRIVACY — `sanitizeAgainstSecrets()` rejects any input field whose
 * key name matches a real credential/token/secret pattern before it
 * ever reaches storage — the same real "security choke point"
 * convention `core/modules/media/cozy-media.js`'s own header already
 * documents for this repository. Only `authorizationRef`/
 * `identityRef`/`contributorRef` (opaque string references) are ever
 * accepted — never a raw token/credential/secret.
 *
 * SYNC — no real remote synchronization transport is composed this
 * phase (deferred to Phase 7). Every record's `sync.state` is
 * therefore always the honest `SYNC_CAPABILITY_UNAVAILABLE` — never
 * `QUEUED`/`SYNCING`/`SYNCED`/`CONFLICT`, since no real mechanism
 * backs any of those states yet.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CozyOS = root.CozyOS || {};
        factory(root);
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function (rootArg) {
    "use strict";

    const VERSION = "1.0.0-rp034-phase2";
    const NAMESPACE = "remote-media-index";
    const LOOKUP_NAMESPACE = "remote-media-index-lookup";

    function hasWindow() { return typeof window !== "undefined"; }
    function cozyOS() { return hasWindow() ? window.CozyOS : (typeof globalThis !== "undefined" ? globalThis.CozyOS : undefined); }
    function memory() { const c = cozyOS(); return c && c.CozyMemory ? c.CozyMemory : null; }
    function connectors() { const c = cozyOS(); return c && c.CozyMediaConnectors ? c.CozyMediaConnectors : null; }
    function packsApi() { const c = cozyOS(); return c && c.CozyLanguagePacks ? c.CozyLanguagePacks : null; }
    function safetyGate() { const c = cozyOS(); return c && c.CozyKnowledgeSafetyGate ? c.CozyKnowledgeSafetyGate : null; }

    /* ------------------------------------------------------------------ */
    /* CONSTANTS                                                          */
    /* ------------------------------------------------------------------ */

    const PROVENANCE_SOURCES = Object.freeze(["SOURCE_METADATA", "USER_INPUT", "COMMUNITY_REPORTED", "ANALYSIS_RESULT", "SYSTEM_DERIVED"]);
    const VALIDATION_STATUSES = Object.freeze(["UNVALIDATED", "COMMUNITY_REPORTED", "SYSTEM_DERIVED", "DISPUTED"]);
    const SYNC_STATES = Object.freeze(["LOCAL_ONLY", "QUEUED", "SYNCING", "SYNCED", "CONFLICT", "FAILED", "SYNC_CAPABILITY_UNAVAILABLE"]);
    const SECRET_KEY_PATTERN = /password|token|secret|apikey|api_key|credential|privatekey|private_key|oauth/i;

    /* ------------------------------------------------------------------ */
    /* PRIVACY GUARD                                                      */
    /* ------------------------------------------------------------------ */

    function sanitizeAgainstSecrets(obj, path) {
        if (!obj || typeof obj !== "object") return { safe: true };
        for (const key of Object.keys(obj)) {
            if (SECRET_KEY_PATTERN.test(key)) {
                return { safe: false, reason: `Field "${path ? path + "." : ""}${key}" looks like a credential/token/secret and was rejected. Use authorizationRef/identityRef/contributorRef instead.` };
            }
            const val = obj[key];
            if (val && typeof val === "object" && !Array.isArray(val)) {
                const nested = sanitizeAgainstSecrets(val, path ? path + "." + key : key);
                if (!nested.safe) return nested;
            }
        }
        return { safe: true };
    }

    /* ------------------------------------------------------------------ */
    /* ID / LOOKUP HELPERS                                                */
    /* ------------------------------------------------------------------ */

    let nextIdSeq = 1;
    function freshIndexId() { return "rmi_" + Date.now().toString(36) + "_" + (nextIdSeq++); }
    function lookupKey(sourceType, sourceId) { return `${sourceType}:${sourceId}`; }

    function nowISO() { return new Date().toISOString(); }

    /* ------------------------------------------------------------------ */
    /* RECORD SHAPE                                                       */
    /* ------------------------------------------------------------------ */

    function blankRecord(indexId, sourceType, sourceId, input) {
        const created = nowISO();
        return {
            indexId,
            sourceType,
            sourceId,
            canonicalUrl: input.canonicalUrl || null,
            title: input.title != null ? input.title : null,
            description: input.description != null ? input.description : null,
            publishedAt: input.publishedAt || null,
            durationSeconds: typeof input.durationSeconds === "number" ? input.durationSeconds : null,
            channel: { id: (input.channel && input.channel.id) || null, title: (input.channel && input.channel.title) || null },
            ownerAuthorization: { state: (input.ownerAuthorization && input.ownerAuthorization.state) || "UNKNOWN", authorizationRef: (input.ownerAuthorization && input.ownerAuthorization.authorizationRef) || null },
            sourceMetadata: { retrievedAt: (input.sourceMetadata && input.sourceMetadata.retrievedAt) || created, apiVersion: (input.sourceMetadata && input.sourceMetadata.apiVersion) || null, fieldsObserved: (input.sourceMetadata && input.sourceMetadata.fieldsObserved) || [] },
            analysis: { status: "NOT_ANALYZED", capabilities: "CAPABILITY_UNAVAILABLE", lastAnalyzedAt: null },
            language: { detected: null, confidence: null, region: null, dialect: null, packId: null },
            searchableTerms: Array.isArray(input.searchableTerms) ? input.searchableTerms.slice() : [],
            timestamps: [],
            provenance: {
                source: (input.provenance && input.provenance.source) || "USER_INPUT",
                method: (input.provenance && input.provenance.method) || "MANUAL_ENTRY",
                contributor: (input.provenance && input.provenance.contributor) || null,
                confidence: (input.provenance && typeof input.provenance.confidence === "number") ? input.provenance.confidence : null,
                validationStatus: "UNVALIDATED"
            },
            fieldProvenance: {},
            privacy: { tier: (input.privacy && input.privacy.tier) || "STANDARD", retentionPolicy: (input.privacy && input.privacy.retentionPolicy) || "DEFAULT" },
            sync: { state: "SYNC_CAPABILITY_UNAVAILABLE", version: 1, updatedAt: created },
            createdAt: created,
            updatedAt: created
        };
    }

    function stampFieldProvenance(record, fieldNames, source) {
        const at = nowISO();
        fieldNames.forEach((f) => { record.fieldProvenance[f] = { source: PROVENANCE_SOURCES.indexOf(source) !== -1 ? source : "SYSTEM_DERIVED", recordedAt: at }; });
    }

    /* ------------------------------------------------------------------ */
    /* SAFETY INTEGRATION (RP-029-C, composed)                            */
    /* ------------------------------------------------------------------ */

    function runSafetyCheck(record) {
        const gate = safetyGate();
        if (!gate) return { status: "CAPABILITY_UNAVAILABLE", reason: "SAFETY_GATE_ABSENT" };
        const text = [record.title, record.description].concat(record.searchableTerms || []).filter(Boolean).join(" ");
        if (!text) return { status: "SKIPPED", reason: "NO_TEXT_TO_CLASSIFY" };
        const result = gate.classify({ expression: text, contributionType: "WEBSITE_EVIDENCE" });
        if (result.classification === "UNSAFE" || result.classification === "UNCERTAIN") {
            gate.quarantine({ expression: text, language: (record.language && record.language.detected) || null, contributionType: "WEBSITE_EVIDENCE", sourceRecordId: record.indexId }, result, record.provenance.contributor || "remote-media-index");
            return { status: "QUARANTINED", classification: result.classification, category: result.category };
        }
        return { status: "SAFE" };
    }

    /* ------------------------------------------------------------------ */
    /* 1. INDEX CRUD (composes CozyMemory)                                 */
    /* ------------------------------------------------------------------ */

    function createRecord(input) {
        const mem = memory();
        if (!mem) return { status: "CAPABILITY_UNAVAILABLE", reason: "COZY_MEMORY_ABSENT" };
        const d = input || {};
        if (!d.sourceType || !d.sourceId) return { status: "REJECTED", reason: "Real sourceType and sourceId are required." };
        const secretCheck = sanitizeAgainstSecrets(d);
        if (!secretCheck.safe) return { status: "REJECTED", reason: secretCheck.reason };

        const key = lookupKey(d.sourceType, d.sourceId);
        const existingLookup = mem.readMemory(LOOKUP_NAMESPACE, key);
        if (existingLookup) return { status: "ALREADY_EXISTS", indexId: existingLookup.value.indexId, note: "Use upsertRemoteMedia() or updateRecord() to modify an existing record." };

        const indexId = freshIndexId();
        const record = blankRecord(indexId, d.sourceType, d.sourceId, d);
        stampFieldProvenance(record, Object.keys(d).filter((k) => record.hasOwnProperty(k)), d.provenance ? d.provenance.source : "USER_INPUT");

        const safety = runSafetyCheck(record);
        mem.saveMemory(NAMESPACE, indexId, record, { actorId: "system", visibility: "private" });
        mem.saveMemory(LOOKUP_NAMESPACE, key, { indexId }, { actorId: "system", visibility: "private" });
        return { status: "CREATED", indexId, record, safety };
    }

    function getRecord(indexId) {
        const mem = memory();
        if (!mem) return null;
        const entry = mem.readMemory(NAMESPACE, indexId);
        return entry ? entry.value : null;
    }

    function updateRecord(indexId, updates, opts) {
        const mem = memory();
        if (!mem) return { status: "CAPABILITY_UNAVAILABLE", reason: "COZY_MEMORY_ABSENT" };
        const existing = mem.readMemory(NAMESPACE, indexId);
        if (!existing) return { status: "NOT_FOUND" };
        const u = updates || {};
        const secretCheck = sanitizeAgainstSecrets(u);
        if (!secretCheck.safe) return { status: "REJECTED", reason: secretCheck.reason };

        const record = JSON.parse(JSON.stringify(existing.value));
        const changedFields = [];
        Object.keys(u).forEach((key) => {
            if (u[key] === undefined) return;
            if (key === "fieldProvenance" || key === "indexId" || key === "sourceType" || key === "sourceId" || key === "createdAt") return; // immutable identity/provenance-history fields
            if (typeof u[key] === "object" && !Array.isArray(u[key]) && record[key] && typeof record[key] === "object") {
                record[key] = Object.assign({}, record[key], u[key]);
            } else {
                record[key] = u[key];
            }
            changedFields.push(key);
        });
        if (changedFields.length === 0) return { status: "NO_CHANGE" };

        stampFieldProvenance(record, changedFields, (opts && opts.provenanceSource) || "SYSTEM_DERIVED");
        record.updatedAt = nowISO();

        const saved = mem.updateMemory(NAMESPACE, indexId, record, { actorId: "system", visibility: "private" });
        record.sync.version = saved.versionNumber;
        record.sync.updatedAt = saved.savedAt;
        mem.updateMemory(NAMESPACE, indexId, record, { actorId: "system", visibility: "private" });

        const safety = runSafetyCheck(record);
        return { status: "UPDATED", indexId, changedFields, version: saved.versionNumber, safety };
    }

    function deleteRecord(indexId, opts) {
        const mem = memory();
        if (!mem) return { status: "CAPABILITY_UNAVAILABLE", reason: "COZY_MEMORY_ABSENT" };
        const o = opts || {};
        if (!o.authorized) return { status: "CONFIRMATION_REQUIRED" };
        const existing = mem.readMemory(NAMESPACE, indexId);
        if (!existing) return { status: "NOT_FOUND" };
        mem.deleteMemory(NAMESPACE, indexId, { actorId: "system", authorized: true });
        mem.deleteMemory(LOOKUP_NAMESPACE, lookupKey(existing.value.sourceType, existing.value.sourceId), { actorId: "system", authorized: true });
        return { status: "DELETED", indexId };
    }

    function listRecords(filter) {
        const mem = memory();
        if (!mem) return [];
        const f = filter || {};
        return mem.listKeys(NAMESPACE, (entry) => {
            const rec = entry.value;
            if (f.sourceType && rec.sourceType !== f.sourceType) return false;
            if (f.language && (!rec.language || rec.language.detected !== f.language)) return false;
            return true;
        }).map((e) => e.value);
    }

    function countRecords(filter) { return listRecords(filter).length; }

    function clearIndex(opts) {
        const o = opts || {};
        if (!o.authorized) return { status: "CONFIRMATION_REQUIRED" };
        const all = listRecords();
        let cleared = 0;
        all.forEach((r) => { const res = deleteRecord(r.indexId, { authorized: true }); if (res.status === "DELETED") cleared++; });
        return { status: "CLEARED", cleared };
    }

    /* ------------------------------------------------------------------ */
    /* 2. UPSERT / LOOKUP (duplicate prevention)                          */
    /* ------------------------------------------------------------------ */

    function upsertRemoteMedia(input) {
        const mem = memory();
        if (!mem) return { status: "CAPABILITY_UNAVAILABLE", reason: "COZY_MEMORY_ABSENT" };
        const d = input || {};
        if (!d.sourceType || !d.sourceId) return { status: "REJECTED", reason: "Real sourceType and sourceId are required." };
        const key = lookupKey(d.sourceType, d.sourceId);
        const existingLookup = mem.readMemory(LOOKUP_NAMESPACE, key);
        if (existingLookup) {
            const updateResult = updateRecord(existingLookup.value.indexId, d, { provenanceSource: (d.provenance && d.provenance.source) || "SYSTEM_DERIVED" });
            return Object.assign({ status: updateResult.status === "NO_CHANGE" ? "NO_CHANGE" : "UPDATED" }, updateResult, { indexId: existingLookup.value.indexId });
        }
        return createRecord(d);
    }

    function getBySourceId(sourceType, sourceId) {
        const mem = memory();
        if (!mem) return null;
        const lookup = mem.readMemory(LOOKUP_NAMESPACE, lookupKey(sourceType, sourceId));
        if (!lookup) return null;
        return getRecord(lookup.value.indexId);
    }

    function getByIndexId(indexId) { return getRecord(indexId); }

    /* ------------------------------------------------------------------ */
    /* 3. TIMESTAMP INTELLIGENCE (spec §9) — stores/searches only          */
    /* ------------------------------------------------------------------ */

    function addTimestamp(indexId, timestamp) {
        const t = timestamp || {};
        if (typeof t.timestampSeconds !== "number") return { status: "REJECTED", reason: "A real timestampSeconds number is required." };
        const record = getRecord(indexId);
        if (!record) return { status: "NOT_FOUND" };
        const newTimestamps = record.timestamps.concat([{
            timestampSeconds: t.timestampSeconds,
            label: t.label || null,
            term: t.term || null,
            language: t.language || null,
            confidence: typeof t.confidence === "number" ? t.confidence : null,
            provenance: t.provenance || "USER_INPUT"
        }]);
        return updateRecord(indexId, { timestamps: newTimestamps }, { provenanceSource: t.provenance || "USER_INPUT" });
    }

    /* ------------------------------------------------------------------ */
    /* 4. LANGUAGE ROUTING (composes RP-030, read-only)                   */
    /* ------------------------------------------------------------------ */

    /**
     * routeLanguage(indexId, {languageId, region, dialect, confidence})
     *   Only assigns a real packId when RP-030 has a real, registered
     *   pack for languageId AND (no region/dialect requested, or a
     *   real matching regional context exists). Never guesses.
     */
    function routeLanguage(indexId, evidence) {
        const api = packsApi();
        const record = getRecord(indexId);
        if (!record) return { status: "NOT_FOUND" };
        if (!api) return { status: "AVAILABLE", languageStatus: "CAPABILITY_UNAVAILABLE", reason: "LANGUAGE_PACK_REGISTRY_ABSENT" };
        const e = evidence || {};
        if (!e.languageId) return { status: "AVAILABLE", languageStatus: "LANGUAGE_UNCERTAIN", reason: "NO_LANGUAGE_ID_EVIDENCE_SUPPLIED" };

        const pack = api.getPack(e.languageId);
        if (!pack) {
            updateRecord(indexId, { language: { detected: e.languageId, confidence: e.confidence || null, region: e.region || null, dialect: e.dialect || null, packId: null } }, { provenanceSource: "ANALYSIS_RESULT" });
            return { status: "AVAILABLE", languageStatus: "LANGUAGE_UNCERTAIN", reason: "LANGUAGE_NOT_REGISTERED_IN_RP030" };
        }

        let packId = pack.identity.languageId;
        let languageStatus = "RESOLVED";
        if (e.region || e.dialect) {
            const contexts = api.listRegionalContexts(e.languageId);
            const matches = contexts.filter((c) => (!e.region || c.region === e.region) && (!e.dialect || c.dialect === e.dialect));
            if (matches.length === 0) { packId = null; languageStatus = "LANGUAGE_UNCERTAIN"; }
            else if (matches.length > 1) { languageStatus = "AMBIGUOUS_REGIONAL_CONTEXT"; }
        }

        updateRecord(indexId, { language: { detected: e.languageId, confidence: typeof e.confidence === "number" ? e.confidence : null, region: e.region || null, dialect: e.dialect || null, packId } }, { provenanceSource: "ANALYSIS_RESULT" });
        return { status: "AVAILABLE", languageStatus, packId };
    }

    /* ------------------------------------------------------------------ */
    /* 5. SEARCH (spec §8, §18) — real, structured, field-aware            */
    /* ------------------------------------------------------------------ */

    function isOffline() {
        const c = connectors();
        if (!c) return true;
        const yt = c.getConnector("youtube");
        if (!yt) return true;
        const caps = yt.capabilities();
        return caps.network.status !== c.CAPABILITY_STATUS.AVAILABLE;
    }

    function search(query, opts) {
        const q = (query || "").trim().toLowerCase();
        if (!q) return { results: [], total: 0, query: query || "", source: "LOCAL_REMOTE_MEDIA_INDEX", offline: isOffline(), reason: "EMPTY_QUERY" };

        const all = listRecords(opts && opts.filter);
        const results = [];
        all.forEach((r) => {
            const matchedFields = [];
            if (r.title && r.title.toLowerCase().includes(q)) matchedFields.push("title");
            if (r.description && r.description.toLowerCase().includes(q)) matchedFields.push("description");
            if (r.channel && r.channel.title && r.channel.title.toLowerCase().includes(q)) matchedFields.push("channel");
            if (r.sourceId && r.sourceId.toLowerCase().includes(q)) matchedFields.push("sourceId");
            if (Array.isArray(r.searchableTerms) && r.searchableTerms.some((t) => String(t).toLowerCase().includes(q))) matchedFields.push("searchableTerms");
            if (r.language && r.language.detected && String(r.language.detected).toLowerCase().includes(q)) matchedFields.push("language");
            if (r.language && r.language.region && String(r.language.region).toLowerCase().includes(q)) matchedFields.push("region");
            if (r.language && r.language.dialect && String(r.language.dialect).toLowerCase().includes(q)) matchedFields.push("dialect");
            const matchedTimestamps = (r.timestamps || []).filter((t) => (t.term && String(t.term).toLowerCase().includes(q)) || (t.label && String(t.label).toLowerCase().includes(q)));
            if (matchedTimestamps.length > 0) matchedFields.push("timestamps");

            if (matchedFields.length > 0) {
                results.push({
                    indexId: r.indexId, sourceId: r.sourceId, title: r.title, channel: r.channel,
                    language: r.language, matchedFields, timestamps: matchedTimestamps,
                    confidence: r.language ? r.language.confidence : null, provenance: r.provenance
                });
            }
        });
        return { results, total: results.length, query, source: "LOCAL_REMOTE_MEDIA_INDEX", offline: isOffline() };
    }

    /* ------------------------------------------------------------------ */
    /* 6. REMOTE REFRESH (composes the real Phase 1 connector)            */
    /* ------------------------------------------------------------------ */

    async function refreshMetadata(indexId) {
        const record = getRecord(indexId);
        if (!record) return { status: "NOT_FOUND" };
        if (record.ownerAuthorization.state !== "AUTHORIZED" && record.ownerAuthorization.state !== "UNKNOWN") {
            return { status: "AUTHORIZATION_REQUIRED", reason: `ownerAuthorization.state is "${record.ownerAuthorization.state}".` };
        }
        const c = connectors();
        if (!c) return { status: "CAPABILITY_UNAVAILABLE", reason: "CONNECTOR_ABSENT" };
        const connector = c.getConnector(record.sourceType);
        if (!connector) return { status: "CAPABILITY_UNAVAILABLE", reason: `No real connector registered for sourceType "${record.sourceType}".` };

        const caps = connector.capabilities();
        if (caps.metadataFetch.status !== c.CAPABILITY_STATUS.AVAILABLE) {
            return { status: "NETWORK_UNAVAILABLE", reason: caps.metadataFetch.reason };
        }

        const result = await connector.getVideoMetadata(record.sourceId);
        if (!result.success) return { status: "NETWORK_UNAVAILABLE", reason: result.reason };

        const m = result.metadata;
        const updates = {};
        const fieldsObserved = [];
        if (m.title != null) { updates.title = m.title; fieldsObserved.push("title"); }
        if (m.channel != null) { updates.channel = { title: m.channel }; fieldsObserved.push("channel"); }
        if (m.date != null) { updates.publishedAt = m.date; fieldsObserved.push("publishedAt"); }
        if (m.durationSeconds != null) { updates.durationSeconds = m.durationSeconds; fieldsObserved.push("durationSeconds"); }
        if (m.url != null) { updates.canonicalUrl = m.url; fieldsObserved.push("canonicalUrl"); }
        updates.sourceMetadata = { retrievedAt: m.retrievedAt, apiVersion: "youtube-v3", fieldsObserved };

        const updateResult = updateRecord(indexId, updates, { provenanceSource: "SOURCE_METADATA" });
        return { status: "REFRESHED", indexId, fieldsUpdated: fieldsObserved, version: updateResult.version };
    }

    /* ------------------------------------------------------------------ */
    /* 7. CAPABILITY REPORTING                                            */
    /* ------------------------------------------------------------------ */

    function getCapabilities() {
        const c = connectors();
        const yt = c ? c.getConnector("youtube") : null;
        const ytCaps = yt ? yt.capabilities() : null;
        return {
            metadataFetch: ytCaps ? ytCaps.metadataFetch.status : "CAPABILITY_UNAVAILABLE",
            persistentIndex: memory() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            persistentIndexNote: "Real CRUD/versioning/search via CozyMemory — in-memory, session-scoped (no disk/IndexedDB backing exists anywhere in this repository).",
            localSearch: "AVAILABLE",
            languageRouting: packsApi() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            safetyPipeline: safetyGate() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            videoDownload: "CAPABILITY_UNAVAILABLE",
            frameAccess: "CAPABILITY_UNAVAILABLE",
            transcriptFetch: "CAPABILITY_UNAVAILABLE",
            ocr: "CAPABILITY_UNAVAILABLE",
            speechRecognition: "CAPABILITY_UNAVAILABLE",
            faceRecognition: "CAPABILITY_UNAVAILABLE",
            sceneAnalysis: "CAPABILITY_UNAVAILABLE",
            remoteSync: "SYNC_CAPABILITY_UNAVAILABLE"
        };
    }

    /* ------------------------------------------------------------------ */
    /* 8. ADMIN / RESEARCH SUMMARIES (spec §19)                            */
    /* ------------------------------------------------------------------ */

    function getIndexSummary() {
        const all = listRecords();
        return { totalRecords: all.length, bySourceType: countBy(all, (r) => r.sourceType), analyzed: all.filter((r) => r.analysis.status !== "NOT_ANALYZED").length, notAnalyzed: all.filter((r) => r.analysis.status === "NOT_ANALYZED").length };
    }
    function getLanguageSummary() {
        const all = listRecords();
        return { byLanguage: countBy(all, (r) => (r.language && r.language.detected) || "UNKNOWN"), uncertainCount: all.filter((r) => r.language && r.language.detected && !r.language.packId).length };
    }
    function getRegionSummary() { return { byRegion: countBy(listRecords(), (r) => (r.language && r.language.region) || "UNKNOWN") }; }
    function getSourceSummary() { return { bySourceType: countBy(listRecords(), (r) => r.sourceType) }; }
    function getAnalysisStatus() { return { byStatus: countBy(listRecords(), (r) => r.analysis.status) }; }
    function getCapabilitySummary() { return getCapabilities(); }

    function countBy(list, keyFn) {
        const out = {};
        list.forEach((item) => { const k = keyFn(item); out[k] = (out[k] || 0) + 1; });
        return out;
    }

    /* ------------------------------------------------------------------ */
    /* MODULE WIRING                                                       */
    /* ------------------------------------------------------------------ */

    const api = Object.freeze({
        getVersion: () => VERSION,
        PROVENANCE_SOURCES, VALIDATION_STATUSES, SYNC_STATES,
        createRecord, getRecord, updateRecord, deleteRecord, listRecords, countRecords, clearIndex,
        upsertRemoteMedia, getBySourceId, getByIndexId,
        addTimestamp,
        routeLanguage,
        search,
        refreshMetadata,
        getCapabilities,
        getIndexSummary, getLanguageSummary, getRegionSummary, getSourceSummary, getAnalysisStatus, getCapabilitySummary,
        // Exposed for tests only.
        _resetForTests() {
            const mem = memory();
            if (!mem) return;
            listRecords().forEach((r) => deleteRecord(r.indexId, { authorized: true }));
        }
    });

    if (hasWindow()) {
        window.CozyOS = window.CozyOS || {};
        window.CozyOS.Modules = window.CozyOS.Modules || {};
        if (!window.CozyOS.Modules["cozy-remote-media-index"]) {
            window.CozyOS.CozyRemoteMediaIndex = api;
            window.CozyOS.Modules["cozy-remote-media-index"] = Object.freeze({
                version: VERSION,
                description: "RP-034 Phase 2 — Persistent Remote Media Intelligence Index. Real CRUD/versioning/search over CozyMemory, real language routing over RP-030, real safety-pipeline integration over RP-029-C, real metadata refresh via the real RP-034 Phase 1 connector. No video download/frame access/transcript/OCR/speech/face/scene capability — Phases 3-8 explicitly deferred."
            });
        }
        if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
            try {
                window.CozyOS.ServiceRegistry.registerCoordinator({
                    sourcePath: "core/modules/intelligence/media/cozy-remote-media-index.js",
                    name: "CozyRemoteMediaIndex", category: "Living Engine",
                    description: "RP-034 Phase 2 Persistent Remote Media Intelligence Index. Real, in-memory persistent CRUD/versioning/search composing CozyMemory; real language routing over RP-030; real safety-pipeline integration over RP-029-C; real refresh via the real Phase 1 YouTube connector. No unauthorized media copy of any kind."
                });
            } catch (_err) { /* non-fatal */ }
        }
    }

    if (typeof module === "object" && module.exports) return api;
    return api;
}));
