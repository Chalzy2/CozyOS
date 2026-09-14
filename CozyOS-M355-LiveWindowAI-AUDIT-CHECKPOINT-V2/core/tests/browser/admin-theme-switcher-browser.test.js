'use strict';

/**
 * core/tests/browser/admin-theme-switcher-browser.test.js
 * Theme switcher dependency - real browser test.
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
        }, APPS);
      }

      await test('1. Theme control renders with 4 accessible swatches', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        const count = await page.evaluate(() => document.querySelectorAll('.cozy-theme-swatch').length);
        if (count !== 4) throw new Error(`expected 4 theme swatches, got ${count}`);
        await page.close();
      });

      for (const theme of ['dark', 'green', 'blue', 'red']) {
        await test(`2-5. "${theme}" theme applies real, live CSS`, async () => {
          const { page } = await openPage();
          await loadMountedShell(page);
          await page.evaluate((t) => document.querySelector(`[data-theme="${t}"]`).click(), theme);
          const attr = await page.evaluate(() => document.documentElement.getAttribute('data-cozy-theme'));
          if (attr !== theme) throw new Error(`expected data-cozy-theme="${theme}", got: ${attr}`);
          const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--cozy-brand-primary').trim());
          if (!accent) throw new Error('expected a real computed --cozy-brand-primary value');
          await page.close();
        });
      }

      await test('6. Switching updates the real UI (active swatch class moves)', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        await page.evaluate(() => document.querySelector('[data-theme="blue"]').click());
        const activeIsBlue = await page.evaluate(() => document.querySelector('[data-theme="blue"]').classList.contains('active'));
        const darkStillActive = await page.evaluate(() => document.querySelector('[data-theme="dark"]').classList.contains('active'));
        if (!activeIsBlue || darkStillActive) throw new Error('expected the active theme swatch state to update correctly');
        await page.close();
      });

      await test('7. Selected theme persists via localStorage across a real re-mount', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        await page.evaluate(() => document.querySelector('[data-theme="red"]').click());
        await page.evaluate(() => {
          const container2 = document.createElement('div');
          container2.id = 'test-mount-root-2';
          document.body.appendChild(container2);
          window.CozyOS.WorkspaceShell.mount(container2);
        });
        const persisted = await page.evaluate(() => document.querySelector('#test-mount-root-2 [data-theme="red"]').classList.contains('active'));
        if (!persisted) throw new Error('expected the theme to persist across a real remount via localStorage');
        await page.close();
      });

      await test('8. Sidebar collapse remains correct with a non-default theme active', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        await page.evaluate(() => document.querySelector('[data-theme="green"]').click());
        const before = await page.evaluate(() => document.querySelector('.cozy-sidebar').getBoundingClientRect().width);
        await page.click('#cozy-sidebar-toggle');
        const after = await page.evaluate(() => document.querySelector('.cozy-sidebar').getBoundingClientRect().width);
        if (!(after < before)) throw new Error('sidebar collapse regressed under a non-default theme');
        await page.close();
      });

      await test('9. Mobile 390x844 remains correct with a non-default theme active', async () => {
        const { page } = await openPage();
        await loadMountedShell(page, { width: 390, height: 844 });
        await page.evaluate(() => document.querySelector('[data-theme="blue"]').click());
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
        if (overflow) throw new Error('unexpected horizontal overflow at 390x844 with a non-default theme');
        await page.close();
      });

      await test('10. Existing search/header/account/settings/application navigation all remain intact', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        await page.evaluate(() => document.querySelector('[data-theme="green"]').click());
        const hasSearch = await page.evaluate(() => !!document.getElementById('cozy-header-search-input'));
        const hasAccount = await page.evaluate(() => !!document.getElementById('cozy-account-logout-btn'));
        await page.evaluate(() => {
          const t = document.createElement('div'); t.setAttribute('data-center', 'security');
          document.getElementById('test-mount-root').appendChild(t); t.click();
        });
        const hasSettings = await page.evaluate(() => document.querySelectorAll('.cozy-settings-card').length === 12);
        await page.evaluate(() => document.querySelector('[data-nav-section="Applications"]').click());
        const hasAppNav = await page.evaluate(() => !!document.querySelector('[data-app-id="pharmacyos_core_001"]'));
        if (!hasSearch || !hasAccount || !hasSettings || !hasAppNav) throw new Error('an existing dependency regressed under a non-default theme');
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
