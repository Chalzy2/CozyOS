'use strict';

/**
 * core/tests/browser/admin-header-search-browser.test.js
 * Live Header Search dependency - real browser test.
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

      await test('1/2. Header search renders with an accessible name', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        const label = await page.evaluate(() => document.getElementById('cozy-header-search-input')?.getAttribute('aria-label'));
        if (!label) throw new Error('expected an accessible name on the header search input');
        await page.close();
      });

      await test('3/4/5. Entering a real application term calls the real WorkspaceShell.search() and reaches the real destination', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        await page.evaluate(() => {
          window.__searchCalledWith = null;
          const original = window.CozyOS.WorkspaceShell.search.bind(window.CozyOS.WorkspaceShell);
          window.CozyOS.WorkspaceShell.search = (term) => { window.__searchCalledWith = term; return original(term); };
        });
        await page.fill('#cozy-header-search-input', 'PharmacyOS');
        await page.evaluate(() => document.getElementById('cozy-header-search-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })));
        const calledWith = await page.evaluate(() => window.__searchCalledWith);
        if (calledWith !== 'PharmacyOS') throw new Error(`expected the real search() to be called with "PharmacyOS", got: ${calledWith}`);
        const resultVisible = await page.evaluate(() => !!document.getElementById('cozy-global-search-field'));
        if (!resultVisible) throw new Error('expected navigation to the real existing search destination');
        await page.close();
      });

      await test('6. Existing #renderSearch() destination remains functional directly', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        await page.evaluate(() => {
          const t = document.createElement('div'); t.setAttribute('data-center', 'search');
          document.getElementById('test-mount-root').appendChild(t); t.click();
        });
        const hasSearchBox = await page.evaluate(() => !!document.getElementById('cozy-global-search-field'));
        if (!hasSearchBox) throw new Error('existing Enterprise Search destination regressed');
        await page.close();
      });

      await test('7. Empty search does not produce fake results / does not navigate', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        await page.fill('#cozy-header-search-input', '   ');
        await page.evaluate(() => document.getElementById('cozy-header-search-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })));
        const navigatedToSearch = await page.evaluate(() => !!document.getElementById('cozy-global-search-field'));
        if (navigatedToSearch) throw new Error('empty/whitespace search must not trigger navigation or fake results');
        await page.close();
      });

      await test('8. Collapsed sidebar does not break search', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        await page.click('#cozy-sidebar-toggle');
        const inputExists = await page.evaluate(() => !!document.getElementById('cozy-header-search-input'));
        if (!inputExists) throw new Error('expected the search input to still exist when collapsed');
        await page.evaluate(() => { document.getElementById('cozy-header-search-input').value = 'PharmacyOS'; });
        await page.evaluate(() => document.getElementById('cozy-header-search-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })));
        const worked = await page.evaluate(() => !!document.getElementById('cozy-global-search-field'));
        if (!worked) throw new Error('search must still function when the sidebar is collapsed');
        await page.close();
      });

      await test('9/10. 390x844 mobile search works, no horizontal overflow', async () => {
        const { page } = await openPage();
        await loadMountedShell(page, { width: 390, height: 844 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
        if (overflow) throw new Error('unexpected horizontal overflow with header search at 390x844');
        await page.fill('#cozy-header-search-input', 'PharmacyOS');
        await page.evaluate(() => document.getElementById('cozy-header-search-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })));
        const worked = await page.evaluate(() => !!document.getElementById('cozy-global-search-field'));
        if (!worked) throw new Error('search must work at 390x844');
        await page.close();
      });

      await test('11. Existing account/logout block remains intact', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        const hasAccount = await page.evaluate(() => !!document.getElementById('cozy-account-logout-btn'));
        if (!hasAccount) throw new Error('account/logout block regressed');
        await page.close();
      });

      await test('12. Existing Applications navigation remains intact', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        await page.evaluate(() => document.querySelector('[data-nav-section="Applications"]').click());
        const link = await page.evaluate(() => !!document.querySelector('[data-app-id="pharmacyos_core_001"]'));
        if (!link) throw new Error('Applications navigation regressed');
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
