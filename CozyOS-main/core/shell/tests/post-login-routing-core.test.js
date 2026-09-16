/**
 * core/shell/tests/post-login-routing-core.test.js
 * Run with: node --test core/shell/tests/post-login-routing-core.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CORE_PATH = path.join(__dirname, '..', 'post-login-routing-core.js');

function load() {
    delete require.cache[require.resolve(CORE_PATH)];
    global.window = { CozyOS: {} };
    require(CORE_PATH);
    return global.window.CozyOS.PostLoginRoutingCore;
}

const { decidePostLoginDestination, DESTINATION } = load();

// --- TEST 1 / TEST 2 equivalents from the offline-first repair task ---

test('online normal user (authenticated, isPlatformAdmin false) -> USER_DASHBOARD', () => {
    const result = decidePostLoginDestination({
        authenticated: true,
        dashboardConfig: { available: true, dashboardType: 'user', isPlatformAdmin: false },
    });
    assert.equal(result.destination, DESTINATION.USER_DASHBOARD);
});

test('online platform administrator (authenticated, isPlatformAdmin true) -> CHALZYDASHBOARD', () => {
    const result = decidePostLoginDestination({
        authenticated: true,
        dashboardConfig: { available: true, dashboardType: 'admin', isPlatformAdmin: true },
    });
    assert.equal(result.destination, DESTINATION.CHALZYDASHBOARD);
});

// --- not authenticated ---

test('not authenticated -> LOGIN, regardless of dashboardConfig content', () => {
    const result = decidePostLoginDestination({
        authenticated: false,
        dashboardConfig: { available: true, isPlatformAdmin: true },
    });
    assert.equal(result.destination, DESTINATION.LOGIN);
});

test('authenticated field missing entirely -> LOGIN (fail-closed default)', () => {
    const result = decidePostLoginDestination({ dashboardConfig: { available: true, isPlatformAdmin: true } });
    assert.equal(result.destination, DESTINATION.LOGIN);
});

// --- malformed / missing dashboardConfig never blocks an authenticated user ---

test('authenticated but dashboardConfig missing -> USER_DASHBOARD (matches pre-existing default behavior)', () => {
    const result = decidePostLoginDestination({ authenticated: true, dashboardConfig: null });
    assert.equal(result.destination, DESTINATION.USER_DASHBOARD);
});

test('authenticated but dashboardConfig.available is false (e.g. unknown userId) -> USER_DASHBOARD, never LOGIN', () => {
    const result = decidePostLoginDestination({
        authenticated: true,
        dashboardConfig: { available: false, reason: 'Unknown userId.' },
    });
    assert.equal(result.destination, DESTINATION.USER_DASHBOARD);
});

test('malformed decidePostLoginDestination input (not an object) -> LOGIN', () => {
    assert.equal(decidePostLoginDestination(null).destination, DESTINATION.LOGIN);
    assert.equal(decidePostLoginDestination(undefined).destination, DESTINATION.LOGIN);
});

// --- spoofing / privilege-escalation resistance (mirrors admin-gate-core.js's own strict-boolean tests) ---

test('isPlatformAdmin as a truthy non-boolean (1) does NOT grant CHALZYDASHBOARD', () => {
    const result = decidePostLoginDestination({
        authenticated: true,
        dashboardConfig: { available: true, isPlatformAdmin: 1 },
    });
    assert.equal(result.destination, DESTINATION.USER_DASHBOARD);
});

test('isPlatformAdmin as the string "true" does NOT grant CHALZYDASHBOARD', () => {
    const result = decidePostLoginDestination({
        authenticated: true,
        dashboardConfig: { available: true, isPlatformAdmin: 'true' },
    });
    assert.equal(result.destination, DESTINATION.USER_DASHBOARD);
});

test('a client-supplied dashboardType: "admin" without isPlatformAdmin === true does NOT grant CHALZYDASHBOARD', () => {
    const result = decidePostLoginDestination({
        authenticated: true,
        dashboardConfig: { available: true, dashboardType: 'admin', isPlatformAdmin: false },
    });
    assert.equal(result.destination, DESTINATION.USER_DASHBOARD);
});

test('this module never inspects a username, URL, query string, or hash — it only accepts an already-resolved dashboardConfig object', () => {
    // decidePostLoginDestination has no branch that reads anything other
    // than input.authenticated and input.dashboardConfig.{available,isPlatformAdmin}.
    // This test documents that contract: extra fields (username, url,
    // queryParams, hash, role) are present but must have zero effect.
    const result = decidePostLoginDestination({
        authenticated: true,
        username: 'chalzy2',
        url: '/chalzydashboard?admin=true#admin',
        role: 'admin',
        dashboardConfig: { available: true, isPlatformAdmin: false },
    });
    assert.equal(result.destination, DESTINATION.USER_DASHBOARD);
});

test('DESTINATION enum is frozen and has exactly the three expected values', () => {
    assert.deepEqual(Object.keys(DESTINATION).sort(), ['CHALZYDASHBOARD', 'LOGIN', 'USER_DASHBOARD']);
    assert.ok(Object.isFrozen(DESTINATION));
});
