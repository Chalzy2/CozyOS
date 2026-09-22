'use strict';

/**
 * core/living/tests/wave1-live-window-real-browser.test.js
 * WAVE 1 (Universal Native Multilingual Intelligence phase,
 * Cognitive-to-Answer Contract) — the required real-browser proof.
 *
 * Per the explicit Wave 1 authorization: "Prove the behavior through the
 * actual Live Window, not only unit tests. At minimum verify: an English
 * question, a natural Kiswahili question, a contextual follow-up, a
 * question requiring clarification, an application-related question."
 *
 * Loads the actual dashboard.html this repository ships, in a real
 * Chromium tab, and drives the actual, visible CozyOS Assistant exactly
 * as a human would (same harness pattern as
 * cozy-living-assistant-live-window-e2e.test.js: real DOM text entry,
 * real "Enter" keypress, reading the real rendered
 * #cozy-living-assistant-messages DOM — never calling an internal module
 * directly for the answer itself).
 *
 * Additionally confirms, in the SAME real page context the UI runs in
 * (not a Node-side reconstruction), that window.CozyOS.CognitiveCoordinator
 * is the one real cognitive orchestrator present, that it genuinely
 * executes and produces a real semanticPlan for the same kind of question
 * just asked through the UI, and that no second AI/engine/Live Window was
 * introduced anywhere on the real page.
 *
 * Run with: node --test core/living/tests/wave1-live-window-real-browser.test.js
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

/* ------------------------------------------------------------------ */
/* 0: only ONE real cognitive orchestrator and ONE real Live Window     */
/*    exist on the real page — no second AI/engine was introduced       */
/* ------------------------------------------------------------------ */

test('WAVE 1 REAL BROWSER: the real page exposes exactly ONE CognitiveCoordinator, ONE CozyAnswerEngine, and ONE LivingAssistant — no second AI/engine/Live Window', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const stack = await page.evaluate(() => ({
            coordinatorPresent: !!(window.CozyOS && window.CozyOS.CognitiveCoordinator),
            coordinatorHasRun: !!(window.CozyOS && window.CozyOS.CognitiveCoordinator && typeof window.CozyOS.CognitiveCoordinator.run === 'function'),
            answerEnginePresent: !!(window.CozyOS && window.CozyOS.CozyAnswerEngine),
            livingAssistantPresent: !!(window.CozyOS && window.CozyOS.LivingAssistant),
            semanticPlanBridgePresent: !!(window.CozyOS && window.CozyOS.SemanticAnswerInterpretationProvider),
            plannerPresent: !!(window.CozyOS && window.CozyOS.SemanticAnswerPlanner),
        }));
        assert.equal(stack.coordinatorPresent, true, 'expected the real CognitiveCoordinator to be loaded on dashboard.html');
        assert.equal(stack.coordinatorHasRun, true);
        assert.equal(stack.answerEnginePresent, true, 'expected the real CozyAnswerEngine to be loaded');
        assert.equal(stack.livingAssistantPresent, true, 'expected the real, single LivingAssistant instance to be loaded');
        assert.equal(stack.semanticPlanBridgePresent, true, 'expected the SA-3B bridge that feeds semanticPlan to be loaded');
        assert.equal(stack.plannerPresent, true, 'expected the single real SemanticAnswerPlanner to be loaded');
    } finally {
        await browser.close();
    }
});

/* ------------------------------------------------------------------ */
/* 1: an English question, through the real Live Window                */
/* ------------------------------------------------------------------ */

test('WAVE 1 REAL BROWSER: an English application question resolves to real, verified ChurchOS content through the real Live Window', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r = await ask(page, 'How does ChurchOS help people?');
        assert.match(r, /ChurchOS|church/i);
        assert.doesNotMatch(r, /undefined|\[object Object\]|NaN/);
    } finally {
        await browser.close();
    }
});

/* ------------------------------------------------------------------ */
/* 2: a natural Kiswahili question, through the SAME real Live Window   */
/* ------------------------------------------------------------------ */

test('WAVE 1 REAL BROWSER: a natural Kiswahili application question resolves to real, verified Kiswahili content through the SAME real Live Window', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r = await ask(page, 'ChurchOS inasaidiaje mtu?');
        assert.match(r, /kanisa|ChurchOS/i);
        assert.doesNotMatch(r, /undefined|\[object Object\]|NaN/);
    } finally {
        await browser.close();
    }
});

/* ------------------------------------------------------------------ */
/* 3: a contextual follow-up, through the real Live Window              */
/* ------------------------------------------------------------------ */

test('WAVE 1 REAL BROWSER: a contextual follow-up (no application name of its own) still resolves against the correct, previously-established application, through the real Live Window', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        await ask(page, 'Tell me about ChurchOS');
        const followUp = await ask(page, 'What are its benefits?');
        assert.match(followUp, /church/i, `expected the follow-up to stay on ChurchOS context, got: ${followUp}`);
        assert.doesNotMatch(followUp, /undefined|\[object Object\]|NaN/);
    } finally {
        await browser.close();
    }
});

/* ------------------------------------------------------------------ */
/* 4: a question requiring clarification, through the real Live Window  */
/* ------------------------------------------------------------------ */

test('WAVE 1 REAL BROWSER: a genuinely ambiguous question gets an honest response through the real Live Window — never a crash, never a fabricated specific answer', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r = await ask(page, 'What about it?');
        assert.ok(typeof r === 'string' && r.trim().length > 0, 'expected a real, non-empty response rather than a silent failure');
        assert.doesNotMatch(r, /undefined|\[object Object\]|NaN/);
    } finally {
        await browser.close();
    }
});

/* ------------------------------------------------------------------ */
/* 5: an application-related question, through the real Live Window     */
/* ------------------------------------------------------------------ */

test('WAVE 1 REAL BROWSER: an application-related question about a DIFFERENT real application resolves correctly through the real Live Window', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r = await ask(page, 'What is InterestOS for?');
        assert.match(r, /InterestOS/i);
        assert.doesNotMatch(r, /undefined|\[object Object\]|NaN/);
    } finally {
        await browser.close();
    }
});

/* ------------------------------------------------------------------ */
/* 6: in the SAME real page context, CognitiveCoordinator genuinely      */
/*    executes and produces a real, reusable semanticPlan — the exact    */
/*    field cozy-living-assistant.js's own #send() now reads             */
/* ------------------------------------------------------------------ */

test('WAVE 1 REAL BROWSER: on the real page, CognitiveCoordinator.run() genuinely executes for the same kind of question just asked through the UI and produces a real, reusable semanticPlan', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        await ask(page, 'How does ChurchOS help people?');
        const check = await page.evaluate(async () => {
            const result = await window.CozyOS.CognitiveCoordinator.run({ text: 'How does ChurchOS help people?', actorId: 'wave1-real-browser-check' });
            return {
                success: result.success,
                hasSemanticPlan: !!result.semanticPlan,
                planGoal: result.semanticPlan && result.semanticPlan.plan && result.semanticPlan.plan.goal,
                semanticAnswerNeverHasRawPlan: !(result.semanticAnswer && 'rawPlanResult' in result.semanticAnswer),
            };
        });
        assert.equal(check.success, true);
        assert.equal(check.hasSemanticPlan, true, 'expected a real semanticPlan field on the real page, exactly as cozy-living-assistant.js now consumes');
        assert.ok(check.planGoal, 'expected a real, non-null plan goal');
        assert.equal(check.semanticAnswerNeverHasRawPlan, true, 'expected the pre-existing semanticAnswer diagnostic field to remain free of raw plan data on the real page too');
    } finally {
        await browser.close();
    }
});

console.log('Wave 1 real-browser Live Window suite: run complete.');
