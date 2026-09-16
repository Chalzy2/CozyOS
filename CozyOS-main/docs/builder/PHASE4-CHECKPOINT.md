# PHASE 4 CHECKPOINT — Capability Self-Diagnosis Engine

## IMPLEMENTED
`core/modules/builder/capability-self-diagnosis.js` — a pure consumer/
orchestrator of Phase 2 (`unified-capability-contract.js`) and Phase 3
(`capability-dependency-graph.js`). No independent capability database.
No modification to any Phase 2/3/registry file.

Pipeline (each stage is its own named, inspectable function):
QUESTION → CAPABILITY_IDENTIFICATION → CAPABILITY_LOOKUP →
DIMENSION_ANALYSIS → STATUS_ANALYSIS → EVIDENCE_ANALYSIS →
DEPENDENCY_TRAVERSAL → BLOCKER_IDENTIFICATION →
MISSING_DEPENDENCY_IDENTIFICATION → NEXT_BUILD_RECOMMENDATION →
VERIFICATION_REQUIREMENT

## VERIFIED
- All 20 Phase 4 tests actually executed via `node`, real pass/fail output shown below.
- Phase 2 regression: 15/15 passed, unchanged.
- Phase 3 regression: 19/19 passed, unchanged.
- Language registry regression: 15/15 passed.
- Language-pack registry regression: 32/32 passed.
- `diff` confirms `unified-capability-contract.js` and
  `capability-dependency-graph.js` are byte-identical to the Phase 3 upload —
  not touched by this phase.
- End-to-end Kiswahili question ("Why am I not fully fluent in Kiswahili?")
  produces the exact structural answer required by spec §9, sourced
  entirely from the real `cozy-language-registry.js` /
  `cozy-language-pack-registry.js` data at call time — not hardcoded.

## NOT VERIFIED (honest limitations, not hidden)
- **Evidence Engine (`evidence-engine.js` / `window.CozyOS.BuilderEvidence`)
  was inspected but not wired in.** Its real API (`getVersion()`, audit
  logs, a builder-learning/self-observation surface) is a different
  domain — the builder's own operational telemetry — and does not expose
  a per-capability-dimension "test exists / test passed" lookup that
  Phase 4 could honestly consume. Wiring it in would have meant either
  fabricating a mapping that doesn't exist in the real API, or executing
  test files directly (a build/verification action explicitly out of
  Phase 4's boundary, §15). Evidence analysis instead uses the real
  `confidence` (`manifest` / `best-effort` / `unverified`) and `evidence`
  fields Phase 2/3 already carry — this is real, sourced data, just a
  narrower evidence surface than "Evidence Engine" might suggest.
- **Only one capability is registered** (`language:sw` / Kiswahili) in
  `CAPABILITY_REGISTRY`. No other capability in this repository currently
  has a Phase 3 graph-builder to point at, so no other capability could be
  diagnosed without inventing one — correctly refused per §12.
- Test 9 (FAILED dependency) and test 4 (fully VERIFIED capability) use
  synthetic graph/record data built with the *real* API
  (`addEdge`, `createCapabilityRecord`), because no capability in the real
  repository currently has a FAILED edge or an all-positive required-
  dimension record. This is disclosed, not concealed.

## DIAGNOSIS CAPABILITIES DELIVERED
`diagnose(question)`, plus every pipeline stage individually callable
(`identifyCapability`, `lookupCapability`, `analyzeDimensions`,
`analyzeStatus`, `analyzeEvidence`, `traverseDependencies`,
`identifyBlockers`, `identifyMissingDependencies`, `recommendNextBuild`,
`stateVerificationRequirement`), plus `renderHumanReadable()` for
human-facing output (structured `diagnosis` object remains authoritative).

## KISWAHILI PROOF RESULT
```
CAPABILITY: Kiswahili
OVERALL: PARTIALLY_VERIFIED
WORKING DIMENSIONS: response_generation
INCOMPLETE DIMENSIONS: vocabulary, grammar, morphology, stt, nlu, translation, tts, conversation, contextual_understanding
PRIMARY BLOCKER: language:sw:vocabulary (NOT_VERIFIED)
NEXT REQUIRED BUILD: language:sw:vocabulary
VERIFICATION REQUIRED: After "language:sw:vocabulary" is built, a future diagnosis
call must show its dependency edge status change from "NOT_VERIFIED" to AVAILABLE
or VERIFIED, backed by confidence "manifest" — the same test discipline already
used by the Phase 2/3 regression suites for this dependency's source registry.
```
Note: the engine correctly distinguished the required, evidence-backed
blocker (`vocabulary`, real data from `cozy-language-pack-registry.js`)
from the non-required placeholder dimensions that also carry MISSING
status (`grammar`, `stt`, etc.) — an earlier version of the recommendation
logic got this wrong on first run (picked `grammar`) and was caught and
fixed by the test suite before this checkpoint, not after.

## TEST RESULTS
Phase 4: **20/20 passed** (`core/modules/builder/tests/capability-self-diagnosis.test.js`)

## REGRESSION RESULTS
- Phase 3: 19/19 passed
- Phase 2: 15/15 passed
- Language registry: 15/15 passed
- Language-pack registry: 32/32 passed

## PROTECTED FILES
`unified-capability-contract.js` and `capability-dependency-graph.js`
confirmed byte-identical to the Phase 3 upload (`diff` — no output, no changes).

## CHECKPOINT HASH (sha256)
```
a9b9a0d72e0d4e58980c6f9aa2e616fb5ae452eba33f671e4d24aaf4fe59c3c0  capability-self-diagnosis.js
dbc0f1de792dc9d4f2dc04760a0ac52913a3e7af90628c969dee7e37a3ad7315  capability-self-diagnosis.test.js
```

## NEXT BUILD MUST START WITH
The diagnosis engine's own output: build/repair `language:sw:vocabulary`
(`core/modules/intelligence/language-packs/cozy-language-pack-registry.js`,
`resourceState` currently `NOT_READY` for `sw`). That is a Phase 5+
governed build action — not performed here.

---
**STOP AFTER PHASE 4. Phase 5 was not started.**
