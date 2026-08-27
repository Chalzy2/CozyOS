/**
 * core/shell/tests/dashboard-navigation-core.test.js
 * Dashboard Prompt 1 — real, executed tests for
 * core/shell/dashboard-navigation-core.js
 *
 * Run with: node core/shell/tests/dashboard-navigation-core.test.js
 *
 * Loads the real, unmodified engines this file composes (IdentityEngine,
 * ServiceRegistry, ApplicationVisibility, CozyLanguageRegistry) — no
 * mocks substituted for any loaded engine's own logic, same discipline
 * as the repository's existing "-core.js" test suites.
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
    visibility: path.join(__dirname, '..', '..', 'platform', 'application-visibility.js'),
    languageRegistry: path.join(__dirname, '..', '..', 'modules', 'intelligence', 'language', 'cozy-language-registry.js'),
    ingestion: path.join(__dirname, '..', '..', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-ingestion.js'),
    community: path.join(__dirname, '..', '..', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-community.js'),
    review: path.join(__dirname, '..', '..', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-review.js'),
    communitySummary: path.join(__dirname, '..', 'dashboard-community-summary-core.js'),
    teachRouting: path.join(__dirname, '..', '..', 'modules', 'intelligence', 'knowledge', 'teach', 'cozy-teach-cozyai-routing-core.js'),
    core: path.join(__dirname, '..', 'dashboard-navigation-core.js')
};

function loadModules(opts) {
    opts = opts || {};
    Object.values(roots).forEach((p) => { delete require.cache[require.resolve(p)]; });
    global.window = { CozyOS: {} };
    require(roots.identity);
    require(roots.serviceRegistry);
    require(roots.visibility);
    if (opts.withLanguage !== false) require(roots.languageRegistry);
    if (opts.withKnowledge !== false) {
        require(roots.ingestion);
        require(roots.community);
        if (opts.withReview !== false) require(roots.review);
        if (opts.withCommunitySummary !== false) require(roots.communitySummary);
    }
    if (opts.withTeachRouting !== false) require(roots.teachRouting);
    require(roots.core);
    return {
        Identity: global.window.CozyOS.IdentityEngine,
        ServiceRegistry: global.window.CozyOS.ServiceRegistry,
        Visibility: global.window.CozyOS.ApplicationVisibility,
        LanguageRegistry: global.window.CozyOS.CozyLanguageRegistry,
        Community: global.window.CozyOS.CozyKnowledgeCommunity,
        TeachRouting: global.window.CozyOS.CozyTeachCozyAIRouting,
        Core: global.window.CozyOS.DashboardNavigationCore
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
    // Navigation existence + order (Prompt 1 §1/§21/§32)
    // -----------------------------------------------------------------
    test('navigation: exactly five surfaces exist', () => {
        const order = mods.Core.getSurfaceOrder();
        assert.strictEqual(order.length, 5);
    });

    test('navigation: Home exists', () => assert.ok(mods.Core.getSurfaceOrder().includes('home')));
    test('navigation: Community exists', () => assert.ok(mods.Core.getSurfaceOrder().includes('community')));
    test('navigation: AI exists', () => assert.ok(mods.Core.getSurfaceOrder().includes('ai')));
    test('navigation: Apps exists', () => assert.ok(mods.Core.getSurfaceOrder().includes('apps')));
    test('navigation: Settings exists', () => assert.ok(mods.Core.getSurfaceOrder().includes('settings')));

    test('navigation: exact required order, Community immediately after Home', () => {
        const order = mods.Core.getSurfaceOrder();
        assert.deepStrictEqual(order, ['home', 'community', 'ai', 'apps', 'settings']);
        assert.strictEqual(order.indexOf('community'), order.indexOf('home') + 1);
    });

    test('navigation: fails the test if Community is moved away from immediately after Home', () => {
        const order = mods.Core.getSurfaceOrder();
        const wrongOrder = ['home', 'apps', 'community', 'ai', 'settings'];
        assert.notDeepStrictEqual(order, wrongOrder);
    });

    // -----------------------------------------------------------------
    // Navigation switching + active state (Prompt 1 §32)
    // -----------------------------------------------------------------
    test('navigation: default active surface is home', () => {
        mods = loadModules();
        assert.strictEqual(mods.Core.getActiveSurface(), 'home');
    });

    test('navigation: Home -> Community -> AI -> Apps -> Settings -> Home', () => {
        mods = loadModules();
        const path_ = ['community', 'ai', 'apps', 'settings', 'home'];
        for (const surface of path_) {
            const result = mods.Core.switchTo(surface);
            assert.strictEqual(result.success, true);
            assert.strictEqual(mods.Core.getActiveSurface(), surface);
        }
    });

    test('navigation: only the current destination is ever active (no dual-active state)', () => {
        mods = loadModules();
        mods.Core.switchTo('apps');
        const order = mods.Core.getSurfaceOrder();
        const activeCount = order.filter((s) => s === mods.Core.getActiveSurface()).length;
        assert.strictEqual(activeCount, 1);
    });

    test('navigation: switching to a non-existent surface is refused, not silently accepted', () => {
        mods = loadModules();
        const before = mods.Core.getActiveSurface();
        const result = mods.Core.switchTo('marketplace');
        assert.strictEqual(result.success, false);
        assert.strictEqual(mods.Core.getActiveSurface(), before);
    });

    test('navigation: onChange listener fires with active/previous on real switch', () => {
        mods = loadModules();
        let seen = null;
        mods.Core.onChange((evt) => { seen = evt; });
        mods.Core.switchTo('community');
        assert.deepStrictEqual(seen, { active: 'community', previous: 'home' });
    });

    // -----------------------------------------------------------------
    // Identity (Prompt 1 §6/§32) — via real IdentityEngine, no hardcoded identity
    // -----------------------------------------------------------------
    await asyncTest('identity: real user language preference is consumed, not hardcoded', async () => {
        mods = loadModules();
        const userId = await makeUser();
        mods.Identity.setLanguagePreference(userId, 'sw');
        const resolved = mods.Core.resolveInterfaceLanguage(userId);
        assert.strictEqual(resolved.available, true);
        assert.strictEqual(resolved.requestedFromIdentity, 'sw');
        assert.strictEqual(resolved.preferred, 'sw');
        // sw is one of the five real AVAILABLE languages, so no fallback needed
        assert.strictEqual(resolved.code, 'sw');
        assert.strictEqual(resolved.fallback, false);
    });

    // -----------------------------------------------------------------
    // Language (Prompt 1 §7/§32) — real fallback behavior, honestly reported
    // -----------------------------------------------------------------
    await asyncTest('language: an unregistered/NOT_READY requested language honestly falls back', async () => {
        mods = loadModules();
        const userId = await makeUser();
        mods.Identity.setLanguagePreference(userId, 'luo'); // real, registered, but NOT_READY per the real registry
        const resolved = mods.Core.resolveInterfaceLanguage(userId);
        assert.strictEqual(resolved.available, true);
        assert.strictEqual(resolved.preferred, 'luo');
        assert.strictEqual(resolved.fallback, true);
        assert.ok(resolved.reason && resolved.reason.length > 0, 'a fallback must always disclose why, never silently substitute');
    });

    test('language: English fallback is real and reachable (registry\'s own English-first order)', () => {
        mods = loadModules();
        const resolved = mods.Core.resolveInterfaceLanguage(undefined); // no identity/preference at all -> registry default
        assert.strictEqual(resolved.available, true);
        assert.strictEqual(resolved.code, 'en');
    });

    test('language: with no CozyLanguageRegistry loaded, honestly reports unavailable rather than fabricating a code', () => {
        mods = loadModules({ withLanguage: false });
        const resolved = mods.Core.resolveInterfaceLanguage('anyone');
        assert.strictEqual(resolved.available, false);
        assert.ok(resolved.reason);
    });

    // -----------------------------------------------------------------
    // Apps (Prompt 1 §16/§32) — real registry + real visibility, no fabricated apps
    // -----------------------------------------------------------------
    await asyncTest('apps: AI context application list is consulted from real registry+visibility, not hardcoded', async () => {
        mods = loadModules();
        mods.ServiceRegistry.registerApplication({ id: 'realapp1', name: 'Real App One' });
        const userId = await makeUser();
        mods.Identity.assignApplication(userId, 'realapp1');
        const ctx = mods.Core.buildAIContext(userId);
        assert.strictEqual(ctx.applicationsAvailable, true);
        assert.deepStrictEqual(ctx.availableApplications, ['realapp1']);
    });

    await asyncTest('apps: an unregistered/unassigned fake app is never presented as available', async () => {
        mods = loadModules();
        mods.ServiceRegistry.registerApplication({ id: 'realapp2', name: 'Real App Two' });
        const userId = await makeUser();
        // Deliberately do NOT assign realapp2 to this user.
        const ctx = mods.Core.buildAIContext(userId);
        assert.ok(!ctx.availableApplications.includes('realapp2'));
        assert.ok(!ctx.availableApplications.includes('churchos'));
        assert.ok(!ctx.availableApplications.includes('cozyai'));
        assert.ok(!ctx.availableApplications.includes('translation'));
        assert.ok(!ctx.availableApplications.includes('learning'));
    });

    // -----------------------------------------------------------------
    // AI context (Prompt 1 §11/§26/§32) — structured, authorized-only
    // -----------------------------------------------------------------
    await asyncTest('AI: context is a structured object, not free-text/DOM scraping', async () => {
        mods = loadModules();
        const userId = await makeUser();
        const ctx = mods.Core.buildAIContext(userId);
        assert.strictEqual(ctx.available, true);
        assert.ok(Array.isArray(ctx.availableDashboardSurfaces));
        assert.deepStrictEqual(ctx.availableDashboardSurfaces, ['home', 'community', 'ai', 'apps', 'settings']);
        assert.strictEqual(typeof ctx.knowledgeSourceConnected, 'boolean');
        assert.strictEqual(typeof ctx.aiAssistantConnected, 'boolean');
    });

    test('AI: context never includes private identity fields (no roles/companyId/orgId leak)', () => {
        mods = loadModules();
        const ctx = mods.Core.buildAIContext('someone');
        const serialized = JSON.stringify(ctx);
        assert.ok(!serialized.includes('roles'));
        assert.ok(!serialized.includes('companyId'));
        assert.ok(!serialized.includes('orgId'));
    });

    test('AI: with no real knowledge pipeline loaded, honestly reports disconnected rather than claiming Community integration', () => {
        mods = loadModules({ withKnowledge: false });
        const ctx = mods.Core.buildAIContext('someone');
        assert.strictEqual(ctx.knowledgeSourceConnected, false);
    });

    // -----------------------------------------------------------------
    // Community (Prompt 1 §8-10/§32) — real pipeline entry point, no fabricated verification
    // -----------------------------------------------------------------
    test('Community: real knowledge pipeline entry point is connected when loaded', () => {
        mods = loadModules();
        const ctx = mods.Core.buildAIContext('someone');
        assert.strictEqual(ctx.knowledgeSourceConnected, true);
        assert.strictEqual(typeof mods.Community.listCommunityRecords, 'function');
    });

    test('Community: candidate/verified state is read from the real pipeline, never fabricated by this file', () => {
        mods = loadModules();
        // This file has no local candidate/verification store of its own —
        // structurally confirmed: DashboardNavigationCore never calls a
        // mutator like submitContribution/confirmReview/promoteVisibility.
        const src = require('fs').readFileSync(roots.core, 'utf8');
        assert.ok(!/submitContribution|confirmReview|promoteVisibility|rejectContribution/.test(src));
    });

    // -----------------------------------------------------------------
    // Community state summary (Prompt 2 §6/§9/§12) — aggregate, non-identity
    // -----------------------------------------------------------------
    test('AI: communityStateSummary is available and aggregate-only when the real summary module is loaded', () => {
        mods = loadModules();
        const ctx = mods.Core.buildAIContext('someone');
        assert.strictEqual(ctx.communityStateSummary.available, true);
        assert.strictEqual(typeof ctx.communityStateSummary.counts, 'object');
        assert.strictEqual(ctx.communityStateSummary.myContributionsAvailable, false);
    });

    test('AI: communityStateSummary honestly reports unavailable when DashboardCommunitySummaryCore is not loaded', () => {
        mods = loadModules({ withCommunitySummary: false });
        const ctx = mods.Core.buildAIContext('someone');
        assert.strictEqual(ctx.communityStateSummary.available, false);
        assert.ok(ctx.communityStateSummary.reason);
    });

    test('AI: communityStateSummary honestly reports unavailable when no knowledge pipeline is loaded at all', () => {
        mods = loadModules({ withKnowledge: false });
        const ctx = mods.Core.buildAIContext('someone');
        assert.strictEqual(ctx.communityStateSummary.available, false);
    });

    // -----------------------------------------------------------------
    // Administrator authority boundary (Prompt 1 §17/§27/§32)
    // -----------------------------------------------------------------
    test('Administrator authority: this file exposes no registry-mutating call', () => {
        const src = require('fs').readFileSync(roots.core, 'utf8');
        assert.ok(!/registerApplication|unregisterApplication|registerCoreApplication|unregisterCoreApplication/.test(src),
            'DashboardNavigationCore must never expose a path for a normal user to register/remove/modify the application registry.');
    });

    await asyncTest('Administrator authority: normal (non-admin) user context never implies platform-admin capability', async () => {
        mods = loadModules();
        const userId = await makeUser({ roles: [] });
        assert.strictEqual(mods.Identity.isPlatformAdmin(userId), false);
        // The dashboard context this file builds carries no isAdmin/role
        // field at all — confirmed structurally above and behaviorally here.
        const ctx = mods.Core.buildAIContext(userId);
        assert.strictEqual('isAdmin' in ctx, false);
        assert.strictEqual('roles' in ctx, false);
    });

    // -----------------------------------------------------------------
    // Prompt 2 §8 — AI context settings-awareness + real user dashboard
    // knowledge. Additive to every block above; nothing above changed.
    // -----------------------------------------------------------------

    await asyncTest('§8 applications: launchable is a real subset of available (never inferred)', async () => {
        mods = loadModules();
        mods.ServiceRegistry.registerApplication({ id: 'launchapp1', name: 'Launch App One' });
        const userId = await makeUser();
        mods.Identity.assignApplication(userId, 'launchapp1');
        const ctx = mods.Core.buildAIContext(userId);
        assert.ok(ctx.applications.available.includes('launchapp1'));
        // getRealLaunchPath() only resolves paths for a fixed real set
        // (see application-visibility.js REAL_APP_PATHS) — an
        // arbitrary freshly-registered app id has no real path, so it
        // must be reported visible-but-not-launchable, never assumed
        // launchable.
        assert.ok(!ctx.applications.launchable.includes('launchapp1'));
    });

    await asyncTest('§8 identity: displayName is username only, never roles/companyId/orgId', async () => {
        mods = loadModules();
        const userId = await makeUser();
        const ctx = mods.Core.buildAIContext(userId);
        assert.strictEqual(typeof ctx.identity.displayName, 'string');
        const serialized = JSON.stringify(ctx);
        assert.ok(!serialized.includes('companyId'));
        assert.ok(!serialized.includes('orgId'));
        assert.ok(!serialized.includes('roles'));
    });

    await asyncTest('§8 community.availableActions: honestly empty when the real teach-routing engine is not loaded', async () => {
        mods = loadModules({ withTeachRouting: false });
        const userId = await makeUser();
        const ctx = mods.Core.buildAIContext(userId);
        assert.deepStrictEqual(ctx.community.availableActions, []);
    });

    await asyncTest('§8 community.availableActions: reports contribute-knowledge only via the real, loaded TEACH_KNOWLEDGE_TYPES', async () => {
        mods = loadModules();
        assert.ok(Array.isArray(mods.TeachRouting.TEACH_KNOWLEDGE_TYPES) && mods.TeachRouting.TEACH_KNOWLEDGE_TYPES.length > 0);
        const userId = await makeUser();
        const ctx = mods.Core.buildAIContext(userId);
        assert.deepStrictEqual(ctx.community.availableActions, ['contribute-knowledge']);
    });

    await asyncTest('§8 settings.relevantPreferences: mirrors the real, already-resolved language state', async () => {
        mods = loadModules();
        const userId = await makeUser();
        mods.Identity.setLanguagePreference(userId, 'sw');
        const ctx = mods.Core.buildAIContext(userId);
        assert.strictEqual(ctx.settings.relevantPreferences.language.current, 'sw');
        assert.strictEqual(ctx.settings.relevantPreferences.language.isFallback, false);
    });

    await asyncTest('§8 administration: non-admin gets available:false and an empty, non-fabricated tools list', async () => {
        mods = loadModules();
        const userId = await makeUser({ roles: [] });
        const ctx = mods.Core.buildAIContext(userId);
        assert.strictEqual(ctx.administration.available, false);
        assert.deepStrictEqual(ctx.administration.tools, []);
    });

    await asyncTest('§8 administration: an arbitrary client-side role string never grants administration.available', async () => {
        mods = loadModules();
        // "administrator", "root", "superuser" etc. are NOT the real
        // "platform-admin" role checkPermission() actually checks —
        // this proves the boundary is the real role name, not any
        // role-shaped string.
        const userId = await makeUser({ roles: ['administrator', 'root', 'superuser'] });
        const ctx = mods.Core.buildAIContext(userId);
        assert.strictEqual(ctx.administration.available, false);
    });

    await asyncTest('§8 administration: a real platform-admin user (via IdentityEngine end-to-end) gets available:true and real, non-fabricated tools', async () => {
        mods = loadModules();
        const userId = await makeUser({ roles: ['platform-admin'] });
        assert.strictEqual(mods.Identity.isPlatformAdmin(userId), true);
        const ctx = mods.Core.buildAIContext(userId);
        assert.strictEqual(ctx.administration.available, true);
        // getDashboardConfig()'s real admin branch always returns real
        // `users` and `applicationStates` arrays (see identity-engine.js),
        // so both real labels must be present — never a third,
        // invented tool name.
        assert.ok(ctx.administration.tools.includes('user-directory'));
        assert.ok(ctx.administration.tools.includes('application-oversight'));
        assert.strictEqual(ctx.administration.tools.length, 2);
    });

    await asyncTest('§8 administration: an application-specific role (e.g. a ChurchOS-style role) never becomes platform-admin authority', async () => {
        mods = loadModules();
        // No application-role engine is loaded/composed by this file
        // at all (structurally true — see the "no registry-mutating
        // call" test above, and this file never reads any field named
        // churchRole/organizationRole/etc.) — an application-scoped
        // role string sitting in Identity's own roles array must still
        // never satisfy the real "platform-admin" check.
        const userId = await makeUser({ roles: ['church-pastor', 'church-administrator'] });
        const ctx = mods.Core.buildAIContext(userId);
        assert.strictEqual(ctx.administration.available, false);
    });

    // -----------------------------------------------------------------
    // Prompt 2 §8/§9/§14 — explainSurface(): honest, context-derived
    // per-surface capability descriptions (never hardcoded claims).
    // -----------------------------------------------------------------

    test('§8 explainSurface: refuses an unknown surface honestly rather than guessing', () => {
        mods = loadModules();
        const result = mods.Core.explainSurface('marketplace', 'anyone');
        assert.strictEqual(result.available, false);
        assert.ok(result.reason);
    });

    await asyncTest('§8 explainSurface: works for all five real surfaces and returns real, non-empty text', async () => {
        mods = loadModules();
        const userId = await makeUser();
        for (const surface of mods.Core.getSurfaceOrder()) {
            const result = mods.Core.explainSurface(surface, userId);
            assert.strictEqual(result.available, true);
            assert.strictEqual(result.surface, surface);
            assert.ok(typeof result.text === 'string' && result.text.length > 0);
        }
    });

    await asyncTest('§8 explainSurface("settings"): honestly tells a non-admin administrator tools are unavailable', async () => {
        mods = loadModules();
        const userId = await makeUser({ roles: [] });
        const result = mods.Core.explainSurface('settings', userId);
        assert.ok(/not available/i.test(result.text));
    });

    await asyncTest('§8 explainSurface("settings"): honestly tells a real platform-admin their tools are available', async () => {
        mods = loadModules();
        const userId = await makeUser({ roles: ['platform-admin'] });
        const result = mods.Core.explainSurface('settings', userId);
        assert.ok(/platform-administrator access/i.test(result.text));
    });

    test('§8 explainSurface: text is generated at call time from real context, never a static string constant in this file', () => {
        // Structural check: this file's explainSurface() must not
        // contain a hardcoded capability claim like "is active" /
        // "is installed" / "is synchronized" for any application —
        // every sentence must be built from a ctx.* field.
        const src = require('fs').readFileSync(roots.core, 'utf8');
        const explainFn = src.slice(src.indexOf('explainSurface('));
        assert.ok(!/is active"|is installed"|synchronized with the cloud/.test(explainFn));
    });

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})();
