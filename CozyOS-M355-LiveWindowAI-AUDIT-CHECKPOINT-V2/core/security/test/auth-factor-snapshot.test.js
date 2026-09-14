'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFactorSnapshot } = require('../auth-factor-snapshot');

function fakeWebauthn({ hasCred = false, supported = true } = {}) {
    return { hasCredential: () => hasCred, isSupported: () => supported };
}
function fakePhoneLinkage({ verified = false, loginUsable = false, recoveryUsable = false } = {}) {
    return {
        getPhoneState: () => ({ verified }),
        isPhoneLoginUsable: () => loginUsable,
        isPhoneRecoveryUsable: () => recoveryUsable
    };
}
function fakeGoogleLinkage({ linked = false, loginEnabled = false } = {}) {
    return { getGoogleState: () => ({ googleLinked: linked, googleLoginEnabled: loginEnabled }) };
}
function fakeRegistry(realFactors = []) {
    return { getProvider: (name) => ({ isReal: realFactors.includes(name) }) };
}
function fakeTrustedDeviceManager({ devices = [], trustedIds = [] } = {}) {
    return {
        listDevicesForUser: () => devices,
        isTrusted: (id) => trustedIds.includes(id)
    };
}

test('missing userId degrades every per-user factor to unavailable, never throws', () => {
    const snap = buildFactorSnapshot({});
    assert.equal(snap.factors.passkey.enrolled, false);
    assert.equal(snap.factors.phone.loginUsable, false);
    assert.equal(snap.factors.google.linked, false);
    assert.equal(snap.account.active, false);
});

test('malformed/missing engine dependency fails closed instead of throwing', () => {
    const snap = buildFactorSnapshot({ userId: 'u1', user: { status: 'active', hash: 'x' } });
    assert.equal(snap.factors.passkey.enrolled, false);
    assert.equal(snap.factors.phone.verified, false);
    assert.equal(snap.factors.google.linked, false);
    assert.equal(snap.factors.password.available, true);
});

test('a caller-supplied boolean never appears in the output directly', () => {
    // Passing an object shaped like a factor state has no effect —
    // only real engine calls matter.
    const snap = buildFactorSnapshot({ userId: 'u1', user: { status: 'active', passkeyEnrolled: true } });
    assert.equal(snap.factors.passkey.enrolled, false);
});

test('enrolled + device-supported passkey composes through from WebAuthnProvider', () => {
    const snap = buildFactorSnapshot({
        userId: 'u1',
        user: { status: 'active', hash: 'x' },
        webauthnProvider: fakeWebauthn({ hasCred: true, supported: true })
    });
    assert.equal(snap.factors.passkey.enrolled, true);
    assert.equal(snap.factors.passkey.deviceSupported, true);
});

test('phone usable only when linkage reports both verified and loginUsable', () => {
    const snap = buildFactorSnapshot({
        userId: 'u1',
        user: { status: 'active' },
        phoneLinkage: fakePhoneLinkage({ verified: true, loginUsable: true })
    });
    assert.equal(snap.factors.phone.verified, true);
    assert.equal(snap.factors.phone.loginUsable, true);
});

test('google linked only when both googleLinked AND googleLoginEnabled are true', () => {
    const partial = buildFactorSnapshot({
        userId: 'u1', user: { status: 'active' },
        googleLinkage: fakeGoogleLinkage({ linked: true, loginEnabled: false })
    });
    assert.equal(partial.factors.google.linked, false);

    const full = buildFactorSnapshot({
        userId: 'u1', user: { status: 'active' },
        googleLinkage: fakeGoogleLinkage({ linked: true, loginEnabled: true })
    });
    assert.equal(full.factors.google.linked, true);
});

test('google/voice providerReal is read from AuthFactorRegistry, never assumed true', () => {
    const stubOnly = buildFactorSnapshot({ userId: 'u1', user: { status: 'active' }, factorRegistry: fakeRegistry([]) });
    assert.equal(stubOnly.factors.google.providerReal, false);
    assert.equal(stubOnly.factors.voice.providerReal, false);

    const realGoogle = buildFactorSnapshot({ userId: 'u1', user: { status: 'active' }, factorRegistry: fakeRegistry(['google-account']) });
    assert.equal(realGoogle.factors.google.providerReal, true);
});

test('voice.verified is always false regardless of provider reality (no real verification exists)', () => {
    const snap = buildFactorSnapshot({ userId: 'u1', user: { status: 'active' }, factorRegistry: fakeRegistry(['voice']) });
    assert.equal(snap.factors.voice.verified, false);
});

test('trustedDevice is only ever populated in admin-recovery context', () => {
    const tdm = fakeTrustedDeviceManager({ devices: [{ id: 'd1' }], trustedIds: ['d1'] });
    const loginCtx = buildFactorSnapshot({ userId: 'u1', user: { status: 'active' }, context: 'login', trustedDeviceManager: tdm, isPlatformAdmin: true });
    assert.equal(loginCtx.factors.trustedDevice.enrolled, false, 'ordinary login context must never populate trustedDevice, even with a real trusted device on file');

    const recoveryCtx = buildFactorSnapshot({ userId: 'u1', user: { status: 'active' }, context: 'admin-recovery', trustedDeviceManager: tdm, isPlatformAdmin: true });
    assert.equal(recoveryCtx.factors.trustedDevice.enrolled, true);
    assert.equal(recoveryCtx.factors.trustedDevice.adminAuthorized, true);
});

test('trustedDevice.adminAuthorized is only ever what the caller resolved — this builder never decides admin status', () => {
    const tdm = fakeTrustedDeviceManager({ devices: [{ id: 'd1' }], trustedIds: ['d1'] });
    const snap = buildFactorSnapshot({ userId: 'u1', user: { status: 'active' }, context: 'admin-recovery', trustedDeviceManager: tdm, isPlatformAdmin: false });
    assert.equal(snap.factors.trustedDevice.adminAuthorized, false);
});

test('password.available reflects whether a real password hash was actually set at registration', () => {
    const withHash = buildFactorSnapshot({ userId: 'u1', user: { status: 'active', hash: 'abc' } });
    assert.equal(withHash.factors.password.available, true);

    const withoutHash = buildFactorSnapshot({ userId: 'u1', user: { status: 'active' } });
    assert.equal(withoutHash.factors.password.available, false);
});

test('recovery.emailAvailable/phoneAvailable reflect real account/linkage state, not assumed defaults', () => {
    const snap = buildFactorSnapshot({
        userId: 'u1',
        user: { status: 'active', email: 'a@b.com' },
        phoneLinkage: fakePhoneLinkage({ verified: true })
    });
    assert.equal(snap.factors.recovery.emailAvailable, true);
    assert.equal(snap.factors.recovery.phoneAvailable, true);

    const bare = buildFactorSnapshot({ userId: 'u1', user: { status: 'active' } });
    assert.equal(bare.factors.recovery.emailAvailable, false);
    assert.equal(bare.factors.recovery.phoneAvailable, false);
});

test('registrationMethod is surfaced unchanged for reporting only', () => {
    const snap = buildFactorSnapshot({ userId: 'u1', user: { status: 'active', registrationMethod: 'google' } });
    assert.equal(snap.account.registrationMethod, 'google');
});

test('inactive account status produces account.active:false regardless of factor state', () => {
    const snap = buildFactorSnapshot({
        userId: 'u1',
        user: { status: 'locked', hash: 'x' },
        webauthnProvider: fakeWebauthn({ hasCred: true, supported: true })
    });
    assert.equal(snap.account.active, false);
});

test('output is directly consumable by getLoginDecision()', () => {
    const { getLoginDecision } = require('../login-decision-engine');
    const snap = buildFactorSnapshot({
        userId: 'u1',
        user: { status: 'active', hash: 'x', registrationMethod: 'email' },
        webauthnProvider: fakeWebauthn({ hasCred: true, supported: true })
    });
    const decision = getLoginDecision(snap);
    assert.equal(decision.status, 'FACTOR_AVAILABLE');
    assert.equal(decision.primaryFactor, 'passkey');
});
