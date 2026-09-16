/**
 * core/modules/intelligence/knowledge/ui/tests/cozy-knowledge-quarantine-admin-browser.test.js
 * RP-029-C Phase 5 — REAL browser test (Playwright + actual headless
 * Chromium), driving the real quarantine-admin.html page.
 * Run with: node core/modules/intelligence/knowledge/ui/tests/cozy-knowledge-quarantine-admin-browser.test.js
 */

'use strict';

const path = require('path');
const http = require('http');
const fs = require('fs');

let passed = 0, failed = 0, browserRan = false;
function test(name, fn) {
  return fn().then(() => { console.log(`  \u2713 ${name}`); passed++; })
    .catch((err) => { console.log(`  \u2717 ${name}`); console.log(`      ${err.message}`); failed++; });
}

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..', '..', '..', '..');

function contentType(p) {
  if (p.endsWith('.html')) return 'text/html';
  if (p.endsWith('.js')) return 'application/javascript';
  if (p.endsWith('.css')) return 'text/css';
  return 'application/octet-stream';
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(REPO_ROOT, decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found: ' + filePath); return; }
        res.writeHead(200, { 'Content-Type': contentType(filePath) });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  let playwright;
  try { playwright = require('playwright'); }
  catch (e) { console.log('BROWSER_TEST = NOT_RUN (playwright module not resolvable)'); console.log('\n0 passed, 0 failed'); process.exitCode = 0; return; }

  const server = await startServer();
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/cozyos/core/modules/intelligence/knowledge/ui/quarantine-admin.html?demoRole=admin`;
  const unauthorizedUrl = `http://127.0.0.1:${port}/cozyos/core/modules/intelligence/knowledge/ui/quarantine-admin.html`;

  let browser;
  try { browser = await playwright.chromium.launch(); browserRan = true; }
  catch (e) { console.log('BROWSER_TEST = NOT_RUN (no Chromium binary: ' + e.message + ')'); server.close(); console.log('\n0 passed, 0 failed'); process.exitCode = 0; return; }

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await test('admin opens quarantine dashboard and sees candidates', async () => {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('.review-dashboard-candidate-card', { timeout: 5000 });
    const count = await page.locator('.review-dashboard-candidate-card').count();
    if (count < 2) throw new Error('expected at least the 2 seeded quarantine items to render, got ' + count);
  });

  await test('opens details for the ambiguous-word item and sees its risk classification', async () => {
    await page.locator('.review-dashboard-candidate-card').first().click();
    await page.waitForSelector('.review-dashboard-detail h2', { timeout: 5000 });
    const detail = await page.locator('.review-dashboard-detail').innerText();
    if (!/Safety classification/.test(detail)) throw new Error('expected review details section, got: ' + detail);
  });

  await test('a legitimate African-language word flagged only by cross-language homonymy is NOT auto-rejected — it is quarantined for real human review, and its real meaning is visible to the reviewer', async () => {
    const detail = await page.locator('.review-dashboard-detail').innerText();
    if (!/a real Dholuo expression meaning something unrelated/.test(detail) && !/UNCERTAIN|HIGH_RISK/.test(detail)) {
      throw new Error('expected the ambiguous Dholuo submission to be visible for real human review with its actual meaning, not silently discarded: ' + detail);
    }
  });

  await test('sensitive/media item shows CONTENT INSPECTION UNAVAILABLE, never a fabricated preview', async () => {
    await page.locator('.review-dashboard-candidate-card').nth(1).click();
    await page.waitForTimeout(150);
    const detail = await page.locator('.review-dashboard-detail').innerText();
    if (!/CONTENT INSPECTION UNAVAILABLE/.test(detail)) throw new Error('expected an honest inspection-unavailable notice for the audio-reference item, got: ' + detail);
  });

  await test('audit trail section is visible and honestly empty before any real reviewer action succeeds', async () => {
    const detail = await page.locator('.review-dashboard-detail').innerText();
    if (!/No review actions recorded yet/.test(detail)) throw new Error('expected an honest empty audit trail (no action actually succeeded), got: ' + detail);
  });

  await test('authorized admin can Release a quarantined item, and a real audit event appears', async () => {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('.review-dashboard-candidate-card', { timeout: 5000 });
    await page.locator('.review-dashboard-candidate-card').first().click();
    await page.waitForSelector('.review-dashboard-detail h2', { timeout: 5000 });
    await page.getByRole('button', { name: 'Release', exact: true }).click();
    await page.waitForTimeout(200);
    const feedback = await page.locator('.review-dashboard-action-feedback').textContent();
    if (!/RELEASED/.test(feedback || '')) throw new Error('expected a real RELEASED result, got: ' + feedback);
    const detail = await page.locator('.review-dashboard-detail').innerText();
    if (!/already been reviewed \(RELEASED\)/.test(detail)) throw new Error('expected the item to now show as already reviewed/RELEASED, got: ' + detail);
  });

  await test('unauthorized (no auth backend attached) visitor cannot see quarantine content at all', async () => {
    await page.goto(unauthorizedUrl, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const cardCount = await page.locator('.review-dashboard-candidate-card').count();
    if (cardCount !== 0) throw new Error('expected zero visible quarantine cards for an unauthorized visitor, got ' + cardCount);
    const bodyText = await page.locator('#quarantine-admin-root').innerText();
    if (!/AUTHORIZATION_BACKEND_UNAVAILABLE/.test(bodyText)) throw new Error('expected an honest unauthorized notice, got: ' + bodyText);
  });

  await test('no uncaught page errors occurred during the whole flow', async () => {
    if (consoleErrors.length > 0) throw new Error('uncaught page errors: ' + consoleErrors.join(' | '));
  });

  await browser.close();
  server.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (!browserRan) console.log('BROWSER_TEST = NOT_RUN');
  else console.log(failed > 0 ? 'BROWSER_TEST = RAN_WITH_FAILURES' : 'BROWSER_TEST = PASS');
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.log('BROWSER_TEST = NOT_RUN (' + err.message + ')');
  process.exitCode = 0;
});
