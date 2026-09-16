/**
 * core/modules/media/cozy-audio-device-manager.js
 * CozyOS — Live Participation — Audio Device Manager
 * Milestone: R040 Phase 4A (COS-STEP3-PH3E-CHECKPOINT continuation)
 *
 * REAL SCOPE DISCLOSURE
 *   This is the browser-facing counterpart the repository audit for Phase
 *   4A confirmed did NOT exist: core/engines/audio/audio-manager.js is a
 *   provider-interface MIXER engine for arbitrary hardware adapters and
 *   explicitly discloses "this runtime has no real audio hardware" — it
 *   is not, and was never meant to be, a navigator.mediaDevices wrapper.
 *   This file is that wrapper: real device enumeration, real
 *   getUserMedia() microphone capture, real (feature-detected) output
 *   selection, real devicechange handling. It does not duplicate
 *   audio-manager.js's domain (mixer/gain/DSP-provider lifecycle) and
 *   does not touch it.
 *
 *   Every capability below is feature-detected against the real
 *   `navigator.mediaDevices` / `HTMLMediaElement` APIs at runtime. This
 *   file NEVER reports a capability as available because of platform
 *   guesswork (e.g. "Android therefore Bluetooth: true") — see
 *   getCapabilities() below. Bluetooth/wired/USB audio are surfaced only
 *   as PLATFORM_MANAGED: the browser exposes such a device through the
 *   ordinary input/output device list (a Bluetooth headset just shows up
 *   as another `audioinput`/`audiooutput` entry with a label), but this
 *   file makes no claim about Bluetooth transport itself, and nothing
 *   here has been verified against real Bluetooth/wired/USB hardware —
 *   that remains DEVICE-UNVERIFIED until tested on a real phone (see the
 *   milestone report).
 *
 * WHAT THIS FILE DOES NOT DO
 *   - Does not touch core/engines/audio/audio-manager.js or its mixer/DSP
 *     provider-interface domain.
 *   - Does not implement a transport, session authority, or moderation
 *     logic. See cozy-live-participation-controller.js for the
 *     composition layer that wires this device manager's mic stream to
 *     the existing SessionAuthority speak-state machine and the real
 *     remote-relay transport provider.
 *   - Does not implement WebRTC peer connection / SFU publishing. This
 *     manager's job ends at "here is a real, permission-granted
 *     MediaStream and a place to send its tracks" — RTCPeerConnection
 *     wiring for the actual media leg is the existing
 *     LiveHotspotEngine/RTCPeerConnection path this repo's own
 *     server/live-relay/README.md already scopes as a separate concern
 *     from the JSON signaling/relay server.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CozyOS = root.CozyOS || {};
        var _mod = factory();
        root.CozyOS.CozyAudioDeviceManager = _mod.CozyAudioDeviceManager;
        root.CozyOS.CozyAudioDeviceManager.DEVICE_KIND = _mod.DEVICE_KIND;
    }
})(typeof window !== "undefined" ? window : globalThis, function () {
    "use strict";

    const DEVICE_KIND = Object.freeze({
        INPUT: "audioinput",
        OUTPUT: "audiooutput",
    });

    /**
     * Resolve the real global objects this file depends on, once, at
     * construction time — never assumed. `envOverrides` lets tests (and
     * only tests, per the project's test-double rule) inject fakes that
     * match the real Web API contract; production code never passes this.
     */
    function _resolveEnv(envOverrides) {
        const g = typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : {});
        const nav = (envOverrides && envOverrides.navigator) || g.navigator || null;
        return {
            navigator: nav,
            mediaDevices: nav ? nav.mediaDevices || null : null,
            HTMLMediaElement: (envOverrides && envOverrides.HTMLMediaElement) || g.HTMLMediaElement || null,
            eventBus: (envOverrides && envOverrides.eventBus) ||
                (g.CozyOS && g.CozyOS.PlatformEventBus) || null,
        };
    }

    class CozyAudioDeviceManager {
        /**
         * @param {object} [opts]
         * @param {object} [opts._env] TEST-ONLY. Injected fakes for
         *        navigator/mediaDevices/HTMLMediaElement/eventBus that
         *        must match the real browser contract shape. Never used
         *        in production call sites.
         */
        constructor(opts = {}) {
            this._env = _resolveEnv(opts._env);
            this._initialized = false;
            this._inputs = [];
            this._outputs = [];
            this._selectedInputId = null;
            this._selectedOutputId = null;
            this._micStream = null;
            this._micMuted = false;
            this._deviceChangeHandler = null;
            this._listeners = new Map(); // eventName -> Set<fn>, used only when no PlatformEventBus is present
        }

        // -------------------------------------------------------------
        // Capability model (4A-1) — never fabricated
        // -------------------------------------------------------------

        /**
         * Returns an honest, feature-detected capability snapshot. This
         * NEVER infers a capability from platform/OS guesses (e.g. "this
         * is Android so Bluetooth must work") — every field reflects a
         * real API existing on `navigator`/`HTMLMediaElement` right now.
         */
        getCapabilities() {
            const md = this._env.mediaDevices;
            return Object.freeze({
                microphone: !!(md && typeof md.getUserMedia === "function"),
                inputEnumeration: !!(md && typeof md.enumerateDevices === "function"),
                // Real browsers only return output-kind entries with
                // non-empty labels post-permission; we report the API's
                // presence here, not whether any outputs have been seen
                // yet (that's reflected in enumerateOutputs()'s result).
                outputEnumeration: !!(md && typeof md.enumerateDevices === "function"),
                outputSelection: !!(this._env.HTMLMediaElement &&
                    this._env.HTMLMediaElement.prototype &&
                    typeof this._env.HTMLMediaElement.prototype.setSinkId === "function"),
                // Deliberately keyed only on addEventListener support, not
                // on `"ondevicechange" in md` — the latter would become a
                // false positive the moment initialize()'s legacy fallback
                // assigns md.ondevicechange itself, since that's the exact
                // action that would create the property. Every real
                // browser's MediaDevices is an EventTarget with
                // addEventListener, so this is the honest, non-self-
                // fulfilling signal.
                deviceChangeEvents: !!(md && typeof md.addEventListener === "function"),
                // Bluetooth/wired/USB are platform/OS routing concerns.
                // The browser never tells us "this specific input is
                // Bluetooth" in a portable, spec-guaranteed way — a
                // Bluetooth mic just appears as an ordinary audioinput
                // device with a descriptive label on most platforms.
                // We report the honest, non-overclaiming status here and
                // let the actual device list (label strings) inform the
                // UI, rather than asserting a false positive/negative.
                bluetooth: "platform-managed",
                wiredHeadset: "platform-managed",
                usbAudio: "platform-managed",
            });
        }

        // -------------------------------------------------------------
        // Lifecycle
        // -------------------------------------------------------------

        /**
         * Sets up devicechange listening (if supported) and performs an
         * initial, permission-agnostic device enumeration. Does NOT
         * request microphone permission — per 4A-2, permission is only
         * requested when the participant explicitly tries to speak.
         */
        async initialize() {
            if (this._initialized) return { success: true, alreadyInitialized: true };
            const md = this._env.mediaDevices;

            if (md && typeof md.addEventListener === "function") {
                this._deviceChangeHandler = () => this._onDeviceChange();
                md.addEventListener("devicechange", this._deviceChangeHandler);
            } else if (md) {
                // Some environments only expose the legacy on-property form.
                this._deviceChangeHandler = () => this._onDeviceChange();
                md.ondevicechange = this._deviceChangeHandler;
            }

            if (md && typeof md.enumerateDevices === "function") {
                await this._refreshDeviceLists();
            }

            this._initialized = true;
            return { success: true, capabilities: this.getCapabilities() };
        }

        destroy() {
            const md = this._env.mediaDevices;
            if (md && this._deviceChangeHandler) {
                if (typeof md.removeEventListener === "function") {
                    md.removeEventListener("devicechange", this._deviceChangeHandler);
                } else if (md.ondevicechange === this._deviceChangeHandler) {
                    md.ondevicechange = null;
                }
            }
            this.stopMicrophone();
            this._deviceChangeHandler = null;
            this._initialized = false;
            this._listeners.clear();
        }

        // -------------------------------------------------------------
        // Enumeration (4A-1 A/B/C)
        // -------------------------------------------------------------

        async _refreshDeviceLists() {
            const md = this._env.mediaDevices;
            if (!md || typeof md.enumerateDevices !== "function") {
                this._inputs = [];
                this._outputs = [];
                return { inputs: [], outputs: [] };
            }
            const raw = await md.enumerateDevices();
            const inputs = [];
            const outputs = [];
            for (const d of raw || []) {
                const entry = Object.freeze({
                    deviceId: d.deviceId,
                    kind: d.kind,
                    label: d.label || "",
                    groupId: d.groupId || "",
                });
                if (d.kind === DEVICE_KIND.INPUT) inputs.push(entry);
                else if (d.kind === DEVICE_KIND.OUTPUT) outputs.push(entry);
            }
            this._inputs = inputs;
            this._outputs = outputs;
            return { inputs, outputs };
        }

        async enumerateInputs() {
            await this._refreshDeviceLists();
            return this._inputs.slice();
        }

        async enumerateOutputs() {
            await this._refreshDeviceLists();
            return this._outputs.slice();
        }

        getSelectedInput() {
            return this._selectedInputId;
        }

        getSelectedOutput() {
            return this._selectedOutputId;
        }

        /** Selecting an input does not itself start capture — it only records
         * intent, honored by the next requestMicrophone()/createMicrophoneStream()
         * call. Rejects a deviceId not currently in the known input list. */
        async selectInput(deviceId) {
            await this._refreshDeviceLists();
            const exists = this._inputs.some((d) => d.deviceId === deviceId);
            if (!exists) return { success: false, reason: "UNKNOWN_INPUT_DEVICE" };
            this._selectedInputId = deviceId;
            this._emit("audio-device:input-selected", { deviceId });
            return { success: true, deviceId };
        }

        /** Output selection requires HTMLMediaElement.setSinkId support (4A-6).
         * Only records the selection here — actually applying it is the
         * caller's job (call applySinkId(mediaElement) on the element that
         * plays remote audio), since this manager doesn't own the DOM
         * playback element for the live session. */
        async selectOutput(deviceId) {
            const caps = this.getCapabilities();
            if (!caps.outputSelection) {
                return { success: false, reason: "OUTPUT_DEVICE_SELECTION_UNAVAILABLE" };
            }
            await this._refreshDeviceLists();
            const exists = this._outputs.some((d) => d.deviceId === deviceId);
            if (!exists) return { success: false, reason: "UNKNOWN_OUTPUT_DEVICE" };
            this._selectedOutputId = deviceId;
            this._emit("audio-device:output-selected", { deviceId });
            return { success: true, deviceId };
        }

        /** Applies the currently selected output device to a real
         * HTMLMediaElement via setSinkId(), feature-detected. Returns an
         * honest failure if the API or a selection isn't available —
         * never silently no-ops while claiming success. */
        async applySinkId(mediaElement) {
            const caps = this.getCapabilities();
            if (!caps.outputSelection) return { success: false, reason: "OUTPUT_DEVICE_SELECTION_UNAVAILABLE" };
            if (!this._selectedOutputId) return { success: false, reason: "NO_OUTPUT_SELECTED" };
            if (!mediaElement || typeof mediaElement.setSinkId !== "function") {
                return { success: false, reason: "OUTPUT_DEVICE_SELECTION_UNAVAILABLE" };
            }
            await mediaElement.setSinkId(this._selectedOutputId);
            return { success: true, deviceId: this._selectedOutputId };
        }

        // -------------------------------------------------------------
        // Permission + microphone capture (4A-2)
        // -------------------------------------------------------------

        /** Explicit permission request. Must be called only in direct
         * response to a genuine user participation action (e.g. "Request
         * to Speak"), never on ChurchOS open, per 4A-2. */
        async requestMicrophonePermission() {
            const md = this._env.mediaDevices;
            if (!md || typeof md.getUserMedia !== "function") {
                return { success: false, reason: "MICROPHONE_UNAVAILABLE" };
            }
            try {
                const constraints = { audio: this._selectedInputId ? { deviceId: { exact: this._selectedInputId } } : true };
                const stream = await md.getUserMedia(constraints);
                // Permission-probe only: this call's own stream is stopped
                // immediately. A real speaking session calls
                // requestMicrophone()/createMicrophoneStream() to get a
                // stream it actually keeps.
                for (const track of stream.getTracks ? stream.getTracks() : []) track.stop();
                // Labels only become non-empty after permission is granted;
                // refresh so callers see real device names from here on.
                await this._refreshDeviceLists();
                return { success: true };
            } catch (err) {
                return { success: false, reason: "PERMISSION_DENIED", detail: err && err.message };
            }
        }

        /** Real getUserMedia() capture. Does not implicitly request
         * permission on session join — this is only ever invoked from the
         * explicit speak/participate flow (see
         * cozy-live-participation-controller.js, which gates this call
         * behind the SessionAuthority SPEAKING_ALLOWED state). */
        async requestMicrophone() {
            return this.createMicrophoneStream();
        }

        async createMicrophoneStream() {
            const md = this._env.mediaDevices;
            if (!md || typeof md.getUserMedia !== "function") {
                return { success: false, reason: "MICROPHONE_UNAVAILABLE" };
            }
            if (this._micStream) {
                return { success: true, stream: this._micStream, alreadyActive: true };
            }
            try {
                const constraints = { audio: this._selectedInputId ? { deviceId: { exact: this._selectedInputId } } : true };
                const stream = await md.getUserMedia(constraints);
                this._micStream = stream;
                this._micMuted = false;
                this._applyMuteToTracks();
                await this._refreshDeviceLists();
                this._emit("audio-device:microphone-active", {});
                return { success: true, stream };
            } catch (err) {
                return { success: false, reason: "PERMISSION_DENIED", detail: err && err.message };
            }
        }

        stopMicrophone() {
            if (!this._micStream) return { success: true, alreadyStopped: true };
            for (const track of this._micStream.getTracks ? this._micStream.getTracks() : []) track.stop();
            this._micStream = null;
            this._micMuted = false;
            this._emit("audio-device:microphone-stopped", {});
            return { success: true };
        }

        muteLocalMicrophone() {
            this._micMuted = true;
            this._applyMuteToTracks();
            this._emit("audio-device:microphone-muted", { muted: true });
            return { success: true, muted: true };
        }

        unmuteLocalMicrophone() {
            this._micMuted = false;
            this._applyMuteToTracks();
            this._emit("audio-device:microphone-muted", { muted: false });
            return { success: true, muted: false };
        }

        isMicrophoneMuted() {
            return this._micMuted;
        }

        _applyMuteToTracks() {
            if (!this._micStream || !this._micStream.getAudioTracks) return;
            for (const track of this._micStream.getAudioTracks()) {
                track.enabled = !this._micMuted;
            }
        }

        // -------------------------------------------------------------
        // Local playback volume (4A-6) — never microphone gain, never a
        // claim of controlling the OS speaker volume.
        // -------------------------------------------------------------

        /** Sets the volume property (0.0-1.0) on a real HTMLMediaElement
         * used for remote playback. This is application-level playback
         * volume only — the OS/hardware output volume remains under the
         * user's own device controls, never overridden here. */
        setPlaybackVolume(mediaElement, level) {
            if (!mediaElement) return { success: false, reason: "NO_MEDIA_ELEMENT" };
            const clamped = Math.max(0, Math.min(1, Number(level)));
            if (Number.isNaN(clamped)) return { success: false, reason: "INVALID_VOLUME" };
            mediaElement.volume = clamped;
            return { success: true, volume: clamped };
        }

        setPlaybackMuted(mediaElement, muted) {
            if (!mediaElement) return { success: false, reason: "NO_MEDIA_ELEMENT" };
            mediaElement.muted = !!muted;
            return { success: true, muted: !!muted };
        }

        // -------------------------------------------------------------
        // Device change handling (4A-8)
        // -------------------------------------------------------------

        async _onDeviceChange() {
            const prevInput = this._selectedInputId;
            const prevOutput = this._selectedOutputId;
            await this._refreshDeviceLists();

            let fellBackInput = false;
            if (prevInput && !this._inputs.some((d) => d.deviceId === prevInput)) {
                this._selectedInputId = null;
                fellBackInput = true;
            }
            let fellBackOutput = false;
            if (prevOutput && !this._outputs.some((d) => d.deviceId === prevOutput)) {
                this._selectedOutputId = null;
                fellBackOutput = true;
            }

            // A disappeared *selected* input device (e.g. Bluetooth headset
            // powered off mid-session) does not itself tear down an active
            // mic stream here — the browser's own track will fire its own
            // 'ended'/mute event on that track if the underlying hardware
            // truly vanished. This manager's job is just to keep the
            // device inventory and selection state honest and let the
            // caller (participation controller) decide session-level
            // consequences; it must never terminate the whole ChurchOS
            // session merely because one audio device disappeared (4A-8).
            this._emit("audio-device:list-changed", {
                inputs: this._inputs,
                outputs: this._outputs,
                fellBackInput,
                fellBackOutput,
            });
        }

        // -------------------------------------------------------------
        // Event emission — real PlatformEventBus when present (browser),
        // an honest local emitter otherwise (Node tests / no bus loaded).
        // -------------------------------------------------------------

        _emit(eventName, payload) {
            if (this._env.eventBus && typeof this._env.eventBus.emit === "function") {
                this._env.eventBus.emit(eventName, payload);
                return;
            }
            const set = this._listeners.get(eventName);
            if (!set) return;
            for (const fn of set) fn(payload);
        }

        /** Only used when no PlatformEventBus is present (e.g. this module's
         * own unit tests). In a real browser deployment, callers should
         * subscribe via window.CozyOS.PlatformEventBus.on(...) directly. */
        on(eventName, handler) {
            if (!this._listeners.has(eventName)) this._listeners.set(eventName, new Set());
            this._listeners.get(eventName).add(handler);
            return () => this._listeners.get(eventName)?.delete(handler);
        }
    }

    return { CozyAudioDeviceManager, DEVICE_KIND };
});
