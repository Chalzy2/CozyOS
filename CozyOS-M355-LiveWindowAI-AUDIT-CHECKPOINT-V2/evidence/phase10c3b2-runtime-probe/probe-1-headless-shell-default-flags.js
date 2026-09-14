const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-features=PromptAPIForGeminiNano,Optimization Guide On Device Model'] });
  const page = await browser.newPage();
  await page.goto('about:blank');
  const result = await page.evaluate(async () => {
    const out = { hasWindow: typeof window !== 'undefined', hasLanguageModel: typeof self.LanguageModel !== 'undefined', hasAi: typeof self.ai !== 'undefined' };
    if (out.hasLanguageModel) {
      try { out.availability = await self.LanguageModel.availability(); } catch(e) { out.availErr = String(e); }
    }
    return out;
  });
  console.log(JSON.stringify(result, null, 2));
  const version = await browser.version();
  console.log("Browser version:", version);
  await browser.close();
})().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
