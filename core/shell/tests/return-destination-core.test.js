'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..', '..');

function loadCore() {
    const sandbox = { window: null };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', 'shell', 'return-destination-core.js'), 'utf8'), sandbox);
    return sandbox.window.CozyOS.ReturnDestinationCore;
}

test('accepts /chalzydashboard exactly', () => {
    const core = loadCore();
    assert.equal(core.resolveReturnDestination('/chalzydashboard'), '/chalzydashboard');
});

test('accepts /chalzydashboard.html exactly', () => {
    const core = loadCore();
    assert.equal(core.resolveReturnDestination('/chalzydashboard.html'), '/chalzydashboard.html');
});

test('accepts /dashboard exactly (real regression fix: dashboard-as-admin-entry)', () => {
    const core = loadCore();
    assert.equal(core.resolveReturnDestination('/dashboard'), '/dashboard');
});

test('accepts /dashboard.html exactly (real regression fix: dashboard-as-admin-entry)', () => {
    const core = loadCore();
    assert.equal(core.resolveReturnDestination('/dashboard.html'), '/dashboard.html');
});

test('missing/undefined/null returns null (caller falls back to its own default)', () => {
    const core = loadCore();
    assert.equal(core.resolveReturnDestination(undefined), null);
    assert.equal(core.resolveReturnDestination(null), null);
    assert.equal(core.resolveReturnDestination(''), null);
});

test('rejects external absolute URL', () => {
    const core = loadCore();
    assert.equal(core.resolveReturnDestination('https://evil.example'), null);
    assert.equal(core.resolveReturnDestination('http://evil.example/chalzydashboard'), null);
});

test('rejects protocol-relative URL (//evil.example)', () => {
    const core = loadCore();
    assert.equal(core.resolveReturnDestination('//evil.example'), null);
    assert.equal(core.resolveReturnDestination('//evil.example/chalzydashboard'), null);
});

test('rejects javascript: URL', () => {
    const core = loadCore();
    assert.equal(core.resolveReturnDestination('javascript:alert(1)'), null);
    assert.equal(core.resolveReturnDestination('  javascript:alert(1)'), null);
});

test('rejects arbitrary unapproved path', () => {
    const core = loadCore();
    assert.equal(core.resolveReturnDestination('/admin'), null);
    assert.equal(core.resolveReturnDestination('/chalzydashboard/../admin'), null);
    assert.equal(core.resolveReturnDestination('/chalzydashboardx'), null);
    assert.equal(core.resolveReturnDestination('/dashboards'), null);
});

test('rejects a value that merely starts with an allowed destination (no prefix matching)', () => {
    const core = loadCore();
    assert.equal(core.resolveReturnDestination('/chalzydashboard?x=https://evil.example'), null);
    assert.equal(core.resolveReturnDestination('/chalzydashboard/'), null);
});

test('non-string input never throws, always resolves to null', () => {
    const core = loadCore();
    assert.equal(core.resolveReturnDestination(42), null);
    assert.equal(core.resolveReturnDestination({}), null);
    assert.equal(core.resolveReturnDestination(['/chalzydashboard']), null);
});

test('ALLOWED_DESTINATIONS is frozen and contains exactly the four expected entries', () => {
    const core = loadCore();
    assert.deepEqual(Array.from(core.ALLOWED_DESTINATIONS), ['/chalzydashboard', '/chalzydashboard.html', '/dashboard', '/dashboard.html']);
    assert.ok(Object.isFrozen(core.ALLOWED_DESTINATIONS));
});
