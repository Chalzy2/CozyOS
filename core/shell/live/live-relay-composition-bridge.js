/**
 * core/shell/live/live-relay-composition-bridge.js
 * CozyOS — Live Distribution — Firebase/LDCE ↔ Relay Composition Bridge
 * Phase 6 Patch #6 (implements the gap PATCH5-AUDIT-REPORT.md left open)
 *
 * REAL SCOPE DISCLOSURE
 *   PATCH5-AUDIT-REPORT.md (Step 6) found that no production file owned
 *   the connection between the shipped Firebase/LDCE identity world and
 *   the already-tested server-backed relay world. This file IS that
 *   "integrating call site" —
 *   core/modules/media/cozy-live-participation-controller.js's own
 *   header already documents, by name, that such a call site "MUST"
 *   exist and route RemoteRelayTransportProvider's onEvent into
 *   ParticipationController.handleTransportEvent(). Until this file, no
 *   such call site existed anywhere in the repository.
 *
 *   This file creates NO new identity source, session owner, authority,
 *   or transport. It only composes real, already-tested pieces, in the
 *   order their own files already require:
 *     - identity        window.CozyOS.Firebase.Auth (real SDK passthrough,
 *                        already loaded by dashboard.html)
 *     - assertion        POST <relayHttpUrl>/identity/assertion
 *                        (server/live-relay, Patch #4, real + tested)
 *     - participation     POST <relayHttpUrl>/session/:id/token/:sub
 *       token             or .../register-host/:hostId (SessionAuthority /
 *                        LdceRosterBridge, Patch #1-3, real + tested)
 *     - transport        CozyOS.CozyLiveRemoteRelayTransportProvider
 *                        (Phase 3A, real + tested)
 *     - speaking client   CozyOS.CozyLiveParticipationController
 *                        (Phase 4A, real + tested) — this file fills its
 *                        documented, previously-empty onEvent wiring seam
 *                        and nothing else.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 *   - Does not decide WHEN a session should use this relay path instead
 *     of, or alongside, LDCESessionEngine's existing Firestore mesh
 *     signaling. That product decision is still open — see
 *     PATCH5-AUDIT-REPORT.md's Step-6 options A/B/C/D. This file is the
 *     mechanism a caller uses ONCE that decision is made for a given
 *     session; it is not itself that decision, and it is not wired into
 *     LDCESessionEngine or any shipped page by this patch.
 *   - Does not replace LDCESessionEngine as session/roster/language
 *     owner. It only accepts a sessionId that engine already created.
 *   - Does not touch IdentityEngine, SessionAuthority,
 *     RemoteRelayTransportProvider, CozyLiveParticipationController,
 *     CozyLiveMediaTransportSelector, or CozyLiveDistributionTransport
 *     internals — all consumed exactly as their own files already
 *     specify, none modified by this patch (see protected-file audit).
 *
 * A DOCUMENTATION DISCREPANCY THIS FILE WORKS AROUND, NOT REPRODUCES
 *   cozy-live-participation-controller.js's own header illustrates:
 *     const controller = new CozyLiveParticipationController({ ..., transportProvider, ... });
 *     const provider = new RemoteRelayTransportProvider({ ... });
 *   — but that constructs `controller` first while referencing a
 *   `transportProvider` binding that doesn't exist yet (the `provider`
 *   const on the next line hasn't been declared). Literally following
 *   that order throws. This file instead constructs the provider FIRST,
 *   with an onEvent closure that forwards to a controller reference
 *   filled in immediately after (before any real network event can
 *   arrive, since WebSocket "open" is always async) — satisfying the
 *   same "provider's onEvent must reach the controller" requirement
 *   without the ordering bug.
 *
 * KNOWN LIMITATION — TOKEN FRESHNESS ACROSS RECONNECTS
 *   RemoteRelayTransportProvider._open() calls opts.getToken(sessionId,
 *   role, sub) SYNCHRONOUSLY on every connect AND every reconnect (see
 *   that file: the return value is used directly, never awaited). A
 *   real network fetch cannot happen inside a synchronous callback.
 *   This bridge therefore fetches ONE participation token before
 *   constructing the provider and returns that same cached token on
 *   every subsequent reconnect via a closure. If a deployment's token
 *   TTL is shorter than a real connection's lifetime, a reconnect after
 *   expiry will be rejected server-side. Refreshing the token on
 *   reconnect is a real, disclosed follow-on dependency — not solved
 *   here, not fabricated as solved here.
 *
 * KNOWN LIMITATION — NO PRODUCTION CALLER YET
 *   This file is real, tested composition logic. Nothing in
 *   dashboard.html or any other shipped page calls it yet. Wiring it in
 *   is the product decision described above, deliberately left for a
 *   separate change.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CozyOS = root.CozyOS || {};
        root.CozyOS.LiveRelayCompositionBridge = factory().LiveRelayCompositionBridge;
    }
})(typeof window !== "undefined" ? window : globalThis, function () {
    "use strict";

    const VERSION = "1.0.0";

    /** _resolveFetch — real fetch, injectable only for tests (opts._fetch). */
    function _resolveFetch(opts) {
        if (typeof opts._fetch === "function") return opts._fetch;
        if (typeof fetch === "function") return fetch;
        return null;
    }

    /**
     * getFirebaseIdToken(root) -> { success, idToken?, firebaseUid?, reason? }
     * Real, thin use of the already-loaded core/firebase/firebase-auth.js
     * passthroughs. Fails closed at every step — never fabricates a
     * token or a uid.
     */
    async function getFirebaseIdToken(root) {
        const authService = root.CozyOS && root.CozyOS.Firebase && root.CozyOS.Firebase.Auth;
        if (!authService) {
            return { success: false, reason: "core/firebase/firebase-auth.js is not loaded. Failing closed." };
        }
        try {
            await authService.ready;
        } catch (_err) {
            return { success: false, reason: "Firebase Auth failed to initialize. Failing closed." };
        }
        const authInstance = typeof authService.getAuthInstance === "function" ? authService.getAuthInstance() : null;
        const user = authInstance && authInstance.currentUser;
        if (!user) {
            return { success: false, reason: "No signed-in Firebase user. Failing closed." };
        }
        if (typeof user.getIdToken !== "function") {
            return { success: false, reason: "Signed-in Firebase user has no getIdToken(). Failing closed." };
        }
        try {
            const idToken = await user.getIdToken();
            if (!idToken) return { success: false, reason: "Firebase getIdToken() returned empty. Failing closed." };
            return { success: true, idToken, firebaseUid: user.uid };
        } catch (err) {
            return { success: false, reason: (err && err.message) || "Firebase getIdToken() failed. Failing closed." };
        }
    }

    async function _postJson(fetchFn, url, bearer) {
        const headers = { "Content-Type": "application/json" };
        if (bearer) headers["Authorization"] = "Bearer " + bearer;
        let res;
        try {
            res = await fetchFn(url, { method: "POST", headers });
        } catch (err) {
            return { success: false, reason: "Network request to relay server failed: " + ((err && err.message) || "unknown error") };
        }
        let data;
        try {
            data = await res.json();
        } catch (_err) {
            return { success: false, reason: "Relay server returned a non-JSON response." };
        }
        if (!res.ok || data.success === false) {
            return { success: false, reason: data.reason || ("Relay server rejected the request (HTTP " + res.status + ")."), status: res.status };
        }
        return Object.assign({ success: true }, data);
    }

    /**
     * obtainIdentityAssertion(relayHttpUrl, opts) -> { success, assertionToken?, userId?, reason? }
     * Real Firebase ID token -> real POST /identity/assertion exchange.
     * Never continues on a failure at either step (fail-closed chain).
     */
    async function obtainIdentityAssertion(relayHttpUrl, opts) {
        opts = opts || {};
        const root = opts._root || (typeof window !== "undefined" ? window : globalThis);
        const fetchFn = _resolveFetch(opts);
        if (!fetchFn) return { success: false, reason: "No fetch implementation available. Failing closed." };

        const idResult = await getFirebaseIdToken(root);
        if (!idResult.success) return idResult;

        const assertionResult = await _postJson(fetchFn, relayHttpUrl.replace(/\/$/, "") + "/identity/assertion", idResult.idToken);
        if (!assertionResult.success) return assertionResult;

        // Real, honest defensive check — the server signs the assertion
        // FROM the verified Firebase token, so these should always
        // match. A bridge that silently trusted a mismatch would be
        // exactly the kind of gap identity-assertion.js's own header
        // warns about. If they ever diverge, fail closed rather than
        // guess which identity is correct.
        if (assertionResult.userId !== idResult.firebaseUid) {
            return { success: false, reason: "Assertion userId did not match the signed-in Firebase user. Failing closed." };
        }
        return { success: true, assertionToken: assertionResult.assertionToken, userId: assertionResult.userId };
    }

    /**
     * fetchParticipationToken(relayHttpUrl, sessionId, userId, assertionToken, opts)
     *   -> { success, token?, role?, reason? }
     * Exchanges a real identity assertion for a real, session-scoped
     * SessionAuthority participation token. registerAsHost routes to
     * LdceRosterBridge's register-host bootstrap seam instead — see
     * server/live-relay/README.md for why that seam exists.
     */
    async function fetchParticipationToken(relayHttpUrl, sessionId, userId, assertionToken, opts) {
        opts = opts || {};
        const fetchFn = _resolveFetch(opts);
        if (!fetchFn) return { success: false, reason: "No fetch implementation available. Failing closed." };
        const endpoint = opts.registerAsHost
            ? "/session/" + encodeURIComponent(sessionId) + "/register-host/" + encodeURIComponent(userId)
            : "/session/" + encodeURIComponent(sessionId) + "/token/" + encodeURIComponent(userId);
        return _postJson(fetchFn, relayHttpUrl.replace(/\/$/, "") + endpoint, assertionToken);
    }

    /**
     * establishRelaySession(opts) -> { success, transportProvider?, participationController?, userId?, role?, reason? }
     *
     * The one call a real integrating call site makes to go from
     * "signed into Firebase, holding an LDCE sessionId" to "connected
     * RemoteRelayTransportProvider + wired CozyLiveParticipationController".
     *
     * @param {object} opts
     * @param {string} opts.relayHttpUrl        e.g. "http://localhost:8080" — used for /identity/assertion and /session/.../token.
     * @param {string} opts.relayWsUrl          e.g. "ws://localhost:8080" — passed through to RemoteRelayTransportProvider unchanged.
     * @param {string} opts.sessionId           An LDCE sessionId, already created by LDCESessionEngine. Never created here.
     * @param {boolean} [opts.registerAsHost]   True only for the roster-bootstrap host-registration path (see LdceRosterBridge). Most callers omit this.
     * @param {object} opts.deviceManager       A CozyAudioDeviceManager instance — caller-owned lifecycle, per ParticipationController's own contract. Not constructed here.
     * @param {function(string,object)} [opts.onEvent]  Forwarded to CozyLiveParticipationController's constructor AND called for every raw transport event (mirrors the two-sink pattern ParticipationController's own header documents).
     * @param {object} [opts.transportSelector] Optional CozyLiveMediaTransportSelector, passed straight through to ParticipationController unchanged.
     * @param {object} [opts._root]  Test-injection seam for window/globalThis.
     * @param {function} [opts._fetch]  Test-injection seam for fetch.
     * @param {function} [opts._ProviderCtor]  Test-injection seam for RemoteRelayTransportProvider.
     * @param {function} [opts._ControllerCtor]  Test-injection seam for CozyLiveParticipationController.
     */
    async function establishRelaySession(opts) {
        opts = opts || {};
        const root = opts._root || (typeof window !== "undefined" ? window : globalThis);

        if (!opts.relayHttpUrl) return { success: false, reason: "opts.relayHttpUrl is required." };
        if (!opts.relayWsUrl) return { success: false, reason: "opts.relayWsUrl is required." };
        if (!opts.sessionId) return { success: false, reason: "opts.sessionId is required." };
        if (!opts.deviceManager) return { success: false, reason: "opts.deviceManager is required." };

        const idResult = await obtainIdentityAssertion(opts.relayHttpUrl, opts);
        if (!idResult.success) return idResult;

        const tokenResult = await fetchParticipationToken(
            opts.relayHttpUrl, opts.sessionId, idResult.userId, idResult.assertionToken,
            Object.assign({}, opts, { registerAsHost: !!opts.registerAsHost })
        );
        if (!tokenResult.success) return tokenResult;

        let participationToken = tokenResult.token;
        let role = tokenResult.role;

        // register-host's own contract (LdceRosterBridge.registerHost())
        // does not itself return a participation token — a genuine,
        // separate /token call is still required afterward. Never
        // fabricate a token here to skip that real second step.
        if (opts.registerAsHost) {
            const followUp = await fetchParticipationToken(
                opts.relayHttpUrl, opts.sessionId, idResult.userId, idResult.assertionToken,
                Object.assign({}, opts, { registerAsHost: false })
            );
            if (!followUp.success) return followUp;
            participationToken = followUp.token;
            role = followUp.role;
        }

        const ProviderCtor = opts._ProviderCtor || (root.CozyOS && root.CozyOS.CozyLiveRemoteRelayTransportProvider);
        const ControllerCtor = opts._ControllerCtor || (root.CozyOS && root.CozyOS.CozyLiveParticipationController);
        if (typeof ProviderCtor !== "function") {
            return { success: false, reason: "cozy-live-remote-relay-transport-provider.js is not loaded. Failing closed." };
        }
        if (typeof ControllerCtor !== "function") {
            return { success: false, reason: "cozy-live-participation-controller.js is not loaded. Failing closed." };
        }

        const externalOnEvent = typeof opts.onEvent === "function" ? opts.onEvent : () => {};

        // See file-header note "A DOCUMENTATION DISCREPANCY THIS FILE
        // WORKS AROUND, NOT REPRODUCES" — provider is constructed first,
        // with a forwarding onEvent closure; `controller` is filled in
        // immediately after, before any real async network event can
        // arrive.
        let controller = null;
        const transportProvider = new ProviderCtor({
            url: opts.relayWsUrl,
            getToken: () => participationToken,
            onEvent: (type, msg) => {
                if (controller) controller.handleTransportEvent(type, msg);
                externalOnEvent(type, msg);
            },
        });

        controller = new ControllerCtor({
            deviceManager: opts.deviceManager,
            transportProvider,
            sessionId: opts.sessionId,
            userId: idResult.userId,
            onEvent: externalOnEvent,
            transportSelector: opts.transportSelector || null,
        });

        return {
            success: true,
            transportProvider,
            participationController: controller,
            userId: idResult.userId,
            role,
        };
    }

    const LiveRelayCompositionBridge = Object.freeze({
        getVersion() { return VERSION; },
        getFirebaseIdToken,
        obtainIdentityAssertion,
        fetchParticipationToken,
        establishRelaySession,
    });

    return { LiveRelayCompositionBridge };
});
