'use strict';

/**
 * core/modules/intelligence/answer/tests/cozy-answer-engine-fresh-construction-browser.test.js
 *
 * SA-8 Phase 2 (Fresh Generative Sentence Construction). REAL LIVE WINDOW
 * end-to-end on the real dashboard.html — same discipline as this
 * repository's other real-browser Live Window suites (see
 * cozy-answer-engine-clarification-intelligence-browser.test.js, SA-8
 * Phase 1). Every assertion here was first confirmed empirically against
 * the real page before being written (see this phase's own probe
 * transcripts) — this file locks that verified behavior in, it does not
 * guess at it.
 *
 * Run with: node --test core/modules/intelligence/answer/tests/cozy-answer-engine-fresh-construction-browser.test.js
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
        if (!vm.__patchedForFreshConstructionTest) {
            vm.__patchedForFreshConstructionTest = true;
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

// ---------- novel human-benefit questions: real, evidence-grounded construction ----------

test('LIVE WINDOW E2E: a genuinely novel Kiswahili human-benefit question ("...kama tuna waumini wengi na matawi kadhaa?") receives the real, SA-3/SA-4-constructed grounded answer, not clarification and not a generic fallback', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'ChurchOS inaweza kunisaidiaje kama tuna waumini wengi na matawi kadhaa?');
        assert.ok(reply.startsWith('Hivi ndivyo ChurchOS inavyosaidia:'), 'expected the real SA-4 COMPOSED sentence opener, got: ' + reply);
        assert.ok(!reply.includes("I don't have verified information"));
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: the English equivalent ("How could ChurchOS help a church with many members?") receives the real English-language construction, proving the fix is universal, not Kiswahili-only', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'How could ChurchOS help a church with many members?');
        assert.ok(reply.startsWith("Here's how ChurchOS helps:"), 'expected the real SA-4 COMPOSED English sentence opener, got: ' + reply);
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: a code-switched question ("...kwa attendance ya branches zetu?", Kiswahili carrying English loanwords) still resolves via the real construction path, in Kiswahili', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'ChurchOS inaweza kusaidiaje kwa attendance ya branches zetu?');
        assert.ok(reply.startsWith('Hivi ndivyo ChurchOS inavyosaidia:'), 'expected the real Kiswahili construction, got: ' + reply);
    } finally {
        await browser.close();
    }
});

// ---------- conversation context: continuity and switching, reusing the existing architecture only ----------

test('LIVE WINDOW E2E: subject continuity — "Niambie kuhusu ChurchOS." then "Na kwa kanisa lenye matawi mengi?" stays on ChurchOS, never silently switching entity', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply1 = await ask(page, 'Niambie kuhusu ChurchOS.');
        assert.ok(reply1.includes('ChurchOS'));
        const reply2 = await ask(page, 'Na kwa kanisa lenye matawi mengi?');
        assert.ok(reply2.includes('ChurchOS'), 'follow-up must stay on the same, previously-discussed entity: ' + reply2);
        assert.ok(!reply2.includes('QuarryOS') && !reply2.includes('InterestOS'), 'must never drift to an unrelated application: ' + reply2);
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: context switching + bare pronoun-less follow-up — "Niambie kuhusu ChurchOS." -> "Na QuarryOS je?" -> "Inaweza kusaidiaje?" ends up answering about QuarryOS specifically, via the real construction path, using QuarryOS-specific evidence', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply1 = await ask(page, 'Niambie kuhusu ChurchOS.');
        assert.ok(reply1.includes('ChurchOS'));
        const reply2 = await ask(page, 'Na QuarryOS je?');
        assert.ok(reply2.includes('QuarryOS'), 'must switch to the newly-named entity: ' + reply2);
        const reply3 = await ask(page, 'Inaweza kusaidiaje?');
        assert.ok(reply3.startsWith('Hivi ndivyo QuarryOS inavyosaidia:'), 'the bare follow-up must resolve to QuarryOS (the most recently discussed entity), not ChurchOS, and must engage the real construction path: ' + reply3);
        assert.ok(!reply3.includes('ChurchOS'), 'must not blend in the earlier entity: ' + reply3);
    } finally {
        await browser.close();
    }
});

// ---------- non-fabrication: an adversarial "can it already do X" for an unimplemented X ----------

test('LIVE WINDOW E2E NON-FABRICATION: asking whether ChurchOS can already automatically recognize the same person by face across videos never claims that capability exists — the real, honest "does not implement" disclosure is preserved, never silently dropped', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'Can ChurchOS already automatically recognize the same person by face across different videos?');
        assert.ok(reply.includes('does not implement'), 'expected the real, honest disclosure that face/voice recognition is not implemented, got: ' + reply);
        assert.ok(!/\byes\b.*\bface\b/i.test(reply), 'must never affirmatively claim face-recognition capability: ' + reply);
    } finally {
        await browser.close();
    }
});

// ---------- deterministic command must never be routed to generation merely because generation is available ----------

test('LIVE WINDOW E2E CRITICAL: "remind me tomorrow" is a real ACTION-shaped request — the fresh-construction path must decline it (proven at the unit level: ACTION_NOT_PLANNABLE_BY_SA3), so whatever this page\'s own existing handling for it is remains exactly what runs, never a fabricated HUMAN_BENEFIT-shaped answer manufactured just because construction is available', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'remind me tomorrow');
        assert.ok(!reply.startsWith("Here's how") && !reply.startsWith('Hivi ndivyo'), 'a real action request must never be answered with a fresh-construction HUMAN_BENEFIT/PRACTICAL_WORK_CONTRIBUTION sentence: ' + reply);
    } finally {
        await browser.close();
    }
});

// ---------- voice synchronization: the exact same final text reaches VoiceManager ----------

test('LIVE WINDOW E2E: a fresh, novel construction\'s exact final text reaches VoiceManager via the existing, unmodified #speak() chain — no second voice pipeline', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        await instrumentVoice(page);
        const reply = await ask(page, 'ChurchOS inaweza kunisaidiaje kama tuna waumini wengi na matawi kadhaa?');
        const calls = await page.evaluate(() => window.__voiceSpeakCalls.map((c) => c.text));
        assert.ok(calls.some((t) => t === reply), 'the exact same resolved fresh-construction text must reach VoiceManager: ' + JSON.stringify(calls));
    } finally {
        await browser.close();
    }
});
