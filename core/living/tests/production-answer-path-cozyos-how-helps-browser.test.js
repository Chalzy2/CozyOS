'use strict';

/**
 * core/living/tests/production-answer-path-cozyos-how-helps-browser.test.js
 * PRODUCTION ANSWER-PATH AUDIT — real browser proof for the exact
 * reported Incognito production symptom.
 *
 * A real user, in an Incognito browser against the live dashboard.html,
 * asked in Kiswahili "Nataka kujua CozyOS inasaidiaje?" and got an old,
 * English-oriented answer wrapped in a "translation not verified"
 * disclosure instead of a real Kiswahili answer. Traced root cause (see
 * cozyos-identity-faq-router.js's new COZYOS_HOW_HELPS intent and
 * cozy-public-knowledge-source.js's getWhyUseCozyOSFact(language)):
 * this bare question shape had no trigger anywhere, so it fell through
 * to the older English-only path. This file proves, through the ACTUAL
 * Live Window (no internal module called directly), that the exact
 * reported query and its real variants now get a genuine, distinct
 * Kiswahili answer — and that the security boundary still holds.
 *
 * Run with: COZY_E2E_CHROMIUM_PATH=<path> node --test core/living/tests/production-answer-path-cozyos-how-helps-browser.test.js
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
const NOT_VERIFIED_DISCLOSURE = /haijathibitishwa|not yet verified|Kwa Kiingereza \(bado hatuna tafsiri/i;

test('REAL BROWSER: the exact reported production query — "Nataka kujua CozyOS inasaidiaje?" — now gets a real, native Kiswahili answer, not the English-wrapped "not verified" fallback', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'Nataka kujua CozyOS inasaidiaje?');
        assert.doesNotMatch(reply, NOT_VERIFIED_DISCLOSURE, `expected a real Kiswahili answer, still got the old fallback disclosure: ${reply}`);
        assert.match(reply, /watu|jamii|makanisa|shule/i, `expected real Kiswahili human-benefit content, got: ${reply}`);
        assert.doesNotMatch(reply, LEAK_PATTERN, `expected no internal implementation leakage, got: ${reply}`);
    } finally {
        await browser.close();
    }
});

test('REAL BROWSER: Kiswahili variants from the reported symptom (bare form, "nini", "watu vipi") all resolve natively', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        for (const q of ['CozyOS inasaidiaje?', 'CozyOS inasaidia nini?', 'CozyOS inasaidia watu vipi?']) {
            const reply = await ask(page, q);
            assert.doesNotMatch(reply, NOT_VERIFIED_DISCLOSURE, `"${q}" still got the old fallback disclosure: ${reply}`);
            assert.doesNotMatch(reply, LEAK_PATTERN, `"${q}" leaked internal implementation details: ${reply}`);
        }
    } finally {
        await browser.close();
    }
});

test('REAL BROWSER: the English form of the same question is unaffected (still a real, non-empty, non-leaking answer)', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'What does CozyOS help people with?');
        assert.ok(reply.length > 0);
        assert.doesNotMatch(reply, LEAK_PATTERN, `expected no internal implementation leakage, got: ${reply}`);
    } finally {
        await browser.close();
    }
});

test('REAL BROWSER: an adversarial internal-implementation-details probe, asked right after the Kiswahili answer, still gets a human-facing, non-leaking reply', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        await ask(page, 'CozyOS inasaidiaje?');
        const reply = await ask(page, 'Which JavaScript file or function handles this answer?');
        assert.doesNotMatch(reply, LEAK_PATTERN, `expected no internal implementation leakage, got: ${reply}`);
    } finally {
        await browser.close();
    }
});
