'use strict';

/**
 * core/shell/tests/live-next-step-suggestions-acceptance-browser.test.js
 *
 * LIVE NEXT-STEP INTELLIGENCE — real browser acceptance tests against
 * the real dashboard.html this repository ships (served by the
 * canonical core/tests/browser/cozy-browser.js harness, same pattern
 * as core/shell/tests/live-window-architecture-acceptance-browser.test.js).
 *
 * Covers required tests:
 *   5.  Destructive action requires confirmation before executing.
 *   6.  Context switch (Worship -> QuarryOS mode) clears old
 *       suggestions, same Live Window, no second window.
 *   7.  Resize does not break the suggestion UI (no horizontal
 *       overflow at any width; buttons stay reachable).
 *   8.  Minimize/restore preserves suggestion state.
 *   9.  Mobile viewport — no second popup/window is ever created by
 *       tapping a suggestion.
 *   11. Suggestions reflect the current conversation context on a
 *       follow-up turn (asking about the same application twice keeps
 *       suggestions scoped to that application; asking about a
 *       genuinely factual question in between still returns none).
 *
 * Run with:
 *   COZY_E2E_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *   node core/shell/tests/live-next-step-suggestions-acceptance-browser.test.js
 */

const { withBrowser, makeRunner } = require('../../tests/browser/cozy-browser');

/**
 * clickReal(page, selector, index) — dispatches a REAL DOM click()
 * directly on the element (via page.evaluate), rather than a
 * coordinate-based synthetic pointer click. This repository's own
 * existing Live Window acceptance suite already discloses and works
 * around the exact same, pre-existing environment fact: dashboard.html's
 * real #cozy-launch-screen startup overlay can sit, briefly, on top of
 * real interactive elements underneath it, so a real OS-level pointer
 * click (even Playwright's `force: true`, which only skips actionability
 * assertions — it does not change WHERE the OS delivers the click) can
 * land on the overlay instead of the button. Calling `.click()` directly
 * on the resolved element still exercises the SAME real
 * addEventListener('click', ...) handler cozy-next-step-suggestions-ui.js
 * attaches — this proves the real click-handling logic, without being
 * defeated by an unrelated startup-animation z-order quirk.
 */
async function clickReal(page, selector, index = 0) {
    await page.evaluate(({ selector, index }) => {
        const els = document.querySelectorAll(selector);
        const el = els[index];
        if (!el) throw new Error(`clickReal: no element at index ${index} for selector "${selector}" (found ${els.length}).`);
        el.click();
    }, { selector, index });
}

async function askAndWaitForSuggestions(page, text, { expectNone = false } = {}) {
    await page.fill('#cozy-living-assistant-input', text);
    await page.press('#cozy-living-assistant-input', 'Enter');
    if (expectNone) {
        // Give the real async answer pipeline a moment to run, then assert
        // the suggestion region stays hidden/empty — never poll for a
        // positive that won't come.
        await page.waitForTimeout(800);
        return;
    }
    await page.waitForSelector('#cozy-next-step-suggestions-region:not([hidden]) .cozy-next-step-suggestion-btn', { timeout: 10000 });
}

async function main() {
    const { test, summary } = makeRunner();
    const allPageErrors = [];

    try {
        await withBrowser(async ({ openPage, serverURL }) => {
            async function newPage(viewport = { width: 1280, height: 800 }) {
                const { page, pageErrors } = await openPage({ viewport });
                allPageErrors.push(pageErrors);
                // dashboard.html's own real, pre-existing, unrelated
                // routing rule (see its inline script's own
                // resolveAuthState()/proceedPastSequence()): a real auth
                // check kicks off IMMEDIATELY on page load, in parallel
                // with the ~17-20s visible launch sequence, and an
                // unauthenticated result redirects to login.html the
                // moment that sequence completes. This test harness
                // never performs a real sign-in, and this feature's own
                // real async answer-pipeline round trips take long
                // enough that some of these tests genuinely run past
                // that mark. addInitScript() (runs before ANY page
                // script, every navigation) installs a real property
                // setter on window.CozyOS so that whenever the page's
                // OWN auth-coordinator.js assigns the real
                // window.CozyOS.AuthCoordinator instance, that exact
                // real instance's isAuthenticated() is patched to true
                // before resolveAuthState()'s own promise chain (which
                // starts synchronously on load) ever reads it — this is
                // a test-only stub of an unrelated routing rule, never a
                // change to any source file, and it does not touch
                // authorization for the real QuarryOS/ChurchOS actions
                // this feature actually executes (those go through
                // NextStepActionRegistry -> the app's own real handler,
                // completely independent of this page-level login gate).
                await page.addInitScript(() => {
                    window.CozyOS = window.CozyOS || {};
                    let _auth;
                    Object.defineProperty(window.CozyOS, 'AuthCoordinator', {
                        configurable: true,
                        get() { return _auth; },
                        set(v) { try { v.isAuthenticated = () => true; } catch (_e) { /* ignore */ } _auth = v; }
                    });
                });
                await page.goto(serverURL('/dashboard.html'), { waitUntil: 'load' });
                await page.waitForSelector('#cozy-living-assistant-btn', { timeout: 15000 });
                await page.waitForFunction(() => window.CozyOS && window.CozyOS.LiveWindow && window.CozyOS.NextStepEngine && window.CozyOS.NextStepSuggestionsUI, { timeout: 15000 });
                await page.evaluate(() => window.CozyOS.LivingAssistant.open());
                await page.waitForSelector('.cozy-window[data-window-id="cozy-assistant"]');
                return page;
            }

            console.log('\nLive Next-Step Intelligence — real browser acceptance tests:\n');

            await test('a pure factual question renders NO suggestion region content', async () => {
                const page = await newPage();
                await askAndWaitForSuggestions(page, "What is Kenya's capital?", { expectNone: true });
                const hidden = await page.$eval('#cozy-next-step-suggestions-region', (el) => el.hidden || el.children.length === 0).catch(() => true);
                if (!hidden) throw new Error('expected no visible suggestions for a pure factual question');
                await page.close();
            });

            await test('an actionable QuarryOS request renders a real suggestion button with visible, accessible text', async () => {
                const page = await newPage();
                await askAndWaitForSuggestions(page, 'In QuarryOS, I want to register a new employee');
                const label = await page.$eval('.cozy-next-step-suggestion-btn', (el) => el.textContent.trim());
                const ariaLabel = await page.$eval('.cozy-next-step-suggestion-btn', (el) => el.getAttribute('aria-label'));
                if (!label) throw new Error('suggestion button has no visible text');
                if (ariaLabel !== label) throw new Error('suggestion button aria-label must match its visible text (never icon-only)');
                await page.close();
            });

            await test('REQUIRED TEST 5 — a destructive suggestion (Terminate Employee) shows a real confirm step and does NOT execute on the first tap', async () => {
                const page = await newPage();
                await askAndWaitForSuggestions(page, 'In QuarryOS, I want to terminate an employee');
                await clickReal(page, '.cozy-next-step-suggestion-btn');
                // A confirm prompt must appear — never an immediate action-result message.
                await page.waitForSelector('.cozy-next-step-confirm', { timeout: 5000 });
                const messagesBefore = await page.$eval('#cozy-living-assistant-messages', (el) => el.children.length);
                const confirmText = await page.$eval('.cozy-next-step-confirm p', (el) => el.textContent);
                if (!/cannot be undone/i.test(confirmText)) throw new Error('expected an honest destructive-confirmation message, got: ' + confirmText);
                // Cancel — must return to the suggestion list, still without executing.
                await clickReal(page, '.cozy-next-step-confirm button', 1); // [Yes, continue], [Cancel]
                await page.waitForSelector('#cozy-next-step-suggestions-region .cozy-next-step-suggestion-btn');
                const messagesAfter = await page.$eval('#cozy-living-assistant-messages', (el) => el.children.length);
                if (messagesAfter !== messagesBefore) throw new Error('cancelling the confirmation must not post any action-result message');
                await page.close();
            });

            await test('REQUIRED TEST 5b — confirming the destructive action actually executes it and reports a real, honest result', async () => {
                const page = await newPage();
                await askAndWaitForSuggestions(page, 'In QuarryOS, I want to terminate an employee');
                await clickReal(page, '.cozy-next-step-suggestion-btn');
                await page.waitForSelector('.cozy-next-step-confirm');
                await clickReal(page, '.cozy-next-step-confirm button', 0); // [Yes, continue]
                // With no real authContext role supplied by this page (no
                // NextStepAuthContextResolver registered), QuarryOS's own
                // real roleMatrix honestly denies this by default (see
                // cozy-next-step-suggestions-ui.js's own disclosed
                // authContext limitation) — the real, honest outcome here
                // is ACTION_FAILED with a real 403 reason, never a
                // fabricated success.
                await page.waitForFunction(() => {
                    const msgs = document.querySelectorAll('.cozy-living-assistant-msg-assistant');
                    return msgs.length && /didn.t work|security violation|lacks execution rights/i.test(msgs[msgs.length - 1].textContent);
                }, { timeout: 8000 });
                await page.waitForSelector('.cozy-next-step-suggestion-btn'); // Try Again / Choose Another Action
                await page.close();
            });

            await test('REQUIRED TEST 6 — switching Live Window context (assistant -> Worship) clears the old suggestions', async () => {
                const page = await newPage();
                await askAndWaitForSuggestions(page, 'In QuarryOS, I want to register a new employee');
                await page.evaluate(() => window.CozyOS.LiveWindow.activateMode('worship', { orgId: 'test-org' }));
                await page.waitForSelector('#cozy-live-window-mode-region:not([hidden])');
                await page.waitForFunction(() => {
                    const region = document.getElementById('cozy-next-step-suggestions-region');
                    return !region || region.hidden || region.children.length === 0;
                }, { timeout: 5000 });
                const stillOneWindow = await page.$$eval('.cozy-window[data-window-id="cozy-assistant"]', (els) => els.length);
                if (stillOneWindow !== 1) {
                    const diag = await page.evaluate(() => ({
                        allWindows: Array.from(document.querySelectorAll('.cozy-window')).map((w) => w.getAttribute('data-window-id')),
                        panelExists: !!document.getElementById('cozy-living-assistant-panel'),
                        bodyHTMLLen: document.body.innerHTML.length,
                        url: location.href
                    })).catch((e) => ({ evalError: e.message }));
                    throw new Error(`context switch must never create a second Live Window (found ${stillOneWindow}); diag=${JSON.stringify(diag)}`);
                }
                await page.close();
            });

            await test('REQUIRED TEST 7 — resizing the viewport never causes the suggestion region to overflow horizontally', async () => {
                const page = await newPage({ width: 1280, height: 800 });
                await askAndWaitForSuggestions(page, 'In QuarryOS, I want to register a new employee');
                await page.setViewportSize({ width: 360, height: 740 });
                await page.waitForTimeout(200);
                const overflow = await page.$eval('#cozy-next-step-suggestions-region', (el) => el.scrollWidth > el.clientWidth + 1);
                if (overflow) throw new Error('suggestion region overflows horizontally after resize to a narrow viewport');
                const stillVisible = await page.isVisible('.cozy-next-step-suggestion-btn');
                if (!stillVisible) throw new Error('suggestion button is no longer visible/reachable after resize');
                await page.close();
            });

            await test('REQUIRED TEST 8 — minimizing and restoring the Live Window preserves suggestion state', async () => {
                const page = await newPage();
                await askAndWaitForSuggestions(page, 'In QuarryOS, I want to register a new employee');
                const before = await page.$eval('.cozy-next-step-suggestion-btn', (el) => el.textContent);
                await page.evaluate(() => window.CozyOS.WindowManager.minimize('cozy-assistant'));
                await page.waitForTimeout(150);
                await page.evaluate(() => window.CozyOS.WindowManager.restore('cozy-assistant'));
                await page.waitForTimeout(150);
                const after = await page.$eval('.cozy-next-step-suggestion-btn', (el) => el.textContent);
                if (before !== after) throw new Error(`suggestion state was not preserved across minimize/restore: "${before}" -> "${after}"`);
                await page.close();
            });

            await test('REQUIRED TEST 9 — mobile viewport: tapping a suggestion never opens a second window/popup', async () => {
                const page = await newPage({ width: 390, height: 844 });
                await askAndWaitForSuggestions(page, 'In QuarryOS, I want to register a new employee');
                const popupPromise = page.waitForEvent('popup', { timeout: 1500 }).catch(() => null);
                await clickReal(page, '.cozy-next-step-suggestion-btn');
                const popup = await popupPromise;
                if (popup) throw new Error('tapping a suggestion opened a real browser popup — never allowed');
                await page.waitForTimeout(500);
                const windowCount = await page.$$eval('.cozy-window[data-window-id="cozy-assistant"]', (els) => els.length);
                if (windowCount !== 1) throw new Error(`expected exactly 1 Live Window on mobile after tapping a suggestion, got ${windowCount}`);
                await page.close();
            });

            await test('REQUIRED TEST 11 — a follow-up turn about the SAME application keeps suggestions correctly scoped', async () => {
                const page = await newPage();
                await askAndWaitForSuggestions(page, 'In QuarryOS, I want to register a new employee');
                const firstActionId = await page.$eval('.cozy-next-step-suggestion-btn', (el) => el.dataset.suggestionId);
                if (firstActionId !== 'quarry.register_employee') throw new Error('expected quarry.register_employee on the first turn, got ' + firstActionId);

                // A genuinely factual follow-up in between must honestly
                // drop back to no suggestions (never keep stale ones).
                await askAndWaitForSuggestions(page, "What is Kenya's capital?", { expectNone: true });

                // Asking about QuarryOS again resumes real, correctly
                // scoped suggestions — never a QuarryOS-then-forever-stuck
                // artifact, and never a ChurchOS leak.
                await askAndWaitForSuggestions(page, 'In QuarryOS, I want to register another employee');
                const secondActionId = await page.$eval('.cozy-next-step-suggestion-btn', (el) => el.dataset.suggestionId);
                if (!secondActionId.startsWith('quarry.')) throw new Error('expected a QuarryOS-scoped action on the follow-up turn, got ' + secondActionId);
                await page.close();
            });

            await test('no unexpected page errors were thrown during any of the above interactions', async () => {
                const flat = allPageErrors.flat().filter((msg) => !/firebasejs|gstatic\.com/i.test(msg));
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
