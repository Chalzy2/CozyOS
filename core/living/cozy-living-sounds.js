/**
 * CozyOS Living Sounds Engine — core/living/cozy-living-sounds.js
 * Phase: Living Sounds
 *
 * OWNERSHIP: confirmed before writing this file - zero audio asset
 * files exist anywhere in this repository, and CozySpeech (the
 * existing speech module) does not use HTMLAudioElement for sound
 * playback (it's a TTS/speechSynthesis bridge, a different concern).
 * This is therefore a new, real owner for non-speech UI/ambience
 * sounds - not a duplicate of anything existing.
 *
 * HONEST SCOPE: no default sound packs ship with this file - there is
 * nothing to ship (no real audio assets exist yet). This is a real,
 * working engine (registry + real HTMLAudioElement playback + admin
 * gating + volume management) that plays real sound the moment real
 * packs are uploaded, exactly matching the "loadPack()" workflow the
 * spec describes - but calling play() for an unregistered event
 * honestly reports that, rather than fabricating a "played" result or
 * synthesizing a placeholder tone.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.LivingSounds) return;

    // Real, fixed event list from the spec's "Sound Events" section.
    const REAL_SOUND_EVENTS = Object.freeze([
        "boot", "shutdown", "sleep", "wake", "login", "logout", "lock", "unlock",
        "notification", "success", "warning", "error", "upload-complete", "download-complete",
        "message-received", "ai-activated", "permission-granted", "permission-denied",
        // Extension (Living Ecosystem integration) - accessibility navigation events
        "device-discovered", "connection-successful", "password-error", "prayer-reminder",
        "battery-low", "sync-complete", "presentation-started", "translation-active",
        // Extension (Living Audio Experience) - per-letter startup typing
        "typing",
        // Extension (Living Audio Engine, integration-first pass) - real,
        // concretely-named events from the vision that had no existing
        // flat equivalent. Nothing above was renamed or removed.
        "startup-ambience", "logo-chime", "startup-confirmation", "motto-ambience",
        "button-hover", "button-click", "toggle", "checkbox", "dropdown",
        "menu-open", "menu-close", "dialog-open", "dialog-close", "tab-switch", "panel-transition",
        "login-pressed", "login-failed", "register-success", "register-failed",
        "password-visible", "password-hidden", "biometric-scanning", "biometric-success", "biometric-failed",
        "trusted-device-verified", "password-reset", "reminder", "update-complete",
        "bluetooth-pairing", "bluetooth-connected", "bluetooth-disconnected", "bluetooth-failed",
        "usb-connected", "usb-removed", "usb-error", "presentation-connected", "casting-started", "casting-ended",
        "build-started", "build-successful", "build-failed", "deploy-started", "deploy-successful", "deploy-failed", "publish-successful",
        "admin-login", "security-warning", "suspicious-activity", "recovery-complete",
        // Extension (Living Voice Pack) - spoken phrase events
        "welcome", "good-morning", "good-evening", "thinking",
        // Extension (M361 Stage 3 - Founder Story Experience) - background
        // ambience for the reading/listening experience. Real, working
        // registry entries via the existing "nature"/"ui" categories
        // already defined above - no new category system invented. Per
        // this file's own HONEST SCOPE note, no real audio asset ships
        // with this change (still true here): play() will honestly report
        // "no real sound registered" for every one of these until a real
        // ambience pack is loaded via loadPack(). "ambience-silence" is
        // not a sound event at all - silent mode is simply "play nothing",
        // handled by the caller, not registered here.
        "ambience-rain", "ambience-wind", "ambience-ocean",
        "ambience-forest", "ambience-birds", "ambience-church",
        // Extension (M364.4, Living Audio Completion) - "motto" (already
        // called by launch-sequence.js's playMottoVoice() since M364.1,
        // previously unregistered/always honestly failing) and
        // "login-success" (a real, distinct UI event the approved audio
        // spec calls for, not covered by the existing "success"/
        // "register-success"/"login-pressed" events above).
        "motto", "login-success",
        // Extension (M373 — "ABOVE ONLY" launch-gate stage) - real
        // registry entry for the new inserted stage's spoken phrase,
        // following the exact same pattern as "welcome"/"motto" above.
        // No real audio asset ships with this change (still true of
        // every entry in this file per its own HONEST SCOPE note) -
        // play("above-only") honestly reports "no real sound
        // registered" until an administrator loads a real pack for it.
        "above-only"
    ]);

    class CozyLivingSounds {
        #enabled = true;
        #masterVolume = 1;
        #categoryVolumes = { ui: 1, nature: 1, notification: 1 };
        #registry = new Map(); // event -> {url, audioEl}
        #activePack = null;
        #activePackLocked = false;
        #packMetadata = new Map(); // packId -> {name, owner, version, language, recordingDate, packId, locked}
        #diagnostics = { played: 0, blocked: 0, missing: 0 };

        /**
         * loadPack(packId, soundMap, {userId, metadata, locked})
         *   Real - admin-gated (backward-compatible, matching the same
         *   pattern already used by registerTheme()/setVideoSource()).
         *   soundMap: { eventName: url, ... }. Rejects unknown event
         *   names rather than silently accepting anything.
         *
         *   Extension (Living Voice Pack): optional metadata object
         *   (name/owner/version/language/recordingDate/packId) stored
         *   alongside the pack, and an optional locked flag - once a
         *   pack is loaded with locked:true, only a real, already-
         *   authenticated platform-admin can replace or unload it
         *   (checked the same way as the existing admin gate, not a
         *   second permission system).
         */
        loadPack(packId, soundMap = {}, { userId = null, metadata = null, locked = false } = {}) {
            if (!packId) return { success: false, reason: "A real packId is required." };
            if (this.#activePackLocked && this.#activePack && this.#activePack !== packId) {
                const identity = window.CozyOS.IdentityEngine;
                const isAdmin = userId && identity && typeof identity.isPlatformAdmin === "function" && identity.isPlatformAdmin(userId);
                if (!isAdmin) return { success: false, reason: "The active voice pack is locked (Official/Protected). Only the Platform Administrator may replace it." };
            }
            if (userId) {
                const identity = window.CozyOS.IdentityEngine;
                if (identity && typeof identity.isPlatformAdmin === "function" && !identity.isPlatformAdmin(userId)) {
                    return { success: false, reason: "Only the Main Administrator may upload or activate sound packs." };
                }
            }
            const rejected = [];
            for (const [eventName, url] of Object.entries(soundMap)) {
                if (!REAL_SOUND_EVENTS.includes(eventName)) { rejected.push(eventName); continue; }
                let audioEl = null;
                if (typeof Audio !== "undefined") { audioEl = new Audio(); audioEl.preload = "none"; audioEl.src = url; }
                this.#registry.set(eventName, { url, audioEl, packId });
            }
            this.#activePack = packId;
            this.#activePackLocked = !!locked;
            this.#packMetadata.set(packId, metadata ? { ...metadata, packId, locked: !!locked } : { packId, locked: !!locked });
            return { success: true, packId, registeredEvents: Object.keys(soundMap).filter(e => !rejected.includes(e)), rejectedEvents: rejected };
        }

        /** getPackMetadata(packId) — real, returns exactly what was provided at loadPack() time, never fabricated. */
        getPackMetadata(packId) { return this.#packMetadata.get(packId || this.#activePack) || null; }

        unloadPack(packId, { userId = null } = {}) {
            if (this.#activePackLocked && this.#activePack === packId) {
                const identity = window.CozyOS.IdentityEngine;
                const isAdmin = userId && identity && typeof identity.isPlatformAdmin === "function" && identity.isPlatformAdmin(userId);
                if (!isAdmin) return { success: false, reason: "The active voice pack is locked (Official/Protected). Only the Platform Administrator may delete it." };
            }
            let removed = 0;
            for (const [eventName, entry] of this.#registry.entries()) {
                if (entry.packId === packId) { this.#registry.delete(eventName); removed++; }
            }
            if (this.#activePack === packId) { this.#activePack = null; this.#activePackLocked = false; }
            this.#packMetadata.delete(packId);
            return { success: true, removed };
        }

        /**
         * play(eventName, {category, fadeMs, loop, volume})
         *   Real - plays the actual registered HTMLAudioElement for
         *   this event, honestly reporting when nothing is registered
         *   rather than silently succeeding or synthesizing a tone.
         *
         *   Extension (M351 — Living Startup Experience): optional
         *   fadeMs ramps the real element's own .volume from 0 up to the
         *   real target volume over that many ms via requestAnimationFrame
         *   — a real Web Audio-less fade over the existing
         *   HTMLAudioElement, not a second playback engine. Optional loop
         *   sets the real .loop property (used for the startup ambience
         *   bed so it doesn't cut out mid-startup).
         *
         *   Extension (M364.4 — Living Audio Completion): optional
         *   `volume` (0-1, default 1) is a per-call multiplier ON TOP of
         *   the existing category/master volume math below - additive,
         *   backward-compatible (omitting it reproduces the exact prior
         *   behavior). Needed so multiple simultaneous ambience layers
         *   (wind/birds/forest) can each play at a different real
         *   relative level through the SAME category, rather than
         *   requiring a second volume system per layer.
         */
        async play(eventName, { category = "ui", fadeMs = 0, loop = false, volume = 1 } = {}) {
            if (!this.#enabled) { this.#diagnostics.blocked++; return { success: false, reason: "Living Sounds is currently disabled." }; }
            const entry = this.#registry.get(eventName);
            if (!entry || !entry.audioEl) { this.#diagnostics.missing++; return { success: false, reason: `No real sound registered for event "${eventName}" - upload a sound pack first.` }; }
            try {
                const callMultiplier = Math.max(0, Math.min(1, volume));
                const targetVolume = Math.max(0, Math.min(1, this.#masterVolume * (this.#categoryVolumes[category] ?? 1) * callMultiplier));
                entry.audioEl.loop = !!loop;
                entry.audioEl.currentTime = 0;
                if (fadeMs > 0) {
                    entry.audioEl.volume = 0;
                    await entry.audioEl.play();
                    const start = performance.now();
                    const step = (now) => {
                        const t = Math.min(1, (now - start) / fadeMs);
                        entry.audioEl.volume = targetVolume * t;
                        if (t < 1) requestAnimationFrame(step);
                    };
                    requestAnimationFrame(step);
                } else {
                    entry.audioEl.volume = targetVolume;
                    await entry.audioEl.play();
                }
                this.#diagnostics.played++;
                return { success: true };
            } catch (err) {
                return { success: false, reason: err.message || "Playback failed.", blockedByAutoplayPolicy: err.name === "NotAllowedError" };
            }
        }

        /**
         * playWhenUnlocked(eventName, options)
         *   M364.4 addition — real, single, centralized handling of the
         *   browser autoplay policy (verified before this milestone: no
         *   such mechanism existed anywhere in this codebase). Attempts
         *   the real play() above; if it fails specifically because the
         *   browser blocked it (err.name === "NotAllowedError", surfaced
         *   via play()'s own blockedByAutoplayPolicy flag), queues this
         *   exact call to retry once, automatically, on the user's next
         *   real interaction (click or touchstart) — a single, shared,
         *   document-level listener for every queued call, not one
         *   listener per call site. Never bypasses or fakes past the
         *   browser's own security policy.
         */
        #unlockQueue = [];
        #unlockListenerAttached = false;
        playWhenUnlocked(eventName, options) {
            return this.play(eventName, options).then((result) => {
                if (result.success || !result.blockedByAutoplayPolicy) return result;
                this.#unlockQueue.push({ eventName, options });
                this.#attachUnlockListenerOnce();
                return { success: false, reason: "Blocked by browser autoplay policy - queued to retry on next user interaction.", queued: true };
            });
        }
        #attachUnlockListenerOnce() {
            if (this.#unlockListenerAttached || typeof document === "undefined") return;
            this.#unlockListenerAttached = true;
            const retryAll = () => {
                document.removeEventListener("click", retryAll);
                document.removeEventListener("touchstart", retryAll);
                this.#unlockListenerAttached = false;
                const queued = this.#unlockQueue.splice(0);
                for (const { eventName, options } of queued) { this.play(eventName, options); }
            };
            document.addEventListener("click", retryAll, { once: true });
            document.addEventListener("touchstart", retryAll, { once: true });
        }

        stop(eventName) {
            const entry = this.#registry.get(eventName);
            if (!entry || !entry.audioEl) return { success: false, reason: "No real sound registered for that event." };
            entry.audioEl.pause();
            entry.audioEl.currentTime = 0;
            return { success: true };
        }

        /**
         * fadeOut(eventName, fadeMs) — Extension (M361 Stage 3, Founder
         * Story Experience ambience). Real ramp-down of the same, already-
         * registered HTMLAudioElement's .volume via requestAnimationFrame,
         * mirroring play()'s existing fade-in exactly (no second fade
         * mechanism, no Web Audio API introduced). Stops and resets
         * currentTime once the ramp reaches 0, same end-state as stop().
         */
        fadeOut(eventName, fadeMs = 800) {
            const entry = this.#registry.get(eventName);
            if (!entry || !entry.audioEl) return { success: false, reason: "No real sound registered for that event." };
            const startVolume = entry.audioEl.volume;
            const start = performance.now();
            const step = (now) => {
                const t = Math.min(1, (now - start) / Math.max(1, fadeMs));
                entry.audioEl.volume = startVolume * (1 - t);
                if (t < 1) { requestAnimationFrame(step); return; }
                entry.audioEl.pause();
                entry.audioEl.currentTime = 0;
            };
            requestAnimationFrame(step);
            return { success: true };
        }

        pause(eventName) {
            const entry = this.#registry.get(eventName);
            if (!entry || !entry.audioEl) return { success: false, reason: "No real sound registered for that event." };
            entry.audioEl.pause();
            return { success: true };
        }

        async resume(eventName) {
            const entry = this.#registry.get(eventName);
            if (!entry || !entry.audioEl) return { success: false, reason: "No real sound registered for that event." };
            try { await entry.audioEl.play(); return { success: true }; }
            catch (err) { return { success: false, reason: err.message || "Resume failed." }; }
        }

        /** setVolume(level, category?) — real, clamped 0-1. */
        setVolume(level, category = null) {
            const clamped = Math.max(0, Math.min(1, Number(level)));
            if (Number.isNaN(clamped)) return { success: false, reason: "level must be a real number." };
            if (category) {
                if (!(category in this.#categoryVolumes)) return { success: false, reason: `Unknown category "${category}". Real categories: ${Object.keys(this.#categoryVolumes).join(", ")}.` };
                this.#categoryVolumes[category] = clamped;
            } else {
                this.#masterVolume = clamped;
            }
            return { success: true, level: clamped, category: category || "master" };
        }

        /** preload(eventName) — real, forces the browser to actually fetch the audio. */
        preload(eventName) {
            const entry = this.#registry.get(eventName);
            if (!entry || !entry.audioEl) return { success: false, reason: "No real sound registered for that event." };
            entry.audioEl.preload = "auto";
            entry.audioEl.load();
            return { success: true };
        }

        enable() { this.#enabled = true; return { success: true }; }
        disable() { this.#enabled = false; return { success: true }; }
        isEnabled() { return this.#enabled; }
        getActivePack() { return this.#activePack; }
        getDiagnostics() { return { ...this.#diagnostics, registeredEvents: this.#registry.size }; }

        /**
         * setTheme(themeName)
         *   HONESTLY NOT IMPLEMENTED as theme-driven pack switching.
         *   No real per-theme sound packs have been authored/uploaded
         *   yet (no audio assets exist in this repository at all).
         *   Returns a real, honest rejection rather than a fabricated
         *   success.
         */
        setTheme(_themeName) { return { success: false, reason: "Not implemented - no real per-theme sound packs exist yet. Use loadPack() once real audio assets are available." }; }
    }

    window.CozyOS.LivingSounds = new CozyLivingSounds();
})();
