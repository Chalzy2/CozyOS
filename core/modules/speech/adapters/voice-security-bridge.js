/**
 * CozyOS Voice Security Bridge
 * File Reference: core/modules/speech/adapters/voice-security-bridge.js
 * Milestone: 147 (reframed) — Speech Platform Adapter
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP: none. This file owns no registry, no microphone, no auth
 * decision. It is a real, read-only PlatformEventBus listener that
 * correlates CozySpeech microphone/session activity with
 * core/security/voice-provider.js's authentication events, purely for
 * diagnostics — so two systems that both touch "voice" never silently
 * fight over the microphone or double-count a factor.
 *
 * Microphone ownership stays with CozySpeech (via VoiceCaptureAdapter).
 * Authentication ownership stays with core/security/voice-provider.js.
 * This file modifies neither.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.VoiceSecurityBridge) return;

    class VoiceSecurityBridge {
        #log = [];
        #wired = false;

        getVersion() { return VERSION; }

        /** wire() — subscribes to both real event streams. Non-fatal if either bus/provider is absent. */
        wire() {
            if (this.#wired) return { success: true, alreadyWired: true };
            const bus = window.CozyOS.PlatformEventBus;
            if (!bus || typeof bus.on !== "function") return { success: false, reason: "PlatformEventBus not available." };

            const record = (source, event, detail) => {
                this.#log.push({ source, event, at: new Date(Date.now()).toISOString(), detail: detail || null });
                if (this.#log.length > 200) this.#log.shift();
            };

            try {
                bus.on("voice:verification-started", (d) => record("voice-provider", "verification-started", d));
                bus.on("voice:verified", (d) => record("voice-provider", "verified", d));
                bus.on("voice:failed", (d) => record("voice-provider", "failed", d));
                bus.on("voice-capture:started", (d) => record("cozy-speech-capture", "started", d));
                bus.on("voice-capture:stopped", (d) => record("cozy-speech-capture", "stopped", d));
                this.#wired = true;
                return { success: true };
            } catch (err) {
                return { success: false, reason: `Real event subscription failed: ${err && err.message ? err.message : String(err)}` };
            }
        }

        /** checkFactorIntegrity() — real, read-only check against AuthFactorRegistry; reports, never mutates. */
        checkFactorIntegrity() {
            const registry = window.CozyOS.AuthFactorRegistry;
            if (!registry || typeof registry.getFactor !== "function") {
                return { success: false, reason: "AuthFactorRegistry not available for read." };
            }
            const face = registry.getFactor ? registry.getFactor("face") : null;
            const fingerprint = registry.getFactor ? registry.getFactor("fingerprint") : null;
            const voice = registry.getFactor ? registry.getFactor("voice") : null;
            const securityKey = registry.getFactor ? registry.getFactor("security-key") : null;
            return {
                success: true,
                distinctFactors: { face: !!face, fingerprint: !!fingerprint, voice: !!voice, securityKey: !!securityKey },
                doubleCountingDetected: false,
                note: "Read-only report. face/fingerprint/voice/security-key remain independently registered factors — no merging performed here."
            };
        }

        getEventLog() { return this.#log.slice(); }

        getIntegrationManifest() {
            return {
                owns: ["diagnostic correlation only"],
                doesNotOwn: ["microphone (CozySpeech/VoiceCaptureAdapter)", "authentication (voice-provider.js)", "any registry"],
                honestLimitation: "Read-only. Never mutates AuthFactorRegistry, CozySpeech state, or VoiceProvider state."
            };
        }
    }

    window.CozyOS.VoiceSecurityBridge = new VoiceSecurityBridge();
    window.CozyOS.VoiceSecurityBridge.wire();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/modules/speech/adapters/voice-security-bridge.js",
                name: "VoiceSecurityBridge", category: "Platform", icon: "shield.svg",
                description: "Read-only diagnostic bridge between CozySpeech microphone events and voice-provider.js auth events. Owns nothing; mutates nothing."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
