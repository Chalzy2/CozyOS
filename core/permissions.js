/**
 * ── COZYOS CENTRAL USER SESSION & SECURITY KERNEL ──
 * DOMAIN: core/permissions.js
 * REFERENCE: CozyOS_Universal_Session_Identity_Kernel_Production_Upgrade.pdf
 */

import { db } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js';
import AuditLogger from './audit.js';

// Initialize the root namespace safely
window.CozyOS = window.CozyOS || {};
window.CozyOS.Session = window.CozyOS.Session || null;

export default {
    /**
     * CENTRAL LIFECYCLE INITIALIZER (Steps 1-8)
     * Compiles the comprehensive multi-tenant session matrix[span_3](start_span)[span_3](end_span).
     */
    async initializeUserSession(authUserData, deviceId = "client_browser_shell") {
        const startTime = Date.now();
        
        try {
            // Read deep corporate metadata records from Cloud Firestore
            const userRef = doc(db, 'users', authUserData.uid);
            const userSnap = await getDoc(userRef);
            
            if (!userSnap.exists()) {
                throw new Error("Security Exception: Core registration metadata missing.");
            }
            
            const profileData = userSnap.data();

            // Establish the definitive Global Session Object Schema[span_4](start_span)[span_4](end_span)
            window.CozyOS.Session = {
                authenticated: true,
                userId: authUserData.uid,
                organizationId: profileData.organizationId || "",
                workspaceId: profileData.workspaceId || "",
                industry: profileData.industry || "general", // e.g., 'school', 'hotel', 'shop'
                organizationName: profileData.organizationName || "CozyOS Workspace",
                role: profileData.role || "guest",
                permissions: profileData.permissions || [], // Array of fine-grained scope strings
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

            // Hook into external UI translation mechanisms if present
            if (window.CozyOS.LanguageEngine?.setLocale) {
                window.CozyOS.LanguageEngine.setLocale(window.CozyOS.Session.language);
            }

            await AuditLogger.log("Login", "CozyOS Global Session initialized and actively cached.");
            return window.CozyOS.Session;
            
        } catch (error) {
            console.error("🚨 Kernel Boot Failure: Session compilation tracing failed.", error);
            throw error;
        }
    },

    /**
     * CLEAR OPERATOR SESSION STATE
     */
    async clearSession() {
        await AuditLogger.log("Logout", "Terminating active global session context safely.");
        window.CozyOS.Session = null;
    },

    /**
     * FINE-GRAINED ACTION SCOPE CHECKER
     * Enforces explicit permission rules globally across layout files[span_5](start_span)[span_5](end_span).
     */
    check(scopeToken) {
        if (!window.CozyOS.Session || !window.CozyOS.Session.authenticated) return false;
        
        // Root developer override configuration
        if (window.CozyOS.Session.permissions.includes("admin.all")) return true;
        
        // Match fine-grained string tokens (e.g., 'finance.write', 'students.read')[span_6](start_span)[span_6](end_span)
        return window.CozyOS.Session.permissions.includes(scopeToken);
    }
};

// Expose verification endpoints globally to satisfy the universal specification[span_7](start_span)[span_7](end_span)
window.CozyOS.Permissions = {
    check: (token) => {
        if (!window.CozyOS.Session) return false;
        if (window.CozyOS.Session.permissions.includes("admin.all")) return true;
        return window.CozyOS.Session.permissions.includes(token);
    }
};
