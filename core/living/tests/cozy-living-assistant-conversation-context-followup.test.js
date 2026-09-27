'use strict';

/**
 * core/living/tests/cozy-living-assistant-conversation-context-followup.test.js
 *
 * GAP 2 (Pronoun-less Follow-up / Conversation Context) regression
 * coverage. REAL LIVE WINDOW END-TO-END (same discipline as
 * cozy-living-assistant-live-window-e2e.test.js — see that file's own
 * header for why a unit test alone is not sufficient proof): loads
 * the actual dashboard.html this repository ships, in a real Chromium
 * tab, and drives the actual, visible assistant through real DOM text
 * entry + a real "Enter" keypress. No internal module is called
 * directly — every answer is read back from the real rendered
 * #cozy-living-assistant-messages DOM.
 *
 * Root cause this guards against: rule-based-conversational-
 * provider.js's own conversation-state builder previously reset
 * `lastDiscussedApplication` to null for any intent outside a
 * 3-item allowlist, so a pronoun-less follow-up with no application
 * name of its own ("Inawezaje kunisaidia kufuatilia mafuta ya
 * mashine?" right after "Niambie kuhusu QuarryOS.") lost the active
 * application and could not be answered correctly. Fixed by
 * preferring the CURRENT turn's own already-resolved
 * semanticResult.entity.value before falling back to the previous
 * turn's stale value — never by hardcoding any application name into
 * a phrase list.
 *
 * A companion, explicit CONTEXT-CHANGE case (QuarryOS -> ChurchOS ->
 * follow-up resolving to ChurchOS, never QuarryOS) proves the
 * mechanism genuinely UPDATES per turn rather than merely persisting
 * the first topic forever.
 *
 * ENVIRONMENT: same portable Chromium-discovery helper as every other
 * real-browser suite in this repository (server/webauthn-rp/test/
 * browser-launch.js) — no second, competing browser-launch mechanism.
 *
 * Run with: node --test core/living/tests/cozy-living-assistant-conversation-context-followup.test.js
 * (requires COZY_E2E_CHROMIUM_PATH pointing at a real Chromium binary
 * in sandboxed environments where Playwright's managed download isn't
 * reachable — see browser-launch.js's own resolveLaunchOptions()).
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

test('LIVE WINDOW E2E: QuarryOS follow-up ("Inawezaje kunisaidia kufuatilia mafuta ya mashine?") resolves to QuarryOS, not a generic/lost-context answer', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        await ask(page, 'Niambie kuhusu QuarryOS.');
        const followup = await ask(page, 'Inawezaje kunisaidia kufuatilia mafuta ya mashine?');
        assert.match(followup, /quarryos/i);
        assert.match(followup, /mafuta/i);
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: ChurchOS follow-up ("Inawezaje kusaidia mahudhurio?") resolves to ChurchOS', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        await ask(page, 'Niambie kuhusu ChurchOS.');
        const followup = await ask(page, 'Inawezaje kusaidia mahudhurio?');
        assert.match(followup, /churchos/i);
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: ShopOS follow-up ("What can it help me manage?") resolves to ShopOS', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        await ask(page, 'Tell me about ShopOS.');
        const followup = await ask(page, 'What can it help me manage?');
        assert.match(followup, /shopos/i);
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: conversation context genuinely CHANGES on topic switch — QuarryOS -> ChurchOS -> follow-up resolves to ChurchOS, not QuarryOS', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        await ask(page, 'Niambie kuhusu QuarryOS.');
        await ask(page, 'Sasa nieleze ChurchOS.');
        const followup = await ask(page, 'Inawezaje kusaidia mahudhurio?');
        assert.match(followup, /churchos/i);
        assert.doesNotMatch(followup, /quarryos/i);
    } finally {
        await browser.close();
    }
});
