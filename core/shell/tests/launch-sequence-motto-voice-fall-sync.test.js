'use strict';

/**
 * core/shell/tests/launch-sequence-motto-voice-fall-sync.test.js
 *
 * FINAL AUDIO ↔ FALLING ANIMATION SYNCHRONIZATION correction.
 *
 * ROOT CAUSE (confirmed by direct source reading, not guessed):
 * playMottoVoice() used to be called INSIDE fallBounceSplitColorText()'s
 * own onComplete callback - i.e. "Built for Africa. Ready for the
 * world." only began being spoken AFTER the falling-text animation had
 * already finished falling, not while it was still falling/moving.
 *
 * FIX: playMottoVoice() and fallBounceSplitColorText() are now both
 * started together (Promise.all gates the next stage on whichever
 * finishes last), so the voice is genuinely audible WHILE the letters
 * are falling.
 *
 * This is a structural, source-level check (same established precedent
 * as launch-sequence-slogan-split-color.test.js's own plain-string CSS
 * assertions) rather than a full mocked-timer runtime replay, since the
 * existing above-only sandbox does not mock LiveAnimationEngine at all
 * (it exercises the honest instant-render fallback path instead) - a
 * source-shape assertion is the more direct, honest way to prove this
 * specific ordering fix without fabricating a new mock harness.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'launch-sequence.js'), 'utf8');

test('playMottoVoice() is invoked BEFORE/alongside fallBounceSplitColorText(), not nested inside its completion callback', () => {
    const fallCallIndex = SRC.indexOf('fallBounceSplitColorText(slogan, SLOGAN, SLOGAN_SPLIT_INDEX, resolveFall)');
    const mottoVoiceCallIndex = SRC.indexOf('const mottoVoicePromise = playMottoVoice();');
    assert.ok(fallCallIndex > -1, 'the real fallBounceSplitColorText(...) call site must exist');
    assert.ok(mottoVoiceCallIndex > -1, 'the real playMottoVoice() concurrent-start call site must exist');
    assert.ok(mottoVoiceCallIndex < fallCallIndex, 'playMottoVoice() must be initiated before (i.e. concurrently with, not nested inside) fallBounceSplitColorText()');
});

test('the old sequential pattern (voice nested inside the fall\'s own onComplete callback) no longer exists', () => {
    // The old, now-removed shape was:
    //   fallBounceSplitColorText(slogan, SLOGAN, SLOGAN_SPLIT_INDEX, () => {
    //       voiceStartedAt = Date.now();
    //       playMottoVoice().then(...)
    //   });
    // i.e. playMottoVoice() textually appearing as the 4th, inline
    // callback argument to fallBounceSplitColorText(). The new shape
    // passes a plain resolver (resolveFall) as the 4th argument instead.
    assert.doesNotMatch(SRC, /fallBounceSplitColorText\(slogan, SLOGAN, SLOGAN_SPLIT_INDEX, \(\) => \{/, 'fallBounceSplitColorText\'s 4th argument must be a plain resolver, not an inline callback that starts the voice after the fall completes');
});

test('the next stage waits for BOTH the fall animation and the voice to finish (Promise.all), protecting "Ready for the world" from being cut off', () => {
    assert.match(SRC, /Promise\.all\(\[mottoFallPromise, mottoVoicePromise\]\)\.then\(/, 'the completion gate must wait for whichever of the two (fall animation, real voice duration) finishes last');
});

test('the falling-text animation call itself (function, arguments, computed timing) is completely unchanged by this correction', () => {
    // Proves the animation's own real call signature/timing computation
    // (staggerMs/durationMs targeting STARTUP_TIMING.MOTTO_STAGE_MS) was
    // not touched - only WHEN playMottoVoice() starts relative to it.
    assert.match(SRC, /const staggerMs = Math\.min\(45, STARTUP_TIMING\.MOTTO_STAGE_MS \/ Math\.max\(1, text\.length \* 3\)\);/);
    assert.match(SRC, /const durationMs = Math\.max\(300, STARTUP_TIMING\.MOTTO_STAGE_MS - \(text\.length - 1\) \* staggerMs\);/);
    assert.match(SRC, /engine\.fallBounceText\(el, text, splitIndex, \{ staggerMs, durationMs \}, onComplete\);/);
});

console.log('Launch sequence motto voice / falling-text animation synchronization suite: run complete.');
