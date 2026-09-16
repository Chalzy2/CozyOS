'use strict';

/**
 * core/tests/browser/admin-security-settings-grid-browser.test.js
 * Live Settings-grid dependency - real browser test.
 */

const { withBrowser, makeRunner } = require('./cozy-browser');

async function main() {
  const { test, summary } = makeRunner();

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      const APPS = [{ id: 'pharmacyos_core_001', name: 'PharmacyOS', category: 'Business Application', enabled: true }];

      async function loadMountedShell(page, viewport) {
        if (viewport) await page.setViewportSize(viewport);
        await page.goto(serverURL('/admin-workspace.html'), { waitUntil: 'load', timeout: 20000 });
        await page.evaluate((apps) => {
          window.CozyOS.Session.current = () => ({ source: 'external', uid: 'test-admin', roles: ['platform-admin'] });
          window.CozyOS.ServiceRegistry.listApplications = () => apps;
          if (window.CozyOS.IdentityEngine) window.CozyOS.IdentityEngine.canAccessApplication = () => true;
          const container = document.createElement('div');
          container.id = 'test-mount-root';
          document.body.appendChild(container);
          window.CozyOS.WorkspaceShell.mount(container);
          const navTrigger = document.createElement('div');
          navTrigger.setAttribute('data-center', 'security');
          container.appendChild(navTrigger);
          navTrigger.click();
        }, APPS);
      }

      await test('1/2. Settings grid renders with the intended card structure', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        const cardCount = await page.evaluate(() => document.querySelectorAll('.cozy-settings-card').length);
        if (cardCount !== 12) throw new Error(`expected 12 real cards, got ${cardCount}`);
        const hasParts = await page.evaluate(() => {
          const c = document.querySelector('.cozy-settings-card');
          return !!(c.querySelector('.cozy-settings-card-icon') && c.querySelector('.cozy-settings-card-title') && c.querySelector('.cozy-settings-card-desc'));
        });
        if (!hasParts) throw new Error('expected icon/title/description structure on cards');
        await page.close();
      });

      await test('3/4. Fingerprint card links to the real Dashboard destination (existing passkey button)', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        await page.evaluate(() => document.querySelector('[data-settings-action="goto-dashboard"]').click());
        const hasPasskeyBtn = await page.evaluate(() => !!document.querySelector('[data-action="setup-passkey"]'));
        if (!hasPasskeyBtn) throw new Error('expected the real Fingerprint card to open the Dashboard with the real passkey button');
        await page.close();
      });

      await test('4b. System Preferences card opens real content, not a blank page', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        await page.evaluate(() => document.querySelector('[data-settings-action="goto-configuration"]').click());
        const bodyLen = await page.evaluate(() => document.body.textContent.length);
        if (bodyLen < 100) throw new Error('expected real configuration content to render');
        await page.close();
      });

      await test('4c. Login History card calls the real AuthCoordinator.getLoginHistory()', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        await page.evaluate(() => {
          window.CozyOS.AuthCoordinator = window.CozyOS.AuthCoordinator || {};
          window.__loginHistoryCalled = false;
          window.CozyOS.AuthCoordinator.getLoginHistory = () => { window.__loginHistoryCalled = true; return { entries: [] }; };
        });
        await page.click('[data-settings-action="login-history"]');
        await page.waitForTimeout(150);
        const called = await page.evaluate(() => window.__loginHistoryCalled);
        if (!called) throw new Error('expected the real getLoginHistory() to be called');
        await page.close();
      });

      await test('5. Unimplemented cards (e.g. API Keys) never fake functionality', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        const isDisabled = await page.evaluate(() => {
          const cards = Array.from(document.querySelectorAll('.cozy-settings-card'));
          const apiKeys = cards.find((c) => c.textContent.includes('API Keys'));
          return apiKeys.classList.contains('cozy-settings-card-disabled') && apiKeys.getAttribute('data-settings-action') === '';
        });
        if (!isDisabled) throw new Error('expected API Keys card to be honestly disabled, no real action');
        await page.close();
      });

      await test('7/8/9. Sidebar collapse and mobile no-overflow remain intact', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        const before = await page.evaluate(() => document.querySelector('.cozy-sidebar').getBoundingClientRect().width);
        await page.click('#cozy-sidebar-toggle');
        const after = await page.evaluate(() => document.querySelector('.cozy-sidebar').getBoundingClientRect().width);
        if (!(after < before)) throw new Error('sidebar collapse regressed');
        await page.close();

        const { page: page2 } = await openPage();
        await loadMountedShell(page2, { width: 390, height: 844 });
        const overflow = await page2.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
        if (overflow) throw new Error('unexpected horizontal overflow on the settings grid at 390x844');
        await page2.close();
      });

      await test('10/11. Application Knowledge and Application Center remain intact', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        await page.evaluate(() => document.querySelector('[data-center="applications"]').click());
        const appCenterOk = await page.evaluate(() => document.body.textContent.includes('Purpose & Human Impact'));
        if (!appCenterOk) throw new Error('Application Center regressed');
        await page.evaluate(() => document.querySelector('[data-center="applicationKnowledge"]').click());
        const knowledgeOk = await page.evaluate(() => document.body.textContent.includes('Application Knowledge'));
        if (!knowledgeOk) throw new Error('Application Knowledge regressed');
        await page.close();
      });

      await test('12. Existing Fingerprint/passkey panel on the Dashboard remains intact', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        const hasFingerprintPanel = await page.evaluate(() => {
          const trigger = document.createElement('div');
          trigger.setAttribute('data-center', 'dashboard');
          document.getElementById('test-mount-root').appendChild(trigger);
          trigger.click();
          return document.body.textContent.includes('Fingerprint Verification');
        });
        if (!hasFingerprintPanel) throw new Error('existing Fingerprint panel regressed');
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
