'use strict';

/**
 * core/plugins/tests/interestOS-business-workspace-browser.test.js
 *
 * REAL browser test (Playwright + real Chromium at /opt/pw-browsers,
 * core/tests/browser/cozy-browser.js) for the "My Business" section
 * added in Full Completion Phase 1. Drives the actual UI: create a
 * table, add columns (tagging DATE/PRODUCT/QUANTITY/BUYING_PRICE/
 * SELLING_PRICE/PAYMENT_STATUS roles), add rows, edit cells, and view a
 * real computed summary — same pattern as
 * interestOS-reminder-directive-followup-browser.test.js.
 *
 * Session is stubbed via addInitScript only for sign-in (same
 * convention as every other InterestOS browser test in this
 * directory); every table/row/summary read and write below flows
 * through the real, unmodified InterestOSBusinessWorkspace + CozyMemory.
 */

const { withBrowser, makeRunner } = require('../../tests/browser/cozy-browser');

async function main() {
  const { test, summary } = makeRunner();

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      async function newPage(viewport) {
        const { page, pageErrors, consoleErrors, failedRequests } = await openPage({ viewport });
        await page.addInitScript(() => {
          window.CozyOS = window.CozyOS || {};
          window.CozyOS.Session = { current: () => ({ uid: 'biz-browser-test-owner' }) };
        });
        await page.goto(serverURL('/applications/InterestOS/interestos.html'));
        await page.waitForSelector('#ios-engine-status');
        return { page, pageErrors, consoleErrors, failedRequests };
      }

      async function addColumn(page, label, type, role) {
        await page.fill('#ios-biz-new-col-label', label);
        await page.selectOption('#ios-biz-new-col-type', type);
        if (role) await page.selectOption('#ios-biz-new-col-role', role);
        await page.click('#ios-biz-add-column-btn');
        await page.waitForFunction((lbl) => {
          const inputs = document.querySelectorAll('.ios-biz-col-label-input');
          return [...inputs].some((i) => i.value === lbl);
        }, label);
      }

      for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 900 }]) {
        const label = `${viewport.width}x${viewport.height}`;
        const { page, pageErrors, consoleErrors, failedRequests } = await newPage(viewport);

        await test(`[${label}] My Business section renders with zero page errors`, async () => {
          const engineStatus = await page.textContent('#ios-engine-status');
          if (!/Ready/.test(engineStatus)) throw new Error(`engine status not Ready: "${engineStatus}"`);
          const count = await page.locator('#ios-biz-table-select').count();
          if (count !== 1) throw new Error('My Business table select not found');
          if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
        });

        await test(`[${label}] creating a new business table shows it as selected and the editor opens`, async () => {
          await page.fill('#ios-biz-table-name-input', 'Shop Sales');
          await page.click('#ios-biz-new-table-btn');
          await page.waitForSelector('#ios-biz-table-editor', { state: 'visible' });
          const selectedText = await page.locator('#ios-biz-table-select option:checked').textContent();
          if (selectedText !== 'Shop Sales') throw new Error('new table not selected: ' + selectedText);
        });

        await test(`[${label}] adding role-tagged columns (Date/Product/Qty/Buy/Sell/Payment) renders real column headers`, async () => {
          await addColumn(page, 'Date', 'DATE', 'DATE');
          await addColumn(page, 'Product', 'TEXT', 'PRODUCT');
          await addColumn(page, 'Qty', 'NUMBER', 'QUANTITY');
          await addColumn(page, 'Buy', 'NUMBER', 'BUYING_PRICE');
          await addColumn(page, 'Sell', 'NUMBER', 'SELLING_PRICE');
          await addColumn(page, 'Payment', 'TEXT', 'PAYMENT_STATUS');
          const headerCount = await page.locator('.ios-biz-col-label-input').count();
          if (headerCount !== 6) throw new Error(`expected 6 real columns, got ${headerCount}`);
        });

        await test(`[${label}] adding a row and editing its cells persists real data through the real engine`, async () => {
          await page.click('#ios-biz-add-row-btn');
          await page.waitForSelector('table.ios-biz-table tbody tr');
          const inputs = page.locator('table.ios-biz-table tbody tr').first().locator('input');
          const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));
          await inputs.nth(0).fill(today);
          await inputs.nth(0).dispatchEvent('change');
          await inputs.nth(1).fill('Bread');
          await inputs.nth(1).dispatchEvent('change');
          await inputs.nth(2).fill('3');
          await inputs.nth(2).dispatchEvent('change');
          await inputs.nth(3).fill('50');
          await inputs.nth(3).dispatchEvent('change');
          await inputs.nth(4).fill('80');
          await inputs.nth(4).dispatchEvent('change');
          await inputs.nth(5).fill('paid');
          await inputs.nth(5).dispatchEvent('change');
          // Reload the grid view to prove the edits were really persisted
          // through InterestOSBusinessWorkspace, not merely left in the DOM.
          await page.selectOption('#ios-biz-table-select', { index: 0 });
          const reloadedProduct = await page.locator('table.ios-biz-table tbody tr').first().locator('input').nth(1).inputValue();
          if (reloadedProduct !== 'Bread') throw new Error('row edit did not persist through the real engine: got ' + reloadedProduct);
        });

        await test(`[${label}] "View Totals" computes a real, correct monthly summary from tagged roles`, async () => {
          await page.selectOption('#ios-biz-period-select', 'monthly');
          await page.click('#ios-biz-summary-btn');
          await page.waitForSelector('#ios-biz-summary', { state: 'visible' });
          const summaryText = await page.textContent('#ios-biz-summary');
          // revenue = 3*80 = 240, cost = 3*50 = 150, profit = 90, cash = 240 (paid)
          if (!/240/.test(summaryText)) throw new Error('expected real computed revenue/cash of 240 in summary: ' + summaryText);
          if (!/90/.test(summaryText)) throw new Error('expected real computed profit of 90 in summary: ' + summaryText);
        });

        await test(`[${label}] removing the row leaves the table empty of rows, real deletion through the engine`, async () => {
          await page.click('table.ios-biz-table tbody tr button[data-remove-row]');
          await page.waitForFunction(() => document.querySelectorAll('table.ios-biz-table tbody tr').length === 0);
        });

        await test(`[${label}] LAYOUT: the business table scroll container never forces page-level horizontal overflow`, async () => {
          const overflow = await page.evaluate(() => {
            const doc = document.documentElement;
            return doc.scrollWidth - doc.clientWidth;
          });
          if (overflow > 1) throw new Error(`page-level horizontal overflow of ${overflow}px at ${label}`);
        });

        await test(`[${label}] no unexpected console/page errors from My Business`, async () => {
          if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
          const unexpected = consoleErrors.filter((e) => !/status of 404.*Not Found|documents\/personal\/search/i.test(e));
          if (unexpected.length) throw new Error('console errors: ' + unexpected.join(' | ') + ' | failed requests: ' + JSON.stringify(failedRequests));
        });
      }
    });
  } catch (e) {
    if (e.code === 'NO_PLAYWRIGHT' || e.code === 'NO_BROWSER') {
      console.log(`BROWSER_TEST = NOT_RUN (${e.message})`);
      process.exit(0);
    }
    console.log('BROWSER_TEST = RAN_WITH_FAILURES (harness error: ' + e.message + ')');
    process.exit(1);
  }

  const { passed, failed } = summary();
  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`BROWSER_TEST = ${failed === 0 ? 'PASS' : 'RAN_WITH_FAILURES'}`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
