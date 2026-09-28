'use strict';

/**
 * core/living/tests/spiritual-intent-classification.test.js
 * COZY SPIRITUALOS — PHASE 1: Spiritual Foundation.
 *
 * Tests the additive SPIRITUAL_PRAYER/SPIRITUAL_SCRIPTURE/
 * SPIRITUAL_DEVOTIONAL/SPIRITUAL_WORSHIP intents added to
 * core/living/cozy-ai-semantic-intent.js (§5's "In scope" list). This
 * file only exercises classification (WHAT was asked) — ownership
 * decisions (church vs. personal) are exclusively spiritual-
 * capability.js's classifyContext()/route(), tested in
 * spiritual-capability.test.js, never here (§1a/§1b).
 *
 * Run with: node --test core/living/tests/spiritual-intent-classification.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ENGINE_PATH = path.join(__dirname, '..', 'cozy-ai-semantic-intent.js');

function freshEngine() {
    try { delete require.cache[require.resolve(ENGINE_PATH)]; } catch (_e) { /* not loaded */ }
    global.window = { CozyOS: {} };
    require(ENGINE_PATH);
    return global.window.CozyOS.SemanticIntentEngine;
}

/* ------------------------------------------------------------------ */
/* A. Ontology / goal-map shape                                        */
/* ------------------------------------------------------------------ */

test('A1: the four SPIRITUAL_* ids exist on the ontology, unchanged spelling', () => {
    const engine = freshEngine();
    assert.equal(engine.INTENTS.SPIRITUAL_PRAYER, 'SPIRITUAL_PRAYER');
    assert.equal(engine.INTENTS.SPIRITUAL_SCRIPTURE, 'SPIRITUAL_SCRIPTURE');
    assert.equal(engine.INTENTS.SPIRITUAL_DEVOTIONAL, 'SPIRITUAL_DEVOTIONAL');
    assert.equal(engine.INTENTS.SPIRITUAL_WORSHIP, 'SPIRITUAL_WORSHIP');
});

test('A2: each SPIRITUAL_* intent has a real, closed goal mapping (never null/undefined)', () => {
    const engine = freshEngine();
    assert.equal(engine.GOAL_MAP.SPIRITUAL_PRAYER, 'SEEK_PRAYER_ASSISTANCE');
    assert.equal(engine.GOAL_MAP.SPIRITUAL_SCRIPTURE, 'RETRIEVE_SCRIPTURE');
    assert.equal(engine.GOAL_MAP.SPIRITUAL_DEVOTIONAL, 'SEEK_DEVOTIONAL_ASSISTANCE');
    assert.equal(engine.GOAL_MAP.SPIRITUAL_WORSHIP, 'SEEK_WORSHIP_INFORMATION');
});

/* ------------------------------------------------------------------ */
/* B. EN classification                                                */
/* ------------------------------------------------------------------ */

test('B1: EN "Help me pray for my family." -> SPIRITUAL_PRAYER', () => {
    const engine = freshEngine();
    const r = engine.analyze('Help me pray for my family.');
    assert.equal(r.primaryIntent, 'SPIRITUAL_PRAYER');
    assert.equal(r.goal, 'SEEK_PRAYER_ASSISTANCE');
    assert.equal(r.language, 'en');
});

test('B2: EN "Can you pray for me?" -> SPIRITUAL_PRAYER', () => {
    const engine = freshEngine();
    const r = engine.analyze('Can you pray for me?');
    assert.equal(r.primaryIntent, 'SPIRITUAL_PRAYER');
});

test('B3: EN "Show me John 3:16" -> SPIRITUAL_SCRIPTURE (bare reference shape)', () => {
    const engine = freshEngine();
    const r = engine.analyze('Show me John 3:16');
    assert.equal(r.primaryIntent, 'SPIRITUAL_SCRIPTURE');
    assert.equal(r.goal, 'RETRIEVE_SCRIPTURE');
});

test('B4: EN "What does the Bible say about hope?" -> SPIRITUAL_SCRIPTURE', () => {
    const engine = freshEngine();
    const r = engine.analyze('What does the Bible say about hope?');
    assert.equal(r.primaryIntent, 'SPIRITUAL_SCRIPTURE');
});

test('B5: EN "I want today\'s devotional" -> SPIRITUAL_DEVOTIONAL', () => {
    const engine = freshEngine();
    const r = engine.analyze("I want today's devotional");
    assert.equal(r.primaryIntent, 'SPIRITUAL_DEVOTIONAL');
});

test('B6: EN "When is the worship service?" -> SPIRITUAL_WORSHIP', () => {
    const engine = freshEngine();
    const r = engine.analyze('When is the worship service?');
    assert.equal(r.primaryIntent, 'SPIRITUAL_WORSHIP');
});

/* ------------------------------------------------------------------ */
/* C. SW classification                                                */
/* ------------------------------------------------------------------ */

test('C1: SW "Niombee familia yangu" -> SPIRITUAL_PRAYER, language sw', () => {
    const engine = freshEngine();
    const r = engine.analyze('Niombee familia yangu.');
    assert.equal(r.primaryIntent, 'SPIRITUAL_PRAYER');
    assert.equal(r.language, 'sw');
});

test('C2: SW "Nahitaji maombi" -> SPIRITUAL_PRAYER', () => {
    const engine = freshEngine();
    const r = engine.analyze('Nahitaji maombi.');
    assert.equal(r.primaryIntent, 'SPIRITUAL_PRAYER');
});

test('C3: SW "Nisomee mstari wa Biblia" -> SPIRITUAL_SCRIPTURE', () => {
    const engine = freshEngine();
    const r = engine.analyze('Nisomee mstari wa Biblia.');
    assert.equal(r.primaryIntent, 'SPIRITUAL_SCRIPTURE');
});

test('C4: SW "Nisaidie na ibada ya kila siku" -> SPIRITUAL_DEVOTIONAL', () => {
    const engine = freshEngine();
    const r = engine.analyze('Nisaidie na ibada ya kila siku.');
    assert.equal(r.primaryIntent, 'SPIRITUAL_DEVOTIONAL');
});

test('C5: SW "Ibada ni saa ngapi?" -> SPIRITUAL_WORSHIP', () => {
    const engine = freshEngine();
    const r = engine.analyze('Ibada ni saa ngapi?');
    assert.equal(r.primaryIntent, 'SPIRITUAL_WORSHIP');
});

/* ------------------------------------------------------------------ */
/* D. §1a vocabulary-trap sanity — intent recognition is real
      regardless of session context; classifyContext() (a SEPARATE
      file/decision) is what stays session-reference-only, not this
      engine. This section only proves the CLASSIFIER still correctly
      recognizes the intent in a church-flavored sentence — it makes NO
      claim about ownership, which is out of scope for this file. */
/* ------------------------------------------------------------------ */

test('D1: "During the current church service, I need prayer for this situation." still classifies as SPIRITUAL_PRAYER (intent recognition never depends on session context)', () => {
    const engine = freshEngine();
    const r = engine.analyze('During the current church service, I need prayer for this situation.');
    assert.equal(r.primaryIntent, 'SPIRITUAL_PRAYER');
});

test('D2: the engine itself never reports any church/session field — ownership is not this file\'s concern', () => {
    const engine = freshEngine();
    const r = engine.analyze('Help me pray for my family.');
    assert.equal('hasChurchContext' in r, false);
    assert.equal('owner' in r, false);
});

/* ------------------------------------------------------------------ */
/* E. Regression — existing, unrelated intents are unaffected          */
/* ------------------------------------------------------------------ */

test('E1: an unrelated existing intent (APP_BENEFITS) still classifies correctly after the additive change', () => {
    const engine = freshEngine();
    const r = engine.analyze('How does CozyOS help me?');
    assert.equal(r.primaryIntent, 'APP_BENEFITS');
});

test('E2: a genuinely unrelated, unmatched message stays UNKNOWN_INTENT, never accidentally swallowed by a new spiritual pattern', () => {
    const engine = freshEngine();
    const r = engine.analyze('zzz qux flibbertigibbet');
    assert.equal(r.primaryIntent, 'UNKNOWN_INTENT');
});

test('E3: engine version was bumped for this additive phase', () => {
    const engine = freshEngine();
    assert.equal(engine.getVersion(), '1.2.0-cozy-spiritualos-phase1');
});

test('E4: getEngineHonesty() intent count includes the four new intents', () => {
    const engine = freshEngine();
    assert.ok(engine.getEngineHonesty().intentCount >= Object.keys(engine.INTENTS).length);
});
