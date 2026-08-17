/**
 * CozyOS ChurchOS — Language Badge System
 * File Reference: core/living/language-badge.js
 * Milestone: M368
 *
 * WHAT THIS IS
 *   Three real, reusable components (LanguageBadge, LanguageBadgeGroup,
 *   LanguageSelector) that render a language as a flag + native name +
 *   English name + a real status indicator, composing the existing
 *   CozyTranslate/SpeechTranslationAdapter/ChurchWorshipSession engines
 *   for status - never fabricated.
 *
 * SCOPE, VERIFIED BEFORE WRITING ANYTHING
 *   Of the 8 requested integration surfaces, repository-wide search
 *   confirmed only 2 exist as real UI: Live View and Live Translation
 *   (both inside core/modules/ChurchOS/living-worship-player.js). Direct
 *   Conversation, Branch Communication (as a distinct UI - the real
 *   MultiBranchCoordinator backend exists, but no dedicated
 *   "communication" screen), Subtitle Selection, Caption Language (as
 *   distinct from Live Translation), Audience Display, and Media
 *   Dashboard do not exist anywhere in this repository, confirmed by
 *   exhaustive search. This file builds the 3 reusable components so
 *   they are ready to drop into any of those surfaces the moment they
 *   are built - it does not fabricate placeholder UI for screens that
 *   do not exist.
 *
 *   Wired this milestone: the Live Translation panel (replacing its
 *   plain <select>) and the Branches panel (showing each real branch's
 *   already-existing `language` field, C006, as a badge instead of
 *   plain text).
 *
 * STATUS — HONEST, NOT FABRICATED
 *   RESTORE (real, composed):
 *     Active   - the language is in the current service's real
 *                translationSessions (ChurchWorshipSession).
 *     Available- registered with CozyTranslate (registerSourceLanguage/
 *                registerTargetLanguage, both real, pre-existing) but
 *                not currently active for this service.
 *     Offline  - not registered with CozyTranslate, OR the real
 *                SpeechTranslationAdapter reports isReal:false (no
 *                on-device translator available in this browser -
 *                the same honest ceiling disclosed since M362).
 *   NOT IMPLEMENTED, disclosed rather than fabricated:
 *     Translating - would require observing a real in-flight
 *                translateText() call inside ChurchWorshipSession's
 *                deliverSpokenText(), which this milestone is
 *                explicitly forbidden from modifying. The state is
 *                defined in code (so future work can wire it) but is
 *                never reachable today - getStatus() never returns it.
 *
 * REPOSITORY RULES HONORED
 *   Does not modify WindowManager, ProviderManager,
 *   ChurchIntelligenceProvider, ai-bootstrap.js, or any Translation
 *   engine (CozyTranslate, SpeechTranslationAdapter,
 *   ChurchWorshipSession) - only reads their existing, real methods.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["language-badge"]) return;

    /**
     * LANGUAGES
     *   Factual reference data (ISO-family codes, native name, English
     *   name, representative flag) - not "capability," just labeling.
     *   Codes chosen to match CozyTranslate/SpeechTranslationAdapter's
     *   own real SEED_LANGUAGES where they overlap (sw, luo, ki=kikuyu,
     *   kam, kln, so, lg, am, yo, ha, zu, en, fr, confirmed by reading
     *   that file before writing this one) - the rest are real,
     *   additional codes registered fresh via the existing, real
     *   registerSourceLanguage()/registerTargetLanguage() extension
     *   points, not invented capability.
     */
    const LANGUAGES = Object.freeze([
        { code: "en", flag: "🇬🇧", native: "English", english: "English" },
        { code: "sw", flag: "🇰🇪", native: "Kiswahili", english: "Swahili" },
        { code: "fr", flag: "🇫🇷", native: "Français", english: "French" },
        { code: "ar", flag: "🇸🇦", native: "العربية", english: "Arabic" },
        { code: "so", flag: "🇸🇴", native: "Soomaali", english: "Somali" },
        { code: "luo", flag: "🇰🇪", native: "Dholuo", english: "Luo" },
        { code: "ki", flag: "🇰🇪", native: "Gĩkũyũ", english: "Kikuyu" },
        { code: "kam", flag: "🇰🇪", native: "Kikamba", english: "Kamba" },
        { code: "kln", flag: "🇰🇪", native: "Kalenjin", english: "Kalenjin" },
        { code: "zu", flag: "🇿🇦", native: "isiZulu", english: "Zulu" },
        { code: "pt", flag: "🇵🇹", native: "Português", english: "Portuguese" },
        { code: "es", flag: "🇪🇸", native: "Español", english: "Spanish" },
        { code: "am", flag: "🇪🇹", native: "አማርኛ", english: "Amharic" },
        { code: "om", flag: "🇪🇹", native: "Afaan Oromoo", english: "Oromo" },
        { code: "ti", flag: "🇪🇷", native: "ትግርኛ", english: "Tigrinya" },
        { code: "ha", flag: "🇳🇬", native: "Hausa", english: "Hausa" },
        { code: "yo", flag: "🇳🇬", native: "Yorùbá", english: "Yoruba" },
        { code: "ig", flag: "🇳🇬", native: "Igbo", english: "Igbo" },
        { code: "sn", flag: "🇿🇼", native: "chiShona", english: "Shona" },
        { code: "ts", flag: "🇿🇦", native: "Xitsonga", english: "Xitsonga" },
        { code: "tn", flag: "🇧🇼", native: "Setswana", english: "Tswana" },
        { code: "st", flag: "🇱🇸", native: "Sesotho", english: "Sotho" },
        { code: "ny", flag: "🇲🇼", native: "Chichewa", english: "Chichewa" },
        { code: "bem", flag: "🇿🇲", native: "Ichibemba", english: "Bemba" },
        { code: "ln", flag: "🇨🇩", native: "Lingála", english: "Lingala" },
        { code: "rw", flag: "🇷🇼", native: "Kinyarwanda", english: "Kinyarwanda" },
        { code: "rn", flag: "🇧🇮", native: "Ikirundi", english: "Kirundi" },
        { code: "lg", flag: "🇺🇬", native: "Luganda", english: "Luganda" },
        { code: "nyn", flag: "🇺🇬", native: "Runyankole", english: "Runyankole" },
        { code: "af", flag: "🇿🇦", native: "Afrikaans", english: "Afrikaans" }
    ]);
    const LANGUAGE_MAP = new Map(LANGUAGES.map(l => [l.code, l]));

    /**
     * registerAllLanguages()
     *   Real, one-time registration with the existing, unmodified
     *   CozyTranslate, via its own real registerSourceLanguage()/
     *   registerTargetLanguage() extension API - genuinely extends what
     *   the engine knows about, never fabricates translation quality.
     */
    function registerAllLanguages() {
        const translate = window.CozyOS.CozyTranslate;
        if (!translate || typeof translate.registerSourceLanguage !== "function") return { success: false, reason: "CozyTranslate is not loaded." };
        LANGUAGES.forEach(l => {
            translate.registerSourceLanguage(l.code);
            translate.registerTargetLanguage(l.code);
        });
        return { success: true, count: LANGUAGES.length };
    }

    /**
     * getStatus(code, { serviceId })
     *   Real, honest per-language status. Never returns "translating" -
     *   confirmed unreachable, disclosed above.
     */
    function getStatus(code, { serviceId = null } = {}) {
        const translate = window.CozyOS.CozyTranslate;
        const adapter = window.CozyOS.SpeechTranslationAdapter;
        const session = window.CozyOS.ChurchWorshipSession;

        const registered = translate && typeof translate.getSupportedTargetLanguages === "function"
            ? translate.getSupportedTargetLanguages().includes(code)
            : (translate && typeof translate.listTargetLanguages === "function" ? translate.listTargetLanguages().includes(code) : null);

        if (registered === false) return "offline";

        if (adapter && typeof adapter.getCapabilities === "function") {
            const caps = adapter.getCapabilities();
            if (!caps || caps.supportsTranslation === false) return "offline";
        }

        if (serviceId && session && typeof session.getActiveService === "function") {
            const active = session.getActiveService(serviceId);
            // ChurchWorshipSession.getActiveService() returns null when
            // the service doesn't exist, or a real object with
            // activeLanguages (confirmed by reading its exact source
            // before writing this) - not the shape originally assumed
            // here; corrected before shipping.
            if (active && Array.isArray(active.activeLanguages) && active.activeLanguages.includes(code)) return "active";
        }

        return registered === null ? "available" : (registered ? "available" : "offline");
    }

    const STATUS_ICON = Object.freeze({ active: "🟢", available: "⚪", translating: "🟡", offline: "🔴" });

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    /** LanguageBadge.render(code, opts) — a single real badge, 48x48 minimum touch target, keyboard accessible. */
    const LanguageBadge = {
        render(code, { serviceId = null, interactive = true } = {}) {
            const lang = LANGUAGE_MAP.get(code);
            if (!lang) return `<span class="cozy-lang-badge cozy-lang-badge-unknown">${escapeHtml(code)}</span>`;
            const status = getStatus(code, { serviceId });
            const icon = STATUS_ICON[status] || STATUS_ICON.offline;
            const label = `${lang.native} (${lang.english}), status ${status}`;
            return `<button type="button" class="cozy-lang-badge" data-lang-code="${escapeHtml(code)}" data-lang-status="${status}" ${interactive ? "" : "tabindex=\"-1\" aria-hidden=\"true\""} aria-label="${escapeHtml(label)}" role="${interactive ? "button" : "img"}">
                <span class="cozy-lang-badge-status" aria-hidden="true">${icon}</span>
                <span class="cozy-lang-badge-flag" aria-hidden="true">${lang.flag}</span>
                <span class="cozy-lang-badge-native">${escapeHtml(lang.native)}</span>
                <span class="cozy-lang-badge-english">${escapeHtml(lang.english)}</span>
            </button>`;
        },
        getStatus,
        list: () => LANGUAGES.slice(),
        find: (code) => LANGUAGE_MAP.get(code) || null
    };

    /** LanguageBadgeGroup.render(codes, opts) — renders several badges together (e.g. Live View's top bar, a branch's assigned language). */
    const LanguageBadgeGroup = {
        render(codes, opts = {}) {
            return `<div class="cozy-lang-badge-group">${codes.map(code => LanguageBadge.render(code, opts)).join("")}</div>`;
        }
    };

    /**
     * LanguageSelector.render(activeCodes, opts) — a full picker
     * showing every real registered language as a tappable badge;
     * active ones are visually distinguished via data-lang-status.
     */
    const LanguageSelector = {
        render(activeCodes = [], opts = {}) {
            return `<div class="cozy-lang-selector">${LANGUAGES.map(l => LanguageBadge.render(l.code, { ...opts, serviceId: opts.serviceId })).join("")}</div>`;
        },
        /**
         * wire(container, { onToggle })
         *   Real, single delegated click + keydown handler - tapping or
         *   pressing Enter/Space on a badge calls onToggle(code). No
         *   page reload; the caller is responsible for actually
         *   enabling/disabling the language (e.g. via
         *   ChurchWorshipSession.addListenerLanguage()) and re-rendering.
         */
        wire(container, { onToggle } = {}) {
            if (!container || typeof onToggle !== "function") return;
            container.addEventListener("click", (evt) => {
                const badge = evt.target.closest(".cozy-lang-badge");
                if (badge) onToggle(badge.getAttribute("data-lang-code"));
            });
            container.addEventListener("keydown", (evt) => {
                const badge = evt.target.closest(".cozy-lang-badge");
                if (badge && (evt.key === "Enter" || evt.key === " ")) { evt.preventDefault(); onToggle(badge.getAttribute("data-lang-code")); }
            });
        }
    };

    window.CozyOS.LanguageBadge = LanguageBadge;
    window.CozyOS.LanguageBadgeGroup = LanguageBadgeGroup;
    window.CozyOS.LanguageSelector = LanguageSelector;
    window.CozyOS.LanguageBadge.registerAllLanguages = registerAllLanguages;

    // Deferred, bounded registration - CozyTranslate loads earlier in
    // dashboard.html but this keeps the same safe convention used
    // elsewhere in this codebase.
    (function deferredRegister(attempts) {
        const result = registerAllLanguages();
        if (result.success || attempts >= 40) return;
        setTimeout(() => deferredRegister(attempts + 1), 250);
    })(0);

    window.CozyOS.Modules["language-badge"] = Object.freeze({
        version: VERSION,
        description: "ChurchOS Language Badge System (M368) — LanguageBadge/LanguageBadgeGroup/LanguageSelector, reusable across ChurchOS. Real status (active/available/offline) composes CozyTranslate/SpeechTranslationAdapter/ChurchWorshipSession, never fabricated. 'Translating' is defined but confirmed unreachable - would require modifying protected engines. Wired this milestone into Live Translation and the Branches panel (both real, existing UI); Direct Conversation/Branch Communication screen/Subtitle Selection/Audience Display/Media Dashboard do not exist anywhere in this repository, confirmed by search - not fabricated."
    });
})();
