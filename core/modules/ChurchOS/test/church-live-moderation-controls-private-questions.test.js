'use strict';

/**
 * core/modules/ChurchOS/test/church-live-moderation-controls-private-questions.test.js
 * PHASE 4 — ENHANCED COZY BOUNDARY (Live Session Privacy): focused
 * regression suite for church-live-moderation-controls.js's new
 * submitQuestion()/listMyQuestions()/listQuestionsForModerator()/
 * answerQuestion() — the previously-absent "Participant -> Private Cozy
 * -> Submit to Pastor/Moderator -> Authorization/Moderation -> Recipient"
 * workflow.
 *
 * Reuses the SAME fixture harness (freshEngines()/makeSessionWithMembers())
 * as the sibling church-live-moderation-controls.test.js suite — real,
 * unmodified production ldce-session-engine.js/organization-*.js/
 * church-live-moderation.js/church-live-moderation-controls.js, with the
 * same disclosed IdentityEngine/CozyConversation stubs.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

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
    const platformAdmins = new Set();
    return {
        registerUser(userId, { orgId = null, country = null } = {}) { users.set(userId, { orgId, country }); },
        setPlatformAdmin(userId) { platformAdmins.add(userId); },
        isPlatformAdmin(userId) { return platformAdmins.has(userId); },
        getUser(userId) {
            const u = users.get(userId);
            if (!u) return null;
            return { userId, username: userId, roles: [], status: 'active', companyId: null, branchId: null, departmentId: null, teamId: null, languagePreference: null, country: u.country, orgId: u.orgId };
        },
        grantResourcePermission(userId, permissionString) {
            if (!users.has(userId)) throw new Error(`[StubIdentity] unknown userId "${userId}".`);
            if (!grants.has(userId)) grants.set(userId, new Set());
            grants.get(userId).add(permissionString);
            return true;
        },
        checkResourcePermission(userId, permissionString) { return !!(grants.get(userId) && grants.get(userId).has(permissionString)); },
    };
}

function freshEngines() {
    for (const p of [
        '../../communication/ldce-session-engine.js',
        '../../../organization/organization-registry.js',
        '../../../organization/organization-membership.js',
        '../../../organization/organization-role.js',
        '../church-live-moderation.js',
        '../church-live-moderation-controls.js'
    ]) {
        delete require.cache[require.resolve(p)];
    }
    const identity = makeStubIdentity();
    global.window = { CozyOS: { CozyConversation: makeStubConversation(), IdentityEngine: identity } };
    require('../../communication/ldce-session-engine.js');
    require('../../../organization/organization-registry.js');
    require('../../../organization/organization-membership.js');
    require('../../../organization/organization-role.js');
    require('../church-live-moderation.js');
    require('../church-live-moderation-controls.js');
    return {
        ldce: global.window.CozyOS.LDCESessionEngine,
        ctl: global.window.CozyOS.ChurchLiveModerationControls,
        identity,
    };
}

function makeSessionWithMembers(ldce, identity, hostId, memberIds) {
    identity.registerUser(hostId, {});
    const created = ldce.createSession(hostId, { type: 'classroom' });
    for (const uid of memberIds) {
        identity.registerUser(uid, {});
        const invite = ldce.inviteParticipant(created.sessionId, hostId, uid);
        assert.equal(invite.success, true, `invite for ${uid} should succeed: ${invite.reason}`);
        const join = ldce.joinSession(created.sessionId, uid);
        assert.equal(join.success, true, `join for ${uid} should succeed: ${join.reason}`);
    }
    return created.sessionId;
}

/* ------------------------------------------------------------------ */
/* SUBMISSION GATING                                                   */
/* ------------------------------------------------------------------ */

test('submitQuestion is REJECTED when the host has not enabled questions for this session', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const result = ctl.submitQuestion(sessionId, 'viewer-a', 'What time is the next service?');
    assert.equal(result.status, 'REJECTED');
    assert.equal(ctl.listMyQuestions(sessionId, 'viewer-a').questions.length, 0);
});

test('submitQuestion succeeds once the host enables questions, for a real session participant', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    ctl.setQuestionsEnabled(sessionId, 'host-1', true);
    const result = ctl.submitQuestion(sessionId, 'viewer-a', 'What time is the next service?');
    assert.equal(result.status, 'OK');
    assert.equal(result.question.askedBy, 'viewer-a');
    assert.equal(result.question.status, 'PENDING');
    assert.equal(result.question.answerText, null);
});

test('submitQuestion rejects someone who is not a real participant of this session', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    ctl.setQuestionsEnabled(sessionId, 'host-1', true);
    identity.registerUser('outsider', {});
    const result = ctl.submitQuestion(sessionId, 'outsider', 'Can I get in?');
    assert.equal(result.status, 'NOT_AUTHORIZED');
});

test('submitQuestion rejects an empty question and reports NOT_FOUND for an unknown session', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    ctl.setQuestionsEnabled(sessionId, 'host-1', true);
    assert.equal(ctl.submitQuestion(sessionId, 'viewer-a', '   ').status, 'REJECTED');
    assert.equal(ctl.submitQuestion('nonexistent-session', 'viewer-a', 'hi').status, 'NOT_FOUND');
});

/* ------------------------------------------------------------------ */
/* PRIVACY — the core of this checkpoint                               */
/* ------------------------------------------------------------------ */

test('CROSS-PARTICIPANT ISOLATION: listMyQuestions never returns another participant\'s question', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    ctl.setQuestionsEnabled(sessionId, 'host-1', true);
    ctl.submitQuestion(sessionId, 'viewer-a', 'Participant A\'s private question.');
    ctl.submitQuestion(sessionId, 'viewer-b', 'Participant B\'s private question.');

    const aView = ctl.listMyQuestions(sessionId, 'viewer-a');
    assert.equal(aView.questions.length, 1);
    assert.equal(aView.questions[0].text, "Participant A's private question.");

    const bView = ctl.listMyQuestions(sessionId, 'viewer-b');
    assert.equal(bView.questions.length, 1);
    assert.equal(bView.questions[0].text, "Participant B's private question.");

    // Neither participant's own view ever contains the other's text.
    assert.doesNotMatch(JSON.stringify(aView), /Participant B/);
    assert.doesNotMatch(JSON.stringify(bView), /Participant A/);
});

test('an ordinary participant cannot read the moderator inbox — listQuestionsForModerator is NOT_AUTHORIZED', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    ctl.setQuestionsEnabled(sessionId, 'host-1', true);
    ctl.submitQuestion(sessionId, 'viewer-a', 'Private to A.');
    const attempt = ctl.listQuestionsForModerator(sessionId, 'viewer-b');
    assert.equal(attempt.status, 'NOT_AUTHORIZED');
});

test('the real host sees every participant\'s question via listQuestionsForModerator (the "Authorization/Moderation" step)', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    ctl.setQuestionsEnabled(sessionId, 'host-1', true);
    ctl.submitQuestion(sessionId, 'viewer-a', 'From A.');
    ctl.submitQuestion(sessionId, 'viewer-b', 'From B.');
    const inbox = ctl.listQuestionsForModerator(sessionId, 'host-1');
    assert.equal(inbox.status, 'OK');
    assert.equal(inbox.questions.length, 2);
    const askers = inbox.questions.map((q) => q.askedBy).sort();
    assert.deepEqual(askers, ['viewer-a', 'viewer-b']);
});

test('a promoted LDCE moderator (not the host) can also read and answer the private inbox', async () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['mod-a', 'viewer-b']);
    const promote = await ldce.setParticipantRole(sessionId, 'host-1', 'mod-a', 'moderator');
    assert.equal(promote.success, true);
    ctl.setQuestionsEnabled(sessionId, 'host-1', true);
    ctl.submitQuestion(sessionId, 'viewer-b', 'From B.');

    const inbox = ctl.listQuestionsForModerator(sessionId, 'mod-a');
    assert.equal(inbox.status, 'OK');
    assert.equal(inbox.questions.length, 1);
});

/* ------------------------------------------------------------------ */
/* ANSWERING — the "Recipient" step                                    */
/* ------------------------------------------------------------------ */

test('answerQuestion is moderator-only and the answer reaches only the original asker + moderator, never other participants', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    ctl.setQuestionsEnabled(sessionId, 'host-1', true);
    const submitted = ctl.submitQuestion(sessionId, 'viewer-a', 'When is baptism class?');
    assert.equal(submitted.status, 'OK');

    const deniedAnswer = ctl.answerQuestion(sessionId, 'viewer-b', submitted.question.questionId, 'Trying to answer someone else\'s question.');
    assert.equal(deniedAnswer.status, 'NOT_AUTHORIZED');

    const answered = ctl.answerQuestion(sessionId, 'host-1', submitted.question.questionId, 'Next Sunday after service.');
    assert.equal(answered.status, 'OK');
    assert.equal(answered.question.status, 'ANSWERED');
    assert.equal(answered.question.answeredBy, 'host-1');

    // Recipient (the original asker) sees the answer.
    const aView = ctl.listMyQuestions(sessionId, 'viewer-a');
    assert.equal(aView.questions[0].answerText, 'Next Sunday after service.');

    // Participant B — who never asked this — sees nothing about it.
    const bView = ctl.listMyQuestions(sessionId, 'viewer-b');
    assert.equal(bView.questions.length, 0);
});

test('answerQuestion rejects an empty answer and reports NOT_FOUND for an unknown questionId', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    ctl.setQuestionsEnabled(sessionId, 'host-1', true);
    const submitted = ctl.submitQuestion(sessionId, 'viewer-a', 'Q?');
    assert.equal(ctl.answerQuestion(sessionId, 'host-1', submitted.question.questionId, '  ').status, 'REJECTED');
    assert.equal(ctl.answerQuestion(sessionId, 'host-1', 'nonexistent-question-id', 'answer').status, 'NOT_FOUND');
});

test('questions are session-scoped: a question submitted in session A never appears in session B\'s inbox', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionA = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const sessionB = makeSessionWithMembers(ldce, identity, 'host-2', ['viewer-c']);
    ctl.setQuestionsEnabled(sessionA, 'host-1', true);
    ctl.submitQuestion(sessionA, 'viewer-a', 'Only in session A.');
    const inboxB = ctl.listQuestionsForModerator(sessionB, 'host-2');
    assert.equal(inboxB.questions.length, 0);
});

/* ------------------------------------------------------------------ */
/* AVAILABILITY                                                        */
/* ------------------------------------------------------------------ */

test('reports UNAVAILABLE for the new functions when LDCESessionEngine is not loaded', () => {
    global.window = { CozyOS: {} };
    delete require.cache[require.resolve('../church-live-moderation-controls.js')];
    require('../church-live-moderation-controls.js');
    const ctl = global.window.CozyOS.ChurchLiveModerationControls;
    assert.equal(ctl.submitQuestion('s', 'a', 'q').status, 'UNAVAILABLE');
    assert.equal(ctl.listQuestionsForModerator('s', 'a').status, 'UNAVAILABLE');
    assert.equal(ctl.answerQuestion('s', 'a', 'q', 'ans').status, 'UNAVAILABLE');
});
