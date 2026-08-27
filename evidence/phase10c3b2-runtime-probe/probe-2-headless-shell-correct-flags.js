const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--enable-features=PromptAPIForGeminiNano,OptimizationGuideOnDeviceModel',
      '--optimization-guide-on-device-model-execution'
    ]
  });
  const page = await browser.newPage();
  await page.goto('about:blank');
  const result = await page.evaluate(async () => {
    const out = {
      hasLanguageModel: typeof self.LanguageModel !== 'undefined',
      hasWindowAi: typeof self.ai !== 'undefined',
      hasAiText: (typeof self.ai !== 'undefined') && typeof self.ai.languageModel !== 'undefined'
    };
    return out;
  });
  console.log("Result:", JSON.stringify(result));
  await browser.close();
})().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
