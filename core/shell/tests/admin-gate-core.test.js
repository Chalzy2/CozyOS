/**
 * core/shell/tests/admin-gate-core.test.js
 * Run with: node --test core/shell/tests/admin-gate-core.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CORE_PATH = path.join(__dirname, '..', 'admin-gate-core.js');

function load() {
    delete require.cache[require.resolve(CORE_PATH)];
    global.window = { CozyOS: {} };
    require(CORE_PATH);
    return global.window.CozyOS.AdminGateCore;
}

const { decideGateAction, resolveWorkspaceRoute, GATE_ACTION, GATE_SCOPE, WORKSPACE_ROUTE } = load();

test('verified admin session (httpStatus 200, isPlatformAdmin true) loads the workspace', () => {
  const result = decideGateAction({ httpStatus: 200, authenticated: true, isPlatformAdmin: true, email: 'admin@example.com' });
  assert.equal(result.action, GATE_ACTION.LOAD_ADMIN_WORKSPACE);
});

test('authenticated non-admin (httpStatus 200, isPlatformAdmin false) is denied, never loaded', () => {
  const result = decideGateAction({ httpStatus: 200, authenticated: true, isPlatformAdmin: false, email: 'user@example.com' });
  assert.equal(result.action, GATE_ACTION.ACCESS_DENIED);
});

test('unauthenticated (httpStatus 401) redirects to login', () => {
  const result = decideGateAction({ httpStatus: 401, authenticated: false });
  assert.equal(result.action, GATE_ACTION.REDIRECT_TO_LOGIN);
});

test('authenticated:false with isPlatformAdmin:true fails closed (does not load)', () => {
  const result = decideGateAction({ httpStatus: 200, authenticated: false, isPlatformAdmin: true });
  assert.notEqual(result.action, GATE_ACTION.LOAD_ADMIN_WORKSPACE);
});

test('isPlatformAdmin=1 (truthy but not === true) is treated as NOT admin — no loose-equality bypass', () => {
  const result = decideGateAction({ httpStatus: 200, authenticated: true, isPlatformAdmin: 1 });
  assert.equal(result.action, GATE_ACTION.ACCESS_DENIED);
});

test('a forged/tampered response missing httpStatus fails closed, not open', () => {
  const result = decideGateAction({ authenticated: true, isPlatformAdmin: true });
  assert.notEqual(result.action, GATE_ACTION.LOAD_ADMIN_WORKSPACE);
});

test('server error (5xx) fails closed to GATE_ERROR, not to the workspace', () => {
  const result = decideGateAction({ httpStatus: 500, authenticated: false });
  assert.equal(result.action, GATE_ACTION.GATE_ERROR);
});

test('null/undefined input fails closed', () => {
  assert.equal(decideGateAction(null).action, GATE_ACTION.GATE_ERROR);
  assert.equal(decideGateAction(undefined).action, GATE_ACTION.GATE_ERROR);
});

test('a hand-crafted object mimicking client-only admin state (no httpStatus) never grants access', () => {
  // The exact shape an attacker's forged localStorage/JS-variable state
  // might mimic if this function were ever fed client-controlled data
  // instead of a real fetch() response.
  const forged = { isPlatformAdmin: true, authenticated: true, isAdmin: true, role: 'admin' };
  const result = decideGateAction(forged);
  assert.notEqual(result.action, GATE_ACTION.LOAD_ADMIN_WORKSPACE);
});

// ---------------------------------------------------------------------
// MILESTONE — SERVER SESSION + 3-WAY GATE FOUNDATION
// ---------------------------------------------------------------------

test('organization admin (isOrgAdmin:true on an active membership) loads the organization workspace, not the platform one', () => {
  const result = decideGateAction({
    httpStatus: 200, authenticated: true, isPlatformAdmin: false,
    organizations: [{ organizationId: 'org-b', status: 'active', isOrgAdmin: true }],
  });
  assert.equal(result.action, GATE_ACTION.LOAD_ORGANIZATION_WORKSPACE);
  assert.equal(result.scope, GATE_SCOPE.ORGANIZATION);
});

test('worker (active membership, isOrgAdmin:false) loads the worker workspace, not the organization one', () => {
  const result = decideGateAction({
    httpStatus: 200, authenticated: true, isPlatformAdmin: false,
    organizations: [{ organizationId: 'org-b', status: 'active', isOrgAdmin: false }],
  });
  assert.equal(result.action, GATE_ACTION.LOAD_WORKER_WORKSPACE);
  assert.equal(result.scope, GATE_SCOPE.WORKER);
});

test('unauthorized user (no organizations at all) is denied, same as before this milestone', () => {
  const result = decideGateAction({ httpStatus: 200, authenticated: true, isPlatformAdmin: false, organizations: [] });
  assert.equal(result.action, GATE_ACTION.ACCESS_DENIED);
  assert.equal(result.scope, GATE_SCOPE.NONE);
});

test('an organizations array containing only a non-active membership is denied', () => {
  const result = decideGateAction({
    httpStatus: 200, authenticated: true, isPlatformAdmin: false,
    organizations: [{ organizationId: 'org-b', status: 'invited', isOrgAdmin: true }],
  });
  assert.equal(result.action, GATE_ACTION.ACCESS_DENIED);
});

test('a suspended membership carries no authority even if isOrgAdmin is true', () => {
  const result = decideGateAction({
    httpStatus: 200, authenticated: true, isPlatformAdmin: false,
    organizations: [{ organizationId: 'org-b', status: 'suspended', isOrgAdmin: true }],
  });
  assert.equal(result.action, GATE_ACTION.ACCESS_DENIED);
});

test('a removed membership carries no authority', () => {
  const result = decideGateAction({
    httpStatus: 200, authenticated: true, isPlatformAdmin: false,
    organizations: [{ organizationId: 'org-b', status: 'removed', isOrgAdmin: true }],
  });
  assert.equal(result.action, GATE_ACTION.ACCESS_DENIED);
});

test('wrong/unrelated organization entries do not grant access to a different capability check', () => {
  // decideGateAction only ever answers "what tier", never "for which org
  // id" — organization selection/isolation itself is server-verified
  // elsewhere (organizations.isAuthorized, the org-switch endpoint of the
  // next milestone). Here we only confirm a membership in ANY org with
  // isOrgAdmin:false never escalates to ORGANIZATION tier.
  const result = decideGateAction({
    httpStatus: 200, authenticated: true, isPlatformAdmin: false,
    organizations: [
      { organizationId: 'org-b', status: 'active', isOrgAdmin: false },
      { organizationId: 'org-c', status: 'invited', isOrgAdmin: true },
    ],
  });
  assert.equal(result.action, GATE_ACTION.LOAD_WORKER_WORKSPACE);
});

test('a capability explicitly denied (isOrgAdmin:false) never falls back to organization tier', () => {
  const result = decideGateAction({
    httpStatus: 200, authenticated: true, isPlatformAdmin: false,
    organizations: [{ organizationId: 'org-b', status: 'active', isOrgAdmin: false }],
  });
  assert.notEqual(result.action, GATE_ACTION.LOAD_ORGANIZATION_WORKSPACE);
});

test('organization admin status never elevates to platform admin', () => {
  const result = decideGateAction({
    httpStatus: 200, authenticated: true, isPlatformAdmin: false,
    organizations: [{ organizationId: 'org-b', status: 'active', isOrgAdmin: true }],
  });
  assert.notEqual(result.action, GATE_ACTION.LOAD_ADMIN_WORKSPACE);
  assert.notEqual(result.scope, GATE_SCOPE.PLATFORM);
});

test('worker status never elevates to organization admin', () => {
  const result = decideGateAction({
    httpStatus: 200, authenticated: true, isPlatformAdmin: false,
    organizations: [{ organizationId: 'org-b', status: 'active', isOrgAdmin: false }],
  });
  assert.notEqual(result.action, GATE_ACTION.LOAD_ORGANIZATION_WORKSPACE);
  assert.notEqual(result.scope, GATE_SCOPE.ORGANIZATION);
});

test('multiple organizations preserve isolation: one worker-tier org does not borrow another org\'s admin flag', () => {
  // ORG-B: worker only. ORG-C: not present at all for this user. The
  // decision must reflect ORG-B's own real flag, never assume admin
  // elsewhere just because *some* membership exists.
  const result = decideGateAction({
    httpStatus: 200, authenticated: true, isPlatformAdmin: false,
    organizations: [{ organizationId: 'org-b', status: 'active', isOrgAdmin: false }],
  });
  assert.equal(result.scope, GATE_SCOPE.WORKER);
});

test('a session object with an organizations array cannot be used to forge platform admin', () => {
  // Mimics a tampered client object that adds organization data but still
  // lacks a genuine isPlatformAdmin:true from the server.
  const forged = {
    httpStatus: 200, authenticated: true, isPlatformAdmin: false,
    organizations: [{ organizationId: 'org-b', status: 'active', isOrgAdmin: true, role: 'super-admin', isPlatformAdmin: true }],
  };
  const result = decideGateAction(forged);
  assert.notEqual(result.action, GATE_ACTION.LOAD_ADMIN_WORKSPACE);
  assert.equal(result.scope, GATE_SCOPE.ORGANIZATION);
});

test('a non-array organizations field (forged/malformed) is treated as no organizations, fails closed', () => {
  const result = decideGateAction({
    httpStatus: 200, authenticated: true, isPlatformAdmin: false,
    organizations: 'org-b',
  });
  assert.equal(result.action, GATE_ACTION.ACCESS_DENIED);
});

test('isOrgAdmin as a truthy non-boolean (1 or "true") does not grant organization tier', () => {
  const result = decideGateAction({
    httpStatus: 200, authenticated: true, isPlatformAdmin: false,
    organizations: [{ organizationId: 'org-b', status: 'active', isOrgAdmin: 1 }],
  });
  assert.notEqual(result.action, GATE_ACTION.LOAD_ORGANIZATION_WORKSPACE);
  assert.equal(result.action, GATE_ACTION.LOAD_WORKER_WORKSPACE);
});

// ---------------------------------------------------------------------
// D1 (CHALZYDASHBOARD-ROUTING-DEFECT) — resolveWorkspaceRoute()
//
// Regression coverage for the real defect: Chalzydashboard.html used to
// send any decideGateAction() result that wasn't REDIRECT_TO_LOGIN/
// ACCESS_DENIED/GATE_ERROR straight into Bootstrap.start() (the
// PLATFORM-only admin-workspace.html loader) - so ORGANIZATION and
// WORKER sessions incorrectly loaded the platform admin workspace.
// ---------------------------------------------------------------------

test('D1: PLATFORM decision routes to WORKSPACE_ROUTE.PLATFORM', () => {
  const decision = decideGateAction({ httpStatus: 200, authenticated: true, isPlatformAdmin: true });
  const route = resolveWorkspaceRoute(decision);
  assert.equal(route.route, WORKSPACE_ROUTE.PLATFORM);
});

test('D1: ORGANIZATION decision routes to WORKSPACE_ROUTE.ORGANIZATION, never PLATFORM', () => {
  const decision = decideGateAction({
    httpStatus: 200, authenticated: true, isPlatformAdmin: false,
    organizations: [{ organizationId: 'org-b', status: 'active', isOrgAdmin: true }],
  });
  const route = resolveWorkspaceRoute(decision);
  assert.equal(route.route, WORKSPACE_ROUTE.ORGANIZATION);
  assert.notEqual(route.route, WORKSPACE_ROUTE.PLATFORM);
});

test('D1: WORKER decision routes to WORKSPACE_ROUTE.WORKER, never PLATFORM', () => {
  const decision = decideGateAction({
    httpStatus: 200, authenticated: true, isPlatformAdmin: false,
    organizations: [{ organizationId: 'org-b', status: 'active', isOrgAdmin: false }],
  });
  const route = resolveWorkspaceRoute(decision);
  assert.equal(route.route, WORKSPACE_ROUTE.WORKER);
  assert.notEqual(route.route, WORKSPACE_ROUTE.PLATFORM);
});

test('D1: ACCESS_DENIED decision routes to WORKSPACE_ROUTE.DENIED, never any workspace', () => {
  const decision = decideGateAction({ httpStatus: 200, authenticated: true, isPlatformAdmin: false, organizations: [] });
  const route = resolveWorkspaceRoute(decision);
  assert.equal(route.route, WORKSPACE_ROUTE.DENIED);
});

test('D1: REDIRECT_TO_LOGIN decision routes to WORKSPACE_ROUTE.LOGIN', () => {
  const decision = decideGateAction({ httpStatus: 401, authenticated: false });
  const route = resolveWorkspaceRoute(decision);
  assert.equal(route.route, WORKSPACE_ROUTE.LOGIN);
});

test('D1: GATE_ERROR decision routes to WORKSPACE_ROUTE.ERROR, never PLATFORM (no "fail open")', () => {
  const decision = decideGateAction({ httpStatus: 500, authenticated: false });
  const route = resolveWorkspaceRoute(decision);
  assert.equal(route.route, WORKSPACE_ROUTE.ERROR);
});

test('D1: an unrecognized/forged action string fails closed to ERROR, not PLATFORM (the exact old defect)', () => {
  const route = resolveWorkspaceRoute({ action: 'SOMETHING_NEW_AND_UNHANDLED', scope: 'ORGANIZATION', reason: 'x' });
  assert.equal(route.route, WORKSPACE_ROUTE.ERROR);
});

test('D1: action/scope mismatch (tamper attempt) fails closed to ERROR rather than trusting either field alone', () => {
  const route = resolveWorkspaceRoute({ action: GATE_ACTION.LOAD_ADMIN_WORKSPACE, scope: GATE_SCOPE.ORGANIZATION, reason: 'forged' });
  assert.equal(route.route, WORKSPACE_ROUTE.ERROR);
});

test('D1: malformed/null decision fails closed to ERROR', () => {
  assert.equal(resolveWorkspaceRoute(null).route, WORKSPACE_ROUTE.ERROR);
  assert.equal(resolveWorkspaceRoute(undefined).route, WORKSPACE_ROUTE.ERROR);
  assert.equal(resolveWorkspaceRoute('not-an-object').route, WORKSPACE_ROUTE.ERROR);
});

test('D1: every GATE_ACTION value maps to a route other than PLATFORM except LOAD_ADMIN_WORKSPACE (no accidental fallthrough)', () => {
  const nonPlatformActions = Object.values(GATE_ACTION).filter((a) => a !== GATE_ACTION.LOAD_ADMIN_WORKSPACE);
  for (const action of nonPlatformActions) {
    const route = resolveWorkspaceRoute({ action, scope: GATE_SCOPE.NONE, reason: 'coverage' });
    assert.notEqual(route.route, WORKSPACE_ROUTE.PLATFORM, `action ${action} must never route to PLATFORM`);
  }
});
