'use strict';

/**
 * core/living/tests/cozy-living-assistant-reciprocal-learning.test.js
 *
 * PHASE 4 — Universal Language Capability: real Live Window proof of
 * the exact scenario your spec names (Michael Onyango / Luo / Kikuyu).
 * Seeds real data via the real IdentityEngine/CozyLanguagePacks APIs
 * (never a mock), then types into the real, rendered
 * #cozy-living-assistant-input and reads the real rendered reply.
 *
 * Run with: node --test core/living/tests/cozy-living-assistant-reciprocal-learning.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { resolveLaunchOptions } = require('../../../server/webauthn-rp/test/browser-launch');

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

test('MICHAEL ONYANGO SCENARIO: reciprocal learning through the real Live Window — never asks about an already-VERIFIED Luo concept, correctly asks about a genuine PARTIAL gap', async () => {
    const actorId = 'michael-onyango-' + Date.now();
    const { browser, page } = await openLiveWindow(actorId);
    try {
        // Real, existing APIs only — no mocking.
        await page.evaluate((uid) => {
            const IE = window.CozyOS.IdentityEngine;
            const identity = IE.getUser ? IE : null; // real engine, already loaded
            return null;
        }, actorId);

        // Register a real user via the real registration flow, then seed
        // the real Profile languageRoles + real language-pack evidence.
        const seeded = await page.evaluate(async (uid) => {
            const IE = window.CozyOS.IdentityEngine;
            const reg = await IE.register({
                accountType: 'user', firstName: 'Michael', lastName: 'Onyango',
                username: 'michael_' + Date.now(), email: 'michael' + Date.now() + '@example.com',
                phone: '+254700000123', password: 'Str0ng!Passw0rd', confirmPassword: 'Str0ng!Passw0rd', acceptTerms: true
            });
            const realActorId = reg.userId;

            await IE.updateProfile(realActorId, {
                languageRoles: [
                    { language: 'luo', roles: ['NATIVE', 'FLUENT', 'CONTRIBUTOR'], consent: true },
                    { language: 'ki', roles: ['LEARNING'] }
                ]
            });

            const packs = window.CozyOS.CozyLanguagePacks;
            // Strong (VERIFIED-band) evidence for "erokamano" — must
            // NEVER be the concept Cozy asks Michael about.
            for (let i = 0; i < 20; i++) {
                packs.submitExpression({ languageId: 'luo', expression: 'erokamano', meaning: 'thank you', sourceType: 'COMMUNITY', contributorPseudonym: 'c' + i });
            }
            // Weak (PARTIAL-band) evidence for a real gap — this is the
            // one Cozy should genuinely ask about.
            packs.submitExpression({ languageId: 'luo', expression: 'oyawore-nade-gap', meaning: 'informal response to a greeting', sourceType: 'COMMUNITY' });

            return realActorId;
        }, actorId);

        // Re-point the Live Window's session to the REAL registered actorId.
        await page.evaluate((uid) => { window.CozyOS.Session = { current: () => ({ uid }) }; }, seeded);

        const reply = await ask(page, 'I want to learn Kikuyu');

        // Honest acknowledgment — never claims full fluency.
        assert.match(reply, /Kikuyu/);
        assert.doesNotMatch(reply, /fully fluent|complete support/i);

        // The reciprocal invitation names the real PARTIAL gap...
        assert.match(reply, /oyawore-nade-gap/);
        // ...and NEVER the already-VERIFIED concept.
        assert.doesNotMatch(reply, /erokamano/);
    } finally {
        await browser.close();
    }
});

test('NO-OP: a plain question with no learning-intent marker never triggers the reciprocal flow', async () => {
    const { browser, page } = await openLiveWindow('reciprocal-noop-' + Date.now());
    try {
        const reply = await ask(page, 'What is CozyOS?');
        // Real, existing CozyOS mission text legitimately contains the
        // word "contributors" — assert against the actual feature output
        // (the reciprocal-invitation template's own fixed phrasing)
        // instead of a generic word.
        assert.doesNotMatch(reply, /since your profile shows|Is that correct\? \(yes\/no\)|teaching mode/i);
    } finally {
        await browser.close();
    }
});
