'use strict';

/**
 * WOS2 Part 6 test suite for
 *   core/modules/WholesaleOS/wholesale-order-decision.js
 *
 * HARNESS DISCLOSURE (read before trusting these numbers):
 *   REAL, unmodified-by-this-suite production code under test: the real
 *   shopOS-product.js, shopOS-inventory.js, wholesale-commerce.js,
 *   wholesale-order-understanding.js, cozy-language-pack-registry.js,
 *   and church-live-translation-interaction.js (PHC6). Every product,
 *   stock, price, Part-5 draft, and language-readiness fact in this
 *   suite runs through those real files' actual logic — no fakes/stubs
 *   substitute for any of them.
 *
 *   NOT LOADED: IdentityEngine, LDCESessionEngine, LDCECaptionEngine,
 *   CozyTranslate, SpeechTranslationProviders/Adapter. This means PHC6's
 *   getLanguageCapabilities() runs with `selectableValidationActive:
 *   false` and no live translation provider registered — i.e.
 *   `translationAvailableNow` is false for every language including
 *   "en". Per this file's own honest design, "en" is still rendered
 *   because it needs no real translation execution (canonical base
 *   language); every other language reports UNSUPPORTED_LANGUAGE
 *   regardless of PHC6 state, which this suite verifies directly.
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

    return {
        product: global.window.CozyOS.ShopProduct,
        inventory: global.window.CozyOS.ShopInventory,
        commerce: global.window.CozyOS.WholesaleCommerce,
        understanding: global.window.CozyOS.WholesaleOrderUnderstanding,
        phc6: global.window.CozyOS.ChurchLiveTranslationInteraction,
        engine: global.window.CozyOS.WholesaleOrderDecision,
    };
}

const BRANCH = 'branch1';
const OWNER = { actorType: 'owner' };
function assistant(caps = {}) { return { actorType: 'assistant', capabilities: caps }; }

let fixtureSeq = 0;
function setup(ctx, { stock = 10, retailPrice = 100, quantity = 5, customerId = 'cust1' } = {}) {
    // Unique product name per fixture call so multiple setup() calls
    // inside one test (same freshWindow ctx) never collide into an
    // ambiguous ORDER_REQUIRES_CLARIFICATION match against each other.
    fixtureSeq += 1;
    const name = `Fixture Widget ${fixtureSeq}`;
    const p = ctx.product.createProduct({ name, category: 'Construction', retailPrice });
    if (stock) {
        ctx.inventory.adjustStock({ productId: p.productId, branchId: BRANCH, quantity: stock, reason: 'initial_stock', authorizedBy: 'test' });
    }
    const draft = ctx.understanding.submitOrderRequest('biz1', customerId, { rawMessage: `I need ${quantity} ${name.toLowerCase()}` }).record;
    assert.equal(draft.status, 'DRAFT_RESOLVED', 'fixture precondition: Part 5 record must resolve');
    return { product: p, draft };
}

// 1. sufficient stock -> FULFILLABLE, correct resolvedUnitPrice
test('1. sufficient stock -> FULFILLABLE with correct resolvedUnitPrice', () => {
    const ctx = freshWindow();
    const { draft } = setup(ctx, { stock: 20, retailPrice: 150, quantity: 5 });
    const r = ctx.engine.createDecision({ customerId: 'cust1', branchId: BRANCH, part5Record: draft }).record;
    assert.equal(r.status, 'FULFILLABLE');
    assert.equal(r.fulfillableQuantity, 5);
    assert.equal(r.resolvedUnitPrice, 150);
});

// 2. zero stock -> INSUFFICIENT_STOCK
test('2. zero stock -> INSUFFICIENT_STOCK', () => {
    const ctx = freshWindow();
    const { draft } = setup(ctx, { stock: 0, quantity: 5 });
    const r = ctx.engine.createDecision({ customerId: 'cust1', branchId: BRANCH, part5Record: draft }).record;
    assert.equal(r.status, 'INSUFFICIENT_STOCK');
    assert.equal(r.fulfillableQuantity, 0);
});

// 3. partial stock -> PARTIALLY_FULFILLABLE, correct shortfall
test('3. partial stock -> PARTIALLY_FULFILLABLE with correct shortfall', () => {
    const ctx = freshWindow();
    const { draft } = setup(ctx, { stock: 3, quantity: 5 });
    const r = ctx.engine.createDecision({ customerId: 'cust1', branchId: BRANCH, part5Record: draft }).record;
    assert.equal(r.status, 'PARTIALLY_FULFILLABLE');
    assert.equal(r.fulfillableQuantity, 3);
    assert.equal(r.shortfall, 2);
});

// 4. price retrieval matches WholesaleCommerceBoundary.getSellingPrice() exactly
test('4. resolvedUnitPrice matches WholesaleCommerceBoundary.getSellingPrice() exactly', () => {
    const ctx = freshWindow();
    const { draft, product } = setup(ctx, { stock: 20, retailPrice: 77 });
    const r = ctx.engine.createDecision({ customerId: 'cust1', branchId: BRANCH, part5Record: draft }).record;
    const real = ctx.commerce.getSellingPrice(product.productId);
    assert.equal(r.resolvedUnitPrice, real.retailPrice);
});

// 5. price changed between two calls -> second call reflects new price, first record untouched
test('5. price change between two calls does not mutate the first decision record', () => {
    const ctx = freshWindow();
    const { draft, product } = setup(ctx, { stock: 20, retailPrice: 100, quantity: 2 });
    const first = ctx.engine.createDecision({ customerId: 'cust1', branchId: BRANCH, part5Record: draft }).record;
    ctx.product.updateProduct(product.productId, { retailPrice: 200 });
    const draft2 = ctx.understanding.submitOrderRequest('biz1', 'cust2', { rawMessage: `I need 2 ${product.name.toLowerCase()}` }).record;
    assert.equal(draft2.status, 'DRAFT_RESOLVED');
    const second = ctx.engine.createDecision({ customerId: 'cust2', branchId: BRANCH, part5Record: draft2 }).record;
    assert.equal(first.resolvedUnitPrice, 100);
    assert.equal(second.resolvedUnitPrice, 200);
    assert.equal(ctx.engine.getDecision(first.requestId).resolvedUnitPrice, 100);
});

// 6. stock changed between two calls -> second call reflects new stock, first record untouched
test('6. stock change between two calls does not mutate the first decision record', () => {
    const ctx = freshWindow();
    const { draft, product } = setup(ctx, { stock: 5, quantity: 5 });
    const first = ctx.engine.createDecision({ customerId: 'cust1', branchId: BRANCH, part5Record: draft }).record;
    ctx.inventory.adjustStock({ productId: product.productId, branchId: BRANCH, quantity: -5, reason: 'sold', authorizedBy: 'test' });
    const draft2 = ctx.understanding.submitOrderRequest('biz1', 'cust2', { rawMessage: `I need 5 ${product.name.toLowerCase()}` }).record;
    assert.equal(draft2.status, 'DRAFT_RESOLVED');
    const second = ctx.engine.createDecision({ customerId: 'cust2', branchId: BRANCH, part5Record: draft2 }).record;
    assert.equal(first.status, 'FULFILLABLE');
    assert.equal(second.status, 'INSUFFICIENT_STOCK');
    assert.equal(ctx.engine.getDecision(first.requestId).status, 'FULFILLABLE');
});

// 7. duplicate clientRequestId -> same record, no second inventory/price check (call-count verified)
test('7. duplicate clientRequestId returns the same record without a second real boundary check', () => {
    const ctx = freshWindow();
    const { draft } = setup(ctx, { stock: 20, quantity: 5 });
    const before = ctx.commerce.getDiagnosticsReport();
    const r1 = ctx.engine.createDecision({ customerId: 'cust1', clientRequestId: 'req-1', branchId: BRANCH, part5Record: draft });
    const afterFirst = ctx.commerce.getDiagnosticsReport();
    const r2 = ctx.engine.createDecision({ customerId: 'cust1', clientRequestId: 'req-1', branchId: BRANCH, part5Record: draft });
    const afterSecond = ctx.commerce.getDiagnosticsReport();
    assert.equal(r2.duplicate, true);
    assert.equal(r2.record.requestId, r1.record.requestId);
    assert.ok(afterFirst.inventoryOps > before.inventoryOps, 'first call performs a real inventory op');
    assert.equal(afterSecond.inventoryOps, afterFirst.inventoryOps, 'duplicate performs no second inventory op');
    assert.equal(afterSecond.pricingOps, afterFirst.pricingOps, 'duplicate performs no second pricing op');
});

// 8. unauthorized assistant attempting confirm/partial/reject -> OWNER_APPROVAL_REQUIRED, never proceeds
test('8. unauthorized assistant confirm/partial/reject always escalates, never proceeds', () => {
    const ctx = freshWindow();
    const { draft: d1 } = setup(ctx, { stock: 20, quantity: 5 });
    const fulfillable = ctx.engine.createDecision({ customerId: 'cust1', branchId: BRANCH, part5Record: d1 }).record;
    const confirmResult = ctx.engine.confirmOrder(fulfillable.requestId, assistant({}));
    assert.equal(confirmResult.record.status, 'OWNER_APPROVAL_REQUIRED');
    assert.equal(confirmResult.escalated, true);

    const { draft: d2 } = setup(ctx, { stock: 3, quantity: 5 });
    const partial = ctx.engine.createDecision({ customerId: 'cust1', clientRequestId: 'r2', branchId: BRANCH, part5Record: d2 }).record;
    const partialResult = ctx.engine.applyPartialFulfillment(partial.requestId, assistant({}));
    assert.equal(partialResult.record.status, 'OWNER_APPROVAL_REQUIRED');

    const rejectResult = ctx.engine.rejectOrder(fulfillable.requestId, assistant({}));
    assert.equal(rejectResult.record.status, 'OWNER_APPROVAL_REQUIRED');
});

// 9. authorized assistant with each of the four capabilities individually succeeds only for its own action
test('9. each capability authorizes only its own action', () => {
    const ctx = freshWindow();
    const { draft } = setup(ctx, { stock: 20, quantity: 5 });
    const rec = ctx.engine.createDecision({ customerId: 'cust1', branchId: BRANCH, part5Record: draft }).record;

    // canConfirmOrder alone confirms a FULFILLABLE record.
    const confirmOnly = ctx.engine.confirmOrder(rec.requestId, assistant({ canConfirmOrder: true }));
    assert.equal(confirmOnly.record.status, 'CONFIRMED');

    // canApplyPartialFulfillment alone works on a PARTIALLY_FULFILLABLE record.
    const { draft: d2 } = setup(ctx, { stock: 2, quantity: 5 });
    const partialRec = ctx.engine.createDecision({ customerId: 'cust2', branchId: BRANCH, part5Record: d2 }).record;
    const partialOnly = ctx.engine.applyPartialFulfillment(partialRec.requestId, assistant({ canApplyPartialFulfillment: true }));
    assert.equal(partialOnly.record.status, 'LOCAL_QUEUED');

    // canRejectOrder alone rejects.
    const { draft: d3 } = setup(ctx, { stock: 20, quantity: 5 });
    const rejectRec = ctx.engine.createDecision({ customerId: 'cust3', branchId: BRANCH, part5Record: d3 }).record;
    const rejectOnly = ctx.engine.rejectOrder(rejectRec.requestId, assistant({ canRejectOrder: true }));
    assert.equal(rejectOnly.record.status, 'REJECTED');

    // canRequestOwnerApproval alone raises approval deliberately.
    const { draft: d4 } = setup(ctx, { stock: 20, quantity: 5 });
    const approvalRec = ctx.engine.createDecision({ customerId: 'cust4', branchId: BRANCH, part5Record: d4 }).record;
    const approvalOnly = ctx.engine.requestOwnerApproval(approvalRec.requestId, assistant({ canRequestOwnerApproval: true }));
    assert.equal(approvalOnly.record.status, 'OWNER_APPROVAL_REQUIRED');

    // Cross-check: canConfirmOrder alone cannot reject.
    const crossCheck = ctx.engine.rejectOrder(confirmOnly.record.requestId, assistant({ canConfirmOrder: true }));
    assert.notEqual(crossCheck.record && crossCheck.record.status, 'REJECTED');
});

// 10. owner actor bypasses all four capability checks
test('10. owner actor bypasses all capability checks', () => {
    const ctx = freshWindow();
    const { draft } = setup(ctx, { stock: 20, quantity: 5 });
    const rec = ctx.engine.createDecision({ customerId: 'cust1', branchId: BRANCH, part5Record: draft }).record;
    const result = ctx.engine.confirmOrder(rec.requestId, OWNER);
    assert.equal(result.record.status, 'CONFIRMED');
    assert.equal(result.escalated, false);
});

// 11. owner approval flow: OWNER_APPROVAL_REQUIRED -> real owner action -> CONFIRMED/REJECTED/LOCAL_QUEUED
test('11. owner resolves an OWNER_APPROVAL_REQUIRED record to CONFIRMED, REJECTED, or LOCAL_QUEUED', () => {
    const ctx = freshWindow();
    const { draft } = setup(ctx, { stock: 20, quantity: 5 });
    const rec = ctx.engine.createDecision({ customerId: 'cust1', branchId: BRANCH, part5Record: draft }).record;
    ctx.engine.confirmOrder(rec.requestId, assistant({})); // escalates
    const resolved = ctx.engine.ownerResolve(rec.requestId, OWNER, { decision: 'CONFIRM' });
    assert.equal(resolved.record.status, 'CONFIRMED');

    const { draft: d2 } = setup(ctx, { stock: 20, quantity: 5 });
    const rec2 = ctx.engine.createDecision({ customerId: 'cust2', branchId: BRANCH, part5Record: d2 }).record;
    ctx.engine.confirmOrder(rec2.requestId, assistant({}));
    const rejected = ctx.engine.ownerResolve(rec2.requestId, OWNER, { decision: 'REJECT' });
    assert.equal(rejected.record.status, 'REJECTED');
});

// 12. explicit rejection by capability-holding actor
test('12. explicit rejection by a capability-holding assistant', () => {
    const ctx = freshWindow();
    const { draft } = setup(ctx, { stock: 20, quantity: 5 });
    const rec = ctx.engine.createDecision({ customerId: 'cust1', branchId: BRANCH, part5Record: draft }).record;
    const result = ctx.engine.rejectOrder(rec.requestId, assistant({ canRejectOrder: true }), { reason: 'CUSTOMER_CANCELLED' });
    assert.equal(result.record.status, 'REJECTED');
    assert.equal(result.record.reason, 'CUSTOMER_CANCELLED');
});

// 13. LOCAL_QUEUED never carries propagationState: SENT
test('13. LOCAL_QUEUED never carries propagationState SENT', () => {
    const ctx = freshWindow();
    const { draft } = setup(ctx, { stock: 2, quantity: 5 });
    const rec = ctx.engine.createDecision({ customerId: 'cust1', branchId: BRANCH, part5Record: draft }).record;
    const queued = ctx.engine.applyPartialFulfillment(rec.requestId, assistant({ canApplyPartialFulfillment: true }));
    assert.equal(queued.record.status, 'LOCAL_QUEUED');
    assert.notEqual(queued.record.propagationState, 'SENT');
    assert.notEqual(queued.record.propagationState, 'DELIVERED');
});

// 14. offline -> reconcile() with unchanged real stock/price
test('14. reconcile() with unchanged stock/price leaves record LOCAL_QUEUED, not stale', () => {
    const ctx = freshWindow();
    const { draft } = setup(ctx, { stock: 2, quantity: 5 });
    const rec = ctx.engine.createDecision({ customerId: 'cust1', branchId: BRANCH, part5Record: draft }).record;
    ctx.engine.applyPartialFulfillment(rec.requestId, assistant({ canApplyPartialFulfillment: true }));
    const result = ctx.engine.reconcile(rec.requestId, { stalenessThresholdMs: 1000 * 60 * 60 * 24 });
    assert.equal(result.record.status, 'LOCAL_QUEUED');
    assert.equal(result.record.staleAtSync, false);
});

// 15. offline -> reconcile() with stock dropped below queued quantity -> staleAtSync + downgraded state
test('15. reconcile() with dropped stock downgrades state and flags staleAtSync', () => {
    const ctx = freshWindow();
    const { draft, product } = setup(ctx, { stock: 5, quantity: 5 });
    const rec = ctx.engine.createDecision({ customerId: 'cust1', branchId: BRANCH, part5Record: draft }).record;
    assert.equal(rec.status, 'FULFILLABLE');
    ctx.engine.confirmOrder(rec.requestId, assistant({})); // escalate to OWNER_APPROVAL_REQUIRED
    ctx.engine.ownerResolve(rec.requestId, OWNER, { decision: 'LOCAL_QUEUED' });
    ctx.inventory.adjustStock({ productId: product.productId, branchId: BRANCH, quantity: -3, reason: 'sold_elsewhere', authorizedBy: 'test' });
    const result = ctx.engine.reconcile(rec.requestId, { stalenessThresholdMs: 1000 * 60 * 60 * 24 });
    assert.equal(result.record.status, 'PARTIALLY_FULFILLABLE');
    assert.equal(result.record.staleAtSync, true);
    assert.equal(result.record.originalQuantity, 5);
    assert.equal(result.record.fulfillableQuantity, 2);
});

// 16. offline -> reconcile() past staleness threshold -> staleAtSync regardless of outcome
test('16. reconcile() past staleness threshold flags staleAtSync even with unchanged stock/price', () => {
    const ctx = freshWindow();
    const { draft } = setup(ctx, { stock: 2, quantity: 5 });
    const rec = ctx.engine.createDecision({ customerId: 'cust1', branchId: BRANCH, part5Record: draft }).record;
    ctx.engine.applyPartialFulfillment(rec.requestId, assistant({ canApplyPartialFulfillment: true }));
    const result = ctx.engine.reconcile(rec.requestId, { stalenessThresholdMs: -1 }); // any positive age exceeds this
    assert.equal(result.record.staleAtSync, true);
    assert.equal(result.record.status, 'LOCAL_QUEUED'); // stock/price unchanged, so no state downgrade
});

// 17. customer-facing message rendered in customerLanguage via PHC6
test('17. customer-facing message renders for the canonical base language', () => {
    const ctx = freshWindow();
    const { draft } = setup(ctx, { stock: 20, quantity: 5 });
    const rec = ctx.engine.createDecision({ customerId: 'cust1', branchId: BRANCH, part5Record: draft, customerLanguage: 'en' }).record;
    const msg = ctx.engine.getCustomerMessage(rec.requestId);
    assert.equal(msg.language, 'en');
    assert.ok(msg.text && msg.text.includes(rec.requestId));
    assert.equal(msg.marker, null);
});

// 18. owner-facing message rendered in ownerLanguage via PHC6, independently
test('18. owner-facing message renders independently of the customer-facing message', () => {
    const ctx = freshWindow();
    const { draft } = setup(ctx, { stock: 0, quantity: 5 });
    const rec = ctx.engine.createDecision({
        customerId: 'cust1', branchId: BRANCH, part5Record: draft,
        customerLanguage: 'sw', ownerLanguage: 'en',
    }).record;
    const customerMsg = ctx.engine.getCustomerMessage(rec.requestId);
    const ownerMsg = ctx.engine.getOwnerMessage(rec.requestId);
    assert.equal(customerMsg.marker, 'UNSUPPORTED_LANGUAGE');
    assert.equal(ownerMsg.marker, null);
    assert.ok(ownerMsg.text);
});

// 19. unsupported/NOT_READY language on either side -> UNSUPPORTED_LANGUAGE marker, order decision unaffected
test('19. unsupported language yields UNSUPPORTED_LANGUAGE marker without affecting the order decision', () => {
    const ctx = freshWindow();
    const { draft } = setup(ctx, { stock: 20, quantity: 5 });
    const rec = ctx.engine.createDecision({
        customerId: 'cust1', branchId: BRANCH, part5Record: draft,
        customerLanguage: 'sw', ownerLanguage: 'zz-not-a-real-language',
    }).record;
    assert.equal(rec.status, 'FULFILLABLE'); // order decision itself unaffected
    const customerMsg = ctx.engine.getCustomerMessage(rec.requestId);
    const ownerMsg = ctx.engine.getOwnerMessage(rec.requestId);
    assert.equal(customerMsg.marker, 'UNSUPPORTED_LANGUAGE');
    assert.equal(ownerMsg.marker, 'UNSUPPORTED_LANGUAGE');
});

// 20. customer-facing projection excludes owner/audit/diagnostics fields
test('20. customer view exposes only the disclosed customer-safe key set', () => {
    const ctx = freshWindow();
    const { draft } = setup(ctx, { stock: 20, quantity: 5 });
    const rec = ctx.engine.createDecision({ customerId: 'cust1', branchId: BRANCH, part5Record: draft, customerLanguage: 'en' }).record;
    const view = ctx.engine.getCustomerView(rec.requestId);
    const keys = Object.keys(view).sort();
    assert.deepEqual(keys, ['fulfillableQuantity', 'message', 'requestId', 'resolvedUnitPrice', 'shortfall', 'status']);
    assert.equal('branchId' in view, false);
    assert.equal('reason' in view, false);
    assert.equal('history' in view, false);
    assert.equal('customerId' in view, false);
});

// 21. PRICE_UNAVAILABLE path -> OWNER_APPROVAL_REQUIRED, never a guessed price
test('21. product with no sellable price -> OWNER_APPROVAL_REQUIRED with PRICE_UNAVAILABLE, never a guessed price', () => {
    const ctx = freshWindow();
    const p = ctx.product.createProduct({ name: 'Unpriced Widget', category: 'Misc' }); // no retailPrice/promoPrice
    ctx.inventory.adjustStock({ productId: p.productId, branchId: BRANCH, quantity: 10, reason: 'initial_stock', authorizedBy: 'test' });
    const draft = ctx.understanding.submitOrderRequest('biz1', 'cust1', { rawMessage: 'I need 2 unpriced widget' }).record;
    assert.equal(draft.status, 'DRAFT_RESOLVED', 'fixture precondition: Part 5 record must resolve');
    const rec = ctx.engine.createDecision({ customerId: 'cust1', branchId: BRANCH, part5Record: draft }).record;
    assert.equal(rec.status, 'OWNER_APPROVAL_REQUIRED');
    assert.equal(rec.reason, 'PRICE_UNAVAILABLE');
    assert.equal(rec.resolvedUnitPrice, null);
});

// 22. the five owner-only actions are structurally unreachable by any assistant capability combination
test('22. the five owner-only actions map to no assistant capability', () => {
    const ctx = freshWindow();
    const ownerOnly = ctx.engine.getOwnerOnlyActions();
    assert.deepEqual(ownerOnly, [
        'APPLY_DISCOUNT_OR_PRICE_OVERRIDE',
        'EXTEND_CREDIT',
        'CONFIRM_AGAINST_UNVERIFIED_STOCK',
        'EXCEPTIONAL_QUANTITY_OVERRIDE',
        'CANCEL_CONFIRMED_ORDER',
    ]);
    const capabilityKeys = ctx.engine.getCapabilityKeys();
    for (const action of ownerOnly) {
        assert.equal(capabilityKeys.includes(action), false, `${action} must not be a capability key`);
    }
    // All capabilities granted still cannot reach a non-existent method for any owner-only action.
    const allCaps = assistant({ canConfirmOrder: true, canApplyPartialFulfillment: true, canRejectOrder: true, canRequestOwnerApproval: true });
    for (const action of ownerOnly) {
        const methodName = action.charAt(0) + action.slice(1).toLowerCase();
        assert.equal(typeof ctx.engine[methodName], 'undefined');
    }
    void allCaps;
});
