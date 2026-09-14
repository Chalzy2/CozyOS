# PHASE 10C-3B4-1 — Living Engine + Browser Prompt API Architecture Audit
## Implementation Report

## Start Gate

- Baseline ZIP `COS-REPO-MERGED-PHASE10C3B3.zip` SHA-256 independently
  recomputed and confirmed to match the stated hash
  `6bd0e8c9a7123cb985a6df78cfdc3d12ecb56fead41e0d16251836e306d44228`.
- `unzip -t` reported no errors.
- Extracted into a fresh directory; a second, untouched extraction was
  kept as the pristine baseline for later diffing.
- All six required suites were **run for real** before any modification:

  | Suite | Result |
  |---|---|
  | Phase 10B | 16/16 |
  | Phase 10C-2B | 22/22 |
  | Phase 10C-3A | 11/11 |
  | Phase 10C-3B2 | 5/5 |
  | on-device provider | 8/8 |
  | Phase 10C-3B3 | 12/12 |

  All matched the expected counts exactly. Start gate **PASSED**.

## Files actually inspected

- `core/living/cozy-living-ai.js` (314 lines, read in full) — this is
  the real Living Engine ("Living AI" in-repo naming).
- `core/modules/cognitive/cognitive-coordinator.js` — confirmed
  singleton instantiation: `window.CozyOS.CognitiveCoordinator = new
  CozyCognitiveCoordinator();` occurs exactly once, at module load.
- `core/modules/builder/builder-orchestrator.js`,
  `core/modules/intelligence/cozy-ai.js` — read in the course of running
  the existing Phase 10B/10C-3B3 suites, which already exercise their
  convergence on the coordinator.
- `core/modules/intelligence/providers/on-device-conversational-provider.js`
  and `on-device-cognitive-adapter.js` — read via the existing Phase
  10C-3A suite's `loadCognitiveStack()` helper, reused verbatim.
- A repo-wide grep for `living-composition-adapter`, `LivingAI`,
  `Living Engine`, `reasoning-pipeline`, `setActiveProvider`, `window.ai`,
  `self.ai` and `LanguageModel` was run to make sure no competing
  implementation existed outside the files above. No file named
  `living-composition-adapter.js` exists in this repository; the
  functionally equivalent composition role is played by
  `core/living/cozy-living-ai.js`.

## Architecture findings (Part 2)

- **A/B — Same coordinator, same identity:** `cozy-living-ai.js`'s only
  implemented provider (`reasoning-pipeline`) reads
  `window.CozyOS.CognitiveCoordinator` directly (a property read, not a
  copy or a new construction) and calls `.run()` on it. A live test
  (`phase10c3b4-1-...test.js`, case A1) intercepted `coordinator.run`
  before loading Living Engine and confirmed the intercepted function
  was invoked exactly once when `LivingAI.think()` was called — proving
  the SAME object identity at runtime, not just by static inspection.
- **C — No second coordinator:** confirmed both by source inspection
  (case A2) and by the runtime test never seeing a second `run` call
  target.
- **D/E — No independent reasoning loop, no direct provider call:** the
  only implemented Living Engine provider composes
  `CognitiveCoordinator.run()`; the other four registered slots
  (`cloud-llm`, `on-device`, `enterprise-byo`, `research-multi`) are
  honest "not configured" stubs that return failure without touching
  any provider.
- **F — Composition, not a second engine:** `cozy-living-ai.js`'s own
  header comment states this explicitly, and the code matches: no
  reasoning, scoring, or interpretation logic is implemented in this
  file outside of the thin provider-registry/state-machine wrapper.
- **G — Convergence:** confirmed by the existing Phase 10B/10C-3B3
  suites (CozyAI, BuilderOrchestrator) plus this phase's new suite
  (LivingAI) — all three now have a direct, tested proof of hitting the
  same coordinator instance.
- **H — Bypass path:** none currently active. A bypass would only
  become possible if one of the four unconfigured stub slots were later
  given a real backend that does not itself route through
  `CognitiveCoordinator` — flagged here as a future risk, not a current
  violation.

## Provider selection findings (Part 3)

`LivingAI.think(text, options = {})` already does
`coordinator.run({ text, ...options })`. This means
`options.thinkingProviderId` **already flows through today** — no
production code change is required to let a caller select a specific
thinking provider (including the real on-device provider) through
Living Engine. This was proven live in test case B1: calling
`LivingAI.think(text, { thinkingProviderId: 'on-device-conversational' })`
with the on-device adapter loaded and a test-double model present
produced a result traceable to that specific provider.

Two related, narrower findings:

- `LivingAI`'s own registry slot literally named `"on-device"` is a
  **separate, unconfigured stub** — selecting it via
  `setActiveProvider('on-device')` does NOT reach the real
  on-device-conversational provider. Reaching the real provider today
  requires the `thinkingProviderId` option on the default
  `reasoning-pipeline` provider, as above. This is a naming/
  documentation gap, not a missing capability (see
  `PHASE10C3B4-1-DEPENDENCY-REPORT.md`).
- `setActiveProvider()`/`getActiveProvider()` only affect Living
  Engine's own local registry pointer. They do not call, touch, or
  reference `CozyThinking`'s default provider in any way — confirmed by
  loading Living Engine in complete isolation (no `CozyThinking` module
  loaded at all) and showing `setActiveProvider()` still works normally.
  The on-device provider therefore remains strictly opt-in, and
  `setActiveProvider()` remains untouched by this phase, exactly as the
  project rules require.

## Browser Prompt API findings (Part 4)

A real headless Chrome for Testing 131.0.6778.204 binary was launched
in this session (not a test-double, not Playwright's bundled browser)
with the relevant on-device-model feature flags enabled. `window.ai`,
`self.ai`, `window.LanguageModel`, and `self.LanguageModel` were all
genuinely `undefined`. Outbound network is blocked (HTTP 403) in this
sandbox independent of the browser result. Full transcript in
`PHASE10C3B4-1-RUNTIME-EVIDENCE.md`. This independently reproduces
Phase 10C-3B2's earlier finding on a different Chromium build (141),
strengthening the conclusion that the Prompt API is unavailable in this
sandbox environment generally, not just on one binary.

## Real vs. test-double execution

- **Real:** the Start Gate test runs, the new Living Engine singleton-
  identity test (A1/A2), the real headless-Chrome Prompt API probe, and
  the real network check.
- **Test-double (explicitly labeled, never presented as real model
  output):** all `LivingAI.think()` calls in Part B/C of the new suite
  that pass a fake `window.ai.languageModel` object shaped like the real
  Prompt API. These prove wiring only.
- **Structural/static:** the source-level assertions (e.g. A2's regex
  checks on `cozy-living-ai.js`).

## Production modifications

**None.** A `diff -rq` between a pristine second extraction of the
Phase 10C-3B3 baseline and this phase's working copy shows exactly one
difference in the entire repository: the addition of
`core/modules/cognitive/tests/phase10c3b4-1-living-engine-browser-provider-audit.test.js`.
No existing production file's bytes changed. See
`PHASE10C3B4-1-PROTECTED-FILE-HASHES.txt`.

## Tests

New permanent suite:
`core/modules/cognitive/tests/phase10c3b4-1-living-engine-browser-provider-audit.test.js`
— 7 passed, 0 failed.

## Regression

All six pre-existing critical suites re-run after adding the new test
file, with identical results to the Start Gate:

Phase 10B 16/16, Phase 10C-2B 22/22, Phase 10C-3A 11/11,
Phase 10C-3B2 5/5, on-device provider 8/8, Phase 10C-3B3 12/12.

## Protected files

See `PHASE10C3B4-1-PROTECTED-FILE-HASHES.txt` for the full list and
hashes (identical before/after this phase).

## Limitations / not verified

- Genuine Prompt API model execution could not be verified in this
  environment at all (no build exposes the API here; network to
  download a model is also blocked). This is a sandbox limitation, not
  a claim about Chrome's real-world Prompt API availability elsewhere.
- This audit did not attempt to exhaustively re-read every file listed
  under Part 1's "at minimum inspect" list that the existing Phase
  10B/10C-2B/10C-3A/10C-3B2/10C-3B3 suites already cover line-by-line
  (`cozy-thinking.js`, `cozy-reasoning.js`, `cozy-interpretation.js`);
  those suites' passing status was treated as standing, re-verified
  evidence rather than re-read from scratch, since re-reading files with
  no changed behavior would not change the audit's conclusion.

## Missing dependencies

See `PHASE10C3B4-1-DEPENDENCY-REPORT.md`.

## Outcome

**OUTCOME A** — Living Engine already correctly converges on the single
`CognitiveCoordinator`, and explicit provider selection
(`thinkingProviderId`) is already sufficient and already works through
the existing `options` passthrough, with no production code change
required. No production files were modified this phase.

## Next phase

Per project rules, this phase stops here.
Next phase must start with: **PHASE 10C-3B4-2 — LIVING ENGINE PROVIDER
INTEGRATION.** Given the Outcome A finding, that phase's scope (if
pursued) is narrower than originally implied — most plausibly limited
to documentation/naming clarification of the `"on-device"` registry
slot rather than new plumbing, since the plumbing already exists.
