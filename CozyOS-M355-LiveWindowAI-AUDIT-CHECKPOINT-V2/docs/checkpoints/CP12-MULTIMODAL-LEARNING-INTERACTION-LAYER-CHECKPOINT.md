# CP12 Checkpoint: Living Multimodal Learning — Interaction Layer

**Checkpoint name:** CozyOS-CP12-Multimodal-Learning-Interaction-Layer-Checkpoint
**Created:** 2026-08-29
**Built from:** `CozyOS-CP11-Multimodal-Learning-Online-Checkpoint.zip` (the last packaged checkpoint)

## What this closes

CP11 brought the Learning-layer engines online but explicitly noted
*"nothing on either page actually calls these engines yet."* This
checkpoint adds the smallest real user interaction surface that does —
a "Living Learn" entry point a user must intentionally activate.

## UI architecture decision (inspected before building)

`dashboard-navigation-core.js`'s own header documents its 5-surface
order (Home/Community/AI/Apps/Settings) as **mandatory** from a prior
milestone, with 43 existing tests locking that behavior. Adding a 6th
top-level nav tab would have meant editing settled, tested
architecture for a UI feature this task doesn't require to be a
top-level surface. Instead, "Living Learn" was added **inside the
existing AI surface** — reusing its already-established `cozy-btn`,
`cozy-disclosure-note`, and `aria-live="polite"` conventions verbatim,
with a single new button and mount point. `dashboard-navigation-core.js`
was not touched; its 43-test suite was re-run and confirmed unaffected.

## What was built

**`core/modules/learning/learning-interaction-core.js`** (new, pure
logic) — the session state machine (`IDLE → MODE_SELECT →
PERMISSION_PENDING → CAPTURING → REVIEWING → CONFIRMED/IGNORED/FAILED`,
fail-closed: cannot skip straight to `CONFIRMED` without passing
through `REVIEWING`), a real evidence-based `buildDiagnostics()` (checks
whether Camera/Hearing/OCR/Translation/Cognitive/Learning/Memory/Matching
are genuinely loaded and usable right now — never assumed), a
structured `classifyError()` (component/problem/impact/possibleSolution,
per the "identify the actual broken dependency" requirement), and a
`buildReviewCardText()` formatter that only ever includes fields the
observation actually has.

**`core/shell/learning-panel-ui.js`** (new, DOM-wiring) — renders the
panel, wires Scan/Listen/Scan+Listen/Close, composes
`LearningCameraAdapter` and `UniversalLearningPipeline`'s already-real
methods (`startCapture`, `captureForLearning`, `captureVoiceForLearning`,
`learnFromMultimodalObservation`, `confirmMultimodalObservation`) —
defines no new engine. Camera/microphone access is requested only
after an explicit Scan/Listen tap, never on load. `close()`
unconditionally calls `stopCapture()`, verified by test to actually
stop an active stream.

**`core/shell/user-dashboard.js`** (edited, minimal) — one button
("Living Learn") and one mount `<div>` added to the existing
`#renderAiSurface()` template, plus one click handler that calls
`LearningPanelUI.open()`. No other part of this 693-line file was
touched.

**`index.html` / `dashboard.html`** (edited) — two new `<script>` tags
each, in dependency order (`learning-interaction-core.js` before
`learning-panel-ui.js`, both after `learning-camera-adapter.js`).

## No duplicate engines (confirmed, not just claimed)

Searched every new file for `window.CozyOS.Camera =`,
`window.CozyOS.OCREngine =`, `window.CozyOS.SpeechRecognitionAdapter =`,
`window.CozyOS.CozyTranslate =`, `window.CozyOS.UniversalLearningPipeline =`,
`window.CozyOS.CozyMemory =` — the only matches are the pre-existing
real files (`universal-learning-pipeline.js` and its own test files),
confirmed unchanged. Neither `learning-interaction-core.js` nor
`learning-panel-ui.js` defines any of these globals.

## Files changed (exact scope, diffed by hash against CP11)

```
EDITED:
  index.html
  dashboard.html
  core/shell/user-dashboard.js

NEW:
  core/modules/learning/learning-interaction-core.js
  core/modules/learning/test/learning-interaction-core.test.js
  core/shell/learning-panel-ui.js
  core/shell/tests/learning-panel-ui.test.js
```

Confirmed by diffing every file in the tree against CP11's own
manifest — the diff above is the complete, exact set of differences.

```
$ md5sum index.html                                              2ea75df6c7d0bdb24145813959098665
$ md5sum dashboard.html                                          47d89df7f96ee39c4853aa7de7f3dcd4
$ md5sum core/shell/user-dashboard.js                            ce37c995fc689ab51fc3aa3a61627865
$ md5sum core/shell/learning-panel-ui.js                         08ab99f00bcee416b22aa0e7063ae715
$ md5sum core/modules/learning/learning-interaction-core.js      5d0cb9896057e57f1c9620c5e89f867a
$ md5sum core/modules/learning/test/learning-interaction-core.test.js  08d90b0881483ddc10d83ff7e1c6404c
$ md5sum core/shell/tests/learning-panel-ui.test.js              3f06dfe4d9a09417b4c5477221a71e01
```

## Real full-chain smoke test (before editing any HTML)

All ten dependency files — `platform-event-bus.js` through
`learning-panel-ui.js`, in the exact order the HTML now declares —
were loaded in a real Node `vm` context before this edit was made.
Zero exceptions; both new globals (`LearningInteractionCore`,
`LearningPanelUI`) present.

## Test results (all run this session)

| Suite | Result |
|---|---|
| `core/modules/learning/test/learning-interaction-core.test.js` | **19/19** |
| `core/shell/tests/learning-panel-ui.test.js` | **12/12** |
| `core/modules/learning/test/multimodal-observation-core.test.js` (regression) | **16/16** |
| `core/modules/learning/test/learning-camera-adapter.test.js` (regression) | **21/21** |
| `core/modules/learning/test/universal-learning-pipeline-multimodal.test.js` (regression) | **16/16** |
| `core/shell/tests/dashboard-navigation-core.test.js` (regression — confirms the 5-surface architecture is untouched) | **43/43** |
| `core/shell/tests/admin-gate-core.test.js` (regression) | **33/33** |
| `core/shell/tests/post-login-routing-core.test.js` (regression) | **12/12** |
| `core/shell/tests/index-html-post-login-routing-wiring.test.js` (regression — real vm-extracted inline script) | **6/6** |
| `core/security/test/identity-engine.test.js` (regression) | **14/14** |

**Total: 192/192** across every suite run this session.

## Verification levels — stated per Section 25's explicit requirement

| Capability | Status |
|---|---|
| Learning panel opens, mode buttons render | **UI-INTEGRATED, UNIT VERIFIED** |
| Scan → real `getUserMedia`-pattern capture → honest OCR boundary | **UNIT VERIFIED** (mocked hardware, proven via `learning-camera-adapter.test.js` + this checkpoint's panel tests) |
| Listen → real `SpeechRecognitionAdapter` composition | **UNIT VERIFIED** |
| Scan + Listen → real cross-modal matching via `MultimodalObservationCore` | **UNIT VERIFIED** |
| Learn/Review/Ignore → only Learn calls `confirmMultimodalObservation()` | **UNIT VERIFIED** |
| Camera/mic lifecycle (stop on close) | **UNIT VERIFIED** |
| **Real browser camera/microphone runtime** | **NOT PERFORMED** — no real browser or device was used anywhere in this checkpoint |
| Production Certified | **NOT CLAIMED** |

Every hardware call in every test this session (`getUserMedia`,
canvas, `SpeechRecognition`) is a Node-side mock. This is stated
plainly in both new test files' own headers and is not described as
browser-runtime verification anywhere in this checkpoint.

## What remains explicitly NOT implemented (honest, per Section 25)

- Translation language selection UI (`CozyTranslate` is not loaded on
  either page — nothing real to select between yet).
- "Explain" / "Teach me" / "Practise" — the Living AI explanation and
  voice-teaching loop described in the spec's Sections 11–13.
- Pronunciation-analysis scoring (only transcript capture exists).
- CozyBuilder certification registration for this interaction layer.
- Offline-availability labeling in the UI itself (the underlying
  engines' own offline behavior is unchanged, but the panel doesn't
  yet display "Available offline / Requires network / Unavailable"
  per-capability badges).
- Real OCR remains a documented stub, unchanged by this checkpoint.

None of the above is claimed as done anywhere in this checkpoint or its
code comments.
