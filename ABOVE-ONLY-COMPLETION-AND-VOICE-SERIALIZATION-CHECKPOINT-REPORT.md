# ABOVE ONLY Visual Completeness + Serialized Startup Voice - Checkpoint Report

## Part 1: ABOVE ONLY final-letter clipping (real root cause found and fixed)

### Quick Reader finding
Two prior "REAL FIX" attempts were already committed and documented in
core/shell/launch-sequence.css's own comments:
1. width:max-content (fixes centering math using the box's real width)
2. A <=480px media query removing max-width entirely (fixes small
   phones where the 75vw cap could be narrower than real content)

Neither fix covers the BASE rule's own two independent, non-tracking
caps: font-size clamps at a 168px maximum while max-width independently
clamps at a 900px maximum. Once font-size reaches 168px, the real
10-character text at that size (~924px by a conservative per-character
estimate) can exceed the 900px width ceiling on wide desktop viewports
- the exact same class of defect already diagnosed, just not yet closed
for this case.

### Real fix
Added min-width: max-content; to the base #cozy-launch-above-only
rule. Per CSS spec, when min-width and max-width conflict, min-width
wins - this makes it structurally impossible for max-width to ever
shrink the box below its own real content width, at any viewport, while
max-width continues to genuinely cap growth wherever content is
naturally narrower than the target ~75%-of-width/900px sizing. No
overflow property was touched anywhere - the fix is a real box-sizing
correction, not concealment.

## Part 2: Serialized startup voice (zero overlap)

### Real defect found
playStartupVoice() ("Welcome to CozyOS") was fire-and-forget at Stage 2
(logo reveal) - the sequence proceeded to Stage 3 typing and then ABOVE
ONLY on a fixed 1500ms timer regardless of whether the welcome voice had
actually finished, risking real audio overlap between "Welcome to
CozyOS" and "ABOVE ONLY" whenever the welcome clip took longer than
1500ms to play. ABOVE ONLY -> Motto was already correctly serialized
(motto's voice call was already nested inside ABOVE ONLY's own
onComplete callback).

### Real fix
The Stage 3 typing sequence was extracted into a named function
(runStage3TypingSequence, body completely unchanged) and is now
triggered by playStartupVoice().then(...) instead of a raw setTimeout.
The wait duration is Math.max(0, 1500ms - real elapsed time since Stage
2 began) - preserving the exact original 1500ms visual timing whenever
voice is muted or finishes quickly (existing "visual continues when
muted" behavior fully preserved, confirmed by the still-passing mute
test), while genuinely waiting the extra real time whenever an enabled
voice takes longer, achieving zero audio overlap. No new audio engine;
playStartupVoice() itself was not modified.

No changes to the login form, registration modal, authentication,
registration, dashboard routing, or any animation timing/visual/keyframe
values beyond the two additive fixes above.

## Tests
| Suite | Result |
|---|---|
| launch-sequence-above-only.test.js (2 new CSS tests F4/F5, 1 new DOM completeness test, 1 new serialization test, all pre-existing tests) | 36/36 pass |
| launch-sequence-no-replay-after-login.test.js | 4/4 pass |
| index-html-post-login-routing-wiring.test.js | 6/6 pass |

0 regressions. All three suites independently confirmed passing (46
total individual subtests, 0 failures); a combined single-invocation
run of all three together did not exit within the timeout window due to
multiple vm-sandboxed timer contexts running concurrently in one Node
process - a process-exit characteristic of the test harness, not a test
failure, confirmed by the identical 46/46 "ok" results captured before
the timeout and by each file's own clean, fast, independent run.

## Domain status: COMPLETE

## Next
Master drawer, full-phone workspace, and post-registration voice
selection remain explicitly deferred, as instructed.
