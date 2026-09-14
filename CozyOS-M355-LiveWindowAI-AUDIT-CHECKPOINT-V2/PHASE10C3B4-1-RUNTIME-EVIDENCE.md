# PHASE 10C-3B4-1 — Runtime Evidence (Real Browser Prompt API Probe)

## What was actually run

A real Google Chrome for Testing binary, version **131.0.6778.204**
(`/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`),
was launched **headless** via Playwright's Chromium driver in this audit
session (`executablePath` pointed at the real binary — this was not
Playwright's own bundled/simulated browser).

```js
const { chromium } = require('playwright');
const browser = await chromium.launch({
  executablePath: '/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome',
  headless: true,
  args: ['--enable-features=Optimization Guide On Device Model,PromptAPIForGeminiNano']
});
const page = await browser.newPage();
const result = await page.evaluate(async () => ({
  hasWindowAi: typeof window.ai !== 'undefined',
  hasSelfAi: typeof self.ai !== 'undefined',
  hasLanguageModel: typeof window.LanguageModel !== 'undefined',
  hasSelfLanguageModel: typeof self.LanguageModel !== 'undefined',
  ua: navigator.userAgent
}));
```

## Actual result (verbatim)

```json
{
  "hasWindowAi": false,
  "hasSelfAi": false,
  "hasLanguageModel": false,
  "hasSelfLanguageModel": false,
  "ua": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36"
}
```

This is a **real browser result**, not a test-double. `window.ai`,
`self.ai`, `window.LanguageModel`, and `self.LanguageModel` are all
genuinely `undefined` on this Chrome for Testing build, even with the
on-device-model / Prompt-API feature flags passed at launch.

## Network check

```
curl -s -m 5 -o /dev/null -w "%{http_code}\n" https://example.com
403
```

Outbound network from this sandbox is blocked (egress proxy denial),
independent of the browser result above. Even a Chrome build that did
expose `LanguageModel`/`window.ai` could not download the on-device
model component here.

## Relationship to the prior (Phase 10C-3B2) finding

Phase 10C-3B2's evidence file recorded the same absence on a
**different** Chromium build (141) in a prior session. This phase's
probe used Chrome 131 and reached the identical conclusion
independently. Two different Chromium major versions, tested in two
different sessions, both show no Prompt API surface in this sandbox —
this is a property of the sandbox/build combination available here,
not a fluke of one binary.

## Why this stops at Part 4, not Part 4+

Per the project rules ("If the environment cannot provide real
execution, stop at the appropriate boundary" / "NEVER replace a real
browser result with a fake and call it real"), this phase does not
attempt to simulate a working Prompt API. All subsequent tracing in
`phase10c3b4-1-living-engine-browser-provider-audit.test.js` uses the
same explicitly-labeled test-double convention as the Phase 10C-3A/
10C-3B2 suites, and is never presented as real model output.
