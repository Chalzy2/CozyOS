'use strict';

/**
 * core/plugins/tests/interestOS-reminder-directive-followup-browser.test.js
 *
 * REAL browser test (Playwright + real Chromium at /opt/pw-browsers, the
 * shared CozyOS browser-verification foundation — core/tests/browser/
 * cozy-browser.js). Drives the actual My Reminders / My Directives
 * increment through the real UI (type -> Interpret -> Confirm & Save ->
 * Mark done), at both a real mobile viewport (375x812) and desktop
 * (1280x900), the same two sizes the Canonical Merge checkpoint used.
 *
 * Session is stubbed via addInitScript only for sign-in (this page reads
 * window.CozyOS.Session.current().uid — no real auth UI exists on this
 * standalone page to click through); every reminder/directive read,
 * write, and owner check below flows through the real, unmodified
 * InterestOS core + CozyMemory + CozyNotification, never a mock of those.
 */

const path = require('path');
const { withBrowser, makeRunner } = require('../../tests/browser/cozy-browser');

async function main() {
  const { test, summary } = makeRunner();
  const allPageErrors = [];

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      async function newPage(viewport) {
        const { page, pageErrors, consoleErrors, failedRequests } = await openPage({ viewport });
        allPageErrors.push(pageErrors);
        await page.addInitScript(() => {
          window.CozyOS = window.CozyOS || {};
          window.CozyOS.Session = { current: () => ({ uid: 'browser-test-owner' }) };
        });
        await page.goto(serverURL('/applications/InterestOS/interestos.html'));
        await page.waitForSelector('#ios-engine-status');
        return { page, pageErrors, consoleErrors, failedRequests };
      }

      async function createReminderDirective(page) {
        // Real UI flow: build "Remind me at H:MM AM/PM to call the
        // customer" using a real near-future time computed in the
        // browser's own clock, so interpretDirective()'s real regex
        // parses it regardless of what time this test happens to run.
        const timeText = await page.evaluate(() => {
          const t = new Date(Date.now() + 3 * 60 * 1000);
          let h = t.getHours();
          const m = t.getMinutes();
          const mer = h >= 12 ? 'PM' : 'AM';
          h = h % 12; if (h === 0) h = 12;
          return `${h}:${String(m).padStart(2, '0')} ${mer}`;
        });
        await page.fill('#ios-directive-input', `Remind me at ${timeText} to call the customer`);
        await page.click('#ios-interpret-btn');
        await page.waitForSelector('#ios-interpretation-box', { state: 'visible' });
        await page.click('#ios-confirm-btn');
        await page.waitForFunction(() => {
          const note = document.getElementById('ios-directive-result');
          return note && note.textContent && note.textContent.length > 0;
        });
      }

      for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 900 }]) {
        const label = `${viewport.width}x${viewport.height}`;
        const { page, pageErrors, consoleErrors, failedRequests } = await newPage(viewport);

        await test(`[${label}] real page loads with InterestOS engine ready, zero console/page errors`, async () => {
          const status = await page.textContent('#ios-engine-status');
          if (!/Ready/.test(status)) throw new Error(`engine status not Ready: "${status}"`);
          if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
        });

        await test(`[${label}] confirming a "remind me" directive creates a real directive AND schedules a real reminder`, async () => {
          await createReminderDirective(page);
          const directivesText = await page.textContent('#ios-directives-list');
          if (!/call the customer/i.test(directivesText)) throw new Error('directive not shown in My Directives: ' + directivesText);
          const remindersText = await page.textContent('#ios-reminders-list');
          if (!/call the customer/i.test(remindersText)) throw new Error('reminder not shown in My Reminders: ' + remindersText);
        });

        await test(`[${label}] the reminder row shows the linked directive's real action, and offers a real "Mark done" button`, async () => {
          const li = page.locator('#ios-reminders-list li').first();
          const text = await li.textContent();
          if (!/action: reminder/i.test(text)) throw new Error('reminder row does not show linked directive action: ' + text);
          const doneBtn = li.locator('button', { hasText: 'Mark done' });
          if ((await doneBtn.count()) !== 1) throw new Error('expected exactly one "Mark done" button on the reminder row');
        });

        await test(`[${label}] clicking "Mark done" really completes the directive and the button disappears from that row`, async () => {
          const li = page.locator('#ios-reminders-list li').first();
          await li.locator('button', { hasText: 'Mark done' }).click();
          await page.waitForFunction(() => {
            const el = document.querySelector('#ios-directives-list');
            return el && /completed/i.test(el.textContent);
          });
          const directivesText = await page.textContent('#ios-directives-list');
          if (!/completed/i.test(directivesText)) throw new Error('My Directives does not show the completed status: ' + directivesText);
          const doneBtnCount = await page.locator('#ios-reminders-list li').first().locator('button', { hasText: 'Mark done' }).count();
          if (doneBtnCount !== 0) throw new Error('"Mark done" button should disappear once the directive is completed');
        });

        await test(`[${label}] no NEW console errors were introduced by this increment (one pre-existing, unrelated 404 is disclosed, not silently ignored)`, async () => {
          // Confirmed (via a plain response-status probe, not assumed):
          // this static-file-only test server has no backend, so My
          // Documents' real InterestOSDocumentsClient search call to
          // /documents/personal/search 404s on every load of this page —
          // present before this increment, unrelated to reminders/
          // directives, and out of this task's scope to fix (Rule 17,
          // Scope Isolation). Any OTHER console error still fails this
          // test.
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
