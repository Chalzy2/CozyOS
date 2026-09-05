'use strict';

/**
 * WOS2 Part 5 test suite for
 *   core/modules/WholesaleOS/wholesale-order-understanding.js
 *
 * HARNESS DISCLOSURE:
 *   REAL, unmodified-by-this-suite production code under test: the real
 *   shopOS-product.js (window.CozyOS.ShopProduct) and the real
 *   cozy-customer.js (window.CozyOS.Customer). Every product-match and
 *   customer-known fact in this suite runs through those real files'
 *   actual logic — no fakes/stubs substitute for either.
 *
 *   NOT LOADED: ShopInventory, ShopSales, IdentityEngine — this
 *   checkpoint does not compose any of them (see the file header's
 *   Rule 29 audit summary), so they are not exercised here either.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

function freshWindow() {
    global.window = { CozyOS: {}, addEventListener: () => {} };
    delete require.cache[require.resolve('../../../plugins/shopOS-product.js')];
    delete require.cache[require.resolve('../../customer/cozy-customer.js')];
    delete require.cache[require.resolve('../wholesale-order-understanding.js')];

    require('../../../plugins/shopOS-product.js');
    require('../../customer/cozy-customer.js');
    require('../wholesale-order-understanding.js');

    return {
        product: global.window.CozyOS.ShopProduct,
        customer: global.window.CozyOS.Customer,
        engine: global.window.CozyOS.WholesaleOrderUnderstanding,
    };
}

function makeShoe(product, overrides = {}) {
    return product.createProduct({
        name: 'Black Shoes',
        category: 'Footwear',
        unit: 'pair',
        variants: [
            { size: '40', color: 'black' },
            { size: '41', color: 'black' },
            { size: '42', color: 'black' },
        ],
        ...overrides,
    });
}

// ---------------------------------------------------------------------
// 1. simple product request
// ---------------------------------------------------------------------
test('simple product request resolves to DRAFT_RESOLVED with matched product', () => {
    const { product, engine } = freshWindow();
    const shoe = makeShoe(product);
    const result = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: 'I need 20 black shoes size 42' });
    assert.equal(result.success, true);
    assert.equal(result.record.status, 'DRAFT_RESOLVED');
    assert.equal(result.record.matchedProductId, shoe.productId);
    assert.equal(result.record.quantity, 20);
});

// ---------------------------------------------------------------------
// 2. quantity extraction (digit)
// ---------------------------------------------------------------------
test('digit quantity is extracted deterministically', () => {
    const { product, engine } = freshWindow();
    product.createProduct({ name: 'Cooking Pot' });
    const result = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: 'I need 10 cooking pots' });
    assert.equal(result.record.quantity, 10);
});

// ---------------------------------------------------------------------
// 3. cardinal-word quantity
// ---------------------------------------------------------------------
test('cardinal-word quantity ("ten") is extracted deterministically', () => {
    const { product, engine } = freshWindow();
    product.createProduct({ name: 'Cooking Pot' });
    const result = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: 'I need ten cooking pots' });
    assert.equal(result.record.quantity, 10);
});

test('compound cardinal-word quantity ("twenty five") is extracted deterministically', () => {
    const { product, engine } = freshWindow();
    product.createProduct({ name: 'Blue Shirt', category: 'Apparel' });
    const result = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: 'Give me twenty five blue shirts' });
    assert.equal(result.record.quantity, 25);
});

// ---------------------------------------------------------------------
// 4. variant extraction
// ---------------------------------------------------------------------
test('size and color variant phrases are extracted', () => {
    const { product, engine } = freshWindow();
    makeShoe(product);
    const result = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: 'Nataka pairs 20 za black shoes size 42' });
    assert.equal(result.record.variant.requestedSize, '42');
    assert.equal(result.record.variant.requestedColor, 'black');
});

// ---------------------------------------------------------------------
// 5. exact product match (single candidate + declared variant present)
// ---------------------------------------------------------------------
test('exact single product+variant match resolves fully', () => {
    const { product, engine } = freshWindow();
    const shoe = makeShoe(product);
    const result = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: 'I need 5 black shoes size 42' });
    assert.equal(result.record.status, 'DRAFT_RESOLVED');
    assert.equal(result.record.matchedProductId, shoe.productId);
    assert.deepEqual(result.record.variant.resolved, { size: '42', color: 'black' });
    assert.equal(result.record.variant.unavailable, false);
});

// ---------------------------------------------------------------------
// 6. ambiguous product match
// ---------------------------------------------------------------------
test('multiple matching products yield ORDER_REQUIRES_CLARIFICATION, never an arbitrary pick', () => {
    // NOTE: product names use the plural "Shirts" deliberately — this
    // engine is a documented, disclosed deterministic contains-match
    // (no stemming/plural-normalization), so test data must match the
    // customer's own wording to exercise ambiguity honestly, per this
    // file's own header ("deterministic contains-match — no fuzzy/AI
    // ranking"). Using singular "Shirt" product names against a plural
    // customer message would test a mismatch this engine never claims
    // to solve, not a real defect.
    const { product, engine } = freshWindow();
    const a = product.createProduct({ name: 'Blue Shirts Small', category: 'Apparel' });
    const b = product.createProduct({ name: 'Blue Shirts Large', category: 'Apparel' });
    const result = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: 'Give me 5 blue shirts' });
    assert.equal(result.record.status, 'ORDER_REQUIRES_CLARIFICATION');
    assert.equal(result.record.matchedProductId, null);
    assert.ok(result.record.candidateProductIds.includes(a.productId));
    assert.ok(result.record.candidateProductIds.includes(b.productId));
    assert.ok(result.record.missingFields.includes('product'));
});

// ---------------------------------------------------------------------
// 7. unknown product
// ---------------------------------------------------------------------
test('a describable but unmatched product yields ORDER_REQUIRES_CLARIFICATION, not a fabricated match', () => {
    const { engine } = freshWindow(); // no products created at all
    const result = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: 'I need 10 titanium widgets' });
    assert.equal(result.record.status, 'ORDER_REQUIRES_CLARIFICATION');
    assert.equal(result.record.matchedProductId, null);
    assert.ok(result.record.missingFields.includes('product'));
});

// ---------------------------------------------------------------------
// 8. missing quantity
// ---------------------------------------------------------------------
test('missing quantity is never defaulted to 1 — requires clarification', () => {
    const { product, engine } = freshWindow();
    makeShoe(product);
    const result = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: 'I need black shoes size 42' });
    assert.equal(result.record.quantity, null);
    assert.equal(result.record.status, 'ORDER_REQUIRES_CLARIFICATION');
    assert.ok(result.record.missingFields.includes('quantity'));
});

// ---------------------------------------------------------------------
// 9. missing product
// ---------------------------------------------------------------------
test('a message with a quantity but no describable product is ORDER_NOT_UNDERSTOOD', () => {
    const { engine } = freshWindow();
    const result = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: '20' });
    assert.equal(result.record.status, 'ORDER_NOT_UNDERSTOOD');
    assert.equal(result.record.productCandidate, null);
});

// ---------------------------------------------------------------------
// 10. duplicate clientRequestId
// ---------------------------------------------------------------------
test('resubmitting the same clientRequestId for the same customer returns the original record', () => {
    const { product, engine } = freshWindow();
    makeShoe(product);
    const first = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: 'I need 5 black shoes size 42', clientRequestId: 'req-abc' });
    const second = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: 'I need 5 black shoes size 42', clientRequestId: 'req-abc' });
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(second.record.requestId, first.record.requestId);
    assert.equal(engine.listOrderRequestsForCustomer('cust1').length, 1);
});

// ---------------------------------------------------------------------
// 11. customerId isolation
// ---------------------------------------------------------------------
test('the same clientRequestId from two different customers creates two separate records', () => {
    const { product, engine } = freshWindow();
    makeShoe(product);
    const a = engine.submitOrderRequest('biz1', 'custA', { rawMessage: 'I need 5 black shoes size 42', clientRequestId: 'req-shared' });
    const b = engine.submitOrderRequest('biz1', 'custB', { rawMessage: 'I need 5 black shoes size 42', clientRequestId: 'req-shared' });
    assert.equal(a.duplicate, false);
    assert.equal(b.duplicate, false);
    assert.notEqual(a.record.requestId, b.record.requestId);
});

// ---------------------------------------------------------------------
// 12. customerLanguage preservation
// ---------------------------------------------------------------------
test('customerLanguage is stored verbatim, never inferred', () => {
    const { product, engine } = freshWindow();
    makeShoe(product);
    const withLang = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: 'I need 5 black shoes size 42', customerLanguage: 'sw' });
    assert.equal(withLang.record.customerLanguage, 'sw');

    const withoutLang = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: 'I need 5 black shoes size 42' });
    assert.equal(withoutLang.record.customerLanguage, null);
});

// ---------------------------------------------------------------------
// 13. requestedPrice remains honest
// ---------------------------------------------------------------------
test('requestedPrice is always null this checkpoint, even when a number-like price appears in the message', () => {
    const { product, engine } = freshWindow();
    makeShoe(product);
    const result = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: 'Can I get 5 black shoes size 42 for 1200?' });
    assert.equal(result.record.requestedPrice, null);
});

// ---------------------------------------------------------------------
// 14. malformed input
// ---------------------------------------------------------------------
test('non-string rawMessage is rejected before any record is created', () => {
    const { engine } = freshWindow();
    const result = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: 12345 });
    assert.equal(result.success, false);
    assert.equal(result.reason, 'RAW_MESSAGE_INVALID_TYPE');
    assert.equal(engine.listOrderRequestsForCustomer('cust1').length, 0);
});

// ---------------------------------------------------------------------
// 15. empty input
// ---------------------------------------------------------------------
test('empty/whitespace-only rawMessage is rejected before any record is created', () => {
    const { engine } = freshWindow();
    const result = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: '   ' });
    assert.equal(result.success, false);
    assert.equal(result.reason, 'RAW_MESSAGE_REQUIRED');
    assert.equal(engine.listOrderRequestsForCustomer('cust1').length, 0);
});

// ---------------------------------------------------------------------
// 16. unsupported request
// ---------------------------------------------------------------------
test('a message with no recognizable words creates a record marked ORDER_NOT_UNDERSTOOD, not a rejection', () => {
    const { engine } = freshWindow();
    const result = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: '???  ***  !!!' });
    assert.equal(result.success, true);
    assert.equal(result.record.status, 'ORDER_NOT_UNDERSTOOD');
});

// ---------------------------------------------------------------------
// 17. no fabricated product
// ---------------------------------------------------------------------
test('an unrecognized product phrase never resolves to an unrelated real product', () => {
    const { product, engine } = freshWindow();
    product.createProduct({ name: 'Green Bucket', category: 'Hardware' });
    const result = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: 'I need 3 purple umbrellas' });
    assert.equal(result.record.matchedProductId, null);
    assert.notEqual(result.record.status, 'DRAFT_RESOLVED');
});

// ---------------------------------------------------------------------
// 18. no fabricated quantity
// ---------------------------------------------------------------------
test('an unparseable quantity expression is never coerced into a number', () => {
    const { product, engine } = freshWindow();
    makeShoe(product);
    const result = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: 'I need several black shoes size 42' });
    assert.equal(result.record.quantity, null);
    assert.ok(result.record.missingFields.includes('quantity'));
});

// ---------------------------------------------------------------------
// 19. no fabricated price
// ---------------------------------------------------------------------
test('requestedPrice stays null even for an explicit price-looking phrase with currency wording', () => {
    const { product, engine } = freshWindow();
    makeShoe(product);
    const result = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: 'I need 5 black shoes size 42, budget is 1200 shillings' });
    assert.equal(result.record.requestedPrice, null);
});

// ---------------------------------------------------------------------
// Extra: variant not available on the resolved product -> clarification,
// never silently substituted for a nearby size (Part 7's explicit
// non-negotiable: size 42 must never become size 41).
// ---------------------------------------------------------------------
test('a requested variant not present on the product requires clarification, never a nearby substitute', () => {
    const { product, engine } = freshWindow();
    const shoe = makeShoe(product); // only sizes 40/41/42 exist
    const result = engine.submitOrderRequest('biz1', 'cust1', { rawMessage: 'I need 5 black shoes size 45' });
    assert.equal(result.record.matchedProductId, shoe.productId);
    assert.equal(result.record.variant.unavailable, true);
    assert.equal(result.record.variant.resolved, null);
    assert.equal(result.record.status, 'ORDER_REQUIRES_CLARIFICATION');
    assert.ok(result.record.missingFields.includes('variant'));
});

test('customerId is required', () => {
    const { engine } = freshWindow();
    const result = engine.submitOrderRequest('biz1', null, { rawMessage: 'I need 5 shoes' });
    assert.equal(result.success, false);
    assert.equal(result.reason, 'CUSTOMER_ID_REQUIRED');
});

test('customerKnown reflects the real Customer engine when a customer record exists', () => {
    const { product, customer, engine } = freshWindow();
    makeShoe(product);
    const cust = customer.createCustomer({ tenantId: 'biz1', customerType: 'Individual', firstName: 'Amina', lastName: 'K' });
    const known = engine.submitOrderRequest('biz1', cust.customerId, { rawMessage: 'I need 5 black shoes size 42' });
    assert.equal(known.record.customerKnown, true);

    const unknown = engine.submitOrderRequest('biz1', 'cust_never_registered', { rawMessage: 'I need 5 black shoes size 42' });
    assert.equal(unknown.record.customerKnown, false);
});
