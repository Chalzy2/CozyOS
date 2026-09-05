# CP9 Checkpoint: Living Multimodal Learning — Coordination Layer + Learning Camera Adapter

**Checkpoint name:** CozyOS-CP9-Multimodal-Learning-Camera-Checkpoint
**Created:** 2026-08-29
**Built from:** `CozyOS-CP8-Living-Login-Gate-And-Governance-Checkpoint.zip` (the last packaged checkpoint)

## Scope — two increments of the Living Multimodal Learning System

### 1. Cross-modal observation matching (composing, not duplicating)

**Audit finding that shaped this work:** `core/modules/learning/universal-learning-pipeline.js`
(M322) already existed and already composed real engines
(`SpeechRecognitionAdapter`, `CozyMemory`, `LivingLanguageVerification`)
for independent single-modality learning, with its own honest gap
disclosure (OCR is a documented stub, several sources have no real
engine at all). Building a second learning coordinator would have
violated the repository's own No Duplicate Engine convention. The one
genuinely missing piece was cross-modal matching — "does what the
camera saw agree with what the microphone heard" — which neither
`UniversalLearningPipeline` nor `LivingLanguageVerification` (a
different real algorithm: multi-contributor regional consensus, not
single-instant agreement) provided.

**`core/modules/learning/multimodal-observation-core.js`** (new, pure
logic, no DOM/network) — real deterministic text similarity
(Levenshtein + token-overlap, with Unicode diacritic folding so "días"
vs "dias" — a genuine, common OCR/ASR disagreement — scores as a
match), builds the `LearningObservation` structure, and a fail-closed
`decideLearningAction()` that only ever returns `REVIEW_REQUIRED` or
`IGNORE_LOW_CONFIDENCE` — never auto-confirms learning on its own.

**`core/modules/learning/universal-learning-pipeline.js`** (edited) —
added `learnFromMultimodalObservation()` (builds + decides, never
commits) and `confirmMultimodalObservation()` (the only path to durable
storage, and only once a real user "Learn" choice is represented by the
caller; composes the existing `CozyMemory` and `LivingLanguageVerification`
verbatim, no new storage/verification system).

### 2. Learning Camera Adapter (real hardware capture, honest OCR boundary)

**Audit finding:** `core/security/face-capture-module.js` already
proved a real, working pattern (`navigator.mediaDevices.getUserMedia()`
→ real stream → canvas frame capture → `window.CozyOS.Camera.Adapters`
registration) — but is explicitly, narrowly scoped to biometric
face-capture. `core/modules/camera/cozy-camera.js` (the general
coordinator) is loaded nowhere in the ordinary app.

**`core/modules/learning/learning-camera-adapter.js`** (new) — follows
the same proven real pattern independently, in the learning layer, with
zero code dependency on `FaceCaptureModule` (verified by test, not just
asserted). Real `isSupported()`/`startCapture()`/`captureFrame()`/
`stopCapture()`, registered through the existing `Camera.Adapters`
contract. `captureForLearning()` connects a real captured frame to
`UniversalLearningPipeline.learnFromOCR()` and reports one of three
honest outcomes (`capture-failed` / `capture-only` / `capture-and-ocr`)
— never claims OCR succeeded unless `learnFromOCR()` itself reports
`success:true`. The real captured frame is preserved and returned even
when OCR is unavailable, ready for a future legitimate OCR stage.

## Files changed (exact scope, diffed by hash against CP8)

```
EDITED:
  core/modules/learning/universal-learning-pipeline.js

NEW:
  core/modules/learning/multimodal-observation-core.js
  core/modules/learning/learning-camera-adapter.js
  core/modules/learning/test/multimodal-observation-core.test.js
  core/modules/learning/test/universal-learning-pipeline-multimodal.test.js
  core/modules/learning/test/learning-camera-adapter.test.js
```

```
$ md5sum core/modules/learning/multimodal-observation-core.js
312fbc2820356d5f947c46e859a1a758
$ md5sum core/modules/learning/universal-learning-pipeline.js
57aa9a8ccb6113b0ca63af1e121f7ced
$ md5sum core/modules/learning/learning-camera-adapter.js
ed1116acbef8baf247feab9a093f3f07
$ md5sum core/modules/learning/test/multimodal-observation-core.test.js
73c1ba11b9ffdd62f7a7bfb4ec268298
$ md5sum core/modules/learning/test/universal-learning-pipeline-multimodal.test.js
2c5e80f27a0fdfa94b2de3e209e748f3
$ md5sum core/modules/learning/test/learning-camera-adapter.test.js
62c9fafd4946f5d2780076355d635c3f
```

No other file was touched. Confirmed by diffing every file's hash
against CP8's own manifest — the diff above is the complete, exact set
of differences, nothing omitted.

## Confirmed unchanged (hash-verified against CP8)

Every file verified in CP7/CP8 — `auth-coordinator.js` (both copies),
`admin-gate-core.js`, `static-boundary-server.js`,
`admin-recovery-policy.js`, `login-decision-engine.js`,
`webauthn-rp/server.js`, `identity-engine.js`, `launch-sequence.js`,
`voice-manager.js`, `onboarding-voice-core.js` — all byte-identical to
CP8. `core/modules/camera/cozy-camera.js` and
`core/security/face-capture-module.js` also confirmed byte-identical
(the new camera adapter reads/follows their pattern but modifies
neither).

## Test results (all run this session)

| Suite | Result |
|---|---|
| `core/modules/learning/test/multimodal-observation-core.test.js` | **16/16** |
| `core/modules/learning/test/universal-learning-pipeline-multimodal.test.js` | **8/8** |
| `core/modules/learning/test/learning-camera-adapter.test.js` | **21/21** |
| `core/shell/tests/admin-gate-core.test.js` (regression) | **33/33** |
| `core/security/test/identity-engine.test.js` (regression) | **14/14** |

**Total: 92/92** across every suite run this session touching this
work or its dependencies.

**Two real mistakes found and fixed during testing, not glossed over:**
1. First combined-confidence formula in `multimodal-observation-core.js`
   diluted a clear visual/audio mismatch into a false "probably fine"
   score by simple-averaging it with unrelated high per-sensor
   confidences — fixed by weighting the cross-modal match at 80%.
2. A test-side bug (not adapter code): Node's built-in `navigator`
   global is a read-only getter, and a separate test's own
   false-positive regex flagged this file's own legitimate explanation
   of *why* it doesn't reuse `face-capture-module.js`. Both fixed in
   the test file; the adapter code was correct as written.

**Explicitly not claimed:** none of the camera adapter's tests touch a
real browser or real camera hardware — they are Node-side mocks of
`getUserMedia`/canvas, proving the adapter's own logic against
controlled inputs. This is stated in the test file's own header and is
not described as browser-runtime verification anywhere in this
checkpoint.

## What remains explicitly unimplemented (per the certification discipline established in this project)

- Real OCR (`OCREngine` remains a documented stub, not loaded on any
  ordinary page — unchanged by this checkpoint).
- Hearing/microphone wiring to the ordinary user-facing pages
  (deliberately deferred — the task's own instruction was "do not
  implement Hearing yet").
- Any UI surface for camera capture, the Learn/Review/Ignore
  confirmation prompt, or voice teaching playback.
- The 45-cognitive-mode framework, CozyBuilder certification dashboard
  for this system, admin controls, African-language expansion, privacy
  classifier, cross-device global learning sync — none of these were
  in scope for this increment and none are claimed as done.

## Order preserved

Per instruction: Camera → verify → regression → (Hearing next,
separately, not started in this checkpoint).
