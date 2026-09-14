'use strict';

/**
 * core/tests/browser/pharmacyos-app-browser.test.js
 * PharmacyOS Phase 1 - real browser UI test, canonical harness.
 */

const { withBrowser, makeRunner } = require('./cozy-browser');

async function main() {
  const { test, summary } = makeRunner();

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      await test('PharmacyOS page loads and renders the real setup screen', async () => {
        const { page } = await openPage();
        await page.goto(serverURL('/applications/PharmacyOS/pharmacyos.html'), { waitUntil: 'load', timeout: 20000 });
        const setupVisible = await page.evaluate(() => document.getElementById('ph-no-org-section').style.display !== 'none');
        if (!setupVisible) throw new Error('expected the real setup screen to be visible with no pharmacy set up yet');
        await page.close();
      });

      await test('Setting up a pharmacy calls the real setupPharmacy() and reveals the real catalog screen', async () => {
        const { page } = await openPage();
        await page.goto(serverURL('/applications/PharmacyOS/pharmacyos.html'), { waitUntil: 'load', timeout: 20000 });
        await page.fill('#ph-setup-name', 'Test Pharmacy');
        await page.click('#ph-setup-btn');
        const catalogVisible = await page.evaluate(() => document.getElementById('ph-catalog-section').style.display !== 'none');
        if (!catalogVisible) throw new Error('expected the real catalog screen after setup');
        await page.close();
      });

      await test('Creating an ordinary medicine calls the real createMedicine() and displays it in the real table', async () => {
        const { page } = await openPage();
        await page.goto(serverURL('/applications/PharmacyOS/pharmacyos.html'), { waitUntil: 'load', timeout: 20000 });
        await page.fill('#ph-setup-name', 'Test Pharmacy');
        await page.click('#ph-setup-btn');
        await page.fill('#ph-med-name', 'Paracetamol');
        await page.click('#ph-med-create-btn');
        const rowText = await page.evaluate(() => document.getElementById('ph-med-table-body').textContent);
        if (!rowText.includes('Paracetamol')) throw new Error('expected the real created medicine to appear in the table');
        await page.close();
      });

      await test('Controlled-substance authorization: without a real granted permission, controlled medicines never appear in the real list', async () => {
        const { page } = await openPage();
        await page.goto(serverURL('/applications/PharmacyOS/pharmacyos.html'), { waitUntil: 'load', timeout: 20000 });
        await page.fill('#ph-setup-name', 'Test Pharmacy');
        await page.click('#ph-setup-btn');
        await page.fill('#ph-med-name', 'Morphine');
        await page.evaluate(() => document.getElementById('ph-med-controlled').click());
        await page.click('#ph-med-create-btn');
        const createResult = await page.evaluate(() => document.getElementById('ph-med-create-result').textContent);
        if (!/could not add medicine/i.test(createResult)) throw new Error(`expected controlled-substance creation to be honestly denied, got: ${createResult}`);
        const rowText = await page.evaluate(() => document.getElementById('ph-med-table-body').textContent);
        if (rowText.includes('Morphine')) throw new Error('a denied controlled-substance medicine must never appear in the real table');
        await page.close();
      });

      await test('Real audit entries are genuinely created for setup and medicine creation', async () => {
        const { page } = await openPage();
        await page.goto(serverURL('/applications/PharmacyOS/pharmacyos.html'), { waitUntil: 'load', timeout: 20000 });
        await page.fill('#ph-setup-name', 'Test Pharmacy');
        await page.click('#ph-setup-btn');
        await page.fill('#ph-med-name', 'Paracetamol');
        await page.click('#ph-med-create-btn');
        const auditActions = await page.evaluate(() => window.CozyOS.PharmacyOS.getAuditLog().map((e) => e.action));
        if (!auditActions.includes('PHARMACY_SETUP') || !auditActions.includes('MEDICINE_CREATED')) {
          throw new Error(`expected real audit entries, got: ${JSON.stringify(auditActions)}`);
        }
        await page.close();
      });

      await test('No page errors occur during the full real setup + medicine creation flow', async () => {
        const { page } = await openPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(serverURL('/applications/PharmacyOS/pharmacyos.html'), { waitUntil: 'load', timeout: 20000 });
        await page.fill('#ph-setup-name', 'Test Pharmacy');
        await page.click('#ph-setup-btn');
        await page.fill('#ph-med-name', 'Paracetamol');
        await page.click('#ph-med-create-btn');
        if (errors.length) throw new Error('real page errors: ' + errors.join(' | '));
        await page.close();
      });
    });
  } catch (err) {
    if (err.code === 'NO_PLAYWRIGHT' || err.code === 'NO_BROWSER') {
      console.log(`BROWSER_TEST = NOT_RUN (${err.message})`);
      process.exit(0);
    }
    throw err;
  }

  const { passed, failed } = summary();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  console.log(failed === 0 ? 'BROWSER_TEST = PASS' : 'BROWSER_TEST = RAN_WITH_FAILURES');
  process.exit(failed > 0 ? 1 : 0);
}

main();
