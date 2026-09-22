'use strict';

/**
 * core/living/tests/live-window-language-continuity.test.js
 *
 * WAVE 7 — verification checkpoint requirement: "English → Kiswahili →
 * English continuity" and "clarification" through the REAL Live Window
 * (not a unit test against an isolated module — same harness as
 * cozy-living-assistant-live-window-e2e.test.js's own openLiveWindow()/
 * ask()).
 *
 * The existing E2E suite's own "explicit language requests switch to/
 * confirm the requested verified language" test proves LANGUAGE
 * SWITCHING itself works (greeting requests). This file proves something
 * distinct and not previously covered: that the SAME topic/entity stays
 * correctly, natively answered as the user switches the QUESTION's own
 * language back and forth — never drifting to the wrong entity, never
 * falling back to English when asked in Kiswahili, and never silently
 * translating a stale English answer instead of retrieving the real,
 * native Kiswahili evidence.
 *
 * Run with: node --test core/living/tests/live-window-language-continuity.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { resolveLaunchOptions } = require('../../../server/webauthn-rp/test/browser-launch');

const DASHBOARD_HTML = 'file://' + path.resolve(__dirname, '..', '..', '..', 'dashboard.html');

async function openLiveWindow() {
    const browser = await chromium.launch(resolveLaunchOptions({ headless: true }));
    const page = await browser.newPage();
    await page.goto(DASHBOARD_HTML, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('#cozy-living-assistant-btn', { timeout: 15000 });
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

test('LANGUAGE CONTINUITY: English -> Kiswahili -> English, same entity (ShopOS), each turn answers natively in the language asked, never drifting entity, never falling back to the wrong language', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r1 = await ask(page, 'What does ShopOS do?');
        assert.match(r1, /ShopOS/i, `turn 1 (EN) should name ShopOS, got: "${r1}"`);
        assert.doesNotMatch(r1, /\bkuu\b|\bni\b.*\bnini\b/i, `turn 1 (EN) should not be Kiswahili, got: "${r1}"`);

        const r2 = await ask(page, 'ShopOS inafanya nini?');
        assert.match(r2, /ShopOS/i, `turn 2 (SW) should name ShopOS, got: "${r2}"`);
        // Real, native Kiswahili construction (not an English answer that
        // slipped through) — the intro/connective wording this pipeline
        // actually produces for Kiswahili CAPABILITY answers.
        assert.match(r2, /Hivi ndivyo|ndivyo/i, `turn 2 (SW) should be a real Kiswahili construction, got: "${r2}"`);
        assert.doesNotMatch(r2, /^Here's/i, `turn 2 (SW) must not be an English-only answer, got: "${r2}"`);

        const r3 = await ask(page, 'What does ShopOS do?');
        assert.match(r3, /ShopOS/i, `turn 3 (EN again) should still name ShopOS, got: "${r3}"`);
        assert.match(r3, /^Here's/i, `turn 3 (EN again) should be back to a real English construction, got: "${r3}"`);
    } finally {
        await browser.close();
    }
});

test('LANGUAGE CONTINUITY: switching the TOPIC while switching the LANGUAGE (EN ShopOS -> SW ChurchOS) never mixes the two applications\' content', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r1 = await ask(page, 'What does ShopOS do?');
        assert.match(r1, /ShopOS/i);

        const r2 = await ask(page, 'ChurchOS inafanya nini?');
        assert.match(r2, /ChurchOS/i, `expected ChurchOS content, got: "${r2}"`);
        assert.doesNotMatch(r2, /ShopOS/i, `must not still be answering about ShopOS after naming ChurchOS, got: "${r2}"`);
    } finally {
        await browser.close();
    }
});

test('CLARIFICATION: a genuinely ambiguous question with no named entity and no prior context gets an honest clarification/fallback, never a guessed application', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r = await ask(page, 'What are the benefits?');
        // Never silently guesses a specific, named application when none
        // was given and none was previously discussed in this fresh session.
        for (const app of ['ShopOS', 'MpesaOS', 'QuarryOS', 'WholesaleOS', 'InterestOS', 'PharmacyOS', 'ChurchOS', 'Authenticator']) {
            assert.doesNotMatch(r, new RegExp(app, 'i'), `expected an honest clarification, not a guessed answer about ${app}: "${r}"`);
        }
    } finally {
        await browser.close();
    }
});

test('FOLLOW-UP after clarification: naming the entity in the very next turn resolves it correctly, proving the clarification did not corrupt conversation state', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        await ask(page, 'What are the benefits?'); // ambiguous, ignored below
        const r = await ask(page, 'What does QuarryOS do?');
        assert.match(r, /QuarryOS/i, `expected the follow-up naming QuarryOS to resolve correctly, got: "${r}"`);
    } finally {
        await browser.close();
    }
});
