'use strict';

/**
 * core/shell/tests/cozy-login-gate-server-auth-fix.test.js
 *
 * Regression test for a real, reported bug: cozy-login-gate.js's own
 * dedicated Administrator credentials form (#cozy-login-credentials-form
 * — the "SECURED WORKSPACE" / "Administrator Login" UI) called
 * AuthCoordinator.loginWithCredentials(), which resolves ONLY against
 * IdentityEngine's local, per-browser IndexedDB #users registry — never
 * the real server is_platform_admin authority. A real administrator
 * username set up via bootstrap-admin.js's set-username CLI (e.g.
 * "Chalzcozy") has no local IdentityEngine record, so this always
 * failed with an honest-but-wrong "No real administrator account found"
 * even though the real server account is valid.
 *
 * This extracts and runs the REAL submit handler verbatim (same
 * extraction technique already established elsewhere in this
 * repository, e.g. server/test/chalzydashboard-bootstrap-failure-
 * visibility.test.js) — it does not reimplement the fix's logic.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const GATE_SRC = fs.readFileSync(path.join(ROOT, 'core', 'shell', 'cozy-login-gate.js'), 'utf8');

function extractCredentialsSubmitHandler() {
    const withoutComments = GATE_SRC.replace(/\/\*[\s\S]*?\*\//g, '');
    const marker = 'container.querySelector("#cozy-login-credentials-form").addEventListener("submit", async (e) => {';
    const start = withoutComments.indexOf(marker);
    if (start === -1) throw new Error('Could not locate the real credentials-form submit handler in cozy-login-gate.js');
    // Balance braces from the arrow function's opening "{" to find the real end.
    let depth = 0, i = withoutComments.indexOf('{', start);
    const bodyStart = i;
    for (; i < withoutComments.length; i++) {
        if (withoutComments[i] === '{') depth++;
        else if (withoutComments[i] === '}') { depth--; if (depth === 0) break; }
    }
    const handlerBody = withoutComments.slice(bodyStart + 1, i);
    return handlerBody;
}

function makeInput(initialValue) {
    return { value: initialValue, get checked() { return this._checked; }, set checked(v) { this._checked = v; } };
}

function buildContainer({ username, password, remember }) {
    const els = {
        '#cozy-login-username': { value: username },
        '#cozy-login-password': { value: password },
        '#cozy-login-remember': { checked: remember },
    };
    return { querySelector: (sel) => els[sel] || null };
}

/** Runs the real, extracted handler body as an async function with controlled fakes. */
async function runHandler({ container, showError, proceed, loginWithServerPassword, loginWithCredentials, offerBiometricEnrollmentIfEligible }) {
    // Default matches the real function's own honest fallback when
    // WebAuthn/TrustedDeviceManager aren't available: just proceed.
    // Tests that specifically care about enrollment being OFFERED pass
    // their own spy/stub instead.
    const enroll = offerBiometricEnrollmentIfEligible || (async (_container, identifier, proceedFn) => proceedFn(identifier));
    const sandbox = {
        window: {
            CozyOS: {
                AuthCoordinator: { loginWithServerPassword, loginWithCredentials },
                LivingAudio: null,
                LivingSounds: null,
            },
        },
        console,
        showError,
        proceed,
        container,
        offerBiometricEnrollmentIfEligible: enroll,
        e: { preventDefault() {} },
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    const body = extractCredentialsSubmitHandler();
    const runner = new vm.Script(`(async () => { ${body} })()`);
    return runner.runInContext(sandbox);
}

function poisoned(name) {
    return async () => { throw new Error(`${name} must never be called by this form anymore`); };
}

test('sanity: the real submit handler was actually extracted', () => {
    const body = extractCredentialsSubmitHandler();
    // Strip // line comments too (the real fix's own explanatory comment
    // mentions the old method name in prose) so this checks actual code,
    // not commentary.
    const codeOnly = body.replace(/\/\/.*$/gm, '');
    assert.match(codeOnly, /loginWithServerPassword/);
    assert.doesNotMatch(codeOnly, /loginWithCredentials\(/);
});

test('a real username ("Chalzcozy") + password calls the real server-authoritative login, never the legacy local IdentityEngine path', async () => {
    const calls = [];
    let proceeded = null;
    await runHandler({
        container: buildContainer({ username: 'Chalzcozy', password: 'the real password', remember: true }),
        showError: () => { throw new Error('must not show an error on a real successful login'); },
        proceed: (id) => { proceeded = id; },
        loginWithServerPassword: async (identifier, password, opts) => {
            calls.push({ identifier, password, opts });
            return { available: true, source: 'server', email: identifier, isPlatformAdmin: true };
        },
        loginWithCredentials: poisoned('loginWithCredentials (legacy local IdentityEngine path)'),
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].identifier, 'Chalzcozy');
    assert.equal(calls[0].opts.rememberMe, true);
    assert.equal(proceeded, 'Chalzcozy');
});

test('a genuinely wrong password shows the real server-reported error, never falls back to the legacy path', async () => {
    let shownError = null;
    await runHandler({
        container: buildContainer({ username: 'Chalzcozy', password: 'wrong', remember: true }),
        showError: (_container, msg) => { shownError = msg; },
        proceed: () => { throw new Error('must not proceed on a failed login'); },
        loginWithServerPassword: async () => ({ available: false, reason: 'Invalid username/email or password.' }),
        loginWithCredentials: poisoned('loginWithCredentials'),
    });

    assert.equal(shownError, 'Invalid username/email or password.');
});

test('a real email address still works through the same real call (unchanged existing behavior)', async () => {
    const calls = [];
    await runHandler({
        container: buildContainer({ username: 'admin@example.com', password: 'pw', remember: false }),
        showError: () => { throw new Error('must not error'); },
        proceed: () => {},
        loginWithServerPassword: async (identifier, password, opts) => { calls.push({ identifier, opts }); return { available: true, email: identifier, isPlatformAdmin: false }; },
        loginWithCredentials: poisoned('loginWithCredentials'),
    });

    assert.equal(calls[0].identifier, 'admin@example.com');
    assert.equal(calls[0].opts.rememberMe, false);
});

test('an MFA-required response is disclosed honestly rather than silently stalling', async () => {
    let shownError = null;
    await runHandler({
        container: buildContainer({ username: 'Chalzcozy', password: 'pw', remember: true }),
        showError: (_container, msg) => { shownError = msg; },
        proceed: () => { throw new Error('must not proceed while MFA is still required'); },
        loginWithServerPassword: async () => ({ available: true, requiresOtp: true, pendingId: 'abc' }),
        loginWithCredentials: poisoned('loginWithCredentials'),
    });

    assert.match(shownError, /verification code/i);
});

test('after a real successful server login, biometric enrollment is offered using the SAME real identifier (username or email) — not a local IdentityEngine id', async () => {
    let enrolledWith = null;
    let proceeded = null;
    await runHandler({
        container: buildContainer({ username: 'Chalzcozy', password: 'the real password', remember: true }),
        showError: () => { throw new Error('must not show an error on a real successful login'); },
        proceed: (id) => { proceeded = id; },
        loginWithServerPassword: async () => ({ available: true, source: 'server', email: 'Chalzcozy', isPlatformAdmin: true }),
        loginWithCredentials: poisoned('loginWithCredentials'),
        offerBiometricEnrollmentIfEligible: async (_container, identifier, proceedFn) => { enrolledWith = identifier; proceedFn(identifier); },
    });

    assert.equal(enrolledWith, 'Chalzcozy', 'enrollment must be offered under the real server identifier, not a local IdentityEngine id');
    assert.equal(proceeded, 'Chalzcozy');
});

function extractBiometricSubmitHandler() {
    const withoutComments = GATE_SRC.replace(/\/\*[\s\S]*?\*\//g, '');
    const marker = 'container.querySelector("#cozy-login-biometric-form").addEventListener("submit", async (e) => {';
    const start = withoutComments.indexOf(marker);
    if (start === -1) throw new Error('Could not locate the real biometric-form submit handler in cozy-login-gate.js');
    let depth = 0, i = withoutComments.indexOf('{', start);
    const bodyStart = i;
    for (; i < withoutComments.length; i++) {
        if (withoutComments[i] === '{') depth++;
        else if (withoutComments[i] === '}') { depth--; if (depth === 0) break; }
    }
    return withoutComments.slice(bodyStart + 1, i);
}

function buildBiometricContainer(username) {
    const els = { '#cozy-login-biometric-username': { value: username } };
    return { querySelector: (sel) => els[sel] || null };
}

async function runBiometricHandler({ container, showError, proceed, tdm, loginWithBiometrics }) {
    const sandbox = {
        window: { CozyOS: { TrustedDeviceManager: tdm, AuthCoordinator: { loginWithBiometrics } } },
        console, showError, proceed, container,
        e: { preventDefault() {} },
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    const body = extractBiometricSubmitHandler();
    const runner = new vm.Script(`(async () => { ${body} })()`);
    return runner.runInContext(sandbox);
}

test('biometric sign-in: a real server identifier ("Chalzcozy") with an enrolled device signs in WITHOUT requiring any local IdentityEngine record', async () => {
    let proceeded = null;
    const device = { deviceId: 'dev-1', biometricEnabled: true };
    await runBiometricHandler({
        container: buildBiometricContainer('Chalzcozy'),
        showError: () => { throw new Error('must not error on a legitimate enrolled device'); },
        proceed: (id) => { proceeded = id; },
        tdm: {
            generateFingerprint: async () => 'fp-1',
            findDeviceForUser: (userId, fp) => { assert.equal(userId, 'Chalzcozy'); assert.equal(fp, 'fp-1'); return device; },
        },
        loginWithBiometrics: async ({ userId, deviceId }) => { assert.equal(userId, 'Chalzcozy'); assert.equal(deviceId, 'dev-1'); return { granted: true }; },
    });
    assert.equal(proceeded, 'Chalzcozy');
});

test('biometric sign-in: no local IdentityEngine at all in the sandbox — proves the fix no longer depends on it', async () => {
    let proceeded = null;
    await runBiometricHandler({
        container: buildBiometricContainer('Chalzcozy'),
        showError: () => { throw new Error('must not error'); },
        proceed: (id) => { proceeded = id; },
        tdm: { generateFingerprint: async () => 'fp-1', findDeviceForUser: () => ({ deviceId: 'dev-1', biometricEnabled: true }) },
        loginWithBiometrics: async () => ({ granted: true }),
    });
    assert.equal(proceeded, 'Chalzcozy');
});

test('biometric sign-in: an identifier with no enrolled device on this browser is honestly rejected (never fabricates access)', async () => {
    let shownError = null;
    await runBiometricHandler({
        container: buildBiometricContainer('Chalzcozy'),
        showError: (_c, msg) => { shownError = msg; },
        proceed: () => { throw new Error('must not proceed with no enrolled device'); },
        tdm: { generateFingerprint: async () => 'fp-1', findDeviceForUser: () => null },
        loginWithBiometrics: async () => { throw new Error('must never be called with no device'); },
    });
    assert.match(shownError, /not a trusted device/i);
});

test('biometric sign-in: an empty identifier is rejected before any device lookup', async () => {
    let shownError = null;
    await runBiometricHandler({
        container: buildBiometricContainer(''),
        showError: (_c, msg) => { shownError = msg; },
        proceed: () => { throw new Error('must not proceed with no identifier'); },
        tdm: { generateFingerprint: async () => { throw new Error('must not even attempt a fingerprint with no identifier'); }, findDeviceForUser: () => null },
        loginWithBiometrics: async () => { throw new Error('must never be called'); },
    });
    assert.match(shownError, /enter your username or email/i);
});
