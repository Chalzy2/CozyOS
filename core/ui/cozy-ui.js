/**
 * CozyOS Enterprise Design System — Bootstrap & Main Controller Entry
 * File Reference: core/ui/cozy-ui.js
 * (Maintains strict Zero Logic execution boundaries)
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    class CozyUIBootstrap {
        constructor() {
            this.version = "3.0.0-BASELINE";
            console.log(`[CozyOS Design System] Initialized baseline framework version: ${this.version}`);
        }

        switchTheme(appName) {
            document.documentElement.setAttribute("data-cozy-app", appName);
            this.triggerToast(`Theme profile switched to: ${appName.toUpperCase()}`);
        }

        triggerToast(message) {
            const container = document.getElementById("cozy-toast-container") || this.#createToastContainer();
            const toast = document.createElement("div");
            toast.style.padding = "10px 20px";
            toast.style.background = "var(--cozy-glass-bg)";
            toast.style.border = "var(--cozy-glass-border)";
            toast.style.borderRadius = "var(--cozy-radius-sm)";
            toast.style.color = "#fff";
            toast.style.fontSize = "12px";
            toast.innerText = message;
            
            container.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }

        #createToastContainer() {
            const el = document.createElement("div");
            el.id = "cozy-toast-container";
            el.style.position = "fixed";
            el.style.bottom = "20px";
            el.style.right = "20px";
            el.style.display = "flex";
            el.style.flexDirection = "column";
            el.style.gap = "8px";
            el.style.zIndex = "10000";
            document.body.appendChild(el);
            return el;
        }
    }

    window.CozyOS.UI = new CozyUIBootstrap();
})();
