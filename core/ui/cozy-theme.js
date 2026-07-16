/**
 * CozyOS Enterprise Design System — Theme Engine
 * File Reference: core/ui/cozy-theme.js
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    class CozyThemeController {
        setTheme(appName) {
            document.documentElement.setAttribute("data-cozy-app", appName);
            
            if (window.CozyOS.Background) {
                window.CozyOS.Background.updateForTheme(appName);
            }
            
            if (window.CozyOS.Toast) {
                window.CozyOS.Toast.show(`Interface theme profile: ${appName.toUpperCase()}`);
            }
        }
    }

    window.CozyOS.Theme = new CozyThemeController();
})();
