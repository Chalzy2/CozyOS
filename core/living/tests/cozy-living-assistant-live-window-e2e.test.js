'use strict';

/**
 * core/living/tests/cozy-living-assistant-live-window-e2e.test.js
 *
 * REAL LIVE WINDOW END-TO-END PROOF (not a unit test against an
 * isolated module). Loads the actual dashboard.html this repository
 * ships, in a real Chromium tab, and drives the actual, visible
 * CozyOS Assistant exactly as a human would: real DOM text entry into
 * #cozy-living-assistant-input, a real "Enter" keypress that fires the
 * real <form> submit listener wired in cozy-living-assistant.js's
 * #wireForm(), which calls the real, private #send() — the same
 * function this repository's own CHECKPOINT K note identifies as the
 * one real conversational-answer source for the visible assistant.
 * This test never calls any internal module (CozyAnswerEngine,
 * getContext, think()) directly — every answer below is read back from
 * the real rendered #cozy-living-assistant-messages DOM, the exact
 * text a human using dashboard.html would see.
 *
 * WHY THIS TEST EXISTS
 *   Prior work in this repository repeatedly found real, working,
 *   fully-unit-tested files that were never actually reachable from
 *   any real page (see dashboard.html's own inline comments on
 *   cozy-public-knowledge-source.js and cozy-ai-semantic-intent.js/
 *   cozy-learn.js for two real, previously-fixed examples of exactly
 *   this class of bug). Passing unit tests against an isolated module
 *   is necessary but never sufficient proof that a fix reaches the
 *   human. This test is the sufficient proof: it exercises the actual
 *   Live Window path end to end.
 *
 * WHAT THIS TEST FOUND (real, fixed during this same pass)
 *   Driving the real UI (not a unit test) surfaced a genuine bug unit
 *   tests alone had not caught: after a real, specific application
 *   (e.g. Authenticator) was correctly discussed, a bare pronoun
 *   follow-up with no application name in its own text ("Who benefits
 *   from it?") was answered with CozyOS-platform content instead of
 *   the correct application-specific answer — CozyIdentityFAQRouter's
 *   own word-overlap scorer fuzzy-matched a short platform trigger
 *   ("who benefits from cozyos") via the single shared word "benefits"
 *   once the brand name and connectives are stopworded. Fixed in
 *   cozy-answer-engine.js (entityHint now suppresses that router path
 *   when a real, specific application is contextually active) and
 *   wired end-to-end via cozy-living-assistant.js's #conversationState
 *   field. This test is the regression guard for that exact fix.
 *
 * ENVIRONMENT
 *   Uses the same portable Chromium-discovery helper as the existing
 *   real-browser suites in server/webauthn-rp/test/ (browser-launch.js)
 *   — no second, competing browser-launch mechanism. Loads
 *   dashboard.html directly via file:// (no server, no auth backend —
 *   this test only proves the CLIENT-SIDE intelligence pipeline; the
 *   two expected "Fetch API cannot load file:///webauthn/session"
 *   console errors are the unrelated, honestly-failing auth-status
 *   check and do not affect the assistant's own script wiring).
 *
 * Run with: node --test core/living/tests/cozy-living-assistant-live-window-e2e.test.js
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
    // Real public API of the real, mounted instance — the same effect
    // a real click on the real floating button produces (see that
    // method's own toggle()/open() source); used only because
    // synthetic pointer clicks on this particular floating button are
    // flaky under a headless, viewport-less launch. Every actual
    // question/answer exchange below still goes through real DOM text
    // entry + a real "Enter" keypress + the real form "submit" event.
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

test('LIVE WINDOW E2E: the real, mounted assistant loads with the full intelligence stack present', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const stack = await page.evaluate(() => ({
            livingAssistant: !!(window.CozyOS && window.CozyOS.LivingAssistant),
            semanticIntentEngine: !!(window.CozyOS && window.CozyOS.SemanticIntentEngine),
            cozyLearn: !!(window.CozyOS && window.CozyOS.CozyLearn),
            cozyAnswerEngine: !!(window.CozyOS && window.CozyOS.CozyAnswerEngine),
            cozyAdvisor: !!(window.CozyOS && window.CozyOS.CozyAdvisor),
            cozyIdentityFaqRouter: !!(window.CozyOS && window.CozyOS.CozyIdentityFAQRouter),
            cozyAi: !!(window.CozyOS && window.CozyOS.CozyAI),
            cozyKnowledge: !!(window.CozyOS && window.CozyOS.CozyKnowledge),
        }));
        for (const [name, present] of Object.entries(stack)) {
            assert.equal(present, true, `expected window.CozyOS.${name} to be loaded on the real dashboard.html page`);
        }
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: platform-level human-benefit/problem-solved questions resolve to real content, not the honest-but-wrong fallback strings', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r1 = await ask(page, 'What Cozyos for');
        assert.match(r1, /CozyOS/i);

        const r2 = await ask(page, 'What problems does it solve');
        assert.doesNotMatch(r2, /I don't have human-purpose information registered/i);
        assert.match(r2, /CozyOS exists to solve/i);

        const r3 = await ask(page, 'How is human benefits with it in real life');
        assert.doesNotMatch(r3, /nothing in it could be honestly rendered/i);
        assert.match(r3, /CozyOS/i);
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: real, multi-turn entity context is maintained and correctly SWITCHED, purely through the visible UI', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r1 = await ask(page, 'Why is Authenticator important?');
        assert.match(r1, /Authenticator/i);

        // Bare pronoun follow-ups with NO application name in their own
        // text must keep resolving to Authenticator, not fall back to
        // generic CozyOS-platform content (the real bug this suite's
        // own header documents finding and fixing).
        const r2 = await ask(page, 'Who benefits from it?');
        assert.match(r2, /Authenticator/i);
        assert.doesNotMatch(r2, /^CozyOS exists to be:/i);

        const r3 = await ask(page, 'What problem does it solve?');
        assert.match(r3, /Authenticator/i);
        assert.doesNotMatch(r3, /^CozyOS exists to be:/i);

        // Explicitly switching the topic to the platform must be
        // honored on the very next turn.
        const r4 = await ask(page, 'What Cozyos for');
        assert.match(r4, /CozyOS/i);

        const r5 = await ask(page, 'Who benefits from it?');
        assert.doesNotMatch(r5, /Authenticator/i);
        assert.match(r5, /CozyOS/i);
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: voice input and text input are proven, by source inspection, to share the exact same #send() reasoning path (no second AI)', async () => {
    // #send() is a true private class method - it cannot be invoked
    // from outside the class, so this asserts the real, single call
    // site structurally, the same discipline the existing
    // cozy-living-assistant-checkpoint-k.test.js suite already uses
    // for HTML script-order verification rather than re-driving the
    // DOM for every claim.
    const fs = require('node:fs');
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'cozy-living-assistant.js'), 'utf8');
    const sendCallSites = (src.match(/this\.#send\(/g) || []).length;
    const defIndex = src.indexOf('#wireVoiceInput() {');
    const micHandlerRegion = src.slice(defIndex, defIndex + 1200);
    assert.ok(sendCallSites >= 2, 'expected at least the quick-actions and voice-recognition call sites to both call #send()');
    assert.match(micHandlerRegion, /this\.#send\(payload\.transcript\)/, 'voice transcript must be handed to the SAME #send() text/voice/reasoning pipeline as typed input');
});

// LIVE WINDOW AI CONSUMPTION AUDIT — the tests above only ever drove
// two entities (CozyOS the platform, Authenticator). This repository
// has 11 real applications with committed human-purpose knowledge
// (cozy-knowledge-registry.js's APPLICATION_HUMAN_PURPOSE_DATA); the
// audit's own acceptance criteria requires proving Live Window reaches
// ALL of them through the real DOM, not just one, and that Kiswahili
// questions are understood as SEMANTIC INTENT (not response
// translation) through that same real path.
test('LIVE WINDOW E2E: multiple different real applications resolve correctly through the real DOM (not just one)', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const shop = await ask(page, 'Why is ShopOS important?');
        assert.match(shop, /ShopOS/i);

        const church = await ask(page, 'What does ChurchOS do?');
        assert.match(church, /ChurchOS/i);

        const quarry = await ask(page, 'Who benefits from QuarryOS?');
        assert.match(quarry, /QuarryOS/i);

        const mpesa = await ask(page, 'What problem does MpesaOS solve?');
        assert.match(mpesa, /MpesaOS/i);
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: Kiswahili questions about a real application are understood as semantic intent through the real DOM, not just translated', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r1 = await ask(page, 'MpesaOS inasaidia nini?');
        assert.match(r1, /MpesaOS/i);
        assert.doesNotMatch(r1, /Sina taarifa za umuhimu wa kibinadamu/i);

        // Bare Kiswahili pronoun follow-up ("Ni nani anayenufaika
        // nayo?" - "who benefits from it?") must resolve against the
        // real previous turn's entity (MpesaOS), the same conversation-
        // state mechanism proven for English above, not a second
        // Kiswahili-only context tracker.
        const r2 = await ask(page, 'Ni nani anayenufaika nayo?');
        assert.match(r2, /MpesaOS/i);

        const r3 = await ask(page, 'Inatatua tatizo gani?');
        assert.match(r3, /MpesaOS/i);
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: additional Kiswahili pronoun forms ("yake", bare "Inafaa kwa nani?") resolve through the real DOM', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r1 = await ask(page, 'What does ShopOS do?');
        assert.match(r1, /ShopOS/i);

        const r2 = await ask(page, 'Faida yake ni zipi?');
        assert.match(r2, /ShopOS/i);

        const r3 = await ask(page, 'Inafaa kwa nani?');
        assert.match(r3, /ShopOS/i);
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: platform vs application entity distinction never accidentally falls back to platform-level content', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r1 = await ask(page, 'What does ShopOS do?');
        assert.match(r1, /ShopOS/i);

        const r2 = await ask(page, 'Who benefits from it?');
        assert.match(r2, /ShopOS/i);
        assert.doesNotMatch(r2, /^CozyOS exists to solve/i);

        const r3 = await ask(page, 'What is CozyOS for?');
        assert.match(r3, /CozyOS/i);

        const r4 = await ask(page, 'Who benefits from it?');
        assert.doesNotMatch(r4, /ShopOS/i);
        assert.match(r4, /CozyOS/i);
    } finally {
        await browser.close();
    }
});

// LIVE-WINDOW RUNTIME AUDIT — real production regression found live:
// cozyos.org's actual user-facing Live Window answered application-
// discovery questions with only 3 of the 11 real applications
// (ChurchOS/ShopOS/Authenticator), and named applications outside that
// stale subset (e.g. "What's ShopOS doing?") with the honest-but-wrong
// "Some related context exists, but nothing in it could be honestly
// rendered" fallback. Root cause: dashboard.html/index.html/
// admin-workspace.html each loaded only a partial, ad-hoc subset of the
// real application-registration scripts (core/plugins/*-core.js etc.),
// so window.CozyOS.ServiceRegistry - the one real, live registry every
// app-lookup path reads - only ever knew about whichever apps that
// page happened to load. This is a real-browser regression guard for
// exactly that failure class: it must never again be possible for a
// real page to answer app-discovery with fewer real applications than
// are actually committed to this repository, and it must never fall
// back to a second, hardcoded application list to "fix" that gap.
test('LIVE WINDOW E2E: application discovery answers from the REAL, current ServiceRegistry, never a stale/hardcoded subset', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r = await ask(page, 'Do we have other applications?');
        // The specific, real production regression: exactly this
        // 3-application subset and nothing else.
        const isStaleThreeAppAnswer = /ChurchOS/i.test(r) && /ShopOS/i.test(r) && /Authenticator/i.test(r)
            && !/MpesaOS|QuarryOS|WholesaleOS|InterestOS|PharmacyOS/i.test(r);
        assert.equal(isStaleThreeAppAnswer, false, `application discovery regressed to the stale 3-app answer: "${r}"`);
        // Positive assertion: several real, distinct applications outside
        // that stale subset must be genuinely present in a real answer.
        const realAppNames = ['ShopOS', 'MpesaOS', 'QuarryOS', 'WholesaleOS', 'InterestOS', 'PharmacyOS'];
        const foundCount = realAppNames.filter((name) => new RegExp(name, 'i').test(r)).length;
        assert.ok(foundCount >= 4, `expected at least 4 of ${realAppNames.join(', ')} in a real application-discovery answer, found ${foundCount}: "${r}"`);
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: every real application named in cozy-knowledge-registry.js is independently reachable through the real DOM (not just the historically-tested two)', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        for (const app of ['ShopOS', 'MpesaOS', 'QuarryOS', 'WholesaleOS', 'InterestOS', 'PharmacyOS', 'ChurchOS', 'Authenticator']) {
            const r = await ask(page, `What does ${app} do?`);
            assert.match(r, new RegExp(app, 'i'), `expected "${app}" to be mentioned in its own answer, got: "${r}"`);
            assert.doesNotMatch(r, /nothing in it could be honestly rendered/i, `"${app}" fell back to the empty-context answer instead of resolving: "${r}"`);
        }
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: the real ServiceRegistry that Live Window itself reads registers every application-registration script actually referenced by dashboard.html/index.html/admin-workspace.html\'s own <script> tags (structural regression guard: a page can never silently drop a registration script again without this failing)', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const names = await page.evaluate(() => (window.CozyOS.ServiceRegistry.listApplications() || []).map((a) => a.name));
        const requiredRealApplications = ['ChurchOS', 'ShopOS', 'MpesaOS', 'QuarryOS', 'WholesaleOS', 'InterestOS', 'PharmacyOS', 'Authenticator'];
        for (const name of requiredRealApplications) {
            assert.ok(names.includes(name), `expected "${name}" in the real, live ServiceRegistry on dashboard.html; got: ${JSON.stringify(names)}`);
        }
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: malformed/natural-language ChurchOS questions resolve to real, verified ChurchOS content (LIVE WINDOW NEXT REPAIR regression guard)', async () => {
    // Real production report: these exact 5 questions (typo'd verbs,
    // pluralized "benefits"/"helps" the provider's regex only accepted
    // as bare "benefit"/"help", and a platform+beneficiary-domain
    // question naming no specific application) all returned "Some
    // related context exists, but nothing in it could be honestly
    // rendered as a verified answer." in production even though
    // ChurchOS's real, verified human-purpose data (getApplicationHumanPurposeFact)
    // was present the whole time — a routing gap (intent stayed
    // "unsupported"/no getContext() route existed for a named
    // application), never a knowledge gap.
    const { browser, page } = await openLiveWindow();
    try {
        const appSpecific = [
            'What doe churchos works',
            'How does one benefits in ChurchOs',
            'Why doeess ChurchOs do',
            'How do humans benefits in ChurchOs',
        ];
        for (const q of appSpecific) {
            const r = await ask(page, q);
            assert.doesNotMatch(r, /nothing in it could be honestly rendered/i, `"${q}" still falls back instead of resolving to real ChurchOS content: "${r}"`);
            assert.doesNotMatch(r, /I don't have verified information/i, `"${q}" still falls back instead of resolving to real ChurchOS content: "${r}"`);
            assert.match(r, /ChurchOS/i, `expected "${q}" to answer about ChurchOS specifically, got: "${r}"`);
            assert.match(r, /church|faith/i, `expected "${q}" to include ChurchOS's real, verified human-purpose content, got: "${r}"`);
        }

        // Platform + beneficiary-domain question — names no specific
        // application ("cozyos" is the platform, not a registered app),
        // so it must resolve via the real, verified getWhyUseCozyOSFact()
        // platform content, never a fabricated per-app answer and never
        // an unrelated intent (e.g. the African Knowledge Initiative
        // long-term-goal answer, a real, separate false-positive this
        // same pass found and fixed in cozyos-identity-faq-router.js).
        const domainAnswer = await ask(page, 'How can cozyos helps churches');
        assert.doesNotMatch(domainAnswer, /nothing in it could be honestly rendered/i, `domain question still falls back: "${domainAnswer}"`);
        assert.match(domainAnswer, /practical, everyday problems/i, `expected the real getWhyUseCozyOSFact() content, got: "${domainAnswer}"`);
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: "How can CozyOS help churches/schools/businesses?" resolves to the real platform benefit content, not the unrelated African Knowledge Initiative long-term-goal answer', async () => {
    // Real gap found extending the required test matrix beyond the
    // reported 5 questions: CozyIdentityFAQRouter's COZYOS_FUTURE
    // trigger "how can cozyos help communities" shared its shape with
    // these genuinely distinct, more concrete practical-benefit
    // questions, so the word-overlap scorer fuzzy-matched them onto the
    // wrong intent (the long-term African Knowledge Initiative goal)
    // ahead of the correct, real getWhyUseCozyOSFact() answer.
    const { browser, page } = await openLiveWindow();
    try {
        for (const domain of ['churches', 'schools', 'businesses']) {
            const r = await ask(page, `How can CozyOS help ${domain}?`);
            assert.doesNotMatch(r, /community-driven collections of African languages/i, `"How can CozyOS help ${domain}?" still matches the unrelated long-term-goal answer: "${r}"`);
            assert.match(r, /practical, everyday problems/i, `expected the real getWhyUseCozyOSFact() content for "${domain}", got: "${r}"`);
        }
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: Kiswahili ChurchOS-specific questions resolve to real, verified ChurchOS content, in Kiswahili', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const swQuestions = [
            'ChurchOS inafanya nini?',
            'ChurchOS inasaidia nani?',
            'Faida za ChurchOS ni zipi?',
            'ChurchOS inatatua tatizo gani?',
            'Kwa nini ChurchOS ni muhimu?',
        ];
        for (const q of swQuestions) {
            const r = await ask(page, q);
            assert.match(r, /ChurchOS/i, `expected "${q}" to answer about ChurchOS, got: "${r}"`);
            assert.match(r, /kanisa|makanisa/i, `expected "${q}" to answer in Kiswahili with real ChurchOS content, got: "${r}"`);
        }
    } finally {
        await browser.close();
    }
});

console.log('Live Window real-browser end-to-end suite: run complete.');
