# CP15 Checkpoint: Kiswahili Hearing → Living Learning

**Checkpoint name:** CozyOS-CP15-Kiswahili-Hearing-To-Learning-Checkpoint
**Created:** 2026-08-29
**Built from:** `CozyOS-Merged-00012.zip` (CP14 — Kiswahili Hearing Foundation Reconciliation), the latest verified checkpoint

**Status: COMPLETE** (not "IN PROGRESS" — all planned work finished, tested, and regression-verified this session).

## Audit finding that shaped this checkpoint

Before writing any code, the existing architecture was traced against
CP15's own request list. Most of the requested pipeline **already
existed** from CP9-14:

- `learnFromVoice()` already only ever resolves from `onFinalResult`/
  `onError`/`onStop` — it never listens for `onPartialResult` at all,
  so interim speech structurally cannot reach durable learning. No
  change needed for this requirement.
- `learnFromMultimodalObservation()`/`confirmMultimodalObservation()`
  already implement the full observation → review → explicit-Learn →
  durable-commit flow, composing the existing `CozyMemory` and
  `LivingLanguageVerification` — no new engine needed.
- A duplicate-final-result guard (`settled` flag in `learnFromVoice()`)
  already existed from the CP14 merge fix — confirmed by test, not
  assumed (see below).
- A duplicate-Learn-click guard already existed structurally: the
  review card's DOM is cleared after the Learn button's click handler
  runs, so a second click has no button left to click.

**One real, honest limitation confirmed, not fixed:**
`LivingLanguageVerification.submitObservation(termId, meaning, {region,
context, submittedBy})` has no `language` parameter at all — reading
its real signature confirmed this. The full Kiswahili observation
record (including `audio.language: 'sw'`) IS preserved verbatim in the
durable `CozyMemory` record `confirmMultimodalObservation()` writes;
it is only the separate community-verification submission that has no
language field. This is not a bug in this checkpoint's own work — it's
a pre-existing property of an engine this checkpoint was explicitly
told to preserve, not redesign. Documented here rather than silently
worked around.

## Real bug found and fixed during this checkpoint

A new repeated-session test (Listen → Ignore → Listen again, same
panel instance, no reopen) failed on first run: the mode-select buttons
remain visible and clickable for the panel's entire lifetime by
design, but the state machine's transition table only allowed
`CONFIRMED`/`IGNORED`/`FAILED` to move to `MODE_SELECT` or `IDLE` — not
directly to `PERMISSION_PENDING`. Clicking Listen again right after a
Review/Ignore/failure outcome silently did nothing (the internal
`transition()` call correctly refused, but nothing visibly explained
why, and no new session started). Fixed in `#startMode()`: normalizes
to `MODE_SELECT` first when already at a terminal stage, before
attempting the real `PERMISSION_PENDING` transition — never skips
`REVIEWING` for an in-progress, unresolved observation.

## What was built

**`core/shell/learning-panel-ui.js`** (edited):
- `open({userId, container, languageCode, context})` — two new,
  optional, caller-supplied fields. With neither supplied (the
  unchanged default), Listen behaves exactly as before. This is the
  correct place for Kiswahili (or any language) to be requested — as
  real caller input, never hardcoded in this file. CP14's own
  reconciliation had already found and rejected a different
  implementation that hardcoded `languageCode: 'sw'` directly here;
  this checkpoint deliberately keeps that rejection intact while still
  making Kiswahili (or any language) genuinely usable via real input.
- `#runScan()`/`#runListenAndFinish()`/`#finishObservation()` now pass
  the stored `languageCode`/`context` through to
  `captureVoiceForLearning()`/`learnFromMultimodalObservation()`
  instead of hardcoded `{}`/`null`.
- `#startMode()` bug fix described above.

## Files changed (exact scope, diffed by hash against CP14)

```
EDITED:
  core/shell/learning-panel-ui.js
  core/shell/tests/learning-panel-ui.test.js
  core/modules/learning/test/universal-learning-pipeline-multimodal.test.js
```

No new files, no removed files. Confirmed by diffing every file in the
tree against CP14's own manifest — the above is the complete, exact
set of differences.

```
$ md5sum core/shell/learning-panel-ui.js                                       a0bd673fe9f894da6fd73b77aff58415
$ md5sum core/shell/tests/learning-panel-ui.test.js                            e01a54cb115faf572bcb2dd8207e2abc
$ md5sum core/modules/learning/test/universal-learning-pipeline-multimodal.test.js  c2b906457dce770d51a6bb74c06b58af
```

## No duplicate engines (confirmed, not just claimed)

Searched every changed file for `window.CozyOS.{UniversalLearningPipeline,
CozyMemory,LivingLanguageVerification} =` — the only match is the
pre-existing, unchanged singleton export at the bottom of
`universal-learning-pipeline.js` (that file was not even edited this
checkpoint). No second Learning/Memory/Verification engine exists
anywhere in this checkpoint.

## Confirmed byte-identical to CP14 (untouched)

Every file not listed above — including `universal-learning-pipeline.js`
itself, `learning-interaction-core.js`, `living-hearing-session.js`,
`speech-recognition-adapter.js`, `dashboard-navigation-core.js` (the
locked 5-surface architecture), and every previously-verified
auth/security file.

## Test results (all run this session)

| Suite | Result |
|---|---|
| `core/shell/tests/learning-panel-ui.test.js` (extended: 17→23 tests, incl. 6 new CP15 tests + 1 real bug fix) | **23/23** |
| `core/modules/learning/test/universal-learning-pipeline-multimodal.test.js` (extended: 20→21 tests) | **21/21** |
| `core/modules/learning/test/multimodal-observation-core.test.js` (regression) | **16/16** |
| `core/modules/learning/test/learning-camera-adapter.test.js` (regression) | **21/21** |
| `core/modules/learning/test/learning-interaction-core.test.js` (regression) | **20/20** |
| `core/modules/hearing/test/living-hearing-session.test.js` (regression) | **29/29** |
| `core/modules/speech/adapters/test/speech-recognition-adapter.test.js` (regression) | **25/25** |
| `core/modules/speech/adapters/test/kiswahili-language-path.test.js` (regression) | **5/5** |
| `core/shell/tests/dashboard-navigation-core.test.js` (regression — locked 5-surface architecture confirmed untouched) | **43/43** |
| `core/shell/tests/admin-gate-core.test.js` (regression) | **33/33** |
| `server/test/chalzydashboard-gate-integration.test.js` (regression) | **6/6** |
| `test/deployment/verify-production-routing-offline.test.js` (regression) | **21/21** |
| `core/shell/tests/post-login-routing-core.test.js` (regression) | **12/12** |
| `core/security/test/identity-engine.test.js` (regression) | **14/14** |
| `core/modules/identity/test/onboarding-voice-core.test.js` (regression) | **11/11** |
| `core/modules/identity/test/auth-coordinator.test.js` (regression) | **26/26** |
| `core/security/test/login-decision-engine.test.js` (regression) | **19/19** |

**Total: 345/345** across every suite run this session.

## CP15-specific test coverage (Section 15's own checklist)

- Interim vs. final: structurally impossible for interim to reach
  learning (confirmed by design, `onPartialResult` never wired).
- Final result creates a real, reviewable observation with the
  language preserved end-to-end (test 20 — a real Kiswahili transcript
  from Listen through to the exact `confirmMultimodalObservation()` call).
- Duplicate final result: proven safe — a second `onFinalResult` never
  overwrites the first (test 16 in the pipeline suite).
- Duplicate Learn click: structurally impossible — button removed
  after the first commit (test 21).
- Review/Ignore never commit (pre-existing, re-confirmed).
- Unavailable/uncertain confidence never fabricated into a fake
  percentage (test 22).
- Session lifecycle: Listen → Ignore → Listen again in the same panel
  instance now works cleanly (test 23 — the real bug found and fixed
  this checkpoint).
- Error boundaries: pre-existing `classifyError()`-based reporting
  (camera/hearing/learning distinguished) re-confirmed unaffected.

## Verification levels — stated plainly

Every hardware/API interaction in every test above is a Node-side
mock. **Unit Verified** throughout. **Integration Verified**: the real
`UniversalLearningPipeline`/`MultimodalObservationCore`/
`LivingLanguageVerification`/`CozyMemory` call chain is exercised
together (not mocked at every boundary) in tests 4, 7, 20. **Browser
Runtime Verified: NOT PERFORMED** — no real browser, microphone, or
device was used anywhere in this checkpoint. **Production Certified:
NOT CLAIMED.**

## What remains explicitly NOT implemented (per instruction, deferred to CP16+)

- Kiswahili → English translation (explicitly out of scope this
  checkpoint).
- No change to TTS/voice output.
- Church-context UI (a `context` object can now be passed through
  end-to-end, but no UI exists yet to let a user select "sermon" vs
  "worship" vs "normal conversation" — the plumbing is real, the
  selector is not built).
- `LivingLanguageVerification`'s missing language field remains
  unaddressed (documented above as a pre-existing, out-of-scope
  limitation, not silently patched).
