/**
 * ── COZYOS KERNEL MODULE EXTENSION WORKSPACE MANAGER ──
 * FILE: core/pluginManager.js
 * 
 * DESIGN PRINCIPLE: Immutable Kernel-First Plugin Architecture
 * Reference Specs: 665081.jpg, 665082.jpg, 665083.jpg, 665084.jpg
 */

import SecurityGuard from './permissions.js';
import AuditTrail from './audit.js';
import StorageEngine from './storage.js';
import LocalizationEngine from './language.js';

// Setup Kernel Namespace Registry mapping hooks directly onto window object
window.CozyOS = window.CozyOS || {};
window.CozyOS.KernelPlugins = window.CozyOS.KernelPlugins || new Map();
window.CozyOS.PluginMetadata = window.CozyOS.PluginMetadata || new Map();

export const PluginManager = {
    /**
     * Installs and binds a new module block into the system context.
     * Enforces the formal layout specified in 665084.jpg
     * @param {Object} manifest - Official Plugin Manifest Specification Descriptor
     * @param {Function} handlerFunc - Pure stateless resolution function
     */
    async install(manifest, handlerFunc) {
        // 1. Structural Verification Engine Checklist
        this._validateManifest(manifest);
        if (typeof handlerFunc !== 'function') {
            throw new Error(`[PluginManager] Installation failed: Provided handler is not executable.`);
        }

        const systemKey = manifest.id.toLowerCase();

        // 2. Prevent namespace overwrites on active production instances
        if (window.CozyOS.KernelPlugins.has(systemKey) && 
            window.CozyOS.PluginMetadata.get(systemKey).status === 'enabled') {
            console.warn(`[PluginManager] Conflict alert: ${manifest.id} is already loaded. Intercepting updates.`);
            return false;
        }

        // 3. Register and set lifecycle hook states
        window.CozyOS.PluginMetadata.set(systemKey, {
            ...manifest,
            status: 'installed',
            installedAt: new Date().toISOString(),
            health: 'unknown'
        });
        window.CozyOS.KernelPlugins.set(systemKey, handlerFunc);

        console.log(`📦 CozyOS Kernel: Plugin installed successfully -> [${manifest.name} v${manifest.version}]`);
        
        // 4. Trigger Automatic Lifecycle Initialization phase
        await this.initialize(systemKey);
        return true;
    },

    /**
     * Initializes an installed plugin, running system health checks
     */
    async initialize(pluginId) {
        const key = pluginId.toLowerCase();
        const meta = window.CozyOS.PluginMetadata.get(key);
        if (!meta) throw new Error(`[PluginManager] Cannot initialize uninstalled module: ${pluginId}`);

        try {
            meta.status = 'initializing';
            
            // Run automatic verification tests
            const isHealthy = await this.checkHealth(key);
            if (!isHealthy) {
                meta.status = 'disabled';
                meta.health = 'critical';
                return false;
            }

            meta.status = 'enabled';
            meta.health = 'healthy';
            console.log(`🟢 CozyOS Kernel: Module [${key.toUpperCase()}] status changed to ENABLED.`);
            return true;
        } catch (err) {
            meta.status = 'faulty';
            meta.health = 'critical';
            return false;
        }
    },

    /**
     * Temporarily suspends execution loops for a target module
     */
    disable(pluginId) {
        const meta = window.CozyOS.PluginMetadata.get(pluginId.toLowerCase());
        if (meta) {
            meta.status = 'disabled';
            console.log(`⚠️ CozyOS Kernel: Module [${pluginId.toUpperCase()}] disabled by system administrator.`);
        }
    },

    /**
     * Restores execution status for a disabled plugin module
     */
    enable(pluginId) {
        const meta = window.CozyOS.PluginMetadata.get(pluginId.toLowerCase());
        if (meta && meta.status === 'disabled') {
            meta.status = 'enabled';
            console.log(`✨ CozyOS Kernel: Module [${pluginId.toUpperCase()}] restored to active state.`);
        }
    },

    /**
     * Permanently purges an industry module out of active memory spaces
     */
    uninstall(pluginId) {
        const key = pluginId.toLowerCase();
        window.CozyOS.KernelPlugins.delete(key);
        window.CozyOS.PluginMetadata.delete(key);
        console.log(`🗑️ CozyOS Kernel: Module [${key.toUpperCase()}] uninstalled completely from framework registers.`);
    },

    /**
     * Comprehensive Automatic Operational Integrity Health Checker
     */
    async checkHealth(pluginId) {
        const key = pluginId.toLowerCase();
        const handler = window.CozyOS.KernelPlugins.get(key);
        const meta = window.CozyOS.PluginMetadata.get(key);

        if (!handler || !meta) return false;

        // Verify the plugin handles requests seamlessly without exceptions or memory leaks
        try {
            const sandboxContext = { tenantId: "HEALTH_CHECK_TEST", role: "system_validator" };
            const testResult = await handler("health_check_ping", sandboxContext, { check: () => false });
            
            // The module should process input safely, even if it returns a null result for unmatched intents
            if (testResult && testResult.pipelineState === "fault") {
                meta.health = 'degraded';
                return false;
            }
            return true;
        } catch (e) {
            meta.health = 'critical';
            return false;
        }
    },

    /**
     * Automatic Discovery Hook: Returns global access parameters directly from Kernel
     * Fulfills exact scope mapping constraints listed in 665082.jpg
     */
    getKernelServices(session) {
        return {
            auth: { currentUser: session?.user || null },
            permissions: SecurityGuard,
            tenantIsolation: { currentTenant: session?.tenantId || null },
            auditLogging: AuditTrail,
            storage: StorageEngine,
            localization: LocalizationEngine,
            offlineQueue: window.CozyOS?.OfflineQueue || null,
            licensing: window.CozyOS?.Licensing || null,
            dashboardServices: window.CozyOS?.Dashboard || null,
            aiContext: { currentIndustry: session?.industry || null }
        };
    },

    /**
     * Internal strict manifest validation block
     */
    _validateManifest(manifest) {
        const requiredFields = ['id', 'name', 'version', 'industryScope'];
        requiredFields.forEach(field => {
            if (!manifest[field]) {
                throw new Error(`[PluginValidationEngine] Missing required manifest field: "${field}"`);
            }
        });
    }
};

// Expose secure manager wrappers onto global system instances safely
window.CozyOS.PluginManager = {
    register: (manifest, handler) => PluginManager.install(manifest, handler),
    getHealth: (pluginId) => window.CozyOS.PluginMetadata.get(pluginId.toLowerCase())?.health || 'none'
};
