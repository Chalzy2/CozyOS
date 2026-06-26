/**
 * ── COZYOS CENTRAL RUNTIME CORE API MULTIPLEXER ──
 * FILE: core/api.js
 * 
 * DESIGN PRINCIPLE: Multi-Version Backward Compatibility Adapter Map
 * VERTICAL STATUS: PRODUCTION FROZEN | EXTENSIBLE REPOSITORIES
 */

import SecurityGuard from './permissions.js';
import AuditTrail from './audit.js';
import StorageEngine from './storage.js';
import LocalizationEngine from './language.js';

/**
 * ARCHITECTURAL DEF: Core API Engine Implementation v1.0
 */
class CoreAPIEngineV1 {
    constructor(manifest, session) {
        this._pluginId = manifest.id.toLowerCase();
        this._tenantId = session.tenantId;
        this._session = session;
    }

    get auth() {
        return {
            getCurrentUser: () => ({ uid: this._session.user?.uid || null, email: this._session.user?.email || null }),
            isAuthenticated: () => !!this._session.user
        };
    }

    get authorization() {
        return {
            hasPermission: (node) => SecurityGuard.check({ tenantId: this._tenantId, role: this._session.profile?.role }, node)
        };
    }

    get storage() {
        return {
            readRecord: async (col, id) => await StorageEngine.get(`${this._tenantId}_${col}`, id),
            writeRecord: async (col, id, data) => await StorageEngine.set(`${this._tenantId}_${col}`, id, { ...data, originPlugin: this._pluginId })
        };
    }

    get audit() {
        return {
            logAction: async (event, msg) => await AuditTrail.log(this._session, `V1_${this._pluginId.toUpperCase()}_${event}`, msg)
        };
    }

    get localization() {
        return {
            translate: (key, fallback) => LocalizationEngine.resolve(key, window.CozyOS?.RuntimeLanguage || 'en') || fallback
        };
    }

    get system() {
        return {
            triggerNotification: (title, msg, type = 'info') => window.CozyOS?.Dashboard?.Toast?.show({ title, msg, type })
        };
    }
}

/**
 * FACTORY INTERFACE FOR TRANSLATING SPECIFIC SDK TARGETS
 */
export const CoreAPIFactory = {
    /**
     * Resolves the proper API engine runtime execution module mapping matching manifest specifications
     * @param {Object} manifest - Capability Manifest Descriptor
     * @param {Object} session - Authenticated execution session context from Firebase
     */
    buildContextSandbox(manifest, session) {
        const targetSDK = manifest.sdk || "1.0";
        
        switch (targetSDK) {
            case "1.0":
                return new CoreAPIEngineV1(manifest, session);
            
            /* Future API Releases mount cleanly here without breaking legacy plugins:
            case "2.0":
                return new CoreAPIEngineV2(manifest, session);
            */
            
            default:
                console.warn(`[CoreAPIFactory] SDK Version [${targetSDK}] not explicitly verified. Falling back to v1.0 compatibility environment.`);
                return new CoreAPIEngineV1(manifest, session);
        }
    }
};
