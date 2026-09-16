# PHASE 10C-3B3 — DEPENDENCY REPORT
Builder Provider-Selection Boundary

## IMPLEMENTED

- `BuilderOrchestrator.runPhase2Analysis(sessionId, text, options = {})`
  — additive third parameter, forwards `options.thinkingProviderId` to
  `CognitiveCoordinator.run({ text, thinkingProviderId })`.
- `core/modules/cognitive/tests/phase10c3b3-builder-provider-selection.test.js`
  — new, permanent, 12-test suite.
- Update to `phase10c3b2-runtime-trace.test.js`'s one disclosed-finding
  test, reflecting that the finding is now resolved (not deleted;
  historical record retained and updated).

## VERIFIED

- `CognitiveCoordinator.run({ thinkingProviderId })` and
  `CozyThinking.think({ providerId })` already existed, pre-dating this
  phase (Phase 10C-3A), and required no changes.
- Exactly one `CognitiveCoordinator` singleton and exactly one
  `BuilderOrchestrator` instance exist across the whole repository
  (confirmed by direct test assertions in the new suite, tests 4 and
  5) — no second cognitive/reasoning engine was created.
- Backward compatibility: `runPhase2Analysis(sessionId, text)` with no
  third argument behaves identically to the pre-change code (test 1).
- Provider selection is per-call, not global/sticky (test 6) and does
  not affect `CozyAI.ask()`'s own behavior (test 7).
- Explicit selection genuinely reaches the real Thinking layer
  end-to-end with a test-double model present (test 8), and fails
  honestly (never a false-green result) when no real model API is
  present (test 10).
- The on-device provider remains strictly opt-in through Builder —
  never selected by default even with the adapter fully loaded (test
  9).
- No fabricated confidence is introduced by the new parameter (test
  11, static source check).
- Kiswahili governance (`language:sw:vocabulary` blocker, `NOT_READY`
  resource state) is unaffected by this change (test 12) — no new
  Kiswahili vocabulary was created or promoted anywhere in this phase.
- Regression: Phase 10B (16/16), Phase 10C-2B (22/22), Phase 10C-3A
  (11/11), on-device provider suite (8/8), Phase 10C-3B2 runtime trace
  (5/5, after the disclosed update), and the broader existing Builder
  test suite (`core/modules/builder/tests/*.js`, 7 files, all passing)
  — all actually executed this session, all passing.
- Exactly three files differ from the fresh baseline extraction
  (confirmed via `diff -rq`): `builder-orchestrator.js`,
  `phase10c3b2-runtime-trace.test.js`, and the new
  `phase10c3b3-builder-provider-selection.test.js`. No other file in
  the repository was touched.
- Eight protected/reference files (`cognitive-coordinator.js`,
  `cozy-thinking.js`, `cozy-ai.js`, `cozy-intelligence.js`, and the
  four other pre-existing test files not intentionally modified) hash
  byte-identical before and after this phase's work — see
  `PHASE10C3B3-PROTECTED-FILE-HASHES.txt`.

## NOT VERIFIED

- Real, live browser execution of the on-device provider through
  Builder's new `options.thinkingProviderId` path. This phase verifies
  plumbing only, using the repository's existing disclosed test-double
  convention (same as Phase 10C-3A/10C-3B2) — no headless browser was
  launched this phase (unlike the separate PHASE10C3B1-RUNTIME-AUDIT.md
  audit, which did attempt and disclose that path was blocked by a
  missing Chromium binary and disabled network access; that finding
  was not re-verified here and is assumed still current, not
  re-confirmed).
- Real Prompt API availability in any browser. Unchanged, unverified
  status carried forward from prior phases.

## MISSING DEPENDENCIES

- A real browser environment with the Prompt API enabled (and,
  ideally, a downloadable/installed on-device model) — the same
  disclosed, pre-existing dependency blocking full activation
  verification in every prior phase that touched the on-device
  provider. Nothing in this phase changes that status.

## LIMITATIONS

- `options` on `runPhase2Analysis` currently forwards exactly one
  field (`thinkingProviderId`). It is not a general options
  pass-through by design — extending it to other
  `CognitiveCoordinator.run()` parameters was out of this phase's
  scope and was not attempted.
- This phase's fix does not wire any UI control for selecting a
  Builder provider — no UI was touched or is claimed to have been
  touched.
