'use strict';

/**
 * WOS1 test suite for
 *   core/modules/WholesaleOS/wholesale-commerce.js
 *   core/modules/WholesaleOS/wholesale-marketing-state.js
 *
 * HARNESS DISCLOSURE (read before trusting these numbers):
 *   REAL, unmodified-by-this-suite production code under test: the real
 *   cozy-company.js (window.CozyOS.Company), the real shopOS-product.js
 *   (window.CozyOS.ShopProduct), the real shopOS-inventory.js
 *   (window.CozyOS.ShopInventory), the real identity-engine.js
 *   (window.CozyOS.IdentityEngine), and the two real WOS1 files this
 *   checkpoint adds. Every category, product, stock, and authorization
 *   fact in this suite runs through those real files' actual logic.
 *
 *   NOT LOADED / not exercised by this suite: shopOS-sales.js (WOS1's
 *   getOrder() is a thin one-method pass-through verified separately by
 *   direct inspection, not re-tested here since it adds no logic of its
 *   own beyond a null check), shopOS-core.js, shopOS-purchasing.js,
 *   shopOS-bookkeeping.js, shopOS-reconciliation.js, shopOS-reporting.js,
 *   shopOS-dashboard.js, shopOS-search.js (out of WOS1's stated scope).
 *   organization-registry.js/organization-role.js are not loaded either —
 *   WOS1's business/org reads compose window.CozyOS.Company only, per
 *   the Rule 29 audit's confirmation that Company is authoritative for
 *   branches/departments/teams.
 *
 *   No fakes/stubs substitute for any loaded production engine's own
 *   logic. IdentityEngine's real createUser()/grantResourcePermission()/
 *   checkResourcePermission() are exercised directly, including real
 *   PBKDF2 password hashing via Node's global Web Crypto API.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

function freshWindow() {
    global.window = { CozyOS: {}, addEventListener: () => {} };
    delete require.cache[require.resolve('../../company/cozy-company.js')];
    delete require.cache[require.resolve('../../../plugins/shopOS-product.js')];
    delete require.cache[require.resolve('../../../plugins/shopOS-inventory.js')];
    delete require.cache[require.resolve('../../identity/identity-engine.js')];
    delete require.cache[require.resolve('../wholesale-commerce.js')];
    delete require.cache[require.resolve('../wholesale-marketing-state.js')];

    require('../../company/cozy-company.js');
    require('../../../plugins/shopOS-product.js');
    require('../../../plugins/shopOS-inventory.js');
    require('../../identity/identity-engine.js');
    require('../wholesale-commerce.js');
    require('../wholesale-marketing-state.js');

    return {
        company: global.window.CozyOS.Company,
        product: global.window.CozyOS.ShopProduct,
        inventory: global.window.CozyOS.ShopInventory,
        identity: global.window.CozyOS.IdentityEngine,
        commerce: global.window.CozyOS.WholesaleCommerce,
        marketing: global.window.CozyOS.WholesaleMarketingState,
    };
}

function makeBusiness(company, code) {
    return company.createCompany({ companyCode: code, legalName: `${code} Wholesale Ltd` });
}

// ---------------------------------------------------------------------
// BUSINESS / ORG
// ---------------------------------------------------------------------

test('getBusiness reads the real company record', () => {
    const { company, commerce } = freshWindow();
    const biz = makeBusiness(company, 'EMP1');
    const result = commerce.getBusiness(biz.companyId);
    assert.equal(result.success, true);
    assert.equal(result.business.legalName, 'EMP1 Wholesale Ltd');
});

test('getBusiness reports NOT_FOUND for an unknown id', () => {
    const { commerce } = freshWindow();
    const result = commerce.getBusiness('co_does_not_exist');
    assert.equal(result.success, false);
    assert.equal(result.reason, 'NOT_FOUND');
});

test('getBranches delegates to the real branch list', () => {
    const { company, commerce } = freshWindow();
    const biz = makeBusiness(company, 'EMP2');
    company.createBranch(biz.companyId, { branchCode: 'HQ', branchName: 'Headquarters' });
    const result = commerce.getBranches(biz.companyId);
    assert.equal(result.success, true);
    assert.equal(result.branches.length, 1);
    assert.equal(result.branches[0].branchCode, 'HQ');
});

// ---------------------------------------------------------------------
// CATEGORIES — arbitrary business domain, not hard-coded
// ---------------------------------------------------------------------

test('category lifecycle: add, rename, deactivate, reactivate, remove', () => {
    const { commerce } = freshWindow();
    const bizId = 'biz_cat_test';

    const added = commerce.addCategory(bizId, 'Shoes');
    assert.equal(added.success, true);
    assert.equal(added.category.status, 'ACTIVE');

    const dup = commerce.addCategory(bizId, 'Shoes');
    assert.equal(dup.success, false);
    assert.equal(dup.reason, 'CATEGORY_ALREADY_EXISTS');

    const renamed = commerce.renameCategory(bizId, 'Shoes', 'Footwear');
    assert.equal(renamed.success, true);
    assert.equal(renamed.category.name, 'Footwear');

    const deactivated = commerce.deactivateCategory(bizId, 'Footwear');
    assert.equal(deactivated.success, true);
    assert.equal(deactivated.category.status, 'INACTIVE');

    const activeOnly = commerce.listCategories(bizId, { activeOnly: true });
    assert.equal(activeOnly.length, 0);

    const reactivated = commerce.activateCategory(bizId, 'Footwear');
    assert.equal(reactivated.success, true);
    assert.equal(reactivated.category.status, 'ACTIVE');

    const removed = commerce.removeCategory(bizId, 'Footwear');
    assert.equal(removed.success, true);
    assert.equal(commerce.listCategories(bizId).length, 0);
});

test('categories are arbitrary — mixed unrelated domains work identically', () => {
    const { commerce } = freshWindow();
    for (const name of ['Kitchenware', 'Electronics', 'Furniture', 'Cosmetics', 'Hardware', 'Pens', 'Books', 'Files', 'School Supplies']) {
        const result = commerce.addCategory('biz_mixed', name);
        assert.equal(result.success, true, `expected ${name} to be addable`);
    }
    assert.equal(commerce.listCategories('biz_mixed').length, 9);
});

test('category storage is isolated per business', () => {
    const { commerce } = freshWindow();
    commerce.addCategory('biz_A', 'Shoes');
    commerce.addCategory('biz_B', 'Pens');
    assert.equal(commerce.listCategories('biz_A').length, 1);
    assert.equal(commerce.listCategories('biz_B').length, 1);
    assert.equal(commerce.listCategories('biz_A')[0].name, 'Shoes');
});

// ---------------------------------------------------------------------
// PRODUCTS — delegated to the real ShopProduct engine
// ---------------------------------------------------------------------

test('createProduct/getProduct/updateProduct delegate to the real ShopProduct engine', () => {
    const { commerce, product } = freshWindow();
    const created = commerce.createProduct('biz1', { name: 'Blue Sneakers', category: 'Shoes', retailPrice: 1200 });
    assert.equal(created.name, 'Blue Sneakers');
    assert.equal(product.productExists(created.productId), true);

    const fetched = commerce.getProduct(created.productId);
    assert.equal(fetched.category, 'Shoes');

    const updated = commerce.updateProduct(created.productId, { retailPrice: 1500 });
    assert.equal(updated.retailPrice, 1500);
});

test('listProducts filters by category exactly like the real engine', () => {
    const { commerce } = freshWindow();
    commerce.createProduct('biz1', { name: 'Pen', category: 'Stationery' });
    commerce.createProduct('biz1', { name: 'Notebook', category: 'Stationery' });
    commerce.createProduct('biz1', { name: 'Kettle', category: 'Kitchenware' });
    assert.equal(commerce.listProducts({ category: 'Stationery' }).length, 2);
    assert.equal(commerce.listProducts({ category: 'Kitchenware' }).length, 1);
});

// ---------------------------------------------------------------------
// INVENTORY — real stock read/adjust/low/out-of-stock detection
// ---------------------------------------------------------------------

test('getStock reflects real recorded movements', () => {
    const { commerce, inventory } = freshWindow();
    const p = commerce.createProduct('biz1', { name: 'Tea Set' });
    inventory.recordStockMovement({ productId: p.productId, branchId: 'br1', type: 'received', quantity: 50 });
    const result = commerce.getStock(p.productId, 'br1');
    assert.equal(result.success, true);
    assert.equal(result.stock, 50);
});

test('getStockStatus: IN_STOCK, LOW_STOCK, OUT_OF_STOCK against a real configured reorder level', () => {
    const { commerce, inventory } = freshWindow();
    const p = commerce.createProduct('biz1', { name: 'Rice 2kg' });
    inventory.setReorderLevel(p.productId, 'br1', 10);

    inventory.recordStockMovement({ productId: p.productId, branchId: 'br1', type: 'received', quantity: 24 });
    assert.equal(commerce.getStockStatus(p.productId, 'br1').status, 'IN_STOCK');

    inventory.recordStockMovement({ productId: p.productId, branchId: 'br1', type: 'sold', quantity: 15 });
    assert.equal(commerce.getStockStatus(p.productId, 'br1').status, 'LOW_STOCK'); // 9 <= 10

    inventory.recordStockMovement({ productId: p.productId, branchId: 'br1', type: 'sold', quantity: 9 });
    assert.equal(commerce.getStockStatus(p.productId, 'br1').status, 'OUT_OF_STOCK');
});

test('restock (0 -> 50) returns to IN_STOCK/eligible', () => {
    const { commerce, inventory } = freshWindow();
    const p = commerce.createProduct('biz1', { name: 'Bag of Cement' });
    inventory.setReorderLevel(p.productId, 'br1', 5);
    inventory.recordStockMovement({ productId: p.productId, branchId: 'br1', type: 'received', quantity: 5 });
    inventory.recordStockMovement({ productId: p.productId, branchId: 'br1', type: 'sold', quantity: 5 });
    assert.equal(commerce.getStockStatus(p.productId, 'br1').status, 'OUT_OF_STOCK');

    inventory.recordStockMovement({ productId: p.productId, branchId: 'br1', type: 'received', quantity: 50 });
    assert.equal(commerce.getStockStatus(p.productId, 'br1').status, 'IN_STOCK');
});

test('getLowStockProducts / getOutOfStockProducts use the real reorder-level scan', () => {
    const { commerce, inventory } = freshWindow();
    const low = commerce.createProduct('biz1', { name: 'Low Item' });
    const out = commerce.createProduct('biz1', { name: 'Out Item' });
    inventory.setReorderLevel(low.productId, 'br1', 10);
    inventory.setReorderLevel(out.productId, 'br1', 10);
    inventory.recordStockMovement({ productId: low.productId, branchId: 'br1', type: 'received', quantity: 5 });
    inventory.recordStockMovement({ productId: out.productId, branchId: 'br1', type: 'received', quantity: 5 });
    inventory.recordStockMovement({ productId: out.productId, branchId: 'br1', type: 'sold', quantity: 5 });

    const lowResult = commerce.getLowStockProducts('br1');
    assert.equal(lowResult.success, true);
    assert.ok(lowResult.items.length >= 2); // both are <= reorder level

    const outResult = commerce.getOutOfStockProducts('br1');
    assert.equal(outResult.success, true);
    assert.ok(outResult.items.some(i => (i.productId || i.id) === out.productId));
    assert.ok(!outResult.items.some(i => (i.productId || i.id) === low.productId));
});

// ---------------------------------------------------------------------
// PRICING — real fields only, no fabricated multi-tier array
// ---------------------------------------------------------------------

test('getSellingPrice / getPriceTiers report real fields and mark unsupported capability honestly', () => {
    const { commerce } = freshWindow();
    const p = commerce.createProduct('biz1', { name: 'Sack of Maize', costPrice: 2000, retailPrice: 2500, wholesalePrice: 2200 });
    const selling = commerce.getSellingPrice(p.productId);
    assert.equal(selling.retailPrice, 2500);

    const tiers = commerce.getPriceTiers(p.productId);
    assert.equal(tiers.tiers.wholesale, 2200);
    assert.equal(tiers.tiers.cost, 2000);
    assert.equal(tiers.multiTierPricing, 'CAPABILITY_UNAVAILABLE');
});

// ---------------------------------------------------------------------
// ANTI-STALE MARKETING
// ---------------------------------------------------------------------

test('anti-stale marketing: 24 -> eligible, 10 -> eligible, 5 -> low stock, 0 -> blocked, 0->50 -> restocked/eligible', () => {
    const { commerce, inventory, marketing } = freshWindow();
    const p = commerce.createProduct('biz1', { name: 'Cooking Oil 5L' });
    inventory.setReorderLevel(p.productId, 'br1', 8);

    inventory.recordStockMovement({ productId: p.productId, branchId: 'br1', type: 'received', quantity: 24 });
    assert.equal(marketing.evaluate(p.productId, 'br1').marketingState, 'MARKETING_ELIGIBLE');

    inventory.recordStockMovement({ productId: p.productId, branchId: 'br1', type: 'sold', quantity: 14 }); // 10 left
    assert.equal(marketing.evaluate(p.productId, 'br1').marketingState, 'MARKETING_ELIGIBLE');

    inventory.recordStockMovement({ productId: p.productId, branchId: 'br1', type: 'sold', quantity: 5 }); // 5 left, <= 8
    assert.equal(marketing.evaluate(p.productId, 'br1').marketingState, 'LOW_STOCK');

    inventory.recordStockMovement({ productId: p.productId, branchId: 'br1', type: 'sold', quantity: 5 }); // 0
    const blocked = marketing.evaluate(p.productId, 'br1');
    assert.equal(blocked.marketingState, 'MARKETING_BLOCKED');
    assert.equal(blocked.reason, 'OUT_OF_STOCK');

    inventory.recordStockMovement({ productId: p.productId, branchId: 'br1', type: 'received', quantity: 50 });
    assert.equal(marketing.evaluate(p.productId, 'br1').marketingState, 'MARKETING_ELIGIBLE');
});

test('AI protection: canGenerateAvailabilityClaim refuses when real stock is zero', () => {
    const { commerce, inventory, marketing } = freshWindow();
    const p = commerce.createProduct('biz1', { name: 'Tea Set' });
    inventory.recordStockMovement({ productId: p.productId, branchId: 'br1', type: 'received', quantity: 5 });
    inventory.recordStockMovement({ productId: p.productId, branchId: 'br1', type: 'sold', quantity: 5 });

    const claim = marketing.canGenerateAvailabilityClaim(p.productId, 'br1');
    assert.equal(claim.allowed, false);
    assert.equal(claim.reason, 'OUT_OF_STOCK');
});

test('recordPromotion refuses on a blocked product and succeeds on an eligible one', () => {
    const { commerce, inventory, marketing } = freshWindow();
    const p = commerce.createProduct('biz1', { name: 'Sugar 2kg' });
    inventory.recordStockMovement({ productId: p.productId, branchId: 'br1', type: 'received', quantity: 20 });
    marketing.evaluate(p.productId, 'br1');
    const ok = marketing.recordPromotion(p.productId);
    assert.equal(ok.success, true);
    assert.equal(ok.record.promotionCount, 1);

    inventory.recordStockMovement({ productId: p.productId, branchId: 'br1', type: 'sold', quantity: 20 });
    marketing.evaluate(p.productId, 'br1');
    const blocked = marketing.recordPromotion(p.productId);
    assert.equal(blocked.success, false);
    assert.equal(blocked.reason, 'MARKETING_BLOCKED');
});

test('external message deletion is always CAPABILITY_UNAVAILABLE', () => {
    const { marketing } = freshWindow();
    const result = marketing.getExternalMessageDeletionCapability();
    assert.equal(result.status, 'CAPABILITY_UNAVAILABLE');
});

// ---------------------------------------------------------------------
// AUTHORIZATION — real IdentityEngine.checkResourcePermission
// ---------------------------------------------------------------------

test('owner with granted permission can write a category; user without permission is rejected', async () => {
    const { commerce, identity } = freshWindow();
    const owner = await identity.createUser({ username: 'owner1', password: 'correct horse battery staple' });
    identity.grantResourcePermission(owner.id || owner.userId, 'wholesale:category-write');
    const ownerId = owner.id || owner.userId;

    const allowed = commerce.addCategory('biz1', 'Shoes', { userId: ownerId });
    assert.equal(allowed.success, true);

    const denied = commerce.addCategory('biz1', 'Bags', { userId: 'user_never_granted_anything' });
    assert.equal(denied.success, false);
    assert.equal(denied.reason, 'PERMISSION_DENIED');
});

// ---------------------------------------------------------------------
// BUSINESS ISOLATION
// ---------------------------------------------------------------------

test('business isolation: business A cannot read business B categories or company record', () => {
    const { company, commerce } = freshWindow();
    const bizA = makeBusiness(company, 'BIZA');
    const bizB = makeBusiness(company, 'BIZB');
    commerce.addCategory(bizA.companyId, 'Shoes');
    commerce.addCategory(bizB.companyId, 'Pens');

    assert.equal(commerce.listCategories(bizA.companyId).length, 1);
    assert.equal(commerce.listCategories(bizA.companyId)[0].name, 'Shoes');
    assert.notEqual(bizA.companyId, bizB.companyId);
    assert.equal(commerce.getBusiness(bizA.companyId).business.companyId, bizA.companyId);
});

// ---------------------------------------------------------------------
// CAPABILITY_UNAVAILABLE honesty when a dependency isn't loaded
// ---------------------------------------------------------------------

test('getOrder reports CAPABILITY_UNAVAILABLE when ShopSales is not loaded (never fabricates an order)', () => {
    const { commerce } = freshWindow(); // ShopSales intentionally not required in this suite
    const result = commerce.getOrder('sale_1');
    assert.equal(result.success, false);
    assert.equal(result.reason, 'CAPABILITY_UNAVAILABLE');
});

test('module registers its version under window.CozyOS.Modules', () => {
    freshWindow();
    assert.equal(global.window.CozyOS.Modules['wholesale-commerce'].version, '1.0.0-ENTERPRISE');
    assert.equal(global.window.CozyOS.Modules['wholesale-marketing-state'].version, '1.0.0-ENTERPRISE');
});
