/**
 * core/platform/tests/application-visibility.test.js
 * Prompt 2 — "Apps surface truthfulness": real, executed tests for the
 * `capabilities` addition to ApplicationVisibility.listVisibleApplications().
 *
 * Run with: node core/platform/tests/application-visibility.test.js
 *
 * Loads the real, unmodified engines this feature composes (IdentityEngine,
 * ServiceRegistry, ChurchOS) — no mocks substituted for any loaded engine's
 * own logic, same discipline as the repository's existing "-core.js" test
 * suites (see core/shell/tests/dashboard-navigation-core.test.js).
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

async function asyncTest(name, fn) {
    try {
        await fn();
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
    visibility: path.join(__dirname, '..', 'application-visibility.js'),
    moduleRegistry: path.join(__dirname, '..', '..', 'modules', 'module-registry.js'),
    churchOS: path.join(__dirname, '..', '..', 'plugins', 'churchOS-core.js')
};

function loadModules(opts) {
    opts = opts || {};
    Object.values(roots).forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not yet loaded */ } });
    global.window = { CozyOS: {}, addEventListener: () => {}, removeEventListener: () => {} };
    require(roots.identity);
    require(roots.serviceRegistry);
    require(roots.visibility);
    if (opts.withModuleRegistry !== false) require(roots.moduleRegistry);
    if (opts.withChurchOS !== false) require(roots.churchOS);
    return {
        Identity: global.window.CozyOS.IdentityEngine,
        ServiceRegistry: global.window.CozyOS.ServiceRegistry,
        Visibility: global.window.CozyOS.ApplicationVisibility,
        ModuleRegistry: global.window.CozyOS.ModuleRegistry,
        ChurchOS: global.window.CozyOS.ChurchOS
    };
}

let mods = loadModules();

async function makeUser(overrides) {
    overrides = overrides || {};
    const username = overrides.username || ('user_' + Math.random().toString(36).slice(2));
    const user = await mods.Identity.createUser({ username, password: 'Sup3rSecret!', roles: overrides.roles || [] });
    return user.userId || user.id || username;
}

(async () => {
    // -----------------------------------------------------------------
    // capabilities is a distinct field, never merged into applications
    // -----------------------------------------------------------------
    await asyncTest('capabilities: end user result includes a capabilities array separate from applications', async () => {
        mods = loadModules();
        const userId = await makeUser();
        const result = mods.Visibility.listVisibleApplications(userId);
        assert.strictEqual(result.available, true);
        assert.ok(Array.isArray(result.applications));
        assert.ok(Array.isArray(result.capabilities));
    });

    await asyncTest('capabilities: ChurchOS (audience "all") appears in capabilities, not applications', async () => {
        mods = loadModules();
        const userId = await makeUser();
        const result = mods.Visibility.listVisibleApplications(userId);
        const inCapabilities = result.capabilities.some(c => c.appId === 'churchOS');
        const inApplicationsAsPlatformTool = result.applications.some(a => a.appId === 'churchOS');
        assert.strictEqual(inCapabilities, true, 'ChurchOS should be listed as a capability');
        assert.strictEqual(inApplicationsAsPlatformTool, false, 'ChurchOS (the platform-tool declaration) should never appear under applications');
    });

    await asyncTest('capabilities: without ChurchOS loaded, no capability is fabricated', async () => {
        mods = loadModules({ withChurchOS: false });
        const userId = await makeUser();
        const result = mods.Visibility.listVisibleApplications(userId);
        assert.strictEqual(result.capabilities.some(c => c.appId === 'churchOS'), false);
    });

    await asyncTest('capabilities: admin dashboard also receives a capabilities field', async () => {
        mods = loadModules();
        const userId = await makeUser({ roles: ['platform-admin'] });
        const result = mods.Visibility.listVisibleApplications(userId);
        assert.strictEqual(result.dashboardType, 'admin');
        assert.ok(Array.isArray(result.capabilities));
        assert.ok(result.capabilities.some(c => c.appId === 'churchOS'));
    });

    await asyncTest('capabilities: admin/developer-only platform tools never leak into end-user capabilities', async () => {
        mods = loadModules();
        // Fabricate a fake admin-only tool the same way a real coordinator
        // would self-declare, to prove the audience filter genuinely holds.
        global.window.CozyOS.FakeAdminTool = { getVersion: () => '1.0.0', visibility: Object.freeze({ appId: 'fakeAdminTool', name: 'Fake Admin Tool', category: 'platform-tool', audience: 'admin' }) };
        const userId = await makeUser();
        const result = mods.Visibility.listVisibleApplications(userId);
        assert.strictEqual(result.capabilities.some(c => c.appId === 'fakeAdminTool'), false);
    });

    test('registry: module-registry.js still only registers genuinely shell-integrated applications (no ChurchOS entry)', () => {
        mods = loadModules();
        const registered = typeof mods.ModuleRegistry.list === 'function' ? mods.ModuleRegistry.list() : [];
        const ids = registered.map(m => m.id || (m.manifest && m.manifest.id)).filter(Boolean);
        assert.strictEqual(ids.includes('churchOS'), false, 'ModuleRegistry must not gain a fabricated ChurchOS entry');
    });

    test('launch path: getRealLaunchPath returns null for a capability with no real entry file (honest "not yet launchable")', () => {
        mods = loadModules();
        assert.strictEqual(mods.Visibility.getRealLaunchPath('churchOS'), null);
    });

    // -----------------------------------------------------------------
    // Prompt 3 registry reconciliation: getRealLaunchPath must read the
    // live ServiceRegistry record's own entryPoint field, not a second,
    // dashboard-local hardcoded list. Proven generically (any app id
    // that self-registers a real entryPoint), not tied to one hardcoded
    // name, so newly-registered applications never need a dashboard
    // file edit to become launchable.
    // -----------------------------------------------------------------
    test('launch path: getRealLaunchPath reads entryPoint from the live ServiceRegistry record (no hardcoded list)', () => {
        mods = loadModules();
        mods.ServiceRegistry.registerApplication({
            id: 'testapp_dynamic_001', name: 'Dynamic Test App',
            entryPoint: 'applications/DynamicTestApp/index.html'
        });
        assert.strictEqual(mods.Visibility.getRealLaunchPath('testapp_dynamic_001'), 'applications/DynamicTestApp/index.html');
    });

    test('launch path: getRealLaunchPath returns null for an application registered with no entryPoint (honest, not fabricated)', () => {
        mods = loadModules();
        mods.ServiceRegistry.registerApplication({ id: 'testapp_no_entry_001', name: 'No Entry App' });
        assert.strictEqual(mods.Visibility.getRealLaunchPath('testapp_no_entry_001'), null);
    });

    test('launch path: getRealLaunchPath returns null for an id that was never registered at all', () => {
        mods = loadModules();
        assert.strictEqual(mods.Visibility.getRealLaunchPath('never_registered_app_id'), null);
    });

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exitCode = failed > 0 ? 1 : 0;
})();
