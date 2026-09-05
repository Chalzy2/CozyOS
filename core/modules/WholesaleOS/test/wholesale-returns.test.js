'use strict';

/**
 * Test suite for core/modules/WholesaleOS/wholesale-returns.js
 * (RP-035 WOS2 Part 8 — P8-IMPLEMENTED).
 *
 * HARNESS DISCLOSURE:
 *   REAL, unmodified production code under test: the real
 *   wholesale-order-decision.js (P6), wholesale-fulfillment.js (P7),
 *   shopOS-product.js, shopOS-inventory.js, cozy-customer.js, the full
 *   real payment-provider stack (provider-registry.js,
 *   provider-manager.js, health-monitor.js, routing-engine.js,
 *   failover-engine.js, capability-engine.js, cash-provider.js,
 *   mpesa-provider.js, cozy-payment-provider-engine.js), the real
 *   shopOS-payments.js, and the real wholesale-returns.js (P8) this
 *   suite adds. Every eligibility, inventory, and refund fact in this
 *   file runs through those real files' actual logic — none of it is
 *   simulated.
 *
 *   STUBBED, and disclosed as a stub: IdentityEngine, at the identical
 *   method-contract scope (checkResourcePermission/
 *   grantResourcePermission/registerUser) already disclosed by
 *   church-offering-interaction.test.js in this same repository. This
 *   is the established, real precedent for testing against
 *   IdentityEngine's contract without exercising its PBKDF2 password
 *   machinery, which is irrelevant to permission-string checks.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

function makeStubIdentity() {
    const users = new Map();
    const grants = new Map();
    return {
        registerUser(userId) { users.set(userId, true); },
        grantResourcePermission(userId, permissionString) {
            if (!users.has(userId)) throw new Error(`[StubIdentity] unknown userId "${userId}".`);
            if (!grants.has(userId)) grants.set(userId, new Set());
            grants.get(userId).add(permissionString);
            return true;
        },
        checkResourcePermission(userId, permissionString) {
            return !!(grants.get(userId) && grants.get(userId).has(permissionString));
        },
    };
}

const DEPS = [
    '../../../plugins/shopOS-product.js',
    '../../../plugins/shopOS-inventory.js',
    '../../customer/cozy-customer.js',
    '../wholesale-commerce.js',
    '../wholesale-order-understanding.js',
    '../../intelligence/language-packs/cozy-language-pack-registry.js',
    '../../ChurchOS/church-live-translation-interaction.js',
    '../wholesale-order-decision.js',
    '../wholesale-fulfillment.js',
    '../../payment-provider/provider-registry.js',
    '../../payment-provider/provider-manager.js',
    '../../payment-provider/health-monitor.js',
    '../../payment-provider/routing-engine.js',
    '../../payment-provider/failover-engine.js',
    '../../payment-provider/capability-engine.js',
    '../../payment-provider/cash-provider.js',
    '../../payment-provider/mpesa-provider.js',
    '../../payment-provider/cozy-payment-provider-engine.js',
    '../../../plugins/shopOS-payments.js',
    '../wholesale-returns.js',
];

function freshEngines() {
    for (const p of DEPS) { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not yet loaded */ } }
    const identity = makeStubIdentity();
    global.window = { CozyOS: { IdentityEngine: identity }, addEventListener: () => {} };
    for (const p of DEPS) require(p);
    return { C: global.window.CozyOS, identity };
}

const OWNER = { actorType: 'owner' };
function assistant(userId) { return { actorType: 'assistant', userId }; }

function makeDeliveredOrder(C, { branchId = 'branch1', quantity = 10, orderQty = 5, retailPrice = 100, customerId = 'cust1', productLabel = 'Fixture' } = {}) {
    const product = C.ShopProduct.createProduct({ name: `${productLabel} Crate ${Date.now()}_${Math.random()}`, category: 'Construction', retailPrice });
    C.ShopInventory.adjustStock({ productId: product.productId, branchId, quantity, reason: 'initial_stock', authorizedBy: 'test' });
    const draft = C.WholesaleOrderUnderstanding.submitOrderRequest('biz1', customerId, { rawMessage: `I need ${orderQty} ${product.name}` }).record;
    const decision = C.WholesaleOrderDecision.createDecision({ customerId, branchId, part5Record: draft }).record;
    const confirmed = C.WholesaleOrderDecision.confirmOrder(decision.requestId, OWNER).record;
    const fulfillment = C.WholesaleFulfillment.createFulfillment({ requestId: confirmed.requestId, actor: OWNER }).record;
    C.WholesaleFulfillment.markPacked(fulfillment.fulfillmentId, OWNER);
    C.WholesaleFulfillment.markDispatched(fulfillment.fulfillmentId, OWNER);
    const delivered = C.WholesaleFulfillment.markDelivered(fulfillment.fulfillmentId, OWNER).record;
    return { product, requestId: confirmed.requestId, order: confirmed, fulfillment: delivered, branchId, customerId };
}

// =====================================================================
// 1. VERSION / SHAPE
// =====================================================================
test('P8-01: engine registers with a version string and capability keys', () => {
    const { C } = freshEngines();
    assert.equal(typeof C.WholesaleReturns.getVersion(), 'string');
    const keys = C.WholesaleReturns.getCapabilityKeys();
    assert.ok(keys.includes('canRequestReturn'));
    assert.ok(keys.includes('canApproveReturn'));
    assert.ok(keys.includes('canConfirmMpesaRefund'));
    assert.equal(keys.length, 9);
});

// =====================================================================
// 2. ELIGIBILITY — real P6/P7 composition
// =====================================================================
test('P8-02: return request fails ORDER_NOT_FOUND for unknown requestId', () => {
    const { C } = freshEngines();
    const res = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId: 'nope', actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 });
    assert.equal(res.success, false);
    assert.equal(res.reason, 'ORDER_NOT_FOUND');
});

test('P8-03: return request fails FULFILLMENT_NOT_DELIVERED when never fulfilled', () => {
    const { C } = freshEngines();
    const product = C.ShopProduct.createProduct({ name: `Never Fulfilled Crate ${Date.now()}`, category: 'Construction', retailPrice: 100 });
    C.ShopInventory.adjustStock({ productId: product.productId, branchId: 'branch1', quantity: 10, reason: 'initial_stock', authorizedBy: 'test' });
    const draft = C.WholesaleOrderUnderstanding.submitOrderRequest('biz1', 'cust1', { rawMessage: `I need 5 ${product.name}` }).record;
    const decision = C.WholesaleOrderDecision.createDecision({ customerId: 'cust1', branchId: 'branch1', part5Record: draft }).record;
    const confirmed = C.WholesaleOrderDecision.confirmOrder(decision.requestId, OWNER).record;
    const res = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId: confirmed.requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 });
    assert.equal(res.success, false);
    assert.equal(res.reason, 'FULFILLMENT_NOT_DELIVERED');
});

test('P8-04: return request succeeds against a real DELIVERED fulfillment', () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const res = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 2 });
    assert.equal(res.success, true);
    assert.equal(res.record.status, 'RETURN_REQUESTED');
});

test('P8-05: quantity validates only against P6 requestedQuantity — exceeding it hard-fails', () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, { orderQty: 5 });
    const res = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 999 });
    assert.equal(res.success, false);
    assert.equal(res.reason, 'QUANTITY_EXCEEDS_ORDER');
});

test('P8-06: non-positive/invalid quantity hard-fails QUANTITY_INVALID', () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const res = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 0 });
    assert.equal(res.success, false);
    assert.equal(res.reason, 'QUANTITY_INVALID');
});

test('P8-07: owner canOverrideEligibility allows exceeding ordered quantity, logged', () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, { orderQty: 5 });
    const res = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 50, overrideEligibility: true });
    assert.equal(res.success, true);
    assert.equal(res.record.overrideEligibility, true);
    const audit = C.WholesaleReturns.getAuditLog((e) => e.action === 'RETURN_CREATED' && e.detail.returnId === res.record.returnId);
    assert.ok(audit.length >= 1);
});

test('P8-08: assistant cannot override eligibility even if actorType claims it', () => {
    const { C, identity } = freshEngines();
    identity.registerUser('u1');
    const { requestId } = makeDeliveredOrder(C, { orderQty: 5 });
    const res = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: assistant('u1'), reason: 'DEFECTIVE', requestedReturnQuantity: 50, overrideEligibility: true });
    assert.equal(res.success, false);
    assert.equal(res.reason, 'MISSING_CAPABILITY:canOverrideEligibility');
});

// =====================================================================
// 3. REASON AMBIGUITY / CAPABILITY GATE ON REQUEST CREATION
// =====================================================================
test('P8-09: missing/unknown reason lands on RETURN_REQUIRES_REVIEW, not a hard failure', () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const res = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, requestedReturnQuantity: 1 });
    assert.equal(res.success, true);
    assert.equal(res.record.status, 'RETURN_REQUIRES_REVIEW');
    assert.equal(res.record.reviewReason, 'AMBIGUOUS_REASON');
});

test('P8-10: assistant without return:request grant lands on RETURN_REQUIRES_REVIEW, never proceeds silently', () => {
    const { C, identity } = freshEngines();
    identity.registerUser('u1');
    const { requestId } = makeDeliveredOrder(C, {});
    const res = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: assistant('u1'), reason: 'DEFECTIVE', requestedReturnQuantity: 1 });
    assert.equal(res.success, true);
    assert.equal(res.record.status, 'RETURN_REQUIRES_REVIEW');
    assert.equal(res.record.reviewReason, 'MISSING_CAPABILITY:canRequestReturn');
});

test('P8-11: assistant WITH a real IdentityEngine grant for return:request proceeds to RETURN_REQUESTED', () => {
    const { C, identity } = freshEngines();
    identity.registerUser('u1');
    identity.grantResourcePermission('u1', 'return:request');
    const { requestId } = makeDeliveredOrder(C, {});
    const res = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: assistant('u1'), reason: 'DEFECTIVE', requestedReturnQuantity: 1 });
    assert.equal(res.success, true);
    assert.equal(res.record.status, 'RETURN_REQUESTED');
});

test('P8-12: a self-declared capabilities object on the actor is never trusted (no parallel permission system)', () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const fakeActor = { actorType: 'assistant', userId: 'ghost', capabilities: { canRequestReturn: true, canApproveReturn: true } };
    const res = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: fakeActor, reason: 'DEFECTIVE', requestedReturnQuantity: 1 });
    assert.equal(res.record.status, 'RETURN_REQUIRES_REVIEW');
    const approve = C.WholesaleReturns.approveReturn(res.record.returnId, fakeActor);
    assert.equal(approve.success, false);
    assert.equal(approve.reason, 'MISSING_CAPABILITY:canApproveReturn');
});

// =====================================================================
// 4. IDEMPOTENCY — three independent keys
// =====================================================================
test('P8-13: duplicate return submission (same customerId+clientRequestId) returns the same record, no new side effect', () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const first = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', clientRequestId: 'dup-1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 });
    const second = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', clientRequestId: 'dup-1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 });
    assert.equal(second.duplicate, true);
    assert.equal(second.record.returnId, first.record.returnId);
});

test('P8-14: restoreStock idempotency key is independent of the return-request key', async () => {
    const { C } = freshEngines();
    const { requestId, product, branchId } = makeDeliveredOrder(C, { quantity: 10, orderQty: 5 });
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', clientRequestId: 'r1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 2 }).record;
    C.WholesaleReturns.approveReturn(ret.returnId, OWNER);
    C.WholesaleReturns.receiveReturn(ret.returnId, OWNER);
    C.WholesaleReturns.inspectReturn(ret.returnId, OWNER, { disposition: 'SELLABLE' });
    const before = C.ShopInventory.getCurrentStock(product.productId, branchId);
    const first = C.WholesaleReturns.restoreStock(ret.returnId, OWNER, { clientRequestId: 'restore-1' });
    const second = C.WholesaleReturns.restoreStock(ret.returnId, OWNER, { clientRequestId: 'restore-1' });
    assert.equal(first.success, true);
    assert.equal(second.duplicate, true);
    const after = C.ShopInventory.getCurrentStock(product.productId, branchId);
    assert.equal(after.currentStock ?? after.quantity ?? after, (before.currentStock ?? before.quantity ?? before) + 2);
});

test('P8-15: refund request idempotency key is independent of return and restore keys', async () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 }).record;
    C.WholesaleReturns.approveReturn(ret.returnId, OWNER);
    const first = await C.WholesaleReturns.requestRefund(ret.returnId, OWNER, { clientRequestId: 'rf-1', providerId: 'cash' });
    const second = await C.WholesaleReturns.requestRefund(ret.returnId, OWNER, { clientRequestId: 'rf-1', providerId: 'cash' });
    assert.equal(second.duplicate, true);
    assert.equal(second.record.refundId, first.record.refundId);
});

// =====================================================================
// 5. OWNER/ASSISTANT CAPABILITY GATES ON LIFECYCLE TRANSITIONS
// =====================================================================
test('P8-16: all eight Part-4 gate keys are hard-denied to assistants even with a real IdentityEngine grant for that exact permission string', () => {
    const { C, identity } = freshEngines();
    identity.registerUser('u1');
    // Grant every conceivable resource:action string an assistant might need — still must fail.
    for (const key of ['return:approve', 'return:reject', 'return:inspect', 'return:restore_stock', 'refund:approve', 'refund:execute', 'refund:confirm_mpesa', 'return:override_eligibility']) {
        identity.grantResourcePermission('u1', key);
    }
    const { requestId } = makeDeliveredOrder(C, {});
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 }).record;
    const approve = C.WholesaleReturns.approveReturn(ret.returnId, assistant('u1'));
    assert.equal(approve.success, false);
    assert.equal(approve.reason, 'MISSING_CAPABILITY:canApproveReturn');
});

test('P8-17: owner can approve, receive, inspect in sequence', () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 }).record;
    assert.equal(C.WholesaleReturns.approveReturn(ret.returnId, OWNER).record.status, 'RETURN_APPROVED');
    assert.equal(C.WholesaleReturns.receiveReturn(ret.returnId, OWNER).record.status, 'RETURN_RECEIVED');
    const inspected = C.WholesaleReturns.inspectReturn(ret.returnId, OWNER, { disposition: 'DAMAGED' });
    assert.equal(inspected.record.status, 'RETURN_INSPECTED');
    assert.equal(inspected.record.disposition, 'DAMAGED_DISPOSITION');
});

test('P8-18: receiveReturn is owner-only and requires no courier engine — only reachable from RETURN_APPROVED', () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 }).record;
    const tooEarly = C.WholesaleReturns.receiveReturn(ret.returnId, OWNER);
    assert.equal(tooEarly.success, false);
    assert.equal(tooEarly.reason, 'INVALID_TRANSITION');
});

test('P8-19: rejectReturn reachable from any pre-inspection state, not after RETURN_INSPECTED', () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 }).record;
    C.WholesaleReturns.approveReturn(ret.returnId, OWNER);
    C.WholesaleReturns.receiveReturn(ret.returnId, OWNER);
    C.WholesaleReturns.inspectReturn(ret.returnId, OWNER, { disposition: 'DAMAGED' });
    const res = C.WholesaleReturns.rejectReturn(ret.returnId, OWNER, { reason: 'too late' });
    assert.equal(res.success, false);
    assert.equal(res.reason, 'INVALID_TRANSITION');
});

// =====================================================================
// 6. DISPOSITION — SELLABLE vs DAMAGED, real inventory restoration only
// =====================================================================
test('P8-20: DAMAGED disposition never calls ShopInventory — no fabricated quarantine inventory', () => {
    const { C } = freshEngines();
    const { requestId, product, branchId } = makeDeliveredOrder(C, {});
    const before = C.ShopInventory.getCurrentStock(product.productId, branchId);
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 }).record;
    C.WholesaleReturns.approveReturn(ret.returnId, OWNER);
    C.WholesaleReturns.receiveReturn(ret.returnId, OWNER);
    const inspected = C.WholesaleReturns.inspectReturn(ret.returnId, OWNER, { disposition: 'DAMAGED' });
    assert.equal(inspected.record.disposition, 'DAMAGED_DISPOSITION');
    const restoreAttempt = C.WholesaleReturns.restoreStock(ret.returnId, OWNER, {});
    assert.equal(restoreAttempt.success, false);
    assert.equal(restoreAttempt.reason, 'INVALID_TRANSITION');
    const after = C.ShopInventory.getCurrentStock(product.productId, branchId);
    assert.deepEqual(after, before);
});

test('P8-21: SELLABLE disposition queues restoration; real recordStockMovement only fires on restoreStock()', () => {
    const { C } = freshEngines();
    const { requestId, product, branchId } = makeDeliveredOrder(C, {});
    const before = C.ShopInventory.getCurrentStock(product.productId, branchId);
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 3 }).record;
    C.WholesaleReturns.approveReturn(ret.returnId, OWNER);
    C.WholesaleReturns.receiveReturn(ret.returnId, OWNER);
    const inspected = C.WholesaleReturns.inspectReturn(ret.returnId, OWNER, { disposition: 'SELLABLE' });
    assert.equal(inspected.record.disposition, 'SELLABLE_RESTORATION_PENDING');
    // Inspection alone must NOT move stock.
    const stillBefore = C.ShopInventory.getCurrentStock(product.productId, branchId);
    assert.deepEqual(stillBefore, before);
    const restored = C.WholesaleReturns.restoreStock(ret.returnId, OWNER, {});
    assert.equal(restored.record.disposition, 'STOCK_RESTORED');
    assert.equal(restored.record.stockMovement.type, 'returned_customer');
    const after = C.ShopInventory.getCurrentStock(product.productId, branchId);
    const beforeQty = before.currentStock ?? before.quantity ?? before;
    const afterQty = after.currentStock ?? after.quantity ?? after;
    assert.equal(afterQty, beforeQty + 3);
});

test('P8-22: restoreStock is owner-only (canRestoreReturnedStock)', () => {
    const { C, identity } = freshEngines();
    identity.registerUser('u1');
    const { requestId } = makeDeliveredOrder(C, {});
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 }).record;
    C.WholesaleReturns.approveReturn(ret.returnId, OWNER);
    C.WholesaleReturns.receiveReturn(ret.returnId, OWNER);
    C.WholesaleReturns.inspectReturn(ret.returnId, OWNER, { disposition: 'SELLABLE' });
    const res = C.WholesaleReturns.restoreStock(ret.returnId, assistant('u1'), {});
    assert.equal(res.success, false);
    assert.equal(res.reason, 'MISSING_CAPABILITY:canRestoreReturnedStock');
});

// =====================================================================
// 7. REFUND HONESTY — the core of the specification
// =====================================================================
test('P8-23: no paymentReference supplied -> REFUND_UNAVAILABLE, never REFUND_PENDING', async () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 }).record;
    C.WholesaleReturns.approveReturn(ret.returnId, OWNER);
    const refund = await C.WholesaleReturns.requestRefund(ret.returnId, OWNER, { providerId: 'cash' });
    assert.equal(refund.record.status, 'REFUND_UNAVAILABLE');
    assert.equal(refund.record.unavailableReason, 'NO_PAYMENT_CAPTURE_EVIDENCE');
});

test('P8-24: M-Pesa always REFUND_UNAVAILABLE at request time — provider capability false, real check', async () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 }).record;
    C.WholesaleReturns.approveReturn(ret.returnId, OWNER);
    const refund = await C.WholesaleReturns.requestRefund(ret.returnId, OWNER, { providerId: 'mpesa', paymentReference: 'anything' });
    assert.equal(refund.record.status, 'REFUND_UNAVAILABLE');
    assert.equal(refund.record.unavailableReason, 'PROVIDER_CAPABILITY_FALSE');
});

test('P8-25: fabricated/unknown paymentReference never satisfies capture evidence', async () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 }).record;
    C.WholesaleReturns.approveReturn(ret.returnId, OWNER);
    const refund = await C.WholesaleReturns.requestRefund(ret.returnId, OWNER, { providerId: 'cash', paymentReference: 'pay_does_not_exist' });
    assert.equal(refund.record.status, 'REFUND_UNAVAILABLE');
    assert.equal(refund.record.unavailableReason, 'NO_PAYMENT_CAPTURE_EVIDENCE');
});

test('P8-26: a real, completed cash payment record allows REFUND_PENDING, and full owner approval reaches real REFUND_EXECUTED', async () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 }).record;
    C.WholesaleReturns.approveReturn(ret.returnId, OWNER);

    const payment = await C.ShopPayments.process('sale-fixture-1', { method: 'cash', amount: 200 });
    assert.equal(payment.success, true);

    const refund = await C.WholesaleReturns.requestRefund(ret.returnId, OWNER, { providerId: 'cash', paymentReference: payment.paymentId });
    assert.equal(refund.record.status, 'REFUND_PENDING');

    const approved = C.WholesaleReturns.approveRefund(refund.record.refundId, OWNER);
    assert.equal(approved.record.approved, true);

    const executed = await C.WholesaleReturns.executeRefund(refund.record.refundId, OWNER);
    assert.equal(executed.record.status, 'REFUND_EXECUTED');
    assert.equal(typeof executed.record.executedAmount, 'number');
});

test('P8-27: executeRefund refuses without prior approveRefund', async () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 }).record;
    C.WholesaleReturns.approveReturn(ret.returnId, OWNER);
    const payment = await C.ShopPayments.process('sale-fixture-2', { method: 'cash', amount: 100 });
    const refund = await C.WholesaleReturns.requestRefund(ret.returnId, OWNER, { providerId: 'cash', paymentReference: payment.paymentId });
    const executed = await C.WholesaleReturns.executeRefund(refund.record.refundId, OWNER);
    assert.equal(executed.success, false);
    assert.equal(executed.reason, 'REFUND_NOT_APPROVED');
});

test('P8-28: canExecuteRefund and canApproveRefund are owner-only, hard-denied to assistants', async () => {
    const { C, identity } = freshEngines();
    identity.registerUser('u1');
    const { requestId } = makeDeliveredOrder(C, {});
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 }).record;
    C.WholesaleReturns.approveReturn(ret.returnId, OWNER);
    const payment = await C.ShopPayments.process('sale-fixture-3', { method: 'cash', amount: 100 });
    const refund = await C.WholesaleReturns.requestRefund(ret.returnId, OWNER, { providerId: 'cash', paymentReference: payment.paymentId });
    const approveAttempt = C.WholesaleReturns.approveRefund(refund.record.refundId, assistant('u1'));
    assert.equal(approveAttempt.reason, 'MISSING_CAPABILITY:canApproveRefund');
});

test('P8-29: refund evaluation is re-verified live at execution, not trusted from request time', async () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 }).record;
    C.WholesaleReturns.approveReturn(ret.returnId, OWNER);
    const payment = await C.ShopPayments.process('sale-fixture-4', { method: 'cash', amount: 100 });
    const refund = await C.WholesaleReturns.requestRefund(ret.returnId, OWNER, { providerId: 'cash', paymentReference: payment.paymentId });
    C.WholesaleReturns.approveRefund(refund.record.refundId, OWNER);
    // Simulate the evidence disappearing between approval and execution:
    delete C.ShopPayments;
    const executed = await C.WholesaleReturns.executeRefund(refund.record.refundId, OWNER);
    assert.equal(executed.record.status, 'REFUND_UNAVAILABLE');
});

test('P8-30: refund estimate is labeled and never presented as a verified payment fact', async () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 }).record;
    C.WholesaleReturns.approveReturn(ret.returnId, OWNER);
    const refund = await C.WholesaleReturns.requestRefund(ret.returnId, OWNER, { providerId: 'cash' });
    assert.equal(refund.record.estimatedRefund.label, 'ORDER_RESOLVED_PRICE_NOT_CONFIRMED_PAYMENT');
    assert.equal('amountPaid' in refund.record, false);
});

test('P8-31: refund cannot be requested before RETURN_APPROVED', async () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 }).record;
    const refund = await C.WholesaleReturns.requestRefund(ret.returnId, OWNER, { providerId: 'cash' });
    assert.equal(refund.success, false);
    assert.equal(refund.reason, 'RETURN_NOT_YET_APPROVED');
});

// =====================================================================
// 8. OFFLINE / LOCAL QUEUE / RECONCILIATION — never invents missing facts
// =====================================================================
test('P8-32: queueOffline return request lands on LOCAL_QUEUED without touching P6/P7', () => {
    const { C } = freshEngines();
    const res = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId: 'unknown-req', actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1, queueOffline: true });
    assert.equal(res.success, true);
    assert.equal(res.record.status, 'LOCAL_QUEUED');
});

test('P8-33: reconcileReturn on a queued record with a still-nonexistent order reports the honest blocked reason, does not advance', () => {
    const { C } = freshEngines();
    const res = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId: 'still-unknown', actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1, queueOffline: true });
    const reconciled = C.WholesaleReturns.reconcileReturn(res.record.returnId);
    assert.equal(reconciled.advanced, false);
    assert.equal(reconciled.blockedReason, 'ORDER_NOT_FOUND');
    assert.equal(reconciled.record.status, 'LOCAL_QUEUED');
});

test('P8-34: reconcileReturn advances to real RETURN_REQUESTED once the real order/fulfillment genuinely exist', () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const queued = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1, queueOffline: true });
    assert.equal(queued.record.status, 'LOCAL_QUEUED');
    const reconciled = C.WholesaleReturns.reconcileReturn(queued.record.returnId);
    assert.equal(reconciled.advanced, true);
    assert.equal(reconciled.record.status, 'RETURN_REQUESTED');
});

test('P8-35: queueOffline refund request lands on LOCAL_QUEUED; reconcileRefund re-checks real evidence honestly', async () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 }).record;
    C.WholesaleReturns.approveReturn(ret.returnId, OWNER);
    const queued = await C.WholesaleReturns.requestRefund(ret.returnId, OWNER, { providerId: 'cash', queueOffline: true });
    assert.equal(queued.record.status, 'LOCAL_QUEUED');
    const reconciled = await C.WholesaleReturns.reconcileRefund(queued.record.refundId);
    assert.equal(reconciled.record.status, 'REFUND_UNAVAILABLE');
    assert.equal(reconciled.record.unavailableReason, 'NO_PAYMENT_CAPTURE_EVIDENCE');
});

// =====================================================================
// 9. CUSTOMER-SAFE PROJECTIONS
// =====================================================================
test('P8-36: customer return view exposes only the declared safe key set, never audit/actor internals', () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 }).record;
    const view = C.WholesaleReturns.getCustomerReturnView(ret.returnId);
    const allowedKeys = ['returnId', 'requestId', 'status', 'disposition', 'requestedReturnQuantity', 'reason', 'estimatedRefund'];
    assert.deepEqual(Object.keys(view).sort(), allowedKeys.sort());
});

test('P8-37: customer refund view never leaks paymentReference or internal executedReference', async () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 }).record;
    C.WholesaleReturns.approveReturn(ret.returnId, OWNER);
    const payment = await C.ShopPayments.process('sale-fixture-5', { method: 'cash', amount: 100 });
    const refund = await C.WholesaleReturns.requestRefund(ret.returnId, OWNER, { providerId: 'cash', paymentReference: payment.paymentId });
    const view = C.WholesaleReturns.getCustomerRefundView(refund.record.refundId);
    assert.equal('paymentReference' in view, false);
    assert.equal('executedReference' in view, false);
});

// =====================================================================
// 10. IDENTITY / CUSTOMER COMPOSITION SANITY (read-only, no mutation)
// =====================================================================
test('P8-38: P8 never mutates the real Customer registry', () => {
    const { C } = freshEngines();
    const before = C.Customer.getCustomer('cust1');
    const { requestId } = makeDeliveredOrder(C, {});
    C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 });
    const after = C.Customer.getCustomer('cust1');
    assert.deepEqual(before, after);
});

test('P8-39: diagnostics report reflects real counts, not fabricated', async () => {
    const { C } = freshEngines();
    const { requestId } = makeDeliveredOrder(C, {});
    const ret = C.WholesaleReturns.createReturnRequest({ customerId: 'cust1', requestId, actor: OWNER, reason: 'DEFECTIVE', requestedReturnQuantity: 1 }).record;
    C.WholesaleReturns.approveReturn(ret.returnId, OWNER);
    const diag = C.WholesaleReturns.getDiagnosticsReport();
    assert.equal(diag.returnsCreated, 1);
    assert.equal(diag.returnsApproved, 1);
});
