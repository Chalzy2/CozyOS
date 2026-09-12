'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getLoginDecision } = require('../login-decision-engine');

function activeAccount(overrides = {}) { return { active: true, ...overrides }; }

test('inactive account is rejected regardless of enrolled factors', () => {
    const result = getLoginDecision({ account: { active: false }, factors: { passkey: { enrolled: true, deviceSupported: true } } });
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.primaryFactor, null);
    assert.deepEqual(result.usableFactors, []);
});

test('missing account context fails closed', () => {
    const result = getLoginDecision({ factors: {} });
    assert.equal(result.status, 'REJECTED');
});

test('malformed factors object never grants a STRONG factor — only the independent password fallback survives', () => {
    const result = getLoginDecision({ account: activeAccount(), factors: 'not-an-object' });
    assert.deepEqual(result.usableFactors, ['password'], 'no strong factor can be derived from a malformed snapshot');
    assert.equal(result.primaryFactor, 'password');
});

test('no usable factor and no password/recovery -> NO_FACTOR_AVAILABLE', () => {
    const result = getLoginDecision({ account: activeAccount(), factors: { password: { available: false } } });
    assert.equal(result.status, 'NO_FACTOR_AVAILABLE');
    assert.equal(result.primaryFactor, null);
});

test('no usable factor but recovery available -> RECOVERY_REQUIRED', () => {
    const result = getLoginDecision({ account: activeAccount(), factors: { password: { available: false }, recovery: { emailAvailable: true } } });
    assert.equal(result.status, 'RECOVERY_REQUIRED');
    assert.equal(result.recoveryAvailable, true);
});

test('enrolled + device-supported passkey is preferred as the primary factor', () => {
    const result = getLoginDecision({ account: activeAccount(), factors: { passkey: { enrolled: true, deviceSupported: true } } });
    assert.equal(result.status, 'FACTOR_AVAILABLE');
    assert.equal(result.primaryFactor, 'passkey');
    assert.ok(result.usableFactors.includes('passkey'));
});

test('passkey enrolled but device does not support WebAuthn is NOT offered as usable (Prompt 7 §17)', () => {
    const result = getLoginDecision({ account: activeAccount(), factors: { passkey: { enrolled: true, deviceSupported: false }, password: { available: true } } });
    assert.ok(!result.usableFactors.includes('passkey'));
    assert.equal(result.primaryFactor, 'password');
});

test('registration method never becomes the forced primary factor — email registration + enrolled passkey => passkey primary', () => {
    const result = getLoginDecision({
        account: activeAccount({ registrationMethod: 'email' }),
        factors: { passkey: { enrolled: true, deviceSupported: true }, password: { available: true } }
    });
    assert.equal(result.primaryFactor, 'passkey');
    assert.equal(result.registrationMethod, 'email');
});

test('registration method never becomes the forced primary factor — google registration without a real google backend falls to password', () => {
    const result = getLoginDecision({
        account: activeAccount({ registrationMethod: 'google' }),
        factors: { google: { linked: true, providerReal: false }, password: { available: true } }
    });
    assert.equal(result.primaryFactor, 'password');
    assert.ok(!result.usableFactors.includes('google-account'), 'stub google-account provider must never be offered as usable');
});

test('registration method never becomes the forced primary factor — phone registration without SMS configured falls to password', () => {
    const result = getLoginDecision({
        account: activeAccount({ registrationMethod: 'phone' }),
        factors: { phone: { verified: true, loginUsable: false }, password: { available: true } }
    });
    assert.equal(result.primaryFactor, 'password');
});

test('a genuinely usable verified+configured phone factor outranks password', () => {
    const result = getLoginDecision({
        account: activeAccount({ registrationMethod: 'phone' }),
        factors: { phone: { verified: true, loginUsable: true }, password: { available: true } }
    });
    assert.equal(result.primaryFactor, 'phone');
    assert.equal(result.fallbackAvailable, true);
});

test('phone verified but not loginUsable (e.g. no SMS backend) is not offered', () => {
    const result = getLoginDecision({ account: activeAccount(), factors: { phone: { verified: true, loginUsable: false }, password: { available: true } } });
    assert.ok(!result.usableFactors.includes('phone'));
});

test('passkey beats phone beats google-account beats voice when all are usable', () => {
    const result = getLoginDecision({
        account: activeAccount(),
        factors: {
            passkey: { enrolled: true, deviceSupported: true },
            phone: { verified: true, loginUsable: true },
            google: { linked: true, providerReal: true },
            voice: { providerReal: true, verified: true },
            password: { available: true }
        }
    });
    assert.deepEqual(result.usableFactors, ['passkey', 'phone', 'google-account', 'voice', 'password']);
    assert.equal(result.primaryFactor, 'passkey');
});

test('voice stub (providerReal:false) is never offered even if "verified:true" is claimed', () => {
    const result = getLoginDecision({ account: activeAccount(), factors: { voice: { providerReal: false, verified: true }, password: { available: true } } });
    assert.ok(!result.usableFactors.includes('voice'), 'a claimed verified:true must not matter without a real provider');
});

test('trusted-device is never offered in an ordinary login context, even if enrolled+adminAuthorized', () => {
    const result = getLoginDecision({
        account: activeAccount(),
        factors: { trustedDevice: { enrolled: true, adminAuthorized: true }, password: { available: true } },
        context: 'login'
    });
    assert.ok(!result.usableFactors.includes('trusted-device'));
});

test('trusted-device only appears for an explicit admin-recovery context, and only when adminAuthorized', () => {
    const notAuthorized = getLoginDecision({
        account: activeAccount(),
        factors: { trustedDevice: { enrolled: true, adminAuthorized: false } },
        context: 'admin-recovery'
    });
    assert.ok(!notAuthorized.usableFactors.includes('trusted-device'));

    const authorized = getLoginDecision({
        account: activeAccount(),
        factors: { trustedDevice: { enrolled: true, adminAuthorized: true } },
        context: 'admin-recovery'
    });
    assert.equal(authorized.primaryFactor, 'trusted-device');
});

test('password is only ever primary when it is the sole usable option', () => {
    const passwordOnly = getLoginDecision({ account: activeAccount(), factors: { password: { available: true } } });
    assert.equal(passwordOnly.primaryFactor, 'password');
    assert.equal(passwordOnly.fallbackAvailable, false, 'password cannot be its own fallback');

    const withPasskey = getLoginDecision({ account: activeAccount(), factors: { passkey: { enrolled: true, deviceSupported: true }, password: { available: true } } });
    assert.equal(withPasskey.primaryFactor, 'passkey');
    assert.equal(withPasskey.fallbackAvailable, true);
});

test('policy can explicitly disable password fallback', () => {
    const result = getLoginDecision({ account: activeAccount(), factors: {}, policy: { passwordFallbackAllowed: false } });
    assert.equal(result.status, 'NO_FACTOR_AVAILABLE');
});

test('decision is deterministic for identical input', () => {
    const input = { account: activeAccount(), factors: { passkey: { enrolled: true, deviceSupported: true }, password: { available: true } } };
    const a = getLoginDecision(input);
    const b = getLoginDecision(input);
    assert.deepEqual(a.usableFactors, b.usableFactors);
    assert.equal(a.primaryFactor, b.primaryFactor);
});
