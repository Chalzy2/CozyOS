'use strict';

/**
 * core/plugins/tests/pharmacyOS-core.test.js
 * PharmacyOS Phase 1 - real regression coverage.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const ORG_REGISTRY_PATH = path.join(ROOT, 'core', 'organization', 'organization-registry.js');
const PHARMACY_PATH = path.join(ROOT, 'core', 'plugins', 'pharmacyOS-core.js');

function freshStack({ withIdentity = true, grantControlled = false } = {}) {
    [ORG_REGISTRY_PATH, PHARMACY_PATH].forEach((p) => delete require.cache[require.resolve(p)]);
    const grants = new Set();
    if (grantControlled) grants.add('pharmacy.controlled.manage');
    const fakeWindow = {
        CozyOS: {
            listApplications: () => [],
            IdentityEngine: withIdentity ? {
                checkPermission: (userId, perm) => grants.has(perm)
            } : null,
        },
    };
    global.window = fakeWindow;
    require(ORG_REGISTRY_PATH);
    require(PHARMACY_PATH);
    return fakeWindow;
}

test('1. Real ServiceRegistry-shaped registration metadata is present (visibility block, appId)', () => {
    const win = freshStack();
    assert.equal(win.CozyOS.PharmacyOS.visibility.appId, 'pharmacyOS');
    assert.equal(win.CozyOS.PharmacyOS.visibility.category, 'business-application');
});

test('2. setupPharmacy() creates a real organization via the real, unmodified OrganizationRegistry', () => {
    const win = freshStack();
    const org = win.CozyOS.PharmacyOS.setupPharmacy({ name: 'Test Pharmacy' });
    assert.ok(org.orgId);
    assert.equal(win.CozyOS.OrganizationRegistry.organizationExists(org.orgId), true);
});

test('3. Ordinary medicine creation succeeds without any special permission', () => {
    const win = freshStack({ withIdentity: false });
    const org = win.CozyOS.PharmacyOS.setupPharmacy({ name: 'Test Pharmacy' });
    const med = win.CozyOS.PharmacyOS.createMedicine({ orgId: org.orgId, name: 'Paracetamol', category: 'Analgesic' });
    assert.equal(med.name, 'Paracetamol');
    assert.equal(med.isControlledSubstance, false);
});

test('4. Controlled-substance creation is denied (fail-closed) without a real granted permission', () => {
    const win = freshStack({ grantControlled: false });
    const org = win.CozyOS.PharmacyOS.setupPharmacy({ name: 'Test Pharmacy' });
    assert.throws(() => win.CozyOS.PharmacyOS.createMedicine({ orgId: org.orgId, actorId: 'user-1', name: 'Morphine', isControlledSubstance: true }), /controlled-substance access denied/);
});

test('5. Controlled-substance creation succeeds with a real granted IdentityEngine permission', () => {
    const win = freshStack({ grantControlled: true });
    const org = win.CozyOS.PharmacyOS.setupPharmacy({ name: 'Test Pharmacy' });
    const med = win.CozyOS.PharmacyOS.createMedicine({ orgId: org.orgId, actorId: 'user-1', name: 'Morphine', isControlledSubstance: true });
    assert.equal(med.isControlledSubstance, true);
});

test('6. listMedicines() honestly excludes controlled substances for a caller without the real permission', () => {
    const win = freshStack({ grantControlled: true });
    const org = win.CozyOS.PharmacyOS.setupPharmacy({ name: 'Test Pharmacy' });
    win.CozyOS.PharmacyOS.createMedicine({ orgId: org.orgId, actorId: 'admin', name: 'Paracetamol' });
    win.CozyOS.PharmacyOS.createMedicine({ orgId: org.orgId, actorId: 'admin', name: 'Morphine', isControlledSubstance: true });
    win.CozyOS.IdentityEngine.checkPermission = () => false;
    const list = win.CozyOS.PharmacyOS.listMedicines({ orgId: org.orgId, actorId: 'user-2' });
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Paracetamol');
});

test('7. getMedicine() honestly denies a controlled-substance record to an unauthorized caller', () => {
    const win = freshStack({ grantControlled: true });
    const org = win.CozyOS.PharmacyOS.setupPharmacy({ name: 'Test Pharmacy' });
    const med = win.CozyOS.PharmacyOS.createMedicine({ orgId: org.orgId, actorId: 'admin', name: 'Morphine', isControlledSubstance: true });
    win.CozyOS.IdentityEngine.checkPermission = () => false;
    const result = win.CozyOS.PharmacyOS.getMedicine(med.medicineId, 'user-2');
    assert.equal(result.available, false);
});

test('8. updateMedicine() fails closed for a controlled record without the real permission', () => {
    const win = freshStack({ grantControlled: true });
    const org = win.CozyOS.PharmacyOS.setupPharmacy({ name: 'Test Pharmacy' });
    const med = win.CozyOS.PharmacyOS.createMedicine({ orgId: org.orgId, actorId: 'admin', name: 'Morphine', isControlledSubstance: true });
    win.CozyOS.IdentityEngine.checkPermission = () => false;
    assert.throws(() => win.CozyOS.PharmacyOS.updateMedicine(med.medicineId, { category: 'X' }, 'user-2'));
});

test('9. Every mutation produces a real audit entry', () => {
    const win = freshStack();
    const org = win.CozyOS.PharmacyOS.setupPharmacy({ name: 'Test Pharmacy', actorId: 'admin' });
    win.CozyOS.PharmacyOS.createMedicine({ orgId: org.orgId, actorId: 'admin', name: 'Paracetamol' });
    const log = win.CozyOS.PharmacyOS.getAuditLog();
    assert.ok(log.some((e) => e.action === 'PHARMACY_SETUP'));
    assert.ok(log.some((e) => e.action === 'MEDICINE_CREATED'));
});

test('10. createMedicine() honestly rejects an unknown/unregistered organization', () => {
    const win = freshStack();
    assert.throws(() => win.CozyOS.PharmacyOS.createMedicine({ orgId: 'fake_org', name: 'X' }), /unknown organization/);
});

test('11. No authorization side effect: creating an ordinary medicine never touches IdentityEngine permission state', () => {
    const win = freshStack({ withIdentity: true, grantControlled: false });
    const org = win.CozyOS.PharmacyOS.setupPharmacy({ name: 'Test Pharmacy' });
    let calls = 0;
    const realCheck = win.CozyOS.IdentityEngine.checkPermission;
    win.CozyOS.IdentityEngine.checkPermission = (...args) => { calls++; return realCheck(...args); };
    win.CozyOS.PharmacyOS.createMedicine({ orgId: org.orgId, name: 'Paracetamol' });
    assert.equal(calls, 0, 'ordinary medicine creation must not invoke a permission check at all');
});

test('12. No credential/secret field is ever present on a medicine or audit record', () => {
    const win = freshStack();
    const org = win.CozyOS.PharmacyOS.setupPharmacy({ name: 'Test Pharmacy' });
    const med = win.CozyOS.PharmacyOS.createMedicine({ orgId: org.orgId, name: 'Paracetamol' });
    const serialized = JSON.stringify({ med, log: win.CozyOS.PharmacyOS.getAuditLog() }).toLowerCase();
    assert.ok(!/password|api[_-]?key|secret|token|credential/.test(serialized));
});
