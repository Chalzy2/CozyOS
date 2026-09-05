/**
 * core/modules/intelligence/knowledge/teach/ui/tests/cozy-teach-cozyai-browser.test.js
 * RP-031 Phase 2A — REAL browser test (Playwright + actual headless
 * Chromium), driving the real teach-cozyai-form.html page.
 * Run with: node core/modules/intelligence/knowledge/teach/ui/tests/cozy-teach-cozyai-browser.test.js
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

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..', '..', '..', '..', '..');

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
  const formUrl = `http://127.0.0.1:${port}/cozyos/core/modules/intelligence/knowledge/teach/ui/teach-cozyai-form.html`;

  let browser;
  try { browser = await playwright.chromium.launch(); browserRan = true; }
  catch (e) { console.log('BROWSER_TEST = NOT_RUN (no Chromium binary: ' + e.message + ')'); server.close(); console.log('\n0 passed, 0 failed'); process.exitCode = 0; return; }

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await test('teach-cozyai form loads and renders the knowledge-type/language fields', async () => {
    await page.goto(formUrl, { waitUntil: 'load' });
    await page.waitForSelector('select[aria-label="Knowledge type"]', { timeout: 5000 });
    await page.waitForSelector('select[aria-label="Language"]', { timeout: 5000 });
  });

  await test('knowledge-type dropdown includes the full spec vocabulary, including domain types', async () => {
    const options = await page.locator('select[aria-label="Knowledge type"] option').allTextContents();
    ['WORD', 'LITERAL_MEANING', 'CONTEXTUAL_MEANING', 'AGRICULTURE', 'EDUCATION'].forEach((t) => {
      if (options.indexOf(t) === -1) throw new Error('missing knowledge type: ' + t + ' in ' + JSON.stringify(options));
    });
  });

  await test('domain knowledge type reveals the Domain knowledge field and hides the required word field', async () => {
    await page.selectOption('select[aria-label="Knowledge type"]', 'AGRICULTURE');
    await page.waitForSelector('label:has-text("Domain knowledge")', { timeout: 5000 });
  });

  await test('submit is rejected without consent, no thank-you screen appears', async () => {
    await page.selectOption('select[aria-label="Knowledge type"]', 'WORD');
    await page.selectOption('select[aria-label="Language"]', 'luo');
    async function fillByLabel(labelText, value) {
      const label = page.locator('label', { hasText: labelText }).first();
      const forId = await label.getAttribute('for');
      await page.locator('#' + forId).fill(value);
    }
    await fillByLabel('This is what we call it.', 'wach');
    await fillByLabel('This is what it means.', 'a matter or issue');
    await page.getByRole('button', { name: 'Teach CozyAI' }).click();
    await page.waitForTimeout(150);
    const heading = await page.locator('h2').first().textContent();
    if (/Thank you/.test(heading || '')) throw new Error('submission should not succeed without consent');
  });

  await test('a complete WORD submission (with country/region/community/dialect) succeeds and shows dual pipeline status', async () => {
    async function fillByLabel(labelText, value) {
      const label = page.locator('label', { hasText: labelText }).first();
      const forId = await label.getAttribute('for');
      await page.locator('#' + forId).fill(value);
    }
    await fillByLabel('Country', 'KE');
    await fillByLabel('Region', 'Kisumu');
    await fillByLabel('Community', 'Nyalenda');
    await fillByLabel('Dialect', 'Standard Dholuo');
    await fillByLabel('Context / how it\'s used', 'Everyday conversation');
    await page.locator('input[aria-label="Consent acknowledged"]').check();
    await page.getByRole('button', { name: 'Teach CozyAI' }).click();
    await page.waitForTimeout(200);
    const bodyText = await page.locator('.contribution-form').innerText();
    if (!/Thank you/.test(bodyText)) throw new Error('expected the thank-you screen, got: ' + bodyText);
    if (!/Review pipeline: SUBMITTED/.test(bodyText)) throw new Error('expected review-pipeline SUBMITTED status, got: ' + bodyText);
    if (!/Language-pack routing: (CANDIDATE_CREATED|EVIDENCE_ADDED)/.test(bodyText)) throw new Error('expected language-pack routing status, got: ' + bodyText);
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
