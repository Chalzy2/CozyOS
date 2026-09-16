'use strict';

/**
 * core/modules/security/test/ordinary-user-identity-fallback.test.js
 *
 * USER SECURITY SURFACE.
 *
 * Both authentication-enrollment-panel.js (M359) and
 * authentication-factor-management-panel.js (M360) resolved "who is
 * signed in" ONLY through CozyOS.Auth.getCurrentIdentity() —
 * core/security/cozy-auth.js's own #handleSessionStarted explicitly
 * rejects and never records an ordinary (non-admin, non-developer)
 * sign-in, so every real ordinary user would have hit "No signed-in
 * user" on a panel that is otherwise mounted on their own dashboard.
 * This suite proves the added fallback to CozyOS.Session.current() (the
 * real, auth-provider-agnostic session every sign-in path already
 * establishes) fixes that for ordinary users, without changing
 * admin/developer behavior at all (CozyOS.Auth still wins whenever it
 * has resolved an identity).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const ENROLLMENT_PANEL_PATH = path.join(__dirname, '..', 'authentication-enrollment-panel.js');
const FACTOR_MGMT_PANEL_PATH = path.join(__dirname, '..', 'authentication-factor-management-panel.js');
const STORE_PATH = path.join(__dirname, '..', '..', '..', 'security', 'authentication-enrollment-store.js');
const REGISTRY_PATH = path.join(__dirname, '..', '..', '..', 'security', 'auth-factor-registry.js');

function freshModule(modulePath, moduleKey, { auth, session } = {}) {
    for (const p of [modulePath, STORE_PATH, REGISTRY_PATH]) {
        delete require.cache[require.resolve(p)];
    }
    global.window = {
        CozyOS: {
            Auth: auth,
            Session: session,
        },
    };
    require(REGISTRY_PATH);
    require(STORE_PATH);
    require(modulePath);
    return global.window.CozyOS.Modules[moduleKey];
}

for (const [label, modulePath, moduleKey] of [
    ['authentication-enrollment-panel', ENROLLMENT_PANEL_PATH, 'authentication-enrollment-panel'],
    ['authentication-factor-management-panel', FACTOR_MGMT_PANEL_PATH, 'authentication-factor-management-panel'],
]) {
    test(`${label}: getCurrentUserId() falls back to CozyOS.Session.current().uid for an ordinary user (CozyOS.Auth absent)`, () => {
        const panel = freshModule(modulePath, moduleKey, {
            auth: undefined,
            session: { current: () => ({ uid: 'ordinary-user-42', source: 'identity' }) },
        });
        assert.equal(panel.getCurrentUserId(), 'ordinary-user-42');
    });

    test(`${label}: getCurrentUserId() falls back to Session when CozyOS.Auth exists but reports no identity (real cozy-auth.js behavior for a non-admin sign-in)`, () => {
        const panel = freshModule(modulePath, moduleKey, {
            auth: { getCurrentIdentity: () => null },
            session: { current: () => ({ uid: 'ordinary-user-99' }) },
        });
        assert.equal(panel.getCurrentUserId(), 'ordinary-user-99');
    });

    test(`${label}: getCurrentUserId() still prefers CozyOS.Auth when it HAS resolved an identity — admin/developer behavior unchanged`, () => {
        const panel = freshModule(modulePath, moduleKey, {
            auth: { getCurrentIdentity: () => ({ userId: 'admin-1' }) },
            session: { current: () => ({ uid: 'should-not-be-used' }) },
        });
        assert.equal(panel.getCurrentUserId(), 'admin-1');
    });

    test(`${label}: getCurrentUserId() returns null when neither Auth nor Session resolves an identity (no fabricated user)`, () => {
        const panel = freshModule(modulePath, moduleKey, { auth: undefined, session: undefined });
        assert.equal(panel.getCurrentUserId(), null);
    });

    test(`${label}: an ordinary user (Session-resolved only) can build real, non-fabricated cards via the fallback`, () => {
        const panel = freshModule(modulePath, moduleKey, {
            auth: undefined,
            session: { current: () => ({ uid: 'ordinary-user-7' }) },
        });
        const userId = panel.getCurrentUserId();
        assert.equal(userId, 'ordinary-user-7');
        // Cards/dashboards build off getCurrentUserId() internally — a
        // resolvable identity must not produce an "unavailable" card for
        // factors with a real enrollment method.
        if (typeof panel.buildAllCards === 'function') {
            const card = panel.buildAllCards().find((c) => c.id === 'security-key' || c.factorName === 'security-key');
            assert.ok(card);
            assert.notEqual(card.unavailable, true);
        }
        if (typeof panel.buildPasskeyCard === 'function') {
            const card = panel.buildPasskeyCard(userId);
            assert.notEqual(card.unavailable, true);
        }
    });
}
