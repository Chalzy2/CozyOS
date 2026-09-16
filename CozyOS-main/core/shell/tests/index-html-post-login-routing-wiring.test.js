'use strict';

/**
 * core/shell/tests/index-html-post-login-routing-wiring.test.js
 *
 * Real wiring test for index.html's post-login routing repair. Same
 * honest convention as
 * core/modules/identity/test/login-html-phone-wiring.test.js: index.html's
 * own real inline <script> block is extracted (by reading the actual
 * file, not retyped) and run via Node's vm module against a minimal,
 * honest DOM shim plus the REAL, unmodified
 * core/shell/platform-event-bus.js and
 * core/shell/post-login-routing-core.js. AuthCoordinator/IdentityEngine
 * are stubbed here (not the real classes) specifically so each test
 * can control exactly what an authenticated identity/dashboardConfig
 * looks like without needing a real IndexedDB-backed session — the
 * thing under test is index.html's OWN routing decision (does it call
 * PostLoginRoutingCore correctly and act on CHALZYDASHBOARD/
 * USER_DASHBOARD/LOGIN correctly), not AuthCoordinator/IdentityEngine
 * themselves, which already have their own real test suites elsewhere.
 *
 * Run: node --test core/shell/tests/index-html-post-login-routing-wiring.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..', '..'); // repo root (core/shell/tests -> core/shell -> core -> root)

function read(relPath) {
    return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function extractInlineScript(html) {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1, 'expected exactly one inline <script> block in index.html — extraction logic must be revisited if this changes');
    return scripts[0][1];
}

/**
 * Builds a fresh sandbox and runs index.html's real inline script in
 * it, with AuthCoordinator/IdentityEngine stubbed to the given fixture.
 * Returns { locationHref, mountedUserId } once the routing decision has
 * settled.
 */
function runIndexHtmlRouting({ authenticated, userId, dashboardConfig }) {
    const elements = {
        'cozy-startup-error': { style: {} },
        'cozy-launch-screen': {
            classList: { add() {}, remove() {} },
            innerHTML: '',
        },
    };

    const result = { locationHref: null, mountedUserId: undefined, mounted: false };

    const sandbox = {
        console,
        setTimeout,
        setInterval,
        clearInterval,
        document: {
            getElementById: (id) => elements[id] || null,
        },
        navigator: {}, // no serviceWorker — takes the "API not available" no-op path
        window: null, // assigned to sandbox itself below, matching a real browser global
    };
    sandbox.window = sandbox;
    // Avoids platform-event-bus.js's bounded-retry Service Registry
    // registration ever needing a real registry in this sandbox.
    sandbox.CozyOS = { registerCoordinator: () => {} };

    // Real, unmodified platform-event-bus.js and post-login-routing-core.js.
    vm.createContext(sandbox);
    vm.runInContext(read('core/shell/platform-event-bus.js'), sandbox);
    vm.runInContext(read('core/shell/post-login-routing-core.js'), sandbox);

    // window.location as a plain, settable object (real browsers don't
    // allow overwriting `location` itself, but assigning .href is all
    // this script does, and is all this test needs to observe).
    sandbox.window.location = {
        set href(v) { result.locationHref = v; },
        get href() { return result.locationHref; },
    };

    sandbox.window.CozyOS.AuthCoordinator = {
        restoreSession: async () => {},
        isAuthenticated: () => authenticated === true,
        getCurrentIdentity: () => (authenticated ? { userId } : null),
    };
    sandbox.window.CozyOS.IdentityEngine = {
        restorePersistedUsers: async () => {},
        getDashboardConfig: (uid) => {
            assert.equal(uid, userId, 'getDashboardConfig must be called with the authenticated identity\'s real userId, not a hardcoded/spoofed value');
            return dashboardConfig;
        },
    };
    sandbox.window.CozyOS.UserDashboard = {
        render: (_screen, uid) => { result.mounted = true; result.mountedUserId = uid; },
    };

    vm.runInContext(extractInlineScript(read('index.html')), sandbox);

    // Real PlatformEventBus — fire the real event index.html's real
    // script listens for via bus.once(), exactly as launch-sequence.js
    // would once the visible sequence actually finishes.
    sandbox.window.CozyOS.PlatformEventBus.emit('cozy:launch-sequence-complete');

    // Let the real async resolveAuthState()/proceedPastSequence() chain
    // (real microtasks + the stubbed async functions above) settle.
    return new Promise((resolve) => setTimeout(() => resolve(result), 700));
}

test('unauthenticated visitor -> login.html (unchanged pre-existing behavior)', async () => {
    const result = await runIndexHtmlRouting({ authenticated: false });
    assert.equal(result.locationHref, 'login.html');
    assert.equal(result.mounted, false);
});

test('authenticated ordinary user (isPlatformAdmin false) -> mounts the real User Dashboard inline, no redirect (unchanged pre-existing behavior)', async () => {
    const result = await runIndexHtmlRouting({
        authenticated: true,
        userId: 'user-123',
        dashboardConfig: { available: true, dashboardType: 'user', isPlatformAdmin: false },
    });
    assert.equal(result.locationHref, null);
    assert.equal(result.mounted, true);
    assert.equal(result.mountedUserId, 'user-123');
});

test('authenticated verified platform administrator -> redirected to chalzydashboard.html, User Dashboard NOT mounted (the actual repair)', async () => {
    const result = await runIndexHtmlRouting({
        authenticated: true,
        userId: 'admin-1',
        dashboardConfig: { available: true, dashboardType: 'admin', isPlatformAdmin: true },
    });
    assert.equal(result.locationHref, 'chalzydashboard.html');
    assert.equal(result.mounted, false);
});

test('authenticated user whose dashboardConfig is unavailable (e.g. lookup failed) -> still mounts User Dashboard, never blocked (offline-first: an authenticated user is never sent back to login just because a routing hint could not be computed)', async () => {
    const result = await runIndexHtmlRouting({
        authenticated: true,
        userId: 'user-456',
        dashboardConfig: { available: false, reason: 'Unknown userId.' },
    });
    assert.equal(result.locationHref, null);
    assert.equal(result.mounted, true);
});

test('a truthy-but-non-boolean isPlatformAdmin (spoofing-shaped input) does NOT redirect to chalzydashboard.html', async () => {
    const result = await runIndexHtmlRouting({
        authenticated: true,
        userId: 'user-789',
        dashboardConfig: { available: true, isPlatformAdmin: 1 },
    });
    assert.equal(result.locationHref, null);
    assert.equal(result.mounted, true);
});

test('getDashboardConfig throwing is handled honestly (falls back to USER_DASHBOARD, never crashes the launch sequence)', async () => {
    const elements = {
        'cozy-startup-error': { style: {} },
        'cozy-launch-screen': { classList: { add() {}, remove() {} }, innerHTML: '' },
    };
    const result = { locationHref: null, mounted: false, mountedUserId: undefined };
    const sandbox = {
        console, setTimeout, setInterval, clearInterval,
        document: { getElementById: (id) => elements[id] || null },
        navigator: {},
        window: null,
    };
    sandbox.window = sandbox;
    sandbox.CozyOS = { registerCoordinator: () => {} };
    vm.createContext(sandbox);
    vm.runInContext(read('core/shell/platform-event-bus.js'), sandbox);
    vm.runInContext(read('core/shell/post-login-routing-core.js'), sandbox);
    sandbox.window.location = { set href(v) { result.locationHref = v; }, get href() { return result.locationHref; } };
    sandbox.window.CozyOS.AuthCoordinator = {
        restoreSession: async () => {},
        isAuthenticated: () => true,
        getCurrentIdentity: () => ({ userId: 'user-999' }),
    };
    sandbox.window.CozyOS.IdentityEngine = {
        restorePersistedUsers: async () => {},
        getDashboardConfig: () => { throw new Error('simulated lookup failure'); },
    };
    sandbox.window.CozyOS.UserDashboard = { render: (_s, uid) => { result.mounted = true; result.mountedUserId = uid; } };
    vm.runInContext(extractInlineScript(read('index.html')), sandbox);
    sandbox.window.CozyOS.PlatformEventBus.emit('cozy:launch-sequence-complete');
    await new Promise((resolve) => setTimeout(resolve, 700));

    assert.equal(result.locationHref, null);
    assert.equal(result.mounted, true);
    assert.equal(result.mountedUserId, 'user-999');
});
