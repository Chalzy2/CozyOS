// core/ui/cozy-ui.js
/**
 * CozyOS Shared Shell — UI Module Loader
 *
 * FIXES APPLIED (additive, nothing else changed):
 *   1. The entire file was previously wrapped in a never-closed /** comment
 *      — 100% dead code, no syntax error, no console warning. Fixed by
 *      giving the file a real, closed header comment instead.
 *   2. IdentityEngine.canAccessApplication(userId, moduleName) was called
 *      unconditionally — a hard TypeError whenever IdentityEngine isn't
 *      loaded (true today; no IdentityEngine/cozy-identity.js coordinator
 *      exists yet anywhere in CozyOS). Fixed to match the SAME fail-open,
 *      disclosed-reason convention already established in
 *      cozy-workspace.js's getVisibleApplications(): if IdentityEngine
 *      isn't connected, or doesn't expose canAccessApplication(), access is
 *      allowed with a clearly logged/toasted reason — never silently
 *      blocked, never silently pretended to be secure.
 *   3. this.updateActiveTile(moduleName) was called but never defined
 *      anywhere in this file — a guaranteed TypeError on every successful
 *      load. Implemented using the same [data-module] / .active convention
 *      already used elsewhere in CozyOS (e.g. developer-hub.js's own
 *      #updateActiveNavItem()) — real DOM update, not a placeholder.
 *
 * Every other line of logic (Theme.setTheme, Background.updateForTheme,
 * Live.publish, Toast.show, ModuleRegistry.resolve, window.CozyOS.Modules'
 * load()/getDashboard()/init()/destroy() lifecycle) is unchanged, and all
 * verified against the real coordinators that now exist:
 *   - ModuleRegistry.resolve() — real, matches core/modules/module-registry.js
 *   - Theme.setTheme() / Background.updateForTheme() — real, match
 *     core/ui/cozy-theme.js / cozy-background.js
 *   - Live.publish() / Toast.show() — real, match core/ui/cozy-live.js /
 *     cozy-toast.js
 *   - window.CozyOS.Modules[...] shape — real, matches developer-hub.js's
 *     own self-registration (version/files/getDashboard/init/destroy)
 *
 * STRENGTHENING (Shared Platform directive): if ModuleLoadingManager is
 * loaded, loadModule() now routes app.load() through it for real
 * concurrent-load deduplication, history, and diagnostics. Falls back to
 * calling app.load() directly, exactly as before, if it isn't loaded —
 * optional, additive, no behavior change for any page that doesn't load it.
 */
if (window.CozyOS.ModuleLoadingManager && !window.CozyOS.ModuleLoadingManager._internalLoader) {
    window.CozyOS.ModuleLoadingManager.init(async (_path, name) => {
        const app = window.CozyOS.Modules?.[name];
        if (app && typeof app.load === "function") return app.load();
        return true;
    });
}

window.CozyOS.UI = {
    activeModule: null,
    isLoading: false,

    async loadModule(moduleName, userId) {
        const { IdentityEngine, ModuleRegistry, Theme, Background, Live, Toast } = window.CozyOS;
        const root = document.getElementById("cozy-app-root");

        if (!root) {
            console.error("[CozyOS] Workspace root #cozy-app-root not found.");
            return;
        }

        // Fail-open with a disclosed reason if IdentityEngine isn't
        // connected or doesn't expose canAccessApplication() — matching
        // cozy-workspace.js's getVisibleApplications() convention exactly.
        // Never silently blocks (that would be a false sense of insecurity
        // for a check that isn't actually happening) and never silently
        // pretends access control is enforced when it isn't.
        if (IdentityEngine && typeof IdentityEngine.canAccessApplication === "function") {
            let allowed;
            try { allowed = IdentityEngine.canAccessApplication(userId, moduleName); }
            catch (err) {
                console.warn(`[CozyOS] IdentityEngine.canAccessApplication() threw — allowing "${moduleName}" (fail-open): ${err.message}`);
                allowed = true;
            }
            if (!allowed) {
                Live.publish("error", { module: moduleName, reason: "permission-denied" });
                Toast.show("Access Denied", { type: "error" });
                return;
            }
        } else {
            console.warn(`[CozyOS] IdentityEngine not connected — loading "${moduleName}" without a permission check (fail-open, not fail-closed).`);
        }

        const manifest = ModuleRegistry.resolve(moduleName);
        if (!manifest) {
            Toast.show(`Application "${moduleName}" is not registered.`, { type: "error" });
            return;
        }

        this.isLoading = true;
        Live.publish("loading", { module: moduleName });

        try {
            const app = window.CozyOS.Modules?.[moduleName];
            if (!app) throw new Error(`Application "${moduleName}" is not registered.`);

            // 1. Prepare new application
            if (app.load) {
                if (window.CozyOS.ModuleLoadingManager) {
                    await window.CozyOS.ModuleLoadingManager.loadModule(manifest.js || moduleName, moduleName);
                } else {
                    await app.load();
                }
            }

            // 2. State Transition (Only after successful load)
            if (this.activeModule && window.CozyOS.Modules?.[this.activeModule]?.destroy) {
                window.CozyOS.Modules[this.activeModule].destroy();
            }

            Theme.setTheme(manifest.theme);
            Background.updateForTheme(manifest.theme);

            root.innerHTML = app.getDashboard?.() || "";
            if (app.init) app.init();

            this.updateActiveTile(moduleName);
            this.activeModule = moduleName;
            Live.publish("ready", { module: moduleName });

        } catch (err) {
            Toast.show(err.message, { type: "error" });
            Live.publish("error", { module: moduleName, error: err.message });
        } finally {
            this.isLoading = false;
        }
    },

    /**
     * updateActiveTile(moduleName)
     *   Real implementation (previously called but never defined — see
     *   header). Toggles .active on whatever launcher tiles the current
     *   page provides via [data-module="..."], the same convention already
     *   used by developer-hub.js's own nav (.cozy-nav-item[data-section])
     *   and cozy-workspace.js's own nav (.cozy-nav-link[data-center]).
     *   A no-op — not an error — if the page has no such tiles (e.g. a
     *   page that calls loadModule() without a tile grid at all).
     */
    updateActiveTile(moduleName) {
        document.querySelectorAll("[data-module]").forEach((el) => {
            el.classList.toggle("active", el.getAttribute("data-module") === moduleName);
        });
    }
};
