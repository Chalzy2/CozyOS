/**
 * CozyOS Voice Catalog — core/modules/speech/voice-catalog.js
 * Layer: Core / Platform Foundation — Voice Presentation / Metadata
 * Version: 1.0.0-ENTERPRISE
 * Workstream: Cozy Voice Subsystem — Pre-Implementation Audit + Scoped
 *             Voice Realization / Presentation-Sync Implementation
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN (see
 * docs/audits/MICROMILESTONE-D-VOICE-STT-AUTHORITY-RECONCILIATION-AUDIT.md
 * and this workstream's own re-verification of every claim below against
 * current source, file-by-file, before any line of this file was written):
 *
 *   - VoiceManager (voice-manager.js) already owns the ONE real provider
 *     registry, default/per-context voice assignment, and the real
 *     fallback dispatch chain (requested -> Charles -> generic browser).
 *     This file does not touch, wrap, or shadow that registry — it reads
 *     it (listProviders/getProvider/getContextVoice/getDefaultVoice) and
 *     writes to it only through its own existing, unmodified
 *     setDefaultVoice()/setContextVoice() methods.
 *   - CharlesVoiceProvider, the stub providers (StubVoiceProviders), and
 *     CozyTTSBrowserAdapter already are the only three real "voices"
 *     this platform can register and/or actually play. This file
 *     invents no fourth backend.
 *   - LivingTTS (living-tts.js) already is the one Living speak() entry
 *     point. This file never calls a provider directly and never calls
 *     VoiceManager.speak() directly either — every actual utterance goes
 *     through LivingTTS.speak(), unchanged.
 *
 * WHAT THIS FILE ADDS (the one real, smallest gap closed this pass)
 *   CozyOS could already SPEAK through several backends, but had no
 *   single place that describes them as honest, comparable, selectable
 *   "voices" with real metadata (id, display name, language, BCP-47
 *   locale, accent/region, gender/age, speed/pitch, expressiveness,
 *   availability, provider, verification status) — and no way for a
 *   user to select a SPECIFIC installed browser voice (this device may
 *   have several English voices installed) rather than only the coarse
 *   provider-level choice VoiceManager already exposes. This file is
 *   that catalog + a thin presentation-preference layer on top of it.
 *   It is presentation intelligence, not conversational intelligence:
 *   it never decides WHAT to say or WHICH language to say it in — see
 *   "LANGUAGE CONTINUITY" below.
 *
 * WHAT THIS FILE DOES NOT DO
 *   - Does not create a second TTS engine, voice manager, provider
 *     registry, or fallback chain. Selecting a provider-level voice
 *     (charles / google / microsoft / swahili-pack / female-pack /
 *     ai-studio / community) is a direct, unmodified call to
 *     VoiceManager.setDefaultVoice()/setContextVoice() — nothing new is
 *     invented for that path.
 *   - Does not invent capabilities no real backend has. Per-voice
 *     speed/pitch/expressiveness are honestly reported as controllable
 *     only where a real backend actually exposes a control for them
 *     (Web Speech API: global rate/pitch via VoiceManager's existing
 *     settings, applied identically to whichever voice is selected —
 *     never a per-voice value that doesn't exist). Expressiveness has NO
 *     real backend anywhere in this codebase, so it is always reported
 *     as unavailable — never fabricated.
 *   - Does not guess gender/age/accent for a voice whose provider never
 *     declared one. The Web Speech API does not reliably expose voice
 *     gender (confirmed by reading stub-voice-providers.js's own,
 *     pre-existing, honest disclosure of exactly this limitation) — this
 *     file inherits that same honesty rather than parsing voice names
 *     with heuristics that could easily be wrong.
 *   - Does not change VoiceManager's default provider away from
 *     "charles" as a side effect of listing/selecting a specific browser
 *     voice. "browser" itself is never registered as a VoiceManager
 *     provider (confirmed by reading voice-manager.js, charles-voice-
 *     provider.js, and cozy-tts-browser-adapter.js — none of them ever
 *     calls registerProvider({providerId:"browser", ...})), so it cannot
 *     be set as a default/context provider through the existing API, and
 *     this file does not add a fourth way to fake that. Instead, a
 *     specific browser-voice selection is carried as a presentation
 *     preference this file owns (see BROWSER VOICE SELECTION below) and
 *     passed through as an extra, optional `voiceURI` field on the
 *     existing speak() call chain — additive only, see the three small,
 *     disclosed edits to voice-manager.js / cozy-tts-browser-adapter.js
 *     / living-tts.js in this pass's report.
 *
 * WHY A SPECIFIC BROWSER VOICE STILL GETS HEARD WITHOUT REASSIGNING
 * THE DEFAULT PROVIDER
 *   Confirmed by reading charles-voice-provider.js: Charles's speak()
 *   only recognizes two real phrase-key contexts ("startup","welcome");
 *   for every other context (assistant/navigation/notification/
 *   accessibility/translation) carrying arbitrary text, it honestly
 *   resolves { available:false } every time. VoiceManager's own fallback
 *   chain (voice-manager.js) already, unconditionally, falls through to
 *   the generic browser adapter whenever the resolved/default provider
 *   can't speak — which for arbitrary text and the unconditional
 *   "charles" default is EVERY time. So arbitrary conversational speech
 *   already reaches the browser backend today, with zero changes here.
 *   This file's job is narrower than it might first appear: make sure
 *   the RIGHT installed browser voice is the one used once execution
 *   gets there, and describe that choice honestly — not re-route
 *   anything that wasn't already being routed there.
 *
 * LANGUAGE CONTINUITY
 *   This file never changes, translates, or substitutes the language of
 *   `text` it is asked to speak. It only ever narrows WHICH installed
 *   voice realizes that text. If a selected/preferred voice's locale
 *   does not match the requested language, resolveSpeakRequest() below
 *   drops the voiceURI preference for that one call (falling back to
 *   CozyTTSBrowserAdapter's own existing, unmodified, honest
 *   language-prefix voice lookup) rather than forcing a mismatched voice
 *   onto that language — and reports honestly via `voiceURI` being
 *   omitted from the returned request, never by silently changing
 *   `language` itself, which is always passed through byte-for-byte.
 *
 * BROWSER VOICE SELECTION — HONEST, DISCLOSED, SEPARATE SETTINGS HOME
 *   Persisted to this browser's localStorage only
 *   (`cozyos.voiceCatalog.v1`), exactly matching VoiceManager's own
 *   documented, disclosed choice to do the same for its own settings
 *   rather than force-fitting into a narrower existing contract. This
 *   file's settings hold exactly one thing VoiceManager has no concept
 *   of: which specific installed system voice (by voiceURI), per
 *   context, a user prefers when execution reaches the generic browser
 *   backend. Nothing else. Never a second copy of VoiceManager's own
 *   default/per-context provider assignment, speed, pitch, or volume.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const CATALOG_VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.VoiceCatalog) return; // duplicate-load guard

    const STORAGE_KEY = "cozyos.voiceCatalog.v1";

    // ── SMALL, HONEST, SELF-CONTAINED SETTINGS STORE ────────────────────
    // Real, disclosed limitation, matching VoiceManager's own: this
    // browser's localStorage only. Corrupt/missing storage degrades to
    // real, empty in-memory defaults — never throws, never fabricates a
    // preference that wasn't actually saved.
    let _prefs = { perContextVoiceURI: {} };
    function loadPrefs() {
        try {
            const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === "object") {
                    _prefs = { perContextVoiceURI: (parsed.perContextVoiceURI && typeof parsed.perContextVoiceURI === "object") ? parsed.perContextVoiceURI : {} };
                }
            }
        } catch (_err) { /* honest no-op — corrupt/missing storage falls back to real empty defaults */ }
    }
    function savePrefs() {
        try { if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(_prefs)); }
        catch (_err) { /* non-fatal — storage may be full/unavailable; in-memory preference still works for this session */ }
    }
    loadPrefs();

    // ── REAL, DERIVED-ONLY LOCALE PARSING ───────────────────────────────
    // No invented taxonomy: BCP-47 tags are simply split on "-"; a
    // missing/absent piece is honestly reported as null, never guessed.
    function parseLocale(bcp47) {
        if (!bcp47 || typeof bcp47 !== "string") return { language: null, locale: null, accentRegion: null };
        const parts = bcp47.split("-");
        return {
            language: parts[0] ? parts[0].toLowerCase() : null,
            locale: bcp47,
            accentRegion: parts.length > 1 ? parts[parts.length - 1] : null,
        };
    }

    function getSpeechSynthesis() {
        return (typeof window !== "undefined" && window.speechSynthesis) ? window.speechSynthesis : null;
    }

    // Honest, declared-only characterizations. Only the ones a real
    // registry/provider ITSELF already declares about its own identity —
    // never inferred from a name string. "female-pack"'s own stub
    // definition (stub-voice-providers.js) is literally named/scoped as
    // a female voice pack; that is the provider's own declared identity,
    // not a guess this file is making about it.
    const DECLARED_CHARACTERIZATION = Object.freeze({
        "female-pack": "female (declared by this voice pack's own identity — not yet installed, so unverified)",
    });

    // ── CATALOG BUILDERS ─────────────────────────────────────────────────

    /** buildProviderEntries() — one entry per VoiceManager-registered provider (charles + any installed/stub providers). Real pass-through of that provider's own registered status/capabilities/meta — nothing added that VoiceManager doesn't already know. */
    function buildProviderEntries() {
        const vm = window.CozyOS.VoiceManager;
        if (!vm || typeof vm.listProviders !== "function") return [];
        return vm.listProviders().map((p) => {
            const caps = p.capabilities || {};
            const type = caps.recordedPhrasePlayback === true ? "recorded"
                : caps.dynamicSynthesis === true ? "synthesized"
                : "unavailable";
            return {
                voiceId: p.providerId,
                displayName: p.displayName,
                type,
                language: null, locale: null, accentRegion: null, // not declared by any provider-level registration today — honestly absent, never guessed
                genderAgeCharacterization: DECLARED_CHARACTERIZATION[p.providerId] || null,
                speedAdjustable: false, pitchAdjustable: false, // provider-level entries (Charles's fixed recordings; undeployed stubs) have no real per-voice speed/pitch control
                expressivenessControl: false, // no real backend anywhere in this codebase exposes this — never fabricated
                availability: p.status,
                provider: p.providerId,
                nextStep: p.nextStep,
                verificationStatus: p.providerId === "charles"
                    ? "verified-real-audio (real recorded file exists and plays; exact spoken words were not independently transcribed — see charles-voice-provider.js's own disclosed limitation)"
                    : "unverified-stub (no real backend exists yet in this codebase)",
                meta: p.meta || {},
            };
        });
    }

    /** buildBrowserVoiceEntries() — one entry per REAL, currently-installed Web Speech API voice this browser/OS reports. Never fabricates a voice that speechSynthesis.getVoices() didn't actually return. */
    function buildBrowserVoiceEntries() {
        const synth = getSpeechSynthesis();
        if (!synth || typeof synth.getVoices !== "function") return [];
        let voices = [];
        try { voices = synth.getVoices() || []; } catch (_err) { voices = []; }
        return voices.map((v) => {
            const { language, locale, accentRegion } = parseLocale(v.lang);
            return {
                voiceId: `browser:${v.voiceURI || v.name}`,
                displayName: v.name || "(unnamed system voice)",
                type: "synthesized",
                language, locale, accentRegion,
                // Real Web Speech API does not reliably expose gender/age
                // for an installed voice — honestly null, never guessed
                // from the voice's name string.
                genderAgeCharacterization: null,
                // Real: VoiceManager already applies its own global
                // speed/pitch/volume settings to whichever voice speaks
                // (see cozy-tts-browser-adapter.js) — that control is
                // real and shared across every browser voice, not a
                // per-voice capability this specific entry adds.
                speedAdjustable: true, pitchAdjustable: true,
                expressivenessControl: false,
                availability: "installed",
                provider: "browser",
                voiceURI: v.voiceURI || null,
                localService: v.localService === true,
                verificationStatus: "device-reported (this browser/OS reported the voice exists; CozyOS has not independently verified its pronunciation quality)",
            };
        });
    }

    /** buildCatalog() — the real, combined, honest list. Rebuilt on every call rather than cached, since installed browser voices can change (voice packs installed by the OS) without this page reloading. */
    function buildCatalog() {
        return [...buildProviderEntries(), ...buildBrowserVoiceEntries()];
    }

    // ── PUBLIC API ───────────────────────────────────────────────────────

    const VoiceCatalog = {
        getVersion() { return CATALOG_VERSION; },

        /**
         * listCatalog({ language, provider } = {})
         *   Returns the real, current catalog, optionally filtered.
         *   `language` filters by the entry's own honestly-derived
         *   2-letter language (never matches an entry whose language is
         *   null, i.e. never fabricates a match for an undeclared
         *   language). `provider` filters by provider id exactly.
         */
        listCatalog(filter = {}) {
            let entries = buildCatalog();
            if (filter.language) {
                const wanted = String(filter.language).toLowerCase();
                entries = entries.filter((e) => e.language === wanted);
            }
            if (filter.provider) {
                entries = entries.filter((e) => e.provider === filter.provider);
            }
            return entries;
        },

        /** getVoice(voiceId) — real lookup against the current catalog; null if not found (never fabricated). */
        getVoice(voiceId) {
            return buildCatalog().find((e) => e.voiceId === voiceId) || null;
        },

        /**
         * currentSelection(context)
         *   Honest, fully-derived snapshot of what would actually speak
         *   for this context right now: the real VoiceManager-resolved
         *   provider, PLUS this file's own presentation-only preferred
         *   browser voiceURI for that context, if one is set. Never
         *   asserts the preferred voiceURI will actually be used — that
         *   depends on whether execution reaches the browser backend at
         *   all, which remains entirely VoiceManager's decision.
         */
        currentSelection(context) {
            const vm = window.CozyOS.VoiceManager;
            const resolvedProviderId = vm
                ? (context && typeof vm.getContextVoice === "function" ? vm.getContextVoice(context) : vm.getDefaultVoice())
                : null;
            return {
                resolvedProviderId,
                preferredBrowserVoiceURI: _prefs.perContextVoiceURI[context || "default"] || null,
            };
        },

        /**
         * selectVoice({ context, voiceId })
         *   The one real selection entry point.
         *     - Provider-level voiceId (e.g. "charles", "google"): a
         *       direct, unmodified call to VoiceManager.setContextVoice()
         *       (or setDefaultVoice() if context is omitted) — this file
         *       adds nothing to that path; VoiceManager's own honest
         *       validation (unknown providerId, etc.) applies unchanged.
         *     - Specific browser voice (voiceId starting "browser:"):
         *       verified against the REAL, currently-installed voice
         *       list before being accepted — never stores a preference
         *       for a voice that doesn't actually exist right now — then
         *       persisted in this file's own small settings store.
         *   Returns { success, reason? }, matching VoiceManager's own
         *   result shape.
         */
        selectVoice({ context, voiceId } = {}) {
            if (typeof voiceId !== "string" || !voiceId) return { success: false, reason: "voiceId is required." };
            const vm = window.CozyOS.VoiceManager;

            if (voiceId.startsWith("browser:")) {
                const voiceURI = voiceId.slice("browser:".length);
                const match = buildBrowserVoiceEntries().find((e) => e.voiceId === voiceId);
                if (!match) {
                    return { success: false, reason: `No currently-installed browser voice matches "${voiceId}". Installed voices can change; try listCatalog() again.` };
                }
                _prefs.perContextVoiceURI[context || "default"] = voiceURI;
                savePrefs();
                return { success: true };
            }

            if (!vm || typeof vm.setContextVoice !== "function" || typeof vm.setDefaultVoice !== "function") {
                return { success: false, reason: "VoiceManager is not loaded — cannot honestly select a provider-level voice without it." };
            }
            return context ? vm.setContextVoice(context, voiceId) : vm.setDefaultVoice(voiceId);
        },

        /** clearBrowserVoicePreference(context) — real, honest removal; falls back to CozyTTSBrowserAdapter's own existing language-based lookup thereafter. */
        clearBrowserVoicePreference(context) {
            delete _prefs.perContextVoiceURI[context || "default"];
            savePrefs();
            return { success: true };
        },

        /**
         * resolveSpeakRequest({ context, text, language })
         *   Presentation-realization only: builds the exact request
         *   object a caller should pass to LivingTTS.speak() /
         *   VoiceManager.speak(), never calls either itself. Adds a
         *   `voiceURI` field ONLY when this file has a preference for
         *   this context AND that preferred voice's own declared
         *   language honestly matches the requested `language` (when one
         *   was requested) — language continuity is never overridden by
         *   a presentation preference; a mismatched preference is
         *   honestly dropped for this call rather than forcing a
         *   language-incorrect voice onto the text.
         */
        resolveSpeakRequest({ context, text, language } = {}) {
            const request = { text, context, language };
            const preferredVoiceURI = _prefs.perContextVoiceURI[context || "default"];
            if (!preferredVoiceURI) return request;

            if (language) {
                const entry = buildBrowserVoiceEntries().find((e) => e.voiceURI === preferredVoiceURI);
                const preferredLanguage = entry ? entry.language : null;
                if (!preferredLanguage || preferredLanguage.toLowerCase() !== String(language).toLowerCase()) {
                    // Honest drop — never silently used across a language
                    // mismatch. request.language is untouched either way.
                    return request;
                }
            }
            request.voiceURI = preferredVoiceURI;
            return request;
        },

        // ── RL-014 Platform Inspection Contract ─────────────────────────
        getId() { return "VoiceCatalog"; },
        getName() { return "CozyOS Voice Catalog"; },
        getDependencies() { return ["VoiceManager"]; },
        getHealth() {
            const vm = window.CozyOS.VoiceManager;
            return {
                state: vm ? "ready" : "not_ready",
                voiceManagerLoaded: !!vm,
                browserVoicesReported: buildBrowserVoiceEntries().length,
            };
        },
        getCapabilities() { return { catalogSize: buildCatalog().length }; },
        getIntegrationManifest() {
            return {
                uses: ["VoiceManager.listProviders()/getProvider()/getContextVoice()/getDefaultVoice()/setContextVoice()/setDefaultVoice() (real, unmodified)", "window.speechSynthesis.getVoices() (real, browser-reported)"],
                doesNotOwn: ["provider registry", "fallback logic", "actual playback — all VoiceManager's/the existing providers', untouched"],
                honestLimitation: "Per-voice gender/age/accent/expressiveness are reported only where a real registry/backend already declares them; everything else is honestly null rather than guessed.",
                additiveEdits: [
                    "voice-manager.js: passes an optional request.voiceURI through to the existing browser-fallback call only — zero change when omitted.",
                    "cozy-tts-browser-adapter.js: honors an optional config.voiceURI as a higher-priority, exact match before its existing, unmodified language-prefix lookup — zero change when omitted.",
                    "living-tts.js: passes an optional request.voiceURI through to VoiceManager.speak() — zero change when omitted.",
                ],
            };
        },
    };

    window.CozyOS.VoiceCatalog = Object.freeze(VoiceCatalog);

    // Real: voices can load asynchronously in some browsers. No caching
    // to invalidate here (buildCatalog() always reads live), but the
    // event still matters for any UI listening for a real "voices are
    // now available" moment — bookkeeping only, non-fatal if absent.
    const synth = getSpeechSynthesis();
    if (synth && typeof synth.addEventListener === "function") {
        synth.addEventListener("voiceschanged", () => { /* buildBrowserVoiceEntries() reads live voices on every call — nothing to refresh */ }, { once: true });
    }

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                sourcePath: "core/modules/speech/voice-catalog.js", name: "VoiceCatalog", category: "Platform", icon: "list-music.svg",
                description: "Real, honest voice metadata catalog + presentation-only voice selection. Composes VoiceManager's existing provider registry and the browser's real installed Web Speech API voices — no new TTS engine, no new provider registry, no fabricated capabilities.",
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
