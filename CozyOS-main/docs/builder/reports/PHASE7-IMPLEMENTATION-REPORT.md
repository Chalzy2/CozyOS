# PHASE 7 — IMPLEMENTATION REPORT
## Governed Knowledge Acquisition Request + Contribution Wrapper

## 1. BASELINE

Phase 7 Step 1 (Governance Audit) was completed against the real
extracted repository before any code was written. All Phase 6 claims
and the audit's own findings (registerDefaultPacks/sw/NOT_READY,
RP-029-A/B/C chain wired and connected, requestPromotion() always
BLOCKED, RP-030-CONTENT open, MD-028 real-but-dormant,
church_sw.json/church_language_pack.py ungoverned and unrelated,
179/179 baseline tests passing, zero files modified during the audit)
were independently re-confirmed at the start of this pass by reading
the real source, not by re-stating the prior summary.

One additional discovery made during this pass (not previously
surfaced): a `cozy-language-acquisition-pipeline.js` file already
exists (RP-031 Phase 1). It was fully inspected. It handles multi-
source *evidence submission mechanics* (validation tiers, Hearing
Mode, OCR/audio/video capability checks, hotspot transport) — it has
no concept of a diagnosis-driven acquisition *request* tied to
capability/dimension/repair-queue evidence. It was **not** duplicated,
extended, or modified by this phase.

## 2. WHAT WAS BUILT

One new additive file, exactly as the phase boundary required:

- `core/modules/builder/capability-knowledge-acquisition.js` (new)
- `core/modules/builder/tests/capability-knowledge-acquisition.test.js` (new)

No existing file was modified. See §6 for hash/diff proof.

### 2.1 `classifyDependencyDomain()`

Distinguishes a KNOWLEDGE dependency from a SOFTWARE dependency using
the repository's own real naming convention already present in
`capability-repair-planner.js`'s `REPAIR_QUEUE_REFERENCE_TABLE`: a
Repair Queue id ending in `-CONTENT` (today's only real example:
`RP-030-CONTENT`) is content/knowledge work. No Repair Queue reference
at all classifies as `UNKNOWN` — never guessed.

### 2.2 `createAcquisitionRequest(question, options)`

Calls the real, unmodified `CapabilityRepairPlanner.buildPlan()`
(Phase 5), which itself calls the real `CapabilitySelfDiagnosis`
(Phase 4). Refuses to create a request when:
- the capability is ambiguous/unidentified (`AMBIGUOUS`)
- evidence is insufficient (`INSUFFICIENT_EVIDENCE`)
- no blocker exists at all (`NOT_BUILDABLE` — dependency already
  satisfied; never creates a misleading request)
- the top blocker classifies as `SOFTWARE`, not `KNOWLEDGE`

When it does create a request, every field (`dependency`, `language`,
`dimension`, `reason`, `relatedRepair`, `requestedEvidence`) is derived
from the real diagnosis/plan output — none of it is hard-coded.

### 2.3 `submitAcquisitionContribution(requestId, fields, options)`

A thin wrapper. It never fabricates `contributorId`, `consent`,
`source`, or attestation — all must come from the caller. It routes the
contribution through the real, unmodified
`CozyTeachCozyAIRouting.submitTeachingContribution()`. Based on that
real result it updates only its **own**, separate `REQUEST_STATUS`
taxonomy (never the pack registry's `PACK_STATES`, never RP-029-B's
`reviewState`). If the review pipeline reports `SUBMITTED`, it also
reads (never writes) `CozyKnowledgeReview.evaluateRule82Gate()`.

### 2.4 Rule 82 gate caveat — disclosed, not silently assumed

`evaluateRule82Gate()` evaluates the **response-template** completeness
axis (`cozy-language-registry.js`, RP-027) — not the **vocabulary-
content** axis (`cozy-language-pack-registry.js`, RP-030) this request
is actually about. `cozy-language-pack-registry.js`'s own
`requestPromotion()` already composes this same gate for the same
reason: it is the only Rule 82 gate that exists in the repository.
This file inherits that mismatch rather than introducing it, and labels
every promotion-facing result with an explicit `rule82GateCaveat`
string rather than implying the two axes are equivalent. Building a
genuine vocabulary-content Rule 82 check would be a second gate —
explicitly forbidden by the Phase 7 boundary — and was not attempted.

## 3. CRITICAL ACCEPTANCE TEST (spec §27)

Verified structurally impossible, per test 14 (static source scan for
any `AVAILABLE`/`VERIFIED`/`PROMOTED`/`setResourceState` assignment —
none exist) and test 15 (live behavioral proof: after a real accepted
contribution, `cozy-language-pack-registry.js`'s own pre-existing
`submitExpression()` legitimately advances `sw` from `NOT_READY` to
`COMMUNITY_BUILDING` — its own real, unmodified behavior — and goes no
further; `AVAILABLE` is never reached).

## 4. RP-030-CONTENT / MD-028

- **RP-030-CONTENT** remains open (🟡 Composed, High priority) —
  `docs/builder/knowledge/repair-queue.md` was not touched (see §6).
  A request/contribution existing does not close it; only real,
  governed content promotion would.
- **MD-028** was not touched. It does not affect this phase's
  acquisition/request behavior (this file never reads
  `DIMENSION_SIGNAL_MAP` or `unified-capability-contract.js`'s
  `classifySignal()` at all), so it was left exactly as Phase 6 found
  it, per the phase's own rule.

## 5. TEST RESULTS

**New Phase 7 suite:** 30/30 passed
(`core/modules/builder/tests/capability-knowledge-acquisition.test.js`)

**Full regression, executed this pass (not merely asserted):**

| Suite | Result |
|---|---|
| capability-knowledge-acquisition.test.js (Phase 7, new) | 30/30 |
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

**Total: 288/288 passed, 0 failed.**

## 6. PROTECTED FILES

The four core governance engines, the repair queue, and Rule 82's own
rule file were diffed byte-for-byte against the original uploaded
baseline (`COS-REPO-PHASE6-FULL.zip`) after implementation:

```
IDENTICAL: core/modules/intelligence/language-packs/cozy-language-pack-registry.js
IDENTICAL: core/modules/intelligence/knowledge/ui/cozy-knowledge-safety-gate.js
IDENTICAL: core/modules/intelligence/knowledge/cozy-knowledge-review.js
IDENTICAL: core/modules/intelligence/knowledge/teach/cozy-teach-cozyai-routing-core.js
IDENTICAL: docs/builder/knowledge/repair-queue.md
IDENTICAL: docs/builder/rules/27-language-availability-verification-rule.md
```

Files added (only these two):
- `core/modules/builder/capability-knowledge-acquisition.js`
- `core/modules/builder/tests/capability-knowledge-acquisition.test.js`

Files changed: none.
Files deleted: none.

## 7. LIMITATIONS

- Rule 82's `realLanguageResourcesExist` and template-completeness
  conditions can only be evaluated as `UNKNOWN`/`ATTESTED` from code —
  genuine human/community evidence is required and was never fabricated
  here.
- The Rule 82 gate caveat (§2.4) is a real, inherited architecture gap
  between the templates axis and the vocabulary-content axis. This
  phase discloses it; it does not resolve it (that would require a
  second gate, forbidden by the phase boundary).
- `PROMOTED` is included in this file's `REQUEST_STATUS` taxonomy for
  completeness but is structurally unreachable in this repository
  today — no mutator anywhere in the composed chain can set it, and
  this file does not attempt to create one.

## 8. NEXT BUILD MUST START WITH

A real human/community-governed contribution attempt using
`submitAcquisitionContribution()` against a request created by
`createAcquisitionRequest("Why am I not fully fluent in Kiswahili?")`,
supplying genuine `resourceAttestation` (a named fluent speaker or
reviewed reference) and real `testEvidence` — not synthetic fixtures —
so that `evaluateRule82Gate()`'s `templatesWrittenAndCommitted` and
`testsExistAndPass` conditions can be judged against real evidence for
the first time. Until that happens, RP-030-CONTENT stays exactly where
it is: 🟡 Composed, High priority, open.

STOP AFTER PHASE 7.
