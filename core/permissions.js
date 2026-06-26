/**
 * ── COZYOS UNIVERSAL SESSION & PERMISSION ENGINE ──
 * DOMAIN: core/permissions.js
 * REFERENCE: [source: 1]
 */

import { db, doc, getDoc } from './firebase.js';
import AuditLogger from './audit.js';

// Initialize the root Global Object Namespace safely
window.CozyOS = window.CozyOS || {};
window.CozyOS.Session = window.CozyOS.Session || null;

export default {
    /**
     * ATOMIC LIFECYCLE INITIALIZER (Steps 1-8)
     * Compiles the comprehensive enterprise session matrix from [source: 1].
     */
    async initializeUserSession(authUserData, deviceId = "unknown_device") {
        const startTime = Date.now();
        
        try {
            // Fetch configuration matrix from Cloud Firestore
            const userRef = doc(db, 'users', authUserData.uid);
            const userSnap = await getDoc(userRef);
            if (!userSnap.exists()) throw new Error("Security Exception: Core registration metadata missing.");
            const profileData = userSnap.data();

            // Setup step-by-step production session tracking parameters
            window.CozyOS.Session = {
                authenticated: true,
                userId: authUserData.uid,
                organizationId: profileData.organizationId || "",
                workspaceId: profileData.workspaceId || "",
                industry: profileData.industry || "general", // e.g., school, hotel, church, hospital
                organizationName: profileData.organizationName || "CozyOS Workspace",
                role: profileData.role || "guest",
                permissions: profileData.permissions || [], // Array of granular scope strings
                language: profileData.language || "en",
                timezone: profileData.timezone || "Africa/Nairobi",
                currency: profileData.currency || "KES",
                country: profileData.country || "KE",
                subscriptionPlan: profileData.subscriptionPlan || "standard",
                tenantId: `${profileData.industry || 'ind'}_${profileData.organizationId || 'org'}`,
                deviceId: deviceId,
                sessionId: `sess_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`,
                onlineStatus: navigator.onLine ? "online" : "offline",
                lastSyncTime: new Date().toISOString(),
                theme: profileData.theme || "premium-dark",
                profile: { name: profileData.name || "", email: authUserData.email || "" },
                avatar: profileData.avatar || "",
                featureFlags: profileData.featureFlags || {},
                aiCapabilities: profileData.aiCapabilities || { allowedTokens: ["ai.execute"] },
                metadata: { initializationLatencyMs: Date.now() - startTime }
            };

            // Propagate language preferences across core engine modules dynamically
            if (window.CozyOS.LanguageEngine?.setLocale) {
                window.CozyOS.LanguageEngine.setLocale(window.CozyOS.Session.language);
            }

            await AuditLogger.log("Login", "CozyOS Global Session generated and actively cached.");
            return window.CozyOS.Session;
            
        } catch (error) {
            console.error("🚨 Kernel Error: Global session initialization trace failed.", error);
            throw error;
        }
    },

    /**
     * UNIVERSAL SCOPE EXPLICIT VERIFICATION
     * Maps precisely to CozyOS.Permissions.check() requirement from [source: 1].
     */
    check(scopeToken) {
        if (!window.CozyOS.Session || !window.CozyOS.Session.authenticated) return false;
        
        // Root override capability rule
        if (window.CozyOS.Session.permissions.includes("admin.all")) return true;
        
        // Evaluate granular string tokens matching requirement (e.g., 'finance.write', 'students.read')
        return window.CozyOS.Session.permissions.includes(scopeToken);
    }
};

// Bind checker explicitly to global namespace map for runtime visibility
window.CozyOS.Permissions = {
    check: (token) => {
        if (!window.CozyOS.Session) return false;
        if (window.CozyOS.Session.permissions.includes("admin.all")) return true;
        return window.CozyOS.Session.permissions.includes(token);
    }
};
