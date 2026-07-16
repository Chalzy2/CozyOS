/**
 * CozyOS Enterprise Design System — Dynamic Theme Engine
 * File Reference: core/ui/cozy-theme.js
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    class CozyThemeController {
        constructor() {
            this.autoDetectAndApplyTheme();
        }

        /**
         * Safely set and transition the visual profile
         */
        setTheme(appName) {
            const cleanAppName = appName.toLowerCase().trim();
            document.documentElement.setAttribute("data-cozy-app", cleanAppName);
            
            console.log(`[CozyTheme] Applied active theme profile: ${cleanAppName}`);

            // Notify sibling engines of the theme transition
            if (window.CozyOS.Background) {
                window.CozyOS.Background.updateForTheme(cleanAppName);
            }
            if (window.CozyOS.Toast) {
                window.CozyOS.Toast.show(`Interface profile: ${cleanAppName.toUpperCase()}`);
            }
        }

        /**
         * Scans the system location or parent configuration to auto-load the theme profile
         */
        autoDetectAndApplyTheme() {
            // Priority 1: Check if manual override attribute is already on the document tag
            const existingAttr = document.documentElement.getAttribute("data-cozy-app");
            if (existingAttr) {
                this.setTheme(existingAttr);
                return;
            }

            // Priority 2: Detect based on path URL structure
            const path = window.location.pathname.toLowerCase();
            let matchedTheme = "developer"; // Default fallback

            if (path.includes("/shopos") || path.includes("/shop/")) {
                matchedTheme = "shopos";
            } else if (path.includes("/quarryos") || path.includes("/quarry/")) {
                matchedTheme = "quarryos";
            } else if (path.includes("/mpesaos") || path.includes("/mpesa/")) {
                matchedTheme = "mpesaos";
            } else if (path.includes("/hospitalos") || path.includes("/hospital/")) {
                matchedTheme = "hospitalos";
            } else if (path.includes("/schoolos") || path.includes("/educationos") || path.includes("/school/")) {
                matchedTheme = "schoolos";
            }

            this.setTheme(matchedTheme);
        }
    }

    // Initialize immediately
    window.CozyOS.Theme = new CozyThemeController();
})();
