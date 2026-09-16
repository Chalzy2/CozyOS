'use strict';

/**
 * core/modules/identity/test/login-html-server-passkey-wiring.test.js
 * Portion 2c — focused tests proving login.html's Passkey button is wired
 * to the real, already-verified AuthCoordinator.loginWithServerPasskey()
 * (Portion 2b), not the legacy client-side loginWithPasskey() path.
 *
 * HOW THIS WORKS
 *   Same honest DOM-shim + vm-sandbox convention as
 *   login-html-phone-wiring.test.js (the prior UI-wiring suite in this
 *   repo): a minimal hand-built DOM is constructed, login.html's real
 *   inline <script> block is extracted from the real file (not retyped)
 *   and run inside it, and assertions are made against the real DOM
 *   shim's recorded clicks/values.
 *
 * ONE DISCLOSED SUBSTITUTION
 *   login.html's real inline script only reaches window.CozyOS.AuthCoordinator
 *   and window.CozyOS.Session/LivingSounds — it never touches
 *   AuthCoordinator's internals directly. Portion 2b's own suite
 *   (auth-coordinator-server-passkey.test.js) already proves
 *   loginWithServerPasskey()'s real fetch()/navigator.credentials.get()
 *   request/response contract in detail; duplicating a real server + real
 *   virtual authenticator here would only re-test that boundary, not the
 *   UI wiring this portion is scoped to. So this suite installs a
 *   controlled stub AuthCoordinator (recording every call) in place of
 *   the real one, exactly the "controlled test doubles where appropriate"
 *   convention the Portion 2c spec calls for. A poisoned legacy
 *   loginWithPasskey() proves the old path is never reached.
 *
 * Run: node --test core/modules/identity/test/login-html-server-passkey-wiring.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..'); // repo root

function read(relPath) {
    return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

/* ------------------------------------------------------------------ */
/* Minimal, honest DOM shim — same shape login-html-phone-wiring.test.js */
/* already established for this repo.                                   */
/* ------------------------------------------------------------------ */

function makeFakeElement(tag) {
    const el = {
        tagName: (tag || 'div').toUpperCase(),
        id: '', children: [], parentNode: null,
        _text: '', _html: '', _value: '', checked: false,
        style: {}, attrs: {}, listeners: {}, disabled: false,
        classList: {
            _set: new Set(),
            add(c) { this._set.add(c); },
            remove(c) { this._set.delete(c); },
            toggle(c, force) {
                if (force === true) { this._set.add(c); return true; }
                if (force === false) { this._set.delete(c); return false; }
                if (this._set.has(c)) { this._set.delete(c); return false; }
                this._set.add(c); return true;
            },
            contains(c) { return this._set.has(c); },
        },
        setAttribute(k, v) { this.attrs[k] = v; },
        getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
        appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
        removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; return child; },
        remove() { if (this.parentNode) this.parentNode.removeChild(this); },
        closest() { return null; },
        querySelector() { return null; },
        addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
        removeEventListener(type, fn) {
            const arr = this.listeners[type];
            if (!arr) return;
            const i = arr.indexOf(fn);
            if (i >= 0) arr.splice(i, 1);
        },
        click() { (this.listeners.click || []).forEach(fn => fn({ preventDefault() {} })); },
        focus() {},
        get textContent() { return this._text; },
        set textContent(v) { this._text = String(v); this.children = []; },
        get innerHTML() { return this._html; },
        set innerHTML(v) { this._html = String(v); },
        get value() { return this._value; },
        set value(v) { this._value = String(v); },
    };
    return el;
}

function makeDom() {
    const registry = new Map();
    const doc = {
        _registry: registry,
        documentElement: makeFakeElement('html'),
        body: makeFakeElement('body'),
        createElement(tag) { return makeFakeElement(tag); },
        getElementById(id) { return registry.get(id) || null; },
        querySelectorAll() { return []; },
        querySelector() { return null; },
        addEventListener() {},
        register(id, el) { el.id = id; registry.set(id, el); },
    };
    // Every id login.html's real inline script references, per the same
    // real-file search login-html-phone-wiring.test.js already performed
    // (unchanged by Portion 2c — no new element ids were introduced).
    [
        'cozy-create-account', 'cozy-forgot-cancel', 'cozy-forgot-confirm', 'cozy-forgot-confirm-cancel',
        'cozy-forgot-error', 'cozy-forgot-have-token-link', 'cozy-forgot-link', 'cozy-forgot-newpass',
        'cozy-forgot-request-error', 'cozy-forgot-request-submit', 'cozy-forgot-request-success',
        'cozy-forgot-step-confirm', 'cozy-forgot-step-request', 'cozy-forgot-submit', 'cozy-forgot-success',
        'cozy-forgot-token', 'cozy-forgot-username', 'cozy-live-bg-canvas', 'cozy-login-brand', 'cozy-login-card',
        'cozy-login-error', 'cozy-login-form', 'cozy-login-motto', 'cozy-login-password', 'cozy-login-sub',
        'cozy-login-submit', 'cozy-login-username', 'cozy-more-panel', 'cozy-more-toggle', 'cozy-otp-cancel',
        'cozy-otp-code', 'cozy-otp-error', 'cozy-otp-submit', 'cozy-passkey-btn', 'cozy-phone-btn',
        'cozy-phone-cancel', 'cozy-phone-code', 'cozy-phone-error', 'cozy-phone-status', 'cozy-phone-submit',
        'cozy-pw-toggle', 'cozy-reg-confirm', 'cozy-reg-email', 'cozy-reg-first', 'cozy-reg-last',
        'cozy-reg-more', 'cozy-reg-more-toggle', 'cozy-reg-password', 'cozy-reg-phone', 'cozy-reg-terms',
        'cozy-register-cancel', 'cozy-register-error', 'cozy-register-submit', 'cozy-remember-me',
        'cozy-forgot-modal', 'cozy-otp-modal', 'cozy-phone-modal', 'cozy-register-modal',
    ].forEach(id => doc.register(id, makeFakeElement(id === 'cozy-login-form' ? 'form' : 'div')));
    return doc;
}

/* ------------------------------------------------------------------ */
/* Sandbox builder — a controlled-double AuthCoordinator (see file      */
/* header for why), the real Session facade recording calls, and the   */
/* real inline <script> extracted from login.html.                     */
/* ------------------------------------------------------------------ */

function buildSandbox({ serverPasskeyImpl } = {}) {
    const document = makeDom();
    const calls = { loginWithServerPasskey: [], loginWithPasskey: [] };
    const establishedSessions = [];

    const sandbox = {
        window: {}, document, console,
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        navigator: { serviceWorker: undefined },
        setTimeout, clearTimeout, setInterval, clearInterval,
        Date, Math, JSON, Array, Object, Promise, Map, Set, Error,
    };
    sandbox.window.addEventListener = () => {};
    sandbox.window.removeEventListener = () => {};
    sandbox.window.location = { href: '' };
    sandbox.window.navigator = sandbox.navigator;
    sandbox.window.document = document;
    sandbox.window.localStorage = sandbox.localStorage;
    sandbox.window.sessionStorage = sandbox.sessionStorage;
    sandbox.requestAnimationFrame = (fn) => setTimeout(fn, 0);
    sandbox.cancelAnimationFrame = (id) => clearTimeout(id);
    sandbox.window.requestAnimationFrame = sandbox.requestAnimationFrame;
    sandbox.window.cancelAnimationFrame = sandbox.cancelAnimationFrame;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);

    sandbox.window.CozyOS = {
        AuthCoordinator: {
            // Controlled double for the real, Portion-2b-verified method —
            // records every call so tests can assert email/rememberMe are
            // forwarded unchanged.
            async loginWithServerPasskey(email, opts) {
                calls.loginWithServerPasskey.push({ email, opts });
                if (typeof serverPasskeyImpl === 'function') return serverPasskeyImpl(email, opts);
                return { available: true, source: 'server', email };
            },
            // Poisoned legacy path — any call proves Portion 2c regressed
            // back onto the old client-authoritative ceremony.
            async loginWithPasskey() {
                calls.loginWithPasskey.push(true);
                throw new Error('FORBIDDEN: legacy loginWithPasskey() was called by the Passkey button');
            },
            async loginWithServerPassword() { return { available: false, reason: 'not used in this suite' }; },
        },
        Session: {
            establishFromIdentity(sessionId) { establishedSessions.push({ via: 'identity', sessionId }); },
            establishFromExternalAuth(payload) { establishedSessions.push({ via: 'external', payload }); },
            end() {}, isSignedIn() { return establishedSessions.length > 0; },
        },
        LivingSounds: { play: async () => ({ success: true }) },
    };

    return { sandbox, document, calls, establishedSessions };
}

function runInlineLoginScript(sandbox) {
    const html = read('login.html');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1, 'expected exactly one inline <script> block in login.html — extraction logic must be revisited if this changes');
    vm.runInContext(scripts[0][1], sandbox, { filename: 'login.html#inline' });
}

function flushMicrotasks(times = 10) {
    let p = Promise.resolve();
    for (let i = 0; i < times; i++) p = p.then(() => {});
    return p;
}

function waitFor(conditionFn, { timeout = 2000, interval = 10 } = {}) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        (function poll() {
            let ok;
            try { ok = conditionFn(); } catch (_err) { ok = false; }
            if (ok) return resolve();
            if (Date.now() - start > timeout) return reject(new Error('waitFor: condition never became true within timeout'));
            setTimeout(poll, interval);
        })();
    });
}

/* ------------------------------------------------------------------ */

test('the Passkey button is wired to a real click handler', () => {
    const { sandbox, document } = buildSandbox();
    runInlineLoginScript(sandbox);
    const btn = document.getElementById('cozy-passkey-btn');
    assert.ok(btn.listeners.click && btn.listeners.click.length > 0, 'expected a real click listener attached to the Passkey button');
});

test('clicking Passkey calls AuthCoordinator.loginWithServerPasskey(), never the legacy loginWithPasskey()', async () => {
    const { sandbox, document, calls } = buildSandbox();
    runInlineLoginScript(sandbox);
    document.getElementById('cozy-login-username').value = 'ada@example.com';
    document.getElementById('cozy-passkey-btn').click();
    await waitFor(() => calls.loginWithServerPasskey.length > 0);
    assert.equal(calls.loginWithServerPasskey.length, 1);
    assert.equal(calls.loginWithPasskey.length, 0, 'the legacy client-side passkey path must never be invoked');
});

test('the exact email typed into the login form is forwarded unchanged', async () => {
    const { sandbox, document, calls } = buildSandbox();
    runInlineLoginScript(sandbox);
    document.getElementById('cozy-login-username').value = '  ada.lovelace@example.com  ';
    document.getElementById('cozy-passkey-btn').click();
    await waitFor(() => calls.loginWithServerPasskey.length > 0);
    assert.equal(calls.loginWithServerPasskey[0].email, 'ada.lovelace@example.com');
});

test('rememberMe is forwarded unchanged when checked', async () => {
    const { sandbox, document, calls } = buildSandbox();
    runInlineLoginScript(sandbox);
    document.getElementById('cozy-login-username').value = 'ada@example.com';
    document.getElementById('cozy-remember-me').checked = true;
    document.getElementById('cozy-passkey-btn').click();
    await waitFor(() => calls.loginWithServerPasskey.length > 0);
    // opts is an object literal created inside the vm sandbox realm, so it
    // has a different Object prototype than this test file's realm —
    // compare the property value directly rather than via deepEqual,
    // which would otherwise report a spurious cross-realm mismatch.
    assert.equal(calls.loginWithServerPasskey[0].opts.rememberMe, true);
    assert.deepEqual(Object.keys(calls.loginWithServerPasskey[0].opts), ['rememberMe']);
});

test('rememberMe is forwarded unchanged when unchecked', async () => {
    const { sandbox, document, calls } = buildSandbox();
    runInlineLoginScript(sandbox);
    document.getElementById('cozy-login-username').value = 'ada@example.com';
    document.getElementById('cozy-remember-me').checked = false;
    document.getElementById('cozy-passkey-btn').click();
    await waitFor(() => calls.loginWithServerPasskey.length > 0);
    assert.equal(calls.loginWithServerPasskey[0].opts.rememberMe, false);
    assert.deepEqual(Object.keys(calls.loginWithServerPasskey[0].opts), ['rememberMe']);
});

test('missing email fails closed: no ceremony is started, error is shown, legacy path untouched', async () => {
    const { sandbox, document, calls } = buildSandbox();
    runInlineLoginScript(sandbox);
    document.getElementById('cozy-login-username').value = '';
    document.getElementById('cozy-passkey-btn').click();
    await flushMicrotasks();
    assert.equal(calls.loginWithServerPasskey.length, 0);
    assert.equal(calls.loginWithPasskey.length, 0);
    assert.equal(document.getElementById('cozy-login-error').textContent, 'Enter your username first, then choose Passkey.');
    assert.equal(document.getElementById('cozy-login-error').style.display, 'block');
});

test('whitespace-only email is treated as missing and fails closed', async () => {
    const { sandbox, document, calls } = buildSandbox();
    runInlineLoginScript(sandbox);
    document.getElementById('cozy-login-username').value = '    ';
    document.getElementById('cozy-passkey-btn').click();
    await flushMicrotasks();
    assert.equal(calls.loginWithServerPasskey.length, 0);
    assert.equal(document.getElementById('cozy-login-error').style.display, 'block');
});

test('coordinator success (available:true) redirects to index.html, same as the password path', async () => {
    const { sandbox, document, establishedSessions } = buildSandbox({
        serverPasskeyImpl: async () => ({ available: true, source: 'server', email: 'ada@example.com' }),
    });
    runInlineLoginScript(sandbox);
    document.getElementById('cozy-login-username').value = 'ada@example.com';
    document.getElementById('cozy-passkey-btn').click();
    await waitFor(() => sandbox.window.location.href === 'index.html');
    assert.equal(sandbox.window.location.href, 'index.html');
});

test('server rejection (available:false, code + reason) is surfaced via the existing inline error element, no redirect', async () => {
    const { sandbox, document } = buildSandbox({
        serverPasskeyImpl: async () => ({ available: false, code: 'unknown_credential', reason: 'That passkey is not recognized.' }),
    });
    runInlineLoginScript(sandbox);
    document.getElementById('cozy-login-username').value = 'ada@example.com';
    document.getElementById('cozy-passkey-btn').click();
    await waitFor(() => document.getElementById('cozy-login-error').style.display === 'block');
    assert.equal(document.getElementById('cozy-login-error').textContent, 'That passkey is not recognized.');
    assert.notEqual(sandbox.window.location.href, 'index.html');
});

test('user cancellation (code: user_cancelled) is surfaced as a failure, never treated as success', async () => {
    const { sandbox, document, establishedSessions } = buildSandbox({
        serverPasskeyImpl: async () => ({ available: false, code: 'user_cancelled', reason: 'Passkey sign-in was cancelled.' }),
    });
    runInlineLoginScript(sandbox);
    document.getElementById('cozy-login-username').value = 'ada@example.com';
    document.getElementById('cozy-passkey-btn').click();
    await waitFor(() => document.getElementById('cozy-login-error').style.display === 'block');
    assert.equal(establishedSessions.length, 0);
    assert.notEqual(sandbox.window.location.href, 'index.html');
});

test('a thrown rejection from the coordinator call is caught and surfaced, not left unhandled', async () => {
    const { sandbox, document } = buildSandbox({
        serverPasskeyImpl: async () => { throw new Error('network exploded'); },
    });
    runInlineLoginScript(sandbox);
    document.getElementById('cozy-login-username').value = 'ada@example.com';
    document.getElementById('cozy-passkey-btn').click();
    await waitFor(() => document.getElementById('cozy-login-error').style.display === 'block');
    assert.equal(document.getElementById('cozy-login-error').textContent, 'network exploded');
});

test('button is disabled with "Waiting for passkey…" while the ceremony is in flight, and restored after', async () => {
    let resolveCeremony;
    const ceremony = new Promise((resolve) => { resolveCeremony = resolve; });
    const { sandbox, document } = buildSandbox({
        serverPasskeyImpl: async () => { await ceremony; return { available: true, source: 'server', email: 'ada@example.com' }; },
    });
    runInlineLoginScript(sandbox);
    document.getElementById('cozy-login-username').value = 'ada@example.com';
    const btn = document.getElementById('cozy-passkey-btn');
    const originalLabel = btn.innerHTML;
    btn.click();
    await waitFor(() => btn.disabled === true);
    assert.equal(btn.disabled, true);
    assert.match(btn.innerHTML, /Waiting for passkey/);
    resolveCeremony({ available: true, source: 'server', email: 'ada@example.com' });
    await waitFor(() => btn.disabled === false);
    assert.equal(btn.disabled, false);
    assert.equal(btn.innerHTML, originalLabel);
});

test('duplicate clicks while a ceremony is in flight do not start a second ceremony', async () => {
    let resolveCeremony;
    const ceremony = new Promise((resolve) => { resolveCeremony = resolve; });
    const { sandbox, document, calls } = buildSandbox({
        serverPasskeyImpl: async () => { await ceremony; return { available: true, source: 'server', email: 'ada@example.com' }; },
    });
    runInlineLoginScript(sandbox);
    document.getElementById('cozy-login-username').value = 'ada@example.com';
    const btn = document.getElementById('cozy-passkey-btn');
    btn.click();
    await waitFor(() => calls.loginWithServerPasskey.length > 0);
    btn.click(); // duplicate while in flight — button.disabled already gates this, matching the password submit button's own convention
    btn.click();
    await flushMicrotasks();
    resolveCeremony({ available: true, source: 'server', email: 'ada@example.com' });
    await waitFor(() => sandbox.window.location.href === 'index.html');
    assert.equal(calls.loginWithServerPasskey.length, 1, 'exactly one ceremony must have started despite repeated clicks');
});

test('existing password-login behavior is unchanged by the Passkey rewiring', async () => {
    const { sandbox, document } = buildSandbox();
    runInlineLoginScript(sandbox);
    const submitBtn = document.getElementById('cozy-login-submit');
    assert.ok(submitBtn, 'expected the password submit button to still be present and registered');
    const form = document.getElementById('cozy-login-form');
    assert.ok(form.listeners.submit && form.listeners.submit.length > 0, 'expected the password form submit handler to be unaffected');
});
