/**
 * core/modules/identity/tests/phase4-profile-language-roles.test.js
 * PHASE 4 — Universal Language Capability: Profile language proficiency/
 * role model (identity-engine.js's new, additive languageRoles field).
 *
 * Proves: a real user can simultaneously hold NATIVE+FLUENT+CONTRIBUTOR
 * for one language and LEARNING for another (the exact Michael
 * Onyango / Luo+Kikuyu scenario your Phase 4 spec names); invalid
 * entries are rejected all-or-nothing; a duplicate language entry is
 * rejected; existing motherLanguages/languagesKnown behavior is
 * completely unaffected when languageRoles is not part of a call.
 *
 * Run with: node --test core/modules/identity/tests/phase4-profile-language-roles.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const IDENTITY_ENGINE_PATH = path.join(__dirname, '..', 'identity-engine.js');

function freshEngine() {
    try { delete require.cache[require.resolve(IDENTITY_ENGINE_PATH)]; } catch (_e) { /* not loaded */ }
    global.window = { CozyOS: { IdentityStorage: { save: async () => ({ success: true }) } } };
    require(IDENTITY_ENGINE_PATH);
    return global.window.CozyOS.IdentityEngine;
}

async function registerRealUser(IE, overrides) {
    const base = { accountType: 'user', firstName: 'Michael', lastName: 'Onyango', username: 'michael_' + Date.now(), email: `michael${Date.now()}@example.com`, phone: '+254700000001', password: 'Str0ng!Passw0rd', confirmPassword: 'Str0ng!Passw0rd', acceptTerms: true };
    const result = await IE.register(Object.assign({}, base, overrides || {}));
    return result.userId;
}

test('A: the Michael Onyango scenario — NATIVE+FLUENT+CONTRIBUTOR for Luo, LEARNING for Kikuyu, simultaneously', async () => {
    const IE = freshEngine();
    const userId = await registerRealUser(IE);
    const result = await IE.updateProfile(userId, {
        languageRoles: [
            { language: 'luo', roles: ['NATIVE', 'FLUENT', 'CONTRIBUTOR'], consent: true, state: 'VERIFIED' },
            { language: 'ki', roles: ['LEARNING'] }
        ]
    });
    assert.equal(result.available, true);
    assert.deepEqual(result.updated, ['languageRoles']);

    const profile = IE.getProfile(userId);
    assert.equal(profile.languageRoles.length, 2);
    const luo = profile.languageRoles.find((r) => r.language === 'luo');
    const ki = profile.languageRoles.find((r) => r.language === 'ki');
    assert.deepEqual(luo.roles.sort(), ['CONTRIBUTOR', 'FLUENT', 'NATIVE']);
    assert.equal(luo.consent, true);
    assert.equal(luo.state, 'VERIFIED');
    assert.deepEqual(ki.roles, ['LEARNING']);
    assert.equal(ki.consent, false); // never defaulted to true
    assert.equal(ki.state, 'UNVERIFIED'); // never defaulted to VERIFIED
});

test('B: an invalid role is rejected all-or-nothing — nothing is saved, not even the valid entries in the same call', async () => {
    const IE = freshEngine();
    const userId = await registerRealUser(IE);
    const result = await IE.updateProfile(userId, {
        languageRoles: [
            { language: 'luo', roles: ['NATIVE'] },
            { language: 'ki', roles: ['NOT_A_REAL_ROLE'] }
        ]
    });
    assert.equal(result.available, false);
    assert.equal(result.languageRoles.reason, 'INVALID_ENTRIES');
    assert.deepEqual(IE.getProfile(userId).languageRoles, []);
});

test('C: a duplicate language entry in the same call is rejected, never silently merged', async () => {
    const IE = freshEngine();
    const userId = await registerRealUser(IE);
    const result = await IE.updateProfile(userId, {
        languageRoles: [
            { language: 'luo', roles: ['NATIVE'] },
            { language: 'luo', roles: ['CONTRIBUTOR'] }
        ]
    });
    assert.equal(result.available, false);
    assert.equal(result.languageRoles.reason, 'INVALID_ENTRIES');
});

test('D: existing motherLanguages/languagesKnown behavior is completely unaffected by this phase', async () => {
    const IE = freshEngine();
    const userId = await registerRealUser(IE);
    const profile = IE.getProfile(userId);
    assert.deepEqual(profile.motherLanguages, []);
    assert.deepEqual(profile.languagesKnown, []);
    assert.deepEqual(profile.languageRoles, []); // new field, honest empty default
});

test('E: a second update call replaces the language-roles set (not merges) — explicit, disclosed replacement semantics', async () => {
    const IE = freshEngine();
    const userId = await registerRealUser(IE);
    await IE.updateProfile(userId, { languageRoles: [{ language: 'luo', roles: ['NATIVE'] }] });
    await IE.updateProfile(userId, { languageRoles: [{ language: 'sw', roles: ['FLUENT'] }] });
    const profile = IE.getProfile(userId);
    assert.equal(profile.languageRoles.length, 1);
    assert.equal(profile.languageRoles[0].language, 'sw');
});
