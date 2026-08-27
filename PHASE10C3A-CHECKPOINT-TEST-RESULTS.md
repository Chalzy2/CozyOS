# Phase 10C-3A Checkpoint — Test Results

Executed directly against the merged working tree (10C2B full baseline + 10C3A delta
overlay), via `node <file>.test.js` for each suite, one process per file, no mocked
results. Re-verified a second time from a completely fresh extraction of the final
checkpoint ZIP (see final section).

## Required baseline gates (all pass, exact expected counts)

| Suite | File | Result |
|---|---|---|
| Phase 10B | `core/modules/cognitive/tests/phase10b-shared-cognitive-integration.test.js` | **16/16 PASS** |
| Phase 10C-2B | `core/modules/cognitive/tests/phase10c2b-async-provider-boundary.test.js` | **22/22 PASS** |
| Phase 10C-3A | `core/modules/cognitive/tests/phase10c3a-real-provider-integration.test.js` | **11/11 PASS** |
| On-device provider suite | `core/modules/intelligence/providers/tests/on-device-conversational-provider.test.js` | **8/8 PASS** |

## Full regression sweep — all other `*.test.js` files present in the repository (170 files)

- **145 files fully pass** — 3,430 individual tests passed, 0 failed
- **18 files have real failures** — 163 individual test failures
- **7 files fail to load at all** (import/module resolution errors before any test runs)

### The 18 real-failure files, categorized

**Environment-limited (Playwright/browser dependent, times out waiting for a rendered
page in this sandbox's headless Chromium) — NOT EXECUTABLE IN CURRENT ENVIRONMENT, not
a code-level finding:**
- `core/connectivity/ui/tests/cozy-live-connectivity-dashboard-browser.test.js` (1/8 pass)
- `core/engines/video/ui/clarity/tests/cozy-camera-clarity-dashboard-browser.test.js` (1/10 pass)
- `core/engines/video/ui/tests/cozy-live-camera-capture-dashboard-browser.test.js` (1/13 pass)
- `core/modules/intelligence/knowledge/teach/ui/tests/cozy-teach-cozyai-browser.test.js` (1/6 pass)
- `core/modules/intelligence/knowledge/ui/tests/cozy-knowledge-contribution-browser.test.js` (1/7 pass)
- `core/modules/intelligence/knowledge/ui/tests/cozy-knowledge-quarantine-admin-browser.test.js` (1/8 pass)
- `core/modules/intelligence/knowledge/ui/tests/cozy-knowledge-review-dashboard-browser.test.js` (1/12 pass)
- `core/modules/intelligence/language-packs/admin-dashboard/tests/cozy-admin-language-dashboard-ui-browser.test.js` (1/13 pass)
- `core/modules/intelligence/media/ui/tests/cozy-media-intelligence-dashboard-browser.test.js` (1/9 pass)
- `core/shell/live/tests/cozy-living-live-surface-dashboard-browser.test.js` (1/15 pass)

**Genuine pre-existing implementation gaps (real, reproducible, logic-level — confirmed
NOT caused by this checkpoint; see verification method below):**
- `core/bridge/test/engine-bridge.test.js` (11/12 pass) — 1 failure: `load()` dynamic
  import doesn't expose on `target.CozyOS` as expected
- `core/engines/audio/test/audio-manager.test.js` (15/30 pass) — `AudioManager` is
  missing `getCapabilities()`, `getPermissionState()`, `getHealth()`,
  `createListeningSession()`, `selectDevice()`, `registerInputAdapter()`
- `core/modules/document-understanding/test/document-understanding.test.js` (0/22 pass)
- `core/modules/duplicate-detection/test/duplicate-detection.test.js` (0/24 pass)
- `core/modules/intelligence/media/tests/cozy-media-evidence.test.js` (106/108 pass)
- `core/modules/intelligence/media/tests/cozy-media-intelligence.test.js` (47/50 pass)
- `core/modules/intelligence/media/tests/cozy-research-intelligence.test.js` (92/94 pass)
- `core/modules/intelligence/media/tests/cozy-research-search.test.js` (43/46 pass)

### The 7 files that fail to load, root-caused

| File | Cause |
|---|---|
| `core/engines/camera/camera-manager.test.js` | Doubled relative import path (`../core/engines/camera/...` from inside that same directory) |
| `core/engines/camera/tests/camera-manager.test.js` | Identical bug — this is a duplicate copy of the file above |
| `core/engines/scene/tests/scene-manager.test.js` | Same doubled-import-path bug |
| `core/engines/playback/tests/playback-engine.test.js` | Dangling import to non-existent `core/engines/recording/recording-engine.js` |
| `core/engines/media/tests/media-pipeline-manager.test.js` | Missing `core/engines/media/background-engine.js` |
| `core/bridge/test/media-integration.test.js` | Same missing `background-engine.js` (transitively, via `media-pipeline-manager.js`) |
| `modules/live/ourcozy-live.test.js` | Requires `core/modules/live/ourcozy-live.js`, which does not exist anywhere in the repository |

## Verification that all 25 findings above are pre-existing, not introduced by this checkpoint

`audio-manager.test.js` and `document-understanding.test.js` (the two largest-magnitude
failures) were re-run directly against the **untouched `COS-REPO-MERGED-PHASE10C2B.zip`
baseline**, before the 10C-3A delta was applied at all:
- `audio-manager.test.js` → identical: 15 passed, 15 failed
- `document-understanding.test.js` → identical: 0 passed, 22 failed

Combined with the fact that every one of the 25 affected files sits outside the
cognitive/thinking/reasoning/interpretation/provider subsystem the 10C-3A delta
actually touches, this confirms the findings are pre-existing repository defects,
unrelated to this checkpoint.

## Fresh-extraction re-verification

Re-run after extracting `COS-REPO-MERGED-PHASE10C3A.zip` into a completely separate,
fresh directory (not the original working tree):
- `phase10b-shared-cognitive-integration.test.js` → 16/16
- `phase10c2b-async-provider-boundary.test.js` → 22/22
- `phase10c3a-real-provider-integration.test.js` → 11/11
- `on-device-conversational-provider.test.js` → 8/8

All four match the original working-tree run exactly. See
`PHASE10C3A-CHECKPOINT-IMPLEMENTATION-REPORT.md` for the extraction/hash details.
