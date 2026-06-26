/**
 * ── COZYOS PRODUCTION PLUGIN MANAGER HUB ──
 * FILE: core/pluginManager.js
 * 
 * VERTICAL STATUS: PRODUCTION FROZEN | IMMUTABLE
 */

import { CozyCoreAPI } from './api.js';
import AuditTrail from './audit.js';

window.CozyOS = window.CozyOS || {};
window.CozyOS.KernelPlugins = window.CozyOS.KernelPlugins || new Map();
window.CozyOS.PluginMetadata = window.CozyOS.PluginMetadata || new Map();

export const PluginManager = {
    /**
     * Ingests and initializes a marketplace extension plugin, injecting isolated API controls
     * @param {Object} manifest - Official Plugin Manifest Standard Specification
     * @param {Function} stateLessHandlerFunc - Plugin functional execution closure
     * @param {Object} activeKernelSession - Session state payload derived from core auth runtime
     */
    async installMarketplacePlugin(manifest, stateLessHandlerFunc, activeKernelSession) {
        // 1. Structural Validation Checklist Integration
        this._verifyManifestStructure(manifest);
        const systemKey = manifest.id.toLowerCase();

        // 2. Multi-Tenant Sandbox Environment Setup
        // Each industry sub-handler receives an isolated interface tailored to its active tenant profile
        const isolatedCoreAPI = new CozyCoreAPI(manifest, activeKernelSession);

        // 3. Register the encapsulated execution loop
        window.CozyOS.KernelPlugins.set(systemKey, async (query) => {
            // Check that the plugin layout is enabled before attempting code execution
            const meta = window.CozyOS.PluginMetadata.get(systemKey);
            if (!meta || meta.status !== 'enabled') {
                return { responseText: "⚠️ Subsystem currently unavailable.", pipelineState: "offline" };
            }
            // Execute the module, providing the context-bound API layer
            return await stateLessHandlerFunc(query, isolatedCoreAPI);
        });

        window.CozyOS.PluginMetadata.set(systemKey, {
            ...manifest,
            status: 'enabled',
            certified: true,
            installedAt: new Date().toISOString()
        });

        await AuditTrail.log(activeKernelSession, "MARKETPLACE_PLUGIN_MOUNTED", `Plugin [${manifest.name}] integrated and running on tenant workspace.`);
        return true;
    },

    _verifyManifestStructure(manifest) {
        const structuralKeys = ['id', 'name', 'version', 'industryScope', 'requiredPermissions'];
        structuralKeys.forEach(k => {
            if (!manifest[k]) throw new Error(`[Manifest Validation] Missing key definition component: ${k}`);
        });
    }
};
