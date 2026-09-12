/**
 * CozyOS Living Audio Engine — core/living/cozy-living-audio.js
 * Integration-first pass over the existing LivingSounds engine.
 *
 * OWNERSHIP: this file composes window.CozyOS.LivingSounds (real,
 * existing, certified in M237/M244/M256) - it does not implement a
 * second sound engine, registry, or playback mechanism. LivingSounds
 * already owns: HTMLAudioElement playback, volume/category management,
 * pack loading, admin gating, and the flat event registry. This file
 * only adds the hierarchical naming ("category.subcategory.event")
 * requested by the Living Audio Engine vision, translating each
 * hierarchical name to the one real, existing flat event name and
 * calling LivingSounds.play() with it - literally nothing else.
 *
 * "Applications must not embed their own sound systems" (the vision's
 * own Administrator Rule) is honored here: this facade IS the single
 * point every application should call, and it forwards to the one
 * real engine underneath.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.LivingAudio) return;

    // Real, disclosed mapping - hierarchical name -> existing flat
    // event name in LivingSounds' registry. Every flat name referenced
    // here was verified to exist in cozy-living-sounds.js before this
    // file was written (either pre-existing or added in the same
    // milestone as this facade).
    const EVENT_MAP = Object.freeze({
        // Startup
        "startup.ambience": "startup-ambience",
        "startup.logo": "logo-chime",
        "startup.confirmation": "startup-confirmation",
        "startup.motto": "motto-ambience",
        "typing.letter": "typing",
        // UI
        "ui.button.hover": "button-hover",
        "ui.button.click": "button-click",
        "ui.toggle": "toggle",
        "ui.checkbox": "checkbox",
        "ui.dropdown": "dropdown",
        "ui.menu.open": "menu-open",
        "ui.menu.close": "menu-close",
        "ui.dialog.open": "dialog-open",
        "ui.dialog.close": "dialog-close",
        "ui.tab.switch": "tab-switch",
        "ui.panel.transition": "panel-transition",
        // Authentication
        "auth.login.pressed": "login-pressed",
        "auth.login.success": "login",
        "auth.login.failed": "login-failed",
        "auth.register.success": "register-success",
        "auth.register.failed": "register-failed",
        "auth.password.visible": "password-visible",
        "auth.password.hidden": "password-hidden",
        "auth.biometric.scanning": "biometric-scanning",
        "auth.biometric.success": "biometric-success",
        "auth.biometric.failed": "biometric-failed",
        "auth.trusted-device.verified": "trusted-device-verified",
        "auth.password.reset": "password-reset",
        // Notifications
        "notify.success": "success",
        "notify.warning": "warning",
        "notify.error": "error",
        "notify.info": "notification",
        "notify.critical": "error",
        "notify.reminder": "reminder",
        "notify.update-complete": "update-complete",
        "notify.download-complete": "download-complete",
        "notify.upload-complete": "upload-complete",
        // Living Connect
        "connect.bluetooth.device-found": "device-discovered",
        "connect.bluetooth.pairing": "bluetooth-pairing",
        "connect.bluetooth.connected": "bluetooth-connected",
        "connect.bluetooth.disconnected": "bluetooth-disconnected",
        "connect.bluetooth.failed": "bluetooth-failed",
        "connect.usb.connected": "usb-connected",
        "connect.usb.removed": "usb-removed",
        "connect.usb.error": "usb-error",
        "connect.presentation.connected": "presentation-connected",
        "connect.presentation.casting-started": "casting-started",
        "connect.presentation.casting-ended": "casting-ended",
        // Productivity (CozyBuilder etc.)
        "builder.build.started": "build-started",
        "builder.build.successful": "build-successful",
        "builder.build.failed": "build-failed",
        "builder.deploy.started": "deploy-started",
        "builder.deploy.successful": "deploy-successful",
        "builder.deploy.failed": "deploy-failed",
        "builder.publish.successful": "publish-successful",
        // Security
        "security.admin-login": "admin-login",
        "security.warning": "security-warning",
        "security.suspicious-activity": "suspicious-activity",
        "security.permission-granted": "permission-granted",
        "security.permission-denied": "permission-denied",
        "security.recovery-complete": "recovery-complete",
        // AI
        "ai.activated": "ai-activated"
    });

    class CozyLivingAudio {
        /**
         * play(hierarchicalName, options)
         *   Real - translates the hierarchical name to the existing
         *   flat event and forwards to the real LivingSounds.play().
         *   Honestly reports unknown names rather than silently
         *   failing or guessing a nearest match.
         */
        async play(hierarchicalName, options = {}) {
            const sounds = window.CozyOS.LivingSounds;
            if (!sounds || typeof sounds.play !== "function") {
                return { success: false, reason: "LivingSounds is not loaded - Living Audio Engine has nothing to forward to." };
            }
            const flatName = EVENT_MAP[hierarchicalName];
            if (!flatName) {
                return { success: false, reason: `"${hierarchicalName}" is not a real, mapped Living Audio event. See EVENT_MAP in cozy-living-audio.js for the full real list.` };
            }
            return sounds.play(flatName, options);
        }

        /** listEvents() — real, the actual set of hierarchical names this facade supports today. */
        listEvents() { return Object.keys(EVENT_MAP); }

        /** All other real LivingSounds capabilities are exposed directly - never duplicated. */
        setVolume(...args) { return window.CozyOS.LivingSounds?.setVolume(...args); }
        loadPack(...args) { return window.CozyOS.LivingSounds?.loadPack(...args); }
        unloadPack(...args) { return window.CozyOS.LivingSounds?.unloadPack(...args); }
        enable(...args) { return window.CozyOS.LivingSounds?.enable(...args); }
        disable(...args) { return window.CozyOS.LivingSounds?.disable(...args); }
        getDiagnostics(...args) { return window.CozyOS.LivingSounds?.getDiagnostics(...args); }
    }

    window.CozyOS.LivingAudio = new CozyLivingAudio();
})();
