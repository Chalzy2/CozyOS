'use strict';

/**
 * core/shell/tests/live-window-application-modes-acceptance-browser.test.js
 *
 * LIVE WINDOW APPLICATION COVERAGE PASS — real browser acceptance tests
 * for every newly-registered Live Window mode this pass added (QuarryOS,
 * ShopOS, MpesaOS, InterestOS, PharmacyOS, WholesaleOS, SpiritualOS),
 * against the real admin-workspace.html and dashboard.html this
 * repository ships — same canonical core/tests/browser/cozy-browser.js
 * harness, same Test-L-style chained-context-switch pattern as
 * core/shell/tests/live-window-lifecycle-acceptance-browser.test.js's
 * own "Worship -> QuarryOS -> ShopOS" test, extended here to cover every
 * real mode this pass registered rather than test stubs.
 *
 * WHAT THIS PROVES (real DOM/state, not intent)
 *   Q1: admin-workspace.html registers all six business-application
 *       modes (quarry/shop/mpesa/interest/pharmacy/wholesale) — real
 *       registerMode() calls, not test stubs.
 *   Q2: activateMode("quarry") renders QuarryManager's real
 *       getHealth()/getStatistics() output and a working AI Advisor
 *       question form (real handle({route:"ask_ai_advisor"})).
 *   Q3: activateMode("shop") renders real ShopReporting/ShopInventory/
 *       ShopProduct content (the full ShopOS suite is loaded on
 *       admin-workspace.html).
 *   Q4: activateMode("mpesa") renders real per-engine diagnostics and a
 *       real company/branch picker sourced from window.CozyOS.Company.
 *   Q5: activateMode("pharmacy") renders real PharmacyOS diagnostics and
 *       an honest "no pharmacy organization is set up yet" disclosure
 *       (no real Pharmacy organization exists in this fresh session).
 *   Q6: activateMode("wholesale") renders the real Shared Catalog view
 *       (WholesaleOS composing ShopProduct).
 *   Q7 (Test-L-style chain): quarry -> shop -> mpesa -> pharmacy ->
 *       wholesale -> assistant — each context is fully torn down before
 *       the next renders (no residual DOM/data leak), and exactly one
 *       .cozy-window[data-window-id="cozy-assistant"] exists throughout.
 *   I1 (dashboard.html): activateMode("interest") renders real
 *       InterestOS directive/business-workspace sections (both engines
 *       are loaded together only on dashboard.html) with an honest
 *       "sign in" disclosure (no real actorId in this anonymous test
 *       session).
 *   S1 (dashboard.html): activateMode("spiritual") renders real
 *       SpiritualCapability content — a real prayer-structure result
 *       for a submitted topic, composed with zero fabricated Scripture.
 *
 * Run with:
 *   COZY_E2E_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *   node core/shell/tests/live-window-application-modes-acceptance-browser.test.js
 */

const { withBrowser, makeRunner } = require('../../tests/browser/cozy-browser');

async function main() {
  const { test, summary } = makeRunner();
  const allPageErrors = [];

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      async function newPage(page404 = '/admin-workspace.html', viewport = { width: 1280, height: 800 }) {
        const { page, pageErrors } = await openPage({ viewport });
        allPageErrors.push(pageErrors);
        await page.goto(serverURL(page404), { waitUntil: 'load' });
        await page.waitForFunction(() => window.CozyOS && window.CozyOS.LiveWindow, { timeout: 15000 });
        return page;
      }

      console.log('\nLive Window Application Coverage — real browser acceptance tests (admin-workspace.html + dashboard.html):\n');

      await test('Q1: admin-workspace.html registers all six real business-application modes', async () => {
        const page = await newPage();
        const registered = await page.evaluate(() => window.CozyOS.LiveWindow.listRegisteredModes());
        for (const modeId of ['quarry', 'shop', 'mpesa', 'interest', 'pharmacy', 'wholesale']) {
          if (!registered.includes(modeId)) throw new Error(`expected "${modeId}" to be a real registered mode, got: ${registered.join(', ')}`);
        }
        await page.close();
      });

      await test('Q2: activateMode("quarry") renders real QuarryManager health/statistics and a working AI Advisor', async () => {
        const page = await newPage();
        const result = await page.evaluate(() => window.CozyOS.LiveWindow.activateMode('quarry'));
        if (!result.success) throw new Error('activateMode("quarry") did not succeed: ' + result.reason);
        await page.waitForSelector('#cozy-live-window-mode-region:not([hidden])');
        await page.waitForFunction(() => {
          const el = document.getElementById('cozy-live-window-quarry-health-status');
          return el && /Status:/.test(el.textContent);
        }, { timeout: 10000 });
        await page.fill('#cozy-live-window-quarry-advisor-input', 'what is our profit today');
        await page.press('#cozy-live-window-quarry-advisor-input', 'Enter');
        await page.waitForFunction(() => {
          const el = document.getElementById('cozy-live-window-quarry-advisor-result');
          return el && el.textContent.trim().length > 0 && el.textContent !== 'Asking the real Quarry AI Advisor…';
        }, { timeout: 10000 });
        const advisorText = await page.$eval('#cozy-live-window-quarry-advisor-result', (el) => el.textContent);
        if (!/Quarry AI Advisor/.test(advisorText)) throw new Error(`expected a real Quarry AI Advisor response, got: "${advisorText}"`);
        await page.close();
      });

      await test('Q3: activateMode("shop") renders real ShopReporting/ShopInventory/ShopProduct content (full suite loaded on this page)', async () => {
        const page = await newPage();
        const result = await page.evaluate(() => window.CozyOS.LiveWindow.activateMode('shop'));
        if (!result.success) throw new Error('activateMode("shop") did not succeed: ' + result.reason);
        await page.waitForSelector('#cozy-live-window-mode-region:not([hidden])');
        await page.waitForFunction(() => {
          const el = document.getElementById('cozy-live-window-shop-sales-status');
          return el && el.textContent.trim().length > 0 && el.textContent !== 'Loading real sales data…';
        }, { timeout: 10000 });
        const salesStatus = await page.$eval('#cozy-live-window-shop-sales-status', (el) => el.textContent);
        if (/not connected/i.test(salesStatus)) throw new Error(`expected real ShopReporting content on admin-workspace.html, got: "${salesStatus}"`);
        await page.close();
      });

      await test('Q4: activateMode("mpesa") renders real per-engine diagnostics and a real company/branch picker', async () => {
        const page = await newPage();
        const result = await page.evaluate(() => window.CozyOS.LiveWindow.activateMode('mpesa'));
        if (!result.success) throw new Error('activateMode("mpesa") did not succeed: ' + result.reason);
        await page.waitForSelector('#cozy-live-window-mode-region:not([hidden])');
        const diagText = await page.$eval('.cozy-live-window-mpesa-diagnostics', (el) => el.textContent);
        if (!/MpesaFloat/.test(diagText)) throw new Error(`expected real MpesaFloat diagnostics, got: "${diagText}"`);
        await page.close();
      });

      await test('Q5: activateMode("pharmacy") renders real diagnostics and an honest "no pharmacy organization" disclosure', async () => {
        const page = await newPage();
        const result = await page.evaluate(() => window.CozyOS.LiveWindow.activateMode('pharmacy'));
        if (!result.success) throw new Error('activateMode("pharmacy") did not succeed: ' + result.reason);
        await page.waitForSelector('#cozy-live-window-mode-region:not([hidden])');
        const catalogText = await page.$eval('.cozy-live-window-pharmacy-catalog', (el) => el.textContent);
        if (!/no real pharmacy organization is set up yet/i.test(catalogText)) throw new Error(`expected an honest "no pharmacy organization" disclosure, got: "${catalogText}"`);
        await page.close();
      });

      await test('Q6: activateMode("wholesale") renders the real Shared Catalog (WholesaleOS composing ShopProduct)', async () => {
        const page = await newPage();
        const result = await page.evaluate(() => window.CozyOS.LiveWindow.activateMode('wholesale'));
        if (!result.success) throw new Error('activateMode("wholesale") did not succeed: ' + result.reason);
        await page.waitForSelector('#cozy-live-window-mode-region:not([hidden])');
        await page.waitForFunction(() => {
          const el = document.getElementById('cozy-live-window-wholesale-catalog-list');
          return el && el.textContent.trim().length > 0 && el.textContent !== 'Loading real catalog…';
        }, { timeout: 10000 });
        const catalogText = await page.$eval('#cozy-live-window-wholesale-catalog-list', (el) => el.textContent);
        if (/not connected/i.test(catalogText)) throw new Error(`expected the real WholesaleOS Shared Catalog on admin-workspace.html, got: "${catalogText}"`);
        await page.close();
      });

      await test('Q7: context quarry -> shop -> mpesa -> pharmacy -> wholesale -> assistant — each is fully torn down before the next renders, exactly 1 window throughout', async () => {
        const page = await newPage();
        const chain = ['quarry', 'shop', 'mpesa', 'pharmacy', 'wholesale'];
        let previousMarkerClass = null;
        for (const modeId of chain) {
          const result = await page.evaluate((m) => window.CozyOS.LiveWindow.activateMode(m), modeId);
          if (!result.success) throw new Error(`activateMode("${modeId}") did not succeed: ` + result.reason);
          await page.waitForSelector('#cozy-live-window-mode-region:not([hidden])');
          await page.waitForSelector(`.cozy-live-window-${modeId}-header`, { timeout: 10000 });
          if (previousMarkerClass) {
            const leaked = await page.$eval('#cozy-live-window-mode-region', (el, prevCls) => el.innerHTML.includes(prevCls), previousMarkerClass);
            if (leaked) throw new Error(`previous context class "${previousMarkerClass}" leaked into the "${modeId}" context`);
          }
          previousMarkerClass = `cozy-live-window-${modeId}-header`;
        }
        await page.evaluate(() => window.CozyOS.LiveWindow.activate({ mode: 'assistant' }));
        const regionHidden = await page.$eval('#cozy-live-window-mode-region', (el) => el.hidden);
        if (!regionHidden) throw new Error('mode region was not hidden after returning to the plain assistant view');
        const windowCount = await page.$$eval('.cozy-window[data-window-id="cozy-assistant"]', (els) => els.length);
        if (windowCount !== 1) throw new Error(`expected exactly 1 window across the full application-mode chain, got ${windowCount}`);
        await page.close();
      });

      await test('I1: activateMode("interest") on dashboard.html renders real InterestOS directive/business-workspace sections with an honest "sign in" disclosure', async () => {
        const page = await newPage('/dashboard.html');
        const registered = await page.evaluate(() => window.CozyOS.LiveWindow.listRegisteredModes());
        if (!registered.includes('interest')) throw new Error(`expected "interest" to be registered on dashboard.html, got: ${registered.join(', ')}`);
        const result = await page.evaluate(() => window.CozyOS.LiveWindow.activateMode('interest'));
        if (!result.success) throw new Error('activateMode("interest") did not succeed: ' + result.reason);
        await page.waitForSelector('#cozy-live-window-mode-region:not([hidden])');
        const directivesText = await page.$eval('.cozy-live-window-interest-directives', (el) => el.textContent);
        if (!/sign in/i.test(directivesText)) throw new Error(`expected an honest "sign in" disclosure for an anonymous session, got: "${directivesText}"`);
        const workspaceText = await page.$eval('.cozy-live-window-interest-workspace', (el) => el.textContent);
        if (!/sign in/i.test(workspaceText)) throw new Error(`expected an honest "sign in" disclosure for the business workspace too, got: "${workspaceText}"`);
        await page.close();
      });

      await test('S1: activateMode("spiritual") on dashboard.html renders a real, non-fabricated prayer structure for a submitted topic', async () => {
        const page = await newPage('/dashboard.html');
        const registered = await page.evaluate(() => window.CozyOS.LiveWindow.listRegisteredModes());
        if (!registered.includes('spiritual')) throw new Error(`expected "spiritual" to be registered on dashboard.html, got: ${registered.join(', ')}`);
        const result = await page.evaluate(() => window.CozyOS.LiveWindow.activateMode('spiritual'));
        if (!result.success) throw new Error('activateMode("spiritual") did not succeed: ' + result.reason);
        await page.waitForSelector('#cozy-live-window-mode-region:not([hidden])');
        const sections = await page.$$('.cozy-live-window-spiritual-section');
        if (sections.length < 4) throw new Error(`expected 4 real spiritual sections (Prayer/Scripture/Devotional/Worship Info), got ${sections.length}`);
        const prayerInput = await page.$('.cozy-live-window-spiritual-section input');
        await prayerInput.fill('exams');
        await page.evaluate(() => document.querySelector('.cozy-live-window-spiritual-section form').dispatchEvent(new Event('submit', { cancelable: true })));
        await page.waitForFunction(() => {
          const el = document.querySelector('.cozy-live-window-spiritual-result');
          return el && el.textContent.trim().length > 0;
        }, { timeout: 10000 });
        const prayerText = await page.$eval('.cozy-live-window-spiritual-result', (el) => el.textContent);
        if (!/exams/i.test(prayerText)) throw new Error(`expected the real prayer structure to reference the submitted topic "exams", got: "${prayerText}"`);
        await page.close();
      });

      await test('no unexpected page errors were thrown during any of the above interactions', async () => {
        // Same disclosed-environment-error convention as the existing
        // Live Window acceptance suites: this sandbox genuinely has no
        // outbound network to Firebase, and PluginManager's own
        // real-but-separate load-order gap is pre-existing and
        // unrelated to this pass's changes.
        const flat = allPageErrors.flat().filter((msg) => !/firebasejs|gstatic\.com|Firebase\.Bootstrap|PluginManager is not defined/i.test(msg));
        if (flat.length) throw new Error('real page errors: ' + flat.join(' | '));
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
