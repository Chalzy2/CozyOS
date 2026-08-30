# M375 — BuilderLearning — Verification Report

Per Rule 23: every check below is real evidence produced this session,
not asserted from the compose report or from memory.

## Static

- `node --check core/modules/builder/learning-engine.js` → **PASS**

## Repository / Diff Integrity

- `dashboard.html`: diffed against the original upload. Exactly one
  change — the 7-line insertion (comment + `<script>` tag) after
  `analysis-engine.js`, before `builder-orchestrator.js`. **PASS**
- Pre-existing `<script>`/`</script>` count mismatch (295 vs 291 in the
  original file) confirmed to already exist before this milestone —
  not introduced by this change. Not this milestone's to fix.

## Node Runtime Smoke Tests

1. **Registration** — loaded in a minimal simulated `window` with
   nothing else connected: `window.CozyOS.BuilderLearning` registers,
   `getVersion()` returns `1.0.0-ENTERPRISE`. **PASS**
2. **Honest-unavailable branches** — with no Layer 1-3/CozyMemory/
   LearningEngine connected, `getLearningStatus()` returns
   `available: false` with a reason for every composed source, and
   does not throw. **PASS**
3. **Composed branches** — with mock `BuilderObservation`,
   `UnderstandingEngine`, `AnalysisEngine`, `CozyMemory`, and
   `LearningEngine` attached, `getLearningStatus()` correctly reports
   `available: true` and pulls real values (e.g. candidate pattern
   count) from each. **PASS**
4. **Idempotent reload** — requiring the file twice with the same
   version does not throw and does not create a second instance.
   **PASS**
5. **Version-conflict guard** — found a defect during this test, fixed
   it, then re-verified:
   - **Defect found:** the version-guard pattern mirrored from
     `observation-engine.js` (an early `if (window.CozyOS.X) return;`
     placed before the class definition) makes the later
     version-mismatch throw unreachable dead code. Confirmed the same
     defect exists in `observation-engine.js` itself — pre-existing,
     not introduced this milestone, not fixed there (out of scope; a
     correction to a settled file needs its own milestone per Rule 58).
   - **Fix applied (this new file only):** removed the redundant early
     guard, kept the single guard at the bottom.
   - **Re-verified:** loading a modified copy with version bumped to
     `2.0.0-ENTERPRISE` while `1.0.0-ENTERPRISE` is already registered
     now correctly throws
     `VERSION_CONFLICT: BuilderLearning existing v1.0.0-ENTERPRISE
     conflicts with load target v2.0.0-ENTERPRISE`. **PASS**
   - Re-ran tests 1-4 after the fix — unchanged results. **PASS**

## Browser Runtime

**NOT VERIFIED.** All checks above ran in Node with simulated globals,
per Gate 3 — Node evidence never substitutes for browser evidence.
Loading `dashboard.html` in an actual browser has not been done this
session.

## Duplicate-Engine Audit

- Repo-wide grep for `BuilderLearning` before this milestone: zero
  matches (confirms genuine gap, not a duplicate).
- `window.CozyOS.LearningEngine` (existing, `leaning/` dir) left
  completely untouched — read via its public API only, never modified,
  never merged into.
- Layers 1-3 (`BuilderObservation`, `UnderstandingEngine`,
  `AnalysisEngine`) left completely untouched.

## Regression

No existing file was modified except the single verified line in
`dashboard.html`. **PASS** (nothing to regress).

## Certification

| Level | Status |
|---|---|
| Static | PASS |
| Node Runtime | PASS |
| Repository Integrity | PASS |
| Regression | PASS |
| Browser Runtime | **NOT VERIFIED** |
