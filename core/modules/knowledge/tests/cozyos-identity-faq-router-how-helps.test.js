'use strict';

/**
 * core/modules/knowledge/tests/cozyos-identity-faq-router-how-helps.test.js
 *
 * PRODUCTION ANSWER-PATH AUDIT — real Incognito production bug: a real
 * user asking, in Kiswahili, "Nataka kujua CozyOS inasaidiaje?" got the
 * Live Window falling back to an old English-oriented answer wrapped in
 * "translation not verified," instead of a real, natural Kiswahili
 * answer. Traced root cause: this router had no trigger at all for the
 * bare, no-named-beneficiary "how does CozyOS help (people)?" question
 * shape, in either language, so it fell through to
 * rule-based-conversational-provider.js's own "why-use-cozyos" case,
 * whose content (cozy-public-knowledge-source.js's WHY_USE_ANSWER) had
 * no Kiswahili sibling — see that file's own header comment on
 * getWhyUseCozyOSFact(language) for the fix on that side.
 *
 * This file proves the new COZYOS_HOW_HELPS intent:
 *   1. matches every phrasing from the user's own reported test matrix
 *      (EN + SW), in both bare and full-sentence form;
 *   2. produces a REAL, distinct Kiswahili answer (not the English
 *      string, not a "no verified translation" disclosure);
 *   3. does NOT regress the historical COZYOS_FUTURE false-positive fix
 *      ("how can CozyOS help communities/churches/schools" — a
 *      DIFFERENT, beneficiary-named question this router deliberately
 *      has no trigger for, per its own inline history — must still not
 *      match here);
 *   4. degrades honestly (never fabricates) when CozyPublicKnowledge
 *      isn't loaded.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const ROUTER_PATH = path.join(__dirname, '..', 'cozyos-identity-faq-router.js');
const PUBLIC_KNOWLEDGE_PATH = path.join(__dirname, '..', '..', 'intelligence', 'knowledge', 'cozy-public-knowledge-source.js');

function freshRouter({ withPublicKnowledge = true } = {}) {
    delete require.cache[require.resolve(ROUTER_PATH)];
    delete require.cache[require.resolve(PUBLIC_KNOWLEDGE_PATH)];
    global.window = { CozyOS: { DeveloperIdentity: {} } };
    if (withPublicKnowledge) require(PUBLIC_KNOWLEDGE_PATH);
    require(ROUTER_PATH);
    return global.window.CozyOS.CozyIdentityFAQRouter;
}

// ---- The exact reported production query, and its real variants ----

test('SW: "Nataka kujua CozyOS inasaidiaje?" (the exact reported production query) resolves to COZYOS_HOW_HELPS with a real Kiswahili answer', async () => {
    const router = freshRouter();
    const result = await router.resolve('Nataka kujua CozyOS inasaidiaje?', { language: 'sw' });
    assert.equal(result.matched, true);
    assert.equal(result.intentId, 'COZYOS_HOW_HELPS');
    assert.equal(result.language, 'sw');
    assert.ok(result.answer.length > 0);
    assert.doesNotMatch(result.answer, /no verified translation|not yet verified|Kwa Kiingereza/i, 'must be a real Kiswahili answer, not an English-wrapped disclosure');
    assert.match(result.answer, /watu|jamii|makanisa/i, 'expected real human-benefit Kiswahili content');
});

test('SW: bare "CozyOS inasaidiaje?" matches COZYOS_HOW_HELPS', async () => {
    const router = freshRouter();
    const result = await router.resolve('CozyOS inasaidiaje?', { language: 'sw' });
    assert.equal(result.intentId, 'COZYOS_HOW_HELPS');
});

test('SW: "CozyOS inasaidia nini?" matches COZYOS_HOW_HELPS', async () => {
    const router = freshRouter();
    const result = await router.resolve('CozyOS inasaidia nini?', { language: 'sw' });
    assert.equal(result.intentId, 'COZYOS_HOW_HELPS');
});

test('SW: "CozyOS inasaidia watu vipi?" matches COZYOS_HOW_HELPS', async () => {
    const router = freshRouter();
    const result = await router.resolve('CozyOS inasaidia watu vipi?', { language: 'sw' });
    assert.equal(result.intentId, 'COZYOS_HOW_HELPS');
});

test('EN: "What does CozyOS help people with?" matches COZYOS_HOW_HELPS with the real English answer', async () => {
    const router = freshRouter();
    const result = await router.resolve('What does CozyOS help people with?', { language: 'en' });
    assert.equal(result.intentId, 'COZYOS_HOW_HELPS');
    assert.equal(result.language, 'en');
    assert.match(result.answer, /practical|everyday problems/i);
});

// ---- Must not regress the historical COZYOS_FUTURE false-positive fix ----

test('EN: "How can CozyOS help communities?" (the DIFFERENT, beneficiary-named question this router deliberately has no trigger for) does NOT match COZYOS_HOW_HELPS', () => {
    const router = freshRouter();
    const result = router.detectIntent('How can CozyOS help communities?');
    assert.notEqual(result && result.intentId, 'COZYOS_HOW_HELPS', 'the bare single word "help" must never alone manufacture a match — see OVERLAP_STOPWORDS discipline');
});

test('EN: "How does CozyOS change people\'s lives?" still matches COZYOS_FUTURE, not COZYOS_HOW_HELPS', () => {
    const router = freshRouter();
    const result = router.detectIntent("How can CozyOS change people's lives?");
    assert.equal(result.intentId, 'COZYOS_FUTURE');
});

// ---- Honest degradation ----

test('CozyPublicKnowledge not loaded: COZYOS_HOW_HELPS honestly reports isReal:false, never fabricates', async () => {
    const router = freshRouter({ withPublicKnowledge: false });
    const result = await router.resolve('CozyOS inasaidiaje?', { language: 'sw' });
    assert.equal(result.matched, true);
    assert.equal(result.isReal, false);
});

// ---- Scope guard: a named sub-application still wins, per this router's existing discipline ----

test('a query naming another real application ("ChurchOS inasaidiaje?") is still never this router\'s to answer', () => {
    const router = freshRouter();
    const result = router.detectIntent('ChurchOS inasaidiaje?');
    assert.equal(result, null);
});
