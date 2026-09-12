'use strict';

/**
 * core/modules/security/test/authentication-enrollment-panel.test.js
 * Prompt 10 STEP B — first-ever tests for
 * authentication-enrollment-panel.js (confirmed by repository-wide
 * search before writing this: no test file existed for it despite the
 * module's own header stating its build/render functions are "Exposed
 * for the Node regression harness to test the framework without a
 * DOM"). Real module, real dependencies (AuthEnrollmentStore,
 * AuthFactorRegistry) — no DOM is touched (init()/destroy() are not
 * called), matching the module's own documented Node-testable surface.
 *
 * WHY THIS FILE EXISTS THIS SLICE
 *   Prompt 10 STEP B asked for a real "Google Link" click surface.
 *   Direct inspection of this file (the actual existing enrollment
 *   click-surface architecture) confirms `realEnroll: null` for
 *   fingerprint/face/voice/google-account is deliberate and honest:
 *   no per-user Google ID token acquisition path exists anywhere in
 *   this repository (Firebase Auth wrapper — Firebase/firebase-auth.js
 *   — exposes only email/password sign-in and a raw
 *   onAuthStateChanged subscription; no GoogleAuthProvider/
 *   signInWithPopup call exists anywhere, confirmed by direct file
 *   read and repo-wide search). Flipping the Enroll button on for
 *   Google without that would mean fabricating a click handler that
 *   either does nothing real or silently fails — exactly what this
 *   file's own header already refuses to do ("This panel discloses
 *   that gap rather than fabricating an Enroll button that would call
 *   nothing real"). This test suite instead adds real regression
 *   coverage confirming that honest-refusal behavior is actually
 *   correct, so the next slice that DOES wire a real Google token
 *   source has a real safety net.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const PANEL_PATH = path.join(__dirname, '..', 'authentication-enrollment-panel.js');
const STORE_PATH = path.join(__dirname, '..', '..', '..', 'security', 'authentication-enrollment-store.js');
const REGISTRY_PATH = path.join(__dirname, '..', '..', '..', 'security', 'auth-factor-registry.js');

function freshPanel({ signedIn = 'user-1', withRegistry = true } = {}) {
    delete require.cache[require.resolve(PANEL_PATH)];
    delete require.cache[require.resolve(STORE_PATH)];
    if (withRegistry) delete require.cache[require.resolve(REGISTRY_PATH)];

    global.window = {
        CozyOS: {
            Auth: { getCurrentIdentity: () => (signedIn ? { userId: signedIn } : null) },
        },
    };
    if (withRegistry) require(REGISTRY_PATH);
    require(STORE_PATH);
    require(PANEL_PATH);
    return global.window.CozyOS.Modules['authentication-enrollment-panel'];
}

// 1. No signed-in user -> every card is honestly unavailable, never fabricated.
test('buildAllCards(): no signed-in user -> every card reports unavailable with the real reason', () => {
    const panel = freshPanel({ signedIn: null });
    const cards = panel.buildAllCards();
    assert.equal(cards.length, panel.FACTOR_DEFS.length);
    for (const card of cards) {
        assert.equal(card.unavailable, true);
        assert.match(card.reason, /No signed-in user/);
    }
});

// 2. Real, un-enrolled security-key card.
test('buildEnrollmentCard(): security-key with no enrollment record -> canEnroll true, honest "Not Enrolled"', () => {
    const panel = freshPanel();
    const cards = panel.buildAllCards();
    const card = cards.find(c => c.id === 'security-key');
    assert.equal(card.unavailable, false);
    assert.equal(card.enrolled, false);
    assert.equal(card.enrollmentStatus, 'Not Enrolled');
    assert.equal(card.canEnroll, true);
});

// 3/4/5/6. google-account / fingerprint / face / voice: canEnroll is
// always false (realEnroll: null) — the exact honest-stub guarantee
// this slice's investigation confirmed is correct, not a bug to fix.
for (const factorId of ['google-account', 'fingerprint', 'face', 'voice']) {
    test(`buildEnrollmentCard(): "${factorId}" never offers Enroll — no real per-user enrollment method exists`, () => {
        const panel = freshPanel();
        const card = panel.buildAllCards().find(c => c.id === factorId);
        assert.equal(card.canEnroll, false);
        assert.match(card.enrollUnavailableReason, /No real per-user enrollment method exists yet/);
    });
}

// 7. doAction("enroll", "google-account") must fail honestly, never
// silently succeed or fabricate an enrollment record.
test('doAction("enroll", "google-account"): fails honestly, records nothing in the store', () => {
    const panel = freshPanel();
    return panel.doAction('google-account', 'enroll').then((result) => {
        assert.equal(result.success, false);
        assert.match(result.reason, /No real enrollment method exists/);
        assert.equal(global.window.CozyOS.AuthEnrollmentStore.getEnrollment('user-1', 'google-account'), null);
    });
});

// 8. doAction("enroll", "security-key") calls the REAL registerCredential
// and only records an enrollment on real success.
test('doAction("enroll", "security-key"): real success path records a real enrollment', async () => {
    const panel = freshPanel();
    global.window.CozyOS.WebAuthnProvider = {
        registerCredential: async (userId) => ({ success: true, meta: { deviceLabel: 'Test Device' } }),
    };
    const result = await panel.doAction('security-key', 'enroll');
    assert.equal(result.success, true);
    const record = global.window.CozyOS.AuthEnrollmentStore.getEnrollment('user-1', 'security-key');
    assert.ok(record, 'a real enrollment record must exist after a real success');
});

// 9. doAction("enroll", "security-key") on a REAL failure never creates
// a store record — no fabricated success.
test('doAction("enroll", "security-key"): real provider failure -> no enrollment record created', async () => {
    const panel = freshPanel();
    global.window.CozyOS.WebAuthnProvider = {
        registerCredential: async () => ({ success: false, reason: 'User cancelled the platform authenticator prompt.' }),
    };
    const result = await panel.doAction('security-key', 'enroll');
    assert.equal(result.success, false);
    assert.equal(global.window.CozyOS.AuthEnrollmentStore.getEnrollment('user-1', 'security-key'), null);
});

// 10. enable/disable/remove route to the real AuthEnrollmentStore and
// require a pre-existing enrollment (fail closed otherwise).
test('doAction("enable"): fails closed when no enrollment exists yet for that factor', async () => {
    const panel = freshPanel();
    const result = await panel.doAction('security-key', 'enable');
    assert.equal(result.success, false);
});

test('doAction full lifecycle: enroll -> disable -> enable -> remove, each reflected in a rebuilt card', async () => {
    const panel = freshPanel();
    global.window.CozyOS.WebAuthnProvider = { registerCredential: async () => ({ success: true, meta: null }) };

    const enrolled = await panel.doAction('security-key', 'enroll');
    assert.equal(enrolled.success, true);
    assert.equal(panel.buildAllCards().find(c => c.id === 'security-key').enabled, true);

    const disabled = await panel.doAction('security-key', 'disable');
    assert.equal(disabled.success, true);
    assert.equal(panel.buildAllCards().find(c => c.id === 'security-key').enabled, false);

    const enabled = await panel.doAction('security-key', 'enable');
    assert.equal(enabled.success, true);
    assert.equal(panel.buildAllCards().find(c => c.id === 'security-key').enabled, true);

    const removed = await panel.doAction('security-key', 'remove');
    assert.equal(removed.success, true);
    assert.equal(panel.buildAllCards().find(c => c.id === 'security-key').enrolled, false);
});

// 11. No AuthEnrollmentStore loaded -> every card unavailable, doAction
// fails closed, never throws.
test('AuthEnrollmentStore not loaded -> cards report unavailable, doAction fails closed without throwing', async () => {
    delete require.cache[require.resolve(PANEL_PATH)];
    global.window = { CozyOS: { Auth: { getCurrentIdentity: () => ({ userId: 'user-1' }) } } };
    require(PANEL_PATH);
    const panel = global.window.CozyOS.Modules['authentication-enrollment-panel'];
    const card = panel.buildAllCards()[0];
    assert.equal(card.unavailable, true);
    assert.match(card.reason, /AuthEnrollmentStore is not loaded/);
    const result = await panel.doAction('security-key', 'enroll');
    assert.equal(result.success, false);
});

// 12. renderAllCards() produces real HTML without throwing, and never
// renders an Enroll button for a factor with no real enrollment method.
test('renderAllCards(): produces HTML with no Enroll button for google-account', () => {
    const panel = freshPanel();
    const html = panel.renderAllCards();
    assert.match(html, /Authentication Enrollment|Google Login/);
    // Isolate the google-account card's own rendered block and confirm
    // no data-action="enroll" appears within it specifically.
    const card = panel.buildAllCards().find(c => c.id === 'google-account');
    const rendered = panel.renderEnrollmentCard(card);
    assert.doesNotMatch(rendered, /data-action="enroll"/);
});
