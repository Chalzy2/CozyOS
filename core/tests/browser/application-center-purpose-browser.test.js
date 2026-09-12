'use strict';

/**
 * core/tests/browser/application-center-purpose-browser.test.js
 *
 * Application Center "Purpose & Human Impact" dependency - real browser
 * test proving the actual UI path.
 */

const { withBrowser, makeRunner } = require('./cozy-browser');

async function main() {
  const { test, summary } = makeRunner();

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      async function loadMountedShell(page, fakeApps) {
        await page.goto(serverURL('/admin-workspace.html'), { waitUntil: 'load', timeout: 20000 });
        await page.evaluate((apps) => {
          window.CozyOS.Session.current = () => ({ source: 'external', uid: 'test-admin', roles: ['platform-admin'] });
          window.CozyOS.ServiceRegistry.listApplications = () => apps;
          // getApplicationCenterData() further filters through
          // IdentityEngine.canAccessApplication(userId, appId) when
          // available - a real, separate per-app access grant, distinct
          // from the admin role itself. Faked here (test-harness only,
          // same convention as the Session/ServiceRegistry fakes above)
          // so the fake test-admin user can see the fake apps; this is
          // not a change to the real authorization architecture.
          if (window.CozyOS.IdentityEngine) {
            window.CozyOS.IdentityEngine.canAccessApplication = () => true;
          }
          const container = document.createElement('div');
          container.id = 'test-mount-root';
          document.body.appendChild(container);
          window.CozyOS.WorkspaceShell.mount(container);
        }, fakeApps);
        await page.evaluate(() => {
          const navTrigger = document.createElement('div');
          navTrigger.setAttribute('data-center', 'applications');
          document.getElementById('test-mount-root').appendChild(navTrigger);
          navTrigger.click();
        });
      }

      const CHURCH_APP = { id: 'churchos_core_001', name: 'ChurchOS', version: '1.0.0', category: 'business-application', icon: null, enabled: true, hasLauncher: false, status: 'Active', connectedModules: null, deploymentStatus: 'Live', sourcePath: null };
      const UNKNOWN_APP = { id: 'unknown_app_001', name: 'TotallyUnknownApp', version: '1.0.0', category: 'business-application', icon: null, enabled: true, hasLauncher: false, status: 'Active', connectedModules: null, deploymentStatus: 'Live', sourcePath: null };

      await test('1/2. "Purpose & Human Impact" toggle appears and, when opened, shows the real ChurchOS human-purpose fact (same source Cozy AI reads)', async () => {
        const { page } = await openPage();
        await loadMountedShell(page, [CHURCH_APP]);
        await page.evaluate(() => document.querySelector('[data-app-purpose-toggle]').click());
        const bodyText = await page.evaluate(() => document.body.textContent);
        if (!bodyText.includes('ChurchOS matters because') && !bodyText.includes('digital foundation')) {
          throw new Error('expected the real ChurchOS human-purpose text to be displayed');
        }
        await page.close();
      });

      await test('3. VERIFIED capabilities and VISION capabilities are both shown, in clearly separate, labeled blocks', async () => {
        const { page } = await openPage();
        await loadMountedShell(page, [CHURCH_APP]);
        await page.evaluate(() => document.querySelector('[data-app-purpose-toggle]').click());
        const bodyText = await page.evaluate(() => document.body.textContent);
        if (!bodyText.includes('CURRENTLY VERIFIED')) throw new Error('expected a CURRENTLY VERIFIED block');
        if (!bodyText.includes('VISION / DESTINATION')) throw new Error('expected a VISION / DESTINATION block');
        const verifiedIdx = bodyText.indexOf('CURRENTLY VERIFIED');
        const visionIdx = bodyText.indexOf('VISION / DESTINATION');
        if (!(verifiedIdx < visionIdx)) throw new Error('CURRENTLY VERIFIED must appear before VISION / DESTINATION');
        await page.close();
      });

      await test('4. An application with no registered human-purpose data shows the honest empty state, never an invented description', async () => {
        const { page } = await openPage();
        await loadMountedShell(page, [UNKNOWN_APP]);
        await page.evaluate(() => document.querySelector('[data-app-purpose-toggle]').click());
        const bodyText = await page.evaluate(() => document.body.textContent);
        if (!bodyText.includes('No human-purpose information is registered for "TotallyUnknownApp"')) {
          throw new Error('expected the honest empty-state disclosure naming the real application');
        }
        await page.close();
      });

      await test('5. Existing Application Center expansion/collapse (the sibling Manage toggle) still works unaffected', async () => {
        const { page } = await openPage();
        await loadMountedShell(page, [CHURCH_APP]);
        const before = await page.evaluate(() => document.body.textContent.includes('platform-wide (real, via IdentityEngine.setApplicationEnabled)'));
        if (before) throw new Error('Manage panel should start collapsed');
        const manageBtnExists = await page.evaluate(() => !!document.querySelector('[data-app-manage-toggle]'));
        if (manageBtnExists) {
          await page.evaluate(() => document.querySelector('[data-app-manage-toggle]').click());
          const afterManage = await page.evaluate(() => document.body.textContent.includes('platform-wide (real, via IdentityEngine.setApplicationEnabled)'));
          if (!afterManage) throw new Error('existing Manage panel must still expand correctly');
        }
        await page.close();
      });

      await test('6. Toggling Purpose & Human Impact produces no authorization side effect - enabled state is unaffected', async () => {
        const { page } = await openPage();
        await loadMountedShell(page, [CHURCH_APP]);
        const enabledBefore = await page.evaluate(() => window.CozyOS.IdentityEngine && typeof window.CozyOS.IdentityEngine.isApplicationEnabled === 'function' ? window.CozyOS.IdentityEngine.isApplicationEnabled('churchos_core_001') : true);
        await page.evaluate(() => document.querySelector('[data-app-purpose-toggle]').click());
        const enabledAfter = await page.evaluate(() => window.CozyOS.IdentityEngine && typeof window.CozyOS.IdentityEngine.isApplicationEnabled === 'function' ? window.CozyOS.IdentityEngine.isApplicationEnabled('churchos_core_001') : true);
        if (enabledBefore !== enabledAfter) throw new Error('viewing purpose information must never change application enabled state');
        await page.close();
      });

      await test('7. No credential/secret/security-sensitive field is ever rendered in the purpose panel', async () => {
        const { page } = await openPage();
        await loadMountedShell(page, [CHURCH_APP]);
        await page.evaluate(() => document.querySelector('[data-app-purpose-toggle]').click());
        // Scoped to the purpose panel itself, not the whole page - the
        // page elsewhere legitimately mentions unrelated settings labels
        // like "Password Policy" (a real, pre-existing, harmless nav
        // card, not part of this dependency).
        const panelText = await page.evaluate(() => document.querySelector('.cozy-app-purpose-panel')?.textContent || '');
        if (/password|api[_-]?key|secret|token|credential/i.test(panelText)) {
          throw new Error('purpose panel must never render anything credential/secret-shaped');
        }
        await page.close();
      });

      await test('no NEW page errors are introduced by the Purpose & Human Impact interaction (pre-existing, unrelated Firebase/PluginManager load errors excluded)', async () => {
        const { page } = await openPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await loadMountedShell(page, [CHURCH_APP]);
        const errorsBeforeToggle = errors.length;
        await page.evaluate(() => document.querySelector('[data-app-purpose-toggle]').click());
        await page.waitForTimeout(100);
        if (errors.length > errorsBeforeToggle) {
          throw new Error('real page errors introduced by the toggle itself: ' + errors.slice(errorsBeforeToggle).join(' | '));
        }
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
