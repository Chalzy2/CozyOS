'use strict';

/**
 * core/plugins/tests/interestOS-ask-cozyai-browser.test.js
 *
 * REAL browser test (Playwright + real Chromium at /opt/pw-browsers,
 * core/tests/browser/cozy-browser.js) for the "Ask CozyAI" control added
 * to My Business in InterestOS Full Completion Phase 2 (CozyAI
 * Integration). Drives the actual UI: create a table, tag roles, add a
 * row, then ask a real question and verify the real, computed answer
 * text — same pattern as interestOS-business-workspace-browser.test.js.
 *
 * Every answer below flows through the real, unmodified
 * window.CozyOS.CozyAnswerEngine.answer() -> CozyAI.getContext() ->
 * InterestOSBusinessWorkspace.computeSummary() chain; no mocked AI/
 * answer layer of its own.
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
          window.CozyOS.Session = { current: () => ({ uid: 'ask-cozyai-browser-test-owner' }) };
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

        await test(`[${label}] Ask CozyAI control renders inside My Business once a table exists`, async () => {
          await page.fill('#ios-biz-table-name-input', 'AI Shop');
          await page.click('#ios-biz-new-table-btn');
          await page.waitForSelector('#ios-biz-table-editor', { state: 'visible' });
          const count = await page.locator('#ios-biz-ask-input').count();
          if (count !== 1) throw new Error('Ask CozyAI input not found');
        });

        await test(`[${label}] asking before any row/role data still returns a real, honest (non-crashing) answer`, async () => {
          await page.fill('#ios-biz-ask-input', 'What is my profit this month?');
          await page.click('#ios-biz-ask-btn');
          await page.waitForFunction(() => {
            const el = document.getElementById('ios-biz-ask-answer');
            return el && el.style.display !== 'none' && el.textContent.trim().length > 0 && el.textContent !== 'Thinking...';
          });
          const text = await page.textContent('#ios-biz-ask-answer');
          if (!text || !text.trim()) throw new Error('expected a non-empty answer');
        });

        await test(`[${label}] adding role-tagged columns and a row, then asking, returns a real computed profit figure`, async () => {
          await addColumn(page, 'Date', 'DATE', 'DATE');
          await addColumn(page, 'Sell', 'NUMBER', 'SELLING_PRICE');
          await addColumn(page, 'Buy', 'NUMBER', 'BUYING_PRICE');
          await page.click('#ios-biz-add-row-btn');
          await page.waitForSelector('table.ios-biz-table tbody tr');
          const inputs = page.locator('table.ios-biz-table tbody tr').first().locator('input');
          const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));
          await inputs.nth(0).fill(today);
          await inputs.nth(0).dispatchEvent('change');
          await inputs.nth(1).fill('150');
          await inputs.nth(1).dispatchEvent('change');
          await inputs.nth(2).fill('90');
          await inputs.nth(2).dispatchEvent('change');

          await page.fill('#ios-biz-ask-input', 'What is my profit this month?');
          await page.click('#ios-biz-ask-btn');
          await page.waitForFunction(() => {
            const el = document.getElementById('ios-biz-ask-answer');
            return el && /profit 60/.test(el.textContent || '');
          });
          const text = await page.textContent('#ios-biz-ask-answer');
          if (!/profit 60/.test(text)) throw new Error('expected the real computed profit of 60 (150-90) in the answer: ' + text);
        });

        await test(`[${label}] an empty question is a no-op — no crash, no stale "Thinking..." left behind`, async () => {
          await page.fill('#ios-biz-ask-input', '');
          await page.click('#ios-biz-ask-btn');
          const text = await page.textContent('#ios-biz-ask-answer');
          if (text === 'Thinking...') throw new Error('empty question must not trigger a pending Thinking state');
        });

        await test(`[${label}] no unexpected console/page errors from Ask CozyAI`, async () => {
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
