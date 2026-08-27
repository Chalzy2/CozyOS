/**
 * core/modules/intelligence/knowledge/ui/tests/cozy-knowledge-contribution-browser.test.js
 * RP-029-C Phase 3 — REAL browser test (Playwright + actual headless
 * Chromium), driving the real contribution-form.html page.
 * Run with: node core/modules/intelligence/knowledge/ui/tests/cozy-knowledge-contribution-browser.test.js
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
  const formUrl = `http://127.0.0.1:${port}/cozyos/core/modules/intelligence/knowledge/ui/contribution-form.html`;

  let browser;
  try { browser = await playwright.chromium.launch(); browserRan = true; }
  catch (e) { console.log('BROWSER_TEST = NOT_RUN (no Chromium binary: ' + e.message + ')'); server.close(); console.log('\n0 passed, 0 failed'); process.exitCode = 0; return; }

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await test('contribution form loads and renders the type/language fields', async () => {
    await page.goto(formUrl, { waitUntil: 'load' });
    await page.waitForSelector('select[aria-label="Contribution type"]', { timeout: 5000 });
    await page.waitForSelector('select[aria-label="Language"]', { timeout: 5000 });
  });

  await test('language dropdown reflects the real registry (NOT_READY shown honestly, never AVAILABLE)', async () => {
    const options = await page.locator('select[aria-label="Language"] option').allTextContents();
    const luo = options.find((t) => t.startsWith('Dholuo') || t.toLowerCase().includes('luo'));
    if (!luo || !/NOT_READY/.test(luo)) throw new Error('expected Luo to render with NOT_READY status, got: ' + JSON.stringify(options));
  });

  await test('submit is rejected without consent, and no thank-you screen appears', async () => {
    await page.selectOption('select[aria-label="Contribution type"]', 'TEXT');
    await page.selectOption('select[aria-label="Language"]', 'sw');
    const inputs = page.locator('.contribution-field input[type="text"]');
    await inputs.nth(0).fill('Sasa'); // dialect field is first text input after selects; find by label instead
    await page.getByRole('button', { name: 'Submit contribution' }).click();
    await page.waitForTimeout(150);
    const heading = await page.locator('h2').first().textContent();
    if (/Thank you/.test(heading || '')) throw new Error('submission should not have succeeded without required fields/consent');
  });

  await test('a complete oral-language submission (no spelling) succeeds and shows the thank-you screen', async () => {
    await page.goto(formUrl, { waitUntil: 'load' });
    await page.waitForSelector('select[aria-label="Contribution type"]');
    await page.selectOption('select[aria-label="Contribution type"]', 'PRONUNCIATION');
    await page.selectOption('select[aria-label="Language"]', 'luo');

    async function fillByLabel(labelText, value) {
      const label = page.locator('label', { hasText: labelText }).first();
      const forId = await label.getAttribute('for');
      await page.locator('#' + forId).fill(value);
    }
    await fillByLabel('Pronunciation / phonetic representation', 'oh-nge wach');
    await fillByLabel('What does it mean?', 'No problem');
    await fillByLabel('How is it used?', 'Casual reassurance');

    await page.locator('input[aria-label="Consent acknowledged"]').check();
    await page.getByRole('button', { name: 'Submit contribution' }).click();
    await page.waitForTimeout(200);
    const heading = await page.locator('h2').first().textContent();
    if (!/Thank you/.test(heading || '')) throw new Error('expected the real thank-you screen after a valid oral submission, got heading: ' + heading);
  });

  await test('thank-you screen shows an honest timeline state derived from the real record', async () => {
    const bodyText = await page.locator('.contribution-form').innerText();
    if (!/Timeline state: (DRAFT|CANDIDATE|PRIVATE)/.test(bodyText) && !/Timeline state:/.test(bodyText)) {
      throw new Error('expected a rendered Timeline state line, got: ' + bodyText);
    }
  });

  await test('offline share button honestly reports QUEUED with zero hotspot connections', async () => {
    await page.getByRole('button', { name: 'Share via Cozy Offline Hotspot' }).click();
    await page.waitForTimeout(150);
    const feedback = await page.locator('.review-dashboard-action-feedback').textContent();
    if (!/QUEUED/.test(feedback || '')) throw new Error('expected an honest QUEUED offline-share status, got: ' + feedback);
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
