'use strict';

/**
 * core/tests/reset-password-page.test.js
 *
 * USER SECURITY SURFACE — password-reset destination.
 *
 * BUG BEING REGRESSION-TESTED: server/webauthn-rp/server.js's
 * POST /auth/password/forgot has always emailed a link to
 * `${origin}/reset-password.html?token=...`, but reset-password.html
 * did not exist anywhere in the repository (confirmed by a
 * repository-wide search before this file was added) — every emailed
 * reset link 404'd. This suite runs the REAL inline <script> from the
 * new reset-password.html inside a vm sandbox (same technique already
 * used by server/test/firebase-admin-real-composition.test.js for
 * index.html) so the page's actual logic is exercised, not a
 * reimplementation of it — no browser/jsdom dependency required.
 *
 * Confirms: token pickup from the URL, the exact existing
 * POST /auth/password/reset contract (same body shape, same
 * error-code -> message table already proven in login.html's own
 * confirm-step), and that no second/parallel reset backend is invented
 * here — every call in this file targets that one real endpoint.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const PAGE_PATH = path.join(ROOT, 'reset-password.html');

function fakeElement() {
    return {
        value: '',
        textContent: '',
        style: { display: 'none' },
        disabled: false,
        _listeners: {},
        addEventListener(type, fn) { this._listeners[type] = fn; },
    };
}

function buildSandbox({ search = '', fetchImpl } = {}) {
    const elements = {
        'cozy-reset-token': fakeElement(),
        'cozy-reset-token-note': fakeElement(),
        'cozy-reset-newpass': fakeElement(),
        'cozy-reset-confirm': fakeElement(),
        'cozy-reset-submit': fakeElement(),
        'cozy-reset-error': fakeElement(),
        'cozy-reset-success': fakeElement(),
    };
    const formListeners = {};
    const form = {
        style: { display: 'block' },
        addEventListener(type, fn) { formListeners[type] = fn; },
    };
    const fetchCalls = [];
    const sandbox = {
        console,
        URLSearchParams,
        window: { location: { search } },
        document: {
            getElementById(id) {
                if (id === 'cozy-reset-form') return form;
                return elements[id] || null;
            },
        },
        fetch: async (url, opts) => {
            fetchCalls.push({ url, opts, body: opts && opts.body ? JSON.parse(opts.body) : null });
            return fetchImpl ? fetchImpl(url, opts) : { ok: true, json: async () => ({ ok: true }) };
        },
    };
    sandbox.window.document = sandbox.document;
    vm.createContext(sandbox);
    const html = fs.readFileSync(PAGE_PATH, 'utf8');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.ok(scripts.length >= 1, 'reset-password.html must contain its real inline script');
    vm.runInContext(scripts[scripts.length - 1][1], sandbox);
    return { sandbox, elements, form, formListeners, fetchCalls };
}

test('reset-password.html exists (fixes the previously-dead emailed reset link)', () => {
    assert.equal(fs.existsSync(PAGE_PATH), true, 'reset-password.html must exist so ${origin}/reset-password.html?token=... resolves');
});

test('reset-password.html pre-fills the token from the real emailed link (?token=...)', () => {
    const { elements } = buildSandbox({ search: '?token=abc123real' });
    assert.equal(elements['cozy-reset-token'].value, 'abc123real');
    assert.match(elements['cozy-reset-token-note'].textContent, /pre-filled/i);
});

test('reset-password.html discloses honestly when no token is present in the URL', () => {
    const { elements } = buildSandbox({ search: '' });
    assert.equal(elements['cozy-reset-token'].value, '');
    assert.match(elements['cozy-reset-token-note'].textContent, /no token found/i);
});

test('submitting calls the one real POST /auth/password/reset endpoint with {token, newPassword} — no second backend', async () => {
    const { elements, formListeners, fetchCalls } = buildSandbox({ search: '?token=real-token-1' });
    elements['cozy-reset-newpass'].value = 'CorrectHorseBattery9!';
    elements['cozy-reset-confirm'].value = 'CorrectHorseBattery9!';
    await formListeners.submit({ preventDefault() {} });
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, '/auth/password/reset');
    assert.equal(fetchCalls[0].opts.method, 'POST');
    assert.equal(fetchCalls[0].opts.credentials, 'include');
    assert.deepEqual(fetchCalls[0].body, { token: 'real-token-1', newPassword: 'CorrectHorseBattery9!' });
});

test('mismatched passwords never reach the network', async () => {
    const { elements, formListeners, fetchCalls } = buildSandbox({ search: '?token=real-token-1' });
    elements['cozy-reset-newpass'].value = 'PasswordOne1!';
    elements['cozy-reset-confirm'].value = 'PasswordTwo2!';
    await formListeners.submit({ preventDefault() {} });
    assert.equal(fetchCalls.length, 0);
    assert.match(elements['cozy-reset-error'].textContent, /do not match/i);
});

test('an expired token is reported using the server\'s real error code, honestly, not swallowed', async () => {
    const { elements, formListeners } = buildSandbox({
        search: '?token=expired-token',
        fetchImpl: async () => ({ ok: false, json: async () => ({ error: 'reset_token_expired' }) }),
    });
    elements['cozy-reset-newpass'].value = 'CorrectHorseBattery9!';
    elements['cozy-reset-confirm'].value = 'CorrectHorseBattery9!';
    await formListeners.submit({ preventDefault() {} });
    assert.equal(elements['cozy-reset-error'].style.display, 'block');
    assert.match(elements['cozy-reset-error'].textContent, /expired/i);
    assert.equal(elements['cozy-reset-submit'].disabled, false, 'must re-enable the button so the user can request a new link');
});

test('an invalid token is reported using the server\'s real error code', async () => {
    const { elements, formListeners } = buildSandbox({
        search: '?token=bad-token',
        fetchImpl: async () => ({ ok: false, json: async () => ({ error: 'invalid_reset_token' }) }),
    });
    elements['cozy-reset-newpass'].value = 'CorrectHorseBattery9!';
    elements['cozy-reset-confirm'].value = 'CorrectHorseBattery9!';
    await formListeners.submit({ preventDefault() {} });
    assert.match(elements['cozy-reset-error'].textContent, /isn't valid/i);
});

test('a real server success shows the honest success message and hides the form (no fabricated redirect claim)', async () => {
    const { elements, form, formListeners } = buildSandbox({
        search: '?token=good-token',
        fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true }) }),
    });
    elements['cozy-reset-newpass'].value = 'CorrectHorseBattery9!';
    elements['cozy-reset-confirm'].value = 'CorrectHorseBattery9!';
    await formListeners.submit({ preventDefault() {} });
    assert.equal(elements['cozy-reset-success'].style.display, 'block');
    assert.equal(form.style.display, 'none');
});
