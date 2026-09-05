const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: ['--enable-features=PromptAPIForGeminiNano,OptimizationGuideOnDeviceModel']
  });
  const page = await browser.newPage();
  await page.goto('about:blank');
  const ver = await browser.version();
  const result = await page.evaluate(() => ({
    hasLanguageModel: typeof self.LanguageModel !== 'undefined',
    hasAi: typeof self.ai !== 'undefined'
  }));
  console.log("Full chromium version:", ver, JSON.stringify(result));
  await browser.close();
})().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
