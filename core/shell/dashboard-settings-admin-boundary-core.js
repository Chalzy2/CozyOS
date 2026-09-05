/**
 * CozyOS — Dashboard Settings Admin Boundary Core
 * File Reference: core/shell/dashboard-settings-admin-boundary-core.js
 * Milestone: Dashboard Prompt 2 (§15 — Administrator-only extension/removal boundary)
 *
 * CLASSIFICATION: COMPOSED, new, pure logic (no DOM), Node-testable —
 * same "-core.js" convention as dashboard-navigation-core.js and
 * dashboard-community-summary-core.js.
 *
 * WHY THIS FILE EXISTS
 *   Prompt 2 §15 requires that administrator-only dashboard sections
 *   (e.g. a link into the real Administration Workspace) are gated on
 *   real, server/engine-resolved authority — never a client-supplied
 *   `role = admin` value. The real authority already exists and is
 *   already composed by user-dashboard.js:
 *   window.CozyOS.IdentityEngine.getDashboardConfig(userId), which
 *   returns { available, isPlatformAdmin, ... } computed entirely
 *   inside IdentityEngine (this file never re-derives admin status
 *   itself). This module's only job is the one-line boundary decision
 *   — "given that real, already-resolved config object, should the
 *   admin-only Settings section render?" — pulled out of the DOM
 *   renderer (core/shell/user-dashboard.js) so it is Node-testable in
 *   isolation, since user-dashboard.js itself has no DOM available in
 *   this repository's Node test environment (no jsdom dependency
 *   present — confirmed before writing this file, not assumed).
 *
 * FAIL-CLOSED BY DESIGN
 *   Any shape other than a real dashboardConfig object with
 *   isPlatformAdmin === true (booleans only — no truthy-string
 *   coercion, no "role" field inspected) resolves to false: missing
 *   config, unavailable config, isPlatformAdmin omitted/undefined,
 *   isPlatformAdmin as a non-boolean truthy value, dashboardType ===
 *   "admin" without the boolean also being true. This is deliberate —
 *   the cost of a false negative here (an admin briefly not seeing a
 *   convenience link) is trivial; the cost of a false positive is a
 *   real authority-boundary failure.
 */
(function (root) {
    "use strict";

    const VERSION = "1.0.0";

    /**
     * shouldRenderAdminSettingsSection(dashboardConfig)
     *   dashboardConfig: the real, unmodified object returned by
     *   IdentityEngine.getDashboardConfig(userId). Never trust any
     *   other source for this decision.
     */
    function shouldRenderAdminSettingsSection(dashboardConfig) {
        if (!dashboardConfig || typeof dashboardConfig !== "object") return false;
        if (dashboardConfig.available !== true) return false;
        return dashboardConfig.isPlatformAdmin === true;
    }

    const api = {
        getVersion() { return VERSION; },
        shouldRenderAdminSettingsSection
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root && root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        if (!root.window.CozyOS.Modules["dashboard-settings-admin-boundary-core"]) {
            root.window.CozyOS.DashboardSettingsAdminBoundaryCore = api;
            root.window.CozyOS.Modules["dashboard-settings-admin-boundary-core"] = Object.freeze({
                version: VERSION,
                description: "Dashboard Prompt 2 §15 — the one real, testable boolean decision of whether the Settings surface's admin-only section renders. Composes IdentityEngine.getDashboardConfig()'s real, already-resolved isPlatformAdmin field only; never derives admin status itself and never trusts a client-supplied role value."
            });
        }
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
