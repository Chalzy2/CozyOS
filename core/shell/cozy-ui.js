/**
// core/ui/cozy-ui.js
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

        if (!IdentityEngine.canAccessApplication(userId, moduleName)) {
            Live.publish("error", { module: moduleName, reason: "permission-denied" });
            Toast.show("Access Denied", { type: 'error' });
            return;
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
            if (app.load) await app.load();

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
    }
};
