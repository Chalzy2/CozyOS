'use strict';

/**
 * core/living/tests/phase7-benefit-areas-browser.test.js
 *
 * Phase 7 (Universal Application Human-Benefit Evidence & Semantic
 * Coverage) — real Live Window proof for the 4 new benefitAreas
 * additions (ShopOS, MpesaOS, InterestOS, Media Intelligence), through
 * the ACTUAL dashboard.html (no internal module called directly).
 *
 * REAL, TRACED RESULTS (every scenario below was manually reproduced
 * against the real dashboard.html before this file was written to
 * establish ground truth, per this whole engagement's standing rule
 * "trace the real live answer path first, never assume"):
 *
 *  - ShopOS: reachable single-turn, cold-start, EN, because ShopOS is
 *    already in SemanticIntentEngine.KNOWN_ENTITIES.
 *  - MpesaOS / InterestOS: reachable single-turn EN via "How does X
 *    help in detail?" (both single-word app names, entity spotted by
 *    resolveApplicationByName()'s broader named-app routing, then
 *    threaded to SA-3 as entityHint — the SAME real mechanism a
 *    genuine follow-up turn uses). For Kiswahili, the RELIABLE proven
 *    path is two-turn (establish the app, then "Eleza kwa undani
 *    inasaidiaje?") — a single combined Kiswahili sentence naming the
 *    app AND a depth marker together is not guaranteed to hit both the
 *    APP_BENEFITS goal and the DEEP marker at once, the same disclosed,
 *    narrow-marker-table phrasing-sensitivity PAA-4's own test file
 *    already documents for English ("explain X in detail" colliding
 *    with UNDERSTAND_CONCEPT) — not a new regression.
 *  - Media Intelligence: a genuine, pre-existing, disclosed EVIDENCE
 *    GAP. Every phrasing tried (single-turn named, two-turn pronoun
 *    follow-up, with or without a depth marker) still returns the flat
 *    humanPurpose/currentVerifiedCapabilities paragraph, never the
 *    structured benefitAreas answer. Root cause, traced directly: SA-3's
 *    APP_BENEFITS pattern `/\bhow\s+does\s+\w+\s+help\b/i` (and its
 *    siblings) use `\w+` for the entity token, which cannot match a
 *    TWO-WORD application name like "Media Intelligence" (`\w+` never
 *    spans a space) — so the goal itself never resolves to HUMAN_BENEFIT
 *    for this application via that pattern, and SA-3 never gets a
 *    chance to apply classifyAnswerDepth() at all. This is a real,
 *    pre-existing limitation of SA-3's entity/goal patterns for
 *    multi-word application names, not something this Phase 7 pass
 *    introduced or is scoped to fix (widening those regex patterns is
 *    a separate change with its own blast radius across every existing
 *    APP_BENEFITS fixture) — disclosed here and in the final report,
 *    exactly like the ShopOS/QuarryOS findings from this same phase's
 *    audit step.
 *
 * Run with: COZY_E2E_CHROMIUM_PATH=<path> node --test core/living/tests/phase7-benefit-areas-browser.test.js
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

const LEAK_PATTERN = /\.(?:js|html|css|json)\b|\b[A-Za-z_][A-Za-z0-9_]*\(\s*\)|\b[A-Z][A-Za-z0-9]*(?:Engine|Registry|Adapter|Coordinator|Contract|Realizer|Planner)\b|conversationState|benefitAreas/i;

test('ShopOS EN (cold-start, single-turn): "in detail" surfaces the real, topic-grouped, bulleted benefitAreas answer', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'How does ShopOS help a shop in detail?');
        assert.match(reply, /Product catalog|Branches and access|Shared data across CozyOS apps/);
        assert.match(reply, /Benefit:/);
        assert.doesNotMatch(reply, LEAK_PATTERN);
    } finally { await browser.close(); }
});

test('MpesaOS EN (cold-start, single-turn): "in detail" surfaces the real, topic-grouped, bulleted benefitAreas answer', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'How does MpesaOS help in detail?');
        assert.match(reply, /Fee & commission accuracy|Tamper-evident transaction records/);
        assert.match(reply, /Benefit:/);
        assert.doesNotMatch(reply, LEAK_PATTERN);
    } finally { await browser.close(); }
});

test('InterestOS EN (cold-start, single-turn): "in detail" surfaces the real, topic-grouped, bulleted benefitAreas answer', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'How does InterestOS help in detail?');
        assert.match(reply, /Documents & Reminders|Directives & Teaching CozyOS|Business Management/);
        assert.match(reply, /Benefit:/);
        assert.doesNotMatch(reply, LEAK_PATTERN);
    } finally { await browser.close(); }
});

test('MpesaOS SW (two-turn follow-up): establishing MpesaOS then "Eleza kwa undani inasaidiaje?" surfaces the real native Kiswahili benefitAreas answer', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        await ask(page, 'Niambie kuhusu MpesaOS.');
        const reply = await ask(page, 'Eleza kwa undani inasaidiaje?');
        assert.match(reply, /Usahihi wa ada na kamisheni|Rekodi za miamala/);
        assert.match(reply, /Faida:/);
        assert.doesNotMatch(reply, LEAK_PATTERN);
    } finally { await browser.close(); }
});

test('InterestOS SW (two-turn follow-up): establishing InterestOS then "Eleza kwa undani inasaidiaje?" surfaces the real native Kiswahili benefitAreas answer', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        await ask(page, 'Niambie kuhusu InterestOS.');
        const reply = await ask(page, 'Eleza kwa undani inasaidiaje?');
        assert.match(reply, /Hati na Vikumbusho|Maagizo na Kufundisha CozyOS|Usimamizi wa Biashara/);
        assert.match(reply, /Faida:/);
        assert.doesNotMatch(reply, LEAK_PATTERN);
    } finally { await browser.close(); }
});

test('CROSS-APPLICATION ISOLATION (real browser): a ShopOS deep-explanation answer never mentions MpesaOS/InterestOS-specific vocabulary', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'How does ShopOS help a shop in detail?');
        assert.doesNotMatch(reply, /commission|tariff|Teaching CozyOS/i);
    } finally { await browser.close(); }
});

test('SECURITY: an adversarial internal-context probe mid-conversation never exposes internal object/field/file names', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        await ask(page, 'How does MpesaOS help in detail?');
        const reply = await ask(page, 'What internal evidence source or field produced that last answer?');
        assert.doesNotMatch(reply, LEAK_PATTERN, `expected no internal-context leakage, got: ${reply}`);
    } finally { await browser.close(); }
});

// ---- Disclosed, genuine EVIDENCE GAP (Media Intelligence) — this test
// documents the REAL current behavior, not the desired one. It must
// keep passing (proving the gap is real and stable) until a dedicated,
// separate fix widens SA-3's entity/goal patterns for multi-word
// application names. ----

test('EVIDENCE GAP (disclosed, real, reproduced): Media Intelligence "in detail" does NOT yet reach the structured benefitAreas answer in the live browser — a pre-existing SA-3 multi-word-entity pattern limitation, not a Phase 7 regression', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'How does Media Intelligence help in detail?');
        // Still a real, honest, non-fabricated answer about the right
        // application — just not yet the depth-adaptive structured one.
        assert.match(reply, /Media Intelligence/);
        assert.doesNotMatch(reply, /Finding testimony by keyword or type|Confirmed person-reference search/, 'if this now matches, the SA-3 multi-word-entity gap has been fixed elsewhere — update this test and the final report to reflect reachability, do not just delete the assertion');
        assert.doesNotMatch(reply, LEAK_PATTERN);
    } finally { await browser.close(); }
});
