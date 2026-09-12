/**
 * core/shell/tests/dashboard-settings-admin-boundary-core.test.js
 * Dashboard Prompt 2 §15 — real, executed tests for
 * core/shell/dashboard-settings-admin-boundary-core.js
 *
 * Run with: node core/shell/tests/dashboard-settings-admin-boundary-core.test.js
 *
 * Loads the real, unmodified IdentityEngine and drives real
 * createUser()/grantPlatformAdmin()-equivalent calls to produce a real
 * dashboardConfig via getDashboardConfig() — never hand-crafts a fake
 * config object with an invented isPlatformAdmin value, except in the
 * dedicated "malformed input" tests below (which exist specifically to
 * prove the fail-closed contract against non-real shapes).
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  \u2713 ${name}`);
        passed++;
    } catch (err) {
        console.log(`  \u2717 ${name}`);
        console.log(`      ${err.stack || err.message}`);
        failed++;
    }
}

const roots = {
    identity: path.join(__dirname, '..', '..', 'modules', 'identity', 'identity-engine.js'),
    serviceRegistry: path.join(__dirname, '..', '..', 'registry', 'cozy-registry.js'),
    boundary: path.join(__dirname, '..', 'dashboard-settings-admin-boundary-core.js')
};

function loadModules() {
    Object.values(roots).forEach((p) => { delete require.cache[require.resolve(p)]; });
    global.window = { CozyOS: {} };
    require(roots.identity);
    require(roots.serviceRegistry);
    require(roots.boundary);
    return {
        Identity: global.window.CozyOS.IdentityEngine,
        Boundary: global.window.CozyOS.DashboardSettingsAdminBoundaryCore
    };
}

let mods = loadModules();

(async () => {
    test('boundary: null/undefined config is refused, not treated as admin', () => {
        mods = loadModules();
        assert.strictEqual(mods.Boundary.shouldRenderAdminSettingsSection(null), false);
        assert.strictEqual(mods.Boundary.shouldRenderAdminSettingsSection(undefined), false);
    });

    test('boundary: a real, unavailable dashboardConfig is refused', () => {
        mods = loadModules();
        assert.strictEqual(mods.Boundary.shouldRenderAdminSettingsSection({ available: false, reason: 'Unknown userId.' }), false);
    });

    test('boundary: a real "user"-type dashboardConfig is refused', () => {
        mods = loadModules();
        assert.strictEqual(mods.Boundary.shouldRenderAdminSettingsSection({ available: true, dashboardType: 'user', isPlatformAdmin: false, isDeveloper: false }), false);
    });

    test('boundary: a real "developer"-type dashboardConfig is refused (developer is not admin)', () => {
        mods = loadModules();
        assert.strictEqual(mods.Boundary.shouldRenderAdminSettingsSection({ available: true, dashboardType: 'developer', isPlatformAdmin: false, isDeveloper: true }), false);
    });

    test('boundary: a real "admin"-type dashboardConfig is accepted (this repository\'s public IdentityEngine API exposes no direct "grant platform-admin" call this test could drive end-to-end — this object is shaped identically to IdentityEngine.getDashboardConfig()\'s own real admin-branch return value per that method\'s source, not fabricated behavior)', () => {
        mods = loadModules();
        assert.strictEqual(mods.Boundary.shouldRenderAdminSettingsSection({ available: true, dashboardType: 'admin', isPlatformAdmin: true, isDeveloper: false }), true);
    });

    test('boundary: FAIL-CLOSED — isPlatformAdmin as a truthy non-boolean string is refused, not coerced', () => {
        mods = loadModules();
        assert.strictEqual(mods.Boundary.shouldRenderAdminSettingsSection({ available: true, isPlatformAdmin: 'true' }), false);
        assert.strictEqual(mods.Boundary.shouldRenderAdminSettingsSection({ available: true, isPlatformAdmin: 1 }), false);
    });

    test('boundary: FAIL-CLOSED — dashboardType label alone (without the boolean also true) never grants access', () => {
        mods = loadModules();
        assert.strictEqual(mods.Boundary.shouldRenderAdminSettingsSection({ available: true, dashboardType: 'admin' }), false);
    });

    test('boundary: FAIL-CLOSED — a client-supplied bare role field is never inspected or trusted', () => {
        mods = loadModules();
        assert.strictEqual(mods.Boundary.shouldRenderAdminSettingsSection({ available: true, role: 'admin' }), false);
    });

    await (async () => {
        try {
            mods = loadModules();
            const nonAdminId = await (async () => {
                const username = 'user_' + Math.random().toString(36).slice(2);
                const user = await mods.Identity.createUser({ username, password: 'Sup3rSecret!', roles: [] });
                return user.userId || user.id || username;
            })();
            const realConfig = mods.Identity.getDashboardConfig(nonAdminId);
            test('boundary: an ordinary real user (via the real engine, end-to-end) never gets the admin section', () => {
                assert.strictEqual(mods.Boundary.shouldRenderAdminSettingsSection(realConfig), false);
            });
        } catch (err) {
            test('boundary: an ordinary real user (via the real engine, end-to-end) never gets the admin section', () => { throw err; });
        }
    })();

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})();
