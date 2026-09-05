/**
 * core/shell/live/live-entry-point.js
 * CozyOS — Live Distribution — Product Entry Point (Go Live / Join Live)
 * STEP 4D / LIVE PRODUCT ENTRY POINT, Patch #1
 *
 * REAL SCOPE DISCLOSURE
 *   Patch #7 (COS-STEP4D-B-PHASE6-PATCH-7.zip) established that no
 *   shipped production file creates or joins an LDCESessionEngine
 *   session, and that no shipped UI exposes a "Go Live" or "Join Live"
 *   action. This file is the smallest new production owner for that
 *   missing lifecycle seam — nothing more.
 *
 *   It composes three already-real, already-tested pieces, in order:
 *     1. window.CozyOS.Session.current().uid
 *        — the real, already-established Firebase-backed identity
 *        (see core/modules/session/firebase-session-bridge.js, which
 *        calls CozyOS.Session.establishFromExternalAuth() with the
 *        real Firebase uid on auth-state change). This file reads
 *        that value; it never accepts a caller-supplied uid and never
 *        creates a second identity mechanism.
 *     2. window.CozyOS.LDCESessionEngine.createSession() /
 *        .joinSession() — LDCESessionEngine's own existing, unmodified
 *        API. This file does not touch LDCESessionEngine's internals,
 *        does not add methods to it, and does not duplicate its
 *        session/roster/language ownership.
 *     3. window.CozyOS.LiveRelayCompositionBridge.establishRelaySession()
 *        — Patch #6's existing, unmodified bridge. This file supplies
 *        it the sessionId LDCESessionEngine just created/joined; it
 *        never constructs SessionAuthority, RemoteRelayTransportProvider,
 *        or CozyLiveParticipationController directly.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 *   - Does not grant speaking permission. SessionAuthority (reached
 *     through the composition bridge's own /session/:id/token/:sub
 *     call) remains the sole speaking authority. This file never reads
 *     or writes a "speaking" flag anywhere.
 *   - Does not merge LDCESessionEngine's own setParticipantState /
 *     forceMuteParticipant "speaking" flag with SessionAuthority's
 *     state machine. They stay two separate systems, exactly as the
 *     Phase 5 audit required.
 *   - Does not silently start relay participation for every call.
 *     `opts.transportMode` is required and explicit ("relay" or
 *     "mesh-only") on both goLive() and joinLive() — see "TRANSPORT
 *     MODE IS EXPLICIT" below.
 *   - Does not implement session discovery. joinLive() requires a
 *     caller-supplied sessionId. No shipped mechanism in this
 *     repository lets a viewer discover a live sessionId (confirmed by
 *     this patch's own seam inspection: LDCESessionEngine has no
 *     list/enumerate method, only getSession(knownId)). Wiring a real
 *     "browse live sessions" UI is a separate, explicit, still-open
 *     dependency — see this patch's implementation report.
 *   - Does not construct a device manager. Per
 *     live-relay-composition-bridge.js's own contract,
 *     opts.deviceManager (a CozyAudioDeviceManager instance) remains
 *     caller-owned; this file only forwards it.
 *
 * TRANSPORT MODE IS EXPLICIT
 *   opts.transportMode must be exactly "relay" or "mesh-only":
 *     - "mesh-only": create/join the LDCE session only. LDCE's existing
 *       Firestore/LiveHotspotEngine mesh signaling remains whatever it
 *       already was — this file does not touch it, start it, or stop
 *       it. The composition bridge is never invoked.
 *     - "relay": create/join the LDCE session, then invoke Patch #6's
 *       composition bridge with the resulting sessionId to establish
 *       relay participation. LDCE's mesh path is not disabled by this
 *       — the two are independent, exactly as the handoff requires.
 *   There is no default. A caller must choose. This is intentional:
 *   silently defaulting to one path was the exact anti-pattern this
 *   phase's handoff prohibited ("Do not silently make every LDCE call
 *   become relay participation.").
 *
 * FAIL-CLOSED BEHAVIOR
 *   goLive()/joinLive() return { success: false, reason } (never throw)
 *   for: no authenticated user, LDCE session create/join failure, or
 *   (transportMode "relay" only) composition-bridge failure. Nothing
 *   is retried, faked, or partially applied on failure.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CozyOS = root.CozyOS || {};
        root.CozyOS.LiveEntryPoint = factory().LiveEntryPoint;
    }
})(typeof window !== "undefined" ? window : globalThis, function () {
    "use strict";

    const VERSION = "1.0.0";
    const VALID_TRANSPORT_MODES = new Set(["relay", "mesh-only"]);

    /** _currentUid() — the ONLY place this file reads identity. Never a caller-supplied uid. */
    function _currentUid(root) {
        const session = root.CozyOS && root.CozyOS.Session;
        if (!session || typeof session.current !== "function") return null;
        const current = session.current();
        return current && typeof current.uid === "string" && current.uid ? current.uid : null;
    }

    function _ldce(root) {
        const engine = root.CozyOS && root.CozyOS.LDCESessionEngine;
        return engine && typeof engine.createSession === "function" && typeof engine.joinSession === "function"
            ? engine
            : null;
    }

    function _bridge(root, opts) {
        if (opts._CompositionBridge) return opts._CompositionBridge;
        const bridge = root.CozyOS && root.CozyOS.LiveRelayCompositionBridge;
        return bridge && typeof bridge.establishRelaySession === "function" ? bridge : null;
    }

    /**
     * goLive(opts) -> { success, sessionId?, uid?, relay?, reason? }
     *
     * Host path. Creates a new LDCE session as the authenticated user,
     * then (transportMode "relay" only) establishes relay
     * participation via Patch #6's bridge, registering the caller as
     * host (bridge's own registerAsHost flow).
     *
     * @param {object} opts
     * @param {"relay"|"mesh-only"} opts.transportMode  Required, explicit.
     * @param {string} [opts.type]      Forwarded to LDCESessionEngine.createSession() (default "phone-call", per its own default — callers broadcasting live worship should pass an explicit SESSION_TYPES value LDCESessionEngine already supports).
     * @param {string} [opts.title]     Forwarded to LDCESessionEngine.createSession().
     * @param {string} [opts.language]  Forwarded to LDCESessionEngine.createSession().
     * @param {object} [opts.metadata]  Forwarded to LDCESessionEngine.createSession().
     * @param {string} [opts.relayHttpUrl]   Required when transportMode is "relay". Forwarded to the composition bridge.
     * @param {string} [opts.relayWsUrl]     Required when transportMode is "relay". Forwarded to the composition bridge.
     * @param {object} [opts.deviceManager]  Required when transportMode is "relay". Caller-owned; forwarded unchanged.
     * @param {function} [opts.onEvent]      Forwarded to the composition bridge when transportMode is "relay".
     * @param {object} [opts.transportSelector]  Forwarded to the composition bridge when transportMode is "relay".
     * @param {object} [opts._root]  Test-injection seam.
     * @param {object} [opts._LDCESessionEngine]  Test-injection seam.
     * @param {object} [opts._CompositionBridge]  Test-injection seam.
     */
    async function goLive(opts) {
        opts = opts || {};
        const root = opts._root || (typeof window !== "undefined" ? window : globalThis);

        if (!VALID_TRANSPORT_MODES.has(opts.transportMode)) {
            return { success: false, reason: 'opts.transportMode is required and must be exactly "relay" or "mesh-only".' };
        }

        const uid = opts._uid !== undefined ? opts._uid : _currentUid(root);
        if (!uid) return { success: false, reason: "No authenticated CozyOS.Session user. Failing closed." };

        const ldce = opts._LDCESessionEngine || _ldce(root);
        if (!ldce) return { success: false, reason: "LDCESessionEngine is not available. Failing closed." };

        const createResult = ldce.createSession(uid, {
            type: opts.type,
            title: opts.title,
            language: opts.language,
            metadata: opts.metadata,
        });
        if (!createResult || !createResult.success) {
            return { success: false, reason: (createResult && createResult.reason) || "LDCESessionEngine.createSession() declined. Failing closed." };
        }

        const sessionId = createResult.sessionId;

        if (opts.transportMode === "mesh-only") {
            return { success: true, sessionId, uid, relay: null };
        }

        const bridge = _bridge(root, opts);
        if (!bridge) return { success: false, reason: "LiveRelayCompositionBridge is not available. Failing closed.", sessionId, uid };

        const relayResult = await bridge.establishRelaySession({
            relayHttpUrl: opts.relayHttpUrl,
            relayWsUrl: opts.relayWsUrl,
            sessionId,
            registerAsHost: true,
            deviceManager: opts.deviceManager,
            onEvent: opts.onEvent,
            transportSelector: opts.transportSelector,
            _root: opts._root,
            _fetch: opts._fetch,
            _ProviderCtor: opts._ProviderCtor,
            _ControllerCtor: opts._ControllerCtor,
        });
        if (!relayResult.success) {
            return { success: false, reason: relayResult.reason, sessionId, uid };
        }

        return { success: true, sessionId, uid, relay: relayResult };
    }

    /**
     * joinLive(opts) -> { success, sessionId?, uid?, role?, relay?, reason? }
     *
     * Viewer path. Joins an EXISTING, caller-supplied LDCE sessionId as
     * the authenticated user, then (transportMode "relay" only)
     * establishes relay participation via Patch #6's bridge.
     *
     * Does NOT discover a sessionId. See file header — no shipped
     * session-discovery mechanism exists yet. opts.sessionId must come
     * from a legitimate source the caller already has (e.g. a direct
     * link/invite); this file fails closed if it is missing.
     *
     * @param {object} opts
     * @param {"relay"|"mesh-only"} opts.transportMode  Required, explicit.
     * @param {string} opts.sessionId   Required. An existing LDCE sessionId this file did not create.
     * @param {string} [opts.language]  Forwarded to LDCESessionEngine.joinSession().
     * @param {boolean} [opts.muted]    Forwarded to LDCESessionEngine.joinSession().
     * @param {boolean} [opts.cameraOn] Forwarded to LDCESessionEngine.joinSession().
     * @param {string} [opts.relayHttpUrl]   Required when transportMode is "relay".
     * @param {string} [opts.relayWsUrl]     Required when transportMode is "relay".
     * @param {object} [opts.deviceManager]  Required when transportMode is "relay".
     * @param {function} [opts.onEvent]
     * @param {object} [opts.transportSelector]
     * @param {object} [opts._root]  Test-injection seam.
     * @param {object} [opts._LDCESessionEngine]  Test-injection seam.
     * @param {object} [opts._CompositionBridge]  Test-injection seam.
     */
    async function joinLive(opts) {
        opts = opts || {};
        const root = opts._root || (typeof window !== "undefined" ? window : globalThis);

        if (!VALID_TRANSPORT_MODES.has(opts.transportMode)) {
            return { success: false, reason: 'opts.transportMode is required and must be exactly "relay" or "mesh-only".' };
        }
        if (!opts.sessionId) {
            return { success: false, reason: "opts.sessionId is required. This file does not discover live sessions — see file header. Failing closed." };
        }

        const uid = opts._uid !== undefined ? opts._uid : _currentUid(root);
        if (!uid) return { success: false, reason: "No authenticated CozyOS.Session user. Failing closed." };

        const ldce = opts._LDCESessionEngine || _ldce(root);
        if (!ldce) return { success: false, reason: "LDCESessionEngine is not available. Failing closed." };

        const joinResult = ldce.joinSession(opts.sessionId, uid, {
            language: opts.language,
            muted: opts.muted,
            cameraOn: opts.cameraOn,
        });
        if (!joinResult || !joinResult.success) {
            return { success: false, reason: (joinResult && joinResult.reason) || "LDCESessionEngine.joinSession() declined. Failing closed." };
        }

        if (opts.transportMode === "mesh-only") {
            return { success: true, sessionId: opts.sessionId, uid, role: joinResult.role, relay: null };
        }

        const bridge = _bridge(root, opts);
        if (!bridge) return { success: false, reason: "LiveRelayCompositionBridge is not available. Failing closed.", sessionId: opts.sessionId, uid };

        const relayResult = await bridge.establishRelaySession({
            relayHttpUrl: opts.relayHttpUrl,
            relayWsUrl: opts.relayWsUrl,
            sessionId: opts.sessionId,
            registerAsHost: false,
            deviceManager: opts.deviceManager,
            onEvent: opts.onEvent,
            transportSelector: opts.transportSelector,
            _root: opts._root,
            _fetch: opts._fetch,
            _ProviderCtor: opts._ProviderCtor,
            _ControllerCtor: opts._ControllerCtor,
        });
        if (!relayResult.success) {
            return { success: false, reason: relayResult.reason, sessionId: opts.sessionId, uid };
        }

        return { success: true, sessionId: opts.sessionId, uid, role: relayResult.role, relay: relayResult };
    }

    const LiveEntryPoint = Object.freeze({
        getVersion() { return VERSION; },
        goLive,
        joinLive,
    });

    return { LiveEntryPoint };
});
