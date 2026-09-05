# PHASE 8 — IMPLEMENTATION REPORT
## Governed Knowledge Self-Diagnosis and Capability Re-Evaluation

## 1. BASELINE

Phase 7 was independently re-verified at the start of this pass (not
assumed from the prior summary): `capability-knowledge-acquisition.js`
loaded cleanly, its 30 tests passed, and its four composed governance
files were re-diffed byte-identical against the Phase 7 checkpoint. All
of Phase 6/7's substantive findings (RP-030-CONTENT open, MD-028 real,
`requestPromotion()` always BLOCKED, no fabricated content anywhere)
still hold.

## 2. STEP 1 AUDIT — NEW FINDINGS THIS PASS

Re-reading `cozy-knowledge-review.js`'s `evaluateRule82Gate()` in full
(not just the shape used by Phase 7) surfaced one fact not previously
stated at this precision:

**`runtimeBehaviorObserved` is unconditionally hard-coded to
`NOT_TESTED_LIVE` (Rule 81 — no DOM/browser runtime in this
environment), and `allTrue` requires it.** This means Rule 82's gate is
**structurally unreachable at `ELIGIBLE`** in this environment today —
independent of, and in addition to, the RP-027/RP-030 axis mismatch
Phase 7 already disclosed. Every `capability-governance-diagnosis.js`
result that reaches a gate reading now states this plainly via
`rule82StructurallyUnreachable: true`, rather than leaving a caller to
infer it from a `LOCKED` result alone.

`evaluateRule82Gate()` also has no independent "review pending"
sub-state — a contribution is `SUBMITTED` or it is not. This phase's
`REVIEW_PENDING` governance status maps to the one real state that
matches that description: `capability-knowledge-acquisition.js`'s own
`CONTRIBUTION_RECEIVED`, reached when a `SUBMITTED` contribution could
not yet be run through the gate (no review engine loaded, or the
request's language could not be parsed).

## 3. STEP 5 — MD-028

Re-audited. `DIMENSION_SIGNAL_MAP["cozy-language-pack-registry"]`
already maps both real reachable `resourceState` values —
`NOT_READY` and `COMMUNITY_BUILDING` — to `"negative"`. Since
`requestPromotion()` has no mutator and no code path in this repository
can set `AVAILABLE`/`VALIDATING`/`DEPRECATED`, the missing map entries
for those three values remain **confirmed dormant**, not active. Per
the phase's own rule, **MD-028 was left untouched.** Test 14 proves
this executably.

## 4. STEP 6 — RULE 82 AXIS ALIGNMENT

Determined **not** to attempt a generic/parameterized rewrite of
`evaluateRule82Gate()`. Nothing in this phase's real, live evidence
forces that change — the mismatch is disclosed (§2 above, and in every
relevant result field), not resolved, per the phase's own instruction
not to build a "Rule82GateV2" or similar. `cozy-knowledge-review.js`
was not modified.

## 5. WHAT WAS BUILT

One new additive file plus its test file — no existing file modified:

- `core/modules/builder/capability-governance-diagnosis.js` (new)
- `core/modules/builder/tests/capability-governance-diagnosis.test.js` (new)

### 5.1 `GOVERNANCE_STATUS`

An additive narrative layer reusing Phase 5's dependency-domain
classification and Phase 7's own `REQUEST_STATUS` values verbatim
wherever they already say what's needed. New labels added only where
neither source has one: `SOFTWARE_DEPENDENCY`,
`NOT_APPLICABLE_NO_BLOCKER`, `KNOWLEDGE_MISSING`, `SAFETY_BLOCKED` /
`CONTRIBUTION_REJECTED` (a real disambiguation of Phase 7's `REJECTED`
by the actual originating teach-pipeline status — never a new
judgment), `REVIEW_PENDING`, `RULE_82_BLOCKED`,
`AVAILABLE_BUT_CAPABILITY_STILL_INCOMPLETE`.

### 5.2 `reevaluateCapability(question, options)`

Read-only. Calls the real, live, uncached `buildPlan()` (Phase 5, which
itself calls Phase 4 → 3 → 2 → the real registries), classifies the
top blocker's domain via Phase 7's own `classifyDependencyDomain()`,
and — only when that domain is `KNOWLEDGE` — looks up (never creates)
a matching Phase 7 acquisition request to report its real governance
state. Every call re-derives everything from scratch; nothing is
cached or mutated.

### 5.3 `compareDiagnoses(previous, current)`

Pure function, no stored history, no side effects. Diffs two
`reevaluateCapability()` results and reports `NO_CHANGE`,
`BLOCKER_CHANGED`, `STATUS_CHANGED`, `EVIDENCE_CHANGED`,
`GOVERNANCE_STATE_CHANGED`, `DEPENDENCY_RESOLVED`,
`NEW_DEPENDENCY_DISCOVERED`, or `NO_PRIOR_DIAGNOSIS`.

### 5.4 `explain(reevaluation)`

Formats real fields already present on a result into a sentence, using
generic, capability-agnostic templates (same pattern as Phase 4's own
`renderHumanReadable()`) — never a hard-coded per-capability string.
Test 37 proves the sentence changes when real state changes.

### 5.5 `cognitiveTrace`

Every `reevaluateCapability()` result carries an inspectable array of
real stages (`PONDER`/`TRIANGULATE`/`UNTANGLE`/`SIFT`/`CRYSTALLIZE`/
`RECKON`), each with its own real input/output — one pipeline with
named steps, not 17 separate engines.

## 6. STEP 16 — THE HARD CASE

Verified (tests 17/18, 20): with a synthetic plan where the top blocker
is `language:sw:grammar` instead of `language:sw:vocabulary`, the
module reports grammar as the blocker and `compareDiagnoses()` reports
both `DEPENDENCY_RESOLVED` and `NEW_DEPENDENCY_DISCOVERED` in the same
diff — proving re-evaluation, not repetition of the prior diagnosis.
Nothing about "grammar" is hard-coded anywhere in
`capability-governance-diagnosis.js`; the value flows entirely from
`buildPlan()`'s own ranked output.

## 7. STEP 17 — NO FABRICATION TEST

Proven (tests 10-13, 28): this file contains no call to
`submitAcquisitionContribution()` or `evaluateRule82Gate()`, no literal
assignment of `"AVAILABLE"`/`"VERIFIED"`, and — across an entire test
run that includes a real accepted contribution — the live pack's
`resourceState` never advances past `COMMUNITY_BUILDING` (which is
`cozy-language-pack-registry.js`'s own pre-existing behavior, not
anything this file causes).

## 8. TEST RESULTS

**New Phase 8 suite:** 37/37 passed.

**Full regression, executed this pass:**

| Suite | Result |
|---|---|
| capability-governance-diagnosis.test.js (Phase 8, new) | 37/37 |
| capability-knowledge-acquisition.test.js (Phase 7) | 30/30 |
| cozy-language-pack-registry.test.js (RP-030) | 32/32 |
| cozy-knowledge-review.test.js (RP-029-C) | 30/30 |
| cozy-knowledge-safety-gate.test.js (RP-029-C) | 22/22 |
| cozy-teach-cozyai-routing-core.test.js (RP-031 Ph.2A) | 21/21 |
| unified-capability-contract.test.js (Phase 2) | 15/15 |
| capability-self-diagnosis.test.js (Phase 4) | 20/20 |
| capability-dependency-graph.test.js (Phase 3) | 19/19 |
| capability-repair-planner.test.js (Phase 5) | 20/20 |
| cozy-language-acquisition-pipeline.test.js (RP-031 Ph.1) | 30/30 |
| cozy-rp035-optional-country-correction.test.js | 24/24 |
| cozy-rp035-phase2-teaching-pipeline.test.js | 4/4 |
| cozy-knowledge-contribution-core.test.js | 21/21 |

**Total: 325/325 passed, 0 failed.**

## 9. PROTECTED FILES

Twelve files verified byte-identical against their respective
baselines (the six core governance files + repair-queue.md + Rule 82's
rule file against the original uploaded baseline; Phase 7's own two new
files against the Phase 7 checkpoint):

```
IDENTICAL: core/modules/intelligence/language-packs/cozy-language-pack-registry.js
IDENTICAL: core/modules/intelligence/knowledge/ui/cozy-knowledge-safety-gate.js
IDENTICAL: core/modules/intelligence/knowledge/cozy-knowledge-review.js
IDENTICAL: core/modules/intelligence/knowledge/teach/cozy-teach-cozyai-routing-core.js
IDENTICAL: docs/builder/knowledge/repair-queue.md
IDENTICAL: docs/builder/rules/27-language-availability-verification-rule.md
IDENTICAL: core/modules/builder/unified-capability-contract.js
IDENTICAL: core/modules/builder/capability-dependency-graph.js
IDENTICAL: core/modules/builder/capability-self-diagnosis.js
IDENTICAL: core/modules/builder/capability-repair-planner.js
IDENTICAL: core/modules/builder/capability-knowledge-acquisition.js
IDENTICAL: core/modules/builder/tests/capability-knowledge-acquisition.test.js
```

Files added (only these two): `capability-governance-diagnosis.js`,
`capability-governance-diagnosis.test.js`.
Files changed: none. Files deleted: none.

## 10. RP-030 / MD-028 / RULE 82 STATUS

- **RP-030-CONTENT:** unchanged, still open (🟡 Composed, High
  priority). `repair-queue.md` was never touched.
- **MD-028:** unchanged, confirmed still dormant (§3 above).
- **Rule 82:** unchanged. Its gate is confirmed structurally
  unreachable at `ELIGIBLE` in this environment (§2), disclosed, not
  fixed. The RP-027/RP-030 axis mismatch Phase 7 found is likewise
  unchanged and re-disclosed.

## 11. LIMITATIONS

- `PROMOTED` and `AVAILABLE_BUT_CAPABILITY_STILL_INCOMPLETE` remain
  structurally unreachable via any real code path in this repository
  today (no mutator exists anywhere in the composed chain, and Rule
  82's gate cannot itself reach `ELIGIBLE`). Both are retained in the
  taxonomy only so it is complete and honest about what full success
  would look like, not because either is currently produced by live
  code.
- `reevaluateCapability()`'s acquisition-request lookup picks the most
  recently updated request for a dependency when more than one exists;
  it does not attempt to reconcile or merge multiple concurrent
  requests for the same dependency (out of scope for this phase).

## 12. NEXT BUILD MUST START WITH

Making `runtimeBehaviorObserved` reachable at all (currently
hard-coded `NOT_TESTED_LIVE`/`false` under Rule 81) is the actual
remaining architectural gate to real promotion — not a Phase 8/9
software task on its own, but a genuine, disclosed limitation of the
current non-browser environment that any future phase attempting a
real Kiswahili vocabulary promotion will have to address through
Rule 81's own governed process, not by editing this hard-coded value
directly.

STOP AFTER PHASE 8.
