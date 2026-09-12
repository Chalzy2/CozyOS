'use strict';

/**
 * core/tests/browser/admin-header-identity-browser.test.js
 * Live Admin Header dependency - real browser test.
 */

const { withBrowser, makeRunner } = require('./cozy-browser');

async function main() {
  const { test, summary } = makeRunner();

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      const APPS = [{ id: 'pharmacyos_core_001', name: 'PharmacyOS', category: 'Business Application', enabled: true }];

      async function loadMountedShell(page, { viewport, withRealUser = true, notificationCount = 0 } = {}) {
        if (viewport) await page.setViewportSize(viewport);
        await page.goto(serverURL('/admin-workspace.html'), { waitUntil: 'load', timeout: 20000 });
        await page.evaluate(({ apps, withRealUser, notificationCount }) => {
          window.CozyOS.Session.current = () => ({ source: 'external', uid: 'test-admin', roles: ['platform-admin'] });
          window.CozyOS.ServiceRegistry.listApplications = () => apps;
          if (window.CozyOS.IdentityEngine) {
            window.CozyOS.IdentityEngine.canAccessApplication = () => true;
            window.CozyOS.IdentityEngine.getUser = withRealUser ? () => ({ userId: 'test-admin', username: 'grace.wanjiru', roles: ['admin'] }) : () => null;
          }
          window.CozyOS.WorkspaceShell.getNotificationFeed = () => new Array(notificationCount).fill({});
          const container = document.createElement('div');
          container.id = 'test-mount-root';
          document.body.appendChild(container);
          window.CozyOS.WorkspaceShell.mount(container);
        }, { apps: APPS, withRealUser, notificationCount });
      }

      await test('1/2/3. Real authenticated username renders, no fake identity used', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        const name = await page.evaluate(() => document.querySelector('.cozy-account-name').textContent);
        if (name !== 'grace.wanjiru') throw new Error(`expected the real username, got: ${name}`);
        if (name.includes('Super Administrator')) throw new Error('fake identity must never appear');
        await page.close();
      });

      await test('4. Missing real user record fails honestly to the generic label, never a fabricated name', async () => {
        const { page } = await openPage();
        await loadMountedShell(page, { withRealUser: false });
        const name = await page.evaluate(() => document.querySelector('.cozy-account-name').textContent);
        if (name !== 'Administrator') throw new Error(`expected the honest fallback label, got: ${name}`);
        await page.close();
      });

      await test('5/6. Logout button calls the real AuthCoordinator.logout()', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        await page.evaluate(() => {
          window.CozyOS.AuthCoordinator = window.CozyOS.AuthCoordinator || {};
          window.__logoutCalled = false;
          window.CozyOS.AuthCoordinator.logout = () => { window.__logoutCalled = true; };
        });
        await page.evaluate(() => document.getElementById('cozy-account-logout-btn').click());
        const called = await page.evaluate(() => window.__logoutCalled);
        if (!called) throw new Error('expected the real logout() to be called');
        await page.close();
      });

      await test('7/8. Notification badge reflects the real feed count only, never fabricated', async () => {
        const { page } = await openPage();
        await loadMountedShell(page, { notificationCount: 3 });
        const badge = await page.evaluate(() => document.querySelector('.cozy-notification-badge')?.textContent);
        if (badge !== '3') throw new Error(`expected the real count "3", got: ${badge}`);
        await page.close();

        const { page: page2 } = await openPage();
        await loadMountedShell(page2, { notificationCount: 0 });
        const noBadge = await page2.evaluate(() => !document.querySelector('.cozy-notification-badge'));
        if (!noBadge) throw new Error('expected no badge when the real count is zero - never a fabricated number');
        await page2.close();
      });

      await test('9. Header/account area remains usable in collapsed sidebar mode', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        await page.click('#cozy-sidebar-toggle');
        const avatarVisible = await page.evaluate(() => {
          const el = document.querySelector('.cozy-account-avatar');
          return el && getComputedStyle(el).display !== 'none';
        });
        if (!avatarVisible) throw new Error('expected the avatar to remain visible when collapsed');
        await page.close();
      });

      await test('10. Header remains usable at 390x844 with no horizontal overflow', async () => {
        const { page } = await openPage();
        await loadMountedShell(page, { viewport: { width: 390, height: 844 } });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
        if (overflow) throw new Error('unexpected horizontal overflow with the account header at 390x844');
        await page.close();
      });

      await test('11. Existing Settings Grid remains intact', async () => {
        const { page } = await openPage();
        await loadMountedShell(page);
        await page.evaluate(() => {
          const t = document.createElement('div'); t.setAttribute('data-center', 'security');
          document.getElementById('test-mount-root').appendChild(t); t.click();
        });
        const count = await page.evaluate(() => document.querySelectorAll('.cozy-settings-card').length);
        if (count !== 12) throw new Error('Settings Grid regressed');
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
