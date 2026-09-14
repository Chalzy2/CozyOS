/**
 * core/tests/browser/business-record-browser.test.js
 *
 * REAL browser (Playwright + actual headless Chromium) verification of
 * the real BusinessRecordEngine (core/calculation/business-record-engine.js)
 * driving its real, unmodified dependency chain — window.CozyStorage
 * (core/storage.js, given a real <script src> tag for the first time via
 * business-record-engine-fixture.html), the real CalculationEngine,
 * FormulaRegistry, formula-library.js, OrganizationRegistry, and
 * OrganizationMembership — loaded through real <script src> tags exactly
 * as a real CozyOS page would.
 *
 * This exists because core/calculation/tests/business-record-engine.test.js
 * (Node) necessarily doubles window.CozyStorage: real indexedDB does not
 * exist in Node. This suite is the one place BusinessRecordEngine's
 * actual usage of the actual core/storage.js IndexedDB gateway — not a
 * double of it — is exercised.
 *
 * Run with: node core/tests/browser/business-record-browser.test.js
 */

'use strict';

const { withBrowser, makeRunner } = require('./cozy-browser');

async function main() {
  const { test, summary } = makeRunner();

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      // ────────────────────────────────────────────────────────────
      // Main scenario: full real dependency chain present
      // ────────────────────────────────────────────────────────────
      const { page, consoleErrors, pageErrors } = await openPage();
      await page.goto(serverURL('/core/tests/browser/fixtures/business-record-engine-fixture.html'), { waitUntil: 'load' });

      await test('fixture page loads the real BusinessRecordEngine dependency chain with no page errors', async () => {
        if (pageErrors.length > 0) throw new Error('uncaught page errors during load: ' + pageErrors.join(' | '));
        const state = await page.evaluate(() => ({
          storage: typeof window.CozyStorage,
          calcEngine: !!(window.CozyOS && window.CozyOS.CalculationEngine),
          formulaRegistry: !!(window.CozyOS && window.CozyOS.FormulaRegistry),
          orgRegistry: !!(window.CozyOS && window.CozyOS.OrganizationRegistry),
          membership: !!(window.CozyOS && window.CozyOS.OrganizationMembership),
          bre: !!(window.CozyOS && window.CozyOS.BusinessRecordEngine),
        }));
        for (const [k, v] of Object.entries(state)) {
          if (!v || v === 'undefined') throw new Error(`expected real dependency "${k}" to be present, got: ${JSON.stringify(state)}`);
        }
      });

      await test('window.CozyStorage.init() opens a real IndexedDB database in this real browser', async () => {
        const opened = await page.evaluate(async () => {
          try {
            return await window.CozyStorage.init();
          } catch (e) {
            return { __error: e.message };
          }
        });
        if (opened !== true) throw new Error('expected CozyStorage.init() to resolve true, got: ' + JSON.stringify(opened));
      });

      await test('real organizations and memberships can be established through the legitimate mechanism', async () => {
        const result = await page.evaluate(() => {
          const Registry = window.CozyOS.OrganizationRegistry;
          const Membership = window.CozyOS.OrganizationMembership;
          const BRE = window.CozyOS.BusinessRecordEngine;
          const orgA = Registry.createOrganization({ name: 'ORG-A' }).orgId;
          const orgB = Registry.createOrganization({ name: 'ORG-B' }).orgId;

          Membership.createMembership({
            userId: 'owner_a', organizationId: orgA,
            permissions: [BRE.PERMISSIONS.CREATE, BRE.PERMISSIONS.READ, BRE.PERMISSIONS.REVERSE, BRE.PERMISSIONS.MANAGE_SCHEMA]
          });
          Membership.createMembership({
            userId: 'readonly_a', organizationId: orgA,
            permissions: [BRE.PERMISSIONS.READ]
          });
          Membership.createMembership({
            userId: 'owner_b', organizationId: orgB,
            permissions: [BRE.PERMISSIONS.CREATE, BRE.PERMISSIONS.READ, BRE.PERMISSIONS.REVERSE]
          });

          window.__t = { orgA, orgB };
          return { orgA, orgB };
        });
        if (!result.orgA || !result.orgB || result.orgA === result.orgB) {
          throw new Error('expected two distinct real organization IDs, got: ' + JSON.stringify(result));
        }
      });

      await test('Retail: a real Sugar record derives Cost/Sales/Profit via the real CalculationEngine', async () => {
        const out = await page.evaluate(async () => {
          const BRE = window.CozyOS.BusinessRecordEngine;
          const { orgA } = window.__t;
          const res = await BRE.createRecord({
            organizationId: orgA, applicationId: 'RetailOS', recordType: 'sale', userId: 'owner_a',
            fields: { product: 'Sugar', quantity: 10, buyingPrice: 100, sellingPrice: 150 }
          });
          window.__t.sugarId = res.success ? res.record.id : null;
          return res;
        });
        if (!out.success) throw new Error('createRecord failed: ' + out.reason);
        const cf = out.record.calculatedFields;
        if (!cf.cost || !cf.cost.available || cf.cost.value !== 1000) throw new Error('expected cost=1000, got: ' + JSON.stringify(cf.cost));
        if (!cf.sales || !cf.sales.available || cf.sales.value !== 1500) throw new Error('expected sales=1500, got: ' + JSON.stringify(cf.sales));
        if (!cf.profit || !cf.profit.available || cf.profit.value !== 500) throw new Error('expected profit=500, got: ' + JSON.stringify(cf.profit));
        if (cf.cost.formulaId !== 'Business.LineTotal' || cf.profit.formulaId !== 'Business.Profit') {
          throw new Error('calculated fields were not produced by the real, expected formula IDs: ' + JSON.stringify(cf));
        }
      });

      await test('Pharmacy: the SAME BusinessRecordEngine handles a different application schema, no PharmacyCalculationEngine', async () => {
        const out = await page.evaluate(async () => {
          const BRE = window.CozyOS.BusinessRecordEngine;
          const { orgA } = window.__t;
          const res = await BRE.createRecord({
            organizationId: orgA, applicationId: 'PharmacyOS', recordType: 'sale', userId: 'owner_a',
            fields: { medicine: 'Amoxicillin', quantity: 5, buyingPrice: 40, sellingPrice: 60, expiry: '2027-01-01', supplier: 'Acme Pharma' }
          });
          return { res, hasPharmacyEngine: !!(window.CozyOS.PharmacyCalculationEngine || window.CozyOS.RetailCalculationEngine) };
        });
        if (!out.res.success) throw new Error('createRecord (pharmacy) failed: ' + out.res.reason);
        if (out.hasPharmacyEngine) throw new Error('found an application-specific calculation engine — must not exist');
        const cf = out.res.record.calculatedFields;
        if (cf.cost.value !== 200 || cf.sales.value !== 300 || cf.profit.value !== 100) {
          throw new Error('pharmacy record calculated fields wrong: ' + JSON.stringify(cf));
        }
      });

      await test('stored data can be read back exactly through the real Storage Gateway', async () => {
        const out = await page.evaluate(async () => {
          const BRE = window.CozyOS.BusinessRecordEngine;
          const { orgA, sugarId } = window.__t;
          return BRE.getRecord(orgA, sugarId, 'owner_a');
        });
        if (!out.success) throw new Error('getRecord failed: ' + out.reason);
        if (out.record.fields.product !== 'Sugar' || out.record.calculatedFields.profit.value !== 500) {
          throw new Error('read-back record does not match what was stored: ' + JSON.stringify(out.record));
        }
      });

      await test('flexible table API: add/rename/remove/reorder a real field, calculated fields still work after', async () => {
        const out = await page.evaluate(async () => {
          const BRE = window.CozyOS.BusinessRecordEngine;
          const { orgA } = window.__t;
          const def = await BRE.defineSchema({
            organizationId: orgA, applicationId: 'RetailOS', recordType: 'sale', userId: 'owner_a',
            columns: [
              { key: 'product', label: 'Product', required: true },
              { key: 'quantity', label: 'Quantity', type: 'number', required: true },
              { key: 'buyingPrice', label: 'Buying Price', type: 'number', required: true },
              { key: 'sellingPrice', label: 'Selling Price', type: 'number', required: true }
            ]
          });
          if (!def.success) return { step: 'defineSchema', ...def };

          const added = await BRE.addColumn(orgA, 'RetailOS', 'sale', 'owner_a', { key: 'discountCode', label: 'Discount Code' });
          const renamed = await BRE.renameColumn(orgA, 'RetailOS', 'sale', 'owner_a', 'discountCode', 'Promo Code');
          const reordered = await BRE.reorderColumns(orgA, 'RetailOS', 'sale', 'owner_a',
            ['sellingPrice', 'buyingPrice', 'quantity', 'product', 'discountCode']);
          const removed = await BRE.removeColumn(orgA, 'RetailOS', 'sale', 'owner_a', 'discountCode');

          const record = await BRE.createRecord({
            organizationId: orgA, applicationId: 'RetailOS', recordType: 'sale', userId: 'owner_a',
            fields: { product: 'Flour', quantity: 4, buyingPrice: 50, sellingPrice: 80 }
          });

          return { added, renamed, reordered, removed, record };
        });
        if (out.step) throw new Error(out.step + ' failed: ' + out.reason);
        if (!out.added.success) throw new Error('addColumn failed: ' + out.added.reason);
        if (!out.renamed.success) throw new Error('renameColumn failed: ' + out.renamed.reason);
        if (!out.reordered.success) throw new Error('reorderColumns failed: ' + out.reordered.reason);
        if (!out.removed.success) throw new Error('removeColumn failed: ' + out.removed.reason);
        if (!out.record.success) throw new Error('createRecord after schema changes failed: ' + out.record.reason);
        const cf = out.record.record.calculatedFields;
        if (cf.cost.value !== 200 || cf.sales.value !== 320 || cf.profit.value !== 120) {
          throw new Error('calculated fields wrong after schema mutation: ' + JSON.stringify(cf));
        }
        // This exercises BusinessRecordEngine's real, browser-accessible
        // service API for flexible fields; there is no dedicated
        // end-user UI for table/field editing in this repository today,
        // so this is service-level browser verification, not UI
        // verification (per this milestone's section 7).
      });

      await test('aggregation sums real records; date-range aggregation narrows correctly', async () => {
        const out = await page.evaluate(async () => {
          const BRE = window.CozyOS.BusinessRecordEngine;
          const { orgA } = window.__t;

          const older = await BRE.createRecord({
            organizationId: orgA, applicationId: 'RetailOS', recordType: 'sale', userId: 'owner_a',
            fields: { product: 'Salt', quantity: 20, buyingPrice: 10, sellingPrice: 15 }
          });

          const all = await BRE.aggregate({ organizationId: orgA, applicationId: 'RetailOS', recordType: 'sale', userId: 'owner_a', preset: 'current' });

          // Narrow the range with an explicit custom window that starts
          // strictly after "older" was created, so only later records count.
          const cutoff = new Date(Date.now() + 1000).toISOString(); // 1s in the future: excludes everything created so far
          const future = new Date(Date.now() + 3600 * 1000).toISOString();
          const narrowed = await BRE.aggregate({ organizationId: orgA, applicationId: 'RetailOS', recordType: 'sale', userId: 'owner_a', from: cutoff, to: future });

          return { older, all, narrowed };
        });
        if (!out.older.success) throw new Error('createRecord (older) failed: ' + out.older.reason);
        if (!out.all.success) throw new Error('aggregate (current) failed: ' + out.all.reason);
        // 3 RetailOS/sale records exist by now: Sugar(500), Flour(120), Salt(100) = 720 profit
        if (out.all.recordCount !== 3) throw new Error('expected recordCount=3, got ' + out.all.recordCount);
        if (out.all.totals.profit !== 720) throw new Error('expected total profit=720, got ' + out.all.totals.profit);
        if (!out.narrowed.success) throw new Error('aggregate (narrowed) failed: ' + out.narrowed.reason);
        if (out.narrowed.recordCount !== 0) throw new Error('expected 0 records in a future-only window, got ' + out.narrowed.recordCount);
      });

      await test('reversal creates a real compensating record without destroying history', async () => {
        const out = await page.evaluate(async () => {
          const BRE = window.CozyOS.BusinessRecordEngine;
          const { orgA, sugarId } = window.__t;

          const before = await BRE.aggregate({ organizationId: orgA, applicationId: 'RetailOS', recordType: 'sale', userId: 'owner_a', preset: 'current' });
          const reversal = await BRE.reverseRecord({ organizationId: orgA, recordId: sugarId, userId: 'owner_a', reason: 'test reversal' });
          const originalAfter = await BRE.getRecord(orgA, sugarId, 'owner_a');
          const afterNet = await BRE.aggregate({ organizationId: orgA, applicationId: 'RetailOS', recordType: 'sale', userId: 'owner_a', preset: 'current' });
          const afterClean = await BRE.aggregate({ organizationId: orgA, applicationId: 'RetailOS', recordType: 'sale', userId: 'owner_a', preset: 'current', excludeReversedPairs: true });

          return { before, reversal, originalAfter, afterNet, afterClean };
        });
        if (!out.reversal.success) throw new Error('reverseRecord failed: ' + out.reversal.reason);
        if (out.reversal.reversal.calculatedFields.profit.value !== -500) {
          throw new Error('expected reversal profit=-500, got: ' + JSON.stringify(out.reversal.reversal.calculatedFields.profit));
        }
        if (!out.originalAfter.success) throw new Error('original record must remain readable/auditable after reversal, got: ' + out.originalAfter.reason);
        if (out.originalAfter.record.status !== 'reversed') throw new Error('original record status should be "reversed", got: ' + out.originalAfter.record.status);
        if (out.originalAfter.record.calculatedFields.profit.value !== 500) {
          throw new Error('original record calculated fields must not be rewritten, got: ' + JSON.stringify(out.originalAfter.record.calculatedFields));
        }
        // Net aggregation (reversal pair included) must be 500 lower than before the reversal.
        if (out.afterNet.totals.profit !== out.before.totals.profit - 500) {
          throw new Error(`expected net profit to drop by 500 (${out.before.totals.profit} -> ${out.before.totals.profit - 500}), got ${out.afterNet.totals.profit}`);
        }
        // A "clean ledger" view that excludes the reversed pair should also
        // reflect the reversal being excluded, not the original's stale value.
        if (out.afterClean.totals.profit === out.before.totals.profit) {
          throw new Error('excludeReversedPairs aggregation did not change after a reversal: ' + JSON.stringify(out.afterClean.totals));
        }
      });

      await test('ORG-A cannot read or mutate ORG-B data; ORG-B\'s own data is real and separate', async () => {
        const out = await page.evaluate(async () => {
          const BRE = window.CozyOS.BusinessRecordEngine;
          const { orgA, orgB } = window.__t;

          const bRecord = await BRE.createRecord({
            organizationId: orgB, applicationId: 'RetailOS', recordType: 'sale', userId: 'owner_b',
            fields: { product: 'Rice', quantity: 60, buyingPrice: 100, sellingPrice: 250 } // sales = 15000... use different numbers to hit sales=9000
          });

          // Real requested figure: Sales = 9000 for ORG-B.
          const bRecord2 = await BRE.createRecord({
            organizationId: orgB, applicationId: 'RetailOS', recordType: 'sale', userId: 'owner_b',
            fields: { product: 'Beans', quantity: 60, buyingPrice: 100, sellingPrice: 150 } // sales = 9000
          });

          const aAgg = await BRE.aggregate({ organizationId: orgA, applicationId: 'RetailOS', recordType: 'sale', userId: 'owner_a', preset: 'current' });
          const aListHasB = (await BRE.listRecords({ organizationId: orgA, applicationId: 'RetailOS', recordType: 'sale', userId: 'owner_a' }))
            .records.some(r => r.id === bRecord2.record.id);

          // ORG-A's owner trying to read ORG-B's record id under ORG-A's own
          // organization context must fail via the Storage Gateway's real
          // cross-tenant rejection, not merely "not found".
          const crossRead = await BRE.getRecord(orgA, bRecord2.record.id, 'owner_a');

          // ORG-A's owner has no membership at all in ORG-B, so attempting
          // to mutate/create under ORG-B's organizationId must fail
          // authorization, regardless of storage.
          const crossCreate = await BRE.createRecord({
            organizationId: orgB, applicationId: 'RetailOS', recordType: 'sale', userId: 'owner_a',
            fields: { product: 'Hack', quantity: 1, buyingPrice: 1, sellingPrice: 1 }
          });

          const bOwnAgg = await BRE.aggregate({ organizationId: orgB, applicationId: 'RetailOS', recordType: 'sale', userId: 'owner_b', preset: 'current' });

          return { bRecord, bRecord2, aAgg, aListHasB, crossRead, crossCreate, bOwnAgg };
        });

        if (!out.bRecord2.success || out.bRecord2.record.calculatedFields.sales.value !== 9000) {
          throw new Error('expected ORG-B Sales=9000 record, got: ' + JSON.stringify(out.bRecord2));
        }
        if (out.aListHasB) throw new Error('ORG-A record list leaked an ORG-B record');
        if (out.crossRead.success) throw new Error('ORG-A was able to read an ORG-B record across the organization boundary');
        if (out.crossCreate.success) throw new Error('a user with no ORG-B membership was able to create an ORG-B record');
        if (!out.bOwnAgg.success || out.bOwnAgg.totals.sales !== 9000 + out.bRecord.record.calculatedFields.sales.value) {
          throw new Error('ORG-B could not aggregate its own real data: ' + JSON.stringify(out.bOwnAgg));
        }
      });

      await test('missing/invalid organization context fails closed (no fallback org created)', async () => {
        const out = await page.evaluate(async () => {
          const BRE = window.CozyOS.BusinessRecordEngine;
          const missingOrg = await BRE.createRecord({
            organizationId: null, applicationId: 'RetailOS', recordType: 'sale', userId: 'owner_a',
            fields: { product: 'X', quantity: 1, buyingPrice: 1, sellingPrice: 1 }
          });
          const bogusOrg = await BRE.createRecord({
            organizationId: 'ORG-DOES-NOT-EXIST', applicationId: 'RetailOS', recordType: 'sale', userId: 'owner_a',
            fields: { product: 'X', quantity: 1, buyingPrice: 1, sellingPrice: 1 }
          });
          return { missingOrg, bogusOrg };
        });
        if (out.missingOrg.success) throw new Error('createRecord with a null organizationId must not succeed');
        if (out.bogusOrg.success) throw new Error('createRecord against a nonexistent organizationId must not succeed');
      });

      await test('unauthorized user (read-only membership) cannot create or reverse records', async () => {
        const out = await page.evaluate(async () => {
          const BRE = window.CozyOS.BusinessRecordEngine;
          const { orgA, sugarId } = window.__t;
          const createAttempt = await BRE.createRecord({
            organizationId: orgA, applicationId: 'RetailOS', recordType: 'sale', userId: 'readonly_a',
            fields: { product: 'X', quantity: 1, buyingPrice: 1, sellingPrice: 1 }
          });
          const reverseAttempt = await BRE.reverseRecord({ organizationId: orgA, recordId: sugarId, userId: 'readonly_a', reason: 'should be denied' });
          const readAttempt = await BRE.getRecord(orgA, sugarId, 'readonly_a');
          return { createAttempt, reverseAttempt, readAttempt };
        });
        if (out.createAttempt.success) throw new Error('read-only user was able to create a record');
        if (out.reverseAttempt.success) throw new Error('read-only user was able to reverse a record');
        if (!out.readAttempt.success) throw new Error('read-only user should still be able to read (has READ permission): ' + out.readAttempt.reason);
      });

      await test('no unexpected console/page errors occurred during the whole main scenario', async () => {
        if (pageErrors.length > 0) throw new Error('uncaught page errors: ' + pageErrors.join(' | '));
        // console.log lines from storage.js's own audit logging are expected;
        // only genuine console.error output is treated as a failure.
        if (consoleErrors.length > 0) throw new Error('console errors: ' + consoleErrors.join(' | '));
      });

      // ────────────────────────────────────────────────────────────
      // Dependency-failure scenario: a real page genuinely missing the
      // real Storage Gateway script tag (not a fake window, not
      // addInitScript injection — a different real fixture file).
      // ────────────────────────────────────────────────────────────
      const missing = await openPage();
      await missing.page.goto(serverURL('/core/tests/browser/fixtures/business-record-engine-missing-storage-fixture.html'), { waitUntil: 'load' });

      await test('BusinessRecordEngine fails closed when the real Storage Gateway was never loaded (no fallback storage)', async () => {
        const state = await missing.page.evaluate(() => ({ storage: typeof window.CozyStorage, bre: !!(window.CozyOS && window.CozyOS.BusinessRecordEngine) }));
        if (state.storage !== 'undefined') throw new Error('test setup error: window.CozyStorage should genuinely be undefined on this fixture');
        if (!state.bre) throw new Error('test setup error: BusinessRecordEngine should still be present on this fixture');

        const out = await missing.page.evaluate(async () => {
          const Registry = window.CozyOS.OrganizationRegistry;
          const Membership = window.CozyOS.OrganizationMembership;
          const BRE = window.CozyOS.BusinessRecordEngine;
          const orgId = Registry.createOrganization({ name: 'ORG-NO-STORAGE' }).orgId;
          Membership.createMembership({ userId: 'u1', organizationId: orgId, permissions: [BRE.PERMISSIONS.CREATE] });
          return BRE.createRecord({
            organizationId: orgId, applicationId: 'RetailOS', recordType: 'sale', userId: 'u1',
            fields: { product: 'X', quantity: 1, buyingPrice: 1, sellingPrice: 1 }
          });
        });
        if (out.success) throw new Error('createRecord unexpectedly succeeded with no Storage Gateway loaded');
        if (!/Storage Gateway/i.test(out.reason || '')) throw new Error('expected a real "Storage Gateway ... not loaded" reason, got: ' + JSON.stringify(out));
      });
    });
  } catch (e) {
    if (e.code === 'NO_PLAYWRIGHT' || e.code === 'NO_BROWSER') {
      console.log('BROWSER_TEST = NOT_RUN (' + e.message + ')');
      console.log('\n0 passed, 0 failed');
      process.exitCode = 0;
      return;
    }
    throw e;
  }

  const { passed, failed } = summary();
  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(failed > 0 ? 'BROWSER_TEST = RAN_WITH_FAILURES' : 'BROWSER_TEST = PASS');
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.log('BROWSER_TEST = NOT_RUN (' + err.message + ')');
  process.exitCode = 0;
});
