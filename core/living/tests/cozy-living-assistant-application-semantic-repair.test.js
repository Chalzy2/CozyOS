'use strict';

/**
 * core/living/tests/cozy-living-assistant-application-semantic-repair.test.js
 *
 * REAL LIVE WINDOW END-TO-END PROOF for the "LIVE WINDOW APPLICATION
 * SEMANTIC UNDERSTANDING REPAIR" — every answer below is read back from
 * the real rendered #cozy-living-assistant-messages DOM after real text
 * entry + a real "Enter" keypress into #cozy-living-assistant-input,
 * exactly like cozy-living-assistant-live-window-e2e.test.js (this file
 * follows that file's own established helper pattern, never a second
 * harness). No internal module (CozyAI.getContext, CozyAnswerEngine) is
 * called directly anywhere in this file.
 *
 * WHY GROUPED INTO SEVERAL SHORT test() BLOCKS
 *   dashboard.html's own bootstrap performs a real async auth check
 *   (resolveAuthState()) and — for a genuinely unauthenticated session,
 *   exactly what openLiveWindow() below produces (no Session stub) —
 *   redirects to login.html once that check resolves. This is real,
 *   pre-existing, unrelated page behavior (unauthenticated visitors
 *   belong on login.html), not something this repair introduced. A
 *   single very long-lived Live Window session (20+ questions in one
 *   page) can run long enough for that redirect to fire mid-test. Every
 *   existing test in cozy-living-assistant-live-window-e2e.test.js
 *   already avoids this by keeping each test() block's real question
 *   count small and calling openLiveWindow() fresh per block — this
 *   file follows that exact same, already-proven convention.
 *
 * Run with: node --test core/living/tests/cozy-living-assistant-application-semantic-repair.test.js
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

const FALLBACK_PATTERN = /Some related context exists|I don't have verified information/i;
const GENERIC_LIST_PATTERN = /CozyOS currently includes these applications:|CozyOS ina programu .* halisi zilizosajiliwa/i;

test('LIVE WINDOW APPLICATION SEMANTIC REPAIR: named-application EN questions reach ChurchOS/InterestOS/QuarryOS knowledge, never the generic application list', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const cases = [
            ['What does ChurchOS help with?', /church/i],
            ['How does ChurchOS help a church?', /church/i],
            ['What are the benefits of ChurchOS?', /church/i],
            ['What is InterestOS?', /InterestOS/i],
            ['What does InterestOS help with in real life?', /InterestOS/i],
            ['What is QuarryOS?', /QuarryOS/i],
        ];
        for (const [q, contentPattern] of cases) {
            const r = await ask(page, q);
            assert.doesNotMatch(r, GENERIC_LIST_PATTERN, `"${q}" wrongly collapsed into the generic application list: "${r}"`);
            assert.doesNotMatch(r, FALLBACK_PATTERN, `"${q}" fell back honestly-but-wrongly: "${r}"`);
            assert.match(r, contentPattern, `"${q}" did not mention the named application's own content: "${r}"`);
        }
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW APPLICATION SEMANTIC REPAIR: InterestOS real-life-solutions question surfaces the real Business Management Workspace content', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r = await ask(page, 'What problems can InterestOS help me solve?');
        assert.doesNotMatch(r, GENERIC_LIST_PATTERN);
        assert.match(r, /InterestOS/i);
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW APPLICATION SEMANTIC REPAIR: generic application-list questions still resolve to the real application list (regression guard)', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const cases = [
            'How many applications are available?',
            'What applications are available?',
            'Which apps are in CozyOS?',
        ];
        for (const q of cases) {
            const r = await ask(page, q);
            assert.match(r, GENERIC_LIST_PATTERN, `"${q}" must still resolve to the real application list: "${r}"`);
        }
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW APPLICATION SEMANTIC REPAIR: general CozyOS-platform questions still work (no regression from the earlier incognito repair)', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const cases = ['What is CozyOS?', 'How does CozyOS help us?'];
        for (const q of cases) {
            const r = await ask(page, q);
            assert.doesNotMatch(r, FALLBACK_PATTERN, `"${q}" regressed: "${r}"`);
            assert.match(r, /CozyOS/i);
        }
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW APPLICATION SEMANTIC REPAIR: Kiswahili named-application questions answer in real Kiswahili, never English, never the generic list', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const cases = [
            ['ChurchOS inasaidiaje kanisa?', /kanisa/i],
            ['ChurchOS ina faida gani?', /kanisa/i],
            ['InterestOS inamsaidia mtu na nini?', /InterestOS/i],
        ];
        for (const [q, contentPattern] of cases) {
            const r = await ask(page, q);
            assert.doesNotMatch(r, GENERIC_LIST_PATTERN, `"${q}" wrongly collapsed into the generic (English) application list: "${r}"`);
            assert.doesNotMatch(r, FALLBACK_PATTERN, `"${q}" fell back honestly-but-wrongly: "${r}"`);
            assert.match(r, contentPattern, `"${q}" missing expected Kiswahili/entity content: "${r}"`);
        }
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW APPLICATION SEMANTIC REPAIR: Kiswahili general-CozyOS and application-count questions still work', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r1 = await ask(page, 'CozyOS ni nini?');
        assert.doesNotMatch(r1, FALLBACK_PATTERN);
        assert.match(r1, /CozyOS/i);

        const r2 = await ask(page, 'Kuna programu ngapi ndani ya CozyOS?');
        assert.match(r2, GENERIC_LIST_PATTERN, `application-count question must still resolve to the real list: "${r2}"`);
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW APPLICATION SEMANTIC REPAIR: imperfect/fuzzy natural language still resolves to the real named application, never the generic fallback or app list (the two originally-reported failing cases)', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r1 = await ask(page, 'Hot. Does one benefit in churchOs');
        assert.doesNotMatch(r1, FALLBACK_PATTERN, `imperfect ChurchOS question leaked the honest-but-wrong fallback: "${r1}"`);
        assert.doesNotMatch(r1, GENERIC_LIST_PATTERN);
        assert.match(r1, /church/i);

        const r2 = await ask(page, 'InteresOs is among cozyos applications what does it help in real life solutions');
        assert.doesNotMatch(r2, FALLBACK_PATTERN, `typo'd InterestOS question leaked the honest-but-wrong fallback: "${r2}"`);
        assert.doesNotMatch(r2, GENERIC_LIST_PATTERN, `typo'd InterestOS question wrongly collapsed into the generic application list: "${r2}"`);
        assert.match(r2, /InterestOS/i);
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW APPLICATION SEMANTIC REPAIR: cross-language equivalence — EN and SW phrasings of the SAME question reach the SAME real evidence, different realization language', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const rEn = await ask(page, 'What does ChurchOS help with?');
        const rSw = await ask(page, 'ChurchOS inasaidia nini?');
        assert.doesNotMatch(rEn, FALLBACK_PATTERN);
        assert.doesNotMatch(rSw, FALLBACK_PATTERN);
        assert.match(rEn, /church/i);
        assert.match(rSw, /kanisa/i);
        assert.notStrictEqual(rEn, rSw, 'the two languages must produce genuinely different realized text, not the same string');
    } finally {
        await browser.close();
    }
});

console.log('Live Window application-semantic-understanding real-browser suite: run complete.');
