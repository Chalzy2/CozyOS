export default {
    version: "8.0.0",
    environment: "production",
    buildTag: "COZYOS-2026-V8-PROD",
    flags: { offlineFirstMode: true, aiProcessingEnabled: true, telemetryReporting: true },
    systemDefaults: { databaseTimeout: 15000, maxRetries: 5 },
    collections: { userMeta: "cozyUsers", ledger: "cozyWallet", tracking: "cozyLeads" }
};
