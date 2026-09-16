/**
 * CozyOS — Post-Login Routing Core
 * File Reference: core/shell/post-login-routing-core.js
 *
 * CLASSIFICATION: pure logic, no DOM, no network calls — follows the
 * repository's established "-core.js" convention (see
 * core/shell/admin-gate-core.js and
 * core/shell/dashboard-settings-admin-boundary-core.js for precedent):
 * attaches to window.CozyOS so it loads as a plain <script>, and is
 * Node-testable by stubbing global.window before require().
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * Every existing login method (password, OTP, phone, Google, passkey,
 * trusted-device/biometric) already converges on the same place:
 * index.html's resolveAuthState()/proceedPastSequence(), the one
 * function that runs after IdentityEngine.restorePersistedUsers() +
 * AuthCoordinator.restoreSession() resolve the authenticated identity —
 * for a fresh post-login redirect from login.html AND for a returning
 * visitor's already-persisted offline session alike. Previously that
 * function only ever did one thing for an authenticated user: mount
 * the ordinary User Dashboard inline. This module adds the one missing
 * decision — "should this authenticated identity instead be sent to
 * /chalzydashboard?" — as a small, pure, Node-testable function, so
 * that decision isn't duplicated inline across index.html and isn't
 * left untestable inside a <script> tag with no DOM in this repo's
 * Node test environment (no jsdom present, confirmed before writing
 * this file — same reasoning dashboard-settings-admin-boundary-core.js
 * already documents for the same constraint).
 *
 * THIS IS A ROUTING HINT, NOT AN AUTHORIZATION DECISION
 * -------------------------------------------------------
 * This module decides which PAGE an authenticated identity should be
 * sent to. It is never the security boundary for the administrator
 * workspace — that remains exactly what it already was:
 * core/shell/admin-gate-core.js's decideGateAction()/
 * resolveWorkspaceRoute(), driven by a same-origin, credentialed
 * fetch("/webauthn/session") that chalzydashboard.html performs
 * independently, every time that page loads, regardless of how the
 * visitor arrived there. A wrong or stale CHALZYDASHBOARD hint from
 * this module (e.g. a locally cached admin permission the server has
 * since revoked) cannot grant anything — it only sends the browser to
 * a page whose own, unrelated, server-verified gate will then
 * independently deny it. That is why this module is allowed to use
 * IdentityEngine.getDashboardConfig(userId) — the same existing,
 * already-offline-capable, zero-network local method
 * dashboard-settings-admin-boundary-core.js already trusts for a
 * comparably low-stakes UI decision (whether to show a settings link)
 * — without that use becoming a privilege escalation: the actual
 * privileged action (loading the administrator workspace) is gated
 * again, independently, server-side, downstream of this decision.
 *
 * OFFLINE-FIRST / LEAST-NETWORK
 * -------------------------------
 * decidePostLoginDestination() takes a plain object and returns a
 * plain object. It makes no network call itself, and neither does its
 * one input (IdentityEngine.getDashboardConfig(userId) is an in-memory
 * lookup — see that method's own implementation). No network call was
 * added anywhere by this module; the only network call in the whole
 * administrator-routing path remains the pre-existing
 * fetch("/webauthn/session") inside chalzydashboard.html, called
 * exactly where it already was, not from here.
 *
 * FAIL-CLOSED, BUT TOWARD THE EXISTING SAFE DEFAULT
 * ----------------------------------------------------
 * Any shape other than a real dashboardConfig object with
 * isPlatformAdmin === true (booleans only — no truthy-string coercion)
 * resolves to USER_DASHBOARD, exactly matching this repository's
 * pre-existing behavior for every authenticated user before this
 * module existed. The cost of a false negative here (a real
 * administrator lands on the ordinary dashboard instead of being
 * auto-routed to /chalzydashboard, and has to navigate there manually)
 * is a minor inconvenience with an existing, unblocked manual path.
 * The cost of a false positive would be nothing, structurally, because
 * of the independent server gate described above — but this module
 * still refuses to grant on anything less than a real boolean true,
 * for the same reason admin-gate-core.js and
 * dashboard-settings-admin-boundary-core.js both do: a routing/UI
 * convenience should never be the place a security-shaped bug is
 * introduced, even where it wouldn't currently be exploitable.
 */
(function () {
    'use strict';
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};

    const VERSION = '1.0.0';

    const DESTINATION = Object.freeze({
        LOGIN: 'LOGIN',
        CHALZYDASHBOARD: 'CHALZYDASHBOARD',
        USER_DASHBOARD: 'USER_DASHBOARD',
    });

    /**
     * decidePostLoginDestination({ authenticated, dashboardConfig }) -> { destination, reason }
     *
     * @param {object} input
     * @param {boolean} input.authenticated - result of
     *   AuthCoordinator.isAuthenticated() (or equivalent) after
     *   restoreSession()/restorePersistedUsers() have already run.
     *   Strict === true required — anything else is treated as not
     *   authenticated.
     * @param {object|null|undefined} input.dashboardConfig - the exact
     *   object returned by IdentityEngine.getDashboardConfig(userId).
     *   Never re-derived here; this function only reads
     *   dashboardConfig.available and dashboardConfig.isPlatformAdmin,
     *   both already computed inside IdentityEngine.
     */
    function decidePostLoginDestination(input) {
        const authenticated = input && input.authenticated === true;
        if (!authenticated) {
            return { destination: DESTINATION.LOGIN, reason: 'not_authenticated' };
        }

        const dashboardConfig = input.dashboardConfig;
        if (!dashboardConfig || typeof dashboardConfig !== 'object' || dashboardConfig.available !== true) {
            // Matches this repository's pre-existing behavior for every
            // authenticated user before this module existed: unknown/
            // unavailable config never blocks an authenticated user from
            // reaching the ordinary dashboard, it only means they don't
            // get auto-routed to /chalzydashboard.
            return { destination: DESTINATION.USER_DASHBOARD, reason: 'no_usable_dashboard_config' };
        }

        // Strict === true only — no truthy-string/number coercion. Same
        // rule admin-gate-core.js and dashboard-settings-admin-boundary-
        // core.js both already apply to this exact field.
        if (dashboardConfig.isPlatformAdmin === true) {
            return { destination: DESTINATION.CHALZYDASHBOARD, reason: 'verified_local_platform_admin' };
        }

        return { destination: DESTINATION.USER_DASHBOARD, reason: 'ordinary_authenticated_user' };
    }

    window.CozyOS.PostLoginRoutingCore = Object.freeze({
        decidePostLoginDestination,
        DESTINATION,
        version: VERSION,
    });
    window.CozyOS.Modules['post-login-routing-core'] = Object.freeze({
        version: VERSION,
        description: 'Pure logic, no DOM, no network. Decides which page (LOGIN/CHALZYDASHBOARD/USER_DASHBOARD) an authenticated identity should be sent to, using IdentityEngine.getDashboardConfig(userId)\'s already-resolved, offline-capable isPlatformAdmin field as a ROUTING HINT ONLY — never the security boundary. The administrator workspace remains independently gated by admin-gate-core.js\'s server-verified decideGateAction()/resolveWorkspaceRoute(), unchanged by this module.',
    });
})();
