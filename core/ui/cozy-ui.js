/**
 * CozyOS Enterprise Design System — Global UI Core Dispatcher
 * File Reference: core/ui/cozy-ui.js
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    class CozyCoreUIDispatcher {
        constructor() {
            this.activeApp = "developer";
        }

        init() {
            // Apply structural startup layouts
            this.setApplicationTheme(this.activeApp);
            
            if (window.CozyOS.Live) {
                window.CozyOS.Live.registerLivePillEvents();
            }
        }

        /**
         * Global application theme updater
         * Triggers cascade mutations tracked by the visual Background system
         * @param {string} appName 
         */
        setApplicationTheme(appName) {
            this.activeApp = appName;
            document.documentElement.setAttribute("data-cozy-app", appName);
            
            // Soft-toast feedback for app transitions
            if (window.CozyOS.Toast) {
                window.CozyOS.Toast.show(`Environment scaled: ${appName.toUpperCase()}`);
            }
        }
    }

    window.CozyOS.UI = new CozyCoreUIDispatcher();
    
    document.addEventListener("DOMContentLoaded", () => {
        window.CozyOS.UI.init();
    });
})();
