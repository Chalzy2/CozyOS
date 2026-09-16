'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PhoneLinkageStoreAdapter } = require('../phone-linkage-store-adapter');
const { CozyPhoneChallengeService } = require('../phone-provider');
const { CozyPhoneAccountLinkage } = require('../phone-account-linkage');

/**
 * FakeIdentityStorage — a test-controlled fixture matching
 * CozyIdentityStorage's real async contract exactly
 * (save(storeName, record) -> {success, reason?},
 *  loadAll(storeName) -> {success, records, reason?}) — this is NOT
 * a production store and is never used outside this test file
 * (Prompt 9B §7).
 */
class FakeIdentityStorage {
    constructor({ failSave = false, failLoad = false } = {}) {
        this._data = new Map(); // storeName -> Map(id -> record)
        this._failSave = failSave;
        this._failLoad = failLoad;
    }
    async save(storeName, record) {
        if (this._failSave) return { success: false, reason: 'SIMULATED_SAVE_FAILURE' };
        if (!record || !record.id) return { success: false, reason: 'record.id is required as the real storage key.' };
        if (!this._data.has(storeName)) this._data.set(storeName, new Map());
        this._data.get(storeName).set(record.id, { ...record });
        return { success: true };
    }
    async loadAll(storeName) {
        if (this._failLoad) return { success: false, reason: 'SIMULATED_LOAD_FAILURE', records: [] };
        const store = this._data.get(storeName);
        return { success: true, records: store ? [...store.values()] : [] };
    }
}

function verifiedRecord(phoneNumber) {
    return { phoneNumber, phoneVerified: true, phoneVerifiedAt: new Date().toISOString(), phoneLoginEnabled: true, phoneRecoveryEnabled: true };
}

test('construction requires a real IdentityStorage-shaped dependency', () => {
    assert.throws(() => new PhoneLinkageStoreAdapter({}), /A real IdentityStorage instance/);
    assert.throws(() => new PhoneLinkageStoreAdapter({ identityStorage: { save: () => {} } }), /A real IdentityStorage instance/);
});

test('every method fails closed (throws) before initialize() resolves', async () => {
    const adapter = new PhoneLinkageStoreAdapter({ identityStorage: new FakeIdentityStorage() });
    assert.equal(adapter.isReady(), false);
    assert.throws(() => adapter.getRecord('u1'), /Not initialized/);
    assert.throws(() => adapter.setRecord('u1', verifiedRecord('254700000001')), /Not initialized/);
    assert.throws(() => adapter.findUserIdByVerifiedPhone('254700000001'), /Not initialized/);
    await adapter.initialize();
    assert.equal(adapter.isReady(), true);
});

test('hydration failure never marks the adapter ready — fails closed permanently for this instance', async () => {
    const adapter = new PhoneLinkageStoreAdapter({ identityStorage: new FakeIdentityStorage({ failLoad: true }) });
    await assert.rejects(() => adapter.initialize(), /Hydration failed/);
    assert.equal(adapter.isReady(), false);
    assert.throws(() => adapter.getRecord('u1'), /Not initialized/);
});

test('setRecord() persists synchronously in-memory and survives adapter destroy/recreate (real reload simulation)', async () => {
    const identityStorage = new FakeIdentityStorage();

    const adapter1 = new PhoneLinkageStoreAdapter({ identityStorage });
    await adapter1.initialize();
    adapter1.setRecord('user-1', verifiedRecord('254700000001'));
    // setRecord is synchronous — the in-memory read must be correct immediately, no await.
    assert.equal(adapter1.getRecord('user-1').phoneVerified, true);

    // Let the background write-through actually complete before "destroying" the adapter.
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Simulate destroy/reload: brand-new adapter instance, same backing store.
    const adapter2 = new PhoneLinkageStoreAdapter({ identityStorage });
    await adapter2.initialize();
    const recovered = adapter2.getRecord('user-1');
    assert.ok(recovered);
    assert.equal(recovered.phoneNumber, '254700000001');
    assert.equal(recovered.phoneVerified, true);
});

test('unknown user returns null, not a fabricated record', async () => {
    const adapter = new PhoneLinkageStoreAdapter({ identityStorage: new FakeIdentityStorage() });
    await adapter.initialize();
    assert.equal(adapter.getRecord('nobody'), null);
    assert.equal(adapter.findUserIdByVerifiedPhone('254700000001'), null);
});

test('findUserIdByVerifiedPhone finds the real owner and survives adapter recreation', async () => {
    const identityStorage = new FakeIdentityStorage();
    const adapter1 = new PhoneLinkageStoreAdapter({ identityStorage });
    await adapter1.initialize();
    adapter1.setRecord('user-A', verifiedRecord('254700000009'));
    await new Promise((resolve) => setTimeout(resolve, 10));

    const adapter2 = new PhoneLinkageStoreAdapter({ identityStorage });
    await adapter2.initialize();
    assert.equal(adapter2.findUserIdByVerifiedPhone('254700000009'), 'user-A');
});

test('persistence failure does not corrupt synchronous in-memory state (in-memory remains authoritative for the session)', async () => {
    const identityStorage = new FakeIdentityStorage({ failSave: true });
    const adapter = new PhoneLinkageStoreAdapter({ identityStorage });
    await adapter.initialize();
    adapter.setRecord('user-1', verifiedRecord('254700000001'));
    // In-memory read must still reflect the write even though the
    // background persist is failing.
    assert.equal(adapter.getRecord('user-1').phoneVerified, true);
    assert.equal(adapter.findUserIdByVerifiedPhone('254700000001'), 'user-1');
});

test('REAL END-TO-END: CozyPhoneAccountLinkage composed with this adapter — cross-account phone collision genuinely rejected', async () => {
    const identityStorage = new FakeIdentityStorage();
    const adapter = new PhoneLinkageStoreAdapter({ identityStorage });
    await adapter.initialize();

    const challengeService = new CozyPhoneChallengeService({});
    const linkage = new CozyPhoneAccountLinkage({ challengeService, store: adapter });

    const req1 = await linkage.requestLink('user-A', '+254 700 000 002');
    const code1 = req1._test_rawCode;
    assert.ok(code1, 'test challenge service must expose the real generated code for local verification');
    const link1 = await linkage.confirmLink('user-A', '+254 700 000 002', code1);
    assert.equal(link1.linked, true);

    // A second, different account genuinely solves a real challenge
    // for the SAME phone number — must be rejected, not silently
    // re-linked, per confirmLink()'s own account-takeover guard.
    const req2 = await linkage.requestLink('user-B', '+254 700 000 002');
    const code2 = req2._test_rawCode;
    const link2 = await linkage.confirmLink('user-B', '+254 700 000 002', code2);
    assert.equal(link2.linked, false);
    assert.equal(link2.reason, 'PHONE_ALREADY_LINKED');

    // Real state check straight through the adapter, not just the linkage class's return value.
    // normalizePhone() preserves a leading "+" when the input had one.
    assert.equal(adapter.findUserIdByVerifiedPhone('+254700000002'), 'user-A');
    assert.equal(linkage.getPhoneState('user-B').phoneVerified, false);

    // Survives a real adapter destroy/recreate against the same backing IdentityStorage fixture.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const adapter2 = new PhoneLinkageStoreAdapter({ identityStorage });
    await adapter2.initialize();
    assert.equal(adapter2.findUserIdByVerifiedPhone('+254700000002'), 'user-A');
});
