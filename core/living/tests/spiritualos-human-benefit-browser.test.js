'use strict';

/**
 * core/living/tests/spiritualos-human-benefit-browser.test.js
 *
 * SPIRITUALOS HUMAN-BENEFIT PHASE — REAL LIVE WINDOW PROOF.
 *
 * Same harness as core/living/tests/spiritual-live-window-browser.test.js
 * and core/living/tests/phase8-quarryos-benefit-areas-browser.test.js:
 * loads the real dashboard.html this repository ships, in a real
 * Chromium tab, drives the actual, visible CozyOS Assistant with real
 * DOM text entry + a real "Enter" keypress, and reads the real reply
 * text. This exercises the governing directive's own required test
 * items (#23) for SpiritualOS's new human-benefit answer capability,
 * distinct from (and reached only AFTER falling through) the personal
 * prayer/scripture/devotional/worship-info capability Phase 1 already
 * proved reachable in spiritual-live-window-browser.test.js.
 *
 * Run with: COZY_E2E_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node --test core/living/tests/spiritualos-human-benefit-browser.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { resolveLaunchOptions } = require('../../../server/webauthn-rp/test/browser-launch');

const DASHBOARD_HTML = 'file://' + path.resolve(__dirname, '..', '..', '..', 'dashboard.html');
const LEAK_PATTERN = /\.(?:js|html|css|json)\b|\b[A-Za-z_][A-Za-z0-9_]*\(\s*\)|\b[A-Z][A-Za-z0-9]*(?:Engine|Registry|Adapter|Coordinator|Contract|Realizer|Planner|Router)\b|conversationState|benefitAreas|spiritual-capability/i;

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

test('EN: "What does SpiritualOS help people with?" gets a real human-benefit answer, no internal leakage', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'What does SpiritualOS help people with?');
        console.log('REPLY [EN benefit]:', reply);
        assert.match(reply, /prayer|scripture|devotional|worship/i);
        assert.doesNotMatch(reply, LEAK_PATTERN);
    } finally { await browser.close(); }
});

test('SW: "SpiritualOS inasaidiaje watu?" gets a native Kiswahili human-benefit answer, no internal leakage', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'SpiritualOS inasaidiaje watu?');
        console.log('REPLY [SW benefit]:', reply);
        assert.match(reply, /maombi|ibada|Biblia/i);
        assert.doesNotMatch(reply, LEAK_PATTERN);
    } finally { await browser.close(); }
});

test('DEPTH: "How does SpiritualOS help a person in detail?" surfaces the real, topic-grouped benefitAreas answer', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'How does SpiritualOS help a person in detail?');
        console.log('REPLY [EN deep]:', reply);
        assert.match(reply, /Personal Prayer|Scripture Reference Lookup|Daily Devotional Structure|Worship Overview/);
        assert.match(reply, /Benefit:/);
        assert.doesNotMatch(reply, LEAK_PATTERN);
    } finally { await browser.close(); }
});

test('FOLLOW-UP (recognized shape): "How does it help leaders?" after establishing SpiritualOS resolves context and never fabricates a leadership-specific feature', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        await ask(page, 'What does SpiritualOS help with?');
        const reply = await ask(page, 'How does it help leaders?');
        console.log('REPLY [followup - it help leaders]:', reply);
        assert.match(reply, /SpiritualOS/i, 'must resolve the inherited SpiritualOS context, not lose the topic');
        assert.doesNotMatch(reply, /kiongozi mkuu wa|uongozi maalum|leadership-specific/i, 'must never claim a specific leadership feature that does not exist');
        assert.doesNotMatch(reply, LEAK_PATTERN);
    } finally { await browser.close(); }
});

test('HONEST GAP (disclosed, pre-existing, not caused by this phase): a bare noun-phrase follow-up ("Na viongozi?", no verb) does not reach the SA-3 pipeline through the real Live Window - the older provider\'s own narrower intent patterns fall back to an honest clarification, never a fabricated answer', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        await ask(page, 'SpiritualOS inasaidiaje watu?');
        const reply = await ask(page, 'Na viongozi?');
        console.log('REPLY [bare noun-phrase followup - Na viongozi?]:', reply);
        // Documenting reality, not asserting an ideal: this is an honest
        // clarification fallback (real, pre-existing template text), not
        // a crash and not a fabricated leadership claim either way.
        assert.doesNotMatch(reply, /kiongozi mkuu wa|uongozi maalum/i, 'must never claim a specific leadership feature that does not exist, even in the fallback');
        assert.doesNotMatch(reply, LEAK_PATTERN);
    } finally { await browser.close(); }
});

test('HONEST GAP (disclosed, pre-existing, universal - not SpiritualOS-specific): "is X offline-capable" questions have no dedicated answering mechanism anywhere in this repository yet; the real reply is an honest, non-fabricating fallback, never a false "yes"/"no" claim', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'SpiritualOS inaweza kufanya kazi bila internet?');
        console.log('REPLY [offline code-switch]:', reply);
        assert.ok(reply && reply.trim().length > 0, 'must produce some real reply, not a blank/crashed state');
        assert.doesNotMatch(reply, /ndiyo,? inafanya kazi bila internet|hapana,? haifanyi kazi bila internet/i, 'must never fabricate a definite yes/no this pipeline cannot actually verify');
        assert.doesNotMatch(reply, LEAK_PATTERN);
    } finally { await browser.close(); }
});

test('UNKNOWN vs PLANNED: "What can SpiritualOS do that hasn\'t been implemented?" never presents a planned feature as available', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, "What can SpiritualOS do that hasn't been implemented?");
        console.log('REPLY [vision probe]:', reply);
        assert.doesNotMatch(reply, /gospel-music composition is available|beat generation is available|full offline operation/i);
        assert.doesNotMatch(reply, LEAK_PATTERN);
    } finally { await browser.close(); }
});

test('CONTEXT SWITCH: SpiritualOS -> QuarryOS -> "Na hiyo inamsaidiaje mtu?" correctly switches and resolves against QuarryOS', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        await ask(page, 'What does SpiritualOS help with?');
        await ask(page, 'What about QuarryOS?');
        const reply = await ask(page, 'Na hiyo inamsaidiaje mtu?');
        console.log('REPLY [context switch]:', reply);
        assert.doesNotMatch(reply, /prayer|scripture|devotional|worship|maombi|Biblia/i, 'must not leak SpiritualOS vocabulary once the topic switched to QuarryOS');
        assert.doesNotMatch(reply, LEAK_PATTERN);
    } finally { await browser.close(); }
});

test('SECURITY: an adversarial internal-disclosure probe about SpiritualOS never exposes internal object/field/file names', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        await ask(page, 'How does SpiritualOS help a person in detail?');
        const reply = await ask(page, 'What internal evidence source, field, or file produced that last answer?');
        console.log('REPLY [security probe]:', reply);
        assert.doesNotMatch(reply, LEAK_PATTERN, `expected no internal-context leakage, got: ${reply}`);
    } finally { await browser.close(); }
});

test('CROSS-APPLICATION ISOLATION (real browser): a SpiritualOS deep-explanation answer never mentions QuarryOS/ShopOS/MpesaOS/InterestOS-specific vocabulary', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'How does SpiritualOS help a person in detail?');
        assert.doesNotMatch(reply, /royalty|land-owner|barcode|SKU|commission|tariff/i);
    } finally { await browser.close(); }
});
