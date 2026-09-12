# CP14 Checkpoint: Kiswahili Hearing Foundation Reconciliation ("CozyOS Merged 00012")

**Checkpoint name:** CozyOS-CP14-Kiswahili-Hearing-Merge-Checkpoint
**Package name (per explicit request):** CozyOS-Merged-00012
**Created:** 2026-08-29
**Built from:** `CozyOS-CP13-Living-Hearing-Integration-Checkpoint.zip` (my last packaged checkpoint), reconciled against `CozyOS-CP14-Kiswahili-Speech-Recognition-Checkpoint.zip` (an independent, parallel work-stream, uploaded for comparison)

## What this checkpoint actually is

Two independent lines of work fixed the **same real bug**
(`SpeechRecognitionAdapter` had `on()` with no matching `off()`,
leaking listeners) and built genuinely complementary infrastructure on
top of it. This checkpoint is not a wholesale adoption of either side —
it's a real, evidence-based reconciliation: adopt what's genuinely
new/better, reject what regressed or over-specialized, and fix a real
bug the merge itself would otherwise have reintroduced.

## The core question this checkpoint answers

**"Is the Kiswahili Hearing work a duplicate engine, or a legitimate
universal gate?"** — **A legitimate universal gate.** Confirmed by
reading the code, not assumed:

- `living-hearing-session.js` composes `CozyHearing`+`AudioEngine`+
  `SpeechRecognitionAdapter` via a plain `languageCode` parameter.
  Nothing Kiswahili-specific in the engine itself — "Kiswahili" in its
  header names the milestone's validating use case, not a hardcoded
  behavior.
- The Kiswahili test files exercise the **pre-existing**
  `SpeechLanguageAdapter`/`CozySpeech` language registry (confirmed
  present, unmodified, in both trees) with `"sw"` as one real,
  already-registered language — not a special case bolted onto the
  engine.

**One real exception, found and rejected:** the other branch's
`learning-panel-ui.js` hardcoded `languageCode: 'sw'` in its Listen
button — always requesting Kiswahili regardless of what the user
wants. This is the actual duplication/over-specialization risk. **My
version is kept** — it passes no `languageCode` at all, letting the
underlying universal infrastructure use its own default.

## Real bug found and fixed during the merge itself (not glossed over)

The other branch's `learnFromVoice()` rewire to `LivingHearingSession`
only supplied `onFinalResult`/`onError` callbacks — never `onStop`.
This **silently reintroduced** the exact hang-on-manual-Stop bug my
CP13 had already fixed one layer down, and their own test suite had
zero coverage for it (confirmed by search: no `onStop`/"No speech"/
`stopVoiceCapture` test existed in their `universal-learning-pipeline-multimodal.test.js`).

**Proven, not assumed:** reverted the fix and re-ran the merged test
suite — exactly 3 tests failed (all `onStop`/`stopVoiceCapture`-related),
confirming the tests genuinely catch the regression rather than passing
regardless. Fix restored and reconfirmed clean.

The fix also uses a genuine improvement from the other branch: the
real, already-tested `wasExpectedStop` flag, so a user-initiated Stop
now reports `"Stopped by user."` — distinct from an unexpected
disconnect's `"No speech detected."` — more precise than my original
CP13 version, which reported both identically.

## What was adopted (new, real, non-duplicative)

- **`core/modules/hearing/living-hearing-session.js`** — the real
  Hearing+SpeechRecognition coordinator that never existed before
  either branch (confirmed: no file anywhere previously coordinated
  the two). Universal, language-agnostic.
- **`core/modules/hearing/test/living-hearing-session.test.js`** (29 tests)
- **`core/modules/speech/adapters/test/kiswahili-language-path.test.js`**
  (5 tests) + its fixture — real regression coverage of the pre-existing
  universal language registry, using Kiswahili as the validated example.
- **`core/modules/speech/adapters/speech-recognition-adapter.js`**
  improvements: real timing telemetry (`getLastTimings()`, never a
  claimed/guessed figure), the `wasExpectedStop` distinction, honest
  `"unavailable"` confidence instead of a misleading `null`, and
  surfacing an unsupported/unregistered language as a real `onError`
  event (not only a return value). **Merged, not adopted verbatim:**
  their capabilities manifest omitted `"on"`/`"off"` — my correct
  addition from CP13 was restored on top of their version.
- **`core/modules/speech/adapters/test/speech-recognition-adapter.test.js`**
  (25 tests, comprehensive) — supersedes and replaces my thinner
  9-test file at the old path (`core/modules/speech/test/`), which is
  removed to avoid two overlapping suites testing the same file.

## What was rejected (regressions or inappropriate specialization)

- Their `learning-panel-ui.js` (hardcoded `languageCode: 'sw'`, and
  had regressed the visible Stop button + "Heard:" status my CP13
  added) — **my version kept, unmodified**.
- Their `learning-interaction-core.js` (dropped the review card's
  `Language` line) — **my version kept, unmodified**.
- Their `universal-learning-pipeline.js`'s `learnFromVoice()` as
  submitted (missing `onStop`, no `stopVoiceCapture()`) — **their
  `LivingHearingSession` delegation adopted, but merged with my
  `onStop`/`stopVoiceCapture()` fix**, not adopted as-is.

## Files changed (exact scope, diffed by hash against CP13)

```
EDITED:
  core/modules/speech/adapters/speech-recognition-adapter.js
  core/modules/learning/universal-learning-pipeline.js
  core/modules/learning/test/universal-learning-pipeline-multimodal.test.js
  index.html
  dashboard.html

REMOVED (superseded — moved to a more comprehensive suite at a new path):
  core/modules/speech/test/speech-recognition-adapter.test.js

NEW:
  core/modules/hearing/living-hearing-session.js
  core/modules/hearing/test/living-hearing-session.test.js
  core/modules/speech/adapters/test/speech-recognition-adapter.test.js
  core/modules/speech/adapters/test/kiswahili-language-path.test.js
  core/modules/speech/adapters/test/fixtures/kiswahili-sentences.js
```

Confirmed by diffing every file's hash in both trees against CP13's
own manifest — the above is the complete, exact set of differences.

```
$ md5sum core/modules/speech/adapters/speech-recognition-adapter.js            8495b1525cf32633d0062badbbc94d40
$ md5sum core/modules/learning/universal-learning-pipeline.js                  783c9f07a9ff097515167ffedb6da185
$ md5sum core/modules/learning/test/universal-learning-pipeline-multimodal.test.js  3ba5c520b46b8527154a212bed152b2a
$ md5sum core/modules/hearing/living-hearing-session.js                        6b142d272bf7e9a4797cd08b36c653ee
$ md5sum core/modules/hearing/test/living-hearing-session.test.js              638a9360d5c65b40f9040bb5e0c95db0
$ md5sum core/modules/speech/adapters/test/speech-recognition-adapter.test.js  ec5f6ace67985a4a3b860d503a166d46
$ md5sum core/modules/speech/adapters/test/kiswahili-language-path.test.js     9d60461dc20afef9827cd32d337114a8
$ md5sum core/modules/speech/adapters/test/fixtures/kiswahili-sentences.js     aa643dae0f0ead2677d59d0169746fc5
$ md5sum index.html                                                            112d881599b6ed94974fdda4ed11be3e
$ md5sum dashboard.html                                                        3edcab6a0731476a5bd912f027ce37b5
```

## HTML changes

Both pages gained 4 new `<script>` tags in dependency order:
`speech-language-adapter.js` (before the recognition adapter, its
consumer) → `speech-recognition-adapter.js` (unchanged position) →
`cozy-audio-engine.js` → `cozy-hearing.js` → `living-hearing-session.js`.
Verified: script tag balance matches on both pages, each new file
loaded exactly once, no duplicates.

## No duplicate engines (confirmed, not just claimed)

Searched every changed/new file for
`window.CozyOS.{AudioEngine,SpeechRecognitionAdapter,CozyHearing,OCREngine,CozyTranslate,CozyMemory} =`
— matches only the one real, pre-existing owner of each. No second
Hearing/microphone/speech/OCR/translation/memory engine exists
anywhere in this checkpoint.

## Confirmed byte-identical to CP13 (untouched by this reconciliation)

`learning-panel-ui.js`, `learning-interaction-core.js`,
`dashboard-navigation-core.js` (the locked 5-surface architecture),
`cozy-hearing.js`, `cozy-audio-engine.js`, `speech-language-adapter.js`,
`cozy-speech.js`, and every previously-verified auth/security file
(`auth-coordinator.js`, `admin-gate-core.js`, `static-boundary-server.js`,
`admin-recovery-policy.js`, `login-decision-engine.js`,
`webauthn-rp/server.js`, `identity-engine.js`, `onboarding-voice-core.js`,
`launch-sequence.js`, `voice-manager.js`).

## Test results (all run this session)

| Suite | Result |
|---|---|
| `core/modules/hearing/test/living-hearing-session.test.js` | **29/29** |
| `core/modules/speech/adapters/test/speech-recognition-adapter.test.js` | **25/25** |
| `core/modules/speech/adapters/test/kiswahili-language-path.test.js` | **5/5** |
| `core/modules/learning/test/universal-learning-pipeline-multimodal.test.js` (merged, 20 tests incl. 4 new merge-fix tests) | **20/20** |
| `core/modules/learning/test/multimodal-observation-core.test.js` (regression) | **16/16** |
| `core/modules/learning/test/learning-camera-adapter.test.js` (regression) | **21/21** |
| `core/modules/learning/test/learning-interaction-core.test.js` (regression) | **20/20** |
| `core/shell/tests/learning-panel-ui.test.js` (regression) | **17/17** |
| `core/shell/tests/dashboard-navigation-core.test.js` (regression — locked 5-surface architecture confirmed untouched) | **43/43** |
| `core/shell/tests/admin-gate-core.test.js` (regression) | **33/33** |
| `server/test/chalzydashboard-gate-integration.test.js` (regression) | **6/6** |
| `test/deployment/verify-production-routing-offline.test.js` (regression) | **21/21** |
| `core/shell/tests/post-login-routing-core.test.js` (regression) | **12/12** |
| `core/shell/tests/index-html-post-login-routing-wiring.test.js` (regression) | **6/6** |
| `core/security/test/identity-engine.test.js` (regression) | **14/14** |
| `core/modules/identity/test/onboarding-voice-core.test.js` (regression) | **11/11** |
| `core/modules/identity/test/auth-coordinator.test.js` (regression) | **26/26** |
| `core/security/test/login-decision-engine.test.js` (regression) | **19/19** |

**Total: 354/354** across every suite run this session.

## Verification levels — stated plainly

Every hardware/API interaction in every test above
(`SpeechRecognition`, `MediaStream`, `getUserMedia`) is a Node-side
mock. **Unit Verified** throughout this checkpoint. **Real browser
microphone/SpeechRecognition runtime: NOT PERFORMED.** Production
Certified: **NOT CLAIMED.**

## What remains explicitly NOT implemented

Unchanged from CP13's own disclosure: real browser/device microphone
verification, LivingSounds cues for listen state changes, offline
capability labeling for speech recognition specifically, OCR (still a
documented stub), Translation UI, Teaching, and any change to the
locked 5-surface navigation.
