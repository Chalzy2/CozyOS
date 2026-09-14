'use strict';

/**
 * core/modules/administration/tests/administrative-request-coordinator.test.js
 *
 * Focused, real-path tests for the new Administrative Request Coordinator.
 * No engine is mocked or stubbed: every test loads the real
 * PolicyEngine, IdentityEngine, CozyAutomation, and Cozy Workflow Runtime
 * source files fresh (same bare `global.window = { CozyOS: {} }` shim
 * convention already established by core/security/test/identity-engine.test.js),
 * then loads the real coordinator on top of them.
 *
 * Run: node --test core/modules/administration/tests/administrative-request-coordinator.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const IDENTITY_ENGINE_PATH = path.join(__dirname, '..', '..', 'identity', 'identity-engine.js');
const POLICY_ENGINE_PATH = path.join(__dirname, '..', '..', 'policy', 'policy-engine.js');
const COZY_AUTOMATION_PATH = path.join(__dirname, '..', '..', 'automation', 'cozy-automation.js');
const WORKFLOW_RUNTIME_PATH = path.join(__dirname, '..', '..', 'automation', 'cozy-workflow-runtime.js');
const COORDINATOR_PATH = path.join(__dirname, '..', 'administrative-request-coordinator.js');

function freshRequire(modPath) {
    delete require.cache[require.resolve(modPath)];
    require(modPath);
}

/** Loads the full real dependency chain + the real coordinator into a clean window shim. */
function freshFullStack() {
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

async function makeUser(IE, roles = []) {
    const res = await IE.createUser({ username: `user_${Math.random().toString(36).slice(2, 10)}`, password: 'anything', roles });
    assert.equal(res.available, true, 'test setup: user creation must succeed');
    return res.userId;
}

function makeSimpleWorkflow(AUTO, { failing = false } = {}) {
    // No actionId is pre-registered in CozyAutomation's `action` registry —
    // the runtime falls back to ref.type in that case, so this is enough to
    // exercise a real dispatched (or thrown) action without needing a
    // separate action-definition record.
    const workflowId = AUTO.workflow.create({
        name: 'Test Workflow',
        actions: [{ actionId: 'unregistered-action', type: failing ? 'execute_script' : 'call_ai' }],
    });
    return workflowId;
}

// ── 1. Unauthorized user cannot approve (policy-less path) ─────────────────

test('decideRequest(): a user without the "approver" role cannot approve a policy-less request', async () => {
    const { IE, ARC } = freshFullStack();
    const requester = await makeUser(IE);
    const notApprover = await makeUser(IE, ['staff']);

    const req = ARC.submitRequest({ action: 'user.suspend', requester });
    assert.throws(() => ARC.decideRequest(req.id, true, notApprover), /does not hold the "approver" role/);
    assert.equal(ARC.getRequest(req.id).state, 'REQUESTED');
});

// ── 1b. Unauthorized user cannot approve (policy-backed path, delegated) ───

test('decideRequest(): policy-backed requests delegate authorization to PolicyEngine, which also fails closed', async () => {
    const { IE, PE, ARC } = freshFullStack();
    const requester = await makeUser(IE);
    const notApprover = await makeUser(IE, ['staff']);
    const policy = PE.createPolicy({ name: 'Data Export Policy', category: 'ApprovalWorkflow' });

    const req = ARC.submitRequest({ action: 'data.export', requester, policyId: policy.id });
    assert.ok(req.approvalId, 'a real PolicyEngine approval request must have been opened');
    assert.throws(() => ARC.decideRequest(req.id, true, notApprover), /does not hold the "approver" role/);
});

// ── 2. Cannot execute while approval is pending ─────────────────────────────

test('dispatchRequest(): a request cannot execute while approval is pending', async () => {
    const { IE, AUTO, ARC } = freshFullStack();
    const requester = await makeUser(IE);
    const workflowId = makeSimpleWorkflow(AUTO);
    const req = ARC.submitRequest({ action: 'user.suspend', requester, workflowId });

    await assert.rejects(() => ARC.dispatchRequest(req.id), /is not APPROVED \(state "REQUESTED"\)/);
});

// ── 3. A rejected request cannot execute ────────────────────────────────────

test('dispatchRequest(): a rejected request cannot execute', async () => {
    const { IE, ARC, AUTO } = freshFullStack();
    const requester = await makeUser(IE);
    const approver = await makeUser(IE, ['approver']);
    const workflowId = makeSimpleWorkflow(AUTO);

    const req = ARC.submitRequest({ action: 'user.suspend', requester, workflowId });
    const decided = ARC.decideRequest(req.id, false, approver, { reason: 'not justified' });
    assert.equal(decided.state, 'REJECTED');

    await assert.rejects(() => ARC.dispatchRequest(req.id), /is not APPROVED \(state "REJECTED"\)/);
});

// ── 4 & 5. Approved request dispatches to the real workflow runtime; executionId recorded ──

test('dispatchRequest(): an approved request is dispatched to the real Cozy Workflow Runtime and records a real executionId', async () => {
    const { IE, ARC, AUTO, WF } = freshFullStack();
    const requester = await makeUser(IE);
    const approver = await makeUser(IE, ['approver']);
    const workflowId = makeSimpleWorkflow(AUTO);

    const req = ARC.submitRequest({ action: 'user.suspend', requester, workflowId });
    ARC.decideRequest(req.id, true, approver);

    const result = await ARC.dispatchRequest(req.id);
    assert.equal(result.state, 'COMPLETED');
    assert.ok(result.executionId, 'a real executionId must be recorded');

    // Cross-check directly against the real runtime's own history — the
    // coordinator's executionId must refer to a real execution WF itself ran.
    const realExecution = WF.getExecution(result.executionId);
    assert.ok(realExecution, 'the recorded executionId must resolve to a real WorkflowEngine execution');
    assert.equal(realExecution.state, 'completed');
});

// ── 6. Workflow failure produces FAILED, not fabricated success ────────────

test('dispatchRequest(): a real workflow execution failure produces FAILED on the request, never a fabricated COMPLETED', async () => {
    const { IE, ARC, AUTO, WF } = freshFullStack();
    WF.registerActionHandler('execute_script', async () => { throw new Error('simulated real handler failure'); });

    const requester = await makeUser(IE);
    const approver = await makeUser(IE, ['approver']);
    const workflowId = makeSimpleWorkflow(AUTO, { failing: true });

    const req = ARC.submitRequest({ action: 'user.suspend', requester, workflowId });
    ARC.decideRequest(req.id, true, approver);
    const result = await ARC.dispatchRequest(req.id);

    assert.equal(result.state, 'FAILED');
    assert.match(result.failureReason, /simulated real handler failure/);
});

// ── 7. Missing dependencies fail honestly ───────────────────────────────────

test('module load: coordinator does not attach when a required dependency (WorkflowEngine) is missing', () => {
    global.window = { CozyOS: {} };
    freshRequire(IDENTITY_ENGINE_PATH);
    freshRequire(POLICY_ENGINE_PATH);
    // CozyAutomation / WorkflowEngine deliberately NOT loaded.
    freshRequire(COORDINATOR_PATH);
    assert.equal(global.window.CozyOS.AdministrativeRequestCoordinator, undefined, 'coordinator must fail closed, not attach partially');
});

test('module load: coordinator does not attach when IdentityEngine is missing', () => {
    global.window = { CozyOS: {} };
    freshRequire(POLICY_ENGINE_PATH);
    freshRequire(COZY_AUTOMATION_PATH);
    freshRequire(WORKFLOW_RUNTIME_PATH);
    // IdentityEngine deliberately NOT loaded.
    freshRequire(COORDINATOR_PATH);
    assert.equal(global.window.CozyOS.AdministrativeRequestCoordinator, undefined, 'coordinator must fail closed, not attach partially');
});

// ── 8. No automatic approval occurs ─────────────────────────────────────────

test('submitRequest(): a newly submitted request is REQUESTED, never auto-approved', async () => {
    const { IE, ARC } = freshFullStack();
    const requester = await makeUser(IE);
    const req = ARC.submitRequest({ action: 'user.suspend', requester });
    assert.equal(req.state, 'REQUESTED');
    assert.equal(req.approver, null);
    assert.equal(req.approvalDecision, null);
});

// ── 9. Duplicate approval decisions are rejected ────────────────────────────

test('decideRequest(): a second decision on an already-decided request is rejected', async () => {
    const { IE, ARC } = freshFullStack();
    const requester = await makeUser(IE);
    const approver = await makeUser(IE, ['approver']);
    const req = ARC.submitRequest({ action: 'user.suspend', requester });

    ARC.decideRequest(req.id, true, approver);
    assert.throws(() => ARC.decideRequest(req.id, true, approver), /already decided/);
});

// ── 10. Duplicate execution is prevented ────────────────────────────────────

test('dispatchRequest(): a second dispatch on an already-dispatched request is prevented', async () => {
    const { IE, ARC, AUTO } = freshFullStack();
    const requester = await makeUser(IE);
    const approver = await makeUser(IE, ['approver']);
    const workflowId = makeSimpleWorkflow(AUTO);

    const req = ARC.submitRequest({ action: 'user.suspend', requester, workflowId });
    ARC.decideRequest(req.id, true, approver);
    await ARC.dispatchRequest(req.id);

    await assert.rejects(() => ARC.dispatchRequest(req.id), /is not APPROVED \(state "COMPLETED"\)/);
});

// ── 11. Request provenance survives the complete lifecycle ─────────────────

test('full lifecycle: request provenance (ids, actors, timestamps) survives REQUESTED -> APPROVED -> EXECUTING -> COMPLETED', async () => {
    const { IE, PE, ARC, AUTO } = freshFullStack();
    const requester = await makeUser(IE);
    const approver = await makeUser(IE, ['approver']);
    const policy = PE.createPolicy({ name: 'Refund Policy', category: 'ApprovalWorkflow' });
    const workflowId = makeSimpleWorkflow(AUTO);

    const submitted = ARC.submitRequest({ action: 'order.refund', requester, policyId: policy.id, workflowId, payload: { orderId: 'ord_1' } });
    assert.equal(submitted.action, 'order.refund');
    assert.equal(submitted.requester, requester);
    assert.equal(submitted.policyId, policy.id);
    assert.ok(submitted.approvalId);
    assert.ok(submitted.requestedAt);

    const decided = ARC.decideRequest(submitted.id, true, approver);
    assert.equal(decided.approver, approver);
    assert.equal(decided.approvalDecision, 'APPROVED');
    assert.ok(decided.decidedAt);

    const finished = await ARC.dispatchRequest(submitted.id);
    assert.equal(finished.state, 'COMPLETED');
    assert.ok(finished.executionId);
    assert.ok(finished.startedAt);
    assert.ok(finished.endedAt);

    // Final read-back — every provenance field must still be present together.
    const final = ARC.getRequest(submitted.id);
    assert.deepEqual(
        { id: final.id, action: final.action, requester: final.requester, policyId: final.policyId, approvalId: final.approvalId, approver: final.approver, approvalDecision: final.approvalDecision, workflowId: final.workflowId, executionId: final.executionId, state: final.state },
        { id: submitted.id, action: 'order.refund', requester, policyId: policy.id, approvalId: submitted.approvalId, approver, approvalDecision: 'APPROVED', workflowId, executionId: final.executionId, state: 'COMPLETED' }
    );
});

// ── 12. Audit events identify requester, approver, requestId, executionId ──

test('getAuditLog(): audit entries identify requester, approver, requestId and executionId where available', async () => {
    const { IE, ARC, AUTO } = freshFullStack();
    const requester = await makeUser(IE);
    const approver = await makeUser(IE, ['approver']);
    const workflowId = makeSimpleWorkflow(AUTO);

    const req = ARC.submitRequest({ action: 'user.suspend', requester, workflowId });
    ARC.decideRequest(req.id, true, approver);
    const result = await ARC.dispatchRequest(req.id);

    const log = ARC.getAuditLog();
    const submittedEntry = log.find(e => e.action === 'REQUEST_SUBMITTED' && e.requestId === req.id);
    const decidedEntry = log.find(e => e.action === 'REQUEST_DECIDED' && e.requestId === req.id);
    const completedEntry = log.find(e => e.action === 'REQUEST_COMPLETED' && e.requestId === req.id);

    assert.ok(submittedEntry && submittedEntry.requester === requester);
    assert.ok(decidedEntry && decidedEntry.approver === approver);
    assert.ok(completedEntry && completedEntry.executionId === result.executionId && completedEntry.requester === requester && completedEntry.approver === approver);
});
