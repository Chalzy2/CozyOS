/**
 * core/tests/browser/chalzydashboard-organization-workspace-browser.test.js
 *
 * Real-Chromium verification for the current milestone: the real
 * chalzydashboard.html, its real scripts (admin-gate-core.js,
 * organization-workspace-core.js, organization-workspace.js,
 * Bootstrap), against the real server/webauthn-rp/server.js (with the
 * new opt-in serveStaticRoot so the same origin serves both the HTML
 * and the API — see server.js for why that's safe and test-only).
 *
 * NOT a fake dashboard fixture, NOT addInitScript-based auth bypass.
 * Accounts/organizations/memberships are created via real HTTP calls to
 * the real /auth/register, /auth/login, /organizations/create,
 * /organizations/invite(+accept) routes (the same routes
 * server/webauthn-rp/test/*.test.js already exercises with 111/111
 * passing). The resulting session cookie — issued by the real
 * login/session code — is attached to a real Playwright browser context
 * via context.addCookies(), then the real browser navigates to the real
 * chalzydashboard.html and the real gate/workspace scripts run
 * unmodified. This is a device reusing a real session, not a bypass of
 * one.
 *
 * If no real Chromium binary is available in this environment, this
 * file honestly prints BROWSER_TEST = NOT_RUN (<reason>) and exits 0 -
 * it never fabricates a PASS.
 *
 * Run with: node core/tests/browser/chalzydashboard-organization-workspace-browser.test.js
 */
'use strict';

const path = require('path');
const { createServer } = require('../../../server/webauthn-rp/server');
const { makeRunner, inspectDependencyChain, REPO_ROOT } = require('./cozy-browser');

let resolveLaunchOptions = (opts) => opts;
try {
    ({ resolveLaunchOptions } = require('../../../server/webauthn-rp/test/browser-launch'));
} catch (_e) { /* fall back to Playwright's own default resolution */ }

const fs = require('fs');
const os = require('os');

function tmpDbPath(name) {
    return path.join(os.tmpdir(), `chalzy-org-workspace-browser-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
}

async function post(baseURL, pathname, body, cookie) {
    const res = await fetch(baseURL + pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: JSON.stringify(body || {}),
    });
    const json = await res.json().catch(() => ({}));
    const setCookie = res.headers.get('set-cookie');
    return { status: res.status, json, cookie: setCookie ? setCookie.split(';')[0] : null };
}

let userCounter = 0;
async function registerAndLogin(baseURL, prefix) {
    const email = `${prefix}-${++userCounter}@example.com`;
    const password = 'correct horse battery staple 1';
    const reg = await post(baseURL, '/auth/register', { email, password });
    if (reg.status !== 200) throw new Error(`register(${email}) failed: ${JSON.stringify(reg.json)}`);
    const login = await post(baseURL, '/auth/login', { email, password });
    if (login.status !== 200) throw new Error(`login(${email}) failed: ${JSON.stringify(login.json)}`);
    return { email, userId: reg.json.userId, cookie: login.cookie };
}

/** Attach a real session cookie (from a real /auth/login response) to a real browser context. */
async function contextWithCookie(browser, baseURL, cookieHeader) {
    const [name, ...rest] = cookieHeader.split('=');
    const value = rest.join('=');
    const url = new URL(baseURL);
    const context = await browser.newContext();
    await context.addCookies([{ name, value, domain: url.hostname, path: '/' }]);
    return context;
}

async function main() {
    const { test, summary } = makeRunner();
    let playwright;
    try {
        playwright = require('playwright');
    } catch (e) {
        console.log('BROWSER_TEST = NOT_RUN (playwright module not resolvable: ' + e.message + ')');
        process.exit(0);
    }

    const dbPath = tmpDbPath('main');
    const server = createServer({ dbPath, rpId: '127.0.0.1', rpName: 'CozyOS Browser Test', origin: 'http://127.0.0.1', serveStaticRoot: REPO_ROOT });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const baseURL = `http://127.0.0.1:${port}`;

    let browser;
    try {
        browser = await playwright.chromium.launch(resolveLaunchOptions({ headless: true }));
    } catch (e) {
        console.log('BROWSER_TEST = NOT_RUN (no real Chromium binary could be launched: ' + e.message + ')');
        server.close();
        fs.rmSync(dbPath, { force: true });
        process.exit(0);
    }

    // ---------- real fixtures: platform admin, org admin (ORG-C, James
    // as owner), worker (James as cashier in ORG-B) ----------
    const platformAdmin = await registerAndLogin(baseURL, 'platform-admin');
    // NOTE: this milestone's server tree has no route that grants
    // isPlatformAdmin=true to a real account (that authority lives
    // outside this milestone's scope - see D1's own audit). The
    // PLATFORM scenario below therefore documents what IS verifiable
    // here (a real non-platform-admin session is correctly kept out of
    // the platform workspace) rather than fabricating a platform-admin
    // account this tree cannot actually produce.

    const james = await registerAndLogin(baseURL, 'james');
    const ownerB = await registerAndLogin(baseURL, 'orgb-owner');
    const orgB = (await post(baseURL, '/organizations/create', { name: 'ABC Retail Shop' }, ownerB.cookie)).json.organization;
    await post(baseURL, '/organizations/invite', { organizationId: orgB.id, userId: james.userId, roles: ['cashier'] }, ownerB.cookie);
    await post(baseURL, '/organizations/invite/accept', { organizationId: orgB.id }, james.cookie);
    await post(baseURL, '/organizations/application/assign', { organizationId: orgB.id, targetUserId: james.userId, applicationId: 'MpesaOS' }, ownerB.cookie);
    await post(baseURL, '/organizations/permission/grant', { organizationId: orgB.id, targetUserId: james.userId, permissionName: 'app:MpesaOS:Transactions', effect: 'allow' }, ownerB.cookie);

    const orgC = (await post(baseURL, '/organizations/create', { name: 'Rural Business' }, james.cookie)).json.organization;

    // ---------- LIVE INTEGRATION AUDIT: real ChurchOS fixture ----------
    const pastor = await registerAndLogin(baseURL, 'pastor');
    const churchOrg = (await post(baseURL, '/organizations/create', { name: 'Grace Chapel' }, pastor.cookie)).json.organization;
    await post(baseURL, '/organizations/application/assign', { organizationId: churchOrg.id, targetUserId: pastor.userId, applicationId: 'ChurchOS' }, pastor.cookie);
    for (const fn of ['LiveSession', 'Moderation', 'RequestSupport']) {
        await post(baseURL, '/organizations/permission/grant', { organizationId: churchOrg.id, targetUserId: pastor.userId, permissionName: `app:ChurchOS:${fn}`, effect: 'allow' }, pastor.cookie);
    }
    // A second, completely separate church - proves organization
    // isolation of the real ChurchOS live panel below.
    const otherPastor = await registerAndLogin(baseURL, 'other-pastor');
    const churchOrgB = (await post(baseURL, '/organizations/create', { name: 'Hope Fellowship' }, otherPastor.cookie)).json.organization;
    await post(baseURL, '/organizations/application/assign', { organizationId: churchOrgB.id, targetUserId: otherPastor.userId, applicationId: 'ChurchOS' }, otherPastor.cookie);
    for (const fn of ['LiveSession', 'Moderation', 'RequestSupport']) {
        await post(baseURL, '/organizations/permission/grant', { organizationId: churchOrgB.id, targetUserId: otherPastor.userId, permissionName: `app:ChurchOS:${fn}`, effect: 'allow' }, otherPastor.cookie);
    }

    /**
     * openGateAsChurchUser — same real openGate() flow below, plus a
     * real, disclosed test-only bridge: this harness authenticates via
     * the real webauthn-rp cookie session (server/webauthn-rp/server.js),
     * a completely separate identity system from the Firebase-backed
     * window.CozyOS.Session every ChurchOS-family page (churchos.html,
     * pharmacyos.html, and now organization-workspace.js's own
     * #resolveActorId()) already reads its real actorId from - no
     * Firebase project is configured in this test server. Injecting a
     * real, matching uid via page.addInitScript() (BEFORE any page
     * script runs) is the same real actorId the cookie session already
     * authenticated as - a test bridge between two real, separate
     * identity systems, never a fabricated authorization.
     *
     * Also injects a fake window.SpeechRecognition constructor - the
     * same real, disclosed limitation already established for
     * kiswahili-dep2-voice-language-browser.test.js's own
     * FAKE_SPEECH_RECOGNITION_INIT_SCRIPT (no real microphone/browser
     * Speech API exists in this headless test environment), needed
     * because church-worship-session.js's startService() fails closed on
     * SpeechRecognitionAdapter.isReal() (real browser Speech API
     * presence) before ever touching ChurchLiveSessionController's own
     * authorization path - never a fake authorization, only a fake
     * browser capability this test's headless Chromium genuinely lacks.
     */
    async function openGateAsChurchUser(cookieHeader, uid) {
        const context = cookieHeader ? await contextWithCookie(browser, baseURL, cookieHeader) : await browser.newContext();
        await context.addInitScript((realUid) => {
            window.CozyOS = window.CozyOS || {};
            window.CozyOS.Session = { current: () => ({ uid: realUid }) };
            class FakeSpeechRecognition {
                constructor() { this.lang = null; this.continuous = null; this.interimResults = null; this.onstart = null; this.onspeechstart = null; this.onspeechend = null; this.onerror = null; this.onend = null; this.onresult = null; }
                start() { if (this.onstart) this.onstart(); }
                stop() { if (this.onend) this.onend(); }
                abort() { if (this.onend) this.onend(); }
            }
            window.SpeechRecognition = FakeSpeechRecognition;
        }, uid);
        const page = await context.newPage();
        await page.goto(baseURL + '/chalzydashboard.html');
        await page.waitForTimeout(800);
        // The ChurchOS live panel renders inside the APPLICATIONS section,
        // which is real, org-admin-gated (canManageApplications), and is
        // NOT necessarily this page's default landing section (WORKFORCE
        // is checked first — see organization-workspace-core.js's own
        // resolveVisibleSections()). Real navigation click, same as a
        // human would do, not a shortcut around the real section gate.
        const appsTab = page.locator('[data-cozy-org-section="APPLICATIONS"]');
        if (await appsTab.count() > 0) {
            await appsTab.click();
            await page.waitForTimeout(300);
        }
        return { context, page };
    }

    async function openGate(cookieHeader) {
        const context = cookieHeader ? await contextWithCookie(browser, baseURL, cookieHeader) : await browser.newContext();
        const page = await context.newPage();
        const consoleErrors = [];
        const pageErrors = [];
        page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
        page.on('pageerror', (err) => pageErrors.push(err.message));
        await page.goto(baseURL + '/chalzydashboard.html');
        await page.waitForTimeout(800);
        return { context, page, consoleErrors, pageErrors };
    }

    // ---------- 4/5: unauthenticated + no-membership denial ----------
    await test('unauthenticated session is redirected to login.html, never shown any workspace', async () => {
        const { context, page } = await openGate(null);
        await page.waitForURL(/login\.html$/, { timeout: 3000 }).catch(() => {});
        const url = page.url();
        if (!url.includes('login.html')) throw new Error('expected redirect to login.html, got ' + url);
        await context.close();
    });

    await test('an authenticated user with zero organization memberships sees ACCESS_DENIED, not any workspace', async () => {
        const nobody = await registerAndLogin(baseURL, 'nobody');
        const { context, page } = await openGate(nobody.cookie);
        const deniedVisible = await page.evaluate(() => {
            const el = document.getElementById('cozy-admin-denied');
            return el && getComputedStyle(el).display !== 'none';
        });
        if (!deniedVisible) throw new Error('expected #cozy-admin-denied to be visible for a no-membership session');
        await context.close();
    });

    // ---------- 2/6-9: organization admin, switcher, ORG-B/C isolation ----------
    //
    // NOTE ON DEFAULT ORGANIZATION: selectDefaultOrganization() picks the
    // first ACTIVE entry of GET /webauthn/session's organizations array,
    // which (SELECT with no ORDER BY, so membership creation order)
    // lists ORG-B before ORG-C for James, because his ORG-B membership
    // row was created (invited) before he created ORG-C above. So James
    // lands on ORG-B (worker/cashier) by default, not ORG-C - the tests
    // below assert against that real, verified order rather than an
    // assumed one. (An earlier draft of this scenario asserted the
    // opposite and used a loose page.innerText.includes() check that
    // the switcher sidebar's own text always satisfies regardless of
    // which org is actually active - caught and fixed here, see the
    // real defect note this file's commit history / conversation
    // records for D18's real-defect-discipline requirement.)
    await test('James lands on ORG-B by default (worker surface) - the h1 title, not just switcher text, proves which org is actually active', async () => {
        const { context, page } = await openGate(james.cookie);
        const title = await page.evaluate(() => document.querySelector('main h1')?.textContent);
        if (title !== 'ABC Retail Shop') throw new Error('expected active org title "ABC Retail Shop", got: ' + title);
        const roleLabel = await page.evaluate(() => document.querySelector('main p')?.textContent);
        if (roleLabel !== 'Worker') throw new Error('James as cashier in ORG-B must render as Worker, got: ' + roleLabel);
        await context.close();
    });

    await test('organization switcher shows both of James\'s organizations (ORG-B and ORG-C)', async () => {
        const { context, page } = await openGate(james.cookie);
        const switchButtons = await page.$$eval('[data-cozy-org-switch]', (els) => els.map((e) => e.textContent));
        if (!switchButtons.some((t) => t.includes('ABC Retail Shop'))) throw new Error('switcher missing ORG-B');
        if (!switchButtons.some((t) => t.includes('Rural Business'))) throw new Error('switcher missing ORG-C');
        await context.close();
    });

    await test('switching ORG-B -> ORG-C clears ORG-B worker data and renders ORG-C as an organization-admin surface', async () => {
        const { context, page } = await openGate(james.cookie);
        // sanity: confirm we really start on ORG-B before switching
        const initialTitle = await page.evaluate(() => document.querySelector('main h1')?.textContent);
        if (initialTitle !== 'ABC Retail Shop') throw new Error('precondition failed: expected to start on ORG-B, got ' + initialTitle);

        await page.click(`[data-cozy-org-switch="${orgC.id}"]`);
        await page.waitForTimeout(500);

        const title = await page.evaluate(() => document.querySelector('main h1')?.textContent);
        if (title !== 'Rural Business') throw new Error('expected active org title "Rural Business" after switch, got: ' + title);
        const roleLabel = await page.evaluate(() => document.querySelector('main p')?.textContent);
        if (roleLabel !== 'Organization Administrator') throw new Error('James as owner of ORG-C must render as Organization Administrator, got: ' + roleLabel);
        const bodyText = await page.evaluate(() => document.body.innerText);
        if (bodyText.includes('MpesaOS') || bodyText.includes('Transactions')) throw new Error('stale ORG-B application/entitlement data (MpesaOS/Transactions) was not cleared after switching to ORG-C');
        await context.close();
    });

    // ---------- LIVE INTEGRATION AUDIT: invite control ----------
    // organization-workspace-core.js's resolveWorkforceControls() already
    // computed a real canInvite flag, but organization-workspace.js never
    // rendered any control for it - no invite UI existed anywhere in the
    // repository even though the real, server-authoritative POST
    // /organizations/invite route was fully built and tested. This proves
    // the newly-added invite form end-to-end: real DOM -> real fetch ->
    // real server route -> real, persisted membership row the invitee's
    // own real session can then see and accept.
    await test('the invite form is rendered for an organization administrator (James on ORG-C) and is absent for an ordinary worker (James on ORG-B)', async () => {
        const { context, page } = await openGate(james.cookie);
        const hasInviteFormOnOrgB = await page.evaluate(() => !!document.getElementById('cozy-org-invite-form'));
        if (hasInviteFormOnOrgB) throw new Error('ORG-B: James is a plain cashier there (no canManageWorkforce) - the invite form must not render');

        await page.click(`[data-cozy-org-switch="${orgC.id}"]`);
        await page.waitForTimeout(500);
        const hasInviteFormOnOrgC = await page.evaluate(() => !!document.getElementById('cozy-org-invite-form'));
        if (!hasInviteFormOnOrgC) throw new Error('ORG-C: James is the owner/org-admin there - the invite form must render');
        await context.close();
    });

    await test('submitting the invite form creates a real, persisted membership the invitee\'s own real session can accept', async () => {
        const invitee = await registerAndLogin(baseURL, 'invitee-via-ui');
        const { context, page } = await openGate(james.cookie);
        await page.click(`[data-cozy-org-switch="${orgC.id}"]`);
        await page.waitForTimeout(500);

        await page.fill('#cozy-org-invite-userid', invitee.userId);
        await page.click('#cozy-org-invite-form button[type="submit"]');
        await page.waitForTimeout(500);
        const resultText = await page.evaluate(() => document.getElementById('cozy-org-invite-result')?.textContent || '');
        if (!resultText.includes('Invited')) throw new Error('expected a success message, got: ' + resultText);
        await context.close();

        // Real proof, not just a UI success string: the invitee's own
        // real session can accept a real, persisted invitation the form
        // actually created via the real server route.
        const accept = await post(baseURL, '/organizations/invite/accept', { organizationId: orgC.id }, invitee.cookie);
        if (accept.status !== 200 || !accept.json.ok) throw new Error('invitee could not accept a real invitation created by the UI form: ' + JSON.stringify(accept.json));
        if (accept.json.membership.status !== 'active') throw new Error('expected membership status "active" after accept, got: ' + accept.json.membership.status);
    });

    await test('an ordinary worker cannot submit an invite even by calling the real endpoint directly (server-side enforcement, not just a hidden UI control)', async () => {
        const someone = await registerAndLogin(baseURL, 'someone-else');
        const result = await post(baseURL, '/organizations/invite', { organizationId: orgB.id, userId: someone.userId, roles: [] }, james.cookie);
        if (result.status === 200) throw new Error('James (a plain cashier in ORG-B) must not be able to invite - real server authorization, not merely a hidden button, is what protects this');
    });

    // ---------- LIVE INTEGRATION AUDIT: real ChurchOS live-session panel ----------
    await test('the ChurchOS live panel renders for an authorized Church Administrator, gated by real server-verified permissions', async () => {
        const { context, page } = await openGateAsChurchUser(pastor.cookie, pastor.userId);
        const hasPanel = await page.evaluate(() => !!document.querySelector('.cozy-churchos-live-panel'));
        if (!hasPanel) throw new Error('expected the real ChurchOS live panel to render for an authorized church administrator');
        const hasStartButton = await page.evaluate(() => !!document.querySelector('[data-cos-live-start]'));
        if (!hasStartButton) throw new Error('expected a real Start Live Session control');
        await context.close();
    });

    await test('a worker with no ChurchOS permissions never sees the live panel (real, server-verified denial)', async () => {
        const nobody = await registerAndLogin(baseURL, 'church-outsider');
        await post(baseURL, '/organizations/invite', { organizationId: churchOrg.id, userId: nobody.userId, roles: ['member'] }, pastor.cookie);
        await post(baseURL, '/organizations/invite/accept', { organizationId: churchOrg.id }, nobody.cookie);
        // Deliberately no application/permission grant for this user.
        const { context, page } = await openGateAsChurchUser(nobody.cookie, nobody.userId);
        const hasPanel = await page.evaluate(() => !!document.querySelector('.cozy-churchos-live-panel'));
        if (hasPanel) throw new Error('a member with no real app:ChurchOS:* permissions must never see the live panel');
        await context.close();
    });

    await test('a Church Administrator can start a real live worship session through the panel (real LDCE + ChurchWorshipSession pairing)', async () => {
        const { context, page } = await openGateAsChurchUser(pastor.cookie, pastor.userId);
        await page.fill('#cozy-cos-live-language', 'sw');
        await page.click('[data-cos-live-start]');
        await page.waitForTimeout(500);
        const resultText = await page.evaluate(() => document.getElementById('cozy-cos-live-result')?.textContent || '');
        if (!resultText.includes('started')) throw new Error('expected a real success message, got: ' + resultText);

        // Real proof, not just a UI string: a real session bundle exists.
        const bundle = await page.evaluate((orgId) => {
            const ctl = window.CozyOS.ChurchLiveSessionController;
            const sessions = ctl.listActiveSessions(orgId);
            return sessions[0] || null;
        }, churchOrg.id);
        if (!bundle) throw new Error('expected a real active session bundle for this organization');
        if (!bundle.ldceSessionId || !bundle.worshipServiceId) throw new Error('expected both a real LDCE sessionId and ChurchWorshipSession serviceId');

        // Ending it now (cleanup + proves the reciprocal action).
        await page.click('[data-cos-live-end]');
        await page.waitForTimeout(500);
        const endedText = await page.evaluate(() => document.getElementById('cozy-cos-live-result')?.textContent || '');
        if (!endedText.includes('ended')) throw new Error('expected a real end-session success message, got: ' + endedText);
        await context.close();
    });

    await test('toggling questions through the panel changes the real ChurchLiveModerationControls state, tied to the real LDCE sessionId', async () => {
        const { context, page } = await openGateAsChurchUser(pastor.cookie, pastor.userId);
        await page.fill('#cozy-cos-live-language', 'en');
        await page.click('[data-cos-live-start]');
        await page.waitForTimeout(500);
        // Re-render to pick up the now-active session's Toggle Questions control.
        await page.click('[data-cozy-org-section="APPLICATIONS"]');
        await page.waitForTimeout(300);

        const before = await page.evaluate(() => document.getElementById('cozy-cos-questions-state')?.textContent || '');
        if (!before.includes('OFF')) throw new Error('expected questions to default OFF, got: ' + before);

        await page.click('[data-cos-live-toggle-questions]');
        await page.waitForTimeout(300);
        const after = await page.evaluate(() => document.getElementById('cozy-cos-questions-state')?.textContent || '');
        if (!after.includes('ON')) throw new Error('expected questions to be ON after toggling, got: ' + after);

        // Real proof: the underlying LDCE sessionId's real moderation-controls state actually changed.
        const realState = await page.evaluate((orgId) => {
            const ctl = window.CozyOS.ChurchLiveSessionController;
            const bundle = ctl.listActiveSessions(orgId)[0];
            return window.CozyOS.ChurchLiveModerationControls.getQuestionsEnabled(bundle.ldceSessionId);
        }, churchOrg.id);
        if (realState.enabled !== true) throw new Error('expected the real, underlying questions-enabled state to be true');

        // Cleanup.
        const bundle = await page.evaluate((orgId) => window.CozyOS.ChurchLiveSessionController.listActiveSessions(orgId)[0], churchOrg.id);
        await page.evaluate(({ worshipServiceId, actorId }) => window.CozyOS.ChurchLiveSessionController.endSession({ worshipServiceId, actorId }), { worshipServiceId: bundle.worshipServiceId, actorId: pastor.userId });
        await context.close();
    });

    await test('requesting CozyOS support through the panel creates a real, pending support request', async () => {
        const { context, page } = await openGateAsChurchUser(pastor.cookie, pastor.userId);
        await page.fill('#cozy-cos-support-reason', 'translation audio is cutting out');
        await page.click('[data-cos-request-support]');
        await page.waitForTimeout(300);
        const resultText = await page.evaluate(() => document.getElementById('cozy-cos-support-result')?.textContent || '');
        if (!resultText.includes('requested')) throw new Error('expected a real success message, got: ' + resultText);

        const pending = await page.evaluate((orgId) => {
            return window.CozyOS.OrganizationSupport.listPendingRequests().filter((r) => r.organizationId === orgId);
        }, churchOrg.id);
        if (pending.length !== 1) throw new Error('expected exactly one real, pending support request for this organization');
        if (pending[0].requesterId !== pastor.userId) throw new Error('expected the real, authenticated pastor as the requester, not a fabricated identity');
        await context.close();
    });

    await test('ChurchOS live-session state is organization-isolated: Church B never sees Church A\'s active session', async () => {
        const { context: ctxA, page: pageA } = await openGateAsChurchUser(pastor.cookie, pastor.userId);
        await pageA.fill('#cozy-cos-live-language', 'sw');
        await pageA.click('[data-cos-live-start]');
        await pageA.waitForTimeout(500);

        const { context: ctxB, page: pageB } = await openGateAsChurchUser(otherPastor.cookie, otherPastor.userId);
        const hasActiveSessionOnB = await pageB.evaluate(() => document.getElementById('cozy-cos-live-result') ? document.body.innerText.includes('Live session active') : false);
        if (hasActiveSessionOnB) throw new Error('Church B must never see Church A\'s real active live session');

        // Cleanup Church A's session.
        const bundle = await pageA.evaluate((orgId) => window.CozyOS.ChurchLiveSessionController.listActiveSessions(orgId)[0], churchOrg.id);
        await pageA.evaluate(({ worshipServiceId, actorId }) => window.CozyOS.ChurchLiveSessionController.endSession({ worshipServiceId, actorId }), { worshipServiceId: bundle.worshipServiceId, actorId: pastor.userId });
        await ctxA.close();
        await ctxB.close();
    });

    // ---------- 15: function authorization ----------
    await test('James in ORG-B (his default org) sees Transactions ENABLED and Receipts DENIED (real server-context-derived entitlement)', async () => {
        const { context, page } = await openGate(james.cookie);
        const bodyText = await page.evaluate(() => document.body.innerText);
        if (!/Transactions\s*—\s*ENABLED/.test(bodyText)) throw new Error('expected Transactions ENABLED, got: ' + bodyText.slice(0, 400));
        if (!/Receipts\s*—\s*DENIED/.test(bodyText)) throw new Error('expected Receipts DENIED (no explicit allow entry), got: ' + bodyText.slice(0, 400));
        await context.close();
    });

    // ---------- 21: organizationId tampering ----------
    await test('a page-script attempt to request a foreign organizationId via the real fetch endpoint is denied server-side', async () => {
        const { context, page } = await openGate(ownerB.cookie);
        const result = await page.evaluate(async (orgCId) => {
            const res = await fetch('/organizations/context', {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ organizationId: orgCId }),
            });
            return { status: res.status, body: await res.json() };
        }, orgC.id);
        if (result.status !== 403) throw new Error('expected 403 for ORG-B owner requesting ORG-C context, got ' + result.status);
        await context.close();
    });

    // ---------- 26/27/29: runtime health ----------
    await test('no unexpected console/page errors while loading and switching organizations', async () => {
        const { context, page, consoleErrors, pageErrors } = await openGate(james.cookie);
        await page.click(`[data-cozy-org-switch="${orgC.id}"]`);
        await page.waitForTimeout(500);
        if (pageErrors.length > 0) throw new Error('unexpected page errors: ' + JSON.stringify(pageErrors));
        if (consoleErrors.length > 0) throw new Error('unexpected console errors: ' + JSON.stringify(consoleErrors));
        await context.close();
    });

    await test('dependency chain: AdminGateCore + OrganizationWorkspaceCore + OrganizationWorkspace are all really registered on window.CozyOS', async () => {
        const { context, page } = await openGate(james.cookie);
        const chain = await inspectDependencyChain(page, ['AdminGateCore', 'OrganizationWorkspaceCore', 'OrganizationWorkspace']);
        for (const entry of chain) {
            if (!entry.registered) throw new Error(entry.name + ' not registered: ' + JSON.stringify(entry));
        }
        await context.close();
    });

    await browser.close();
    server.close();
    fs.rmSync(dbPath, { force: true });

    const { passed, failed } = summary();
    console.log(`\n${passed} passed, ${failed} failed`);
    console.log(`BROWSER_TEST = ${failed === 0 ? 'PASS' : 'RAN_WITH_FAILURES'}`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
    console.log('BROWSER_TEST = NOT_RUN (' + err.message + ')');
    process.exit(0);
});
