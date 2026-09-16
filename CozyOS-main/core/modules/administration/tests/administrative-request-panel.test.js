'use strict';

/**
 * core/modules/administration/tests/administrative-request-panel.test.js
 *
 * Focused, real-path tests for the new Administrative Requests Browser
 * Integration milestone. No engine is mocked: the real PolicyEngine,
 * IdentityEngine, CozyAutomation, Cozy Workflow Runtime, the real
 * AdministrativeRequestCoordinator, and the real panel module are all
 * loaded fresh (same bare `global.window = { CozyOS: {} }` shim
 * convention already established by
 * administrative-request-coordinator.test.js and
 * authentication-enrollment-panel.test.js). No DOM is touched
 * (init()/destroy() are not called) — this file exercises the panel's
 * pure build/render/action functions, which is exactly what those
 * functions are exposed for.
 *
 * Also includes a static, file-based check of admin-workspace.html's
 * real <script> tag order, since a full browser runtime harness is not
 * available in this environment (see IMPLEMENTATION-REPORT for this
 * milestone — Browser Runtime Verified is reported separately and only
 * where actually demonstrated).
 *
 * Run: node --test core/modules/administration/tests/administrative-request-panel.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const IDENTITY_ENGINE_PATH = path.join(__dirname, '..', '..', 'identity', 'identity-engine.js');
const POLICY_ENGINE_PATH = path.join(__dirname, '..', '..', 'policy', 'policy-engine.js');
const COZY_AUTOMATION_PATH = path.join(__dirname, '..', '..', 'automation', 'cozy-automation.js');
const WORKFLOW_RUNTIME_PATH = path.join(__dirname, '..', '..', 'automation', 'cozy-workflow-runtime.js');
const COORDINATOR_PATH = path.join(__dirname, '..', 'administrative-request-coordinator.js');
const PANEL_PATH = path.join(__dirname, '..', 'administrative-request-panel.js');
const ADMIN_WORKSPACE_HTML_PATH = path.join(__dirname, '..', '..', '..', '..', 'admin-workspace.html');

function freshRequire(modPath) {
    delete require.cache[require.resolve(modPath)];
    require(modPath);
}

/** Loads the full real dependency chain + coordinator, WITHOUT the panel. */
function freshStackNoPanel() {
    global.window = { CozyOS: {} };
    freshRequire(IDENTITY_ENGINE_PATH);
    freshRequire(POLICY_ENGINE_PATH);
    freshRequire(COZY_AUTOMATION_PATH);
    freshRequire(WORKFLOW_RUNTIME_PATH);
    freshRequire(COORDINATOR_PATH);
    return {
        IE: global.window.CozyOS.IdentityEngine,
        PE: global.window.CozyOS.PolicyEngine,
        AUTO: global.window.CozyOS.CozyAutomation,
        WF: global.window.CozyOS.WorkflowEngine,
        ARC: global.window.CozyOS.AdministrativeRequestCoordinator,
    };
}

/** Loads the full real stack + the real panel on top, with a minimal Auth shim. */
function freshFullStackWithPanel({ signedInUserId = null } = {}) {
    const stack = freshStackNoPanel();
    global.window.CozyOS.Auth = {
        getCurrentAdministrator() { return signedInUserId ? { userId: signedInUserId, source: 'test' } : null; },
    };
    delete require.cache[require.resolve(PANEL_PATH)];
    require(PANEL_PATH);
    return { ...stack, panel: global.window.CozyOS.Modules['administrative-requests-panel'] };
}

async function makeUser(IE, roles = []) {
    const res = await IE.createUser({ username: `user_${Math.random().toString(36).slice(2, 10)}`, password: 'anything', roles });
    assert.equal(res.available, true, 'test setup: user creation must succeed');
    return res.userId;
}

function makeSimpleWorkflow(AUTO) {
    return AUTO.workflow.create({
        name: 'Panel Test Workflow',
        actions: [{ actionId: 'unregistered-action', type: 'call_ai' }],
    });
}

// ── 1. Coordinator availability drives the panel's honest availability ─────

test('getAvailability(): reports unavailable, with a real reason, when the coordinator never attached', () => {
    // Load the panel WITHOUT ever loading PolicyEngine/IdentityEngine/WorkflowEngine/coordinator.
    global.window = { CozyOS: {} };
    delete require.cache[require.resolve(PANEL_PATH)];
    require(PANEL_PATH);
    const panel = global.window.CozyOS.Modules['administrative-requests-panel'];

    const availability = panel.getAvailability();
    assert.equal(availability.available, false);
    assert.match(availability.reason, /AdministrativeRequestCoordinator is not loaded/);
});

test('getAvailability(): reports available once the real full dependency chain is loaded', () => {
    const { panel } = freshFullStackWithPanel();
    assert.equal(panel.getAvailability().available, true);
});

// ── 2. UI → coordinator wiring: submit ──────────────────────────────────────

test('doSubmit(): calls the real coordinator.submitRequest() and returns a real REQUESTED record', async () => {
    const { IE, ARC, panel } = freshFullStackWithPanel();
    const requester = await makeUser(IE);

    const result = panel.doSubmit({ action: 'user.suspend', requester, policyId: '', workflowId: '' });
    assert.equal(result.state, 'REQUESTED');
    assert.equal(ARC.getRequest(result.id).state, 'REQUESTED');
});

// ── 3. UI → coordinator wiring: approval ────────────────────────────────────

test('doDecide(): with no signed-in administrator, the panel honestly refuses rather than deciding as nobody', async () => {
    const { IE, ARC, panel } = freshFullStackWithPanel({ signedInUserId: null });
    const requester = await makeUser(IE);
    const req = ARC.submitRequest({ action: 'user.suspend', requester });

    assert.throws(() => panel.doDecide(req.id, true), /No signed-in administrator/);
    assert.equal(ARC.getRequest(req.id).state, 'REQUESTED');
});

test('doDecide(): approving, while signed in as a real approver, delegates to the real coordinator and reflects a real APPROVED state', async () => {
    // Real approver identity is created via IdentityEngine.createUser() on
    // one shared stack, then the SAME userId is supplied as the Auth
    // shim's signed-in user on that SAME stack (not a second, isolated
    // instance) — decideRequest() looks the user up again against the
    // identical IdentityEngine instance the panel/coordinator/ARC all
    // share, exactly as a real single-process deployment would.
    const stack = freshFullStackWithPanel();
    const requester = await makeUser(stack.IE);
    const approver = await makeUser(stack.IE, ['approver']);
    const req = stack.ARC.submitRequest({ action: 'user.suspend', requester });
    global.window.CozyOS.Auth = { getCurrentAdministrator() { return { userId: approver, source: 'test' }; } };

    const result = stack.panel.doDecide(req.id, true);
    assert.equal(result.state, 'APPROVED');
    assert.equal(result.approver, approver);
});

// ── 4. UI → coordinator wiring: rejection ───────────────────────────────────

test('doDecide(): rejecting delegates to the real coordinator and reflects a real REJECTED state', async () => {
    const stack = freshFullStackWithPanel();
    const requester = await makeUser(stack.IE);
    const approver = await makeUser(stack.IE, ['approver']);
    const req = stack.ARC.submitRequest({ action: 'user.suspend', requester });
    global.window.CozyOS.Auth = { getCurrentAdministrator() { return { userId: approver, source: 'test' }; } };

    const result = stack.panel.doDecide(req.id, false);
    assert.equal(result.state, 'REJECTED');
});

// ── 5. Unauthorized approval must not succeed, even from the panel ─────────

test('doDecide(): an unauthorized (non-approver) signed-in user is honestly refused by the real IdentityEngine check', async () => {
    const stack = freshFullStackWithPanel();
    const requester = await makeUser(stack.IE);
    const staffUser = await makeUser(stack.IE, ['staff']);
    const req = stack.ARC.submitRequest({ action: 'user.suspend', requester });
    global.window.CozyOS.Auth = { getCurrentAdministrator() { return { userId: staffUser, source: 'test' }; } };

    assert.throws(() => stack.panel.doDecide(req.id, true), /does not hold the "approver" role/);
    assert.equal(stack.ARC.getRequest(req.id).state, 'REQUESTED');
});

// ── 6. Pending/rejected requests must not be dispatchable via the panel ────

test('doDispatch(): the panel cannot dispatch a still-PENDING request', async () => {
    const stack = freshFullStackWithPanel();
    const requester = await makeUser(stack.IE);
    const workflowId = makeSimpleWorkflow(stack.AUTO);
    const req = stack.ARC.submitRequest({ action: 'user.suspend', requester, workflowId });

    await assert.rejects(() => stack.panel.doDispatch(req.id, workflowId), /is not APPROVED \(state "REQUESTED"\)/);
});

test('doDispatch(): the panel cannot dispatch a REJECTED request', async () => {
    const stack = freshFullStackWithPanel();
    const requester = await makeUser(stack.IE);
    const approver = await makeUser(stack.IE, ['approver']);
    const workflowId = makeSimpleWorkflow(stack.AUTO);
    const req = stack.ARC.submitRequest({ action: 'user.suspend', requester, workflowId });
    global.window.CozyOS.Auth = { getCurrentAdministrator() { return { userId: approver, source: 'test' }; } };
    stack.panel.doDecide(req.id, false);

    await assert.rejects(() => stack.panel.doDispatch(req.id, workflowId), /is not APPROVED \(state "REJECTED"\)/);
});

// ── 7. Dispatch after real approval succeeds and reports a real executionId ─

test('doDispatch(): dispatching an APPROVED request runs the real workflow and records a real executionId', async () => {
    const stack = freshFullStackWithPanel();
    const requester = await makeUser(stack.IE);
    const approver = await makeUser(stack.IE, ['approver']);
    const workflowId = makeSimpleWorkflow(stack.AUTO);
    const req = stack.ARC.submitRequest({ action: 'user.suspend', requester, workflowId });
    global.window.CozyOS.Auth = { getCurrentAdministrator() { return { userId: approver, source: 'test' }; } };
    stack.panel.doDecide(req.id, true);

    const result = await stack.panel.doDispatch(req.id, workflowId);
    assert.equal(result.state, 'COMPLETED');
    assert.ok(result.executionId);
    const realExecution = stack.WF.getExecution(result.executionId);
    assert.ok(realExecution, 'the recorded executionId must resolve to a real WorkflowEngine execution');
});

// ── 8. Failed execution is represented honestly, never fabricated success ──

test('doDispatch(): a workflow failure is reported as FAILED, never fabricated as COMPLETED', async () => {
    const stack = freshFullStackWithPanel();
    // Same real-handler-failure convention as
    // administrative-request-coordinator.test.js's own "Workflow failure
    // produces FAILED" test: register a real handler that actually throws,
    // rather than assuming an unregistered action type fails on its own.
    stack.WF.registerActionHandler('execute_script', async () => { throw new Error('simulated real handler failure'); });

    const requester = await makeUser(stack.IE);
    const approver = await makeUser(stack.IE, ['approver']);
    const workflowId = stack.AUTO.workflow.create({
        name: 'Failing Panel Workflow',
        actions: [{ actionId: 'unregistered-action', type: 'execute_script' }],
    });
    const req = stack.ARC.submitRequest({ action: 'data.purge', requester, workflowId });
    global.window.CozyOS.Auth = { getCurrentAdministrator() { return { userId: approver, source: 'test' }; } };
    stack.panel.doDecide(req.id, true);

    const result = await stack.panel.doDispatch(req.id, workflowId);
    assert.equal(result.state, 'FAILED');
    assert.match(result.failureReason, /simulated real handler failure/);
});

// ── 9. Provenance survives into the panel's row-building for display ───────

test('buildRequestRow()/buildAllRows(): requestId, action, requester, and executionId propagate honestly into the display row', async () => {
    const stack = freshFullStackWithPanel();
    const requester = await makeUser(stack.IE);
    const approver = await makeUser(stack.IE, ['approver']);
    const workflowId = makeSimpleWorkflow(stack.AUTO);
    const req = stack.ARC.submitRequest({ action: 'user.suspend', requester, workflowId });
    global.window.CozyOS.Auth = { getCurrentAdministrator() { return { userId: approver, source: 'test' }; } };
    stack.panel.doDecide(req.id, true);
    const dispatched = await stack.panel.doDispatch(req.id, workflowId);

    const rows = stack.panel.buildAllRows();
    const row = rows.find(r => r.id === req.id);
    assert.ok(row, 'the request must appear in buildAllRows()');
    assert.equal(row.action, 'user.suspend');
    assert.equal(row.requester, requester);
    assert.equal(row.executionId, dispatched.executionId);
    assert.equal(row.state, 'COMPLETED');
    assert.equal(row.canDecide, false);
    assert.equal(row.canDispatch, false);
});

// ── 10. Rendering never invents a 7th lifecycle state or a fabricated badge ─

test('renderRow(): every real REQUEST_STATES value renders without throwing and without inventing new states', () => {
    const { panel } = freshFullStackWithPanel();
    const REAL_STATES = ['REQUESTED', 'APPROVED', 'REJECTED', 'EXECUTING', 'COMPLETED', 'FAILED'];
    for (const state of REAL_STATES) {
        const html = panel.renderRow({
            id: 'adminreq_test', action: 'noop', requester: 'u1', state,
            policyId: null, workflowId: null, executionId: null, approver: null,
            failureReason: null, requestedAt: new Date().toISOString(),
            canDecide: state === 'REQUESTED', canDispatch: state === 'APPROVED',
        });
        assert.match(html, new RegExp(state));
    }
});

// ── 11. Static load-order check on the real admin-workspace.html ───────────

test('admin-workspace.html: real script order — IdentityEngine → CozyAutomation → PolicyEngine → WorkflowRuntime → Coordinator → Panel', () => {
    const html = fs.readFileSync(ADMIN_WORKSPACE_HTML_PATH, 'utf8');
    const scriptSrcs = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);

    const indexOf = (needle) => {
        const i = scriptSrcs.findIndex(src => src.endsWith(needle));
        assert.notEqual(i, -1, `expected a <script src="...${needle}"> tag in admin-workspace.html`);
        return i;
    };

    const identityIdx = indexOf('identity/identity-engine.js');
    const automationIdx = indexOf('automation/cozy-automation.js');
    const policyEngineIdx = indexOf('policy/policy-engine.js');
    const workflowRuntimeIdx = indexOf('automation/cozy-workflow-runtime.js');
    const coordinatorIdx = indexOf('administration/administrative-request-coordinator.js');
    const panelIdx = indexOf('administration/administrative-request-panel.js');

    assert.ok(identityIdx < automationIdx, 'IdentityEngine must load before CozyAutomation');
    assert.ok(identityIdx < policyEngineIdx, 'IdentityEngine must load before PolicyEngine');
    assert.ok(automationIdx < workflowRuntimeIdx, 'CozyAutomation must load before Cozy Workflow Runtime');
    assert.ok(policyEngineIdx < coordinatorIdx, 'PolicyEngine must load before the coordinator');
    assert.ok(workflowRuntimeIdx < coordinatorIdx, 'Cozy Workflow Runtime must load before the coordinator');
    assert.ok(coordinatorIdx < panelIdx, 'the coordinator must load before its UI panel');

    // PolicyEngine and Workflow Runtime are documented independent siblings —
    // no ordering constraint is asserted between them in either direction.
});

test('admin-workspace.html: dashboard.html-only surface is untouched by this milestone (no coordinator/panel tags there)', () => {
    const dashboardPath = path.join(path.dirname(ADMIN_WORKSPACE_HTML_PATH), 'dashboard.html');
    const dashboardHtml = fs.readFileSync(dashboardPath, 'utf8');
    assert.doesNotMatch(dashboardHtml, /administrative-request-coordinator\.js/);
    assert.doesNotMatch(dashboardHtml, /administrative-request-panel\.js/);
    assert.doesNotMatch(dashboardHtml, /policy\/policy-engine\.js/);
});
