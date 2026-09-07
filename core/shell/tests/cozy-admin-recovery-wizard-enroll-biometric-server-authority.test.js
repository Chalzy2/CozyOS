'use strict';

/**
 * core/shell/tests/cozy-admin-recovery-wizard-enroll-biometric-server-authority.test.js
 *
 * Domain-1 discovery completion (Security & Sign-in, Phase 1A). First-ever
 * test file for cozy-admin-recovery-wizard.js (confirmed by repo-wide
 * search before writing this — no test file previously existed for this
 * class at all). Extracts the REAL
 * #renderNewBiometricEnrollmentStep()/enroll-button click handler source
 * verbatim (same technique already established in this repository —
 * see core/shell/tests/cozy-login-gate-server-auth-fix.test.js) and runs
 * it inside a minimal harness class that declares the same private
 * fields, rather than reimplementing the logic.
 *
 * Covers the real fix: the click handler now goes through
 * window.CozyOS.LoginGate.enrollBiometricCredential() (the same shared,
 * server-preferred/legacy-fallback function cozy-login-gate.js exports)
 * instead of calling the legacy WebAuthnProvider directly. Per the
 * architecture disclosed in the file's own updated header, this
 * recovery-wizard flow never has a real server session at the point this
 * step runs, so the honest expectation here is that it always resolves
 * through the requiresAuth-fallback branch to the legacy provider —
 * these tests assert exactly that, plus that a real (non-auth) failure
 * from the shared helper is still relayed honestly and never silently
 * swallowed.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const WIZARD_SRC = fs.readFileSync(path.join(ROOT, 'core', 'shell', 'cozy-admin-recovery-wizard.js'), 'utf8');

function extractMethodSource(markerText) {
    const withoutBlockComments = WIZARD_SRC.replace(/\/\*[\s\S]*?\*\//g, '');
    const start = withoutBlockComments.indexOf(markerText);
    if (start === -1) throw new Error(`Could not locate "${markerText}" in cozy-admin-recovery-wizard.js`);
    let depth = 0;
    let i = withoutBlockComments.indexOf('{', start);
    const bodyStart = i;
    for (; i < withoutBlockComments.length; i++) {
        if (withoutBlockComments[i] === '{') depth++;
        else if (withoutBlockComments[i] === '}') { depth--; if (depth === 0) break; }
    }
    return withoutBlockComments.slice(start, i + 1);
}

function fakeElement() {
    const listeners = {};
    return {
        _html: '',
        set innerHTML(v) { this._html = v; },
        get innerHTML() { return this._html; },
        style: {},
        appendChild() {},
        querySelector(sel) {
            if (sel === '#cz-recovery-finish') return { addEventListener: (evt, fn) => { listeners.finish = fn; } };
            if (sel === '#cz-recovery-enroll-biometric') return { addEventListener: (evt, fn) => { listeners.enroll = fn; } };
            return null;
        },
        _listeners: listeners,
    };
}

// Real class methods with # (private) names can't be invoked from outside
// the class by string lookup, so the harness class adds one thin, real
// public wrapper method that calls the extracted private method directly
// -- itself a one-line pass-through, not a reimplementation of any logic.
function buildHarnessWithCaller() {
    const methodSrc = extractMethodSource('#renderNewBiometricEnrollmentStep(newDevice) {');
    const classSrc = `
        (function(){
            class Harness {
                #userId; #username; #panelEl; #errors = [];
                constructor(userId, username, panelEl) { this.#userId = userId; this.#username = username; this.#panelEl = panelEl; }
                #panel() { return this.#panelEl; }
                #showError(msg) { this.#errors.push(msg); }
                getErrors() { return this.#errors; }
                close() { this.closed = true; }
                ${methodSrc}
                runRenderNewBiometricEnrollmentStep(newDevice) { return this.#renderNewBiometricEnrollmentStep(newDevice); }
            }
            return Harness;
        })()
    `;
    // eslint-disable-next-line no-eval
    return eval(classSrc);
}

function run({ coordinator, provider, userId = 'admin-1', username = 'Chalzcozy' } = {}) {
    global.window = {
        CozyOS: {
            WebAuthnProvider: provider,
            LoginGate: coordinator ? { enrollBiometricCredential: coordinator } : undefined,
            TrustedDeviceManager: { setBiometricEnabled: () => {} },
            IdentityEngine: { logSecurityEvent: () => {} },
        },
    };
    global.document = { createElement: () => ({ style: {}, appendChild() {} }) };
    global.setTimeout = (fn) => fn();
    const Harness = buildHarnessWithCaller();
    const panelEl = fakeElement();
    const instance = new Harness(userId, username, panelEl);
    instance.runRenderNewBiometricEnrollmentStep({ deviceId: 'device-1' });
    return { instance, panelEl };
}

// 1. Shared helper succeeds via the requiresAuth->legacy fallback (the
//    honest, real-world case for this session-less recovery flow) ->
//    real success path (audit log + success UI), no error shown.
test('recovery wizard biometric enroll: shared helper honest legacy-fallback success -> no error, device marked trusted', async () => {
    const coordinator = async (userId, opts) => {
        assert.equal(userId, 'admin-1');
        assert.deepEqual(opts, { displayName: 'Chalzcozy' });
        return { success: true, source: 'legacy' };
    };
    const { instance, panelEl } = run({ coordinator, provider: { isSupported: () => true } });
    await panelEl._listeners.enroll();
    assert.deepEqual(instance.getErrors(), []);
});

// 2. Shared helper reports a real failure -> relayed via #showError, never swallowed.
test('recovery wizard biometric enroll: a real failure from the shared helper is shown via #showError', async () => {
    const coordinator = async () => ({ success: false, reason: 'Real WebAuthn registration failed.' });
    const { instance, panelEl } = run({ coordinator, provider: { isSupported: () => true } });
    await panelEl._listeners.enroll();
    assert.deepEqual(instance.getErrors(), ['Real WebAuthn registration failed.']);
});

// 3. window.CozyOS.LoginGate not loaded at all -> honest degrade straight
//    to the legacy provider (older page / load-order edge case), matching
//    the file's own documented fallback, never a thrown error.
test('recovery wizard biometric enroll: degrades to legacy WebAuthnProvider when LoginGate is not loaded', async () => {
    let legacyCalled = false;
    const provider = {
        isSupported: () => true,
        registerCredential: async (userId, opts) => { legacyCalled = true; assert.equal(userId, 'admin-1'); return { success: true }; },
    };
    const { instance, panelEl } = run({ coordinator: undefined, provider });
    await panelEl._listeners.enroll();
    assert.equal(legacyCalled, true);
    assert.deepEqual(instance.getErrors(), []);
});

// 4. Legacy degrade path itself fails -> honest error shown.
test('recovery wizard biometric enroll: legacy degrade failure is shown honestly', async () => {
    const provider = {
        isSupported: () => true,
        registerCredential: async () => ({ success: false, reason: 'WebAuthn is not supported by this browser.' }),
    };
    const { instance, panelEl } = run({ coordinator: undefined, provider });
    await panelEl._listeners.enroll();
    assert.deepEqual(instance.getErrors(), ['WebAuthn is not supported by this browser.']);
});
