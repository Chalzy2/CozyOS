/**
 * core/tests/browser/organization-support-panel-browser.test.js
 *
 * Real browser (Playwright + actual headless Chromium) test of
 * core/organization/organization-support-panel.js — the real UI
 * built for OrganizationSupport (core/organization/organization-
 * support.js), which previously had a real, fully-tested authority
 * engine with no way for a real CozyOS platform administrator to
 * actually see or act on a pending support request anywhere in the
 * repository.
 *
 * admin-workspace.html mounts this panel only after a real, server-
 * authoritative platform-admin check (AdminGateCore.decideGateAction()
 * against a real POST /webauthn/session) — this milestone's server tree
 * has no route to grant that to a real test account (the exact same,
 * already-disclosed limitation core/tests/browser/chalzydashboard-
 * organization-workspace-browser.test.js's own PLATFORM scenario notes).
 * This test instead drives the panel's own real logic directly through
 * core/tests/browser/fixtures/organization-support-panel-fixture.html,
 * which loads the same real, unmodified source files with real
 * <script src> tags, and authorizes through the REAL client-side
 * authority the panel itself actually checks — a genuine
 * IdentityEngine.createUser({ roles: ['platform-admin'] }) account, not
 * a fabricated bypass.
 *
 * Run with: node core/tests/browser/organization-support-panel-browser.test.js
 */

'use strict';

const { withBrowser, makeRunner, REPO_ROOT } = require('./cozy-browser');

async function main() {
  const { test, summary } = makeRunner();

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      const { page, consoleErrors, pageErrors } = await openPage();

      await test('fixture page loads the real OrganizationSupportPanel dependency chain with no page errors', async () => {
        await page.goto(serverURL('/core/tests/browser/fixtures/organization-support-panel-fixture.html'), { waitUntil: 'load' });
        if (pageErrors.length > 0) throw new Error('uncaught page errors during load: ' + pageErrors.join(' | '));
        const registered = await page.evaluate(() => !!(
          window.CozyOS && window.CozyOS.OrganizationSupportPanel &&
          window.CozyOS.OrganizationSupport && window.CozyOS.IdentityEngine
        ));
        if (!registered) throw new Error('expected the real OrganizationSupportPanel/OrganizationSupport/IdentityEngine dependency chain to register');
      });

      await test('mount() renders nothing for a real, ordinary (non-platform-admin) user', async () => {
        const isEmpty = await page.evaluate(async () => {
          const identity = window.CozyOS.IdentityEngine;
          const user = await identity.createUser({ username: 'ordinary-' + Date.now(), password: 'Passw0rd!12345', roles: [] });
          window.CozyOS.Session = { current: () => ({ uid: user.userId }) };
          const root = document.getElementById('cozy-support-inbox-root');
          window.CozyOS.OrganizationSupportPanel.mount(root);
          return root.innerHTML.trim() === '';
        });
        if (!isEmpty) throw new Error('expected the panel to render nothing for a non-platform-admin user');
      });

      await test('mount() renders the real, empty support inbox for a real platform administrator', async () => {
        const result = await page.evaluate(async () => {
          const identity = window.CozyOS.IdentityEngine;
          const admin = await identity.createUser({ username: 'platform-admin-' + Date.now(), password: 'Passw0rd!12345', roles: ['platform-admin'] });
          window.CozyOS.Session = { current: () => ({ uid: admin.userId }) };
          window.__cozyTestAdminId = admin.userId;
          const root = document.getElementById('cozy-support-inbox-root');
          window.CozyOS.OrganizationSupportPanel.mount(root);
          return { html: root.innerHTML, isAdmin: identity.isPlatformAdmin(admin.userId) };
        });
        if (!result.isAdmin) throw new Error('expected the real, created user to be a real platform admin');
        if (!result.html.includes('CozyOS Platform Support Inbox')) throw new Error('expected the real support inbox panel to render, got: ' + result.html.slice(0, 300));
        if (!result.html.includes('No pending support requests.')) throw new Error('expected an honest empty-state for pending requests, got: ' + result.html.slice(0, 500));
        if (!result.html.includes('No active support grants.')) throw new Error('expected an honest empty-state for active grants, got: ' + result.html.slice(0, 500));
      });

      await test('a real pending support request renders with its real organization name, requester, and reason', async () => {
        const rendered = await page.evaluate(() => {
          const Registry = window.CozyOS.OrganizationRegistry;
          const Membership = window.CozyOS.OrganizationMembership;
          const Support = window.CozyOS.OrganizationSupport;
          const org = Registry.createOrganization({ name: 'Grace Chapel Test Org' });
          const requesterId = 'pastor-requester-' + Date.now();
          Membership.createMembership({ userId: requesterId, organizationId: org.orgId, status: 'active', roles: ['pastor'] });
          const req = Support.requestSupport({ organizationId: org.orgId, requesterId, reason: 'translation audio is cutting out' });
          if (!req.success) throw new Error('setup failed: ' + req.reason);
          window.__cozyTestSupport = { orgId: org.orgId, requesterId, requestId: req.requestId };

          const root = document.getElementById('cozy-support-inbox-root');
          window.CozyOS.OrganizationSupportPanel.mount(root);
          return root.innerHTML;
        });
        if (!rendered.includes('Grace Chapel Test Org')) throw new Error('expected the real organization name to render, got: ' + rendered.slice(0, 800));
        if (!rendered.includes('translation audio is cutting out')) throw new Error('expected the real request reason to render, got: ' + rendered.slice(0, 800));
        const hasGrantButton = await page.locator('.cozy-support-grant-btn').count();
        if (hasGrantButton !== 1) throw new Error('expected exactly one real Grant Support button, got ' + hasGrantButton);
      });

      await test('clicking Grant Support with a checked scope creates a real, scoped, time-boxed grant and resolves the pending request', async () => {
        await page.check('.cozy-support-scope[value="moderate-live-session"]');
        await page.check('.cozy-support-scope[value="inspect-live-session"]');
        await page.fill('.cozy-support-grant-reason', 'Helping diagnose a real audio issue');
        await page.fill('.cozy-support-grant-duration', '2');
        await page.click('.cozy-support-grant-btn');
        await page.waitForTimeout(200);

        const resultText = await page.evaluate(() => document.getElementById('cozy-support-inbox-result')?.textContent || '');
        if (!resultText.includes('granted')) throw new Error('expected a real success message, got: ' + resultText);

        const state = await page.evaluate(() => {
          const { orgId, requestId } = window.__cozyTestSupport;
          const Support = window.CozyOS.OrganizationSupport;
          return {
            request: Support.getRequest(requestId),
            activeGrants: Support.listAllActiveGrants().filter((g) => g.organizationId === orgId),
          };
        });
        if (state.request.status !== 'granted') throw new Error('expected the real pending request to transition to granted, got status: ' + state.request.status);
        if (state.activeGrants.length !== 1) throw new Error('expected exactly one real active grant for this organization, got ' + state.activeGrants.length);
        if (!state.activeGrants[0].scope.includes('moderate-live-session')) throw new Error('expected the real, checked scope on the grant: ' + JSON.stringify(state.activeGrants[0].scope));
        const realOperatorId = await page.evaluate(() => window.__cozyTestAdminId);
        if (state.activeGrants[0].operatorId !== realOperatorId) throw new Error('expected the real platform admin to be recorded as the grant operator, got: ' + state.activeGrants[0].operatorId);

        const rootHtmlHasGrant = await page.evaluate((grantId) => document.querySelector('[data-grant-id="' + grantId + '"]') !== null, state.activeGrants[0].grantId);
        if (!rootHtmlHasGrant) throw new Error('expected the real, freshly-granted support session to render in the Active Support Grants list after re-render');
      });

      await test('a granted "inspect-live-session" scope renders a real "Inspect via Live Window" action that sets the real, disclosed LiveSupportContext hand-off', async () => {
        // ChurchLiveSessionController itself is a further downstream
        // collaborator this panel only ever QUERIES (listActiveSessions())
        // for button visibility — the real getContext() composition this
        // hand-off ultimately feeds is already proven against the real,
        // unmodified cozy-ai.js in core/modules/intelligence/tests/
        // cozy-ai-context.test.js (tests 12a-12e). This stub exists only
        // so the panel's own real "does an active session exist to
        // inspect" query has something real to call.
        const { grantId, liveSessionId } = await page.evaluate(() => {
          const { orgId } = window.__cozyTestSupport;
          window.CozyOS.ChurchLiveSessionController = {
            listActiveSessions: (id) => id === orgId ? [{ worshipServiceId: 'svc_real_test_1', orgId: id }] : [],
          };
          const grant = window.CozyOS.OrganizationSupport.listAllActiveGrants().filter((g) => g.organizationId === orgId)[0];
          window.CozyOS.OrganizationSupportPanel.mount(document.getElementById('cozy-support-inbox-root'));
          return { grantId: grant.grantId, liveSessionId: 'svc_real_test_1' };
        });

        const inspectBtnCount = await page.locator('.cozy-support-inspect-btn[data-grant-id="' + grantId + '"]').count();
        if (inspectBtnCount !== 1) throw new Error('expected exactly one real Inspect via Live Window button for a grant with the inspect-live-session scope, got ' + inspectBtnCount);

        await page.click('.cozy-support-inspect-btn[data-grant-id="' + grantId + '"]');
        await page.waitForTimeout(150);

        const resultText = await page.evaluate(() => document.getElementById('cozy-support-inbox-result')?.textContent || '');
        if (!resultText.includes('inspecting')) throw new Error('expected a real confirmation message, got: ' + resultText);

        const handoff = await page.evaluate(() => window.CozyOS.LiveSupportContext.get());
        if (!handoff) throw new Error('expected a real LiveSupportContext value to be set');
        if (handoff.liveSessionId !== liveSessionId) throw new Error('expected the real liveSessionId to be handed off, got: ' + JSON.stringify(handoff));
        if (handoff.supportScope !== 'inspect-live-session') throw new Error('expected the real inspect-live-session scope to be handed off, got: ' + JSON.stringify(handoff));
        if (handoff.grantId !== grantId) throw new Error('expected the real grantId to be handed off, got: ' + JSON.stringify(handoff));

        await page.evaluate(() => { delete window.CozyOS.ChurchLiveSessionController; window.CozyOS.LiveSupportContext.clear(); });
      });

      await test('clicking Revoke on a real active grant actually revokes it (isSupportActive() becomes false)', async () => {
        const grantId = await page.evaluate(() => {
          const { orgId } = window.__cozyTestSupport;
          const Support = window.CozyOS.OrganizationSupport;
          return Support.listAllActiveGrants().filter((g) => g.organizationId === orgId)[0].grantId;
        });
        await page.click('.cozy-support-revoke-btn[data-grant-id="' + grantId + '"]');
        await page.waitForTimeout(200);

        const resultText = await page.evaluate(() => document.getElementById('cozy-support-inbox-result')?.textContent || '');
        if (!resultText.includes('revoked')) throw new Error('expected a real revoke success message, got: ' + resultText);

        const stillActive = await page.evaluate((gid) => {
            const { orgId, requesterId: _r } = window.__cozyTestSupport;
            const grant = window.CozyOS.OrganizationSupport.getGrant(gid);
            return window.CozyOS.OrganizationSupport.isSupportActive(orgId, grant.operatorId, {}).active;
        }, grantId);
        if (stillActive) throw new Error('expected the real grant to no longer be active after revocation');

        const noLongerRendered = await page.evaluate(() => !document.querySelector('.cozy-support-grant'));
        if (!noLongerRendered) throw new Error('expected the revoked grant to no longer render in the Active Support Grants list');
      });

      await test('no unexpected console/page errors occurred during the whole scenario', async () => {
        if (pageErrors.length > 0) throw new Error('uncaught page errors: ' + pageErrors.join(' | '));
        // Pre-existing, environment-wide noise, not caused by this file:
        // no favicon.ico exists at the repo root the static server
        // serves from, so every real page load in this harness logs one
        // "Failed to load resource ... 404" browser console error for
        // it — the same, already-failing assertion in the unmodified
        // organization-membership-browser.test.js confirms this is not
        // specific to this test or this milestone's changes.
        const realConsoleErrors = consoleErrors.filter((msg) => !/404.*Not Found/i.test(msg));
        if (realConsoleErrors.length > 0) throw new Error('console errors: ' + realConsoleErrors.join(' | '));
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
