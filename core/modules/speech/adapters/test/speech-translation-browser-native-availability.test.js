'use strict';

/**
 * core/modules/speech/adapters/test/speech-translation-browser-native-availability.test.js
 *
 * Real-browser check of Chrome's experimental on-device Translator API
 * (self.Translator), the "browser-native" direct-pair translation
 * provider speech-translation-provider.js can auto-register (see that
 * file's detectRealBrowserProvider()). This is not simulated: it
 * checks the actual global in the real Chromium build this
 * repository's own E2E tests use, and reports whatever the truth is —
 * present or absent — rather than assuming either.
 *
 * See MEDIA-INTELLIGENCE-TRANSLATION-ARCHITECTURE-AUDIT.md §3 for why
 * this matters: it is the one of the three real translation providers
 * whose availability in THIS environment could actually be checked by
 * launching a real browser, unlike nllb-bridge (needs a local Python
 * model process) and gemini-translate (needs network egress + a real
 * API key) — both genuinely NOT TESTABLE here.
 *
 * Run with: node --test core/modules/speech/adapters/test/speech-translation-browser-native-availability.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { resolveLaunchOptions } = require('../../../../../server/webauthn-rp/test/browser-launch');

test('REAL BROWSER CHECK: whether self.Translator (Chrome on-device Translator API) exists in this repository\'s own test Chromium build', async () => {
    const browser = await chromium.launch(resolveLaunchOptions({ headless: true }));
    try {
        const page = await browser.newPage();
        await page.goto('about:blank');
        const hasTranslator = await page.evaluate(() => typeof self.Translator !== 'undefined' && typeof self.Translator.create === 'function');
        // Deliberately NOT asserting a fixed expected value — this test's
        // job is to report the real, current truth (which the audit
        // records as false for chromium-1194), not to lock in an
        // assumption that would silently go stale if this repository's
        // pinned browser build is ever upgraded to one that ships it.
        console.log(`self.Translator present in this test browser build: ${hasTranslator}`);
        assert.equal(typeof hasTranslator, 'boolean', 'the check itself must always resolve to a real boolean, never throw or hang');
    } finally {
        await browser.close();
    }
});
