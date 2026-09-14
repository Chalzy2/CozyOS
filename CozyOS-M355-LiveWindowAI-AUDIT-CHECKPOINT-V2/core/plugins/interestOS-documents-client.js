/**
 * core/plugins/interestOS-documents-client.js
 * InterestOS Phase 2, Dependency #4 — Durable Document Access (wiring only).
 *
 * ARCHITECTURAL DISCIPLINE:
 *   This is NOT a document engine, storage engine, or provider. It is a
 *   thin real HTTP client that calls the exact same, already-real,
 *   already-authorized server routes the Document Ownership Foundation
 *   phase built (server/webauthn-rp/server.js: /documents* for
 *   organizations, /documents/personal* for individual users) — the
 *   same routes a registered DocumentEngine storage provider would
 *   itself call. window.CozyOS.DocumentEngine and its providers are
 *   deliberately NOT used here: the real, existing durable provider
 *   (cozy-document-durable-storage-provider.js) is fixed to exactly one
 *   organizationId for its whole registered lifetime (confirmed by
 *   reading its constructor during the earlier wiring audit) — it
 *   cannot serve a personal user and an organization user from the
 *   same page-wide registration, and InterestOS must support both
 *   without ever fabricating an organization for a personal user. This
 *   file exists ONLY because that per-call ownership flexibility has
 *   no home yet in the shared provider contract; it duplicates no
 *   storage/versioning logic of its own — every real operation is a
 *   direct fetch() to the real server, identical in shape to what the
 *   durable provider itself sends.
 *
 * SCOPE: wiring only. No UI. No My Documents surface, no upload/PDF/
 * scan/share UI — those remain a later increment.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    /**
     * resolveDocumentContext()
     *   Real trace: iframe -> window.parent.CozyOS.Session (same
     *   same-origin fallback InterestOS's own resolveActorId() already
     *   established) -> Session.current() -> {uid, company}. Never
     *   invents an organization: a user with no real company reference
     *   is honestly routed to the personal path, never a fabricated
     *   "personal organization" or a default/placeholder org id.
     */
    function resolveDocumentContext() {
        const session = (window.CozyOS && window.CozyOS.Session)
            || (window.parent && window.parent.CozyOS && window.parent.CozyOS.Session);
        if (!session || typeof session.current !== "function") {
            return { available: false, reason: "Session is not connected." };
        }
        const snap = session.current();
        if (!snap || !snap.uid) {
            return { available: false, reason: "No authenticated user — sign in before accessing documents." };
        }
        const organizationId = snap.company && snap.company.companyId ? snap.company.companyId : null;
        return {
            available: true,
            actorId: snap.uid,
            mode: organizationId ? "organization" : "personal",
            organizationId,
            // Real, same-origin backend — confirmed during the earlier
            // durability audit that no separate host/config is needed;
            // an empty baseUrl resolves relative to this page's own
            // origin, exactly like cozy-document-durable-storage-
            // provider.js's own real #post() already does.
            baseUrl: ""
        };
    }

    async function realFetch(path, body) {
        let res;
        try {
            res = await fetch(path, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body || {})
            });
        } catch (networkErr) {
            // Real, honest network/backend failure — never fabricates a
            // success or silently falls back to an in-memory store.
            return { available: false, reason: `Document backend unreachable: ${networkErr.message}` };
        }
        let json;
        try { json = await res.json(); } catch (_e) { json = {}; }
        if (res.status === 401) return { available: false, reason: "Not authenticated." };
        if (res.status === 403) return { available: false, reason: "Not authorized." };
        if (!res.ok && json.available === undefined) return { available: false, reason: json.error || `Request failed (${res.status}).` };
        return json;
    }

    /**
     * realBinaryUpload(path, headers, content)
     *   Real binary upload — same header-based convention the server's
     *   own real routes already require (X-Cozy-Document-Id, X-Cozy-
     *   Filename, and X-Cozy-Organization-Id for the organization path
     *   only). Reuses the exact same fetch()/credentials/error-mapping
     *   pattern realFetch() already established, just with a raw body
     *   instead of a JSON one — no second HTTP layer.
     */
    async function realBinaryUpload(path, headers, content) {
        let res;
        try {
            res = await fetch(path, { method: "POST", credentials: "same-origin", headers, body: content });
        } catch (networkErr) {
            return { available: false, reason: `Document backend unreachable: ${networkErr.message}` };
        }
        let json;
        try { json = await res.json(); } catch (_e) { json = {}; }
        if (res.status === 401) return { available: false, reason: "Not authenticated." };
        if (res.status === 403) return { available: false, reason: "Not authorized." };
        if (res.status === 413) return { available: false, reason: json.error || "File is too large." };
        if (!res.ok && json.available === undefined) return { available: false, reason: json.error || `Request failed (${res.status}).` };
        return json;
    }

    /**
     * realBinaryDownload(url)
     *   Real binary download — the same 401/403/404 handling as every
     *   other method, but returns a real Blob (never JSON-decoded)
     *   plus the same real metadata the server attaches as headers.
     */
    async function realBinaryDownload(url) {
        let res;
        try {
            res = await fetch(url, { credentials: "same-origin" });
        } catch (networkErr) {
            return { available: false, reason: `Document backend unreachable: ${networkErr.message}` };
        }
        if (res.status === 401) return { available: false, reason: "Not authenticated." };
        if (res.status === 403) return { available: false, reason: "Not authorized." };
        if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            return { available: false, reason: json.error || `Request failed (${res.status}).` };
        }
        const blob = await res.blob();
        return {
            available: true,
            blob,
            mimeType: res.headers.get("content-type") || "application/octet-stream",
            size: Number(res.headers.get("content-length")) || blob.size,
            checksum: res.headers.get("x-cozy-checksum-sha256") || null
        };
    }

    /**
     * Every method below resolves the real context fresh on each call
     * (never cached) so a context that becomes invalid between calls
     * (signed out, organization changed) is never silently reused.
     * organizationId is REQUIRED for the organization path and is
     * always the real value from Session — never accepted as a
     * parameter here, so a caller can never substitute a different
     * organization than the one the real session actually holds.
     */
    function withContext(fn) {
        return async (...args) => {
            const ctx = resolveDocumentContext();
            if (!ctx.available) return ctx;
            if (ctx.mode === "organization" && !ctx.organizationId) {
                // Real, honest fail-closed: this specific branch should be
                // unreachable given resolveDocumentContext()'s own logic
                // (mode is only "organization" when organizationId is
                // already real and non-null), but is asserted explicitly
                // so a future change to that function can never silently
                // send an organization-scoped request with no real
                // organization attached.
                return { available: false, reason: "Organization-scoped operation requested with no valid organization." };
            }
            return fn(ctx, ...args);
        };
    }

    const InterestOSDocumentsClient = {
        resolveDocumentContext,

        saveDocument: withContext((ctx, record) => {
            return ctx.mode === "personal"
                ? realFetch(`${ctx.baseUrl}/documents/personal`, { record })
                : realFetch(`${ctx.baseUrl}/documents`, { organizationId: ctx.organizationId, record });
        }),

        loadDocument: withContext((ctx, documentId) => {
            return ctx.mode === "personal"
                ? realFetch(`${ctx.baseUrl}/documents/personal/load`, { documentId })
                : realFetch(`${ctx.baseUrl}/documents/load`, { organizationId: ctx.organizationId, documentId });
        }),

        searchDocuments: withContext((ctx, filters) => {
            return ctx.mode === "personal"
                ? realFetch(`${ctx.baseUrl}/documents/personal/search`, { filters })
                : realFetch(`${ctx.baseUrl}/documents/search`, { organizationId: ctx.organizationId, filters });
        }),

        archiveDocument: withContext((ctx, documentId) => {
            return ctx.mode === "personal"
                ? realFetch(`${ctx.baseUrl}/documents/personal/archive`, { documentId })
                : realFetch(`${ctx.baseUrl}/documents/archive`, { organizationId: ctx.organizationId, documentId });
        }),

        restoreDocument: withContext((ctx, documentId) => {
            return ctx.mode === "personal"
                ? realFetch(`${ctx.baseUrl}/documents/personal/restore`, { documentId })
                : realFetch(`${ctx.baseUrl}/documents/restore`, { organizationId: ctx.organizationId, documentId });
        }),

        deleteDocument: withContext((ctx, documentId) => {
            return ctx.mode === "personal"
                ? realFetch(`${ctx.baseUrl}/documents/personal/delete`, { documentId })
                : realFetch(`${ctx.baseUrl}/documents/delete`, { organizationId: ctx.organizationId, documentId });
        }),

        /**
         * uploadDocument(documentId, content, {filename, mimeType})
         *   Real binary upload, routed exactly like every metadata
         *   method above: personal -> /documents/personal/binary (no
         *   organization header at all), organization ->
         *   /documents/binary (real X-Cozy-Organization-Id header, the
         *   real value from Session, never client-invented). content
         *   is passed straight through to fetch() as the request body
         *   (Blob/File/ArrayBuffer/string) - no re-encoding, matching
         *   the server's own real streaming-body expectation.
         */
        uploadDocument: withContext((ctx, documentId, content, { filename = null, mimeType = "application/octet-stream" } = {}) => {
            const headers = {
                "Content-Type": mimeType,
                "X-Cozy-Document-Id": documentId,
                ...(filename ? { "X-Cozy-Filename": encodeURIComponent(filename) } : {})
            };
            if (ctx.mode === "personal") {
                return realBinaryUpload(`${ctx.baseUrl}/documents/personal/binary`, headers, content);
            }
            headers["X-Cozy-Organization-Id"] = ctx.organizationId;
            return realBinaryUpload(`${ctx.baseUrl}/documents/binary`, headers, content);
        }),

        /**
         * downloadDocument(documentId)
         *   Real binary download, same personal/organization routing.
         *   Returns a real Blob plus real server-reported metadata
         *   (mimeType/size/checksum) - never fabricates content or a
         *   checksum InterestOS computed itself.
         */
        downloadDocument: withContext((ctx, documentId) => {
            if (ctx.mode === "personal") {
                const url = new URL(`${ctx.baseUrl}/documents/personal/binary`, window.location.origin);
                url.searchParams.set("documentId", documentId);
                return realBinaryDownload(url.toString());
            }
            const url = new URL(`${ctx.baseUrl}/documents/binary`, window.location.origin);
            url.searchParams.set("organizationId", ctx.organizationId);
            url.searchParams.set("documentId", documentId);
            return realBinaryDownload(url.toString());
        })
    };

    window.CozyOS.InterestOSDocumentsClient = InterestOSDocumentsClient;
})();
