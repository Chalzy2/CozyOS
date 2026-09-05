'use strict';

/**
 * WOS2 Part 7 test suite for
 *   core/modules/WholesaleOS/wholesale-fulfillment.js
 *
 * HARNESS DISCLOSURE (read before trusting these numbers):
 *   REAL, unmodified-by-this-suite production code under test: the real
 *   shopOS-product.js, shopOS-inventory.js, wholesale-commerce.js,
 *   wholesale-order-understanding.js, wholesale-order-decision.js
 *   (Part 6), cozy-language-pack-registry.js, and
 *   church-live-translation-interaction.js (PHC6). Every product,
 *   stock, price, Part-5 draft, and Part-6 CONFIRMED order in this
 *   suite is produced by those real files' actual logic — no
 *   fakes/stubs substitute for any of them. Part 6's own confirmOrder()
 *   is the only path used to reach CONFIRMED status in this suite.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

function freshWindow() {
    global.window = { CozyOS: {}, addEventListener: () => {} };
    for (const mod of [
        '../../../plugins/shopOS-product.js',
        '../../../plugins/shopOS-inventory.js',
        '../../customer/cozy-customer.js',
        '../wholesale-commerce.js',
        '../wholesale-order-understanding.js',
        '../../intelligence/language-packs/cozy-language-pack-registry.js',
        '../../ChurchOS/church-live-translation-interaction.js',
        '../wholesale-order-decision.js',
        '../wholesale-fulfillment.js',
    ]) {
        try { delete require.cache[require.resolve(mod)]; } catch (_e) { /* not yet required */ }
    }
    require('../../../plugins/shopOS-product.js');
    require('../../../plugins/shopOS-inventory.js');
    require('../../customer/cozy-customer.js');
    require('../wholesale-commerce.js');
    require('../wholesale-order-understanding.js');
    require('../../intelligence/language-packs/cozy-language-pack-registry.js');
    require('../../ChurchOS/church-live-translation-interaction.js');
    require('../wholesale-order-decision.js');
    require('../wholesale-fulfillment.js');

    return {
        product: global.window.CozyOS.ShopProduct,
        inventory: global.window.CozyOS.ShopInventory,
        commerce: global.window.CozyOS.WholesaleCommerce,
        understanding: global.window.CozyOS.WholesaleOrderUnderstanding,
        decision: global.window.CozyOS.WholesaleOrderDecision,
        engine: global.window.CozyOS.WholesaleFulfillment,
    };
}

const BRANCH = 'branch1';
const OWNER = { actorType: 'owner' };
function assistant(caps = {}) { return { actorType: 'assistant', capabilities: caps }; }

let fixtureSeq = 0;

// Produces a real CONFIRMED Part 6 requestId, driving the real chain
// end to end (product -> stock -> Part 5 draft -> Part 6 decision ->
// Part 6 confirmOrder). No fields are fabricated by this helper.
function confirmedOrder(ctx, { stock = 10, retailPrice = 100, quantity = 5, customerId = 'cust1' } = {}) {
    fixtureSeq += 1;
    const name = `Fixture Crate ${fixtureSeq}`;
    const p = ctx.product.createProduct({ name, category: 'Construction', retailPrice });
    ctx.inventory.adjustStock({ productId: p.productId, branchId: BRANCH, quantity: stock, reason: 'initial_stock', authorizedBy: 'test' });
    const draft = ctx.understanding.submitOrderRequest('biz1', customerId, { rawMessage: `I need ${quantity} ${name.toLowerCase()}` }).record;
    assert.equal(draft.status, 'DRAFT_RESOLVED', 'fixture precondition: Part 5 record must resolve');
    const decisionResult = ctx.decision.createDecision({ customerId, branchId: BRANCH, part5Record: draft });
    assert.equal(decisionResult.record.status, 'FULFILLABLE', 'fixture precondition: Part 6 decision must be FULFILLABLE');
    const confirmResult = ctx.decision.confirmOrder(decisionResult.record.requestId, OWNER);
    assert.equal(confirmResult.record.status, 'CONFIRMED', 'fixture precondition: order must reach CONFIRMED');
    return { requestId: confirmResult.record.requestId, product: p };
}

function nonConfirmedOrder(ctx, { stock = 0, quantity = 5, customerId = 'cust1' } = {}) {
    fixtureSeq += 1;
    const name = `Fixture Unavailable ${fixtureSeq}`;
    const p = ctx.product.createProduct({ name, category: 'Construction', retailPrice: 100 });
    if (stock) ctx.inventory.adjustStock({ productId: p.productId, branchId: BRANCH, quantity: stock, reason: 'initial_stock', authorizedBy: 'test' });
    const draft = ctx.understanding.submitOrderRequest('biz1', customerId, { rawMessage: `I need ${quantity} ${name.toLowerCase()}` }).record;
    const decisionResult = ctx.decision.createDecision({ customerId, branchId: BRANCH, part5Record: draft });
    return decisionResult.record; // status e.g. INSUFFICIENT_STOCK, never CONFIRMED
}

// 1. create fulfillment for real CONFIRMED order -> PENDING_FULFILLMENT
test('1. createFulfillment for a real CONFIRMED order -> PENDING_FULFILLMENT', () => {
    const ctx = freshWindow();
    const { requestId } = confirmedOrder(ctx);
    const r = ctx.engine.createFulfillment({ requestId, actor: OWNER });
    assert.equal(r.success, true);
    assert.equal(r.record.status, 'PENDING_FULFILLMENT');
    assert.equal(r.record.requestId, requestId);
});

// 2. non-existent requestId -> ORDER_NOT_FOUND
test('2. createFulfillment for non-existent requestId -> ORDER_NOT_FOUND', () => {
    const ctx = freshWindow();
    const r = ctx.engine.createFulfillment({ requestId: 'wod_bogus_1', actor: OWNER });
    assert.equal(r.success, false);
    assert.equal(r.reason, 'ORDER_NOT_FOUND');
});

// 3. real, non-CONFIRMED order -> ORDER_NOT_CONFIRMED
test('3. createFulfillment for a real non-CONFIRMED order -> ORDER_NOT_CONFIRMED', () => {
    const ctx = freshWindow();
    const record = nonConfirmedOrder(ctx, { stock: 0 });
    assert.equal(record.status, 'INSUFFICIENT_STOCK');
    const r = ctx.engine.createFulfillment({ requestId: record.requestId, actor: OWNER });
    assert.equal(r.success, false);
    assert.equal(r.reason, 'ORDER_NOT_CONFIRMED');
    assert.equal(r.orderStatus, 'INSUFFICIENT_STOCK');
});

// 4. second createFulfillment while active -> FULFILLMENT_ALREADY_EXISTS
test('4. second createFulfillment for the same requestId while active -> FULFILLMENT_ALREADY_EXISTS', () => {
    const ctx = freshWindow();
    const { requestId } = confirmedOrder(ctx);
    const first = ctx.engine.createFulfillment({ requestId, actor: OWNER });
    const second = ctx.engine.createFulfillment({ requestId, actor: OWNER });
    assert.equal(second.success, false);
    assert.equal(second.reason, 'FULFILLMENT_ALREADY_EXISTS');
    assert.equal(second.fulfillmentId, first.record.fulfillmentId);
});

// 5. full happy path
test('5. full happy path PENDING_FULFILLMENT -> PACKED -> DISPATCHED -> DELIVERED', () => {
    const ctx = freshWindow();
    const { requestId } = confirmedOrder(ctx);
    const f = ctx.engine.createFulfillment({ requestId, actor: OWNER }).record;
    const packed = ctx.engine.markPacked(f.fulfillmentId, OWNER);
    assert.equal(packed.record.status, 'PACKED');
    const dispatched = ctx.engine.markDispatched(f.fulfillmentId, OWNER);
    assert.equal(dispatched.record.status, 'DISPATCHED');
    const delivered = ctx.engine.markDelivered(f.fulfillmentId, OWNER);
    assert.equal(delivered.record.status, 'DELIVERED');
});

// 6. markDispatched with tracking info -> stored + provenance marked
test('6. markDispatched with trackingNumber/carrier -> stored, CALLER_PROVIDED_NOT_VERIFIED', () => {
    const ctx = freshWindow();
    const { requestId } = confirmedOrder(ctx);
    const f = ctx.engine.createFulfillment({ requestId, actor: OWNER }).record;
    ctx.engine.markPacked(f.fulfillmentId, OWNER);
    const dispatched = ctx.engine.markDispatched(f.fulfillmentId, OWNER, { trackingNumber: 'TRK123', carrier: 'ExampleCourier' });
    assert.equal(dispatched.record.trackingNumber, 'TRK123');
    assert.equal(dispatched.record.carrier, 'ExampleCourier');
    assert.equal(dispatched.record.trackingProvenance, 'CALLER_PROVIDED_NOT_VERIFIED');
});

// 7. markDispatched with neither -> both null, provenance null
test('7. markDispatched with no tracking info -> both null, trackingProvenance null', () => {
    const ctx = freshWindow();
    const { requestId } = confirmedOrder(ctx);
    const f = ctx.engine.createFulfillment({ requestId, actor: OWNER }).record;
    ctx.engine.markPacked(f.fulfillmentId, OWNER);
    const dispatched = ctx.engine.markDispatched(f.fulfillmentId, OWNER);
    assert.equal(dispatched.record.trackingNumber, null);
    assert.equal(dispatched.record.carrier, null);
    assert.equal(dispatched.record.trackingProvenance, null);
});

// 8. skipped transition -> INVALID_TRANSITION
test('8. skipped transition (PENDING_FULFILLMENT -> markDispatched) -> INVALID_TRANSITION', () => {
    const ctx = freshWindow();
    const { requestId } = confirmedOrder(ctx);
    const f = ctx.engine.createFulfillment({ requestId, actor: OWNER }).record;
    const r = ctx.engine.markDispatched(f.fulfillmentId, OWNER);
    assert.equal(r.success, false);
    assert.equal(r.reason, 'INVALID_TRANSITION');
    assert.equal(r.from, 'PENDING_FULFILLMENT');
});

// 9. assistant missing capability -> refused, unchanged
test('9. assistant actor missing canMarkPacked -> MISSING_CAPABILITY, record unchanged', () => {
    const ctx = freshWindow();
    const { requestId } = confirmedOrder(ctx);
    const f = ctx.engine.createFulfillment({ requestId, actor: OWNER }).record;
    const r = ctx.engine.markPacked(f.fulfillmentId, assistant({}));
    assert.equal(r.success, false);
    assert.equal(r.reason, 'MISSING_CAPABILITY:canMarkPacked');
    assert.equal(ctx.engine.getFulfillment(f.fulfillmentId).status, 'PENDING_FULFILLMENT');
});

// 10. assistant with exactly canMarkPacked succeeds there, fails elsewhere
test('10. assistant with only canMarkPacked succeeds markPacked, fails markDispatched', () => {
    const ctx = freshWindow();
    const { requestId } = confirmedOrder(ctx);
    const f = ctx.engine.createFulfillment({ requestId, actor: OWNER }).record;
    const a = assistant({ canMarkPacked: true });
    const packed = ctx.engine.markPacked(f.fulfillmentId, a);
    assert.equal(packed.success, true);
    assert.equal(packed.record.status, 'PACKED');
    const dispatched = ctx.engine.markDispatched(f.fulfillmentId, a);
    assert.equal(dispatched.success, false);
    assert.equal(dispatched.reason, 'MISSING_CAPABILITY:canMarkDispatched');
});

// 11. owner bypasses all four capability checks
test('11. owner actor bypasses all four capability checks', () => {
    const ctx = freshWindow();
    const { requestId } = confirmedOrder(ctx);
    const f = ctx.engine.createFulfillment({ requestId, actor: OWNER }).record;
    assert.equal(ctx.engine.markPacked(f.fulfillmentId, OWNER).success, true);
    assert.equal(ctx.engine.markDispatched(f.fulfillmentId, OWNER).success, true);
    assert.equal(ctx.engine.markDelivered(f.fulfillmentId, OWNER).success, true);
});

// 12. cancel from PENDING_FULFILLMENT by owner
test('12. cancelFulfillment from PENDING_FULFILLMENT by owner -> FULFILLMENT_CANCELLED', () => {
    const ctx = freshWindow();
    const { requestId } = confirmedOrder(ctx);
    const f = ctx.engine.createFulfillment({ requestId, actor: OWNER }).record;
    const r = ctx.engine.cancelFulfillment(f.fulfillmentId, OWNER, { reason: 'customer changed mind' });
    assert.equal(r.success, true);
    assert.equal(r.record.status, 'FULFILLMENT_CANCELLED');
    assert.equal(r.record.cancelReason, 'customer changed mind');
});

// 13. cancel from PACKED by owner
test('13. cancelFulfillment from PACKED by owner -> FULFILLMENT_CANCELLED', () => {
    const ctx = freshWindow();
    const { requestId } = confirmedOrder(ctx);
    const f = ctx.engine.createFulfillment({ requestId, actor: OWNER }).record;
    ctx.engine.markPacked(f.fulfillmentId, OWNER);
    const r = ctx.engine.cancelFulfillment(f.fulfillmentId, OWNER);
    assert.equal(r.success, true);
    assert.equal(r.record.status, 'FULFILLMENT_CANCELLED');
});

// 14. cancel from DISPATCHED -> INVALID_TRANSITION even for owner
test('14. cancelFulfillment from DISPATCHED -> INVALID_TRANSITION, never cancellable, even by owner', () => {
    const ctx = freshWindow();
    const { requestId } = confirmedOrder(ctx);
    const f = ctx.engine.createFulfillment({ requestId, actor: OWNER }).record;
    ctx.engine.markPacked(f.fulfillmentId, OWNER);
    ctx.engine.markDispatched(f.fulfillmentId, OWNER);
    const r = ctx.engine.cancelFulfillment(f.fulfillmentId, OWNER);
    assert.equal(r.success, false);
    assert.equal(r.reason, 'INVALID_TRANSITION');
    assert.equal(r.from, 'DISPATCHED');
});

// 15. structural: no capability combination lets an assistant cancel
test('15. no assistant capability combination reaches FULFILLMENT_CANCELLED', () => {
    const ctx = freshWindow();
    const { requestId } = confirmedOrder(ctx);
    const f = ctx.engine.createFulfillment({ requestId, actor: OWNER }).record;
    const fullyCapableAssistant = assistant({
        canMarkPacked: true, canMarkDispatched: true, canMarkDelivered: true, canCancelFulfillment: true,
    });
    const r = ctx.engine.cancelFulfillment(f.fulfillmentId, fullyCapableAssistant);
    assert.equal(r.success, false);
    assert.equal(r.reason, 'MISSING_CAPABILITY:canCancelFulfillment');
    assert.equal(ctx.engine.getFulfillment(f.fulfillmentId).status, 'PENDING_FULFILLMENT');
});

// 16. re-fulfillment after cancellation
test('16. re-fulfillment after FULFILLMENT_CANCELLED succeeds', () => {
    const ctx = freshWindow();
    const { requestId } = confirmedOrder(ctx);
    const first = ctx.engine.createFulfillment({ requestId, actor: OWNER }).record;
    ctx.engine.cancelFulfillment(first.fulfillmentId, OWNER);
    const second = ctx.engine.createFulfillment({ requestId, actor: OWNER });
    assert.equal(second.success, true);
    assert.notEqual(second.record.fulfillmentId, first.fulfillmentId);
    assert.equal(second.record.status, 'PENDING_FULFILLMENT');
});

// 17. re-fulfillment after delivery
test('17. re-fulfillment after DELIVERED succeeds', () => {
    const ctx = freshWindow();
    const { requestId } = confirmedOrder(ctx);
    const first = ctx.engine.createFulfillment({ requestId, actor: OWNER }).record;
    ctx.engine.markPacked(first.fulfillmentId, OWNER);
    ctx.engine.markDispatched(first.fulfillmentId, OWNER);
    ctx.engine.markDelivered(first.fulfillmentId, OWNER);
    const second = ctx.engine.createFulfillment({ requestId, actor: OWNER });
    assert.equal(second.success, true);
    assert.notEqual(second.record.fulfillmentId, first.fulfillmentId);
});

// 18. getFulfillmentByRequestId returns active, else most recent terminal
test('18. getFulfillmentByRequestId returns active record, else most recent terminal', () => {
    const ctx = freshWindow();
    const { requestId } = confirmedOrder(ctx);
    const first = ctx.engine.createFulfillment({ requestId, actor: OWNER }).record;
    assert.equal(ctx.engine.getFulfillmentByRequestId(requestId).fulfillmentId, first.fulfillmentId);
    ctx.engine.cancelFulfillment(first.fulfillmentId, OWNER);
    // No active record now -> falls back to most recent (terminal) one.
    assert.equal(ctx.engine.getFulfillmentByRequestId(requestId).status, 'FULFILLMENT_CANCELLED');
    const second = ctx.engine.createFulfillment({ requestId, actor: OWNER }).record;
    // Now active again -> returns the new active one, not the cancelled one.
    assert.equal(ctx.engine.getFulfillmentByRequestId(requestId).fulfillmentId, second.fulfillmentId);
});

// 19. getCapabilities honesty
test('19. getCapabilities reports fixed, honest false flags', () => {
    const ctx = freshWindow();
    const caps = ctx.engine.getCapabilities();
    assert.equal(caps.realStockDecrement, false);
    assert.equal(caps.realCourierIntegration, false);
    assert.equal(caps.realDeliveryConfirmation, false);
    assert.equal(caps.trackingVerified, false);
});

// 20. audit log never leaks a full actor object
test('20. audit log records actorType only, never the full actor object', () => {
    const ctx = freshWindow();
    const { requestId } = confirmedOrder(ctx);
    const f = ctx.engine.createFulfillment({ requestId, actor: OWNER }).record;
    ctx.engine.markPacked(f.fulfillmentId, OWNER);
    const packedEntry = ctx.engine.getAuditLog((e) => e.action === 'PACKED')[0];
    assert.equal(packedEntry.detail.actorType, 'owner');
    assert.equal('capabilities' in packedEntry.detail, false);
    assert.equal('actor' in packedEntry.detail, false);
});

// 21. businessId/branchId copied exactly from the Part 6 source record
test('21. businessId/branchId on the fulfillment record match the Part 6 source record exactly', () => {
    const ctx = freshWindow();
    const { requestId } = confirmedOrder(ctx);
    const sourceOrder = ctx.decision.getDecision(requestId);
    const f = ctx.engine.createFulfillment({ requestId, actor: OWNER }).record;
    assert.equal(f.businessId, sourceOrder.businessId);
    assert.equal(f.branchId, sourceOrder.branchId);
});

// 22. structural: zero calls into WholesaleCommerce/ShopProduct/ShopInventory
// from fulfillment creation/progression itself.
test('22. fulfillment creation/progression makes zero calls into WholesaleCommerce/ShopProduct/ShopInventory', () => {
    const ctx = freshWindow();
    const { requestId } = confirmedOrder(ctx);
    // Spy on the real methods after the confirmed order already exists,
    // so only calls made by wholesale-fulfillment.js itself are counted.
    let calls = 0;
    const spiedObjects = [ctx.commerce, ctx.product, ctx.inventory];
    const restorers = [];
    for (const obj of spiedObjects) {
        for (const key of Object.keys(obj)) {
            if (typeof obj[key] !== 'function') continue;
            const original = obj[key];
            obj[key] = function (...args) { calls++; return original.apply(obj, args); };
            restorers.push(() => { obj[key] = original; });
        }
    }
    const f = ctx.engine.createFulfillment({ requestId, actor: OWNER }).record;
    ctx.engine.markPacked(f.fulfillmentId, OWNER);
    ctx.engine.markDispatched(f.fulfillmentId, OWNER, { trackingNumber: 'TRK1' });
    ctx.engine.markDelivered(f.fulfillmentId, OWNER);
    for (const restore of restorers) restore();
    assert.equal(calls, 0, 'wholesale-fulfillment.js must never call WholesaleCommerce/ShopProduct/ShopInventory directly');
});
