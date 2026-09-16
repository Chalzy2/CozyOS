'use strict';

/**
 * core/shell/tests/login-html-admin-username-field.test.js
 *
 * Regression test for a real bug: the Administrator sign-in field in
 * login.html (#cozy-admin-firebase-email) was type="email" — a
 * browser-enforced HTML5 constraint requiring an "@" — which silently
 * blocked submitting a real server-side username (e.g. "Chalzcozy",
 * mapped via bootstrap-admin.js set-username) before the form's own JS
 * ever ran. The real auth call this form makes
 * (AuthCoordinator.loginWithServerPassword()) already correctly detects
 * and sends either {username} or {email} — this test proves the one
 * remaining blocker (the input's own type attribute) is gone.
 *
 * The existing real-browser E2E coverage for this form
 * (server/webauthn-rp/test/browser-e2e-admin-routing-fix.test.js) only
 * ever fills this field with a real email address, so it could never
 * have caught this — this test targets the specific attribute instead.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LOGIN_HTML_PATH = path.join(__dirname, '..', '..', '..', 'login.html');
const html = fs.readFileSync(LOGIN_HTML_PATH, 'utf8');

function extractInputTag(id) {
    const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
    const re = new RegExp(`<input id="${id}"[^>]*>`);
    const match = withoutComments.match(re);
    if (!match) throw new Error(`Could not find <input id="${id}"> in login.html`);
    return match[0];
}

test('the Administrator sign-in identifier field is NOT type="email" (must accept a plain username like "Chalzcozy")', () => {
    const tag = extractInputTag('cozy-admin-firebase-email');
    assert.doesNotMatch(tag, /type="email"/, 'type="email" is a browser-enforced constraint that blocks any value without an "@", including a real username');
});

test('the Administrator sign-in identifier field is a plain text input', () => {
    const tag = extractInputTag('cozy-admin-firebase-email');
    assert.match(tag, /type="text"/);
});

test('the ordinary login form\'s own "Username or Email" field is unaffected by this fix (still plain text, unchanged)', () => {
    const tag = extractInputTag('cozy-login-username');
    assert.match(tag, /type="text"/);
});

test('the Administrator form still requires a value (required attribute preserved)', () => {
    const tag = extractInputTag('cozy-admin-firebase-email');
    assert.match(tag, /\brequired\b/);
});

test('the Administrator form label reflects that it accepts a username or email, not "email" only', () => {
    const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
    const labelMatch = withoutComments.match(/<label for="cozy-admin-firebase-email">([^<]*)<\/label>/);
    assert.ok(labelMatch, 'label for cozy-admin-firebase-email must exist');
    assert.doesNotMatch(labelMatch[1], /^Administrator Email$/, 'label must no longer claim email-only');
});
