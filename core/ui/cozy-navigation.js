/**
 * CozyOS Navigation Dispatcher
 * Dispatches shell navigation to the Lifecycle Manager.
 */

document.addEventListener("DOMContentLoaded", () => {

    document.addEventListener("click", (event) => {

        const button = event.target.closest("[data-module]");
        if (!button) return;

        event.preventDefault();

        const moduleName = button.dataset.module;

        if (!moduleName) {
            console.warn("[CozyOS] Navigation item missing data-module.");
            return;
        }

        if (!window.CozyOS?.UI?.loadModule) {
            console.error("[CozyOS] Lifecycle Manager unavailable.");
            return;
        }

        console.info(`[CozyOS] Opening module: ${moduleName}`);

        window.CozyOS.UI.loadModule(moduleName);

    });

});
