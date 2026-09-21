'use strict';

/**
 * core/modules/intelligence/tests/phase4-live-session-cross-participant-isolation.test.js
 * PHASE 4 (P4-14) — ENHANCED COZY BOUNDARY (Live Session Privacy): the
 * literal cross-user isolation proof the spec requires, with TWO real,
 * distinct participants inside the SAME real live session (one real LDCE
 * session paired with one real ChurchWorshipSession service, via the
 * real church-live-session-controller.js — the exact bundle cozy-ai.js's
 * own getContext({liveSessionId}) already composes).
 *
 * Proves, through the real, unmodified window.CozyOS.CozyAI.getContext()
 * — the actual orchestrator every Live Window question goes through, not
 * a re-implementation of its logic:
 *
 *   1. Participant A's private pastor/moderator question is invisible to
 *      Participant B (church-live-moderation-controls.js's own
 *      actorId-scoped listMyQuestions()); only the real host/moderator
 *      sees it via listQuestionsForModerator().
 *   2. Participant A's USER-scope Teach-Cozy content (Phase 3
 *      CozyLearn/CozyTeachFlow, composed by cozy-ai.js's own "cozy-teach"
 *      authority) is never surfaced when Participant B asks Cozy the
 *      same question in the SAME live session.
 *   3. The public/session-restricted "live-worship-session" context
 *      (transcript/timeline/questions-on-off) IS available to both A and
 *      B — being in the same session does not mean LESS access to
 *      genuinely public session content, only no access to each OTHER's
 *      private content.
 *   4. The role-restricted "live-support-diagnostics" entry never
 *      appears for an ordinary participant's call, even with a real
 *      liveSessionId — it exists at all only when a caller explicitly
 *      supplies supportScope (an ordinary Live Window question never
 *      does).
 *
 * HARNESS DISCLOSURE: real, unmodified production code throughout — the
 * real ldce-session-engine.js, organization-registry.js/-membership.js,
 * church-worship-session.js, church-live-session-controller.js,
 * church-live-moderation.js/-controls.js, cozy-memory-engine.js,
 * cozy-learn.js, cozy-teach-intent.js/cozy-teach-flow.js,
 * cozy-pastor-question-intent.js/-flow.js, cozy-language-templates.js/
 * -realize.js, and cozy-ai.js itself. STUBBED: IdentityEngine/
 * CozyConversation/SpeechRecognitionAdapter.isReal() — the same
 * disclosed contract-only stubs every sibling ChurchOS live-session test
 * in this repository already uses. FounderStory/Vault/CozyKnowledge are
 * deliberately NOT loaded — cozy-ai.js's own lazy, read-at-call-time
 * composition (window.CozyOS.X, never a hard require) means those
 * authorities simply do not fire, which this suite does not need; every
 * authority it DOES need (cozy-teach, cozy-pastor-question,
 * live-worship-session, live-support-diagnostics) is real and loaded.
 *
 * Run with: node --test core/modules/intelligence/tests/phase4-live-session-cross-participant-isolation.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const roots = {
    memory: path.join(__dirname, '..', '..', 'memory', 'cozy-memory-engine.js'),
    cozyLearn: path.join(__dirname, '..', '..', '..', 'living', 'cozy-learn.js'),
    teachIntent: path.join(__dirname, '..', '..', '..', 'living', 'cozy-teach-intent.js'),
    teachFlow: path.join(__dirname, '..', '..', '..', 'living', 'cozy-teach-flow.js'),
    templates: path.join(__dirname, '..', 'language', 'cozy-language-templates.js'),
    realize: path.join(__dirname, '..', 'language', 'cozy-language-realize.js'),
    pastorIntent: path.join(__dirname, '..', '..', '..', 'living', 'cozy-pastor-question-intent.js'),
    pastorFlow: path.join(__dirname, '..', '..', '..', 'living', 'cozy-pastor-question-flow.js'),
    cozyAi: path.join(__dirname, '..', 'cozy-ai.js'),
    ldce: path.join(__dirname, '..', '..', 'communication', 'ldce-session-engine.js'),
    orgRegistry: path.join(__dirname, '..', '..', '..', 'organization', 'organization-registry.js'),
    orgMembership: path.join(__dirname, '..', '..', '..', 'organization', 'organization-membership.js'),
    worship: path.join(__dirname, '..', '..', 'ChurchOS', 'church-worship-session.js'),
    sessionCtl: path.join(__dirname, '..', '..', 'ChurchOS', 'church-live-session-controller.js'),
    mod1: path.join(__dirname, '..', '..', 'ChurchOS', 'church-live-moderation.js'),
    modCtl: path.join(__dirname, '..', '..', 'ChurchOS', 'church-live-moderation-controls.js')
};

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
    Object.values(roots).forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    const identity = makeStubIdentity();
    global.window = {
        CozyOS: {
            CozyConversation: makeStubConversation(),
            IdentityEngine: identity,
            SpeechRecognitionAdapter: { isReal: () => true }, // real, disclosed Node environment limitation
            DeveloperIdentity: { answerWhoCreatedYou: () => ({ known: false }), answerWhyCreated: () => ({ known: false }) },
            ServiceRegistry: { listApplications: () => [] },
            ProviderManager: { register() {}, healthReport: () => ({}) }
        },
        addEventListener: () => {}, dispatchEvent: () => {}
    };
    Object.values(roots).forEach((p) => require(p));
    return {
        ai: global.window.CozyOS.CozyAI,
        ldce: global.window.CozyOS.LDCESessionEngine,
        orgRegistry: global.window.CozyOS.OrganizationRegistry,
        membership: global.window.CozyOS.OrganizationMembership,
        sessionCtl: global.window.CozyOS.ChurchLiveSessionController,
        modCtl: global.window.CozyOS.ChurchLiveModerationControls,
        identity
    };
}

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

/* ------------------------------------------------------------------ */
/* 1. PRIVATE PASTOR QUESTIONS — cross-participant isolation            */
/* ------------------------------------------------------------------ */

test('1: Participant A\'s private pastor question is invisible to Participant B; only the real host sees it', async () => {
    const stack = freshStack();
    const session = await startRealLiveSession(stack, { participantIds: ['participant-a', 'participant-b'] });
    stack.modCtl.setQuestionsEnabled(session.ldceSessionId, session.pastorId, true);

    const resultA = await stack.ai.getContext('Ask the pastor: can you pray for my sick mother?', { actorId: 'participant-a', liveSessionId: session.worshipServiceId });
    assert.equal(resultA.results[0].authority, 'cozy-pastor-question');
    assert.match(resultA.results[0].content, /sent privately/i);

    // Participant B's own view never contains A's question.
    const bView = stack.modCtl.listMyQuestions(session.ldceSessionId, 'participant-b');
    assert.equal(bView.questions.length, 0);

    // Participant B cannot even read the moderator inbox to look for it.
    const bAttempt = stack.modCtl.listQuestionsForModerator(session.ldceSessionId, 'participant-b');
    assert.equal(bAttempt.status, 'NOT_AUTHORIZED');

    // Only the real host sees it.
    const inbox = stack.modCtl.listQuestionsForModerator(session.ldceSessionId, session.pastorId);
    assert.equal(inbox.questions.length, 1);
    assert.equal(inbox.questions[0].askedBy, 'participant-a');
    assert.match(inbox.questions[0].text, /sick mother/i);
});

/* ------------------------------------------------------------------ */
/* 2. TEACH COZY — USER-scope taught knowledge stays private            */
/* ------------------------------------------------------------------ */

test('2: Participant A\'s USER-scope taught fact is never surfaced when Participant B asks Cozy the same thing in the SAME live session', async () => {
    const stack = freshStack();
    const session = await startRealLiveSession(stack, { participantIds: ['participant-a', 'participant-b'] });

    // A teaches Cozy something private, in the live session.
    const teach = await stack.ai.getContext('I want to teach you that our small group meets on Thursdays', { actorId: 'participant-a', liveSessionId: session.worshipServiceId });
    assert.equal(teach.results[0].authority, 'cozy-teach');
    assert.match(teach.results[0].content, /confirm|yes|no/i);

    // A confirms it (CozyTeachFlow's real pending-confirmation state carried forward exactly as Phase 3 already proved elsewhere).
    const teachConversationState = teach.teachDataConversationState;
    assert.ok(teachConversationState, 'expected a real pending confirmation state');
    const confirmed = await stack.ai.getContext('yes', { actorId: 'participant-a', liveSessionId: session.worshipServiceId, teachConversationState });
    assert.equal(confirmed.results[0].authority, 'cozy-teach');

    // B asks the SAME question in the SAME live session — must never see A's private taught content.
    const bResult = await stack.ai.getContext('When does our small group meet?', { actorId: 'participant-b', liveSessionId: session.worshipServiceId });
    const joined = JSON.stringify(bResult.results);
    assert.doesNotMatch(joined, /Thursdays/i);
});

/* ------------------------------------------------------------------ */
/* 3. PUBLIC SESSION CONTEXT — available to BOTH participants           */
/* ------------------------------------------------------------------ */

test('3: the public/session-restricted live-worship-session context (questions ON/OFF) is available to BOTH participants — isolation never means less real, public access', async () => {
    const stack = freshStack();
    const session = await startRealLiveSession(stack, { participantIds: ['participant-a', 'participant-b'] });
    stack.modCtl.setQuestionsEnabled(session.ldceSessionId, session.pastorId, true);

    for (const actorId of ['participant-a', 'participant-b']) {
        const result = await stack.ai.getContext('What is CozyOS?', { actorId, liveSessionId: session.worshipServiceId });
        const liveEntry = result.results.find((r) => r.authority === 'live-worship-session');
        assert.ok(liveEntry, `expected a live-worship-session entry for ${actorId}`);
        assert.match(liveEntry.content, /ENABLED/);
    }
});

/* ------------------------------------------------------------------ */
/* 4. ROLE-RESTRICTED CONTENT — never leaks to an ordinary participant  */
/* ------------------------------------------------------------------ */

test('4: the role-restricted live-support-diagnostics entry never appears for an ordinary participant\'s real Live Window call, even with a real liveSessionId', async () => {
    const stack = freshStack();
    const session = await startRealLiveSession(stack, { participantIds: ['participant-a'] });

    // An ordinary Live Window question never supplies supportScope —
    // exactly how cozy-living-assistant.js's own real call is shaped for
    // every non-admin-support entry point.
    const result = await stack.ai.getContext('What is CozyOS?', { actorId: 'participant-a', liveSessionId: session.worshipServiceId });
    const diagEntry = result.results.find((r) => r.authority === 'live-support-diagnostics');
    assert.equal(diagEntry, undefined, 'an ordinary participant call must never contain the role-restricted diagnostics entry');

    // Even an explicit attempt to smuggle a supportScope in without real
    // platform-admin + active grant evidence (OrganizationSupport is not
    // even loaded in this stack) is refused — never fabricated.
    const attempt = await stack.ai.getContext('What is CozyOS?', { actorId: 'participant-a', liveSessionId: session.worshipServiceId, supportScope: 'diagnose-live-session' });
    const diagAttempt = attempt.results.find((r) => r.authority === 'live-support-diagnostics');
    assert.equal(diagAttempt, undefined, 'supportScope alone, with no real platform-admin/grant evidence, must never produce the restricted entry');
});
