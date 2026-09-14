'use strict';

/**
 * core/tests/browser/application-knowledge-page-browser.test.js
 *
 * Application Knowledge admin page dependency - real browser test.
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
          if (window.CozyOS.IdentityEngine) {
            window.CozyOS.IdentityEngine.canAccessApplication = () => true;
          }
          const container = document.createElement('div');
          container.id = 'test-mount-root';
          document.body.appendChild(container);
          window.CozyOS.WorkspaceShell.mount(container);
        }, fakeApps);
      }

      const CHURCH_APP = { id: 'churchos_core_001', name: 'ChurchOS', version: '1.0.0', category: 'business-application', icon: null, enabled: true, hasLauncher: false, status: 'Active', connectedModules: null, deploymentStatus: 'Live', sourcePath: null };
      const UNKNOWN_APP = { id: 'unknown_app_001', name: 'TotallyUnknownApp', version: '1.0.0', category: 'business-application', icon: null, enabled: true, hasLauncher: false, status: 'Active', connectedModules: null, deploymentStatus: 'Live', sourcePath: null };

      await test('2. Permission filtering: a non-admin/non-developer role without explicit "applicationKnowledge:view" does NOT see the new item (inherited fail-closed behavior, unchanged)', async () => {
        const { page } = await openPage();
        await page.goto(serverURL('/admin-workspace.html'), { waitUntil: 'load', timeout: 20000 });
        await page.evaluate((apps) => {
          // A real, resolvable but non-admin/non-developer role, and no
          // IdentityEngine permission grants at all - exercises the
          // exact same existing fail-closed per-item filter every other
          // nav item already goes through, unmodified by this dependency.
          window.CozyOS.Session.current = () => ({ source: 'external', uid: 'test-employee', roles: ['employee'] });
          window.CozyOS.ServiceRegistry.listApplications = () => apps;
          const container = document.createElement('div');
          container.id = 'test-mount-root';
          document.body.appendChild(container);
          window.CozyOS.WorkspaceShell.mount(container);
        }, [CHURCH_APP]);
        const link = await page.evaluate(() => !!document.querySelector('[data-center="applicationKnowledge"]'));
        if (link) throw new Error('a role with no explicit "applicationKnowledge:view" grant must not see this item, exactly like every other gated item');
        await page.close();
      });

      await test('1. Menu item registration: "Application Knowledge" appears as a real nav link in the Overview section', async () => {
        const { page } = await openPage();
        await loadMountedShell(page, [CHURCH_APP]);
        const link = await page.evaluate(() => !!document.querySelector('[data-center="applicationKnowledge"]'));
        if (!link) throw new Error('expected a real [data-center="applicationKnowledge"] nav link to be registered');
        await page.close();
      });

      await test('3. Navigation to applicationKnowledge renders the real page content (not a placeholder/blank)', async () => {
        const { page } = await openPage();
        await loadMountedShell(page, [CHURCH_APP]);
        await page.evaluate(() => document.querySelector('[data-center="applicationKnowledge"]').click());
        const bodyText = await page.evaluate(() => document.body.textContent);
        if (!bodyText.includes('Application Knowledge')) throw new Error('expected the real Application Knowledge heading');
        await page.close();
      });

      await test('5/6. All registered applications are represented, with correct real human-purpose data for ChurchOS', async () => {
        const { page } = await openPage();
        await loadMountedShell(page, [CHURCH_APP]);
        await page.evaluate(() => document.querySelector('[data-center="applicationKnowledge"]').click());
        const bodyText = await page.evaluate(() => document.body.textContent);
        if (!bodyText.includes('ChurchOS')) throw new Error('expected ChurchOS to be represented');
        if (!bodyText.includes('digital foundation')) throw new Error('expected the real ChurchOS human-purpose text');
        await page.close();
      });

      await test('7. VERIFIED vs VISION separation is preserved on this page, in the correct order', async () => {
        const { page } = await openPage();
        await loadMountedShell(page, [CHURCH_APP]);
        await page.evaluate(() => document.querySelector('[data-center="applicationKnowledge"]').click());
        const bodyText = await page.evaluate(() => document.body.textContent);
        const verifiedIdx = bodyText.indexOf('CURRENTLY VERIFIED');
        const visionIdx = bodyText.indexOf('VISION / DESTINATION');
        if (verifiedIdx === -1 || visionIdx === -1) throw new Error('expected both CURRENTLY VERIFIED and VISION / DESTINATION sections');
        if (!(verifiedIdx < visionIdx)) throw new Error('CURRENTLY VERIFIED must appear before VISION / DESTINATION');
        await page.close();
      });

      await test('8. An application with no registered human-purpose data shows the honest empty state, never an invented description', async () => {
        const { page } = await openPage();
        await loadMountedShell(page, [UNKNOWN_APP]);
        await page.evaluate(() => document.querySelector('[data-center="applicationKnowledge"]').click());
        const bodyText = await page.evaluate(() => document.body.textContent);
        if (!bodyText.includes('No human-purpose information is registered for "TotallyUnknownApp"')) {
          throw new Error('expected the honest empty-state disclosure naming the real application');
        }
        await page.close();
      });

      await test('9. No authorization side effect occurs merely from viewing the Application Knowledge page', async () => {
        const { page } = await openPage();
        await loadMountedShell(page, [CHURCH_APP]);
        const enabledBefore = await page.evaluate(() => window.CozyOS.IdentityEngine && typeof window.CozyOS.IdentityEngine.isApplicationEnabled === 'function' ? window.CozyOS.IdentityEngine.isApplicationEnabled('churchos_core_001') : true);
        await page.evaluate(() => document.querySelector('[data-center="applicationKnowledge"]').click());
        const enabledAfter = await page.evaluate(() => window.CozyOS.IdentityEngine && typeof window.CozyOS.IdentityEngine.isApplicationEnabled === 'function' ? window.CozyOS.IdentityEngine.isApplicationEnabled('churchos_core_001') : true);
        if (enabledBefore !== enabledAfter) throw new Error('viewing Application Knowledge must never change application enabled state');
        await page.close();
      });

      await test('10. Existing master-menu accordion behavior remains intact: Dashboard, Application Center, and Application Knowledge all coexist', async () => {
        const { page } = await openPage();
        await loadMountedShell(page, [CHURCH_APP]);
        const hasApplications = await page.evaluate(() => !!document.querySelector('[data-center="applications"]'));
        const hasDashboard = await page.evaluate(() => !!document.querySelector('[data-center="dashboard"]'));
        const hasKnowledge = await page.evaluate(() => !!document.querySelector('[data-center="applicationKnowledge"]'));
        if (!hasApplications || !hasDashboard || !hasKnowledge) throw new Error('expected Dashboard, Application Center, and Application Knowledge to all coexist in the Overview section');
        await page.close();
      });

      await test('Existing Application Center still works unaffected (regression)', async () => {
        const { page } = await openPage();
        await loadMountedShell(page, [CHURCH_APP]);
        await page.evaluate(() => document.querySelector('[data-center="applications"]').click());
        const bodyText = await page.evaluate(() => document.body.textContent);
        if (!bodyText.includes('Purpose & Human Impact')) throw new Error('existing Application Center Purpose & Human Impact section must remain intact');
        await page.close();
      });

      await test('no page errors are introduced by navigating to or rendering Application Knowledge', async () => {
        const { page } = await openPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await loadMountedShell(page, [CHURCH_APP]);
        const errorsBeforeNav = errors.length;
        await page.evaluate(() => document.querySelector('[data-center="applicationKnowledge"]').click());
        await page.waitForTimeout(100);
        if (errors.length > errorsBeforeNav) throw new Error('real page errors introduced: ' + errors.slice(errorsBeforeNav).join(' | '));
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
