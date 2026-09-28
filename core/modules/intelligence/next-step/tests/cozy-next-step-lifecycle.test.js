'use strict';

/**
 * core/modules/intelligence/next-step/tests/cozy-next-step-lifecycle.test.js
 *
 * Live Next-Step Intelligence — unit tests for
 * window.CozyOS.NextStepLifecycle, the 8-state machine
 * cozy-next-step-suggestions-ui.js owns per Live Window instance.
 *
 * Run with: node --test core/modules/intelligence/next-step/tests/cozy-next-step-lifecycle.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

function load() {
    delete require.cache[require.resolve('../cozy-next-step-lifecycle.js')];
    global.window = { CozyOS: {} };
    require('../cozy-next-step-lifecycle.js');
    return window.CozyOS.NextStepLifecycle;
}

test('registers all 8 required states', () => {
    const L = load();
    assert.deepEqual(L.STATES, [
        'NO_SUGGESTIONS', 'SUGGESTIONS_AVAILABLE', 'SUGGESTION_SELECTED',
        'ACTION_PENDING_AUTHORIZATION', 'ACTION_RUNNING', 'ACTION_SUCCESS',
        'ACTION_FAILED', 'SUGGESTIONS_REFRESHED'
    ]);
});

test('the real per-turn happy path is legal end to end', () => {
    const L = load();
    const path = ['NO_SUGGESTIONS', 'SUGGESTIONS_AVAILABLE', 'SUGGESTION_SELECTED', 'ACTION_RUNNING', 'ACTION_SUCCESS', 'SUGGESTIONS_REFRESHED', 'SUGGESTIONS_AVAILABLE'];
    for (let i = 1; i < path.length; i++) {
        const result = L.transition(path[i - 1], path[i]);
        assert.equal(result.allowed, true, `${path[i - 1]} -> ${path[i]} should be legal: ${result.reason}`);
    }
});

test('the destructive path requires ACTION_PENDING_AUTHORIZATION before ACTION_RUNNING is reachable from SUGGESTION_SELECTED via that route', () => {
    const L = load();
    assert.equal(L.transition('SUGGESTION_SELECTED', 'ACTION_PENDING_AUTHORIZATION').allowed, true);
    assert.equal(L.transition('ACTION_PENDING_AUTHORIZATION', 'ACTION_RUNNING').allowed, true);
    // A cancelled confirmation returns to the suggestion list, never
    // silently proceeding to ACTION_RUNNING on its own.
    assert.equal(L.transition('ACTION_PENDING_AUTHORIZATION', 'SUGGESTIONS_AVAILABLE').allowed, true);
});

test('an illegal transition is rejected with a real, honest reason — never silently forced', () => {
    const L = load();
    const result = L.transition('NO_SUGGESTIONS', 'ACTION_SUCCESS');
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('Illegal transition'));
});

test('an unknown state name is rejected', () => {
    const L = load();
    const result = L.transition('SUGGESTIONS_AVAILABLE', 'NOT_A_REAL_STATE');
    assert.equal(result.allowed, false);
});

test('ANY state can transition to NO_SUGGESTIONS — the universal context/mode-switch teardown', () => {
    const L = load();
    for (const s of L.STATES) {
        assert.equal(L.canTransition(s, 'NO_SUGGESTIONS'), true, `${s} -> NO_SUGGESTIONS must always be allowed (teardown).`);
    }
});

test('ACTION_FAILED offers both [Try Again] (SUGGESTION_SELECTED) and [Choose Another Action] (SUGGESTIONS_AVAILABLE)', () => {
    const L = load();
    assert.equal(L.transition('ACTION_FAILED', 'SUGGESTION_SELECTED').allowed, true);
    assert.equal(L.transition('ACTION_FAILED', 'SUGGESTIONS_AVAILABLE').allowed, true);
    assert.equal(L.transition('ACTION_FAILED', 'SUGGESTIONS_REFRESHED').allowed, true);
});
