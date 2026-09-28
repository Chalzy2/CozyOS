'use strict';

/**
 * core/modules/intelligence/next-step/tests/cozy-next-step-duplicate-detection.test.js
 *
 * Live Next-Step Intelligence — REQUIRED TEST 13: grep-confirm no
 * second suggestion engine, AI instance, semantic system, duplicate
 * listener, or duplicate action router was created by this feature.
 *
 * Run with: node --test core/modules/intelligence/next-step/tests/cozy-next-step-duplicate-detection.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

function grepCount(pattern, globs) {
    try {
        const args = ['-r', '-E', pattern, ...(globs || []).flatMap((g) => ['--include', g]), '.'];
        const out = execFileSync('grep', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        return out.split('\n').filter(Boolean);
    } catch (err) {
        if (err.status === 1) return []; // grep: no matches
        throw err;
    }
}

test('exactly one file assigns window.CozyOS.NextStepEngine', () => {
    const hits = grepCount('window\\.CozyOS\\.NextStepEngine\\s*=', ['*.js']);
    const files = new Set(hits.map((l) => l.split(':')[0]));
    assert.equal(files.size, 1, `Expected exactly 1 file, found: ${[...files].join(', ')}`);
    assert.ok([...files][0].endsWith('cozy-next-step-engine.js'));
});

test('exactly one file assigns window.CozyOS.NextStepActionRegistry', () => {
    const hits = grepCount('window\\.CozyOS\\.NextStepActionRegistry\\s*=', ['*.js']);
    const files = new Set(hits.map((l) => l.split(':')[0]));
    assert.equal(files.size, 1, `Expected exactly 1 file, found: ${[...files].join(', ')}`);
});

test('exactly one file assigns window.CozyOS.NextStepSuggestionsUI', () => {
    const hits = grepCount('window\\.CozyOS\\.NextStepSuggestionsUI\\s*=', ['*.js']);
    const files = new Set(hits.map((l) => l.split(':')[0]));
    assert.equal(files.size, 1, `Expected exactly 1 file, found: ${[...files].join(', ')}`);
});

test('exactly one file assigns window.CozyOS.NextStepLifecycle', () => {
    const hits = grepCount('window\\.CozyOS\\.NextStepLifecycle\\s*=', ['*.js']);
    const files = new Set(hits.map((l) => l.split(':')[0]));
    assert.equal(files.size, 1, `Expected exactly 1 file, found: ${[...files].join(', ')}`);
});

test('exactly one file assigns window.CozyOS.NextStepSuggestionContract', () => {
    const hits = grepCount('window\\.CozyOS\\.NextStepSuggestionContract\\s*=', ['*.js']);
    const files = new Set(hits.map((l) => l.split(':')[0]));
    assert.equal(files.size, 1, `Expected exactly 1 file, found: ${[...files].join(', ')}`);
});

test('this feature does not create a second window.CozyOS.LiveWindow — the existing singleton is composed, never re-assigned', () => {
    const hits = grepCount('window\\.CozyOS\\.LiveWindow\\s*=\\s*Object\\.freeze', ['*.js']);
    const files = new Set(hits.map((l) => l.split(':')[0]));
    assert.equal(files.size, 1, `window.CozyOS.LiveWindow must still be assigned by exactly one file (core/shell/live-window-controller.js), found: ${[...files].join(', ')}`);
    assert.ok([...files][0].endsWith('live-window-controller.js'));
});

test('this feature does not create a second window.CozyOS.LivingAssistant / CognitiveCoordinator / CozyAI instance', () => {
    for (const symbol of ['LivingAssistant', 'CognitiveCoordinator', 'CozyAI', 'CozyAnswerEngine']) {
        const hits = grepCount(`window\\.CozyOS\\.${symbol}\\s*=`, ['*.js']);
        const files = new Set(hits.map((l) => l.split(':')[0]).filter((f) => !f.includes('/tests/') && !f.includes('.test.js')));
        assert.ok(files.size <= 1, `Expected at most 1 real assignment of window.CozyOS.${symbol}, found: ${[...files].join(', ')}`);
    }
});

test('exactly one real listener for the \'cozyos:next-step-suggestions\' event, and exactly one real dispatcher', () => {
    const listenerHits = grepCount("addEventListener\\(.cozyos:next-step-suggestions.", ['*.js']);
    const listenerFiles = new Set(listenerHits.map((l) => l.split(':')[0]).filter((f) => !f.includes('.test.js')));
    assert.equal(listenerFiles.size, 1, `Expected exactly 1 real listener file, found: ${[...listenerFiles].join(', ')}`);
    assert.ok([...listenerFiles][0].endsWith('cozy-next-step-suggestions-ui.js'));

    const dispatchHits = grepCount("dispatchEvent\\(new CustomEvent\\(.cozyos:next-step-suggestions.", ['*.js']);
    const dispatchFiles = new Set(dispatchHits.map((l) => l.split(':')[0]).filter((f) => !f.includes('.test.js')));
    assert.equal(dispatchFiles.size, 1, `Expected exactly 1 real dispatcher file, found: ${[...dispatchFiles].join(', ')}`);
    assert.ok([...dispatchFiles][0].endsWith('cozy-answer-engine.js'));
});

test('no other file defines a competing registerAction()/action-router primitive named the same way', () => {
    const hits = grepCount('function registerAction\\(', ['*.js']);
    const files = new Set(hits.map((l) => l.split(':')[0]).filter((f) => !f.includes('.test.js')));
    assert.equal(files.size, 1, `Expected exactly 1 file defining registerAction(), found: ${[...files].join(', ')}`);
    assert.ok([...files][0].endsWith('cozy-next-step-action-registry.js'));
});

test('the app-specific *-live-window-mode.js files this task was told not to touch are unmodified by this feature (none reference next-step files)', () => {
    const hits = grepCount('next-step', ['*-live-window-mode.js']);
    const otherAppFiles = hits.map((l) => l.split(':')[0]).filter((f) => !f.includes('worship-live-window-mode'));
    assert.deepEqual(otherAppFiles, [], `This feature must not touch other applications' live-window-mode files: ${otherAppFiles.join(', ')}`);
});
