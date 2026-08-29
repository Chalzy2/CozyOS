# CP11 Checkpoint: Living Multimodal Learning — Brought Online

**Checkpoint name:** CozyOS-CP11-Multimodal-Learning-Online-Checkpoint
**Created:** 2026-08-29
**Built from:** `CozyOS-CP10-Multimodal-Learning-Hearing-Checkpoint.zip` (the last packaged checkpoint)

## What this closes

CP10's own checkpoint doc flagged, plainly: *"None of the Learning-layer
files are yet loaded on any HTML page."* This checkpoint closes that
gap — the Camera, Hearing, and cross-modal matching coordination built
in CP9/CP10 are now actually reachable on `index.html` and
`dashboard.html`, not just tested in isolation.

## Real dependency audit before editing (not assumed)

Wiring the three Learning-layer files (`multimodal-observation-core.js`,
`universal-learning-pipeline.js`, `learning-camera-adapter.js`) alone
would not have been enough — three further real dependencies they need
at runtime were also confirmed **not loaded anywhere**:

- `core/living/living-runtime.js` (`window.CozyOS.Living`, needed for
  `serviceContracts`)
- `core/living/cozy-language-verification.js` (`LivingLanguageVerification`)
- `core/modules/camera/cozy-camera.js` (`window.CozyOS.Camera`, the
  registry `LearningCameraAdapter` registers into)

**Load-order finding:** `living-runtime.js` exposes `Living` via lazy
getters that check `window.CozyOS[x]` at call time, not at its own load
time — confirmed by reading `serviceContracts.declare()`'s
implementation directly. Same for `cozy-language-verification.js`'s
checks on `CozyMemory`. Neither has a hard load-order requirement.
**One real exception:** `learning-camera-adapter.js`'s
`Camera.Adapters.register()` call runs once, immediately, at its own
load time — so `cozy-camera.js` must load before it, or the
registration silently no-ops (harmless by design, but pointless).
Ordered accordingly.

**Proven, not assumed:** before editing any HTML, all six files were
loaded in the planned order inside a real Node `vm` context (a genuine
smoke test, not a guess). Result: zero exceptions, all six expected
globals present, and — for the first time — `LearningCameraAdapter`'s
registration call actually succeeded against a real `Camera.Adapters`
registry (previously always a silent no-op since `Camera` was never
loaded anywhere).

## What changed

**`index.html` and `dashboard.html`** — six new `<script>` tags added
to each, in the verified order: `living-runtime.js` (near
`platform-event-bus.js`), then `cozy-language-verification.js` →
`cozy-camera.js` → `multimodal-observation-core.js` →
`universal-learning-pipeline.js` → `learning-camera-adapter.js` (near
`cozy-memory-engine.js`). **No JavaScript logic file was touched** —
this checkpoint is HTML wiring only.

## Files changed (exact scope, diffed by hash against CP10)

```
EDITED:
  index.html
  dashboard.html
```

Confirmed by diffing every file in the tree against CP10's own
manifest: these are the *only* two differences. Every JavaScript, CSS,
and other non-HTML file is byte-identical to CP10 — verified by a
separate diff excluding `.html` files, zero differences.

```
$ md5sum index.html
e654567812eade70e6f7da55ba2a78ff
$ md5sum dashboard.html
f442b151d237ee07de54c70db3a30c9a
```

## Verification after editing

- Script tag balance confirmed on both pages (open/close counts match:
  index.html 68/68, dashboard.html 67/67).
- Each of the six newly-added files confirmed loaded exactly once per
  page — no duplicates.
- `core/shell/tests/index-html-post-login-routing-wiring.test.js` (the
  test that extracts and runs `index.html`'s real inline `<script>`
  block via `vm`) re-run and still passes 6/6 — confirms the new
  `<script src>` tags don't interfere with the existing inline routing
  logic.

## Test results (all run this session)

| Suite | Result |
|---|---|
| `core/modules/learning/test/multimodal-observation-core.test.js` | **16/16** |
| `core/modules/learning/test/learning-camera-adapter.test.js` | **21/21** |
| `core/modules/learning/test/universal-learning-pipeline-multimodal.test.js` | **16/16** |
| `core/shell/tests/admin-gate-core.test.js` | **33/33** |
| `server/test/chalzydashboard-gate-integration.test.js` | **6/6** |
| `test/deployment/verify-production-routing-offline.test.js` | **21/21** |
| `core/shell/tests/post-login-routing-core.test.js` | **12/12** |
| `core/shell/tests/index-html-post-login-routing-wiring.test.js` | **6/6** |
| `core/security/test/identity-engine.test.js` | **14/14** |
| `core/modules/identity/test/onboarding-voice-core.test.js` | **11/11** |
| `core/modules/identity/test/login-html-server-passkey-wiring.test.js` | **14/14** |
| `core/shell/tests/launch-sequence-above-only.test.js` | **29/30** (1 pre-existing, disclosed, unrelated CSS failure — confirmed present since before CP9) |

**Total: 199/200** across every suite run this session.

## What this does NOT yet mean

The Learning-layer engines being *loaded* is not the same as a
user-facing feature. Still explicitly not built:
- Any UI surface — no button, no camera preview element, no
  Learn/Review/Ignore prompt exists on either page.
- Nothing calls `LearningCameraAdapter`/`UniversalLearningPipeline`
  automatically; they are available on `window.CozyOS` but dormant
  until some future UI or script invokes them.
- Real OCR remains a documented stub, unchanged.
- Everything else listed as out of scope in CP9/CP10 remains out of
  scope here.
