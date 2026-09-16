const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' , args: ['--no-sandbox']});
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push('CONSOLE: ' + msg.text()); });
  page.on('requestfailed', req => consoleErrors.push('REQFAIL: ' + req.url() + ' :: ' + (req.failure() && req.failure().errorText)));
  page.on('response', res => { if (res.status() >= 400) consoleErrors.push('HTTP' + res.status() + ': ' + res.url()); });

  await page.goto('http://localhost:8899/_test-harness-live-assistant.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Open the Living Assistant
  let btn = await page.$('#cozy-living-assistant-btn');
  if (!btn) {
    // give more time / retry
    for (let i = 0; i < 10 && !btn; i++) {
      await page.waitForTimeout(1000);
      btn = await page.$('#cozy-living-assistant-btn');
    }
  }
  if (!btn) {
    const scriptTags = await page.evaluate(() => Array.from(document.scripts).map(s => s.src).filter(s => s.includes('living-assistant') || s.includes('cozy-ai.js') || s.includes('identity-faq') || s.includes('answer-engine') || s.includes('cozy-advisor')));
    console.log('Relevant script tags found in DOM:', scriptTags);
    const allScriptCount = await page.evaluate(() => document.scripts.length);
    const allSrcs = await page.evaluate(() => Array.from(document.scripts).map(s => s.src || '(inline)'));
    console.log('ALL SCRIPT SRCS:', JSON.stringify(allSrcs, null, 2));
    const bodyChildCount = await page.evaluate(() => document.body.children.length);
    const bodyHTMLSnippet = await page.evaluate(() => document.body.innerHTML.slice(0, 500));
    console.log('total script tags:', allScriptCount, 'body children:', bodyChildCount);
    console.log('body snippet:', bodyHTMLSnippet);
    console.log('FAIL: assistant button not found');
    const hasCozyOS = await page.evaluate(() => !!window.CozyOS);
    const hasLivingAssistant = await page.evaluate(() => !!(window.CozyOS && window.CozyOS.LivingAssistant));
    const rootExists = await page.evaluate(() => !!document.getElementById('cozy-living-assistant-root'));
    console.log('window.CozyOS exists:', hasCozyOS, 'LivingAssistant registered:', hasLivingAssistant, 'root div exists:', rootExists);
    console.log('Console errors so far:', JSON.stringify(consoleErrors, null, 2));
    await browser.close();
    process.exit(1);
  }
  await btn.click();
  await page.waitForTimeout(500);

  const questions = [
    "What is CozyOS?",
    "Mwanzilishi wa CozyOS ni nani?",
    "Eleza hadithi ya CozyOS kwa Kiswahili.",
    "What applications does CozyOS have?",
    "What is verified vs planned?"
  ];

  const results = [];
  for (const q of questions) {
    const input = await page.$('#cozy-living-assistant-input');
    await input.fill(q);
    await page.$eval('#cozy-living-assistant-form', f => f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit')));
    await page.waitForTimeout(1200);
    const messages = await page.$$eval('#cozy-living-assistant-messages > *', els => els.map(e => e.textContent.trim()));
    results.push({ q, lastReply: messages[messages.length - 1] });
  }

  console.log(JSON.stringify(results, null, 2));
  console.log('---CONSOLE ERRORS---');
  console.log(JSON.stringify(consoleErrors, null, 2));

  await browser.close();
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(1); });
