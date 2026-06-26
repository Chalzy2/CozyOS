/**
 * ── COZYOS CORE PERMISSION & SESSION MATRIX ──
 * SERVICE DOMAIN: core/permissions.js
 * REFERENCES: 665033.jpg, 665034.jpg
 */

import { db, doc, getDoc } from './firebase.js';
import AuditLogger from './audit.js';

export default {
    _session: null,

    /**
     * Establishes the complete security state layout upon user login.
     * Maps precisely to requirements in 665033.jpg.
     */
    async establishSecureSession(authUserData) {
        try {
            const userRef = doc(db, 'users', authUserData.uid);
            const userSnap = await getDoc(userRef);
            if (!userSnap.exists()) throw new Error("Security Exception: Core account mapping missing.");

            const rawProfile = userSnap.data();

            // Unified explicit session context generation block
            this._session = {
                userId: authUserData.uid,
                organizationId: rawProfile.organizationId,
                workspaceId: rawProfile.workspaceId,
                industry: rawProfile.industry, // e.g., 'school', 'hotel', 'hospital'
                role: rawProfile.role,
                department: rawProfile.department || "general",
                language: rawProfile.language || "en",
                subscriptionPlan: rawProfile.subscriptionPlan || "standard",
                aiPermissionLevel: rawProfile.aiPermissionLevel || 1,
                // Load raw authorization array string keys directly
                tokens: new Set(rawProfile.permissions || [])
            };

            // Initialize local configuration for system language translations
            if (window.CozyOS?.LanguageEngine) {
                window.CozyOS.LanguageEngine.setLocale(this._session.language);
            }

            await AuditLogger.log("Login", "User session successfully mounted and validated.");
            return this._session;
        } catch (error) {
            console.error("🚨 Kernel Halt: Session establishment failed.", error);
            throw error;
        }
    },

    /**
     * Checks for a specific granular token rather than checking only the role name.
     * Maps precisely to requirements in 665034.jpg.
     */
    hasToken(tokenString) {
        if (!this._session) return false;
        // Global administrative backup rule bypass
        if (this._session.tokens.has("admin.all")) return true;
        return this._session.tokens.has(tokenString);
    },

    getSession() {
        return this._session;
    }
};
