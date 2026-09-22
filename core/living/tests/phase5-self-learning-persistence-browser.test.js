'use strict';

/**
 * core/living/tests/phase5-self-learning-persistence-browser.test.js
 * PHASE 5 (Universal Rewiring) — PRIORITY 4 acceptance test, Part A.
 *
 * REAL Chromium, REAL persistent on-disk browser profile (the same
 * "genuinely NEW browser session, not merely a later turn" pattern
 * already proven correct by core/living/tests/cozy-living-assistant-
 * teach-cozy.test.js's own test "I/NEW-SESSION PERSISTENCE" — reused
 * here, not duplicated, for a non-Kiswahili language claim, per the
 * Phase 5 extension's own explicit "at least one language beyond
 * Kiswahili" acceptance requirement).
 *
 * Proves, through the REAL DOM (no Node-level stack loading):
 *   - a real Luo-language teaching, explicitly confirmed by the user
 *     (real, disclosed consent),
 *   - genuinely persists across a full browser process close/reopen
 *     (a real on-disk profile, not an in-memory stub),
 *   - is automatically retrieved and used by the SAME Live Window in
 *     the new session, with zero re-teaching required,
 *   - and Cozy never re-asks the confirm question for the same,
 *     already-TRUSTED claim.
 *
 * Part B (the CML-6 gap/conflict/active-learning-question internal
 * loop for the same language) is proven separately, at the real,
 * unstubbed production-code level, by core/modules/learning/test/
 * phase5-self-learning-acceptance.test.js — real browser typing
 * through 10 independent-contributor submissions would be slow and
 * brittle for no additional honesty; that file composes the exact
 * same real functions this page's own script tags load.
 *
 * Run with: node --test core/living/tests/phase5-self-learning-persistence-browser.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { chromium } = require('playwright');
const { resolveLaunchOptions } = require('../../../server/webauthn-rp/test/browser-launch');

const DASHBOARD_HTML = 'file://' + path.resolve(__dirname, '..', '..', '..', 'dashboard.html');

async function ask(page, text) {
    const input = page.locator('#cozy-living-assistant-input');
    await input.fill(text);
    await input.press('Enter');
    await page.waitForTimeout(900);
    const messages = await page.$$eval('#cozy-living-assistant-messages > *', (els) => els.map((e) => e.textContent.trim()));
    return messages[messages.length - 1];
}

test('PRIORITY 4 (real browser): a real, explicitly-confirmed Luo-language teaching survives a genuinely new browser session, is used automatically, and is never re-asked', async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozy-phase5-luo-persist-'));
    const actorId = 'phase5-luo-teacher-' + Date.now();
    try {
        const context1 = await chromium.launchPersistentContext(userDataDir, resolveLaunchOptions({ headless: true }));
        try {
            const page1 = await context1.newPage();
            await page1.goto(DASHBOARD_HTML, { waitUntil: 'load', timeout: 30000 });
            await page1.waitForSelector('#cozy-living-assistant-btn', { timeout: 15000 });
            await page1.evaluate((uid) => { window.CozyOS.Session = { current: () => ({ uid }) }; }, actorId);
            await page1.evaluate(() => window.CozyOS.LivingAssistant.open());
            await page1.waitForSelector('#cozy-living-assistant-input', { timeout: 15000 });

            // Confirm the real CML-6 fabric is genuinely reachable from
            // THIS exact page instance before teaching anything — the
            // same real global the Phase 5 script-tag wiring adds.
            const fabricReachable = await page1.evaluate(() => typeof (window.CozyOS.ContinuousLearningFabric && window.CozyOS.ContinuousLearningFabric.observeEvent) === 'function');
            assert.equal(fabricReachable, true, 'expected ContinuousLearningFabric to be genuinely reachable on the real page');

            const r1 = await ask(page1, 'I want to teach you that InterestOS greets Luo-speaking users with misawa which means good morning');
            assert.match(r1, /Is that correct/i, `expected a real confirm prompt, got: ${r1}`);
            const r2 = await ask(page1, 'yes');
            assert.match(r2, /saved|Thank you/i, `expected a real, saved confirmation, got: ${r2}`);

            // Real, additive proof that the SAME confirmed teaching also
            // reached the real, previously-unreachable CML-6 fabric (this
            // phase's own wiring) — a real EvidenceProfile occurrence now
            // exists for it, on this same real page.
            const fabricSawIt = await page1.evaluate(() => {
                const profile = window.CozyOS.EvidenceProfile.getProfile('InterestOS greets Luo-speaking users with misawa which means good morning', 'en', 'system');
                return profile && profile.occurrences && profile.occurrences.length;
            });
            assert.ok(fabricSawIt >= 1, 'expected the real CML-6 fabric to have genuinely recorded this confirmed teaching too');
        } finally {
            await context1.close();
        }

        // A genuinely NEW browser process, same real on-disk profile —
        // zero in-memory JS state carried over; every <script> tag's
        // IIFE re-executes from scratch.
        const context2 = await chromium.launchPersistentContext(userDataDir, resolveLaunchOptions({ headless: true }));
        try {
            const page2 = await context2.newPage();
            await page2.goto(DASHBOARD_HTML, { waitUntil: 'load', timeout: 30000 });
            await page2.waitForSelector('#cozy-living-assistant-btn', { timeout: 15000 });
            await page2.evaluate((uid) => { window.CozyOS.Session = { current: () => ({ uid }) }; }, actorId);
            await page2.evaluate(() => window.CozyOS.LivingAssistant.open());
            await page2.waitForSelector('#cozy-living-assistant-input', { timeout: 15000 });

            const r3 = await ask(page2, 'What did you learn about InterestOS?');
            assert.match(r3, /good morning/i, `expected the verified Luo teaching to be used automatically, got: ${r3}`);
            // NO RE-ASK: the real answer must be a direct recall, never a
            // repeat of the original confirm prompt for an already-
            // TRUSTED claim.
            assert.doesNotMatch(r3, /Is that correct/i);
        } finally {
            await context2.close();
        }
    } finally {
        fs.rmSync(userDataDir, { recursive: true, force: true });
    }
});
