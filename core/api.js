/**
 * ── COZYOS CORE API INTERFACE ABSTRACT SPECIFICATION ──
 * FILE: core/api.js
 * 
 * DESIGN PRINCIPLE: Strict Sandbox Isolation & Kernel Decoupling
 * VERTICAL STATUS: PRODUCTION FROZEN | IMMUTABLE
 */

import SecurityGuard from './permissions.js';
import AuditTrail from './audit.js';
import StorageEngine from './storage.js';
import LocalizationEngine from './language.js';

export class CozyCoreAPI {
    /**
     * Instantiates an isolated context wrapper for an industry plugin partition
     * @param {Object} manifest - Certified Plugin Manifest Descriptor
     * @param {Object} kernelSession - Active authenticated kernel session context
     */
    constructor(manifest, kernelSession) {
        this._pluginId = manifest.id.toLowerCase();
        this._tenantId = kernelSession.tenantId;
        this._session = kernelSession;
    }

    /**
     * 🔐 AUTHENTICATION & IDENTITY ACCESS
     */
    get auth() {
        return {
            getCurrentUser: () => ({
                uid: this._session.user?.uid || null,
                email: this._session.user?.email || null,
                displayName: this._session.user?.displayName || null
            }),
            isAuthenticated: () => !!this._session.user
        };
    }

    /**
     * 🛡️ AUTHORIZATION (RBAC RULES COMPLIANCE)
     */
    get authorization() {
        return {
            hasPermission: (permissionNode) => {
                const checkContext = { tenantId: this._tenantId, role: this._session.profile?.role };
                return SecurityGuard.check(checkContext, permissionNode);
            },
            enforcePermission: (permissionNode) => {
                const checkContext = { tenantId: this._tenantId, role: this._session.profile?.role };
                if (!SecurityGuard.check(checkContext, permissionNode)) {
                    throw new Error(`🔒 CozyOS Security Exception: Missing required capability node [${permissionNode}]`);
                }
            }
        };
    }

    /**
     * 🏢 TENANT MANAGEMENT (ISOLATION BARRIERS)
     */
    get tenant() {
        return {
            getTenantId: () => this._tenantId,
            getIndustryContext: () => this._session.industry || null,
            getLicenseStatus: () => window.CozyOS?.Licensing?.getStatus(this._tenantId) || "ACTIVE_EVALUATION"
        };
    }

    /**
     * 💾 SECURE SYSTEM STORAGE BOUNDARIES
     */
    get storage() {
        return {
            readRecord: async (collection, docId) => {
                // Enforces automatic tenant prefix scoping behind the scenes
                return await StorageEngine.get(`${this._tenantId}_${collection}`, docId);
            },
            writeRecord: async (collection, docId, dataPayload) => {
                return await StorageEngine.set(`${this._tenantId}_${collection}`, docId, {
                    ...dataPayload,
                    updatedAt: new Date().toISOString(),
                    originPlugin: this._pluginId
                });
            }
        };
    }

    /**
     * 📝 IMMUTABLE SYSTEM AUDIT LOGGING PUSH
     */
    get audit() {
        return {
            logAction: async (actionEvent, textualMetadata) => {
                return await AuditTrail.log(this._session, `PLUGIN_${this._pluginId.toUpperCase()}_${actionEvent}`, textualMetadata);
            }
        };
    }

    /**
     * 🌍 MULTI-DIALECT LOCALIZATION ENGINE ACCESS
     */
    get localization() {
        return {
            translate: (key, fallbackString, targetLanguage = null) => {
                const lang = targetLanguage || window.CozyOS?.RuntimeLanguage || 'en';
                return LocalizationEngine.resolve(key, lang) || fallbackString;
            }
        };
    }

    /**
     * ⚡ SYSTEM ENGINE INTERFACE HANDSHAKES
     */
    get system() {
        return {
            triggerNotification: (title, message, visualType = 'info') => {
                if (window.CozyOS?.Dashboard?.Toast) {
                    window.CozyOS.Dashboard.Toast.show({ title, message, type: visualType });
                } else {
                    console.log(`[Notification Engine] [${visualType.toUpperCase()}] ${title}: ${message}`);
                }
            },
            getOfflineSyncStatus: () => {
                return window.CozyOS?.OfflineEngine?.getTelemetry() || { status: 'online', pendingRecordsCount: 0 };
            },
            getBillingSummary: () => {
                return window.CozyOS?.BillingEngine?.getAccountState(this._tenantId) || { clearToOperate: true, balance: 0 };
            }
        };
    }
          }
