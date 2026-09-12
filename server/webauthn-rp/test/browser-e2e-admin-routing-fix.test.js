
'use strict';

/**
 * server/webauthn-rp/test/browser-e2e-admin-routing-fix.test.js
 *
 * Real browser end-to-end proof of the Admin routing fix found via real
 * Chrome Incognito testing: an administrator who navigates directly to
 * login.html has no ?return=/chalzydashboard query parameter, so the
 * Administrator Sign-In section itself stays hidden by design (see
 * revealAdminFirebaseSectionIfReturningToProtectedRoute() in login.html
 * — "no administrator controls on public login"). A real administrator
 * in that situation signs in through the ONLY form actually visible to
 * them: the ordinary login form. The bug, and this fix, is therefore
 * about THAT form's redirect: it must route by the server's real
 * isPlatformAdmin verdict, not blindly to the ordinary destination,
 * since the same real account is still a genuine, server-verified
 * administrator regardless of which visible form was used to sign in.
 *
 * (The Administrator form itself, on the rarer path where a person
 * really does arrive via chalzydashboard.html's own gate redirect with
 * a real ?return= parameter, was already correctly routed even before
 * this fix, because resolvePostLoginDestination() already resolves
 * that real parameter to /chalzydashboard in that case — confirmed
 * during this round's own investigation, not assumed.)
 *
 * Reuses the exact same real-browser/real-server/real-static-front
 * harness pattern already established in
 * browser-e2e-passkey-login.test.js (Chromium via Playwright, the real
 * server/webauthn-rp backend, a minimal test-only static+proxy front
 * server).
 *
 * WHAT THIS TEST DOES NOT CLAIM
 *   /chalzydashboard itself is not served by this test's minimal static
 *   front server (it is a real, separate route in production, already
 *   covered by chalzydashboard-gate-integration.test.js /
 *   chalzydashboard-return-to-integration.test.js). This test verifies
 *   the real browser's navigation TARGET (page.url() after the real
 *   click) — the exact thing the reported bug was about.
 *
 * Run: node --test server/webauthn-rp/test/browser-e2e-admin-routing-fix.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { createServer } = require('../server');
const { freshDbPath: freshTmpDbPath } = require('./tmp-db');
const { resolveLaunchOptions } = require('./browser-launch');

const APP_ROOT = path.resolve(__dirname, '..', '..', '..');
const RP_ID = 'localhost';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function freshDbPath() {
  return freshTmpDbPath('webauthn-e2e-admin-routing');
}

function createFrontServer(backendOriginRef) {
  return http.createServer((req, res) => {
    if (req.url.startsWith('/auth/') || req.url.startsWith('/webauthn/')) {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        const target = new URL(req.url, backendOriginRef.value);
        const proxyReq = http.request(
          target,
          { method: req.method, headers: { ...req.headers, host: target.host } },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
          }
        );
        proxyReq.on('error', (err) => { res.writeHead(502); res.end(String(err)); });
        if (body.length) proxyReq.write(body);
        proxyReq.end();
      });
      return;
    }

    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/') reqPath = '/login.html';
    const filePath = path.join(APP_ROOT, reqPath);
    if (!filePath.startsWith(APP_ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('e2e-test-marker: not found: ' + reqPath); return; }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

async function withStack(fn) {
  const dbPath = freshDbPath();
  const backendOriginRef = { value: null };
  const front = createFrontServer(backendOriginRef);
  await new Promise((resolve) => front.listen(0, 'localhost', resolve));
  const frontPort = front.address().port;
  const frontOrigin = `http://localhost:${frontPort}`;

  const backend = createServer({ dbPath, rpId: RP_ID, rpName: 'CozyOS E2E Test', origin: frontOrigin });
  await new Promise((resolve) => backend.listen(0, 'localhost', resolve));
  const backendPort = backend.address().port;
  backendOriginRef.value = `http://localhost:${backendPort}`;

  try {
    await fn({ frontOrigin, backend });
  } finally {
    await new Promise((resolve) => front.close(resolve));
    await new Promise((resolve) => backend.close(resolve));
    if (typeof backend.closeAllConnections === 'function') backend.closeAllConnections();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(dbPath + '-wal', { force: true });
    fs.rmSync(dbPath + '-shm', { force: true });
  }
}

test('browser E2E: an administrator navigating directly to login.html (no ?return= param, Administrator section hidden as designed) signs in via the real, visible ordinary login form and is sent to /chalzydashboard, not the ordinary destination — the exact reported bug, now fixed', async () => {
  await withStack(async ({ frontOrigin, backend }) => {
    const email = 'real-admin@example.com';
    const password = 'correct horse battery staple 1';

    const registerRes = await fetch(`${frontOrigin}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    assert.equal(registerRes.status, 200);
    const { userId } = await registerRes.json();
    await backend.rp.setPlatformAdmin(userId, true);

    const browser = await chromium.launch(resolveLaunchOptions());
    const page = await browser.newPage();
    try {
      // Real, direct navigation — NO ?return= query parameter at all,
      // exactly reproducing the reported real-world Chrome Incognito
      // scenario. Confirmed the Administrator section is genuinely
      // hidden here, not merely assumed.
      await page.goto(`${frontOrigin}/login.html`);
      const adminSectionVisible = await page.isVisible('#cozy-admin-firebase-section');
      assert.equal(adminSectionVisible, false, 'the Administrator section must genuinely be hidden with no return parameter, confirming this real admin has no choice but to use the ordinary form below');

      await page.fill('#cozy-login-username', email);
      await page.fill('#cozy-login-password', password);
      await page.click('#cozy-login-submit');
      await page.waitForURL((url) => url.pathname !== '/login.html', { timeout: 15000 });

      const finalUrl = new URL(page.url());
      assert.equal(finalUrl.pathname, '/chalzydashboard', `a real, server-confirmed platform administrator signing in through the ordinary form must be navigated to /chalzydashboard, not ${finalUrl.pathname}`);
    } finally {
      await page.close();
      await browser.close();
    }
  });
});

test('browser E2E: an ordinary (non-admin) user signing in via the same ordinary form is NOT sent to /chalzydashboard — the fix does not grant admin routing to non-admins', async () => {
  await withStack(async ({ frontOrigin }) => {
    const email = 'ordinary-user@example.com';
    const password = 'correct horse battery staple 1';
    await fetch(`${frontOrigin}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    // Deliberately NOT granted platform admin.

    const browser = await chromium.launch(resolveLaunchOptions());
    const page = await browser.newPage();
    try {
      await page.goto(`${frontOrigin}/login.html`);
      await page.fill('#cozy-login-username', email);
      await page.fill('#cozy-login-password', password);
      await page.click('#cozy-login-submit');
      await page.waitForURL((url) => url.pathname !== '/login.html', { timeout: 15000 });

      const finalUrl = new URL(page.url());
      assert.notEqual(finalUrl.pathname, '/chalzydashboard', 'a non-admin account must never be routed to /chalzydashboard');
      assert.match(finalUrl.pathname, /index\.html$/, 'an ordinary user must still reach the exact same ordinary destination as before this fix');
    } finally {
      await page.close();
      await browser.close();
    }
  });
});

test('browser E2E: an administrator arriving via a real ?return=/chalzydashboard parameter (e.g. bounced here by chalzydashboard.html\'s own gate) sees the now-visible Administrator form and still correctly reaches /chalzydashboard — confirming no regression to this already-working path', async () => {
  await withStack(async ({ frontOrigin, backend }) => {
    const email = 'gate-admin@example.com';
    const password = 'correct horse battery staple 1';
    const registerRes = await fetch(`${frontOrigin}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    const { userId } = await registerRes.json();
    await backend.rp.setPlatformAdmin(userId, true);

    const browser = await chromium.launch(resolveLaunchOptions());
    const page = await browser.newPage();
    try {
      await page.goto(`${frontOrigin}/login.html?return=%2Fchalzydashboard`);
      const adminSectionVisible = await page.isVisible('#cozy-admin-firebase-section');
      assert.equal(adminSectionVisible, true, 'with a real, valid return parameter, the Administrator section must become visible');

      await page.fill('#cozy-admin-firebase-email', email);
      await page.fill('#cozy-admin-firebase-password', password);
      await page.click('#cozy-admin-firebase-submit');
      await page.waitForURL((url) => url.pathname !== '/login.html', { timeout: 15000 });

      const finalUrl = new URL(page.url());
      assert.equal(finalUrl.pathname, '/chalzydashboard');
    } finally {
      await page.close();
      await browser.close();
    }
  });
});

// ---- b64url helper for real passkey registration during E2E setup, matching browser-e2e-passkey-login.test.js exactly ----
async function registerRealPasskeyForAdmin(page, email) {
  return page.evaluate(async (email) => {
    function toB64url(buf) {
      const bytes = new Uint8Array(buf);
      let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function fromB64url(str) {
      const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes.buffer;
    }
    const beginRes = await fetch('/webauthn/register/begin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ email }),
    });
    const begin = await beginRes.json();
    if (!beginRes.ok) return { ok: false, stage: 'begin', begin };
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: fromB64url(begin.challenge),
        rp: { id: begin.rpId, name: 'CozyOS E2E Test' },
        user: { id: fromB64url(begin.userId || toB64url(new TextEncoder().encode(email))), name: email, displayName: email },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: { userVerification: 'required', residentKey: 'required' },
        timeout: 60000,
      },
    });
    const completeRes = await fetch('/webauthn/register/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ email, clientDataJSON: toB64url(cred.response.clientDataJSON), attestationObject: toB64url(cred.response.attestationObject) }),
    });
    const complete = await completeRes.json().catch(() => ({}));
    return { ok: completeRes.ok && complete.ok !== false, stage: 'complete', status: completeRes.status, complete };
  }, email);
}

test('browser E2E: a real administrator using the standalone, first-factor "Sign in with Passkey" button (no password at all) is sent to /chalzydashboard, not the ordinary destination — the second, independent occurrence of the reported bug, confirmed and fixed', async () => {
  await withStack(async ({ frontOrigin, backend }) => {
    const email = 'passkey-admin@example.com';
    const password = 'correct horse battery staple 1';

    const registerRes = await fetch(`${frontOrigin}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    const { userId } = await registerRes.json();
    await backend.rp.setPlatformAdmin(userId, true);

    const browser = await chromium.launch(resolveLaunchOptions());
    const context = await browser.newContext();
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    });

    try {
      await page.goto(`${frontOrigin}/login.html`);
      await page.locator('#cozy-launch-screen').waitFor({ state: 'hidden', timeout: 35000 });

      const reg = await registerRealPasskeyForAdmin(page, email);
      assert.equal(reg.ok, true, `real passkey registration should succeed: ${JSON.stringify(reg)}`);

      // The real, reported scenario: the admin uses ONLY the standalone
      // passwordless Passkey button — password is never entered at all.
      await page.fill('#cozy-login-username', email);
      await page.click('#cozy-more-toggle');
      await page.waitForSelector('#cozy-more-toggle[aria-expanded="true"]');
      await page.locator('#cozy-passkey-btn').click();
      await page.waitForURL((url) => url.pathname !== '/login.html', { timeout: 15000 });

      const finalUrl = new URL(page.url());
      assert.equal(finalUrl.pathname, '/chalzydashboard', `a real, server-confirmed platform administrator using the standalone Passkey button must be navigated to /chalzydashboard, not ${finalUrl.pathname}`);
    } finally {
      await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId }).catch(() => {});
      await page.close();
      await browser.close();
    }
  });
});

test('browser E2E: an ordinary (non-admin) user using the same standalone Passkey button still goes to the ordinary destination, not /chalzydashboard — the fix does not grant admin routing to non-admins here either', async () => {
  await withStack(async ({ frontOrigin }) => {
    const email = 'passkey-ordinary@example.com';
    const password = 'correct horse battery staple 1';
    await fetch(`${frontOrigin}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    });

    const browser = await chromium.launch(resolveLaunchOptions());
    const context = await browser.newContext();
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    });

    try {
      await page.goto(`${frontOrigin}/login.html`);
      await page.locator('#cozy-launch-screen').waitFor({ state: 'hidden', timeout: 35000 });
      const reg = await registerRealPasskeyForAdmin(page, email);
      assert.equal(reg.ok, true);

      await page.fill('#cozy-login-username', email);
      await page.click('#cozy-more-toggle');
      await page.waitForSelector('#cozy-more-toggle[aria-expanded="true"]');
      await page.locator('#cozy-passkey-btn').click();
      await page.waitForURL((url) => url.pathname !== '/login.html', { timeout: 15000 });

      const finalUrl = new URL(page.url());
      assert.notEqual(finalUrl.pathname, '/chalzydashboard');
    } finally {
      await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId }).catch(() => {});
      await page.close();
      await browser.close();
    }
  });
});
  
