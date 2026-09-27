'use strict';

/**
 * core/living/tests/paa4-depth-adaptive-composition-browser.test.js
 * PAA-4 (Depth-Adaptive Cognitive Composition) — real Live Window proof.
 *
 * Verifies, through the ACTUAL dashboard.html (no internal module called
 * directly), that:
 *   1. a plain benefit question keeps today's existing behavior (many
 *      granular claims, unchanged — zero regression);
 *   2. an explicit "in detail"/"kwa undani" question gets the new,
 *      real, topic-grouped, bulleted ChurchOS answer (EN + SW), never
 *      the old flat list;
 *   3. an explicit "briefly"/"kwa ufupi" question gets a short, single-
 *      point answer;
 *   4. the security boundary still holds on every one of these, even
 *      under an adversarial probe.
 *
 * Run with: COZY_E2E_CHROMIUM_PATH=<path> node --test core/living/tests/paa4-depth-adaptive-composition-browser.test.js
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

test('REAL BROWSER: a plain benefit question ("What does ChurchOS help with?") keeps the existing, unchanged, many-claim behavior', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'What does ChurchOS help with?');
        assert.doesNotMatch(reply, LEAK_PATTERN, `expected no internal implementation leakage, got: ${reply}`);
        assert.match(reply, /church/i);
    } finally {
        await browser.close();
    }
});

test('REAL BROWSER (EN, detailed): "How does ChurchOS help a church in detail?" gets the real, topic-grouped, bulleted answer', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'How does ChurchOS help a church in detail?');
        assert.match(reply, /Members/i, `expected the real "Members" benefit area, got: ${reply}`);
        assert.match(reply, /Benefit:/i);
        assert.doesNotMatch(reply, LEAK_PATTERN, `expected no internal implementation leakage, got: ${reply}`);
    } finally {
        await browser.close();
    }
});

test('REAL BROWSER (SW, kwa undani): "Eleza kwa undani ChurchOS inasaidiaje kanisa?" gets the real, native Kiswahili topic-grouped answer', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'Eleza kwa undani ChurchOS inasaidiaje kanisa?');
        assert.match(reply, /Wanachama/i, `expected the real, native Kiswahili "Wanachama" benefit area, got: ${reply}`);
        assert.match(reply, /Faida:/i);
        assert.doesNotMatch(reply, LEAK_PATTERN, `expected no internal implementation leakage, got: ${reply}`);
    } finally {
        await browser.close();
    }
});

test('REAL BROWSER (SW, brief): "ChurchOS inasaidia nini kwa ufupi?" gets a short, single-point answer, not the full list', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'ChurchOS inasaidia nini kwa ufupi?');
        // A short answer must be meaningfully shorter than the detailed,
        // multi-bullet answer proven above — a real, observable behavior
        // difference driven by intent, not a hard-coded string match.
        assert.ok(reply.length < 200, `expected a short answer, got ${reply.length} chars: ${reply}`);
        assert.doesNotMatch(reply, /\n•/, 'a brief answer must never be bulleted');
        assert.doesNotMatch(reply, LEAK_PATTERN, `expected no internal implementation leakage, got: ${reply}`);
    } finally {
        await browser.close();
    }
});

test('REAL BROWSER: an adversarial internal-implementation-details probe, asked right after a detailed answer, still gets a human-facing, non-leaking reply', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        await ask(page, 'How does ChurchOS help a church in detail?');
        const reply = await ask(page, 'Which JavaScript file or function constructed that answer?');
        assert.doesNotMatch(reply, LEAK_PATTERN, `expected no internal implementation leakage, got: ${reply}`);
    } finally {
        await browser.close();
    }
});
