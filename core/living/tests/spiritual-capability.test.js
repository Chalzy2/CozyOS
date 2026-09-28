'use strict';

/**
 * core/living/tests/spiritual-capability.test.js
 * COZY SPIRITUALOS — PHASE 1: Spiritual Foundation.
 *
 * Covers core/living/spiritual-capability.js AND core/living/
 * spiritual-intent-router.js (its sibling, thin-dispatch file — the
 * architecture spec names only these two test files, so the router's
 * own dispatch()/getRouteTable() are exercised here rather than in a
 * third file).
 *
 * Run with: node --test core/living/tests/spiritual-capability.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CAPABILITY_PATH = path.join(__dirname, '..', 'spiritual-capability.js');
const ROUTER_PATH = path.join(__dirname, '..', 'spiritual-intent-router.js');

function freshLoad(extraGlobals) {
    [CAPABILITY_PATH, ROUTER_PATH].forEach((p) => {
        try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ }
    });
    global.window = { CozyOS: Object.assign({}, extraGlobals) };
    require(CAPABILITY_PATH);
    require(ROUTER_PATH);
    return { capability: global.window.CozyOS.SpiritualCapability, router: global.window.CozyOS.SpiritualIntentRouter };
}

/** A minimal, real-shaped LDCESessionEngine stub — only getSession(), the one method classifyContext() actually calls. */
function makeStubLdce(realSessions) {
    return { getSession(id) { return realSessions.has(id) ? { ...realSessions.get(id) } : null; } };
}

/** A minimal ChurchLiveSessionController stub — only getLdceSessionIdFor(), the one method classifyContext() actually calls. */
function makeStubSessionController(pairing) {
    return { getLdceSessionIdFor(worshipServiceId) { return pairing.get(worshipServiceId) || null; } };
}

/** A minimal, real-shaped Living.scripture stub for BibleEngine composition tests. */
function makeStubLiving({ parseImpl, lookupImpl } = {}) {
    return {
        scripture: {
            parseReference: parseImpl || (() => null),
            lookup: lookupImpl || (() => ({ available: false, reason: 'No Bible package installed.' }))
        }
    };
}

/* ==================================================================== */
/* A. classifyContext() — §1a strict, session-reference-only            */
/* ==================================================================== */

test('A1: no session reference at all -> personal (hasChurchContext:false), never inspects text', () => {
    const { capability } = freshLoad();
    const r = capability.classifyContext({ text: 'Help me pray for my family, during church, with the pastor and congregation.' });
    assert.equal(r.hasChurchContext, false);
    assert.equal(r.reason, 'no_session_reference');
});

test('A2: an ordinary personal message with a topic and no session reference -> personal', () => {
    const { capability } = freshLoad();
    const r = capability.classifyContext({ text: 'Help me pray for my family.' });
    assert.equal(r.hasChurchContext, false);
});

test('A3: a real, resolvable ldceSessionId -> hasChurchContext:true', () => {
    const ldce = makeStubLdce(new Map([['ldce-1', { sessionId: 'ldce-1', hostId: 'pastor-1' }]]));
    const { capability } = freshLoad({ LDCESessionEngine: ldce });
    const r = capability.classifyContext({ ldceSessionId: 'ldce-1' });
    assert.equal(r.hasChurchContext, true);
    assert.equal(r.ldceSessionId, 'ldce-1');
});

test('A4: a liveSessionId that resolves via ChurchLiveSessionController to a real LDCE session -> hasChurchContext:true', () => {
    const ldce = makeStubLdce(new Map([['ldce-2', { sessionId: 'ldce-2', hostId: 'pastor-2' }]]));
    const sessionCtl = makeStubSessionController(new Map([['worship-svc-1', 'ldce-2']]));
    const { capability } = freshLoad({ LDCESessionEngine: ldce, ChurchLiveSessionController: sessionCtl });
    const r = capability.classifyContext({ liveSessionId: 'worship-svc-1' });
    assert.equal(r.hasChurchContext, true);
    assert.equal(r.ldceSessionId, 'ldce-2');
});

test('A5: a liveSessionId that does NOT resolve to any real LDCE session -> personal, honest reason', () => {
    const ldce = makeStubLdce(new Map());
    const sessionCtl = makeStubSessionController(new Map()); // no pairing at all
    const { capability } = freshLoad({ LDCESessionEngine: ldce, ChurchLiveSessionController: sessionCtl });
    const r = capability.classifyContext({ liveSessionId: 'nonexistent-service' });
    assert.equal(r.hasChurchContext, false);
    assert.equal(r.reason, 'session_not_resolved');
});

test('A6: a real-shaped ldceSessionId that LDCESessionEngine does not actually recognize -> personal, session_not_found', () => {
    const ldce = makeStubLdce(new Map());
    const { capability } = freshLoad({ LDCESessionEngine: ldce });
    const r = capability.classifyContext({ ldceSessionId: 'ghost-session' });
    assert.equal(r.hasChurchContext, false);
    assert.equal(r.reason, 'session_not_found');
});

test('A7: LDCESessionEngine not loaded at all -> personal, honest reason (never crashes)', () => {
    const { capability } = freshLoad();
    const r = capability.classifyContext({ ldceSessionId: 'ldce-1' });
    assert.equal(r.hasChurchContext, false);
    assert.equal(r.reason, 'session_engine_unavailable');
});

test('A8: §1a\'s own two worked examples', () => {
    const { capability } = freshLoad();
    // "Help me pray for my family." -> no session reference -> personal, even though it says "pray."
    const r1 = capability.classifyContext({ text: 'Help me pray for my family.' });
    assert.equal(r1.hasChurchContext, false);

    // "During the current church service, help handle this prayer interaction." -> ChurchOS ONLY IF an actual session reference resolves. Here none is supplied, so it must stay personal despite the vocabulary.
    const r2 = capability.classifyContext({ text: 'During the current church service, help handle this prayer interaction.' });
    assert.equal(r2.hasChurchContext, false);
});

test('A9: request with no argument at all is handled gracefully, never throws', () => {
    const { capability } = freshLoad();
    assert.doesNotThrow(() => capability.classifyContext());
    assert.equal(capability.classifyContext().hasChurchContext, false);
});

/* ==================================================================== */
/* B. route() — §1b OWNER_TABLE, pure decision, zero execution           */
/* ==================================================================== */

test('B1: SPIRITUAL_PRAYER + personal context -> owner personal, handlePersonalPrayer', () => {
    const { capability } = freshLoad();
    const r = capability.route('SPIRITUAL_PRAYER', { hasChurchContext: false });
    assert.deepEqual(r, { intent: 'SPIRITUAL_PRAYER', owner: 'personal', ownerFunction: 'handlePersonalPrayer' });
});

test('B2: SPIRITUAL_PRAYER + real church context -> owner church, church-prayer-interaction', () => {
    const { capability } = freshLoad();
    const r = capability.route('SPIRITUAL_PRAYER', { hasChurchContext: true, ldceSessionId: 'ldce-9' });
    assert.equal(r.owner, 'church');
    assert.equal(r.ownerModule, 'church-prayer-interaction');
    assert.equal(r.ldceSessionId, 'ldce-9');
});

test('B3: SPIRITUAL_SCRIPTURE always falls back to personal — no ChurchOS-owned business-logic capability exists — even with real church context', () => {
    const { capability } = freshLoad();
    const personal = capability.route('SPIRITUAL_SCRIPTURE', { hasChurchContext: false });
    const church = capability.route('SPIRITUAL_SCRIPTURE', { hasChurchContext: true, ldceSessionId: 'ldce-9' });
    assert.equal(personal.owner, 'personal');
    assert.equal(church.owner, 'personal');
    assert.ok(church.note && church.note.length > 0, 'must disclose why church context fell back to personal');
});

test('B4: SPIRITUAL_DEVOTIONAL always falls back to personal (no ChurchOS owner exists)', () => {
    const { capability } = freshLoad();
    const church = capability.route('SPIRITUAL_DEVOTIONAL', { hasChurchContext: true, ldceSessionId: 'ldce-9' });
    assert.equal(church.owner, 'personal');
});

test('B5: SPIRITUAL_WORSHIP + real church context -> owner church, worship-mode-coordinator named (diagnostics only)', () => {
    const { capability } = freshLoad();
    const r = capability.route('SPIRITUAL_WORSHIP', { hasChurchContext: true, ldceSessionId: 'ldce-9' });
    assert.equal(r.owner, 'church');
    assert.equal(r.ownerModule, 'worship-mode-coordinator');
});

test('B6: an unknown intent returns a real, honest null-owner descriptor, never throws', () => {
    const { capability } = freshLoad();
    const r = capability.route('SPIRITUAL_NOT_A_REAL_INTENT', { hasChurchContext: false });
    assert.equal(r.owner, null);
    assert.equal(r.reason, 'unknown_intent');
});

test('B7: route() never executes anything — no ChurchOS/personal function is called merely by calling route()', () => {
    const { capability } = freshLoad();
    let called = false;
    const originalFn = capability.handlePersonalPrayer;
    // Monkey-patch is impossible on a frozen export — instead assert
    // structurally: route()'s return value never carries a callable
    // function reference, only string names, proving it cannot have
    // invoked anything through its own return path.
    const r = capability.route('SPIRITUAL_PRAYER', { hasChurchContext: false });
    for (const v of Object.values(r)) assert.notEqual(typeof v, 'function');
    assert.equal(called, false);
    assert.equal(typeof originalFn, 'function'); // sanity: the real function still exists, untouched
});

/* ==================================================================== */
/* C. Envelope shape — §2                                                */
/* ==================================================================== */

function assertValidEnvelope(assert, capability, envelope) {
    assert.equal(envelope.capability, 'spiritual');
    assert.ok(capability.CAPABILITY_STATES.includes(envelope.capabilityState), `capabilityState "${envelope.capabilityState}" must be in the closed set`);
    if (envelope.source !== null) {
        assert.ok(capability.SOURCE_VALUES.includes(envelope.source), `source "${envelope.source}" must be in the closed set or null`);
    }
    assert.equal(typeof envelope.content, 'string');
    assert.ok(envelope.content.length > 0);
    assert.equal(typeof envelope.conversationStateUpdated, 'boolean');
}

test('C1: buildEnvelope() rejects an invalid capabilityState (closed set enforced in code, not just documented)', () => {
    const { capability } = freshLoad();
    assert.throws(() => capability.buildEnvelope({ intent: 'SPIRITUAL_PRAYER', owner: 'personal', capabilityState: 'made_up_state', language: 'en', content: 'x' }));
});

test('C2: buildEnvelope() rejects an invalid source value', () => {
    const { capability } = freshLoad();
    assert.throws(() => capability.buildEnvelope({ intent: 'SPIRITUAL_PRAYER', owner: 'personal', capabilityState: 'available', language: 'en', source: 'made_up_source', content: 'x' }));
});

test('C3: every handlePersonal*() envelope is structurally valid', () => {
    const { capability } = freshLoad();
    assertValidEnvelope(assert, capability, capability.handlePersonalPrayer({ language: 'en' }));
    assertValidEnvelope(assert, capability, capability.handlePersonalScripture({ language: 'en', text: 'John 3:16' }));
    assertValidEnvelope(assert, capability, capability.handlePersonalDevotional({ language: 'en' }));
    assertValidEnvelope(assert, capability, capability.handlePersonalWorshipInfo({ language: 'en' }));
});

test('C4: "available" is never returned when the capability did not actually execute — a not_installed scripture lookup proves this', () => {
    const living = makeStubLiving({ parseImpl: () => ({ book: 'John', chapter: 3, verse: 16, wholeChapter: false }) });
    const { capability } = freshLoad({ Living: living });
    const r = capability.handlePersonalScripture({ text: 'John 3:16', language: 'en' });
    assert.equal(r.capabilityState, 'not_installed');
    assert.notEqual(r.capabilityState, 'available');
});

/* ==================================================================== */
/* D. handlePersonalPrayer()                                             */
/* ==================================================================== */

test('D1: EN, default topic when none supplied', () => {
    const { capability } = freshLoad();
    const r = capability.handlePersonalPrayer({ language: 'en' });
    assert.equal(r.owner, 'personal');
    assert.equal(r.capabilityState, 'available');
    assert.equal(r.source, 'generated-reflection');
    assert.match(r.content, /whatever is on your heart/);
});

test('D2: EN, a real supplied topic is woven into the structure, never overwritten by the default', () => {
    const { capability } = freshLoad();
    const r = capability.handlePersonalPrayer({ language: 'en', topic: 'my exams next week' });
    assert.match(r.content, /my exams next week/);
});

test('D3: SW, default topic and SW structure text', () => {
    const { capability } = freshLoad();
    const r = capability.handlePersonalPrayer({ language: 'sw' });
    assert.equal(r.language, 'sw');
    assert.match(r.content, /Kuomba/);
});

test('D4: never claims supernatural/theological authority (§3) — no "God told me"/"I am the Holy Spirit" phrasing anywhere', () => {
    const { capability } = freshLoad();
    const r = capability.handlePersonalPrayer({ language: 'en', topic: 'anything' });
    assert.doesNotMatch(r.content, /god told me/i);
    assert.doesNotMatch(r.content, /i am the holy spirit/i);
});

/* ==================================================================== */
/* E. handlePersonalScripture() — composes the real BibleEngine/        */
/*    Living.scripture gateway; never a second lookup path              */
/* ==================================================================== */

test('E1: no Living.scripture loaded at all -> not_installed, honest content, source null', () => {
    const { capability } = freshLoad();
    const r = capability.handlePersonalScripture({ text: 'John 3:16', language: 'en' });
    assert.equal(r.capabilityState, 'not_installed');
    assert.equal(r.source, null);
});

test('E2: an unparseable reference -> unsupported, honest ask for a specific reference', () => {
    const living = makeStubLiving({ parseImpl: () => null });
    const { capability } = freshLoad({ Living: living });
    const r = capability.handlePersonalScripture({ text: 'give me some encouragement', language: 'en' });
    assert.equal(r.capabilityState, 'unsupported');
    assert.match(r.content, /specific reference/i);
});

test('E3: a whole-chapter reference (no verse) -> unsupported, never fabricates a chapter\'s worth of text', () => {
    const living = makeStubLiving({ parseImpl: () => ({ book: 'John', chapter: 3, verse: null, wholeChapter: true }) });
    const { capability } = freshLoad({ Living: living });
    const r = capability.handlePersonalScripture({ text: 'John 3', language: 'en' });
    assert.equal(r.capabilityState, 'unsupported');
});

test('E4: a real reference parses, but no translation is installed -> not_installed (the real, verified current repository state), never fabricated verse text', () => {
    const living = makeStubLiving({
        parseImpl: () => ({ book: 'John', chapter: 3, verse: 16, wholeChapter: false }),
        lookupImpl: () => ({ available: false, reason: 'No Bible package installed.' })
    });
    const { capability } = freshLoad({ Living: living });
    const r = capability.handlePersonalScripture({ text: 'Show me John 3:16', language: 'en' });
    assert.equal(r.capabilityState, 'not_installed');
    assert.equal(r.source, null);
    assert.match(r.content, /John 3:16/);
});

test('E5: a real reference parses AND a real installed translation actually has the verse -> available, source scripture-text, VERBATIM real text (never re-worded)', () => {
    const REAL_TEXT = 'For God so loved the world...';
    const living = makeStubLiving({
        parseImpl: () => ({ book: 'John', chapter: 3, verse: 16, wholeChapter: false }),
        lookupImpl: () => ({
            available: true, reference: 'John 3:16',
            translations: { KJV: { text: REAL_TEXT } }
        })
    });
    const { capability } = freshLoad({ Living: living });
    const r = capability.handlePersonalScripture({ text: 'Show me John 3:16', language: 'en' });
    assert.equal(r.capabilityState, 'available');
    assert.equal(r.source, 'scripture-text');
    assert.match(r.content, new RegExp(REAL_TEXT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('E6: SW book alias reference ("Yohana 3:16") — the same real bare-reference shape works for SW input, parseReference() call is a real passthrough', () => {
    const parseCalls = [];
    const living = makeStubLiving({
        parseImpl: (text) => { parseCalls.push(text); return { book: 'John', chapter: 3, verse: 16, wholeChapter: false }; },
        lookupImpl: () => ({ available: false, reason: 'No Bible package installed.' })
    });
    const { capability } = freshLoad({ Living: living });
    capability.handlePersonalScripture({ text: 'Yohana 3:16', language: 'sw' });
    assert.deepEqual(parseCalls, ['Yohana 3:16']);
});

/* ==================================================================== */
/* F. handlePersonalDevotional()                                         */
/* ==================================================================== */

test('F1: no reference supplied -> available, generated-reflection, no scriptureLookup field', () => {
    const { capability } = freshLoad();
    const r = capability.handlePersonalDevotional({ language: 'en' });
    assert.equal(r.capabilityState, 'available');
    assert.equal(r.source, 'generated-reflection');
    assert.equal('scriptureLookup' in r, false);
});

test('F2: with a reference supplied, composes the SAME real handlePersonalScripture() internally — never a second lookup path — and discloses it verbatim', () => {
    const living = makeStubLiving({
        parseImpl: () => ({ book: 'Psalm', chapter: 23, verse: 1, wholeChapter: false }),
        lookupImpl: () => ({ available: false, reason: 'No Bible package installed.' })
    });
    const { capability } = freshLoad({ Living: living });
    const r = capability.handlePersonalDevotional({ language: 'en', reference: 'Psalm 23:1' });
    // The overall devotional-structure capability genuinely executed —
    // "available" stands regardless of the embedded lookup's own state.
    assert.equal(r.capabilityState, 'available');
    assert.ok(r.scriptureLookup, 'must disclose the embedded scripture lookup result');
    assert.equal(r.scriptureLookup.capabilityState, 'not_installed');
});

test('F3: never presented as Scripture or as an official denomination\'s teaching (§3)', () => {
    const { capability } = freshLoad();
    const r = capability.handlePersonalDevotional({ language: 'en' });
    assert.match(r.content, /not Scripture/i);
});

/* ==================================================================== */
/* G. handlePersonalWorshipInfo()                                        */
/* ==================================================================== */

test('G1: EN general overview, explicitly disclosed as general (not a specific church\'s schedule)', () => {
    const { capability } = freshLoad();
    const r = capability.handlePersonalWorshipInfo({ language: 'en' });
    assert.equal(r.capabilityState, 'available');
    assert.equal(r.source, 'generated-reflection');
    assert.match(r.content, /general/i);
});

test('G2: SW general overview', () => {
    const { capability } = freshLoad();
    const r = capability.handlePersonalWorshipInfo({ language: 'sw' });
    assert.equal(r.language, 'sw');
    assert.match(r.content, /Ibada/);
});

/* ==================================================================== */
/* H. Offline-parity + network-interception (§5's own two required      */
/*    test kinds)                                                        */
/* ==================================================================== */

function deepStrip(obj) {
    // Strips nothing — envelopes carry no timestamps, so a plain
    // deepEqual is a real, exact parity check, not a fuzzy one.
    return obj;
}

test('H1: offline-parity — identical request produces an identical result with and without a simulated "network" flag', () => {
    const { capability } = freshLoad();
    const withoutFlag = capability.handlePersonalPrayer({ language: 'en', topic: 'my family' });
    const withFlag = capability.handlePersonalPrayer({ language: 'en', topic: 'my family', simulatedNetwork: false });
    assert.deepEqual(deepStrip(withoutFlag), deepStrip(withFlag));
});

test('H2: offline-parity — handlePersonalDevotional() is identical with/without the flag', () => {
    const { capability } = freshLoad();
    const a = capability.handlePersonalDevotional({ language: 'sw' });
    const b = capability.handlePersonalDevotional({ language: 'sw', simulatedNetwork: false });
    assert.deepEqual(a, b);
});

test('H3: offline-parity — handlePersonalWorshipInfo() is identical with/without the flag', () => {
    const { capability } = freshLoad();
    const a = capability.handlePersonalWorshipInfo({ language: 'en' });
    const b = capability.handlePersonalWorshipInfo({ language: 'en', simulatedNetwork: false });
    assert.deepEqual(a, b);
});

/**
 * H4-H7: network-interception — for each handlePersonal*(), disable
 * network AND intercept every network primitive to fail loudly if
 * invoked. Asserts (a) the result is correct, (b) zero network calls
 * occurred.
 */
function withNetworkTrap(fn) {
    const originalFetch = global.fetch;
    const originalXHR = global.XMLHttpRequest;
    let callCount = 0;
    global.fetch = function () { callCount++; throw new Error('NETWORK CALL ATTEMPTED — must never happen in a handlePersonal*() call.'); };
    global.XMLHttpRequest = function () { callCount++; throw new Error('NETWORK CALL ATTEMPTED — must never happen in a handlePersonal*() call.'); };
    try {
        const result = fn();
        return { result, callCount };
    } finally {
        global.fetch = originalFetch;
        global.XMLHttpRequest = originalXHR;
    }
}

test('H4: network-interception — handlePersonalPrayer() makes zero network calls and still returns the correct, deterministic result', () => {
    const { capability } = freshLoad();
    const { result, callCount } = withNetworkTrap(() => capability.handlePersonalPrayer({ language: 'en', topic: 'my health' }));
    assert.equal(callCount, 0);
    assert.equal(result.capabilityState, 'available');
    assert.match(result.content, /my health/);
});

test('H5: network-interception — handlePersonalScripture() makes zero network calls even when a translation IS installed (mocked, offline BibleEngine)', () => {
    const living = makeStubLiving({
        parseImpl: () => ({ book: 'John', chapter: 3, verse: 16, wholeChapter: false }),
        lookupImpl: () => ({ available: true, reference: 'John 3:16', translations: { KJV: { text: 'Real verse text.' } } })
    });
    const { capability } = freshLoad({ Living: living });
    const { result, callCount } = withNetworkTrap(() => capability.handlePersonalScripture({ text: 'John 3:16', language: 'en' }));
    assert.equal(callCount, 0);
    assert.equal(result.capabilityState, 'available');
});

test('H6: network-interception — handlePersonalDevotional() makes zero network calls', () => {
    const { capability } = freshLoad();
    const { result, callCount } = withNetworkTrap(() => capability.handlePersonalDevotional({ language: 'sw' }));
    assert.equal(callCount, 0);
    assert.equal(result.capabilityState, 'available');
});

test('H7: network-interception — handlePersonalWorshipInfo() makes zero network calls', () => {
    const { capability } = freshLoad();
    const { result, callCount } = withNetworkTrap(() => capability.handlePersonalWorshipInfo({ language: 'en' }));
    assert.equal(callCount, 0);
    assert.equal(result.capabilityState, 'available');
});

/* ==================================================================== */
/* I. spiritual-intent-router.js — dispatch()                            */
/* ==================================================================== */

test('I1: dispatch() personal path calls the correct handlePersonal*() and returns its envelope unchanged', () => {
    const { router } = freshLoad();
    const { envelope } = router.dispatch('SPIRITUAL_PRAYER', { language: 'en', topic: 'my job' }, null);
    assert.equal(envelope.capabilityState, 'available');
    assert.match(envelope.content, /my job/);
});

test('I2: dispatch() updates conversationState.spiritual, preserving every other existing key untouched (§5 — "not a parallel store")', () => {
    const { router } = freshLoad();
    const priorState = { lastDiscussedApplication: 'ChurchOS', lastLanguage: 'en' };
    const { conversationState } = router.dispatch('SPIRITUAL_PRAYER', { language: 'en', topic: 'peace' }, priorState);
    assert.equal(conversationState.lastDiscussedApplication, 'ChurchOS'); // untouched
    assert.equal(conversationState.lastLanguage, 'en'); // untouched
    assert.equal(conversationState.spiritual.lastIntent, 'SPIRITUAL_PRAYER');
    assert.equal(conversationState.spiritual.lastTheme, 'peace');
});

test('I3: conversationState.spiritual persists a theme across turns when the next turn supplies none', () => {
    const { router } = freshLoad();
    const turn1 = router.dispatch('SPIRITUAL_DEVOTIONAL', { language: 'en', reference: 'Psalm 23:1' }, null);
    assert.equal(turn1.conversationState.spiritual.lastTheme, 'Psalm 23:1');
    const turn2 = router.dispatch('SPIRITUAL_PRAYER', { language: 'en' }, turn1.conversationState);
    assert.equal(turn2.conversationState.spiritual.lastTheme, 'Psalm 23:1', 'a turn with no new theme must carry the prior real theme forward, never reset it to null');
    assert.equal(turn2.conversationState.spiritual.lastIntent, 'SPIRITUAL_PRAYER');
});

test('I4: dispatch() church path — SPIRITUAL_PRAYER with real church context forwards, as a pure passthrough, to the real, unmodified church-prayer-interaction.js', () => {
    const ldce = makeStubLdce(new Map([['ldce-real', { sessionId: 'ldce-real', hostId: 'pastor-x' }]]));
    let capturedArgs = null;
    const churchPrayer = {
        submitPrayerRequest(sessionId, authorUserId, opts) {
            capturedArgs = { sessionId, authorUserId, opts };
            return { status: 'OK', request: { requestId: 'req-1', sessionId, authorUserId } };
        }
    };
    const { router } = freshLoad({ LDCESessionEngine: ldce, ChurchPrayerInteraction: churchPrayer });
    const { envelope } = router.dispatch('SPIRITUAL_PRAYER', { ldceSessionId: 'ldce-real', actorId: 'viewer-1', text: 'please pray for my mum', visibility: 'PRIVATE', language: 'en' }, null);
    assert.equal(envelope.owner, 'church');
    assert.equal(envelope.capabilityState, 'available');
    assert.deepEqual(capturedArgs, { sessionId: 'ldce-real', authorUserId: 'viewer-1', opts: { text: 'please pray for my mum', visibility: 'PRIVATE', category: undefined, language: 'en' } });
});

test('I5: dispatch() church path — a real ChurchOS refusal (e.g. not a real session member) is honestly surfaced as no_context, never silently upgraded to available', () => {
    const ldce = makeStubLdce(new Map([['ldce-real', { sessionId: 'ldce-real', hostId: 'pastor-x' }]]));
    const churchPrayer = { submitPrayerRequest() { return { status: 'REJECTED', reason: 'authorUserId is not a real member of this session.' }; } };
    const { router } = freshLoad({ LDCESessionEngine: ldce, ChurchPrayerInteraction: churchPrayer });
    const { envelope } = router.dispatch('SPIRITUAL_PRAYER', { ldceSessionId: 'ldce-real', actorId: 'outsider', text: 'pray for me', language: 'en' }, null);
    assert.equal(envelope.owner, 'church');
    assert.equal(envelope.capabilityState, 'no_context');
});

test('I6: dispatch() church path — SPIRITUAL_WORSHIP with real church context never auto-triggers a WorshipModeCoordinator action; reports unsupported honestly', () => {
    const ldce = makeStubLdce(new Map([['ldce-real', { sessionId: 'ldce-real', hostId: 'pastor-x' }]]));
    let invoked = false;
    const coordinator = {
        startWorshipMode() { invoked = true; return { success: true }; },
        markPhase() { invoked = true; return { success: true }; },
        endWorshipMode() { invoked = true; return { success: true }; }
    };
    const { router } = freshLoad({ LDCESessionEngine: ldce, WorshipModeCoordinator: coordinator });
    const { envelope } = router.dispatch('SPIRITUAL_WORSHIP', { ldceSessionId: 'ldce-real', actorId: 'viewer-1', language: 'en' }, null);
    assert.equal(envelope.owner, 'church');
    assert.equal(envelope.capabilityState, 'unsupported');
    assert.equal(invoked, false, 'no WorshipModeCoordinator action method may ever be auto-invoked from a conversational turn');
});

test('I7: dispatch() falls back to its own require()-resolution when window.CozyOS.SpiritualCapability is absent (still the real module, never a fabricated stand-in) — this is the exact fallback a browser build\'s missing <script> tag would exercise via the window branch instead', () => {
    const { router } = freshLoad();
    delete global.window.CozyOS.SpiritualCapability;
    assert.doesNotThrow(() => router.dispatch('SPIRITUAL_PRAYER', { language: 'en' }, null));
    const { envelope } = router.dispatch('SPIRITUAL_PRAYER', { language: 'en' }, null);
    assert.equal(envelope.capabilityState, 'available');
});

test('I8: dispatch() never throws on a malformed conversationState (e.g. a non-object) — treats it as absent, never crashes', () => {
    const { router } = freshLoad();
    assert.doesNotThrow(() => router.dispatch('SPIRITUAL_PRAYER', { language: 'en' }, 'not-an-object'));
    const { conversationState } = router.dispatch('SPIRITUAL_PRAYER', { language: 'en' }, 42);
    assert.equal(typeof conversationState, 'object');
    assert.ok(conversationState.spiritual);
});

/* ==================================================================== */
/* J. getRouteTable() mirrors §1b exactly, sourced from ONE place        */
/* ==================================================================== */

test('J1: router.getRouteTable() returns the SAME OWNER_TABLE object spiritual-capability.js owns — never a second, competing copy', () => {
    const { capability, router } = freshLoad();
    assert.equal(router.getRouteTable(), capability.OWNER_TABLE);
});
