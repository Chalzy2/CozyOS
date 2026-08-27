'use strict';

/**
 * core/security/google-account-link-client.js
 * CozyOS — Browser-side client for the real account-link-server.js HTTP
 * boundary (Prompt 10 STEP A).
 * Version: 1.0.0-ENTERPRISE
 *
 * WHAT THIS COMPOSES (never duplicates)
 *   Pure fetch() orchestration over the two real, already-tested
 *   server/auth/account-link-server.js routes:
 *     POST {baseUrl}/auth/session/issue  { userId }
 *       -> { success, token, expiresAt }
 *     POST {baseUrl}/auth/google/link    { linkSessionToken, idToken }
 *       -> { success, googleEmail? }
 *   This file verifies nothing itself, issues no cryptographic
 *   material itself, and stores no secret itself — it is a thin,
 *   honest transport layer over a server whose actual security model
 *   is documented in account-link-session-issuer.js and
 *   account-link-server.js. Never trust this module's return values
 *   as authorization by themselves; the server is still the sole
 *   authority (see those files' own headers).
 *
 * HONEST SCOPE — what this file does NOT do
 *   It does not obtain a real Google ID token. That requires the
 *   Google Identity Services JS SDK plus a real, configured OAuth
 *   client ID — repository-wide search (this milestone) confirms
 *   neither exists anywhere in CozyOS. Every function below accepts
 *   an already-obtained idToken as a parameter. Wiring an actual
 *   "Sign in with Google" button that produces one, and connecting it
 *   to linkGoogleAccountForCurrentUser() below, is real, separate,
 *   disclosed future work (see this milestone's implementation
 *   report) — not attempted here, since doing so now would mean
 *   either fabricating a fake Google sign-in flow or adding new login
 *   UI surface, both explicitly out of scope for this slice.
 *
 * baseUrl defaults to "" (same-origin relative paths). A page not
 * actually served by an account-link-server instance will get a real
 * network failure, surfaced honestly as reason:"NETWORK_ERROR" —
 * never silently swallowed or treated as success.
 *
 * Works unmodified in both a browser (global `window`) and Node
 * (global `fetch`, Node >=18) — the same dual-environment shape every
 * other core/security/*.js file in this repository already uses, so
 * this file can be both loaded on a real page and required directly
 * by its own real, real-HTTP-server-backed test.
 */
(function () {
    const root = typeof window !== "undefined" ? window : global;
    root.CozyOS = root.CozyOS || {};

    const GOOGLE_ACCOUNT_LINK_CLIENT_VERSION = "1.0.0-ENTERPRISE";

    async function postJson(baseUrl, path, body) {
        let response;
        try {
            response = await fetch(`${baseUrl}${path}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
        } catch (e) {
            return { networkError: true, error: e && e.message };
        }
        let json = null;
        try { json = await response.json(); } catch (_e) { /* non-JSON error body — treated as failure below */ }
        return { ok: response.ok, status: response.status, body: json };
    }

    /**
     * issueLinkSession(userId, { baseUrl } = {})
     *   Real call to POST /auth/session/issue. The server independently
     *   mints and persists the token — this function never fabricates
     *   or caches one itself. Returns:
     *     { success:true, token, expiresAt }
     *     { success:false, reason }
     */
    async function issueLinkSession(userId, { baseUrl = "" } = {}) {
        if (typeof userId !== "string" || !userId) {
            return { success: false, reason: "MISSING_USER_ID" };
        }
        const result = await postJson(baseUrl, "/auth/session/issue", { userId });
        if (result.networkError) return { success: false, reason: "NETWORK_ERROR" };
        if (!result.ok || !result.body || result.body.success !== true) {
            return { success: false, reason: (result.body && result.body.reason) || "SESSION_ISSUE_FAILED" };
        }
        return { success: true, token: result.body.token, expiresAt: result.body.expiresAt };
    }

    /**
     * linkGoogleAccount(linkSessionToken, idToken, { baseUrl } = {})
     *   Real call to POST /auth/google/link. Deliberately never sends a
     *   userId field — the server resolves the account exclusively from
     *   linkSessionToken, matching the server's own documented, tested
     *   contract (Prompt 10 §6: a client can never select an account by
     *   asserting one). Returns:
     *     { success:true, googleEmail }
     *     { success:false, reason }
     */
    async function linkGoogleAccount(linkSessionToken, idToken, { baseUrl = "" } = {}) {
        if (typeof linkSessionToken !== "string" || !linkSessionToken || typeof idToken !== "string" || !idToken) {
            return { success: false, reason: "MISSING_FIELDS" };
        }
        const result = await postJson(baseUrl, "/auth/google/link", { linkSessionToken, idToken });
        if (result.networkError) return { success: false, reason: "NETWORK_ERROR" };
        if (!result.ok || !result.body || result.body.success !== true) {
            return { success: false, reason: (result.body && result.body.reason) || "LINK_FAILED" };
        }
        return { success: true, googleEmail: result.body.googleEmail };
    }

    /**
     * linkGoogleAccountForCurrentUser(userId, idToken, opts = {})
     *   Convenience orchestration a future real "Link Google" click
     *   handler would call: issueLinkSession() then linkGoogleAccount()
     *   in sequence, surfacing which stage failed. NOT wired to any
     *   button this milestone (see file header) — this is the real,
     *   tested building block that wiring would call. userId is used
     *   only for the issue step; it is never forwarded to the link
     *   step, matching the two functions above.
     */
    async function linkGoogleAccountForCurrentUser(userId, idToken, opts = {}) {
        const issued = await issueLinkSession(userId, opts);
        if (!issued.success) return { success: false, reason: issued.reason, stage: "ISSUE" };
        const linked = await linkGoogleAccount(issued.token, idToken, opts);
        if (!linked.success) return { success: false, reason: linked.reason, stage: "LINK" };
        return { success: true, googleEmail: linked.googleEmail };
    }

    const api = {
        VERSION: GOOGLE_ACCOUNT_LINK_CLIENT_VERSION,
        issueLinkSession,
        linkGoogleAccount,
        linkGoogleAccountForCurrentUser,
    };

    root.CozyOS.GoogleAccountLinkClient = api;
    if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
