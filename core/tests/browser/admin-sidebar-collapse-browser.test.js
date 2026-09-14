'use strict';

/**
 * core/tests/browser/admin-sidebar-collapse-browser.test.js
 * Master sidebar collapse/mobile-drawer dependency - real browser test.
 *
 * UPDATED (dashboard nav grouping UX pass): the mocked PharmacyOS app
 * (category: "Business Application") now renders under the real,
 * existing accordion's new "Application Center" section label instead
 * of the old flat "Applications" label - a small, additive grouping
 * change in core/shell/cozy-workspace.js's NAV_SECTIONS construction,
 * splitting the SAME dynamic app list by each app's own already-real
 * `category` field. No route, permission, or app data changed - only
 * which section label this test's selector targets.
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

      await test('1/2. Sidebar renders and the collapse control is visible', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        const toggleVisible = await page.evaluate(() => !!document.getElementById('cozy-sidebar-toggle'));
        if (!toggleVisible) throw new Error('expected the real sidebar collapse control');
        await page.close();
      });

      await test('3/4/5. Clicking Collapse Menu genuinely narrows the sidebar and hides labels', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        const before = await page.evaluate(() => document.querySelector('.cozy-sidebar').getBoundingClientRect().width);
        await page.click('#cozy-sidebar-toggle');
        const after = await page.evaluate(() => document.querySelector('.cozy-sidebar').getBoundingClientRect().width);
        if (!(after < before)) throw new Error(`expected sidebar to genuinely narrow, before=${before} after=${after}`);
        const labelVisible = await page.evaluate(() => {
          const label = document.querySelector('.cozy-nav-link-label');
          return label ? getComputedStyle(label).display !== 'none' : true;
        });
        if (labelVisible) throw new Error('expected labels to be hidden in the collapsed state');
        await page.close();
      });

      await test('6. Clicking Collapse Menu again restores the expanded state', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        await page.click('#cozy-sidebar-toggle');
        const collapsedWidth = await page.evaluate(() => document.querySelector('.cozy-sidebar').getBoundingClientRect().width);
        await page.click('#cozy-sidebar-toggle');
        const expandedWidth = await page.evaluate(() => document.querySelector('.cozy-sidebar').getBoundingClientRect().width);
        if (!(expandedWidth > collapsedWidth)) throw new Error('expected the sidebar to genuinely re-expand');
        await page.close();
      });

      await test('7. Existing Level-1 accordion still works after collapse/expand', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        await page.click('#cozy-sidebar-toggle');
        await page.click('#cozy-sidebar-toggle');
        await page.evaluate(() => document.querySelector('[data-nav-section="Application Center"]').click());
        const open = await page.evaluate(() => !!document.querySelector('.cozy-nav-section.open'));
        if (!open) throw new Error('expected the Level-1 accordion to still open correctly');
        await page.close();
      });

      await test('8/9. Dynamic Applications links still render and still open the real application-health view', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        await page.evaluate(() => document.querySelector('[data-nav-section="Application Center"]').click());
        const linkExists = await page.evaluate(() => !!document.querySelector('[data-app-id="pharmacyos_core_001"]'));
        if (!linkExists) throw new Error('expected the real dynamic PharmacyOS link');
        await page.evaluate(() => document.querySelector('[data-app-id="pharmacyos_core_001"]').click());
        const opened = await page.evaluate(() => document.body.textContent.includes('PharmacyOS'));
        if (!opened) throw new Error('expected the real application-health view to open');
        await page.close();
      });

      await test('10. No horizontal overflow after collapsing', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        await page.click('#cozy-sidebar-toggle');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
        if (overflow) throw new Error('unexpected horizontal overflow after collapsing');
        await page.close();
      });

      await test('11. 390x844 mobile: sidebar starts off-canvas, mobile menu button opens it as an overlay, no horizontal overflow', async () => {
        const { page } = await openPage();
        await loadMountedShell(page, { width: 390, height: 844 });
        const offCanvasInitially = await page.evaluate(() => {
          const rect = document.querySelector('.cozy-sidebar').getBoundingClientRect();
          return rect.right <= 0;
        });
        if (!offCanvasInitially) throw new Error('expected the sidebar to start off-canvas on a small phone viewport');
        await page.click('#cozy-mobile-menu-btn');
        const visibleAfterOpen = await page.evaluate(() => {
          const rect = document.querySelector('.cozy-sidebar').getBoundingClientRect();
          return rect.left >= 0 && rect.width > 0;
        });
        if (!visibleAfterOpen) throw new Error('expected the mobile drawer to become visible after opening');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
        if (overflow) throw new Error('unexpected horizontal overflow with the mobile drawer open');
        await page.evaluate(() => document.querySelector('.cozy-mobile-overlay').click());
        const closedAfterOverlayClick = await page.evaluate(() => document.querySelector('.cozy-sidebar').getBoundingClientRect().right <= 0);
        if (!closedAfterOverlayClick) throw new Error('expected tapping the overlay to close the mobile drawer');
        await page.close();
      });

      await test('12. No duplicate sidebar/navigation element exists', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        const count = await page.evaluate(() => document.querySelectorAll('.cozy-sidebar').length);
        if (count !== 1) throw new Error(`expected exactly one sidebar element, found ${count}`);
        await page.close();
      });

      await test('Accessibility: collapse control has an accessible name', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        const label = await page.evaluate(() => document.getElementById('cozy-sidebar-toggle').getAttribute('aria-label'));
        if (!label) throw new Error('expected an accessible name on the collapse control');
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
