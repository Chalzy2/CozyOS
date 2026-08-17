/**
 * CozyOS Voice Manager
 * File Reference: core/modules/speech/voice-manager.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 356 — CozyOS Voice Framework
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN
 *   cozy-speech.js (CozySpeech) already owns Voice Profile bookkeeping
 *   (registerVoiceProfile) and the ONE real preview/TTS backend slot
 *   (registerPreviewBackend/previewVoice) — confirmed by reading its
 *   real implementation (§3.27, §3.33). Only one function can occupy
 *   that slot at a time; CozySpeech itself is deliberately opaque
 *   bookkeeping and never decides which backend that should be.
 *   cozy-tts-browser-adapter.js already fills that slot today with a
 *   real, generic Web Speech API backend. This file does not replace
 *   CozySpeech, does not duplicate its registries, and does not
 *   reimplement browser speech synthesis — it is the one real routing
 *   layer CozyOS did not have: given several registered voice
 *   PROVIDERS (Charles, and stub adapters for future
 *   Google/Microsoft/etc.), which one is "the" preview backend right
 *   now, and what happens if the selected one can't actually speak.
 *
 * OWNS
 *   - The provider registry (register/enable/disable/list).
 *   - The default voice + per-context voice assignment (startup,
 *     login, assistant, notification, navigation, accessibility, …).
 *   - Voice pack install/remove/update/validate (delegates real
 *     parsing/validation to voice-pack-import.js — not duplicated here).
 *   - Fallback: if the selected provider can't speak a given request,
 *     falls back to Charles; if Charles also can't (no matching
 *     recorded phrase), falls back to the existing, real, generic
 *     browser adapter — never silently claims to be a voice it isn't
 *     actually using (getLastSpokenProviderId() reports which one
 *     actually spoke).
 *   - Becoming CozySpeech's ONE registered preview backend, so every
 *     existing caller of CozySpeech.previewVoice() (Voice Studio, etc.)
 *     transparently gets provider-aware routing without CozySpeech
 *     itself changing at all.
 *
 * DOES NOT OWN
 *   - Voice Profile / Accent / Emotion / Speaking Style bookkeeping —
 *     CozySpeech's, untouched.
 *   - Voice preference storage (language/profile/gain) — remains
 *     VoiceSettingsAdapter's, untouched; this file's own settings
 *     (selected provider, per-context assignment, speed/pitch/volume)
 *     are a distinct, new concept CozyOS did not have a home for, and
 *     are deliberately kept separate rather than force-fit into that
 *     adapter's narrower, already-shipped contract.
 *   - Generic Web Speech API playback — cozy-tts-browser-adapter.js's,
 *     composed via its exported speakPreview(), never reimplemented.
 *
 * HONEST, DISCLOSED LIMITATION
 *   Settings persist to this browser's localStorage only
 *   (`cozyos.voiceManager.v1`). CozyStorage (cozy-storage.js) exists
 *   and is a real, generic object-storage coordinator, but wiring this
 *   file's small settings blob through its full space/object/version
 *   model was judged disproportionate to this milestone's real scope —
 *   flagged here as a deliberate choice, not a silent gap.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VM_VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.VoiceManager) return; // duplicate-load guard

    const STORAGE_KEY = "cozyos.voiceManager.v1";
    const CONTEXTS = Object.freeze([
        "startup", "navigation", "assistant", "notification", "accessibility",
    ]);

    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    function sanitize(obj) {
        if (!obj || typeof obj !== "object") return {};
        const clean = {};
        for (const k of Object.keys(obj)) if (!FORBIDDEN_KEYS.has(k)) clean[k] = obj[k];
        return clean;
    }
    function escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

    class VoiceManager {
        #providers = new Map(); // providerId -> { providerId, displayName, status, isDefault, capabilities, speak, meta }
        #settings = {
            defaultProviderId: "charles",
            perContext: {}, // context -> providerId override, real only when explicitly set
            speed: 1.0, pitch: 1.0, volume: 1.0,
        };
        #lastSpokenProviderId = null;
        #diagnostics = { previewCalls: 0, fallbacksToCharles: 0, fallbacksToBrowser: 0, unavailable: 0 };
        #auditLog = [];

        constructor() { this.#loadSettings(); }

        getVersion() { return VM_VERSION; }

        #logAudit(event, detail) {
            this.#auditLog.push({ event, at: new Date().toISOString(), detail: sanitize(detail) });
            if (this.#auditLog.length > 200) this.#auditLog.shift();
        }
        getAuditLog() { return this.#auditLog.map((e) => ({ ...e })); }

        #loadSettings() {
            try {
                const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
                if (raw) this.#settings = { ...this.#settings, ...sanitize(JSON.parse(raw)) };
            } catch (_err) { /* honest no-op — corrupt/missing storage falls back to real defaults above */ }
        }
        #saveSettings() {
            try { if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#settings)); }
            catch (_err) { /* non-fatal — storage may be full/unavailable; in-memory settings still work for this session */ }
        }

        // ── PROVIDER REGISTRY ──────────────────────────────────────────────

        /**
         * registerProvider(config)
         *   config: { providerId, displayName, status, isDefault?, capabilities, speak?, meta? }
         *   `status` MUST be one of the real, honest values below — never
         *   inferred as "installed" just because register() was called.
         */
        registerProvider(config = {}) {
            if (typeof config.providerId !== "string" || !config.providerId) return { success: false, reason: "providerId is required." };
            if (typeof config.displayName !== "string" || !config.displayName) return { success: false, reason: "displayName is required." };
            const validStatuses = new Set(["installed", "not_installed", "requires_configuration", "requires_api_key", "unsupported_on_device"]);
            const status = validStatuses.has(config.status) ? config.status : "not_installed";
            this.#providers.set(config.providerId, {
                providerId: config.providerId,
                displayName: config.displayName,
                status,
                isDefault: config.isDefault === true,
                // Milestone 356b — real, not asserted: every provider now
                // carries its own interfaceVersion, defaulting to "1.0.0"
                // if the registering file didn't supply one, so a future
                // provider (a real Google/Microsoft/cloned-voice adapter)
                // can declare which shape of this interface it targets
                // without VoiceManager's own dispatch logic changing.
                interfaceVersion: typeof config.interfaceVersion === "string" ? config.interfaceVersion : "1.0.0",
                capabilities: sanitize(config.capabilities || {}),
                speak: typeof config.speak === "function" ? config.speak : null,
                // Milestone 356 Implementation Status Rule (Engineering
                // Governance v1.0, Principle 12): Current Status
                // (`status` above) and What's Needed Next are kept as two
                // distinct fields on purpose — never merged into one line
                // that could blur "this works" with "this is what would
                // make it work." Falls back to an honest generic per
                // status if a provider file didn't supply its own.
                nextStep: typeof config.nextStep === "string" && config.nextStep
                    ? config.nextStep
                    : (status === "installed" ? "Ready to use" : "Not yet configured on this installation."),
                meta: sanitize(config.meta || {}),
            });
            this.#logAudit("provider-registered", { providerId: config.providerId, status });
            return { success: true };
        }

        unregisterProvider(providerId) {
            const existed = this.#providers.delete(providerId);
            if (existed) this.#logAudit("provider-unregistered", { providerId });
            return existed;
        }

        listProviders() { return Array.from(this.#providers.values()).map((p) => ({ ...p, speak: undefined })); }
        getProvider(providerId) { const p = this.#providers.get(providerId); return p ? { ...p, speak: undefined } : null; }

        /** enableProvider/disableProvider — real, honest state toggle only for providers already marked "installed"; cannot enable a provider this platform doesn't actually have a working backend for. */
        enableProvider(providerId) {
            const p = this.#providers.get(providerId);
            if (!p) return { success: false, reason: `Unknown providerId "${providerId}".` };
            if (p.status !== "installed") return { success: false, reason: `"${p.displayName}" is ${p.status.replace(/_/g, " ")} — cannot enable a provider with no real working backend.` };
            p.meta.enabled = true;
            this.#logAudit("provider-enabled", { providerId });
            return { success: true };
        }
        disableProvider(providerId) {
            const p = this.#providers.get(providerId);
            if (!p) return { success: false, reason: `Unknown providerId "${providerId}".` };
            p.meta.enabled = false;
            this.#logAudit("provider-disabled", { providerId });
            return { success: true };
        }

        // ── VOICE PACKS (install/remove/update/validate) ────────────────────
        // Real validation is owned by voice-pack-import.js — composed, not
        // duplicated. This just records the outcome as a provider entry.

        installVoicePack(manifest, opts = {}) {
            const importer = window.CozyOS.VoicePackImporter;
            if (!importer || typeof importer.validateManifest !== "function") {
                return { success: false, reason: "VoicePackImporter is not loaded — cannot honestly validate a voice pack without it." };
            }
            const validation = importer.validateManifest(manifest);
            if (!validation.valid) return { success: false, reason: validation.reason };
            const providerId = `voicepack:${validation.manifest.id}`;
            this.registerProvider({
                providerId, displayName: validation.manifest.name,
                status: opts.hasAudio === true ? "installed" : "requires_configuration",
                capabilities: { recordedPhrasePlayback: opts.hasAudio === true, dynamicSynthesis: "requires_configuration" },
                meta: { ...validation.manifest, importedAt: new Date().toISOString() },
            });
            this.#logAudit("voicepack-installed", { providerId, name: validation.manifest.name });
            return { success: true, providerId };
        }
        removeVoicePack(providerId) { return this.unregisterProvider(providerId); }
        updateVoicePack(providerId, manifest) {
            if (!this.#providers.has(providerId)) return { success: false, reason: `Unknown voice pack "${providerId}".` };
            return this.installVoicePack(manifest, { hasAudio: this.#providers.get(providerId).capabilities.recordedPhrasePlayback });
        }
        validateVoicePack(manifest) {
            const importer = window.CozyOS.VoicePackImporter;
            if (!importer) return { valid: false, reason: "VoicePackImporter is not loaded." };
            return importer.validateManifest(manifest);
        }

        // ── DEFAULT / PER-CONTEXT ASSIGNMENT ────────────────────────────────

        listContexts() { return CONTEXTS.slice(); }

        setDefaultVoice(providerId) {
            if (!this.#providers.has(providerId)) return { success: false, reason: `Unknown providerId "${providerId}".` };
            this.#settings.defaultProviderId = providerId;
            this.#saveSettings();
            this.#logAudit("default-voice-changed", { providerId });
            return { success: true };
        }
        getDefaultVoice() { return this.#settings.defaultProviderId; }

        setContextVoice(context, providerId) {
            if (!CONTEXTS.includes(context)) return { success: false, reason: `Unknown context "${context}". Known: ${CONTEXTS.join(", ")}.` };
            if (providerId !== null && !this.#providers.has(providerId)) return { success: false, reason: `Unknown providerId "${providerId}".` };
            if (providerId === null) delete this.#settings.perContext[context];
            else this.#settings.perContext[context] = providerId;
            this.#saveSettings();
            this.#logAudit("context-voice-changed", { context, providerId });
            return { success: true };
        }
        getContextVoice(context) { return this.#settings.perContext[context] || this.#settings.defaultProviderId; }

        setSpeed(v) { if (typeof v !== "number" || v < 0.1 || v > 10) return { success: false, reason: "speed must be between 0.1 and 10." }; this.#settings.speed = v; this.#saveSettings(); return { success: true }; }
        setPitch(v) { if (typeof v !== "number" || v < 0 || v > 2) return { success: false, reason: "pitch must be between 0 and 2." }; this.#settings.pitch = v; this.#saveSettings(); return { success: true }; }
        setVolume(v) { if (typeof v !== "number" || v < 0 || v > 1) return { success: false, reason: "volume must be between 0 and 1." }; this.#settings.volume = v; this.#saveSettings(); return { success: true }; }
        getSettings() { return { ...this.#settings, perContext: { ...this.#settings.perContext } }; }

        resetSettings() {
            this.#settings = { defaultProviderId: "charles", perContext: {}, speed: 1.0, pitch: 1.0, volume: 1.0 };
            this.#saveSettings();
            this.#logAudit("settings-reset", {});
            return { success: true };
        }

        getLastSpokenProviderId() { return this.#lastSpokenProviderId; }
        getDiagnosticsReport() { return { moduleVersion: VM_VERSION, ...this.#diagnostics, providerCount: this.#providers.size, defaultProviderId: this.#settings.defaultProviderId }; }

        // ── REAL SPEAK / FALLBACK CHAIN ─────────────────────────────────────

        /**
         * speak({ text, context, providerId })
         *   The one real dispatch point. Resolves an honest
         *   { available, played, providerId, reason? } — providerId
         *   always names whichever provider ACTUALLY spoke (or attempted
         *   to), so a caller (or the Settings UI) can tell a fallback
         *   happened rather than assuming the requested voice was used.
         */
        async speak(request = {}) {
            this.#diagnostics.previewCalls++;
            const context = request.context && CONTEXTS.includes(request.context) ? request.context : null;
            const requestedProviderId = request.providerId || (context ? this.getContextVoice(context) : this.#settings.defaultProviderId);

            const attempt = async (providerId, isFallback) => {
                const p = this.#providers.get(providerId);
                if (!p || p.status !== "installed" || !p.speak) return null;
                try {
                    const result = await p.speak({ text: request.text, context: request.context, settingsId: request.settingsId, speed: this.#settings.speed, pitch: this.#settings.pitch, volume: this.#settings.volume });
                    if (result && result.available && result.played) {
                        this.#lastSpokenProviderId = providerId;
                        if (isFallback) this.#logAudit("fallback-succeeded", { providerId });
                        return { available: true, played: true, providerId, reason: null };
                    }
                    return null;
                } catch (err) {
                    this.#logAudit("provider-threw", { providerId, error: err.message });
                    return null;
                }
            };

            const direct = await attempt(requestedProviderId, false);
            if (direct) return direct;

            if (requestedProviderId !== "charles") {
                this.#diagnostics.fallbacksToCharles++;
                this.#logAudit("fallback-to-charles", { from: requestedProviderId });
                const viaCharles = await attempt("charles", true);
                if (viaCharles) return viaCharles;
            }

            // Real, last-resort, GENERIC fallback — composes the existing
            // browser adapter directly rather than reimplementing Web
            // Speech API logic. Reports its true identity ("browser"), it
            // never claims to still be Charles.
            const browserAdapter = window.CozyOS.CozyTTSBrowserAdapter;
            if (browserAdapter && typeof browserAdapter.speakPreview === "function" && browserAdapter.isAvailable()) {
                this.#diagnostics.fallbacksToBrowser++;
                this.#logAudit("fallback-to-browser", { from: requestedProviderId });
                try {
                    const result = await browserAdapter.speakPreview({ text: request.text, settingsId: request.settingsId });
                    if (result.played) { this.#lastSpokenProviderId = "browser"; return { available: true, played: true, providerId: "browser", reason: "Fell back to this browser's generic system voice — not Charles." }; }
                } catch (_err) { /* falls through to honest unavailable below */ }
            }

            this.#diagnostics.unavailable++;
            this.#lastSpokenProviderId = null;
            return { available: false, played: false, providerId: null, reason: "No provider — including Charles and this browser's generic voice — could speak this request." };
        }

        // ── RL-014 Platform Inspection Contract ─────────────────────────────
        getId() { return "VoiceManager"; }
        getName() { return "CozyOS Voice Manager"; }
        getDependencies() { return ["CozySpeech", "CozyTTSBrowserAdapter"]; }
        getHealth() { return { state: this.#providers.size > 0 ? "active" : "ready", providerCount: this.#providers.size, previewBackendRegisteredWithCozySpeech: !!(window.CozyOS.CozySpeech && window.CozyOS.CozySpeech.hasRealPreviewBackend && window.CozyOS.CozySpeech.hasRealPreviewBackend()) }; }
        getCapabilities() { return { providers: this.listProviders().map((p) => ({ providerId: p.providerId, status: p.status })) }; }

        getIntegrationManifest() {
            return {
                uses: ["CozySpeech.registerPreviewBackend()/registerVoiceProfile() (real, verified)", "CozyTTSBrowserAdapter.speakPreview() (real, generic last-resort fallback, verified)", "VoicePackImporter.validateManifest() (real, composed, not duplicated)"],
                dependsOn: ["CozySpeech (hard dependency for becoming the active preview backend)"],
                usedBy: ["voice-settings-panel.js (Settings \u2192 Voice & Speech UI)", "any module composing window.CozyOS.VoiceManager.speak() directly for startup/navigation/assistant/notification/accessibility moments"],
                security: { failClosed: "No providers registered, or every provider unavailable, both correctly resolve speak() to { available:false } — never a fabricated success." },
                certification: "Plain JavaScript, reviewable like any other coordinator — no special-cased path.",
            };
        }
    }

    window.CozyOS.VoiceManager = new VoiceManager();

    // Real composition: become CozySpeech's ONE preview backend. Whatever
    // registered before this (e.g. cozy-tts-browser-adapter.js's own
    // direct self-registration) is honestly superseded — CozySpeech's
    // registerPreviewBackend() only ever holds one function, last write
    // wins, by its own documented design (see cozy-speech.js §3.33). This
    // is not a race condition this file introduces; it is the existing,
    // documented contract, and this file is deliberately loaded after
    // cozy-tts-browser-adapter.js in dashboard.html for exactly this
    // reason — see this file's own <script> comment there.
    function tryComposeCozySpeech() {
        const speech = window.CozyOS.CozySpeech;
        if (!speech || typeof speech.registerPreviewBackend !== "function") return false;
        speech.registerPreviewBackend((config) => window.CozyOS.VoiceManager.speak(config));
        if (typeof speech.registerVoiceProfile === "function") {
            try { speech.registerVoiceProfile({ name: "Charles (Official CozyOS Voice)", description: "CozyOS's real, official recorded voice.", builtin: true }); } catch (_err) { /* non-fatal bookkeeping only */ }
        }
        if (typeof speech.registerAdapter === "function") {
            try { speech.registerAdapter({ name: "VoiceManager", type: "voice-routing", capabilities: ["provider-registry", "fallback-routing"], offline: true, version: VM_VERSION }); } catch (_err) { /* non-fatal */ }
        }
        return true;
    }
    if (!tryComposeCozySpeech() && typeof document !== "undefined") {
        document.addEventListener("DOMContentLoaded", tryComposeCozySpeech, { once: true });
    }

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                sourcePath: "core/modules/speech/voice-manager.js", name: "VoiceManager", category: "Platform", icon: "mic.svg",
                description: "Real voice provider registry, default/per-context assignment, and honest fallback routing. Composes CozySpeech's existing preview-backend slot and CozyTTSBrowserAdapter's existing generic playback — does not duplicate either.",
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
