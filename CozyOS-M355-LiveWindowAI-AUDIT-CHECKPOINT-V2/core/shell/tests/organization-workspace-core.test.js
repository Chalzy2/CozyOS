/**
 * core/shell/tests/organization-workspace-core.test.js
 * Run with: node --test core/shell/tests/organization-workspace-core.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CORE_PATH = path.join(__dirname, '..', 'organization-workspace-core.js');

function load() {
    delete require.cache[require.resolve(CORE_PATH)];
    global.window = { CozyOS: {} };
    require(CORE_PATH);
    return global.window.CozyOS.OrganizationWorkspaceCore;
}

const {
    SECTION,
    resolveVisibleSections,
    resolveWorkforceControls,
    resolveApplicationControls,
    functionPermissionName,
    isFunctionEnabled,
    canAttemptOrganizationSwitch,
    resolveWorkspacePresentation,
} = load();

// ---------- fixtures: real-shaped POST /organizations/context responses ----------

function orgAdminContext(overrides = {}) {
    return {
        ok: true,
        organizationId: 'org-c',
        organizationName: 'ORG-C',
        membershipId: 'm-1',
        status: 'active',
        roles: ['owner'],
        applications: ['MpesaOS'],
        permissions: [],
        isOrgAdmin: true,
        canManageWorkforce: true,
        canReadWorkforce: true,
        canManageApplications: true,
        canManagePermissions: true,
        ...overrides,
    };
}

function cashierContext(overrides = {}) {
    return {
        ok: true,
        organizationId: 'org-b',
        organizationName: 'ORG-B',
        membershipId: 'm-2',
        status: 'active',
        roles: ['cashier'],
        applications: ['MpesaOS'],
        permissions: [{ name: 'app:MpesaOS:Transactions', effect: 'allow' }],
        isOrgAdmin: false,
        canManageWorkforce: false,
        canReadWorkforce: false,
        canManageApplications: false,
        canManagePermissions: false,
        ...overrides,
    };
}

// ---------- resolveVisibleSections ----------

test('org admin (James in ORG-C, owner) sees every section', () => {
    const sections = resolveVisibleSections(orgAdminContext());
    assert.deepEqual(sections, [
        SECTION.WORKFORCE, SECTION.APPLICATIONS, SECTION.ENTITLEMENTS,
        SECTION.BUSINESS, SECTION.INTELLIGENCE, SECTION.ADMINISTRATIVE_REQUESTS,
    ]);
});

test('plain worker (James as cashier in ORG-B) sees no sections at all — only their own assigned applications, which is a separate concern', () => {
    const sections = resolveVisibleSections(cashierContext());
    assert.deepEqual(sections, []);
});

test('a worker granted workforce READ (but not manage) sees only WORKFORCE', () => {
    const sections = resolveVisibleSections(cashierContext({ canReadWorkforce: true }));
    assert.deepEqual(sections, [SECTION.WORKFORCE]);
});

test('canManageApplications alone (no other capability) surfaces only APPLICATIONS, never WORKFORCE/ENTITLEMENTS/BUSINESS', () => {
    const sections = resolveVisibleSections(cashierContext({ canManageApplications: true }));
    assert.deepEqual(sections, [SECTION.APPLICATIONS]);
});

test('a suspended/removed/inactive context (any status !== "active") gets zero sections regardless of capability flags', () => {
    const suspended = orgAdminContext({ status: 'suspended' });
    assert.deepEqual(resolveVisibleSections(suspended), []);
});

test('null/undefined/malformed context yields zero sections, fails closed', () => {
    assert.deepEqual(resolveVisibleSections(null), []);
    assert.deepEqual(resolveVisibleSections(undefined), []);
    assert.deepEqual(resolveVisibleSections('not-an-object'), []);
});

test('isOrgAdmin as a truthy non-boolean (tampered client state) never grants BUSINESS/INTELLIGENCE/ADMIN_REQUESTS — strict === true only', () => {
    const sections = resolveVisibleSections(cashierContext({ isOrgAdmin: 1 }));
    assert.ok(!sections.includes(SECTION.BUSINESS));
    assert.ok(!sections.includes(SECTION.INTELLIGENCE));
    assert.ok(!sections.includes(SECTION.ADMINISTRATIVE_REQUESTS));
});

// ---------- resolveWorkforceControls ----------

test('org admin gets full workforce controls', () => {
    const controls = resolveWorkforceControls(orgAdminContext());
    assert.deepEqual(controls, { canView: true, canInvite: true, canManageRoles: true, canManageMembership: true });
});

test('worker with no workforce capability gets all-false controls, including canView', () => {
    const controls = resolveWorkforceControls(cashierContext());
    assert.deepEqual(controls, { canView: false, canInvite: false, canManageRoles: false, canManageMembership: false });
});

test('a worker with read-only workforce access can view but not edit', () => {
    const controls = resolveWorkforceControls(cashierContext({ canReadWorkforce: true }));
    assert.equal(controls.canView, true);
    assert.equal(controls.canInvite, false);
    assert.equal(controls.canManageRoles, false);
    assert.equal(controls.canManageMembership, false);
});

test('inactive context gets all-false workforce controls', () => {
    const controls = resolveWorkforceControls(orgAdminContext({ status: 'removed' }));
    assert.deepEqual(controls, { canView: false, canInvite: false, canManageRoles: false, canManageMembership: false });
});

// ---------- resolveApplicationControls ----------

test('worker sees their real assigned applications but cannot assign/remove', () => {
    const controls = resolveApplicationControls(cashierContext());
    assert.deepEqual(controls.assignedApplications, ['MpesaOS']);
    assert.equal(controls.canAssign, false);
    assert.equal(controls.canRemove, false);
});

test('org admin sees assigned applications AND can assign/remove', () => {
    const controls = resolveApplicationControls(orgAdminContext());
    assert.deepEqual(controls.assignedApplications, ['MpesaOS']);
    assert.equal(controls.canAssign, true);
    assert.equal(controls.canRemove, true);
});

test('a missing/malformed applications array never throws, resolves to an empty list', () => {
    const controls = resolveApplicationControls(cashierContext({ applications: 'MpesaOS' }));
    assert.deepEqual(controls.assignedApplications, []);
});

test('inactive context gets no assigned applications and no controls', () => {
    const controls = resolveApplicationControls(cashierContext({ status: 'invited' }));
    assert.deepEqual(controls, { assignedApplications: [], canAssign: false, canRemove: false });
});

test('mutating the returned assignedApplications array never mutates the original context.applications (real copy, not a reference)', () => {
    const ctx = cashierContext();
    const controls = resolveApplicationControls(ctx);
    controls.assignedApplications.push('ShopOS');
    assert.deepEqual(ctx.applications, ['MpesaOS']);
});

// ---------- function-level entitlement (app:<id>:<functionId>) ----------

test('functionPermissionName() produces the documented app:<applicationId>:<functionId> shape', () => {
    assert.equal(functionPermissionName('MpesaOS', 'Transactions'), 'app:MpesaOS:Transactions');
});

test('James in ORG-B: Transactions explicitly allowed -> enabled; Receipts absent (no entry) -> disabled (deny-by-default, no role fallback)', () => {
    const ctx = cashierContext({ permissions: [{ name: 'app:MpesaOS:Transactions', effect: 'allow' }] });
    assert.equal(isFunctionEnabled(ctx, 'MpesaOS', 'Transactions'), true);
    assert.equal(isFunctionEnabled(ctx, 'MpesaOS', 'Receipts'), false);
    assert.equal(isFunctionEnabled(ctx, 'MpesaOS', 'Reports'), false);
    assert.equal(isFunctionEnabled(ctx, 'MpesaOS', 'Float'), false);
    assert.equal(isFunctionEnabled(ctx, 'MpesaOS', 'Till'), false);
    assert.equal(isFunctionEnabled(ctx, 'MpesaOS', 'Paybill'), false);
});

test('an explicit deny entry wins even if an allow entry also somehow exists for the same name (deny-over-allow)', () => {
    const ctx = cashierContext({
        permissions: [
            { name: 'app:MpesaOS:Float', effect: 'allow' },
            { name: 'app:MpesaOS:Float', effect: 'deny' },
        ],
    });
    assert.equal(isFunctionEnabled(ctx, 'MpesaOS', 'Float'), false);
});

test('a function is never enabled for an application the member was not actually assigned, even with an allow permission entry', () => {
    const ctx = cashierContext({
        applications: ['MpesaOS'],
        permissions: [{ name: 'app:ShopOS:Sales', effect: 'allow' }],
    });
    assert.equal(isFunctionEnabled(ctx, 'ShopOS', 'Sales'), false);
});

test('org-admin role never role-defaults a function permission the way org:-prefixed capabilities do — still requires an explicit allow', () => {
    const ctx = orgAdminContext({ permissions: [] });
    assert.equal(isFunctionEnabled(ctx, 'MpesaOS', 'Transactions'), false);
});

test('inactive membership never has any function enabled, even with allow entries present', () => {
    const ctx = cashierContext({ status: 'suspended', permissions: [{ name: 'app:MpesaOS:Transactions', effect: 'allow' }] });
    assert.equal(isFunctionEnabled(ctx, 'MpesaOS', 'Transactions'), false);
});

// ---------- canAttemptOrganizationSwitch (pre-check only) ----------

test('an active candidate membership permits attempting a switch', () => {
    assert.equal(canAttemptOrganizationSwitch({ organizationId: 'org-b', status: 'active' }), true);
});

test('a suspended/invited/removed candidate membership does not permit attempting a switch', () => {
    assert.equal(canAttemptOrganizationSwitch({ organizationId: 'org-b', status: 'suspended' }), false);
    assert.equal(canAttemptOrganizationSwitch({ organizationId: 'org-b', status: 'invited' }), false);
    assert.equal(canAttemptOrganizationSwitch({ organizationId: 'org-b', status: 'removed' }), false);
});

test('null/undefined candidate membership does not permit attempting a switch', () => {
    assert.equal(canAttemptOrganizationSwitch(null), false);
    assert.equal(canAttemptOrganizationSwitch(undefined), false);
});

// ---------- resolveWorkspacePresentation (composed view) ----------

test('resolveWorkspacePresentation composes org identity + sections + controls for an org admin', () => {
    const presentation = resolveWorkspacePresentation(orgAdminContext());
    assert.equal(presentation.organizationId, 'org-c');
    assert.equal(presentation.organizationName, 'ORG-C');
    assert.equal(presentation.isOrgAdmin, true);
    assert.deepEqual(presentation.sections, [
        SECTION.WORKFORCE, SECTION.APPLICATIONS, SECTION.ENTITLEMENTS,
        SECTION.BUSINESS, SECTION.INTELLIGENCE, SECTION.ADMINISTRATIVE_REQUESTS,
    ]);
    assert.equal(presentation.workforce.canManageMembership, true);
    assert.deepEqual(presentation.applicationControls.assignedApplications, ['MpesaOS']);
});

test('resolveWorkspacePresentation for a worker shows the identity fields but no sections and no edit controls', () => {
    const presentation = resolveWorkspacePresentation(cashierContext());
    assert.equal(presentation.organizationId, 'org-b');
    assert.equal(presentation.isOrgAdmin, false);
    assert.deepEqual(presentation.sections, []);
    assert.equal(presentation.workforce.canView, false);
    assert.deepEqual(presentation.applicationControls.assignedApplications, ['MpesaOS']);
    assert.equal(presentation.applicationControls.canAssign, false);
});

test('resolveWorkspacePresentation for a malformed/inactive context fails closed to an empty, non-null presentation', () => {
    const presentation = resolveWorkspacePresentation(null);
    assert.equal(presentation.organizationId, null);
    assert.equal(presentation.isOrgAdmin, false);
    assert.deepEqual(presentation.sections, []);
});
