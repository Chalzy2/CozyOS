/**
 * CozyOS Enterprise Design System — Bootstrap Orchestrator
 * File Reference: core/ui/cozy-ui.js
 * (Static registration only — no dynamic loading to prevent collisions)
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    class CozyUIBootstrap {
        constructor() {
            this.version = "3.1.1-STATIC";
            console.log(`[CozyOS UI] Bootstrap loaded. Version: ${this.version}`);
        }

        switchTheme(appName) {
            if (window.CozyOS.Theme) {
                window.CozyOS.Theme.setTheme(appName);
            } else {
                document.documentElement.setAttribute("data-cozy-app", appName);
            }
        }

        triggerToast(message) {
            if (window.CozyOS.Toast) {
                window.CozyOS.Toast.show(message);
            } else {
                console.warn("[CozyOS UI] Fallback: ", message);
            }
        }

        refreshLiveComponents() {
            if (window.CozyOS.Live) {
                window.CozyOS.Live.registerLivePillEvents();
            }
        }
    }

    // Safely assign without overwriting other modules
    window.CozyOS.UI = new CozyUIBootstrap();
})();
