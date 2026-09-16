/**
 * CozyOS — Advertising Policy
 * File Reference: core/shell/live/cozy-advertising-policy.js
 * Repair: RP-035 Section 16
 *
 * OWNERSHIP
 *   One single decision point. Nothing else in this repository is a
 *   commercial-advertisement policy engine (repository-wide search
 *   confirmed zero hits before this file was written). This file
 *   never touches media transport, capture, or session state — an
 *   ad-policy decision can never terminate or modify a live session.
 *
 * DECISION MODEL
 *   ChurchOS  → ADS_DISABLED, always, unconditionally.
 *   Every other application → ADS_ALLOWED by default, unless that
 *   application's own ServiceRegistry manifest explicitly opts out
 *   (adsPolicy: "DISABLED"). No global kill switch exists that would
 *   silently disable ads for every application because ChurchOS
 *   disables them — verified by a dedicated negative test.
 */
(function (root) {
    "use strict";

    const VERSION = "1.0.0";

    function cozyOS() { return root.window.CozyOS; }
    function serviceRegistry() { const c = cozyOS(); return (c && c.ServiceRegistry) || null; }

    const POLICIES = Object.freeze(["ADS_ALLOWED", "ADS_DISABLED", "ADS_RESTRICTED"]);

    // The one hard-coded exception, exactly as specified — ChurchOS is
    // always ADS_DISABLED, never overridable, never conditional on any
    // registry lookup succeeding or failing.
    const CHURCHOS_APP_IDS = Object.freeze(["churchos_core_001", "churchos"]);

    function evaluatePolicy(appId) {
        const normalized = String(appId || "").toLowerCase();
        if (CHURCHOS_APP_IDS.indexOf(normalized) !== -1) {
            return { appId, policy: "ADS_DISABLED", reason: "ChurchOS worship/preaching/prayer/testimony/teaching content is never interrupted by commercial advertising." };
        }

        const sr = serviceRegistry();
        if (sr && typeof sr.getApplication === "function") {
            const app = sr.getApplication(appId);
            if (app && app.adsPolicy === "DISABLED") {
                return { appId, policy: "ADS_DISABLED", reason: "Application manifest explicitly opts out." };
            }
            if (app && app.adsPolicy === "RESTRICTED") {
                return { appId, policy: "ADS_RESTRICTED", reason: "Application manifest restricts ad placement." };
            }
        }
        return { appId, policy: "ADS_ALLOWED", reason: "Default policy — no opt-out registered." };
    }

    // -----------------------------------------------------------------
    // PUBLIC API
    // -----------------------------------------------------------------

    const api = Object.freeze({
        getVersion: () => VERSION,
        POLICIES,
        evaluatePolicy
    });

    root.window.CozyOS = root.window.CozyOS || {};
    root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
    if (!root.window.CozyOS.Modules["cozy-advertising-policy"]) {
        root.window.CozyOS.CozyAdvertisingPolicy = api;
        root.window.CozyOS.Modules["cozy-advertising-policy"] = Object.freeze({
            version: VERSION,
            api,
            description: "RP-035 Section 16 — single application-aware advertising policy decision point. ChurchOS is always ADS_DISABLED; other applications default ADS_ALLOWED unless their own registry manifest opts out. Never touches media transport or session state."
        });
    }
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
