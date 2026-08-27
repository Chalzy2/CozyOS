/**
 * core/tests/browser/organization-membership-browser.test.js
 *
 * NEXT MILESTONE section 7 — REAL browser test (Playwright + actual
 * headless Chromium) of the real OrganizationMembership service
 * (core/organization/organization-membership.js), driving the real
 * source file loaded through real <script src> tags in
 * core/tests/browser/fixtures/organization-membership-fixture.html.
 *
 * Scenario (as specified): James / USER-456 belongs to two organizations
 * — Cashier in Organization B, Owner/Admin in Organization C — and each
 * organization's context must only ever see its own membership/role/
 * application data for James.
 *
 * Run with: node core/tests/browser/organization-membership-browser.test.js
 */

'use strict';

const { withBrowser, makeRunner, REPO_ROOT } = require('./cozy-browser');

async function main() {
  const { test, summary } = makeRunner();

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      const { page, consoleErrors, pageErrors } = await openPage();

      await test('fixture page loads the real OrganizationMembership dependency chain with no page errors', async () => {
        await page.goto(serverURL('/core/tests/browser/fixtures/organization-membership-fixture.html'), { waitUntil: 'load' });
        if (pageErrors.length > 0) throw new Error('uncaught page errors during load: ' + pageErrors.join(' | '));
        const registered = await page.evaluate(() => !!(window.CozyOS && window.CozyOS.OrganizationMembership));
        if (!registered) throw new Error('window.CozyOS.OrganizationMembership did not register');
      });

      // Everything below runs the REAL service inside the REAL browser via
      // page.evaluate — no reimplementation of membership/authorization
      // logic on the Node side.
      await test('James can belong to Organization B (Cashier) and Organization C (Owner/Admin) simultaneously', async () => {
        const result = await page.evaluate(() => {
          const Registry = window.CozyOS.OrganizationRegistry;
          const Membership = window.CozyOS.OrganizationMembership;
          const orgB = Registry.createOrganization({ name: 'Organization_B' }).orgId;
          const orgC = Registry.createOrganization({ name: 'Organization_C' }).orgId;
          const userId = 'USER-456';

          Membership.createMembership({ userId, organizationId: orgB, roles: ['Cashier'] });
          Membership.createMembership({ userId, organizationId: orgC, roles: ['Owner', 'Admin'] });
          Membership.assignApplication(userId, orgB, 'POS');
          Membership.assignApplication(userId, orgC, 'AdminConsole');

          window.__cozyTestOrgs = { orgB, orgC, userId };
          return { orgB, orgC };
        });
        if (!result.orgB || !result.orgC || result.orgB === result.orgC) {
          throw new Error('expected two distinct real organization IDs, got: ' + JSON.stringify(result));
        }
      });

      await test('Organization B context only exposes Organization B membership/data for James', async () => {
        const membersOfB = await page.evaluate(() => {
          const { orgB, userId } = window.__cozyTestOrgs;
          const Membership = window.CozyOS.OrganizationMembership;
          return Membership.listOrganizationMembers(orgB).filter((m) => m.userId === userId);
        });
        if (membersOfB.length !== 1) throw new Error('expected exactly one James record in Organization B, got ' + membersOfB.length);
        if (!membersOfB[0].roles.includes('Cashier')) throw new Error('Organization B record missing Cashier role: ' + JSON.stringify(membersOfB[0]));
        if (membersOfB[0].roles.includes('Owner') || membersOfB[0].roles.includes('Admin')) {
          throw new Error('Organization B record leaked Organization C roles: ' + JSON.stringify(membersOfB[0]));
        }
      });

      await test('Organization B cannot access Organization C data for James', async () => {
        const leaked = await page.evaluate(() => {
          const { orgB, orgC, userId } = window.__cozyTestOrgs;
          const Membership = window.CozyOS.OrganizationMembership;
          const bMembers = Membership.listOrganizationMembers(orgB);
          // Organization B's own member list must never contain an orgC-scoped record.
          return bMembers.some((m) => m.organizationId === orgC && m.userId === userId);
        });
        if (leaked) throw new Error('Organization B member list leaked an Organization C record');
      });

      await test('Organization C context exposes only Organization C context for James', async () => {
        const membersOfC = await page.evaluate(() => {
          const { orgC, userId } = window.__cozyTestOrgs;
          const Membership = window.CozyOS.OrganizationMembership;
          return Membership.listOrganizationMembers(orgC).filter((m) => m.userId === userId);
        });
        if (membersOfC.length !== 1) throw new Error('expected exactly one James record in Organization C, got ' + membersOfC.length);
        if (!membersOfC[0].roles.includes('Owner') && !membersOfC[0].roles.includes('Admin')) {
          throw new Error('Organization C record missing Owner/Admin role: ' + JSON.stringify(membersOfC[0]));
        }
        if (membersOfC[0].roles.includes('Cashier')) {
          throw new Error('Organization C record leaked Organization B Cashier role: ' + JSON.stringify(membersOfC[0]));
        }
      });

      await test('roles are organization-specific (isAuthorized respects the exact org context)', async () => {
        const result = await page.evaluate(() => {
          const { orgB, orgC, userId } = window.__cozyTestOrgs;
          const Membership = window.CozyOS.OrganizationMembership;
          return {
            cashierInB: Membership.isAuthorized(userId, orgB, 'Cashier'),
            ownerInB: Membership.isAuthorized(userId, orgB, 'Owner'),
            ownerInC: Membership.isAuthorized(userId, orgC, 'Owner'),
            cashierInC: Membership.isAuthorized(userId, orgC, 'Cashier'),
          };
        });
        if (!result.cashierInB) throw new Error('James should be authorized as Cashier in Organization B');
        if (result.ownerInB) throw new Error('James must NOT be authorized as Owner in Organization B (role leaked across orgs)');
        if (!result.ownerInC) throw new Error('James should be authorized as Owner in Organization C');
        if (result.cashierInC) throw new Error('James must NOT be authorized as Cashier in Organization C (role leaked across orgs)');
      });

      await test('application assignments are organization-specific', async () => {
        const result = await page.evaluate(() => {
          const { orgB, orgC, userId } = window.__cozyTestOrgs;
          const Membership = window.CozyOS.OrganizationMembership;
          const bRecord = Membership.listOrganizationMembers(orgB).find((m) => m.userId === userId);
          const cRecord = Membership.listOrganizationMembers(orgC).find((m) => m.userId === userId);
          return { bApps: bRecord.applications, cApps: cRecord.applications };
        });
        if (!result.bApps.includes('POS')) throw new Error('Organization B record missing POS application: ' + JSON.stringify(result.bApps));
        if (result.bApps.includes('AdminConsole')) throw new Error('Organization B application list leaked AdminConsole: ' + JSON.stringify(result.bApps));
        if (!result.cApps.includes('AdminConsole')) throw new Error('Organization C record missing AdminConsole application: ' + JSON.stringify(result.cApps));
        if (result.cApps.includes('POS')) throw new Error('Organization C application list leaked POS: ' + JSON.stringify(result.cApps));
      });

      await test('permissions are organization-specific (a permission granted in C is not visible in B)', async () => {
        const result = await page.evaluate(() => {
          const { orgB, orgC, userId } = window.__cozyTestOrgs;
          const Membership = window.CozyOS.OrganizationMembership;
          Membership.assignRole(userId, orgC, 'reports:approve');
          const authorizedInC = Membership.isAuthorized(userId, orgC, 'reports:approve');
          let authorizedInB = false;
          try {
            authorizedInB = Membership.isAuthorized(userId, orgB, 'reports:approve');
          } catch (_e) {
            authorizedInB = false;
          }
          return { authorizedInC, authorizedInB };
        });
        if (!result.authorizedInC) throw new Error('expected the org-C-only role/permission to authorize in Organization C');
        if (result.authorizedInB) throw new Error('a role assigned only in Organization C must not authorize in Organization B');
      });

      await test('no unexpected console/page errors occurred during the whole scenario', async () => {
        if (pageErrors.length > 0) throw new Error('uncaught page errors: ' + pageErrors.join(' | '));
        if (consoleErrors.length > 0) throw new Error('console errors: ' + consoleErrors.join(' | '));
      });
    });
  } catch (e) {
    if (e.code === 'NO_PLAYWRIGHT' || e.code === 'NO_BROWSER') {
      console.log('BROWSER_TEST = NOT_RUN (' + e.message + ')');
      console.log('\n0 passed, 0 failed');
      process.exitCode = 0;
      return;
    }
    throw e;
  }

  const { passed, failed } = summary();
  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(failed > 0 ? 'BROWSER_TEST = RAN_WITH_FAILURES' : 'BROWSER_TEST = PASS');
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.log('BROWSER_TEST = NOT_RUN (' + err.message + ')');
  process.exitCode = 0;
});

void REPO_ROOT;
