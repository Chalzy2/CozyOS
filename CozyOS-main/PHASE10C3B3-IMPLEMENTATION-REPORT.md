# PHASE 10C-3B3 — IMPLEMENTATION REPORT
Builder Provider-Selection Boundary

## NAMING DISCLOSURE (read first)

The task that produced this report was requested under the name
"Phase 10C-3B-1." This repository's real, already-completed work
already uses that exact identity (no hyphen, "PHASE10C3B1") for a
**different, unrelated** phase — "Real Provider Runtime Audit &
Controlled Activation Decision" (see the pre-existing, untouched
`PHASE10C3B1-IMPLEMENTATION-REPORT.md`, `PHASE10C3B1-RUNTIME-AUDIT.md`,
`PHASE10C3B1-DEPENDENCY-REPORT.md`, `PHASE10C3B1-PROTECTED-FILE-HASHES.txt`,
`PHASE10C3B1-SHA256-MANIFEST.txt` at repository root — an audit-only
phase that modified zero production files). To avoid two unrelated
phases claiming the same identity in one repository's history, this
work is filed as **Phase 10C-3B3** instead — the actual next-available
slot in the repo's real sequence (10C-3B1 audit → 10C-3B2 runtime-trace
→ 10C-3B3 this work), which is also the name the original task prompt
itself used in its file-path instructions before a later renaming
instruction introduced the collision. All deliverables below
(checkpoint zip, test file, reports) use 10C-3B3 consistently.

**A real mistake made and corrected during this session:** an early
attempt to remove what was believed to be a wrongly-named report
actually deleted the repository's real, pre-existing
`PHASE10C3B1-IMPLEMENTATION-REPORT.md`. This was caught immediately by
the required recursive diff against the untouched fresh baseline
extraction, and the file was restored from that fresh extraction,
confirmed byte-identical to the original. Disclosed here rather than
omitted.

## BASELINE

Uploaded baseline file: `COS-REPO-MERGED-PHASE10C3B2.zip`
Actual SHA-256 (independently computed, this session):
`e03e71bd543a65f60bbb643869b37142b466c99523f075ea5b248a1ed350825a`

Note: the task prompt's own "BASELINE" section named
`COS-REPO-MERGED-PHASE10C3A.zip` with a different SHA-256. The file
actually uploaded and used this session is the later
`COS-REPO-MERGED-PHASE10C3B2.zip` checkpoint, consistent with the
prompt's own "previous work established" section (which already
describes 10C-3B2 as complete). This report proceeds from the file
actually provided.

## START GATE — COMPLETED

- SHA-256 of baseline ZIP computed independently (above).
- `unzip -t` — no errors detected.
- Extracted into a completely fresh directory (`fresh-baseline/repo`),
  kept untouched throughout and used as the diff/restore source of
  truth.
- Repository structure confirmed present:
  `core/modules/builder/`, `core/modules/cognitive/`,
  `core/modules/thinking/`, `core/modules/intelligence/`.
- Files read in full before any edit: `builder-orchestrator.js`,
  `cognitive-coordinator.js`, `cozy-thinking.js`, `cozy-ai.js`,
  `cozy-intelligence.js`, plus the Phase 10B / 10C-2B / 10C-3A /
  10C-3B2 tests and the on-device provider test suite.

## WHAT WAS CHANGED AND WHY

**Finding, confirmed by reading the actual code before editing:**
`CognitiveCoordinator.run({ text, thinkingProviderId })` and
`CozyThinking.think({ providerId })` already fully support explicit
provider selection — built in Phase 10C-3A and already used by
`CozyAI.ask()`. The only gap was one layer up:
`BuilderOrchestrator.runPhase2Analysis(sessionId, text)` had no
parameter through which a caller could supply `thinkingProviderId`, so
it always called `coordinator.run({ text })` with no selection — the
exact disclosed finding recorded by Phase 10C-3B2's own runtime-trace
test.

**The fix (smallest additive change, no new provider-selection
system):**

```js
async runPhase2Analysis(sessionId, text, options = {}) {
    // ...unchanged gating logic...
    const thinkingProviderId = (options && options.thinkingProviderId) ? options.thinkingProviderId : null;
    const cogResult = await coordinator.run({ text, thinkingProviderId });
    // ...unchanged aggregation logic...
}
```

`options` is not a general pass-through — only `thinkingProviderId` is
ever read from it. Omitting `options`, or omitting
`thinkingProviderId` on it, reproduces `thinkingProviderId: null`,
which is the exact same default `CognitiveCoordinator.run()` and
`CozyThinking.think()` already used before this change, so prior
behavior is bit-for-bit unchanged when the new parameter is unused.

## EXACT FILES CHANGED

1. **`core/modules/builder/builder-orchestrator.js`** — modified.
   `runPhase2Analysis(sessionId, text)` →
   `runPhase2Analysis(sessionId, text, options = {})`; version bumped
   `1.0.0` → `1.1.0`; new JSDoc documenting the additive parameter. No
   other method touched.
2. **`core/modules/cognitive/tests/phase10c3b3-builder-provider-selection.test.js`**
   — new file. Permanent test suite for this phase (12 tests).
3. **`core/modules/cognitive/tests/phase10c3b2-runtime-trace.test.js`**
   — modified. One test ("Part 3 disclosed finding") updated, not
   deleted, to record that the finding it documented is now resolved;
   its assertion now checks the new signature
   (`sessionId, text, options = {}`) instead of the old one. One trace
   field (`builderCanSelectOnDeviceProvider`) updated from `false` to
   `true` with a clarifying comment (this specific trace call still
   passes no options, so it still resolves to the default provider —
   the capability now exists and is exercised in the new 10C-3B3
   suite, not in this older trace call).

A recursive diff (`diff -rq`) against the fresh, untouched baseline
extraction confirms these are the only three files that differ,
repository-wide (after the restoration described above).

## TESTS RUN — ACTUAL RESULTS

| Suite | Expected | Actual |
|---|---|---|
| Phase 10B (`phase10b-shared-cognitive-integration.test.js`) | 16/16 | **16/16** |
| Phase 10C-2B (`phase10c2b-async-provider-boundary.test.js`) | 22/22 | **22/22** |
| Phase 10C-3A (`phase10c3a-real-provider-integration.test.js`) | 11/11 | **11/11** |
| On-device provider suite | 8/8 | **8/8** |
| Phase 10C-3B2 runtime trace (updated) | 5/5 | **5/5** |
| **New Phase 10C-3B3 suite** | — | **12/12** |
| Existing broader Builder test suite (`core/modules/builder/tests/*.js`, 7 files) | — | **all pass, 0 failed** |

All numbers are actual `node` / `node --test` output from this
session. The Phase 10C-3B2 suite initially reported 4 passed / 1
failed immediately after the `builder-orchestrator.js` edit — the one
static-signature assertion the change was designed to invalidate. It
was updated (see above) to reflect the resolved finding, not silently
left failing or deleted; after the update it reports 5/5 again.

## REAL-MODEL STATUS

No real model was executed. Exactly as Phase 10C-3A/10C-3B2 already
disclosed, this sandbox has no real browser Prompt API
(`window.ai.languageModel` / `self.LanguageModel`). Every test in the
new suite that exercises `on-device-conversational` uses the same
disclosed test-double convention already established by those files: a
fake object exposing the real Prompt API shape
(`availability()`/`create()`/`session.prompt()`). Anywhere a test
result says `isReal: true`, that is the production code's own honest
self-report given a fake-but-correctly-shaped model underneath it —
never genuine model execution.

## BROWSER PROMPT API STATUS

Unavailable in this environment — unchanged from Phase 10C-3A/10C-3B2.
This phase verifies provider-selection plumbing only, per the phase's
own scope instruction; it did not re-attempt browser verification.

## BUILDER PROVIDER-SELECTION BEHAVIOR

- `builder.runPhase2Analysis(sessionId, text)` (no options): identical
  behavior to before this phase. Resolves to CozyThinking's default
  provider (`living-planner-baseline` when `ai-bootstrap.js` is
  loaded).
- `builder.runPhase2Analysis(sessionId, text, { thinkingProviderId:
  "on-device-conversational" })`: genuinely forwards the selection
  through the same `CognitiveCoordinator.run()` /
  `CozyThinking.think()` path `CozyAI.ask()` already uses. Verified
  end-to-end with the on-device adapter loaded (test-double model).
- The selection is per-call, not sticky/global: one explicit-provider
  call does not affect a later call with no options (test 6).
- `CozyAI.ask()`'s own behavior is completely unaffected by this
  change (test 7).
- No second `CognitiveCoordinator` or `BuilderOrchestrator` instance is
  ever created (tests 4 and 5).

## BACKWARD COMPATIBILITY

Confirmed by test 1: the exact prior call shape,
`builder.runPhase2Analysis(sessionId, text)`, continues to work
unchanged. `options` defaults to `{}`, and an absent/omitted
`thinkingProviderId` reproduces `thinkingProviderId: null` — the same
value `coordinator.run({ text })` implicitly passed before this
parameter existed.

## LIMITATIONS

- The real browser Prompt API remains unavailable in this environment;
  nothing in this phase changes that. All "on-device-conversational"
  results in this phase's tests are test-double, not genuine model
  output.
- `options` currently supports exactly one field
  (`thinkingProviderId`). No other `CognitiveCoordinator.run()`
  parameter (e.g. `memoryNamespace`, `category`, `conversationId`) is
  exposed through Builder's `options` yet — deliberately out of scope
  for this narrowly-scoped phase, not silently added.
- End-to-end verification that a real browser can select and execute
  the on-device provider through Builder (as opposed to plumbing
  verified with a test-double) is still open — the next phase's stated
  objective.

## MISSING DEPENDENCIES

None newly discovered this phase. The pre-existing, already-disclosed
dependency (a real browser environment with the Prompt API available)
remains the same one Phase 10C-3A/10C-3B2 already recorded.

## FINAL CHECKPOINT SHA-256

Checkpoint filename: `COS-REPO-MERGED-PHASE10C3B3.zip`
SHA-256 (computed independently, twice, after packaging, both runs
identical): `b2cdb89436e6bc67aebcc7cc0512cf1f4ad25284b0075051b8fd2056de5e2279`

Note: this hash was computed on the packaging pass immediately prior
to this addendum being written. Writing this addendum necessarily
changes the ZIP's bytes on the next (final) build — the two are
therefore expected to differ, and the ZIP actually delivered is the
final build described in the delivery response, with its own
independently-computed, twice-confirmed SHA-256 stated there. This is
the same unavoidable self-reference limitation noted in
`PHASE10C3B3-SHA256-MANIFEST.txt`, not an inconsistency.

(This value is filled in as a final addendum after the ZIP is built,
since a ZIP cannot contain the hash of itself — see the note in
`PHASE10C3B3-SHA256-MANIFEST.txt`. The addendum below documents the
accidental-deletion/restoration incident for the pre-existing
PHASE10C3B1 report, verified against this exact checkpoint.)

### PHASE10C3B1-IMPLEMENTATION-REPORT.md restoration verification

During this work, an in-session mistake deleted the repository's real,
pre-existing `PHASE10C3B1-IMPLEMENTATION-REPORT.md` (a different,
already-completed phase — see the naming disclosure above). It was
restored from the untouched fresh baseline extraction. Verified in
this exact checkpoint:

- Baseline (`COS-REPO-MERGED-PHASE10C3B2.zip`) hash of
  `PHASE10C3B1-IMPLEMENTATION-REPORT.md`: see
  `PHASE10C3B3-PROTECTED-FILE-HASHES.txt` restoration line below.
- Restored file in this checkpoint: byte-identical to the baseline
  (confirmed via `diff`, zero output, and matching SHA-256).

## NEXT PHASE

10C-3B4 — end-to-end Builder + CozyAI provider-selection verification
(the real next slot after this phase, given the renumbering explained
above; equivalent in substance to what the original task prompt called
"10C-3B2" in its own next-step footer, which is already a completed,
different phase in this repository). **Not started this session, per
explicit instruction to stop at this phase's boundary.**
