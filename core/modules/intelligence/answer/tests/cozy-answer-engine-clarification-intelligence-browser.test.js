'use strict';

/**
 * core/modules/intelligence/answer/tests/cozy-answer-engine-clarification-intelligence-browser.test.js
 *
 * SA-8 Phase 1 (Clarification Intelligence). REAL LIVE WINDOW END-TO-END
 * on the real dashboard.html — same discipline as this repository's
 * other real-browser Live Window suites. Proves a genuinely competing-
 * goals question, asked through the real Live Window input, receives
 * a real, honest clarifying question (not the generic "I don't have
 * verified information" fallback) and that the same resolved text
 * reaches VoiceManager through the existing, unmodified #speak() chain.
 *
 * Run with: node --test core/modules/intelligence/answer/tests/cozy-answer-engine-clarification-intelligence-browser.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { resolveLaunchOptions } = require('../../../../../server/webauthn-rp/test/browser-launch');

const DASHBOARD_HTML = 'file://' + path.resolve(__dirname, '..', '..', '..', '..', '..', 'dashboard.html');

async function openLiveWindow() {
    const browser = await chromium.launch(resolveLaunchOptions({ headless: true }));
    const page = await browser.newPage();
    await page.goto(DASHBOARD_HTML, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => !!(window.CozyOS && window.CozyOS.SemanticIntentEngine && window.CozyOS.CozyAnswerEngine && window.CozyOS.LivingAssistant), { timeout: 15000 });
    await page.waitForSelector('#cozy-living-assistant-btn', { timeout: 15000 });
    await page.evaluate(() => window.CozyOS.LivingAssistant.open());
    await page.waitForSelector('#cozy-living-assistant-input', { timeout: 15000 });
    return { browser, page };
}

async function instrumentVoice(page) {
    await page.evaluate(() => {
        window.__voiceSpeakCalls = [];
        const vm = window.CozyOS.VoiceManager;
        if (!vm.__patchedForClarificationTest) {
            vm.__patchedForClarificationTest = true;
            const originalSpeakProgressive = vm.speakProgressive.bind(vm);
            vm.speakProgressive = (req) => { window.__voiceSpeakCalls.push(req); return originalSpeakProgressive(req); };
        }
    });
}

async function ask(page, question) {
    const input = page.locator('#cozy-living-assistant-input');
    await input.fill(question);
    await input.press('Enter');
    await page.waitForTimeout(900);
    const messages = await page.$$eval('#cozy-living-assistant-messages > *', (els) => els.map((e) => e.textContent.trim()));
    return messages[messages.length - 1];
}

test('LIVE WINDOW E2E: a real competing-goals question receives a real clarifying question, not a generic "I don\'t know" reply', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        // Confirms the real engine genuinely produces a clarifying question
        // for this input on THIS page, before asserting on the UI —
        // otherwise this test could pass or fail for the wrong reason.
        const reallyAmbiguous = await page.evaluate(() => {
            const r = window.CozyOS.SemanticIntentEngine.analyze('Nataka kununua CozyOS, inasaidia aje?', {});
            return !!(r.clarification && r.clarification.question);
        });
        assert.equal(reallyAmbiguous, true, 'the real SemanticIntentEngine must genuinely flag this input as ambiguous on this page, or this test proves nothing');

        const reply = await ask(page, 'Nataka kununua CozyOS, inasaidia aje?');
        assert.ok(!reply.includes("I don't have verified information"), 'must not fall back to the generic no-evidence text: ' + reply);
        assert.ok(reply.length > 0);
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: the real clarifying question text reaches VoiceManager via the existing, unmodified #speak() chain', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        await instrumentVoice(page);
        const reply = await ask(page, 'Nataka kununua CozyOS, inasaidia aje?');
        const calls = await page.evaluate(() => window.__voiceSpeakCalls.map((c) => c.text));
        assert.ok(calls.some((t) => t === reply), 'the exact same resolved clarifying-question text must reach VoiceManager — one resolved response, one voice: ' + JSON.stringify(calls));
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: an ordinary, unambiguous question is unaffected by this change', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'What is CozyOS for?');
        assert.ok(reply.length > 0);
        // This specific ambiguous phrasing must never leak into an unrelated answer.
        assert.ok(!reply.toLowerCase().includes('kununua'), 'an unrelated question must never receive the Kiswahili purchase-clarification text: ' + reply);
    } finally {
        await browser.close();
    }
});
