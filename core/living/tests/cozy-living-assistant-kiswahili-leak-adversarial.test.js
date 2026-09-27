'use strict';

/**
 * core/living/tests/cozy-living-assistant-kiswahili-leak-adversarial.test.js
 *
 * UNIVERSAL LANGUAGE SEAM — CRITICAL NON-NEGOTIABLE ACCEPTANCE REQUIREMENT
 *
 *   "The previously observed failure where a genuine Kiswahili user
 *   question ... produces an English answer must never reappear. Do not
 *   fix only those exact strings. Prove that the entire class of
 *   Kiswahili -> English leakage is eliminated."
 *
 * This is a REAL LIVE WINDOW END-TO-END proof, same harness convention
 * as cozy-living-assistant-application-semantic-repair.test.js (real
 * dashboard.html, real DOM text entry, real rendered reply — no internal
 * module called directly). It deliberately targets UNSEEN Kiswahili
 * phrasing this repository's own fixed marker lists were never built
 * from, so a pass here cannot be explained by "the exact tested string
 * happens to be a marker word."
 *
 * Two checks run on every real answer:
 *   1. ENGLISH_LEAK_PATTERN — the answer must NEVER contain one of this
 *      repository's own known, literal English-only fallback/composed
 *      sentences (gathered by reading cozy-answer-engine.js's own
 *      hard-coded strings, cozy-language-templates.js's own `en` keys
 *      for every fallback/error template, and rule-based-conversational-
 *      provider.js's own RP026_ENGLISH_FALLBACK dict) — this is the
 *      exact, reproduced class of defect ("Nina duka."/"Unaweza
 *      kunisaidia?" both silently answered in English).
 *   2. KISWAHILI_SIGNAL_PATTERN — the answer must contain at least one
 *      unambiguous, real Kiswahili function word, so a pass can never be
 *      explained by "the answer merely avoided the blacklist, e.g. by
 *      being empty or by being a different, still-English sentence this
 *      blacklist doesn't happen to cover."
 *
 * A genuine proper-noun/brand exception applies (ChurchOS, InterestOS,
 * QuarryOS, CozyOS, MpesaOS, etc. keep their real English names inside
 * an otherwise-Kiswahili sentence — this is the explicit, disclosed
 * "proper entities/established names retain their identity" carve-out,
 * never a loophole for full-sentence English leakage).
 *
 * Run with: node --test core/living/tests/cozy-living-assistant-kiswahili-leak-adversarial.test.js
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

// --- Check 1: the exact, known, literal English-only sentences this
// repository's own composed-answer/fallback paths can produce. Read
// directly from cozy-answer-engine.js, cozy-language-templates.js's own
// `en` fallback/error keys, and rule-based-conversational-provider.js's
// RP026_ENGLISH_FALLBACK dict — never invented, never guessed.
const ENGLISH_LEAK_PATTERN = new RegExp([
    "I don.t have verified information to answer that yet",
    "Some related context exists, but nothing in it could be honestly rendered",
    "A real, non-empty question is required",
    "The answer composition authorities",
    "I don.t have a rule-based answer for that yet",
    "I can help you find the CozyOS apps, but the application registry",
    "I don.t have a verified answer yet for why someone might want to use CozyOS",
    "I don.t have a currently registered CozyOS application with verified",
    "I don.t have a verified answer yet for how CozyOS differs",
    "I don.t have a verified answer yet for CozyOS.s language support",
    "I have real evidence for this, but not yet in a form I can honestly",
    "I don.t have any registered application by that name",
    "I don.t have human-purpose information registered for that application",
    "I don.t have pricing information for that here",
    "Here.s how .+ helps:",
    "Here.s what .+ can currently do:",
    "Here.s why .+ matters:",
    "CozyOS currently includes these applications:",
    "Registered providers:",
].join("|"), "i");

// --- Check 2: at least one unambiguous, real Kiswahili function word
// must appear — proves genuine Kiswahili prose, not merely "avoided the
// blacklist." Deliberately broad and includes words NOT in any of this
// repository's own detector marker lists (e.g. "kwamba", "ambayo",
// "kila", "endapo") so this positive check does not just restate the
// detector's own vocabulary.
const KISWAHILI_SIGNAL_PATTERN = /\b(ni|ya|na|kwa|la|cha|wa|hii|hiyo|kuwa|au|kwenye|kutoka|zaidi|bado|halisi|taarifa|jibu|samahani|tafadhali|sina|una|ina|kuhusu|kwamba|ambayo|kila|hujambo|habari|asante|karibu|vizuri|sasa|leo|hapa|hilo|hayo|ndiyo|hapana|nini|nani|lini|wapi|jinsi|kufanya|kusaidia|programu|mfumo|mtoa|maombi|hakuna|hazina|hujui|sijui)\b/i;

function assertGenuineKiswahili(answer, question) {
    assert.ok(typeof answer === "string" && answer.trim().length > 0, `"${question}" produced an empty/missing answer`);
    assert.doesNotMatch(answer, ENGLISH_LEAK_PATTERN, `"${question}" leaked a known English-only fallback/answer sentence: "${answer}"`);
    assert.match(answer, KISWAHILI_SIGNAL_PATTERN, `"${question}" did not contain any real Kiswahili function word — genuine leak, not just avoided the blacklist: "${answer}"`);
}

test('ADVERSARIAL A: known Kiswahili vocabulary, genuinely novel sentence never seen in any marker list or test', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r = await ask(page, 'Ningependa kujua zaidi kuhusu jinsi ChurchOS inavyosaidia jumuiya kufuatilia mahudhurio.');
        assertGenuineKiswahili(r, 'known-vocab novel sentence');
    } finally {
        await browser.close();
    }
});

test('ADVERSARIAL B: unknown/new Kiswahili verb forms never present in ANY marker list — pure morphological generalization', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        // "Alipika" (he/she cooked), "Watapokea" (they will receive),
        // "Amejenga" (he/she has built) — zero marker-word overlap with
        // this repository's fixed lists, deliberately chosen to defeat a
        // finite marker-list detector; must resolve via morphological
        // pattern matching alone.
        const cases = [
            'Alipika chakula kizuri jana.',
            'Watapokea taarifa mpya wiki ijayo.',
        ];
        for (const q of cases) {
            const r = await ask(page, q);
            assertGenuineKiswahili(r, q);
        }
    } finally {
        await browser.close();
    }
});

test('ADVERSARIAL C: short Kiswahili sentences/single words', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const cases = ['Habari?', 'Asante.', 'Samahani.'];
        for (const q of cases) {
            const r = await ask(page, q);
            assertGenuineKiswahili(r, q);
        }
    } finally {
        await browser.close();
    }
});

test('ADVERSARIAL D: long, multi-clause Kiswahili question', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r = await ask(page, 'Kwa sababu tunataka kuboresha jinsi kanisa letu linavyotumia teknolojia katika shughuli za kila siku, tafadhali nieleze kwa undani ni faida gani halisi ambazo ChurchOS inaweza kuleta kwa jumuiya yetu ya waumini.');
        assertGenuineKiswahili(r, 'long multi-clause question');
    } finally {
        await browser.close();
    }
});

test('ADVERSARIAL E: implicit request (no explicit question mark/word)', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r = await ask(page, 'Nisaidie kuelewa CozyOS.');
        assertGenuineKiswahili(r, 'implicit request');
    } finally {
        await browser.close();
    }
});

test('ADVERSARIAL F: ambiguous input likely to need clarification', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r = await ask(page, 'Hiyo.');
        assertGenuineKiswahili(r, 'ambiguous clarification-needed input');
    } finally {
        await browser.close();
    }
});

test('ADVERSARIAL G: multi-turn Kiswahili follow-up (pronoun referring to previous turn)', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const first = await ask(page, 'Niambie kuhusu ChurchOS.');
        assertGenuineKiswahili(first, 'first turn');
        const followUp = await ask(page, 'Na nini kingine?');
        assertGenuineKiswahili(followUp, 'follow-up turn');
    } finally {
        await browser.close();
    }
});

test('ADVERSARIAL H: genuinely unanswerable Kiswahili question (no matching evidence anywhere)', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r = await ask(page, 'Rangi unayopenda zaidi ni ipi kati ya zote duniani?');
        assertGenuineKiswahili(r, 'unanswerable question');
    } finally {
        await browser.close();
    }
});

test('ADVERSARIAL I: no-knowledge fallback — the honest "nothing verified" reply must itself be Kiswahili', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r = await ask(page, 'Nieleze kuhusu programu ambayo haijawahi kuundwa kabisa duniani.');
        assertGenuineKiswahili(r, 'no-knowledge fallback');
    } finally {
        await browser.close();
    }
});

test('ADVERSARIAL J: mixed Kiswahili/English (code-switched) input stays dominantly Kiswahili, no full English leak', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r = await ask(page, 'Nataka ku-check kama ChurchOS ina stock management au la.');
        // Mixed input is honestly allowed to carry English loanwords
        // ("stock", "check") — the requirement is no FULL hardcoded
        // English fallback/answer sentence leaks, and real Kiswahili
        // grammar still appears (dominance scoring, cozy-language-
        // identifier.js).
        assert.doesNotMatch(r, ENGLISH_LEAK_PATTERN, `mixed-language input leaked a known English-only sentence: "${r}"`);
        assert.match(r, KISWAHILI_SIGNAL_PATTERN, `mixed-language input lost all Kiswahili grammar: "${r}"`);
    } finally {
        await browser.close();
    }
});

test('ADVERSARIAL K: language switching mid-conversation (SW -> EN -> SW) — each turn answered in ITS OWN language, no stale carryover leak', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const sw1 = await ask(page, 'Niambie kuhusu InterestOS.');
        assertGenuineKiswahili(sw1, 'sw1');
        const en1 = await ask(page, 'What is InterestOS?');
        assert.doesNotMatch(en1, /Hivi ndivyo|Sina bado|Samahani/i, `English turn wrongly stayed in Kiswahili: "${en1}"`);
        assert.match(en1, /InterestOS/i);
        const sw2 = await ask(page, 'Na tena, niambie kuhusu InterestOS.');
        assertGenuineKiswahili(sw2, 'sw2 after switching back');
    } finally {
        await browser.close();
    }
});

test('ADVERSARIAL L: fresh browser session (no warm-up turn) still resolves Kiswahili correctly on the FIRST message', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const r = await ask(page, 'Unaweza kunisaidia?');
        assertGenuineKiswahili(r, 'first-message-in-session, no warm-up');
    } finally {
        await browser.close();
    }
});

test('ADVERSARIAL M: the two ORIGINALLY-reported failing phrases still resolve correctly (regression anchor, not the whole proof)', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const cases = ['Nina duka.', 'Unaweza kunisaidia?'];
        for (const q of cases) {
            const r = await ask(page, q);
            assertGenuineKiswahili(r, q);
        }
    } finally {
        await browser.close();
    }
});
