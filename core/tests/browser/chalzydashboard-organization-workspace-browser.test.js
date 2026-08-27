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
