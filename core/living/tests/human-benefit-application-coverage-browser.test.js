'use strict';

/**
 * core/living/tests/human-benefit-application-coverage-browser.test.js
 * WORKSTREAM B (Human-Centered Application Knowledge) — verification.
 *
 * Real, traced audit: window.CozyOS.CozyKnowledge.listApplicationHumanPurposeNamesFact()
 * is the real, single source of truth for every application with
 * committed human-purpose data (13 real applications at the time this
 * test was written). ChurchOS already has heavy real-browser test
 * coverage (application-semantic-repair, business-data-repair, etc.);
 * several other real, registered applications had none. This proves,
 * through the ACTUAL Live Window (no internal module called directly),
 * that human-benefit questions about those under-tested applications
 * resolve to real, non-generic content, and — composing this session's
 * own universal security-boundary fix — never leak internal
 * implementation details.
 *
 * Run with: COZY_E2E_CHROMIUM_PATH=<path> node --test core/living/tests/human-benefit-application-coverage-browser.test.js
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

const LEAK_PATTERN = /\.(?:js|html|css|json)\b|\b[A-Za-z_][A-Za-z0-9_]*\(\s*\)|\b[A-Z][A-Za-z0-9]*(?:Engine|Registry|Adapter|Coordinator|Contract|Realizer|Planner)\b/;

const UNDER_TESTED_APPS = [
    { question: 'What does QuarryOS help with?', mustMatch: /quarry|truck|fuel|load/i },
    { question: 'What does MpesaOS help with?', mustMatch: /mpesa|payment|money|transaction/i },
    { question: 'What does SchoolOS help with?', mustMatch: /school|student|education|teach/i },
    { question: 'What does HospitalOS help with?', mustMatch: /hospital|patient|health|medical/i },
];

test('REAL BROWSER: human-benefit questions about under-tested real applications resolve to real, non-generic content and never leak internal implementation details', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        for (const { question, mustMatch } of UNDER_TESTED_APPS) {
            const reply = await ask(page, question);
            assert.doesNotMatch(reply, /NO_CONVERSATIONAL_ENGINE_FALLBACK|not connected or available/i, `expected a real answer for "${question}", got the honest-but-unhelpful engine-missing fallback: ${reply}`);
            assert.match(reply, mustMatch, `expected "${question}" to surface real, application-specific content, got: ${reply}`);
            assert.doesNotMatch(reply, LEAK_PATTERN, `expected no internal implementation leakage for "${question}", got: ${reply}`);
        }
    } finally {
        await browser.close();
    }
});

test('REAL BROWSER: an authorized-development-style probe ("which JavaScript file handles this?") still gets a human-facing, non-leaking answer', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'Which JavaScript file handles ChurchOS information?');
        assert.doesNotMatch(reply, LEAK_PATTERN, `expected no internal implementation leakage, got: ${reply}`);
    } finally {
        await browser.close();
    }
});
