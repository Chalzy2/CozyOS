'use strict';

/**
 * core/modules/intelligence/next-step/tests/cozy-next-step-action-registry.test.js
 *
 * Live Next-Step Intelligence — real, end-to-end execution tests for
 * window.CozyOS.NextStepActionRegistry, against the REAL, unmodified
 * QuarryOS engine (core/modules/QuarryOS/quarry-index.js) and the REAL,
 * unmodified ChurchOS ChurchMembershipBridge
 * (core/modules/ChurchOS/church-membership-bridge.js) — no mocks for
 * the app-side behavior under test.
 *
 * Covers required tests:
 *   3. Selecting a suggestion executes the correct real action.
 *   4. An unauthorized action is blocked by real authorization
 *      (QuarryManager's own roleMatrix/_checkPermission — not a second
 *      permission system).
 *
 * Run with: node --test core/modules/intelligence/next-step/tests/cozy-next-step-action-registry.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function freshWindow() {
    global.window = { CozyOS: {} };
    [
        '../../../memory/cozy-memory-engine.js',
        '../../../../organization/organization-registry.js',
        '../../../ChurchOS/church-membership-bridge.js',
        path.join('..', '..', '..', 'QuarryOS', 'quarry-index.js'),
        '../cozy-next-step-action-registry.js'
    ].forEach((rel) => {
        const resolved = require.resolve(rel);
        delete require.cache[resolved];
        require(resolved);
    });
    return window.CozyOS;
}

test('registers window.CozyOS.NextStepActionRegistry with real registered actions', () => {
    const CozyOS = freshWindow();
    assert.ok(CozyOS.NextStepActionRegistry);
    const churchActions = CozyOS.NextStepActionRegistry.listActions({ appId: 'ChurchOS' });
    const quarryActions = CozyOS.NextStepActionRegistry.listActions({ appId: 'QuarryOS' });
    assert.ok(churchActions.some((a) => a.actionId === 'church.register_member'));
    assert.ok(quarryActions.some((a) => a.actionId === 'quarry.register_employee'));
    assert.ok(quarryActions.some((a) => a.actionId === 'quarry.terminate_employee' && a.destructive === true));
});

test('an application with no registered actions returns [] — not an error', () => {
    const CozyOS = freshWindow();
    const none = CozyOS.NextStepActionRegistry.listActions({ appId: 'SomeUnregisteredApplication' });
    assert.deepEqual(none, []);
});

test('REQUIRED TEST 3 — executing church.register_member calls the REAL ChurchMembershipBridge.registerMember() and really creates the member', async () => {
    const CozyOS = freshWindow();
    const org = CozyOS.OrganizationRegistry.createOrganization({ name: 'Test Church' });

    const result = await CozyOS.NextStepActionRegistry.execute(
        'church.register_member',
        { orgId: org.orgId, profile: { name: 'Jane Doe' } },
        { actorId: 'tester-1' }
    );

    assert.equal(result.success, true);
    assert.ok(result.member);
    assert.equal(result.member.name, 'Jane Doe');

    // Independently verify, via the REAL bridge's own listMembers(), that
    // this was a genuine write — not merely an honest-looking return value.
    const listing = CozyOS.ChurchMembershipBridge.listMembers(org.orgId);
    assert.equal(listing.available, true);
    assert.equal(listing.members.length, 1);
    assert.equal(listing.members[0].memberId, result.member.memberId);
});

test('REQUIRED TEST 3b — executing quarry.register_employee calls the REAL QuarryManager.handle() route and returns its real success text', async () => {
    const CozyOS = freshWindow();
    const result = await CozyOS.NextStepActionRegistry.execute(
        'quarry.register_employee',
        { employee: { phone: '0700000000', position: 'Crusher Operator' } },
        { actorId: 'tester-2', role: 'HR Manager' }
    );
    assert.equal(result.success, true);
    assert.equal(result.authorized, true);
    assert.ok(typeof result.employeeId === 'string' && result.employeeId.length > 0);
    assert.ok(result.responseText.includes('registered'));
});

test('REQUIRED TEST 4 — an unauthorized role is blocked by the REAL QuarryOS roleMatrix (not a fabricated denial, not a second permission system)', async () => {
    const CozyOS = freshWindow();
    const result = await CozyOS.NextStepActionRegistry.execute(
        'quarry.register_employee',
        { employee: { phone: '0700000000', position: 'Crusher Operator' } },
        { actorId: 'tester-3', role: 'Machine Operator' } // real roleMatrix: Machine Operator has no register_employee grant.
    );
    assert.equal(result.success, false);
    assert.equal(result.authorized, false);
    assert.ok(/security violation|lacks execution rights/i.test(result.reason || ''), `Expected a real 403 role-denial reason, got: ${result.reason}`);
});

test('REQUIRED TEST 4b — the SAME role is genuinely allowed for a route it IS granted (Administrator can register AND terminate)', async () => {
    const CozyOS = freshWindow();
    const registered = await CozyOS.NextStepActionRegistry.execute(
        'quarry.register_employee', { employee: { phone: '0711111111', position: 'Driver', employeeId: 'EMP-TEST-1' } }, { role: 'Administrator' }
    );
    assert.equal(registered.success, true);

    const terminated = await CozyOS.NextStepActionRegistry.execute(
        'quarry.terminate_employee', { employee: { employeeId: 'EMP-TEST-1', reason: 'test' } }, { role: 'Administrator' }
    );
    assert.equal(terminated.success, true);
    assert.equal(terminated.authorized, true);
});

test('destructive action execution is NOT self-gated by the registry — confirmation is the UI\'s responsibility, documented honestly', async () => {
    const CozyOS = freshWindow();
    // execute() itself does not ask for confirmation — calling it
    // directly with a valid, authorized role succeeds immediately. This
    // proves the registry composes the real handler faithfully; the
    // Live Window UI (cozy-next-step-suggestions-ui.js) is the ONLY
    // place a destructive tap is held for confirmation before this call
    // is ever made — see that file's onSuggestionTap()/renderConfirm().
    const def = CozyOS.NextStepActionRegistry.getAction('quarry.terminate_employee');
    assert.equal(def.destructive, true);
    const result = await CozyOS.NextStepActionRegistry.execute('quarry.terminate_employee', { employee: { employeeId: 'EMP-DIRECT' } }, { role: 'Administrator' });
    assert.equal(result.success, true);
});

test('a thrown validation error from the real app handler is reported honestly, never as a fabricated success', async () => {
    const CozyOS = freshWindow();
    // terminate_employee's own real code throws when employeeId is missing.
    const result = await CozyOS.NextStepActionRegistry.execute('quarry.terminate_employee', { employee: {} }, { role: 'Administrator' });
    assert.equal(result.success, false);
    assert.ok(result.reason && result.reason.length > 0);
});

test('church.register_member disclosed authorization ceiling: no role gate exists, but a real name IS still required', async () => {
    const CozyOS = freshWindow();
    const org = CozyOS.OrganizationRegistry.createOrganization({ name: 'Another Church' });
    const noName = await CozyOS.NextStepActionRegistry.execute('church.register_member', { orgId: org.orgId, profile: {} }, {});
    assert.equal(noName.success, false);
    assert.ok(/name/i.test(noName.reason || ''));
});
