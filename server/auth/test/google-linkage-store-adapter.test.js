'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { GoogleLinkageStoreAdapter } = require('../google-linkage-store-adapter');

function tempFilePath() {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cozyos-google-linkage-')), 'google-linkages.json');
}

test('construction requires a real filePath', () => {
    assert.throws(() => new GoogleLinkageStoreAdapter({}), /A real filePath is required/);
});

test('first run creates a valid empty file at the given path', () => {
    const filePath = tempFilePath();
    assert.equal(fs.existsSync(filePath), false);
    new GoogleLinkageStoreAdapter({ filePath });
    assert.equal(fs.existsSync(filePath), true);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.deepEqual(parsed, {});
});

test('unknown user returns null, not a fabricated record', () => {
    const adapter = new GoogleLinkageStoreAdapter({ filePath: tempFilePath() });
    assert.equal(adapter.getRecord('nobody'), null);
    assert.equal(adapter.findUserIdByGoogleUid('some-uid'), null);
});

test('setRecord persists synchronously and survives real adapter destroy/recreate (real reload/restart simulation)', () => {
    const filePath = tempFilePath();
    const adapter1 = new GoogleLinkageStoreAdapter({ filePath });
    adapter1.setRecord('user-1', { googleUid: 'g-uid-1', googleEmail: 'a@example.com', googleLinked: true, googleLoginEnabled: true });
    // Synchronous — the on-disk file must already be correct before setRecord() returns, no waiting.
    const onDisk = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(onDisk['user-1'].googleUid, 'g-uid-1');

    // Real destroy/recreate against the same file.
    const adapter2 = new GoogleLinkageStoreAdapter({ filePath });
    const recovered = adapter2.getRecord('user-1');
    assert.ok(recovered);
    assert.equal(recovered.googleUid, 'g-uid-1');
    assert.equal(recovered.googleLinked, true);
});

test('findUserIdByGoogleUid finds the real owner and survives adapter recreation', () => {
    const filePath = tempFilePath();
    const adapter1 = new GoogleLinkageStoreAdapter({ filePath });
    adapter1.setRecord('user-A', { googleUid: 'g-uid-9', googleLinked: true, googleLoginEnabled: true });

    const adapter2 = new GoogleLinkageStoreAdapter({ filePath });
    assert.equal(adapter2.findUserIdByGoogleUid('g-uid-9'), 'user-A');
});

test('corrupted backing file fails closed at construction (never silently starts empty)', () => {
    const filePath = tempFilePath();
    fs.writeFileSync(filePath, '{ this is not valid JSON', 'utf8');
    assert.throws(() => new GoogleLinkageStoreAdapter({ filePath }), /invalid JSON/);
});

test('backing file that is valid JSON but not an object fails closed', () => {
    const filePath = tempFilePath();
    fs.writeFileSync(filePath, '[1,2,3]', 'utf8');
    assert.throws(() => new GoogleLinkageStoreAdapter({ filePath }), /does not contain a JSON object/);
});

test('record replacement is reflected immediately and survives reload', () => {
    const filePath = tempFilePath();
    const adapter1 = new GoogleLinkageStoreAdapter({ filePath });
    adapter1.setRecord('user-1', { googleUid: 'g-uid-old', googleLinked: true, googleLoginEnabled: true });
    assert.equal(adapter1.findUserIdByGoogleUid('g-uid-old'), 'user-1');

    // Real unlink then relink to a different Google identity, same user.
    adapter1.setRecord('user-1', { googleUid: null, googleLinked: false, googleLoginEnabled: false });
    assert.equal(adapter1.findUserIdByGoogleUid('g-uid-old'), null);

    adapter1.setRecord('user-1', { googleUid: 'g-uid-new', googleLinked: true, googleLoginEnabled: true });
    const adapter2 = new GoogleLinkageStoreAdapter({ filePath });
    assert.equal(adapter2.findUserIdByGoogleUid('g-uid-new'), 'user-1');
    assert.equal(adapter2.findUserIdByGoogleUid('g-uid-old'), null);
});
