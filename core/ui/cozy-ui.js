/**
 * CozyOS Enterprise UI Framework — Final Frozen Lifecycle Manager
 */
window.CozyOS = window.CozyOS || {};
window.CozyOS.UI = {
    moduleCache: new Map(),
    loadedAssets: new Set(),
    activeModule: null,
    isLoading: false,

    async loadModule(moduleName) {
        if (!/^[a-z0-9-]+$/i.test(moduleName)) throw new Error("Invalid module name.");
        if (this.isLoading || this.activeModule === moduleName) return;
        
        const root = document.getElementById("cozy-app-root");
        if (!root) throw new Error("Shell workspace #cozy-app-root not found.");

        this.isLoading = true;
        console.info(`[CozyOS] Loading module: ${moduleName}`);

        try {
            root.innerHTML = `<div class="cozy-loading">Initializing ${moduleName}...</div>`;

            if (this.activeModule && window.CozyOS.Modules?.[this.activeModule]?.destroy) {
                try {
                    window.CozyOS.Modules[this.activeModule].destroy();
                } catch (err) {
                    console.error(`[CozyOS] Failed to destroy module '${this.activeModule}'`, err);
                }
            }

            const modulePath = `./core/modules/${moduleName}/`;
            const htmlKey = `${moduleName}_html`;

            // 1. Asset: CSS (Duplicate Prevention)
            const cssKey = `${modulePath}${moduleName}.css`;
            const existingCss = document.querySelector(`link[href="${cssKey}"]`);
            if (!existingCss && !this.loadedAssets.has(cssKey)) {
                const link = document.createElement("link");
                link.rel = "stylesheet";
                link.href = cssKey;
                document.head.appendChild(link);
                this.loadedAssets.add(cssKey);
            }

            // 2. Asset: JS (Duplicate Prevention)
            const jsKey = `${modulePath}${moduleName}.js`;
            const existingJs = document.querySelector(`script[src="${jsKey}"]`);
            if (!existingJs && !this.loadedAssets.has(jsKey)) {
                await this.injectScript(jsKey);
                this.loadedAssets.add(jsKey);
            }

            // 3. HTML Loading (Cache-first)
            let html;
            if (this.moduleCache.has(htmlKey)) {
                html = this.moduleCache.get(htmlKey);
            } else {
                const res = await fetch(`${modulePath}${moduleName}.html`);
                if (!res.ok) throw new Error(`HTML not found: ${moduleName}`);
                html = await res.text();
                this.moduleCache.set(htmlKey, html);
            }

            // 4. Mount & Init
            root.innerHTML = html;
            this.activeModule = moduleName;
            
            if (window.CozyOS.Modules?.[moduleName]?.init) {
                window.CozyOS.Modules[moduleName].init();
                console.info(`[CozyOS] Module ready: ${moduleName}`);
            }

        } catch (err) {
            console.error("CozyOS Lifecycle Manager Error:", err);
            root.innerHTML = `<div class="cozy-error">System Alert: ${err.message}</div>`;
        } finally {
            this.isLoading = false;
        }
    },

    injectScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
};
