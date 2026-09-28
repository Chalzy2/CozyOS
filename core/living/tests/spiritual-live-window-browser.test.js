'use strict';

/**
 * core/living/tests/spiritual-live-window-browser.test.js
 * COZY SPIRITUALOS — PHASE 1: Spiritual Foundation — REAL LIVE WINDOW
 * PROOF.
 *
 * Same harness as core/living/tests/cozy-living-assistant-live-window-
 * e2e.test.js: loads the real dashboard.html this repository ships, in
 * a real Chromium tab, and drives the actual, visible CozyOS Assistant
 * exactly as a human would — real DOM text entry + a real "Enter"
 * keypress. Proves the SPIRITUAL_* capability is genuinely reachable
 * end to end from the ONE real Live Window (via the getContext() seam
 * added to core/modules/intelligence/cozy-ai.js this milestone), not
 * just from an isolated unit test.
 *
 * HONEST SCOPE: this proves single-turn reachability only. Cross-turn
 * conversationState.spiritual continuity (real and separately tested in
 * spiritual-capability.test.js) is NOT threaded through this particular
 * entry point yet — see cozy-ai.js's own comment at the spiritual branch
 * and this milestone's hand-back report.
 *
 * Run with: COZY_E2E_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node --test core/living/tests/spiritual-live-window-browser.test.js
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

test('SPIRITUAL LIVE WINDOW: the real stack is present on the real page', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const stack = await page.evaluate(() => ({
            semanticIntentEngine: !!(window.CozyOS && window.CozyOS.SemanticIntentEngine),
            spiritualCapability: !!(window.CozyOS && window.CozyOS.SpiritualCapability),
            spiritualIntentRouter: !!(window.CozyOS && window.CozyOS.SpiritualIntentRouter),
            bibleEngine: !!(window.CozyOS && window.CozyOS.BibleEngine),
            livingScripture: !!(window.CozyOS && window.CozyOS.Living && window.CozyOS.Living.scripture)
        }));
        assert.equal(stack.semanticIntentEngine, true);
        assert.equal(stack.spiritualCapability, true);
        assert.equal(stack.spiritualIntentRouter, true);
        assert.equal(stack.bibleEngine, true);
        assert.equal(stack.livingScripture, true);
    } finally {
        await browser.close();
    }
});

test('SPIRITUAL LIVE WINDOW: "Help me pray for my family." gets a real, structured prayer-guide reply through the real DOM', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'Help me pray for my family.');
        assert.match(reply, /Adoration/i);
        assert.doesNotMatch(reply, /not connected or available/i);
    } finally {
        await browser.close();
    }
});

test('SPIRITUAL LIVE WINDOW: "Show me John 3:16" parses the real reference and honestly reports the real not_installed state through the real DOM', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'Show me John 3:16');
        assert.match(reply, /John 3:16/);
        assert.match(reply, /no licensed Bible translation is installed/i);
    } finally {
        await browser.close();
    }
});

test('SPIRITUAL LIVE WINDOW: "I want today\'s devotional" gets the real, disclosed devotional structure through the real DOM', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, "I want today's devotional");
        assert.match(reply, /not Scripture/i);
    } finally {
        await browser.close();
    }
});

test('SPIRITUAL LIVE WINDOW: "When is the worship service?" gets the real, disclosed general overview through the real DOM', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'When is the worship service?');
        assert.match(reply, /general/i);
    } finally {
        await browser.close();
    }
});

test('SPIRITUAL LIVE WINDOW: Kiswahili "Niombee familia yangu." gets a real Kiswahili prayer-guide reply through the real DOM', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'Niombee familia yangu.');
        assert.match(reply, /Kuomba/);
    } finally {
        await browser.close();
    }
});
