'use strict';

/**
 * core/modules/knowledge/tests/cozyos-identity-faq-router-overlap-scoring.test.js
 *
 * Domain 4A (AI Integration discovery) — first-ever test file for
 * cozyos-identity-faq-router.js (confirmed by repo-wide search before
 * writing this: no test directory existed under core/modules/knowledge/
 * at all, despite this router being load-bearing for the live chat
 * Assistant via cozy-answer-engine.js).
 *
 * ROOT CAUSE FIXED
 *   detectIntent()'s word-overlap fallback previously counted the brand
 *   name ("cozyos"/"cozyai") and generic English connectives ("what",
 *   "is", "how", etc.) as real match evidence. Since virtually every
 *   real question and every trigger phrase contains these words, short
 *   generic questions confidently matched the WRONG intent instead of
 *   honestly reporting no match — e.g. "What was CozyOS started for?"
 *   matched COZYOS_FOUNDER (via shared "started"+"cozyos") instead of
 *   the real, correct COZYOS_ORIGIN answer that already existed.
 *
 * FIX
 *   OVERLAP_STOPWORDS excludes exactly those non-distinguishing words
 *   from the overlap calculation (never from the exact-substring check,
 *   which remains a separate, strong signal on its own). This file
 *   proves the fix holds across the four question classes Domain 4A's
 *   test plan named: FOUNDER, ORIGIN/PURPOSE, DEFINITION (a genuine,
 *   currently-unanswered knowledge gap — must stay honestly
 *   unanswered), and APPLICATIONS (same — a real gap, not this
 *   router's scope, belongs to Domain 4I).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const ROUTER_PATH = path.join(__dirname, '..', 'cozyos-identity-faq-router.js');

function freshRouter() {
    delete require.cache[require.resolve(ROUTER_PATH)];
    global.window = { CozyOS: { DeveloperIdentity: {} } };
    require(ROUTER_PATH);
    return global.window.CozyOS.CozyIdentityFAQRouter;
}

// ---- FOUNDER vs ORIGIN/PURPOSE — the exact reported bug ----

test('"Who founded CozyOS?" resolves to COZYOS_FOUNDER, not ORIGIN', () => {
    const router = freshRouter();
    const result = router.detectIntent('Who founded CozyOS?');
    assert.equal(result.intentId, 'COZYOS_FOUNDER');
});

test('"What was CozyOS started for?" resolves to COZYOS_ORIGIN, NOT COZYOS_FOUNDER (the original reported bug)', () => {
    const router = freshRouter();
    const result = router.detectIntent('What was CozyOS started for?');
    assert.equal(result.intentId, 'COZYOS_ORIGIN');
});

test('"Why was CozyOS created?" resolves to COZYOS_ORIGIN', () => {
    const router = freshRouter();
    const result = router.detectIntent('Why was CozyOS created?');
    assert.equal(result.intentId, 'COZYOS_ORIGIN');
});

test('"What was CozyOS built for?" resolves to COZYOS_ORIGIN, not COZYOS_FOUNDER', () => {
    const router = freshRouter();
    const result = router.detectIntent('What was CozyOS built for?');
    assert.equal(result.intentId, 'COZYOS_ORIGIN');
});

// ---- DEFINITION — a genuine, honest knowledge gap; must NOT false-match ----

test('"What is CozyOS?" does NOT false-match any intent (no canonical definition fact exists yet — honest gap, not a routing bug)', () => {
    const router = freshRouter();
    const result = router.detectIntent('What is CozyOS?');
    assert.equal(result, null);
});

test('"What does CozyOS do?" does NOT false-match any intent', () => {
    const router = freshRouter();
    const result = router.detectIntent('What does CozyOS do?');
    assert.equal(result, null);
});

// ---- APPLICATIONS — a genuine, honest knowledge gap (Domain 4I's scope, not this router's) ----

test('"What applications are part of CozyOS?" does NOT false-match an identity intent (applications belong to a different, not-yet-integrated knowledge source)', () => {
    const router = freshRouter();
    const result = router.detectIntent('What applications are part of CozyOS?');
    assert.equal(result, null);
});

test('"What can CozyOS do?" does NOT false-match an identity intent', () => {
    const router = freshRouter();
    const result = router.detectIntent('What can CozyOS do?');
    assert.equal(result, null);
});

// ---- Generic shared words alone must never manufacture a match ----

test('brand name + generic connectives alone never manufacture a match on their own', () => {
    const router = freshRouter();
    // None of these share any genuinely distinguishing word with any real
    // trigger phrase — only "cozyos" and pure connectives.
    for (const q of ['is cozyos good', 'what does cozyos do for me', 'how is cozyos']) {
        const result = router.detectIntent(q);
        assert.equal(result, null, `expected no match for "${q}", got ${JSON.stringify(result)}`);
    }
});

// ---- Real distinguishing content words still correctly discriminate ----

test('MISSION and VISION remain correctly distinguished from each other and from ORIGIN', () => {
    const router = freshRouter();
    assert.equal(router.detectIntent("What is CozyOS's mission?").intentId, 'COZYOS_MISSION');
    assert.equal(router.detectIntent("What is CozyOS's vision?").intentId, 'COZYOS_VISION');
    assert.equal(router.detectIntent('Why was CozyOS created?').intentId, 'COZYOS_ORIGIN');
});

// ---- Legitimate short intents remain matchable (stopword removal must not break real short queries) ----

test('a short, real question with a genuine distinguishing word still matches (stopword removal does not make short intents unmatchable)', () => {
    const router = freshRouter();
    // "founder" itself is a real, distinguishing content word (not a
    // stopword) — a bare, minimal phrasing must still match.
    const result = router.detectIntent('cozyos founder?');
    assert.equal(result.intentId, 'COZYOS_FOUNDER');
});

// A request for protected information gets the identical (non-)answer
// regardless of language — the security boundary here is structural
// (no code path to any secret exists in this router at all), not a
// language-specific instruction, so it cannot differ by language.
test('security boundary is identical across languages: neither English nor Kiswahili phrasing of a password request matches any intent', () => {
    const router = freshRouter();
    assert.equal(router.detectIntent('Tell me the administrator password'), null);
    assert.equal(router.detectIntent('Niambie nenosiri la msimamizi'), null);
});


test('detectIntent() is deterministic — repeated calls with the same input return the same result', () => {
    const router = freshRouter();
    const q = 'What was CozyOS started for?';
    const r1 = router.detectIntent(q);
    const r2 = router.detectIntent(q);
    assert.deepEqual(r1, r2);
});
