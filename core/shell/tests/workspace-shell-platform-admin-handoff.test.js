'use strict';

/**
 * core/shell/tests/workspace-shell-platform-admin-handoff.test.js
 *
 * REGRESSION FOR: server-authoritative platform-admin handoff fix in
 * core/shell/cozy-workspace.js's #resolveCurrentUserRole(userId).
 *
 * ROOT CAUSE (confirmed by direct trace, not assumed):
 *   admin-workspace.html -> /webauthn/session -> AdminGateCore.decideGateAction()
 *   correctly recognizes isPlatformAdmin:true -> Session.establishFromExternalAuth()
 *   preserves roles:["platform-admin"] on the real Session snapshot -> but
 *   WorkspaceShell.mount()'s #resolveCurrentUserRole(userId) UNCONDITIONALLY
 *   asked the local window.CozyOS.IdentityEngine.getDashboardConfig(userId)
 *   instead, which honestly returns { available: false } for a server-
 *   provisioned administrator with no local IdentityEngine user record ->
 *   #currentUserRole became null -> the Overview/Administration nav sections
 *   were filtered out -> the shell fell back to the "applications" center ->
 *   #hasPermission("applications:view") -> false (no local record) ->
 *   Access Denied.
 *
 * FIX UNDER TEST: #resolveCurrentUserRole(userId) now reads
 * window.CozyOS.Session.current() first. For a session established via
 * establishFromExternalAuth() (source: "external" — the real, generic
 * bridge point used by AdminGateCore-verified WebAuthn/Firebase admin
 * login, biometric/trusted-device Admin Recovery, and device restore —
 * see auth-coordinator.js), the ALREADY-VERIFIED `roles` array carried on
 * that snapshot is the sole authority for admin/developer status — local
 * IdentityEngine is never consulted for that branch. Native ("identity"
 * source) sessions are completely unaffected: they still go through the
 * exact same, unmodified IdentityEngine.getDashboardConfig() path as
 * before. This mirrors the identical source-based pattern already
 * established in core/security/cozy-auth.js's #handleSessionStarted() —
 * reused, not reinvented; not a second authorization engine.
 *
 * HARNESS DISCLOSURE: this file extracts and runs the REAL, unmodified
 * core/shell/cozy-workspace.js verbatim via require() (matching the real,
 * already-established pattern in core/shell/tests/learning-panel-ui.test.js
 * of setting global.window/global.document before requiring a browser-
 * authored file under Node). Every DOM element below is a Node-side
 * FakeElement, not a real browser DOM (no jsdom/Playwright dependency is
 * installed or required by this file) — this is UNIT VERIFIED (proving
 * WorkspaceShell's own role-resolution/permission-gating logic against
 * controlled Session/IdentityEngine inputs), not Browser-Runtime Verified.
 * mount()'s own internal rendering (#render/#renderCenter/#hasPermission)
 * is exercised for real and unmodified — nothing about WorkspaceShell's
 * logic is stubbed or reimplemented here, only its environment (DOM,
 * IdentityEngine, Session, ServiceRegistry) is faked.
 *
 * Run: node --test core/shell/tests/workspace-shell-platform-admin-handoff.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SHELL_PATH = path.join(__dirname, '..', 'cozy-workspace.js');

/**
 * Minimal, honest Node-side DOM stand-in — same pattern already used by
 * core/shell/tests/learning-panel-ui.test.js's FakeElement. Supports only
 * what cozy-workspace.js's mount()/#render() actually call: innerHTML
 * get/set, querySelector (id-only, sufficient for this shell's own
 * #plugin-count / #cozy-diag-search lookups, both no-ops in the scenarios
 * below), addEventListener (any event type), and appendChild (mount()'s
 * own validation gate).
 */
class FakeElement {
    constructor() {
        this._html = '';
        this._listeners = {};
        this.style = {};
        this.classList = { add() {}, remove() {}, contains: () => false };
    }
    set innerHTML(html) { this._html = html; }
    get innerHTML() { return this._html; }
    querySelector(_sel) { return null; } // nothing this shell looks up by id exists in these scenarios — honest "not found"
    querySelectorAll(_sel) { return []; }
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
    appendChild() {} // never actually called (mount() only checks it exists), kept for the validation gate
}

/**
 * freshShell({ session, identity })
 *   Loads a brand-new instance of the REAL cozy-workspace.js into a
 *   throwaway global.window/global.document, wired to the given fake
 *   Session/IdentityEngine. A fresh require() is forced every call
 *   (require.cache is cleared) because CozyOSWorkspaceShell is a
 *   module-scoped singleton assigned once at load time — each scenario
 *   needs its own instance with its own coordinator wiring, exactly the
 *   isolation a fresh page load would give it in a real browser.
 */
function freshShell({ session, identity } = {}) {
    delete require.cache[require.resolve(SHELL_PATH)];

    global.window = {
        CozyOS: {
            // Real ServiceRegistry/registerCoordinator are stubbed to
            // resolve on the FIRST synchronous attempt inside
            // #subscribeToServiceRegistryEvents()/registerWithServiceRegistry()
            // — otherwise those real, unmodified retry loops would each
            // schedule a live setInterval(..., 250) that never fires
            // (nothing in this harness ever loads the real ServiceRegistry),
            // leaving open timer handles behind after the test finishes.
            // This is purely an absence of an unrelated coordinator, not a
            // stub of anything under test.
            ServiceRegistry: { on: () => {}, listCoordinators: () => [], listApplications: () => [], getCoordinator: () => null },
            registerCoordinator: () => true,
            Session: session || null,
            IdentityEngine: identity || null,
        },
    };
    global.document = {
        documentElement: { style: { setProperty() {} }, setAttribute() {} },
    };

    require(SHELL_PATH);
    return global.window.CozyOS.WorkspaceShell;
}

/** fakeSession(snapshot) — the same real shape Session.current() returns (see cozy-session-service.js). */
function fakeSession(snapshot) {
    return { current: () => (snapshot ? { ...snapshot } : null) };
}

function mountAndGetHtml(shell) {
    const root = new FakeElement();
    shell.mount(root);
    return root.innerHTML;
}

// ============================================================================
// 1. External server-verified platform admin, NO local IdentityEngine record
//    (the exact Chalzcozy scenario from the bug report).
// ============================================================================
test('external platform-admin session with no local IdentityEngine record resolves to admin — administrator UI renders, no Access Denied', () => {
    const identity = {
        // Honest real-world shape: getDashboardConfig() correctly reports
        // "no such user" for a server-provisioned admin with no local
        // record — this is the exact condition that used to cause the
        // bug, and must NOT be papered over by adding a local record here.
        getDashboardConfig: (userId) => ({ available: false, reason: `Unknown userId "${userId}".` }),
        // A local isPlatformAdmin() is intentionally absent/never called
        // for this session's source — proven explicitly in test 4 below.
    };
    const session = fakeSession({ source: 'external', uid: 'Chalzcozy', roles: ['platform-admin'] });

    const shell = freshShell({ session, identity });
    const html = mountAndGetHtml(shell);

    assert.match(html, /CozyOS Enterprise Control Center/, 'administrator shell title must render');
    assert.match(html, /data-center="users"/, 'Administration nav section (admin-only) must be visible');
    assert.match(html, /data-center="orgManager"/, 'Administration nav section (admin-only) must be visible');
    assert.doesNotMatch(html, /Access Denied/, 'the default (dashboard) center must not be denied to a resolved admin');
});

// ============================================================================
// 2. External session present, but roles do NOT contain platform-admin —
//    must not become admin, and must not fall back to trusting local
//    IdentityEngine state either (see test 4 for the explicit poison case).
// ============================================================================
test('external session without an admin/developer role resolves to no role — never admin, regardless of local IdentityEngine record absence', () => {
    const identity = {
        getDashboardConfig: (userId) => ({ available: false, reason: `Unknown userId "${userId}".` }),
    };
    const session = fakeSession({ source: 'external', uid: 'nobody@example.com', roles: [] });

    const shell = freshShell({ session, identity });
    const html = mountAndGetHtml(shell);

    assert.doesNotMatch(html, /CozyOS Enterprise Control Center/, 'must not render the administrator shell title');
    assert.doesNotMatch(html, /data-center="users"/, 'Administration nav section must stay hidden');
});

// ============================================================================
// 3. Native ("identity" source) session — existing IdentityEngine-based
//    resolution must be preserved byte-for-byte.
// ============================================================================
test('native identity-source session still resolves role via IdentityEngine.getDashboardConfig(), unchanged', () => {
    // 3a. Native platform admin (real local record, isPlatformAdmin() genuinely true) -> admin, exactly as before this fix.
    {
        const identity = {
            getDashboardConfig: (userId) => (
                userId === 'local-admin'
                    ? { available: true, dashboardType: 'admin', isPlatformAdmin: true, isDeveloper: false }
                    : { available: false }
            ),
            isPlatformAdmin: () => true,
            checkResourcePermission: () => true,
        };
        const session = fakeSession({ source: 'identity', sessionId: 'sess-1', uid: 'local-admin', roles: ['platform-admin'] });
        const shell = freshShell({ session, identity });
        const html = mountAndGetHtml(shell);
        assert.match(html, /CozyOS Enterprise Control Center/, 'native platform admin must still resolve to admin');
    }

    // 3b. Native ordinary user (getDashboardConfig -> "user") -> never admin, exactly as before this fix.
    {
        const identity = {
            getDashboardConfig: (userId) => (
                userId === 'local-employee'
                    ? { available: true, dashboardType: 'user', isPlatformAdmin: false, isDeveloper: false }
                    : { available: false }
            ),
            isPlatformAdmin: () => false,
            checkResourcePermission: () => true,
        };
        const session = fakeSession({ source: 'identity', sessionId: 'sess-2', uid: 'local-employee', roles: [] });
        const shell = freshShell({ session, identity });
        const html = mountAndGetHtml(shell);
        assert.doesNotMatch(html, /CozyOS Enterprise Control Center/, 'native ordinary user must never resolve to admin');
    }
});

// ============================================================================
// 4. No local privilege escalation: an external session with empty/non-admin
//    roles must NOT inherit admin status from IdentityEngine.isPlatformAdmin()
//    or getDashboardConfig(), even when those are (mis)configured/poisoned to
//    claim platform-admin locally. This is the core security property: the
//    server-verified Session.roles is the ONLY authority for an external
//    session, and IdentityEngine is never even consulted for that branch.
// ============================================================================
test('a local IdentityEngine cannot manufacture platform-admin status for an external, non-admin-role session', () => {
    // Scoped specifically to the two calls that actually determine ROLE
    // (isPlatformAdmin()/getDashboardConfig()) — NOT checkResourcePermission(),
    // which is legitimately called elsewhere in a normal render pass (e.g.
    // per-item nav-menu filtering via #hasPermission for a resolved "no
    // role" session) and would give a false failure if lumped in here.
    let roleDeterminingCallMade = false;
    const identity = {
        // Deliberately poisoned/attacker-controlled local state: claims
        // platform-admin for everything. If #resolveCurrentUserRole ever
        // consulted IdentityEngine for an "external" session, this would
        // wrongly grant admin and this flag would flip true.
        isPlatformAdmin: () => { roleDeterminingCallMade = true; return true; },
        getDashboardConfig: () => { roleDeterminingCallMade = true; return { available: true, dashboardType: 'admin', isPlatformAdmin: true }; },
        checkResourcePermission: () => true,
    };
    // Server-verified session explicitly reports no admin role (the
    // real-world equivalent of AdminGateCore/webauthn-session reporting
    // isPlatformAdmin:false, which firebase-session-bridge.js/auth-
    // coordinator.js then honestly carry through as roles: []).
    const session = fakeSession({ source: 'external', uid: 'chalzcozy-imposter', roles: [] });

    const shell = freshShell({ session, identity });
    const html = mountAndGetHtml(shell);

    assert.doesNotMatch(html, /CozyOS Enterprise Control Center/, 'must not become admin via local IdentityEngine state');
    assert.equal(roleDeterminingCallMade, false, 'IdentityEngine.isPlatformAdmin()/getDashboardConfig() must never be consulted for an external-source session\'s role resolution');
});

test('server isPlatformAdmin:false (roles: []) cannot become admin merely through local state, even with a real IdentityEngine connected', () => {
    // Same shape auth-coordinator.js's real login paths use for a
    // verified-but-non-admin external login (see e.g.
    // firebase-session-bridge.js line ~118's roles passthrough).
    const identity = {
        getDashboardConfig: () => ({ available: true, dashboardType: 'admin', isPlatformAdmin: true }), // wrong/stale local data, must be ignored
        isPlatformAdmin: () => true, // wrong/stale local data, must be ignored
        checkResourcePermission: () => true,
    };
    const session = fakeSession({ source: 'external', uid: 'server-says-no', roles: [] });

    const shell = freshShell({ session, identity });
    const html = mountAndGetHtml(shell);

    assert.doesNotMatch(html, /CozyOS Enterprise Control Center/);
});

// ============================================================================
// 5. Existing ordinary-user permission behavior is fully preserved: denied
//    without the permission, allowed with it — both via the real, unmodified
//    #hasPermission()/IdentityEngine.checkResourcePermission() composition.
// ============================================================================
test('ordinary user without the relevant permission remains denied', () => {
    const identity = {
        getDashboardConfig: (userId) => (
            userId === 'employee-1'
                ? { available: true, dashboardType: 'user', isPlatformAdmin: false, isDeveloper: false }
                : { available: false }
        ),
        // Nothing granted at all — the real, honest shape of a brand-new
        // employee account before any permission has been assigned.
        // (A partial denial, e.g. only "applications:view" withheld,
        // would still leave other Overview items — modules, founderStory —
        // visible, and WorkspaceShell's own real fail-closed nav guard
        // would silently redirect to one of those rather than render this
        // specific center — that redirect-on-partial-denial is real,
        // correct, pre-existing #render() behavior, not a gap in this
        // fix, so it is deliberately not exercised here. Denying
        // everything is what actually reaches the real, unmodified
        // #renderCenter() -> #hasPermission() -> #renderAccessDenied()
        // defense-in-depth path this test means to prove.)
        checkResourcePermission: () => false,
    };
    const session = fakeSession({ source: 'identity', sessionId: 's-emp-1', uid: 'employee-1', roles: [] });

    const shell = freshShell({ session, identity });
    const html = mountAndGetHtml(shell);

    // Ordinary (non-admin) role: mount() redirects the default "dashboard"
    // landing to "applications" — the same real, pre-existing behavior
    // this fix does not touch.
    assert.match(html, /Access Denied/, 'must be denied without any granted permission');
    assert.doesNotMatch(html, /CozyOS Enterprise Control Center/);
});

test("ordinary user's existing granted permission remains allowed, unchanged", () => {
    const identity = {
        getDashboardConfig: (userId) => (
            userId === 'employee-2'
                ? { available: true, dashboardType: 'user', isPlatformAdmin: false, isDeveloper: false }
                : { available: false }
        ),
        checkResourcePermission: (_userId, action) => action === 'applications:view', // explicitly granted
    };
    const session = fakeSession({ source: 'identity', sessionId: 's-emp-2', uid: 'employee-2', roles: [] });

    const shell = freshShell({ session, identity });
    const html = mountAndGetHtml(shell);

    assert.doesNotMatch(html, /Access Denied/, 'must not be denied when the permission is actually granted');
    assert.match(html, /Application Center/, 'the granted center must actually render its real content');
    assert.doesNotMatch(html, /CozyOS Enterprise Control Center/, 'still must never see the administrator shell title');
});
