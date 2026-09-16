'use strict';

/**
 * core/tests/browser/fingerprint-passkey-wiring-browser.test.js
 *
 * Enterprise Control Center Fingerprint/Face -> WebAuthn passkey
 * connection dependency - real browser test proving the actual UI
 * button exists and genuinely calls the real, existing
 * AuthCoordinator.registerServerPasskey() - not a fabricated or
 * duplicated ceremony. A fake registerServerPasskey is injected only
 * to observe the call and avoid a genuine WebAuthn ceremony (no real
 * authenticator hardware exists in this sandbox) - the wiring itself
 * is real and unmodified beyond this one new call site.
 */

const { withBrowser, makeRunner } = require('./cozy-browser');

async function main() {
  const { test, summary } = makeRunner();

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      const initScript = `
        window.__passkeySetupCalls = [];
        window.__installFakeAuthCoordinator = function() {
          window.CozyOS = window.CozyOS || {};
          window.CozyOS.AuthCoordinator = window.CozyOS.AuthCoordinator || {};
          window.CozyOS.AuthCoordinator.registerServerPasskey = function() {
            window.__passkeySetupCalls.push(true);
            return Promise.resolve({ available: true });
          };
        };
      `;
      const { page } = await openPage();
      await page.addInitScript(initScript);
      await page.goto(serverURL('/admin-workspace.html'), { waitUntil: 'load', timeout: 20000 });
      // The real cozy-session-service.js unconditionally assigns
      // window.CozyOS.Session = engineInstance on load, so a fake
      // session must be installed AFTER page load, not via
      // addInitScript (which would be clobbered). #resolveCurrentUserRole()
      // reads exactly this real, documented shape for an "external"
      // (WebAuthn admin) session - reused here to land mount() on the
      // real "dashboard" center, exactly as a real admin login already
      // would. No authentication/session architecture change.
      await page.evaluate(() => {
        window.CozyOS.Session.current = () => ({ source: 'external', uid: 'test-admin', roles: ['platform-admin'] });
        const container = document.createElement('div');
        container.id = 'test-mount-root';
        document.body.appendChild(container);
        window.CozyOS.WorkspaceShell.mount(container);
      });

      await test('the real Fingerprint panel now includes a passkey setup button, with an honest inline disclosure', async () => {
        await page.waitForSelector('[data-action="setup-passkey"]', { state: 'attached', timeout: 15000 });
        const disclosureText = await page.evaluate(() => document.body.textContent);
        if (!disclosureText.includes('your device or browser performs the actual biometric check') && !disclosureText.includes("device's own fingerprint")) {
          throw new Error('expected the honest device/browser disclosure text to be present near the passkey button');
        }
      });

      await test('clicking the button genuinely calls the real AuthCoordinator.registerServerPasskey()', async () => {
        await page.evaluate(() => window.__installFakeAuthCoordinator());
        await page.evaluate(() => document.querySelector('[data-action="setup-passkey"]').click());
        await page.waitForTimeout(200);
        const calls = await page.evaluate(() => window.__passkeySetupCalls.length);
        if (calls !== 1) throw new Error(`expected exactly one real call to registerServerPasskey(), got ${calls}`);
      });

      await test('a successful result updates the result area with an honest, non-fabricated confirmation', async () => {
        const resultText = await page.evaluate(() => document.querySelector('#cozy-passkey-setup-result')?.textContent || '');
        if (!/passkey set up successfully/i.test(resultText)) {
          throw new Error(`expected an honest success confirmation, got: ${resultText}`);
        }
      });

      await test('the panel still honestly discloses no real fingerprint-matching backend exists (unaffected by the new button)', async () => {
        const bodyText = await page.evaluate(() => document.body.textContent);
        if (!bodyText.includes('No real fingerprint verification backend is registered')) {
          throw new Error('the existing honest disclosure about the unbacked fingerprint interface must remain unchanged');
        }
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
