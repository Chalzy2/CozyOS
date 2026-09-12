/**
 * core/shell/tests/organization-workspace.test.js
 *
 * Covers the pure, DOM-free decision helpers exported by
 * core/shell/organization-workspace.js: selectDefaultOrganization(),
 * planSwitch(), interpretContextResponse(). Full DOM rendering
 * (switcher clicks, section nav, live fetch wiring) requires a real
 * browser and is covered by core/tests/browser/chalzydashboard-
 * organization-workspace-browser.test.js instead — see that file's own
 * header for why (this repo's Node test convention is a hand-rolled
 * fake `document` for simple cases, but this controller's real value is
 * the request/response wiring a fake DOM can't meaningfully exercise).
 *
 * Run with: node --test core/shell/tests/organization-workspace.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CORE_PATH = path.join(__dirname, '..', 'organization-workspace-core.js');
const WORKSPACE_PATH = path.join(__dirname, '..', 'organization-workspace.js');

function load() {
    delete require.cache[require.resolve(CORE_PATH)];
    delete require.cache[require.resolve(WORKSPACE_PATH)];
    global.window = { CozyOS: {} };
    require(CORE_PATH);
    require(WORKSPACE_PATH);
    return global.window.CozyOS.OrganizationWorkspace;
}

const { selectDefaultOrganization, planSwitch, interpretContextResponse } = load();

// ---------- selectDefaultOrganization ----------

test('selectDefaultOrganization picks the first ACTIVE organization, skipping suspended/invited ones before it', () => {
    const sessionOrgs = [
        { organizationId: 'org-a', name: 'Org A', status: 'suspended' },
        { organizationId: 'org-b', name: 'ORG-B', status: 'active' },
        { organizationId: 'org-c', name: 'ORG-C', status: 'active' },
    ];
    const picked = selectDefaultOrganization(sessionOrgs);
    assert.equal(picked.organizationId, 'org-b');
});

test('selectDefaultOrganization returns null when there is no active organization at all', () => {
    assert.equal(selectDefaultOrganization([{ organizationId: 'org-a', status: 'invited' }]), null);
    assert.equal(selectDefaultOrganization([]), null);
    assert.equal(selectDefaultOrganization(null), null);
    assert.equal(selectDefaultOrganization(undefined), null);
});

test('selectDefaultOrganization ignores a malformed (non-array) organizations field, fails closed to null', () => {
    assert.equal(selectDefaultOrganization('org-b'), null);
});

// ---------- planSwitch ----------

test('planSwitch allows switching to a different, active target membership', () => {
    const plan = planSwitch('org-b', { organizationId: 'org-c', status: 'active' });
    assert.equal(plan.allowed, true);
});

test('planSwitch denies switching to a suspended/invited/removed target membership', () => {
    for (const status of ['suspended', 'invited', 'removed', 'declined']) {
        const plan = planSwitch('org-b', { organizationId: 'org-c', status });
        assert.equal(plan.allowed, false, `status ${status} must be denied`);
        assert.equal(plan.reason, 'membership_not_active');
    }
});

test('planSwitch denies re-selecting the already-active organization (no redundant switch)', () => {
    const plan = planSwitch('org-b', { organizationId: 'org-b', status: 'active' });
    assert.equal(plan.allowed, false);
    assert.equal(plan.reason, 'already_active');
});

test('planSwitch denies a null/malformed target', () => {
    assert.equal(planSwitch('org-b', null).allowed, false);
    assert.equal(planSwitch('org-b', undefined).allowed, false);
    assert.equal(planSwitch('org-b', 'org-c').allowed, false);
});

// ---------- interpretContextResponse ----------

test('interpretContextResponse verifies a real 200 { ok: true, ... } body', () => {
    const result = interpretContextResponse(200, { ok: true, organizationId: 'org-c', isOrgAdmin: true });
    assert.equal(result.ok, true);
    assert.equal(result.context.organizationId, 'org-c');
});

test('interpretContextResponse denies any non-200 status regardless of body content', () => {
    const result = interpretContextResponse(403, { ok: true, organizationId: 'org-c', isOrgAdmin: true });
    assert.equal(result.ok, false);
    assert.equal(result.context, null);
});

test('interpretContextResponse denies a 200 body missing ok: true (e.g. forged/mismatched body)', () => {
    assert.equal(interpretContextResponse(200, { organizationId: 'org-c' }).ok, false);
    assert.equal(interpretContextResponse(200, { ok: false, organizationId: 'org-c' }).ok, false);
    assert.equal(interpretContextResponse(200, { ok: 'true', organizationId: 'org-c' }).ok, false);
});

test('interpretContextResponse denies a null/malformed body without throwing', () => {
    assert.equal(interpretContextResponse(200, null).ok, false);
    assert.equal(interpretContextResponse(200, undefined).ok, false);
    assert.equal(interpretContextResponse(200, 'not-an-object').ok, false);
});

test('interpretContextResponse surfaces the server-provided error reason on denial (e.g. not_an_active_member)', () => {
    const result = interpretContextResponse(403, { error: 'not_an_active_member' });
    assert.equal(result.reason, 'not_an_active_member');
});
