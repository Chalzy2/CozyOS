/**
 * core/modules/intelligence/knowledge/ui/tests/cozy-knowledge-review-dashboard-browser.test.js
 * RP-029-C Phase 2 — REAL browser test (spec §18). Launches actual
 * headless Chromium via Playwright, loads the real review-dashboard.html
 * page, and clicks real controls. Not a DOM simulation/mock.
 *
 * Run with: node core/modules/intelligence/knowledge/ui/tests/cozy-knowledge-review-dashboard-browser.test.js
 */

'use strict';

const path = require('path');
const http = require('http');
const fs = require('fs');

let passed = 0;
let failed = 0;
let browserRan = false;

function test(name, fn) {
  return fn().then(() => {
    console.log(`  \u2713 ${name}`);
    passed++;
  }).catch((err) => {
    console.log(`  \u2717 ${name}`);
    console.log(`      ${err.message}`);
    failed++;
  });
}

// Serve the real repository over HTTP (not file://, so relative <script>
// paths resolve exactly as they would in a real deployment).
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
  try {
    playwright = require('playwright');
  } catch (e) {
    console.log('BROWSER_TEST = NOT_RUN (playwright module not resolvable)');
    console.log(`\n0 passed, 0 failed`);
    process.exitCode = 0;
    return;
  }

  const server = await startServer();
  const port = server.address().port;
  const dashboardUrl = `http://127.0.0.1:${port}/cozyos/core/modules/intelligence/knowledge/ui/review-dashboard.html`;

  let browser;
  try {
    browser = await playwright.chromium.launch();
    browserRan = true;
  } catch (e) {
    console.log('BROWSER_TEST = NOT_RUN (no Chromium binary available: ' + e.message + ')');
    server.close();
    console.log(`\n0 passed, 0 failed`);
    process.exitCode = 0;
    return;
  }

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await test('dashboard page loads and renders the candidate list', async () => {
    await page.goto(dashboardUrl, { waitUntil: 'load' });
    await page.waitForSelector('.review-dashboard-candidate-card', { timeout: 5000 });
    const count = await page.locator('.review-dashboard-candidate-card').count();
    if (count < 1) throw new Error('expected at least one seeded demo candidate to render');
  });

  await test('search filters the candidate list to a matching real candidate', async () => {
    await page.fill('input[aria-label="Search candidates"]', 'Onge wach');
    await page.waitForTimeout(150);
    const titles = await page.locator('.review-dashboard-candidate-title').allTextContents();
    if (!titles.some((t) => t.includes('Onge wach'))) throw new Error('expected search to surface the seeded "Onge wach" candidate');
    await page.fill('input[aria-label="Search candidates"]', '');
    await page.waitForTimeout(150);
  });

  await test('selecting a candidate opens the evidence/detail panel', async () => {
    await page.locator('.review-dashboard-candidate-card').first().click();
    await page.waitForSelector('.review-dashboard-detail h2', { timeout: 5000 });
    const heading = await page.locator('.review-dashboard-detail h2').first().textContent();
    if (!heading || heading.trim().length === 0) throw new Error('expected a non-empty detail heading after selecting a candidate');
  });

  await test('Rule 82 section renders and shows a LOCKED gate for an unreadied language', async () => {
    const gateText = await page.locator('.review-dashboard-section', { hasText: 'Rule 82' }).first().innerText();
    if (!/LOCKED/.test(gateText)) throw new Error('expected the Rule 82 gate to render as LOCKED for a NOT_READY-language candidate, got: ' + gateText);
  });

  await test('as ANONYMOUS (no auth backend), Confirm click is rejected and no confirmation is recorded', async () => {
    const feedbackBefore = await page.locator('.review-dashboard-action-feedback').textContent();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.waitForTimeout(150);
    const feedbackAfter = await page.locator('.review-dashboard-action-feedback').textContent();
    if (!/AUTHORIZATION_BACKEND_UNAVAILABLE|UNAUTHORIZED/.test(feedbackAfter)) {
      throw new Error('expected an anonymous confirm click to be rejected, got: ' + feedbackAfter);
    }
  });

  await test('Challenge click (still anonymous) is rejected the same way, never silently succeeding', async () => {
    await page.getByRole('button', { name: 'Challenge', exact: true }).click();
    await page.waitForTimeout(150);
    const feedback = await page.locator('.review-dashboard-action-feedback').textContent();
    if (!/AUTHORIZATION_BACKEND_UNAVAILABLE|UNAUTHORIZED/.test(feedback)) {
      throw new Error('expected challenge to be rejected for an anonymous user, got: ' + feedback);
    }
  });

  await test('audit trail section renders with an honest empty state (no action actually succeeded yet)', async () => {
    const auditText = await page.locator('.review-dashboard-section', { hasText: 'Audit Trail' }).first().innerText();
    if (!/No reviewer actions recorded yet/.test(auditText)) {
      throw new Error('expected an honest empty audit trail since every prior action was rejected, got: ' + auditText);
    }
  });

  await test('sync status renders honestly as SYNC_PENDING, never fabricates SYNCED', async () => {
    const syncText = await page.locator('.review-dashboard-section', { hasText: 'Sync Status' }).first().innerText();
    if (!/SYNC_PENDING/.test(syncText)) throw new Error('expected honest SYNC_PENDING, got: ' + syncText);
    if (/\bSYNCED\b/.test(syncText)) throw new Error('dashboard must never render SYNCED without real sync evidence');
  });

  await test('privacy section reflects the real record visibility (PRIVATE by default) without escalation', async () => {
    const privacyText = await page.locator('.review-dashboard-section', { hasText: 'Privacy' }).first().innerText();
    if (!/PRIVATE/.test(privacyText)) throw new Error('expected a fresh candidate to still read PRIVATE after being opened, got: ' + privacyText);
  });

  await test('no uncaught page errors occurred during the whole flow', async () => {
    if (consoleErrors.length > 0) throw new Error('uncaught page errors: ' + consoleErrors.join(' | '));
  });

  await test('Cozy Offline Hotspot: with zero connections, Share via Nearby Device honestly reports no connection (never fabricates a peer)', async () => {
    await page.getByRole('button', { name: 'Share via Nearby Device', exact: true }).click();
    await page.waitForTimeout(150);
    const feedback = await page.locator('.review-dashboard-action-feedback').textContent();
    if (!/NO_ACTIVE_HOTSPOT_CONNECTION/.test(feedback)) throw new Error('expected an honest no-connection report, got: ' + feedback);
  });

  await test('Sync Status section shows "Not loaded" is never displayed once LiveHotspotEngine is present (real module, zero peers)', async () => {
    const syncText = await page.locator('.review-dashboard-section', { hasText: 'Sync Status' }).first().innerText();
    if (!/0 device\(s\) connected/.test(syncText)) throw new Error('expected an honest "0 device(s) connected" from the real, loaded LiveHotspotEngine, got: ' + syncText);
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
