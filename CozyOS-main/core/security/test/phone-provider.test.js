'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CozyPhoneChallengeService } = require('../phone-provider');

function makeDeliveryRegistryDouble() {
    const dispatched = [];
    return {
        dispatched,
        async dispatch(channel, payload) {
            dispatched.push({ channel, payload });
            return { delivered: true };
        }
    };
}

test('requestPhoneChallenge returns the identical generic response for any phone (enumeration-safe shape)', async () => {
    const service = new CozyPhoneChallengeService({});
    const a = await service.requestPhoneChallenge('+254700000001');
    const b = await service.requestPhoneChallenge('+254700000002');
    assert.equal(a.status, b.status);
    assert.equal(a.message, b.message);
});

test('a freshly issued challenge verifies with the correct code', async () => {
    const service = new CozyPhoneChallengeService({});
    const phone = '+254700000123';
    const { _test_rawCode } = await service.requestPhoneChallenge(phone);
    assert.match(_test_rawCode, /^\d{6}$/);
    const result = await service.verifyPhoneChallenge(phone, _test_rawCode);
    assert.equal(result.verified, true);
    assert.equal(result.state, 'VERIFIED');
    assert.equal(result.phone, phone);
});

test('wrong code is rejected without revealing the real code', async () => {
    const service = new CozyPhoneChallengeService({});
    const phone = '+254700000456';
    await service.requestPhoneChallenge(phone);
    const result = await service.verifyPhoneChallenge(phone, '000000');
    assert.equal(result.verified, false);
    assert.equal(result.state, 'INVALID');
});

test('a challenge can only be used once (replay protection)', async () => {
    const service = new CozyPhoneChallengeService({});
    const phone = '+254700000789';
    const { _test_rawCode } = await service.requestPhoneChallenge(phone);
    const first = await service.verifyPhoneChallenge(phone, _test_rawCode);
    assert.equal(first.verified, true);
    const second = await service.verifyPhoneChallenge(phone, _test_rawCode);
    assert.equal(second.verified, false);
    assert.equal(second.state, 'USED');
});

test('requesting a new challenge supersedes the previous one for the same phone — the old code no longer works, only the newest one does', async () => {
    const service = new CozyPhoneChallengeService({});
    const phone = '+254700000999';
    const first = await service.requestPhoneChallenge(phone);
    const second = await service.requestPhoneChallenge(phone);
    const attemptOnFirst = await service.verifyPhoneChallenge(phone, first._test_rawCode);
    assert.equal(attemptOnFirst.verified, false);
    const attemptOnSecond = await service.verifyPhoneChallenge(phone, second._test_rawCode);
    assert.equal(attemptOnSecond.verified, true);
});

test('a code cannot verify against a different phone number than it was issued for', async () => {
    const service = new CozyPhoneChallengeService({});
    const { _test_rawCode } = await service.requestPhoneChallenge('+254700111111');
    const result = await service.verifyPhoneChallenge('+254700222222', _test_rawCode);
    assert.equal(result.verified, false);
    assert.equal(result.state, 'INVALID');
});

test('too many wrong attempts locks the challenge out (max-attempts protection), even with the correct code afterward', async () => {
    const service = new CozyPhoneChallengeService({});
    const phone = '+254700333333';
    const { _test_rawCode } = await service.requestPhoneChallenge(phone);
    let last;
    for (let i = 0; i < 5; i++) last = await service.verifyPhoneChallenge(phone, '111111');
    assert.equal(last.state, 'LOCKED');
    const withCorrectCode = await service.verifyPhoneChallenge(phone, _test_rawCode);
    assert.equal(withCorrectCode.verified, false);
    assert.equal(withCorrectCode.state, 'LOCKED');
});

test('an expired challenge is rejected even with the correct code', async (t) => {
    t.mock.timers.enable({ apis: ['Date'] });
    const service = new CozyPhoneChallengeService({});
    const phone = '+254700444444';
    const { _test_rawCode } = await service.requestPhoneChallenge(phone);
    t.mock.timers.tick(6 * 60 * 1000); // past the 5-minute TTL
    const result = await service.verifyPhoneChallenge(phone, _test_rawCode);
    assert.equal(result.verified, false);
    assert.equal(result.state, 'EXPIRED');
});

test('requestPhoneChallenge dispatches through the DeliveryBackendRegistry on channel "sms" when one is composed', async () => {
    const registry = makeDeliveryRegistryDouble();
    const service = new CozyPhoneChallengeService({ deliveryRegistry: registry });
    const phone = '+254700555555';
    const { _test_rawCode } = await service.requestPhoneChallenge(phone);
    await new Promise(r => setTimeout(r, 0)); // let the non-awaited dispatch settle
    assert.equal(registry.dispatched.length, 1);
    assert.equal(registry.dispatched[0].channel, 'sms');
    assert.equal(registry.dispatched[0].payload.phone, phone);
    assert.equal(registry.dispatched[0].payload.rawCode, _test_rawCode);
});

test('rate limiting kicks in after too many requests for the same phone', async () => {
    const service = new CozyPhoneChallengeService({});
    const phone = '+254700666666';
    let last;
    for (let i = 0; i < 6; i++) last = await service.requestPhoneChallenge(phone);
    assert.equal(last.rateLimited, true);
});

test('getDiagnosticsReport never claims SMS delivery is verified', () => {
    const service = new CozyPhoneChallengeService({});
    const report = service.getDiagnosticsReport();
    assert.equal(report.smsDeliveryVerified, false);
});
