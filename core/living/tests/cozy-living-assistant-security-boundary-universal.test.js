'use strict';

/**
 * core/living/tests/cozy-living-assistant-security-boundary-universal.test.js
 * HUMAN-FIRST SECURITY BOUNDARY — universality fix.
 *
 * Real, traced gap: window.CozyOS.AnswerSecurityBoundary (SA-8 Phase 3)
 * was applied only inside cozy-answer-engine.js's own answer() wrapper.
 * cozy-living-assistant.js's OWN fallback text paths (the rule-based-
 * provider reply, the unknown-request fallback, the image/OCR reply)
 * never passed through it. #addMessage() is the real, single point
 * every one of those paths converges through before reaching the DOM
 * and VoiceManager — this fix sanitizes there, once.
 *
 * Part 1: sanitizeForUser() unit-level behavior (composes the real
 * boundary, degrades honestly when it isn't loaded).
 * Part 2: real browser proof, using this session's own Phase 5 word-
 * meaning teaching feature as the vehicle — teaching a claim that
 * itself contains a real file-path/function-call pattern proves the
 * text is redacted on its way to the visible DOM, regardless of which
 * internal path produced it.
 *
 * Run with: node --test core/living/tests/cozy-living-assistant-security-boundary-universal.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { resolveLaunchOptions } = require('../../../server/webauthn-rp/test/browser-launch');
const { sanitizeForUser } = require('../cozy-living-assistant.js');

// ---- Part 1: sanitizeForUser() unit behavior ----

test('sanitizeForUser() composes the real window.CozyOS.AnswerSecurityBoundary when loaded', () => {
    global.window = {
        CozyOS: {
            AnswerSecurityBoundary: {
                sanitize(text) { return text.replace('SECRET', '[redacted]'); }
            }
        }
    };
    assert.equal(sanitizeForUser('this has a SECRET in it'), 'this has a [redacted] in it');
    delete global.window;
});

test('sanitizeForUser() degrades honestly (returns text unchanged) when the boundary is not loaded', () => {
    global.window = { CozyOS: {} };
    assert.equal(sanitizeForUser('plain text'), 'plain text');
    delete global.window;
});

test('sanitizeForUser() is a safe no-op on non-string input', () => {
    assert.equal(sanitizeForUser(null), null);
    assert.equal(sanitizeForUser(undefined), undefined);
    assert.equal(sanitizeForUser(''), '');
});

// ---- Part 2: real browser proof ----

const DASHBOARD_HTML = 'file://' + path.resolve(__dirname, '..', '..', '..', 'dashboard.html');

async function openLiveWindow(actorId) {
    const browser = await chromium.launch(resolveLaunchOptions({ headless: true }));
    const page = await browser.newPage();
    await page.goto(DASHBOARD_HTML, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('#cozy-living-assistant-btn', { timeout: 15000 });
    await page.evaluate((uid) => { window.CozyOS.Session = { current: () => ({ uid }) }; }, actorId);
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

test('REAL BROWSER: a taught claim containing a real file-path/function-call pattern is redacted before it ever reaches the visible DOM, via the universal #addMessage() checkpoint', async () => {
    const actorId = 'security-universal-' + Date.now();
    const { browser, page } = await openLiveWindow(actorId);
    try {
        const term = 'leaktest' + Date.now();
        const r1 = await ask(page, `remember that ${term} means see cozy-answer-engine.js's searchByPersonReference() for details`);
        assert.match(r1, /Is that correct/i);
        await ask(page, 'yes');

        const r3 = await ask(page, `what does ${term} mean?`);
        assert.doesNotMatch(r3, /\.js\b/i, `expected no filename leak, got: ${r3}`);
        assert.doesNotMatch(r3, /searchByPersonReference\(\)/i, `expected no function-call leak, got: ${r3}`);
        assert.match(r3, /details/i, 'expected the surrounding, non-sensitive text to remain intact');
    } finally {
        await browser.close();
    }
});

test('REAL BROWSER: an ordinary, already-clean reply is completely unaffected by the new universal sanitize checkpoint (no false-positive redaction)', async () => {
    const actorId = 'security-universal-clean-' + Date.now();
    const { browser, page } = await openLiveWindow(actorId);
    try {
        const r1 = await ask(page, 'What does ChurchOS do?');
        assert.match(r1, /church/i);
        assert.doesNotMatch(r1, /\.js\b|\.html\b|\.css\b/i);
    } finally {
        await browser.close();
    }
});
