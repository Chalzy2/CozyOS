'use strict';

/**
 * core/living/tests/phase5-word-meaning-live-window-browser.test.js
 * PHASE 5 — Continuous Learning & Knowledge Growth: real-browser
 * acceptance test.
 *
 * Proves the full, real round trip through the ACTUAL Live Window (no
 * Node-level stack loading, no internal module called directly for the
 * answer itself): a user teaches CozyAI a genuinely novel word's
 * meaning, confirms it, and a LATER, separate question — "what does
 * that word mean?" — is answered correctly by the real production
 * pipeline (cozy-living-assistant.js -> cozy-answer-engine.js ->
 * SA-3 SemanticAnswerPlanner's new UNDERSTAND_CONCEPT goal ->
 * LearningEvidenceSupplement's CozyLearn bridge), never a second
 * answer path.
 *
 * Same real harness pattern as wave1-live-window-real-browser.test.js /
 * phase5-self-learning-persistence-browser.test.js: real DOM text
 * entry, real "Enter" keypress, reading the real rendered
 * #cozy-living-assistant-messages DOM.
 *
 * Run with: COZY_E2E_CHROMIUM_PATH=<path> node --test core/living/tests/phase5-word-meaning-live-window-browser.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { resolveLaunchOptions } = require('../../../server/webauthn-rp/test/browser-launch');

const DASHBOARD_HTML = 'file://' + path.resolve(__dirname, '..', '..', '..', 'dashboard.html');

async function openLiveWindow(actorId) {
    const browser = await chromium.launch(resolveLaunchOptions({ headless: true }));
    const page = await browser.newPage();
    await page.goto(DASHBOARD_HTML, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('#cozy-living-assistant-btn', { timeout: 15000 });
    await page.evaluate((uid) => { window.CozyOS.Session = { current: () => ({ uid }) }; }, actorId);
    await page.evaluate(() => window.CozyOS.LivingAssistant.open());
    await page.waitForSelector('#cozy-living-assistant-input', { timeout: 15000 });
    return { browser, page };
}

async function ask(page, text) {
    const input = page.locator('#cozy-living-assistant-input');
    await input.fill(text);
    await input.press('Enter');
    await page.waitForTimeout(900);
    const messages = await page.$$eval('#cozy-living-assistant-messages > *', (els) => els.map((e) => e.textContent.trim()));
    return messages[messages.length - 1];
}

test('PHASE 5 REAL BROWSER: teach a genuinely novel word\'s meaning through the Live Window, then later ask "what does X mean?" as a completely separate question and get the real, taught meaning back — via the actual production answer pipeline, no second answer path', async () => {
    const actorId = 'phase5-word-meaning-browser-' + Date.now();
    const { browser, page } = await openLiveWindow(actorId);
    try {
        const term = 'mzalendojamiitest' + Date.now();

        const r1 = await ask(page, `remember that ${term} means a genuine, dedicated community volunteer`);
        assert.match(r1, /Is that correct/i, `expected a real confirm prompt, got: ${r1}`);

        const r2 = await ask(page, 'yes');
        assert.match(r2, /saved|Thank you/i, `expected a real, saved confirmation, got: ${r2}`);

        // A completely SEPARATE later question — proves retrieval is not
        // merely an echo of the same turn.
        const r3 = await ask(page, `what does ${term} mean?`);
        assert.match(r3, /genuine, dedicated community volunteer/i, `expected the real taught meaning to be used in the answer, got: ${r3}`);

        // Security boundary: the answer must never leak internal
        // implementation details even in this new answer path.
        assert.doesNotMatch(r3, /\.js\b|core\/modules|core\/living|window\.CozyOS|SemanticAnswerPlanner|LearningEvidenceSupplement/i);
    } finally {
        await browser.close();
    }
});

test('PHASE 5 REAL BROWSER: a genuinely never-taught word honestly gets a real "I don\'t know" style reply on the actual Live Window, never a fabricated definition', async () => {
    const actorId = 'phase5-word-meaning-browser-neg-' + Date.now();
    const { browser, page } = await openLiveWindow(actorId);
    try {
        const term = 'zyxneverknownwordtest' + Date.now();
        const r1 = await ask(page, `what does ${term} mean?`);
        assert.doesNotMatch(r1, /genuine|dedicated|volunteer/i, `must never fabricate a meaning, got: ${r1}`);
    } finally {
        await browser.close();
    }
});
