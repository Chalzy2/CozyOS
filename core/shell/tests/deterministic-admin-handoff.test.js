'use strict';

/**
 * core/shell/tests/deterministic-admin-handoff.test.js
 *
 * COZYOS — DETERMINISTIC MAIN ADMINISTRATOR HANDOFF
 *
 * ROOT CAUSE: login.html's resolveDestinationForLoginResult(result)
 * hardcoded "/chalzydashboard" as the destination for any
 * server-verified administrator (result.isPlatformAdmin === true).
 * chalzydashboard.html remains a real, working, independent
 * server-verified entry point (unchanged) - but the person's own,
 * currently-used main Administrator dashboard is admin-workspace.html,
 * and every fresh administrator login (password form, Passkey button,
 * OTP/MFA completion, and Firebase admin form - all 5 real call sites
 * in login.html funnel through this ONE function) was instead sending
 * them to the legacy page.
 *
 * FIX: resolveDestinationForLoginResult() now returns
 * "admin-workspace.html" for a genuinely server-verified administrator.
 * The authorization decision itself (result.isPlatformAdmin, set
 * exclusively by AuthCoordinator.loginWithServerPassword()'s real
 * server response) is completely unchanged - only the destination
 * string changed, in exactly one place.
 *
 * These tests extract and execute the REAL function body from login.html
 * directly (rather than re-implementing its logic), so a future edit to
 * the real function is what these tests actually exercise - not a
 * hand-copied approximation.
 *
 * Full, real-browser end-to-end coverage (actual navigation, actual
 * server responses, actual DOM forms) lives in
 * server/webauthn-rp/test/browser-e2e-admin-routing-fix.test.js, updated
 * alongside this fix.
 *
 * Run: node --test core/shell/tests/deterministic-admin-handoff.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LOGIN_HTML_PATH = path.join(__dirname, '..', '..', '..', 'login.html');
const LOGIN_HTML_SOURCE = fs.readFileSync(LOGIN_HTML_PATH, 'utf8');

/**
 * Extracts resolvePostLoginDestination() and resolveDestinationForLoginResult()
 * verbatim from login.html and evaluates them in a minimal, controlled
 * sandbox - the same two real functions the browser actually runs, not
 * a reimplementation.
 */
function loadRealFunctions({ search = '', returnDestinationCore = null } = {}) {
    const startMarker = 'function resolvePostLoginDestination() {';
    const startIdx = LOGIN_HTML_SOURCE.indexOf(startMarker);
    assert.ok(startIdx > -1, 'resolvePostLoginDestination() must still exist in login.html');
    const funcEndMarker = 'function resolveDestinationForLoginResult(result) {';
    const funcStartIdx = LOGIN_HTML_SOURCE.indexOf(funcEndMarker, startIdx);
    assert.ok(funcStartIdx > startIdx, 'resolveDestinationForLoginResult() must still exist after resolvePostLoginDestination()');
    // The second function's own closing brace is the first "\n}" after
    // its own opening brace - stop there, before any later IIFE (which
    // would execute immediately on eval and requires a real `document`
    // this isolated sandbox intentionally does not provide).
    const secondFuncBraceEnd = LOGIN_HTML_SOURCE.indexOf('\n}', funcStartIdx);
    assert.ok(secondFuncBraceEnd > funcStartIdx);
    const source = LOGIN_HTML_SOURCE.slice(startIdx, secondFuncBraceEnd + 2);

    const sandbox = {
        window: {
            location: { search },
            CozyOS: { ReturnDestinationCore: returnDestinationCore },
        },
    };
    // eslint-disable-next-line no-new-func
    const factory = new Function('window', `${source}\nreturn { resolvePostLoginDestination, resolveDestinationForLoginResult };`);
    return factory(sandbox.window);
}

// ---- Test A: successful admin login redirects to current dashboard ----

test('A: a genuinely server-verified administrator (isPlatformAdmin: true) is routed to admin-workspace.html, never /chalzydashboard', () => {
    const { resolveDestinationForLoginResult } = loadRealFunctions();
    const destination = resolveDestinationForLoginResult({ available: true, isPlatformAdmin: true });
    assert.equal(destination, 'admin-workspace.html');
    assert.notEqual(destination, '/chalzydashboard');
});

test('A: this holds regardless of which real call site produced the result (password, Passkey, OTP/MFA, Firebase admin form all produce the same {isPlatformAdmin} shape)', () => {
    const { resolveDestinationForLoginResult } = loadRealFunctions();
    for (const result of [
        { available: true, isPlatformAdmin: true }, // password
        { available: true, isPlatformAdmin: true, requiresOtp: false }, // passkey
        { available: true, isPlatformAdmin: true, source: 'server' }, // OTP/MFA completion
    ]) {
        assert.equal(resolveDestinationForLoginResult(result), 'admin-workspace.html');
    }
});

// ---- Test C: non-admin cannot enter administrator dashboard ----

test('C: an ordinary, non-admin login result is never routed to admin-workspace.html', () => {
    const { resolveDestinationForLoginResult } = loadRealFunctions();
    const destination = resolveDestinationForLoginResult({ available: true, isPlatformAdmin: false });
    assert.notEqual(destination, 'admin-workspace.html');
    assert.notEqual(destination, '/chalzydashboard');
    assert.equal(destination, 'index.html', 'an ordinary user falls through to the same default destination as before this fix');
});

test('C: a missing/undefined isPlatformAdmin field (never explicitly false) is treated as non-admin, never defaults to the admin destination', () => {
    const { resolveDestinationForLoginResult } = loadRealFunctions();
    assert.notEqual(resolveDestinationForLoginResult({ available: true }), 'admin-workspace.html');
    assert.notEqual(resolveDestinationForLoginResult(null), 'admin-workspace.html');
    assert.notEqual(resolveDestinationForLoginResult(undefined), 'admin-workspace.html');
});

// ---- G: legacy dashboard is never selected as a fresh-login destination ----

test('G: resolveDestinationForLoginResult() never returns "/chalzydashboard" for ANY input - the legacy destination string does not appear anywhere in its real, current logic', () => {
    const startMarker = 'function resolveDestinationForLoginResult(result) {';
    const idx = LOGIN_HTML_SOURCE.indexOf(startMarker);
    assert.ok(idx > -1);
    const braceStart = LOGIN_HTML_SOURCE.indexOf('{', idx + startMarker.length - 1);
    const braceEnd = LOGIN_HTML_SOURCE.indexOf('\n}', braceStart);
    const body = LOGIN_HTML_SOURCE.slice(idx, braceEnd);
    // Checks specifically for the legacy path appearing as a quoted,
    // returnable STRING LITERAL (what a `return "..."` statement would
    // use) - not merely as a substring of prose in this function's own
    // explanatory comments (which legitimately mention chalzydashboard
    // by name to document what changed).
    assert.doesNotMatch(body, /return\s*["']\/chalzydashboard/, 'the legacy destination must never be returned by resolveDestinationForLoginResult() itself');
});

test('G: chalzydashboard.html remains present and legitimate as its own, independent, unmodified server-verified entry point (not deleted, not broken)', () => {
    const chalzyPath = path.join(__dirname, '..', '..', '..', 'chalzydashboard.html');
    assert.ok(fs.existsSync(chalzyPath), 'chalzydashboard.html must still exist - it is a legitimate independent entry point, not deleted');
    const content = fs.readFileSync(chalzyPath, 'utf8');
    assert.match(content, /AdminGateCore/, 'its own real, independent server-verification gate must remain intact');
});

test('G: admin-workspace.html exists and performs its own real, independent server-authoritative verification (not a trust-the-redirect shortcut)', () => {
    const adminWorkspacePath = path.join(__dirname, '..', '..', '..', 'admin-workspace.html');
    assert.ok(fs.existsSync(adminWorkspacePath));
    const content = fs.readFileSync(adminWorkspacePath, 'utf8');
    assert.match(content, /webauthn\/session/, 'admin-workspace.html must independently re-verify via the real server session check, never trust that arriving there implies authorization');
    assert.match(content, /AdminGateCore/);
});

// ---- Ordinary destination logic is completely untouched ----

test('REGRESSION: resolvePostLoginDestination() itself (used for the ordinary, non-admin case) is completely unchanged by this fix', () => {
    const fakeCore = { resolveReturnDestination: (raw) => (raw === '/some/safe/page' ? '/some/safe/page' : null) };
    const { resolvePostLoginDestination } = loadRealFunctions({ search: '?return=%2Fsome%2Fsafe%2Fpage', returnDestinationCore: fakeCore });
    assert.equal(resolvePostLoginDestination(), '/some/safe/page');
});

test('REGRESSION: resolvePostLoginDestination() still defaults to index.html with no valid return parameter', () => {
    const { resolvePostLoginDestination } = loadRealFunctions({ search: '' });
    assert.equal(resolvePostLoginDestination(), 'index.html');
});

console.log('Deterministic Main Administrator Handoff suite: run complete.');
