# Phase 10C-3B2 — Implementation Report

**Scope:** Real Provider Execution Bridge. Determine whether CozyOS can
obtain real provider execution evidence without fabricating a
browser/model result. Narrow scope only — 10C-3B3 not started.

## Baseline

`COS-REPO-MERGED-PHASE10C3B1.zip`, containing 10C-3B1's result: **Outcome
B** (architecture correctly wired; real browser Prompt API execution
unavailable in the Node sandbox used for that pass).

## Part 1 — Real execution environment audit

Checked, in this pass's sandbox, independently of 10C-3B1's prior claims:

| Candidate real runtime | Result |
|---|---|
| Browser with Prompt API, live in Node | Not applicable — Node has no `window`/`self`/`LanguageModel` (confirmed) |
| Supported `LanguageModel`/`window.ai` in a real launched browser | **Checked directly** — a real Playwright-launched Chromium 141.0.7390.37 (both `headless_shell` and the full non-shell build) was inspected in-process; `self.LanguageModel` and `self.ai` are both `undefined` in both builds, with and without the correct Prompt-API feature flags |
| Existing CozyOS browser/runtime launcher | **Not found** — repo-wide search for a runtime/browser launcher returned no matches |
| Another repository-defined real provider runtime | **Not found** — same search covers this |

Full raw command output is in `PHASE10C3B2-RUNTIME-EVIDENCE.md`. This is a
stronger negative result than 10C-3B1's: that pass found no Chromium
binary reachable at all; this pass found and **successfully launched** a
real Chromium browser and still found no Prompt API surface, plus
confirmed outbound network to Google's model-component-update endpoint is
blocked (HTTP 403). No replacement model was installed or invented.

## Part 2 — One traced request

Because Part 1 found no real runtime, this could not be performed against
a genuine model. Per this phase's own instruction ("a fake … provider may
be used only as a structural test… must never be reported as real model
execution succeeded"), one request was traced end-to-end using the
repository's own existing, disclosed test-double convention (the same
`window.ai.languageModel` stub shape already used by
`on-device-conversational-provider.test.js` and
`phase10c3a-real-provider-integration.test.js` — not a new fabrication).

New test file: `core/modules/cognitive/tests/phase10c3b2-runtime-trace.test.js`.

Captured fields for the traced request (full JSON in the test's own
console output, reproduced in `PHASE10C3B2-RUNTIME-EVIDENCE.md`'s sibling
run and summarized here):

| Field | Value |
|---|---|
| provider ID | `on-device-conversational` |
| provider activation | Explicit opt-in only (`thinkingProviderId`), never default-active — matches 10C-3A/10C-3B1 finding, re-confirmed here |
| input | `"trace: what is CozyOS?"` |
| provider output | `"TESTDOUBLE:REAL-SHAPE-REPLY:trace: what is CozyOS?"` (deliberately prefixed so it is traceable back to the stub, not confusable with a real reply) |
| confidence | `null` (honestly never fabricated — the model only returns free text) |
| isReal | `true` — this is the **production code's own self-report** given a correctly-shaped fake model underneath it, not evidence of a real model. See file header disclaimer. |
| success | `true` |
| timing | 8 ms (stub latency, not representative of a real model call) |
| reaches CozyAI | Yes — `result.thinking.explanation` arrives as a resolved string, never `[object Promise]` |

Error-path scenario (no device API at all, closer to *this sandbox's
actual* condition) was also traced: `isReal: false`, `success: true` at
the `CozyAI.ask()` level (the call itself completes), with the real
degrade reason surfaced: `"Provider threw: No on-device language-model
API is exposed by this browser."` — the honest-failure contract holds.

## Part 3 — Builder path

Confirmed real: `BuilderOrchestrator` and `CozyAI` converge on the exact
same `CognitiveCoordinator` singleton instance (object identity checked,
not just class name) and a spy on `coordinator.run` shows both call sites
increment the same counter. No second intelligence engine exists.

**Disclosed limitation found this pass (not present in 10C-3A/10C-3B1
reports):** `BuilderOrchestrator.runPhase2Analysis(sessionId, text)`'s
current signature takes no options/provider parameter, so Builder cannot
currently select the on-device provider even explicitly — it always uses
whichever provider is the coordinator's default. This was verified by
reading the live function signature via regex against the actual file
content (not assumed), see the test's "disclosed finding" case. Not fixed
this pass — out of the narrow scope for 10C-3B2 (would be a production
code change beyond what was requested), flagged for a future phase.

## Part 4 — Kiswahili proof

One small Kiswahili input (`"Kiswahili: eleza kwa ufupi CozyOS ni nini?"`
— "briefly explain what CozyOS is") was run through the same traced
pipeline. No new vocabulary was created, stored, or promoted anywhere in
this pass. The governance diagnosis was then independently re-run using
the exact same stubbed `CapabilityRepairPlanner` fixture the 10B/10C-3A
suites already use (not a new fixture), and confirmed:

- `topBlocker.dependency` / `requiredBuilds[0].dependency` = `language:sw:vocabulary` (unchanged)
- `resourceState` = `NOT_READY` (unchanged)
- No `"promoted":true` appears anywhere in the serialized diagnosis.

Governance rules were not touched by this phase.

## Tests

New: `phase10c3b2-runtime-trace.test.js` — **5/5 PASS**.

Regression gates re-run fresh this pass:

| Gate | Result |
|---|---|
| `phase10b-shared-cognitive-integration.test.js` | 16/16 PASS |
| `phase10c2b-async-provider-boundary.test.js` | 22/22 PASS |
| `phase10c3a-real-provider-integration.test.js` | 11/11 PASS |
| `on-device-conversational-provider.test.js` | 8/8 PASS |

## Files changed

**Production code: none.** All nine files on the traced path
(`cozy-ai.js`, `on-device-cognitive-adapter.js`,
`on-device-conversational-provider.js`, `builder-orchestrator.js`,
`cognitive-coordinator.js`, `cozy-thinking.js`, `cozy-reasoning.js`,
`cozy-interpretation.js`, `cozy-intelligence.js`) hash-match their
Phase 10C-3B1 checkpoint values exactly — see
`PHASE10C3B2-PROTECTED-FILE-HASHES.txt`.

**New files added (documentation and test/evidence only):**
- `core/modules/cognitive/tests/phase10c3b2-runtime-trace.test.js` — new structural trace test (Part 2–4)
- `evidence/phase10c3b2-runtime-probe/probe-1-headless-shell-default-flags.js`
- `evidence/phase10c3b2-runtime-probe/probe-2-headless-shell-correct-flags.js`
- `evidence/phase10c3b2-runtime-probe/probe-3-full-chromium-binary.js`
- `PHASE10C3B2-IMPLEMENTATION-REPORT.md` (this file)
- `PHASE10C3B2-DEPENDENCY-REPORT.md`
- `PHASE10C3B2-RUNTIME-EVIDENCE.md`
- `PHASE10C3B2-PROTECTED-FILE-HASHES.txt`
- `PHASE10C3B2-SHA256-MANIFEST.txt`

No adapter, model, or provider was invented to force a green test.

## Limitations

- Real, non-test-double execution evidence could not be obtained in this
  sandbox. See `PHASE10C3B2-DEPENDENCY-REPORT.md` for the exact,
  itemized environmental dependency.
- Builder path cannot currently select the on-device provider explicitly
  (signature gap, disclosed above) — not exercised as "Builder using the
  real provider," only as "Builder reaches the same coordinator
  singleton."
- All "isReal"/"success" values reported under Part 2/4 reflect the
  production code's honest self-report against a labeled test-double,
  not a genuine model. This distinction is preserved throughout this
  report and the test file's own header comment.

## Outcome

**OUTCOME B — Real execution remains unavailable.**

The exact environmental dependency required for real execution is
recorded in `PHASE10C3B2-DEPENDENCY-REPORT.md`. No new adapter or
fabricated runtime was created to obtain a green result.

## Stop gate

Final full-repository packaging/cleanup was **not** performed — that is
reserved for 10C-3B3.

**NEXT BUILD MUST START WITH: PHASE 10C-3B3**
