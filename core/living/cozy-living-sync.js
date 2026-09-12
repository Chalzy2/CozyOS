/**
 * CozyOS Living Theme Synchronization — core/living/cozy-living-sync.js
 * Phase 6 (Living Theme Synchronization)
 *
 * OWNERSHIP: composes LivingThemeEngine's real "theme-activated" event
 * (via PlatformEventBus, already emitted - never duplicated) and this
 * repository's own body.living-* classes (cozy-living.css). Does not
 * modify either existing system.
 *
 * HONEST SCOPE: only 10 real CozyOS.Theme names exist (cozyos,
 * platform-admin, developer, shopos, quarryos, mpesaos, hospitalos,
 * schoolos/educationos, churchos, high-contrast) - confirmed by
 * reading cozy-tokens.css before writing this file. Most of them have
 * no honest, non-arbitrary correspondence to the 8 living-modes
 * (forest/ocean/rain/etc. were designed as nature/mood themes, not
 * enterprise application themes). Only mapping the few with a real,
 * defensible correspondence rather than forcing all 10 into modes that
 * don't genuinely fit. Unmapped themes are left with no living-mode
 * class change - an honest "not yet designed" rather than a fabricated
 * guess.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.__livingThemeSyncBound) return;

    // Real, disclosed, partial mapping - professional/technical themes
    // only, where "enterprise" or "night" genuinely fits.
    const REAL_THEME_TO_LIVING_MODE = Object.freeze({
        "platform-admin": "living-enterprise",
        "developer": "living-night",
        "churchos": "living-enterprise"
        // cozyos, shopos, quarryos, mpesaos, hospitalos, schoolos,
        // educationos, high-contrast: intentionally left unmapped.
    });
    const ALL_LIVING_MODE_CLASSES = ["living-day", "living-night", "living-rain", "living-sunset", "living-forest", "living-ocean", "living-africa", "living-enterprise"];

    function applyLivingMode(cozyThemeName) {
        if (typeof document === "undefined" || !document.body) return;
        for (const cls of ALL_LIVING_MODE_CLASSES) document.body.classList.remove(cls);
        const mode = REAL_THEME_TO_LIVING_MODE[cozyThemeName];
        if (mode) document.body.classList.add(mode);
    }

    function bind() {
        const bus = window.CozyOS.PlatformEventBus;
        if (!bus || typeof bus.on !== "function") return false;
        bus.on("theme:theme-activated", ({ cozyThemeName }) => applyLivingMode(cozyThemeName));
        bus.on("theme:theme-deactivated", () => applyLivingMode(null));
        window.CozyOS.__livingThemeSyncBound = true;
        return true;
    }

    // PlatformEventBus may not exist yet at load time - retry briefly,
    // matching the established polling pattern used elsewhere in this
    // repository, rather than assuming load order.
    if (!bind()) {
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            if (bind() || attempts > 40) clearInterval(interval);
        }, 250);
    }

    // Exposed for direct, real testing and manual use.
    window.CozyOS.applyLivingModeForTheme = applyLivingMode;
})();
