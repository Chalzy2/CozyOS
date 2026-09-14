# Merge Report — Phase 8 baseline + Phase 10A + Phase 10B

## Inputs
- `COS-REPO-MERGED-PHASE8__1_.zip` — base tree (1564 files)
- `COS-REPO-PHASE10A-CHECKPOINT.zip` — delta checkpoint
- `COS-REPO-PHASE10B-CHECKPOINT.zip` — delta checkpoint

## Merge procedure
1. Extracted the Phase 8 base tree as-is (unmodified starting point).
2. Applied the Phase 10A delta on top:
   - Overwrote `core/modules/builder/capability-governance-diagnosis.js`
     (additive-only change per its own header: adds `OPERATION_SEMANTICS`,
     the WEIGH stage, and optional `meta` fields on `pushTrace()`; version
     bumped `0.1.0-PHASE8` → `0.2.0-PHASE10A`).
   - Overwrote `core/modules/builder/tests/capability-governance-diagnosis.test.js`
     (single-line version-string assertion update to match the bump above).
   - Added new file `core/modules/builder/tests/capability-governance-diagnosis-phase10a.test.js`
     (24 new tests).
3. Applied the Phase 10B delta on top of that:
   - Added new file `core/modules/cognitive/tests/phase10b-shared-cognitive-integration.test.js`
     (16 new tests). Phase 10B made no production-file changes — confirmed
     by its own diff-against-baseline step and re-verified here.
4. Copied both phases' implementation/dependency/test reports and hash
   manifests into the repo root for traceability
   (`PHASE10A-*`, `PHASE10B-*`).

## Verification performed after merge
Ran every affected suite directly against the merged tree with `node <file>`:

| Suite | Result |
|---|---|
| unified-capability-contract.test.js (Phase 2) | 15/15 |
| capability-dependency-graph.test.js (Phase 3) | 19/19 |
| capability-self-diagnosis.test.js (Phase 4) | 20/20 |
| capability-repair-planner.test.js (Phase 5) | 20/20 |
| capability-knowledge-acquisition.test.js (Phase 7) | 30/30 |
| capability-governance-diagnosis.test.js (Phase 8) | 37/37 |
| capability-governance-diagnosis-phase10a.test.js (Phase 10A) | 24/24 |
| phase10b-shared-cognitive-integration.test.js (Phase 10B) | 16/16 |

**Total: 181/181 passing in the merged tree.**

## Net result
- One file modified from the Phase 8 baseline: `capability-governance-diagnosis.js` (Phase 10A, additive).
- One test file modified: `capability-governance-diagnosis.test.js` (1-line version assertion).
- Two new test files added: the Phase 10A and Phase 10B suites.
- No other production file in the 1564-file Phase 8 tree was touched.
