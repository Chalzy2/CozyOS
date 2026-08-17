/**
 * ── COZYOS CORE MICRO-MODULE: CONFIGURATION MANAGEMENT ──
 * FILE: core/config.js
 * REFERENCE: CozyOS_Universal_Session_Identity_Kernel_Production_Upgrade.pdf
 */
export default {
    version: "12.0.0",
    environment: "production",
    buildTag: "COZYOS-2026-V12-ENTERPRISE",
    flags: { 
        offlineFirstMode: true, 
        aiProcessingEnabled: true, 
        telemetryReporting: true,
        defaultAIProvider: "gemini",
        
        // ── UNIVERSAL SUBSCRIPTION FLAG CONFIGURATION ──
        // Set to false for Free Mode (all features accessible for verification).
        // Set to true to instantly enable active license and tier gate checking.
        SUBSCRIPTIONS_ENABLED: false 
    },
    apiKeys: {
        gemini: "AIzaSyYourGeminiKeyHere_ProductionTokenString",
        openai: "sk-proj-YourOpenAIKeyHere_ProductionTokenString",
        claude: "sk-ant-YourClaudeKeyHere_ProductionTokenString"
    },
    systemDefaults: { 
        databaseTimeout: 15000, 
        maxRetries: 5,
        defaultLanguage: "en", // App primary language boot default config target
        
        // Default evaluation limits & grace parameters
        defaultTrialDays: 14,
        defaultGracePeriodDays: 7
    },
    collections: { 
        userMeta: "cozyUsers", 
        ledger: "cozyWallet", 
        tracking: "cozyLeads",
        
        // Universal billing backend storage allocation hooks
        subscriptions: "cozySubscriptions",
        billingHistory: "cozyBillingHistory"
    }
};
