# Phase 10C-3A Checkpoint — Dependency Report

## Implemented (this checkpoint)
- Nothing at the production-code level. This checkpoint is a reconstruction, hash
  verification, and documentation-relocation exercise only, per the new permanent
  repository-artifact rule.

## Verified (actually executed this session)
- SHA-256 of both input archives (independently computed, not trusted from either's
  own report)
- `unzip -t` on both input archives
- Byte-identity of all 4 overlaid files against the delta's own manifest
- Byte-identity of all 10 protected files against the delta's own protected-file report
- Direct execution of all 4 required baseline suites (16/16, 22/22, 11/11, 8/8)
- Direct execution of all 170 other `*.test.js` files present in the repository
- Cross-check of the 2 largest-magnitude regression findings against the untouched
  10C2B baseline, confirming they pre-exist and are unrelated to this checkpoint

## Static-only (verified by source inspection, not execution)
- N/A this checkpoint — no new source was written to audit

## Not verified
- Real browser Prompt API behavior (no real browser environment available in this
  sandbox; this is unchanged from the 10C-3A delta's own disclosed limitation)
- The 10 environment-limited `*-browser.test.js` files could not complete a real
  page render here

## Missing dependencies
- **Software dependency:** a real browser environment with the Prompt API, needed for
  any future real-runtime provider verification (Phase 10C-3B territory, not this
  checkpoint's).
- **Software dependency:** `core/engines/recording/recording-engine.js` and
  `core/engines/media/background-engine.js` do not exist in the repository — both are
  imported by other files that therefore cannot load.
- **Knowledge dependency:** none surfaced by this checkpoint (Kiswahili vocabulary
  status untouched — not exercised this session).

## Limitations
- 25 pre-existing regression-sweep findings remain open (see
  `PHASE10C3A-CHECKPOINT-TEST-RESULTS.md`); none were fixed here, per this project's
  no-silent-fix / no-scope-creep discipline.
- This checkpoint's own regression sweep took ~5 minutes wall-clock using 8-way
  parallel execution in a single-core sandbox; a couple of individual suites
  (e.g. `identity-engine.test.js`) run in the 30-50 second range on their own due to
  real timer-based lockout/backoff logic under test — noted here so a future session
  doesn't mistake a long-running honest test for a hang.
