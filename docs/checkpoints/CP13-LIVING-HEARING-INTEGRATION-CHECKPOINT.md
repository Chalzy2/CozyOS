# CP13 Checkpoint: Living Hearing Integration

**Checkpoint name:** CozyOS-CP13-Living-Hearing-Integration-Checkpoint
**Created:** 2026-08-29
**Built from:** `CozyOS-CP12-Multimodal-Learning-Interaction-Layer-Checkpoint.zip` (the last packaged checkpoint)

## Real API trace performed before changing anything

Before editing, `SpeechRecognitionAdapter`'s actual, current contract
was read directly (not assumed): `start(config)`, `stop()`, `cancel()`,
`isActive()`, `isReal()`, `on(eventName, handler)`, and its real event
set (`onStart/onStop/onSpeechStart/onSpeechEnd/onResult/onPartialResult/
onFinalResult/onError`). This surfaced two real, pre-existing gaps that
made "Listen genuinely functional" — the actual task — impossible as
CP12 left it, neither of which required rebuilding the engine:

1. **No `off()` method existed.** Every `on()` call permanently pushed
   a handler with no way to remove it. `learnFromVoice()` (fixed in
   CP10) registered two listeners on every call and never cleaned
   either up — confirmed to leak on the same persistent adapter
   singleton across repeated sessions.
2. **No path from a manual Stop to a resolved Promise.** Calling the
   adapter's real `stop()` fires its real `onStop` event — but
   `learnFromVoice()` never listened for it. A user-initiated Stop
   during an in-flight `learnFromVoice()` call would leave that Promise
   pending forever, with no way for `learning-panel-ui.js` to offer a
   working Stop button at all.

Both are now fixed by extending the existing files — no new engine.

## What was built

**`core/modules/speech/adapters/speech-recognition-adapter.js`**
(edited) — added `off(eventName, handler)`: real, minimal, removes
exactly one handler, honest no-op on an unknown event or an
unregistered handler. No dedicated test previously existed for this
file at all (confirmed by search); it now has its own 9-test suite.

**`core/modules/learning/universal-learning-pipeline.js`** (edited) —
`learnFromVoice()` now also listens for `onStop`, resolves honestly
with `"No speech detected."` when recognition ends without a result,
and removes all three listeners (`off()`) the instant it settles,
however it settles — proven, not assumed: a test asserts zero
listeners remain registered after 1, 2, and 3 consecutive real
sessions. New `stopVoiceCapture()` — a thin wrapper calling the same,
real `SpeechRecognitionAdapter.stop()` — is the one real path a Stop
button can now use.

**`core/modules/learning/learning-interaction-core.js`** (edited) —
`buildReviewCardText()` now includes a `Language` line when
`audio.language` is genuinely present, omitted entirely otherwise —
never a fabricated or placeholder language.

**`core/shell/learning-panel-ui.js`** (edited) — Listen mode now shows
a real, visible "🎙 Listening — CozyOS is listening…" indicator with a
working **Stop** button wired to the new `stopVoiceCapture()`
(removed the instant listening ends, so the user is never left unsure
whether the microphone is active). On a real result, shows
`"Heard: <exact transcript>"` before moving to review — never a
different or fabricated transcript. A manual Stop and a genuine silence
both honestly resolve to the same `"No speech detected."` outcome,
distinct from a permission or hardware error.

## No duplicate engines (confirmed, not just claimed)

Searched every changed/new file for `window.CozyOS.AudioEngine =`,
`window.CozyOS.SpeechRecognitionAdapter =`, `window.CozyOS.CozyHearing =`
— the only real matches are the one pre-existing adapter file itself
and its own test file's local mock object (never assigned to
`window.CozyOS`). No second Hearing/microphone/speech engine exists
anywhere in this checkpoint.

## Files changed (exact scope, diffed by hash against CP12)

```
EDITED:
  core/modules/speech/adapters/speech-recognition-adapter.js
  core/modules/learning/universal-learning-pipeline.js
  core/modules/learning/test/universal-learning-pipeline-multimodal.test.js
  core/modules/learning/learning-interaction-core.js
  core/modules/learning/test/learning-interaction-core.test.js
  core/shell/learning-panel-ui.js
  core/shell/tests/learning-panel-ui.test.js

NEW:
  core/modules/speech/test/speech-recognition-adapter.test.js
```

Confirmed by diffing every file in the tree against CP12's own
manifest — the above is the complete, exact set of differences.
Everything else, including `index.html`/`dashboard.html` and the
5-surface navigation architecture, is byte-identical to CP12.

```
$ md5sum core/modules/speech/adapters/speech-recognition-adapter.js   f766934a17d1c806495df27abb3ba5ad
$ md5sum core/modules/speech/test/speech-recognition-adapter.test.js  2cc2261f05b03fb286251f42944c433a
$ md5sum core/modules/learning/universal-learning-pipeline.js         a36b439e0f0ea9855c994f0a2a676a7c
$ md5sum core/modules/learning/test/universal-learning-pipeline-multimodal.test.js  78964ceb81aebaa806d7ac4ce6c033e5
$ md5sum core/modules/learning/learning-interaction-core.js           b4048029fa6907eace10138502edfa5a
$ md5sum core/modules/learning/test/learning-interaction-core.test.js c77003ad38dcb3176e147f8c8cd40cb5
$ md5sum core/shell/learning-panel-ui.js                              eda5783bc041153128617912a21a3ac5
$ md5sum core/shell/tests/learning-panel-ui.test.js                   15e56f1bb90114a88b0ab2d1c1987d98
```

## Test results (all run this session)

| Suite | Result |
|---|---|
| `core/modules/speech/test/speech-recognition-adapter.test.js` (new) | **9/9** |
| `core/modules/learning/test/universal-learning-pipeline-multimodal.test.js` | **22/22** |
| `core/modules/learning/test/learning-interaction-core.test.js` | **20/20** |
| `core/shell/tests/learning-panel-ui.test.js` | **17/17** |
| `core/modules/learning/test/multimodal-observation-core.test.js` (regression) | **16/16** |
| `core/modules/learning/test/learning-camera-adapter.test.js` (regression) | **21/21** |
| `core/shell/tests/dashboard-navigation-core.test.js` (regression — confirms the locked 5-surface architecture is untouched) | **43/43** |
| `core/shell/tests/admin-gate-core.test.js` (regression) | **33/33** |
| `core/shell/tests/post-login-routing-core.test.js` (regression) | **12/12** |
| `core/shell/tests/index-html-post-login-routing-wiring.test.js` (regression) | **6/6** |
| `core/security/test/identity-engine.test.js` (regression) | **14/14** |
| `core/shell/tests/launch-sequence-above-only.test.js` (regression) | **29/30** (1 pre-existing, disclosed, unrelated CSS failure — confirmed present since before CP9) |

**Total: 242/243** across every suite run this session.

## Real, specific bugs found and fixed during this checkpoint (not glossed over)

1. Listener leak: `on()` had no matching `off()`; every `learnFromVoice()`
   call grew the adapter's listener arrays forever. Fixed and proven
   via a test asserting zero listeners remain after repeated sessions.
2. Hang-on-Stop: no path from the real `onStop` event to a resolved
   Promise. Fixed and proven via a test that calls the real
   `stopVoiceCapture()` mid-flight and confirms the pending
   `learnFromVoice()` call resolves honestly rather than hanging.
3. A test-design mistake (not a code bug): a repeated-session test
   initially failed because it never called `stop()` between
   iterations — the adapter's real, correct guard
   (`"Recognition already active. Call stop() first."`) caught this
   immediately. Fixed the test to match the real required lifecycle,
   confirming the guard itself works as intended.

## Verification levels — stated per Section 20's explicit requirement

| Capability | Status |
|---|---|
| `SpeechRecognitionAdapter.off()`, event cleanup | **UNIT VERIFIED** |
| `learnFromVoice()` onStop handling, listener cleanup | **UNIT VERIFIED** |
| `stopVoiceCapture()` → real adapter `.stop()` | **UNIT VERIFIED** |
| Listen UI: visible listening state, Stop button, Heard status | **UI-INTEGRATED, UNIT VERIFIED** |
| Repeated sessions (Listen → Stop → Listen again) | **UNIT VERIFIED** |
| Cross-modal matching composition (unchanged from CP9) | **INTEGRATION VERIFIED** (real engine methods called in the declared chain, per CP9's own tests) |
| **Real browser microphone + SpeechRecognition runtime** | **NOT PERFORMED** — no real browser or device was used anywhere in this checkpoint |
| Production Certified | **NOT CLAIMED** |

Every hardware/API interaction in every test this session
(`SpeechRecognition`, `MediaStream`) is a Node-side mock, explicitly
labeled as such in each test file's own header.

## What remains explicitly NOT implemented (per Section 23)

- Real browser/device microphone verification.
- LivingSounds cues for listen-activated/stop/success/error (Section
  16 permitted but did not require these; no real sound asset/event
  exists for them, so none was fabricated).
- Offline-capability labeling for speech recognition specifically
  (Section 15) — the underlying Web Speech API's own offline behavior
  is browser-dependent and was not independently probed this session.
- Scan+Listen's own UI was not redesigned (per instruction) — CP12's
  existing flow is unchanged; only its Listen leg now behaves per this
  checkpoint's fixes.
- OCR, Translation, Teaching, and the 5-surface navigation were not
  touched, per explicit instruction.
