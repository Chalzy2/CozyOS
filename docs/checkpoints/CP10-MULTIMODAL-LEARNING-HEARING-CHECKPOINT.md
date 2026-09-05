# CP10 Checkpoint: Living Multimodal Learning — Hearing Increment + Real Bug Fix

**Checkpoint name:** CozyOS-CP10-Multimodal-Learning-Hearing-Checkpoint
**Created:** 2026-08-29
**Built from:** `CozyOS-CP9-Multimodal-Learning-Camera-Checkpoint.zip` (the last packaged checkpoint)

## Audit finding that shaped this increment

Unlike Camera, Hearing needed no new hardware-driving adapter.
`core/modules/speech/adapters/speech-recognition-adapter.js`
(`SpeechRecognitionAdapter`) and `core/modules/speech/cozy-speech.js`
(`CozySpeech`) are **already loaded on both `index.html` and
`dashboard.html`** — confirmed by direct inspection, not assumed. The
Web Speech API manages its own microphone access internally; there is
no separate `getUserMedia` call for a new file to wrap. Building a
parallel "Learning Hearing Adapter" that re-drove the microphone would
have duplicated an engine that already works. The genuinely missing
piece was the same kind of thin coordination glue as Camera — joining
a real voice capture into the multimodal observation flow.

## Real bug found and fixed before building on it

While auditing `learnFromVoice()` (the method the Hearing increment
needed to compose), inspection found it registered event listeners
under `"result"`/`"error"`, but `SpeechRecognitionAdapter`'s real
listener map only recognizes `"onResult"`/`"onFinalResult"`/`"onError"`
(with the `on` prefix — confirmed by reading that file directly). Its
own `on()` method honestly rejects unrecognized event names rather
than throwing, and `learnFromVoice()` never checked that rejection —
so in a real browser, neither callback would ever actually fire, and
the returned Promise would hang forever regardless of what was said or
how recognition failed. This had never been caught because no test
previously exercised this method's real event wiring.

**Proven, not just claimed:** the fix was verified by temporarily
reverting to the original event names and re-running the new test
suite — exactly the two `learnFromVoice()` tests hung
("Promise resolution is still pending"), confirming the test genuinely
catches the bug rather than passing regardless. The fix was then
restored and reconfirmed clean.

## What was built

**`core/modules/learning/universal-learning-pipeline.js`** (edited):
- **Fixed** `learnFromVoice()`'s event-name bug (`"result"`/`"error"` →
  `"onFinalResult"`/`"onError"`), now genuinely resolves with a real
  transcript or a real honest failure.
- **`captureVoiceForLearning({ languageCode, context })`** (new) — a
  thin, real wrapper (not a new speech engine) that calls the now-fixed
  `learnFromVoice()` and reshapes its result into the exact `audio`
  field shape `multimodal-observation-core.js`'s `buildObservation()`
  expects.
- **`learnFromCameraAndVoice({ userId, visual, languageCode, context, translation })`**
  (new) — the real "join camera and hearing into one session"
  coordination point: takes an already-captured `visual` observation
  (e.g. from `LearningCameraAdapter.captureForLearning()`'s OCR
  extraction), captures a real fresh voice observation, and feeds both
  into the existing, unmodified `learnFromMultimodalObservation()` — no
  third matching/decision implementation.

## Files changed (exact scope, diffed by hash against CP9)

```
EDITED:
  core/modules/learning/universal-learning-pipeline.js
  core/modules/learning/test/universal-learning-pipeline-multimodal.test.js
```

No new files. No other file touched — confirmed by diffing every
file's hash against CP9's own manifest.

```
$ md5sum core/modules/learning/universal-learning-pipeline.js
5a176e0df369c3ab55ed4d5b4713cd43
$ md5sum core/modules/learning/test/universal-learning-pipeline-multimodal.test.js
074a08b50033301c4f3349a7c5fb9d8b
```

## Confirmed unchanged (hash-verified against CP9)

`multimodal-observation-core.js`, `learning-camera-adapter.js` and its
test file, `cozy-camera.js`, `face-capture-module.js`,
`speech-recognition-adapter.js`, and every previously-verified
auth/gate/login-gate/voice file — all byte-identical to CP9.

## Test results (all run this session)

| Suite | Result |
|---|---|
| `core/modules/learning/test/universal-learning-pipeline-multimodal.test.js` (extended: 8→16 tests) | **16/16** |
| `core/modules/learning/test/multimodal-observation-core.test.js` (regression) | **16/16** |
| `core/modules/learning/test/learning-camera-adapter.test.js` (regression) | **21/21** |
| `core/shell/tests/admin-gate-core.test.js` (regression) | **33/33** |
| `core/security/test/identity-engine.test.js` (regression) | **14/14** |
| `core/modules/identity/test/onboarding-voice-core.test.js` (regression) | **11/11** |

**Total: 111/111** across every suite run this session.

## What remains explicitly unimplemented / not wired

- **None of the Learning-layer files are yet loaded on any HTML page**
  — confirmed by inspection: `universal-learning-pipeline.js`,
  `multimodal-observation-core.js`, and `learning-camera-adapter.js`
  have no `<script>` tag anywhere. This applies equally to the Camera
  increment (CP9) as to this one; it was not previously stated this
  plainly and is corrected here. `SpeechRecognitionAdapter`/`CozySpeech`
  are the only pieces of this system actually loaded on the ordinary
  pages today.
- Real OCR (`OCREngine`) remains a documented stub, unchanged.
- No UI surface for camera/voice capture, the Learn/Review/Ignore
  confirmation prompt, or voice teaching playback.
- Everything else listed as out of scope in CP9's own checkpoint
  remains out of scope here (45 cognitive modes, CozyBuilder
  certification dashboard, admin controls, African-language expansion,
  privacy classifier, cross-device sync).
