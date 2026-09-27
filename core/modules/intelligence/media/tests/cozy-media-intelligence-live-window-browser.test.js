'use strict';

/**
 * core/modules/intelligence/media/tests/cozy-media-intelligence-live-window-browser.test.js
 *
 * Universal CozyOS Voice — Application Integration Matrix, Media
 * Intelligence row. REAL LIVE WINDOW END-TO-END on the real
 * dashboard.html — same discipline as this repository's other real-
 * browser Live Window suites.
 *
 * Proves, on the real page (not a fake/mocked chain):
 *   1. CozyMediaIntelligence's real composed engines are now actually
 *      script-loaded on dashboard.html (they were not, before this
 *      phase — see VOICE-APPLICATION-INTEGRATION-AUDIT.md §5.4): a
 *      real testimony record is indexed through the real pipeline
 *      (CozyRemoteMediaIndex -> CozyRemoteMediaAnalysis ->
 *      CozyMediaAnalysisLink -> CozyResearchIntelligence ->
 *      CozyMediaEvidence), the exact same calls
 *      cozy-media-intelligence-dashboard.html's own demo seed uses.
 *   2. Asking a real media-research-shaped question through the real
 *      Live Window (#cozy-living-assistant-input) reaches
 *      CozyAnswerEngine's new MEDIA_INTELLIGENCE composition step and
 *      returns a real, honest, evidence-based reply — not a fabricated
 *      one.
 *   3. That same resolved text reaches VoiceManager via the existing
 *      #speak() -> speakProgressive() chain — the one voice authority,
 *      never a second AI or a second speak path.
 *
 * Run with: node --test core/modules/intelligence/media/tests/cozy-media-intelligence-live-window-browser.test.js
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
    await page.waitForFunction(() => !!(window.CozyOS && window.CozyOS.CozyMediaIntelligence && window.CozyOS.CozyResearchIntelligence && window.CozyOS.CozyRemoteMediaIndex && window.CozyOS.LivingAssistant), { timeout: 15000 });
    await page.waitForSelector('#cozy-living-assistant-btn', { timeout: 15000 });
    await page.evaluate(() => window.CozyOS.LivingAssistant.open());
    await page.waitForSelector('#cozy-living-assistant-input', { timeout: 15000 });
    return { browser, page };
}

/** Real pipeline call chain, identical to cozy-media-intelligence-dashboard.html's own demo seed. */
async function seedOneRealTestimony(page) {
    return page.evaluate(() => {
        const idx = window.CozyOS.CozyRemoteMediaIndex;
        const analysis = window.CozyOS.CozyRemoteMediaAnalysis;
        const reg = window.CozyOS.CozyLanguagePacks;
        const link = window.CozyOS.CozyMediaAnalysisLink;
        const research = window.CozyOS.CozyResearchIntelligence;
        const evidence = window.CozyOS.CozyMediaEvidence;
        if (!idx || !analysis || !reg || !link || !research) {
            return { success: false, reason: 'one or more real media-pipeline engines is not loaded', have: { idx: !!idx, analysis: !!analysis, reg: !!reg, link: !!link, research: !!research } };
        }
        const created = idx.createRecord({
            sourceType: 'youtube', sourceId: 'browserTestHealingTestimony', title: 'A Real Healing Testimony',
            description: 'A real, honest testimony of healing', ownerAuthorization: { state: 'AUTHORIZED' }, searchableTerms: ['healing']
        });
        reg.registerRegionalContext('sw', { country: 'KE', region: 'Nairobi' });
        const job = analysis.createJob('LANGUAGE_IDENTIFICATION', { indexId: created.indexId, languageId: 'sw', region: 'Nairobi' });
        analysis.runJob(job.jobId);
        link.linkAnalysisToRecord(job.jobId);
        const rr = research.createResearchRecord({ sourceRecordId: created.indexId, researchType: 'HEALING', analysisJobId: job.jobId });
        if (rr.status === 'CREATED') {
            research.applyPrivacy(rr.researchId);
            if (evidence) evidence.enrichResearchRecord(rr.researchId);
        }
        return { success: true, researchStatus: rr.status };
    });
}

async function instrumentVoice(page) {
    await page.evaluate(() => {
        window.__voiceSpeakCalls = [];
        const vm = window.CozyOS.VoiceManager;
        if (!vm.__patchedForMediaIntelligenceTest) {
            vm.__patchedForMediaIntelligenceTest = true;
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

test('LIVE WINDOW E2E: CozyMediaIntelligence real engines are now loaded on dashboard.html (the real gap this phase closed)', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const status = await page.evaluate(() => window.CozyOS.CozyMediaIntelligence.getCapabilityStatus());
        assert.equal(status.testimonyDiscovery, 'AVAILABLE', 'testimonyDiscovery must report AVAILABLE now that CozyResearchSearch is really loaded, not CAPABILITY_UNAVAILABLE: ' + JSON.stringify(status));
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: a real indexed testimony + a real media-research question reaches VoiceManager through CozyAnswerEngine, honestly', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        await instrumentVoice(page);
        const seedResult = await seedOneRealTestimony(page);
        assert.equal(seedResult.success, true, 'the real seed pipeline must actually succeed: ' + JSON.stringify(seedResult));

        const reply = await ask(page, 'Do you have any healing testimonies?');
        assert.ok(/\d/.test(reply), 'the reply must cite a real result count, not a vague non-answer: ' + reply);
        assert.ok(reply.toLowerCase().includes('healing'), 'the reply must honestly reflect the matched researchType: ' + reply);

        const calls = await page.evaluate(() => window.__voiceSpeakCalls.map((c) => c.text));
        assert.ok(calls.some((t) => t === reply), 'the exact same resolved text must reach VoiceManager — one resolved response, one voice: ' + JSON.stringify(calls));
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: an ordinary platform question is unaffected by this change (no false-positive media hijack)', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const reply = await ask(page, 'What is CozyOS for?');
        assert.ok(!/healing|testimony|testimonies|sermon/i.test(reply), 'an ordinary platform question must never be answered as if it were a media-intelligence query: ' + reply);
    } finally {
        await browser.close();
    }
});
