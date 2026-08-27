'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CozyPhoneChallengeService } = require('../phone-provider');
const { CozyPhoneAccountLinkage, InMemoryPhoneLinkageStore, normalizePhone } = require('../phone-account-linkage');

function makeConfiguredDeliveryRegistryDouble() {
    return { getState: () => ({ channel: 'sms', state: 'CONFIGURED_UNVERIFIED', configured: true }) };
}
function makeUnconfiguredDeliveryRegistryDouble() {
    return { getState: () => ({ channel: 'sms', state: 'NONE', configured: false }) };
}

function makeLinkage({ deliveryRegistry } = {}) {
    const challengeService = new CozyPhoneChallengeService({});
    const store = new InMemoryPhoneLinkageStore();
    const linkage = new CozyPhoneAccountLinkage({ challengeService, store, deliveryRegistry });
    return { linkage, store, challengeService };
}

test('normalizePhone collapses equivalent formats to the same identity', () => {
    assert.equal(normalizePhone('+254 700 000 001'), normalizePhone('+254700000001'));
    assert.equal(normalizePhone('(254) 700-000-001'), '254700000001');
    assert.equal(normalizePhone(''), null);
    assert.equal(normalizePhone(null), null);
});

test('a fresh confirmLink() with the correct code marks the phone genuinely verified', async () => {
    const { linkage } = makeLinkage();
    const { _test_rawCode } = await linkage.requestLink('user-1', '+254700000123');
    const result = await linkage.confirmLink('user-1', '+254700000123', _test_rawCode);
    assert.equal(result.linked, true);
    const state = linkage.getPhoneState('user-1');
    assert.equal(state.phoneVerified, true);
    assert.equal(state.phoneNumber, '+254700000123');
    assert.ok(state.phoneVerifiedAt);
    assert.equal(state.phoneLoginEnabled, true);
    assert.equal(state.phoneRecoveryEnabled, true);
});

test('an unverified phone never becomes usable for login or recovery', () => {
    const { linkage } = makeLinkage({ deliveryRegistry: makeConfiguredDeliveryRegistryDouble() });
    assert.equal(linkage.isPhoneLoginUsable('user-2'), false);
    assert.equal(linkage.isPhoneRecoveryUsable('user-2'), false);
});

test('confirmLink() rejects a wrong code and leaves the account unverified', async () => {
    const { linkage } = makeLinkage();
    await linkage.requestLink('user-3', '+254700000456');
    const result = await linkage.confirmLink('user-3', '+254700000456', '000000');
    assert.equal(result.linked, false);
    assert.equal(linkage.getPhoneState('user-3').phoneVerified, false);
});

test('confirmLink() rejects a replayed (already-used) code', async () => {
    const { linkage } = makeLinkage();
    const { _test_rawCode } = await linkage.requestLink('user-4', '+254700000789');
    const first = await linkage.confirmLink('user-4', '+254700000789', _test_rawCode);
    assert.equal(first.linked, true);
    const second = await linkage.confirmLink('user-4', '+254700000789', _test_rawCode);
    assert.equal(second.linked, false);
    assert.equal(second.reason, 'USED');
});

test('confirmLink() rejects linking a phone already verified on a different account (takeover guard)', async () => {
    const { linkage } = makeLinkage();
    const first = await linkage.requestLink('user-5', '+254700111222');
    const firstConfirm = await linkage.confirmLink('user-5', '+254700111222', first._test_rawCode);
    assert.equal(firstConfirm.linked, true);

    const second = await linkage.requestLink('user-6', '+254700111222');
    const secondConfirm = await linkage.confirmLink('user-6', '+254700111222', second._test_rawCode);
    assert.equal(secondConfirm.linked, false);
    assert.equal(secondConfirm.reason, 'PHONE_ALREADY_LINKED');
    // The original owner's link must remain untouched.
    assert.equal(linkage.getPhoneState('user-5').phoneVerified, true);
    assert.equal(linkage.getPhoneState('user-6').phoneVerified, false);
});

test('requestLink() and confirmLink() are enumeration-safe (no userId, no phone)', async () => {
    const { linkage } = makeLinkage();
    const r1 = await linkage.requestLink(null, '+254700000001');
    const r2 = await linkage.requestLink('user-7', 'not-a-phone-!!!');
    assert.equal(r1.status, 'CHALLENGE_REQUESTED');
    assert.equal(r2.status, 'CHALLENGE_REQUESTED');
    const c1 = await linkage.confirmLink(null, '+254700000001', '123456');
    assert.equal(c1.linked, false);
    assert.equal(c1.reason, 'AUTH_REQUIRED');
});

test('a verified phone is only login/recovery-usable when a real SMS backend is actually configured', async () => {
    const unconfigured = makeLinkage({ deliveryRegistry: makeUnconfiguredDeliveryRegistryDouble() });
    const { _test_rawCode: code1 } = await unconfigured.linkage.requestLink('user-8', '+254700333444');
    await unconfigured.linkage.confirmLink('user-8', '+254700333444', code1);
    assert.equal(unconfigured.linkage.getPhoneState('user-8').phoneVerified, true);
    assert.equal(unconfigured.linkage.isPhoneLoginUsable('user-8'), false, 'no SMS backend registered — must fail closed even though the phone is verified');
    assert.equal(unconfigured.linkage.isPhoneRecoveryUsable('user-8'), false);

    const configured = makeLinkage({ deliveryRegistry: makeConfiguredDeliveryRegistryDouble() });
    const { _test_rawCode: code2 } = await configured.linkage.requestLink('user-9', '+254700555666');
    await configured.linkage.confirmLink('user-9', '+254700555666', code2);
    assert.equal(configured.linkage.isPhoneLoginUsable('user-9'), true);
    assert.equal(configured.linkage.isPhoneRecoveryUsable('user-9'), true);
});

test('a linkage composed with no delivery registry at all fails closed (never usable)', async () => {
    const { linkage } = makeLinkage(); // no deliveryRegistry passed
    const { _test_rawCode } = await linkage.requestLink('user-10', '+254700777888');
    await linkage.confirmLink('user-10', '+254700777888', _test_rawCode);
    assert.equal(linkage.isPhoneLoginUsable('user-10'), false);
});

test('revokePhone() resets all derived state so a stale verified phone can never linger as usable', async () => {
    const { linkage } = makeLinkage({ deliveryRegistry: makeConfiguredDeliveryRegistryDouble() });
    const { _test_rawCode } = await linkage.requestLink('user-11', '+254700999000');
    await linkage.confirmLink('user-11', '+254700999000', _test_rawCode);
    assert.equal(linkage.isPhoneLoginUsable('user-11'), true);

    linkage.revokePhone('user-11');
    const state = linkage.getPhoneState('user-11');
    assert.equal(state.phoneVerified, false);
    assert.equal(state.phoneNumber, null);
    assert.equal(linkage.isPhoneLoginUsable('user-11'), false);
});

test('constructing without a real challengeService or store fails closed at construction time', () => {
    assert.throws(() => new CozyPhoneAccountLinkage({}), /challengeService/);
    const challengeService = new CozyPhoneChallengeService({});
    assert.throws(() => new CozyPhoneAccountLinkage({ challengeService }), /store adapter/);
});
