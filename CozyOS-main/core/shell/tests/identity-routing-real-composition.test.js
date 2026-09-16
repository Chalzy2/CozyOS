'use strict';

/**
 * core/shell/tests/identity-routing-real-composition.test.js
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * index-html-post-login-routing-wiring.test.js (pre-existing, unchanged)
 * proves index.html's own inline script correctly ACTS on whatever
 * AuthCoordinator.getCurrentIdentity()/IdentityEngine.getDashboardConfig()
 * return — but it stubs both, so it can never catch a bug that lives in
 * how those two real modules compose with each other. That composition
 * gap is exactly where the C14B identity-routing defect lived: real
 * CozyOS.Session.establishFromExternalAuth() (password/passkey server
 * login) sets .uid to an email; real IdentityEngine.getDashboardConfig()
 * looks its argument up in a table keyed by IdentityEngine's own
 * internal ids. This file loads the REAL identity-engine.js and REAL
 * cozy-session-service.js (not stubs) together with index.html's real
 * inline script, and only stubs AuthCoordinator itself (a thin seam
 * bridging to the real Session object) — AuthCoordinator's own huge
 * dependency graph (WebAuthnProvider, PhoneAccountLinkage, etc.) is not
 * where this bug or fix live, so it is not loaded here.
 *
 * Run: node --test core/shell/tests/identity-routing-real-composition.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const nodeCrypto = require('node:crypto');
const { TextEncoder, TextDecoder } = require('node:util');

const ROOT = path.resolve(__dirname, '..', '..', '..');

function read(relPath) {
    return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function extractInlineScript(html) {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1, 'expected exactly one inline <script> block in index.html');
    return scripts[0][1];
}

/**
 * Builds a sandbox with the REAL identity-engine.js and REAL
 * cozy-session-service.js loaded (not stubbed), plus index.html's real
 * inline script. AuthCoordinator is a thin, honest stub that delegates
 * straight to the real Session object it's given — it does not
 * reimplement any routing/lookup logic itself.
 */
function buildRealSandbox() {
    const elements = {
        'cozy-startup-error': { style: {} },
        'cozy-launch-screen': { classList: { add() {}, remove() {} }, innerHTML: '' },
    };
    const result = { locationHref: null, mountedUserId: undefined, mounted: false };

    const sandbox = {
        console,
        setTimeout, setInterval, clearInterval,
        document: {
            getElementById: (id) => elements[id] || null,
            addEventListener: () => {}, // registerWithKernel()'s optional listener
        },
        navigator: {},
        crypto: nodeCrypto.webcrypto, // real WebCrypto — identity-engine.js's own password hashing needs .subtle + getRandomValues
        TextEncoder, TextDecoder, // real password hashing encodes the password string before hashing it
        window: null,
    };
    sandbox.window = sandbox;
    sandbox.window.addEventListener = () => {}; // identity-engine.js listens for window-level events in its own optional integrations
    sandbox.CozyOS = { registerCoordinator: () => {} };
    sandbox.window.CozyOS = sandbox.CozyOS;

    vm.createContext(sandbox);
    // Real, unmodified modules — this is the actual composition under test.
    vm.runInContext(read('core/shell/platform-event-bus.js'), sandbox);
    vm.runInContext(read('core/shell/post-login-routing-core.js'), sandbox);
    vm.runInContext(read('core/modules/identity/identity-engine.js'), sandbox);
    vm.runInContext(read('core/modules/session/cozy-session-service.js'), sandbox);

    sandbox.window.location = {
        set href(v) { result.locationHref = v; },
        get href() { return result.locationHref; },
    };
    sandbox.window.CozyOS.UserDashboard = {
        render: (_screen, uid) => { result.mounted = true; result.mountedUserId = uid; },
    };

    return { sandbox, result };
}

/**
 * Thin AuthCoordinator stub — delegates to the real Session object
 * instead of reimplementing isAuthenticated()/getCurrentIdentity(),
 * exactly mirroring the real auth-coordinator.js's own delegation
 * (#session().isSignedIn() / #session().current()).
 */
function wireHonestAuthCoordinator(sandbox) {
    sandbox.window.CozyOS.AuthCoordinator = {
        restoreSession: async () => {},
        isAuthenticated: () => !!(sandbox.window.CozyOS.Session && sandbox.window.CozyOS.Session.isSignedIn()),
        getCurrentIdentity: () => {
            const session = sandbox.window.CozyOS.Session;
            const current = session && session.current();
            return current ? { userId: current.uid, source: current.source, roles: current.roles ? [...current.roles] : [] } : null;
        },
    };
}

async function runRealIndexHtml(sandbox, result) {
    vm.runInContext(extractInlineScript(read('index.html')), sandbox);
    sandbox.window.CozyOS.PlatformEventBus.emit('cozy:launch-sequence-complete');
    return new Promise((resolve) => setTimeout(() => resolve(result), 700));
}

const REGISTER_BASE = {
    firstName: 'Test', lastName: 'User', phone: '+15550001111',
    password: 'CorrectHorseBatteryStaple9!', confirmPassword: 'CorrectHorseBatteryStaple9!',
    acceptTerms: true,
};

test('REAL composition: password-server-login admin (uid=email) resolves to CHALZYDASHBOARD, not USER_DASHBOARD', async () => {
    const { sandbox, result } = buildRealSandbox();
    const identity = sandbox.window.CozyOS.IdentityEngine;

    // Real first-user bootstrap admin registration (register()'s own
    // documented, legitimate path — isFirstUser === true).
    const reg = await identity.register({ ...REGISTER_BASE, accountType: 'administrator', username: 'admin_person', email: 'admin@kafexo.com' });
    assert.equal(reg.available, true);
    // Array.from(): reg.roles is an array from the vm sandbox's separate
    // realm, so a strict deepEqual against a host-realm array literal
    // fails on prototype identity alone — compare contents, not realm.
    assert.deepEqual(Array.from(reg.roles), ['platform-admin']);

    // Confirm the actual premise of the bug before proving the fix:
    // IdentityEngine has no record keyed by the raw email.
    assert.equal(identity.getUser('admin@kafexo.com'), null);

    // Simulate exactly what AuthCoordinator's real, private
    // #finishServerLogin() does for a password/passkey server login —
    // the real, public CozyOS.Session.establishFromExternalAuth() call,
    // uid set to the email, same shape the server response drives.
    sandbox.window.CozyOS.Session.establishFromExternalAuth({ uid: 'admin@kafexo.com', roles: ['platform-admin'], profile: { email: 'admin@kafexo.com', authMode: 'server-password' } });
    wireHonestAuthCoordinator(sandbox);

    const outcome = await runRealIndexHtml(sandbox, result);
    assert.equal(outcome.locationHref, 'chalzydashboard.html');
    assert.equal(outcome.mounted, false);
});

test('REAL composition: password-server-login ordinary user (uid=email) mounts USER_DASHBOARD', async () => {
    const { sandbox, result } = buildRealSandbox();
    const identity = sandbox.window.CozyOS.IdentityEngine;

    await identity.register({ ...REGISTER_BASE, accountType: 'administrator', username: 'bootstrap_admin', email: 'bootstrap@kafexo.com' }); // isFirstUser must be consumed so the NEXT registration is a real ordinary user
    const reg = await identity.register({ ...REGISTER_BASE, accountType: 'user', username: 'normal_person', email: 'user@kafexo.com', phone: '+15550002222' });
    assert.equal(reg.available, true);
    assert.deepEqual(Array.from(reg.roles), ['standard-user']);

    sandbox.window.CozyOS.Session.establishFromExternalAuth({ uid: 'user@kafexo.com', roles: [], profile: { email: 'user@kafexo.com', authMode: 'server-password' } });
    wireHonestAuthCoordinator(sandbox);

    const outcome = await runRealIndexHtml(sandbox, result);
    assert.equal(outcome.locationHref, null);
    assert.equal(outcome.mounted, true);
    // authState.userId is returned UNRESOLVED by design (see index.html)
    // — mountUserDashboard() must keep receiving the original session
    // uid (the email), never the internal id, so this proves the fix
    // did not leak resolvedUserId beyond the routing decision itself.
    assert.equal(outcome.mountedUserId, 'user@kafexo.com');
});

test('REAL composition: passkey-server-login admin (uid=email) resolves to CHALZYDASHBOARD — same fix, second server-authoritative method', async () => {
    const { sandbox, result } = buildRealSandbox();
    const identity = sandbox.window.CozyOS.IdentityEngine;

    await identity.register({ ...REGISTER_BASE, accountType: 'administrator', username: 'admin_person2', email: 'admin2@kafexo.com' });
    // Passkey server login goes through the identical #finishServerLogin
    // -> establishFromExternalAuth({uid: email, ...}) path as password —
    // there is no separate session-establishment mechanism to test.
    sandbox.window.CozyOS.Session.establishFromExternalAuth({ uid: 'admin2@kafexo.com', roles: ['platform-admin'], profile: { email: 'admin2@kafexo.com', authMode: 'server-passkey' } });
    wireHonestAuthCoordinator(sandbox);

    const outcome = await runRealIndexHtml(sandbox, result);
    assert.equal(outcome.locationHref, 'chalzydashboard.html');
});

test('REAL composition: id-shaped uid (phone/legacy-passkey/legacy-Google path) is completely unaffected by the fix', async () => {
    const { sandbox, result } = buildRealSandbox();
    const identity = sandbox.window.CozyOS.IdentityEngine;

    const reg = await identity.register({ ...REGISTER_BASE, accountType: 'administrator', username: 'phone_admin', email: 'phoneadmin@kafexo.com' });
    // establishFromIdentity() is what phone/legacy-passkey/legacy-Google
    // logins actually call — uid is set to the real internal id
    // directly, exercising the getUser(id) direct-hit branch, not the
    // findUserIdForRecovery() fallback.
    identity.getSession = identity.getSession || undefined; // no-op guard, real method already exists below
    const sessionResult = identity.loginWithVerifiedPasskey(reg.userId);
    assert.equal(sessionResult.available, true);
    sandbox.window.CozyOS.Session.establishFromIdentity(sessionResult.sessionId);
    wireHonestAuthCoordinator(sandbox);

    const outcome = await runRealIndexHtml(sandbox, result);
    assert.equal(outcome.locationHref, 'chalzydashboard.html');
});

test('REAL composition: unknown identity (email matches nothing in IdentityEngine) is never treated as admin — fails closed to USER_DASHBOARD', async () => {
    const { sandbox, result } = buildRealSandbox();
    // No registration at all — IdentityEngine genuinely has no user
    // matching this email under any lookup.
    sandbox.window.CozyOS.Session.establishFromExternalAuth({ uid: 'nobody@kafexo.com', roles: ['platform-admin'], profile: { email: 'nobody@kafexo.com', authMode: 'server-password' } });
    wireHonestAuthCoordinator(sandbox);

    const outcome = await runRealIndexHtml(sandbox, result);
    // Even though the SESSION carries roles:['platform-admin'] (e.g. a
    // manipulated/spoofed client-side session), the routing hint must
    // never grant CHALZYDASHBOARD for an identity IdentityEngine cannot
    // itself verify locally — and this is only a ROUTING HINT regardless:
    // the real security boundary is chalzydashboard.html's own
    // server-verified gate, unchanged and untouched by this fix.
    assert.equal(outcome.locationHref, null);
    assert.equal(outcome.mounted, true);
});
