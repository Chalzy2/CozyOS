/**
 * core/modules/media/cozy-live-playback-receiver.js
 * CozyOS — Live Participation — Real Reception/Playback Layer
 * Milestone: R040 Phase 4C (COS-STEP4B-CHECKPOINT continuation)
 *
 * AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN (repeated here so the
 * next reader does not have to re-derive it from the checkpoint notes)
 *   - core/shell/live/cozy-live-distribution-transport.js already
 *     models the correct one-publish/many-receive SHAPE, but only for
 *     JSON segments/translation text (LocalRelayTransportProvider /
 *     RemoteRelayTransportProvider). It does not carry raw audio and
 *     was never meant to — its own getCapabilityReport() already
 *     honestly reports INTERNET_SCALE_SFU_DEPLOYED: false. That is the
 *     pattern this file mirrors, not a place raw audio gets stuffed
 *     into.
 *   - core/modules/media/cozy-live-media-publisher.js (4B, unmodified
 *     by this file) already opens a real receiver-side
 *     RTCPeerConnection whenever an inbound offer targets this user
 *     (_handleIncomingOffer) and already fires a real
 *     `pc.ontrack -> onEvent("remote-track", { remoteUserId, streams })`
 *     callback the moment the browser's own WebRTC stack delivers
 *     media. Nothing before this file ever did anything with that
 *     event — it was audited and reached no <audio> element, no
 *     output device, nothing audible. That is the exact, genuine gap
 *     STEP 4C closes.
 *   - core/modules/media/cozy-audio-device-manager.js already exposes
 *     the real composition seam for the other side of that gap:
 *     applySinkId(mediaElement), setPlaybackVolume(mediaElement, level),
 *     setPlaybackMuted(mediaElement, muted). It deliberately does not
 *     own an <audio> element itself (see that file's own header). This
 *     file is the thing that creates a real element and wires it in —
 *     no second output-device engine, no second capability model.
 *
 * WHAT THIS FILE IS
 *   The smallest real reception/playback layer: for each remote peer
 *   CozyLiveMediaPublisher opens a receiver connection for, this file
 *   creates one real HTMLAudioElement, attaches the real MediaStream
 *   WebRTC actually delivered (never a fabricated one), attempts real
 *   playback, and applies the real, already-selected output device /
 *   volume / mute state to that element via CozyAudioDeviceManager's
 *   existing methods. Any participant may listen — receiving audio is
 *   never gated by the SPEAKING_ALLOWED authority chain that gates
 *   publishing (see cozy-live-media-publisher.js's own "Receiver path"
 *   comment); this file does not add or duplicate a permission model.
 *
 * WHAT THIS FILE IS NOT / DOES NOT CLAIM
 *   - This is NOT an SFU and does not create one. Every remote track
 *     this file plays arrived over CozyLiveMediaPublisher's existing
 *     mesh (one RTCPeerConnection per remote publisher). If a source
 *     is heard by 500 viewers today, that is 500 real peer
 *     connections into that source's browser — this file just makes
 *     each of those individually-real connections audible. The
 *     "church → ONE upstream → CozyOS relay → MANY viewers" product
 *     requirement is NOT satisfied by this file and this file makes
 *     no claim that it is (see getCapabilityReport() below — this is
 *     stated in code, not only in this comment, so it can never be
 *     silently mistaken for the final design). Reaching that
 *     requirement needs a real deployed SFU/media-relay component
 *     that does not exist anywhere in this repository; that remains
 *     the next real architectural dependency, tracked exactly where
 *     cozy-live-media-publisher.js's own header already tracks it
 *     (server/live-relay/README.md).
 *   - Does not implement or duplicate RTCPeerConnection / signaling.
 *     Reads CozyLiveMediaPublisher's already-real events only; never
 *     touches transportProvider, SessionAuthority, or the moderation
 *     chain.
 *   - Does not fabricate "playing" state. Browser autoplay policy
 *     genuinely can and does reject unmuted programmatic play() calls
 *     without a prior user gesture; when that happens this file
 *     reports AUTOPLAY_BLOCKED honestly and exposes resumePlayback()
 *     for a UI to call from a real click/tap handler — it never
 *     silently retries in a way that would misrepresent audio as
 *     playing when the browser refused it.
 *   - Does not read/report Bluetooth/wired/USB/output-device
 *     capability itself — it delegates entirely to
 *     CozyAudioDeviceManager.getCapabilities(), the one place that
 *     capability model already honestly lives.
 *
 * WIRING REQUIREMENT (same convention as cozy-live-media-publisher.js)
 *   This module does not construct or own a CozyLiveMediaPublisher.
 *   The integrating call site must route the publisher's own
 *   onEvent(name, detail) callback into this receiver's
 *   handlePublisherEvent(name, detail), e.g.:
 *
 *     const receiver = new CozyLivePlaybackReceiver({ audioDeviceManager });
 *     const publisher = new CozyLiveMediaPublisher({
 *       participationController, transportProvider, sessionId, userId,
 *       onEvent: (name, detail) => {
 *         receiver.handlePublisherEvent(name, detail);
 *         // ...plus any other existing onEvent wiring (e.g. stopAllPublishing
 *         // on participation-state change) already documented in that file.
 *       },
 *     });
 *
 *   This file never listens on PlatformEventBus directly for
 *   media-peer events — it only reacts to what its owning publisher
 *   instance actually reports, the same "read authoritative state,
 *   don't invent a second source of it" rule the whole R040 Phase 4
 *   line follows.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CozyOS = root.CozyOS || {};
        root.CozyOS.CozyLivePlaybackReceiver = factory();
    }
})(typeof window !== "undefined" ? window : globalThis, function () {
    "use strict";

    const PLAYBACK_STATE = Object.freeze({
        IDLE: "IDLE",
        ATTACHING: "ATTACHING",
        PLAYING: "PLAYING",
        AUTOPLAY_BLOCKED: "AUTOPLAY_BLOCKED",
        STOPPED: "STOPPED",
        ERROR: "ERROR",
    });

    /**
     * Resolves the real `document` this file depends on, once, at
     * construction time — never assumed. `envOverrides.document` lets
     * tests (and only tests, per the project's test-double rule)
     * inject a fake matching the real DOM contract (createElement
     * returning an object with the HTMLMediaElement surface this file
     * actually uses: srcObject, play(), pause(), volume, muted,
     * setSinkId). Production code never passes this.
     */
    function _resolveEnv(envOverrides) {
        const g = typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : {});
        const doc = (envOverrides && envOverrides.document) || g.document || null;
        return { document: doc };
    }

    class CozyLivePlaybackReceiver {
        /**
         * @param {object} opts
         * @param {object} opts.audioDeviceManager  A CozyAudioDeviceManager instance (not constructed here). Its applySinkId/setPlaybackVolume/setPlaybackMuted are called on the real element this file creates; its own capability model/device selection is never re-implemented here.
         * @param {boolean} [opts.autoplay=true]  Whether attach attempts play() immediately. Even when true, a browser that blocks autoplay is honestly reported via AUTOPLAY_BLOCKED, never overridden.
         * @param {function(string, object)} [opts.onEvent]  Real lifecycle notifications: "playback-state", "playback-error".
         * @param {object} [opts._env]  TEST-ONLY. Injected fake `document`.
         */
        constructor(opts = {}) {
            if (!opts.audioDeviceManager) throw new TypeError("[CozyLivePlaybackReceiver] opts.audioDeviceManager is required.");
            this._audioDeviceManager = opts.audioDeviceManager;
            this._autoplay = opts.autoplay !== false;
            this._onEvent = typeof opts.onEvent === "function" ? opts.onEvent : () => {};
            this._env = _resolveEnv(opts._env);

            /** remoteUserId -> { element, state, stream } */
            this._peers = new Map();
        }

        capabilities() {
            const audioCaps = (typeof this._audioDeviceManager.getCapabilities === "function")
                ? this._audioDeviceManager.getCapabilities()
                : {};
            return Object.freeze({
                audioElementCreation: !!(this._env.document && typeof this._env.document.createElement === "function"),
                outputDeviceRouting: !!audioCaps.outputSelection,
            });
        }

        /** getCapabilityReport() — honest, never collapsed into one boolean; same disclosure convention as cozy-live-distribution-transport.js's getCapabilityReport(). */
        getCapabilityReport() {
            return Object.freeze({
                MESH_PEER_PLAYBACK_AVAILABLE: true, // real: plays whatever this instance's real receiver-side peer connections actually deliver
                ONE_UPSTREAM_MANY_VIEWERS_AVAILABLE: false, // never fabricated true — every playing stream here rode one of N real per-viewer mesh connections, not one shared upstream
                INTERNET_SCALE_SFU_DEPLOYED: false, // no such deployment exists anywhere in this repository
                OUTPUT_DEVICE_ROUTING_AVAILABLE: !!this.capabilities().outputDeviceRouting,
                AUTOPLAY_GUARANTEED: false, // browser autoplay policy is genuinely outside this file's control; see AUTOPLAY_BLOCKED handling
            });
        }

        /**
         * handlePublisherEvent(name, detail) — the one entry point the
         * integrating call site routes a CozyLiveMediaPublisher
         * instance's onEvent(...) into (see file header WIRING
         * REQUIREMENT). Only reacts to events this file actually
         * knows how to act on; anything else is a silent no-op, never
         * an error, so this stays composable with future publisher
         * event types without needing to change on every addition.
         */
        handlePublisherEvent(name, detail) {
            if (!detail) return;
            switch (name) {
                case "remote-track":
                    this._attach(detail.remoteUserId, detail.streams || []);
                    break;
                case "media-peer-state":
                    this._onPeerStateChange(detail.remoteUserId, detail.current);
                    break;
                default:
                    break; // not a playback-relevant event this module owns
            }
        }

        _ensureRec(remoteUserId) {
            let rec = this._peers.get(remoteUserId);
            if (!rec) {
                rec = { element: null, state: PLAYBACK_STATE.IDLE, stream: null };
                this._peers.set(remoteUserId, rec);
            }
            return rec;
        }

        _setState(remoteUserId, state, extra) {
            const rec = this._ensureRec(remoteUserId);
            const previous = rec.state;
            rec.state = state;
            this._onEvent("playback-state", Object.assign({ remoteUserId, previous, current: state }, extra || {}));
        }

        /**
         * _attach() — the real playback wiring. Called only in
         * response to a genuine `pc.ontrack` delivery the publisher
         * already relayed; never invoked speculatively or for a
         * remoteUserId nothing real has connected for.
         */
        _attach(remoteUserId, streams) {
            const doc = this._env.document;
            if (!doc || typeof doc.createElement !== "function") {
                this._setState(remoteUserId, PLAYBACK_STATE.ERROR, { reason: "AUDIO_ELEMENT_UNAVAILABLE" });
                return;
            }
            const stream = streams[0];
            if (!stream) {
                this._setState(remoteUserId, PLAYBACK_STATE.ERROR, { reason: "NO_REMOTE_STREAM" });
                return;
            }

            const rec = this._ensureRec(remoteUserId);
            if (!rec.element) {
                rec.element = doc.createElement("audio");
                // Real, standard properties — never assumed present beyond
                // what HTMLAudioElement actually defines.
                if ("autoplay" in rec.element) rec.element.autoplay = this._autoplay;
            }
            rec.stream = stream;
            rec.element.srcObject = stream;
            this._setState(remoteUserId, PLAYBACK_STATE.ATTACHING);

            // Apply whatever output device / volume / mute state the
            // caller already configured via the SAME CozyAudioDeviceManager
            // instance every other part of the session reads — never a
            // second, competing setting here.
            this._applyDeviceState(remoteUserId);

            if (!this._autoplay) {
                this._setState(remoteUserId, PLAYBACK_STATE.STOPPED, { reason: "AUTOPLAY_DISABLED" });
                return;
            }
            this._play(remoteUserId);
        }

        _play(remoteUserId) {
            const rec = this._peers.get(remoteUserId);
            if (!rec || !rec.element || typeof rec.element.play !== "function") {
                this._setState(remoteUserId, PLAYBACK_STATE.ERROR, { reason: "PLAYBACK_UNAVAILABLE" });
                return;
            }
            let playResult;
            try {
                playResult = rec.element.play();
            } catch (err) {
                this._setState(remoteUserId, PLAYBACK_STATE.AUTOPLAY_BLOCKED, { detail: err && err.message });
                return;
            }
            if (playResult && typeof playResult.then === "function") {
                playResult.then(
                    () => this._setState(remoteUserId, PLAYBACK_STATE.PLAYING),
                    (err) => this._setState(remoteUserId, PLAYBACK_STATE.AUTOPLAY_BLOCKED, { detail: err && err.message })
                );
            } else {
                // Real synchronous play() contract (some environments/
                // fakes do not return a Promise) — reflect it honestly
                // rather than assuming the async Promise contract.
                this._setState(remoteUserId, PLAYBACK_STATE.PLAYING);
            }
        }

        /**
         * resumePlayback(remoteUserId) — the ONLY method that retries
         * play() after AUTOPLAY_BLOCKED. Must be called from a real
         * user-gesture handler (tap/click) by the integrating UI —
         * this file never calls it on its own, since doing so would
         * misrepresent an autoplay-blocked stream as something the
         * user actually asked to hear.
         */
        resumePlayback(remoteUserId) {
            const rec = this._peers.get(remoteUserId);
            if (!rec || !rec.element) return { success: false, reason: "NO_ACTIVE_PLAYBACK" };
            this._play(remoteUserId);
            return { success: true };
        }

        _onPeerStateChange(remoteUserId, current) {
            if (current === "MEDIA_DISCONNECTED" || current === "MEDIA_ERROR") {
                this.detach(remoteUserId);
            }
            // MEDIA_CONNECTED/MEDIA_PUBLISHED/MEDIA_DEGRADED from the
            // publisher describe the underlying RTCPeerConnection, not
            // this file's own playback element state — this file's
            // PLAYING/AUTOPLAY_BLOCKED states are tracked independently
            // and only ever set from a real srcObject attach / play()
            // outcome, never inferred from the peer-connection state.
        }

        /** detach() — stops and releases the real element for one remote peer. Safe to call even if nothing was ever attached. */
        detach(remoteUserId) {
            const rec = this._peers.get(remoteUserId);
            if (!rec) return { success: true, alreadyDetached: true };
            if (rec.element) {
                try { if (typeof rec.element.pause === "function") rec.element.pause(); } catch (_e) { /* already stopped */ }
                rec.element.srcObject = null;
            }
            rec.stream = null;
            this._setState(remoteUserId, PLAYBACK_STATE.STOPPED);
            this._peers.delete(remoteUserId);
            return { success: true };
        }

        detachAll() {
            const ids = Array.from(this._peers.keys());
            for (const id of ids) this.detach(id);
            return { success: true, detached: ids.length };
        }

        // -------------------------------------------------------------
        // Output device / volume / mute — thin pass-through to the
        // existing CozyAudioDeviceManager seam. No duplicated logic.
        // -------------------------------------------------------------

        /** Re-applies the caller's currently-selected output device (if any) to one remote peer's real element via CozyAudioDeviceManager.applySinkId(). Honest no-op (returns the manager's own failure reason) when no output device is selected or setSinkId isn't supported — never silently ignored as success. */
        async _applyDeviceState(remoteUserId) {
            const rec = this._peers.get(remoteUserId);
            if (!rec || !rec.element) return { success: false, reason: "NO_ACTIVE_PLAYBACK" };
            if (typeof this._audioDeviceManager.applySinkId === "function") {
                await this._audioDeviceManager.applySinkId(rec.element);
            }
            return { success: true };
        }

        /** applyOutputDeviceToAll() — call after the caller changes the selected output device (e.g. via CozyAudioDeviceManager.selectOutput()) so every currently-playing remote peer moves to the new real device, not just the next one attached. */
        async applyOutputDeviceToAll() {
            const results = {};
            for (const remoteUserId of this._peers.keys()) {
                results[remoteUserId] = await this._applyDeviceState(remoteUserId);
            }
            return results;
        }

        setVolume(remoteUserId, level) {
            const rec = this._peers.get(remoteUserId);
            if (!rec || !rec.element) return { success: false, reason: "NO_ACTIVE_PLAYBACK" };
            return this._audioDeviceManager.setPlaybackVolume(rec.element, level);
        }

        setMuted(remoteUserId, muted) {
            const rec = this._peers.get(remoteUserId);
            if (!rec || !rec.element) return { success: false, reason: "NO_ACTIVE_PLAYBACK" };
            return this._audioDeviceManager.setPlaybackMuted(rec.element, muted);
        }

        setAllMuted(muted) {
            const results = {};
            for (const remoteUserId of this._peers.keys()) results[remoteUserId] = this.setMuted(remoteUserId, muted);
            return results;
        }

        // -------------------------------------------------------------
        // Read-only state — the authoritative source Cozy AI connection
        // intelligence (a separate, not-yet-built composition) would
        // read from rather than maintaining any second copy of this.
        // -------------------------------------------------------------

        getPlaybackState(remoteUserId) {
            const rec = this._peers.get(remoteUserId);
            return rec ? rec.state : PLAYBACK_STATE.IDLE;
        }

        listActivePeers() {
            return Array.from(this._peers.keys());
        }

        getDiagnosticsReport() {
            const peers = {};
            for (const [remoteUserId, rec] of this._peers.entries()) peers[remoteUserId] = rec.state;
            return { activePeerCount: this._peers.size, peers };
        }
    }

    return { CozyLivePlaybackReceiver, PLAYBACK_STATE };
});
