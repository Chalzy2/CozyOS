'use strict';

/**
 * core/living/tests/phase4-pastor-question-flow.test.js
 * PHASE 4 — ENHANCED COZY BOUNDARY (Live Session Privacy): explicit
 * "send this to the pastor/moderator" workflow, end to end through the
 * REAL stack — ldce-session-engine.js, organization-registry.js/
 * organization-membership.js, church-worship-session.js,
 * church-live-session-controller.js (real startSession() pairing a real
 * LDCE session with a real ChurchWorshipSession service — the exact
 * liveSessionId/ldceSessionId relationship cozy-ai.js's own live-
 * session-context hook already depends on), church-live-moderation.js/
 * church-live-moderation-controls.js (the real, previously-built
 * questions ON/OFF toggle + this checkpoint's new private submitQuestion()
 * store), cozy-language-templates.js/cozy-language-realize.js, and the
 * two new files this checkpoint adds: cozy-pastor-question-intent.js +
 * cozy-pastor-question-flow.js.
 *
 * HARNESS DISCLOSURE: same STUBBED IdentityEngine/CozyConversation and
 * SpeechRecognitionAdapter.isReal() as the sibling
 * church-live-session-controller.test.js suite (real, disclosed
 * environment limitation — no real browser Web Speech API in Node).
 *
 * Run with: node --test core/living/tests/phase4-pastor-question-flow.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const INTENT_PATH = path.join(__dirname, '..', 'cozy-pastor-question-intent.js');
const FLOW_PATH = path.join(__dirname, '..', 'cozy-pastor-question-flow.js');
const TEMPLATES_PATH = path.join(__dirname, '..', '..', 'modules', 'intelligence', 'language', 'cozy-language-templates.js');
const REALIZE_PATH = path.join(__dirname, '..', '..', 'modules', 'intelligence', 'language', 'cozy-language-realize.js');
const LDCE_PATH = path.join(__dirname, '..', '..', 'modules', 'communication', 'ldce-session-engine.js');
const ORG_REGISTRY_PATH = path.join(__dirname, '..', '..', 'organization', 'organization-registry.js');
const ORG_MEMBERSHIP_PATH = path.join(__dirname, '..', '..', 'organization', 'organization-membership.js');
const WORSHIP_PATH = path.join(__dirname, '..', '..', 'modules', 'ChurchOS', 'church-worship-session.js');
const SESSION_CTL_PATH = path.join(__dirname, '..', '..', 'modules', 'ChurchOS', 'church-live-session-controller.js');
const MOD1_PATH = path.join(__dirname, '..', '..', 'modules', 'ChurchOS', 'church-live-moderation.js');
const MOD_CTL_PATH = path.join(__dirname, '..', '..', 'modules', 'ChurchOS', 'church-live-moderation-controls.js');

/* ------------------------------------------------------------------ */
/* A: the intent detector alone (pure logic)                           */
/* ------------------------------------------------------------------ */

function freshIntent() {
    try { delete require.cache[require.resolve(INTENT_PATH)]; } catch (_e) { /* not loaded */ }
    global.window = { CozyOS: {} };
    require(INTENT_PATH);
    return global.window.CozyOS.CozyPastorQuestionIntent;
}

test('A1: EN explicit marker with a trailing question is detected', () => {
    const intent = freshIntent();
    const r = intent.detectPastorQuestionIntent('Ask the pastor: what time is baptism class?', 'en');
    assert.equal(r.isPastorQuestion, true);
    assert.equal(r.questionText, 'what time is baptism class?');
});

test('A2: SW explicit marker is detected', () => {
    const intent = freshIntent();
    const r = intent.detectPastorQuestionIntent('Tuma kwa mchungaji: huduma inaanza saa ngapi?', 'sw');
    assert.equal(r.isPastorQuestion, true);
    assert.equal(r.questionText, 'huduma inaanza saa ngapi?');
});

test('A3: a bare marker with nothing after it falls back to the whole message, never a fabricated question', () => {
    const intent = freshIntent();
    const r = intent.detectPastorQuestionIntent('Ask the pastor', 'en');
    assert.equal(r.isPastorQuestion, true);
    assert.equal(r.questionText, 'Ask the pastor');
});

test('A4: an ordinary message with no marker is never treated as a pastor question', () => {
    const intent = freshIntent();
    const r = intent.detectPastorQuestionIntent('What time is baptism class?', 'en');
    assert.equal(r.isPastorQuestion, false);
});

/* ------------------------------------------------------------------ */
/* B: the full real-stack orchestrator                                 */
/* ------------------------------------------------------------------ */

function makeStubConversation() {
    const conversations = new Map();
    let n = 0;
    return {
        createConversation({ type, participants }) {
            const conversationId = `conv_${++n}`;
            conversations.set(conversationId, { conversationId, type, participants, state: 'created' });
            return { success: true, conversationId };
        },
        getConversation(id) { return conversations.get(id) || null; },
        startConversation(id) { const c = conversations.get(id); if (!c) return { success: false, reason: 'Unknown conversation.' }; c.state = 'active'; return { success: true }; },
        pauseConversation(id) { const c = conversations.get(id); if (!c) return { success: false, reason: 'Unknown conversation.' }; c.state = 'paused'; return { success: true }; },
        resumeConversation(id) { const c = conversations.get(id); if (!c) return { success: false, reason: 'Unknown conversation.' }; c.state = 'active'; return { success: true }; },
        endConversation(id) { const c = conversations.get(id); if (!c) return { success: false, reason: 'Unknown conversation.' }; c.state = 'ended'; return { success: true }; },
        cancelConversation(id) { const c = conversations.get(id); if (!c) return { success: false, reason: 'Unknown conversation.' }; c.state = 'cancelled'; return { success: true }; },
        addTranscriptSegment() {},
    };
}

function makeStubIdentity() {
    const users = new Map();
    const grants = new Map();
    return {
        registerUser(userId, extra = {}) { users.set(userId, extra); },
        getUser(userId) {
            const u = users.get(userId);
            if (!u) return null;
            return { userId, username: userId, roles: [], status: 'active', orgId: u.orgId || null, country: u.country || null };
        },
        isPlatformAdmin() { return false; },
        grantResourcePermission(userId, permissionString) {
            if (!grants.has(userId)) grants.set(userId, new Set());
            grants.get(userId).add(permissionString);
            return true;
        },
        checkResourcePermission(userId, permissionString) {
            return !!(grants.get(userId) && grants.get(userId).has(permissionString));
        },
    };
}

function freshStack() {
    [LDCE_PATH, ORG_REGISTRY_PATH, ORG_MEMBERSHIP_PATH, WORSHIP_PATH, SESSION_CTL_PATH, MOD1_PATH, MOD_CTL_PATH, TEMPLATES_PATH, REALIZE_PATH, INTENT_PATH, FLOW_PATH]
        .forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    const identity = makeStubIdentity();
    global.window = {
        CozyOS: {
            CozyConversation: makeStubConversation(),
            IdentityEngine: identity,
            SpeechRecognitionAdapter: { isReal: () => true }, // real, disclosed Node environment limitation — see header
        }
    };
    require(LDCE_PATH);
    require(ORG_REGISTRY_PATH);
    require(ORG_MEMBERSHIP_PATH);
    require(WORSHIP_PATH);
    require(SESSION_CTL_PATH);
    require(MOD1_PATH);
    require(MOD_CTL_PATH);
    require(TEMPLATES_PATH);
    require(REALIZE_PATH);
    require(INTENT_PATH);
    require(FLOW_PATH);
    return {
        ldce: global.window.CozyOS.LDCESessionEngine,
        orgRegistry: global.window.CozyOS.OrganizationRegistry,
        membership: global.window.CozyOS.OrganizationMembership,
        sessionCtl: global.window.CozyOS.ChurchLiveSessionController,
        modCtl: global.window.CozyOS.ChurchLiveModerationControls,
        flow: global.window.CozyOS.CozyPastorQuestionFlow,
        identity,
    };
}

/** Starts a real, org-authorized worship session AND joins a real participant to its paired LDCE session — the exact real bundle cozy-ai.js's own live-worship-session context and this checkpoint's pastor-question flow both depend on. */
async function startRealLiveSession(stack, { pastorId = 'pastor-1', participantIds = [] } = {}) {
    const org = stack.orgRegistry.createOrganization({ name: 'Grace Church', type: 'Church' });
    stack.identity.registerUser(pastorId, { orgId: org.orgId });
    stack.membership.createMembership({ userId: pastorId, organizationId: org.orgId, status: 'active', permissions: ['churchos-live:manage'] });

    const started = await stack.sessionCtl.startSession({ orgId: org.orgId, actorId: pastorId, sourceLanguage: 'en' });
    assert.equal(started.success, true, JSON.stringify(started));

    for (const uid of participantIds) {
        stack.identity.registerUser(uid, { orgId: org.orgId });
        const invite = stack.ldce.inviteParticipant(started.ldceSessionId, pastorId, uid);
        assert.equal(invite.success, true, `invite for ${uid}: ${invite.reason}`);
        const join = stack.ldce.joinSession(started.ldceSessionId, uid);
        assert.equal(join.success, true, `join for ${uid}: ${join.reason}`);
    }
    return { org, pastorId, worshipServiceId: started.worshipServiceId, ldceSessionId: started.ldceSessionId };
}

test('B1: with no active live session, the flow honestly refuses rather than silently dropping the message', () => {
    const stack = freshStack();
    const result = stack.flow.processTurn('Ask the pastor: what time is service?', { actorId: 'someone', language: 'en', liveSessionId: null });
    assert.equal(result.matched, true);
    assert.equal(result.evidence, 'REFUSED');
    assert.match(result.content, /no active live session/i);
});

test('B2: with questions disabled for the session, the flow reports the real refusal reason from submitQuestion()', async () => {
    const stack = freshStack();
    const session = await startRealLiveSession(stack, { participantIds: ['viewer-a'] });
    // Never enabled.
    const result = stack.flow.processTurn('Ask the pastor: what time is service?', { actorId: 'viewer-a', language: 'en', liveSessionId: session.worshipServiceId });
    assert.equal(result.matched, true);
    assert.equal(result.evidence, 'REFUSED');
    assert.match(result.content, /not enabled questions/i);
});

test('B3: end to end — a real participant\'s explicit message is privately submitted, and the flow confirms it honestly', async () => {
    const stack = freshStack();
    const session = await startRealLiveSession(stack, { participantIds: ['viewer-a'] });
    stack.modCtl.setQuestionsEnabled(session.ldceSessionId, session.pastorId, true);

    const result = stack.flow.processTurn('Ask the pastor: what time is baptism class?', { actorId: 'viewer-a', language: 'en', liveSessionId: session.worshipServiceId });
    assert.equal(result.matched, true);
    assert.equal(result.evidence, 'VERIFIED');
    assert.match(result.content, /sent privately to the pastor/i);
    // Never leaks the question text back into the confirmation itself.
    assert.doesNotMatch(result.content, /baptism/i);

    // The real, private record exists, visible only via the real store.
    const mine = stack.modCtl.listMyQuestions(session.ldceSessionId, 'viewer-a');
    assert.equal(mine.questions.length, 1);
    assert.equal(mine.questions[0].text, 'what time is baptism class?');

    const inbox = stack.modCtl.listQuestionsForModerator(session.ldceSessionId, session.pastorId);
    assert.equal(inbox.questions.length, 1);
});

test('B4: an ordinary message with no explicit marker never triggers submission (true no-op)', async () => {
    const stack = freshStack();
    const session = await startRealLiveSession(stack, { participantIds: ['viewer-a'] });
    stack.modCtl.setQuestionsEnabled(session.ldceSessionId, session.pastorId, true);

    const result = stack.flow.processTurn('What time is baptism class?', { actorId: 'viewer-a', language: 'en', liveSessionId: session.worshipServiceId });
    assert.equal(result.matched, false);
    assert.equal(stack.modCtl.listMyQuestions(session.ldceSessionId, 'viewer-a').questions.length, 0);
});

test('B5: someone who is not a real participant of this session is honestly refused, never silently submitted', async () => {
    const stack = freshStack();
    const session = await startRealLiveSession(stack, { participantIds: [] });
    stack.modCtl.setQuestionsEnabled(session.ldceSessionId, session.pastorId, true);
    stack.identity.registerUser('outsider', {});

    const result = stack.flow.processTurn('Ask the pastor: can I join?', { actorId: 'outsider', language: 'en', liveSessionId: session.worshipServiceId });
    assert.equal(result.matched, true);
    assert.equal(result.evidence, 'REFUSED');
    assert.equal(stack.modCtl.listQuestionsForModerator(session.ldceSessionId, session.pastorId).questions.length, 0);
});

test('B6: Kiswahili end to end — the confirmation is realized in Kiswahili via the universal seam', async () => {
    const stack = freshStack();
    const session = await startRealLiveSession(stack, { participantIds: ['viewer-b'] });
    stack.modCtl.setQuestionsEnabled(session.ldceSessionId, session.pastorId, true);

    const result = stack.flow.processTurn('Tuma kwa mchungaji: huduma inaanza saa ngapi?', { actorId: 'viewer-b', language: 'sw', liveSessionId: session.worshipServiceId });
    assert.equal(result.matched, true);
    assert.equal(result.evidence, 'VERIFIED');
    assert.match(result.content, /faragha/i); // "privately" in Kiswahili
});
