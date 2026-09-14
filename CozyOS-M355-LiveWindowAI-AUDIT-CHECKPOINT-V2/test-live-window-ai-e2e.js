'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const { createServer } = require('/home/claude/work/server/webauthn-rp/server');
const { freshDbPath: freshTmpDbPath } = require('/home/claude/work/server/webauthn-rp/test/tmp-db');
const { resolveLaunchOptions } = require('/home/claude/work/server/webauthn-rp/test/browser-launch');

const APP_ROOT = '/home/claude/work';
const RP_ID = 'localhost';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp4': 'video/mp4' };

function createFrontServer(backendOriginRef) {
  return http.createServer((req, res) => {
    if (req.url.startsWith('/auth/') || req.url.startsWith('/webauthn/')) {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        const target = new URL(req.url, backendOriginRef.value);
        const proxyReq = http.request(target, { method: req.method, headers: { ...req.headers, host: target.host } }, (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res);
        });
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
      if (err) { res.writeHead(404); res.end('not found: ' + reqPath); return; }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

(async () => {
  const dbPath = freshTmpDbPath('m355-live-window-ai');
  const backendOriginRef = { value: null };
  const front = createFrontServer(backendOriginRef);
  await new Promise((resolve) => front.listen(0, 'localhost', resolve));
  const frontPort = front.address().port;
  const frontOrigin = `http://localhost:${frontPort}`;

  const backend = createServer({ dbPath, rpId: RP_ID, rpName: 'CozyOS M355 Test', origin: frontOrigin });
  await new Promise((resolve) => backend.listen(0, 'localhost', resolve));
  const backendPort = backend.address().port;
  backendOriginRef.value = `http://localhost:${backendPort}`;

  let browser;
  try {
    const email = 'm355-tester@example.com';
    const password = 'correct horse battery staple 1';
    const registerRes = await fetch(`${frontOrigin}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    console.log('REGISTER STATUS:', registerRes.status);
    const regBody = await registerRes.json();
    console.log('REGISTER BODY:', JSON.stringify(regBody));
    await backend.rp.setPlatformAdmin(regBody.userId, true);

    browser = await chromium.launch(resolveLaunchOptions({ headless: true }));
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push('CONSOLE: ' + msg.text()); });

    await page.goto(`${frontOrigin}/login.html`);
    await page.waitForSelector('#cozy-launch-screen.cozy-launch-hidden', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.fill('#cozy-login-username', email);
    await page.fill('#cozy-login-password', password);
    await page.click('#cozy-login-submit');
    await page.waitForURL((url) => url.pathname !== '/login.html', { timeout: 15000 });
    console.log('LANDED ON:', page.url());
    if (page.url().includes('chalzydashboard')) {
      // My minimal front server doesn't replicate the real server's
      // extension-less static routing (/chalzydashboard -> chalzydashboard.html),
      // so navigate explicitly to the real file, cookie already set.
      await page.goto(`${frontOrigin}/chalzydashboard.html`);
      await page.waitForURL((url) => url.pathname.includes('admin-workspace'), { timeout: 15000 }).catch(() => {});
      console.log('AFTER ADMIN GATE:', page.url());
      await page.waitForTimeout(3000);
    }

    // Real cinematic launch sequence on index.html runs again here;
    // wait for the assistant to actually mount (real dashboard render).
    let btn = null;
    for (let i = 0; i < 30 && !btn; i++) {
      await page.waitForTimeout(1000);
      btn = await page.$('#cozy-living-assistant-btn');
    }
    if (!btn) {
      console.log('FAIL: Live Window AI button never mounted after real login.');
      console.log('Console errors:', JSON.stringify(consoleErrors, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log('PASS: Live Window AI button mounted after real login.');
    await btn.click();
    await page.waitForTimeout(500);

    const questions = [
      "What applications does CozyOS have?",
      "What is verified vs planned?"
    ];
    const results = [];
    for (const q of questions) {
      const input = await page.$('#cozy-living-assistant-input');
      await input.fill(q);
      await page.$eval('#cozy-living-assistant-form', f => f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit')));
      await page.waitForTimeout(1500);
      const messages = await page.$$eval('#cozy-living-assistant-messages > *', els => els.map(e => e.textContent.trim()));
      results.push({ q, lastReply: messages[messages.length - 1] });
    }
    console.log('RESULTS:', JSON.stringify(results, null, 2));
    const diag = await page.evaluate(() => {
      const sr = window.CozyOS && window.CozyOS.ServiceRegistry;
      let apps = null, err = null;
      try { apps = sr && typeof sr.listApplications === 'function' ? sr.listApplications() : 'no ServiceRegistry.listApplications'; }
      catch (e) { err = e.message; }
      return { hasServiceRegistry: !!sr, apps, err, hasListApplicationsGlobal: typeof window.CozyOS.listApplications };
    });
    console.log('APP REGISTRY DIAG:', JSON.stringify(diag, null, 2));
    console.log('CONSOLE ERRORS:', JSON.stringify(consoleErrors, null, 2));
  } catch (e) {
    console.error('SCRIPT ERROR:', e);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => front.close(resolve));
    await new Promise((resolve) => backend.close(resolve));
    if (typeof backend.closeAllConnections === 'function') backend.closeAllConnections();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(dbPath + '-wal', { force: true });
    fs.rmSync(dbPath + '-shm', { force: true });
  }
})();
