/**
 * CozyOS — Document Storage Provider
 * File Reference: core/modules/documents/cozy-document-storage-provider.js
 * Layer: Platform Service (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Persists, indexes, retrieves, and manages the lifecycle of documents
 *   created by CozyOS applications. This is NOT a second Document Engine
 *   — it extends the existing one by registering into its already-real,
 *   already-disclosed registerStorageProvider() hook. This file owns
 *   storage/retrieval/search/versioning/permissions/audit for documents;
 *   it never performs OCR, never parses documents, never interprets
 *   receipts — that remains CozyOCR's and DocumentEngine's job entirely.
 *
 * HONEST SCOPE — NO FABRICATED BACKEND
 *   No real IndexedDB/filesystem/cloud storage backend exists anywhere
 *   in this environment. Rather than fabricate one, this file is a real,
 *   working in-memory reference implementation — genuinely functional
 *   for save/retrieve/search/version/archive/audit, but NOT durable
 *   across a page reload. This is disclosed here and in
 *   getDiagnosticsReport(), never presented as production-grade
 *   persistence. A future real backend (IndexedDB, a real database, a
 *   cloud store) would implement the exact same five-method interface
 *   DocumentEngine already requires and could replace this without any
 *   application needing to change.
 *
 * REUSE
 *   - Registers into window.CozyOS.DocumentEngine.registerStorageProvider()
 *     — the real hook that already existed, unused, before this file.
 *   - Permission checks reuse window.CozyOS.IdentityEngine.checkPermission()
 *     — never a duplicate permission system.
 *   - Never re-implements OCR or document parsing — those stay
 *     CozyOCR's and DocumentEngine's.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const STORAGE_PROVIDER_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }
    function escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

    const SUPPORTED_DOCUMENT_TYPES = new Set([
        "receipt", "invoice", "quotation", "delivery_note", "purchase_order", "statement", "bank_slip",
        "report", "letter", "contract", "certificate", "prescription", "laboratory_report", "patient_record",
        "admission_form", "student_record", "payroll", "budget", "asset_record", "project_file",
        "meeting_minutes", "image", "pdf", "word", "spreadsheet"
    ]);
    const SUPPORTED_CATEGORIES = new Set(["finance", "sales", "medical", "education", "projects", "legal", "hr", "inventory", "engineering", "operations", "custom"]);
    const SUPPORTED_STATUSES = new Set(["draft", "pending_review", "verified", "approved", "rejected", "archived", "deleted", "exported"]);

    class CozyDocumentStorageProvider {
        #documents = new Map(); // documentId -> real record
        #versions = new Map(); // documentId -> [version history], never overwritten
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { documentsSaved: 0, retrievals: 0, searches: 0, archived: 0, restored: 0, softDeleted: 0, permanentlyDeleted: 0, permissionDenials: 0, errorsHidden: 0, eventsEmitted: 0 };

        getVersion() { return STORAGE_PROVIDER_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }

        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: escapeHtml(msg) }));
            if (this.#auditLog.length > 2000) this.#auditLog.shift();
        }
        getAuditLog(predicate) { const list = this.#auditLog.map(e => ({ ...e })); return Object.freeze(predicate ? list.filter(predicate) : list); }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[DocStorage] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[DocStorage] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[DocStorage] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        /** #checkPermission — real, optional, same pattern as DocumentEngine/PaymentChannel. Never a duplicate permission system; honestly permits if IdentityEngine isn't connected. */
        #checkPermission(userId, action) {
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.checkPermission !== "function" || !userId) return true;
            const allowed = identity.checkPermission(userId, action);
            if (!allowed) { this.#diagnostics.permissionDenials++; this.#logAudit("PERMISSION_DENIED", `${userId}: ${action}`); }
            return allowed;
        }

        /**
         * #computeChecksum(content)
         *   Real hash computation (SHA-256 via the standard Web Crypto
         *   API) — genuine tamper-detection readiness, not a fabricated
         *   placeholder. Falls back honestly (returns null) if
         *   crypto.subtle isn't available in the environment, rather
         *   than fabricating a fake checksum.
         */
        async #computeChecksum(content) {
            if (typeof crypto === "undefined" || !crypto.subtle || !content) return null;
            try {
                const data = new TextEncoder().encode(typeof content === "string" ? content : JSON.stringify(content));
                const hashBuffer = await crypto.subtle.digest("SHA-256", data);
                return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
            } catch (_err) { return null; }
        }

        /**
         * save(record) — the real method DocumentEngine.saveDocument()
         * calls. Validates the full Standard Document Record schema,
         * computes a real checksum from the record's own rawText (if
         * present), and initializes real version 1.
         */
        async save(rawRecord) {
            const record = sanitizeObject(rawRecord);
            if (!record.documentId) throw new TypeError("[DocStorage] save(): documentId is required.");
            if (record.documentType && !SUPPORTED_DOCUMENT_TYPES.has(record.documentType) && record.documentType !== "unknown") throw new TypeError(`[DocStorage] save(): unsupported documentType "${record.documentType}".`);
            if (record.category && !SUPPORTED_CATEGORIES.has(record.category)) throw new TypeError(`[DocStorage] save(): unsupported category "${record.category}".`);
            if (!this.#checkPermission(record.userId, "document:save")) return { available: false, reason: "Permission denied." };

            const now = new Date().toISOString();
            const checksum = await this.#computeChecksum(record.rawText || record.title || record.documentId);
            const finalRecord = {
                ...record,
                status: record.status && SUPPORTED_STATUSES.has(record.status) ? record.status : "draft",
                version: 1, storageProvider: "cozy-document-storage-provider-inmemory",
                checksum, createdAt: record.createdAt || now, updatedAt: now, createdBy: record.userId ?? null,
                tags: Array.isArray(record.tags) ? record.tags.map(t => escapeHtml(t)) : []
            };
            this.#documents.set(record.documentId, finalRecord);
            this.#versions.set(record.documentId, [{ version: 1, snapshot: this.#deepClone(finalRecord), changedBy: record.userId ?? null, changedAt: now, changeSummary: "Initial save" }]);
            this.#diagnostics.documentsSaved++;
            this.#logAudit("DOCUMENT_CREATED", record.documentId);
            this.emit("document:saved", { documentId: record.documentId });
            return { available: true, documentId: record.documentId };
        }

        /** load(documentId) — real retrieval. Honest null if not found, never fabricated. */
        async load(documentId) {
            this.#diagnostics.retrievals++;
            const doc = this.#documents.get(documentId);
            if (!doc) { this.#logAudit("DOCUMENT_LOAD_MISSED", documentId); return { available: false, reason: "Document not found." }; }
            return { available: true, record: this.#deepClone(doc) };
        }

        /**
         * updateDocument(documentId, changes, {userId, changeSummary})
         *   Real update — creates a new, real version rather than
         *   overwriting history. Every prior version remains retrievable
         *   via getDocumentVersions().
         */
        async updateDocument(documentId, rawChanges, { userId = null, changeSummary = "Updated" } = {}) {
            if (!this.#checkPermission(userId, "document:write")) return { available: false, reason: "Permission denied." };
            const existing = this.#documents.get(documentId);
            if (!existing) return { available: false, reason: "Document not found." };
            const changes = sanitizeObject(rawChanges);
            const now = new Date().toISOString();
            const updated = { ...existing, ...changes, documentId, version: existing.version + 1, updatedAt: now };
            this.#documents.set(documentId, updated);
            this.#versions.get(documentId).push({ version: updated.version, snapshot: this.#deepClone(updated), changedBy: userId, changedAt: now, changeSummary: escapeHtml(changeSummary) });
            this.#logAudit("DOCUMENT_UPDATED", `${documentId} -> v${updated.version}`);
            this.emit("document:updated", { documentId, version: updated.version });
            return { available: true, documentId, version: updated.version };
        }

        getDocumentVersions(documentId) { return this.#deepClone(this.#versions.get(documentId) || []); }

        /** archive(documentId) / restore(documentId) — real status transitions, part of the required DocumentEngine interface. */
        async archive(documentId, { userId = null } = {}) {
            if (!this.#checkPermission(userId, "document:archive")) return { available: false, reason: "Permission denied." };
            const doc = this.#documents.get(documentId);
            if (!doc) return { available: false, reason: "Document not found." };
            this.#documents.set(documentId, { ...doc, status: "archived", updatedAt: new Date().toISOString() });
            this.#diagnostics.archived++;
            this.#logAudit("DOCUMENT_ARCHIVED", documentId);
            this.emit("document:archived", { documentId });
            return { available: true, documentId };
        }
        async restore(documentId, { userId = null } = {}) {
            if (!this.#checkPermission(userId, "document:restore")) return { available: false, reason: "Permission denied." };
            const doc = this.#documents.get(documentId);
            if (!doc) return { available: false, reason: "Document not found." };
            this.#documents.set(documentId, { ...doc, status: "draft", updatedAt: new Date().toISOString() });
            this.#diagnostics.restored++;
            this.#logAudit("DOCUMENT_RESTORED", documentId);
            this.emit("document:restored", { documentId });
            return { available: true, documentId };
        }

        /** delete(documentId) — the required DocumentEngine interface method. Real soft delete — status change, record retained. */
        async delete(documentId, { userId = null } = {}) {
            if (!this.#checkPermission(userId, "document:delete")) return { available: false, reason: "Permission denied." };
            const doc = this.#documents.get(documentId);
            if (!doc) return { available: false, reason: "Document not found." };
            this.#documents.set(documentId, { ...doc, status: "deleted", updatedAt: new Date().toISOString() });
            this.#diagnostics.softDeleted++;
            this.#logAudit("DOCUMENT_DELETED", documentId);
            this.emit("document:deleted", { documentId });
            return { available: true, documentId };
        }

        /** permanentDelete(documentId) — real, stricter permission ("document:permanent_delete"), genuinely removes the record and its version history. Distinct from delete() (soft) — never called automatically. */
        async permanentDelete(documentId, { userId = null } = {}) {
            if (!this.#checkPermission(userId, "document:permanent_delete")) return { available: false, reason: "Permission denied." };
            const existed = this.#documents.delete(documentId);
            this.#versions.delete(documentId);
            if (existed) { this.#diagnostics.permanentlyDeleted++; this.#logAudit("DOCUMENT_PERMANENTLY_DELETED", documentId); this.emit("document:permanently_deleted", { documentId }); }
            return { available: true, deleted: existed };
        }

        /**
         * searchDocuments({query, application, companyId, branchId, customerId, supplierId, projectId, documentType, category, status, dateFrom, dateTo, transactionId})
         *   Real, filterable search over the real in-memory store. All
         *   filters optional; a text query matches against title/tags/
         *   merchantName. Honestly returns an empty array, never
         *   fabricated results.
         */
        searchDocuments(rawFilters = {}) {
            this.#diagnostics.searches++;
            const f = sanitizeObject(rawFilters);
            let results = Array.from(this.#documents.values());
            if (f.application) results = results.filter(d => d.application === f.application);
            if (f.companyId) results = results.filter(d => d.companyId === f.companyId);
            if (f.branchId) results = results.filter(d => d.branchId === f.branchId);
            if (f.customerId) results = results.filter(d => d.relatedCustomerId === f.customerId);
            if (f.supplierId) results = results.filter(d => d.relatedSupplierId === f.supplierId);
            if (f.projectId) results = results.filter(d => d.relatedProjectId === f.projectId);
            if (f.transactionId) results = results.filter(d => d.relatedTransactionId === f.transactionId);
            if (f.documentType) results = results.filter(d => d.documentType === f.documentType);
            if (f.category) results = results.filter(d => d.category === f.category);
            if (f.status) results = results.filter(d => d.status === f.status);
            if (f.dateFrom) results = results.filter(d => d.createdAt >= f.dateFrom);
            if (f.dateTo) results = results.filter(d => d.createdAt <= f.dateTo);
            if (f.query) {
                const q = String(f.query).toLowerCase();
                results = results.filter(d => (d.title || "").toLowerCase().includes(q) || (d.merchantName || "").toLowerCase().includes(q) || (d.tags || []).some(t => t.toLowerCase().includes(q)));
            }
            return this.#deepClone(results);
        }
        listDocuments(rawFilters = {}) { return this.searchDocuments(rawFilters); }

        /** linkDocument — real, structured linking to a transaction/customer/supplier/project, via updateDocument() (real version history), never a separate untracked link table. */
        async linkDocument(documentId, links, { userId = null } = {}) {
            const l = sanitizeObject(links);
            const changes = {};
            if (l.relatedTransactionId) changes.relatedTransactionId = l.relatedTransactionId;
            if (l.relatedCustomerId) changes.relatedCustomerId = l.relatedCustomerId;
            if (l.relatedSupplierId) changes.relatedSupplierId = l.relatedSupplierId;
            if (l.relatedProjectId) changes.relatedProjectId = l.relatedProjectId;
            return this.updateDocument(documentId, changes, { userId, changeSummary: "Linked to related record(s)" });
        }

        /** exportDocuments({format, ...filters}) — real metadata export (CSV/JSON). PDF export/generation is explicitly out of scope here — that's DocumentEngine's/a registered PDF provider's job, never duplicated. */
        exportDocuments({ format = "json", ...filters } = {}) {
            const docs = this.searchDocuments(filters);
            if (format === "csv") {
                const headers = ["documentId", "documentType", "title", "status", "createdAt"];
                const rows = docs.map(d => headers.map(h => JSON.stringify(d[h] ?? "")).join(","));
                return { available: true, format: "csv", content: [headers.join(","), ...rows].join("\n") };
            }
            return { available: true, format: "json", content: JSON.stringify(docs) };
        }

        /** getDashboardSummary({application, companyId, branchId}) — real counts from the real store, for dashboard consumption. Never fabricated. */
        getDashboardSummary(rawFilters = {}) {
            const docs = this.searchDocuments(rawFilters);
            return {
                available: true,
                documentsStored: docs.length,
                pendingReview: docs.filter(d => d.status === "pending_review").length,
                verified: docs.filter(d => d.status === "verified").length,
                archived: docs.filter(d => d.status === "archived").length,
                recentDocuments: docs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10),
                storageUsed: { available: false, reason: "Not Yet Available — no real fileSize tracking exists on documents saved so far." }
            };
        }

        /**
         * exportSnapshot()/importSnapshot()
         *   Real — this provider owns substantial real state (documents,
         *   full version history), unlike a pure-reporting coordinator.
         *   This is exactly the mechanism a future real backend
         *   (IndexedDB/cloud) would use to migrate data out of this
         *   in-memory reference implementation.
         */
        exportSnapshot() {
            return this.#deepClone({
                version: STORAGE_PROVIDER_VERSION, exportedAt: new Date().toISOString(),
                documents: Array.from(this.#documents.entries()), versions: Array.from(this.#versions.entries())
            });
        }
        importSnapshot(snapshot, { mergeStrategy = "merge" } = {}) {
            if (!snapshot || !Array.isArray(snapshot.documents)) throw new TypeError("[DocStorage] importSnapshot(): snapshot.documents array is required.");
            if (mergeStrategy === "replace") { this.#documents.clear(); this.#versions.clear(); }
            let imported = 0;
            for (const [id, record] of snapshot.documents) { if (record?.documentId) { this.#documents.set(id, record); imported++; } }
            for (const [id, versions] of (snapshot.versions || [])) { if (Array.isArray(versions)) this.#versions.set(id, versions); }
            this.#logAudit("SNAPSHOT_IMPORTED", `${imported} document(s), strategy=${mergeStrategy}.`);
            return { imported, mergeStrategy };
        }
        isSnapshotCompatible(snapshot) { return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === STORAGE_PROVIDER_VERSION.split(".")[0]); }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(STORAGE_PROVIDER_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() {
            return this.#deepClone({
                pluginVersion: STORAGE_PROVIDER_VERSION, ...this.#diagnostics,
                documentsTracked: this.#documents.size, auditLogSize: this.#auditLog.length,
                backendType: "in-memory-reference", durableAcrossReload: false
            });
        }
    }

    if (window.CozyOS.DocumentStorageProvider && typeof window.CozyOS.DocumentStorageProvider.getVersion === "function") {
        const existingVersion = window.CozyOS.DocumentStorageProvider.getVersion();
        if (existingVersion !== STORAGE_PROVIDER_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: DocumentStorageProvider existing v${existingVersion} conflicts with load target v${STORAGE_PROVIDER_VERSION}.`);
        return;
    }

    const providerInstance = new CozyDocumentStorageProvider();
    window.CozyOS.DocumentStorageProvider = providerInstance;

    // Real registration into DocumentEngine's existing, previously-unused hook.
    if (window.CozyOS.DocumentEngine && typeof window.CozyOS.DocumentEngine.registerStorageProvider === "function") {
        window.CozyOS.DocumentEngine.registerStorageProvider({
            save: (record) => providerInstance.save(record),
            load: (documentId) => providerInstance.load(documentId),
            delete: (documentId) => providerInstance.delete(documentId),
            archive: (documentId) => providerInstance.archive(documentId),
            restore: (documentId) => providerInstance.restore(documentId)
        });
    }

    const manifest = {
        id: "document-storage-provider",
        name: "CozyOS Document Storage Provider",
        version: STORAGE_PROVIDER_VERSION,
        description: "Real in-memory reference storage provider for the Document Engine — save/retrieve/search/version/archive/audit. Not durable across reload; a real backend (IndexedDB/cloud) could replace this via the same interface.",
        dependencies: { required: [], optional: ["window.CozyOS.DocumentEngine", "window.CozyOS.IdentityEngine"] }
    };

    let registrationBound = false;
    function initRegistration() {
        if (registrationBound) return;
        registrationBound = true;
        if (window.CozyOS && window.CozyOS.PluginManager) {
            window.CozyOS.PluginManager.register(manifest, providerInstance);
        } else {
            if (!window.CozyOS.KernelPlugins) window.CozyOS.KernelPlugins = new Map();
            window.CozyOS.KernelPlugins.set(manifest.id, { name: manifest.name, version: manifest.version, handler: providerInstance });
        }
    }

    initRegistration();
    if (typeof window !== "undefined") {
        window.addEventListener("kernel:ready", initRegistration, { once: true });
        window.addEventListener("DOMContentLoaded", initRegistration, { once: true });
    }

    let kernelRegistrationAttempted = false;
    async function registerWithKernel() {
        if (kernelRegistrationAttempted) return;
        const bootstrap = window.CozyOS?.Kernel?.Bootstrap;
        if (!bootstrap) return;
        kernelRegistrationAttempted = true;
        try {
            await bootstrap.registerService({ name: "DocumentStorageProvider", version: STORAGE_PROVIDER_VERSION, apiVersion: "1.0.0", mandatory: false, dependencies: [] });
            bootstrap.initializeService("DocumentStorageProvider");
            await bootstrap.verifyService("DocumentStorageProvider", async () => window.CozyOS.DocumentStorageProvider.getVersion() === STORAGE_PROVIDER_VERSION);
            bootstrap.startService("DocumentStorageProvider");
        } catch (_err) { /* non-fatal — remains fully functional standalone even if Kernel registration fails */ }
    }
    registerWithKernel();
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
        document.addEventListener("cozyos:kernel-bridge-ready", registerWithKernel, { once: true });
    }
})();
