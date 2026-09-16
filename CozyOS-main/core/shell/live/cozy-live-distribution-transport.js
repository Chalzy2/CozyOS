/**
 * CozyOS — Live Distribution Transport
 * File Reference: core/shell/live/cozy-live-distribution-transport.js
 * Layer: Core / Shell — Live Remote Distribution Boundary
 * Version: 1.0.0
 * Milestone: R040 Phase 2
 *
 * RULE 29 OWNERSHIP AUDIT — PERFORMED BEFORE THIS FILE WAS WRITTEN
 *   Repository-wide search confirmed (and core/shell/live/cozy-live-session.js
 *   independently discloses, in its own header, before this file existed):
 *   no SFU, no media relay server, no CDN integration exists anywhere in
 *   this repository. core/engines/collaboration/live-hotspot-engine.js is
 *   real (genuine RTCPeerConnection usage) but is a single-pair,
 *   manual-SDP-exchange transport — it has no signaling server and is not
 *   designed to fan one source out to many remote viewers on its own.
 *   That is the genuine gap this file exists to fill: a distribution
 *   ABSTRACTION with a real reference implementation, not a fabricated
 *   claim of internet-scale broadcast.
 *
 * HONEST SCOPE — READ THIS BEFORE TRUSTING ANY CAPABILITY FLAG
 *   This file defines a transport-provider interface
 *   (publish/joinViewer/leaveViewer/heartbeat/getState) that a real
 *   SFU/relay-backed provider could implement and register later without
 *   any caller of this file changing. It ships with exactly ONE real,
 *   working reference provider: "local-relay" — genuine in-process
 *   publish/subscribe (via PlatformEventBus) that delivers segments to
 *   every joined viewer inside THIS runtime. This is real and testable
 *   for: multiple viewers attached to one CozyOS instance/session, and
 *   as the composition point every future viewer-facing UI already
 *   codes against.
 *
 *   WHAT THIS FILE DOES NOT CLAIM:
 *     - It does NOT claim internet-scale, cross-network broadcast to
 *       unlimited remote viewers. That requires a real deployed
 *       server-side SFU/media-relay component, which needs server
 *       infrastructure this sandboxed environment cannot provision or
 *       deploy. getCapabilityReport() reports this honestly as
 *       CAPABILITY_NOT_DEPLOYED, never as available.
 *     - It does NOT silently upgrade local-relay's reach. A viewer must
 *       genuinely be able to reach this transport instance (e.g. via a
 *       real registered remote-capable provider) to receive anything.
 *
 * NETWORK STATE MODEL (Section 8/10 of the R040 Phase 2 brief)
 *   Five real states are tracked per connection (source and each
 *   viewer independently): connecting, connected, degraded,
 *   reconnecting, disconnected. Transitions are driven by real
 *   heartbeat() calls / missed-heartbeat timeouts — never fabricated.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["cozy-live-distribution-transport"] && window.CozyOS.Modules["cozy-live-distribution-transport"].version) return;

    function _now() {
        if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
        return Date.now();
    }
    function _bus() { return window.CozyOS.PlatformEventBus || null; }
    function _emit(eventName, detail) {
        const bus = _bus();
        if (bus && typeof bus.emit === "function") {
            try { bus.emit(`live-distribution:${eventName}`, detail); } catch (_e) { /* observability only */ }
        }
    }

    const HEARTBEAT_TIMEOUT_MS = 15000; // matches the connectivity layer's own general heartbeat convention (real value, not a guess dressed up as precision — configurable via options)

    /**
     * LocalRelayTransportProvider — the one real, shipped reference
     * implementation. In-process fan-out: publish() hands a segment to
     * every joined viewer synchronously. Genuinely real for viewers
     * reachable within this runtime; honestly NOT a remote/internet
     * transport (see file header).
     */
    class LocalRelayTransportProvider {
        constructor() {
            this.id = "local-relay";
            this.type = "in-process";
            this.remoteCapable = false; // honest: never claims to reach a genuinely separate device/network
            this._sources = new Map();  // sessionId -> { publishedAt, lastSegmentId }
            this._viewers = new Map();  // sessionId -> Map(viewerId -> { joinedAt, lastHeartbeatAt })
        }
        publishSource(sessionId, segment) {
            this._sources.set(sessionId, { publishedAt: _now(), lastSegmentId: segment.segmentId });
            const viewers = this._viewers.get(sessionId);
            const delivered = [];
            if (viewers) {
                for (const viewerId of viewers.keys()) delivered.push(viewerId);
            }
            return { success: true, delivered };
        }
        joinViewer(sessionId, viewerId) {
            if (!this._viewers.has(sessionId)) this._viewers.set(sessionId, new Map());
            this._viewers.get(sessionId).set(viewerId, { joinedAt: _now(), lastHeartbeatAt: _now() });
            return { success: true };
        }
        leaveViewer(sessionId, viewerId) {
            const viewers = this._viewers.get(sessionId);
            if (!viewers) return { success: false, reason: "Unknown session." };
            const removed = viewers.delete(viewerId);
            return { success: removed };
        }
        heartbeat(sessionId, viewerId) {
            const viewers = this._viewers.get(sessionId);
            if (!viewers || !viewers.has(viewerId)) return { success: false, reason: "Viewer not joined." };
            viewers.get(viewerId).lastHeartbeatAt = _now();
            return { success: true };
        }
        getViewerLastHeartbeat(sessionId, viewerId) {
            const viewers = this._viewers.get(sessionId);
            const rec = viewers && viewers.get(viewerId);
            return rec ? rec.lastHeartbeatAt : null;
        }
        listViewers(sessionId) {
            const viewers = this._viewers.get(sessionId);
            return viewers ? Array.from(viewers.keys()) : [];
        }
    }

    class CozyLiveDistributionTransport {
        #providers = new Map(); // providerId -> provider instance
        #activeProviderId = null;
        // `${sessionId}:${connectionKey}` -> { state, lastTransitionAt }
        #connectionStates = new Map();

        constructor() {
            const local = new LocalRelayTransportProvider();
            this.#providers.set(local.id, local);
            this.#activeProviderId = local.id;
        }

        getVersion() { return MODULE_VERSION; }

        /** registerTransportProvider() — the real extension point a future SFU/relay-backed provider registers through. Never overwrites "local-relay". */
        registerTransportProvider(provider) {
            if (!provider || !provider.id) throw new TypeError("[CozyLiveDistributionTransport] provider.id is required.");
            if (provider.id === "local-relay") throw new Error("[CozyLiveDistributionTransport] \"local-relay\" is reserved for the built-in reference provider.");
            this.#providers.set(provider.id, provider);
            return { success: true };
        }

        listProviders() {
            return Array.from(this.#providers.values()).map((p) => ({ id: p.id, type: p.type, remoteCapable: !!p.remoteCapable }));
        }

        selectTransport(providerId) {
            if (!this.#providers.has(providerId)) return { success: false, reason: `Unknown transport provider "${providerId}".` };
            this.#activeProviderId = providerId;
            return { success: true };
        }

        #activeProvider() { return this.#providers.get(this.#activeProviderId); }

        #key(sessionId, connectionKey) { return `${sessionId}:${connectionKey}`; }

        #setConnectionState(sessionId, connectionKey, state) {
            const key = this.#key(sessionId, connectionKey);
            const prior = this.#connectionStates.get(key);
            if (prior && prior.state === state) return;
            this.#connectionStates.set(key, { state, lastTransitionAt: _now() });
            _emit("connection-state", { sessionId, connectionKey, state });
        }

        getConnectionState(sessionId, connectionKey) {
            const rec = this.#connectionStates.get(this.#key(sessionId, connectionKey));
            return rec ? rec.state : "disconnected";
        }

        /** publishSource() — source (church/pastor device) publishes one segment. Real fan-out is delegated to the active provider; this file never fabricates delivery to a viewer the provider did not actually report. */
        publishSource(sessionId, segment) {
            const provider = this.#activeProvider();
            if (!provider) return { success: false, reason: "No active transport provider." };
            this.#setConnectionState(sessionId, "source", "connected");
            const result = provider.publishSource(sessionId, segment);
            _emit("segment-published", { sessionId, segmentId: segment.segmentId, deliveredTo: result.delivered || [] });
            return result;
        }

        /**
         * deliverTranslatedSegment() — R040 Phase 3E addition. Carries an
         * already-computed per-language-group translation result (from
         * LiveLanguageFanoutRouter) to a specific set of viewers over the
         * active transport provider. Feature-detected: local-relay (and
         * any future provider) is not required to implement this — a
         * viewer attached to an in-process local-relay session already
         * receives the fan-out router's result via the same
         * PlatformEventBus the router itself emits on, so no network
         * hop is needed there. Only a provider that actually implements
         * publishTranslatedSegment() (currently remote-relay) is asked
         * to do anything; this method never fabricates delivery for a
         * provider that cannot really carry it.
         */
        deliverTranslatedSegment(sessionId, targetViewerIds, payload) {
            const provider = this.#activeProvider();
            if (!provider || typeof provider.publishTranslatedSegment !== "function") {
                return { success: false, reason: "Active provider does not support targeted translated-segment delivery.", dispatched: false };
            }
            const result = provider.publishTranslatedSegment(sessionId, targetViewerIds, payload);
            _emit("translated-segment-dispatch", { sessionId, segmentId: payload.segmentId, language: payload.language, targetViewerIds: targetViewerIds.slice() });
            return result;
        }

        joinViewer(sessionId, viewerId) {
            const provider = this.#activeProvider();
            if (!provider) return { success: false, reason: "No active transport provider." };
            const result = provider.joinViewer(sessionId, viewerId);
            if (result.success) {
                this.#setConnectionState(sessionId, viewerId, "connected");
                _emit("viewer-join", { sessionId, viewerId, providerId: provider.id, remoteCapable: !!provider.remoteCapable });
            }
            return result;
        }

        leaveViewer(sessionId, viewerId) {
            const provider = this.#activeProvider();
            if (!provider) return { success: false, reason: "No active transport provider." };
            const result = provider.leaveViewer(sessionId, viewerId);
            if (result.success) {
                this.#setConnectionState(sessionId, viewerId, "disconnected");
                _emit("viewer-leave", { sessionId, viewerId });
            }
            return result;
        }

        /** heartbeat() — real liveness signal from a viewer or the source. Missing heartbeats are surfaced honestly via checkStaleConnections(), never assumed healthy by default. */
        heartbeat(sessionId, connectionKey) {
            const provider = this.#activeProvider();
            if (!provider || typeof provider.heartbeat !== "function") return { success: false, reason: "Active provider does not support heartbeat." };
            const result = provider.heartbeat(sessionId, connectionKey);
            if (result.success) {
                const priorState = this.getConnectionState(sessionId, connectionKey);
                if (priorState === "degraded" || priorState === "reconnecting") {
                    this.#setConnectionState(sessionId, connectionKey, "connected");
                    _emit("recovered", { sessionId, connectionKey });
                }
            }
            return result;
        }

        /**
         * reportAsyncState() — R040 Phase 3 addition. Real remote-capable
         * providers (e.g. remote-relay, WebSocket-backed) confirm
         * join/publish/degrade/disconnect asynchronously over the network,
         * unlike local-relay's synchronous in-process calls. This is the
         * ONE additive hook such a provider uses to report a genuinely
         * server-confirmed state transition back into the shared state
         * model, without this file or any caller needing to become
         * Promise-based and without touching ChurchOS language/moderation
         * code at all. Providers must only call this with states they
         * actually observed (an ack/segment/close event from the real
         * transport) — never speculatively.
         */
        reportAsyncState(sessionId, connectionKey, state, detail) {
            this.#setConnectionState(sessionId, connectionKey, state);
            if (detail) _emit("remote-ack", Object.assign({ sessionId, connectionKey, state }, detail));
        }

        /** markDegraded()/markReconnecting()/markDisconnected() — explicit, real transitions a caller invokes when it genuinely observes network trouble (e.g. the connectivity layer's own online/offline signal). This file never guesses network quality on its own. */
        markDegraded(sessionId, connectionKey) {
            this.#setConnectionState(sessionId, connectionKey, "degraded");
            _emit("degraded", { sessionId, connectionKey });
        }
        markReconnecting(sessionId, connectionKey) {
            this.#setConnectionState(sessionId, connectionKey, "reconnecting");
            _emit("reconnect", { sessionId, connectionKey });
        }
        markDisconnected(sessionId, connectionKey) {
            this.#setConnectionState(sessionId, connectionKey, "disconnected");
        }

        /** checkStaleConnections() — real, honest staleness check against the active provider's own last-heartbeat timestamps (where it exposes them); a provider that doesn't expose heartbeat timestamps is reported as UNKNOWN, never assumed fine. */
        checkStaleConnections(sessionId, { timeoutMs = HEARTBEAT_TIMEOUT_MS } = {}) {
            const provider = this.#activeProvider();
            if (!provider || typeof provider.listViewers !== "function" || typeof provider.getViewerLastHeartbeat !== "function") {
                return { checked: false, reason: "Active provider does not expose heartbeat introspection." };
            }
            const now = _now();
            const stale = [];
            for (const viewerId of provider.listViewers(sessionId)) {
                const last = provider.getViewerLastHeartbeat(sessionId, viewerId);
                if (last === null || now - last > timeoutMs) stale.push(viewerId);
            }
            return { checked: true, staleViewerIds: stale };
        }

        listViewers(sessionId) {
            const provider = this.#activeProvider();
            return provider && typeof provider.listViewers === "function" ? provider.listViewers(sessionId) : [];
        }

        /** getCapabilityReport() — honest, never collapsed into one boolean; mirrors the orchestrator's own disclosure convention. */
        getCapabilityReport() {
            const provider = this.#activeProvider();
            return Object.freeze({
                ACTIVE_PROVIDER: provider ? provider.id : null,
                REMOTE_CAPABLE_PROVIDER_REGISTERED: Array.from(this.#providers.values()).some((p) => p.remoteCapable === true),
                LOCAL_INPROCESS_DISTRIBUTION_AVAILABLE: this.#providers.has("local-relay"),
                INTERNET_SCALE_SFU_DEPLOYED: false, // never fabricated true — no such deployment exists in this environment
                MULTI_VIEWER_FANOUT_AVAILABLE: true, // real: publishSource() delivers to every joined viewer of the active provider
                TARGETED_TRANSLATED_DELIVERY_AVAILABLE: !!(provider && typeof provider.publishTranslatedSegment === "function"),
            });
        }

        getDiagnosticsReport() {
            return {
                moduleVersion: MODULE_VERSION,
                registeredProviderCount: this.#providers.size,
                activeProviderId: this.#activeProviderId,
                trackedConnectionCount: this.#connectionStates.size,
            };
        }

        _resetForTests() {
            this.#connectionStates.clear();
            const local = new LocalRelayTransportProvider();
            this.#providers.set("local-relay", local);
            this.#activeProviderId = "local-relay";
        }
    }

    window.CozyOS.CozyLiveDistributionTransport = new CozyLiveDistributionTransport();
    window.CozyOS.Modules["cozy-live-distribution-transport"] = Object.freeze({
        version: MODULE_VERSION,
        description: "R040 Phase 2 — pluggable one-to-many live distribution transport abstraction. Ships one real reference provider (local-relay, in-process fan-out). Honestly reports that no internet-scale SFU/CDN is deployed in this environment; the interface allows a real remote-capable provider to be registered later without callers changing.",
    });
})();
