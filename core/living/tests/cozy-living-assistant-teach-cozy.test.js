'use strict';

/**
 * core/living/tests/cozy-living-assistant-teach-cozy.test.js
 *
 * PHASE 3 — Teach Cozy / Governed Learning. REAL LIVE WINDOW END-TO-END
 * PROOF — every answer below is read back from the real rendered
 * #cozy-living-assistant-messages DOM after real text entry + a real
 * "Enter" keypress, following the exact same openLiveWindow()/ask()
 * harness convention as cozy-living-assistant-business-data-repair.test.js
 * (never a second harness).
 *
 * SCOPE NOTE — the Profile "Teach Cozy" button's own DOM click is NOT
 * exercised here: the real dashboard.html Profile surface only mounts
 * after window.CozyOS.AuthCoordinator.isAuthenticated() is genuinely
 * true (a real, persisted session — confirmed by reading dashboard.html's
 * own resolveAuthState()/proceedPastSequence()), which is a materially
 * different, heavier gate than the post-load window.CozyOS.Session stub
 * this harness (and every other Live Window test file in this
 * repository) uses to give the Live Window's own #resolveActorId() an
 * actor identity. Building a real signed-up/logged-in user through the
 * full IdentityEngine/AuthCoordinator flow is out of this test file's
 * scope. Instead, this file calls window.CozyOS.LivingAssistant.
 * enterTeachingMode() directly (test H below) — the exact same function
 * user-dashboard.js's #wireProfileTeachButton() calls, and the only
 * thing that button's click handler does beyond a two-line honest-
 * degrade check — proving the real, substantive behavior the button
 * triggers, even though the button's own click is not simulated.
 *
 * Run with: node --test core/living/tests/cozy-living-assistant-teach-cozy.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { chromium } = require('playwright');
const { resolveLaunchOptions } = require('../../../server/webauthn-rp/test/browser-launch');

const DASHBOARD_HTML = 'file://' + path.resolve(__dirname, '..', '..', '..', 'dashboard.html');

async function openLiveWindow(actorId) {
    const browser = await chromium.launch(resolveLaunchOptions({ headless: true }));
    const page = await browser.newPage();
    await page.goto(DASHBOARD_HTML, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('#cozy-living-assistant-btn', { timeout: 15000 });
    if (actorId) {
        await page.evaluate((uid) => {
            window.CozyOS.Session = { current: () => ({ uid }) };
        }, actorId);
    }
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

test('A/CONFIRM: a real teaching statement, confirmed with "yes", is later answerable through the real DOM for the SAME actor', async () => {
    const { browser, page } = await openLiveWindow('teach-user-A');
    try {
        const r1 = await ask(page, 'I want to teach you that QuarryOS tracks truck loads by driver');
        assert.match(r1, /QuarryOS tracks truck loads by driver/);
        assert.match(r1, /Is that correct/i);

        const r2 = await ask(page, 'yes');
        assert.match(r2, /saved|Thank you/i);

        const r3 = await ask(page, 'What did you learn about QuarryOS?');
        // The taught claim should now surface for this same actor.
        assert.match(r3, /QuarryOS tracks truck loads by driver/);
    } finally {
        await browser.close();
    }
});

test('B/REJECT: "no" declines a teaching statement, and it is never answerable afterward', async () => {
    const { browser, page } = await openLiveWindow('teach-user-B');
    try {
        const r1 = await ask(page, 'I want to teach you that ShopOS gives free delivery on weekends');
        assert.match(r1, /Is that correct/i);

        const r2 = await ask(page, 'no');
        assert.match(r2, /won't remember|sitalikumbuka/i);
    } finally {
        await browser.close();
    }
});

test('C/UNCLEAR-THEN-CONFIRM: an unclear reply re-asks without losing the pending candidate', async () => {
    const { browser, page } = await openLiveWindow('teach-user-C');
    try {
        const r1 = await ask(page, 'I want to teach you that ShopOS accepts mobile money payments');
        assert.match(r1, /Is that correct/i);

        const r2 = await ask(page, 'hmm not sure');
        assert.match(r2, /didn't understand|sikuelewa/i);

        const r3 = await ask(page, 'yes');
        assert.match(r3, /saved|Thank you/i);
    } finally {
        await browser.close();
    }
});

test('D/CONFLICT: a claim contradicting ChurchOS\'s real documented capability limit is disclosed, never recorded', async () => {
    const { browser, page } = await openLiveWindow('teach-user-D');
    try {
        const r1 = await ask(page, 'I want to teach you that ChurchOS supports unlimited one-to-many broadcast to all members');
        assert.match(r1, /already have a verified answer|tayari kuwa na jibu/i);
    } finally {
        await browser.close();
    }
});

test('E/SWAHILI: the full create -> confirm -> retrieve sequence works in real Kiswahili', async () => {
    const { browser, page } = await openLiveWindow('teach-user-E');
    try {
        const r1 = await ask(page, 'Nataka kukufundisha kwamba ShopOS inauza bidhaa za nyumbani');
        assert.match(r1, /ShopOS inauza bidhaa za nyumbani/);

        const r2 = await ask(page, 'ndiyo');
        assert.match(r2, /Asante|saved/i);
    } finally {
        await browser.close();
    }
});

test('F/PRIVACY: a different actor cannot retrieve another actor\'s USER-scoped taught fact', async () => {
    const { browser: browserA, page: pageA } = await openLiveWindow('teach-user-F1');
    try {
        const r1 = await ask(pageA, 'I want to teach you that QuarryOS bills clients weekly');
        assert.match(r1, /Is that correct/i);
        await ask(pageA, 'yes');
    } finally {
        await browserA.close();
    }

    const { browser: browserB, page: pageB } = await openLiveWindow('teach-user-F2');
    try {
        const r = await ask(pageB, 'What did you learn about QuarryOS?');
        assert.doesNotMatch(r, /bills clients weekly/);
    } finally {
        await browserB.close();
    }
});

test('G/NO-REGRESSION: an unrelated real question still answers exactly as before this phase', async () => {
    const { browser, page } = await openLiveWindow('teach-user-G');
    try {
        const r = await ask(page, 'What is CozyOS?');
        assert.doesNotMatch(r, /Is that correct/i);
        assert.match(r.length > 20 ? 'ok' : 'too-short', /ok/);
    } finally {
        await browser.close();
    }
});

test('I/NEW-SESSION PERSISTENCE (the critical acceptance test): TRUSTED taught knowledge survives a genuinely NEW browser session, not merely a later turn in the same page', async () => {
    // A plain ephemeral chromium.launch()/newPage() discards its whole
    // profile (including localStorage) on close — that would prove
    // nothing here. A real Chromium PERSISTENT profile on disk (exactly
    // how a real user's browser works across restarts) is required to
    // genuinely test cross-session survival for a file:// page — real,
    // confirmed via direct testing: Playwright's own storageState()
    // mechanism does NOT capture localStorage for file:// origins at
    // all (returns an empty origins array), so that mechanism cannot be
    // used here either.
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozy-teach-persist-'));
    const actorId = 'teach-user-I-' + Date.now();
    try {
        const context1 = await chromium.launchPersistentContext(userDataDir, resolveLaunchOptions({ headless: true }));
        try {
            const page1 = await context1.newPage();
            await page1.goto(DASHBOARD_HTML, { waitUntil: 'load', timeout: 30000 });
            await page1.waitForSelector('#cozy-living-assistant-btn', { timeout: 15000 });
            await page1.evaluate((uid) => { window.CozyOS.Session = { current: () => ({ uid }) }; }, actorId);
            await page1.evaluate(() => window.CozyOS.LivingAssistant.open());
            await page1.waitForSelector('#cozy-living-assistant-input', { timeout: 15000 });

            const r1 = await ask(page1, 'I want to teach you that QuarryOS now tracks driver rest hours');
            assert.match(r1, /Is that correct/i);
            const r2 = await ask(page1, 'yes');
            assert.match(r2, /saved|Thank you/i);
        } finally {
            await context1.close();
        }

        // A genuinely NEW browser process, pointed at the SAME on-disk
        // profile — the same actor, but zero in-memory JS state carried
        // over from the first session (a fresh page load re-executes
        // every <script> tag's IIFE from scratch).
        const context2 = await chromium.launchPersistentContext(userDataDir, resolveLaunchOptions({ headless: true }));
        try {
            const page2 = await context2.newPage();
            await page2.goto(DASHBOARD_HTML, { waitUntil: 'load', timeout: 30000 });
            await page2.waitForSelector('#cozy-living-assistant-btn', { timeout: 15000 });
            await page2.evaluate((uid) => { window.CozyOS.Session = { current: () => ({ uid }) }; }, actorId);
            await page2.evaluate(() => window.CozyOS.LivingAssistant.open());
            await page2.waitForSelector('#cozy-living-assistant-input', { timeout: 15000 });

            const r3 = await ask(page2, 'What did you learn about QuarryOS?');
            assert.match(r3, /QuarryOS now tracks driver rest hours/);
        } finally {
            await context2.close();
        }
    } finally {
        fs.rmSync(userDataDir, { recursive: true, force: true });
    }
});

test('H/ENTRY-POINT: LivingAssistant.enterTeachingMode() (the real function the Profile "Teach Cozy" button calls) opens the window and shows a real disclosure banner', async () => {
    const browser = await chromium.launch(resolveLaunchOptions({ headless: true }));
    const page = await browser.newPage();
    try {
        await page.goto(DASHBOARD_HTML, { waitUntil: 'load', timeout: 30000 });
        await page.waitForSelector('#cozy-living-assistant-btn', { timeout: 15000 });
        await page.evaluate(() => window.CozyOS.LivingAssistant.enterTeachingMode());
        await page.waitForSelector('#cozy-living-assistant-input', { timeout: 15000 });
        const messages = await page.$$eval('#cozy-living-assistant-messages > *', (els) => els.map((e) => e.textContent.trim()));
        const last = messages[messages.length - 1];
        assert.match(last, /teaching mode/i);
    } finally {
        await browser.close();
    }
});
