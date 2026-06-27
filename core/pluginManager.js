/**
 * ── COZYOS UNIFIED ENTERPRISE PLUG-IN OPERATING SYSTEM ENGINE ──
 * FILE: core/pluginManager.js
 */

class CozyPluginManager {
    constructor() {
        this.plugins = new Map();
        this.registryMetadata = new Map();
        
        if (window.CozyOS) {
            window.CozyOS.PluginMetadata = this.registryMetadata;
            window.CozyOS.KernelPlugins = this.plugins;
        }
    }

    /**
     * Helper to compare version strings (e.g., "1.2.0" vs "1.0.0")
     */
    _compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;
            if (p1 > p2) return 1;
            if (p1 < p2) return -1;
        }
        return 0;
    }

    /**
     * Shared Services Context Bridge for plugins
     */
    _getKernelContext(pluginId) {
        return Object.freeze({
            pluginId: pluginId,
            authentication: () => window.CozyOS?.CurrentUser || { status: "Guest" },
            tenantIsolation: () => window.CozyOS?.TenantContext?.getActiveId() || "isolated_default",
            auditLogging: (action, data) => console.log(`[AUDIT] [${pluginId}] ${action}`, data),
            storage: {
                get: (key) => localStorage.getItem(`${pluginId}_${key}`),
                set: (key, val) => localStorage.setItem(`${pluginId}_${key}`, val)
            }
        });
    }

    /**
     * Complete Plugin Registration with Chained Dependency Validation Block
     */
    async register(manifest, executionHandler) {
        if (!manifest || !manifest.id || !manifest.version) {
            throw new Error("Plugin Verification Failed: Invalid manifest structure layout.");
        }

        const normalizedId = manifest.id.toLowerCase();

        // 1. Enterprise Dependency Resolution Validation (From 665835.jpg)
        if (manifest.dependsOn && Array.isArray(manifest.dependsOn)) {
            for (const dependency of manifest.dependsOn) {
                // Format: "PluginID@RequiredVersion"
                const [depId, requiredVersion] = dependency.split('@');
                const activeMeta = this.registryMetadata.get(depId.toLowerCase());

                if (!activeMeta || activeMeta.status !== 'enabled') {
                    throw new Error(`Dependency Missing: Plugin requires [${depId}] to be installed and enabled first.`);
                }

                if (this._compareVersions(activeMeta.version, requiredVersion) < 0) {
                    throw new Error(`Version Mismatch: Required dependency [${depId}] is on version v${activeMeta.version}. Version v${requiredVersion} or higher is required.`);
                }
            }
        }

        if (this.plugins.has(normalizedId)) {
            console.warn(`[Kernel] Plugin collision blocked: ${normalizedId} is already registered.`);
            return false;
        }

        // 2. Lifecycle Mount
        this.registryMetadata.set(normalizedId, {
            ...manifest,
            status: "installed",
            registeredAt: new Date().toISOString()
        });

        try {
            const contextBridge = this._getKernelContext(normalizedId);
            this.plugins.set(normalizedId, (query) => executionHandler(query, contextBridge));
            
            this.registryMetadata.get(normalizedId).status = "enabled";
            console.log(`🚀 CozyOS Kernel: Hot-plugged extension mounted successfully [${manifest.name} v${manifest.version}]`);
            
            if (typeof syncTelemetry === 'function') syncTelemetry();
            return true;
        } catch (error) {
            this.registryMetadata.get(normalizedId).status = "disabled";
            console.error(`🚨 Initialization aborted on module [${manifest.id}]:`, error);
            return false;
        }
    }
}

// Global initialization window hook
if (!window.CozyOS) window.CozyOS = {};
window.CozyOS.PluginManager = new CozyPluginManager();
