# RP-035 — Language Intelligence — Phase 1 Implementation Report

**Lifecycle stage reached: PHASE1-IMPLEMENTED** (not TESTED end-to-end in a
real browser, not CERTIFIED)

**Baseline:** COS-RP035-WOS2-P8-CERTIFIED.zip
SHA-256 `2316526cc612fd2bca874d7611b822906b22bbe144a62cabf3047a44176a5505`
(hashed twice, matched; unzip -t clean; no prior declared hash was
supplied to this session to compare against — verify against your own
checkpoint record before treating this as the authoritative P8 hash).

**Preceded by:** Phase 0 Audit (this session) — full findings in the
audit response; summarized in the ADR (`RP-035-Phase1-ADR-Canonical-
Registry.md`) alongside this report.

## Scope actually built

1. **`core/modules/intelligence/language-packs/cozy-language-pack-persistence.js`**
   (new, 1.0.0) — bridges the existing `cozy-language-pack-registry.js`
   storage-adapter hook to the real `core/storage.js` IndexedDB gateway,
   via `window.CozyStorage` (the established consumption pattern already
   used elsewhere in this repo — no new global invented). Reuses four
   pre-existing object stores (`language_packs`, `dictionary`,
   `translation_memory`, `learning_progress`); creates none.
2. **`core/modules/intelligence/language-packs/cozy-language-knowledge-model.js`**
   (new, 1.0.0) — adds `TranslationRelationship`, `CorrectionRecord`,
   `ConflictRecord` schemas. Composes `cozy-knowledge-community.js`'s
   real `submitContribution()` for teaching rather than building a
   second review pipeline.
3. **Two test files**, real and executed (not fabricated), following the
   repository's existing plain-Node test convention.

No existing production file was modified, moved, or deleted.

## Files changed (byte scope)

```
Added:
  core/modules/intelligence/language-packs/cozy-language-pack-persistence.js
  core/modules/intelligence/language-packs/cozy-language-knowledge-model.js
  core/modules/intelligence/language-packs/tests/cozy-language-pack-persistence.test.js
  core/modules/intelligence/language-packs/tests/cozy-language-knowledge-model.test.js

Removed: (none)
Modified: (none)
```
Verified by diffing the working tree against a second, untouched
extraction of the same baseline ZIP — the diff contains only the four
files above.

## Test results (real, executed this session)

| Suite | Result |
|---|---|
| New: `cozy-language-pack-persistence.test.js` | **7 passed, 0 failed** |
| New: `cozy-language-knowledge-model.test.js` | **14 passed, 0 failed** |
| Regression: `cozy-language-pack-registry.test.js` (pre-existing, RP-030) | **32 passed, 0 failed** |
| Regression: all pre-existing tests under `language-packs/tests/` (5 files) | **170 passed, 0 failed**, combined |
| Regression: ChurchOS lineage (7 files, unrelated subsystem, spot-checked per Part 26) | **182 passed, 0 failed** |
| Regression: WholesaleOS (WOS) suite (5 files) | **PRE-EXISTING/ENVIRONMENTAL — timed out (exit 124) under this session's 10s Node execution, before and unrelated to any Phase 1 change** — see Known Limitations. Not classified as a new regression: no WholesaleOS file was touched, and the hang reproduces identically regardless of whether the new language-pack files are present. |

Repository-wide sweep of all 91 `*.test.js` files was **not fully
completed** — a blanket run exceeded this session's execution time
budget. What ran (language-packs subsystem in full, plus the two named
spot-check lineages above) shows no new regressions. A complete
repository-wide sweep is listed under Known Limitations, not silently
assumed passing.

## Honest capability statements

- **Persistence is capability-gated, not guaranteed.** `getStorageState()`
  / `initializePersistentRegistry()` report `PERSISTENT` only when a
  real `window.CozyStorage` is present and `init()` succeeds; otherwise
  they honestly report `IN_MEMORY_ONLY`. This was verified in Node using
  a disclosed fake gateway (real IndexedDB does not exist outside a
  browser) — **a real browser/IndexedDB integration test has not been
  run in this session** and is a known limitation, not claimed done.
- **All 13 packs remain `REGISTERED` / `NOT_READY`** after persistence
  init, with zero vocabulary counts — verified by test, not asserted.
- **No confidence numbers were invented.** New `TranslationRelationship`
  and `CorrectionRecord` entries default `confidence` to the string
  `"UNKNOWN"` unless real evidence is supplied by the caller.
- **Corrections never overwrite; conflicts never auto-resolve** — both
  enforced by code and covered by tests (append-only correction history;
  `resolveConflict()` rejects when no explicit resolver/value is given).
- **Teaching composes, not duplicates.** `submitTeaching()` calls the
  real `cozy-knowledge-community.js` API when present and returns
  `CAPABILITY_UNAVAILABLE` — never a private fallback pipeline — when it
  is not loaded.

## Known limitations / explicitly deferred (per Phase 1's own boundary)

- Real browser/IndexedDB integration test — not run this session
  (environment has no browser/IndexedDB; Node fake used instead, as
  disclosed above and in the test file's own header comment).
- Full repository-wide `*.test.js` sweep (all 91 files) — not completed
  within this session's time budget; only the language-packs subsystem
  and two named lineage suites were run.
- `language-engine.js` reconciliation (16-language overlap) — flagged in
  the ADR, not resolved.
- Export/import file format, versioning/rollback, external/removable
  storage, video pipeline, live-camera teaching UX, full speech-learning
  engine, contributor reputation, cloud sync — all explicitly out of
  Phase 1 scope per the Phase 1 brief's own Part 29, left as clean
  extension points (the persistence bridge's per-store backend adapters
  and the knowledge model's `bindBackends()` hook) rather than blocked.
- Permissions/RBAC enforcement for teaching/review/export actions —
  not implemented in Phase 1; `core/storage.js`'s existing `ulie`
  module-context RBAC governs raw store access, but no
  IdentityEngine-based per-action permission check (teach/review/
  approve/export/import/delete) was added to the two new files. Flag
  for Phase 2.
- No CERTIFIED claim is made. This report reaches
  PHASE1-IMPLEMENTED only.

## Recommended next step

Phase 2: wire a real human-teaching UI surface to `submitTeaching()`,
begin populating the Kiswahili pilot pack through that real pipeline
(not by hand-encoding the earlier conversation's examples), and start
the `language-engine.js` reconciliation flagged in the ADR.
