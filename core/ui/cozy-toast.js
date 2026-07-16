/**
 * CozyOS Enterprise Design System — Toast System Notification Queue
 * File Reference: core/ui/cozy-toast.js
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    class CozyToastEngine {
        #container = null;

        show(message) {
            const container = this.#getOrCreateContainer();
            const toast = document.createElement("div");
            
            toast.style.cssText = "padding:12px 24px;background:var(--cozy-glass-bg);backdrop-filter:var(--cozy-glass-blur);-webkit-backdrop-filter:var(--cozy-glass-blur);border:var(--cozy-glass-border);border-radius:var(--cozy-radius-sm);color:#fff;font-size:12px;box-shadow:var(--cozy-glass-shadow);transition:opacity 0.3s ease;font-family:var(--cozy-font-sans);";
            toast.innerText = message;

            container.appendChild(toast);
            
            setTimeout(() => {
                toast.style.opacity = "0";
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        #getOrCreateContainer() {
            if (!this.#container) {
                this.#container = document.createElement("div");
                this.#container.id = "cozy-toast-container";
                this.#container.style.cssText = "position:fixed;bottom:20px;right:20px;display:flex;flex-direction:column;gap:8px;z-index:10000;";
                document.body.appendChild(this.#container);
            }
            return this.#container;
        }
    }

    window.CozyOS.Toast = new CozyToastEngine();
})();
